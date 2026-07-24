"""Apply the approved midpoint seam trajectory without welding topology."""

import json
import os
import sys

import bpy


EXPECTED_MESH_NAME = "IdentityShell"
MATCH_EPSILON = 1e-7


def get_arguments():
    if "--" not in sys.argv:
        raise RuntimeError(
            "Expected preflight, candidate, and report paths after --."
        )
    arguments = sys.argv[sys.argv.index("--") + 1 :]
    if len(arguments) != 3:
        raise RuntimeError(
            "Expected preflight JSON, candidate blend, and report path."
        )
    return [os.path.abspath(argument) for argument in arguments]


def load_json(file_path):
    with open(file_path, encoding="utf8") as input_file:
        return json.load(input_file)


def get_delta(key, basis, vertex_index):
    return key.data[vertex_index].co - basis.data[vertex_index].co


def apply_midpoint(key, basis, main_index, cap_index):
    # Both duplicate vertices share the same averaged morph trajectory.
    midpoint_delta = (
        get_delta(key, basis, main_index)
        + get_delta(key, basis, cap_index)
    ) * 0.5
    key.data[main_index].co = (
        basis.data[main_index].co + midpoint_delta
    )
    key.data[cap_index].co = basis.data[cap_index].co + midpoint_delta


def apply():
    preflight_path, candidate_path, report_path = get_arguments()
    preflight = load_json(preflight_path)
    shell = bpy.data.objects.get(EXPECTED_MESH_NAME)
    if shell is None or shell.type != "MESH":
        raise RuntimeError(f"Missing {EXPECTED_MESH_NAME} mesh.")
    if shell.data.shape_keys is None:
        raise RuntimeError("Identity shell has no shape keys.")

    source_blend = bpy.data.filepath
    shape_keys = shell.data.shape_keys.key_blocks
    basis = shape_keys["Basis"]
    basis_positions = [point.co.copy() for point in basis.data]
    original_faces = [
        tuple(polygon.vertices) for polygon in shell.data.polygons
    ]
    original_materials = [
        polygon.material_index for polygon in shell.data.polygons
    ]
    mismatched_key_names = {
        item["name"]
        for seam in preflight["seams"]
        for item in seam["shapeKeyDeltaComparison"]["keys"]
        if not item["safeToRetainMainDelta"]
    }
    affected_keys = [
        key
        for key in shape_keys[1:]
        if key.name in mismatched_key_names
    ]

    changed_points = set()
    maximum_authored_change = 0.0
    for key in affected_keys:
        for seam in preflight["seams"]:
            for pair in seam["mapping"]:
                main_index = pair["mainVertex"]
                cap_index = pair["capVertex"]
                before_main = key.data[main_index].co.copy()
                before_cap = key.data[cap_index].co.copy()
                apply_midpoint(
                    key,
                    basis,
                    main_index,
                    cap_index,
                )
                main_change = (
                    key.data[main_index].co - before_main
                ).length
                cap_change = (
                    key.data[cap_index].co - before_cap
                ).length
                if main_change > MATCH_EPSILON:
                    changed_points.add((key.name, main_index))
                if cap_change > MATCH_EPSILON:
                    changed_points.add((key.name, cap_index))
                maximum_authored_change = max(
                    maximum_authored_change,
                    main_change,
                    cap_change,
                )

    maximum_residual = max(
        (
            get_delta(key, basis, pair["mainVertex"])
            - get_delta(key, basis, pair["capVertex"])
        ).length
        for key in shape_keys[1:]
        for seam in preflight["seams"]
        for pair in seam["mapping"]
    )
    maximum_basis_change = max(
        (
            basis.data[index].co - basis_positions[index]
        ).length
        for index in range(len(basis.data))
    )
    current_faces = [
        tuple(polygon.vertices) for polygon in shell.data.polygons
    ]
    current_materials = [
        polygon.material_index for polygon in shell.data.polygons
    ]
    if maximum_residual > MATCH_EPSILON:
        raise RuntimeError(
            f"Midpoint retained a trajectory mismatch of {maximum_residual}."
        )
    if maximum_basis_change > MATCH_EPSILON:
        raise RuntimeError("Midpoint harmonization moved Basis vertices.")
    if current_faces != original_faces:
        raise RuntimeError("Midpoint harmonization changed topology/winding.")
    if current_materials != original_materials:
        raise RuntimeError("Midpoint harmonization changed materials.")

    os.makedirs(os.path.dirname(candidate_path), exist_ok=True)
    bpy.ops.wm.save_as_mainfile(
        filepath=candidate_path,
        check_existing=False,
    )
    report = {
        "schemaVersion": "v1",
        "operation": "apply-approved-midpoint-harmonization",
        "sourceBlend": source_blend,
        "candidateBlend": candidate_path,
        "approvedPolicy": "midpoint",
        "affectedShapeKeys": [key.name for key in affected_keys],
        "changedShapeKeyPointCount": len(changed_points),
        "maximumAuthoredPositionChange": maximum_authored_change,
        "maximumResidualTrajectoryDifference": maximum_residual,
        "maximumBasisPositionChange": maximum_basis_change,
        "vertexCount": len(shell.data.vertices),
        "polygonCount": len(shell.data.polygons),
        "shapeKeyCount": len(shape_keys) - 1,
        "preservation": {
            "basisUnchanged": True,
            "vertexCountUnchanged": True,
            "faceConnectivityAndWindingUnchanged": True,
            "materialAssignmentsUnchanged": True,
        },
        "constraints": {
            "weldingApplied": False,
            "topologyChanged": False,
            "productionChanged": False,
            "canonicalSourceChanged": False,
        },
        "decision": {
            "trajectoryPolicyApproved": True,
            "weldingApproved": False,
            "promotionApproved": False,
        },
    }
    os.makedirs(os.path.dirname(report_path), exist_ok=True)
    with open(report_path, "w", encoding="utf8") as output_file:
        json.dump(report, output_file, indent=2)
        output_file.write("\n")
    print(json.dumps(report, indent=2))


apply()

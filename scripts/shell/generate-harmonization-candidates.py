"""Generate three coarse seam-trajectory candidates without welding topology."""

import json
import os
import sys

import bpy


EXPECTED_MESH_NAME = "IdentityShell"
MATCH_EPSILON = 1e-7
POLICIES = ("main-authoritative", "cap-authoritative", "midpoint")


def get_arguments():
    if "--" not in sys.argv:
        raise RuntimeError(
            "Expected preflight, output directory, and report paths after --."
        )
    arguments = sys.argv[sys.argv.index("--") + 1 :]
    if len(arguments) != 3:
        raise RuntimeError(
            "Expected preflight JSON, output directory, and report path."
        )
    return [os.path.abspath(argument) for argument in arguments]


def load_json(file_path):
    with open(file_path, encoding="utf8") as input_file:
        return json.load(input_file)


def restore_shape_keys(shape_keys, original):
    for key in shape_keys:
        for vertex_index, point in enumerate(key.data):
            point.co = original[key.name][vertex_index]


def get_delta(key, basis, vertex_index):
    return key.data[vertex_index].co - basis.data[vertex_index].co


def harmonize_pair(policy, key, basis, main_index, cap_index):
    # Each candidate applies one coarse policy to the full duplicate pair.
    main_delta = get_delta(key, basis, main_index)
    cap_delta = get_delta(key, basis, cap_index)
    if policy == "main-authoritative":
        key.data[cap_index].co = basis.data[cap_index].co + main_delta
    elif policy == "cap-authoritative":
        key.data[main_index].co = basis.data[main_index].co + cap_delta
    elif policy == "midpoint":
        midpoint_delta = (main_delta + cap_delta) * 0.5
        key.data[main_index].co = (
            basis.data[main_index].co + midpoint_delta
        )
        key.data[cap_index].co = basis.data[cap_index].co + midpoint_delta
    else:
        raise RuntimeError(f"Unsupported harmonization policy: {policy}.")


def generate():
    preflight_path, output_directory, report_path = get_arguments()
    preflight = load_json(preflight_path)
    shell = bpy.data.objects.get(EXPECTED_MESH_NAME)
    if shell is None or shell.type != "MESH":
        raise RuntimeError(f"Missing {EXPECTED_MESH_NAME} mesh.")
    if shell.data.shape_keys is None:
        raise RuntimeError("Identity shell has no shape keys.")

    source_blend = bpy.data.filepath
    shape_keys = shell.data.shape_keys.key_blocks
    basis = shape_keys["Basis"]
    original = {
        key.name: [point.co.copy() for point in key.data]
        for key in shape_keys
    }
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
    # Preserve authored shape-key order while covering either seam's mismatch.
    mismatched_keys = [
        key.name
        for key in shape_keys[1:]
        if key.name in mismatched_key_names
    ]
    os.makedirs(output_directory, exist_ok=True)
    candidates = []

    for policy in POLICIES:
        restore_shape_keys(shape_keys, original)
        changed_points = set()
        maximum_authored_change = 0.0
        for key_name in mismatched_keys:
            key = shape_keys.get(key_name)
            if key is None:
                raise RuntimeError(f"Missing shape key {key_name}.")
            for seam in preflight["seams"]:
                for pair in seam["mapping"]:
                    main_index = pair["mainVertex"]
                    cap_index = pair["capVertex"]
                    before_main = key.data[main_index].co.copy()
                    before_cap = key.data[cap_index].co.copy()
                    harmonize_pair(
                        policy,
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
                        changed_points.add((key_name, main_index))
                    if cap_change > MATCH_EPSILON:
                        changed_points.add((key_name, cap_index))
                    maximum_authored_change = max(
                        maximum_authored_change,
                        main_change,
                        cap_change,
                    )

        maximum_residual = 0.0
        for key in shape_keys[1:]:
            for seam in preflight["seams"]:
                for pair in seam["mapping"]:
                    difference = (
                        get_delta(key, basis, pair["mainVertex"])
                        - get_delta(key, basis, pair["capVertex"])
                    ).length
                    maximum_residual = max(maximum_residual, difference)
        if maximum_residual > MATCH_EPSILON:
            raise RuntimeError(
                f"{policy} retained a delta mismatch of {maximum_residual}."
            )
        if original_faces != [
            tuple(polygon.vertices) for polygon in shell.data.polygons
        ]:
            raise RuntimeError(f"{policy} changed face winding/connectivity.")
        if original_materials != [
            polygon.material_index for polygon in shell.data.polygons
        ]:
            raise RuntimeError(f"{policy} changed material assignments.")
        maximum_basis_change = max(
            (
                basis.data[index].co - original["Basis"][index]
            ).length
            for index in range(len(basis.data))
        )
        if maximum_basis_change > MATCH_EPSILON:
            raise RuntimeError(f"{policy} moved Basis vertices.")

        candidate_path = os.path.join(
            output_directory,
            f"identity-shell-v1-{policy}.blend",
        )
        bpy.ops.wm.save_as_mainfile(
            filepath=candidate_path,
            check_existing=False,
        )
        candidates.append(
            {
                "policy": policy,
                "blend": candidate_path,
                "changedShapeKeyPointCount": len(changed_points),
                "maximumAuthoredPositionChange": maximum_authored_change,
                "maximumResidualTrajectoryDifference": maximum_residual,
                "maximumBasisPositionChange": maximum_basis_change,
                "vertexCount": len(shell.data.vertices),
                "polygonCount": len(shell.data.polygons),
                "shapeKeyCount": len(shape_keys) - 1,
            }
        )

    restore_shape_keys(shape_keys, original)
    report = {
        "schemaVersion": "v1",
        "operation": "generate-harmonization-only-candidates",
        "sourceBlend": source_blend,
        "policies": list(POLICIES),
        "affectedShapeKeys": mismatched_keys,
        "constraints": {
            "basisMovementAllowed": False,
            "weldingAllowed": False,
            "connectivityChangesAllowed": False,
            "faceWindingChangesAllowed": False,
            "vertexRemovalAllowed": False,
        },
        "candidates": candidates,
        "decision": {
            "policySelected": False,
            "weldingApproved": False,
            "productionChanged": False,
        },
    }
    os.makedirs(os.path.dirname(report_path), exist_ok=True)
    with open(report_path, "w", encoding="utf8") as output_file:
        json.dump(report, output_file, indent=2)
        output_file.write("\n")
    print(json.dumps(report, indent=2))


generate()

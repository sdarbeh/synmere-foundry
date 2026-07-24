"""Reverse only the audited cap faces on a freshly welded candidate."""

import json
import os
import sys
from collections import defaultdict

import bpy


EXPECTED_MESH_NAME = "IdentityShell"
EXPECTED_VERTICES = 6052
EXPECTED_POLYGONS = 12100
EXPECTED_SHAPE_KEYS = 37
EXPECTED_CONFLICTS_BEFORE = 42
POSITION_EPSILON = 1e-7


def get_arguments():
    if "--" not in sys.argv:
        raise RuntimeError(
            "Expected ownership audit, candidate, and report paths."
        )
    arguments = sys.argv[sys.argv.index("--") + 1 :]
    if len(arguments) != 3:
        raise RuntimeError(
            "Expected ownership audit JSON, corrected candidate blend, "
            "and correction report."
        )
    return [os.path.abspath(argument) for argument in arguments]


def load_json(file_path):
    with open(file_path, encoding="utf8") as input_file:
        return json.load(input_file)


def get_topology(faces):
    edge_uses = defaultdict(list)
    for face_index, face in enumerate(faces):
        for offset, start in enumerate(face):
            end = face[(offset + 1) % len(face)]
            edge = tuple(sorted((start, end)))
            direction = 1 if (start, end) == edge else -1
            edge_uses[edge].append((face_index, direction))
    conflicts = {
        edge: uses
        for edge, uses in edge_uses.items()
        if len(uses) == 2 and uses[0][1] == uses[1][1]
    }
    return {
        "boundaryEdges": sum(
            1 for uses in edge_uses.values() if len(uses) == 1
        ),
        "nonManifoldEdges": sum(
            1 for uses in edge_uses.values() if len(uses) > 2
        ),
        "windingConflicts": len(conflicts),
        "conflicts": conflicts,
    }


def has_reversed_winding(before, after):
    if len(before) != len(after) or set(before) != set(after):
        return False
    before_edges = {
        (before[offset], before[(offset + 1) % len(before)])
        for offset in range(len(before))
    }
    after_edges = {
        (after[offset], after[(offset + 1) % len(after)])
        for offset in range(len(after))
    }
    return after_edges == {(end, start) for start, end in before_edges}


def correct():
    audit_path, candidate_path, report_path = get_arguments()
    audit = load_json(audit_path)
    if not audit["decision"]["ownershipConfirmed"]:
        raise RuntimeError("Orientation ownership was not approved.")
    if audit["ownership"]["unrelatedConflictCount"] != 0:
        raise RuntimeError("Audit contains unrelated winding conflicts.")

    shell = bpy.data.objects.get(EXPECTED_MESH_NAME)
    if shell is None or shell.type != "MESH":
        raise RuntimeError(f"Missing {EXPECTED_MESH_NAME} mesh.")
    mesh = shell.data
    if len(mesh.vertices) != EXPECTED_VERTICES:
        raise RuntimeError("Fresh weld has an unexpected vertex count.")
    if len(mesh.polygons) != EXPECTED_POLYGONS:
        raise RuntimeError("Fresh weld has an unexpected face count.")
    if (
        mesh.shape_keys is None
        or len(mesh.shape_keys.key_blocks) - 1 != EXPECTED_SHAPE_KEYS
    ):
        raise RuntimeError("Fresh weld changed the shape-key contract.")

    source_blend = bpy.data.filepath
    if source_blend == candidate_path:
        raise RuntimeError("Corrected candidate must not overwrite its input.")
    flip_faces = set(audit["ownership"]["affectedFaceIndices"])
    if len(flip_faces) != audit["ownership"]["affectedFaceCount"]:
        raise RuntimeError("Audited face set contains duplicates.")
    if min(flip_faces) < 0 or max(flip_faces) >= len(mesh.polygons):
        raise RuntimeError("Audited face index is outside the candidate.")

    shape_positions = {
        key.name: [point.co.copy() for point in key.data]
        for key in mesh.shape_keys.key_blocks
    }
    faces_before = [
        tuple(polygon.vertices) for polygon in mesh.polygons
    ]
    material_indices = [
        polygon.material_index for polygon in mesh.polygons
    ]
    smooth_flags = [
        polygon.use_smooth for polygon in mesh.polygons
    ]
    topology_before = get_topology(faces_before)
    if topology_before["boundaryEdges"] != 0:
        raise RuntimeError("Fresh weld unexpectedly has boundary edges.")
    if topology_before["nonManifoldEdges"] != 0:
        raise RuntimeError("Fresh weld unexpectedly has non-manifold edges.")
    if (
        topology_before["windingConflicts"]
        != EXPECTED_CONFLICTS_BEFORE
    ):
        raise RuntimeError(
            "Fresh weld no longer has the expected 42 conflicts."
        )
    if any(
        not (
            (uses[0][0] in flip_faces)
            != (uses[1][0] in flip_faces)
        )
        for uses in topology_before["conflicts"].values()
    ):
        raise RuntimeError(
            "A conflict does not have exactly one audited cap-side face."
        )

    for face_index in sorted(flip_faces):
        mesh.polygons[face_index].flip()
    mesh.update(calc_edges=True)

    faces_after = [
        tuple(polygon.vertices) for polygon in mesh.polygons
    ]
    changed_faces = {
        index
        for index, (before, after) in enumerate(
            zip(faces_before, faces_after, strict=True)
        )
        if before != after
    }
    if changed_faces != flip_faces:
        raise RuntimeError("Correction changed an unaudited face.")
    if any(
        not has_reversed_winding(
            faces_before[face_index],
            faces_after[face_index],
        )
        for face_index in flip_faces
    ):
        raise RuntimeError("An audited face was not cleanly reversed.")
    if any(
        faces_before[face_index] != faces_after[face_index]
        for face_index in range(len(faces_before))
        if face_index not in flip_faces
    ):
        raise RuntimeError("An unrelated face changed.")

    maximum_position_change = max(
        (
            key.data[index].co
            - shape_positions[key.name][index]
        ).length
        for key in mesh.shape_keys.key_blocks
        for index in range(len(key.data))
    )
    if maximum_position_change > POSITION_EPSILON:
        raise RuntimeError(
            f"Orientation correction moved a point by "
            f"{maximum_position_change}."
        )
    if [
        polygon.material_index for polygon in mesh.polygons
    ] != material_indices:
        raise RuntimeError("Orientation correction changed materials.")
    if [
        polygon.use_smooth for polygon in mesh.polygons
    ] != smooth_flags:
        raise RuntimeError("Orientation correction changed smooth flags.")

    topology_after = get_topology(faces_after)
    if (
        topology_after["boundaryEdges"] != 0
        or topology_after["nonManifoldEdges"] != 0
        or topology_after["windingConflicts"] != 0
    ):
        raise RuntimeError(
            "Corrected candidate does not satisfy the topology contract."
        )

    os.makedirs(os.path.dirname(candidate_path), exist_ok=True)
    bpy.ops.wm.save_as_mainfile(
        filepath=candidate_path,
        check_existing=False,
    )
    report = {
        "schemaVersion": "v1",
        "operation": "correct-audited-seam-weld-orientation",
        "sourceBlend": source_blend,
        "candidateBlend": candidate_path,
        "affectedFaceSet": {
            "sourceComponent": (
                audit["ownership"]["affectedSourceComponent"]
            ),
            "facesReversed": len(flip_faces),
            "unrelatedFacesChanged": 0,
        },
        "topologyBefore": {
            key: value
            for key, value in topology_before.items()
            if key != "conflicts"
        },
        "topologyAfter": {
            key: value
            for key, value in topology_after.items()
            if key != "conflicts"
        },
        "preservation": {
            "maximumBasisOrShapeKeyPositionChange": (
                maximum_position_change
            ),
            "materialAssignmentsUnchanged": True,
            "smoothFlagsUnchanged": True,
            "unrelatedFacesUnchanged": True,
            "vertexCountUnchanged": len(mesh.vertices)
            == EXPECTED_VERTICES,
            "faceCountUnchanged": len(mesh.polygons)
            == EXPECTED_POLYGONS,
            "shapeKeyCountUnchanged": (
                len(mesh.shape_keys.key_blocks) - 1
                == EXPECTED_SHAPE_KEYS
            ),
        },
        "constraints": {
            "productionChanged": False,
            "canonicalSourceChanged": False,
            "rendererChanged": False,
            "exporterChanged": False,
            "pipelineChanged": False,
            "promotionPerformed": False,
        },
    }
    os.makedirs(os.path.dirname(report_path), exist_ok=True)
    with open(report_path, "w", encoding="utf8") as output_file:
        json.dump(report, output_file, indent=2)
        output_file.write("\n")
    print(json.dumps(report, indent=2))


correct()

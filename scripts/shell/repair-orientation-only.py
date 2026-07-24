"""Correct face winding per connected component without touching mesh geometry."""

import json
import os
import sys
from collections import defaultdict, deque

import bpy
from mathutils import Vector


EXPECTED_MESH_NAME = "IdentityShell"
POSITION_EPSILON = 1e-7


def get_report_path():
    if "--" not in sys.argv:
        raise RuntimeError("Expected an output report path after --.")
    arguments = sys.argv[sys.argv.index("--") + 1 :]
    if len(arguments) != 1:
        raise RuntimeError("Expected exactly one output report path.")
    return os.path.abspath(arguments[0])


def canonical_cycle(vertices):
    values = list(vertices)
    rotations = [
        tuple(values[offset:] + values[:offset])
        for offset in range(len(values))
    ]
    return min(rotations)


def get_edge_uses(faces):
    uses = defaultdict(list)
    for face_index, face in enumerate(faces):
        for offset, start in enumerate(face):
            end = face[(offset + 1) % len(face)]
            key = tuple(sorted((start, end)))
            uses[key].append(
                {
                    "face": face_index,
                    "direction": 1 if (start, end) == key else -1,
                }
            )
    return uses


def get_components(faces, edge_uses):
    adjacency = defaultdict(set)
    for uses in edge_uses.values():
        if len(uses) != 2:
            continue
        left, right = uses
        adjacency[left["face"]].add(right["face"])
        adjacency[right["face"]].add(left["face"])

    components = []
    visited = set()
    for root in range(len(faces)):
        if root in visited:
            continue
        queue = deque([root])
        visited.add(root)
        component = []
        while queue:
            face_index = queue.popleft()
            component.append(face_index)
            for neighbor in adjacency[face_index]:
                if neighbor not in visited:
                    visited.add(neighbor)
                    queue.append(neighbor)
        components.append(sorted(component))
    return components


def get_winding_conflicts(edge_uses):
    conflicts = []
    for edge, uses in edge_uses.items():
        if len(uses) != 2:
            continue
        if uses[0]["direction"] == uses[1]["direction"]:
            conflicts.append(
                {
                    "edge": list(edge),
                    "faces": [uses[0]["face"], uses[1]["face"]],
                }
            )
    return conflicts


def get_outward_score(face_indices, faces, positions, shell_center):
    signed_area = 0.0
    absolute_area = 0.0
    for face_index in face_indices:
        face = faces[face_index]
        origin = positions[face[0]]
        for offset in range(1, len(face) - 1):
            left = positions[face[offset]]
            right = positions[face[offset + 1]]
            area_vector = (left - origin).cross(right - origin) * 0.5
            triangle_center = (origin + left + right) / 3.0
            signed_area += area_vector.dot(triangle_center - shell_center)
            absolute_area += area_vector.length
    normalized = signed_area / absolute_area if absolute_area else 0.0
    return {
        "signedRadialArea": signed_area,
        "absoluteArea": absolute_area,
        "normalizedOutwardScore": normalized,
        "outward": signed_area > 0,
    }


def select_faces(shell, face_indices):
    bpy.context.view_layer.objects.active = shell
    shell.select_set(True)
    for polygon in shell.data.polygons:
        polygon.select = polygon.index in face_indices


def flip_component(shell, face_indices):
    select_faces(shell, set(face_indices))
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.flip_normals()
    bpy.ops.object.mode_set(mode="OBJECT")


def repair_orientation():
    report_path = get_report_path()
    shell = bpy.data.objects.get(EXPECTED_MESH_NAME)
    if shell is None or shell.type != "MESH":
        raise RuntimeError(f"Missing {EXPECTED_MESH_NAME} mesh.")
    if shell.data.shape_keys is None:
        raise RuntimeError("Identity shell has no shape keys.")

    for key in shell.data.shape_keys.key_blocks:
        key.value = 0.0
    shell.active_shape_key_index = 0

    before_positions = [vertex.co.copy() for vertex in shell.data.vertices]
    before_shape_keys = {
        key.name: [point.co.copy() for point in key.data]
        for key in shell.data.shape_keys.key_blocks
    }
    before_shape_key_names = [
        key.name for key in shell.data.shape_keys.key_blocks
    ]
    before_faces = [
        tuple(polygon.vertices) for polygon in shell.data.polygons
    ]
    before_materials = [
        polygon.material_index for polygon in shell.data.polygons
    ]
    before_edges = get_edge_uses(before_faces)
    before_components = get_components(before_faces, before_edges)
    before_conflicts = get_winding_conflicts(before_edges)
    shell_center = sum(before_positions, Vector()) / len(before_positions)
    before_scores = [
        get_outward_score(
            component,
            before_faces,
            before_positions,
            shell_center,
        )
        for component in before_components
    ]

    # Blender resolves shared-edge parity independently for disconnected islands.
    select_faces(shell, set(range(len(before_faces))))
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.normals_make_consistent(inside=False)
    bpy.ops.object.mode_set(mode="OBJECT")

    intermediate_faces = [
        tuple(polygon.vertices) for polygon in shell.data.polygons
    ]
    intermediate_components = get_components(
        intermediate_faces,
        get_edge_uses(intermediate_faces),
    )
    for component in intermediate_components:
        score = get_outward_score(
            component,
            intermediate_faces,
            before_positions,
            shell_center,
        )
        if not score["outward"]:
            flip_component(shell, component)
            intermediate_faces = [
                tuple(polygon.vertices) for polygon in shell.data.polygons
            ]

    # Face winding is the only permitted mutation; explicitly restore coordinates.
    for key in shell.data.shape_keys.key_blocks:
        for vertex_index, point in enumerate(key.data):
            point.co = before_shape_keys[key.name][vertex_index]
    for vertex_index, vertex in enumerate(shell.data.vertices):
        vertex.co = before_positions[vertex_index]
    shell.data.update()

    after_faces = [
        tuple(polygon.vertices) for polygon in shell.data.polygons
    ]
    after_edges = get_edge_uses(after_faces)
    after_components = get_components(after_faces, after_edges)
    after_conflicts = get_winding_conflicts(after_edges)
    after_scores = [
        get_outward_score(
            component,
            after_faces,
            before_positions,
            shell_center,
        )
        for component in after_components
    ]

    flipped_faces = []
    connectivity_changes = []
    for face_index, (before, after) in enumerate(
        zip(before_faces, after_faces, strict=True)
    ):
        if canonical_cycle(before) == canonical_cycle(after):
            continue
        if canonical_cycle(before) == canonical_cycle(tuple(reversed(after))):
            flipped_faces.append(face_index)
        else:
            connectivity_changes.append(face_index)

    maximum_basis_displacement = max(
        (vertex.co - before_positions[vertex.index]).length
        for vertex in shell.data.vertices
    )
    maximum_shape_key_displacement = 0.0
    for key in shell.data.shape_keys.key_blocks:
        for vertex_index, point in enumerate(key.data):
            maximum_shape_key_displacement = max(
                maximum_shape_key_displacement,
                (
                    point.co
                    - before_shape_keys[key.name][vertex_index]
                ).length,
            )

    if after_conflicts:
        raise RuntimeError(
            f"Orientation repair left {len(after_conflicts)} conflicts."
        )
    if connectivity_changes:
        raise RuntimeError("Orientation repair changed face connectivity.")
    if maximum_basis_displacement > POSITION_EPSILON:
        raise RuntimeError("Orientation repair moved Basis vertices.")
    if maximum_shape_key_displacement > POSITION_EPSILON:
        raise RuntimeError("Orientation repair changed shape-key coordinates.")
    if before_shape_key_names != [
        key.name for key in shell.data.shape_keys.key_blocks
    ]:
        raise RuntimeError("Orientation repair changed shape-key order.")
    if before_materials != [
        polygon.material_index for polygon in shell.data.polygons
    ]:
        raise RuntimeError("Orientation repair changed material assignments.")
    if not all(score["outward"] for score in after_scores):
        raise RuntimeError("One or more components remain inward-facing.")

    os.makedirs(os.path.dirname(report_path), exist_ok=True)
    report = {
        "schemaVersion": "1.0.0",
        "operation": "orientation-only-repair",
        "candidateBlend": bpy.data.filepath,
        "constraints": {
            "vertexMovementAllowed": False,
            "shapeKeyChangesAllowed": False,
            "connectivityChangesAllowed": False,
            "weldingAllowed": False,
        },
        "before": {
            "componentCount": len(before_components),
            "windingConflictCount": len(before_conflicts),
            "componentOrientation": [
                {
                    "componentIndex": index,
                    "faceCount": len(component),
                    **before_scores[index],
                }
                for index, component in enumerate(before_components)
            ],
        },
        "after": {
            "componentCount": len(after_components),
            "windingConflictCount": len(after_conflicts),
            "flippedFaceCount": len(flipped_faces),
            "flippedFaces": flipped_faces,
            "componentOrientation": [
                {
                    "componentIndex": index,
                    "faceCount": len(component),
                    **after_scores[index],
                }
                for index, component in enumerate(after_components)
            ],
        },
        "preservation": {
            "vertexCount": len(shell.data.vertices),
            "polygonCount": len(shell.data.polygons),
            "shapeKeyCount": len(before_shape_key_names) - 1,
            "shapeKeyNames": before_shape_key_names[1:],
            "maximumBasisPositionDelta": maximum_basis_displacement,
            "maximumShapeKeyPositionDelta": maximum_shape_key_displacement,
            "connectivityChangeCount": len(connectivity_changes),
            "materialAssignmentChanged": False,
        },
    }
    with open(report_path, "w", encoding="utf8") as output_file:
        json.dump(report, output_file, indent=2)
        output_file.write("\n")

    bpy.ops.wm.save_as_mainfile(
        filepath=bpy.data.filepath,
        check_existing=False,
    )
    print(json.dumps(report, indent=2))


repair_orientation()

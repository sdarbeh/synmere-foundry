"""Test consistent outward face orientation on a disposable G1 Blender copy."""

import json

import bpy


EXPECTED_MESH_NAME = "IdentityShell"


def canonical_cycle(vertices):
    values = list(vertices)
    rotations = [
        tuple(values[offset:] + values[:offset])
        for offset in range(len(values))
    ]
    return min(rotations)


def test_consistent_orientation():
    shell = bpy.data.objects.get(EXPECTED_MESH_NAME)
    if shell is None or shell.type != "MESH":
        raise RuntimeError(f"Missing {EXPECTED_MESH_NAME} mesh.")
    for key in shell.data.shape_keys.key_blocks:
        key.value = 0.0
    shell.active_shape_key_index = 0
    before_positions = [vertex.co.copy() for vertex in shell.data.vertices]
    before_shape_keys = {
        key.name: [point.co.copy() for point in key.data]
        for key in shell.data.shape_keys.key_blocks
    }
    before_faces = [tuple(polygon.vertices) for polygon in shell.data.polygons]

    bpy.context.view_layer.objects.active = shell
    shell.select_set(True)
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.mesh.normals_make_consistent(inside=False)
    bpy.ops.object.mode_set(mode="OBJECT")
    for key in shell.data.shape_keys.key_blocks:
        for vertex_index, point in enumerate(key.data):
            point.co = before_shape_keys[key.name][vertex_index]
    for vertex_index, vertex in enumerate(shell.data.vertices):
        vertex.co = before_positions[vertex_index]
    shell.data.update()

    flipped_faces = 0
    connectivity_changes = 0
    for before, polygon in zip(before_faces, shell.data.polygons, strict=True):
        after = tuple(polygon.vertices)
        if canonical_cycle(before) == canonical_cycle(after):
            continue
        if canonical_cycle(before) == canonical_cycle(tuple(reversed(after))):
            flipped_faces += 1
        else:
            connectivity_changes += 1
    operator_vertex_displacement = max(
        (vertex.co - before_positions[vertex.index]).length
        for vertex in shell.data.vertices
    )
    print(
        json.dumps(
            {
                "orientationTestMaximumVertexDisplacement": (
                    operator_vertex_displacement
                ),
                "orientationTestFlippedFaces": flipped_faces,
                "orientationTestConnectivityChanges": connectivity_changes,
            },
            indent=2,
        )
    )
    if operator_vertex_displacement > 1e-7:
        raise RuntimeError("Face-orientation test moved vertex positions.")
    if connectivity_changes > 0:
        raise RuntimeError("Face-orientation test changed mesh connectivity.")

    bpy.ops.wm.save_as_mainfile(filepath=bpy.data.filepath, check_existing=False)
    print(
        json.dumps(
            {
                "operation": "pass-g-g1-face-orientation-test",
                "blend": bpy.data.filepath,
                "flippedFaces": flipped_faces,
                "connectivityChanges": connectivity_changes,
                "maximumVertexDisplacement": operator_vertex_displacement,
            },
            indent=2,
        )
    )


test_consistent_orientation()

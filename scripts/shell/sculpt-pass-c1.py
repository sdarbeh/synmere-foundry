"""Soften nostril-rim shading for Baseline v1 Pass C.1."""

import json

import bpy
from mathutils import Vector


EXPECTED_MESH_NAME = "IdentityShell"
EXPECTED_MATERIAL_NAME = "IdentityCeramic"
EXPECTED_VERTEX_COUNT = 6136
EXPECTED_VISIBLE_SURFACE_COUNT = 2939
EXPECTED_SHAPE_KEY_COUNT = 37
REQUIRED_PASS_MARKER = "synmere_baseline_v1_pass_c"
PASS_MARKER = "synmere_baseline_v1_pass_c1"

RIM_MAXIMUM_DEPTH = -0.35
RIM_MINIMUM_X = 0.06
RIM_MAXIMUM_X = 0.2
RIM_MINIMUM_Z = -0.51
RIM_MAXIMUM_Z = -0.415
NEIGHBOR_SMOOTHING_WEIGHT = 0.9
FRONT_NORMAL_WEIGHT = 0.38
FRONT_NORMAL = Vector((0.0, -1.0, 0.0))


def get_identity_shell():
    shell = bpy.data.objects.get(EXPECTED_MESH_NAME)
    if shell is None or shell.type != "MESH":
        raise RuntimeError(f"Missing {EXPECTED_MESH_NAME} mesh.")
    if len(shell.data.vertices) != EXPECTED_VERTEX_COUNT:
        raise RuntimeError("The canonical vertex count changed before Pass C.1.")
    if [material.name for material in shell.data.materials] != [
        EXPECTED_MATERIAL_NAME
    ]:
        raise RuntimeError(
            "The canonical material contract changed before Pass C.1."
        )
    if shell.data.shape_keys is None:
        raise RuntimeError("The canonical shell has no shape keys.")
    if len(shell.data.shape_keys.key_blocks) - 1 != EXPECTED_SHAPE_KEY_COUNT:
        raise RuntimeError("The canonical morph count changed before Pass C.1.")
    if not bpy.context.scene.get(REQUIRED_PASS_MARKER):
        raise RuntimeError("Pass C.1 requires the validated Pass C Basis.")
    if bpy.context.scene.get(PASS_MARKER):
        raise RuntimeError("Pass C.1 is already applied to this Blender source.")
    return shell


def build_neighbors(mesh):
    neighbors = [set() for _ in mesh.vertices]
    for edge in mesh.edges:
        first, second = edge.vertices
        neighbors[first].add(second)
        neighbors[second].add(first)
    return neighbors


def get_visible_rim_vertices(basis):
    return {
        index
        for index in range(EXPECTED_VISIBLE_SURFACE_COUNT)
        if basis.data[index].co.y <= RIM_MAXIMUM_DEPTH
        and RIM_MINIMUM_X <= abs(basis.data[index].co.x) <= RIM_MAXIMUM_X
        and RIM_MINIMUM_Z <= basis.data[index].co.z <= RIM_MAXIMUM_Z
    }


def get_smoothed_normal(index, mesh, neighbors):
    local_normals = [mesh.vertex_normals[index].vector.copy()]
    local_normals.extend(
        mesh.vertex_normals[neighbor].vector.copy()
        for neighbor in neighbors[index]
    )
    average = sum(local_normals, Vector()).normalized()
    original = mesh.vertex_normals[index].vector.copy()
    smoothed = original.lerp(average, NEIGHBOR_SMOOTHING_WEIGHT)
    return smoothed.lerp(FRONT_NORMAL, FRONT_NORMAL_WEIGHT).normalized()


def apply_pass_c1():
    shell = get_identity_shell()
    mesh = shell.data
    basis = mesh.shape_keys.key_blocks["Basis"]
    rim_vertices = get_visible_rim_vertices(basis)
    neighbors = build_neighbors(mesh)
    smoothed_normals = {
        index: get_smoothed_normal(index, mesh, neighbors)
        for index in rim_vertices
    }
    corner_normals = [
        corner_normal.vector.copy()
        for corner_normal in mesh.corner_normals
    ]
    changed_corners = 0
    for loop in mesh.loops:
        normal = smoothed_normals.get(loop.vertex_index)
        if normal is None:
            continue
        corner_normals[loop.index] = normal
        changed_corners += 1

    mesh.normals_split_custom_set(corner_normals)
    mesh.update()
    bpy.context.scene[PASS_MARKER] = {
        "rimVertices": len(rim_vertices),
        "changedCorners": changed_corners,
        "neighborSmoothingWeight": NEIGHBOR_SMOOTHING_WEIGHT,
        "frontNormalWeight": FRONT_NORMAL_WEIGHT,
    }
    bpy.ops.wm.save_as_mainfile(filepath=bpy.data.filepath, check_existing=False)

    print(
        json.dumps(
            {
                "operation": "baseline-v1-pass-c1",
                "blend": bpy.data.filepath,
                "movedVertices": 0,
                "rimVertices": len(rim_vertices),
                "changedCorners": changed_corners,
                "shapeKeysRebased": False,
            },
            indent=2,
        )
    )


apply_pass_c1()

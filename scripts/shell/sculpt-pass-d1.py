"""Refine the mouth seam, corners, and sublabial transition for Pass D.1."""

import json
import math

import bpy
from mathutils import Vector


EXPECTED_MESH_NAME = "IdentityShell"
EXPECTED_MATERIAL_NAME = "IdentityCeramic"
EXPECTED_VERTEX_COUNT = 6136
EXPECTED_FRONT_VERTEX_COUNT = 3024
EXPECTED_VISIBLE_SURFACE_COUNT = 2939
EXPECTED_SHAPE_KEY_COUNT = 37
REQUIRED_PASS_MARKER = "synmere_baseline_v1_pass_d"
PASS_MARKER = "synmere_baseline_v1_pass_d1"

VISIBLE_SURFACE_MAXIMUM_Y = -0.28

SEAM_CENTER_Z = -0.72
SEAM_RADIUS_X = 0.19
SEAM_RADIUS_Z = 0.027
SEAM_CENTER_CURVE = 0.005
SEAM_CENTER_FILL = 0.0022

SUBLABIAL_CENTER_Z = -0.835
SUBLABIAL_RADIUS_X = 0.24
SUBLABIAL_RADIUS_Z = 0.075
SUBLABIAL_RECESS = 0.003

CORNER_CENTER_X = 0.305
CORNER_CENTER_Z = -0.72
CORNER_RADIUS_X = 0.075
CORNER_RADIUS_Z = 0.058
CORNER_FILL = 0.002
CORNER_NORMAL_MINIMUM_X = 0.18
CORNER_NORMAL_MAXIMUM_X = 0.38
CORNER_NORMAL_MINIMUM_Z = -0.785
CORNER_NORMAL_MAXIMUM_Z = -0.66
CORNER_NORMAL_NEIGHBOR_WEIGHT = 0.82
CORNER_NORMAL_FRONT_WEIGHT = 0.2
FRONT_NORMAL = Vector((0.0, -1.0, 0.0))


def clamp01(value):
    return max(0.0, min(1.0, value))


def smoothstep(minimum, maximum, value):
    normalized = clamp01((value - minimum) / (maximum - minimum))
    return normalized * normalized * (3.0 - 2.0 * normalized)


def get_ellipse_weight(
    x,
    z,
    center_x,
    center_z,
    radius_x,
    radius_z,
    inner_radius=0.08,
):
    horizontal = (abs(x) - center_x) / radius_x
    vertical = (z - center_z) / radius_z
    radius = math.hypot(horizontal, vertical)
    return 1.0 - smoothstep(inner_radius, 1.0, radius)


def get_identity_shell():
    shell = bpy.data.objects.get(EXPECTED_MESH_NAME)
    if shell is None or shell.type != "MESH":
        raise RuntimeError(f"Missing {EXPECTED_MESH_NAME} mesh.")
    if len(shell.data.vertices) != EXPECTED_VERTEX_COUNT:
        raise RuntimeError("The canonical vertex count changed before Pass D.1.")
    if [material.name for material in shell.data.materials] != [
        EXPECTED_MATERIAL_NAME
    ]:
        raise RuntimeError(
            "The canonical material contract changed before Pass D.1."
        )
    if shell.data.shape_keys is None:
        raise RuntimeError("The canonical shell has no shape keys.")
    if len(shell.data.shape_keys.key_blocks) - 1 != EXPECTED_SHAPE_KEY_COUNT:
        raise RuntimeError("The canonical morph count changed before Pass D.1.")
    if not bpy.context.scene.get(REQUIRED_PASS_MARKER):
        raise RuntimeError("Pass D.1 requires the validated Pass D Basis.")
    if bpy.context.scene.get(PASS_MARKER):
        raise RuntimeError("Pass D.1 is already applied to this Blender source.")
    return shell


def get_seam_delta(position):
    seam_weight = get_ellipse_weight(
        position.x,
        position.z,
        0.0,
        SEAM_CENTER_Z,
        SEAM_RADIUS_X,
        SEAM_RADIUS_Z,
        0.0,
    )
    center_weight = 1.0 - smoothstep(
        SEAM_RADIUS_X * 0.18,
        SEAM_RADIUS_X,
        abs(position.x),
    )
    weight = seam_weight * center_weight

    # A shallow central dip breaks the ruler-straight seam while a small
    # forward fill prevents that curve from becoming another dark cut.
    return Vector(
        (
            0.0,
            -SEAM_CENTER_FILL * weight,
            -SEAM_CENTER_CURVE * weight,
        )
    )


def get_corner_delta(position):
    corner_weight = get_ellipse_weight(
        position.x,
        position.z,
        CORNER_CENTER_X,
        CORNER_CENTER_Z,
        CORNER_RADIUS_X,
        CORNER_RADIUS_Z,
        0.12,
    )
    return Vector((0.0, -CORNER_FILL * corner_weight, 0.0))


def get_sublabial_delta(position):
    transition_weight = get_ellipse_weight(
        position.x,
        position.z,
        0.0,
        SUBLABIAL_CENTER_Z,
        SUBLABIAL_RADIUS_X,
        SUBLABIAL_RADIUS_Z,
        0.14,
    )
    # This tiny recess separates the lower-lip volume from the chin without
    # attempting the broader chin-plane sculpt reserved for Pass E.
    return Vector((0.0, SUBLABIAL_RECESS * transition_weight, 0.0))


def get_pass_d1_delta(position):
    if position.y > VISIBLE_SURFACE_MAXIMUM_Y:
        return Vector()
    return (
        get_seam_delta(position)
        + get_corner_delta(position)
        + get_sublabial_delta(position)
    )


def build_neighbors(mesh):
    neighbors = [set() for _ in mesh.vertices]
    for edge in mesh.edges:
        first, second = edge.vertices
        neighbors[first].add(second)
        neighbors[second].add(first)
    return neighbors


def get_current_vertex_normals(mesh):
    accumulated = [Vector() for _ in mesh.vertices]
    counts = [0 for _ in mesh.vertices]
    for loop, corner_normal in zip(mesh.loops, mesh.corner_normals):
        accumulated[loop.vertex_index] += corner_normal.vector
        counts[loop.vertex_index] += 1
    return [
        (
            accumulated[index].normalized()
            if counts[index]
            else mesh.vertex_normals[index].vector.copy()
        )
        for index in range(len(mesh.vertices))
    ]


def get_corner_normal_vertices(basis):
    return {
        index
        for index in range(EXPECTED_VISIBLE_SURFACE_COUNT)
        if basis.data[index].co.y <= VISIBLE_SURFACE_MAXIMUM_Y
        and CORNER_NORMAL_MINIMUM_X
        <= abs(basis.data[index].co.x)
        <= CORNER_NORMAL_MAXIMUM_X
        and CORNER_NORMAL_MINIMUM_Z
        <= basis.data[index].co.z
        <= CORNER_NORMAL_MAXIMUM_Z
    }


def smooth_corner_normals(mesh, basis):
    neighbors = build_neighbors(mesh)
    current_normals = get_current_vertex_normals(mesh)
    corner_vertices = get_corner_normal_vertices(basis)
    target_normals = {}

    for index in corner_vertices:
        local_normals = [current_normals[index]]
        local_normals.extend(
            current_normals[neighbor]
            for neighbor in neighbors[index]
        )
        neighbor_average = sum(local_normals, Vector()).normalized()
        smoothed = current_normals[index].lerp(
            neighbor_average,
            CORNER_NORMAL_NEIGHBOR_WEIGHT,
        )
        target_normals[index] = smoothed.lerp(
            FRONT_NORMAL,
            CORNER_NORMAL_FRONT_WEIGHT,
        ).normalized()

    corner_normals = [
        corner_normal.vector.copy()
        for corner_normal in mesh.corner_normals
    ]
    changed_corners = 0
    for loop in mesh.loops:
        normal = target_normals.get(loop.vertex_index)
        if normal is None:
            continue
        corner_normals[loop.index] = normal
        changed_corners += 1

    mesh.normals_split_custom_set(corner_normals)
    return len(corner_vertices), changed_corners


def apply_pass_d1():
    shell = get_identity_shell()
    basis = shell.data.shape_keys.key_blocks["Basis"]
    original = [
        basis.data[index].co.copy()
        for index in range(EXPECTED_FRONT_VERTEX_COUNT)
    ]
    deltas = [
        get_pass_d1_delta(original[index])
        for index in range(EXPECTED_FRONT_VERTEX_COUNT)
    ]

    for index, delta in enumerate(deltas):
        basis.data[index].co = original[index] + delta

    shell.data.update()
    corner_vertices, changed_corners = smooth_corner_normals(
        shell.data,
        basis,
    )
    shell.data.update()
    bpy.context.scene[PASS_MARKER] = {
        "seamCenterCurve": SEAM_CENTER_CURVE,
        "seamCenterFill": SEAM_CENTER_FILL,
        "cornerFill": CORNER_FILL,
        "sublabialRecess": SUBLABIAL_RECESS,
        "cornerNormalVertices": corner_vertices,
        "changedNormalCorners": changed_corners,
    }
    bpy.ops.wm.save_as_mainfile(filepath=bpy.data.filepath, check_existing=False)

    moved = [delta.length for delta in deltas]
    print(
        json.dumps(
            {
                "operation": "baseline-v1-pass-d1",
                "blend": bpy.data.filepath,
                "frontVertices": EXPECTED_FRONT_VERTEX_COUNT,
                "movedFrontVertices": sum(value > 1e-7 for value in moved),
                "maximumBasisDisplacement": max(moved),
                "cornerNormalVertices": corner_vertices,
                "changedNormalCorners": changed_corners,
                "shapeKeysAwaitingRebase": EXPECTED_SHAPE_KEY_COUNT,
            },
            indent=2,
        )
    )


apply_pass_d1()

"""Refine cheek, jaw, and chin planes for Baseline v1 Pass E."""

import json
import math

import bpy
from mathutils import Vector


EXPECTED_MESH_NAME = "IdentityShell"
EXPECTED_MATERIAL_NAME = "IdentityCeramic"
EXPECTED_VERTEX_COUNT = 6136
EXPECTED_VISIBLE_SURFACE_COUNT = 2939
EXPECTED_SHAPE_KEY_COUNT = 37
REQUIRED_PASS_MARKER = "synmere_baseline_v1_pass_d1"
PASS_MARKER = "synmere_baseline_v1_pass_e"

PERIMETER_MAXIMUM_X = 0.58
FEATURE_PROTECTION_MAXIMUM_X = 0.23
FEATURE_PROTECTION_MINIMUM_Z = -0.84

UPPER_CHEEK_CENTER_X = 0.38
UPPER_CHEEK_CENTER_Z = -0.36
UPPER_CHEEK_RADIUS_X = 0.23
UPPER_CHEEK_RADIUS_Z = 0.27
UPPER_CHEEK_PROJECTION = 0.0055

LOWER_CHEEK_CENTER_X = 0.39
LOWER_CHEEK_CENTER_Z = -0.61
LOWER_CHEEK_RADIUS_X = 0.22
LOWER_CHEEK_RADIUS_Z = 0.22
LOWER_CHEEK_PROJECTION = 0.0035

JAW_PLANE_CENTER_X = 0.36
JAW_PLANE_CENTER_Z = -0.82
JAW_PLANE_RADIUS_X = 0.2
JAW_PLANE_RADIUS_Z = 0.2
JAW_PLANE_PROJECTION = 0.0028

CHIN_CENTER_Z = -0.95
CHIN_RADIUS_X = 0.27
CHIN_RADIUS_Z = 0.16
CHIN_PROJECTION = 0.0055
CHIN_MAXIMUM_Z = -0.85


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
    inner_radius=0.12,
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
        raise RuntimeError("The canonical vertex count changed before Pass E.")
    if [material.name for material in shell.data.materials] != [
        EXPECTED_MATERIAL_NAME
    ]:
        raise RuntimeError("The canonical material contract changed before Pass E.")
    if shell.data.shape_keys is None:
        raise RuntimeError("The canonical shell has no shape keys.")
    if len(shell.data.shape_keys.key_blocks) - 1 != EXPECTED_SHAPE_KEY_COUNT:
        raise RuntimeError("The canonical morph count changed before Pass E.")
    if not bpy.context.scene.get(REQUIRED_PASS_MARKER):
        raise RuntimeError("Pass E requires the validated Pass D.1 Basis.")
    if bpy.context.scene.get(PASS_MARKER):
        raise RuntimeError("Pass E is already applied to this Blender source.")
    return shell


def get_lateral_plane_weight(position, center_x, center_z, radius_x, radius_z):
    if abs(position.x) > PERIMETER_MAXIMUM_X:
        return 0.0
    feature_fade = smoothstep(
        FEATURE_PROTECTION_MAXIMUM_X,
        FEATURE_PROTECTION_MAXIMUM_X + 0.08,
        abs(position.x),
    )
    return feature_fade * get_ellipse_weight(
        position.x,
        position.z,
        center_x,
        center_z,
        radius_x,
        radius_z,
    )


def get_cheek_and_jaw_delta(position):
    upper_cheek = get_lateral_plane_weight(
        position,
        UPPER_CHEEK_CENTER_X,
        UPPER_CHEEK_CENTER_Z,
        UPPER_CHEEK_RADIUS_X,
        UPPER_CHEEK_RADIUS_Z,
    )
    lower_cheek = get_lateral_plane_weight(
        position,
        LOWER_CHEEK_CENTER_X,
        LOWER_CHEEK_CENTER_Z,
        LOWER_CHEEK_RADIUS_X,
        LOWER_CHEEK_RADIUS_Z,
    )
    jaw_plane = get_lateral_plane_weight(
        position,
        JAW_PLANE_CENTER_X,
        JAW_PLANE_CENTER_Z,
        JAW_PLANE_RADIUS_X,
        JAW_PLANE_RADIUS_Z,
    )
    projection = (
        UPPER_CHEEK_PROJECTION * upper_cheek
        + LOWER_CHEEK_PROJECTION * lower_cheek
        + JAW_PLANE_PROJECTION * jaw_plane
    )
    return Vector((0.0, -projection, 0.0))


def get_chin_delta(position):
    if position.z > CHIN_MAXIMUM_Z:
        return Vector()
    chin_weight = get_ellipse_weight(
        position.x,
        position.z,
        0.0,
        CHIN_CENTER_Z,
        CHIN_RADIUS_X,
        CHIN_RADIUS_Z,
        0.18,
    )
    return Vector((0.0, -CHIN_PROJECTION * chin_weight, 0.0))


def get_pass_e_delta(position):
    if (
        abs(position.x) < FEATURE_PROTECTION_MAXIMUM_X
        and position.z > FEATURE_PROTECTION_MINIMUM_Z
    ):
        return Vector()
    return get_cheek_and_jaw_delta(position) + get_chin_delta(position)


def apply_pass_e():
    shell = get_identity_shell()
    basis = shell.data.shape_keys.key_blocks["Basis"]
    original = [
        basis.data[index].co.copy()
        for index in range(EXPECTED_VISIBLE_SURFACE_COUNT)
    ]
    deltas = [get_pass_e_delta(position) for position in original]

    # Pass E changes front-surface depth only. Width, feature loops, and the
    # authored mask perimeter remain fixed for every identity morph.
    for index, delta in enumerate(deltas):
        basis.data[index].co = original[index] + delta

    shell.data.update()
    bpy.context.scene[PASS_MARKER] = {
        "upperCheekProjection": UPPER_CHEEK_PROJECTION,
        "lowerCheekProjection": LOWER_CHEEK_PROJECTION,
        "jawPlaneProjection": JAW_PLANE_PROJECTION,
        "chinProjection": CHIN_PROJECTION,
    }
    bpy.ops.wm.save_as_mainfile(filepath=bpy.data.filepath, check_existing=False)

    moved = [delta.length for delta in deltas]
    print(
        json.dumps(
            {
                "operation": "baseline-v1-pass-e",
                "blend": bpy.data.filepath,
                "visibleVertices": EXPECTED_VISIBLE_SURFACE_COUNT,
                "movedVertices": sum(value > 1e-7 for value in moved),
                "maximumBasisDisplacement": max(moved),
                "shapeKeysAwaitingRebase": EXPECTED_SHAPE_KEY_COUNT,
            },
            indent=2,
        )
    )


apply_pass_e()

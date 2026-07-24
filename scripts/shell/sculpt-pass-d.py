"""Apply the Baseline v1 mouth, lip, and philtrum sculpt to the Basis."""

import json
import math

import bpy
from mathutils import Vector


EXPECTED_MESH_NAME = "IdentityShell"
EXPECTED_MATERIAL_NAME = "IdentityCeramic"
EXPECTED_VERTEX_COUNT = 6136
EXPECTED_FRONT_VERTEX_COUNT = 3024
EXPECTED_SHAPE_KEY_COUNT = 37
REQUIRED_PASS_MARKER = "synmere_baseline_v1_pass_c2"
PASS_MARKER = "synmere_baseline_v1_pass_d"

VISIBLE_SURFACE_MAXIMUM_Y = -0.28

UPPER_LIP_CENTER_Z = -0.675
UPPER_LIP_RADIUS_X = 0.34
UPPER_LIP_RADIUS_Z = 0.075
UPPER_LIP_PROJECTION = 0.0063

LOWER_LIP_CENTER_Z = -0.765
LOWER_LIP_RADIUS_X = 0.33
LOWER_LIP_RADIUS_Z = 0.085
LOWER_LIP_PROJECTION = 0.0077

MOUTH_SEAM_CENTER_Z = -0.72
MOUTH_SEAM_RADIUS_X = 0.315
MOUTH_SEAM_RADIUS_Z = 0.032
MOUTH_SEAM_FILL = 0.0032

UPPER_LIP_TUBERCLE_RADIUS_X = 0.105
UPPER_LIP_TUBERCLE_RADIUS_Z = 0.065
UPPER_LIP_TUBERCLE_PROJECTION = 0.0021

PHILTRUM_CENTER_Z = -0.59
PHILTRUM_RADIUS_X = 0.095
PHILTRUM_RADIUS_Z = 0.115
PHILTRUM_MAXIMUM_Z = -0.54
PHILTRUM_RIDGE_CENTER_X = 0.052
PHILTRUM_RIDGE_RADIUS_X = 0.038
PHILTRUM_RIDGE_PROJECTION = 0.0017
PHILTRUM_CENTER_RECESS = 0.0006


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
        raise RuntimeError("The canonical vertex count changed before Pass D.")
    if [material.name for material in shell.data.materials] != [
        EXPECTED_MATERIAL_NAME
    ]:
        raise RuntimeError("The canonical material contract changed before Pass D.")
    if shell.data.shape_keys is None:
        raise RuntimeError("The canonical shell has no shape keys.")
    if len(shell.data.shape_keys.key_blocks) - 1 != EXPECTED_SHAPE_KEY_COUNT:
        raise RuntimeError("The canonical morph count changed before Pass D.")
    if not bpy.context.scene.get(REQUIRED_PASS_MARKER):
        raise RuntimeError("Pass D requires the approved Pass C.2 Basis.")
    if bpy.context.scene.get(PASS_MARKER):
        raise RuntimeError("Pass D is already applied to this Blender source.")
    return shell


def get_lip_delta(position):
    upper_weight = get_ellipse_weight(
        position.x,
        position.z,
        0.0,
        UPPER_LIP_CENTER_Z,
        UPPER_LIP_RADIUS_X,
        UPPER_LIP_RADIUS_Z,
    )
    lower_weight = get_ellipse_weight(
        position.x,
        position.z,
        0.0,
        LOWER_LIP_CENTER_Z,
        LOWER_LIP_RADIUS_X,
        LOWER_LIP_RADIUS_Z,
    )
    seam_weight = get_ellipse_weight(
        position.x,
        position.z,
        0.0,
        MOUTH_SEAM_CENTER_Z,
        MOUTH_SEAM_RADIUS_X,
        MOUTH_SEAM_RADIUS_Z,
        0.04,
    )
    tubercle_weight = get_ellipse_weight(
        position.x,
        position.z,
        0.0,
        UPPER_LIP_CENTER_Z,
        UPPER_LIP_TUBERCLE_RADIUS_X,
        UPPER_LIP_TUBERCLE_RADIUS_Z,
        0.0,
    )

    # Projection adds lip volume while the smaller seam fill keeps the mouth
    # sealed and readable without preserving the current knife-edge crease.
    projection = (
        UPPER_LIP_PROJECTION * upper_weight
        + LOWER_LIP_PROJECTION * lower_weight
        + MOUTH_SEAM_FILL * seam_weight
        + UPPER_LIP_TUBERCLE_PROJECTION * tubercle_weight
    )
    return Vector((0.0, -projection, 0.0))


def get_philtrum_delta(position):
    if position.z > PHILTRUM_MAXIMUM_Z:
        return Vector()

    region_weight = get_ellipse_weight(
        position.x,
        position.z,
        0.0,
        PHILTRUM_CENTER_Z,
        PHILTRUM_RADIUS_X,
        PHILTRUM_RADIUS_Z,
        0.0,
    )
    if region_weight <= 0:
        return Vector()

    ridge_distance = abs(abs(position.x) - PHILTRUM_RIDGE_CENTER_X)
    ridge_weight = 1.0 - smoothstep(
        PHILTRUM_RIDGE_RADIUS_X * 0.25,
        PHILTRUM_RIDGE_RADIUS_X,
        ridge_distance,
    )
    center_weight = 1.0 - smoothstep(
        0.0,
        PHILTRUM_RIDGE_CENTER_X,
        abs(position.x),
    )
    projection = (
        PHILTRUM_RIDGE_PROJECTION * ridge_weight
        - PHILTRUM_CENTER_RECESS * center_weight
    ) * region_weight
    return Vector((0.0, -projection, 0.0))


def get_pass_d_delta(position):
    if position.y > VISIBLE_SURFACE_MAXIMUM_Y:
        return Vector()
    return get_lip_delta(position) + get_philtrum_delta(position)


def apply_pass_d():
    shell = get_identity_shell()
    basis = shell.data.shape_keys.key_blocks["Basis"]
    original = [
        basis.data[index].co.copy()
        for index in range(EXPECTED_FRONT_VERTEX_COUNT)
    ]
    deltas = [
        get_pass_d_delta(original[index])
        for index in range(EXPECTED_FRONT_VERTEX_COUNT)
    ]

    # The hidden thickness layer stays untouched so local mouth sculpting cannot
    # introduce a back-surface seam or change the designed mask perimeter.
    for index, delta in enumerate(deltas):
        basis.data[index].co = original[index] + delta

    shell.data.update()
    bpy.context.scene[PASS_MARKER] = {
        "upperLipProjection": UPPER_LIP_PROJECTION,
        "lowerLipProjection": LOWER_LIP_PROJECTION,
        "mouthSeamFill": MOUTH_SEAM_FILL,
        "philtrumRidgeProjection": PHILTRUM_RIDGE_PROJECTION,
        "philtrumCenterRecess": PHILTRUM_CENTER_RECESS,
    }
    bpy.ops.wm.save_as_mainfile(filepath=bpy.data.filepath, check_existing=False)

    moved = [delta.length for delta in deltas]
    print(
        json.dumps(
            {
                "operation": "baseline-v1-pass-d",
                "blend": bpy.data.filepath,
                "frontVertices": EXPECTED_FRONT_VERTEX_COUNT,
                "movedFrontVertices": sum(value > 1e-7 for value in moved),
                "maximumBasisDisplacement": max(moved),
                "shapeKeysAwaitingRebase": EXPECTED_SHAPE_KEY_COUNT,
            },
            indent=2,
        )
    )


apply_pass_d()

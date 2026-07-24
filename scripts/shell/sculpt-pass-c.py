"""Apply the Baseline v1 nose-base sculpt to the canonical Basis."""

import json
import math

import bpy
from mathutils import Vector


EXPECTED_MESH_NAME = "IdentityShell"
EXPECTED_MATERIAL_NAME = "IdentityCeramic"
EXPECTED_VERTEX_COUNT = 6136
EXPECTED_FRONT_VERTEX_COUNT = 3024
EXPECTED_SHAPE_KEY_COUNT = 37
REQUIRED_PASS_MARKER = "synmere_baseline_v1_pass_b"
PASS_MARKER = "synmere_baseline_v1_pass_c"

VISIBLE_SURFACE_MAXIMUM_Y = -0.3

ALAR_CENTER_X = 0.145
ALAR_CENTER_Z = -0.47
ALAR_RADIUS_X = 0.115
ALAR_RADIUS_Z = 0.105
ALAR_WIDTH_DELTA = 0.008

NOSTRIL_CENTER_X = 0.105
NOSTRIL_CENTER_Z = -0.505
NOSTRIL_RADIUS_X = 0.08
NOSTRIL_RADIUS_Z = 0.052
NOSTRIL_RIM_WIDTH_DELTA = 0.0032

COLUMELLA_CENTER_Z = -0.515
COLUMELLA_RADIUS_X = 0.06
COLUMELLA_RADIUS_Z = 0.065
COLUMELLA_NARROWING_DELTA = 0.0015


def clamp(value, minimum, maximum):
    return max(minimum, min(maximum, value))


def clamp01(value):
    return clamp(value, 0.0, 1.0)


def smoothstep(minimum, maximum, value):
    normalized = clamp01((value - minimum) / (maximum - minimum))
    return normalized * normalized * (3.0 - 2.0 * normalized)


def get_ellipse_weight(x, z, center_x, center_z, radius_x, radius_z):
    horizontal = (abs(x) - center_x) / radius_x
    vertical = (z - center_z) / radius_z
    radius = math.hypot(horizontal, vertical)
    return 1.0 - smoothstep(0.18, 1.0, radius)


def get_identity_shell():
    shell = bpy.data.objects.get(EXPECTED_MESH_NAME)
    if shell is None or shell.type != "MESH":
        raise RuntimeError(f"Missing {EXPECTED_MESH_NAME} mesh.")
    if len(shell.data.vertices) != EXPECTED_VERTEX_COUNT:
        raise RuntimeError("The canonical vertex count changed before Pass C.")
    if [material.name for material in shell.data.materials] != [
        EXPECTED_MATERIAL_NAME
    ]:
        raise RuntimeError("The canonical material contract changed before Pass C.")
    if shell.data.shape_keys is None:
        raise RuntimeError("The canonical shell has no shape keys.")
    if len(shell.data.shape_keys.key_blocks) - 1 != EXPECTED_SHAPE_KEY_COUNT:
        raise RuntimeError("The canonical morph count changed before Pass C.")
    if not bpy.context.scene.get(REQUIRED_PASS_MARKER):
        raise RuntimeError("Pass C requires the approved Pass B Basis.")
    if bpy.context.scene.get(PASS_MARKER):
        raise RuntimeError("Pass C is already applied to this Blender source.")
    return shell


def get_authored_nose_delta(position):
    if position.y > VISIBLE_SURFACE_MAXIMUM_Y:
        return Vector()

    alar_weight = get_ellipse_weight(
        position.x,
        position.z,
        ALAR_CENTER_X,
        ALAR_CENTER_Z,
        ALAR_RADIUS_X,
        ALAR_RADIUS_Z,
    )
    nostril_weight = get_ellipse_weight(
        position.x,
        position.z,
        NOSTRIL_CENTER_X,
        NOSTRIL_CENTER_Z,
        NOSTRIL_RADIUS_X,
        NOSTRIL_RADIUS_Z,
    )
    columella_weight = get_ellipse_weight(
        position.x,
        position.z,
        0.0,
        COLUMELLA_CENTER_Z,
        COLUMELLA_RADIUS_X,
        COLUMELLA_RADIUS_Z,
    )
    horizontal_direction = -1.0 if position.x < 0 else 1.0

    # Lateral shaping opens the pinched alar and nostril forms without touching
    # the already maxed nose-projection and nose-length deformation axes.
    return Vector(
        (
            horizontal_direction
            * (
                ALAR_WIDTH_DELTA * alar_weight
                + NOSTRIL_RIM_WIDTH_DELTA * nostril_weight
                - COLUMELLA_NARROWING_DELTA * columella_weight
            ),
            0.0,
            0.0,
        )
    )


def apply_pass_c():
    shell = get_identity_shell()
    basis = shell.data.shape_keys.key_blocks["Basis"]
    original = [
        basis.data[index].co.copy()
        for index in range(EXPECTED_FRONT_VERTEX_COUNT)
    ]
    deltas = [
        get_authored_nose_delta(original[index])
        for index in range(EXPECTED_FRONT_VERTEX_COUNT)
    ]

    # Pass C affects only the visible sculpt surface. Mirroring these local
    # changes into the hidden thickness layer distorts its compact nostril edges.
    for index, delta in enumerate(deltas):
        basis.data[index].co = original[index] + delta

    shell.data.update()
    bpy.context.scene[PASS_MARKER] = {
        "alarWidthDelta": ALAR_WIDTH_DELTA,
        "nostrilRimWidthDelta": NOSTRIL_RIM_WIDTH_DELTA,
        "columellaNarrowingDelta": COLUMELLA_NARROWING_DELTA,
    }
    bpy.ops.wm.save_as_mainfile(filepath=bpy.data.filepath, check_existing=False)

    moved = [delta.length for delta in deltas]
    print(
        json.dumps(
            {
                "operation": "baseline-v1-pass-c",
                "blend": bpy.data.filepath,
                "frontVertices": EXPECTED_FRONT_VERTEX_COUNT,
                "movedFrontVertices": sum(value > 1e-7 for value in moved),
                "maximumBasisDisplacement": max(moved),
                "shapeKeysAwaitingRebase": EXPECTED_SHAPE_KEY_COUNT,
            },
            indent=2,
        )
    )


apply_pass_c()

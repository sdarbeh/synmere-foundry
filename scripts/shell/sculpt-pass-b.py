"""Apply the Baseline v1 eyelid and brow sculpt to the canonical Basis."""

import json
import math

import bpy
from mathutils import Vector


EXPECTED_MESH_NAME = "IdentityShell"
EXPECTED_MATERIAL_NAME = "IdentityCeramic"
EXPECTED_VERTEX_COUNT = 6136
EXPECTED_FRONT_VERTEX_COUNT = 3024
EXPECTED_SHAPE_KEY_COUNT = 37
REQUIRED_PASS_MARKER = "synmere_baseline_v1_pass_a"
PASS_MARKER = "synmere_baseline_v1_pass_b"

EYE_CENTER_X = 0.3
EYE_CENTER_Z = 0.045
EYE_RADIUS_X = 0.255
EYE_RADIUS_Z = 0.135
EYE_SEAM_Z = 0.012
EYELID_FLATTENING = 0.052
EYELID_SEAM_RELIEF = 0.0045

BROW_CENTER_Z = 0.205
BROW_RADIUS_X = 0.29
BROW_RADIUS_Z = 0.13
BROW_PLANE_PROJECTION = 0.011


def clamp01(value):
    return max(0.0, min(1.0, value))


def smoothstep(minimum, maximum, value):
    normalized = clamp01((value - minimum) / (maximum - minimum))
    return normalized * normalized * (3.0 - 2.0 * normalized)


def get_identity_shell():
    shell = bpy.data.objects.get(EXPECTED_MESH_NAME)
    if shell is None or shell.type != "MESH":
        raise RuntimeError(f"Missing {EXPECTED_MESH_NAME} mesh.")
    if len(shell.data.vertices) != EXPECTED_VERTEX_COUNT:
        raise RuntimeError("The canonical vertex count changed before Pass B.")
    if [material.name for material in shell.data.materials] != [
        EXPECTED_MATERIAL_NAME
    ]:
        raise RuntimeError("The canonical material contract changed before Pass B.")
    if shell.data.shape_keys is None:
        raise RuntimeError("The canonical shell has no shape keys.")
    if len(shell.data.shape_keys.key_blocks) - 1 != EXPECTED_SHAPE_KEY_COUNT:
        raise RuntimeError("The canonical morph count changed before Pass B.")
    if not bpy.context.scene.get(REQUIRED_PASS_MARKER):
        raise RuntimeError("Pass B requires the approved Pass A Basis.")
    if bpy.context.scene.get(PASS_MARKER):
        raise RuntimeError("Pass B is already applied to this Blender source.")
    return shell


def get_elliptical_weight(
    x,
    z,
    center_z,
    radius_x,
    radius_z,
    inner_radius,
):
    horizontal = (abs(x) - EYE_CENTER_X) / radius_x
    vertical = (z - center_z) / radius_z
    radius = math.hypot(horizontal, vertical)
    return 1.0 - smoothstep(inner_radius, 1.04, radius)


def get_eyelid_delta(position):
    lid_weight = get_elliptical_weight(
        position.x,
        position.z,
        EYE_CENTER_Z,
        EYE_RADIUS_X,
        EYE_RADIUS_Z,
        0.08,
    )
    if lid_weight <= 0:
        return Vector()

    # Push the puffy lid volume toward the shell while retaining a shallow
    # horizontal seam so the closed eye still reads intentionally.
    vertical = clamp01(
        (position.z - (EYE_CENTER_Z - EYE_RADIUS_Z))
        / (EYE_RADIUS_Z * 2.0)
    )
    flattening = EYELID_FLATTENING * lid_weight * (0.84 + vertical * 0.16)
    seam_distance = abs(position.z - EYE_SEAM_Z)
    seam_weight = (
        1.0 - smoothstep(0.014, 0.045, seam_distance)
    ) * lid_weight
    depth_delta = flattening - EYELID_SEAM_RELIEF * seam_weight
    return Vector((0.0, depth_delta, 0.0))


def get_brow_delta(position):
    brow_weight = get_elliptical_weight(
        position.x,
        position.z,
        BROW_CENTER_Z,
        BROW_RADIUS_X,
        BROW_RADIUS_Z,
        0.38,
    )
    if brow_weight <= 0 or position.z < 0.105:
        return Vector()

    # A shallow forward movement establishes a brow plane without changing its arch.
    return Vector((0.0, -BROW_PLANE_PROJECTION * brow_weight, 0.0))


def get_pass_b_delta(position):
    return get_eyelid_delta(position) + get_brow_delta(position)


def apply_pass_b():
    shell = get_identity_shell()
    basis = shell.data.shape_keys.key_blocks["Basis"]
    original = [vertex.co.copy() for vertex in basis.data]
    deltas = [
        get_pass_b_delta(original[index])
        for index in range(EXPECTED_FRONT_VERTEX_COUNT)
    ]

    for index, delta in enumerate(deltas):
        basis.data[index].co = original[index] + delta
        back_index = index + EXPECTED_FRONT_VERTEX_COUNT
        basis.data[back_index].co = original[back_index] + delta

    shell.data.update()
    bpy.context.scene[PASS_MARKER] = {
        "eyelidFlattening": EYELID_FLATTENING,
        "eyelidSeamRelief": EYELID_SEAM_RELIEF,
        "browPlaneProjection": BROW_PLANE_PROJECTION,
    }
    bpy.ops.wm.save_as_mainfile(filepath=bpy.data.filepath, check_existing=False)

    moved = [delta.length for delta in deltas]
    print(
        json.dumps(
            {
                "operation": "baseline-v1-pass-b",
                "blend": bpy.data.filepath,
                "frontVertices": EXPECTED_FRONT_VERTEX_COUNT,
                "movedFrontVertices": sum(value > 1e-7 for value in moved),
                "maximumBasisDisplacement": max(moved),
                "shapeKeysAwaitingRebase": EXPECTED_SHAPE_KEY_COUNT,
            },
            indent=2,
        )
    )


apply_pass_b()

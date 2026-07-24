"""Apply the Baseline v1 macro silhouette sculpt to the canonical Basis."""

import json
import math

import bpy
from mathutils import Vector


EXPECTED_MESH_NAME = "IdentityShell"
EXPECTED_MATERIAL_NAME = "IdentityCeramic"
EXPECTED_VERTEX_COUNT = 6136
EXPECTED_FRONT_VERTEX_COUNT = 3024
EXPECTED_BEVEL_VERTEX_COUNT = 88
EXPECTED_SHAPE_KEY_COUNT = 37
PASS_MARKER = "synmere_baseline_v1_pass_a"

# These are conservative source-asset movements, not product parameter tuning.
UPPER_HEAD_FULL = 0.70
UPPER_HEAD_COMPRESSION = 0.058
TEMPLE_WIDENING = 0.021
JAW_PLANE_DEFINITION = 0.013
CHIN_PROJECTION = 0.009


def clamp01(value):
    return max(0.0, min(1.0, value))


def smoothstep(minimum, maximum, value):
    normalized = clamp01((value - minimum) / (maximum - minimum))
    return normalized * normalized * (3.0 - 2.0 * normalized)


def band_weight(minimum, inner_minimum, inner_maximum, maximum, value):
    return smoothstep(minimum, inner_minimum, value) * (
        1.0 - smoothstep(inner_maximum, maximum, value)
    )


def get_identity_shell():
    shell = bpy.data.objects.get(EXPECTED_MESH_NAME)
    if shell is None or shell.type != "MESH":
        raise RuntimeError(f"Missing {EXPECTED_MESH_NAME} mesh.")
    if len(shell.data.vertices) != EXPECTED_VERTEX_COUNT:
        raise RuntimeError("The canonical vertex count changed before Pass A.")
    if [material.name for material in shell.data.materials] != [
        EXPECTED_MATERIAL_NAME
    ]:
        raise RuntimeError("The canonical material contract changed before Pass A.")
    if shell.data.shape_keys is None:
        raise RuntimeError("The canonical shell has no shape keys.")
    if len(shell.data.shape_keys.key_blocks) - 1 != EXPECTED_SHAPE_KEY_COUNT:
        raise RuntimeError("The canonical morph count changed before Pass A.")
    if bpy.context.scene.get(PASS_MARKER):
        raise RuntimeError("Pass A is already applied to this Blender source.")
    return shell


def get_bevel_to_front_mapping(shell):
    bevel_start = EXPECTED_FRONT_VERTEX_COUNT * 2
    bevel_indices = set(
        range(bevel_start, bevel_start + EXPECTED_BEVEL_VERTEX_COUNT)
    )
    mapping = {}

    for edge in shell.data.edges:
        left, right = edge.vertices
        if left in bevel_indices and right < EXPECTED_FRONT_VERTEX_COUNT:
            mapping.setdefault(left, set()).add(right)
        if right in bevel_indices and left < EXPECTED_FRONT_VERTEX_COUNT:
            mapping.setdefault(right, set()).add(left)

    resolved = {}
    basis = shell.data.shape_keys.key_blocks["Basis"]
    for bevel_index in bevel_indices:
        candidates = mapping.get(bevel_index, set())
        if not candidates:
            raise RuntimeError(f"Bevel vertex {bevel_index} has no front mapping.")
        bevel_position = basis.data[bevel_index].co
        resolved[bevel_index] = min(
            candidates,
            key=lambda index: (basis.data[index].co - bevel_position).length_squared,
        )
    return resolved


def get_macro_delta(position):
    x = position.x
    z = position.z
    absolute_x = abs(x)
    direction = math.copysign(1.0, x) if absolute_x > 1e-6 else 0.0

    # Translate the crown after a short transition instead of scaling it.
    # This reduces dome height without shortening authored upper-face edges.
    crown_weight = smoothstep(0.50, UPPER_HEAD_FULL, z)
    delta_z = -UPPER_HEAD_COMPRESSION * crown_weight

    # A small upper-side expansion keeps the shorter crown from feeling pinched.
    temple_weight = band_weight(0.24, 0.48, 0.76, 0.98, z)
    delta_x = x * TEMPLE_WIDENING * temple_weight

    # Define the jaw plane laterally without moving the mouth or central face.
    jaw_height_weight = band_weight(-1.03, -0.88, -0.60, -0.43, z)
    jaw_side_weight = smoothstep(0.30, 0.56, absolute_x)
    delta_x += (
        direction * JAW_PLANE_DEFINITION * jaw_height_weight * jaw_side_weight
    )

    # Give the lower chin a restrained front plane, isolated below the lips.
    chin_height_weight = 1.0 - smoothstep(-0.90, -0.78, z)
    chin_center_weight = 1.0 - smoothstep(0.20, 0.38, absolute_x)
    delta_y = CHIN_PROJECTION * chin_height_weight * chin_center_weight

    return Vector((delta_x, delta_y, delta_z))


def apply_pass_a():
    shell = get_identity_shell()
    shape_keys = shell.data.shape_keys.key_blocks
    basis = shape_keys["Basis"]
    original = [vertex.co.copy() for vertex in basis.data]
    next_front = [
        original[index] + get_macro_delta(original[index])
        for index in range(EXPECTED_FRONT_VERTEX_COUNT)
    ]

    bevel_to_front = get_bevel_to_front_mapping(shell)

    deltas = [
        next_front[index] - original[index]
        for index in range(EXPECTED_FRONT_VERTEX_COUNT)
    ]
    for index, delta in enumerate(deltas):
        basis.data[index].co = original[index] + delta
        back_index = index + EXPECTED_FRONT_VERTEX_COUNT
        basis.data[back_index].co = original[back_index] + delta

    for bevel_index, front_index in bevel_to_front.items():
        basis.data[bevel_index].co = original[bevel_index] + deltas[front_index]

    shell.data.update()
    bpy.context.scene[PASS_MARKER] = {
        "upperHeadCompression": UPPER_HEAD_COMPRESSION,
        "templeWidening": TEMPLE_WIDENING,
        "jawPlaneDefinition": JAW_PLANE_DEFINITION,
        "chinProjection": CHIN_PROJECTION,
    }
    bpy.ops.wm.save_as_mainfile(filepath=bpy.data.filepath, check_existing=False)

    moved = [delta.length for delta in deltas]
    print(
        json.dumps(
            {
                "operation": "baseline-v1-pass-a",
                "blend": bpy.data.filepath,
                "frontVertices": EXPECTED_FRONT_VERTEX_COUNT,
                "perimeterVertices": len(bevel_to_front),
                "movedFrontVertices": sum(value > 1e-7 for value in moved),
                "maximumBasisDisplacement": max(moved),
                "shapeKeysAwaitingRebase": EXPECTED_SHAPE_KEY_COUNT,
            },
            indent=2,
        )
    )


apply_pass_a()

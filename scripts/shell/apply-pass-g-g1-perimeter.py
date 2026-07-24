"""Resolve the four evidenced lower-perimeter sliver triangles for Pass G1."""

import json

import bpy
from mathutils import Vector


EXPECTED_MESH_NAME = "IdentityShell"
EXPECTED_VERTEX_COUNT = 6136
REQUIRED_PASS_MARKER = "synmere_baseline_v1_pass_g1"
PASS_MARKER = "synmere_baseline_v1_pass_g1_perimeter"

# These paired height corrections remove near-collinearity in the two front
# and two rear lower-chin triangles without changing lateral/depth silhouette.
GLB_BASIS_DELTAS = {
    806: (0.0, 0.004, 0.0),
    2250: (0.0, 0.004, 0.0),
    3830: (0.0, -0.004, 0.0),
    5274: (0.0, -0.004, 0.0),
}


def glb_delta_to_blender(delta):
    return Vector((delta[0], -delta[2], delta[1]))


def get_identity_shell():
    shell = bpy.data.objects.get(EXPECTED_MESH_NAME)
    if shell is None or shell.type != "MESH":
        raise RuntimeError(f"Missing {EXPECTED_MESH_NAME} mesh.")
    if len(shell.data.vertices) != EXPECTED_VERTEX_COUNT:
        raise RuntimeError("The canonical vertex count changed during Pass G1.")
    if not bpy.context.scene.get(REQUIRED_PASS_MARKER):
        raise RuntimeError("The bounded morph repair must run before perimeter cleanup.")
    if bpy.context.scene.get(PASS_MARKER):
        raise RuntimeError("The Pass G1 perimeter correction is already applied.")
    return shell


def apply_perimeter_correction():
    shell = get_identity_shell()
    key_blocks = shell.data.shape_keys.key_blocks
    summaries = []
    for vertex_index, glb_delta in GLB_BASIS_DELTAS.items():
        blender_delta = glb_delta_to_blender(glb_delta)
        # Move every key by the Basis delta so all approved A-E morph deltas,
        # including the preceding G1 repairs, remain exactly unchanged.
        for key in key_blocks:
            key.data[vertex_index].co += blender_delta
        summaries.append(
            {
                "vertexIndex": vertex_index,
                "glbBasisDelta": glb_delta,
                "displacement": blender_delta.length,
            }
        )

    shell.data.update()
    bpy.context.scene[PASS_MARKER] = {
        "editedVertices": sorted(GLB_BASIS_DELTAS),
        "maximumBasisDisplacement": max(
            Vector(delta).length for delta in GLB_BASIS_DELTAS.values()
        ),
        "shapeKeyRebase": "basis delta copied to every key",
    }
    bpy.context.scene[REQUIRED_PASS_MARKER]["basisEdited"] = True
    bpy.ops.wm.save_as_mainfile(filepath=bpy.data.filepath, check_existing=False)
    print(
        json.dumps(
            {
                "operation": "baseline-v1-pass-g1-perimeter",
                "blend": bpy.data.filepath,
                "editedVertices": summaries,
                "shapeKeysRebased": len(key_blocks) - 1,
            },
            indent=2,
        )
    )


apply_perimeter_correction()

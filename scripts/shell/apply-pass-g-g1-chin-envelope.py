"""Clear the final sampled chin-short area-envelope violation."""

import json

import bpy
from mathutils import Vector


EXPECTED_MESH_NAME = "IdentityShell"
TARGET_NAME = "identity_chin_short"
VERTEX_INDEX = 805
GLB_DELTA_REFINEMENT = (0.0, 0.002, 0.0)
REQUIRED_PASS_MARKER = "synmere_baseline_v1_pass_g1_perimeter"
PASS_MARKER = "synmere_baseline_v1_pass_g1_chin_envelope"


def glb_delta_to_blender(delta):
    return Vector((delta[0], -delta[2], delta[1]))


def apply_chin_envelope_refinement():
    shell = bpy.data.objects.get(EXPECTED_MESH_NAME)
    if shell is None or shell.data.shape_keys is None:
        raise RuntimeError("The identity shell or its shape keys are missing.")
    if not bpy.context.scene.get(REQUIRED_PASS_MARKER):
        raise RuntimeError("The perimeter correction must precede this refinement.")
    if bpy.context.scene.get(PASS_MARKER):
        raise RuntimeError("The chin envelope refinement is already applied.")

    key = shell.data.shape_keys.key_blocks.get(TARGET_NAME)
    if key is None:
        raise RuntimeError(f"Missing {TARGET_NAME}.")
    refinement = glb_delta_to_blender(GLB_DELTA_REFINEMENT)
    key.data[VERTEX_INDEX].co += refinement
    shell.data.update()
    bpy.context.scene[PASS_MARKER] = {
        "target": TARGET_NAME,
        "vertexIndex": VERTEX_INDEX,
        "glbDeltaRefinement": GLB_DELTA_REFINEMENT,
        "reason": "Raise the sampled minimum triangle area ratio above 0.35.",
    }
    bpy.ops.wm.save_as_mainfile(filepath=bpy.data.filepath, check_existing=False)
    print(
        json.dumps(
            {
                "operation": "baseline-v1-pass-g1-chin-envelope",
                "target": TARGET_NAME,
                "vertexIndex": VERTEX_INDEX,
                "glbDeltaRefinement": GLB_DELTA_REFINEMENT,
            },
            indent=2,
        )
    )


apply_chin_envelope_refinement()

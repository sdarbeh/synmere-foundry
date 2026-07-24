"""Test a bounded rear-surface inset on a disposable G1 Blender copy."""

import json
import sys

import bpy
from mathutils import Vector


EXPECTED_MESH_NAME = "IdentityShell"
VISIBLE_SURFACE_VERTEX_COUNT = 2939
INSET_SCALE = 0.985
GLB_VERTICAL_CENTER = -0.08


def get_region_path():
    if "--" not in sys.argv:
        raise RuntimeError("Rear-inset test requires the G0 region path.")
    arguments = sys.argv[sys.argv.index("--") + 1 :]
    if len(arguments) != 1:
        raise RuntimeError("Rear-inset test expects one region path.")
    return arguments[0]


def glb_position_from_blender(position):
    return Vector((position.x, position.z, -position.y))


def blender_position_from_glb(position):
    return Vector((position.x, -position.z, position.y))


def get_inset_delta(position):
    glb_position = glb_position_from_blender(position)
    inset = Vector(
        (
            glb_position.x * INSET_SCALE,
            GLB_VERTICAL_CENTER
            + (glb_position.y - GLB_VERTICAL_CENTER) * INSET_SCALE,
            glb_position.z,
        )
    )
    return blender_position_from_glb(inset) - position


def apply_rear_inset_test():
    with open(get_region_path(), encoding="utf-8") as source:
        region = json.load(source)
    approved = {
        vertex_index
        for vertex_index in region["approvedEditVertices"]
        if vertex_index >= VISIBLE_SURFACE_VERTEX_COUNT
    }
    shell = bpy.data.objects.get(EXPECTED_MESH_NAME)
    if shell is None or shell.data.shape_keys is None:
        raise RuntimeError("The identity shell or its shape keys are missing.")
    basis = shell.data.shape_keys.key_blocks["Basis"]
    deltas = {
        vertex_index: get_inset_delta(basis.data[vertex_index].co)
        for vertex_index in approved
    }
    for key in shell.data.shape_keys.key_blocks:
        for vertex_index, delta in deltas.items():
            key.data[vertex_index].co += delta
    shell.data.update()
    bpy.ops.wm.save_as_mainfile(filepath=bpy.data.filepath, check_existing=False)
    print(
        json.dumps(
            {
                "operation": "pass-g-g1-rear-inset-test",
                "blend": bpy.data.filepath,
                "insetScale": INSET_SCALE,
                "editedVertices": len(approved),
                "maximumBasisDisplacement": max(
                    delta.length for delta in deltas.values()
                ),
            },
            indent=2,
        )
    )


apply_rear_inset_test()

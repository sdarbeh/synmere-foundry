"""Render deterministic asset-review stills from the canonical Blender source."""

import math
import os
import sys

import bpy
from mathutils import Vector


EXPECTED_MESH_NAME = "IdentityShell"
RENDER_SIZE = 640
TARGET = Vector((0.0, 0.0, -0.08))
DEFAULT_ORTHOGRAPHIC_SCALE = 2.55
NOSE_REVIEW_TARGET = Vector((0.0, 0.0, -0.49))
NOSE_REVIEW_ORTHOGRAPHIC_SCALE = 0.72

PRODUCT_BASELINE_WEIGHTS = {
    "identity_face_wide": 0.26087,
    "identity_face_short": 0.28571,
    "identity_forehead_wide": 0.20132,
    "identity_upper_face_short": 0.24545,
    "identity_cheekbones_wide": 0.315,
    "identity_jaw_wide": 0.38182,
    "identity_jaw_taper_square": 0.21789,
}

PRESENTATION_WEIGHTS = {
    "raw": {},
    "balanced": {"presentation_structure_structured": 0.18},
    "structured": {"presentation_structure_structured": 0.72},
    "soft": {"presentation_structure_soft": 0.58},
}

CAMERA_POSITIONS = {
    "front": Vector((0.0, -4.2, -0.08)),
    "left-34": Vector((-2.2, -3.65, -0.08)),
    "right-34": Vector((2.2, -3.65, -0.08)),
    "left-profile": Vector((-3.7, -1.7, -0.08)),
}

NOSE_REVIEW_CAMERA_POSITIONS = {
    "nose-front": Vector((0.0, -4.2, -0.49)),
    "nose-left-34": Vector((-2.2, -3.65, -0.49)),
    "nose-right-34": Vector((2.2, -3.65, -0.49)),
}

MATERIALS = {
    "ceramic": {
        "color": (0.56, 0.57, 0.58, 1.0),
        "roughness": 0.86,
    },
    "obsidian": {
        "color": (0.018, 0.024, 0.032, 1.0),
        "roughness": 0.7,
    },
}


def get_output_directory():
    if "--" not in sys.argv:
        raise RuntimeError(
            "Expected an output directory after Blender's -- separator."
        )
    arguments = sys.argv[sys.argv.index("--") + 1 :]
    if len(arguments) != 1:
        raise RuntimeError("Expected exactly one output directory.")
    return os.path.abspath(arguments[0])


def point_at(item, target):
    item.rotation_euler = (target - item.location).to_track_quat("-Z", "Y").to_euler()


def add_area_light(name, location, energy, size):
    light_data = bpy.data.lights.new(name=name, type="AREA")
    light_data.energy = energy
    light_data.shape = "DISK"
    light_data.size = size
    light = bpy.data.objects.new(name, light_data)
    bpy.context.collection.objects.link(light)
    light.location = location
    point_at(light, TARGET)


def configure_scene():
    scene = bpy.context.scene
    scene.render.engine = "BLENDER_EEVEE_NEXT"
    scene.render.resolution_x = RENDER_SIZE
    scene.render.resolution_y = RENDER_SIZE
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.render.film_transparent = False
    scene.render.image_settings.color_mode = "RGBA"
    scene.render.image_settings.color_depth = "8"
    scene.render.resolution_percentage = 100
    scene.view_settings.look = "AgX - Medium High Contrast"

    if scene.world is None:
        scene.world = bpy.data.worlds.new("SynmereReviewWorld")
    scene.world.color = (0.0015, 0.0018, 0.0022)
    scene.world.use_nodes = True
    world_nodes = scene.world.node_tree.nodes
    world_nodes["Background"].inputs["Color"].default_value = (
        0.0015,
        0.0018,
        0.0022,
        1.0,
    )
    world_nodes["Background"].inputs["Strength"].default_value = 0.08

    camera_data = bpy.data.cameras.new("SynmereReviewCamera")
    camera_data.type = "ORTHO"
    camera_data.ortho_scale = DEFAULT_ORTHOGRAPHIC_SCALE
    camera = bpy.data.objects.new("SynmereReviewCamera", camera_data)
    bpy.context.collection.objects.link(camera)
    scene.camera = camera

    add_area_light(
        "SynmereKey",
        Vector((-2.7, -3.5, 3.0)),
        energy=820,
        size=3.0,
    )
    add_area_light(
        "SynmereFill",
        Vector((2.5, -2.7, 0.8)),
        energy=360,
        size=3.6,
    )
    add_area_light(
        "SynmereRim",
        Vector((1.6, 2.0, 2.1)),
        energy=520,
        size=2.4,
    )
    return camera


def configure_material(shell, material_id):
    material = shell.data.materials[0]
    material.use_nodes = True
    # Three.js product materials are front-sided; match that contract in Blender QA.
    material.use_backface_culling = True
    principled = material.node_tree.nodes.get("Principled BSDF")
    if principled is None:
        raise RuntimeError("IdentityCeramic has no Principled BSDF node.")
    settings = MATERIALS[material_id]
    principled.inputs["Base Color"].default_value = settings["color"]
    principled.inputs["Roughness"].default_value = settings["roughness"]
    principled.inputs["Metallic"].default_value = 0.0


def apply_weights(shell, identity_weights, presentation_id):
    shape_keys = shell.data.shape_keys.key_blocks
    for shape_key in shape_keys:
        shape_key.value = 0
    for name, weight in {
        **identity_weights,
        **PRESENTATION_WEIGHTS[presentation_id],
    }.items():
        shape_keys[name].value = weight


def render_view(
    output_directory,
    shell,
    camera,
    state_id,
    identity_weights,
    presentation_id,
    material_id,
    camera_id,
    camera_position=None,
    camera_target=TARGET,
    orthographic_scale=DEFAULT_ORTHOGRAPHIC_SCALE,
):
    apply_weights(shell, identity_weights, presentation_id)
    configure_material(shell, material_id)
    camera.data.ortho_scale = orthographic_scale
    camera.location = camera_position or CAMERA_POSITIONS[camera_id]
    point_at(camera, camera_target)
    bpy.context.scene.render.filepath = os.path.join(
        output_directory,
        f"{state_id}__{material_id}__{camera_id}.png",
    )
    bpy.ops.render.render(write_still=True)


def main():
    output_directory = get_output_directory()
    os.makedirs(output_directory, exist_ok=True)
    shell = bpy.data.objects.get(EXPECTED_MESH_NAME)
    if shell is None or shell.type != "MESH":
        raise RuntimeError(f"Missing {EXPECTED_MESH_NAME} mesh.")
    if shell.data.shape_keys is None:
        raise RuntimeError("IdentityShell has no shape keys.")

    camera = configure_scene()
    for camera_id in CAMERA_POSITIONS:
        render_view(
            output_directory,
            shell,
            camera,
            "raw-neutral",
            {},
            "raw",
            "ceramic",
            camera_id,
        )
        render_view(
            output_directory,
            shell,
            camera,
            "product-balanced",
            PRODUCT_BASELINE_WEIGHTS,
            "balanced",
            "ceramic",
            camera_id,
        )
        render_view(
            output_directory,
            shell,
            camera,
            "product-balanced",
            PRODUCT_BASELINE_WEIGHTS,
            "balanced",
            "obsidian",
            camera_id,
        )

    for presentation_id in ("structured", "soft"):
        for camera_id in ("front", "left-34"):
            render_view(
                output_directory,
                shell,
                camera,
                f"product-{presentation_id}",
                PRODUCT_BASELINE_WEIGHTS,
                presentation_id,
                "ceramic",
                camera_id,
            )

    for camera_id, camera_position in NOSE_REVIEW_CAMERA_POSITIONS.items():
        for material_id in ("ceramic", "obsidian"):
            render_view(
                output_directory,
                shell,
                camera,
                "product-balanced",
                PRODUCT_BASELINE_WEIGHTS,
                "balanced",
                material_id,
                camera_id,
                camera_position=camera_position,
                camera_target=NOSE_REVIEW_TARGET,
                orthographic_scale=NOSE_REVIEW_ORTHOGRAPHIC_SCALE,
            )

    print(
        f"Rendered Baseline v1 sculpt review stills to {output_directory}"
    )


main()

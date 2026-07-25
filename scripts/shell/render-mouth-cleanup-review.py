"""Render deterministic close mouth views for a local sculpt comparison."""

import os
import sys

import bpy
from mathutils import Vector


EXPECTED_MESH_NAME = "IdentityShell"
TARGET = Vector((0.0, 0.0, -0.71))
ORTHOGRAPHIC_SCALE = 0.72
RENDER_SIZE = 720
PRODUCT_BASELINE_WEIGHTS = {
    "identity_face_wide": 0.26087,
    "identity_face_short": 0.28571,
    "identity_forehead_wide": 0.20132,
    "identity_upper_face_short": 0.24545,
    "identity_cheekbones_wide": 0.315,
    "identity_jaw_wide": 0.38182,
    "identity_jaw_taper_square": 0.21789,
    "presentation_structure_structured": 0.18,
}
CAMERAS = {
    "front": Vector((0.0, -4.2, -0.71)),
    "left-24": Vector((-1.72, -3.83, -0.71)),
    "right-24": Vector((1.72, -3.83, -0.71)),
}


def get_output_directory():
    if "--" not in sys.argv:
        raise RuntimeError("Expected an output directory after Blender's --.")
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
    scene.render.image_settings.color_mode = "RGBA"
    scene.render.image_settings.color_depth = "8"
    scene.render.film_transparent = False
    scene.view_settings.look = "AgX - Medium High Contrast"

    if scene.world is None:
        scene.world = bpy.data.worlds.new("SynmereMouthReviewWorld")
    scene.world.use_nodes = True
    background = scene.world.node_tree.nodes["Background"]
    background.inputs["Color"].default_value = (0.0015, 0.0018, 0.0022, 1.0)
    background.inputs["Strength"].default_value = 0.08

    camera_data = bpy.data.cameras.new("SynmereMouthReviewCamera")
    camera_data.type = "ORTHO"
    camera_data.ortho_scale = ORTHOGRAPHIC_SCALE
    camera = bpy.data.objects.new("SynmereMouthReviewCamera", camera_data)
    bpy.context.collection.objects.link(camera)
    scene.camera = camera

    add_area_light(
        "SynmereMouthKey",
        Vector((-2.7, -3.5, 3.0)),
        energy=820,
        size=3.0,
    )
    add_area_light(
        "SynmereMouthFill",
        Vector((2.5, -2.7, 0.8)),
        energy=360,
        size=3.6,
    )
    add_area_light(
        "SynmereMouthRim",
        Vector((1.6, 2.0, 2.1)),
        energy=520,
        size=2.4,
    )
    return camera


def configure_shell(shell):
    for shape_key in shell.data.shape_keys.key_blocks:
        shape_key.value = PRODUCT_BASELINE_WEIGHTS.get(shape_key.name, 0)

    material = shell.data.materials[0]
    material.use_nodes = True
    material.use_backface_culling = True
    principled = material.node_tree.nodes.get("Principled BSDF")
    if principled is None:
        raise RuntimeError("IdentityCeramic has no Principled BSDF node.")
    principled.inputs["Base Color"].default_value = (0.56, 0.57, 0.58, 1.0)
    principled.inputs["Roughness"].default_value = 0.86
    principled.inputs["Metallic"].default_value = 0.0


def main():
    output_directory = get_output_directory()
    os.makedirs(output_directory, exist_ok=True)
    shell = bpy.data.objects.get(EXPECTED_MESH_NAME)
    if shell is None or shell.type != "MESH":
        raise RuntimeError(f"Missing {EXPECTED_MESH_NAME} mesh.")
    if shell.data.shape_keys is None:
        raise RuntimeError("IdentityShell has no shape keys.")

    configure_shell(shell)
    camera = configure_scene()
    for camera_id, position in CAMERAS.items():
        camera.location = position
        point_at(camera, TARGET)
        bpy.context.scene.render.filepath = os.path.join(
            output_directory,
            f"mouth-cleanup__product-balanced__{camera_id}.png",
        )
        bpy.ops.render.render(write_still=True)


main()

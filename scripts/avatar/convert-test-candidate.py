"""Convert a test avatar FBX candidate to GLB and capture light inspection data."""

import json
import math
import os
import sys

import bpy
from mathutils import Vector


def get_arguments():
    args = sys.argv
    if "--" not in args:
        raise RuntimeError("Expected Blender arguments after --.")

    payload = args[args.index("--") + 1 :]
    if len(payload) != 4:
        raise RuntimeError(
            "Expected source FBX, output GLB, report path, and review directory."
        )

    return payload


def clear_scene():
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete()


def get_scene_bounds(objects):
    mesh_objects = [obj for obj in objects if obj.type == "MESH"]
    if not mesh_objects:
        return None

    points = []
    for obj in mesh_objects:
        points.extend(obj.matrix_world @ Vector(corner) for corner in obj.bound_box)

    minimum = Vector(
        (
            min(point.x for point in points),
            min(point.y for point in points),
            min(point.z for point in points),
        )
    )
    maximum = Vector(
        (
            max(point.x for point in points),
            max(point.y for point in points),
            max(point.z for point in points),
        )
    )

    return {
        "minimum": [minimum.x, minimum.y, minimum.z],
        "maximum": [maximum.x, maximum.y, maximum.z],
        "center": [
            (minimum.x + maximum.x) / 2,
            (minimum.y + maximum.y) / 2,
            (minimum.z + maximum.z) / 2,
        ],
        "size": [maximum.x - minimum.x, maximum.y - minimum.y, maximum.z - minimum.z],
    }


def collect_inspection():
    objects = list(bpy.context.scene.objects)
    mesh_objects = [obj for obj in objects if obj.type == "MESH"]
    material_names = sorted(
        {
            slot.material.name
            for obj in mesh_objects
            for slot in obj.material_slots
            if slot.material
        }
    )
    shape_key_objects = [
        obj.name
        for obj in mesh_objects
        if obj.data.shape_keys and obj.data.shape_keys.key_blocks
    ]

    return {
        "objectNames": sorted(obj.name for obj in objects),
        "meshCount": len(mesh_objects),
        "meshNames": sorted(obj.name for obj in mesh_objects),
        "materialSlotCount": sum(len(obj.material_slots) for obj in mesh_objects),
        "materialNames": material_names,
        "shapeKeyObjectNames": sorted(shape_key_objects),
        "armatureNames": sorted(obj.name for obj in objects if obj.type == "ARMATURE"),
        "bounds": get_scene_bounds(objects),
    }


def frame_camera(camera, bounds, angle_degrees):
    center = Vector(bounds["center"])
    size = Vector(bounds["size"])
    radius = max(size.x, size.y, size.z) * 1.4
    angle = math.radians(angle_degrees)
    position = center + Vector((math.sin(angle) * radius, -math.cos(angle) * radius, radius * 0.25))

    camera.location = position
    direction = center - camera.location
    camera.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()
    camera.data.lens = 70


def render_reviews(review_directory, inspection):
    bounds = inspection.get("bounds")
    if not bounds:
        return []

    os.makedirs(review_directory, exist_ok=True)
    bpy.context.scene.render.engine = "BLENDER_EEVEE_NEXT"
    bpy.context.scene.render.resolution_x = 900
    bpy.context.scene.render.resolution_y = 900
    bpy.context.scene.render.resolution_percentage = 100
    bpy.context.scene.render.image_settings.file_format = "PNG"
    bpy.context.scene.world.color = (0.03, 0.03, 0.035)

    light_data = bpy.data.lights.new("AvatarCandidateKey", type="AREA")
    light = bpy.data.objects.new("AvatarCandidateKey", light_data)
    bpy.context.collection.objects.link(light)
    light.location = (-2.5, -3.5, 4)
    light.data.energy = 450
    light.data.size = 4

    camera_data = bpy.data.cameras.new("AvatarCandidateCamera")
    camera = bpy.data.objects.new("AvatarCandidateCamera", camera_data)
    bpy.context.collection.objects.link(camera)
    bpy.context.scene.camera = camera

    renders = []
    for name, angle in [
        ("front", 0),
        ("three-quarter", 35),
        ("side", 90),
        ("wireframe", 0),
    ]:
        for obj in bpy.context.scene.objects:
            if obj.type == "MESH":
                obj.display_type = "WIRE" if name == "wireframe" else "TEXTURED"

        frame_camera(camera, bounds, angle)
        filename = f"{name}.png"
        output_path = os.path.join(review_directory, filename)
        bpy.context.scene.render.filepath = output_path
        bpy.ops.render.render(write_still=True)
        renders.append(filename)

    return renders


def main():
    source_path, output_path, report_path, review_directory = get_arguments()

    clear_scene()
    bpy.ops.import_scene.fbx(filepath=source_path)

    inspection = collect_inspection()
    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    bpy.ops.export_scene.gltf(filepath=output_path, export_format="GLB")

    renders = []
    render_error = None
    try:
        renders = render_reviews(review_directory, inspection)
    except Exception as error:  # noqa: BLE001 - report render failures without blocking GLB output.
        render_error = str(error)

    os.makedirs(os.path.dirname(report_path), exist_ok=True)
    with open(report_path, "w", encoding="utf8") as report_file:
        json.dump(
            {
                "sourcePath": source_path,
                "outputPath": output_path,
                "inspection": inspection,
                "renders": renders,
                "renderError": render_error,
            },
            report_file,
            indent=2,
        )
        report_file.write("\n")


if __name__ == "__main__":
    main()

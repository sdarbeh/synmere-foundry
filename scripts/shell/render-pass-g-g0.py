"""Render the fixed-camera Pass G0 defect atlas without editing the source asset."""

import json
import os
import re
import sys

import bpy
from mathutils import Vector


EXPECTED_MESH_NAME = "IdentityShell"
EXPECTED_MATERIAL_NAME = "IdentityCeramic"

MATERIALS = {
    "ceramic": {
        "color": (0.56, 0.57, 0.58, 1.0),
        "roughness": 0.86,
    },
    "obsidian": {
        "color": (0.018, 0.024, 0.032, 1.0),
        "roughness": 0.7,
    },
    "diagnostic": {
        "color": (0.7, 0.72, 0.75, 1.0),
        "roughness": 0.9,
    },
}


def get_arguments():
    if "--" not in sys.argv:
        raise RuntimeError(
            "Expected config, geometry report, and output paths after --."
        )
    arguments = sys.argv[sys.argv.index("--") + 1 :]
    if len(arguments) not in {3, 4}:
        raise RuntimeError(
            "Expected config, geometry report, output directory, and optional mode."
        )
    paths = [os.path.abspath(argument) for argument in arguments[:3]]
    mode = arguments[3] if len(arguments) == 4 else "full"
    if mode not in {"full", "overlay-only"}:
        raise RuntimeError(f"Unsupported Pass G0 render mode: {mode}.")
    return [*paths, mode]


def load_json(file_path):
    with open(file_path, encoding="utf8") as input_file:
        return json.load(input_file)


def glb_to_blender(vector):
    # The audit config uses the renderer's Y-up glTF coordinate system.
    return Vector((vector[0], -vector[2], vector[1]))


def point_at(item, target):
    item.rotation_euler = (target - item.location).to_track_quat("-Z", "Y").to_euler()


def add_area_light(name, location, energy, size, target):
    light_data = bpy.data.lights.new(name=name, type="AREA")
    light_data.energy = energy
    light_data.shape = "DISK"
    light_data.size = size
    light = bpy.data.objects.new(name, light_data)
    bpy.context.collection.objects.link(light)
    light.location = location
    point_at(light, target)


def configure_scene(config):
    scene = bpy.context.scene
    review = config["review"]
    resolution = review["resolution"]
    scene.render.engine = "BLENDER_EEVEE_NEXT"
    scene.render.resolution_x = resolution
    scene.render.resolution_y = resolution
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGBA"
    scene.render.image_settings.color_depth = "8"
    scene.view_settings.look = "AgX - Medium High Contrast"

    if scene.world is None:
        scene.world = bpy.data.worlds.new("SynmerePassG0World")
    scene.world.use_nodes = True
    world_background = scene.world.node_tree.nodes["Background"]
    world_background.inputs["Color"].default_value = (
        0.0015,
        0.0018,
        0.0022,
        1.0,
    )
    world_background.inputs["Strength"].default_value = 0.08

    camera_data = bpy.data.cameras.new("SynmerePassG0Camera")
    camera_data.type = "ORTHO"
    camera_data.ortho_scale = review["orthographicScale"]
    camera = bpy.data.objects.new("SynmerePassG0Camera", camera_data)
    bpy.context.collection.objects.link(camera)
    scene.camera = camera

    target = glb_to_blender(review["target"])
    add_area_light(
        "SynmerePassG0Key",
        Vector((-2.7, -3.5, 3.0)),
        820,
        3.0,
        target,
    )
    add_area_light(
        "SynmerePassG0Fill",
        Vector((2.5, -2.7, 0.8)),
        360,
        3.6,
        target,
    )
    add_area_light(
        "SynmerePassG0Rim",
        Vector((1.6, 2.0, 2.1)),
        520,
        2.4,
        target,
    )
    return camera, target


def get_identity_shell():
    shell = bpy.data.objects.get(EXPECTED_MESH_NAME)
    if shell is None or shell.type != "MESH":
        raise RuntimeError(f"Missing {EXPECTED_MESH_NAME} mesh.")
    if [material.name for material in shell.data.materials] != [
        EXPECTED_MATERIAL_NAME
    ]:
        raise RuntimeError("Identity shell material contract changed.")
    if shell.data.shape_keys is None:
        raise RuntimeError("Identity shell has no shape keys.")
    return shell


def get_or_create_material(name, settings):
    material = bpy.data.materials.get(name)
    if material is None:
        material = bpy.data.materials.new(name)
    material.use_nodes = True
    material.use_backface_culling = True
    principled = material.node_tree.nodes.get("Principled BSDF")
    if principled is None:
        raise RuntimeError(f"{name} has no Principled BSDF node.")
    principled.inputs["Base Color"].default_value = settings["color"]
    principled.inputs["Roughness"].default_value = settings["roughness"]
    principled.inputs["Metallic"].default_value = 0.0
    return material


def configure_material(shell, material_id):
    material = shell.data.materials[0]
    material.use_nodes = True
    material.use_backface_culling = True
    principled = material.node_tree.nodes.get("Principled BSDF")
    if principled is None:
        raise RuntimeError("IdentityCeramic has no Principled BSDF node.")
    settings = MATERIALS[material_id]
    principled.inputs["Base Color"].default_value = settings["color"]
    principled.inputs["Roughness"].default_value = settings["roughness"]
    principled.inputs["Metallic"].default_value = 0.0


def apply_weights(shell, weights):
    shape_keys = shell.data.shape_keys.key_blocks
    for shape_key in shape_keys:
        shape_key.value = 0
    for name, weight in weights.items():
        if name not in shape_keys:
            raise RuntimeError(f"Missing audit shape key {name}.")
        shape_keys[name].value = weight


def sanitize(value):
    return re.sub(r"[^a-z0-9.-]+", "-", value.lower()).strip("-")


def get_state_definitions(config):
    states = [
        {"id": "raw-neutral", "weights": {}},
        {
            "id": "product-baseline",
            "weights": dict(config["productBaselineWeights"]),
        },
    ]
    for target in config["affectedMorphTargets"]:
        for sample in config["morphSamples"]:
            weights = dict(config["productBaselineWeights"])
            opposite = config["morphPairs"].get(target)
            if opposite is not None:
                weights[opposite] = 0
            weights[target] = sample
            states.append(
                {
                    "id": f"{target}__{sample:.2f}",
                    "target": target,
                    "sample": sample,
                    "weights": weights,
                }
            )
    for state in config["combinedStates"]:
        states.append(
            {
                "id": state["id"],
                "weights": {
                    **config["productBaselineWeights"],
                    **state["weights"],
                },
            }
        )
    return states


def render_view(
    output_directory,
    shell,
    camera,
    target,
    camera_id,
    camera_position,
    state,
    material_id,
    shading_id,
):
    apply_weights(shell, state["weights"])
    configure_material(shell, material_id)
    use_smooth = shading_id != "flat"
    for polygon in shell.data.polygons:
        polygon.use_smooth = use_smooth
    shell.data.update()

    camera.location = glb_to_blender(camera_position)
    point_at(camera, target)
    filename = (
        f"{sanitize(state['id'])}__{material_id}__"
        f"{camera_id}__{shading_id}.png"
    )
    bpy.context.scene.render.filepath = os.path.join(output_directory, filename)
    bpy.ops.render.render(write_still=True)
    return filename


def configure_defect_overlay(shell, suspect_faces):
    original_material = shell.data.materials[0]
    diagnostic = get_or_create_material(
        "SynmerePassG0Diagnostic",
        MATERIALS["diagnostic"],
    )
    alert = get_or_create_material(
        "SynmerePassG0Alert",
        {
            "color": (0.95, 0.06, 0.025, 1.0),
            "roughness": 0.72,
        },
    )
    while len(shell.data.materials) > 1:
        shell.data.materials.pop(index=len(shell.data.materials) - 1)
    shell.data.materials[0] = diagnostic
    shell.data.materials.append(alert)
    for polygon in shell.data.polygons:
        polygon.material_index = 1 if polygon.index in suspect_faces else 0
    return original_material


def reset_material_contract(shell, original_material):
    for polygon in shell.data.polygons:
        polygon.material_index = 0
        polygon.use_smooth = True
    while len(shell.data.materials) > 1:
        shell.data.materials.pop(index=len(shell.data.materials) - 1)
    shell.data.materials[0] = original_material
    shell.data.update()


def get_visible_faces(scene, camera, resolution):
    depsgraph = bpy.context.evaluated_depsgraph_get()
    depsgraph.update()
    forward = camera.matrix_world.to_quaternion() @ Vector((0.0, 0.0, -1.0))
    right = camera.matrix_world.to_quaternion() @ Vector((1.0, 0.0, 0.0))
    up = camera.matrix_world.to_quaternion() @ Vector((0.0, 1.0, 0.0))
    half_scale = camera.data.ortho_scale / 2
    visible_faces = set()

    # Orthographic rays make the visible-face audit deterministic across machines.
    for row in range(resolution):
        vertical = (0.5 - (row + 0.5) / resolution) * 2 * half_scale
        for column in range(resolution):
            horizontal = (
                ((column + 0.5) / resolution) - 0.5
            ) * 2 * half_scale
            origin = camera.location + right * horizontal + up * vertical
            hit, _, _, face_index, _, _ = scene.ray_cast(
                depsgraph,
                origin,
                forward,
                distance=20,
            )
            if hit and face_index >= 0:
                visible_faces.add(face_index)
    return visible_faces


def collect_visibility_evidence(config, shell, camera, target, output_directory):
    scene = bpy.context.scene
    cameras = config["review"]["cameras"]
    visible_surface_count = config["maximumEditScope"][
        "visibleSurfaceVertexCount"
    ]
    resolution = config["review"]["visibilityRayResolution"]
    evidence = {}
    union_back_faces = set()
    for camera_id, camera_position in cameras.items():
        camera.location = glb_to_blender(camera_position)
        point_at(camera, target)
        visible_faces = get_visible_faces(scene, camera, resolution)
        visible_back_faces = []
        for face_index in visible_faces:
            polygon = shell.data.polygons[face_index]
            if any(
                vertex_index >= visible_surface_count
                for vertex_index in polygon.vertices
            ):
                visible_back_faces.append(face_index)
        if camera_id != "front":
            union_back_faces.update(visible_back_faces)
        evidence[camera_id] = {
            "visibleFaceCount": len(visible_faces),
            "visibleBackOrPerimeterFaceCount": len(visible_back_faces),
            "visibleBackOrPerimeterFaces": sorted(visible_back_faces),
        }

    visibility_report = {
        "schemaVersion": config["schemaVersion"],
        "auditId": config["auditId"],
        "rayResolution": resolution,
        "cameras": evidence,
        "nonFrontVisibleBackOrPerimeterFaces": sorted(union_back_faces),
    }
    with open(
        os.path.join(output_directory, "visibility-report.json"),
        "w",
        encoding="utf8",
    ) as output_file:
        json.dump(visibility_report, output_file, indent=2)
        output_file.write("\n")
    return union_back_faces


def render_perimeter_visibility_overlay(
    output_directory,
    shell,
    camera,
    target,
    cameras,
    product_baseline,
    visible_back_faces,
):
    original_material = configure_defect_overlay(shell, visible_back_faces)
    rendered = []
    for camera_id, camera_position in cameras.items():
        apply_weights(shell, product_baseline["weights"])
        camera.location = glb_to_blender(camera_position)
        point_at(camera, target)
        filename = (
            f"perimeter-visibility-overlay__diagnostic__{camera_id}.png"
        )
        bpy.context.scene.render.filepath = os.path.join(
            output_directory,
            filename,
        )
        bpy.ops.render.render(write_still=True)
        rendered.append(filename)
    reset_material_contract(shell, original_material)
    return rendered


def main():
    config_path, report_path, output_directory, render_mode = get_arguments()
    config = load_json(config_path)
    report = load_json(report_path)
    os.makedirs(output_directory, exist_ok=True)
    shell = get_identity_shell()
    camera, target = configure_scene(config)
    states = get_state_definitions(config)
    cameras = config["review"]["cameras"]
    rendered = []

    if render_mode == "full":
        for state in states:
            for camera_id, camera_position in cameras.items():
                rendered.append(
                    render_view(
                        output_directory,
                        shell,
                        camera,
                        target,
                        camera_id,
                        camera_position,
                        state,
                        "ceramic",
                        "smooth",
                    )
                )

        # Material and shading comparisons stay limited to the baseline defect views.
        product_baseline = states[1]
        for camera_id, camera_position in cameras.items():
            rendered.append(
                render_view(
                    output_directory,
                    shell,
                    camera,
                    target,
                    camera_id,
                    camera_position,
                    product_baseline,
                    "obsidian",
                    "smooth",
                )
            )
            rendered.append(
                render_view(
                    output_directory,
                    shell,
                    camera,
                    target,
                    camera_id,
                    camera_position,
                    product_baseline,
                    "ceramic",
                    "flat",
                )
            )

    product_baseline = states[1]
    original_material = configure_defect_overlay(
        shell,
        set(report["suspectTopology"]["minimumG1RepairFaces"]),
    )
    for camera_id, camera_position in cameras.items():
        apply_weights(shell, product_baseline["weights"])
        camera.location = glb_to_blender(camera_position)
        point_at(camera, target)
        filename = f"defect-overlay__diagnostic__{camera_id}.png"
        bpy.context.scene.render.filepath = os.path.join(
            output_directory,
            filename,
        )
        bpy.ops.render.render(write_still=True)
        if filename not in rendered:
            rendered.append(filename)

    reset_material_contract(shell, original_material)
    apply_weights(shell, product_baseline["weights"])
    visible_back_faces = collect_visibility_evidence(
        config,
        shell,
        camera,
        target,
        output_directory,
    )
    visibility_renders = render_perimeter_visibility_overlay(
        output_directory,
        shell,
        camera,
        target,
        cameras,
        product_baseline,
        visible_back_faces,
    )
    for filename in visibility_renders:
        if filename not in rendered:
            rendered.append(filename)

    manifest_path = os.path.join(output_directory, "render-manifest.json")
    if render_mode == "overlay-only" and os.path.exists(manifest_path):
        manifest = load_json(manifest_path)
        for filename in visibility_renders:
            if filename not in manifest["renders"]:
                manifest["renders"].append(filename)
        manifest["renderCount"] = len(manifest["renders"])
    else:
        manifest = {
            "schemaVersion": config["schemaVersion"],
            "auditId": config["auditId"],
            "sourceBlend": bpy.data.filepath,
            "resolution": config["review"]["resolution"],
            "cameraIds": list(cameras.keys()),
            "stateCount": len(states),
            "renderCount": len(rendered),
            "renders": rendered,
        }
    with open(
        manifest_path,
        "w",
        encoding="utf8",
    ) as output_file:
        json.dump(manifest, output_file, indent=2)
        output_file.write("\n")

    print(json.dumps(manifest, indent=2))


main()

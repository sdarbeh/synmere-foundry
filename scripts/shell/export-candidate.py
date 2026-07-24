"""Export the canonical Synmere shell without applying topology-changing operations."""

import json
import os
import sys

import bpy


EXPECTED_MESH_NAME = "IdentityShell"
EXPECTED_MATERIAL_NAME = "IdentityCeramic"


def get_output_path():
    if "--" not in sys.argv:
        raise RuntimeError(
            "Usage: blender canonical.blend --background "
            "--python export-candidate.py -- <candidate.glb>"
        )
    arguments = sys.argv[sys.argv.index("--") + 1 :]
    if len(arguments) != 1:
        raise RuntimeError("Expected one candidate GLB output path.")
    return arguments[0]


def get_identity_shell():
    matches = [
        item
        for item in bpy.data.objects
        if item.type == "MESH" and item.name == EXPECTED_MESH_NAME
    ]
    if len(matches) != 1:
        raise RuntimeError(
            f"Expected one {EXPECTED_MESH_NAME} mesh, found {len(matches)}."
        )
    return matches[0]


def main():
    output_path = get_output_path()
    shell = get_identity_shell()
    if [material.name for material in shell.data.materials] != [
        EXPECTED_MATERIAL_NAME
    ]:
        raise RuntimeError("The canonical material-slot contract has changed.")
    if shell.data.shape_keys is None:
        raise RuntimeError("The canonical shell has no shape keys.")
    if any(modifier.show_render for modifier in shell.modifiers):
        raise RuntimeError(
            "Disable renderable modifiers before exporting the canonical shell."
        )

    # Imported glTF corner normals can force Blender to split otherwise shared vertices.
    custom_normal = shell.data.attributes.get("custom_normal")
    if custom_normal is not None:
        shell.data.attributes.remove(custom_normal)
    for polygon in shell.data.polygons:
        polygon.use_smooth = True
    shell.data.update()

    for shape_key in shell.data.shape_keys.key_blocks:
        shape_key.value = 0

    bpy.ops.object.select_all(action="DESELECT")
    shell.select_set(True)
    bpy.context.view_layer.objects.active = shell
    os.makedirs(os.path.dirname(output_path), exist_ok=True)

    bpy.ops.export_scene.gltf(
        filepath=output_path,
        export_format="GLB",
        use_selection=True,
        export_yup=True,
        export_apply=False,
        export_materials="EXPORT",
        export_morph=True,
        export_morph_normal=False,
        export_shared_accessors=True,
        export_animations=False,
        export_skins=False,
        export_cameras=False,
        export_lights=False,
        export_extras=True,
    )

    print(
        json.dumps(
            {
                "output": output_path,
                "mesh": shell.name,
                "vertices": len(shell.data.vertices),
                "shapeKeys": [
                    shape_key.name
                    for shape_key in shell.data.shape_keys.key_blocks[1:]
                ],
            },
            indent=2,
        )
    )


main()

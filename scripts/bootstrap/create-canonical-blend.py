"""One-time import of the current production shell into its canonical Blender source."""

import json
import os
import sys

import bpy


EXPECTED_MESH_NAME = "IdentityShell"
EXPECTED_MATERIAL_NAME = "IdentityCeramic"


def get_arguments():
    if "--" not in sys.argv:
        raise RuntimeError(
            "Usage: blender --background --python create-canonical-blend.py "
            "-- <production.glb> <canonical.blend>"
        )
    arguments = sys.argv[sys.argv.index("--") + 1 :]
    if len(arguments) != 2:
        raise RuntimeError("Expected a GLB input and Blender output path.")
    return arguments


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
    source_path, output_path = get_arguments()
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=source_path)

    shell = get_identity_shell()
    material_names = [material.name for material in shell.data.materials]
    if material_names != [EXPECTED_MATERIAL_NAME]:
        raise RuntimeError(
            f"Expected material slot {EXPECTED_MATERIAL_NAME}, found {material_names}."
        )
    shape_keys = shell.data.shape_keys
    if shape_keys is None or len(shape_keys.key_blocks) <= 1:
        raise RuntimeError("The imported shell does not contain its authored shape keys.")

    # Keep the imported coordinate system and data contract untouched.
    shell.data.name = EXPECTED_MESH_NAME
    shell["synmere_source_role"] = "canonical-blender-source"
    shell["synmere_basis_revision"] = 1

    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=output_path, check_existing=False)

    print(
        json.dumps(
            {
                "source": source_path,
                "output": output_path,
                "mesh": shell.name,
                "materialSlots": material_names,
                "vertices": len(shell.data.vertices),
                "shapeKeys": [
                    shape_key.name for shape_key in shape_keys.key_blocks[1:]
                ],
            },
            indent=2,
        )
    )


main()

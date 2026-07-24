"""Snapshot or rebase shape keys after a topology-safe Basis sculpt."""

import hashlib
import json
import os
import sys

import bpy
import numpy


EXPECTED_MESH_NAME = "IdentityShell"


def get_arguments():
    if "--" not in sys.argv:
        raise RuntimeError(
            "Usage: blender identity-shell-v1.blend --background "
            "--python rebase-shape-keys.py -- <snapshot|apply> <snapshot.npz>"
        )
    arguments = sys.argv[sys.argv.index("--") + 1 :]
    if len(arguments) != 2 or arguments[0] not in {"snapshot", "apply"}:
        raise RuntimeError("Expected snapshot|apply and a snapshot path.")
    return arguments


def get_shell_and_shape_keys():
    shell = bpy.data.objects.get(EXPECTED_MESH_NAME)
    if shell is None or shell.type != "MESH":
        raise RuntimeError(f"Missing {EXPECTED_MESH_NAME} mesh.")
    if shell.data.shape_keys is None:
        raise RuntimeError("IdentityShell has no shape keys.")
    return shell, shell.data.shape_keys.key_blocks


def get_coordinates(shape_key, vertex_count):
    coordinates = numpy.empty(vertex_count * 3, dtype=numpy.float32)
    shape_key.data.foreach_get("co", coordinates)
    return coordinates.reshape((vertex_count, 3))


def snapshot_shape_keys(snapshot_path):
    shell, shape_keys = get_shell_and_shape_keys()
    vertex_count = len(shell.data.vertices)
    names = [shape_key.name for shape_key in shape_keys[1:]]
    payload = {
        "vertex_count": numpy.array([vertex_count], dtype=numpy.int32),
        "names": numpy.array(names),
        "basis": get_coordinates(shape_keys[0], vertex_count),
    }
    for index, shape_key in enumerate(shape_keys[1:]):
        payload[f"key_{index:03d}"] = get_coordinates(shape_key, vertex_count)

    os.makedirs(os.path.dirname(snapshot_path), exist_ok=True)
    numpy.savez_compressed(snapshot_path, **payload)
    print(
        json.dumps(
            {
                "operation": "snapshot",
                "snapshot": snapshot_path,
                "vertices": vertex_count,
                "shapeKeys": names,
            },
            indent=2,
        )
    )


def apply_basis_delta(snapshot_path):
    shell, shape_keys = get_shell_and_shape_keys()
    vertex_count = len(shell.data.vertices)
    with numpy.load(snapshot_path, allow_pickle=False) as snapshot:
        original_vertex_count = int(snapshot["vertex_count"][0])
        original_names = snapshot["names"].tolist()
        current_names = [shape_key.name for shape_key in shape_keys[1:]]
        if original_vertex_count != vertex_count:
            raise RuntimeError("Vertex count changed after the Basis sculpt.")
        if original_names != current_names:
            raise RuntimeError("Shape-key names or order changed after the Basis sculpt.")

        current_basis = get_coordinates(shape_keys[0], vertex_count)
        basis_delta = current_basis - snapshot["basis"]
        for index, shape_key in enumerate(shape_keys[1:]):
            rebased = snapshot[f"key_{index:03d}"] + basis_delta
            shape_key.data.foreach_set("co", rebased.reshape(-1))

    shell.data.update()
    with open(snapshot_path, "rb") as snapshot_file:
        shell["synmere_shape_key_snapshot_sha256"] = hashlib.sha256(
            snapshot_file.read()
        ).hexdigest()
    bpy.ops.wm.save_as_mainfile(filepath=bpy.data.filepath, check_existing=False)
    print(
        json.dumps(
            {
                "operation": "apply",
                "snapshot": snapshot_path,
                "blend": bpy.data.filepath,
                "vertices": vertex_count,
                "shapeKeys": original_names,
            },
            indent=2,
        )
    )


operation, snapshot_path = get_arguments()
if operation == "snapshot":
    snapshot_shape_keys(snapshot_path)
else:
    apply_basis_delta(snapshot_path)

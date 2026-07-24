"""Apply the topology-preserving Pass G1.1a head-depth repair."""

import hashlib
import json
import sys
from pathlib import Path

import bpy
from mathutils import Vector


EXPECTED_MESH_NAME = "IdentityShell"
EXPECTED_VERTEX_COUNT = 6136
EXPECTED_SHAPE_KEY_COUNT = 37
PASS_MARKER = "synmere_baseline_v1_pass_g11a"


def get_script_arguments():
    if "--" not in sys.argv:
        raise RuntimeError("Pass G1.1a requires a repair plan path.")
    arguments = sys.argv[sys.argv.index("--") + 1 :]
    if len(arguments) != 1:
        raise RuntimeError("Pass G1.1a expects exactly one repair plan path.")
    return Path(arguments[0]).resolve()


def get_file_sha256(path):
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def glb_delta_to_blender(delta):
    # glTF exports Blender (x, y-depth, z-height) as (x, z-height, -y-depth).
    return Vector((delta[0], -delta[2], delta[1]))


def get_identity_shell():
    shell = bpy.data.objects.get(EXPECTED_MESH_NAME)
    if shell is None or shell.type != "MESH":
        raise RuntimeError(f"Missing {EXPECTED_MESH_NAME} mesh.")
    if len(shell.data.vertices) != EXPECTED_VERTEX_COUNT:
        raise RuntimeError("The canonical vertex count changed before G1.1a.")
    if shell.data.shape_keys is None:
        raise RuntimeError("The canonical shell has no shape keys.")
    if len(shell.data.shape_keys.key_blocks) - 1 != EXPECTED_SHAPE_KEY_COUNT:
        raise RuntimeError("The canonical morph count changed before G1.1a.")
    return shell


def capture_coordinates(shell):
    return {
        key.name: [point.co.copy() for point in key.data]
        for key in shell.data.shape_keys.key_blocks
    }


def apply_repairs(shell, plan):
    basis = shell.data.shape_keys.key_blocks["Basis"]
    changed_by_key = {}
    summaries = []
    for repair in plan["repairs"]:
        key = shell.data.shape_keys.key_blocks.get(repair["target"])
        if key is None:
            raise RuntimeError(f"Missing shape key {repair['target']}.")
        changed = set()
        maximum_delta_change = 0.0
        for entry in repair["deltas"]:
            vertex_index = entry["vertexIndex"]
            next_delta = glb_delta_to_blender(entry["value"])
            previous_delta = key.data[vertex_index].co - basis.data[vertex_index].co
            key.data[vertex_index].co = basis.data[vertex_index].co + next_delta
            maximum_delta_change = max(
                maximum_delta_change,
                (next_delta - previous_delta).length,
            )
            changed.add(vertex_index)
        changed_by_key[key.name] = changed
        summaries.append(
            {
                "target": key.name,
                "changedVertices": len(changed),
                "maximumDeltaChange": maximum_delta_change,
                "method": repair["method"],
            }
        )
    return changed_by_key, summaries


def validate_unchanged_coordinates(before, shell, changed_by_key, epsilon):
    maximum_frozen_displacement = 0.0
    for key in shell.data.shape_keys.key_blocks:
        changed = changed_by_key.get(key.name, set())
        for vertex_index, point in enumerate(key.data):
            if vertex_index in changed:
                continue
            maximum_frozen_displacement = max(
                maximum_frozen_displacement,
                (point.co - before[key.name][vertex_index]).length,
            )
    if maximum_frozen_displacement > epsilon:
        raise RuntimeError("Pass G1.1a moved a frozen vertex.")
    return maximum_frozen_displacement


def apply_pass_g11a():
    plan_path = get_script_arguments()
    with plan_path.open("r", encoding="utf-8") as source:
        plan = json.load(source)
    blend_path = Path(bpy.data.filepath).resolve()
    if get_file_sha256(blend_path) != plan["sourceBlendSha256"]:
        raise RuntimeError("The G1.1a plan does not match the canonical source.")

    shell = get_identity_shell()
    before = capture_coordinates(shell)
    changed_by_key, summaries = apply_repairs(shell, plan)
    maximum_frozen_displacement = validate_unchanged_coordinates(
        before,
        shell,
        changed_by_key,
        plan["comparisonEpsilon"],
    )
    shell.data.update()
    bpy.context.scene[PASS_MARKER] = {
        "plan": str(plan_path),
        "approvedEditVertexCount": plan["approvedEditVertexCount"],
        "comparisonEpsilon": plan["comparisonEpsilon"],
        "targets": [summary["target"] for summary in summaries],
    }
    bpy.ops.wm.save_as_mainfile(filepath=bpy.data.filepath, check_existing=False)
    print(
        json.dumps(
            {
                "operation": "baseline-v1-pass-g11a-head-depth",
                "blend": bpy.data.filepath,
                "basisEdited": False,
                "maximumFrozenVertexDisplacement": maximum_frozen_displacement,
                "repairs": summaries,
            },
            indent=2,
        )
    )


apply_pass_g11a()

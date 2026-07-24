"""Apply an approved morph-only safety plan to an isolated shell candidate."""

import hashlib
import json
import os
import sys

import bpy
from mathutils import Vector


MESH_NAME = "IdentityShell"
EXPECTED_VERTICES = 6052
EXPECTED_FACES = 12100
EXPECTED_MORPHS = 37
POSITION_EPSILON = 1e-7


def arguments():
    values = sys.argv[sys.argv.index("--") + 1 :]
    if len(values) != 3:
        raise RuntimeError("Expected plan, output blend, and report paths.")
    return [os.path.abspath(value) for value in values]


def digest(file_path):
    checksum = hashlib.sha256()
    with open(file_path, "rb") as input_file:
        for chunk in iter(lambda: input_file.read(1024 * 1024), b""):
            checksum.update(chunk)
    return checksum.hexdigest()


def snapshot(shell):
    keys = shell.data.shape_keys.key_blocks
    basis = [point.co.copy() for point in keys["Basis"].data]
    return {
        "basis": basis,
        "faces": [
            tuple(polygon.vertices) for polygon in shell.data.polygons
        ],
        "materials": [
            slot.material.name if slot.material else None
            for slot in shell.material_slots
        ],
        "keyNames": [key.name for key in keys[1:]],
        "deltas": {
            key.name: [
                point.co - basis[index]
                for index, point in enumerate(key.data)
            ]
            for key in keys[1:]
        },
    }


def maximum_distance(first, second):
    return max(
        ((left - right).length for left, right in zip(first, second)),
        default=0.0,
    )


def main():
    plan_path, output_path, report_path = arguments()
    with open(plan_path, encoding="utf8") as plan_file:
        plan = json.load(plan_file)
    if not plan["decision"]["safeToApply"]:
        raise RuntimeError("Repair plan is not approved for application.")
    if os.path.abspath(bpy.data.filepath) != os.path.abspath(
        plan["sourceBlend"]
    ):
        raise RuntimeError("Loaded source does not match the repair plan.")
    shell = bpy.data.objects.get(MESH_NAME)
    if shell is None or shell.type != "MESH":
        raise RuntimeError(f"Missing {MESH_NAME} mesh.")
    before = snapshot(shell)
    if (
        len(shell.data.vertices) != EXPECTED_VERTICES
        or len(shell.data.polygons) != EXPECTED_FACES
        or len(before["keyNames"]) != EXPECTED_MORPHS
    ):
        raise RuntimeError("Source asset contract does not match.")

    targets = {target["name"]: target for target in plan["targets"]}
    keys = shell.data.shape_keys.key_blocks
    changed_pairs = 0
    for target_name, target in targets.items():
        key = keys.get(target_name)
        if key is None:
            raise RuntimeError(f"Missing target morph {target_name}.")
        planned_vertices = set(target["changedVertices"])
        delta_rows = {
            row["vertex"]: Vector(row["value"])
            for row in target["changedDeltas"]
        }
        if set(delta_rows) != planned_vertices:
            raise RuntimeError(
                f"Delta rows do not match {target_name} vertex scope."
            )
        for vertex, value in delta_rows.items():
            key.data[vertex].co = before["basis"][vertex] + value
            changed_pairs += 1

    after = snapshot(shell)
    if maximum_distance(before["basis"], after["basis"]) > POSITION_EPSILON:
        raise RuntimeError("Basis moved during morph-only repair.")
    if before["faces"] != after["faces"]:
        raise RuntimeError("Topology or winding changed during repair.")
    if before["materials"] != after["materials"]:
        raise RuntimeError("Material contract changed during repair.")
    if before["keyNames"] != after["keyNames"]:
        raise RuntimeError("Morph names or order changed during repair.")

    unrelated_maximum_movement = 0.0
    outside_scope_maximum_movement = 0.0
    for key_name in before["keyNames"]:
        allowed = set(targets.get(key_name, {}).get("changedVertices", []))
        for vertex, (old_delta, new_delta) in enumerate(
            zip(before["deltas"][key_name], after["deltas"][key_name])
        ):
            distance = (old_delta - new_delta).length
            if key_name not in targets:
                unrelated_maximum_movement = max(
                    unrelated_maximum_movement,
                    distance,
                )
            elif vertex not in allowed:
                outside_scope_maximum_movement = max(
                    outside_scope_maximum_movement,
                    distance,
                )
    if unrelated_maximum_movement > POSITION_EPSILON:
        raise RuntimeError("An unrelated morph changed.")
    if outside_scope_maximum_movement > POSITION_EPSILON:
        raise RuntimeError("A target morph changed outside its approved scope.")

    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=output_path)
    report = {
        "schemaVersion": "v1",
        "operation": "apply-global-morph-safety-repair",
        "sourceBlend": plan["sourceBlend"],
        "sourceSha256": digest(plan["sourceBlend"]),
        "candidateBlend": output_path,
        "candidateSha256": digest(output_path),
        "contract": {
            "vertices": len(shell.data.vertices),
            "faces": len(shell.data.polygons),
            "morphs": len(before["keyNames"]),
            "basisMaximumMovement": maximum_distance(
                before["basis"],
                after["basis"],
            ),
            "unrelatedMorphMaximumMovement": (
                unrelated_maximum_movement
            ),
            "outsideScopeMaximumMovement": (
                outside_scope_maximum_movement
            ),
            "topologyUnchanged": before["faces"] == after["faces"],
            "materialsUnchanged": (
                before["materials"] == after["materials"]
            ),
            "morphOrderUnchanged": (
                before["keyNames"] == after["keyNames"]
            ),
        },
        "targets": list(targets),
        "changedMorphVertexPairs": changed_pairs,
        "promotionApproved": False,
    }
    os.makedirs(os.path.dirname(report_path), exist_ok=True)
    with open(report_path, "w", encoding="utf8") as report_file:
        json.dump(report, report_file, indent=2)
        report_file.write("\n")
    print(json.dumps(report, indent=2))


main()

"""Create the identity-shell-v1 mouth-cleanup revision from Baseline 1.0.0.

The pass is intentionally local:
- X coordinates never move, preserving width and silhouette.
- Only the mouth/philtrum envelope can receive a displacement.
- Every Basis displacement is copied to every shape key, preserving morph deltas.
- Topology, materials, and shape-key values are left unchanged.
"""

import hashlib
import json
import math
import os
import sys

import bpy
from mathutils import Vector
from mathutils.kdtree import KDTree


EXPECTED_BASELINE_SHA256 = (
    "026913c5c6732a06976f5e01abe320f30c5c1a08814c178366eaa979133e2247"
)
EXPECTED_MESH_NAME = "IdentityShell"
EXPECTED_VERTEX_COUNT = 6052
EXPECTED_POLYGON_COUNT = 12100
EXPECTED_SHAPE_KEY_COUNT = 38
REVISION_MARKER = "synmere_identity_shell_v1_mouth_cleanup"

MAXIMUM_X = 0.285
MINIMUM_Z = -0.845
MAXIMUM_Z = -0.590
MAXIMUM_Y = -0.280
MAXIMUM_DISPLACEMENT = 0.028


def get_report_path():
    if "--" not in sys.argv:
        raise RuntimeError("Expected a report path after Blender's --.")
    arguments = sys.argv[sys.argv.index("--") + 1 :]
    if len(arguments) != 1:
        raise RuntimeError("Expected exactly one report path.")
    return os.path.abspath(arguments[0])


def sha256_file(path):
    digest = hashlib.sha256()
    with open(path, "rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def ellipse_weight(x, z, center_x, center_z, radius_x, radius_z):
    normalized = math.sqrt(
        ((x - center_x) / radius_x) ** 2
        + ((z - center_z) / radius_z) ** 2
    )
    if normalized >= 1.0:
        return 0.0
    linear = 1.0 - normalized
    return linear * linear * (3.0 - 2.0 * linear)


def build_adjacency(mesh):
    adjacency = [set() for _ in mesh.vertices]
    for edge in mesh.edges:
        first, second = edge.vertices
        adjacency[first].add(second)
        adjacency[second].add(first)
    return adjacency


def local_allowed(position):
    return (
        abs(position.x) <= MAXIMUM_X
        and MINIMUM_Z <= position.z <= MAXIMUM_Z
        and position.y <= MAXIMUM_Y
    )


def smooth_region(positions, adjacency, weight_function, strength, iterations):
    current = [position.copy() for position in positions]
    for _ in range(iterations):
        updated = [position.copy() for position in current]
        for index, position in enumerate(current):
            weight = weight_function(position)
            if weight <= 0.0 or not local_allowed(position):
                continue
            neighbors = adjacency[index]
            if not neighbors:
                continue
            average_y = sum(current[item].y for item in neighbors) / len(neighbors)
            average_z = sum(current[item].z for item in neighbors) / len(neighbors)
            factor = strength * weight
            updated[index].y += (average_y - position.y) * factor
            updated[index].z += (average_z - position.z) * factor
        current = updated
    return current


def symmetrize_yz(positions, original_positions):
    tree = KDTree(len(original_positions))
    for index, position in enumerate(original_positions):
        tree.insert(position, index)
    tree.balance()

    completed = set()
    for index, original in enumerate(original_positions):
        if index in completed or abs(original.x) < 0.001:
            continue
        _, mirror_index, distance = tree.find((-original.x, original.y, original.z))
        if distance > 0.004 or mirror_index == index:
            continue
        average_y = (positions[index].y + positions[mirror_index].y) * 0.5
        average_z = (positions[index].z + positions[mirror_index].z) * 0.5
        positions[index].y = average_y
        positions[index].z = average_z
        positions[mirror_index].y = average_y
        positions[mirror_index].z = average_z
        completed.add(index)
        completed.add(mirror_index)


def main():
    report_path = get_report_path()
    blend_path = bpy.data.filepath
    if not blend_path:
        raise RuntimeError("The cleanup pass must run against a saved .blend file.")

    baseline_sha = sha256_file(blend_path)
    if baseline_sha != EXPECTED_BASELINE_SHA256:
        raise RuntimeError(
            "Mouth cleanup must start from the promoted Baseline 1.0.0 source. "
            f"Expected {EXPECTED_BASELINE_SHA256}, received {baseline_sha}."
        )

    scene = bpy.context.scene
    if REVISION_MARKER in scene:
        raise RuntimeError("The mouth-cleanup revision is already applied.")

    shell = bpy.data.objects.get(EXPECTED_MESH_NAME)
    if shell is None or shell.type != "MESH":
        raise RuntimeError(f"Missing {EXPECTED_MESH_NAME} mesh.")
    mesh = shell.data
    if len(mesh.vertices) != EXPECTED_VERTEX_COUNT:
        raise RuntimeError(f"Unexpected vertex count: {len(mesh.vertices)}")
    if len(mesh.polygons) != EXPECTED_POLYGON_COUNT:
        raise RuntimeError(f"Unexpected polygon count: {len(mesh.polygons)}")
    if mesh.shape_keys is None:
        raise RuntimeError("IdentityShell has no shape keys.")

    shape_keys = list(mesh.shape_keys.key_blocks)
    if len(shape_keys) != EXPECTED_SHAPE_KEY_COUNT:
        raise RuntimeError(f"Unexpected shape-key count: {len(shape_keys)}")
    basis = shape_keys[0]
    if basis.name != "Basis":
        raise RuntimeError("The first shape key must be Basis.")

    material_names_before = [
        material.name if material is not None else None for material in mesh.materials
    ]
    shape_key_values_before = {
        shape_key.name: shape_key.value for shape_key in shape_keys
    }
    original_positions = [item.co.copy() for item in basis.data]
    original_morph_deltas = {
        shape_key.name: [
            shape_key.data[index].co - original_positions[index]
            for index in range(len(original_positions))
        ]
        for shape_key in shape_keys[1:]
    }
    adjacency = build_adjacency(mesh)

    upper_weight = lambda position: (
        ellipse_weight(position.x, position.z, 0.0, -0.665, 0.270, 0.115)
        if position.z >= -0.730
        else 0.0
    )
    lower_weight = lambda position: (
        ellipse_weight(position.x, position.z, 0.0, -0.782, 0.270, 0.105)
        if position.z <= -0.715
        else 0.0
    )
    corner_weight = lambda position: max(
        ellipse_weight(abs(position.x), position.z, 0.232, -0.720, 0.062, 0.082),
        0.0,
    )
    philtrum_weight = lambda position: (
        ellipse_weight(position.x, position.z, 0.0, -0.625, 0.125, 0.050)
        if position.z >= -0.680
        else 0.0
    )

    revised = smooth_region(
        original_positions,
        adjacency,
        upper_weight,
        strength=0.32,
        iterations=4,
    )
    revised = smooth_region(
        revised,
        adjacency,
        lower_weight,
        strength=0.38,
        iterations=5,
    )
    revised = smooth_region(
        revised,
        adjacency,
        corner_weight,
        strength=0.45,
        iterations=3,
    )
    revised = smooth_region(
        revised,
        adjacency,
        philtrum_weight,
        strength=0.22,
        iterations=3,
    )

    # Bring the recessed seam forward, then compress its visible height. This
    # removes the cut-in look while retaining a readable, sealed mouth line.
    for index, position in enumerate(revised):
        if not local_allowed(original_positions[index]):
            continue
        seam = ellipse_weight(
            original_positions[index].x,
            original_positions[index].z,
            0.0,
            -0.721,
            0.260,
            0.046,
        )
        corners = ellipse_weight(
            abs(original_positions[index].x),
            original_positions[index].z,
            0.238,
            -0.721,
            0.055,
            0.068,
        )
        recessed = min(
            1.0,
            max(0.0, (original_positions[index].y + 0.420) / 0.120),
        )
        revised[index].y -= (
            0.0040 * seam
            + 0.0240 * seam * recessed
            + 0.0120 * corners * recessed
        )

        front_facing = min(
            1.0,
            max(0.0, (-original_positions[index].y - 0.350) / 0.085),
        )
        seam_center_z = -0.722 + 0.0025 * (
            abs(original_positions[index].x) / 0.260
        ) ** 2
        revised[index].z += (
            seam_center_z - revised[index].z
        ) * 0.34 * seam * front_facing

        upper_volume = ellipse_weight(
            original_positions[index].x,
            original_positions[index].z,
            0.0,
            -0.665,
            0.245,
            0.075,
        )
        lower_volume = ellipse_weight(
            original_positions[index].x,
            original_positions[index].z,
            0.0,
            -0.780,
            0.250,
            0.082,
        )
        revised[index].y -= (
            0.0030 * upper_volume + 0.0050 * lower_volume
        )

    symmetrize_yz(revised, original_positions)

    changed_indices = []
    displacements = []
    clamped_vertex_count = 0
    for index, original in enumerate(original_positions):
        delta = revised[index] - original
        delta.x = 0.0
        if delta.length <= 1e-8:
            continue
        if not local_allowed(original):
            raise RuntimeError(f"Vertex {index} moved outside the cleanup envelope.")
        if delta.length > MAXIMUM_DISPLACEMENT:
            delta *= MAXIMUM_DISPLACEMENT / delta.length
            clamped_vertex_count += 1
        changed_indices.append(index)
        displacements.append(delta.copy())
        basis.data[index].co = original + delta
        for shape_key in shape_keys[1:]:
            shape_key.data[index].co += delta

    if not changed_indices:
        raise RuntimeError("The cleanup pass did not move any vertices.")

    maximum_morph_delta_drift = 0.0
    for shape_key in shape_keys[1:]:
        for index, revised_basis_item in enumerate(basis.data):
            revised_delta = shape_key.data[index].co - revised_basis_item.co
            drift = (
                revised_delta - original_morph_deltas[shape_key.name][index]
            ).length
            maximum_morph_delta_drift = max(maximum_morph_delta_drift, drift)

    if maximum_morph_delta_drift > 1e-6:
        raise RuntimeError(
            "Morph deltas changed during cleanup: "
            f"{maximum_morph_delta_drift:.9f}"
        )
    if material_names_before != [
        material.name if material is not None else None for material in mesh.materials
    ]:
        raise RuntimeError("Material assignments changed during cleanup.")
    if shape_key_values_before != {
        shape_key.name: shape_key.value for shape_key in shape_keys
    }:
        raise RuntimeError("Shape-key values changed during cleanup.")

    maximum_displacement = max(item.length for item in displacements)
    mean_displacement = sum(item.length for item in displacements) / len(displacements)
    changed_positions = [original_positions[index] for index in changed_indices]
    report = {
        "revision": "identity-shell-v1-mouth-cleanup",
        "sourceBaseline": "1.0.0",
        "sourceBlendSha256": baseline_sha,
        "changedVertexCount": len(changed_indices),
        "changedVertexIndices": changed_indices,
        "changedBounds": {
            "minimum": [
                min(position[axis] for position in changed_positions)
                for axis in range(3)
            ],
            "maximum": [
                max(position[axis] for position in changed_positions)
                for axis in range(3)
            ],
        },
        "maximumDisplacement": maximum_displacement,
        "meanDisplacement": mean_displacement,
        "clampedVertexCount": clamped_vertex_count,
        "maximumXDisplacement": max(abs(item.x) for item in displacements),
        "maximumMorphDeltaDrift": maximum_morph_delta_drift,
        "vertexCount": len(mesh.vertices),
        "polygonCount": len(mesh.polygons),
        "shapeKeyCount": len(shape_keys),
        "shapeKeyValuesUnchanged": True,
        "materialsUnchanged": True,
        "topologyUnchanged": True,
        "productionAssetTouched": False,
    }
    scene[REVISION_MARKER] = json.dumps(
        {
            "sourceBaseline": "1.0.0",
            "scope": "mouth-and-philtrum-only",
            "changedVertexCount": len(changed_indices),
            "maximumDisplacement": maximum_displacement,
        },
        sort_keys=True,
    )
    bpy.ops.wm.save_as_mainfile(filepath=blend_path, compress=True)

    os.makedirs(os.path.dirname(report_path), exist_ok=True)
    with open(report_path, "w", encoding="utf-8") as report_file:
        json.dump(report, report_file, indent=2)
        report_file.write("\n")
    print("SYNMERE_MOUTH_CLEANUP=" + json.dumps(report, sort_keys=True))


main()

"""Inspect the promoted shell's mouth-local geometry before revision."""

import json
import math

import bpy
from mathutils.kdtree import KDTree


EXPECTED_MESH_NAME = "IdentityShell"
MOUTH_MAXIMUM_X = 0.36
MOUTH_MINIMUM_Z = -0.86
MOUTH_MAXIMUM_Z = -0.54
VISIBLE_SURFACE_MAXIMUM_Y = -0.28
MIRROR_TOLERANCE = 0.025


shell = bpy.data.objects.get(EXPECTED_MESH_NAME)
if shell is None or shell.type != "MESH":
    raise RuntimeError(f"Missing {EXPECTED_MESH_NAME} mesh.")

basis = shell.data.shape_keys.key_blocks["Basis"]
positions = [item.co.copy() for item in basis.data]
tree = KDTree(len(positions))
for index, position in enumerate(positions):
    tree.insert(position, index)
tree.balance()

mouth_indices = [
    index
    for index, position in enumerate(positions)
    if abs(position.x) <= MOUTH_MAXIMUM_X
    and MOUTH_MINIMUM_Z <= position.z <= MOUTH_MAXIMUM_Z
    and position.y <= VISIBLE_SURFACE_MAXIMUM_Y
]
asymmetries = []
unmatched = []
for index in mouth_indices:
    position = positions[index]
    mirrored = (-position.x, position.y, position.z)
    _, mirror_index, distance = tree.find(mirrored)
    if distance > MIRROR_TOLERANCE:
        unmatched.append({"index": index, "distance": distance})
        continue
    mirror = positions[mirror_index]
    asymmetries.append(
        {
            "index": index,
            "mirrorIndex": mirror_index,
            "distance": distance,
            "depthDelta": abs(position.y - mirror.y),
            "heightDelta": abs(position.z - mirror.z),
            "widthDelta": abs(abs(position.x) - abs(mirror.x)),
        }
    )

print(
    "SYNMERE_MOUTH_INSPECTION="
    + json.dumps(
        {
            "blend": bpy.data.filepath,
            "vertexCount": len(positions),
            "mouthVertexCount": len(mouth_indices),
            "bounds": {
                "minimum": [
                    min(positions[index][axis] for index in mouth_indices)
                    for axis in range(3)
                ],
                "maximum": [
                    max(positions[index][axis] for index in mouth_indices)
                    for axis in range(3)
                ],
            },
            "mirrorPairs": len(asymmetries),
            "unmatched": unmatched,
            "maximumMirrorDistance": max(
                item["distance"] for item in asymmetries
            ),
            "rmsMirrorDistance": math.sqrt(
                sum(item["distance"] ** 2 for item in asymmetries)
                / len(asymmetries)
            ),
            "maximumDepthDelta": max(
                item["depthDelta"] for item in asymmetries
            ),
            "maximumHeightDelta": max(
                item["heightDelta"] for item in asymmetries
            ),
            "largestAsymmetries": sorted(
                asymmetries,
                key=lambda item: item["distance"],
                reverse=True,
            )[:24],
        },
        indent=2,
    )
)

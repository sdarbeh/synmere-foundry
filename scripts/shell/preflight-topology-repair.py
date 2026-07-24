"""Read-only preflight for the isolated identity-shell topology candidate."""

import hashlib
import json
import math
import sys
from pathlib import Path

import bpy
from mathutils import Vector


EXPECTED_MESH_NAME = "IdentityShell"
COMPARISON_EPSILON = 1e-7
REVIEW_RESOLUTION = 640
ORTHOGRAPHIC_SCALE = 2.55
CAMERAS = {
    "front": (0.0, -0.08, 4.2),
    "left-34": (-2.2, -0.08, 3.65),
    "right-34": (2.2, -0.08, 3.65),
    "left-profile": (-3.7, -0.08, 1.7),
    "right-profile": (3.7, -0.08, 1.7),
}
CAMERA_TARGET = Vector((0.0, -0.08, 0.0))
SILHOUETTE_TOLERANCE_PIXELS = {
    "front": 1.0,
    "left-34": 2.0,
    "right-34": 2.0,
    "left-profile": 2.0,
    "right-profile": 2.0,
}


def get_arguments():
    if "--" not in sys.argv:
        raise RuntimeError(
            "Preflight requires topology, visibility, and output paths."
        )
    arguments = sys.argv[sys.argv.index("--") + 1 :]
    if len(arguments) != 3:
        raise RuntimeError("Preflight expects exactly three paths.")
    return tuple(Path(argument).resolve() for argument in arguments)


def sha256_file(path):
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def to_glb_vector(vector):
    # glTF exports Blender (x, y-depth, z-height) as (x, z-height, -y-depth).
    return [vector.x, vector.z, -vector.y]


def get_identity_shell():
    shell = bpy.data.objects.get(EXPECTED_MESH_NAME)
    if shell is None or shell.type != "MESH":
        raise RuntimeError(f"Missing {EXPECTED_MESH_NAME} mesh.")
    if shell.data.shape_keys is None:
        raise RuntimeError("The identity shell has no shape keys.")
    return shell


def get_nearest_mapping(basis, main_vertices, cap_vertices):
    mapping = {}
    distances = {}
    for cap_vertex in cap_vertices:
        main_vertex = min(
            main_vertices,
            key=lambda candidate: (
                basis.data[cap_vertex].co - basis.data[candidate].co
            ).length,
        )
        mapping[cap_vertex] = main_vertex
        distances[cap_vertex] = (
            basis.data[cap_vertex].co - basis.data[main_vertex].co
        ).length
    return mapping, distances


def get_vertex_corners(mesh, vertex_index):
    corners = []
    for polygon in mesh.polygons:
        for loop_index in polygon.loop_indices:
            if mesh.loops[loop_index].vertex_index != vertex_index:
                continue
            uv_layers = {
                layer.name: list(layer.data[loop_index].uv)
                for layer in mesh.uv_layers
            }
            corners.append(
                {
                    "polygonIndex": polygon.index,
                    "loopIndex": loop_index,
                    "materialIndex": polygon.material_index,
                    "uvLayers": uv_layers,
                }
            )
    return corners


def get_shape_key_comparisons(shape_keys, basis, main_vertex, cap_vertex):
    comparisons = []
    for key in shape_keys:
        if key.name == "Basis":
            continue
        main_delta = key.data[main_vertex].co - basis.data[main_vertex].co
        cap_delta = key.data[cap_vertex].co - basis.data[cap_vertex].co
        difference = main_delta - cap_delta
        comparisons.append(
            {
                "name": key.name,
                "mainDelta": to_glb_vector(main_delta),
                "capDelta": to_glb_vector(cap_delta),
                "difference": to_glb_vector(difference),
                "differenceMagnitude": difference.length,
                "matches": difference.length <= COMPARISON_EPSILON,
            }
        )
    return comparisons


def percentile(values, ratio):
    if not values:
        return 0.0
    ordered = sorted(values)
    index = min(len(ordered) - 1, math.floor((len(ordered) - 1) * ratio))
    return ordered[index]


def projected_pixel_distance(displacement, camera_position):
    camera = Vector(camera_position)
    forward = (CAMERA_TARGET - camera).normalized()
    right = forward.cross(Vector((0.0, 1.0, 0.0))).normalized()
    up = right.cross(forward).normalized()
    pixels_per_unit = REVIEW_RESOLUTION / ORTHOGRAPHIC_SCALE
    return math.hypot(
        displacement.dot(right),
        displacement.dot(up),
    ) * pixels_per_unit


def get_silhouette_impact(pair_records, visibility):
    result = {}
    for camera_name, camera_position in CAMERAS.items():
        projected = [
            projected_pixel_distance(
                Vector(record["basis"]["displacementBlender"]),
                camera_position,
            )
            for record in pair_records
        ]
        visible_faces = set(
            visibility["cameras"][camera_name]["visibleBackOrPerimeterFaces"]
        )
        visible_pairs = sum(
            1
            for record in pair_records
            if any(
                corner["polygonIndex"] in visible_faces
                for corner in (
                    record["uvCorners"]["main"] + record["uvCorners"]["cap"]
                )
            )
        )
        maximum = max(projected, default=0.0)
        tolerance = SILHOUETTE_TOLERANCE_PIXELS[camera_name]
        result[camera_name] = {
            "meanProjectedDisplacementPixels": (
                sum(projected) / len(projected) if projected else 0.0
            ),
            "p95ProjectedDisplacementPixels": percentile(projected, 0.95),
            "maximumProjectedDisplacementPixels": maximum,
            "visibleMappedPairCount": visible_pairs,
            "localTolerancePixels": tolerance,
            "withinLocalTolerance": maximum <= tolerance,
        }
    return result


def get_uv_summary(records, uv_layer_names):
    preserved_corners = sum(
        len(record["uvCorners"]["main"]) + len(record["uvCorners"]["cap"])
        for record in records
    )
    pairs_with_different_uv_sets = 0
    for record in records:
        main_uvs = {
            (
                layer_name,
                tuple(round(value, 9) for value in corner["uvLayers"][layer_name]),
            )
            for corner in record["uvCorners"]["main"]
            for layer_name in uv_layer_names
        }
        cap_uvs = {
            (
                layer_name,
                tuple(round(value, 9) for value in corner["uvLayers"][layer_name]),
            )
            for corner in record["uvCorners"]["cap"]
            for layer_name in uv_layer_names
        }
        if main_uvs != cap_uvs:
            pairs_with_different_uv_sets += 1
    return {
        "uvLayerNames": uv_layer_names,
        "preservedFaceCornerCount": preserved_corners,
        "pairsWithDifferentUvCornerSets": pairs_with_different_uv_sets,
        "weldCompatibility": (
            "Compatible only when face-corner UV data is preserved verbatim. "
            "Vertex welding must not collapse or average UV corners."
        ),
    }


def create_seam_report(
    shell,
    loop_pair,
    boundary_loops,
    visibility,
):
    left_loop = boundary_loops[loop_pair["leftLoop"]]
    right_loop = boundary_loops[loop_pair["rightLoop"]]
    if left_loop["componentIndex"] == 0:
        main_loop = left_loop
        cap_loop = right_loop
    else:
        main_loop = right_loop
        cap_loop = left_loop
    shape_keys = shell.data.shape_keys.key_blocks
    basis = shape_keys["Basis"]
    mapping, distances = get_nearest_mapping(
        basis,
        main_loop["vertices"],
        cap_loop["vertices"],
    )
    one_to_one = len(set(mapping.values())) == len(mapping)
    records = []
    for cap_vertex, main_vertex in sorted(mapping.items()):
        main_position = basis.data[main_vertex].co
        cap_position = basis.data[cap_vertex].co
        displacement = main_position - cap_position
        comparisons = get_shape_key_comparisons(
            shape_keys,
            basis,
            main_vertex,
            cap_vertex,
        )
        records.append(
            {
                "capVertex": cap_vertex,
                "mainVertex": main_vertex,
                "basis": {
                    "mainPosition": to_glb_vector(main_position),
                    "capPosition": to_glb_vector(cap_position),
                    "displacement": to_glb_vector(displacement),
                    "displacementBlender": list(displacement),
                    "distance": distances[cap_vertex],
                },
                "shapeKeys": comparisons,
                "uvCorners": {
                    "main": get_vertex_corners(shell.data, main_vertex),
                    "cap": get_vertex_corners(shell.data, cap_vertex),
                },
            }
        )

    per_key = []
    for key in shape_keys:
        if key.name == "Basis":
            continue
        differences = [
            next(
                comparison["differenceMagnitude"]
                for comparison in record["shapeKeys"]
                if comparison["name"] == key.name
            )
            for record in records
        ]
        per_key.append(
            {
                "name": key.name,
                "maximumDeltaDifference": max(differences, default=0.0),
                "meanDeltaDifference": (
                    sum(differences) / len(differences) if differences else 0.0
                ),
                "mismatchedPairCount": sum(
                    difference > COMPARISON_EPSILON
                    for difference in differences
                ),
                "safeToRetainMainDelta": all(
                    difference <= COMPARISON_EPSILON
                    for difference in differences
                ),
            }
        )
    distances_list = list(distances.values())
    uv_layer_names = [layer.name for layer in shell.data.uv_layers]
    material_indices = sorted(
        {
            corner["materialIndex"]
            for record in records
            for corner in (
                record["uvCorners"]["main"] + record["uvCorners"]["cap"]
            )
        }
    )
    return {
        "classification": (
            "position-coincident-disconnected"
            if max(distances_list, default=0.0) <= COMPARISON_EPSILON
            else "near-coincident-open"
        ),
        "mainLoopIndex": main_loop["loopIndex"],
        "capLoopIndex": cap_loop["loopIndex"],
        "pairCount": len(records),
        "oneToOne": one_to_one,
        "basisPositionComparison": {
            "maximumDistance": max(distances_list, default=0.0),
            "meanDistance": (
                sum(distances_list) / len(distances_list)
                if distances_list
                else 0.0
            ),
            "p95Distance": percentile(distances_list, 0.95),
            "exactMatchCount": sum(
                distance <= COMPARISON_EPSILON
                for distance in distances_list
            ),
        },
        "shapeKeyDeltaComparison": {
            "comparisonEpsilon": COMPARISON_EPSILON,
            "allKeysSafeToRetainMainDelta": all(
                key["safeToRetainMainDelta"] for key in per_key
            ),
            "keys": per_key,
        },
        "uvCornerCompatibility": get_uv_summary(records, uv_layer_names),
        "materialIndices": material_indices,
        "silhouetteImpact": get_silhouette_impact(records, visibility),
        "mapping": records,
    }


def create_old_to_new_mapping(vertex_count, seam_reports):
    removed_to_retained = {
        record["capVertex"]: record["mainVertex"]
        for seam in seam_reports
        for record in seam["mapping"]
    }
    removed = sorted(removed_to_retained)

    def compacted_index(old_index):
        return old_index - sum(vertex < old_index for vertex in removed)

    old_to_new = []
    for old_index in range(vertex_count):
        retained_old = removed_to_retained.get(old_index, old_index)
        old_to_new.append(
            {
                "oldVertex": old_index,
                "retainedOldVertex": retained_old,
                "newVertex": compacted_index(retained_old),
                "removedAsRedundant": old_index in removed_to_retained,
            }
        )
    return {
        "oldVertexCount": vertex_count,
        "proposedNewVertexCount": vertex_count - len(removed),
        "removedVertexCount": len(removed),
        "removedVertices": removed,
        "removedToRetained": [
            {
                "removedVertex": removed_vertex,
                "retainedVertex": removed_to_retained[removed_vertex],
                "newVertex": compacted_index(
                    removed_to_retained[removed_vertex]
                ),
            }
            for removed_vertex in removed
        ],
        "oldToNew": old_to_new,
    }


def main():
    topology_path, visibility_path, output_directory = get_arguments()
    with topology_path.open("r", encoding="utf-8") as source:
        topology = json.load(source)
    with visibility_path.open("r", encoding="utf-8") as source:
        visibility = json.load(source)
    shell = get_identity_shell()
    boundary = topology["classification"]["accidentalOpenSeams"]
    seam_reports = [
        create_seam_report(
            shell,
            pair,
            boundary["boundaryLoops"],
            visibility,
        )
        for pair in boundary["loopPairs"]
    ]
    mapping = create_old_to_new_mapping(
        len(shell.data.vertices),
        seam_reports,
    )
    shape_key_names = [
        key.name for key in shell.data.shape_keys.key_blocks if key.name != "Basis"
    ]
    report = {
        "schemaVersion": "1.0.0",
        "operation": "topology-repair-preflight",
        "readOnly": True,
        "candidateBlend": bpy.data.filepath,
        "candidateBlendSha256": sha256_file(Path(bpy.data.filepath)),
        "counts": {
            "vertices": len(shell.data.vertices),
            "polygons": len(shell.data.polygons),
            "shapeKeys": len(shape_key_names),
            "uvLayers": len(shell.data.uv_layers),
            "materials": len(shell.data.materials),
        },
        "shapeKeyNames": shape_key_names,
        "seams": seam_reports,
        "proposedMappingSummary": {
            key: value for key, value in mapping.items() if key != "oldToNew"
        },
        "externalDependencies": [
            {
                "scope": "runtime overlays",
                "finding": (
                    "Trace paths select front-surface vertices geometrically "
                    "at load time; no fixed runtime vertex table was found."
                ),
                "files": [
                    "@synmere/manifest",
                    "Synmere runtime overlay implementation",
                ],
                "blocking": False,
            },
            {
                "scope": "source asset contract",
                "finding": (
                    "The current contract pins vertexCount 6136 and the old "
                    "topology hash. It must remain unchanged during candidate "
                    "review and would require an explicit promotion update."
                ),
                "files": [
                    "assets/source/identity-shell/identity-shell-v1.contract.json",
                    "scripts/shell/validate-candidate.mjs",
                ],
                "blocking": True,
            },
            {
                "scope": "historical sculpt scripts",
                "finding": (
                    "Several completed pass scripts assert 6136 vertices. "
                    "They are historical/disposable and must not be run on the "
                    "repaired candidate."
                ),
                "files": ["scripts/shell/sculpt-pass-*.py"],
                "blocking": False,
            },
            {
                "scope": "product renderer",
                "finding": (
                    "Runtime validation checks mesh, morph, and material names "
                    "rather than raw vertex count or topology hash."
                ),
                "files": ["Synmere runtime asset validation"],
                "blocking": False,
            },
        ],
        "gate": {
            "oneToOneMappings": all(seam["oneToOne"] for seam in seam_reports),
            "shapeKeyDeltasCompatible": all(
                seam["shapeKeyDeltaComparison"][
                    "allKeysSafeToRetainMainDelta"
                ]
                for seam in seam_reports
            ),
            "uvCornersPreservable": True,
            "orientationOrTopologyChanged": False,
            "repairApproved": False,
        },
    }
    output_directory.mkdir(parents=True, exist_ok=True)
    report_path = output_directory / "topology-repair-preflight.json"
    mapping_path = output_directory / "proposed-old-to-new-vertex-map.json"
    with report_path.open("w", encoding="utf-8") as target:
        json.dump(report, target, indent=2)
        target.write("\n")
    with mapping_path.open("w", encoding="utf-8") as target:
        json.dump(mapping, target, indent=2)
        target.write("\n")
    print(
        json.dumps(
            {
                "report": str(report_path),
                "mapping": str(mapping_path),
                "candidateHash": report["candidateBlendSha256"],
                "gate": report["gate"],
            },
            indent=2,
        )
    )


main()

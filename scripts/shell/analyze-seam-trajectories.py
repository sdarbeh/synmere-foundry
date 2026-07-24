"""Measure divergent seam trajectories without editing the Blender asset."""

import json
import math
import os
import sys

import bpy
from mathutils import Vector
from mathutils.bvhtree import BVHTree


EXPECTED_MESH_NAME = "IdentityShell"
MISMATCH_EPSILON = 1e-7
VISIBILITY_EPSILON = 5e-4
SAMPLE_WEIGHTS = (0.0, 0.25, 0.5, 0.75, 1.0)


def get_arguments():
    if "--" not in sys.argv:
        raise RuntimeError(
            "Expected preflight, config, and output paths after --."
        )
    arguments = sys.argv[sys.argv.index("--") + 1 :]
    if len(arguments) != 3:
        raise RuntimeError(
            "Expected preflight JSON, review config, and output report paths."
        )
    return [os.path.abspath(argument) for argument in arguments]


def load_json(file_path):
    with open(file_path, encoding="utf8") as input_file:
        return json.load(input_file)


def glb_to_blender(values):
    return Vector((values[0], -values[2], values[1]))


def blender_to_glb(vector):
    return Vector((vector.x, vector.z, -vector.y))


def percentile(values, fraction):
    if not values:
        return 0.0
    ordered = sorted(values)
    index = min(len(ordered) - 1, math.ceil(len(ordered) * fraction) - 1)
    return ordered[max(0, index)]


def get_camera_basis(camera_position, target):
    forward = (target - camera_position).normalized()
    right = forward.cross(Vector((0.0, 1.0, 0.0))).normalized()
    up = right.cross(forward).normalized()
    return right, up


def project_pixel(position, camera, target, scale, resolution):
    right, up = get_camera_basis(camera, target)
    relative = position - target
    pixels_per_unit = resolution / scale
    return Vector(
        (
            relative.dot(right) * pixels_per_unit,
            relative.dot(up) * pixels_per_unit,
        )
    )


def get_positions_for_weight(basis, delta, weight):
    return [
        position + delta[index] * weight
        for index, position in enumerate(basis)
    ]


def is_directly_visible(bvh, camera, position):
    direction = position - camera
    distance = direction.length
    if distance == 0:
        return True
    hit_position, _normal, _face, _distance = bvh.ray_cast(
        camera,
        direction.normalized(),
        distance + VISIBILITY_EPSILON,
    )
    return (
        hit_position is not None
        and (hit_position - position).length <= VISIBILITY_EPSILON
    )


def summarize(values):
    return {
        "mean": sum(values) / len(values) if values else 0.0,
        "p95": percentile(values, 0.95),
        "maximum": max(values, default=0.0),
    }


def analyze_seam(
    seam,
    key_name,
    basis,
    delta,
    faces,
    cameras,
    target,
    scale,
    resolution,
):
    mapping = seam["mapping"]
    basis_distances = [
        (basis[item["mainVertex"]] - basis[item["capVertex"]]).length
        for item in mapping
    ]
    samples = []
    affected_main = []
    affected_cap = []

    for item in mapping:
        main_index = item["mainVertex"]
        cap_index = item["capVertex"]
        if (delta[main_index] - delta[cap_index]).length > MISMATCH_EPSILON:
            affected_main.append(main_index)
            affected_cap.append(cap_index)

    main_visible_cameras = set()
    cap_visible_cameras = set()
    visible_pair_records = []
    maximum_projected_separation = 0.0
    maximum_gap_increase = 0.0

    for weight in SAMPLE_WEIGHTS:
        positions = get_positions_for_weight(basis, delta, weight)
        bvh = BVHTree.FromPolygons(
            positions,
            faces,
            all_triangles=False,
            epsilon=0.0,
        )
        distances = []
        projected_separations = []
        visible_pair_count = 0
        for pair_index, item in enumerate(mapping):
            main_position = positions[item["mainVertex"]]
            cap_position = positions[item["capVertex"]]
            distance = (main_position - cap_position).length
            distances.append(distance)
            maximum_gap_increase = max(
                maximum_gap_increase,
                distance - basis_distances[pair_index],
            )
            for camera_name, camera in cameras.items():
                main_visible = is_directly_visible(
                    bvh,
                    camera,
                    main_position,
                )
                cap_visible = is_directly_visible(
                    bvh,
                    camera,
                    cap_position,
                )
                if main_visible:
                    main_visible_cameras.add(camera_name)
                if cap_visible:
                    cap_visible_cameras.add(camera_name)
                if main_visible or cap_visible:
                    visible_pair_count += 1
                    visible_pair_records.append(
                        {
                            "weight": weight,
                            "pairIndex": pair_index,
                            "mainVertex": item["mainVertex"],
                            "capVertex": item["capVertex"],
                            "camera": camera_name,
                            "mainVisible": main_visible,
                            "capVisible": cap_visible,
                        }
                    )
                projected = (
                    project_pixel(
                        blender_to_glb(main_position),
                        blender_to_glb(camera),
                        blender_to_glb(target),
                        scale,
                        resolution,
                    )
                    - project_pixel(
                        blender_to_glb(cap_position),
                        blender_to_glb(camera),
                        blender_to_glb(target),
                        scale,
                        resolution,
                    )
                ).length
                projected_separations.append(projected)
                maximum_projected_separation = max(
                    maximum_projected_separation,
                    projected,
                )
        samples.append(
            {
                "weight": weight,
                "gapDistance": summarize(distances),
                "projectedPairSeparationPixels": summarize(
                    projected_separations
                ),
                "directlyVisiblePairCameraHits": visible_pair_count,
            }
        )

    main_visible = bool(main_visible_cameras)
    cap_visible = bool(cap_visible_cameras)
    if main_visible and not cap_visible:
        trajectory_evidence = "main-shell-visible"
    elif cap_visible and not main_visible:
        trajectory_evidence = "cap-visible"
    elif main_visible and cap_visible:
        trajectory_evidence = "both-visible-no-canonical-choice"
    else:
        trajectory_evidence = "hidden-no-canonical-choice"

    return {
        "classification": seam["classification"],
        "mainLoopIndex": seam["mainLoopIndex"],
        "capLoopIndex": seam["capLoopIndex"],
        "affectedPairCount": len(affected_main),
        "affectedMainVertices": affected_main,
        "affectedCapVertices": affected_cap,
        "basisGap": summarize(basis_distances),
        "maximumGapIncrease": maximum_gap_increase,
        "opensOrExpandsSeam": maximum_gap_increase > MISMATCH_EPSILON,
        "maximumProjectedPairSeparationPixels": (
            maximum_projected_separation
        ),
        "mainDirectlyVisible": main_visible,
        "mainVisibleCameras": sorted(main_visible_cameras),
        "capDirectlyVisible": cap_visible,
        "capVisibleCameras": sorted(cap_visible_cameras),
        "trajectoryEvidence": trajectory_evidence,
        "samples": samples,
        "visiblePairRecords": visible_pair_records,
    }


def analyze():
    preflight_path, config_path, output_path = get_arguments()
    preflight = load_json(preflight_path)
    config = load_json(config_path)
    shell = bpy.data.objects.get(EXPECTED_MESH_NAME)
    if shell is None or shell.type != "MESH":
        raise RuntimeError(f"Missing {EXPECTED_MESH_NAME} mesh.")
    if shell.data.shape_keys is None:
        raise RuntimeError("Identity shell has no shape keys.")

    for key in shell.data.shape_keys.key_blocks:
        key.value = 0.0
    basis_key = shell.data.shape_keys.key_blocks["Basis"]
    basis = [point.co.copy() for point in basis_key.data]
    faces = [tuple(polygon.vertices) for polygon in shell.data.polygons]

    review = config["review"]
    cameras = {
        name: glb_to_blender(position)
        for name, position in review["cameras"].items()
    }
    target = glb_to_blender(review["target"])
    scale = review["orthographicScale"]
    resolution = review["resolution"]

    mismatched_names = [
        item["name"]
        for item in preflight["seams"][0][
            "shapeKeyDeltaComparison"
        ]["keys"]
        if not item["safeToRetainMainDelta"]
    ]

    key_reports = []
    for key_name in mismatched_names:
        key = shell.data.shape_keys.key_blocks.get(key_name)
        if key is None:
            raise RuntimeError(f"Missing shape key {key_name}.")
        delta = [
            point.co - basis[index]
            for index, point in enumerate(key.data)
        ]
        seam_reports = [
            analyze_seam(
                seam,
                key_name,
                basis,
                delta,
                faces,
                cameras,
                target,
                scale,
                resolution,
            )
            for seam in preflight["seams"]
        ]
        all_differences = [
            (
                delta[item["mainVertex"]]
                - delta[item["capVertex"]]
            ).length
            for seam in preflight["seams"]
            for item in seam["mapping"]
        ]
        key_reports.append(
            {
                "name": key_name,
                "deltaDifference": summarize(all_differences),
                "seams": seam_reports,
                "canonicalTrajectoryDecision": (
                    "not-authorized-analysis-only"
                ),
            }
        )

    report = {
        "schemaVersion": "1.0.0",
        "operation": "seam-trajectory-analysis",
        "readOnly": True,
        "candidateBlend": bpy.data.filepath,
        "comparisonEpsilon": MISMATCH_EPSILON,
        "visibilityEpsilon": VISIBILITY_EPSILON,
        "sampleWeights": list(SAMPLE_WEIGHTS),
        "review": {
            "resolution": resolution,
            "orthographicScale": scale,
            "cameras": list(cameras.keys()),
        },
        "shapeKeyCount": len(key_reports),
        "shapeKeys": key_reports,
        "decision": {
            "trajectoryHarmonizationPerformed": False,
            "weldingPerformed": False,
            "topologyChanged": False,
            "vertexMovementPerformed": False,
            "nextActionApproved": False,
        },
    }
    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    with open(output_path, "w", encoding="utf8") as output_file:
        json.dump(report, output_file, indent=2)
        output_file.write("\n")
    print(
        json.dumps(
            {
                "operation": report["operation"],
                "shapeKeyCount": report["shapeKeyCount"],
                "decision": report["decision"],
            },
            indent=2,
        )
    )


analyze()

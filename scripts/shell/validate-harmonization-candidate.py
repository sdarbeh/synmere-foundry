"""Compare one harmonization-only candidate with the oriented G1.1 baseline."""

import json
import math
import os
import sys
from collections import defaultdict

import bpy
from mathutils import Vector


EXPECTED_MESH_NAME = "IdentityShell"
SAMPLE_WEIGHTS = (0.0, 0.25, 0.5, 0.75, 1.0)
POSITION_EPSILON = 1e-7
PRODUCT_BASELINE = {
    "identity_face_wide": 0.26087,
    "identity_face_short": 0.28571,
    "identity_forehead_wide": 0.20132,
    "identity_upper_face_short": 0.24545,
    "identity_cheekbones_wide": 0.315,
    "identity_jaw_wide": 0.38182,
    "identity_jaw_taper_square": 0.21789,
}
COMBINATIONS = {
    "jaw-wide-chin-long-corrective": {
        "identity_jaw_wide": 1.0,
        "identity_chin_long": 1.0,
        "corrective_jaw_wide_chin_long": 1.0,
    },
    "jaw-wide-head-depth-high": {
        "identity_jaw_wide": 1.0,
        "identity_head_depth_high": 1.0,
    },
    "jaw-wide-head-depth-low": {
        "identity_jaw_wide": 1.0,
        "identity_head_depth_low": 1.0,
    },
    "mouth-wide-chin-long": {
        "identity_mouth_wide": 1.0,
        "identity_chin_long": 1.0,
    },
    "cheek-wide-jaw-wide": {
        "identity_cheekbones_wide": 1.0,
        "identity_jaw_wide": 1.0,
    },
    "product-balanced": {
        **PRODUCT_BASELINE,
        "presentation_structure_structured": 0.18,
    },
    "product-structured": {
        **PRODUCT_BASELINE,
        "presentation_structure_structured": 0.72,
    },
    "product-soft": {
        **PRODUCT_BASELINE,
        "presentation_structure_soft": 0.58,
    },
}


def get_arguments():
    if "--" not in sys.argv:
        raise RuntimeError(
            "Expected reference, preflight, config, policy, and output after --."
        )
    arguments = sys.argv[sys.argv.index("--") + 1 :]
    if len(arguments) != 5:
        raise RuntimeError(
            "Expected reference blend, preflight JSON, config JSON, policy, "
            "and output report."
        )
    paths = [os.path.abspath(argument) for argument in arguments[:3]]
    return [*paths, arguments[3], os.path.abspath(arguments[4])]


def load_json(file_path):
    with open(file_path, encoding="utf8") as input_file:
        return json.load(input_file)


def load_reference_object(file_path):
    with bpy.data.libraries.load(file_path, link=False) as (
        source,
        destination,
    ):
        destination.objects = [
            name for name in source.objects if name == EXPECTED_MESH_NAME
        ]
    if len(destination.objects) != 1:
        raise RuntimeError("Unable to load the reference identity shell.")
    return destination.objects[0]


def percentile(values, fraction):
    if not values:
        return 0.0
    ordered = sorted(values)
    index = min(len(ordered) - 1, math.ceil(len(ordered) * fraction) - 1)
    return ordered[max(0, index)]


def summarize(values):
    return {
        "mean": sum(values) / len(values) if values else 0.0,
        "p95": percentile(values, 0.95),
        "maximum": max(values, default=0.0),
    }


def blender_to_glb(vector):
    return Vector((vector.x, vector.z, -vector.y))


def glb_to_blender(values):
    return Vector((values[0], -values[2], values[1]))


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


def get_shape_data(shell):
    shape_keys = shell.data.shape_keys.key_blocks
    basis = [point.co.copy() for point in shape_keys["Basis"].data]
    deltas = {
        key.name: [
            point.co - basis[index]
            for index, point in enumerate(key.data)
        ]
        for key in shape_keys[1:]
    }
    return basis, deltas


def evaluate_positions(basis, deltas, weights):
    positions = [position.copy() for position in basis]
    for key_name, weight in weights.items():
        delta = deltas[key_name]
        for index in range(len(positions)):
            positions[index] += delta[index] * weight
    return positions


def get_local_topology(faces, seam_vertices):
    edges = set()
    face_indices = set()
    incident_faces = defaultdict(list)
    for face_index, face in enumerate(faces):
        for vertex_index in face:
            incident_faces[vertex_index].append(face_index)
        if not seam_vertices.intersection(face):
            continue
        face_indices.add(face_index)
        for offset, start in enumerate(face):
            end = face[(offset + 1) % len(face)]
            edges.add(tuple(sorted((start, end))))
    return sorted(edges), sorted(face_indices), incident_faces


def get_triangle_area_vector(face, positions):
    origin = positions[face[0]]
    area_vector = Vector()
    for offset in range(1, len(face) - 1):
        area_vector += (
            positions[face[offset]] - origin
        ).cross(positions[face[offset + 1]] - origin) * 0.5
    return area_vector


def get_vertex_normal(vertex_index, positions, faces, incident_faces):
    normal = Vector()
    for face_index in incident_faces[vertex_index]:
        normal += get_triangle_area_vector(faces[face_index], positions)
    return normal.normalized() if normal.length else Vector((0, 0, 1))


def get_state_report(
    name,
    weights,
    candidate_basis,
    candidate_deltas,
    reference_basis,
    reference_deltas,
    faces,
    local_edges,
    local_faces,
    incident_faces,
    seams,
    cameras,
    target,
    scale,
    resolution,
):
    # Compare evaluated candidate geometry with the retained G1.1 state.
    candidate = evaluate_positions(
        candidate_basis,
        candidate_deltas,
        weights,
    )
    reference = evaluate_positions(
        reference_basis,
        reference_deltas,
        weights,
    )
    edge_strain = []
    for start, end in local_edges:
        reference_length = (reference[start] - reference[end]).length
        candidate_length = (candidate[start] - candidate[end]).length
        if reference_length > POSITION_EPSILON:
            edge_strain.append(
                abs(candidate_length / reference_length - 1.0)
            )

    area_ratios = []
    inverted_faces = []
    for face_index in local_faces:
        face = faces[face_index]
        reference_area = get_triangle_area_vector(face, reference)
        candidate_area = get_triangle_area_vector(face, candidate)
        if reference_area.length > POSITION_EPSILON:
            area_ratios.append(candidate_area.length / reference_area.length)
        if candidate_area.dot(reference_area) < 0:
            inverted_faces.append(face_index)

    candidate_normal_angles = []
    reference_normal_angles = []
    normal_angle_changes = []
    seam_gap_increases = []
    trajectory_residuals = []
    for seam in seams:
        for pair in seam["mapping"]:
            main_index = pair["mainVertex"]
            cap_index = pair["capVertex"]
            main_normal = get_vertex_normal(
                main_index,
                candidate,
                faces,
                incident_faces,
            )
            cap_normal = get_vertex_normal(
                cap_index,
                candidate,
                faces,
                incident_faces,
            )
            reference_main_normal = get_vertex_normal(
                main_index,
                reference,
                faces,
                incident_faces,
            )
            reference_cap_normal = get_vertex_normal(
                cap_index,
                reference,
                faces,
                incident_faces,
            )
            candidate_angle = math.degrees(
                math.acos(max(-1.0, min(1.0, main_normal.dot(cap_normal))))
            )
            reference_angle = math.degrees(
                math.acos(
                    max(
                        -1.0,
                        min(
                            1.0,
                            reference_main_normal.dot(reference_cap_normal),
                        ),
                    )
                )
            )
            candidate_normal_angles.append(candidate_angle)
            reference_normal_angles.append(reference_angle)
            normal_angle_changes.append(candidate_angle - reference_angle)
            basis_gap = (
                candidate_basis[main_index] - candidate_basis[cap_index]
            ).length
            state_gap = (
                candidate[main_index] - candidate[cap_index]
            ).length
            seam_gap_increases.append(abs(state_gap - basis_gap))
            combined_delta = Vector()
            for key_name, weight in weights.items():
                combined_delta += (
                    candidate_deltas[key_name][main_index]
                    - candidate_deltas[key_name][cap_index]
                ) * weight
            trajectory_residuals.append(combined_delta.length)

    camera_deviation = {}
    changed_vertices = sorted(
        {
            pair[side]
            for seam in seams
            for pair in seam["mapping"]
            for side in ("mainVertex", "capVertex")
        }
    )
    for camera_name, camera_blender in cameras.items():
        camera = blender_to_glb(camera_blender)
        glb_target = blender_to_glb(target)
        deviations = []
        for vertex_index in changed_vertices:
            candidate_pixel = project_pixel(
                blender_to_glb(candidate[vertex_index]),
                camera,
                glb_target,
                scale,
                resolution,
            )
            reference_pixel = project_pixel(
                blender_to_glb(reference[vertex_index]),
                camera,
                glb_target,
                scale,
                resolution,
            )
            deviations.append((candidate_pixel - reference_pixel).length)
        camera_deviation[camera_name] = summarize(deviations)

    return {
        "name": name,
        "weights": weights,
        "adjacentEdgeStrainVsG11": summarize(edge_strain),
        "adjacentFaceAreaRatioVsG11": {
            "minimum": min(area_ratios, default=1.0),
            "maximum": max(area_ratios, default=1.0),
        },
        "invertedAdjacentFaceCount": len(inverted_faces),
        "invertedAdjacentFaces": inverted_faces,
        "pairedNormalAngleDegrees": {
            "candidate": summarize(candidate_normal_angles),
            "referenceG11": summarize(reference_normal_angles),
            "change": {
                "mean": (
                    sum(normal_angle_changes) / len(normal_angle_changes)
                    if normal_angle_changes
                    else 0.0
                ),
                "minimum": min(normal_angle_changes, default=0.0),
                "maximum": max(normal_angle_changes, default=0.0),
                "maximumAbsolute": max(
                    (abs(value) for value in normal_angle_changes),
                    default=0.0,
                ),
            },
        },
        "seamGapIncreaseFromBasis": summarize(seam_gap_increases),
        "trajectoryResidual": summarize(trajectory_residuals),
        "projectedVertexDeviationVsG11Pixels": camera_deviation,
    }


def validate():
    (
        reference_path,
        preflight_path,
        config_path,
        policy,
        output_path,
    ) = get_arguments()
    preflight = load_json(preflight_path)
    config = load_json(config_path)
    candidate_shell = bpy.data.objects.get(EXPECTED_MESH_NAME)
    if candidate_shell is None or candidate_shell.type != "MESH":
        raise RuntimeError(f"Missing {EXPECTED_MESH_NAME} candidate.")
    reference_shell = load_reference_object(reference_path)

    candidate_basis, candidate_deltas = get_shape_data(candidate_shell)
    reference_basis, reference_deltas = get_shape_data(reference_shell)
    faces = [
        tuple(polygon.vertices) for polygon in candidate_shell.data.polygons
    ]
    reference_faces = [
        tuple(polygon.vertices) for polygon in reference_shell.data.polygons
    ]
    if faces != reference_faces:
        raise RuntimeError("Candidate changed face winding/connectivity.")
    maximum_basis_delta = max(
        (candidate_basis[index] - reference_basis[index]).length
        for index in range(len(candidate_basis))
    )
    if maximum_basis_delta > POSITION_EPSILON:
        raise RuntimeError("Candidate changed Basis positions.")

    seam_vertices = {
        pair[side]
        for seam in preflight["seams"]
        for pair in seam["mapping"]
        for side in ("mainVertex", "capVertex")
    }
    local_edges, local_faces, incident_faces = get_local_topology(
        faces,
        seam_vertices,
    )
    review = config["review"]
    cameras = {
        name: glb_to_blender(position)
        for name, position in review["cameras"].items()
    }
    target = glb_to_blender(review["target"])
    mismatched_key_names = {
        item["name"]
        for seam in preflight["seams"]
        for item in seam["shapeKeyDeltaComparison"]["keys"]
        if not item["safeToRetainMainDelta"]
    }
    # Keep the sampling order aligned with the authored shape-key contract.
    affected_keys = [
        key_name
        for key_name in candidate_deltas
        if key_name in mismatched_key_names
    ]
    sampled_keys = list(candidate_deltas)
    states = []
    # Sample the complete authored morph contract, including unchanged keys.
    for key_name in sampled_keys:
        for weight in SAMPLE_WEIGHTS:
            states.append(
                get_state_report(
                    f"{key_name}-{weight:.2f}",
                    {key_name: weight},
                    candidate_basis,
                    candidate_deltas,
                    reference_basis,
                    reference_deltas,
                    faces,
                    local_edges,
                    local_faces,
                    incident_faces,
                    preflight["seams"],
                    cameras,
                    target,
                    review["orthographicScale"],
                    review["resolution"],
                )
            )
    for name, weights in COMBINATIONS.items():
        states.append(
            get_state_report(
                name,
                weights,
                candidate_basis,
                candidate_deltas,
                reference_basis,
                reference_deltas,
                faces,
                local_edges,
                local_faces,
                incident_faces,
                preflight["seams"],
                cameras,
                target,
                review["orthographicScale"],
                review["resolution"],
            )
        )

    report = {
        "schemaVersion": "v1",
        "operation": "validate-harmonization-only-candidate",
        "policy": policy,
        "candidateBlend": bpy.data.filepath,
        "referenceBlend": reference_path,
        "counts": {
            "vertices": len(candidate_basis),
            "polygons": len(faces),
            "localEdges": len(local_edges),
            "localFaces": len(local_faces),
            "sampledShapeKeys": len(sampled_keys),
            "affectedTrajectoryKeys": len(affected_keys),
            "states": len(states),
        },
        "sampledShapeKeys": sampled_keys,
        "affectedTrajectoryKeys": affected_keys,
        "preservation": {
            "maximumBasisPositionDelta": maximum_basis_delta,
            "faceWindingAndConnectivityUnchanged": True,
            "vertexCountUnchanged": len(candidate_basis)
            == len(reference_basis),
        },
        "states": states,
        "aggregate": {
            "maximumAdjacentEdgeStrainVsG11": max(
                state["adjacentEdgeStrainVsG11"]["maximum"]
                for state in states
            ),
            "maximumNormalDiscontinuityDegrees": max(
                state["pairedNormalAngleDegrees"]["candidate"]["maximum"]
                for state in states
            ),
            "maximumNormalDiscontinuityIncreaseDegrees": max(
                state["pairedNormalAngleDegrees"]["change"]["maximum"]
                for state in states
            ),
            "maximumAbsoluteNormalDiscontinuityChangeDegrees": max(
                state["pairedNormalAngleDegrees"]["change"][
                    "maximumAbsolute"
                ]
                for state in states
            ),
            "maximumSeamGapIncreaseFromBasis": max(
                state["seamGapIncreaseFromBasis"]["maximum"]
                for state in states
            ),
            "maximumTrajectoryResidual": max(
                state["trajectoryResidual"]["maximum"] for state in states
            ),
            "invertedAdjacentFaceCount": max(
                state["invertedAdjacentFaceCount"] for state in states
            ),
            "maximumProjectedDeviationByCamera": {
                camera_name: max(
                    state["projectedVertexDeviationVsG11Pixels"][
                        camera_name
                    ]["maximum"]
                    for state in states
                )
                for camera_name in cameras
            },
        },
        "decision": {
            "trajectoryPolicyValidated": policy == "midpoint-harmonized",
            "weldingApproved": False,
            "promotionApproved": False,
        },
    }
    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    with open(output_path, "w", encoding="utf8") as output_file:
        json.dump(report, output_file, indent=2)
        output_file.write("\n")
    print(json.dumps({"policy": policy, **report["aggregate"]}, indent=2))


validate()

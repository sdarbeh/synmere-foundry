"""Validate the isolated identity-shell seam-weld candidate."""

import json
import math
import os
import sys
from collections import defaultdict, deque

import bpy
from mathutils import Vector


EXPECTED_MESH_NAME = "IdentityShell"
EXPECTED_VERTICES = 6052
EXPECTED_POLYGONS = 12100
EXPECTED_SHAPE_KEYS = 37
POSITION_EPSILON = 1e-7
AREA_EPSILON = 1e-12
SAMPLE_WEIGHTS = (0.0, 0.25, 0.5, 0.75, 1.0)
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
            "Expected reference, preflight, map, config, audit, and report."
        )
    arguments = sys.argv[sys.argv.index("--") + 1 :]
    if len(arguments) != 6:
        raise RuntimeError(
            "Expected reference blend, preflight JSON, vertex map JSON, "
            "review config JSON, orientation audit JSON, and output report."
        )
    return [os.path.abspath(argument) for argument in arguments]


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
        for index, delta in enumerate(deltas[key_name]):
            positions[index] += delta * weight
    return positions


def get_area_vector(face, positions):
    origin = positions[face[0]]
    area = Vector()
    for offset in range(1, len(face) - 1):
        area += (
            positions[face[offset]] - origin
        ).cross(positions[face[offset + 1]] - origin) * 0.5
    return area


def get_topology_diagnostics(faces):
    edge_uses = defaultdict(list)
    for face_index, face in enumerate(faces):
        for offset, start in enumerate(face):
            end = face[(offset + 1) % len(face)]
            edge = tuple(sorted((start, end)))
            direction = 1 if (start, end) == edge else -1
            edge_uses[edge].append((face_index, direction))

    boundary_edges = [
        edge for edge, uses in edge_uses.items() if len(uses) == 1
    ]
    non_manifold_edges = [
        edge for edge, uses in edge_uses.items() if len(uses) > 2
    ]
    winding_conflicts = [
        edge
        for edge, uses in edge_uses.items()
        if len(uses) == 2 and uses[0][1] == uses[1][1]
    ]
    adjacency = defaultdict(set)
    for uses in edge_uses.values():
        face_indices = [face_index for face_index, _ in uses]
        for face_index in face_indices:
            adjacency[face_index].update(
                candidate
                for candidate in face_indices
                if candidate != face_index
            )
    components = 0
    unvisited = set(range(len(faces)))
    while unvisited:
        components += 1
        queue = deque([unvisited.pop()])
        while queue:
            face_index = queue.popleft()
            for neighbor in adjacency[face_index]:
                if neighbor in unvisited:
                    unvisited.remove(neighbor)
                    queue.append(neighbor)
    return {
        "components": components,
        "boundaryEdges": len(boundary_edges),
        "nonManifoldEdges": len(non_manifold_edges),
        "windingConflicts": len(winding_conflicts),
        "boundaryEdgeSample": boundary_edges[:20],
        "nonManifoldEdgeSample": non_manifold_edges[:20],
        "windingConflictSample": winding_conflicts[:20],
    }


def get_face_components(faces):
    edge_uses = defaultdict(list)
    for face_index, face in enumerate(faces):
        for offset, start in enumerate(face):
            end = face[(offset + 1) % len(face)]
            edge_uses[tuple(sorted((start, end)))].append(face_index)
    adjacency = defaultdict(set)
    for face_indices in edge_uses.values():
        for face_index in face_indices:
            adjacency[face_index].update(
                candidate
                for candidate in face_indices
                if candidate != face_index
            )
    components = []
    unvisited = set(range(len(faces)))
    while unvisited:
        component = set()
        queue = deque([unvisited.pop()])
        while queue:
            face_index = queue.popleft()
            component.add(face_index)
            for neighbor in adjacency[face_index]:
                if neighbor in unvisited:
                    unvisited.remove(neighbor)
                    queue.append(neighbor)
        components.append(component)
    return sorted(components, key=len, reverse=True)


def has_reversed_winding(before, after):
    if len(before) != len(after) or set(before) != set(after):
        return False
    before_edges = {
        (before[offset], before[(offset + 1) % len(before)])
        for offset in range(len(before))
    }
    after_edges = {
        (after[offset], after[(offset + 1) % len(after)])
        for offset in range(len(after))
    }
    return after_edges == {(end, start) for start, end in before_edges}


def get_signed_volume(faces, positions):
    volume = 0.0
    for face in faces:
        origin = positions[face[0]]
        for offset in range(1, len(face) - 1):
            volume += origin.dot(
                positions[face[offset]].cross(
                    positions[face[offset + 1]]
                )
            ) / 6.0
    return volume


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


def blender_to_glb(vector):
    return Vector((vector.x, vector.z, -vector.y))


def glb_to_blender(values):
    return Vector((values[0], -values[2], values[1]))


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


def validate():
    (
        reference_path,
        preflight_path,
        mapping_path,
        config_path,
        audit_path,
        output_path,
    ) = get_arguments()
    preflight = load_json(preflight_path)
    vertex_mapping = load_json(mapping_path)
    config = load_json(config_path)
    audit = load_json(audit_path)
    candidate = bpy.data.objects.get(EXPECTED_MESH_NAME)
    if candidate is None or candidate.type != "MESH":
        raise RuntimeError(f"Missing {EXPECTED_MESH_NAME} candidate.")
    reference = load_reference_object(reference_path)

    candidate_keys = candidate.data.shape_keys.key_blocks
    reference_keys = reference.data.shape_keys.key_blocks
    candidate_key_names = [key.name for key in candidate_keys[1:]]
    reference_key_names = [key.name for key in reference_keys[1:]]
    if candidate_key_names != reference_key_names:
        raise RuntimeError("Shape-key names or order changed.")
    if len(candidate_key_names) != EXPECTED_SHAPE_KEYS:
        raise RuntimeError("Unexpected shape-key count.")

    candidate_basis, candidate_deltas = get_shape_data(candidate)
    reference_basis, reference_deltas = get_shape_data(reference)
    faces = [
        tuple(polygon.vertices) for polygon in candidate.data.polygons
    ]
    reference_faces = [
        tuple(polygon.vertices) for polygon in reference.data.polygons
    ]
    if len(candidate_basis) != EXPECTED_VERTICES:
        raise RuntimeError("Unexpected welded vertex count.")
    if len(faces) != EXPECTED_POLYGONS:
        raise RuntimeError("Unexpected welded face count.")

    old_to_new = vertex_mapping["oldToNew"]
    mapped_reference_faces = [
        tuple(old_to_new[index]["newVertex"] for index in face)
        for face in reference_faces
    ]
    flipped_faces = set(audit["ownership"]["affectedFaceIndices"])
    face_contract_matches = all(
        has_reversed_winding(
            mapped_reference_faces[face_index],
            face,
        )
        if face_index in flipped_faces
        else face == mapped_reference_faces[face_index]
        for face_index, face in enumerate(faces)
    )
    if not face_contract_matches:
        raise RuntimeError(
            "Candidate face remap differs from the approved weld and flip."
        )

    seam_pairs = [
        {
            "classification": seam["classification"],
            "mainVertex": pair["mainVertex"],
            "capVertex": pair["capVertex"],
        }
        for seam in preflight["seams"]
        for pair in seam["mapping"]
    ]
    seam_vertices = {
        vertex
        for pair in seam_pairs
        for vertex in (pair["mainVertex"], pair["capVertex"])
    }
    seam_by_vertex = {
        vertex: pair
        for pair in seam_pairs
        for vertex in (pair["mainVertex"], pair["capVertex"])
    }

    maximum_unapproved_basis_movement = 0.0
    maximum_approved_basis_movement = 0.0
    maximum_morph_delta_change = 0.0
    for old_index, mapping in enumerate(old_to_new):
        new_index = mapping["newVertex"]
        basis_movement = (
            candidate_basis[new_index] - reference_basis[old_index]
        ).length
        if old_index in seam_vertices:
            maximum_approved_basis_movement = max(
                maximum_approved_basis_movement,
                basis_movement,
            )
        else:
            maximum_unapproved_basis_movement = max(
                maximum_unapproved_basis_movement,
                basis_movement,
            )
        for key_name in candidate_key_names:
            maximum_morph_delta_change = max(
                maximum_morph_delta_change,
                (
                    candidate_deltas[key_name][new_index]
                    - reference_deltas[key_name][old_index]
                ).length,
            )
    if maximum_unapproved_basis_movement > POSITION_EPSILON:
        raise RuntimeError(
            "An unrelated Basis vertex moved by "
            f"{maximum_unapproved_basis_movement}."
        )
    if maximum_morph_delta_change > POSITION_EPSILON:
        raise RuntimeError(
            f"Weld changed shape-key behavior by "
            f"{maximum_morph_delta_change}."
        )

    topology = get_topology_diagnostics(faces)
    if topology["components"] != 1:
        raise RuntimeError(
            "Welded shell is not one connected component: "
            f"{json.dumps(topology)}"
        )
    if topology["boundaryEdges"] != 0:
        raise RuntimeError(
            "Welded shell retains boundary edges: "
            f"{json.dumps(topology)}"
        )
    if topology["nonManifoldEdges"] != 0:
        raise RuntimeError(
            "Welded shell contains non-manifold edges: "
            f"{json.dumps(topology)}"
        )
    if topology["windingConflicts"] != 0:
        raise RuntimeError(
            "Welded shell contains winding conflicts: "
            f"{json.dumps(topology)}"
        )

    basis_degenerate_faces = [
        index
        for index, face in enumerate(faces)
        if len(set(face)) != len(face)
        or get_area_vector(face, candidate_basis).length <= AREA_EPSILON
    ]
    if basis_degenerate_faces:
        raise RuntimeError(
            f"Basis contains {len(basis_degenerate_faces)} degenerate faces."
        )

    reference_components = get_face_components(reference_faces)
    reference_main_faces = [
        reference_faces[index] for index in reference_components[0]
    ]
    reference_main_signed_volume = get_signed_volume(
        reference_main_faces,
        reference_basis,
    )
    candidate_signed_volume = get_signed_volume(
        faces,
        candidate_basis,
    )
    outward_orientation_consistent = (
        abs(reference_main_signed_volume) > AREA_EPSILON
        and abs(candidate_signed_volume) > AREA_EPSILON
        and reference_main_signed_volume * candidate_signed_volume > 0
    )
    if not outward_orientation_consistent:
        raise RuntimeError(
            "Corrected shell orientation disagrees with the main shell."
        )

    review = config["review"]
    cameras = {
        name: glb_to_blender(position)
        for name, position in review["cameras"].items()
    }
    target = glb_to_blender(review["target"])
    states = [
        (f"{key_name}-{weight:.2f}", {key_name: weight})
        for key_name in candidate_key_names
        for weight in SAMPLE_WEIGHTS
    ]
    states.extend(COMBINATIONS.items())
    state_reports = []
    for state_name, weights in states:
        candidate_positions = evaluate_positions(
            candidate_basis,
            candidate_deltas,
            weights,
        )
        reference_positions = evaluate_positions(
            reference_basis,
            reference_deltas,
            weights,
        )
        inverted_faces = []
        degenerate_faces = []
        reference_inverted_faces = []
        area_ratios = []
        for face_index, face in enumerate(faces):
            basis_area = get_area_vector(face, candidate_basis)
            state_area = get_area_vector(face, candidate_positions)
            if state_area.length <= AREA_EPSILON:
                degenerate_faces.append(face_index)
                continue
            if state_area.dot(basis_area) <= 0:
                inverted_faces.append(face_index)
            area_ratios.append(state_area.length / basis_area.length)
            reference_face = reference_faces[face_index]
            reference_basis_area = get_area_vector(
                reference_face,
                reference_basis,
            )
            reference_state_area = get_area_vector(
                reference_face,
                reference_positions,
            )
            if reference_state_area.dot(reference_basis_area) <= 0:
                reference_inverted_faces.append(face_index)

        camera_deviation = {}
        for camera_name, camera_position in cameras.items():
            camera = blender_to_glb(camera_position)
            glb_target = blender_to_glb(target)
            deviations = []
            for old_index, mapping in enumerate(old_to_new):
                new_index = mapping["newVertex"]
                candidate_pixel = project_pixel(
                    blender_to_glb(candidate_positions[new_index]),
                    camera,
                    glb_target,
                    review["orthographicScale"],
                    review["resolution"],
                )
                reference_pixel = project_pixel(
                    blender_to_glb(reference_positions[old_index]),
                    camera,
                    glb_target,
                    review["orthographicScale"],
                    review["resolution"],
                )
                deviations.append(
                    (candidate_pixel - reference_pixel).length
                )
            camera_deviation[camera_name] = summarize(deviations)

        state_reports.append(
            {
                "name": state_name,
                "weights": weights,
                "invertedFaceCount": len(inverted_faces),
                "degenerateFaceCount": len(degenerate_faces),
                "invertedFaceSample": inverted_faces[:20],
                "degenerateFaceSample": degenerate_faces[:20],
                "referenceInvertedFaceCount": len(
                    reference_inverted_faces
                ),
                "referenceInvertedFaceSample": (
                    reference_inverted_faces[:20]
                ),
                "faceAreaRatioVsWeldedBasis": {
                    "minimum": min(area_ratios, default=1.0),
                    "maximum": max(area_ratios, default=1.0),
                },
                "projectedDeviationVsMidpointPixels": camera_deviation,
            }
        )

    maximum_inverted_faces = max(
        state["invertedFaceCount"] for state in state_reports
    )
    maximum_degenerate_faces = max(
        state["degenerateFaceCount"] for state in state_reports
    )
    if maximum_inverted_faces:
        raise RuntimeError(
            "Sampled morph states contain inverted faces: "
            + json.dumps(
                {
                    "maximumInvertedFaceCount": maximum_inverted_faces,
                    "maximumDegenerateFaceCount": (
                        maximum_degenerate_faces
                    ),
                    "states": [
                        {
                            "name": state["name"],
                            "count": state["invertedFaceCount"],
                            "faces": state["invertedFaceSample"],
                            "referenceCount": (
                                state["referenceInvertedFaceCount"]
                            ),
                            "referenceFaces": (
                                state["referenceInvertedFaceSample"]
                            ),
                        }
                        for state in state_reports
                        if state["invertedFaceCount"]
                    ],
                }
            )
        )
    if maximum_degenerate_faces:
        raise RuntimeError(
            "Sampled morph states contain degenerate faces: "
            + json.dumps(
                [
                    {
                        "name": state["name"],
                        "count": state["degenerateFaceCount"],
                        "faces": state["degenerateFaceSample"],
                    }
                    for state in state_reports
                    if state["degenerateFaceCount"]
                ]
            )
        )

    normal_lengths = [
        vertex.normal.length for vertex in candidate.data.vertices
    ]
    if any(
        not math.isfinite(length) or length <= POSITION_EPSILON
        for length in normal_lengths
    ):
        raise RuntimeError("Candidate contains invalid evaluated normals.")

    maximum_projected_deviation = {
        camera_name: max(
            state["projectedDeviationVsMidpointPixels"][camera_name][
                "maximum"
            ]
            for state in state_reports
        )
        for camera_name in cameras
    }
    tolerances = {
        "front": 1.0,
        "left-34": 2.0,
        "right-34": 2.0,
        "left-profile": 2.0,
        "right-profile": 2.0,
    }
    if any(
        maximum_projected_deviation[camera_name] > tolerance
        for camera_name, tolerance in tolerances.items()
    ):
        raise RuntimeError("Candidate exceeds a silhouette deviation gate.")

    report = {
        "schemaVersion": "v1",
        "operation": "validate-seam-weld-candidate",
        "candidateBlend": bpy.data.filepath,
        "referenceBlend": reference_path,
        "counts": {
            "vertices": len(candidate_basis),
            "polygons": len(faces),
            "components": topology["components"],
            "boundaryEdges": topology["boundaryEdges"],
            "nonManifoldEdges": topology["nonManifoldEdges"],
            "windingConflicts": topology["windingConflicts"],
            "shapeKeys": len(candidate_key_names),
            "sampledStates": len(state_reports),
        },
        "preservation": {
            "faceCountUnchanged": len(faces) == len(reference_faces),
            "faceOrderAndWindingMatchApprovedMap": face_contract_matches,
            "shapeKeyNamesAndOrderUnchanged": (
                candidate_key_names == reference_key_names
            ),
            "maximumUnapprovedBasisMovement": (
                maximum_unapproved_basis_movement
            ),
            "maximumApprovedBasisMovement": (
                maximum_approved_basis_movement
            ),
            "maximumMorphDeltaChange": maximum_morph_delta_change,
        },
        "topology": topology,
        "normals": {
            "pipeline": "Blender evaluated smooth vertex normals",
            "minimumLength": min(normal_lengths, default=0.0),
            "maximumLength": max(normal_lengths, default=0.0),
            "allFiniteAndNonZero": True,
            "referenceMainSignedVolume": reference_main_signed_volume,
            "candidateSignedVolume": candidate_signed_volume,
            "outwardOrientationConsistentWithMain": (
                outward_orientation_consistent
            ),
        },
        "morphEnvelope": {
            "sampleWeights": list(SAMPLE_WEIGHTS),
            "combinationNames": list(COMBINATIONS),
            "maximumInvertedFaceCount": maximum_inverted_faces,
            "maximumDegenerateFaceCount": maximum_degenerate_faces,
            "maximumProjectedDeviationByCamera": (
                maximum_projected_deviation
            ),
            "states": state_reports,
        },
        "decision": {
            "technicalValidationPassed": True,
            "visualValidationPassed": False,
            "promotionApproved": False,
            "stopForReview": True,
        },
    }
    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    with open(output_path, "w", encoding="utf8") as output_file:
        json.dump(report, output_file, indent=2)
        output_file.write("\n")
    print(
        json.dumps(
            {
                "counts": report["counts"],
                "preservation": report["preservation"],
                "normals": report["normals"],
                "morphEnvelope": {
                    "maximumInvertedFaceCount": maximum_inverted_faces,
                    "maximumDegenerateFaceCount": maximum_degenerate_faces,
                    "maximumProjectedDeviationByCamera": (
                        maximum_projected_deviation
                    ),
                },
            },
            indent=2,
        )
    )


validate()

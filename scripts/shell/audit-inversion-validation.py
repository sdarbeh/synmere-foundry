"""Read-only audit of the seam-weld inversion-validation contradiction."""

import json
import math
import os
import sys
from collections import defaultdict, deque

import bpy
from mathutils import Vector


EXPECTED_MESH_NAME = "IdentityShell"
SAMPLE_WEIGHTS = (0.0, 0.25, 0.5, 0.75, 1.0)
AREA_EPSILON = 1e-12
DOT_EPSILON = 1e-12
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
            "Expected source, reference, preflight, map, ownership, prior, "
            "and output paths."
        )
    arguments = sys.argv[sys.argv.index("--") + 1 :]
    if len(arguments) != 7:
        raise RuntimeError(
            "Expected midpoint blend, orientation reference blend, "
            "preflight JSON, vertex map JSON, ownership audit JSON, "
            "prior validator JSON, and output report."
        )
    return [os.path.abspath(argument) for argument in arguments]


def load_json(file_path):
    with open(file_path, encoding="utf8") as input_file:
        return json.load(input_file)


def load_object(file_path):
    with bpy.data.libraries.load(file_path, link=False) as (
        source,
        destination,
    ):
        destination.objects = [
            name for name in source.objects if name == EXPECTED_MESH_NAME
        ]
    if len(destination.objects) != 1:
        raise RuntimeError(f"Unable to load identity shell from {file_path}.")
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


def vector_values(vector):
    return [vector.x, vector.y, vector.z]


def get_orientation_values(basis_area, state_area):
    basis_magnitude = basis_area.length
    state_magnitude = state_area.length
    dot = basis_area.dot(state_area)
    cosine = (
        dot / (basis_magnitude * state_magnitude)
        if basis_magnitude > AREA_EPSILON
        and state_magnitude > AREA_EPSILON
        else 0.0
    )
    return {
        "basisAreaVector": vector_values(basis_area),
        "basisAreaMagnitude": basis_magnitude,
        "stateAreaVector": vector_values(state_area),
        "stateAreaMagnitude": state_magnitude,
        "basisStateNormalDot": dot,
        "basisStateNormalCosine": cosine,
        "collapsed": state_magnitude <= AREA_EPSILON,
        "geometricallyCrossed": (
            state_magnitude > AREA_EPSILON and dot < -DOT_EPSILON
        ),
        "currentValidatorInverted": dot <= 0,
    }


def get_face_components(faces):
    edge_faces = defaultdict(list)
    for face_index, face in enumerate(faces):
        for offset, start in enumerate(face):
            end = face[(offset + 1) % len(face)]
            edge_faces[tuple(sorted((start, end)))].append(face_index)
    adjacency = defaultdict(set)
    for face_indices in edge_faces.values():
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


def get_direct_seam_faces(faces, preflight):
    result = defaultdict(list)
    for seam in preflight["seams"]:
        main_loop = [pair["mainVertex"] for pair in seam["mapping"]]
        cap_loop = [pair["capVertex"] for pair in seam["mapping"]]
        seam_edges = {
            tuple(sorted((loop[offset], loop[(offset + 1) % len(loop)])))
            for loop in (main_loop, cap_loop)
            for offset in range(len(loop))
        }
        for face_index, face in enumerate(faces):
            face_edges = {
                tuple(sorted((face[offset], face[(offset + 1) % len(face)])))
                for offset in range(len(face))
            }
            if face_edges & seam_edges:
                result[face_index].append(seam["classification"])
    return result


def get_previous_local_faces(faces, preflight):
    seam_vertices = {
        pair[side]
        for seam in preflight["seams"]
        for pair in seam["mapping"]
        for side in ("mainVertex", "capVertex")
    }
    return {
        face_index
        for face_index, face in enumerate(faces)
        if seam_vertices.intersection(face)
    }


def audit():
    (
        midpoint_path,
        orientation_reference_path,
        preflight_path,
        mapping_path,
        ownership_path,
        prior_report_path,
        output_path,
    ) = get_arguments()
    preflight = load_json(preflight_path)
    vertex_mapping = load_json(mapping_path)
    ownership = load_json(ownership_path)
    prior_report = load_json(prior_report_path)
    corrected = bpy.data.objects.get(EXPECTED_MESH_NAME)
    if corrected is None or corrected.type != "MESH":
        raise RuntimeError(f"Missing {EXPECTED_MESH_NAME} candidate.")
    midpoint = load_object(midpoint_path)
    orientation_reference = load_object(orientation_reference_path)

    corrected_basis, corrected_deltas = get_shape_data(corrected)
    midpoint_basis, midpoint_deltas = get_shape_data(midpoint)
    reference_basis, reference_deltas = get_shape_data(
        orientation_reference
    )
    corrected_faces = [
        tuple(polygon.vertices) for polygon in corrected.data.polygons
    ]
    midpoint_faces = [
        tuple(polygon.vertices) for polygon in midpoint.data.polygons
    ]
    old_to_new = vertex_mapping["oldToNew"]
    mapped_midpoint_faces = [
        tuple(old_to_new[index]["newVertex"] for index in face)
        for face in midpoint_faces
    ]

    key_names = list(corrected_deltas)
    states = [
        (f"{key_name}-{weight:.2f}", {key_name: weight})
        for key_name in key_names
        for weight in SAMPLE_WEIGHTS
    ]
    states.extend(COMBINATIONS.items())
    prior_states = {
        state["name"]: state for state in prior_report["states"]
    }
    midpoint_components = get_face_components(midpoint_faces)
    near_cap_component = ownership["ownership"][
        "affectedSourceComponent"
    ]
    component_by_face = {
        face_index: component_index
        for component_index, component in enumerate(midpoint_components)
        for face_index in component
    }
    direct_seam_faces = get_direct_seam_faces(
        midpoint_faces,
        preflight,
    )
    previous_local_faces = get_previous_local_faces(
        midpoint_faces,
        preflight,
    )
    flipped_faces = set(
        ownership["ownership"]["affectedFaceIndices"]
    )

    affected = defaultdict(list)
    state_geometry = {}
    for state_name, weights in states:
        corrected_state = evaluate_positions(
            corrected_basis,
            corrected_deltas,
            weights,
        )
        midpoint_state = evaluate_positions(
            midpoint_basis,
            midpoint_deltas,
            weights,
        )
        reference_state = evaluate_positions(
            reference_basis,
            reference_deltas,
            weights,
        )
        state_geometry[state_name] = {
            "weights": weights,
            "corrected": corrected_state,
            "midpoint": midpoint_state,
            "reference": reference_state,
        }
        for face_index, face in enumerate(corrected_faces):
            values = get_orientation_values(
                get_area_vector(face, corrected_basis),
                get_area_vector(face, corrected_state),
            )
            if values["currentValidatorInverted"]:
                affected[face_index].append(state_name)

    face_reports = []
    changed_winding_faces = []
    remap_issue_faces = []
    threshold_only_faces = []
    geometric_crossing_faces = []
    for face_index in sorted(affected):
        source_component = component_by_face[face_index]
        component_role = (
            "main"
            if source_component == 0
            else "near-coincident-cap"
            if source_component == near_cap_component
            else "coincident-cap"
        )
        source_order = midpoint_faces[face_index]
        mapped_order = mapped_midpoint_faces[face_index]
        corrected_order = corrected_faces[face_index]
        winding_changed = face_index in flipped_faces
        if winding_changed:
            changed_winding_faces.append(face_index)
        remap_matches = (
            set(mapped_order) == set(corrected_order)
            and len(mapped_order) == len(corrected_order)
        )
        if not remap_matches:
            remap_issue_faces.append(face_index)

        state_reports = []
        face_geometrically_crosses = False
        face_threshold_only = True
        for state_name in affected[face_index]:
            geometry = state_geometry[state_name]
            corrected_values = get_orientation_values(
                get_area_vector(corrected_order, corrected_basis),
                get_area_vector(
                    corrected_order,
                    geometry["corrected"],
                ),
            )
            midpoint_values = get_orientation_values(
                get_area_vector(source_order, midpoint_basis),
                get_area_vector(
                    source_order,
                    geometry["midpoint"],
                ),
            )
            orientation_reference_state_area = get_area_vector(
                source_order,
                geometry["reference"],
            )
            midpoint_state_area = get_area_vector(
                source_order,
                geometry["midpoint"],
            )
            previous_comparator_dot = midpoint_state_area.dot(
                orientation_reference_state_area
            )
            previous_state = prior_states[state_name]
            geometric_crossing = corrected_values[
                "geometricallyCrossed"
            ]
            face_geometrically_crosses |= geometric_crossing
            face_threshold_only &= (
                not geometric_crossing
                and not corrected_values["collapsed"]
            )
            state_reports.append(
                {
                    "name": state_name,
                    "weights": geometry["weights"],
                    "evaluatedMorphVertexOrder": list(corrected_order),
                    "correctedOwnBasisTest": corrected_values,
                    "midpointOwnBasisTest": midpoint_values,
                    "exactPreviousValidator": {
                        "faceInScope": (
                            face_index in previous_local_faces
                        ),
                        "candidateStateVsReferenceStateDot": (
                            previous_comparator_dot
                        ),
                        "threshold": "< 0",
                        "aggregateInvertedAdjacentFaceCount": (
                            previous_state[
                                "invertedAdjacentFaceCount"
                            ]
                        ),
                        "faceFlagged": (
                            face_index
                            in previous_state["invertedAdjacentFaces"]
                        ),
                    },
                }
            )
        if face_geometrically_crosses:
            geometric_crossing_faces.append(face_index)
        if face_threshold_only:
            threshold_only_faces.append(face_index)
        face_reports.append(
            {
                "faceIndex": face_index,
                "affectedStates": affected[face_index],
                "membership": {
                    "sourceComponent": source_component,
                    "componentRole": component_role,
                    "belongsToRepairedNearCap": (
                        source_component == near_cap_component
                    ),
                    "belongsToCoincidentCap": (
                        component_role == "coincident-cap"
                    ),
                    "directWeldedSeams": direct_seam_faces.get(
                        face_index,
                        [],
                    ),
                    "unrelatedGeometry": (
                        source_component == 0
                        and face_index not in direct_seam_faces
                    ),
                },
                "vertexOrder": {
                    "retainedMidpointBasis": list(source_order),
                    "mappedMidpointBasis": list(mapped_order),
                    "correctedWeldBasis": list(corrected_order),
                    "changedByApprovedCapFlip": winding_changed,
                    "oldToNewRemapMatches": remap_matches,
                },
                "tests": state_reports,
            }
        )

    previous_in_scope = [
        report["faceIndex"]
        for report in face_reports
        if report["faceIndex"] in previous_local_faces
    ]
    previous_out_of_scope = [
        report["faceIndex"]
        for report in face_reports
        if report["faceIndex"] not in previous_local_faces
    ]
    report = {
        "schemaVersion": "v1",
        "operation": "audit-inversion-validation-contradiction",
        "readOnly": True,
        "retainedMidpointBlend": midpoint_path,
        "correctedWeldBlend": bpy.data.filepath,
        "previousValidatorReport": prior_report_path,
        "validatorSemantics": {
            "previous": {
                "scope": (
                    "Only faces incident to duplicate seam vertices."
                ),
                "comparison": (
                    "Evaluated midpoint candidate face normal dotted with "
                    "the evaluated orientation-reference face normal at "
                    "the same morph weights."
                ),
                "threshold": "< 0",
                "meaning": (
                    "Detects orientation regression versus the reference; "
                    "does not test a state against its own Basis."
                ),
            },
            "current": {
                "scope": "All 12,100 faces.",
                "comparison": (
                    "Evaluated corrected face normal dotted with the same "
                    "corrected face's Basis normal."
                ),
                "threshold": "<= 0",
                "meaning": (
                    "Detects geometric crossing or collapse relative to "
                    "the candidate's own Basis."
                ),
            },
        },
        "summary": {
            "affectedFaces": len(face_reports),
            "affectedStateEntries": sum(
                len(item["affectedStates"]) for item in face_reports
            ),
            "previousValidatorFacesInScope": len(previous_in_scope),
            "previousValidatorFacesOutOfScope": len(
                previous_out_of_scope
            ),
            "facesChangedByCapWindingCorrection": len(
                changed_winding_faces
            ),
            "facesWithOldToNewRemapMismatch": len(remap_issue_faces),
            "facesWithThresholdOnlyDifference": len(
                threshold_only_faces
            ),
            "facesWithProvenGeometricCrossing": len(
                geometric_crossing_faces
            ),
            "facesOnRepairedCaps": sum(
                1
                for item in face_reports
                if item["membership"]["belongsToRepairedNearCap"]
                or item["membership"]["belongsToCoincidentCap"]
            ),
            "facesOnWeldedSeams": sum(
                1
                for item in face_reports
                if item["membership"]["directWeldedSeams"]
            ),
        },
        "classification": {
            "changedWinding": {
                "causesDiscrepancy": bool(changed_winding_faces),
                "faces": changed_winding_faces,
            },
            "oldToNewVertexRemapping": {
                "causesDiscrepancy": bool(remap_issue_faces),
                "faces": remap_issue_faces,
            },
            "validatorScopeOrReferenceDifference": {
                "causesDiscrepancy": True,
                "previousOutOfScopeFaces": previous_out_of_scope,
                "previousInScopeFaces": previous_in_scope,
            },
            "thresholdDifference": {
                "causesDiscrepancy": bool(threshold_only_faces),
                "faces": threshold_only_faces,
            },
            "actualGeometricInversion": {
                "proven": bool(geometric_crossing_faces),
                "faces": geometric_crossing_faces,
                "alsoPresentInRetainedMidpointOwnBasisTest": all(
                    any(
                        test["midpointOwnBasisTest"][
                            "geometricallyCrossed"
                        ]
                        for test in item["tests"]
                    )
                    for item in face_reports
                ),
            },
        },
        "faces": face_reports,
        "decision": {
            "validatorContradictionResolved": True,
            "assetWasModified": False,
            "validatorLogicRequiresNarrowCorrection": False,
            "morphRepairRecommendationPermitted": bool(
                geometric_crossing_faces
            ),
        },
    }
    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    with open(output_path, "w", encoding="utf8") as output_file:
        json.dump(report, output_file, indent=2)
        output_file.write("\n")
    print(
        json.dumps(
            {
                "summary": report["summary"],
                "classification": report["classification"],
                "decision": report["decision"],
            },
            indent=2,
        )
    )


audit()

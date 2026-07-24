"""Independently validate the isolated morph-only safety candidate."""

import importlib.util
import json
import os
import sys
from collections import defaultdict, deque

import bpy


EXPECTED_MESH_NAME = "IdentityShell"
EXPECTED_VERTICES = 6052
EXPECTED_FACES = 12100
EXPECTED_MORPHS = 37
POSITION_EPSILON = 1e-7
STRAIN_EPSILON = 2e-6


def arguments():
    values = sys.argv[sys.argv.index("--") + 1 :]
    if len(values) != 4:
        raise RuntimeError(
            "Expected reference blend, repair plan, config, and report."
        )
    return [os.path.abspath(value) for value in values]


def load_json(file_path):
    with open(file_path, encoding="utf8") as input_file:
        return json.load(input_file)


def load_reference(file_path):
    with bpy.data.libraries.load(file_path, link=False) as (
        source,
        destination,
    ):
        destination.objects = [
            name for name in source.objects if name == EXPECTED_MESH_NAME
        ]
    if len(destination.objects) != 1:
        raise RuntimeError("Unable to load reference shell.")
    reference = destination.objects[0]
    reference.name = f"{EXPECTED_MESH_NAME}Reference"
    return reference


def get_shape_data(shell):
    keys = shell.data.shape_keys.key_blocks
    basis = [point.co.copy() for point in keys["Basis"].data]
    names = [key.name for key in keys[1:]]
    deltas = {
        key.name: [
            point.co - basis[index]
            for index, point in enumerate(key.data)
        ]
        for key in keys[1:]
    }
    return basis, names, deltas


def maximum_distance(first, second):
    return max(
        ((left - right).length for left, right in zip(first, second)),
        default=0.0,
    )


def normalized_data_name(name):
    if name and len(name) > 4 and name[-4] == "." and name[-3:].isdigit():
        return name[:-4]
    return name


def topology_report(faces):
    edge_faces = defaultdict(list)
    for face_index, face in enumerate(faces):
        for offset, start in enumerate(face):
            end = face[(offset + 1) % len(face)]
            edge_faces[tuple(sorted((start, end)))].append(
                (face_index, start, end)
            )
    boundary = [
        edge for edge, owners in edge_faces.items() if len(owners) == 1
    ]
    non_manifold = [
        edge for edge, owners in edge_faces.items() if len(owners) > 2
    ]
    winding = [
        edge
        for edge, owners in edge_faces.items()
        if (
            len(owners) == 2
            and owners[0][1:] == owners[1][1:]
        )
    ]
    adjacency = defaultdict(set)
    for owners in edge_faces.values():
        if len(owners) != 2:
            continue
        first, second = owners[0][0], owners[1][0]
        adjacency[first].add(second)
        adjacency[second].add(first)
    remaining = set(range(len(faces)))
    components = 0
    while remaining:
        components += 1
        queue = deque([remaining.pop()])
        while queue:
            for neighbor in adjacency[queue.popleft()]:
                if neighbor in remaining:
                    remaining.remove(neighbor)
                    queue.append(neighbor)
    return {
        "components": components,
        "boundaryEdges": len(boundary),
        "nonManifoldEdges": len(non_manifold),
        "windingConflicts": len(winding),
    }


def main():
    reference_path, plan_path, config_path, report_path = arguments()
    plan = load_json(plan_path)
    config = load_json(config_path)
    planner_path = os.path.join(
        os.path.dirname(__file__),
        "plan-global-morph-safety-repair.py",
    )
    module_spec = importlib.util.spec_from_file_location(
        "morph_repair_planner",
        planner_path,
    )
    planner = importlib.util.module_from_spec(module_spec)
    module_spec.loader.exec_module(planner)

    candidate = bpy.data.objects.get(EXPECTED_MESH_NAME)
    if candidate is None:
        raise RuntimeError("Missing candidate shell.")
    reference = load_reference(reference_path)
    candidate_basis, candidate_names, candidate_deltas = get_shape_data(
        candidate
    )
    reference_basis, reference_names, reference_deltas = get_shape_data(
        reference
    )
    candidate_faces = [
        tuple(polygon.vertices) for polygon in candidate.data.polygons
    ]
    reference_faces = [
        tuple(polygon.vertices) for polygon in reference.data.polygons
    ]
    if (
        len(candidate_basis) != EXPECTED_VERTICES
        or len(candidate_faces) != EXPECTED_FACES
        or len(candidate_names) != EXPECTED_MORPHS
    ):
        raise RuntimeError("Candidate asset counts are invalid.")

    planned = {target["name"]: target for target in plan["targets"]}
    unrelated_movement = 0.0
    outside_scope_movement = 0.0
    planned_delta_error = 0.0
    for key_name in candidate_names:
        allowed = set(planned.get(key_name, {}).get("changedVertices", []))
        expected = {
            row["vertex"]: row["value"]
            for row in planned.get(key_name, {}).get("changedDeltas", [])
        }
        for vertex, (source_delta, candidate_delta) in enumerate(
            zip(reference_deltas[key_name], candidate_deltas[key_name])
        ):
            movement = (source_delta - candidate_delta).length
            if key_name not in planned:
                unrelated_movement = max(unrelated_movement, movement)
            elif vertex not in allowed:
                outside_scope_movement = max(
                    outside_scope_movement,
                    movement,
                )
            else:
                planned_delta_error = max(
                    planned_delta_error,
                    (
                        candidate_delta
                        - planner.Vector(expected[vertex])
                    ).length,
                )

    local_regression = {
        "basisMaximumMovement": maximum_distance(
            reference_basis,
            candidate_basis,
        ),
        "topologyUnchanged": candidate_faces == reference_faces,
        "morphNamesAndOrderUnchanged": (
            candidate_names == reference_names
        ),
        "materialsUnchanged": [
            normalized_data_name(
                slot.material.name if slot.material else None
            )
            for slot in candidate.material_slots
        ]
        == [
            normalized_data_name(
                slot.material.name if slot.material else None
            )
            for slot in reference.material_slots
        ],
        "unrelatedMorphMaximumMovement": unrelated_movement,
        "outsideApprovedScopeMaximumMovement": outside_scope_movement,
        "plannedDeltaMaximumError": planned_delta_error,
        "topology": topology_report(candidate_faces),
    }
    local_regression["passed"] = (
        local_regression["basisMaximumMovement"] <= POSITION_EPSILON
        and local_regression["topologyUnchanged"]
        and local_regression["morphNamesAndOrderUnchanged"]
        and local_regression["materialsUnchanged"]
        and unrelated_movement <= POSITION_EPSILON
        and outside_scope_movement <= POSITION_EPSILON
        and planned_delta_error <= POSITION_EPSILON
        and local_regression["topology"]
        == {
            "components": 1,
            "boundaryEdges": 0,
            "nonManifoldEdges": 0,
            "windingConflicts": 0,
        }
    )
    if not local_regression["passed"]:
        raise RuntimeError(
            "Local regression validation failed: "
            + json.dumps(local_regression, separators=(",", ":"))
        )

    edges, _ = planner.get_topology(
        candidate_faces,
        len(candidate_basis),
    )
    basis_areas = [
        planner.get_area_vector(face, candidate_basis)
        for face in candidate_faces
    ]
    states = [
        (f"{key_name}-{weight:.2f}", {key_name: weight})
        for key_name in candidate_names
        for weight in planner.SAMPLE_WEIGHTS
    ]
    states.extend(planner.COMBINATIONS.items())
    candidate_states = []
    reference_states = []
    for state_name, weights in states:
        candidate_metrics = planner.get_state_metrics(
            planner.evaluate_positions(
                candidate_basis,
                candidate_deltas,
                weights,
            ),
            basis_areas,
            candidate_faces,
            set(),
        )
        reference_metrics = planner.get_state_metrics(
            planner.evaluate_positions(
                reference_basis,
                reference_deltas,
                weights,
            ),
            basis_areas,
            reference_faces,
            set(),
        )
        candidate_states.append(
            {"name": state_name, "weights": weights, **candidate_metrics}
        )
        reference_states.append(
            {"name": state_name, "weights": weights, **reference_metrics}
        )

    maximum_strain = {}
    source_maximum_strain = {}
    minimum_effective_length = (
        0.012 / config["thresholds"]["maximumMorphEdgeStrain"]
    )
    for key_name in candidate_names:
        maximum_strain[key_name] = planner.get_edge_strain(
            candidate_basis,
            candidate_deltas[key_name],
            edges,
            minimum_effective_length,
        )
        source_maximum_strain[key_name] = planner.get_edge_strain(
            reference_basis,
            reference_deltas[key_name],
            edges,
            minimum_effective_length,
        )
    strain_regressions = [
        key_name
        for key_name in candidate_names
        if maximum_strain[key_name]
        > max(
            config["thresholds"]["maximumMorphEdgeStrain"],
            source_maximum_strain[key_name],
        )
        + STRAIN_EPSILON
    ]

    review = config["review"]
    cameras = {
        name: planner.glb_to_blender(position)
        for name, position in review["cameras"].items()
    }
    target = planner.glb_to_blender(review["target"])
    silhouette = {name: 0.0 for name in cameras}
    silhouette_state = {name: None for name in cameras}
    for state_name, weights in states:
        source_positions = planner.evaluate_positions(
            reference_basis,
            reference_deltas,
            weights,
        )
        candidate_positions = planner.evaluate_positions(
            candidate_basis,
            candidate_deltas,
            weights,
        )
        for camera_name, camera in cameras.items():
            source_hull = planner.convex_hull(
                [
                    planner.project_pixel(
                        position,
                        camera,
                        target,
                        review["orthographicScale"],
                        review["resolution"],
                    )
                    for position in source_positions
                ]
            )
            candidate_hull = planner.convex_hull(
                [
                    planner.project_pixel(
                        position,
                        camera,
                        target,
                        review["orthographicScale"],
                        review["resolution"],
                    )
                    for position in candidate_positions
                ]
            )
            deviation = planner.hull_deviation(
                source_hull,
                candidate_hull,
            )
            if deviation > silhouette[camera_name]:
                silhouette[camera_name] = deviation
                silhouette_state[camera_name] = state_name
    silhouette_limits = {
        name: values["approvedLocalCorrection"]
        for name, values in config["thresholds"][
            "maximumSilhouetteDeviationPixels"
        ].items()
    }
    silhouette_passed = all(
        silhouette[name] <= silhouette_limits[name]
        for name in cameras
    )

    source_minimum_area = min(
        state["minimumAreaRatio"] for state in reference_states
    )
    source_maximum_area = max(
        state["maximumAreaRatio"] for state in reference_states
    )
    candidate_minimum_area = min(
        state["minimumAreaRatio"] for state in candidate_states
    )
    candidate_maximum_area = max(
        state["maximumAreaRatio"] for state in candidate_states
    )
    global_safety = {
        "sampledStates": len(candidate_states),
        "invertedStateCount": sum(
            bool(state["invertedFaces"]) for state in candidate_states
        ),
        "maximumInvertedFaces": max(
            len(state["invertedFaces"]) for state in candidate_states
        ),
        "degenerateStateCount": sum(
            bool(state["degenerateFaces"]) for state in candidate_states
        ),
        "maximumDegenerateFaces": max(
            len(state["degenerateFaces"]) for state in candidate_states
        ),
        "sourceMinimumAreaRatio": source_minimum_area,
        "sourceMaximumAreaRatio": source_maximum_area,
        "minimumAreaRatio": candidate_minimum_area,
        "maximumAreaRatio": candidate_maximum_area,
        "areaEnvelopeNotWorseThanSource": (
            candidate_minimum_area
            >= source_minimum_area - POSITION_EPSILON
            and candidate_maximum_area
            <= source_maximum_area + POSITION_EPSILON
        ),
        "strainRegressions": strain_regressions,
        "silhouetteDeviationPixels": silhouette,
        "silhouetteWorstState": silhouette_state,
        "silhouetteLimitsPixels": silhouette_limits,
        "silhouettePassed": silhouette_passed,
    }
    global_safety["passed"] = (
        global_safety["sampledStates"] == 193
        and global_safety["maximumInvertedFaces"] == 0
        and global_safety["maximumDegenerateFaces"] == 0
        and global_safety["areaEnvelopeNotWorseThanSource"]
        and not strain_regressions
        and silhouette_passed
    )
    if not global_safety["passed"]:
        raise RuntimeError("Global asset safety validation failed.")

    report = {
        "schemaVersion": "v1",
        "operation": "validate-global-morph-safety-repair",
        "candidateBlend": bpy.data.filepath,
        "referenceBlend": reference_path,
        "localRegressionValidation": local_regression,
        "globalAssetSafetyValidation": global_safety,
        "decision": {
            "passed": True,
            "promotionApproved": False,
        },
    }
    os.makedirs(os.path.dirname(report_path), exist_ok=True)
    with open(report_path, "w", encoding="utf8") as output_file:
        json.dump(report, output_file, indent=2)
        output_file.write("\n")
    print(json.dumps(report, indent=2))


main()

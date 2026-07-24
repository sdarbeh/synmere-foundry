"""Plan a bounded morph-only repair for proven global face inversions."""

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
STRAIN_COMPARISON_EPSILON = 2e-6
AREA_EPSILON = 1e-12
ROOT_WEIGHT = 1.0
SUPPORT_RING_WEIGHTS = (0.8, 0.6, 0.4, 0.2)
REPAIRED_FACE_MINIMUM_AREA_RATIO = 0.35
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
            "Expected inversion audit, config, and output paths."
        )
    arguments = sys.argv[sys.argv.index("--") + 1 :]
    if len(arguments) != 3:
        raise RuntimeError(
            "Expected inversion audit JSON, review config JSON, "
            "and output plan."
        )
    return [os.path.abspath(argument) for argument in arguments]


def load_json(file_path):
    with open(file_path, encoding="utf8") as input_file:
        return json.load(input_file)


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


def get_topology(faces, vertex_count):
    edges = set()
    neighbors = [set() for _ in range(vertex_count)]
    for face in faces:
        for offset, start in enumerate(face):
            end = face[(offset + 1) % len(face)]
            edges.add(tuple(sorted((start, end))))
            neighbors[start].add(end)
            neighbors[end].add(start)
    return sorted(edges), neighbors


def get_area_vector(face, positions):
    origin = positions[face[0]]
    area = Vector()
    for offset in range(1, len(face) - 1):
        area += (
            positions[face[offset]] - origin
        ).cross(positions[face[offset + 1]] - origin) * 0.5
    return area


def evaluate_positions(basis, deltas, weights):
    positions = [position.copy() for position in basis]
    for key_name, weight in weights.items():
        for index, delta in enumerate(deltas[key_name]):
            positions[index] += delta * weight
    return positions


def get_state_metrics(positions, basis_areas, faces, seed_faces):
    inverted = []
    degenerate = []
    seed_area_ratios = []
    minimum_area_ratio = math.inf
    maximum_area_ratio = 0.0
    for face_index, face in enumerate(faces):
        state_area = get_area_vector(face, positions)
        basis_area = basis_areas[face_index]
        if state_area.length <= AREA_EPSILON:
            degenerate.append(face_index)
            continue
        area_ratio = state_area.length / basis_area.length
        minimum_area_ratio = min(minimum_area_ratio, area_ratio)
        maximum_area_ratio = max(maximum_area_ratio, area_ratio)
        if state_area.dot(basis_area) <= 0:
            inverted.append(face_index)
        if face_index in seed_faces:
            seed_area_ratios.append(area_ratio)
    return {
        "invertedFaces": inverted,
        "degenerateFaces": degenerate,
        "minimumAreaRatio": (
            minimum_area_ratio if math.isfinite(minimum_area_ratio) else 1.0
        ),
        "maximumAreaRatio": maximum_area_ratio,
        "minimumSeedAreaRatio": min(seed_area_ratios, default=1.0),
    }


def get_edge_strain(basis, delta, edges, minimum_effective_length):
    return max(
        (
            (delta[end] - delta[start]).length
            / max(
                (basis[end] - basis[start]).length,
                minimum_effective_length,
            )
            for start, end in edges
        ),
        default=0.0,
    )


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


def convex_hull(points):
    unique = sorted({(point.x, point.y) for point in points})
    if len(unique) <= 1:
        return [Vector(point) for point in unique]

    def cross(origin, first, second):
        return (
            (first[0] - origin[0]) * (second[1] - origin[1])
            - (first[1] - origin[1]) * (second[0] - origin[0])
        )

    lower = []
    for point in unique:
        while (
            len(lower) >= 2
            and cross(lower[-2], lower[-1], point) <= 0
        ):
            lower.pop()
        lower.append(point)
    upper = []
    for point in reversed(unique):
        while (
            len(upper) >= 2
            and cross(upper[-2], upper[-1], point) <= 0
        ):
            upper.pop()
        upper.append(point)
    return [Vector(point) for point in lower[:-1] + upper[:-1]]


def point_segment_distance(point, start, end):
    segment = end - start
    if segment.length_squared <= AREA_EPSILON:
        return (point - start).length
    amount = max(
        0.0,
        min(
            1.0,
            (point - start).dot(segment) / segment.length_squared,
        ),
    )
    return (point - (start + segment * amount)).length


def hull_deviation(first, second):
    def directed(source, target):
        return max(
            min(
                point_segment_distance(
                    point,
                    target[index],
                    target[(index + 1) % len(target)],
                )
                for index in range(len(target))
            )
            for point in source
        )

    return max(directed(first, second), directed(second, first))


def glb_to_blender(values):
    return Vector((values[0], -values[2], values[1]))


def get_region(seed_faces, faces, neighbors):
    root = {
        vertex
        for face_index in seed_faces
        for vertex in faces[face_index]
    }
    rings = []
    visited = set(root)
    frontier = set(root)
    for _ in SUPPORT_RING_WEIGHTS:
        ring = {
            neighbor
            for vertex in frontier
            for neighbor in neighbors[vertex]
            if neighbor not in visited
        }
        rings.append(ring)
        visited.update(ring)
        frontier = ring
    weights = {vertex: ROOT_WEIGHT for vertex in root}
    for ring, weight in zip(rings, SUPPORT_RING_WEIGHTS):
        weights.update({vertex: weight for vertex in ring})
    return root, rings, weights


def smooth_delta(delta, neighbors, region_weights, strength):
    result = [value.copy() for value in delta]
    for vertex, weight in region_weights.items():
        neighbor_delta = sum(
            (delta[index] for index in neighbors[vertex]),
            Vector(),
        ) / len(neighbors[vertex])
        result[vertex] = delta[vertex].lerp(
            neighbor_delta,
            strength * weight,
        )
    return result


def attenuate_delta(delta, region_weights, strength):
    result = [value.copy() for value in delta]
    for vertex, weight in region_weights.items():
        result[vertex] *= 1.0 - strength * weight
    return result


def translate_delta(delta, root, region_weights, strength):
    result = [value.copy() for value in delta]
    root_translation = sum(
        (delta[vertex] for vertex in root),
        Vector(),
    ) / len(root)
    for vertex, weight in region_weights.items():
        result[vertex] -= root_translation * strength * weight
    return result


def harmonic_attenuate_delta(
    delta,
    neighbors,
    root,
    support,
    strength,
):
    correction = {
        vertex: -delta[vertex] * strength for vertex in root
    }
    correction.update({vertex: Vector() for vertex in support})
    region = set(correction)
    # Solve a bounded discrete harmonic extension with zero outside the region.
    for _ in range(40):
        updated = dict(correction)
        for vertex in support:
            updated[vertex] = sum(
                (
                    correction.get(neighbor, Vector())
                    for neighbor in neighbors[vertex]
                ),
                Vector(),
            ) / len(neighbors[vertex])
        correction = updated
    result = [value.copy() for value in delta]
    for vertex in region:
        result[vertex] += correction[vertex]
    return result


def harmonic_equalize_delta(
    delta,
    neighbors,
    root,
    support,
    strength,
):
    mean_delta = sum(
        (delta[vertex] for vertex in root),
        Vector(),
    ) / len(root)
    correction = {
        vertex: (mean_delta - delta[vertex]) * strength
        for vertex in root
    }
    correction.update({vertex: Vector() for vertex in support})
    for _ in range(40):
        updated = dict(correction)
        for vertex in support:
            updated[vertex] = sum(
                (
                    correction.get(neighbor, Vector())
                    for neighbor in neighbors[vertex]
                ),
                Vector(),
            ) / len(neighbors[vertex])
        correction = updated
    result = [value.copy() for value in delta]
    for vertex, value in correction.items():
        result[vertex] += value
    return result


def project_axis_safe_delta(
    delta,
    basis,
    faces,
    edges,
    root,
    support,
    seed_faces,
    minimum_area_ratio,
    maximum_edge_strain,
    minimum_effective_length,
):
    region = root | support
    axis = max(
        range(3),
        key=lambda candidate: sum(
            abs(delta[vertex][candidate]) for vertex in root
        ),
    )
    correction = {vertex: 0.0 for vertex in region}
    state = [
        basis[index] + delta[index] for index in range(len(basis))
    ]
    face_constraints = []
    for face_index in seed_faces:
        face = faces[face_index]
        basis_area = get_area_vector(face, basis)
        state_area = get_area_vector(face, state)
        coefficients = {}
        for vertex in face:
            moved = [position.copy() for position in state]
            moved[vertex][axis] += 1.0
            coefficients[vertex] = (
                get_area_vector(face, moved).dot(basis_area)
                - state_area.dot(basis_area)
            )
        face_constraints.append(
            {
                "coefficients": coefficients,
                "initial": state_area.dot(basis_area),
                "target": minimum_area_ratio
                * basis_area.length_squared,
            }
        )
    edge_constraints = []
    for start, end in edges:
        if start not in region and end not in region:
            continue
        base_difference = delta[end] - delta[start]
        effective_length = max(
            (basis[end] - basis[start]).length,
            minimum_effective_length,
        )
        original_strain = base_difference.length / effective_length
        allowed_length = max(
            maximum_edge_strain,
            original_strain,
        ) * effective_length
        other_squared = sum(
            base_difference[component] ** 2
            for component in range(3)
            if component != axis
        )
        allowed_axis = math.sqrt(
            max(0.0, allowed_length**2 - other_squared)
        )
        edge_constraints.append(
            {
                "start": start,
                "end": end,
                "base": base_difference[axis],
                "minimum": -allowed_axis,
                "maximum": allowed_axis,
            }
        )
    for _ in range(16000):
        maximum_violation = 0.0
        for constraint in face_constraints:
            current = constraint["initial"] + sum(
                coefficient * correction[vertex]
                for vertex, coefficient
                in constraint["coefficients"].items()
            )
            deficit = constraint["target"] - current
            maximum_violation = max(maximum_violation, deficit)
            if deficit <= 1e-14:
                continue
            denominator = sum(
                coefficient**2
                for coefficient in constraint[
                    "coefficients"
                ].values()
            )
            for vertex, coefficient in constraint[
                "coefficients"
            ].items():
                correction[vertex] += deficit * coefficient / denominator
        for constraint in edge_constraints:
            start = constraint["start"]
            end = constraint["end"]
            difference = (
                constraint["base"]
                + correction.get(end, 0.0)
                - correction.get(start, 0.0)
            )
            clamped = min(
                constraint["maximum"],
                max(constraint["minimum"], difference),
            )
            violation = difference - clamped
            maximum_violation = max(
                maximum_violation,
                abs(violation),
            )
            if abs(violation) <= 1e-14:
                continue
            start_variable = start in correction
            end_variable = end in correction
            if start_variable and end_variable:
                correction[start] += violation * 0.5
                correction[end] -= violation * 0.5
            elif start_variable:
                correction[start] += violation
            elif end_variable:
                correction[end] -= violation
        if maximum_violation <= 1e-12:
            break
    result = [value.copy() for value in delta]
    for vertex, value in correction.items():
        result[vertex][axis] += value
    return result, axis


def plan():
    audit_path, config_path, output_path = get_arguments()
    audit = load_json(audit_path)
    config = load_json(config_path)
    shell = bpy.data.objects.get(EXPECTED_MESH_NAME)
    if shell is None or shell.type != "MESH":
        raise RuntimeError(f"Missing {EXPECTED_MESH_NAME} shell.")
    basis, original_deltas = get_shape_data(shell)
    faces = [
        tuple(polygon.vertices) for polygon in shell.data.polygons
    ]
    edges, neighbors = get_topology(faces, len(basis))
    basis_areas = [get_area_vector(face, basis) for face in faces]
    if any(area.length <= AREA_EPSILON for area in basis_areas):
        raise RuntimeError("Basis contains a degenerate face.")

    states = [
        (f"{key_name}-{weight:.2f}", {key_name: weight})
        for key_name in original_deltas
        for weight in SAMPLE_WEIGHTS
    ]
    states.extend(COMBINATIONS.items())
    seed_faces_by_target = defaultdict(set)
    for face in audit["faces"]:
        for test in face["tests"]:
            weights = test["weights"]
            if len(weights) == 1:
                seed_faces_by_target[next(iter(weights))].add(
                    face["faceIndex"]
                )
    target_names = [
        key_name
        for key_name in original_deltas
        if key_name in seed_faces_by_target
    ]
    if len(target_names) != 8:
        raise RuntimeError(
            f"Expected eight root morphs, found {len(target_names)}."
        )

    threshold = config["thresholds"]
    maximum_edge_strain = threshold["maximumMorphEdgeStrain"]
    minimum_effective_length = 0.012 / maximum_edge_strain
    repaired_deltas = {
        name: [value.copy() for value in delta]
        for name, delta in original_deltas.items()
    }
    target_plans = []
    all_changed_vertices = set()

    for target_name in target_names:
        seed_faces = seed_faces_by_target[target_name]
        root, support_rings, region_weights = get_region(
            seed_faces,
            faces,
            neighbors,
        )
        support = set().union(*support_rings)
        target_states = [
            (state_name, weights)
            for state_name, weights in states
            if target_name in weights
        ]
        original_edge_strain = get_edge_strain(
            basis,
            original_deltas[target_name],
            edges,
            minimum_effective_length,
        )
        allowed_edge_strain = (
            max(maximum_edge_strain, original_edge_strain)
            + STRAIN_COMPARISON_EPSILON
        )

        def evaluate_candidate(candidate_delta):
            candidate_deltas = {
                **repaired_deltas,
                target_name: candidate_delta,
            }
            state_results = []
            for state_name, weights in target_states:
                metrics = get_state_metrics(
                    evaluate_positions(
                        basis,
                        candidate_deltas,
                        weights,
                    ),
                    basis_areas,
                    faces,
                    seed_faces,
                )
                state_results.append(
                    {
                        "name": state_name,
                        **metrics,
                    }
                )
            edge_strain = get_edge_strain(
                basis,
                candidate_delta,
                edges,
                minimum_effective_length,
            )
            passes = (
                all(
                    not result["invertedFaces"]
                    and not result["degenerateFaces"]
                    and result["minimumSeedAreaRatio"]
                    >= REPAIRED_FACE_MINIMUM_AREA_RATIO
                    for result in state_results
                )
                and edge_strain <= allowed_edge_strain
            )
            return passes, candidate_delta, state_results, edge_strain

        def evaluate_strength(strength, method):
            if method == "smooth":
                candidate_delta = smooth_delta(
                    original_deltas[target_name],
                    neighbors,
                    region_weights,
                    strength,
                )
            elif method == "hybrid":
                attenuated = attenuate_delta(
                    original_deltas[target_name],
                    region_weights,
                    strength,
                )
                candidate_delta = smooth_delta(
                    attenuated,
                    neighbors,
                    region_weights,
                    strength,
                )
            elif method == "translate":
                candidate_delta = translate_delta(
                    original_deltas[target_name],
                    root,
                    region_weights,
                    strength,
                )
            elif method == "harmonic":
                candidate_delta = harmonic_attenuate_delta(
                    original_deltas[target_name],
                    neighbors,
                    root,
                    support,
                    strength,
                )
            elif method == "equalize":
                candidate_delta = harmonic_equalize_delta(
                    original_deltas[target_name],
                    neighbors,
                    root,
                    support,
                    strength,
                )
            else:
                candidate_delta = attenuate_delta(
                    original_deltas[target_name],
                    region_weights,
                    strength,
                )
            return evaluate_candidate(candidate_delta)

        method_candidates = []
        method_diagnostics = {}
        projected_targets = {
            "identity_nose_projection_low",
            "identity_jaw_taper_square",
        }
        if target_name in projected_targets:
            projected_delta, projected_axis = project_axis_safe_delta(
                original_deltas[target_name],
                basis,
                faces,
                edges,
                root,
                support,
                seed_faces,
                REPAIRED_FACE_MINIMUM_AREA_RATIO,
                maximum_edge_strain,
                minimum_effective_length,
            )
            projected_evaluation = evaluate_candidate(projected_delta)
            method_diagnostics["project-axis"] = [
                {
                    "passes": projected_evaluation[0],
                    "maximumEdgeStrain": projected_evaluation[3],
                    "invertedFaces": sum(
                        len(result["invertedFaces"])
                        for result in projected_evaluation[2]
                    ),
                    "degenerateFaces": sum(
                        len(result["degenerateFaces"])
                        for result in projected_evaluation[2]
                    ),
                    "minimumSeedAreaRatio": min(
                        result["minimumSeedAreaRatio"]
                        for result in projected_evaluation[2]
                    ),
                }
            ]
            if projected_evaluation[0]:
                method_candidates.append(
                    {
                        "method": f"project-axis-{projected_axis}",
                        "strength": 1.0,
                        "maximumChange": max(
                            (
                                projected_delta[vertex]
                                - original_deltas[target_name][vertex]
                            ).length
                            for vertex in region_weights
                        ),
                        "evaluated": projected_evaluation,
                    }
                )
        methods = (
            ()
            if target_name in projected_targets
            else ("smooth", "attenuate", "equalize")
        )
        for method in methods:
            passing_interval = None
            diagnostic_samples = []
            previous_strength = 0.0
            for sample_index in range(101):
                sample_strength = sample_index / 100
                (
                    sample_passes,
                    _,
                    sample_state_results,
                    sample_edge_strain,
                ) = evaluate_strength(sample_strength, method)
                diagnostic_samples.append(
                    {
                        "strength": sample_strength,
                        "passes": sample_passes,
                        "maximumEdgeStrain": sample_edge_strain,
                        "invertedFaces": sum(
                            len(result["invertedFaces"])
                            for result in sample_state_results
                        ),
                        "degenerateFaces": sum(
                            len(result["degenerateFaces"])
                            for result in sample_state_results
                        ),
                        "minimumSeedAreaRatio": min(
                            result["minimumSeedAreaRatio"]
                            for result in sample_state_results
                        ),
                    }
                )
                if sample_passes:
                    passing_interval = (
                        previous_strength,
                        sample_strength,
                    )
                    break
                previous_strength = sample_strength
            method_diagnostics[method] = diagnostic_samples
            if passing_interval is None:
                continue

            low, high = passing_interval
            for _ in range(40):
                midpoint = (low + high) * 0.5
                passes, _, _, _ = evaluate_strength(midpoint, method)
                if passes:
                    high = midpoint
                else:
                    low = midpoint
            for margin in (0.002, 0.001, 0.0005, 0.0001, 0.0):
                strength = min(1.0, high + margin)
                evaluated = evaluate_strength(strength, method)
                if not evaluated[0]:
                    continue
                candidate_delta = evaluated[1]
                maximum_change = max(
                    (
                        candidate_delta[vertex]
                        - original_deltas[target_name][vertex]
                    ).length
                    for vertex in region_weights
                )
                method_candidates.append(
                    {
                        "method": method,
                        "strength": strength,
                        "maximumChange": maximum_change,
                        "evaluated": evaluated,
                    }
                )
                break
        if not method_candidates:
            raise RuntimeError(
                f"{len(SUPPORT_RING_WEIGHTS)} support rings cannot safely "
                "repair "
                f"{target_name}: "
                + json.dumps(
                    {
                        method: sorted(
                            samples,
                            key=lambda sample: (
                                sample["invertedFaces"]
                                + sample["degenerateFaces"],
                                max(
                                    0.0,
                                    sample["maximumEdgeStrain"]
                                    - maximum_edge_strain,
                                ),
                                max(
                                    0.0,
                                    REPAIRED_FACE_MINIMUM_AREA_RATIO
                                    - sample["minimumSeedAreaRatio"],
                                ),
                            ),
                        )[:3]
                        for method, samples in method_diagnostics.items()
                    }
                    | {
                        "zeroInversionSamples": {
                            method: sorted(
                                (
                                    sample
                                    for sample in samples
                                    if (
                                        sample["invertedFaces"] == 0
                                        and sample["degenerateFaces"] == 0
                                    )
                                ),
                                key=lambda sample: (
                                    -sample["minimumSeedAreaRatio"],
                                    sample["maximumEdgeStrain"],
                                ),
                            )[:5]
                            for method, samples
                            in method_diagnostics.items()
                        }
                    },
                    separators=(",", ":"),
                )
            )
        selected = min(
            method_candidates,
            key=lambda candidate: (
                candidate["maximumChange"],
                candidate["strength"],
                candidate["method"],
            ),
        )
        method = selected["method"]
        strength = selected["strength"]
        (
            passes,
            candidate_delta,
            state_results,
            edge_strain,
        ) = selected["evaluated"]
        repaired_deltas[target_name] = candidate_delta
        changed_vertices = {
            vertex
            for vertex in region_weights
            if (
                candidate_delta[vertex]
                - original_deltas[target_name][vertex]
            ).length
            > POSITION_EPSILON
        }
        all_changed_vertices.update(changed_vertices)
        target_plans.append(
            {
                "name": target_name,
                "seedFaces": sorted(seed_faces),
                "rootVertices": sorted(root),
                "supportVertices": sorted(support),
                "supportRingVertices": [
                    sorted(ring) for ring in support_rings
                ],
                "changedVertices": sorted(changed_vertices),
                "changedDeltas": [
                    {
                        "vertex": vertex,
                        "value": list(candidate_delta[vertex]),
                    }
                    for vertex in sorted(changed_vertices)
                ],
                "method": method,
                "strength": strength,
                "rootWeight": ROOT_WEIGHT,
                "supportRingWeights": list(SUPPORT_RING_WEIGHTS),
                "maximumEdgeStrain": edge_strain,
                "originalMaximumEdgeStrain": original_edge_strain,
                "allowedMaximumEdgeStrain": allowed_edge_strain,
                "stateResults": state_results,
            }
        )

    global_state_results = []
    original_global_state_results = []
    for state_name, weights in states:
        original_metrics = get_state_metrics(
            evaluate_positions(basis, original_deltas, weights),
            basis_areas,
            faces,
            set(),
        )
        metrics = get_state_metrics(
            evaluate_positions(basis, repaired_deltas, weights),
            basis_areas,
            faces,
            set(),
        )
        global_state_results.append(
            {
                "name": state_name,
                "weights": weights,
                **metrics,
            }
        )
        original_global_state_results.append(
            {
                "name": state_name,
                "weights": weights,
                **original_metrics,
            }
        )
    if any(
        result["invertedFaces"] or result["degenerateFaces"]
        for result in global_state_results
    ):
        raise RuntimeError("Planned repair does not clear the global envelope.")
    source_minimum_area_ratio = min(
        result["minimumAreaRatio"]
        for result in original_global_state_results
    )
    source_maximum_area_ratio = max(
        result["maximumAreaRatio"]
        for result in original_global_state_results
    )
    candidate_minimum_area_ratio = min(
        result["minimumAreaRatio"]
        for result in global_state_results
    )
    candidate_maximum_area_ratio = max(
        result["maximumAreaRatio"]
        for result in global_state_results
    )
    if (
        candidate_minimum_area_ratio
        < source_minimum_area_ratio - POSITION_EPSILON
        or candidate_maximum_area_ratio
        > source_maximum_area_ratio + POSITION_EPSILON
    ):
        raise RuntimeError(
            "Planned repair worsens the retained global area envelope."
        )

    review = config["review"]
    cameras = {
        name: glb_to_blender(position)
        for name, position in review["cameras"].items()
    }
    target = glb_to_blender(review["target"])
    silhouette_deviation = {name: 0.0 for name in cameras}
    silhouette_worst_state = {name: None for name in cameras}
    for state_name, weights in states:
        original_positions = evaluate_positions(
            basis,
            original_deltas,
            weights,
        )
        repaired_positions = evaluate_positions(
            basis,
            repaired_deltas,
            weights,
        )
        for camera_name, camera in cameras.items():
            original_hull = convex_hull(
                [
                    project_pixel(
                        position,
                        camera,
                        target,
                        review["orthographicScale"],
                        review["resolution"],
                    )
                    for position in original_positions
                ]
            )
            repaired_hull = convex_hull(
                [
                    project_pixel(
                        position,
                        camera,
                        target,
                        review["orthographicScale"],
                        review["resolution"],
                    )
                    for position in repaired_positions
                ]
            )
            deviation = hull_deviation(original_hull, repaired_hull)
            if deviation > silhouette_deviation[camera_name]:
                silhouette_deviation[camera_name] = deviation
                silhouette_worst_state[camera_name] = state_name
    silhouette_limits = {
        name: value["approvedLocalCorrection"]
        for name, value in threshold[
            "maximumSilhouetteDeviationPixels"
        ].items()
    }
    if any(
        silhouette_deviation[name] > silhouette_limits[name]
        for name in cameras
    ):
        raise RuntimeError(
            "Planned repair exceeds a silhouette deviation gate: "
            f"{silhouette_deviation}; states: {silhouette_worst_state}; "
            "jaw repair: "
            + json.dumps(
                {
                    key: value
                    for key, value in next(
                    target
                    for target in target_plans
                    if target["name"] == "identity_jaw_taper_square"
                    ).items()
                    if key in {
                        "name",
                        "method",
                        "strength",
                        "seedFaces",
                        "rootVertices",
                        "supportRingVertices",
                        "maximumEdgeStrain",
                        "originalMaximumEdgeStrain",
                    }
                },
                separators=(",", ":"),
            )
        )

    report = {
        "schemaVersion": "v1",
        "operation": "plan-global-morph-safety-repair",
        "readOnly": True,
        "sourceBlend": bpy.data.filepath,
        "contract": {
            "basisFrozen": True,
            "topologyFrozen": True,
            "windingFrozen": True,
            "materialsFrozen": True,
            "unrelatedMorphsFrozen": True,
            "supportRings": len(SUPPORT_RING_WEIGHTS),
            "repairMethod": (
                "Minimum bounded local morph-delta correction selected from "
                "Laplacian smoothing or attenuation over failing face "
                "vertices and one support ring."
            ),
        },
        "targets": target_plans,
        "changedVertexUnion": sorted(all_changed_vertices),
        "globalEnvelope": {
            "sampledStates": len(global_state_results),
            "sourceMaximumInvertedFaces": max(
                len(result["invertedFaces"])
                for result in original_global_state_results
            ),
            "sourceMaximumDegenerateFaces": max(
                len(result["degenerateFaces"])
                for result in original_global_state_results
            ),
            "sourceMinimumAreaRatio": source_minimum_area_ratio,
            "sourceMaximumAreaRatio": source_maximum_area_ratio,
            "maximumInvertedFaces": max(
                len(result["invertedFaces"])
                for result in global_state_results
            ),
            "maximumDegenerateFaces": max(
                len(result["degenerateFaces"])
                for result in global_state_results
            ),
            "minimumAreaRatio": candidate_minimum_area_ratio,
            "maximumAreaRatio": candidate_maximum_area_ratio,
            "areaEnvelopeNotWorseThanSource": True,
        },
        "silhouette": {
            "maximumDeviationPixels": silhouette_deviation,
            "worstState": silhouette_worst_state,
            "limitsPixels": silhouette_limits,
            "passed": True,
        },
        "decision": {
            "safeToApply": True,
            "promotionApproved": False,
        },
    }
    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    with open(output_path, "w", encoding="utf8") as output_file:
        json.dump(report, output_file, indent=2)
        output_file.write("\n")
    print(
        json.dumps(
            {
                "targets": [
                    {
                        "name": target["name"],
                        "seedFaces": len(target["seedFaces"]),
                        "rootVertices": len(target["rootVertices"]),
                        "supportVertices": len(
                            target["supportVertices"]
                        ),
                        "changedVertices": len(
                            target["changedVertices"]
                        ),
                        "method": target["method"],
                        "strength": target["strength"],
                        "maximumEdgeStrain": target[
                            "maximumEdgeStrain"
                        ],
                    }
                    for target in target_plans
                ],
                "changedVertexUnion": len(all_changed_vertices),
                "globalEnvelope": report["globalEnvelope"],
                "silhouette": report["silhouette"],
                "decision": report["decision"],
            },
            indent=2,
        )
    )


if __name__ == "__main__":
    plan()

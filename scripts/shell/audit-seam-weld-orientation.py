"""Prove ownership of the failed weld's 42 winding conflicts."""

import json
import os
import sys
from collections import defaultdict, deque

import bpy


EXPECTED_MESH_NAME = "IdentityShell"
EXPECTED_CONFLICTS = 42


def get_arguments():
    if "--" not in sys.argv:
        raise RuntimeError(
            "Expected source blend, preflight, map, and report paths."
        )
    arguments = sys.argv[sys.argv.index("--") + 1 :]
    if len(arguments) != 4:
        raise RuntimeError(
            "Expected source blend, preflight JSON, vertex map JSON, "
            "and output report."
        )
    return [os.path.abspath(argument) for argument in arguments]


def load_json(file_path):
    with open(file_path, encoding="utf8") as input_file:
        return json.load(input_file)


def load_source_object(file_path):
    with bpy.data.libraries.load(file_path, link=False) as (
        source,
        destination,
    ):
        destination.objects = [
            name for name in source.objects if name == EXPECTED_MESH_NAME
        ]
    if len(destination.objects) != 1:
        raise RuntimeError("Unable to load the source identity shell.")
    return destination.objects[0]


def get_edge_uses(faces):
    uses = defaultdict(list)
    for face_index, face in enumerate(faces):
        for offset, start in enumerate(face):
            end = face[(offset + 1) % len(face)]
            edge = tuple(sorted((start, end)))
            direction = 1 if (start, end) == edge else -1
            uses[edge].append(
                {
                    "face": face_index,
                    "direction": direction,
                }
            )
    return uses


def get_face_components(faces):
    edge_uses = get_edge_uses(faces)
    adjacency = defaultdict(set)
    for uses in edge_uses.values():
        face_indices = [item["face"] for item in uses]
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


def get_topology(faces):
    edge_uses = get_edge_uses(faces)
    conflicts = {
        edge: uses
        for edge, uses in edge_uses.items()
        if len(uses) == 2
        and uses[0]["direction"] == uses[1]["direction"]
    }
    return {
        "components": len(get_face_components(faces)),
        "boundaryEdges": sum(
            1 for uses in edge_uses.values() if len(uses) == 1
        ),
        "nonManifoldEdges": sum(
            1 for uses in edge_uses.values() if len(uses) > 2
        ),
        "windingConflicts": len(conflicts),
        "conflicts": conflicts,
    }


def audit():
    source_path, preflight_path, mapping_path, output_path = get_arguments()
    preflight = load_json(preflight_path)
    vertex_mapping = load_json(mapping_path)
    candidate = bpy.data.objects.get(EXPECTED_MESH_NAME)
    if candidate is None or candidate.type != "MESH":
        raise RuntimeError(f"Missing {EXPECTED_MESH_NAME} candidate.")
    source = load_source_object(source_path)

    source_faces = [
        tuple(polygon.vertices) for polygon in source.data.polygons
    ]
    welded_faces = [
        tuple(polygon.vertices) for polygon in candidate.data.polygons
    ]
    components = get_face_components(source_faces)
    if len(components) != 3:
        raise RuntimeError(
            f"Expected three source components, found {len(components)}."
        )
    face_component = {
        face_index: component_index
        for component_index, component in enumerate(components)
        for face_index in component
    }

    near_seam = next(
        seam
        for seam in preflight["seams"]
        if seam["classification"] == "near-coincident-open"
    )
    coincident_seam = next(
        seam
        for seam in preflight["seams"]
        if seam["classification"]
        == "position-coincident-disconnected"
    )

    def get_component_for_vertices(vertices):
        matching = {
            face_component[polygon.index]
            for polygon in source.data.polygons
            if set(polygon.vertices).intersection(vertices)
        }
        if len(matching) != 1:
            raise RuntimeError(
                f"Vertices span unexpected components: {sorted(matching)}."
            )
        return matching.pop()

    main_component = get_component_for_vertices(
        {
            pair["mainVertex"]
            for pair in near_seam["mapping"]
        }
    )
    near_cap_component = get_component_for_vertices(
        {
            pair["capVertex"]
            for pair in near_seam["mapping"]
        }
    )
    coincident_cap_component = get_component_for_vertices(
        {
            pair["capVertex"]
            for pair in coincident_seam["mapping"]
        }
    )
    if len(
        {
            main_component,
            near_cap_component,
            coincident_cap_component,
        }
    ) != 3:
        raise RuntimeError("Seam roles do not resolve to three components.")

    topology_before = get_topology(welded_faces)
    if topology_before["windingConflicts"] != EXPECTED_CONFLICTS:
        raise RuntimeError(
            "Failed candidate no longer has the expected 42 conflicts."
        )
    conflict_records = []
    unrelated_conflicts = []
    for edge, uses in topology_before["conflicts"].items():
        component_pair = sorted(
            face_component[item["face"]]
            for item in uses
        )
        expected_components = sorted(
            [main_component, near_cap_component]
        )
        record = {
            "edge": list(edge),
            "faces": [item["face"] for item in uses],
            "sourceComponents": component_pair,
            "joinsMainToNearCap": component_pair == expected_components,
        }
        conflict_records.append(record)
        if not record["joinsMainToNearCap"]:
            unrelated_conflicts.append(record)
    if unrelated_conflicts:
        raise RuntimeError(
            f"Found {len(unrelated_conflicts)} unrelated conflicts."
        )

    flip_faces = components[near_cap_component]
    simulated_faces = [
        tuple(reversed(face)) if index in flip_faces else face
        for index, face in enumerate(welded_faces)
    ]
    topology_after = get_topology(simulated_faces)
    if (
        topology_after["components"] != 1
        or topology_after["boundaryEdges"] != 0
        or topology_after["nonManifoldEdges"] != 0
        or topology_after["windingConflicts"] != 0
    ):
        raise RuntimeError(
            "The isolated cap flip does not resolve the topology contract."
        )

    remapped_near_cap_vertices = {
        vertex_mapping["oldToNew"][vertex]["newVertex"]
        for face_index in flip_faces
        for vertex in source_faces[face_index]
    }
    report = {
        "schemaVersion": "v1",
        "operation": "audit-seam-weld-orientation-ownership",
        "sourceBlend": source_path,
        "failedCandidateBlend": bpy.data.filepath,
        "sourceComponents": [
            {
                "index": index,
                "faces": len(component),
                "role": (
                    "main"
                    if index == main_component
                    else "near-coincident-cap"
                    if index == near_cap_component
                    else "coincident-cap"
                    if index == coincident_cap_component
                    else "unclassified"
                ),
            }
            for index, component in enumerate(components)
        ],
        "ownership": {
            "conflictCount": len(conflict_records),
            "allConflictsJoinMainToSameNearCap": True,
            "unrelatedConflictCount": len(unrelated_conflicts),
            "affectedSourceComponent": near_cap_component,
            "affectedFaceCount": len(flip_faces),
            "affectedFaceIndices": sorted(flip_faces),
            "affectedRemappedVertexCount": len(
                remapped_near_cap_vertices
            ),
        },
        "topologyBeforeSimulatedFlip": {
            key: value
            for key, value in topology_before.items()
            if key != "conflicts"
        },
        "topologyAfterSimulatedFlip": {
            key: value
            for key, value in topology_after.items()
            if key != "conflicts"
        },
        "conflicts": conflict_records,
        "decision": {
            "ownershipConfirmed": True,
            "flipOnlyAffectedCapFaceSet": True,
            "unrelatedFacesRequireFlipping": False,
            "safeToRegenerateCorrectedCandidate": True,
        },
    }
    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    with open(output_path, "w", encoding="utf8") as output_file:
        json.dump(report, output_file, indent=2)
        output_file.write("\n")
    print(
        json.dumps(
            {
                "sourceComponents": report["sourceComponents"],
                "ownership": {
                    key: value
                    for key, value in report["ownership"].items()
                    if key != "affectedFaceIndices"
                },
                "topologyBefore": (
                    report["topologyBeforeSimulatedFlip"]
                ),
                "topologyAfter": (
                    report["topologyAfterSimulatedFlip"]
                ),
                "decision": report["decision"],
            },
            indent=2,
        )
    )


audit()

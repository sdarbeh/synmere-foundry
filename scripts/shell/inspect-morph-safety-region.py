"""Inspect the deformation axes and strain edges for one failing morph."""

import json
import os
import sys

import bpy


MESH_NAME = "IdentityShell"


def arguments():
    values = sys.argv[sys.argv.index("--") + 1 :]
    if len(values) != 2:
        raise RuntimeError("Expected inversion audit path and morph name.")
    return os.path.abspath(values[0]), values[1]


def vector_stats(values):
    return {
        "minimum": [min(value[axis] for value in values) for axis in range(3)],
        "maximum": [max(value[axis] for value in values) for axis in range(3)],
        "mean": [
            sum(value[axis] for value in values) / len(values)
            for axis in range(3)
        ],
    }


def main():
    audit_path, morph_name = arguments()
    with open(audit_path, encoding="utf8") as audit_file:
        audit = json.load(audit_file)
    shell = bpy.data.objects[MESH_NAME]
    keys = shell.data.shape_keys.key_blocks
    basis = [point.co.copy() for point in keys["Basis"].data]
    delta = [
        point.co - basis[index]
        for index, point in enumerate(keys[morph_name].data)
    ]
    seed_faces = {
        face["faceIndex"]
        for face in audit["faces"]
        if any(morph_name in test["weights"] for test in face["tests"])
    }
    root = {
        vertex
        for face_index in seed_faces
        for vertex in shell.data.polygons[face_index].vertices
    }
    edges = {
        tuple(sorted((edge.vertices[0], edge.vertices[1])))
        for edge in shell.data.edges
    }
    edge_rows = []
    for start, end in edges:
        length = max((basis[end] - basis[start]).length, 0.012 / 0.72)
        component = delta[end] - delta[start]
        edge_rows.append(
            {
                "vertices": [start, end],
                "touchesRoot": start in root or end in root,
                "strain": component.length / length,
                "component": list(component),
            }
        )
    report = {
        "morph": morph_name,
        "seedFaces": sorted(seed_faces),
        "rootVertices": sorted(root),
        "rootBasis": vector_stats([basis[index] for index in root]),
        "rootDelta": vector_stats([delta[index] for index in root]),
        "rootRows": [
            {
                "vertex": index,
                "basis": list(basis[index]),
                "delta": list(delta[index]),
            }
            for index in sorted(root)
        ],
        "highestStrainEdges": sorted(
            edge_rows,
            key=lambda row: -row["strain"],
        )[:20],
    }
    print(json.dumps(report, indent=2))


main()

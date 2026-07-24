"""Test exact positional closure of the confirmed near-coincident cap seam."""

import json
import sys
from pathlib import Path

import bpy


EXPECTED_MESH_NAME = "IdentityShell"
MAIN_LOOP_INDEX = 0
CAP_LOOP_INDEX = 1


def get_report_path():
    if "--" not in sys.argv:
        raise RuntimeError("The seam test requires a topology report path.")
    arguments = sys.argv[sys.argv.index("--") + 1 :]
    if len(arguments) != 1:
        raise RuntimeError("The seam test expects one topology report path.")
    return Path(arguments[0]).resolve()


def get_nearest_mapping(basis, main_vertices, cap_vertices):
    mapping = {}
    for cap_vertex in cap_vertices:
        mapping[cap_vertex] = min(
            main_vertices,
            key=lambda main_vertex: (
                basis.data[cap_vertex].co - basis.data[main_vertex].co
            ).length,
        )
    if len(set(mapping.values())) != len(mapping):
        raise RuntimeError("The cap seam does not have a one-to-one main loop.")
    return mapping


def apply_seam_alignment_test():
    with get_report_path().open("r", encoding="utf-8") as source:
        report = json.load(source)
    loops = report["classification"]["accidentalOpenSeams"]["boundaryLoops"]
    shell = bpy.data.objects.get(EXPECTED_MESH_NAME)
    if shell is None or shell.data.shape_keys is None:
        raise RuntimeError("The identity shell or its shape keys are missing.")
    basis = shell.data.shape_keys.key_blocks["Basis"]
    mapping = get_nearest_mapping(
        basis,
        loops[MAIN_LOOP_INDEX]["vertices"],
        loops[CAP_LOOP_INDEX]["vertices"],
    )
    maximum_basis_displacement = max(
        (
            basis.data[cap_vertex].co - basis.data[main_vertex].co
        ).length
        for cap_vertex, main_vertex in mapping.items()
    )

    # Copy evaluated key positions so the disconnected loops stay coincident
    # throughout the entire morph envelope.
    for key in shell.data.shape_keys.key_blocks:
        for cap_vertex, main_vertex in mapping.items():
            key.data[cap_vertex].co = key.data[main_vertex].co.copy()
    shell.data.update()
    bpy.ops.wm.save_as_mainfile(filepath=bpy.data.filepath, check_existing=False)
    print(
        json.dumps(
            {
                "operation": "pass-g-g11-seam-alignment-test",
                "blend": bpy.data.filepath,
                "alignedVerticesPerKey": len(mapping),
                "shapeKeyCountIncludingBasis": len(
                    shell.data.shape_keys.key_blocks
                ),
                "maximumBasisDisplacement": maximum_basis_displacement,
            },
            indent=2,
        )
    )


apply_seam_alignment_test()

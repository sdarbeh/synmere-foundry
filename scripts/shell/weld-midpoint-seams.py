"""Weld only the approved midpoint-harmonized identity-shell seams."""

import json
import os
import sys

import bmesh
import bpy


EXPECTED_MESH_NAME = "IdentityShell"
EXPECTED_VERTICES_BEFORE = 6136
EXPECTED_VERTICES_AFTER = 6052
EXPECTED_POLYGONS = 12100
EXPECTED_SHAPE_KEYS = 37
POSITION_EPSILON = 1e-7


def get_arguments():
    if "--" not in sys.argv:
        raise RuntimeError(
            "Expected preflight, vertex map, candidate, and report paths."
        )
    arguments = sys.argv[sys.argv.index("--") + 1 :]
    if len(arguments) != 4:
        raise RuntimeError(
            "Expected preflight JSON, vertex map JSON, candidate blend, "
            "and application report."
        )
    return [os.path.abspath(argument) for argument in arguments]


def load_json(file_path):
    with open(file_path, encoding="utf8") as input_file:
        return json.load(input_file)


def get_shell():
    shell = bpy.data.objects.get(EXPECTED_MESH_NAME)
    if shell is None or shell.type != "MESH":
        raise RuntimeError(f"Missing {EXPECTED_MESH_NAME} mesh.")
    if shell.data.shape_keys is None:
        raise RuntimeError("Identity shell has no shape keys.")
    return shell


def get_delta(key, basis, vertex_index):
    return key.data[vertex_index].co - basis.data[vertex_index].co


def get_attribute_contract(mesh):
    return [
        {
            "name": attribute.name,
            "dataType": attribute.data_type,
            "domain": attribute.domain,
        }
        for attribute in mesh.attributes
    ]


def weld():
    preflight_path, mapping_path, candidate_path, report_path = get_arguments()
    preflight = load_json(preflight_path)
    vertex_mapping = load_json(mapping_path)
    shell = get_shell()
    mesh = shell.data
    shape_keys = mesh.shape_keys.key_blocks
    basis = shape_keys["Basis"]

    if len(mesh.vertices) != EXPECTED_VERTICES_BEFORE:
        raise RuntimeError(
            f"Expected {EXPECTED_VERTICES_BEFORE} source vertices, "
            f"found {len(mesh.vertices)}."
        )
    if len(mesh.polygons) != EXPECTED_POLYGONS:
        raise RuntimeError(
            f"Expected {EXPECTED_POLYGONS} source faces, "
            f"found {len(mesh.polygons)}."
        )
    if len(shape_keys) - 1 != EXPECTED_SHAPE_KEYS:
        raise RuntimeError(
            f"Expected {EXPECTED_SHAPE_KEYS} shape keys, "
            f"found {len(shape_keys) - 1}."
        )
    expected_key_names = ["Basis", *preflight["shapeKeyNames"]]
    if [key.name for key in shape_keys] != expected_key_names:
        raise RuntimeError("Shape-key names or order changed before welding.")

    source_blend = bpy.data.filepath
    if os.path.abspath(source_blend) == candidate_path:
        raise RuntimeError("Candidate output must not overwrite its source.")

    original_positions = {
        key.name: [point.co.copy() for point in key.data]
        for key in shape_keys
    }
    original_faces = [
        tuple(polygon.vertices) for polygon in mesh.polygons
    ]
    original_material_indices = [
        polygon.material_index for polygon in mesh.polygons
    ]
    original_smooth_flags = [
        polygon.use_smooth for polygon in mesh.polygons
    ]
    original_material_slots = [
        material.name if material else None for material in mesh.materials
    ]
    original_attributes = get_attribute_contract(mesh)
    original_transform = shell.matrix_world.copy()

    seam_pairs = [
        {
            "classification": seam["classification"],
            "mainVertex": pair["mainVertex"],
            "capVertex": pair["capVertex"],
        }
        for seam in preflight["seams"]
        for pair in seam["mapping"]
    ]
    if len(seam_pairs) != 84:
        raise RuntimeError(
            f"Expected 84 seam pairs, found {len(seam_pairs)}."
        )
    main_vertices = {pair["mainVertex"] for pair in seam_pairs}
    cap_vertices = {pair["capVertex"] for pair in seam_pairs}
    if len(main_vertices) != 84 or len(cap_vertices) != 84:
        raise RuntimeError("Seam mapping is not one-to-one.")
    if main_vertices & cap_vertices:
        raise RuntimeError("A seam vertex is both retained and removed.")
    if cap_vertices != set(vertex_mapping["removedVertices"]):
        raise RuntimeError("Approved cap vertices differ from the vertex map.")

    maximum_trajectory_residual_before = 0.0
    for key in shape_keys[1:]:
        for pair in seam_pairs:
            residual = (
                get_delta(key, basis, pair["mainVertex"])
                - get_delta(key, basis, pair["capVertex"])
            ).length
            maximum_trajectory_residual_before = max(
                maximum_trajectory_residual_before,
                residual,
            )
    if maximum_trajectory_residual_before > POSITION_EPSILON:
        raise RuntimeError(
            "Source seam trajectories are not harmonized: "
            f"{maximum_trajectory_residual_before}."
        )

    maximum_basis_movement = 0.0
    maximum_shape_key_point_movement = 0.0
    for pair in seam_pairs:
        main_index = pair["mainVertex"]
        cap_index = pair["capVertex"]
        main_basis = basis.data[main_index].co.copy()
        cap_basis = basis.data[cap_index].co.copy()
        if pair["classification"] == "position-coincident-disconnected":
            target_basis = main_basis
        elif pair["classification"] == "near-coincident-open":
            target_basis = (main_basis + cap_basis) * 0.5
        else:
            raise RuntimeError(
                f"Unsupported seam classification {pair['classification']}."
            )

        shared_deltas = {
            key.name: (
                get_delta(key, basis, main_index)
                + get_delta(key, basis, cap_index)
            )
            * 0.5
            for key in shape_keys[1:]
        }
        basis.data[main_index].co = target_basis
        basis.data[cap_index].co = target_basis
        maximum_basis_movement = max(
            maximum_basis_movement,
            (target_basis - main_basis).length,
            (target_basis - cap_basis).length,
        )
        for key in shape_keys[1:]:
            target_position = target_basis + shared_deltas[key.name]
            maximum_shape_key_point_movement = max(
                maximum_shape_key_point_movement,
                (target_position - key.data[main_index].co).length,
                (target_position - key.data[cap_index].co).length,
            )
            key.data[main_index].co = target_position
            key.data[cap_index].co = target_position

    for key in shape_keys:
        maximum_unapproved_movement = max(
            (
                key.data[index].co
                - original_positions[key.name][index]
            ).length
            for index in range(EXPECTED_VERTICES_BEFORE)
            if index not in main_vertices and index not in cap_vertices
        )
        if maximum_unapproved_movement > POSITION_EPSILON:
            raise RuntimeError(
                f"{key.name} moved an unrelated point by "
                f"{maximum_unapproved_movement}."
            )

    for key in shape_keys[1:]:
        for pair in seam_pairs:
            residual = (
                get_delta(key, basis, pair["mainVertex"])
                - get_delta(key, basis, pair["capVertex"])
            ).length
            if residual > POSITION_EPSILON:
                raise RuntimeError(
                    f"{key.name} retained a pre-weld residual of {residual}."
                )

    bpy.ops.object.select_all(action="DESELECT")
    shell.select_set(True)
    bpy.context.view_layer.objects.active = shell
    shell.active_shape_key_index = 0
    for key in shape_keys:
        key.value = 0
    bpy.ops.object.mode_set(mode="EDIT")
    edit_mesh = bmesh.from_edit_mesh(mesh)
    edit_mesh.verts.ensure_lookup_table()
    target_map = {
        edit_mesh.verts[pair["capVertex"]]: edit_mesh.verts[
            pair["mainVertex"]
        ]
        for pair in seam_pairs
    }
    bmesh.ops.weld_verts(edit_mesh, targetmap=target_map)
    bmesh.update_edit_mesh(mesh, loop_triangles=True, destructive=True)
    bpy.ops.object.mode_set(mode="OBJECT")
    mesh.update(calc_edges=True)

    if len(mesh.vertices) != EXPECTED_VERTICES_AFTER:
        raise RuntimeError(
            f"Weld produced {len(mesh.vertices)} vertices; "
            f"expected {EXPECTED_VERTICES_AFTER}."
        )
    if len(mesh.polygons) != EXPECTED_POLYGONS:
        raise RuntimeError(
            f"Weld produced {len(mesh.polygons)} faces; "
            f"expected {EXPECTED_POLYGONS}."
        )
    if len(mesh.shape_keys.key_blocks) - 1 != EXPECTED_SHAPE_KEYS:
        raise RuntimeError("Weld changed the shape-key count.")
    if [
        key.name for key in mesh.shape_keys.key_blocks
    ] != expected_key_names:
        raise RuntimeError("Weld changed shape-key names or order.")

    old_to_new = vertex_mapping["oldToNew"]
    current_shape_keys = mesh.shape_keys.key_blocks
    maximum_remap_error = 0.0
    for old_index, mapping in enumerate(old_to_new):
        new_index = mapping["newVertex"]
        for key in current_shape_keys:
            expected_position = original_positions[key.name][old_index]
            pair = next(
                (
                    item
                    for item in seam_pairs
                    if old_index
                    in (item["mainVertex"], item["capVertex"])
                ),
                None,
            )
            if pair is not None:
                main_index = pair["mainVertex"]
                cap_index = pair["capVertex"]
                main_basis = original_positions["Basis"][main_index]
                cap_basis = original_positions["Basis"][cap_index]
                if (
                    pair["classification"]
                    == "position-coincident-disconnected"
                ):
                    target_basis = main_basis
                else:
                    target_basis = (main_basis + cap_basis) * 0.5
                if key.name == "Basis":
                    expected_position = target_basis
                else:
                    main_delta = (
                        original_positions[key.name][main_index]
                        - main_basis
                    )
                    cap_delta = (
                        original_positions[key.name][cap_index]
                        - cap_basis
                    )
                    expected_position = (
                        target_basis + (main_delta + cap_delta) * 0.5
                    )
            maximum_remap_error = max(
                maximum_remap_error,
                (
                    key.data[new_index].co - expected_position
                ).length,
            )
    if maximum_remap_error > POSITION_EPSILON:
        raise RuntimeError(
            f"Weld remap error {maximum_remap_error} exceeds tolerance."
        )

    expected_faces = [
        tuple(old_to_new[index]["newVertex"] for index in face)
        for face in original_faces
    ]
    current_faces = [
        tuple(polygon.vertices) for polygon in mesh.polygons
    ]
    if current_faces != expected_faces:
        raise RuntimeError("Cap faces were not remapped deterministically.")
    if [
        polygon.material_index for polygon in mesh.polygons
    ] != original_material_indices:
        raise RuntimeError("Weld changed polygon material assignments.")
    if [
        polygon.use_smooth for polygon in mesh.polygons
    ] != original_smooth_flags:
        raise RuntimeError("Weld changed polygon smooth flags.")
    if [
        material.name if material else None for material in mesh.materials
    ] != original_material_slots:
        raise RuntimeError("Weld changed material slots.")
    if get_attribute_contract(mesh) != original_attributes:
        raise RuntimeError("Weld changed the mesh attribute contract.")
    if shell.matrix_world != original_transform:
        raise RuntimeError("Weld changed the shell transform.")

    os.makedirs(os.path.dirname(candidate_path), exist_ok=True)
    bpy.ops.wm.save_as_mainfile(
        filepath=candidate_path,
        check_existing=False,
    )
    report = {
        "schemaVersion": "v1",
        "operation": "weld-approved-midpoint-seams",
        "sourceBlend": source_blend,
        "candidateBlend": candidate_path,
        "counts": {
            "verticesBefore": EXPECTED_VERTICES_BEFORE,
            "verticesAfter": len(mesh.vertices),
            "removedCapVertices": len(cap_vertices),
            "facesBefore": EXPECTED_POLYGONS,
            "facesAfter": len(mesh.polygons),
            "shapeKeys": len(current_shape_keys) - 1,
        },
        "movement": {
            "maximumBasisMovement": maximum_basis_movement,
            "maximumShapeKeyPointMovement": (
                maximum_shape_key_point_movement
            ),
            "maximumUnapprovedPointMovement": 0.0,
            "maximumPostWeldRemapError": maximum_remap_error,
        },
        "trajectory": {
            "maximumResidualBeforeWeld": (
                maximum_trajectory_residual_before
            ),
            "preservedAcrossShapeKeys": True,
        },
        "preservation": {
            "faceCountUnchanged": True,
            "faceOrderAndWindingUnchanged": True,
            "materialAssignmentsUnchanged": True,
            "smoothFlagsUnchanged": True,
            "shapeKeyNamesAndOrderUnchanged": True,
            "unrelatedVerticesUnchanged": True,
        },
        "constraints": {
            "productionChanged": False,
            "canonicalSourceChanged": False,
            "rendererChanged": False,
            "exporterChanged": False,
            "pipelineChanged": False,
            "promotionPerformed": False,
        },
    }
    os.makedirs(os.path.dirname(report_path), exist_ok=True)
    with open(report_path, "w", encoding="utf8") as output_file:
        json.dump(report, output_file, indent=2)
        output_file.write("\n")
    print(json.dumps(report, indent=2))


weld()

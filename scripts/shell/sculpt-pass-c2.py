"""Round nostril cavities and the columella for Baseline v1 Pass C.2."""

import json

import bpy
from mathutils import Vector


EXPECTED_MESH_NAME = "IdentityShell"
EXPECTED_MATERIAL_NAME = "IdentityCeramic"
EXPECTED_VERTEX_COUNT = 6136
EXPECTED_VISIBLE_SURFACE_COUNT = 2939
EXPECTED_SHAPE_KEY_COUNT = 37
REQUIRED_PASS_MARKER = "synmere_baseline_v1_pass_c1"
PASS_MARKER = "synmere_baseline_v1_pass_c2"

CAVITY_MINIMUM_X = 0.035
CAVITY_MAXIMUM_X = 0.22
CAVITY_MINIMUM_Y = -0.45
CAVITY_MAXIMUM_Y = -0.2
CAVITY_MINIMUM_Z = -0.56
CAVITY_MAXIMUM_Z = -0.43
CAVITY_NEIGHBOR_WEIGHT = 0.86
CAVITY_FRONT_WEIGHT = 0.46

COLUMELLA_MAXIMUM_X = 0.075
COLUMELLA_MAXIMUM_Y = -0.38
COLUMELLA_MINIMUM_Z = -0.54
COLUMELLA_MAXIMUM_Z = -0.43
COLUMELLA_NEIGHBOR_WEIGHT = 0.78
COLUMELLA_SYMMETRY_WEIGHT = 0.58
COLUMELLA_FRONT_WEIGHT = 0.16
FRONT_NORMAL = Vector((0.0, -1.0, 0.0))


def get_identity_shell():
    shell = bpy.data.objects.get(EXPECTED_MESH_NAME)
    if shell is None or shell.type != "MESH":
        raise RuntimeError(f"Missing {EXPECTED_MESH_NAME} mesh.")
    if len(shell.data.vertices) != EXPECTED_VERTEX_COUNT:
        raise RuntimeError("The canonical vertex count changed before Pass C.2.")
    if [material.name for material in shell.data.materials] != [
        EXPECTED_MATERIAL_NAME
    ]:
        raise RuntimeError(
            "The canonical material contract changed before Pass C.2."
        )
    if shell.data.shape_keys is None:
        raise RuntimeError("The canonical shell has no shape keys.")
    if len(shell.data.shape_keys.key_blocks) - 1 != EXPECTED_SHAPE_KEY_COUNT:
        raise RuntimeError("The canonical morph count changed before Pass C.2.")
    if not bpy.context.scene.get(REQUIRED_PASS_MARKER):
        raise RuntimeError("Pass C.2 requires the validated Pass C.1 Basis.")
    if bpy.context.scene.get(PASS_MARKER):
        raise RuntimeError("Pass C.2 is already applied to this Blender source.")
    return shell


def build_neighbors(mesh):
    neighbors = [set() for _ in mesh.vertices]
    for edge in mesh.edges:
        first, second = edge.vertices
        neighbors[first].add(second)
        neighbors[second].add(first)
    return neighbors


def get_current_vertex_normals(mesh):
    accumulated = [Vector() for _ in mesh.vertices]
    counts = [0 for _ in mesh.vertices]
    for loop, corner_normal in zip(mesh.loops, mesh.corner_normals):
        accumulated[loop.vertex_index] += corner_normal.vector
        counts[loop.vertex_index] += 1
    return [
        (
            accumulated[index].normalized()
            if counts[index]
            else mesh.vertex_normals[index].vector.copy()
        )
        for index in range(len(mesh.vertices))
    ]


def get_neighbor_average(index, current_normals, neighbors):
    local_normals = [current_normals[index]]
    local_normals.extend(
        current_normals[neighbor]
        for neighbor in neighbors[index]
    )
    return sum(local_normals, Vector()).normalized()


def get_cavity_vertices(basis):
    return {
        index
        for index in range(EXPECTED_VISIBLE_SURFACE_COUNT)
        if CAVITY_MINIMUM_X
        <= abs(basis.data[index].co.x)
        <= CAVITY_MAXIMUM_X
        and CAVITY_MINIMUM_Y
        <= basis.data[index].co.y
        <= CAVITY_MAXIMUM_Y
        and CAVITY_MINIMUM_Z
        <= basis.data[index].co.z
        <= CAVITY_MAXIMUM_Z
    }


def get_columella_vertices(basis):
    return {
        index
        for index in range(EXPECTED_VISIBLE_SURFACE_COUNT)
        if abs(basis.data[index].co.x) <= COLUMELLA_MAXIMUM_X
        and basis.data[index].co.y <= COLUMELLA_MAXIMUM_Y
        and COLUMELLA_MINIMUM_Z
        <= basis.data[index].co.z
        <= COLUMELLA_MAXIMUM_Z
    }


def build_mirror_lookup(basis):
    return {
        (
            round(position.co.x, 5),
            round(position.co.y, 5),
            round(position.co.z, 5),
        ): index
        for index, position in enumerate(basis.data)
    }


def get_mirrored_normal(
    index,
    basis,
    mirror_lookup,
    current_normals,
):
    position = basis.data[index].co
    mirror_index = mirror_lookup.get(
        (
            round(-position.x, 5),
            round(position.y, 5),
            round(position.z, 5),
        )
    )
    if mirror_index is None:
        return current_normals[index]
    mirrored = current_normals[mirror_index].copy()
    mirrored.x *= -1
    return mirrored


def apply_pass_c2():
    shell = get_identity_shell()
    mesh = shell.data
    basis = mesh.shape_keys.key_blocks["Basis"]
    neighbors = build_neighbors(mesh)
    current_normals = get_current_vertex_normals(mesh)
    cavity_vertices = get_cavity_vertices(basis)
    columella_vertices = get_columella_vertices(basis)
    mirror_lookup = build_mirror_lookup(basis)
    target_normals = {}

    for index in cavity_vertices:
        neighbor_average = get_neighbor_average(
            index,
            current_normals,
            neighbors,
        )
        smoothed = current_normals[index].lerp(
            neighbor_average,
            CAVITY_NEIGHBOR_WEIGHT,
        )
        target_normals[index] = smoothed.lerp(
            FRONT_NORMAL,
            CAVITY_FRONT_WEIGHT,
        ).normalized()

    for index in columella_vertices:
        neighbor_average = get_neighbor_average(
            index,
            current_normals,
            neighbors,
        )
        mirrored = get_mirrored_normal(
            index,
            basis,
            mirror_lookup,
            current_normals,
        )
        smoothed = current_normals[index].lerp(
            neighbor_average,
            COLUMELLA_NEIGHBOR_WEIGHT,
        )
        symmetric = smoothed.lerp(
            mirrored,
            COLUMELLA_SYMMETRY_WEIGHT,
        )
        target_normals[index] = symmetric.lerp(
            FRONT_NORMAL,
            COLUMELLA_FRONT_WEIGHT,
        ).normalized()

    corner_normals = [
        corner_normal.vector.copy()
        for corner_normal in mesh.corner_normals
    ]
    changed_corners = 0
    for loop in mesh.loops:
        normal = target_normals.get(loop.vertex_index)
        if normal is None:
            continue
        corner_normals[loop.index] = normal
        changed_corners += 1

    mesh.normals_split_custom_set(corner_normals)
    mesh.update()
    bpy.context.scene[PASS_MARKER] = {
        "cavityVertices": len(cavity_vertices),
        "columellaVertices": len(columella_vertices),
        "changedCorners": changed_corners,
        "cavityFrontWeight": CAVITY_FRONT_WEIGHT,
        "columellaFrontWeight": COLUMELLA_FRONT_WEIGHT,
    }
    bpy.ops.wm.save_as_mainfile(filepath=bpy.data.filepath, check_existing=False)

    print(
        json.dumps(
            {
                "operation": "baseline-v1-pass-c2",
                "blend": bpy.data.filepath,
                "movedVertices": 0,
                "cavityVertices": len(cavity_vertices),
                "columellaVertices": len(columella_vertices),
                "changedCorners": changed_corners,
                "shapeKeysRebased": False,
            },
            indent=2,
        )
    )


apply_pass_c2()

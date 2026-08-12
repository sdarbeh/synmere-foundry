"""Build Identity Shell v2 as one FLAME morph-target GLB plus one module."""

import hashlib
import json
import pickle
import shutil
import struct
import warnings
from pathlib import Path

import numpy as np


PROJECT_ROOT = Path(__file__).resolve().parents[2]
MODEL_PATH = PROJECT_ROOT / "vendor/flame/flame2023_Open.pkl"
PROVENANCE_PATH = PROJECT_ROOT / "vendor/flame/FLAME2023Open.provenance.json"
V1_MODULE_PATH = PROJECT_ROOT / "packages/manifest/asset-module.json"
CANDIDATE_DIRECTORY = PROJECT_ROOT / "assets/candidates/identity-shell/2.0.0"
APP_DIRECTORY = (
    PROJECT_ROOT.parent / "synmere/public/models/shell/identity-shell/2.0.0"
)
EXPECTED_MODEL_SHA256 = (
    "e75a0990728ba038c7da2a420ae4396f7ddd7781366c13026066c5b24f127623"
)
GLB_FILENAME = "identity-shell.glb"
MODULE_FILENAME = "module-manifest.json"
VALIDATION_FILENAME = "combination-validation.json"
STRUCTURED_TARGET = "presentation_structure_structured"
SOFT_TARGET = "presentation_structure_soft"
STRUCTURE_TARGET_NAMES = [STRUCTURED_TARGET, SOFT_TARGET]
PRESENTATION_SCALE = 7.358401
EXPECTED_IDENTITY_MORPH_DELTA_SHA256 = (
    "12ceec23bf852ed53ff3d88ffb08690a32c32b4a0db9fc41ff11ec16677b20ba"
)

V2_PRESET_PARAMETERS = {
    "baseline": {},
    "oval": {
        "faceWidth": 0.9,
        "faceLength": 1.21,
        "foreheadWidth": 0.94,
        "cheekWidth": 0.98,
        "jawWidth": 0.75,
        "jawTaper": 0.7,
        "chinLength": 0.28,
    },
    "broad": {
        "faceWidth": 1.06,
        "faceLength": 1.12,
        "headDepth": 0.9,
        "foreheadWidth": 1.04,
        "cheekWidth": 1.06,
        "jawWidth": 0.92,
        "jawTaper": 0.88,
    },
    "long": {
        "faceWidth": 0.9,
        "faceLength": 1.24,
        "headDepth": 0.88,
        "foreheadWidth": 0.86,
        "cheekWidth": 0.94,
        "jawWidth": 0.74,
        "jawTaper": 0.7,
        "chinLength": 0.29,
    },
    "round": {
        "faceWidth": 1.03,
        "faceLength": 1.05,
        "foreheadWidth": 1.0,
        "cheekWidth": 1.08,
        "jawWidth": 0.86,
        "jawTaper": 0.84,
        "chinLength": 0.22,
    },
    "heart": {
        "faceWidth": 0.98,
        "faceLength": 1.15,
        "foreheadWidth": 1.07,
        "cheekWidth": 1.06,
        "jawWidth": 0.7,
        "jawTaper": 0.67,
        "chinLength": 0.27,
    },
    "diamond": {
        "faceWidth": 0.96,
        "faceLength": 1.16,
        "foreheadWidth": 0.84,
        "cheekWidth": 1.1,
        "jawWidth": 0.72,
        "jawTaper": 0.7,
        "chinLength": 0.27,
    },
}


def sha256_file(file_path: Path) -> str:
    digest = hashlib.sha256()
    with file_path.open("rb") as file:
        for chunk in iter(lambda: file.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def padded(data: bytes, pad: bytes = b"\x00") -> bytes:
    return data + pad * ((4 - len(data) % 4) % 4)


def calculate_normals(vertices: np.ndarray, faces: np.ndarray) -> np.ndarray:
    normals = np.zeros_like(vertices)
    triangle_normals = np.cross(
        vertices[faces[:, 1]] - vertices[faces[:, 0]],
        vertices[faces[:, 2]] - vertices[faces[:, 0]],
    )
    for corner in range(3):
        np.add.at(normals, faces[:, corner], triangle_normals)
    lengths = np.linalg.norm(normals, axis=1)
    normals /= np.where(lengths > 0, lengths, 1.0)[:, None]
    return normals


def apply_authored_delta(
    template: np.ndarray, delta: dict[str, float]
) -> np.ndarray:
    vertices = template.copy()
    x = template[:, 0]
    y = template[:, 1]
    z = template[:, 2]
    head = np.clip((y + 0.155) / 0.065, 0.0, 1.0)
    face = head * np.clip((z + 0.14) / 0.18, 0.0, 1.0)
    jaw = face * np.clip((-y + 0.015) / 0.09, 0.0, 1.0)
    upper = face * np.clip((y + 0.005) / 0.085, 0.0, 1.0)
    cheek = face * np.exp(-np.square((y + 0.015) / 0.045))
    chin = face * np.exp(-np.square((y + 0.085) / 0.035))
    nose = face * np.exp(-np.square(x / 0.028)) * np.exp(
        -np.square((y + 0.015) / 0.055)
    )
    mouth = face * np.exp(-np.square((y + 0.055) / 0.025))
    eyes = face * np.exp(-np.square((y - 0.025) / 0.025))

    x_scale = np.ones_like(x)
    x_scale += delta.get("width", 0.0) * head
    x_scale += delta.get("jaw", 0.0) * jaw
    x_scale += delta.get("upper", 0.0) * upper
    x_scale += delta.get("cheek", 0.0) * cheek
    x_scale += delta.get("chin_width", 0.0) * chin
    x_scale += delta.get("nose_width", 0.0) * nose
    x_scale += delta.get("mouth_width", 0.0) * mouth
    x_scale += delta.get("eye_width", 0.0) * eyes
    vertices[:, 0] = x * x_scale
    vertices[:, 0] += delta.get("eye_spacing", 0.0) * eyes * np.sign(x)

    vertical_center = -0.027560975
    vertices[:, 1] = y + (
        (y - vertical_center) * delta.get("length", 0.0) * head
    )
    vertices[:, 1] += delta.get("chin_length", 0.0) * chin
    vertices[:, 1] += delta.get("nose_length", 0.0) * nose
    depth_center = -0.03907179
    vertices[:, 2] = z + (
        (z - depth_center) * delta.get("depth", 0.0) * head
    )
    vertices[:, 2] += delta.get("nose_projection", 0.0) * nose
    vertices[:, 2] += delta.get("brow_projection", 0.0) * eyes
    return vertices


TARGET_DELTAS = {
    "identity_face_wide": {"width": 0.075},
    "identity_face_narrow": {"width": -0.075},
    "identity_face_long": {"length": 0.085},
    "identity_face_short": {"length": -0.075},
    "identity_cheekbones_wide": {"cheek": 0.09},
    "identity_cheekbones_narrow": {"cheek": -0.075},
    "identity_eye_spacing_wide": {"eye_spacing": 0.008},
    "identity_eye_spacing_narrow": {"eye_spacing": -0.008},
    "identity_eye_width_wide": {"eye_width": 0.07},
    "identity_eye_width_narrow": {"eye_width": -0.07},
    "identity_brow_arch_high": {"brow_projection": 0.004},
    "identity_brow_arch_low": {"brow_projection": -0.003},
    "identity_brow_prominence_high": {"brow_projection": 0.008},
    "identity_brow_prominence_low": {"brow_projection": -0.006},
    "identity_nose_wide": {"nose_width": 0.12},
    "identity_nose_narrow": {"nose_width": -0.1},
    "identity_nose_long": {"nose_length": -0.008},
    "identity_nose_short": {"nose_length": 0.007},
    "identity_nose_projection_high": {"nose_projection": 0.012},
    "identity_nose_projection_low": {"nose_projection": -0.009},
    "identity_mouth_wide": {"mouth_width": 0.09},
    "identity_mouth_narrow": {"mouth_width": -0.08},
    "identity_chin_long": {"chin_length": -0.012},
    "identity_chin_short": {"chin_length": 0.01},
    "identity_head_depth_high": {"depth": 0.07},
    "identity_head_depth_low": {"depth": -0.065},
    "identity_forehead_wide": {"upper": 0.085},
    "identity_forehead_narrow": {"upper": -0.075},
    "identity_upper_face_tall": {"length": 0.04},
    "identity_upper_face_short": {"length": -0.035},
    "identity_jaw_wide": {"jaw": 0.1},
    "identity_jaw_narrow": {"jaw": -0.09},
    "identity_jaw_taper_square": {"jaw": 0.07, "chin_width": 0.04},
    "identity_jaw_taper_narrow": {"jaw": -0.06, "chin_width": -0.08},
}


def create_structure_vertices(
    structured: np.ndarray,
) -> tuple[np.ndarray, np.ndarray]:
    """Author balanced and soft shells while retaining FLAME vertex order.

    The FLAME mean is the Structured endpoint. This smooth, anatomical
    displacement field moves away from that masculine-reading endpoint without
    changing pose, expression, topology, or feature closure. Balanced uses the
    restrained middle state; Soft uses the full authored endpoint.
    """
    x = structured[:, 0]
    y = structured[:, 1]
    z = structured[:, 2]
    head = np.clip((y + 0.155) / 0.065, 0.0, 1.0)
    front = np.clip((z + 0.14) / 0.18, 0.0, 1.0)
    face = head * front
    jaw = face * np.clip((-y + 0.012) / 0.09, 0.0, 1.0)
    chin = face * np.exp(-np.square((y + 0.088) / 0.031))
    cheek = face * np.exp(-np.square((y + 0.018) / 0.044))
    brow = (
        face
        * np.exp(-np.square((y - 0.028) / 0.022))
        * np.clip((0.075 - np.abs(x)) / 0.045, 0.0, 1.0)
    )
    facial_planes = (
        face
        * np.exp(-np.square((y + 0.005) / 0.068))
        * np.clip((np.abs(x) - 0.018) / 0.055, 0.0, 1.0)
    )
    neck = (
        np.clip((-y - 0.082) / 0.075, 0.0, 1.0)
        * np.clip((z + 0.115) / 0.12, 0.0, 1.0)
    )

    soft_delta = np.zeros_like(structured)
    soft_delta[:, 0] = x * (
        -0.075 * jaw
        - 0.12 * chin
        - 0.055 * neck
        + 0.035 * cheek
    )
    soft_delta[:, 1] = 0.0055 * chin
    soft_delta[:, 2] = (
        -0.011 * brow
        - 0.004 * facial_planes
        + 0.005 * cheek
    )

    balanced = structured + 0.5 * soft_delta
    soft = structured + soft_delta
    return balanced, soft


def export_morph_glb(
    path: Path,
    base_vertices: np.ndarray,
    faces: np.ndarray,
    target_names: list[str],
    morph_deltas: dict[str, np.ndarray],
) -> None:
    center = np.asarray([-0.001009105, -0.027560975, -0.03907179])
    presented_template = (base_vertices - center) * PRESENTATION_SCALE
    positions = np.asarray(presented_template, dtype="<f4")
    normals = np.asarray(
        calculate_normals(presented_template, faces), dtype="<f4"
    )
    indices = np.asarray(faces.reshape(-1), dtype="<u4")
    chunks = [positions.tobytes(), normals.tobytes(), indices.tobytes()]
    morphs = []
    for target_name in target_names:
        morph = np.asarray(
            morph_deltas[target_name] * PRESENTATION_SCALE, dtype="<f4"
        )
        morphs.append(morph)
        chunks.append(morph.tobytes())

    binary_parts = []
    offsets = []
    offset = 0
    for chunk in chunks:
        encoded = padded(chunk)
        offsets.append(offset)
        binary_parts.append(encoded)
        offset += len(encoded)
    binary = b"".join(binary_parts)
    buffer_views = []
    accessors = []
    arrays = [positions, normals, indices, *morphs]
    for index, array in enumerate(arrays):
        buffer_views.append(
            {
                "buffer": 0,
                "byteLength": array.nbytes,
                "byteOffset": offsets[index],
                "target": 34963 if index == 2 else 34962,
            }
        )
        accessor = {
            "bufferView": index,
            "componentType": 5125 if index == 2 else 5126,
            "count": len(array),
            "type": "SCALAR" if index == 2 else "VEC3",
        }
        if index == 0 or index >= 3:
            accessor["max"] = array.max(axis=0).tolist()
            accessor["min"] = array.min(axis=0).tolist()
        accessors.append(accessor)

    primitive = {
        "attributes": {"POSITION": 0, "NORMAL": 1},
        "indices": 2,
        "material": 0,
        "targets": [{"POSITION": index + 3} for index in range(len(morphs))],
    }
    gltf = {
        "asset": {"generator": "Synmere Foundry", "version": "2.0"},
        "scene": 0,
        "scenes": [{"nodes": [0]}],
        "nodes": [{"mesh": 0, "name": "FLAME2023Open"}],
        "meshes": [
            {
                "extras": {"targetNames": target_names},
                "name": "FLAME2023Open",
                "primitives": [primitive],
                "weights": [0.0] * len(target_names),
            }
        ],
        "materials": [
            {
                "name": "IdentityShellClay",
                "pbrMetallicRoughness": {
                    "baseColorFactor": [0.61, 0.62, 0.65, 1.0],
                    "metallicFactor": 0.0,
                    "roughnessFactor": 0.58,
                },
                "doubleSided": True,
            }
        ],
        "buffers": [{"byteLength": len(binary)}],
        "bufferViews": buffer_views,
        "accessors": accessors,
    }
    json_bytes = padded(
        json.dumps(gltf, separators=(",", ":")).encode(), b" "
    )
    total_length = 12 + 8 + len(json_bytes) + 8 + len(binary)
    path.write_bytes(
        b"".join(
            [
                struct.pack("<4sII", b"glTF", 2, total_length),
                struct.pack("<I4s", len(json_bytes), b"JSON"),
                json_bytes,
                struct.pack("<I4s", len(binary), b"BIN\x00"),
                binary,
            ]
        )
    )


def build_module(target_names: list[str]) -> dict:
    module = json.loads(V1_MODULE_PATH.read_text(encoding="utf8"))
    module["asset"] = {
        "name": "identity-shell",
        "displayName": "Identity Shell v2",
        "module": "identity-shell",
        "version": "2.0.0",
        "releaseTag": "identity-shell-v2.0.0",
    }
    parameters = module["parameters"]
    parameters["version"] = "2.0.0"
    parameters["productBaseline"] = dict(parameters["neutral"])
    parameters["assetBounds"] = parameters.pop("safeRanges")
    parameters["designBounds"] = parameters.pop("authoringRanges")
    preset_ids = {
        "wide": "broad",
        "soft": "round",
        "tapered": "heart",
        "angular": "diamond",
    }
    for preset in module["presets"]["shape"]:
        preset["id"] = preset_ids.get(preset["id"], preset["id"])
        preset["baseParameters"] = "neutral"
        preset["parameters"] = V2_PRESET_PARAMETERS[preset["id"]]
    module["presets"]["structure"] = [
        {
            "id": "balanced",
            "label": "Balanced",
            "description": "Gender-neutral authored FLAME structure.",
            "morphWeights": {},
        },
        {
            "id": "structured",
            "label": "Structured",
            "description": "Stronger brow, jaw, chin, neck, and facial planes.",
            "morphWeights": {STRUCTURED_TARGET: 1.0},
        },
        {
            "id": "soft",
            "label": "Soft",
            "description": "Softer brow, cheeks, jaw, chin, and facial planes.",
            "morphWeights": {SOFT_TARGET: 1.0},
        },
    ]
    module["morphs"]["targetNames"] = target_names
    module["morphs"]["corrective"] = []
    module["morphs"]["presentation"] = [
        {"preset": "structured", "target": STRUCTURED_TARGET},
        {"preset": "soft", "target": SOFT_TARGET},
    ]
    module["assetBounds"] = {
        "maximumMorphWeight": 1.0,
        "maximumMorphEdgeStrain": 0.72,
        "structureWeights": {
            STRUCTURED_TARGET: {"min": 0.0, "max": 1.0},
            SOFT_TARGET: {"min": 0.0, "max": 1.0},
        },
        "maximumCombinedStructureWeight": 1.0,
    }
    module["designBounds"] = {
        "floatingPointTolerance": 0.00001,
        "structureWeights": {
            STRUCTURED_TARGET: {"min": 0.0, "max": 1.0},
            SOFT_TARGET: {"min": 0.0, "max": 1.0},
        },
        "maximumCombinedStructureWeight": 1.0,
    }
    module.pop("validationLimits", None)
    return module


def resolve_shape_weights(module: dict, preset: dict) -> dict[str, float]:
    parameters = dict(module["parameters"]["neutral"])
    parameters.update(preset["parameters"])
    neutral = module["parameters"]["neutral"]
    bounds = module["parameters"]["assetBounds"]
    weights = {}
    for binding in module["morphs"]["identityBindings"]:
        parameter = binding["parameter"]
        value = parameters[parameter]
        center = neutral[parameter]
        extent = (
            bounds[parameter]["max"] - center
            if value >= center
            else center - bounds[parameter]["min"]
        )
        signed = 0.0 if extent == 0 else (value - center) / extent
        calibration = module["morphs"]["calibration"][parameter]
        gain = (
            calibration["positiveGain"]
            if signed >= 0
            else calibration["negativeGain"]
        )
        weight = min(
            abs(signed) * binding["strength"] * gain,
            calibration["maximumWeight"],
        )
        target = (
            binding["positiveTarget"]
            if signed >= 0
            else binding["negativeTarget"]
        )
        weights[target] = weight
    return weights


def unique_edges(faces: np.ndarray) -> np.ndarray:
    edges = np.concatenate(
        [faces[:, [0, 1]], faces[:, [1, 2]], faces[:, [2, 0]]]
    )
    edges.sort(axis=1)
    return np.unique(edges, axis=0)


def validate_combinations(
    balanced: np.ndarray,
    faces: np.ndarray,
    morph_deltas: dict[str, np.ndarray],
    module: dict,
) -> dict:
    edges = unique_edges(faces)
    base_edges = balanced[edges[:, 1]] - balanced[edges[:, 0]]
    base_lengths = np.linalg.norm(base_edges, axis=1)
    base_cross = np.cross(
        balanced[faces[:, 1]] - balanced[faces[:, 0]],
        balanced[faces[:, 2]] - balanced[faces[:, 0]],
    )
    base_areas = np.linalg.norm(base_cross, axis=1) * 0.5
    x = balanced[:, 0]
    y = balanced[:, 1]
    z = balanced[:, 2]
    regions = {
        "jaw": (y < -0.03) & (y > -0.125) & (z > -0.105),
        "cheeks":
            (y > -0.055)
            & (y < 0.02)
            & (np.abs(x) > 0.025)
            & (z > -0.055),
        "ears":
            (np.abs(x) > 0.065)
            & (y > -0.065)
            & (y < 0.065),
        "neck": y < -0.09,
        "eyelids":
            (y > 0.002)
            & (y < 0.052)
            & (np.abs(x) > 0.012)
            & (np.abs(x) < 0.065)
            & (z > 0.015),
    }
    edge_region_masks = {
        name: mask[edges[:, 0]] & mask[edges[:, 1]]
        for name, mask in regions.items()
    }
    combinations = []
    maximum_allowed_strain = module["assetBounds"][
        "maximumMorphEdgeStrain"
    ]
    tolerance = module["designBounds"]["floatingPointTolerance"]
    for structure in module["presets"]["structure"]:
        for shape in module["presets"]["shape"]:
            weights = {
                **resolve_shape_weights(module, shape),
                **structure["morphWeights"],
            }
            state = balanced.copy()
            for target, weight in weights.items():
                state += morph_deltas[target] * weight
            state_edges = state[edges[:, 1]] - state[edges[:, 0]]
            state_lengths = np.linalg.norm(state_edges, axis=1)
            strain = np.abs(state_lengths - base_lengths) / np.maximum(
                base_lengths, tolerance
            )
            state_cross = np.cross(
                state[faces[:, 1]] - state[faces[:, 0]],
                state[faces[:, 2]] - state[faces[:, 0]],
            )
            state_areas = np.linalg.norm(state_cross, axis=1) * 0.5
            inverted = int(
                np.count_nonzero(np.sum(state_cross * base_cross, axis=1) <= 0)
            )
            degenerate = int(
                np.count_nonzero(
                    state_areas
                    <= np.maximum(base_areas * 0.02, np.finfo(float).eps)
                )
            )
            displacement = state - balanced
            region_metrics = {}
            for name, vertex_mask in regions.items():
                region_edges = edge_region_masks[name]
                local_gradient = np.linalg.norm(
                    displacement[edges[region_edges, 1]]
                    - displacement[edges[region_edges, 0]],
                    axis=1,
                ) / np.maximum(base_lengths[region_edges], tolerance)
                region_metrics[name] = {
                    "vertexCount": int(np.count_nonzero(vertex_mask)),
                    "maximumContinuityGradient": round(
                        float(local_gradient.max(initial=0.0)), 8
                    ),
                }
            passed = (
                np.isfinite(state).all()
                and inverted == 0
                and degenerate == 0
                and float(strain.max()) <= maximum_allowed_strain
                and all(
                    metric["maximumContinuityGradient"]
                    <= maximum_allowed_strain
                    for metric in region_metrics.values()
                )
            )
            combinations.append(
                {
                    "id": f'{structure["id"]}:{shape["id"]}',
                    "structurePresetId": structure["id"],
                    "shapePresetId": shape["id"],
                    "status": "passed" if passed else "failed",
                    "invertedTriangleCount": inverted,
                    "degenerateTriangleCount": degenerate,
                    "maximumEdgeStrain": round(float(strain.max()), 8),
                    "regions": region_metrics,
                }
            )
    failed = [entry["id"] for entry in combinations if entry["status"] != "passed"]
    return {
        "schemaVersion": "identity-shell-combination-validation-v1",
        "asset": "identity-shell-v2.0.0",
        "status": "passed" if not failed else "failed",
        "combinationCount": len(combinations),
        "shapePresetCount": len(module["presets"]["shape"]),
        "structurePresetCount": len(module["presets"]["structure"]),
        "maximumAllowedMorphEdgeStrain": maximum_allowed_strain,
        "failedCombinationIds": failed,
        "combinations": combinations,
    }


def main() -> None:
    if sha256_file(MODEL_PATH) != EXPECTED_MODEL_SHA256:
        raise RuntimeError("FLAME 2023 Open checksum is invalid.")
    provenance = json.loads(PROVENANCE_PATH.read_text(encoding="utf8"))
    with warnings.catch_warnings():
        warnings.filterwarnings("ignore", category=DeprecationWarning)
        with MODEL_PATH.open("rb") as file:
            model = pickle.load(file, encoding="latin1")  # noqa: S301
    structured = np.asarray(model["v_template"], dtype=np.float64)
    faces = np.asarray(model["f"], dtype=np.int32)
    balanced, soft = create_structure_vertices(structured)
    identity_morph_deltas = {
        target_name: apply_authored_delta(
            structured, TARGET_DELTAS[target_name]
        )
        - structured
        for target_name in TARGET_DELTAS
    }
    identity_morph_digest = hashlib.sha256()
    for target_name in TARGET_DELTAS:
        identity_morph_digest.update(
            np.asarray(
                identity_morph_deltas[target_name] * PRESENTATION_SCALE,
                dtype="<f4",
            ).tobytes()
        )
    identity_morph_sha256 = identity_morph_digest.hexdigest()
    if identity_morph_sha256 != EXPECTED_IDENTITY_MORPH_DELTA_SHA256:
        raise RuntimeError("Existing Identity Shell v2 morph deltas changed.")
    morph_deltas = {
        **identity_morph_deltas,
        STRUCTURED_TARGET: structured - balanced,
        SOFT_TARGET: soft - balanced,
    }
    target_names = [*TARGET_DELTAS, *STRUCTURE_TARGET_NAMES]
    topology_sha256 = hashlib.sha256(
        np.asarray(faces, dtype="<u4").tobytes()
    ).hexdigest()

    CANDIDATE_DIRECTORY.mkdir(parents=True, exist_ok=True)
    APP_DIRECTORY.mkdir(parents=True, exist_ok=True)
    glb_path = CANDIDATE_DIRECTORY / GLB_FILENAME
    export_morph_glb(
        glb_path, balanced, faces, target_names, morph_deltas
    )
    module = build_module(target_names)
    module_path = CANDIDATE_DIRECTORY / MODULE_FILENAME
    module_path.write_text(f"{json.dumps(module, indent=2)}\n", encoding="utf8")
    validation = validate_combinations(
        balanced, faces, morph_deltas, module
    )
    validation_path = CANDIDATE_DIRECTORY / VALIDATION_FILENAME
    validation_path.write_text(
        f"{json.dumps(validation, indent=2)}\n", encoding="utf8"
    )
    if validation["status"] != "passed":
        raise RuntimeError(
            "Identity Shell v2 combination validation failed: "
            + ", ".join(validation["failedCombinationIds"])
        )
    shutil.copyfile(glb_path, APP_DIRECTORY / GLB_FILENAME)
    shutil.copyfile(module_path, APP_DIRECTORY / MODULE_FILENAME)
    digest = sha256_file(glb_path)
    variants = []
    for preset in module["presets"]["shape"]:
        variants.append(
            {
                "id": preset["id"],
                "label": preset["defaultLabel"],
                "description": preset["defaultDescription"],
                "thumbnails": [],
                "presentation": {
                    "type": "parameter-preset",
                    "parameterPresetId": preset["id"],
                },
            }
        )
    manifest = {
        "schemaVersion": "2.0.0",
        "assetSchemaVersion": "2.0.0",
        "assetId": "synmere-identity-shell-v2",
        "assetName": "identity-shell",
        "displayName": "Identity Shell v2",
        "version": "2.0.0",
        "releaseTag": "identity-shell-v2.0.0",
        "topologyVersion": "flame-2023-open",
        "stage": "candidate",
        "validationStatus": "needs-review",
        "thumbnails": [],
        "defaultVariantId": "baseline",
        "variants": variants,
        "candidateSha256": digest,
        "exportedAt": "2026-08-12T04:50:00.000Z",
        "glb": {
            "publicPath": "/models/shell/identity-shell/2.0.0/identity-shell.glb",
            "sha256": digest,
            "sizeBytes": glb_path.stat().st_size,
        },
        "modulePublicPath": (
            "/models/shell/identity-shell/2.0.0/module-manifest.json"
        ),
        "contract": {
            "meshName": "FLAME2023Open",
            "materialName": "IdentityShellClay",
            "morphTargetNames": target_names,
            "identityMorphTargetCount": len(TARGET_DELTAS),
            "structureMorphTargetCount": len(STRUCTURE_TARGET_NAMES),
            "identityMorphDeltaSha256": identity_morph_sha256,
            "vertexCount": int(balanced.shape[0]),
            "triangleCount": int(faces.shape[0]),
            "topologySha256": topology_sha256,
        },
        "validation": {
            "status": validation["status"],
            "combinationCount": validation["combinationCount"],
            "reportPath": (
                "assets/candidates/identity-shell/2.0.0/"
                + VALIDATION_FILENAME
            ),
            "reportSha256": sha256_file(validation_path),
        },
        "provenance": {
            "model": {
                **provenance["model"],
                "role": "Identity Shell v2.0.0 candidate topology",
            },
            "containedModel": provenance["containedModel"],
            "source": provenance["source"],
            "license": provenance["license"],
            "changes": "Converted to one morph-target GLB for shell review.",
        },
    }
    serialized = f"{json.dumps(manifest, indent=2)}\n"
    (CANDIDATE_DIRECTORY / "candidate-manifest.json").write_text(
        serialized, encoding="utf8"
    )
    (APP_DIRECTORY / "candidate-manifest.json").write_text(
        serialized, encoding="utf8"
    )
    print(
        json.dumps(
            {
                "glb": str(glb_path.relative_to(PROJECT_ROOT)),
                "morphTargetCount": len(target_names),
                "releaseTag": manifest["releaseTag"],
                "status": "candidate",
                "variantCount": len(variants),
            },
            indent=2,
        )
    )


if __name__ == "__main__":
    main()

import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

import {
  CANDIDATE_GLB_PATH,
  EXPECTED_MESH_NAME,
  MAXIMUM_MORPH_EDGE_STRAIN,
} from "./asset-paths.mjs";
import {
  getIdentityShellDocument,
  getNodeExtras,
  readAccessor,
  readGlb,
  sha256File,
} from "./glb.mjs";

const SAMPLE_WEIGHTS = [0, 0.25, 0.5, 0.75, 1];
const AREA_EPSILON = 1e-12;
const PRODUCT_BASELINE = {
  identity_face_wide: 0.26087,
  identity_face_short: 0.28571,
  identity_forehead_wide: 0.20132,
  identity_upper_face_short: 0.24545,
  identity_cheekbones_wide: 0.315,
  identity_jaw_wide: 0.38182,
  identity_jaw_taper_square: 0.21789,
};
const COMBINED_STATES = {
  "jaw-wide-chin-long-corrective": {
    identity_jaw_wide: 1,
    identity_chin_long: 1,
    corrective_jaw_wide_chin_long: 1,
  },
  "jaw-wide-head-depth-high": {
    identity_jaw_wide: 1,
    identity_head_depth_high: 1,
  },
  "jaw-wide-head-depth-low": {
    identity_jaw_wide: 1,
    identity_head_depth_low: 1,
  },
  "mouth-wide-chin-long": {
    identity_mouth_wide: 1,
    identity_chin_long: 1,
  },
  "cheek-wide-jaw-wide": {
    identity_cheekbones_wide: 1,
    identity_jaw_wide: 1,
  },
  "product-balanced": {
    ...PRODUCT_BASELINE,
    presentation_structure_structured: 0.18,
  },
  "product-structured": {
    ...PRODUCT_BASELINE,
    presentation_structure_structured: 0.72,
  },
  "product-soft": {
    ...PRODUCT_BASELINE,
    presentation_structure_soft: 0.58,
  },
};

const subtract = (left, right) => {
  return left.map((value, axis) => value - right[axis]);
};

const addScaled = (target, delta, weight) => {
  target[0] += delta[0] * weight;
  target[1] += delta[1] * weight;
  target[2] += delta[2] * weight;
};

const cross = (left, right) => {
  return [
    left[1] * right[2] - left[2] * right[1],
    left[2] * right[0] - left[0] * right[2],
    left[0] * right[1] - left[1] * right[0],
  ];
};

const dot = (left, right) => {
  return left[0] * right[0] + left[1] * right[1] + left[2] * right[2];
};

const magnitude = (vector) => Math.hypot(...vector);

const getTriangles = (indices) => {
  const triangles = [];
  for (let offset = 0; offset < indices.length; offset += 3) {
    triangles.push([indices[offset], indices[offset + 1], indices[offset + 2]]);
  }
  return triangles;
};

const getAreaVector = (positions, triangle) => {
  return cross(
    subtract(positions[triangle[1]], positions[triangle[0]]),
    subtract(positions[triangle[2]], positions[triangle[0]]),
  );
};

const evaluatePositions = (basis, morphDeltas, weights) => {
  const positions = basis.map((position) => [...position]);
  Object.entries(weights).forEach(([name, weight]) => {
    const deltas = morphDeltas.get(name);
    if (!deltas) {
      throw new Error(`Global morph state references missing target ${name}.`);
    }
    if (weight === 0) {
      return;
    }
    positions.forEach((position, index) => {
      addScaled(position, deltas[index], weight);
    });
  });
  return positions;
};

const getStateDefinitions = (targetNames) => {
  const states = targetNames.flatMap((target) => {
    return SAMPLE_WEIGHTS.map((weight) => ({
      id: `${target}__${weight.toFixed(2)}`,
      weights: { [target]: weight },
    }));
  });
  Object.entries(COMBINED_STATES).forEach(([id, weights]) => {
    states.push({ id, weights });
  });
  return states;
};

export const validateMorphSafety = async () => {
  const glb = await readGlb(CANDIDATE_GLB_PATH);
  const { mesh, primitive } = getIdentityShellDocument(glb, EXPECTED_MESH_NAME);
  const basis = readAccessor(glb, primitive.attributes.POSITION);
  const triangles = getTriangles(readAccessor(glb, primitive.indices));
  const targetNames = mesh.extras?.targetNames ?? [];
  const morphDeltas = new Map(
    (primitive.targets ?? []).map((target, index) => {
      return [targetNames[index], readAccessor(glb, target.POSITION)];
    }),
  );
  const states = getStateDefinitions(targetNames);
  const basisAreas = triangles.map((triangle) => {
    return getAreaVector(basis, triangle);
  });

  let invertedStateCount = 0;
  let degenerateStateCount = 0;
  let maximumInvertedFaces = 0;
  let maximumDegenerateFaces = 0;
  let minimumAreaRatio = Number.POSITIVE_INFINITY;
  let maximumAreaRatio = 0;
  const failures = [];

  states.forEach((state) => {
    const positions = evaluatePositions(basis, morphDeltas, state.weights);
    let invertedFaces = 0;
    let degenerateFaces = 0;
    triangles.forEach((triangle, faceIndex) => {
      const basisArea = basisAreas[faceIndex];
      const stateArea = getAreaVector(positions, triangle);
      const basisMagnitude = magnitude(basisArea);
      const stateMagnitude = magnitude(stateArea);
      if (stateMagnitude <= AREA_EPSILON || basisMagnitude <= AREA_EPSILON) {
        degenerateFaces += 1;
        return;
      }
      const areaRatio = stateMagnitude / basisMagnitude;
      minimumAreaRatio = Math.min(minimumAreaRatio, areaRatio);
      maximumAreaRatio = Math.max(maximumAreaRatio, areaRatio);
      if (dot(stateArea, basisArea) <= 0) {
        invertedFaces += 1;
      }
    });
    if (invertedFaces > 0 || degenerateFaces > 0) {
      failures.push({
        state: state.id,
        invertedFaces,
        degenerateFaces,
      });
    }
    invertedStateCount += Number(invertedFaces > 0);
    degenerateStateCount += Number(degenerateFaces > 0);
    maximumInvertedFaces = Math.max(maximumInvertedFaces, invertedFaces);
    maximumDegenerateFaces = Math.max(maximumDegenerateFaces, degenerateFaces);
  });

  const extras = getNodeExtras(glb, EXPECTED_MESH_NAME);
  const morphIntegrity = extras.morphIntegrity ?? {};
  const strainFailures = Object.entries(morphIntegrity)
    .filter(([, integrity]) => {
      return (
        !Number.isFinite(integrity.maximumEdgeStrain) ||
        integrity.maximumEdgeStrain > MAXIMUM_MORPH_EDGE_STRAIN
      );
    })
    .map(([name]) => name);
  const result = {
    passed:
      states.length === targetNames.length * SAMPLE_WEIGHTS.length + 8 &&
      maximumInvertedFaces === 0 &&
      maximumDegenerateFaces === 0 &&
      strainFailures.length === 0,
    candidateSha256: await sha256File(CANDIDATE_GLB_PATH),
    sampledStates: states.length,
    invertedStateCount,
    maximumInvertedFaces,
    degenerateStateCount,
    maximumDegenerateFaces,
    minimumAreaRatio,
    maximumAreaRatio,
    maximumMorphEdgeStrain: Math.max(
      ...Object.values(morphIntegrity).map((integrity) => {
        return integrity.maximumEdgeStrain;
      }),
    ),
    strainLimit: MAXIMUM_MORPH_EDGE_STRAIN,
    strainFailures,
    failures,
  };

  if (!result.passed) {
    throw new Error(
      `Global morph safety validation failed: ${JSON.stringify(result)}`,
    );
  }
  return result;
};

if (pathToFileURL(process.argv[1]).href === import.meta.url) {
  await readFile(CANDIDATE_GLB_PATH);
  console.log(JSON.stringify(await validateMorphSafety(), null, 2));
}

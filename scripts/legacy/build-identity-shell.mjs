// Legacy topology bootstrap only. The canonical identity-shell-v1 source is now the Blender asset.
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import {
  BufferAttribute,
  BufferGeometry,
  DoubleSide,
  Mesh,
  MeshPhysicalMaterial,
} from "three";
import { GLTFExporter } from "three/addons/exporters/GLTFExporter.js";

const SOURCE_BASE_PATH = "makehuman/data/3dobjs/base.obj";
const SHELL_CONFIG = {
  centerY: 7.35,
  halfWidth: 0.79,
  halfHeight: 1.18,
  minimumDepth: 0.72,
  centerDepthBias: 0.3,
  thickness: 0.11,
  backScale: 0.975,
  bevelDepth: 0.026,
  bevelScale: 0.988,
  boundarySmoothingPasses: 8,
  boundarySmoothingStrength: 0.32,
  boundaryDepthSmoothingStrength: 0.58,
  maximumMorphNormalDelta: 0.24,
  morphDepthFeather: 0.16,
  morphSmoothingPasses: 3,
  morphSmoothingStrength: 0.22,
  morphEdgeRelaxationPasses: 20,
  maximumMorphEdgeStrain: 0.72,
  minimumMorphEdgeDelta: 0.012,
  neutralEyeClosureWeight: 0.72,
  featureCapRecess: 0.014,
  featureCapRingScale: 0.56,
  featureCapBoundaryRecessRatio: 0,
  featureCapRingRecessRatio: 0.5,
  featureCapCenterRecessRatio: 1,
};

const PROTECTED_VERTEX_REGION = {
  eyelid_boundary_loops: {
    centersX: [-0.3, 0.3],
    centerY: 7.4,
    radiusX: 0.24,
    radiusY: 0.12,
    boundaryBand: 0.24,
    minimumZ: 0.95,
  },
  nostril_boundary_loops: {
    centersX: [-0.13, 0.13],
    centerY: 6.86,
    radiusX: 0.085,
    radiusY: 0.06,
    boundaryBand: 0.32,
    minimumZ: 1.22,
  },
  lip_boundary_loops: {
    centersX: [0],
    centerY: 6.55,
    radiusX: 0.36,
    radiusY: 0.14,
    boundaryBand: 0.22,
    minimumZ: 1.02,
  },
};

const FEATURE_MORPH_CONFIG = {
  minimumSurfaceDepth: 0.86,
  eyeWidth: {
    centerX: 0.3,
    horizontalRadius: [0.24, 0.38],
    minimumDepth: 1,
    verticalBand: [7.22, 7.3, 7.52, 7.6],
    strength: 0.22,
  },
  eyeSpacing: {
    horizontalBand: [0.07, 0.12, 0.52, 0.62],
    minimumDepth: 1,
    verticalBand: [7.22, 7.3, 7.52, 7.6],
    strength: 0.032,
  },
  browArch: {
    horizontalBand: [0.08, 0.18, 0.4, 0.58],
    minimumDepth: 1,
    verticalBand: [7.48, 7.58, 7.66, 7.74],
    strength: 0.082,
  },
  cheekWidth: {
    horizontalBand: [0.18, 0.32, 0.72, 0.94],
    minimumDepth: 0.9,
    verticalBand: [6.62, 6.82, 7.28, 7.48],
    strength: 0.12,
  },
  jawTaper: {
    minimumDepth: 0.7,
    verticalTransition: [6.08, 6.84],
    horizontalBand: [0.03, 0.1, 0.62, 0.86],
    centerOffset: 0.1,
    squareStrength: 0.25,
    narrowStrength: 0.12,
  },
  noseWidth: {
    horizontalBand: [0.035, 0.08, 0.25, 0.34],
    minimumDepth: 1.35,
    verticalBand: [6.76, 6.84, 7.3, 7.39],
    strength: 0.085,
  },
  noseLength: {
    centerY: 7.46,
    horizontalRadius: [0.25, 0.34],
    minimumDepth: 1.3,
    verticalBand: [6.76, 6.84, 7.38, 7.48],
    strength: 0.24,
  },
  mouthWidth: {
    horizontalBand: [0.035, 0.08, 0.34, 0.42],
    minimumDepth: 1.15,
    verticalBand: [6.31, 6.39, 6.84, 6.93],
    strength: 0.12,
  },
  // A short chin lifts the lower-jaw arc; a long chin stays centered to preserve the taper.
  chin: {
    minimumDepth: 0.55,
    transitionBand: [6.08, 6.48],
    longSideBand: [0.48, 0.76],
    shortSideBand: [0.75, 1.15],
    longStrength: 0.31,
    shortStrength: 0.22,
  },
};

const REPLACED_SOURCE_MORPHS = new Set([
  "identity_eye_spacing_wide",
  "identity_eye_spacing_narrow",
  "identity_eye_width_wide",
  "identity_eye_width_narrow",
  "identity_brow_arch_high",
  "identity_brow_arch_low",
  "identity_cheekbones_wide",
  "identity_cheekbones_narrow",
  "identity_nose_wide",
  "identity_nose_narrow",
  "identity_nose_long",
  "identity_nose_short",
  "identity_mouth_wide",
  "identity_mouth_narrow",
  "identity_chin_long",
  "identity_chin_short",
]);

// Overlapping nose controls keep neutral normals so their valid position deltas cannot create a shading seam.
const BASE_NORMAL_MORPHS = new Set([
  "identity_nose_wide",
  "identity_nose_narrow",
  "identity_nose_long",
  "identity_nose_short",
  "identity_nose_projection_high",
  "identity_nose_projection_low",
]);

// Translation-like chin morphs move every shell layer equally so the bevel cannot shear.
const UNSCALED_VERTICAL_MORPHS = new Set([
  "identity_chin_long",
  "identity_chin_short",
]);

const SMOOTHED_LOCAL_MORPHS = new Set([
  ...REPLACED_SOURCE_MORPHS,
  "identity_forehead_wide",
  "identity_forehead_narrow",
  "identity_upper_face_tall",
  "identity_upper_face_short",
  "identity_jaw_wide",
  "identity_jaw_narrow",
  "identity_jaw_taper_square",
  "identity_jaw_taper_narrow",
  "presentation_structure_structured",
  "presentation_structure_soft",
  "corrective_jaw_wide_chin_long",
]);

class NodeFileReader {
  result = null;
  onload = null;
  onloadend = null;
  onerror = null;

  readAsArrayBuffer(blob) {
    blob
      .arrayBuffer()
      .then((result) => {
        this.result = result;
        this.onload?.({ target: this });
        this.onloadend?.({ target: this });
      })
      .catch((error) => this.onerror?.(error));
  }

  readAsDataURL(blob) {
    blob
      .arrayBuffer()
      .then((result) => {
        this.result = `data:${blob.type};base64,${Buffer.from(result).toString("base64")}`;
        this.onload?.({ target: this });
        this.onloadend?.({ target: this });
      })
      .catch((error) => this.onerror?.(error));
  }
}

globalThis.FileReader = NodeFileReader;

const clamp01 = (value) => Math.max(0, Math.min(1, value));
const smoothstep = (minimum, maximum, value) => {
  const normalized = clamp01((value - minimum) / (maximum - minimum));
  return normalized * normalized * (3 - 2 * normalized);
};
const bandWeight = ([minimum, innerMinimum, innerMaximum, maximum], value) => {
  return (
    smoothstep(minimum, innerMinimum, value) *
    (1 - smoothstep(innerMaximum, maximum, value))
  );
};
const surfaceDepthWeight = (depth, minimumDepth) => {
  return smoothstep(
    minimumDepth - SHELL_CONFIG.morphDepthFeather,
    minimumDepth + SHELL_CONFIG.morphDepthFeather,
    depth,
  );
};
const addVector = (left, right, scale = 1) => {
  return [
    left[0] + right[0] * scale,
    left[1] + right[1] * scale,
    left[2] + right[2] * scale,
  ];
};
const mergeMorphDeltas = (...morphs) => {
  const merged = new Map();
  morphs.forEach((morph) => {
    morph.forEach((delta, index) => {
      merged.set(index, addVector(merged.get(index) ?? [0, 0, 0], delta));
    });
  });
  return merged;
};
const parseObj = async (sourcePath) => {
  const source = await readFile(sourcePath, "utf8");
  const vertices = [];
  const bodyFaces = [];
  let activeGroup = "";

  source.split(/\r?\n/u).forEach((line) => {
    if (line.startsWith("v ")) {
      const [, x, y, z] = line.trim().split(/\s+/u);
      vertices.push([Number(x), Number(y), Number(z)]);
      return;
    }
    if (line.startsWith("g ")) {
      activeGroup = line.slice(2).trim();
      return;
    }
    if (activeGroup === "body" && line.startsWith("f ")) {
      bodyFaces.push(
        line
          .slice(2)
          .trim()
          .split(/\s+/u)
          .map((value) => Number(value.split("/")[0]) - 1),
      );
    }
  });

  return { vertices, bodyFaces };
};

const parseTarget = async (targetPath) => {
  const source = await readFile(targetPath, "utf8");
  const deltas = new Map();

  source.split(/\r?\n/u).forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      return;
    }
    const [index, x, y, z] = trimmed.split(/\s+/u);
    deltas.set(Number(index), [Number(x), Number(y), Number(z)]);
  });
  return deltas;
};

const combineTargetFiles = async (sourceRoot, targetSpecs) => {
  const combined = new Map();
  const targets = await Promise.all(
    targetSpecs.map(async (targetSpec) => {
      const target = await parseTarget(
        path.join(sourceRoot, "makehuman/data/targets", targetSpec.path),
      );
      return { target, weight: targetSpec.weight };
    }),
  );

  targets.forEach(({ target, weight }) => {
    target.forEach((delta, index) => {
      combined.set(
        index,
        addVector(combined.get(index) ?? [0, 0, 0], delta, weight),
      );
    });
  });
  return combined;
};

const averageExpressionTarget = (name, side, strength = 1) => {
  return ["african", "asian", "caucasian"].map((family) => ({
    path: `expression/units/${family}/${name}-${side}.target`,
    weight: strength / 3,
  }));
};

const buildNeutralAdjustments = async (sourceRoot) => {
  return combineTargetFiles(sourceRoot, [
    ...averageExpressionTarget(
      "eye",
      "left-closure",
      SHELL_CONFIG.neutralEyeClosureWeight,
    ),
    ...averageExpressionTarget(
      "eye",
      "right-closure",
      SHELL_CONFIG.neutralEyeClosureWeight,
    ),
  ]);
};

const isFaceSurfaceVertex = ([x, y, z]) => {
  const normalizedX = x / SHELL_CONFIG.halfWidth;
  const normalizedY = (y - SHELL_CONFIG.centerY) / SHELL_CONFIG.halfHeight;
  const radiusSquared = normalizedX ** 2 + normalizedY ** 2;
  const depthThreshold =
    SHELL_CONFIG.minimumDepth +
    SHELL_CONFIG.centerDepthBias * Math.max(0, 1 - radiusSquared);
  return radiusSquared <= 1 && z >= depthThreshold;
};

const getBoundaryLoops = (faces) => {
  const edgeCounts = new Map();
  faces.forEach((face) => {
    face.forEach((vertex, index) => {
      const next = face[(index + 1) % face.length];
      const edge = vertex < next ? `${vertex}:${next}` : `${next}:${vertex}`;
      edgeCounts.set(edge, (edgeCounts.get(edge) ?? 0) + 1);
    });
  });
  const boundaryEdges = [...edgeCounts.entries()]
    .filter(([, count]) => count === 1)
    .map(([edge]) => edge.split(":").map(Number));
  const adjacency = new Map();
  boundaryEdges.forEach(([left, right]) => {
    adjacency.set(left, [...(adjacency.get(left) ?? []), right]);
    adjacency.set(right, [...(adjacency.get(right) ?? []), left]);
  });

  // Every manifold boundary is a degree-two graph, so walking unused edges yields its loops.
  const unusedEdges = new Set(
    boundaryEdges.map(([left, right]) => {
      return left < right ? `${left}:${right}` : `${right}:${left}`;
    }),
  );
  const loops = [];
  while (unusedEdges.size > 0) {
    const [firstEdge] = unusedEdges;
    const [start, next] = firstEdge.split(":").map(Number);
    const loop = [start];
    let previous = start;
    let current = next;

    while (current !== start && loop.length <= boundaryEdges.length) {
      loop.push(current);
      const candidates = adjacency.get(current) ?? [];
      const following =
        candidates.find((candidate) => candidate !== previous) ?? start;
      const edge =
        current < following
          ? `${current}:${following}`
          : `${following}:${current}`;
      const consumed =
        previous < current
          ? `${previous}:${current}`
          : `${current}:${previous}`;
      unusedEdges.delete(consumed);
      previous = current;
      current = following;
      if (!unusedEdges.has(edge) && current !== start) {
        break;
      }
    }
    const closing =
      loop[0] < loop.at(-1)
        ? `${loop[0]}:${loop.at(-1)}`
        : `${loop.at(-1)}:${loop[0]}`;
    unusedEdges.delete(closing);
    if (loop.length >= 3) {
      loops.push(loop);
    }
  }
  return loops;
};

const triangulateFaces = (faces) => {
  return faces.flatMap((face) => {
    return Array.from({ length: face.length - 2 }, (_, index) => [
      face[0],
      face[index + 1],
      face[index + 2],
    ]);
  });
};

const orientFrontTrianglesTowardViewer = (positions, triangles) => {
  return triangles.map(([first, second, third]) => {
    const firstPosition = positions[first];
    const secondPosition = positions[second];
    const thirdPosition = positions[third];
    const firstEdgeX = secondPosition[0] - firstPosition[0];
    const firstEdgeY = secondPosition[1] - firstPosition[1];
    const secondEdgeX = thirdPosition[0] - firstPosition[0];
    const secondEdgeY = thirdPosition[1] - firstPosition[1];
    const normalZ = firstEdgeX * secondEdgeY - firstEdgeY * secondEdgeX;

    // The identity shell is a front-facing presentation surface. Normalizing
    // winding prevents authored cavity faces from disappearing under culling.
    return normalZ >= 0 ? [first, second, third] : [first, third, second];
  });
};

const smoothAuthoredBoundary = (positions, boundary) => {
  for (let pass = 0; pass < SHELL_CONFIG.boundarySmoothingPasses; pass += 1) {
    const nextPositions = boundary.map((vertexIndex, index) => {
      const previousIndex =
        boundary[(index - 1 + boundary.length) % boundary.length];
      const nextIndex = boundary[(index + 1) % boundary.length];
      const current = positions[vertexIndex];
      const previous = positions[previousIndex];
      const next = positions[nextIndex];
      const neighborX = (previous[0] + next[0]) / 2;
      const neighborY = (previous[1] + next[1]) / 2;
      const neighborZ = (previous[2] + next[2]) / 2;
      return [
        current[0] +
          (neighborX - current[0]) * SHELL_CONFIG.boundarySmoothingStrength,
        current[1] +
          (neighborY - current[1]) * SHELL_CONFIG.boundarySmoothingStrength,
        current[2] +
          (neighborZ - current[2]) *
            SHELL_CONFIG.boundaryDepthSmoothingStrength,
      ];
    });
    boundary.forEach((vertexIndex, index) => {
      positions[vertexIndex] = nextPositions[index];
    });
  }
};

const buildFaceShellTopology = (vertices, bodyFaces, neutralAdjustments) => {
  const neutralVertices = vertices.map((vertex, index) => {
    return addVector(vertex, neutralAdjustments.get(index) ?? [0, 0, 0]);
  });
  const selectedFaces = bodyFaces.filter((face) => {
    return face.every((index) => isFaceSurfaceVertex(neutralVertices[index]));
  });
  const selectedSourceIndices = [
    ...new Set(selectedFaces.flatMap((face) => face)),
  ];
  const sourceToLocal = new Map(
    selectedSourceIndices.map((sourceIndex, localIndex) => [
      sourceIndex,
      localIndex,
    ]),
  );
  const localFaces = selectedFaces.map((face) => {
    return face.map((sourceIndex) => sourceToLocal.get(sourceIndex));
  });
  const frontPositions = selectedSourceIndices.map(
    (sourceIndex) => neutralVertices[sourceIndex],
  );
  const sourceWeights = selectedSourceIndices.map((sourceIndex) => [
    { index: sourceIndex, weight: 1 },
  ]);
  const loops = getBoundaryLoops(localFaces).sort(
    (left, right) => right.length - left.length,
  );
  const outerBoundary = loops[0];
  smoothAuthoredBoundary(frontPositions, outerBoundary);
  const authoredBoundaryRadii = outerBoundary.map((index) => {
    const [x, y] = frontPositions[index];
    const normalizedX = x / SHELL_CONFIG.halfWidth;
    const normalizedY = (y - SHELL_CONFIG.centerY) / SHELL_CONFIG.halfHeight;
    return Math.sqrt(normalizedX ** 2 + normalizedY ** 2);
  });
  let frontTriangles = triangulateFaces(localFaces);
  const sealedOpeningCenters = [];

  // Detached concentric caps sit behind anatomical openings. Duplicating the
  // boundary keeps cap normals from producing triangular shards on the face.
  loops.slice(1).forEach((loop) => {
    const loopPositions = loop.map((index) => frontPositions[index]);
    const center = loopPositions
      .reduce((sum, position) => addVector(sum, position), [0, 0, 0])
      .map((value) => value / loop.length);
    const surfaceCenterDepth = center[2];
    const capBoundary = loop.map((index) => {
      const position = frontPositions[index];
      const capIndex = frontPositions.length;
      frontPositions.push([
        position[0],
        position[1],
        position[2] -
          SHELL_CONFIG.featureCapRecess *
            SHELL_CONFIG.featureCapBoundaryRecessRatio,
      ]);
      sourceWeights.push(sourceWeights[index].map((source) => ({ ...source })));
      return capIndex;
    });
    const capRing = loop.map((index) => {
      const position = frontPositions[index];
      const capIndex = frontPositions.length;
      frontPositions.push([
        center[0] +
          (position[0] - center[0]) * SHELL_CONFIG.featureCapRingScale,
        center[1] +
          (position[1] - center[1]) * SHELL_CONFIG.featureCapRingScale,
        position[2] +
          (surfaceCenterDepth - position[2]) *
            (1 - SHELL_CONFIG.featureCapRingScale) -
          SHELL_CONFIG.featureCapRecess *
            SHELL_CONFIG.featureCapRingRecessRatio,
      ]);
      sourceWeights.push(sourceWeights[index].map((source) => ({ ...source })));
      return capIndex;
    });
    center[2] =
      surfaceCenterDepth -
      SHELL_CONFIG.featureCapRecess * SHELL_CONFIG.featureCapCenterRecessRatio;
    const centerIndex = frontPositions.length;
    frontPositions.push(center);
    sourceWeights.push(
      loop.flatMap((index) => {
        return sourceWeights[index].map((source) => ({
          index: source.index,
          weight: source.weight / loop.length,
        }));
      }),
    );
    sealedOpeningCenters.push(center);
    const signedArea = loop.reduce((total, index, loopIndex) => {
      const nextIndex = loop[(loopIndex + 1) % loop.length];
      const current = frontPositions[index];
      const next = frontPositions[nextIndex];
      return total + current[0] * next[1] - next[0] * current[1];
    }, 0);

    loop.forEach((_, loopIndex) => {
      const boundaryIndex = capBoundary[loopIndex];
      const nextBoundaryIndex = capBoundary[(loopIndex + 1) % loop.length];
      const ringIndex = capRing[loopIndex];
      const nextRingIndex = capRing[(loopIndex + 1) % loop.length];
      if (signedArea >= 0) {
        frontTriangles.push([boundaryIndex, nextBoundaryIndex, ringIndex]);
        frontTriangles.push([nextBoundaryIndex, nextRingIndex, ringIndex]);
        frontTriangles.push([ringIndex, nextRingIndex, centerIndex]);
        return;
      }
      frontTriangles.push([nextBoundaryIndex, boundaryIndex, ringIndex]);
      frontTriangles.push([nextRingIndex, nextBoundaryIndex, ringIndex]);
      frontTriangles.push([nextRingIndex, ringIndex, centerIndex]);
    });
  });
  frontTriangles = orientFrontTrianglesTowardViewer(
    frontPositions,
    frontTriangles,
  );

  const frontCount = frontPositions.length;
  const protectedVertexGroups = Object.fromEntries(
    Object.entries(PROTECTED_VERTEX_REGION).map(([group, region]) => [
      group,
      frontPositions.flatMap(([x, y, z], index) => {
        const protectedVertex =
          z >= region.minimumZ &&
          region.centersX.some((centerX) => {
            const radialDistance = Math.hypot(
              (x - centerX) / region.radiusX,
              (y - region.centerY) / region.radiusY,
            );
            return Math.abs(radialDistance - 1) <= region.boundaryBand;
          });
        return protectedVertex ? [index] : [];
      }),
    ]),
  );
  const backPositions = frontPositions.map(([x, y, z]) => [
    x * SHELL_CONFIG.backScale,
    SHELL_CONFIG.centerY + (y - SHELL_CONFIG.centerY) * SHELL_CONFIG.backScale,
    z - SHELL_CONFIG.thickness,
  ]);
  const bevelPositions = outerBoundary.map((frontIndex) => {
    const [x, y, z] = frontPositions[frontIndex];
    return [
      x * SHELL_CONFIG.bevelScale,
      SHELL_CONFIG.centerY +
        (y - SHELL_CONFIG.centerY) * SHELL_CONFIG.bevelScale,
      z - SHELL_CONFIG.bevelDepth,
    ];
  });
  const positions = [...frontPositions, ...backPositions, ...bevelPositions];
  const outputSources = [
    ...sourceWeights.map((weights) => ({ weights, scale: [1, 1, 1] })),
    ...sourceWeights.map((weights) => ({
      weights,
      scale: [SHELL_CONFIG.backScale, SHELL_CONFIG.backScale, 1],
    })),
    ...outerBoundary.map((frontIndex) => ({
      weights: sourceWeights[frontIndex],
      scale: [SHELL_CONFIG.bevelScale, SHELL_CONFIG.bevelScale, 1],
    })),
  ];
  const triangles = [
    ...frontTriangles,
    ...frontTriangles.map(([a, b, c]) => [
      c + frontCount,
      b + frontCount,
      a + frontCount,
    ]),
  ];
  outerBoundary.forEach((frontIndex, index) => {
    const nextFront = outerBoundary[(index + 1) % outerBoundary.length];
    const backIndex = frontIndex + frontCount;
    const nextBack = nextFront + frontCount;
    const bevelIndex = frontCount * 2 + index;
    const nextBevel = frontCount * 2 + ((index + 1) % outerBoundary.length);
    triangles.push([frontIndex, bevelIndex, nextFront]);
    triangles.push([nextFront, bevelIndex, nextBevel]);
    triangles.push([bevelIndex, backIndex, nextBevel]);
    triangles.push([nextBevel, backIndex, nextBack]);
  });

  return {
    positions,
    triangles,
    outputSources,
    selectedSourceIndices,
    outerBoundary,
    authoredBoundaryRadiusRange: [
      Math.min(...authoredBoundaryRadii),
      Math.max(...authoredBoundaryRadii),
    ],
    openingCount: Math.max(0, loops.length - 1),
    protectedVertexGroups,
    sealedOpeningCenters,
  };
};

const createLocalizedMorph = (vertices, kind, direction) => {
  const deltas = new Map();

  vertices.forEach(([x, y, z], index) => {
    const depthWeight = surfaceDepthWeight(z, 0.7);
    if (depthWeight <= 0) {
      return;
    }
    if (kind === "forehead") {
      const verticalWeight = smoothstep(7.35, 8.15, y);
      const sideWeight = 1 - smoothstep(0.55, 0.82, Math.abs(x));
      const weight = verticalWeight * sideWeight * depthWeight;
      if (weight > 0) {
        deltas.set(index, [x * 0.12 * direction * weight, 0, 0]);
      }
      return;
    }
    if (kind === "upperFace") {
      const pivotY = 7.44;
      const verticalWeight = smoothstep(7.34, 7.78, y);
      const sideWeight = 1 - smoothstep(0.62, 0.84, Math.abs(x));
      const weight = verticalWeight * sideWeight * depthWeight;
      if (weight > 0) {
        deltas.set(index, [0, (y - pivotY) * 0.18 * direction * weight, 0]);
      }
      return;
    }
    if (kind === "jaw") {
      const verticalWeight = 1 - smoothstep(6.65, 7.25, y);
      const sideWeight = smoothstep(0.18, 0.7, Math.abs(x));
      const weight = verticalWeight * sideWeight * depthWeight;
      if (weight > 0) {
        deltas.set(index, [x * 0.16 * direction * weight, 0, 0]);
      }
      return;
    }
    if (kind === "jawTaper") {
      const config = FEATURE_MORPH_CONFIG.jawTaper;
      const verticalWeight =
        1 -
        smoothstep(
          config.verticalTransition[0],
          config.verticalTransition[1],
          y,
        );
      const sideWeight = bandWeight(config.horizontalBand, Math.abs(x));
      const weight = verticalWeight * sideWeight * depthWeight;
      if (weight > 0) {
        const strength =
          direction > 0 ? config.squareStrength : config.narrowStrength;
        const horizontalDelta =
          Math.sign(x) *
          (Math.abs(x) + config.centerOffset) *
          strength *
          direction *
          weight;
        deltas.set(index, [horizontalDelta, 0, 0]);
      }
    }
  });
  return deltas;
};

const createFeatureMorphReinforcement = (vertices, kind, direction) => {
  const deltas = new Map();

  vertices.forEach(([x, y, z], index) => {
    let minimumDepth = FEATURE_MORPH_CONFIG.minimumSurfaceDepth;
    if (kind === "chin") {
      minimumDepth = FEATURE_MORPH_CONFIG.chin.minimumDepth;
    }
    let depthWeight = surfaceDepthWeight(z, minimumDepth);
    if (depthWeight <= 0) {
      return;
    }
    const absoluteX = Math.abs(x);

    if (kind === "eyeWidth") {
      const config = FEATURE_MORPH_CONFIG.eyeWidth;
      depthWeight = surfaceDepthWeight(z, config.minimumDepth);
      if (depthWeight <= 0) {
        return;
      }
      const sideCenter = Math.sign(x) * config.centerX;
      const localX = x - sideCenter;
      const horizontalWeight =
        1 -
        smoothstep(
          config.horizontalRadius[0],
          config.horizontalRadius[1],
          Math.abs(localX),
        );
      const verticalWeight = bandWeight(config.verticalBand, y);
      const centerSeparationWeight = smoothstep(0.04, 0.1, absoluteX);
      const weight =
        horizontalWeight *
        verticalWeight *
        centerSeparationWeight *
        depthWeight;
      if (weight > 0) {
        deltas.set(index, [
          localX * config.strength * direction * weight,
          0,
          0,
        ]);
      }
      return;
    }

    if (kind === "eyeSpacing") {
      const config = FEATURE_MORPH_CONFIG.eyeSpacing;
      depthWeight = surfaceDepthWeight(z, config.minimumDepth);
      if (depthWeight <= 0) {
        return;
      }
      const weight =
        bandWeight(config.horizontalBand, absoluteX) *
        bandWeight(config.verticalBand, y) *
        depthWeight;
      if (weight > 0) {
        deltas.set(index, [
          Math.sign(x) * config.strength * direction * weight,
          0,
          0,
        ]);
      }
      return;
    }

    if (kind === "browArch") {
      const config = FEATURE_MORPH_CONFIG.browArch;
      depthWeight = surfaceDepthWeight(z, config.minimumDepth);
      if (depthWeight <= 0) {
        return;
      }
      const weight =
        bandWeight(config.horizontalBand, absoluteX) *
        bandWeight(config.verticalBand, y) *
        depthWeight;
      if (weight > 0) {
        deltas.set(index, [0, config.strength * direction * weight, 0]);
      }
      return;
    }

    if (kind === "noseWidth") {
      const config = FEATURE_MORPH_CONFIG.noseWidth;
      depthWeight = surfaceDepthWeight(z, config.minimumDepth);
      if (depthWeight <= 0) {
        return;
      }
      const weight =
        bandWeight(config.horizontalBand, absoluteX) *
        bandWeight(config.verticalBand, y) *
        depthWeight;
      if (weight > 0) {
        deltas.set(index, [x * config.strength * direction * weight, 0, 0]);
      }
      return;
    }

    if (kind === "cheekWidth") {
      const config = FEATURE_MORPH_CONFIG.cheekWidth;
      depthWeight = surfaceDepthWeight(z, config.minimumDepth);
      if (depthWeight <= 0) {
        return;
      }
      const weight =
        bandWeight(config.horizontalBand, absoluteX) *
        bandWeight(config.verticalBand, y) *
        depthWeight;
      if (weight > 0) {
        deltas.set(index, [x * config.strength * direction * weight, 0, 0]);
      }
      return;
    }

    if (kind === "noseLength") {
      const config = FEATURE_MORPH_CONFIG.noseLength;
      depthWeight = surfaceDepthWeight(z, config.minimumDepth);
      if (depthWeight <= 0) {
        return;
      }
      const weight =
        (1 -
          smoothstep(
            config.horizontalRadius[0],
            config.horizontalRadius[1],
            absoluteX,
          )) *
        bandWeight(config.verticalBand, y) *
        depthWeight;
      if (weight > 0) {
        deltas.set(index, [
          0,
          (y - config.centerY) * config.strength * direction * weight,
          0,
        ]);
      }
      return;
    }

    if (kind === "mouthWidth") {
      const config = FEATURE_MORPH_CONFIG.mouthWidth;
      depthWeight = surfaceDepthWeight(z, config.minimumDepth);
      if (depthWeight <= 0) {
        return;
      }
      const weight =
        bandWeight(config.horizontalBand, absoluteX) *
        bandWeight(config.verticalBand, y) *
        depthWeight;
      if (weight > 0) {
        deltas.set(index, [x * config.strength * direction * weight, 0, 0]);
      }
      return;
    }

    if (kind === "chin") {
      const config = FEATURE_MORPH_CONFIG.chin;
      let sideBand = config.longSideBand;
      if (direction < 0) {
        sideBand = config.shortSideBand;
      }
      const verticalWeight =
        1 - smoothstep(config.transitionBand[0], config.transitionBand[1], y);
      const sideWeight = 1 - smoothstep(sideBand[0], sideBand[1], absoluteX);
      const weight = verticalWeight * sideWeight * depthWeight;
      if (weight <= 0) {
        return;
      }
      let verticalDelta = config.shortStrength * weight;
      if (direction > 0) {
        verticalDelta = -config.longStrength * weight;
      }
      deltas.set(index, [0, verticalDelta, 0]);
    }
  });

  return deltas;
};

const buildMorphSources = async (sourceRoot, vertices) => {
  const fileMorphs = {
    identity_face_wide: [
      { path: "head/head-scale-horiz-incr.target", weight: 1 },
    ],
    identity_face_narrow: [
      { path: "head/head-scale-horiz-decr.target", weight: 1 },
    ],
    identity_face_long: [
      { path: "head/head-scale-vert-incr.target", weight: 1 },
    ],
    identity_face_short: [
      { path: "head/head-scale-vert-decr.target", weight: 1 },
    ],
    identity_cheekbones_wide: [
      { path: "cheek/l-cheek-bones-incr.target", weight: 1 },
      { path: "cheek/r-cheek-bones-incr.target", weight: 1 },
    ],
    identity_cheekbones_narrow: [
      { path: "cheek/l-cheek-bones-decr.target", weight: 1 },
      { path: "cheek/r-cheek-bones-decr.target", weight: 1 },
    ],
    identity_eye_spacing_wide: [
      { path: "eyes/l-eye-trans-out.target", weight: 1 },
      { path: "eyes/r-eye-trans-out.target", weight: 1 },
    ],
    identity_eye_spacing_narrow: [
      { path: "eyes/l-eye-trans-in.target", weight: 1 },
      { path: "eyes/r-eye-trans-in.target", weight: 1 },
    ],
    identity_eye_width_wide: [
      { path: "eyes/l-eye-scale-incr.target", weight: 1 },
      { path: "eyes/r-eye-scale-incr.target", weight: 1 },
    ],
    identity_eye_width_narrow: [
      { path: "eyes/l-eye-scale-decr.target", weight: 1 },
      { path: "eyes/r-eye-scale-decr.target", weight: 1 },
    ],
    identity_brow_arch_high: [
      { path: "eyebrows/eyebrows-angle-up.target", weight: 1 },
    ],
    identity_brow_arch_low: [
      { path: "eyebrows/eyebrows-angle-down.target", weight: 1 },
    ],
    identity_brow_prominence_high: [
      { path: "eyebrows/eyebrows-trans-forward.target", weight: 1 },
    ],
    identity_brow_prominence_low: [
      { path: "eyebrows/eyebrows-trans-backward.target", weight: 1 },
    ],
    identity_nose_wide: [
      { path: "nose/nose-scale-horiz-incr.target", weight: 1 },
    ],
    identity_nose_narrow: [
      { path: "nose/nose-scale-horiz-decr.target", weight: 1 },
    ],
    identity_nose_long: [
      { path: "nose/nose-scale-vert-incr.target", weight: 1 },
    ],
    identity_nose_short: [
      { path: "nose/nose-scale-vert-decr.target", weight: 1 },
    ],
    identity_nose_projection_high: [
      { path: "nose/nose-scale-depth-incr.target", weight: 1 },
    ],
    identity_nose_projection_low: [
      { path: "nose/nose-scale-depth-decr.target", weight: 1 },
    ],
    identity_mouth_wide: [
      { path: "mouth/mouth-scale-horiz-incr.target", weight: 1 },
    ],
    identity_mouth_narrow: [
      { path: "mouth/mouth-scale-horiz-decr.target", weight: 1 },
    ],
    identity_chin_long: [{ path: "chin/chin-height-incr.target", weight: 1 }],
    identity_chin_short: [{ path: "chin/chin-height-decr.target", weight: 1 }],
    identity_head_depth_high: [
      { path: "head/head-scale-depth-incr.target", weight: 1 },
    ],
    identity_head_depth_low: [
      { path: "head/head-scale-depth-decr.target", weight: 1 },
    ],
  };
  const fileMorphEntries = await Promise.all(
    Object.entries(fileMorphs).map(async ([name, specs]) => {
      return [name, await combineTargetFiles(sourceRoot, specs)];
    }),
  );
  const morphs = new Map(fileMorphEntries);
  morphs.set(
    "identity_forehead_wide",
    createLocalizedMorph(vertices, "forehead", 1),
  );
  morphs.set(
    "identity_forehead_narrow",
    createLocalizedMorph(vertices, "forehead", -1),
  );
  morphs.set(
    "identity_upper_face_tall",
    createLocalizedMorph(vertices, "upperFace", 1),
  );
  morphs.set(
    "identity_upper_face_short",
    createLocalizedMorph(vertices, "upperFace", -1),
  );
  morphs.set("identity_jaw_wide", createLocalizedMorph(vertices, "jaw", 1));
  morphs.set("identity_jaw_narrow", createLocalizedMorph(vertices, "jaw", -1));
  morphs.set(
    "identity_jaw_taper_square",
    createLocalizedMorph(vertices, "jawTaper", 1),
  );
  morphs.set(
    "identity_jaw_taper_narrow",
    createLocalizedMorph(vertices, "jawTaper", -1),
  );

  // Source targets supply anatomical motion; localized reinforcement restores range lost by face-shell cropping.
  [
    ["identity_eye_spacing_wide", "eyeSpacing", 1],
    ["identity_eye_spacing_narrow", "eyeSpacing", -1],
    ["identity_eye_width_wide", "eyeWidth", 1],
    ["identity_eye_width_narrow", "eyeWidth", -1],
    ["identity_brow_arch_high", "browArch", 1],
    ["identity_brow_arch_low", "browArch", -1],
    ["identity_cheekbones_wide", "cheekWidth", 1],
    ["identity_cheekbones_narrow", "cheekWidth", -1],
    ["identity_nose_wide", "noseWidth", 1],
    ["identity_nose_narrow", "noseWidth", -1],
    ["identity_nose_long", "noseLength", 1],
    ["identity_nose_short", "noseLength", -1],
    ["identity_mouth_wide", "mouthWidth", 1],
    ["identity_mouth_narrow", "mouthWidth", -1],
    ["identity_chin_long", "chin", 1],
    ["identity_chin_short", "chin", -1],
  ].forEach(([name, kind, direction]) => {
    const sourceMorph = REPLACED_SOURCE_MORPHS.has(name)
      ? new Map()
      : morphs.get(name);
    morphs.set(
      name,
      mergeMorphDeltas(
        sourceMorph,
        createFeatureMorphReinforcement(vertices, kind, direction),
      ),
    );
  });

  const createPresentationMorph = (specs) => {
    return specs.reduce((combined, [name, weight]) => {
      return mergeMorphDeltas(
        combined,
        new Map(
          [...morphs.get(name).entries()].map(([index, delta]) => [
            index,
            delta.map((value) => value * weight),
          ]),
        ),
      );
    }, new Map());
  };

  // Presentation bases are reversible 3D layers and remain independent from scan data.
  morphs.set(
    "presentation_structure_structured",
    createPresentationMorph([
      ["identity_brow_prominence_high", 0.3],
      ["identity_brow_arch_low", 0.24],
      ["identity_jaw_wide", 0.65],
      ["identity_chin_long", 0.16],
      ["identity_nose_projection_high", 0.18],
      ["identity_eye_width_narrow", 0.08],
    ]),
  );
  morphs.set(
    "presentation_structure_soft",
    createPresentationMorph([
      ["identity_brow_prominence_low", 0.28],
      ["identity_brow_arch_high", 0.15],
      ["identity_jaw_narrow", 0.14],
      ["identity_chin_short", 0.08],
      ["identity_nose_projection_low", 0.1],
      ["identity_eye_width_wide", 0.04],
    ]),
  );

  const corrective = new Map();
  const jaw = morphs.get("identity_jaw_wide");
  const chin = morphs.get("identity_chin_long");
  new Set([...jaw.keys(), ...chin.keys()]).forEach((index) => {
    corrective.set(
      index,
      addVector(
        jaw.get(index) ?? [0, 0, 0],
        chin.get(index) ?? [0, 0, 0],
        1,
      ).map((value) => value * 0.12),
    );
  });
  morphs.set("corrective_jaw_wide_chin_long", corrective);
  return morphs;
};

const toRenderPosition = ([x, y, z]) => [x, y - SHELL_CONFIG.centerY, z - 1.16];

const buildOutputMorphDelta = (outputSource, sourceMorph, morphName) => {
  const delta = outputSource.weights.reduce(
    (sum, source) => {
      return addVector(
        sum,
        sourceMorph.get(source.index) ?? [0, 0, 0],
        source.weight,
      );
    },
    [0, 0, 0],
  );
  const outputDelta = delta.map(
    (value, axis) => value * outputSource.scale[axis],
  );
  if (UNSCALED_VERTICAL_MORPHS.has(morphName)) {
    outputDelta[1] = delta[1];
  }
  return outputDelta;
};

const getTopologyEdges = (triangles) => {
  const edges = new Map();
  triangles.forEach((triangle) => {
    triangle.forEach((start, index) => {
      const end = triangle[(index + 1) % triangle.length];
      const key = start < end ? `${start}:${end}` : `${end}:${start}`;
      edges.set(key, start < end ? [start, end] : [end, start]);
    });
  });
  return [...edges.values()];
};

const buildVertexAdjacency = (vertexCount, edges) => {
  const adjacency = Array.from({ length: vertexCount }, () => new Set());
  edges.forEach(([start, end]) => {
    adjacency[start].add(end);
    adjacency[end].add(start);
  });
  return adjacency;
};

const smoothMorphDeltas = (deltas, adjacency) => {
  let current = deltas.map((delta) => [...delta]);
  for (let pass = 0; pass < SHELL_CONFIG.morphSmoothingPasses; pass += 1) {
    current = current.map((delta, index) => {
      const neighbors = [...adjacency[index]];
      if (neighbors.length === 0) {
        return delta;
      }
      const averageDelta = neighbors
        .map((neighbor) => current[neighbor])
        .reduce((sum, neighbor) => addVector(sum, neighbor), [0, 0, 0])
        .map((value) => value / neighbors.length);
      return delta.map((value, axis) => {
        return (
          value +
          (averageDelta[axis] - value) * SHELL_CONFIG.morphSmoothingStrength
        );
      });
    });
  }
  return current;
};

const relaxMorphEdgeStrain = (positions, deltas, edges) => {
  let current = deltas.map((delta) => [...delta]);
  for (let pass = 0; pass < SHELL_CONFIG.morphEdgeRelaxationPasses; pass += 1) {
    const corrections = current.map(() => [0, 0, 0]);
    const correctionCounts = current.map(() => 0);
    edges.forEach(([start, end]) => {
      const edgeLength = Math.hypot(
        positions[end][0] - positions[start][0],
        positions[end][1] - positions[start][1],
        positions[end][2] - positions[start][2],
      );
      const deltaDifference = [
        current[end][0] - current[start][0],
        current[end][1] - current[start][1],
        current[end][2] - current[start][2],
      ];
      const differenceMagnitude = Math.hypot(...deltaDifference);
      const maximumDifference = Math.max(
        SHELL_CONFIG.minimumMorphEdgeDelta,
        edgeLength * SHELL_CONFIG.maximumMorphEdgeStrain,
      );
      if (differenceMagnitude <= maximumDifference) {
        return;
      }
      const excessRatio =
        (differenceMagnitude - maximumDifference) / differenceMagnitude / 2;
      deltaDifference.forEach((value, axis) => {
        const correction = value * excessRatio;
        corrections[start][axis] += correction;
        corrections[end][axis] -= correction;
      });
      correctionCounts[start] += 1;
      correctionCounts[end] += 1;
    });
    current = current.map((delta, index) => {
      const count = correctionCounts[index];
      if (count === 0) {
        return delta;
      }
      return delta.map((value, axis) => {
        return value + corrections[index][axis] / count;
      });
    });
  }
  return current;
};

const getMaximumMorphEdgeStrain = (positions, deltas, edges) => {
  return edges.reduce((maximum, [start, end]) => {
    const edgeLength = Math.hypot(
      positions[end][0] - positions[start][0],
      positions[end][1] - positions[start][1],
      positions[end][2] - positions[start][2],
    );
    const effectiveEdgeLength = Math.max(
      edgeLength,
      SHELL_CONFIG.minimumMorphEdgeDelta / SHELL_CONFIG.maximumMorphEdgeStrain,
    );
    const deltaDifference = Math.hypot(
      deltas[end][0] - deltas[start][0],
      deltas[end][1] - deltas[start][1],
      deltas[end][2] - deltas[start][2],
    );
    return Math.max(maximum, deltaDifference / effectiveEdgeLength);
  }, 0);
};

const enforceMorphEdgeStrainBudget = (positions, deltas, edges) => {
  const maximumEdgeStrain = getMaximumMorphEdgeStrain(positions, deltas, edges);
  if (maximumEdgeStrain <= SHELL_CONFIG.maximumMorphEdgeStrain) {
    return deltas;
  }
  const scale = SHELL_CONFIG.maximumMorphEdgeStrain / maximumEdgeStrain;
  return deltas.map((delta) => {
    return delta.map((value) => value * scale);
  });
};

const flattenVectors = (vectors) => new Float32Array(vectors.flat());

const buildGeometry = (topology, morphSources) => {
  const geometry = new BufferGeometry();
  geometry.setAttribute(
    "position",
    new BufferAttribute(
      flattenVectors(topology.positions.map(toRenderPosition)),
      3,
    ),
  );
  geometry.setIndex(
    new BufferAttribute(new Uint32Array(topology.triangles.flat()), 1),
  );
  geometry.computeVertexNormals();
  const baseNormals = geometry.getAttribute("normal");

  geometry.morphTargetsRelative = true;
  geometry.morphAttributes.position = [];
  geometry.morphAttributes.normal = [];
  const edges = getTopologyEdges(topology.triangles);
  const adjacency = buildVertexAdjacency(topology.positions.length, edges);
  const morphIntegrity = {};
  morphSources.forEach((sourceMorph, name) => {
    let deltas = topology.outputSources.map((outputSource) => {
      return buildOutputMorphDelta(outputSource, sourceMorph, name);
    });
    if (SMOOTHED_LOCAL_MORPHS.has(name)) {
      deltas = smoothMorphDeltas(deltas, adjacency);
    }
    deltas = relaxMorphEdgeStrain(topology.positions, deltas, edges);
    deltas = enforceMorphEdgeStrainBudget(topology.positions, deltas, edges);
    morphIntegrity[name] = {
      maximumEdgeStrain: Number(
        getMaximumMorphEdgeStrain(topology.positions, deltas, edges).toFixed(5),
      ),
    };
    const positionAttribute = new BufferAttribute(flattenVectors(deltas), 3);
    positionAttribute.name = name;
    geometry.morphAttributes.position.push(positionAttribute);

    const normalDeltas = new Float32Array(baseNormals.array.length);
    if (!BASE_NORMAL_MORPHS.has(name)) {
      const targetGeometry = geometry.clone();
      const targetPositions = topology.positions.map((position, index) => {
        return addVector(position, deltas[index]);
      });
      targetGeometry.setAttribute(
        "position",
        new BufferAttribute(
          flattenVectors(targetPositions.map(toRenderPosition)),
          3,
        ),
      );
      targetGeometry.morphAttributes = {};
      targetGeometry.computeVertexNormals();
      const targetNormals = targetGeometry.getAttribute("normal");
      // Bounded normal deltas prevent several valid identity morphs from summing into a shading flip.
      for (let index = 0; index < baseNormals.count; index += 1) {
        const delta = [
          targetNormals.getX(index) - baseNormals.getX(index),
          targetNormals.getY(index) - baseNormals.getY(index),
          targetNormals.getZ(index) - baseNormals.getZ(index),
        ];
        const magnitude = Math.hypot(...delta);
        const scale =
          magnitude > SHELL_CONFIG.maximumMorphNormalDelta
            ? SHELL_CONFIG.maximumMorphNormalDelta / magnitude
            : 1;
        normalDeltas[index * 3] = delta[0] * scale;
        normalDeltas[index * 3 + 1] = delta[1] * scale;
        normalDeltas[index * 3 + 2] = delta[2] * scale;
      }
      targetGeometry.dispose();
    }
    const normalAttribute = new BufferAttribute(normalDeltas, 3);
    normalAttribute.name = name;
    geometry.morphAttributes.normal.push(normalAttribute);
  });
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return { geometry, morphIntegrity };
};

const exportIdentityShell = async (sourceRoot, outputPath) => {
  const { vertices, bodyFaces } = await parseObj(
    path.join(sourceRoot, SOURCE_BASE_PATH),
  );
  const neutralAdjustments = await buildNeutralAdjustments(sourceRoot);
  const topology = buildFaceShellTopology(
    vertices,
    bodyFaces,
    neutralAdjustments,
  );
  const morphSources = await buildMorphSources(sourceRoot, vertices);
  const { geometry, morphIntegrity } = buildGeometry(topology, morphSources);
  const material = new MeshPhysicalMaterial({
    color: "#C5C7C8",
    roughness: 0.9,
    metalness: 0,
    clearcoat: 0.018,
    clearcoatRoughness: 0.96,
    side: DoubleSide,
  });
  material.name = "IdentityCeramic";
  const mesh = new Mesh(geometry, material);
  mesh.name = "IdentityShell";
  mesh.updateMorphTargets();
  mesh.userData = {
    assetId: "synmere-identity-shell-v1",
    topologyVersion: "synmere-authored-shell-v2",
    source: "MakeHuman hm08 CC0",
    morphIntegrity,
    presentationTopology: {
      featureCapRecess: SHELL_CONFIG.featureCapRecess,
      neutralEyeClosureWeight: SHELL_CONFIG.neutralEyeClosureWeight,
      protectedVertexGroups: topology.protectedVertexGroups,
      sealedOpeningCenters: topology.sealedOpeningCenters,
      sealedOpeningCount: topology.openingCount,
    },
  };

  const exporter = new GLTFExporter();
  const result = await exporter.parseAsync(mesh, {
    binary: true,
    onlyVisible: true,
    includeCustomExtensions: true,
  });
  await writeFile(outputPath, Buffer.from(result));

  console.log(
    JSON.stringify(
      {
        outputPath,
        vertices: geometry.getAttribute("position").count,
        triangles: geometry.getIndex().count / 3,
        morphTargets: geometry.morphAttributes.position.length,
        perimeterVertices: topology.outerBoundary.length,
        authoredBoundaryRadiusRange: topology.authoredBoundaryRadiusRange,
        sealedOpenings: topology.openingCount,
        sealedOpeningCenters: topology.sealedOpeningCenters,
        protectedVertexGroups: Object.fromEntries(
          Object.entries(topology.protectedVertexGroups).map(
            ([group, vertices]) => [group, vertices.length],
          ),
        ),
      },
      null,
      2,
    ),
  );
};

const [sourceRoot, outputPath] = process.argv.slice(2);
if (!sourceRoot || !outputPath) {
  throw new Error(
    "Usage: node build-identity-shell.mjs <makehuman-root> <output.glb>",
  );
}

const retiredProductionPath = path.resolve(
  process.cwd(),
  "public/models/shell/identity-shell/1.1.2/identity-shell.glb",
);
if (path.resolve(outputPath) === retiredProductionPath) {
  throw new Error(
    "The MakeHuman bootstrap is retired and cannot overwrite the production shell. Use pnpm asset:shell:export and pnpm asset:shell:promote.",
  );
}

await exportIdentityShell(sourceRoot, outputPath);

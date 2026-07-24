import { spawnSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  BLENDER_EXECUTABLE,
  CANDIDATE_GLB_PATH,
  CANDIDATE_MANIFEST_PATH,
  EXPECTED_MESH_NAME,
  PRODUCTION_GLB_PATH,
  SOURCE_BLEND_PATH,
} from "./asset-paths.mjs";
import {
  getIdentityShellDocument,
  readAccessor,
  readGlb,
  sha256File,
} from "./glb.mjs";

const SCRIPT_DIRECTORY = path.dirname(fileURLToPath(import.meta.url));
const AUDIT_ID = process.env.SYNMERE_SHELL_AUDIT_ID ?? "pass-g-g0";
const ACCEPT_CURRENT_REFERENCE =
  process.env.SYNMERE_SHELL_AUDIT_ACCEPT_CURRENT === "1";
const CONFIG_PATH =
  process.env.SYNMERE_SHELL_AUDIT_CONFIG ??
  path.join(SCRIPT_DIRECTORY, "pass-g-g0.config.json");
const OUTPUT_DIRECTORY = path.join(
  SCRIPT_DIRECTORY,
  `../../../reports/history/audit/${AUDIT_ID}`,
);
const REPORT_PATH = path.join(OUTPUT_DIRECTORY, "geometry-report.json");
const EDIT_REGION_PATH = path.join(
  OUTPUT_DIRECTORY,
  "approved-edit-region.json",
);
const REFERENCE_PATH = path.join(
  OUTPUT_DIRECTORY,
  AUDIT_ID === "pass-g-g0"
    ? "a-e-deformation-reference.json"
    : `${AUDIT_ID}-deformation-reference.json`,
);
const ATLAS_PATH = path.join(OUTPUT_DIRECTORY, "defect-atlas.html");
const RENDER_SCRIPT_PATH = path.join(SCRIPT_DIRECTORY, "render-pass-g-g0.py");
const RENDER_DIRECTORY = path.join(OUTPUT_DIRECTORY, "renders");
const RENDER_MANIFEST_PATH = path.join(
  RENDER_DIRECTORY,
  "render-manifest.json",
);
const VISIBILITY_REPORT_PATH = path.join(
  RENDER_DIRECTORY,
  "visibility-report.json",
);

const add = (left, right) => {
  return left.map((value, axis) => value + right[axis]);
};

const subtract = (left, right) => {
  return left.map((value, axis) => value - right[axis]);
};

const scale = (vector, factor) => {
  return vector.map((value) => value * factor);
};

const dot = (left, right) => {
  return left.reduce((total, value, axis) => {
    return total + value * right[axis];
  }, 0);
};

const cross = (left, right) => {
  return [
    left[1] * right[2] - left[2] * right[1],
    left[2] * right[0] - left[0] * right[2],
    left[0] * right[1] - left[1] * right[0],
  ];
};

const magnitude = (vector) => {
  return Math.hypot(...vector);
};

const normalize = (vector) => {
  const length = magnitude(vector);
  if (length === 0) {
    return [0, 0, 1];
  }
  return scale(vector, 1 / length);
};

const distance = (left, right) => {
  return magnitude(subtract(left, right));
};

const getTriangleNormalAndArea = (positions, triangle) => {
  const left = subtract(positions[triangle[1]], positions[triangle[0]]);
  const right = subtract(positions[triangle[2]], positions[triangle[0]]);
  const normal = cross(left, right);
  const doubledArea = magnitude(normal);
  return {
    normal: doubledArea === 0 ? [0, 0, 0] : scale(normal, 1 / doubledArea),
    area: doubledArea / 2,
  };
};

const getTriangles = (indices) => {
  const triangles = [];
  for (let offset = 0; offset < indices.length; offset += 3) {
    triangles.push([indices[offset], indices[offset + 1], indices[offset + 2]]);
  }
  return triangles;
};

const getEdges = (triangles) => {
  const edges = new Map();
  triangles.forEach((triangle, faceIndex) => {
    for (let index = 0; index < 3; index += 1) {
      const first = triangle[index];
      const second = triangle[(index + 1) % 3];
      const start = Math.min(first, second);
      const end = Math.max(first, second);
      const id = `${start}:${end}`;
      const edge = edges.get(id) ?? { start, end, faces: [] };
      edge.faces.push(faceIndex);
      edges.set(id, edge);
    }
  });
  return [...edges.values()];
};

const getTriangleAspectRatio = (positions, triangle, area) => {
  if (area <= Number.EPSILON) {
    return Number.POSITIVE_INFINITY;
  }
  const edgeLengths = [
    distance(positions[triangle[0]], positions[triangle[1]]),
    distance(positions[triangle[1]], positions[triangle[2]]),
    distance(positions[triangle[2]], positions[triangle[0]]),
  ];
  const longestEdge = Math.max(...edgeLengths);
  const shortestAltitude = (2 * area) / longestEdge;
  return longestEdge / shortestAltitude;
};

const getPercentile = (values, percentile) => {
  if (values.length === 0) {
    return 0;
  }
  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.min(
    sorted.length - 1,
    Math.floor((sorted.length - 1) * percentile),
  );
  return sorted[index];
};

const getMaximumEditScope = (positions, config) => {
  const scope = config.maximumEditScope;
  const selected = new Set();
  positions.forEach((position, index) => {
    const absoluteX = Math.abs(position[0]);
    const isVisible = index < scope.visibleSurfaceVertexCount;
    const isProtectedCentralFeature =
      isVisible &&
      absoluteX < scope.centralFeatureProtection.maximumAbsoluteX &&
      position[1] > scope.centralFeatureProtection.minimumY;
    if (isProtectedCentralFeature) {
      return;
    }
    const isLateralCheek =
      isVisible &&
      absoluteX >= scope.lateralCheek.minimumAbsoluteX &&
      absoluteX <= scope.lateralCheek.maximumAbsoluteX &&
      position[1] >= scope.lateralCheek.minimumY &&
      position[1] <= scope.lateralCheek.maximumY;
    const isJawOrChin =
      isVisible &&
      absoluteX <= scope.jawAndChin.maximumAbsoluteX &&
      position[1] <= scope.jawAndChin.maximumY;
    const isLowerBack =
      !isVisible && position[1] <= scope.lowerBackPerimeter.maximumY;
    const isSideBack =
      !isVisible &&
      absoluteX >= scope.sideBackPerimeter.minimumAbsoluteX &&
      position[1] <= scope.sideBackPerimeter.maximumY;

    if (isLateralCheek || isJawOrChin || isLowerBack || isSideBack) {
      selected.add(index);
    }
  });
  return selected;
};

const expandVertexSet = (selected, edges, rings) => {
  const expanded = new Set(selected);
  for (let ring = 0; ring < rings; ring += 1) {
    const previous = new Set(expanded);
    edges.forEach(({ start, end }) => {
      if (previous.has(start) || previous.has(end)) {
        expanded.add(start);
        expanded.add(end);
      }
    });
  }
  return expanded;
};

const getStateDefinitions = (config) => {
  const states = [
    { id: "raw-neutral", weights: {} },
    {
      id: "product-baseline",
      weights: { ...config.productBaselineWeights },
    },
  ];
  config.affectedMorphTargets.forEach((target) => {
    config.morphSamples.forEach((sample) => {
      const weights = { ...config.productBaselineWeights };
      const opposite = config.morphPairs[target];
      if (opposite) {
        weights[opposite] = 0;
      }
      weights[target] = sample;
      states.push({
        id: `${target}__${sample.toFixed(2)}`,
        target,
        sample,
        weights,
      });
    });
  });
  config.combinedStates.forEach((state) => {
    states.push({
      id: state.id,
      weights: {
        ...config.productBaselineWeights,
        ...state.weights,
      },
    });
  });
  return states;
};

const evaluatePositions = (basis, morphDeltas, weights) => {
  return basis.map((position, vertexIndex) => {
    return Object.entries(weights).reduce((evaluated, [name, weight]) => {
      const deltas = morphDeltas.get(name);
      if (!deltas || weight === 0) {
        return evaluated;
      }
      return add(evaluated, scale(deltas[vertexIndex], weight));
    }, position);
  });
};

const getFaceMetrics = (positions, triangles) => {
  return triangles.map((triangle) => {
    const { normal, area } = getTriangleNormalAndArea(positions, triangle);
    return {
      normal,
      area,
      aspectRatio: getTriangleAspectRatio(positions, triangle, area),
    };
  });
};

const getComputedVertexNormals = (positions, triangles, orientation) => {
  const normals = positions.map(() => [0, 0, 0]);
  triangles.forEach((triangle) => {
    const left = subtract(positions[triangle[1]], positions[triangle[0]]);
    const right = subtract(positions[triangle[2]], positions[triangle[0]]);
    const faceNormal = cross(left, right);
    triangle.forEach((vertexIndex) => {
      normals[vertexIndex] = add(normals[vertexIndex], faceNormal);
    });
  });
  return normals.map((normal) => {
    return scale(normalize(normal), orientation);
  });
};

const getEvaluatedStoredNormals = (
  basisNormals,
  morphNormalDeltas,
  weights,
) => {
  return basisNormals.map((normal, vertexIndex) => {
    const evaluated = Object.entries(weights).reduce(
      (current, [name, weight]) => {
        const deltas = morphNormalDeltas.get(name);
        if (!deltas || weight === 0) {
          return current;
        }
        return add(current, scale(deltas[vertexIndex], weight));
      },
      normal,
    );
    return normalize(evaluated);
  });
};

const getEdgeNormalAngles = (edges, faceMetrics) => {
  return edges
    .filter((edge) => edge.faces.length === 2)
    .map((edge) => {
      const first = faceMetrics[edge.faces[0]].normal;
      const second = faceMetrics[edge.faces[1]].normal;
      const cosine = Math.max(-1, Math.min(1, dot(first, second)));
      return {
        ...edge,
        angleDegrees: (Math.acos(cosine) * 180) / Math.PI,
      };
    });
};

const getEdgeId = (edge) => {
  return `${edge.start}:${edge.end}`;
};

const getStateMetrics = ({
  state,
  positions,
  storedNormals,
  basisNormalErrorDegrees,
  basisFaceMetrics,
  triangles,
  edges,
  basisEdgeAngles,
  maximumEditScope,
  visibleSurfaceVertexCount,
  thresholds,
}) => {
  const faceMetrics = getFaceMetrics(positions, triangles);
  const edgeAngles = getEdgeNormalAngles(edges, faceMetrics);
  const invertedFaces = [];
  const compressedFaces = [];
  const expandedFaces = [];
  const highAspectFaces = [];
  const suspectNormalEdges = [];
  const shadingNormalErrors = [];

  faceMetrics.forEach((metric, faceIndex) => {
    const basisMetric = basisFaceMetrics[faceIndex];
    const areaRatio =
      basisMetric.area <= Number.EPSILON ? 1 : metric.area / basisMetric.area;
    if (dot(metric.normal, basisMetric.normal) <= 0) {
      invertedFaces.push(faceIndex);
    }
    if (areaRatio < thresholds.minimumTriangleAreaRatio) {
      compressedFaces.push({ faceIndex, areaRatio });
    }
    if (areaRatio > thresholds.maximumTriangleAreaRatio) {
      expandedFaces.push({ faceIndex, areaRatio });
    }
    const isInMaximumScope = triangles[faceIndex].some((vertexIndex) => {
      return maximumEditScope.has(vertexIndex);
    });
    if (
      isInMaximumScope &&
      metric.aspectRatio > thresholds.maximumTriangleAspectRatio
    ) {
      highAspectFaces.push({
        faceIndex,
        aspectRatio: metric.aspectRatio,
      });
    }
  });

  edgeAngles.forEach((edge) => {
    const basisAngle = basisEdgeAngles.get(getEdgeId(edge)) ?? 0;
    const inMaximumScope =
      maximumEditScope.has(edge.start) || maximumEditScope.has(edge.end);
    const isFrontSurface =
      edge.start < visibleSurfaceVertexCount &&
      edge.end < visibleSurfaceVertexCount;
    if (
      inMaximumScope &&
      isFrontSurface &&
      edge.angleDegrees > thresholds.maximumSmoothRegionNormalAngleDegrees &&
      edge.angleDegrees - basisAngle >
        thresholds.minimumNormalAngleIncreaseDegrees
    ) {
      suspectNormalEdges.push({
        ...edge,
        basisAngleDegrees: basisAngle,
        increaseDegrees: edge.angleDegrees - basisAngle,
      });
    }
  });

  const geometricNormals = getComputedVertexNormals(
    positions,
    triangles,
    state.normalOrientation,
  );
  storedNormals.forEach((storedNormal, vertexIndex) => {
    if (
      !maximumEditScope.has(vertexIndex) ||
      vertexIndex >= visibleSurfaceVertexCount
    ) {
      return;
    }
    const cosine = Math.max(
      -1,
      Math.min(1, dot(storedNormal, geometricNormals[vertexIndex])),
    );
    const angleDegrees = (Math.acos(cosine) * 180) / Math.PI;
    const baselineAngleDegrees = basisNormalErrorDegrees[vertexIndex];
    const increaseDegrees = angleDegrees - baselineAngleDegrees;
    if (
      angleDegrees > thresholds.maximumEvaluatedNormalErrorDegrees &&
      increaseDegrees > thresholds.minimumEvaluatedNormalErrorIncreaseDegrees
    ) {
      shadingNormalErrors.push({
        vertexIndex,
        angleDegrees,
        baselineAngleDegrees,
        increaseDegrees,
      });
    }
  });

  const normalAngles = edgeAngles.map((edge) => edge.angleDegrees);
  const shadingErrorAngles = shadingNormalErrors.map(
    ({ angleDegrees }) => angleDegrees,
  );
  return {
    id: state.id,
    target: state.target,
    sample: state.sample,
    weights: state.weights,
    invertedTriangleCount: invertedFaces.length,
    invertedFaces,
    compressedTriangleCount: compressedFaces.length,
    compressedFaces: compressedFaces.slice(0, 100),
    expandedTriangleCount: expandedFaces.length,
    expandedFaces: expandedFaces.slice(0, 100),
    highAspectTriangleCount: highAspectFaces.length,
    highAspectFaces: highAspectFaces.slice(0, 100),
    normalAngleDegrees: {
      p95: getPercentile(normalAngles, 0.95),
      p99: getPercentile(normalAngles, 0.99),
      maximum: Math.max(...normalAngles),
    },
    suspectNormalEdgeCount: suspectNormalEdges.length,
    suspectNormalEdges: suspectNormalEdges
      .sort((left, right) => right.angleDegrees - left.angleDegrees)
      .slice(0, 150),
    shadingNormalError: {
      vertexCount: shadingNormalErrors.length,
      p95: getPercentile(shadingErrorAngles, 0.95),
      p99: getPercentile(shadingErrorAngles, 0.99),
      maximum:
        shadingErrorAngles.length === 0 ? 0 : Math.max(...shadingErrorAngles),
      vertices: shadingNormalErrors
        .sort((left, right) => right.angleDegrees - left.angleDegrees)
        .map((entry) => entry),
    },
  };
};

const getFirstFailingSamples = (stateMetrics, thresholds) => {
  const failures = {};
  const targets = new Set(
    stateMetrics.map((state) => state.target).filter(Boolean),
  );
  targets.forEach((target) => {
    const samples = stateMetrics
      .filter((state) => state.target === target)
      .sort((left, right) => left.sample - right.sample);
    const baseline = samples[0];
    const firstGeometryFailure = samples.slice(1).find((state) => {
      return (
        state.invertedTriangleCount >
          Math.max(
            thresholds.maximumInvertedTriangleCount,
            baseline.invertedTriangleCount,
          ) ||
        state.compressedTriangleCount > baseline.compressedTriangleCount ||
        state.expandedTriangleCount > baseline.expandedTriangleCount ||
        state.highAspectTriangleCount > baseline.highAspectTriangleCount ||
        state.suspectNormalEdgeCount > baseline.suspectNormalEdgeCount
      );
    });
    const firstShadingFailure = samples.slice(1).find((state) => {
      return (
        state.shadingNormalError.vertexCount >
        baseline.shadingNormalError.vertexCount
      );
    });
    const firstSamples = [
      firstGeometryFailure?.sample,
      firstShadingFailure?.sample,
    ].filter((sample) => sample !== undefined);
    failures[target] = {
      geometry: firstGeometryFailure?.sample ?? null,
      shading: firstShadingFailure?.sample ?? null,
      any: firstSamples.length === 0 ? null : Math.min(...firstSamples),
    };
  });
  return failures;
};

const getSuspectTopology = ({
  stateMetrics,
  triangles,
  maximumEditScope,
  edges,
  config,
}) => {
  const faces = new Set();
  const vertices = new Set();
  const shadingVertices = new Set();
  const categories = {
    invertedFaces: new Set(),
    areaStrainFaces: new Set(),
    highAspectFaces: new Set(),
    normalDiscontinuityFaces: new Set(),
    perimeterSliverFaces: new Set(),
  };
  const addFaceInScope = (faceIndex, category) => {
    if (
      triangles[faceIndex].some((vertexIndex) => {
        return maximumEditScope.has(vertexIndex);
      })
    ) {
      faces.add(faceIndex);
      categories[category].add(faceIndex);
    }
  };
  stateMetrics.forEach((state) => {
    state.invertedFaces.forEach((faceIndex) => {
      addFaceInScope(faceIndex, "invertedFaces");
    });
    state.compressedFaces.forEach(({ faceIndex }) => {
      addFaceInScope(faceIndex, "areaStrainFaces");
    });
    state.expandedFaces.forEach(({ faceIndex }) => {
      addFaceInScope(faceIndex, "areaStrainFaces");
    });
    state.highAspectFaces.forEach(({ faceIndex }) => {
      addFaceInScope(faceIndex, "highAspectFaces");
      if (
        triangles[faceIndex].some((vertexIndex) => {
          return (
            vertexIndex >= config.maximumEditScope.visibleSurfaceVertexCount &&
            maximumEditScope.has(vertexIndex)
          );
        })
      ) {
        categories.perimeterSliverFaces.add(faceIndex);
      }
    });
    state.suspectNormalEdges.forEach((edge) => {
      edge.faces.forEach((faceIndex) => {
        addFaceInScope(faceIndex, "normalDiscontinuityFaces");
      });
    });
    state.shadingNormalError.vertices.forEach(({ vertexIndex }) => {
      shadingVertices.add(vertexIndex);
    });
  });
  faces.forEach((faceIndex) => {
    triangles[faceIndex].forEach((vertexIndex) => {
      if (maximumEditScope.has(vertexIndex)) {
        vertices.add(vertexIndex);
      }
    });
  });

  const minimumG1RepairFaces = new Set([
    ...categories.invertedFaces,
    ...categories.areaStrainFaces,
    ...categories.perimeterSliverFaces,
  ]);
  const minimumG1RepairVertices = new Set();
  minimumG1RepairFaces.forEach((faceIndex) => {
    triangles[faceIndex].forEach((vertexIndex) => {
      if (maximumEditScope.has(vertexIndex)) {
        minimumG1RepairVertices.add(vertexIndex);
      }
    });
  });

  // Only the evidenced geometry defects and one support ring may move in G1.
  const expanded = expandVertexSet(
    minimumG1RepairVertices,
    edges,
    config.maximumEditScope.oneRingExpansion,
  );
  const approved = [...expanded].filter((index) => {
    return maximumEditScope.has(index);
  });
  return {
    suspectFaces: [...faces].sort((left, right) => left - right),
    suspectVertices: [...vertices].sort((left, right) => left - right),
    shadingErrorVertices: [...shadingVertices].sort(
      (left, right) => left - right,
    ),
    minimumG1RepairFaces: [...minimumG1RepairFaces].sort(
      (left, right) => left - right,
    ),
    minimumG1RepairVertices: [...minimumG1RepairVertices].sort(
      (left, right) => left - right,
    ),
    approvedEditVertices: approved.sort((left, right) => left - right),
    categories: Object.fromEntries(
      Object.entries(categories).map(([name, faceIndices]) => {
        return [name, [...faceIndices].sort((left, right) => left - right)];
      }),
    ),
  };
};

const main = async () => {
  const [
    config,
    manifest,
    glb,
    candidateSha256,
    sourceBlendSha256,
    productionSha256,
  ] = await Promise.all([
    readFile(CONFIG_PATH, "utf8").then((source) => {
      return { ...JSON.parse(source), auditId: AUDIT_ID };
    }),
    readFile(CANDIDATE_MANIFEST_PATH, "utf8").then(JSON.parse),
    readGlb(CANDIDATE_GLB_PATH),
    sha256File(CANDIDATE_GLB_PATH),
    sha256File(SOURCE_BLEND_PATH),
    sha256File(PRODUCTION_GLB_PATH),
  ]);

  const actualReference = {
    candidateSha256,
    sourceBlendSha256,
    productionSha256,
  };
  if (
    !ACCEPT_CURRENT_REFERENCE &&
    JSON.stringify(actualReference) !== JSON.stringify(config.reference)
  ) {
    throw new Error(
      `${AUDIT_ID} reference changed.\nExpected ${JSON.stringify(config.reference)}\nActual ${JSON.stringify(actualReference)}`,
    );
  }
  if (manifest.sourceBlendSha256 !== sourceBlendSha256) {
    throw new Error(
      "The candidate no longer matches the canonical A-E source.",
    );
  }

  const { mesh, primitive } = getIdentityShellDocument(glb, EXPECTED_MESH_NAME);
  const basis = readAccessor(glb, primitive.attributes.POSITION);
  const basisNormals = readAccessor(glb, primitive.attributes.NORMAL);
  const indices = readAccessor(glb, primitive.indices);
  const triangles = getTriangles(indices);
  const edges = getEdges(triangles);
  const targetNames = mesh.extras?.targetNames ?? [];
  const morphDeltas = new Map(
    (primitive.targets ?? []).map((target, targetIndex) => {
      return [targetNames[targetIndex], readAccessor(glb, target.POSITION)];
    }),
  );
  const morphNormalDeltas = new Map(
    (primitive.targets ?? []).map((target, targetIndex) => {
      return [targetNames[targetIndex], readAccessor(glb, target.NORMAL)];
    }),
  );
  const missingTargets = config.affectedMorphTargets.filter((target) => {
    return !morphDeltas.has(target);
  });
  if (missingTargets.length > 0) {
    throw new Error(`Missing G0 morph targets: ${missingTargets.join(", ")}`);
  }

  const maximumEditScope = getMaximumEditScope(basis, config);
  const basisFaceMetrics = getFaceMetrics(basis, triangles);
  const computedBasisNormals = getComputedVertexNormals(basis, triangles, 1);
  const averageNormalOrientation = computedBasisNormals.reduce(
    (total, normal, index) => {
      return total + dot(normal, basisNormals[index]);
    },
    0,
  );
  const normalOrientation = averageNormalOrientation >= 0 ? 1 : -1;
  const orientedComputedBasisNormals = computedBasisNormals.map((normal) => {
    return scale(normal, normalOrientation);
  });
  const basisNormalErrorDegrees = basisNormals.map((normal, vertexIndex) => {
    const cosine = Math.max(
      -1,
      Math.min(1, dot(normal, orientedComputedBasisNormals[vertexIndex])),
    );
    return (Math.acos(cosine) * 180) / Math.PI;
  });
  const basisEdgeAngles = new Map(
    getEdgeNormalAngles(edges, basisFaceMetrics).map((edge) => {
      return [getEdgeId(edge), edge.angleDegrees];
    }),
  );
  const states = getStateDefinitions(config);
  const stateMetrics = states.map((state) => {
    const stateWithNormalOrientation = {
      ...state,
      normalOrientation,
    };
    return getStateMetrics({
      state: stateWithNormalOrientation,
      positions: evaluatePositions(basis, morphDeltas, state.weights),
      storedNormals: getEvaluatedStoredNormals(
        basisNormals,
        morphNormalDeltas,
        state.weights,
      ),
      basisNormalErrorDegrees,
      basisFaceMetrics,
      triangles,
      edges,
      basisEdgeAngles,
      maximumEditScope,
      visibleSurfaceVertexCount:
        config.maximumEditScope.visibleSurfaceVertexCount,
      thresholds: config.thresholds,
    });
  });
  const suspectTopology = getSuspectTopology({
    stateMetrics,
    triangles,
    maximumEditScope,
    edges,
    config,
  });

  await mkdir(OUTPUT_DIRECTORY, { recursive: true });
  await writeFile(
    REPORT_PATH,
    `${JSON.stringify(
      {
        schemaVersion: config.schemaVersion,
        auditId: config.auditId,
        generatedAt: new Date().toISOString(),
        reference: actualReference,
        thresholds: config.thresholds,
        review: config.review,
        counts: {
          vertices: basis.length,
          triangles: triangles.length,
          edges: edges.length,
          maximumEditScopeVertices: maximumEditScope.size,
          approvedEditVertices: suspectTopology.approvedEditVertices.length,
        },
        firstMachineFailureByClass: getFirstFailingSamples(
          stateMetrics,
          config.thresholds,
        ),
        suspectTopology,
        states: stateMetrics,
      },
      null,
      2,
    )}\n`,
  );
  await writeFile(
    EDIT_REGION_PATH,
    `${JSON.stringify(
      {
        schemaVersion: config.schemaVersion,
        auditId: config.auditId,
        sourceBlendSha256,
        comparisonEpsilon: config.thresholds.outsideEditRegionPositionEpsilon,
        invariant:
          "Every Basis and shape-key vertex outside approvedEditVertices must remain exactly unchanged; comparisonEpsilon only absorbs serialization noise.",
        maximumEditScopeVertices: [...maximumEditScope].sort(
          (left, right) => left - right,
        ),
        ...suspectTopology,
      },
      null,
      2,
    )}\n`,
  );
  await writeFile(
    REFERENCE_PATH,
    `${JSON.stringify(
      {
        schemaVersion: config.schemaVersion,
        sourceBlendSha256,
        candidateSha256,
        targetNames,
        basis,
        morphDeltas: Object.fromEntries(morphDeltas),
      },
      null,
      0,
    )}\n`,
  );

  console.log(
    JSON.stringify(
      {
        report: path.relative(process.cwd(), REPORT_PATH),
        editRegion: path.relative(process.cwd(), EDIT_REGION_PATH),
        reference: path.relative(process.cwd(), REFERENCE_PATH),
        states: stateMetrics.length,
        maximumEditScopeVertices: maximumEditScope.size,
        approvedEditVertices: suspectTopology.approvedEditVertices.length,
        firstMachineFailureByClass: getFirstFailingSamples(
          stateMetrics,
          config.thresholds,
        ),
      },
      null,
      2,
    ),
  );
};

const escapeHtml = (value) => {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
};

const writeDefectAtlas = async () => {
  let manifest;
  try {
    manifest = JSON.parse(await readFile(RENDER_MANIFEST_PATH, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") {
      return;
    }
    throw error;
  }
  const optionalProductRenders = [
    "product-web__neutral__front.png",
    "product-web__wide__front.png",
  ];
  const availableProductRenders = await Promise.all(
    optionalProductRenders.map(async (filename) => {
      try {
        await readFile(path.join(RENDER_DIRECTORY, filename));
        return filename;
      } catch (error) {
        if (error.code === "ENOENT") {
          return null;
        }
        throw error;
      }
    }),
  );
  availableProductRenders.filter(Boolean).forEach((filename) => {
    if (!manifest.renders.includes(filename)) {
      manifest.renders.push(filename);
    }
  });
  const groups = new Map();
  manifest.renders.forEach((filename) => {
    const state = filename.split("__")[0];
    const group = groups.get(state) ?? [];
    group.push(filename);
    groups.set(state, group);
  });
  const sections = [...groups.entries()]
    .map(([state, filenames]) => {
      const images = filenames
        .map((filename) => {
          const label = filename
            .replace(".png", "")
            .split("__")
            .slice(1)
            .join(" · ");
          return `<figure><img loading="lazy" src="renders/${escapeHtml(filename)}" alt="${escapeHtml(filename)}"><figcaption>${escapeHtml(label)}</figcaption></figure>`;
        })
        .join("");
      return `<section><h2>${escapeHtml(state)}</h2><div class="grid">${images}</div></section>`;
    })
    .join("");
  const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Synmere Pass G0 defect atlas</title>
  <style>
    :root { color-scheme: dark; font-family: Inter, ui-sans-serif, system-ui, sans-serif; background: #07090d; color: #f3f5f7; }
    body { margin: 0; padding: 28px; }
    header { position: sticky; top: 0; z-index: 2; padding: 18px 0; background: color-mix(in srgb, #07090d 92%, transparent); backdrop-filter: blur(18px); }
    h1, h2, p { margin: 0; }
    h1 { font-size: 24px; }
    h2 { margin: 32px 0 12px; font-size: 15px; letter-spacing: .02em; }
    p { margin-top: 8px; color: #aeb6c2; font-size: 13px; }
    .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 12px; }
    figure { margin: 0; overflow: hidden; border: 1px solid #232936; border-radius: 16px; background: #0d1118; }
    img { display: block; width: 100%; aspect-ratio: 1; object-fit: cover; background: #000; }
    figcaption { padding: 9px 11px; color: #aeb6c2; font-size: 11px; }
  </style>
</head>
<body>
  <header>
    <h1>Pass G0 · retained A–E defect atlas</h1>
    <p>${manifest.stateCount} deformation states · ${manifest.cameraIds.length} locked cameras · ${manifest.resolution}px</p>
  </header>
  ${sections}
</body>
</html>
`;
  await writeFile(ATLAS_PATH, html);
};

const mergeVisibilityEvidence = async () => {
  let visibility;
  try {
    visibility = JSON.parse(await readFile(VISIBILITY_REPORT_PATH, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") {
      return null;
    }
    throw error;
  }
  const [report, editRegion, glb, config] = await Promise.all([
    readFile(REPORT_PATH, "utf8").then(JSON.parse),
    readFile(EDIT_REGION_PATH, "utf8").then(JSON.parse),
    readGlb(CANDIDATE_GLB_PATH),
    readFile(CONFIG_PATH, "utf8").then(JSON.parse),
  ]);
  const { primitive } = getIdentityShellDocument(glb, EXPECTED_MESH_NAME);
  const triangles = getTriangles(readAccessor(glb, primitive.indices));
  const edges = getEdges(triangles);
  const maximumEditScope = new Set(editRegion.maximumEditScopeVertices);
  const visiblePerimeterFaces =
    visibility.nonFrontVisibleBackOrPerimeterFaces.filter((faceIndex) => {
      return triangles[faceIndex].some((vertexIndex) => {
        return maximumEditScope.has(vertexIndex);
      });
    });
  const minimumFaces = new Set([
    ...report.suspectTopology.minimumG1RepairFaces,
    ...visiblePerimeterFaces,
  ]);
  const minimumVertices = new Set();
  minimumFaces.forEach((faceIndex) => {
    triangles[faceIndex].forEach((vertexIndex) => {
      if (maximumEditScope.has(vertexIndex)) {
        minimumVertices.add(vertexIndex);
      }
    });
  });
  const approvedVertices = [
    ...expandVertexSet(
      minimumVertices,
      edges,
      config.maximumEditScope.oneRingExpansion,
    ),
  ]
    .filter((vertexIndex) => maximumEditScope.has(vertexIndex))
    .sort((left, right) => left - right);

  report.suspectTopology.visibleBackOrPerimeterFaces = visiblePerimeterFaces;
  report.suspectTopology.minimumG1RepairFaces = [...minimumFaces].sort(
    (left, right) => left - right,
  );
  report.suspectTopology.minimumG1RepairVertices = [...minimumVertices].sort(
    (left, right) => left - right,
  );
  report.suspectTopology.approvedEditVertices = approvedVertices;
  report.counts.approvedEditVertices = approvedVertices.length;

  editRegion.visibleBackOrPerimeterFaces = visiblePerimeterFaces;
  editRegion.minimumG1RepairFaces = report.suspectTopology.minimumG1RepairFaces;
  editRegion.minimumG1RepairVertices =
    report.suspectTopology.minimumG1RepairVertices;
  editRegion.approvedEditVertices = approvedVertices;

  await Promise.all([
    writeFile(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`),
    writeFile(EDIT_REGION_PATH, `${JSON.stringify(editRegion, null, 2)}\n`),
  ]);
  return {
    visibleBackOrPerimeterFaces: visiblePerimeterFaces.length,
    minimumG1RepairFaces: minimumFaces.size,
    minimumG1RepairVertices: minimumVertices.size,
    approvedEditVertices: approvedVertices.length,
  };
};

await main();

if (!process.argv.includes("--geometry-only")) {
  const blenderArguments = [
    "--background",
    SOURCE_BLEND_PATH,
    "--python",
    RENDER_SCRIPT_PATH,
    "--",
    CONFIG_PATH,
    REPORT_PATH,
    RENDER_DIRECTORY,
  ];
  if (process.argv.includes("--overlay-only")) {
    blenderArguments.push("overlay-only");
  }
  const blenderResult = spawnSync(BLENDER_EXECUTABLE, blenderArguments, {
    encoding: "utf8",
    stdio: "inherit",
  });
  if (blenderResult.error) {
    throw blenderResult.error;
  }
  if (blenderResult.status !== 0) {
    throw new Error(
      `Pass G0 deterministic render failed with exit code ${blenderResult.status}.`,
    );
  }
}

const visibilitySummary = await mergeVisibilityEvidence();
if (visibilitySummary) {
  console.log(
    JSON.stringify(
      {
        finalizedG1Scope: visibilitySummary,
      },
      null,
      2,
    ),
  );
}
await writeDefectAtlas();

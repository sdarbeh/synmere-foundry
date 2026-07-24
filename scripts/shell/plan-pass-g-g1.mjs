import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import {
  getIdentityShellDocument,
  readAccessor,
  readGlb,
  sha256File,
} from "./glb.mjs";
import {
  CANDIDATE_GLB_PATH,
  EXPECTED_MESH_NAME,
  PROJECT_ROOT,
  SOURCE_BLEND_PATH,
} from "./asset-paths.mjs";

const AUDIT_DIRECTORY = path.join(
  PROJECT_ROOT,
  "reports/history/audit/pass-g-g0",
);
const OUTPUT_DIRECTORY = path.join(
  PROJECT_ROOT,
  "assets/candidates/pass-g-g1",
);
const OUTPUT_PATH = path.join(OUTPUT_DIRECTORY, "morph-repair-plan.json");
const REGION_PATH = path.join(AUDIT_DIRECTORY, "approved-edit-region.json");
const REPORT_PATH = path.join(AUDIT_DIRECTORY, "geometry-report.json");
const CONFIG_PATH = path.join(
  PROJECT_ROOT,
  "scripts/shell/pass-g-g0.config.json",
);

const TARGETS = [
  {
    name: "identity_chin_short",
    axis: 1,
    maximumChangedVertices: 320,
  },
  {
    name: "identity_head_depth_high",
    axis: 2,
    maximumChangedVertices: 260,
  },
  {
    name: "identity_head_depth_low",
    axis: 2,
    maximumChangedVertices: 260,
  },
];
const SAMPLE_WEIGHTS = [0, 0.25, 0.5, 0.75, 1];
const SEARCH = {
  iterations: [1, 2, 4, 6, 8, 12, 16, 24],
  alphas: [0.12, 0.2, 0.3, 0.42, 0.56, 0.7],
  expansionRings: [1, 2, 3, 4],
  faceEqualizationIterations: [1, 2, 4, 8],
  faceEqualizationStrengths: [0.25, 0.5, 0.75, 1],
};
const CHIN_SHORT_SEARCH = {
  upperY: [-0.94, -0.91, -0.88, -0.85],
  lowerY: [-1.2, -1.18, -1.16],
  amplitude: [0.1, 0.115, 0.13, 0.145, 0.15, 0.165],
  boundaryFadeRings: [2, 3, 4, 5, 6, 8],
  profileKinds: ["linear", "smoothstep"],
};
const MINIMUM_EFFECTIVE_EDGE_LENGTH = 0.012 / 0.72;
const PROJECTED_MAXIMUM_EDGE_STRAIN = 0.7195;

const getChinShortSearchConfigurations = () => {
  return CHIN_SHORT_SEARCH.upperY.flatMap((upperY) => {
    return CHIN_SHORT_SEARCH.lowerY.flatMap((lowerY) => {
      return CHIN_SHORT_SEARCH.amplitude.flatMap((amplitude) => {
        return CHIN_SHORT_SEARCH.boundaryFadeRings.flatMap(
          (boundaryFadeRings) => {
            return CHIN_SHORT_SEARCH.profileKinds.map((profileKind) => {
              return {
                upperY,
                lowerY,
                amplitude,
                boundaryFadeRings,
                profileKind,
              };
            });
          },
        );
      });
    });
  });
};

const add = (left, right) => {
  return left.map((value, axis) => value + right[axis]);
};

const subtract = (left, right) => {
  return left.map((value, axis) => value - right[axis]);
};

const scale = (vector, factor) => {
  return vector.map((value) => value * factor);
};

const clamp01 = (value) => {
  return Math.max(0, Math.min(1, value));
};

const smoothstep01 = (value) => {
  const normalized = clamp01(value);
  return normalized * normalized * (3 - 2 * normalized);
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

const getTriangles = (indices) => {
  const triangles = [];
  for (let offset = 0; offset < indices.length; offset += 3) {
    triangles.push([indices[offset], indices[offset + 1], indices[offset + 2]]);
  }
  return triangles;
};

const getEdges = (triangles, vertexCount) => {
  const edgeMap = new Map();
  const neighbors = Array.from({ length: vertexCount }, () => new Set());
  triangles.forEach((triangle) => {
    for (let edgeIndex = 0; edgeIndex < 3; edgeIndex += 1) {
      const start = triangle[edgeIndex];
      const end = triangle[(edgeIndex + 1) % 3];
      const minimum = Math.min(start, end);
      const maximum = Math.max(start, end);
      edgeMap.set(`${minimum}:${maximum}`, [minimum, maximum]);
      neighbors[start].add(end);
      neighbors[end].add(start);
    }
  });
  return { edges: [...edgeMap.values()], neighbors };
};

const expandVertices = (vertices, neighbors, allowed, rings) => {
  const expanded = new Set(
    [...vertices].filter((vertexIndex) => allowed.has(vertexIndex)),
  );
  for (let ring = 0; ring < rings; ring += 1) {
    const previous = [...expanded];
    previous.forEach((vertexIndex) => {
      neighbors[vertexIndex].forEach((neighborIndex) => {
        if (allowed.has(neighborIndex)) {
          expanded.add(neighborIndex);
        }
      });
    });
  }
  return expanded;
};

const getBoundaryDistances = (allowed, neighbors) => {
  const distances = new Map();
  const queue = [];
  allowed.forEach((vertexIndex) => {
    const touchesFrozenVertex = [...neighbors[vertexIndex]].some(
      (neighborIndex) => {
        return !allowed.has(neighborIndex);
      },
    );
    if (touchesFrozenVertex) {
      distances.set(vertexIndex, 0);
      queue.push(vertexIndex);
    }
  });
  for (let cursor = 0; cursor < queue.length; cursor += 1) {
    const vertexIndex = queue[cursor];
    const nextDistance = distances.get(vertexIndex) + 1;
    neighbors[vertexIndex].forEach((neighborIndex) => {
      if (allowed.has(neighborIndex) && !distances.has(neighborIndex)) {
        distances.set(neighborIndex, nextDistance);
        queue.push(neighborIndex);
      }
    });
  }
  return distances;
};

const getFaceNormalAndArea = (positions, triangle) => {
  const first = subtract(positions[triangle[1]], positions[triangle[0]]);
  const second = subtract(positions[triangle[2]], positions[triangle[0]]);
  const normal = cross(first, second);
  return { normal, area: magnitude(normal) * 0.5 };
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

const getGeometryMetrics = (positions, basisFaceMetrics, triangles) => {
  let invertedTriangleCount = 0;
  let compressedTriangleCount = 0;
  let expandedTriangleCount = 0;
  let minimumAreaRatio = Infinity;
  let maximumAreaRatio = 0;
  triangles.forEach((triangle, faceIndex) => {
    const metric = getFaceNormalAndArea(positions, triangle);
    const basisMetric = basisFaceMetrics[faceIndex];
    const areaRatio =
      basisMetric.area <= Number.EPSILON ? 1 : metric.area / basisMetric.area;
    minimumAreaRatio = Math.min(minimumAreaRatio, areaRatio);
    maximumAreaRatio = Math.max(maximumAreaRatio, areaRatio);
    if (dot(metric.normal, basisMetric.normal) <= 0) {
      invertedTriangleCount += 1;
    }
    if (areaRatio < 0.35) {
      compressedTriangleCount += 1;
    }
    if (areaRatio > 2.5) {
      expandedTriangleCount += 1;
    }
  });
  return {
    invertedTriangleCount,
    compressedTriangleCount,
    expandedTriangleCount,
    minimumAreaRatio,
    maximumAreaRatio,
  };
};

const getMaximumEdgeStrain = (basis, deltas, edges) => {
  return edges.reduce((maximum, [start, end]) => {
    const edgeLength = Math.max(
      magnitude(subtract(basis[end], basis[start])),
      MINIMUM_EFFECTIVE_EDGE_LENGTH,
    );
    const deltaDifference = magnitude(subtract(deltas[end], deltas[start]));
    return Math.max(maximum, deltaDifference / edgeLength);
  }, 0);
};

const projectTargetAxisToStrainEnvelope = ({
  basis,
  candidate,
  selected,
  axis,
  edges,
}) => {
  const projected = candidate.map((delta) => [...delta]);
  for (let iteration = 0; iteration < 80; iteration += 1) {
    let correctionCount = 0;
    edges.forEach(([start, end]) => {
      const startEditable = selected.has(start);
      const endEditable = selected.has(end);
      if (!startEditable && !endEditable) {
        return;
      }
      const edgeLength = Math.max(
        magnitude(subtract(basis[end], basis[start])),
        MINIMUM_EFFECTIVE_EDGE_LENGTH,
      );
      const maximumDeltaDifference = edgeLength * PROJECTED_MAXIMUM_EDGE_STRAIN;
      const fixedDifferenceSquared = projected[start].reduce(
        (total, value, currentAxis) => {
          if (currentAxis === axis) {
            return total;
          }
          const difference = projected[end][currentAxis] - value;
          return total + difference * difference;
        },
        0,
      );
      const maximumAxisDifference = Math.sqrt(
        Math.max(
          0,
          maximumDeltaDifference * maximumDeltaDifference -
            fixedDifferenceSquared,
        ),
      );
      const difference = projected[end][axis] - projected[start][axis];
      if (Math.abs(difference) <= maximumAxisDifference) {
        return;
      }
      correctionCount += 1;
      const sign = Math.sign(difference);
      const excess = Math.abs(difference) - maximumAxisDifference;
      if (startEditable && endEditable) {
        projected[start][axis] += (sign * excess) / 2;
        projected[end][axis] -= (sign * excess) / 2;
        return;
      }
      if (startEditable) {
        projected[start][axis] =
          projected[end][axis] - sign * maximumAxisDifference;
        return;
      }
      projected[end][axis] =
        projected[start][axis] + sign * maximumAxisDifference;
    });
    if (correctionCount === 0) {
      break;
    }
  }
  return projected;
};

const getSeedFaces = (report, targetName) => {
  const states = report.states.filter((state) => {
    return state.target === targetName && state.sample > 0;
  });
  const baseline = report.states.find((state) => {
    return state.target === targetName && state.sample === 0;
  });
  const baselineAreaFaces = new Set([
    ...(baseline?.compressedFaces ?? []).map(({ faceIndex }) => faceIndex),
    ...(baseline?.expandedFaces ?? []).map(({ faceIndex }) => faceIndex),
  ]);
  const faces = new Set();
  states.forEach((state) => {
    state.invertedFaces.forEach((faceIndex) => faces.add(faceIndex));
    [...state.compressedFaces, ...state.expandedFaces].forEach(
      ({ faceIndex }) => {
        if (!baselineAreaFaces.has(faceIndex)) {
          faces.add(faceIndex);
        }
      },
    );
  });
  return faces;
};

const smoothTargetAxis = ({
  original,
  axis,
  selected,
  core,
  neighbors,
  alpha,
  iterations,
}) => {
  let current = original.map((delta) => [...delta]);
  for (let iteration = 0; iteration < iterations; iteration += 1) {
    const next = current.map((delta) => [...delta]);
    selected.forEach((vertexIndex) => {
      const adjacent = [...neighbors[vertexIndex]];
      if (adjacent.length === 0) {
        return;
      }
      const average =
        adjacent.reduce((total, neighborIndex) => {
          return total + current[neighborIndex][axis];
        }, 0) / adjacent.length;
      const supportWeight = core.has(vertexIndex) ? 1 : 0.4;
      next[vertexIndex][axis] +=
        (average - current[vertexIndex][axis]) * alpha * supportWeight;
    });
    current = next;
  }
  return current;
};

const equalizeSeedFaceDeltas = ({
  original,
  axis,
  seedFaces,
  triangles,
  editable,
  strength,
  iterations,
}) => {
  let current = original.map((delta) => [...delta]);
  for (let iteration = 0; iteration < iterations; iteration += 1) {
    const totals = new Map();
    const counts = new Map();
    seedFaces.forEach((faceIndex) => {
      const triangle = triangles[faceIndex];
      const average =
        triangle.reduce((total, vertexIndex) => {
          return total + current[vertexIndex][axis];
        }, 0) / triangle.length;
      triangle.forEach((vertexIndex) => {
        if (!editable.has(vertexIndex)) {
          return;
        }
        totals.set(vertexIndex, (totals.get(vertexIndex) ?? 0) + average);
        counts.set(vertexIndex, (counts.get(vertexIndex) ?? 0) + 1);
      });
    });
    const next = current.map((delta) => [...delta]);
    totals.forEach((total, vertexIndex) => {
      const average = total / counts.get(vertexIndex);
      next[vertexIndex][axis] += (average - next[vertexIndex][axis]) * strength;
    });
    current = next;
  }
  return current;
};

const reauthorChinShort = ({
  basis,
  original,
  selected,
  boundaryDistances,
  boundaryFadeRings,
  upperY,
  lowerY,
  amplitude,
  profileKind,
}) => {
  const candidate = original.map((delta) => [...delta]);
  selected.forEach((vertexIndex) => {
    const progress = (upperY - basis[vertexIndex][1]) / (upperY - lowerY);
    const authoredValue =
      amplitude *
      (profileKind === "linear" ? clamp01(progress) : smoothstep01(progress));
    const boundaryWeight = smoothstep01(
      (boundaryDistances.get(vertexIndex) ?? 0) / boundaryFadeRings,
    );
    candidate[vertexIndex][1] +=
      (authoredValue - candidate[vertexIndex][1]) * boundaryWeight;
  });
  return candidate;
};

const getChangeMetrics = (original, candidate, selected) => {
  const changes = [...selected]
    .map((vertexIndex) => {
      return magnitude(subtract(candidate[vertexIndex], original[vertexIndex]));
    })
    .filter((change) => change > 1e-9);
  return {
    changedVertexCount: changes.length,
    rootMeanSquareChange:
      changes.length === 0
        ? 0
        : Math.sqrt(
            changes.reduce((total, change) => {
              return total + change * change;
            }, 0) / changes.length,
          ),
    maximumChange: changes.length === 0 ? 0 : Math.max(...changes),
  };
};

const scoreCandidate = ({ stateMetrics, maximumEdgeStrain, changeMetrics }) => {
  const worst = stateMetrics.reduce(
    (summary, state) => {
      return {
        inversions: Math.max(summary.inversions, state.invertedTriangleCount),
        compression: Math.max(
          summary.compression,
          state.compressedTriangleCount,
        ),
        expansion: Math.max(summary.expansion, state.expandedTriangleCount),
      };
    },
    { inversions: 0, compression: 0, expansion: 0 },
  );
  const hardFailure =
    worst.inversions * 1e9 +
    worst.compression * 1e7 +
    Math.max(0, worst.expansion - 4) * 1e7 +
    Math.max(0, maximumEdgeStrain - 0.72) * 1e8;
  return (
    hardFailure +
    changeMetrics.rootMeanSquareChange * 1e5 +
    changeMetrics.maximumChange * 1e4
  );
};

const region = JSON.parse(await readFile(REGION_PATH, "utf8"));
const report = JSON.parse(await readFile(REPORT_PATH, "utf8"));
const config = JSON.parse(await readFile(CONFIG_PATH, "utf8"));
const glb = await readGlb(CANDIDATE_GLB_PATH);
const { mesh, primitive } = getIdentityShellDocument(glb, EXPECTED_MESH_NAME);
const basis = readAccessor(glb, primitive.attributes.POSITION);
const indices = readAccessor(glb, primitive.indices);
const triangles = getTriangles(indices);
const { edges, neighbors } = getEdges(triangles, basis.length);
const targetNames = mesh.extras?.targetNames ?? [];
const morphDeltas = new Map(
  targetNames.map((name, targetIndex) => {
    return [name, readAccessor(glb, primitive.targets[targetIndex].POSITION)];
  }),
);
const basisFaceMetrics = triangles.map((triangle) => {
  return getFaceNormalAndArea(basis, triangle);
});
const approvedVertices = new Set(region.approvedEditVertices);
const coreVertices = new Set(region.minimumG1RepairVertices);
const approvedBoundaryDistances = getBoundaryDistances(
  approvedVertices,
  neighbors,
);
const repairs = [];

for (const target of TARGETS) {
  const original = morphDeltas.get(target.name);
  if (!original) {
    throw new Error(`Candidate does not contain ${target.name}.`);
  }
  const seedFaces = getSeedFaces(report, target.name);
  const seedVertices = new Set(
    [...seedFaces].flatMap((faceIndex) => triangles[faceIndex]),
  );
  const candidates = [];

  for (const expansionRings of SEARCH.expansionRings) {
    const selected = expandVertices(
      seedVertices,
      neighbors,
      approvedVertices,
      expansionRings,
    );
    for (const alpha of SEARCH.alphas) {
      for (const iterations of SEARCH.iterations) {
        const smoothedCandidate = smoothTargetAxis({
          original,
          axis: target.axis,
          selected,
          core: coreVertices,
          neighbors,
          alpha,
          iterations,
        });
        const candidate = projectTargetAxisToStrainEnvelope({
          basis,
          candidate: smoothedCandidate,
          selected,
          axis: target.axis,
          edges,
        });
        const candidateMorphs = new Map(morphDeltas);
        candidateMorphs.set(target.name, candidate);
        const stateMetrics = SAMPLE_WEIGHTS.map((sample) => {
          const weights = { ...config.productBaselineWeights };
          const opposite = config.morphPairs[target.name];
          if (opposite) {
            weights[opposite] = 0;
          }
          weights[target.name] = sample;
          return {
            sample,
            ...getGeometryMetrics(
              evaluatePositions(basis, candidateMorphs, weights),
              basisFaceMetrics,
              triangles,
            ),
          };
        });
        const maximumEdgeStrain = getMaximumEdgeStrain(basis, candidate, edges);
        const changeMetrics = getChangeMetrics(original, candidate, selected);
        candidates.push({
          method: "laplacian-axis",
          expansionRings,
          alpha,
          iterations,
          selected,
          candidate,
          stateMetrics,
          maximumEdgeStrain,
          changeMetrics,
          score: scoreCandidate({
            stateMetrics,
            maximumEdgeStrain,
            changeMetrics,
          }),
        });
      }
    }

    for (const strength of SEARCH.faceEqualizationStrengths) {
      for (const iterations of SEARCH.faceEqualizationIterations) {
        const equalizedCandidate = equalizeSeedFaceDeltas({
          original,
          axis: target.axis,
          seedFaces,
          triangles,
          editable: selected,
          strength,
          iterations,
        });
        const candidate = projectTargetAxisToStrainEnvelope({
          basis,
          candidate: equalizedCandidate,
          selected,
          axis: target.axis,
          edges,
        });
        const candidateMorphs = new Map(morphDeltas);
        candidateMorphs.set(target.name, candidate);
        const stateMetrics = SAMPLE_WEIGHTS.map((sample) => {
          const weights = { ...config.productBaselineWeights };
          const opposite = config.morphPairs[target.name];
          if (opposite) {
            weights[opposite] = 0;
          }
          weights[target.name] = sample;
          return {
            sample,
            ...getGeometryMetrics(
              evaluatePositions(basis, candidateMorphs, weights),
              basisFaceMetrics,
              triangles,
            ),
          };
        });
        const maximumEdgeStrain = getMaximumEdgeStrain(basis, candidate, edges);
        const changeMetrics = getChangeMetrics(original, candidate, selected);
        candidates.push({
          method: "seed-face-equalization",
          expansionRings,
          strength,
          iterations,
          selected,
          candidate,
          stateMetrics,
          maximumEdgeStrain,
          changeMetrics,
          score: scoreCandidate({
            stateMetrics,
            maximumEdgeStrain,
            changeMetrics,
          }),
        });
      }
    }

    if (
      target.name === "identity_chin_short" &&
      expansionRings === SEARCH.expansionRings[0]
    ) {
      const selectedChinVertices = new Set(
        [...approvedVertices].filter((vertexIndex) => {
          return Math.abs(original[vertexIndex][1]) > 1e-6;
        }),
      );
      for (const search of getChinShortSearchConfigurations()) {
        const authoredCandidate = reauthorChinShort({
          basis,
          original,
          selected: selectedChinVertices,
          boundaryDistances: approvedBoundaryDistances,
          ...search,
        });
        const candidate = projectTargetAxisToStrainEnvelope({
          basis,
          candidate: authoredCandidate,
          selected: selectedChinVertices,
          axis: target.axis,
          edges,
        });
        const candidateMorphs = new Map(morphDeltas);
        candidateMorphs.set(target.name, candidate);
        const stateMetrics = SAMPLE_WEIGHTS.map((sample) => {
          const weights = { ...config.productBaselineWeights };
          weights[config.morphPairs[target.name]] = 0;
          weights[target.name] = sample;
          return {
            sample,
            ...getGeometryMetrics(
              evaluatePositions(basis, candidateMorphs, weights),
              basisFaceMetrics,
              triangles,
            ),
          };
        });
        const maximumEdgeStrain = getMaximumEdgeStrain(basis, candidate, edges);
        const changeMetrics = getChangeMetrics(
          original,
          candidate,
          selectedChinVertices,
        );
        candidates.push({
          method: "authored-chin-profile",
          expansionRings,
          ...search,
          selected: selectedChinVertices,
          candidate,
          stateMetrics,
          maximumEdgeStrain,
          changeMetrics,
          score: scoreCandidate({
            stateMetrics,
            maximumEdgeStrain,
            changeMetrics,
          }),
        });
      }
    }
  }

  candidates.sort((left, right) => left.score - right.score);
  const best = candidates[0];
  if (!best) {
    throw new Error(`No repair candidates were generated for ${target.name}.`);
  }
  if (best.changeMetrics.changedVertexCount > target.maximumChangedVertices) {
    throw new Error(
      `${target.name} exceeded its bounded changed-vertex allowance.`,
    );
  }
  morphDeltas.set(target.name, best.candidate);
  repairs.push({
    target: target.name,
    axis: target.axis,
    seedFaces: [...seedFaces].sort((left, right) => left - right),
    selectedVertices: [...best.selected].sort((left, right) => left - right),
    search: {
      method: best.method,
      expansionRings: best.expansionRings,
      alpha: best.alpha,
      strength: best.strength,
      iterations: best.iterations,
      upperY: best.upperY,
      lowerY: best.lowerY,
      amplitude: best.amplitude,
      profileKind: best.profileKind,
      boundaryFadeRings: best.boundaryFadeRings,
    },
    stateMetrics: best.stateMetrics,
    maximumEdgeStrain: best.maximumEdgeStrain,
    changeMetrics: best.changeMetrics,
    deltas: [...best.selected].map((vertexIndex) => {
      return {
        vertexIndex,
        value: best.candidate[vertexIndex],
      };
    }),
  });
}

await mkdir(OUTPUT_DIRECTORY, { recursive: true });
const plan = {
  schemaVersion: "1.0.0",
  pass: "G1",
  purpose: "Bounded primary-morph correction before any perimeter Basis edit.",
  sourceBlendSha256: await sha256File(SOURCE_BLEND_PATH),
  candidateGlbSha256: await sha256File(CANDIDATE_GLB_PATH),
  frozenVertexEpsilon: region.comparisonEpsilon,
  approvedEditVertexCount: approvedVertices.size,
  repairs,
};
await writeFile(OUTPUT_PATH, `${JSON.stringify(plan, null, 2)}\n`);
console.log(
  JSON.stringify(
    {
      output: path.relative(PROJECT_ROOT, OUTPUT_PATH),
      repairs: repairs.map((repair) => {
        return {
          target: repair.target,
          selectedVertices: repair.selectedVertices.length,
          search: repair.search,
          maximumEdgeStrain: repair.maximumEdgeStrain,
          changeMetrics: repair.changeMetrics,
          stateMetrics: repair.stateMetrics,
        };
      }),
    },
    null,
    2,
  ),
);

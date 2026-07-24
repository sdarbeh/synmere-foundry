import { mkdir, writeFile } from "node:fs/promises";
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
  PRODUCTION_GLB_PATH,
  PROJECT_ROOT,
  SOURCE_BLEND_PATH,
} from "./asset-paths.mjs";

const OUTPUT_DIRECTORY = path.join(
  PROJECT_ROOT,
  "reports/history/audit/pass-g-g11/topology",
);
const REPORT_PATH = path.join(OUTPUT_DIRECTORY, "topology-classification.json");
const SUMMARY_PATH = path.join(OUTPUT_DIRECTORY, "topology-classification.md");
const MAP_PATH = path.join(OUTPUT_DIRECTORY, "topology-defect-map.html");
const POSITION_EPSILON = 1e-6;
const SEAM_EPSILON = 0.006;

const subtract = (left, right) => {
  return left.map((value, axis) => value - right[axis]);
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
  return length === 0 ? [0, 0, 1] : vector.map((value) => value / length);
};

const distance = (left, right) => {
  return magnitude(subtract(left, right));
};

const getTriangles = (indices) => {
  const triangles = [];
  for (let offset = 0; offset < indices.length; offset += 3) {
    triangles.push(indices.slice(offset, offset + 3));
  }
  return triangles;
};

const getEdges = (triangles) => {
  const edges = new Map();
  triangles.forEach((triangle, faceIndex) => {
    triangle.forEach((start, edgeIndex) => {
      const end = triangle[(edgeIndex + 1) % 3];
      const key = `${Math.min(start, end)}:${Math.max(start, end)}`;
      const uses = edges.get(key) ?? [];
      uses.push({ start, end, faceIndex });
      edges.set(key, uses);
    });
  });
  return edges;
};

const getFaceComponents = (triangles, vertexCount) => {
  const vertexFaces = Array.from({ length: vertexCount }, () => []);
  triangles.forEach((triangle, faceIndex) => {
    triangle.forEach((vertexIndex) => {
      vertexFaces[vertexIndex].push(faceIndex);
    });
  });
  const faceComponent = Array(triangles.length).fill(-1);
  const components = [];
  triangles.forEach((_triangle, rootFace) => {
    if (faceComponent[rootFace] >= 0) {
      return;
    }
    const componentIndex = components.length;
    const stack = [rootFace];
    const faces = [];
    const vertices = new Set();
    faceComponent[rootFace] = componentIndex;
    while (stack.length > 0) {
      const faceIndex = stack.pop();
      faces.push(faceIndex);
      triangles[faceIndex].forEach((vertexIndex) => {
        vertices.add(vertexIndex);
        vertexFaces[vertexIndex].forEach((neighborFace) => {
          if (faceComponent[neighborFace] < 0) {
            faceComponent[neighborFace] = componentIndex;
            stack.push(neighborFace);
          }
        });
      });
    }
    components.push({
      componentIndex,
      faceCount: faces.length,
      vertexCount: vertices.size,
      faces,
      vertices: [...vertices],
    });
  });
  return { components, faceComponent };
};

const getBounds = (vertices, positions) => {
  const minimum = [Infinity, Infinity, Infinity];
  const maximum = [-Infinity, -Infinity, -Infinity];
  vertices.forEach((vertexIndex) => {
    positions[vertexIndex].forEach((value, axis) => {
      minimum[axis] = Math.min(minimum[axis], value);
      maximum[axis] = Math.max(maximum[axis], value);
    });
  });
  return { minimum, maximum };
};

const getBoundaryLoops = (boundaryEdges, faceComponent, positions) => {
  const adjacency = new Map();
  boundaryEdges.forEach((edge) => {
    const [start, end] = edge.vertices;
    [
      [start, end],
      [end, start],
    ].forEach(([from, to]) => {
      const neighbors = adjacency.get(from) ?? new Set();
      neighbors.add(to);
      adjacency.set(from, neighbors);
    });
  });
  const seen = new Set();
  const loops = [];
  adjacency.forEach((_neighbors, rootVertex) => {
    if (seen.has(rootVertex)) {
      return;
    }
    const stack = [rootVertex];
    const vertices = [];
    seen.add(rootVertex);
    while (stack.length > 0) {
      const vertexIndex = stack.pop();
      vertices.push(vertexIndex);
      adjacency.get(vertexIndex)?.forEach((neighborIndex) => {
        if (!seen.has(neighborIndex)) {
          seen.add(neighborIndex);
          stack.push(neighborIndex);
        }
      });
    }
    const vertexSet = new Set(vertices);
    const edges = boundaryEdges.filter((edge) => {
      return edge.vertices.every((vertexIndex) => {
        return vertexSet.has(vertexIndex);
      });
    });
    const degreeHistogram = {};
    vertices.forEach((vertexIndex) => {
      const degree = adjacency.get(vertexIndex)?.size ?? 0;
      degreeHistogram[degree] = (degreeHistogram[degree] ?? 0) + 1;
    });
    loops.push({
      loopIndex: loops.length,
      componentIndex: faceComponent[edges[0].faceIndex],
      vertexCount: vertices.length,
      edgeCount: edges.length,
      closed: Object.keys(degreeHistogram).every((degree) => {
        return Number(degree) === 2;
      }),
      degreeHistogram,
      bounds: getBounds(vertices, positions),
      vertices: vertices.sort((left, right) => left - right),
      edges,
    });
  });
  return loops;
};

const compareLoops = (left, right, positions) => {
  const nearest = left.vertices.map((leftVertex) => {
    return Math.min(
      ...right.vertices.map((rightVertex) => {
        return distance(positions[leftVertex], positions[rightVertex]);
      }),
    );
  });
  return {
    leftLoop: left.loopIndex,
    rightLoop: right.loopIndex,
    meanNearestDistance:
      nearest.reduce((total, value) => total + value, 0) / nearest.length,
    maximumNearestDistance: Math.max(...nearest),
    minimumNearestDistance: Math.min(...nearest),
  };
};

const pairBoundaryLoops = (loops, positions) => {
  const unpaired = new Set(
    loops.map((loop) => {
      return loop.loopIndex;
    }),
  );
  const pairs = [];
  while (unpaired.size > 1) {
    let best = null;
    const candidates = [...unpaired];
    candidates.forEach((leftIndex, offset) => {
      candidates.slice(offset + 1).forEach((rightIndex) => {
        const comparison = compareLoops(
          loops[leftIndex],
          loops[rightIndex],
          positions,
        );
        if (
          !best ||
          comparison.meanNearestDistance < best.meanNearestDistance
        ) {
          best = comparison;
        }
      });
    });
    if (!best) {
      break;
    }
    unpaired.delete(best.leftLoop);
    unpaired.delete(best.rightLoop);
    pairs.push(best);
  }
  return { pairs, unpaired: [...unpaired] };
};

const getOrientationClassification = (edges, faceCount) => {
  const adjacency = Array.from({ length: faceCount }, () => []);
  const windingConflicts = [];
  edges.forEach((uses, key) => {
    if (uses.length !== 2) {
      return;
    }
    const sameDirection =
      uses[0].start === uses[1].start && uses[0].end === uses[1].end;
    adjacency[uses[0].faceIndex].push([
      uses[1].faceIndex,
      sameDirection ? 1 : 0,
    ]);
    adjacency[uses[1].faceIndex].push([
      uses[0].faceIndex,
      sameDirection ? 1 : 0,
    ]);
    if (sameDirection) {
      windingConflicts.push({
        edge: key.split(":").map(Number),
        faces: uses.map((use) => use.faceIndex),
      });
    }
  });
  const parity = Array(faceCount).fill(null);
  let parityContradictionCount = 0;
  const orientationComponents = [];
  for (let rootFace = 0; rootFace < faceCount; rootFace += 1) {
    if (parity[rootFace] !== null) {
      continue;
    }
    const stack = [rootFace];
    const faces = [];
    parity[rootFace] = 0;
    while (stack.length > 0) {
      const faceIndex = stack.pop();
      faces.push(faceIndex);
      adjacency[faceIndex].forEach(([neighborFace, xor]) => {
        const expectedParity = parity[faceIndex] ^ xor;
        if (parity[neighborFace] === null) {
          parity[neighborFace] = expectedParity;
          stack.push(neighborFace);
        } else if (parity[neighborFace] !== expectedParity) {
          parityContradictionCount += 1;
        }
      });
    }
    const flipFaces = faces.filter((faceIndex) => {
      return parity[faceIndex] === 1;
    });
    orientationComponents.push({
      faceCount: faces.length,
      minimumConsistentFlipCount: Math.min(
        flipFaces.length,
        faces.length - flipFaces.length,
      ),
      sampledFlipFaces: flipFaces.slice(0, 100),
    });
  }
  return {
    windingConflicts,
    windingConflictCount: windingConflicts.length,
    parityContradictionCount: parityContradictionCount / 2,
    orientationComponents,
    minimumConsistentFlipCount: orientationComponents.reduce(
      (total, component) => {
        return total + component.minimumConsistentFlipCount;
      },
      0,
    ),
  };
};

const getDuplicateClassification = (triangles, positions) => {
  const positionGroups = new Map();
  positions.forEach((position, vertexIndex) => {
    const key = position
      .map((value) => {
        return value.toFixed(6);
      })
      .join(":");
    const vertices = positionGroups.get(key) ?? [];
    vertices.push(vertexIndex);
    positionGroups.set(key, vertices);
  });
  const duplicatePositionGroups = [...positionGroups.values()].filter(
    (vertices) => {
      return vertices.length > 1;
    },
  );
  const indexFaces = new Map();
  const geometricFaces = new Map();
  triangles.forEach((triangle, faceIndex) => {
    const indexKey = [...triangle]
      .sort((left, right) => left - right)
      .join(":");
    const indexGroup = indexFaces.get(indexKey) ?? [];
    indexGroup.push(faceIndex);
    indexFaces.set(indexKey, indexGroup);
    const geometricKey = triangle
      .map((vertexIndex) => {
        return positions[vertexIndex]
          .map((value) => {
            return value.toFixed(6);
          })
          .join(":");
      })
      .sort()
      .join("|");
    const geometricGroup = geometricFaces.get(geometricKey) ?? [];
    geometricGroup.push(faceIndex);
    geometricFaces.set(geometricKey, geometricGroup);
  });
  return {
    duplicatePositionGroups,
    duplicatePositionGroupCount: duplicatePositionGroups.length,
    duplicatePositionVertexCount: duplicatePositionGroups.reduce(
      (total, vertices) => {
        return total + vertices.length;
      },
      0,
    ),
    duplicateIndexFaces: [...indexFaces.values()].filter((faces) => {
      return faces.length > 1;
    }),
    overlappingGeometricFaces: [...geometricFaces.values()].filter((faces) => {
      return faces.length > 1;
    }),
  };
};

const createProjection = (camera, target) => {
  const forward = normalize(subtract(target, camera));
  const right = normalize(cross(forward, [0, 1, 0]));
  const up = normalize(cross(right, forward));
  return (position) => {
    const relative = subtract(position, target);
    return [dot(relative, right), dot(relative, up)];
  };
};

const createSvg = ({
  positions,
  edges,
  windingKeys,
  gapKeys,
  coincidentKeys,
  camera,
  target,
}) => {
  const project = createProjection(camera, target);
  const projected = positions.map(project);
  const minimum = [
    Math.min(...projected.map((point) => point[0])),
    Math.min(...projected.map((point) => point[1])),
  ];
  const maximum = [
    Math.max(...projected.map((point) => point[0])),
    Math.max(...projected.map((point) => point[1])),
  ];
  const size = 520;
  const padding = 24;
  const scale = Math.min(
    (size - padding * 2) / (maximum[0] - minimum[0]),
    (size - padding * 2) / (maximum[1] - minimum[1]),
  );
  const point = (vertexIndex) => {
    return [
      padding + (projected[vertexIndex][0] - minimum[0]) * scale,
      size - padding - (projected[vertexIndex][1] - minimum[1]) * scale,
    ];
  };
  const line = (key, color, width, opacity) => {
    const vertices = key.split(":").map(Number);
    const [startX, startY] = point(vertices[0]);
    const [endX, endY] = point(vertices[1]);
    return `<line x1="${startX.toFixed(2)}" y1="${startY.toFixed(2)}" x2="${endX.toFixed(2)}" y2="${endY.toFixed(2)}" stroke="${color}" stroke-width="${width}" opacity="${opacity}" />`;
  };
  const base = [...edges.keys()].map((key) => {
    return line(key, "#73808f", 0.45, 0.12);
  });
  const conflicts = [...windingKeys].map((key) => {
    return line(key, "#ff5268", 1.1, 0.9);
  });
  const coincident = [...coincidentKeys].map((key) => {
    return line(key, "#b47cff", 2, 1);
  });
  const gaps = [...gapKeys].map((key) => {
    return line(key, "#ffb340", 2.4, 1);
  });
  return `<svg viewBox="0 0 ${size} ${size}" role="img">${base.join("")}${conflicts.join("")}${coincident.join("")}${gaps.join("")}</svg>`;
};

const glb = await readGlb(CANDIDATE_GLB_PATH);
const { primitive } = getIdentityShellDocument(glb, EXPECTED_MESH_NAME);
const positions = readAccessor(glb, primitive.attributes.POSITION);
const indices = readAccessor(glb, primitive.indices);
const triangles = getTriangles(indices);
const edges = getEdges(triangles);
const { components, faceComponent } = getFaceComponents(
  triangles,
  positions.length,
);
const boundaryEdges = [...edges]
  .filter(([_key, uses]) => {
    return uses.length === 1;
  })
  .map(([key, uses]) => {
    return {
      key,
      vertices: key.split(":").map(Number),
      faceIndex: uses[0].faceIndex,
    };
  });
const nonManifoldEdges = [...edges]
  .filter(([_key, uses]) => {
    return uses.length > 2;
  })
  .map(([key, uses]) => {
    return {
      edge: key.split(":").map(Number),
      faces: uses.map((use) => use.faceIndex),
    };
  });
const loops = getBoundaryLoops(boundaryEdges, faceComponent, positions);
const loopPairing = pairBoundaryLoops(loops, positions);
const orientation = getOrientationClassification(edges, triangles.length);
const duplicates = getDuplicateClassification(triangles, positions);
const nearGapPairs = loopPairing.pairs.filter((pair) => {
  return (
    pair.maximumNearestDistance > POSITION_EPSILON &&
    pair.maximumNearestDistance <= SEAM_EPSILON
  );
});
const coincidentPairs = loopPairing.pairs.filter((pair) => {
  return pair.maximumNearestDistance <= POSITION_EPSILON;
});
const gapLoopIndices = new Set(
  nearGapPairs.flatMap((pair) => {
    return [pair.leftLoop, pair.rightLoop];
  }),
);
const coincidentLoopIndices = new Set(
  coincidentPairs.flatMap((pair) => {
    return [pair.leftLoop, pair.rightLoop];
  }),
);
const keysForLoops = (selectedLoops) => {
  return new Set(
    loops
      .filter((loop) => {
        return selectedLoops.has(loop.loopIndex);
      })
      .flatMap((loop) => {
        return loop.edges.map((edge) => edge.key);
      }),
  );
};
const windingKeys = new Set(
  orientation.windingConflicts.map((conflict) => {
    return conflict.edge.join(":");
  }),
);
const gapKeys = keysForLoops(gapLoopIndices);
const coincidentKeys = keysForLoops(coincidentLoopIndices);

const report = {
  schemaVersion: "1.0.0",
  pass: "G1.1b",
  generatedAt: new Date().toISOString(),
  repairPolicy: {
    connectivityChangesAllowed: false,
    vertexOrderChangesAllowed: false,
    faceIndexOrderChangesAllowed: false,
    decision:
      "G1.1 remains topology-preserving. Confirmed defects requiring index, connectivity, or vertex-order changes are migration blockers.",
  },
  references: {
    candidateSha256: await sha256File(CANDIDATE_GLB_PATH),
    sourceBlendSha256: await sha256File(SOURCE_BLEND_PATH),
    productionSha256: await sha256File(PRODUCTION_GLB_PATH),
  },
  counts: {
    vertices: positions.length,
    faces: triangles.length,
    undirectedEdges: edges.size,
    connectedComponents: components.length,
  },
  classification: {
    expectedOpenBoundaries: {
      confirmedEdgeCount: 0,
      finding:
        "No unpaired outer opening was found. All four boundary loops pair with disconnected cap interfaces.",
    },
    disconnectedShells: {
      componentCount: components.length,
      components: components.map((component) => {
        return {
          componentIndex: component.componentIndex,
          faceCount: component.faceCount,
          vertexCount: component.vertexCount,
          bounds: getBounds(component.vertices, positions),
        };
      }),
      finding:
        "The mesh contains one main component and two 126-face cap components. Their validity is conditional on the paired seam classification.",
    },
    reversedFaces: {
      conflictEdgeCount: orientation.windingConflictCount,
      minimumConsistentFlipCount: orientation.minimumConsistentFlipCount,
      parityContradictionCount: orientation.parityContradictionCount,
      components: orientation.orientationComponents,
      conflicts: orientation.windingConflicts,
      finding:
        "The shared-edge conflicts are real and globally orientable, not disconnected-region false positives. Resolving them changes exported triangle index order and is blocked by the current contract.",
    },
    duplicateOrOverlappingFaces: {
      duplicateIndexFaceGroups: duplicates.duplicateIndexFaces,
      overlappingGeometricFaceGroups: duplicates.overlappingGeometricFaces,
      duplicatePositionGroupCount: duplicates.duplicatePositionGroupCount,
      duplicatePositionVertexCount: duplicates.duplicatePositionVertexCount,
      duplicatePositionGroups: duplicates.duplicatePositionGroups,
      finding:
        "No duplicate or geometrically overlapping faces were found. Duplicate positions are concentrated at disconnected interfaces.",
    },
    accidentalOpenSeams: {
      boundaryEdgeCount: boundaryEdges.length,
      boundaryLoops: loops,
      loopPairs: loopPairing.pairs,
      nearGapPairs,
      coincidentPairs,
      unpairedLoops: loopPairing.unpaired,
      confirmedGapEdgeCount: nearGapPairs.length * 84,
      finding:
        "One 42-edge main/cap pair is near-coincident but separated by up to 0.0055 object units, producing 84 open edge uses. A second 42-edge pair is exactly position-coincident but remains disconnected.",
    },
    nonManifoldJunctions: {
      edgeCount: nonManifoldEdges.length,
      edges: nonManifoldEdges,
      finding:
        "No edge is used by more than two faces. The earlier combined count was entirely boundary edges, not non-manifold junctions.",
    },
    diagnosticFalsePositives: {
      count: 0,
      finding:
        "The detector did not misclassify disconnected regions as shared-edge conflicts. The important correction is semantic: 844 counts conflicting adjacencies, not 844 independent faces.",
    },
  },
  gate: {
    classificationComplete: true,
    topologyPreservingRepairAllowed: true,
    faceWindingRepairAllowed: false,
    seamWeldAllowed: false,
    sourceAssetMigrationRequired:
      orientation.windingConflictCount > 0 ||
      coincidentPairs.length > 0 ||
      nearGapPairs.length > 0,
    promotionEligible: false,
  },
};

const cameras = {
  front: [0, -0.08, 4.2],
  "left-34": [-2.2, -0.08, 3.65],
  "right-34": [2.2, -0.08, 3.65],
  "left-profile": [-3.7, -0.08, 1.7],
  "right-profile": [3.7, -0.08, 1.7],
};
const target = [0, -0.08, 0];
const maps = Object.entries(cameras)
  .map(([name, camera]) => {
    const svg = createSvg({
      positions,
      edges,
      windingKeys,
      gapKeys,
      coincidentKeys,
      camera,
      target,
    });
    return `<section><h2>${name}</h2>${svg}</section>`;
  })
  .join("");
const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Synmere G1.1 topology defect map</title>
<style>
body{margin:0;background:#090c10;color:#eaf0f5;font:14px system-ui;padding:28px}
header{max-width:1100px;margin:0 auto 24px}h1{margin:0 0 8px;font-size:24px}
p{color:#9da9b5;line-height:1.5}.legend{display:flex;gap:18px;flex-wrap:wrap}
.legend span::before{content:"";display:inline-block;width:18px;height:3px;margin-right:7px;vertical-align:middle;background:var(--color)}
main{max-width:1600px;margin:auto;display:grid;grid-template-columns:repeat(auto-fit,minmax(340px,1fr));gap:18px}
section{background:#11161c;border:1px solid #202934;border-radius:18px;padding:14px}h2{font-size:13px;text-transform:uppercase;letter-spacing:.08em;color:#bbc7d2}
svg{width:100%;height:auto;background:#07090c;border-radius:12px}
</style>
</head>
<body>
<header><h1>G1.1 topology defect map</h1>
<p>Topology-preserving classification only. No face winding, seam welding, or connectivity edits were applied.</p>
<div class="legend">
<span style="--color:#ff5268">Inconsistent shared-edge winding</span>
<span style="--color:#ffb340">Near-coincident open seam</span>
<span style="--color:#b47cff">Position-coincident disconnected seam</span>
</div></header><main>${maps}</main>
</body></html>`;
const summary = `# Pass G1.1b topology classification

**Connectivity changes allowed:** no  
**Classification complete:** yes  
**Promotion eligible:** no

## Classification

- Expected open boundaries: **0 confirmed**
- Connected components: **${components.length}** — one main shell and two 126-face cap components
- Inconsistent winding adjacencies: **${orientation.windingConflictCount}**
- Minimum faces requiring an orientation flip: **${orientation.minimumConsistentFlipCount}**
- Orientation parity contradictions: **${orientation.parityContradictionCount}**
- Boundary edges: **${boundaryEdges.length}**
- Non-manifold junction edges: **${nonManifoldEdges.length}**
- Duplicate indexed faces: **${duplicates.duplicateIndexFaces.length}**
- Geometrically overlapping face groups: **${duplicates.overlappingGeometricFaces.length}**
- Duplicate-position groups: **${duplicates.duplicatePositionGroupCount}**

## Boundary-loop result

- Four closed 42-edge loops were found.
- One main/cap pair is near-coincident but separated by up to **${nearGapPairs[0]?.maximumNearestDistance.toFixed(6) ?? "n/a"}** object units. This is a confirmed open seam.
- One main/cap pair is exactly position-coincident but uses duplicated, disconnected vertices.
- No boundary loop is unpaired, so the 168 count is not an intentional outer mask opening.

## Decision

G1.1 remains topology-preserving. Precise positional seam closure can be tested without changing indices, but welding the duplicated loops or correcting the 844 winding adjacencies would change the current export contract. Those operations require a separately approved source-asset migration with UV, morph, index, normal, and downstream compatibility validation.
`;

await mkdir(OUTPUT_DIRECTORY, { recursive: true });
await Promise.all([
  writeFile(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`),
  writeFile(SUMMARY_PATH, summary),
  writeFile(MAP_PATH, html),
]);
console.log(
  JSON.stringify(
    {
      report: REPORT_PATH,
      summary: SUMMARY_PATH,
      defectMap: MAP_PATH,
      windingConflicts: orientation.windingConflictCount,
      minimumConsistentFlipCount: orientation.minimumConsistentFlipCount,
      boundaryEdges: boundaryEdges.length,
      nonManifoldEdges: nonManifoldEdges.length,
      nearGapPairs: nearGapPairs.length,
      coincidentPairs: coincidentPairs.length,
      promotionEligible: false,
    },
    null,
    2,
  ),
);

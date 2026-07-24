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
  PRODUCTION_GLB_PATH,
  PROJECT_ROOT,
  SOURCE_BLEND_PATH,
} from "./asset-paths.mjs";

const REFERENCE_GLB_PATH = path.join(
  PROJECT_ROOT,
  "reports/history/checkpoints/pass-g-g1/identity-shell-v1-a-e.glb",
);
const G0_DIRECTORY = path.join(
  PROJECT_ROOT,
  "reports/history/audit/pass-g-g0",
);
const G1_DIRECTORY = path.join(
  PROJECT_ROOT,
  "reports/history/audit/pass-g-g1",
);
const REPORT_PATH = path.join(G1_DIRECTORY, "G1-VALIDATION.json");
const SUMMARY_PATH = path.join(G1_DIRECTORY, "G1-VALIDATION.md");

const TARGET_MORPHS = new Set([
  "identity_chin_short",
  "identity_head_depth_high",
  "identity_head_depth_low",
]);
const EXPECTED_BASIS_VERTICES = [806, 2250, 3830, 5274];
const COMPARISON_EPSILON = 1e-7;

const getJson = async (filePath) => {
  return JSON.parse(await readFile(filePath, "utf8"));
};

const magnitude = (vector) => {
  return Math.hypot(...vector);
};

const subtract = (left, right) => {
  return left.map((value, axis) => value - right[axis]);
};

const getShellData = async (filePath) => {
  const glb = await readGlb(filePath);
  const { mesh, primitive } = getIdentityShellDocument(glb, EXPECTED_MESH_NAME);
  const targetNames = mesh.extras?.targetNames ?? [];
  const morphs = new Map(
    targetNames.map((name, index) => {
      const accessorIndex = primitive.targets?.[index]?.POSITION;
      if (accessorIndex === undefined) {
        throw new Error(`${name} is missing its position accessor.`);
      }
      return [name, readAccessor(glb, accessorIndex)];
    }),
  );
  return {
    positions: readAccessor(glb, primitive.attributes.POSITION),
    indices: readAccessor(glb, primitive.indices),
    targetNames,
    morphs,
  };
};

const compareVectors = (reference, candidate, allowedVertices) => {
  let maximumDisplacement = 0;
  let maximumFrozenDisplacement = 0;
  const changedVertices = [];
  const changedFrozenVertices = [];
  reference.forEach((referenceValue, vertexIndex) => {
    const displacement = magnitude(
      subtract(candidate[vertexIndex], referenceValue),
    );
    maximumDisplacement = Math.max(maximumDisplacement, displacement);
    if (displacement > COMPARISON_EPSILON) {
      changedVertices.push(vertexIndex);
      if (!allowedVertices.has(vertexIndex)) {
        changedFrozenVertices.push(vertexIndex);
      }
    }
    if (!allowedVertices.has(vertexIndex)) {
      maximumFrozenDisplacement = Math.max(
        maximumFrozenDisplacement,
        displacement,
      );
    }
  });
  return {
    changedVertexCount: changedVertices.length,
    changedVertices,
    changedFrozenVertexCount: changedFrozenVertices.length,
    changedFrozenVertices,
    maximumDisplacement,
    maximumFrozenDisplacement,
  };
};

const getTopologyDiagnostics = (indices) => {
  const edges = new Map();
  for (let offset = 0; offset < indices.length; offset += 3) {
    const triangle = indices.slice(offset, offset + 3);
    triangle.forEach((start, edgeIndex) => {
      const end = triangle[(edgeIndex + 1) % 3];
      const key = `${Math.min(start, end)}:${Math.max(start, end)}`;
      const edge = edges.get(key) ?? [];
      edge.push({ start, end, faceIndex: offset / 3 });
      edges.set(key, edge);
    });
  }
  const boundaryOrNonManifoldEdges = [];
  const inconsistentWindingEdges = [];
  edges.forEach((uses, key) => {
    if (uses.length !== 2) {
      boundaryOrNonManifoldEdges.push({ key, faceCount: uses.length });
      return;
    }
    if (uses[0].start === uses[1].start && uses[0].end === uses[1].end) {
      inconsistentWindingEdges.push({
        key,
        faces: uses.map((use) => use.faceIndex),
      });
    }
  });
  return {
    boundaryOrNonManifoldEdgeCount: boundaryOrNonManifoldEdges.length,
    inconsistentWindingEdgeCount: inconsistentWindingEdges.length,
    boundaryOrNonManifoldEdges,
    inconsistentWindingEdges,
  };
};

const summarizeState = (state) => {
  return {
    id: state.id,
    invertedTriangleCount: state.invertedTriangleCount,
    compressedTriangleCount: state.compressedTriangleCount,
    expandedTriangleCount: state.expandedTriangleCount,
    minimumAreaRatio: state.minimumAreaRatio ?? null,
    maximumAreaRatio: state.maximumAreaRatio ?? null,
  };
};

const getStates = (report, prefix) => {
  return report.states
    .filter((state) => state.id.startsWith(prefix))
    .map(summarizeState);
};

const isGeometryClean = (state) => {
  return (
    state.invertedTriangleCount === 0 &&
    state.compressedTriangleCount === 0 &&
    state.expandedTriangleCount === 0
  );
};

const formatStates = (states) => {
  return states
    .map((state) => {
      return `| ${state.id} | ${state.invertedTriangleCount} | ${state.compressedTriangleCount} | ${state.expandedTriangleCount} |`;
    })
    .join("\n");
};

const validatePassG1 = async () => {
  const [
    reference,
    candidate,
    approvedRegion,
    g0Report,
    g1Report,
    referenceSha256,
    candidateSha256,
    sourceBlendSha256,
    productionSha256,
  ] = await Promise.all([
    getShellData(REFERENCE_GLB_PATH),
    getShellData(CANDIDATE_GLB_PATH),
    getJson(path.join(G0_DIRECTORY, "approved-edit-region.json")),
    getJson(path.join(G0_DIRECTORY, "geometry-report.json")),
    getJson(path.join(G1_DIRECTORY, "geometry-report.json")),
    sha256File(REFERENCE_GLB_PATH),
    sha256File(CANDIDATE_GLB_PATH),
    sha256File(SOURCE_BLEND_PATH),
    sha256File(PRODUCTION_GLB_PATH),
  ]);

  const allowedVertices = new Set(approvedRegion.approvedEditVertices);
  const topologyPreserved =
    JSON.stringify(reference.indices) === JSON.stringify(candidate.indices);
  const morphOrderPreserved =
    JSON.stringify(reference.targetNames) ===
    JSON.stringify(candidate.targetNames);
  const basis = compareVectors(
    reference.positions,
    candidate.positions,
    allowedVertices,
  );
  const morphs = candidate.targetNames.map((name) => {
    const comparison = compareVectors(
      reference.morphs.get(name),
      candidate.morphs.get(name),
      allowedVertices,
    );
    return {
      name,
      targeted: TARGET_MORPHS.has(name),
      ...comparison,
    };
  });
  const untouchedMorphsChanged = morphs.filter((morph) => {
    return !morph.targeted && morph.maximumDisplacement > COMPARISON_EPSILON;
  });
  const changedBasisMatchesPlan =
    JSON.stringify(basis.changedVertices) ===
    JSON.stringify(EXPECTED_BASIS_VERTICES);
  const frozenContractPass =
    basis.maximumFrozenDisplacement <= COMPARISON_EPSILON &&
    morphs.every((morph) => {
      return morph.maximumFrozenDisplacement <= COMPARISON_EPSILON;
    });

  const productBaseline = summarizeState(
    g1Report.states.find((state) => {
      return state.id === "product-baseline";
    }),
  );
  const chinStates = getStates(g1Report, "identity_chin_short__");
  const headDepthHighStates = getStates(g1Report, "identity_head_depth_high__");
  const headDepthLowStates = getStates(g1Report, "identity_head_depth_low__");
  const chinEnvelopePass = chinStates.every(isGeometryClean);
  const headDepthEnvelopePass = [
    ...headDepthHighStates,
    ...headDepthLowStates,
  ].every(isGeometryClean);
  const topologyDiagnostics = getTopologyDiagnostics(candidate.indices);
  const technicalContractPass =
    topologyPreserved &&
    morphOrderPreserved &&
    frozenContractPass &&
    changedBasisMatchesPlan &&
    untouchedMorphsChanged.length === 0;
  const visualGate = {
    passed: false,
    findings: [
      "Long side/rear perimeter gaps remain visible in locked 3/4 and profile cameras.",
      "The quarantined rear-inset test increased fragmentation and was rejected.",
      "The quarantined face-orientation test improved isolated gaps but introduced feature shadows and did not repair connectivity.",
      "Cheek and forehead vertex positions were intentionally left unchanged; their browser banding remains a separate exported-normal investigation.",
    ],
  };
  const promotionEligible =
    technicalContractPass &&
    chinEnvelopePass &&
    headDepthEnvelopePass &&
    isGeometryClean(productBaseline) &&
    visualGate.passed;

  const report = {
    schemaVersion: "1.0.0",
    passId: "pass-g-g1",
    generatedAt: new Date().toISOString(),
    status: promotionEligible ? "passed" : "scope-limited",
    promotionEligible,
    references: {
      referenceGlb: REFERENCE_GLB_PATH,
      referenceSha256,
      candidateGlb: CANDIDATE_GLB_PATH,
      candidateSha256,
      sourceBlend: SOURCE_BLEND_PATH,
      sourceBlendSha256,
      productionGlb: PRODUCTION_GLB_PATH,
      productionSha256,
      productionUnchangedFromG0:
        productionSha256 === g0Report.reference.productionSha256,
    },
    editContract: {
      comparisonEpsilon: COMPARISON_EPSILON,
      approvedVertexCount: allowedVertices.size,
      expectedBasisVertices: EXPECTED_BASIS_VERTICES,
      topologyPreserved,
      morphOrderPreserved,
      changedBasisMatchesPlan,
      frozenContractPass,
      basis,
      morphs,
      untouchedMorphsChanged: untouchedMorphsChanged.map((morph) => {
        return morph.name;
      }),
    },
    deformationGate: {
      productBaseline,
      productBaselinePass: isGeometryClean(productBaseline),
      chinEnvelopePass,
      chinStates,
      headDepthEnvelopePass,
      headDepthHighStates,
      headDepthLowStates,
    },
    topologyDiagnostics,
    visualGate,
    decision: promotionEligible
      ? "Candidate may proceed to promotion review."
      : "Reject promotion. Retain A-E production and resolve the out-of-scope head-depth and perimeter connectivity defects in a separately approved pass.",
  };

  const summary = `# Pass G1 validation

**Status:** ${report.status}  
**Promotion eligible:** ${promotionEligible ? "yes" : "no"}  
**Production unchanged:** ${report.references.productionUnchangedFromG0 ? "yes" : "no"}

## Contract

- Topology and index order preserved: ${topologyPreserved ? "yes" : "no"}
- Morph names and order preserved: ${morphOrderPreserved ? "yes" : "no"}
- Frozen vertices within \`${COMPARISON_EPSILON}\`: ${frozenContractPass ? "yes" : "no"}
- Basis edits match the four approved vertices: ${changedBasisMatchesPlan ? "yes" : "no"}
- Unrelated morph deltas changed: ${untouchedMorphsChanged.length}

## Deformation envelope

- Product Baseline clean: ${isGeometryClean(productBaseline) ? "yes" : "no"}
- \`identity_chin_short\` clean at every sample: ${chinEnvelopePass ? "yes" : "no"}
- Both head-depth directions clean at every sample: ${headDepthEnvelopePass ? "yes" : "no"}

| State | Inverted | Compressed | Expanded |
| --- | ---: | ---: | ---: |
${formatStates([...chinStates, ...headDepthHighStates, ...headDepthLowStates])}

## Remaining structural findings

- Inconsistent shared-edge winding: ${topologyDiagnostics.inconsistentWindingEdgeCount}
- Boundary/non-manifold edges: ${topologyDiagnostics.boundaryOrNonManifoldEdgeCount}
- Side/rear perimeter visual gate: failed
- Rear-inset experiment: rejected
- Face-orientation experiment: quarantined

## Decision

${report.decision}
`;

  await mkdir(G1_DIRECTORY, { recursive: true });
  await Promise.all([
    writeFile(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`),
    writeFile(SUMMARY_PATH, summary),
  ]);
  return report;
};

const report = await validatePassG1();
console.log(
  JSON.stringify(
    {
      status: report.status,
      promotionEligible: report.promotionEligible,
      technicalContractPass:
        report.editContract.topologyPreserved &&
        report.editContract.morphOrderPreserved &&
        report.editContract.frozenContractPass &&
        report.editContract.changedBasisMatchesPlan &&
        report.editContract.untouchedMorphsChanged.length === 0,
      productBaselinePass: report.deformationGate.productBaselinePass,
      chinEnvelopePass: report.deformationGate.chinEnvelopePass,
      headDepthEnvelopePass: report.deformationGate.headDepthEnvelopePass,
      visualGatePass: report.visualGate.passed,
      report: REPORT_PATH,
    },
    null,
    2,
  ),
);

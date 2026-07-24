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

const G1_REFERENCE_PATH = path.join(
  PROJECT_ROOT,
  "reports/history/checkpoints/pass-g-g11/identity-shell-v1-g1.glb",
);
const EXPANDED_REGION_PATH = path.join(
  PROJECT_ROOT,
  "assets/candidates/pass-g-g11/expanded-approved-edit-region.json",
);
const G1_REPORT_PATH = path.join(
  PROJECT_ROOT,
  "reports/history/audit/pass-g-g1/geometry-report.json",
);
const G11_REPORT_PATH = path.join(
  PROJECT_ROOT,
  "reports/history/audit/pass-g-g11/geometry-report.json",
);
const TOPOLOGY_REPORT_PATH = path.join(
  PROJECT_ROOT,
  "reports/history/audit/pass-g-g11/topology/topology-classification.json",
);
const OUTPUT_PATH = path.join(
  PROJECT_ROOT,
  "reports/history/audit/pass-g-g11/G11-VALIDATION.json",
);
const SUMMARY_PATH = path.join(
  PROJECT_ROOT,
  "reports/history/audit/pass-g-g11/G11-VALIDATION.md",
);
const COMPARISON_EPSILON = 1e-7;
const TARGET_MORPHS = new Set([
  "identity_head_depth_high",
  "identity_head_depth_low",
]);

const getJson = async (filePath) => {
  return JSON.parse(await readFile(filePath, "utf8"));
};

const magnitude = (vector) => {
  return Math.hypot(...vector);
};

const getShellData = async (filePath) => {
  const glb = await readGlb(filePath);
  const { mesh, primitive } = getIdentityShellDocument(glb, EXPECTED_MESH_NAME);
  const targetNames = mesh.extras?.targetNames ?? [];
  return {
    indices: readAccessor(glb, primitive.indices),
    positions: readAccessor(glb, primitive.attributes.POSITION),
    targetNames,
    morphs: new Map(
      targetNames.map((name, index) => {
        return [name, readAccessor(glb, primitive.targets[index].POSITION)];
      }),
    ),
  };
};

const compareVectors = (reference, candidate, allowed) => {
  const changedVertices = [];
  const frozenChanges = [];
  let maximumDisplacement = 0;
  let maximumFrozenDisplacement = 0;
  reference.forEach((vector, vertexIndex) => {
    const displacement = magnitude(
      vector.map((value, axis) => {
        return candidate[vertexIndex][axis] - value;
      }),
    );
    maximumDisplacement = Math.max(maximumDisplacement, displacement);
    if (displacement > COMPARISON_EPSILON) {
      changedVertices.push(vertexIndex);
      if (!allowed.has(vertexIndex)) {
        frozenChanges.push(vertexIndex);
      }
    }
    if (!allowed.has(vertexIndex)) {
      maximumFrozenDisplacement = Math.max(
        maximumFrozenDisplacement,
        displacement,
      );
    }
  });
  return {
    changedVertexCount: changedVertices.length,
    changedVertices,
    frozenChangeCount: frozenChanges.length,
    frozenChanges,
    maximumDisplacement,
    maximumFrozenDisplacement,
  };
};

const isClean = (state) => {
  return (
    state.invertedTriangleCount === 0 &&
    state.compressedTriangleCount === 0 &&
    state.expandedTriangleCount === 0
  );
};

const stateCounts = (state) => {
  return {
    inverted: state.invertedTriangleCount,
    compressed: state.compressedTriangleCount,
    expanded: state.expandedTriangleCount,
  };
};

const formatStateRows = (states) => {
  return states
    .map((state) => {
      return `| ${state.id} | ${state.invertedTriangleCount} | ${state.compressedTriangleCount} | ${state.expandedTriangleCount} |`;
    })
    .join("\n");
};

const [
  reference,
  candidate,
  region,
  g1Report,
  g11Report,
  topologyReport,
  referenceSha256,
  candidateSha256,
  sourceBlendSha256,
  productionSha256,
] = await Promise.all([
  getShellData(G1_REFERENCE_PATH),
  getShellData(CANDIDATE_GLB_PATH),
  getJson(EXPANDED_REGION_PATH),
  getJson(G1_REPORT_PATH),
  getJson(G11_REPORT_PATH),
  getJson(TOPOLOGY_REPORT_PATH),
  sha256File(G1_REFERENCE_PATH),
  sha256File(CANDIDATE_GLB_PATH),
  sha256File(SOURCE_BLEND_PATH),
  sha256File(PRODUCTION_GLB_PATH),
]);
const allowed = new Set(region.approvedEditVertices);
const topologyPreserved =
  JSON.stringify(reference.indices) === JSON.stringify(candidate.indices);
const morphOrderPreserved =
  JSON.stringify(reference.targetNames) ===
  JSON.stringify(candidate.targetNames);
const basis = compareVectors(reference.positions, candidate.positions, allowed);
const morphs = candidate.targetNames.map((name) => {
  return {
    name,
    targeted: TARGET_MORPHS.has(name),
    ...compareVectors(
      reference.morphs.get(name),
      candidate.morphs.get(name),
      allowed,
    ),
  };
});
const unrelatedMorphChanges = morphs.filter((morph) => {
  return !morph.targeted && morph.maximumDisplacement > COMPARISON_EPSILON;
});
const frozenContractPass =
  basis.maximumFrozenDisplacement <= COMPARISON_EPSILON &&
  morphs.every((morph) => {
    return morph.maximumFrozenDisplacement <= COMPARISON_EPSILON;
  });
const headDepthStates = g11Report.states.filter((state) => {
  return state.id.startsWith("identity_head_depth_");
});
const headDepthCombinationStates = g11Report.states.filter((state) => {
  return state.id.startsWith("jaw-wide-head-depth-");
});
const headDepthEnvelopePass = [
  ...headDepthStates,
  ...headDepthCombinationStates,
].every(isClean);
const unaffectedStateRegressions = g11Report.states
  .filter((state) => {
    return !state.id.includes("head-depth") && !state.id.includes("head_depth");
  })
  .filter((state) => {
    const referenceState = g1Report.states.find((candidateState) => {
      return candidateState.id === state.id;
    });
    return (
      !referenceState ||
      JSON.stringify(stateCounts(referenceState)) !==
        JSON.stringify(stateCounts(state))
    );
  })
  .map((state) => {
    return state.id;
  });
const productBaseline = g11Report.states.find((state) => {
  return state.id === "product-baseline";
});
const chinStates = g11Report.states.filter((state) => {
  return state.id.startsWith("identity_chin_short__");
});
const deformationGatePass =
  isClean(productBaseline) &&
  chinStates.every(isClean) &&
  headDepthEnvelopePass &&
  unaffectedStateRegressions.length === 0;
const contractPass =
  topologyPreserved &&
  morphOrderPreserved &&
  basis.maximumDisplacement <= COMPARISON_EPSILON &&
  frozenContractPass &&
  unrelatedMorphChanges.length === 0;
const structuralGatePass =
  topologyReport.classification.reversedFaces.conflictEdgeCount === 0 &&
  topologyReport.classification.accidentalOpenSeams.boundaryEdgeCount === 0;
const promotionEligible =
  contractPass && deformationGatePass && structuralGatePass;

const report = {
  schemaVersion: "1.0.0",
  pass: "G1.1",
  generatedAt: new Date().toISOString(),
  status: promotionEligible ? "passed" : "structurally-blocked",
  promotionEligible,
  references: {
    g1ReferenceGlb: G1_REFERENCE_PATH,
    g1ReferenceSha256: referenceSha256,
    candidateGlb: CANDIDATE_GLB_PATH,
    candidateSha256,
    sourceBlend: SOURCE_BLEND_PATH,
    sourceBlendSha256,
    productionGlb: PRODUCTION_GLB_PATH,
    productionSha256,
    productionUnchanged:
      productionSha256 ===
      "e26ae71bf468d3149c65dcea97e82b16be63b902e6635d1134c5654a1771bbd4",
  },
  contractGate: {
    passed: contractPass,
    topologyPreserved,
    morphOrderPreserved,
    basis,
    frozenContractPass,
    unrelatedMorphChanges: unrelatedMorphChanges.map((morph) => {
      return morph.name;
    }),
    targetedMorphs: morphs.filter((morph) => {
      return morph.targeted;
    }),
    approvedVertexCount: allowed.size,
    newlyApprovedVertices: region.newlyApprovedVertices,
  },
  deformationGate: {
    passed: deformationGatePass,
    productBaseline: stateCounts(productBaseline),
    chinShortPass: chinStates.every(isClean),
    headDepthEnvelopePass,
    headDepthStates: headDepthStates.map((state) => {
      return { id: state.id, ...stateCounts(state) };
    }),
    headDepthCombinations: headDepthCombinationStates.map((state) => {
      return { id: state.id, ...stateCounts(state) };
    }),
    unaffectedStateRegressions,
  },
  topologyClassificationGate: {
    passed: structuralGatePass,
    windingConflictEdges:
      topologyReport.classification.reversedFaces.conflictEdgeCount,
    minimumConsistentFaceFlips:
      topologyReport.classification.reversedFaces.minimumConsistentFlipCount,
    boundaryEdges:
      topologyReport.classification.accidentalOpenSeams.boundaryEdgeCount,
    nonManifoldJunctionEdges:
      topologyReport.classification.nonManifoldJunctions.edgeCount,
    nearCoincidentGapPairs:
      topologyReport.classification.accidentalOpenSeams.nearGapPairs.length,
    coincidentDisconnectedPairs:
      topologyReport.classification.accidentalOpenSeams.coincidentPairs.length,
    seamAlignmentExperiment:
      "Rejected. Exact positional closure did not remove the visible 3/4 or profile gaps and was not applied to the canonical source.",
  },
  decision: promotionEligible
    ? "Candidate may proceed to promotion review."
    : "G1.1a is accepted as a deformation checkpoint, but promotion remains blocked. The remaining repair requires an explicitly approved source-asset topology/index migration.",
};
const summary = `# Pass G1.1 validation

**Status:** ${report.status}  
**Promotion eligible:** ${promotionEligible ? "yes" : "no"}  
**Production unchanged:** ${report.references.productionUnchanged ? "yes" : "no"}

## G1.1a — head-depth completion

- Expanded approved region: **${allowed.size} vertices**
- Basis changed from G1: **${basis.changedVertexCount} vertices**
- Unrelated morphs changed: **${unrelatedMorphChanges.length}**
- Frozen vertices moved: **${morphs.reduce((total, morph) => total + morph.frozenChangeCount, basis.frozenChangeCount)}**
- Product Baseline clean: **${isClean(productBaseline) ? "yes" : "no"}**
- \`chin_short\` clean: **${chinStates.every(isClean) ? "yes" : "no"}**
- Head-depth envelope clean: **${headDepthEnvelopePass ? "yes" : "no"}**
- Unaffected state regressions: **${unaffectedStateRegressions.length}**

| State | Inverted | Compressed | Expanded |
| --- | ---: | ---: | ---: |
${formatStateRows([...headDepthStates, ...headDepthCombinationStates])}

## G1.1b — structural classification

- Winding-conflict edges: **${report.topologyClassificationGate.windingConflictEdges}**
- Minimum consistent face flips: **${report.topologyClassificationGate.minimumConsistentFaceFlips}**
- Boundary edges: **${report.topologyClassificationGate.boundaryEdges}**
- Non-manifold junction edges: **${report.topologyClassificationGate.nonManifoldJunctionEdges}**
- Near-coincident open seam pairs: **${report.topologyClassificationGate.nearCoincidentGapPairs}**
- Position-coincident disconnected seam pairs: **${report.topologyClassificationGate.coincidentDisconnectedPairs}**
- Exact seam-alignment experiment: **rejected**

## Decision

${report.decision}
`;

await mkdir(path.dirname(OUTPUT_PATH), { recursive: true });
await Promise.all([
  writeFile(OUTPUT_PATH, `${JSON.stringify(report, null, 2)}\n`),
  writeFile(SUMMARY_PATH, summary),
]);
console.log(
  JSON.stringify(
    {
      status: report.status,
      promotionEligible,
      contractPass,
      deformationGatePass,
      headDepthEnvelopePass,
      structuralGatePass,
      report: OUTPUT_PATH,
    },
    null,
    2,
  ),
);

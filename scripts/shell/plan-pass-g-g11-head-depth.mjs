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

const G0_REGION_PATH = path.join(
  PROJECT_ROOT,
  "reports/history/audit/pass-g-g0/approved-edit-region.json",
);
const OUTPUT_DIRECTORY = path.join(
  PROJECT_ROOT,
  "assets/candidates/pass-g-g11",
);
const PLAN_PATH = path.join(OUTPUT_DIRECTORY, "head-depth-repair-plan.json");
const REGION_PATH = path.join(
  OUTPUT_DIRECTORY,
  "expanded-approved-edit-region.json",
);

// These eight exported triangles are four mirrored side-strip pairs.
const FAILING_FACES = [2798, 2800, 5645, 5647, 8672, 8674, 11519, 11521];
const INTERPOLATION_TRIPLETS = [
  [1502, 784, 1503],
  [1504, 1503, 276],
  [2934, 2235, 2933],
  [2935, 2933, 1772],
  [4526, 3808, 4527],
  [4528, 4527, 3300],
  [5958, 5259, 5957],
  [5959, 5957, 4796],
];
const LOWER_SUPPORT_GROUPS = [
  [763, 765, 766],
  [2216, 2217, 2218],
  [3790, 3789, 3787],
  [5242, 5241, 5240],
];

const averageVectors = (vectors) => {
  return [0, 1, 2].map((axis) => {
    return (
      vectors.reduce((total, vector) => {
        return total + vector[axis];
      }, 0) / vectors.length
    );
  });
};

const createTargetRepair = (name, deltas, includeLowerSupport) => {
  const replacements = new Map();
  INTERPOLATION_TRIPLETS.forEach(([target, first, second]) => {
    replacements.set(target, averageVectors([deltas[first], deltas[second]]));
  });
  if (includeLowerSupport) {
    LOWER_SUPPORT_GROUPS.forEach((vertices) => {
      const average = averageVectors(
        vertices.map((vertexIndex) => {
          return deltas[vertexIndex];
        }),
      );
      vertices.forEach((vertexIndex) => {
        replacements.set(vertexIndex, average);
      });
    });
  }
  return {
    target: name,
    method: includeLowerSupport
      ? "side-strip interpolation plus lower-support equalization"
      : "side-strip interpolation",
    deltas: [...replacements]
      .sort(([left], [right]) => left - right)
      .map(([vertexIndex, value]) => {
        return { vertexIndex, value };
      }),
  };
};

const glb = await readGlb(CANDIDATE_GLB_PATH);
const { mesh, primitive } = getIdentityShellDocument(glb, EXPECTED_MESH_NAME);
const indices = readAccessor(glb, primitive.indices);
const targetNames = mesh.extras?.targetNames ?? [];
const getMorphDeltas = (name) => {
  const targetIndex = targetNames.indexOf(name);
  if (targetIndex < 0) {
    throw new Error(`Missing ${name} morph target.`);
  }
  return readAccessor(glb, primitive.targets[targetIndex].POSITION);
};
const oldRegion = JSON.parse(await readFile(G0_REGION_PATH, "utf8"));
const failingVertices = new Set(
  FAILING_FACES.flatMap((faceIndex) => {
    return indices.slice(faceIndex * 3, faceIndex * 3 + 3);
  }),
);
const expandedVertices = new Set([
  ...oldRegion.approvedEditVertices,
  ...failingVertices,
]);
const newlyApprovedVertices = [...failingVertices]
  .filter((vertexIndex) => {
    return !oldRegion.approvedEditVertices.includes(vertexIndex);
  })
  .sort((left, right) => left - right);

const plan = {
  schemaVersion: "1.0.0",
  pass: "G1.1a",
  purpose:
    "Complete the head-depth envelope without changing Basis geometry or unrelated morphs.",
  sourceBlendSha256: await sha256File(SOURCE_BLEND_PATH),
  candidateGlbSha256: await sha256File(CANDIDATE_GLB_PATH),
  comparisonEpsilon: oldRegion.comparisonEpsilon,
  failingFaces: FAILING_FACES,
  newlyApprovedVertices,
  approvedEditVertexCount: expandedVertices.size,
  repairs: [
    createTargetRepair(
      "identity_head_depth_high",
      getMorphDeltas("identity_head_depth_high"),
      false,
    ),
    createTargetRepair(
      "identity_head_depth_low",
      getMorphDeltas("identity_head_depth_low"),
      true,
    ),
  ],
};
const region = {
  schemaVersion: "1.0.0",
  pass: "G1.1a",
  comparisonEpsilon: oldRegion.comparisonEpsilon,
  invariant:
    "Every Basis and shape-key vertex outside approvedEditVertices must remain exactly unchanged; comparisonEpsilon only absorbs serialization noise.",
  previousApprovedVertexCount: oldRegion.approvedEditVertices.length,
  newlyApprovedVertices,
  approvedEditVertices: [...expandedVertices].sort(
    (left, right) => left - right,
  ),
  failingFaces: FAILING_FACES,
};

await mkdir(OUTPUT_DIRECTORY, { recursive: true });
await Promise.all([
  writeFile(PLAN_PATH, `${JSON.stringify(plan, null, 2)}\n`),
  writeFile(REGION_PATH, `${JSON.stringify(region, null, 2)}\n`),
]);
console.log(
  JSON.stringify(
    {
      plan: PLAN_PATH,
      region: REGION_PATH,
      previousApprovedVertexCount: oldRegion.approvedEditVertices.length,
      approvedEditVertexCount: expandedVertices.size,
      newlyApprovedVertices,
      repairs: plan.repairs.map((repair) => {
        return {
          target: repair.target,
          changedVertices: repair.deltas.length,
        };
      }),
    },
    null,
    2,
  ),
);

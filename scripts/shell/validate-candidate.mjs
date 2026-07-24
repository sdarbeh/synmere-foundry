import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

import {
  CANDIDATE_GLB_PATH,
  CANDIDATE_MANIFEST_PATH,
  EXPECTED_MATERIAL_NAME,
  EXPECTED_MESH_NAME,
  MAXIMUM_MORPH_EDGE_STRAIN,
  SOURCE_BLEND_PATH,
  SOURCE_CONTRACT_PATH,
} from "./asset-paths.mjs";
import {
  getGlbContract,
  getIdentityShellDocument,
  getNodeExtras,
  readAccessor,
  readGlb,
  sha256File,
} from "./glb.mjs";

const getJson = async (filePath) => {
  return JSON.parse(await readFile(filePath, "utf8"));
};

const assertEqual = (actual, expected, label) => {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(
      `${label} changed.\nExpected: ${JSON.stringify(expected)}\nActual: ${JSON.stringify(actual)}`,
    );
  }
};

const validateBounds = (candidate, reference) => {
  const maximumAxisDelta = 0.35;
  ["minimum", "maximum"].forEach((boundary) => {
    candidate[boundary].forEach((value, axis) => {
      if (!Number.isFinite(value)) {
        throw new Error(`Candidate ${boundary} bound ${axis} is not finite.`);
      }
      if (Math.abs(value - reference[boundary][axis]) > maximumAxisDelta) {
        throw new Error(
          `Candidate ${boundary} bound ${axis} moved beyond the sculpt budget.`,
        );
      }
    });
  });
};

export const validateCandidate = async () => {
  const [reference, manifest, candidate, candidateSha256, sourceBlendSha256] =
    await Promise.all([
      getJson(SOURCE_CONTRACT_PATH),
      getJson(CANDIDATE_MANIFEST_PATH),
      readGlb(CANDIDATE_GLB_PATH),
      sha256File(CANDIDATE_GLB_PATH),
      sha256File(SOURCE_BLEND_PATH),
    ]);
  const contract = getGlbContract(candidate, EXPECTED_MESH_NAME);
  const extras = getNodeExtras(candidate, EXPECTED_MESH_NAME);

  assertEqual(contract.meshName, EXPECTED_MESH_NAME, "Mesh name");
  assertEqual(contract.materialName, EXPECTED_MATERIAL_NAME, "Material slot");
  assertEqual(
    contract.vertexCount,
    reference.contract.vertexCount,
    "Vertex count",
  );
  assertEqual(
    contract.indexCount,
    reference.contract.indexCount,
    "Index count",
  );
  assertEqual(
    contract.topologyHash,
    reference.contract.topologyHash,
    "Triangle topology and vertex order",
  );
  assertEqual(
    contract.morphTargetNames,
    reference.contract.morphTargetNames,
    "Morph target names and order",
  );
  assertEqual(
    contract.morphTargetCount,
    reference.contract.morphTargetCount,
    "Morph target count",
  );
  validateBounds(contract.bounds, reference.contract.bounds);
  assertEqual(
    extras.assetId,
    reference.preservedMetadata.assetId,
    "Asset identifier",
  );
  assertEqual(
    extras.topologyVersion,
    reference.preservedMetadata.topologyVersion,
    "Topology version",
  );
  assertEqual(
    extras.presentationTopology,
    reference.preservedMetadata.presentationTopology,
    "Protected topology metadata",
  );
  assertEqual(
    manifest.sourceBlendSha256,
    sourceBlendSha256,
    "Source Blender hash",
  );
  assertEqual(manifest.candidateSha256, candidateSha256, "Candidate hash");

  const morphIntegrity = extras.morphIntegrity ?? {};
  assertEqual(
    Object.keys(morphIntegrity),
    contract.morphTargetNames,
    "Morph integrity target order",
  );
  Object.entries(morphIntegrity).forEach(([name, integrity]) => {
    if (
      !Number.isFinite(integrity.maximumEdgeStrain) ||
      integrity.maximumEdgeStrain > MAXIMUM_MORPH_EDGE_STRAIN
    ) {
      throw new Error(
        `${name} exceeds the ${MAXIMUM_MORPH_EDGE_STRAIN} edge-strain budget.`,
      );
    }
  });
  if ((candidate.json.meshes?.length ?? 0) !== 1) {
    throw new Error("Candidate must contain exactly one mesh.");
  }
  if ((candidate.json.animations?.length ?? 0) > 0) {
    throw new Error("Candidate must not contain animations.");
  }
  if ((candidate.json.skins?.length ?? 0) > 0) {
    throw new Error("Candidate must not contain a skin.");
  }
  const { primitive } = getIdentityShellDocument(candidate, EXPECTED_MESH_NAME);
  (primitive.targets ?? []).forEach((target, index) => {
    if (target.NORMAL === undefined) {
      throw new Error(
        `${contract.morphTargetNames[index]} is missing smooth morph normals.`,
      );
    }
    assertEqual(
      readAccessor(candidate, target.NORMAL).length,
      contract.vertexCount,
      `${contract.morphTargetNames[index]} normal count`,
    );
  });

  return {
    valid: true,
    candidateSha256,
    sourceBlendSha256,
    contract,
    maximumMorphEdgeStrain: Math.max(
      ...Object.values(morphIntegrity).map((entry) => {
        return entry.maximumEdgeStrain;
      }),
    ),
  };
};

if (pathToFileURL(process.argv[1]).href === import.meta.url) {
  console.log(JSON.stringify(await validateCandidate(), null, 2));
}

import { copyFile, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";

import {
  EXPECTED_MATERIAL_NAME,
  EXPECTED_MESH_NAME,
  PRODUCTION_GLB_PATH,
  PROJECT_ROOT,
  RELEASE_MANIFEST_PATH,
  SHELL_ASSET_PIPELINE_VERSION,
  SOURCE_BLEND_PATH,
  SOURCE_CONTRACT_PATH,
} from "./asset-paths.mjs";
import { getGlbContract, getNodeExtras, readGlb, sha256File } from "./glb.mjs";

const CANDIDATE_DIRECTORY = path.join(
  PROJECT_ROOT,
  "assets/candidates/morph-safety-repair",
);
const CANDIDATE_BLEND_PATH = path.join(
  CANDIDATE_DIRECTORY,
  "identity-shell-v1-morph-safety-repair.blend",
);
const CANDIDATE_GLB_PATH = path.join(
  CANDIDATE_DIRECTORY,
  "identity-shell-v1-morph-safety-repair.glb",
);
const APPLICATION_REPORT_PATH = path.join(
  CANDIDATE_DIRECTORY,
  "reports/application.json",
);
const EXPORT_MANIFEST_PATH = path.join(
  CANDIDATE_DIRECTORY,
  "reports/export-manifest.json",
);
const VALIDATION_REPORT_PATH = path.join(
  CANDIDATE_DIRECTORY,
  "reports/validation.json",
);
const VISUAL_REVIEW_PATH = path.join(
  CANDIDATE_DIRECTORY,
  "reports/model-lab-review.json",
);
const EXPECTED_CANDIDATE_BLEND_SHA256 =
  "026913c5c6732a06976f5e01abe320f30c5c1a08814c178366eaa979133e2247";
const EXPECTED_CANDIDATE_GLB_SHA256 =
  "2eb90bb7f08d528d7abd521a8cca9f90b00479c1c470d682d44d657f270716f7";
const ASSET_VERSION_TAG = "identity-shell-v1-safety-20260724-2eb90bb7f08d";
const RELEASE_DIRECTORY = path.join(
  PROJECT_ROOT,
  "assets/releases/avatar/identity-shell-v1",
);

if (!process.argv.includes("--confirm")) {
  throw new Error(
    "Promotion requires explicit confirmation: pnpm asset:shell:promote:safety -- --confirm",
  );
}

const readJson = async (filePath) => {
  return JSON.parse(await readFile(filePath, "utf8"));
};

const assert = (condition, message) => {
  if (!condition) {
    throw new Error(message);
  }
};

const assertEqual = (actual, expected, label) => {
  assert(
    JSON.stringify(actual) === JSON.stringify(expected),
    `${label} changed.\nExpected: ${JSON.stringify(expected)}\nActual: ${JSON.stringify(actual)}`,
  );
};

const writeJsonAtomic = async (filePath, value) => {
  const temporaryPath = `${filePath}.promotion-tmp`;
  await writeFile(temporaryPath, `${JSON.stringify(value, null, 2)}\n`);
  await rename(temporaryPath, filePath);
};

const [
  application,
  exportManifest,
  validation,
  visualReview,
  candidateBlendSha256,
  candidateGlbSha256,
] = await Promise.all([
  readJson(APPLICATION_REPORT_PATH),
  readJson(EXPORT_MANIFEST_PATH),
  readJson(VALIDATION_REPORT_PATH),
  readJson(VISUAL_REVIEW_PATH),
  sha256File(CANDIDATE_BLEND_PATH),
  sha256File(CANDIDATE_GLB_PATH),
]);

assertEqual(
  candidateBlendSha256,
  EXPECTED_CANDIDATE_BLEND_SHA256,
  "Approved Blender candidate hash",
);
assertEqual(
  candidateGlbSha256,
  EXPECTED_CANDIDATE_GLB_SHA256,
  "Approved GLB candidate hash",
);
assertEqual(
  application.candidateSha256,
  candidateBlendSha256,
  "Application report Blender hash",
);
assertEqual(
  exportManifest.sourceBlendSha256,
  candidateBlendSha256,
  "Export manifest Blender hash",
);
assertEqual(
  exportManifest.candidateSha256,
  candidateGlbSha256,
  "Export manifest GLB hash",
);
assert(
  validation.localRegressionValidation.passed,
  "Local regression validation did not pass.",
);
assert(
  validation.globalAssetSafetyValidation.passed,
  "Global asset safety validation did not pass.",
);
assert(
  validation.globalAssetSafetyValidation.sampledStates === 193,
  "Global validation did not cover all 193 approved states.",
);
assert(
  validation.globalAssetSafetyValidation.invertedStateCount === 0,
  "The candidate still contains inverted morph states.",
);
assert(
  validation.globalAssetSafetyValidation.degenerateStateCount === 0,
  "The candidate still contains degenerate morph states.",
);
assert(visualReview.results.passed, "Model Lab visual review did not pass.");

const [previousProductionSha256, previousSourceSha256] = await Promise.all([
  sha256File(PRODUCTION_GLB_PATH),
  sha256File(SOURCE_BLEND_PATH),
]);
const rollbackTag = `rollback-${previousProductionSha256.slice(0, 12)}`;
const rollbackDirectory = path.join(RELEASE_DIRECTORY, rollbackTag);
const rollbackGlbPath = path.join(rollbackDirectory, "identity-shell-v1.glb");
const rollbackBlendPath = path.join(
  rollbackDirectory,
  "identity-shell-v1.blend",
);
const rollbackContractPath = path.join(
  rollbackDirectory,
  "identity-shell-v1.contract.json",
);

await mkdir(RELEASE_DIRECTORY, { recursive: true });
await mkdir(rollbackDirectory, { recursive: false });
await Promise.all([
  copyFile(PRODUCTION_GLB_PATH, rollbackGlbPath),
  copyFile(SOURCE_BLEND_PATH, rollbackBlendPath),
  copyFile(SOURCE_CONTRACT_PATH, rollbackContractPath),
]);

const sourceTemporaryPath = `${SOURCE_BLEND_PATH}.promotion-tmp`;
const productionTemporaryPath = `${PRODUCTION_GLB_PATH}.promotion-tmp`;
await Promise.all([
  copyFile(CANDIDATE_BLEND_PATH, sourceTemporaryPath),
  copyFile(CANDIDATE_GLB_PATH, productionTemporaryPath),
]);
await rename(sourceTemporaryPath, SOURCE_BLEND_PATH);
await rename(productionTemporaryPath, PRODUCTION_GLB_PATH);

const productionDocument = await readGlb(PRODUCTION_GLB_PATH);
const productionContract = getGlbContract(
  productionDocument,
  EXPECTED_MESH_NAME,
);
const productionExtras = getNodeExtras(productionDocument, EXPECTED_MESH_NAME);
const nextContract = {
  schemaVersion: SHELL_ASSET_PIPELINE_VERSION,
  capturedFrom: "public/models/shell/identity-shell/1.1.2/identity-shell.glb",
  productionSha256: candidateGlbSha256,
  contract: productionContract,
  preservedMetadata: {
    assetId: productionExtras.assetId,
    topologyVersion: productionExtras.topologyVersion,
    presentationTopology: productionExtras.presentationTopology,
  },
};
await writeJsonAtomic(SOURCE_CONTRACT_PATH, nextContract);

// This is the single production-path validation run after both assets move.
const validateProductionPath = async () => {
  const [productionSha256, sourceBlendSha256, production, contractSnapshot] =
    await Promise.all([
      sha256File(PRODUCTION_GLB_PATH),
      sha256File(SOURCE_BLEND_PATH),
      readGlb(PRODUCTION_GLB_PATH),
      readJson(SOURCE_CONTRACT_PATH),
    ]);
  const contract = getGlbContract(production, EXPECTED_MESH_NAME);

  assertEqual(productionSha256, candidateGlbSha256, "Production GLB hash");
  assertEqual(
    sourceBlendSha256,
    candidateBlendSha256,
    "Canonical Blender hash",
  );
  assertEqual(contract, exportManifest.contract, "Production GLB contract");
  assertEqual(
    contractSnapshot.contract,
    contract,
    "Production contract snapshot",
  );
  assertEqual(contract.meshName, EXPECTED_MESH_NAME, "Production mesh name");
  assertEqual(
    contract.materialName,
    EXPECTED_MATERIAL_NAME,
    "Production material",
  );
  assertEqual(contract.vertexCount, 6052, "Production vertex count");
  assertEqual(contract.triangleCount, 12100, "Production triangle count");
  assertEqual(contract.morphTargetCount, 37, "Production morph count");

  return {
    passed: true,
    productionSha256,
    sourceBlendSha256,
    contract,
    localRegressionValidation: "passed",
    globalAssetSafetyValidation: {
      status: "passed",
      sampledStates: 193,
      invertedStates: 0,
      degenerateStates: 0,
    },
  };
};

let productionValidation;
try {
  productionValidation = await validateProductionPath();
} catch (error) {
  await Promise.all([
    copyFile(rollbackGlbPath, PRODUCTION_GLB_PATH),
    copyFile(rollbackBlendPath, SOURCE_BLEND_PATH),
    copyFile(rollbackContractPath, SOURCE_CONTRACT_PATH),
  ]);
  throw error;
}

const promotedAt = new Date().toISOString();
const rollbackManifest = {
  schemaVersion: "v1",
  asset: "identity-shell-v1",
  rollbackTag,
  capturedAt: promotedAt,
  sourceBlendSha256: previousSourceSha256,
  productionGlbSha256: previousProductionSha256,
  paths: {
    blend: path.relative(PROJECT_ROOT, rollbackBlendPath),
    glb: path.relative(PROJECT_ROOT, rollbackGlbPath),
    contract: path.relative(PROJECT_ROOT, rollbackContractPath),
  },
};
await writeJsonAtomic(
  path.join(rollbackDirectory, "rollback-manifest.json"),
  rollbackManifest,
);

const release = {
  schemaVersion: "v1",
  asset: "identity-shell-v1",
  assetVersionTag: ASSET_VERSION_TAG,
  promotedAt,
  sourceBlendSha256: candidateBlendSha256,
  productionGlbSha256: candidateGlbSha256,
  rollback: rollbackManifest,
  validation: productionValidation,
  visualReview: {
    status: "passed",
    reviewedAt: visualReview.reviewedAt,
  },
  scope: "morph-only safety repair",
  excludedWork: [
    "lower-edge notch geometry correction",
    "renderer changes",
    "normal changes",
    "additional visual sculpting",
  ],
};
await Promise.all([
  writeJsonAtomic(RELEASE_MANIFEST_PATH, release),
  writeJsonAtomic(
    path.join(RELEASE_DIRECTORY, `${ASSET_VERSION_TAG}.json`),
    release,
  ),
]);

console.log(JSON.stringify(release, null, 2));

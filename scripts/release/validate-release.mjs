import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import {
  getGlbContract,
  readGlb,
  sha256File,
} from "../shell/glb.mjs";
import { assertSemanticVersion, getReleaseTag } from "./release-policy.mjs";

const SCRIPT_DIRECTORY = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(SCRIPT_DIRECTORY, "../..");

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

export const validateReleaseDirectory = async (
  releaseDirectory,
  version,
  options = {},
) => {
  assertSemanticVersion(version);
  const glbPath = path.join(releaseDirectory, "identity-shell.glb");
  const blendPath = path.join(
    releaseDirectory,
    "source/identity-shell.blend",
  );
  const manifestPath = path.join(releaseDirectory, "manifest.json");
  const checksumsPath = path.join(releaseDirectory, "checksums.json");
  const validationPath = path.join(releaseDirectory, "validation.json");
  const reviewPath = path.join(releaseDirectory, "model-lab-review.json");
  const sourceCandidatePath = path.join(
    releaseDirectory,
    "source-candidate.json",
  );
  const productionValidationPath = path.join(
    releaseDirectory,
    "production-validation.json",
  );
  const productionValidationPromise =
    options.requireProductionValidation === false
      ? Promise.resolve(undefined)
      : readJson(productionValidationPath);
  const [
    glb,
    manifest,
    checksums,
    validation,
    review,
    sourceCandidate,
    productionValidation,
    glbSha256,
    blendSha256,
  ] = await Promise.all([
      readGlb(glbPath),
      readJson(manifestPath),
      readJson(checksumsPath),
      readJson(validationPath),
      readJson(reviewPath),
      readJson(sourceCandidatePath),
      productionValidationPromise,
      sha256File(glbPath),
      sha256File(blendPath),
    ]);
  const contract = getGlbContract(glb, manifest.meshName);

  assertEqual(manifest.version, version, "Manifest release version");
  assertEqual(manifest.releaseTag, getReleaseTag(version), "Release tag");
  assertEqual(manifest.sha256, glbSha256, "Manifest GLB checksum");
  assertEqual(
    manifest.source.blendSha256,
    blendSha256,
    "Manifest Blender checksum",
  );
  assertEqual(
    checksums.files["identity-shell.glb"],
    glbSha256,
    "Checksums GLB entry",
  );
  assertEqual(
    checksums.files["source/identity-shell.blend"],
    blendSha256,
    "Checksums Blender entry",
  );
  assertEqual(contract.meshName, manifest.meshName, "Mesh name");
  assertEqual(
    [contract.materialName],
    manifest.materialNames,
    "Material names",
  );
  assertEqual(
    contract.morphTargetNames,
    manifest.morphTargetNames,
    "Ordered morph names",
  );
  assertEqual(
    contract.topologyHash.length,
    64,
    "Topology checksum length",
  );
  assert(
    manifest.url.includes(`/${version}/`) &&
      manifest.url.endsWith("/identity-shell.glb"),
    "Manifest URL must be immutable and versioned.",
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
    validation.globalAssetSafetyValidation.invertedStateCount === 0,
    "Release contains inverted morph states.",
  );
  assert(
    validation.globalAssetSafetyValidation.degenerateStateCount === 0,
    "Release contains degenerate morph states.",
  );
  assert(review.results.passed, "Model Lab review did not pass.");
  assertEqual(
    sourceCandidate.candidate,
    manifest.source.candidate,
    "Source candidate",
  );
  assertEqual(
    sourceCandidate.glbSha256,
    glbSha256,
    "Source candidate GLB checksum",
  );
  assertEqual(
    sourceCandidate.blendSha256,
    blendSha256,
    "Source candidate Blender checksum",
  );
  if (productionValidation) {
    assert(
      productionValidation.passed && productionValidation.runs === 1,
      "Production-path validation must pass exactly once during promotion.",
    );
    assertEqual(
      productionValidation.glbSha256,
      glbSha256,
      "Production validation GLB checksum",
    );
    assertEqual(
      productionValidation.blendSha256,
      blendSha256,
      "Production validation Blender checksum",
    );
  }

  return {
    passed: true,
    version,
    releaseTag: manifest.releaseTag,
    glbSha256,
    blendSha256,
    contract,
    localRegressionValidation: "passed",
    globalAssetSafetyValidation: {
      status: "passed",
      sampledStates:
        validation.globalAssetSafetyValidation.sampledStates,
      invertedStates: 0,
      degenerateStates: 0,
    },
    modelLabReview: "passed",
  };
};

if (pathToFileURL(process.argv[1]).href === import.meta.url) {
  const version = process.argv.at(-1);
  assert(version, "Expected an asset version.");
  const releaseDirectory = path.join(
    PROJECT_ROOT,
    "assets/releases/identity-shell",
    version,
  );
  console.log(
    JSON.stringify(
      await validateReleaseDirectory(releaseDirectory, version),
      null,
      2,
    ),
  );
}

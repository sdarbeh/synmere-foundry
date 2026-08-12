import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { assertPromotableAssetPromotionRecord } from "./asset-promotion-record.mjs";
import {
  assertFoundryAssetStage,
  assertFoundryAssetValidationStatus,
  assertKnownFoundryAssetMetadata,
} from "./asset-stage.mjs";
import { assertFoundryAssetVariants } from "./asset-variant.mjs";
import { getGlbContract, readGlb, sha256File } from "../shell/glb.mjs";
import { assertSemanticVersion, getReleaseTag } from "./release-policy.mjs";

const SCRIPT_DIRECTORY = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(SCRIPT_DIRECTORY, "../..");

const readJson = async (filePath) => {
  return JSON.parse(await readFile(filePath, "utf8"));
};

const readOptionalJson = async (filePath) => {
  try {
    return await readJson(filePath);
  } catch (error) {
    if (error.code === "ENOENT") {
      return undefined;
    }
    throw error;
  }
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
  const blendPath = path.join(releaseDirectory, "source/identity-shell.blend");
  const manifestPath = path.join(releaseDirectory, "manifest.json");
  const manifest = await readJson(manifestPath);
  const usesBlenderSource = Boolean(manifest.source?.blendSha256);
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
  const promotionRecordPath = path.join(
    releaseDirectory,
    "promotion-record.json",
  );
  const moduleManifestPath = path.join(
    releaseDirectory,
    "module-manifest.json",
  );
  const productionValidationPromise =
    options.requireProductionValidation === false
      ? Promise.resolve(undefined)
      : readJson(productionValidationPath);
  const promotionRecordPromise =
    options.requirePromotionRecord === false
      ? readOptionalJson(promotionRecordPath)
      : readJson(promotionRecordPath);
  const [
    glb,
    checksums,
    validation,
    review,
    sourceCandidate,
    productionValidation,
    promotionRecord,
    moduleManifest,
    glbSha256,
    blendSha256,
  ] = await Promise.all([
    readGlb(glbPath),
    readJson(checksumsPath),
    readJson(validationPath),
    readJson(reviewPath),
    readJson(sourceCandidatePath),
    productionValidationPromise,
    promotionRecordPromise,
    readJson(moduleManifestPath),
    sha256File(glbPath),
    usesBlenderSource ? sha256File(blendPath) : Promise.resolve(undefined),
  ]);
  const contract = getGlbContract(glb, manifest.meshName);

  for (const [relativePath, expectedSha256] of Object.entries(
    checksums.files,
  )) {
    assertEqual(
      await sha256File(path.join(releaseDirectory, relativePath)),
      expectedSha256,
      `Checksums entry ${relativePath}`,
    );
  }

  assertFoundryAssetVariants(manifest, {
    parameterPresetIds: moduleManifest.presets.shape.map(
      (preset) => preset.id,
    ),
  });
  assertEqual(
    moduleManifest.asset.displayName,
    manifest.displayName,
    "Module display name",
  );

  assertEqual(manifest.version, version, "Manifest release version");
  assert(
    typeof manifest.displayName === "string" && manifest.displayName.length > 0,
    "Manifest display name is required.",
  );
  assertEqual(manifest.releaseTag, getReleaseTag(version), "Release tag");
  assertFoundryAssetStage(manifest.stage);
  assertEqual(manifest.stage, "production", "Manifest asset stage");
  assertFoundryAssetValidationStatus(manifest.validation?.status);
  assertKnownFoundryAssetMetadata({
    stage: manifest.stage,
    label: "Release manifest source",
    metadata: {
      sourceSha256:
        manifest.source?.blendSha256 ?? manifest.source?.artifact?.sha256,
      candidate: manifest.source?.candidate,
      revision: manifest.source?.revision,
    },
  });
  assertEqual(manifest.sha256, glbSha256, "Manifest GLB checksum");
  if (usesBlenderSource) {
    assertEqual(
      manifest.source.blendSha256,
      blendSha256,
      "Manifest Blender checksum",
    );
  } else {
    assert(manifest.source?.artifact, "Release source artifact is required.");
    assert(
      manifest.source.artifact.tracked === false,
      "Licensed source artifacts must remain local and untracked.",
    );
  }
  assertEqual(
    checksums.files["identity-shell.glb"],
    glbSha256,
    "Checksums GLB entry",
  );
  if (usesBlenderSource) {
    assertEqual(
      checksums.files["source/identity-shell.blend"],
      blendSha256,
      "Checksums Blender entry",
    );
  }
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
  assertEqual(contract.topologyHash.length, 64, "Topology checksum length");
  assertEqual(
    manifest.url,
    `/models/shell/identity-shell/${version}/identity-shell.glb`,
    "Manifest public GLB URL",
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
  if (usesBlenderSource) {
    assertEqual(
      sourceCandidate.blendSha256,
      blendSha256,
      "Source candidate Blender checksum",
    );
  } else {
    assertEqual(
      sourceCandidate.sourceArtifactSha256,
      manifest.source.artifact.sha256,
      "Source candidate artifact checksum",
    );
  }
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
    if (usesBlenderSource) {
      assertEqual(
        productionValidation.blendSha256,
        blendSha256,
        "Production validation Blender checksum",
      );
    } else {
      assertEqual(
        productionValidation.sourceArtifactSha256,
        manifest.source.artifact.sha256,
        "Production validation source artifact checksum",
      );
    }
  }
  if (promotionRecord) {
    assertPromotableAssetPromotionRecord(promotionRecord);
    assertEqual(
      promotionRecord.version.stage,
      manifest.stage,
      "Promotion record asset stage",
    );
    assertEqual(
      promotionRecord.asset.displayName,
      manifest.displayName,
      "Promotion record display name",
    );
    assertEqual(
      promotionRecord.files.productionGlbHash,
      glbSha256,
      "Promotion record production GLB checksum",
    );
    if (usesBlenderSource) {
      assertEqual(
        promotionRecord.files.sourceBlendHash,
        blendSha256,
        "Promotion record source Blender checksum",
      );
    } else {
      assertEqual(
        promotionRecord.files.sourceArtifact,
        manifest.source.artifact,
        "Promotion record source artifact",
      );
    }
    assertEqual(
      promotionRecord.contract.topologyHash,
      contract.topologyHash,
      "Promotion record topology checksum",
    );
  }

  return {
    passed: true,
    version,
    releaseTag: manifest.releaseTag,
    glbSha256,
    blendSha256,
    sourceArtifact: manifest.source.artifact,
    contract,
    localRegressionValidation: "passed",
    globalAssetSafetyValidation: {
      status: "passed",
      sampledStates: validation.globalAssetSafetyValidation.sampledStates,
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

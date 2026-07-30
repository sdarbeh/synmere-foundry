import { assertFoundryAssetStage } from "./asset-stage.mjs";

export const ASSET_PROMOTION_SCHEMA_VERSION = "asset-promotion-v1";

const assert = (condition, message) => {
  if (!condition) {
    throw new Error(message);
  }
};

const isNonEmptyString = (value) => {
  return typeof value === "string" && value.trim().length > 0;
};

const readArguments = (name) => {
  const values = [];
  process.argv.forEach((argument, index) => {
    if (argument === name && process.argv[index + 1]) {
      values.push(process.argv[index + 1]);
    }
  });
  return values;
};

const deriveApprovedViews = (review) => {
  const scopedViews = [
    ...(review.reviewScope?.displayModes ?? []),
    ...(review.reviewScope?.materials ?? []),
    ...(review.reviewScope?.cameraViews ?? []),
  ];
  if (scopedViews.length > 0) {
    return scopedViews;
  }

  const screenshotViews = (review.screenshotPaths ?? []).map((screenshot) => {
    const fileName = screenshot.split("/").at(-1) ?? screenshot;
    return fileName
      .replace(/^model-lab-candidate-/u, "")
      .replace(/\.png$/u, "");
  });
  if (screenshotViews.length > 0) {
    return screenshotViews;
  }

  return [];
};

const deriveReleaseNotes = (manifest, review) => {
  const changesFromArgs = readArguments("--change");
  const knownIssuesFromArgs = readArguments("--known-issue");
  const approvedViewsFromArgs = readArguments("--approved-view");
  const summary = process.argv.includes("--summary")
    ? process.argv[process.argv.indexOf("--summary") + 1]
    : manifest.releaseMetadata?.intent;

  return {
    summary: summary ?? "",
    changes:
      changesFromArgs.length > 0
        ? changesFromArgs
        : [
            manifest.releaseMetadata?.intent,
            manifest.releaseMetadata?.classification
              ? `Release classification: ${manifest.releaseMetadata.classification}.`
              : undefined,
          ].filter(isNonEmptyString),
    knownIssues:
      knownIssuesFromArgs.length > 0
        ? knownIssuesFromArgs
        : (manifest.releaseMetadata?.excludedWork ?? []).map(
            (item) => `Excluded from this release: ${item}.`,
          ),
    approvedViews:
      approvedViewsFromArgs.length > 0
        ? approvedViewsFromArgs
        : deriveApprovedViews(review),
  };
};

export const buildIdentityShellPromotionRecord = ({
  version,
  manifest,
  validation,
  review,
  productionValidation,
  glbSha256,
  blendSha256,
  productionGlbSha256,
  candidateGlbPath = "assets/candidates/current/identity-shell-v1.glb",
  promotedBy = process.env.USER ?? "Synmere Foundry",
}) => {
  const contract =
    productionValidation.contract ??
    validation.localRegressionValidation?.contract;
  assert(contract, "Promotion record requires contract metadata.");

  const maxMorphEdgeStrain =
    validation.globalAssetSafetyValidation?.maximumMorphEdgeStrain ??
    validation.localRegressionValidation?.maximumMorphEdgeStrain ??
    productionValidation.globalAssetSafetyValidation?.maximumMorphEdgeStrain ??
    0;
  const maxAllowedMorphEdgeStrain =
    validation.globalAssetSafetyValidation?.strainLimit ?? maxMorphEdgeStrain;
  const testsPassed =
    (validation.globalAssetSafetyValidation?.sampledStates ?? 0) +
    (review.results?.screenshotCount ?? 0) +
    (review.results?.passed ? 1 : 0);
  const testsFailed =
    (validation.globalAssetSafetyValidation?.failures?.length ?? 0) +
    (validation.globalAssetSafetyValidation?.strainFailures?.length ?? 0) +
    (validation.globalAssetSafetyValidation?.invertedStateCount ?? 0) +
    (validation.globalAssetSafetyValidation?.degenerateStateCount ?? 0) +
    (review.errors?.length ?? 0) +
    (review.results?.passed ? 0 : 1);

  return {
    id: `identity-shell-v${version}-production`,
    asset: {
      name: "identity-shell",
      displayName: "Identity Shell",
      type: "glb",
      domain: "shell",
      module: "identity-shell",
    },
    version: {
      version,
      stage: "production",
      promotedAt: manifest.releasedAt,
      promotedBy,
    },
    files: {
      sourceBlendPath: `assets/releases/identity-shell/${version}/source/identity-shell.blend`,
      productionGlbPath: `assets/releases/identity-shell/${version}/identity-shell.glb`,
      candidateGlbPath,
      sourceBlendHash: blendSha256,
      candidateGlbHash: glbSha256,
      productionGlbHash: productionGlbSha256,
    },
    contract: {
      meshName: contract.meshName,
      materialSlot: contract.materialName,
      vertexCount: contract.vertexCount,
      indexCount: contract.indexCount,
      topologyHash: contract.topologyHash,
      morphTargetCount: contract.morphTargetCount,
      morphTargetNames: contract.morphTargetNames,
    },
    validation: {
      contractPassed: Boolean(validation.localRegressionValidation?.passed),
      morphValidationPassed: Boolean(
        validation.globalAssetSafetyValidation?.passed,
      ),
      maxMorphEdgeStrain,
      maxAllowedMorphEdgeStrain,
      testsPassed,
      testsFailed,
      validationReportPath: `assets/releases/identity-shell/${version}/validation.json`,
      reviewManifestPath: `assets/releases/identity-shell/${version}/model-lab-review.json`,
    },
    releaseNotes: deriveReleaseNotes(manifest, review),
    compatibility: {
      faceShellParameterVersion: manifest.assetSchemaVersion,
      rendererVersion: manifest.rendererCompatibilityVersion,
      schemaVersion: ASSET_PROMOTION_SCHEMA_VERSION,
    },
  };
};

export const assertPromotableAssetPromotionRecord = (record) => {
  assert(isNonEmptyString(record.id), "Promotion record id is required.");
  assertFoundryAssetStage(record.version?.stage);
  assert(
    record.version?.stage === "production",
    "Promotion record must target the production stage.",
  );
  assert(
    isNonEmptyString(record.version?.promotedAt),
    "Promotion timestamp is required.",
  );
  assert(
    isNonEmptyString(record.files?.candidateGlbHash),
    "Promotion requires a candidate GLB hash.",
  );
  assert(
    isNonEmptyString(record.files?.productionGlbHash),
    "Promotion requires a production GLB hash computed after promotion.",
  );
  assert(
    record.validation?.contractPassed === true,
    "Promotion requires passing contract validation.",
  );
  assert(
    record.validation?.morphValidationPassed === true,
    "Promotion requires passing morph validation.",
  );
  assert(
    record.validation.maxMorphEdgeStrain <=
      record.validation.maxAllowedMorphEdgeStrain,
    "Promotion morph edge strain exceeds the allowed limit.",
  );
  assert(
    record.validation.testsFailed === 0,
    "Promotion cannot complete with failed validation/browser checks.",
  );
  assert(
    record.validation.testsPassed > 0,
    "Promotion requires passing validation/browser checks.",
  );
  assert(
    isNonEmptyString(record.releaseNotes?.summary),
    "Promotion requires release note summary.",
  );
  assert(
    Array.isArray(record.releaseNotes?.changes) &&
      record.releaseNotes.changes.length > 0 &&
      record.releaseNotes.changes.every(isNonEmptyString),
    "Promotion requires release note changes.",
  );
  assert(
    Array.isArray(record.releaseNotes?.knownIssues) &&
      record.releaseNotes.knownIssues.every(isNonEmptyString),
    "Promotion known issues must be valid release note strings.",
  );
  assert(
    Array.isArray(record.releaseNotes?.approvedViews) &&
      record.releaseNotes.approvedViews.length > 0 &&
      record.releaseNotes.approvedViews.every(isNonEmptyString),
    "Promotion requires approved review views.",
  );
  assert(
    record.compatibility?.schemaVersion === ASSET_PROMOTION_SCHEMA_VERSION,
    "Promotion record schema version is invalid.",
  );
};

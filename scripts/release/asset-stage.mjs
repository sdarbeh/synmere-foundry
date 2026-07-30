export const FOUNDRY_ASSET_STAGES = Object.freeze([
  "dev",
  "candidate",
  "production",
]);

export const FOUNDRY_ASSET_VALIDATION_STATUSES = Object.freeze([
  "blocked",
  "needs-review",
  "passed",
]);

const UNKNOWN_METADATA_VALUE = "unknown";

export const assertFoundryAssetStage = (stage) => {
  if (!FOUNDRY_ASSET_STAGES.includes(stage)) {
    throw new Error(`Foundry asset stage is invalid: ${String(stage)}.`);
  }
};

export const assertFoundryAssetValidationStatus = (status) => {
  if (!FOUNDRY_ASSET_VALIDATION_STATUSES.includes(status)) {
    throw new Error(
      `Foundry asset validation status is invalid: ${String(status)}.`,
    );
  }
};

export const assertKnownFoundryAssetMetadata = ({
  stage,
  metadata,
  label = "Foundry asset metadata",
}) => {
  assertFoundryAssetStage(stage);

  Object.entries(metadata).forEach(([key, value]) => {
    if (typeof value !== "string" || value.trim().length === 0) {
      throw new Error(`${label}.${key} is required.`);
    }

    if (
      stage !== "dev" &&
      value.trim().toLowerCase() === UNKNOWN_METADATA_VALUE
    ) {
      throw new Error(
        `${label}.${key} must be known before ${stage} asset visibility.`,
      );
    }
  });
};

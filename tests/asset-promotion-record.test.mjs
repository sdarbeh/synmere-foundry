import assert from "node:assert/strict";
import test from "node:test";

import {
  assertPromotableAssetPromotionRecord,
  buildIdentityShellPromotionRecord,
} from "../scripts/release/asset-promotion-record.mjs";
import {
  getAssetPromotionHistory,
  getLatestProductionAssetPromotion,
  upsertAssetPromotionRecord,
} from "../scripts/release/asset-promotion-registry.mjs";

const createPromotionFixture = () => {
  const manifest = {
    assetSchemaVersion: "1.0.0",
    rendererCompatibilityVersion: "1.0.0",
    releasedAt: "2026-07-24T17:10:54.191Z",
    releaseMetadata: {
      classification: "patch",
      intent: "Tighten shell morphology for promotion.",
      excludedWork: ["materials"],
    },
  };
  const validation = {
    localRegressionValidation: {
      passed: true,
      contract: {
        meshName: "IdentityShell",
        materialName: "IdentityCeramic",
        vertexCount: 6052,
        indexCount: 36300,
        topologyHash:
          "da73385507a48e1bff2430b5ce03a94875aa28e53ce445142188e2e0d4d3d181",
        morphTargetCount: 1,
        morphTargetNames: ["identity_face_wide"],
      },
    },
    globalAssetSafetyValidation: {
      passed: true,
      sampledStates: 193,
      invertedStateCount: 0,
      degenerateStateCount: 0,
      maximumMorphEdgeStrain: 0.72,
      strainLimit: 0.72,
      failures: [],
      strainFailures: [],
    },
  };
  const review = {
    results: {
      passed: true,
      screenshotCount: 3,
    },
    errors: [],
    screenshotPaths: [
      "assets/candidates/current/review/model-lab-candidate-preview.png",
      "assets/candidates/current/review/model-lab-candidate-trace.png",
    ],
  };
  const productionValidation = {
    contract: validation.localRegressionValidation.contract,
  };

  return {
    version: "1.0.0",
    manifest,
    validation,
    review,
    productionValidation,
    glbSha256: "candidate-hash",
    blendSha256: "blend-hash",
    productionGlbSha256: "production-hash",
  };
};

test("builds a promotable identity shell asset promotion record", () => {
  const record = buildIdentityShellPromotionRecord(createPromotionFixture());

  assert.equal(record.asset.name, "identity-shell");
  assert.equal(record.version.releaseChannel, "production");
  assert.equal(record.files.candidateGlbHash, "candidate-hash");
  assert.equal(record.files.productionGlbHash, "production-hash");
  assert.equal(
    record.releaseNotes.summary,
    "Tighten shell morphology for promotion.",
  );
  assert.doesNotThrow(() => assertPromotableAssetPromotionRecord(record));
});

test("refuses promotion records without release notes", () => {
  const fixture = createPromotionFixture();
  fixture.manifest.releaseMetadata.intent = "";
  const record = buildIdentityShellPromotionRecord(fixture);

  assert.throws(() => assertPromotableAssetPromotionRecord(record), /summary/u);
});

test("orders asset promotion history newest first", () => {
  const olderRecord = buildIdentityShellPromotionRecord({
    ...createPromotionFixture(),
    version: "0.9.0",
  });
  const newerRecord = buildIdentityShellPromotionRecord({
    ...createPromotionFixture(),
    version: "1.0.0",
    manifest: {
      ...createPromotionFixture().manifest,
      releasedAt: "2026-07-25T00:14:03.122Z",
    },
  });

  const promotions = upsertAssetPromotionRecord([olderRecord], newerRecord);
  const history = getAssetPromotionHistory(promotions, "identity-shell");

  assert.deepEqual(
    history.map((promotion) => promotion.version.version),
    ["1.0.0", "0.9.0"],
  );
  assert.equal(
    getLatestProductionAssetPromotion(promotions, "identity-shell"),
    newerRecord,
  );
});

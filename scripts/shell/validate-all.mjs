import { readFile, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

import {
  CANDIDATE_MANIFEST_PATH,
  CANDIDATE_VALIDATION_PATH,
  SHELL_ASSET_PIPELINE_VERSION,
} from "./asset-paths.mjs";
import { validateCandidate } from "./validate-candidate.mjs";
import { validateMorphSafety } from "./validate-morph-safety.mjs";

export const validateAll = async () => {
  const [candidateManifest, contract, morph] = await Promise.all([
    readFile(CANDIDATE_MANIFEST_PATH, "utf8").then(JSON.parse),
    validateCandidate(),
    validateMorphSafety(),
  ]);
  const report = {
    schemaVersion: SHELL_ASSET_PIPELINE_VERSION,
    validatedAt: new Date().toISOString(),
    candidateSha256: contract.candidateSha256,
    sourceBlendSha256: contract.sourceBlendSha256,
    blenderVersion: candidateManifest.blenderVersion,
    localRegressionValidation: {
      passed: contract.valid,
      contract: contract.contract,
      maximumMorphEdgeStrain: contract.maximumMorphEdgeStrain,
    },
    globalAssetSafetyValidation: morph,
    decision: {
      passed: contract.valid && morph.passed,
      promotionApproved: false,
    },
  };
  await writeFile(
    CANDIDATE_VALIDATION_PATH,
    `${JSON.stringify(report, null, 2)}\n`,
  );
  return report;
};

if (pathToFileURL(process.argv[1]).href === import.meta.url) {
  console.log(JSON.stringify(await validateAll(), null, 2));
}

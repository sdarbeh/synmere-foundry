import { copyFile, readFile, writeFile } from "node:fs/promises";

import {
  CANDIDATE_GLB_PATH,
  CANDIDATE_REVIEW_PATH,
  PRODUCTION_GLB_PATH,
  RELEASE_MANIFEST_PATH,
  SHELL_ASSET_PIPELINE_VERSION,
} from "./asset-paths.mjs";
import { validateCandidate } from "./validate-candidate.mjs";

if (!process.argv.includes("--confirm")) {
  throw new Error(
    "Promotion requires explicit confirmation: pnpm asset:shell:promote -- --confirm",
  );
}

const validation = await validateCandidate();
const review = JSON.parse(await readFile(CANDIDATE_REVIEW_PATH, "utf8"));
if (
  review.validation !== "passed" ||
  review.candidateSha256 !== validation.candidateSha256
) {
  throw new Error(
    "The visual approval does not match the currently validated candidate.",
  );
}

await copyFile(CANDIDATE_GLB_PATH, PRODUCTION_GLB_PATH);
const release = {
  schemaVersion: SHELL_ASSET_PIPELINE_VERSION,
  productionSha256: validation.candidateSha256,
  sourceBlendSha256: validation.sourceBlendSha256,
  validated: true,
  reviewedAt: review.approvedAt,
  promotedAt: new Date().toISOString(),
};
await writeFile(RELEASE_MANIFEST_PATH, `${JSON.stringify(release, null, 2)}\n`);
console.log(JSON.stringify(release, null, 2));

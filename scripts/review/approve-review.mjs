import { readFile, writeFile } from "node:fs/promises";

import {
  CANDIDATE_GLB_PATH,
  CANDIDATE_REVIEW_PATH,
} from "../shell/asset-paths.mjs";
import { sha256File } from "../shell/glb.mjs";

if (!process.argv.includes("--confirm")) {
  throw new Error("Review approval requires --confirm.");
}

const [review, candidateSha256] = await Promise.all([
  readFile(CANDIDATE_REVIEW_PATH, "utf8").then(JSON.parse),
  sha256File(CANDIDATE_GLB_PATH),
]);
if (!review.results?.passed || review.candidateSha256 !== candidateSha256) {
  throw new Error("The complete review package is missing, failed, or stale.");
}

const approvedReview = {
  ...review,
  promotionApproved: true,
  approvedAt: new Date().toISOString(),
};
await writeFile(
  CANDIDATE_REVIEW_PATH,
  `${JSON.stringify(approvedReview, null, 2)}\n`,
);
console.log(
  JSON.stringify(
    {
      approved: true,
      candidateSha256,
      reviewManifest: CANDIDATE_REVIEW_PATH,
      promoted: false,
    },
    null,
    2,
  ),
);

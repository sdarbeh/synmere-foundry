import { readFile, writeFile } from "node:fs/promises";

import {
  CANDIDATE_GLB_PATH,
  CANDIDATE_MANIFEST_PATH,
  CANDIDATE_MODULE_MANIFEST_PATH,
  CANDIDATE_REVIEW_PATH,
} from "../shell/asset-paths.mjs";
import { sha256File } from "../shell/glb.mjs";
import { validateCandidate } from "../shell/validate-candidate.mjs";

const readArgument = (name) => {
  const index = process.argv.indexOf(name);
  return index === -1 ? undefined : process.argv[index + 1];
};

const candidateUrl =
  readArgument("--candidate-url") ??
  process.env.SYNMERE_SHELL_LAB_CANDIDATE_URL;
const candidateManifestUrl =
  readArgument("--candidate-manifest-url") ??
  process.env.SYNMERE_SHELL_LAB_CANDIDATE_MANIFEST_URL;
const candidateModuleUrl =
  readArgument("--candidate-module-url") ??
  process.env.SYNMERE_SHELL_LAB_CANDIDATE_MODULE_URL;
const reviewEvidencePath = readArgument("--review-evidence");
const validation = await validateCandidate();

if (reviewEvidencePath) {
  const review = JSON.parse(await readFile(reviewEvidencePath, "utf8"));
  if (
    !review.results?.passed ||
    review.candidateSha256 !== validation.candidateSha256
  ) {
    throw new Error(
      "Product Model Lab evidence does not match the validated candidate.",
    );
  }
  await writeFile(
    CANDIDATE_REVIEW_PATH,
    `${JSON.stringify(review, null, 2)}\n`,
  );
  console.log(JSON.stringify(review, null, 2));
  process.exit(0);
}

if (!candidateUrl) {
  throw new Error(
    "Provide --candidate-url or SYNMERE_SHELL_LAB_CANDIDATE_URL.",
  );
}
if (!candidateManifestUrl) {
  throw new Error(
    "Provide --candidate-manifest-url or SYNMERE_SHELL_LAB_CANDIDATE_MANIFEST_URL.",
  );
}
if (!candidateModuleUrl) {
  throw new Error(
    "Provide --candidate-module-url or SYNMERE_SHELL_LAB_CANDIDATE_MODULE_URL.",
  );
}
const handoff = {
  schemaVersion: "v1",
  candidateUrl,
  candidateManifestUrl,
  candidateModuleUrl,
  candidateSha256: await sha256File(CANDIDATE_GLB_PATH),
  candidateManifestSha256: await sha256File(CANDIDATE_MANIFEST_PATH),
  candidateModuleSha256: await sha256File(CANDIDATE_MODULE_MANIFEST_PATH),
  validation: "passed",
  instructions: [
    "Set SYNMERE_SHELL_LAB_CANDIDATE_URL to candidateUrl in the Synmere repository.",
    "Set SYNMERE_SHELL_LAB_CANDIDATE_MANIFEST_URL to candidateManifestUrl in the Synmere repository.",
    "Set SYNMERE_SHELL_LAB_CANDIDATE_MODULE_URL to candidateModuleUrl in the Synmere repository.",
    "Run the Synmere Model Lab Preview, Trace, Topology, and console checks.",
    "Return signed review evidence containing this candidateSha256.",
  ],
};
await writeFile(
  CANDIDATE_REVIEW_PATH,
  `${JSON.stringify(handoff, null, 2)}\n`,
);
console.log(JSON.stringify(handoff, null, 2));

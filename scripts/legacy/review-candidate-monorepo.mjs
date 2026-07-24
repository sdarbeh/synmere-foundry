import { spawnSync } from "node:child_process";
import { writeFile } from "node:fs/promises";

import {
  CANDIDATE_REVIEW_PORT,
  CANDIDATE_REVIEW_PATH,
  SHELL_ASSET_PIPELINE_VERSION,
} from "./asset-paths.mjs";
import { validateCandidate } from "./validate-candidate.mjs";

const validation = await validateCandidate();
const approved = process.argv.includes("--approve");
const checklistOnly = process.argv.includes("--checklist");
const candidateReviewPorts = [CANDIDATE_REVIEW_PORT, "3000", "3001"].filter(
  (port, index, ports) => {
    return ports.indexOf(port) === index;
  },
);
const activeReviewPort = approved
  ? undefined
  : await candidateReviewPorts.reduce(async (activePort, port) => {
      const resolvedPort = await activePort;
      if (resolvedPort) {
        return resolvedPort;
      }
      try {
        const response = await fetch(`http://127.0.0.1:${port}/dev/model-lab`, {
          method: "HEAD",
          signal: AbortSignal.timeout(500),
        });
        return response.ok ? port : undefined;
      } catch {
        return undefined;
      }
    }, Promise.resolve(undefined));
const reviewPort = activeReviewPort ?? CANDIDATE_REVIEW_PORT;
const reviewMatrix = [
  "Raw Neutral · Front",
  "Raw Neutral · Left 3/4",
  "Raw Neutral · Right 3/4",
  "Raw Neutral · Shallow profile",
  "Raw Neutral · Topology front",
  "Product Baseline · Front",
  "Product Baseline · Left 3/4",
  "Product Baseline · Right 3/4",
  "Product Baseline · Shallow profile",
  "Product Baseline · Topology front",
  "All identity morphs · 0 / 0.5 / 1 / configured maximum",
  "presentation_structure_structured",
  "presentation_structure_soft",
  "corrective_jaw_wide_chin_long",
];

if (!approved) {
  console.log(
    JSON.stringify(
      {
        candidateSha256: validation.candidateSha256,
        validation: "passed",
        approvalRecorded: false,
        instruction: checklistOnly
          ? "Complete the visual matrix, then rerun with: pnpm asset:shell:review -- --approve"
          : `Review http://127.0.0.1:${reviewPort}/dev/model-lab?asset=candidate, then rerun with --approve.`,
        reviewMatrix,
      },
      null,
      2,
    ),
  );
  if (checklistOnly) {
    process.exit(0);
  }
  if (activeReviewPort) {
    process.exit(0);
  }

  const result = spawnSync(
    "pnpm",
    ["dev", "--hostname", "127.0.0.1", "--port", reviewPort],
    {
      stdio: "inherit",
      env: {
        ...process.env,
        MODEL_LAB_ENABLED: "true",
        SYNMERE_ASSET_REVIEW_ENABLED: "true",
      },
    },
  );
  if (result.error) {
    throw result.error;
  }
  process.exit(result.status ?? 0);
}

const review = {
  schemaVersion: SHELL_ASSET_PIPELINE_VERSION,
  candidateSha256: validation.candidateSha256,
  sourceBlendSha256: validation.sourceBlendSha256,
  approvedAt: new Date().toISOString(),
  validation: "passed",
  reviewMatrix,
};
await writeFile(CANDIDATE_REVIEW_PATH, `${JSON.stringify(review, null, 2)}\n`);
console.log(JSON.stringify(review, null, 2));

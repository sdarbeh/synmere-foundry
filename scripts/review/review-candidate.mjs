import { spawn } from "node:child_process";
import { mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  CANDIDATE_GLB_PATH,
  CANDIDATE_MANIFEST_PATH,
  CANDIDATE_REVIEW_DIRECTORY,
  CANDIDATE_REVIEW_PATH,
  CANDIDATE_VALIDATION_PATH,
  PRODUCTION_GLB_PATH,
  SHELL_ASSET_PIPELINE_VERSION,
  SOURCE_BLEND_PATH,
} from "../shell/asset-paths.mjs";
import { sha256File } from "../shell/glb.mjs";
import { startCandidateServer } from "./serve-candidate.mjs";

const SCRIPT_DIRECTORY = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(SCRIPT_DIRECTORY, "../..");
const SYNMERE_ROOT =
  process.env.SYNMERE_PRODUCT_ROOT ?? path.resolve(PROJECT_ROOT, "../synmere");
const REVIEW_ROUTE = "/dev/model-lab?asset=candidate";
const EXPORT_SCRIPT = path.join(
  PROJECT_ROOT,
  "scripts/shell/export-candidate.mjs",
);
const VALIDATION_SCRIPT = path.join(
  PROJECT_ROOT,
  "scripts/shell/validate-all.mjs",
);
const NEXT_CLI = path.join(SYNMERE_ROOT, "node_modules/next/dist/bin/next");
const PLAYWRIGHT_CLI = path.join(
  SYNMERE_ROOT,
  "node_modules/@playwright/test/cli.js",
);
const PRODUCT_DIST_DIRECTORY_NAME = ".next-shell-review";
const PRODUCT_DIST_DIRECTORY = path.join(
  SYNMERE_ROOT,
  PRODUCT_DIST_DIRECTORY_NAME,
);
const KEEP_OPEN =
  process.argv.includes("--keep-open") ||
  (!process.argv.includes("--no-keep-open") &&
    process.stdout.isTTY &&
    !process.env.CI);

const status = {
  export: "pending",
  validation: "pending",
  morphValidation: "pending",
  browserChecks: "pending",
  productionGuard: "pending",
};
const errors = [];
let candidateServer;
let productServer;
let candidateManifest;
let validationReport;
let reviewDirectory;
let modelLabUrl;
let screenshotPaths = [];

const getCommandOutput = (command, args, options = {}) => {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      ...options,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", (error) => {
      resolve({ code: 1, stdout, stderr: `${stderr}${error.message}` });
    });
    child.on("close", (code) => {
      resolve({ code: code ?? 1, stdout, stderr });
    });
  });
};

const runPhase = async (step, label, command, args, options) => {
  process.stdout.write(`[${step}/5] ${label}... `);
  const result = await getCommandOutput(command, args, options);
  if (result.code !== 0) {
    console.log("FAILED");
    const details = [result.stdout, result.stderr]
      .filter((output) => output.trim())
      .join("\n")
      .trim();
    throw new Error(
      `${label} failed${details ? `:\n${details.slice(-4000)}` : "."}`,
    );
  }
  console.log("passed");
  return result;
};

const reservePort = async () => {
  const server = net.createServer();
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  if (!address || typeof address === "string") {
    server.close();
    throw new Error("Unable to reserve a local Model Lab port.");
  }
  const port = address.port;
  await new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
  return port;
};

const waitForUrl = async (url, child, timeoutMs = 60_000) => {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error("Synmere Model Lab stopped before becoming ready.");
    }
    try {
      const response = await fetch(url, {
        signal: AbortSignal.timeout(1_000),
      });
      if (response.ok) {
        return;
      }
    } catch {
      // The development server is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`Timed out waiting for ${url}.`);
};

const stopChildProcess = async (child) => {
  if (!child || child.exitCode !== null || child.pid === undefined) {
    return;
  }
  child.kill("SIGTERM");
  await Promise.race([
    new Promise((resolve) => child.once("close", resolve)),
    new Promise((resolve) => setTimeout(resolve, 3_000)),
  ]);
};

const stopReviewServices = async () => {
  await stopChildProcess(productServer);
  await rm(PRODUCT_DIST_DIRECTORY, { recursive: true, force: true });
  if (candidateServer) {
    await candidateServer.close();
  }
};

const waitForManualShutdown = () => {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (reason) => {
      if (settled) {
        return;
      }
      settled = true;
      resolve(reason);
    };
    const handleInterrupt = () => finish("interrupt");
    const handleTerminate = () => finish("terminate");
    process.once("SIGINT", handleInterrupt);
    process.once("SIGTERM", handleTerminate);
    productServer.once("close", () => finish("server-exit"));
  });
};

const recordFailure = (phase, error) => {
  status[phase] = "failed";
  errors.push(error instanceof Error ? error.message : String(error));
};

const getFailureSummary = (error) => {
  const lines = error
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter(Boolean);
  const nestedError = lines.find((line) => line.startsWith("Error: "));
  if (nestedError) {
    return nestedError.slice("Error: ".length);
  }
  return lines[1] ?? lines[0] ?? "Unknown review failure.";
};

const getScreenshotPaths = async () => {
  const filenames = [
    "model-lab-candidate-preview.png",
    "model-lab-candidate-trace.png",
    "model-lab-candidate-topology.png",
  ];
  const available = [];
  for (const filename of filenames) {
    const screenshotPath = path.join(reviewDirectory, filename);
    try {
      await stat(screenshotPath);
      available.push(path.relative(PROJECT_ROOT, screenshotPath));
    } catch {
      // A failed browser phase can leave a useful partial evidence set.
    }
  }
  return available;
};

const productionShaBefore = await sha256File(PRODUCTION_GLB_PATH);

console.log("╭─ Synmere Foundry · Identity Shell Candidate Review");
console.log(`│ Source: ${path.relative(PROJECT_ROOT, SOURCE_BLEND_PATH)}`);
console.log(`│ Candidate: ${path.relative(PROJECT_ROOT, CANDIDATE_GLB_PATH)}`);
console.log("│ Safety: non-promoting · production GLB is checksum-guarded");
console.log(
  `╰─ Session: ${KEEP_OPEN ? "interactive (stays open for manual review)" : "automated (stops after checks)"}\n`,
);

try {
  await runPhase(
    1,
    "Export canonical Blender source",
    process.execPath,
    [EXPORT_SCRIPT],
    { cwd: PROJECT_ROOT },
  );
  status.export = "passed";
  candidateManifest = JSON.parse(
    await readFile(CANDIDATE_MANIFEST_PATH, "utf8"),
  );
  console.log(`      File: ${path.basename(CANDIDATE_GLB_PATH)}`);
  console.log(`      SHA-256: ${candidateManifest.candidateSha256}`);
  console.log(`      Blender: ${candidateManifest.blenderVersion}`);
  console.log(`      Exported: ${candidateManifest.exportedAt}`);
} catch (error) {
  recordFailure("export", error);
}

const productionShaAfterExport = await sha256File(PRODUCTION_GLB_PATH);
if (productionShaAfterExport !== productionShaBefore) {
  recordFailure(
    "productionGuard",
    new Error("Production GLB changed during candidate export."),
  );
} else {
  status.productionGuard = "passed";
}

if (status.export === "passed" && status.productionGuard === "passed") {
  try {
    await runPhase(
      2,
      "Validate contract and global morph safety",
      process.execPath,
      [VALIDATION_SCRIPT],
      { cwd: PROJECT_ROOT },
    );
    validationReport = JSON.parse(
      await readFile(CANDIDATE_VALIDATION_PATH, "utf8"),
    );
    status.validation = validationReport.localRegressionValidation?.passed
      ? "passed"
      : "failed";
    status.morphValidation = validationReport.globalAssetSafetyValidation
      ?.passed
      ? "passed"
      : "failed";
    if (status.validation !== "passed" || status.morphValidation !== "passed") {
      errors.push("Candidate validation report contains a failed gate.");
    }
    const morph = validationReport.globalAssetSafetyValidation;
    console.log(
      `      Morph states: ${morph.sampledStates} · inverted: ${morph.invertedStateCount} · degenerate: ${morph.degenerateStateCount}`,
    );
    console.log(
      `      Maximum edge strain: ${morph.maximumMorphEdgeStrain} / ${morph.strainLimit}`,
    );
  } catch (error) {
    recordFailure("validation", error);
    status.morphValidation = "failed";
  }
} else {
  status.validation = "skipped";
  status.morphValidation = "skipped";
}

if (status.validation === "passed" && status.morphValidation === "passed") {
  try {
    const runId = new Date().toISOString().replaceAll(/[:.]/gu, "-");
    reviewDirectory = path.join(CANDIDATE_REVIEW_DIRECTORY, runId);
    await mkdir(reviewDirectory, { recursive: true });
    process.stdout.write("[3/5] Start isolated candidate review services... ");
    candidateServer = await startCandidateServer({ port: 0 });
    const productPort = await reservePort();
    modelLabUrl = `http://127.0.0.1:${productPort}${REVIEW_ROUTE}`;
    await rm(PRODUCT_DIST_DIRECTORY, { recursive: true, force: true });
    productServer = spawn(
      process.execPath,
      [
        NEXT_CLI,
        "dev",
        "--hostname",
        "127.0.0.1",
        "--port",
        String(productPort),
      ],
      {
        cwd: SYNMERE_ROOT,
        detached: false,
        env: {
          ...process.env,
          MODEL_LAB_ENABLED: "true",
          SYNMERE_NEXT_DIST_DIR: PRODUCT_DIST_DIRECTORY_NAME,
          SYNMERE_ASSET_REVIEW_ENABLED: "true",
          SYNMERE_MODEL_LAB_CANDIDATE_URL: candidateServer.url,
          SYNMERE_MODEL_LAB_CANDIDATE_SHA256: candidateManifest.candidateSha256,
        },
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
    let productLogs = "";
    productServer.stdout.on("data", (chunk) => {
      productLogs += chunk;
    });
    productServer.stderr.on("data", (chunk) => {
      productLogs += chunk;
    });

    try {
      await waitForUrl(modelLabUrl, productServer);
    } catch (error) {
      const logTail = productLogs.trim().slice(-4000);
      throw new Error(`${error.message}${logTail ? `\n${logTail}` : ""}`);
    }
    console.log("ready");
    console.log(`      Model Lab: ${modelLabUrl}`);
    console.log(`      Candidate asset: ${candidateServer.url}`);

    const playwrightArguments = [
      PLAYWRIGHT_CLI,
      "test",
      "e2e/model-lab-candidate-review.spec.ts",
      "--project=chromium",
      "--workers=1",
      "--reporter=line",
    ];
    if (process.env.SYNMERE_REVIEW_HEADED === "true") {
      playwrightArguments.push("--headed");
    }
    await runPhase(
      4,
      "Run browser checks and capture Model Lab evidence",
      process.execPath,
      playwrightArguments,
      {
        cwd: SYNMERE_ROOT,
        env: {
          ...process.env,
          MODEL_LAB_ENABLED: "true",
          PLAYWRIGHT_BASE_URL: `http://127.0.0.1:${productPort}`,
          SYNMERE_REVIEW_EVIDENCE_DIR: reviewDirectory,
        },
      },
    );
    status.browserChecks = "passed";
  } catch (error) {
    recordFailure("browserChecks", error);
  }
} else {
  status.browserChecks = "skipped";
}

const productionShaAfter = await sha256File(PRODUCTION_GLB_PATH);
if (productionShaAfter !== productionShaBefore) {
  status.productionGuard = "failed";
  errors.push("Production GLB checksum changed during review.");
}

let reviewManifestPath;
let reviewPackagePassed = false;
if (candidateManifest) {
  screenshotPaths = reviewDirectory ? await getScreenshotPaths() : [];
  const allPassed =
    status.export === "passed" &&
    status.validation === "passed" &&
    status.morphValidation === "passed" &&
    status.browserChecks === "passed" &&
    status.productionGuard === "passed" &&
    screenshotPaths.length === 3;
  reviewPackagePassed = allPassed;
  const reviewManifest = {
    schemaVersion: SHELL_ASSET_PIPELINE_VERSION,
    candidateFilename: path.basename(CANDIDATE_GLB_PATH),
    candidateSha256: candidateManifest.candidateSha256,
    sourceBlendSha256: candidateManifest.sourceBlendSha256,
    blenderVersion: candidateManifest.blenderVersion,
    exportedAt: candidateManifest.exportedAt,
    reviewedAt: new Date().toISOString(),
    validationStatus: status.validation,
    morphValidationStatus: status.morphValidation,
    browserCheckStatus: status.browserChecks,
    productionGuardStatus: status.productionGuard,
    modelLabRoute: REVIEW_ROUTE,
    modelLabUrl,
    screenshotPaths,
    validationManifest: path.relative(PROJECT_ROOT, CANDIDATE_VALIDATION_PATH),
    results: {
      passed: allPassed,
      screenshotCount: screenshotPaths.length,
    },
    errors,
    promotionApproved: false,
  };
  await writeFile(
    CANDIDATE_REVIEW_PATH,
    `${JSON.stringify(reviewManifest, null, 2)}\n`,
  );
  reviewManifestPath = path.relative(PROJECT_ROOT, CANDIDATE_REVIEW_PATH);
  console.log("[5/5] Write Foundry review package... passed");
  console.log(`      Manifest: ${reviewManifestPath}`);
  screenshotPaths.forEach((screenshotPath) => {
    console.log(`      Evidence: ${screenshotPath}`);
  });
}

const succeeded =
  status.export === "passed" &&
  status.validation === "passed" &&
  status.morphValidation === "passed" &&
  status.browserChecks === "passed" &&
  status.productionGuard === "passed" &&
  reviewPackagePassed;
console.log("\n╭─ Foundry Review Summary");
console.log(
  `│ Result: ${succeeded ? "SUCCESS · READY FOR HUMAN REVIEW" : "FAILURE"}`,
);
console.log(`│ Export: ${status.export}`);
console.log(`│ Contract validation: ${status.validation}`);
console.log(`│ Morph safety: ${status.morphValidation}`);
console.log(`│ Browser checks: ${status.browserChecks}`);
console.log(`│ Production guard: ${status.productionGuard}`);
if (candidateManifest) {
  console.log(`│ Candidate SHA: ${candidateManifest.candidateSha256}`);
}
console.log(`│ Evidence screenshots: ${screenshotPaths.length}`);
console.log("│ Promotion performed: no");
if (errors.length > 0) {
  console.log(`│ Failure: ${getFailureSummary(errors[0])}`);
}
console.log("╰─");

if (!succeeded) {
  await stopReviewServices();
  process.exitCode = 1;
} else if (KEEP_OPEN && productServer?.exitCode === null) {
  console.log("\nManual review server is live:");
  console.log(`  ${modelLabUrl}`);
  console.log(
    "\nOpen that URL in your browser. Press Ctrl+C when review is complete.",
  );
  const shutdownReason = await waitForManualShutdown();
  await stopReviewServices();
  console.log(
    shutdownReason === "server-exit"
      ? "\nModel Lab stopped unexpectedly; review evidence remains saved."
      : "\nReview servers stopped. Evidence and manifest remain saved.",
  );
} else {
  await stopReviewServices();
  console.log(
    "\nAutomated session complete; temporary review servers stopped. Use --keep-open to retain the live Model Lab URL.",
  );
}

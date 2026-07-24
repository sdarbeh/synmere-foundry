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
  CANDIDATE_REVIEW_PORT,
  CANDIDATE_VALIDATION_PATH,
  PRODUCTION_GLB_PATH,
  SHELL_ASSET_PIPELINE_VERSION,
} from "../shell/asset-paths.mjs";
import { sha256File } from "../shell/glb.mjs";
import { startCandidateServer } from "./serve-candidate.mjs";

const SCRIPT_DIRECTORY = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(SCRIPT_DIRECTORY, "../..");
const SYNMERE_ROOT =
  process.env.SYNMERE_PRODUCT_ROOT ?? path.resolve(PROJECT_ROOT, "../synmere");
const REVIEW_ROUTE = "/dev/model-lab?asset=candidate";
const PRODUCT_DIST_DIRECTORY_NAME = ".next-shell-review";
const PRODUCT_DIST_DIRECTORY = path.join(
  SYNMERE_ROOT,
  PRODUCT_DIST_DIRECTORY_NAME,
);

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
let reviewDirectory;
let modelLabUrl;

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

const runPhase = async (label, command, args, options) => {
  process.stdout.write(`• ${label}... `);
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
  try {
    if (process.platform !== "win32") {
      process.kill(-child.pid, "SIGTERM");
    } else {
      child.kill("SIGTERM");
    }
  } catch {
    child.kill("SIGTERM");
  }
  await Promise.race([
    new Promise((resolve) => child.once("close", resolve)),
    new Promise((resolve) => setTimeout(resolve, 3_000)),
  ]);
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

console.log("Synmere shell candidate review");
console.log("Production promotion is disabled for this command.\n");

try {
  try {
    await runPhase(
      "Export canonical Blender source",
      "pnpm",
      ["asset:shell:export"],
      { cwd: PROJECT_ROOT },
    );
    status.export = "passed";
    candidateManifest = JSON.parse(
      await readFile(CANDIDATE_MANIFEST_PATH, "utf8"),
    );
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
        "Validate candidate contract and 193 morph states",
        "pnpm",
        ["asset:shell:validate"],
        { cwd: PROJECT_ROOT },
      );
      const validation = JSON.parse(
        await readFile(CANDIDATE_VALIDATION_PATH, "utf8"),
      );
      status.validation = validation.localRegressionValidation?.passed
        ? "passed"
        : "failed";
      status.morphValidation = validation.globalAssetSafetyValidation?.passed
        ? "passed"
        : "failed";
      if (
        status.validation !== "passed" ||
        status.morphValidation !== "passed"
      ) {
        errors.push("Candidate validation report contains a failed gate.");
      }
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
      candidateServer = await startCandidateServer({ port: 0 });
      const productPort = await reservePort();
      modelLabUrl = `http://127.0.0.1:${productPort}${REVIEW_ROUTE}`;
      productServer = spawn(
        "pnpm",
        ["dev", "--hostname", "127.0.0.1", "--port", String(productPort)],
        {
          cwd: SYNMERE_ROOT,
          detached: process.platform !== "win32",
          env: {
            ...process.env,
            MODEL_LAB_ENABLED: "true",
            SYNMERE_NEXT_DIST_DIR: PRODUCT_DIST_DIRECTORY_NAME,
            SYNMERE_ASSET_REVIEW_ENABLED: "true",
            SYNMERE_MODEL_LAB_CANDIDATE_URL: candidateServer.url,
            SYNMERE_MODEL_LAB_CANDIDATE_SHA256:
              candidateManifest.candidateSha256,
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

      process.stdout.write("• Launch Model Lab candidate route... ");
      try {
        await waitForUrl(modelLabUrl, productServer);
      } catch (error) {
        const logTail = productLogs.trim().slice(-4000);
        throw new Error(`${error.message}${logTail ? `\n${logTail}` : ""}`);
      }
      console.log("ready");

      const playwrightArguments = [
        "exec",
        "playwright",
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
        "Run candidate browser checks and capture evidence",
        "pnpm",
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
} finally {
  await stopChildProcess(productServer);
  await rm(PRODUCT_DIST_DIRECTORY, { recursive: true, force: true });
  if (candidateServer) {
    await candidateServer.close();
  }
}

const productionShaAfter = await sha256File(PRODUCTION_GLB_PATH);
if (productionShaAfter !== productionShaBefore) {
  status.productionGuard = "failed";
  errors.push("Production GLB checksum changed during review.");
}

let reviewManifestPath;
let reviewPackagePassed = false;
if (candidateManifest) {
  const screenshotPaths = reviewDirectory ? await getScreenshotPaths() : [];
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
}

const succeeded =
  status.export === "passed" &&
  status.validation === "passed" &&
  status.morphValidation === "passed" &&
  status.browserChecks === "passed" &&
  status.productionGuard === "passed" &&
  reviewPackagePassed;
console.log("\nFoundry review summary");
console.log(`Result: ${succeeded ? "SUCCESS" : "FAILURE"}`);
console.log(`Export: ${status.export}`);
console.log(`Contract validation: ${status.validation}`);
console.log(`Morph safety: ${status.morphValidation}`);
console.log(`Browser checks: ${status.browserChecks}`);
console.log(`Production GLB: ${status.productionGuard}`);
if (reviewManifestPath) {
  console.log(`Review manifest: ${reviewManifestPath}`);
}
if (errors.length > 0) {
  console.log(`Failure: ${getFailureSummary(errors[0])}`);
}
console.log("Promotion performed: no");

if (!succeeded) {
  process.exitCode = 1;
}

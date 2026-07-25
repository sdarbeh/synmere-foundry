import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIRECTORY = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(SCRIPT_DIRECTORY, "../..");
const GITHUB_PACKAGES_REGISTRY = "https://npm.pkg.github.com";
const PACKAGE_DIRECTORIES = [
  "packages/schema",
  "packages/three",
  "packages/manifest",
];

const run = (command, args, options = {}) => {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: PROJECT_ROOT,
      env: process.env,
      stdio: options.capture ? ["ignore", "pipe", "pipe"] : "inherit",
    });
    let stdout = "";
    let stderr = "";

    if (options.capture) {
      child.stdout.on("data", (chunk) => {
        stdout += chunk.toString();
      });
      child.stderr.on("data", (chunk) => {
        stderr += chunk.toString();
      });
    }

    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve({ stdout, stderr });
        return;
      }

      const error = new Error(
        `${command} ${args.join(" ")} exited with status ${code}.`,
      );
      error.code = code;
      error.stdout = stdout;
      error.stderr = stderr;
      reject(error);
    });
  });
};

const readPackageManifest = async (packageDirectory) => {
  return JSON.parse(
    await readFile(
      path.join(PROJECT_ROOT, packageDirectory, "package.json"),
      "utf8",
    ),
  );
};

const packageVersionExists = async ({ name, version }) => {
  try {
    await run(
      "npm",
      [
        "view",
        `${name}@${version}`,
        "version",
        "--registry",
        GITHUB_PACKAGES_REGISTRY,
      ],
      { capture: true },
    );
    return true;
  } catch (error) {
    if (
      /E404|404 Not Found|not found/u.test(`${error.stderr}\n${error.stdout}`)
    ) {
      return false;
    }

    throw error;
  }
};

if (!process.env.NODE_AUTH_TOKEN && !process.env.NPM_TOKEN) {
  throw new Error(
    "Publishing requires NODE_AUTH_TOKEN or NPM_TOKEN with GitHub Packages write access.",
  );
}

const results = [];

for (const packageDirectory of PACKAGE_DIRECTORIES) {
  const packageManifest = await readPackageManifest(packageDirectory);
  const exists = await packageVersionExists(packageManifest);

  if (exists) {
    results.push({
      package: packageManifest.name,
      version: packageManifest.version,
      status: "skipped",
      reason: "already published",
    });
    continue;
  }

  await run("npm", [
    "publish",
    packageDirectory,
    "--registry",
    GITHUB_PACKAGES_REGISTRY,
  ]);
  results.push({
    package: packageManifest.name,
    version: packageManifest.version,
    status: "published",
  });
}

console.log(
  JSON.stringify({ registry: GITHUB_PACKAGES_REGISTRY, results }, null, 2),
);

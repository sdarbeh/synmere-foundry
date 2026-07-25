import {
  copyFile,
  mkdir,
  readFile,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  CANDIDATE_BLEND_PATH,
  CANDIDATE_DIRECTORY,
  CANDIDATE_GLB_PATH,
  CANDIDATE_MODULE_MANIFEST_PATH,
} from "../shell/asset-paths.mjs";
import { sha256File } from "../shell/glb.mjs";
import {
  assertPromotableAssetPromotionRecord,
  buildIdentityShellPromotionRecord,
} from "./asset-promotion-record.mjs";
import {
  normalizeIdentityShellModuleManifest,
} from "./asset-module-manifest.mjs";
import { writeAssetPromotionRegistry } from "./asset-promotion-registry.mjs";
import { writeManifestPackage } from "./build-manifest-package.mjs";
import {
  assertReleaseDoesNotExist,
  assertSemanticVersion,
  getReleaseTag,
} from "./release-policy.mjs";
import { validateReleaseDirectory } from "./validate-release.mjs";

const SCRIPT_DIRECTORY = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(SCRIPT_DIRECTORY, "../..");

const readArgument = (name) => {
  const index = process.argv.indexOf(name);
  return index === -1 ? undefined : process.argv[index + 1];
};
const readJson = async (filePath) => {
  return JSON.parse(await readFile(filePath, "utf8"));
};
const writeJson = async (filePath, value) => {
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`);
};

if (!process.argv.includes("--confirm")) {
  throw new Error("Promotion requires --confirm.");
}
const version = readArgument("--version");
if (!version) {
  throw new Error("Promotion requires --version <semantic-version>.");
}
assertSemanticVersion(version);

const releaseRoot = path.join(PROJECT_ROOT, "assets/releases/identity-shell");
const releaseDirectory = path.join(releaseRoot, version);
const stagingDirectory = path.join(
  PROJECT_ROOT,
  "assets/release-staging",
  `identity-shell-${version}-${process.pid}`,
);
const candidateManifestPath = path.join(
  CANDIDATE_DIRECTORY,
  "identity-shell-v1.release-manifest.json",
);
const validationPath = path.join(
  CANDIDATE_DIRECTORY,
  "identity-shell-v1.validation.json",
);
const reviewPath = path.join(
  CANDIDATE_DIRECTORY,
  "identity-shell-v1.review.json",
);

await assertReleaseDoesNotExist(releaseDirectory);
const [
  manifest,
  validation,
  review,
  candidateModuleManifest,
  glbSha256,
  blendSha256,
] = await Promise.all([
    readJson(candidateManifestPath),
    readJson(validationPath),
    readJson(reviewPath),
    readJson(CANDIDATE_MODULE_MANIFEST_PATH),
    sha256File(CANDIDATE_GLB_PATH),
  sha256File(CANDIDATE_BLEND_PATH),
]);
const candidateModuleManifestSha256 = await sha256File(
  CANDIDATE_MODULE_MANIFEST_PATH,
);

if (
  manifest.version !== version ||
  manifest.releaseTag !== getReleaseTag(version)
) {
  throw new Error("Candidate manifest version does not match promotion.");
}
if (
  manifest.sha256 !== glbSha256 ||
  manifest.source.blendSha256 !== blendSha256
) {
  throw new Error("Candidate source and export hashes do not match manifest.");
}
if (
  !validation.localRegressionValidation?.passed ||
  !validation.globalAssetSafetyValidation?.passed
) {
  throw new Error("Required validation evidence did not pass.");
}
if (
  !review.results?.passed ||
  review.candidateSha256 !== glbSha256 ||
  review.assetModuleManifestSha256 !== candidateModuleManifestSha256 ||
  review.promotionApproved !== true
) {
  throw new Error(
    "Model Lab evidence is missing, failed, stale, has stale module settings, or is not explicitly approved.",
  );
}

await mkdir(path.join(stagingDirectory, "source"), { recursive: true });
try {
  await Promise.all([
    copyFile(
      CANDIDATE_GLB_PATH,
      path.join(stagingDirectory, "identity-shell.glb"),
    ),
    copyFile(
      CANDIDATE_BLEND_PATH,
      path.join(stagingDirectory, "source/identity-shell.blend"),
    ),
    copyFile(
      candidateManifestPath,
      path.join(stagingDirectory, "manifest.json"),
    ),
    copyFile(validationPath, path.join(stagingDirectory, "validation.json")),
    copyFile(reviewPath, path.join(stagingDirectory, "model-lab-review.json")),
  ]);
  await writeJson(path.join(stagingDirectory, "checksums.json"), {
    schemaVersion: "v1",
    algorithm: "sha256",
    files: {
      "identity-shell.glb": glbSha256,
      "source/identity-shell.blend": blendSha256,
    },
  });
  await writeJson(path.join(stagingDirectory, "source-candidate.json"), {
    schemaVersion: "v1",
    candidate: manifest.source.candidate,
    sourceRevision: manifest.source.revision,
    glbSha256,
    blendSha256,
  });
  await writeJson(
    path.join(stagingDirectory, "module-manifest.json"),
    normalizeIdentityShellModuleManifest(manifest, candidateModuleManifest),
  );

  // Promotion permits exactly one validation against production-shaped paths.
  const productionValidation = await validateReleaseDirectory(
    stagingDirectory,
    version,
    {
      requireProductionValidation: false,
      requirePromotionRecord: false,
    },
  );
  const promotionRecord = buildIdentityShellPromotionRecord({
    version,
    manifest,
    validation,
    review,
    productionValidation,
    glbSha256,
    blendSha256,
    productionGlbSha256: glbSha256,
  });
  assertPromotableAssetPromotionRecord(promotionRecord);
  await writeJson(path.join(stagingDirectory, "production-validation.json"), {
    schemaVersion: "v1",
    operation: "production-path-validation",
    runs: 1,
    ...productionValidation,
  });
  await mkdir(releaseRoot, { recursive: true });
  await rename(stagingDirectory, releaseDirectory);
  const productionGlbSha256 = await sha256File(
    path.join(releaseDirectory, "identity-shell.glb"),
  );
  if (productionGlbSha256 !== glbSha256) {
    throw new Error("Production GLB hash does not match approved candidate.");
  }
  const finalPromotionRecord = {
    ...promotionRecord,
    files: {
      ...promotionRecord.files,
      productionGlbHash: productionGlbSha256,
    },
  };
  assertPromotableAssetPromotionRecord(finalPromotionRecord);
  await writeJson(
    path.join(releaseDirectory, "promotion-record.json"),
    finalPromotionRecord,
  );
  await writeJson(
    path.join(PROJECT_ROOT, "manifests/identity-shell.current.json"),
    manifest,
  );
  await writeAssetPromotionRegistry();
  const manifestPackage = await writeManifestPackage({ version });

  console.log(
    JSON.stringify(
      {
        promoted: true,
        version,
        releaseTag: getReleaseTag(version),
        releaseDirectory: path.relative(PROJECT_ROOT, releaseDirectory),
        glbSha256,
        productionGlbSha256,
        blendSha256,
        promotionRecord: path.relative(
          PROJECT_ROOT,
          path.join(releaseDirectory, "promotion-record.json"),
        ),
        productionValidationRuns: 1,
        manifestPackage,
        next: [
          "Commit the immutable release.",
          `Create annotated Git tag ${getReleaseTag(version)}.`,
          "Run pnpm install in Synmere if the local package link is stale.",
          "Commit Synmere and run final runtime validation.",
        ],
      },
      null,
      2,
    ),
  );
} catch (error) {
  await rm(stagingDirectory, { recursive: true, force: true });
  throw error;
}

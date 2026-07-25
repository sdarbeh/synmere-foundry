import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { sha256File } from "../shell/glb.mjs";
import {
  assertPromotableAssetPromotionRecord,
  buildIdentityShellPromotionRecord,
} from "./asset-promotion-record.mjs";
import {
  SEMANTIC_VERSION_PATTERN,
  assertSemanticVersion,
} from "./release-policy.mjs";
import { validateReleaseDirectory } from "./validate-release.mjs";

const SCRIPT_DIRECTORY = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(SCRIPT_DIRECTORY, "../..");
const IDENTITY_SHELL_RELEASE_ROOT = path.join(
  PROJECT_ROOT,
  "assets/releases/identity-shell",
);
const DEFAULT_REGISTRY_PATH = path.join(
  PROJECT_ROOT,
  "manifests/asset-promotions.json",
);

const readJson = async (filePath) => {
  return JSON.parse(await readFile(filePath, "utf8"));
};

const writeJson = async (filePath, value) => {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`);
};

const comparePromotionDatesDescending = (left, right) => {
  return (
    Date.parse(right.version.promotedAt) - Date.parse(left.version.promotedAt)
  );
};

export const getAssetPromotionHistory = (promotions, assetName) => {
  return promotions
    .filter((promotion) => promotion.asset.name === assetName)
    .sort(comparePromotionDatesDescending);
};

export const getLatestProductionAssetPromotion = (promotions, assetName) => {
  return getAssetPromotionHistory(promotions, assetName).find((promotion) => {
    return promotion.version.releaseChannel === "production";
  });
};

export const upsertAssetPromotionRecord = (promotions, record) => {
  return [
    record,
    ...promotions.filter((promotion) => promotion.id !== record.id),
  ].sort(comparePromotionDatesDescending);
};

const readReleaseVersions = async () => {
  const entries = await readdir(IDENTITY_SHELL_RELEASE_ROOT, {
    withFileTypes: true,
  });
  return entries
    .filter((entry) => {
      return entry.isDirectory() && SEMANTIC_VERSION_PATTERN.test(entry.name);
    })
    .map((entry) => entry.name)
    .sort((left, right) => {
      return left.localeCompare(right, undefined, { numeric: true });
    });
};

const getCandidateGlbPath = (manifest, sourceCandidate) => {
  if (sourceCandidate?.candidate === "current") {
    return "assets/candidates/current/identity-shell-v1.glb";
  }

  return `assets/candidates/${manifest.source.candidate}`;
};

export const buildIdentityShellPromotionRecordFromRelease = async (version) => {
  assertSemanticVersion(version);
  const releaseDirectory = path.join(IDENTITY_SHELL_RELEASE_ROOT, version);
  const [
    manifest,
    validation,
    review,
    sourceCandidate,
    productionValidation,
    glbSha256,
    blendSha256,
  ] = await Promise.all([
    readJson(path.join(releaseDirectory, "manifest.json")),
    readJson(path.join(releaseDirectory, "validation.json")),
    readJson(path.join(releaseDirectory, "model-lab-review.json")),
    readJson(path.join(releaseDirectory, "source-candidate.json")),
    validateReleaseDirectory(releaseDirectory, version, {
      requirePromotionRecord: false,
    }),
    sha256File(path.join(releaseDirectory, "identity-shell.glb")),
    sha256File(path.join(releaseDirectory, "source/identity-shell.blend")),
  ]);

  const record = buildIdentityShellPromotionRecord({
    version,
    manifest,
    validation,
    review,
    productionValidation,
    glbSha256: sourceCandidate.glbSha256 ?? glbSha256,
    blendSha256,
    productionGlbSha256: glbSha256,
    candidateGlbPath: getCandidateGlbPath(manifest, sourceCandidate),
    promotedBy: "Synmere Foundry",
  });

  assertPromotableAssetPromotionRecord(record);
  return record;
};

export const writeIdentityShellPromotionRecord = async (version) => {
  const record = await buildIdentityShellPromotionRecordFromRelease(version);
  const releaseDirectory = path.join(IDENTITY_SHELL_RELEASE_ROOT, version);
  await writeJson(path.join(releaseDirectory, "promotion-record.json"), record);
  return record;
};

export const writeAssetPromotionRegistry = async (
  outputPath = DEFAULT_REGISTRY_PATH,
) => {
  const versions = await readReleaseVersions();
  const records = [];

  for (const version of versions) {
    records.push(await writeIdentityShellPromotionRecord(version));
  }

  const sortedRecords = records.sort(comparePromotionDatesDescending);
  await writeJson(outputPath, sortedRecords);
  return sortedRecords;
};

if (pathToFileURL(process.argv[1]).href === import.meta.url) {
  const versionIndex = process.argv.indexOf("--version");
  const outputIndex = process.argv.indexOf("--output");
  const outputPath =
    outputIndex === -1
      ? DEFAULT_REGISTRY_PATH
      : path.resolve(process.argv[outputIndex + 1]);

  if (versionIndex === -1) {
    const records = await writeAssetPromotionRegistry(outputPath);
    console.log(
      JSON.stringify(
        {
          registry: path.relative(PROJECT_ROOT, outputPath),
          records: records.length,
        },
        null,
        2,
      ),
    );
  } else {
    const version = process.argv[versionIndex + 1];
    const record = await writeIdentityShellPromotionRecord(version);
    console.log(
      JSON.stringify(
        {
          promotionRecord: `assets/releases/identity-shell/${version}/promotion-record.json`,
          id: record.id,
        },
        null,
        2,
      ),
    );
  }
}

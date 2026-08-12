import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { assertPromotableAssetPromotionRecord } from "./asset-promotion-record.mjs";
import {
  SEMANTIC_VERSION_PATTERN,
  assertSemanticVersion,
} from "./release-policy.mjs";

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
    return promotion.version.stage === "production";
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

const readIdentityShellPromotionRecord = async (version) => {
  assertSemanticVersion(version);
  const record = await readJson(
    path.join(
      IDENTITY_SHELL_RELEASE_ROOT,
      version,
      "promotion-record.json",
    ),
  );

  assertPromotableAssetPromotionRecord(record);
  if (record.version.version !== version) {
    throw new Error(`Promotion record version does not match ${version}.`);
  }
  return record;
};

export const writeAssetPromotionRegistry = async (
  outputPath = DEFAULT_REGISTRY_PATH,
) => {
  const versions = await readReleaseVersions();
  const records = [];

  for (const version of versions) {
    records.push(await readIdentityShellPromotionRecord(version));
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
    const record = await readIdentityShellPromotionRecord(version);
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

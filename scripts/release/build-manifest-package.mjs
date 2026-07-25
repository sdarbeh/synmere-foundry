import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { SEMANTIC_VERSION_PATTERN } from "./release-policy.mjs";

const readArgument = (name) => {
  const index = process.argv.indexOf(name);
  return index === -1 ? undefined : process.argv[index + 1];
};

const formatSource = async (source, options) => {
  try {
    const prettier = await import("prettier");
    return prettier.format(source, options);
  } catch (error) {
    if (error?.code !== "ERR_MODULE_NOT_FOUND") {
      throw error;
    }

    return source;
  }
};

const SCRIPT_DIRECTORY = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(SCRIPT_DIRECTORY, "../..");
const IDENTITY_SHELL_RELEASE_ROOT = path.join(
  PROJECT_ROOT,
  "assets/releases/identity-shell",
);
const DEFAULT_PROMOTION_REGISTRY_PATH = path.join(
  PROJECT_ROOT,
  "manifests/asset-promotions.json",
);
const PACKAGE_ROOT = path.join(PROJECT_ROOT, "packages/manifest");

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

const getLatestReleaseVersion = async () => {
  const versions = await readReleaseVersions();
  const latest = versions.at(-1);

  if (!latest) {
    throw new Error("No identity shell releases exist in Foundry.");
  }

  return latest;
};

export const writeManifestPackage = async (options = {}) => {
  const version =
    options.version ??
    readArgument("--version") ??
    (await getLatestReleaseVersion());
  const manifestPath =
    options.manifestPath ??
    readArgument("--manifest") ??
    path.join(IDENTITY_SHELL_RELEASE_ROOT, version, "manifest.json");
  const promotionRecordPath =
    options.promotionRecordPath ??
    readArgument("--promotion-record") ??
    path.join(
      path.dirname(path.resolve(manifestPath)),
      "promotion-record.json",
    );
  const promotionRegistryPath =
    options.promotionRegistryPath ??
    readArgument("--promotion-registry") ??
    DEFAULT_PROMOTION_REGISTRY_PATH;
  const moduleManifestPath =
    options.moduleManifestPath ??
    readArgument("--module-manifest") ??
    path.join(path.dirname(path.resolve(manifestPath)), "module-manifest.json");

  const manifest = JSON.parse(
    await readFile(path.resolve(manifestPath), "utf8"),
  );
  const promotionRecord = JSON.parse(
    await readFile(path.resolve(promotionRecordPath), "utf8"),
  );
  const moduleManifest = JSON.parse(
    await readFile(path.resolve(moduleManifestPath), "utf8"),
  );
  const promotionRegistry = promotionRegistryPath
    ? JSON.parse(await readFile(path.resolve(promotionRegistryPath), "utf8"))
    : [promotionRecord];
  const assetPromotions = Array.isArray(promotionRegistry)
    ? promotionRegistry
    : promotionRegistry.records;
  const releaseManifests = await Promise.all(
    (await readReleaseVersions()).map(async (releaseVersion) => {
      return JSON.parse(
        await readFile(
          path.join(
            IDENTITY_SHELL_RELEASE_ROOT,
            releaseVersion,
            "manifest.json",
          ),
          "utf8",
        ),
      );
    }),
  );
  if (
    !manifest.version ||
    !manifest.sha256 ||
    !Array.isArray(manifest.morphTargetNames)
  ) {
    throw new Error("The supplied release manifest is incomplete.");
  }
  if (
    moduleManifest.schemaVersion !== "asset-module-v1" ||
    moduleManifest.asset?.name !== "identity-shell" ||
    moduleManifest.asset?.version !== manifest.version ||
    !Array.isArray(moduleManifest.morphs?.targetNames) ||
    JSON.stringify(moduleManifest.morphs.targetNames) !==
      JSON.stringify(manifest.morphTargetNames)
  ) {
    throw new Error(
      "The supplied Foundry asset module manifest is incomplete or stale.",
    );
  }
  if (!Array.isArray(assetPromotions) || assetPromotions.length === 0) {
    throw new Error("The supplied Foundry promotion registry is incomplete.");
  }
  if (!Array.isArray(releaseManifests) || releaseManifests.length === 0) {
    throw new Error("The Foundry release catalog is incomplete.");
  }
  if (
    !assetPromotions.some((record) => {
      return (
        record.asset?.name === "identity-shell" &&
        record.version?.version === manifest.version &&
        record.files?.productionGlbHash === manifest.sha256
      );
    })
  ) {
    throw new Error(
      "Foundry promotion records do not include the synced identity shell release.",
    );
  }

  const compareSemanticVersionsDescending = (left, right) => {
    return right.version.localeCompare(left.version, undefined, {
      numeric: true,
    });
  };
  const assetReleases = releaseManifests
    .map((releaseManifest) => {
      const promotionRecord = assetPromotions.find((record) => {
        return (
          record.asset?.name === "identity-shell" &&
          record.version?.version === releaseManifest.version &&
          record.files?.productionGlbHash === releaseManifest.sha256
        );
      });

      if (!promotionRecord) {
        throw new Error(
          `Release ${releaseManifest.releaseTag} has no matching production promotion record.`,
        );
      }

      return {
        assetName: "identity-shell",
        displayName: "Identity Shell",
        type: "glb",
        domain: "shell",
        module: "identity-shell",
        schemaVersion: releaseManifest.schemaVersion,
        assetSchemaVersion: releaseManifest.assetSchemaVersion,
        id: releaseManifest.assetId,
        version: releaseManifest.version,
        releaseChannel: promotionRecord.version.releaseChannel,
        releaseTag: releaseManifest.releaseTag,
        url: releaseManifest.url,
        sha256: releaseManifest.sha256,
        meshName: releaseManifest.meshName,
        materialNames: releaseManifest.materialNames,
        morphTargetNames: releaseManifest.morphTargetNames,
        topologyVersion: releaseManifest.topologyVersion,
        rendererCompatibilityVersion:
          releaseManifest.rendererCompatibilityVersion,
        minimumApplicationVersion: releaseManifest.minimumApplicationVersion,
        validationStatus: releaseManifest.validation.status,
        releasedAt: releaseManifest.releasedAt,
        sourceRevision: releaseManifest.source.revision,
        sourceBlendSha256: releaseManifest.source.blendSha256,
        promotionRecordId: promotionRecord.id,
      };
    })
    .sort(compareSemanticVersionsDescending);

  const toConstantKey = (target) => {
    if (target.startsWith("corrective_")) {
      return `${target.slice("corrective_".length).toUpperCase()}_CORRECTIVE`;
    }
    return target
      .replace(/^identity_/u, "")
      .replace(/^presentation_/u, "")
      .toUpperCase();
  };

  const targetRows = manifest.morphTargetNames
    .map((target) => {
      return `  ${toConstantKey(target)}: ${JSON.stringify(target)},`;
    })
    .join("\n");
  const declarationTargetRows = manifest.morphTargetNames
    .map((target) => {
      return `  readonly ${toConstantKey(target)}: ${JSON.stringify(target)};`;
    })
    .join("\n");
  const shapePresetIds = moduleManifest.presets.shape
    .map((preset) => JSON.stringify(preset.id))
    .join(" | ");
  const structurePresetIds = moduleManifest.presets.structure
    .map((preset) => JSON.stringify(preset.id))
    .join(" | ");
  const generated = `// Generated from an immutable Synmere Foundry release manifest.
export const IDENTITY_MORPH_TARGET = Object.freeze({
${targetRows}
});

export const ASSET_PROMOTION_SCHEMA_VERSION = "asset-promotion-v1";

export const ASSET_PROMOTION_RELEASE_CHANNELS = Object.freeze([
  "dev",
  "candidate",
  "production",
]);

const deepFreeze = (value) => {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) {
    return value;
  }

  Object.freeze(value);
  Object.values(value).forEach(deepFreeze);
  return value;
};

const isRecord = (value) => {
  return typeof value === "object" && value !== null && !Array.isArray(value);
};

const isNonEmptyString = (value) => {
  return typeof value === "string" && value.trim().length > 0;
};

const isStringArray = (value) => {
  return Array.isArray(value) && value.every(isNonEmptyString);
};

const isNumber = (value) => {
  return typeof value === "number" && Number.isFinite(value);
};

const assert = (condition, message) => {
  if (!condition) {
    throw new Error(message);
  }
};

export const assertValidAssetPromotionRecord = (record) => {
  assert(isRecord(record), "Asset promotion record must be an object.");
  assert(isNonEmptyString(record.id), "Promotion record id is required.");

  assert(isRecord(record.asset), "Promotion asset identity is required.");
  assert(isNonEmptyString(record.asset.name), "Asset name is required.");
  assert(
    isNonEmptyString(record.asset.displayName),
    "Asset display name is required.",
  );
  assert(record.asset.type === "glb", "Asset type must be glb.");
  assert(
    ["shell", "avatar", "body", "clothing"].includes(
      String(record.asset.domain),
    ),
    "Asset domain is invalid.",
  );
  assert(isNonEmptyString(record.asset.module), "Asset module is required.");

  assert(isRecord(record.version), "Promotion version metadata is required.");
  assert(isNonEmptyString(record.version.version), "Version is required.");
  assert(
    ASSET_PROMOTION_RELEASE_CHANNELS.includes(record.version.releaseChannel),
    "Release channel is invalid.",
  );
  assert(
    isNonEmptyString(record.version.promotedAt),
    "Promotion timestamp is required.",
  );
  assert(
    !Number.isNaN(Date.parse(record.version.promotedAt)),
    "Promotion timestamp must be an ISO-compatible date.",
  );
  assert(
    isNonEmptyString(record.version.promotedBy),
    "Promotion actor is required.",
  );

  assert(isRecord(record.files), "Promotion file provenance is required.");
  assert(
    isNonEmptyString(record.files.sourceBlendPath),
    "Source Blender path is required.",
  );
  assert(
    isNonEmptyString(record.files.productionGlbPath),
    "Production GLB path is required.",
  );
  assert(
    record.files.candidateGlbPath === undefined ||
      isNonEmptyString(record.files.candidateGlbPath),
    "Candidate GLB path must be non-empty when provided.",
  );
  assert(
    isNonEmptyString(record.files.sourceBlendHash),
    "Source Blender hash is required.",
  );
  assert(
    record.files.candidateGlbHash === undefined ||
      isNonEmptyString(record.files.candidateGlbHash),
    "Candidate GLB hash must be non-empty when provided.",
  );
  assert(
    isNonEmptyString(record.files.productionGlbHash),
    "Production GLB hash is required.",
  );

  assert(isRecord(record.contract), "Asset contract is required.");
  assert(
    isNonEmptyString(record.contract.meshName),
    "Contract mesh name is required.",
  );
  assert(
    isNonEmptyString(record.contract.materialSlot),
    "Contract material slot is required.",
  );
  assert(isNumber(record.contract.vertexCount), "Vertex count is required.");
  assert(isNumber(record.contract.indexCount), "Index count is required.");
  assert(
    isNonEmptyString(record.contract.topologyHash),
    "Topology hash is required.",
  );
  assert(
    isNumber(record.contract.morphTargetCount),
    "Morph target count is required.",
  );
  assert(
    isStringArray(record.contract.morphTargetNames),
    "Morph target names are required.",
  );
  assert(
    record.contract.morphTargetCount ===
      record.contract.morphTargetNames.length,
    "Morph target count must match morph target names.",
  );

  assert(isRecord(record.validation), "Validation result is required.");
  assert(
    typeof record.validation.contractPassed === "boolean",
    "Contract validation status is required.",
  );
  assert(
    typeof record.validation.morphValidationPassed === "boolean",
    "Morph validation status is required.",
  );
  assert(
    isNumber(record.validation.maxMorphEdgeStrain),
    "Max morph edge strain is required.",
  );
  assert(
    isNumber(record.validation.maxAllowedMorphEdgeStrain),
    "Max allowed morph edge strain is required.",
  );
  assert(isNumber(record.validation.testsPassed), "Tests passed is required.");
  assert(isNumber(record.validation.testsFailed), "Tests failed is required.");
  assert(
    record.validation.validationReportPath === undefined ||
      isNonEmptyString(record.validation.validationReportPath),
    "Validation report path must be non-empty when provided.",
  );
  assert(
    record.validation.reviewManifestPath === undefined ||
      isNonEmptyString(record.validation.reviewManifestPath),
    "Review manifest path must be non-empty when provided.",
  );

  assert(isRecord(record.releaseNotes), "Release notes are required.");
  assert(
    isNonEmptyString(record.releaseNotes.summary),
    "Release note summary is required.",
  );
  assert(
    isStringArray(record.releaseNotes.changes),
    "Release note changes are required.",
  );
  assert(
    isStringArray(record.releaseNotes.knownIssues),
    "Release note known issues must be strings.",
  );
  assert(
    isStringArray(record.releaseNotes.approvedViews),
    "Release note approved views are required.",
  );

  assert(
    isRecord(record.compatibility),
    "Promotion compatibility metadata is required.",
  );
  assert(
    isNonEmptyString(record.compatibility.faceShellParameterVersion),
    "Face shell parameter version is required.",
  );
  assert(
    isNonEmptyString(record.compatibility.rendererVersion),
    "Renderer version is required.",
  );
  assert(
    record.compatibility.schemaVersion === ASSET_PROMOTION_SCHEMA_VERSION,
    "Promotion schema version is invalid.",
  );
};

export const assertPromotableAssetPromotionRecord = (record) => {
  assertValidAssetPromotionRecord(record);
  assert(
    record.version.releaseChannel === "production",
    "Only production promotion records can complete promotion.",
  );
  assert(record.validation.contractPassed, "Contract validation did not pass.");
  assert(
    record.validation.morphValidationPassed,
    "Morph validation did not pass.",
  );
  assert(
    record.validation.maxMorphEdgeStrain <=
      record.validation.maxAllowedMorphEdgeStrain,
    "Morph edge strain exceeds the allowed limit.",
  );
  assert(
    record.validation.testsFailed === 0,
    "Promotion cannot complete with failed tests.",
  );
  assert(
    record.validation.testsPassed > 0,
    "Promotion requires at least one passing validation check.",
  );
  assert(
    isNonEmptyString(record.files.candidateGlbHash),
    "Candidate GLB hash is required for production promotion.",
  );
  assert(
    isNonEmptyString(record.files.productionGlbHash),
    "Production GLB hash is required for production promotion.",
  );
  assert(
    record.releaseNotes.changes.length > 0,
    "Promotion requires release note changes.",
  );
  assert(
    record.releaseNotes.approvedViews.length > 0,
    "Promotion requires approved review views.",
  );
};

export const ASSET_PROMOTIONS = deepFreeze(${JSON.stringify(assetPromotions)});

export const identityShellModule = deepFreeze(${JSON.stringify(moduleManifest)});

ASSET_PROMOTIONS.forEach(assertPromotableAssetPromotionRecord);

const comparePromotionDatesDescending = (left, right) => {
  return (
    Date.parse(right.version.promotedAt) - Date.parse(left.version.promotedAt)
  );
};

export const getAssetPromotionHistory = (assetName) => {
  return ASSET_PROMOTIONS.filter((promotion) => {
    return promotion.asset.name === assetName;
  }).sort(comparePromotionDatesDescending);
};

export const getLatestProductionAssetPromotion = (assetName) => {
  return getAssetPromotionHistory(assetName).find((promotion) => {
    return promotion.version.releaseChannel === "production";
  });
};

export const ASSET_RELEASES = deepFreeze(${JSON.stringify(assetReleases)});

const compareReleaseVersionsDescending = (left, right) => {
  return right.version.localeCompare(left.version, undefined, {
    numeric: true,
  });
};

export const getAssetReleaseHistory = (assetName) => {
  return ASSET_RELEASES.filter((release) => {
    return release.assetName === assetName;
  }).sort(compareReleaseVersionsDescending);
};

export const getLatestProductionAssetRelease = (assetName) => {
  return getAssetReleaseHistory(assetName).find((release) => {
    return release.releaseChannel === "production";
  });
};

export const getAssetRelease = (assetName, version) => {
  return getAssetReleaseHistory(assetName).find((release) => {
    return release.version === version;
  });
};

export const IDENTITY_SHELL_RELEASES = Object.freeze(
  getAssetReleaseHistory("identity-shell"),
);

const latestIdentityShellRelease =
  getLatestProductionAssetRelease("identity-shell");

assert(
  latestIdentityShellRelease,
  "The identity shell release catalog requires a production release.",
);

export const identityShell = Object.freeze({
  ...latestIdentityShellRelease,
  morphTargetNames: Object.values(IDENTITY_MORPH_TARGET),
});
`;
  const declarations = `export declare const IDENTITY_MORPH_TARGET: {
${declarationTargetRows}
};

export declare const ASSET_PROMOTION_SCHEMA_VERSION: "asset-promotion-v1";

export declare const ASSET_PROMOTION_RELEASE_CHANNELS: readonly [
  "dev",
  "candidate",
  "production",
];

export type AssetPromotionReleaseChannel =
  (typeof ASSET_PROMOTION_RELEASE_CHANNELS)[number];

export type AssetPromotionRecord = {
  id: string;

  asset: {
    name: string;
    displayName: string;
    type: "glb";
    domain: "shell" | "avatar" | "body" | "clothing";
    module: string;
  };

  version: {
    version: string;
    releaseChannel: AssetPromotionReleaseChannel;
    promotedAt: string;
    promotedBy: string;
  };

  files: {
    sourceBlendPath: string;
    productionGlbPath: string;
    candidateGlbPath?: string;
    sourceBlendHash: string;
    candidateGlbHash?: string;
    productionGlbHash: string;
  };

  contract: {
    meshName: string;
    materialSlot: string;
    vertexCount: number;
    indexCount: number;
    topologyHash: string;
    morphTargetCount: number;
    morphTargetNames: string[];
  };

  validation: {
    contractPassed: boolean;
    morphValidationPassed: boolean;
    maxMorphEdgeStrain: number;
    maxAllowedMorphEdgeStrain: number;
    testsPassed: number;
    testsFailed: number;
    validationReportPath?: string;
    reviewManifestPath?: string;
  };

  releaseNotes: {
    summary: string;
    changes: string[];
    knownIssues: string[];
    approvedViews: string[];
  };

  compatibility: {
    faceShellParameterVersion: string;
    rendererVersion: string;
    schemaVersion: "asset-promotion-v1";
  };
};

export declare const assertValidAssetPromotionRecord: (
  record: unknown,
) => asserts record is AssetPromotionRecord;

export declare const assertPromotableAssetPromotionRecord: (
  record: unknown,
) => asserts record is AssetPromotionRecord;

export declare const ASSET_PROMOTIONS: readonly AssetPromotionRecord[];

export declare const getAssetPromotionHistory: (
  assetName: string,
) => AssetPromotionRecord[];

export declare const getLatestProductionAssetPromotion: (
  assetName: string,
) => AssetPromotionRecord | undefined;

export type AssetReleaseManifest = {
  readonly assetName: string;
  readonly displayName: string;
  readonly type: "glb";
  readonly domain: "shell" | "avatar" | "body" | "clothing";
  readonly module: string;
  readonly schemaVersion: string;
  readonly assetSchemaVersion: string;
  readonly id: string;
  readonly version: string;
  readonly releaseChannel: AssetPromotionReleaseChannel;
  readonly releaseTag: string;
  readonly url: string;
  readonly sha256: string;
  readonly meshName: string;
  readonly materialNames: readonly string[];
  readonly morphTargetNames: readonly IdentityMorphName[];
  readonly topologyVersion: string;
  readonly rendererCompatibilityVersion: string;
  readonly minimumApplicationVersion: string;
  readonly validationStatus: string;
  readonly releasedAt: string;
  readonly sourceRevision: string;
  readonly sourceBlendSha256: string;
  readonly promotionRecordId: string;
};

export declare const ASSET_RELEASES: readonly AssetReleaseManifest[];

export declare const IDENTITY_SHELL_RELEASES: readonly AssetReleaseManifest[];

export declare const getAssetReleaseHistory: (
  assetName: string,
) => AssetReleaseManifest[];

export declare const getLatestProductionAssetRelease: (
  assetName: string,
) => AssetReleaseManifest | undefined;

export declare const getAssetRelease: (
  assetName: string,
  version: string,
) => AssetReleaseManifest | undefined;

export type FaceShellParameters = {
  faceWidth: number;
  faceLength: number;
  foreheadWidth: number;
  upperFaceHeight: number;
  cheekWidth: number;
  jawWidth: number;
  jawTaper: number;
  chinLength: number;
  eyeSpacing: number;
  eyeWidth: number;
  browArch: number;
  browProminence: number;
  noseWidth: number;
  noseLength: number;
  noseProjection: number;
  mouthWidth: number;
  headDepth: number;
};

export type FaceShellParameterKey = keyof FaceShellParameters;

export type IdentityShellShapePresetId = ${shapePresetIds};

export type IdentityShellStructurePresetId = ${structurePresetIds};

export type AssetModuleManifest = {
  schemaVersion: "asset-module-v1";
  asset: {
    name: "identity-shell";
    displayName: string;
    module: "identity-shell";
    version: string;
    releaseTag: string;
  };
  parameters: {
    version: string;
    neutral: FaceShellParameters;
    productBaseline: FaceShellParameters;
    safeRanges: Record<
      FaceShellParameterKey,
      { min: number; max: number; step: number }
    >;
  };
  morphs: {
    targetNames: readonly IdentityMorphName[];
    identityBindings: readonly {
      parameter: string;
      positiveTarget?: IdentityMorphName;
      negativeTarget?: IdentityMorphName;
      strength: number;
    }[];
    calibration: Record<
      string,
      {
        positiveGain: number;
        negativeGain: number;
        maximumWeight: number;
      }
    >;
    corrective: readonly {
      target: IdentityMorphName;
      strength: number;
      drivers: readonly {
        parameter: string;
        direction: "positive" | "negative";
      }[];
    }[];
    presentation: readonly {
      preset: IdentityShellStructurePresetId;
      target: IdentityMorphName;
    }[];
  };
  presets: {
    shape: readonly {
      id: IdentityShellShapePresetId;
      label: string;
      description: string;
      parameters: Partial<FaceShellParameters>;
    }[];
    structure: readonly {
      id: IdentityShellStructurePresetId;
      label: string;
      description: string;
      morphWeights: Record<string, number>;
    }[];
  };
  validationLimits: {
    maximumMorphEdgeStrain: number;
    floatingPointTolerance: number;
  };
};

export declare const identityShellModule: AssetModuleManifest;

export declare const identityShell: AssetReleaseManifest;

export type IdentityMorphName =
  (typeof IDENTITY_MORPH_TARGET)[keyof typeof IDENTITY_MORPH_TARGET];
export type IdentityShellRelease = AssetReleaseManifest;
`;
  const packageManifestPath = path.join(PACKAGE_ROOT, "package.json");
  const packageManifest = JSON.parse(
    await readFile(packageManifestPath, "utf8"),
  );
  packageManifest.version = manifest.version;

  const [
    formattedManifest,
    formattedModule,
    formattedDeclarations,
    formattedPackageManifest,
    formattedPromotions,
    formattedAssetModule,
    formattedAssetReleases,
  ] = await Promise.all([
    formatSource(`${JSON.stringify(manifest, null, 2)}\n`, {
      parser: "json",
    }),
    formatSource(generated, { parser: "babel" }),
    formatSource(declarations, { parser: "typescript" }),
    formatSource(`${JSON.stringify(packageManifest, null, 2)}\n`, {
      parser: "json-stringify",
    }),
    formatSource(`${JSON.stringify(assetPromotions, null, 2)}\n`, {
      parser: "json",
    }),
    formatSource(`${JSON.stringify(moduleManifest, null, 2)}\n`, {
      parser: "json",
    }),
    formatSource(`${JSON.stringify(assetReleases, null, 2)}\n`, {
      parser: "json",
    }),
  ]);

  await mkdir(PACKAGE_ROOT, { recursive: true });
  await Promise.all([
    writeFile(path.join(PACKAGE_ROOT, "manifest.json"), formattedManifest),
    writeFile(
      path.join(PACKAGE_ROOT, "asset-promotions.json"),
      formattedPromotions,
    ),
    writeFile(
      path.join(PACKAGE_ROOT, "asset-module.json"),
      formattedAssetModule,
    ),
    writeFile(
      path.join(PACKAGE_ROOT, "asset-releases.json"),
      formattedAssetReleases,
    ),
    writeFile(path.join(PACKAGE_ROOT, "index.js"), formattedModule),
    writeFile(path.join(PACKAGE_ROOT, "index.d.ts"), formattedDeclarations),
    writeFile(packageManifestPath, formattedPackageManifest),
  ]);

  return {
    packageRoot: path.relative(PROJECT_ROOT, PACKAGE_ROOT),
    source: path.relative(PROJECT_ROOT, path.resolve(manifestPath)),
    promotionRecord: path.relative(
      PROJECT_ROOT,
      path.resolve(promotionRecordPath),
    ),
    promotionRegistry: path.relative(
      PROJECT_ROOT,
      path.resolve(promotionRegistryPath),
    ),
    moduleManifest: path.relative(
      PROJECT_ROOT,
      path.resolve(moduleManifestPath),
    ),
    version: manifest.version,
    morphTargetCount: manifest.morphTargetNames.length,
    promotionRecords: assetPromotions.length,
    assetReleases: assetReleases.length,
  };
};

if (pathToFileURL(process.argv[1]).href === import.meta.url) {
  console.log(JSON.stringify(await writeManifestPackage(), null, 2));
}

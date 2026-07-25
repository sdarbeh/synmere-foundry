import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import {
  SEMANTIC_VERSION_PATTERN,
  assertSemanticVersion,
} from "./release-policy.mjs";

export const ASSET_MODULE_SCHEMA_VERSION = "asset-module-v1";
export const ASSET_MODULE_MANIFEST_FILENAME = "module-manifest.json";
export const REQUIRED_DEFAULT_STRUCTURE_PRESET_ID = "balanced";

const SCRIPT_DIRECTORY = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(SCRIPT_DIRECTORY, "../..");
const IDENTITY_SHELL_RELEASE_ROOT = path.join(
  PROJECT_ROOT,
  "assets/releases/identity-shell",
);
const CURRENT_MODULE_MANIFEST_PATH = path.join(
  PROJECT_ROOT,
  "manifests/identity-shell.module.json",
);

const readJson = async (filePath) => {
  return JSON.parse(await readFile(filePath, "utf8"));
};

const writeJson = async (filePath, value) => {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`);
};

const assertRecord = (value, label) => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be an object.`);
  }
};

const assertArray = (value, label) => {
  if (!Array.isArray(value)) {
    throw new Error(`${label} must be an array.`);
  }
};

export const getIdentityShellModuleManifestPath = (version) => {
  assertSemanticVersion(version);
  return path.join(
    IDENTITY_SHELL_RELEASE_ROOT,
    version,
    ASSET_MODULE_MANIFEST_FILENAME,
  );
};

export const assertIdentityShellModuleManifest = (
  moduleManifest,
  releaseManifest,
) => {
  assertRecord(moduleManifest, "Asset module manifest");
  if (moduleManifest.schemaVersion !== ASSET_MODULE_SCHEMA_VERSION) {
    throw new Error(
      `Asset module manifest schemaVersion must be ${ASSET_MODULE_SCHEMA_VERSION}.`,
    );
  }

  assertRecord(moduleManifest.asset, "Asset module identity");
  if (moduleManifest.asset.name !== "identity-shell") {
    throw new Error("Asset module manifest must be named identity-shell.");
  }
  if (moduleManifest.asset.module !== "identity-shell") {
    throw new Error("Asset module manifest module must be identity-shell.");
  }

  assertRecord(moduleManifest.parameters, "Asset module parameters");
  assertRecord(moduleManifest.parameters.neutral, "Neutral parameters");
  assertRecord(
    moduleManifest.parameters.productBaseline,
    "Product baseline parameters",
  );
  assertRecord(moduleManifest.parameters.safeRanges, "Safe parameter ranges");

  assertRecord(moduleManifest.morphs, "Asset module morphs");
  assertArray(
    moduleManifest.morphs.identityBindings,
    "Identity morph bindings",
  );
  assertRecord(moduleManifest.morphs.calibration, "Morph calibration");
  assertArray(moduleManifest.morphs.corrective, "Corrective morph bindings");
  assertArray(
    moduleManifest.morphs.presentation,
    "Presentation morph bindings",
  );

  assertRecord(moduleManifest.presets, "Asset module presets");
  assertArray(moduleManifest.presets.shape, "Shape presets");
  assertArray(moduleManifest.presets.structure, "Structure presets");
  if (moduleManifest.presets.shape.length === 0) {
    throw new Error("Asset module manifest must define shape presets.");
  }
  if (moduleManifest.presets.structure.length === 0) {
    throw new Error("Asset module manifest must define structure presets.");
  }
  if (
    !moduleManifest.presets.structure.some((preset) => {
      return preset.id === REQUIRED_DEFAULT_STRUCTURE_PRESET_ID;
    })
  ) {
    throw new Error(
      `Asset module manifest must define the required ${REQUIRED_DEFAULT_STRUCTURE_PRESET_ID} structure preset.`,
    );
  }

  assertRecord(moduleManifest.validationLimits, "Validation limits");
  if (
    !Number.isFinite(moduleManifest.validationLimits.maximumMorphEdgeStrain)
  ) {
    throw new Error("maximumMorphEdgeStrain must be finite.");
  }
  if (
    !Number.isFinite(moduleManifest.validationLimits.floatingPointTolerance)
  ) {
    throw new Error("floatingPointTolerance must be finite.");
  }

  assertArray(releaseManifest.morphTargetNames, "Release morph target names");
};

export const normalizeIdentityShellModuleManifest = (
  releaseManifest,
  moduleManifest,
) => {
  assertSemanticVersion(releaseManifest.version);
  assertIdentityShellModuleManifest(moduleManifest, releaseManifest);

  return {
    schemaVersion: ASSET_MODULE_SCHEMA_VERSION,
    asset: {
      name: "identity-shell",
      displayName: moduleManifest.asset.displayName ?? "Identity Shell",
      module: "identity-shell",
      version: releaseManifest.version,
      releaseTag: releaseManifest.releaseTag,
    },
    parameters: {
      version: releaseManifest.assetSchemaVersion,
      neutral: moduleManifest.parameters.neutral,
      productBaseline: moduleManifest.parameters.productBaseline,
      safeRanges: moduleManifest.parameters.safeRanges,
    },
    morphs: {
      targetNames: releaseManifest.morphTargetNames,
      identityBindings: moduleManifest.morphs.identityBindings,
      calibration: moduleManifest.morphs.calibration,
      corrective: moduleManifest.morphs.corrective,
      presentation: moduleManifest.morphs.presentation,
    },
    presets: {
      shape: moduleManifest.presets.shape,
      structure: moduleManifest.presets.structure,
    },
    validationLimits: moduleManifest.validationLimits,
  };
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
    .sort((left, right) =>
      left.localeCompare(right, undefined, { numeric: true }),
    );
};

export const readIdentityShellModuleManifestForVersion = async (version) => {
  assertSemanticVersion(version);
  const releaseDirectory = path.join(IDENTITY_SHELL_RELEASE_ROOT, version);
  const [releaseManifest, moduleManifest] = await Promise.all([
    readJson(path.join(releaseDirectory, "manifest.json")),
    readJson(getIdentityShellModuleManifestPath(version)),
  ]);

  return normalizeIdentityShellModuleManifest(releaseManifest, moduleManifest);
};

export const writeIdentityShellModuleManifest = async (version) => {
  const moduleManifest =
    await readIdentityShellModuleManifestForVersion(version);
  await writeJson(getIdentityShellModuleManifestPath(version), moduleManifest);
  return moduleManifest;
};

export const writeIdentityShellModuleManifests = async () => {
  const versions = await readReleaseVersions();
  const manifests = [];
  for (const version of versions) {
    manifests.push(await writeIdentityShellModuleManifest(version));
  }
  const currentManifest = manifests.at(-1);
  if (!currentManifest) {
    throw new Error("No identity shell releases were found.");
  }
  await writeJson(CURRENT_MODULE_MANIFEST_PATH, currentManifest);
  return manifests;
};

if (pathToFileURL(process.argv[1]).href === import.meta.url) {
  const versionIndex = process.argv.indexOf("--version");
  if (versionIndex === -1) {
    const manifests = await writeIdentityShellModuleManifests();
    console.log(
      JSON.stringify(
        {
          moduleManifest: path.relative(
            PROJECT_ROOT,
            CURRENT_MODULE_MANIFEST_PATH,
          ),
          releases: manifests.length,
        },
        null,
        2,
      ),
    );
  } else {
    const version = process.argv[versionIndex + 1];
    const moduleManifest = await writeIdentityShellModuleManifest(version);
    console.log(
      JSON.stringify(
        {
          moduleManifest: `assets/releases/identity-shell/${version}/${ASSET_MODULE_MANIFEST_FILENAME}`,
          version: moduleManifest.asset.version,
        },
        null,
        2,
      ),
    );
  }
}

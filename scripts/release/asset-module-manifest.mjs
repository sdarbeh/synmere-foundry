import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import {
  SEMANTIC_VERSION_PATTERN,
  assertSemanticVersion,
} from "./release-policy.mjs";

export const ASSET_MODULE_SCHEMA_VERSION = "asset-module-v1";

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

const FACE_SHELL_PARAMETERS = {
  faceWidth: 0.92,
  faceLength: 1.16,
  headDepth: 0.86,
  foreheadWidth: 0.88,
  upperFaceHeight: 0.33,
  jawWidth: 0.78,
  jawTaper: 0.76,
  cheekWidth: 0.94,
  eyeSpacing: 0.34,
  eyeWidth: 0.115,
  browArch: 0.06,
  browProminence: 0.5,
  noseWidth: 0.24,
  noseLength: 0.3,
  noseProjection: 0.5,
  mouthWidth: 0.42,
  chinLength: 0.25,
};

const PRODUCT_BASELINE_PARAMETERS = {
  ...FACE_SHELL_PARAMETERS,
  faceWidth: 0.98,
  faceLength: 1.1,
  foreheadWidth: 0.97,
  upperFaceHeight: 0.3,
  cheekWidth: 1.01,
  jawWidth: 0.84,
  jawTaper: 0.8,
  chinLength: 0.25,
};

const PARAMETER_RANGES = {
  faceWidth: { min: 0.72, max: 1.15, step: 0.01 },
  faceLength: { min: 0.95, max: 1.35, step: 0.01 },
  foreheadWidth: { min: 0.62, max: 1.26, step: 0.01 },
  upperFaceHeight: { min: 0.22, max: 0.44, step: 0.01 },
  cheekWidth: { min: 0.76, max: 1.14, step: 0.01 },
  jawWidth: { min: 0.58, max: 1, step: 0.01 },
  jawTaper: { min: 0.55, max: 0.95, step: 0.01 },
  chinLength: { min: 0.16, max: 0.36, step: 0.01 },
  headDepth: { min: 0.72, max: 1.02, step: 0.01 },
  eyeSpacing: { min: 0.25, max: 0.44, step: 0.005 },
  eyeWidth: { min: 0.08, max: 0.15, step: 0.005 },
  browArch: { min: 0.02, max: 0.11, step: 0.005 },
  browProminence: { min: 0, max: 1, step: 0.01 },
  noseWidth: { min: 0.17, max: 0.32, step: 0.005 },
  noseLength: { min: 0.2, max: 0.4, step: 0.005 },
  noseProjection: { min: 0, max: 1, step: 0.01 },
  mouthWidth: { min: 0.3, max: 0.54, step: 0.005 },
};

const IDENTITY_MORPH_TARGET = {
  FACE_WIDE: "identity_face_wide",
  FACE_NARROW: "identity_face_narrow",
  FACE_LONG: "identity_face_long",
  FACE_SHORT: "identity_face_short",
  CHEEKBONES_WIDE: "identity_cheekbones_wide",
  CHEEKBONES_NARROW: "identity_cheekbones_narrow",
  EYE_SPACING_WIDE: "identity_eye_spacing_wide",
  EYE_SPACING_NARROW: "identity_eye_spacing_narrow",
  EYE_WIDTH_WIDE: "identity_eye_width_wide",
  EYE_WIDTH_NARROW: "identity_eye_width_narrow",
  BROW_ARCH_HIGH: "identity_brow_arch_high",
  BROW_ARCH_LOW: "identity_brow_arch_low",
  BROW_PROMINENCE_HIGH: "identity_brow_prominence_high",
  BROW_PROMINENCE_LOW: "identity_brow_prominence_low",
  NOSE_WIDE: "identity_nose_wide",
  NOSE_NARROW: "identity_nose_narrow",
  NOSE_LONG: "identity_nose_long",
  NOSE_SHORT: "identity_nose_short",
  NOSE_PROJECTION_HIGH: "identity_nose_projection_high",
  NOSE_PROJECTION_LOW: "identity_nose_projection_low",
  MOUTH_WIDE: "identity_mouth_wide",
  MOUTH_NARROW: "identity_mouth_narrow",
  CHIN_LONG: "identity_chin_long",
  CHIN_SHORT: "identity_chin_short",
  HEAD_DEPTH_HIGH: "identity_head_depth_high",
  HEAD_DEPTH_LOW: "identity_head_depth_low",
  FOREHEAD_WIDE: "identity_forehead_wide",
  FOREHEAD_NARROW: "identity_forehead_narrow",
  UPPER_FACE_TALL: "identity_upper_face_tall",
  UPPER_FACE_SHORT: "identity_upper_face_short",
  JAW_WIDE: "identity_jaw_wide",
  JAW_NARROW: "identity_jaw_narrow",
  JAW_TAPER_SQUARE: "identity_jaw_taper_square",
  JAW_TAPER_NARROW: "identity_jaw_taper_narrow",
  STRUCTURE_STRUCTURED: "presentation_structure_structured",
  STRUCTURE_SOFT: "presentation_structure_soft",
  JAW_WIDE_CHIN_LONG_CORRECTIVE: "corrective_jaw_wide_chin_long",
};

const IDENTITY_MORPH_BINDINGS = [
  {
    parameter: "faceWidth",
    positiveTarget: IDENTITY_MORPH_TARGET.FACE_WIDE,
    negativeTarget: IDENTITY_MORPH_TARGET.FACE_NARROW,
    strength: 1,
  },
  {
    parameter: "faceLength",
    positiveTarget: IDENTITY_MORPH_TARGET.FACE_LONG,
    negativeTarget: IDENTITY_MORPH_TARGET.FACE_SHORT,
    strength: 1,
  },
  {
    parameter: "foreheadWidth",
    positiveTarget: IDENTITY_MORPH_TARGET.FOREHEAD_WIDE,
    negativeTarget: IDENTITY_MORPH_TARGET.FOREHEAD_NARROW,
    strength: 0.85,
  },
  {
    parameter: "upperFaceHeight",
    positiveTarget: IDENTITY_MORPH_TARGET.UPPER_FACE_TALL,
    negativeTarget: IDENTITY_MORPH_TARGET.UPPER_FACE_SHORT,
    strength: 0.9,
  },
  {
    parameter: "cheekboneWidth",
    positiveTarget: IDENTITY_MORPH_TARGET.CHEEKBONES_WIDE,
    negativeTarget: IDENTITY_MORPH_TARGET.CHEEKBONES_NARROW,
    strength: 0.9,
  },
  {
    parameter: "jawWidth",
    positiveTarget: IDENTITY_MORPH_TARGET.JAW_WIDE,
    negativeTarget: IDENTITY_MORPH_TARGET.JAW_NARROW,
    strength: 1,
  },
  {
    parameter: "jawTaper",
    positiveTarget: IDENTITY_MORPH_TARGET.JAW_TAPER_SQUARE,
    negativeTarget: IDENTITY_MORPH_TARGET.JAW_TAPER_NARROW,
    strength: 0.9,
  },
  {
    parameter: "eyeSpacing",
    positiveTarget: IDENTITY_MORPH_TARGET.EYE_SPACING_WIDE,
    negativeTarget: IDENTITY_MORPH_TARGET.EYE_SPACING_NARROW,
    strength: 0.9,
  },
  {
    parameter: "eyeWidth",
    positiveTarget: IDENTITY_MORPH_TARGET.EYE_WIDTH_WIDE,
    negativeTarget: IDENTITY_MORPH_TARGET.EYE_WIDTH_NARROW,
    strength: 0.8,
  },
  {
    parameter: "browArch",
    positiveTarget: IDENTITY_MORPH_TARGET.BROW_ARCH_HIGH,
    negativeTarget: IDENTITY_MORPH_TARGET.BROW_ARCH_LOW,
    strength: 0.72,
  },
  {
    parameter: "browProminence",
    positiveTarget: IDENTITY_MORPH_TARGET.BROW_PROMINENCE_HIGH,
    negativeTarget: IDENTITY_MORPH_TARGET.BROW_PROMINENCE_LOW,
    strength: 0.68,
  },
  {
    parameter: "noseWidth",
    positiveTarget: IDENTITY_MORPH_TARGET.NOSE_WIDE,
    negativeTarget: IDENTITY_MORPH_TARGET.NOSE_NARROW,
    strength: 0.9,
  },
  {
    parameter: "noseLength",
    positiveTarget: IDENTITY_MORPH_TARGET.NOSE_LONG,
    negativeTarget: IDENTITY_MORPH_TARGET.NOSE_SHORT,
    strength: 0.88,
  },
  {
    parameter: "noseProjection",
    positiveTarget: IDENTITY_MORPH_TARGET.NOSE_PROJECTION_HIGH,
    negativeTarget: IDENTITY_MORPH_TARGET.NOSE_PROJECTION_LOW,
    strength: 0.76,
  },
  {
    parameter: "mouthWidth",
    positiveTarget: IDENTITY_MORPH_TARGET.MOUTH_WIDE,
    negativeTarget: IDENTITY_MORPH_TARGET.MOUTH_NARROW,
    strength: 0.88,
  },
  {
    parameter: "chinLength",
    positiveTarget: IDENTITY_MORPH_TARGET.CHIN_LONG,
    negativeTarget: IDENTITY_MORPH_TARGET.CHIN_SHORT,
    strength: 0.9,
  },
  {
    parameter: "headDepth",
    positiveTarget: IDENTITY_MORPH_TARGET.HEAD_DEPTH_HIGH,
    negativeTarget: IDENTITY_MORPH_TARGET.HEAD_DEPTH_LOW,
    strength: 0.82,
  },
];

const MORPH_CALIBRATION = {
  faceWidth: { positiveGain: 1, negativeGain: 1, maximumWeight: 1 },
  faceLength: { positiveGain: 1, negativeGain: 1, maximumWeight: 1 },
  foreheadWidth: { positiveGain: 1, negativeGain: 1, maximumWeight: 1 },
  upperFaceHeight: { positiveGain: 1, negativeGain: 1, maximumWeight: 1 },
  cheekboneWidth: { positiveGain: 1, negativeGain: 1, maximumWeight: 1 },
  jawWidth: { positiveGain: 1.4, negativeGain: 1.4, maximumWeight: 1.4 },
  jawTaper: { positiveGain: 1.15, negativeGain: 1.15, maximumWeight: 1 },
  eyeSpacing: { positiveGain: 1.1, negativeGain: 1.1, maximumWeight: 1 },
  eyeWidth: { positiveGain: 1.25, negativeGain: 1.25, maximumWeight: 1 },
  browArch: { positiveGain: 1.35, negativeGain: 1.35, maximumWeight: 1 },
  browProminence: { positiveGain: 1.5, negativeGain: 1.5, maximumWeight: 1.1 },
  noseWidth: { positiveGain: 1.1, negativeGain: 1.1, maximumWeight: 1 },
  noseLength: { positiveGain: 1.1, negativeGain: 1.1, maximumWeight: 1 },
  noseProjection: {
    positiveGain: 1.35,
    negativeGain: 1.35,
    maximumWeight: 1.05,
  },
  mouthWidth: { positiveGain: 1.1, negativeGain: 1.1, maximumWeight: 1 },
  chinLength: { positiveGain: 1.1, negativeGain: 1.1, maximumWeight: 1 },
  headDepth: { positiveGain: 1.1, negativeGain: 1.1, maximumWeight: 0.95 },
};

const SHAPE_PRESETS = [
  {
    id: "neutral",
    label: "Neutral",
    description: "The tuned product baseline.",
    parameters: {},
  },
  {
    id: "oval",
    label: "Oval",
    description: "Longer centerline with a softly tapered jaw.",
    parameters: {
      faceWidth: 0.86,
      faceLength: 1.24,
      foreheadWidth: 0.88,
      upperFaceHeight: 0.33,
      cheekWidth: 0.96,
      jawWidth: 0.72,
      jawTaper: 0.7,
      chinLength: 0.27,
    },
  },
  {
    id: "wide",
    label: "Wide",
    description: "Broad forehead, cheek, and jaw proportions.",
    parameters: {
      faceWidth: 1.07,
      faceLength: 1.08,
      foreheadWidth: 1.02,
      upperFaceHeight: 0.31,
      cheekWidth: 1.09,
      jawWidth: 0.94,
      jawTaper: 0.92,
      chinLength: 0.22,
    },
  },
  {
    id: "long",
    label: "Long",
    description: "Narrower width with an extended face centerline.",
    parameters: {
      faceWidth: 0.82,
      faceLength: 1.34,
      foreheadWidth: 0.84,
      upperFaceHeight: 0.4,
      cheekWidth: 0.9,
      jawWidth: 0.7,
      jawTaper: 0.72,
      chinLength: 0.32,
    },
  },
  {
    id: "soft",
    label: "Soft",
    description: "Shorter centerline with fuller cheeks and a soft chin.",
    parameters: {
      faceWidth: 1.03,
      faceLength: 1.04,
      foreheadWidth: 1,
      upperFaceHeight: 0.29,
      cheekWidth: 1.12,
      jawWidth: 0.84,
      jawTaper: 0.84,
      chinLength: 0.18,
    },
  },
  {
    id: "tapered",
    label: "Tapered",
    description: "Wider upper face with a more defined chin taper.",
    parameters: {
      faceWidth: 0.96,
      faceLength: 1.17,
      foreheadWidth: 1.08,
      upperFaceHeight: 0.35,
      cheekWidth: 1.03,
      jawWidth: 0.65,
      jawTaper: 0.6,
      chinLength: 0.3,
    },
  },
  {
    id: "angular",
    label: "Angular",
    description: "Pronounced cheek width with a narrower forehead and jaw.",
    parameters: {
      faceWidth: 0.94,
      faceLength: 1.19,
      foreheadWidth: 0.83,
      upperFaceHeight: 0.34,
      cheekWidth: 1.13,
      jawWidth: 0.69,
      jawTaper: 0.66,
      chinLength: 0.28,
    },
  },
];

const STRUCTURE_PRESETS = [
  {
    id: "balanced",
    label: "Balanced",
    description: "Measured proportions with restrained definition.",
    morphWeights: {
      [IDENTITY_MORPH_TARGET.STRUCTURE_STRUCTURED]: 0.18,
    },
  },
  {
    id: "structured",
    label: "Structured",
    description: "Firmer brow, jaw, and chin planes.",
    morphWeights: {
      [IDENTITY_MORPH_TARGET.STRUCTURE_STRUCTURED]: 0.72,
    },
  },
  {
    id: "soft",
    label: "Soft",
    description: "Smoother transitions across the facial planes.",
    morphWeights: {
      [IDENTITY_MORPH_TARGET.STRUCTURE_SOFT]: 0.58,
    },
  },
];

const readJson = async (filePath) => {
  return JSON.parse(await readFile(filePath, "utf8"));
};

const writeJson = async (filePath, value) => {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`);
};

export const buildIdentityShellModuleManifest = (releaseManifest) => {
  assertSemanticVersion(releaseManifest.version);
  return {
    schemaVersion: ASSET_MODULE_SCHEMA_VERSION,
    asset: {
      name: "identity-shell",
      displayName: "Identity Shell",
      module: "identity-shell",
      version: releaseManifest.version,
      releaseTag: releaseManifest.releaseTag,
    },
    parameters: {
      version: releaseManifest.assetSchemaVersion,
      neutral: FACE_SHELL_PARAMETERS,
      productBaseline: PRODUCT_BASELINE_PARAMETERS,
      safeRanges: PARAMETER_RANGES,
    },
    morphs: {
      targetNames: releaseManifest.morphTargetNames,
      identityBindings: IDENTITY_MORPH_BINDINGS,
      calibration: MORPH_CALIBRATION,
      corrective: [
        {
          target: IDENTITY_MORPH_TARGET.JAW_WIDE_CHIN_LONG_CORRECTIVE,
          strength: 0.55,
          drivers: [
            { parameter: "jawWidth", direction: "positive" },
            { parameter: "chinLength", direction: "positive" },
          ],
        },
      ],
      presentation: [
        {
          preset: "structured",
          target: IDENTITY_MORPH_TARGET.STRUCTURE_STRUCTURED,
        },
        {
          preset: "soft",
          target: IDENTITY_MORPH_TARGET.STRUCTURE_SOFT,
        },
      ],
    },
    presets: {
      shape: SHAPE_PRESETS,
      structure: STRUCTURE_PRESETS,
    },
    validationLimits: {
      maximumMorphEdgeStrain: 0.72,
      floatingPointTolerance: 0.00001,
    },
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

export const writeIdentityShellModuleManifest = async (version) => {
  const releaseManifest = await readJson(
    path.join(IDENTITY_SHELL_RELEASE_ROOT, version, "manifest.json"),
  );
  const moduleManifest = buildIdentityShellModuleManifest(releaseManifest);
  await writeJson(
    path.join(IDENTITY_SHELL_RELEASE_ROOT, version, "module-manifest.json"),
    moduleManifest,
  );
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
          moduleManifest: `assets/releases/identity-shell/${version}/module-manifest.json`,
          version: moduleManifest.asset.version,
        },
        null,
        2,
      ),
    );
  }
}

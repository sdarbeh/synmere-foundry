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
export const REQUIRED_BASELINE_SHAPE_PRESET_ID = "baseline";
export const ASSET_MODULE_PARAMETER_GROUP_IDS = [
  "silhouette",
  "facialGeometry",
];
export const REQUIRED_ASSET_MODULE_MATERIAL_ID = "ceramic";
export const REQUIRED_ASSET_MODULE_DISPLAY_MODE_ID = "preview";
export const ASSET_MODULE_MATERIAL_IDS = ["ceramic", "obsidian"];
export const ASSET_MODULE_DISPLAY_MODE_IDS = ["preview", "trace", "topology"];
export const SHAPE_PRESET_ARCHETYPES = [
  "baseline",
  "oval",
  "broad",
  "long",
  "round",
  "heart",
  "diamond",
];
export const SHAPE_PRESET_STRENGTHS = ["subtle", "moderate", "strong"];
export const SHAPE_PRESET_EMPHASIS = [
  "width",
  "length",
  "forehead",
  "cheeks",
  "jaw",
  "chin",
  "eyes",
  "brow",
  "nose",
  "mouth",
  "depth",
];
export const ASSET_MODULE_TRACE_REGION_IDS = [
  "brows",
  "lids",
  "nose",
  "lips",
  "cheeks",
  "jaw",
];

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

const assertNonEmptyString = (value, label) => {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${label} must be a non-empty string.`);
  }
};

const assertNumber = (value, label) => {
  if (!Number.isFinite(value)) {
    throw new Error(`${label} must be finite.`);
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
  assertRecord(
    moduleManifest.parameters.authoringRanges,
    "Authoring parameter ranges",
  );
  assertArray(moduleManifest.parameterGroups, "Parameter groups");

  const parameterKeys = Object.keys(moduleManifest.parameters.neutral);
  const parameterKeySet = new Set(parameterKeys);
  [
    ["productBaseline", moduleManifest.parameters.productBaseline],
    ["safeRanges", moduleManifest.parameters.safeRanges],
    ["authoringRanges", moduleManifest.parameters.authoringRanges],
  ].forEach(([label, record]) => {
    const recordKeys = Object.keys(record).sort();
    if (
      JSON.stringify(recordKeys) !== JSON.stringify([...parameterKeys].sort())
    ) {
      throw new Error(`${label} keys must match neutral parameter keys.`);
    }
  });

  moduleManifest.parameterGroups.forEach((group) => {
    assertRecord(group, "Parameter group");
    assertNonEmptyString(group.id, "Parameter group id");
    assertNonEmptyString(
      group.labelKey,
      `Parameter group ${group.id} labelKey`,
    );
    assertNonEmptyString(
      group.defaultLabel,
      `Parameter group ${group.id} defaultLabel`,
    );
    assertNonEmptyString(
      group.descriptionKey,
      `Parameter group ${group.id} descriptionKey`,
    );
    assertNonEmptyString(
      group.defaultDescription,
      `Parameter group ${group.id} defaultDescription`,
    );
    assertArray(group.parameterKeys, `Parameter group ${group.id} keys`);
    group.parameterKeys.forEach((parameterKey) => {
      if (!parameterKeySet.has(parameterKey)) {
        throw new Error(
          `Parameter group ${group.id} references unknown parameter ${parameterKey}.`,
        );
      }
    });
  });

  const groupIds = moduleManifest.parameterGroups.map((group) => group.id);
  ASSET_MODULE_PARAMETER_GROUP_IDS.forEach((groupId) => {
    if (!groupIds.includes(groupId)) {
      throw new Error(`Asset module manifest is missing group ${groupId}.`);
    }
  });

  assertRecord(moduleManifest.capabilities, "Asset module capabilities");
  assertArray(
    moduleManifest.capabilities.materials,
    "Asset module material capabilities",
  );
  assertArray(
    moduleManifest.capabilities.displayModes,
    "Asset module display mode capabilities",
  );

  const validateCapability = (capability, supportedIds, label) => {
    assertRecord(capability, label);
    assertNonEmptyString(capability.id, `${label} id`);
    if (!supportedIds.includes(capability.id)) {
      throw new Error(`${label} has unknown id ${capability.id}.`);
    }
    assertNonEmptyString(capability.labelKey, `${label} labelKey`);
    assertNonEmptyString(capability.defaultLabel, `${label} defaultLabel`);
    if (typeof capability.required !== "boolean") {
      throw new Error(`${label} required must be boolean.`);
    }
  };

  moduleManifest.capabilities.materials.forEach((capability) => {
    validateCapability(
      capability,
      ASSET_MODULE_MATERIAL_IDS,
      "Material capability",
    );
  });
  moduleManifest.capabilities.displayModes.forEach((capability) => {
    validateCapability(
      capability,
      ASSET_MODULE_DISPLAY_MODE_IDS,
      "Display mode capability",
    );
  });

  const materialIds = moduleManifest.capabilities.materials.map(
    (capability) => capability.id,
  );
  const displayModeIds = moduleManifest.capabilities.displayModes.map(
    (capability) => capability.id,
  );
  if (new Set(materialIds).size !== materialIds.length) {
    throw new Error("Asset module material capability ids must be unique.");
  }
  if (new Set(displayModeIds).size !== displayModeIds.length) {
    throw new Error("Asset module display mode capability ids must be unique.");
  }
  if (!materialIds.includes(REQUIRED_ASSET_MODULE_MATERIAL_ID)) {
    throw new Error(
      `Asset module manifest must support ${REQUIRED_ASSET_MODULE_MATERIAL_ID}.`,
    );
  }
  if (!displayModeIds.includes(REQUIRED_ASSET_MODULE_DISPLAY_MODE_ID)) {
    throw new Error(
      `Asset module manifest must support ${REQUIRED_ASSET_MODULE_DISPLAY_MODE_ID}.`,
    );
  }
  const requiredMaterial = moduleManifest.capabilities.materials.find(
    (capability) => capability.id === REQUIRED_ASSET_MODULE_MATERIAL_ID,
  );
  const requiredDisplayMode = moduleManifest.capabilities.displayModes.find(
    (capability) => capability.id === REQUIRED_ASSET_MODULE_DISPLAY_MODE_ID,
  );
  if (!requiredMaterial?.required) {
    throw new Error(
      `${REQUIRED_ASSET_MODULE_MATERIAL_ID} material capability must be required.`,
    );
  }
  if (!requiredDisplayMode?.required) {
    throw new Error(
      `${REQUIRED_ASSET_MODULE_DISPLAY_MODE_ID} display mode capability must be required.`,
    );
  }

  assertRecord(moduleManifest.overlays, "Asset module overlays");
  assertRecord(moduleManifest.overlays.trace, "Semantic trace overlay");
  const trace = moduleManifest.overlays.trace;
  if (
    trace.schemaVersion !== "semantic-trace-v1" &&
    trace.schemaVersion !== "semantic-trace-v2" &&
    trace.schemaVersion !== "semantic-trace-v4"
  ) {
    throw new Error(
      "Semantic trace schemaVersion must be semantic-trace-v1, semantic-trace-v2, or semantic-trace-v4.",
    );
  }
  assertArray(trace.paths, "Semantic trace paths");
  const tracePathIds = new Set();
  if (trace.schemaVersion === "semantic-trace-v4") {
    assertNumber(trace.surfaceOffset, "Semantic trace surfaceOffset");
    if (trace.surfaceOffset < 0 || trace.surfaceOffset > 0.02) {
      throw new Error(
        "Semantic trace surfaceOffset must be between 0 and 0.02.",
      );
    }
    trace.paths.forEach((tracePath) => {
      assertRecord(tracePath, "Barycentric semantic trace path");
      assertNonEmptyString(tracePath.id, "Semantic trace path id");
      if (tracePathIds.has(tracePath.id)) {
        throw new Error(
          `Semantic trace path id ${tracePath.id} must be unique.`,
        );
      }
      tracePathIds.add(tracePath.id);
      if (typeof tracePath.closed !== "boolean") {
        throw new Error(
          `Semantic trace path ${tracePath.id} closed must be boolean.`,
        );
      }
      if (
        tracePath.emphasis !== undefined &&
        tracePath.emphasis !== "primary" &&
        tracePath.emphasis !== "secondary"
      ) {
        throw new Error(
          `Semantic trace path ${tracePath.id} emphasis must be primary or secondary.`,
        );
      }
      assertArray(
        tracePath.samples,
        `Semantic trace path ${tracePath.id} samples`,
      );
      if (tracePath.samples.length < 2) {
        throw new Error(
          `Semantic trace path ${tracePath.id} needs two samples.`,
        );
      }
      tracePath.samples.forEach((sample, sampleIndex) => {
        assertRecord(sample, `Semantic trace path ${tracePath.id} sample`);
        if (
          !Number.isSafeInteger(sample.triangleIndex) ||
          sample.triangleIndex < 0
        ) {
          throw new Error(
            `Semantic trace path ${tracePath.id} has an invalid triangle index.`,
          );
        }
        assertArray(
          sample.barycentric,
          `Semantic trace path ${tracePath.id} barycentric weights`,
        );
        if (sample.barycentric.length !== 3) {
          throw new Error(
            `Semantic trace path ${tracePath.id} needs three barycentric weights.`,
          );
        }
        sample.barycentric.forEach((weight) => {
          assertNumber(
            weight,
            `Semantic trace path ${tracePath.id} barycentric weight`,
          );
          if (weight < -1e-6 || weight > 1 + 1e-6) {
            throw new Error(
              `Semantic trace path ${tracePath.id} has an invalid barycentric weight.`,
            );
          }
        });
        const totalWeight = sample.barycentric.reduce(
          (total, weight) => total + weight,
          0,
        );
        if (Math.abs(totalWeight - 1) > 1e-6) {
          throw new Error(
            `Semantic trace path ${tracePath.id} barycentric weights must sum to one.`,
          );
        }
        const previous = tracePath.samples[sampleIndex - 1];
        if (previous && JSON.stringify(previous) === JSON.stringify(sample)) {
          throw new Error(
            `Semantic trace path ${tracePath.id} has consecutive duplicate samples.`,
          );
        }
      });
    });
    if (trace.nodes !== undefined) {
      assertArray(trace.nodes, "Semantic trace nodes");
      const traceNodeIds = new Set();
      trace.nodes.forEach((traceNode) => {
        assertRecord(traceNode, "Barycentric semantic trace node");
        assertNonEmptyString(traceNode.id, "Semantic trace node id");
        if (traceNodeIds.has(traceNode.id)) {
          throw new Error(
            `Semantic trace node id ${traceNode.id} must be unique.`,
          );
        }
        traceNodeIds.add(traceNode.id);
        if (traceNode.role !== "normal" && traceNode.role !== "accent") {
          throw new Error(
            `Semantic trace node ${traceNode.id} role must be normal or accent.`,
          );
        }
        assertRecord(traceNode.sample, `Semantic trace node ${traceNode.id}`);
        if (
          !Number.isSafeInteger(traceNode.sample.triangleIndex) ||
          traceNode.sample.triangleIndex < 0
        ) {
          throw new Error(
            `Semantic trace node ${traceNode.id} has an invalid triangle index.`,
          );
        }
        assertArray(
          traceNode.sample.barycentric,
          `Semantic trace node ${traceNode.id} barycentric weights`,
        );
        if (traceNode.sample.barycentric.length !== 3) {
          throw new Error(
            `Semantic trace node ${traceNode.id} needs three barycentric weights.`,
          );
        }
        traceNode.sample.barycentric.forEach((weight) => {
          assertNumber(
            weight,
            `Semantic trace node ${traceNode.id} barycentric weight`,
          );
          if (weight < -1e-6 || weight > 1 + 1e-6) {
            throw new Error(
              `Semantic trace node ${traceNode.id} has an invalid barycentric weight.`,
            );
          }
        });
        const totalWeight = traceNode.sample.barycentric.reduce(
          (total, weight) => total + weight,
          0,
        );
        if (Math.abs(totalWeight - 1) > 1e-6) {
          throw new Error(
            `Semantic trace node ${traceNode.id} barycentric weights must sum to one.`,
          );
        }
      });
    }
  } else {
    assertNumber(trace.normalOffset, "Semantic trace normalOffset");
    if (trace.normalOffset < 0 || trace.normalOffset > 0.02) {
      throw new Error(
        "Semantic trace normalOffset must be between 0 and 0.02.",
      );
    }
    trace.paths.forEach((tracePath) => {
      assertRecord(tracePath, "Semantic trace path");
      assertNonEmptyString(tracePath.id, "Semantic trace path id");
      if (tracePathIds.has(tracePath.id)) {
        throw new Error(
          `Semantic trace path id ${tracePath.id} must be unique.`,
        );
      }
      tracePathIds.add(tracePath.id);
      if (!ASSET_MODULE_TRACE_REGION_IDS.includes(tracePath.region)) {
        throw new Error(
          `Semantic trace path ${tracePath.id} has unknown region ${tracePath.region}.`,
        );
      }
      const isProjectedTrace = trace.schemaVersion === "semantic-trace-v2";
      if (isProjectedTrace) {
        if (!["primary", "secondary"].includes(tracePath.role)) {
          throw new Error(
            `Semantic trace path ${tracePath.id} has unknown role ${tracePath.role}.`,
          );
        }
      } else {
        if (!["cyan", "violet"].includes(tracePath.palette)) {
          throw new Error(
            `Semantic trace path ${tracePath.id} has unknown palette ${tracePath.palette}.`,
          );
        }
        if (!["primary", "secondary"].includes(tracePath.emphasis)) {
          throw new Error(
            `Semantic trace path ${tracePath.id} has unknown emphasis ${tracePath.emphasis}.`,
          );
        }
      }
      if (typeof tracePath.closed !== "boolean") {
        throw new Error(
          `Semantic trace path ${tracePath.id} closed must be boolean.`,
        );
      }
      const guideVertexIndices = isProjectedTrace
        ? tracePath.guideVertexIndices
        : tracePath.vertexIndices;
      assertArray(
        guideVertexIndices,
        `Semantic trace path ${tracePath.id} guide vertices`,
      );
      assertArray(
        tracePath.controlVertexIndices,
        `Semantic trace path ${tracePath.id} controlVertexIndices`,
      );
      assertArray(
        tracePath.nodeVertexIndices,
        `Semantic trace path ${tracePath.id} nodeVertexIndices`,
      );
      if (tracePath.controlVertexIndices.length < 2) {
        throw new Error(
          `Semantic trace path ${tracePath.id} needs two semantic controls.`,
        );
      }
      if (guideVertexIndices.length < 2) {
        throw new Error(
          `Semantic trace path ${tracePath.id} needs two vertices.`,
        );
      }
      guideVertexIndices.forEach((vertexIndex, index) => {
        if (!Number.isSafeInteger(vertexIndex) || vertexIndex < 0) {
          throw new Error(
            `Semantic trace path ${tracePath.id} has an invalid vertex index.`,
          );
        }
        if (index > 0 && vertexIndex === guideVertexIndices[index - 1]) {
          throw new Error(
            `Semantic trace path ${tracePath.id} has consecutive duplicate vertices.`,
          );
        }
      });
      tracePath.controlVertexIndices.forEach((vertexIndex) => {
        if (
          !Number.isSafeInteger(vertexIndex) ||
          !guideVertexIndices.includes(vertexIndex)
        ) {
          throw new Error(
            `Semantic trace path ${tracePath.id} has a control outside its frozen path.`,
          );
        }
      });
      tracePath.nodeVertexIndices.forEach((vertexIndex) => {
        if (!tracePath.controlVertexIndices.includes(vertexIndex)) {
          throw new Error(
            `Semantic trace path ${tracePath.id} has a node outside its controls.`,
          );
        }
      });
      if (isProjectedTrace) {
        assertArray(
          tracePath.accentNodeVertexIndices,
          `Semantic trace path ${tracePath.id} accentNodeVertexIndices`,
        );
        tracePath.accentNodeVertexIndices.forEach((vertexIndex) => {
          if (!tracePath.nodeVertexIndices.includes(vertexIndex)) {
            throw new Error(
              `Semantic trace path ${tracePath.id} has an accent node outside its nodes.`,
            );
          }
        });
        assertArray(
          tracePath.accentSegments,
          `Semantic trace path ${tracePath.id} accentSegments`,
        );
        tracePath.accentSegments.forEach((segment) => {
          assertRecord(segment, "Semantic trace accent segment");
          assertArray(
            segment.controlVertexIndices,
            `Semantic trace path ${tracePath.id} accent control vertices`,
          );
          assertArray(
            segment.guideVertexIndices,
            `Semantic trace path ${tracePath.id} accent guide vertices`,
          );
          if (
            segment.controlVertexIndices.length < 2 ||
            segment.guideVertexIndices.length < 2
          ) {
            throw new Error(
              `Semantic trace path ${tracePath.id} accent segment needs two vertices.`,
            );
          }
          segment.controlVertexIndices.forEach((vertexIndex) => {
            if (!segment.guideVertexIndices.includes(vertexIndex)) {
              throw new Error(
                `Semantic trace path ${tracePath.id} has an accent control outside its guide.`,
              );
            }
          });
        });
      }
      if (
        tracePath.closed &&
        guideVertexIndices[0] !== guideVertexIndices.at(-1)
      ) {
        throw new Error(
          `Closed semantic trace path ${tracePath.id} must close.`,
        );
      }
    });
  }

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
  moduleManifest.morphs.identityBindings.forEach((binding) => {
    if (!parameterKeySet.has(binding.parameter)) {
      throw new Error(
        `Identity morph binding references unknown parameter ${binding.parameter}.`,
      );
    }
  });
  Object.keys(moduleManifest.morphs.calibration).forEach((parameterKey) => {
    if (!parameterKeySet.has(parameterKey)) {
      throw new Error(
        `Morph calibration references unknown parameter ${parameterKey}.`,
      );
    }
  });
  moduleManifest.morphs.corrective.forEach((binding) => {
    binding.drivers.forEach((driver) => {
      if (!parameterKeySet.has(driver.parameter)) {
        throw new Error(
          `Corrective morph driver references unknown parameter ${driver.parameter}.`,
        );
      }
    });
  });

  assertRecord(moduleManifest.presets, "Asset module presets");
  assertArray(moduleManifest.presets.shape, "Shape presets");
  assertArray(moduleManifest.presets.structure, "Structure presets");
  if (moduleManifest.presets.shape.length === 0) {
    throw new Error("Asset module manifest must define shape presets.");
  }
  if (
    !moduleManifest.presets.shape.some((preset) => {
      return preset.id === REQUIRED_BASELINE_SHAPE_PRESET_ID;
    })
  ) {
    throw new Error(
      `Asset module manifest must define the required ${REQUIRED_BASELINE_SHAPE_PRESET_ID} shape preset.`,
    );
  }
  moduleManifest.presets.shape.forEach((preset) => {
    assertRecord(preset, "Shape preset");
    assertNonEmptyString(preset.id, "Shape preset id");
    assertNonEmptyString(preset.labelKey, `Shape preset ${preset.id} labelKey`);
    assertNonEmptyString(
      preset.defaultLabel,
      `Shape preset ${preset.id} defaultLabel`,
    );
    assertNonEmptyString(
      preset.descriptionKey,
      `Shape preset ${preset.id} descriptionKey`,
    );
    assertNonEmptyString(
      preset.defaultDescription,
      `Shape preset ${preset.id} defaultDescription`,
    );
    if (!["productBaseline", "neutral"].includes(preset.baseParameters)) {
      throw new Error(`Shape preset ${preset.id} has invalid baseParameters.`);
    }
    assertRecord(preset.intent, `Shape preset ${preset.id} intent`);
    if (!SHAPE_PRESET_ARCHETYPES.includes(preset.intent.archetype)) {
      throw new Error(`Shape preset ${preset.id} has invalid archetype.`);
    }
    if (!SHAPE_PRESET_STRENGTHS.includes(preset.intent.strength)) {
      throw new Error(`Shape preset ${preset.id} has invalid strength.`);
    }
    assertArray(preset.intent.emphasis, `Shape preset ${preset.id} emphasis`);
    preset.intent.emphasis.forEach((emphasis) => {
      if (!SHAPE_PRESET_EMPHASIS.includes(emphasis)) {
        throw new Error(
          `Shape preset ${preset.id} has invalid emphasis ${emphasis}.`,
        );
      }
    });
    assertRecord(preset.parameters, `Shape preset ${preset.id} parameters`);
    Object.entries(preset.parameters).forEach(([parameterKey, value]) => {
      if (!parameterKeySet.has(parameterKey)) {
        throw new Error(
          `Shape preset ${preset.id} references unknown parameter ${parameterKey}.`,
        );
      }
      assertNumber(value, `Shape preset ${preset.id}.${parameterKey}`);
      const range = moduleManifest.parameters.safeRanges[parameterKey];
      if (value < range.min || value > range.max) {
        throw new Error(
          `Shape preset ${preset.id}.${parameterKey} is outside safeRanges.`,
        );
      }
    });
  });
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
      authoringRanges: moduleManifest.parameters.authoringRanges,
    },
    parameterGroups: moduleManifest.parameterGroups,
    capabilities: moduleManifest.capabilities,
    overlays: moduleManifest.overlays,
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

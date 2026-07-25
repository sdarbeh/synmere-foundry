import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

import {
  assertReleaseDoesNotExist,
  assertSemanticVersion,
  getReleaseTag,
} from "../scripts/release/release-policy.mjs";
import { validateReleaseDirectory } from "../scripts/release/validate-release.mjs";
import {
  ASSET_RELEASES,
  ASSET_PROMOTIONS,
  IDENTITY_SHELL_RELEASES,
  getAssetRelease,
  getAssetReleaseHistory,
  getLatestProductionAssetRelease,
  identityShell,
  identityShellModule,
} from "../packages/manifest/index.js";
import { SYNMERE_SCHEMA_VERSION } from "../packages/schema/index.js";
import { validateReleasedAssetScene } from "../packages/three/index.js";

const PROJECT_ROOT = process.cwd();

test("the current immutable release is internally consistent", async () => {
  const result = await validateReleaseDirectory(
    path.join(PROJECT_ROOT, "assets/releases/identity-shell/1.0.0"),
    "1.0.0",
  );

  assert.equal(result.passed, true);
  assert.equal(result.globalAssetSafetyValidation.sampledStates, 193);
});

test("release policy requires semantic versions and refuses overwrite", async () => {
  assert.doesNotThrow(() => assertSemanticVersion("1.0.0"));
  assert.equal(getReleaseTag("1.0.0"), "identity-shell-v1.0.0");
  assert.throws(() => assertSemanticVersion("safety-latest"));
  await assert.rejects(
    assertReleaseDoesNotExist(
      path.join(PROJECT_ROOT, "assets/releases/identity-shell/1.0.0"),
    ),
    /already exists/u,
  );
});

test("the Foundry uses the platform repository name", async () => {
  const rootPackage = JSON.parse(
    await readFile(path.join(PROJECT_ROOT, "package.json"), "utf8"),
  );

  assert.equal(rootPackage.name, "synmere-foundry");
});

test("the Foundry-owned manifest package matches the current release", async () => {
  const currentManifest = JSON.parse(
    await readFile(
      path.join(PROJECT_ROOT, "manifests/identity-shell.current.json"),
      "utf8",
    ),
  );
  const currentModuleManifest = JSON.parse(
    await readFile(
      path.join(PROJECT_ROOT, "manifests/identity-shell.module.json"),
      "utf8",
    ),
  );
  const promotionRegistry = JSON.parse(
    await readFile(
      path.join(PROJECT_ROOT, "manifests/asset-promotions.json"),
      "utf8",
    ),
  );

  assert.equal(identityShell.version, currentManifest.version);
  assert.equal(identityShell.sha256, currentManifest.sha256);
  assert.equal(
    identityShellModule.asset.version,
    currentModuleManifest.asset.version,
  );
  assert.equal(ASSET_PROMOTIONS.length, promotionRegistry.length);
});

test("the Foundry-owned manifest package exposes every loadable shell release", () => {
  assert.deepEqual(
    IDENTITY_SHELL_RELEASES.map((release) => release.version),
    ["1.0.0"],
  );
  assert.deepEqual(
    getAssetReleaseHistory("identity-shell").map((release) => release.version),
    ["1.0.0"],
  );
  assert.equal(
    getLatestProductionAssetRelease("identity-shell").version,
    identityShell.version,
  );
  assert.equal(
    getAssetRelease("identity-shell", "1.0.0").url,
    "/models/shell/identity-shell/1.0.0/identity-shell.glb",
  );
  assert.equal(
    getAssetRelease("identity-shell", "1.0.0").sha256,
    identityShell.sha256,
  );
  assert.equal(ASSET_RELEASES.length, IDENTITY_SHELL_RELEASES.length);
});

test("the identity shell asset module cannot drift from its GLB contract", () => {
  const morphTargets = new Set(identityShellModule.morphs.targetNames);
  const parameterKeys = Object.keys(identityShellModule.parameters.neutral);
  const calibratedIdentityParameters = new Set(
    Object.keys(identityShellModule.morphs.calibration),
  );

  assert.deepEqual(
    [...morphTargets].sort(),
    [...identityShell.morphTargetNames].sort(),
  );
  assert.deepEqual(
    Object.keys(identityShellModule.parameters.productBaseline).sort(),
    parameterKeys.sort(),
  );
  assert.deepEqual(
    Object.keys(identityShellModule.parameters.safeRanges).sort(),
    parameterKeys.sort(),
  );
  assert.deepEqual(
    Object.keys(identityShellModule.parameters.authoringRanges).sort(),
    parameterKeys.sort(),
  );
  assert.deepEqual(
    identityShellModule.parameterGroups.map((group) => group.id),
    ["silhouette", "facialGeometry"],
  );
  identityShellModule.parameterGroups.forEach((group) => {
    assert.equal(typeof group.labelKey, "string");
    assert.equal(typeof group.defaultLabel, "string");
    assert.equal(typeof group.descriptionKey, "string");
    assert.equal(typeof group.defaultDescription, "string");
    group.parameterKeys.forEach((parameterKey) => {
      assert.equal(
        parameterKeys.includes(parameterKey),
        true,
        `Parameter group ${group.id} references unknown parameter ${parameterKey}.`,
      );
    });
  });
  assert.deepEqual(
    identityShellModule.capabilities.materials.map((capability) => ({
      id: capability.id,
      required: capability.required,
      defaultLabel: capability.defaultLabel,
    })),
    [
      { id: "ceramic", required: true, defaultLabel: "Ceramic" },
      { id: "obsidian", required: false, defaultLabel: "Obsidian" },
    ],
  );
  assert.deepEqual(
    identityShellModule.capabilities.displayModes.map((capability) => ({
      id: capability.id,
      required: capability.required,
      defaultLabel: capability.defaultLabel,
    })),
    [
      { id: "preview", required: true, defaultLabel: "Preview" },
      { id: "trace", required: false, defaultLabel: "Trace" },
      { id: "topology", required: false, defaultLabel: "Topology" },
    ],
  );

  identityShellModule.morphs.identityBindings.forEach((binding) => {
    assert.equal(
      parameterKeys.includes(binding.parameter),
      true,
      `Identity binding parameter ${binding.parameter} is not a FaceShellParameter.`,
    );
    assert.equal(
      calibratedIdentityParameters.has(binding.parameter),
      true,
      `Identity binding parameter ${binding.parameter} has no morph calibration.`,
    );
    [binding.positiveTarget, binding.negativeTarget]
      .filter(Boolean)
      .forEach((target) => {
        assert.equal(
          morphTargets.has(target),
          true,
          `Identity binding target ${target} is not in the GLB morph contract.`,
        );
      });
  });

  identityShellModule.morphs.corrective.forEach((binding) => {
    assert.equal(
      morphTargets.has(binding.target),
      true,
      `Corrective target ${binding.target} is not in the GLB morph contract.`,
    );
    binding.drivers.forEach((driver) => {
      assert.equal(
        parameterKeys.includes(driver.parameter),
        true,
        `Corrective driver ${driver.parameter} is not a FaceShellParameter.`,
      );
      assert.equal(
        calibratedIdentityParameters.has(driver.parameter),
        true,
        `Corrective driver ${driver.parameter} has no morph calibration.`,
      );
    });
  });

  identityShellModule.morphs.presentation.forEach((binding) => {
    assert.equal(
      morphTargets.has(binding.target),
      true,
      `Presentation target ${binding.target} is not in the GLB morph contract.`,
    );
  });

  assert.deepEqual(
    identityShellModule.morphs.identityBindings
      .map((binding) => binding.parameter)
      .sort(),
    [...calibratedIdentityParameters].sort(),
  );
  assert.deepEqual(
    [...calibratedIdentityParameters].sort(),
    parameterKeys.sort(),
    "Every morph calibration key must match FaceShellParameters.",
  );
});

test("identity shell presets are candidate-scoped module values", () => {
  const parameterKeys = Object.keys(identityShellModule.parameters.neutral);
  const morphTargets = new Set(identityShellModule.morphs.targetNames);
  const expectedShapePresetCopy = new Map([
    [
      "baseline",
      {
        labelKey: "shell.presets.shape.baseline",
        defaultLabel: "Baseline",
        descriptionKey: "shell.presets.shape.baseline.description",
        defaultDescription: "default authored/product shell reference",
        baseParameters: "productBaseline",
        intent: { archetype: "baseline", strength: "subtle", emphasis: [] },
      },
    ],
    [
      "oval",
      {
        labelKey: "shell.presets.shape.oval",
        defaultLabel: "Oval",
        descriptionKey: "shell.presets.shape.oval.description",
        defaultDescription: "longer, softly tapered face",
        baseParameters: "productBaseline",
        intent: {
          archetype: "oval",
          strength: "moderate",
          emphasis: ["length", "jaw", "chin"],
        },
      },
    ],
    [
      "wide",
      {
        labelKey: "shell.presets.shape.broad",
        defaultLabel: "Broad",
        descriptionKey: "shell.presets.shape.broad.description",
        defaultDescription: "broad forehead, cheeks, and jaw mass",
        baseParameters: "productBaseline",
        intent: {
          archetype: "broad",
          strength: "moderate",
          emphasis: [
            "width",
            "forehead",
            "cheeks",
            "jaw",
            "eyes",
            "nose",
            "mouth",
            "depth",
          ],
        },
      },
    ],
    [
      "long",
      {
        labelKey: "shell.presets.shape.long",
        defaultLabel: "Long",
        descriptionKey: "shell.presets.shape.long.description",
        defaultDescription: "taller, narrower face",
        baseParameters: "productBaseline",
        intent: {
          archetype: "long",
          strength: "moderate",
          emphasis: ["length", "chin", "depth"],
        },
      },
    ],
    [
      "soft",
      {
        labelKey: "shell.presets.shape.round",
        defaultLabel: "Round",
        descriptionKey: "shell.presets.shape.round.description",
        defaultDescription: "shorter, fuller, softer cheek structure",
        baseParameters: "productBaseline",
        intent: {
          archetype: "round",
          strength: "moderate",
          emphasis: ["cheeks", "chin", "width"],
        },
      },
    ],
    [
      "tapered",
      {
        labelKey: "shell.presets.shape.heart",
        defaultLabel: "Heart",
        descriptionKey: "shell.presets.shape.heart.description",
        defaultDescription: "wider upper face with narrower jaw and chin",
        baseParameters: "productBaseline",
        intent: {
          archetype: "heart",
          strength: "moderate",
          emphasis: ["forehead", "cheeks", "jaw", "chin"],
        },
      },
    ],
    [
      "angular",
      {
        labelKey: "shell.presets.shape.diamond",
        defaultLabel: "Diamond",
        descriptionKey: "shell.presets.shape.diamond.description",
        defaultDescription:
          "pronounced cheek width with narrower forehead and jaw",
        baseParameters: "productBaseline",
        intent: {
          archetype: "diamond",
          strength: "moderate",
          emphasis: ["cheeks", "forehead", "jaw"],
        },
      },
    ],
  ]);
  const shapePresetIds = identityShellModule.presets.shape.map(
    (preset) => preset.id,
  );
  const structurePresetIds = identityShellModule.presets.structure.map(
    (preset) => preset.id,
  );

  assert.equal(new Set(shapePresetIds).size, shapePresetIds.length);
  assert.deepEqual(shapePresetIds, [...expectedShapePresetCopy.keys()]);
  assert.equal(new Set(structurePresetIds).size, structurePresetIds.length);
  assert.equal(
    structurePresetIds.includes("balanced"),
    true,
    "Structure presets must include the required balanced product anchor.",
  );

  identityShellModule.presets.shape.forEach((preset) => {
    const expectedCopy = expectedShapePresetCopy.get(preset.id);
    assert.deepEqual(
      {
        labelKey: preset.labelKey,
        defaultLabel: preset.defaultLabel,
        descriptionKey: preset.descriptionKey,
        defaultDescription: preset.defaultDescription,
        baseParameters: preset.baseParameters,
        intent: preset.intent,
      },
      expectedCopy,
      `Shape preset ${preset.id} copy must come from the asset module manifest.`,
    );

    Object.entries(preset.parameters).forEach(([parameter, value]) => {
      assert.equal(
        parameterKeys.includes(parameter),
        true,
        `Shape preset ${preset.id} references unknown parameter ${parameter}.`,
      );
      const range = identityShellModule.parameters.safeRanges[parameter];
      assert.equal(
        value >= range.min && value <= range.max,
        true,
        `Shape preset ${preset.id}.${parameter} is outside its safe range.`,
      );
    });
  });

  identityShellModule.presets.structure.forEach((preset) => {
    assert.equal(
      Object.keys(preset.morphWeights).length > 0,
      true,
      `Structure preset ${preset.id} must define at least one morph weight.`,
    );
    Object.entries(preset.morphWeights).forEach(([target, value]) => {
      assert.equal(
        morphTargets.has(target),
        true,
        `Structure preset ${preset.id} references unknown morph target ${target}.`,
      );
      assert.equal(
        Number.isFinite(value),
        true,
        `Structure preset ${preset.id}.${target} must be finite.`,
      );
    });
  });
});

test("the Foundry owns the public package surfaces consumed by Synmere", async () => {
  const packageNames = ["manifest", "schema", "three"];
  const packageManifests = await Promise.all(
    packageNames.map(async (packageName) => {
      return JSON.parse(
        await readFile(
          path.join(PROJECT_ROOT, "packages", packageName, "package.json"),
          "utf8",
        ),
      );
    }),
  );

  assert.deepEqual(packageManifests.map((manifest) => manifest.name).sort(), [
    "@synmere/manifest",
    "@synmere/schema",
    "@synmere/three",
  ]);
  assert.equal(SYNMERE_SCHEMA_VERSION, "1.0.0");
  assert.equal(typeof validateReleasedAssetScene, "function");
});

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
  ASSET_PROMOTIONS,
  identityShell,
  identityShellModule,
} from "../packages/manifest/index.js";
import { SYNMERE_SCHEMA_VERSION } from "../packages/schema/index.js";
import { validateReleasedAssetScene } from "../packages/three/index.js";

const PROJECT_ROOT = process.cwd();

test("the current immutable release is internally consistent", async () => {
  const result = await validateReleaseDirectory(
    path.join(PROJECT_ROOT, "assets/releases/identity-shell/1.1.1"),
    "1.1.1",
  );

  assert.equal(result.passed, true);
  assert.equal(result.globalAssetSafetyValidation.sampledStates, 193);
});

test("release policy requires semantic versions and refuses overwrite", async () => {
  assert.doesNotThrow(() => assertSemanticVersion("1.1.2"));
  assert.equal(getReleaseTag("1.1.2"), "identity-shell-v1.1.2");
  assert.throws(() => assertSemanticVersion("safety-latest"));
  await assert.rejects(
    assertReleaseDoesNotExist(
      path.join(PROJECT_ROOT, "assets/releases/identity-shell/1.1.1"),
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

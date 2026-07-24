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

const PROJECT_ROOT = process.cwd();

test("the current immutable release is internally consistent", async () => {
  const result = await validateReleaseDirectory(
    path.join(
      PROJECT_ROOT,
      "assets/releases/identity-shell/1.1.1",
    ),
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
      path.join(
        PROJECT_ROOT,
        "assets/releases/identity-shell/1.1.1",
      ),
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

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

import {
  assertAppResolvablePublicPath,
  assertFoundryAssetVariants,
} from "../scripts/release/asset-variant.mjs";

const checksum = "a".repeat(64);

const createVariantAsset = () => ({
  defaultVariantId: "baseline",
  variants: [
    {
      id: "baseline",
      label: "Baseline",
      description: "Default authored presentation.",
      thumbnails: [],
      presentation: {
        type: "parameter-preset",
        parameterPresetId: "product-baseline",
      },
    },
    {
      id: "authored",
      label: "Authored",
      description: "Authored GLB presentation.",
      thumbnails: [],
      presentation: {
        type: "glb",
        glb: {
          publicPath: "/models/avatar/authored.glb",
          sha256: checksum,
          sizeBytes: 1024,
        },
        modulePublicPath: "/models/avatar/authored.module.json",
      },
    },
  ],
});

test("accepts parameter-preset and GLB asset variant presentations", () => {
  assert.doesNotThrow(() => {
    assertFoundryAssetVariants(createVariantAsset(), {
      parameterPresetIds: ["product-baseline"],
    });
  });
});

test("requires exactly one parent-owned default variant path", () => {
  const missingDefault = createVariantAsset();
  missingDefault.defaultVariantId = "missing";
  assert.throws(
    () =>
      assertFoundryAssetVariants(missingDefault, {
        parameterPresetIds: ["product-baseline"],
      }),
    /does not resolve/u,
  );

  const duplicateDefault = createVariantAsset();
  duplicateDefault.variants[0].default = true;
  assert.throws(
    () =>
      assertFoundryAssetVariants(duplicateDefault, {
        parameterPresetIds: ["product-baseline"],
      }),
    /cannot define default/u,
  );
});

test("rejects duplicate variants and unknown parameter presets", () => {
  const duplicate = createVariantAsset();
  duplicate.variants[1].id = "baseline";
  assert.throws(
    () =>
      assertFoundryAssetVariants(duplicate, {
        parameterPresetIds: ["product-baseline"],
      }),
    /Duplicate variant id/u,
  );

  const unknownPreset = createVariantAsset();
  unknownPreset.variants[0].presentation.parameterPresetId = "unknown";
  assert.throws(
    () =>
      assertFoundryAssetVariants(unknownPreset, {
        parameterPresetIds: ["product-baseline"],
      }),
    /unknown parameter preset/u,
  );
});

test("rejects remote, protocol-relative, and traversing public paths", () => {
  assert.throws(
    () => assertAppResolvablePublicPath("https://example.com/model.glb"),
    /must start with/u,
  );
  assert.throws(
    () => assertAppResolvablePublicPath("//example.com/model.glb"),
    /protocol-relative/u,
  );
  assert.throws(
    () => assertAppResolvablePublicPath("/models/../secret.glb"),
    /cannot traverse/u,
  );
  assert.throws(
    () => assertAppResolvablePublicPath("/models/%2e%2e/secret.glb"),
    /encoded traversal/u,
  );
  assert.doesNotThrow(() => {
    assertAppResolvablePublicPath("/api/dev/foundry-assets/asset/variant/model");
  });
});

test("validates thumbnail source, checksum, and unique ids", () => {
  const invalidSource = createVariantAsset();
  invalidSource.variants[0].thumbnails = [
    {
      id: "front",
      label: "Front",
      kind: "preview",
      source: "remote",
      path: "review/front.png",
      width: 512,
      height: 512,
    },
  ];
  assert.throws(
    () =>
      assertFoundryAssetVariants(invalidSource, {
        parameterPresetIds: ["product-baseline"],
      }),
    /supported Foundry thumbnail source/u,
  );

  const duplicateIds = createVariantAsset();
  const thumbnail = {
    id: "front",
    label: "Front",
    kind: "preview",
    source: "placeholder",
    path: "review/front.png",
    width: 512,
    height: 512,
    sha256: checksum,
  };
  duplicateIds.variants[0].thumbnails = [thumbnail, { ...thumbnail }];
  assert.throws(
    () =>
      assertFoundryAssetVariants(duplicateIds, {
        parameterPresetIds: ["product-baseline"],
      }),
    /duplicate thumbnail id/u,
  );
});

test("the current shell candidate owns its review metadata and variants", async () => {
  const [candidateManifest, assetModule] = await Promise.all([
    readFile(
      path.join(
        process.cwd(),
        "assets/candidates/current/identity-shell-v1.manifest.json",
      ),
      "utf8",
    ).then(JSON.parse),
    readFile(
      path.join(process.cwd(), "manifests/identity-shell.module.json"),
      "utf8",
    ).then(JSON.parse),
  ]);

  assert.equal(candidateManifest.stage, "candidate");
  assert.equal(candidateManifest.assetId, "synmere-identity-shell-v1");
  assert.equal(candidateManifest.displayName, "Identity Shell Candidate");
  assert.equal(candidateManifest.version, assetModule.asset.version);
  assert.equal(candidateManifest.defaultVariantId, "baseline");
  assert.doesNotThrow(() => {
    assertFoundryAssetVariants(candidateManifest, {
      parameterPresetIds: assetModule.presets.shape.map((preset) => preset.id),
    });
  });
});

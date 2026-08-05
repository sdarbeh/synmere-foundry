export const FOUNDRY_ASSET_VARIANT_PRESENTATION_TYPE = Object.freeze({
  GLB: "glb",
  PARAMETER_PRESET: "parameter-preset",
});

const SHA256_PATTERN = /^[a-f0-9]{64}$/u;
const FOUNDRY_ASSET_THUMBNAIL_SOURCES = new Set([
  "blender-render",
  "manual",
  "placeholder",
  "three-render",
]);

const isRecord = (value) => {
  return typeof value === "object" && value !== null && !Array.isArray(value);
};

const isNonEmptyString = (value) => {
  return typeof value === "string" && value.trim().length > 0;
};

const assert = (condition, message) => {
  if (!condition) {
    throw new Error(message);
  }
};

export const assertAppResolvablePublicPath = (
  publicPath,
  label = "Foundry artifact publicPath",
) => {
  assert(isNonEmptyString(publicPath), `${label} is required.`);
  assert(publicPath.startsWith("/"), `${label} must start with /.`);
  assert(!publicPath.startsWith("//"), `${label} cannot be protocol-relative.`);
  assert(!publicPath.includes("\\"), `${label} cannot contain backslashes.`);
  assert(
    !publicPath.split("/").includes(".."),
    `${label} cannot traverse parent directories.`,
  );

  let resolved;
  try {
    resolved = new URL(publicPath, "https://app.synmere.local");
  } catch {
    throw new Error(`${label} must be an app-resolvable path.`);
  }

  assert(
    resolved.origin === "https://app.synmere.local",
    `${label} cannot reference a remote origin.`,
  );
  const sourcePathname = publicPath.split(/[?#]/u, 1)[0];
  assert(
    resolved.pathname === sourcePathname,
    `${label} cannot contain encoded traversal or require URL normalization.`,
  );
};

const assertFoundryGlbArtifact = (glb, label) => {
  assert(isRecord(glb), `${label} must define a GLB artifact.`);
  assertAppResolvablePublicPath(glb.publicPath, `${label}.publicPath`);
  assert(
    typeof glb.sha256 === "string" && SHA256_PATTERN.test(glb.sha256),
    `${label}.sha256 must be a lowercase SHA-256 checksum.`,
  );
  assert(
    Number.isInteger(glb.sizeBytes) && glb.sizeBytes > 0,
    `${label}.sizeBytes must be a positive integer.`,
  );
};

const assertFoundryAssetThumbnail = (thumbnail, label) => {
  assert(isRecord(thumbnail), `${label} must be an object.`);
  assert(isNonEmptyString(thumbnail.id), `${label}.id is required.`);
  assert(isNonEmptyString(thumbnail.label), `${label}.label is required.`);
  assert(
    FOUNDRY_ASSET_THUMBNAIL_SOURCES.has(thumbnail.source),
    `${label}.source must be a supported Foundry thumbnail source.`,
  );
  assert(isNonEmptyString(thumbnail.path), `${label}.path is required.`);
  if (thumbnail.publicPath !== undefined) {
    assertAppResolvablePublicPath(
      thumbnail.publicPath,
      `${label}.publicPath`,
    );
  }
  assert(
    Number.isInteger(thumbnail.width) && thumbnail.width > 0,
    `${label}.width must be a positive integer.`,
  );
  assert(
    Number.isInteger(thumbnail.height) && thumbnail.height > 0,
    `${label}.height must be a positive integer.`,
  );
  if (thumbnail.sha256 !== undefined) {
    assert(
      typeof thumbnail.sha256 === "string" &&
        SHA256_PATTERN.test(thumbnail.sha256),
      `${label}.sha256 must be a lowercase SHA-256 checksum.`,
    );
  }
};

export const assertFoundryAssetVariants = (
  asset,
  { parameterPresetIds = [] } = {},
) => {
  assert(isRecord(asset), "Foundry asset must be an object.");
  assert(
    isNonEmptyString(asset.defaultVariantId),
    "Foundry asset defaultVariantId is required.",
  );
  assert(
    Array.isArray(asset.variants) && asset.variants.length > 0,
    "Foundry asset variants must contain at least one variant.",
  );

  const variantIds = new Set();
  const presetIds = new Set(parameterPresetIds);

  asset.variants.forEach((variant, index) => {
    const label = `Foundry asset variant at index ${index}`;
    assert(isRecord(variant), `${label} must be an object.`);
    assert(isNonEmptyString(variant.id), `${label}.id is required.`);
    assert(!variantIds.has(variant.id), `Duplicate variant id: ${variant.id}.`);
    variantIds.add(variant.id);
    assert(
      !("default" in variant),
      `${label} cannot define default; use asset.defaultVariantId.`,
    );
    assert(isNonEmptyString(variant.label), `${label}.label is required.`);
    assert(
      isNonEmptyString(variant.description),
      `${label}.description is required.`,
    );
    assert(
      Array.isArray(variant.thumbnails),
      `${label}.thumbnails must be an array.`,
    );
    const thumbnailIds = new Set();
    variant.thumbnails.forEach((thumbnail, thumbnailIndex) => {
      assertFoundryAssetThumbnail(
        thumbnail,
        `${label}.thumbnails[${thumbnailIndex}]`,
      );
      assert(
        !thumbnailIds.has(thumbnail.id),
        `${label} has duplicate thumbnail id ${thumbnail.id}.`,
      );
      thumbnailIds.add(thumbnail.id);
    });
    assert(
      isRecord(variant.presentation),
      `${label}.presentation is required.`,
    );

    if (
      variant.presentation.type ===
      FOUNDRY_ASSET_VARIANT_PRESENTATION_TYPE.PARAMETER_PRESET
    ) {
      assert(
        isNonEmptyString(variant.presentation.parameterPresetId),
        `${label}.presentation.parameterPresetId is required.`,
      );
      assert(
        presetIds.has(variant.presentation.parameterPresetId),
        `${label} references unknown parameter preset ${variant.presentation.parameterPresetId}.`,
      );
      assert(
        !("glb" in variant.presentation) &&
          !("modulePublicPath" in variant.presentation),
        `${label} parameter-preset presentation cannot define GLB fields.`,
      );
      return;
    }

    if (
      variant.presentation.type ===
      FOUNDRY_ASSET_VARIANT_PRESENTATION_TYPE.GLB
    ) {
      assertFoundryGlbArtifact(
        variant.presentation.glb,
        `${label}.presentation.glb`,
      );
      if (variant.presentation.modulePublicPath !== undefined) {
        assertAppResolvablePublicPath(
          variant.presentation.modulePublicPath,
          `${label}.presentation.modulePublicPath`,
        );
      }
      assert(
        !("parameterPresetId" in variant.presentation),
        `${label} GLB presentation cannot define parameterPresetId.`,
      );
      return;
    }

    throw new Error(
      `${label}.presentation.type must be parameter-preset or glb.`,
    );
  });

  assert(
    variantIds.has(asset.defaultVariantId),
    `Foundry asset defaultVariantId ${asset.defaultVariantId} does not resolve to a variant.`,
  );
};

export const createFoundryParameterPresetVariants = (parameterPresets) => {
  assert(
    Array.isArray(parameterPresets) && parameterPresets.length > 0,
    "Parameter presets must contain at least one preset.",
  );

  return parameterPresets.map((preset, index) => {
    const label = `Parameter preset at index ${index}`;
    assert(isRecord(preset), `${label} must be an object.`);
    assert(isNonEmptyString(preset.id), `${label}.id is required.`);
    assert(
      isNonEmptyString(preset.defaultLabel),
      `${label}.defaultLabel is required.`,
    );
    assert(
      isNonEmptyString(preset.defaultDescription),
      `${label}.defaultDescription is required.`,
    );

    const variantId = isNonEmptyString(preset.intent?.archetype)
      ? preset.intent.archetype
      : preset.id;

    return {
      id: variantId,
      label: preset.defaultLabel,
      description: preset.defaultDescription,
      thumbnails: [],
      presentation: {
        type: FOUNDRY_ASSET_VARIANT_PRESENTATION_TYPE.PARAMETER_PRESET,
        parameterPresetId: preset.id,
      },
    };
  });
};

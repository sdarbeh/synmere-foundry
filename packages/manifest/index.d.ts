export declare const IDENTITY_MORPH_TARGET: {
  readonly FACE_WIDE: "identity_face_wide";
  readonly FACE_NARROW: "identity_face_narrow";
  readonly FACE_LONG: "identity_face_long";
  readonly FACE_SHORT: "identity_face_short";
  readonly CHEEKBONES_WIDE: "identity_cheekbones_wide";
  readonly CHEEKBONES_NARROW: "identity_cheekbones_narrow";
  readonly EYE_SPACING_WIDE: "identity_eye_spacing_wide";
  readonly EYE_SPACING_NARROW: "identity_eye_spacing_narrow";
  readonly EYE_WIDTH_WIDE: "identity_eye_width_wide";
  readonly EYE_WIDTH_NARROW: "identity_eye_width_narrow";
  readonly BROW_ARCH_HIGH: "identity_brow_arch_high";
  readonly BROW_ARCH_LOW: "identity_brow_arch_low";
  readonly BROW_PROMINENCE_HIGH: "identity_brow_prominence_high";
  readonly BROW_PROMINENCE_LOW: "identity_brow_prominence_low";
  readonly NOSE_WIDE: "identity_nose_wide";
  readonly NOSE_NARROW: "identity_nose_narrow";
  readonly NOSE_LONG: "identity_nose_long";
  readonly NOSE_SHORT: "identity_nose_short";
  readonly NOSE_PROJECTION_HIGH: "identity_nose_projection_high";
  readonly NOSE_PROJECTION_LOW: "identity_nose_projection_low";
  readonly MOUTH_WIDE: "identity_mouth_wide";
  readonly MOUTH_NARROW: "identity_mouth_narrow";
  readonly CHIN_LONG: "identity_chin_long";
  readonly CHIN_SHORT: "identity_chin_short";
  readonly HEAD_DEPTH_HIGH: "identity_head_depth_high";
  readonly HEAD_DEPTH_LOW: "identity_head_depth_low";
  readonly FOREHEAD_WIDE: "identity_forehead_wide";
  readonly FOREHEAD_NARROW: "identity_forehead_narrow";
  readonly UPPER_FACE_TALL: "identity_upper_face_tall";
  readonly UPPER_FACE_SHORT: "identity_upper_face_short";
  readonly JAW_WIDE: "identity_jaw_wide";
  readonly JAW_NARROW: "identity_jaw_narrow";
  readonly JAW_TAPER_SQUARE: "identity_jaw_taper_square";
  readonly JAW_TAPER_NARROW: "identity_jaw_taper_narrow";
  readonly STRUCTURE_STRUCTURED: "presentation_structure_structured";
  readonly STRUCTURE_SOFT: "presentation_structure_soft";
  readonly JAW_WIDE_CHIN_LONG_CORRECTIVE: "corrective_jaw_wide_chin_long";
};

export declare const ASSET_PROMOTION_SCHEMA_VERSION: "asset-promotion-v1";

export declare const FOUNDRY_ASSET_STAGES: readonly [
  "dev",
  "candidate",
  "production",
];

export type FoundryAssetStage = (typeof FOUNDRY_ASSET_STAGES)[number];

export type FoundryAssetThumbnail = {
  readonly id: string;
  readonly label: string;
  readonly kind: string;
  readonly source: "blender-render" | "three-render" | "placeholder" | "manual";
  readonly path: string;
  readonly publicPath?: string;
  readonly width: number;
  readonly height: number;
  readonly sha256?: string;
  readonly isPlaceholder?: boolean;
  readonly description?: string;
};

export type FoundryGlbArtifact = {
  readonly publicPath: string;
  readonly sha256: string;
  readonly sizeBytes: number;
};

export type FoundryAssetVariantPresentation =
  | {
      readonly type: "parameter-preset";
      readonly parameterPresetId: string;
    }
  | {
      readonly type: "glb";
      readonly glb: FoundryGlbArtifact;
      readonly modulePublicPath?: string;
    };

export type FoundryAssetVariant = {
  readonly id: string;
  readonly label: string;
  readonly description: string;
  readonly thumbnails: readonly FoundryAssetThumbnail[];
  readonly presentation: FoundryAssetVariantPresentation;
};

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
    stage: FoundryAssetStage;
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
  readonly stage: FoundryAssetStage;
  readonly schemaVersion: string;
  readonly assetSchemaVersion: string;
  readonly id: string;
  readonly version: string;
  readonly releaseTag: string;
  readonly url: string;
  readonly thumbnails: readonly FoundryAssetThumbnail[];
  readonly defaultVariantId: string;
  readonly variants: readonly FoundryAssetVariant[];
  readonly sha256: string;
  readonly meshName: string;
  readonly materialNames: readonly string[];
  readonly morphTargetNames: readonly string[];
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

export type IdentityShellShapePresetId = string;

export type IdentityShellStructurePresetId = string;

export type AssetModuleParameterGroupId = "silhouette" | "facialGeometry";

export type AssetModuleMaterialId = "ceramic" | "obsidian";

export type AssetModuleDisplayModeId = "preview" | "trace" | "topology";

export type AssetModuleParameterRange = {
  min: number;
  max: number;
  step: number;
};

export type AssetModuleParameterGroup = {
  id: AssetModuleParameterGroupId;
  labelKey: string;
  defaultLabel: string;
  descriptionKey: string;
  defaultDescription: string;
  parameterKeys: readonly FaceShellParameterKey[];
};

export type AssetModuleCapability<Id extends string> = {
  id: Id;
  labelKey: string;
  defaultLabel: string;
  required: boolean;
};

export type IdentityShellShapePresetIntent = {
  archetype:
    | "baseline"
    | "oval"
    | "broad"
    | "long"
    | "round"
    | "heart"
    | "diamond";
  strength: "subtle" | "moderate" | "strong";
  emphasis: readonly (
    | "width"
    | "length"
    | "forehead"
    | "cheeks"
    | "jaw"
    | "chin"
    | "eyes"
    | "brow"
    | "nose"
    | "mouth"
    | "depth"
  )[];
};

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
      AssetModuleParameterRange
    >;
    authoringRanges: Record<FaceShellParameterKey, AssetModuleParameterRange>;
  };
  parameterGroups: readonly AssetModuleParameterGroup[];
  capabilities: {
    materials: readonly AssetModuleCapability<AssetModuleMaterialId>[];
    displayModes: readonly AssetModuleCapability<AssetModuleDisplayModeId>[];
  };
  morphs: {
    targetNames: readonly string[];
    identityBindings: readonly {
      parameter: string;
      positiveTarget?: string;
      negativeTarget?: string;
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
      target: string;
      strength: number;
      drivers: readonly {
        parameter: string;
        direction: "positive" | "negative";
      }[];
    }[];
    presentation: readonly {
      preset: IdentityShellStructurePresetId;
      target: string;
    }[];
  };
  presets: {
    shape: readonly {
      id: IdentityShellShapePresetId;
      labelKey: string;
      defaultLabel: string;
      descriptionKey: string;
      defaultDescription: string;
      baseParameters: "productBaseline" | "neutral";
      intent: IdentityShellShapePresetIntent;
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

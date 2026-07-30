export declare const SYNMERE_SCHEMA_VERSION: "1.0.0";

export declare const SYNMERE_STRUCTURE_PRESET: {
  readonly BALANCED: "balanced";
  readonly STRUCTURED: "structured";
  readonly SOFT: "soft";
};

export type SynmereStructurePreset =
  (typeof SYNMERE_STRUCTURE_PRESET)[keyof typeof SYNMERE_STRUCTURE_PRESET];

export type FoundryAssetStage = "dev" | "candidate" | "production";

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

export type SynmereIdentityParameterValue = {
  value: number;
  confidence: number;
  source:
    | "visual-profile"
    | "manual-override"
    | "synthetic-preset"
    | "product-baseline"
    | "neutral-prior";
};

export type SynmereDNA = {
  schemaVersion: string;
  id: string;
  geometry: {
    spaceVersion: string;
    parameters: Record<string, SynmereIdentityParameterValue>;
  };
  appearance: {
    skin: {
      status: "unresolved" | "estimated" | "manual";
      baseColorSrgb?: string;
      roughness?: number;
      specular?: number;
      scatter?: number;
      confidence: number;
      source: "none" | "display-dependent-camera" | "manual";
    };
  };
  animation: {
    expressionSpaceVersion: string;
    poseSpaceVersion: string;
  };
  provenance: {
    processing: "on-device";
    source: "neutral-shell" | "synthetic-preset";
    sourceProfileSchemaVersion: string;
    sourceProfileCreatedAt: string;
    rawImageIncluded: false;
    rawLandmarksIncluded: false;
  };
  metadata: {
    createdAt: string;
    updatedAt: string;
  };
};

export type IdentityMorphBinding = {
  parameter: string;
  positiveTarget?: string;
  negativeTarget?: string;
  strength: number;
};

export type IdentityMorphCalibration = {
  positiveGain: number;
  negativeGain: number;
  maximumWeight: number;
};

export type CorrectiveMorphBinding = {
  target: string;
  strength: number;
  drivers: {
    parameter: string;
    direction: "positive" | "negative";
  }[];
};

export type ReleasedAssetManifest = {
  schemaVersion: string;
  assetSchemaVersion: string;
  id: string;
  version: string;
  stage: FoundryAssetStage;
  uri: string;
  sha256: string;
  topologyVersion: string;
  rendererCompatibilityVersion: string;
  minimumApplicationVersion: string;
  meshName: string;
  materialSlots: string[];
  identityMorphs: IdentityMorphBinding[];
  identityMorphCalibration: Record<
    string,
    IdentityMorphCalibration | undefined
  >;
  expressionMorphs: string[];
  correctiveMorphs: CorrectiveMorphBinding[];
  presentationMorphs: {
    preset: SynmereStructurePreset;
    target: string;
  }[];
};

export type ValidationResult = {
  valid: boolean;
  errors: string[];
};

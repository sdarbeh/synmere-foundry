// Generated from an immutable Synmere Foundry release manifest.
export const IDENTITY_MORPH_TARGET = Object.freeze({
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
});

export const ASSET_PROMOTION_SCHEMA_VERSION = "asset-promotion-v1";

export const ASSET_PROMOTION_RELEASE_CHANNELS = Object.freeze([
  "dev",
  "candidate",
  "production",
]);

const deepFreeze = (value) => {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) {
    return value;
  }

  Object.freeze(value);
  Object.values(value).forEach(deepFreeze);
  return value;
};

const isRecord = (value) => {
  return typeof value === "object" && value !== null && !Array.isArray(value);
};

const isNonEmptyString = (value) => {
  return typeof value === "string" && value.trim().length > 0;
};

const isStringArray = (value) => {
  return Array.isArray(value) && value.every(isNonEmptyString);
};

const isNumber = (value) => {
  return typeof value === "number" && Number.isFinite(value);
};

const assert = (condition, message) => {
  if (!condition) {
    throw new Error(message);
  }
};

export const assertValidAssetPromotionRecord = (record) => {
  assert(isRecord(record), "Asset promotion record must be an object.");
  assert(isNonEmptyString(record.id), "Promotion record id is required.");

  assert(isRecord(record.asset), "Promotion asset identity is required.");
  assert(isNonEmptyString(record.asset.name), "Asset name is required.");
  assert(
    isNonEmptyString(record.asset.displayName),
    "Asset display name is required.",
  );
  assert(record.asset.type === "glb", "Asset type must be glb.");
  assert(
    ["shell", "avatar", "body", "clothing"].includes(
      String(record.asset.domain),
    ),
    "Asset domain is invalid.",
  );
  assert(isNonEmptyString(record.asset.module), "Asset module is required.");

  assert(isRecord(record.version), "Promotion version metadata is required.");
  assert(isNonEmptyString(record.version.version), "Version is required.");
  assert(
    ASSET_PROMOTION_RELEASE_CHANNELS.includes(record.version.releaseChannel),
    "Release channel is invalid.",
  );
  assert(
    isNonEmptyString(record.version.promotedAt),
    "Promotion timestamp is required.",
  );
  assert(
    !Number.isNaN(Date.parse(record.version.promotedAt)),
    "Promotion timestamp must be an ISO-compatible date.",
  );
  assert(
    isNonEmptyString(record.version.promotedBy),
    "Promotion actor is required.",
  );

  assert(isRecord(record.files), "Promotion file provenance is required.");
  assert(
    isNonEmptyString(record.files.sourceBlendPath),
    "Source Blender path is required.",
  );
  assert(
    isNonEmptyString(record.files.productionGlbPath),
    "Production GLB path is required.",
  );
  assert(
    record.files.candidateGlbPath === undefined ||
      isNonEmptyString(record.files.candidateGlbPath),
    "Candidate GLB path must be non-empty when provided.",
  );
  assert(
    isNonEmptyString(record.files.sourceBlendHash),
    "Source Blender hash is required.",
  );
  assert(
    record.files.candidateGlbHash === undefined ||
      isNonEmptyString(record.files.candidateGlbHash),
    "Candidate GLB hash must be non-empty when provided.",
  );
  assert(
    isNonEmptyString(record.files.productionGlbHash),
    "Production GLB hash is required.",
  );

  assert(isRecord(record.contract), "Asset contract is required.");
  assert(
    isNonEmptyString(record.contract.meshName),
    "Contract mesh name is required.",
  );
  assert(
    isNonEmptyString(record.contract.materialSlot),
    "Contract material slot is required.",
  );
  assert(isNumber(record.contract.vertexCount), "Vertex count is required.");
  assert(isNumber(record.contract.indexCount), "Index count is required.");
  assert(
    isNonEmptyString(record.contract.topologyHash),
    "Topology hash is required.",
  );
  assert(
    isNumber(record.contract.morphTargetCount),
    "Morph target count is required.",
  );
  assert(
    isStringArray(record.contract.morphTargetNames),
    "Morph target names are required.",
  );
  assert(
    record.contract.morphTargetCount ===
      record.contract.morphTargetNames.length,
    "Morph target count must match morph target names.",
  );

  assert(isRecord(record.validation), "Validation result is required.");
  assert(
    typeof record.validation.contractPassed === "boolean",
    "Contract validation status is required.",
  );
  assert(
    typeof record.validation.morphValidationPassed === "boolean",
    "Morph validation status is required.",
  );
  assert(
    isNumber(record.validation.maxMorphEdgeStrain),
    "Max morph edge strain is required.",
  );
  assert(
    isNumber(record.validation.maxAllowedMorphEdgeStrain),
    "Max allowed morph edge strain is required.",
  );
  assert(isNumber(record.validation.testsPassed), "Tests passed is required.");
  assert(isNumber(record.validation.testsFailed), "Tests failed is required.");
  assert(
    record.validation.validationReportPath === undefined ||
      isNonEmptyString(record.validation.validationReportPath),
    "Validation report path must be non-empty when provided.",
  );
  assert(
    record.validation.reviewManifestPath === undefined ||
      isNonEmptyString(record.validation.reviewManifestPath),
    "Review manifest path must be non-empty when provided.",
  );

  assert(isRecord(record.releaseNotes), "Release notes are required.");
  assert(
    isNonEmptyString(record.releaseNotes.summary),
    "Release note summary is required.",
  );
  assert(
    isStringArray(record.releaseNotes.changes),
    "Release note changes are required.",
  );
  assert(
    isStringArray(record.releaseNotes.knownIssues),
    "Release note known issues must be strings.",
  );
  assert(
    isStringArray(record.releaseNotes.approvedViews),
    "Release note approved views are required.",
  );

  assert(
    isRecord(record.compatibility),
    "Promotion compatibility metadata is required.",
  );
  assert(
    isNonEmptyString(record.compatibility.faceShellParameterVersion),
    "Face shell parameter version is required.",
  );
  assert(
    isNonEmptyString(record.compatibility.rendererVersion),
    "Renderer version is required.",
  );
  assert(
    record.compatibility.schemaVersion === ASSET_PROMOTION_SCHEMA_VERSION,
    "Promotion schema version is invalid.",
  );
};

export const assertPromotableAssetPromotionRecord = (record) => {
  assertValidAssetPromotionRecord(record);
  assert(
    record.version.releaseChannel === "production",
    "Only production promotion records can complete promotion.",
  );
  assert(record.validation.contractPassed, "Contract validation did not pass.");
  assert(
    record.validation.morphValidationPassed,
    "Morph validation did not pass.",
  );
  assert(
    record.validation.maxMorphEdgeStrain <=
      record.validation.maxAllowedMorphEdgeStrain,
    "Morph edge strain exceeds the allowed limit.",
  );
  assert(
    record.validation.testsFailed === 0,
    "Promotion cannot complete with failed tests.",
  );
  assert(
    record.validation.testsPassed > 0,
    "Promotion requires at least one passing validation check.",
  );
  assert(
    isNonEmptyString(record.files.candidateGlbHash),
    "Candidate GLB hash is required for production promotion.",
  );
  assert(
    isNonEmptyString(record.files.productionGlbHash),
    "Production GLB hash is required for production promotion.",
  );
  assert(
    record.releaseNotes.changes.length > 0,
    "Promotion requires release note changes.",
  );
  assert(
    record.releaseNotes.approvedViews.length > 0,
    "Promotion requires approved review views.",
  );
};

export const ASSET_PROMOTIONS = deepFreeze([{"id":"identity-shell-v1.1.2-production","asset":{"name":"identity-shell","displayName":"Identity Shell","type":"glb","domain":"shell","module":"identity-shell"},"version":{"version":"1.1.2","releaseChannel":"production","promotedAt":"2026-07-25T00:14:03.122Z","promotedBy":"Synmere Foundry"},"files":{"sourceBlendPath":"assets/releases/identity-shell/1.1.2/source/identity-shell.blend","productionGlbPath":"assets/releases/identity-shell/1.1.2/identity-shell.glb","candidateGlbPath":"assets/candidates/final-pre-promotion-mouth","sourceBlendHash":"a60e2ce05a1417b28a5d0749e9e65a48f2695e0da44822b54081090d793e7cd7","candidateGlbHash":"2cd5c234565e9f5cf7ff5632f011d8273b94d6ea945124239a4f1d15cbd0cc99","productionGlbHash":"2cd5c234565e9f5cf7ff5632f011d8273b94d6ea945124239a4f1d15cbd0cc99"},"contract":{"meshName":"IdentityShell","materialSlot":"IdentityCeramic","vertexCount":6052,"indexCount":36300,"topologyHash":"da73385507a48e1bff2430b5ce03a94875aa28e53ce445142188e2e0d4d3d181","morphTargetCount":37,"morphTargetNames":["identity_face_wide","identity_face_narrow","identity_face_long","identity_face_short","identity_cheekbones_wide","identity_cheekbones_narrow","identity_eye_spacing_wide","identity_eye_spacing_narrow","identity_eye_width_wide","identity_eye_width_narrow","identity_brow_arch_high","identity_brow_arch_low","identity_brow_prominence_high","identity_brow_prominence_low","identity_nose_wide","identity_nose_narrow","identity_nose_long","identity_nose_short","identity_nose_projection_high","identity_nose_projection_low","identity_mouth_wide","identity_mouth_narrow","identity_chin_long","identity_chin_short","identity_head_depth_high","identity_head_depth_low","identity_forehead_wide","identity_forehead_narrow","identity_upper_face_tall","identity_upper_face_short","identity_jaw_wide","identity_jaw_narrow","identity_jaw_taper_square","identity_jaw_taper_narrow","presentation_structure_structured","presentation_structure_soft","corrective_jaw_wide_chin_long"]},"validation":{"contractPassed":true,"morphValidationPassed":true,"maxMorphEdgeStrain":0.72,"maxAllowedMorphEdgeStrain":0.72,"testsPassed":197,"testsFailed":0,"validationReportPath":"assets/releases/identity-shell/1.1.2/validation.json","reviewManifestPath":"assets/releases/identity-shell/1.1.2/model-lab-review.json"},"releaseNotes":{"summary":"Final mouth refinement: soften the labiomental fold, mouth seam, and corners while preserving lip volume, mouth width, and approved shell silhouette.","changes":["Final mouth refinement: soften the labiomental fold, mouth seam, and corners while preserving lip volume, mouth width, and approved shell silhouette.","Release classification: patch."],"knownIssues":["Excluded from this release: eyes.","Excluded from this release: nose.","Excluded from this release: cheeks.","Excluded from this release: jaw.","Excluded from this release: chin silhouette.","Excluded from this release: head shape.","Excluded from this release: parameters.","Excluded from this release: presets.","Excluded from this release: renderer.","Excluded from this release: lower-edge notch geometry correction."],"approvedViews":["preview","trace","topology"]},"compatibility":{"faceShellParameterVersion":"1.0.0","rendererVersion":"1.0.0","schemaVersion":"asset-promotion-v1"}},{"id":"identity-shell-v1.1.1-production","asset":{"name":"identity-shell","displayName":"Identity Shell","type":"glb","domain":"shell","module":"identity-shell"},"version":{"version":"1.1.1","releaseChannel":"production","promotedAt":"2026-07-24T17:10:54.191Z","promotedBy":"Synmere Foundry"},"files":{"sourceBlendPath":"assets/releases/identity-shell/1.1.1/source/identity-shell.blend","productionGlbPath":"assets/releases/identity-shell/1.1.1/identity-shell.glb","candidateGlbPath":"assets/candidates/morph-safety-repair","sourceBlendHash":"026913c5c6732a06976f5e01abe320f30c5c1a08814c178366eaa979133e2247","candidateGlbHash":"2eb90bb7f08d528d7abd521a8cca9f90b00479c1c470d682d44d657f270716f7","productionGlbHash":"2eb90bb7f08d528d7abd521a8cca9f90b00479c1c470d682d44d657f270716f7"},"contract":{"meshName":"IdentityShell","materialSlot":"IdentityCeramic","vertexCount":6052,"indexCount":36300,"topologyHash":"da73385507a48e1bff2430b5ce03a94875aa28e53ce445142188e2e0d4d3d181","morphTargetCount":37,"morphTargetNames":["identity_face_wide","identity_face_narrow","identity_face_long","identity_face_short","identity_cheekbones_wide","identity_cheekbones_narrow","identity_eye_spacing_wide","identity_eye_spacing_narrow","identity_eye_width_wide","identity_eye_width_narrow","identity_brow_arch_high","identity_brow_arch_low","identity_brow_prominence_high","identity_brow_prominence_low","identity_nose_wide","identity_nose_narrow","identity_nose_long","identity_nose_short","identity_nose_projection_high","identity_nose_projection_low","identity_mouth_wide","identity_mouth_narrow","identity_chin_long","identity_chin_short","identity_head_depth_high","identity_head_depth_low","identity_forehead_wide","identity_forehead_narrow","identity_upper_face_tall","identity_upper_face_short","identity_jaw_wide","identity_jaw_narrow","identity_jaw_taper_square","identity_jaw_taper_narrow","presentation_structure_structured","presentation_structure_soft","corrective_jaw_wide_chin_long"]},"validation":{"contractPassed":true,"morphValidationPassed":true,"maxMorphEdgeStrain":0,"maxAllowedMorphEdgeStrain":0,"testsPassed":194,"testsFailed":0,"validationReportPath":"assets/releases/identity-shell/1.1.1/validation.json","reviewManifestPath":"assets/releases/identity-shell/1.1.1/model-lab-review.json"},"releaseNotes":{"summary":"Morph-only safety repair with no intended visual change.","changes":["Morph-only safety repair with no intended visual change.","Release classification: patch."],"knownIssues":["Excluded from this release: lower-edge notch geometry correction."],"approvedViews":["Preview","Trace","Topology","IdentityCeramic","Obsidian","front","left-three-quarter","right-three-quarter","left-shallow-profile","right-shallow-profile"]},"compatibility":{"faceShellParameterVersion":"1.0.0","rendererVersion":"1.0.0","schemaVersion":"asset-promotion-v1"}}]);

export const identityShellModule = deepFreeze({"schemaVersion":"asset-module-v1","asset":{"name":"identity-shell","displayName":"Identity Shell","module":"identity-shell","version":"1.1.2","releaseTag":"identity-shell-v1.1.2"},"parameters":{"version":"1.0.0","neutral":{"faceWidth":0.92,"faceLength":1.16,"headDepth":0.86,"foreheadWidth":0.88,"upperFaceHeight":0.33,"jawWidth":0.78,"jawTaper":0.76,"cheekWidth":0.94,"eyeSpacing":0.34,"eyeWidth":0.115,"browArch":0.06,"browProminence":0.5,"noseWidth":0.24,"noseLength":0.3,"noseProjection":0.5,"mouthWidth":0.42,"chinLength":0.25},"productBaseline":{"faceWidth":0.98,"faceLength":1.1,"headDepth":0.86,"foreheadWidth":0.97,"upperFaceHeight":0.3,"jawWidth":0.84,"jawTaper":0.8,"cheekWidth":1.01,"eyeSpacing":0.34,"eyeWidth":0.115,"browArch":0.06,"browProminence":0.5,"noseWidth":0.24,"noseLength":0.3,"noseProjection":0.5,"mouthWidth":0.42,"chinLength":0.25},"safeRanges":{"faceWidth":{"min":0.72,"max":1.15,"step":0.01},"faceLength":{"min":0.95,"max":1.35,"step":0.01},"foreheadWidth":{"min":0.62,"max":1.26,"step":0.01},"upperFaceHeight":{"min":0.22,"max":0.44,"step":0.01},"cheekWidth":{"min":0.76,"max":1.14,"step":0.01},"jawWidth":{"min":0.58,"max":1,"step":0.01},"jawTaper":{"min":0.55,"max":0.95,"step":0.01},"chinLength":{"min":0.16,"max":0.36,"step":0.01},"headDepth":{"min":0.72,"max":1.02,"step":0.01},"eyeSpacing":{"min":0.25,"max":0.44,"step":0.005},"eyeWidth":{"min":0.08,"max":0.15,"step":0.005},"browArch":{"min":0.02,"max":0.11,"step":0.005},"browProminence":{"min":0,"max":1,"step":0.01},"noseWidth":{"min":0.17,"max":0.32,"step":0.005},"noseLength":{"min":0.2,"max":0.4,"step":0.005},"noseProjection":{"min":0,"max":1,"step":0.01},"mouthWidth":{"min":0.3,"max":0.54,"step":0.005}}},"morphs":{"targetNames":["identity_face_wide","identity_face_narrow","identity_face_long","identity_face_short","identity_cheekbones_wide","identity_cheekbones_narrow","identity_eye_spacing_wide","identity_eye_spacing_narrow","identity_eye_width_wide","identity_eye_width_narrow","identity_brow_arch_high","identity_brow_arch_low","identity_brow_prominence_high","identity_brow_prominence_low","identity_nose_wide","identity_nose_narrow","identity_nose_long","identity_nose_short","identity_nose_projection_high","identity_nose_projection_low","identity_mouth_wide","identity_mouth_narrow","identity_chin_long","identity_chin_short","identity_head_depth_high","identity_head_depth_low","identity_forehead_wide","identity_forehead_narrow","identity_upper_face_tall","identity_upper_face_short","identity_jaw_wide","identity_jaw_narrow","identity_jaw_taper_square","identity_jaw_taper_narrow","presentation_structure_structured","presentation_structure_soft","corrective_jaw_wide_chin_long"],"identityBindings":[{"parameter":"faceWidth","positiveTarget":"identity_face_wide","negativeTarget":"identity_face_narrow","strength":1},{"parameter":"faceLength","positiveTarget":"identity_face_long","negativeTarget":"identity_face_short","strength":1},{"parameter":"foreheadWidth","positiveTarget":"identity_forehead_wide","negativeTarget":"identity_forehead_narrow","strength":0.85},{"parameter":"upperFaceHeight","positiveTarget":"identity_upper_face_tall","negativeTarget":"identity_upper_face_short","strength":0.9},{"parameter":"cheekboneWidth","positiveTarget":"identity_cheekbones_wide","negativeTarget":"identity_cheekbones_narrow","strength":0.9},{"parameter":"jawWidth","positiveTarget":"identity_jaw_wide","negativeTarget":"identity_jaw_narrow","strength":1},{"parameter":"jawTaper","positiveTarget":"identity_jaw_taper_square","negativeTarget":"identity_jaw_taper_narrow","strength":0.9},{"parameter":"eyeSpacing","positiveTarget":"identity_eye_spacing_wide","negativeTarget":"identity_eye_spacing_narrow","strength":0.9},{"parameter":"eyeWidth","positiveTarget":"identity_eye_width_wide","negativeTarget":"identity_eye_width_narrow","strength":0.8},{"parameter":"browArch","positiveTarget":"identity_brow_arch_high","negativeTarget":"identity_brow_arch_low","strength":0.72},{"parameter":"browProminence","positiveTarget":"identity_brow_prominence_high","negativeTarget":"identity_brow_prominence_low","strength":0.68},{"parameter":"noseWidth","positiveTarget":"identity_nose_wide","negativeTarget":"identity_nose_narrow","strength":0.9},{"parameter":"noseLength","positiveTarget":"identity_nose_long","negativeTarget":"identity_nose_short","strength":0.88},{"parameter":"noseProjection","positiveTarget":"identity_nose_projection_high","negativeTarget":"identity_nose_projection_low","strength":0.76},{"parameter":"mouthWidth","positiveTarget":"identity_mouth_wide","negativeTarget":"identity_mouth_narrow","strength":0.88},{"parameter":"chinLength","positiveTarget":"identity_chin_long","negativeTarget":"identity_chin_short","strength":0.9},{"parameter":"headDepth","positiveTarget":"identity_head_depth_high","negativeTarget":"identity_head_depth_low","strength":0.82}],"calibration":{"faceWidth":{"positiveGain":1,"negativeGain":1,"maximumWeight":1},"faceLength":{"positiveGain":1,"negativeGain":1,"maximumWeight":1},"foreheadWidth":{"positiveGain":1,"negativeGain":1,"maximumWeight":1},"upperFaceHeight":{"positiveGain":1,"negativeGain":1,"maximumWeight":1},"cheekboneWidth":{"positiveGain":1,"negativeGain":1,"maximumWeight":1},"jawWidth":{"positiveGain":1.4,"negativeGain":1.4,"maximumWeight":1.4},"jawTaper":{"positiveGain":1.15,"negativeGain":1.15,"maximumWeight":1},"eyeSpacing":{"positiveGain":1.1,"negativeGain":1.1,"maximumWeight":1},"eyeWidth":{"positiveGain":1.25,"negativeGain":1.25,"maximumWeight":1},"browArch":{"positiveGain":1.35,"negativeGain":1.35,"maximumWeight":1},"browProminence":{"positiveGain":1.5,"negativeGain":1.5,"maximumWeight":1.1},"noseWidth":{"positiveGain":1.1,"negativeGain":1.1,"maximumWeight":1},"noseLength":{"positiveGain":1.1,"negativeGain":1.1,"maximumWeight":1},"noseProjection":{"positiveGain":1.35,"negativeGain":1.35,"maximumWeight":1.05},"mouthWidth":{"positiveGain":1.1,"negativeGain":1.1,"maximumWeight":1},"chinLength":{"positiveGain":1.1,"negativeGain":1.1,"maximumWeight":1},"headDepth":{"positiveGain":1.1,"negativeGain":1.1,"maximumWeight":0.95}},"corrective":[{"target":"corrective_jaw_wide_chin_long","strength":0.55,"drivers":[{"parameter":"jawWidth","direction":"positive"},{"parameter":"chinLength","direction":"positive"}]}],"presentation":[{"preset":"structured","target":"presentation_structure_structured"},{"preset":"soft","target":"presentation_structure_soft"}]},"presets":{"shape":[{"id":"neutral","label":"Neutral","description":"The tuned product baseline.","parameters":{}},{"id":"oval","label":"Oval","description":"Longer centerline with a softly tapered jaw.","parameters":{"faceWidth":0.86,"faceLength":1.24,"foreheadWidth":0.88,"upperFaceHeight":0.33,"cheekWidth":0.96,"jawWidth":0.72,"jawTaper":0.7,"chinLength":0.27}},{"id":"wide","label":"Wide","description":"Broad forehead, cheek, and jaw proportions.","parameters":{"faceWidth":1.07,"faceLength":1.08,"foreheadWidth":1.02,"upperFaceHeight":0.31,"cheekWidth":1.09,"jawWidth":0.94,"jawTaper":0.92,"chinLength":0.22}},{"id":"long","label":"Long","description":"Narrower width with an extended face centerline.","parameters":{"faceWidth":0.82,"faceLength":1.34,"foreheadWidth":0.84,"upperFaceHeight":0.4,"cheekWidth":0.9,"jawWidth":0.7,"jawTaper":0.72,"chinLength":0.32}},{"id":"soft","label":"Soft","description":"Shorter centerline with fuller cheeks and a soft chin.","parameters":{"faceWidth":1.03,"faceLength":1.04,"foreheadWidth":1,"upperFaceHeight":0.29,"cheekWidth":1.12,"jawWidth":0.84,"jawTaper":0.84,"chinLength":0.18}},{"id":"tapered","label":"Tapered","description":"Wider upper face with a more defined chin taper.","parameters":{"faceWidth":0.96,"faceLength":1.17,"foreheadWidth":1.08,"upperFaceHeight":0.35,"cheekWidth":1.03,"jawWidth":0.65,"jawTaper":0.6,"chinLength":0.3}},{"id":"angular","label":"Angular","description":"Pronounced cheek width with a narrower forehead and jaw.","parameters":{"faceWidth":0.94,"faceLength":1.19,"foreheadWidth":0.83,"upperFaceHeight":0.34,"cheekWidth":1.13,"jawWidth":0.69,"jawTaper":0.66,"chinLength":0.28}}],"structure":[{"id":"balanced","label":"Balanced","description":"Measured proportions with restrained definition.","morphWeights":{"presentation_structure_structured":0.18}},{"id":"structured","label":"Structured","description":"Firmer brow, jaw, and chin planes.","morphWeights":{"presentation_structure_structured":0.72}},{"id":"soft","label":"Soft","description":"Smoother transitions across the facial planes.","morphWeights":{"presentation_structure_soft":0.58}}]},"validationLimits":{"maximumMorphEdgeStrain":0.72,"floatingPointTolerance":0.00001}});

ASSET_PROMOTIONS.forEach(assertPromotableAssetPromotionRecord);

const comparePromotionDatesDescending = (left, right) => {
  return (
    Date.parse(right.version.promotedAt) - Date.parse(left.version.promotedAt)
  );
};

export const getAssetPromotionHistory = (assetName) => {
  return ASSET_PROMOTIONS.filter((promotion) => {
    return promotion.asset.name === assetName;
  }).sort(comparePromotionDatesDescending);
};

export const getLatestProductionAssetPromotion = (assetName) => {
  return getAssetPromotionHistory(assetName).find((promotion) => {
    return promotion.version.releaseChannel === "production";
  });
};

export const identityShell = Object.freeze({
  schemaVersion: "1.0.0",
  assetSchemaVersion: "1.0.0",
  id: "synmere-identity-shell-v1",
  version: "1.1.2",
  releaseTag: "identity-shell-v1.1.2",
  url: "/models/shell/identity-shell/1.1.2/identity-shell.glb",
  sha256: "2cd5c234565e9f5cf7ff5632f011d8273b94d6ea945124239a4f1d15cbd0cc99",
  meshName: "IdentityShell",
  materialNames: ["IdentityCeramic"],
  morphTargetNames: Object.values(IDENTITY_MORPH_TARGET),
  topologyVersion: "synmere-authored-shell-v2",
  rendererCompatibilityVersion: "1.0.0",
  minimumApplicationVersion: "0.1.0",
  validationStatus: "passed",
  releasedAt: "2026-07-25T00:14:03.122Z",
  sourceRevision: "f8861e0",
  sourceBlendSha256: "a60e2ce05a1417b28a5d0749e9e65a48f2695e0da44822b54081090d793e7cd7",
});

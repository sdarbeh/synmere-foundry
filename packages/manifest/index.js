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

export const FOUNDRY_ASSET_STAGES = Object.freeze(["dev","candidate","production"]);

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
    FOUNDRY_ASSET_STAGES.includes(record.version.stage),
    "Foundry asset stage is invalid.",
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
    record.version.stage === "production",
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

export const ASSET_PROMOTIONS = deepFreeze([{"id":"identity-shell-v1.0.0-production","asset":{"name":"identity-shell","displayName":"Identity Shell","type":"glb","domain":"shell","module":"identity-shell"},"version":{"version":"1.0.0","stage":"production","promotedAt":"2026-07-25T00:14:03.122Z","promotedBy":"Synmere Foundry"},"files":{"sourceBlendPath":"assets/releases/identity-shell/1.0.0/source/identity-shell.blend","productionGlbPath":"assets/releases/identity-shell/1.0.0/identity-shell.glb","candidateGlbPath":"assets/candidates/final-pre-promotion-mouth","sourceBlendHash":"a60e2ce05a1417b28a5d0749e9e65a48f2695e0da44822b54081090d793e7cd7","candidateGlbHash":"2cd5c234565e9f5cf7ff5632f011d8273b94d6ea945124239a4f1d15cbd0cc99","productionGlbHash":"2cd5c234565e9f5cf7ff5632f011d8273b94d6ea945124239a4f1d15cbd0cc99"},"contract":{"meshName":"IdentityShell","materialSlot":"IdentityCeramic","vertexCount":6052,"indexCount":36300,"topologyHash":"da73385507a48e1bff2430b5ce03a94875aa28e53ce445142188e2e0d4d3d181","morphTargetCount":37,"morphTargetNames":["identity_face_wide","identity_face_narrow","identity_face_long","identity_face_short","identity_cheekbones_wide","identity_cheekbones_narrow","identity_eye_spacing_wide","identity_eye_spacing_narrow","identity_eye_width_wide","identity_eye_width_narrow","identity_brow_arch_high","identity_brow_arch_low","identity_brow_prominence_high","identity_brow_prominence_low","identity_nose_wide","identity_nose_narrow","identity_nose_long","identity_nose_short","identity_nose_projection_high","identity_nose_projection_low","identity_mouth_wide","identity_mouth_narrow","identity_chin_long","identity_chin_short","identity_head_depth_high","identity_head_depth_low","identity_forehead_wide","identity_forehead_narrow","identity_upper_face_tall","identity_upper_face_short","identity_jaw_wide","identity_jaw_narrow","identity_jaw_taper_square","identity_jaw_taper_narrow","presentation_structure_structured","presentation_structure_soft","corrective_jaw_wide_chin_long"]},"validation":{"contractPassed":true,"morphValidationPassed":true,"maxMorphEdgeStrain":0.72,"maxAllowedMorphEdgeStrain":0.72,"testsPassed":197,"testsFailed":0,"validationReportPath":"assets/releases/identity-shell/1.0.0/validation.json","reviewManifestPath":"assets/releases/identity-shell/1.0.0/model-lab-review.json"},"releaseNotes":{"summary":"Final mouth refinement: soften the labiomental fold, mouth seam, and corners while preserving lip volume, mouth width, and approved shell silhouette.","changes":["Final mouth refinement: soften the labiomental fold, mouth seam, and corners while preserving lip volume, mouth width, and approved shell silhouette.","Release classification: patch."],"knownIssues":["Excluded from this release: eyes.","Excluded from this release: nose.","Excluded from this release: cheeks.","Excluded from this release: jaw.","Excluded from this release: chin silhouette.","Excluded from this release: head shape.","Excluded from this release: parameters.","Excluded from this release: presets.","Excluded from this release: renderer.","Excluded from this release: lower-edge notch geometry correction."],"approvedViews":["preview","trace","topology"]},"compatibility":{"faceShellParameterVersion":"1.0.0","rendererVersion":"1.0.0","schemaVersion":"asset-promotion-v1"}}]);

export const identityShellModule = deepFreeze({"schemaVersion":"asset-module-v1","asset":{"name":"identity-shell","displayName":"Identity Shell","module":"identity-shell","version":"1.0.0","releaseTag":"identity-shell-v1.0.0"},"viewer":{"cameraFramingContract":"synmere.identity-shell.camera-framing.v1"},"parameters":{"version":"1.0.0","neutral":{"faceWidth":0.92,"faceLength":1.16,"headDepth":0.86,"foreheadWidth":0.88,"upperFaceHeight":0.33,"jawWidth":0.78,"jawTaper":0.76,"cheekWidth":0.94,"eyeSpacing":0.34,"eyeWidth":0.115,"browArch":0.06,"browProminence":0.5,"noseWidth":0.24,"noseLength":0.3,"noseProjection":0.5,"mouthWidth":0.42,"chinLength":0.25},"productBaseline":{"faceWidth":0.98,"faceLength":1.1,"headDepth":0.86,"foreheadWidth":0.97,"upperFaceHeight":0.3,"jawWidth":0.84,"jawTaper":0.8,"cheekWidth":1.01,"eyeSpacing":0.34,"eyeWidth":0.115,"browArch":0.06,"browProminence":0.5,"noseWidth":0.24,"noseLength":0.3,"noseProjection":0.5,"mouthWidth":0.42,"chinLength":0.25},"safeRanges":{"faceWidth":{"min":0.88,"max":1.08,"step":0.01},"faceLength":{"min":1.02,"max":1.24,"step":0.01},"headDepth":{"min":0.8,"max":0.94,"step":0.01},"foreheadWidth":{"min":0.84,"max":1.08,"step":0.01},"upperFaceHeight":{"min":0.27,"max":0.36,"step":0.01},"cheekWidth":{"min":0.92,"max":1.1,"step":0.01},"jawWidth":{"min":0.7,"max":0.94,"step":0.01},"jawTaper":{"min":0.66,"max":0.9,"step":0.01},"chinLength":{"min":0.2,"max":0.31,"step":0.01},"eyeSpacing":{"min":0.3,"max":0.38,"step":0.005},"eyeWidth":{"min":0.1,"max":0.13,"step":0.005},"browArch":{"min":0.04,"max":0.08,"step":0.005},"browProminence":{"min":0.38,"max":0.62,"step":0.01},"noseWidth":{"min":0.2,"max":0.28,"step":0.005},"noseLength":{"min":0.26,"max":0.34,"step":0.005},"noseProjection":{"min":0.38,"max":0.62,"step":0.01},"mouthWidth":{"min":0.36,"max":0.48,"step":0.005}},"authoringRanges":{"faceWidth":{"min":0.72,"max":1.15,"step":0.01},"faceLength":{"min":0.95,"max":1.35,"step":0.01},"foreheadWidth":{"min":0.62,"max":1.26,"step":0.01},"upperFaceHeight":{"min":0.22,"max":0.44,"step":0.01},"cheekWidth":{"min":0.76,"max":1.14,"step":0.01},"jawWidth":{"min":0.58,"max":1,"step":0.01},"jawTaper":{"min":0.55,"max":0.95,"step":0.01},"chinLength":{"min":0.16,"max":0.36,"step":0.01},"headDepth":{"min":0.72,"max":1.02,"step":0.01},"eyeSpacing":{"min":0.25,"max":0.44,"step":0.005},"eyeWidth":{"min":0.08,"max":0.15,"step":0.005},"browArch":{"min":0.02,"max":0.11,"step":0.005},"browProminence":{"min":0,"max":1,"step":0.01},"noseWidth":{"min":0.17,"max":0.32,"step":0.005},"noseLength":{"min":0.2,"max":0.4,"step":0.005},"noseProjection":{"min":0,"max":1,"step":0.01},"mouthWidth":{"min":0.3,"max":0.54,"step":0.005}}},"parameterGroups":[{"id":"silhouette","labelKey":"shell.groups.silhouette","defaultLabel":"Silhouette","descriptionKey":"shell.groups.silhouette.description","defaultDescription":"Head and face outline, proportions, jaw, cheeks, chin, and depth.","parameterKeys":["faceWidth","faceLength","headDepth","foreheadWidth","upperFaceHeight","cheekWidth","jawWidth","jawTaper","chinLength"]},{"id":"facialGeometry","labelKey":"shell.groups.geometry","defaultLabel":"Geometry","descriptionKey":"shell.groups.geometry.description","defaultDescription":"Feature spacing and primary facial proportions.","parameterKeys":["eyeSpacing","eyeWidth","browArch","browProminence","noseWidth","noseLength","noseProjection","mouthWidth"]}],"capabilities":{"materials":[{"id":"ceramic","labelKey":"shell.materials.ceramic","defaultLabel":"Ceramic","required":true},{"id":"obsidian","labelKey":"shell.materials.obsidian","defaultLabel":"Obsidian","required":false}],"displayModes":[{"id":"preview","labelKey":"shell.displayModes.preview","defaultLabel":"Preview","required":true},{"id":"trace","labelKey":"shell.displayModes.trace","defaultLabel":"Trace","required":false},{"id":"topology","labelKey":"shell.displayModes.topology","defaultLabel":"Topology","required":false}]},"overlays":{"trace":{"schemaVersion":"semantic-trace-v1","normalOffset":0.004,"paths":[{"id":"jaw","region":"jaw","palette":"violet","emphasis":"primary","closed":false,"controlVertexIndices":[162,1460,1452,1373,4360,4367,5796,2808,2883,2891,1662],"nodeVertexIndices":[162,1452,4360,5796,2883,1662],"vertexIndices":[162,734,739,729,1460,1458,1485,1484,1452,1450,1364,1366,1373,1430,1374,1376,1431,813,743,5984,3725,3795,4369,4361,4360,4351,4353,4367,5782,5788,5796,5797,5802,5239,5178,5992,2196,2257,2863,2812,2810,2862,2808,2803,2801,2881,2883,2915,2916,2889,2891,2184,2192,2188,1662]},{"id":"left-brow","region":"brows","palette":"cyan","emphasis":"primary","closed":false,"controlVertexIndices":[3198,3221,4247,3220,3211],"nodeVertexIndices":[3198,4247,3211],"vertexIndices":[3198,3208,3215,3221,4247,4249,3226,3220,3217,3211]},{"id":"right-brow","region":"brows","palette":"violet","emphasis":"primary","closed":false,"controlVertexIndices":[1730,1736,1742,1738,1727],"nodeVertexIndices":[1730,1742,1727],"vertexIndices":[1730,1737,1736,1742,1739,1738,1733,1727]},{"id":"left-eye","region":"lids","palette":"cyan","emphasis":"primary","closed":true,"controlVertexIndices":[2990,2989,3943,3112,4291,3025],"nodeVertexIndices":[2990,3943,4291,3025],"vertexIndices":[2990,2987,2988,2989,3037,3039,3040,3041,3042,3836,3867,3866,3911,3943,3911,3866,3876,3877,3886,3887,3824,3058,3055,3054,3051,3092,3101,3102,3112,3102,3103,3094,4291,3034,3033,3030,3026,3025,4453,3839,3837,3890,3889,3882,3872,3861,3860,3892,3807,3808,3812,3814,2990]},{"id":"right-eye","region":"lids","palette":"violet","emphasis":"primary","closed":true,"controlVertexIndices":[4622,5387,4495,4498,4533,5730],"nodeVertexIndices":[4622,4495,4533,5730],"vertexIndices":[4622,4609,4610,4600,4559,4560,4563,4564,5268,5331,5330,5320,5321,5310,5355,5387,5355,5310,5313,5280,4550,4549,4548,4547,4545,4495,4496,4497,4498,5258,5256,5254,5251,5337,5306,5305,5317,5327,5335,5334,5281,5283,5884,4533,4532,4538,4541,4542,5730,4602,4612,4609,4622]},{"id":"nose-bridge","region":"nose","palette":"cyan","emphasis":"primary","closed":false,"controlVertexIndices":[3218,3130,3131,3276],"nodeVertexIndices":[3218,3131,3276],"vertexIndices":[3218,3212,3172,3129,3130,3133,3134,3132,3131,4272,4271,3276]},{"id":"nose-contour","region":"nose","palette":"violet","emphasis":"primary","closed":false,"controlVertexIndices":[1393,285,305,353,1796,1780,2826],"nodeVertexIndices":[1393,305,1796,2826],"vertexIndices":[1393,1447,288,286,285,359,1247,1322,349,354,305,310,313,353,1804,1803,1796,1841,1838,2761,2691,1844,1780,1781,1783,2878,2826]},{"id":"upper-lip","region":"lips","palette":"cyan","emphasis":"primary","closed":false,"controlVertexIndices":[4468,4283,3587,5722,5899],"nodeVertexIndices":[4468,3587,5899],"vertexIndices":[4468,4285,4283,3469,3455,3454,3457,3484,3485,3482,3483,3497,3527,3545,3552,3568,3587,5042,5024,5020,5004,4975,4965,4964,4967,4966,4937,4936,4939,4949,5722,5724,5899]},{"id":"lower-lip","region":"lips","palette":"violet","emphasis":"primary","closed":false,"controlVertexIndices":[3594,3475,3550,4959,5066],"nodeVertexIndices":[3594,3550,5066],"vertexIndices":[3594,3576,3578,3560,4477,3554,3547,3528,3494,3476,3475,3476,3495,3526,3545,3535,3550,5019,5020,5002,4973,4958,4959,4958,4972,5005,5022,5029,5908,5034,5051,5049,5066]},{"id":"left-cheek","region":"cheeks","palette":"cyan","emphasis":"secondary","closed":false,"controlVertexIndices":[3981,4457,4457,3988],"nodeVertexIndices":[3981,4457,3988],"vertexIndices":[3981,3991,4457,3988]},{"id":"right-cheek","region":"cheeks","palette":"violet","emphasis":"secondary","closed":false,"controlVertexIndices":[5425,5888,5888,5432],"nodeVertexIndices":[5425,5888,5432],"vertexIndices":[5425,5435,5888,5432]}]}},"morphs":{"targetNames":["identity_face_wide","identity_face_narrow","identity_face_long","identity_face_short","identity_cheekbones_wide","identity_cheekbones_narrow","identity_eye_spacing_wide","identity_eye_spacing_narrow","identity_eye_width_wide","identity_eye_width_narrow","identity_brow_arch_high","identity_brow_arch_low","identity_brow_prominence_high","identity_brow_prominence_low","identity_nose_wide","identity_nose_narrow","identity_nose_long","identity_nose_short","identity_nose_projection_high","identity_nose_projection_low","identity_mouth_wide","identity_mouth_narrow","identity_chin_long","identity_chin_short","identity_head_depth_high","identity_head_depth_low","identity_forehead_wide","identity_forehead_narrow","identity_upper_face_tall","identity_upper_face_short","identity_jaw_wide","identity_jaw_narrow","identity_jaw_taper_square","identity_jaw_taper_narrow","presentation_structure_structured","presentation_structure_soft","corrective_jaw_wide_chin_long"],"identityBindings":[{"parameter":"faceWidth","positiveTarget":"identity_face_wide","negativeTarget":"identity_face_narrow","strength":1},{"parameter":"faceLength","positiveTarget":"identity_face_long","negativeTarget":"identity_face_short","strength":1},{"parameter":"foreheadWidth","positiveTarget":"identity_forehead_wide","negativeTarget":"identity_forehead_narrow","strength":0.85},{"parameter":"upperFaceHeight","positiveTarget":"identity_upper_face_tall","negativeTarget":"identity_upper_face_short","strength":0.9},{"parameter":"cheekWidth","positiveTarget":"identity_cheekbones_wide","negativeTarget":"identity_cheekbones_narrow","strength":0.9},{"parameter":"jawWidth","positiveTarget":"identity_jaw_wide","negativeTarget":"identity_jaw_narrow","strength":1},{"parameter":"jawTaper","positiveTarget":"identity_jaw_taper_square","negativeTarget":"identity_jaw_taper_narrow","strength":0.9},{"parameter":"eyeSpacing","positiveTarget":"identity_eye_spacing_wide","negativeTarget":"identity_eye_spacing_narrow","strength":0.9},{"parameter":"eyeWidth","positiveTarget":"identity_eye_width_wide","negativeTarget":"identity_eye_width_narrow","strength":0.8},{"parameter":"browArch","positiveTarget":"identity_brow_arch_high","negativeTarget":"identity_brow_arch_low","strength":0.72},{"parameter":"browProminence","positiveTarget":"identity_brow_prominence_high","negativeTarget":"identity_brow_prominence_low","strength":0.68},{"parameter":"noseWidth","positiveTarget":"identity_nose_wide","negativeTarget":"identity_nose_narrow","strength":0.9},{"parameter":"noseLength","positiveTarget":"identity_nose_long","negativeTarget":"identity_nose_short","strength":0.88},{"parameter":"noseProjection","positiveTarget":"identity_nose_projection_high","negativeTarget":"identity_nose_projection_low","strength":0.76},{"parameter":"mouthWidth","positiveTarget":"identity_mouth_wide","negativeTarget":"identity_mouth_narrow","strength":0.88},{"parameter":"chinLength","positiveTarget":"identity_chin_long","negativeTarget":"identity_chin_short","strength":0.9},{"parameter":"headDepth","positiveTarget":"identity_head_depth_high","negativeTarget":"identity_head_depth_low","strength":0.82}],"calibration":{"faceWidth":{"positiveGain":1,"negativeGain":1,"maximumWeight":1},"faceLength":{"positiveGain":1,"negativeGain":1,"maximumWeight":1},"foreheadWidth":{"positiveGain":1,"negativeGain":1,"maximumWeight":1},"upperFaceHeight":{"positiveGain":1,"negativeGain":1,"maximumWeight":1},"jawWidth":{"positiveGain":1.4,"negativeGain":1.4,"maximumWeight":1.4},"jawTaper":{"positiveGain":1.15,"negativeGain":1.15,"maximumWeight":1},"eyeSpacing":{"positiveGain":1.1,"negativeGain":1.1,"maximumWeight":1},"eyeWidth":{"positiveGain":1.25,"negativeGain":1.25,"maximumWeight":1},"browArch":{"positiveGain":1.35,"negativeGain":1.35,"maximumWeight":1},"browProminence":{"positiveGain":1.5,"negativeGain":1.5,"maximumWeight":1.1},"noseWidth":{"positiveGain":1.1,"negativeGain":1.1,"maximumWeight":1},"noseLength":{"positiveGain":1.1,"negativeGain":1.1,"maximumWeight":1},"noseProjection":{"positiveGain":1.35,"negativeGain":1.35,"maximumWeight":1.05},"mouthWidth":{"positiveGain":1.1,"negativeGain":1.1,"maximumWeight":1},"chinLength":{"positiveGain":1.1,"negativeGain":1.1,"maximumWeight":1},"headDepth":{"positiveGain":1.1,"negativeGain":1.1,"maximumWeight":0.95},"cheekWidth":{"positiveGain":1,"negativeGain":1,"maximumWeight":1}},"corrective":[{"target":"corrective_jaw_wide_chin_long","strength":0.55,"drivers":[{"parameter":"jawWidth","direction":"positive"},{"parameter":"chinLength","direction":"positive"}]}],"presentation":[{"preset":"structured","target":"presentation_structure_structured"},{"preset":"soft","target":"presentation_structure_soft"}]},"presets":{"shape":[{"id":"baseline","labelKey":"shell.presets.shape.baseline","defaultLabel":"Baseline","descriptionKey":"shell.presets.shape.baseline.description","defaultDescription":"default authored/product shell reference","baseParameters":"productBaseline","intent":{"archetype":"baseline","strength":"subtle","emphasis":[]},"parameters":{}},{"id":"oval","labelKey":"shell.presets.shape.oval","defaultLabel":"Oval","descriptionKey":"shell.presets.shape.oval.description","defaultDescription":"longer, softly tapered face","baseParameters":"productBaseline","intent":{"archetype":"oval","strength":"moderate","emphasis":["length","jaw","chin"]},"parameters":{"faceWidth":0.92,"faceLength":1.1,"foreheadWidth":0.94,"upperFaceHeight":0.36,"cheekWidth":0.98,"jawWidth":0.78,"jawTaper":0.72,"chinLength":0.28,"noseWidth":0.23,"mouthWidth":0.4}},{"id":"wide","labelKey":"shell.presets.shape.broad","defaultLabel":"Broad","descriptionKey":"shell.presets.shape.broad.description","defaultDescription":"broad forehead, cheeks, and jaw mass","baseParameters":"productBaseline","intent":{"archetype":"broad","strength":"moderate","emphasis":["width","forehead","cheeks","jaw","eyes","nose","mouth","depth"]},"parameters":{"faceWidth":1.07,"faceLength":1.1,"headDepth":0.9,"foreheadWidth":1.04,"upperFaceHeight":0.3,"cheekWidth":1.05,"jawWidth":0.94,"jawTaper":0.9,"chinLength":0.25,"eyeSpacing":0.36,"eyeWidth":0.1,"noseWidth":0.28,"noseLength":0.29,"noseProjection":0.41,"mouthWidth":0.43}},{"id":"long","labelKey":"shell.presets.shape.long","defaultLabel":"Long","descriptionKey":"shell.presets.shape.long.description","defaultDescription":"taller, narrower face","baseParameters":"productBaseline","intent":{"archetype":"long","strength":"moderate","emphasis":["length","chin","depth"]},"parameters":{"faceWidth":0.9,"faceLength":1.23,"headDepth":0.88,"foreheadWidth":0.84,"upperFaceHeight":0.35,"cheekWidth":0.96,"jawWidth":0.76,"jawTaper":0.72,"chinLength":0.24,"eyeSpacing":0.32,"noseLength":0.33,"mouthWidth":0.39}},{"id":"soft","labelKey":"shell.presets.shape.round","defaultLabel":"Round","descriptionKey":"shell.presets.shape.round.description","defaultDescription":"shorter, fuller, softer cheek structure","baseParameters":"productBaseline","intent":{"archetype":"round","strength":"moderate","emphasis":["cheeks","chin","width"]},"parameters":{"faceWidth":1.02,"faceLength":1.04,"foreheadWidth":0.99,"upperFaceHeight":0.29,"cheekWidth":1.08,"jawWidth":0.83,"jawTaper":0.82,"chinLength":0.23,"eyeWidth":0.12,"noseProjection":0.38,"mouthWidth":0.36}},{"id":"tapered","labelKey":"shell.presets.shape.heart","defaultLabel":"Heart","descriptionKey":"shell.presets.shape.heart.description","defaultDescription":"wider upper face with narrower jaw and chin","baseParameters":"productBaseline","intent":{"archetype":"heart","strength":"moderate","emphasis":["forehead","cheeks","jaw","chin"]},"parameters":{"faceWidth":0.97,"faceLength":1.13,"foreheadWidth":1.07,"upperFaceHeight":0.27,"cheekWidth":1.06,"jawWidth":0.7,"jawTaper":0.67,"chinLength":0.27,"eyeSpacing":0.35,"noseWidth":0.23,"mouthWidth":0.39}},{"id":"angular","labelKey":"shell.presets.shape.diamond","defaultLabel":"Diamond","descriptionKey":"shell.presets.shape.diamond.description","defaultDescription":"pronounced cheek width with narrower forehead and jaw","baseParameters":"productBaseline","intent":{"archetype":"diamond","strength":"moderate","emphasis":["cheeks","forehead","jaw"]},"parameters":{"faceWidth":0.96,"faceLength":1.15,"foreheadWidth":0.84,"upperFaceHeight":0.33,"cheekWidth":1.1,"jawWidth":0.74,"jawTaper":0.7,"chinLength":0.27,"eyeSpacing":0.34,"noseWidth":0.24,"mouthWidth":0.4}}],"structure":[{"id":"balanced","label":"Balanced","description":"Measured proportions with restrained definition.","morphWeights":{"presentation_structure_structured":0.18}},{"id":"structured","label":"Structured","description":"Firmer brow, jaw, and chin planes.","morphWeights":{"presentation_structure_structured":0.72}},{"id":"soft","label":"Soft","description":"Smoother transitions across the facial planes.","morphWeights":{"presentation_structure_soft":0.58}}]},"validationLimits":{"maximumMorphEdgeStrain":0.72,"floatingPointTolerance":0.00001}});

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
    return promotion.version.stage === "production";
  });
};

export const ASSET_RELEASES = deepFreeze([{"assetName":"identity-shell","displayName":"Identity Shell","type":"glb","domain":"shell","module":"identity-shell","stage":"production","schemaVersion":"1.0.0","assetSchemaVersion":"1.0.0","id":"synmere-identity-shell-v1","version":"1.0.0","releaseTag":"identity-shell-v1.0.0","url":"/models/shell/identity-shell/1.0.0/identity-shell.glb","thumbnails":[],"defaultVariantId":"baseline","variants":[{"id":"baseline","label":"Baseline","description":"Default authored/product shell reference.","thumbnails":[],"presentation":{"type":"parameter-preset","parameterPresetId":"baseline"}},{"id":"oval","label":"Oval","description":"Longer, softly tapered face.","thumbnails":[],"presentation":{"type":"parameter-preset","parameterPresetId":"oval"}},{"id":"broad","label":"Broad","description":"Broad forehead, cheeks, and jaw mass.","thumbnails":[],"presentation":{"type":"parameter-preset","parameterPresetId":"wide"}},{"id":"long","label":"Long","description":"Taller, narrower face.","thumbnails":[],"presentation":{"type":"parameter-preset","parameterPresetId":"long"}},{"id":"round","label":"Round","description":"Shorter, fuller, softer cheek structure.","thumbnails":[],"presentation":{"type":"parameter-preset","parameterPresetId":"soft"}},{"id":"heart","label":"Heart","description":"Wider upper face with narrower jaw and chin.","thumbnails":[],"presentation":{"type":"parameter-preset","parameterPresetId":"tapered"}},{"id":"diamond","label":"Diamond","description":"Pronounced cheek width with narrower forehead and jaw.","thumbnails":[],"presentation":{"type":"parameter-preset","parameterPresetId":"angular"}}],"sha256":"2cd5c234565e9f5cf7ff5632f011d8273b94d6ea945124239a4f1d15cbd0cc99","meshName":"IdentityShell","materialNames":["IdentityCeramic"],"morphTargetNames":["identity_face_wide","identity_face_narrow","identity_face_long","identity_face_short","identity_cheekbones_wide","identity_cheekbones_narrow","identity_eye_spacing_wide","identity_eye_spacing_narrow","identity_eye_width_wide","identity_eye_width_narrow","identity_brow_arch_high","identity_brow_arch_low","identity_brow_prominence_high","identity_brow_prominence_low","identity_nose_wide","identity_nose_narrow","identity_nose_long","identity_nose_short","identity_nose_projection_high","identity_nose_projection_low","identity_mouth_wide","identity_mouth_narrow","identity_chin_long","identity_chin_short","identity_head_depth_high","identity_head_depth_low","identity_forehead_wide","identity_forehead_narrow","identity_upper_face_tall","identity_upper_face_short","identity_jaw_wide","identity_jaw_narrow","identity_jaw_taper_square","identity_jaw_taper_narrow","presentation_structure_structured","presentation_structure_soft","corrective_jaw_wide_chin_long"],"topologyVersion":"synmere-authored-shell-v2","rendererCompatibilityVersion":"1.0.0","minimumApplicationVersion":"0.1.0","validationStatus":"passed","releasedAt":"2026-07-25T00:14:03.122Z","sourceRevision":"f8861e0","sourceBlendSha256":"a60e2ce05a1417b28a5d0749e9e65a48f2695e0da44822b54081090d793e7cd7","promotionRecordId":"identity-shell-v1.0.0-production"}]);

const compareReleaseVersionsDescending = (left, right) => {
  return right.version.localeCompare(left.version, undefined, {
    numeric: true,
  });
};

export const getAssetReleaseHistory = (assetName) => {
  return ASSET_RELEASES.filter((release) => {
    return release.assetName === assetName;
  }).sort(compareReleaseVersionsDescending);
};

export const getLatestProductionAssetRelease = (assetName) => {
  return getAssetReleaseHistory(assetName).find((release) => {
    return release.stage === "production";
  });
};

export const getAssetRelease = (assetName, version) => {
  return getAssetReleaseHistory(assetName).find((release) => {
    return release.version === version;
  });
};

export const IDENTITY_SHELL_RELEASES = Object.freeze(
  getAssetReleaseHistory("identity-shell"),
);

const latestIdentityShellRelease =
  getLatestProductionAssetRelease("identity-shell");

assert(
  latestIdentityShellRelease,
  "The identity shell release catalog requires a production release.",
);

export const identityShell = Object.freeze({
  ...latestIdentityShellRelease,
  morphTargetNames: Object.values(IDENTITY_MORPH_TARGET),
});

import { createFoundryParameterPresetVariants } from "../release/asset-variant.mjs";

const CANDIDATE_EXPORT_SETTINGS = Object.freeze({
  format: "GLB",
  selectionOnly: true,
  yUp: true,
  applyTransforms: false,
  materials: true,
  morphTargets: true,
  morphNormals: "recomputed-after-topology-safe-export",
  sharedAccessors: true,
  animations: false,
  skins: false,
  cameras: false,
  lights: false,
  extras: true,
});

export const createShellCandidateManifest = ({
  assetModule,
  blenderVersion,
  candidateContract,
  candidatePath,
  candidateSha256,
  exportedAt,
  pipelineVersion,
  productionExtras,
  sourceBlendPath,
  sourceBlendSha256,
}) => {
  const variants = createFoundryParameterPresetVariants(
    assetModule.presets.shape,
  );
  const defaultVariantId = variants.find((variant) => {
    return variant.presentation.parameterPresetId === "baseline";
  })?.id;
  if (!defaultVariantId) {
    throw new Error("Candidate asset module must define the baseline variant.");
  }

  return {
    schemaVersion: pipelineVersion,
    assetSchemaVersion: pipelineVersion,
    assetId: productionExtras.assetId,
    assetName: assetModule.asset.name,
    displayName: `${assetModule.asset.displayName} Candidate`,
    version: assetModule.asset.version,
    topologyVersion: productionExtras.topologyVersion,
    stage: "candidate",
    validationStatus: "needs-review",
    thumbnails: [],
    defaultVariantId,
    variants,
    source: sourceBlendPath,
    candidate: candidatePath,
    blenderVersion,
    sourceBlendSha256,
    candidateSha256,
    exportedAt,
    exportSettings: CANDIDATE_EXPORT_SETTINGS,
    contract: candidateContract,
  };
};

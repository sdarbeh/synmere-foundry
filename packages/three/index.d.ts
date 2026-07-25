import type { Object3D } from "three";

export declare const validateReleasedAssetScene: (
  scene: Object3D,
  manifest: {
    meshName: string;
    materialSlots: string[];
    identityMorphs: {
      positiveTarget?: string;
      negativeTarget?: string;
    }[];
    presentationMorphs: { target: string }[];
    expressionMorphs: string[];
    correctiveMorphs: { target: string }[];
  },
) => { valid: boolean; errors: string[] };

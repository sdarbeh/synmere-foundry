const collectTargets = (manifest) => {
  const targets = manifest.identityMorphs.flatMap((binding) => {
    return [binding.positiveTarget, binding.negativeTarget].filter(Boolean);
  });
  targets.push(...manifest.presentationMorphs.map((binding) => binding.target));
  targets.push(...manifest.expressionMorphs);
  targets.push(...manifest.correctiveMorphs.map((binding) => binding.target));
  return targets;
};

const isMeshLike = (value) => {
  return Boolean(value?.isMesh);
};

export const validateReleasedAssetScene = (scene, manifest) => {
  const errors = [];
  const object = scene.getObjectByName(manifest.meshName);

  if (!isMeshLike(object)) {
    return {
      valid: false,
      errors: [`Mesh "${manifest.meshName}" was not found in the GLB.`],
    };
  }

  const dictionary = object.morphTargetDictionary ?? {};
  collectTargets(manifest).forEach((target) => {
    if (dictionary[target] === undefined) {
      errors.push(`Required morph target "${target}" is missing.`);
    }
  });

  const materials = Array.isArray(object.material)
    ? object.material
    : [object.material];
  const materialNames = new Set(materials.map((material) => material.name));
  manifest.materialSlots.forEach((materialName) => {
    if (!materialNames.has(materialName)) {
      errors.push(`Required material slot "${materialName}" is missing.`);
    }
  });

  return { valid: errors.length === 0, errors };
};

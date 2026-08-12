# Identity Shell authoring intent

This document defines the structure-profile authoring direction for every
Identity Shell topology. Product manifests and user interfaces use only the
names **Balanced**, **Structured**, and **Soft**.

## Structure profiles

- **Balanced** is the gender-neutral anatomical baseline. It must be the
  zero-weight structure state and must not strongly read as masculine or
  feminine without later avatar presentation.
- **Structured** is the masculine-reading authored endpoint. It may strengthen
  the brow, jaw, chin, neck, and facial planes without exaggeration.
- **Soft** is the feminine-reading authored endpoint. It may soften the brow and
  facial planes, narrow the jaw, chin, and neck, and subtly soften the cheeks
  without weakening the chin or pinching the face.

Masculine and feminine describe internal authoring direction only. They are not
product classifications, user identity labels, or biometric inferences.

## Durable shell rules

Every structure profile must:

- preserve the topology and vertex order owned by its release;
- return to neutral expression, jaw, neck, and pose;
- remain separate from face-shape presets;
- combine safely with every face-shape preset declared by the asset module;
- stay within the release's asset and design bounds;
- preserve the eyelids, nose, lips, cheeks, ears, jaw, neck, and surface
  continuity under supported combinations.

Structure profiles may use dedicated authored morph targets or frozen vectors
over an identity basis. The asset module owns the representation, bindings,
weights, and bounds. Shared renderers and product UI must consume that contract
without topology-specific profile logic.

## Presentation boundary

Identity Shell structure remains neutral anatomy. Eyes, brows, hair, skin,
materials, styling, and other avatar presentation may strengthen perceived
gender later, but should not be baked into the shell profiles.

The main visual gate is whether Balanced remains neutral while Structured and
Soft are distinct, anatomically useful, and restrained across front,
three-quarter, and profile views.

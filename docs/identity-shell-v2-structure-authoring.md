# Identity Shell v2 structure authoring

This document records internal Foundry intent for the Identity Shell v2
structure profiles. Product manifests and user interfaces use only the names
**Balanced**, **Structured**, and **Soft**.

## Authoring intent

- **Balanced** is the gender-neutral product baseline. Its vertices are the GLB
  base positions and its structure morph weights are zero.
- **Structured** preserves the current masculine-reading FLAME mean. It is
  stored as a dedicated delta from Balanced and strengthens the brow, jaw,
  chin, neck, and facial planes.
- **Soft** is the feminine-reading authored endpoint. It is stored as a
  dedicated delta from Balanced and softens the brow and facial planes,
  narrows the jaw, chin, and neck, and subtly softens the cheeks.

The masculine/feminine language is an internal authoring direction, not a
product classification or identity inference. The profiles do not change
expression, jaw rotation, neck pose, eyelid closure, topology, or vertex order.

## Existing identity morph classification

The 34 pre-structure V2 morph targets are Synmere-authored procedural relative
displacement fields. They are not FLAME identity PCA basis vectors and they are
not absolute target meshes. During the Balanced rebase, Foundry preserves these
34 delta arrays relative to the new base rather than regenerating them. This
keeps the existing face-shape contract stable and isolates the structure change.
Their concatenated little-endian GLB displacement-array SHA-256 is
`12ceec23bf852ed53ff3d88ffb08690a32c32b4a0db9fc41ff11ec16677b20ba`;
the candidate builder rejects any drift from that value.

## Product composition

Structure and face shape are independent dimensions:

```txt
Structure: Balanced / Structured / Soft
Shape: Baseline / Oval / Broad / Long / Round / Heart / Diamond
```

Balanced has no structure weights. Structured and Soft each use one dedicated
target at weight `1.0`; the module bounds prevent the two structure targets from
being combined beyond a total weight of `1.0`. Every structure profile must
remain compatible with all seven shape presets.

Automated validation covers all 21 combinations, including triangle
orientation, degeneracy, edge strain, and localized continuity for the jaw,
cheeks, ears, neck, and eyelids. Passing automation does not promote the asset:
the release remains blocked on visual confirmation that Balanced no longer
reads masculine and that Structured and Soft are distinct without exaggeration.

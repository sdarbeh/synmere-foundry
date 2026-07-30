# IdentityShell third-party base mesh intake

This checklist is for evaluating professionally authored Blender base meshes
from sources such as BlendKit, BlenderMarket, Sketchfab, ArtStation, or direct
artist/vendor delivery.

It is documentation for candidate review only. Do not download, edit, promote,
or replace any asset until the candidate passes the intake gates below.

## Product boundary

IdentityShell is a neutral fitted structure, not an avatar. It must remain:

- one continuous shell mesh;
- full neutral head/headform structure;
- closed or neutralized eyelids;
- no realistic/open eyeballs;
- no hair;
- no teeth;
- no skin pores, photoreal skin material, or character realism;
- no expression, emotion, age, gender, ethnicity, beauty, or likeness styling.

IdentityShell may include neutral authored ears as part of the base head
structure. In v0.1, ears are authored/default anatomy only: they are not
scan-fitted, not part of calibration metrics, and not included in model-fit
claims or user adjustment deltas.

The shell may carry anatomical anchors and structure hints, but styled/rendered
avatar anatomy belongs to future avatar composition.

IdentityShell can support:

- full neutral head/headform structure;
- face and head geometry;
- silhouette, forehead, cheeks, jaw, and chin;
- eye socket, brow, and closed-lid structure;
- mouth plane and sealed lip relief;
- nose structure and projection;
- head depth;
- neutral authored ears;
- future anatomical anchors.

Avatar output owns:

- realistic/open eyes;
- teeth;
- hair and facial hair;
- skin/material realism;
- accessories;
- expression and styling.

## 1. License checks

Before any candidate is imported into the Foundry workspace, confirm and record:

- license permits commercial product use;
- license permits modification, retopology, simplification, derivative works,
  and format conversion;
- license permits distribution inside a browser-loadable product asset, package,
  or application bundle;
- license permits using the mesh as a basis for parameterized/morphed outputs;
- license does not require attribution in product UI unless Synmere explicitly
  accepts that requirement;
- license does not restrict AI, ML, biometric, avatar, character, or identity
  use cases in a way that conflicts with Synmere;
- asset was not created from a scanned real person unless the vendor provides
  explicit model/property releases and redistribution rights;
- asset does not include embedded third-party textures, HDRIs, materials, rigs,
  add-ons, or generated data with separate incompatible licenses;
- marketplace terms and direct asset license are both saved as review evidence.

Reject the candidate if commercial distribution, derivative morph creation, or
browser-product use is unclear.

## 2. Geometry requirements

The candidate should provide a clean neutral head/shell foundation:

- single primary shell surface suitable for one continuous IdentityShell mesh;
- face/head proportions can be neutralized without preserving a specific
  character likeness;
- closed-lid or easily sealable eye region;
- sealed or sealable mouth structure with readable but restrained lip relief;
- clean nose and nostril topology that can become a neutral shell surface;
- stable forehead, cheek, jaw, chin, and head-depth planes;
- neutral authored ears may be included if they are structurally simple,
  non-person-specific, and part of the continuous headform;
- no extreme asymmetry unless intentionally authored as a correctable scan
  reference;
- no neck, body, realistic/open eyes, teeth, hair, eyelashes, eyebrows, clothing, or
  accessories in the final shell;
- no hidden loose meshes, duplicate shells, internal face layers, or accidental
  nonmanifold fragments;
- no product-facing material/texture realism required for the shell.

The base does not need to already match Synmere dimensions, but it must be
scalable and alignable into the existing shell coordinate system without
destroying proportions.

## 3. Topology requirements

A usable IdentityShell base needs topology that supports safe parameter morphs:

- predictable vertex order after import/export;
- enough resolution for cheek, jaw, eyelid, nose, mouth, and chin planes without
  excessive density;
- clean edge flow around eyelids, nostrils, mouth plane, jaw, and chin;
- mostly quad-friendly topology before conversion, even if the runtime GLB uses
  triangles;
- symmetrical enough to author paired left/right morphs and quality checks;
- no poles or pinched stars in high-deformation areas;
- no overlapping vertices, zero-area faces, inverted normals, or isolated
  islands;
- no rig, armature, animation, shape-key, or modifier dependency required for
  the final runtime mesh;
- topology can support all required morph targets with no triangle inversions or
  unacceptable edge strain.

Retain source files and import settings so the exported GLB can be reproduced.

## 4. Required parameter support

The candidate must be able to support the existing shell parameter contract:

- `faceWidth`
- `faceLength`
- `headDepth`
- `foreheadWidth`
- `upperFaceHeight`
- `cheekWidth`
- `jawWidth`
- `jawTaper`
- `chinLength`
- `eyeSpacing`
- `eyeWidth`
- `browArch`
- `browProminence`
- `noseWidth`
- `noseLength`
- `noseProjection`
- `mouthWidth`

Do not accept a base mesh that can only support global squash/stretch. The
parameter family must read as localized structural variation while preserving
the neutral shell.

## 5. What must be removed or neutralized

Remove or neutralize before candidate validation:

- open eyeballs, corneas, pupils, iris geometry, and eye materials;
- realistic ear detail, scan-derived ear identity, deep ear canals, or
  person-specific ear anatomy beyond neutral authored ears;
- teeth, tongue, gums, mouth cavity, or realistic oral anatomy;
- hair, eyebrows as fibers/cards, eyelashes, beard, or peach fuzz;
- neck, shoulders, torso, scalp accessories, clothing, jewelry, piercings;
- skin textures, pore maps, freckles, moles, scars, makeup, tattoos, or
  photoreal material maps;
- character identity, expression, asymmetrical stylization, or recognizable
  likeness;
- rigs, bones, animation data, cameras, lights, helpers, empties, and unused
  materials;
- marketplace watermarks, hidden geometry, metadata, or non-product extras.

Neutralization should preserve structural planes without converting the shell
into a realistic face.

## 6. What must be preserved

Preserve or reconstruct:

- one continuous shell mesh;
- clean closed-lid relief;
- brow and eye-socket structure;
- nasal bridge, nostril relief, and nose projection plane;
- sealed mouth plane with restrained lip/philtrum relief;
- cheek, jaw, chin, forehead, and head-depth landmarks;
- neutral authored ears if included in the candidate's base headform;
- enough topology to author stable morph targets;
- symmetrical structural correspondence between left and right sides;
- source Blender file and import provenance;
- candidate review evidence explaining any topology or silhouette tradeoffs.

## 7. Retopology decision

Retopologize when:

- the mesh has realistic eye, person-specific ear, mouth-cavity, or neck
  topology fused into the face in ways that cannot be cleanly neutralized;
- topology is too dense, triangulated, scan-noisy, or sculpt-only for stable
  morph targets;
- eyelids, nostrils, mouth, jaw, or chin have pinching or poles in deformation
  paths;
- the base cannot preserve vertex order reliably through export;
- morphs would require global scale instead of localized parameter movement;
- normals/shading show ridges that cannot be solved with small cleanup passes;
- left/right topology is not comparable enough for paired morphs.

Avoid retopology when the candidate already has clean shell-friendly loops and
only needs deletion, sealing, smoothing, and neutralization. Retopology is
expensive because every FaceShellParameter morph and validation expectation must
be rebuilt.

## 8. Conversion path into `identity-shell-v1`

Use this path for a serious third-party candidate:

```text
license approval
  → quarantine original source
  → import into Blender
  → remove non-shell anatomy and extras
  → neutralize eyelids, mouth, materials, and identity styling
  → align to Synmere shell coordinate system
  → decide retopology vs cleanup
  → author canonical Basis
  → author required FaceShellParameter morph targets
  → author structure/presentation morphs if still needed
  → preserve feature-protection regions as review metadata
  → export candidate GLB to assets/candidates/current/
  → validate contract and morph safety
  → render review matrix
  → human quality review
  → approval
  → promotion only after explicit approval
```

The candidate may become a future `identity-shell-v1` replacement only after it
matches the expected runtime contract or an explicitly versioned contract change
has been approved.

## 9. Validation before replacement

Before replacing the current active asset, the candidate must pass:

- license and provenance review;
- single-mesh IdentityShell contract review;
- mesh/material naming contract;
- vertex/index/topology/morph-order contract, or an explicitly approved
  versioned contract migration;
- required FaceShellParameters support;
- safe ranges and authoring ranges review;
- morph target count/name/order validation;
- local regression validation;
- global morph safety validation;
- edge-strain and normal-delta budgets;
- no inverted or degenerate faces across sampled morph states;
- product baseline, Oval, Broad, Long, Round, Heart, and Diamond visual review;
- front, three-quarter, and profile orthographic review renders;
- protected feature review for eyelids, nose, mouth, philtrum, nostrils, and
  central brow;
- manifest/module package rebuild and tests;
- Synmere Labs candidate review against `/labs/shell?asset=candidate`;
- explicit human approval before promotion.

Do not use the candidate for calibration until the GLB quality pass confirms
that preset deformation is trustworthy.

## 10. Rejection reasons

Reject a candidate when:

- license rights are unclear, restrictive, non-commercial, or attribution-heavy;
- asset appears derived from an identifiable person without sufficient releases;
- mesh cannot become one continuous neutral shell;
- realistic eyes, person-specific ears, teeth, hair, or skin realism cannot be
  removed cleanly;
- candidate requires scan-fitted ear personalization or calibration claims;
- topology is unsuitable for localized parameter morphs;
- deformation produces global squash/stretch instead of structural variation;
- eyelids, nose, mouth, philtrum, nostrils, or central brow distort under
  Broad/Round/Long/Heart/Diamond presets;
- profile/head-depth structure is missing or unreliable;
- vertex order cannot be kept deterministic;
- GLB export requires unsupported modifiers, rigs, animations, or add-ons;
- validation shows inverted faces, degenerate faces, or morph strain above
  budget;
- visual quality is worse than the current active shell after neutralization;
- the candidate introduces avatar concerns into the neutral shell layer.

If uncertain, keep the candidate in a named `assets/candidates/<candidate>/`
folder, mark it `needs-review`, and document the blocker rather than promoting
or deleting it.

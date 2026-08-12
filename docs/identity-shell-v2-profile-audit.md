# Identity Shell v2 profile audit

Audit date: 2026-08-12

The V2 candidate was reviewed in the shared Shell Lab renderer across all 21
structure/shape combinations in consistent three-quarter and true profile
views. The production orbit limit was temporarily widened for the true-profile
inspection and restored after capture; this did not change the asset, product
controls, renderer behavior, or saved camera configuration.

## Result

Accepted for candidate review. No geometry tuning was required.

- **Balanced** remains anatomically neutral across all seven shapes.
- **Structured** consistently reads as the more masculine structure through
  stronger brow, jaw, chin, neck, and facial planes.
- **Soft** consistently reads as the more feminine neutral anatomical shell
  without relying on avatar presentation features.

Soft satisfies the profile gate across Baseline, Oval, Broad, Long, Round,
Heart, and Diamond:

- Brow and chin projection are reduced relative to Structured.
- The jaw angle is softer and the neck transition is slimmer.
- Cheeks remain supported without pinching.
- The chin remains supported rather than weak or recessed.
- Ear attachment, eyelids, jaw/cheek transitions, neck surface, and general
  silhouette remain continuous.

Heart is the narrowest Soft stress case and remains acceptable. Structured +
Broad is the highest automated edge-strain state and remains visually clean.
Structured + Long, Soft + Round, and Soft + Diamond also passed focused
topology review.

The front view was deliberately not pushed further. Additional feminization at
the neutral-shell layer would risk stereotype, reduce scan-fitting utility, and
duplicate later presentation from eyes, brows, hair, skin, and styling.

## Evidence

The tracked automated report covers triangle orientation, degeneracy, edge
strain, and localized continuity for jaw, cheeks, ears, neck, and eyelids:

`assets/candidates/identity-shell/2.0.0/combination-validation.json`

All 21 states passed. Maximum observed edge strain is `0.41906998`, below the
asset bound of `0.72`.

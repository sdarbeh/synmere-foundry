# Avatar foundry migration report

## Result

Asset production is isolated in `synmere-foundry`. `synmere-engine` owns the
portable runtime and generates `@synmere/manifest` from released manifest
artifacts. The Synmere application consumes immutable packages and releases;
it does not import this repository, invoke Blender, or read candidate files.

The migration intentionally preserved the current renderer behavior and the
released GLB bytes. The jaw/chin lower-edge notch remains an independent
geometry-quality task and is not part of release `1.1.1`.

## History and repositories

- `synmere` retains the original product repository history.
- `synmere-foundry` was created from the same Git history, preserving
  history for all extracted asset files before deleting product-only paths from
  its current tree.
- The desktop parent folder contains the two independent repositories as
  siblings. There is no shared runtime workspace or relative-path dependency.

## Files transferred to the foundry

| Previous Synmere path | Foundry path |
| --- | --- |
| `assets/source/avatar/**` | `assets/source/identity-shell/**` |
| `assets/releases/avatar/**` | `assets/releases/identity-shell/**` and `assets/rollback/identity-shell/**` |
| `scripts/avatar-assets/shell/**` | `scripts/shell/**` |
| `scripts/avatar-assets/bootstrap/**` | `scripts/bootstrap/**` |
| `scripts/avatar-assets/legacy/**` | `scripts/legacy/**` |
| `scripts/blender/**` | `scripts/blender/**` |
| `artifacts/avatar/candidates/**` | ignored `assets/candidates/**` |
| `artifacts/avatar/{audit,checkpoints,rebase,rejected,review}/**` | ignored `reports/history/**` |
| `docs/identity-shell-v1-asset-revision.md` | `docs/identity-shell-v1-asset-revision-history.md` |

Historical scripts that reached into the product tree are quarantined under
`scripts/legacy/` and are not used by any active package command.

## Files retained in Synmere

- `src/synmere/rendering/**`
- `src/synmere/lab/**`
- `src/synmere/shell/**`
- product application, camera, profile, fitting, and browser code
- Model Lab browser tests
- versioned runtime GLB under
  `public/models/avatar/identity-shell/1.1.1/identity-shell.glb`
- the machine-readable release manifest under `manifests/`

## Files removed from Synmere at cutover

- `assets/source/avatar/**`
- `assets/releases/avatar/**`
- `scripts/avatar-assets/**`
- `scripts/blender/**`
- `public/models/avatar/identity-shell-v1.glb`
- ignored `artifacts/avatar/**` after its diagnostic content was copied to the
  foundry

## Shared contract

The canonical release manifest and JSON Schema define:

- asset identifier and semantic version;
- immutable runtime location and SHA-256;
- mesh, material, morph, and topology contracts;
- asset schema and renderer compatibility versions;
- minimum application version;
- validation status;
- release timestamp, source revision, source checksum, candidate, and tag.

Synmere Engine generates `@synmere/manifest` from the immutable release
manifest. Foundry contract tests compare the GLB directly with its release
manifest, including exact morph order, material presence, checksum, and
runtime compatibility.

## Release 1.1.1

- Classification: patch
- Tag: `identity-shell-v1.1.1`
- Source candidate: `morph-safety-repair`
- Source revision before extraction: `6e6ef60`
- GLB SHA-256:
  `2eb90bb7f08d528d7abd521a8cca9f90b00479c1c470d682d44d657f270716f7`
- Blender SHA-256:
  `026913c5c6732a06976f5e01abe320f30c5c1a08814c178366eaa979133e2247`
- Previous release retained as rollback: `1.1.0`

The release directory is immutable and contains the GLB, matching Blender
source, manifest, checksums, validation evidence, Model Lab evidence, and
source-candidate metadata.

## Validation

- Canonical Blender source opened successfully.
- Candidate export and source-contract validation passed.
- Topology: 6,052 vertices, 12,100 triangles.
- Morph contract: 37 targets in the original order.
- Global safety: 193 states; zero inverted and zero degenerate states.
- Local regression, strain, and silhouette gates passed.
- Product manifest, checksum, morph, material, and compatibility tests passed.
- Model Lab Preview, Trace, and Topology passed in Chromium.
- Browser warnings and errors: zero.
- ESLint, TypeScript, Vitest, and production build passed.

## CI ownership

Foundry CI validates release immutability, manifest/schema consistency,
checksums, GLB structure, materials, morphs, topology evidence, and release
metadata. Blender-heavy candidate and morph-envelope commands remain available
for a Blender-capable CI runner.

Synmere CI validates the manifest package, runtime GLB checksum and contracts,
renderer compatibility, application tests, TypeScript, ESLint, build, and Model
Lab browser behavior.

## Release and rollback

Promotion stages the `.blend` and GLB together, requires matching candidate,
validation, and review evidence, validates the production-shaped directory
once, and atomically renames it into an unused semantic-version directory.
Existing release directories cannot be overwritten.

Rollback publishes a compatible manifest that points at a retained immutable
release. It never copies older bytes over a released version.

## Remaining technical debt

- Publish `@synmere/manifest` through Synmere Engine to the selected package registry and move
  released GLBs from the local public path to immutable object storage/CDN.
- Provision a Blender-capable CI runner for full source-open, export, silhouette,
  and 193-state morph validation on candidate changes.
- Address the jaw/chin lower-edge notch through its own candidate, morph-safety
  budget, review, and release decision.
- Define an automated retention job for ignored low-value candidates and
  disposable review renders.

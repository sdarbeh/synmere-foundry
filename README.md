# Synmere Foundry

The foundry owns Synmere's authored avatar assets from canonical Blender source
through immutable, validated GLB releases. It does not contain or import the
Synmere product application.

## Boundary

The foundry produces:

- an immutable versioned GLB;
- an atomic matching Blender source;
- a release manifest and checksums;
- validation and Model Lab review evidence;
- the portable `@synmere/*` packages consumed by Synmere.

Foundry builds and publishes the portable package boundary:

- `@synmere/manifest`
- `@synmere/schema`
- `@synmere/three`

`@synmere/manifest` exposes two related but separate records:

- asset promotions: who promoted a version, when, with what evidence;
- asset releases: every immutable, browser-loadable GLB version and URL.

The product consumes those packages from `node_modules`; it does not create or
modify asset records, manifests, schemas, or Three.js asset adapters.

## Current release

`identity-shell@1.0.0` is the current pre-live production baseline:

- GLB SHA-256:
  `2cd5c234565e9f5cf7ff5632f011d8273b94d6ea945124239a4f1d15cbd0cc99`
- Blender SHA-256:
  `a60e2ce05a1417b28a5d0749e9e65a48f2695e0da44822b54081090d793e7cd7`
- 197 evidence checks passed
- contract and morph safety passed

The lower lip, mouth seam, mouth corners, and labiomental transition were
softened while preserving the approved shell silhouette. The lower-edge notch
geometry correction remains excluded and tracked independently.

## Commands

```sh
pnpm asset:export
pnpm asset:validate
pnpm asset:serve
pnpm shell:review
pnpm shell:tuning:apply -- --patch assets/candidates/current/tuning-patch.json
pnpm shell:approve -- --confirm
pnpm asset:promote -- --version 1.0.0 --confirm
pnpm schema:build
pnpm three:build
pnpm manifest:build
pnpm packages:build
pnpm packages:publish
pnpm asset:release:validate -- 1.0.0
pnpm check
```

`pnpm shell:review` is the normal candidate-review entry point. It exports
`identity-shell-v1.glb` from the canonical Blender source, validates the
contract and all 193 global morph states, serves the candidate from
`assets/candidates/current/`, launches Synmere Model Lab at
`/labs/shell?asset=candidate`, runs candidate browser checks, captures
Preview, Trace, and Topology screenshots, and writes
`assets/candidates/current/identity-shell-v1.review.json`. The review package
also snapshots the candidate asset-module settings at
`assets/candidates/current/identity-shell-v1.module.json`, so candidate geometry
and tuning values can be reviewed together. It never writes to Synmere's
`public/` directory and never promotes a release.

In an interactive terminal, a successful review keeps the candidate host and
Model Lab running for manual inspection. Open the printed Model Lab URL, then
press `Ctrl+C` to stop both servers. Use `--no-keep-open` for a one-shot run,
or `--keep-open` when output is redirected but the server should remain live.

The lifecycle commands have deliberately separate responsibilities:

- **export** creates the review GLB and its export manifest from canonical
  `identity-shell-v1.blend`;
- **validate** runs the GLB contract gate and the complete global morph-safety
  matrix without opening Model Lab;
- **review** runs export and validation, exercises the candidate in Model Lab,
  and creates an evidence package with `promotionApproved: false`;
- **approve** records an explicit human decision for the exact reviewed SHA
  with `pnpm shell:approve -- --confirm`; it does not copy any asset;
- **promote** requires passed, approved evidence and creates a new immutable
  versioned release. It refuses to overwrite an existing release.

## Candidate tuning workflow

Foundry owns asset meaning. Synmere Labs is the tuning interface. Package builds
must stay deterministic outputs of Foundry-owned source files.

Every promoted identity-shell GLB version owns its asset-module semantics in:

```text
assets/releases/identity-shell/<version>/module-manifest.json
```

That file carries the GLB-bound values for product baseline parameters, shape
presets, structure weights, morph calibration, safe ranges, and validation
limits. `manifests/identity-shell.module.json` and the `@synmere/manifest`
package are generated outputs. Do not edit those generated files as the source
of tuning truth.

The preferred tuning loop is:

```text
review GLB → tune in Labs → export tuning patch → apply in Foundry →
rebuild packages → re-review → approve → promote
```

Run a candidate review first:

```sh
pnpm shell:review
```

Tune the candidate in Synmere Labs. Labs may let you copy settings for quick
inspection, but clipboard text is not the source of truth. The durable handoff
should be a tuning patch file, normally:

```text
assets/candidates/current/tuning-patch.json
```

The tuning patch should include the candidate and source hashes it was authored
against, plus the intended asset-module changes:

```json
{
  "asset": "identity-shell",
  "basedOnVersion": "1.0.0",
  "candidateSha": "...",
  "sourceBlendHash": "...",
  "productBaseline": {},
  "shapePresets": [],
  "structurePresets": [],
  "morphCalibration": {},
  "notes": "why these settings changed"
}
```

Apply the patch in Foundry:

```sh
pnpm shell:tuning:apply -- --patch assets/candidates/current/tuning-patch.json
```

That command should verify the reviewed candidate SHA, verify the Blender source
hash, reject product-facing values outside conservative `safeRanges`, keep
Foundry-only authoring experiments inside wider `authoringRanges`, update the
canonical asset-module source, and regenerate the package outputs. Until that
command exists, the manual fallback is to copy the Labs settings into the
canonical asset-module manifest for the target GLB version, then run:

```sh
pnpm asset:module
pnpm packages:build
```

After changing tuning values, run `pnpm shell:review` again before approving or
promoting. Promotion should only happen after the GLB, asset module, validation
evidence, and package output all agree.

Candidate mode is expected to review both:

- the candidate GLB;
- the candidate asset-module manifest.

Foundry serves the module snapshot next to the candidate GLB during review, and
Synmere exposes it through its dev-only candidate module route. Main may decide
how to present those settings, but Foundry owns the values.

TODO: add an interactive tuning apply wizard:

```sh
pnpm shell:tuning
```

The wizard should accept pasted Labs tuning JSON, ask for the candidate name,
target version, release notes, and intended changed sections, then validate the
candidate SHA, Blender source hash, and safe ranges before writing canonical
asset-module source. It should rebuild package outputs and print the next review,
approve, and promote commands. Until this exists, applying Labs tuning remains a
manual edit followed by `pnpm asset:module` and `pnpm packages:build`.

The package build commands expose each Foundry-owned package boundary:

- `pnpm schema:build` validates the portable type/schema package surface;
- `pnpm three:build` validates the Three.js adapter package surface;
- `pnpm manifest:build` regenerates `@synmere/manifest` from the latest
  immutable release, promotion registry, and asset-module manifest;
- `pnpm packages:build` runs all three package builds.

`pnpm packages:publish` publishes `@synmere/schema`, `@synmere/three`, and
`@synmere/manifest` to GitHub Packages. Publishing requires `NODE_AUTH_TOKEN`
or `NPM_TOKEN` with GitHub Packages write access. The GitHub Actions publish
workflow uses `GITHUB_TOKEN` by default, or a `GITHUB_PACKAGES_TOKEN` secret
when publishing to a package namespace outside the workflow repository owner.
It can be run manually or from a published GitHub Release.

`pnpm asset:serve` is available for manual inspection. It exposes only
`assets/candidates/current/identity-shell-v1.glb` at
`http://127.0.0.1:4100/identity-shell-v1.glb`.

See [release-process.md](docs/release-process.md),
[rollback-process.md](docs/rollback-process.md), and
[retention-policy.md](docs/retention-policy.md).

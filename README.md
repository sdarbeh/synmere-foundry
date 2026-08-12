# Synmere Foundry

The foundry owns Synmere's authored identity-shell assets from canonical Blender source
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

Every app-facing asset record also exposes a Foundry stage:

- `production` for live verified assets;
- `candidate` for beta, pre-promoted assets;
- `dev` for work-in-progress, unverified, or provisional assets.

Stage is separate from validation status. See
[asset-stages.md](docs/asset-stages.md).

Avatar assets use the same stage vocabulary at the authored asset-family level.
Renderable options inside an avatar asset are generic variants; variant labels
such as `Male` or `Female` are asset-specific data, not schema-level categories.

The product consumes those packages from `node_modules`; it does not create or
modify asset records, manifests, schemas, or Three.js asset adapters.

## Current release

`identity-shell@2.0.0` is the current production base shell:

- GLB SHA-256:
  `061d74dab91735f413c81e2c4e6d1726db0db95310cdd6961acc895532e47eb3`
- FLAME 2023 Open topology with a local, gitignored source artifact
- 21 shape/profile combinations passed
- Preview, Trace, Topology, Ceramic, and Obsidian review passed

`identity-shell@1.0.0` remains an immutable rollback and the explicit Studio
scan-personalization target until the V2 runtime fitting path is integrated.

## Commands

```sh
pnpm asset:export
pnpm asset:validate
pnpm asset:serve
pnpm shell:review
pnpm shell:approve -- --confirm
pnpm asset:promote -- --version <x.y.z> --confirm
pnpm schema:build
pnpm three:build
pnpm manifest:build
pnpm packages:build
pnpm packages:publish
pnpm asset:release:validate -- 2.0.0
pnpm identity-shell:flame:validate
pnpm check
```

`pnpm shell:review` is the normal candidate-review entry point. It exports
`identity-shell-v1.glb` from the canonical Blender source, validates the
contract and all 193 global morph states, serves the candidate from
`assets/candidates/current/`, launches Synmere Model Lab at
`/labs/shell/candidate`, runs candidate browser checks, captures
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

## Release-owned modules

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

Candidate review must load the candidate GLB, metadata manifest, and matching
asset module together. Promotion only proceeds after their hashes and review
evidence agree. Release modules are immutable after promotion; subsequent
tuning requires a new candidate and version.

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

See [foundry-workflow.md](docs/foundry-workflow.md),
[asset-stages.md](docs/asset-stages.md),
[release-process.md](docs/release-process.md),
[rollback-process.md](docs/rollback-process.md), and
[retention-policy.md](docs/retention-policy.md). Asset-specific references live
in [third-party-assets.md](docs/third-party-assets.md) and
[versioning.md](docs/versioning.md). Structure-profile policy is defined in
[identity-shell-authoring-intent.md](docs/identity-shell-authoring-intent.md).

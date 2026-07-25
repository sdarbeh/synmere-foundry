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

The product consumes those packages from `node_modules`; it does not create or
modify asset records, manifests, schemas, or Three.js asset adapters.

## Current release

`identity-shell@1.1.2` is the current final mouth-refinement patch:

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
pnpm shell:approve -- --confirm
pnpm asset:promote -- --version 1.1.2 --confirm
pnpm schema:build
pnpm three:build
pnpm manifest:build
pnpm packages:build
pnpm packages:publish
pnpm asset:release:validate -- 1.1.2
pnpm check
```

`pnpm shell:review` is the normal candidate-review entry point. It exports
`identity-shell-v1.glb` from the canonical Blender source, validates the
contract and all 193 global morph states, serves the candidate from
`assets/candidates/current/`, launches Synmere Model Lab at
`/labs/shell?asset=candidate`, runs candidate browser checks, captures
Preview, Trace, and Topology screenshots, and writes
`assets/candidates/current/identity-shell-v1.review.json`. It never writes to
Synmere's `public/` directory and never promotes a release.

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

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
- a machine-readable release manifest for Synmere's portable packages.

Synmere's `packages/manifest` generator turns the release manifest into a
portable workspace package. The product consumes only that generated contract
and the released GLB; neither repository reads this checkout at runtime.

## Current release

`identity-shell@1.1.1` is the morph-only safety-repair patch:

- GLB SHA-256:
  `2eb90bb7f08d528d7abd521a8cca9f90b00479c1c470d682d44d657f270716f7`
- Blender SHA-256:
  `026913c5c6732a06976f5e01abe320f30c5c1a08814c178366eaa979133e2247`
- 193 global morph states validated
- zero inverted or degenerate states

The jaw/chin lower-edge notch is excluded and tracked independently.

## Commands

```sh
pnpm asset:export
pnpm asset:validate
pnpm asset:serve
pnpm shell:review
pnpm shell:approve -- --confirm
pnpm asset:promote -- --version 1.1.2 --confirm
pnpm asset:release:validate -- 1.1.1
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

`pnpm asset:serve` is available for manual inspection. It exposes only
`assets/candidates/current/identity-shell-v1.glb` at
`http://127.0.0.1:4100/identity-shell-v1.glb`.

See [release-process.md](docs/release-process.md),
[rollback-process.md](docs/rollback-process.md), and
[retention-policy.md](docs/retention-policy.md).

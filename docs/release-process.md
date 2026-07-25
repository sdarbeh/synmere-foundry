# Release process

## Required sequence

```text
Candidate created
  → local regression validation
  → global asset safety validation
  → Model Lab review in Synmere
  → explicit review approval
  → promotion command
  → immutable release staging
  → production-path validation exactly once
  → checksum generation
  → atomic release-directory rename
  → release tag
  → manifest package publication
  → Synmere dependency update
  → final runtime validation
```

## Candidate contract

`assets/candidates/current/` must contain:

- `identity-shell-v1.blend`
- `identity-shell-v1.glb`
- `identity-shell-v1.release-manifest.json`
- `identity-shell-v1.validation.json`
- `identity-shell-v1.review.json`

Validation evidence must identify the candidate hashes and report successful
local regression and global asset safety gates. Review evidence must identify
the same GLB hash.

## Review and approval

Run the complete non-promoting workflow with:

```sh
pnpm shell:review
```

The command exports `identity-shell-v1.glb`, validates its contract and 193
global morph states, serves it directly from the candidate directory, opens
`/labs/shell?asset=candidate` in an automated Chromium review session, runs
candidate-specific browser checks, captures Preview, Trace, and Topology
screenshots, and writes the review manifest. Synmere's `public/` directory and
the production GLB remain unchanged.

After a human reviews that package, approval is a separate non-copying action:

```sh
pnpm shell:approve -- --confirm
```

## Promotion

Promotion requires an explicit semantic version and `--confirm`. It refuses to
continue when:

- the release directory already exists;
- either source asset is missing;
- validation or review evidence is absent or failed;
- the exact review SHA has not been explicitly approved;
- evidence hashes differ from candidate hashes;
- manifest version and requested version differ;
- the GLB contract differs from the manifest.

The `.blend` and GLB are copied to a temporary release directory, validated
once from that production-shaped directory, and atomically renamed into
`assets/releases/identity-shell/<version>`. Existing releases are never
modified.

After committing the release, create the Git tag:

```sh
git tag -a identity-shell-v<version> -m "identity-shell <version>"
```

Regenerating Synmere's `@synmere/manifest` workspace package from the promoted
manifest is a separate, auditable operation:

```sh
pnpm manifest:sync -- --manifest <promoted-manifest.json>
```

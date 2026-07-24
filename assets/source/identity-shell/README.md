# Canonical identity shell source

`identity-shell-v1.blend` is the source of truth for Synmere's v1 identity
shell. Edit the Basis and shape keys only in this file.

Do not:

- export directly over the production GLB;
- remesh, subdivide, decimate, weld, or change topology;
- add or remove vertices, materials, morphs, or renderable objects;
- use the retired MakeHuman bootstrap to regenerate the product asset.

The locked contract in `identity-shell-v1.contract.json` records the original
vertex count, index order, topology hash, morph order, bounds, and protected
feature metadata.

Use the guarded foundry pipeline:

```sh
pnpm asset:export
pnpm asset:validate
pnpm shell:review
pnpm shell:approve -- --confirm
pnpm asset:promote -- --version <semver> --confirm
```

Export only creates `identity-shell-v1.glb` and its export metadata. Validate
runs the contract and complete global morph-safety gates. Review repeats those
gates, serves the candidate outside `public/`, launches Synmere Model Lab in
candidate mode, and automatically records browser evidence. Approve records a
human decision for that exact reviewed hash without copying it. Promote is the
only command allowed to create a production release.

Promotion requires validation evidence, automated Synmere Model Lab evidence,
and explicit approval recorded for the exact candidate hash.

## Basis sculpt and shape-key rebasing

Before a regional Basis pass, snapshot the existing relative key positions:

```sh
blender --background assets/source/identity-shell/identity-shell-v1.blend \
  --python scripts/shell/rebase-shape-keys.py -- \
  snapshot reports/history/rebase/before-region.npz
```

After the Basis sculpt is saved, preserve each existing relative morph by
applying the same Basis delta to every shape key:

```sh
blender --background assets/source/identity-shell/identity-shell-v1.blend \
  --python scripts/shell/rebase-shape-keys.py -- \
  apply reports/history/rebase/before-region.npz
```

The apply operation refuses to continue if vertex count, shape-key names, or
shape-key order changed.

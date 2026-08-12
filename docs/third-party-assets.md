# Third-party geometry data

## MakeHuman hm08 base topology and targets

The Identity Shell was originally bootstrapped from MakeHuman's hm08 base
topology and sparse facial targets. The generated bootstrap is deprecated; the
canonical authored source is now
`assets/source/identity-shell/identity-shell-v1.blend`.

- Source: [makehumancommunity/makehuman](https://github.com/makehumancommunity/makehuman)
- Source revision: `a8bc2d54ff0ac92e78ff71431b1023eda42bf482`
- Source files: `makehuman/data/3dobjs/base.obj` and `makehuman/data/targets`
- License: CC0
- Current release: `assets/releases/identity-shell/1.0.0/identity-shell.glb`
- Current release SHA-256: `2cd5c234565e9f5cf7ff5632f011d8273b94d6ea945124239a4f1d15cbd0cc99`

The V1 fallback shell contains no body, hair, neck, teeth, eyeballs, or texture
data. It also contains no authored ears. Future IdentityShell
candidates may include neutral authored ears as part of the base headform, but
IdentityShellFit v0.1 does not scan-fit ears and ears must not appear in
calibration deltas or model-fit claims.
Its presentation topology uses partially closed neutral eyelids and recessed
feature caps so the clay view retains eye and lip relief without coplanar
closure artifacts.
The GLB also records protected eyelid, nostril, and lip contour vertex groups
for offline asset inspection.

## FLAME 2023 Open production topology

FLAME 2023 Open was downloaded from the authenticated official source. The
untouched ZIP and model remain local and gitignored. After the provenance gate
passed, the model was used to build Axiom (`identity-shell-v2.0.0`), now the
current production base shell. Veil (`identity-shell-v1.0.0`) remains a rollback
and the explicit Studio scan-personalization target until the V2 runtime fitting
path is integrated.

- Release: `FLAME 2023 Open`
- Official filename: `FLAME2023Open.zip`
- Contained model name documented by the publisher: `flame2023_Open.pkl`
- Official downloads page: `https://flame.is.tue.mpg.de/download.php`
- Official download URL: `https://download.is.tue.mpg.de/download.php?domain=flame&sfile=FLAME2023Open.zip`
- Downloaded: `2026-08-11T22:36:00-05:00`
- Size: `47,586,229` bytes
- SHA-256: `a6b4c3dc15d569d98136a1e548b6fe532eb2830ca12a4f0d4b3a5dba8ee87a91`
- Declared license: `CC-BY-4.0`, limited to FLAME 2023 Open and subject to the
  official model terms
- License: `https://flame.is.tue.mpg.de/modellicense.html`

The tracked machine-readable record is
`vendor/flame/FLAME2023Open.provenance.json`. Validate the local artifact with
`pnpm identity-shell:flame:validate`. Validation pins the exact official
filename, release label, internal model filename, source URL, size, checksum,
license scope, attribution requirements, the original unloaded provenance gate,
and the later production-derivative handling state. Older, academic, renamed,
or content-mismatched variants are rejected.
The Axiom GLB contains the shared neutral topology and module-defined
morph targets; its Baseline preset and Balanced structure profile are the
zero-weight neutral shape.

See [Identity Shell authoring intent](identity-shell-authoring-intent.md) for
the lineage-wide direction behind Balanced, Structured, and Soft.

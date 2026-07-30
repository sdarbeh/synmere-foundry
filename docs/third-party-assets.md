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

The released shell contains no body, hair, neck, teeth, eyeballs, or texture
data. The current release also contains no authored ears. Future IdentityShell
candidates may include neutral authored ears as part of the base headform, but
IdentityShellFit v0.1 does not scan-fit ears and ears must not appear in
calibration deltas or model-fit claims.
Its presentation topology uses partially closed neutral eyelids and recessed
feature caps so the clay view retains eye and lip relief without coplanar
closure artifacts.
The GLB also records protected eyelid, nostril, and lip contour vertex groups
for offline asset inspection.

## Future professional base mesh intake

If Synmere evaluates a professionally authored Blender base mesh from BlendKit,
BlenderMarket, Sketchfab, ArtStation, or a direct artist/vendor handoff, use
the IdentityShell candidate intake checklist before importing it into the
active asset lineage:

- [IdentityShell third-party base mesh intake](./identity-shell-candidate-intake.md)

The checklist preserves the product boundary: IdentityShell is a neutral fitted
structure, not an avatar. A third-party base must be license-cleared,
neutralized into one continuous closed-lid shell, and validated against the
existing `FaceShellParameters` contract before it can replace the current GLB.

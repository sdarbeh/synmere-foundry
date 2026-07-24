# Identity Shell v1 base-asset revision

This pass improves the neutral sculpt baked into
`public/models/avatar/identity-shell-v1.glb`. It does not tune
`FaceShellParameters`, presets, ranges, identity morph strength, fitting, or
runtime geometry.

## Inspection states

Model Lab exposes two controlled neutral states:

- **Raw neutral:** neutral parameter DNA with every identity, corrective, and
  presentation morph at zero.
- **Product baseline:** tuned macro identity DNA with
  `presentation_structure_structured` at `0.18`.

Preview, Trace, and Topology remain presentation modes over either state.
Identity and Obsidian remain material treatments over the same geometry.

Use Raw Neutral to judge the GLB Basis sculpt. Use Product Baseline to evaluate
the tuned product identity and Balanced presentation over that Basis.

## What code can and cannot fix

| Concern                                                                      | Owner                      |
| ---------------------------------------------------------------------------- | -------------------------- |
| Deterministic zero-morph inspection                                          | Renderer and Model Lab     |
| Balanced structure at exactly `0.18`                                         | Presentation configuration |
| Camera, material, lighting, Trace, and Topology                              | Renderer                   |
| Forehead, eyelids, nose base, lips, cheeks, jaw, chin, and perimeter anatomy | GLB source asset           |
| Identity variations after the Basis is approved                              | Authored morph targets     |

Runtime TypeScript must not compensate for a weak Basis sculpt. No procedural
repair, local vertex patching, scan mapping, or hidden presentation offsets
belong in this asset-quality pass.

## Canonical source and promotion boundary

The authoritative source is:

```text
assets/source/avatar/identity-shell-v1.blend
```

The previous MakeHuman generator is retained only under
`scripts/avatar-assets/legacy/` as topology provenance. It is not registered as
an active package command and refuses to overwrite the production GLB.

The supported asset path is:

```text
identity-shell-v1.blend
  -> artifacts/avatar/candidates/identity-shell-v1.glb
  -> contract validation
  -> visual review approval
  -> public/models/avatar/identity-shell-v1.glb
```

Only `pnpm asset:shell:promote -- --confirm` may replace the production asset.
Generated candidates and review approvals stay outside `public/`.

## Blender workflow

1. Open the canonical Blender source with all shape keys intact.
2. Confirm that `IdentityShell`, `IdentityCeramic`, every identity target, the
   corrective target, and both presentation targets are present before editing.
3. Save a regional checkpoint before changing the Basis.
4. Edit only with topology-preserving operations. Disable dynamic topology,
   remesh, subdivision, decimation, weld, and any modifier that changes vertex
   count or order.
5. Apply neutral Basis changes consistently to every shape key. Propagate the
   same selected-vertex delta to the identity, corrective, and presentation
   keys so their relative deformation does not inherit the inverse Basis edit.
   Use `scripts/avatar-assets/shell/rebase-shape-keys.py` to snapshot the
   pre-sculpt coordinates and apply the exact `K₁ = K₀ + (B₁ - B₀)` rebase.
6. Revisit each shape key after the Basis pass and correct only damaged
   anatomy. Do not tune the presets or runtime gains during this stage.
7. Recalculate and inspect smooth normals without splitting protected feature
   loops.
8. Export through `pnpm asset:shell:export`; do not export over production.
9. Run `pnpm asset:shell:validate`.
10. Complete the Raw/Product review matrix, then record approval with
    `pnpm asset:shell:review -- --approve`.
11. Promote only with `pnpm asset:shell:promote -- --confirm`.

## Neutral sculpt checklist

### Silhouette and perimeter

- Reduce the egg-like upper-head height.
- Widen and soften the upper-face silhouette slightly.
- Preserve a face-only mask rather than adding skull or back-of-head volume.
- Create a clean, continuous perimeter with deliberate temple and jaw flow.
- Preserve subtle physical thickness.
- Refine the perimeter bevel so it reads as designed from front, 3/4, and
  shallow profile views.

### Brow and eyelids

- Strengthen the brow plane subtly without baking in an expression.
- Give the closed upper lids a deliberate arc and consistent thickness.
- Establish a restrained lower-lid plane instead of a soft swollen mound.
- Keep left/right eyelid seams clean, smooth, and symmetrical.
- Preserve the protected eyelid boundary loops.

### Nose

- Preserve the current bridge and projection direction.
- Remove pinching, faceting, and closure artifacts around the nostrils.
- Refine the alar wings, columella, nose base, and transition into the upper
  lip.
- Preserve the protected nostril boundary loops.

### Mouth and lips

- Soften the overly sharp mouth-separation line.
- Remove thin or broken segments at the corners and cupid’s bow.
- Add slightly fuller, smoother upper- and lower-lip volume.
- Keep the mouth sealed with no teeth, cavity, or interior geometry.
- Preserve the protected lip boundary loops.

### Cheeks, jaw, and chin

- Strengthen the cheek planes without adding harsh angular dents.
- Improve the transition from cheek into lower jaw.
- Give the mandibular edge a clearer, intentional path into the chin.
- Establish a deliberate chin front plane and lower contour.
- Remove pinching or faceting below the lower lip and around the chin.

### Surface quality

- Verify smooth normals around eyelids, nostrils, lips, chin, and perimeter.
- Check that bevel, front surface, and backing do not produce visible seams.
- Confirm that Preview reads as matte ceramic rather than a mannequin or soft
  procedural blob.

## Contract that must remain unchanged

- Mesh name: `IdentityShell`
- Material slot: `IdentityCeramic`
- Vertex count and vertex order
- Triangle topology and winding
- Protected eyelid, nostril, and lip loops
- Every identity morph-target name
- `corrective_jaw_wide_chin_long`
- `presentation_structure_structured`
- `presentation_structure_soft`
- Coordinate system and units
- No ears, hair, eyeballs, irises, teeth, neck, shoulders, bust, or
  back-of-head geometry

## Visual review matrix

Capture Raw Neutral and Product Baseline using identical framing and lighting:

| View            | Raw      | Product  |
| --------------- | -------- | -------- |
| Front           | Required | Required |
| Left 3/4        | Required | Required |
| Right 3/4       | Required | Required |
| Shallow profile | Required | Required |
| Topology front  | Required | Required |

Approve the Basis only when Raw Neutral reads as an intentional premium identity
object. If Raw passes but Product fails, defer the correction to a later
presentation-structure calibration pass.

## Validation

After export:

1. Run `pnpm test` to validate the binary-to-manifest contract.
2. Run `pnpm asset:shell:validate`.
3. Run `pnpm check`.
4. Run `pnpm build`.
5. Inspect Preview, Trace, and Topology in both neutral states.
6. Exercise every identity morph at minimum, neutral, and maximum.
7. Exercise the corrective and both presentation morphs.
8. Confirm that no protected loop tears, flips, intersects, or changes order.

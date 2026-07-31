# Test authored avatar heads

Stage: `dev`

Validation status: `needs-review`

This folder is a temporary authored avatar intake area for testing Synmere's
avatar adapter path. The current test record is one avatar asset family with
generic authored variants. These assets are not promoted or used as
IdentityShell replacements.

## Files

| File | Original file | Size | SHA-256 |
| --- | --- | ---: | --- |
| `original/test-head-male.fbx` | `/Users/sdarbeh/Downloads/male-Head-basemesh.fbx` | 1,285,424 bytes | `25c00ca406301fa7be1b0c8f4aca519c8e5466be4a7b231974e0304f19e3a060` |
| `original/test-head-female.fbx` | `/Users/sdarbeh/Downloads/Female-Head-basemesh.fbx` | 1,349,152 bytes | `8f4946d18de186b10738c61551357e39108a7b8346b7320891af65063682fbf8` |
| `glb/test-head-male.glb` | generated from `test-head-male.fbx` | 6,197,228 bytes | `6799018f6ccf9dc507a7e70b437e5f85bfb3f5497ecfa22998dcc9b245b6c734` |
| `glb/test-head-female.glb` | generated from `test-head-female.fbx` | 6,314,424 bytes | `ed0a5cbad66d594d0ae3101eb191a01338f92529374c6df183e2f72e59396169` |

## Metadata

| Field | Value |
| --- | --- |
| Asset name | Test Head |
| Variants | Male, Female |
| Source | unknown |
| Author/vendor | unknown |
| License | unknown |
| Download date | 2026-07-30 |
| Original format | FBX |
| Thumbnail source | placeholder |
| Current use | Avatar adapter test candidate |
| Test manifest | `avatar-candidates.manifest.json` |

## Manifest shape

`avatar-candidates.manifest.json` uses the grouped avatar asset shape:

```text
AvatarAsset
└── AvatarAssetVariant[]
```

`Test Head` owns the Foundry lifecycle `stage`. `Male` and `Female` are generic
variant labels for this asset only. Future variants may be named for style,
material, topology, LOD, expression, or other authored options.

Each asset and variant exposes `description` and `thumbnails`. Current
thumbnails are generated SVG placeholders because Blender review renders are
blocked locally. Placeholder thumbnails are not visual validation evidence.

## Intake notes

- These files are avatar candidates, not canonical IdentityShell candidates.
- They may be useful for a fast “identity-inspired avatar variant” demo if
  license and topology checks pass.
- Commercial/product use is blocked until source and license are verified.
- Open eyes, authored ears, neck, or bust geometry are acceptable for avatar
  output candidates.
- Ears remain authored/default anatomy only. They are not scan-fitted and must
  not appear in calibration deltas or model-fit claims.
- Local Blender 4.5.11 currently segfaults before FBX conversion/rendering. The
  GLBs were generated with a Three.js FBXLoader/GLTFExporter fallback so the app
  can view the test assets quickly.
- Review renders are not available yet because Blender rendering is blocked.

## Static inspection

| Variant | Meshes | Materials | Shape keys | Armatures |
| --- | ---: | ---: | --- | --- |
| Male | 3 | 3 | none detected | none detected |
| Female | 4 | 4 | none detected | none detected |

Because no shape keys or armatures were detected in the fallback inspection,
runtime avatar viewing must remain static. Shell-to-avatar mappings are
provisional metadata only until real morph or rig bindings are verified.

## Estimated supported identity hints

- `faceWidth`
- `faceLength`
- `headDepth`
- `cheekWidth`
- `jawWidth`
- `jawTaper`
- `chinLength`
- `noseWidth`
- `noseLength`
- `noseProjection`
- `mouthWidth`
- `browProminence`

Likely unsupported until deeper inspection:

- `foreheadWidth`
- `upperFaceHeight`
- `eyeSpacing`
- `eyeWidth`
- `browArch`

## Next checks

1. Verify source and license.
2. Inspect topology, materials, rig controls, and shape keys in Blender.
3. Confirm whether current variants share topology or require separate
   adapters.
4. Generate neutral front, three-quarter, side, and wireframe review renders.
5. Decide whether these remain test assets, become demo avatar candidates, or
   are rejected.

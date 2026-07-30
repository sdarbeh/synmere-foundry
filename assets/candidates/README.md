# Asset candidates

`assets/candidates` is Foundry's local candidate workspace for shell GLB review,
avatar candidate intake, repair experiments, validation reports, and visual
evidence. It is not the source of production truth.

The promoted GLB and release evidence live under:

```text
assets/releases/identity-shell/<version>/
```

The canonical Blender source lives under:

```text
assets/source/identity-shell/
```

Do not delete candidate history blindly before an asset-quality pass. Candidate
folders can explain prior geometry, topology, morph, seam, orientation, and
surface-quality decisions.

## Cleanup policy

- Keep `current/` because export, review, validation, and promotion tooling use
  it as the active candidate handoff.
- Keep reference folders until the GLB quality pass has extracted useful
  evidence into `reports/history`, `docs/architecture/asset-quality`, or the
  immutable release folder.
- Delete only obvious generated junk, such as Blender `.blend1` backups, Python
  caches, duplicate throwaway exports, and empty folders.
- If a file may explain a prior asset decision, keep it and mark it
  `needs-review`.

## Candidate inventory

| Candidate | Status | Notes |
| --- | --- | --- |
| `current` | active | Active candidate handoff used by `pnpm shell:review`, candidate serving, validation, approval, and promotion tooling. Keep. |
| `morph-safety-repair` | reference | Prior morph-safety repair with validation, repair plan, Model Lab review, and exported GLB. Keep for morph-envelope review. |
| `mouth-cleanup-v1` | reference | Mouth/labiomental cleanup candidate with application reports. Keep for mouth surface-quality review. |
| `orientation-only` | reference | Orientation repair candidate with seam trajectory reports and review renders. Keep for orientation and view-alignment review. |
| `seam-weld-corrected` | reference | Corrected seam-weld candidate with inversion, orientation, and morph-envelope reports. Keep for seam/topology review. |
| `topology-repair` | reference | Topology repair preflight data, including proposed vertex map. Keep for topology-quality review. |
| `pass-g-g1` | reference | Historical pass-G/G1 orientation, rear-inset, and morph repair evidence. Keep until the quality pass confirms whether it is superseded. |
| `pass-g-g11` | reference | Historical pass-G/G11 seam/head-depth planning evidence. Keep until the quality pass confirms whether it is superseded. |
| `harmonization-only` | needs-review | Multiple harmonization variants, metrics, renderer review, and comparison output. Likely useful for harmonization history, but should be classified during the quality pass. |
| `midpoint-harmonized` | needs-review | Midpoint harmonized candidate with visual/morph validation and contact sheets. Classify after comparing against current release evidence. |
| `seam-weld` | superseded | Earlier seam-weld attempt with stop report. Keep until `seam-weld-corrected` evidence is promoted or moved to history. |
| `final-pre-promotion-mouth` | needs-review | Minimal report-only folder. Confirm whether this report is already captured in release evidence before deleting. |
| root `identity-shell-v1.glb` | reference | Stale pre-Foundry-migration candidate export from the old `assets/source/avatar` / `artifacts/avatar/candidates` path. It is not byte-identical to `current/` or the promoted release. It carries the old 6,136-vertex topology family and source blend SHA `64a187...`, matching the rollback `1.1.0` source blend lineage. Keep as historical topology evidence for the quality pass, then move into a named folder such as `legacy-avatar-export` or mark `delete-after-quality-pass` once the old-topology evidence is captured elsewhere. |
| root `identity-shell-v1.manifest.json` | reference | Manifest paired with the root stale candidate GLB. It records candidate SHA `67c827...`, source `assets/source/avatar/identity-shell-v1.blend`, old candidate path `artifacts/avatar/candidates/identity-shell-v1.glb`, 6,136 vertices, and topology hash `02dca3...`. Keep with the root GLB until that historical evidence is moved or intentionally retired. |
| `avatar/test` | needs-review | Test authored avatar intake containing male and female FBX head basemeshes. License/source are unresolved, and topology/ear/shape-key details need inspection before adapter work. Keep for internal avatar demo evaluation only. |

## Root candidate investigation

The root-level `identity-shell-v1.glb` and `identity-shell-v1.manifest.json`
are not duplicates of the active candidate or promoted release.

| File | SHA-256 | Size | Exported | Contract |
| --- | --- | ---: | --- | --- |
| `assets/candidates/identity-shell-v1.glb` | `67c827f388178e639946bf99b53a7c1f3a92480b3de80c48661f128bd338bc38` | 4,472,288 bytes | `2026-07-24T13:33:01.945Z` via paired manifest | 6,136 vertices, topology hash `02dca3...` |
| `assets/candidates/current/identity-shell-v1.glb` | `2cd5c234565e9f5cf7ff5632f011d8273b94d6ea945124239a4f1d15cbd0cc99` | 4,418,080 bytes | `2026-07-25T00:06:40.997Z` via paired manifest | 6,052 vertices, topology hash `da7338...` |
| `assets/releases/identity-shell/1.0.0/identity-shell.glb` | `2cd5c234565e9f5cf7ff5632f011d8273b94d6ea945124239a4f1d15cbd0cc99` | 4,418,080 bytes | promoted release | 6,052 vertices, topology hash `da7338...` |

Conclusion: the root candidate appears to be an alternate historical candidate
from the old avatar asset path, not a failed copy of the current production
release. Its manifest source blend SHA matches the old rollback `1.1.0` source
lineage, while its GLB SHA does not match the rollback GLB. Keep it for the GLB
quality pass because it may help explain the old 6,136-vertex topology and the
later transition to the current 6,052-vertex release. It should eventually be
moved into a named historical candidate folder or retired after its useful
evidence is captured.

## Later cleanup targets

After the GLB quality pass, consider moving durable evidence into:

```text
reports/history/
docs/architecture/asset-quality/
assets/releases/identity-shell/1.0.0/
```

Then remove superseded candidate folders that no longer explain an active asset
decision.

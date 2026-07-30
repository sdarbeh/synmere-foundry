# Foundry asset stages

Foundry uses one canonical stage vocabulary across shell and avatar assets:

```ts
type FoundryAssetStage = "production" | "candidate" | "dev";
```

Stage answers one question: where is this asset in the Foundry lifecycle?

## Stages

| Stage | Meaning |
| --- | --- |
| `production` | Live verified asset. |
| `candidate` | Beta, pre-promoted asset. |
| `dev` | Work-in-progress, unverified, local, or provisional asset. |

`dev` assets must never be treated as verified, even if they load successfully
or have useful inspection data.

## Stage is not validation

Keep these concepts separate:

- `stage`: Foundry lifecycle and app visibility (`production`, `candidate`,
  `dev`);
- `validation.status`: quality/readiness result (`passed`, `needs-review`,
  `blocked`).

Example:

```json
{
  "stage": "dev",
  "validation": {
    "status": "needs-review"
  }
}
```

That record is still work-in-progress, regardless of whether it has some
validation evidence.

## Current mappings

| Asset context | Stage |
| --- | --- |
| shell production release | `production` |
| shell candidate export/review | `candidate` |
| shell dev/local experiment | `dev` |
| avatar local/test candidate | `dev` |

## Validation rules

- Release manifests must include a valid `stage`.
- Promotion records must include `version.stage`.
- Avatar test candidate manifests must include top-level and per-candidate
  `stage: "dev"`.
- Generated `@synmere/manifest` package output must include `stage` on
  app-facing release records.
- `validation.status` must be one of `passed`, `needs-review`, or `blocked`.
- `dev` assets must still include required metadata fields, but source,
  license, and author/vendor may be `unknown`.
- `candidate` and `production` assets must have known source/license metadata
  where that metadata is part of the asset record.

App consumers should use `stage` as the lifecycle signal and should not infer
asset readiness from validation wording.

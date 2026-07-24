# Binary and evidence retention

## Retain permanently

- canonical Blender sources;
- every promoted immutable release;
- rollback-critical Blender and GLB assets;
- release manifests and checksums;
- validation evidence required to reproduce a release decision;
- rejected candidates that explain a material geometry or deformation failure.

## Retain while active

- current candidate and its local/global validation reports;
- review handoff metadata;
- diagnostic renders used by an open geometry-quality task.

## Locally cleanable

- temporary GLB exports;
- Blender `.blend1` backups;
- duplicate candidate copies;
- superseded low-value experiments;
- disposable contact sheets and scratch renders;
- Python and Node caches.

Candidates and historical reports are ignored by default. A report becomes
tracked only when copied into an immutable release or an explicitly retained
rejection record.

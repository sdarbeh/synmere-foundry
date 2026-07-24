# Rollback process

Released versions are immutable, so rollback changes the manifest pointer
rather than editing a release.

1. Select the most recent compatible version under
   `assets/releases/identity-shell/` or the retained critical asset under
   `assets/rollback/identity-shell/`.
2. Verify its SHA-256 values.
3. Regenerate Synmere's `@synmere/manifest` workspace package from the selected
   release manifest.
4. Commit the manifest-package update in Synmere.
5. Run Synmere's checksum, morph/material contract, renderer compatibility,
   Model Lab, and browser-console checks.
6. Record the rollback reason and source release tag.

Never copy rollback bytes over an existing version directory.

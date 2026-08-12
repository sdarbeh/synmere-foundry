import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  FLAME_2023_OPEN_EXPECTED,
  FLAME_2023_OPEN_PROVENANCE_PATH,
  validateFlameArtifactMetadata,
  validateFlameProvenanceRecord,
} from "../scripts/identity-shell/validate-flame-provenance.mjs";

const getProvenance = async () => {
  return JSON.parse(await readFile(FLAME_2023_OPEN_PROVENANCE_PATH, "utf8"));
};

test("accepts the exact FLAME 2023 Open provenance record", async () => {
  const provenance = await getProvenance();

  assert.equal(validateFlameProvenanceRecord(provenance), provenance);
  assert.doesNotThrow(() => {
    validateFlameArtifactMetadata({
      filename: FLAME_2023_OPEN_EXPECTED.artifactFilename,
      sha256: FLAME_2023_OPEN_EXPECTED.sha256,
      sizeBytes: FLAME_2023_OPEN_EXPECTED.sizeBytes,
    });
  });
});

test("rejects the academic FLAME 2023 variant", async () => {
  const provenance = await getProvenance();
  provenance.model.release = "FLAME 2023";
  provenance.model.containedModelFilename = "flame2023.pkl";
  provenance.artifact.filename = "FLAME2023.zip";

  assert.throws(
    () => validateFlameProvenanceRecord(provenance),
    /Only the exact FLAME 2023 Open release/u,
  );
});

test("rejects older and renamed FLAME artifacts", () => {
  for (const filename of [
    "FLAME2020.zip",
    "FLAME2019.zip",
    "FLAME2017.zip",
    "FLAME2023.zip",
  ]) {
    assert.throws(
      () =>
        validateFlameArtifactMetadata({
          filename,
          sha256: FLAME_2023_OPEN_EXPECTED.sha256,
          sizeBytes: FLAME_2023_OPEN_EXPECTED.sizeBytes,
        }),
      /local artifact filename is not FLAME2023Open.zip/u,
    );
  }
});

test("rejects content that does not match the approved Open artifact", () => {
  assert.throws(
    () =>
      validateFlameArtifactMetadata({
        filename: FLAME_2023_OPEN_EXPECTED.artifactFilename,
        sha256: "0".repeat(64),
        sizeBytes: FLAME_2023_OPEN_EXPECTED.sizeBytes,
      }),
    /checksum does not match approved FLAME 2023 Open/u,
  );
});

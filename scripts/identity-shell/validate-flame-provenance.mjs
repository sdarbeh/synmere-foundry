import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const SCRIPT_DIRECTORY = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(SCRIPT_DIRECTORY, "../..");

export const FLAME_2023_OPEN_PROVENANCE_PATH = path.join(
  PROJECT_ROOT,
  "vendor/flame/FLAME2023Open.provenance.json",
);
export const FLAME_2023_OPEN_ARTIFACT_PATH = path.join(
  PROJECT_ROOT,
  "vendor/flame/FLAME2023Open.zip",
);
const GITIGNORE_PATH = path.join(PROJECT_ROOT, ".gitignore");

const ATTRIBUTION_REQUIREMENTS = Object.freeze([
  "Give appropriate credit to Max-Planck.",
  "Provide a link to the model license.",
  "Indicate whether changes were made.",
  "Cite the FLAME paper when reporting results with the model.",
]);

export const FLAME_2023_OPEN_EXPECTED = Object.freeze({
  artifactFilename: "FLAME2023Open.zip",
  artifactLocalPath: "vendor/flame/FLAME2023Open.zip",
  attributionRequirements: ATTRIBUTION_REQUIREMENTS,
  containedModelLocalPath: "vendor/flame/flame2023_Open.pkl",
  containedModelFilename: "flame2023_Open.pkl",
  containedModelSha256:
    "e75a0990728ba038c7da2a420ae4396f7ddd7781366c13026066c5b24f127623",
  containedModelSizeBytes: 53023668,
  downloadedAt: "2026-08-11T22:36:00-05:00",
  downloadsPage: "https://flame.is.tue.mpg.de/download.php",
  downloadUrl:
    "https://download.is.tue.mpg.de/download.php?domain=flame&sfile=FLAME2023Open.zip",
  license: "CC-BY-4.0",
  licenseTermsUrl: "https://flame.is.tue.mpg.de/modellicense.html",
  release: "FLAME 2023 Open",
  schemaVersion: "synmere.third-party-model-provenance.v0",
  sha256: "a6b4c3dc15d569d98136a1e548b6fe532eb2830ca12a4f0d4b3a5dba8ee87a91",
  sizeBytes: 47586229,
});

const REQUIRED_GITIGNORE_RULES = Object.freeze([
  "/vendor/flame/*.zip",
  "/vendor/flame/*.pkl",
  "/vendor/flame/*.npz",
]);

const assert = (condition, message) => {
  if (!condition) {
    throw new Error(message);
  }
};

const sha256File = (filePath) => {
  return new Promise((resolve, reject) => {
    const hash = createHash("sha256");
    const stream = createReadStream(filePath);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("error", reject);
    stream.on("end", () => resolve(hash.digest("hex")));
  });
};

const stringArraysEqual = (left, right) => {
  return (
    Array.isArray(left) &&
    left.length === right.length &&
    left.every((value, index) => value === right[index])
  );
};

export const validateFlameProvenanceRecord = (record) => {
  assert(
    record?.schemaVersion === FLAME_2023_OPEN_EXPECTED.schemaVersion,
    "FLAME provenance schema is not supported.",
  );
  assert(
    record.model?.release === FLAME_2023_OPEN_EXPECTED.release,
    "Only the exact FLAME 2023 Open release is allowed.",
  );
  assert(
    record.model?.containedModelFilename ===
      FLAME_2023_OPEN_EXPECTED.containedModelFilename,
    "The contained model filename is not the FLAME 2023 Open model.",
  );
  assert(
    record.artifact?.filename === FLAME_2023_OPEN_EXPECTED.artifactFilename,
    "Only FLAME2023Open.zip is allowed; older or academic variants are rejected.",
  );
  assert(
    record.artifact?.localPath === FLAME_2023_OPEN_EXPECTED.artifactLocalPath,
    "The local FLAME artifact path is not the approved gitignored path.",
  );
  assert(
    record.artifact?.sha256 === FLAME_2023_OPEN_EXPECTED.sha256,
    "The recorded checksum is not the approved FLAME 2023 Open checksum.",
  );
  assert(
    record.artifact?.sizeBytes === FLAME_2023_OPEN_EXPECTED.sizeBytes,
    "The recorded artifact size does not match FLAME 2023 Open.",
  );
  assert(
    record.containedModel?.filename ===
      FLAME_2023_OPEN_EXPECTED.containedModelFilename &&
      record.containedModel?.localPath ===
        FLAME_2023_OPEN_EXPECTED.containedModelLocalPath &&
      record.containedModel?.sha256 ===
        FLAME_2023_OPEN_EXPECTED.containedModelSha256 &&
      record.containedModel?.sizeBytes ===
        FLAME_2023_OPEN_EXPECTED.containedModelSizeBytes,
    "The extracted model metadata is not the approved FLAME 2023 Open model.",
  );
  assert(
    record.source?.downloadUrl === FLAME_2023_OPEN_EXPECTED.downloadUrl,
    "The artifact source is not the approved official FLAME download URL.",
  );
  assert(
    record.source?.downloadsPage === FLAME_2023_OPEN_EXPECTED.downloadsPage,
    "The provenance record must link to the official FLAME downloads page.",
  );
  assert(
    record.source?.downloadedAt === FLAME_2023_OPEN_EXPECTED.downloadedAt,
    "The FLAME download timestamp does not match the reviewed provenance.",
  );
  assert(
    record.license?.declaredLicense === FLAME_2023_OPEN_EXPECTED.license,
    "The provenance record must identify the FLAME 2023 Open CC-BY-4.0 license.",
  );
  assert(
    record.license?.termsUrl === FLAME_2023_OPEN_EXPECTED.licenseTermsUrl,
    "The provenance record must link to the official FLAME model license.",
  );
  assert(
    record.license?.scope === "FLAME 2023 Open only",
    "The open license scope must be limited to FLAME 2023 Open.",
  );
  assert(
    stringArraysEqual(
      record.license?.attributionRequirements,
      FLAME_2023_OPEN_EXPECTED.attributionRequirements,
    ),
    "FLAME attribution requirements are incomplete.",
  );
  assert(
    Array.isArray(record.license?.additionalUseRestrictions) &&
      record.license.additionalUseRestrictions.length === 2,
    "FLAME additional use restrictions are incomplete.",
  );
  assert(
    record.provenanceGate?.passed === true &&
      record.provenanceGate?.loadedAtValidation === false &&
      record.provenanceGate?.convertedAtValidation === false,
    "The provenance gate must have passed before the model was loaded.",
  );
  assert(
    record.handling?.gitignored === true &&
      record.handling?.converted === true &&
      record.handling?.convertedForRelease === "identity-shell-v2.0.0" &&
      record.handling?.sourceArtifactDistributed === false &&
      record.handling?.derivedAssetProductFacing === true,
    "FLAME handling must identify the V2 derivative while keeping the source artifact local and undistributed.",
  );

  return record;
};

export const validateFlameArtifactMetadata = ({
  filename,
  sha256,
  sizeBytes,
}) => {
  assert(
    filename === FLAME_2023_OPEN_EXPECTED.artifactFilename,
    "The local artifact filename is not FLAME2023Open.zip.",
  );
  assert(
    sha256 === FLAME_2023_OPEN_EXPECTED.sha256,
    "The local artifact checksum does not match approved FLAME 2023 Open.",
  );
  assert(
    sizeBytes === FLAME_2023_OPEN_EXPECTED.sizeBytes,
    "The local artifact size does not match approved FLAME 2023 Open.",
  );
};

export const validateLocalFlameArtifact = async ({
  artifactPath = FLAME_2023_OPEN_ARTIFACT_PATH,
  provenancePath = FLAME_2023_OPEN_PROVENANCE_PATH,
} = {}) => {
  const provenance = validateFlameProvenanceRecord(
    JSON.parse(await readFile(provenancePath, "utf8")),
  );
  const gitignore = await readFile(GITIGNORE_PATH, "utf8");
  for (const rule of REQUIRED_GITIGNORE_RULES) {
    assert(
      gitignore.split(/\r?\n/u).includes(rule),
      `Required FLAME gitignore rule is missing: ${rule}`,
    );
  }
  const artifactStats = await stat(artifactPath);
  const artifactSha256 = await sha256File(artifactPath);

  validateFlameArtifactMetadata({
    filename: path.basename(artifactPath),
    sha256: artifactSha256,
    sizeBytes: artifactStats.size,
  });

  return {
    artifactPath: path.relative(PROJECT_ROOT, artifactPath),
    filename: path.basename(artifactPath),
    gitignored: true,
    release: provenance.model.release,
    sha256: artifactSha256,
    sizeBytes: artifactStats.size,
    status: "passed",
  };
};

if (pathToFileURL(process.argv[1]).href === import.meta.url) {
  const result = await validateLocalFlameArtifact();
  console.log(JSON.stringify(result, null, 2));
}

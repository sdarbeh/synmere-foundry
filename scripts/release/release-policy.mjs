import { access } from "node:fs/promises";

export const SEMANTIC_VERSION_PATTERN = /^\d+\.\d+\.\d+$/u;

export const assertSemanticVersion = (version) => {
  if (!SEMANTIC_VERSION_PATTERN.test(version)) {
    throw new Error(`Avatar release version "${version}" is not semantic.`);
  }
};

export const assertReleaseDoesNotExist = async (releasePath) => {
  try {
    await access(releasePath);
  } catch {
    return;
  }
  throw new Error(`Immutable avatar release already exists: ${releasePath}`);
};

export const getReleaseTag = (version) => {
  assertSemanticVersion(version);
  return `identity-shell-v${version}`;
};

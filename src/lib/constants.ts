// PHARN OSS lives in a single repo with module subfolders (pharn-core,
// pharn-pipeline, …). The CLI fetches the whole repo, then copies the
// selected modules' `installs` maps into the user's `.claude/`.
export const REPO = 'pharn-dev/pharn-oss';
export const REPO_BRANCH = 'main';
export const REPO_URL = 'github.com/pharn-dev/pharn-oss';

// raw.githubusercontent.com path to the authoritative version + dependency
// manifest. Used by `pharn update` to check the latest skillsVersion without
// cloning the whole repo.
export const MANIFEST_RAW_PATH = `${REPO}/${REPO_BRANCH}/manifest.json`;

export const DOCS_URL = 'https://github.com/pharn-dev/pharn-oss/tree/main/docs';
export const FIRST_FEATURE_COMMAND = '/pharn-plan';

// pharn-core is always installed; it is the foundation every other module
// depends on.
export const CORE_MODULE = 'pharn-core';

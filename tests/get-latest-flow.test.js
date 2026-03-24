const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const ROOT = path.resolve(__dirname, "..");

function extractFunctionSource(source, functionName) {
  const markers = [`async function ${functionName}(`, `function ${functionName}(`];
  let start = -1;
  for (const marker of markers) {
    start = source.indexOf(marker);
    if (start !== -1) {
      break;
    }
  }
  assert.notEqual(start, -1, `Unable to locate ${functionName}`);
  const paramsStart = source.indexOf("(", start);
  assert.notEqual(paramsStart, -1, `Unable to locate params for ${functionName}`);
  let paramsDepth = 0;
  let bodyStart = -1;
  for (let index = paramsStart; index < source.length; index += 1) {
    const char = source[index];
    if (char === "(") paramsDepth += 1;
    if (char === ")") {
      paramsDepth -= 1;
      if (paramsDepth === 0) {
        bodyStart = source.indexOf("{", index);
        break;
      }
    }
  }
  assert.notEqual(bodyStart, -1, `Unable to locate body for ${functionName}`);
  let depth = 0;
  for (let index = bodyStart; index < source.length; index += 1) {
    const char = source[index];
    if (char === "{") depth += 1;
    if (char === "}") {
      depth -= 1;
      if (depth === 0) {
        return source.slice(start, index + 1);
      }
    }
  }
  throw new Error(`Unterminated function: ${functionName}`);
}

function loadGetLatestHelpers(seed = {}) {
  const filePath = path.join(ROOT, "background.js");
  const source = fs.readFileSync(filePath, "utf8");
  const script = [
    'const UNDERPAR_GITHUB_OWNER = "HH5HH";',
    'const UNDERPAR_GITHUB_REPO = "UNDERPAR";',
    'const UNDERPAR_LATEST_REF_API_URL = `https://api.github.com/repos/${UNDERPAR_GITHUB_OWNER}/${UNDERPAR_GITHUB_REPO}/git/ref/heads/main`;',
    'const UNDERPAR_LATEST_COMMIT_API_URL = `https://api.github.com/repos/${UNDERPAR_GITHUB_OWNER}/${UNDERPAR_GITHUB_REPO}/commits/main`;',
    'const UNDERPAR_PACKAGE_METADATA_PATH = "underpar_distro.version.json";',
    'const UNDERPAR_LATEST_PACKAGE_METADATA_URL = `https://raw.githubusercontent.com/${UNDERPAR_GITHUB_OWNER}/${UNDERPAR_GITHUB_REPO}/main/${UNDERPAR_PACKAGE_METADATA_PATH}`;',
    'const UNDERPAR_LATEST_PACKAGE_METADATA_API_URL = `https://api.github.com/repos/${UNDERPAR_GITHUB_OWNER}/${UNDERPAR_GITHUB_REPO}/contents/${UNDERPAR_PACKAGE_METADATA_PATH}?ref=main`;',
    'const UNDERPAR_LATEST_PACKAGE_URL = `https://raw.githubusercontent.com/${UNDERPAR_GITHUB_OWNER}/${UNDERPAR_GITHUB_REPO}/main/underpar_distro.zip`;',
    'const UNDERPAR_LOCAL_PACKAGE_PATH = "underpar_distro.zip";',
    'const CHROME_EXTENSIONS_URL = "chrome://extensions";',
    'const UPDATE_CHECK_TTL_MS = 10 * 60 * 1000;',
    "const chrome = globalThis.__seed.chrome;",
    "const fetch = globalThis.__seed.fetch;",
    "const updateState = globalThis.__seed.updateState || { currentVersion: '', latestVersion: '', latestCommitSha: '', latestSource: '', localPackageVersion: '', updateAvailable: false, lastCheckedAt: 0, checkError: '', inFlight: null };",
    extractFunctionSource(source, "getUnderparBuildVersion"),
    extractFunctionSource(source, "parseVersionPart"),
    extractFunctionSource(source, "compareVersions"),
    extractFunctionSource(source, "extractVersionFromManifestObject"),
    extractFunctionSource(source, "extractUpdateLookupErrorMessage"),
    extractFunctionSource(source, "extractUpdateLookupHost"),
    extractFunctionSource(source, "buildUpdateLookupError"),
    extractFunctionSource(source, "buildUpdateLookupAttemptsError"),
    extractFunctionSource(source, "fetchUpdateLookupJson"),
    extractFunctionSource(source, "buildLatestUnderparPackageMetadataRawUrl"),
    extractFunctionSource(source, "buildLatestUnderparPackageMetadataApiUrl"),
    extractFunctionSource(source, "fetchLatestUnderparVersionFromRaw"),
    extractFunctionSource(source, "fetchLatestUnderparVersionFromGithubApi"),
    extractFunctionSource(source, "fetchLatestUnderparVersion"),
    extractFunctionSource(source, "normalizeCommitSha"),
    extractFunctionSource(source, "extractCommitShaFromRefPayload"),
    extractFunctionSource(source, "extractCommitShaFromCommitPayload"),
    extractFunctionSource(source, "fetchLatestUnderparCommitShaFromRefApi"),
    extractFunctionSource(source, "fetchLatestUnderparCommitShaFromCommitApi"),
    extractFunctionSource(source, "fetchLatestUnderparCommitSha"),
    extractFunctionSource(source, "withCacheBust"),
    extractFunctionSource(source, "buildLatestUnderparPackageUrl"),
    extractFunctionSource(source, "buildLocalUnderparPackageUrl"),
    extractFunctionSource(source, "buildLocalUnderparPackageMetadataUrl"),
    extractFunctionSource(source, "fetchLocalUnderparPackageVersion"),
    extractFunctionSource(source, "resolveLatestUnderparPackageState"),
    extractFunctionSource(source, "shouldPreferLocalUnderparPackage"),
    extractFunctionSource(source, "sanitizeLatestPackageFileSegment"),
    extractFunctionSource(source, "buildLatestUnderparPackageFileName"),
    extractFunctionSource(source, "startLatestPackageDownload"),
    extractFunctionSource(source, "getUpdateStatePayload"),
    extractFunctionSource(source, "refreshUpdateState"),
    extractFunctionSource(source, "openUnderparGetLatestFlow"),
    "module.exports = { buildLatestUnderparPackageUrl, getUpdateStatePayload, refreshUpdateState, openUnderparGetLatestFlow, updateState };",
  ].join("\n\n");
  const context = {
    module: { exports: {} },
    exports: {},
    __seed: seed,
    atob: (value) => Buffer.from(String(value || ""), "base64").toString("utf8"),
    URL,
  };
  vm.runInNewContext(script, context, { filename: filePath });
  return context.module.exports;
}

function createSeed(options = {}) {
  const calls = {
    fetch: [],
    downloadsDownload: [],
    tabsCreate: [],
  };
  const responseByUrl = new Map(Object.entries(options.responseByUrl || {}));
  return {
    calls,
    chrome: {
      runtime: {
        getManifest() {
          return { version: String(options.currentVersion || "1.0.0") };
        },
        getURL(pathname = "") {
          return `chrome-extension://underpar/${String(pathname || "").replace(/^\/+/, "")}`;
        },
      },
      downloads: {
        async download(info = {}) {
          calls.downloadsDownload.push({ ...info });
          if (options.downloadShouldFail === true) {
            throw new Error("download failed");
          }
          return Number(options.downloadId || 91);
        },
      },
      tabs: {
        async create(info = {}) {
          calls.tabsCreate.push({ ...info });
          return {
            id: calls.tabsCreate.length,
            windowId: 1,
            url: String(info.url || ""),
          };
        },
      },
    },
    async fetch(url) {
      const targetUrl = String(url || "");
      calls.fetch.push(targetUrl);
      if (responseByUrl.has(targetUrl)) {
        const mapped = responseByUrl.get(targetUrl);
        if (mapped instanceof Error) {
          throw mapped;
        }
        return mapped;
      }
      try {
        const parsed = new URL(targetUrl);
        if (parsed.searchParams.has("cacheBust")) {
          parsed.searchParams.delete("cacheBust");
          const normalizedUrl = parsed.toString();
          if (responseByUrl.has(normalizedUrl)) {
            const mapped = responseByUrl.get(normalizedUrl);
            if (mapped instanceof Error) {
              throw mapped;
            }
            return mapped;
          }
        }
      } catch {
        // Ignore parse failures and fall through to the default 404 response.
      }
      return {
        ok: false,
        status: 404,
        async json() {
          return {};
        },
      };
    },
    updateState: {
      currentVersion: "",
      latestVersion: "",
      latestCommitSha: "",
      latestSource: "",
      localPackageVersion: "",
      updateAvailable: false,
      lastCheckedAt: 0,
      checkError: "",
      inFlight: null,
    },
  };
}

test("openUnderparGetLatestFlow uses a SHA-pinned underpar_distro.zip when GitHub ref lookup succeeds", async () => {
  const latestSha = "0123456789abcdef0123456789abcdef01234567";
  const seed = createSeed({
    currentVersion: "1.0.0",
    responseByUrl: {
      [`https://raw.githubusercontent.com/HH5HH/UNDERPAR/${latestSha}/underpar_distro.version.json`]: {
        ok: true,
        status: 200,
        async json() {
          return { version: "9.9.9" };
        },
      },
      "https://raw.githubusercontent.com/HH5HH/UNDERPAR/main/underpar_distro.version.json": {
        ok: true,
        status: 200,
        async json() {
          return { version: "9.9.9" };
        },
      },
      "https://api.github.com/repos/HH5HH/UNDERPAR/git/ref/heads/main": {
        ok: true,
        status: 200,
        async json() {
          return { object: { sha: latestSha } };
        },
      },
    },
  });

  const helpers = loadGetLatestHelpers(seed);
  const response = await helpers.openUnderparGetLatestFlow();

  assert.equal(response.ok, true);
  assert.equal(String(response.latestCommitSha || ""), latestSha);
  assert.equal(response.downloadStarted, true);
  assert.equal(seed.calls.downloadsDownload.length, 1);
  assert.equal(seed.calls.tabsCreate.length, 1);
  const downloadUrl = String(seed.calls.downloadsDownload[0]?.url || "");
  assert.match(downloadUrl, new RegExp(`/${latestSha}/underpar_distro\\.zip\\?cacheBust=\\d+$`));
  assert.equal(downloadUrl.includes("/main/underpar_distro.zip"), false);
  assert.match(String(seed.calls.downloadsDownload[0]?.filename || ""), /^UnderPAR-v9\.9\.9-0123456\.zip$/);
  assert.equal(String(seed.calls.tabsCreate[0]?.url || ""), "chrome://extensions");
});

test("openUnderparGetLatestFlow uses the commit-pinned manifest version when main lags behind", async () => {
  const latestSha = "89abcdef0123456789abcdef0123456789abcdef";
  const seed = createSeed({
    currentVersion: "1.12.62",
    responseByUrl: {
      "https://raw.githubusercontent.com/HH5HH/UNDERPAR/main/underpar_distro.version.json": {
        ok: true,
        status: 200,
        async json() {
          return { version: "1.12.62" };
        },
      },
      [`https://raw.githubusercontent.com/HH5HH/UNDERPAR/${latestSha}/underpar_distro.version.json`]: {
        ok: true,
        status: 200,
        async json() {
          return { version: "1.12.64" };
        },
      },
      "https://api.github.com/repos/HH5HH/UNDERPAR/git/ref/heads/main": {
        ok: true,
        status: 200,
        async json() {
          return { object: { sha: latestSha } };
        },
      },
    },
  });

  const helpers = loadGetLatestHelpers(seed);
  const response = await helpers.openUnderparGetLatestFlow();

  assert.equal(response.ok, true);
  assert.equal(String(response.latestVersion || ""), "1.12.64");
  assert.equal(String(response.latestCommitSha || ""), latestSha);
  assert.equal(seed.calls.downloadsDownload.length, 1);
  assert.match(String(seed.calls.downloadsDownload[0]?.filename || ""), /^UnderPAR-v1\.12\.64-89abcde\.zip$/);
  assert.ok(
    seed.calls.fetch.includes(`https://raw.githubusercontent.com/HH5HH/UNDERPAR/${latestSha}/underpar_distro.version.json`)
  );
});

test("openUnderparGetLatestFlow reports no newer package when the loaded build is newer than GitHub main", async () => {
  const seed = createSeed({
    currentVersion: "1.12.88",
    responseByUrl: {
      "https://raw.githubusercontent.com/HH5HH/UNDERPAR/main/underpar_distro.version.json": {
        ok: true,
        status: 200,
        async json() {
          return { version: "1.12.86" };
        },
      },
      "https://api.github.com/repos/HH5HH/UNDERPAR/git/ref/heads/main": {
        ok: true,
        status: 200,
        async json() {
          return { object: { sha: "0123456789abcdef0123456789abcdef01234567" } };
        },
      },
    },
  });

  const helpers = loadGetLatestHelpers(seed);
  const response = await helpers.openUnderparGetLatestFlow();

  assert.equal(response.ok, true);
  assert.equal(response.noNewerPackage, true);
  assert.equal(String(response.latestSource || ""), "github-remote");
  assert.match(String(response.infoMessage || ""), /newer than published GitHub latest/i);
  assert.equal(seed.calls.downloadsDownload.length, 0);
  assert.equal(seed.calls.tabsCreate.length, 0);
});

test("openUnderparGetLatestFlow downloads the remote GitHub package when bundled and remote versions match", async () => {
  const latestSha = "89abcdef0123456789abcdef0123456789abcdef";
  const seed = createSeed({
    currentVersion: "1.16.39",
    responseByUrl: {
      "chrome-extension://underpar/underpar_distro.version.json": {
        ok: true,
        status: 200,
        async json() {
          return { version: "1.16.39" };
        },
      },
      [`https://raw.githubusercontent.com/HH5HH/UNDERPAR/${latestSha}/underpar_distro.version.json`]: {
        ok: true,
        status: 200,
        async json() {
          return { version: "1.16.39" };
        },
      },
      "https://raw.githubusercontent.com/HH5HH/UNDERPAR/main/underpar_distro.version.json": {
        ok: true,
        status: 200,
        async json() {
          return { version: "1.16.39" };
        },
      },
      "https://api.github.com/repos/HH5HH/UNDERPAR/git/ref/heads/main": {
        ok: true,
        status: 200,
        async json() {
          return { object: { sha: latestSha } };
        },
      },
    },
  });

  const helpers = loadGetLatestHelpers(seed);
  const response = await helpers.openUnderparGetLatestFlow();

  assert.equal(response.ok, true);
  assert.equal(response.noNewerPackage, false);
  assert.equal(String(response.downloadSource || ""), "github-remote");
  assert.equal(String(response.latestSource || ""), "github-remote");
  assert.equal(String(response.latestVersion || ""), "1.16.39");
  assert.equal(String(response.localPackageVersion || ""), "1.16.39");
  assert.equal(response.downloadStarted, true);
  assert.equal(response.downloadTabOpened, false);
  assert.equal(seed.calls.downloadsDownload.length, 1);
  assert.equal(seed.calls.tabsCreate.length, 1);
  assert.match(
    String(seed.calls.downloadsDownload[0]?.url || ""),
    new RegExp(`/${latestSha}/underpar_distro\\.zip\\?cacheBust=\\d+$`)
  );
  assert.equal(String(seed.calls.downloadsDownload[0]?.filename || ""), "UnderPAR-v1.16.39-89abcde.zip");
  assert.equal(String(seed.calls.tabsCreate[0]?.url || ""), "chrome://extensions");
});

test("openUnderparGetLatestFlow prefers the local runtime package when local distro metadata is newer than GitHub main", async () => {
  const seed = createSeed({
    currentVersion: "1.16.29",
    responseByUrl: {
      "chrome-extension://underpar/underpar_distro.version.json": {
        ok: true,
        status: 200,
        async json() {
          return { version: "1.16.33" };
        },
      },
      "https://raw.githubusercontent.com/HH5HH/UNDERPAR/main/underpar_distro.version.json": {
        ok: true,
        status: 200,
        async json() {
          return { version: "1.16.29" };
        },
      },
      "https://api.github.com/repos/HH5HH/UNDERPAR/git/ref/heads/main": {
        ok: true,
        status: 200,
        async json() {
          return { object: { sha: "0123456789abcdef0123456789abcdef01234567" } };
        },
      },
    },
  });

  const helpers = loadGetLatestHelpers(seed);
  const response = await helpers.openUnderparGetLatestFlow();

  assert.equal(response.ok, true);
  assert.equal(String(response.latestVersion || ""), "1.16.33");
  assert.equal(String(response.latestSource || ""), "local-runtime");
  assert.equal(String(response.downloadSource || ""), "local-runtime");
  assert.equal(String(response.localPackageVersion || ""), "1.16.33");
  assert.equal(response.downloadStarted, true);
  assert.equal(response.downloadTabOpened, false);
  assert.equal(String(response.downloadFileName || ""), "UnderPAR-v1.16.33.zip");
  assert.equal(seed.calls.downloadsDownload.length, 1);
  assert.equal(seed.calls.tabsCreate.length, 1);
  assert.equal(String(seed.calls.downloadsDownload[0]?.url || "").startsWith("chrome-extension://underpar/underpar_distro.zip?cacheBust="), true);
  assert.equal(String(seed.calls.downloadsDownload[0]?.filename || ""), "UnderPAR-v1.16.33.zip");
  assert.equal(String(seed.calls.tabsCreate[0]?.url || ""), "chrome://extensions");
});

test("openUnderparGetLatestFlow falls back to main underpar_distro.zip with cache bust when SHA lookup fails", async () => {
  const seed = createSeed({
    currentVersion: "1.0.0",
    responseByUrl: {
      "https://raw.githubusercontent.com/HH5HH/UNDERPAR/main/underpar_distro.version.json": {
        ok: true,
        status: 200,
        async json() {
          return { version: "9.9.9" };
        },
      },
    },
  });

  const helpers = loadGetLatestHelpers(seed);
  const response = await helpers.openUnderparGetLatestFlow();

  assert.equal(response.ok, true);
  assert.equal(String(response.latestCommitSha || ""), "");
  assert.equal(response.downloadStarted, true);
  assert.equal(seed.calls.downloadsDownload.length, 1);
  assert.equal(seed.calls.tabsCreate.length, 1);
  const downloadUrl = String(seed.calls.downloadsDownload[0]?.url || "");
  assert.match(downloadUrl, /\/main\/underpar_distro\.zip\?cacheBust=\d+$/);
  assert.match(String(seed.calls.downloadsDownload[0]?.filename || ""), /^UnderPAR-v9\.9\.9\.zip$/);
  assert.equal(String(seed.calls.tabsCreate[0]?.url || ""), "chrome://extensions");
});

test("openUnderparGetLatestFlow ignores stale cached SHA when latest metadata refresh fails", async () => {
  const staleSha = "53c53c53c53c53c53c53c53c53c53c53c53c53c5";
  const seed = createSeed({
    currentVersion: "1.12.53",
  });
  seed.updateState.latestVersion = "1.12.53";
  seed.updateState.latestCommitSha = staleSha;
  seed.updateState.updateAvailable = false;

  const helpers = loadGetLatestHelpers(seed);
  const response = await helpers.openUnderparGetLatestFlow();

  assert.equal(response.ok, true);
  assert.equal(String(response.latestCommitSha || ""), "");
  assert.notEqual(String(response.checkError || ""), "");
  assert.equal(seed.calls.downloadsDownload.length, 1);
  const downloadUrl = String(seed.calls.downloadsDownload[0]?.url || "");
  assert.match(downloadUrl, /\/main\/underpar_distro\.zip\?cacheBust=\d+$/);
  assert.doesNotMatch(downloadUrl, new RegExp(`/${staleSha}/underpar_distro\\.zip`));
  assert.match(String(seed.calls.downloadsDownload[0]?.filename || ""), /^UnderPAR-vlatest\.zip$/);
});

test("openUnderparGetLatestFlow avoids stale local-runtime fallback when bundled distro metadata lags behind the loaded build", async () => {
  const seed = createSeed({
    currentVersion: "1.16.36",
    responseByUrl: {
      "chrome-extension://underpar/underpar_distro.version.json": {
        ok: true,
        status: 200,
        async json() {
          return { version: "1.16.34" };
        },
      },
      "https://api.github.com/repos/HH5HH/UNDERPAR/git/ref/heads/main": new TypeError("Failed to fetch"),
      "https://api.github.com/repos/HH5HH/UNDERPAR/commits/main": new TypeError("Failed to fetch"),
      "https://api.github.com/repos/HH5HH/UNDERPAR/contents/underpar_distro.version.json?ref=main": new TypeError("Failed to fetch"),
      "https://raw.githubusercontent.com/HH5HH/UNDERPAR/main/underpar_distro.version.json": new TypeError("Failed to fetch"),
    },
  });

  const helpers = loadGetLatestHelpers(seed);
  const response = await helpers.openUnderparGetLatestFlow();

  assert.equal(response.ok, true);
  assert.equal(String(response.downloadSource || ""), "github-remote");
  assert.equal(String(response.latestSource || ""), "github-remote");
  assert.equal(String(response.localPackageVersion || ""), "1.16.34");
  assert.match(String(response.checkError || ""), /Latest version lookup failed/);
  assert.match(String(response.checkError || ""), /api\.github\.com|raw\.githubusercontent\.com/);
  assert.equal(seed.calls.downloadsDownload.length, 1);
  assert.match(String(seed.calls.downloadsDownload[0]?.url || ""), /\/main\/underpar_distro\.zip\?cacheBust=\d+$/);
  assert.equal(String(seed.calls.downloadsDownload[0]?.url || "").startsWith("chrome-extension://underpar/underpar_distro.zip"), false);
});

test("openUnderparGetLatestFlow falls back to opening the package tab when downloads API fails", async () => {
  const latestSha = "fedcba9876543210fedcba9876543210fedcba98";
  const seed = createSeed({
    currentVersion: "1.0.0",
    downloadShouldFail: true,
    responseByUrl: {
      "https://raw.githubusercontent.com/HH5HH/UNDERPAR/main/underpar_distro.version.json": {
        ok: true,
        status: 200,
        async json() {
          return { version: "8.8.8" };
        },
      },
      "https://api.github.com/repos/HH5HH/UNDERPAR/git/ref/heads/main": {
        ok: true,
        status: 200,
        async json() {
          return { object: { sha: latestSha } };
        },
      },
    },
  });

  const helpers = loadGetLatestHelpers(seed);
  const response = await helpers.openUnderparGetLatestFlow();

  assert.equal(response.ok, true);
  assert.equal(response.downloadStarted, false);
  assert.equal(response.downloadTabOpened, true);
  assert.equal(seed.calls.downloadsDownload.length, 1);
  assert.equal(seed.calls.tabsCreate.length, 2);
  assert.match(String(seed.calls.tabsCreate[0]?.url || ""), new RegExp(`/${latestSha}/underpar_distro\\.zip\\?cacheBust=\\d+$`));
  assert.equal(String(seed.calls.tabsCreate[1]?.url || ""), "chrome://extensions");
});

test("openUnderparGetLatestFlow falls back to opening the bundled package tab when local-runtime downloads fail", async () => {
  const seed = createSeed({
    currentVersion: "1.16.29",
    downloadShouldFail: true,
    responseByUrl: {
      "chrome-extension://underpar/underpar_distro.version.json": {
        ok: true,
        status: 200,
        async json() {
          return { version: "1.16.33" };
        },
      },
      "https://raw.githubusercontent.com/HH5HH/UNDERPAR/main/underpar_distro.version.json": {
        ok: true,
        status: 200,
        async json() {
          return { version: "1.16.29" };
        },
      },
      "https://api.github.com/repos/HH5HH/UNDERPAR/git/ref/heads/main": {
        ok: true,
        status: 200,
        async json() {
          return { object: { sha: "0123456789abcdef0123456789abcdef01234567" } };
        },
      },
    },
  });

  const helpers = loadGetLatestHelpers(seed);
  const response = await helpers.openUnderparGetLatestFlow();

  assert.equal(response.ok, true);
  assert.equal(String(response.latestSource || ""), "local-runtime");
  assert.equal(String(response.downloadSource || ""), "local-runtime");
  assert.equal(response.downloadStarted, false);
  assert.equal(response.downloadTabOpened, true);
  assert.equal(seed.calls.downloadsDownload.length, 1);
  assert.equal(seed.calls.tabsCreate.length, 2);
  assert.equal(String(seed.calls.downloadsDownload[0]?.filename || ""), "UnderPAR-v1.16.33.zip");
  assert.equal(String(seed.calls.tabsCreate[0]?.url || "").startsWith("chrome-extension://underpar/underpar_distro.zip?cacheBust="), true);
  assert.equal(String(seed.calls.tabsCreate[1]?.url || ""), "chrome://extensions");
});

test("refreshUpdateState reports the downloadable package version instead of a newer repo manifest", async () => {
  const latestSha = "1234567890abcdef1234567890abcdef12345678";
  const seed = createSeed({
    currentVersion: "1.13.61",
    responseByUrl: {
      [`https://raw.githubusercontent.com/HH5HH/UNDERPAR/${latestSha}/underpar_distro.version.json`]: {
        ok: true,
        status: 200,
        async json() {
          return { version: "1.13.61" };
        },
      },
      "https://api.github.com/repos/HH5HH/UNDERPAR/git/ref/heads/main": {
        ok: true,
        status: 200,
        async json() {
          return { object: { sha: latestSha } };
        },
      },
      "https://raw.githubusercontent.com/HH5HH/UNDERPAR/main/manifest.json": {
        ok: true,
        status: 200,
        async json() {
          return { version: "1.13.63" };
        },
      },
    },
  });

  const helpers = loadGetLatestHelpers(seed);
  const response = await helpers.refreshUpdateState({ force: true });

  assert.equal(String(response.latestVersion || ""), "1.13.61");
  assert.equal(response.updateAvailable, false);
  assert.equal(seed.calls.fetch.includes("https://raw.githubusercontent.com/HH5HH/UNDERPAR/main/manifest.json"), false);
});

test("refreshUpdateState reports stage-specific GitHub lookup failures instead of a generic connectivity diagnosis", async () => {
  const seed = createSeed({
    currentVersion: "1.16.36",
    responseByUrl: {
      "https://api.github.com/repos/HH5HH/UNDERPAR/git/ref/heads/main": new TypeError("Failed to fetch"),
      "https://api.github.com/repos/HH5HH/UNDERPAR/commits/main": new TypeError("Failed to fetch"),
      "https://api.github.com/repos/HH5HH/UNDERPAR/contents/underpar_distro.version.json?ref=main": new TypeError("Failed to fetch"),
      "https://raw.githubusercontent.com/HH5HH/UNDERPAR/main/underpar_distro.version.json": new TypeError("net::ERR_NAME_NOT_RESOLVED"),
    },
  });

  const helpers = loadGetLatestHelpers(seed);
  const response = await helpers.refreshUpdateState({ force: true });

  assert.equal(String(response.latestVersion || ""), "");
  assert.equal(response.updateAvailable, false);
  assert.match(String(response.checkError || ""), /Latest version lookup failed/);
  assert.match(String(response.checkError || ""), /GitHub API package metadata lookup|GitHub raw package metadata lookup/);
  assert.match(String(response.checkError || ""), /api\.github\.com|raw\.githubusercontent\.com/);
  assert.doesNotMatch(String(response.checkError || ""), /not connected to the internet/i);
});

test("refreshUpdateState reports the local runtime distro version when it is newer than GitHub main", async () => {
  const latestSha = "fedcba9876543210fedcba9876543210fedcba98";
  const seed = createSeed({
    currentVersion: "1.16.29",
    responseByUrl: {
      "chrome-extension://underpar/underpar_distro.version.json": {
        ok: true,
        status: 200,
        async json() {
          return { version: "1.16.33" };
        },
      },
      [`https://raw.githubusercontent.com/HH5HH/UNDERPAR/${latestSha}/underpar_distro.version.json`]: {
        ok: true,
        status: 200,
        async json() {
          return { version: "1.16.29" };
        },
      },
      "https://api.github.com/repos/HH5HH/UNDERPAR/git/ref/heads/main": {
        ok: true,
        status: 200,
        async json() {
          return { object: { sha: latestSha } };
        },
      },
    },
  });

  const helpers = loadGetLatestHelpers(seed);
  const response = await helpers.refreshUpdateState({ force: true });

  assert.equal(String(response.latestVersion || ""), "1.16.33");
  assert.equal(String(response.latestCommitSha || ""), "");
  assert.equal(String(response.latestSource || ""), "local-runtime");
  assert.equal(String(response.localPackageVersion || ""), "1.16.33");
  assert.equal(response.updateAvailable, true);
});

test("UnderPAR avatar menu exposes a Get Latest action wired to the background flow", () => {
  const sidepanelHtml = fs.readFileSync(path.join(ROOT, "sidepanel.html"), "utf8");
  const popupSource = fs.readFileSync(path.join(ROOT, "popup.js"), "utf8");

  assert.match(sidepanelHtml, /id="get-latest-btn"/);
  assert.match(popupSource, /UNDERPAR_GET_LATEST_REQUEST_TYPE/);
  assert.match(popupSource, /Starting latest UnderPAR download and opening chrome:\/\/extensions\.\.\./);
});

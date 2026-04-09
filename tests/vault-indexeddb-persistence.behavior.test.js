const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");

function read(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), "utf8");
}

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

test("popup VAULT persistence uses IndexedDB and does not persist CM tenant bundles per programmer", () => {
  const popupSource = read("popup.js");
  const loadSource = extractFunctionSource(popupSource, "ensurePassVaultLoaded");
  const persistSource = extractFunctionSource(popupSource, "persistPassVaultPayloadToStorage");
  const listenerSource = extractFunctionSource(popupSource, "registerPassVaultStorageListener");
  const programmerRecordSource = extractFunctionSource(popupSource, "buildPassVaultProgrammerRecord");
  const cmGlobalSource = extractFunctionSource(popupSource, "buildPassVaultCmGlobalAuthRecord");

  assert.match(loadSource, /underparVaultStore\s*\.\s*readAggregatePayload\(\)/);
  assert.doesNotMatch(loadSource, /readLegacyUnderparVaultPayloadFromChromeStorage/);
  assert.doesNotMatch(loadSource, /readLegacyCmTenantsCatalogFromChromeStorageOnly/);
  assert.doesNotMatch(loadSource, /chrome\.storage\.local\.get\(UNDERPAR_VAULT_STORAGE_KEY\)/);
  assert.match(persistSource, /underparVaultStore\.writeAggregatePayload\(persistableVault\)/);
  assert.doesNotMatch(persistSource, /chrome\.storage\.local\.set\(/);
  assert.match(listenerSource, /underparVaultStore\.subscribe\(/);
  assert.doesNotMatch(listenerSource, /chrome\.storage\.onChanged\.addListener/);
  assert.doesNotMatch(programmerRecordSource, /cmTenantBundlesByTenantKey/);
  assert.doesNotMatch(cmGlobalSource, /tokenFingerprint/);
  assert.doesNotMatch(cmGlobalSource, /imsSession/);
});

test("CM tenant catalog persistence keeps only lightweight tenant metadata", () => {
  const popupSource = read("popup.js");
  const persistSource = extractFunctionSource(popupSource, "buildCmTenantsCatalogPersistPayload");

  assert.match(persistSource, /tenantId:/);
  assert.match(persistSource, /tenantName:/);
  assert.doesNotMatch(persistSource, /raw:/);
});

test("devtools, saved-query bridge, and background use the shared IndexedDB vault store", () => {
  const panelSource = read("up-devtools-panel.js");
  const bridgeSource = read("saved-query-bridge.js");
  const backgroundSource = read("background.js");
  const storeSource = read("underpar-vault-store.js");
  const popupSource = read("popup.js");
  const purgeSource = extractFunctionSource(popupSource, "purgePassVaultFromDevtools");

  assert.match(panelSource, /underparVaultStore\.readAggregatePayload\(\)/);
  assert.match(panelSource, /underparVaultStore\.writeAggregatePayload\(normalizedVault\)/);
  assert.doesNotMatch(panelSource, /chrome\.storage\.local\.get\(UNDERPAR_VAULT_STORAGE_KEY\)/);
  assert.doesNotMatch(panelSource, /chrome\.storage\.local\.set\(\s*\{\s*\[UNDERPAR_VAULT_STORAGE_KEY\]/);
  assert.match(bridgeSource, /underparVaultStore\.readAggregatePayload\(\)/);
  assert.match(bridgeSource, /underparVaultStore\.writeAggregatePayload\(normalizedVault\)/);
  assert.doesNotMatch(bridgeSource, /chrome\.storage\.local\.get\(UNDERPAR_VAULT_STORAGE_KEY\)/);
  assert.doesNotMatch(bridgeSource, /chrome\.storage\.local\.set\(\s*\{\s*\[UNDERPAR_VAULT_STORAGE_KEY\]/);
  assert.match(backgroundSource, /importScripts\("underpar-vault-store\.js"\)/);
  assert.match(backgroundSource, /vaultStore\.readAggregatePayload\(\)/);
  assert.doesNotMatch(backgroundSource, /chrome\.storage\.local\.get\(UNDERPAR_VAULT_STORAGE_KEY\)/);
  assert.doesNotMatch(storeSource, /cmGlobal:\s*cloneJsonLikeValue\(record\?\.cmGlobal/);
  assert.match(storeSource, /function sanitizeProgrammerCmServiceSummary\(/);
  assert.doesNotMatch(storeSource, /tokenFingerprint/);
  assert.doesNotMatch(storeSource, /imsSession/);
  assert.match(purgeSource, /underparVaultStore\.writeAggregatePayload\(createEmptyUnderparVaultPayload\(\)\)/);
  assert.match(purgeSource, /underparVaultStore\.readAggregatePayload\(\)/);
  assert.doesNotMatch(purgeSource, /underparVaultStore\.clear\(\)\.catch\(\(\) => false\)/);
});

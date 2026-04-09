const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");

function extractFunctionSource(sourceText, functionName) {
  const marker = `function ${functionName}(`;
  const start = sourceText.indexOf(marker);
  if (start === -1) {
    throw new Error(`Function ${functionName} not found`);
  }
  let signatureDepth = 0;
  let bodyStart = -1;
  for (let index = start; index < sourceText.length; index += 1) {
    const ch = sourceText[index];
    if (ch === "(") {
      signatureDepth += 1;
      continue;
    }
    if (ch === ")") {
      signatureDepth = Math.max(0, signatureDepth - 1);
      continue;
    }
    if (ch === "{" && signatureDepth === 0) {
      bodyStart = index;
      break;
    }
  }
  if (bodyStart === -1) {
    throw new Error(`Function ${functionName} has no body`);
  }

  let depth = 0;
  for (let index = bodyStart; index < sourceText.length; index += 1) {
    const ch = sourceText[index];
    if (ch === "{") {
      depth += 1;
      continue;
    }
    if (ch === "}") {
      depth -= 1;
      if (depth === 0) {
        return sourceText.slice(start, index + 1);
      }
    }
  }

  throw new Error(`Function ${functionName} did not terminate`);
}

test("ESM, Degradation, and TempPASS app selection honor requestor scoping with all-channels fallback", () => {
  const popupSource = fs.readFileSync(path.join(ROOT, "popup.js"), "utf8");
  const collectScopedSource = extractFunctionSource(popupSource, "collectRequestorScopedPremiumServiceAppCandidates");
  const selectEsmSource = extractFunctionSource(popupSource, "selectPreferredEsmAppForRequestor");
  const selectTempPassSource = extractFunctionSource(popupSource, "selectPreferredResetTempPassAppForRequestor");
  const resolveDegradationSource = extractFunctionSource(popupSource, "resolveDegradationAppCandidates");
  const resolveTempPassRestSource = extractFunctionSource(popupSource, "resolveTempPassRestV2AppInfo");
  const resolveTempPassResetSource = extractFunctionSource(popupSource, "resolveTempPassResetAppInfo");
  const resolveRuntimeSource = extractFunctionSource(popupSource, "resolveProgrammerPremiumServiceRuntimeApp");

  assert.match(collectScopedSource, /appSupportsServiceProvider\(appInfo,\s*normalizedRequestorId,\s*normalizedProgrammerId\)/);
  assert.match(collectScopedSource, /const allChannels = normalizedCandidates\.filter\(\(appInfo\) => isAllChannelsApp\(appInfo\)\);/);

  assert.match(selectEsmSource, /collectRequestorScopedPremiumServiceAppCandidates\(/);
  assert.match(selectEsmSource, /selectPreferredPassVaultHydrationServiceApplication\("esm",\s*candidates,\s*normalizedProgrammerId\)/);
  assert.doesNotMatch(selectEsmSource, /void requestorId;/);

  assert.match(selectTempPassSource, /collectRequestorScopedPremiumServiceAppCandidates\(/);
  assert.match(
    selectTempPassSource,
    /selectPreferredPassVaultHydrationServiceApplication\("resetTempPass",\s*candidates,\s*normalizedProgrammerId\)/
  );
  assert.doesNotMatch(selectTempPassSource, /void requestorId;/);

  assert.match(resolveDegradationSource, /collectRequestorScopedPremiumServiceAppCandidates\(/);
  assert.match(resolveDegradationSource, /const normalizedRequestorId = String\(options\?\.requestorId \|\| state\.selectedRequestorId \|\| ""\)\.trim\(\);/);

  assert.match(
    resolveTempPassRestSource,
    /resolveProgrammerPremiumServiceRuntimeApp\("restV2",\s*normalizedProgrammerId,\s*premiumApps,\s*null,\s*\{\s*requestorId:/
  );
  assert.match(
    resolveTempPassResetSource,
    /resolveProgrammerPremiumServiceRuntimeApp\("resetTempPass",\s*normalizedProgrammerId,\s*premiumApps,\s*null,\s*\{\s*requestorId:/
  );

  assert.match(resolveRuntimeSource, /const normalizedRequestorId = String\(options\?\.requestorId \|\| state\.selectedRequestorId \|\| ""\)\.trim\(\);/);
  assert.match(resolveRuntimeSource, /selectPreferredEsmAppForRequestor\(scopedCandidates,\s*normalizedRequestorId,\s*normalizedProgrammerId\)/);
  assert.match(
    resolveRuntimeSource,
    /selectPreferredResetTempPassAppForRequestor\(scopedCandidates,\s*normalizedRequestorId,\s*normalizedProgrammerId\)/
  );
});

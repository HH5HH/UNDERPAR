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
  const bodyStart = sourceText.indexOf("{", start);
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

test("REST V2 session context keeps selected requestor authoritative over all-channels app hints", () => {
  const popupSource = fs.readFileSync(path.join(ROOT, "popup.js"), "utf8");
  const hydrateSource = extractFunctionSource(popupSource, "hydrateRestV2ContextAppInfoAndServiceProvider");
  const serviceProviderSource = extractFunctionSource(popupSource, "buildRestV2ServiceProviderCandidatesFromContext");

  assert.match(
    hydrateSource,
    /firstNonEmptyString\(\[canonicalRequestorId,\s*requestorId,\s*appScopedRequestorId\]\)/
  );
  assert.match(
    serviceProviderSource,
    /firstNonEmptyString\(\[canonicalRequestorId,\s*requestorId,\s*appScopedRequestorId\]\)/
  );

  assert.doesNotMatch(
    hydrateSource,
    /firstNonEmptyString\(\[appScopedRequestorId,\s*canonicalRequestorId,\s*requestorId\]\)/
  );
  assert.doesNotMatch(
    serviceProviderSource,
    /firstNonEmptyString\(\[appScopedRequestorId,\s*canonicalRequestorId,\s*requestorId\]\)/
  );
});

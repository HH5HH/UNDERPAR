const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

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
  const bodyStart = source.indexOf("{", start);
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

function loadCmIdCandidateHelpers(overrides = {}) {
  const source = read("popup.js");
  const names = [
    "normalizeCmConsoleKey",
    "collectCmEntityIdCandidates",
    "collectCmProgrammerIdDerivedAliases",
    "collectCmProgrammerIdCandidates",
  ];
  const script = [
    ...names.map((name) => extractFunctionSource(source, name)),
    "module.exports = { collectCmProgrammerIdCandidates };",
  ].join("\n\n");

  const context = {
    module: { exports: {} },
    exports: {},
    state: { selectedRequestorId: "" },
    getCurrentPremiumAppsSnapshot: () => null,
    resolveCanonicalRequestorIdForProgrammer: (requestorId = "") => String(requestorId || "").trim(),
    collectRestV2ServiceProviderCandidatesFromApp: () => [],
    extractEntityIdFromToken: (value = "") => String(value || "").trim(),
    uniqueSorted: (values = []) =>
      Array.from(new Set((Array.isArray(values) ? values : []).map((v) => String(v || "").trim()).filter(Boolean))).sort(),
    ...overrides,
  };

  vm.runInNewContext(script, context, { filename: path.join(ROOT, "popup.js") });
  return context.module.exports;
}

test("collectCmProgrammerIdCandidates includes REST V2 serviceProviderId hints", () => {
  const helpers = loadCmIdCandidateHelpers({
    getCurrentPremiumAppsSnapshot: () => ({
      restV2: {
        serviceProviderId: "NBADE",
      },
    }),
  });

  const candidates = helpers.collectCmProgrammerIdCandidates({ programmerId: "NBA" });
  assert.ok(candidates.includes("nbade"));
  assert.ok(candidates.includes("nba"));
});

test("collectCmProgrammerIdCandidates includes REST V2 app requestor hints", () => {
  const helpers = loadCmIdCandidateHelpers({
    getCurrentPremiumAppsSnapshot: () => ({
      restV2Apps: [{ guid: "app-1" }],
    }),
    collectRestV2ServiceProviderCandidatesFromApp: () => ["NBADE"],
  });

  const candidates = helpers.collectCmProgrammerIdCandidates({ programmerId: "NBA" });
  assert.ok(candidates.includes("nbade"));
});

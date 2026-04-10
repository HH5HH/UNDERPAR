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

function loadMatcherHelpers(overrides = {}) {
  const source = read("popup.js");
  const names = [
    "normalizeCmConsoleKey",
    "collectCmEntityIdCandidates",
    "collectCmEntityNameCandidates",
    "collectCmProgrammerIdDerivedAliases",
    "collectCmProgrammerIdCandidates",
    "collectCmProgrammerNameCandidates",
    "collectCmTenantIdKeys",
    "collectCmTenantNameKeys",
    "finalizeCmTenantMatches",
    "findCmTenantMatchesByPass",
    "findCmTenantMatchesByTwoPass",
    "collectCmProgrammerConsoleKeys",
    "collectCmTenantConsoleKeys",
    "findCmTenantMatchesForProgrammer",
  ];
  const script = [
    ...names.map((name) => extractFunctionSource(source, name)),
    "module.exports = { findCmTenantMatchesForProgrammer };",
  ].join("\n\n");

  const context = {
    module: { exports: {} },
    exports: {},
    state: { selectedRequestorId: "" },
    firstNonEmptyString: (values = []) => {
      for (const value of Array.isArray(values) ? values : []) {
        const text = String(value || "").trim();
        if (text) {
          return text;
        }
      }
      return "";
    },
    uniqueSorted: (values = []) =>
      Array.from(new Set((Array.isArray(values) ? values : []).map((v) => String(v || "").trim()).filter(Boolean))).sort(),
    getCurrentPremiumAppsSnapshot: () => null,
    resolveCanonicalRequestorIdForProgrammer: (requestorId = "") => String(requestorId || "").trim(),
    collectRestV2ServiceProviderCandidatesFromApp: () => [],
    extractEntityIdFromToken: (value = "") => String(value || "").trim(),
    ...overrides,
  };

  vm.runInNewContext(script, context, { filename: path.join(ROOT, "popup.js") });
  return context.module.exports;
}

test("findCmTenantMatchesForProgrammer uses console-key fallback for Fox -> FoxSports", () => {
  const helpers = loadMatcherHelpers();
  const tenants = [
    {
      tenantId: "FoxSports",
      tenantName: "Bally Sports",
      aliases: ["BALLYSPORTS"],
      raw: {
        consoleId: "FoxSports",
        payload: {
          name: "Bally Sports",
          ownerId: "FoxSports",
        },
      },
    },
  ];

  const matches = helpers.findCmTenantMatchesForProgrammer(
    {
      programmerId: "Fox",
      programmerName: "Fox",
      mediaCompanyName: "Fox",
    },
    tenants
  );

  assert.equal(matches.length, 1);
  assert.equal(matches[0].tenantId, "FoxSports");
  assert.equal(matches[0].matchPass, "console");
});

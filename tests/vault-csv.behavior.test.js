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

function loadDevtoolsVaultHelpers() {
  const filePath = path.join(ROOT, "up-devtools-panel.js");
  const source = fs.readFileSync(filePath, "utf8");
  const script = [
    "function firstNonEmptyString(values = []) { for (const value of Array.isArray(values) ? values : []) { const text = String(value ?? '').trim(); if (text) { return text; } } return ''; }",
    "function uniquePreserveOrder(values = []) { const seen = new Set(); const output = []; for (const value of Array.isArray(values) ? values : [values]) { const text = String(value ?? '').trim(); if (!text || seen.has(text)) { continue; } seen.add(text); output.push(text); } return output; }",
    extractFunctionSource(source, "buildEmptyVaultCredential"),
    extractFunctionSource(source, "normalizeVaultCredential"),
    extractFunctionSource(source, "normalizeVaultServiceCredentialEntries"),
    extractFunctionSource(source, "getVaultAppCredential"),
    extractFunctionSource(source, "getVaultProgrammerServiceCredential"),
    "module.exports = { normalizeVaultCredential, getVaultProgrammerServiceCredential };",
  ].join("\n\n");
  const context = {
    module: { exports: {} },
    exports: {},
    Set,
    String,
    Number,
    getVaultServiceSummary: (record = null, serviceKey = "") => record?.services?.[serviceKey] || {},
    getVaultRegisteredApplications: (record = null) => record?.registeredApplicationsByGuid || {},
  };
  vm.runInNewContext(script, context, { filename: filePath });
  return context.module.exports;
}

test("VAULT CSV export drops redundant schema and registered application guid columns", () => {
  const panelSource = read("up-devtools-panel.js");
  const skeletonSource = extractFunctionSource(panelSource, "createVaultExportRowSkeleton");
  const exportSource = extractFunctionSource(panelSource, "buildVaultExportRows");
  const importSource = extractFunctionSource(panelSource, "handleVaultImportFile");

  assert.doesNotMatch(skeletonSource, /UnderPAR Vault CSV/);
  assert.doesNotMatch(skeletonSource, /Registered Application GUID/);
  assert.match(exportSource, /const serviceKeys = \["restV2", "esm", "degradation", "resetTempPass"\]/);
  assert.match(exportSource, /getVaultProgrammerServiceCredential\(record, serviceKey\)/);
  assert.match(importSource, /const hasSchemaColumn = Object\.prototype\.hasOwnProperty\.call\(row \|\| \{\}, "UnderPAR Vault CSV"\)/);
  assert.match(importSource, /record\.serviceCredentialsByServiceKey = \{/);
});

test("guid-free pass-service rows still export the parent service credentials", () => {
  const { getVaultProgrammerServiceCredential } = loadDevtoolsVaultHelpers();

  const stagedOnlyRecord = {
    services: {
      restV2: {
        available: true,
        primaryGuid: "",
        appGuids: [],
      },
    },
    serviceCredentialsByServiceKey: {
      restV2: {
        clientId: "parent-rest-client",
        clientSecret: "parent-rest-secret",
      },
    },
  };
  const appBackedRecord = {
    services: {
      restV2: {
        available: true,
        primaryGuid: "guid-1",
        appGuids: ["guid-1"],
      },
    },
    registeredApplicationsByGuid: {
      "guid-1": {
        serviceCredentialsByServiceKey: {
          restV2: {
            clientId: "bound-rest-client",
            clientSecret: "bound-rest-secret",
          },
        },
      },
    },
  };

  assert.equal(getVaultProgrammerServiceCredential(stagedOnlyRecord, "restV2")?.clientId, "parent-rest-client");
  assert.equal(getVaultProgrammerServiceCredential(appBackedRecord, "restV2")?.clientId, "bound-rest-client");
});

test("popup runtime keeps staged parent service credentials until they bind to a live app", () => {
  const popupSource = read("popup.js");
  const normalizeRecordSource = extractFunctionSource(popupSource, "normalizeUnderparPassVaultProgrammerRecord");
  const existingHydrationSource = extractFunctionSource(popupSource, "buildPassVaultExistingHydrationServiceRecord");
  const hydrationEntriesSource = extractFunctionSource(popupSource, "buildPassVaultServiceHydrationEntries");
  const programmerRecordSource = extractFunctionSource(popupSource, "buildPassVaultProgrammerRecord");

  assert.match(normalizeRecordSource, /serviceCredentialsByServiceKey: stagedServiceCredentialsByServiceKey/);
  assert.match(existingHydrationSource, /existingRecord\?\.serviceCredentialsByServiceKey\?\.\[normalizedServiceKey\]/);
  assert.match(hydrationEntriesSource, /registeredApplication && !existingService\?\.registeredApplication && existingClient/);
  assert.match(programmerRecordSource, /bindUnderparVaultCredentialEntryToApplication\(/);
  assert.match(programmerRecordSource, /serviceCredentialsByServiceKey: remainingStagedServiceCredentialsByServiceKey/);
});

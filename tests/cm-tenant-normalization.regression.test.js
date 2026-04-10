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

function loadTenantNormalizer() {
  const source = read("popup.js");
  const functionNames = ["extractCmTenantIdFromUrl", "normalizeCmTenantRecord"];
  const script = [
    ...functionNames.map((name) => extractFunctionSource(source, name)),
    "module.exports = { extractCmTenantIdFromUrl, normalizeCmTenantRecord };",
  ].join("\n\n");

  const context = {
    module: { exports: {} },
    exports: {},
    firstNonEmptyString: (values = []) => {
      for (const value of Array.isArray(values) ? values : []) {
        const text = String(value || "").trim();
        if (text) {
          return text;
        }
      }
      return "";
    },
    uniqueSorted: (values = []) => Array.from(new Set((Array.isArray(values) ? values : []).map((v) => String(v || "").trim()).filter(Boolean))).sort(),
    collectCmUrlsFromValue: () => [],
    collectCmNameCandidates: (_item, extra = []) => Array.from(new Set((Array.isArray(extra) ? extra : []).map((v) => String(v || "").trim()).filter(Boolean))),
    URL,
  };

  vm.runInNewContext(script, context, { filename: path.join(ROOT, "popup.js") });
  return context.module.exports;
}

test("normalizeCmTenantRecord prefers owner/org identifiers over display names", () => {
  const { normalizeCmTenantRecord } = loadTenantNormalizer();
  const normalized = normalizeCmTenantRecord(
    {
      name: "Adobe",
      payload: {
        ownerId: "adobe-org",
      },
    },
    0,
    "https://config.adobeprimetime.com/core/tenants?orgId=adobe"
  );

  assert.ok(normalized);
  assert.equal(normalized.tenantId, "adobe-org");
  assert.equal(normalized.tenantName, "Adobe");
});

test("normalizeCmTenantRecord uses consoleOwnerId when tenantId is absent", () => {
  const { normalizeCmTenantRecord } = loadTenantNormalizer();
  const normalized = normalizeCmTenantRecord(
    {
      displayName: "Adobe",
      consoleOwnerId: "cm-owner-123",
    },
    0,
    "https://config.adobeprimetime.com/core/tenants?orgId=adobe"
  );

  assert.ok(normalized);
  assert.equal(normalized.tenantId, "cm-owner-123");
  assert.equal(normalized.tenantName, "Adobe");
});

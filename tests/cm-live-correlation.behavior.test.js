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

function loadFunctions(relativePath, functionNames, globals = {}) {
  const source = read(relativePath);
  const script = [
    ...functionNames.map((name) => extractFunctionSource(source, name)),
    `module.exports = { ${functionNames.join(", ")} };`,
  ].join("\n\n");
  const context = {
    module: { exports: {} },
    exports: {},
    ...globals,
  };
  vm.runInNewContext(script, context, { filename: path.join(ROOT, relativePath) });
  return context.module.exports;
}

test("REST V2 preauthz correlation records pretty-print JSON payloads", () => {
  const { cmBuildRestV2PreauthzCorrelationRecords } = loadFunctions(
    "popup.js",
    ["cmBuildRestV2PreauthzCorrelationRecords"],
    {
      cmBuildCrossReferenceRowMeta: () => ({
        MediaCompany: "FOX",
        Environment: "production",
        CmTenantScope: "fox-tenant",
        CmMatchedTenantCount: 1,
        CmMatchedTenants: "FOX Tenant",
        RestV2App: "REST V2 App",
        RestV2AppGuid: "rest-guid",
        EsmApp: "ESM App",
        EsmAppGuid: "esm-guid",
      }),
      getRestV2MvpdMeta: () => ({ id: "comcast", name: "Comcast" }),
      getRestV2MvpdPickerLabel: () => "Comcast",
      firstNonEmptyString: (values = []) => values.find((value) => String(value || "").trim()) || "",
      formatTimestampLabel: () => "3/24/2026, 10:00:00 AM",
      buildRestV2PreauthzCheckKey: () => "check-1",
      cmBuildRecordId: (kind, tenantId, entityId) => `${kind}:${tenantId}:${entityId}`,
      cmBuildCrossReferenceLabel: (requestorId, mvpd) => `${requestorId} x ${mvpd}`,
      cmColumnsFromPayload: (payload) => Object.keys((payload && payload.items && payload.items[0]) || {}),
      stringifyJsonForDisplay: (value) => {
        const normalized = String(value || "").trim();
        if (!normalized) {
          return "";
        }
        return JSON.stringify(typeof value === "string" ? JSON.parse(value) : value || {}, null, 2);
      },
    }
  );

  const records = cmBuildRestV2PreauthzCorrelationRecords({
    programmerId: "fox",
    programmerName: "FOX",
    requestorId: "FBC",
    mvpd: "comcast",
    mvpdMeta: { id: "comcast", name: "Comcast" },
    preauthorizeHistory: [
      {
        checkedAtLabel: "3/24/2026, 10:00:00 AM",
        requestorId: "FBC",
        serviceProviderId: "FBC",
        mvpd: "comcast",
        subject: "viewer-1",
        upstreamUserId: "up-1",
        sessionId: "session-1",
        status: 200,
        statusText: "OK",
        allRequestedPermitted: true,
        resourceIds: ["resource-1"],
        responsePreview: '{"allowed":true,"reason":"permit"}',
        requestBody: { resource: "resource-1" },
        responsePayload: { allowed: true, reason: "permit" },
        decisionRows: [
          {
            resourceId: "resource-1",
            decision: "Permit",
            raw: { decision: "Permit", source: "restv2" },
          },
        ],
      },
    ],
  });

  assert.equal(records.length, 1);
  assert.equal(records[0].kind, "restv2-preauthz-xref");
  assert.equal(records[0].title, "REST V2 Preauthorize");
  assert.match(records[0].subtitle, /Can I watch\? YES/);
  assert.match(records[0].payload.responsePreview, /\n  "allowed": true/);
  assert.match(records[0].payload.items[0].ResponsePayloadJson, /\n  "allowed": true/);
  assert.match(records[0].payload.items[0].DecisionRawJson, /\n  "decision": "Permit"/);
});

test("REST V2 profile correlation records pretty-print profile check previews for CM workspace tables", () => {
  const { cmBuildRestV2ProfileCorrelationRecords } = loadFunctions(
    "popup.js",
    ["cmBuildRestV2ProfileCorrelationRecords"],
    {
      cmBuildCrossReferenceRowMeta: () => ({
        MediaCompany: "FOX",
        Environment: "production",
      }),
      firstNonEmptyString: (values = []) => values.find((value) => String(value || "").trim()) || "",
      buildRestV2ProfileHarvestBucketKey: () => "harvest-1",
      cmBuildRecordId: (kind, tenantId, entityId) => `${kind}:${tenantId}:${entityId}`,
      cmBuildCrossReferenceLabel: (requestorId, mvpd) => `${requestorId} x ${mvpd}`,
      cmColumnsFromPayload: (payload) => Object.keys((payload && payload.items && payload.items[0]) || {}),
      getRestV2MvpdMeta: () => ({ id: "comcast", name: "Comcast" }),
      getRestV2MvpdPickerLabel: () => "Comcast",
      stringifyJsonForDisplay: (value) => {
        if (!String(value || "").trim()) {
          return "";
        }
        return JSON.stringify(typeof value === "string" ? JSON.parse(value) : value || {}, null, 2);
      },
    }
  );

  const records = cmBuildRestV2ProfileCorrelationRecords({
    programmerId: "fox",
    programmerName: "FOX",
    requestorId: "FBC",
    mvpd: "comcast",
    mvpdMeta: { id: "comcast", name: "Comcast" },
    mvpdLabel: "Comcast",
    profileHarvestList: [
      {
        programmerId: "fox",
        requestorId: "FBC",
        serviceProviderId: "FBC",
        mvpd: "comcast",
        mvpdName: "Comcast",
        profileCheckOutcome: "success",
        profileCount: 1,
        profileKeys: ["comcast"],
        harvestedAt: Date.UTC(2026, 2, 24, 10, 0, 0),
        profileUrl: "https://example.test/profiles",
        profile: { subject: "viewer-1" },
        profileResponsePayload: { profiles: { comcast: { subject: "viewer-1" } } },
        profileAttributes: { tier: "gold" },
        profileScalarFields: { type: "regular" },
        profileCheck: {
          ok: true,
          status: 200,
          statusText: "OK",
          profileCount: 1,
          responsePreview: '{"profiles":{"comcast":{"subject":"viewer-1"}}}',
        },
      },
    ],
  });

  assert.equal(records.length, 1);
  assert.match(records[0].payload.items[0].ProfileCheckResponsePreview, /\n  "profiles": \{/);
  assert.match(records[0].payload.items[0].ProfileResponsePayloadJson, /\n  "profiles": \{/);
});

test("CM workspace JSON cells render structured metadata instead of raw JSON dumps", () => {
  const documentStub = {
    createElement(tagName) {
      return {
        tagName,
        textContent: "",
        title: "",
        className: "",
        children: [],
        classList: {
          values: [],
          add(...values) {
            this.values.push(...values);
          },
        },
        appendChild(child) {
          this.children.push(child);
        },
      };
    },
  };
  const flattenNodeText = (node) => {
    if (!node) {
      return "";
    }
    return [node.textContent || "", ...(node.children || []).map(flattenNodeText)].join(" ").trim();
  };
  const collectClassNames = (node) => {
    if (!node) {
      return [];
    }
    return [
      String(node.className || "").trim(),
      ...((node.classList?.values || []).map((value) => String(value || "").trim())),
      ...((node.children || []).flatMap((child) => collectClassNames(child))),
    ].filter(Boolean);
  };
  const { createCell } = loadFunctions(
    "cm-workspace.js",
    ["safeJsonParse", "normalizeCmColumnName", "shouldTreatCmCellAsStructuredJson", "formatCmCellDisplayValue", "createCell"],
    {
      document: documentStub,
    }
  );

  const multilineCell = createCell('{\n  "ok": true\n}', "ResponsePayloadJson");
  assert.equal(multilineCell.title, "");
  assert.deepEqual(multilineCell.classList.values, ["cm-cell--multiline", "cm-cell--json"]);
  assert.equal(multilineCell.children[0].tagName, "div");
  assert.equal(multilineCell.children[0].className, "cm-json-view");
  assert.match(flattenNodeText(multilineCell.children[0]), /\bOK\b/);
  assert.match(flattenNodeText(multilineCell.children[0]), /\bTrue\b/);
  assert.doesNotMatch(flattenNodeText(multilineCell.children[0]), /"ok"/);
  assert.doesNotMatch(flattenNodeText(multilineCell.children[0]), /\{/);

  const singleLineJsonPreviewCell = createCell('{"profiles":{"comcast":{"subject":"viewer-1"}}}', "ProfileCheckResponsePreview");
  assert.equal(singleLineJsonPreviewCell.title, "");
  assert.deepEqual(singleLineJsonPreviewCell.classList.values, ["cm-cell--multiline", "cm-cell--json"]);
  assert.equal(singleLineJsonPreviewCell.children[0].className, "cm-json-view");
  assert.match(flattenNodeText(singleLineJsonPreviewCell.children[0]), /\bProfiles\b/);
  assert.match(flattenNodeText(singleLineJsonPreviewCell.children[0]), /\bComcast\b/);
  assert.match(flattenNodeText(singleLineJsonPreviewCell.children[0]), /\bSubject\b/);
  assert.match(flattenNodeText(singleLineJsonPreviewCell.children[0]), /\bviewer-1\b/);

  const nestedProfileCell = createCell(
    '{"profiles":{"Comcast_SSO":{"notBefore":1774463394000,"upstreamUserID":{"value":"8cd6f500de33772d726f54ad18fad8f1a36968be","state":"plain"}}}}',
    "ProfileCheckResponsePreview"
  );
  const nestedClassNames = collectClassNames(nestedProfileCell.children[0]);
  assert.match(flattenNodeText(nestedProfileCell.children[0]), /2026-/);
  assert.match(flattenNodeText(nestedProfileCell.children[0]), /State: plain/);
  assert.ok(
    nestedClassNames.some((className) => className.includes("cm-json-scalar--timestamp")),
    "expected timestamp fields to render with timestamp styling"
  );
  assert.ok(
    nestedClassNames.some((className) => className.includes("cm-json-scalar--block")),
    "expected long scalar values to render as block rows instead of chips"
  );

  const rawFallbackCell = createCell("{not-json}", "ResponsePayloadJson");
  assert.equal(rawFallbackCell.title, "");
  assert.deepEqual(rawFallbackCell.classList.values, ["cm-cell--multiline", "cm-cell--json"]);
  assert.equal(rawFallbackCell.children[0].tagName, "pre");
  assert.equal(rawFallbackCell.children[0].className, "cm-cell-json cm-cell-json--raw");
  assert.equal(rawFallbackCell.children[0].textContent, "{not-json}");

  const singleLineCell = createCell("plain");
  assert.equal(singleLineCell.title, "plain");
  assert.deepEqual(singleLineCell.classList.values, []);
});

test("CM workspace scalar styles keep JSON values readable instead of collapsing to one-character columns", () => {
  const source = read("cm-workspace.css");

  assert.match(source, /\.cm-json-scalar,\s*\.cm-json-chip\s*\{[\s\S]*?align-self:\s*flex-start;/i);
  assert.match(source, /\.cm-json-scalar,\s*\.cm-json-chip\s*\{[\s\S]*?width:\s*auto;/i);
  assert.match(source, /\.cm-json-scalar,\s*\.cm-json-chip\s*\{[\s\S]*?overflow-wrap:\s*break-word;/i);
  assert.doesNotMatch(source, /\.cm-json-scalar,\s*\.cm-json-chip\s*\{[^}]*width:\s*fit-content;/i);
  assert.doesNotMatch(source, /\.cm-json-scalar,\s*\.cm-json-chip\s*\{[^}]*overflow-wrap:\s*anywhere;/i);
});

test("workspace dataset exposes the CM V2 live API group", () => {
  const popupSource = read("popup.js");

  assert.match(popupSource, /const cmV2OperationRecords = cmBuildCmV2OperationRecords\(programmer, credentialHints\);/);
  assert.match(popupSource, /label: "CM V2 Live APIs"/);
  assert.match(popupSource, /label: "Live Cross References"/);
  assert.doesNotMatch(popupSource, /cmBuildEsmHealthCorrelationRecords/);
  assert.doesNotMatch(popupSource, /esm-health-xref/);
});

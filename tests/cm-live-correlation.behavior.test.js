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
      stringifyJsonForDisplay: (value) => JSON.stringify(value || {}, null, 2),
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
  assert.match(records[0].payload.items[0].ResponsePayloadJson, /\n  "allowed": true/);
  assert.match(records[0].payload.items[0].DecisionRawJson, /\n  "decision": "Permit"/);
});

test("ESM health correlation record carries scoped requestor and mvpd context", () => {
  const { cmBuildEsmHealthCorrelationRecords } = loadFunctions("popup.js", ["cmBuildEsmHealthCorrelationRecords"], {
    buildEsmHealthReportPath: () => "year/month/day/requestor-id/proxy/mvpd/platform.json",
    buildEsmHealthDashboardQueryContext: (context = {}) => ({
      ...context,
      start: "2026-03-23",
      end: "2026-03-24",
    }),
    buildEsmHealthRequestUrl: (reportPath, queryContext, options = {}) =>
      `https://example.test/${reportPath}?requestor-id=${encodeURIComponent(queryContext.baseRequestorIds[0] || "")}&mvpd=${encodeURIComponent(
        queryContext.baseMvpdIds[0] || ""
      )}&limit=${encodeURIComponent(String(options.limit || ""))}`,
    cloneJsonLikeValue: (value) => JSON.parse(JSON.stringify(value)),
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
    cmBuildRecordId: (kind, tenantId, entityId) => `${kind}:${tenantId}:${entityId}`,
    cmBuildCrossReferenceLabel: (requestorId, mvpd) => `${requestorId} x ${mvpd}`,
    cmColumnsFromPayload: (payload) => Object.keys((payload && payload.items && payload.items[0]) || {}),
    ESM_HEALTH_BREAKDOWN_LIMIT: 500,
  });

  const records = cmBuildEsmHealthCorrelationRecords({
    programmerId: "fox",
    programmerName: "FOX",
    requestorId: "FBC",
    mvpd: "comcast",
    mvpdMeta: { id: "comcast", name: "Comcast" },
    mvpdLabel: "Comcast",
    esmApp: { guid: "esm-guid", appName: "ESM App" },
  });

  assert.equal(records.length, 1);
  assert.equal(records[0].kind, "esm-health-xref");
  assert.equal(records[0].title, "ESM Health Scope");
  assert.match(records[0].requestUrl, /requestor-id=FBC/);
  assert.match(records[0].requestUrl, /mvpd=comcast/);
  assert.equal(records[0].payload.items[0].RequestorId, "FBC");
  assert.equal(records[0].payload.items[0].MvpdLabel, "Comcast");
});

test("CM workspace multiline cells preserve formatted JSON blocks", () => {
  const documentStub = {
    createElement(tagName) {
      return {
        tagName,
        textContent: "",
        title: "",
        classList: {
          values: [],
          add(value) {
            this.values.push(value);
          },
        },
      };
    },
  };
  const { createCell } = loadFunctions("cm-workspace.js", ["createCell"], {
    document: documentStub,
  });

  const multilineCell = createCell('{\n  "ok": true\n}');
  assert.equal(multilineCell.textContent, '{\n  "ok": true\n}');
  assert.equal(multilineCell.title, "");
  assert.deepEqual(multilineCell.classList.values, ["cm-cell--multiline"]);

  const singleLineCell = createCell("plain");
  assert.equal(singleLineCell.title, "plain");
  assert.deepEqual(singleLineCell.classList.values, []);
});

test("workspace dataset exposes the CM V2 live API group", () => {
  const popupSource = read("popup.js");

  assert.match(popupSource, /const cmV2OperationRecords = cmBuildCmV2OperationRecords\(programmer, credentialHints\);/);
  assert.match(popupSource, /label: "CM V2 Live APIs"/);
  assert.match(popupSource, /label: "Live Cross References"/);
});

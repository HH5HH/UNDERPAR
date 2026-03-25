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

function normalizeRealmObject(value) {
  return value && typeof value === "object" ? JSON.parse(JSON.stringify(value)) : value;
}

function firstNonEmptyString(values = []) {
  for (const value of Array.isArray(values) ? values : []) {
    const normalized = String(value ?? "").trim();
    if (normalized) {
      return normalized;
    }
  }
  return "";
}

function uniqueSorted(values = []) {
  return Array.from(
    new Set(
      (Array.isArray(values) ? values : [values])
        .map((value) => String(value ?? "").trim())
        .filter(Boolean)
    )
  ).sort((left, right) => left.localeCompare(right, undefined, { sensitivity: "base" }));
}

function uniquePreserveOrder(values = []) {
  const output = [];
  (Array.isArray(values) ? values : [values]).forEach((value) => {
    const normalized = String(value ?? "").trim();
    if (normalized && !output.includes(normalized)) {
      output.push(normalized);
    }
  });
  return output;
}

function cloneJsonLikeValue(value, fallback = null) {
  if (value == null) {
    return fallback;
  }
  return JSON.parse(JSON.stringify(value));
}

function loadPopupFunctions(functionNames, globals = {}) {
  const filePath = path.join(ROOT, "popup.js");
  const source = fs.readFileSync(filePath, "utf8");
  const script = [
    ...functionNames.map((name) => extractFunctionSource(source, name)),
    `module.exports = { ${functionNames.join(", ")} };`,
  ].join("\n\n");
  const context = {
    module: { exports: {} },
    exports: {},
    Map,
    URL,
    ...globals,
  };
  vm.runInNewContext(script, context, { filename: filePath });
  return context.module.exports;
}

function loadWorkspaceDecodeFunctions(functionNames) {
  const filePath = path.join(ROOT, "registered-application-health-workspace.js");
  const source = fs.readFileSync(filePath, "utf8");
  const script = [
    "const state = { jwtDecodeCache: new Map() };",
    extractFunctionSource(source, "firstNonEmptyString"),
    extractFunctionSource(source, "uniqueStringArray"),
    extractFunctionSource(source, "tryParseJson"),
    extractFunctionSource(source, "isPlainObject"),
    extractFunctionSource(source, "normalizeJwtTimestamp"),
    extractFunctionSource(source, "decodeBase64UrlText"),
    extractFunctionSource(source, "isProbablyJwt"),
    extractFunctionSource(source, "extractJwtCandidateFromValue"),
    extractFunctionSource(source, "extractJwtCandidateFromText"),
    extractFunctionSource(source, "decodeJwtSection"),
    extractFunctionSource(source, "collectJwtScopeValues"),
    extractFunctionSource(source, "buildJwtInspectionSummary"),
    extractFunctionSource(source, "decodeJwtToken"),
    `module.exports = { ${functionNames.join(", ")} };`,
  ].join("\n\n");
  const context = {
    module: { exports: {} },
    exports: {},
    Map,
    Set,
    JSON,
    Date,
    Buffer,
    atob: (value) => Buffer.from(String(value || ""), "base64").toString("binary"),
    escape: global.escape,
  };
  vm.runInNewContext(script, context, { filename: filePath });
  return context.module.exports;
}

function loadWorkspaceControllerFunctions(initialState = {}) {
  const filePath = path.join(ROOT, "registered-application-health-workspace.js");
  const source = fs.readFileSync(filePath, "utf8");
  const calls = [];
  const script = [
    `
      const state = Object.assign(
        {
          controllerOnline: false,
          registeredApplicationHealthReady: false,
          programmerId: "",
          programmerName: "",
          requestorId: "",
          environmentKey: "",
          environmentLabel: "",
          selectionKey: "",
          loading: false,
          report: null,
          jwtDecodeCache: new Map()
        },
        initialState
      );
    `,
    extractFunctionSource(source, "firstNonEmptyString"),
    extractFunctionSource(source, "canRunCurrentContextReport"),
    extractFunctionSource(source, "getReportSelectionKey"),
    extractFunctionSource(source, "applyControllerState"),
    "module.exports = { state, applyControllerState };",
  ].join("\n\n");
  const context = {
    module: { exports: {} },
    exports: {},
    Map,
    initialState,
    closeJwtInspector: () => calls.push("close"),
    updateControllerBanner: () => calls.push("update"),
    renderReport: () => calls.push("render"),
    runCurrentContextReport: (options = {}) => calls.push({ type: "run", options }),
  };
  vm.runInNewContext(script, context, { filename: filePath });
  return { ...context.module.exports, calls };
}

function encodeJwtSegment(value) {
  return Buffer.from(JSON.stringify(value), "utf8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

test("registered application health query context tracks env, media company, and requestor scope", () => {
  const helpers = loadPopupFunctions(
    ["buildRegisteredApplicationHealthWorkspaceSelectionKey", "buildRegisteredApplicationHealthQueryContext"],
    {
      state: { selectedRequestorId: "MML" },
      DEFAULT_ADOBEPASS_ENVIRONMENT: { key: "release-production" },
      getActiveAdobePassEnvironment: () => ({ key: "release-staging", label: "Staging" }),
      resolveSelectedProgrammer: () => ({ programmerId: "Turner", programmerName: "Turner" }),
      firstNonEmptyString,
    }
  );

  const context = normalizeRealmObject(helpers.buildRegisteredApplicationHealthQueryContext({}));

  assert.deepEqual(context, {
    programmerId: "Turner",
    programmerName: "Turner",
    mediaCompany: "Turner",
    requestorId: "MML",
    environmentKey: "release-staging",
    environmentLabel: "Staging",
    requestSource: "registered-application-health-dashboard",
    selectionKey: "release-staging|Turner",
    controllerSelectionKey: "release-staging|Turner",
  });
});

test("registered application health records surface decoded software statements and requestor matches", () => {
  const helpers = loadPopupFunctions(["buildRegisteredApplicationHealthAppRecord"], {
    normalizeRegisteredApplicationRuntimeRecord: (value) => value,
    firstNonEmptyString,
    extractSoftwareStatementFromAppData: (appData = {}) => String(appData.softwareStatement || "").trim(),
    sanitizePassVaultHintList: (...values) =>
      uniquePreserveOrder(values.flatMap((value) => (Array.isArray(value) ? value : [value]))),
    sanitizePassVaultHintValue: (...values) => firstNonEmptyString(values),
    collectPassVaultServiceProviderHintsFromAppData: () => [],
    extractPassVaultPrimaryRequestorHintFromAppData: () => "",
    uniqueSorted,
    getScopesFromApplication: (value = {}) => (Array.isArray(value.scopes) ? value.scopes : []),
    buildRegisteredApplicationScopeLabels: (scopes = []) =>
      uniqueSorted(scopes).map((scope) => String(scope || "").trim().toUpperCase()),
    parseJwtPayload: (token = "") => (String(token).startsWith("header.") ? { iss: "adobe-pass" } : null),
  });

  const record = normalizeRealmObject(
    helpers.buildRegisteredApplicationHealthAppRecord(
      {
        guid: "app-guid",
        name: "Turner REST V2",
        requestor: "MML",
        serviceProviders: ["MML", "NBADE"],
        scopes: ["restv2", "esm"],
        appData: {
          clientId: "client-123",
          type: "service",
          softwareStatement: "header.payload.signature",
        },
      },
      { requestorId: "MML" }
    )
  );

  assert.equal(record.guid, "app-guid");
  assert.equal(record.name, "Turner REST V2");
  assert.equal(record.clientId, "client-123");
  assert.deepEqual(record.serviceProviderHints, ["MML", "NBADE"]);
  assert.deepEqual(record.scopeLabels, ["ESM", "RESTV2"]);
  assert.equal(record.softwareStatementPresent, true);
  assert.equal(record.jwtDecoded, true);
  assert.equal(record.jwtState, "decoded");
  assert.equal(record.selectedRequestorMatch, true);
});

test("registered application health report payload prioritizes selected requestor matches and warnings", () => {
  const helpers = loadPopupFunctions(
    ["buildRegisteredApplicationHealthAppRecord", "buildRegisteredApplicationHealthReportPayload"],
    {
      normalizeRegisteredApplicationRuntimeRecord: (value) => value,
      firstNonEmptyString,
      extractSoftwareStatementFromAppData: (appData = {}) => String(appData.softwareStatement || "").trim(),
      sanitizePassVaultHintList: (...values) =>
        uniquePreserveOrder(values.flatMap((value) => (Array.isArray(value) ? value : [value]))),
      sanitizePassVaultHintValue: (...values) => firstNonEmptyString(values),
      collectPassVaultServiceProviderHintsFromAppData: () => [],
      extractPassVaultPrimaryRequestorHintFromAppData: () => "",
      uniqueSorted,
      uniquePreserveOrder,
      getScopesFromApplication: (value = {}) => (Array.isArray(value.scopes) ? value.scopes : []),
      buildRegisteredApplicationScopeLabels: (scopes = []) => uniqueSorted(scopes),
      parseJwtPayload: (token = "") => (String(token).startsWith("valid.") ? { iss: "adobe-pass" } : null),
      cloneJsonLikeValue,
    }
  );

  const report = normalizeRealmObject(
    helpers.buildRegisteredApplicationHealthReportPayload(
      {
        selectionKey: "release-production|Turner",
        requestorId: "MML",
      },
      [
        {
          guid: "secondary-app",
          name: "Secondary",
          serviceProviders: ["NBADE"],
          appData: { softwareStatement: "valid.payload.signature" },
        },
        {
          guid: "primary-app",
          name: "Primary",
          requestor: "MML",
          appData: { softwareStatement: "valid.payload.signature" },
        },
      ],
      {
        hydrationErrorsByGuid: {
          "secondary-app": "details endpoint timed out",
        },
      }
    )
  );

  assert.equal(report.ok, true);
  assert.equal(report.partial, true);
  assert.equal(report.totalApplications, 2);
  assert.equal(report.applications[0].guid, "primary-app");
  assert.equal(report.applications[0].selectedRequestorMatch, true);
  assert.deepEqual(report.warnings, ["secondary-app: details endpoint timed out"]);
});

test("registered application workspace decodes JWT payloads locally and extracts bearer tokens from raw input", () => {
  const helpers = loadWorkspaceDecodeFunctions(["extractJwtCandidateFromText", "decodeJwtToken"]);
  const token = [
    encodeJwtSegment({ alg: "RS256", typ: "JWT" }),
    encodeJwtSegment({
      iss: "adobe-pass",
      sub: "client-123",
      aud: "rest-v2",
      client_id: "client-123",
      scope: "restv2 esm",
      iat: 1700000000,
      nbf: 1700000000,
      exp: 1800000000,
    }),
    "signature",
  ].join(".");
  const extracted = helpers.extractJwtCandidateFromText(
    JSON.stringify({
      Authorization: `Bearer ${token}`,
    })
  );
  const decoded = normalizeRealmObject(helpers.decodeJwtToken(extracted));

  assert.equal(extracted, token);
  assert.equal(decoded.valid, true);
  assert.equal(decoded.summary.algorithm, "RS256");
  assert.equal(decoded.summary.issuer, "adobe-pass");
  assert.equal(decoded.summary.clientId, "client-123");
  assert.deepEqual(decoded.summary.scopes, ["restv2", "esm"]);
});

test("registered application workspace treats ENV x MediaCompany changes as a hard redraw boundary", () => {
  const { state, applyControllerState, calls } = loadWorkspaceControllerFunctions({
    registeredApplicationHealthReady: true,
    programmerId: "Turner",
    programmerName: "Turner",
    requestorId: "MML",
    environmentKey: "release-production",
    environmentLabel: "Production",
    selectionKey: "release-production|Turner",
    report: {
      selectionKey: "release-production|Turner",
      applications: [{ guid: "old-app" }],
    },
  });

  applyControllerState({
    controllerOnline: true,
    registeredApplicationHealthReady: true,
    programmerId: "FOX",
    programmerName: "FOX",
    requestorId: "FOXNOW",
    environmentKey: "release-staging",
    environmentLabel: "Staging",
    selectionKey: "release-staging|FOX",
  });

  assert.equal(state.selectionKey, "release-staging|FOX");
  assert.equal(state.report, null);
  assert.deepEqual(
    calls.map((entry) => (typeof entry === "string" ? entry : entry.type)),
    ["close", "update", "render", "run"]
  );
  assert.deepEqual(normalizeRealmObject(calls.find((entry) => entry?.type === "run")?.options), {
    statusMessage: "Refreshing Registered Application Inspector for the selected UnderPAR context...",
    preferRefresh: false,
  });
});

test("registered application workspace redraws requestor matches without refetching the catalog", () => {
  const { state, applyControllerState, calls } = loadWorkspaceControllerFunctions({
    registeredApplicationHealthReady: true,
    programmerId: "Turner",
    programmerName: "Turner",
    requestorId: "MML",
    environmentKey: "release-production",
    environmentLabel: "Production",
    selectionKey: "release-production|Turner",
    report: {
      selectionKey: "release-production|Turner",
      applications: [{ guid: "app-guid" }],
    },
  });

  applyControllerState({
    controllerOnline: true,
    registeredApplicationHealthReady: true,
    programmerId: "Turner",
    programmerName: "Turner",
    requestorId: "NBADE",
    environmentKey: "release-production",
    environmentLabel: "Production",
    selectionKey: "release-production|Turner",
  });

  assert.equal(state.requestorId, "NBADE");
  assert.equal(state.report.selectionKey, "release-production|Turner");
  assert.deepEqual(
    calls.map((entry) => (typeof entry === "string" ? entry : entry.type)),
    ["update", "render"]
  );
});

test("registered application health sources wire the HEALTH action and workspace assets", () => {
  const popupSource = read("popup.js");
  const backgroundSource = read("background.js");
  const manifestSource = read("manifest.json");
  const workspaceHtml = read("registered-application-health-workspace.html");
  const workspaceJs = read("registered-application-health-workspace.js");

  assert.match(
    popupSource,
    /data-health-action="esm"[\s\S]*data-health-action="cm"[\s\S]*data-health-action="registered-apps"[\s\S]*data-health-action="splunk"/
  );
  assert.match(popupSource, /if \(normalizedAction === "registered-apps"\)[\s\S]*runRegisteredApplicationHealthDashboardForSelection/);
  assert.match(backgroundSource, /registered-application-health-workspace\.html/);
  assert.match(manifestSource, /registered-application-health-workspace\.js/);
  assert.match(workspaceHtml, /JWT Inspector/);
  assert.match(workspaceHtml, /Paste any JWT, bearer value, or JSON body containing a JWT/);
  assert.match(workspaceJs, /Decoded locally inside UnderPAR\./);
  assert.match(workspaceJs, /const disableRerun = state\.loading \|\| !canRunCurrentContextReport\(\);/);
  assert.match(workspaceJs, /if \(controllerChanged \|\| requestorChanged \|\| shouldClearStaleReport\) \{\s*renderReport\(\);/);
  assert.match(workspaceJs, /const action = hasRenderableReport\(\) && preferRefresh \? "refresh-latest" : "run-dashboard";/);
});

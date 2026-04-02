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
    extractFunctionSource(source, "getJwtInspectorUtility"),
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
    UnderParJwtInspector: null,
    atob: (value) => Buffer.from(String(value || ""), "base64").toString("binary"),
    escape: global.escape,
  };
  vm.runInNewContext(script, context, { filename: filePath });
  return context.module.exports;
}

function loadWorkspaceRequestorFilterFunctions(initialState = {}) {
  const filePath = path.join(ROOT, "registered-application-health-workspace.js");
  const source = fs.readFileSync(filePath, "utf8");
  const script = [
    `const state = Object.assign({ requestorId: "" }, initialState);`,
    extractFunctionSource(source, "uniqueStringArray"),
    extractFunctionSource(source, "filterApplicationsForSelectedRequestor"),
    "module.exports = { state, filterApplicationsForSelectedRequestor };",
  ].join("\n\n");
  const context = {
    module: { exports: {} },
    exports: {},
    initialState,
    Set,
    String,
    Array,
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
      const REGAPP_PREMIUM_SERVICE_LABEL_BY_KEY = Object.freeze({
        restV2: "REST V2",
        esm: "ESM",
        degradation: "DEGRADATION",
        resetTempPass: "Reset TempPASS",
      });
      const REGAPP_PREMIUM_SERVICE_DISPLAY_ORDER = Object.freeze(["restV2", "esm", "degradation", "resetTempPass"]);
    `,
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
          premiumServiceBindings: [],
          pendingPremiumServiceSwitch: null,
          jwtDecodeCache: new Map(),
          hydratingGuids: new Set(),
          switchingServiceKeys: new Set(),
          backgroundHydrationActive: false,
          backgroundHydrationSelectionKey: ""
        },
        initialState
      );
    `,
    extractFunctionSource(source, "firstNonEmptyString"),
    extractFunctionSource(source, "normalizePremiumServiceBindings"),
    extractFunctionSource(source, "buildPremiumServiceBindingSignature"),
    extractFunctionSource(source, "canRunCurrentContextReport"),
    extractFunctionSource(source, "getReportSelectionKey"),
    extractFunctionSource(source, "getExpandedGuidStore"),
    "function getPendingPremiumServiceSwitch() { return null; }",
    extractFunctionSource(source, "applyControllerState"),
    "module.exports = { state, applyControllerState };",
  ].join("\n\n");
  const context = {
    module: { exports: {} },
    exports: {},
    Map,
    Set,
    initialState,
    closeJwtInspector: () => calls.push("close"),
    setBackgroundHydrationState: () => calls.push("background"),
    updateControllerBanner: () => calls.push("update"),
    renderReport: () => calls.push("render"),
    runCurrentContextReport: (options = {}) => calls.push({ type: "run", options }),
  };
  vm.runInNewContext(script, context, { filename: filePath });
  return { ...context.module.exports, calls };
}

function loadWorkspaceSummaryRenderFunctions() {
  const filePath = path.join(ROOT, "registered-application-health-workspace.js");
  const source = fs.readFileSync(filePath, "utf8");
  const script = [
    extractFunctionSource(source, "escapeHtml"),
    extractFunctionSource(source, "firstNonEmptyString"),
    extractFunctionSource(source, "uniqueStringArray"),
    extractFunctionSource(source, "normalizeServicePillToneKey"),
    extractFunctionSource(source, "buildServicePillMarkup"),
    extractFunctionSource(source, "renderServicePillList"),
    extractFunctionSource(source, "buildRequestorSummary"),
    extractFunctionSource(source, "buildApplicationSummaryMeta"),
    extractFunctionSource(source, "renderApplicationSummaryFacts"),
    "module.exports = { normalizeServicePillToneKey, buildApplicationSummaryMeta, renderApplicationSummaryFacts };",
  ].join("\n\n");
  const context = {
    module: { exports: {} },
    exports: {},
    Set,
    String,
    Array,
  };
  vm.runInNewContext(script, context, { filename: filePath });
  return context.module.exports;
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

test("registered application download filenames honor the Adobe console content-disposition contract", () => {
  const helpers = loadPopupFunctions(["extractDownloadFilenameFromContentDisposition"], {});

  assert.equal(
    helpers.extractDownloadFilenameFromContentDisposition('attachment; filename="MML_RESTv2_software_statement.jwt"'),
    "MML_RESTv2_software_statement.jwt"
  );
  assert.equal(
    helpers.extractDownloadFilenameFromContentDisposition(
      "attachment; filename*=UTF-8''Turner%20REST%20V2%20Software%20Statement.jwt"
    ),
    "Turner REST V2 Software Statement.jwt"
  );
});

test("software statement extraction only trusts explicit software-statement fields", () => {
  const helpers = loadPopupFunctions(["isProbablyJwt", "extractSoftwareStatementFromAppData"], {});
  const goodStatement = `${encodeJwtSegment({ alg: "RS256" })}.${encodeJwtSegment({
    iss: "auth.adobe.com",
    software: true,
  })}.sig`;
  const unrelatedJwt = `${encodeJwtSegment({ alg: "RS256" })}.${encodeJwtSegment({
    iss: "auth.adobe.com",
    token_use: "access",
  })}.sig`;

  assert.equal(
    helpers.extractSoftwareStatementFromAppData({
      softwareStatement: goodStatement,
      nested: {
        jwt: unrelatedJwt,
      },
    }),
    goodStatement
  );
  assert.equal(
    helpers.extractSoftwareStatementFromAppData({
      nested: {
        jwt: unrelatedJwt,
      },
      authorization: {
        bearer: unrelatedJwt,
      },
    }),
    ""
  );
});

test("software statement text extraction ignores arbitrary JWTs embedded inside JSON", () => {
  const helpers = loadPopupFunctions(
    ["isProbablyJwt", "extractSoftwareStatementFromAppData", "extractSoftwareStatementFromText"],
    {}
  );
  const goodStatement = `${encodeJwtSegment({ alg: "RS256" })}.${encodeJwtSegment({
    iss: "auth.adobe.com",
    software: true,
  })}.sig`;
  const unrelatedJwt = `${encodeJwtSegment({ alg: "RS256" })}.${encodeJwtSegment({
    iss: "auth.adobe.com",
    token_use: "access",
  })}.sig`;

  assert.equal(helpers.extractSoftwareStatementFromText(goodStatement), goodStatement);
  assert.equal(
    helpers.extractSoftwareStatementFromText(
      JSON.stringify({
        softwareStatement: goodStatement,
        accessToken: unrelatedJwt,
      })
    ),
    goodStatement
  );
  assert.equal(
    helpers.extractSoftwareStatementFromText(
      JSON.stringify({
        accessToken: unrelatedJwt,
        nested: {
          jwt: unrelatedJwt,
        },
      })
    ),
    ""
  );
});

test("registered application health records surface decoded software statements and requestor matches", () => {
  const helpers = loadPopupFunctions(["normalizeRegisteredApplicationRequestorHintToken", "buildRegisteredApplicationHealthAppRecord"], {
    normalizeRegisteredApplicationRuntimeRecord: (value) => value,
    extractEntityIdFromToken: (value = "") => {
      const normalized = String(value || "").trim();
      const match = normalized.match(/^@[^:]+:(.+)$/i);
      return match ? String(match[1] || "").trim() : normalized;
    },
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

test("registered application health matches selected requestor ids against raw @ServiceProvider requestor hints", () => {
  const helpers = loadPopupFunctions(
    ["normalizeRegisteredApplicationRequestorHintToken", "buildRegisteredApplicationHealthAppRecord"],
    {
      normalizeRegisteredApplicationRuntimeRecord: (value) => value,
      extractEntityIdFromToken: (value = "") => {
        const normalized = String(value || "").trim();
        const match = normalized.match(/^@[^:]+:(.+)$/i);
        return match ? String(match[1] || "").trim() : normalized;
      },
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
    }
  );

  assert.equal(
    helpers.normalizeRegisteredApplicationRequestorHintToken("@ServiceProvider:AdultSwim"),
    "adultswim"
  );

  const record = normalizeRealmObject(
    helpers.buildRegisteredApplicationHealthAppRecord(
      {
        guid: "adultswim-app",
        name: "Adult Swim REST V2",
        requestor: "@ServiceProvider:AdultSwim",
        serviceProviders: ["@ServiceProvider:AdultSwim"],
        appData: {
          softwareStatement: "header.payload.signature",
        },
      },
      { requestorId: "AdultSwim" }
    )
  );

  assert.equal(record.requestorHint, "@ServiceProvider:AdultSwim");
  assert.equal(record.selectedRequestorMatch, true);
});

test("registered application health report payload prioritizes selected requestor matches and warnings", () => {
  const helpers = loadPopupFunctions(
    [
      "normalizeRegisteredApplicationRequestorHintToken",
      "buildRegisteredApplicationHealthAppRecord",
      "buildRegisteredApplicationHealthReportPayload",
    ],
    {
      normalizeRegisteredApplicationRuntimeRecord: (value) => value,
      extractEntityIdFromToken: (value = "") => {
        const normalized = String(value || "").trim();
        const match = normalized.match(/^@[^:]+:(.+)$/i);
        return match ? String(match[1] || "").trim() : normalized;
      },
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

test("registered application health premium service bindings follow the hydrated runtime primary app and exclude CM", () => {
  const services = {
    restV2: { guid: "rest-shared", appName: "REST Shared", scopes: ["api:client:v2"], requestors: ["NBADE"] },
    restV2Apps: [
      { guid: "rest-shared", appName: "REST Shared", scopes: ["api:client:v2"], requestors: ["NBADE"] },
      { guid: "rest-mml", appName: "REST MML", scopes: ["api:client:v2"], requestors: ["MML"] },
    ],
    esm: { guid: "esm-shared", appName: "ESM Shared", scopes: ["analytics:client"], requestors: [] },
    esmApps: [
      { guid: "esm-mml", appName: "ESM MML", scopes: ["analytics:client"], requestors: ["MML"] },
      { guid: "esm-shared", appName: "ESM Shared", scopes: ["analytics:client"], requestors: [] },
    ],
    degradation: { guid: "deg-mml", appName: "DGR MML", scopes: ["decisions:owner"], requestors: ["MML"] },
    degradationApps: [
      { guid: "deg-mml", appName: "DGR MML", scopes: ["decisions:owner"], requestors: ["MML"] },
    ],
    resetTempPass: {
      guid: "temp-shared",
      appName: "TempPASS Shared",
      scopes: ["temporary:passes:owner"],
      requestors: [],
    },
    resetTempPassApps: [
      { guid: "temp-mml", appName: "TempPASS MML", scopes: ["temporary:passes:owner"], requestors: ["MML"] },
      { guid: "temp-shared", appName: "TempPASS Shared", scopes: ["temporary:passes:owner"], requestors: [] },
    ],
    cm: { matchedTenants: [{ tenantId: "tenant-1" }] },
  };
  const applications = [
    services.restV2,
    ...services.restV2Apps,
    services.esm,
    ...services.esmApps,
    services.degradation,
    ...services.degradationApps,
    services.resetTempPass,
    ...services.resetTempPassApps,
  ];
  const helpers = loadPopupFunctions(
    [
      "getRegisteredApplicationHealthPremiumServiceLabel",
      "orderRegisteredApplicationHealthServiceCandidates",
      "buildRegisteredApplicationHealthServiceCandidates",
      "buildRegisteredApplicationHealthPremiumServiceBindings",
    ],
    {
      UNDERPAR_VAULT_DCR_SERVICE_DEFINITIONS: [
        { serviceKey: "restV2", label: "REST V2", requiredScope: "api:client:v2" },
        { serviceKey: "esm", label: "ESM", requiredScope: "analytics:client" },
        { serviceKey: "degradation", label: "DEGRADATION", requiredScope: "decisions:owner" },
        { serviceKey: "resetTempPass", label: "TempPASS", requiredScope: "temporary:passes:owner" },
      ],
      firstNonEmptyString,
      mergeUniquePremiumServiceAppInfos: (...collections) => {
        const merged = [];
        const seen = new Set();
        collections.flat().forEach((entry) => {
          if (!entry || typeof entry !== "object") {
            return;
          }
          const guid = String(entry.guid || "").trim();
          if (!guid || seen.has(guid)) {
            return;
          }
          seen.add(guid);
          merged.push(entry);
        });
        return merged;
      },
      getPassVaultRequiredScopeForService: (serviceKey = "") =>
        ({
          restV2: "api:client:v2",
          esm: "analytics:client",
          degradation: "decisions:owner",
          resetTempPass: "temporary:passes:owner",
        })[String(serviceKey || "").trim()] || "",
      registeredApplicationMatchesNativeRequiredScope: (app = null, requiredScope = "") =>
        (Array.isArray(app?.scopes) ? app.scopes : []).includes(String(requiredScope || "").trim()),
      collectRestV2AppCandidatesFromPremiumApps: (premiumApps = null) => premiumApps?.restV2Apps || [],
      collectEsmAppCandidatesFromPremiumApps: (premiumApps = null) => premiumApps?.esmApps || [],
      collectResetTempPassAppCandidatesFromPremiumApps: (premiumApps = null) => premiumApps?.resetTempPassApps || [],
      resolveDegradationAppCandidates: (programmerId = "", seedAppInfo = null, options = {}) => {
        const requestorId = String(options?.requestorId || "").trim();
        const candidates = services.degradationApps.slice();
        if (seedAppInfo?.guid && !candidates.some((entry) => entry.guid === seedAppInfo.guid)) {
          candidates.unshift(seedAppInfo);
        }
        return candidates.sort((left, right) => {
          const leftMatch = Number((left.requestors || []).includes(requestorId));
          const rightMatch = Number((right.requestors || []).includes(requestorId));
          return rightMatch - leftMatch;
        });
      },
      selectPreferredRestV2AppForRequestor: (apps = [], requestorId = "") =>
        apps.find((entry) => (entry.requestors || []).includes(String(requestorId || "").trim())) || apps[0] || null,
      selectPreferredEsmAppForRequestor: (apps = [], requestorId = "") =>
        apps.find((entry) => (entry.requestors || []).includes(String(requestorId || "").trim())) || apps[0] || null,
      selectPreferredResetTempPassAppForRequestor: (apps = [], requestorId = "") =>
        apps.find((entry) => (entry.requestors || []).includes(String(requestorId || "").trim())) || apps[0] || null,
      getRuntimePremiumServicesSeed: () => services,
      getCurrentPremiumAppsSnapshot: () => services,
      buildPassVaultHydrationRegisteredApplications: () => applications,
      getCurrentProgrammerApplicationsSnapshot: () => ({ unused: true }),
      resolveProgrammerPremiumServiceRuntimeApp: (serviceKey = "") =>
        ({
          restV2: services.restV2,
          esm: services.esm,
          resetTempPass: services.resetTempPass,
        })[String(serviceKey || "").trim()] || null,
      appSupportsServiceProvider: (appInfo = null, requestorId = "") =>
        (Array.isArray(appInfo?.requestors) ? appInfo.requestors : []).includes(String(requestorId || "").trim()),
    }
  );

  const bindings = normalizeRealmObject(
    helpers.buildRegisteredApplicationHealthPremiumServiceBindings(
      { programmerId: "Turner" },
      { programmerId: "Turner", requestorId: "MML" },
      services,
      applications
    )
  );

  assert.deepEqual(
    bindings.map((binding) => ({ serviceKey: binding.serviceKey, appGuid: binding.appGuid, label: binding.label })),
    [
      { serviceKey: "restV2", appGuid: "rest-shared", label: "REST V2" },
      { serviceKey: "esm", appGuid: "esm-shared", label: "ESM" },
      { serviceKey: "degradation", appGuid: "deg-mml", label: "DEGRADATION" },
      { serviceKey: "resetTempPass", appGuid: "temp-shared", label: "Reset TempPASS" },
    ]
  );
});

test("REST V2 requestor selection now follows the first programmer-scoped REST V2 candidate", () => {
  const helpers = loadPopupFunctions(["selectPreferredRestV2AppForRequestor"], {
    pickHighestRankedPassVaultServiceCandidate: () => {
      throw new Error("should not rank REST V2 candidates");
    },
  });

  const selected = normalizeRealmObject(
    helpers.selectPreferredRestV2AppForRequestor(
      [
        { guid: "animalplanet-app", appName: "Animal Planet Scoped" },
        { guid: "shared-app", appName: "Discovery Shared" },
      ],
      "animalplanet",
      "Discovery"
    )
  );

  assert.equal(selected?.guid, "animalplanet-app");
});

test("runtime REST V2 app resolution follows the first programmer-scoped REST V2 candidate", () => {
  const services = {
    restV2: { guid: "rest-shared", appName: "REST Shared" },
    restV2Apps: [
      { guid: "rest-shared", appName: "REST Shared" },
      { guid: "rest-mml", appName: "REST MML" },
    ],
    esm: { guid: "esm-shared", appName: "ESM Shared" },
    esmApps: [
      { guid: "esm-shared", appName: "ESM Shared" },
      { guid: "esm-mml", appName: "ESM MML" },
    ],
    resetTempPass: { guid: "temp-shared", appName: "TempPASS Shared" },
    resetTempPassApps: [
      { guid: "temp-shared", appName: "TempPASS Shared" },
      { guid: "temp-mml", appName: "TempPASS MML" },
    ],
  };
  const helpers = loadPopupFunctions(["resolveProgrammerPremiumServiceRuntimeApp"], {
    getCurrentPremiumAppsSnapshot: () => services,
    getRuntimePremiumServicesSeed: () => services,
    collectProgrammerScopedRestV2AppCandidates: (_programmerId = "", premiumApps = null) => premiumApps?.restV2Apps || [],
    collectEsmAppCandidatesFromPremiumApps: (premiumApps = null) => premiumApps?.esmApps || [],
    collectResetTempPassAppCandidatesFromPremiumApps: (premiumApps = null) => premiumApps?.resetTempPassApps || [],
    selectPreferredPassVaultHydrationServiceApplication: (_serviceKey = "", apps = []) => apps[0] || null,
    selectPreferredRestV2AppForRequestor: () => services.restV2Apps[0],
    selectPreferredEsmAppForRequestor: () => services.esmApps[1],
    selectPreferredResetTempPassAppForRequestor: () => services.resetTempPassApps[1],
  });

  assert.equal(
    normalizeRealmObject(helpers.resolveProgrammerPremiumServiceRuntimeApp("restV2", "Turner", services))?.guid,
    "rest-shared"
  );
  assert.equal(
    normalizeRealmObject(helpers.resolveProgrammerPremiumServiceRuntimeApp("esm", "Turner", services))?.guid,
    "esm-shared"
  );
  assert.equal(
    normalizeRealmObject(helpers.resolveProgrammerPremiumServiceRuntimeApp("resetTempPass", "Turner", services))?.guid,
    "temp-shared"
  );
});

test("programmer-scoped REST V2 candidates are rebuilt from the full registered-application catalog", () => {
  const helpers = loadPopupFunctions(["collectProgrammerScopedRestV2AppCandidates"], {
    collectRestV2AppCandidatesFromPremiumApps: (premiumApps = null) => premiumApps?.restV2Apps || [],
    getCurrentProgrammerApplicationsSnapshot: () => ({
      "shared-app": { guid: "shared-app", appName: "Shared App", scopes: ["api:client:v2"] },
      "animalplanet-app": { guid: "animalplanet-app", appName: "Animal Planet", scopes: ["api:client:v2"] },
      "esm-app": { guid: "esm-app", appName: "ESM App", scopes: ["analytics:client"] },
    }),
    buildPassVaultApplicationsSnapshotFromRegisteredApplications: (value = null) => value || {},
    getPassVaultMediaCompanyRecord: () => null,
    getPassVaultRegisteredApplicationsByGuid: () => ({}),
    buildPassVaultHydrationRegisteredApplications: (applicationsData = {}) => Object.values(applicationsData),
    registeredApplicationMatchesNativeRequiredScope: (app = null, requiredScope = "") =>
      (Array.isArray(app?.scopes) ? app.scopes : []).includes(String(requiredScope || "").trim()),
    REST_V2_SCOPE: "api:client:v2",
  });

  const candidates = helpers.collectProgrammerScopedRestV2AppCandidates("Discovery", {
    restV2Apps: [{ guid: "shared-app", appName: "Shared App", scopes: ["api:client:v2"] }],
  });

  assert.deepEqual(
    normalizeRealmObject(candidates).map((app) => app.guid),
    ["shared-app", "animalplanet-app"]
  );
});

test("premium service detection stops after the first scoped match for each premium service", () => {
  const scopeChecks = [];
  const degradationChecks = [];
  const helpers = loadPopupFunctions(["findFirstPremiumServiceApplications"], {
    registeredApplicationMatchesNativeRequiredScope: (app = null, requiredScope = "") => {
      scopeChecks.push(`${String(app?.guid || "").trim()}:${String(requiredScope || "").trim()}`);
      return (Array.isArray(app?.scopes) ? app.scopes : []).includes(String(requiredScope || "").trim());
    },
    degradationAppHasRequiredScope: (app = null) => {
      degradationChecks.push(String(app?.guid || "").trim());
      return (Array.isArray(app?.scopes) ? app.scopes : []).includes("entitlement:degradation");
    },
    REST_V2_SCOPE: "api:client:v2",
    PREMIUM_SERVICE_SCOPE_BY_KEY: {
      esm: "analytics:client",
    },
    PREMIUM_SERVICE_RESET_TEMPPASS_SCOPE: "temporary:passes:owner",
  });

  const services = normalizeRealmObject(
    helpers.findFirstPremiumServiceApplications([
      { guid: "rest-app", scopes: ["api:client:v2"] },
      { guid: "esm-app", scopes: ["analytics:client"] },
      { guid: "degradation-app", scopes: ["entitlement:degradation"] },
      { guid: "temp-app", scopes: ["temporary:passes:owner"] },
      { guid: "after-all", scopes: ["api:client:v2", "analytics:client", "entitlement:degradation", "temporary:passes:owner"] },
    ])
  );

  assert.equal(services.restV2?.guid, "rest-app");
  assert.equal(services.esm?.guid, "esm-app");
  assert.equal(services.degradation?.guid, "degradation-app");
  assert.equal(services.resetTempPass?.guid, "temp-app");
  assert.deepEqual(services.restV2Apps.map((app) => app.guid), ["rest-app"]);
  assert.deepEqual(services.esmApps.map((app) => app.guid), ["esm-app"]);
  assert.deepEqual(services.degradationApps.map((app) => app.guid), ["degradation-app"]);
  assert.deepEqual(services.resetTempPassApps.map((app) => app.guid), ["temp-app"]);
  assert.equal(scopeChecks.includes("esm-app:api:client:v2"), false);
  assert.equal(scopeChecks.includes("degradation-app:analytics:client"), false);
  assert.equal(degradationChecks.includes("temp-app"), false);
  assert.equal(scopeChecks.some((entry) => entry.startsWith("after-all:")), false);
  assert.equal(degradationChecks.includes("after-all"), false);
});

test("pass vault hydration applications preserve console fetch order for primary-service selection", () => {
  const helpers = loadPopupFunctions(["buildPassVaultHydrationRegisteredApplications"], {
    normalizeRegisteredApplicationRuntimeRecord: (value = null) => normalizeRealmObject(value),
    buildRegisteredApplicationScopeLabels: () => [],
    buildRegisteredApplicationLabel: (appName = "") => String(appName || "").trim(),
    firstNonEmptyString,
    extractSoftwareStatementFromAppData: () => "",
    normalizeScope: (value = "") => String(value || "").trim().toLowerCase(),
  });

  const applications = normalizeRealmObject(
    helpers.buildPassVaultHydrationRegisteredApplications({
      "citytv-app": {
        guid: "citytv-app",
        name: "Citytvplus V2",
        appData: {
          scopes: ["api:client:v2"],
          __underparFetchOrder: 4,
        },
      },
      "shared-app": {
        guid: "shared-app",
        name: "Discovery Shared",
        appData: {
          scopes: ["api:client:v2"],
          __underparFetchOrder: 1,
        },
      },
      "animalplanet-app": {
        guid: "animalplanet-app",
        name: "Animal Planet",
        appData: {
          scopes: ["api:client:v2"],
          __underparFetchOrder: 2,
        },
      },
    })
  );

  assert.deepEqual(
    applications.map((entry) => entry.guid),
    ["shared-app", "animalplanet-app", "citytv-app"]
  );
});

test("runtime REST V2 app resolution keeps the programmer REST V2 primary ahead of ordered catalog fallbacks", () => {
  const services = {
    restV2: { guid: "shared-app", appName: "Shared App" },
    restV2Apps: [
      { guid: "citytv-app", appName: "Citytvplus V2" },
      { guid: "shared-app", appName: "Shared App" },
    ],
  };
  const helpers = loadPopupFunctions(["resolveProgrammerPremiumServiceRuntimeApp"], {
    getCurrentPremiumAppsSnapshot: () => services,
    getRuntimePremiumServicesSeed: () => services,
    collectProgrammerScopedRestV2AppCandidates: (_programmerId = "", premiumApps = null) =>
      Array.isArray(premiumApps?.restV2Apps) ? premiumApps.restV2Apps : [],
    selectPreferredRestV2AppForRequestor: (apps = []) => apps[0] || null,
    selectPreferredPassVaultHydrationServiceApplication: (_serviceKey = "", apps = []) => apps[0] || null,
    collectEsmAppCandidatesFromPremiumApps: () => [],
    collectResetTempPassAppCandidatesFromPremiumApps: () => [],
    collectDegradationAppCandidatesFromPremiumApps: () => [],
  });

  const resolved = normalizeRealmObject(
    helpers.resolveProgrammerPremiumServiceRuntimeApp("restV2", "Rogers Media", services)
  );

  assert.equal(resolved?.guid, "shared-app");
});

test("pass vault REST V2 guid reconstruction preserves stored fetch order instead of stale primary order", () => {
  const helpers = loadPopupFunctions(
    ["getPassVaultStoredApplicationFetchOrder", "getPassVaultRegisteredApplicationsByGuid", "getPassVaultServiceAppGuidsFromRecord"],
    {
      uniquePreserveOrder,
    }
  );

  const orderedGuids = normalizeRealmObject(
    helpers.getPassVaultServiceAppGuidsFromRecord(
      {
        services: {
          restV2: {
            primaryGuid: "shared-app",
            appGuids: ["shared-app", "adultswim-app"],
          },
        },
        registeredApplicationsByGuid: {
          "shared-app": {
            guid: "shared-app",
            applicationData: {
              __underparFetchOrder: 9,
            },
            serviceKeys: ["restV2"],
          },
          "adultswim-app": {
            guid: "adultswim-app",
            applicationData: {
              __underparFetchOrder: 1,
            },
            serviceKeys: ["restV2"],
          },
        },
      },
      "restV2"
    )
  );

  assert.deepEqual(orderedGuids, ["adultswim-app", "shared-app"]);
});

test("pass vault service hydration resets service selection from the first live scoped application", () => {
  const helpers = loadPopupFunctions(["resolvePassVaultHydrationServiceApplication"], {
    registeredApplicationMatchesNativeRequiredScope: (app = null, requiredScope = "") =>
      (Array.isArray(app?.scopes) ? app.scopes : []).includes(String(requiredScope || "").trim()),
    buildPassVaultExistingHydrationServiceRecord: () => ({
      registeredApplication: {
        guid: "shared-app",
        appName: "Shared App",
        scopes: ["api:client:v2"],
      },
    }),
    selectPreferredPassVaultHydrationServiceApplication: (_serviceKey = "", apps = []) =>
      apps[0] || null,
    buildPassVaultCompactRegisteredApplication: (app = null) => normalizeRealmObject(app),
  });

  const selected = helpers.resolvePassVaultHydrationServiceApplication({
    definition: {
      serviceKey: "restV2",
      requiredScope: "api:client:v2",
    },
    programmerId: "Discovery",
    registeredApplications: [
      { guid: "animalplanet-app", appName: "Animal Planet", scopes: ["api:client:v2"] },
      { guid: "shared-app", appName: "Shared App", scopes: ["api:client:v2"] },
    ],
    existingRecord: { services: { restV2: { primaryGuid: "shared-app" } } },
  });

  assert.equal(selected?.guid, "animalplanet-app");
});

test("successful REST V2 requestor resolution preserves the media-company primary app without storing requestor app state", async () => {
  const programmer = { programmerId: "Rogers Media" };
  const services = {
    restV2: { guid: "shared-app", appName: "Shared App" },
    restV2Apps: [
      { guid: "shared-app", appName: "Shared App" },
      { guid: "citytv-app", appName: "Citytvplus V2" },
    ],
  };
  const setPremiumSnapshots = [];
  const helpers = loadPopupFunctions(["promoteResolvedRestV2ConfigurationApp"], {
    mergeUniquePremiumServiceAppInfos: (...collections) => {
      const merged = [];
      const seen = new Set();
      collections.flat().forEach((entry) => {
        if (!entry || typeof entry !== "object") {
          return;
        }
        const guid = String(entry.guid || "").trim();
        if (!guid || seen.has(guid)) {
          return;
        }
        seen.add(guid);
        merged.push(normalizeRealmObject(entry));
      });
      return merged;
    },
    collectProgrammerScopedRestV2AppCandidates: (_programmerId = "", premiumApps = null) =>
      Array.isArray(premiumApps?.restV2Apps) ? premiumApps.restV2Apps : [],
    selectPreferredPassVaultHydrationServiceApplication: (_serviceKey = "", apps = []) =>
      apps.find((app) => String(app?.guid || "").trim() === "shared-app") || apps[0] || null,
    applyPremiumServiceRuntimeSummary: (_programmer = null, nextServices = null) => normalizeRealmObject(nextServices),
    setCurrentPremiumAppsSnapshot: (programmerId, nextServices) => {
      setPremiumSnapshots.push({
        programmerId,
        services: normalizeRealmObject(nextServices),
      });
    },
    uniquePreserveOrder,
    persistPassVaultProgrammerRecord: () => Promise.resolve(),
    isProgrammerRuntimeServicesReady: () => true,
    UNDERPAR_VAULT_STATUS_COMPLETE: "complete",
    UNDERPAR_VAULT_STATUS_PARTIAL: "partial",
    state: {
      cmTenantsCatalog: null,
    },
  });

  const nextServices = await helpers.promoteResolvedRestV2ConfigurationApp(
    programmer,
    services,
    { guid: "citytv-app", appName: "Citytvplus V2" },
    "animalplanettv"
  );

  assert.equal(nextServices?.restV2?.guid, "shared-app");
  assert.deepEqual(
    (Array.isArray(nextServices?.restV2Apps) ? nextServices.restV2Apps : []).map((app) => app.guid),
    ["shared-app", "citytv-app"]
  );
  assert.equal(setPremiumSnapshots.length, 1);
  assert.equal(setPremiumSnapshots[0]?.services?.restV2?.guid, "shared-app");
});

test("registered application health ordering keeps the selected app ahead of requestor-specific hints", () => {
  const helpers = loadPopupFunctions(["orderRegisteredApplicationHealthServiceCandidates"], {
    firstNonEmptyString,
    mergeUniquePremiumServiceAppInfos: (...collections) => {
      const merged = [];
      const seen = new Set();
      collections.flat().forEach((entry) => {
        if (!entry || typeof entry !== "object") {
          return;
        }
        const guid = String(entry.guid || "").trim();
        if (!guid || seen.has(guid)) {
          return;
        }
        seen.add(guid);
        merged.push(entry);
      });
      return merged;
    },
    appSupportsServiceProvider: (appInfo = null, requestorId = "", programmerId = "") =>
      String(programmerId || "").trim() === "Discovery" &&
      String(requestorId || "").trim() === "animalplanet" &&
      String(appInfo?.guid || "").trim() === "animalplanet-app",
  });

  const ordered = normalizeRealmObject(
    helpers.orderRegisteredApplicationHealthServiceCandidates(
      "Discovery",
      "animalplanet",
      [
        { guid: "shared-app", appName: "Discovery Shared" },
        { guid: "animalplanet-app", appName: "Animal Planet Scoped" },
      ],
      {
        preferredGuid: "shared-app",
        currentApp: { guid: "shared-app" },
      }
    )
  );

  assert.deepEqual(
    ordered.map((entry) => entry.guid),
    ["shared-app", "animalplanet-app"]
  );
});

test("registered application health dashboard returns the catalog immediately without per-app detail hydration", async () => {
  let fetchOptions = null;
  const helpers = loadPopupFunctions(["fetchRegisteredApplicationHealthDashboardReport"], {
    state: { loginData: { accessToken: "ims-token" } },
    PREMIUM_APPLICATIONS_FETCH_TIMEOUT_MS: 15000,
    fetchApplicationsForProgrammer: async (programmerId, options = {}) => {
      fetchOptions = normalizeRealmObject({ programmerId, ...options });
      return {
        "app-guid": {
          guid: "app-guid",
          name: "Turner REST V2",
        },
      };
    },
    buildPassVaultHydrationRegisteredApplications: () => [
      {
        guid: "app-guid",
        name: "Turner REST V2",
      },
    ],
    buildRegisteredApplicationHealthReportPayload: (queryContext, applications = [], options = {}) => ({
      queryContext,
      applications: normalizeRealmObject(applications),
      error: String(options?.error || "").trim(),
    }),
  });

  const report = normalizeRealmObject(
    await helpers.fetchRegisteredApplicationHealthDashboardReport({
      programmerId: "Turner",
      selectionKey: "release-production|Turner",
    })
  );

  assert.deepEqual(fetchOptions, {
    programmerId: "Turner",
    session: { accessToken: "ims-token" },
    forceRefresh: false,
    preferredTabId: 0,
    requestTimeoutMs: 15000,
  });
  assert.deepEqual(report.applications, [
    {
      guid: "app-guid",
      name: "Turner REST V2",
    },
  ]);
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
    statusMessage: "Refreshing Registered Application Health Inspector for the selected UnderPAR context...",
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

test("registered application workspace filters visible cards to the selected requestor without mutating the catalog", () => {
  const { filterApplicationsForSelectedRequestor } = loadWorkspaceRequestorFilterFunctions({
    requestorId: "MML",
  });

  const visibleEntries = normalizeRealmObject(
    filterApplicationsForSelectedRequestor([
      {
        selectedRequestorMatch: true,
        app: {
          guid: "mml-app",
          requestorHint: "MML",
          serviceProviderHints: ["MML", "NBADE"],
        },
      },
      {
        selectedRequestorMatch: false,
        app: {
          guid: "nbade-app",
          requestorHint: "NBADE",
          serviceProviderHints: ["NBADE"],
        },
      },
      {
        selectedRequestorMatch: false,
        app: {
          guid: "service-provider-only",
          requestorHint: "",
          serviceProviderHints: ["MML"],
        },
      },
    ])
  );

  assert.deepEqual(
    visibleEntries.map((entry) => entry.app.guid),
    ["mml-app", "service-provider-only"]
  );
});

test("registered application workspace filter honors raw @ServiceProvider requestor hints", () => {
  const { filterApplicationsForSelectedRequestor } = loadWorkspaceRequestorFilterFunctions({
    requestorId: "AdultSwim",
  });

  const visibleEntries = normalizeRealmObject(
    filterApplicationsForSelectedRequestor([
      {
        selectedRequestorMatch: false,
        app: {
          guid: "adultswim-app",
          requestorHint: "@ServiceProvider:AdultSwim",
          serviceProviderHints: [],
        },
      },
      {
        selectedRequestorMatch: false,
        app: {
          guid: "other-app",
          requestorHint: "@ServiceProvider:Turner",
          serviceProviderHints: [],
        },
      },
    ])
  );

  assert.deepEqual(
    visibleEntries.map((entry) => entry.app.guid),
    ["adultswim-app"]
  );
});

test("registered application workspace renders scope coverage as colored service pills", () => {
  const { normalizeServicePillToneKey, renderApplicationSummaryFacts } = loadWorkspaceSummaryRenderFunctions();

  assert.equal(normalizeServicePillToneKey("DEFAULT"), "service-default");
  assert.equal(normalizeServicePillToneKey("REST API V2"), "service-rest-v2");
  assert.equal(normalizeServicePillToneKey("ESM"), "service-esm");

  const markup = renderApplicationSummaryFacts({
    clientId: "client-123",
    type: "browser",
    requestorHint: "@ServiceProvider:truTV",
    scopeLabels: ["DEFAULT", "REST API V2", "ESM"],
  });

  assert.match(markup, /regapp-service-pill--service-default/);
  assert.match(markup, /regapp-service-pill--service-rest-v2/);
  assert.match(markup, /regapp-service-pill--service-esm/);
  assert.match(markup, /hr-context-service-pill--service-default/);
  assert.match(markup, /hr-context-service-pill--service-rest-v2/);
  assert.match(markup, /hr-context-service-pill--service-esm/);
  assert.match(markup, /regapp-app-summary-facts[\s\S]*Requestor Hints[\s\S]*regapp-app-summary-scopes/);
  assert.doesNotMatch(markup, /Client ID/);
  assert.doesNotMatch(markup, /Type/);
  assert.doesNotMatch(markup, /Scope Coverage/);
  assert.doesNotMatch(markup, /DEFAULT,\s*REST API V2/);
});

test("registered application workspace suppresses duplicate requestor summary meta when it matches Requestor Hints", () => {
  const { buildApplicationSummaryMeta } = loadWorkspaceSummaryRenderFunctions();

  assert.equal(
    buildApplicationSummaryMeta({
      requestorHint: "@ServiceProvider:AdultSwim",
      serviceProviderSummary: "@ServiceProvider:AdultSwim",
    }),
    ""
  );
  assert.equal(
    buildApplicationSummaryMeta({
      requestorHint: "@ServiceProvider:AdultSwim",
      serviceProviderSummary: "AdultSwim scoped app",
    }),
    "AdultSwim scoped app"
  );
});

test("registered application health sources wire the HEALTH action and workspace assets", () => {
  const popupHtml = read("popup.html");
  const popupSource = read("popup.js");
  const backgroundSource = read("background.js");
  const manifestSource = read("manifest.json");
  const workspaceHtml = read("registered-application-health-workspace.html");
  const workspaceJs = read("registered-application-health-workspace.js");
  const workspaceCss = read("registered-application-health-workspace.css");
  const sharedJwtSource = read("underpar-jwt-inspector.js");

  assert.match(
    popupSource,
    /data-health-action="esm"[\s\S]*data-health-action="cm"[\s\S]*data-health-action="registered-apps"[\s\S]*data-health-action="splunk"/
  );
  assert.match(popupSource, /if \(normalizedAction === "registered-apps"\)[\s\S]*runRegisteredApplicationHealthDashboardForSelection/);
  assert.match(backgroundSource, /registered-application-health-workspace\.html/);
  assert.match(manifestSource, /registered-application-health-workspace\.js/);
  assert.match(popupSource, /JWT Inspector/);
  assert.match(popupSource, /Base64 Inspector/);
  assert.match(popupSource, /buildLearningInspectorToolsHtml/);
  assert.match(popupSource, /wireLearningInspectors\(section\)/);
  assert.match(popupSource, /data-learning-inspector-result=/);
  assert.doesNotMatch(popupHtml, /learning-inspector-dialog/);
  assert.match(popupHtml, /underpar-jwt-inspector\.js/);
  assert.match(workspaceHtml, /Registered Application Health Inspector/);
  assert.doesNotMatch(workspaceHtml, /workspace-premium-service-summary/);
  assert.doesNotMatch(workspaceHtml, /JWT Inspector/);
  assert.doesNotMatch(workspaceHtml, /regapp-jwt-utility-card/);
  assert.doesNotMatch(workspaceHtml, /workspace-jwt-inspector-dialog/);
  assert.match(workspaceJs, /Decoded locally inside UnderPAR\./);
  assert.match(workspaceJs, /data-software-statement-download-guid/);
  assert.match(workspaceJs, /regapp-up-indicator/);
  assert.match(workspaceJs, /service-default/);
  assert.match(workspaceJs, /sendWorkspaceAction\("hydrate-application"/);
  assert.match(workspaceJs, /sendWorkspaceAction\("download-application"/);
  assert.match(workspaceJs, /filterApplicationsForSelectedRequestor/);
  assert.match(workspaceJs, /expandedGuids:\s*new Set\(\)/);
  assert.match(workspaceJs, /setApplicationExpandedState\(guid,\s*details\.open\);/);
  assert.match(workspaceJs, />DOWNLOAD</);
  assert.doesNotMatch(workspaceJs, /Selected RequestorId/);
  assert.doesNotMatch(workspaceJs, /Scope Coverage/);
  assert.doesNotMatch(workspaceJs, /UnderPAR will reuse the live DCR hydration path/);
  assert.doesNotMatch(workspaceJs, /data-pending-premium-service-switch-apply/);
  assert.doesNotMatch(workspaceJs, /data-premium-service-switcher/);
  assert.doesNotMatch(workspaceJs, /sendWorkspaceAction\("prefetch-applications"/);
  assert.doesNotMatch(workspaceJs, /background-hydration/);
  assert.doesNotMatch(workspaceJs, /defaultOpen/);
  assert.doesNotMatch(workspaceJs, /buildJwtStateChip/);
  assert.doesNotMatch(workspaceJs, /Open JWT Inspector/);
  assert.doesNotMatch(workspaceJs, /Application Matrix/);
  assert.doesNotMatch(workspaceJs, /buildMetricCardsMarkup/);
  assert.doesNotMatch(workspaceJs, /renderMatrixTable/);
  assert.doesNotMatch(workspaceJs, /Detected Premium Services/);
  assert.doesNotMatch(workspaceJs, /Switch active Registered Applications from the UnderPAR DevTools tab\./);
  assert.match(workspaceJs, /const disableRerun = state\.loading \|\| serviceSwitchBusy \|\| !canRunCurrentContextReport\(\);/);
  assert.match(workspaceJs, /if \(controllerChanged \|\| requestorChanged \|\| shouldClearStaleReport \|\| premiumServiceChanged\) \{\s*renderReport\(\);/);
  assert.match(workspaceJs, /const action = hasRenderableReport\(\) && preferRefresh \? "refresh-latest" : "run-dashboard";/);
  assert.match(popupSource, /const forceRefresh = options\.forceRefresh === true;/);
  assert.match(popupSource, /premiumServiceBindings:\s*buildRegisteredApplicationHealthPremiumServiceBindings/);
  assert.match(popupSource, /if \(action === "switch-premium-service-application"\)/);
  assert.match(popupSource, /switchRegisteredApplicationHealthPremiumService\(/);
  assert.match(workspaceCss, /\.regapp-service-pill--service-default/);
  assert.match(workspaceCss, /\.hr-context-service-pill--service-default/);
  assert.doesNotMatch(workspaceCss, /\.regapp-health-service-line/);
  assert.doesNotMatch(extractFunctionSource(popupSource, "fetchRegisteredApplicationHealthDashboardReport"), /enrichRegisteredApplicationForHydration/);
  assert.doesNotMatch(
    extractFunctionSource(popupSource, "runRegisteredApplicationHealthDashboardForSelection"),
    /registeredApplicationHealthWorkspaceQueueBackgroundHydration/
  );
  assert.doesNotMatch(
    extractFunctionSource(popupSource, "handleRegisteredApplicationHealthWorkspaceAction"),
    /registeredApplicationHealthWorkspaceQueueBackgroundHydration/
  );
  assert.match(popupSource, /if \(action === "hydrate-application"\)/);
  assert.match(sharedJwtSource, /UnderParJwtInspector/);
  assert.match(sharedJwtSource, /buildInspectorMarkup/);
  assert.match(sharedJwtSource, /JWT Segments/);
  assert.doesNotMatch(sharedJwtSource, /Not returned/);
  assert.doesNotMatch(sharedJwtSource, /jwt\.io/);
  assert.doesNotMatch(sharedJwtSource, /\bfetch\(/);
  assert.match(workspaceJs, /rawTitle:\s*"Software Statement"/);
});

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const ROOT = path.resolve(__dirname, "..");
const POPUP_PATH = path.join(ROOT, "popup.js");
const SPEC_PATH = "/Users/minnick/Documents/PASS/restApiV2.json";

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
  throw new Error(`Unterminated function ${functionName}`);
}

function extractFrozenArraySource(source, constName) {
  const marker = `const ${constName} = Object.freeze([`;
  const start = source.indexOf(marker);
  assert.notEqual(start, -1, `Unable to locate ${constName}`);
  const arrayStart = source.indexOf("[", start);
  let depth = 0;
  for (let index = arrayStart; index < source.length; index += 1) {
    const char = source[index];
    if (char === "[") depth += 1;
    if (char === "]") {
      depth -= 1;
      if (depth === 0) {
        return source.slice(arrayStart, index + 1);
      }
    }
  }
  throw new Error(`Unterminated array for ${constName}`);
}

function loadRestV2Entries() {
  const source = fs.readFileSync(POPUP_PATH, "utf8");
  const arraySource = extractFrozenArraySource(source, "REST_V2_INTERACTIVE_DOC_ENTRIES");
  const script = [
    `const REST_V2_INTERACTIVE_DOC_ENTRIES = Object.freeze(${arraySource});`,
    "module.exports = { REST_V2_INTERACTIVE_DOC_ENTRIES };",
  ].join("\n\n");
  const context = { module: { exports: {} }, exports: {} };
  vm.runInNewContext(script, context, { filename: POPUP_PATH });
  return context.module.exports.REST_V2_INTERACTIVE_DOC_ENTRIES;
}

function loadPlanBuilder() {
  const source = fs.readFileSync(POPUP_PATH, "utf8");
  const script = [
    'const REST_V2_BASE = "https://sp.auth.adobe.com/api/v2";',
    'const PREMIUM_SERVICE_DOCUMENTATION_URL_BY_KEY = { restV2: "https://developer.adobe.com/adobe-pass/api/rest_api_v2/interactive/" };',
    'function buildRestV2Headers() { return { "AP-Device-Identifier": "device-123", "X-Device-Info": "device-info-123" }; }',
    "function firstNonEmptyString(values = []) { for (const value of Array.isArray(values) ? values : [values]) { if (value == null) { continue; } const normalized = String(value || '').trim(); if (normalized) { return normalized; } } return ''; }",
    "function getRestV2MvpdMeta(requestorId = '', mvpdId = '', mvpdMeta = null) { return mvpdMeta || null; }",
    extractFunctionSource(source, "parseJsonText"),
    extractFunctionSource(source, "normalizeRestV2ProfileAttributeValue"),
    extractFunctionSource(source, "dedupeRestV2CandidateStrings"),
    extractFunctionSource(source, "decodeBase64TextSafe"),
    extractFunctionSource(source, "getRestV2CaseInsensitiveObjectValue"),
    extractFunctionSource(source, "getRestV2CaseInsensitiveHeaderValue"),
    extractFunctionSource(source, "collectRestV2CaseInsensitiveObjectValues"),
    extractFunctionSource(source, "getRestV2InteractiveDocsHeaderAliasCandidates"),
    extractFunctionSource(source, "decodeURIComponentSafe"),
    extractFunctionSource(source, "parseRestV2PartnerFrameworkStatusPayload"),
    extractFunctionSource(source, "resolveRestV2PartnerFrameworkStatusSummary"),
    extractFunctionSource(source, "isRestV2PartnerFrameworkStatusUsable"),
    extractFunctionSource(source, "normalizeRestV2PartnerFrameworkStatusForRequest"),
    extractFunctionSource(source, "normalizeRestV2PartnerSsoPlatformName"),
    extractFunctionSource(source, "extractRestV2VisitorIdentifierFromCarrierValue"),
    extractFunctionSource(source, "normalizeRestV2VisitorIdentifierForRequest"),
    extractFunctionSource(source, "normalizeRestV2TempPassIdentityForRequest"),
    extractFunctionSource(source, "normalizeRestV2InteractiveDocsHeaderCandidate"),
    `function extractRestV2InteractiveDocsHeaderValueFromText(value = "", headerName = "") {
      const normalizedHeaderName = String(headerName || "").trim();
      const raw = String(value || "").trim();
      if (!normalizedHeaderName || !raw) {
        return "";
      }
      const aliases = getRestV2InteractiveDocsHeaderAliasCandidates(normalizedHeaderName);
      const textCandidates = dedupeRestV2CandidateStrings([
        raw,
        decodeURIComponentSafe(raw),
        decodeBase64TextSafe(raw),
        decodeBase64TextSafe(decodeURIComponentSafe(raw)),
      ]);
      for (const candidateText of textCandidates) {
        const looksLikeStandaloneHeaderValue =
          !/[{}\\n\\r]/.test(candidateText) && !candidateText.includes("://") && !candidateText.includes("&");
        const normalizedDirect = looksLikeStandaloneHeaderValue
          ? normalizeRestV2InteractiveDocsHeaderCandidate(normalizedHeaderName, candidateText)
          : "";
        if (normalizedDirect) {
          return normalizedDirect;
        }
        const parsed = parseJsonText(candidateText, null);
        const objectCandidates = collectRestV2CaseInsensitiveObjectValues(parsed, aliases, { maxDepth: 5 });
        for (const objectCandidate of objectCandidates) {
          const normalizedObjectCandidate = normalizeRestV2InteractiveDocsHeaderCandidate(normalizedHeaderName, objectCandidate);
          if (normalizedObjectCandidate) {
            return normalizedObjectCandidate;
          }
        }
        try {
          const parsedUrl = new URL(candidateText, ADOBE_SP_BASE);
          for (const alias of aliases) {
            const queryCandidate = String(parsedUrl.searchParams.get(alias) || "").trim();
            const normalizedQueryCandidate = normalizeRestV2InteractiveDocsHeaderCandidate(normalizedHeaderName, queryCandidate);
            if (normalizedQueryCandidate) {
              return normalizedQueryCandidate;
            }
          }
        } catch {}
      }
      const escapedAliases = aliases
        .map((alias) => String(alias || "").trim())
        .filter(Boolean)
        .sort((left, right) => right.length - left.length)
        .map((alias) => alias.replace(/[.*+?^$()|[\\]\\\\]/g, "\\\\$&"));
      if (escapedAliases.length === 0) {
        return "";
      }
      const inlineMatch = raw.match(new RegExp("(?:"
        + escapedAliases.join("|")
        + ")[\\\"'=:\\\\s]+([^\\\"\\\\s&,}]{8,})", "i"));
      return normalizeRestV2InteractiveDocsHeaderCandidate(normalizedHeaderName, String(inlineMatch?.[1] || "").trim());
    }`,
    extractFunctionSource(source, "normalizeRestV2MvpdMatchToken"),
    extractFunctionSource(source, "scoreRestV2PartnerProviderIdCandidate"),
    extractFunctionSource(source, "rankRestV2PartnerProviderIdCandidates"),
    extractFunctionSource(source, "buildRestV2MvpdMatchTokens"),
    extractFunctionSource(source, "isRestV2MvpdMatch"),
    extractFunctionSource(source, "resolveRestV2PartnerFromFrameworkStatus"),
    extractFunctionSource(source, "resolveRestV2PartnerFrameworkStatusProviderId"),
    extractFunctionSource(source, "collectRestV2PartnerProviderIdCandidatesFromMvpdMeta"),
    extractFunctionSource(source, "resolveRestV2MvpdMetaForPartnerFrameworkProviderId"),
    extractFunctionSource(source, "resolveRestV2ExpectedPartnerFrameworkProviderIds"),
    extractFunctionSource(source, "resolveRestV2ExpectedPartnerFrameworkProviderId"),
    extractFunctionSource(source, "isRestV2PartnerFrameworkStatusCompatibleWithContext"),
    extractFunctionSource(source, "resolveRestV2PartnerFrameworkStatusFromSessionData"),
    extractFunctionSource(source, "resolveRestV2SessionPartnerFromSessionData"),
    extractFunctionSource(source, "resolveRestV2PartnerFrameworkStatusFromContext"),
    extractFunctionSource(source, "resolveRestV2PartnerNameFromContext"),
    extractFunctionSource(source, "resolveRestV2LearningPartnerFrameworkStatusFromContext"),
    extractFunctionSource(source, "resolveRestV2ExactPartnerFrameworkStatusForContext"),
    extractFunctionSource(source, "resolveRestV2PreferredPartnerFrameworkStatusForContext"),
    extractFunctionSource(source, "resolveRestV2LearningPartnerNameFromContext"),
    extractFunctionSource(source, "resolveRestV2InteractiveDocsHeaderValueFromContext"),
    extractFunctionSource(source, "buildRestV2InteractiveDocsUrl"),
    extractFunctionSource(source, "buildRestV2InteractiveDocsHydrationPlan"),
    "module.exports = { buildRestV2InteractiveDocsHydrationPlan };",
  ].join("\n\n");
  const context = {
    module: { exports: {} },
    exports: {},
    navigator: { userAgent: "UnderPAR spec contract test" },
    atob,
    btoa,
    unescape,
    encodeURIComponent,
    Headers,
  };
  vm.runInNewContext(script, context, { filename: POPUP_PATH });
  return context.module.exports.buildRestV2InteractiveDocsHydrationPlan;
}

function loadRedirectCandidateHelpers() {
  const source = fs.readFileSync(POPUP_PATH, "utf8");
  const script = [
    'const DEFAULT_ADOBEPASS_ENVIRONMENT = { spBase: "https://sp.auth-staging.adobe.com" };',
    'const PREMIUM_SERVICE_DOCUMENTATION_URL_BY_KEY = { restV2: "https://developer.adobe.com/adobe-pass/api/rest_api_v2/interactive/" };',
    'const REST_V2_DEFAULT_DOMAIN = "adobe.com";',
    "function uniqueSorted(values = []) { return Array.from(new Set((Array.isArray(values) ? values : []).map((value) => String(value || '').trim()).filter(Boolean))).sort(); }",
    extractFunctionSource(source, "buildRestV2RedirectCandidatesForSpBase"),
    'let REST_V2_REDIRECT_CANDIDATES = buildRestV2RedirectCandidatesForSpBase("https://sp.auth-staging.adobe.com");',
    extractFunctionSource(source, "buildRestV2SessionCreatePayloadCandidates"),
    "module.exports = { buildRestV2RedirectCandidatesForSpBase, buildRestV2SessionCreatePayloadCandidates };",
  ].join("\n\n");
  const context = {
    module: { exports: {} },
    exports: {},
    URLSearchParams,
  };
  vm.runInNewContext(script, context, { filename: POPUP_PATH });
  return context.module.exports;
}

function loadSpecOperations() {
  if (!fs.existsSync(SPEC_PATH)) {
    return null;
  }
  const spec = JSON.parse(fs.readFileSync(SPEC_PATH, "utf8"));
  const operationById = new Map();
  for (const [routePath, methods] of Object.entries(spec.paths || {})) {
    for (const [method, operation] of Object.entries(methods || {})) {
      if (!operation?.operationId) {
        continue;
      }
      operationById.set(String(operation.operationId), {
        method: String(method).toUpperCase(),
        pathTemplate: routePath,
        parameters: Array.isArray(operation.parameters) ? operation.parameters : [],
        requestBody: operation.requestBody || null,
      });
    }
  }
  return {
    operationById,
    components: spec.components || {},
  };
}

function resolveSchema(schema = null, components = {}) {
  if (!schema || typeof schema !== "object") {
    return null;
  }
  if (schema.$ref) {
    const match = String(schema.$ref).match(/^#\/components\/schemas\/(.+)$/);
    if (!match) {
      return null;
    }
    const resolved = components?.schemas?.[match[1]] || null;
    return resolveSchema(resolved, components);
  }
  return schema;
}

function getRequiredBodyPropertyNames(requestBody = null, components = {}) {
  const schema = resolveSchema(
    requestBody?.content?.["application/json"]?.schema || requestBody?.content?.["application/x-www-form-urlencoded"]?.schema,
    components
  );
  return new Set(Array.isArray(schema?.required) ? schema.required : []);
}

function getBodyPropertyNames(requestBody = null, components = {}) {
  const schema = resolveSchema(
    requestBody?.content?.["application/json"]?.schema || requestBody?.content?.["application/x-www-form-urlencoded"]?.schema,
    components
  );
  return new Set(Object.keys(schema?.properties || {}));
}

function isBodyPropertyRequired(requestBody = null, propertyName = "", components = {}) {
  const normalizedPropertyName = String(propertyName || "").trim();
  if (!normalizedPropertyName) {
    return false;
  }
  const schema = resolveSchema(
    requestBody?.content?.["application/json"]?.schema || requestBody?.content?.["application/x-www-form-urlencoded"]?.schema,
    components
  );
  const propertyNames = Object.keys(schema?.properties || {});
  if (!propertyNames.includes(normalizedPropertyName)) {
    return false;
  }
  if (Array.isArray(schema?.required) && schema.required.includes(normalizedPropertyName)) {
    return true;
  }
  return requestBody?.required === true && propertyNames.length === 1;
}

function getParameter(parameters, name, location) {
  return parameters.find((parameter) => parameter?.name === name && parameter?.in === location) || null;
}

test("REST V2 learning entries stay aligned with the local OpenAPI spec", () => {
  const loadedSpec = loadSpecOperations();
  if (!loadedSpec) {
    test.skip(`Missing REST V2 spec at ${SPEC_PATH}`);
    return;
  }
  const { operationById, components } = loadedSpec;

  const entries = loadRestV2Entries();
  const buildPlan = loadPlanBuilder();
  const validPartnerFrameworkStatus = Buffer.from(
    JSON.stringify({
      frameworkPermissionInfo: {
        accessStatus: "granted",
      },
      frameworkProviderInfo: {
        id: "comcast-provider-map",
        expirationDate: String(Date.now() + 60 * 60 * 1000),
      },
    }),
    "utf8"
  ).toString("base64");
  const rawTempPassIdentity = JSON.stringify({
    subscriberId: "promo-user-1",
  });
  const sampleContext = {
    serviceProviderId: "turner",
    requestorId: "turner",
    requestorAutoResolved: false,
    sessionCode: "sample-session-code",
    mvpd: "Comcast_SSO",
    resourceIds: ["urn:adobe:test-resource"],
    redirectUrl: "https://experience.example.test/callback",
    domainName: "experience.example.test",
    partner: "Apple",
    learningPartner: "Apple",
    mvpdMeta: {
      id: "Comcast_SSO",
      name: "Xfinity",
      partnerPlatformMappings: {
        Apple: "comcast-provider-map",
      },
    },
    partnerFrameworkStatus: validPartnerFrameworkStatus,
    adobeSubjectToken: "subject-token-payload",
    adServiceToken: "service-token-payload",
    tempPassIdentity: rawTempPassIdentity,
    visitorIdentifier: "20265673158980419722735089753036633573",
    samlResponse: "PHNhbWxwOlJlc3BvbnNlPg==",
    samlSource: "spec-contract",
  };

  assert.equal(entries.length, 13);

  for (const entry of entries) {
    const specMeta = operationById.get(String(entry.operationId || "").trim());
    assert.ok(specMeta, `Missing spec entry for ${entry.operationId}`);
    assert.equal(String(entry.methodLabel || "").trim(), specMeta.method, `${entry.operationId} method drifted from spec`);

    const serviceProviderParam = getParameter(specMeta.parameters, "serviceProvider", "path");
    assert.ok(serviceProviderParam?.required, `${entry.operationId} must keep path.serviceProvider required`);
    const deviceIdentifierHeader = getParameter(specMeta.parameters, "AP-Device-Identifier", "header");
    const deviceInfoHeader = getParameter(specMeta.parameters, "X-Device-Info", "header");
    assert.equal(
      entry.usesDeviceHeaders === true,
      Boolean(deviceIdentifierHeader && deviceInfoHeader),
      `${entry.operationId} device-header usage drifted`
    );
    if (entry.usesDeviceHeaders === true) {
      assert.equal(deviceIdentifierHeader?.required, true, `${entry.operationId} must keep AP-Device-Identifier required`);
      assert.equal(deviceInfoHeader?.required, true, `${entry.operationId} must keep X-Device-Info required`);
    }

    const codeParam = getParameter(specMeta.parameters, "code", "path");
    assert.equal(entry.usesSessionCode === true, Boolean(codeParam), `${entry.operationId} code-path usage drifted`);
    assert.equal(entry.requireSessionCode === true, Boolean(codeParam?.required), `${entry.operationId} code-path requirement drifted`);

    const mvpdParam = getParameter(specMeta.parameters, "mvpd", "path");
    assert.equal(entry.usesMvpdPath === true, Boolean(mvpdParam), `${entry.operationId} mvpd-path usage drifted`);
    assert.equal(entry.requireMvpdPath === true, Boolean(mvpdParam?.required), `${entry.operationId} mvpd-path requirement drifted`);

    const partnerParam = getParameter(specMeta.parameters, "partner", "path");
    assert.equal(entry.usesPartnerPath === true, Boolean(partnerParam), `${entry.operationId} partner-path usage drifted`);
    assert.equal(entry.requirePartnerPath === true, Boolean(partnerParam?.required), `${entry.operationId} partner-path requirement drifted`);
    const adobeSubjectTokenHeader = getParameter(specMeta.parameters, "Adobe-Subject-Token", "header");
    assert.equal(
      entry.usesAdobeSubjectToken === true,
      Boolean(adobeSubjectTokenHeader),
      `${entry.operationId} Adobe-Subject-Token usage drifted`
    );
    const adServiceTokenHeader = getParameter(specMeta.parameters, "AD-Service-Token", "header");
    assert.equal(
      entry.usesAdServiceToken === true,
      Boolean(adServiceTokenHeader),
      `${entry.operationId} AD-Service-Token usage drifted`
    );
    const tempPassIdentityHeader =
      getParameter(specMeta.parameters, "AP-Temppass-Identity", "header") ||
      getParameter(specMeta.parameters, "AP-TempPass-Identity", "header");
    assert.equal(
      entry.usesTempPassIdentity === true,
      Boolean(tempPassIdentityHeader),
      `${entry.operationId} AP-Temppass-Identity usage drifted`
    );
    const visitorIdentifierHeader = getParameter(specMeta.parameters, "AP-Visitor-Identifier", "header");
    assert.equal(
      entry.usesVisitorIdentifier === true,
      Boolean(visitorIdentifierHeader),
      `${entry.operationId} AP-Visitor-Identifier usage drifted`
    );
    const partnerFrameworkStatusHeader = getParameter(specMeta.parameters, "AP-Partner-Framework-Status", "header");
    assert.equal(
      entry.usesPartnerFrameworkStatus === true,
      Boolean(partnerFrameworkStatusHeader),
      `${entry.operationId} AP-Partner-Framework-Status usage drifted`
    );
    if (String(entry.sectionKey || "") === "partnerSso") {
      assert.equal(entry.requirePartnerFrameworkStatus === true, true, `${entry.operationId} must require a usable partner framework payload`);
    }

    const bodyProperties = getBodyPropertyNames(specMeta.requestBody, components);
    const requiredBodyProperties = getRequiredBodyPropertyNames(specMeta.requestBody, components);
    assert.equal(entry.usesBodyMvpd === true, bodyProperties.has("mvpd"), `${entry.operationId} body.mvpd usage drifted`);
    assert.equal(entry.usesBodyDomainName === true, bodyProperties.has("domainName"), `${entry.operationId} body.domainName usage drifted`);
    assert.equal(
      entry.requireBodyDomainName === true,
      requiredBodyProperties.has("domainName"),
      `${entry.operationId} body.domainName requirement drifted`
    );
    assert.equal(entry.usesBodyRedirectUrl === true, bodyProperties.has("redirectUrl"), `${entry.operationId} body.redirectUrl usage drifted`);
    assert.equal(
      entry.requireBodyRedirectUrl === true,
      requiredBodyProperties.has("redirectUrl"),
      `${entry.operationId} body.redirectUrl requirement drifted`
    );
    assert.equal(entry.usesBodyResources === true, bodyProperties.has("resources"), `${entry.operationId} body.resources usage drifted`);
    assert.equal(
      entry.requireBodyResources === true,
      isBodyPropertyRequired(specMeta.requestBody, "resources", components),
      `${entry.operationId} body.resources requirement drifted`
    );
    assert.equal(
      entry.usesBodySamlResponse === true,
      bodyProperties.has("SAMLResponse"),
      `${entry.operationId} body.SAMLResponse usage drifted`
    );
    assert.equal(
      entry.requireBodySamlResponse === true,
      isBodyPropertyRequired(specMeta.requestBody, "SAMLResponse", components),
      `${entry.operationId} body.SAMLResponse requirement drifted`
    );

    const plan = buildPlan(entry, sampleContext, "test-token");
    assert.equal(plan.operationId, entry.operationId);
    assert.equal(plan.docsUrl.endsWith(`#${entry.operationAnchor}`), true, `${entry.operationId} docs anchor drifted`);
    if (entry.usesBodyRedirectUrl === true) {
      assert.equal(
        plan.fieldValues["body.redirectUrl"],
        plan.docsUrl,
        `${entry.operationId} body.redirectUrl must use the clicked docs operation url`
      );
    }
    if (entry.usesQueryRedirectUrl === true) {
      assert.equal(
        plan.fieldValues["query.redirectUrl"],
        plan.docsUrl,
        `${entry.operationId} query.redirectUrl must use the clicked docs operation url`
      );
    }
    if (entry.usesAdobeSubjectToken === true) {
      assert.equal(
        plan.fieldValues["header.Adobe-Subject-Token"],
        sampleContext.adobeSubjectToken,
        `${entry.operationId} must hydrate Adobe-Subject-Token when UnderPAR has it`
      );
    }
    if (entry.usesAdServiceToken === true) {
      assert.equal(
        plan.fieldValues["header.AD-Service-Token"],
        sampleContext.adServiceToken,
        `${entry.operationId} must hydrate AD-Service-Token when UnderPAR has it`
      );
    }
    if (entry.usesTempPassIdentity === true) {
      assert.equal(
        plan.fieldValues["header.AP-Temppass-Identity"],
        Buffer.from(rawTempPassIdentity, "utf8").toString("base64"),
        `${entry.operationId} must normalize AP-Temppass-Identity when UnderPAR has it`
      );
    }
    if (entry.usesVisitorIdentifier === true) {
      assert.equal(
        plan.fieldValues["header.AP-Visitor-Identifier"],
        sampleContext.visitorIdentifier,
        `${entry.operationId} must hydrate AP-Visitor-Identifier when UnderPAR has it`
      );
    }
  }
});

test("REST V2 redirect candidates use the interactive docs URL instead of legacy api.html targets", () => {
  const popupSource = fs.readFileSync(POPUP_PATH, "utf8");
  assert.doesNotMatch(popupSource, /apitest\/api\.html/);
  assert.doesNotMatch(popupSource, /spBase\}\/api\.html/);

  const { buildRestV2RedirectCandidatesForSpBase, buildRestV2SessionCreatePayloadCandidates } = loadRedirectCandidateHelpers();
  const redirectCandidates = Array.from(buildRestV2RedirectCandidatesForSpBase("https://sp.auth-staging.adobe.com"));
  assert.deepEqual(redirectCandidates, ["https://developer.adobe.com/adobe-pass/api/rest_api_v2/interactive/"]);

  const payloadCandidates = Array.from(buildRestV2SessionCreatePayloadCandidates("Comcast_SSO"));
  assert.equal(payloadCandidates.length, 3);
  assert.equal(
    payloadCandidates[0].redirectUrl,
    "https://developer.adobe.com/adobe-pass/api/rest_api_v2/interactive/"
  );
  assert.match(
    payloadCandidates[0].body,
    /redirectUrl=https%3A%2F%2Fdeveloper\.adobe\.com%2Fadobe-pass%2Fapi%2Frest_api_v2%2Finteractive%2F/
  );
  assert.equal(payloadCandidates.some((candidate) => /api\.html/.test(String(candidate?.redirectUrl || ""))), false);
});

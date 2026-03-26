#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const ROOT = path.resolve(__dirname, "..");
const POPUP_PATH = path.join(ROOT, "popup.js");
const SPEC_PATH = process.env.UNDERPAR_REST_V2_SPEC || "/Users/minnick/Documents/PASS/restApiV2.json";
const DOCS_URL = "https://developer.adobe.com/adobe-pass/api/rest_api_v2/interactive/";
const CDP_PORT = Number(process.env.UNDERPAR_CDP_PORT || 9222);
const HYDRATE_TIMEOUT_MS = Number(process.env.UNDERPAR_REST_V2_HYDRATE_TIMEOUT_MS || 12000);
const REQUEST_CAPTURE_TIMEOUT_MS = Number(process.env.UNDERPAR_REST_V2_REQUEST_TIMEOUT_MS || 8000);
const SAMPLE_ACCESS_TOKEN = "test-token";
const SAMPLE_PARTNER_FRAMEWORK_STATUS = Buffer.from(
  JSON.stringify({
    frameworkPermissionInfo: {
      accessStatus: "granted",
    },
    frameworkProviderInfo: {
      id: "Comcast_SSO_Apple",
      expirationDate: "1775748018000",
    },
    frameworkPartnerInfo: {
      partner: "Apple",
      name: "Apple",
    },
  }),
  "utf8"
).toString("base64");
const SAMPLE_CONTEXT = Object.freeze({
  serviceProviderId: "turner",
  requestorId: "turner",
  requestorAutoResolved: false,
  sessionCode: "sample-session-code",
  mvpd: "Comcast_SSO",
  mvpdMeta: {
    id: "Comcast_SSO",
    name: "Xfinity (Comcast_SSO)",
    platformMappingId: "Comcast_SSO",
    partnerPlatformMappings: {
      Apple: "Comcast_SSO_Apple",
    },
  },
  resourceIds: ["urn:adobe:test-resource"],
  redirectUrl: "https://experience.example.test/callback",
  domainName: "experience.example.test",
  partner: "Apple",
  partnerFrameworkStatus: SAMPLE_PARTNER_FRAMEWORK_STATUS,
  samlResponse: "PHNhbWxwOlJlc3BvbnNlPg==",
  samlSource: "live-probe",
  samlTrustedForPartnerSso: true,
  adobeSubjectToken: "subject-token-live-probe",
  adServiceToken: "service-token-live-probe",
  tempPassIdentity: "temp-pass-identity-live-probe",
  visitorIdentifier: "12345678901234567890",
});

function extractFunctionSource(source, functionName) {
  const markers = [`async function ${functionName}(`, `function ${functionName}(`];
  let start = -1;
  for (const marker of markers) {
    start = source.indexOf(marker);
    if (start !== -1) {
      break;
    }
  }
  if (start === -1) {
    throw new Error(`Unable to locate ${functionName}`);
  }
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
  if (bodyStart === -1) {
    throw new Error(`Unable to locate body for ${functionName}`);
  }
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
  if (start === -1) {
    throw new Error(`Unable to locate ${constName}`);
  }
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

function loadLearningRuntime() {
  const popupSource = fs.readFileSync(POPUP_PATH, "utf8");
  const entryArraySource = extractFrozenArraySource(popupSource, "REST_V2_INTERACTIVE_DOC_ENTRIES");
  const script = [
    `const REST_V2_INTERACTIVE_DOC_ENTRIES = Object.freeze(${entryArraySource});`,
    'const REST_V2_BASE = "https://sp.auth.adobe.com/api/v2";',
    'const PREMIUM_SERVICE_DOCUMENTATION_URL_BY_KEY = { restV2: "https://developer.adobe.com/adobe-pass/api/rest_api_v2/interactive/" };',
    'function buildRestV2Headers() { return { "AP-Device-Identifier": "device-123", "X-Device-Info": "device-info-123" }; }',
    "function firstNonEmptyString(values = []) { for (const value of Array.isArray(values) ? values : [values]) { if (value == null) { continue; } const normalized = String(value || '').trim(); if (normalized) { return normalized; } } return ''; }",
    "function getRestV2MvpdMeta(requestorId = '', mvpdId = '', mvpdMeta = null) { return mvpdMeta || null; }",
    extractFunctionSource(popupSource, "parseJsonText"),
    extractFunctionSource(popupSource, "normalizeRestV2ProfileAttributeValue"),
    extractFunctionSource(popupSource, "dedupeRestV2CandidateStrings"),
    extractFunctionSource(popupSource, "decodeBase64TextSafe"),
    extractFunctionSource(popupSource, "getRestV2CaseInsensitiveObjectValue"),
    extractFunctionSource(popupSource, "getRestV2CaseInsensitiveHeaderValue"),
    extractFunctionSource(popupSource, "collectRestV2CaseInsensitiveObjectValues"),
    extractFunctionSource(popupSource, "getRestV2InteractiveDocsHeaderAliasCandidates"),
    extractFunctionSource(popupSource, "decodeURIComponentSafe"),
    extractFunctionSource(popupSource, "parseRestV2PartnerFrameworkStatusPayload"),
    extractFunctionSource(popupSource, "resolveRestV2PartnerFrameworkStatusSummary"),
    extractFunctionSource(popupSource, "isRestV2PartnerFrameworkStatusUsable"),
    extractFunctionSource(popupSource, "normalizeRestV2PartnerFrameworkStatusForRequest"),
    extractFunctionSource(popupSource, "extractRestV2VisitorIdentifierFromCarrierValue"),
    extractFunctionSource(popupSource, "normalizeRestV2VisitorIdentifierForRequest"),
    extractFunctionSource(popupSource, "normalizeRestV2TempPassIdentityForRequest"),
    extractFunctionSource(popupSource, "normalizeRestV2InteractiveDocsHeaderCandidate"),
    extractFunctionSource(popupSource, "normalizeRestV2MvpdMatchToken"),
    extractFunctionSource(popupSource, "buildRestV2MvpdMatchTokens"),
    extractFunctionSource(popupSource, "isRestV2MvpdMatch"),
    extractFunctionSource(popupSource, "resolveRestV2PartnerFromFrameworkStatus"),
    extractFunctionSource(popupSource, "resolveRestV2PartnerFrameworkStatusProviderId"),
    extractFunctionSource(popupSource, "resolveRestV2MvpdMetaForPartnerFrameworkProviderId"),
    extractFunctionSource(popupSource, "resolveRestV2ExpectedPartnerFrameworkProviderId"),
    extractFunctionSource(popupSource, "isRestV2PartnerFrameworkStatusCompatibleWithContext"),
    extractFunctionSource(popupSource, "resolveRestV2PartnerFrameworkStatusFromSessionData"),
    extractFunctionSource(popupSource, "resolveRestV2SessionPartnerFromSessionData"),
    extractFunctionSource(popupSource, "resolveRestV2PartnerFrameworkStatusFromContext"),
    extractFunctionSource(popupSource, "resolveRestV2PartnerNameFromContext"),
    extractFunctionSource(popupSource, "resolveRestV2LearningPartnerFrameworkStatusFromContext"),
    extractFunctionSource(popupSource, "resolveRestV2PreferredPartnerFrameworkStatusForContext"),
    extractFunctionSource(popupSource, "resolveRestV2LearningPartnerNameFromContext"),
    extractFunctionSource(popupSource, "resolveRestV2InteractiveDocsHeaderValueFromContext"),
    extractFunctionSource(popupSource, "isRestV2TrustedPartnerSsoSamlContext"),
    extractFunctionSource(popupSource, "isRestV2StandardAuthenticateCaptureContext"),
    extractFunctionSource(popupSource, "buildRestV2InteractiveDocsUrl"),
    extractFunctionSource(popupSource, "buildRestV2InteractiveDocsHydrationPlan"),
    extractFunctionSource(popupSource, "runRestV2InteractiveDocsHydrator"),
    "module.exports = { REST_V2_INTERACTIVE_DOC_ENTRIES, buildRestV2InteractiveDocsHydrationPlan, runRestV2InteractiveDocsHydrator };",
  ].join("\n\n");
  const context = {
    module: { exports: {} },
    exports: {},
    navigator: { userAgent: "UnderPAR live probe" },
    Headers,
    atob,
    btoa,
    unescape,
    encodeURIComponent,
  };
  vm.runInNewContext(script, context, { filename: POPUP_PATH });
  return context.module.exports;
}

class CdpClient {
  constructor(wsUrl) {
    this.wsUrl = wsUrl;
    this.ws = null;
    this.nextId = 1;
    this.pending = new Map();
    this.events = [];
  }

  async open() {
    this.ws = new WebSocket(this.wsUrl);
    this.ws.addEventListener("message", (event) => {
      const payload = JSON.parse(event.data);
      if (payload.id && this.pending.has(payload.id)) {
        this.pending.get(payload.id)(payload);
        this.pending.delete(payload.id);
        return;
      }
      this.events.push(payload);
    });
    await new Promise((resolve, reject) => {
      this.ws.addEventListener("open", resolve, { once: true });
      this.ws.addEventListener("error", reject, { once: true });
    });
  }

  async close() {
    if (!this.ws) {
      return;
    }
    await new Promise((resolve) => {
      this.ws.addEventListener("close", resolve, { once: true });
      this.ws.close();
    });
  }

  call(method, params = {}) {
    return new Promise((resolve, reject) => {
      const id = this.nextId++;
      this.pending.set(id, resolve);
      this.ws.send(JSON.stringify({ id, method, params }), (error) => {
        if (error) {
          this.pending.delete(id);
          reject(error);
        }
      });
    });
  }

  clearEvents() {
    this.events.length = 0;
  }
}

function loadSpecByOperationId() {
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
        operation,
      });
    }
  }
  return operationById;
}

async function createDocsTarget(url = DOCS_URL) {
  const response = await fetch(`http://127.0.0.1:${CDP_PORT}/json/new?${encodeURIComponent(url)}`, {
    method: "PUT",
  });
  if (!response.ok) {
    throw new Error(`CDP new-target failed (${response.status}): ${response.statusText}`);
  }
  const target = await response.json();
  if (!target?.webSocketDebuggerUrl || !target?.id) {
    throw new Error("CDP did not return a usable target for the REST V2 docs.");
  }
  return target;
}

async function closeDocsTarget(targetId = "") {
  const normalizedTargetId = String(targetId || "").trim();
  if (!normalizedTargetId) {
    return;
  }
  await fetch(`http://127.0.0.1:${CDP_PORT}/json/close/${normalizedTargetId}`).catch(() => null);
}

function buildExpectedPath(pathTemplate, sampleValues) {
  return String(pathTemplate || "").replace(/\{([^}]+)\}/g, (_, key) =>
    encodeURIComponent(String(sampleValues[key] || ""))
  );
}

function parseCapturedBody(request) {
  const headers = request?.headers && typeof request.headers === "object" ? request.headers : {};
  const raw = String(request?.postData || "");
  const contentTypeEntry = Object.entries(headers).find(([key]) => key.toLowerCase() === "content-type");
  const contentType = String(contentTypeEntry?.[1] || "").trim().toLowerCase();
  if (!raw) {
    return { raw: "" };
  }
  if (contentType.includes("application/json")) {
    try {
      return JSON.parse(raw);
    } catch {
      return { raw };
    }
  }
  if (contentType.includes("application/x-www-form-urlencoded")) {
    return Object.fromEntries(new URLSearchParams(raw).entries());
  }
  return { raw };
}

function getCapturedHeaderValue(headers = {}, headerName = "") {
  const normalizedHeaderName = String(headerName || "").trim().toLowerCase();
  if (!normalizedHeaderName || !headers || typeof headers !== "object") {
    return "";
  }
  const match = Object.entries(headers).find(([key]) => String(key || "").trim().toLowerCase() === normalizedHeaderName);
  return String(match?.[1] || "").trim();
}

async function waitForCapturedRequest(client, expectedMethod, timeoutMs = REQUEST_CAPTURE_TIMEOUT_MS) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const requestEvent = client.events.find((event) => {
      if (event.method !== "Network.requestWillBeSent") {
        return false;
      }
      const request = event.params?.request;
      if (!request) {
        return false;
      }
      if (String(request.method || "").toUpperCase() !== expectedMethod) {
        return false;
      }
      return /\/api\/v2\//.test(String(request.url || ""));
    });
    if (requestEvent?.params?.request) {
      return requestEvent.params.request;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  return null;
}

function normalizeHydrateResult(result) {
  return result?.result?.result?.value && typeof result.result.result.value === "object"
    ? result.result.result.value
    : null;
}

async function hydrateAndSendOperation(entry, plan, specMeta, popupSource) {
  const target = await createDocsTarget(plan.docsUrl || DOCS_URL);
  const client = new CdpClient(String(target.webSocketDebuggerUrl));
  await client.open();
  client.clearEvents();
  try {
    await client.call("Runtime.enable");
    await client.call("Page.enable");
    await client.call("Network.enable");
    await client.call("Runtime.evaluate", {
      expression: `${extractFunctionSource(
        popupSource,
        "runRestV2InteractiveDocsHydrator"
      )}; window.__underparRunRestV2InteractiveDocsHydrator = runRestV2InteractiveDocsHydrator; 'ok';`,
    });

    const hydrateResponse = await client.call("Runtime.evaluate", {
      awaitPromise: true,
      returnByValue: true,
      expression: `window.__underparRunRestV2InteractiveDocsHydrator(${JSON.stringify({
        operationId: plan.operationId,
        requiredFields: plan.requiredFields,
        missingRequiredFields: plan.missingRequiredFields,
        fieldValues: plan.fieldValues,
        timeoutMs: HYDRATE_TIMEOUT_MS,
      })})`,
    });
    const hydrate = normalizeHydrateResult(hydrateResponse);
    if (!hydrate?.ok || hydrate.sendButtonFound !== true) {
      return {
        ok: false,
        entry: entry.key,
        operationId: entry.operationId,
        error: "Hydration failed before Send.",
        hydrate,
      };
    }

    const missingControls = Array.isArray(hydrate.missingControls) ? hydrate.missingControls : [];
    const unresolvedRequiredFields = Array.isArray(hydrate.unresolvedRequiredFields) ? hydrate.unresolvedRequiredFields : [];
    const unresolvedRequiredControls = unresolvedRequiredFields.filter((field) => String(field || "").trim() !== "server");
    if (unresolvedRequiredControls.length > 0) {
      return {
        ok: false,
        entry: entry.key,
        operationId: entry.operationId,
        error: `Missing required interactive-doc controls: ${unresolvedRequiredControls.join(", ")}`,
        hydrate,
      };
    }

    await client.call("Runtime.evaluate", {
      returnByValue: true,
      expression: `(() => {
        const operation = document.getElementById('operation/${plan.operationId}');
        const sendButton =
          operation.querySelector('[data-cy="send-button"]') ||
          Array.from(operation.querySelectorAll('button')).find((button) => {
            const label = String(button.textContent || '').trim().toLowerCase();
            return label === 'send' || label === 'resend';
          }) ||
          null;
        if (!sendButton) {
          return { ok: false, error: 'missing-send-button' };
        }
        sendButton.click();
        return { ok: true };
      })()`,
    });

    const captured = await waitForCapturedRequest(client, specMeta.method);
    if (!captured) {
      return {
        ok: false,
        entry: entry.key,
        operationId: entry.operationId,
        error: "No outbound API request was captured after Send.",
        hydrate,
      };
    }

    const parsedUrl = new URL(captured.url);
    const expectedPath = buildExpectedPath(specMeta.pathTemplate, {
      serviceProvider: SAMPLE_CONTEXT.serviceProviderId,
      code: SAMPLE_CONTEXT.sessionCode,
      mvpd: SAMPLE_CONTEXT.mvpd,
      partner: SAMPLE_CONTEXT.partner,
    });
    const body = parseCapturedBody(captured);
    const checks = [];

    checks.push(parsedUrl.pathname.endsWith(expectedPath));
    checks.push(String(captured.method || "").toUpperCase() === specMeta.method);

    if (plan.requiredFields.includes("header.Authorization")) {
      checks.push(Object.keys(captured.headers || {}).some((key) => key.toLowerCase() === "authorization"));
    }
    if (entry.usesDeviceHeaders === true) {
      checks.push(Object.keys(captured.headers || {}).some((key) => key.toLowerCase() === "ap-device-identifier"));
      checks.push(Object.keys(captured.headers || {}).some((key) => key.toLowerCase() === "x-device-info"));
    }
    if (entry.usesVisitorIdentifier === true) {
      checks.push(getCapturedHeaderValue(captured.headers, "AP-Visitor-Identifier") === SAMPLE_CONTEXT.visitorIdentifier);
    }
    if (entry.usesAdobeSubjectToken === true) {
      checks.push(getCapturedHeaderValue(captured.headers, "Adobe-Subject-Token") === SAMPLE_CONTEXT.adobeSubjectToken);
    }
    if (entry.usesAdServiceToken === true) {
      checks.push(getCapturedHeaderValue(captured.headers, "AD-Service-Token") === SAMPLE_CONTEXT.adServiceToken);
    }
    if (entry.usesTempPassIdentity === true) {
      checks.push(getCapturedHeaderValue(captured.headers, "AP-Temppass-Identity") === SAMPLE_CONTEXT.tempPassIdentity);
    }
    if (entry.usesPartnerFrameworkStatus === true) {
      checks.push(getCapturedHeaderValue(captured.headers, "AP-Partner-Framework-Status") === SAMPLE_CONTEXT.partnerFrameworkStatus);
    }
    if (entry.usesQueryRedirectUrl === true) {
      checks.push(
        String(parsedUrl.searchParams.get("redirectUrl") || "").trim() === String(plan.fieldValues["query.redirectUrl"] || "").trim()
      );
    }
    if (entry.usesBodyMvpd === true) {
      checks.push(body.mvpd === SAMPLE_CONTEXT.mvpd);
    }
    if (entry.usesBodyDomainName === true) {
      checks.push(body.domainName === SAMPLE_CONTEXT.domainName);
    }
    if (entry.usesBodyRedirectUrl === true) {
      checks.push(body.redirectUrl === String(plan.fieldValues["body.redirectUrl"] || "").trim());
    }
    if (entry.usesBodyResources === true) {
      const resources =
        Array.isArray(body.resources)
          ? body.resources
          : typeof body.resources === "string"
            ? (() => {
                try {
                  return JSON.parse(body.resources);
                } catch {
                  return [];
                }
              })()
            : [];
      checks.push(Array.isArray(resources) && resources[0] === SAMPLE_CONTEXT.resourceIds[0]);
    }
    if (entry.usesBodySamlResponse === true) {
      checks.push(body.SAMLResponse === SAMPLE_CONTEXT.samlResponse);
    }

    return {
      ok: checks.every(Boolean),
      entry: entry.key,
      operationId: entry.operationId,
      requestMethod: captured.method,
      requestUrl: captured.url,
      expectedPath,
      requestBody: body,
      missingControls,
      checks,
    };
  } finally {
    await client.close().catch(() => null);
    await closeDocsTarget(target.id);
  }
}

async function main() {
  const { REST_V2_INTERACTIVE_DOC_ENTRIES, buildRestV2InteractiveDocsHydrationPlan } = loadLearningRuntime();
  const popupSource = fs.readFileSync(POPUP_PATH, "utf8");
  const operationById = loadSpecByOperationId();
  const results = [];
  const total = REST_V2_INTERACTIVE_DOC_ENTRIES.length;
  let index = 0;
  for (const entry of REST_V2_INTERACTIVE_DOC_ENTRIES) {
    index += 1;
    console.error(`[restv2-live] ${index}/${total} ${entry.key}`);
    const specMeta = operationById.get(String(entry.operationId || "").trim());
    if (!specMeta) {
      results.push({
        ok: false,
        entry: entry.key,
        operationId: entry.operationId,
        error: `Spec is missing operation ${entry.operationId}.`,
      });
      continue;
    }
    const plan = buildRestV2InteractiveDocsHydrationPlan(entry, SAMPLE_CONTEXT, SAMPLE_ACCESS_TOKEN);
    const result = await hydrateAndSendOperation(entry, plan, specMeta, popupSource);
    results.push(result);
    console.error(`[restv2-live] ${entry.key}: ${result.ok === true ? "ok" : result.error || "failed"}`);
  }

  const failed = results.filter((result) => result.ok !== true);
  const payload = {
    total: results.length,
    failedCount: failed.length,
    failed,
    passed: results
      .filter((result) => result.ok === true)
      .map((result) => ({
        entry: result.entry,
        operationId: result.operationId,
        requestUrl: result.requestUrl,
      })),
  };
  console.log(JSON.stringify(payload, null, 2));
  if (failed.length > 0) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack || error.message : String(error));
  process.exitCode = 1;
});

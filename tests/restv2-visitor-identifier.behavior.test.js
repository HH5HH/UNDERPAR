const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const ROOT = path.resolve(__dirname, "..");
const POPUP_PATH = path.join(ROOT, "popup.js");

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

function loadVisitorIdentifierHelpers() {
  const source = fs.readFileSync(POPUP_PATH, "utf8");
  const script = [
    'const ADOBE_SP_BASE = "https://sp.auth.adobe.com";',
    "function firstNonEmptyString(values = []) { for (const value of Array.isArray(values) ? values : [values]) { if (value == null) { continue; } const normalized = String(value || '').trim(); if (normalized) { return normalized; } } return ''; }",
    "function normalizeRestV2PartnerFrameworkStatusForRequest(value = '') { return String(value || '').trim(); }",
    "function normalizeRestV2TempPassIdentityForRequest(value = '') { return String(value || '').trim(); }",
    extractFunctionSource(source, "parseJsonText"),
    extractFunctionSource(source, "normalizeRestV2ProfileAttributeValue"),
    extractFunctionSource(source, "dedupeRestV2CandidateStrings"),
    extractFunctionSource(source, "decodeBase64TextSafe"),
    extractFunctionSource(source, "getRestV2CaseInsensitiveObjectValue"),
    extractFunctionSource(source, "getRestV2CaseInsensitiveHeaderValue"),
    extractFunctionSource(source, "collectRestV2CaseInsensitiveObjectValues"),
    extractFunctionSource(source, "getRestV2InteractiveDocsHeaderAliasCandidates"),
    extractFunctionSource(source, "decodeURIComponentSafe"),
    extractFunctionSource(source, "extractRestV2VisitorIdentifierFromCarrierValue"),
    extractFunctionSource(source, "normalizeRestV2VisitorIdentifierForRequest"),
    extractFunctionSource(source, "normalizeRestV2InteractiveDocsHeaderCandidate"),
    extractFunctionSource(source, "getRestV2InteractiveDocsContextPropertyForHeader"),
    extractFunctionSource(source, "resolveRestV2InteractiveDocsHeaderValueFromContext"),
    extractFunctionSource(source, "extractRestV2CookieValueFromCookieText"),
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
    extractFunctionSource(source, "extractRestV2VisitorIdentifierFromDebugFlow"),
    extractFunctionSource(source, "extractRestV2InteractiveDocsHeaderValueFromDebugFlow"),
    extractFunctionSource(source, "hydrateRestV2InteractiveDocsOptionalHeadersFromDebugFlow"),
    "module.exports = { normalizeRestV2VisitorIdentifierForRequest, getRestV2CaseInsensitiveHeaderValue, extractRestV2VisitorIdentifierFromDebugFlow, extractRestV2InteractiveDocsHeaderValueFromDebugFlow, hydrateRestV2InteractiveDocsOptionalHeadersFromDebugFlow };",
  ].join("\n\n");
  const context = {
    module: { exports: {} },
    exports: {},
    atob,
    btoa,
    unescape,
    encodeURIComponent,
    Headers,
  };
  vm.runInNewContext(script, context, { filename: POPUP_PATH });
  return context.module.exports;
}

test("REST V2 visitor identifier normalization extracts ECID from Experience Cloud carriers", () => {
  const { normalizeRestV2VisitorIdentifierForRequest } = loadVisitorIdentifierHelpers();
  const ecid = "20265673158980419722735089753036633573";

  assert.equal(normalizeRestV2VisitorIdentifierForRequest(`MCMID|${ecid}`), ecid);
  assert.equal(
    normalizeRestV2VisitorIdentifierForRequest(`-12345%7CMCIDTS%7C20443%7CMCMID%7C${ecid}%7CMCAAMLH-12345%7C6`),
    ecid
  );
  assert.equal(
    normalizeRestV2VisitorIdentifierForRequest(JSON.stringify({ visitorIdentifier: ecid })),
    ecid
  );
});

test("REST V2 visitor identifier hydrates from debug-flow cookies when no literal header was retained", () => {
  const {
    extractRestV2VisitorIdentifierFromDebugFlow,
    extractRestV2InteractiveDocsHeaderValueFromDebugFlow,
    hydrateRestV2InteractiveDocsOptionalHeadersFromDebugFlow,
  } = loadVisitorIdentifierHelpers();
  const ecid = "20265673158980419722735089753036633573";
  const flow = {
    flowId: "flow-visitor-123",
    events: [
      {
        source: "web-request",
        phase: "cookies-snapshot",
        cookies: [
          {
            name: "AMCV_1FD6776A524453CC0A490D44%40AdobeOrg",
            value: `-12345%7CMCIDTS%7C20443%7CMCMID%7C${ecid}%7CMCAAMLH-12345%7C6`,
          },
        ],
      },
      {
        source: "extension",
        phase: "profile-check",
        cookieHeaders: [`foo=bar; s_ecid=MCMID|${ecid}; path=/; Secure`],
      },
    ],
  };
  const context = {
    visitorIdentifier: "",
  };

  assert.equal(extractRestV2VisitorIdentifierFromDebugFlow(flow), ecid);
  assert.equal(extractRestV2InteractiveDocsHeaderValueFromDebugFlow(flow, "AP-Visitor-Identifier"), ecid);
  hydrateRestV2InteractiveDocsOptionalHeadersFromDebugFlow(context, flow, ["AP-Visitor-Identifier"]);
  assert.equal(context.visitorIdentifier, ecid);
});

test("REST V2 optional headers hydrate from array-backed formData captures", () => {
  const { extractRestV2InteractiveDocsHeaderValueFromDebugFlow, hydrateRestV2InteractiveDocsOptionalHeadersFromDebugFlow } =
    loadVisitorIdentifierHelpers();
  const flow = {
    flowId: "flow-header-formdata-123",
    events: [
      {
        source: "web-request",
        phase: "onBeforeRequest",
        requestBody: {
          formData: {
            adobeSubjectToken: ["subject-token-123"],
            adServiceToken: ["service-token-456"],
            tempPassIdentity: ["temp-pass-identity-789"],
          },
        },
      },
    ],
  };
  const context = {
    adobeSubjectToken: "",
    adServiceToken: "",
    tempPassIdentity: "",
  };

  assert.equal(
    extractRestV2InteractiveDocsHeaderValueFromDebugFlow(flow, "Adobe-Subject-Token"),
    "subject-token-123"
  );
  assert.equal(
    extractRestV2InteractiveDocsHeaderValueFromDebugFlow(flow, "AD-Service-Token"),
    "service-token-456"
  );
  assert.equal(
    extractRestV2InteractiveDocsHeaderValueFromDebugFlow(flow, "AP-Temppass-Identity"),
    "temp-pass-identity-789"
  );

  hydrateRestV2InteractiveDocsOptionalHeadersFromDebugFlow(context, flow, [
    "Adobe-Subject-Token",
    "AD-Service-Token",
    "AP-Temppass-Identity",
  ]);
  assert.equal(context.adobeSubjectToken, "subject-token-123");
  assert.equal(context.adServiceToken, "service-token-456");
  assert.equal(context.tempPassIdentity, "temp-pass-identity-789");
});

test("REST V2 optional headers hydrate from request preview text carriers", () => {
  const { extractRestV2InteractiveDocsHeaderValueFromDebugFlow, hydrateRestV2InteractiveDocsOptionalHeadersFromDebugFlow } =
    loadVisitorIdentifierHelpers();
  const flow = {
    flowId: "flow-header-preview-456",
    events: [
      {
        source: "tab-network",
        phase: "request",
        postDataPreview:
          "Adobe-Subject-Token=subject-token-abc&AD-Service-Token=service-token-def&AP-Temppass-Identity=temp-pass-ghi",
      },
    ],
  };
  const context = {
    adobeSubjectToken: "",
    adServiceToken: "",
    tempPassIdentity: "",
  };

  assert.equal(
    extractRestV2InteractiveDocsHeaderValueFromDebugFlow(flow, "Adobe-Subject-Token"),
    "subject-token-abc"
  );
  assert.equal(
    extractRestV2InteractiveDocsHeaderValueFromDebugFlow(flow, "AD-Service-Token"),
    "service-token-def"
  );
  assert.equal(
    extractRestV2InteractiveDocsHeaderValueFromDebugFlow(flow, "AP-Temppass-Identity"),
    "temp-pass-ghi"
  );

  hydrateRestV2InteractiveDocsOptionalHeadersFromDebugFlow(context, flow, [
    "Adobe-Subject-Token",
    "AD-Service-Token",
    "AP-Temppass-Identity",
  ]);
  assert.equal(context.adobeSubjectToken, "subject-token-abc");
  assert.equal(context.adServiceToken, "service-token-def");
  assert.equal(context.tempPassIdentity, "temp-pass-ghi");
});

test("REST V2 case-insensitive header lookup accepts header entry arrays", () => {
  const { getRestV2CaseInsensitiveHeaderValue } = loadVisitorIdentifierHelpers();

  assert.equal(
    getRestV2CaseInsensitiveHeaderValue(
      [
        {
          name: "AD-Service-Token",
          value: ["service-token-456"],
        },
      ],
      ["ad-service-token"]
    ),
    "service-token-456"
  );
});

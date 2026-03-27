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
  assert.notEqual(paramsStart, -1, `Unable to locate params for ${functionName}`);
  let paramsDepth = 0;
  let bodyStart = -1;
  for (let index = paramsStart; index < source.length; index += 1) {
    const char = source[index];
    if (char === "(") {
      paramsDepth += 1;
    }
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
    if (char === "{") {
      depth += 1;
    }
    if (char === "}") {
      depth -= 1;
      if (depth === 0) {
        return source.slice(start, index + 1);
      }
    }
  }
  throw new Error(`Unterminated function: ${functionName}`);
}

function loadPartnerSsoOverrideHelpers(seed = {}) {
  const source = fs.readFileSync(POPUP_PATH, "utf8");
  const script = [
    "function firstNonEmptyString(values = []) { for (const value of Array.isArray(values) ? values : [values]) { if (value == null) { continue; } const normalized = String(value || '').trim(); if (normalized) { return normalized; } } return ''; }",
    "function getRequestorScopedMvpdCache(requestorId = '') { if (typeof globalThis.__seed.getRequestorScopedMvpdCache !== 'function') { return null; } const cache = globalThis.__seed.getRequestorScopedMvpdCache(requestorId); if (cache instanceof Map) { return cache; } if (cache && typeof cache.entries === 'function') { return new Map(Array.from(cache.entries())); } if (Array.isArray(cache)) { return new Map(cache); } return null; }",
    "function uniquePreserveOrder(values = []) { const output = []; const seen = new Set(); (Array.isArray(values) ? values : []).forEach((value) => { const normalized = String(value || '').trim(); if (!normalized || seen.has(normalized)) { return; } seen.add(normalized); output.push(normalized); }); return output; }",
    extractFunctionSource(source, "normalizeRestV2PartnerSsoPlatformName"),
    extractFunctionSource(source, "normalizeRestV2MvpdMatchToken"),
    extractFunctionSource(source, "scoreRestV2PartnerProviderIdCandidate"),
    extractFunctionSource(source, "rankRestV2PartnerProviderIdCandidates"),
    extractFunctionSource(source, "buildRestV2RequestorScopedPartnerProviderId"),
    extractFunctionSource(source, "collectRestV2RequestorScopedPartnerProviderIdCandidates"),
    extractFunctionSource(source, "getRestV2MvpdMeta"),
    "function getRestV2MvpdPickerLabel(requestorId = '', mvpdId = '', mvpdMeta = null) { const resolvedMeta = getRestV2MvpdMeta(requestorId, mvpdId, mvpdMeta); return String(resolvedMeta?.name || mvpdId || '').trim() || 'MVPD'; }",
    "function resolveRestV2LearningPartnerNameFromContext(context = null) { return String(context?.learningPartner || context?.partner || '').trim(); }",
    "function resolveRestV2PartnerNameFromContext(context = null) { return String(context?.partner || context?.sessionPartner || '').trim(); }",
    extractFunctionSource(source, "parseJsonText"),
    extractFunctionSource(source, "normalizeRestV2ProfileAttributeValue"),
    extractFunctionSource(source, "dedupeRestV2CandidateStrings"),
    extractFunctionSource(source, "decodeBase64TextSafe"),
    extractFunctionSource(source, "getRestV2CaseInsensitiveObjectValue"),
    extractFunctionSource(source, "decodeURIComponentSafe"),
    extractFunctionSource(source, "parseRestV2PartnerFrameworkStatusPayload"),
    extractFunctionSource(source, "resolveRestV2PartnerFrameworkStatusProviderId"),
    extractFunctionSource(source, "collectRestV2PartnerProviderIdCandidatesFromMvpdMeta"),
    extractFunctionSource(source, "resolveRestV2ExpectedPartnerFrameworkProviderIds"),
    extractFunctionSource(source, "resolveRestV2ExpectedPartnerFrameworkProviderId"),
    extractFunctionSource(source, "resolveRestV2PartnerFrameworkStatusSummary"),
    extractFunctionSource(source, "isRestV2PartnerFrameworkStatusUsable"),
    extractFunctionSource(source, "normalizeRestV2PartnerFrameworkStatusForRequest"),
    extractFunctionSource(source, "buildRestV2MvpdMatchTokens"),
    extractFunctionSource(source, "isRestV2MvpdMatch"),
    extractFunctionSource(source, "resolveRestV2PartnerFromFrameworkStatus"),
    extractFunctionSource(source, "isRestV2PartnerFrameworkStatusCompatibleWithContext"),
    extractFunctionSource(source, "stringifyRestV2PartnerFrameworkStatusPayload"),
    extractFunctionSource(source, "encodeRestV2PartnerFrameworkStatusPayload"),
    extractFunctionSource(source, "resolveRestV2MvpdMetaForPartnerFrameworkProviderId"),
    extractFunctionSource(source, "base64EncodeUtf8"),
    extractFunctionSource(source, "decodeSimpleHtmlEntities"),
    extractFunctionSource(source, "normalizeRestV2SamlResponseForPartnerProfile"),
    extractFunctionSource(source, "validateRestV2PartnerFrameworkStatusInput"),
    extractFunctionSource(source, "hydrateRestV2ContextFromPartnerSsoOverride"),
    "module.exports = { validateRestV2PartnerFrameworkStatusInput, hydrateRestV2ContextFromPartnerSsoOverride, isRestV2PartnerFrameworkStatusCompatibleWithContext };",
  ].join("\n\n");
  const context = {
    module: { exports: {} },
    exports: {},
    __seed: seed,
    atob,
    btoa,
    unescape,
    encodeURIComponent,
  };
  vm.runInNewContext(script, context, { filename: POPUP_PATH });
  return context.module.exports;
}

function buildMvpdCache() {
  return new Map([
    [
      "Comcast_SSO",
      {
        id: "Comcast_SSO",
        name: "Xfinity (Comcast_SSO)",
        platformMappingId: "Comcast_SSO",
        partnerPlatformMappings: {
          Apple: "Comcast_SSO_Apple",
        },
        partnerPlatformSettingIds: {
          Apple: ["Comcast_SSO_Apple"],
        },
        partnerProviderIdCandidates: {
          Apple: ["Comcast_SSO_Apple"],
        },
      },
    ],
  ]);
}

test("raw Partner Framework Status JSON validates and encodes to the exact compact payload", () => {
  const { validateRestV2PartnerFrameworkStatusInput } = loadPartnerSsoOverrideHelpers({
    getRequestorScopedMvpdCache(requestorId = "") {
      return String(requestorId || "").trim() === "MML" ? buildMvpdCache() : null;
    },
  });
  const rawPartnerFrameworkStatus = JSON.stringify(
    {
      frameworkPermissionInfo: {
        accessStatus: "granted",
        inferenceMode: "underpar-learning",
      },
      frameworkProviderInfo: {
        id: "Comcast_SSO_Apple",
        expirationDate: "1775748018000",
      },
      frameworkPartnerInfo: {
        partner: "Apple",
        name: "Apple",
      },
    },
    null,
    2
  );

  const validation = validateRestV2PartnerFrameworkStatusInput(rawPartnerFrameworkStatus, {
    context: {
      requestorId: "MML",
      serviceProviderId: "MML",
      mvpd: "Comcast_SSO",
      learningPartner: "Apple",
    },
    requiredPartner: "Apple",
  });

  assert.equal(validation.ok, true);
  assert.equal(validation.providerId, "Comcast_SSO_Apple");
  assert.equal(validation.partnerName, "Apple");
  assert.equal(validation.mvpdId, "Comcast_SSO");
  assert.equal(
    Buffer.from(validation.encodedValue, "base64").toString("utf8"),
    validation.compactJson
  );
});

test("requestor-scoped provider ids validate for Apple partner SSO and resolve back to the selected MVPD", () => {
  const { validateRestV2PartnerFrameworkStatusInput } = loadPartnerSsoOverrideHelpers({
    getRequestorScopedMvpdCache(requestorId = "") {
      return String(requestorId || "").trim() === "MML" ? buildMvpdCache() : null;
    },
  });
  const rawPartnerFrameworkStatus = JSON.stringify({
    frameworkPermissionInfo: {
      accessStatus: "granted",
    },
    frameworkProviderInfo: {
      id: "MML_Comcast_SSO",
      expirationDate: "1775748018000",
    },
    frameworkPartnerInfo: {
      partner: "Apple",
      name: "Apple",
    },
  });

  const validation = validateRestV2PartnerFrameworkStatusInput(rawPartnerFrameworkStatus, {
    context: {
      requestorId: "MML",
      serviceProviderId: "MML",
      mvpd: "Comcast_SSO",
      learningPartner: "Apple",
    },
    requiredPartner: "Apple",
  });

  assert.equal(validation.ok, true);
  assert.equal(validation.providerId, "MML_Comcast_SSO");
  assert.equal(validation.mvpdId, "Comcast_SSO");
});

test("generic provider ids are rejected for Apple partner SSO when the MVPD mapping expects a partner-specific id", () => {
  const { validateRestV2PartnerFrameworkStatusInput } = loadPartnerSsoOverrideHelpers({
    getRequestorScopedMvpdCache(requestorId = "") {
      return String(requestorId || "").trim() === "MML" ? buildMvpdCache() : null;
    },
  });
  const rawPartnerFrameworkStatus = JSON.stringify({
    frameworkPermissionInfo: {
      accessStatus: "granted",
    },
    frameworkProviderInfo: {
      id: "Comcast_SSO",
      expirationDate: "1775748018000",
    },
    frameworkPartnerInfo: {
      partner: "Apple",
      name: "Apple",
    },
  });

  const validation = validateRestV2PartnerFrameworkStatusInput(rawPartnerFrameworkStatus, {
    context: {
      requestorId: "MML",
      serviceProviderId: "MML",
      mvpd: "Comcast_SSO",
      learningPartner: "Apple",
    },
    requiredPartner: "Apple",
  });

  assert.equal(validation.ok, false);
  assert.match(validation.error, /not associated with a known MVPD|does not match the configured Apple mapping/i);
});

test("platform setting ids validate for Apple partner SSO even when the stored mapping id stays generic", () => {
  const { validateRestV2PartnerFrameworkStatusInput } = loadPartnerSsoOverrideHelpers({
    getRequestorScopedMvpdCache(requestorId = "") {
      if (String(requestorId || "").trim() !== "MML") {
        return null;
      }
      return new Map([
        [
          "Comcast_SSO",
          {
            id: "Comcast_SSO",
            name: "Xfinity (Comcast_SSO)",
            platformMappingId: "Comcast_SSO_Apple",
            partnerPlatformMappings: {
              Apple: "Comcast",
            },
            partnerPlatformSettingIds: {
              Apple: ["Comcast_SSO_Apple"],
            },
            partnerProviderIdCandidates: {
              Apple: ["Comcast_SSO_Apple", "Comcast"],
            },
          },
        ],
      ]);
    },
  });
  const rawPartnerFrameworkStatus = JSON.stringify({
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
  });

  const validation = validateRestV2PartnerFrameworkStatusInput(rawPartnerFrameworkStatus, {
    context: {
      requestorId: "MML",
      serviceProviderId: "MML",
      mvpd: "Comcast_SSO",
      learningPartner: "Apple",
    },
    requiredPartner: "Apple",
  });

  assert.equal(validation.ok, true);
  assert.equal(validation.providerId, "Comcast_SSO_Apple");
  assert.equal(validation.mvpdId, "Comcast_SSO");
});

test("runtime-resolved partner provider ids override a generic mapping id for Apple partner SSO validation", () => {
  const { validateRestV2PartnerFrameworkStatusInput } = loadPartnerSsoOverrideHelpers({
    getRequestorScopedMvpdCache(requestorId = "") {
      if (String(requestorId || "").trim() !== "MML") {
        return null;
      }
      return new Map([
        [
          "Verizon",
          {
            id: "Verizon",
            name: "Verizon",
            platformMappingId: "Verizon",
          },
        ],
      ]);
    },
  });
  const rawPartnerFrameworkStatus = JSON.stringify({
    frameworkPermissionInfo: {
      accessStatus: "granted",
    },
    frameworkProviderInfo: {
      id: "Verizon_Apple",
      expirationDate: "1775748018000",
    },
    frameworkPartnerInfo: {
      partner: "Apple",
      name: "Apple",
    },
  });

  const validation = validateRestV2PartnerFrameworkStatusInput(rawPartnerFrameworkStatus, {
    context: {
      requestorId: "MML",
      serviceProviderId: "MML",
      mvpd: "Verizon",
      learningPartner: "Apple",
      mvpdPlatformMappingId: "Verizon",
      mvpdPartnerProviderId: "Verizon_Apple",
    },
    requiredPartner: "Apple",
  });

  assert.equal(validation.ok, true);
  assert.equal(validation.providerId, "Verizon_Apple");
  assert.equal(validation.mvpdId, "Verizon");
});

test("partner framework compatibility derives Apple from the payload when context has not promoted learningPartner yet", () => {
  const { isRestV2PartnerFrameworkStatusCompatibleWithContext } = loadPartnerSsoOverrideHelpers({
    getRequestorScopedMvpdCache(requestorId = "") {
      return String(requestorId || "").trim() === "MML" ? buildMvpdCache() : null;
    },
  });
  const genericFrameworkStatus = Buffer.from(
    JSON.stringify({
      frameworkPermissionInfo: {
        accessStatus: "granted",
      },
      frameworkProviderInfo: {
        id: "Comcast_SSO",
        expirationDate: "1775748018000",
      },
      frameworkPartnerInfo: {
        partner: "Apple",
        name: "Apple",
      },
    }),
    "utf8"
  ).toString("base64");
  const mappedFrameworkStatus = Buffer.from(
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
  const baseContext = {
    requestorId: "MML",
    serviceProviderId: "MML",
    mvpd: "Comcast_SSO",
    mvpdMeta: {
      id: "Comcast_SSO",
      name: "Xfinity (Comcast_SSO)",
      platformMappingId: "Comcast_SSO",
      partnerPlatformMappings: {
        Apple: "Comcast_SSO_Apple",
      },
    },
  };

  assert.equal(isRestV2PartnerFrameworkStatusCompatibleWithContext(genericFrameworkStatus, baseContext), false);
  assert.equal(isRestV2PartnerFrameworkStatusCompatibleWithContext(mappedFrameworkStatus, baseContext), true);
});

test("unknown provider ids are rejected for Apple partner SSO when no MVPD mapping is known", () => {
  const { validateRestV2PartnerFrameworkStatusInput } = loadPartnerSsoOverrideHelpers({
    getRequestorScopedMvpdCache(requestorId = "") {
      return String(requestorId || "").trim() === "MML" ? buildMvpdCache() : null;
    },
  });
  const rawPartnerFrameworkStatus = JSON.stringify({
    frameworkPermissionInfo: {
      accessStatus: "granted",
    },
    frameworkProviderInfo: {
      id: "Comcast_SSO_Apple_Unmapped",
      expirationDate: "1775748018000",
    },
    frameworkPartnerInfo: {
      partner: "Apple",
      name: "Apple",
    },
  });

  const validation = validateRestV2PartnerFrameworkStatusInput(rawPartnerFrameworkStatus, {
    context: {
      requestorId: "MML",
      serviceProviderId: "MML",
      mvpd: "Comcast_SSO",
      learningPartner: "Apple",
    },
    requiredPartner: "Apple",
  });

  assert.equal(validation.ok, false);
  assert.match(validation.error, /not associated with a known MVPD/i);
});

test("partner framework provider ids are not resolved from the bare MVPD id when no platform mapping is configured", () => {
  const { validateRestV2PartnerFrameworkStatusInput } = loadPartnerSsoOverrideHelpers({
    getRequestorScopedMvpdCache(requestorId = "") {
      if (String(requestorId || "").trim() !== "MML") {
        return null;
      }
      return new Map([
        [
          "Comcast_SSO",
          {
            id: "Comcast_SSO",
            name: "Xfinity (Comcast_SSO)",
          },
        ],
      ]);
    },
  });
  const rawPartnerFrameworkStatus = JSON.stringify({
    frameworkPermissionInfo: {
      accessStatus: "granted",
    },
    frameworkProviderInfo: {
      id: "Comcast_SSO",
      expirationDate: "1775748018000",
    },
    frameworkPartnerInfo: {
      partner: "Apple",
      name: "Apple",
    },
  });

  const validation = validateRestV2PartnerFrameworkStatusInput(rawPartnerFrameworkStatus, {
    context: {
      requestorId: "MML",
      serviceProviderId: "MML",
      mvpd: "Comcast_SSO",
      learningPartner: "Apple",
    },
    requiredPartner: "Apple",
  });

  assert.equal(validation.ok, false);
  assert.match(validation.error, /not associated with a known MVPD/i);
});

test("encoded partner framework headers are rejected in the raw JSON form", () => {
  const { validateRestV2PartnerFrameworkStatusInput } = loadPartnerSsoOverrideHelpers();
  const encodedValue = Buffer.from(
    JSON.stringify({
      frameworkPermissionInfo: {
        accessStatus: "granted",
      },
      frameworkProviderInfo: {
        id: "Comcast_SSO_Apple",
      },
      frameworkPartnerInfo: {
        partner: "Apple",
      },
    }),
    "utf8"
  ).toString("base64");

  const validation = validateRestV2PartnerFrameworkStatusInput(encodedValue, {
    requiredPartner: "Apple",
  });

  assert.equal(validation.ok, false);
  assert.match(validation.error, /Paste raw Partner Framework Status JSON/i);
});

test("manual Partner SSO overrides block captured framework headers and normalize raw XML SAMLResponse", () => {
  const { hydrateRestV2ContextFromPartnerSsoOverride } = loadPartnerSsoOverrideHelpers({
    getRequestorScopedMvpdCache(requestorId = "") {
      return String(requestorId || "").trim() === "MML" ? buildMvpdCache() : null;
    },
  });
  const context = {
    requestorId: "MML",
    serviceProviderId: "MML",
    mvpd: "Comcast_SSO",
    learningPartner: "Apple",
    partnerFrameworkStatus: "captured-framework-token",
    samlResponse: "",
  };

  hydrateRestV2ContextFromPartnerSsoOverride(context, {
    override: {
      partnerFrameworkStatusJson: Buffer.from(
        JSON.stringify({
          frameworkPermissionInfo: {
            accessStatus: "granted",
          },
          frameworkProviderInfo: {
            id: "Comcast_SSO_Apple",
          },
          frameworkPartnerInfo: {
            partner: "Apple",
          },
        }),
        "utf8"
      ).toString("base64"),
      samlResponse: "<samlp:Response>partner</samlp:Response>",
    },
  });

  assert.equal(context.partnerFrameworkStatusOverrideBlocked, true);
  assert.equal(context.partnerFrameworkStatus, "");
  assert.equal(context.partnerFrameworkStatusValidation.ok, false);
  assert.match(context.partnerFrameworkStatusValidation.error, /Paste raw Partner Framework Status JSON/i);
  assert.match(Buffer.from(context.samlResponse, "base64").toString("utf8"), /partner/);
  assert.equal(context.samlSource, "REST V2 test form");
});

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const ROOT = path.resolve(__dirname, "..");

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

function loadHrVisibilityHelpers(seed = {}) {
  const filePath = path.join(ROOT, "popup.js");
  const source = fs.readFileSync(filePath, "utf8");
  const script = [
    'const DEFAULT_ADOBEPASS_ENVIRONMENT = { key: "production" };',
    'const PREMIUM_SERVICE_DISPLAY_ORDER = ["restV2", "esmWorkspace", "degradation", "resetTempPass", "cm", "cmMvpd"];',
    "const state = globalThis.__seed.state || { programmerWorkspaceHydrationReadyByKey: new Map(), cmServiceByProgrammerId: new Map() };",
    "function getActiveAdobePassEnvironmentKey() { return globalThis.__seed.environmentKey || DEFAULT_ADOBEPASS_ENVIRONMENT.key; }",
    "function getActiveAdobePassEnvironment() { return globalThis.__seed.environment || DEFAULT_ADOBEPASS_ENVIRONMENT; }",
    "function getRawDetectedPremiumServiceKeys(services = null) { return typeof globalThis.__seed.getRawDetectedPremiumServiceKeys === 'function' ? globalThis.__seed.getRawDetectedPremiumServiceKeys(services) : (Object.entries(services && typeof services === 'object' ? services : {}).filter(([key, value]) => { const normalizedKey = String(key || '').trim(); if (!normalizedKey || normalizedKey.endsWith('Apps')) { return false; } if (normalizedKey === 'cm') { return Array.isArray(value?.matchedTenants) && value.matchedTenants.length > 0; } return Boolean(value && typeof value === 'object'); }).map(([key]) => String(key || '').trim())); }",
    "function isPremiumServiceSupportedInEnvironment() { return true; }",
    "function hasPassVaultCredentialCoverageForServices() { return globalThis.__seed.hasCredentialCoverage !== false; }",
    "function getPassVaultMediaCompanyRecord() { return globalThis.__seed.passVaultRecord || null; }",
    "function buildPassVaultRuntimeCmServiceSnapshot() { return globalThis.__seed.passVaultCmService || null; }",
    extractFunctionSource(source, "getEnvironmentScopedProgrammerKey"),
    extractFunctionSource(source, "getProgrammerWorkspaceHydrationReadyKey"),
    extractFunctionSource(source, "isProgrammerWorkspaceHydrationReady"),
    extractFunctionSource(source, "isProgrammerRuntimeServicesReady"),
    extractFunctionSource(source, "hasResolvedCmAvailabilityForProgrammer"),
    extractFunctionSource(source, "isProgrammerHrContextHydrationReady"),
    extractFunctionSource(source, "hasEsmScopedApp"),
    extractFunctionSource(source, "shouldShowCmService"),
    extractFunctionSource(source, "getDetectedPremiumServiceKeys"),
    extractFunctionSource(source, "shouldRevealHrContextSections"),
    "module.exports = { shouldRevealHrContextSections };",
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
  vm.runInNewContext(script, context, { filename: filePath });
  return context.module.exports;
}

function loadHrContextSectionDisplayHelpers(seed = {}) {
  const filePath = path.join(ROOT, "popup.js");
  const source = fs.readFileSync(filePath, "utf8");
  const script = [
    'const HR_CONTEXT_SECTION_DISPLAY_ORDER = ["health", "learning", "harpo"];',
    "const state = globalThis.__seed.state || {};",
    "function firstNonEmptyString(values = []) { for (const value of Array.isArray(values) ? values : [values]) { const normalized = String(value || '').trim(); if (normalized) { return normalized; } } return ''; }",
    "function uniquePreserveOrder(values = []) { const seen = new Set(); const output = []; (Array.isArray(values) ? values : [values]).forEach((value) => { const normalized = String(value || '').trim(); if (!normalized || seen.has(normalized)) { return; } seen.add(normalized); output.push(normalized); }); return output; }",
    "function normalizeEntityToken(value = '') { return String(value || '').trim().toLowerCase().replace(/^@serviceprovider:/, ''); }",
    "function extractEntityIdFromToken(value = '') { const normalized = String(value || '').trim(); return normalized.replace(/^@ServiceProvider:/i, ''); }",
    "function collectRestV2LearningRequestorCandidates() { return Array.isArray(globalThis.__seed.requestorCandidates) ? globalThis.__seed.requestorCandidates : []; }",
    "function collectRestV2LearningRequestorDomainNames(programmer = null, requestorId = '') { if (typeof globalThis.__seed.collectDomains === 'function') { return globalThis.__seed.collectDomains(programmer, requestorId); } return []; }",
    extractFunctionSource(source, "collectHarpoProgrammerDomainNames"),
    extractFunctionSource(source, "shouldShowHarpoHrSection"),
    extractFunctionSource(source, "getHrContextSectionDisplayKeys"),
    "module.exports = { collectHarpoProgrammerDomainNames, shouldShowHarpoHrSection, getHrContextSectionDisplayKeys };",
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
  vm.runInNewContext(script, context, { filename: filePath });
  return context.module.exports;
}

function loadPopupLearningJwtInspectorUtility(sharedUtility = null) {
  const filePath = path.join(ROOT, "popup.js");
  const source = fs.readFileSync(filePath, "utf8");
  const script = [
    "let learningJwtInspectorFallbackUtility = null;",
    extractFunctionSource(source, "escapeHtml"),
    extractFunctionSource(source, "parseJsonText"),
    extractFunctionSource(source, "decodeBase64UrlText"),
    extractFunctionSource(source, "chunkLearningInspectorText"),
    extractFunctionSource(source, "firstNonEmptyString"),
    extractFunctionSource(source, "buildLearningJwtInspectorFallbackUtility"),
    extractFunctionSource(source, "getLearningJwtInspectorUtility"),
    "globalThis.UnderParJwtInspector = globalThis.__sharedUtility;",
    "module.exports = { buildLearningJwtInspectorFallbackUtility, getLearningJwtInspectorUtility };",
  ].join("\n\n");
  const context = {
    module: { exports: {} },
    exports: {},
    __sharedUtility: sharedUtility,
    atob,
    btoa,
    unescape,
    encodeURIComponent,
    TextDecoder,
  };
  vm.runInNewContext(script, context, { filename: filePath });
  return context.module.exports;
}

function loadRestV2LearningPlanBuilder() {
  const filePath = path.join(ROOT, "popup.js");
  const source = fs.readFileSync(filePath, "utf8");
  const script = [
    'const REST_V2_BASE = "https://api.example.test";',
    'const PREMIUM_SERVICE_DOCUMENTATION_URL_BY_KEY = { restV2: "https://developer.adobe.com/adobe-pass/api/rest_api_v2/interactive/" };',
    'function buildRestV2Headers() { return { "AP-Device-Identifier": "device-123", "X-Device-Info": "device-info-123" }; }',
    "function firstNonEmptyString(values = []) { for (const value of Array.isArray(values) ? values : [values]) { if (value == null) { continue; } const normalized = String(value || '').trim(); if (normalized) { return normalized; } } return ''; }",
    "function uniquePreserveOrder(values = []) { const output = []; const seen = new Set(); (Array.isArray(values) ? values : []).forEach((value) => { const normalized = String(value || '').trim(); if (!normalized || seen.has(normalized)) { return; } seen.add(normalized); output.push(normalized); }); return output; }",
    "function getRestV2MvpdMeta(requestorId = '', mvpdId = '', mvpdMeta = null) { return mvpdMeta || null; }",
    extractFunctionSource(source, "parseJsonText"),
    extractFunctionSource(source, "normalizeRestV2ProfileAttributeValue"),
    extractFunctionSource(source, "dedupeRestV2CandidateStrings"),
    extractFunctionSource(source, "decodeBase64TextSafe"),
    extractFunctionSource(source, "decodeURIComponentSafe"),
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
    extractFunctionSource(source, "buildRestV2RequestorScopedPartnerProviderId"),
    extractFunctionSource(source, "collectRestV2RequestorScopedPartnerProviderIdCandidates"),
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
    navigator: { userAgent: "UnderPAR test" },
    atob,
    btoa,
    unescape,
    encodeURIComponent,
    Headers,
  };
  vm.runInNewContext(script, context, { filename: filePath });
  return context.module.exports;
}

function loadDcrInteractiveDocsHydrationPlanBuilder(seed = {}) {
  const filePath = path.join(ROOT, "popup.js");
  const source = fs.readFileSync(filePath, "utf8");
  const script = [
    'const ADOBE_SP_BASE = "https://sp.auth.adobe.com";',
    'const DCR_API_DOCUMENTATION_URL = "https://developer.adobe.com/adobe-pass/api/dcr_api/interactive/";',
    "function getActiveAdobePassEnvironment() { return globalThis.__seed.environment || { spBase: ADOBE_SP_BASE }; }",
    "function firstNonEmptyString(values = []) { for (const value of Array.isArray(values) ? values : [values]) { if (value == null) { continue; } const normalized = String(value || '').trim(); if (normalized) { return normalized; } } return ''; }",
    extractFunctionSource(source, "buildDcrInteractiveDocsUrl"),
    extractFunctionSource(source, "buildDcrInteractiveDocsHydrationPlan"),
    "module.exports = { buildDcrInteractiveDocsHydrationPlan };",
  ].join("\n\n");
  const context = {
    module: { exports: {} },
    exports: {},
    __seed: seed,
  };
  vm.runInNewContext(script, context, { filename: filePath });
  return context.module.exports;
}

function loadRestV2MvpdMetaResolver(seed = {}) {
  const filePath = path.join(ROOT, "popup.js");
  const source = fs.readFileSync(filePath, "utf8");
  const script = [
    "function firstNonEmptyString(values = []) { for (const value of Array.isArray(values) ? values : [values]) { if (value == null) { continue; } const normalized = String(value || '').trim(); if (normalized) { return normalized; } } return ''; }",
    "function getRequestorScopedMvpdCache(requestorId = '') { return typeof globalThis.__seed.getRequestorScopedMvpdCache === 'function' ? globalThis.__seed.getRequestorScopedMvpdCache(requestorId) : null; }",
    "function uniquePreserveOrder(values = []) { const output = []; const seen = new Set(); (Array.isArray(values) ? values : []).forEach((value) => { const normalized = String(value || '').trim(); if (!normalized || seen.has(normalized)) { return; } seen.add(normalized); output.push(normalized); }); return output; }",
    extractFunctionSource(source, "normalizeRestV2PartnerSsoPlatformName"),
    extractFunctionSource(source, "normalizeRestV2MvpdMatchToken"),
    extractFunctionSource(source, "scoreRestV2PartnerProviderIdCandidate"),
    extractFunctionSource(source, "rankRestV2PartnerProviderIdCandidates"),
    extractFunctionSource(source, "getRestV2MvpdMeta"),
    "module.exports = { getRestV2MvpdMeta };",
  ].join("\n\n");
  const context = {
    module: { exports: {} },
    exports: {},
    __seed: seed,
  };
  vm.runInNewContext(script, context, { filename: filePath });
  return context.module.exports;
}

function loadRestV2PartnerPlatformMappingSnapshotResolver() {
  const filePath = path.join(ROOT, "popup.js");
  const source = fs.readFileSync(filePath, "utf8");
  const script = [
    "function uniquePreserveOrder(values = []) { const output = []; const seen = new Set(); (Array.isArray(values) ? values : []).forEach((value) => { const normalized = String(value || '').trim(); if (!normalized || seen.has(normalized)) { return; } seen.add(normalized); output.push(normalized); }); return output; }",
    extractFunctionSource(source, "inferRestV2LearningPartnerNameFromText"),
    extractFunctionSource(source, "normalizeRestV2PartnerSsoPlatformName"),
    extractFunctionSource(source, "normalizeRestV2MvpdMatchToken"),
    extractFunctionSource(source, "scoreRestV2PartnerProviderIdCandidate"),
    extractFunctionSource(source, "rankRestV2PartnerProviderIdCandidates"),
    extractFunctionSource(source, "resolveRestV2PartnerPlatformMappingDetailsFromSnapshot"),
    "module.exports = { resolveRestV2PartnerPlatformMappingDetailsFromSnapshot };",
  ].join("\n\n");
  const context = {
    module: { exports: {} },
    exports: {},
  };
  vm.runInNewContext(script, context, { filename: filePath });
  return context.module.exports;
}

function loadRestV2PartnerPlatformMappingHydrator(seed = {}) {
  const filePath = path.join(ROOT, "popup.js");
  const source = fs.readFileSync(filePath, "utf8");
  const script = [
    "function firstNonEmptyString(values = []) { for (const value of Array.isArray(values) ? values : [values]) { if (value == null) { continue; } const normalized = String(value || '').trim(); if (normalized) { return normalized; } } return ''; }",
    "function uniquePreserveOrder(values = []) { const output = []; const seen = new Set(); (Array.isArray(values) ? values : []).forEach((value) => { const normalized = String(value || '').trim(); if (!normalized || seen.has(normalized)) { return; } seen.add(normalized); output.push(normalized); }); return output; }",
    "function getRequestorScopedMvpdCache(requestorId = '') { return typeof globalThis.__seed.getRequestorScopedMvpdCache === 'function' ? globalThis.__seed.getRequestorScopedMvpdCache(requestorId) : null; }",
    "function setRequestorScopedMvpdCache(requestorId = '', value = null) { return typeof globalThis.__seed.setRequestorScopedMvpdCache === 'function' ? globalThis.__seed.setRequestorScopedMvpdCache(requestorId, value) : value; }",
    "function getRestV2MvpdMeta(requestorId = '', mvpdId = '', mvpdMeta = null) { return typeof globalThis.__seed.resolveMvpdMeta === 'function' ? globalThis.__seed.resolveMvpdMeta(requestorId, mvpdId, mvpdMeta) : mvpdMeta; }",
    "function resolveRestV2PartnerFrameworkStatusFromContext(context = null) { return typeof globalThis.__seed.resolveFrameworkStatus === 'function' ? globalThis.__seed.resolveFrameworkStatus(context) : String(context?.partnerFrameworkStatus || '').trim(); }",
    "function resolveRestV2PartnerNameFromContext(context = null) { return typeof globalThis.__seed.resolvePartnerName === 'function' ? globalThis.__seed.resolvePartnerName(context) : String(context?.partner || '').trim(); }",
    "function resolveRestV2LearningPartnerNameFromContext(context = null) { return typeof globalThis.__seed.resolveLearningPartnerName === 'function' ? globalThis.__seed.resolveLearningPartnerName(context) : String(context?.learningPartner || '').trim(); }",
    "async function mvpdWorkspaceEnsureSnapshot(selectionContext, options = {}) { return typeof globalThis.__seed.loadSnapshot === 'function' ? globalThis.__seed.loadSnapshot(selectionContext, options) : null; }",
    extractFunctionSource(source, "parseJsonText"),
    extractFunctionSource(source, "normalizeRestV2ProfileAttributeValue"),
    extractFunctionSource(source, "dedupeRestV2CandidateStrings"),
    extractFunctionSource(source, "decodeBase64TextSafe"),
    extractFunctionSource(source, "decodeURIComponentSafe"),
    extractFunctionSource(source, "parseRestV2PartnerFrameworkStatusPayload"),
    extractFunctionSource(source, "normalizeRestV2MvpdMatchToken"),
    extractFunctionSource(source, "scoreRestV2PartnerProviderIdCandidate"),
    extractFunctionSource(source, "rankRestV2PartnerProviderIdCandidates"),
    extractFunctionSource(source, "buildRestV2RequestorScopedPartnerProviderId"),
    extractFunctionSource(source, "collectRestV2RequestorScopedPartnerProviderIdCandidates"),
    extractFunctionSource(source, "collectRestV2PartnerProviderIdCandidatesFromMvpdMeta"),
    extractFunctionSource(source, "resolveRestV2PartnerFrameworkStatusProviderId"),
    extractFunctionSource(source, "inferRestV2LearningPartnerNameFromText"),
    extractFunctionSource(source, "normalizeRestV2PartnerSsoPlatformName"),
    extractFunctionSource(source, "resolveRestV2PartnerPlatformMappingDetailsFromSnapshot"),
    extractFunctionSource(source, "upsertRequestorScopedMvpdMeta"),
    extractFunctionSource(source, "hydrateRestV2PartnerPlatformMappingFromConsoleContext"),
    "module.exports = { hydrateRestV2PartnerPlatformMappingFromConsoleContext };",
  ].join("\n\n");
  const context = {
    module: { exports: {} },
    exports: {},
    __seed: seed,
  };
  vm.runInNewContext(script, context, { filename: filePath });
  return context.module.exports;
}

function loadRestV2LearningPartnerFrameworkStatusBuilder(seed = {}) {
  const filePath = path.join(ROOT, "popup.js");
  const source = fs.readFileSync(filePath, "utf8");
  const script = [
    "function firstNonEmptyString(values = []) { for (const value of Array.isArray(values) ? values : [values]) { if (value == null) { continue; } const normalized = String(value || '').trim(); if (normalized) { return normalized; } } return ''; }",
    "function getRestV2MvpdMeta(requestorId = '', mvpdId = '', mvpdMeta = null) { return typeof globalThis.__seed.resolveMvpdMeta === 'function' ? globalThis.__seed.resolveMvpdMeta(requestorId, mvpdId, mvpdMeta) : mvpdMeta; }",
    extractFunctionSource(source, "parseJsonText"),
    extractFunctionSource(source, "normalizeRestV2ProfileAttributeValue"),
    extractFunctionSource(source, "dedupeRestV2CandidateStrings"),
    extractFunctionSource(source, "decodeBase64TextSafe"),
    extractFunctionSource(source, "parseRestV2JwtPayload"),
    extractFunctionSource(source, "normalizeRestV2PartnerSsoPlatformName"),
    extractFunctionSource(source, "normalizeRestV2MvpdMatchToken"),
    extractFunctionSource(source, "scoreRestV2PartnerProviderIdCandidate"),
    extractFunctionSource(source, "rankRestV2PartnerProviderIdCandidates"),
    extractFunctionSource(source, "buildRestV2RequestorScopedPartnerProviderId"),
    extractFunctionSource(source, "collectRestV2RequestorScopedPartnerProviderIdCandidates"),
    extractFunctionSource(source, "collectRestV2PartnerProviderIdCandidatesFromMvpdMeta"),
    extractFunctionSource(source, "buildRestV2LearningPartnerFrameworkStatus"),
    "module.exports = { buildRestV2LearningPartnerFrameworkStatus };",
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
  vm.runInNewContext(script, context, { filename: filePath });
  return context.module.exports;
}

function loadRestV2LearningPartnerContextHydrator(seed = {}) {
  const filePath = path.join(ROOT, "popup.js");
  const source = fs.readFileSync(filePath, "utf8");
  const script = [
    "function firstNonEmptyString(values = []) { for (const value of Array.isArray(values) ? values : [values]) { if (value == null) { continue; } const normalized = String(value || '').trim(); if (normalized) { return normalized; } } return ''; }",
    "function getRestV2MvpdMeta(requestorId = '', mvpdId = '', mvpdMeta = null) { return typeof globalThis.__seed.resolveMvpdMeta === 'function' ? globalThis.__seed.resolveMvpdMeta(requestorId, mvpdId, mvpdMeta) : mvpdMeta; }",
    "function resolveRestV2PartnerNameFromContext(context = null) { return typeof globalThis.__seed.resolvePartnerName === 'function' ? globalThis.__seed.resolvePartnerName(context) : String(context?.partner || '').trim(); }",
    "function resolveRestV2PartnerFrameworkStatusFromContext(context = null) { return typeof globalThis.__seed.resolveFrameworkStatus === 'function' ? globalThis.__seed.resolveFrameworkStatus(context) : String(context?.partnerFrameworkStatus || '').trim(); }",
    "function normalizeRestV2PartnerFrameworkStatusForRequest(value = '') { return typeof globalThis.__seed.normalizeFrameworkStatus === 'function' ? globalThis.__seed.normalizeFrameworkStatus(value) : String(value || '').trim(); }",
    "function isRestV2PartnerFrameworkStatusUsable(value = '') { return typeof globalThis.__seed.isFrameworkStatusUsable === 'function' ? globalThis.__seed.isFrameworkStatusUsable(value) : Boolean(String(value || '').trim()); }",
    "function extractRestV2PartnerSsoLearningArtifactsFromDebugFlow(flow = null) { return typeof globalThis.__seed.extractArtifacts === 'function' ? globalThis.__seed.extractArtifacts(flow) : {}; }",
    "function inferRestV2LearningPartnerName(context = null, flow = null, artifacts = null) { return typeof globalThis.__seed.inferPartnerName === 'function' ? globalThis.__seed.inferPartnerName(context, flow, artifacts) : ''; }",
    "function buildRestV2LearningPartnerFrameworkStatus(context = null, flow = null, artifacts = null, partnerName = '') { return typeof globalThis.__seed.buildLearningFrameworkStatus === 'function' ? globalThis.__seed.buildLearningFrameworkStatus(context, flow, artifacts, partnerName) : ''; }",
    "function isRestV2PartnerFrameworkStatusCompatibleWithContext(value = '', context = null) { return typeof globalThis.__seed.isFrameworkStatusCompatible === 'function' ? globalThis.__seed.isFrameworkStatusCompatible(value, context) : Boolean(String(value || '').trim()); }",
    extractFunctionSource(source, "hydrateRestV2LearningPartnerSsoContextFromDebugFlow"),
    "module.exports = { hydrateRestV2LearningPartnerSsoContextFromDebugFlow };",
  ].join("\n\n");
  const context = {
    module: { exports: {} },
    exports: {},
    __seed: seed,
  };
  vm.runInNewContext(script, context, { filename: filePath });
  return context.module.exports;
}

function loadRestV2PartnerContextHydrator(seed = {}) {
  const filePath = path.join(ROOT, "popup.js");
  const source = fs.readFileSync(filePath, "utf8");
  const script = [
    "function firstNonEmptyString(values = []) { for (const value of Array.isArray(values) ? values : [values]) { if (value == null) { continue; } const normalized = String(value || '').trim(); if (normalized) { return normalized; } } return ''; }",
    "function uniquePreserveOrder(values = []) { const output = []; const seen = new Set(); (Array.isArray(values) ? values : []).forEach((value) => { const normalized = String(value || '').trim(); if (!normalized || seen.has(normalized)) { return; } seen.add(normalized); output.push(normalized); }); return output; }",
    "function getRestV2MvpdMeta(requestorId = '', mvpdId = '', mvpdMeta = null) { return typeof globalThis.__seed.resolveMvpdMeta === 'function' ? globalThis.__seed.resolveMvpdMeta(requestorId, mvpdId, mvpdMeta) : mvpdMeta; }",
    "function upsertRequestorScopedMvpdMeta(requestorId = '', mvpdId = '', mvpdMeta = null) { return typeof globalThis.__seed.upsertMvpdMeta === 'function' ? globalThis.__seed.upsertMvpdMeta(requestorId, mvpdId, mvpdMeta) : mvpdMeta; }",
    "function resolveRestV2PartnerFrameworkStatusFromContext(context = null) { return typeof globalThis.__seed.resolveFrameworkStatus === 'function' ? globalThis.__seed.resolveFrameworkStatus(context) : String(context?.partnerFrameworkStatus || context?.sessionData?.partnerFrameworkStatus || '').trim(); }",
    "function resolveRestV2PartnerNameFromContext(context = null) { return typeof globalThis.__seed.resolvePartnerName === 'function' ? globalThis.__seed.resolvePartnerName(context) : String(context?.partner || context?.sessionPartner || '').trim(); }",
    "function resolveRestV2LearningPartnerNameFromContext(context = null) { return typeof globalThis.__seed.resolveLearningPartnerName === 'function' ? globalThis.__seed.resolveLearningPartnerName(context) : String(context?.learningPartner || context?.partner || context?.sessionPartner || '').trim(); }",
    "function extractRestV2PartnerSsoLearningArtifactsFromDebugFlow(flow = null) { return typeof globalThis.__seed.extractArtifacts === 'function' ? globalThis.__seed.extractArtifacts(flow) : {}; }",
    "function extractRestV2PartnerFrameworkStatusFromDebugFlow(flow = null) { return typeof globalThis.__seed.extractFrameworkStatus === 'function' ? globalThis.__seed.extractFrameworkStatus(flow) : ''; }",
    "function extractRestV2SamlResponseFromDebugFlow(flow = null) { return typeof globalThis.__seed.extractSaml === 'function' ? globalThis.__seed.extractSaml(flow) : {}; }",
    extractFunctionSource(source, "parseJsonText"),
    extractFunctionSource(source, "normalizeRestV2ProfileAttributeValue"),
    extractFunctionSource(source, "dedupeRestV2CandidateStrings"),
    extractFunctionSource(source, "decodeBase64TextSafe"),
    extractFunctionSource(source, "decodeURIComponentSafe"),
    extractFunctionSource(source, "getRestV2CaseInsensitiveObjectValue"),
    extractFunctionSource(source, "parseRestV2PartnerFrameworkStatusPayload"),
    extractFunctionSource(source, "resolveRestV2PartnerFrameworkStatusSummary"),
    extractFunctionSource(source, "isRestV2PartnerFrameworkStatusUsable"),
    extractFunctionSource(source, "normalizeRestV2PartnerFrameworkStatusForRequest"),
    extractFunctionSource(source, "normalizeRestV2PartnerSsoPlatformName"),
    extractFunctionSource(source, "normalizeRestV2MvpdMatchToken"),
    extractFunctionSource(source, "scoreRestV2PartnerProviderIdCandidate"),
    extractFunctionSource(source, "rankRestV2PartnerProviderIdCandidates"),
    extractFunctionSource(source, "buildRestV2RequestorScopedPartnerProviderId"),
    extractFunctionSource(source, "collectRestV2RequestorScopedPartnerProviderIdCandidates"),
    extractFunctionSource(source, "buildRestV2MvpdMatchTokens"),
    extractFunctionSource(source, "isRestV2MvpdMatch"),
    extractFunctionSource(source, "resolveRestV2PartnerFromFrameworkStatus"),
    extractFunctionSource(source, "resolveRestV2PartnerFrameworkStatusProviderId"),
    extractFunctionSource(source, "collectRestV2PartnerProviderIdCandidatesFromMvpdMeta"),
    extractFunctionSource(source, "resolveRestV2ExpectedPartnerFrameworkProviderIds"),
    extractFunctionSource(source, "resolveRestV2ExpectedPartnerFrameworkProviderId"),
    extractFunctionSource(source, "resolveRestV2MvpdMetaForPartnerFrameworkProviderId"),
    extractFunctionSource(source, "isRestV2PartnerFrameworkStatusCompatibleWithContext"),
    extractFunctionSource(source, "resolveRestV2LearningPartnerFrameworkStatusFromContext"),
    extractFunctionSource(source, "buildRestV2TrustedPartnerFrameworkStatusFromCapturedFlow"),
    extractFunctionSource(source, "hydrateRestV2PartnerSsoContextFromDebugFlow"),
    "module.exports = { hydrateRestV2PartnerSsoContextFromDebugFlow };",
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
  vm.runInNewContext(script, context, { filename: filePath });
  return context.module.exports;
}

function loadRestV2LearningEntryOpener(seed = {}) {
  const filePath = path.join(ROOT, "popup.js");
  const source = fs.readFileSync(filePath, "utf8");
  const script = [
    'const PREMIUM_SERVICE_DOCUMENTATION_URL_BY_KEY = { restV2: "https://developer.adobe.com/adobe-pass/api/rest_api_v2/interactive/" };',
    "const state = globalThis.__seed.state || { selectedRequestorId: '', selectedMvpdId: '' };",
    "const __calls = globalThis.__seed.calls;",
    "const __statuses = globalThis.__seed.statuses;",
    "const __learningStates = globalThis.__seed.learningStates || [];",
    "function setStatus(message, type) { __statuses.push({ message: String(message || ''), type: String(type || '') }); }",
    "function setRestV2LearningUiState(value = null, options = {}) { __learningStates.push({ value, options }); return value; }",
    "function firstNonEmptyString(values = []) { for (const value of Array.isArray(values) ? values : [values]) { if (value == null) { continue; } const normalized = String(value || '').trim(); if (normalized) { return normalized; } } return ''; }",
    "function getRestV2InteractiveDocsEntry() { return globalThis.__seed.entry; }",
    "function resolveSelectedProgrammer() { return globalThis.__seed.programmer || null; }",
    "function buildRestV2InteractiveDocsContext() { return globalThis.__seed.context; }",
    "function getRestV2MvpdMeta(requestorId = '', mvpdId = '') { return typeof globalThis.__seed.resolveMvpdMeta === 'function' ? globalThis.__seed.resolveMvpdMeta(requestorId, mvpdId) : null; }",
    "async function openPremiumServiceDocumentation(serviceKey, url) { __calls.push({ serviceKey, url }); return { ok: true, tabId: 7, windowId: 9, url }; }",
    extractFunctionSource(source, "buildRestV2InteractiveDocsUrl"),
    extractFunctionSource(source, "openRestV2InteractiveDocsEntry"),
    "module.exports = { openRestV2InteractiveDocsEntry };",
  ].join("\n\n");
  const context = {
    module: { exports: {} },
    exports: {},
    __seed: seed,
  };
  vm.runInNewContext(script, context, { filename: filePath });
  return context.module.exports;
}

function loadRestV2InteractiveDocsContextBuilder(seed = {}) {
  const filePath = path.join(ROOT, "popup.js");
  const source = fs.readFileSync(filePath, "utf8");
  const script = [
    "const state = globalThis.__seed.state || { selectedRequestorId: '', selectedMvpdId: '' };",
    "function resolveSelectedProgrammer() { return globalThis.__seed.programmer || null; }",
    "function getCurrentPremiumAppsSnapshot() { return globalThis.__seed.services || null; }",
    "function resolveRestV2LearningRequestorContext() { return globalThis.__seed.requestorContext || { requestorId: '', autoResolved: false, candidateCount: 0 }; }",
    "function collectRestV2AppCandidatesFromPremiumApps() { return globalThis.__seed.restV2Candidates || []; }",
    "function resolveProgrammerPremiumServiceRuntimeApp(serviceKey = '', programmerId = '', services = null) { if (typeof globalThis.__seed.resolveRuntimeApp === 'function') { return globalThis.__seed.resolveRuntimeApp(serviceKey, programmerId, services); } const resolvedServices = services && typeof services === 'object' ? services : (globalThis.__seed.services || null); if (String(serviceKey || '').trim() === 'restV2') { return resolvedServices?.restV2 || (globalThis.__seed.restV2Candidates || [])[0] || null; } return null; }",
    "function resolveRestV2AppForServiceProvider(restV2Apps, serviceProviderId) { return typeof globalThis.__seed.resolveApp === 'function' ? globalThis.__seed.resolveApp(restV2Apps, serviceProviderId) : (Array.isArray(restV2Apps) ? restV2Apps[0] || null : null); }",
    "function selectPreferredRestV2AppForRequestor(restV2Apps, serviceProviderId) { return typeof globalThis.__seed.selectPreferredApp === 'function' ? globalThis.__seed.selectPreferredApp(restV2Apps, serviceProviderId) : (Array.isArray(restV2Apps) ? restV2Apps[0] || null : null); }",
    "function normalizeEntityToken(value = '') { return String(value || '').trim().toLowerCase(); }",
    "function sanitizePassVaultHintValue(...values) { for (const value of values) { if (value == null) { continue; } if (Array.isArray(value)) { const nested = sanitizePassVaultHintValue(...value); if (nested) { return nested; } continue; } if (typeof value === 'object') { const nested = sanitizePassVaultHintValue(value.value, value.id, value.key, value.guid); if (nested) { return nested; } continue; } const normalized = String(value || '').trim(); if (normalized) { return normalized; } } return ''; }",
    "function extractPassVaultPrimaryRequestorHintFromAppData(appData = null) { return String(appData?.primaryRequestor || '').trim(); }",
    "function collectRestV2ServiceProviderCandidatesFromApp(appInfo, programmerId) { return typeof globalThis.__seed.collectCandidates === 'function' ? globalThis.__seed.collectCandidates(appInfo, programmerId) : []; }",
    "function firstNonEmptyString(values = []) { for (const value of Array.isArray(values) ? values : [values]) { if (value == null) { continue; } const normalized = String(value || '').trim(); if (normalized) { return normalized; } } return ''; }",
    "function resolveRestV2LearningRecordingContext() { return globalThis.__seed.activeRecordingContext || null; }",
    "function getRestV2ProfileHarvestForContext() { return globalThis.__seed.harvest || null; }",
    "function buildRestV2ContextFromHarvest(harvest = null) { return typeof globalThis.__seed.buildHarvestContext === 'function' ? globalThis.__seed.buildHarvestContext(harvest) : (globalThis.__seed.harvestContext || null); }",
    "function getRestV2MvpdMeta(requestorId = '', mvpdId = '') { return typeof globalThis.__seed.resolveMvpdMeta === 'function' ? globalThis.__seed.resolveMvpdMeta(requestorId, mvpdId) : null; }",
    "function findRestV2PreauthorizeHistoryEntriesForLearning() { return globalThis.__seed.preauthorizeHistoryEntries || []; }",
    "function bobtoolsWorkspaceResolveQuickResourceOptions() { return globalThis.__seed.quickResourceOptions || { resourceIds: [] }; }",
    "function collectRestV2LearningResourceIds(harvest = null, extras = []) { return typeof globalThis.__seed.collectResourceIds === 'function' ? globalThis.__seed.collectResourceIds(harvest, extras) : []; }",
    "function sampleRestV2LearningResourceIds(values = [], count = 10) { return typeof globalThis.__seed.sampleResourceIds === 'function' ? globalThis.__seed.sampleResourceIds(values, count) : (Array.isArray(values) ? values.slice(0, count) : []); }",
    "function normalizeAdobeNavigationUrl(value = '') { return String(value || '').trim(); }",
    "function collectRestV2SessionCodeCandidates(values = []) { return (Array.isArray(values) ? values : [values]).map((value) => String(value || '').trim()).filter(Boolean); }",
    "function cloneJsonLikeValue(value, fallback = null) { if (value == null) { return fallback; } try { return JSON.parse(JSON.stringify(value)); } catch { return fallback; } }",
    "function buildRestV2InteractiveDocsUrl(anchor = '') { return typeof globalThis.__seed.buildDocsUrl === 'function' ? globalThis.__seed.buildDocsUrl(anchor) : String(anchor || '').trim(); }",
    "function resolveRestV2LearningRequestorDomainName() { return String(globalThis.__seed.domainName || '').trim(); }",
    "function findProgrammerByProgrammerId(programmerId = '') { return typeof globalThis.__seed.findProgrammerByProgrammerId === 'function' ? globalThis.__seed.findProgrammerByProgrammerId(programmerId) : null; }",
    "function getPassVaultMediaCompanyRecord(programmerId = '') { return typeof globalThis.__seed.getPassVaultMediaCompanyRecord === 'function' ? globalThis.__seed.getPassVaultMediaCompanyRecord(programmerId) : null; }",
    "function resolveRestV2PartnerFrameworkStatusFromContext(context = null) { return typeof globalThis.__seed.resolveFrameworkStatus === 'function' ? globalThis.__seed.resolveFrameworkStatus(context) : String(context?.partnerFrameworkStatus || '').trim(); }",
    "function resolveRestV2PartnerNameFromContext(context = null) { return typeof globalThis.__seed.resolvePartnerName === 'function' ? globalThis.__seed.resolvePartnerName(context) : String(context?.partner || context?.sessionPartner || '').trim(); }",
    "function resolveRestV2InteractiveDocsHeaderValueFromContext(context = null, headerName = '') { if (typeof globalThis.__seed.resolveHeaderValue === 'function') { return globalThis.__seed.resolveHeaderValue(context, headerName); } const normalized = String(headerName || '').trim().toLowerCase(); if (normalized === 'adobe-subject-token') { return String(context?.adobeSubjectToken || '').trim(); } if (normalized === 'ad-service-token') { return String(context?.adServiceToken || '').trim(); } if (normalized === 'ap-temppass-identity') { return String(context?.tempPassIdentity || '').trim(); } if (normalized === 'ap-visitor-identifier') { return String(context?.visitorIdentifier || '').trim(); } if (normalized === 'ap-partner-framework-status') { return String(context?.partnerFrameworkStatus || '').trim(); } return ''; }",
    "function isRestV2LikelyPartnerSsoContext(context = null) { return typeof globalThis.__seed.isLikelyPartnerSso === 'function' ? globalThis.__seed.isLikelyPartnerSso(context) : false; }",
    "function resolveRestV2DebugFlowIdForHarvest(harvest = null) { return typeof globalThis.__seed.resolveFlowId === 'function' ? globalThis.__seed.resolveFlowId(harvest) : ''; }",
    "function parseJwtPayload() { return globalThis.__seed.jwtClaims || null; }",
    extractFunctionSource(source, "isProbablyJwt"),
    extractFunctionSource(source, "extractJwtAndUrls"),
    extractFunctionSource(source, "extractSoftwareStatementFromAppData"),
    extractFunctionSource(source, "collectRegisteredApplicationRedirectUriCandidates"),
    extractFunctionSource(source, "isHttpsRedirectUri"),
    extractFunctionSource(source, "normalizeHttpsRedirectUri"),
    extractFunctionSource(source, "extractRegisteredApplicationRedirectUri"),
    extractFunctionSource(source, "extractRegisteredApplicationHttpsRedirectUri"),
    extractFunctionSource(source, "buildProgrammerControlledHttpsRedirectUrl"),
    extractFunctionSource(source, "normalizeProgrammerCustomSchemeRedirectUri"),
    extractFunctionSource(source, "collectProgrammerCustomSchemeRedirectUris"),
    extractFunctionSource(source, "resolveProgrammerCustomSchemeRedirectUri"),
    extractFunctionSource(source, "resolveRestV2InteractiveDocsAppRequestorContext"),
    extractFunctionSource(source, "buildRestV2InteractiveDocsContext"),
    "module.exports = { buildRestV2InteractiveDocsContext };",
  ].join("\n\n");
  const context = {
    module: { exports: {} },
    exports: {},
    __seed: seed,
  };
  vm.runInNewContext(script, context, { filename: filePath });
  return context.module.exports;
}

function loadDcrInteractiveDocsContextBuilder(seed = {}) {
  const filePath = path.join(ROOT, "popup.js");
  const source = fs.readFileSync(filePath, "utf8");
  const script = [
    "function resolveSelectedProgrammer() { return globalThis.__seed.programmer || null; }",
    "function getCurrentPremiumAppsSnapshot() { return globalThis.__seed.services || null; }",
    "function resolveRestV2LearningRequestorContext() { return globalThis.__seed.requestorContext || { requestorId: '', autoResolved: false, candidateCount: 0 }; }",
    "function collectRestV2AppCandidatesFromPremiumApps() { return globalThis.__seed.restV2Candidates || []; }",
    "function resolveProgrammerPremiumServiceRuntimeApp(serviceKey = '', programmerId = '', services = null) { if (typeof globalThis.__seed.resolveRuntimeApp === 'function') { return globalThis.__seed.resolveRuntimeApp(serviceKey, programmerId, services); } const resolvedServices = services && typeof services === 'object' ? services : (globalThis.__seed.services || null); if (String(serviceKey || '').trim() === 'restV2') { return resolvedServices?.restV2 || (globalThis.__seed.restV2Candidates || [])[0] || null; } return null; }",
    "function selectPreferredRestV2AppForRequestor(restV2Apps, requestorId, programmerId) { return typeof globalThis.__seed.selectPreferredApp === 'function' ? globalThis.__seed.selectPreferredApp(restV2Apps, requestorId, programmerId) : (Array.isArray(restV2Apps) ? restV2Apps[0] || null : null); }",
    "function getSelectedDcrRegisterApp() { return globalThis.__seed.selectedRegisterApp || null; }",
    "function loadDcrCache() { return globalThis.__seed.dcrCache || null; }",
    "function buildDcrDeviceInfo() { return String(globalThis.__seed.deviceInfo || 'device-info-123').trim(); }",
    "function firstNonEmptyString(values = []) { for (const value of Array.isArray(values) ? values : [values]) { if (value == null) { continue; } const normalized = String(value || '').trim(); if (normalized) { return normalized; } } return ''; }",
    "function findProgrammerByProgrammerId(programmerId = '') { return typeof globalThis.__seed.findProgrammerByProgrammerId === 'function' ? globalThis.__seed.findProgrammerByProgrammerId(programmerId) : null; }",
    "function getPassVaultMediaCompanyRecord(programmerId = '') { return typeof globalThis.__seed.getPassVaultMediaCompanyRecord === 'function' ? globalThis.__seed.getPassVaultMediaCompanyRecord(programmerId) : null; }",
    "function parseJwtPayload() { return globalThis.__seed.jwtClaims || null; }",
    extractFunctionSource(source, "extractJwtAndUrls"),
    extractFunctionSource(source, "collectRegisteredApplicationRedirectUriCandidates"),
    extractFunctionSource(source, "isHttpsRedirectUri"),
    extractFunctionSource(source, "normalizeHttpsRedirectUri"),
    extractFunctionSource(source, "extractRegisteredApplicationHttpsRedirectUri"),
    extractFunctionSource(source, "normalizeProgrammerCustomSchemeRedirectUri"),
    extractFunctionSource(source, "collectProgrammerCustomSchemeRedirectUris"),
    extractFunctionSource(source, "resolveProgrammerCustomSchemeRedirectUri"),
    extractFunctionSource(source, "isProbablyJwt"),
    extractFunctionSource(source, "extractSoftwareStatementFromAppData"),
    extractFunctionSource(source, "extractRegisteredApplicationRedirectUri"),
    extractFunctionSource(source, "buildDcrInteractiveDocsContext"),
    "module.exports = { buildDcrInteractiveDocsContext };",
  ].join("\n\n");
  const context = {
    module: { exports: {} },
    exports: {},
    __seed: seed,
    navigator: { userAgent: "UnderPAR test" },
  };
  vm.runInNewContext(script, context, { filename: filePath });
  return context.module.exports;
}

function loadRegisteredApplicationHydrationHelper(seed = {}) {
  const filePath = path.join(ROOT, "popup.js");
  const source = fs.readFileSync(filePath, "utf8");
  const script = [
    "function firstNonEmptyString(values = []) { for (const value of Array.isArray(values) ? values : [values]) { if (value == null) { continue; } const normalized = String(value || '').trim(); if (normalized) { return normalized; } } return ''; }",
    `function mergeHydratedRegisteredApplication(appInfo = null, detailData = null, softwareStatement = "") {
      const baseAppInfo = appInfo && typeof appInfo === "object" && !Array.isArray(appInfo) ? appInfo : {};
      const detail = detailData && typeof detailData === "object" && !Array.isArray(detailData) ? detailData : null;
      return {
        ...baseAppInfo,
        ...(detail || {}),
        appData: {
          ...(baseAppInfo?.appData && typeof baseAppInfo.appData === "object" && !Array.isArray(baseAppInfo.appData) ? baseAppInfo.appData : {}),
          ...(detail && typeof detail === "object" ? detail : {}),
        },
        softwareStatement: firstNonEmptyString([
          softwareStatement,
          baseAppInfo?.softwareStatement,
          baseAppInfo?.appData?.softwareStatement,
        ]),
      };
    }`,
    "function resolveApplicationGuidFromEntityData(applicationData = null) { return String(applicationData?.guid || applicationData?.id || applicationData?.applicationId || applicationData?.__underparEntityKey || '').trim(); }",
    "function isHttpsRedirectUri(value = '') { return /^https:\\/\\//i.test(String(value || '').trim()); }",
    "function normalizeHttpsRedirectUri(value = '') { const normalizedValue = String(value || '').trim(); if (!normalizedValue) { return ''; } if (isHttpsRedirectUri(normalizedValue)) { return normalizedValue; } if (/^[A-Za-z0-9.-]+\\.[A-Za-z]{2,}(\\/.*)?$/.test(normalizedValue)) { return `https://${normalizedValue.replace(/^\\/+/, '')}`; } return ''; }",
    `function extractRegisteredApplicationHttpsRedirectUri(appInfo = null) {
      const candidates = [
        appInfo?.redirectUri,
        appInfo?.redirect_uri,
        appInfo?.appData?.redirectUri,
        appInfo?.appData?.redirect_uri,
      ];
      for (const candidate of candidates) {
        const normalized = normalizeHttpsRedirectUri(candidate);
        if (normalized) {
          return normalized;
        }
      }
      return "";
    }`,
    "async function fetchApplicationDetailsByGuid(guid, options = {}) { return typeof globalThis.__seed.fetchApplicationDetailsByGuid === 'function' ? globalThis.__seed.fetchApplicationDetailsByGuid(guid, options) : null; }",
    "async function fetchSoftwareStatementForAppGuid(guid, options = {}) { return typeof globalThis.__seed.fetchSoftwareStatementForAppGuid === 'function' ? globalThis.__seed.fetchSoftwareStatementForAppGuid(guid, options) : ''; }",
    extractFunctionSource(source, "enrichRegisteredApplicationForHydration"),
    "module.exports = { enrichRegisteredApplicationForHydration };",
  ].join("\n\n");
  const context = {
    module: { exports: {} },
    exports: {},
    __seed: seed,
  };
  vm.runInNewContext(script, context, { filename: filePath });
  return context.module.exports;
}

function loadRestV2LearningActivationEvaluator(seed = {}) {
  const filePath = path.join(ROOT, "popup.js");
  const source = fs.readFileSync(filePath, "utf8");
  const script = [
    "function buildRestV2InteractiveDocsContext(programmer, entry) { return (globalThis.__seed.contextByEntryKey && globalThis.__seed.contextByEntryKey[String(entry?.key || '')]) || globalThis.__seed.context || { ok: false, error: 'missing-context' }; }",
    "function buildRestV2InteractiveDocsHydrationPlan(entry, context, accessToken = '') { return typeof globalThis.__seed.planBuilder === 'function' ? globalThis.__seed.planBuilder(entry, context, accessToken) : { missingRequiredFields: [], notes: [] }; }",
    "function hydrateRestV2ContextFromPreparedLoginEntry(context = null) { if (typeof globalThis.__seed.hydratePrepared === 'function') { return globalThis.__seed.hydratePrepared(context); } return context; }",
    "function hydrateRestV2ContextFromPartnerSsoOverride(context = null) { if (typeof globalThis.__seed.hydratePartnerOverride === 'function') { return globalThis.__seed.hydratePartnerOverride(context); } return context; }",
    extractFunctionSource(source, "summarizeRestV2InteractiveDocsActivationLockReason"),
    extractFunctionSource(source, "buildRestV2InteractiveDocsEntryActivationState"),
    "module.exports = { buildRestV2InteractiveDocsEntryActivationState };",
  ].join("\n\n");
  const context = {
    module: { exports: {} },
    exports: {},
    __seed: seed,
  };
  vm.runInNewContext(script, context, { filename: filePath });
  return context.module.exports;
}

function loadRestV2HarvestContextBuilder(seed = {}) {
  const filePath = path.join(ROOT, "popup.js");
  const source = fs.readFileSync(filePath, "utf8");
  const script = [
    "function firstNonEmptyString(values = []) { for (const value of Array.isArray(values) ? values : [values]) { if (value == null) { continue; } const normalized = String(value || '').trim(); if (normalized) { return normalized; } } return ''; }",
    "function normalizeAdobeNavigationUrl(value = '') { return String(value || '').trim(); }",
    "function collectRestV2SessionCodeCandidates(values = []) { return (Array.isArray(values) ? values : [values]).map((value) => String(value || '').trim()).filter(Boolean); }",
    "function cloneJsonLikeValue(value, fallback = null) { if (value == null) { return fallback; } try { return JSON.parse(JSON.stringify(value)); } catch { return fallback; } }",
    "function getRequestorScopedMvpdCache(requestorId = '') { return typeof globalThis.__seed.getRequestorScopedMvpdCache === 'function' ? globalThis.__seed.getRequestorScopedMvpdCache(requestorId) : null; }",
    "function resolveRestV2AppInfoForHarvest(harvest = null) { return typeof globalThis.__seed.resolveAppInfo === 'function' ? globalThis.__seed.resolveAppInfo(harvest) : { guid: String(harvest?.appGuid || ''), appName: String(harvest?.appName || harvest?.appGuid || '') }; }",
    extractFunctionSource(source, "buildRestV2ContextFromHarvest"),
    "module.exports = { buildRestV2ContextFromHarvest };",
  ].join("\n\n");
  const context = {
    module: { exports: {} },
    exports: {},
    __seed: seed,
  };
  vm.runInNewContext(script, context, { filename: filePath });
  return context.module.exports;
}

function loadRestV2HeaderResolutionHelpers() {
  const filePath = path.join(ROOT, "popup.js");
  const source = fs.readFileSync(filePath, "utf8");
  const script = [
    extractFunctionSource(source, "parseJsonText"),
    extractFunctionSource(source, "normalizeRestV2ProfileAttributeValue"),
    extractFunctionSource(source, "dedupeRestV2CandidateStrings"),
    extractFunctionSource(source, "decodeBase64TextSafe"),
    extractFunctionSource(source, "decodeURIComponentSafe"),
    extractFunctionSource(source, "getRestV2CaseInsensitiveObjectValue"),
    extractFunctionSource(source, "getRestV2CaseInsensitiveHeaderValue"),
    extractFunctionSource(source, "collectRestV2CaseInsensitiveObjectValues"),
    extractFunctionSource(source, "getRestV2InteractiveDocsHeaderAliasCandidates"),
    extractFunctionSource(source, "parseRestV2PartnerFrameworkStatusPayload"),
    extractFunctionSource(source, "resolveRestV2PartnerFrameworkStatusSummary"),
    extractFunctionSource(source, "normalizeRestV2PartnerFrameworkStatusForRequest"),
    extractFunctionSource(source, "extractRestV2VisitorIdentifierFromCarrierValue"),
    extractFunctionSource(source, "normalizeRestV2VisitorIdentifierForRequest"),
    extractFunctionSource(source, "normalizeRestV2TempPassIdentityForRequest"),
    extractFunctionSource(source, "normalizeRestV2InteractiveDocsHeaderCandidate"),
    extractFunctionSource(source, "getRestV2InteractiveDocsContextPropertyForHeader"),
    extractFunctionSource(source, "isRestV2ExactCapturedHeaderName"),
    extractFunctionSource(source, "resolveRestV2StructuredHeaderValueFromContext"),
    extractFunctionSource(source, "buildRestV2CapturedAuthHeadersFromContext"),
    extractFunctionSource(source, "mergeRestV2CapturedAuthHeaders"),
    extractFunctionSource(source, "resolveRestV2InteractiveDocsHeaderValueFromContext"),
    "module.exports = { resolveRestV2InteractiveDocsHeaderValueFromContext, mergeRestV2CapturedAuthHeaders };",
  ].join("\n\n");
  const context = {
    module: { exports: {} },
    exports: {},
    atob,
    btoa,
    unescape,
    encodeURIComponent,
    Headers,
    TextDecoder,
  };
  vm.runInNewContext(script, context, { filename: filePath });
  return context.module.exports;
}

function loadRestV2LearningResourceHelpers(seed = {}) {
  const filePath = path.join(ROOT, "popup.js");
  const source = fs.readFileSync(filePath, "utf8");
  const script = [
    "function getRestV2ProfilePreauthzChecks(harvest = null) { return Array.isArray(harvest?.preauthzChecks) ? harvest.preauthzChecks : []; }",
    "function uniquePreserveOrder(values = []) { const output = []; const seen = new Set(); (Array.isArray(values) ? values : []).forEach((value) => { const normalized = String(value || '').trim(); if (!normalized || seen.has(normalized)) { return; } seen.add(normalized); output.push(normalized); }); return output; }",
    extractFunctionSource(source, "collectRestV2LearningResourceIds"),
    extractFunctionSource(source, "sampleRestV2LearningResourceIds"),
    "module.exports = { collectRestV2LearningResourceIds, sampleRestV2LearningResourceIds };",
  ].join("\n\n");
  const mathObject = seed.math
    ? Object.assign(Object.create(Math), {
        random: seed.math.random,
      })
    : Math;
  const context = {
    module: { exports: {} },
    exports: {},
    Math: mathObject,
  };
  vm.runInNewContext(script, context, { filename: filePath });
  return context.module.exports;
}

function loadRestV2LearningContextPreparer(seed = {}) {
  const filePath = path.join(ROOT, "popup.js");
  const source = fs.readFileSync(filePath, "utf8");
  const script = [
    "function firstNonEmptyString(values = []) { for (const value of Array.isArray(values) ? values : [values]) { if (value == null) { continue; } const normalized = String(value || '').trim(); if (normalized) { return normalized; } } return ''; }",
    "function uniquePreserveOrder(values = []) { const output = []; const seen = new Set(); (Array.isArray(values) ? values : []).forEach((value) => { const normalized = String(value || '').trim(); if (!normalized || seen.has(normalized)) { return; } seen.add(normalized); output.push(normalized); }); return output; }",
    "function getRestV2MvpdMeta(requestorId = '', mvpdId = '', mvpdMeta = null) { return mvpdMeta || null; }",
    "function bobtoolsWorkspaceResolveQuickResourceOptions(programmerId, requestorId, mvpdId) { return typeof globalThis.__seed.resolveQuickResourceOptions === 'function' ? globalThis.__seed.resolveQuickResourceOptions(programmerId, requestorId, mvpdId) : { resourceIds: [] }; }",
    "function bobtoolsWorkspaceNormalizeQuickResourceIds(values = [], maxItems = 320) { const normalizedMax = Number(maxItems || 0); const limit = Number.isFinite(normalizedMax) && normalizedMax > 0 ? normalizedMax : 320; const unique = []; const seen = new Set(); (Array.isArray(values) ? values : []).forEach((value) => { const text = String(value || '').trim(); if (!text) { return; } const key = text.toLowerCase(); if (seen.has(key)) { return; } seen.add(key); unique.push(text); }); return unique.slice(0, limit); }",
    "async function mvpdWorkspaceEnsureSnapshot(selectionContext, options = {}) { return typeof globalThis.__seed.loadSnapshot === 'function' ? globalThis.__seed.loadSnapshot(selectionContext, options) : null; }",
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
    extractFunctionSource(source, "normalizeRestV2PartnerSsoPlatformName"),
    extractFunctionSource(source, "normalizeRestV2PartnerFrameworkStatusForRequest"),
    extractFunctionSource(source, "extractRestV2VisitorIdentifierFromCarrierValue"),
    extractFunctionSource(source, "normalizeRestV2VisitorIdentifierForRequest"),
    extractFunctionSource(source, "normalizeRestV2MvpdMatchToken"),
    extractFunctionSource(source, "scoreRestV2PartnerProviderIdCandidate"),
    extractFunctionSource(source, "rankRestV2PartnerProviderIdCandidates"),
    extractFunctionSource(source, "buildRestV2RequestorScopedPartnerProviderId"),
    extractFunctionSource(source, "collectRestV2RequestorScopedPartnerProviderIdCandidates"),
    extractFunctionSource(source, "buildRestV2MvpdMatchTokens"),
    extractFunctionSource(source, "isRestV2MvpdMatch"),
    extractFunctionSource(source, "resolveRestV2PartnerFromFrameworkStatus"),
    extractFunctionSource(source, "resolveRestV2PartnerFrameworkStatusProviderId"),
    extractFunctionSource(source, "collectRestV2PartnerProviderIdCandidatesFromMvpdMeta"),
    extractFunctionSource(source, "resolveRestV2MvpdMetaForPartnerFrameworkProviderId"),
    extractFunctionSource(source, "resolveRestV2ExpectedPartnerFrameworkProviderIds"),
    extractFunctionSource(source, "resolveRestV2ExpectedPartnerFrameworkProviderId"),
    extractFunctionSource(source, "isRestV2PartnerFrameworkStatusCompatibleWithContext"),
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
    extractFunctionSource(source, "sampleRestV2LearningResourceIds"),
    extractFunctionSource(source, "enrichRestV2LearningResourcesFromConsoleContext"),
    "function resolveRestV2DebugFlowIdForHarvest() { return ''; }",
    "async function getRestV2DebugFlowSnapshot() { return typeof globalThis.__seed.getFlowSnapshot === 'function' ? globalThis.__seed.getFlowSnapshot() : null; }",
    "function extractRestV2SamlResponseFromDebugFlow(flow = null) { return typeof globalThis.__seed.extractSaml === 'function' ? globalThis.__seed.extractSaml(flow) : {}; }",
    "function resolveRestV2PartnerNameFromContext(context = null) { return typeof globalThis.__seed.resolvePartnerName === 'function' ? globalThis.__seed.resolvePartnerName(context) : String(context?.partner || context?.sessionPartner || '').trim(); }",
    "function resolveRestV2LearningPartnerNameFromContext(context = null) { return typeof globalThis.__seed.resolveLearningPartnerName === 'function' ? globalThis.__seed.resolveLearningPartnerName(context) : String(context?.partner || context?.sessionPartner || context?.learningPartner || '').trim(); }",
    "function resolveRestV2PartnerFrameworkStatusFromContext(context = null) { return typeof globalThis.__seed.resolveFrameworkStatus === 'function' ? globalThis.__seed.resolveFrameworkStatus(context) : String(context?.partnerFrameworkStatus || context?.sessionData?.partnerFrameworkStatus || '').trim(); }",
    "function resolveRestV2InteractiveDocsHeaderValueFromContext(context = null, headerName = '') { if (typeof globalThis.__seed.resolveHeaderValue === 'function') { return globalThis.__seed.resolveHeaderValue(context, headerName); } const normalized = String(headerName || '').trim().toLowerCase(); if (normalized === 'adobe-subject-token') { return String(context?.adobeSubjectToken || '').trim(); } if (normalized === 'ad-service-token') { return String(context?.adServiceToken || '').trim(); } if (normalized === 'ap-temppass-identity') { return String(context?.tempPassIdentity || '').trim(); } if (normalized === 'ap-visitor-identifier') { return String(context?.visitorIdentifier || '').trim(); } if (normalized === 'ap-partner-framework-status') { return String(context?.partnerFrameworkStatus || context?.sessionData?.partnerFrameworkStatus || '').trim(); } return ''; }",
    "function isRestV2PartnerFrameworkStatusUsable(value = '') { return typeof globalThis.__seed.isFrameworkStatusUsable === 'function' ? globalThis.__seed.isFrameworkStatusUsable(value) : Boolean(String(value || '').trim()); }",
    "function hydrateRestV2ContextFromPreparedLoginEntry(context = null) { if (typeof globalThis.__seed.hydratePreparedContext === 'function') { return globalThis.__seed.hydratePreparedContext(context); } return context; }",
    "function hydrateRestV2ContextFromPartnerSsoOverride(context = null) { if (typeof globalThis.__seed.hydratePartnerOverride === 'function') { return globalThis.__seed.hydratePartnerOverride(context); } return context; }",
    "function hydrateRestV2PartnerSsoContextFromDebugFlow(context = null, flow = null) { if (typeof globalThis.__seed.hydratePartnerContext === 'function') { return globalThis.__seed.hydratePartnerContext(context, flow); } return context; }",
    "function hydrateRestV2LearningPartnerSsoContextFromDebugFlow(context = null, flow = null) { if (typeof globalThis.__seed.hydrateLearningPartnerContext === 'function') { return globalThis.__seed.hydrateLearningPartnerContext(context, flow); } return context; }",
    "async function hydrateRestV2PartnerPlatformMappingFromConsoleContext(context = null, options = {}) { if (typeof globalThis.__seed.hydratePartnerPlatformMapping === 'function') { return globalThis.__seed.hydratePartnerPlatformMapping(context, options); } return context; }",
    "function hydrateRestV2InteractiveDocsOptionalHeadersFromDebugFlow(context = null, flow = null, headerNames = []) { if (typeof globalThis.__seed.hydrateOptionalHeaders === 'function') { return globalThis.__seed.hydrateOptionalHeaders(context, flow, headerNames); } return context; }",
    extractFunctionSource(source, "resolveRestV2LearningPartnerFrameworkStatusFromContext"),
    extractFunctionSource(source, "resolveRestV2ExactPartnerFrameworkStatusForContext"),
    extractFunctionSource(source, "resolveRestV2PreferredPartnerFrameworkStatusForContext"),
    extractFunctionSource(source, "prepareRestV2InteractiveDocsContextForEntry"),
    "module.exports = { enrichRestV2LearningResourcesFromConsoleContext, prepareRestV2InteractiveDocsContextForEntry };",
  ].join("\n\n");
  const mathObject = seed.math
    ? Object.assign(Object.create(Math), {
        random: seed.math.random,
      })
    : Math;
  const context = {
    module: { exports: {} },
    exports: {},
    __seed: seed,
    Math: mathObject,
    atob,
    btoa,
    unescape,
    encodeURIComponent,
  };
  vm.runInNewContext(script, context, { filename: filePath });
  return context.module.exports;
}

function loadRestV2LearningDomainResolver(seed = {}) {
  const filePath = path.join(ROOT, "popup.js");
  const source = fs.readFileSync(filePath, "utf8");
  const script = [
    "const state = globalThis.__seed.state || { consoleBootstrapState: null };",
    "function normalizeEntityToken(value = '') { return String(value || '').trim().toLowerCase(); }",
    "function extractEntityIdFromToken(value = '') { const text = String(value || '').trim(); const prefixed = text.match(/^@[^:]+:(.+)$/); return prefixed ? String(prefixed[1] || '').trim() : text; }",
    "function uniquePreserveOrder(values = []) { const output = []; const seen = new Set(); (Array.isArray(values) ? values : []).forEach((value) => { const normalized = String(value || '').trim(); if (!normalized || seen.has(normalized)) { return; } seen.add(normalized); output.push(normalized); }); return output; }",
    "function getRequestorScopedDomainCache(requestorId = '') { return typeof globalThis.__seed.getRequestorScopedDomainCache === 'function' ? globalThis.__seed.getRequestorScopedDomainCache(requestorId) : null; }",
    "function getRequestorScopedHarpoSelectedDomain(requestorId = '') { return typeof globalThis.__seed.getRequestorScopedHarpoSelectedDomain === 'function' ? globalThis.__seed.getRequestorScopedHarpoSelectedDomain(requestorId) : ''; }",
    extractFunctionSource(source, "isExcludedHarpoDomainName"),
    extractFunctionSource(source, "collectRequestorScopedConfiguredDomainNames"),
    extractFunctionSource(source, "collectRestV2LearningRequestorDomainNames"),
    extractFunctionSource(source, "resolveRestV2LearningRequestorDomainName"),
    "module.exports = { collectRestV2LearningRequestorDomainNames, resolveRestV2LearningRequestorDomainName };",
  ].join("\n\n");
  const context = {
    module: { exports: {} },
    exports: {},
    __seed: seed,
  };
  vm.runInNewContext(script, context, { filename: filePath });
  return context.module.exports;
}

function loadRestV2ConfigurationNormalizers() {
  const filePath = path.join(ROOT, "popup.js");
  const source = fs.readFileSync(filePath, "utf8");
  const script = [
    "function firstNonEmptyString(values = []) { for (const value of Array.isArray(values) ? values : [values]) { if (value == null) { continue; } const normalized = String(value || '').trim(); if (normalized) { return normalized; } } return ''; }",
    "function extractRestV2MvpdLogoUrl() { return ''; }",
    extractFunctionSource(source, "isExcludedHarpoDomainName"),
    extractFunctionSource(source, "getRestV2ConfigurationCollection"),
    extractFunctionSource(source, "normalizeRestV2MvpdCollection"),
    extractFunctionSource(source, "normalizeRestV2DomainCollection"),
    "module.exports = { getRestV2ConfigurationCollection, normalizeRestV2MvpdCollection, normalizeRestV2DomainCollection };",
  ].join("\n\n");
  const context = {
    module: { exports: {} },
    exports: {},
  };
  vm.runInNewContext(script, context, { filename: filePath });
  return context.module.exports;
}

function loadRestV2LearningCollapseHelpers(seed = {}) {
  const filePath = path.join(ROOT, "popup.js");
  const source = fs.readFileSync(filePath, "utf8");
  const script = [
    'const DEFAULT_ADOBEPASS_ENVIRONMENT = { key: "production" };',
    "const state = globalThis.__seed.state || { premiumSectionCollapsedByKey: new Map() };",
    "function getActiveAdobePassEnvironmentKey() { return globalThis.__seed.environmentKey || DEFAULT_ADOBEPASS_ENVIRONMENT.key; }",
    "function getEnvironmentScopedProgrammerKey(programmerId, environmentKey) { return `${String(environmentKey || '').trim()}|${String(programmerId || '').trim()}`; }",
    extractFunctionSource(source, "getPremiumCollapseKey"),
    extractFunctionSource(source, "getPremiumSectionCollapsed"),
    extractFunctionSource(source, "setPremiumSectionCollapsed"),
    extractFunctionSource(source, "getRestV2LearningServiceCollapseKey"),
    extractFunctionSource(source, "getRestV2LearningServiceCollapsed"),
    extractFunctionSource(source, "setRestV2LearningServiceCollapsed"),
    extractFunctionSource(source, "getRestV2InteractiveDocsSectionCollapseKey"),
    extractFunctionSource(source, "getRestV2InteractiveDocsSectionCollapsed"),
    extractFunctionSource(source, "setRestV2InteractiveDocsSectionCollapsed"),
    "module.exports = { getRestV2LearningServiceCollapsed, setRestV2LearningServiceCollapsed, getRestV2InteractiveDocsSectionCollapsed, setRestV2InteractiveDocsSectionCollapsed };",
  ].join("\n\n");
  const context = {
    module: { exports: {} },
    exports: {},
    __seed: seed,
  };
  vm.runInNewContext(script, context, { filename: filePath });
  return context.module.exports;
}

test("HR context stays hidden without a selected media company or detected premium services", () => {
  const state = {
    programmerWorkspaceHydrationReadyByKey: new Map([["production|fox", true], ["staging|fox", false]]),
  };
  const { shouldRevealHrContextSections } = loadHrVisibilityHelpers({
    state,
    environmentKey: "production",
  });

  assert.equal(shouldRevealHrContextSections(null, null), false);
  assert.equal(shouldRevealHrContextSections({ programmerId: "" }, null), false);
  assert.equal(shouldRevealHrContextSections({ programmerId: "fox" }, null), false);
  assert.equal(shouldRevealHrContextSections({ programmerId: "nflx" }, null), false);
});

test("HR context reveals only when the selected media company has detected premium services", () => {
  const state = {
    programmerWorkspaceHydrationReadyByKey: new Map(),
    cmServiceByProgrammerId: new Map(),
  };
  const { shouldRevealHrContextSections } = loadHrVisibilityHelpers({
    state,
    environmentKey: "production",
  });

  assert.equal(
    shouldRevealHrContextSections({ programmerId: "fox" }, { restV2: { appName: "REST V2" }, cm: { matchedTenants: [] } }),
    true
  );
  assert.equal(
    shouldRevealHrContextSections({ programmerId: "fox" }, { esm: { guid: "esm-guid" }, cm: { matchedTenants: [] } }),
    true
  );
  assert.equal(shouldRevealHrContextSections({ programmerId: "fox" }, { cm: { matchedTenants: [{ id: "cm-tenant" }] } }), true);
  assert.equal(shouldRevealHrContextSections({ programmerId: "fox" }, {}), false);
  assert.equal(shouldRevealHrContextSections({ programmerId: "fox" }, { cm: { matchedTenants: [] } }), false);
  assert.equal(shouldRevealHrContextSections({ programmerId: "fox" }, []), false);
});

test("HR context adds HARPO only for REST V2 media companies with configured domains", () => {
  const { collectHarpoProgrammerDomainNames, shouldShowHarpoHrSection, getHrContextSectionDisplayKeys } =
    loadHrContextSectionDisplayHelpers({
      state: {
        selectedRequestorId: "",
      },
      requestorCandidates: ["turner", "cnn"],
      collectDomains(programmer, requestorId) {
        const normalizedRequestorId = String(requestorId || "").trim().toLowerCase();
        if (normalizedRequestorId === "turner") {
          return ["turner.example.test", "turner-alt.example.test"];
        }
        if (normalizedRequestorId === "cnn") {
          return ["cnn.example.test"];
        }
        return [];
      },
    });

  const programmer = {
    programmerId: "Turner",
    requestorIds: ["turner"],
    requestorOptions: [{ id: "turner" }],
  };
  const services = {
    restV2: {
      guid: "rest-guid",
    },
  };

  assert.deepEqual(
    Array.from(collectHarpoProgrammerDomainNames(programmer, services)),
    ["turner.example.test", "turner-alt.example.test", "cnn.example.test"]
  );
  assert.equal(shouldShowHarpoHrSection(programmer, services), true);
  assert.deepEqual(Array.from(getHrContextSectionDisplayKeys(programmer, services)), ["health", "learning", "harpo"]);
  assert.equal(shouldShowHarpoHrSection(programmer, {}), false);
  assert.deepEqual(Array.from(getHrContextSectionDisplayKeys(programmer, {})), ["health", "learning"]);
});

test("REST V2 configuration normalizers parse DOMAINs alongside MVPDs", () => {
  const { normalizeRestV2MvpdCollection, normalizeRestV2DomainCollection } = loadRestV2ConfigurationNormalizers();

  const payload = {
    Requestor: {
      MVPDs: [
        {
          id: "directv",
          displayName: "DIRECTV",
          isProxy: false,
        },
      ],
      DOMAINs: [
        { domainName: "experience.example.test", displayName: "Primary Experience" },
        { domain: "experience-alt.example.test" },
        { domainName: "adobe.com" },
        "experience.example.test",
      ],
    },
  };

  const mvpds = Array.from(normalizeRestV2MvpdCollection(payload));
  const domains = Array.from(normalizeRestV2DomainCollection(payload));

  assert.equal(mvpds.length, 1);
  assert.equal(mvpds[0].id, "directv");
  assert.equal(domains.length, 2);
  assert.deepEqual(
    domains.map((entry) => entry.domainName),
    ["experience.example.test", "experience-alt.example.test"]
  );
});

test("sidepanel seeds the HR context container hidden and popup runtime uses unlabeled top and bottom separators", () => {
  const sidepanelHtml = fs.readFileSync(path.join(ROOT, "sidepanel.html"), "utf8");
  const popupSource = fs.readFileSync(path.join(ROOT, "popup.js"), "utf8");
  const applyServiceBoxSectionShellSource = extractFunctionSource(popupSource, "applyServiceBoxSectionShell");
  const buildHrSectionsRenderSignatureSource = extractFunctionSource(popupSource, "buildHrSectionsRenderSignature");
  const wireHrContextSectionActionsSource = extractFunctionSource(popupSource, "wireHrContextSectionActions");
  const createPremiumServiceSectionSource = extractFunctionSource(popupSource, "createPremiumServiceSection");
  const createHrContextSectionSource = extractFunctionSource(popupSource, "createHrContextSection");
  const renderHrSectionsSource = extractFunctionSource(popupSource, "renderHrSections");

  assert.match(sidepanelHtml, /id="hr-services-container"\s+class="hr-services-container"\s+hidden/);
  assert.match(popupSource, /topDivider\.className = "hr-context-divider"/);
  assert.match(popupSource, /bottomDivider\.className = "hr-context-divider"/);
  assert.doesNotMatch(popupSource, /hr-context-divider-label/);
  assert.doesNotMatch(popupSource, />HR</);
  assert.doesNotMatch(popupSource, /textContent = "- HR -"/);
  assert.match(applyServiceBoxSectionShellSource, /<details class="service-box-details"/);
  assert.match(applyServiceBoxSectionShellSource, /<summary\s+class="metadata-header service-box-header"/);
  assert.match(applyServiceBoxSectionShellSource, /<button\s+type="button"\s+class="metadata-header service-box-header"/);
  assert.match(applyServiceBoxSectionShellSource, /<span class="collapse-icon">▼<\/span>/);
  assert.match(applyServiceBoxSectionShellSource, /wireCollapsibleSection\(toggleButton, container, initialCollapsed, \(collapsed\) => \{/);
  assert.match(applyServiceBoxSectionShellSource, /syncShellDetailsState\(collapsed\)/);
  assert.match(applyServiceBoxSectionShellSource, /syncShellDetailsState\(initialCollapsed\)/);
  assert.doesNotMatch(applyServiceBoxSectionShellSource, /toggleButton\.addEventListener\("click", \(event\) => \{/);
  assert.doesNotMatch(applyServiceBoxSectionShellSource, /toggleButton\.addEventListener\("keydown", \(event\) => \{/);
  assert.doesNotMatch(applyServiceBoxSectionShellSource, /detailsElement\.addEventListener\("toggle", syncOpenState\)/);
  assert.match(wireHrContextSectionActionsSource, /section\.addEventListener\("click", \(event\) => \{/);
  assert.match(wireHrContextSectionActionsSource, /target\.closest\("\[data-harpo-domain-select\]"\)/);
  assert.match(wireHrContextSectionActionsSource, /openRestV2InteractiveDocsEntry/);
  assert.match(wireHrContextSectionActionsSource, /openPremiumServiceDocumentation/);
  assert.match(createPremiumServiceSectionSource, /applyServiceBoxSectionShell\(section,\s*\{/);
  assert.match(
    createPremiumServiceSectionSource,
    /useNativeDetailsToggle:\s*serviceKey === "cm" \|\| serviceKey === "cmMvpd"/
  );
  assert.match(createHrContextSectionSource, /applyServiceBoxSectionShell\(section,\s*\{/);
  assert.match(createHrContextSectionSource, /wireHrContextSectionActions\(section\)/);
  assert.match(createHrContextSectionSource, /setHrContextSectionCollapsed\(programmer\?\.programmerId, sectionKey, collapsed\)/);
  assert.doesNotMatch(createHrContextSectionSource, /useNativeDetailsToggle:\s*true/);
  assert.match(
    popupSource,
    /cmuUsageState\.treeHeadElement\?\.addEventListener\("click", \(event\) => \{[\s\S]*?event\.preventDefault\(\);[\s\S]*?event\.stopPropagation\(\);[\s\S]*?toggleTree\(\);[\s\S]*?\}\);/
  );
  assert.doesNotMatch(buildHrSectionsRenderSignatureSource, /state\.selectedRequestorId/);
  assert.doesNotMatch(buildHrSectionsRenderSignatureSource, /state\.selectedMvpdId/);
  assert.match(renderHrSectionsSource, /els\.hrServicesContainer\.dataset\.renderSignature/);
  assert.match(renderHrSectionsSource, /buildHrSectionsRenderSignature\(programmer, services, options\)/);
  assert.doesNotMatch(popupSource, /els\.premiumServicesContainer\.addEventListener\("click", \(event\) => \{/);
  assert.doesNotMatch(popupSource, /els\.premiumServicesContainer\.addEventListener\("keydown", \(event\) => \{/);
  assert.doesNotMatch(popupSource, /els\.hrServicesContainer\.addEventListener\("click", \(event\) => \{/);
  assert.doesNotMatch(popupSource, /els\.hrServicesContainer\.addEventListener\("keydown", \(event\) => \{/);
});

test("detected service pills are wired to documentation urls for the learning flow", () => {
  const popupSource = fs.readFileSync(path.join(ROOT, "popup.js"), "utf8");
  const openPremiumServiceDocumentationSource = extractFunctionSource(popupSource, "openPremiumServiceDocumentation");

  assert.match(popupSource, /PREMIUM_SERVICE_DOCUMENTATION_URL_BY_KEY/);
  assert.match(
    popupSource,
    /https:\/\/experienceleague\.adobe\.com\/en\/docs\/pass\/authentication\/integration-guide-programmers\/features-premium\/esm\/entitlement-service-monitoring-api/
  );
  assert.match(
    popupSource,
    /https:\/\/tve\.zendesk\.com\/hc\/en-us\/articles\/33912526308372-Adobe-Pass-Authentication-Degradation-API-v3/
  );
  assert.match(
    popupSource,
    /https:\/\/experienceleague\.adobe\.com\/en\/docs\/pass\/authentication\/integration-guide-programmers\/features-premium\/temporary-access\/temp-pass-feature/
  );
  assert.match(popupSource, /https:\/\/developer\.adobe\.com\/adobe-pass\/api\/rest_api_v2\/interactive\//);
  assert.match(popupSource, /https:\/\/streams-stage\.adobeprimetime\.com\/swagger-ui\/index\.html/);
  assert.match(popupSource, /data-service-doc-key/);
  assert.match(popupSource, /data-service-doc-url/);
  assert.match(popupSource, /openPremiumServiceDocumentation/);
  assert.match(openPremiumServiceDocumentationSource, /chrome\.tabs\.create/);
  assert.doesNotMatch(openPremiumServiceDocumentationSource, /chrome\.tabs\.update/);
});

test("service shells align the collapse arrow and racing stripes on a shared header rail", () => {
  const popupCss = fs.readFileSync(path.join(ROOT, "popup.css"), "utf8");
  assert.match(popupCss, /--service-header-rail-center-y:\s*17px;/);
  assert.match(
    popupCss,
    /\.premium-service-section \.metadata-header \.collapse-icon,\s*\.hr-context-section \.metadata-header \.collapse-icon\s*\{[\s\S]*?top:\s*var\(--service-header-rail-center-y\);/
  );
  assert.match(
    popupCss,
    /body\.underpar-up-tab \.premium-service-section::after,\s*body\.underpar-up-tab \.hr-context-section::after\s*\{[\s\S]*?top:\s*var\(--service-header-rail-center-y\);[\s\S]*?transform:\s*translateY\(-50%\);/
  );
  assert.match(
    popupCss,
    /\.premium-service-section \.metadata-header\.service-box-header\.collapsed \.collapse-icon,\s*\.hr-context-section \.metadata-header\.service-box-header\.collapsed \.collapse-icon\s*\{/
  );
  assert.match(
    popupCss,
    /\.premium-service-section \.service-box-container:not\(\.collapsed\),\s*\.hr-context-section \.service-box-container:not\(\.collapsed\)\s*\{/
  );
  assert.doesNotMatch(popupCss, /\.service-box-details\[open\]/);
});

test("REST V2 learning card exposes every interactive doc operation across all six sections", () => {
  const popupHtml = fs.readFileSync(path.join(ROOT, "popup.html"), "utf8");
  const popupSource = fs.readFileSync(path.join(ROOT, "popup.js"), "utf8");
  const popupCss = fs.readFileSync(path.join(ROOT, "popup.css"), "utf8");
  const buildDcrInteractiveDocsContextSource = extractFunctionSource(popupSource, "buildDcrInteractiveDocsContext");
  const prepareDcrInteractiveDocsContextForEntrySource = extractFunctionSource(
    popupSource,
    "prepareDcrInteractiveDocsContextForEntry"
  );
  const buildDcrInteractiveDocsHydrationPlanSource = extractFunctionSource(popupSource, "buildDcrInteractiveDocsHydrationPlan");
  const buildDcrInteractiveDocsEntryActivationStateSource = extractFunctionSource(
    popupSource,
    "buildDcrInteractiveDocsEntryActivationState"
  );
  const buildDcrInteractiveDocsPanelHtmlSource = extractFunctionSource(popupSource, "buildDcrInteractiveDocsPanelHtml");
  const openDcrInteractiveDocsEntrySource = extractFunctionSource(popupSource, "openDcrInteractiveDocsEntry");
  const buildRestV2InteractiveDocsContextSource = extractFunctionSource(popupSource, "buildRestV2InteractiveDocsContext");
  const buildHrContextSectionBodyHtmlSource = extractFunctionSource(popupSource, "buildHrContextSectionBodyHtml");
  const buildRestV2InteractiveDocsEntryActivationStateSource = extractFunctionSource(
    popupSource,
    "buildRestV2InteractiveDocsEntryActivationState"
  );
  const buildRestV2InteractiveDocsSectionHtmlSource = extractFunctionSource(
    popupSource,
    "buildRestV2InteractiveDocsSectionHtml"
  );
  const buildRestV2InteractiveDocsPanelHtmlSource = extractFunctionSource(
    popupSource,
    "buildRestV2InteractiveDocsPanelHtml"
  );
  const buildLearningInspectorCardHtmlSource = extractFunctionSource(popupSource, "buildLearningInspectorCardHtml");
  const buildLearningInspectorToolsHtmlSource = extractFunctionSource(popupSource, "buildLearningInspectorToolsHtml");
  const wireLearningInspectorsSource = extractFunctionSource(popupSource, "wireLearningInspectors");
  const wireRestV2LearningContainerCollapsiblesSource = extractFunctionSource(
    popupSource,
    "wireRestV2LearningContainerCollapsibles"
  );
  const wireRestV2InteractiveDocsSectionCollapsiblesSource = extractFunctionSource(
    popupSource,
    "wireRestV2InteractiveDocsSectionCollapsibles"
  );
  const collectRestV2LearningResourceIdsSource = extractFunctionSource(popupSource, "collectRestV2LearningResourceIds");
  const sampleRestV2LearningResourceIdsSource = extractFunctionSource(popupSource, "sampleRestV2LearningResourceIds");
  const enrichRestV2LearningResourcesFromConsoleContextSource = extractFunctionSource(
    popupSource,
    "enrichRestV2LearningResourcesFromConsoleContext"
  );
  const collectRestV2LearningRequestorDomainNamesSource = extractFunctionSource(
    popupSource,
    "collectRestV2LearningRequestorDomainNames"
  );
  const renderHrSectionsSource = extractFunctionSource(popupSource, "renderHrSections");
  const summarizeRestV2InteractiveDocsActivationLockReasonSource = extractFunctionSource(
    popupSource,
    "summarizeRestV2InteractiveDocsActivationLockReason"
  );
  const resolveRestV2LearningRequestorContextSource = extractFunctionSource(popupSource, "resolveRestV2LearningRequestorContext");
  const openRestV2InteractiveDocsEntrySource = extractFunctionSource(popupSource, "openRestV2InteractiveDocsEntry");
  const runRestV2InteractiveDocsHydratorSource = extractFunctionSource(popupSource, "runRestV2InteractiveDocsHydrator");

  assert.match(popupSource, /const DCR_INTERACTIVE_DOC_ENTRIES = Object\.freeze\(\[/);
  assert.match(popupSource, /DCR API \(V2\)/);
  assert.match(popupSource, /const DCR_REGISTER_SERVICE_KEYS = Object\.freeze\(\["restV2", "esm", "degradation", "resetTempPass"\]\)/);
  assert.match(popupSource, /operationId: "processSoftwareStatementUsingPOST"/);
  assert.match(popupSource, /operationId: "generateAccessTokenUsingPOST"/);
  assert.match(popupSource, /function collectDcrRegisterAppOptions/);
  assert.match(popupSource, /function setSelectedDcrRegisterAppGuid/);
  assert.match(buildDcrInteractiveDocsContextSource, /collectRestV2AppCandidatesFromPremiumApps/);
  assert.match(buildDcrInteractiveDocsContextSource, /getSelectedDcrRegisterApp/);
  assert.match(buildDcrInteractiveDocsContextSource, /resolveProgrammerPremiumServiceRuntimeApp\("restV2",\s*programmerId,\s*resolvedServices\)/);
  assert.match(buildDcrInteractiveDocsContextSource, /extractRegisteredApplicationHttpsRedirectUri/);
  assert.doesNotMatch(buildDcrInteractiveDocsContextSource, /resolveProgrammerCustomSchemeRedirectUri/);
  assert.match(prepareDcrInteractiveDocsContextForEntrySource, /enrichRegisteredApplicationForHydration/);
  assert.match(extractFunctionSource(popupSource, "enrichRegisteredApplicationForHydration"), /hasHttpsRedirectUri/);
  assert.match(extractFunctionSource(popupSource, "enrichRegisteredApplicationForHydration"), /extractRegisteredApplicationHttpsRedirectUri/);
  assert.match(prepareDcrInteractiveDocsContextForEntrySource, /registerClientWithSoftwareStatement/);
  assert.match(prepareDcrInteractiveDocsContextForEntrySource, /saveDcrCache/);
  assert.match(buildDcrInteractiveDocsHydrationPlanSource, /body\.software_statement/);
  assert.match(buildDcrInteractiveDocsHydrationPlanSource, /body\.redirect_uri/);
  assert.match(buildDcrInteractiveDocsHydrationPlanSource, /redirectUriValue/);
  assert.match(buildDcrInteractiveDocsHydrationPlanSource, /operationDocsUrl/);
  assert.match(buildDcrInteractiveDocsHydrationPlanSource, /query\.client_id/);
  assert.match(buildDcrInteractiveDocsHydrationPlanSource, /query\.client_secret/);
  assert.match(buildDcrInteractiveDocsHydrationPlanSource, /query\.grant_type/);
  assert.match(buildDcrInteractiveDocsEntryActivationStateSource, /autoProvisionClientCredentials === true/);
  assert.match(buildDcrInteractiveDocsEntryActivationStateSource, /canProvisionClientCredentials === true/);
  assert.match(buildDcrInteractiveDocsEntryActivationStateSource, /body\.redirect_uri/);
  assert.match(buildDcrInteractiveDocsPanelHtmlSource, /data-restv2-learning-service-key="dcrV2"/);
  assert.match(buildDcrInteractiveDocsPanelHtmlSource, /data-learning-service-state="\$\{learningServiceState\}"/);
  assert.match(buildDcrInteractiveDocsPanelHtmlSource, /hr-learning-docs-shell hr-dcr-docs-shell/);
  assert.match(buildDcrInteractiveDocsPanelHtmlSource, /data-dcr-doc-entry-key/);
  assert.match(buildDcrInteractiveDocsPanelHtmlSource, /hr-context-service-pill--service-default/);
  assert.match(buildDcrInteractiveDocsPanelHtmlSource, /Choose a registered application for \/register, then UnderPAR hydrates the online Run form\./);
  assert.match(buildDcrInteractiveDocsPanelHtmlSource, /data-dcr-register-app-select="true"/);
  assert.match(buildDcrInteractiveDocsPanelHtmlSource, /Select a registered application\.\.\./);
  assert.match(popupSource, /const REST_V2_INTERACTIVE_DOC_ENTRIES = Object\.freeze\(\[/);
  assert.match(popupSource, /sectionLabel: "1\. Configuration"/);
  assert.match(popupSource, /sectionLabel: "2\. Sessions"/);
  assert.match(popupSource, /sectionLabel: "3\. Profiles"/);
  assert.match(popupSource, /sectionLabel: "4\. Decisions"/);
  assert.match(popupSource, /sectionLabel: "5\. Logout"/);
  assert.match(popupSource, /sectionLabel: "6\. Partner Single Sign-On"/);
  assert.match(popupSource, /operationId: "handleRequestUsingGET"/);
  assert.match(popupSource, /operationId: "startAuthenticationUsingGET"/);
  assert.match(popupSource, /operationId: "createSessionUsingPOST"/);
  assert.match(popupSource, /operationId: "resumeSessionUsingPOST"/);
  assert.match(popupSource, /operationId: "getSessionStatusUsingGET_1"/);
  assert.match(popupSource, /operationId: "getProfileForCodeUsingGET_1"/);
  assert.match(popupSource, /operationId: "getProfilesUsingGET_1"/);
  assert.match(popupSource, /operationId: "getProfileForMvpdUsingGET"/);
  assert.match(popupSource, /operationId: "retrieveAuthorizeDecisionsForMvpdUsingPOST"/);
  assert.match(popupSource, /operationId: "retrievePreAuthorizeDecisionsForMvpdUsingPOST_1"/);
  assert.match(popupSource, /operationId: "getLogoutForMvpdUsingGET"/);
  assert.match(popupSource, /operationId: "createPartnerProfileUsingPOST"/);
  assert.match(popupSource, /operationId: "retrieveVerificationTokenUsingPOST"/);
  assert.match(buildRestV2InteractiveDocsContextSource, /resolveRestV2LearningRequestorContext/);
  assert.match(buildRestV2InteractiveDocsContextSource, /resolvedEntry\?\.operationId === "handleRequestUsingGET"/);
  assert.match(buildRestV2InteractiveDocsContextSource, /resolveRestV2InteractiveDocsAppRequestorContext/);
  assert.match(buildRestV2InteractiveDocsContextSource, /resolveRestV2AppForServiceProvider/);
  assert.match(buildRestV2InteractiveDocsContextSource, /resolveRestV2LearningRequestorDomainName/);
  assert.match(buildRestV2InteractiveDocsContextSource, /extractRegisteredApplicationHttpsRedirectUri/);
  assert.match(buildRestV2InteractiveDocsContextSource, /buildProgrammerControlledHttpsRedirectUrl/);
  assert.match(
    buildHrContextSectionBodyHtmlSource,
    /\$\{buildHrServiceListHtml\(detectedServiceEntries, fallbackSummary\)\}\s*\$\{dcrDocsPanelHtml\}\s*\$\{restV2DocsPanelHtml\}/
  );
  assert.match(buildHrContextSectionBodyHtmlSource, /buildLearningInspectorToolsHtml\(\)/);
  assert.match(buildHrContextSectionBodyHtmlSource, /buildHarpoStatusItemHtml\(programmer, services\)/);
  assert.doesNotMatch(buildHrContextSectionBodyHtmlSource, /contextItemHtml/);
  assert.match(buildLearningInspectorCardHtmlSource, /getLearningInspectorConfig/);
  assert.match(buildLearningInspectorCardHtmlSource, /data-learning-inspector-key="\$\{escapeHtml\(normalizedType\)\}"/);
  assert.match(buildLearningInspectorCardHtmlSource, /data-learning-inspector-initial-collapsed/);
  assert.match(buildLearningInspectorCardHtmlSource, /hr-learning-inspector-toggle/);
  assert.match(buildLearningInspectorCardHtmlSource, /data-learning-inspector-form="\$\{escapeHtml\(normalizedType\)\}"/);
  assert.match(buildLearningInspectorCardHtmlSource, /data-learning-inspector-input="\$\{escapeHtml\(normalizedType\)\}"/);
  assert.match(buildLearningInspectorCardHtmlSource, /data-learning-inspector-result="\$\{escapeHtml\(normalizedType\)\}"/);
  assert.doesNotMatch(buildLearningInspectorCardHtmlSource, /hr-learning-inspector-card-description/);
  assert.match(wireLearningInspectorsSource, /data-learning-inspector-key/);
  assert.match(wireLearningInspectorsSource, /wireCollapsibleSection/);
  assert.match(wireLearningInspectorsSource, /setLearningInspectorCollapsed/);
  assert.match(wireLearningInspectorsSource, /inspectLearningJwtInput\(\)/);
  assert.match(wireLearningInspectorsSource, /inspectLearningBase64Input\(\)/);
  assert.match(enrichRestV2LearningResourcesFromConsoleContextSource, /mvpdWorkspaceEnsureSnapshot/);
  assert.match(enrichRestV2LearningResourcesFromConsoleContextSource, /bobtoolsWorkspaceResolveQuickResourceOptions/);
  assert.match(enrichRestV2LearningResourcesFromConsoleContextSource, /resourceIdPoolSource:\s*"console-tms-map"/);
  assert.match(buildRestV2InteractiveDocsEntryActivationStateSource, /buildRestV2InteractiveDocsContext/);
  assert.match(buildRestV2InteractiveDocsEntryActivationStateSource, /buildRestV2InteractiveDocsHydrationPlan/);
  assert.match(buildRestV2InteractiveDocsEntryActivationStateSource, /body\.resources/);
  assert.match(buildRestV2InteractiveDocsSectionHtmlSource, /data-restv2-doc-section-key/);
  assert.match(buildRestV2InteractiveDocsSectionHtmlSource, /metadata-header service-box-header hr-rest-v2-doc-section-toggle/);
  assert.match(buildRestV2InteractiveDocsSectionHtmlSource, /hr-rest-v2-doc-section-toggle-meta/);
  assert.match(buildRestV2InteractiveDocsSectionHtmlSource, /hr-rest-v2-doc-section-count/);
  assert.match(buildRestV2InteractiveDocsSectionHtmlSource, /service-box-container hr-rest-v2-doc-section-shell/);
  assert.match(buildRestV2InteractiveDocsSectionHtmlSource, /getRestV2InteractiveDocsSectionCollapsed/);
  assert.match(buildRestV2InteractiveDocsSectionHtmlSource, /data-restv2-doc-active/);
  assert.match(buildRestV2InteractiveDocsSectionHtmlSource, /hr-rest-v2-doc-entry-state-badge--active/);
  assert.doesNotMatch(buildRestV2InteractiveDocsSectionHtmlSource, /hr-rest-v2-doc-section-link/);
  assert.doesNotMatch(buildRestV2InteractiveDocsSectionHtmlSource, /\$\{isReady \? "" : "disabled"\}/);
  assert.match(buildRestV2InteractiveDocsPanelHtmlSource, /data-restv2-learning-service-key="restV2"/);
  assert.match(buildRestV2InteractiveDocsPanelHtmlSource, /data-learning-service-state="\$\{learningServiceState\}"/);
  assert.match(buildRestV2InteractiveDocsPanelHtmlSource, /class="hr-rest-v2-docs-shell hr-learning-docs-shell"/);
  assert.match(buildRestV2InteractiveDocsPanelHtmlSource, /metadata-header service-box-header hr-rest-v2-docs-toggle/);
  assert.match(buildRestV2InteractiveDocsPanelHtmlSource, /service-box-container hr-rest-v2-docs-shell-body/);
  assert.match(buildRestV2InteractiveDocsPanelHtmlSource, /hr-context-service-pill hr-context-service-pill--service-rest-v2 hr-rest-v2-docs-pill/);
  assert.match(buildRestV2InteractiveDocsPanelHtmlSource, /getRestV2LearningServiceCollapsed/);
  assert.match(popupHtml, /underpar-jwt-inspector\.js/);
  assert.match(wireRestV2LearningContainerCollapsiblesSource, /wireCollapsibleSection/);
  assert.match(wireRestV2LearningContainerCollapsiblesSource, /setRestV2LearningServiceCollapsed/);
  assert.match(wireRestV2InteractiveDocsSectionCollapsiblesSource, /wireCollapsibleSection/);
  assert.match(wireRestV2InteractiveDocsSectionCollapsiblesSource, /setRestV2InteractiveDocsSectionCollapsed/);
  assert.match(collectRestV2LearningResourceIdsSource, /getRestV2ProfilePreauthzChecks\(harvest\)/);
  assert.match(sampleRestV2LearningResourceIdsSource, /Math\.random/);
  assert.match(collectRestV2LearningRequestorDomainNamesSource, /state\?\.consoleBootstrapState\?\.channels/);
  assert.match(collectRestV2LearningRequestorDomainNamesSource, /candidate\?\.raw\?\.domains/);
  assert.match(summarizeRestV2InteractiveDocsActivationLockReasonSource, /Run LOGIN first to capture a REST V2 session code\./);
  assert.match(summarizeRestV2InteractiveDocsActivationLockReasonSource, /Run PREAUTHORIZE or AUTHORIZE first to capture resourceIds\./);
  assert.match(
    summarizeRestV2InteractiveDocsActivationLockReasonSource,
    /UnderPAR could not resolve the first configured Channel domain for this RequestorId\./
  );
  assert.match(
    summarizeRestV2InteractiveDocsActivationLockReasonSource,
    /UnderPAR could not resolve a valid HTTPS redirectUrl for this selection yet\./
  );
  assert.match(buildRestV2InteractiveDocsContextSource, /Select a Content Provider first\./);
  assert.doesNotMatch(buildRestV2InteractiveDocsContextSource, /REST_V2_REDIRECT_CANDIDATES/);
  assert.doesNotMatch(buildRestV2InteractiveDocsContextSource, /REST_V2_DEFAULT_DOMAIN/);
  assert.doesNotMatch(buildRestV2InteractiveDocsContextSource, /getFirstCachedMvpdIdForRequestor/);
  assert.match(resolveRestV2LearningRequestorContextSource, /candidates\.length === 1/);
  assert.doesNotMatch(resolveRestV2LearningRequestorContextSource, /requestorId:\s*programmerId/);
  assert.match(popupSource, /data-restv2-doc-entry-key/);
  assert.match(popupSource, /data-dcr-doc-entry-key/);
  assert.match(popupSource, /const HR_CONTEXT_SECTION_DISPLAY_ORDER = \["health", "learning", "harpo"\]/);
  assert.match(popupSource, /function getHrContextSectionDisplayKeys\(programmer = null, services = null\)/);
  assert.match(popupSource, /function collectHarpoProgrammerDomainNames\(programmer = null, services = null\)/);
  assert.match(popupSource, /function shouldShowHarpoHrSection\(programmer = null, services = null\)/);
  assert.match(popupSource, /Toggle DCR learning methods/);
  assert.match(popupSource, /REST V2 learning methods/);
  assert.match(popupSource, /JWT Inspector/);
  assert.match(popupSource, /Base64 Inspector/);
  assert.match(popupSource, /JWT Segments/);
  assert.doesNotMatch(popupSource, /Paste any JWT, bearer value, or JSON body containing a JWT\./);
  assert.doesNotMatch(popupSource, /Paste any Base64 or Base64URL value\./);
  assert.doesNotMatch(popupSource, /The shared JWT inspector utility is unavailable\. Reload UnderPAR and retry\./);
  assert.doesNotMatch(popupSource, /Not returned/);
  assert.doesNotMatch(popupSource, /Ready to hydrate UnderPAR context and focus Send\./);
  assert.match(popupSource, /showLearningInspectorResult\("jwt"/);
  assert.match(popupSource, /showLearningInspectorResult\("base64"/);
  assert.doesNotMatch(popupSource, /Review the inspector dialog for details/);
  assert.doesNotMatch(popupSource, /openLearningInspectorDialog/);
  assert.match(popupSource, /buildLearningJwtInspectorFallbackUtility/);
  assert.doesNotMatch(popupSource, /buildRestV2LearningContextItemHtml/);
  assert.doesNotMatch(popupSource, /buildRestV2LearningUiStatusMeta/);
  assert.doesNotMatch(popupSource, /Click any REST V2 LEARNING deeplink to preview the exact interactive docs payload here/);
  assert.match(popupSource, /collectRestV2LearningRequestorDomainNames\(programmer,\s*requestorId\)/);
  assert.doesNotMatch(popupSource, /AUTO \(/);
  assert.match(popupSource, /getRestV2InteractiveDocsSections/);
  assert.match(
    popupSource,
    /els\.mvpdSelect\.addEventListener\("change",[\s\S]*?mvpdWorkspaceRefreshSelectedSnapshot\(\{[\s\S]*?onlyIfWorkspaceOpen:\s*false,/
  );
  assert.match(popupSource, /controllerReason:\s*"mvpd-resource-snapshot"/);
  assert.match(openRestV2InteractiveDocsEntrySource, /ensureDcrAccessTokenWithServiceRecovery/);
  assert.match(openRestV2InteractiveDocsEntrySource, /prepareRestV2InteractiveDocsContextForEntry/);
  assert.match(openRestV2InteractiveDocsEntrySource, /buildRestV2InteractiveDocsContext\(resolveSelectedProgrammer\(\), entry\)/);
  assert.match(openRestV2InteractiveDocsEntrySource, /entry\.requiresAccessToken !== false/);
  assert.match(openRestV2InteractiveDocsEntrySource, /const openPartialDocs = async \(message, type = "info", payload = \{\}\) => \{/);
  assert.match(openRestV2InteractiveDocsEntrySource, /setRestV2LearningUiState/);
  assert.match(openRestV2InteractiveDocsEntrySource, /Opened \$\{entry\.label\} docs without full UnderPAR context\./);
  assert.match(openRestV2InteractiveDocsEntrySource, /openPremiumServiceDocumentation\("restV2"/);
  assert.match(openRestV2InteractiveDocsEntrySource, /waitForTabCompletion/);
  assert.match(openRestV2InteractiveDocsEntrySource, /hydrateRestV2InteractiveDocsTab/);
  assert.match(openDcrInteractiveDocsEntrySource, /prepareDcrInteractiveDocsContextForEntry/);
  assert.match(openDcrInteractiveDocsEntrySource, /buildDcrInteractiveDocsContext\(selectedProgrammer, entry, currentServices\)/);
  assert.match(openDcrInteractiveDocsEntrySource, /setDcrLearningUiState/);
  assert.match(openDcrInteractiveDocsEntrySource, /openPremiumServiceDocumentation\("dcrV2"/);
  assert.match(openDcrInteractiveDocsEntrySource, /hydrateRestV2InteractiveDocsTab/);
  assert.doesNotMatch(openDcrInteractiveDocsEntrySource, /entry\.launchOnly === true/);
  assert.match(runRestV2InteractiveDocsHydratorSource, /document\.getElementById\(`operation\/\$\{operationId\}`\)/);
  assert.match(runRestV2InteractiveDocsHydratorSource, /\[data-cy="try-it"\]/);
  assert.match(runRestV2InteractiveDocsHydratorSource, /\[data-cy="send-button"\]/);
  assert.match(runRestV2InteractiveDocsHydratorSource, /"resend"/);
  assert.match(runRestV2InteractiveDocsHydratorSource, /element\?\.CodeMirror/);
  assert.match(runRestV2InteractiveDocsHydratorSource, /CodeMirror\.setValue/);
  assert.match(runRestV2InteractiveDocsHydratorSource, /formatEditorBodyValue/);
  assert.match(runRestV2InteractiveDocsHydratorSource, /normalizedFieldName === "body\.SAMLResponse"/);
  assert.match(runRestV2InteractiveDocsHydratorSource, /normalizedFieldName === "body\.resources"/);
  assert.match(runRestV2InteractiveDocsHydratorSource, /console-request-body/);
  assert.match(runRestV2InteractiveDocsHydratorSource, /textarea/);
  assert.doesNotMatch(popupCss, /\.hr-learning-context-card/);
  assert.doesNotMatch(popupCss, /\.hr-learning-context-field-grid/);
  assert.doesNotMatch(popupCss, /\.hr-learning-context-status-badge--active/);
  assert.match(popupCss, /\.hr-base64-hover-target/);
  assert.match(popupCss, /\.hr-context-section\.hr-context-section--harpo/);
  assert.match(popupSource, /HAR &amp; Pass Observatory/);
  assert.doesNotMatch(popupSource, /PRE-RECORDED HAR/);
  assert.doesNotMatch(popupSource, /LIVE DOMAIN RECORDER/);
  assert.doesNotMatch(popupSource, /Legacy AccessEnabler flows stay out of scope/);
  assert.match(popupSource, /data-harpo-domain-select/);
  assert.doesNotMatch(popupSource, /Parsed from REST V2 \/configuration/);
  assert.doesNotMatch(popupSource, /Configured Domain/);
  assert.doesNotMatch(popupSource, /Effective domain:/);
  assert.doesNotMatch(popupCss, /\.hr-harpo-domain-picker/);
  assert.match(popupCss, /\.hr-harpo-domain-select\s*\{/);
  assert.doesNotMatch(popupCss, /\.hr-harpo-domain-copy/);
  assert.doesNotMatch(popupCss, /\.hr-harpo-domain-label/);
  assert.doesNotMatch(popupCss, /\.hr-harpo-domain-meta/);
  assert.match(popupCss, /\.hr-rest-v2-docs-shell/);
  assert.match(popupCss, /\.hr-learning-docs-shell\[data-learning-service-state="ready"\]/);
  assert.match(popupCss, /\.hr-learning-docs-shell\[data-learning-service-state="ready"\] \.hr-rest-v2-docs-toggle/);
  assert.match(popupCss, /\.hr-rest-v2-docs-toggle/);
  assert.match(popupCss, /\.hr-rest-v2-docs-shell-body/);
  assert.match(popupCss, /\.hr-rest-v2-docs-pill/);
  assert.match(popupCss, /\.hr-dcr-docs-shell/);
  assert.match(popupCss, /\.hr-dcr-docs-toggle/);
  assert.match(popupCss, /\.hr-dcr-doc-entry-picker/);
  assert.match(popupCss, /\.hr-dcr-doc-entry-picker-select/);
  assert.match(popupCss, /\.hr-learning-inspector-stack/);
  assert.match(popupCss, /\.hr-learning-inspector-card/);
  assert.match(popupCss, /\.hr-learning-inspector-toggle/);
  assert.match(popupCss, /\.hr-learning-inspector-card-body/);
  assert.match(popupCss, /\.hr-learning-inspector-result/);
  assert.match(popupCss, /\.hr-learning-inspector-code/);
  assert.match(popupCss, /\.hr-rest-v2-doc-entry/);
  assert.match(popupCss, /\.hr-rest-v2-doc-entry\.is-active/);
  assert.match(popupCss, /\.hr-rest-v2-doc-entry-readiness/);
  assert.match(popupCss, /\.hr-rest-v2-doc-entry-state-badge--active/);
  assert.match(popupCss, /\.hr-rest-v2-doc-entry-state-badge--locked/);
  assert.match(popupCss, /\.hr-rest-v2-docs-grid/);
  assert.match(popupCss, /\.hr-rest-v2-doc-section/);
  assert.match(popupCss, /\.hr-rest-v2-doc-section-toggle/);
  assert.match(popupCss, /\.hr-rest-v2-doc-section-toggle-meta/);
  assert.match(popupCss, /\.hr-rest-v2-doc-section-count/);
  assert.match(popupCss, /\.hr-rest-v2-doc-section-shell/);
  assert.match(popupCss, /\.hr-rest-v2-doc-section-grid/);
  assert.match(
    popupSource,
    /const docsItemHtml =\s*dcrDocsPanelHtml \|\| restV2DocsPanelHtml\s*\?\s*""\s*:\s*buildMetadataItemHtml\("Docs", `HOWTO: \$\{howtoSubject\} quick docs coming soon\.\.\.`\);/
  );
  assert.match(renderHrSectionsSource, /const visibleSectionKeys = getHrContextSectionDisplayKeys\(programmer, services\)/);
  assert.match(popupSource, /data-restv2-doc-state/);
  assert.match(popupSource, /SETUP NEEDED/);
  assert.match(popupSource, /Using \$\{selectedCount\} random resourceIds from the selected MVPD pool/);
});

test("REST V2 learning containers default collapsed and persist per section", () => {
  const {
    getRestV2LearningServiceCollapsed,
    setRestV2LearningServiceCollapsed,
    getRestV2InteractiveDocsSectionCollapsed,
    setRestV2InteractiveDocsSectionCollapsed,
  } =
    loadRestV2LearningCollapseHelpers();

  assert.equal(getRestV2LearningServiceCollapsed("Turner", "restV2"), true);
  setRestV2LearningServiceCollapsed("Turner", "restV2", false);
  assert.equal(getRestV2LearningServiceCollapsed("Turner", "restV2"), false);
  assert.equal(getRestV2LearningServiceCollapsed("Fox", "restV2"), false);
  assert.equal(getRestV2InteractiveDocsSectionCollapsed("Turner", "configuration"), true);
  setRestV2InteractiveDocsSectionCollapsed("Turner", "configuration", true);
  assert.equal(getRestV2InteractiveDocsSectionCollapsed("Turner", "configuration"), true);
  assert.equal(getRestV2InteractiveDocsSectionCollapsed("Fox", "configuration"), true);
  assert.equal(getRestV2InteractiveDocsSectionCollapsed("Turner", "sessions"), true);
});

test("LEARNING JWT inspector falls back to a local decoder when the shared utility is unavailable", () => {
  const { getLearningJwtInspectorUtility } = loadPopupLearningJwtInspectorUtility(null);
  const utility = getLearningJwtInspectorUtility();
  const token = [
    Buffer.from(JSON.stringify({ alg: "RS256", typ: "JWT" })).toString("base64url"),
    Buffer.from(
      JSON.stringify({
        sub: "d23d67ff-0342-4bc4-b610-2c5ae8e94ee5",
        nbf: 1774634644,
        iss: "auth.adobe.com",
        scopes: "api:client:v2",
        exp: 1774656244,
        iat: 1774634644,
      })
    ).toString("base64url"),
    "signature",
  ].join(".");
  const extracted = utility.extractJwtCandidateFromText(JSON.stringify({ Authorization: `Bearer ${token}` }));
  const decoded = utility.decodeJwtToken(extracted);

  assert.equal(extracted, token);
  assert.equal(decoded.valid, true);
  assert.equal(decoded.header.alg, "RS256");
  assert.equal(decoded.payload.iss, "auth.adobe.com");
  assert.equal(decoded.summary.subject, "d23d67ff-0342-4bc4-b610-2c5ae8e94ee5");
  assert.deepEqual(Array.from(decoded.summary.scopes), ["api:client:v2"]);
  assert.match(String(utility.buildInspectorMarkup(decoded)), /Decoded JWT/);
});

test("REST V2 learning entries still open the customer docs when requestor context is missing", async () => {
  const calls = [];
  const statuses = [];
  const learningStates = [];
  const { openRestV2InteractiveDocsEntry } = loadRestV2LearningEntryOpener({
    calls,
    statuses,
    learningStates,
    entry: {
      key: "configuration-service-provider",
      label: "Service Provider Configuration",
      operationAnchor: "operation/handleRequestUsingGET",
      tagAnchor: "tag/1.-Configuration",
    },
    programmer: {
      programmerId: "Turner",
    },
    context: {
      ok: false,
      error: "Select a Content Provider first. REST V2 interactive docs require a valid RequestorId/service provider, not just a Media Company.",
    },
  });

  const result = await openRestV2InteractiveDocsEntry("configuration-service-provider", "");
  assert.equal(calls.length, 1);
  assert.equal(String(calls[0]?.serviceKey || ""), "restV2");
  assert.equal(
    String(calls[0]?.url || ""),
    "https://developer.adobe.com/adobe-pass/api/rest_api_v2/interactive/#operation/handleRequestUsingGET"
  );
  assert.equal(result.partial, true);
  assert.equal(learningStates.length > 0, true);
  assert.equal(String(learningStates[0]?.value?.entryKey || ""), "configuration-service-provider");
  assert.match(String(statuses[0]?.message || ""), /Opened Service Provider Configuration docs without full UnderPAR context\./);
  assert.match(String(statuses[0]?.message || ""), /Select a Content Provider first\./);
});

test("REST V2 configuration context resolves the app requestor when only the media company is selected", () => {
  const seededApp = {
    guid: "rest-guid",
    appData: {
      requestor: "turner",
      serviceProviders: ["turner", "turner-alt"],
    },
  };
  const { buildRestV2InteractiveDocsContext } = loadRestV2InteractiveDocsContextBuilder({
    programmer: {
      programmerId: "Turner",
      programmerName: "Turner",
    },
    services: {
      restV2: seededApp,
    },
    restV2Candidates: [seededApp],
    requestorContext: {
      requestorId: "",
      autoResolved: false,
      candidateCount: 2,
    },
    collectCandidates(appInfo) {
      if (appInfo?.guid === "rest-guid") {
        return ["Turner", "turner", "turner-alt"];
      }
      return [];
    },
    resolveApp(restV2Apps, serviceProviderId) {
      return (Array.isArray(restV2Apps) ? restV2Apps : []).find((appInfo) => {
        const requestorId = String(appInfo?.appData?.requestor || "").trim();
        return requestorId === String(serviceProviderId || "").trim();
      }) || null;
    },
  });

  const result = buildRestV2InteractiveDocsContext(
    {
      programmerId: "Turner",
      programmerName: "Turner",
    },
    {
      operationId: "handleRequestUsingGET",
    }
  );

  assert.equal(result.ok, true);
  assert.equal(result.requestorId, "turner");
  assert.equal(result.serviceProviderId, "turner");
  assert.equal(result.requestorAutoResolved, true);
  assert.equal(result.appInfo?.guid, "rest-guid");
});

test("DCR register context prefers the registered application's HTTPS redirect URI over programmer custom schemes", () => {
  const selectedRegisterApp = {
    appInfo: {
      guid: "rest-guid",
      redirectUri: "https://wrong.example.test/callback",
      appData: {
        redirectUri: "https://wrong.example.test/callback",
        softwareStatement: "header.payload.signature",
      },
      softwareStatement: "header.payload.signature",
    },
  };
  const { buildDcrInteractiveDocsContext } = loadDcrInteractiveDocsContextBuilder({
    programmer: {
      programmerId: "Turner",
      programmerName: "Turner",
      raw: {
        customSchemes: [{ customScheme: "adbe.turner://"}],
      },
    },
    services: {
      restV2: selectedRegisterApp.appInfo,
    },
    selectedRegisterApp,
  });

  const result = buildDcrInteractiveDocsContext(
    {
      programmerId: "Turner",
      programmerName: "Turner",
      raw: {
        customSchemes: [{ customScheme: "adbe.turner://"}],
      },
    },
    {
      key: "dcr-client-register",
    },
    {
      restV2: selectedRegisterApp.appInfo,
    }
  );

  assert.equal(result.ok, true);
  assert.equal(result.appInfo?.guid, "rest-guid");
  assert.equal(result.redirectUri, "https://wrong.example.test/callback");
});

test("DCR register context requires an explicit registered application selection before it can go ready", () => {
  const fallbackApp = {
    guid: "rest-guid",
    softwareStatement: "header.payload.signature",
    appData: {
      requestor: "turner",
    },
  };
  const { buildDcrInteractiveDocsContext } = loadDcrInteractiveDocsContextBuilder({
    programmer: {
      programmerId: "Turner",
      programmerName: "Turner",
    },
    services: {
      restV2: fallbackApp,
    },
    restV2Candidates: [fallbackApp],
    requestorContext: {
      requestorId: "turner",
      autoResolved: true,
      candidateCount: 1,
    },
  });

  const result = buildDcrInteractiveDocsContext(
    {
      programmerId: "Turner",
      programmerName: "Turner",
    },
    {
      key: "dcr-client-register",
    },
    {
      restV2: fallbackApp,
    }
  );

  assert.equal(result.ok, false);
  assert.equal(result.error, "Choose a DCR-scoped registered application from the list first.");
});

test("DCR register hydration falls back to the clicked docs URL when the registered application has no HTTPS redirect URI", () => {
  const { buildDcrInteractiveDocsHydrationPlan } = loadDcrInteractiveDocsHydrationPlanBuilder();
  const plan = buildDcrInteractiveDocsHydrationPlan(
    {
      key: "dcr-client-register",
      operationId: "processSoftwareStatementUsingPOST",
      operationAnchor: "operation/processSoftwareStatementUsingPOST",
      contentType: "application/json",
      usesBodySoftwareStatement: true,
      requireBodySoftwareStatement: true,
      usesBodyRedirectUri: true,
      requireBodyRedirectUri: true,
      usesDeviceInfoHeader: true,
      requireDeviceInfoHeader: true,
    },
    {
      appInfo: { guid: "rest-guid" },
      softwareStatement: "header.payload.signature",
      redirectUri: "",
      deviceInfo: "device-info-123",
      userAgent: "UnderPAR test",
    }
  );

  assert.equal(
    plan.fieldValues["body.redirect_uri"],
    "https://developer.adobe.com/adobe-pass/api/dcr_api/interactive/#operation/processSoftwareStatementUsingPOST"
  );
  assert.deepEqual(Array.from(plan.missingRequiredFields || []), []);
});

test("registered application hydration still fetches app details when a software statement exists but the HTTPS redirect URI is missing", async () => {
  const calls = [];
  const { enrichRegisteredApplicationForHydration } = loadRegisteredApplicationHydrationHelper({
    async fetchApplicationDetailsByGuid(guid) {
      calls.push({ type: "details", guid });
      return {
        guid,
        redirectUri: "https://turner.example.test/callback",
      };
    },
    async fetchSoftwareStatementForAppGuid(guid) {
      calls.push({ type: "software", guid });
      return "";
    },
  });

  const result = await enrichRegisteredApplicationForHydration({
    guid: "rest-guid",
    softwareStatement: "header.payload.signature",
    appData: {
      softwareStatement: "header.payload.signature",
    },
  });

  assert.equal(result?.redirectUri, "https://turner.example.test/callback");
  assert.equal(result?.appData?.redirectUri, "https://turner.example.test/callback");
  assert.deepEqual(calls, [{ type: "details", guid: "rest-guid" }]);
});

test("REST V2 learning context falls back to a programmer-controlled HTTPS domain when no runtime redirect was captured", () => {
  const seededApp = {
    guid: "rest-guid",
    appData: {
      requestor: "turner",
      serviceProviders: ["turner"],
    },
  };
  const { buildRestV2InteractiveDocsContext } = loadRestV2InteractiveDocsContextBuilder({
    programmer: {
      programmerId: "Turner",
      programmerName: "Turner",
      raw: {
        customSchemes: [{ customScheme: "adbe.turner://"}],
      },
    },
    services: {
      restV2: seededApp,
    },
    restV2Candidates: [seededApp],
    requestorContext: {
      requestorId: "turner",
      autoResolved: false,
      candidateCount: 1,
    },
    domainName: "turner.example.test",
  });

  const result = buildRestV2InteractiveDocsContext(
    {
      programmerId: "Turner",
      programmerName: "Turner",
      raw: {
        customSchemes: [{ customScheme: "adbe.turner://"}],
      },
    },
    {
      key: "sessions-create-session",
      usesBodyRedirectUrl: true,
    }
  );

  assert.equal(result.ok, true);
  assert.equal(result.redirectUrl, "https://turner.example.test");
});

test("REST V2 hydration falls back to the clicked docs URL when no runtime HTTPS redirectUrl is available", () => {
  const { buildRestV2InteractiveDocsHydrationPlan } = loadRestV2LearningPlanBuilder();
  const plan = buildRestV2InteractiveDocsHydrationPlan(
    {
      key: "sessions-create-session",
      operationId: "createSessionUsingPOST",
      operationAnchor: "operation/createSessionUsingPOST",
      requiresAccessToken: true,
      usesBodyRedirectUrl: true,
      requireBodyRedirectUrl: true,
      usesBodyDomainName: false,
      contentType: "application/x-www-form-urlencoded",
    },
    {
      serviceProviderId: "turner",
      requestorId: "turner",
      requestorAutoResolved: false,
      redirectUrl: "",
    },
    "test-token"
  );

  assert.equal(
    plan.fieldValues["body.redirectUrl"],
    "https://developer.adobe.com/adobe-pass/api/rest_api_v2/interactive/#operation/createSessionUsingPOST"
  );
  assert.deepEqual(Array.from(plan.missingRequiredFields || []), []);
});

test("REST V2 learning resolves the first configured channel domain for the selected requestor", () => {
  const { collectRestV2LearningRequestorDomainNames, resolveRestV2LearningRequestorDomainName } =
    loadRestV2LearningDomainResolver({
      state: {
        consoleBootstrapState: {
          channels: [
            {
              id: "turner",
              raw: {
                domains: [
                  { domainName: "turner.example.test" },
                  { domainName: "turner-alt.example.test" },
                ],
              },
            },
            {
              id: "fox",
              raw: {
                domains: [{ domainName: "fox.example.test" }],
              },
            },
          ],
        },
      },
    });

  const collected = Array.from(
    collectRestV2LearningRequestorDomainNames(
      {
        requestorOptions: [
          {
            id: "turner",
            raw: {
              domains: [
                { domainName: "turner.example.test" },
                { domainName: "turner-alt.example.test" },
              ],
            },
          },
        ],
      },
      "Turner"
    )
  );

  assert.deepEqual(collected, ["turner.example.test", "turner-alt.example.test"]);
  assert.equal(
    resolveRestV2LearningRequestorDomainName(
      {
        requestorOptions: [],
      },
      "@ServiceProvider:turner"
    ),
    "turner.example.test"
  );
});

test("REST V2 learning prefers parsed configuration domains and honors HARPO domain override", () => {
  const { collectRestV2LearningRequestorDomainNames, resolveRestV2LearningRequestorDomainName } =
    loadRestV2LearningDomainResolver({
      state: {
        consoleBootstrapState: {
          channels: [
            {
              id: "turner",
              raw: {
                domains: [{ domainName: "console.example.test" }],
              },
            },
          ],
        },
      },
      getRequestorScopedDomainCache(requestorId) {
        return String(requestorId || "").trim().toLowerCase() === "turner"
          ? [
              { domainName: "config-primary.example.test" },
              { domainName: "adobe.com" },
              { domainName: "config-alt.example.test" },
            ]
          : null;
      },
      getRequestorScopedHarpoSelectedDomain(requestorId) {
        return String(requestorId || "").trim().toLowerCase() === "turner"
          ? "config-alt.example.test"
          : "";
      },
    });

  assert.deepEqual(
    Array.from(
      collectRestV2LearningRequestorDomainNames(
        {
          requestorOptions: [
            {
              id: "turner",
              raw: {
                domains: [{ domainName: "requestor-option.example.test" }],
              },
            },
          ],
        },
        "turner"
      )
    ),
    ["config-primary.example.test", "config-alt.example.test"]
  );
  assert.equal(resolveRestV2LearningRequestorDomainName(null, "@ServiceProvider:turner"), "config-alt.example.test");
});

test("REST V2 learning enriches resource-bearing docs context from the console-backed MVPD resource pool", async () => {
  const snapshotCalls = [];
  const { enrichRestV2LearningResourcesFromConsoleContext, prepareRestV2InteractiveDocsContextForEntry } =
    loadRestV2LearningContextPreparer({
      loadSnapshot(selectionContext, options = {}) {
        snapshotCalls.push({
          programmerId: selectionContext?.programmerId,
          requestorId: selectionContext?.requestorId,
          mvpdId: selectionContext?.mvpdId,
          forceRefresh: options?.forceRefresh === true,
        });
        return {
          resourceIds: ["1234", "NBALP", "TMSIDX"],
          resourceIdsRaw: ["1234-raw", "NBALP-raw", "TMSIDX-raw"],
          selectionContext,
        };
      },
    });

  const enriched = await enrichRestV2LearningResourcesFromConsoleContext({
    ok: true,
    programmerId: "Turner",
    programmerName: "Turner",
    requestorId: "turner",
    serviceProviderId: "turner",
    mvpd: "Comcast_SSO",
    resourceIds: [],
    resourceIdPool: [],
  });

  assert.deepEqual(Array.from(enriched.resourceIdPool || []), ["1234", "NBALP", "TMSIDX"]);
  assert.deepEqual(Array.from(enriched.resourceIds || []), ["1234", "NBALP", "TMSIDX"]);
  assert.equal(enriched.resourceIdPoolSource, "console-tms-map");
  assert.deepEqual(snapshotCalls, [
    {
      programmerId: "Turner",
      requestorId: "turner",
      mvpdId: "Comcast_SSO",
      forceRefresh: false,
    },
  ]);

  const prepared = await prepareRestV2InteractiveDocsContextForEntry(
    {
      key: "decisions-authorize",
      usesBodyResources: true,
      usesBodySamlResponse: false,
    },
    {
      ok: true,
      programmerId: "Turner",
      programmerName: "Turner",
      requestorId: "turner",
      serviceProviderId: "turner",
      mvpd: "Comcast_SSO",
      resourceIds: [],
      resourceIdPool: [],
    }
  );

  assert.deepEqual(Array.from(prepared.resourceIds || []), ["1234", "NBALP", "TMSIDX"]);
  assert.equal(prepared.resourceIdPoolSource, "console-tms-map");
});

test("REST V2 learning force-refreshes the selected MVPD snapshot when cached resourceIds stay empty", async () => {
  const snapshotCalls = [];
  const { enrichRestV2LearningResourcesFromConsoleContext } = loadRestV2LearningContextPreparer({
    loadSnapshot(selectionContext, options = {}) {
      snapshotCalls.push({
        programmerId: selectionContext?.programmerId,
        requestorId: selectionContext?.requestorId,
        mvpdId: selectionContext?.mvpdId,
        forceRefresh: options?.forceRefresh === true,
      });
      return options?.forceRefresh === true
        ? {
            resourceIdsRaw: ["R1", "R2", "R3"],
          }
        : {
            resourceIdsRaw: [],
          };
    },
  });

  const enriched = await enrichRestV2LearningResourcesFromConsoleContext({
    ok: true,
    programmerId: "Turner",
    programmerName: "Turner",
    requestorId: "turner",
    serviceProviderId: "turner",
    mvpd: "Comcast_SSO",
    resourceIds: [],
    resourceIdPool: [],
  });

  assert.deepEqual(Array.from(enriched.resourceIdPool || []), ["R1", "R2", "R3"]);
  assert.deepEqual(Array.from(enriched.resourceIds || []), ["R1", "R2", "R3"]);
  assert.equal(enriched.resourceIdPoolSource, "console-tms-map");
  assert.deepEqual(snapshotCalls, [
    {
      programmerId: "Turner",
      requestorId: "turner",
      mvpdId: "Comcast_SSO",
      forceRefresh: false,
    },
    {
      programmerId: "Turner",
      requestorId: "turner",
      mvpdId: "Comcast_SSO",
      forceRefresh: true,
    },
  ]);
});

test("REST V2 learning hydrates partner-path and framework status from the debug flow even when SAML is already present", async () => {
  let snapshotCalls = 0;
  const flowSnapshot = {
    partnerFrameworkStatus: "framework-status-token",
    partner: "Apple",
  };
  const { prepareRestV2InteractiveDocsContextForEntry } = loadRestV2LearningContextPreparer({
    getFlowSnapshot() {
      snapshotCalls += 1;
      return flowSnapshot;
    },
    hydratePartnerContext(context, flow) {
      context.partnerFrameworkStatus = String(flow?.partnerFrameworkStatus || "").trim();
      context.partner = String(flow?.partner || "").trim();
      return context;
    },
    isFrameworkStatusUsable(value = "") {
      return String(value || "").trim() === "framework-status-token";
    },
  });

  const prepared = await prepareRestV2InteractiveDocsContextForEntry(
    {
      key: "partner-sso-verification-token",
      usesPartnerPath: true,
      usesPartnerFrameworkStatus: true,
      usesBodySamlResponse: false,
    },
    {
      ok: true,
      partner: "",
      partnerFrameworkStatus: "",
      samlResponse: "PHNhbWxwOlJlc3BvbnNlPg==",
      flowId: "flow-123",
    }
  );

  assert.equal(snapshotCalls, 1);
  assert.equal(prepared.partner, "Apple");
  assert.equal(prepared.partnerFrameworkStatus, "framework-status-token");
});

test("REST V2 learning falls back to inferred partner SSO context when the recorded flow only retained partner auth artifacts", async () => {
  let snapshotCalls = 0;
  const validLearningFrameworkStatus = Buffer.from(
    JSON.stringify({
      frameworkPermissionInfo: {
        accessStatus: "granted",
      },
      frameworkProviderInfo: {
        id: "comcast-provider-map",
        expirationDate: String(Date.now() + 60 * 60 * 1000),
      },
      frameworkPartnerInfo: {
        name: "Apple",
      },
    }),
    "utf8"
  ).toString("base64");
  const { prepareRestV2InteractiveDocsContextForEntry } = loadRestV2LearningContextPreparer({
    getFlowSnapshot() {
      snapshotCalls += 1;
      return {
        flowId: "flow-123",
        events: [
          {
            source: "web-request",
            phase: "cookies-snapshot",
            cookies: [
              {
                name: "r-apt",
                value: "jwt-placeholder",
              },
            ],
          },
        ],
      };
    },
    hydrateLearningPartnerContext(context) {
      context.learningPartner = "Apple";
      context.learningPartnerFrameworkStatus = validLearningFrameworkStatus;
      context.learningPartnerSource = "recorded r-apt cookie";
      return context;
    },
    isFrameworkStatusUsable(value = "") {
      return String(value || "").trim() === validLearningFrameworkStatus;
    },
  });

  const prepared = await prepareRestV2InteractiveDocsContextForEntry(
    {
      key: "partner-sso-verification-token",
      usesPartnerPath: true,
      usesPartnerFrameworkStatus: true,
      usesBodySamlResponse: false,
    },
    {
      ok: true,
      partner: "",
      partnerFrameworkStatus: "",
      mvpdMeta: {
        id: "Comcast_SSO",
        name: "Xfinity",
        platformMappingId: "comcast-provider-map",
      },
      flowId: "flow-123",
    }
  );

  assert.equal(snapshotCalls, 1);
  assert.equal(prepared.learningPartner, "Apple");
  assert.equal(prepared.learningPartnerFrameworkStatus, validLearningFrameworkStatus);
  assert.equal(prepared.learningPartnerSource, "recorded r-apt cookie");
});

test("REST V2 MVPD meta keeps cached platform mapping when callers only provide a name snapshot", () => {
  const cachedMetaById = new Map([
    [
      "Comcast_SSO",
      {
        id: "Comcast_SSO",
        name: "Xfinity",
        platformMappingId: "comcast-provider-map",
      },
    ],
  ]);
  const { getRestV2MvpdMeta } = loadRestV2MvpdMetaResolver({
    getRequestorScopedMvpdCache() {
      return cachedMetaById;
    },
  });

  const resolved = getRestV2MvpdMeta("turner", "Comcast_SSO", {
    id: "Comcast_SSO",
    name: "Xfinity",
  });

  assert.equal(resolved.id, "Comcast_SSO");
  assert.equal(resolved.name, "Xfinity");
  assert.equal(resolved.platformMappingId, "comcast-provider-map");
});

test("REST V2 MVPD meta preserves selected Comcast_SSO mappings when stale context metadata drifts to generic Comcast", () => {
  const cachedMetaById = new Map([
    [
      "Comcast_SSO",
      {
        id: "Comcast_SSO",
        name: "Xfinity (Comcast_SSO)",
        platformMappingId: "Comcast_SSO_Apple",
        partnerPlatformMappings: {
          Apple: "Comcast_SSO_Apple",
          Amazon: "Comcast_SSO",
        },
      },
    ],
  ]);
  const { getRestV2MvpdMeta } = loadRestV2MvpdMetaResolver({
    getRequestorScopedMvpdCache() {
      return cachedMetaById;
    },
  });

  const resolved = getRestV2MvpdMeta("MML", "Comcast_SSO", {
    id: "Comcast",
    name: "Comcast",
    platformMappingId: "Comcast",
    partnerPlatformMappings: {
      Apple: "Comcast",
      Amazon: "Comcast",
    },
  });

  assert.equal(resolved.id, "Comcast_SSO");
  assert.equal(resolved.name, "Xfinity (Comcast_SSO)");
  assert.equal(resolved.platformMappingId, "Comcast_SSO_Apple");
  assert.equal(resolved.partnerPlatformMappings.Apple, "Comcast_SSO_Apple");
  assert.equal(resolved.partnerPlatformMappings.Amazon, "Comcast_SSO");
});

test("REST V2 MVPD meta preserves a generic Comcast Apple mapping when it is the only provider mapping available", () => {
  const { getRestV2MvpdMeta } = loadRestV2MvpdMetaResolver({
    getRequestorScopedMvpdCache() {
      return null;
    },
  });

  const resolved = getRestV2MvpdMeta("MML", "Comcast_SSO", {
    id: "Comcast_SSO",
    name: "Xfinity (Comcast_SSO)",
    platformMappingId: "Comcast",
    partnerPlatformMappings: {
      Apple: "Comcast",
    },
  });

  assert.equal(resolved.id, "Comcast_SSO");
  assert.equal(resolved.platformMappingId, "Comcast");
  assert.equal(resolved.partnerPlatformMappings.Apple, "Comcast");
});

test("REST V2 partner snapshot resolver preserves the Apple-specific provider mapping for Comcast partner SSO", () => {
  const { resolveRestV2PartnerPlatformMappingDetailsFromSnapshot } =
    loadRestV2PartnerPlatformMappingSnapshotResolver();

  const resolved = resolveRestV2PartnerPlatformMappingDetailsFromSnapshot(
    {
      partnerSsoPlatforms: [
        {
          partner: "Amazon",
          mappingId: "Comcast_SSO",
          integrationEnabled: true,
          boardingStatus: "NOT_SUPPORTED",
        },
        {
          partner: "Apple",
          mappingId: "Comcast_SSO_Apple",
          integrationEnabled: true,
          boardingStatus: "PICKER",
        },
      ],
    },
    ["Apple"]
  );

  assert.equal(resolved.resolvedPartner, "Apple");
  assert.equal(resolved.resolvedMappingId, "Comcast_SSO_Apple");
  assert.equal(resolved.resolvedPreferredProviderId, "Comcast_SSO_Apple");
  assert.equal(resolved.partnerPlatformMappings.Apple, "Comcast_SSO_Apple");
  assert.equal(resolved.partnerPlatformMappings.Amazon, "Comcast_SSO");
  assert.deepEqual(Array.from(resolved.partnerProviderIdCandidates.Apple || []), ["Comcast_SSO_Apple"]);
});

test("REST V2 partner snapshot resolver keeps Apple platform setting ids when they outrank a generic mapping id", () => {
  const { resolveRestV2PartnerPlatformMappingDetailsFromSnapshot } =
    loadRestV2PartnerPlatformMappingSnapshotResolver();

  const resolved = resolveRestV2PartnerPlatformMappingDetailsFromSnapshot(
    {
      partnerSsoPlatforms: [
        {
          partner: "Apple",
          mappingId: "Comcast",
          platformSettingIds: ["Comcast_SSO_Apple"],
          providerIdCandidates: ["Comcast_SSO_Apple", "Comcast"],
          preferredProviderId: "Comcast_SSO_Apple",
          integrationEnabled: true,
          boardingStatus: "PICKER",
        },
      ],
    },
    ["Apple"]
  );

  assert.equal(resolved.resolvedPartner, "Apple");
  assert.equal(resolved.resolvedMappingId, "Comcast");
  assert.equal(resolved.resolvedPreferredProviderId, "Comcast_SSO_Apple");
  assert.deepEqual(Array.from(resolved.resolvedPlatformSettingIds || []), ["Comcast_SSO_Apple"]);
  assert.deepEqual(Array.from(resolved.resolvedProviderIdCandidates || []), ["Comcast_SSO_Apple", "Comcast"]);
});

test("REST V2 partner platform hydrator upgrades a generic captured Comcast framework provider to the Apple partner mapping from the snapshot", async () => {
  const genericFrameworkStatus = Buffer.from(
    JSON.stringify({
      frameworkPermissionInfo: {
        accessStatus: "granted",
      },
      frameworkProviderInfo: {
        id: "Comcast_SSO",
        expirationDate: String(Date.now() + 60 * 60 * 1000),
      },
      frameworkPartnerInfo: {
        name: "Apple",
      },
    }),
    "utf8"
  ).toString("base64");
  const { hydrateRestV2PartnerPlatformMappingFromConsoleContext } = loadRestV2PartnerPlatformMappingHydrator({
    resolveMvpdMeta(_requestorId, _mvpdId, mvpdMeta) {
      return mvpdMeta || {
        id: "Comcast_SSO",
        name: "Xfinity",
      };
    },
    loadSnapshot() {
      return {
        partnerSsoPlatforms: [
          {
            partner: "Apple",
            mappingId: "Comcast_SSO_Apple",
            platformSettingIds: ["Comcast_SSO_Apple"],
            providerIdCandidates: ["Comcast_SSO_Apple"],
            preferredProviderId: "Comcast_SSO_Apple",
            integrationEnabled: true,
            boardingStatus: "PICKER",
          },
        ],
      };
    },
  });

  const context = {
    programmerId: "Turner",
    programmerName: "Turner",
    requestorId: "MML",
    serviceProviderId: "MML",
    mvpd: "Comcast_SSO",
    partnerFrameworkStatus: genericFrameworkStatus,
    learningPartner: "Apple",
    mvpdMeta: {
      id: "Comcast_SSO",
      name: "Xfinity",
    },
  };

  await hydrateRestV2PartnerPlatformMappingFromConsoleContext(context, {
    forceRefresh: false,
  });

  assert.equal(context.mvpdPartnerProviderId, "Comcast_SSO_Apple");
  assert.equal(context.mvpdPlatformMappingId, "Comcast_SSO_Apple");
  assert.equal(context.mvpdMeta.platformMappingId, "Comcast_SSO_Apple");
  assert.equal(context.mvpdMeta.partnerPlatformMappings.Apple, "Comcast_SSO_Apple");
  assert.deepEqual(Array.from(context.mvpdMeta.partnerPlatformSettingIds.Apple || []), ["Comcast_SSO_Apple"]);
  assert.deepEqual(Array.from(context.mvpdMeta.partnerProviderIdCandidates.Apple || []), ["Comcast_SSO_Apple"]);
});

test("REST V2 partner platform hydrator persists resolved Apple partner mappings into the requestor-scoped MVPD cache", async () => {
  const requestorCache = new Map([
    [
      "Comcast_SSO",
      {
        id: "Comcast_SSO",
        name: "Xfinity",
        platformMappingId: "Comcast_SSO",
      },
    ],
  ]);
  const { hydrateRestV2PartnerPlatformMappingFromConsoleContext } = loadRestV2PartnerPlatformMappingHydrator({
    getRequestorScopedMvpdCache(requestorId) {
      return requestorId === "MML" ? requestorCache : null;
    },
    setRequestorScopedMvpdCache(requestorId, value) {
      if (requestorId === "MML" && value && typeof value.get === "function" && typeof value.forEach === "function") {
        requestorCache.clear();
        value.forEach((entryValue, entryKey) => {
          requestorCache.set(entryKey, entryValue);
        });
      }
      return value;
    },
    resolveMvpdMeta(_requestorId, mvpdId, mvpdMeta) {
      return mvpdMeta || requestorCache.get(mvpdId) || null;
    },
    loadSnapshot() {
      return {
        partnerSsoPlatforms: [
          {
            partner: "Apple",
            mappingId: "Comcast_SSO_Apple",
            platformSettingIds: ["Comcast_SSO_Apple"],
            providerIdCandidates: ["Comcast_SSO_Apple"],
            preferredProviderId: "Comcast_SSO_Apple",
            integrationEnabled: true,
            boardingStatus: "PICKER",
          },
        ],
      };
    },
  });

  const context = {
    programmerId: "Turner",
    programmerName: "Turner",
    requestorId: "MML",
    serviceProviderId: "MML",
    mvpd: "Comcast_SSO",
    learningPartner: "Apple",
    mvpdMeta: {
      id: "Comcast_SSO",
      name: "Xfinity",
      platformMappingId: "Comcast_SSO",
    },
  };

  await hydrateRestV2PartnerPlatformMappingFromConsoleContext(context, {
    forceRefresh: false,
  });

  const cached = requestorCache.get("Comcast_SSO");
  assert.equal(context.mvpdPartnerProviderId, "Comcast_SSO_Apple");
  assert.equal(cached.platformMappingId, "Comcast_SSO_Apple");
  assert.equal(cached.partnerPlatformMappings.Apple, "Comcast_SSO_Apple");
  assert.deepEqual(Array.from(cached.partnerPlatformSettingIds.Apple || []), ["Comcast_SSO_Apple"]);
  assert.deepEqual(Array.from(cached.partnerProviderIdCandidates.Apple || []), ["Comcast_SSO_Apple"]);
});

test("REST V2 learning framework status builder prefers cached partner platform mappings over a generic Comcast provider id", () => {
  const { buildRestV2LearningPartnerFrameworkStatus } = loadRestV2LearningPartnerFrameworkStatusBuilder({
    resolveMvpdMeta(_requestorId, _mvpdId, mvpdMeta) {
      return mvpdMeta || null;
    },
  });

  const encoded = buildRestV2LearningPartnerFrameworkStatus(
    {
      requestorId: "MML",
      serviceProviderId: "MML",
      mvpd: "Comcast_SSO",
      mvpdMeta: {
        id: "Comcast_SSO",
        name: "Xfinity",
        platformMappingId: "Comcast_SSO",
        partnerPlatformMappings: {
          Apple: "Comcast_SSO_Apple",
        },
      },
    },
    {
      updatedAt: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
    },
    {
      signalSource: "recorded partner auth flow",
    },
    "Apple"
  );

  const payload = JSON.parse(Buffer.from(encoded, "base64").toString("utf8"));
  assert.equal(payload.frameworkProviderInfo.id, "Comcast_SSO_Apple");
  assert.equal(payload.frameworkPartnerInfo.name, "Apple");
});

test("REST V2 learning framework status builder synthesizes a requestor-scoped Apple provider id when only a generic Comcast mapping is available", () => {
  const { buildRestV2LearningPartnerFrameworkStatus } = loadRestV2LearningPartnerFrameworkStatusBuilder({
    resolveMvpdMeta(_requestorId, _mvpdId, mvpdMeta) {
      return mvpdMeta || null;
    },
  });

  const encoded = buildRestV2LearningPartnerFrameworkStatus(
    {
      requestorId: "MML",
      serviceProviderId: "MML",
      mvpd: "Comcast_SSO",
      mvpdPlatformMappingId: "Comcast",
      mvpdMeta: {
        id: "Comcast",
        name: "Comcast",
        platformMappingId: "Comcast",
      },
    },
    {
      updatedAt: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
    },
    {
      signalSource: "recorded partner auth flow",
    },
    "Apple"
  );

  const payload = JSON.parse(Buffer.from(encoded, "base64").toString("utf8"));
  assert.equal(payload.frameworkProviderInfo.id, "MML_Comcast_SSO");
  assert.equal(payload.frameworkPartnerInfo.name, "Apple");
});

test("REST V2 learning framework status builder prefers a requestor-scoped provider id over a generic cached Apple mapping when Comcast_SSO is selected", () => {
  const { buildRestV2LearningPartnerFrameworkStatus } = loadRestV2LearningPartnerFrameworkStatusBuilder({
    resolveMvpdMeta(_requestorId, _mvpdId, mvpdMeta) {
      return mvpdMeta || null;
    },
  });

  const encoded = buildRestV2LearningPartnerFrameworkStatus(
    {
      requestorId: "MML",
      serviceProviderId: "MML",
      mvpd: "Comcast_SSO",
      mvpdPlatformMappingId: "Comcast",
      mvpdMeta: {
        id: "Comcast_SSO",
        name: "Xfinity (Comcast_SSO)",
        platformMappingId: "Comcast",
        partnerPlatformMappings: {
          Apple: "Comcast",
        },
      },
    },
    {
      updatedAt: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
    },
    {
      signalSource: "recorded partner auth flow",
    },
    "Apple"
  );

  const payload = JSON.parse(Buffer.from(encoded, "base64").toString("utf8"));
  assert.equal(payload.frameworkProviderInfo.id, "MML_Comcast_SSO");
  assert.equal(payload.frameworkPartnerInfo.name, "Apple");
});

test("REST V2 learning preserves an exact generic Comcast provider mapping when it was captured from the real partner flow", () => {
  const { buildRestV2InteractiveDocsHydrationPlan } = loadRestV2LearningPlanBuilder();
  const genericFrameworkStatus = Buffer.from(
    JSON.stringify({
      frameworkPermissionInfo: {
        accessStatus: "granted",
      },
      frameworkProviderInfo: {
        id: "Comcast",
        expirationDate: String(Date.now() + 60 * 60 * 1000),
      },
      frameworkPartnerInfo: {
        name: "Apple",
      },
    }),
    "utf8"
  ).toString("base64");

  const plan = buildRestV2InteractiveDocsHydrationPlan(
    {
      key: "partner-sso-verification-token",
      operationId: "retrieveVerificationTokenUsingPOST",
      operationAnchor: "operation/retrieveVerificationTokenUsingPOST",
      requiresAccessToken: true,
      usesDeviceHeaders: true,
      usesPartnerPath: true,
      requirePartnerPath: true,
      usesPartnerFrameworkStatus: true,
      requirePartnerFrameworkStatus: true,
      usesBodyDomainName: true,
      requireBodyDomainName: true,
      usesBodyRedirectUrl: true,
      requireBodyRedirectUrl: true,
      contentType: "application/x-www-form-urlencoded",
    },
    {
      serviceProviderId: "turner",
      requestorId: "turner",
      requestorAutoResolved: false,
      mvpd: "Comcast_SSO",
      mvpdMeta: {
        id: "Comcast_SSO",
        name: "Xfinity",
        platformMappingId: "Comcast",
      },
      partner: "",
      partnerFrameworkStatus: genericFrameworkStatus,
      learningPartner: "Apple",
      learningPartnerFrameworkStatus: "",
      learningPartnerSource: "recorded r-apt cookie",
      domainName: "experience.example.test",
      redirectUrl: "https://experience.example.test/callback",
    },
    "test-token"
  );

  assert.equal(plan.fieldValues["path.partner"], "Apple");
  assert.equal(plan.fieldValues["header.AP-Partner-Framework-Status"], genericFrameworkStatus);
  assert.deepEqual(Array.from(plan.missingRequiredFields || []), []);
  assert.deepEqual(Array.from(plan.clearFieldNames || []), []);
});

test("REST V2 partner platform hydrator promotes cached Apple partner mappings even when the live snapshot is unavailable", async () => {
  const { hydrateRestV2PartnerPlatformMappingFromConsoleContext } = loadRestV2PartnerPlatformMappingHydrator({
    resolveMvpdMeta(_requestorId, _mvpdId, mvpdMeta) {
      return mvpdMeta || null;
    },
    loadSnapshot() {
      return null;
    },
  });

  const context = {
    programmerId: "Turner",
    programmerName: "Turner",
    requestorId: "MML",
    serviceProviderId: "MML",
    mvpd: "Comcast_SSO",
    learningPartner: "Apple",
    mvpdPlatformMappingId: "",
    mvpdMeta: {
      id: "Comcast_SSO",
      name: "Xfinity",
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
  };

  await hydrateRestV2PartnerPlatformMappingFromConsoleContext(context, {
    forceRefresh: false,
  });

  assert.equal(context.mvpdPartnerProviderId, "Comcast_SSO_Apple");
  assert.equal(context.mvpdPlatformMappingId, "Comcast_SSO_Apple");
  assert.equal(context.mvpdMeta.platformMappingId, "Comcast_SSO_Apple");
  assert.equal(context.mvpdMeta.partnerPlatformMappings.Apple, "Comcast_SSO_Apple");
  assert.deepEqual(Array.from(context.mvpdMeta.partnerPlatformSettingIds.Apple || []), ["Comcast_SSO_Apple"]);
  assert.deepEqual(Array.from(context.mvpdMeta.partnerProviderIdCandidates.Apple || []), ["Comcast_SSO_Apple"]);
});

test("REST V2 partner platform hydrator drops a generic cached Apple mapping when the live snapshot is unavailable", async () => {
  const { hydrateRestV2PartnerPlatformMappingFromConsoleContext } = loadRestV2PartnerPlatformMappingHydrator({
    resolveMvpdMeta(_requestorId, _mvpdId, mvpdMeta) {
      return mvpdMeta || null;
    },
    loadSnapshot() {
      return null;
    },
  });

  const context = {
    programmerId: "Turner",
    programmerName: "Turner",
    requestorId: "MML",
    serviceProviderId: "MML",
    mvpd: "Comcast_SSO",
    learningPartner: "Apple",
    mvpdPlatformMappingId: "Comcast",
    mvpdMeta: {
      id: "Comcast_SSO",
      name: "Xfinity (Comcast_SSO)",
      platformMappingId: "Comcast",
      partnerPlatformMappings: {
        Apple: "Comcast",
      },
    },
  };

  await hydrateRestV2PartnerPlatformMappingFromConsoleContext(context, {
    forceRefresh: false,
  });

  assert.equal(context.mvpdPlatformMappingId, "Comcast_SSO");
  assert.equal(context.mvpdMeta.platformMappingId, "Comcast_SSO");
  assert.equal(context.mvpdMeta.partnerPlatformMappings.Apple, "Comcast");
});

test("REST V2 learning reruns inferred partner hydration after console snapshot mapping resolves the Comcast Apple provider id", async () => {
  let learningHydrationCalls = 0;
  const validLearningFrameworkStatus = Buffer.from(
    JSON.stringify({
      frameworkPermissionInfo: {
        accessStatus: "granted",
      },
      frameworkProviderInfo: {
        id: "Comcast_SSO_Apple",
        expirationDate: String(Date.now() + 60 * 60 * 1000),
      },
      frameworkPartnerInfo: {
        name: "Apple",
      },
    }),
    "utf8"
  ).toString("base64");
  const { prepareRestV2InteractiveDocsContextForEntry } = loadRestV2LearningContextPreparer({
    getFlowSnapshot() {
      return {
        flowId: "flow-123",
        events: [
          {
            source: "web-request",
            phase: "cookies-snapshot",
            cookies: [
              {
                name: "r-apt",
                value: "jwt-placeholder",
              },
            ],
          },
        ],
      };
    },
    hydrateLearningPartnerContext(context) {
      learningHydrationCalls += 1;
      context.learningPartner = "Apple";
      context.learningPartnerSource = "recorded r-apt cookie";
      if (String(context?.mvpdPlatformMappingId || "").trim() === "Comcast_SSO_Apple") {
        context.learningPartnerFrameworkStatus = validLearningFrameworkStatus;
      }
      return context;
    },
    hydratePartnerPlatformMapping(context) {
      context.mvpdPlatformMappingId = "Comcast_SSO_Apple";
      context.mvpdMeta = {
        ...(context.mvpdMeta || {}),
        id: "Comcast_SSO",
        name: "Xfinity",
        platformMappingId: "Comcast_SSO_Apple",
        partnerPlatformMappings: {
          Apple: "Comcast_SSO_Apple",
        },
      };
      return context;
    },
    isFrameworkStatusUsable(value = "") {
      return String(value || "").trim() === validLearningFrameworkStatus;
    },
  });

  const prepared = await prepareRestV2InteractiveDocsContextForEntry(
    {
      key: "partner-sso-create-profile",
      usesPartnerPath: true,
      usesPartnerFrameworkStatus: true,
      usesBodySamlResponse: false,
    },
    {
      ok: true,
      programmerId: "Turner",
      programmerName: "Turner",
      requestorId: "MML",
      serviceProviderId: "MML",
      mvpd: "Comcast_SSO",
      mvpdMeta: {
        id: "Comcast_SSO",
        name: "Xfinity",
      },
      partner: "",
      partnerFrameworkStatus: "",
      learningPartner: "",
      learningPartnerFrameworkStatus: "",
      flowId: "flow-123",
    }
  );

  assert.equal(learningHydrationCalls, 2);
  assert.equal(prepared.mvpdPlatformMappingId, "Comcast_SSO_Apple");
  assert.equal(prepared.learningPartner, "Apple");
  assert.equal(prepared.learningPartnerFrameworkStatus, validLearningFrameworkStatus);
});

test("REST V2 learning reruns inferred partner hydration when the recorded framework status stays generic but the snapshot resolves Comcast Apple", async () => {
  let learningHydrationCalls = 0;
  const genericFrameworkStatus = Buffer.from(
    JSON.stringify({
      frameworkPermissionInfo: {
        accessStatus: "granted",
      },
      frameworkProviderInfo: {
        id: "Comcast_SSO",
        expirationDate: String(Date.now() + 60 * 60 * 1000),
      },
      frameworkPartnerInfo: {
        name: "Apple",
      },
    }),
    "utf8"
  ).toString("base64");
  const validLearningFrameworkStatus = Buffer.from(
    JSON.stringify({
      frameworkPermissionInfo: {
        accessStatus: "granted",
      },
      frameworkProviderInfo: {
        id: "Comcast_SSO_Apple",
        expirationDate: String(Date.now() + 60 * 60 * 1000),
      },
      frameworkPartnerInfo: {
        name: "Apple",
      },
    }),
    "utf8"
  ).toString("base64");
  const { prepareRestV2InteractiveDocsContextForEntry } = loadRestV2LearningContextPreparer({
    getFlowSnapshot() {
      return {
        flowId: "flow-123",
        events: [
          {
            source: "web-request",
            phase: "cookies-snapshot",
            cookies: [
              {
                name: "r-apt",
                value: "jwt-placeholder",
              },
            ],
          },
        ],
      };
    },
    hydrateLearningPartnerContext(context) {
      learningHydrationCalls += 1;
      context.learningPartner = "Apple";
      context.learningPartnerSource = "recorded r-apt cookie";
      if (String(context?.mvpdPlatformMappingId || "").trim() === "Comcast_SSO_Apple") {
        context.learningPartnerFrameworkStatus = validLearningFrameworkStatus;
      }
      return context;
    },
    hydratePartnerPlatformMapping(context) {
      context.mvpdPlatformMappingId = "Comcast_SSO_Apple";
      context.mvpdMeta = {
        ...(context.mvpdMeta || {}),
        id: "Comcast_SSO",
        name: "Xfinity",
        platformMappingId: "Comcast_SSO_Apple",
        partnerPlatformMappings: {
          Apple: "Comcast_SSO_Apple",
        },
      };
      return context;
    },
    isFrameworkStatusUsable(value = "") {
      const normalized = String(value || "").trim();
      return normalized === genericFrameworkStatus || normalized === validLearningFrameworkStatus;
    },
  });

  const prepared = await prepareRestV2InteractiveDocsContextForEntry(
    {
      key: "partner-sso-create-profile",
      usesPartnerPath: true,
      usesPartnerFrameworkStatus: true,
      usesBodySamlResponse: false,
    },
    {
      ok: true,
      programmerId: "Turner",
      programmerName: "Turner",
      requestorId: "MML",
      serviceProviderId: "MML",
      mvpd: "Comcast_SSO",
      mvpdMeta: {
        id: "Comcast_SSO",
        name: "Xfinity",
      },
      partner: "",
      partnerFrameworkStatus: genericFrameworkStatus,
      learningPartner: "",
      learningPartnerFrameworkStatus: "",
      flowId: "flow-123",
    }
  );

  assert.equal(learningHydrationCalls, 2);
  assert.equal(prepared.mvpdPlatformMappingId, "Comcast_SSO_Apple");
  assert.equal(prepared.learningPartner, "Apple");
  assert.equal(prepared.partnerFrameworkStatus, genericFrameworkStatus);
  assert.equal(prepared.learningPartnerFrameworkStatus, validLearningFrameworkStatus);
});

test("REST V2 learning does not rerun inferred partner framework hydration when an exact captured framework status is already present", async () => {
  let learningHydrationCalls = 0;
  const genericFrameworkStatus = Buffer.from(
    JSON.stringify({
      frameworkPermissionInfo: {
        accessStatus: "granted",
      },
      frameworkProviderInfo: {
        id: "Comcast_SSO",
        expirationDate: String(Date.now() + 60 * 60 * 1000),
      },
      frameworkPartnerInfo: {
        name: "Apple",
      },
    }),
    "utf8"
  ).toString("base64");
  const validLearningFrameworkStatus = Buffer.from(
    JSON.stringify({
      frameworkPermissionInfo: {
        accessStatus: "granted",
      },
      frameworkProviderInfo: {
        id: "Comcast_SSO_Apple",
        expirationDate: String(Date.now() + 60 * 60 * 1000),
      },
      frameworkPartnerInfo: {
        name: "Apple",
      },
    }),
    "utf8"
  ).toString("base64");
  const { prepareRestV2InteractiveDocsContextForEntry } = loadRestV2LearningContextPreparer({
    getFlowSnapshot() {
      return {
        flowId: "flow-123",
      };
    },
    hydrateLearningPartnerContext(context) {
      learningHydrationCalls += 1;
      if (String(context?.mvpdPlatformMappingId || "").trim() === "Comcast_SSO_Apple") {
        context.learningPartnerFrameworkStatus = validLearningFrameworkStatus;
      }
      return context;
    },
    hydratePartnerPlatformMapping(context) {
      context.mvpdPlatformMappingId = "Comcast_SSO_Apple";
      context.mvpdMeta = {
        ...(context.mvpdMeta || {}),
        id: "Comcast_SSO",
        name: "Xfinity",
        platformMappingId: "Comcast_SSO_Apple",
      };
      return context;
    },
    isFrameworkStatusUsable(value = "") {
      const normalized = String(value || "").trim();
      return normalized === genericFrameworkStatus || normalized === validLearningFrameworkStatus;
    },
  });

  const prepared = await prepareRestV2InteractiveDocsContextForEntry(
    {
      key: "partner-sso-create-profile",
      usesPartnerPath: true,
      usesPartnerFrameworkStatus: true,
      usesBodySamlResponse: false,
    },
    {
      ok: true,
      programmerId: "Turner",
      programmerName: "Turner",
      requestorId: "MML",
      serviceProviderId: "MML",
      mvpd: "Comcast_SSO",
      mvpdMeta: {
        id: "Comcast_SSO",
        name: "Xfinity",
      },
      partner: "Apple",
      partnerFrameworkStatus: genericFrameworkStatus,
      learningPartner: "",
      learningPartnerFrameworkStatus: "",
      flowId: "flow-123",
    }
  );

  assert.equal(learningHydrationCalls, 0);
  assert.equal(prepared.partnerFrameworkStatus, genericFrameworkStatus);
  assert.equal(prepared.mvpdPlatformMappingId, undefined);
  assert.equal(prepared.learningPartnerFrameworkStatus, "");
});

test("REST V2 learning keeps inferred partner framework payloads empty when the captured header is already usable", () => {
  const genericFrameworkStatus = Buffer.from(
    JSON.stringify({
      frameworkPermissionInfo: {
        accessStatus: "granted",
      },
      frameworkProviderInfo: {
        id: "Comcast_SSO",
        expirationDate: String(Date.now() + 60 * 60 * 1000),
      },
      frameworkPartnerInfo: {
        name: "Apple",
      },
    }),
    "utf8"
  ).toString("base64");
  const validLearningFrameworkStatus = Buffer.from(
    JSON.stringify({
      frameworkPermissionInfo: {
        accessStatus: "granted",
      },
      frameworkProviderInfo: {
        id: "Comcast_SSO_Apple",
        expirationDate: String(Date.now() + 60 * 60 * 1000),
      },
      frameworkPartnerInfo: {
        name: "Apple",
      },
    }),
    "utf8"
  ).toString("base64");
  const { hydrateRestV2LearningPartnerSsoContextFromDebugFlow } = loadRestV2LearningPartnerContextHydrator({
    resolvePartnerName() {
      return "Apple";
    },
    resolveFrameworkStatus(context) {
      return String(context?.partnerFrameworkStatus || "").trim();
    },
    normalizeFrameworkStatus(value = "") {
      return String(value || "").trim();
    },
    isFrameworkStatusUsable(value = "") {
      const normalized = String(value || "").trim();
      return normalized === genericFrameworkStatus || normalized === validLearningFrameworkStatus;
    },
    isFrameworkStatusCompatible(value = "") {
      return String(value || "").trim() === validLearningFrameworkStatus;
    },
    extractArtifacts() {
      return {
        rApt: "jwt-placeholder",
        signalSource: "recorded r-apt cookie",
      };
    },
    inferPartnerName() {
      return "Apple";
    },
    buildLearningFrameworkStatus() {
      return validLearningFrameworkStatus;
    },
  });

  const context = {
    requestorId: "MML",
    serviceProviderId: "MML",
    mvpd: "Comcast_SSO",
    mvpdPlatformMappingId: "Comcast_SSO_Apple",
    mvpdMeta: {
      id: "Comcast_SSO",
      name: "Xfinity",
      platformMappingId: "Comcast_SSO_Apple",
      partnerPlatformMappings: {
        Apple: "Comcast_SSO_Apple",
      },
    },
    partner: "Apple",
    partnerFrameworkStatus: genericFrameworkStatus,
    learningPartner: "",
    learningPartnerFrameworkStatus: "",
    learningPartnerSource: "",
  };

  hydrateRestV2LearningPartnerSsoContextFromDebugFlow(context, {
    flowId: "flow-123",
    events: [],
  });

  assert.equal(context.learningPartner, "Apple");
  assert.equal(context.learningPartnerSource, "recorded r-apt cookie");
  assert.equal(context.learningPartnerFrameworkStatus, "");
});

test("REST V2 learning hydrates optional SSO headers from the debug flow when the current context has not retained them yet", async () => {
  let snapshotCalls = 0;
  const { prepareRestV2InteractiveDocsContextForEntry } = loadRestV2LearningContextPreparer({
    getFlowSnapshot() {
      snapshotCalls += 1;
      return {
        flowId: "flow-123",
      };
    },
    hydrateOptionalHeaders(context) {
      context.adobeSubjectToken = "subject-token-payload";
      context.adServiceToken = "service-token-payload";
      context.tempPassIdentity = "encoded-temp-pass-identity";
      context.visitorIdentifier = "20265673158980419722735089753036633573";
      return context;
    },
  });

  const prepared = await prepareRestV2InteractiveDocsContextForEntry(
    {
      key: "decisions-authorize",
      usesAdobeSubjectToken: true,
      usesAdServiceToken: true,
      usesTempPassIdentity: true,
      usesVisitorIdentifier: true,
    },
    {
      ok: true,
      flowId: "flow-123",
      adobeSubjectToken: "",
      adServiceToken: "",
      tempPassIdentity: "",
      visitorIdentifier: "",
    }
  );

  assert.equal(snapshotCalls, 1);
  assert.equal(prepared.adobeSubjectToken, "subject-token-payload");
  assert.equal(prepared.adServiceToken, "service-token-payload");
  assert.equal(prepared.tempPassIdentity, "encoded-temp-pass-identity");
  assert.equal(prepared.visitorIdentifier, "20265673158980419722735089753036633573");
});

test("REST V2 partner hydrator keeps exact Section 6 PFS empty after a verified completed partner flow when no exact header was captured", () => {
  const encodedSaml = Buffer.from("<samlp:Response>ok</samlp:Response>", "utf8").toString("base64");
  const { hydrateRestV2PartnerSsoContextFromDebugFlow } = loadRestV2PartnerContextHydrator({
    extractArtifacts() {
      return {
        rApt: "jwt-placeholder",
        signalSource: "recorded r-apt cookie",
      };
    },
    extractFrameworkStatus() {
      return "";
    },
    extractSaml() {
      return {
        samlResponse: encodedSaml,
        source: "tab-network:body",
        partner: "",
        trustedForPartnerSso: false,
      };
    },
  });

  const context = {
    requestorId: "MML",
    serviceProviderId: "MML",
    mvpd: "Comcast_SSO",
    mvpdPlatformMappingId: "Comcast_SSO",
    mvpdMeta: {
      id: "Comcast_SSO",
      name: "Xfinity (Comcast_SSO)",
      platformMappingId: "Comcast_SSO",
      partnerPlatformMappings: {
        Apple: "Comcast",
      },
    },
    learningPartner: "Apple",
    learningPartnerSource: "recorded r-apt cookie",
    partnerFrameworkStatus: "",
    samlResponse: "",
    samlSource: "",
    samlTrustedForPartnerSso: false,
    partnerSsoCompletedFlowVerified: true,
    sessionData: {},
  };

  hydrateRestV2PartnerSsoContextFromDebugFlow(context, {
    flowId: "flow-verified",
    updatedAt: new Date().toISOString(),
    events: [],
  });

  assert.equal(context.partnerFrameworkStatus, "");
  assert.equal(context.samlResponse, encodedSaml);
  assert.equal(context.samlSource, "tab-network:body");
  assert.equal(context.samlTrustedForPartnerSso, true);
});

test("REST V2 learning resource helpers merge the requestor x MVPD pool and sample ten unique ids", () => {
  const randomValues = [0.91, 0.18, 0.77, 0.06, 0.64, 0.41, 0.23, 0.88, 0.35, 0.52, 0.11, 0.69];
  let randomIndex = 0;
  const { collectRestV2LearningResourceIds, sampleRestV2LearningResourceIds } = loadRestV2LearningResourceHelpers({
    math: {
      random() {
        const value = randomValues[randomIndex % randomValues.length];
        randomIndex += 1;
        return value;
      },
    },
  });

  const pool = collectRestV2LearningResourceIds(
    {
      preauthzChecks: [
        { resourceIds: ["urn:resource:001", "urn:resource:002", "urn:resource:003"] },
        { resourceIds: ["urn:resource:003", "urn:resource:004"] },
      ],
    },
    [
      { resourceIds: ["urn:resource:004", "urn:resource:005", "urn:resource:006"] },
      { resourceIds: ["urn:resource:006", "urn:resource:007", "urn:resource:008"] },
      {
        resourceIds: [
          "urn:resource:009",
          "urn:resource:010",
          "urn:resource:011",
          "urn:resource:012",
          "urn:resource:001",
        ],
      },
    ]
  );

  assert.deepEqual(Array.from(pool), [
    "urn:resource:001",
    "urn:resource:002",
    "urn:resource:003",
    "urn:resource:004",
    "urn:resource:005",
    "urn:resource:006",
    "urn:resource:007",
    "urn:resource:008",
    "urn:resource:009",
    "urn:resource:010",
    "urn:resource:011",
    "urn:resource:012",
  ]);

  const sampled = Array.from(sampleRestV2LearningResourceIds(pool, 10));
  assert.equal(sampled.length, 10);
  assert.equal(new Set(sampled).size, 10);
  sampled.forEach((resourceId) => {
    assert.equal(pool.includes(resourceId), true);
  });
});

test("REST V2 learning activation locks operations until UnderPAR has the required runtime context", () => {
  const { buildRestV2InteractiveDocsEntryActivationState } = loadRestV2LearningActivationEvaluator({
    contextByEntryKey: {
      "configuration-service-provider": {
        ok: true,
        serviceProviderId: "turner",
        requestorId: "turner",
        appInfo: { guid: "rest-guid" },
      },
      "profiles-all": {
        ok: true,
        serviceProviderId: "turner",
        requestorId: "turner",
        appInfo: { guid: "rest-guid" },
      },
      "sessions-create-session": {
        ok: true,
        serviceProviderId: "turner",
        requestorId: "turner",
        mvpd: "",
        domainName: "",
        redirectUrl: "",
        appInfo: { guid: "rest-guid" },
      },
      "sessions-start-authentication": {
        ok: true,
        serviceProviderId: "turner",
        requestorId: "turner",
        sessionCode: "",
        appInfo: { guid: "rest-guid" },
      },
      "decisions-preauthorize": {
        ok: true,
        serviceProviderId: "turner",
        requestorId: "turner",
        mvpd: "Comcast_SSO",
        resourceIds: [],
        appInfo: { guid: "rest-guid" },
      },
    },
    planBuilder() {
      return {
        missingRequiredFields: [],
        notes: [],
      };
    },
  });

  const configurationState = buildRestV2InteractiveDocsEntryActivationState({
    key: "configuration-service-provider",
    requiresAccessToken: true,
  });
  assert.equal(configurationState.ready, true);

  const profilesAllState = buildRestV2InteractiveDocsEntryActivationState({
    key: "profiles-all",
    requiresAccessToken: true,
    usesDeviceHeaders: true,
  });
  assert.equal(profilesAllState.ready, true);

  const createSessionState = buildRestV2InteractiveDocsEntryActivationState({
    key: "sessions-create-session",
    requiresAccessToken: true,
    usesBodyMvpd: true,
    usesBodyDomainName: true,
    usesBodyRedirectUrl: true,
  });
  assert.equal(createSessionState.ready, false);
  assert.match(createSessionState.reason, /Select an MVPD/);
  assert.match(createSessionState.reason, /Channel domain/);

  const startAuthenticationState = buildRestV2InteractiveDocsEntryActivationState({
    key: "sessions-start-authentication",
    usesSessionCode: true,
    requireSessionCode: true,
  });
  assert.equal(startAuthenticationState.ready, false);
  assert.match(startAuthenticationState.reason, /session code/);

  const preauthorizeState = buildRestV2InteractiveDocsEntryActivationState({
    key: "decisions-preauthorize",
    usesMvpdPath: true,
    requireMvpdPath: true,
    usesBodyResources: true,
    requireBodyResources: true,
  });
  assert.equal(preauthorizeState.ready, false);
  assert.match(preauthorizeState.reason, /resourceIds/);
});

test("REST V2 learning activation unlocks login-derived operations after UnderPAR captures a real flow", () => {
  const readyContext = {
    ok: true,
    serviceProviderId: "turner",
    requestorId: "turner",
    mvpd: "Comcast_SSO",
    domainName: "experience.example.test",
    redirectUrl: "https://experience.example.test/callback",
    sessionCode: "session-code-123",
    resourceIds: ["urn:adobe:test-resource"],
    partner: "Roku",
    samlResponse: "PHNhbWxwOlJlc3BvbnNlPg==",
    samlSource: "REST V2 test form",
    samlTrustedForPartnerSso: true,
    flowId: "flow-123",
    appInfo: { guid: "rest-guid" },
  };
  const { buildRestV2InteractiveDocsEntryActivationState } = loadRestV2LearningActivationEvaluator({
    context: readyContext,
    planBuilder() {
      return {
        missingRequiredFields: [],
        notes: [],
      };
    },
  });

  const createSessionState = buildRestV2InteractiveDocsEntryActivationState({
    key: "sessions-create-session",
    requiresAccessToken: true,
    usesBodyMvpd: true,
    usesBodyDomainName: true,
    usesBodyRedirectUrl: true,
  });
  assert.equal(createSessionState.ready, true);

  const authorizeState = buildRestV2InteractiveDocsEntryActivationState({
    key: "decisions-authorize",
    requiresAccessToken: true,
    usesMvpdPath: true,
    requireMvpdPath: true,
    usesBodyResources: true,
    requireBodyResources: true,
  });
  assert.equal(authorizeState.ready, true);

  const verificationTokenState = buildRestV2InteractiveDocsEntryActivationState({
    key: "partner-sso-verification-token",
    requiresAccessToken: true,
    usesPartnerPath: true,
    requirePartnerPath: true,
    usesBodyDomainName: true,
    requireBodyDomainName: true,
    usesBodyRedirectUrl: true,
    requireBodyRedirectUrl: true,
  });
  assert.equal(verificationTokenState.ready, true);

  const createPartnerProfileState = buildRestV2InteractiveDocsEntryActivationState({
    key: "partner-sso-create-profile",
    requiresAccessToken: true,
    usesPartnerPath: true,
    requirePartnerPath: true,
    usesBodySamlResponse: true,
    requireBodySamlResponse: true,
  });
  assert.equal(createPartnerProfileState.ready, true);
});

test("REST V2 learning activation clears stale plan-missing partner SSO fields when runtime fallback context already satisfies them", () => {
  const { buildRestV2InteractiveDocsEntryActivationState } = loadRestV2LearningActivationEvaluator({
    context: {
      ok: true,
      serviceProviderId: "turner",
      requestorId: "turner",
      partner: "Apple",
      samlResponse: "PHNhbWxwOlJlc3BvbnNlPg==",
      samlSource: "REST V2 test form",
      samlTrustedForPartnerSso: true,
      flowId: "flow-123",
      appInfo: { guid: "rest-guid" },
    },
    planBuilder() {
      return {
        missingRequiredFields: ["path.partner", "body.SAMLResponse"],
        notes: [],
      };
    },
  });

  const createPartnerProfileState = buildRestV2InteractiveDocsEntryActivationState({
    key: "partner-sso-create-profile",
    requiresAccessToken: true,
    usesPartnerPath: true,
    requirePartnerPath: true,
    usesBodySamlResponse: true,
    requireBodySamlResponse: true,
  });

  assert.equal(createPartnerProfileState.ready, true);
  assert.deepEqual(Array.from(createPartnerProfileState.pendingFields || []), []);
});

test("REST V2 learning activation reuses prepared login state before evaluating deep-link readiness", () => {
  const { buildRestV2InteractiveDocsEntryActivationState } = loadRestV2LearningActivationEvaluator({
    context: {
      ok: true,
      serviceProviderId: "turner",
      requestorId: "turner",
      mvpd: "",
      domainName: "",
      redirectUrl: "",
      sessionCode: "",
      appInfo: { guid: "rest-guid" },
    },
    hydratePrepared(context) {
      context.sessionCode = "prepared-session-code";
      context.mvpd = "Comcast_SSO";
      context.domainName = "experience.example.test";
      context.redirectUrl = "https://experience.example.test/callback";
      return context;
    },
    planBuilder() {
      return {
        missingRequiredFields: [],
        notes: [],
      };
    },
  });

  const startAuthenticationState = buildRestV2InteractiveDocsEntryActivationState({
    key: "sessions-start-authentication",
    usesSessionCode: true,
    requireSessionCode: true,
  });
  assert.equal(startAuthenticationState.ready, true);

  const createSessionState = buildRestV2InteractiveDocsEntryActivationState({
    key: "sessions-create-session",
    requiresAccessToken: true,
    usesBodyMvpd: true,
    usesBodyDomainName: true,
    usesBodyRedirectUrl: true,
  });
  assert.equal(createSessionState.ready, true);
});

test("REST V2 learning context does not treat the selected SSO MVPD as the partner when partner metadata was not explicitly captured", () => {
  const seededApp = {
    guid: "rest-guid",
    appData: {
      requestor: "MML",
    },
  };
  const { buildRestV2InteractiveDocsContext } = loadRestV2InteractiveDocsContextBuilder({
    state: {
      selectedRequestorId: "MML",
      selectedMvpdId: "Comcast_SSO",
      restV2RecordingActive: false,
      restV2DebugFlowId: "",
    },
    programmer: {
      programmerId: "Turner",
      programmerName: "Turner",
    },
    services: {
      restV2: seededApp,
    },
    restV2Candidates: [seededApp],
    requestorContext: {
      requestorId: "MML",
      autoResolved: false,
      candidateCount: 1,
    },
    harvest: {
      mvpd: "Comcast_SSO",
      sessionAction: "authenticate",
      partnerFrameworkStatus: "framework-status-token",
      samlResponse: "PHNhbWxwOlJlc3BvbnNlPg==",
    },
    harvestContext: {
      ok: true,
      mvpd: "Comcast_SSO",
      sessionAction: "authenticate",
      partnerFrameworkStatus: "framework-status-token",
      samlResponse: "PHNhbWxwOlJlc3BvbnNlPg==",
      partner: "",
    },
  });

  const context = buildRestV2InteractiveDocsContext(
    {
      programmerId: "Turner",
      programmerName: "Turner",
    },
    {
      key: "partner-sso-create-profile",
      usesPartnerPath: true,
      usesBodySamlResponse: true,
    }
  );

  assert.equal(context.ok, true);
  assert.equal(context.partner, "");
  assert.equal(context.mvpd, "Comcast_SSO");
  assert.equal(context.samlResponse, "PHNhbWxwOlJlc3BvbnNlPg==");
});

test("REST V2 harvest context preserves partner SSO artifacts for later LEARNING deeplink hydration", () => {
  const { buildRestV2ContextFromHarvest } = loadRestV2HarvestContextBuilder();
  const context = buildRestV2ContextFromHarvest({
    programmerId: "Turner",
    programmerName: "Turner",
    requestorId: "turner",
    serviceProviderId: "turner",
    mvpd: "Comcast_SSO",
    mvpdName: "Xfinity",
    appGuid: "rest-guid",
    appName: "REST V2",
    sessionCode: "session-code-123",
    sessionPartner: "Apple",
    partner: "Apple",
    partnerFrameworkStatus: "framework-status-token",
    partnerFrameworkStatusSource: "verified completed partner auth flow",
    allowPartnerFrameworkSelectedMvpdFallback: true,
    adobeSubjectToken: "subject-token-payload",
    adServiceToken: "service-token-payload",
    tempPassIdentity: "temp-pass-identity-payload",
    visitorIdentifier: "20265673158980419722735089753036633573",
    samlResponse: "PHNhbWxwOlJlc3BvbnNlPg==",
    samlSource: "tab-network:body",
    samlTrustedForPartnerSso: true,
    partnerSsoCompletedFlowVerified: true,
    redirectUrl: "https://experience.example.test/callback",
    domainName: "experience.example.test",
    flowId: "flow-123",
    sessionUrl: "https://example.test/sessions/session-code-123",
    loginUrl: "https://example.test/authenticate/turner/session-code-123",
    sessionResponseHeaders: {
      "AP-Partner-Framework-Status": "framework-status-token",
    },
    sessionData: {
      existingParameters: {
        redirectUrl: "https://experience.example.test/callback",
      },
    },
  });

  assert.equal(context.ok, true);
  assert.equal(context.partner, "Apple");
  assert.equal(context.partnerFrameworkStatus, "framework-status-token");
  assert.equal(context.partnerFrameworkStatusSource, "verified completed partner auth flow");
  assert.equal(context.allowPartnerFrameworkSelectedMvpdFallback, true);
  assert.equal(context.adobeSubjectToken, "subject-token-payload");
  assert.equal(context.adServiceToken, "service-token-payload");
  assert.equal(context.tempPassIdentity, "temp-pass-identity-payload");
  assert.equal(context.visitorIdentifier, "20265673158980419722735089753036633573");
  assert.equal(context.samlResponse, "PHNhbWxwOlJlc3BvbnNlPg==");
  assert.equal(context.samlSource, "tab-network:body");
  assert.equal(context.partnerSsoCompletedFlowVerified, true);
  assert.equal(context.redirectUrl, "https://experience.example.test/callback");
  assert.equal(context.domainName, "experience.example.test");
  assert.equal(context.flowId, "flow-123");
  assert.equal(context.sessionResponseHeaders["AP-Partner-Framework-Status"], "framework-status-token");
  assert.equal(context.sessionData.existingParameters.redirectUrl, "https://experience.example.test/callback");
});

test("REST V2 exact auth headers do not infer from preview text when no structured capture exists", () => {
  const { resolveRestV2InteractiveDocsHeaderValueFromContext } = loadRestV2HeaderResolutionHelpers();
  const exactFrameworkStatus = Buffer.from(
    JSON.stringify({
      frameworkPermissionInfo: {
        accessStatus: "granted",
      },
      frameworkProviderInfo: {
        id: "Comcast_SSO_Apple",
        expirationDate: String(Date.now() + 60 * 60 * 1000),
      },
    }),
    "utf8"
  ).toString("base64");

  const context = {
    responsePreview: JSON.stringify({
      "AP-Partner-Framework-Status": exactFrameworkStatus,
      "Adobe-Subject-Token": "subject-token-payload",
      "AD-Service-Token": "service-token-payload",
    }),
    requestBodyPreview: `AP-Visitor-Identifier=20265673158980419722735089753036633573&AP-Partner-Framework-Status=${exactFrameworkStatus}`,
  };

  assert.equal(resolveRestV2InteractiveDocsHeaderValueFromContext(context, "AP-Partner-Framework-Status"), "");
  assert.equal(resolveRestV2InteractiveDocsHeaderValueFromContext(context, "Adobe-Subject-Token"), "");
  assert.equal(resolveRestV2InteractiveDocsHeaderValueFromContext(context, "AD-Service-Token"), "");
  assert.equal(resolveRestV2InteractiveDocsHeaderValueFromContext(context, "AP-Visitor-Identifier"), "");
});

test("REST V2 exact auth headers persist from structured request and response header bags", () => {
  const { resolveRestV2InteractiveDocsHeaderValueFromContext, mergeRestV2CapturedAuthHeaders } =
    loadRestV2HeaderResolutionHelpers();
  const exactFrameworkStatus = Buffer.from(
    JSON.stringify({
      frameworkPermissionInfo: {
        accessStatus: "granted",
      },
      frameworkProviderInfo: {
        id: "Comcast_SSO_Apple",
        expirationDate: String(Date.now() + 60 * 60 * 1000),
      },
    }),
    "utf8"
  ).toString("base64");

  const capturedAuthHeaders = mergeRestV2CapturedAuthHeaders(
    {
      sessionRequestHeaders: {
        "Adobe-Subject-Token": "subject-token-payload",
        "AP-Visitor-Identifier": "20265673158980419722735089753036633573",
      },
    },
    {
      sessionResponseHeaders: {
        "AP-Partner-Framework-Status": exactFrameworkStatus,
      },
      responseHeaders: {
        "AD-Service-Token": "service-token-payload",
      },
    }
  );

  assert.deepEqual(JSON.parse(JSON.stringify(capturedAuthHeaders)), {
    "Adobe-Subject-Token": "subject-token-payload",
    "AP-Visitor-Identifier": "20265673158980419722735089753036633573",
    "AP-Partner-Framework-Status": exactFrameworkStatus,
    "AD-Service-Token": "service-token-payload",
  });
  assert.equal(
    resolveRestV2InteractiveDocsHeaderValueFromContext({ capturedAuthHeaders }, "AP-Partner-Framework-Status"),
    exactFrameworkStatus
  );
  assert.equal(
    resolveRestV2InteractiveDocsHeaderValueFromContext({ capturedAuthHeaders }, "Adobe-Subject-Token"),
    "subject-token-payload"
  );
});

test("REST V2 verified partner-flow trust survives seed and interactive context rebuilds", () => {
  const popupSource = fs.readFileSync(path.join(ROOT, "popup.js"), "utf8");

  assert.match(popupSource, /partnerSsoCompletedFlowVerified:\s*context\?\.partnerSsoCompletedFlowVerified === true/);
  assert.match(popupSource, /partnerSsoCompletedFlowVerified:\s*harvest\.partnerSsoCompletedFlowVerified === true/);
  assert.match(
    popupSource,
    /partnerSsoCompletedFlowVerified:\s*Boolean\([\s\S]*activeRecordingContext\?\.partnerSsoCompletedFlowVerified === true[\s\S]*harvestContext\?\.partnerSsoCompletedFlowVerified === true[\s\S]*harvest\?\.partnerSsoCompletedFlowVerified === true[\s\S]*\)/
  );
});

test("REST V2 learning context reuses selection-scoped partner SSO seed when auth completed without an active profile harvest", () => {
  const { buildRestV2InteractiveDocsContext } = loadRestV2InteractiveDocsContextBuilder({
    state: {
      selectedRequestorId: "MML",
      selectedMvpdId: "Comcast_SSO",
      restV2RecordingActive: false,
      restV2DebugFlowId: "",
    },
    services: {
      restV2: {
        guid: "rest-guid",
        appName: "REST V2",
      },
    },
    restV2Candidates: [
      {
        guid: "rest-guid",
        appName: "REST V2",
      },
    ],
    requestorContext: {
      requestorId: "MML",
      autoResolved: false,
      candidateCount: 1,
    },
    harvest: {
      programmerId: "Turner",
      requestorId: "MML",
      serviceProviderId: "MML",
      mvpd: "Comcast_SSO",
      profileCheckOutcome: "seed",
      flowId: "flow-123",
      redirectUrl: "https://experience.example.test/callback",
      domainName: "experience.example.test",
    },
    harvestContext: {
      ok: true,
      programmerId: "Turner",
      requestorId: "MML",
      serviceProviderId: "MML",
      mvpd: "Comcast_SSO",
      sessionCode: "session-code-123",
      partner: "Apple",
      partnerFrameworkStatus: "framework-status-token",
      visitorIdentifier: "20265673158980419722735089753036633573",
      samlResponse: "PHNhbWxwOlJlc3BvbnNlPg==",
      samlSource: "tab-network:body",
      samlTrustedForPartnerSso: true,
      redirectUrl: "https://experience.example.test/callback",
      domainName: "experience.example.test",
      flowId: "flow-123",
    },
    resolveFlowId: (harvest = null) => String(harvest?.flowId || "").trim(),
  });

  const context = buildRestV2InteractiveDocsContext(
    {
      programmerId: "Turner",
      programmerName: "Turner",
    },
    {
      key: "partner-sso-create-profile",
      usesPartnerPath: true,
      usesPartnerFrameworkStatus: true,
      usesBodySamlResponse: true,
    }
  );

  assert.equal(context.ok, true);
  assert.equal(context.mvpd, "Comcast_SSO");
  assert.equal(context.sessionCode, "session-code-123");
  assert.equal(context.partner, "Apple");
  assert.equal(context.partnerFrameworkStatus, "framework-status-token");
  assert.equal(context.visitorIdentifier, "20265673158980419722735089753036633573");
  assert.equal(context.samlResponse, "PHNhbWxwOlJlc3BvbnNlPg==");
  assert.equal(context.samlSource, "tab-network:body");
  assert.equal(context.redirectUrl, "https://experience.example.test/callback");
  assert.equal(context.domainName, "experience.example.test");
  assert.equal(context.flowId, "flow-123");
});

test("REST V2 learning hydration plans honor the selected customer-doc operation contracts", () => {
  const { buildRestV2InteractiveDocsHydrationPlan } = loadRestV2LearningPlanBuilder();
  const accessToken = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.payload.signature";
  const toArray = (value) => Array.from(value || []);
  const frameworkExpirationDate = String(Date.now() + 60 * 60 * 1000);
  const validPartnerFrameworkStatus = Buffer.from(
    JSON.stringify({
      frameworkPermissionInfo: {
        accessStatus: "granted",
      },
      frameworkProviderInfo: {
        id: "comcast-provider-map",
        expirationDate: frameworkExpirationDate,
      },
    }),
    "utf8"
  ).toString("base64");
  const rawPartnerFrameworkStatus = JSON.stringify({
    frameworkPermissionInfo: {
      accessStatus: "granted",
    },
    frameworkProviderInfo: {
      id: "comcast-provider-map",
      expirationDate: frameworkExpirationDate,
    },
  });
  const adobeSubjectToken = "subject-token-payload";
  const adServiceToken = "service-token-payload";
  const rawTempPassIdentity = JSON.stringify({
    subscriberId: "promo-user-1",
  });
  const normalizedTempPassIdentity = Buffer.from(rawTempPassIdentity, "utf8").toString("base64");
  const visitorIdentifier = "20265673158980419722735089753036633573";
  const baseContext = {
    serviceProviderId: "turner",
    requestorId: "turner",
    requestorAutoResolved: false,
    sessionCode: "session-code-123",
    mvpd: "Comcast_SSO",
    resourceIds: ["urn:resource:turner"],
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
    adobeSubjectToken,
    adServiceToken,
    tempPassIdentity: rawTempPassIdentity,
    visitorIdentifier,
    samlResponse: "PHNhbWxwOlJlc3BvbnNlPg==",
    samlSource: "tab-network:body",
    samlTrustedForPartnerSso: true,
    samlTrustedForPartnerSso: true,
  };

  const configurationPlan = buildRestV2InteractiveDocsHydrationPlan(
    {
      key: "configuration-service-provider",
      operationId: "handleRequestUsingGET",
      operationAnchor: "operation/handleRequestUsingGET",
      requiresAccessToken: true,
    },
    baseContext,
    accessToken
  );
  assert.deepEqual(toArray(configurationPlan.requiredFields), ["path.serviceProvider", "header.Authorization"]);
  assert.equal(configurationPlan.fieldValues["path.serviceProvider"], "turner");
  assert.equal(configurationPlan.fieldValues["header.Authorization"], `Bearer ${accessToken}`);
  assert.equal(configurationPlan.fieldValues["header.Accept"], "application/json");
  assert.equal(Object.prototype.hasOwnProperty.call(configurationPlan.fieldValues, "header.AP-Device-Identifier"), false);

  const startAuthenticationPlan = buildRestV2InteractiveDocsHydrationPlan(
    {
      key: "sessions-start-authentication",
      operationId: "startAuthenticationUsingGET",
      operationAnchor: "operation/startAuthenticationUsingGET",
      requiresAccessToken: false,
      usesSessionCode: true,
      requireSessionCode: true,
    },
    baseContext,
    accessToken
  );
  assert.deepEqual(toArray(startAuthenticationPlan.requiredFields), ["path.serviceProvider", "path.code"]);
  assert.equal(startAuthenticationPlan.fieldValues["path.code"], "session-code-123");
  assert.equal(Object.prototype.hasOwnProperty.call(startAuthenticationPlan.fieldValues, "header.Authorization"), false);

  const createSessionPlan = buildRestV2InteractiveDocsHydrationPlan(
    {
      key: "sessions-create-session",
      operationId: "createSessionUsingPOST",
      operationAnchor: "operation/createSessionUsingPOST",
      requiresAccessToken: true,
      usesDeviceHeaders: true,
      usesVisitorIdentifier: true,
      usesAdobeSubjectToken: true,
      usesAdServiceToken: true,
      contentType: "application/x-www-form-urlencoded",
      usesBodyMvpd: true,
      usesBodyDomainName: true,
      usesBodyRedirectUrl: true,
    },
    { ...baseContext, mvpd: "" },
    accessToken
  );
  assert.deepEqual(toArray(createSessionPlan.requiredFields), ["path.serviceProvider", "header.Authorization"]);
  assert.equal(createSessionPlan.fieldValues["header.Content-Type"], "application/x-www-form-urlencoded");
  assert.equal(createSessionPlan.fieldValues["header.AP-Device-Identifier"], "device-123");
  assert.equal(createSessionPlan.fieldValues["header.X-Device-Info"], "device-info-123");
  assert.equal(createSessionPlan.fieldValues["header.AP-Visitor-Identifier"], visitorIdentifier);
  assert.equal(createSessionPlan.fieldValues["header.Adobe-Subject-Token"], adobeSubjectToken);
  assert.equal(createSessionPlan.fieldValues["header.AD-Service-Token"], adServiceToken);
  assert.equal(createSessionPlan.fieldValues["body.domainName"], "experience.example.test");
  assert.equal(
    createSessionPlan.fieldValues["body.redirectUrl"],
    "https://experience.example.test/callback"
  );
  assert.equal(Object.prototype.hasOwnProperty.call(createSessionPlan.fieldValues, "body.mvpd"), false);
  assert.deepEqual(toArray(createSessionPlan.missingRequiredFields), []);

  const resumeSessionPlan = buildRestV2InteractiveDocsHydrationPlan(
    {
      key: "sessions-resume-session",
      operationId: "resumeSessionUsingPOST",
      operationAnchor: "operation/resumeSessionUsingPOST",
      requiresAccessToken: true,
      contentType: "application/x-www-form-urlencoded",
      usesVisitorIdentifier: true,
      usesSessionCode: true,
      requireSessionCode: true,
      usesBodyMvpd: true,
      usesBodyDomainName: true,
      usesBodyRedirectUrl: true,
    },
    baseContext,
    accessToken
  );
  assert.equal(resumeSessionPlan.fieldValues["path.code"], "session-code-123");
  assert.equal(resumeSessionPlan.fieldValues["header.Content-Type"], "application/x-www-form-urlencoded");
  assert.equal(resumeSessionPlan.fieldValues["body.mvpd"], "Comcast_SSO");
  assert.equal(resumeSessionPlan.fieldValues["body.domainName"], "experience.example.test");
  assert.equal(
    resumeSessionPlan.fieldValues["body.redirectUrl"],
    "https://experience.example.test/callback"
  );

  const sessionStatusPlan = buildRestV2InteractiveDocsHydrationPlan(
    {
      key: "sessions-session-status",
      operationId: "getSessionStatusUsingGET_1",
      operationAnchor: "operation/getSessionStatusUsingGET_1",
      requiresAccessToken: true,
      usesVisitorIdentifier: true,
      usesSessionCode: true,
      requireSessionCode: true,
    },
    baseContext,
    accessToken
  );
  assert.equal(sessionStatusPlan.fieldValues["path.code"], "session-code-123");

  const profilesByCodePlan = buildRestV2InteractiveDocsHydrationPlan(
    {
      key: "profiles-by-code",
      operationId: "getProfileForCodeUsingGET_1",
      operationAnchor: "operation/getProfileForCodeUsingGET_1",
      requiresAccessToken: true,
      usesVisitorIdentifier: true,
      usesSessionCode: true,
      requireSessionCode: true,
    },
    baseContext,
    accessToken
  );
  assert.equal(profilesByCodePlan.fieldValues["path.code"], "session-code-123");

  const profilesPlan = buildRestV2InteractiveDocsHydrationPlan(
    {
      key: "profiles-all",
      operationId: "getProfilesUsingGET_1",
      operationAnchor: "operation/getProfilesUsingGET_1",
      requiresAccessToken: true,
      usesDeviceHeaders: true,
      usesVisitorIdentifier: true,
      usesAdobeSubjectToken: true,
      usesAdServiceToken: true,
      usesPartnerFrameworkStatus: true,
    },
    baseContext,
    accessToken
  );
  assert.equal(profilesPlan.fieldValues["header.AP-Device-Identifier"], "device-123");
  assert.equal(profilesPlan.fieldValues["header.X-Device-Info"], "device-info-123");
  assert.equal(profilesPlan.fieldValues["header.Adobe-Subject-Token"], adobeSubjectToken);
  assert.equal(profilesPlan.fieldValues["header.AD-Service-Token"], adServiceToken);
  assert.equal(profilesPlan.fieldValues["header.AP-Partner-Framework-Status"], validPartnerFrameworkStatus);
  assert.deepEqual(toArray(profilesPlan.requiredFields), ["path.serviceProvider", "header.Authorization"]);

  const profilesByMvpdPlan = buildRestV2InteractiveDocsHydrationPlan(
    {
      key: "profiles-by-mvpd",
      operationId: "getProfileForMvpdUsingGET",
      operationAnchor: "operation/getProfileForMvpdUsingGET",
      requiresAccessToken: true,
      usesDeviceHeaders: true,
      usesVisitorIdentifier: true,
      usesMvpdPath: true,
      requireMvpdPath: true,
      usesAdobeSubjectToken: true,
      usesAdServiceToken: true,
      usesTempPassIdentity: true,
      usesPartnerFrameworkStatus: true,
    },
    baseContext,
    accessToken
  );
  assert.equal(profilesByMvpdPlan.fieldValues["path.mvpd"], "Comcast_SSO");
  assert.equal(profilesByMvpdPlan.fieldValues["header.AP-Device-Identifier"], "device-123");
  assert.equal(profilesByMvpdPlan.fieldValues["header.X-Device-Info"], "device-info-123");
  assert.equal(profilesByMvpdPlan.fieldValues["header.AP-Partner-Framework-Status"], validPartnerFrameworkStatus);
  assert.equal(Object.prototype.hasOwnProperty.call(profilesByMvpdPlan.fieldValues, "header.AP-Visitor-Identifier"), false);
  assert.equal(Object.prototype.hasOwnProperty.call(profilesByMvpdPlan.fieldValues, "header.Adobe-Subject-Token"), false);
  assert.equal(Object.prototype.hasOwnProperty.call(profilesByMvpdPlan.fieldValues, "header.AD-Service-Token"), false);
  assert.equal(Object.prototype.hasOwnProperty.call(profilesByMvpdPlan.fieldValues, "header.AP-Temppass-Identity"), false);

  const authorizePlan = buildRestV2InteractiveDocsHydrationPlan(
    {
      key: "decisions-authorize",
      operationId: "retrieveAuthorizeDecisionsForMvpdUsingPOST",
      operationAnchor: "operation/retrieveAuthorizeDecisionsForMvpdUsingPOST",
      requiresAccessToken: true,
      usesDeviceHeaders: true,
      usesVisitorIdentifier: true,
      usesMvpdPath: true,
      requireMvpdPath: true,
      usesAdobeSubjectToken: true,
      usesAdServiceToken: true,
      usesTempPassIdentity: true,
      usesPartnerFrameworkStatus: true,
      usesBodyResources: true,
      requireBodyResources: true,
      contentType: "application/json",
    },
    baseContext,
    accessToken
  );
  assert.equal(authorizePlan.fieldValues["path.mvpd"], "Comcast_SSO");
  assert.equal(authorizePlan.fieldValues["header.Content-Type"], "application/json");
  assert.equal(authorizePlan.fieldValues["header.AP-Device-Identifier"], "device-123");
  assert.equal(authorizePlan.fieldValues["header.X-Device-Info"], "device-info-123");
  assert.equal(authorizePlan.fieldValues["header.AP-Visitor-Identifier"], visitorIdentifier);
  assert.equal(authorizePlan.fieldValues["header.Adobe-Subject-Token"], adobeSubjectToken);
  assert.equal(authorizePlan.fieldValues["header.AD-Service-Token"], adServiceToken);
  assert.equal(authorizePlan.fieldValues["header.AP-Partner-Framework-Status"], validPartnerFrameworkStatus);
  assert.equal(authorizePlan.fieldValues["header.AP-Temppass-Identity"], normalizedTempPassIdentity);
  assert.deepEqual(toArray(authorizePlan.fieldValues["body.resources"]), ["urn:resource:turner"]);

  const decisionsPlan = buildRestV2InteractiveDocsHydrationPlan(
    {
      key: "decisions-preauthorize",
      operationId: "retrievePreAuthorizeDecisionsForMvpdUsingPOST_1",
      operationAnchor: "operation/retrievePreAuthorizeDecisionsForMvpdUsingPOST_1",
      requiresAccessToken: true,
      usesDeviceHeaders: true,
      usesVisitorIdentifier: true,
      usesMvpdPath: true,
      requireMvpdPath: true,
      usesAdobeSubjectToken: true,
      usesAdServiceToken: true,
      usesTempPassIdentity: true,
      usesPartnerFrameworkStatus: true,
      usesBodyResources: true,
      requireBodyResources: true,
      contentType: "application/json",
    },
    baseContext,
    accessToken
  );
  assert.equal(decisionsPlan.fieldValues["path.mvpd"], "Comcast_SSO");
  assert.equal(decisionsPlan.fieldValues["header.Content-Type"], "application/json");
  assert.equal(decisionsPlan.fieldValues["header.AP-Device-Identifier"], "device-123");
  assert.equal(decisionsPlan.fieldValues["header.X-Device-Info"], "device-info-123");
  assert.equal(decisionsPlan.fieldValues["header.AP-Visitor-Identifier"], visitorIdentifier);
  assert.equal(decisionsPlan.fieldValues["header.Adobe-Subject-Token"], adobeSubjectToken);
  assert.equal(decisionsPlan.fieldValues["header.AD-Service-Token"], adServiceToken);
  assert.equal(decisionsPlan.fieldValues["header.AP-Partner-Framework-Status"], validPartnerFrameworkStatus);
  assert.equal(decisionsPlan.fieldValues["header.AP-Temppass-Identity"], normalizedTempPassIdentity);
  assert.deepEqual(toArray(decisionsPlan.fieldValues["body.resources"]), ["urn:resource:turner"]);
  assert.deepEqual(toArray(decisionsPlan.missingRequiredFields), []);

  const logoutPlan = buildRestV2InteractiveDocsHydrationPlan(
    {
      key: "logout-by-mvpd",
      operationId: "getLogoutForMvpdUsingGET",
      operationAnchor: "operation/getLogoutForMvpdUsingGET",
      requiresAccessToken: true,
      usesDeviceHeaders: true,
      usesVisitorIdentifier: true,
      usesMvpdPath: true,
      requireMvpdPath: true,
      usesAdobeSubjectToken: true,
      usesAdServiceToken: true,
      usesQueryRedirectUrl: true,
    },
    baseContext,
    accessToken
  );
  assert.equal(logoutPlan.fieldValues["path.mvpd"], "Comcast_SSO");
  assert.equal(logoutPlan.fieldValues["header.Adobe-Subject-Token"], adobeSubjectToken);
  assert.equal(logoutPlan.fieldValues["header.AD-Service-Token"], adServiceToken);
  assert.equal(
    logoutPlan.fieldValues["query.redirectUrl"],
    "https://experience.example.test/callback"
  );

  const partnerProfilePlan = buildRestV2InteractiveDocsHydrationPlan(
    {
      key: "partner-sso-create-profile",
      operationId: "createPartnerProfileUsingPOST",
      operationAnchor: "operation/createPartnerProfileUsingPOST",
      requiresAccessToken: true,
      usesDeviceHeaders: true,
      usesVisitorIdentifier: true,
      usesPartnerPath: true,
      requirePartnerPath: true,
      usesPartnerFrameworkStatus: true,
      requirePartnerFrameworkStatus: true,
      usesBodySamlResponse: true,
      requireBodySamlResponse: true,
      contentType: "application/x-www-form-urlencoded",
    },
    baseContext,
    accessToken
  );
  assert.equal(partnerProfilePlan.fieldValues["path.partner"], "Apple");
  assert.equal(partnerProfilePlan.fieldValues["body.SAMLResponse"], "PHNhbWxwOlJlc3BvbnNlPg==");
  assert.equal(partnerProfilePlan.fieldValues["header.AP-Device-Identifier"], "device-123");
  assert.equal(partnerProfilePlan.fieldValues["header.AP-Visitor-Identifier"], visitorIdentifier);
  assert.equal(partnerProfilePlan.fieldValues["header.AP-Partner-Framework-Status"], validPartnerFrameworkStatus);
  assert.match(String(partnerProfilePlan.notes[0] || ""), /SAMLResponse captured from/);

  const rawPartnerProfilePlan = buildRestV2InteractiveDocsHydrationPlan(
    {
      key: "partner-sso-create-profile",
      operationId: "createPartnerProfileUsingPOST",
      operationAnchor: "operation/createPartnerProfileUsingPOST",
      requiresAccessToken: true,
      usesDeviceHeaders: true,
      usesVisitorIdentifier: true,
      usesPartnerPath: true,
      requirePartnerPath: true,
      usesPartnerFrameworkStatus: true,
      requirePartnerFrameworkStatus: true,
      usesBodySamlResponse: true,
      requireBodySamlResponse: true,
      contentType: "application/x-www-form-urlencoded",
    },
    { ...baseContext, partnerFrameworkStatus: rawPartnerFrameworkStatus },
    accessToken
  );
  assert.equal(rawPartnerProfilePlan.fieldValues["header.AP-Partner-Framework-Status"], validPartnerFrameworkStatus);

  const partnerSsoPlan = buildRestV2InteractiveDocsHydrationPlan(
    {
      key: "partner-sso-verification-token",
      operationId: "retrieveVerificationTokenUsingPOST",
      operationAnchor: "operation/retrieveVerificationTokenUsingPOST",
      requiresAccessToken: true,
      usesDeviceHeaders: true,
      usesVisitorIdentifier: true,
      usesPartnerPath: true,
      requirePartnerPath: true,
      usesPartnerFrameworkStatus: true,
      requirePartnerFrameworkStatus: true,
      usesBodyDomainName: true,
      requireBodyDomainName: true,
      usesBodyRedirectUrl: true,
      requireBodyRedirectUrl: true,
      contentType: "application/x-www-form-urlencoded",
    },
    baseContext,
    accessToken
  );
  assert.equal(partnerSsoPlan.fieldValues["path.partner"], "Apple");
  assert.equal(partnerSsoPlan.fieldValues["body.domainName"], "experience.example.test");
  assert.equal(partnerSsoPlan.fieldValues["header.AP-Visitor-Identifier"], visitorIdentifier);
  assert.equal(partnerSsoPlan.fieldValues["header.AP-Partner-Framework-Status"], validPartnerFrameworkStatus);
  assert.equal(
    partnerSsoPlan.fieldValues["body.redirectUrl"],
    "https://experience.example.test/callback"
  );
  assert.deepEqual(toArray(partnerSsoPlan.requiredFields).sort(), [
    "body.domainName",
    "body.redirectUrl",
    "header.Authorization",
    "header.AP-Partner-Framework-Status",
    "path.serviceProvider",
    "path.partner",
  ].sort());
  assert.deepEqual(toArray(partnerSsoPlan.missingRequiredFields), []);

  const missingDynamicContextPlan = buildRestV2InteractiveDocsHydrationPlan(
    {
      key: "partner-sso-create-profile",
      operationId: "createPartnerProfileUsingPOST",
      operationAnchor: "operation/createPartnerProfileUsingPOST",
      requiresAccessToken: true,
      usesDeviceHeaders: true,
      usesPartnerPath: true,
      requirePartnerPath: true,
      usesPartnerFrameworkStatus: true,
      requirePartnerFrameworkStatus: true,
      usesBodySamlResponse: true,
      requireBodySamlResponse: true,
      contentType: "application/x-www-form-urlencoded",
    },
    { ...baseContext, partner: "", learningPartner: "", samlResponse: "", partnerFrameworkStatus: "" },
    accessToken
  );
  assert.deepEqual(
    toArray(missingDynamicContextPlan.missingRequiredFields).sort(),
    ["body.SAMLResponse", "header.AP-Partner-Framework-Status", "path.partner"].sort()
  );
  assert.match(missingDynamicContextPlan.notes.join(" "), /Partner SSO/);
});

test("REST V2 learning keeps partner APIs locked when the partner framework payload is not usable", () => {
  const { buildRestV2InteractiveDocsHydrationPlan } = loadRestV2LearningPlanBuilder();
  const plan = buildRestV2InteractiveDocsHydrationPlan(
    {
      key: "partner-sso-create-profile",
      operationId: "createPartnerProfileUsingPOST",
      operationAnchor: "operation/createPartnerProfileUsingPOST",
      requiresAccessToken: true,
      usesDeviceHeaders: true,
      usesPartnerPath: true,
      requirePartnerPath: true,
      usesPartnerFrameworkStatus: true,
      requirePartnerFrameworkStatus: true,
      usesBodySamlResponse: true,
      requireBodySamlResponse: true,
      contentType: "application/x-www-form-urlencoded",
    },
    {
      serviceProviderId: "turner",
      requestorId: "turner",
      requestorAutoResolved: false,
      partner: "Apple",
      partnerFrameworkStatus: "framework-status-token",
      samlResponse: "PHNhbWxwOlJlc3BvbnNlPg==",
      samlSource: "tab-network:body",
      samlTrustedForPartnerSso: true,
    },
    "test-token"
  );

  assert.equal(Object.prototype.hasOwnProperty.call(plan.fieldValues, "header.AP-Partner-Framework-Status"), false);
  assert.deepEqual(toArray(plan.missingRequiredFields), ["header.AP-Partner-Framework-Status"]);

  function toArray(value) {
    return Array.from(value || []);
  }
});

test("REST V2 learning uses a compatible inferred partner framework payload when the recorded flow already captured trusted partner SSO context", () => {
  const { buildRestV2InteractiveDocsHydrationPlan } = loadRestV2LearningPlanBuilder();
  const validLearningFrameworkStatus = Buffer.from(
    JSON.stringify({
      frameworkPermissionInfo: {
        accessStatus: "granted",
      },
      frameworkProviderInfo: {
        id: "comcast-provider-map",
        expirationDate: String(Date.now() + 60 * 60 * 1000),
      },
      frameworkPartnerInfo: {
        name: "Apple",
      },
    }),
    "utf8"
  ).toString("base64");

  const plan = buildRestV2InteractiveDocsHydrationPlan(
    {
      key: "partner-sso-create-profile",
      operationId: "createPartnerProfileUsingPOST",
      operationAnchor: "operation/createPartnerProfileUsingPOST",
      requiresAccessToken: true,
      usesDeviceHeaders: true,
      usesPartnerPath: true,
      requirePartnerPath: true,
      usesPartnerFrameworkStatus: true,
      requirePartnerFrameworkStatus: true,
      usesBodySamlResponse: true,
      requireBodySamlResponse: true,
      contentType: "application/x-www-form-urlencoded",
    },
    {
      serviceProviderId: "turner",
      requestorId: "turner",
      requestorAutoResolved: false,
      mvpd: "Comcast_SSO",
      mvpdMeta: {
        id: "Comcast_SSO",
        name: "Xfinity",
        platformMappingId: "comcast-provider-map",
      },
      partner: "",
      partnerFrameworkStatus: "",
      learningPartner: "Apple",
      learningPartnerFrameworkStatus: validLearningFrameworkStatus,
      learningPartnerSource: "recorded r-apt cookie",
      samlResponse: "PHNhbWxwOlJlc3BvbnNlPg==",
      samlSource: "tab-network:body",
      samlTrustedForPartnerSso: true,
    },
    "test-token"
  );

  assert.equal(plan.fieldValues["path.partner"], "Apple");
  assert.equal(plan.fieldValues["body.SAMLResponse"], "PHNhbWxwOlJlc3BvbnNlPg==");
  assert.equal(Object.prototype.hasOwnProperty.call(plan.fieldValues, "header.AP-Partner-Framework-Status"), false);
  assert.deepEqual(Array.from(plan.missingRequiredFields || []), ["header.AP-Partner-Framework-Status"]);
  assert.match(plan.notes.join(" "), /requires the exact AP-Partner-Framework-Status payload captured from a real partner flow/i);
});

test("REST V2 learning preserves an exact captured Comcast framework status instead of replacing it with inferred Apple payloads", () => {
  const { buildRestV2InteractiveDocsHydrationPlan } = loadRestV2LearningPlanBuilder();
  const genericFrameworkStatus = Buffer.from(
    JSON.stringify({
      frameworkPermissionInfo: {
        accessStatus: "granted",
      },
      frameworkProviderInfo: {
        id: "Comcast_SSO",
        expirationDate: String(Date.now() + 60 * 60 * 1000),
      },
      frameworkPartnerInfo: {
        name: "Apple",
      },
    }),
    "utf8"
  ).toString("base64");
  const validLearningFrameworkStatus = Buffer.from(
    JSON.stringify({
      frameworkPermissionInfo: {
        accessStatus: "granted",
      },
      frameworkProviderInfo: {
        id: "Comcast_SSO_Apple",
        expirationDate: String(Date.now() + 60 * 60 * 1000),
      },
      frameworkPartnerInfo: {
        name: "Apple",
      },
    }),
    "utf8"
  ).toString("base64");

  const plan = buildRestV2InteractiveDocsHydrationPlan(
    {
      key: "partner-sso-create-profile",
      operationId: "createPartnerProfileUsingPOST",
      operationAnchor: "operation/createPartnerProfileUsingPOST",
      requiresAccessToken: true,
      usesDeviceHeaders: true,
      usesPartnerPath: true,
      requirePartnerPath: true,
      usesPartnerFrameworkStatus: true,
      requirePartnerFrameworkStatus: true,
      usesBodySamlResponse: true,
      requireBodySamlResponse: true,
      contentType: "application/x-www-form-urlencoded",
    },
    {
      serviceProviderId: "turner",
      requestorId: "turner",
      requestorAutoResolved: false,
      mvpd: "Comcast_SSO",
      mvpdMeta: {
        id: "Comcast_SSO",
        name: "Xfinity",
        platformMappingId: "Comcast_SSO_Apple",
      },
      partner: "",
      partnerFrameworkStatus: genericFrameworkStatus,
      learningPartner: "Apple",
      learningPartnerFrameworkStatus: validLearningFrameworkStatus,
      learningPartnerSource: "recorded r-apt cookie",
      samlResponse: "PHNhbWxwOlJlc3BvbnNlPg==",
      samlSource: "tab-network:body",
      samlTrustedForPartnerSso: true,
    },
    "test-token"
  );

  assert.equal(plan.fieldValues["path.partner"], "Apple");
  assert.equal(plan.fieldValues["header.AP-Partner-Framework-Status"], genericFrameworkStatus);
  assert.deepEqual(Array.from(plan.missingRequiredFields || []), []);
});

test("REST V2 learning preserves an exact captured framework header even when console mappings expose a more specific Apple provider id", () => {
  const { buildRestV2InteractiveDocsHydrationPlan } = loadRestV2LearningPlanBuilder();
  const genericFrameworkStatus = Buffer.from(
    JSON.stringify({
      frameworkPermissionInfo: {
        accessStatus: "granted",
      },
      frameworkProviderInfo: {
        id: "Comcast_SSO",
        expirationDate: String(Date.now() + 60 * 60 * 1000),
      },
      frameworkPartnerInfo: {
        name: "Apple",
      },
    }),
    "utf8"
  ).toString("base64");
  const validLearningFrameworkStatus = Buffer.from(
    JSON.stringify({
      frameworkPermissionInfo: {
        accessStatus: "granted",
      },
      frameworkProviderInfo: {
        id: "Comcast_SSO_Apple",
        expirationDate: String(Date.now() + 60 * 60 * 1000),
      },
      frameworkPartnerInfo: {
        name: "Apple",
      },
    }),
    "utf8"
  ).toString("base64");

  const plan = buildRestV2InteractiveDocsHydrationPlan(
    {
      key: "partner-sso-create-profile",
      operationId: "createPartnerProfileUsingPOST",
      operationAnchor: "operation/createPartnerProfileUsingPOST",
      requiresAccessToken: true,
      usesDeviceHeaders: true,
      usesPartnerPath: true,
      requirePartnerPath: true,
      usesPartnerFrameworkStatus: true,
      requirePartnerFrameworkStatus: true,
      usesBodySamlResponse: true,
      requireBodySamlResponse: true,
      contentType: "application/x-www-form-urlencoded",
    },
    {
      serviceProviderId: "turner",
      requestorId: "turner",
      requestorAutoResolved: false,
      mvpd: "Comcast_SSO",
      mvpdMeta: {
        id: "Comcast_SSO",
        name: "Xfinity",
        platformMappingId: "Comcast_SSO",
        partnerPlatformMappings: {
          Apple: "Comcast_SSO_Apple",
        },
      },
      partner: "",
      partnerFrameworkStatus: genericFrameworkStatus,
      learningPartner: "Apple",
      learningPartnerFrameworkStatus: validLearningFrameworkStatus,
      learningPartnerSource: "recorded r-apt cookie",
      samlResponse: "PHNhbWxwOlJlc3BvbnNlPg==",
      samlSource: "tab-network:body",
      samlTrustedForPartnerSso: true,
    },
    "test-token"
  );

  assert.equal(plan.fieldValues["path.partner"], "Apple");
  assert.equal(plan.fieldValues["header.AP-Partner-Framework-Status"], genericFrameworkStatus);
  assert.deepEqual(Array.from(plan.missingRequiredFields || []), []);
});

test("REST V2 learning allows Create Partner Profile when the captured framework header is exact, even if console mappings expose a more specific provider id", () => {
  const { buildRestV2InteractiveDocsHydrationPlan } = loadRestV2LearningPlanBuilder();
  const genericFrameworkStatus = Buffer.from(
    JSON.stringify({
      frameworkPermissionInfo: {
        accessStatus: "granted",
      },
      frameworkProviderInfo: {
        id: "Comcast_SSO",
        expirationDate: String(Date.now() + 60 * 60 * 1000),
      },
      frameworkPartnerInfo: {
        name: "Apple",
      },
    }),
    "utf8"
  ).toString("base64");

  const plan = buildRestV2InteractiveDocsHydrationPlan(
    {
      key: "partner-sso-create-profile",
      operationId: "createPartnerProfileUsingPOST",
      operationAnchor: "operation/createPartnerProfileUsingPOST",
      requiresAccessToken: true,
      usesDeviceHeaders: true,
      usesPartnerPath: true,
      requirePartnerPath: true,
      usesPartnerFrameworkStatus: true,
      requirePartnerFrameworkStatus: true,
      usesBodySamlResponse: true,
      requireBodySamlResponse: true,
      contentType: "application/x-www-form-urlencoded",
    },
    {
      serviceProviderId: "turner",
      requestorId: "turner",
      requestorAutoResolved: false,
      mvpd: "Comcast_SSO",
      mvpdMeta: {
        id: "Comcast_SSO",
        name: "Xfinity",
        platformMappingId: "Comcast_SSO",
        partnerPlatformMappings: {
          Apple: "Comcast_SSO_Apple",
        },
      },
      partner: "",
      partnerFrameworkStatus: genericFrameworkStatus,
      learningPartner: "Apple",
      learningPartnerFrameworkStatus: "",
      learningPartnerSource: "recorded r-apt cookie",
      samlResponse: "PHNhbWxwOlJlc3BvbnNlPg==",
      samlSource: "tab-network:body",
      samlTrustedForPartnerSso: true,
    },
    "test-token"
  );

  assert.equal(plan.fieldValues["path.partner"], "Apple");
  assert.equal(plan.fieldValues["header.AP-Partner-Framework-Status"], genericFrameworkStatus);
  assert.deepEqual(Array.from(plan.missingRequiredFields || []), []);
});

test("REST V2 learning allows Retrieve Verification Token when the captured framework header is exact, even if no real provider mapping was cached", () => {
  const { buildRestV2InteractiveDocsHydrationPlan } = loadRestV2LearningPlanBuilder();
  const genericFrameworkStatus = Buffer.from(
    JSON.stringify({
      frameworkPermissionInfo: {
        accessStatus: "granted",
      },
      frameworkProviderInfo: {
        id: "Comcast_SSO",
        expirationDate: String(Date.now() + 60 * 60 * 1000),
      },
      frameworkPartnerInfo: {
        name: "Apple",
      },
    }),
    "utf8"
  ).toString("base64");

  const plan = buildRestV2InteractiveDocsHydrationPlan(
    {
      key: "partner-sso-verification-token",
      operationId: "retrieveVerificationTokenUsingPOST",
      operationAnchor: "operation/retrieveVerificationTokenUsingPOST",
      requiresAccessToken: true,
      usesDeviceHeaders: true,
      usesPartnerPath: true,
      requirePartnerPath: true,
      usesPartnerFrameworkStatus: true,
      requirePartnerFrameworkStatus: true,
      usesBodyDomainName: true,
      requireBodyDomainName: true,
      usesBodyRedirectUrl: true,
      requireBodyRedirectUrl: true,
      contentType: "application/x-www-form-urlencoded",
    },
    {
      serviceProviderId: "turner",
      requestorId: "turner",
      requestorAutoResolved: false,
      mvpd: "Comcast_SSO",
      mvpdMeta: {
        id: "Comcast_SSO",
        name: "Xfinity",
        platformMappingId: "Comcast_SSO",
      },
      partner: "",
      partnerFrameworkStatus: genericFrameworkStatus,
      learningPartner: "Apple",
      learningPartnerFrameworkStatus: "",
      learningPartnerSource: "recorded r-apt cookie",
      domainName: "experience.example.test",
      redirectUrl: "https://experience.example.test/callback",
    },
    "test-token"
  );

  assert.equal(plan.fieldValues["path.partner"], "Apple");
  assert.equal(plan.fieldValues["header.AP-Partner-Framework-Status"], genericFrameworkStatus);
  assert.deepEqual(Array.from(plan.missingRequiredFields || []), []);
});

test("REST V2 learning keeps Create Partner Profile blocked when the inferred provider id does not match the selected MVPD mapping", () => {
  const { buildRestV2InteractiveDocsHydrationPlan } = loadRestV2LearningPlanBuilder();
  const mismatchedLearningFrameworkStatus = Buffer.from(
    JSON.stringify({
      frameworkPermissionInfo: {
        accessStatus: "granted",
      },
      frameworkProviderInfo: {
        id: "Comcast_SSO",
        expirationDate: String(Date.now() + 60 * 60 * 1000),
      },
      frameworkPartnerInfo: {
        name: "Apple",
      },
    }),
    "utf8"
  ).toString("base64");

  const plan = buildRestV2InteractiveDocsHydrationPlan(
    {
      key: "partner-sso-create-profile",
      operationId: "createPartnerProfileUsingPOST",
      operationAnchor: "operation/createPartnerProfileUsingPOST",
      requiresAccessToken: true,
      usesDeviceHeaders: true,
      usesPartnerPath: true,
      requirePartnerPath: true,
      usesPartnerFrameworkStatus: true,
      requirePartnerFrameworkStatus: true,
      usesBodySamlResponse: true,
      requireBodySamlResponse: true,
      contentType: "application/x-www-form-urlencoded",
    },
    {
      serviceProviderId: "turner",
      requestorId: "turner",
      requestorAutoResolved: false,
      mvpd: "Comcast_SSO",
      mvpdMeta: {
        id: "Comcast_SSO",
        name: "Xfinity",
        platformMappingId: "comcast-provider-map",
      },
      partner: "",
      partnerFrameworkStatus: "",
      learningPartner: "Apple",
      learningPartnerFrameworkStatus: mismatchedLearningFrameworkStatus,
      learningPartnerSource: "recorded r-apt cookie",
      samlResponse: "PHNhbWxwOlJlc3BvbnNlPg==",
      samlSource: "tab-network:body",
      samlTrustedForPartnerSso: true,
    },
    "test-token"
  );

  assert.equal(plan.fieldValues["path.partner"], "Apple");
  assert.equal(Object.prototype.hasOwnProperty.call(plan.fieldValues, "header.AP-Partner-Framework-Status"), false);
  assert.deepEqual(Array.from(plan.missingRequiredFields || []), ["header.AP-Partner-Framework-Status"]);
});

test("REST V2 learning preserves an exact captured framework header even when the provider id is not associated with a known MVPD cache entry", () => {
  const { buildRestV2InteractiveDocsHydrationPlan } = loadRestV2LearningPlanBuilder();
  const unknownProviderFrameworkStatus = Buffer.from(
    JSON.stringify({
      frameworkPermissionInfo: {
        accessStatus: "granted",
      },
      frameworkProviderInfo: {
        id: "Comcast_SSO_Apple_Unmapped",
        expirationDate: String(Date.now() + 60 * 60 * 1000),
      },
      frameworkPartnerInfo: {
        name: "Apple",
      },
    }),
    "utf8"
  ).toString("base64");

  const plan = buildRestV2InteractiveDocsHydrationPlan(
    {
      key: "partner-sso-create-profile",
      operationId: "createPartnerProfileUsingPOST",
      operationAnchor: "operation/createPartnerProfileUsingPOST",
      requiresAccessToken: true,
      usesDeviceHeaders: true,
      usesPartnerPath: true,
      requirePartnerPath: true,
      usesPartnerFrameworkStatus: true,
      requirePartnerFrameworkStatus: true,
      usesBodySamlResponse: true,
      requireBodySamlResponse: true,
      contentType: "application/x-www-form-urlencoded",
    },
    {
      serviceProviderId: "turner",
      requestorId: "turner",
      requestorAutoResolved: false,
      mvpd: "Comcast_SSO",
      mvpdMeta: {
        id: "Comcast_SSO",
        name: "Xfinity",
        partnerPlatformMappings: {
          Apple: "Comcast_SSO_Apple",
        },
      },
      partner: "",
      partnerFrameworkStatus: unknownProviderFrameworkStatus,
      learningPartner: "Apple",
      learningPartnerFrameworkStatus: "",
      learningPartnerSource: "captured partner flow",
      samlResponse: "PHNhbWxwOlJlc3BvbnNlPg==",
      samlSource: "web-request:onBeforeRequest",
      samlTrustedForPartnerSso: true,
    },
    "test-token"
  );

  assert.equal(plan.fieldValues["path.partner"], "Apple");
  assert.equal(plan.fieldValues["header.AP-Partner-Framework-Status"], unknownProviderFrameworkStatus);
  assert.deepEqual(Array.from(plan.missingRequiredFields || []), []);
});

test("shared Base64 hover decode renders decoded tooltips in metadata items", () => {
  const filePath = path.join(ROOT, "popup.js");
  const source = fs.readFileSync(filePath, "utf8");
  const script = [
    extractFunctionSource(source, "escapeHtml"),
    extractFunctionSource(source, "parseJsonText"),
    extractFunctionSource(source, "resolveBase64DecodedHoverMeta"),
    extractFunctionSource(source, "buildMetadataItemHtml"),
    "module.exports = { buildMetadataItemHtml };",
  ].join("\n\n");
  const context = {
    module: { exports: {} },
    exports: {},
    atob,
    btoa,
    TextDecoder,
  };
  vm.runInNewContext(script, context, { filename: filePath });
  const { buildMetadataItemHtml } = context.module.exports;

  const metadataHtml = buildMetadataItemHtml(
    "TempPASS Identity",
    Buffer.from('{"hash":"abc123"}', "utf8").toString("base64")
  );
  assert.match(metadataHtml, /hr-base64-hover-target/);
  assert.match(metadataHtml, /Base64 decoded value/);
  assert.match(metadataHtml, /abc123/);
});

test("premium service sections and HR service pills keep their theme class wiring", () => {
  const popupSource = fs.readFileSync(path.join(ROOT, "popup.js"), "utf8");

  assert.match(popupSource, /const PREMIUM_SERVICE_THEME_CLASS_BY_KEY = \{/);
  assert.match(popupSource, /cm:\s*"service-cm"/);
  assert.match(popupSource, /cmMvpd:\s*"service-cm-mvpd"/);
  assert.match(popupSource, /degradation:\s*"service-degradation"/);
  assert.match(popupSource, /esmWorkspace:\s*"service-esm"/);
  assert.match(popupSource, /resetTempPass:\s*"service-temp-pass"/);
  assert.match(popupSource, /restV2:\s*"service-rest-v2"/);
  assert.match(popupSource, /premium-service-section \$\{PREMIUM_SERVICE_THEME_CLASS_BY_KEY\[serviceKey\] \|\| ""\}/);
  assert.match(popupSource, /hr-context-service-pill--\$\{themeClass\}/);
});

test("REST V2 login tool hides the old Partner SSO raw JSON and SAML controls", () => {
  const popupSource = fs.readFileSync(path.join(ROOT, "popup.js"), "utf8");
  const createPremiumServiceSectionSource = extractFunctionSource(popupSource, "createPremiumServiceSection");

  assert.doesNotMatch(createPremiumServiceSectionSource, /Partner Framework Status \(JSON\)/);
  assert.doesNotMatch(createPremiumServiceSectionSource, /rest-v2-partner-status-json-input/);
  assert.doesNotMatch(createPremiumServiceSectionSource, /rest-v2-partner-saml-input/);
  assert.doesNotMatch(createPremiumServiceSectionSource, /rest-v2-partner-status-copy-current-btn/);
  assert.doesNotMatch(createPremiumServiceSectionSource, /rest-v2-partner-sso-clear-btn/);
});

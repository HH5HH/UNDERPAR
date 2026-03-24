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

function loadPopupImsHelpers() {
  const filePath = path.join(ROOT, "popup.js");
  const source = fs.readFileSync(filePath, "utf8");
  const script = [
    'const IMS_LEGACY_DEFAULT_SCOPE = "openid profile offline_access additional_info.projectedProductContext";',
    'const IMS_SCOPE = "openid profile offline_access additional_info.projectedProductContext";',
    'const UNDERPAR_ACTIVATION_REQUIRED_SCOPE = "openid profile additional_info.projectedProductContext";',
    'const UNDERPAR_RECOVERY_REQUIRED_SCOPE = "openid profile additional_info.projectedProductContext read_organizations";',
    'const IMS_ORG_DISCOVERY_SCOPE = "read_organizations";',
    'const IMS_ORGANIZATION_SCOPE = "openid profile offline_access additional_info.projectedProductContext read_organizations";',
    'const IMS_DEFAULT_AUTHORIZATION_ENDPOINT = "https://ims-na1.adobelogin.com/ims/authorize/v2";',
    'const IMS_DEFAULT_LOGOUT_ENDPOINT = "https://ims-na1.adobelogin.com/ims/logout";',
    'const IMS_CONSOLE_ALLOWED_SCOPES = ["openid","profile","offline_access","additional_info.projectedProductContext"];',
    'const IMS_LEGACY_SCOPE_MIGRATION_TOKENS = ["AdobeID","avatar","session","read_organizations","additional_info.job_function","additional_info.account_type","additional_info.roles","additional_info.user_image_url","analytics_services"];',
    "function firstNonEmptyString(values = []) { for (const value of Array.isArray(values) ? values : []) { const text = String(value || '').trim(); if (text) { return text; } } return ''; }",
    "function uniqueSorted(values = []) { return [...new Set((Array.isArray(values) ? values : []).map((value) => String(value || '').trim()).filter(Boolean))].sort(); }",
    "function getZipKeyValueByPath(payload = null, pathExpr = '') { if (!payload || typeof payload !== 'object') { return undefined; } const expr = String(pathExpr || '').trim(); if (!expr) { return undefined; } if (Object.prototype.hasOwnProperty.call(payload, expr)) { return payload[expr]; } const parts = expr.split('.').map((part) => part.trim()).filter(Boolean); if (parts.length === 0) { return undefined; } let node = payload; for (const part of parts) { if (!node || typeof node !== 'object' || !Object.prototype.hasOwnProperty.call(node, part)) { return undefined; } node = node[part]; } return node; }",
    "function readZipKeyValue(payload = null, candidates = []) { for (const candidate of Array.isArray(candidates) ? candidates : []) { const value = getZipKeyValueByPath(payload, candidate); if (typeof value === 'string') { const trimmed = value.trim(); if (trimmed) { return trimmed; } continue; } if (typeof value === 'number' && Number.isFinite(value)) { return String(value); } if (typeof value === 'boolean') { return value ? 'true' : 'false'; } } return ''; }",
    "function parseJsonText(text, fallback = null) { if (!text || typeof text !== 'string') { return fallback; } try { return JSON.parse(text); } catch { return fallback; } }",
    "function decodeZipKeyPayloadBase64(value = '') { const compact = String(value || '').replace(/\\s+/g, '').replace(/-/g, '+').replace(/_/g, '/'); if (!compact) { return ''; } const remainder = compact.length % 4; const padded = remainder === 0 ? compact : `${compact}${'='.repeat(4 - remainder)}`; const binary = atob(padded); try { const bytes = Uint8Array.from(binary, (entry) => entry.charCodeAt(0)); return new TextDecoder().decode(bytes); } catch { return binary; } }",
    "function parseKeyValueText(rawText = '') { const payload = {}; String(rawText || '').split(/\\r?\\n/).forEach((line) => { const match = line.match(/^\\s*([^=:\\s]+)\\s*[:=]\\s*(.+)\\s*$/); if (!match) { return; } payload[String(match[1] || '').trim()] = String(match[2] || '').trim(); }); return payload; }",
    "function parseZipKeyPayload(rawText = '') { const raw = String(rawText || '').trim(); if (!raw) { throw new Error('ZIP.KEY payload is empty.'); } const prefix = 'ZIPKEY1:'; let payloadText = raw; if (raw.slice(0, prefix.length).toUpperCase() === prefix) { payloadText = raw.slice(prefix.length).trim(); } if (!payloadText) { throw new Error('ZIP.KEY payload is empty.'); } if (payloadText.startsWith('{')) { try { const parsed = JSON.parse(payloadText); if (parsed && typeof parsed === 'object') { return parsed; } } catch { throw new Error('ZIP.KEY JSON payload could not be parsed.'); } } try { const decoded = decodeZipKeyPayloadBase64(payloadText).trim(); if (decoded.startsWith('{')) { const parsed = JSON.parse(decoded); if (parsed && typeof parsed === 'object') { return parsed; } } } catch { } const fromKeyValue = parseKeyValueText(payloadText); if (Object.keys(fromKeyValue).length > 0) { return fromKeyValue; } throw new Error('Unknown ZIP.KEY format. Use ZIPKEY1 base64 JSON, raw JSON, or KEY=VALUE lines.'); }",
    "function uniquePreserveOrder(values = []) { const seen = new Set(); const output = []; for (const value of Array.isArray(values) ? values : []) { const text = String(value || '').trim(); if (!text || seen.has(text)) { continue; } seen.add(text); output.push(text); } return output; }",
    "function parseJwtPayload() { return {}; }",
    "function extractScopeValuesFromTokenClaims() { return []; }",
    "function readZipKeyRawValue(payload = null, candidates = []) { for (const candidate of Array.isArray(candidates) ? candidates : []) { const value = getZipKeyValueByPath(payload, candidate); if (value === undefined || value === null) { continue; } if (typeof value === 'string' && !value.trim()) { continue; } return value; } return null; }",
    "function normalizeConfiguredOrganizationsSource(value) { if (Array.isArray(value) || (value && typeof value === 'object')) { return value; } const raw = String(value || '').trim(); if (!raw) { return null; } if (raw.startsWith('[') || raw.startsWith('{')) { const parsed = parseJsonText(raw, null); if (Array.isArray(parsed) || (parsed && typeof parsed === 'object')) { return parsed; } } return raw.split(/[;\\n]+/).map((entry) => entry.trim()).filter(Boolean).map((entry) => { const separatorMatch = entry.match(/^([^|:=]+)\\s*(?:\\||:|=)\\s*(.+)$/); if (separatorMatch) { return { id: separatorMatch[1], label: separatorMatch[2] }; } return { id: entry, label: entry }; }); }",
    "function collectConfiguredOrganizationEntriesByPrefix(sourcePayload = {}) { if (!sourcePayload || typeof sourcePayload !== 'object') { return []; } const candidatePrefixes = ['services.adobe.ims.organizations.','services.adobe.ims.organization.','services.adobe.ims.orgs.','services.adobe.ims.org.','adobe.ims.organizations.','adobe.ims.organization.','adobe.ims.orgs.','adobe.ims.org.','ims.organizations.','ims.organization.','ims.orgs.','ims.org.','organizations.','organization.','orgs.','org.']; const entries = []; for (const [key, value] of Object.entries(sourcePayload)) { const normalizedKey = String(key || '').trim(); if (!normalizedKey) { continue; } const matchedPrefix = candidatePrefixes.find((prefix) => normalizedKey.startsWith(prefix)); if (!matchedPrefix) { continue; } const organizationId = normalizedKey.slice(matchedPrefix.length).trim(); const organizationLabel = String(value ?? '').trim(); if (!organizationId || !organizationLabel) { continue; } entries.push({ id: organizationId, label: organizationLabel }); } return entries; }",
    "function normalizeConfiguredOrganizationEntry(entry, index = 0) { const payload = typeof entry === 'string' ? { id: entry, label: entry } : entry && typeof entry === 'object' ? entry : null; if (!payload) { return null; } const id = firstNonEmptyString([payload.id,payload.orgId,payload.orgID,payload.org_id,payload.organizationId,payload.organizationID,payload.organization_id,payload.customerOrgId,payload.customer_org_id,payload.value]); const label = firstNonEmptyString([payload.label,payload.name,payload.title,payload.displayName,payload.organizationName,payload.organization_name,id]); if (!id || !label) { return null; } return { key: `target-org:${String(id).trim().toLowerCase() || index}`, id: String(id).trim(), label: String(label).trim() }; }",
    "function normalizeConfiguredOrganizations(value, additionalEntries = []) { const sourceValue = normalizeConfiguredOrganizationsSource(value); if (!sourceValue && (!Array.isArray(additionalEntries) || additionalEntries.length === 0)) { return []; } const rawEntries = [...(Array.isArray(sourceValue) ? sourceValue : sourceValue && typeof sourceValue === 'object' ? Object.entries(sourceValue).map(([id, label]) => ({ id, label })) : []), ...(Array.isArray(additionalEntries) ? additionalEntries : [])]; const organizations = []; const seen = new Set(); rawEntries.forEach((entry, index) => { const normalized = normalizeConfiguredOrganizationEntry(entry, index); if (!normalized || seen.has(normalized.key)) { return; } seen.add(normalized.key); organizations.push(normalized); }); return organizations; }",
    extractFunctionSource(source, "normalizeImsScopeList"),
    extractFunctionSource(source, "normalizeImsScopeToken"),
    extractFunctionSource(source, "tokenizeImsScopeList"),
    extractFunctionSource(source, "resolveGrantedUnderparImsScope"),
    extractFunctionSource(source, "getMissingUnderparImsScopeTokens"),
    extractFunctionSource(source, "sanitizeUnderparImsScopeForCredential"),
    extractFunctionSource(source, "buildPreferredUnderparRequestedScope"),
    extractFunctionSource(source, "buildUnderparRequestedScopePlan"),
    extractFunctionSource(source, "resolveInteractiveUnderparRequestedScope"),
    extractFunctionSource(source, "normalizeUnderparVaultImsRuntimeConfigRecord"),
    extractFunctionSource(source, "extractUnderparImsRuntimeConfigFromZipKeyText"),
    extractFunctionSource(source, "buildUnderparImsAuthorizationCodeUrl"),
    extractFunctionSource(source, "buildUnderparImsLogoutUrl"),
    "module.exports = { normalizeImsScopeList, normalizeImsScopeToken, tokenizeImsScopeList, resolveGrantedUnderparImsScope, getMissingUnderparImsScopeTokens, sanitizeUnderparImsScopeForCredential, buildPreferredUnderparRequestedScope, buildUnderparRequestedScopePlan, resolveInteractiveUnderparRequestedScope, normalizeUnderparVaultImsRuntimeConfigRecord, extractUnderparImsRuntimeConfigFromZipKeyText, buildUnderparImsAuthorizationCodeUrl, buildUnderparImsLogoutUrl };",
  ].join("\n\n");
  const context = {
    module: { exports: {} },
    exports: {},
    atob: (value) => Buffer.from(String(value || ""), "base64").toString("binary"),
    TextDecoder,
    Uint8Array,
    URLSearchParams,
  };
  vm.runInNewContext(script, context, { filename: filePath });
  return context.module.exports;
}

function loadPopupClientIdCandidateHelper() {
  const filePath = path.join(ROOT, "popup.js");
  const source = fs.readFileSync(filePath, "utf8");
  const script = [
    "let tokenClaims = null;",
    "let runtimeConfig = null;",
    "function parseJwtPayload() { return tokenClaims || {}; }",
    "function getActiveUnderparImsRuntimeConfig() { return runtimeConfig; }",
    "function firstNonEmptyString(values = []) { for (const value of Array.isArray(values) ? values : []) { const text = String(value || '').trim(); if (text) { return text; } } return ''; }",
    "function uniquePreserveOrder(values = []) { const seen = new Set(); const output = []; for (const value of Array.isArray(values) ? values : []) { const text = String(value || '').trim(); if (!text || seen.has(text)) { continue; } seen.add(text); output.push(text); } return output; }",
    extractFunctionSource(source, "getUnderparImsClientIdCandidates"),
    "function setTestContext(nextTokenClaims = null, nextRuntimeConfig = null) { tokenClaims = nextTokenClaims; runtimeConfig = nextRuntimeConfig; }",
    "module.exports = { getUnderparImsClientIdCandidates, setTestContext };",
  ].join("\n\n");
  const context = {
    module: { exports: {} },
    exports: {},
  };
  vm.runInNewContext(script, context, { filename: filePath });
  return context.module.exports;
}

function loadPopupLogoutClientIdHelper() {
  const filePath = path.join(ROOT, "popup.js");
  const source = fs.readFileSync(filePath, "utf8");
  const script = [
    "let tokenClaims = null;",
    "let runtimeConfig = null;",
    "function parseJwtPayload() { return tokenClaims || {}; }",
    "function getActiveUnderparImsRuntimeConfig() { return runtimeConfig || {}; }",
    "function firstNonEmptyString(values = []) { for (const value of Array.isArray(values) ? values : []) { const text = String(value || '').trim(); if (text) { return text; } } return ''; }",
    extractFunctionSource(source, "getUnderparLogoutClientId"),
    "function setTestContext(nextTokenClaims = null, nextRuntimeConfig = null) { tokenClaims = nextTokenClaims; runtimeConfig = nextRuntimeConfig; }",
    "module.exports = { getUnderparLogoutClientId, setTestContext };",
  ].join("\n\n");
  const context = {
    module: { exports: {} },
    exports: {},
  };
  vm.runInNewContext(script, context, { filename: filePath });
  return context.module.exports;
}

function loadPopupCmActivationHelper() {
  const filePath = path.join(ROOT, "popup.js");
  const source = fs.readFileSync(filePath, "utf8");
  const script = [
    extractFunctionSource(source, "shouldAllowTemporaryCmBootstrapTabForActivation"),
    "module.exports = { shouldAllowTemporaryCmBootstrapTabForActivation };",
  ].join("\n\n");
  const context = {
    module: { exports: {} },
    exports: {},
  };
  vm.runInNewContext(script, context, { filename: filePath });
  return context.module.exports;
}

function loadPopupConsoleConfigUrlHelper() {
  const filePath = path.join(ROOT, "popup.js");
  const source = fs.readFileSync(filePath, "utf8");
  const script = [
    "let underparStateRef = null;",
    "function uniquePreserveOrder(values = []) { const seen = new Set(); const output = []; for (const value of Array.isArray(values) ? values : []) { const text = String(value || '').trim(); if (!text || seen.has(text)) { continue; } seen.add(text); output.push(text); } return output; }",
    extractFunctionSource(source, "mvpdWorkspaceExtractConfigurationVersion"),
    extractFunctionSource(source, "getKnownAdobeConsoleConfigurationVersion"),
    extractFunctionSource(source, "appendAdobeConsoleConfigurationVersion"),
    extractFunctionSource(source, "buildAdobeConsoleRestApiUrl"),
    extractFunctionSource(source, "buildProgrammerEndpointsForConsoleBase"),
    "function setBootstrapState(nextBootstrapState = null) { underparStateRef = nextBootstrapState && typeof nextBootstrapState === 'object' ? { consoleBootstrapState: nextBootstrapState } : null; }",
    "module.exports = { mvpdWorkspaceExtractConfigurationVersion, getKnownAdobeConsoleConfigurationVersion, appendAdobeConsoleConfigurationVersion, buildAdobeConsoleRestApiUrl, buildProgrammerEndpointsForConsoleBase, setBootstrapState };",
  ].join("\n\n");
  const context = {
    module: { exports: {} },
    exports: {},
    URL,
  };
  vm.runInNewContext(script, context, { filename: filePath });
  return context.module.exports;
}

function loadPopupExperienceCloudAuthResponseHelper() {
  const filePath = path.join(ROOT, "popup.js");
  const source = fs.readFileSync(filePath, "utf8");
  const script = [
    extractFunctionSource(source, "getRestV2CaseInsensitiveObjectValue"),
    extractFunctionSource(source, "getRestV2CaseInsensitiveHeaderValue"),
    extractFunctionSource(source, "isExperienceCloudAuthResponseUrl"),
    extractFunctionSource(source, "responseLooksLikeExperienceCloudSignIn"),
    "module.exports = { responseLooksLikeExperienceCloudSignIn };",
  ].join("\n\n");
  const context = {
    module: { exports: {} },
    exports: {},
    URL,
    Headers,
  };
  vm.runInNewContext(script, context, { filename: filePath });
  return context.module.exports;
}

function loadPopupRestrictedOrgLabelHelper() {
  const filePath = path.join(ROOT, "popup.js");
  const source = fs.readFileSync(filePath, "utf8");
  const script = [
    extractFunctionSource(source, "normalizeOrganizationIdentifier"),
    extractFunctionSource(source, "buildRestrictedOrgOptionLabel"),
    "module.exports = { buildRestrictedOrgOptionLabel };",
  ].join("\n\n");
  const context = {
    module: { exports: {} },
    exports: {},
  };
  vm.runInNewContext(script, context, { filename: filePath });
  return context.module.exports;
}

function loadPopupRestrictedActiveOrgHelper() {
  const filePath = path.join(ROOT, "popup.js");
  const source = fs.readFileSync(filePath, "utf8");
  const script = [
    'const ADOBEPASS_ORG_KEYWORD = "adobepass";',
    'const ADOBEPASS_ORG_HANDLE = "@adobepass";',
    'const ADOBEPASS_ORG_DISPLAY_NAME = "Adobe Pass";',
    'const ADOBEPASS_IMS_ORG_ID = "30FC5E0951240C900A490D4D@AdobeOrg";',
    "const ADOBEPASS_ORG_ID_ALLOWLIST = [];",
    "function firstNonEmptyString(values = []) { for (const value of Array.isArray(values) ? values : []) { const text = String(value || '').trim(); if (text) { return text; } } return ''; }",
    extractFunctionSource(source, "collectObjects"),
    extractFunctionSource(source, "flattenOrganizations"),
    extractFunctionSource(source, "normalizeOrganizationIdentifier"),
    extractFunctionSource(source, "extractStrongOrganizationId"),
    extractFunctionSource(source, "looksLikeOrganizationObject"),
    extractFunctionSource(source, "extractOrgName"),
    extractFunctionSource(source, "extractOrganizationId"),
    extractFunctionSource(source, "extractTenantOrganizationId"),
    extractFunctionSource(source, "extractImsOrganizationId"),
    extractFunctionSource(source, "extractOrganizationName"),
    extractFunctionSource(source, "extractUserId"),
    extractFunctionSource(source, "choosePreferredOrganizationName"),
    extractFunctionSource(source, "isGeneratedOrganizationName"),
    extractFunctionSource(source, "rankRestrictedOrganizationSource"),
    extractFunctionSource(source, "buildRestrictedOrgCandidateMergeKey"),
    extractFunctionSource(source, "buildRestrictedOrgOptionKey"),
    extractFunctionSource(source, "buildRestrictedOrgOptionLabel"),
    extractFunctionSource(source, "collectOrganizationObjects"),
    extractFunctionSource(source, "isLikelyUrlWithoutScheme"),
    extractFunctionSource(source, "collectRestrictedOrganizationCandidates"),
    extractFunctionSource(source, "restrictedOrganizationMatchesAnyIdentifier"),
    extractFunctionSource(source, "compareRestrictedOrganizationCandidatePriority"),
    extractFunctionSource(source, "findMatchingRestrictedOrganizationCandidate"),
    extractFunctionSource(source, "collectSessionActiveRestrictedOrganizationIdentifiers"),
    extractFunctionSource(source, "resolveActiveRestrictedOrganization"),
    extractFunctionSource(source, "sortRestrictedOrganizationOptions"),
    extractFunctionSource(source, "hasRestrictedOrganizationPickerOnlySource"),
    extractFunctionSource(source, "isRestrictedOrganizationAuthoritativeCandidate"),
    extractFunctionSource(source, "buildRestrictedOrganizationContext"),
    extractFunctionSource(source, "normalizeUnderparUnifiedShellOrganizationNode"),
    extractFunctionSource(source, "collectUnderparUnifiedShellOrganizations"),
    extractFunctionSource(source, "hasCanonicalRestrictedStoredOrganizations"),
    extractFunctionSource(source, "normalizeStoredRestrictedOrganizationCandidates"),
    extractFunctionSource(source, "collectRestrictedOrganizationIdentifierSet"),
    extractFunctionSource(source, "hasRestrictedOrganizationIdentifierIntersection"),
    extractFunctionSource(source, "isOrgIdAllowed"),
    extractFunctionSource(source, "matchesAdobePassOrg"),
    extractFunctionSource(source, "resolveCachedOrganizationsFromLoginData"),
    extractFunctionSource(source, "normalizeRequestedTargetOrganization"),
    extractFunctionSource(source, "isRestrictedOrganizationPickerRecord"),
    extractFunctionSource(source, "collectAuthoritativeRestrictedOrganizations"),
    "module.exports = { isRestrictedOrganizationPickerRecord, collectAuthoritativeRestrictedOrganizations, collectUnderparUnifiedShellOrganizations, hasCanonicalRestrictedStoredOrganizations, normalizeStoredRestrictedOrganizationCandidates, resolveCachedOrganizationsFromLoginData, matchesAdobePassOrg, normalizeRequestedTargetOrganization, buildRestrictedOrganizationContext };",
  ].join("\n\n");
  const context = {
    module: { exports: {} },
    exports: {},
    resolveLoginProfile: (session) => (session && typeof session.profile === "object" ? session.profile : {}),
    parseJwtPayload: () => ({}),
    getActiveUnderparImsRuntimeConfig: () => ({ organizations: [] }),
    extractVerifiedCustomerOrganizationClaim: (session) =>
      session && session.verifiedClaim && typeof session.verifiedClaim === "object"
        ? session.verifiedClaim
        : { id: "", rawId: "", source: "unavailable" },
  };
  vm.runInNewContext(script, context, { filename: filePath });
  return context.module.exports;
}

function loadPopupRestrictedSelectedOrgHelper() {
  const filePath = path.join(ROOT, "popup.js");
  const source = fs.readFileSync(filePath, "utf8");
  const script = [
    "function firstNonEmptyString(values = []) { for (const value of Array.isArray(values) ? values : []) { const text = String(value || '').trim(); if (text) { return text; } } return ''; }",
    extractFunctionSource(source, "resolveRestrictedPickerSelectedOrg"),
    "module.exports = { resolveRestrictedPickerSelectedOrg };",
  ].join("\n\n");
  const context = {
    module: { exports: {} },
    exports: {},
    normalizeRequestedTargetOrganization: (value) => (value && typeof value === "object" ? value : null),
    resolveLoginProfile: (session) => (session && typeof session.profile === "object" ? session.profile : {}),
    extractVerifiedCustomerOrganizationClaim: (session) =>
      session && session.verifiedClaim && typeof session.verifiedClaim === "object"
        ? session.verifiedClaim
        : { id: "", rawId: "", source: "unavailable" },
    resolveCachedOrganizationsFromLoginData: () => [],
    buildRestrictedOrganizationContext: (_organizations, session) => ({
      activeOrganization:
        session && session.activeOrganization && typeof session.activeOrganization === "object"
          ? session.activeOrganization
          : null,
    }),
  };
  vm.runInNewContext(script, context, { filename: filePath });
  return context.module.exports;
}

function loadPopupImsAuthLaunchHelper() {
  const filePath = path.join(ROOT, "popup.js");
  const source = fs.readFileSync(filePath, "utf8");
  const script = [
    "let recordedOptions = [];",
    "const NON_INTERACTIVE_AUTH_TIMEOUT_MS = 45000;",
    "const chrome = { identity: { launchWebAuthFlow: async (options) => { recordedOptions.push(options); return `callback:${String(options?.interactive)}`; } } };",
    extractFunctionSource(source, "launchUnderparImsAuthorizationFlow"),
    "function getRecordedOptions() { return recordedOptions.slice(); }",
    "function resetRecordedOptions() { recordedOptions = []; }",
    "module.exports = { launchUnderparImsAuthorizationFlow, getRecordedOptions, resetRecordedOptions, chrome };",
  ].join("\n\n");
  const context = {
    module: { exports: {} },
    exports: {},
  };
  vm.runInNewContext(script, context, { filename: filePath });
  return context.module.exports;
}

function loadPopupHeaderAuthClickHelper() {
  const filePath = path.join(ROOT, "popup.js");
  const source = fs.readFileSync(filePath, "utf8");
  const script = [
    "const state = { zipKeyImportPending: false, busy: false, sessionReady: false, loginData: null, restricted: false };",
    "let promptCount = 0;",
    "let signInCount = 0;",
    "let signInArgs = [];",
    "let toggleCount = 0;",
    "function shouldShowZipKeyImportGate() { return false; }",
    "function buildTargetOrganizationContext() { return { requiresSelection: false, selectedOrganization: null }; }",
    "function promptForZipKeyImport() { promptCount += 1; }",
    "function setStatus() {}",
    "function render() {}",
    "async function signInInteractive(options = {}) { signInCount += 1; signInArgs.push(options || {}); }",
    "function toggleAvatarMenu() { toggleCount += 1; }",
    extractFunctionSource(source, "onPrimarySignInClick"),
    extractFunctionSource(source, "onAuthClick"),
    "function setState(nextState = {}) { Object.assign(state, nextState || {}); }",
    "function getCounts() { return { promptCount, signInCount, toggleCount }; }",
    "function getLastSignInOptions() { return signInArgs.length > 0 ? signInArgs[signInArgs.length - 1] : null; }",
    "module.exports = { onPrimarySignInClick, onAuthClick, setState, getCounts, getLastSignInOptions };",
  ].join("\n\n");
  const context = {
    module: { exports: {} },
    exports: {},
  };
  vm.runInNewContext(script, context, { filename: filePath });
  return context.module.exports;
}

function loadPopupSilentBootstrapGateHelper() {
  const filePath = path.join(ROOT, "popup.js");
  const source = fs.readFileSync(filePath, "utf8");
  const script = [
    "const state = { sessionReady: false, restricted: false, busy: false, restrictedOrgSwitchBusy: false, zipKeyImportPending: false, manualSignOutHold: false };",
    "function hasConfiguredUnderparImsClientId() { return true; }",
    "function buildTargetOrganizationContext() { return { requiresSelection: false }; }",
    extractFunctionSource(source, "shouldAttemptSilentBootstrapSession"),
    "function setState(nextState = {}) { Object.assign(state, nextState || {}); }",
    "module.exports = { shouldAttemptSilentBootstrapSession, setState };",
  ].join("\n\n");
  const context = {
    module: { exports: {} },
    exports: {},
  };
  vm.runInNewContext(script, context, { filename: filePath });
  return context.module.exports;
}

function loadPopupCmPrecheckResetHelper() {
  const filePath = path.join(ROOT, "popup.js");
  const source = fs.readFileSync(filePath, "utf8");
  const script = [
    "const state = { cmTenantsPrecheckPromise: 'pending', cmTenantsPrecheckPending: true, cmTenantsPrecheckComplete: true, cmTenantsPrecheckLastError: 'boom', cmTenantsCatalog: { tenants: [1] }, cmTenantsCatalogPromise: Promise.resolve(null), cmTenantsCatalogHydrated: true, cmTenantsCatalogHydrationPromise: Promise.resolve(null), cmTenantsCatalogRuntimeFresh: true, cmTenantsCatalogFetchAttempted: true };",
    "let syncCalls = 0;",
    "function syncMediaCompanySelectAvailability() { syncCalls += 1; }",
    extractFunctionSource(source, "resetCmTenantsPrecheckState"),
    "function getStateSnapshot() { return { ...state }; }",
    "function getSyncCalls() { return syncCalls; }",
    "module.exports = { resetCmTenantsPrecheckState, getStateSnapshot, getSyncCalls };",
  ].join("\n\n");
  const context = {
    module: { exports: {} },
    exports: {},
    Promise,
  };
  vm.runInNewContext(script, context, { filename: filePath });
  return context.module.exports;
}

function loadPopupMediaCompanyAvailabilityHelper() {
  const filePath = path.join(ROOT, "popup.js");
  const source = fs.readFileSync(filePath, "utf8");
  const script = [
    "const state = { sessionReady: false, loginData: null, restricted: false };",
    'const els = { mediaCompanySelect: { disabled: false, options: [{ textContent: "" }, { value: "abc" }] } };',
    "function matchesAdobePassOrg(value = null) { return Boolean(value && value.isAdobePass === true); }",
    "function resolveProgrammerAccessContext(sessionData = null) { return sessionData && sessionData.activeAdobePass === true ? { activeIsAdobePass: true } : { activeIsAdobePass: false }; }",
    extractFunctionSource(source, "getMediaCompanySelectDefaultLabel"),
    extractFunctionSource(source, "isMediaCompanySelectionLockedByCmPrecheck"),
    extractFunctionSource(source, "hasRequestedAdobePassTargetOrganization"),
    extractFunctionSource(source, "shouldHydrateAdobePassWorkflowForSession"),
    extractFunctionSource(source, "shouldOfferAdobePassRecoveryForSession"),
    extractFunctionSource(source, "syncMediaCompanySelectAvailability"),
    "function setState(nextState = {}) { Object.assign(state, nextState || {}); }",
    "function getSelect() { return els.mediaCompanySelect; }",
    "module.exports = { syncMediaCompanySelectAvailability, setState, getSelect };",
  ].join("\n\n");
  const context = {
    module: { exports: {} },
    exports: {},
  };
  vm.runInNewContext(script, context, { filename: filePath });
  return context.module.exports;
}

function loadWorkspaceProgrammerIdentityHelper(fileName) {
  const filePath = path.join(ROOT, fileName);
  const source = fs.readFileSync(filePath, "utf8");
  const script = [
    extractFunctionSource(source, "hasProgrammerIdentityChanged"),
    "module.exports = { hasProgrammerIdentityChanged };",
  ].join("\n\n");
  const context = {
    module: { exports: {} },
    exports: {},
  };
  vm.runInNewContext(script, context, { filename: filePath });
  return context.module.exports;
}

test("runtime source no longer hard-codes debugger client or legacy redirect host", () => {
  const popupSource = fs.readFileSync(path.join(ROOT, "popup.js"), "utf8");
  const backgroundSource = fs.readFileSync(path.join(ROOT, "background.js"), "utf8");
  const manifestSource = fs.readFileSync(path.join(ROOT, "manifest.json"), "utf8");

  for (const source of [popupSource, backgroundSource, manifestSource]) {
    assert.equal(/adobeExperienceCloudDebugger/i.test(source), false);
    assert.equal(/login\.aepdebugger\.adobe\.com/i.test(source), false);
  }
});

test("legacy helper login surface is no longer shipped", () => {
  assert.equal(fs.existsSync(path.join(ROOT, "src/login/login.js")), false);
  assert.equal(fs.existsSync(path.join(ROOT, "src/login/login.html")), false);
  assert.equal(fs.existsSync(path.join(ROOT, "src/login/login.css")), false);

  const popupSource = fs.readFileSync(path.join(ROOT, "popup.js"), "utf8");
  const backgroundSource = fs.readFileSync(path.join(ROOT, "background.js"), "utf8");
  const manifestSource = fs.readFileSync(path.join(ROOT, "manifest.json"), "utf8");

  for (const source of [popupSource, backgroundSource, manifestSource]) {
    assert.equal(/src\/login\/login\.(html|js|css)/.test(source), false);
    assert.equal(/loginHelperResult/i.test(source), false);
  }
});

test("interactive UnderPAR IMS login now uses the chrome.identity web auth transport", () => {
  const popupSource = fs.readFileSync(path.join(ROOT, "popup.js"), "utf8");
  const retrySource = extractFunctionSource(popupSource, "runUnderparPkceLogin");

  assert.match(retrySource, /if \(interactive\) \{\s*responseUrl = String\(await launchUnderparImsAuthorizationFlow\(authorizeUrl, true\)\);/);
  assert.match(retrySource, /responseUrl = String\(await launchUnderparImsAuthorizationFlow\(authorizeUrl, false\)\);/);
  assert.doesNotMatch(retrySource, /launchUnderparImsAuthorizationFlow\(authorizeUrl, interactive\)/);
  assert.doesNotMatch(popupSource, /runAuthInPopupWindow/);
});

test("header UP button no longer launches sign-in when logged out", async () => {
  const helpers = loadPopupHeaderAuthClickHelper();

  helpers.setState({
    zipKeyImportPending: false,
    busy: false,
    sessionReady: false,
    loginData: null,
    restricted: false,
  });
  await helpers.onAuthClick();
  assert.equal(JSON.stringify(helpers.getCounts()), JSON.stringify({
    promptCount: 0,
    signInCount: 0,
    toggleCount: 0,
  }));

  await helpers.onPrimarySignInClick();
  assert.equal(JSON.stringify(helpers.getCounts()), JSON.stringify({
    promptCount: 0,
    signInCount: 1,
    toggleCount: 0,
  }));
  assert.equal(
    JSON.stringify(helpers.getLastSignInOptions()),
    JSON.stringify({
      prompt: "login",
      forceBrowserLogout: true,
    })
  );

  helpers.setState({
    sessionReady: true,
    loginData: {
      accessToken: "token",
    },
  });
  await helpers.onAuthClick();
  assert.equal(JSON.stringify(helpers.getCounts()), JSON.stringify({
    promptCount: 0,
    signInCount: 1,
    toggleCount: 1,
  }));
});

test("silent UnderPAR IMS login keeps non-interactive launchWebAuthFlow options", async () => {
  const helpers = loadPopupImsAuthLaunchHelper();
  helpers.resetRecordedOptions();

  const response = await helpers.launchUnderparImsAuthorizationFlow("https://ims.example/authorize", false);

  assert.equal(response, "callback:false");
  const [request] = helpers.getRecordedOptions();
  assert.equal(request.url, "https://ims.example/authorize");
  assert.equal(request.interactive, false);
  assert.equal(request.abortOnLoadForNonInteractive, false);
  assert.equal(request.timeoutMsForNonInteractive, 45000);
});

test("CM auth bootstrap no longer harvests tokens from Experience page context", () => {
  const popupSource = fs.readFileSync(path.join(ROOT, "popup.js"), "utf8");

  assert.equal(/requestCmConsoleTokenFromExperiencePageContext/.test(popupSource), false);
  assert.equal(/page-cm:/.test(popupSource), false);
});

test("popup IMS runtime config parser recognizes adobe.ims ZIP.KEY paths", () => {
  const popupSource = fs.readFileSync(path.join(ROOT, "popup.js"), "utf8");

  assert.match(popupSource, /services\.adobe\.ims\.client_id/);
  assert.match(popupSource, /adobe\.ims\.client_id/);
  assert.match(popupSource, /services\.adobe\.ims\.scope/);
  assert.match(popupSource, /adobe\.ims\.scope/);
});

test("ZIP.KEY-only Adobe IMS imports accept direct adobe.ims.client_id entries", () => {
  const helpers = loadPopupImsHelpers();

  const result = helpers.extractUnderparImsRuntimeConfigFromZipKeyText([
    "adobe.ims.client_id=underpar-client-id",
    "adobe.ims.scope=openid profile additional_info.projectedProductContext",
  ].join("\n"));

  assert.equal(result.imsRuntimeConfig.clientId, "underpar-client-id");
  assert.equal(result.imsRuntimeConfig.scope, "openid profile additional_info.projectedProductContext");
  assert.equal(result.imsRuntimeConfig.source, "ZIP.KEY");
});

test("legacy UnderPAR ZIP.KEY scope bundle clamps to the LoginButton consent scope set", () => {
  const helpers = loadPopupImsHelpers();

  const result = helpers.extractUnderparImsRuntimeConfigFromZipKeyText([
    "adobe.ims.client_id=underpar-client-id",
    "adobe.ims.scope=openid profile offline_access additional_info.projectedProductContext read_organizations",
  ].join("\n"));

  assert.equal(
    result.imsRuntimeConfig.scope,
    "openid profile offline_access additional_info.projectedProductContext"
  );
});

test("ZIP.KEY Adobe IMS imports preserve configured org picker entries", () => {
  const helpers = loadPopupImsHelpers();

  const result = helpers.extractUnderparImsRuntimeConfigFromZipKeyText(
    JSON.stringify({
      adobe: {
        ims: {
          client_id: "underpar-client-id",
          organizations: [
            {
              id: "@AdobePass",
              label: "@AdobePass",
            },
            {
              id: "alt-org",
              label: "Alternate Org",
            },
          ],
        },
      },
    })
  );

  assert.deepEqual(
    JSON.parse(JSON.stringify(result.imsRuntimeConfig.organizations)),
    [
      {
        key: "target-org:@adobepass",
        id: "@AdobePass",
        label: "@AdobePass",
      },
      {
        key: "target-org:alt-org",
        id: "alt-org",
        label: "Alternate Org",
      },
    ]
  );
});

test("legacy IMS scope bundles clamp to the LoginButton-style PKCE default scope", () => {
  const helpers = loadPopupImsHelpers();

  const result = helpers.sanitizeUnderparImsScopeForCredential(
    "AdobeID,openid,avatar,session,read_organizations,additional_info.job_function,additional_info.projectedProductContext,analytics_services"
  );

  assert.equal(
    result.scope,
    "openid profile offline_access additional_info.projectedProductContext"
  );
  assert.deepEqual(
    [...result.droppedScopes].sort(),
    ["AdobeID", "additional_info.job_function", "analytics_services", "avatar", "read_organizations", "session"].sort()
  );
});

test("supported Adobe IMS consent scopes survive ZIP.KEY normalization order", () => {
  const helpers = loadPopupImsHelpers();

  const result = helpers.sanitizeUnderparImsScopeForCredential(
    "offline_access openid profile additional_info.projectedProductContext"
  );

  assert.equal(
    result.scope,
    "openid profile offline_access additional_info.projectedProductContext"
  );
  assert.deepEqual([...result.droppedScopes], []);
});

test("interactive IMS scope planning never widens beyond the supported LoginButton consent scope", () => {
  const helpers = loadPopupImsHelpers();

  assert.equal(
    helpers.buildPreferredUnderparRequestedScope(
      "openid profile offline_access additional_info.projectedProductContext"
    ),
    "openid profile offline_access additional_info.projectedProductContext"
  );
  assert.deepEqual(
    [...helpers.buildUnderparRequestedScopePlan(
      "openid profile offline_access additional_info.projectedProductContext"
    )],
    ["openid profile offline_access additional_info.projectedProductContext"]
  );
});

test("interactive sign-in promotes narrow ZIP.KEY scope settings to the supported LoginButton consent bundle", () => {
  const helpers = loadPopupImsHelpers();

  assert.equal(
    helpers.resolveInteractiveUnderparRequestedScope("openid profile AdobeID"),
    "openid profile offline_access additional_info.projectedProductContext"
  );
  assert.equal(
    helpers.resolveInteractiveUnderparRequestedScope("openid profile offline_access additional_info.projectedProductContext"),
    "openid profile offline_access additional_info.projectedProductContext"
  );
  assert.equal(
    helpers.resolveInteractiveUnderparRequestedScope(
      "openid profile offline_access additional_info.projectedProductContext read_organizations"
    ),
    "openid profile offline_access additional_info.projectedProductContext"
  );
});

test("primary IMS client-id candidates come from the token and ZIP.KEY runtime config only", () => {
  const helpers = loadPopupClientIdCandidateHelper();

  helpers.setTestContext({ client_id: "token-client" }, { clientId: "vault-client" });
  assert.deepEqual([...helpers.getUnderparImsClientIdCandidates("token-value")], ["token-client", "vault-client"]);

  helpers.setTestContext({}, null);
  assert.deepEqual([...helpers.getUnderparImsClientIdCandidates("")], []);
});

test("logout revocation targets the active UnderPAR client id before falling back to ZIP.KEY runtime config", () => {
  const helpers = loadPopupLogoutClientIdHelper();

  helpers.setTestContext({ client_id: "token-client" }, { clientId: "vault-client" });
  assert.equal(
    helpers.getUnderparLogoutClientId({
      accessToken: "token-value",
      imsSession: {
        clientId: "session-client",
      },
    }),
    "token-client"
  );

  helpers.setTestContext({}, { clientId: "vault-client" });
  assert.equal(
    helpers.getUnderparLogoutClientId({
      accessToken: "",
      imsSession: {},
    }),
    "vault-client"
  );
});

test("activation reuses cached organization payloads from the PKCE login handoff", () => {
  const popupSource = fs.readFileSync(path.join(ROOT, "popup.js"), "utf8");
  const buildSessionSource = extractFunctionSource(popupSource, "buildLoginSessionPayloadFromAuth");
  const enforceAccessSource = extractFunctionSource(popupSource, "enforceAdobePassAccess");

  assert.match(buildSessionSource, /organizations:/);
  assert.match(enforceAccessSource, /resolveCachedOrganizationsFromLoginData\(loginData\)/);
  assert.doesNotMatch(enforceAccessSource, /let organizations = \[\];/);
});

test("activation uses the primary IMS bearer before programmer discovery", () => {
  const popupSource = fs.readFileSync(path.join(ROOT, "popup.js"), "utf8");
  const activateSource = extractFunctionSource(popupSource, "activateSession");
  const hydrateSource = extractFunctionSource(popupSource, "hydrateAuthenticatedAdobePassSession");
  const postLoginHydrateSource = extractFunctionSource(popupSource, "hydratePostLoginSessionData");
  const consoleTokenPreferenceSource = extractFunctionSource(popupSource, "getPreferredAdobeConsoleAccessTokenCandidate");

  assert.match(consoleTokenPreferenceSource, /getPreferredPrimaryImsAccessTokenCandidate\(\)/);
  assert.doesNotMatch(consoleTokenPreferenceSource, /getPreferredExperienceCloudConsoleAccessTokenCandidate\(\)/);
  assert.match(activateSource, /state\.consoleCsrfToken = "";/);
  assert.match(activateSource, /state\.consoleBootstrapState = null;/);
  assert.match(
    activateSource,
    /firstNonEmptyString\(\[\s*resolvedLoginData\?\.accessToken,\s*getPreferredPrimaryImsAccessTokenCandidate\(\),\s*getPreferredAdobeConsoleAccessTokenCandidate\(\),/
  );
  assert.doesNotMatch(activateSource, /requestQualifiedExperienceCloudConsoleToken\(\{/);
  assert.doesNotMatch(activateSource, /qualifiedExperienceCloudTokenResult\?\.accessToken/);
  assert.doesNotMatch(activateSource, /mergeExperienceCloudConsoleTokenIntoLoginData\(/);
  assert.doesNotMatch(activateSource, /await loadProgrammersData\(consoleAccessToken/);
  assert.match(activateSource, /void hydrateAuthenticatedAdobePassSession\(normalizedSource,\s*\{/);
  assert.match(hydrateSource, /hydratePostLoginSessionData\(currentLoginData,\s*\{/);
  assert.match(postLoginHydrateSource, /buildConsoleContext\(/);
  assert.match(postLoginHydrateSource, /buildCmContext\(/);
  assert.match(postLoginHydrateSource, /buildUnifiedShellContext\(/);
  assert.match(activateSource, /resetBootstrapTokens: true/);
  assert.match(activateSource, /mergeCmConsoleBootstrapIntoLoginData\(\s*await normalizedLoginDataPromise,\s*enforced\.loginData\s*\)/);
  assert.doesNotMatch(activateSource, /getDefaultAdobePassOrgDescriptor\(\)/);
});

test("sign out path revokes Adobe tokens before clearing session state", () => {
  const popupSource = fs.readFileSync(path.join(ROOT, "popup.js"), "utf8");
  assert.match(popupSource, /revokeUnderparLoginTokensForLogout\(state\.loginData\)/);
});

test("interactive Adobe auth no longer ships the legacy popup monitor transport or console security-context bootstrap", () => {
  const popupSource = fs.readFileSync(path.join(ROOT, "popup.js"), "utf8");
  const signInSource = extractFunctionSource(popupSource, "signInInteractive");

  assert.equal(/function runAuthInPopupWindow\(/.test(popupSource), false);
  assert.equal(/function ensureConsoleSecurityContext\(/.test(popupSource), false);
  assert.equal(/function isConsoleAuthWindowSuccessUrl\(/.test(popupSource), false);
  assert.equal(/keepAuthWindowOpenForBootstrap/.test(signInSource), false);
});

test("interactive login and org switching keep normal activation without legacy org-forcing auth params", () => {
  const popupSource = fs.readFileSync(path.join(ROOT, "popup.js"), "utf8");
  const signInSource = extractFunctionSource(popupSource, "signInInteractive");
  const refreshSource = extractFunctionSource(popupSource, "refreshSessionManual");
  const restrictedSwitchSource = extractFunctionSource(popupSource, "onRestrictedOrgSwitch");

  assert.match(signInSource, /activateSession\(/);
  assert.match(refreshSource, /activateSession\(/);
  assert.match(restrictedSwitchSource, /activateSession\(/);
  assert.doesNotMatch(signInSource, /withTemporaryCmConsoleBootstrapContext/);
  assert.doesNotMatch(refreshSource, /withTemporaryCmConsoleBootstrapContext/);
  assert.doesNotMatch(restrictedSwitchSource, /withTemporaryCmConsoleBootstrapContext/);
  assert.doesNotMatch(signInSource, /await awaitCmBootstrapForExplicitActivation\("interactive"/);
  assert.doesNotMatch(refreshSource, /await awaitCmBootstrapForExplicitActivation\(/);
  assert.doesNotMatch(restrictedSwitchSource, /await awaitCmBootstrapForExplicitActivation\("restricted-org-switch"/);
  assert.match(signInSource, /allowTemporaryPageContextTab:\s*true/);
  assert.match(restrictedSwitchSource, /runUnderparImsBrowserLogout\(/);
  assert.doesNotMatch(signInSource, /releaseAuthPopupBootstrapContext\(/);
  assert.match(refreshSource, /allowTemporaryPageContextTab:\s*usedInteractiveLogin/);
  assert.match(restrictedSwitchSource, /allowTemporaryPageContextTab:\s*true/);
  assert.doesNotMatch(signInSource, /extraParams:/);
  assert.doesNotMatch(restrictedSwitchSource, /extraParams:/);
  assert.doesNotMatch(
    popupSource,
    /function (?:releaseAuthPopupBootstrapContext|retainAuthPopupBootstrapContext|maybeReleaseRetainedAuthPopupBootstrapContext|getRetainedAuthPopupBootstrapTabId)\(/
  );
  assert.doesNotMatch(popupSource, /function buildPreferredOrgSwitchStrategy\(/);
  assert.doesNotMatch(popupSource, /function buildOrgSwitchStrategies\(/);
  assert.doesNotMatch(popupSource, /function attemptInteractiveAdobePassRecovery\(/);
  assert.doesNotMatch(popupSource, /function attemptAutoSwitchToAdobePass\(/);
});

test("session activation delegates background hydration to the shared LoginButton-style session context builder", () => {
  const popupSource = fs.readFileSync(path.join(ROOT, "popup.js"), "utf8");
  const activateSource = extractFunctionSource(popupSource, "activateSession");
  const hydrateSource = extractFunctionSource(popupSource, "hydrateAuthenticatedAdobePassSession");
  const postLoginHydrateSource = extractFunctionSource(popupSource, "hydratePostLoginSessionData");
  const buildConsoleContextSource = extractFunctionSource(popupSource, "buildConsoleContext");
  const mediaCompanyLockSource = extractFunctionSource(popupSource, "isMediaCompanySelectionLockedByCmPrecheck");
  const mediaCompanyLabelSource = extractFunctionSource(popupSource, "getMediaCompanySelectDefaultLabel");
  const prefetchSource = extractFunctionSource(popupSource, "prefetchCmTenantsCatalogInBackground");

  assert.doesNotMatch(activateSource, /prefetchCmTenantsCatalogInBackground/);
  assert.doesNotMatch(activateSource, /await ensureCmTenantsPrecheckForActiveSession/);
  assert.doesNotMatch(activateSource, /await loadProgrammersData\(/);
  assert.match(activateSource, /void hydrateAuthenticatedAdobePassSession\(normalizedSource,/);
  assert.match(hydrateSource, /hydratePostLoginSessionData\(currentLoginData,\s*\{/);
  assert.match(hydrateSource, /applyHydratedSessionContextsToState\(hydratedLoginData,\s*\{/);
  assert.match(hydrateSource, /const shouldRetryLimitedRestrictedSwitchHydration =/);
  assert.match(hydrateSource, /normalizedSource === "restricted-org-switch" \|\| normalizedSource === "interactive-auto-switch-recovery"/);
  assert.match(hydrateSource, /Retrying Adobe Pass session hydration after limited restricted switch bootstrap/);
  assert.match(postLoginHydrateSource, /buildConsoleContext\(/);
  assert.match(postLoginHydrateSource, /buildCmContext\(/);
  assert.match(postLoginHydrateSource, /buildUnifiedShellContext\(/);
  assert.ok(
    buildConsoleContextSource.indexOf("Console extended profile") <
      buildConsoleContextSource.indexOf("Console configuration version")
  );
  assert.doesNotMatch(hydrateSource, /prefetchCmConsoleBootstrapSummaryInBackground/);
  assert.match(activateSource, /mergeCmConsoleBootstrapIntoLoginData\(/);
  assert.match(mediaCompanyLockSource, /return false;/);
  assert.match(mediaCompanyLabelSource, /-- Choose a Media Company --/);
  assert.match(prefetchSource, /ensureCmTenantsPrecheckForActiveSession/);
  assert.doesNotMatch(activateSource, /captureAdobePassEnvironmentSwitchSelectionSnapshot\(\)/);
  assert.doesNotMatch(activateSource, /restorePreferredProgrammerSelectionForActivation\(/);
  assert.doesNotMatch(activateSource, /refreshProgrammerPanels\(\{[\s\S]*session-activated:/);
});

test("generic non-AdobePass sessions stay IMS-only until AdobePass is explicitly requested", () => {
  const popupSource = fs.readFileSync(path.join(ROOT, "popup.js"), "utf8");
  const activateSource = extractFunctionSource(popupSource, "activateSession");
  const applySessionSource = extractFunctionSource(popupSource, "applyActiveLoginSession");
  const orgSwitchOnlySource = extractFunctionSource(popupSource, "isAuthenticatedOrgSwitchOnlySession");
  const renderSource = extractFunctionSource(popupSource, "render");
  const restrictedSwitchSource = extractFunctionSource(popupSource, "onRestrictedOrgSwitch");

  assert.doesNotMatch(activateSource, /if \(!enforced\.allowed \|\| !enforced\.loginData\)/);
  assert.match(activateSource, /if \(!enforced\?\.loginData\) \{/);
  assert.match(popupSource, /function hasRequestedAdobePassTargetOrganization\(sessionData = null\)/);
  assert.match(popupSource, /function shouldHydrateAdobePassWorkflowForSession\(sessionData = null\)/);
  assert.match(popupSource, /function shouldOfferAdobePassRecoveryForSession\(sessionData = null\)/);
  assert.match(activateSource, /const shouldHydrateAdobePassWorkflow = shouldHydrateAdobePassWorkflowForSession\(resolvedLoginData\);/);
  assert.match(activateSource, /const sessionRequiresOrgSelection = shouldOfferAdobePassRecoveryForSession\(resolvedLoginData\);/);
  assert.match(activateSource, /const authenticatedOrgPickerOnly = !shouldHydrateAdobePassWorkflow;/);
  assert.match(activateSource, /} else if \(shouldHydrateAdobePassWorkflow\) \{\s*resetWorkflowForAuthenticatedHydration\(\);\s*\} else \{\s*resetWorkflowForAuthenticatedImsSession\(\);/s);
  assert.match(activateSource, /if \(shouldHydrateAdobePassWorkflow\) \{\s*void hydrateAuthenticatedAdobePassSession\(/s);
  assert.match(applySessionSource, /if \(!shouldHydrateAdobePassWorkflowForSession\(loginData\)\) \{\s*syncAuthenticatedOrgSwitchOnlyContext\(loginData\);\s*\} else \{\s*clearRestrictedOrgOptions\(\);/s);
  assert.match(orgSwitchOnlySource, /!shouldHydrateAdobePassWorkflowForSession\(currentSession\)/);
  assert.match(renderSource, /const authenticatedOrgSwitchOnly = isAuthenticatedOrgSwitchOnlySession\(\);/);
  assert.match(renderSource, /const adobePassWorkflowActive =[\s\S]*shouldHydrateAdobePassWorkflowForSession\(state\.loginData\);/);
  assert.match(renderSource, /els\.restrictedView\.hidden = !authenticatedOrgSwitchOnly;/);
  assert.match(renderSource, /els\.workflow\.hidden = authenticatedOrgSwitchOnly \|\| !adobePassWorkflowActive;/);
  assert.match(renderSource, /if \(authenticatedOrgSwitchOnly\) \{\s*renderRestrictedView\(\);/s);
  assert.match(
    restrictedSwitchSource,
    /if \(state\.busy \|\| state\.restrictedOrgSwitchBusy \|\| !\(state\.restricted \|\| isAuthenticatedOrgSwitchOnlySession\(\)\)\) \{/
  );
});

test("AdobePASS console and CM precheck stay skipped for generic IMS sessions and gated only for explicit AdobePass recovery", () => {
  const popupSource = fs.readFileSync(path.join(ROOT, "popup.js"), "utf8");
  const consoleBootstrapSource = extractFunctionSource(popupSource, "buildConsoleContext");
  const cmContextSource = extractFunctionSource(popupSource, "buildCmContext");
  const precheckSource = extractFunctionSource(popupSource, "ensureCmTenantsPrecheckForActiveSession");
  const applyHydratedSource = extractFunctionSource(popupSource, "applyHydratedSessionContextsToState");

  assert.match(consoleBootstrapSource, /const explicitAdobePassRecoveryRequested = shouldOfferAdobePassRecoveryForSession\(currentSession\);/);
  assert.match(consoleBootstrapSource, /if \(!shouldHydrateAdobePassWorkflowForSession\(currentSession\)\) \{/);
  assert.match(consoleBootstrapSource, /status:\s*explicitAdobePassRecoveryRequested \? "restricted" : "skipped"/);
  assert.match(consoleBootstrapSource, /phase:\s*explicitAdobePassRecoveryRequested \? "org-selection-required" : "non-adobepass-org"/);
  assert.match(cmContextSource, /const explicitAdobePassRecoveryRequested = shouldOfferAdobePassRecoveryForSession\(currentSession\);/);
  assert.match(cmContextSource, /if \(!shouldHydrateAdobePassWorkflowForSession\(currentSession\)\) \{/);
  assert.match(cmContextSource, /reportsStatus:\s*explicitAdobePassRecoveryRequested \? "org-selection-required" : "skipped"/);
  assert.match(precheckSource, /const explicitAdobePassRecoveryRequested = shouldOfferAdobePassRecoveryForSession\(state\.loginData\);/);
  assert.match(precheckSource, /if \(!shouldHydrateAdobePassWorkflowForSession\(state\.loginData\)\) \{/);
  assert.match(precheckSource, /status:\s*explicitAdobePassRecoveryRequested \? "restricted" : "skipped"/);
  assert.match(precheckSource, /phase:\s*explicitAdobePassRecoveryRequested \? "org-selection-required" : "non-adobepass-org"/);
  assert.match(applyHydratedSource, /const cmRequiresOrgSelection = cmContext\?\.status === "org-selection-required";/);
  assert.match(
    applyHydratedSource,
    /status: cmCatalogReady \? "success" : cmRequiresOrgSelection \? "restricted" : currentSession\?\.accessToken \? "error" : "skipped"/
  );
});

test("restricted org switch retries programmer hydration once after CM precheck when console bootstrap stayed limited", () => {
  const popupSource = fs.readFileSync(path.join(ROOT, "popup.js"), "utf8");
  const hydrateSource = extractFunctionSource(popupSource, "hydrateAuthenticatedAdobePassSession");

  assert.match(hydrateSource, /Array\.isArray\(hydratedLoginData\?\.console\?\.programmers\)/);
  assert.match(hydrateSource, /Number\(hydratedLoginData\?\.console\?\.configurationVersion \|\| 0\) <= 0/);
  assert.match(hydrateSource, /allowBackgroundTemporaryPageContextTab/);
  assert.match(hydrateSource, /await sleep\(250\);/);
  assert.match(hydrateSource, /forceRefresh:\s*true/);
  assert.match(hydrateSource, /hydrationResult = await settle\(\(\) =>\s*hydratePostLoginSessionData\(hydratedLoginData,\s*\{/);
});

test("post-login hydration starts AdobePass console bootstrap in parallel with CM and Unified Shell like LoginButton", () => {
  const popupSource = fs.readFileSync(path.join(ROOT, "popup.js"), "utf8");
  const hydrateSource = extractFunctionSource(popupSource, "hydratePostLoginSessionData");

  assert.match(
    hydrateSource,
    /const \[nextConsoleContext,\s*nextCmContext,\s*nextUnifiedShellContext\] = await Promise\.all\(\[\s*buildConsoleContext\(currentSession,\s*normalizedReason,\s*\{[\s\S]*?buildCmContext\(currentSession,\s*normalizedReason,\s*\{[\s\S]*?buildUnifiedShellContext\(currentSession,\s*normalizedReason\),[\s\S]*?\]\);/s
  );
  assert.doesNotMatch(
    hydrateSource,
    /const \[nextCmContext,\s*nextUnifiedShellContext\] = await Promise\.all\(\[[\s\S]*?const nextConsoleContext = await buildConsoleContext\(/s
  );
  assert.doesNotMatch(
    hydrateSource,
    /buildConsoleContext\(\s*\{\s*\.\.\.currentSession,\s*cm:\s*nextCmContext,\s*unifiedShell:\s*nextUnifiedShellContext/s
  );
});

test("limited console bootstrap without a configuration version no longer escalates into a fatal programmer load error", () => {
  const popupSource = fs.readFileSync(path.join(ROOT, "popup.js"), "utf8");
  const hydrateSource = extractFunctionSource(popupSource, "hydrateAuthenticatedAdobePassSession");

  assert.match(hydrateSource, /const consoleConfigurationMissing = Number\(consoleContext\?\.configurationVersion \|\| 0\) <= 0;/);
  assert.match(
    hydrateSource,
    /!hasProgrammers && !consoleConfigurationMissing \? consoleContext\?\.errors\?\.configurationVersion : "",/
  );
  assert.match(
    hydrateSource,
    /!hasProgrammers && !consoleConfigurationMissing \? consoleContext\?\.errors\?\.programmers : "",/
  );
  assert.doesNotMatch(
    hydrateSource,
    /!hasProgrammers && consoleConfigurationMissing \? consoleContext\?\.errors\?\.configurationVersion : "",/
  );
});

test("environment restore lets the premium panel path own PassVault hydration", () => {
  const popupSource = fs.readFileSync(path.join(ROOT, "popup.js"), "utf8");
  const applySelectionSource = extractFunctionSource(popupSource, "applyGlobalSelectionSnapshot");

  assert.match(applySelectionSource, /refreshProgrammerPanels\(/);
  assert.doesNotMatch(applySelectionSource, /hydrateProgrammerFromPassVault\(/);
});

test("selected media company refresh starts direct premium hydration immediately and keeps CM matching bounded", () => {
  const popupSource = fs.readFileSync(path.join(ROOT, "popup.js"), "utf8");
  const refreshPanelsSource = extractFunctionSource(popupSource, "refreshProgrammerPanels");
  const ensureApplicationsSource = extractFunctionSource(popupSource, "ensureSelectedProgrammerApplicationsLoaded");
  const selectPreferredCmRuntimeServiceSource = extractFunctionSource(popupSource, "selectPreferredCmRuntimeService");

  assert.match(refreshPanelsSource, /const skipCmBootstrap = options\.skipCmBootstrap === true;/);
  assert.match(
    refreshPanelsSource,
    /const programmerApplicationsPromise =[\s\S]*options\.programmerApplicationsPromise[\s\S]*ensureSelectedProgrammerApplicationsLoaded\(programmer,/
  );
  assert.match(refreshPanelsSource, /const programmerId = String\(programmer\?\.programmerId \|\| ""\)\.trim\(\);/);
  assert.match(refreshPanelsSource, /const cmSelectionBootstrapPromise = skipCmBootstrap/);
  assert.match(refreshPanelsSource, /const applicationsData = await programmerApplicationsPromise;/);
  assert.match(
    refreshPanelsSource,
    /const premiumHydrationPromise = primeProgrammerServiceHydration\(programmer,\s*provisionalServices,\s*\{/
  );
  assert.match(refreshPanelsSource, /applicationsData,/);
  assert.match(refreshPanelsSource, /ensureCmTenantsPrecheckForActiveSession\(`panel-selection:\$\{programmerId\}`/);
  assert.ok(
    refreshPanelsSource.indexOf("const applicationsData = await programmerApplicationsPromise;") <
      refreshPanelsSource.indexOf("const premiumHydrationPromise = primeProgrammerServiceHydration(")
  );
  assert.ok(
    refreshPanelsSource.indexOf("const premiumHydrationPromise = primeProgrammerServiceHydration(") <
      refreshPanelsSource.indexOf("let resolvedServices = await premiumHydrationPromise;")
  );
  assert.ok(
    refreshPanelsSource.indexOf("renderPremiumServices(provisionalServices, programmer, { controllerReason });") <
      refreshPanelsSource.indexOf("let resolvedServices = await premiumHydrationPromise;")
  );
  assert.doesNotMatch(refreshPanelsSource, /await cmSelectionBootstrapPromise;/);
  assert.ok(
    refreshPanelsSource.indexOf("let resolvedServices = await premiumHydrationPromise;") <
      refreshPanelsSource.indexOf("const cmSelectionReadyPromise = skipCmBootstrap")
  );
  assert.doesNotMatch(refreshPanelsSource, /hydrateProgrammerFromPassVault\(/);
  assert.match(refreshPanelsSource, /buildPassVaultRuntimeServicesSnapshot\(vaultRecord\)/);
  assert.match(refreshPanelsSource, /allowTemporaryPageContextTab:\s*false/);
  assert.doesNotMatch(refreshPanelsSource, /withAdobeConsolePageContextTarget\(/);
  assert.match(refreshPanelsSource, /const cmServicePromise = skipCmBootstrap/);
  assert.match(refreshPanelsSource, /const cmMvpdServicePromise =/);
  assert.match(refreshPanelsSource, /const cmHydrationPromise = Promise\.allSettled\(\[cmServicePromise,\s*cmMvpdServicePromise\]\)/);
  assert.match(refreshPanelsSource, /const registeredApplications = buildPassVaultHydrationRegisteredApplications\(applicationsData\);/);
  assert.match(refreshPanelsSource, /buildPassVaultServiceHydrationEntries\(\{/);
  assert.match(refreshPanelsSource, /const provisionalRuntimeReady = isProgrammerRuntimeServicesReady\(programmerId,\s*provisionalServices\);/);
  assert.match(refreshPanelsSource, /setProgrammerWorkspaceHydrationReady\(programmerId,\s*provisionalRuntimeReady\);/);
  assert.match(refreshPanelsSource, /renderPremiumServices\(provisionalServices,\s*programmer,\s*\{\s*controllerReason\s*\}\);/);
  assert.match(refreshPanelsSource, /let resolvedServices = await premiumHydrationPromise;/);
  assert.match(refreshPanelsSource, /primeProgrammerServiceHydration\(programmer,\s*provisionalServices,\s*\{/);
  assert.match(refreshPanelsSource, /renderOnReady:\s*false/);
  assert.match(refreshPanelsSource, /const runtimeReady = isProgrammerRuntimeServicesReady\(programmerId,\s*finalServices\);/);
  assert.match(refreshPanelsSource, /const uiReady = shouldRenderPremiumServicesUi\(programmerId,\s*finalServices\);/);
  assert.match(ensureApplicationsSource, /state\.programmerApplicationsLoadPromiseByProgrammerId/);
  assert.match(selectPreferredCmRuntimeServiceSource, /resolvedVisible && !currentVisible/);
  assert.match(selectPreferredCmRuntimeServiceSource, /currentRetry && !resolvedRetry/);
});

test("programmer application hydration uses direct applications queries and normalizes results without vault-first fallbacks", () => {
  const popupSource = fs.readFileSync(path.join(ROOT, "popup.js"), "utf8");
  const fetchRegisteredApplicationsSource = extractFunctionSource(popupSource, "fetchProgrammerRegisteredApplications");
  const fetchApplicationsSource = extractFunctionSource(popupSource, "fetchApplicationsForProgrammer");
  const ensureApplicationsSource = extractFunctionSource(popupSource, "ensureSelectedProgrammerApplicationsLoaded");
  const detectionScopesSource = extractFunctionSource(popupSource, "getDetectionScopesFromApplication");
  const normalizeRuntimeRecordSource = extractFunctionSource(popupSource, "normalizeRegisteredApplicationRuntimeRecord");

  assert.match(fetchRegisteredApplicationsSource, /Registered Applications request is missing console context\./);
  assert.match(fetchRegisteredApplicationsSource, /configurationVersion <= 0/);
  assert.match(fetchRegisteredApplicationsSource, /fetchAdobeConsoleJsonWithLoginButtonFallback\(urlCandidates,\s*"Applications load"/);
  assert.match(fetchRegisteredApplicationsSource, /appendAdobeConsoleConfigurationVersion\(/);
  assert.match(fetchRegisteredApplicationsSource, /rest\/api\/applications\?programmer=/);
  assert.match(fetchRegisteredApplicationsSource, /normalizeApplicationsResponse\(payload\?\.parsed \|\| payload\)/);
  assert.match(fetchApplicationsSource, /fetchProgrammerRegisteredApplications\(currentSession,\s*programmerId,\s*options\)/);
  assert.match(fetchApplicationsSource, /const cachedApplicationsAreLive =/);
  assert.match(fetchApplicationsSource, /!isPassVaultBackedValue\(cachedApplications\)/);
  assert.match(fetchApplicationsSource, /Array\.isArray\(result\?\.applications\) \? result\.applications : \[\]/);
  assert.match(fetchApplicationsSource, /normalizeRegisteredApplicationRuntimeRecord\(\{/);
  assert.match(fetchApplicationsSource, /__underparFetchOrder: index/);
  assert.match(fetchApplicationsSource, /setCurrentProgrammerApplicationsSnapshot\(programmerId,\s*byGuid\)/);
  assert.match(ensureApplicationsSource, /fetchApplicationsForProgrammer\(programmerId,\s*options\)/);
  assert.match(ensureApplicationsSource, /setCurrentProgrammerApplicationsSnapshot\(programmerId,\s*normalizedApplications\)/);
  assert.match(ensureApplicationsSource, /state\.programmerApplicationsLoadPromiseByProgrammerId\.set\(programmerId,\s*loadPromise\)/);
  assert.match(detectionScopesSource, /appData\?\.scopes/);
  assert.doesNotMatch(detectionScopesSource, /appData\?\.scope(?!s)/);
  assert.doesNotMatch(detectionScopesSource, /appData\?\.scopeSet/);
  assert.doesNotMatch(detectionScopesSource, /appData\?\.scopeList/);
  assert.doesNotMatch(detectionScopesSource, /appData\?\.permissions/);
  assert.doesNotMatch(detectionScopesSource, /return getExplicitScopesFromApplication\(appData\);/);
  assert.match(normalizeRuntimeRecordSource, /const appData = \{/);
  assert.match(normalizeRuntimeRecordSource, /const rawScopes = \(/);
  assert.match(normalizeRuntimeRecordSource, /buildRegisteredApplicationScopeLabels\(rawScopes\)/);
  assert.doesNotMatch(normalizeRuntimeRecordSource, /getScopesFromApplication\(appData\)/);
  assert.match(normalizeRuntimeRecordSource, /extractSoftwareStatementFromAppData\(appData\)/);
  assert.doesNotMatch(fetchApplicationsSource, /fetchAdobeConsoleJsonWithLoginButtonFallback\(urlCandidates,\s*"Applications load"/);
  assert.doesNotMatch(fetchApplicationsSource, /buildRegisteredApplicationBulkRetrieveRequest/);
  assert.doesNotMatch(fetchApplicationsSource, /getPassVaultMediaCompanyRecord\(programmerId\)/);
  assert.doesNotMatch(fetchApplicationsSource, /premium-applications-vault-fallback/);
  assert.doesNotMatch(fetchApplicationsSource, /premium-applications-empty-fallback/);
});

test("environment switch only reactivates the retained explicit session and never silent-auths Adobe", () => {
  const popupSource = fs.readFileSync(path.join(ROOT, "popup.js"), "utf8");
  const environmentSwitchSource = extractFunctionSource(popupSource, "switchAdobePassEnvironmentInPlace");

  assert.match(environmentSwitchSource, /activateSession\(retainedLoginData,\s*"environment-switch",\s*\{/);
  assert.doesNotMatch(environmentSwitchSource, /attemptSilentBootstrapLogin\(/);
  assert.doesNotMatch(environmentSwitchSource, /activationSource = "silent"/);
  assert.match(environmentSwitchSource, /allowTemporaryPageContextTab:\s*true/);
  assert.match(
    environmentSwitchSource,
    /const shouldRestoreSelection =[\s\S]*options\?\.restoreSelection !== false[\s\S]*state\.sessionReady === true[\s\S]*Boolean\(state\.loginData\)[\s\S]*state\.restricted !== true;/
  );
  assert.match(environmentSwitchSource, /if \(shouldRestoreSelection && hasProgrammerSelectionSnapshot\(selectionSnapshot\)\)/);
});

test("environment-switch selection restore preserves current globals by default and explicit context-driving flows can bypass it", () => {
  const popupSource = fs.readFileSync(path.join(ROOT, "popup.js"), "utf8");
  const quickSetSource = extractFunctionSource(popupSource, "applyDegradationQuickSetPreset");
  const storageListenerSource = extractFunctionSource(popupSource, "registerAdobePassEnvironmentStorageListener");
  const esmDeeplinkSource = extractFunctionSource(popupSource, "consumePendingUnderparEsmDeeplink");
  const degradationDeeplinkSource = extractFunctionSource(popupSource, "activateDegradationWorkspaceDeeplinkContext");
  const devtoolsRehydrateSource = extractFunctionSource(popupSource, "rehydratePassVaultMediaCompanyFromDevtools");

  assert.match(quickSetSource, /restoreSelection:\s*true/);
  assert.match(storageListenerSource, /restoreSelection:\s*true/);
  assert.match(esmDeeplinkSource, /restoreSelection:\s*false/);
  assert.match(degradationDeeplinkSource, /restoreSelection:\s*false/);
  assert.match(devtoolsRehydrateSource, /restoreSelection:\s*false/);
});

test("PassVault storage changes re-seed runtime without force-overwriting active service snapshots", () => {
  const popupSource = fs.readFileSync(path.join(ROOT, "popup.js"), "utf8");
  const storageListenerSource = extractFunctionSource(popupSource, "registerPassVaultStorageListener");

  assert.match(storageListenerSource, /seedCurrentProgrammersFromPassVault/);
  assert.match(storageListenerSource, /forceOverwrite: false/);
});

test("media-company selection and vault rehydrate share the same programmer hydration entrypoint", () => {
  const popupSource = fs.readFileSync(path.join(ROOT, "popup.js"), "utf8");
  const hydrateSelectionSource = extractFunctionSource(popupSource, "hydrateProgrammerSelection");
  const selectProgrammerSource = extractFunctionSource(popupSource, "selectProgrammerForController");
  const scheduleSelectionSource = extractFunctionSource(popupSource, "scheduleMediaCompanySelectionHydration");
  const flushSelectionSource = extractFunctionSource(popupSource, "flushPendingMediaCompanySelectionHydration");
  const optionHydrationSource = extractFunctionSource(popupSource, "applyMediaCompanyOptionHydrationState");
  const premiumDetectionSource = extractFunctionSource(popupSource, "findPremiumServiceApplications");
  const refreshPanelsSource = extractFunctionSource(popupSource, "refreshProgrammerPanels");
  const applySnapshotSource = extractFunctionSource(popupSource, "applyGlobalSelectionSnapshot");
  const devtoolsRehydrateSource = extractFunctionSource(popupSource, "rehydratePassVaultMediaCompanyFromDevtools");
  const mediaCompanyChangeBlock = popupSource.match(
    /els\.mediaCompanySelect\.addEventListener\("change",[\s\S]*?scheduleMediaCompanySelectionHydration\(controllerReason\);[\s\S]*?\}\);/
  );

  assert.match(hydrateSelectionSource, /selectProgrammerForController\(programmer,\s*controllerReason\)/);
  assert.match(scheduleSelectionSource, /const delayMs = isMediaCompanySelectInteracting\(\) \? MEDIA_COMPANY_SELECTION_DEBOUNCE_MS : 0;/);
  assert.match(scheduleSelectionSource, /flushPendingMediaCompanySelectionHydration\(\);/);
  assert.match(flushSelectionSource, /void hydrateProgrammerSelection\(selectedProgrammer,\s*\{/);
  assert.match(optionHydrationSource, /if \(options\?\.allowDefer !== false && isMediaCompanySelectInteracting\(\)\) \{/);
  assert.match(
    popupSource,
    /els\.mediaCompanySelect\.addEventListener\("blur",[\s\S]*?flushPendingMediaCompanySelectionHydration\(\);[\s\S]*?flushPendingMediaCompanyOptionHydrationState\(\);[\s\S]*?\}\);/
  );
  assert.match(
    popupSource,
    /els\.mediaCompanySelect\.addEventListener\("keydown",[\s\S]*?event\.key !== "Enter"[\s\S]*?flushPendingMediaCompanySelectionHydration\(\);[\s\S]*?flushPendingMediaCompanyOptionHydrationState\(\);[\s\S]*?\}\);/
  );
  assert.match(selectProgrammerSource, /populateRequestorSelect\(\);/);
  assert.doesNotMatch(selectProgrammerSource, /populateMvpdSelectForRequestor\(/);
  assert.doesNotMatch(selectProgrammerSource, /getFirstSelectableOptionValue\(els\.requestorSelect\)/);
  assert.match(hydrateSelectionSource, /const retainedConsoleTabId = Number\(options\?\.preferredTabId \|\| 0\);/);
  assert.match(hydrateSelectionSource, /const programmerApplicationsPromise = selectedProgrammer\?\.programmerId/);
  assert.match(hydrateSelectionSource, /ensureSelectedProgrammerApplicationsLoaded\(selectedProgrammer,\s*\{/);
  assert.match(hydrateSelectionSource, /await refreshProgrammerPanels\(\{/);
  assert.match(hydrateSelectionSource, /programmerApplicationsPromise,/);
  assert.doesNotMatch(refreshPanelsSource, /const selectedRequestorId = String\(state\.selectedRequestorId \|\| ""\)\.trim\(\);/);
  assert.doesNotMatch(refreshPanelsSource, /requestorId:\s*selectedRequestorId/);
  assert.doesNotMatch(premiumDetectionSource, /selectPreferredEsmAppForRequestor\(/);
  assert.doesNotMatch(premiumDetectionSource, /selectPreferredRestV2AppForRequestor\(/);
  assert.match(premiumDetectionSource, /services\.esm = services\.esmApps\[0\] \|\| null;/);
  assert.match(premiumDetectionSource, /services\.restV2 = services\.restV2Apps\[0\] \|\| null;/);
  assert.doesNotMatch(applySnapshotSource, /autoSelectFirstRequestor/);
  assert.doesNotMatch(applySnapshotSource, /fallbackRequestorId/);
  assert.match(refreshPanelsSource, /options\.programmerApplicationsPromise && typeof options\.programmerApplicationsPromise\.then === "function"/);
  assert.match(devtoolsRehydrateSource, /await hydrateProgrammerSelection\(programmer,\s*\{[\s\S]*forcePremiumRefresh:\s*true,/);
  assert.doesNotMatch(devtoolsRehydrateSource, /clearSelectedProgrammerUiForVaultRehydrate\(/);
  assert.doesNotMatch(devtoolsRehydrateSource, /renderPremiumServicesLoading\(/);
  assert.ok(mediaCompanyChangeBlock);
});

test("requestor change waits for programmer refresh before loading MVPDs", () => {
  const popupSource = fs.readFileSync(path.join(ROOT, "popup.js"), "utf8");
  const requestorChangeBlock = popupSource.match(
    /els\.requestorSelect\.addEventListener\("change",[\s\S]*?await refreshProgrammerPanels\(\{[\s\S]*controllerReason:\s*"requestor-change"[\s\S]*\}\);[\s\S]*?await populateMvpdSelectForRequestor\(state\.selectedRequestorId\);[\s\S]*?\}\);/
  );

  assert.ok(requestorChangeBlock, "requestor change handler should await programmer refresh before MVPD load");
});

test("active auth and bootstrap flows no longer fall back to cookie-session activation", () => {
  const popupSource = fs.readFileSync(path.join(ROOT, "popup.js"), "utf8");
  const signInSource = extractFunctionSource(popupSource, "signInInteractive");
  const refreshSource = extractFunctionSource(popupSource, "refreshSessionManual");
  const restrictedSwitchSource = extractFunctionSource(popupSource, "onRestrictedOrgSwitch");
  const bootstrapSource = extractFunctionSource(popupSource, "bootstrapSession");

  assert.equal(/tryActivateCookieSession/.test(signInSource), false);
  assert.equal(/tryActivateCookieSession/.test(refreshSource), false);
  assert.equal(/tryActivateCookieSession/.test(restrictedSwitchSource), false);
  assert.equal(/tryActivateCookieSession/.test(bootstrapSource), false);
});

test("legacy cookie-session helper auth paths are no longer shipped", () => {
  const popupSource = fs.readFileSync(path.join(ROOT, "popup.js"), "utf8");

  assert.doesNotMatch(popupSource, /function tryActivateCookieSession/);
  assert.doesNotMatch(popupSource, /function hydrateCookieSessionWithProfile/);
  assert.doesNotMatch(popupSource, /createCookieSessionLoginData/);
  assert.doesNotMatch(popupSource, /allowCookieProfile/);
  assert.doesNotMatch(popupSource, /function createSessionSeedLoginData/);
  assert.match(popupSource, /function createCmBootstrapSeedLoginData/);
});

test("IMS profile hydration uses token-backed profile and userinfo only", () => {
  const popupSource = fs.readFileSync(path.join(ROOT, "popup.js"), "utf8");
  const fetchProfileSource = extractFunctionSource(popupSource, "fetchImsSessionProfile");

  assert.equal(/ims\/check\/v6\/status/.test(fetchProfileSource), false);
  assert.equal(/ims\/check\/v5\/status/.test(fetchProfileSource), false);
  assert.equal(/ims\/check\/status/.test(fetchProfileSource), false);
  assert.match(fetchProfileSource, /ims\/userinfo\/v2/);
  assert.match(fetchProfileSource, /return null;/);
});

test("session monitor is disabled so UnderPAR never auto-refreshes Adobe auth", () => {
  const popupSource = fs.readFileSync(path.join(ROOT, "popup.js"), "utf8");
  const shouldRunSource = extractFunctionSource(popupSource, "shouldRunExperienceCloudSessionMonitor");
  const scheduleRefreshSource = extractFunctionSource(popupSource, "scheduleNoTouchRefresh");

  assert.match(shouldRunSource, /return false;/);
  assert.doesNotMatch(scheduleRefreshSource, /setTimeout\(/);
  assert.doesNotMatch(scheduleRefreshSource, /refreshSessionNoTouch\(/);
  assert.doesNotMatch(popupSource, /function attemptSessionAutoBootstrap/);
});

test("console configuration version is sourced dynamically from the direct console context path", () => {
  const popupSource = fs.readFileSync(path.join(ROOT, "popup.js"), "utf8");
  const buildConsoleContextSource = extractFunctionSource(popupSource, "buildConsoleContext");
  const fetchProgrammersSource = extractFunctionSource(popupSource, "fetchProgrammersFromApi");
  const configExtractorSource = extractFunctionSource(popupSource, "mvpdWorkspaceExtractConfigurationVersion");
  const consoleHeaderSource = extractFunctionSource(popupSource, "getAdobeConsoleRequestHeaders");
  const fetchConsoleSource = extractFunctionSource(popupSource, "fetchAdobeConsoleJsonWithAuthVariants");
  const loginButtonFallbackSource = extractFunctionSource(popupSource, "fetchAdobeConsoleJsonWithLoginButtonFallback");
  const shellPageContextSource = extractFunctionSource(popupSource, "fetchAdobeConsoleJsonWithShellPageContextVariants");
  const pageContextFetchSource = extractFunctionSource(popupSource, "fetchAdobeConsoleJsonViaShellPageContext");

  assert.equal(/configurationVersion=3522/.test(popupSource), false);
  assert.match(popupSource, /function appendAdobeConsoleConfigurationVersion/);
  assert.match(popupSource, /consoleBootstrapState/);
  assert.doesNotMatch(popupSource, /function loadProgrammersData\(/);
  assert.doesNotMatch(popupSource, /function fetchAdobeConsoleBootstrapState\(/);
  assert.doesNotMatch(popupSource, /function ensureConsoleBootstrapState\(/);
  assert.doesNotMatch(popupSource, /function buildProgrammerEntitiesFromConsoleBootstrap\(/);
  assert.match(configExtractorSource, /payload\.configurationVersion/);
  assert.match(configExtractorSource, /payload\.configurationInfo/);
  assert.doesNotMatch(configExtractorSource, /for \(const nestedValue of Object\.values\(payload\)\)/);
  assert.match(consoleHeaderSource, /const csrfToken = String\(state\?\.consoleCsrfToken \|\| ""\)\.trim\(\) \|\| "NO-TOKEN";/);
  assert.match(consoleHeaderSource, /"AP-Request-Id": generateRequestId\(\)/);
  assert.match(consoleHeaderSource, /headers\.Authorization = `bearer \$\{accessToken\}`;/);
  assert.doesNotMatch(consoleHeaderSource, /Origin:/);
  assert.doesNotMatch(consoleHeaderSource, /Referer:/);
  assert.match(loginButtonFallbackSource, /fetchAdobeConsoleJsonWithAuthVariants/);
  assert.match(loginButtonFallbackSource, /fetchAdobeConsoleJsonWithShellPageContextVariants/);
  assert.doesNotMatch(loginButtonFallbackSource, /preferShellAccessToken/);
  assert.doesNotMatch(loginButtonFallbackSource, /allowTemporaryPageContextTab/);
  assert.doesNotMatch(shellPageContextSource, /allowTemporaryPageContextTab/);
  assert.doesNotMatch(pageContextFetchSource, /allowTemporaryTab/);
  assert.doesNotMatch(buildConsoleContextSource, /allowTemporaryPageContextTab/);
  assert.match(buildConsoleContextSource, /const preferredTabId = Number\(options\?\.preferredTabId \|\| 0\);/);
  assert.match(buildConsoleContextSource, /const pageContextTargetRef = \{ target: null \};/);
  assert.match(buildConsoleContextSource, /fetchAdobeConsoleJsonWithLoginButtonFallback/);
  assert.match(buildConsoleContextSource, /rest\/api\/user\/extendedProfile/);
  assert.match(buildConsoleContextSource, /rest\/api\/config\/latestActivatedConsoleConfigurationVersion/);
  assert.match(buildConsoleContextSource, /const configurationVersionMissingError = configurationVersion > 0/);
  assert.match(buildConsoleContextSource, /configurationVersion > 0\s*\?\s*await Promise\.all/);
  assert.match(buildConsoleContextSource, /fetchProgrammersFromApi\(\{/);
  assert.match(buildConsoleContextSource, /fetchConsoleChannelsFromApi\(\{/);
  assert.match(buildConsoleContextSource, /const programmers = programmersResult\.ok \? programmersResult\.value : \[\];/);
  assert.doesNotMatch(buildConsoleContextSource, /fallbackProgrammers/);
  assert.doesNotMatch(buildConsoleContextSource, /accessibleRootEntities/);
  assert.match(fetchConsoleSource, /getAdobeConsoleRequestHeaders\(activeAccessToken\)/);
  assert.doesNotMatch(fetchConsoleSource, /const getHeaderVariants = \(\) =>/);
  assert.doesNotMatch(fetchConsoleSource, /getAdobeConsoleRequestHeaders\(""\)/);
  assert.doesNotMatch(fetchConsoleSource, /refreshSessionNoTouch\(\)/);
  assert.doesNotMatch(fetchProgrammersSource, /state\.loginData\?\.experienceCloudAccessToken/);
  assert.doesNotMatch(fetchProgrammersSource, /getPreferredExperienceCloudConsoleAccessTokenCandidate\(\)/);
  assert.match(fetchProgrammersSource, /getPreferredPrimaryImsAccessTokenCandidate\(\)/);
  assert.match(fetchProgrammersSource, /fetchAdobeConsoleJsonWithLoginButtonFallback\(\[endpoint\],\s*"Media company load"/);
  assert.doesNotMatch(fetchProgrammersSource, /fetchAdobeConsoleJsonViaShellPageContext/);
  assert.doesNotMatch(fetchProgrammersSource, /allowTemporaryPageContextTab/);
  assert.doesNotMatch(fetchProgrammersSource, /preferShellAccessToken/);
  assert.doesNotMatch(popupSource, /getRetainedAuthPopupBootstrapTabId/);
});

test("console bootstrap carries the rolling CSRF token through direct UnderPAR console requests like LoginButton", () => {
  const popupSource = fs.readFileSync(path.join(ROOT, "popup.js"), "utf8");
  const buildConsoleContextSource = extractFunctionSource(popupSource, "buildConsoleContext");
  const fetchConsoleSource = extractFunctionSource(popupSource, "fetchAdobeConsoleJsonWithAuthVariants");

  assert.match(
    buildConsoleContextSource,
    /let csrfToken = firstNonEmptyString\(\[previousConsole\?\.csrfToken,\s*state\.consoleCsrfToken,\s*"NO-TOKEN"\]\);/
  );
  assert.match(
    buildConsoleContextSource,
    /"X-CSRF-Token": firstNonEmptyString\(\[csrfToken,\s*state\.consoleCsrfToken,\s*"NO-TOKEN"\]\),/
  );
  assert.match(buildConsoleContextSource, /const nextCsrfToken = String\(/);
  assert.match(buildConsoleContextSource, /state\.consoleCsrfToken = nextCsrfToken;/);
  assert.match(fetchConsoleSource, /headers:\s*toDebugHeadersObject\(response\.headers \|\| new Headers\(\)\),/);
});

test("esm health tenant token requests stay on the console rest api base", () => {
  const popupSource = fs.readFileSync(path.join(ROOT, "popup.js"), "utf8");
  const restApiUrlSource = extractFunctionSource(popupSource, "buildAdobeConsoleRestApiUrl");
  const tokenSource = extractFunctionSource(popupSource, "fetchEsmHealthTenantDataToken");

  assert.match(restApiUrlSource, /return `\$\{normalizedConsoleBase\}\/rest\/api\/\$\{normalizedPath\}`;/);
  assert.match(tokenSource, /const tokenUrl = buildAdobeConsoleRestApiUrl\(ESM_HEALTH_TENANT_TOKEN_PATH,\s*consoleBase\);/);
  assert.doesNotMatch(tokenSource, /consoleBase\.replace\(\/\\\/\+\$\/, ""\)\}\$\{ESM_HEALTH_TENANT_TOKEN_PATH\}/);
});

test("health splunk prefers the live dashboard deeplink and normalizes dashboard queries for Splunk job APIs", () => {
  const popupSource = fs.readFileSync(path.join(ROOT, "popup.js"), "utf8");
  const landingSource = extractFunctionSource(popupSource, "getSplunkSearchLandingUrl");
  const normalizeJobSource = extractFunctionSource(popupSource, "normalizeSplunkJobSearchQuery");
  const healthQueryContextSource = extractFunctionSource(popupSource, "buildHealthSplunkQueryContext");
  const tableSearchSource = extractFunctionSource(popupSource, "runHealthSplunkTableSearch");
  const restSearchSource = extractFunctionSource(popupSource, "runSplunkSearchForQueryContext");
  const dashboardDefinitionSource = extractFunctionSource(popupSource, "parseHealthSplunkTableDefinitionsFromDashboardDefinition");

  assert.match(landingSource, /const dashboardUrl = String\(queryContext\?\.dashboardUrl \|\| ""\)\.trim\(\);/);
  assert.match(landingSource, /if \(dashboardUrl\) {\s*return dashboardUrl;\s*}/);
  assert.match(healthQueryContextSource, /new URL\(`\$\{SPLUNK_BASE_URL\}\/en-US\/app\/app_adobepass\/\$\{HEALTH_SPLUNK_DASHBOARD_VIEW_NAME\}`\)/);
  assert.match(healthQueryContextSource, /url\.searchParams\.set\("form\.serviceProvider", requestorId\);/);
  assert.match(healthQueryContextSource, /url\.searchParams\.set\("form\.environment", environmentIndex\);/);
  assert.match(normalizeJobSource, /return `search \$\{normalizedSearch\}`;/);
  assert.match(tableSearchSource, /search: normalizeSplunkJobSearchQuery\(compiledTable\.query\),/);
  assert.match(restSearchSource, /search: normalizeSplunkJobSearchQuery\(queryContext\.search\),/);
  assert.match(dashboardDefinitionSource, /const dataSourceRef = String\(dataSource\?\.options\?\.ref \|\| ""\)\.trim\(\);/);
  assert.match(dashboardDefinitionSource, /const queryTemplate = firstNonEmptyString\(\[dataSource\?\.options\?\.query,\s*matchedFallback\?\.queryTemplate\]\);/);
});

test("programmer endpoint access_denied responses stay on the limited console path", () => {
  const popupSource = fs.readFileSync(path.join(ROOT, "popup.js"), "utf8");
  const helperSource = extractFunctionSource(popupSource, "isAdobeConsoleAccessDeniedResponse");
  const fetchProgrammersSource = extractFunctionSource(popupSource, "fetchProgrammersFromApi");

  assert.match(helperSource, /normalizedStatus !== 401 && normalizedStatus !== 403/);
  assert.match(helperSource, /normalizedError === "access_denied" \|\| normalizedError === "unauthorized"/);
  assert.match(helperSource, /normalizedMessage\.includes\("access is denied"\)/);
  assert.match(fetchProgrammersSource, /lastError = resolvedError;/);
  assert.doesNotMatch(fetchProgrammersSource, /createProgrammersError\(resolvedError\.message,\s*"PROGRAMMERS_ACCESS_DENIED"\)/);
  assert.doesNotMatch(fetchProgrammersSource, /PROGRAMMERS_ENDPOINT_FAILED/);
});

test("programmer access stays limited and no longer fabricates bootstrap fallback media companies or vault reuse", () => {
  const popupSource = fs.readFileSync(path.join(ROOT, "popup.js"), "utf8");
  const buildConsoleContextSource = extractFunctionSource(popupSource, "buildConsoleContext");

  assert.doesNotMatch(popupSource, /function loadProgrammersData\(/);
  assert.doesNotMatch(buildConsoleContextSource, /buildProgrammerEntitiesFromPassVault\(/);
  assert.doesNotMatch(buildConsoleContextSource, /phase: "vault-fallback"/);
  assert.doesNotMatch(buildConsoleContextSource, /Using vaulted media companies/);
  assert.doesNotMatch(popupSource, /buildProgrammerEntitiesFromConsoleBootstrap\(/);
  assert.match(buildConsoleContextSource, /const programmers = programmersResult\.ok \? programmersResult\.value : \[\];/);
  assert.doesNotMatch(buildConsoleContextSource, /fallbackProgrammers/);
  assert.doesNotMatch(buildConsoleContextSource, /accessibleRootEntities/);
});

test("legacy programmer bootstrap fallback helpers are removed from source", () => {
  const popupSource = fs.readFileSync(path.join(ROOT, "popup.js"), "utf8");

  assert.doesNotMatch(popupSource, /function buildProgrammerEntitiesFromConsoleBootstrap\(/);
  assert.doesNotMatch(popupSource, /function fetchAdobeConsoleBootstrapState\(/);
  assert.doesNotMatch(popupSource, /function ensureConsoleBootstrapState\(/);
  assert.doesNotMatch(popupSource, /function withAdobeConsolePageContextTarget\(/);
  assert.doesNotMatch(popupSource, /function loadProgrammersData\(/);
});

test("programmer discovery stays on deterministic entity endpoints and console role extraction handles authority objects", () => {
  const popupSource = fs.readFileSync(path.join(ROOT, "popup.js"), "utf8");
  const endpointBuilderSource = extractFunctionSource(popupSource, "buildProgrammerEndpointsForConsoleBase");
  const restApiHelperSource = extractFunctionSource(popupSource, "buildAdobeConsoleRestApiUrl");
  const roleExtractorSource = extractFunctionSource(popupSource, "extractAdobeConsoleGrantedAuthorities");
  const roleValueSource = extractFunctionSource(popupSource, "extractAdobeConsoleGrantedAuthorityValue");

  assert.match(restApiHelperSource, /return `\$\{normalizedConsoleBase\}\/rest\/api\/\$\{normalizedPath\}`;/);
  assert.match(endpointBuilderSource, /buildAdobeConsoleRestApiUrl\("entity\/Programmer"/);
  assert.doesNotMatch(endpointBuilderSource, /rest\/api\/programmers/);
  assert.doesNotMatch(endpointBuilderSource, /rest\/api\/v1\/programmers/);
  assert.match(roleValueSource, /entry\.authority/);
  assert.match(roleValueSource, /entry\.role/);
  assert.match(roleExtractorSource, /extractAdobeConsoleGrantedAuthorityValue\(entry\)/);
});

test("programmer discovery keeps configurationVersion=0 on Adobe console entity requests", () => {
  const popupSource = fs.readFileSync(path.join(ROOT, "popup.js"), "utf8");
  const appendConfigVersionSource = extractFunctionSource(popupSource, "appendAdobeConsoleConfigurationVersion");
  const {
    mvpdWorkspaceExtractConfigurationVersion,
    getKnownAdobeConsoleConfigurationVersion,
    appendAdobeConsoleConfigurationVersion,
    buildProgrammerEndpointsForConsoleBase,
    setBootstrapState,
  } = loadPopupConsoleConfigUrlHelper();

  assert.doesNotMatch(appendConfigVersionSource, /normalizedVersion <= 0/);
  assert.equal(
    mvpdWorkspaceExtractConfigurationVersion({
      configurationVersion: 0,
      fetchedAt: 1773987269048,
      extendedProfile: { userId: "123" },
    }, 0),
    0
  );
  setBootstrapState({
    configurationVersion: 0,
    fetchedAt: 1773987269048,
    extendedProfile: { userId: "123" },
  });
  assert.equal(getKnownAdobeConsoleConfigurationVersion(), 0);
  assert.equal(
    appendAdobeConsoleConfigurationVersion("https://console.auth.adobe.com/rest/api/entity/Programmer", 0),
    "https://console.auth.adobe.com/rest/api/entity/Programmer?configurationVersion=0"
  );
  assert.deepEqual([...buildProgrammerEndpointsForConsoleBase("https://console.auth.adobe.com")], [
    "https://console.auth.adobe.com/rest/api/entity/Programmer?configurationVersion=0",
  ]);
});

test("programmer discovery keeps fetch header variants as plain header objects", () => {
  const popupSource = fs.readFileSync(path.join(ROOT, "popup.js"), "utf8");
  const fetchConsoleSource = extractFunctionSource(popupSource, "fetchAdobeConsoleJsonWithAuthVariants");

  assert.match(fetchConsoleSource, /getAdobeConsoleRequestHeaders\(activeAccessToken\)/);
  assert.doesNotMatch(fetchConsoleSource, /const getHeaderVariants = \(\) =>/);
  assert.doesNotMatch(fetchConsoleSource, /getAdobeConsoleRequestHeaders\(""\)/);
  assert.doesNotMatch(fetchConsoleSource, /refreshSessionNoTouch\(\)/);
});

test("experience cloud auth redirect detection accepts plain-object headers from shell page context", () => {
  const { responseLooksLikeExperienceCloudSignIn } = loadPopupExperienceCloudAuthResponseHelper();

  assert.equal(
    responseLooksLikeExperienceCloudSignIn(
      {
        status: 403,
        url: "https://console.auth.adobe.com/rest/api/entity/Programmer?configurationVersion=0",
        headers: {
          "content-type": "application/json",
          "www-authenticate": 'Bearer realm="AdobeID login_required"',
        },
      },
      '{"error":"access_denied","error_description":"Access is denied"}'
    ),
    true
  );
});

test("programmer load stays on direct console requests while allowing LoginButton-style fallback targets", () => {
  const popupSource = fs.readFileSync(path.join(ROOT, "popup.js"), "utf8");
  const buildConsoleContextSource = extractFunctionSource(popupSource, "buildConsoleContext");
  const fetchProgrammersSource = extractFunctionSource(popupSource, "fetchProgrammersFromApi");
  const fetchChannelsSource = extractFunctionSource(popupSource, "fetchConsoleChannelsFromApi");
  const fetchRegisteredApplicationsSource = extractFunctionSource(popupSource, "fetchProgrammerRegisteredApplications");
  const fetchApplicationDetailsSource = extractFunctionSource(popupSource, "fetchApplicationDetailsByGuid");
  const fetchApplicationsSource = extractFunctionSource(popupSource, "fetchApplicationsForProgrammer");

  assert.doesNotMatch(popupSource, /function withAdobeConsolePageContextTarget\(/);
  assert.doesNotMatch(buildConsoleContextSource, /fetchAdobeConsoleJsonViaShellPageContext\(/);
  assert.doesNotMatch(buildConsoleContextSource, /allowTemporaryPageContextTab/);
  assert.doesNotMatch(fetchProgrammersSource, /allowTemporaryPageContextTab/);
  assert.doesNotMatch(fetchChannelsSource, /allowTemporaryPageContextTab/);
  assert.match(fetchRegisteredApplicationsSource, /fetchAdobeConsoleJsonWithLoginButtonFallback/);
  assert.match(fetchApplicationDetailsSource, /fetchAdobeConsoleJsonWithLoginButtonFallback/);
  assert.match(fetchRegisteredApplicationsSource, /preferredTabId,/);
  assert.match(fetchApplicationsSource, /fetchProgrammerRegisteredApplications\(currentSession,\s*programmerId,\s*options\)/);
  assert.doesNotMatch(fetchProgrammersSource, /fetchAdobeConsoleJsonWithShellPageContextVariants/);
  assert.doesNotMatch(fetchChannelsSource, /fetchAdobeConsoleJsonWithShellPageContextVariants/);
  assert.doesNotMatch(fetchRegisteredApplicationsSource, /fetchAdobeConsoleJsonWithShellPageContextVariants/);
  assert.doesNotMatch(fetchApplicationDetailsSource, /fetchAdobeConsoleJsonWithShellPageContextVariants/);
  assert.doesNotMatch(fetchRegisteredApplicationsSource, /fetchAdobeConsoleJsonWithAuthVariants/);
  assert.doesNotMatch(fetchApplicationDetailsSource, /fetchAdobeConsoleJsonWithAuthVariants/);
  assert.doesNotMatch(fetchApplicationsSource, /buildRegisteredApplicationBulkRetrieveRequest/);
});

test("console page-context target resolution matches LoginButton behavior", () => {
  const popupSource = fs.readFileSync(path.join(ROOT, "popup.js"), "utf8");
  const cmBootstrapUrlSource = extractFunctionSource(popupSource, "getCmConsoleBootstrapUrl");
  const consoleUrlSource = extractFunctionSource(popupSource, "isAdobePassConsoleAppUrl");
  const findConsoleTabSource = extractFunctionSource(popupSource, "findExistingAdobeConsoleTab");
  const openTemporarySource = extractFunctionSource(popupSource, "openTemporaryAdobePageContextTarget");
  const resolveReusableSource = extractFunctionSource(popupSource, "resolveReusableAdobePageContextTab");
  const resolveTargetSource = extractFunctionSource(popupSource, "resolveAdobeConsolePageContextTarget");
  const resolveExperienceTargetSource = extractFunctionSource(popupSource, "resolveExperienceAdobePageContextTarget");
  const findExperienceTargetSource = extractFunctionSource(popupSource, "findExistingExperienceCloudAdobeTab");

  assert.match(cmBootstrapUrlSource, /cm-console\/cmu\/year/);
  assert.match(cmBootstrapUrlSource, /ADOBEPASS_ORG_HANDLE/);
  assert.match(consoleUrlSource, /ADOBE_PASS_CONSOLE_APP_SLUG/);
  assert.doesNotMatch(consoleUrlSource, /consoleShellUrl/);
  assert.doesNotMatch(consoleUrlSource, /consoleProgrammersUrl/);
  assert.match(findConsoleTabSource, /isAdobePassConsoleAppUrl\(url\)/);
  assert.match(findConsoleTabSource, /ADOBE_CONSOLE_RUNTIME_ORIGIN/);
  assert.match(openTemporarySource, /chrome\.tabs\?\.create/);
  assert.match(openTemporarySource, /chrome\.windows\?\.create/);
  assert.match(openTemporarySource, /waitForTabCompletion/);
  assert.match(resolveReusableSource, /isAdobePassConsoleAppUrl\(preferredUrl\)/);
  assert.doesNotMatch(resolveReusableSource, /isExperienceAdobeTabUrl\(preferredUrl\)/);
  assert.match(resolveReusableSource, /isAuthFlowUrl\(preferredUrl\)/);
  assert.match(resolveReusableSource, /waitForTabCompletion/);
  assert.doesNotMatch(popupSource, /function getAdobeConsolePageContextBootstrapUrl\(/);
  assert.match(resolveTargetSource, /tab = await findExistingAdobeConsoleTab\(\);/);
  assert.doesNotMatch(resolveTargetSource, /findExistingExperienceCloudAdobeTab\(\)/);
  assert.doesNotMatch(resolveTargetSource, /allowTemporaryTab/);
  assert.doesNotMatch(resolveTargetSource, /openTemporaryAdobePageContextTarget/);
  assert.doesNotMatch(resolveTargetSource, /requestUrl/);
  assert.match(resolveTargetSource, /temporaryTarget:\s*null/);
  assert.match(findExperienceTargetSource, /url\.includes\("\/#\/@adobepass\/cm-console\/"\)/);
  assert.match(findExperienceTargetSource, /isExperienceAdobeTabUrl\(url\)/);
  assert.match(resolveExperienceTargetSource, /openTemporaryAdobePageContextTarget/);
  assert.match(resolveExperienceTargetSource, /getCmConsoleBootstrapUrl\(\)/);
});

test("CM reports page helpers no longer open temporary Adobe tabs for direct fetches", () => {
  const popupSource = fs.readFileSync(path.join(ROOT, "popup.js"), "utf8");
  const reportsBootstrapSource = extractFunctionSource(popupSource, "requestCmConsoleBootstrapCatalogFromReportsPage");
  const reportsFetchSource = extractFunctionSource(popupSource, "fetchCmJsonViaReportsPageContext");

  assert.doesNotMatch(reportsBootstrapSource, /openTemporaryAdobePageContextTarget/);
  assert.doesNotMatch(reportsFetchSource, /openTemporaryAdobePageContextTarget/);
  assert.match(reportsFetchSource, /allowTemporaryPageContextTab:\s*false/);
});

test("media company selection uses cached live AdobePass apps or direct applications queries without selection-time vault hydration", () => {
  const popupSource = fs.readFileSync(path.join(ROOT, "popup.js"), "utf8");
  const fetchRegisteredApplicationsSource = extractFunctionSource(popupSource, "fetchProgrammerRegisteredApplications");
  const fetchApplicationsSource = extractFunctionSource(popupSource, "fetchApplicationsForProgrammer");
  const ensureApplicationsSource = extractFunctionSource(popupSource, "ensureSelectedProgrammerApplicationsLoaded");
  const primeSource = extractFunctionSource(popupSource, "primeProgrammerServiceHydration");
  const refreshPanelsSource = extractFunctionSource(popupSource, "refreshProgrammerPanels");

  assert.match(
    refreshPanelsSource,
    /const programmerApplicationsPromise =[\s\S]*options\.programmerApplicationsPromise[\s\S]*ensureSelectedProgrammerApplicationsLoaded\(programmer,/
  );
  assert.doesNotMatch(refreshPanelsSource, /hydrateProgrammerFromPassVault\(/);
  assert.match(refreshPanelsSource, /buildPassVaultRuntimeServicesSnapshot\(vaultRecord\)/);
  assert.match(refreshPanelsSource, /buildPassVaultApplicationsSnapshotFromRegisteredApplications/);
  assert.doesNotMatch(popupSource, /function ensurePremiumAppsForProgrammer\(/);
  assert.match(fetchRegisteredApplicationsSource, /appendAdobeConsoleConfigurationVersion\(/);
  assert.match(fetchApplicationsSource, /fetchProgrammerRegisteredApplications\(currentSession,\s*programmerId,\s*options\)/);
  assert.match(ensureApplicationsSource, /const cachedApplicationsAreLive =/);
  assert.match(ensureApplicationsSource, /state\.programmerApplicationsLoadPromiseByProgrammerId\.has\(programmerId\)/);
  assert.doesNotMatch(fetchApplicationsSource, /buildRegisteredApplicationBulkRetrieveRequest/);
  assert.match(primeSource, /const applicationsData =/);
  assert.match(primeSource, /queuePassVaultProgrammerCompilation\(programmer,\s*seedServices,\s*\{/);
  assert.match(refreshPanelsSource, /ensureSelectedProgrammerApplicationsLoaded\(programmer,\s*\{/);
  assert.match(
    refreshPanelsSource,
    /const premiumHydrationPromise = primeProgrammerServiceHydration\(programmer,\s*provisionalServices,\s*\{/
  );
  assert.match(refreshPanelsSource, /allowTemporaryPageContextTab:\s*false/);
  assert.match(
    refreshPanelsSource,
    /const retainedConsoleTabId = Number\(options\.preferredTabId \|\| 0\);/
  );
  assert.match(refreshPanelsSource, /preferredTabId:\s*retainedConsoleTabId/);
  assert.match(refreshPanelsSource, /const applicationsData = await programmerApplicationsPromise;/);
  assert.match(refreshPanelsSource, /let resolvedServices = await premiumHydrationPromise;/);
  assert.match(refreshPanelsSource, /const provisionalUiServices =/);
  assert.match(refreshPanelsSource, /const reusableServices =/);
  assert.match(
    refreshPanelsSource,
    /if \(provisionalUiServices\) \{\s*const provisionalRuntimeReady = isProgrammerRuntimeServicesReady\(programmerId,\s*provisionalUiServices\);/
  );
  assert.match(
    refreshPanelsSource,
    /if \(!provisionalUiServices\) \{\s*renderPremiumServicesLoading\(programmer,\s*\{\s*controllerReason\s*\}\);/
  );
  assert.match(refreshPanelsSource, /const suppressAccessDeniedStatus =/);
  assert.match(refreshPanelsSource, /clearStatusUnlessCmTenantsPrecheckBlocked\(\);/);
  assert.doesNotMatch(refreshPanelsSource, /withAdobeConsolePageContextTarget\(/);
  assert.doesNotMatch(refreshPanelsSource, /shouldOpenTemporaryAdobePageContextTab/);
});

test("single resolved media company is not auto-selected after programmer hydration", () => {
  const popupSource = fs.readFileSync(path.join(ROOT, "popup.js"), "utf8");
  const applyProgrammersSource = extractFunctionSource(popupSource, "applyProgrammerEntities");

  assert.doesNotMatch(applyProgrammersSource, /single-programmer-auto-select/);
  assert.doesNotMatch(applyProgrammersSource, /selectProgrammerForController\(state\.programmers\[0\]/);
});

test("restricted org labels collapse duplicate AdobePass segments", () => {
  const { buildRestrictedOrgOptionLabel } = loadPopupRestrictedOrgLabelHelper();

  assert.equal(
    buildRestrictedOrgOptionLabel({
      name: "@AdobePass | @adobepass | @adobepass",
      orgId: "@adobepass",
      userId: "",
    }),
    "@AdobePass"
  );
});

test("restricted org labels use the LoginButton name-plus-org format without user ids", () => {
  const { buildRestrictedOrgOptionLabel } = loadPopupRestrictedOrgLabelHelper();

  assert.equal(
    buildRestrictedOrgOptionLabel({
      name: "Adobe Campaign Customer Care",
      orgId: "campaigncustomercare",
      userId: "820f",
    }),
    "Adobe Campaign Customer Care | campaigncustomercare"
  );
});

test("console endpoint bootstrap initializes underparStateRef before top-level programmer endpoint construction", () => {
  const popupSource = fs.readFileSync(path.join(ROOT, "popup.js"), "utf8");
  const stateRefIndex = popupSource.indexOf("let underparStateRef = null;");
  const endpointIndex = popupSource.indexOf("let PROGRAMMER_ENDPOINTS = buildProgrammerEndpointsForConsoleBase(ADOBE_CONSOLE_BASE);");

  assert.notEqual(stateRefIndex, -1);
  assert.notEqual(endpointIndex, -1);
  assert.ok(stateRefIndex < endpointIndex, "underparStateRef must initialize before PROGRAMMER_ENDPOINTS");
});

test("DEBUG INFO and logged-out controls bind before async init and keep a safe fallback snapshot", () => {
  const popupSource = fs.readFileSync(path.join(ROOT, "popup.js"), "utf8");
  const initSource = extractFunctionSource(popupSource, "init");
  const ensurePassVaultLoadedSource = extractFunctionSource(popupSource, "ensurePassVaultLoaded");
  const resetLoggedOutSource = extractFunctionSource(popupSource, "resetWorkflowForLoggedOut");
  const renderDebugSource = extractFunctionSource(popupSource, "renderDebugConsole");
  const copyDebugSource = extractFunctionSource(popupSource, "copyDebugConsoleToClipboard");
  const statusSource = extractFunctionSource(popupSource, "setStatus");

  assert.match(popupSource, /let underparCoreInteractionHandlersBound = false;/);
  assert.match(popupSource, /function registerCoreInteractionHandlers\(\)/);
  assert.match(popupSource, /registerCoreInteractionHandlers\(\);\s*\n\s*function log\(/);
  assert.match(popupSource, /function composeUnderparDebugConsoleFallback\(/);
  assert.match(popupSource, /function getUnderparDebugConsoleSnapshot\(/);
  assert.match(popupSource, /debugStatusHistory:\s*\[\]/);
  assert.match(popupSource, /debugMarkers:\s*\{\}/);
  assert.match(popupSource, /function appendDebugStatusHistoryEntry\(/);
  assert.match(popupSource, /function setUnderparDiagnosticMarker\(/);
  assert.match(renderDebugSource, /setTextOutput\(els\.logOutput,\s*getUnderparDebugConsoleSnapshot\(\)\);/);
  assert.match(copyDebugSource, /els\.logOutput\?\.value \|\| getUnderparDebugConsoleSnapshot\(\)/);
  assert.match(statusSource, /appendDebugStatusHistoryEntry\(normalizedMessage,\s*normalizedType,\s*"status"\)/);
  assert.match(popupSource, /passVaultLoaded:\s*false,/);
  assert.match(ensurePassVaultLoadedSource, /if \(!forceReload && state\.passVault && state\.passVaultLoaded === true\) \{/);
  assert.match(ensurePassVaultLoadedSource, /state\.passVaultLoaded = loadedPersistedVault;/);
  assert.match(resetLoggedOutSource, /state\.passVaultLoaded = state\.passVaultLoaded === true && preservePassVault;/);
  assert.match(initSource, /registerCoreInteractionHandlers\(\);/);
  assert.match(initSource, /registerEventHandlers\(\);/);
  assert.match(initSource, /await settleUnderparInitStep\("Initial shell render", \(\) => render\(\)\);/);
  assert.match(initSource, /await settleUnderparInitStep\("Pass VAULT load", \(\) => ensurePassVaultLoaded\(\{ forceReload: false \}\)\);/);
});

test("post-ZIP.KEY logged-out flow stays user-driven and does not auto-bootstrap Adobe auth", () => {
  const popupSource = fs.readFileSync(path.join(ROOT, "popup.js"), "utf8");
  const initSource = extractFunctionSource(popupSource, "init");
  const registerHandlersSource = extractFunctionSource(popupSource, "registerEventHandlers");
  const vaultListenerSource = extractFunctionSource(popupSource, "registerPassVaultStorageListener");
  const importZipKeySource = extractFunctionSource(popupSource, "importZipKeyIntoVaultFromText");
  const finalizeZipKeySource = extractFunctionSource(popupSource, "finalizeSuccessfulZipKeyImport");
  const bootstrapSource = extractFunctionSource(popupSource, "bootstrapSession");

  assert.match(initSource, /await settleUnderparInitStep\("Session bootstrap", \(\) => bootstrapSession\("startup"\)\);/);
  assert.doesNotMatch(registerHandlersSource, /void bootstrapSession\("panel-visible"\);/);
  assert.doesNotMatch(registerHandlersSource, /void bootstrapSession\("window-focus"\);/);
  assert.doesNotMatch(vaultListenerSource, /bootstrapSession\("vault-storage-change"\)/);
  assert.match(importZipKeySource, /return await finalizeSuccessfulZipKeyImport\(result\);/);
  assert.match(finalizeZipKeySource, /state\.manualZipKeyImportGate = false;/);
  assert.doesNotMatch(finalizeZipKeySource, /bootstrapSession\("zip-key-import"\)/);
  assert.doesNotMatch(bootstrapSource, /attemptSilentBootstrapLogin\(\)/);
  assert.doesNotMatch(bootstrapSource, /silent-bootstrap:/);
});

test("plain sign-in paths clear hidden target-org steering before Adobe chooser opens", () => {
  const popupSource = fs.readFileSync(path.join(ROOT, "popup.js"), "utf8");
  const primarySignInSource = extractFunctionSource(popupSource, "onPrimarySignInClick");
  const signInAgainSource = extractFunctionSource(popupSource, "onRestrictedSignInAgain");
  const signInSource = extractFunctionSource(popupSource, "signInInteractive");

  assert.match(primarySignInSource, /state\.selectedTargetOrganizationKey = "";/);
  assert.match(signInAgainSource, /state\.selectedTargetOrganizationKey = "";/);
  assert.doesNotMatch(signInAgainSource, /targetOrganization/);
  assert.doesNotMatch(signInSource, /resolveTargetOrganizationForLogin\(\)/);
});

test("bootstrap stays logged out until the user explicitly signs in", () => {
  const popupSource = fs.readFileSync(path.join(ROOT, "popup.js"), "utf8");
  const bootstrapSource = extractFunctionSource(popupSource, "bootstrapSession");

  assert.doesNotMatch(bootstrapSource, /loadStoredLoginData\(/);
  assert.doesNotMatch(bootstrapSource, /activateSession\(/);
  assert.doesNotMatch(bootstrapSource, /attemptSilentBootstrapLogin\(\)/);
  assert.match(bootstrapSource, /phase: "explicit-sign-in-required"/);
});

test("interactive recovery paths force Adobe IMS to show the login chooser without hard-gating activation on helper scopes", () => {
  const popupSource = fs.readFileSync(path.join(ROOT, "popup.js"), "utf8");
  const signInSource = extractFunctionSource(popupSource, "signInInteractive");
  const switchSource = extractFunctionSource(popupSource, "onRestrictedOrgSwitch");
  const retrySource = extractFunctionSource(popupSource, "runUnderparPkceLogin");
  const signInAgainSource = extractFunctionSource(popupSource, "onRestrictedSignInAgain");
  const logoutSource = extractFunctionSource(popupSource, "runUnderparImsBrowserLogout");
  const organizationsSource = extractFunctionSource(popupSource, "fetchOrganizations");
  const activationSource = extractFunctionSource(popupSource, "activateSession");

  assert.match(
    popupSource,
    /const IMS_SCOPE =\s*"openid profile offline_access additional_info\.projectedProductContext";/
  );
  assert.match(popupSource, /const IMS_ORG_DISCOVERY_SCOPE = "read_organizations";/);
  assert.match(popupSource, /const IMS_DEFAULT_LOGOUT_ENDPOINT = `\$\{IMS_ISSUER_URL\}\/ims\/logout`;/);
  assert.match(signInSource, /prompt: normalizeUnderparImsPrompt\(loginOptions\?\.prompt \|\| "login", true\)/);
  assert.match(signInSource, /if \(loginOptions\?\.forceBrowserLogout === true\)/);
  assert.match(signInSource, /await runUnderparImsBrowserLogout\(/);
  assert.match(signInSource, /allowTemporaryPageContextTab:\s*true/);
  assert.doesNotMatch(signInSource, /releaseAuthPopupBootstrapContext\(/);
  assert.doesNotMatch(signInSource, /minimumGrantedScope/);
  assert.doesNotMatch(signInSource, /requiredActivationScope/);
  assert.doesNotMatch(signInSource, /resolveTargetOrganizationForLogin\(\)/);
  assert.doesNotMatch(signInSource, /extraParams:/);
  assert.match(switchSource, /prompt: "login"/);
  assert.match(switchSource, /allowTemporaryPageContextTab:\s*true/);
  assert.doesNotMatch(switchSource, /minimumGrantedScope/);
  assert.doesNotMatch(switchSource, /requiredActivationScope/);
  assert.doesNotMatch(switchSource, /extraParams:/);
  assert.doesNotMatch(popupSource, /function attemptAutoSwitchToAdobePass\(/);
  assert.match(signInAgainSource, /await signInInteractive\(\{[\s\S]*prompt: "login",[\s\S]*forceBrowserLogout: true,[\s\S]*\}\);/);
  assert.doesNotMatch(signInAgainSource, /targetOrganization/);
  assert.match(retrySource, /const effectiveConfiguredScope = interactive \? resolveInteractiveUnderparRequestedScope\(configuredScope\) : configuredScope;/);
  assert.match(retrySource, /const scopePlan = buildUnderparRequestedScopePlan\(effectiveConfiguredScope\);/);
  assert.match(retrySource, /"preferred-org-discovery-scope"/);
  assert.match(retrySource, /"configured-scope-fallback"/);
  assert.doesNotMatch(retrySource, /identity-scope-fallback/);
  assert.doesNotMatch(retrySource, /minimumGrantedScope/);
  assert.doesNotMatch(retrySource, /INSUFFICIENT_IMS_SCOPE/);
  assert.match(logoutSource, /buildUnderparImsLogoutUrl\(/);
  assert.match(logoutSource, /await launchUnderparImsAuthorizationFlow\(logoutUrl, interactive\);/);
  assert.match(organizationsSource, /const grantedScope = resolveGrantedUnderparImsScope\(normalizedAccessToken, "", ""\);/);
  assert.match(organizationsSource, /getMissingUnderparImsScopeTokens\(grantedScope, "read_organizations"\)/);
  assert.match(organizationsSource, /token does not have the "read_organizations" scope/);
  assert.match(organizationsSource, /const clientIdCandidates = getUnderparImsClientIdCandidates\(normalizedAccessToken\);/);
  assert.match(organizationsSource, /credentials: "include"/);
  assert.match(organizationsSource, /headers: buildImsProfileHeaders\(normalizedAccessToken, endpoint\.clientId\)/);
  assert.match(organizationsSource, /const payloadScore = flattenOrganizations\(parsed\)\.length;/);
  assert.doesNotMatch(activationSource, /requiredActivationScope/);
  assert.doesNotMatch(activationSource, /insufficient-ims-scope/);
});

test("vault purge path forces a durable start-shell reset and clears in-memory vault state", () => {
  const popupSource = fs.readFileSync(path.join(ROOT, "popup.js"), "utf8");
  const purgeSource = extractFunctionSource(popupSource, "purgePassVaultFromDevtools");
  const resetWorkflowSource = extractFunctionSource(popupSource, "resetWorkflowForLoggedOut");

  assert.match(purgeSource, /persistManualSignOutHold\(true,\s*"vault-purge"\)/);
  assert.match(purgeSource, /clearDebugFlowStorageFromChromeStorage\(\)/);
  assert.match(purgeSource, /purgeAvatarCaches\(\)/);
  assert.match(purgeSource, /cancelPendingBootstrapSession\(\)/);
  assert.match(
    purgeSource,
    /resetToSignedOutState\(\{\s*closeWorkspaceReason:\s*"up-devtools-vault-purge",[\s\S]*statusMessage:\s*message,[\s\S]*statusType:\s*"success",?[\s\S]*\}\)/
  );
  assert.match(purgeSource, /preservePassVault:\s*false,/);
  assert.match(resetWorkflowSource, /const preservePassVault = options\?\.preservePassVault !== false;/);
  assert.match(resetWorkflowSource, /: createEmptyUnderparVaultPayload\(\);/);
  assert.match(resetWorkflowSource, /state\.passVaultLoadPromise = null;/);
  assert.match(resetWorkflowSource, /state\.passVaultPersistPromise = null;/);
  assert.match(resetWorkflowSource, /state\.passVaultPendingStorageWriteMarkers\.clear\(\);/);
  assert.match(resetWorkflowSource, /state\.passVaultCompilePromiseByProgrammerKey\.clear\(\);/);
});

test("active CM bootstrap uses UnderPAR bearer-derived qualification instead of exc_app seeding", () => {
  const popupSource = fs.readFileSync(path.join(ROOT, "popup.js"), "utf8");
  const requestQualifiedSource = extractFunctionSource(popupSource, "requestQualifiedCmConsoleToken");
  const hydrateCmSource = extractFunctionSource(popupSource, "hydrateGlobalCmConsoleBootstrapForActiveSession");
  const ensureCmSource = extractFunctionSource(popupSource, "ensureCmApiAccessToken");

  assert.equal(/requestExperienceCloudConsoleToken/.test(requestQualifiedSource), false);
  assert.equal(/persistExperienceCloudConsoleTokenResult/.test(requestQualifiedSource), false);
  assert.equal(/getPreferredExperienceCloudConsoleAccessTokenCandidate/.test(requestQualifiedSource), false);
  assert.equal(/requestExperienceCloudConsoleToken/.test(hydrateCmSource), false);
  assert.equal(/persistExperienceCloudConsoleTokenResult/.test(hydrateCmSource), false);
  assert.equal(/tryRefreshCmTokenFromIms\(\"\"/.test(hydrateCmSource), false);
  assert.equal(/requestExperienceCloudConsoleToken/.test(ensureCmSource), false);
  assert.equal(/persistExperienceCloudConsoleTokenResult/.test(ensureCmSource), false);
  assert.equal(/ensure-cookie-session/.test(ensureCmSource), false);
  assert.doesNotMatch(requestQualifiedSource, /attemptSilentBootstrapLogin/);
  assert.doesNotMatch(ensureCmSource, /tryRefreshCmTokenFromIms/);
});

test("CM token bootstrap can harvest JWTs from raw IMS response text when access_token fields are missing", () => {
  const popupSource = fs.readFileSync(path.join(ROOT, "popup.js"), "utf8");
  const extractTokenSource = extractFunctionSource(popupSource, "extractImsAccessTokenFromPayload");
  const validateTransportSource = extractFunctionSource(popupSource, "fetchImsValidateToken");
  const checkTransportSource = extractFunctionSource(popupSource, "fetchImsCheckToken");
  const validateSource = extractFunctionSource(popupSource, "requestCmTokenViaValidateToken");
  const checkSource = extractFunctionSource(popupSource, "requestCmTokenViaImsCheck");

  assert.match(extractTokenSource, /extractJwtAndUrls\(payload\)/);
  assert.match(extractTokenSource, /rawJwtMatch/);
  assert.match(extractTokenSource, /access_token\|accessToken\|bearer\|authorization\|authToken\|token/);
  assert.match(validateTransportSource, /const text = await response\.text\(\)\.catch\(\(\) => ""\);/);
  assert.match(validateTransportSource, /rawText: text/);
  assert.match(checkTransportSource, /const text = await response\.text\(\)\.catch\(\(\) => ""\);/);
  assert.match(checkTransportSource, /rawText: text/);
  assert.match(validateSource, /normalizeCmuAccessToken\(result\.value\?\.data,\s*result\.value\?\.rawText\)/);
  assert.match(checkSource, /normalizeCmuAccessToken\(result\.value\?\.data,\s*result\.value\?\.rawText\)/);
});

test("CM request path now requires cm-console-ui qualification instead of accepting the UnderPAR shell bearer", () => {
  const popupSource = fs.readFileSync(path.join(ROOT, "popup.js"), "utf8");
  const requestSupportSource = extractFunctionSource(popupSource, "tokenSupportsCmConsoleRequests");
  const preferredTokenSource = extractFunctionSource(popupSource, "getPreferredCmRequestAccessTokenCandidate");
  const ensureCmSource = extractFunctionSource(popupSource, "ensureCmApiAccessToken");
  const resolveQualifiedSource = extractFunctionSource(popupSource, "resolveQualifiedCmConsoleAccessToken");
  const fetchCmSource = extractFunctionSource(popupSource, "fetchCmJsonWithAuthVariants");
  const reportHeadersSource = extractFunctionSource(popupSource, "buildCmuReportRequestHeaders");

  assert.match(requestSupportSource, /isCmConsoleClientId/);
  assert.doesNotMatch(requestSupportSource, /isUnderparImsClientId/);
  assert.doesNotMatch(preferredTokenSource, /state\.loginData\?\.accessToken/);
  assert.match(ensureCmSource, /resolveQualifiedCmConsoleAccessToken/);
  assert.match(resolveQualifiedSource, /fetchImsCheckTokenViaAdobePageContext/);
  assert.match(resolveQualifiedSource, /fetchImsCheckToken\(/);
  assert.match(resolveQualifiedSource, /fetchImsValidateToken\(/);
  assert.doesNotMatch(fetchCmSource, /fetchCmJsonViaReportsPageContext/);
  assert.doesNotMatch(fetchCmSource, /allowTemporaryPageContextTab/);
  assert.doesNotMatch(fetchCmSource, /headerVariants/);
  assert.doesNotMatch(fetchCmSource, /tokenRefreshAttempted/);
  assert.match(reportHeadersSource, /Authorization: `Bearer \$\{bearerToken\}`/);
});

test("CM tenant catalog reuses the vaulted tenant list until explicit refresh instead of forcing per-session re-fetches", () => {
  const popupSource = fs.readFileSync(path.join(ROOT, "popup.js"), "utf8");
  const ensureCatalogSource = extractFunctionSource(popupSource, "ensureCmTenantsCatalog");
  const activateSessionSource = extractFunctionSource(popupSource, "activateSession");

  assert.match(
    ensureCatalogSource,
    /if \(!forceRefresh && cachedCatalog && Array\.isArray\(cachedCatalog\.tenants\) && cachedCatalog\.tenants\.length > 0\)/
  );
  assert.match(ensureCatalogSource, /phase: state\.cmTenantsCatalogRuntimeFresh === true \? "cm-tenant-catalog-cache-hit" : "cm-tenant-catalog-vault-hit"/);
  assert.match(
    ensureCatalogSource,
    /const hydratedCatalog = await hydrateCmTenantsCatalogFromStorage\(\{ forceReload: false \}\);[\s\S]*phase: "cm-tenant-catalog-vault-hit"[\s\S]*return hydratedCatalog;/
  );
  assert.doesNotMatch(ensureCatalogSource, /cm-tenant-catalog-stale-cache/);
  assert.doesNotMatch(ensureCatalogSource, /cm-tenant-catalog-storage-fallback/);
  assert.doesNotMatch(activateSessionSource, /prefetchCmTenantsCatalogInBackground\(`session-activated:\$\{source\}`,\s*\{/);
});

test("CM tenant bundle loader no longer returns stale bundle data after a live failure", () => {
  const popupSource = fs.readFileSync(path.join(ROOT, "popup.js"), "utf8");
  const bundleSource = extractFunctionSource(popupSource, "loadCmTenantBundle");

  assert.doesNotMatch(bundleSource, /Using stale CM tenant bundle cache after refresh failure/);
  assert.doesNotMatch(bundleSource, /fallbackEntry\?\.bundle/);
});

test("missing DCR credentials no longer trigger full pass vault compilation from inside token acquisition", () => {
  const popupSource = fs.readFileSync(path.join(ROOT, "popup.js"), "utf8");
  const ensureDcrSource = extractFunctionSource(popupSource, "ensureDcrAccessToken");

  assert.doesNotMatch(ensureDcrSource, /queuePassVaultProgrammerCompilation\(/);
  assert.doesNotMatch(ensureDcrSource, /dcr-registration-trigger-vault-compile/);
  assert.match(ensureDcrSource, /UnderPAR could not auto-hydrate DCR credentials/);
});

test("premium app details still retain software statements while pass-vault mapping stays scope-driven", () => {
  const popupSource = fs.readFileSync(path.join(ROOT, "popup.js"), "utf8");
  const hydrationAppsSource = extractFunctionSource(popupSource, "buildPassVaultHydrationRegisteredApplications");
  const compactApplicationSource = extractFunctionSource(popupSource, "buildPassVaultCompactRegisteredApplication");
  const resolveServiceApplicationSource = extractFunctionSource(popupSource, "resolvePassVaultHydrationServiceApplication");
  const sanitizeApplicationSource = extractFunctionSource(popupSource, "sanitizePassVaultApplicationData");
  const runtimeAppInfoSource = extractFunctionSource(popupSource, "buildPassVaultRuntimeAppInfoFromRecord");
  const ensureDcrSource = extractFunctionSource(popupSource, "ensureDcrAccessToken");

  assert.match(hydrationAppsSource, /const rawScopes = Array\.isArray\(appData\?\.scopes\)/);
  assert.match(hydrationAppsSource, /softwareStatement:\s*firstNonEmptyString\(\[/);
  assert.match(compactApplicationSource, /softwareStatement:\s*firstNonEmptyString\(\[/);
  assert.match(compactApplicationSource, /extractSoftwareStatementFromAppData\(application\?\.appData \|\| null\)/);
  assert.match(
    resolveServiceApplicationSource,
    /registeredApplicationMatchesNativeRequiredScope\(application,\s*normalizedDefinition\.requiredScope\)/
  );
  assert.match(resolveServiceApplicationSource, /normalizedApplications\.length === 0 \? existingService\?\.registeredApplication : null/);
  assert.doesNotMatch(popupSource, /function mergeDetectedPassVaultServices\(/);
  assert.doesNotMatch(popupSource, /function resolveMissingPassVaultServiceMappings\(/);
  assert.match(sanitizeApplicationSource, /const softwareStatement = extractSoftwareStatementFromAppData\(source\);/);
  assert.match(sanitizeApplicationSource, /if \(softwareStatement\) \{\s*sanitized\.softwareStatement = softwareStatement;\s*\}/);
  assert.match(runtimeAppInfoSource, /softwareStatement:\s*firstNonEmptyString\(\[/);
  assert.match(ensureDcrSource, /extractSoftwareStatementFromAppData\(resolvedAppInfo\?\.appData \|\| null\)/);
});

test("selected premium app hydration mirrors LoginButton detail and software-statement enrichment before DCR register", () => {
  const popupSource = fs.readFileSync(path.join(ROOT, "popup.js"), "utf8");
  const orderedCandidatesSource = extractFunctionSource(popupSource, "buildOrderedPremiumServiceCandidates");
  const statementSource = extractFunctionSource(popupSource, "extractSoftwareStatementFromAppData");
  const detailPayloadSource = extractFunctionSource(popupSource, "normalizeRegisteredApplicationDetailPayload");
  const detailUrlsSource = extractFunctionSource(popupSource, "buildRegisteredApplicationDetailUrlCandidates");
  const enrichSource = extractFunctionSource(popupSource, "enrichRegisteredApplicationForHydration");
  const ensureDcrSource = extractFunctionSource(popupSource, "ensureDcrAccessToken");

  assert.match(orderedCandidatesSource, /Array\.isArray\(appData\?\.scopes\) \? appData\.scopes : \[\]/);
  assert.doesNotMatch(orderedCandidatesSource, /getDetectionScopesFromApplication\(appData\)/);
  assert.doesNotMatch(orderedCandidatesSource, /getScopesFromApplication\(appData\)/);
  assert.match(statementSource, /appData\?\.raw\?\.softwareStatement/);
  assert.match(statementSource, /const stack = \[appData\];/);
  assert.match(statementSource, /if \(isProbablyJwt\(normalizedValue\)\) \{\s*return normalizedValue;\s*\}/);
  assert.match(detailPayloadSource, /payload\.entityData/);
  assert.match(detailUrlsSource, /appendAdobeConsoleConfigurationVersion\(`\$\{ADOBE_CONSOLE_BASE\}\/rest\/api\/applications\/\$\{encodedGuid\}`\)/);
  assert.match(detailUrlsSource, /appendAdobeConsoleConfigurationVersion\(`\$\{ADOBE_CONSOLE_BASE\}\/rest\/api\/entity\/RegisteredApplication\/\$\{encodedGuid\}`\)/);
  assert.match(enrichSource, /fetchApplicationDetailsByGuid\(guid,\s*requestOptions\)/);
  assert.match(enrichSource, /fetchSoftwareStatementForAppGuid\(guid,\s*requestOptions\)/);
  assert.match(ensureDcrSource, /enrichRegisteredApplicationForHydration\(resolvedAppInfo,\s*\{/);
});

test("programmer hydration now mirrors LoginButton's direct snapshot-to-register flow", () => {
  const popupSource = fs.readFileSync(path.join(ROOT, "popup.js"), "utf8");
  const refreshPanelsSource = extractFunctionSource(popupSource, "refreshProgrammerPanels");
  const primeSource = extractFunctionSource(popupSource, "primeProgrammerServiceHydration");
  const compileSource = extractFunctionSource(popupSource, "queuePassVaultProgrammerCompilation");
  const hydrationAppsSource = extractFunctionSource(popupSource, "buildPassVaultHydrationRegisteredApplications");
  const serviceEntriesSource = extractFunctionSource(popupSource, "buildPassVaultServiceHydrationEntries");
  const resolveServiceApplicationSource = extractFunctionSource(popupSource, "resolvePassVaultHydrationServiceApplication");
  const hydrateEntriesSource = extractFunctionSource(popupSource, "hydratePassVaultServiceEntries");

  assert.doesNotMatch(refreshPanelsSource, /ensurePremiumAppsForProgrammer\(programmer,\s*\{/);
  assert.match(refreshPanelsSource, /setCurrentProgrammerApplicationsSnapshot\(programmerId,\s*applicationsData\);/);
  assert.match(refreshPanelsSource, /const premiumHydrationPromise = primeProgrammerServiceHydration\(programmer,\s*provisionalServices,\s*\{/);
  assert.match(primeSource, /const applicationsData =/);
  assert.match(primeSource, /queuePassVaultProgrammerCompilation\(programmer,\s*seedServices,\s*\{/);
  assert.match(compileSource, /const registeredApplications = buildPassVaultHydrationRegisteredApplications\(applicationsData\);/);
  assert.match(compileSource, /const serviceEntries = buildPassVaultServiceHydrationEntries\(\{/);
  assert.match(compileSource, /await hydratePassVaultServiceEntries\(serviceEntries,\s*PREMIUM_REQUIRED_SERVICE_KEYS,\s*\{/);
  assert.match(compileSource, /mergeHydratedServiceEntriesIntoApplicationsData\(applicationsData,\s*hydratedServiceEntries\)/);
  assert.match(compileSource, /buildPassVaultDirectPremiumServicesSnapshot\(/);
  assert.match(compileSource, /buildPassVaultDirectCredentialResults\(hydratedServiceEntries\)/);
  assert.doesNotMatch(compileSource, /resolveMissingPassVaultServiceMappings\(/);
  assert.doesNotMatch(compileSource, /hydratePassVaultServiceCredentials\(/);
  assert.match(hydrationAppsSource, /const rawScopes = Array\.isArray\(appData\?\.scopes\)/);
  assert.match(hydrationAppsSource, /buildRegisteredApplicationScopeLabels\(rawScopes\)/);
  assert.doesNotMatch(hydrationAppsSource, /getDetectionScopesFromApplication\(appData\)/);
  assert.match(resolveServiceApplicationSource, /registeredApplicationMatchesNativeRequiredScope/);
  assert.match(serviceEntriesSource, /resolvePassVaultHydrationServiceApplication/);
  assert.match(hydrateEntriesSource, /for \(const definition of definitionsToHydrate\)/);
});

test("legacy premium provisioning helpers are removed and live loading stays on the direct compile path", () => {
  const popupSource = fs.readFileSync(path.join(ROOT, "popup.js"), "utf8");
  const primeSource = extractFunctionSource(popupSource, "primeProgrammerServiceHydration");
  const refreshPanelsSource = extractFunctionSource(popupSource, "refreshProgrammerPanels");

  assert.doesNotMatch(popupSource, /function ensurePremiumAppsForProgrammer\(/);
  assert.doesNotMatch(popupSource, /function hydrateApplicationScopesForProgrammer\(/);
  assert.doesNotMatch(popupSource, /function schedulePremiumAppScopeHydration\(/);
  assert.doesNotMatch(popupSource, /function getMissingProvisionablePremiumServiceKeys\(/);
  assert.doesNotMatch(popupSource, /function hasProvisionablePremiumServiceCandidate\(/);
  assert.doesNotMatch(popupSource, /function hasProvisionableRequiredPremiumServices\(/);
  assert.match(primeSource, /const compileResult = await queuePassVaultProgrammerCompilation\(programmer,\s*seedServices,\s*\{/);
  assert.doesNotMatch(primeSource, /ensurePremiumAppsForProgrammer\(/);
  assert.match(refreshPanelsSource, /const premiumHydrationPromise = primeProgrammerServiceHydration\(programmer,\s*provisionalServices,\s*\{/);
  assert.match(refreshPanelsSource, /let resolvedServices = await premiumHydrationPromise;/);
  assert.match(refreshPanelsSource, /const finalServices = updateSelectionServicesSnapshot\(/);
});

test("premium UI renders on detected services while runtime readiness stays DCR-backed and pass-vault compilation still returns before CM background hydration", () => {
  const popupSource = fs.readFileSync(path.join(ROOT, "popup.js"), "utf8");
  const renderReadinessSource = extractFunctionSource(popupSource, "shouldRenderPremiumServicesUi");
  const compileSource = extractFunctionSource(popupSource, "queuePassVaultProgrammerCompilation");
  const refreshPanelsSource = extractFunctionSource(popupSource, "refreshProgrammerPanels");
  const loadEsmSource = extractFunctionSource(popupSource, "loadEsmWorkspaceService");
  const runtimeReadySource = extractFunctionSource(popupSource, "isProgrammerRuntimeServicesReady");

  assert.match(renderReadinessSource, /return isProgrammerPremiumUiReady\(programmerId,\s*services\);/);
  assert.match(refreshPanelsSource, /const uiReady = shouldRenderPremiumServicesUi\(programmerId,\s*finalServices\);/);
  assert.match(refreshPanelsSource, /const runtimeReady = isProgrammerRuntimeServicesReady\(programmerId,\s*finalServices\);/);
  assert.match(refreshPanelsSource, /renderPremiumServices\(provisionalServices,\s*programmer,\s*\{\s*controllerReason\s*\}\);/);
  assert.match(refreshPanelsSource, /primeProgrammerServiceHydration\(programmer,\s*provisionalServices,\s*\{/);
  assert.match(refreshPanelsSource, /renderOnReady:\s*false/);
  assert.match(compileSource, /const hydratedServiceEntries = await hydratePassVaultServiceEntries\(serviceEntries,\s*PREMIUM_REQUIRED_SERVICE_KEYS,\s*\{/);
  assert.match(compileSource, /const credentialResults = buildPassVaultDirectCredentialResults\(hydratedServiceEntries\);/);
  assert.match(compileSource, /const firstFailure =/);
  assert.match(compileSource, /throw new Error\(/);
  assert.match(compileSource, /void ensureCmHydratedForProgrammer\(programmer,\s*mergedServices,\s*\{/);
  assert.doesNotMatch(compileSource, /Promise\.all\(\[\s*hydratePassVaultServiceCredentials/);
  assert.match(runtimeReadySource, /hasPassVaultCredentialCoverageForServices\(normalizedProgrammerId,\s*resolvedServices\)/);
  assert.match(loadEsmSource, /if \(programmer\?\.programmerId && !resolvedAppInfo\?\.guid\) \{/);
});

test("pass vault compilation uses LoginButton-style registered-app ordering, resolves selected service apps, and hydrates only the selected service apps", () => {
  const popupSource = fs.readFileSync(path.join(ROOT, "popup.js"), "utf8");
  const fetchApplicationsSource = extractFunctionSource(popupSource, "fetchApplicationsForProgrammer");
  const orderedCandidatesSource = extractFunctionSource(popupSource, "buildOrderedPremiumServiceCandidates");
  const sortLabelSource = extractFunctionSource(popupSource, "getRegisteredApplicationSortLabel");
  const credentialTasksSource = extractFunctionSource(popupSource, "getPassVaultCredentialTasks");
  const collectCandidatesSource = extractFunctionSource(popupSource, "collectPassVaultServiceCredentialCandidates");
  const credentialCoverageSource = extractFunctionSource(popupSource, "hasPassVaultCredentialCoverageForServices");
  const serviceEntriesSource = extractFunctionSource(popupSource, "buildPassVaultServiceHydrationEntries");
  const resolveServiceApplicationSource = extractFunctionSource(popupSource, "resolvePassVaultHydrationServiceApplication");
  const rawFetchSource = extractFunctionSource(popupSource, "fetchApplicationRawByGuid");
  const hydrateEntriesSource = extractFunctionSource(popupSource, "hydratePassVaultServiceEntries");
  const hydrateServiceRecordSource = extractFunctionSource(popupSource, "hydratePassVaultServiceRecordWithContext");
  const directServicesSource = extractFunctionSource(popupSource, "buildPassVaultDirectPremiumServicesSnapshot");
  const compileSource = extractFunctionSource(popupSource, "queuePassVaultProgrammerCompilation");
  const statementTextSource = extractFunctionSource(popupSource, "extractSoftwareStatementFromText");
  const fetchStatementSource = extractFunctionSource(popupSource, "fetchSoftwareStatementForAppGuid");

  assert.match(fetchApplicationsSource, /__underparFetchOrder: index/);
  assert.match(sortLabelSource, /return firstNonEmptyString\(\[/);
  assert.doesNotMatch(orderedCandidatesSource, /const fetchOrder = Number\(appData\?\.__underparFetchOrder\)/);
  assert.doesNotMatch(orderedCandidatesSource, /if \(left\.fetchOrder !== right\.fetchOrder\) \{/);
  assert.doesNotMatch(orderedCandidatesSource, /if \(left\.index !== right\.index\) \{/);
  assert.match(orderedCandidatesSource, /const leftLabel = firstNonEmptyString\(\[getRegisteredApplicationSortLabel\(left\.appData\), left\.appName, left\.guid\]\)/);
  assert.match(orderedCandidatesSource, /const rightLabel = firstNonEmptyString\(\[getRegisteredApplicationSortLabel\(right\.appData\), right\.appName, right\.guid\]\)/);
  assert.match(orderedCandidatesSource, /const labelComparison = leftLabel\.localeCompare\(rightLabel, undefined, \{/);
  assert.match(credentialTasksSource, /pushTask\("restV2",\s*services\?\.restV2\?\.guid \? \[services\.restV2\] : \[\]\)/);
  assert.match(credentialTasksSource, /pushTask\("esm",\s*services\?\.esm\?\.guid \? \[services\.esm\] : \[\]\)/);
  assert.match(credentialTasksSource, /pushTask\("degradation",\s*services\?\.degradation\?\.guid \? \[services\.degradation\] : \[\]\)/);
  assert.doesNotMatch(collectCandidatesSource, /getPassVaultServiceProvisioningRank/);
  assert.match(collectCandidatesSource, /services\.restV2Apps\.forEach\(\(appInfo\) => pushCandidate\(appInfo\)\)/);
  assert.match(collectCandidatesSource, /services\.esmApps\.forEach\(\(appInfo\) => pushCandidate\(appInfo\)\)/);
  assert.match(collectCandidatesSource, /services\.degradationApps\.forEach\(\(appInfo\) => pushCandidate\(appInfo\)\)/);
  assert.match(credentialCoverageSource, /hasPassVaultServiceClientCredentials\(normalizedProgrammerId,\s*task\?\.appInfo \|\| null\)/);
  assert.match(serviceEntriesSource, /const cachedClient =/);
  assert.match(serviceEntriesSource, /loadDcrCache\(programmerId,\s*appGuid\)/);
  assert.match(serviceEntriesSource, /registeredApplication:\s*registeredApplication \? cloneJsonLikeValue\(registeredApplication,\s*null\) : null,/);
  assert.match(serviceEntriesSource, /status: registeredApplication \? \(client\?\.clientId && client\?\.clientSecret \? "ready" : "pending"\) : "unavailable",/);
  assert.match(serviceEntriesSource, /compactPassVaultRegisteredApplicationsMatch\(registeredApplication,\s*existingService\?\.registeredApplication\)/);
  assert.match(resolveServiceApplicationSource, /normalizedApplications\.length === 0 \? existingService\?\.registeredApplication : null/);
  assert.match(hydrateEntriesSource, /for \(const definition of definitionsToHydrate\)/);
  assert.match(hydrateEntriesSource, /const sharedHydratedApplicationsByGuid = new Map\(\);/);
  assert.match(hydrateEntriesSource, /const sharedClientByGuid = new Map\(\);/);
  assert.match(hydrateEntriesSource, /hydratePassVaultServiceRecordWithContext\(/);
  assert.match(hydrateServiceRecordSource, /const cachedClient =/);
  assert.match(hydrateServiceRecordSource, /loadDcrCache\(programmerId,\s*guid\)/);
  assert.match(hydrateServiceRecordSource, /sharedHydratedApplicationsByGuid/);
  assert.match(hydrateServiceRecordSource, /sharedClientByGuid/);
  assert.match(directServicesSource, /restV2:\s*hydratedServiceEntries\?\.restV2\?\.registeredApplication \|\| restV2Apps\[0\] \|\| null,/);
  assert.match(directServicesSource, /esm:\s*hydratedServiceEntries\?\.esm\?\.registeredApplication \|\| esmApps\[0\] \|\| null,/);
  assert.match(directServicesSource, /degradation:\s*hydratedServiceEntries\?\.degradation\?\.registeredApplication \|\| degradationApps\[0\] \|\| null,/);
  assert.doesNotMatch(popupSource, /function mergeDetectedPassVaultServices\(/);
  assert.doesNotMatch(popupSource, /function resolveMissingPassVaultServiceMappings\(/);
  assert.doesNotMatch(popupSource, /function hydratePassVaultServiceCredentials\(/);
  assert.match(compileSource, /setProgrammerPremiumHydrationProgress\(programmerId,\s*\{\s*step:\s*"detect"/);
  assert.match(compileSource, /label:\s*"Saving premium services to VAULT\.\.\."/);
  assert.match(compileSource, /const persistPromise = persistPassVaultProgrammerRecord\(programmer,\s*mergedServices,\s*\{/);
  assert.doesNotMatch(compileSource, /await persistPassVaultProgrammerRecord\(programmer,\s*mergedServices,/);
  assert.match(compileSource, /const firstFailure =/);
  assert.match(statementTextSource, /const parsed = JSON\.parse\(normalizedText\)/);
  assert.match(rawFetchSource, /let bulkFallback = null;/);
  assert.match(rawFetchSource, /const bulkStatement = firstNonEmptyString\(\[/);
  assert.match(rawFetchSource, /const urlCandidates = buildRegisteredApplicationDetailUrlCandidates\(guid\);/);
  assert.match(rawFetchSource, /return bulkFallback \|\| \{ text: "", parsed: null \};/);
  assert.match(fetchStatementSource, /const candidateStatement = extractSoftwareStatementFromText\(content\);/);
  assert.match(fetchStatementSource, /const rawTextStatement = extractSoftwareStatementFromText\(rawPayload\?\.text \|\| ""\);/);
});

test("premium services reuse the mounted DOM when the selected service signature has not changed", () => {
  const popupSource = fs.readFileSync(path.join(ROOT, "popup.js"), "utf8");
  const renderSource = extractFunctionSource(popupSource, "renderPremiumServices");
  const signatureSource = extractFunctionSource(popupSource, "buildPremiumServicesRenderSignature");
  const refreshExistingSource = extractFunctionSource(popupSource, "refreshExistingPremiumServiceSections");

  assert.match(signatureSource, /const selectedRequestorId = String\(state\.selectedRequestorId \|\| ""\)\.trim\(\);/);
  assert.match(signatureSource, /const selectedMvpdId = String\(state\.selectedMvpdId \|\| ""\)\.trim\(\);/);
  assert.match(renderSource, /const renderSignature = buildPremiumServicesRenderSignature\(programmer,\s*services\);/);
  assert.match(renderSource, /els\.premiumServicesContainer\.dataset\.renderSignature/);
  assert.match(renderSource, /refreshExistingPremiumServiceSections\(programmer,\s*services\)/);
  assert.match(refreshExistingSource, /syncRestV2LoginPanel\(section,\s*programmer,\s*serviceApp\)/);
  assert.match(refreshExistingSource, /syncMvpdWorkspaceToolForSection\(section,\s*programmer,\s*services\)/);
  assert.match(refreshExistingSource, /section\.__underparRefreshCm/);
});

test("REST V2 app selection preserves detected order while still reusing requestor-scoped app context", () => {
  const popupSource = fs.readFileSync(path.join(ROOT, "popup.js"), "utf8");
  const selectRestV2Source = extractFunctionSource(popupSource, "selectPreferredRestV2AppForRequestor");
  const loadMvpdsSource = extractFunctionSource(popupSource, "loadMvpdsFromRestV2");
  const fetchWithPremiumAuthSource = extractFunctionSource(popupSource, "fetchWithPremiumAuth");

  assert.match(selectRestV2Source, /const cachedAuthContext = normalizedRequestorId \? getRequestorScopedRestV2AuthContext\(normalizedRequestorId\) : null;/);
  assert.match(selectRestV2Source, /const cachedMatch = candidates\.find\(\(item\) => item\.guid === cachedAuthContext\.preferredAppGuid\) \|\| null;/);
  assert.match(selectRestV2Source, /const mapped =\s*candidates\.find\(\(appInfo\) => appSupportsServiceProvider\(appInfo,\s*normalizedRequestorId,\s*normalizedProgrammerId\)\)/);
  assert.doesNotMatch(selectRestV2Source, /getProvisioningRank/);
  assert.match(selectRestV2Source, /return candidates\[0\] \|\| null;/);
  assert.match(loadMvpdsSource, /const requestorPreferredApp = selectPreferredRestV2AppForRequestor\(/);
  assert.match(loadMvpdsSource, /const requiresRuntimeHydration =/);
  assert.match(loadMvpdsSource, /await primeProgrammerServiceHydration\(programmer,\s*premiumApps,\s*\{/);
  assert.match(loadMvpdsSource, /requestorId,/);
  assert.match(fetchWithPremiumAuthSource, /ensureDcrAccessTokenWithServiceRecovery\(/);
});

test("premium API usage provisions service clients on demand and ESM direct auth helpers no longer stay cache-only", () => {
  const popupSource = fs.readFileSync(path.join(ROOT, "popup.js"), "utf8");
  const fetchWithPremiumAuthSource = extractFunctionSource(popupSource, "fetchWithPremiumAuth");
  const clickEsmAuthSource = extractFunctionSource(popupSource, "resolveClickEsmAuthContext");
  const recordingSource = extractFunctionSource(popupSource, "startEsmWorkspaceEsmRecording");

  assert.match(fetchWithPremiumAuthSource, /allowProvisioning:\s*debugMeta\?\.allowProvisioning !== false/);
  assert.match(clickEsmAuthSource, /allowProvisioning:\s*true/);
  assert.match(recordingSource, /allowProvisioning:\s*true/);
});

test("ESM recovery excludes the failed app, promotes the recovered app, and locks the retry selection", () => {
  const popupSource = fs.readFileSync(path.join(ROOT, "popup.js"), "utf8");
  const recoverSelectionSource = extractFunctionSource(popupSource, "recoverEsmServiceSelection");
  const recoverSource = extractFunctionSource(popupSource, "ensureDcrAccessTokenWithEsmRecovery");

  assert.match(recoverSelectionSource, /const excludedGuid = String\(options\?\.excludedGuid \|\| ""\)\.trim\(\);/);
  assert.match(
    recoverSelectionSource,
    /collectEsmAppCandidatesFromPremiumApps\(services\)\.find\(\s*\(appInfo\) => String\(appInfo\?\.guid \|\| ""\)\.trim\(\) !== excludedGuid\s*\)/
  );
  assert.match(recoverSelectionSource, /esm:\s*recoveredAppInfo,/);
  assert.match(recoverSelectionSource, /esmApps:\s*collectEsmAppCandidatesFromPremiumApps\(/);
  assert.match(recoverSource, /excludedGuid:\s*String\(resolvedAppInfo\?\.guid \|\| ""\)\.trim\(\)/);
  assert.match(
    recoverSource,
    /if \(!recoveredAppInfo\?\.guid \|\| String\(recoveredAppInfo\.guid \|\| ""\)\.trim\(\) === String\(resolvedAppInfo\?\.guid \|\| ""\)\.trim\(\)\)/
  );
  assert.match(recoverSource, /lockAppSelection:\s*true/);
});

test("degradation selection and DCR auth recovery no longer stay pinned to invalid apps", () => {
  const popupSource = fs.readFileSync(path.join(ROOT, "popup.js"), "utf8");
  const resolveDegradationSource = extractFunctionSource(popupSource, "resolveDegradationAppCandidates");
  const recoverSource = extractFunctionSource(popupSource, "ensureDcrAccessTokenWithServiceRecovery");
  const recoverSelectionSource = extractFunctionSource(popupSource, "recoverPremiumServiceSelection");
  const clickDgrAuthSource = extractFunctionSource(popupSource, "resolveClickDgrAuthContext");
  const degradationCurlSource = extractFunctionSource(popupSource, "degradationBuildCurlCommand");

  assert.match(resolveDegradationSource, /if \(normalizedPreferredGuid && normalizedGuid === normalizedPreferredGuid\) \{\s*score \+= 50;/);
  assert.doesNotMatch(resolveDegradationSource, /getPassVaultServiceProvisioningRank/);
  assert.match(resolveDegradationSource, /return compareDegradationAppPriority\(leftApp,\s*rightApp\);/);
  assert.match(recoverSource, /shouldAttemptAlternatePremiumServiceRecovery\(error,\s*resolvedAppInfo,\s*debugMeta\)/);
  assert.match(recoverSource, /recoverPremiumServiceSelection\(programmerId,\s*resolvedAppInfo,\s*debugMeta\)/);
  assert.match(recoverSelectionSource, /primeProgrammerServiceHydration\(programmer,\s*getRuntimePremiumServicesSeed\(normalizedProgrammerId\),\s*\{/);
  assert.doesNotMatch(recoverSelectionSource, /queuePassVaultProgrammerCompilation\(/);
  assert.doesNotMatch(recoverSelectionSource, /finalizePassVaultProgrammerHydration\(/);
  assert.match(clickDgrAuthSource, /ensureDcrAccessTokenWithServiceRecovery\(/);
  assert.match(degradationCurlSource, /ensureDcrAccessTokenWithServiceRecovery\(/);
});

test("activation leaves the global selectors user-owned and premium hydration starts only after explicit selection", () => {
  const popupSource = fs.readFileSync(path.join(ROOT, "popup.js"), "utf8");
  const refreshSource = extractFunctionSource(popupSource, "refreshProgrammerPanels");
  const activateSessionSource = extractFunctionSource(popupSource, "activateSession");
  const passVaultRecordSource = extractFunctionSource(popupSource, "buildPassVaultProgrammerRecord");

  assert.doesNotMatch(refreshSource, /hydrateProgrammerFromPassVault\(/);
  assert.match(
    refreshSource,
    /const programmerApplicationsPromise =[\s\S]*options\.programmerApplicationsPromise[\s\S]*ensureSelectedProgrammerApplicationsLoaded\(programmer,/
  );
  assert.match(refreshSource, /const applicationsData = await programmerApplicationsPromise;/);
  assert.match(
    refreshSource,
    /const premiumHydrationPromise = primeProgrammerServiceHydration\(programmer,\s*provisionalServices,\s*\{/
  );
  assert.match(refreshSource, /let resolvedServices = await premiumHydrationPromise;/);
  assert.match(refreshSource, /buildPassVaultRuntimeServicesSnapshot\(vaultRecord\)/);
  assert.doesNotMatch(activateSessionSource, /restorePreferredProgrammerSelectionForActivation\(/);
  assert.doesNotMatch(activateSessionSource, /captureAdobePassEnvironmentSwitchSelectionSnapshot\(\)/);
  assert.doesNotMatch(activateSessionSource, /selectProgrammerForController\(/);
  assert.doesNotMatch(activateSessionSource, /refreshProgrammerPanels\(\{/);
  assert.match(passVaultRecordSource, /lastSelectedAt:\s*0/);
  assert.match(activateSessionSource, /void hydrateAuthenticatedAdobePassSession\(normalizedSource,/);
});

test("premium detection promotes TempPASS as a first-class premium workspace alongside CM tenant catalog detection", () => {
  const popupSource = fs.readFileSync(path.join(ROOT, "popup.js"), "utf8");
  const findPremiumAppsSource = extractFunctionSource(popupSource, "findPremiumServiceApplications");
  const applySummarySource = extractFunctionSource(popupSource, "applyPremiumServiceRuntimeSummary");
  const refreshPanelsSource = extractFunctionSource(popupSource, "refreshProgrammerPanels");
  const premiumDecisionSource = extractFunctionSource(popupSource, "emitPremiumServiceDecisionLogs");

  assert.match(findPremiumAppsSource, /resetTempPass:\s*null/);
  assert.match(findPremiumAppsSource, /resetTempPassApps:\s*\[\]/);
  assert.match(findPremiumAppsSource, /PREMIUM_SERVICE_RESET_TEMPPASS_SCOPE/);
  assert.match(applySummarySource, /findCmTenantMatchesForProgrammer\(programmer,\s*cmCatalog\.tenants\)/);
  assert.match(applySummarySource, /PREMIUM_SERVICE_SCOPE_RULES\.forEach/);
  assert.match(applySummarySource, /syntheticSource:\s*"cm-catalog"/);
  assert.match(refreshPanelsSource, /const provisionalUiServices =/);
  assert.match(refreshPanelsSource, /const reusableServices =/);
  assert.match(refreshPanelsSource, /setProgrammerPremiumHydrationProgress\(programmerId,\s*\{\s*step:\s*"detect"/);
  assert.match(
    refreshPanelsSource,
    /if \(provisionalUiServices\) \{\s*const provisionalRuntimeReady = isProgrammerRuntimeServicesReady\(programmerId,\s*provisionalUiServices\);/
  );
  assert.match(
    refreshPanelsSource,
    /if \(!provisionalUiServices\) \{\s*renderPremiumServicesLoading\(programmer,\s*\{\s*controllerReason\s*\}\);/
  );
  assert.match(refreshPanelsSource, /renderPremiumServices\(provisionalServices,\s*programmer,\s*\{\s*controllerReason\s*\}\);/);
  assert.match(refreshPanelsSource, /const cmSelectionReadyPromise = skipCmBootstrap/);
  assert.match(refreshPanelsSource, /renderPremiumServices\(finalServices,\s*programmer,\s*\{\s*controllerReason\s*\}\);/);
  assert.match(premiumDecisionSource, /has Reset TempPASS/);
  assert.match(premiumDecisionSource, /buildPremiumServiceDecisionLogSignature\(programmer,\s*services\)/);
  assert.match(
    popupSource,
    /const PREMIUM_SERVICE_DISPLAY_ORDER = \["restV2", "esmWorkspace", "degradation", "resetTempPass", "cm", "cmMvpd"\];/
  );
  assert.match(
    popupSource,
    /const UNDERPAR_VAULT_DCR_SERVICE_DEFINITIONS = Object\.freeze\(\[[\s\S]*\{ serviceKey: "resetTempPass", label: "TempPASS", requiredScope: PREMIUM_SERVICE_RESET_TEMPPASS_SCOPE \}/
  );
  assert.match(popupSource, /const TEMP_PASS_WORKSPACE_PATH = "temp-pass-workspace\.html";/);
  assert.match(popupSource, /const TEMP_PASS_WORKSPACE_MESSAGE_TYPE = "underpar:temp-pass-workspace";/);
  assert.match(popupSource, /function tempPassBuildControllerHtml\(programmer, context = \{\}\)/);
  assert.match(popupSource, /function loadTempPassService\(programmer, appInfo, section, contentElement, requestToken\)/);
  assert.match(popupSource, /serviceKey === "resetTempPass"/);
  assert.doesNotMatch(popupSource, /TODO: implement RESET TempPASS support/);
  assert.doesNotMatch(popupSource, /reset_temp_pass_reminder=/);
});

test("DCR register and token flows now mirror LoginButton's compact form/query contract", () => {
  const popupSource = fs.readFileSync(path.join(ROOT, "popup.js"), "utf8");
  const registerSource = extractFunctionSource(popupSource, "registerClientWithSoftwareStatement");
  const tokenSource = extractFunctionSource(popupSource, "requestClientCredentialsToken");

  assert.match(registerSource, /grant_types:\s*\["client_credentials"\]/);
  assert.match(registerSource, /token_endpoint_auth_method:\s*"client_secret_post"/);
  assert.match(registerSource, /new URLSearchParams\(\{\s*software_statement: normalizedSoftwareStatement,\s*\}\)\.toString\(\)/);
  assert.match(tokenSource, /const attempts = \["form", "query"\];/);
  assert.doesNotMatch(tokenSource, /DEGRADATION_SCOPE_CANDIDATES/);
  assert.doesNotMatch(tokenSource, /addTokenAttempt\(/);
  assert.doesNotMatch(tokenSource, /minimal === true/);
  assert.match(tokenSource, /body\.set\("scope", normalizedAttemptScope\)/);
});

test("premium runtime readiness still depends on DCR-ready premium apps while UI rendering unlocks on detected services", () => {
  const popupSource = fs.readFileSync(path.join(ROOT, "popup.js"), "utf8");
  const runtimeReadySource = extractFunctionSource(popupSource, "isProgrammerRuntimeServicesReady");
  const renderReadySource = extractFunctionSource(popupSource, "shouldRenderPremiumServicesUi");
  const progressSource = extractFunctionSource(popupSource, "setProgrammerPremiumHydrationProgress");
  const primeSource = extractFunctionSource(popupSource, "primeProgrammerServiceHydration");
  const loadingSource = extractFunctionSource(popupSource, "renderPremiumServicesLoading");

  assert.match(runtimeReadySource, /hasPassVaultCredentialCoverageForServices\(normalizedProgrammerId,\s*resolvedServices\)/);
  assert.match(renderReadySource, /return isProgrammerPremiumUiReady\(programmerId,\s*services\);/);
  assert.match(progressSource, /!shouldRenderPremiumServicesUi\(String\(programmerId \|\| ""\)\.trim\(\), getCurrentPremiumAppsSnapshot\(programmerId\)\)/);
  assert.match(primeSource, /if \(runtimeReady\) \{\s*setProgrammerWorkspaceHydrationReady\(programmerId,\s*true\);/);
  assert.doesNotMatch(runtimeReadySource, /isCmRuntimeRenderReady/);
  assert.doesNotMatch(loadingSource, /Detected:/);
  assert.doesNotMatch(loadingSource, /detailLines/);
});

test("premium panel rendering unlocks on detected services and keeps workspace hydration tied to runtime readiness", () => {
  const popupSource = fs.readFileSync(path.join(ROOT, "popup.js"), "utf8");
  const primeSource = extractFunctionSource(popupSource, "primeProgrammerServiceHydration");
  const refreshSource = extractFunctionSource(popupSource, "refreshProgrammerPanels");
  const compileSource = extractFunctionSource(popupSource, "queuePassVaultProgrammerCompilation");

  assert.match(primeSource, /const uiReady = shouldRenderPremiumServicesUi\(programmerId,\s*runtimeServices\)/);
  assert.match(primeSource, /const runtimeReady = isProgrammerRuntimeServicesReady\(programmerId,\s*runtimeServices\)/);
  assert.match(primeSource, /renderOnReady &&[\s\S]*uiReady &&/);
  assert.match(primeSource, /if \(runtimeReady\) \{\s*setProgrammerWorkspaceHydrationReady\(programmerId,\s*true\);/);
  assert.doesNotMatch(primeSource, /finalizePassVaultProgrammerHydration\(/);
  assert.doesNotMatch(primeSource, /hydrateProgrammerFromPassVault\(/);
  assert.match(refreshSource, /const provisionalRuntimeReady = isProgrammerRuntimeServicesReady\(programmerId,\s*provisionalServices\);/);
  assert.match(refreshSource, /renderPremiumServices\(provisionalServices,\s*programmer,\s*\{\s*controllerReason\s*\}\);/);
  assert.match(refreshSource, /const runtimeReady = isProgrammerRuntimeServicesReady\(programmerId,\s*finalServices\);/);
  assert.match(refreshSource, /const uiReady = shouldRenderPremiumServicesUi\(programmerId,\s*finalServices\);/);
  assert.match(refreshSource, /setProgrammerWorkspaceHydrationReady\(programmerId,\s*runtimeReady\);/);
  assert.doesNotMatch(refreshSource, /options\.markHydrated !== false && runtimeReady/);
  assert.match(compileSource, /const hydratedServiceEntries = await hydratePassVaultServiceEntries/);
  assert.match(compileSource, /const credentialResults = buildPassVaultDirectCredentialResults\(hydratedServiceEntries\);/);
  assert.match(compileSource, /void ensureCmHydratedForProgrammer\(programmer,\s*mergedServices,\s*\{/);
});

test("optional TempPASS credential misses stay non-blocking and successful panel hydration clears stale top-level status", () => {
  const popupSource = fs.readFileSync(path.join(ROOT, "popup.js"), "utf8");
  const compileSource = extractFunctionSource(popupSource, "queuePassVaultProgrammerCompilation");
  const refreshSource = extractFunctionSource(popupSource, "refreshProgrammerPanels");
  const credentialFilterSource = extractFunctionSource(popupSource, "getPassVaultCredentialResultsForServiceKeys");
  const credentialReadySource = extractFunctionSource(popupSource, "passVaultCredentialResultHasClientCredentials");

  assert.match(
    compileSource,
    /const blockingCredentialResults = getPassVaultCredentialResultsForServiceKeys\(\s*credentialResults,\s*PREMIUM_REQUIRED_SERVICE_KEYS\s*\);/
  );
  assert.match(compileSource, /const failedCount = blockingCredentialResults\.filter\(\(result\) => !passVaultCredentialResultHasClientCredentials\(result\)\)\.length;/);
  assert.match(
    compileSource,
    /const firstFailure =\s*blockingCredentialResults\.find\(\(result\) => !passVaultCredentialResultHasClientCredentials\(result\)\) \|\| null;/
  );
  assert.doesNotMatch(compileSource, /const failedCount = credentialResults\.filter/);
  assert.match(
    credentialFilterSource,
    /const requestedServiceKeys = new Set\(\s*\(Array\.isArray\(serviceKeys\) && serviceKeys\.length > 0 \? serviceKeys : PREMIUM_REQUIRED_SERVICE_KEYS\)/
  );
  assert.match(credentialReadySource, /const cache = normalizeUnderparVaultDcrCache\(result\?\.cache \|\| null\);/);
  assert.match(refreshSource, /if \(reusableServices\) \{[\s\S]*clearStatusUnlessCmTenantsPrecheckBlocked\(\);[\s\S]*renderPremiumServices\(reusableServices,/);
  assert.match(
    refreshSource,
    /clearProgrammerPremiumHydrationProgress\(programmerId\);[\s\S]*setProgrammerWorkspaceHydrationReady\(programmerId,\s*runtimeReady\);[\s\S]*clearStatusUnlessCmTenantsPrecheckBlocked\(\);[\s\S]*renderPremiumServices\(finalServices,/
  );
});

test("no-selection authenticated state tells the user to choose a Media Company instead of implying hydration failure", () => {
  const popupSource = fs.readFileSync(path.join(ROOT, "popup.js"), "utf8");
  const renderPremiumServicesSource = extractFunctionSource(popupSource, "renderPremiumServices");

  assert.match(
    renderPremiumServicesSource,
    /programmer\?\.programmerId[\s\S]*No premium scoped applications loaded yet\.[\s\S]*Select a Media Company to load premium scoped applications\./
  );
});

test("ESM and DEGRADATION panel loaders mount immediately from detected apps and only fall back to hydration when no app is selected yet", () => {
  const popupSource = fs.readFileSync(path.join(ROOT, "popup.js"), "utf8");
  const esmSource = extractFunctionSource(popupSource, "loadEsmWorkspaceService");
  const cmSource = extractFunctionSource(popupSource, "loadCmService");
  const degradationSource = extractFunctionSource(popupSource, "loadDegradationService");

  assert.match(esmSource, /getProgrammerServiceHydrationPromise\(programmer\.programmerId\)/);
  assert.match(esmSource, /if \(programmer\?\.programmerId && !resolvedAppInfo\?\.guid\) \{/);
  assert.match(esmSource, /const inFlightHydration = getProgrammerServiceHydrationPromise\(programmer\.programmerId\);/);
  assert.match(esmSource, /primeProgrammerServiceHydration\(programmer, currentServices/);
  assert.match(cmSource, /primeProgrammerServiceHydration\(programmer, latestServices/);
  assert.match(degradationSource, /let resolvedAppInfo = resolveDegradationAppCandidates\(/);
  assert.match(degradationSource, /if \(programmer\?\.programmerId && !resolvedAppInfo\?\.guid\) \{/);
  assert.match(degradationSource, /const inFlightHydration = getProgrammerServiceHydrationPromise\(programmer\.programmerId\);/);
  assert.match(degradationSource, /primeProgrammerServiceHydration\(programmer, currentServices/);
  assert.doesNotMatch(esmSource, /hasPassVaultServiceClientCredentials\(programmer\.programmerId,\s*resolvedAppInfo\)/);
  assert.doesNotMatch(degradationSource, /hasPassVaultServiceClientCredentials\(programmer\.programmerId,\s*resolvedAppInfo\)/);
  assert.ok(
    esmSource.indexOf("if (programmer?.programmerId && !resolvedAppInfo?.guid) {") <
      esmSource.indexOf("const inFlightHydration = getProgrammerServiceHydrationPromise(programmer.programmerId);")
  );
  assert.ok(
    degradationSource.indexOf("if (programmer?.programmerId && !resolvedAppInfo?.guid) {") <
      degradationSource.indexOf("const inFlightHydration = getProgrammerServiceHydrationPromise(programmer.programmerId);")
  );
});

test("CM direct fetch and tenant catalog paths stay on explicit bearer contracts", () => {
  const popupSource = fs.readFileSync(path.join(ROOT, "popup.js"), "utf8");
  const fetchSource = extractFunctionSource(popupSource, "fetchCmJsonWithAuthVariants");
  const tenantCatalogSource = extractFunctionSource(popupSource, "fetchCmTenantCatalogWithAuth");

  assert.doesNotMatch(popupSource, /function fetchCmTenantCatalogWithSession/);
  assert.match(fetchSource, /getPreferredCmRequestAccessTokenCandidate\(\)/);
  assert.match(fetchSource, /Authorization: `Bearer \$\{resolvedAccessToken\}`/);
  assert.doesNotMatch(fetchSource, /fetchCmJsonViaReportsPageContext/);
  assert.doesNotMatch(fetchSource, /headerVariants/);
  assert.doesNotMatch(fetchSource, /tokenRefreshAttempted/);
  assert.doesNotMatch(fetchSource, /allowCookieFallback/);
  assert.match(tenantCatalogSource, /getPreferredPrimaryImsAccessTokenCandidate\(\)/);
  assert.match(tenantCatalogSource, /Authorization: `Bearer \$\{accessToken\}`/);
  assert.doesNotMatch(tenantCatalogSource, /headerVariants/);
  assert.doesNotMatch(tenantCatalogSource, /attemptedTokenRefresh/);
});

test("CM tenant bootstrap now follows the LoginButton CM context flow without reports-page fallback", () => {
  const popupSource = fs.readFileSync(path.join(ROOT, "popup.js"), "utf8");
  const buildCmContextSource = extractFunctionSource(popupSource, "buildCmContext");
  const ensureCatalogSource = extractFunctionSource(popupSource, "ensureCmTenantsCatalog");
  const precheckSource = extractFunctionSource(popupSource, "ensureCmTenantsPrecheckForActiveSession");
  const prefetchSource = extractFunctionSource(popupSource, "prefetchCmTenantsCatalogInBackground");
  const avatarMenuSource = extractFunctionSource(popupSource, "openAvatarMenu");

  assert.doesNotMatch(ensureCatalogSource, /bootstrapCmConsoleTenantSession\(/);
  assert.match(precheckSource, /const cmContext = await buildCmContext/);
  assert.match(precheckSource, /buildCmTenantsCatalogFromContext\(cmContext/);
  assert.match(buildCmContextSource, /resolveQualifiedCmConsoleAccessToken/);
  assert.match(buildCmContextSource, /fetchPrimetimeJson/);
  assert.match(buildCmContextSource, /fetchCmuReportJson/);
  assert.doesNotMatch(ensureCatalogSource, /const shouldPreferReportsPageBootstrap/);
  assert.doesNotMatch(ensureCatalogSource, /requestCmConsoleBootstrapCatalogFromReportsPage\(/);
  assert.match(ensureCatalogSource, /const tenantCatalogUrl = buildApiRequestUrl\(CM_BASE_URL,\s*CM_TENANTS_PATH/);
  assert.match(ensureCatalogSource, /fetchPrimetimeJson\(\{/);
  assert.doesNotMatch(prefetchSource, /prefetchCmConsoleBootstrapSummaryInBackground/);
  assert.doesNotMatch(avatarMenuSource, /prefetchCmConsoleBootstrapSummaryInBackground/);
});

test("clickCMU auth context reuses the shared CM token helper without a profile round-trip", () => {
  const popupSource = fs.readFileSync(path.join(ROOT, "popup.js"), "utf8");
  const clickCmuAuthSource = extractFunctionSource(popupSource, "resolveClickCmuAuthContext");
  const clickCmuRuntimeSource = extractFunctionSource(popupSource, "buildClickCmuRuntimePatchSnippet");

  assert.match(clickCmuAuthSource, /ensureCmApiAccessToken\(\{/);
  assert.doesNotMatch(clickCmuAuthSource, /fetchImsSessionProfile\(/);
  assert.doesNotMatch(clickCmuAuthSource, /forceRefresh:\s*true/);
  assert.doesNotMatch(clickCmuAuthSource, /experienceCloudAccessToken/);
  assert.doesNotMatch(clickCmuAuthSource, /experienceCloudClientIds/);
  assert.doesNotMatch(clickCmuRuntimeSource, /experienceCloudAccessToken/);
  assert.doesNotMatch(clickCmuRuntimeSource, /resolveExperienceCloudClientIds/);
});

test("PKCE authorization URL uses code response mode and the configured client ID", () => {
  const helpers = loadPopupImsHelpers();

  const authorizationUrl = helpers.buildUnderparImsAuthorizationCodeUrl({
    clientId: "underpar-client-id",
    redirectUri: "https://example.chromiumapp.org/ims-callback",
    scope: "openid profile",
    state: "state-123",
    codeChallenge: "challenge-123",
    prompt: "none",
    extraParams: {
      organization: "@adobepass",
    },
  });

  const parsed = new URL(authorizationUrl);
  assert.equal(parsed.origin, "https://ims-na1.adobelogin.com");
  assert.equal(parsed.pathname, "/ims/authorize/v2");
  assert.equal(parsed.searchParams.get("client_id"), "underpar-client-id");
  assert.equal(parsed.searchParams.get("response_type"), "code");
  assert.equal(parsed.searchParams.get("response_mode"), "query");
  assert.equal(parsed.searchParams.get("code_challenge_method"), "S256");
  assert.equal(parsed.searchParams.get("code_challenge"), "challenge-123");
  assert.equal(parsed.searchParams.get("redirect_uri"), "https://example.chromiumapp.org/ims-callback");
  assert.equal(parsed.searchParams.get("scope"), "openid profile");
  assert.equal(parsed.searchParams.get("prompt"), "none");
  assert.equal(parsed.searchParams.get("organization"), "@adobepass");
});

test("PKCE authorization URL ignores auth-envelope overrides from extra params", () => {
  const helpers = loadPopupImsHelpers();

  const authorizationUrl = helpers.buildUnderparImsAuthorizationCodeUrl({
    clientId: "underpar-client-id",
    redirectUri: "https://example.chromiumapp.org/ims-callback",
    scope: "openid profile",
    state: "state-123",
    codeChallenge: "challenge-123",
    extraParams: {
      client_id: "exc_app",
      response_type: "token",
      response_mode: "fragment",
      code_challenge_method: "plain",
      code_challenge: "override-me",
      organization: "@adobepass",
    },
  });

  const parsed = new URL(authorizationUrl);
  assert.equal(parsed.searchParams.get("client_id"), "underpar-client-id");
  assert.equal(parsed.searchParams.get("response_type"), "code");
  assert.equal(parsed.searchParams.get("response_mode"), "query");
  assert.equal(parsed.searchParams.get("code_challenge_method"), "S256");
  assert.equal(parsed.searchParams.get("code_challenge"), "challenge-123");
  assert.equal(parsed.searchParams.get("organization"), "@adobepass");
});

test("PKCE authorization URL carries the supported IMS login prompt when requested", () => {
  const helpers = loadPopupImsHelpers();

  const authorizationUrl = helpers.buildUnderparImsAuthorizationCodeUrl({
    clientId: "underpar-client-id",
    redirectUri: "https://example.chromiumapp.org/ims-callback",
    scope: "openid profile read_organizations",
    state: "state-123",
    codeChallenge: "challenge-123",
    prompt: "login",
  });

  const parsed = new URL(authorizationUrl);
  assert.equal(parsed.searchParams.get("prompt"), "login");
});

test("IMS logout URL carries the browser reset parameters needed for recovery re-auth", () => {
  const helpers = loadPopupImsHelpers();

  const logoutUrl = helpers.buildUnderparImsLogoutUrl({
    accessToken: "ims-access-token",
    redirectUri: "https://example.chromiumapp.org/ims-callback",
    clientId: "underpar-client-id",
  });

  const parsed = new URL(logoutUrl);
  assert.equal(parsed.origin, "https://ims-na1.adobelogin.com");
  assert.equal(parsed.pathname, "/ims/logout");
  assert.equal(parsed.searchParams.get("access_token"), "ims-access-token");
  assert.equal(parsed.searchParams.get("redirect_uri"), "https://example.chromiumapp.org/ims-callback");
  assert.equal(parsed.searchParams.get("client_id"), "underpar-client-id");
});

test("granted IMS scope merges response and claims tokens for org diagnostics", () => {
  const helpers = loadPopupImsHelpers();

  assert.equal(
    helpers.resolveGrantedUnderparImsScope(
      "",
      "openid profile",
      "additional_info.projectedProductContext read_organizations"
    ),
    "openid profile additional_info.projectedproductcontext read_organizations"
  );
  assert.equal(
    JSON.stringify(
      helpers.getMissingUnderparImsScopeTokens(
        "openid profile additional_info.projectedproductcontext",
        "openid profile additional_info.projectedProductContext read_organizations"
      )
    ),
    JSON.stringify(["read_organizations"])
  );
});

test("restricted org extraction accepts shell-style label and value records", () => {
  const popupSource = fs.readFileSync(path.join(ROOT, "popup.js"), "utf8");
  const extractOrgIdSource = extractFunctionSource(popupSource, "extractOrgId");
  const extractOrganizationIdSource = extractFunctionSource(popupSource, "extractOrganizationId");
  const extractVerifiedOrgClaimSource = extractFunctionSource(popupSource, "extractVerifiedCustomerOrganizationClaim");
  const extractOrgNameSource = extractFunctionSource(popupSource, "extractOrgName");
  const extractUserIdSource = extractFunctionSource(popupSource, "extractUserId");

  assert.doesNotMatch(extractOrgIdSource, /org\?\.value/);
  assert.doesNotMatch(extractOrgIdSource, /org\?\.organization(?!Id|ID|_id)\b/);
  assert.doesNotMatch(extractOrgIdSource, /org\?\.id/);
  assert.doesNotMatch(extractOrganizationIdSource, /value\.value/);
  assert.match(extractOrganizationIdSource, /looksLikeOrganizationObject\(value\) \? firstNonEmptyString\(\[value\.id, value\.code\]\) : ""/);
  assert.match(extractVerifiedOrgClaimSource, /idClaims\?\.org_id/);
  assert.match(extractVerifiedOrgClaimSource, /accessClaims\?\.organizationId/);
  assert.doesNotMatch(extractVerifiedOrgClaimSource, /profile\.projectedProductContext/);
  assert.doesNotMatch(extractVerifiedOrgClaimSource, /extractOrganizationId\(accessClaims\)/);
  assert.match(extractOrgNameSource, /org\?\.label/);
  assert.match(extractUserIdSource, /org\?\.profileGuid/);
  assert.match(extractUserIdSource, /org\?\.userGuid/);
});

test("restricted active-org resolution ignores picker-only option records", () => {
  const {
    collectAuthoritativeRestrictedOrganizations,
    collectUnderparUnifiedShellOrganizations,
    resolveCachedOrganizationsFromLoginData,
    matchesAdobePassOrg,
    normalizeRequestedTargetOrganization,
  } = loadPopupRestrictedActiveOrgHelper();

  const organizations = collectAuthoritativeRestrictedOrganizations([
    {
      key: "org:@adobepass",
      label: "@AdobePass",
      source: "runtimeConfig.organizations[0]",
      hinted: false,
      orgId: "@adobepass",
    },
    {
      orgId: "campaigncustomercare",
      orgName: "Adobe Campaign Customer Care",
    },
    {
      key: "org:campaigncustomercare",
      label: "Adobe Campaign Customer Care | campaigncustomercare",
      sources: ["organizations[0]"],
      orgId: "campaigncustomercare",
    },
    {
      tenantId: "pass-tenant",
      imsOrgId: "pass@AdobeOrg",
      organizationName: "@AdobePass",
    },
  ]);

  assert.deepEqual(JSON.parse(JSON.stringify(organizations)), [
    {
      orgId: "campaigncustomercare",
      orgName: "Adobe Campaign Customer Care",
    },
    {
      tenantId: "pass-tenant",
      imsOrgId: "pass@AdobeOrg",
      organizationName: "@AdobePass",
    },
  ]);

  assert.equal(
    matchesAdobePassOrg({
      orgId: "customersupport",
      orgName: "Adobe Marketing Cloud | customersupport",
      projectedProductContext: [{ orgId: "@adobepass", orgName: "@AdobePass" }],
    }),
    false
  );
  assert.equal(
    matchesAdobePassOrg({
      orgId: "@adobepass",
      label: "@AdobePass",
    }),
    true
  );

  const normalizedTarget = normalizeRequestedTargetOrganization({
    imsOrgId: "30FC5E0951240C900A490D4D@AdobeOrg",
    tenantId: "adobepass",
    userId: "user-123",
    label: "Adobe Pass",
  });
  assert.deepEqual(JSON.parse(JSON.stringify(normalizedTarget)), {
    key: "adobepass::user-123::adobe pass",
    id: "adobepass",
    orgId: "adobepass",
    tenantId: "adobepass",
    imsOrgId: "30FC5E0951240C900A490D4D@AdobeOrg",
    userId: "user-123",
    clusterUserId: "user-123",
    clusterUserType: "",
    name: "Adobe Pass",
    label: "Adobe Pass",
    hinted: false,
    isAdobePass: true,
    source: "session-picker",
  });

  const storedOrganizations = resolveCachedOrganizationsFromLoginData({
    detectedOrganizations: [
      {
        key: "org:adobepass::user-123::adobe pass",
        label: "Adobe Pass | 30FC5E0951240C900A490D4D@AdobeOrg",
        orgId: "adobepass",
        tenantId: "adobepass",
        imsOrgId: "30FC5E0951240C900A490D4D@AdobeOrg",
        userId: "user-123",
        hinted: true,
        source: "session.detectedOrganizations[0]",
        raw: {
          orgId: "customersupport",
          orgName: "Adobe Marketing Cloud | customersupport",
        },
      },
    ],
  });
  assert.deepEqual(JSON.parse(JSON.stringify(storedOrganizations)), [
    {
      key: "org:adobepass::user-123::adobe pass",
      id: "adobepass",
      orgId: "adobepass",
      tenantId: "adobepass",
      imsOrgId: "30FC5E0951240C900A490D4D@AdobeOrg",
      userId: "user-123",
      clusterUserId: "user-123",
      clusterUserType: "",
      name: "Adobe Pass | 30FC5E0951240C900A490D4D@AdobeOrg",
      label: "Adobe Pass | 30FC5E0951240C900A490D4D@AdobeOrg",
      source: "session.detectedOrganizations[0]",
      sources: ["session.detectedOrganizations[0]"],
      hinted: true,
      isAdobePass: true,
      raw: {
        orgId: "customersupport",
        orgName: "Adobe Marketing Cloud | customersupport",
      },
    },
  ]);

  const unifiedShellOrganizations = collectUnderparUnifiedShellOrganizations(
    {
      data: {
        imsExtendedAccountClusterData: {
          data: [
            {
              userId: "user-123",
              userType: "federatedID",
              restricted: false,
              consolidatedAccount: false,
              owningOrg: {
                tenantId: "customersupport",
                imsOrgId: "customersupport@AdobeOrg",
                orgName: "Customer Support",
              },
              orgs: [
                {
                  tenantId: "adobepass",
                  imsOrgId: "30FC5E0951240C900A490D4D@AdobeOrg",
                  orgName: "Adobe Pass",
                },
              ],
            },
          ],
        },
      },
    },
    {
      selectedOrg: "adobepass",
    }
  );
  assert.equal(
    unifiedShellOrganizations.some((organization) =>
      organization.tenantId === "adobepass" &&
      organization.imsOrgId === "30FC5E0951240C900A490D4D@AdobeOrg" &&
      organization.hinted === true
    ),
    true
  );
});

test("restricted picker selectedOrg prefers tenant ids over AdobeOrg ids like LoginButton", () => {
  const { resolveRestrictedPickerSelectedOrg } = loadPopupRestrictedSelectedOrgHelper();

  assert.equal(
    resolveRestrictedPickerSelectedOrg(
      {
        orgId: "30FC5E0951240C900A490D4D@AdobeOrg",
        id: "30FC5E0951240C900A490D4D@AdobeOrg",
        tenantId: "adobepass",
        imsOrgId: "30FC5E0951240C900A490D4D@AdobeOrg",
      },
      {}
    ),
    "adobepass"
  );

  assert.equal(
    resolveRestrictedPickerSelectedOrg(null, {
      targetOrganization: {
        id: "30FC5E0951240C900A490D4D@AdobeOrg",
        tenantId: "adobepass",
      },
    }),
    "adobepass"
  );
});

test("restricted org context upgrades generic stored labels from Unified Shell like LoginButton", () => {
  const { buildRestrictedOrganizationContext } = loadPopupRestrictedActiveOrgHelper();

  const organizationContext = buildRestrictedOrganizationContext(
    [
      {
        key: "wileypublishing::user-1::wiley.",
        id: "wileypublishing",
        orgId: "wileypublishing",
        tenantId: "wileypublishing",
        userId: "user-1",
        name: "Wiley.",
        label: "Wiley. | wileypublishing",
        source: "unifiedShell.imsExtendedAccountClusterData[22].owningOrg",
        hinted: true,
      },
    ],
    {
      detectedOrganizations: [
        {
          key: "wileypublishing::user-1::adobe marketing cloud",
          id: "wileypublishing",
          orgId: "wileypublishing",
          tenantId: "wileypublishing",
          userId: "user-1",
          name: "Adobe Marketing Cloud",
          label: "Adobe Marketing Cloud",
          source: "session.detectedOrganizations[0]",
          hinted: true,
        },
      ],
      verifiedClaim: {
        id: "wileypublishing",
        rawId: "wileypublishing",
        source: "accessClaims.org_id",
      },
    }
  );

  assert.equal(organizationContext.activeOrganization.name, "Wiley.");
  assert.equal(organizationContext.activeOrganization.label, "Wiley. | wileypublishing");
  assert.equal(organizationContext.options[0].label, "Wiley. | wileypublishing");
});

test("restricted org context does not let the requested target org override the returned active org", () => {
  const { buildRestrictedOrganizationContext } = loadPopupRestrictedActiveOrgHelper();

  const organizationContext = buildRestrictedOrganizationContext(
    [
      {
        key: "org:wfadoberm",
        id: "wfadoberm",
        orgId: "wfadoberm",
        tenantId: "wfadoberm",
        userId: "user-1",
        name: "Workfront AdobeRM",
        label: "Workfront AdobeRM | wfadoberm",
        source: "unifiedShell.imsExtendedAccountClusterData[4].owningOrg",
        hinted: true,
      },
    ],
    {
      verifiedClaim: {
        id: "wfadoberm",
        rawId: "wfadoberm",
        source: "accessClaims.org_id",
      },
    },
    {
      key: "org:adobepass",
      id: "adobepass",
      orgId: "adobepass",
      tenantId: "adobepass",
      name: "Adobe Pass",
      label: "Adobe Pass | adobepass",
      source: "session-picker",
      hinted: true,
    }
  );

  assert.equal(organizationContext.activeOrganization.orgId, "wfadoberm");
  assert.equal(organizationContext.activeOrganization.label, "Workfront AdobeRM | wfadoberm");
  assert.equal(organizationContext.options.some((option) => option.orgId === "adobepass"), false);
});

test("restricted org context does not persist picker-only target orgs into detected org state", () => {
  const { buildRestrictedOrganizationContext } = loadPopupRestrictedActiveOrgHelper();

  const organizationContext = buildRestrictedOrganizationContext(
    [
      {
        key: "org:wfadoberm",
        id: "wfadoberm",
        orgId: "wfadoberm",
        tenantId: "wfadoberm",
        userId: "user-1",
        name: "Workfront AdobeRM",
        label: "Workfront AdobeRM | wfadoberm",
        source: "unifiedShell.imsExtendedAccountClusterData[4].owningOrg",
        hinted: true,
      },
    ],
    {
      detectedOrganizations: [
        {
          key: "org:adobepass",
          id: "adobepass",
          orgId: "adobepass",
          tenantId: "adobepass",
          name: "Adobe Pass",
          label: "Adobe Pass | adobepass",
          source: "session-picker",
          sources: ["session-picker"],
          hinted: true,
        },
      ],
    },
    {
      key: "org:adobepass",
      id: "adobepass",
      orgId: "adobepass",
      tenantId: "adobepass",
      name: "Adobe Pass",
      label: "Adobe Pass | adobepass",
      source: "session-picker",
      hinted: true,
    }
  );

  assert.equal(organizationContext.activeOrganization.orgId, "wfadoberm");
  assert.equal(organizationContext.detectedOrganizations.some((option) => option.orgId === "adobepass"), false);
  assert.equal(organizationContext.options.some((option) => option.orgId === "adobepass"), false);
});

test("restricted org context prefers returned session payload org over stale detected candidates when no verified claim is available", () => {
  const { buildRestrictedOrganizationContext } = loadPopupRestrictedActiveOrgHelper();

  const organizationContext = buildRestrictedOrganizationContext(
    [
      {
        key: "org:adobepass",
        id: "adobepass",
        orgId: "adobepass",
        tenantId: "adobepass",
        name: "Adobe Pass",
        label: "Adobe Pass | adobepass",
        source: "stored.detectedOrganizations[0]",
      },
      {
        key: "org:nbaproperties",
        id: "nbaproperties",
        orgId: "nbaproperties",
        tenantId: "nbaproperties",
        name: "NBA Properties, Inc.",
        label: "NBA Properties, Inc. | nbaproperties",
        source: "unifiedShell.imsExtendedAccountClusterData[2].owningOrg",
      },
    ],
    {
      profile: {
        tenantId: "nbaproperties",
        organizationName: "NBA Properties, Inc.",
      },
    },
    {
      key: "org:adobepass",
      id: "adobepass",
      orgId: "adobepass",
      tenantId: "adobepass",
      name: "Adobe Pass",
      label: "Adobe Pass | adobepass",
      source: "session-picker",
      hinted: true,
    }
  );

  assert.equal(organizationContext.activeOrganization.orgId, "nbaproperties");
  assert.equal(organizationContext.activeOrganization.authoritative, true);
  assert.equal(organizationContext.activeOrganization.resolutionSource, "session-payload");
});

test("restricted picker selectedOrg falls back through shell and projected product context tenant ids", () => {
  const { resolveRestrictedPickerSelectedOrg } = loadPopupRestrictedSelectedOrgHelper();

  assert.equal(
    resolveRestrictedPickerSelectedOrg(null, {
      unifiedShell: {
        selectedOrg: "adobepass",
      },
    }),
    "adobepass"
  );

  assert.equal(
    resolveRestrictedPickerSelectedOrg(null, {
      profile: {
        projectedProductContext: [
          {
            prodCtx: {
              tenantId: "adobepass",
            },
          },
        ],
      },
    }),
    "adobepass"
  );
});

test("login auth context prefers the resolved org name before the picker label like LoginButton", () => {
  const popupSource = fs.readFileSync(path.join(ROOT, "popup.js"), "utf8");
  const buildLoginAuthContextSource = extractFunctionSource(popupSource, "buildLoginAuthContext");

  assert.match(buildLoginAuthContextSource, /const activeOrganizationTrusted = activeOrganization\?\.authoritative === true \|\| detectedOrganizations\.length === 1;/);
  assert.match(buildLoginAuthContextSource, /activeOrganizationTrusted \? activeOrganization\?\.name : "",\s*activeOrganizationTrusted \? activeOrganization\?\.label : "",/);
  assert.doesNotMatch(buildLoginAuthContextSource, /loginData\?\.adobePassOrg\?\.name/);
  assert.doesNotMatch(buildLoginAuthContextSource, /loginData\?\.adobePassOrg\?\.orgId/);
});

test("restricted org picker merges IMS orgs with profile claims and configured ZIP.KEY orgs", () => {
  const popupSource = fs.readFileSync(path.join(ROOT, "popup.js"), "utf8");
  const buildOptionsSource = extractFunctionSource(popupSource, "buildRestrictedOrgOptions");
  const buildContextSource = extractFunctionSource(popupSource, "buildRestrictedOrganizationContext");
  const buildContextFromSessionSource = extractFunctionSource(popupSource, "buildOrganizationContextFromSession");
  const resolveSelectedOrgSource = extractFunctionSource(popupSource, "resolveRestrictedPickerSelectedOrg");
  const collectCandidatesSource = extractFunctionSource(popupSource, "collectRestrictedOrganizationCandidates");
  const ensureRestrictedOptionsSource = extractFunctionSource(popupSource, "ensureRestrictedOrgOptionsFromToken");
  const resolveCachedOrganizationsSource = extractFunctionSource(popupSource, "resolveCachedOrganizationsFromLoginData");
  const fetchUnifiedShellInitSource = extractFunctionSource(popupSource, "fetchUnderparUnifiedShellInit");
  const fetchUnifiedShellSource = extractFunctionSource(popupSource, "fetchUnderparUnifiedShellOrganizations");

  assert.match(buildOptionsSource, /buildRestrictedOrganizationContext\(organizations, sessionData, preferredOrg\)\.options/);
  assert.match(buildContextSource, /getActiveUnderparImsRuntimeConfig\(\)/);
  assert.match(buildContextSource, /parseJwtPayload\(currentSession\?\.accessToken\)/);
  assert.match(buildContextSource, /parseJwtPayload\(currentSession\?\.idToken\)/);
  assert.match(buildContextSource, /const providedOrganizations = Array\.isArray\(organizations\) \? organizations : flattenOrganizations\(organizations\);/);
  assert.match(buildContextSource, /const storedOrganizations = hasCanonicalRestrictedStoredOrganizations\(currentSession\?\.detectedOrganizations\)/);
  assert.match(buildContextSource, /normalizeStoredRestrictedOrganizationCandidates\(currentSession\.detectedOrganizations\)/);
  assert.match(buildContextSource, /const providedCanonicalOrganizations = hasCanonicalRestrictedStoredOrganizations\(providedOrganizations\)/);
  assert.match(buildContextSource, /collectAuthoritativeRestrictedOrganizations/);
  assert.match(buildContextSource, /const returnedOrganizations = \[/);
  assert.match(buildContextSource, /const optionOrganizations = \[\.\.\.returnedOrganizations\];/);
  assert.match(buildContextSource, /\.\.\.storedOrganizations,/);
  assert.match(buildContextSource, /const authoritativeProvidedOrganizations =/);
  assert.match(buildContextSource, /collectAuthoritativeRestrictedOrganizations\(providedOrganizations\)/);
  assert.match(buildContextSource, /organizations: optionOrganizations,/);
  assert.match(buildContextSource, /const activeOrganizationCandidates = collectRestrictedOrganizationCandidates\(/);
  assert.match(buildContextSource, /organizations: returnedOrganizations,/);
  assert.match(buildContextSource, /configuredOrganizations: \[\]/);
  assert.match(buildContextSource, /organizationCandidates: activeOrganizationCandidates/);
  assert.doesNotMatch(buildContextSource, /preferredOrg\.raw/);
  assert.doesNotMatch(buildContextFromSessionSource, /currentSession\?\.targetOrganization/);
  assert.doesNotMatch(resolveSelectedOrgSource, /preferredOrganization\?\.tenantId/);
  assert.doesNotMatch(resolveSelectedOrgSource, /verifiedClaim/);
  const matchesAdobePassSource = extractFunctionSource(popupSource, "matchesAdobePassOrg");
  assert.doesNotMatch(matchesAdobePassSource, /objectContainsAdobePass/);
  const verifyTargetSource = extractFunctionSource(popupSource, "verifyTargetOrganizationSelection");
  const attachTargetSource = extractFunctionSource(popupSource, "attachTargetOrganizationToLoginData");
  const buildLoginPayloadSource = extractFunctionSource(popupSource, "buildLoginSessionPayloadFromAuth");
  assert.match(attachTargetSource, /const normalizedTargetOrganization = normalizeRequestedTargetOrganization\(targetOrganization\);/);
  assert.match(verifyTargetSource, /const normalizedTargetOrganization = normalizeRequestedTargetOrganization\(targetOrganization\);/);
  assert.match(verifyTargetSource, /buildRestrictedOrganizationContext\(\s*resolveCachedOrganizationsFromLoginData\(sessionData\),/);
  assert.match(verifyTargetSource, /hasRestrictedOrganizationIdentifierIntersection\(expectedOrgIdentifiers, resolvedOrgIdentifiers\)/);
  assert.match(buildLoginPayloadSource, /const flattenedOrganizations = flattenOrganizations\(rawOrganizations\);/);
  assert.match(buildLoginPayloadSource, /const detectedOrganizations = collectCanonicalRestrictedDetectedOrganizations\(/);
  assert.match(buildLoginPayloadSource, /detectedOrganizations,/);
  assert.doesNotMatch(collectCandidatesSource, /left\.isAdobePass/);
  assert.match(collectCandidatesSource, /configuredOrganizations\.forEach/);
  assert.match(collectCandidatesSource, /hinted: value\.hinted === true/);
  assert.match(collectCandidatesSource, /candidate\.hinted === true \|\| Boolean\(orgId && hintedOrgIds\.has/);
  assert.match(collectCandidatesSource, /collectCandidatesFromValue\(profile, "profile"\)/);
  assert.match(collectCandidatesSource, /collectCandidatesFromValue\(profile\?\.additional_info, "profile\.additional_info"\)/);
  assert.match(collectCandidatesSource, /collectCandidatesFromValue\(accessClaims, "accessClaims"\)/);
  assert.match(collectCandidatesSource, /collectCandidatesFromValue\(idClaims, "idClaims"\)/);
  assert.match(collectCandidatesSource, /if \(\/\^https\?:\\\/\\\//);
  assert.match(resolveCachedOrganizationsSource, /loginData\.detectedOrganizations/);
  assert.match(resolveCachedOrganizationsSource, /hasCanonicalRestrictedStoredOrganizations\(loginData\.detectedOrganizations\)/);
  assert.match(resolveCachedOrganizationsSource, /normalizeStoredRestrictedOrganizationCandidates\(loginData\.detectedOrganizations\)/);
  assert.match(ensureRestrictedOptionsSource, /fetchUnderparUnifiedShellOrganizations\(token/);
  assert.match(ensureRestrictedOptionsSource, /const detectedOrganizations = collectCanonicalRestrictedDetectedOrganizations\(/);
  assert.match(ensureRestrictedOptionsSource, /detectedOrganizations,/);
  assert.match(fetchUnifiedShellInitSource, /response = await fetch\(UNIFIED_SHELL_GRAPHQL_URL/);
  assert.match(fetchUnifiedShellInitSource, /selectedOrg: selectedOrg \|\| null/);
  assert.doesNotMatch(fetchUnifiedShellInitSource, /relayImsFetch/);
  assert.doesNotMatch(fetchUnifiedShellInitSource, /serializeError/);
  assert.match(fetchUnifiedShellSource, /const parsed = await fetchUnderparUnifiedShellInit\(accessToken, options\);/);
  assert.match(fetchUnifiedShellSource, /return collectUnderparUnifiedShellOrganizations\(parsed, \{/);
  assert.match(fetchUnifiedShellSource, /selectedOrg: firstNonEmptyString\(\[options\?\.selectedOrg\]\)/);
  assert.match(fetchUnifiedShellSource, /activeOrganization: options\?\.activeOrganization \|\| null/);
});

test("post-login hydration persists authoritative detected orgs instead of picker options", () => {
  const popupSource = fs.readFileSync(path.join(ROOT, "popup.js"), "utf8");
  const hydrateSource = extractFunctionSource(popupSource, "hydratePostLoginSessionData");

  assert.match(hydrateSource, /const existingOrganizations = resolveCachedOrganizationsFromLoginData\(currentSession\);/);
  assert.match(hydrateSource, /const activeOrganizationHint = buildRestrictedOrganizationContext\(existingOrganizations, currentSession, null\)\.activeOrganization;/);
  assert.match(hydrateSource, /const mergedDetectedOrganizations = mergeRestrictedDetectedOrganizations\(/);
  assert.doesNotMatch(hydrateSource, /const mergedOrganizationContext = buildRestrictedOrganizationContext\(/);
});

test("popup and sidepanel ship a minimal sign-in surface without a pre-auth org target picker", () => {
  const sidepanelHtml = fs.readFileSync(path.join(ROOT, "sidepanel.html"), "utf8");
  const popupHtml = fs.readFileSync(path.join(ROOT, "popup.html"), "utf8");
  const popupSource = fs.readFileSync(path.join(ROOT, "popup.js"), "utf8");
  const renderSignInViewSource = extractFunctionSource(popupSource, "renderSignInView");

  for (const htmlSource of [popupHtml, sidepanelHtml]) {
    assert.doesNotMatch(htmlSource, /id="sign-in-org-field"/);
    assert.doesNotMatch(htmlSource, /id="sign-in-org-select"/);
    assert.doesNotMatch(htmlSource, /id="sign-in-org-meta"/);
    assert.doesNotMatch(htmlSource, /id="sign-in-org-hint"/);
    assert.match(htmlSource, /id="sign-in-hero-btn"/);
  }

  assert.doesNotMatch(renderSignInViewSource, /buildTargetOrganizationContext\(\)/);
  assert.doesNotMatch(renderSignInViewSource, /PREAUTH_TARGET_ORG_PLACEHOLDER_VALUE/);
  assert.match(renderSignInViewSource, /els\.signInHeroBtn\.disabled = signingIn;/);
  assert.match(renderSignInViewSource, /els\.signInHeroBtn\.textContent = signingIn \? "Signing In\.\.\." : "Sign In";/);
});

test("shared serializeError helper is available to CM hydration helpers", () => {
  const popupSource = fs.readFileSync(path.join(ROOT, "popup.js"), "utf8");
  const serializeErrorSource = extractFunctionSource(popupSource, "serializeError");
  const buildCmContextSource = extractFunctionSource(popupSource, "buildCmContext");

  assert.match(serializeErrorSource, /error instanceof Error/);
  assert.match(serializeErrorSource, /return String\(error \|\| "Unknown error"\);/);
  assert.match(buildCmContextSource, /serializeError\(cmuTokenResult\.error\)/);
  assert.match(buildCmContextSource, /serializeError\(tenantsResult\.error\)/);
});

test("primary sign-in always forces Adobe's chooser and silent bootstrap no longer waits on pre-auth org selection", () => {
  const popupSource = fs.readFileSync(path.join(ROOT, "popup.js"), "utf8");
  const primarySignInSource = extractFunctionSource(popupSource, "onPrimarySignInClick");
  const silentBootstrapSource = extractFunctionSource(popupSource, "shouldAttemptSilentBootstrapSession");

  assert.doesNotMatch(primarySignInSource, /buildTargetOrganizationContext\(\)/);
  assert.doesNotMatch(primarySignInSource, /Choose an Adobe org target before signing in\./);
  assert.match(primarySignInSource, /state\.selectedTargetOrganizationKey = "";/);
  assert.match(primarySignInSource, /await signInInteractive\(\{\s*prompt: "login",\s*forceBrowserLogout: true,\s*\}\);/);
  assert.doesNotMatch(silentBootstrapSource, /targetOrganizationContext/);
  assert.match(silentBootstrapSource, /!state\.manualSignOutHold/);
  assert.match(silentBootstrapSource, /hasConfiguredUnderparImsClientId\(\)/);
});

test("avatar menu no longer triggers background CM tenant hydration", () => {
  const popupSource = fs.readFileSync(path.join(ROOT, "popup.js"), "utf8");
  const openAvatarMenuSource = extractFunctionSource(popupSource, "openAvatarMenu");

  assert.doesNotMatch(openAvatarMenuSource, /prefetchCmTenantsCatalogInBackground\(/);
  assert.match(openAvatarMenuSource, /renderAvatarMenu\(\);/);
});

test("avatar menu display name mirrors the LoginButton org hotlink", () => {
  const popupHtml = fs.readFileSync(path.join(ROOT, "popup.html"), "utf8");
  const sidepanelHtml = fs.readFileSync(path.join(ROOT, "sidepanel.html"), "utf8");
  const popupSource = fs.readFileSync(path.join(ROOT, "popup.js"), "utf8");
  const renderAvatarMenuSource = extractFunctionSource(popupSource, "renderAvatarMenu");

  assert.match(
    popupHtml,
    /id="avatar-menu-name"[\s\S]*class="avatar-menu-name avatar-menu-name-link"[\s\S]*href="https:\/\/experience\.adobe\.com"[\s\S]*target="_blank"[\s\S]*rel="noreferrer"/
  );
  assert.match(
    sidepanelHtml,
    /id="avatar-menu-name"[\s\S]*class="avatar-menu-name avatar-menu-name-link"[\s\S]*href="https:\/\/experience\.adobe\.com"[\s\S]*target="_blank"[\s\S]*rel="noreferrer"/
  );
  assert.match(popupSource, /function getLoginActiveOrganization\(loginData\)/);
  assert.match(popupSource, /function normalizeExperienceOrgSlug\(activeOrganization\)/);
  assert.match(popupSource, /function buildExperienceOrgUrl\(activeOrganization\)/);
  assert.match(popupSource, /function buildExperienceOrgTitle\(activeOrganization\)/);
  assert.match(renderAvatarMenuSource, /const activeOrganization = getLoginActiveOrganization\(state\.loginData\);/);
  assert.match(renderAvatarMenuSource, /els\.avatarMenuName\.href = buildExperienceOrgUrl\(activeOrganization\);/);
  assert.match(renderAvatarMenuSource, /els\.avatarMenuName\.title = buildExperienceOrgTitle\(activeOrganization\);/);
});

test("avatar menu hides AdobePASS-only CM diagnostics unless the active IMS org is AdobePASS", () => {
  const popupSource = fs.readFileSync(path.join(ROOT, "popup.js"), "utf8");
  const buildEntriesSource = extractFunctionSource(popupSource, "buildAvatarMenuEntries");
  const activeCmSummarySource = extractFunctionSource(popupSource, "getAvatarMenuActiveCmSummaryState");
  const cmSummarySource = extractFunctionSource(popupSource, "getAvatarMenuCmSummaryState");
  const renderAvatarMenuSource = extractFunctionSource(popupSource, "renderAvatarMenu");

  assert.match(buildEntriesSource, /const adobePassWorkflowActive = shouldHydrateAdobePassWorkflowForSession\(loginData\);/);
  assert.match(buildEntriesSource, /if \(adobePassWorkflowActive\) \{\s*const cmConsoleAccessToken = getPreferredCmAccessTokenCandidate\(\);/s);
  assert.doesNotMatch(buildEntriesSource, /pushEntry\("cm-console-ui access token".*?\);\s*pushEntry\("Profile Image URL"/s);
  assert.match(activeCmSummarySource, /if \(!shouldHydrateAdobePassWorkflowForSession\(state\.loginData\)\) \{\s*return null;\s*\}/);
  assert.match(cmSummarySource, /if \(!shouldHydrateAdobePassWorkflowForSession\(state\.loginData\)\) \{\s*return null;\s*\}/);
  assert.match(renderAvatarMenuSource, /const adobePassWorkflowActive = shouldHydrateAdobePassWorkflowForSession\(state\.loginData\);/);
  assert.match(renderAvatarMenuSource, /if \(adobePassWorkflowActive\) \{\s*const cmSummary = getAvatarMenuCmSummaryState\(\);/s);
  assert.match(renderAvatarMenuSource, /els\.avatarMenuSystem\.hidden = true;/);
});

test("activation only trusts explicit target-org selection and restricted retry no longer reuses hidden config", () => {
  const popupSource = fs.readFileSync(path.join(ROOT, "popup.js"), "utf8");
  const activationPrepSource = extractFunctionSource(popupSource, "enforceAdobePassAccess");
  const restrictedSwitchSource = extractFunctionSource(popupSource, "onRestrictedOrgSwitch");
  const restrictedRetrySource = extractFunctionSource(popupSource, "onRestrictedSignInAgain");
  const restrictedOptionsSource = extractFunctionSource(popupSource, "ensureRestrictedOrgOptionsFromToken");
  const updateRestrictedOptionsSource = extractFunctionSource(popupSource, "updateRestrictedOrgOptions");

  assert.match(activationPrepSource, /attachTargetOrganizationToLoginData/);
  assert.match(activationPrepSource, /verifyTargetOrganizationSelection/);
  assert.match(activationPrepSource, /resolveAdobePassAccessContext\(/);
  assert.match(activationPrepSource, /collectCanonicalRestrictedDetectedOrganizations\(/);
  assert.match(activationPrepSource, /fetchUnderparUnifiedShellOrganizations\(loginData\.accessToken/);
  assert.match(activationPrepSource, /const activeOrganizationSeed = buildRestrictedOrganizationContext\(/);
  assert.match(activationPrepSource, /activeOrganization: activeOrganizationSeed/);
  assert.match(
    activationPrepSource,
    /detectedOrganizations = collectCanonicalRestrictedDetectedOrganizations\(\s*\{[\s\S]*organizations:\s*pickerOrganizations,[\s\S]*\},\s*pickerOrganizations\s*\);/s
  );
  assert.match(activationPrepSource, /organizations = pickerOrganizations;/);
  assert.match(activationPrepSource, /tokenHasReadOrganizationsScope/);
  assert.doesNotMatch(activationPrepSource, /selectedTargetOrganization \|\| loginData\?\.adobePassOrg/);
  assert.doesNotMatch(activationPrepSource, /findMatchingRestrictedOrganizationOption\(state\.restrictedOrgOptions, loginData\?\.adobePassOrg\)/);
  assert.doesNotMatch(activationPrepSource, /resolveTargetOrganizationForLogin\(\)/);
  assert.doesNotMatch(activationPrepSource, /state\.selectedTargetOrganizationKey =/);
  assert.match(restrictedOptionsSource, /fetchUnderparUnifiedShellOrganizations\(token/);
  assert.match(restrictedOptionsSource, /activeOrganization: configuredPreferredOrg/);
  assert.match(restrictedOptionsSource, /updateRestrictedOrgOptions\(mergedOrganizations, configuredPreferredOrg,/);
  assert.match(restrictedOptionsSource, /const detectedOrganizations = collectCanonicalRestrictedDetectedOrganizations\(/);
  assert.match(restrictedOptionsSource, /detectedOrganizations,/);
  assert.match(updateRestrictedOptionsSource, /const activeKey = String\(activeOrganization\?\.key \|\| ""\)\.trim\(\);/);
  assert.doesNotMatch(restrictedSwitchSource, /buildPreferredOrgSwitchStrategy\(selected\)/);
  assert.doesNotMatch(restrictedSwitchSource, /extraParams:/);
  assert.doesNotMatch(restrictedRetrySource, /targetOrganization/);
  assert.doesNotMatch(restrictedSwitchSource, /for \(const strategy of strategies\)/);
  assert.doesNotMatch(activationPrepSource, /orgVerification\.status === "verified-mismatch"/);
  assert.match(activationPrepSource, /allowed: accessContext\.eligible === true/);
  assert.match(activationPrepSource, /recoveryLabel: firstNonEmptyString\(\[accessContext\.reason\]\)/);
});

test("interactive sign-in flows verify Adobe's returned org before activation", () => {
  const popupSource = fs.readFileSync(path.join(ROOT, "popup.js"), "utf8");
  const finalizeSource = extractFunctionSource(popupSource, "finalizeRequestedTargetLoginData");
  const signInInteractiveSource = extractFunctionSource(popupSource, "signInInteractive");
  const restrictedSwitchSource = extractFunctionSource(popupSource, "onRestrictedOrgSwitch");
  const refreshSource = extractFunctionSource(popupSource, "refreshSessionManual");

  assert.match(finalizeSource, /const orgVerification = verifyTargetOrganizationSelection\(finalizedLoginData, normalizedTargetOrganization\);/);
  assert.match(finalizeSource, /status: "accepted-returned-org"/);
  assert.match(finalizeSource, /UnderPAR switched to the active returned Adobe org\./);
  assert.match(finalizeSource, /UnderPAR kept the prior session so it does not misrepresent the selected Adobe profile\./);
  assert.match(signInInteractiveSource, /const finalizedLoginDataResult = finalizeRequestedTargetLoginData\(/);
  assert.match(signInInteractiveSource, /acceptReturnedOrganization: loginOptions\?\.forceBrowserLogout === true/);
  assert.match(restrictedSwitchSource, /const finalizedLoginDataResult = finalizeRequestedTargetLoginData\(/);
  assert.match(restrictedSwitchSource, /acceptReturnedOrganization: true/);
  assert.match(refreshSource, /const finalizedLoginDataResult = finalizeRequestedTargetLoginData\(/);
  assert.match(refreshSource, /acceptReturnedOrganization: false/);
});

test("authoritative AdobePass descriptor no longer trusts shell selection or downstream console tokens", () => {
  const popupSource = fs.readFileSync(path.join(ROOT, "popup.js"), "utf8");
  const descriptorSource = extractFunctionSource(popupSource, "resolveAuthoritativeAdobePassOrgDescriptor");

  assert.match(descriptorSource, /const activeOrganizationTrusted = activeOrganization\?\.authoritative === true \|\| detectedOrganizations\.length === 1;/);
  assert.match(descriptorSource, /matchesAdobePassOrg\(activeOrganization\)/);
  assert.match(descriptorSource, /matchesAdobePassOrg\(currentSession\?\.imsSession\)/);
  assert.doesNotMatch(descriptorSource, /currentSession\?\.adobePassOrg/);
  assert.doesNotMatch(descriptorSource, /fallbackAdobePassOrg/);
  assert.doesNotMatch(descriptorSource, /currentSession\?\.experienceCloudImsSession/);
  assert.doesNotMatch(descriptorSource, /currentSession\?\.cmConsoleImsSession/);
  assert.doesNotMatch(descriptorSource, /currentSession\?\.unifiedShell\?\.selectedOrg/);
});

test("legacy Experience Cloud shell merge helper is removed and CM bootstrap seed no longer injects AdobePass identity", () => {
  const popupSource = fs.readFileSync(path.join(ROOT, "popup.js"), "utf8");
  const cmSeedSource = extractFunctionSource(popupSource, "createCmBootstrapSeedLoginData");

  assert.doesNotMatch(popupSource, /function mergeExperienceCloudShellSnapshotIntoLoginData\(/);
  assert.match(cmSeedSource, /adobePassOrg: null,/);
  assert.doesNotMatch(cmSeedSource, /experienceCloudAccessToken:/);
  assert.doesNotMatch(cmSeedSource, /experienceCloudImsSession:/);
});

test("session identity, avatar, and CM token hints no longer fall back to stale AdobePass user data", () => {
  const popupSource = fs.readFileSync(path.join(ROOT, "popup.js"), "utf8");
  const resolveAuthIdSource = extractFunctionSource(popupSource, "resolveLoginAuthIdValue");
  const resolveUserIdSource = extractFunctionSource(popupSource, "resolveLoginUserIdValue");
  const avatarCandidatesSource = extractFunctionSource(popupSource, "getAvatarCandidates");
  const avatarCacheIdentitySource = extractFunctionSource(popupSource, "getAvatarCacheIdentity");
  const avatarPersistSource = extractFunctionSource(popupSource, "getAvatarPersistIdentityCandidates");
  const persistIdentitySource = extractFunctionSource(popupSource, "hasAvatarPersistProfileIdentity");
  const cmCandidatesSource = extractFunctionSource(popupSource, "collectCmImsUserIdCandidates");
  const cmConsoleCandidatesSource = extractFunctionSource(popupSource, "collectCmConsoleUserIdCandidates");

  assert.doesNotMatch(resolveAuthIdSource, /cmConsoleImsSession/);
  assert.doesNotMatch(resolveAuthIdSource, /experienceCloudImsSession/);
  assert.doesNotMatch(resolveUserIdSource, /loginData\?\.adobePassOrg\?\.userId/);
  assert.doesNotMatch(resolveUserIdSource, /cmConsoleImsSession/);
  assert.doesNotMatch(resolveUserIdSource, /experienceCloudImsSession/);
  assert.doesNotMatch(avatarCandidatesSource, /loginData\?\.adobePassOrg\?\.avatarUrl/);
  assert.doesNotMatch(avatarCacheIdentitySource, /loginData\?\.adobePassOrg\?\.userId/);
  assert.doesNotMatch(avatarPersistSource, /loginData\?\.adobePassOrg\?\.userId/);
  assert.doesNotMatch(persistIdentitySource, /loginData\?\.adobePassOrg\?\.userId/);
  assert.doesNotMatch(cmCandidatesSource, /state\.loginData\?\.adobePassOrg\?\.userId/);
  assert.doesNotMatch(cmCandidatesSource, /experienceCloudImsSession/);
  assert.doesNotMatch(cmConsoleCandidatesSource, /cmConsoleImsSession/);
});

test("auth context no longer treats downstream console shells as authoritative org identity", () => {
  const popupSource = fs.readFileSync(path.join(ROOT, "popup.js"), "utf8");
  const authContextSource = extractFunctionSource(popupSource, "buildLoginAuthContext");
  const descriptorSource = extractFunctionSource(popupSource, "resolveAuthoritativeAdobePassOrgDescriptor");
  const avatarResolveKeySource = extractFunctionSource(popupSource, "makeAvatarResolveKey");
  const avatarRefreshKeySource = extractFunctionSource(popupSource, "getAvatarRefreshSessionKey");

  assert.doesNotMatch(authContextSource, /loginData\?\.experienceCloudImsSession\?\.orgId/);
  assert.doesNotMatch(authContextSource, /loginData\?\.cmConsoleImsSession\?\.orgId/);
  assert.doesNotMatch(authContextSource, /loginData\?\.experienceCloudImsSession\?\.orgName/);
  assert.doesNotMatch(authContextSource, /loginData\?\.cmConsoleImsSession\?\.orgName/);
  assert.doesNotMatch(descriptorSource, /currentSession\?\.experienceCloudImsSession\?\.orgId/);
  assert.doesNotMatch(descriptorSource, /currentSession\?\.cmConsoleImsSession\?\.orgId/);
  assert.doesNotMatch(descriptorSource, /currentSession\?\.experienceCloudImsSession\?\.userId/);
  assert.doesNotMatch(descriptorSource, /currentSession\?\.cmConsoleImsSession\?\.userId/);
  assert.doesNotMatch(descriptorSource, /currentSession\?\.experienceCloudImsSession\?\.orgName/);
  assert.doesNotMatch(descriptorSource, /currentSession\?\.cmConsoleImsSession\?\.orgName/);
  assert.doesNotMatch(avatarResolveKeySource, /loginData\?\.adobePassOrg\?\.avatarUrl/);
  assert.doesNotMatch(avatarRefreshKeySource, /loginData\?\.adobePassOrg\?\.userId/);
});

test("programmer access denial keeps the session authenticated and drops into the org picker surface instead of auto-restarting recovery auth", () => {
  const popupSource = fs.readFileSync(path.join(ROOT, "popup.js"), "utf8");
  const activationSource = extractFunctionSource(popupSource, "activateSession");

  assert.doesNotMatch(activationSource, /attemptInteractiveAdobePassRecovery/);
  assert.doesNotMatch(activationSource, /if \(!enforced\.allowed \|\| !enforced\.loginData\) \{/);
  assert.match(activationSource, /const sessionRequiresOrgSelection = shouldOfferAdobePassRecoveryForSession\(resolvedLoginData\);/);
  assert.match(
    activationSource,
    /phase: sessionRequiresOrgSelection\s*\?\s*"org-selection-required"\s*:\s*shouldHydrateAdobePassWorkflow\s*\?\s*"post-login-hydration"\s*:\s*"ims-session-ready"/
  );
  assert.doesNotMatch(activationSource, /state\.restricted = true;/);
});

test("activation rejects mismatched org-switch results before replacing the current session", () => {
  const popupSource = fs.readFileSync(path.join(ROOT, "popup.js"), "utf8");
  const activationSource = extractFunctionSource(popupSource, "activateSession");
  const verificationHelperSource = extractFunctionSource(popupSource, "isSuccessfulTargetOrganizationVerification");

  assert.match(verificationHelperSource, /status === "verified-match" \|\| status === "derived-match"/);
  assert.match(activationSource, /const targetOrganizationVerification = verifyTargetOrganizationSelection\(/);
  assert.match(activationSource, /resolvedLoginData\.orgVerification = targetOrganizationVerification;/);
  assert.match(
    activationSource,
    /resolvedLoginData\?\.targetOrganization &&\s*shouldOfferAdobePassRecoveryForSession\(resolvedLoginData\) &&\s*!isSuccessfulTargetOrganizationVerification\(targetOrganizationVerification\)/
  );
  assert.match(activationSource, /UnderPAR kept the prior session so it does not misrepresent the selected Adobe profile\./);
  assert.match(activationSource, /phase:\s*"org-verification-mismatch"/);
  assert.match(activationSource, /if \(!shouldHydrateAdobePassWorkflowForSession\(state\.loginData\)\) \{\s*syncAuthenticatedOrgSwitchOnlyContext\(state\.loginData\);/s);
  assert.match(activationSource, /updateRestrictedContext\(state\.loginData,\s*\{\s*recoveryLabel: verificationFailureMessage,/s);
});

test("login auth context and profile completeness no longer fabricate AdobePass identity", () => {
  const popupSource = fs.readFileSync(path.join(ROOT, "popup.js"), "utf8");
  const authContextSource = extractFunctionSource(popupSource, "buildLoginAuthContext");
  const profileCompleteSource = extractFunctionSource(popupSource, "isProfilePayloadComplete");
  const orgDisplaySource = extractFunctionSource(popupSource, "getOrgDisplayName");

  assert.match(authContextSource, /buildRestrictedOrganizationContext\(/);
  assert.match(authContextSource, /const activeOrganization = restrictedOrganizationContext\?\.activeOrganization \|\| null;/);
  assert.doesNotMatch(authContextSource, /loginData\?\.adobePassOrg\?\.orgId/);
  assert.doesNotMatch(authContextSource, /loginData\?\.adobePassOrg\?\.name/);
  assert.doesNotMatch(profileCompleteSource, /ADOBEPASS_ORG_HANDLE/);
  assert.match(orgDisplaySource, /Adobe organization unavailable/);
  assert.doesNotMatch(orgDisplaySource, /ADOBEPASS_ORG_HANDLE/);
});

test("logged-out popup and sidepanel surfaces expose ZIP.KEY import controls", () => {
  const popupHtml = fs.readFileSync(path.join(ROOT, "popup.html"), "utf8");
  const sidepanelHtml = fs.readFileSync(path.join(ROOT, "sidepanel.html"), "utf8");
  const popupCss = fs.readFileSync(path.join(ROOT, "popup.css"), "utf8");
  const popupSource = fs.readFileSync(path.join(ROOT, "popup.js"), "utf8");

  for (const htmlSource of [popupHtml, sidepanelHtml]) {
    assert.match(htmlSource, /id="zip-key-import-view"/);
    assert.match(htmlSource, /id="zip-key-dropzone"/);
    assert.match(htmlSource, /id="zip-key-file-input"/);
    assert.match(htmlSource, /id="zip-key-browse-btn"/);
    assert.match(htmlSource, />LOAD KEY</);
    assert.match(htmlSource, />CHOOSE KEY</);
    assert.match(htmlSource, /id="zip-key-import-state" class="zip-key-import-state" hidden/);
    assert.doesNotMatch(htmlSource, />Drop key\.</);
  }

  assert.match(popupCss, /\.zip-key-import-card\s*\{[\s\S]*width: 100%;[\s\S]*padding: 0;[\s\S]*border: none;[\s\S]*background: none;[\s\S]*box-shadow: none;/);
  assert.match(popupCss, /\.zip-key-dropzone\s*\{[\s\S]*width: 100%;[\s\S]*max-width: none;[\s\S]*min-height: min\(48vh, 320px\);/);
  assert.match(popupCss, /body\.underpar-up-tab \.zip-key-import-view--gate\s*\{[\s\S]*width: 100%;[\s\S]*max-width: 100%;[\s\S]*align-self: stretch;/);
  assert.match(popupSource, /promptForZipKeyImport/);
  assert.match(popupSource, /importZipKeyIntoVaultFromFile/);
});

test("missing-client-id flow renders a standalone ZIP.KEY gate before sign-in", () => {
  const popupHtml = fs.readFileSync(path.join(ROOT, "popup.html"), "utf8");
  const sidepanelHtml = fs.readFileSync(path.join(ROOT, "sidepanel.html"), "utf8");
  const popupSource = fs.readFileSync(path.join(ROOT, "popup.js"), "utf8");
  const shouldShowGateSource = extractFunctionSource(popupSource, "shouldShowZipKeyImportGate");
  const syncZipKeyImportViewSource = extractFunctionSource(popupSource, "syncZipKeyImportView");
  const renderSource = extractFunctionSource(popupSource, "render");

  assert.match(popupHtml, /id="zip-key-import-view" class="zip-key-import-view zip-key-import-view--gate"/);
  assert.match(sidepanelHtml, /id="zip-key-import-view" class="zip-key-import-view zip-key-import-view--gate"/);
  assert.doesNotMatch(popupHtml, /id="zip-key-import-view"[^>]*hidden/);
  assert.doesNotMatch(sidepanelHtml, /id="zip-key-import-view"[^>]*hidden/);
  assert.ok(popupHtml.indexOf('id="zip-key-import-view"') < popupHtml.indexOf('id="sign-in-view"'));
  assert.match(popupHtml, /id="sign-in-view" class="sign-in-view" hidden/);
  assert.match(sidepanelHtml, /id="sign-in-view" class="sign-in-view" hidden/);
  assert.match(popupSource, /function shouldShowZipKeyImportGate\(/);
  assert.match(shouldShowGateSource, /state\.manualZipKeyImportGate === true \|\| !hasConfiguredUnderparImsClientId/);
  assert.match(syncZipKeyImportViewSource, /const show = shouldShowZipKeyImportGate\(\);/);
  assert.match(syncZipKeyImportViewSource, /const explicitStateMessage = String\(state\.zipKeyImportMessage \|\| ""\)\.trim\(\);/);
  assert.match(syncZipKeyImportViewSource, /hasClientId \? READY_ZIP_KEY_IMPORT_STATUS_MESSAGE : ""/);
  assert.match(syncZipKeyImportViewSource, /els\.zipKeyImportState\.hidden = !hasStateMessage;/);
  assert.match(renderSource, /const showZipKeyImportGate = shouldShowZipKeyImportGate\(\);/);
  assert.match(renderSource, /els\.authBtn\.hidden = showZipKeyImportGate;/);
});

test("ZIP.KEY import completion clears the gate without starting Adobe login in the background", () => {
  const popupSource = fs.readFileSync(path.join(ROOT, "popup.js"), "utf8");
  const finalizeSource = extractFunctionSource(popupSource, "finalizeSuccessfulZipKeyImport");
  const fileImportSource = extractFunctionSource(popupSource, "importZipKeyIntoVaultFromFile");
  const textImportSource = extractFunctionSource(popupSource, "importZipKeyIntoVaultFromText");

  assert.match(finalizeSource, /state\.zipKeyImportPending = false;/);
  assert.match(finalizeSource, /state\.manualZipKeyImportGate = false;/);
  assert.doesNotMatch(finalizeSource, /bootstrapSession\("zip-key-import"\)/);
  assert.match(fileImportSource, /return await finalizeSuccessfulZipKeyImport\(result\);/);
  assert.match(textImportSource, /return await finalizeSuccessfulZipKeyImport\(result\);/);
});

test("logged-out workflow reset preserves imported ZIP.KEY IMS config unless the vault is explicitly purged", () => {
  const popupSource = fs.readFileSync(path.join(ROOT, "popup.js"), "utf8");
  const resetSource = extractFunctionSource(popupSource, "resetWorkflowForLoggedOut");
  const signedOutSource = extractFunctionSource(popupSource, "resetToSignedOutState");
  const purgeSource = extractFunctionSource(popupSource, "purgePassVaultFromDevtools");

  assert.match(resetSource, /const preservePassVault = options\?\.preservePassVault !== false;/);
  assert.match(resetSource, /const nextPassVault = preservePassVault/);
  assert.match(resetSource, /const hasZipKeyClientId = hasConfiguredUnderparImsClientId\(nextPassVault\);/);
  assert.match(resetSource, /normalizeUnderparVaultPayload\(state\.passVault \|\| createEmptyUnderparVaultPayload\(\)\)/);
  assert.match(resetSource, /state\.selectedTargetOrganizationKey = "";/);
  assert.match(resetSource, /state\.zipKeyImportPending = false;/);
  assert.match(resetSource, /state\.zipKeyImportDragActive = false;/);
  assert.match(resetSource, /if \(!hasZipKeyClientId\) \{\s*setZipKeyImportFeedback\("",\s*"info"\);\s*\}/);
  assert.match(resetSource, /state\.passVault = nextPassVault;/);
  assert.match(resetSource, /rebuildPassVaultProgrammerStatusIndex\(nextPassVault\);/);
  assert.doesNotMatch(resetSource, /state\.passVault = createEmptyUnderparVaultPayload\(\);/);
  assert.match(signedOutSource, /const preservePassVault = options\.preservePassVault !== false;/);
  assert.match(signedOutSource, /resetWorkflowForLoggedOut\(\{\s*preservePassVault,\s*\}\);/);
  assert.match(purgeSource, /preservePassVault: false,/);
});

test("build label renders immediately from the manifest version with a placeholder fallback", () => {
  const popupSource = fs.readFileSync(path.join(ROOT, "popup.js"), "utf8");
  const popupHtml = fs.readFileSync(path.join(ROOT, "popup.html"), "utf8");
  const sidepanelHtml = fs.readFileSync(path.join(ROOT, "sidepanel.html"), "utf8");
  const bootstrapSource = fs.readFileSync(path.join(ROOT, "build-info-bootstrap.js"), "utf8");
  const renderBuildInfoSource = extractFunctionSource(popupSource, "renderBuildInfo");
  const initSource = extractFunctionSource(popupSource, "init");

  assert.match(popupHtml, /<script src="build-info-bootstrap\.js"><\/script>/);
  assert.match(sidepanelHtml, /<script src="build-info-bootstrap\.js"><\/script>/);
  assert.match(bootstrapSource, /chrome\?\.runtime\?\.getManifest\?\.\(\)\?\.version/);
  assert.match(bootstrapSource, /Version \$\{version\}/);
  assert.match(renderBuildInfoSource, /chrome\?\.\s*runtime\?\.\s*getManifest\?\.\(\)\?\.version/);
  assert.match(renderBuildInfoSource, /Version \$\{manifestVersion\}/);
  assert.match(renderBuildInfoSource, /Version --/);
  assert.match(initSource, /renderBuildInfo\(\);/);
});

test("popup and sidepanel ship the same sparse logged-out sign-in surface after ZIP.KEY import", () => {
  const sidepanelHtml = fs.readFileSync(path.join(ROOT, "sidepanel.html"), "utf8");
  const popupHtml = fs.readFileSync(path.join(ROOT, "popup.html"), "utf8");

  assert.match(sidepanelHtml, /id="sign-in-view"/);
  assert.match(popupHtml, /id="sign-in-view"/);
  assert.match(sidepanelHtml, /id="sign-in-hero-btn"/);
  assert.match(popupHtml, /id="sign-in-hero-btn"/);
  assert.match(sidepanelHtml, />SIGN IN</);
  assert.match(popupHtml, />SIGN IN</);
  assert.doesNotMatch(sidepanelHtml, /id="sign-in-zip-key-btn"/);
  assert.doesNotMatch(popupHtml, /id="sign-in-zip-key-btn"/);
  assert.doesNotMatch(sidepanelHtml, /class="sign-in-view-card"/);
  assert.doesNotMatch(popupHtml, /class="sign-in-view-card"/);
  assert.ok(sidepanelHtml.indexOf('id="zip-key-import-view"') < sidepanelHtml.indexOf('id="sign-in-view"'));
});

test("popup and sidepanel both ship the generic restricted org picker surface", () => {
  const sidepanelHtml = fs.readFileSync(path.join(ROOT, "sidepanel.html"), "utf8");
  const popupHtml = fs.readFileSync(path.join(ROOT, "popup.html"), "utf8");
  const popupSource = fs.readFileSync(path.join(ROOT, "popup.js"), "utf8");
  const renderRestrictedSource = extractFunctionSource(popupSource, "renderRestrictedView");

  for (const htmlSource of [popupHtml, sidepanelHtml]) {
    const restrictedSectionMatch = htmlSource.match(/<section id="restricted-view"[\s\S]*?<\/section>/);
    assert.ok(restrictedSectionMatch, "restricted view section should exist");
    const restrictedSection = restrictedSectionMatch[0];
    assert.match(restrictedSection, /id="restricted-view"/);
    assert.match(restrictedSection, /class="restricted-view-card"/);
    assert.match(restrictedSection, /id="restricted-org-select"/);
    assert.match(restrictedSection, /<label for="restricted-org-select">Adobe Org<\/label>/);
    assert.match(restrictedSection, /Adobe Org/);
    assert.doesNotMatch(restrictedSection, /Choose the Adobe org you want UnderPAR to use for this session\./);
    assert.doesNotMatch(restrictedSection, /Adobe Org Picker/);
    assert.doesNotMatch(restrictedSection, /Adobe Org Profile/);
    assert.doesNotMatch(restrictedSection, /Sign In Again/);
    assert.doesNotMatch(restrictedSection, /Sign Out/);
    assert.doesNotMatch(restrictedSection, /Switch Org/);
    assert.doesNotMatch(restrictedSection, /For @AdobePass only/);
    assert.doesNotMatch(restrictedSection, /restricted-view-title/);
    assert.doesNotMatch(restrictedSection, /restricted-view-copy/);
    assert.doesNotMatch(restrictedSection, /restricted-view-context/);
    assert.doesNotMatch(restrictedSection, /restricted-org-hint/);
  }

  assert.match(renderRestrictedSource, /!els\.restrictedOrgSelect/);
  assert.doesNotMatch(renderRestrictedSource, /restrictedOrgSwitchBtn/);
  assert.doesNotMatch(renderRestrictedSource, /restrictedSignInBtn/);
  assert.doesNotMatch(renderRestrictedSource, /restrictedSignOutBtn/);
  assert.doesNotMatch(renderRestrictedSource, /Auto-switch to @AdobePass is required for access\./);
});

test("restricted org picker change immediately triggers the org-switch auth flow", () => {
  const popupSource = fs.readFileSync(path.join(ROOT, "popup.js"), "utf8");
  const registerHandlersSource = extractFunctionSource(popupSource, "registerEventHandlers");

  assert.match(registerHandlersSource, /const previousSelection = String\(state\.selectedRestrictedOrgKey \|\| ""\);/);
  assert.match(registerHandlersSource, /void onRestrictedOrgSwitch\(\);/);
});

test("sidepanel requestor picker spans the same full workflow width as media company and MVPD", () => {
  const sidepanelHtml = fs.readFileSync(path.join(ROOT, "sidepanel.html"), "utf8");
  const popupCss = fs.readFileSync(path.join(ROOT, "popup.css"), "utf8");

  assert.match(sidepanelHtml, /<div class="field field--requestor">/);
  assert.match(sidepanelHtml, /<div class="picker-action-row requestor-select-row">/);
  assert.match(sidepanelHtml, /class="selector-quick-launch-spacer"/);
  assert.match(popupCss, /\.workflow > \.field--requestor\s*\{\s*grid-column:\s*1 \/ -1;\s*\}/);
  assert.match(
    popupCss,
    /\.selector-quick-launch-spacer\s*\{[\s\S]*?grid-column:\s*2;[\s\S]*?width:\s*32px;[\s\S]*?visibility:\s*hidden;/i
  );
  assert.match(
    popupCss,
    /\.workflow > \.hr-services-container,\s*\.workflow > \.premium-services-container\s*\{[\s\S]*?grid-column:\s*1 \/ -1;[\s\S]*?width:\s*100%;[\s\S]*?min-width:\s*0;/
  );
  assert.match(
    popupCss,
    /\.premium-service-section,\s*\.hr-context-section\s*\{[\s\S]*?width:\s*100%;[\s\S]*?max-width:\s*none;[\s\S]*?min-width:\s*0;[\s\S]*?box-sizing:\s*border-box;/
  );
  assert.match(
    popupCss,
    /\.premium-service-section \.service-box-details,\s*\.hr-context-section \.service-box-details\s*\{[\s\S]*?display:\s*block;[\s\S]*?width:\s*100%;[\s\S]*?min-width:\s*0;/
  );
});

test("health status action pills shrink-wrap their labels like the rest of UnderPAR", () => {
  const popupSource = fs.readFileSync(path.join(ROOT, "popup.js"), "utf8");
  const popupCss = fs.readFileSync(path.join(ROOT, "popup.css"), "utf8");
  const healthStatusSource = extractFunctionSource(popupSource, "buildHrContextHealthStatusItemHtml");

  assert.match(healthStatusSource, />ESM<\/button>/);
  assert.match(healthStatusSource, />SPLUNK<\/button>/);
  assert.match(popupCss, /\.hr-health-action-row\s*\{[\s\S]*?display:\s*inline-flex;[\s\S]*?align-self:\s*flex-start;/);
  assert.match(popupCss, /\.hr-health-action-btn\s*\{[\s\S]*?display:\s*inline-flex;[\s\S]*?flex:\s*0 0 auto;[\s\S]*?white-space:\s*nowrap;/);
});

test("requestor and MVPD selectors ship blank default options instead of placeholder copy", () => {
  const sidepanelHtml = fs.readFileSync(path.join(ROOT, "sidepanel.html"), "utf8");
  const popupHtml = fs.readFileSync(path.join(ROOT, "popup.html"), "utf8");
  const popupSource = fs.readFileSync(path.join(ROOT, "popup.js"), "utf8");

  assert.match(sidepanelHtml, /id="requestor-select" disabled>\s*<option value=""><\/option>/);
  assert.match(sidepanelHtml, /id="mvpd-select" disabled>\s*<option value=""><\/option>/);
  assert.match(popupHtml, /id="requestor-select" disabled>\s*<option value=""><\/option>/);
  assert.match(popupHtml, /id="mvpd-select" disabled>\s*<option value=""><\/option>/);
  assert.match(popupSource, /els\.requestorSelect\.innerHTML = '<option value=""><\/option>';/);
  assert.match(popupSource, /els\.mvpdSelect\.innerHTML = '<option value=""><\/option>';/);
  assert.match(popupSource, /defaultOption\.textContent = "";/);
  assert.doesNotMatch(popupSource, /-- Choose a Content Provider --/);
  assert.doesNotMatch(popupSource, /-- Choose an MVPD --/);
});

test("sidepanel exposes LoginButton-style DEBUG INFO controls backed by popup runtime state", () => {
  const sidepanelHtml = fs.readFileSync(path.join(ROOT, "sidepanel.html"), "utf8");
  const popupSource = fs.readFileSync(path.join(ROOT, "popup.js"), "utf8");
  const renderDebugConsoleSource = extractFunctionSource(popupSource, "renderDebugConsole");
  const copyDebugConsoleSource = extractFunctionSource(popupSource, "copyDebugConsoleToClipboard");
  const composeDebugSource = extractFunctionSource(popupSource, "composeUnderparDebugConsoleOutput");

  assert.match(sidepanelHtml, /id="debugConsole"/);
  assert.match(sidepanelHtml, /id="debugToggleButton"/);
  assert.match(sidepanelHtml, /<body class="underpar-up-tab underpar-sidepanel">/);
  assert.match(
    sidepanelHtml,
    /id="debugToggleButtonLabel" class="spectrum-Detail spectrum-Detail--sizeL debug-toggleTitle">DEBUG INFO</
  );
  assert.match(
    sidepanelHtml,
    /id="debugToggleStatus" class="spectrum-Detail spectrum-Detail--sizeS debug-toggleStatus" hidden>Copied to clipboard</
  );
  assert.match(sidepanelHtml, /id="debugConsoleBody" class="debug-body" hidden/);
  assert.match(sidepanelHtml, /class="spectrum-Textfield spectrum-Textfield--sizeM spectrum-Textfield--multiline is-readOnly debug-field"/);
  assert.match(sidepanelHtml, /class="spectrum-Textfield-input debug-field-input"/);
  assert.match(sidepanelHtml, /Click copies\. Shift\+click toggles details\./);
  assert.match(sidepanelHtml, /id="logOutput"/);
  assert.match(popupSource, /const DEFAULT_DEBUG_TOGGLE_LABEL = "DEBUG INFO"/);
  assert.match(popupSource, /const DEFAULT_DEBUG_TOGGLE_META = "Click copies\. Shift\+click toggles details\.";/);
  assert.match(popupSource, /const DEFAULT_DEBUG_COPY_STATUS = "Copied to clipboard"/);
  assert.match(renderDebugConsoleSource, /Shift-click to expand/);
  assert.match(renderDebugConsoleSource, /Shift-click to collapse/);
  assert.match(copyDebugConsoleSource, /UnderPAR could not copy the debug console to the clipboard\./);
  assert.match(composeDebugSource, /UnderPAR DEBUG INFO/);
  assert.match(composeDebugSource, /"diagnostics"/);
  assert.match(composeDebugSource, /"recent_status"/);
  assert.match(composeDebugSource, /"recent_failures"/);
  assert.match(composeDebugSource, /last_error_status=/);
  assert.match(composeDebugSource, /console_bootstrap=/);
  assert.match(composeDebugSource, /programmers=/);
  assert.match(composeDebugSource, /cm_precheck=/);
  assert.match(composeDebugSource, /"recent_activity"/);
  assert.match(composeDebugSource, /precheck_pending/);
});

test("stored and silent session activation stay tabless unless explicitly allowed", () => {
  const helpers = loadPopupCmActivationHelper();

  assert.equal(helpers.shouldAllowTemporaryCmBootstrapTabForActivation("stored", false), true);
  assert.equal(helpers.shouldAllowTemporaryCmBootstrapTabForActivation("silent-bootstrap:startup", false), false);
  assert.equal(helpers.shouldAllowTemporaryCmBootstrapTabForActivation("interactive", false), false);
  assert.equal(helpers.shouldAllowTemporaryCmBootstrapTabForActivation("manual-refresh", true), true);
});

test("stored session restore persists and reuses hydrated console state before background refresh", () => {
  const popupSource = fs.readFileSync(path.join(ROOT, "popup.js"), "utf8");
  const buildNormalizedSource = extractFunctionSource(popupSource, "buildNormalizedLoginData");
  const buildStoredSource = extractFunctionSource(popupSource, "buildStoredLoginData");
  const loadStoredSource = extractFunctionSource(popupSource, "loadStoredLoginData");
  const restoreStoredSource = extractFunctionSource(popupSource, "restoreStoredAuthenticatedConsoleHydration");
  const persistStoredSource = extractFunctionSource(popupSource, "persistAuthenticatedConsoleHydrationSnapshot");
  const hydrateSource = extractFunctionSource(popupSource, "hydrateAuthenticatedAdobePassSession");
  const activateSource = extractFunctionSource(popupSource, "activateSession");

  assert.match(buildNormalizedSource, /consoleHydration: normalizeStoredConsoleHydrationSnapshot\(loginData\?\.consoleHydration\),/);
  assert.match(buildNormalizedSource, /adobePassOrg: null,/);
  assert.doesNotMatch(buildNormalizedSource, /experienceCloudAccessToken:/);
  assert.doesNotMatch(buildNormalizedSource, /experienceCloudImsSession:/);
  assert.match(buildStoredSource, /const consoleHydration = minimal \? null : compactStoredConsoleHydrationSnapshot\(loginData\?\.consoleHydration\);/);
  assert.match(buildStoredSource, /consoleHydration,/);
  assert.doesNotMatch(buildStoredSource, /experienceCloudAccessToken:/);
  assert.doesNotMatch(buildStoredSource, /cmConsoleAccessToken:/);
  assert.doesNotMatch(buildStoredSource, /adobePassOrg:/);
  assert.match(loadStoredSource, /consoleHydration: normalizeStoredConsoleHydrationSnapshot\(loginData\?\.consoleHydration\),/);
  assert.match(loadStoredSource, /resetBootstrapTokens: true,/);
  assert.doesNotMatch(loadStoredSource, /experienceCloudAccessToken:/);
  assert.doesNotMatch(loadStoredSource, /cmConsoleAccessToken:/);
  assert.match(restoreStoredSource, /if \(!shouldHydrateAdobePassWorkflowForSession\(loginData\)\) \{\s*return false;\s*\}/);
  assert.match(persistStoredSource, /if \(!shouldHydrateAdobePassWorkflowForSession\(state\.loginData\)\) \{\s*return false;\s*\}/);
  assert.match(activateSource, /normalizedSource === "stored" && shouldHydrateAdobePassWorkflow && !sessionRequiresOrgSelection/);
  assert.match(activateSource, /restoreStoredAuthenticatedConsoleHydration\(resolvedLoginData\)/);
  assert.match(activateSource, /const authenticatedOrgPickerOnly = !shouldHydrateAdobePassWorkflow;/);
  assert.match(activateSource, /if \(authenticatedOrgPickerOnly\) \{\s*resolvedLoginData = buildNormalizedLoginData\(/s);
  assert.match(activateSource, /resetBootstrapTokens: true,/);
  assert.match(activateSource, /const allowBackgroundTemporaryPageContextTab = restoredAuthenticatedConsoleHydration/);
  assert.match(activateSource, /preserveExistingOnFailure: restoredAuthenticatedConsoleHydration/);
  assert.match(hydrateSource, /const preserveExistingOnFailure = options\.preserveExistingOnFailure === true;/);
  assert.match(hydrateSource, /await persistAuthenticatedConsoleHydrationSnapshot\(\)\.catch/);
  assert.match(hydrateSource, /if \(!\(preserveExistingOnFailure \|\| normalizedSource === "stored"\)\)/);
});

test("CM precheck reset clears stale pending state before background bootstrap begins", () => {
  const helpers = loadPopupCmPrecheckResetHelper();

  helpers.resetCmTenantsPrecheckState();
  const stateSnapshot = helpers.getStateSnapshot();

  assert.equal(stateSnapshot.cmTenantsPrecheckPromise, null);
  assert.equal(stateSnapshot.cmTenantsPrecheckPending, false);
  assert.equal(stateSnapshot.cmTenantsPrecheckComplete, false);
  assert.equal(stateSnapshot.cmTenantsPrecheckLastError, "");
  assert.equal(stateSnapshot.cmTenantsCatalog, null);
  assert.equal(stateSnapshot.cmTenantsCatalogPromise, null);
  assert.equal(stateSnapshot.cmTenantsCatalogHydrated, false);
  assert.equal(stateSnapshot.cmTenantsCatalogHydrationPromise, null);
  assert.equal(stateSnapshot.cmTenantsCatalogRuntimeFresh, false);
  assert.equal(stateSnapshot.cmTenantsCatalogFetchAttempted, false);
  assert.equal(helpers.getSyncCalls(), 1);
});

test("media company select availability stays disabled for IMS-only org-switch sessions and re-enables only for AdobePASS-ready sessions", () => {
  const popupSource = fs.readFileSync(path.join(ROOT, "popup.js"), "utf8");
  const applySessionSource = extractFunctionSource(popupSource, "applyActiveLoginSession");
  const helpers = loadPopupMediaCompanyAvailabilityHelper();

  helpers.setState({
    sessionReady: false,
    loginData: null,
    restricted: false,
  });
  helpers.syncMediaCompanySelectAvailability();
  assert.equal(helpers.getSelect().disabled, true);

  helpers.setState({
    sessionReady: true,
    loginData: { accessToken: "token" },
    restricted: false,
  });
  helpers.syncMediaCompanySelectAvailability();
  assert.equal(helpers.getSelect().disabled, true);

  helpers.setState({
    sessionReady: true,
    loginData: { accessToken: "token", activeAdobePass: true },
    restricted: false,
  });
  helpers.syncMediaCompanySelectAvailability();
  assert.equal(helpers.getSelect().disabled, false);
  assert.match(
    applySessionSource,
    /state\.sessionReady = true;[\s\S]*syncMediaCompanySelectAvailability\(\);/
  );
});

test("workspace identity helpers treat cleared programmer context as a real change", () => {
  const esmHelpers = loadWorkspaceProgrammerIdentityHelper("esm-workspace.js");
  const cmHelpers = loadWorkspaceProgrammerIdentityHelper("cm-workspace.js");

  for (const helpers of [esmHelpers, cmHelpers]) {
    assert.equal(helpers.hasProgrammerIdentityChanged("Turner", "Turner", "", ""), true);
    assert.equal(helpers.hasProgrammerIdentityChanged("", "", "ABC", "ABC"), true);
    assert.equal(helpers.hasProgrammerIdentityChanged("ABC", "ABC", "ABC", "ABC"), false);
    assert.equal(helpers.hasProgrammerIdentityChanged("ABC", "", "", "ABC"), false);
  }
});

test("CM tenant background prefetch is guarded by the shared precheck promise instead of a stale pending flag", () => {
  const popupSource = fs.readFileSync(path.join(ROOT, "popup.js"), "utf8");
  const prefetchSource = extractFunctionSource(popupSource, "prefetchCmTenantsCatalogInBackground");
  const precheckSource = extractFunctionSource(popupSource, "ensureCmTenantsPrecheckForActiveSession");
  const hydrateSource = extractFunctionSource(popupSource, "hydrateAuthenticatedAdobePassSession");

  assert.match(prefetchSource, /state\.cmTenantsCatalogPromise \|\| state\.cmTenantsPrecheckPromise/);
  assert.match(precheckSource, /if \(!forceRefresh && state\.cmTenantsPrecheckPromise\)/);
  assert.match(precheckSource, /state\.cmTenantsPrecheckPromise = precheckPromise/);
  assert.match(precheckSource, /const effectiveAllowTemporaryPageContextTab = allowTemporaryPageContextTab;/);
  assert.doesNotMatch(precheckSource, /releaseRetainedAuthPopupContext/);
  assert.doesNotMatch(precheckSource, /maybeReleaseRetainedAuthPopupBootstrapContext/);
  assert.doesNotMatch(precheckSource, /getRetainedAuthPopupBootstrapTabId/);
  assert.match(
    hydrateSource,
    /allowTemporaryPageContextTab:\s*allowBackgroundTemporaryPageContextTab/
  );
});

test("applying the active session preserves a hydrated cm-console-ui bearer instead of clearing CM qualification", () => {
  const popupSource = fs.readFileSync(path.join(ROOT, "popup.js"), "utf8");
  const applySource = extractFunctionSource(popupSource, "applyActiveLoginSession");

  assert.match(applySource, /const normalizedCmConsoleAccessToken = normalizeBearerTokenValue/);
  assert.match(applySource, /state\.cmConsoleBootstrapQualified =[\s\S]*tokenSupportsCmConsoleRequests/);
  assert.doesNotMatch(applySource, /state\.cmConsoleBootstrapQualified = false;/);
});

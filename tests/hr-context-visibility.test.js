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
    "const state = globalThis.__seed.state || { programmerWorkspaceHydrationReadyByKey: new Map() };",
    "function getActiveAdobePassEnvironmentKey() { return globalThis.__seed.environmentKey || DEFAULT_ADOBEPASS_ENVIRONMENT.key; }",
    extractFunctionSource(source, "getEnvironmentScopedProgrammerKey"),
    extractFunctionSource(source, "getProgrammerWorkspaceHydrationReadyKey"),
    extractFunctionSource(source, "isProgrammerWorkspaceHydrationReady"),
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
    extractFunctionSource(source, "buildRestV2InteractiveDocsUrl"),
    extractFunctionSource(source, "buildRestV2InteractiveDocsHydrationPlan"),
    "module.exports = { buildRestV2InteractiveDocsHydrationPlan };",
  ].join("\n\n");
  const context = {
    module: { exports: {} },
    exports: {},
    navigator: { userAgent: "UnderPAR test" },
  };
  vm.runInNewContext(script, context, { filename: filePath });
  return context.module.exports;
}

function loadRestV2LearningEntryOpener(seed = {}) {
  const filePath = path.join(ROOT, "popup.js");
  const source = fs.readFileSync(filePath, "utf8");
  const script = [
    'const PREMIUM_SERVICE_DOCUMENTATION_URL_BY_KEY = { restV2: "https://developer.adobe.com/adobe-pass/api/rest_api_v2/interactive/" };',
    "const __calls = globalThis.__seed.calls;",
    "const __statuses = globalThis.__seed.statuses;",
    "function setStatus(message, type) { __statuses.push({ message: String(message || ''), type: String(type || '') }); }",
    "function getRestV2InteractiveDocsEntry() { return globalThis.__seed.entry; }",
    "function resolveSelectedProgrammer() { return globalThis.__seed.programmer || null; }",
    "function buildRestV2InteractiveDocsContext() { return globalThis.__seed.context; }",
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
  };
  const { shouldRevealHrContextSections } = loadHrVisibilityHelpers({
    state,
    environmentKey: "production",
  });

  assert.equal(shouldRevealHrContextSections({ programmerId: "fox" }, { restV2: { appName: "REST V2" } }), true);
  assert.equal(shouldRevealHrContextSections({ programmerId: "fox" }, { esm: { guid: "esm-guid" } }), true);
  assert.equal(shouldRevealHrContextSections({ programmerId: "fox" }, { cm: { matchedTenants: [{ id: "cm-tenant" }] } }), true);
  assert.equal(shouldRevealHrContextSections({ programmerId: "fox" }, {}), false);
  assert.equal(shouldRevealHrContextSections({ programmerId: "fox" }, { cm: { matchedTenants: [] } }), false);
  assert.equal(shouldRevealHrContextSections({ programmerId: "fox" }, []), false);
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
  assert.match(wireHrContextSectionActionsSource, /openRestV2InteractiveDocsEntry/);
  assert.match(wireHrContextSectionActionsSource, /openPremiumServiceDocumentation/);
  assert.match(createPremiumServiceSectionSource, /applyServiceBoxSectionShell\(section,\s*\{/);
  assert.match(createHrContextSectionSource, /applyServiceBoxSectionShell\(section,\s*\{/);
  assert.match(createHrContextSectionSource, /wireHrContextSectionActions\(section\)/);
  assert.match(createHrContextSectionSource, /setHrContextSectionCollapsed\(programmer\?\.programmerId, sectionKey, collapsed\)/);
  assert.doesNotMatch(createHrContextSectionSource, /useNativeDetailsToggle:\s*true/);
  assert.match(buildHrSectionsRenderSignatureSource, /state\.selectedRequestorId/);
  assert.match(buildHrSectionsRenderSignatureSource, /state\.selectedMvpdId/);
  assert.match(renderHrSectionsSource, /els\.hrServicesContainer\.dataset\.renderSignature/);
  assert.match(renderHrSectionsSource, /buildHrSectionsRenderSignature\(programmer, services, options\)/);
  assert.match(popupSource, /els\.premiumServicesContainer\.addEventListener\("click", \(event\) => \{/);
  assert.match(popupSource, /els\.premiumServicesContainer\.addEventListener\("keydown", \(event\) => \{/);
  assert.match(popupSource, /els\.hrServicesContainer\.addEventListener\("click", \(event\) => \{/);
  assert.match(popupSource, /els\.hrServicesContainer\.addEventListener\("keydown", \(event\) => \{/);
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
  const popupSource = fs.readFileSync(path.join(ROOT, "popup.js"), "utf8");
  const popupCss = fs.readFileSync(path.join(ROOT, "popup.css"), "utf8");
  const buildRestV2InteractiveDocsContextSource = extractFunctionSource(popupSource, "buildRestV2InteractiveDocsContext");
  const resolveRestV2LearningRequestorContextSource = extractFunctionSource(popupSource, "resolveRestV2LearningRequestorContext");
  const openRestV2InteractiveDocsEntrySource = extractFunctionSource(popupSource, "openRestV2InteractiveDocsEntry");
  const runRestV2InteractiveDocsHydratorSource = extractFunctionSource(popupSource, "runRestV2InteractiveDocsHydrator");

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
  assert.match(buildRestV2InteractiveDocsContextSource, /resolveRestV2AppForServiceProvider/);
  assert.match(buildRestV2InteractiveDocsContextSource, /Select a Content Provider first\./);
  assert.doesNotMatch(buildRestV2InteractiveDocsContextSource, /REST_V2_REDIRECT_CANDIDATES/);
  assert.doesNotMatch(buildRestV2InteractiveDocsContextSource, /REST_V2_DEFAULT_DOMAIN/);
  assert.doesNotMatch(buildRestV2InteractiveDocsContextSource, /getFirstCachedMvpdIdForRequestor/);
  assert.match(resolveRestV2LearningRequestorContextSource, /candidates\.length === 1/);
  assert.doesNotMatch(resolveRestV2LearningRequestorContextSource, /requestorId:\s*programmerId/);
  assert.match(popupSource, /data-restv2-doc-entry-key/);
  assert.match(popupSource, /REST API V2 Interactive Docs/);
  assert.match(popupSource, /getRestV2InteractiveDocsSections/);
  assert.match(openRestV2InteractiveDocsEntrySource, /ensureDcrAccessTokenWithServiceRecovery/);
  assert.match(openRestV2InteractiveDocsEntrySource, /prepareRestV2InteractiveDocsContextForEntry/);
  assert.match(openRestV2InteractiveDocsEntrySource, /buildRestV2InteractiveDocsContext\(resolveSelectedProgrammer\(\), entry\)/);
  assert.match(openRestV2InteractiveDocsEntrySource, /entry\.requiresAccessToken !== false/);
  assert.match(openRestV2InteractiveDocsEntrySource, /const openPartialDocs = async \(message, type = "info"\) => \{/);
  assert.match(openRestV2InteractiveDocsEntrySource, /Opened \$\{entry\.label\} docs without full UnderPAR context\./);
  assert.match(openRestV2InteractiveDocsEntrySource, /openPremiumServiceDocumentation\("restV2"/);
  assert.match(openRestV2InteractiveDocsEntrySource, /waitForTabCompletion/);
  assert.match(openRestV2InteractiveDocsEntrySource, /hydrateRestV2InteractiveDocsTab/);
  assert.match(runRestV2InteractiveDocsHydratorSource, /document\.getElementById\(`operation\/\$\{operationId\}`\)/);
  assert.match(runRestV2InteractiveDocsHydratorSource, /\[data-cy="try-it"\]/);
  assert.match(runRestV2InteractiveDocsHydratorSource, /\[data-cy="send-button"\]/);
  assert.match(runRestV2InteractiveDocsHydratorSource, /"resend"/);
  assert.match(runRestV2InteractiveDocsHydratorSource, /element\?\.CodeMirror/);
  assert.match(runRestV2InteractiveDocsHydratorSource, /CodeMirror\.setValue/);
  assert.match(runRestV2InteractiveDocsHydratorSource, /formatEditorBodyValue/);
  assert.match(runRestV2InteractiveDocsHydratorSource, /normalizedFieldName === "body\.SAMLResponse"/);
  assert.match(runRestV2InteractiveDocsHydratorSource, /normalizedFieldName === "body\.resources"/);
  assert.match(runRestV2InteractiveDocsHydratorSource, /querySelector\("textarea"\)/);
  assert.match(popupCss, /\.hr-rest-v2-doc-entry/);
  assert.match(popupCss, /\.hr-rest-v2-docs-grid/);
  assert.match(popupCss, /\.hr-rest-v2-doc-section/);
  assert.match(popupCss, /\.hr-rest-v2-doc-section-grid/);
  assert.match(
    popupSource,
    /const docsItemHtml = restV2DocsPanelHtml \? "" : buildMetadataItemHtml\("Docs", `HOWTO: \$\{howtoSubject\} quick docs coming soon\.\.\.`\);/
  );
});

test("REST V2 learning entries still open the customer docs when requestor context is missing", async () => {
  const calls = [];
  const statuses = [];
  const { openRestV2InteractiveDocsEntry } = loadRestV2LearningEntryOpener({
    calls,
    statuses,
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
  assert.match(String(statuses[0]?.message || ""), /Opened Service Provider Configuration docs without full UnderPAR context\./);
  assert.match(String(statuses[0]?.message || ""), /Select a Content Provider first\./);
});

test("REST V2 learning hydration plans honor the selected customer-doc operation contracts", () => {
  const { buildRestV2InteractiveDocsHydrationPlan } = loadRestV2LearningPlanBuilder();
  const accessToken = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.payload.signature";
  const toArray = (value) => Array.from(value || []);
  const baseContext = {
    serviceProviderId: "turner-requestor",
    requestorId: "turner-requestor",
    requestorAutoResolved: false,
    sessionCode: "session-code-123",
    mvpd: "Comcast_SSO",
    resourceIds: ["urn:resource:turner"],
    redirectUrl: "https://experience.example.test/callback",
    domainName: "experience.example.test",
    partner: "Roku",
    partnerFrameworkStatus: "none",
    samlResponse: "PHNhbWxwOlJlc3BvbnNlPg==",
    samlSource: "tab-network:body",
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
  assert.equal(configurationPlan.fieldValues["path.serviceProvider"], "turner-requestor");
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
  assert.equal(createSessionPlan.fieldValues["body.domainName"], "experience.example.test");
  assert.equal(createSessionPlan.fieldValues["body.redirectUrl"], "https://experience.example.test/callback");
  assert.equal(Object.prototype.hasOwnProperty.call(createSessionPlan.fieldValues, "body.mvpd"), false);
  assert.deepEqual(toArray(createSessionPlan.missingRequiredFields), []);

  const resumeSessionPlan = buildRestV2InteractiveDocsHydrationPlan(
    {
      key: "sessions-resume-session",
      operationId: "resumeSessionUsingPOST",
      operationAnchor: "operation/resumeSessionUsingPOST",
      requiresAccessToken: true,
      contentType: "application/x-www-form-urlencoded",
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
  assert.equal(resumeSessionPlan.fieldValues["body.redirectUrl"], "https://experience.example.test/callback");

  const sessionStatusPlan = buildRestV2InteractiveDocsHydrationPlan(
    {
      key: "sessions-session-status",
      operationId: "getSessionStatusUsingGET_1",
      operationAnchor: "operation/getSessionStatusUsingGET_1",
      requiresAccessToken: true,
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
      usesPartnerFrameworkStatus: true,
    },
    baseContext,
    accessToken
  );
  assert.equal(profilesPlan.fieldValues["header.AP-Device-Identifier"], "device-123");
  assert.equal(profilesPlan.fieldValues["header.X-Device-Info"], "device-info-123");
  assert.equal(profilesPlan.fieldValues["header.AP-Partner-Framework-Status"], "none");
  assert.deepEqual(toArray(profilesPlan.requiredFields), ["path.serviceProvider", "header.Authorization"]);

  const profilesByMvpdPlan = buildRestV2InteractiveDocsHydrationPlan(
    {
      key: "profiles-by-mvpd",
      operationId: "getProfileForMvpdUsingGET",
      operationAnchor: "operation/getProfileForMvpdUsingGET",
      requiresAccessToken: true,
      usesDeviceHeaders: true,
      usesMvpdPath: true,
      requireMvpdPath: true,
      usesPartnerFrameworkStatus: true,
    },
    baseContext,
    accessToken
  );
  assert.equal(profilesByMvpdPlan.fieldValues["path.mvpd"], "Comcast_SSO");
  assert.equal(profilesByMvpdPlan.fieldValues["header.AP-Device-Identifier"], "device-123");

  const authorizePlan = buildRestV2InteractiveDocsHydrationPlan(
    {
      key: "decisions-authorize",
      operationId: "retrieveAuthorizeDecisionsForMvpdUsingPOST",
      operationAnchor: "operation/retrieveAuthorizeDecisionsForMvpdUsingPOST",
      requiresAccessToken: true,
      usesDeviceHeaders: true,
      usesMvpdPath: true,
      requireMvpdPath: true,
      usesBodyResources: true,
      requireBodyResources: true,
      usesPartnerFrameworkStatus: true,
      contentType: "application/json",
    },
    baseContext,
    accessToken
  );
  assert.equal(authorizePlan.fieldValues["path.mvpd"], "Comcast_SSO");
  assert.equal(authorizePlan.fieldValues["header.Content-Type"], "application/json");
  assert.deepEqual(toArray(authorizePlan.fieldValues["body.resources"]), ["urn:resource:turner"]);

  const decisionsPlan = buildRestV2InteractiveDocsHydrationPlan(
    {
      key: "decisions-preauthorize",
      operationId: "retrievePreAuthorizeDecisionsForMvpdUsingPOST_1",
      operationAnchor: "operation/retrievePreAuthorizeDecisionsForMvpdUsingPOST_1",
      requiresAccessToken: true,
      usesDeviceHeaders: true,
      usesMvpdPath: true,
      requireMvpdPath: true,
      usesBodyResources: true,
      requireBodyResources: true,
      usesPartnerFrameworkStatus: true,
      contentType: "application/json",
    },
    baseContext,
    accessToken
  );
  assert.equal(decisionsPlan.fieldValues["path.mvpd"], "Comcast_SSO");
  assert.equal(decisionsPlan.fieldValues["header.Content-Type"], "application/json");
  assert.deepEqual(toArray(decisionsPlan.fieldValues["body.resources"]), ["urn:resource:turner"]);
  assert.deepEqual(toArray(decisionsPlan.missingRequiredFields), []);

  const logoutPlan = buildRestV2InteractiveDocsHydrationPlan(
    {
      key: "logout-by-mvpd",
      operationId: "getLogoutForMvpdUsingGET",
      operationAnchor: "operation/getLogoutForMvpdUsingGET",
      requiresAccessToken: true,
      usesDeviceHeaders: true,
      usesMvpdPath: true,
      requireMvpdPath: true,
      usesQueryRedirectUrl: true,
    },
    baseContext,
    accessToken
  );
  assert.equal(logoutPlan.fieldValues["path.mvpd"], "Comcast_SSO");
  assert.equal(logoutPlan.fieldValues["query.redirectUrl"], "https://experience.example.test/callback");

  const partnerProfilePlan = buildRestV2InteractiveDocsHydrationPlan(
    {
      key: "partner-sso-create-profile",
      operationId: "createPartnerProfileUsingPOST",
      operationAnchor: "operation/createPartnerProfileUsingPOST",
      requiresAccessToken: true,
      usesDeviceHeaders: true,
      usesPartnerPath: true,
      requirePartnerPath: true,
      usesPartnerFrameworkStatus: true,
      usesBodySamlResponse: true,
      requireBodySamlResponse: true,
      contentType: "application/x-www-form-urlencoded",
    },
    baseContext,
    accessToken
  );
  assert.equal(partnerProfilePlan.fieldValues["path.partner"], "Roku");
  assert.equal(partnerProfilePlan.fieldValues["body.SAMLResponse"], "PHNhbWxwOlJlc3BvbnNlPg==");
  assert.equal(partnerProfilePlan.fieldValues["header.AP-Device-Identifier"], "device-123");
  assert.match(String(partnerProfilePlan.notes[0] || ""), /SAMLResponse captured from/);

  const partnerSsoPlan = buildRestV2InteractiveDocsHydrationPlan(
    {
      key: "partner-sso-verification-token",
      operationId: "retrieveVerificationTokenUsingPOST",
      operationAnchor: "operation/retrieveVerificationTokenUsingPOST",
      requiresAccessToken: true,
      usesDeviceHeaders: true,
      usesPartnerPath: true,
      requirePartnerPath: true,
      usesPartnerFrameworkStatus: true,
      usesBodyDomainName: true,
      requireBodyDomainName: true,
      usesBodyRedirectUrl: true,
      requireBodyRedirectUrl: true,
      contentType: "application/x-www-form-urlencoded",
    },
    baseContext,
    accessToken
  );
  assert.equal(partnerSsoPlan.fieldValues["path.partner"], "Roku");
  assert.equal(partnerSsoPlan.fieldValues["body.domainName"], "experience.example.test");
  assert.equal(partnerSsoPlan.fieldValues["body.redirectUrl"], "https://experience.example.test/callback");
  assert.deepEqual(toArray(partnerSsoPlan.requiredFields).sort(), [
    "body.domainName",
    "body.redirectUrl",
    "header.Authorization",
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
      usesBodySamlResponse: true,
      requireBodySamlResponse: true,
      contentType: "application/x-www-form-urlencoded",
    },
    { ...baseContext, partner: "", samlResponse: "" },
    accessToken
  );
  assert.deepEqual(toArray(missingDynamicContextPlan.missingRequiredFields).sort(), ["body.SAMLResponse", "path.partner"].sort());
  assert.match(missingDynamicContextPlan.notes.join(" "), /Partner SSO/);
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

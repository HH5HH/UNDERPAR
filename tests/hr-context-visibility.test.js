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
    'const REST_V2_INTERACTIVE_DEFAULT_RESOURCE_IDS = Object.freeze(["sample-resource-id"]);',
    'const REST_V2_INTERACTIVE_DEFAULT_PARTNER = "Apple";',
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

  assert.match(sidepanelHtml, /id="hr-services-container"\s+class="hr-services-container"\s+hidden/);
  assert.match(popupSource, /topDivider\.className = "hr-context-divider"/);
  assert.match(popupSource, /bottomDivider\.className = "hr-context-divider"/);
  assert.doesNotMatch(popupSource, /hr-context-divider-label/);
  assert.doesNotMatch(popupSource, />HR</);
  assert.doesNotMatch(popupSource, /textContent = "- HR -"/);
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

test("REST V2 learning card exposes six interactive doc hydrators backed by the customer docs", () => {
  const popupSource = fs.readFileSync(path.join(ROOT, "popup.js"), "utf8");
  const popupCss = fs.readFileSync(path.join(ROOT, "popup.css"), "utf8");
  const buildRestV2InteractiveDocsContextSource = extractFunctionSource(popupSource, "buildRestV2InteractiveDocsContext");
  const resolveRestV2LearningRequestorContextSource = extractFunctionSource(popupSource, "resolveRestV2LearningRequestorContext");
  const openRestV2InteractiveDocsEntrySource = extractFunctionSource(popupSource, "openRestV2InteractiveDocsEntry");
  const runRestV2InteractiveDocsHydratorSource = extractFunctionSource(popupSource, "runRestV2InteractiveDocsHydrator");

  assert.match(popupSource, /const REST_V2_INTERACTIVE_DOC_ENTRIES = Object\.freeze\(\[/);
  assert.match(popupSource, /label: "Configuration"/);
  assert.match(popupSource, /label: "Sessions"/);
  assert.match(popupSource, /label: "Profiles"/);
  assert.match(popupSource, /label: "Decisions"/);
  assert.match(popupSource, /label: "Logout"/);
  assert.match(popupSource, /label: "Partner Single Sign-On"/);
  assert.match(popupSource, /operationId: "handleRequestUsingGET"/);
  assert.match(popupSource, /operationId: "createSessionUsingPOST"/);
  assert.match(popupSource, /operationId: "getProfilesUsingGET_1"/);
  assert.match(popupSource, /operationId: "retrievePreAuthorizeDecisionsForMvpdUsingPOST_1"/);
  assert.match(popupSource, /operationId: "getLogoutForMvpdUsingGET"/);
  assert.match(popupSource, /operationId: "retrieveVerificationTokenUsingPOST"/);
  assert.match(buildRestV2InteractiveDocsContextSource, /resolveRestV2LearningRequestorContext/);
  assert.match(buildRestV2InteractiveDocsContextSource, /Select a Content Provider first\./);
  assert.doesNotMatch(buildRestV2InteractiveDocsContextSource, /String\(state\.selectedRequestorId \|\| ""\)\.trim\(\),\s*programmerId/);
  assert.match(resolveRestV2LearningRequestorContextSource, /candidates\.length === 1/);
  assert.doesNotMatch(resolveRestV2LearningRequestorContextSource, /requestorId:\s*programmerId/);
  assert.match(popupSource, /data-restv2-doc-entry-key/);
  assert.match(popupSource, /REST API V2 Interactive Docs/);
  assert.match(openRestV2InteractiveDocsEntrySource, /ensureDcrAccessTokenWithServiceRecovery/);
  assert.match(openRestV2InteractiveDocsEntrySource, /openPremiumServiceDocumentation\("restV2"/);
  assert.match(openRestV2InteractiveDocsEntrySource, /waitForTabCompletion/);
  assert.match(openRestV2InteractiveDocsEntrySource, /hydrateRestV2InteractiveDocsTab/);
  assert.match(runRestV2InteractiveDocsHydratorSource, /document\.getElementById\(`operation\/\$\{operationId\}`\)/);
  assert.match(runRestV2InteractiveDocsHydratorSource, /\[data-cy="try-it"\]/);
  assert.match(runRestV2InteractiveDocsHydratorSource, /querySelector\("textarea"\)/);
  assert.match(popupCss, /\.hr-rest-v2-doc-entry/);
  assert.match(popupCss, /\.hr-rest-v2-docs-grid/);
  assert.match(
    popupSource,
    /const docsItemHtml = restV2DocsPanelHtml \? "" : buildMetadataItemHtml\("Docs", `HOWTO: \$\{howtoSubject\} quick docs coming soon\.\.\.`\);/
  );
});

test("REST V2 learning hydration plans honor the selected customer-doc operation contracts", () => {
  const { buildRestV2InteractiveDocsHydrationPlan } = loadRestV2LearningPlanBuilder();
  const accessToken = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.payload.signature";
  const toArray = (value) => Array.from(value || []);
  const baseContext = {
    serviceProviderId: "turner-requestor",
    requestorId: "turner-requestor",
    requestorAutoResolved: false,
    mvpd: "Comcast_SSO",
    resourceIds: ["urn:resource:turner"],
    redirectUrl: "https://experience.example.test/callback",
    domainName: "experience.example.test",
    partner: "Roku",
    partnerFrameworkStatus: "none",
  };

  const configurationPlan = buildRestV2InteractiveDocsHydrationPlan(
    { key: "configuration", operationId: "handleRequestUsingGET", operationAnchor: "operation/handleRequestUsingGET" },
    baseContext,
    accessToken
  );
  assert.deepEqual(toArray(configurationPlan.requiredFields), ["path.serviceProvider", "header.Authorization"]);
  assert.equal(configurationPlan.fieldValues["path.serviceProvider"], "turner-requestor");
  assert.equal(configurationPlan.fieldValues["header.Authorization"], `Bearer ${accessToken}`);
  assert.equal(configurationPlan.fieldValues["header.Accept"], "application/json");
  assert.equal(configurationPlan.fieldValues["header.AP-Device-Identifier"], "device-123");
  assert.equal(configurationPlan.fieldValues["header.X-Device-Info"], "device-info-123");

  const sessionsPlan = buildRestV2InteractiveDocsHydrationPlan(
    { key: "sessions", operationId: "createSessionUsingPOST", operationAnchor: "operation/createSessionUsingPOST" },
    { ...baseContext, mvpd: "" },
    accessToken
  );
  assert.deepEqual(toArray(sessionsPlan.requiredFields), ["path.serviceProvider", "header.Authorization"]);
  assert.equal(sessionsPlan.fieldValues["header.Content-Type"], "application/x-www-form-urlencoded");
  assert.equal(sessionsPlan.fieldValues["body.domainName"], "experience.example.test");
  assert.equal(sessionsPlan.fieldValues["body.redirectUrl"], "https://experience.example.test/callback");
  assert.equal(Object.prototype.hasOwnProperty.call(sessionsPlan.fieldValues, "body.mvpd"), false);
  assert.deepEqual(toArray(sessionsPlan.missingRequiredFields), []);

  const profilesPlan = buildRestV2InteractiveDocsHydrationPlan(
    { key: "profiles", operationId: "getProfilesUsingGET_1", operationAnchor: "operation/getProfilesUsingGET_1" },
    baseContext,
    accessToken
  );
  assert.equal(profilesPlan.fieldValues["header.AP-Partner-Framework-Status"], "none");
  assert.deepEqual(toArray(profilesPlan.requiredFields), ["path.serviceProvider", "header.Authorization"]);

  const decisionsPlan = buildRestV2InteractiveDocsHydrationPlan(
    {
      key: "decisions",
      operationId: "retrievePreAuthorizeDecisionsForMvpdUsingPOST_1",
      operationAnchor: "operation/retrievePreAuthorizeDecisionsForMvpdUsingPOST_1",
    },
    baseContext,
    accessToken
  );
  assert.equal(decisionsPlan.fieldValues["path.mvpd"], "Comcast_SSO");
  assert.equal(decisionsPlan.fieldValues["header.Content-Type"], "application/json");
  assert.deepEqual(toArray(decisionsPlan.fieldValues["body.resources"]), ["urn:resource:turner"]);
  assert.deepEqual(toArray(decisionsPlan.missingRequiredFields), []);

  const logoutPlan = buildRestV2InteractiveDocsHydrationPlan(
    { key: "logout", operationId: "getLogoutForMvpdUsingGET", operationAnchor: "operation/getLogoutForMvpdUsingGET" },
    baseContext,
    accessToken
  );
  assert.equal(logoutPlan.fieldValues["path.mvpd"], "Comcast_SSO");
  assert.equal(logoutPlan.fieldValues["query.redirectUrl"], "https://experience.example.test/callback");

  const partnerSsoPlan = buildRestV2InteractiveDocsHydrationPlan(
    {
      key: "partnerSso",
      operationId: "retrieveVerificationTokenUsingPOST",
      operationAnchor: "operation/retrieveVerificationTokenUsingPOST",
    },
    baseContext,
    accessToken
  );
  assert.equal(partnerSsoPlan.fieldValues["path.partner"], "Roku");
  assert.equal(partnerSsoPlan.fieldValues["body.domainName"], "experience.example.test");
  assert.equal(partnerSsoPlan.fieldValues["body.redirectUrl"], "https://experience.example.test/callback");
  assert.deepEqual(toArray(partnerSsoPlan.requiredFields), [
    "path.serviceProvider",
    "header.Authorization",
    "path.partner",
    "body.domainName",
    "body.redirectUrl",
  ]);
  assert.deepEqual(toArray(partnerSsoPlan.missingRequiredFields), []);
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

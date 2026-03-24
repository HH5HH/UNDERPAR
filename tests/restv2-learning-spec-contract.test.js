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
    extractFunctionSource(source, "buildRestV2InteractiveDocsUrl"),
    extractFunctionSource(source, "buildRestV2InteractiveDocsHydrationPlan"),
    "module.exports = { buildRestV2InteractiveDocsHydrationPlan };",
  ].join("\n\n");
  const context = {
    module: { exports: {} },
    exports: {},
    navigator: { userAgent: "UnderPAR spec contract test" },
  };
  vm.runInNewContext(script, context, { filename: POPUP_PATH });
  return context.module.exports.buildRestV2InteractiveDocsHydrationPlan;
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
  const sampleContext = {
    serviceProviderId: "turner",
    requestorId: "turner",
    requestorAutoResolved: false,
    sessionCode: "sample-session-code",
    mvpd: "Comcast_SSO",
    resourceIds: ["urn:adobe:test-resource"],
    redirectUrl: "https://experience.example.test/callback",
    domainName: "experience.example.test",
    partner: "Roku",
    partnerFrameworkStatus: "none",
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

    const codeParam = getParameter(specMeta.parameters, "code", "path");
    assert.equal(entry.usesSessionCode === true, Boolean(codeParam), `${entry.operationId} code-path usage drifted`);
    assert.equal(entry.requireSessionCode === true, Boolean(codeParam?.required), `${entry.operationId} code-path requirement drifted`);

    const mvpdParam = getParameter(specMeta.parameters, "mvpd", "path");
    assert.equal(entry.usesMvpdPath === true, Boolean(mvpdParam), `${entry.operationId} mvpd-path usage drifted`);
    assert.equal(entry.requireMvpdPath === true, Boolean(mvpdParam?.required), `${entry.operationId} mvpd-path requirement drifted`);

    const partnerParam = getParameter(specMeta.parameters, "partner", "path");
    assert.equal(entry.usesPartnerPath === true, Boolean(partnerParam), `${entry.operationId} partner-path usage drifted`);
    assert.equal(entry.requirePartnerPath === true, Boolean(partnerParam?.required), `${entry.operationId} partner-path requirement drifted`);

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
  }
});

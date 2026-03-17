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

function extractLastFunctionSource(source, functionName) {
  const markers = [`async function ${functionName}(`, `function ${functionName}(`];
  let start = -1;
  for (const marker of markers) {
    const candidate = source.lastIndexOf(marker);
    if (candidate > start) {
      start = candidate;
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

function loadAuthHelpers(seed = {}) {
  const filePath = path.join(ROOT, "popup.js");
  const source = fs.readFileSync(filePath, "utf8");
  const script = [
    "const state = globalThis.__seed.state || {};",
    "const getPreferredPrimaryImsAccessTokenCandidate = globalThis.__seed.getPreferredPrimaryImsAccessTokenCandidate || (() => '');",
    extractFunctionSource(source, "parseJsonText"),
    extractFunctionSource(source, "decodeBase64UrlText"),
    extractLastFunctionSource(source, "parseJwtPayload"),
    extractFunctionSource(source, "coercePositiveNumber"),
    extractFunctionSource(source, "firstNonEmptyString"),
    extractFunctionSource(source, "resolveLoginProfile"),
    extractFunctionSource(source, "getProfileDisplayNameRaw"),
    extractFunctionSource(source, "getProfileDisplayName"),
    extractFunctionSource(source, "getProfileEmail"),
    extractFunctionSource(source, "getProfileIdentity"),
    extractFunctionSource(source, "resolveLoginAuthIdValue"),
    extractFunctionSource(source, "resolveLoginUserIdValue"),
    extractFunctionSource(source, "resolveLoginDisplayNameValue"),
    extractFunctionSource(source, "buildLoginAuthContext"),
    extractFunctionSource(source, "getLoginAuthId"),
    extractFunctionSource(source, "getLoginEmail"),
    extractFunctionSource(source, "getLoginIdentity"),
    extractFunctionSource(source, "getLoginPrincipalId"),
    extractFunctionSource(source, "getLoginDisplayName"),
    extractFunctionSource(source, "isProfileDisplayNamePlaceholder"),
    extractFunctionSource(source, "getSessionProfileCompleteness"),
    extractFunctionSource(source, "collectCmImsUserIdCandidates"),
    "module.exports = { buildLoginAuthContext, getLoginAuthId, getLoginEmail, getLoginIdentity, getLoginPrincipalId, getLoginDisplayName, getSessionProfileCompleteness, collectCmImsUserIdCandidates };",
  ].join("\n\n");
  const context = {
    module: { exports: {} },
    exports: {},
    __seed: seed,
    atob: (value) => Buffer.from(String(value || ""), "base64").toString("utf8"),
  };
  vm.runInNewContext(script, context, { filename: filePath });
  return context.module.exports;
}

function toBase64Url(value) {
  return Buffer.from(String(value || ""), "utf8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function buildJwt(payload = {}) {
  return `header.${toBase64Url(JSON.stringify(payload))}.signature`;
}

test("session completeness accepts IMS auth identifiers when profile email fields are absent", () => {
  const helpers = loadAuthHelpers({
    state: {},
    getPreferredPrimaryImsAccessTokenCandidate: () => "",
  });

  const loginData = {
    profile: {
      displayName: "Bishwajit Choudhary",
    },
    imsSession: {
      userId: "FC74713E66B412C20A495FE9@7ad01f61631c04d0495ef7.e",
      authId: "F10A3319554D1E107F000101@adobe.com",
    },
    sessionKeys: {
      userId: "FC74713E66B412C20A495FE9@7ad01f61631c04d0495ef7.e",
      authId: "F10A3319554D1E107F000101@adobe.com",
    },
    adobePassOrg: {
      orgId: "@adobepass",
      name: "@AdobePass",
    },
  };

  const result = helpers.getSessionProfileCompleteness(loginData);

  assert.equal(result.complete, true);
  assert.equal(result.email, "F10A3319554D1E107F000101@adobe.com");
  assert.equal(result.userId, "FC74713E66B412C20A495FE9@7ad01f61631c04d0495ef7.e");
  assert.equal(result.missing.length, 0);
});

test("session completeness accepts authId-only principal without profile name or IMS user id", () => {
  const helpers = loadAuthHelpers({
    state: {},
    getPreferredPrimaryImsAccessTokenCandidate: () => "",
  });

  const loginData = {
    profile: {},
    imsSession: {
      authId: "F10A3319554D1E107F000101@adobe.com",
      sessionId: "ims-session-1",
    },
    sessionKeys: {
      authId: "F10A3319554D1E107F000101@adobe.com",
      sessionId: "ims-session-1",
    },
    adobePassOrg: {
      orgId: "@adobepass",
      name: "@AdobePass",
    },
  };

  const result = helpers.getSessionProfileCompleteness(loginData);

  assert.equal(result.complete, true);
  assert.equal(result.principalId, "F10A3319554D1E107F000101@adobe.com");
  assert.equal(result.authId, "F10A3319554D1E107F000101@adobe.com");
  assert.equal(result.userId, "");
  assert.equal(result.displayName, "F10A3319554D1E107F000101@adobe.com");
  assert.equal(result.missing.length, 0);
});

test("CM IMS user-id candidates prefer Adobe auth identifiers before internal IMS ids", () => {
  const primaryToken = buildJwt({
    user_id: "FC74713E66B412C20A495FE9@7ad01f61631c04d0495ef7.e",
    aa_id: "F10A3319554D1E107F000101@adobe.com",
  });
  const helpers = loadAuthHelpers({
    state: {
      loginData: {
        profile: {
          displayName: "Bishwajit Choudhary",
        },
        imsSession: {
          userId: "FC74713E66B412C20A495FE9@7ad01f61631c04d0495ef7.e",
          authId: "F10A3319554D1E107F000101@adobe.com",
        },
        sessionKeys: {
          userId: "FC74713E66B412C20A495FE9@7ad01f61631c04d0495ef7.e",
          authId: "F10A3319554D1E107F000101@adobe.com",
        },
      },
    },
    getPreferredPrimaryImsAccessTokenCandidate: () => primaryToken,
  });

  const seedToken = buildJwt({
    user_id: "FC74713E66B412C20A495FE9@7ad01f61631c04d0495ef7.e",
    aa_id: "F10A3319554D1E107F000101@adobe.com",
  });
  const candidates = helpers.collectCmImsUserIdCandidates(seedToken);

  assert.equal(candidates[0], "F10A3319554D1E107F000101@adobe.com");
  assert.ok(candidates.includes("FC74713E66B412C20A495FE9@7ad01f61631c04d0495ef7.e"));
  assert.ok(
    candidates.indexOf("F10A3319554D1E107F000101@adobe.com") <
      candidates.indexOf("FC74713E66B412C20A495FE9@7ad01f61631c04d0495ef7.e")
  );
});

test("login auth context prefers authId as principal and keeps org/session identifiers", () => {
  const helpers = loadAuthHelpers({
    state: {},
    getPreferredPrimaryImsAccessTokenCandidate: () => "",
  });

  const loginData = {
    profile: {
      displayName: "Bishwajit Choudhary",
    },
    imsSession: {
      userId: "FC74713E66B412C20A495FE9@7ad01f61631c04d0495ef7.e",
      authId: "F10A3319554D1E107F000101@adobe.com",
      sessionId: "ims-session-123",
      tokenId: "ims-token-456",
      clientId: "AdobePass1",
      scope: "openid,AdobeID",
    },
    sessionKeys: {
      accessTokenFingerprint: "fingerprint-123",
    },
    adobePassOrg: {
      orgId: "@adobepass",
      name: "@AdobePass",
    },
    expiresAt: 1770000000000,
  };

  const authContext = helpers.buildLoginAuthContext(loginData);

  assert.equal(authContext.principalId, "F10A3319554D1E107F000101@adobe.com");
  assert.equal(authContext.authId, "F10A3319554D1E107F000101@adobe.com");
  assert.equal(authContext.userId, "FC74713E66B412C20A495FE9@7ad01f61631c04d0495ef7.e");
  assert.equal(authContext.displayName, "Bishwajit Choudhary");
  assert.equal(authContext.orgId, "@adobepass");
  assert.equal(authContext.orgName, "@AdobePass");
  assert.equal(authContext.sessionId, "ims-session-123");
  assert.equal(authContext.tokenId, "ims-token-456");
  assert.equal(authContext.clientId, "AdobePass1");
  assert.equal(authContext.scope, "openid,AdobeID");
  assert.equal(authContext.expiresAt, 1770000000000);
  assert.equal(authContext.accessTokenFingerprint, "fingerprint-123");
});

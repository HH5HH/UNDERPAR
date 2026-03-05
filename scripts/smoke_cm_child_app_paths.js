#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const repoRoot = path.resolve(__dirname, "..");
const popupPath = path.resolve(repoRoot, "popup.js");
const popupLines = fs.readFileSync(popupPath, "utf8").split("\n");

function parseArgs(argv) {
  let harPath = "";
  for (let i = 2; i < argv.length; i += 1) {
    const arg = String(argv[i] || "").trim();
    if (arg === "--har") {
      harPath = String(argv[i + 1] || "").trim();
      i += 1;
      continue;
    }
    if (arg === "--help" || arg === "-h") {
      printUsageAndExit(0);
    }
    throw new Error(`Unknown argument: ${arg}`);
  }
  return { harPath };
}

function printUsageAndExit(code = 0) {
  const usage = [
    "Usage:",
    "  node scripts/smoke_cm_child_app_paths.js [--har /absolute/path/to/ViewCMApplication.har]",
    "",
    "Notes:",
    "  - Runs local smoke checks against popup.js CM child-application code paths.",
    "  - If --har is omitted, synthetic payload fixtures are used.",
  ].join("\n");
  console.log(usage);
  process.exit(code);
}

function extractBetween(startToken, endToken) {
  const startIndex = popupLines.findIndex((line) => line.includes(startToken));
  if (startIndex < 0) {
    throw new Error(`Unable to locate start token: ${startToken}`);
  }
  const endIndex = popupLines.findIndex((line, index) => index > startIndex && line.includes(endToken));
  if (endIndex < 0) {
    throw new Error(`Unable to locate end token after ${startToken}: ${endToken}`);
  }
  return popupLines.slice(startIndex, endIndex).join("\n");
}

function buildPopupSandbox() {
  const extractedCode = [
    "const CM_CONFIG_BASE_URL = \"https://config.adobeprimetime.com\";",
    extractBetween("function truncateDebugText(", "function parseJsonText("),
    extractBetween("function firstNonEmptyString(", "function getProfileDisplayName("),
    extractBetween("function uniqueSorted(", "function populateMediaCompanySelect("),
    extractBetween("function normalizeCmUrl(", "function isAllowedCmRequestUrl("),
    extractBetween("function collectCmUrlsFromValue(", "function collectCmCollections("),
    extractBetween("function collectCmNameCandidates(", "function extractCmTenantIdFromUrl("),
    extractBetween("function normalizeCmEntityRecord(", "function normalizeCmTenantsFromPayload("),
    extractBetween("function cmIsApplicationsListRequestUrl(", "function cmResolveUsageTenantScope("),
    extractBetween("function cmBuildRecordId(", "function getCmProfileHarvestForProgrammer("),
    extractBetween("function cmBuildWorkspaceRecordsFromBundles(", "function cmFormatRecordKindLabel("),
    extractBetween("const CM_ROW_FLATTEN_MAX_DEPTH =", "function cmNormalizeCsvCellValue("),
  ].join("\n\n");

  const sandbox = {
    console,
    URL,
    encodeURIComponent,
    decodeURIComponent,
    generateRequestId: () => "smoke-id",
  };
  vm.runInNewContext(extractedCode, sandbox, { filename: "popup.cm.child.smoke.extract.js" });
  return sandbox;
}

function loadFixtureFromHar(harPath) {
  const resolvedHarPath = path.resolve(String(harPath || "").trim());
  const raw = fs.readFileSync(resolvedHarPath, "utf8");
  const har = JSON.parse(raw);
  const entries = Array.isArray(har?.log?.entries) ? har.log.entries : [];
  const detailGet = entries.find(
    (entry) =>
      String(entry?.request?.method || "").toUpperCase() === "GET" &&
      /\/maitai\/applications\/[^/?#]+/i.test(String(entry?.request?.url || ""))
  );
  if (!detailGet) {
    throw new Error(`No CM application detail GET entry found in HAR: ${resolvedHarPath}`);
  }
  const detailUrl = String(detailGet?.request?.url || "").trim();
  const detailPayload = JSON.parse(String(detailGet?.response?.content?.text || "{}"));
  const appId = String(detailPayload?.id || "").trim();
  const tenantId = String(detailPayload?.ownerId || "").trim();
  if (!appId || !tenantId) {
    throw new Error(`HAR detail payload missing id/ownerId: ${resolvedHarPath}`);
  }
  return {
    source: resolvedHarPath,
    appId,
    tenantId,
    detailUrl,
    detailPayload,
  };
}

function loadSyntheticFixture() {
  const appId = "866eb5e7-5e4e-41bb-8496-996725eac1e4";
  const tenantId = "NBA";
  const detailPayload = {
    ownerId: "NBA",
    id: appId,
    name: "NBA - Xbox",
    policies: [
      {
        policyOwnerId: "NBA",
        policyId: "nba-default-policy",
        version: 1,
      },
    ],
    attributes: {
      platform: "Xbox",
    },
    sessionFormatId: null,
    legacy: false,
  };
  return {
    source: "synthetic-fixture",
    appId,
    tenantId,
    detailUrl: `https://config.adobeprimetime.com/maitai/applications/${appId}?orgId=${tenantId}`,
    detailPayload,
  };
}

function assertAndCollect(results, label, condition, details = "") {
  if (!condition) {
    throw new Error(`${label} FAILED${details ? `: ${details}` : ""}`);
  }
  results.push(`${label} PASS`);
}

function runSmokeChecks(sandbox, fixture) {
  const results = [];
  const appId = String(fixture.appId || "").trim();
  const tenantId = String(fixture.tenantId || "").trim();
  const detailPayload = fixture.detailPayload;
  const expectedDetailUrl = `https://config.adobeprimetime.com/maitai/applications/${encodeURIComponent(appId)}?orgId=${encodeURIComponent(tenantId)}`;
  const listUrl = `https://config.adobeprimetime.com/maitai/applications?orgId=${encodeURIComponent(tenantId)}`;
  const policyUrl = `https://config.adobeprimetime.com/maitai/policy/nba-default-policy?orgId=${encodeURIComponent(tenantId)}`;

  assertAndCollect(
    results,
    "cmIsApplicationDetailRequestUrl detects application detail path",
    sandbox.cmIsApplicationDetailRequestUrl(fixture.detailUrl) === true,
    fixture.detailUrl
  );
  assertAndCollect(
    results,
    "cmIsApplicationsListRequestUrl detects list path",
    sandbox.cmIsApplicationsListRequestUrl(listUrl) === true,
    listUrl
  );

  const fromList = sandbox.cmResolveApplicationDetailUrl(
    {
      kind: "applications",
      tenantId,
      payload: detailPayload,
    },
    listUrl
  );
  assertAndCollect(results, "cmResolveApplicationDetailUrl(list) -> applications/{id}", fromList === expectedDetailUrl, fromList);

  const fromPolicy = sandbox.cmResolveApplicationDetailUrl(
    {
      kind: "applications",
      tenantId,
      payload: detailPayload,
    },
    policyUrl
  );
  assertAndCollect(results, "cmResolveApplicationDetailUrl(policy) still -> applications/{id}", fromPolicy === expectedDetailUrl, fromPolicy);

  const fromListWithoutId = sandbox.cmResolveApplicationDetailUrl(
    {
      kind: "applications",
      tenantId,
      payload: {
        name: "No Id",
      },
    },
    listUrl
  );
  assertAndCollect(
    results,
    "cmResolveApplicationDetailUrl strips list URL when child id is unavailable",
    fromListWithoutId === "",
    fromListWithoutId
  );

  const fromListWithOwnerIdOnly = sandbox.cmResolveApplicationDetailUrl(
    {
      kind: "applications",
      payload: {
        id: appId,
        ownerId: tenantId,
      },
    },
    listUrl
  );
  assertAndCollect(
    results,
    "cmResolveApplicationDetailUrl derives tenantId from payload.ownerId",
    fromListWithOwnerIdOnly === expectedDetailUrl,
    fromListWithOwnerIdOnly
  );

  const cmFallbackRecord = sandbox.cmBuildFallbackRecordFromCard(
    null,
    {
      cardId: "cm-fallback-card",
      zoomKey: "APPLICATIONS",
      requestUrl: listUrl,
      payload: { id: appId, name: String(detailPayload?.name || "App") },
    },
    {
      tenantIdCandidates: [tenantId],
      tenantNameCandidates: [tenantId],
    }
  );
  assertAndCollect(
    results,
    "Fallback card builder infers applications kind for CM run-card path",
    String(cmFallbackRecord?.kind || "") === "applications",
    JSON.stringify(cmFallbackRecord || {})
  );
  assertAndCollect(
    results,
    "Fallback card builder carries applicationId from payload",
    String(cmFallbackRecord?.applicationId || "") === appId,
    JSON.stringify(cmFallbackRecord || {})
  );
  const cmFallbackResolvedUrl = sandbox.cmResolveApplicationDetailUrl(cmFallbackRecord, cmFallbackRecord?.requestUrl || "");
  assertAndCollect(
    results,
    "CM fallback record resolves to applications/{id} detail URL",
    cmFallbackResolvedUrl === expectedDetailUrl,
    cmFallbackResolvedUrl
  );

  const entityFallbackRecord = sandbox.cmBuildFallbackRecordFromCard(
    null,
    {
      cardId: "cm-entity-fallback-card",
      zoomKey: "APPLICATIONS",
      requestUrl: listUrl,
      entityId: appId,
      payload: { ownerId: tenantId },
    },
    {
      tenantIdCandidates: [],
      tenantNameCandidates: [],
    }
  );
  assertAndCollect(
    results,
    "Fallback card builder accepts entityId as applicationId",
    String(entityFallbackRecord?.applicationId || "") === appId,
    JSON.stringify(entityFallbackRecord || {})
  );
  assertAndCollect(
    results,
    "Fallback card builder derives tenantId from payload owner metadata",
    String(entityFallbackRecord?.tenantId || "") === tenantId,
    JSON.stringify(entityFallbackRecord || {})
  );
  const entityFallbackResolvedUrl = sandbox.cmResolveApplicationDetailUrl(
    entityFallbackRecord,
    entityFallbackRecord?.requestUrl || ""
  );
  assertAndCollect(
    results,
    "Entity fallback record resolves to applications/{id} detail URL",
    entityFallbackResolvedUrl === expectedDetailUrl,
    entityFallbackResolvedUrl
  );

  const mvpdFallbackRecord = sandbox.cmBuildFallbackRecordFromCard(
    null,
    {
      cardId: "mvpd-fallback-card",
      zoomKey: "APPLICATIONS",
      requestUrl: "https://config.adobeprimetime.com/maitai/applications?orgId=XFINITY",
      payload: { id: appId, name: "MVPD App" },
    },
    {
      tenantIdCandidates: ["XFINITY"],
      tenantNameCandidates: ["XFINITY"],
    }
  );
  const mvpdFallbackResolvedUrl = sandbox.cmResolveApplicationDetailUrl(
    mvpdFallbackRecord,
    mvpdFallbackRecord?.requestUrl || ""
  );
  assertAndCollect(
    results,
    "MVPD fallback record resolves to applications/{id} detail URL",
    mvpdFallbackResolvedUrl === `https://config.adobeprimetime.com/maitai/applications/${encodeURIComponent(appId)}?orgId=XFINITY`,
    mvpdFallbackResolvedUrl
  );

  const mvpdResolved = sandbox.cmResolveApplicationDetailUrl(
    {
      kind: "applications",
      tenantId: "XFINITY",
      payload: {
        id: appId,
      },
    },
    "https://config.adobeprimetime.com/maitai/applications?orgId=XFINITY"
  );
  assertAndCollect(
    results,
    "MVPD context uses same child detail path format",
    mvpdResolved === `https://config.adobeprimetime.com/maitai/applications/${encodeURIComponent(appId)}?orgId=XFINITY`,
    mvpdResolved
  );

  const normalizedEntity = sandbox.normalizeCmEntityRecord(
    "applications",
    {
      id: appId,
      name: String(detailPayload?.name || "App"),
      policies: detailPayload?.policies,
      attributes: detailPayload?.attributes,
    },
    0,
    {
      tenantId,
      tenantName: tenantId,
    },
    listUrl
  );
  assertAndCollect(
    results,
    "normalizeCmEntityRecord captures applicationId from id",
    String(normalizedEntity?.applicationId || "") === appId,
    JSON.stringify(normalizedEntity || {})
  );
  assertAndCollect(
    results,
    "normalizeCmEntityRecord injects applications/{id} detail link",
    Array.isArray(normalizedEntity?.links) && normalizedEntity.links.includes(expectedDetailUrl),
    JSON.stringify(normalizedEntity?.links || [])
  );

  const bundleRecords = sandbox.cmBuildWorkspaceRecordsFromBundles([
    {
      tenant: {
        tenantId,
        tenantName: tenantId,
        raw: {},
      },
      tenantDetail: {
        payload: {},
        url: "https://config.adobeprimetime.com/core/tenants?orgId=adobe",
        lastModified: "",
      },
      applications: {
        url: listUrl,
        lastModified: "",
        rows: [
          {
            entityId: appId,
            name: String(detailPayload?.name || "App"),
            applicationId: appId,
            links: [listUrl],
            raw: detailPayload,
          },
        ],
      },
      policies: {
        url: `https://config.adobeprimetime.com/maitai/policy?orgId=${encodeURIComponent(tenantId)}`,
        lastModified: "",
        rows: [],
      },
      usage: {
        url: "",
        lastModified: "",
        rows: [],
      },
    },
  ]);
  const bundleApplicationRecord = bundleRecords.find((record) => String(record?.kind || "").toLowerCase() === "applications");
  assertAndCollect(
    results,
    "cmBuildWorkspaceRecordsFromBundles assigns child application detail requestUrl",
    String(bundleApplicationRecord?.requestUrl || "") === expectedDetailUrl,
    String(bundleApplicationRecord?.requestUrl || "")
  );

  const detailRows = sandbox.cmRowsFromPayloadForRecord(
    detailPayload,
    {
      kind: "applications",
      tenantId,
    },
    expectedDetailUrl
  );
  assertAndCollect(
    results,
    "cmRowsFromPayloadForRecord(detail) renders single application detail row",
    Array.isArray(detailRows) && detailRows.length === 1
  );
  const detailRow = detailRows[0] || {};
  assertAndCollect(results, "Detail row includes id", String(detailRow.id || "") === appId, JSON.stringify(detailRow));
  assertAndCollect(
    results,
    "Detail row flattens attributes.platform",
    String(detailRow["attributes.platform"] || "") === "Xbox",
    JSON.stringify(detailRow)
  );
  assertAndCollect(
    results,
    "Detail row flattens policies.policyId",
    String(detailRow["policies.policyId"] || "").includes("nba-default-policy"),
    JSON.stringify(detailRow)
  );

  const listRows = sandbox.cmRowsFromPayloadForRecord(
    {
      applications: [
        { id: "a1", name: "App One" },
        { id: "a2", name: "App Two" },
      ],
    },
    {
      kind: "applications",
      tenantId,
    },
    listUrl
  );
  assertAndCollect(
    results,
    "cmRowsFromPayloadForRecord(list) keeps list behavior",
    Array.isArray(listRows) && listRows.length === 2,
    JSON.stringify(listRows)
  );

  return results;
}

function main() {
  const args = parseArgs(process.argv);
  const sandbox = buildPopupSandbox();
  const fixture = args.harPath ? loadFixtureFromHar(args.harPath) : loadSyntheticFixture();
  const results = runSmokeChecks(sandbox, fixture);

  console.log("CM child application smoke checks: PASS");
  console.log(`Fixture source: ${fixture.source}`);
  results.forEach((line) => console.log(`- ${line}`));
  console.log(`TOTAL: ${results.length} checks passed`);
}

try {
  main();
} catch (error) {
  console.error("CM child application smoke checks: FAIL");
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}

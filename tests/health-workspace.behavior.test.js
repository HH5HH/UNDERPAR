const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const ROOT = path.resolve(__dirname, "..");

function read(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), "utf8");
}

function extractFunctionSource(source, functionName) {
  const signature = `function ${functionName}`;
  const start = source.indexOf(signature);
  assert.notEqual(start, -1, `Unable to find ${functionName}`);
  const signatureEnd = source.indexOf(")", start);
  assert.notEqual(signatureEnd, -1, `Unable to find closing paren for ${functionName}`);
  const braceStart = source.indexOf("{", signatureEnd);
  assert.notEqual(braceStart, -1, `Unable to find opening brace for ${functionName}`);
  let depth = 0;
  for (let index = braceStart; index < source.length; index += 1) {
    const character = source[index];
    if (character === "{") {
      depth += 1;
    } else if (character === "}") {
      depth -= 1;
      if (depth === 0) {
        return source.slice(start, index + 1);
      }
    }
  }
  throw new Error(`Unable to find closing brace for ${functionName}`);
}

test("health workspace source parses as valid JavaScript", () => {
  const source = read("health-workspace.js");
  const absolutePath = path.join(ROOT, "health-workspace.js");
  assert.doesNotThrow(() => new vm.Script(source, { filename: absolutePath }));
});

test("health workspace disables ESM xref without ESM and keeps result cards data-first", () => {
  const popupSource = read("popup.js");
  const workspaceSource = read("health-workspace.js");
  const applyControllerStateSource = extractFunctionSource(workspaceSource, "applyControllerState");

  assert.match(popupSource, /esmAvailable:\s*premiumContext\?\.esmAvailable === true,/);
  assert.match(workspaceSource, /const nextEsmAvailable = payload\?\.esmAvailable === true;/);
  assert.match(workspaceSource, /state\.esmAvailable = nextEsmAvailable;/);
  assert.match(workspaceSource, /const unavailable = state\.esmAvailable !== true;/);
  assert.match(workspaceSource, /setStatus\("ESM xref is unavailable for the selected ENV x Media Company\."\);/);
  assert.match(workspaceSource, /data-health-table-export="csv"/);
  assert.doesNotMatch(workspaceSource, /<details class="health-report-query">/);
  assert.doesNotMatch(workspaceSource, /health-report-bridge-query/);
  assert.doesNotMatch(workspaceSource, /<strong>SID:<\/strong>/);
  assert.match(applyControllerStateSource, /const controllerChanged =/);
  assert.match(applyControllerStateSource, /const esmAvailabilityChanged = nextEsmAvailable !== previousEsmAvailable;/);
  assert.match(applyControllerStateSource, /if \(controllerChanged \|\| esmAvailabilityChanged\) \{\s*renderReport\(\);/);
});

test("health workspace CSV helpers export visible table rows with UnderPAR file names", () => {
  const workspaceSource = read("health-workspace.js");
  const script = `${workspaceSource}
state.environmentLabel = "Release Production";
state.environmentKey = "prod";
state.programmerName = "Turner Media";
state.programmerId = "turner";
state.requestorId = "MML";
module.exports = { buildCsvCell, buildTableCsvContent, buildHealthTableCsvFileName };`;

  function createStubElement() {
    return {
      textContent: "",
      innerHTML: "",
      hidden: false,
      disabled: false,
      dataset: {},
      classList: {
        toggle() {},
        add() {},
        remove() {},
      },
      setAttribute() {},
      addEventListener() {},
      appendChild() {},
      remove() {},
      click() {},
    };
  }

  const context = {
    module: { exports: {} },
    exports: {},
    document: {
      getElementById() {
        return createStubElement();
      },
      createElement() {
        return createStubElement();
      },
      body: {
        classList: {
          toggle() {},
        },
        setAttribute() {},
        appendChild() {},
      },
    },
    chrome: {
      runtime: {
        sendMessage: async () => ({ ok: true }),
        onMessage: {
          addListener() {},
        },
      },
      windows: {
        getCurrent: async () => ({ id: 1 }),
      },
    },
    window: {
      setTimeout() {},
    },
    URL: {
      createObjectURL() {
        return "blob:test";
      },
      revokeObjectURL() {},
    },
    Date,
    Map,
    Blob,
  };
  vm.runInNewContext(script, context, { filename: path.join(ROOT, "health-workspace.js") });

  const { buildCsvCell, buildTableCsvContent, buildHealthTableCsvFileName } = context.module.exports;
  assert.equal(buildCsvCell('a"b'), '"a""b"');
  assert.equal(
    buildTableCsvContent(
      ["requestor-id", "count"],
      [
        { "requestor-id": "MML", count: 7 },
        { "requestor-id": "TNT", count: 3 },
      ]
    ),
    '"requestor-id","count"\r\n"MML","7"\r\n"TNT","3"'
  );

  const fileName = buildHealthTableCsvFileName(
    {
      key: "sev2_mvpd_error_codes",
      title: "Sev2 MVPD Error Codes",
      checkedAt: Date.UTC(2026, 2, 30, 18, 5, 6),
    },
    {
      kind: "esm-bridge",
      tableKey: "sev2_mvpd_error_codes",
    }
  );
  assert.match(fileName, /^underpar_health_esm-bridge_Release_Production_Turner_Media_MML_sev2_mvpd_error_codes_2026-03-30T18-05-06-000Z\.csv$/);
});

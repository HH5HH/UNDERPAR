const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const ROOT = path.resolve(__dirname, "..");
const FILE_PATH = path.join(ROOT, "esm-health-workspace.js");

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

function loadBannerTitleResolver(state = {}) {
  const source = fs.readFileSync(FILE_PATH, "utf8");
  const script = [
    extractFunctionSource(source, "firstNonEmptyString"),
    extractFunctionSource(source, "getControllerBannerTitle"),
    "module.exports = { getControllerBannerTitle };",
  ].join("\n\n");
  const context = {
    module: { exports: {} },
    exports: {},
    state,
  };
  vm.runInNewContext(script, context, { filename: FILE_PATH });
  return context.module.exports.getControllerBannerTitle;
}

test("ESM health header title includes the selected ENV x Media Company label", () => {
  const getControllerBannerTitle = loadBannerTitleResolver({
    environmentLabel: "Release Production",
    programmerName: "Turner",
    programmerId: "Turner",
  });

  assert.equal(getControllerBannerTitle(), "ESM HEALTH Dashboard | Release Production x Turner");
});

test("ESM health header title falls back gracefully when controller context is not hydrated yet", () => {
  const getControllerBannerTitle = loadBannerTitleResolver({
    environmentLabel: "",
    programmerName: "",
    programmerId: "",
  });

  assert.equal(getControllerBannerTitle(), "ESM HEALTH Dashboard");
});

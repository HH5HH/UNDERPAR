const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const ROOT = path.resolve(__dirname, "..");

function assertParses(relativePath) {
  const absolutePath = path.join(ROOT, relativePath);
  const source = fs.readFileSync(absolutePath, "utf8");
  assert.doesNotThrow(() => new vm.Script(source, { filename: absolutePath }));
}

test("popup runtime source parses as valid JavaScript", () => {
  assertParses("popup.js");
});

test("vault store helper source parses as valid JavaScript", () => {
  assertParses("underpar-vault-store.js");
});

test("background runtime source parses as valid JavaScript", () => {
  assertParses("background.js");
});

test("registered application health workspace source parses as valid JavaScript", () => {
  assertParses("registered-application-health-workspace.js");
});

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const ROOT = path.resolve(__dirname, "..");
const HARPO_PATH = path.join(ROOT, "harpo.js");

function extractFunctionSource(source, functionName) {
  const markers = [`async function ${functionName}(`, `function ${functionName}(`];
  let start = -1;
  for (const marker of markers) {
    start = source.indexOf(marker);
    if (start !== -1) break;
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
  let stringQuote = "";
  let templateDepth = 0;
  let inLineComment = false;
  let inBlockComment = false;
  for (let index = bodyStart; index < source.length; index += 1) {
    const char = source[index];
    const next = source[index + 1];
    const previous = source[index - 1];
    if (inLineComment) {
      if (char === "\n") inLineComment = false;
      continue;
    }
    if (inBlockComment) {
      if (previous === "*" && char === "/") inBlockComment = false;
      continue;
    }
    if (!stringQuote && char === "/" && next === "/") {
      inLineComment = true;
      index += 1;
      continue;
    }
    if (!stringQuote && char === "/" && next === "*") {
      inBlockComment = true;
      index += 1;
      continue;
    }
    if (stringQuote) {
      if (stringQuote === "`" && char === "$" && next === "{") {
        templateDepth += 1;
        index += 1;
        continue;
      }
      if (char === stringQuote && previous !== "\\") {
        if (stringQuote !== "`" || templateDepth === 0) {
          stringQuote = "";
        }
      }
      if (stringQuote === "`" && char === "}" && templateDepth > 0) {
        templateDepth -= 1;
      }
      continue;
    }
    if (char === "'" || char === "\"" || char === "`") {
      stringQuote = char;
      templateDepth = 0;
      continue;
    }
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

function loadHarpoCodeGenerationFns() {
  const source = fs.readFileSync(HARPO_PATH, "utf8");
  const script = [
    extractFunctionSource(source, "indexHeaders"),
    extractFunctionSource(source, "getHeaderValue"),
    extractFunctionSource(source, "normalizeContentType"),
    extractFunctionSource(source, "isUrlEncodedContentType"),
    extractFunctionSource(source, "filterHarpoReplayHeaders"),
    extractFunctionSource(source, "escapeHarpoShellArgument"),
    extractFunctionSource(source, "buildHarpoReplayBodySpec"),
    extractFunctionSource(source, "getHarpoReplayHeaders"),
    extractFunctionSource(source, "buildHarpoShellCommand"),
    extractFunctionSource(source, "buildHarpoCurlBodySegments"),
    extractFunctionSource(source, "buildHarpoCurlSnippet"),
    extractFunctionSource(source, "buildHarpoTerminalSnippet"),
    `function escHtml(str) {
      return String(str || "")
        .replace(/&/g, "&amp;").replace(/</g, "&lt;")
        .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
    }`,
    extractFunctionSource(source, "buildHarpoCodeGenerationMarkup"),
    "module.exports = { buildHarpoCurlSnippet, buildHarpoTerminalSnippet, buildHarpoCodeGenerationMarkup };",
  ].join("\n\n");
  const context = {
    module: { exports: {} },
    exports: {},
    URLSearchParams,
    String,
    Array,
    Object,
    Set,
    Map,
  };
  vm.runInNewContext(script, context, { filename: HARPO_PATH });
  return context.module.exports;
}

test("HARPO terminal replay snippet is copy-paste ready for JSON requests", () => {
  const { buildHarpoCurlSnippet, buildHarpoTerminalSnippet, buildHarpoCodeGenerationMarkup } = loadHarpoCodeGenerationFns();
  const entry = {
    request: {
      method: "POST",
      url: "https://sp.auth.adobe.com/api/v2/nbcentertainment/session",
      headers: [
        { name: "Content-Type", value: "application/json; charset=UTF-8" },
        { name: "Authorization", value: "Bearer token-123" },
        { name: "Host", value: "sp.auth.adobe.com" },
      ],
      postData: {
        mimeType: "application/json",
        text: "{\"device\":\"roku\",\"token\":\"abc\"}",
      },
    },
    response: {
      headers: [{ name: "Content-Type", value: "application/json" }],
      content: { mimeType: "application/json" },
    },
  };
  const responsePayload = { normalizedType: "application/json", hasBody: true };

  const terminalSnippet = buildHarpoTerminalSnippet(entry, responsePayload);
  const curlSnippet = buildHarpoCurlSnippet(entry);
  const markup = buildHarpoCodeGenerationMarkup(entry, responsePayload);

  assert.match(terminalSnippet, /^#!\/usr\/bin\/env bash/m);
  assert.match(terminalSnippet, /^set -euo pipefail$/m);
  assert.match(terminalSnippet, /REQUEST_URL=\$'https:\/\/sp\.auth\.adobe\.com\/api\/v2\/nbcentertainment\/session'/);
  assert.match(terminalSnippet, /REQUEST_METHOD=\$'POST'/);
  assert.match(terminalSnippet, /RECORDED_RESPONSE_TYPE=\$'application\/json'/);
  assert.match(terminalSnippet, /REQUEST_BODY=\$'\{"device":"roku","token":"abc"\}'/);
  assert.match(terminalSnippet, /--header \$'Authorization: Bearer token-123'/);
  assert.match(terminalSnippet, /--data-raw "\$REQUEST_BODY"/);
  assert.match(terminalSnippet, /python3 - <<'PY'/);
  assert.match(terminalSnippet, /json\.dumps\(parsed, indent=2, ensure_ascii=False\)/);
  assert.match(curlSnippet, /--include$/m);
  assert.doesNotMatch(curlSnippet, /Host: sp\.auth\.adobe\.com/);
  assert.match(markup, /data-harpo-code-sample="terminal"/);
  assert.match(markup, /Terminal Replay/);
  assert.match(markup, /Recorded response type: application\/json\./);
});

test("HARPO replay snippets preserve multipart forms and drop captured boundaries", () => {
  const { buildHarpoCurlSnippet, buildHarpoTerminalSnippet } = loadHarpoCodeGenerationFns();
  const entry = {
    request: {
      method: "POST",
      url: "https://sp.auth.adobe.com/api/v2/nbcentertainment/upload",
      headers: [
        { name: "Content-Type", value: "multipart/form-data; boundary=----WebKitFormBoundaryABC123" },
        { name: "Cookie", value: "session=abc123" },
      ],
      postData: {
        mimeType: "multipart/form-data; boundary=----WebKitFormBoundaryABC123",
        params: [
          { name: "metadata", value: "{\"requestorId\":\"nbcentertainment\"}" },
          { name: "harFile", fileName: "capture.har", contentType: "application/json" },
        ],
      },
    },
    response: {
      headers: [{ name: "Content-Type", value: "application/json" }],
      content: { mimeType: "application/json" },
    },
  };

  const curlSnippet = buildHarpoCurlSnippet(entry);
  const terminalSnippet = buildHarpoTerminalSnippet(entry, { normalizedType: "application/json", hasBody: true });

  assert.doesNotMatch(curlSnippet, /Content-Type: multipart\/form-data/);
  assert.match(curlSnippet, /--form-string \$'metadata=\{"requestorId":"nbcentertainment"\}'/);
  assert.match(curlSnippet, /--form \$'harFile=@capture\.har;type=application\/json'/);
  assert.match(terminalSnippet, /Replace the placeholder upload path\(s\) below with real local files before replaying\./);
  assert.match(terminalSnippet, /--form \$'harFile=@capture\.har;type=application\/json'/);
});

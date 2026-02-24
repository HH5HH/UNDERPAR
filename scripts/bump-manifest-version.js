#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");

const MAX_PART = 65535;
const DEFAULT_PARTS = [1, 0, 0];

function fail(message) {
  console.error(`[bump-manifest-version] ${message}`);
  process.exit(1);
}

function parseVersion(value) {
  if (typeof value !== "string" || value.trim().length === 0) {
    return { parts: [...DEFAULT_PARTS], width: DEFAULT_PARTS.length };
  }

  const rawParts = value.trim().split(".");
  if (rawParts.length < 1 || rawParts.length > 4) {
    fail(`Unsupported version format "${value}". Expected 1-4 numeric parts.`);
  }

  const parts = rawParts.map((part) => {
    if (!/^\d+$/.test(part)) {
      fail(`Invalid version part "${part}" in "${value}".`);
    }
    const parsed = Number(part);
    if (!Number.isInteger(parsed) || parsed < 0 || parsed > MAX_PART) {
      fail(`Version part out of range (0-${MAX_PART}) in "${value}".`);
    }
    return parsed;
  });

  return { parts, width: rawParts.length };
}

function incrementVersion(parts) {
  const next = [...parts];
  let carry = 1;

  for (let i = next.length - 1; i >= 0 && carry > 0; i -= 1) {
    const value = next[i] + carry;
    if (value > MAX_PART) {
      next[i] = 0;
      carry = 1;
    } else {
      next[i] = value;
      carry = 0;
    }
  }

  if (carry > 0) {
    fail(`Version overflow. Cannot increment beyond ${MAX_PART} in all parts.`);
  }

  return next;
}

function main() {
  const manifestPath = path.resolve(__dirname, "..", "manifest.json");
  const manifestRaw = fs.readFileSync(manifestPath, "utf8");
  const manifest = JSON.parse(manifestRaw);

  const currentVersion = manifest.version || DEFAULT_PARTS.join(".");
  const { parts } = parseVersion(currentVersion);
  const nextVersion = incrementVersion(parts).join(".");

  manifest.version = nextVersion;
  fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");

  console.log(`[bump-manifest-version] ${currentVersion} -> ${nextVersion}`);
}

main();

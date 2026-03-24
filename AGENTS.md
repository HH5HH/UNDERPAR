# UnderPar Agent Guidelines

## Core Doctrine

- Compress workflows to 3-5 actions when possible.
- Do not replace systems of record; orchestrate around them.
- Protect credential integrity (no credential downgrades, leakage, or bypass shortcuts).
- Track friction reduction with measurable before/after metrics.
- For every feature decision, ask: "Is this UnderPar compliant?"

## Adobe Spectrum 2 Skill Integration

- For UI styling or component work, use the `$spectrum-css-core` skill.
- Keep implementations class-based Spectrum CSS (not Spectrum Web Components details).
- Use Spectrum 2 compliant classes and avoid legacy/express/large variants.
- Prefer token-driven styling and component package usage aligned with Spectrum guidance.
- When choosing components or tokens, consult Spectrum 2 docs/tokens MCP data first.

## Delivery Guardrails

- Prioritize measurable compression outcomes over visual-only changes.
- Any UI change should include expected friction reduction impact.
- If a request conflicts with doctrine, propose the closest compliant alternative.

## Mandatory Version Bump Rule

- After any edit to UnderPAR application files, bump the build version before finishing work.
- Use: `scripts/auto_bump_manifest_version.sh`
- Never deliver UnderPAR edits with an unchanged `manifest.json` version.

## Commit-Time Automation

- UnderPAR enforces automatic patch version bump during commit via `.githooks/pre-commit`.
- One-time hook setup command: `scripts/install_git_hooks.sh`

## Get Latest Publication Rule

- For any major UnderPAR update that needs user validation through `Get Latest`, local-only changes are not sufficient.
- Publish-ready major updates must rebuild the distro, commit the release artifacts, and push `main` so GitHub `underpar_distro.version.json` and `underpar_distro.zip` reflect the new version.
- Use: `scripts/publish_get_latest_release.sh --message "<commit message>"`
- The publish flow is only valid from `main`. If the changes are not on `main`, say explicitly that `Get Latest` validation is not yet possible.
- Do not close out a major update as `Get Latest`-testable until the remote `main` package metadata is updated.

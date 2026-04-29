# GapCode CLI Preset

Start every task from `.gapcode/context-manifest.json` and `.gapcode/policies.json`.

## Bootstrap Order
1. Determine mode: `ANALYZE`, `IMPLEMENT`, or `REVIEW`.
2. Run `pnpm gapcode:bootstrap` when metadata or context may be stale.
3. Load `.gapcode/policies.json`.
4. Load `.gapcode/context-manifest.json`; if missing, regenerate it with `pnpm gapcode:context`.
5. Read only the scoped files in `allowedReadList`, then stop when the patch seam is clear.

## Guardrails
- Max files per step: 12.
- Max total files read: 60.
- Max dependency depth: 2.
- Verification mode comes from `.gapcode/policies.json` (`fail` by default, `warn` for soft rollout).
- Ask before reading lockfiles, binaries, minified bundles, or large asset folders.
- Prefer manifests, diffs, and workspace metadata over repo-wide source reads.

## Operational Modes
- `ANALYZE`: summarize scope, files read, files ignored, and the next smallest action.
- `IMPLEMENT`: patch only the targeted seam; validate the touched package or script.
- `REVIEW`: inspect changed files first; report risks before summaries.

# AGENTS.md

Review rules for Warehouse Mayhem. The block below is managed by claude-ops. Repo-specific checks go under it.

<!-- devloop:review-contract:start — managed by claude-ops scripts/propagate.sh; edit plugins/devloop/skills/review-contract/SKILL.md there, not here -->
## Priority schema

- **P0** — correctness, security, data loss, cross-tenant leak, platform runtime-limit violation, deployment-breaking change.
- **P1** — behavior gap, missing safeguard, doc-vs-code drift, project-rule violation, foreseeable footgun.
- Skip stylistic preference comments. Skip duplicate findings already addressed in earlier review rounds on the same PR.

## Review discipline — converge, don't churn

- **Verify data-dependent findings against the actual codebase before flagging.** A finding that depends on a specific runtime value is valid only if that input actually occurs here. Can't verify it exists → ask a question, don't file a P0/P1.
- **Inference is not evidence.** A claim reasoned from a name rather than traced through the code is low-confidence — say so. Cite the exact `file:line` from the diff. No citation, no P0/P1.
- **Converge across rounds.** Round 1: full P0/P1 pass. Round 2+: raise ONLY new P0/P1 issues introduced by the latest changes, or flagged ones still unfixed. Never introduce new findings on code that was present and unflagged in round 1.
- **Respect resolved findings.** Addressed, or explicitly declined with a stated reason, is closed. Re-open only if the new diff genuinely reintroduces it.
- **Signal density.** More than ~3–5 distinct findings means the diff is too large to review well — say that once instead of enumerating fifteen items.
- **A repeat finding is a rules bug — fix the rule in the same PR.** If a P0/P1 finding is already covered by a rule in `CLAUDE.md`, `.claude/rules/*.md`, or this file, the rule failed to prevent it: sharpen it (wording, a missing `paths:` glob so it actually loads, a tripwire that belongs inline) alongside the code fix. If nothing covers it but this repo has seen it before (`git log --grep`, an earlier PR thread, `.claude/codex-reviews/*.json` locally), promote it to a rule in the same PR. Write the principle, not the instance; at most one rule edit per PR; `.github/workflows/*` stays write-locked for bots. The weekly rule-improver is the backstop for what slips past this, not a substitute for it.

## Tests

A test earns its place by failing when the behavior it names breaks. Each of these is a **P1**:

- **A behavior change with no test that fails without it.** A refactor, config or copy change is exempt, and the PR says which one it is. Judge it from the diff: would the changed test still pass against the code before this change? If yes, it does not test the change. (The author's machine checks the same thing with devloop's `test-proof.sh`; its result is not in the PR.)
- **A test changed so it passes instead of the code being fixed:** an assertion deleted or loosened, an expected value re-recorded to match new output, a skip / only / todo added, a timeout raised.
- **A test that cannot fail:** no assertion, an assertion on a mock's own setup, an error swallowed, a snapshot nobody checked.
- **A test that depends on something it does not control:** wall-clock time, the network, test order, unseeded randomness.

Skip coverage-percentage and test-naming comments.

## How to comment effectively

- File-and-line inline comments for code findings; the review summary is for cross-cutting observations.
- Quote the exact file path and line range from the diff in each finding.
- When suggesting a fix, write the diff. Don't ask the author to "consider refactoring" — propose the change so it can be accepted, rejected, or countered with reasoning.
- A local review (no PR to comment on) reports each finding as one item in the same schema: `P0` or `P1` first, then `path:line`, then the problem and the proposed change. No other severity words; confidence goes in the sentence, not the label.
<!-- devloop:review-contract:end -->

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
- **A finding that reverses an earlier round is a trade-off, not a bug.** When you are fixing findings and a later round asks for a design an earlier round recommended against, or its fix would bring back what was already rejected, stop redesigning. Record both positions and what each costs in the PR body, and let the human rule. Another round of redesign only trades one high finding for its mirror image. This routes a choice between two defensible designs; it never parks a demonstrated defect. A finding carrying new evidence of a concrete failure — a repro, a failing test, a traced path — stays a P0/P1 and is fixed in this PR, whichever earlier round its fix contradicts.
- **Signal density.** More than ~3–5 distinct findings usually means the diff is too large to review well. Say so once at the top, then still report every P0/P1 you can cite.
- **A repeat finding is a rules bug — fix the rule in the same PR.** If a P0/P1 finding is already covered by a rule in `CLAUDE.md`, `.claude/rules/*.md`, or this file, the rule failed to prevent it: sharpen it (wording, a missing `paths:` glob so it actually loads, a tripwire that belongs inline) alongside the code fix. If nothing covers it but this repo has seen it before (`git log --grep`, an earlier PR thread, `.git/devloop/codex-reviews/*.json` locally), promote it to a rule in the same PR. Write the principle, not the instance; at most one rule edit per PR; `.github/workflows/*` stays write-locked for bots. The weekly rule-improver is the backstop for what slips past this, not a substitute for it.

## Errors

A failure the code hides is a bug nobody will see. Each of these is a **P1** in app code, hooks and scripts alike:

- **An error turned into a normal-looking value:** a catch, `except`, `.catch(() => …)`, `|| true` or `2>/dev/null` that returns null, `[]`, `''`, `0` or a default without logging it, where the caller treats that value as real data ("no resume", "no open PRs").
- **A result never checked:** a write, flush, rename, HTTP `res.ok`, exit status or affected-row count ignored before the code moves on or reports success.
- **A silent cap or truncation:** a page limit, size cap or `LIMIT` that drops data without a log line or a signal to the caller.
- **A crashed check reported as a pass.** A gate, hook or audit that cannot run its check must not return the same result as a clean pass. It may still let the work continue, but it says "not checked" at that moment, through a visible warning or a non-success status, and records the failure. Logging alone is enough only for code that enforces nothing. A comment saying it fails open does not make a silent pass acceptable.

## Tests

A test earns its place by failing when the behavior it names breaks. Each of these is a **P1**:

- **A behavior change with no test that fails without it.** A refactor, config or copy change is exempt, and the PR says which one it is. Judge it from the diff: would the changed test still pass against the code before this change? If yes, it does not test the change. (devloop's `test-proof.sh` checks the same thing before `gh pr create`; a `test-guard:` reason in a commit message is the author skipping it, so judge the reason.)
- **A test changed so it passes instead of the code being fixed:** an assertion deleted or loosened, an expected value re-recorded to match new output, a skip / only / todo added, a timeout raised. A `test-guard: <reason>` comment marks a deliberate one; judge the reason.
- **A test that cannot fail:** no assertion, an assertion on a mock's own setup, an error swallowed, a snapshot nobody checked, an expected value computed by the code under test.
- **A test that depends on something it does not control:** wall-clock time, the network, test order, unseeded randomness.
- **A test pinned to implementation, not behavior:** it asserts private members, source text or SQL strings, call counts on our own code, a constant equal to its own literal, a tuning number, a pixel size or an asset path. It breaks on a refactor and never on a bug.
- **A mock or fake of something we own:** our modules, our database, or the unit under test. A fake that re-implements the logic it replaces tests the fake. Mock only what we do not control: third-party HTTP, email and payment providers, the clock, randomness.
- **A test of the framework or library** (Zod accepting its own enum, the ORM saving a row, a Godot Timer firing), or **one that repeats an existing test** instead of extending or parametrizing it. "The source must never contain X" is a lint rule, not a test.

Skip coverage-percentage and test-naming comments.

## How to comment effectively

- File-and-line inline comments for code findings; the review summary is for cross-cutting observations.
- Quote the exact file path and line range from the diff in each finding.
- When suggesting a fix, write the diff. Don't ask the author to "consider refactoring" — propose the change so it can be accepted, rejected, or countered with reasoning.
- A local review (no PR to comment on) reports each finding as one item in the same schema: `P0` or `P1` first, then `path:line`, then the problem and the proposed change. No other severity words; confidence goes in the sentence, not the label.
<!-- devloop:review-contract:end -->

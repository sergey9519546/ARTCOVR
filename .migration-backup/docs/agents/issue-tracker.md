# Issue tracker: Local Markdown

Issues and PRDs for this repo live as markdown files in `.scratch/`.

This repo has **no git remote configured**, so there is no GitHub/GitLab issue tracker to call. Do not attempt `gh issue` or `glab issue` commands here — they will fail.

## Conventions

- One feature per directory: `.scratch/<feature-slug>/`
- The PRD is `.scratch/<feature-slug>/PRD.md`
- Implementation issues are `.scratch/<feature-slug>/issues/<NN>-<slug>.md`, numbered from `01`
- Triage state is recorded as a `Status:` line near the top of each issue file (see [triage-labels.md](./triage-labels.md) for the role strings)
- Comments and conversation history append to the bottom of the file under a `## Comments` heading

## When a skill says "publish to the issue tracker"

Create a new file under `.scratch/<feature-slug>/` (creating the directory if needed).

## When a skill says "fetch the relevant ticket"

Read the file at the referenced path. The user will normally pass the path or the issue number directly.

## Issue file shape

```markdown
# Bag quantity desyncs from header count

Status: needs-triage

## Problem

...

## Acceptance criteria

- [ ] ...

## Comments
```

## If a remote is added later

Re-run `/setup-matt-pocock-skills` to switch this repo to GitHub or GitLab issues. Existing `.scratch/` files are not migrated automatically.

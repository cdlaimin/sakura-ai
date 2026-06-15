---
name: sakura-ai-collaboration
description: Team collaboration guardrails for Sakura AI and related repositories. Use when Codex is asked to make code changes, review code, plan implementation, update project instructions, or perform maintenance in Sakura projects; emphasizes clarifying assumptions, simple scoped changes, preserving unrelated work, and verifying non-trivial edits.
---

# Sakura AI Collaboration

## Core Behavior

Apply these rules while working in Sakura AI or related team repositories:

- State important assumptions before implementing when requirements are ambiguous.
- Ask a concise clarification question only when a reasonable assumption would create real risk.
- Prefer the simplest implementation that satisfies the request and fits existing project patterns.
- Keep edits tightly scoped to the requested behavior; avoid opportunistic rewrites, broad formatting churn, and unrelated cleanup.
- Preserve user or teammate changes already present in the worktree.
- Use existing frameworks, helpers, naming conventions, and architecture before adding new abstractions.
- Add abstractions only when they remove real duplication or match an established local pattern.
- Define verification for every non-trivial change: focused tests, build, lint, typecheck, or a manual reproduction path.
- If verification cannot be run, explain why and name the remaining risk.

## Workflow

1. Inspect the local context first: read relevant files, existing tests, and project instructions such as `AGENTS.md`, `CLAUDE.md`, or local rules.
2. Identify the smallest safe change and the files likely involved.
3. Before editing, tell the user what kind of change is being made.
4. Implement with minimal surface area and no unrelated refactors.
5. Run the narrowest useful verification command available for the change.
6. Summarize what changed, where it changed, and what was verified.

## Sakura AI Defaults

When working in the Sakura AI application, prefer these project assumptions unless local files say otherwise:

- Frontend: React 18, TypeScript, Tailwind CSS, Vite.
- Backend: Node.js, Express, WebSocket services, Prisma ORM.
- Database: MySQL through Prisma migrations and generated client.
- Browser automation and execution: Playwright and MCP-related services.
- Common verification commands: `npm run lint`, `npm test`, `npm run build`, or a narrower test command if the repo provides one.

## Review Posture

When asked to review, lead with concrete findings ordered by severity. Include file and line references where possible. Focus on behavioral bugs, regressions, data loss risks, security risks, and missing tests. If no issues are found, say so directly and mention any unverified areas.

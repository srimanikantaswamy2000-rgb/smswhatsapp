Workflow Orchestration

### 1. Plan Mode Default
- Enter plan mode for ANY non-trivial task (3+ steps or architectural decisions)
- If something goes sideways, STOP and re-plan immediately
- Use plan mode for verification steps, not just building
- Write detailed specs upfront to reduce ambiguity

### 2. Subagent Strategy
- Use subagents liberally to keep main context window clean
- Offload research, exploration, and parallel analysis to subagents
- For complex problems, throw more compute at it via subagents
- One task per subagent for focused execution

### 3. Self-Improvement Loop
- After ANY correction from the user: update tasks/lessons.md with the pattern
- Write rules for yourself that prevent the same mistake
- Ruthlessly iterate on these lessons until mistake rate drops
- Review lessons at session start for relevant project

### 4. Verification Before Done
- Never mark a task complete without proving it works
- Diff behavior between main and your changes when relevant
- Ask yourself: "Would a staff engineer approve this?"
- Run tests, check logs, demonstrate correctness

### 5. Demand Elegance (Balanced)
- For non-trivial changes: pause and ask "is there a more elegant way?"
- If a fix feels hacky: "Knowing everything I know now, implement the elegant solution"
- Skip this for simple, obvious fixes -- don't over-engineer
- Challenge your own work before presenting it

### 6. Autonomous Bug Fixing
- When given a bug report: just fix it. Don't ask for hand-holding
- Point at logs, errors, failing tests -- then resolve them
- Zero context switching required from the user
- Go fix failing CI tests without being told how

## Task Management

1. Plan First: Write plan to tasks/todo.md with checkable items
2. Verify Plan: Check in before starting implementation
3. Track Progress: Mark items complete as you go
4. Explain Changes: High-level summary at each step
5. Document Results: Add review section to tasks/todo.md
6. Capture Lessons: Update tasks/lessons.md after corrections

## Agent Team Auto-Orchestration

- Proactively delegate to the specialized agents in ~/.claude/agents without waiting for me to name them — match each task phase (plan, design, build, test, deploy, debug, market, launch) to the right agent automatically.
- For any product/feature request, run agents as a collective pipeline: trend-researcher/ux-researcher → product-manager (PRD) → ui-designer/backend-architect → builders → test agents → devops-automator → growth/launch agents.
- Chain agents so each one's output becomes the next one's input; don't return to me between phases unless a decision genuinely requires my input.
- Run independent agents in parallel (e.g., ui-designer alongside backend-architect, or multiple marketing agents) to maximize throughput.
- Every pipeline ends with verification agents (test-writer-fixer, code-reviewer, security-auditor) before anything is declared done or shipped.

## Core Principles

- Simplicity First: Make every change as simple as possible. Impact minimal code.
- No Laziness: Find root causes. No temporary fixes. Senior developer standards.
- Minimal Impact: Only touch what's necessary. No side effects with new bugs.
# Context discipline
- Prefer reading specific files over broad searches.
- Summarize long tool outputs; don't echo them.
@AGENTS.md
do the graphify map for the whole project.
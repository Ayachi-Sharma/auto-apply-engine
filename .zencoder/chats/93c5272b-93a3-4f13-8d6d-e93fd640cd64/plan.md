# Fix bug

## Workflow Steps

### [ ] Step: Investigation and Planning

Analyze the bug report and design a solution.

1. Review the bug description, error messages, and logs
2. Clarify reproduction steps with the user if unclear
3. Check existing tests for clues about expected behavior
4. Locate relevant code sections and identify root cause
5. Propose a fix based on the investigation
6. Consider edge cases and potential side effects

Save findings to `e:\Projects\auto-apply-engine\.zencoder\chats\93c5272b-93a3-4f13-8d6d-e93fd640cd64/investigation.md` with:

- Bug summary
- Root cause analysis
- Affected components
- Proposed solution

**Stop here.** Present the investigation findings to the user and wait for their confirmation before proceeding.

### [ ] Step: Implementation

Read `e:\Projects\auto-apply-engine\.zencoder\chats\93c5272b-93a3-4f13-8d6d-e93fd640cd64/investigation.md`
Implement the bug fix.

1. Add/adjust regression test(s) that fail before the fix and pass after
2. Implement the fix
3. Run relevant tests
4. Update `e:\Projects\auto-apply-engine\.zencoder\chats\93c5272b-93a3-4f13-8d6d-e93fd640cd64/investigation.md` with implementation notes and test results

If blocked or uncertain, ask the user for direction.

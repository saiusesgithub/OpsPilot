# OpsPilot Kiro Hooks

This directory contains Kiro automation hooks that run on file changes to catch errors before deployment.

## validate-backend

**File:** `validate-backend.json`

**Trigger:** Any save to `backend/**/*.ts` or `infra/**/*.tf`

**Steps (in order):**

| Step | Command | On Failure |
|------|---------|-----------|
| TypeScript type check | `npm run typecheck` | Stop (hard block) |
| Severity property tests | `npm test -- --testPathPattern=calculateSeverity.property` | Warn |
| Terraform format check | `terraform fmt -check` | Warn |
| Terraform validate | `terraform validate` | Warn |

**Why this matters:**

- The TypeScript step is a hard stop because a type error in any Lambda handler will produce a broken build artifact that fails silently at runtime.
- Property tests run on every backend change to ensure the severity calculation invariants (range, monotonicity, critical floor) are never accidentally broken.
- Terraform steps run on every `.tf` change so formatting drift and config syntax errors are caught locally, not in CI.

**Notes:**

- The `npm test` command requires the Jest config in `package.json` (added in Phase 1+).
- Terraform commands assume `terraform init` has already been run in `infra/` and the `ops-pilot` AWS profile is configured.
- Steps marked `onFailure: warn` will not block the save — they surface the issue but let you keep editing.

# Phase 6 — Branch Manager Operations (gap analysis & corrections)

Originally written when Phase 6 could not be implemented. **Phase 6 is now delivered and
verified** — see `docs/phase-6-report.md` for the full report. This page records the gap
analysis and the corrections discovered during implementation.

## Corrections to the original analysis

1. **`AuditEvent.branchId` already existed.** The original analysis claimed a Prisma
   migration was required to add a branch dimension to audit events. On implementation the
   column, its `Branch` relation and the `[branchId, createdAt]` index were already present
   in `apps/api/prisma/schema.prisma`. **No migration and no `prisma generate` were needed;
   neither was run.** The real gap was that most production `AuditService.record` call
   sites did not pass a `branchId` through — that plumbing is now done (orders,
   branch-orders, delivery-assignment, delivery-partners, branch-products,
   branches/settings) so the audit log is fully branch-scoped.
2. **The two net-new surfaces are implemented:** branch catalog `PATCH /:id` + `DELETE
/:id` (branch-owned, masked soft-delete, audited) and branch-scoped audit read/CSV
   (`GET /api/branch/audit`, `GET /api/branch/audit/export`). Branch settings gained a thin
   branch-scoped read/update (`GET`/`PATCH /api/branch/settings`) limited to real `Branch`
   config.
3. Three branch-product tests were failing at the start of the work; the service rewrite
   (ownership checks, correct BadRequest/Conflict semantics) fixed them — they were
   asserting behavior the old service genuinely lacked.

## What was reused (do NOT rebuild — still true)

- Manager dashboard aggregate = compose existing branch-scoped services (orders,
  deliveries, partners, branch-products). No new queries needed.
- Order list/filter/status = Phase 4 `branch-orders` + `OrderStateService`.
- Dispatch = Phase 5 assignment service + branch-orders/manager controllers.
- Partner management = Phase 5 partners (verify/onboarding, documents, availability).
- Manager notifications = Phase 5 inbox + realtime.

## Non-goals maintained this phase

- No new DB models, no migration, no fake refunds, no fake settings, no fake CSV.
- No bypass of partner verification; no cross-branch access; no global-product edits via
  branch endpoints.
- Phase 7 (Super Admin) not started.

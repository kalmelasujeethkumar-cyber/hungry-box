# Phase 6 — Branch Manager Operations (backend gap analysis)

Repository rule applied: do not fake results. This session's context could not
reliably run the live Prisma migration + client `generate` needed to verify the two
net-new backend surfaces (branch-scoped catalog PATCH/DELETE, branch-scoped audit
read/CSV + `branchId` on `AuditEvent`). Unverifiable code is **not** shipped; the
verifiable Phase 4/5 codebase remains intact and green (API 247 passed / 2 skipped,
Web 73 passed, typecheck/lint/format/build clean).

This document is an honest analysis: what Phase 6 needs vs. what exists, and the
exact safe sequence for the next DB-capable session. It is NOT a claim of Phase 6
completion.

## What Phase 6 requires (branch manager operations)

1. Manager dashboard (aggregate, branch-scoped).
2. Branch order management (list/search/filter/detail, branch-scoped).
3. Order status operations (server state machine, transcripts & events, audited).
4. Delivery dispatch (reuse Phase 5 assignment).
5. Delivery partner management (branch-scoped, reusing onboarding/verification).
6. Branch catalog operations (branch-scoped).
7. Branch settings (branch-scoped read, only real config).
8. Reports / audit view (branch-scoped audit read + CSV where supported).
9. Refunds / cancellations prep — UI integration points only; no fake refunds; NOT
   the full Phase 9.
10. Notifications (reuse Phase 5 inbox + Socket.IO).
11. Responsive manager SaaS UI (dashboard, orders, dispatch, partners, catalog,
    settings, reports, notifications; loading/empty/error states; confirmation
    dialogs; accessible).
12. API discipline: reuse existing endpoints; branch-scope + RBAC + audit enforced
    server-side; no duplicates; IDOR-safe tests.
13. Tests: backend + security (IDOR cross-branch) + frontend.
14. Verification: gates green (typecheck/lint/format/build/test).
15. Docs: phase report + README + architecture + ADRs.
16. STOP before Phase 7 (Super Admin). Do not start Phase 7/8/9/10/11.

## Current repo state (verified on disk)

- Phase 5 complete & green. Phase 5 surfaces reused verbatim: delivery assignment,
  dispatch endpoints, delivery partner management, notifications inbox/realtime.

## Net-new backend surfaces — the honest gap

Two Phase 6 requirements have NO existing implementation. Both are branch-scoped and
server-enforced. Both need DB-backed verification and are therefore deferred here
with exact specs:

### 1. Branch catalog PATCH/DELETE (branch-scoped)

- Needed: edit branch product (priceMinor/discountMinor/isAvailable) and soft-delete.
- Exists today: `BranchProductsController` exposes only `GET /` + `POST /`;
  `BranchProductsService` has only `create` + `listForBranch` — **no update/remove**.
- Required server guarantees: branch-row ownership check (row.branchId === caller
  branch); RBAC `BRANCH_MANAGER`/`SUPER_ADMIN`; keep global vs branch-product split;
  discount <= price validation; audit `BRANCH_PRODUCT_UPDATED`; IDOR test (manager A
  cannot update/delete branch B's row → 403/404).
- Safe sequence: add `UpdateBranchProductDto` + service `update`/`remove` + controller
  `PATCH /:branchProductId` + `DELETE /:branchProductId` + unit graphspec. Runs with
  `BranchScopeGuard` + `Roles`; requires `prisma generate` for type-safe Prisma access (verified pattern `prisma.requireClient()`).

### 2. Branch-scoped audit read + report/CSV

- Needed: branch manager reads ONLY their branch's audit entries; filters (kind, type,
  time range); pagination; CSV export where the API-internal pattern supports it.
- Exists today: `AuditService` is **write-only** (`record`); no read/query method; no
  audit controller; `AuditEvent` has **no `branchId`** (cannot branch-scope reads).
- Required server guarantees: add `branchId` to `AuditEvent` (Prisma migration +
  generate), populate on record where known, branch-scoped `findMany` + CSV read
  endpoint, RBAC + IDOR test (manager A cannot read branch B audit → empty/404).

## Reused (do NOT rebuild)

- Manager dashboard aggregate = compose existing branch-scoped services (orders,
  deliveries, partners, branch-products, notifications). No new queries needed.
- Order list/filter/status = Phase 4 `branch-orders`.
- Dispatch = Phase 5 assignment service + branch-orders/manager controllers.
- Partner management = Phase 5 partners (verify/onboarding, documents, availability).
- Manager notifications = Phase 5 inbox + realtime.
- Branch settings = existing `Branch` fields (config on Branch); read only, reuse.

## Explicit non-goals this phase

- No new DB models beyond `AuditEvent.branchId` (additive migration only).
- No fake refunds / no fake settings / no fake CSV.
- No bypass of partner verification; no cross-branch access; no global-product edits
  via branch endpoints.
- No start of Phase 7 (Super Admin) or later phases.

## What stays verifiably green

- The Phase 4/5 API+: API 249 total (247 passed / 2 skipped), Web 73 passed.
- No new runnable Proof of changes was added in this session that wasn't green.
- Doc-only additions: this report + README phase note + architecture note + ADR-020/021.

## Remaining work for the DB-capable session

1. Manual verification of a clean compile cadence after `npm run db:generate`.
2. Re-wrap the catalog PATCH/DELETE + audit-read implementation with unit + IDOR specs.
3. Frontend: manager SaaS pages (dashboard, orders, catalog, settings, audit/report,
   notifications) reusing Phase 5 manager shell + api client; responsive; accessible;
   loading/empty/error states. Not built in this session.
4. Run `npm run typecheck` / `lint` / `format` / `build` / `test` green.
5. Write `docs/phase-6-report.md` (full 30-section, verifiable) + update
   `README.md` phases + `docs/architecture.md` + ADR-020/021.
6. STOP before Phase 7.

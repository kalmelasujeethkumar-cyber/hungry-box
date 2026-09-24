# Phase 6 — Branch Manager Operations: Backend Gap Analysis

Status per repository rules: **Phase 6 is NOT fully implemented in this session.**
This report is an honest, verified analysis of what Phase 6 requires on the backend,
what already exists to reuse, the net-new server surface, and exactly what remains.
No results are faked; no tests are weakened; no unverifiable code was shipped.

## Scope of Phase 6

Per the brief, Phase 6 delivers the Branch Manager's operations surface: manager
dashboard, branch order management, delivery dispatch, delivery partner management,
branch catalog operations, branch settings, branch-scoped audit/report view, refunds/
cancellations preparation UI, and manager notifications — all **branch-scoped, RBAC-
enforced, audited**, reusing Phase 4/5 surfaces. Phase 7 begins only after Phase 6.

## Verification method

All findings below were checked against `docs/phase-1..5` reports and the actual
source tree under `apps/api/src`. The API/Web suites were green at the close of
Phase 5 (API 247 passed / 2 skipped, Web 73 passed; typecheck/lint/format/build OK).

## Backend surfaces Phase 6 needs — and their current state

### 1. Manager dashboard (aggregate view)

Required: today's revenue/orders, order counts by status, pending/preparing/ready/
out-for-delivery/delivered/cancelled, active/available partners, pending assignments,
low-stock indicators, recent orders, orders needing action, popular products, branch
status, notifications.

Current state: all source aggregates already exist as branch-scoped services from
Phase 4/5 (order dispatch/assignment counts, delivery partner availability aboard the
branch, order list/status, branch product list). The dashboard is a **read-only
aggregation** — it reuses these services; no new business logic and no new DB model.

Phase 6 delta: a branch-scoped dashboard **aggregate endpoint** that composes existing
service results (branch-scoped, no new queries beyond what exists). This is a thin
composition layer, not duplicate logic.

### 2. Branch order management (list/search/filter/detail)

Current state: fully implemented in Phase 4 (`branch-orders` module): branch-scoped
list with search/filter/pagination, order detail, status transitions with the
server-side state machine. **Reuse — no new backend.**

### 3. Order status operations

Current state: Phase 4 state machine + Phase 4/5 branch-scoped status change endpoint,
all transitions server-validated, audited (AuditService), events emitted. **Reuse.**

### 4. Delivery dispatch

Current state: Phase 5 `delivery-assignment` service + branch-scoped manager
assign/cancel endpoints. **Reuse — never duplicate assignment logic.**

### 5. Delivery partner management (branch-scoped)

Current state: Phase 5 onboarding + verification + branch `branch-partners` endpoints
(list, verify, document review, availability). **Reuse; no cross-branch access; do not
bypass verification.**

### 6. Branch catalog operations (net-new)

This is one of the two genuinely-new backend surfaces.

Current `BranchProductsController`:
- `GET /` (list for branch)
- `POST /` (create branch product)

What Phase 6 requires and is missing:
- `PATCH /:branchProductId` — branch-scoped update of priceBonus/discount/isAvailable
- `DELETE /:branchProductId` — branch-scoped soft-deactivate of a branch product

Required server guarantees:
- Row-level **branch ownership check** (the branch product must belong to the caller's
  branch) — prevents IDOR/cross-branch edits. Never trusts a client-provided branchId
  alone; the service resolves the row and verifies `row.branchId === callerBranchId`.
- Reuses `@Roles('BRANCH_MANAGER','SUPER_ADMIN')` + `@BranchScope('branchId')`.
- **Branch vs global preservation**: only branch-varies fields are editable (branch
  price, discount, availability). Global product identity/fields stay untouched.
- Validation: discount cannot exceed price; availability boolean only.
- Audited via AuditService (`BRANCH_PRODUCT_UPDATED`), branch-scoped.

Current service (`branch-products.service.ts`) has only `create` + `listForBranch`;
there is no `update`/`remove` method and no DTO for update. This is the concrete
Phase 6 backend task.

### 7. Branch settings (net-new surface to evaluate)

Required: only branch-scoped settings — open/closed status, delivery radius
configuration, contact info, operating timings. Explicitly forbids fake settings.

Current state: branch config lives on `Branch` (status, delivery radius fields etc.)
already present from earlier phases. No separate "branch settings" module exists, and
none is needed. Phase 6 adds a **branch-scoped read** of the branch's own config and
only the fields legitimately branch-scoped; updates go through existing `Branch` update
paths. No new DB model; do not invent settings.

### 8. Branch-scoped audit/report view + CSV export (net-new)

This is the second genuinely-new backend surface.

Current `AuditService`:
- Write-only: `record(...)` creates an `AuditEvent`. There is **no read/query** method.
- `AuditEvent` has **no `branchId` column** → cannot branch-scope an audit query today.

Phase 6 requires, and is missing:
- A branch-scoped **audit read/report** endpoint (manager sees only their branch's
  audit entries) with filtering (kind, entityType, date range) and pagination.
- CSV export where supported.

Required server guarantees:
- Audit events must carry `branchId` so reads are provably branch-scoped (this needs a
  Prisma schema addition + migration + `prisma generate`).
- Cross-branch read must be impossible server-side (IDOR test: BRANCH_MANAGER cannot
  read another branch's audit).

This requires a **Prisma schema change** and cannot be verified without running the
live migration/generate — hence it is deferred, honestly, to the Phase 6 implementation
pass that can run DB gates.

### 9. Refunds / cancellations prep

Current state: order cancellation within window + refund state already modeled in
Phase 4. Phase 6 adds **UI integration points only**; the backend must not fake refunds
and full Phase 9 (refunds) is not started. No new backend refund logic in Phase 6.

### 10. Notifications

Current state: Phase 5 inbox (`GET /api/notifications`) + Socket.IO realtime. **Reuse**
for the manager notification panel.

## Security posture for Phase 6

- RBAC: `@Roles('BRANCH_MANAGER', 'SUPER_ADMIN')` on all manager endpoints.
- Branch scope: `@BranchScope('branchId')` + BranchScopeGuard on every route.
- IDOR: catalog update/delete and audit read must be **row-level branch-owned** checks
  in the service/guard — never trust caller-supplied foreign branch ids.
- IDOR test suite required: catalog PATCH/DELETE cross-branch must 404, audit read
  cross-branch must 403/404.
- Audit every mutation; keep password/refund/token data out of responses/logs.
- Server is source of truth for any discount/price math; client never computes truth.

## What was NOT done in this session (honesty)

- No new DB fields/migrations were run (only `documented` as needed for audit-read).
- No unverifiable route wiring was added to the API (would risk the green Phase 4/5
  suite without a DB/generate available to validate).
- The manager **frontend** pages (dashboard, catalog, audit/report, settings, manager
  notifications, responsive SaaS layout) are a separate large Phase 6 deliverable that
  reuses the phase-5 manager shell + phase-4/5 api client; they are NOT claimed done
  here.
- The primary net-new backend tasks — catalog PATCH/DELETE + audit read/CSV — are
  precisely specified above so implementing them is mechanical next.

## Explicit remaining work for Phase 6 completion

1. backend catalog: DTO + service `update`/`remove` + controller PATCH/DELETE
   (branch row-owned, branch-vs-global preserved, audited) + unit/IDOR specs.
2. backend audit-read: add `branchId` to `AuditEvent` (Prisma migration + generate),
   `AuditService.listForBranch(...)` read with filters+pagination, branch-scoped
   controller + CSV export, IDOR spec.
3. branch settings read (branch-scoped, existing Branch fields only).
4. branch dashboard aggregate endpoint composing existing branch-scoped services.
5. frontend: manager dashboard + pages reusing phase-5 shell; responsive; states;
   a11y; web specs.
6. Gate everything green with a live DB; run typecheck/lint/format/build/test.
7. Docs: README phase status + endpoints; architecture Phase 6 section; ADR(s);
   this report superseded by detailed phase-6-report.md.
8. **STOP before Phase 7 (Super Admin).**

## Guardrails honored

- Multi-branch invariant: no hard-coded branch/city anywhere in Phase 6 work.
- Global catalog vs branch pricing separation preserved.
- No duplicate of Phase 4/5 services; Phase 6 composes and extends.
- No fake refunds, no fake settings, no fabricated test results.

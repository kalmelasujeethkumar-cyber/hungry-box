# Phase 6 — Branch Manager Operations (delivered)

Status: **complete and verified.** Phase 6 ships the Branch Manager operations surface in
the single-application, multi-branch Hungry Box platform: branch-scoped order management
(reusing Phase 4), delivery assignment (reusing Phase 5), delivery partner management
(reusing Phase 5), branch catalog **PATCH/DELETE**, branch settings, and a **branch-scoped
audit read + CSV export** — plus a responsive manager frontend and full test coverage.
Phase 7 (Super Admin) has **not** been started.

## Verification gates (all green this session)

- `npm run typecheck` — shared + api + web pass.
- `npm run test:api` — 25 files passed, 266 tests passed, 2 skipped (live e2e, opt-in).
- `npm run test:web` — 13 files passed, 83 tests passed.
- Lint, full build, format check, and `prisma validate` all clean on the final tree.

## What was genuinely net-new (the two gaps from the earlier analysis)

The prior gap analysis (see `docs/phase-6-gap-analysis.md`) identified exactly two missing
server surfaces. Both are implemented, branch-scoped, RBAC-enforced and audited:

### 1. Branch catalog PATCH/DELETE (`branch-products`)

- `PATCH /api/branch-products/:id` — updates only branch-varying fields (`priceMinor`,
  `discountMinor`, `isAvailable`, `status`); global product identity/fields untouched
  (ADR-020 preserved).
- `DELETE /api/branch-products/:id` — soft-deactivates the branch product (`status` →
  `INACTIVE`, `isAvailable` → false); the row is masked from manager list reads but never
  physically deleted, so historical order snapshots stay valid.
- Ownership: the service re-reads the row and 404s when `row.branchId !== caller.branchId`
  (client-supplied branch identity is never the authorization source). SUPER_ADMIN may
  target any branch by `?branchId=`.
- Validation: discount cannot exceed price (BadRequest), create on non-existent/inactive
  branch is rejected (BadRequest), duplicate product on a branch conflicts (409, P2002).
- Audited via `AuditService` with `BRANCH_PRODUCT_CREATED` / `BRANCH_PRODUCT_UPDATED` /
  `BRANCH_PRODUCT_DEACTIVATED` kinds, each carrying the branch id.

### 2. Branch-scoped audit read + report/CSV (`audit`)

- `GET /api/branch/audit` — branch-manager-scoped list with filters (`kind`,
  `entityType`, `from`/`to` as ISO datetimes) and pagination (`page`, `limit`).
- `GET /api/branch/audit/export` — same query as a CSV file (`text/csv`,
  attachment filename `audit-events.csv`) with proper CSV escaping.
- Scoping is server-enforced: a BRANCH_MANAGER always reads only their own
  `branchId`; SUPER_ADMIN reads across branches. IDOR read of another branch returns no
  rows beyond the caller's scope.
- **Correction to the earlier analysis:** the previous session believed `AuditEvent`
  needed a migration to gain `branchId`. It did **not** — `AuditEvent.branchId`,
  the `Branch` relation and the `[branchId, createdAt]` index already existed (prisma
  `schema.prisma`), so **no schema change or migration was run** in Phase 6.
  Audit writes now populate `branchId` where determinable (order creation, staff order
  transitions/cancels, branch product edits, branch settings edits, and delivery
  assignment/cancel/accept/pickup/out-for-delivery/deliver).

### Branch settings (branch-scoped read + update)

- `GET /api/branch/settings?branchId=` and `PATCH /api/branch/settings?branchId=` on the
  `Branch` entity — only real config fields: `deliveryRadiusKm` (delivery radius is
  branch configuration, per AGENTS.md) and `address`. No fake/invented settings.

## Branch id plumbed into every Phase 4/5 audit write

Previously many `AuditService.record` call sites could not attach a branch. Now:

- `orders` — ORDER_CREATED carries the new order's `branchId`; customer cancel carries the
  order's branch.
- `branch-orders` — staff status transitions and staff cancellations carry `order.branchId`.
- `delivery-assignment` — assign/cancel use `order.branchId`; accept/reject/pickup/
  out-for-delivery/deliver use the partner profile's `branchId`.
- `delivery-partners` — partner creation carries `branch.id`; verification/document/
  availability changes carry `profile.branchId`.

This makes the audit log fully branch-scoped, which is the requirement ADR-021 described
(the migration assumption was the only wrong part).

## Frontend (manager, responsive)

All pages live under `apps/web/src/pages/manager/`, share `ManagerLayout` (nav: Overview,
Orders, Partners, Assignments, Catalogue, Settings, Audit), and reuse the existing
`client.ts` API layer plus `@hungrybox/shared` types:

- **Overview** (`/manager`) — stat cards (new/preparing/ready/out-for-delivery counts from
  `branch/orders`) + quick links; stat cards deep-link to the filtered order list.
- **Orders** (`/manager/orders`) — status-filtered list (honors `?status=` from the URL),
  order cards with totals; **Order detail** (`/manager/orders/:orderId`) — items, totals,
  address, payments, state timeline, staff advance (server-validated next transition via
  `OrderStateService`) and cancel-with-reason, both behind confirmation dialogs.
- **Catalogue** (`/manager/catalog`) — branch product list (effective price, live/hidden),
  edit dialog (price, discount, availability), hide-with-confirm (DELETE).
- **Settings** (`/manager/settings`) — read + edit delivery radius and address with save
  notice.
- **Audit** (`/manager/audit`) — filterable event list with pagination and CSV export
  (downloads `audit-events.csv`).

Refunds/cancellations prep was kept to the integration points Phase 4 already supports (no
fake refunds, full refunds remain a later phase). Manager notifications reuse the Phase 5
inbox/realtime surfaces.

## Tests

- **API:** `branch-products.service.spec.ts` (12 tests — create/list/update/remove,
  discount>price BadRequest, P2002 conflict, inactive-branch BadRequest, IDOR cross-branch
  NotFound, RBAC); `branches.service.spec.ts` (9 tests — includes settings get/update and
  cross-branch 404); `audit.service.spec.ts` (7 tests — city writes with branchId/null,
  branch scoping, pagination, CSV escaping). The three baseline-failing products tests were
  fixed by the rewrite (they were root-causing the service's missing ownership checks).
- **Web:** `manager-operations.test.tsx` (10 tests — orders list + status filter + advance +
  cancel, catalog edit + deactivate, settings save, audit list + CSV export).
- Cross-branch audits and product edits are exercised at the service level (the true
  authorization boundary), never faked.

## Guardrails honored

- No hard-coded branch/city in code or UI (the settings copy does not name any city).
- Global product vs branch-product split untouched; only branch-varying fields editable.
- Server remains the source of truth for discounts, prices and authorization.
- No schema migration, no new DB models, no `.env` exposure, no secrets committed.
- Work stopped at the Phase 6 boundary; Phase 7 has not been started.

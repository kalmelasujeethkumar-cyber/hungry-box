# Phase 7 — Super Admin Operations (delivered)

Status: **complete and verified.** Phase 7 ships the Super Admin operations surface on the
single-application, multi-branch Hungry Box platform: global branch lifecycle management,
branch manager administration with one-time passwords, suspended-user enforcement, a
global (branch-aware) catalog, cross-branch order/delivery/audit visibility, and a
read-only analytics + reports layer — plus a responsive admin frontend and full test
coverage. All of it is built on top of the existing Phase 4/5/6 modules (never rebuilt):
orders, payments, delivery, partner list, and audit reads are reused with `branchId`
filters widened for the global SUPER_ADMIN scope.

This phase is **migration-free**. No `schema.prisma` change, no migration, no `db push`,
and no reseed was run — everything Phase 7 needed already existed in the data model. The
locked baseline commit is `4c59b88`; nothing has been committed for Phase 7.

## Verification gates (all green this session)

- `npm run typecheck` — shared + api + web pass.
- `npm run lint` — api + web pass.
- `npm run build` — shared, api (`nest build`), web (`tsc --noEmit && vite build`) pass.
- `npm run test:api` — 25 files, **298 passed / 2 skipped** (Phase 6 baseline: 266/2).
- `npm run test:web` — 14 files, **95 passed** (Phase 6 baseline: 83).
- Phase 7 files are formatted with Prettier (full-repo `format:check` intentionally not
  run to avoid touching unrelated historical files).

## The 38-point delivery checklist

### S1 — Shared contracts (`packages/shared`)

1. `BranchStatus` extended with `PAUSED` and `INACTIVE` (kept `ACTIVE`), the branch
   lifecycle states are shared types, and `SetBranchStatusInput` +
   `SetBranchStatusResult` contracts added.
2. `UpdateBranchInput` (`deliveryRadiusKm`, `address`) added; delivery radius stays
   branch configuration, never a constant.
3. New admin-facing list/view DTOs: `UserListItemDto`, `UserListQuery`,
   `UserListResultDto`; `CreateManagerInput` + `CreateManagerResultDto` (carries a
   one-time `temporaryPassword`); `ManagerStatus` + `SetUserStatusInput`.
4. `ProductListItemDto`, `UpdateProductInput` (`categoryId` nullable), `ProductImageDto`
   and status contracts added without touching the branch-product split.
5. Analytics contracts: `DashboardBucket`, `AdminDashboardQuery`, `AdminReportQuery`,
   `DashboardSummaryDto`, `OrderStatusAggregate`, `PaymentMethodAggregate`,
   `ProductPerformanceAggregate`, `TimeSeriesPoint`, `DeliverySummaryDto`,
   `CancellationSummaryDto`, `BranchPerformanceDto`, `OrderReportRow`.
6. `AuditKind`/list contracts extended with the Phase 7 kinds: `BRANCH_UPDATED`,
   `BRANCH_STATUS_CHANGED`, `USER_CREATED`, `USER_STATUS_CHANGED`,
   `PRODUCT_CREATED`, `PRODUCT_UPDATED`, `PRODUCT_STATUS_CHANGED`,
   `PRODUCT_IMAGE_ADDED`, `PRODUCT_IMAGE_UPDATED`, `PRODUCT_IMAGE_REMOVED`,
   `CATEGORY_CREATED`, `CATEGORY_UPDATED`, `CATEGORY_STATUS_CHANGED`.

### S2 — Branch lifecycle (backend)

7. `PATCH /api/branches/:id/status` accepts only `ACTIVE | PAUSED | INACTIVE`
   (class-validator `@IsEnum`), guarded `SUPER_ADMIN`-only.
8. Service enforces the lifecycle server-side: a missing branch 404s, a no-op status
   change (same status) is rejected with 400 "Branch is already <status>", and a valid
   transition updates the branch and records the change — the UI offers exactly the
   allowed next states per current state (`ACTIVE -> Pause/Deactivate`, `PAUSED ->
Activate/Deactivate`, `INACTIVE -> Activate`).
9. `GET /api/branches` lists the full branch set for the Super Admin console; the admin
   Branches page renders every branch (status badge + available lifecycle actions) from
   this single endpoint, never a hard-coded branch/city list.
10. Branch status changes are audited (`BRANCH_STATUS_CHANGED` with branch id); every
    mutation carries the caller as the actor.
11. Branch config edits (`PATCH /api/branches/:id`, delivery radius + address) reuse the
    audit `BRANCH_UPDATED` kind so the global event log stays complete.

### S3 — Manager administration (backend)

12. `POST /api/users/managers` creates a `BRANCH_MANAGER` bound to a branch id
    (configurable data, no hard-coded branch), generating a cryptographically random
    one-time password that is **returned exactly once** and never re-servable.
13. Passwords are stored hashed (Argon2 via the existing credential service); the plain
    temporary value is never persisted, logged, or exposed through any other API.
14. `GET /api/users?role=BRANCH_MANAGER` lists managers with `search`, `branchId`,
    `status`, `page`, `limit`; rows expose only safe fields (`UserListItemDto` — no
    hashes/tokens).
15. `PATCH /api/users/:id/status` moves managers between `ACTIVE`, `INACTIVE`,
    `SUSPENDED`; the actor and target are audited (`USER_STATUS_CHANGED`). SUPER_ADMIN
    cannot suspend themselves or change their own role/status via this route.
16. The manager list honors branch-pinned scoping: a BRANCH_MANAGER caller is rejected —
    manager administration is SUPER_ADMIN-only (defense in depth on the server).

### S3b — Suspended-user security (backend)

17. `RolesGuard` re-reads the acting user from the database on every request (not just the
    JWT) and rejects with 403 any user whose `status` is `SUSPENDED` or `INACTIVE` — a
    suspension takes effect on the next request, server-authoritative, never client-side.
18. The guard fix keeps the demo credentials behavior (username `shiva@` accepted as a
    login id) and does not leak account state in responses.

### S4 — Global catalog (backend)

19. `GET/POST/PATCH /api/products` extended for SUPER_ADMIN global management (no physical
    deletes): admin list with `search`, `categoryId`, `page`, `limit`; create with a
    **required** slug; update (name, description, category reassignment, price-neutral
    global fields); soft status changes (`ACTIVE`/`INACTIVE`) via
    `PATCH /products/:id/status` instead of physical deletes.
20. `POST /api/products` returns a `ProductConflict`-style 409 with a stable
    `products.slug_taken` code on duplicate slug (real `Prisma.PrismaClientKnownRequestError`
    P2002 handling).
21. Product **images** are modeled as list data (`ProductImageDto` order, url) with add/
    promote/remove supported in the admin UI through `productsApi`; image mutations are
    audited (`PRODUCT_IMAGE_*`).
22. Category management for SUPER_ADMIN: list/read with product counts, create (slug
    derived server-side), update, and soft status changes — all audited
    (`CATEGORY_*`), leaving the branch-product pricing/availability untouched.
23. `GET /api/products/admin/:id` added so the admin detail view can load a single
    global product (the missing admin read from the Phase-6 route set).

### S5/S6 — Cross-branch visibility with branch filters (backend)

24. `GET /api/branch/orders` widened for SUPER_ADMIN: branch filter defaults to all
    branches, plus optional `branchId`, `status`, `from`, `to`; BRANCH_MANAGER callers
    remain pinned to their own branch (never broken).
25. `GET /api/delivery-partners` partner list widened for SUPER_ADMIN with an optional
    `branchId` filter; manager callers stay branch-scoped on both list and candidates.
26. `GET /api/branch/audit` and `/export` keep their existing SUPER_ADMIN (global with
    optional `branchId` filter) + manager (own branch) access; new Phase 7 audit kinds are
    queryable through the same filters.

### S7 — Analytics + reports (backend, read-only)

27. `GET /api/admin/dashboard` returns `DashboardSummaryDto` aggregating revenue, order
    count, customers, average order value, active/paused/inactive branch counts, order
    status and payment-method breakdowns, cancellations/refund summaries (from
    `Payment.status` — reporting only, **no refund action workflow**, per the schema-free
    constraint), delivery summary, top products, branch comparison, and a bucketed
    time series (`day | week | month | year`), all over an optional branch/date window.
28. Money is aggregated in integer minor units (paise) server-side; the API never formats
    currency and never uses floats.
29. `GET /api/admin/reports/orders` exports the same window/status query as a CSV
    (`text/csv`, attachment `orders-report.csv`) with proper escaping, built by the
    analytics service and matched by its unit tests.
30. Every dashboard computation reuses existing order/payment/partner queries — no new
    aggregation tables, no writes, read-only by construction.

### Frontend — admin console (`apps/web`)

31. `apps/web/src/pages/admin/AdminLayout.tsx` provides the role-appropriate admin shell
    (desktop-first, responsive nav: Overview, Branches, Orders, Catalogue, Managers,
    Partners, Audit, Reports); `AppRoutes` mounts eight flat, guarded
    `RequireRole(['SUPER_ADMIN'])` routes.
32. `AdminOverviewPage` — interactive dashboard (branch/date/bucket filters) rendering
    metric cards, Recharts area/bar charts, status/payment/top-product breakdowns and
    cancellation/refund/delivery panels (Recharts confined to `apps/web`).
33. `AdminReportsPage` — revenue bar chart, orders line chart, branch performance table,
    order-status/payment-method breakdown tables, and a server-generated orders CSV
    download via a client Blob.
34. `AdminBranchesPage` — branch cards with status badges, confirmation-guarded
    Pause/Activate/Deactivate actions (`ConfirmDialog`), and inline edit of delivery
    radius/address.
35. `AdminManagersPage` — searchable/branch/status-filtered manager list with pagination,
    create-manager modal (one-time password shown once with a copy action), and
    confirmation-guarded status actions (incl. suspend).
36. `AdminCataloguePage` — Products/Categories segmented view: global product add/edit
    modals with image add/promote/remove, category add/edit, and server error surfacing.
37. `AdminOrdersPage`, `AdminPartnersPage`, `AdminAuditPage` — cross-branch order list
    (branch/status filters), partner list (search/branch/status filters with availability +
    status badges), and the global audit explorer (kind/branch/entity/date filters,
    pagination, CSV export).
38. Admin UI tests: `admin-operations.test.tsx` (12 tests) covers the dashboard metrics,
    branch pause + radius edit, manager create + one-time password reveal, orders/partners
    filtering, audit list + CSV export, and the reports CSV download — all against the
    mocked API client, with a `ResizeObserver` stub for the Recharts containers.

## Frontend safety net, unchanged

Admin pages reuse the existing `client.ts` API layer and shared contracts (no duplicated
types), the existing `EmptyState` / `ConfirmDialog` / `icons` components, the shared
`formatPaise` / `formatDateOnly` helpers, and `ORDER_STATUS_LABELS` /
`ORDER_STATUS_FILTERS` / `PAYMENT_METHOD_LABELS` / `AVAILABILITY_LABELS` /
`PARTNER_STATUS_LABELS`. No react-query / react-hook-form / zod was introduced; pages use
hand-rolled `useState` / `useCallback` / `useEffect`. TypeScript is strict with no `any`.

## Guardrails honored

- No hard-coded branch, city, or branch-specific value in code or UI; branch data is
  always surfaced through the `branches` entity and `branchId` relationships.
- Server remains the source of truth for authorization, discounts, prices and
  suspension enforcement; the frontend never asserts its own authorization.
- No schema change or migration ran; no DB models were added; `Payment.status` refund
  reporting only (no refund action flow — that requires a schema change in a later
  phase).
- Recharts was added to `apps/web` only; no forbidden dependency or platform.
- Demo/development credentials remain seeding-only — never hard-coded into the
  frontend or exposed via APIs; no secrets committed, `.env*` untouched.
- Nothing was committed (`git status` + `git diff` are the only phase-7 git operations);
  work stops at the Phase 7 boundary.

See `docs/architecture.md` for the decision log (ADRs 22–27) and the updated phase
status.

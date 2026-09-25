# Phase 10B — Cash on Delivery (COD, cash only) (delivered)

Status: **complete and verified.** Phase 10B ships Cash on Delivery as a **cash-only** payment
method across the whole Hungry Box app: customers place a COD order with no money up front,
the delivery partner collects cash at the door (and the branch manager can record a missed
phone-side collection), the order closes as `PAID`, and every step is visible on the customer
detail/success pages, the delivery partner dashboard, the manager order detail, and the
super-admin analytics overview.

COD is the **first second-payment-path in the existing Phase 4 payments architecture** and was
built so it cannot be abused as a free online order: a COD order is created on its own
server-authorized endpoint, gets its own `Payment` row (`method='COD'`, `provider='cod'`,
`status='PENDING'`), and is excluded from the payment-intent/provider/verification boundary by
construction.

This phase is **repository-only**: no commits, no push, no deployment, no `db push`, no
`migrate reset`, no reseed. The locked baseline commit is `cc0c5fa`.

## Verification gates (all green this session)

- `npm run typecheck` — shared + api + web pass.
- `npm run lint` — api + web pass (eslint clean).
- `npm run build` — shared, api, web pass (see final gate re-run below).
- `npm run test:api` — 40 files, **345 passed / 5 skipped** (the 5 skipped are the gated live
  e2e suites; +13 vs Phase 9's 332).
- `npm run test:web` — 16 files, **109 passed** (+8 vs Phase 9's 101).
- `npx prisma validate` — schema valid (non-destructive).
- Migration applied via the safe flow **`prisma migrate dev --create-only` → `prisma migrate
  deploy`**; `migration_lock.toml` now present in `apps/api/prisma/migrations`.

## Delivered checklist

### B1 — Data model & migration (COD payments carry collection attributes)

1. `Payment` gains `collectedAt DateTime?`, `collectedByRole PaymentCollectedByRole?` (enum:
   `DELIVERY_PARTNER`, `BRANCH_MANAGER`), `collectedById String?` + nullable FK to `User`
   (collected-by is written **only by the server** on successful collection).
2. `PaymentMethod` enum gains `COD`.
3. One migration, `20260924184622_phase6_cash_on_delivery` (created `--create-only`, applied
   via `prisma migrate deploy`). It also folds in two previously-unmigrated schema changes
   from earlier phases: the `AuditEvent.branch_id` FK (Phase 6 backfill materialized) and the
   `PartnerIdCounter` default. `prisma generate` run after apply.
4. `migration_lock.toml` (was missing) now declares the Postgres provider — added so the
   migration directory is a valid Prisma 7 migration set.

### B2 — Shared contracts (`packages/shared`, dist rebuilt)

5. `PaymentMethod = 'COD'`; `OrderPaymentDto` + `collectedAt/collectedByRole/collectedById`
   (`string | null`; `collectedById` is **hidden from customers** by the mapper).
6. `OrderSummaryDto.paymentMethod: PaymentMethod | null`; `DeliveryOrderSnapshotDto` +
   `paymentMethod/paymentStatus` so the partner UI can show the cash prompt.
7. `CreateCodOrderInput { idempotencyKey, addressId, notes? }`; `DeliverAssignmentInput` +
   `cashCollected?: boolean`; `CodSummaryDto { totalOrders, collectedCount, collectedMinor,
   uncollectedCount, uncollectedMinor }` + `DashboardSummaryDto.cod`.
8. Shared package rebuilt (`tsc -p packages/shared/tsconfig.build.json`) so both apps consume
   the types (type-only usage this phase, as before).

### B3 — Checkout & order creation (server-authoritative)

9. `CheckoutService.previewMethods()` adds `COD` to the available methods list for any
   serviceable order (preview still server-checked; COD needs no intent).
10. `PaymentsService.createCodPayment()` builds the `Payment` row `provider:
    'cod'` (`COD_PROVIDER_ID`), `providerPaymentId: 'cod_<uuid>'`, method `COD`, status
    `PENDING`, amount = server-computed order total — no provider, no intent, nothing to
    verify. `crypto.randomUUID()` supplies the ids, matching the rest of the app.
11. `OrdersService.createCod({ idempotencyKey, addressId })` → `POST /orders/cod`
    (CUSTOMER only): reruns the same checkout validation/conflict flow (unserviceable →
    `checkout.unserviceable`, prices changed → 409 with fresh preview), creates the order
    (branch + address + server item snapshots + confirmed totals), creates the pending COD
    payment, and returns the standard `OrderDetailDto` with `paymentStatus: 'PENDING'`.
12. **Idempotent**: reusing an `idempotencyKey` returns the existing COD order without
    creating a second payment (same guarantee as Phase 4).
13. Audits `COD_ORDER_CREATED` (new AuditKind). No gateway verification applies.

### B4 — Delivery partner cash collection (`deliver`)

14. `deliver(assignmentId, { cashCollected })` — pending COD payment with
    `cashCollected: true` → payment `PAID` with `collectedAt/collectedByRole(
    'DELIVERY_PARTNER')/collectedById` **and** order `paymentStatus: 'PAID'` inside the same
    transaction as the DELIVERED assignment. Audits `COD_COLLECTED` + `DELIVERY_COMPLETED`;
    realtime event announced.
15. Pending COD + `cashCollected` absent/false → `DeliveryConflictException
    ('delivery.cash_not_collected')`, assignment untouched, audit `COD_COLLECTION_FAILED`.
16. A COD payment **already collected** (e.g. by the manager) is never overwritten — the
    deliver path just completes the delivery.
17. `DeliveryOrderSnapshotDto` + `paymentMethod/paymentStatus` added to the assignment mapper
    (public order fields only, no PII extras).

### B5 — Branch manager correction (`collectCod`)

18. `POST /branch/orders/:id/collect-cod` (SUPER_ADMIN + BRANCH_MANAGER;
    `BranchActor.userId` required). Records the real-world cash collection when the phone-side
    step was missed: reason required (`BadRequestException`), a guarded
    `payment.updateMany` on `{ orderId, method: 'COD', status: 'PENDING' }` — double-collect
    throws `cod.already_collected` — then the order payment closes `PAID`. Audits
    `COD_COLLECTION_CORRECTED`. DTO lives in the branch-orders module
    (`dto/correct-cod-collection.dto.ts`), branch-scoped as all branch-orders routes.

### B6 — Analytics & reports

19. `AnalyticsService.codSummary()` → `CodSummaryDto` (total COD orders, collected count /
    amount, pending count / amount) wired into the admin dashboard `cod` block; the at-risk
    rollup nets out cancelled COD orders (uncollected money that can never now be collected).
20. Analytics CSV gains `collectedAt,collectedByRole,collectedById` columns.

### B7 — Frontend: customer

21. `CheckoutPage` — "Cash on delivery" option (server-driven list), button becomes
    **"Place order · Pay ₹X on delivery"**, no intent/simulator, POSTs `/orders/cod`
    directly, same confirm-dialog routing when prices changed, COD-aware footer note.
22. `OrderSuccessPage` — "To pay on delivery" + "₹X — in cash" instead of "Payment / Paid".
23. `OrderDetailPage` — "Collected <when> · by partner / · by branch" line for closed COD
    payments.
24. `order-status.ts` — `PAYMENT_METHOD_LABELS['COD'] = 'Cash on delivery'`.

### B8 — Frontend: delivery partner

25. `AssignmentCard` — COD badge: "Cash collected" (emerald) when `PAID`, "Collect ₹X cash"
    (amber) when `PENDING`; online-paid assignments unchanged.
26. `AssignmentActionPanel` — for `OUT_FOR_DELIVERY` COD-pending work the primary action is
    **"Collect cash & mark delivered"** which opens a confirm dialog with an explicit
    "I received ₹X in cash" checkbox; delivery refuses to complete until cash is confirmed and
    calls `deliver(id, token, true)`. Pre-paid deliveries keep "Mark as delivered".

### B9 — Frontend: branch manager

27. `ManagerOrderDetailPage` — COD collection section: "Collected … by partner / by branch"
    on paid rows, a **"Cash collected — record it"** button for pending COD payments that
    opens a reason-required dialog (POST `/branch/orders/:id/collect-cod`), and human
    labels for the new audit kinds.

### B10 — Frontend: super admin

28. `AdminOverviewPage` — COD summary cards: cash-on-delivery orders, **Cash collected**
    (amount + order count), **Cash pending** (amount + order count) from `dashboard.cod`.

### B11 — Tests

29. **API (+13 → 345):** `orders.service.spec` — 4 new `createCod` cases (happy path with
    server totals + `COD_ORDER_CREATED` audit, no-gateway-verification, unserviceable
    conflict, idempotency replay); `delivery-assignment.service.spec` — 3 new COD cases
    (collect-on-deliver with payment+order+audit, `delivery.cash_not_collected`, no-overwrite
    of already-collected); `branch-orders.service.spec` — manual collection +
    `cod.already_collected` double-collect; `analytics.service.spec` — COD summary + CSV
    columns + uncollected-net-of-cancelled rollup; `checkout.service.spec` — preview methods
    now include `COD`.
30. **Web (+8 → 109):** checkout COD placement (createCod + no intent/create), COD
    confirm-dialog routing, success-page "to pay on delivery", order-detail "by partner"
    attribution, delivery-dashboard COD collect dialog (blocked without checkbox,
    `deliver(…, true)`) plus pre-paid deliver regression, manager record-cash-collection with
    reason, admin COD summary cards, order-status COD label.
31. Every pre-existing fixture updated for the widened DTOs (`paymentMethod`,
    `paymentStatus`, collection attributes) — the public contract is exhaustively covered.

## Multi-branch & architecture invariants preserved

- COD lives on `Payment`/`Order` — no branch-specific constants, no Guntur literals anywhere.
- Branch scoping intact: customer `/orders/cod` is CUSTOMER-only; manager collect-cod is
  branch-scoped and `BranchActor.userId`-guarded; roles unchanged (`SUPER_ADMIN`,
  `BRANCH_MANAGER`, `DELIVERY_PARTNER`, `CUSTOMER`).
- Global product data untouched; COD is a payment attribute, not a product/catalog concept.

## Security posture

- COD orders **cannot** be placed through the payment-intent path and online orders
  **cannot** be converted to COD — the mock gateway is never involved for COD, and
  cash-collection state is only ever written server-side from the delivered/correction
  flows.
- Pending-COD refusal is enforced on the server (`delivery.cash_not_collected`); the web UI
  checkbox is UX, never authorization.
- Double collection is impossible (`payment.updateMany` PENDING guard +
  `cod.already_collected`); collected-by actor data is server-authoritative and the
  customer-facing API suppresses `collectedById`.
- No secrets introduced; `.env*` untouched; demo credentials unchanged.

## Files added / modified

Added:
- `apps/api/prisma/migrations/20260924184622_phase6_cash_on_delivery/` (+ `migration_lock.toml`)
- `apps/api/src/modules/orders/dto/create-cod-order.dto.ts`
- `apps/api/src/modules/deliveries/dto/deliver-assignment.dto.ts`
- `apps/api/src/modules/branch-orders/dto/correct-cod-collection.dto.ts`
- `packages/shared/dist/*` (rebuilt)

Modified (highlights):
- `apps/api/prisma/schema.prisma`, `apps/api/src/modules/orders/{orders.service,order.mapper,
  orders.controller}.ts`, `apps/api/src/modules/payments/payments.service.ts`,
  `apps/api/src/modules/deliveries/*`, `apps/api/src/modules/branch-orders/*`,
  `apps/api/src/modules/checkout/checkout.service.ts`, `apps/api/src/modules/analytics/*`,
  `apps/api/src/modules/audit/audit.service.ts`,
  `apps/api/src/common/exceptions/delivery-conflict.exception.ts`, plus 8 API spec files.
- `apps/web/src/api/client.ts`, `CheckoutPage.tsx`, `OrderSuccessPage.tsx`,
  `OrderDetailPage.tsx`, `order-status.ts`, `AssignmentCard.tsx`, `AssignmentActionPanel.tsx`,
  `ManagerOrderDetailPage.tsx`, `AdminOverviewPage.tsx`, plus 5 web test files.
- `packages/shared/src/{orders,delivery,analytics}.ts`.
- `docs/architecture.md` (Phase 10B status), `docs/phase-10b-report.md` (this file).

## Architecture decision records (ADR-041..042)

**ADR-041 — Single COD migration folds in two pending schema fixes.** The Phase 6
`AuditEvent.branch_id` FK and the `PartnerIdCounter` FK default were created in earlier
sessions but never shipped in a migration (`migrate dev --create-only` shows pending drift).
Rather than leave the migration set in a partially-materialized state, the 10B COD columns
ship together with those two corrections in one non-destructive, deployable migration.
Accepted: migration history is now "bundled"; rejected: `db push` or `migrate reset`, which
would violate the non-destructive rule.

**ADR-042 — COD is a first-class but non-gateway payment path.** Reusing `Payment` with
`method='COD'`/`provider='cod'` gives analytics, refunds, and reports a single model, while
creating it on a dedicated endpoint keeps gateway verification out of COD by construction.
Cash is only ever moved to `PAID` from the two audited server flows (partner delivery,
manager correction); `collectedById` is hidden in the customer payload. Deferred to future
phases: COD via payment-intent/link, partial-payment & change handling, and enforcing
exactly-one-COD-payment-per-order (the UI and create path already produce one).

## Guardrails honored

- No commits, no push, no deployment, no Cloudinary/KYC/PhonePe work, no backup access, no
  destructive DB commands, no hard-coded credentials, no new Guntur logic, no schema logic
  leaked into the frontend, no secrets exposed. `.env*` untouched. Everything is left
  **uncommitted** for owner review.

## Final gate summary (re-run at end of session)

| Gate | Result |
| --- | --- |
| `prisma validate` | pass |
| shared build / dist | pass |
| api typecheck + lint | pass |
| api tests | 345 passed / 5 skipped |
| web typecheck + lint | pass |
| web tests | 109 passed |
| full `npm run build` | pass |
| git commits | none (`cc0c5fa` still HEAD) |
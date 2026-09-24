# Phase 4 Report — Checkout, Payments & Orders

Status: **Implemented.** All unit tests green (API 177 passed / 2 skipped live-e2e, web 40
passed), typecheck + lint + format + build clean. See section 28 for what could not run in
this environment and the exact local commands to run it.

---

## 1. Phase 4 objective & scope

Phase 4 turns the buyer path from "browse + cart" into "pay + receive an order" without
breaking the Phase 1–3 architecture:

- Server-verified checkout: preview, price-change/unavailability conflict detection, payment
  intent.
- Pluggable payment-provider abstraction with a `dev` simulator (a real gateway slots in via
  `PAYMENT_PROVIDER`, no API/client changes).
- Transactional, idempotent order creation with immutable item/address/payment snapshots.
- The order state machine covering the full lifecycle the platform supports.
- Branch-scoped order operations for `SUPER_ADMIN`/`BRANCH_MANAGER`.
- Append-only audit log for order/payment events.
- Customer web pages: checkout, success, history, detail (with status timeline), cancel.

Delivery-partner assignment, pickups and live map tracking are **out of scope (Phase 5)**.

## 2. Multi-branch invariants preserved

No branch name, branch id, city, or radius literal entered code/contracts/config in Phase 4:

- Previews, intents, order numbers and all queries key off `branchId`/data relations, never a
  constant.
- Serviceability, branch resolution, and branch scoping reuse the Phase 3 model
  (`Address.latitude/longitude` + `Branch.deliveryRadiusKm`).
- The delivery fee and tax are **environment configuration** (`DELIVERY_FEE_MINOR`,
  `CHECKOUT_TAX_MINOR`), not constants.

A new branch remains a data-seed exercise.

## 3. Stack & dependency decisions

The mandatory stack is unchanged: React + TS + Vite + Tailwind (web); NestJS REST (api);
PostgreSQL + Prisma (data); Railway (deploy). Phase 4 added **no new third-party runtime
dependencies** — the payment abstraction, conflict model, state machine, and audit log are
implemented with existing primitives (config service, class-validator DTOs, Prisma
transactions). Keep it that way when a real gateway arrives: only the gateway SDK is added,
behind the existing `PaymentProvider` interface.

## 4. Shared contracts

All Phase 4 DTO shapes live in `packages/shared/src/orders.ts` (order enums, preview, intent,
payment, DTOs). They remain **type-only**: neither app value-imports shared runtime
constants. The web keeps its own `as const` label/step arrays in
`apps/web/src/features/orders/order-status.ts`, so the shared package still ships
declarations only (ADR-003 / ADR-002 build-step gate respected). No type was duplicated
inside the apps.

## 5. Prisma schema — new models

Migration `20260925000000_phase4_checkout_payments_orders` adds:

- `Order` — order number (uniq), `branchId`, `customerId`, `status`, `paymentStatus`,
  totals (items, delivery, tax, order total), `notes`, `placedAt`, `cancelledAt`, plus
  per-status timestamps (`confirmingAt`, `preparingAt`, `readyAt`, `outForDeliveryAt`,
  `deliveredAt`, `cancelledAt`).
- `OrderItem` — immutable line: product id/name snapshot, unit price/discount snapshots,
  quantity, line totals.
- `OrderAddress` — immutable delivery snapshot (label, recipient, phone, address lines,
  city, state, `postalCode`, coordinates, instructions).
- `Payment` — provider, provider ids, `method`, `status`, `amountMinor`, `currency`,
  `orderId` (nullable until order commit), `paidAt`, `failedAt`.
- `OrderEvent` — append-only journal: `kind`, `fromStatus`, `toStatus`, `actorRole`,
  `actorUserId`, `metadata`.
- `AuditEvent` — global audit table (actor login, role, action, resource, context, details).
- `IdempotencyKey` — `(key, customerId)` unique, used for replay-safe order creation.
- `OrderNumberCounter` — daily sequence for `HB-YYYYMMDD-######` numbers.
- `DevPaymentRecord` — simulator bookkeeping (demo data, clearly named).

## 6. Prisma schema — enums, indexes, uniqueness

New enums: `OrderStatus` (`PLACED | CONFIRMED | PREPARING | READY_FOR_PICKUP |
OUT_FOR_DELIVERY | DELIVERED | CANCELLED`), `PaymentStatus` (`PENDING | AUTHORIZED | PAID |
FAILED | CANCELLED`), `PaymentMethod` (`UPI | CARD | NET_BANKING | WALLET`), plus
`OrderEventKind` and `OrderEventActorRole`. Key uniqueness/indexes: `Order.orderNumber`
unique; `IdempotencyKey` unique `(key, customerId)`; `Payment.paymentNumber` unique;
order-status + branch query indexes for the manager list filters; `OrderEvent(orderId)`,
`AuditEvent(createdAt)`.

## 7. Migration strategy

Strictly incremental: the Phase 4 migration only adds the new tables/enums and their
relations; **no historical migration was edited** and no existing Phase 2/3 data shape was
changed. `prisma migrate dev` resolves cleanly against the Phase 3 base. The schema was
validated (`prisma validate` passed) and the client generated in earlier steps; the live
apply command could not run here (no local Postgres — see section 28).

## 8. Configuration

New env keys (`.env.example` updated with placeholders):

- `PAYMENT_PROVIDER` (default `dev`) — selects the payment provider registry entry.
- `DELIVERY_FEE_MINOR` (default `3000`) — flat delivery fee in paise, policy-based.
- `CHECKOUT_TAX_MINOR` (default `0`, percent) — tax policy applied over subtotal.

All three are read at runtime by the relevant policy/service; none is hard-coded in client
code. Secrets (gateway keys etc.) must stay in env, never committed.

## 9. Checkout preview

`POST /checkout/preview { addressId }` (CUSTOMER) re-derives the whole order server-side:

1. Resolves the branch from the active cart for this customer.
2. Loads the saved address and recomputes serviceability for the branch.
3. Re-reads `BranchProduct` for every cart line: availability, current unit price/discount;
   compares with the cart snapshot to detect drift.
4. Computes line totals, delivery fee (fee policy), tax (tax policy), order total.
5. Classifies every line and the address.

Response `CheckoutPreviewDto`: lines (with `isAvailable`, `priceChanged`), monetary
breakdown, `issues` (human-readable), `status` (`ok | unavailable | unserviceable`),
`needsConfirmation`, `availablePaymentMethods`. The frontend never computes amounts — it
renders what the server sends.

## 10. Checkout validation & conflict policy

Preview is a warning, not a contract: between preview and order creation the world can
change. `CheckoutValidationService` is the single authority used by **both** preview and the
creation transaction. On a blocking change during creation, `CheckoutConflictException`
returns HTTP 409 with `{ code, preview }` and the fresh preview in the body:

- `checkout.prices_changed` — a unit price/discount moved (client shows a confirm dialog).
- `checkout.unavailable` — an item became unavailable.
- `checkout.unserviceable` — the address fell out of the branch radius.

The client reads `preview` from the error payload (the web `ApiError.details` carries the
raw body) and re-displays server truth instead of silently repricing.

## 11. Checkout payment intent

`POST /checkout/payment-intent { addressId, method }` (CUSTOMER) re-validates the same input
set, ensures the address is serviceable, ensures the chosen method is in the server's
available list, computes the authoritative total, and calls
`createPaymentIntent` on the payment provider. It records a `Payment` row (PENDING) with
`paymentNumber`, provider ids, `amountMinor`, and `method`. The client never sends an amount.

## 12. Payment provider abstraction

`PaymentProvider` interface (`createPaymentIntent`, `verifyPayment`, `cancelPayment`) is
implemented by providers registered in `PaymentProviderRegistry`, selected by
`PAYMENT_PROVIDER`. Phase 4 ships `DevPaymentProvider`. A production gateway (e.g. Razorpay)
is a new provider class + registry entry — controllers, services, and the web client are
untouched. This is ADR-012.

## 13. Dev payment provider / simulator

`DevPaymentProvider` performs no I/O: creating an intent returns a deterministic id and the
simulation outcome is recorded when `POST /payments/dev/simulate { providerPaymentId,
outcome }` (success | failure) is called by the user in the client. This exercises the full
UX — paying, simulating a declined card, a provider error — without a real gateway. Falls
back to `dev` when `PAYMENT_PROVIDER` is unset so local dev works out of the box.

## 14. Payment verification & security

`POST /payments/verify { paymentId }` (CUSTOMER) asks the provider to confirm payment and
marks the row accordingly:

- Only the owning customer can verify a given payment (row lookup scoped by `customerId`;
  foreign ids 404).
- Provider failure → `PaymentNotVerifiedException` (code `payment.not_verified`, HTTP 409).
- `PAID` is only set after the provider says so — never on client claim.
- Sentinels: `paidAt` set on success; the order creation tx performs a final
  `requireFinalVerification` before committing (see section 15).

## 15. Order creation transaction

`POST /orders { paymentId, idempotencyKey, addressId, notes? }` (CUSTOMER) runs one
`$transaction` that:

1. Pre-checks the `IdempotencyKey` (replay short-circuits to the existing order).
2. Re-verifies the payment with the provider (`requireFinalVerification`).
3. Re-loads the cart and re-runs `CheckoutValidationService`; on conflict returns 409 with a
   fresh preview (no half-created rows).
4. Allocates the next order number (`OrderNumberService.next(tx)`).
5. Creates `Order` from the validated items, snapshot `OrderItem`s, `OrderAddress`,
   `ORDER_CREATED` `OrderEvent`; sets `Payment.orderId` + `PAID` + `paidAt`; writes the
   `IdempotencyKey`, `AuditEvent.ORDER_CREATED`, and deletes the cart.
6. If the tx rolls back after the payment was confirmed but before commit, a follow-up
   lookup replays the customer's existing order instead of failing — correctness, not a
   double-order.

## 16. Idempotency

Order creation is **replay-safe**: the client generates a random `idempotencyKey`
(`crypto.randomUUID()`) per checkout. Key is unique per customer. A retry (network error,
double-tap, backoff replay) hits the unique constraint / pre-check and returns the already
created order rather than a second one. A key that belongs to another customer is rejected.
This is ADR-014.

## 17. Order number generation

`OrderNumberService` issues `HB-YYYYMMDD-######` numbers via an `OrderNumberCounter` row
(per day), incremented inside the creation transaction. This gives a customer-readable,
chronologically sortable identifier that needs no UUID-style length.

## 18. Order state machine

`OrderStateService` (shared by the customer and branch modules) enforces a strict forward
graph and records every step:

- Staff progression: `PLACED → CONFIRMED → PREPARING → READY_FOR_PICKUP → OUT_FOR_DELIVERY →
DELIVERED` (each transition advances to exactly the allowed next status).
- Every transition sets the matching timestamp (`confirmingAt`, `preparingAt`, `readyAt`,
  `outForDeliveryAt`, `deliveredAt`) and appends an `OrderEvent`.
- The Delivery Partner Assignment → Accepted → Picked Up segment (Phase 5) slots into this
  same model via the existing timestamp/event fields — no remodeling needed (section 8 of
  `architecture.md`).

## 19. Cancellation policy

- Customer: cancellable only in `PLACED` / `CONFIRMED` (with optional reason). Later states
  are outside the customer cancel window.
- Staff (`SUPER_ADMIN`/`BRANCH_MANAGER`, own branch): cancellable from `PLACED` through
  `READY_FOR_PICKUP`; cancel sets `CANCELLED`, `cancelledAt`, appends event + audit, records
  the reason.
- No implicit auto-refunds in Phase 4 (documented; refunds are a later payment concern).

## 20. Order snapshots are immutable

`OrderItem`, `OrderAddress`, and the payment amount are copied at order time and **never
recomputed** from current catalog/address data. Drift is instead surfaced through the 409
conflict flow at the _checkout_ boundary, so a placed order is a stable business/legal
record (ADR-015).

## 21. Customer orders API

- `GET /orders?status=…` — the customer's list (optional status filter, newest first).
- `GET /orders/:id` — detail with payment + events; foreign ids are 403/404 (never
  disclosed).
- `POST /orders` — transactional creation (section 15).
- `POST /orders/:id/cancel` — cancel within the window (section 19).
- Controller is `@Roles('CUSTOMER')`; branch id comes from the cart, never from the client.

## 22. Branch orders API & branch scoping

`POST /branch/orders` routes under `/branch/orders`, roles `SUPER_ADMIN` /
`BRANCH_MANAGER`:

- `GET`, `GET /:id`, `POST /:id/status` (advance to next status), `POST /:id/cancel`.
- List filters: `status`, `from`/`to` (ISO dates), and `branchId`.
- **Scoping**: manager is pinned to `user.branchId`; `SUPER_ADMIN` may pass a `branchId`.
  Every read/details/transition resolution is filtered by the enforced branch id — a manager
  can never see or mutate another branch's order (IDOR-proof, server-side). This is the
  `BranchScopeGuard`-style rule carried into the service layer where guard param-mapping is
  not applicable.

## 23. Audit logging

`AuditService.record` writes `AuditEvent` rows (actor login, role, action kind, resource,
context, details). Phase 4 kinds: `ORDER_CREATED`, `PAYMENT_INITIATED`, `PAYMENT_VERIFIED`,
`PAYMENT_FAILED`, `ORDER_STATUS_CHANGED`, `ORDER_CANCELLED`, `CHECKOUT_CONFLICT`,
`IDEMPOTENCY_REPLAY`. Sensitive values (hashes, tokens, payout data) are never written; the
customer-facing UI never queries audit rows (internal concern).

## 24. Frontend — API client, routes, cart wiring

- `apps/web/src/api/client.ts`: `ApiError.details` carries the raw error payload; the
  response parser tolerates empty bodies (the dev simulate route returns none); added
  `checkoutApi` (`preview`, `payment-intent`), `paymentsApi` (`verify`, `devSimulate`),
  `ordersApi` (`list`, `get`, `create`, `cancel`), typed against shared contracts.
- Routes under `/customer`: `checkout`, `checkout/success/:orderId`, `orders` (history /
  profile), `orders/:orderId`. Route param is `:orderId` (page + tests use
  `useParams().orderId`).
- `CartContents` gained an `onCheckout` prop; the cart sheet/page now route to
  `/customer/checkout`; the cart clears server-side after a successful order.

## 25. Frontend — checkout page

`CheckoutPage` walks `create preview → choose address/method → payment intent → (dev)
simulate → verify → place order`, and on success clears the cart and navigates to the
success page. It:

- Renders totals/issues from the server preview only (never computes prices).
- Blocks the pay button while the preview reports `unavailable`/`unserviceable`.
- Shows the price-changed `ConfirmDialog` when `needsConfirmation` (from the preview or from
  a 409's fresh `preview`).
- Sends a fresh `crypto.randomUUID()` idempotency key with the create call.
- Surfaces simulation outcome (success/failure) in the dev flow so the full path is testable
  without a gateway.

## 26. Frontend — success, history, detail pages & timeline

- `OrderSuccessPage`: fetches the placed order; shows number, address, totals, and links to
  history/detail.
- `OrderHistoryPage` (default export of `OrdersPage`): tabs (All / Active / Delivered /
  Cancelled) with counts fetched from the API; status badges; per-row links. Profile body
  moved to `OrdersProfilePage`.
- `OrderDetailPage`: `OrderTimeline` rendered from `OrderEvent`s (cancelled orders show the
  steps reached before cancellation plus the Cancelled node), immutable snapshot items,
  address, `payments[0]` payment summary, totals, and the cancel flow (ConfirmDialog with
  `danger` styling + optional reason). Hide the cancel action when outside the window.
- `lib/format.ts` centralizes date formatting; `features/orders/order-status.ts` is the
  single source of web-side labels/steps.

## 27. Testing

API (Vitest, Prisma mocked): **177 passed / 2 skipped** (gated live e2e). New suites:
`orders.service.spec` (15), `order-state.service.spec` (31), `branch-orders.service.spec`
(11 — branch scoping/IDOR, transitions, timestamps), `payments.service.spec` (13),
`checkout.service.spec` (10), `checkout-validation.service.spec` (9).

Web (Vitest + Testing Library, API client mocked): **40 passed** across 6 files. New:
`order-status.test.ts` (4), `OrderTimeline.test.tsx` (2), `order-flow.test.tsx` (13 — happy
path with idempotency key, simulated failure, price-changed confirm dialog, 409 conflict
preview, unavailable-issue blocking, history tabs, detail timeline + cancel with reason,
cart checkout button).

Full local gates run and passed: `npm run typecheck`, `npm run lint`, `npm run build`,
`npm run test`, `npm run format:check`. Docs (`README.md`, `docs/architecture.md`,
ADR-012…016) updated.

## 28. Limitations, local verification steps, summary

**Could not run in this environment** (no live PostgreSQL available):

- `npm run db:migrate` (apply Phase 4 migration) and `prisma validate` re-check against a
  real instance.
- `npm run db:seed` (demo data).
- Live smoke of checkout → simulate → verify → create against seeded data.
- `RUN_LIVE_E2E=1 npm run test:e2e` (gated suite).

Exact commands to run locally:
`docker compose up -d` → `npm run db:migrate` → `npm run db:seed` → `npm run dev:api` +
`npm run dev:web`; demo flow with `customer@gmail.com` / `20252025`, then
`RUN_LIVE_E2E=1 npm run test:e2e`.

**Summary.** Phase 4 delivers the complete buyer path: server-authoritative checkout with
conflict detection, a pluggable payment provider with a testable dev simulator, transactional
idempotent order creation with immutable snapshots, the full order state machine, branch-
scoped manager operations, audit logging, and the customer web experience — all without
violating the multi-branch or single-application invariants, and without adding deprecated
or out-of-scope functionality. Phase 5 begins after the local DB verification above.

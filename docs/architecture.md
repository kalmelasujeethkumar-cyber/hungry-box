# Hungry Box Architecture

This document records the architecture direction and key decisions. It is a living document;
update it when architecture decisions change (record a short ADR entry at the bottom).

## 1. Monorepo layout

npm workspaces monorepo. Each workspace carries its own `package.json`; the root
`package.json` provides shared scripts.

```
apps/api        NestJS REST API (@hungrybox/api)
apps/web        React + Vite + Tailwind frontend (@hungrybox/web)
packages/shared Shared TypeScript types/contracts (@hungrybox/shared)
```

## 2. Shared contracts

`packages/shared` is the single source of truth for contracts shared across apps (roles,
API response envelopes, health report shape, and later DTOs/entities).

- The package **builds to `packages/shared/dist`** (TypeScript declaration files via
  `tsc --emitDeclarationOnly`). Consumers (`apps/api`, `apps/web`) resolve `@hungrybox/shared`
  through the workspace symlink and the package `types` field — they always use the
  **built** package, never the source. Each app's `prebuild`/`pretypecheck`/`predev` script
  rebuilds shared first so the workspace stays self-contained.
- Phase 1 consumes shared contracts **type-only** (`import type …`). Before shipping shared
  _runtime_ values (constants, pure functions), add an ESM JS + types build step for the
  package and switch consumers to the runtime artifact (documented in the decision log).

## 3. Backend structure

NestJS, one module per bounded context under `apps/api/src/modules/`:

- `health/` — public health endpoint (Phase 1)
- Phase 2+: `auth/`, `branches/`, `users/`, `products/`, `branch-products/`,
  `customers/`, `orders/`, `payments/`, `deliveries/`, `notifications/`,
  `analytics/`, `audit/`, …

Cross-cutting:

- `apps/api/src/prisma/` — PrismaService (wired globally via `@Global()` module)
- Config via `@nestjs/config` (`ConfigModule.forRoot({ isGlobal: true })`)
- `main.ts` sets the global API prefix (`api`), CORS (from env), and port (from env)

### ORM decision

Prisma is the ORM of record. Rationale:

- Schema-as-source-of-truth with first-class migration tooling (`prisma migrate`).
- Strong TypeScript type safety and generated, typed client.
- Well-supported on Node + Postgres + Railway.
- Enforces the `branches` / `branch_id` relational design and branch data isolation at the
  data layer.

Prisma 7 specifics in this repo:

- Connection URL lives in `apps/api/prisma.config.ts` (via `env('DATABASE_URL')`), not in
  `schema.prisma`; the CLI reads envs explicitly through `dotenv`.
- The client is generated into `apps/api/src/generated/prisma` (generator `prisma-client`,
  required `output`) and is **git-ignored**; always import `PrismaClient` from that
  generated path, never `@prisma/client`.
- Prisma 7 requires a driver adapter: `@prisma/adapter-pg` + `pg` with the connection
  string from `DATABASE_URL`.
- `PrismaService` constructs the client only when `DATABASE_URL` is set, so the API (and the
  health check) still boots without a configured database in Phase 1. Later phases should
  make the database a hard requirement.

Phase 1 ships the datasource + generator only. **No business models yet**; they are added via
Prisma migrations in later phases.

## 4. Frontend structure

Vite + React + TypeScript strict. Tailwind CSS v4 is wired via `@tailwindcss/vite`; the brand
palette is exposed as Tailwind theme tokens in `src/index.css`:

| Token          | Value     |
| -------------- | --------- |
| `brand-teal`   | `#0091B9` |
| `brand-sky`    | `#BAE4F0` |
| `brand-navy`   | `#004E9B` |
| `brand-orange` | `#FF6500` |
| `brand-yellow` | `#FFD500` |

Future phases add React Router (role-based routing), TanStack Query (data fetching),
React Hook Form + Zod (forms/validation) on top of this foundation.

## 5. Multi-branch model (architectural invariant)

- Branch data is configurable data: `branches` table (name, city, state, country, lat/long,
  `delivery_radius_km`, status, ...). Never hard-code a branch.
- Branch-scoped records reference `branch_id`.
- Global product data (`product`) is separated from branch-specific data
  (`branch_product`: price, availability, branch discount, status).
- Delivery radius (`branch.delivery_radius_km`, currently 10 km for Guntur) is branch
  configuration, not a constant.
- A new branch requires zero code changes.

## 6. Roles & authorization model

- Single RBAC system, roles: `SUPER_ADMIN`, `BRANCH_MANAGER`, `DELIVERY_PARTNER`,
  `CUSTOMER` (shared constant in `packages/shared`).
- Enforcement is server-side. Branch-level authorization prevents IDOR-style access
  (a `BRANCH_MANAGER` may only touch resources whose `branch_id` matches their branch).
- After login the client routes the user into the role-appropriate experience; the server
  never trusts the client for authorization.

## 7. Security posture

Password hashing, JWT/session security, RBAC + branch authorization, input validation
(Zod/class-validator later), audit logging, server-side payment verification, protected
sensitive data (hashed secrets, payout info, tokens never exposed via API/logs), secure
document handling for KYC, and no secrets in git. Sensitive values live in environment
variables; `.env` files are git-ignored.

## 8. Order lifecycle (implemented in Phase 4)

Order Created → Confirmed → Preparing → Ready for Pickup → Delivery Partner assigned →
Accepted → Picked Up → Out for Delivery → Delivered, plus cancellation/refund states.
Phase 4 models all pre-assignment states and the full progression from `PLACED` through
`DELIVERED`; the delivery-assignment segment (partner assignment, accepted, picked up) is a
Phase 5 extension of the same field set, so the model fits the complete lifecycle without
reshaping.

## 9. Health check

`GET /api/health` returns service, version, uptime, timestamp, and database status
(`unconfigured` | `connected` | `unreachable`). The API starts and serves health even
without a database configured.

## 10. Deployment (Railway)

Each app deploys from its workspace directory (Procfiles / Railway config set up in a
deployment phase). Postgres provisioned via Railway. `DATABASE_URL` supplied via Railway
env vars. Secrets never committed.

---

## 11. Phase 2 — identity, roles & catalog (implemented)

### Data model

- Money is stored in integer minor units: `priceMinor` / `discountMinor` (paise).
  Effective price = `priceMinor - discountMinor`; the server is the only authority for
  discounts.
- `User.loginId` is the authentication identifier (unique). It may be an email-like value
  (`admin@gmail.com`) or a username (`shiva@`); never assume it is a valid email. `email`
  is a separate nullable unique column.
- `User.branchId` is nullable: `SUPER_ADMIN` has none, branch-bound roles
  (`BRANCH_MANAGER`, `DELIVERY_PARTNER`) reference their assigned branch. `CUSTOMER` users
  are not bound to a branch.
- `Branch.deliveryRadiusKm` is `DECIMAL` (km) and is branch configuration (Guntur seeds at
  10 km), never a constant.
- Global catalog: `Category`, `Product`, `ProductImage`. Branch-specific:
  `BranchProduct` unique on `(branchId, productId)` — price, discount, availability,
  status. Lifecycle statuses are modeled as enums (`UserStatus`, `BranchStatus`,
  `CatalogStatus`, `BranchProductStatus`) so Phase 3+ states (e.g. paused branches,
  suspended accounts) fit without migration churn.

### Authentication & authorization

- Passwords hashed with Argon2 (`@node-rs/argon2`). Login returns
  `{ accessToken, user }`; JWTs carry `{ sub, role, branchId }`.
- Three global guards (APP_GUARD order matters): `JwtAuthGuard` → `RolesGuard` →
  `BranchScopeGuard`.
  - `@Public()` opts a route out of JWT (login, health).
  - `@Roles(...)` enforces role-level RBAC.
  - `@BranchScope(param)` resolves the target branch from `params` / `body` / `query` and
    forbids non-matching `BRANCH_MANAGER`/`DELIVERY_PARTNER` requests (and all `CUSTOMER`
    requests). Server-sided: branch scope is never the client's job.
- Login failures are intentionally generic (`Invalid credentials`) for unknown ids, wrong
  passwords, and non-`ACTIVE` accounts; a dummy Argon2 verify runs for unknown ids to
  flatten timing. `lastLoginAt` updates only on success.
- `JWT_SECRET` is required in production (server refuses to boot); a predictable secret is
  only a local/dev fallback. Tokens are stored in `localStorage` in Phase 2 (documented
  trade-off; httpOnly cookies can replace it without breaking the routing contract).

### Validation & tests

- Global `ValidationPipe` (`whitelist`, `forbidNonWhitelisted`, `transform`).
- Unit tests (Vitest) mock Prisma via `PrismaService.requireClient()`. Live database
  flows live in a gated e2e suite that only runs when `RUN_LIVE_E2E=1` and `DATABASE_URL`
  is set with seeded data.

---

## 12. Phase 3 — customer storefront, addresses, serviceability & cart (implemented)

### Data model additions

- `User.phone` (nullable) — optional contact stored for the customer experience; kept
  distinct from `loginId`/`email`.
- `Address` — customer-owned delivery addresses: label, recipient, phone, house/flat,
  street/area, landmark, city, state, postal code, optional `latitude`/`longitude`,
  `deliveryInstructions`, `isDefault`. Addresses belong to a customer
  (`address.customerId`); a customer may have at most one default. Coordinates are
  optional so an address can exist without geodata (serviceability is skipped for it).
- `Cart` — one active cart per customer per branch: `@@unique([customerId, branchId])`.
- `CartItem` — line items referencing the global product and the branch product snapshot;
  `@@unique([cartId, branchProductId])`. Unit price/discount are **snapshotted from
  `BranchProduct`** when the quantity changes, so totals reflect server-side pricing at the
  time of the last mutation.

### Addresses (IDOR-proof CRUD)

- `AddressesModule` (`/addresses`): `GET /addresses`, `POST /addresses`,
  `GET/PATCH/DELETE /addresses/:id`, `PATCH /addresses/:id/default`. All mutations query
  `where: { id, customerId }` — a foreign address is indistinguishable from "not found"
  (404), preventing IDOR. If a customer has no addresses yet, the first created address is
  auto-promoted to default. Setting a default clears the others in a `$transaction`.
- Addresses are `CUSTOMER`-only. `requireActiveUser()` forces the session identity to be an
  `ACTIVE` user (the JWT `sub`); the JWT `branchId` is never used to scope customer data.

### Serviceability

- `POST /locations/serviceability` accepts `{ latitude, longitude }` (validated with
  class-validator `@IsLatitude`/`@IsLongitude` after `@Type(() => Number)`). Using
  latitude/longitude honors the multi-branch invariant: no city/branch constants.
- The server runs Haversine (R = 6371 km, rounded to 1 decimal) against **active** branches
  that have coordinates and picks the nearest within `branch.deliveryRadiusKm` (stored
  config, never a frontend/constant). Response:
  `{ serviceable, distanceKm, branch: { id, name, code, city, deliveryRadiusKm } | null }`.
  `branch` is `null` when not serviceable; `distanceKm` is `null` when no branches qualify.
- The frontend does no distance math; the API result is the single source of truth.

### Cart & server-side pricing

- One cart per `(customerId, branchId)`. `GET /cart?branchId=…` returns
  `CartSummary` (`id: null` when the cart row does not exist yet — table present, no rows).
- `POST /cart/items { branchId, productId, quantity }` **increments** quantity (upsert with
  `quantity: { increment }`), refreshing the unit price snapshot from `BranchProduct`.
  `PATCH /cart/items/:id` sets an absolute quantity (1..50, DTO-validated). `DELETE
/cart/items/:id` removes the line. `DELETE /cart?branchId=…` clears the cart row.
- Cart line ownership is enforced by joining through the cart's `customerId`; foreign item
  ids return 404. Price/discount/totals are always computed by the server — the client only
  sends `branchId`, `productId`, and `quantity`; the shared contract deliberately exposes
  prices in responses but never accepts them as input.
- Branch affinity: the UI stores the cart per branch and confirms the switch whenever a
  non-empty cart exists and the user changes the delivery branch ("kept aside" semantics —
  carts are never mixed nor silently destroyed).

### Catalog improvements

- Product search now matches across `name` **and** `description` (`OR`), combined with an
  optional `categorySlug` filter.
- `GET /catalog/products/:productId?branchId=…` returns full product details (ordered
  images, primary image, effective price, availability). Unavailable goods remain visible
  (flagged `isAvailable: false`); 404 when the product has no configuration for the branch.

### Frontend storefront

- One customer experience at `/customer/*` (`storefront`, `cart`, `addresses`, `orders`,
  `profile`) nested under a `CustomerLayout` that owns `StorefrontProvider` (branch /
  serviceability / catalog / addresses state) and `CartProvider` (per-branch cart).
  Mobile-first: sticky header, bottom navigation with large touch targets, full-width
  drawers, live location prompt, serviceability banner, search (debounced, server-side),
  category chips, product grid/cards, product detail dialog, and a cart sheet with server
  totals. Checkout is intentionally disabled until Phase 4.
- Money is formatted from integer minor units (`formatPaise`) on the client for display
  only. The "orders" page is a placeholder (Phase 4).

### Validation & tests

- Unit tests mock Prisma (`requireClient`) and the API client; the gated live e2e suite
  (`RUN_LIVE_E2E=1`) covers the customer flow: login, addresses CRUD + default + foreign
  404s, serviceability in/out of range, cart add/update/remove/clear, 401 without token,
  and rejection of client-supplied `priceMinor`.

---

## 13. Phase 4 — checkout, payments & orders (implemented)

### Data model additions

- `Order` — one order per checkout: `orderNumber` (`HB-YYYYMMDD-######`, unique, from an
  `OrderNumberCounter` row that increments inside the creation transaction),
  `branchId`, `customerId`, `status` (`OrderStatus`), `paymentStatus`, plus server-computed
  totals, `placedAt`/`cancelledAt` and per-status timestamps.
- `OrderItem` — immutable line snapshot: product id/name plus `unitPriceMinor`,
  `unitDiscountMinor`, quantities and line totals copied from the validated cart at order
  time. Items are never recomputed from the current product/branch-product pricing.
- `OrderAddress` — immutable delivery-address snapshot (`postalCode` field mirrors
  `Address.postalCode`), so a later address edit never rewrites an order's delivery target.
- `Payment` — one payment per order attempt: provider, provider ids, `method`
  (`PaymentMethod`), `status` (`PaymentStatus`), `amountMinor`, `currency`, `orderId`,
  `paidAt`. A payment transitions PENDING → (AUTHORIZED) → PAID only after verification.
- `OrderEvent` — append-only status/audit journal for an order (`kind`, `fromStatus`,
  `toStatus`, `actorRole`). The customer timeline is rendered from these rows.
- `AuditEvent` — global audit log (see Audit API below).
- `IdempotencyKey` — unique `(key, customerId)` pair that makes order creation replay-safe.
- `OrderNumberCounter` — daily sequential order numbers.
- `DevPaymentRecord` — bookkeeping for the development payment simulator (demo data only).

Phase 4 migration adds exactly these tables; nothing historical was edited.

### Checkout

- `POST /checkout/preview { addressId }` re-derives the entire order from the server: it
  resolves the branch from the cart and the address, re-reads `BranchProduct` pricing,
  applies the delivery-fee policy (`DELIVERY_FEE_MINOR`, default 3000 paise) and tax policy
  (`CHECKOUT_TAX_MINOR`, default 0), classifies every line as available/unavailable, flags
  unit-price changes vs. the cart snapshot, and computes serviceability for the address.
  Result: `CheckoutPreviewDto` with `status` (`ok` | `unavailable` | `unserviceable`),
  human-readable `issues`, the line items, `needsConfirmation` (true when any price changed
  or a line became unavailable) and `availablePaymentMethods`.
  `CheckoutConflictException` (409) returns `{ code, preview }` — codes:
  `checkout.prices_changed`, `checkout.unavailable`, `checkout.unserviceable`.
- `POST /checkout/payment-intent { addressId, method }` validates the same inputs, ensures
  the address is serviceable for the branch, and asks the payment provider to create a
  payment intent. Amounts are always server-derived; the client never sends a price.

### Payments (provider abstraction)

- `PaymentProvider` interface (`createPaymentIntent`, `verifyPayment`,
  `cancelPayment`) lives behind a registry selected by `PAYMENT_PROVIDER` (Phase 4 ships
  `dev`). A real gateway replaces the `dev` provider with a different entry point, no API or
  client changes.
- `POST /payments/verify { paymentId }` asks the provider to confirm the payment and marks
  the `Payment` row. Verification is a server responsibility; endpoints never trust client
  claims (`PaymentNotVerifiedException`, code `payment.not_verified`, when the provider
  reports failure).
- Dev-only: `POST /payments/dev/simulate { providerPaymentId, outcome }` marks the
  recorded simulation outcome so the full success/failure UX is exercised without a real
  gateway. Gated clearly as development tooling.

### Order creation (transactional, idempotent)

`POST /orders { paymentId, idempotencyKey, addressId, notes? }` (CUSTOMER) runs a single
`:begin`–`commit` transaction that:

1. Re-verifies the payment via the provider (`requireFinalVerification`) — a payment is only
   marked PAID when the order transaction commits.
2. Re-loads the cart, re-runs checkout validation, and rejects with a 409 conflict (fresh
   `preview`) if prices or availability changed again.
3. `OrderNumberService.next(tx)` for the order number.
4. Creates the `Order` (from the fresh `CartItem` snapshots), `OrderItem`s, the
   `OrderAddress` snapshot, the `ORDER_CREATED` event, sets `Payment.orderId`/`PAID`/
   `paidAt`, records the `IdempotencyKey`, writes `AuditEvent.ORDER_CREATED`, and deletes
   the cart (`tx.cart.deleteMany`).
5. In the (rare) event the transaction rolls back but the intent was already created, a
   follow-up lookup replays the same customer's existing order instead of failing (the
   `idempotencyKey` pre-check also short-circuits plain retries). A key owned by another
   customer is rejected.

`GET /orders` (optional `status` filter), `GET /orders/:id` (403/404 for foreign ids),
`POST /orders/:id/cancel { reason? }` (only `PLACED`/`CONFIRMED`) complete the customer
surface.

### Order state machine & branch operations

- `OrderStateService` (shared by customer and branch modules) enforces a strict forward
  graph for staff — `PLACED → CONFIRMED → PREPARING → READY_FOR_PICKUP →
OUT_FOR_DELIVERY → DELIVERED` (targets via `ADVANCE_STATUS_CHOICES`) — and a separate
  cancel policy: customer-cancellable `PLACED`/`CONFIRMED`, staff-cancellable
  `PLACED`…`READY_FOR_PICKUP`. Every transition sets the matching timestamp
  (`confirmingAt`, `preparingAt`, `readyAt`, `outForDeliveryAt`, `deliveredAt`; PLACED has
  none) and appends an `OrderEvent`.
- `BranchOrdersService` (`/branch/orders`, roles `SUPER_ADMIN`/`BRANCH_MANAGER`) scopes
  every read/transition to the caller's branch (`enforcedBranchId`: `SUPER_ADMIN` may pass
  `branchId`, a manager is always pinned to their own) — IDOR-style cross-branch access is
  rejected server-side. Filters: `status`, `from`/`to` (ISO dates), `branchId`.

### Audit

`AuditService.record` writes `AuditEvent` rows with actor, kind, context and details.
Order-related kinds: `ORDER_CREATED`, `PAYMENT_INITIATED`, `PAYMENT_VERIFIED`,
`PAYMENT_FAILED`, `ORDER_STATUS_CHANGED`, `ORDER_CANCELLED`, `CHECKOUT_CONFLICT`,
`IDEMPOTENCY_REPLAY`. Sensitive values (passwords, payout info, tokens) are never written.

### Frontend

- Customer pages under `/customer`: `checkout`, `checkout/success/:orderId`, `orders`
  (history with status tabs), `orders/:orderId` (timeline + snapshots + cancel). The cart
  sheet/page's "Proceed to checkout" is now live.
- Checkout flow: select a saved address → server preview (totals, issues, payment
  methods) → payment method → payment intent → (dev provider) simulate success/failure →
  verify → place order (with client-side `crypto.randomUUID()` idempotency key) → clear the
  cart → success page. 409 conflicts surface the server's fresh `preview` (e.g. the
  price-changed confirm dialog); the pay button is blocked while the preview reports issues.
- `OrderTimeline` renders the lifecycle from `OrderEvent`s; a cancelled order renders the
  steps reached before cancellation.
- The web API client (`apps/web/src/api/client.ts`) exposes `checkoutApi`, `paymentsApi`,
  `ordersApi`, and carries `ApiError.details` (raw payload) so conflict codes/previews are
  readable by the UI. `devSimulate` is the only route returning no body.
- Shared contracts are still consumed **type-only**; the web defines its own
  `as const` label/step arrays (`features/orders/order-status.ts`) so no runtime import of
  shared values is required.

### Multi-branch & security properties

- No branch/city literals anywhere: previews and order numbers key off
  `branchId`/seed data; the delivery fee is config (`DELIVERY_FEE_MINOR`) — never a
  constant in code. Branch ordering, serviceability and scoping reuse the Phase 3 model.
- The server is the sole authority for amounts, discounts, availability, serviceability,
  payment verification and state transitions; the client only ever sends identifiers and
  quantities. Payment never flips to PAID outside the committing order transaction.

### Validation & tests

- New unit coverage: `orders.service.spec` (15 — happy path, idempotent replay, stale
  conflict 409, foreign-id 403/404, cancel policies), `order-state.service.spec` (31),
  `branch-orders.service.spec` (11 — branch scoping/IDOR, transitions, timestamps),
  `payments.service.spec` (13), `checkout.service.spec` (10), `checkout-validation.service.spec`
  (9). API suite: **177 passed, 2 skipped** (gated live e2e).
- Web: `order-status.test.ts` (4), `OrderTimeline.test.tsx` (2), `order-flow.test.tsx` (13 —
  checkout happy path incl. idempotency key, simulated failure, price-changed confirmation,
  provider conflict 409, unavailable-issue blocking, history tabs, detail timeline + cancel,
  cart checkout button). Web suite: **40 passed**.
- Live flows (real gateway simulation end-to-end against a seeded DB) belong in the gated
  e2e suite (`RUN_LIVE_E2E=1`); Phase 4 does not land them here because no database is
  provisioned in this environment.

---

## Decision log

- **2026-09 / ADR-001 ORM:** Prisma (above).
- **2026-09 / ADR-002 Monorepo:** npm workspaces with `apps/*` + `packages/*`; shared
  runtime code gets a build step before shipping runtime values.
- **2026-09 / ADR-003 Shared package builds to `dist`:** shared emits declaration files
  (`tsc --emitDeclarationOnly`) and both apps consume the built package (no shared source in
  app compilation). Phase 1 imports are type-only; shared has no `main` until a runtime
  build step is added.
- **2026-09 / ADR-004 Money as integer minor units (paise):** `priceMinor`/`discountMinor`
  integers avoid float drift; server computes `effectivePriceMinor`.
- **2026-09 / ADR-005 Enumeration-safe login:** generic `Invalid credentials` for every
  failure mode plus dummy-hash timing parity; `loginId` normalization (trim; lowercase only
  when it contains `@`) keeps `shiva@` loginable.
- **2026-09 / ADR-006 Guard pipeline:** a JWT guard, a role guard, and a branch-scope guard
  registered as `APP_GUARD` keep auth/authorization declarative at the route layer.
- **2026-09 / ADR-007 Seeding policy:** deterministic, idempotent `prisma/seed.ts` (Argon2
  hashes) for demo data only; never auto-runs and never exposed through APIs.
- **2026-09 / ADR-008 Per-(customer, branch) carts:** `Cart @@unique([customerId, branchId])`
  and per-branch snapshot pricing keep carts correct multi-branch without mixing; metrics
  like `itemCount` and totals are computed server-side.
- **2026-09 / ADR-009 Server-side price snapshots:** each quantity mutation re-reads
  `BranchProduct` so discounts/availability are re-verified on the server at mutation time;
  the API never accepts client prices.
- **2026-09 / ADR-010 Haversine serviceability with per-branch radius:** distance logic uses
  latitude/longitude and `branch.deliveryRadiusKm` (config), keeping new branches
  code-change-free.
- **2026-09 / ADR-011 Addresses are user-scoped (IDOR-proof):** every address read/update is
  filtered by `{ id, customerId }`; foreign ids 404 like missing rows. `isDefault` is a
  per-customer invariant enforced in a `$transaction`.
- **2026-09 / ADR-012 Payment provider abstraction:** a `PaymentProvider` interface behind a
  registry selected by `PAYMENT_PROVIDER` lets a real gateway replace the Phase 4 `dev`
  simulator without API or client changes; total amounts are always provider/server-derived,
  never client-supplied.
- **2026-09 / ADR-013 Server-verified checkout & price-conflict policy:** previews re-read
  branch-product pricing/services and order creation re-verifies inside the same
  transaction; a 409 carries a fresh `preview` (`checkout.*` codes) so the client can
  re-confirm rather than silently reprice.
- **2026-09 / ADR-014 Idempotent order creation:** client-generated
  `IdempotencyKey(customerId, key)` makes retries/replays collapse to one order; the unique
  constraint plus re-verify-on-replay protects dual-submit without a costly distributed
  lock.
- **2026-09 / ADR-015 Order snapshots are immutable:** `OrderItem`/`OrderAddress` copy values
  at order time and are never recomputed from current catalog/address data, so the order is
  a stable legal/business record.
- **2026-09 / ADR-016 Order state machine with per-status timestamps:** a strict forward
  graph (`PLACED `+' CONFIRMED `+' PREPARING `+' READY_FOR_PICKUP `+' OUT_FOR_DELIVERY `+' DELIVERED`)
plus explicit cancel windows, recorded as append-only `OrderEvent`rows and`*At` timestamp columns that accommodate the Phase 5 delivery-assignment segment without
  remodeling.
- **2026-09 / ADR-020 Branch catalog edits stay branch-row-owned:** manager catalog
  PATCH/DELETE target a `BranchProduct` row scoped to the caller's branch; the service
  re-reads the row's `branchId` and 404s on mismatch (no client-supplied branch identity as
  the authz source), preserving the global-product vs branch-product split. Delivered in
  Phase 6.
- **2026-09 / ADR-021 Audit needs a branch dimension:** branch-scoped reports/CSV require
  audit events to carry a branch so reads are provably scoped to the manager's branch; audit
  stays write-append-only. Implemented in Phase 6 — `AuditEvent.branchId` already existed in
  the schema (no migration); the work was plumbing `branchId` through every mutation call
  site, then adding branch-scoped read/CSV endpoints.

---

## Phase 6 status (complete)

Phase 6 (Branch Manager Operations) is **shipped and verified**. The two originally-missing
server surfaces — (1) branch-scoped catalog PATCH/DELETE and (2) branch-scoped audit
read/reports/CSV — are implemented, tested, and green (**API 266 passed / 2 skipped, Web 83
passed**, typecheck/lint/build/format/`prisma validate` clean). No schema change was needed:
`AuditEvent.branchId` already existed; the work plumbed `branchId` through all mutation
write paths and added branch-scoped read/CSV endpoints.

Reused (never rebuilt): Phase 4 `branch-orders`, Phase 5 delivery assignment/dispatch,
partner management, notifications inbox + Socket.IO. Branch settings read and update only
real config on `Branch`; no fake settings. Refunds/cancellations = integration points only
where Phase 4 already supports them; no fake refunds. STOP before Phase 7 (Super Admin) is
required.

See `docs/phase-6-report.md` for the full delivery report, and
`docs/phase-6-gap-analysis.md` for the original analysis plus corrections.

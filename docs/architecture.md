# Hungry Box Architecture

This document records the architecture direction and key decisions. It is a living document;
update it when architecture decisions change (record a short ADR entry at the bottom).

**Status:** reconciled through Phase 12C (checkpoint `c26a578`). Source code is the source of
truth; where this document and the code disagree, the code is correct and this document is a
defect. Numbers quoted as "verified" are the measured results of the phase they belong to.

**Product scope:** Hungry Box sells **snacks and shakes**. It is not a general restaurant
marketplace, and features must not quietly turn it into one. (The demo seed carries a broader
sample catalogue — biryani, starters, rolls, beverages, desserts — because seed data exists to
exercise pricing and media; that is demo content, not a product decision.)

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
API response envelopes, health report shape, and DTOs/entities). Current contract modules,
one bounded concern each:

```
packages/shared/src
  roles.ts      UserRole + the four role literals
  auth.ts       AuthUser, LoginRequest/Response, JwtPayload
  health.ts     HealthReport
  branches.ts   BranchDto, branch create/update/status inputs
  catalog.ts    Category/Product/ProductImage/BranchProduct DTOs + media inputs
  address.ts    AddressDto, Create/UpdateAddressInput
  location.ts   ServiceabilityResult
  cart.ts       CartSummary, CartItemDto, cart mutation inputs
  orders.ts     Order DTOs, checkout/payment DTOs, order state unions
  delivery.ts   Partner, KYC-facing, assignment, tracking, notification, realtime DTOs
  audit.ts      AuditEvent DTOs, AuditListQuery/Result
  users.ts      User DTOs, manager creation/status inputs
  analytics.ts  Dashboard/report queries + rows
  kyc.ts        KycStatusDto, KycListItemDto, review/access DTOs
  index.ts      barrel re-exporting every module above
```

- The package **builds to `packages/shared/dist`** (TypeScript declaration files via
  `tsc --emitDeclarationOnly`). Consumers (`apps/api`, `apps/web`) resolve `@hungrybox/shared`
  through the workspace symlink and the package `types` field — they always use the
  **built** package, never the source. Each app's `prebuild`/`pretypecheck`/`predev` script
  rebuilds shared first so the workspace stays self-contained.
- Shared contracts are consumed **type-only** in both apps (verified: there is no value
  import of `@hungrybox/shared` anywhere in `apps/`). This is deliberate while the package
  emits declarations only. Anything the UI needs at runtime — status labels, step arrays,
  audit-kind captions — is currently defined as a local `as const` in `apps/web` (see
  `features/orders/order-status.ts`, `components/status.ts`, `features/audit/audit-labels.ts`)
  rather than duplicating the contract. Before shipping shared _runtime_ values, add an ESM
  JS + types build step for the package and switch consumers to the runtime artifact
  (documented in the decision log).

## 3. Backend structure

NestJS, one module per bounded context under `apps/api/src/modules/`. The current set:

| Module               | Responsibility                                                                 |
| -------------------- | ------------------------------------------------------------------------------ |
| `health/`            | Public health/readiness endpoint (`GET /api/health`)                           |
| `auth/`              | Login, JWT issuing, `JwtAuthGuard`, session/user shape                         |
| `users/`             | Super Admin user + branch-manager administration                               |
| `branches/`          | Branch CRUD, settings, lifecycle status (`ACTIVE`/`PAUSED`/`INACTIVE`)         |
| `products/`          | **Global** product + `ProductImage` management (SUPER_ADMIN media)             |
| `categories/`        | **Global** category + category image management (SUPER_ADMIN media)            |
| `branch-products/`   | Branch catalog configuration **and branch-owned media** (`BranchProductImage`) |
| `catalog/`           | Public/customer read-only catalogue (list, categories, detail)                 |
| `locations/`         | Haversine serviceability per `branch.deliveryRadiusKm`                         |
| `addresses/`         | Customer-owned delivery addresses (IDOR-proof CRUD)                            |
| `cart/`              | One cart per `(customer, branch)` with server-side price snapshots             |
| `checkout/`          | Server-derived preview, conflicts, payment intent                              |
| `payments/`          | Provider registry, verification, COD bookkeeping, dev simulator                |
| `orders/`            | Idempotent transactional creation, state machine, events, cancellation         |
| `branch-orders/`     | Branch-scoped order reads/transitions + COD collection recording               |
| `delivery-partners/` | Partner onboarding, documents, availability, `me` surface                      |
| `deliveries/`        | Assignment, dispatch, pickup, delivery, tracking, location pings               |
| `kyc/`               | Private Aadhaar + Driving Licence documents, manager review, access URLs       |
| `notifications/`     | Notification records written by order/delivery events (backend only today)     |
| `analytics/`         | Read-only dashboard/report aggregation + CSV                                   |
| `audit/`             | Append-only audit log, branch-scoped reads, CSV                                |
| `media/`             | Storage-provider abstractions (public + private), byte-level validators        |
| `realtime/`          | `/realtime` Socket.IO gateway + CORS IoAdapter                                 |

`apps/api/src/provisioning/` holds the operator-only `provisionSuperAdmin` /
`provisionBranch` functions; the CLI wrappers in `apps/api/scripts/` are the only callers
(`npm run provision:admin` / `provision:branch`, ADR-033).

`media/` is the one module in that table that is **not** imported by `app.module.ts`. It
exports two NestJS providers (`MediaModule` and `PrivateDocumentStorageModule`) that the
bounded contexts which need storage import directly — `products`, `categories`,
`branch-products` and `kyc`. That is deliberate: it keeps a storage detail out of the root
composition while still allowing a media-free test double.

Cross-cutting:

- `apps/api/src/prisma/` — PrismaService (wired globally via `@Global()` module)
- Config via `@nestjs/config` (`ConfigModule.forRoot({ isGlobal: true })`)
- `main.ts` sets the global API prefix (`api`), CORS (from env), and port (from env)
- Three global guards are registered in `app.module.ts` in this order (ADR-006):
  `JwtAuthGuard` → `RolesGuard` → `BranchScopeGuard`

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
- `PrismaService` constructs the client only when `DATABASE_URL` is set. The API therefore
  still boots without a configured database and `/api/health` reports
  `database: 'unconfigured'`; any endpoint that actually needs the database fails through
  `requireClient()` with `503 Service Unavailable` ("Database is not configured"). This
  soft-boot is what makes the health check meaningful, not a leftover Phase 1 shortcut.

Phase 1 shipped only the datasource + generator. The schema now carries **25 models and
14 enums**, added through exactly **8 Prisma migrations**, in this order:

| #   | Migration                                        | Phase |
| --- | ------------------------------------------------ | ----- |
| 1   | `20260923000000_phase2_identity_catalog`         | 2     |
| 2   | `20260924000000_phase3_customer_storefront`      | 3     |
| 3   | `20260925000000_phase4_checkout_payments_orders` | 4     |
| 4   | `20261001000000_phase5_delivery_partners`        | 5     |
| 5   | `20261001010000_phase10b_cash_on_delivery`       | 10B   |
| 6   | `20261001020000_phase10c_public_catalog_media`   | 10C   |
| 7   | `20261001030000_phase10d_private_kyc_documents`  | 10D   |
| 8   | `20261001040000_phase12c_branch_product_images`  | 12C   |

`migration_lock.toml` pins the provider to `postgresql`. The newest migration
(`..._phase12c_branch_product_images`) is purely additive; no already-applied migration has
ever been edited.

## 4. Frontend structure

Vite + React + TypeScript strict. Tailwind CSS v4 is wired via `@tailwindcss/vite`; the brand
palette is exposed as Tailwind theme tokens in `apps/web/src/styles/index.css`:

| Token          | Value     |
| -------------- | --------- |
| `brand-teal`   | `#0091B9` |
| `brand-sky`    | `#BAE4F0` |
| `brand-navy`   | `#004E9B` |
| `brand-orange` | `#FF6500` |
| `brand-yellow` | `#FFD500` |

Source layout under `apps/web/src`:

```
main.tsx            React root: AuthProvider + App
app/App.tsx         RouterProvider over the real route table
auth/               AuthProvider (session restore), route guards, role→path logic
routes/             paths.ts (the single source of route strings), AppRoutes.tsx,
                    management-entry.tsx, legacy-manager-redirect.tsx
layouts/            CustomerLayout (storefront + cart providers, nav, sheets)
pages/              HomePage, LoginPage, NotFoundPage
pages/admin/        Super Admin: AdminLayout + ManagementLoginPage + 8 SUPER_ADMIN pages
                    (AdminOverviewPage dashboard + 7 segment pages)
pages/manager/      Branch Manager: ManagerLayout + ManagerHomePage + 8 BRANCH_MANAGER
                    segment pages (orders, order detail, catalogue, partners, partner
                    detail, assignments, settings, audit)
pages/customer/     Customer: storefront, cart, checkout, orders, addresses, profile
pages/delivery/     Delivery Partner: DeliveryLayout + home/deliveries/profile
components/         Shared UI foundation (Button, Dialog, Notice, LoadingState,
                    StatusBadge, EmptyState, ErrorState, FilterChips, ConfirmDialog,
                    PageHeader, ProductImage, ImageField, SignOutButton, forms/)
features/           storefront/, orders/, audit/, delivery/, manager/ domain modules
api/                client.ts (typed fetch wrapper + per-domain API objects), query.ts,
                    session-expiry.ts
lib/                money.ts (minor-unit formatting), format.ts (date formatting)
```

Runtime dependencies are deliberately few and each is load-bearing:

- `react` / `react-dom` — UI runtime.
- `react-router-dom` — the **only** router; every screen is a route (see §14).
- `recharts` — admin dashboard + reports charts **only** (`AdminOverviewPage`,
  `AdminReportsPage`).
- `socket.io-client` — realtime only, reached exclusively through
  `features/delivery/use-delivery-realtime.tsx` (delivery layout/home and the customer
  order-tracking section).
- `@hungrybox/shared` — type-only contracts.

There is deliberately **no** TanStack Query, no React Hook Form and no Zod in this
codebase: server state is fetched with `useEffect` + local state through the typed
`api/client.ts` wrapper, and forms are controlled components validated by shared field
components plus server-side DTO validation (class-validator). Do not add a data-fetching
or form library without an ADR; the current approach is intentional and tested.

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

Password hashing, JWT/session security, RBAC + branch authorization, input validation,
audit logging, server-side payment verification, protected sensitive data (hashed secrets,
payout info, tokens never exposed via API/logs), secure document handling for KYC, and no
secrets in git. Sensitive values live in environment variables; `.env` files are
git-ignored.

Input validation is **class-validator** on the API (DTO classes plus the global
`ValidationPipe` with `whitelist`, `forbidNonWhitelisted` and `transform`). There is **no
Zod** in this codebase — see §4 for why no schema library is present, and ADR-062's
neighbouring rule in §23: adding a data-fetching, form or validation library requires an
ADR rather than being treated as routine.

## 8. Order lifecycle (implemented in Phase 4)

Order Created → Confirmed → Preparing → Ready for Pickup → Delivery Partner assigned →
Accepted → Picked Up → Out for Delivery → Delivered, plus cancellation/refund states.
Phase 4 models all pre-assignment states and the full progression from `PLACED` through
`DELIVERED`; the delivery-assignment segment (partner assignment, accepted, picked up) is a
Phase 5 extension of the same field set, so the model fits the complete lifecycle without
reshaping.

## 9. Health check

`GET /api/health` is `@Public()` and returns service, version, uptime, timestamp, and database
status (`unconfigured` | `connected` | `unreachable`, probed with a 2.5 s timeout). The API
starts and serves health even without a database configured. The HTTP status is part of the
contract: **200** only when `status === 'ok'` (database `connected`), **503** when degraded
(ADR-035), which is what makes it usable as a Railway readiness check (§10).

## 10. Deployment (Railway)

The API is deployed from `railway.json` at the repository root (ADR-032):

- **Builder:** Nixpacks, `buildCommand: npm run build` (root script builds shared → api → web).
- **Start:** `startCommand: npm run start:api` → the compiled `dist/main.js` of the API
  workspace.
- **Migrations:** `preDeployCommand: npm run db:deploy` (`prisma migrate deploy`) runs
  against `DATABASE_URL` **before** the new version serves traffic, with a 300 s timeout.
- **Readiness:** `healthcheckPath: /api/health`, which returns 200 only when the database is
  reachable and 503 when degraded (ADR-035).
- **Scale:** `numReplicas: 1`, `restartPolicyType: ON_FAILURE` (5 retries). Watch paths are
  limited to `apps/api/**`, `packages/shared/**` and the manifests.
- Node is pinned by `.nvmrc` (22) plus `engines` (ADR-036).

Postgres is provisioned through Railway and `DATABASE_URL` is supplied as a Railway
environment variable. Cloudinary, JWT and media-provider secrets are server-only.

`railway.json` configures the deployment but does not gate it: there is no approval step in
the config, so triggering a deploy remains an operator action outside the repository. A phase
that changes backend behaviour is considered complete when it is verified locally (typecheck,
lint, tests, build, `prisma validate`) and that evidence is recorded — see §19 and §20.

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

> The two statements above describe the **Phase 3** state of the storefront, which is what
> this section is a record of. For what the Customer experience does _today_, read §16 —
> checkout, orders and tracking are all live.

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

## 14. Management routing architecture (Phase 12B)

One application, one login, one management entry. `apps/web/src/routes/paths.ts` is the
single source of truth for every route string; no page hard-codes a path.

### Route table

| Route                                                         | Audience              | Screen                                            |
| ------------------------------------------------------------- | --------------------- | ------------------------------------------------- |
| `/`                                                           | public                | `HomePage`                                        |
| `/login`                                                      | public (`PublicOnly`) | `LoginPage` (customer/partner sign-in)            |
| `/admin`                                                      | public                | `ManagementEntry` — management login or forward   |
| `/admin/dashboard`                                            | management roles      | `ManagementDashboard` — role-aware                |
| `/admin/branches`                                             | `SUPER_ADMIN`         | `AdminBranchesPage`                               |
| `/admin/orders`                                               | `SUPER_ADMIN`         | `AdminOrdersPage`                                 |
| `/admin/catalogue`                                            | `SUPER_ADMIN`         | `AdminCataloguePage`                              |
| `/admin/managers`                                             | `SUPER_ADMIN`         | `AdminManagersPage`                               |
| `/admin/partners`                                             | `SUPER_ADMIN`         | `AdminPartnersPage`                               |
| `/admin/audit`                                                | `SUPER_ADMIN`         | `AdminAuditPage`                                  |
| `/admin/reports`                                              | `SUPER_ADMIN`         | `AdminReportsPage`                                |
| `/admin/branch`                                               | —                     | redirect → `/admin/dashboard`                     |
| `/admin/branch/orders`, `/admin/branch/orders/:orderId`       | `BRANCH_MANAGER`      | `ManagerOrdersPage`, `ManagerOrderDetailPage`     |
| `/admin/branch/catalogue`                                     | `BRANCH_MANAGER`      | `ManagerCatalogPage`                              |
| `/admin/branch/partners`, `/admin/branch/partners/:partnerId` | `BRANCH_MANAGER`      | `ManagerPartnersPage`, `ManagerPartnerDetailPage` |
| `/admin/branch/assignments`                                   | `BRANCH_MANAGER`      | `ManagerAssignmentsPage`                          |
| `/admin/branch/settings`                                      | `BRANCH_MANAGER`      | `ManagerSettingsPage`                             |
| `/admin/branch/audit`                                         | `BRANCH_MANAGER`      | `ManagerAuditPage`                                |
| `/manager`, `/manager/*`                                      | redirect only         | `LegacyManagerRedirect`                           |
| `/delivery`, `/delivery/deliveries`, `/delivery/profile`      | `DELIVERY_PARTNER`    | `DeliveryLayout` + 3 pages                        |
| `/customer/*`                                                 | `CUSTOMER`            | `CustomerLayout` + 8 child routes                 |
| `*`                                                           | public                | `NotFoundPage`                                    |

### The management entry and the role-aware dashboard

`routes/management-entry.tsx` owns the whole management entry decision, in this order:

- `ManagementEntry` (`/admin`): while the session is restoring → `AuthLoadingScreen`; no user
  → `ManagementLoginPage`; a signed-in non-management role → `Navigate` to that role's own
  home; a management role → `Navigate` to `/admin/dashboard`.
- `ManagementDashboard` (`/admin/dashboard`): while restoring → `AuthLoadingScreen`; no user
  → `Navigate` to `/admin` carrying the intended destination in router `state.from`; then
  the **authenticated role** selects `AdminOverviewPage` or `ManagerHomePage`. A
  non-management role is sent to its own home.

Consequences that are load-bearing and must not regress:

- There is exactly **one** management login experience. `/admin` never shows a Customer
  login form, and there is no `/admin/login`.
- Neither dashboard can be reached by deep link alone: the role check happens _before_ a
  dashboard is chosen, so a Super Admin can never be shown the Branch Manager dashboard or
  vice versa.
- A restored session never flashes the login form.

### Client-side guards

`auth/route-guards.tsx` exports four components used by the route table:

| Guard         | Behaviour when the session is restoring | Unauthenticated                     | Wrong role                       |
| ------------- | --------------------------------------- | ----------------------------------- | -------------------------------- |
| `RequireAuth` | `AuthLoadingScreen`                     | `Navigate` → `loginPath` (+ `from`) | passes through                   |
| `RequireRole` | —                                       | `Navigate` → `loginPath`            | `Navigate` → `homePathForRole()` |
| `PublicOnly`  | —                                       | renders children                    | `Navigate` → `homePathForRole()` |

`RequireAuth` → `RequireRole` is always the nesting order, so an unauthenticated visitor is
sent to the correct login **before** any role evaluation, and a wrong-role visitor is
redirected without ever mounting the protected page.

`auth/role-paths.ts` holds the client mirror of the role model: `ROLE_HOME_PATHS`,
`isManagementRole`, `canRoleAccessPath` and `resolvePostLoginPath`.

`ROLE_HOME_PATHS` is deliberately **not** one home per role: `SUPER_ADMIN` and
`BRANCH_MANAGER` both map to `/admin/dashboard` (one management URL, role-chosen body),
while `DELIVERY_PARTNER` maps to `/delivery` and `CUSTOMER` to `/customer`. That shared
entry is exactly why the role must be checked before a dashboard is chosen.

`canRoleAccessPath` exists **only** to keep a post-login redirect inside the signed-in role's
own area for a stale bookmark: 7 `SUPER_ADMIN_SEGMENTS` (branches, orders, catalogue,
managers, partners, audit, reports) and 6 `BRANCH_MANAGER_SEGMENTS` (orders, catalogue,
partners, assignments, settings, audit), each matched as an exact path or a path prefix. It
grants nothing: the API's `RolesGuard` and `BranchScopeGuard` remain authoritative on every
request (ADR-055).

### Legacy `/manager` handling

`routes/legacy-manager-redirect.tsx` is redirect-only and renders no login of its own.
`mapLegacyManagerPath` maps every retired URL onto its `/admin/branch/...` equivalent,
preserving trailing detail segments:

| Legacy                       | Target                                      |
| ---------------------------- | ------------------------------------------- |
| `/manager`                   | `/admin/dashboard`                          |
| `/manager/orders[/:orderId]` | `/admin/branch/orders[/:orderId]`           |
| `/manager/catalog`           | `/admin/branch/catalogue`                   |
| `/manager/catalogue`         | `/admin/branch/catalogue` (defensive alias) |
| `/manager/partners[/:id]`    | `/admin/branch/partners[/:id]`              |
| `/manager/assignments`       | `/admin/branch/assignments`                 |
| `/manager/settings`          | `/admin/branch/settings`                    |
| `/manager/audit`             | `/admin/branch/audit`                       |

Behaviour: unauthenticated → `/admin` (management login) carrying the mapped destination;
signed-in non-`BRANCH_MANAGER` → that role's own home; `BRANCH_MANAGER` → the mapped
target, or `/admin/dashboard` when there is no mapping. Because the legacy handler never
renders a login screen, `/manager` cannot become a second management entry or a redirect
loop (ADR-056).

`routes/management-routing.test.tsx` mounts the **real** route table on a memory router, so
guards, deep links, role refusals, the legacy mapping and the no-loop property are tested
against production routing rather than a stand-in.

---

## 15. Catalogue and media architecture

### The two-level catalogue

Global, HQ-owned: `Category`, `Product`, `ProductImage` (≤ 3 per product), and the category
image columns. Branch-owned: `BranchProduct` (price, discount, availability, status — unique
on `(branchId, productId)`) and, since Phase 12C, `BranchProductImage`.

A Branch Manager edits **only** `BranchProduct` and `BranchProductImage` rows. Global product
and category media mutations are `SUPER_ADMIN`-only (`products` and `categories` controllers).
There is no code path through which a manager can write a `ProductImage` or a category image
(ADR-025 extended by ADR-057).

### `BranchProductImage` (Phase 12C)

```prisma
model BranchProductImage {
  id               String        @id @default(cuid())
  branchProductId  String
  branchProduct    BranchProduct @relation(fields: [branchProductId], references: [id], onDelete: Cascade)
  imageUrl         String
  providerPublicId String?
  resourceType     String?
  altText          String?
  sortOrder        Int           @default(0)
  isPrimary        Boolean       @default(false)
  createdAt        DateTime      @default(now())

  @@index([branchProductId])
}
```

`MAX_BRANCH_PRODUCT_IMAGES = 3` lives in `branch-product-images.service.ts`, not in the
schema — the cap is a service rule, not a database constraint, so it can change without a
migration.

Migration `20261001040000_phase12c_branch_product_images` is purely additive: one
`CREATE TABLE`, one index, one `ON DELETE CASCADE` foreign key. No existing table, column,
enum or migration was modified.

### Media ownership and endpoints

Branch media is always addressed **through its branch product**, and the branch is derived
from stored state — never from a client-supplied `branchId`:

| Endpoint                                         | Roles                           |
| ------------------------------------------------ | ------------------------------- |
| `POST /branch-products/:id/images`               | `SUPER_ADMIN`, `BRANCH_MANAGER` |
| `PATCH /branch-products/images/reorder`          | `SUPER_ADMIN`, `BRANCH_MANAGER` |
| `PATCH /branch-products/images/:imageId/primary` | `SUPER_ADMIN`, `BRANCH_MANAGER` |
| `DELETE /branch-products/images/:imageId`        | `SUPER_ADMIN`, `BRANCH_MANAGER` |

The service loads `BranchProductImage → BranchProduct.branchId` and compares it with
`enforcedBranchId(actor)`, where a manager's `branchId` comes from their authenticated
identity. A foreign branch product or image is reported as `NotFound`, so it is
indistinguishable from a missing row and cannot be used to probe another branch. Reorder
derives its branch product from the submitted image ids, validates that they form one
complete set for that branch product, and only then writes.

### Media rules (identical for global and branch media)

- **Max 3 images** per product _and_ per branch product.
- **Max 5 MB** per upload (`MAX_PUBLIC_IMAGE_BYTES`, enforced by the multipart
  `FileInterceptor` limit and re-checked in the service).
- **JPEG / PNG / WebP only**, decided by byte signature, not by `Content-Type`, filename or
  extension. SVG and every other format are rejected (ADR-044).
- **Exactly one primary** at all times: the first image becomes primary, `setPrimary`
  demotes the previous one, `remove` promotes the lowest-`sortOrder` survivor, and `reorder`
  reconciles back to one.
- **Concurrency:** the cap and every write run inside a transaction that first takes
  `SELECT … FOR UPDATE` on the owning row, so parallel uploads cannot exceed the cap
  (ADR-045).
- **Ordering:** a new image is appended after the highest existing `sortOrder`, so removing
  a middle image cannot produce duplicate positions.
- **Storage consistency:** the cloud asset is written first, then the database row; a failed
  database write deletes the orphan best-effort, and a failed remote delete becomes a
  `MEDIA_CLEANUP_FAILED` audit event instead of breaking the request (ADR-046).
- **Contracts never leak storage internals:** `BranchProductImageDto` and `ProductImageDto`
  expose `id`, `imageUrl`, `altText`, `sortOrder`, `isPrimary` only. `providerPublicId` and
  `resourceType` stay server-side (ADR-047, ADR-057).

Audit kinds added in Phase 12C: `BRANCH_PRODUCT_IMAGE_UPLOADED`,
`BRANCH_PRODUCT_IMAGE_PRIMARY_CHANGED`, `BRANCH_PRODUCT_IMAGES_REORDERED`,
`BRANCH_PRODUCT_IMAGE_REMOVED`.

### Canonical image resolution

`apps/api/src/common/utils/catalog-image.ts` is the **only** place that decides which image
represents a product in a branch. `resolveCatalogImageUrl` sorts candidates by `sortOrder`,
prefers `isPrimary`, and falls back in this fixed order:

```
branch image (primary, else first)  →  global product image (primary, else first)
                                   →  category image  →  null
```

Every consumer resolves through it, which is what makes the customer-facing image and the
manager-facing image impossible to disagree:

| Consumer                              | Field produced                  |
| ------------------------------------- | ------------------------------- |
| `catalog.service.ts` (catalogue list) | `CatalogProduct.imageUrl`       |
| `catalog.service.ts` (product detail) | `CatalogProductDetail.imageUrl` |
| `branch-products.service.ts`          | `BranchProductDto.imageUrl`     |
| `cart.mapper.ts`                      | `CartItemDto.imageUrl`          |
| `checkout-validation.service.ts`      | checkout line `imageUrl`        |

`BranchProductDto` additionally returns `branchImages` (editable, ordered) and
`globalImages` (read-only, so a manager can see why a fallback is being used).

**Public gallery boundary.** `CatalogProductDetail.images` remains the **global HQ gallery**.
Branch imagery reaches customers only through the canonical `imageUrl` field. This is
intentional and must not be "fixed" by turning the customer detail endpoint into a
branch-aware gallery: the public contract stays global, and branch media is a management
concern layered on top of it.

---

## 16. Customer experience — CURRENT behaviour

Everything in this section is live today. Nothing here is a plan.

- **Authentication is required.** Every `/customer/*` route is wrapped in
  `RequireAuth` + `RequireRole(['CUSTOMER'])`. A visitor who is not signed in is redirected
  to `/login`; a signed-in non-customer is sent to their own home. There is no guest
  browsing, guest cart or guest checkout.
- `/customer` redirects to `/customer/storefront`.
- Routes: `storefront`, `cart`, `checkout`, `checkout/success/:orderId`, `addresses`,
  `orders`, `orders/:orderId`, `profile`.
- `CustomerLayout` owns `StorefrontProvider` (branch, serviceability, catalogue, addresses)
  and `CartProvider` (one cart per branch), plus the header, bottom navigation, cart sheet
  and location modal. Mobile-first, large touch targets.
- Browsing: server-side search and category filter, product grid, product detail dialog with
  the full global image gallery, availability and price flags.
- Cart: server-derived totals, per-branch affinity, and a confirm step when the delivery
  branch changes with a non-empty cart.
- Checkout: address selection → server preview → payment method → payment intent →
  verification → idempotent order placement. A 409 carries a fresh preview and the UI asks
  the customer to re-confirm; the pay button is blocked while the preview reports issues.
- Orders: history with status filters, detail with an `OrderEvent`-derived timeline,
  customer cancellation from `PLACED`/`CONFIRMED`, and cash-on-delivery messaging.
- Addresses: customer-owned CRUD with at most one default; the first address is
  auto-promoted; foreign ids are 404.
- Realtime: the order detail's tracking section shows a Live/Syncing indicator and refetches
  authoritative REST when a delivery event arrives for that order (ADR-030). Socket payloads
  are never trusted as data.
- Payments: `PAYMENT_PROVIDER=dev` (a simulator) plus cash on delivery. **A real gateway has
  not been integrated.**

## 17. Customer experience — FUTURE (not implemented)

These are explicitly _not_ built. They belong to Phase 13A and later, and the current code
must not be read as if they exist:

- Guest commerce: browsing, cart, checkout and order tracking **without** a customer account.
- Removal or de-emphasis of customer authentication.
- Guest order tracking by order number/phone.
- A new address architecture (for example guest-claimed saved addresses).
- GPS or manual-address redesign, and any change to the Haversine serviceability contract.
- Payment-method cleanup or a production gateway migration.

### Customer design lock

The final Customer-facing visual design **has not been decided**. The user will supply it.
Until then:

- Do not redesign the Customer website, homepage, product cards, navigation, colour usage,
  motion, or the overall Customer UX architecture.
- Do not commit to a new Customer visual direction "in passing" during a technical task.
- A tiny technical adjustment required for correctness or code splitting is acceptable; a
  visual redesign is not.
- Existing Customer pages are production-quality and tested, but they are **not** the final
  design. Treat them as a placeholder for the user's design, not as a fixed contract.

---

## 18. Delivery Partner — PAUSED, keep for future

The Delivery Partner capability is **paused, not deleted and not deprecated**. It remains
fully implemented, wired and tested:

- Backend: `delivery-partners` (onboarding, documents, availability, `me`), `deliveries`
  (assignment, accept, reject, pickup, out-for-delivery, deliver, tracking, location pings),
  `kyc` (private Aadhaar + Driving Licence), and the realtime gateway.
- Frontend: `/delivery`, `/delivery/deliveries`, `/delivery/profile` behind
  `RequireRole(['DELIVERY_PARTNER'])`, plus the customer tracking section and the
  manager/admin dispatch surfaces.
- Domain rules that stay in force: Aadhaar + Driving Licence required (ADR-048), private
  `type: 'authenticated'` storage (ADR-049), short-lived backend-authorized access
  (ADR-050), human manager review (ADR-052), per-request suspension enforcement
  (ADR-024/ADR-028).

Do not remove, stub, or "clean up" any Partner page, endpoint, model, guard or test because
the feature is paused. Code-splitting Partner UI so Customers do not download it is allowed;
deleting or redesigning it is not.

---

## 19. Testing

| Suite                   | Runner / config                      | Scope                                                                                   |
| ----------------------- | ------------------------------------ | --------------------------------------------------------------------------------------- |
| API unit                | Vitest, `apps/api/vitest.config.mts` | `src/**/*.spec.ts`, node environment, Prisma mocked via `PrismaService.requireClient()` |
| API live e2e (opt-in)   | Vitest, `test/**/*.e2e-spec.ts`      | Skipped unless `RUN_LIVE_E2E=1` **and** a reachable `DATABASE_URL`                      |
| Web unit                | Vitest, `apps/web/vitest.config.ts`  | `src/**/*.test.{ts,tsx}`, jsdom + Testing Library, API client mocked                    |
| Web real-router routing | `routes/management-routing.test.tsx` | Mounts the production route table on a memory router                                    |

Current verified totals at `c26a578`: **API 490 passed / 5 skipped** (5 skipped are the
gated live e2e suites) and **Web 265 passed**. Both suites are expected to stay at or above
these numbers; a phase that lowers a count must justify it. There is **no CI pipeline** in
this repository — these gates are run locally and the results are recorded here and in the
phase reports.

Conventions:

- Tests assert behaviour and authorization outcomes, not implementation details. RBAC and
  branch-isolation tests are first-class, not optional.
- Do not weaken an existing assertion to make a change pass. If behaviour genuinely changes,
  change the test deliberately and say so.
- Coverage that matters most here: role/branch denial paths, ownership 404s, idempotency,
  audit emission, and the routing/guard matrix.

---

## 20. Git workflow, line endings, environment & security

### Git workflow

- `main` is the integration branch. Phases are developed one at a time, in order, and are not
  run ahead of each other.
- One phase = one commit with a descriptive subject. Do not mix unrelated changes.
- Review `git status`, `git diff` and `git log --oneline -10` before committing; stage only
  intended files.
- Commit only when the phase's verification is green. Pushing is a separate, explicit
  human decision.
- Never commit `.env`, secrets, `node_modules`, `dist`, generated Prisma client, or
  temporary analysis artifacts. `.env.example` placeholders are the only environment files
  that may be tracked.
- No amend/rebase/force-push/reset of shared history without an explicit instruction.
- Do not run a repository-wide formatter as a side effect of an unrelated change. Format only
  the files a phase actually touched, and only where they are not already at baseline.

### Line endings (CRLF)

`.gitattributes` sets `* text=auto eol=lf` and declares text formats explicitly. Text is
stored **and** checked out as LF on every OS, which overrides `core.autocrlf=true` on a
Windows/OneDrive checkout. This is deliberate: without it, machine-local CRLF conversion
produced phantom "modified" entries in `git status` for byte-identical content. Any change
that reintroduces CRLF churn in `git status` is a bug, not a real diff.

### Environment configuration

**Server-only environment variables** (the complete set documented in
`apps/api/.env.example`):

| Group               | Variables                                                                                                                                                                                                                                                                                                      |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| HTTP server         | `PORT`, `API_PREFIX`, `NODE_ENV`, `SERVICE_NAME`                                                                                                                                                                                                                                                               |
| CORS                | `CORS_ORIGINS` (comma-separated; shared by the HTTP layer and the `/realtime` gateway)                                                                                                                                                                                                                         |
| Database            | `DATABASE_URL`                                                                                                                                                                                                                                                                                                 |
| Auth                | `JWT_SECRET`, `JWT_EXPIRES_IN`                                                                                                                                                                                                                                                                                 |
| Checkout / payments | `PAYMENT_PROVIDER`, `DELIVERY_FEE_MINOR`, `CHECKOUT_TAX_MINOR`                                                                                                                                                                                                                                                 |
| Media (Cloudinary)  | `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`                                                                                                                                                                                                                                         |
| Provisioning (CLI)  | `PROVISION_ADMIN_LOGIN_ID`, `PROVISION_ADMIN_PASSWORD`, `PROVISION_ADMIN_NAME`, `BRANCH_CODE`, `BRANCH_NAME`, `BRANCH_CITY`, `BRANCH_STATE`, `BRANCH_COUNTRY`, `BRANCH_ADDRESS`, `BRANCH_LATITUDE`, `BRANCH_LONGITUDE`, `BRANCH_DELIVERY_RADIUS_KM` — read only by the operator CLIs, never by the running API |

There is **no** environment variable for choosing a media or KYC storage provider, and
**no** environment variable for the private-document access TTL. Those are code, and the
distinction matters when auditing the media layer:

- `MEDIA_STORAGE_PROVIDER` and `PRIVATE_KYC_STORAGE_PROVIDER` are **NestJS dependency-
  injection tokens** (exported symbols), not configuration. `MediaModule` and
  `PrivateDocumentStorageModule` each provide exactly one implementation of their token,
  and `resolveMediaStorageProvider(config)` / `resolvePrivateKycStorageProvider(config)`
  select Cloudinary **only** when all three `CLOUDINARY_*` values are present — otherwise
  they bind an "unavailable" provider that returns 503. The API boots either way, so media
  misconfiguration can never take the platform down.
- `PRIVATE_DOCUMENT_ACCESS_TTL_MS` is a **code constant** in
  `apps/api/src/modules/media/private-document-storage.interface.ts`, defined as
  `5 * 60 * 1000` (five minutes). It is not tunable per environment; changing the signed-URL
  lifetime is a code change, not an ops change.
- Likewise `MAX_PUBLIC_IMAGE_BYTES` and `MAX_PRIVATE_DOCUMENT_BYTES` are code constants
  (`5 * 1024 * 1024`).

Client variables are public by definition: only `VITE_*` values reach the browser, and the
frontend currently reads **`VITE_API_BASE_URL` alone** (`api/client.ts` and
`features/delivery/use-delivery-realtime.tsx`), defaulting to `/api`. It is optional in
development because the Vite dev server proxies `/api` and `/socket.io`, and it must be set
to the real API origin in production.

Security rules:

- Cloudinary, JWT and database secrets are **never** `VITE_*` variables and never appear in
  frontend code, API responses, or logs.
- `JWT_SECRET` is required when `NODE_ENV=production`; the server refuses to boot without
  it. The `dev` payment provider is rejected under `NODE_ENV=production`.
- `CORS_ORIGINS` is parsed by one fail-fast validator shared by HTTP and Socket.IO; a
  wildcard or a non-absolute entry throws at boot, and an unset value denies cross-origin
  (ADR-029, ADR-034).
- Passwords are hashed with Argon2 (`@node-rs/argon2`). Hashes, one-time manager passwords,
  payment/payout data, tokens and provider storage keys are never returned by an API.
- The server is the only authority for prices, discounts, availability, serviceability,
  payment verification, state transitions, and branch ownership.
- The 401 path clears the stored session exactly once (`api/session-expiry.ts`) so
  authenticated screens fall back to `/login` without a redirect loop.

---

## 21. Performance and bundle rules (Phase 12D)

Phase 12D is a performance + dead-code phase, not a feature phase. Its rules:

- **Measure before and after.** Record the production build (entry chunk raw + gzip, total
  JS, chunk count, largest chunks, CSS, and whether Vite's >500 kB warning remains) before
  changing anything, and again afterwards. Never claim an improvement the numbers do not
  support.
- **No mass deletion.** "No imports found" is not proof. Before deleting anything, check
  dynamic imports, router registration, NestJS module/provider registration, decorators and
  reflection, Prisma usage, package scripts, Vite/Vitest config, test config, CLI usage,
  string references, CSS references, public asset paths, docs and migration history. A file
  may be deleted only with recorded evidence; **if uncertain, keep it.**
- Do not delete functionality because a feature is paused (see §18), and do not delete
  Prisma migrations, models, enums or columns because static analysis sees few references.
  Performance work must not require a schema migration; if one seems necessary, stop and
  report instead.
- Route-level code splitting is the primary lever: a Customer opening `/` should not
  download Super Admin, Branch Manager or Delivery Partner code, and Recharts must not load
  on a storefront visit.
- Any lazy loading must use one shared, accessible loading experience and must preserve
  guards: no blank screen, no auth flash, no wrong-role dashboard flash, no redirect loops,
  and working deep links.
- Realtime and analytics may be isolated, never removed. Do not break socket lifecycle,
  order realtime, management realtime, or Partner tracking.
- No dependency upgrades and no major-version changes in a performance phase. Remove a
  dependency only with proof it is unused by source, scripts, config, tests and build
  tooling. Temporary analysis tooling must not stay in `package.json`.
- Static-asset work must check public-path/string references before removing anything, and
  must not touch the Cloudinary architecture.
- Backend work in this phase is limited to provably dead code. Do not change API behaviour,
  authorization, or database queries for performance without measured evidence; report
  larger backend opportunities for a future phase instead.

Known starting point (measured at `c26a578` by a production build, and re-measured
identically during the Phase 12C documentation pass): a **single** JavaScript chunk of
`992.16 kB` raw / `276.58 kB` gzip, plus `35.44 kB` / `7.14 kB` gzip of CSS, from 719
transformed modules. The Vite >500 kB chunk warning is still emitted.

Two structural facts make that chunk largely avoidable, and both are verifiable from source
rather than from a bundle report:

- `recharts` is imported in exactly **two** files, `pages/admin/AdminOverviewPage.tsx` and
  `pages/admin/AdminReportsPage.tsx` — both Super Admin only.
- `socket.io-client` is imported in exactly **one** file,
  `features/delivery/use-delivery-realtime.tsx`, reached only from the Delivery Partner home
  and the customer order-tracking section.

`AppRoutes.tsx` imports every page statically: there is no `React.lazy`, no dynamic
`import()` and no `Suspense` anywhere in `apps/web/src`, so a customer visiting `/` currently
downloads Super Admin, Branch Manager and Delivery Partner code and Recharts with it. No
per-package byte attribution is claimed here, because producing one would require analysis
tooling this phase is not allowed to add. Chunk-splitting and dead-code results belong to the
Phase 12D completion report, not to this document.

---

## 22. Architectural invariants

These hold regardless of phase. A change that breaks one is a regression even if every test
passes.

1. **Multi-branch is architectural.** No branch name, id, city, radius or branch-specific
   literal in code, routes, queries or UI. Branch data is rows; a new branch is a data
   change.
2. **Global vs branch data stays separated.** `Product`/`Category`/`ProductImage` are HQ-owned;
   price, discount, availability, status and now branch media are `BranchProduct`-owned.
3. **Delivery radius is configuration** (`branch.deliveryRadiusKm`), never a constant.
4. **One application, four roles, one auth flow.** After login, route to the role's
   experience. Never build a separate app per role.
5. **The server is the authority** for authorization, branch ownership, money, discounts,
   availability, serviceability, payment verification and state transitions.
6. **Branch isolation is enforced server-side** on every branch-scoped read and write, and
   foreign resources are 404 rather than 403.
7. **No destructive operations** — no hard delete where a soft status exists, no
   `DROP`/`TRUNCATE`/history rewrite in a migration, no edit to an already-applied migration.
8. **Audit what changes state**, with the branch id where the resource is branch-scoped.
9. **Contracts live in `packages/shared`** and are consumed type-only from the built package.
10. **Secrets stay server-side**; `.env` is never committed and never read by tooling that
    does not need it.
11. **Phases run in order** and one phase does not implement a later phase's feature early.

---

## 23. DO / DON'T rules

**DO**

- Read `AGENTS.md` and this document before changing architecture.
- Verify with typecheck, lint, tests, build, and Prisma validate/status before committing.
- Record a short ADR at the bottom of this document for each architectural decision.
- Prefer configuration and data over new code paths for anything branch-specific.
- Keep authorization decisions on the server and make them explicit in tests.
- Keep paused features working; isolate them instead of deleting them.
- Write down measured before/after numbers for performance work.

**DON'T**

- Don't hard-code a branch, city, radius, price, or demo credential into source.
- Don't trust the client for authorization, pricing, availability or payment state.
- Don't expose `providerPublicId`, `resourceType`, password hashes, tokens or KYC URLs.
- Don't delete code because grep found no import — prove it first, and keep it when unsure.
- Don't delete Delivery Partner capability, Prisma migrations, or Customer authentication
  (Phase 13A owns that).
- Don't redesign the Customer website before the user provides the design.
- Don't add dependencies (data-fetching, forms, validation) without a documented reason and
  an ADR.
- Don't upgrade dependencies or change major versions as a side effect of another task.
- Don't deploy, push, amend, rebase or force-push without an explicit instruction.
- Don't run a repository-wide format sweep to make a diff look tidy.
- Don't start the next phase early, and don't skip the verification the current phase
  requires.

---

## 24. Roadmap (not committed work)

Ordered, and explicitly not implemented yet:

- **Phase 12D** — dead-code cleanup and production bundle optimization (§21).
- **Phase 13A** — Customer guest commerce: guest browsing/cart/checkout/tracking and the
  customer-auth change (§17).
- **Phase 13B+** — the user-provided Customer website design.
- Production payment gateway replacing the `dev` provider (COD stays).
- Refund **actions** (requires a schema change; refund _reporting_ already exists).
- Promotions/coupons, payouts and settlement.
- App-wide UI consistency for Customer and Delivery Partner, `ConfirmDialog`/icon
  reorganization, and a shared ESM runtime build for `packages/shared`.
- Deployment of the web app to Railway (the API service is configured; the frontend is not
  yet served there).

Deliberately **not** on this list, because each is already true today rather than planned:

- A notifications **UI**. `GET /api/notifications`, `POST /api/notifications/:id/read` and
  `POST /api/notifications/read-all` exist and are open to all four roles, and order/delivery
  events write the records — but there is no `notificationsApi` in `apps/web/src/api/client.ts`
  and no notification screen anywhere in the app. Exposing an existing API is not a
  "documented feature"; the UI is unbuilt.
- CI. There is no workflow, pipeline or hosted test configuration in the repository; the
  gates in §19 are run manually from the command line.

---

## Decision log

- **2026-09 / ADR-001 ORM:** Prisma (above).
- **2026-09 / ADR-002 Monorepo:** npm workspaces with `apps/*` + `packages/*`; shared
  runtime code gets a build step before shipping runtime values.
- **2026-09 / ADR-003 Shared package builds to `dist`:** shared emits declaration files
  (`tsc --emitDeclarationOnly`) and both apps consume the built package (no shared source in
  app compilation). Imports are type-only — still the case today (see §2) — and shared has no
  `main` until a runtime build step is added.
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
  graph (`PLACED` → `CONFIRMED` → `PREPARING` → `READY_FOR_PICKUP` → `OUT_FOR_DELIVERY` →
  `DELIVERED`) plus explicit cancel windows, recorded as append-only `OrderEvent` rows and
  `*At` timestamp columns that accommodate the Phase 5 delivery-assignment segment without
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
- **2026-09 / ADR-022 Branch lifecycle is server-state, not UI state:** a branch moves
  through `ACTIVE`, `PAUSED`, `INACTIVE` via a SUPER_ADMIN-only
  `PATCH /branches/:id/status`; the server validates the request (404 on missing branch,
  400 on a no-op same-status change) and each transition is audited, while the UI only
  offers the legal next states for the current state. Delivered in Phase 7.
- **2026-09 / ADR-023 One-time manager passwords:** manager creation binds a branch id and
  generates a random temporary password returned in the create response exactly once; it is
  stored only as a hash and is never re-servable or exposed through any other API (no
  password-reset surface in this phase).
- **2026-09 / ADR-024 Suspension is enforced per-request, server-side:** `RolesGuard`
  re-reads the acting user (bypassing the JWT's stale claim) and 403s `SUSPENDED`/`INACTIVE`
  users on every protected request, so revocation takes effect immediately and is never a
  client concern.
- **2026-09 / ADR-025 Global catalog stays global:** SUPER_ADMIN product/category
  management (CRUD + images + soft status) lives entirely on the global entities; the
  branch-product pricing/availability/status layer is untouched, preserving ADR-020.
- **2026-09 / ADR-026 Read-only analytics:** the admin dashboard/reports aggregate existing
  order, payment, partner and branch data on demand (integer minor units; no float money);
  there are no aggregation tables and no write paths, and CSV reports are generated from the
  same query layer.
- **2026-09 / ADR-027 Refund reporting only in Phase 7:** cancellations/refund summaries are
  derived from `Payment.status`; there is deliberately **no refund action workflow** — a
  refund action needs a schema change and is deferred to a later phase.
- **2026-09 / ADR-028 Delivery-partner suspension is enforced at every layer:** Phase 7
  re-validated `User.status` for SUPER_ADMIN/BRANCH_MANAGER but not DELIVERY_PARTNER, and a
  profile-level suspend was never enforced. Phase 8 extends ADR-024 with
  `REVALIDATED_ROLES = [SUPER_ADMIN, BRANCH_MANAGER, DELIVERY_PARTNER]`, so the guard also
  requires `deliveryPartnerProfile.status === 'ACTIVE'` for partner routes, and, as defense
  in depth, the assignment/location services independently throw 403 for non-ACTIVE
  profiles (a suspended partner's existing JWT dies on the next request). CUSTOMER sessions
  stay user-status-only.
- **2026-09 / ADR-029 Realtime CORS is explicit, not a wildcard:** the `/realtime` Socket.IO
  gateway no longer serves `cors: { origin: true }`; CORS is wired through an
  `IoAdapter` from the same `CORS_ORIGINS` allow-list as the HTTP API, and defaults to
  `origin: false` (deny) when unset — serving clients across origins is an explicit
  operator decision.
- **2026-09 / ADR-030 Realtime tracking is a mirror of authoritative REST:** the customer
  tracking section refetches the REST tracking DTO when a delivery event arrives for that
  order (events for other orders are ignored); socket payloads are never trusted as data,
  so a desync heals on the next event or poll.
- **2026-09 / ADR-031 Prisma generation is a single prebuild step:** `prisma generate`
  runs in the API workspace's `prebuild`/`pretypecheck` (one generation point for both
  `npm run build` and `npm run typecheck`); the generated client under `apps/api/src/generated`
  is git-ignored and never committed, and schema changes are applied only through declared
  `prisma migrate` commands (`migrate deploy` at deploy time). Delivered in Phase 9.
- **2026-09 / ADR-032 Railway = workspace Nixpacks build + pre-deploy migrations + readiness:**
  the single API service is configured in `railway.json` at the repo root: Nixpacks builder,
  `npm run build` (workspace build → `dist/`), `startCommand "npm run start:api"` (compiled
  `dist/main.js`), `preDeployCommand "npm run db:deploy"` (`prisma migrate deploy` against
  `DATABASE_URL` before serving), and `healthcheckPath "/api/health"`. Node is pinned to 22
  via `.nvmrc` + engines. Delivered in Phase 9.
- **2026-09 / ADR-033 Operator-only provisioning over auto-bootstrap:** the initial
  SUPER_ADMIN and the first branch are created by deliberate CLI commands
  (`provision:admin`, `provision:branch`) from operator-provided environment variables —
  never auto-bootstrapped, seeded, or hard-coded. Both utilities are idempotent and
  refuse-by-default (an existing non-SUPER_ADMIN or inactive SUPER_ADMIN is never promoted/
  reactivated; an existing branch code is never overwritten). Delivered in Phase 9.
- **2026-09 / ADR-034 CORS fails fast and is shared across HTTP and Socket.IO:** one
  `parseCorsOrigins` validator consumes `CORS_ORIGINS` for both the HTTP layer and the
  `/socket.io` adapter; a wildcard (`*`) and any non-absolute `http(s)` entry throw at boot
  rather than silently producing a broken or wide-open policy, and a single trailing slash
  is normalized to match the browser `Origin` header. Delivered in Phase 9.
- **2026-09 / ADR-035 Health semantics: 200 ok / 503 degraded:** `GET /api/health` returns
  the `HealthReport` body with `status: 'ok'` (`database === 'connected'` → HTTP 200) or
  `status: 'degraded'` (HTTP 503 via `@Res({ passthrough: true })`), so Railway's health
  check reflects readiness; the payload never exposes `DATABASE_URL`, hostnames, or stack
  traces, and `/api/health` is exempt from request logging. Delivered in Phase 9.
- **2026-09 / ADR-036 Node 22 pinned for reproducible builds:** `.nvmrc` (`22`) plus the
  existing `engines.node >=22` make the runtime deterministic across local dev, CI, and the
  Railway Nixpacks build. Delivered in Phase 9.
- **2026-09 / ADR-043 Media storage is a provider abstraction behind a symbol, not a hard
  dependency:** `MEDIA_STORAGE_PROVIDER` + `MediaStorageProvider` keep Cloudinary an
  implementation detail; `resolveMediaStorageProvider(config)` selects Cloudinary only when
  all three credentials are present, else an unavailable provider that 503s. The API boots
  and the storefront works without media configured. Delivered in Phase 10C.
- **2026-09 / ADR-044 Image validation is magic-byte based, size-capped server-side:**
  `mimetype`/`ext` are attacker-influenceable, so actual byte signatures (JPEG/PNG/WebP)
  gate everything, a 5 MB cap bounds file memory, and SVG is excluded (script-bearing
  vector polyglots). Limits are mirrored client-side only as UX. Delivered in Phase 10C.
- **2026-09 / ADR-045 Max-3 product images enforced with FOR UPDATE + transaction
  normalization:** the count check runs under an explicit product row lock so concurrent
  uploads cannot exceed the cap; primary is derived (first image auto-primary, reorder and
  removal normalize back to exactly one). Delivered in Phase 10C.
- **2026-09 / ADR-046 Remote delete is always best-effort after the DB write, never
  before:** the database stays the source of truth for what customers see; rows/columns are
  updated first, then the cloud asset is deleted, and a failed delete surfaces as a `SYSTEM`
  `MEDIA_CLEANUP_FAILED` audit instead of breaking the request. The orphan case (upload
  succeeded, DB write failed) also cleans up best-effort. Delivered in Phase 10C.
- **2026-09 / ADR-047 Customers receive optimized secure URLs, never raw uploads or storage
  keys:** `secureUrl` is built at upload time via `cloudinary.url(public_id, { secure:
true, width: 800, crop: 'limit', f_auto, q_auto })`; `providerPublicId`/`resourceType`
  stay server-internal and out of shared contracts and audit payloads. Delivered in
  Phase 10C.
- **2026-09 / ADR-048 KYC requires exactly Aadhaar + Driving Licence for every delivery
  partner:** the private-document policy is `['AADHAAR', 'DRIVING_LICENSE']` (capability is
  configurable data, not a literal branch/city rule). Legacy PAN/ADDRESS_PROOF rows remain
  supported for historical data and migration but are not part of the KYC gate; the
  activation flow reuses the same `REQUIRED_DOCUMENTS` source of truth. Delivered in
  Phase 10D.
- **2026-09 / ADR-049 Private identity documents are stored behind their own provider,
  never as public media:** KYC assets live in Cloudinary as `type: 'authenticated'` under a
  `hungry-box/kyc` folder through the `PRIVATE_KYC_STORAGE_PROVIDER` symbol, mirroring the
  public `MEDIA_STORAGE_PROVIDER` pattern (Cloudinary when configured, else an unavailable
  provider that 503s). There is never a permanent public URL, a signed URL, or an identity
  number persisted in the DB, audit messages, or logs. Delivered in Phase 10D.
- **2026-09 / ADR-050 Private document access is backend-authorized and short-lived:** no
  asset is ever downloadable by guessing a URL. Partner, branch manager, and super admin
  request access on demand; the server re-checks RBAC + branch ownership and returns a
  Cloudinary `private_download_url` that expires after ~5 minutes
  (`PRIVATE_DOCUMENT_ACCESS_TTL_MS`) and is never persisted. Delivered in Phase 10D.
- **2026-09 / ADR-051 Private documents are validated server-side by magic bytes, not
  MIME/extension:** `validatePrivateKycDocument` mirrors the public validator — JPEG/PNG
  signatures only, ≤ 5 MB (`MAX_PRIVATE_DOCUMENT_BYTES`), PDF/SVG/WebP/HEIC/disguised
  payloads rejected; the multipart route carries a matching `FileInterceptor` size cap.
  Delivered in Phase 10D.
- **2026-09 / ADR-052 KYC verification is a human Branch Manager decision, never
  machine:** there is no OCR/auto-verification. Only a manager of the partner's assigned
  branch (server-enforced `branch_id` match, IDOR-safe) may VERIFY/REJECT; rejection
  requires a note; super admin has global read/audit access but is forbidden from review in
  the service; re-upload resets a document to `UPLOADED` and clears review fields. Delivered
  in Phase 10D.
- **2026-09 / ADR-053 Storage and DB stay consistent with the DB as source of truth and
  best-effort remote cleanup:** upload writes the asset first, then the DB row; a failed DB
  write deletes the orphan best-effort; re-upload deletes the old asset only after DB
  success; any failed cleanup becomes a `SYSTEM`-actor `KYC_CLEANUP_FAILED` audit, never a
  request error. `@AllowInactiveDeliveryPartner()` (RolesGuard opt-out) lets a
  PENDING_VERIFICATION/DOCUMENT_REVIEW/SUSPENDED/INACTIVE partner upload or re-view their
  own documents while keeping the user-account ACTIVE check and all other role gating.
  Delivered in Phase 10D.
- **2026-09 / ADR-054 KYC metadata never contains sensitive identity numbers:** the DB stores
  only storage facts (`storageProvider`, `providerPublicId`, `resourceType`, `format`,
  `fileSize`) plus review state; list/status contracts expose presence booleans and statuses,
  never Aadhaar/licence numbers, references, or URLs. Delivered in Phase 10D.
- **2026-09 / ADR-055 The client-side role mirror is UX-only, never authorization:**
  `canRoleAccessPath` / `resolvePostLoginPath` exist so a stale bookmark or a post-login
  redirect cannot drop a user onto another role's screen. They read no secret and grant
  nothing — the API `RolesGuard` (plus per-request status revalidation) and
  `BranchScopeGuard` remain authoritative on every request, and a client that skipped them
  would still be rejected server-side. Delivered in Phase 12B.
- **2026-09 / ADR-056 One management entry, and legacy `/manager` is redirect-only:**
  management has a single entry (`/admin`) and a single login experience
  (`ManagementLoginPage`); the role-aware dashboard lives at `/admin/dashboard` and is
  chosen from the authenticated role. The retired `/manager` tree renders no UI of its
  own — it maps to `/admin/branch/...` (or the dashboard) and bounces unauthenticated
  visitors to the management login carrying their destination, which removes the second
  login surface and makes a redirect loop structurally impossible. Delivered in Phase 12B.
- **2026-09 / ADR-057 Branch media is a branch-owned entity, not extra global images:**
  `BranchProductImage` hangs off `BranchProduct` (cascade delete) instead of adding rows to
  the HQ-owned `ProductImage` table. Two managers at different branches can therefore show
  different pictures for the same global product, the manager's write is authorized purely
  by the stored `branchId` on the branch product, and global media stays a purely
  `SUPER_ADMIN` surface with no partial write path. The same storage abstraction, byte-level
  validator, 3-image cap, single-primary invariant, `FOR UPDATE` locking, best-effort remote
  cleanup and storage-key-free contracts as Phase 10C apply unchanged. Delivered in Phase
  12C.
- **2026-09 / ADR-058 One canonical image resolver, used by every customer-visible surface:**
  `resolveCatalogImageUrl` (branch primary/first → global primary/first → category → null) is
  the single decision point, consumed by the catalogue list, product detail, the
  `BranchProduct` DTO, cart lines and checkout lines. Resolving per surface is what allowed
  a cart or checkout thumbnail to disagree with the product grid; a shared function makes
  that divergence impossible by construction rather than by convention. Delivered in Phase
  12C.
- **2026-09 / ADR-059 The public product detail keeps the global HQ gallery:** branch imagery
  reaches customers only through the canonical `imageUrl`; `CatalogProductDetail.images`
  stays the HQ-owned gallery. A branch-aware public gallery would make a public contract
  branch-shaped for no customer benefit while managers already get the full explanation via
  `BranchProductDto.branchImages` + `globalImages`. Delivered in Phase 12C.
- **2026-09 / ADR-060 Global media mutations stay `SUPER_ADMIN`-only:** the products and
  categories media routes keep their explicit method-level `@Roles('SUPER_ADMIN')` even
  though branch media is now manager-editable. Widening HQ media would let one branch
  restyle a shared product for every branch, which contradicts ADR-025. Delivered in Phase
  12C.
- **2026-09 / ADR-061 Management UI is built on a shared component foundation:** `Button`
  (with role-appropriate variants), `Dialog`/`ConfirmDialog`, `Notice`, `LoadingState`,
  `StatusBadge`, `EmptyState`, `ImageField`, `FilterChips` and `AuditLogPanel` are shared
  primitives, so loading, error, empty, confirmation, status and media-picker behaviour is
  defined once and reused by admin, manager and customer surfaces instead of being
  re-implemented per page. The primitives are deliberately brand-palette-driven and
  role-neutral so the future Customer design can replace usage without forking behaviour.
  Delivered in Phase 11B and extended through 11C/11D.
- **2026-09 / ADR-062 Dead code is removed only on recorded evidence, and a deliberate keep
  is a decision:** Phase 11D removed verifiably unreferenced web files/exports and recorded
  what was checked. Two candidates were explicitly **kept** after review: `ErrorState` (a
  Phase 11B foundation component with tests, but no semantically correct admin/manager call
  site — the real sites correctly use inline `Notice`/`EmptyState`), and the `.gitkeep`
  placeholders (an earlier pass had deleted them and they were restored as unrelated churn).
  Re-litigating a documented keep in a later phase requires new evidence, not a fresh grep.
  Delivered in Phase 11D.

ADR numbers 017–019 and 037–040 were never recorded in this file (those phases' decisions
were captured in their phase reports instead). The gap is intentional — do not reuse those
numbers for new decisions; continue from ADR-062.

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
where Phase 4 already supports them; no fake refunds.

## Phase 7 status (complete)

Phase 7 (Super Admin Operations) is **shipped and verified**: global branch lifecycle
management, branch manager administration with one-time passwords, per-request suspension
enforcement in `RolesGuard`, a global (branch-aware) catalog with images, cross-branch
order/delivery/audit visibility, and a read-only analytics + CSV reports layer — plus the
admin frontend (`pages/admin/*`, eight flat SUPER_ADMIN routes under `AdminLayout`) and
tests. Verified green: **API 298 passed / 2 skipped, Web 95 passed**, typecheck, lint, and
full build.

Phase 7 is **migration-free**: no `schema.prisma` change, no migration, no `db push`, no
reseed. Everything reused the existing data model (`AuditEvent`/`ProductImage`/status
columns already existed); refund/analytics reporting reads `Payment.status` only — the
refund **action** workflow is deliberately out of scope until a future schema change.
Recharts was added to `apps/web` only. Nothing was committed in Phase 7 (baseline
`4c59b88`); see `docs/phase-7-report.md` for the 38-point delivery report and ADRs 22–27
above for the decisions.

## Phase 8 status (complete)

Phase 8 (Live Delivery Lifecycle, Branch Isolation & Realtime Hardening) is **shipped and
verified**: delivery-partner suspension is now enforced end to end (guard re-validates
`User.status` + partner profile status; assignment/location services throw 403 as defense in
depth; the realtime gateway disconnects non-operational users), the `/realtime` Socket.IO
gateway CORS follows the same explicit `CORS_ORIGINS` allow-list as the HTTP API (deny by
default instead of `origin: true`), and the customer tracking section shows a Live/Syncing
badge and refetches authoritative REST when a delivery event arrives for its order. A new
opt-in live suite (`RUN_LIVE_E2E=1` + `DATABASE_URL`) drives the real Postgres chain end to
end (customer -> dev-payment -> manager -> assignment -> delivered -> audit/analytics),
proves branch isolation on the delivery boundary (`delivery.partner_ineligible`, foreign
partner invisible to a pinned manager), and verifies a suspended partner's existing JWT is
rejected on the next request. Verified green: **API 307 passed / 5 skipped, Web 97 passed**,
typecheck, lint, full build, and `prisma validate`.

Phase 8 is **migration-free**: no `schema.prisma` change, no migration, no `db push`, no
reseed. Payment verification is exercised against the existing **development payment
provider**; a production gateway remains deferred. Nothing was committed in Phase 8
(baseline `c73f7b0`); see `docs/phase-8-report.md` for the delivery checklist and ADRs
28–30 above for the decisions.

## Phase 9 status (complete)

Phase 9 (Deployment & Staging Readiness) is **shipped and verified** — repository-only, no
deployment, no commits, no database mutation (baseline `0dd7f42`). It wires production
commands (root `start:api`/`db:deploy`/`provision:*` → API workspace `start:prod`,
`prisma migrate deploy`, `tsx` bootstrap CLIs), pins Node 22 (`.nvmrc` + engines), encodes
the Railway API service in `railway.json` (Nixpacks workspace build, pre-deploy migration,
`/api/health` readiness, replicas 1), and hardens deployment-sensitive seams: a single
fail-fast CORS validator shared by HTTP and Socket.IO, `200 ok / 503 degraded` health
semantics, payment-provider boot validation (dev provider rejected under
`NODE_ENV=production`), graceful shutdown, minimal request logging, a corrected Vite
`/socket.io` websocket proxy, and a frontend 401 → session-expiry path that clears the
local session once so authenticated screens fall back to `/login` without redirect loops.

Verified green: **API 332 passed / 5 skipped, Web 101 passed (+4)**, typecheck (incl.
`tsconfig.seed.json` covering the new `scripts/`), lint, full build, Prettier on all Phase 9
files, and `prisma validate`.

Safeguards: provisioning CLIs are operator-only and refuse-by-default (no auto-bootstrap,
no hard-coded credentials, no Guntur literals); only `.env.example` documentation changed
(`.env*` untouched); no new dependencies. Note the `dev` payment provider must still be
replaced with a real gateway before live payments, and the web frontend is built but not yet
served by Railway. See `docs/phase-9-report.md` and ADRs 31–36 above.

## Phase 10B status (complete)

Phase 10B (Cash on Delivery, cash only) is **shipped and verified**. COD reuses the existing
`Payment` model — a `method='COD'`, `provider='cod'`, `status='PENDING'` row is created with
the order (`POST /orders/cod`, idempotent via `idempotencyKey`) and never touches the
payment-intent/provider layer; a COD order is security-boundary-excluded from online
gateways by construction (no intent, no verification). Cash is collected in two audited
paths:

- Delivery partner completes delivery with `cashCollected: true`
  (`deliver(assignmentId, token, cashCollected)`) → payment `PAID` (`collectedAt`,
  `collectedByRole='DELIVERY_PARTNER'`, `collectedById`) + order `PAID` in one transaction;
  pending-COD-without-cash refuses with `delivery.cash_not_collected` and never overwrites
  an already-collected COD payment.
- Branch manager corrects a missed phone-side collection
  (`POST /branch/orders/:id/collect-cod`, reason required) via a guarded
  `payment.updateMany` (`cod.already_collected` on double-collect) that also closes the
  order payment.

`Order.paymentStatus` and per-payment collection attributes are surfaced in the customer
detail/success flows ("To pay on delivery … in cash", "Collected … by partner/by branch"),
the delivery partner dashboard (cash prompt + checkbox before marking delivered), the
manager order detail (record-cash button), and the super-admin overview (COD orders,
cash-collected, cash-pending cards). Analytics adds a COD summary plus `collectedAt`,
`collectedByRole`, `collectedById` CSV columns. Deliberately deferred: COD via
payment-intent, half-payments/change handling, and the single-payment-per-order restriction
enforcement on multiple COD rows (see ADR-042).

Verified green: **API 345 passed / 5 skipped (40 files), Web 109 passed (16 files)**,
typecheck, lint, full build, and `prisma validate`. The migration
`20260924184622_phase6_cash_on_delivery` was applied with the safe `migrate dev --create-only`
→ `prisma migrate deploy` flow (it also folds in the previously-unmigrated `AuditEvent`
branch `FK` and the `PartnerIdCounter` default; see ADR-041). `migration_lock.toml` is now
present. Nothing committed in Phase 10B (baseline `cc0c5fa`); see
`docs/phase-10b-report.md` and ADRs 41–42.

## Phase 10C status (complete)

Phase 10C (public catalog media) is **shipped and verified**. SUPER_ADMIN uploads up to
**3 images per product** (primary, reorder, alt text, remove) and **one image per category**
(upload/replace/remove), served to customers as optimized, secure Cloudinary URLs from the
read-only storefront. Storage goes through the `MediaStorageProvider` abstraction
(`MEDIA_STORAGE_PROVIDER` symbol; ADR-043) with `resolveMediaStorageProvider(config)`
choosing Cloudinary when `CLOUDINARY_*` credentials are all set, else an unavailable provider
(503, never a boot failure). Uploads are magic-byte validated JPEG/PNG/WebP ≤ 5 MB
(ADR-044); the product cap and single-primary invariant are enforced under a `FOR UPDATE`
lock with reorder/removal normalization (ADR-045); remote assets are always deleted
best-effort **after** the DB write with `MEDIA_CLEANUP_FAILED` SYSTEM audits otherwise, and
orphaned uploads are cleaned up when the DB write fails (ADR-046); customers receive
`cloudinary.url(public_id, { secure: true, width: 800, crop: 'limit', f_auto, q_auto })`
URLs only — no storage keys or transformation knowledge (ADR-047).

`ProductImage` gains `providerPublicId` + `resourceType`; `Category` gains `imagePublicId` +
`imageResourceType`; audit kinds are extended
(`PRODUCT_IMAGE_UPLOADED/PRIMARY_CHANGED/REMOVED`, `PRODUCT_IMAGES_REORDERED`,
`CATEGORY_IMAGE_UPLOADED/REPLACED/REMOVED`, `MEDIA_CLEANUP_FAILED`); shared contracts drop
the obsolete product-image create/update inputs and add `ReorderProductImagesInput`.
Migration `20261001020000_phase10c_public_catalog_media` is applied via the same safe flow
(exactly 4 `ADD COLUMN`, no drops). Admin UI lives in `AdminCataloguePage`; storefront
`CategoryChips` renders category thumbnails. Verified green: **API 390 passed / 5 skipped
(44 files), Web 124 passed (17 files)**, typecheck, lint, full build, `prisma validate`, and
`prisma migrate status` (up to date). Cloudinary credentials are server-only and never a
`VITE_*` var; nothing committed in Phase 10C (baseline `46942aa`); see
`docs/phase-10c-report.md` and ADRs 43–47.

## Phase 10D status (complete)

Phase 10D (private delivery-partner KYC documents) is **shipped and verified**. Every
delivery partner must have **Aadhaar + Driving Licence** (ADR-048) uploaded as private,
authenticated Cloudinary images under `hungry-box/kyc` (ADR-049) that are never publicly
addressable; partners self-service upload/re-upload (`POST /delivery/kyc/documents`,
JPEG/PNG ≤ 5 MB magic-byte validated — ADR-051) and access is backend-authorized,
short-lived, and never persisted (ADR-050). Branch Managers of the partner's assigned branch
review each document (VERIFY/REJECT with required reason; ADR-052), Super Admin keeps global
read/audit visibility but cannot review, and document statuses feed an overall KYC state
(`INCOMPLETE` / `ACTION_REQUIRED` / `AWAITING_REVIEW` / `VERIFIED`) surfaced on the partner
profile, manager partner detail, and admin partner list. Storage and DB stay consistent via
best-effort cleanup with `KYC_CLEANUP_FAILED` audits, and the platform lets an
under-review/inactive partner keep uploading via `@AllowInactiveDeliveryPartner()` (ADR-053);
no sensitive identity numbers are ever stored or exposed (ADR-054).

Schema: `DeliveryPartnerDocument` gains nullable `storageProvider` /
`providerPublicId` / `resourceType` / `format` / `fileSize` via
`20261001030000_phase10d_private_kyc_documents` (exactly 5 `ADD COLUMN`, no drops), applied
with `prisma migrate deploy`. Audit kinds add
`KYC_DOCUMENT_UPLOADED/REUPLOADED/VIEWED/VERIFIED/REJECTED` + `KYC_CLEANUP_FAILED`; shared
contracts add type-only `kyc.ts` (`KycStatusDto`, `KycListItemDto`, `KycReviewInput`,
`KycDocumentAccessDto`, …). Verified green: **API 440 passed / 5 skipped (44 files), Web 136
passed (19 files)**, typecheck, lint, full build, `prisma validate`, and `prisma migrate
  status` (up to date, 7 migrations). Cloudinary credentials stay server-only; nothing
committed in Phase 10D (baseline `da2f469`); see `docs/phase-10d-report.md` and ADRs 48–54.

## Phase 10E status (complete)

Phase 10E was an **acceptance and audit** phase over 10B (COD), 10C (public media) and 10D
(private KYC): it re-verified the migration chain, the RBAC and branch-isolation boundaries,
the media/KYC storage architecture and the secret-handling posture, and repaired three
confirmed public-media defects it found. No new capability and no schema change. Full
checklist, honesty labels (`CODE REVIEW VERIFIED` / `AUTOMATED TEST VERIFIED` /
`NOT LIVE-TESTED`) and known limitations are in `docs/phase-10e-acceptance-report.md`.
Still open from that phase: the production payment gateway and the live-database e2e runs,
which require a provisioned environment and real provider credentials.

## Phase 11 status (complete) — production-quality UI hardening

Phase 11 is a UI-hardening track across all four roles, delivered in three commits and
migration-free.

- **11B — shared UI foundation.** The reusable primitives both apps now build on:
  `Button` (variants), `Dialog`, `ConfirmDialog`, `Notice`, `LoadingState`, `StatusBadge`,
  `EmptyState`, `ErrorState`, `PageHeader`, `ProductImage`, the `forms/` field set, plus
  `lib/money.ts` for minor-unit formatting. Established the rule that loading, error, empty,
  status, confirmation and money rendering are defined once (ADR-061).
- **11C — customer production experience.** The Customer storefront, cart, checkout, orders
  and addresses rebuilt on those primitives with mobile-first layout, large touch targets,
  real empty/loading/error states and accessible labels. **No business behaviour changed** —
  the API contracts, RBAC and branch isolation were untouched.
- **11D — Admin + Manager shared UI consistency.** Admin and Manager pages converted to the
  shared components; extracted `FilterChips` and a reusable `AuditLogPanel` (so
  `AdminAuditPage`/`ManagerAuditPage` are thin role wrappers); centralised date formatting
  in `lib/format.ts`; split the realtime indicator so the customer tracking section reuses
  an existing socket instead of opening a second one; removed verified-dead web code; and
  kept `ErrorState` and the `.gitkeep` placeholders deliberately (ADR-062). Delivery report:
  `docs/phase-11d-report.md`.

Across Phase 11 no Prisma schema change, no migration, no endpoint change, and no change to
the Customer design direction. One pre-existing Vite large-chunk warning was carried
forward and left for Phase 12D.

## Phase 12 status (complete) — management architecture and management media

- **12B — management routing architecture.** `/admin` is the single management entry with a
  single management login; `/admin/dashboard` is role-aware; the 7 Super Admin and 6 Branch
  Manager segments (8 branch routes, counting the order and partner detail pages) are defined
  once in `routes/paths.ts`; the retired `/manager` tree became redirect-only; and
  `routes/management-routing.test.tsx` exercises the real route table (guards, deep links,
  role refusals, legacy mapping, no-loop). See §14 and ADR-055 / ADR-056. Migration-free; no
  URL was renamed in a breaking way — legacy URLs redirect.
- **12C — management catalogue media.** `BranchProductImage` plus the four branch media
  endpoints, the shared `ImageField` picker, the Super Admin product/category media flows
  and the Branch Manager branch-media flow with HQ images read-only, and the single
  canonical image resolver consumed by catalogue, cart and checkout. See §15 and ADR-057
  through ADR-060. Migration `20261001040000_phase12c_branch_product_images` is additive
  (one table, one index, one cascading FK).

Verified during the Phase 12C documentation pass: **API 490 passed / 5 skipped**, **Web 265
passed**, typecheck, lint, `npm run build` clean and `prisma validate` clean. The migration
chain is 8 migrations, newest `20261001040000_phase12c_branch_product_images`; live
`prisma migrate status` was not run here because it needs a reachable `DATABASE_URL`.
Phase 12B and Phase 12C are committed and pushed as `c26a578`.

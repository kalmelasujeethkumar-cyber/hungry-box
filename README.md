# Hungry Box

Hungry Box is a production-grade, multi-branch **snacks and shakes** delivery platform. It is
not a general restaurant marketplace. The first operational branch is **Guntur, Andhra
Pradesh, India** (10 km delivery radius), but the system is architected from day one as a
multi-branch platform: additional branches such as Hyderabad, Vijayawada, and Visakhapatnam
can be added as **configurable data, not code changes**.

## Roles

One application, one authentication flow, role-based routing after login:

| Role               | Scope                                                                                    |
| ------------------ | ---------------------------------------------------------------------------------------- |
| `SUPER_ADMIN`      | Global access across all branches (branches, users, analytics, ...)                      |
| `BRANCH_MANAGER`   | Own assigned branch only (products, pricing, orders, partners)                           |
| `DELIVERY_PARTNER` | Assigned operational scope (pickups, deliveries, earnings) — **paused, kept for future** |
| `CUSTOMER`         | Buyer experience (browse, cart, checkout, track, history)                                |

Management has a **single entry point** at `/admin` (one management login) with a role-aware
dashboard at `/admin/dashboard`. The retired `/manager` URLs are redirect-only. The full route
table is in `docs/architecture.md` §14.

## Project status

**Phase 12C complete (checkpoint `c26a578`).** Phase 11 was a production-quality UI hardening
track (11B shared component foundation, 11C customer experience, 11D Admin/Manager
consistency). Phase 12 covered management architecture: **12B** established `/admin` as the
single management entry with redirect-only legacy `/manager` handling and real-router tests;
**12C** added branch-owned catalogue media (`BranchProductImage`, Branch Manager media
controls, HQ media read-only for a branch) and a single canonical image resolver shared by the
storefront, cart and checkout.

Verified at `c26a578`: **API 490 passed / 5 skipped**, **Web 265 passed**, typecheck, lint and
build clean, and `prisma validate` clean. The schema carries 25 models and 14 enums across 8
migrations (newest `20261001040000_phase12c_branch_product_images`); live
`prisma migrate status` was not run in this environment.

Earlier phases delivered identity/RBAC, storefront + addresses + cart, checkout/payments/orders,
live delivery, Branch Manager and Super Admin operations, deployment readiness, COD, public
catalogue media, private partner KYC, and final acceptance (see `docs/phase-6-report.md`
through `docs/phase-10e-acceptance-report.md` and `docs/phase-11d-report.md`).

**Not yet done, by design:**

- **Delivery Partner is PAUSED — kept for future.** It is fully implemented and must not be
  deleted or redesigned; it may only be code-split so customers do not download it.
- **Customer authentication is still required.** Guest commerce belongs to Phase 13A.
- **The final Customer website design has not been decided** — the user will provide it. The
  current pages are production-quality but are not the final design; do not redesign them
  independently.
- Payments use the `dev` simulator; a production gateway is not integrated. COD is live.

## Technology stack

- **Frontend:** React 19, TypeScript (strict), Vite 8, Tailwind CSS 4
- **Backend:** Node.js, NestJS 12, REST API (global `/api` prefix)
- **Database:** PostgreSQL
- **ORM:** Prisma 7 (schema-as-source-of-truth, migrations, type-safe client)
- **Hosting:** Railway
- **Charts:** Recharts (analytics phases)
- **Shared contracts:** `@hungrybox/shared` (TypeScript-only package)

## Repository structure

```
hungry box/
|-- apps/
|   |-- api/             NestJS REST API                    (@hungrybox/api)
|   |   `-- src/generated/prisma/   generated Prisma client (git-ignored)
|   `-- web/             React + Vite + Tailwind frontend   (@hungrybox/web)
|-- packages/
|   `-- shared/          Shared TS contracts                (@hungrybox/shared)
|       |-- src/         source
|       `-- dist/        built declarations (git-ignored, rebuilt locally)
|-- docs/                Architecture & decision records
|-- AGENTS.md            Permanent engineering rules (read first)
|-- compose.yaml         Local PostgreSQL for development
`-- package.json         npm workspaces + root scripts
```

The shared package is **built to `packages/shared/dist`** (declaration files) and both apps
consume the built package, never the source. `dist/` is git-ignored and rebuilt locally.

## Local development setup

Prerequisites: Node.js >= 22, npm >= 10 (optionally Docker for local Postgres).

```bash
npm install                 # install all workspaces (from repo root)
```

### Local PostgreSQL (optional, recommended)

```bash
docker compose up -d        # starts Postgres on localhost:5432 (db: hungrybox)
```

If you already run Postgres, skip Docker and point `DATABASE_URL` at your instance.
The API boots and serves `/api/health` without a database; endpoints that need one report
`503 Service Unavailable` until `DATABASE_URL` is configured.

### Database setup (Phase 2+)

```bash
npm run db:generate          # generate the Prisma client from the schema
npm run db:migrate           # apply migrations (prisma migrate dev)
npm run db:seed              # deterministic demo/development seed data
```

The seed creates the demo **Guntur** branch (10 km delivery radius) and the demo accounts
(hashed with Argon2): `admin@gmail.com` / `456456` (SUPER_ADMIN),
`branch1@gmail.com` / `654654` (BRANCH_MANAGER), `shiva@` / `789789`
(DELIVERY_PARTNER — a username, intentionally not an email), and
`customer@gmail.com` / `20252025` (CUSTOMER, with a default HOME address in Guntur for
demo ordering). Seeds are idempotent and clearly marked demo/development data; they never
run automatically on server start.

## Environment configuration

Copy the example files and fill in local values (never commit real secrets):

- `apps/api/.env.example` → `apps/api/.env`. Server-only variables: `PORT`, `API_PREFIX`,
  `NODE_ENV`, `SERVICE_NAME`, `CORS_ORIGINS`, `DATABASE_URL`, `JWT_SECRET`,
  `JWT_EXPIRES_IN`, `PAYMENT_PROVIDER`, `DELIVERY_FEE_MINOR`, `CHECKOUT_TAX_MINOR`, and the
  three `CLOUDINARY_*` media credentials. A commented block also documents the
  operator-only `PROVISION_*` / `BRANCH_*` values read by `provision:admin` and
  `provision:branch`; the running API never reads them.
- `apps/web/.env.example` → `apps/web/.env`. Only public `VITE_*` values belong here, and
  there is exactly one: **`VITE_API_BASE_URL`**, which defaults to `/api`. It may be left
  unset in development (the Vite dev server proxies `/api` and `/socket.io`), and must be
  set to the real API origin in production.

Media provider selection and the private-document access TTL are **code, not configuration**
— see `docs/architecture.md` §20.

`DATABASE_URL` must come from environment variables. `.env*` files are git-ignored; only
`.env.example` placeholders are committed.

## Development commands

Run from the repository root:

```bash
npm run dev:web              # frontend dev server (http://localhost:5173)
npm run dev:api              # API dev server (watch, http://localhost:3000/api)
npm run build                # build shared → api → web
npm run typecheck            # typecheck shared/api/web (tsc --noEmit)
npm run lint                 # lint api + web
npm run format               # prettier --write
npm run format:check         # prettier --check
npm run test                 # api unit tests + web unit tests
npm run test:api             # api unit tests only
npm run test:web             # web unit tests only
npm run db:generate          # prisma generate
npm run db:migrate           # prisma migrate dev
npm run db:deploy            # prisma migrate deploy (what Railway runs pre-deploy)
npm run db:studio            # prisma studio
npm run db:seed              # prisma db seed (demo data, requires DATABASE_URL)
npm run start:api            # run the compiled API (node dist/main.js)
npm run provision:admin      # operator CLI: create the first SUPER_ADMIN (refuse-by-default)
npm run provision:branch     # operator CLI: create the first branch (refuse-by-default)
```

`npm run build` is the deploy build (the web workspace's build also type-checks before
`vite build`); `npm run typecheck` is the explicit type gate. The API workspace rebuilds the
shared package and regenerates the Prisma client in its own `prebuild`/`pretypecheck`, so
both paths stay self-contained.

There is **no CI pipeline** in this repository — these gates are run locally and recorded in
the phase reports.

The backend health check needs no database to answer:
`GET http://localhost:3000/api/health` returns service, version, uptime, timestamp and
database status (`unconfigured` / `connected` / `unreachable`) — **200** when the database is
connected, **503** when degraded. Endpoints that need the database fail with
`503 Service Unavailable` until `DATABASE_URL` is configured.

## Phase 2 endpoints (summary)

Authenticated by Bearer JWT unless marked public:

| Endpoint                                     | Access                                         |
| -------------------------------------------- | ---------------------------------------------- |
| `POST /api/auth/login` (public)              | Anyone (returns `{ accessToken, user }`)       |
| `GET /api/auth/me`                           | Any authenticated user                         |
| `GET /api/users`, `GET /api/users/:id`       | `SUPER_ADMIN`                                  |
| `GET /api/branches`, `GET /api/branches/:id` | Any authenticated user                         |
| `POST /api/branches`                         | `SUPER_ADMIN`                                  |
| `GET /api/categories`, `GET /api/products`   | Any authenticated user                         |
| `POST /api/products`                         | `SUPER_ADMIN`                                  |
| `GET/POST /api/branch-products`              | `SUPER_ADMIN` or `BRANCH_MANAGER` (own branch) |

## Phase 3 endpoints (summary)

Added in Phase 3 (all Bearer JWT; `CUSTOMER` unless noted):

| Endpoint                                                                                         | Access                 |
| ------------------------------------------------------------------------------------------------ | ---------------------- |
| `GET /api/catalog/products?branchId=[&categorySlug][&q]`                                         | Any authenticated user |
| `GET /api/catalog/categories?branchId=…`                                                         | Any authenticated user |
| `GET /api/catalog/products/:productId?branchId=…`                                                | Any authenticated user |
| `POST /api/locations/serviceability`                                                             | Any authenticated user |
| `GET/POST /api/addresses`, `/api/addresses/:id` (GET/PATCH/DELETE), `/api/addresses/:id/default` | `CUSTOMER`             |
| `GET /api/cart?branchId=…`, `DELETE /api/cart?branchId=…`                                        | `CUSTOMER`             |
| `POST /api/cart/items`, `PATCH/DELETE /api/cart/items/:id`                                       | `CUSTOMER`             |

Serviceability is computed on the server (Haversine vs. `branch.deliveryRadiusKm`) and the
cart always re-derives unit prices from the branch product on each mutation — the client
never sends prices. Branch-scoped endpoints reject requests whose `branchId` target does
not match the calling manager/partner's assigned branch (enforced on the server, never the
client). Live database tests are opt-in: set `RUN_LIVE_E2E=1` and a real `DATABASE_URL`
with seeded data, then `npm run test:e2e`. Unit tests mock Prisma and run without a
database; the frontend suite uses `jsdom` + Testing Library (API client mocked).

## Phase 4 endpoints (summary)

Added in Phase 4 (all Bearer JWT):

| Endpoint                                                                                                                                  | Access                                                                           |
| ----------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| `POST /api/checkout/preview`                                                                                                              | `CUSTOMER`                                                                       |
| `POST /api/checkout/payment-intent`                                                                                                       | `CUSTOMER`                                                                       |
| `POST /api/payments/verify`                                                                                                               | `CUSTOMER`                                                                       |
| `POST /api/payments/dev/simulate`                                                                                                         | `CUSTOMER`, and only usable while the `dev` simulator is the configured provider |
| `POST /api/orders` (idempotent), `GET /api/orders`, `GET/POST /api/orders/:id/cancel`                                                     | `CUSTOMER`                                                                       |
| `GET`/`POST /api/branch/orders`, `GET /api/branch/orders/:id`, `POST /api/branch/orders/:id/status`, `POST /api/branch/orders/:id/cancel` | `SUPER_ADMIN` / `BRANCH_MANAGER` (own branch)                                    |

Checkout amounts are always server-derived (a 409 conflict carries the fresh `preview` when
prices/availability changed), payments are verified server-side through the
`PAYMENT_PROVIDER` abstraction, order creation is transactional + replay-safe
(`idempotencyKey`), and manager order operations are scoped to the caller's branch on the
server.

## Phase 6 endpoints (summary)

Added in Phase 6 (all Bearer JWT; `SUPER_ADMIN`/`BRANCH_MANAGER`, own branch unless noted):

| Endpoint                                       | Access                                        |
| ---------------------------------------------- | --------------------------------------------- |
| `PATCH /api/branch-products/:id`               | `SUPER_ADMIN` / `BRANCH_MANAGER` (own branch) |
| `DELETE /api/branch-products/:id`              | `SUPER_ADMIN` / `BRANCH_MANAGER` (own branch) |
| `GET`/`PATCH /api/branch/settings?branchId=`   | `SUPER_ADMIN` (any) / `BRANCH_MANAGER` (own)  |
| `GET /api/branch/audit` (filters + pagination) | `SUPER_ADMIN` (all) / `BRANCH_MANAGER` (own)  |
| `GET /api/branch/audit/export` (CSV)           | `SUPER_ADMIN` (all) / `BRANCH_MANAGER` (own)  |

Catalog edits change only branch-varying fields (price, discount, availability, status) and
soft-deactivate instead of deleting; every mutation is branch-owned server-side (404 on
cross-branch) and audited with the branch id recorded. Delivery radius lives on
`branch.deliveryRadiusKm` and is editable per branch — never a hard-coded constant.

## Phase 7 endpoints (summary)

Added in Phase 7 (all Bearer JWT; `SUPER_ADMIN` unless noted):

| Endpoint                                                                 | Purpose                                                     |
| ------------------------------------------------------------------------ | ----------------------------------------------------------- |
| `PATCH /api/branches/:id/status`                                         | Activate / pause / deactivate a branch (lifecycle state)    |
| `PATCH /api/branches/:id`                                                | Edit branch config (delivery radius, address)               |
| `GET /api/branches`                                                      | Full branch list for the admin console                      |
| `POST /api/users/managers`                                               | Create branch manager (returns one-time password once)      |
| `GET /api/users?role=BRANCH_MANAGER`                                     | Manager list (search / branch / status / pagination)        |
| `PATCH /api/users/:id/status`                                            | Activate / deactivate / suspend a manager                   |
| `GET`/`POST`/`PATCH /api/products` (+ `PATCH /:id/status`, image routes) | Global product management (no physical deletes)             |
| `GET`/`POST`/`PATCH /api/categories`                                     | Global category management (soft status changes)            |
| `GET /api/branch/orders`                                                 | Global order list (branch/status/date filters; Super Admin) |
| `GET /api/branch/partners`                                               | Partner list widened w/ branch filter (Super Admin)         |
| `GET /api/branch/audit`, `/api/branch/audit/export`                      | Global audit explorer + CSV (new Phase 7 kinds queryable)   |
| `GET /api/admin/dashboard`                                               | Analytics summary (branch/date/bucket filters)              |
| `GET /api/admin/reports/orders`                                          | Orders report CSV (branch/date/status filters)              |

There is **no** `GET /api/delivery-partners` route. Partner reads live under the branch
prefix: `GET /api/branch/partners` (and `GET /api/branch/partners/:partnerId`,
`GET /api/branch/partners/candidates`) are open to `SUPER_ADMIN` **and**
`BRANCH_MANAGER`, with a manager pinned to their own branch; the partner's own surface is
`GET /api/delivery/profile`.

Phase 7 was delivered without any schema migration — it reuses existing columns and
entities; refund/analytics reporting derives from `Payment.status` (read-only; refund
**actions** are a later-phase schema change).

## Phase 10 endpoints (summary)

Media and KYC, added in Phases 10B–10D (all Bearer JWT):

| Endpoint                                                                                                                       | Access                                                         |
| ------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------- |
| `POST /api/products/:id/images`, `PATCH .../images/reorder`, `PATCH .../images/:imageId/primary`, `DELETE .../images/:imageId` | `SUPER_ADMIN`                                                  |
| `POST /api/categories/:id/image`, `DELETE /api/categories/:id/image`                                                           | `SUPER_ADMIN`                                                  |
| `GET /api/delivery/kyc`, `POST /api/delivery/kyc/documents`, `POST /api/delivery/kyc/documents/:type/access`                   | `DELIVERY_PARTNER` (own documents)                             |
| `GET /api/branch/kyc`, `GET /api/branch/kyc/:partnerId`, `POST /api/branch/kyc/:partnerId/documents/:type/access`              | `SUPER_ADMIN`, `BRANCH_MANAGER`                                |
| `POST /api/branch/kyc/:partnerId/documents/:type/review`                                                                       | `BRANCH_MANAGER` (partner's branch only)                       |
| `POST /api/orders/cod`                                                                                                         | `CUSTOMER` (idempotent cash-on-delivery order)                 |
| `POST /api/branch/orders/:id/collect-cod`                                                                                      | `SUPER_ADMIN` / `BRANCH_MANAGER` (own branch, reason required) |

Media upload limits are identical for global and branch media: **max 3 images** per product
(or per branch product), **max 5 MB** each, **JPEG / PNG / WebP only** decided by byte
signature rather than filename, MIME type or extension, and **exactly one primary** image at
all times. KYC documents are private, magic-byte validated, backend-authorized and
short-lived (a signed URL expiring after ~5 minutes that is never persisted). The
Cloudinary credentials are server-only; when they are absent the API still boots and media
requests return 503. A partner may keep uploading and re-viewing their own documents while
under review or inactive; only a `BRANCH_MANAGER` of the partner's assigned branch may
verify or reject a document (rejection requires a note), and Super Admin has global
read/audit visibility but is deliberately **not** permitted to review.

## Phase 12 endpoints (summary)

Added in Phase 12C (all Bearer JWT; `SUPER_ADMIN`, `BRANCH_MANAGER`):

| Endpoint                                             | Notes                                                                                                       |
| ---------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `POST /api/branch-products/:id/images`               | Upload branch-owned media; branch derived from the stored `BranchProduct.branchId`, never from client input |
| `PATCH /api/branch-products/images/reorder`          | Must be one complete set for one branch product                                                             |
| `PATCH /api/branch-products/images/:imageId/primary` | Demotes the previous primary                                                                                |
| `DELETE /api/branch-products/images/:imageId`        | Promotes the lowest-`sortOrder` survivor                                                                    |

Branch media is a separate entity from the HQ `ProductImage` table, so two branches can
show different pictures for the same global product and a manager can never write a
`ProductImage` or a category image — those stay `SUPER_ADMIN`-only. A foreign branch
product or image returns `404`, not `403`, so it cannot be used to probe another branch.

## Development phases

- **Phase 1:** Monorepo foundation, tooling (TS/eslint/prettier), shared contracts,
  NestJS backend + health check, Prisma wiring, React/Vite/Tailwind frontend.
- **Phase 2:** Authentication & RBAC, branches, global products + branch products,
  customer catalog API, secure demo seed, role-based frontend routing.
- **Phase 3:** Customer experience in the one app — saved addresses, delivery
  serviceability, branch-aware storefront (search/filter/product details), and a
  per-branch cart with server-side pricing.
- **Phase 4 (complete):** Checkout, payments & orders — server-verified preview/intent +
  payment-provider abstraction (`dev` simulator), transactional idempotent order creation
  with immutable snapshots, order state machine + customer timeline/history/cancel,
  branch-scoped manager order operations, audit log.
- **Phase 5 (complete):** Delivery partners, assignment & live tracking - partner onboarding,
  document verification & online/offline availability, branch-scoped manager assignment
  (assign/cancel), partner accept/reject/pickup/out-for-delivery/deliver driving the
  `READY_FOR_PICKUP -> OUT_FOR_DELIVERY -> DELIVERED` order segment, live customer tracking
  (Socket.IO realtime + server-verifiable REST location/status endpoint), notifications
  inbox, and the delivery-partner (mobile-first) / manager dispatch / customer tracking
  frontends.
- **Phase 6 (complete):** Branch Manager operations - branch catalog edit/soft-hide and
  settings (delivery radius), a branch-scoped audit log with filters + CSV export
  (`AuditEvent.branchId` already in schema; branch id now plumbed through every audit
  write), manager dashboard/orders/catalogue/settings/audit frontend, and full API + web
  test coverage.
- **Phase 7 (complete):** Super Admin operations - branch lifecycle management, branch
  manager administration (one-time passwords), suspended-user enforcement (per-request),
  global catalog with images, cross-branch order/delivery/audit visibility, and a read-only
  analytics + reports layer (Recharts dashboards + CSV exports) with an admin frontend and
  full API + web test coverage. Delivered migration-free (`docs/phase-7-report.md`).
- **Phase 8 (complete):** Live delivery lifecycle, branch isolation & realtime hardening
  (`docs/phase-8-report.md`).
- **Phase 9 (complete):** Deployment & staging readiness (`docs/phase-9-report.md`).
- **Phase 10 (complete):** COD (cash only), public catalog media via Cloudinary, private
  delivery-partner KYC documents, and final acceptance/hardening
  (`docs/phase-10b-report.md`, `docs/phase-10c-report.md`, `docs/phase-10d-report.md`,
  `docs/phase-10e-acceptance-report.md`).
- **Phase 11 (complete):** Production-quality UI hardening across all four roles, delivered
  migration-free in three commits.
  - 11B: shared UI foundation - `Button`, `Dialog`, `ConfirmDialog`, `Notice`,
    `LoadingState`, `StatusBadge`, `EmptyState`, `PageHeader`, `ProductImage`, form fields.
  - 11C: customer production experience.
  - 11D: Admin + Manager shared UI consistency - shared audit panel, filter chips,
    standardized status/loading/error states, dead-code cleanup (`docs/phase-11d-report.md`).
- **Phase 12 (complete):** Management architecture.
  - 12B: `/admin` as the single management entry with one management login, a role-aware
    `/admin/dashboard`, redirect-only legacy `/manager` URLs, and real-router tests.
  - 12C: branch-owned catalogue media (`BranchProductImage`, branch manager media controls,
    HQ media read-only for a branch) plus one canonical image resolver shared by the
    storefront, cart and checkout.
- **Phase 12D (not started):** dead-code cleanup and production bundle optimization. The
  web app is still a single ~992 kB JS chunk with no route-level code splitting; rules are in
  `docs/architecture.md` §21.
- **Phase 13A (not started):** Customer guest commerce — guest browsing/cart/checkout/tracking
  and the customer-authentication change. **Customer authentication is still required today.**
- **Not started / deferred:** the user-provided final Customer website design, a production
  payment gateway (the `dev` simulator plus COD are live), refund actions (schema change),
  promotions/coupons, payouts, and Customer/Delivery app-wide UI consistency.

Phases are developed one at a time; the platform is built in-order, not by skipping ahead.

## Where to read more

`docs/architecture.md` is the source of architectural truth:

| Topic                                                     | Section            |
| --------------------------------------------------------- | ------------------ |
| Management routing, `/admin`, legacy `/manager`           | §14                |
| Catalogue, `BranchProductImage`, canonical image resolver | §15                |
| Customer experience **today**                             | §16                |
| Customer experience **future** (not built)                | §17                |
| Delivery Partner (paused, kept)                           | §18                |
| Testing suites and totals                                 | §19                |
| Git, line endings, environment, security                  | §20                |
| Phase 12D performance rules                               | §21                |
| Architectural invariants                                  | §22                |
| Roadmap of uncommitted work                               | §24                |
| Decision log (ADR-001 … ADR-062)                          | bottom of the file |

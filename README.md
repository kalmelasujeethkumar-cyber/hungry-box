# Hungry Box

Hungry Box is a production-grade, multi-branch food and snacks delivery platform. The first
operational branch is **Guntur, Andhra Pradesh, India** (10 km delivery radius), but the
system is architected from day one as a multi-branch platform: additional branches such as
Hyderabad, Vijayawada, and Visakhapatnam can be added as **configurable data, not code
changes**.

## Roles

One application, one authentication flow, role-based routing after login:

| Role               | Scope                                                               |
| ------------------ | ------------------------------------------------------------------- |
| `SUPER_ADMIN`      | Global access across all branches (branches, users, analytics, ...) |
| `BRANCH_MANAGER`   | Own assigned branch only (products, pricing, orders, partners)      |
| `DELIVERY_PARTNER` | Assigned operational scope (pickups, deliveries, earnings)          |
| `CUSTOMER`         | Buyer experience (browse, cart, checkout, track, history)           |

## Project status
**Phase 5 - delivery partners, assignment & live tracking (current).** Phase 4 - checkout,
payments & orders (server-verified preview/conflict-detection, pluggable `dev` payment
simulator behind `PAYMENT_PROVIDER`, transactional + idempotent order creation with
immutable snapshots, order state machine + timeline/history/cancel, branch-scoped manager
order ops, audit log, customer checkout/success/history/detail pages) - is complete, and
Phases 1-3 (monorepo foundation + RBAC/catalog, name/catalog foundation; storefront, saved
addresses, serviceability & cart; plus the delivery-partner & order foundations) remain
green. Phase 5 keeps the single-application multi-branch architecture and adds the final
mile: delivery-partner onboarding, document verification & online/offline availability,
branch-scoped manager assignment (assign/cancel), partner accept/pickup/out-for-delivery/
deliver driving the assignment state machine, live customer tracking (location + status via
realtime + a server-verifiable REST endpoint), a notifications inbox, and the delivery-
partner / manager dispatch / customer tracking frontends. Refunds/discounts, analytics &
admin dashboards are Phase 6 (see Development phases).

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
ÃƒÂ¢Ã¢â‚¬ÂÃ…â€œÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ apps/
ÃƒÂ¢Ã¢â‚¬ÂÃ¢â‚¬Å¡   ÃƒÂ¢Ã¢â‚¬ÂÃ…â€œÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ api/             NestJS REST API                    (@hungrybox/api)
ÃƒÂ¢Ã¢â‚¬ÂÃ¢â‚¬Å¡   ÃƒÂ¢Ã¢â‚¬ÂÃ¢â‚¬Å¡   ÃƒÂ¢Ã¢â‚¬ÂÃ¢â‚¬ÂÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ src/generated/prisma/   generated Prisma client (git-ignored)
ÃƒÂ¢Ã¢â‚¬ÂÃ¢â‚¬Å¡   ÃƒÂ¢Ã¢â‚¬ÂÃ¢â‚¬ÂÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ web/             React + Vite + Tailwind frontend   (@hungrybox/web)
ÃƒÂ¢Ã¢â‚¬ÂÃ…â€œÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ packages/
ÃƒÂ¢Ã¢â‚¬ÂÃ¢â‚¬Å¡   ÃƒÂ¢Ã¢â‚¬ÂÃ¢â‚¬ÂÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ shared/          Shared TS contracts                (@hungrybox/shared)
ÃƒÂ¢Ã¢â‚¬ÂÃ¢â‚¬Å¡       ÃƒÂ¢Ã¢â‚¬ÂÃ…â€œÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ src/         source
ÃƒÂ¢Ã¢â‚¬ÂÃ¢â‚¬Å¡       ÃƒÂ¢Ã¢â‚¬ÂÃ¢â‚¬ÂÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ dist/        built declarations (git-ignored, rebuilt locally)
ÃƒÂ¢Ã¢â‚¬ÂÃ…â€œÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ docs/                Architecture & decision records
ÃƒÂ¢Ã¢â‚¬ÂÃ…â€œÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ AGENTS.md            Permanent engineering rules (read first)
ÃƒÂ¢Ã¢â‚¬ÂÃ…â€œÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ compose.yaml         Local PostgreSQL for development
ÃƒÂ¢Ã¢â‚¬ÂÃ¢â‚¬ÂÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ package.json         npm workspaces + root scripts
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
The API boots and serves `/api/health` without a database; authenticated endpoints report
`Service Unavailable` until the database is configured.

### Database setup (Phase 2+)

```bash
npm run db:generate          # generate the Prisma client from the schema
npm run db:migrate           # apply migrations (prisma migrate dev)
npm run db:seed              # deterministic demo/development seed data
```

The seed creates the demo **Guntur** branch (10 km delivery radius) and the demo accounts
(hashed with Argon2): `admin@gmail.com` / `456456` (SUPER_ADMIN),
`branch1@gmail.com` / `654654` (BRANCH_MANAGER), `shiva@` / `789789`
(DELIVERY_PARTNER ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â a username, intentionally not an email), and
`customer@gmail.com` / `20252025` (CUSTOMER, with a default HOME address in Guntur for
demo ordering). Seeds are idempotent and clearly marked demo/development data; they never
run automatically on server start.

## Environment configuration

Copy the example files and fill in local values (never commit real secrets):

- `apps/api/.env.example` ÃƒÂ¢Ã¢â‚¬Â Ã¢â‚¬â„¢ `apps/api/.env` (`PORT`, `API_PREFIX`, `CORS_ORIGINS`,
  `DATABASE_URL`)
- `apps/web/.env.example` ÃƒÂ¢Ã¢â‚¬Â Ã¢â‚¬â„¢ `apps/web/.env` (only public `VITE_*` values belong here;
  none are required yet)

`DATABASE_URL` must come from environment variables. `.env*` files are git-ignored; only
`.env.example` placeholders are committed.

## Development commands

Run from the repository root:

```bash
npm run dev:web              # frontend dev server (http://localhost:5173)
npm run dev:api              # API dev server (watch, http://localhost:3000/api)
npm run build                # build shared ÃƒÂ¢Ã¢â‚¬Â Ã¢â‚¬â„¢ api ÃƒÂ¢Ã¢â‚¬Â Ã¢â‚¬â„¢ web
npm run typecheck            # typecheck shared/api/web
npm run lint                 # lint api + web
npm run format               # prettier --write
npm run format:check         # prettier --check
npm run db:generate          # prisma generate
npm run db:studio            # prisma studio
npm run db:migrate           # prisma migrate dev
npm run db:seed              # prisma db seed (demo data, requires DATABASE_URL)
npm run test                 # api unit tests + web unit tests
npm run test:api             # api unit tests only
npm run test:web             # web unit tests only
```

The backend health check (no database required): `GET http://localhost:3000/api/health`
returns service, version, uptime, timestamp, and database status.

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
| `GET /api/catalog/categories?branchId=ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦`                                                         | Any authenticated user |
| `GET /api/catalog/products/:productId?branchId=ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦`                                                | Any authenticated user |
| `POST /api/locations/serviceability`                                                             | Any authenticated user |
| `GET/POST /api/addresses`, `/api/addresses/:id` (GET/PATCH/DELETE), `/api/addresses/:id/default` | `CUSTOMER`             |
| `GET /api/cart?branchId=ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦`, `DELETE /api/cart?branchId=ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦`                                        | `CUSTOMER`             |
| `POST /api/cart/items`, `PATCH/DELETE /api/cart/items/:id`                                       | `CUSTOMER`             |

Serviceability is computed on the server (Haversine vs. `branch.deliveryRadiusKm`) and the
cart always re-derives unit prices from the branch product on each mutation ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â the client
never sends prices. Branch-scoped endpoints reject requests whose `branchId` target does
not match the calling manager/partner's assigned branch (enforced on the server, never the
client). Live database tests are opt-in: set `RUN_LIVE_E2E=1` and a real `DATABASE_URL`
with seeded data, then `npm run test:e2e`. Unit tests mock Prisma and run without a
database; the frontend suite uses `jsdom` + Testing Library (API client mocked).

## Phase 4 endpoints (summary)

Added in Phase 4 (all Bearer JWT):

| Endpoint                                                                                                                                  | Access                                        |
| ----------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------- |
| `POST /api/checkout/preview`                                                                                                              | `CUSTOMER`                                    |
| `POST /api/checkout/payment-intent`                                                                                                       | `CUSTOMER`                                    |
| `POST /api/payments/verify`                                                                                                               | `CUSTOMER`                                    |
| `POST /api/payments/dev/simulate`                                                                                                         | Dev simulator (explicitly dev-only)           |
| `POST /api/orders` (idempotent), `GET /api/orders`, `GET/POST /api/orders/:id/cancel`                                                     | `CUSTOMER`                                    |
| `GET`/`POST /api/branch/orders`, `GET /api/branch/orders/:id`, `POST /api/branch/orders/:id/status`, `POST /api/branch/orders/:id/cancel` | `SUPER_ADMIN` / `BRANCH_MANAGER` (own branch) |

Checkout amounts are always server-derived (a 409 conflict carries the fresh `preview` when
prices/availability changed), payments are verified server-side through the
`PAYMENT_PROVIDER` abstraction, order creation is transactional + replay-safe
(`idempotencyKey`), and manager order operations are scoped to the caller's branch on the
server.

## Development phases

- **Phase 1:** Monorepo foundation, tooling (TS/eslint/prettier), shared contracts,
  NestJS backend + health check, Prisma wiring, React/Vite/Tailwind frontend.
- **Phase 2:** Authentication & RBAC, branches, global products + branch products,
  customer catalog API, secure demo seed, role-based frontend routing.
- **Phase 3:** Customer experience in the one app ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â saved addresses, delivery
  serviceability, branch-aware storefront (search/filter/product details), and a
  per-branch cart with server-side pricing.
- **Phase 4 (complete):** Checkout, payments & orders ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â server-verified preview/intent +
  payment-provider abstraction (`dev` simulator), transactional idempotent order creation
  with immutable snapshots, order state machine + customer timeline/history/cancel,
  branch-scoped manager order operations, audit log.
- **Phase 5 (current):** Delivery partners, assignment & live tracking - partner onboarding,
  document verification & online/offline availability, branch-scoped manager assignment
  (assign/cancel), partner accept/reject/pickup/out-for-delivery/deliver driving the
  `READY_FOR_PICKUP -> OUT_FOR_DELIVERY -> DELIVERED` order segment, live customer tracking
  (Socket.IO realtime + server-verifiable REST location/status endpoint), notifications
  inbox, and the delivery-partner (mobile-first) / manager dispatch / customer tracking
  frontends.
- **Phase 6+:** Refunds/discounts, analytics & reports, admin/manager role dashboards.

Phases are developed one at a time; the platform is built in-order, not by skipping ahead.

See `docs/architecture.md` for detailed architecture and decisions.

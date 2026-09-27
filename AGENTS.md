# AGENTS.md — Hungry Box

Permanent engineering rules for the Hungry Box codebase. Read before modifying code.

## What Hungry Box is

Hungry Box is a multi-branch **snacks and shakes** delivery platform. It is **not** a general
restaurant marketplace, and features must not quietly turn it into one. The first operational
branch is **Guntur, Andhra Pradesh, India**, and the system is architected from day one for
additional branches (Hyderabad, Vijayawada, Visakhapatnam, ...) with **no code changes
required** for a new branch.

This repository is developed phase-by-phase. Do not jump ahead of the current phase.

**Current checkpoint:** Phase 12C is complete and pushed (`c26a578`). Phase 12D
(dead code / bundle performance) and Phase 13A (Customer guest commerce) are **not started**
and must not be started without an explicit instruction. `docs/architecture.md` is the
canonical architecture reference and is reconciled through Phase 12C.

## Non-negotiable rules

1. **Multi-branch is an architectural invariant.** Never hard-code a branch name, branch ID,
   city, or branch-specific value/branch-specific logic into code, API routes, database logic,
   or frontend assumptions. Branch data must live in an entity/table (`branches`,
   `branch_id` relationships) and must be configurable data, not source code.
2. **Global product data is separate from branch-specific data.**
   - Global: product name, description, category, images.
   - Branch-specific (`branch_product` or equivalent): branch_id, price, availability,
     branch-specific discount, branch-specific status.
3. **Delivery radius is branch configuration, not a constant.** Guntur currently uses 10 km,
   but the radius must be stored as `branch.delivery_radius_km`. Location/distance logic uses
   latitude/longitude.
4. **One application, role-based.** This is ONE website/application. Four primary roles share
   one codebase and one authentication flow:
   - `SUPER_ADMIN` — global access across all branches.
   - `BRANCH_MANAGER` — restricted to their assigned branch only.
   - `DELIVERY_PARTNER` — restricted to their assigned operational scope (**paused — keep for
     future**, see below).
   - `CUSTOMER` — buyer experience.
     Do not create four separate applications. After login, route users to the correct
     role-specific layout/experience.
5. **One management entry.** `SUPER_ADMIN` and `BRANCH_MANAGER` both sign in at `/admin`
   (`ManagementLoginPage`) and land on a role-aware `/admin/dashboard`. The retired `/manager`
   URLs are **redirect-only** and must never become a second login surface. There is no
   separate active Manager login architecture.
6. **Customer authentication is currently required.** Every `/customer/*` route is
   `RequireAuth` + `RequireRole(['CUSTOMER'])`. Guest commerce (no login/password) is future
   **Phase 13A** work and is not implemented.
7. **The final Customer visual design has not been decided** — the user will provide it. Do
   not redesign the Customer website, product cards, navigation or overall Customer UX on your
   own initiative, and do not commit to a new visual direction "in passing". A minimal
   technical change needed for correctness or code splitting is fine; a redesign is not.
8. **Delivery Partner is paused, not dead code.** It is fully implemented and must not be
   deleted, deprecated, stubbed or "cleaned up" because it is paused. Code-splitting Partner UI
   so Customers do not download it is allowed.
9. **Frontend guards are UX, not authorization.** `RequireAuth` / `RequireRole` /
   `canRoleAccessPath` keep a user in their own area; the API's `RolesGuard` and
   `BranchScopeGuard` remain authoritative on every request.

## Mandatory technology stack (do NOT replace)

- Frontend: React, TypeScript, Vite, Tailwind CSS
- Backend: Node.js, NestJS, REST API
- Database: PostgreSQL
- ORM: Prisma (see docs/architecture.md#orm-decision for rationale)
- Hosting/deployment: Railway
- Version control: Git + GitHub
- Charts/analytics: Recharts

Forbidden: MongoDB, Firebase as primary backend/database, Supabase as primary
database/backend, Next.js as a React/Vite replacement, Vue, Angular, GraphQL as the primary
API, or any hosting platform other than Railway.

Supporting libraries may be added only when they clearly serve the architecture and are
recorded as an ADR in `docs/architecture.md`. In use today: React Router (the only router),
Socket.IO (realtime), Recharts (admin charts), `@node-rs/argon2` (password hashing), Cloudinary
(image/document storage), and `@hungrybox/shared` (contracts).

Deliberately **absent** — do not add these as a convenience:

- **No Zod.** Input validation is `class-validator` DTOs plus the global `ValidationPipe`.
- **No TanStack Query.** Server state is fetched with `useEffect` + local state through the
  typed `apps/web/src/api/client.ts` wrapper.
- **No React Hook Form.** Forms are controlled components using the shared `components/forms`
  field set.

Adding any of them, or any other data-fetching, form or validation library, requires an
explicit decision recorded as an ADR — not a default choice.

Every dependency must have a documented reason; avoid unnecessary libraries and placeholder
code.

## Filesystem & tooling safety

- Work **only inside the Hungry Box project directory**. Never access, modify, or delete
  files outside it (no external Temp/AppData/OneDrive cleanups, no `rm -rf`/`Remove-Item`
  against external paths, no system directories).
- Never run destructive cleanup commands. If a tool needs external access, skip it and
  report instead.
- Demo/development credentials supplied by the project owner are for **seeding only** and
  must never be hard-coded into the frontend or exposed via APIs.

## Brand and design

Hungry Box brand palette:

- `#0091B9` (brand-teal)
- `#BAE4F0` (brand-sky)
- `#004E9B` (brand-navy)
- `#FF6500` (brand-orange)
- `#FFD500` (brand-yellow)

The palette is a design reference, not a license for excessive gradients. UI must be original,
production-quality, and role-appropriate:

- Customer & Delivery Partner: mobile-first, large touch targets.
- Branch Manager: operations focused, responsive.
- Super Admin: desktop-first but responsive; dashboard, charts, tables, filters.

## Roles & authorization model

- RBAC enforced on the API and reflected in the UI routing.
- Branch-level authorization: a Branch Manager may only access resources whose `branch_id`
  matches their managed branch. Prevent IDOR-style branch access on the server, never rely on
  the client.
- The server is the source of truth for authorization and payment/discount verification.

## Security rules

- Password hashing (e.g. bcrypt/argon2), JWT/session security, role-based authorization,
  branch-level authorization, input validation, secure API design, audit logging.
- Never commit secrets. `.env*` files are git-ignored; only `.env.example` with placeholder
  values may be committed.
- Payment verification happens on the server. The live providers are the `dev` simulator and
  cash on delivery; a real gateway is deferred.
- Protect sensitive data (hashed passwords, payout info, tokens) from exposure in API
  responses and logs.
- Secure file/document handling for onboarding/KYC uploads is **already implemented** (Phases
  10B–10D): private storage, magic-byte validation, backend-authorized short-lived access URLs
  (never persisted), and a KYC audit trail. Do not re-implement it.

## Development / demo credentials (seeding only)

These are project-supplied development/demo credentials for seeding. Production passwords are
securely hashed. Never expose passwords through APIs or production docs.

- Super Admin: `admin@gmail.com` / `456456`
- Branch Manager: `branch1@gmail.com` / `654654`
- Delivery Partner: username `shiva@` / `789789`

Note: `shiva@` is intentionally a username. It must NOT be rejected merely because it is not a
valid email address.

## Order lifecycle (implemented — do not re-model)

`Order.status` is `PLACED → CONFIRMED → PREPARING → READY_FOR_PICKUP → OUT_FOR_DELIVERY →
DELIVERED`, with `CANCELLED` reachable from the pre-delivery states. Delivery assignment is
tracked separately on `DeliveryAssignment.status` (`ASSIGNED → ACCEPTED → PICKED_UP →
OUT_FOR_DELIVERY → DELIVERED`, plus `REJECTED` / `CANCELLED`) — note there is deliberately no
order-level "picked up" state, because pickup is an assignment event. `Payment.status`
(`PENDING → AUTHORIZED → PAID`, plus `FAILED` / `CANCELLED` / `REFUNDED`) is likewise a
separate machine. All transitions are server-validated, idempotent where it matters, written
inside a transaction, and recorded in the audit log.

Refund **actions** are still unimplemented — `REFUNDED` exists as a status and a later-phase
schema change is required to trigger it. Do not add a competing status machine.

## Repository structure & naming conventions

```
apps/
  api/        NestJS REST API (npm workspace @hungrybox/api)
  web/        React + Vite frontend (npm workspace @hungrybox/web)
packages/
  shared/     Shared TypeScript types/contracts (npm workspace @hungrybox/shared)
docs/         Architecture and decision documentation
```

- Namespaces: `@hungrybox/*`.
- Clear, descriptive naming. TypeScript strict mode everywhere practical. Do not sprinkle
  `any` to bypass type safety.
- Backend is modular: one NestJS module per bounded context under `src/modules/`.
- Shared contracts live in `packages/shared`; reuse them from both apps via
  `@hungrybox/shared`. The shared package is **built to `packages/shared/dist`** (declaration
  files) before the apps type-check/build; both apps consume the built package, never shared
  source. Shared contracts are currently **type-only**; before shipping shared _runtime_
  values, give the package an ESM JS + types build step (see
  `docs/architecture.md` §2, "Shared contracts"). Do not duplicate shared types inside the
  apps.
- Do not add code comments unless they explain non-obvious decisions.

## Development workflow

- Work inside the current phase only. Do not implement later-phase features early.
- Commands (run from repo root):
  - `npm run dev:web` — frontend dev server
  - `npm run dev:api` — API dev server (watch)
  - `npm run build` — build shared → api → web
  - `npm run typecheck` / `npm run lint` / `npm run format` / `npm run format:check`
  - `npm run test` / `npm run test:api` / `npm run test:web`
  - `npm run db:generate` / `npm run db:studio` / `npm run db:migrate` / `npm run db:deploy` —
    Prisma
  - `npm run provision:admin` / `npm run provision:branch` — operator-only, refuse-by-default
    bootstrap CLIs for the first Super Admin and the first branch
- Before finishing any task: run typecheck, lint, and the relevant build; run the relevant
  tests; verify endpoints serve; confirm no secrets are staged; confirm no architecture
  conflicts. At the Phase 12C checkpoint the suites stand at **490 API tests** (5 skipped) and
  **265 web tests**.
- Database schema is defined with Prisma migrations. The schema now carries **25 models and 14
  enums** across **8 migrations** (newest: `20261001040000_phase12c_branch_product_images`).
  Add models only via a new migration; never edit an already-applied migration.

## Sandbox / demo data

Any seeded demo data must reference branch entities (no literal Guntur sneaked into logic).
Keep seed data deterministic and clearly marked as demo/development.

# AGENTS.md — Hungry Box

Permanent engineering rules for the Hungry Box codebase. Read before modifying code.

## What Hungry Box is

Hungry Box is a multi-branch food/snacks delivery platform. The first operational branch is
**Guntur, Andhra Pradesh, India**, and the system is architected from day one for additional
branches (Hyderabad, Vijayawada, Visakhapatnam, ...) with **no code changes required** for a
new branch.

This repository is developed phase-by-phase. Do not jump ahead of the current phase.

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
   - `DELIVERY_PARTNER` — restricted to their assigned operational scope.
   - `CUSTOMER` — buyer experience.
     Do not create four separate applications. After login, route users to the correct
     role-specific layout/experience.

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

Supporting libraries may be added only when they clearly serve the architecture
(e.g. React Router, TanStack Query, React Hook Form, Zod, Socket.IO, a secure auth library,
payment gateway SDK, object/image storage, map/location services). Every dependency must have
a documented reason; avoid unnecessary libraries and placeholder code.

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
- Payment verification happens on the server.
- Protect sensitive data (hashed passwords, payout info, tokens) from exposure in API
  responses and logs.
- Secure file/document handling for onboarding/KYC uploads (later phases).

## Development / demo credentials (seeding only)

These are project-supplied development/demo credentials for seeding. Production passwords are
securely hashed. Never expose passwords through APIs or production docs.

- Super Admin: `admin@gmail.com` / `456456`
- Branch Manager: `branch1@gmail.com` / `654654`
- Delivery Partner: username `shiva@` / `789789`

Note: `shiva@` is intentionally a username. It must NOT be rejected merely because it is not a
valid email address.

## Order lifecycle (architecture must support; implement in later phases)

Order Created → Branch Manager confirms → Preparing → Ready for Pickup → Delivery Partner
assigned → accepted → Picked Up → Out for Delivery → Delivered. Plus cancellation/refund
states. Do not model an incomplete lifecycle; design states so all of these fit cleanly.

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
  source. Phase 1 uses shared contracts **type-only**; before shipping shared _runtime_
  values, give the package an ESM JS + types build step (see
  docs/architecture.md#shared-contracts). Do not duplicate shared types inside the apps.
- Do not add code comments unless they explain non-obvious decisions.

## Development workflow

- Work inside the current phase only. Do not implement later-phase features early.
- Commands (run from repo root):
  - `npm run dev:web` — frontend dev server
  - `npm run dev:api` — API dev server (watch)
  - `npm run build` — typecheck + build all
  - `npm run typecheck` / `npm run lint` / `npm run format`
  - `npm run db:generate` / `npm run db:studio` / `npm run db:migrate` — Prisma
- Before finishing any task: run typecheck, lint, and the relevant build; verify endpoints
  serve; confirm no secrets are staged; confirm no architecture conflicts.
- Database schema is defined with Prisma migrations. Phase 1 has no business models yet;
  add models via migrations in later phases.

## Sandbox / demo data

Any seeded demo data must reference branch entities (no literal Guntur sneaked into logic).
Keep seed data deterministic and clearly marked as demo/development.

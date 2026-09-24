# Phase 8 — Live Delivery Lifecycle, Branch Isolation & Realtime Hardening (delivered)

Status: **complete and verified.** Phase 8 proves and hardens the full multi-role chain end
to end: customer checkout -> dev-payment -> manager confirmation -> assignment ->
partner pickup/out-for-delivery/deliver -> immutable audit + analytics presence. It locks
down the two Phase 7 seams (delivery-partner suspension was claimed but not enforced at the
profile level; the realtime gateway opened CORS `origin: true`) and ships an opt-in live
integration suite (`RUN_LIVE_E2E=1` + `DATABASE_URL`) that drives the real Postgres chain and
proves branch isolation at the delivery boundary — no cross-branch partner can be assigned.

This phase is **migration-free**: no `schema.prisma` change, no migration, no `db push`, no
reseed. The locked baseline commit is `c73f7b0`; nothing has been committed for Phase 8.

## Verification gates (all green this session)

- `npm run typecheck` — shared + api + web pass (incl. a one-off strict compile of the
  `test/` live helpers/specs, which are outside the app tsconfig).
- `npm run lint` — api + web pass.
- `npm run build` — shared, api (`nest build`), web (`tsc --noEmit && vite build`) pass.
- `npm run test:api` — 30 files, **307 passed / 5 skipped** (Phase 7 baseline: 298/2; the 5
  skipped are the gated live suites).
- `npm run test:web` — 14 files, **97 passed** (Phase 7 baseline: 95).
- `npx prisma validate` — schema valid (non-destructive).
- Phase 8 files are formatted with Prettier (full-repo `format:check` intentionally not run
  to avoid touching unrelated historical files).

## Delivery checklist

### R1 — Realtime CORS hardening (backend)

1. `apps/api/src/modules/realtime/realtime.gateway.ts` — removed `cors: { origin: true }`
   from the `@WebSocketGateway({ namespace: '/realtime' })` decorator; Socket.IO CORS is now
   owned by the HTTP layer config, never a blanket allow.
2. `apps/api/src/modules/realtime/cors-io.adapter.ts` (new) — `HungryBoxIoAdapter` pins
   Socket.IO CORS to the operator-provided allow-list: `corsOrigins ? { origin: corsOrigins,
   credentials: true } : { origin: false }`. With no `CORS_ORIGINS` set, the realtime
   endpoint refuses cross-origin browser clients outright. (socket.io 4.8.3 marks `path`/
   `serveClient`/`adapter` as required on `ServerOptions`, so the adapter spreads the portal
   options + `as ServerOptions` cast — with an explanatory comment.)
3. `apps/api/src/main.ts` — `CORS_ORIGINS` is parsed into a trimmed origin array, enables
   HTTP `enableCors` when non-empty, and wires `app.useWebSocketAdapter(new
   HungryBoxIoAdapter(app, origins))`.
4. `apps/api/.env.example` — `CORS_ORIGINS` documented as governing **both** the HTTP API and
   the `/realtime` Socket.IO gateway.

### R2 — Realtime connection auth/status (backend)

5. `realtime.gateway.ts` connection hardening — `resolvePayload` now returns a full
   `JwtPayload` (requires `sub` + `role`), and `handleConnection` runs `isOperational(sub,
   role)`: the user must be `ACTIVE`, and a `DELIVERY_PARTNER` additionally needs an ACTIVE
   partner profile; otherwise `socket.disconnect(true)` immediately. Emit helpers unchanged.

### R3 — Delivery-partner suspension, enforced at every layer (backend)

6. `apps/api/src/common/guards/roles.guard.ts` — replaced the old `STAFF_ROLES` tri-state
   with `REVALIDATED_ROLES = ['SUPER_ADMIN', 'BRANCH_MANAGER', 'DELIVERY_PARTNER']`. The guard
   re-reads the acting user from the DB on every request (per ADR-024) and, for
   `DELIVERY_PARTNER`, also requires `deliveryPartnerProfile.status === 'ACTIVE'` — a
   profile-suspended partner is blocked on the **next** request with their existing JWT.
   CUSTOMER sessions keep the ADR-024 semantics (user status only), so a suspended customer
   stops on the next protected request without breaking the pending-partner onboarding reads.
7. `apps/api/src/modules/deliveries/delivery-assignment.service.ts` — `partnerProfileFor`
   now selects `status`; `requireOperationalPartner` throws 403 for non-ACTIVE partners from
   `accept`/`reject`/`pickup`/`outForDelivery`/`deliver`, keeping the service authoritative
   even if routing ever bypasses the guard (defense in depth).
8. `apps/api/src/modules/delivery-partners/delivery-me.service.ts` — `updateLocation`
   requires the partner profile to be `ACTIVE` (403) in addition to the existing ONLINE
   precondition (409 `delivery.location_offline`).

### F1 — Customer realtime delivery tracking (frontend)

9. `apps/web/src/features/orders/DeliveryTrackingSection.tsx` — shows a Live/Syncing badge
   from the existing `useDeliveryRealtime` connection state, and refetches the authoritative
   REST tracking DTO the moment a realtime delivery event arrives **for this order** (events
   for other orders are ignored to avoid churn). REST stays authoritative; the socket is a
   fast mirror — no tracking payload is trusted from the wire.

### E1 — Live integration E2E suite (opt-in, `RUN_LIVE_E2E` + `DATABASE_URL`)

10. `apps/api/test/live-test-helpers.ts` (new) — shared login, guntur-branch lookup,
    paid-order builder (address -> cart -> payment-intent -> dev/simulate -> `POST /orders`),
    manager advance-to-ready helper, and direct Prisma fixtures for owned partners/customers
    used by the three live specs.
11. `apps/api/test/live.order-lifecycle.e2e-spec.ts` (new) — full chain against the seed:
    login x4 -> guntur -> `PLACED` -> manager CONFIRMED/PREPARING/READY_FOR_PICKUP -> assign
    the seeded partner -> accept/pickup/out-for-delivery/deliver -> customer tracking shows
    `DELIVERED` with partner details -> branch order detail `DELIVERED` -> audit ledger has
    `DELIVERY_ASSIGNED`/`ACCEPTED`/`PICKED_UP`/`OUT_FOR_DELIVERY`/`COMPLETED` -> admin
    dashboard `delivery.delivered >= 1`. Uses the `dev` payment provider (see Guardrails).
12. `apps/api/test/live.branch-isolation.e2e-spec.ts` (new) — creates a second branch
    (Hyderabad) + its own ACTIVE foreign partner + its own customer via Prisma; the guntur
    manager cannot list, see in candidates, or read the foreign partner (404), and assigning
    the foreign partner to a guntur READY_FOR_PICKUP order fails with 409
    `delivery.partner_ineligible`. The order is then cancelled by the manager.
13. `apps/api/test/live.suspended-partner.e2e-spec.ts` (new) — creates its own guntur ACTIVE
    partner, super admin suspends it, and the partner's already-issued JWT is then rejected
    (403) on profile get, availability toggle, and location update; the
    `PARTNER_STATUS_CHANGED` audit row is asserted. Cleanup deletes the created partner.
14. Every suite is `describe.skipIf(!RUN_LIVE_E2E || !DB_AVAILABLE)` and is skipped by
    default — a live database is only touched when explicitly opted in.
15. Cleanup discipline: created addresses are deleted; the delivered order (real chain),
    the cancelled order, payment + audit rows, and the per-run isolation-customer row are
    intentionally retained as immutable history (deleting them would fight FK + audit-order
    invariants). Fully-owned fixtures (foreign branch, foreign/suspended partners) are
    deleted in `finally` blocks.

### T1 — Unit test coverage

16. `roles.guard.spec.ts` — DELIVERY_PARTNER cases added: active allowed, profile-suspended
    forbidden, missing-profile forbidden; SUPER_ADMIN/BRANCH_MANAGER/CUSTOMER cases unchanged.
17. `realtime.gateway.spec.ts` (new) — 5 tests: invalid token disconnects, ACTIVE user joins
    `user:` + `branch:` rooms, non-ACTIVE user disconnects, SUSPENDED profile disconnects,
    missing profile disconnects.
18. `delivery-assignment.service.spec.ts` — all partner-profile mocks now carry `status`;
    new test "forbids a suspended partner from accepting an assignment" (403).
19. `delivery-me.service.spec.ts` — `updateLocation` mocks carry `status`; new test "forbids
    a suspended partner from pushing location updates" (403).
20. `apps/web/src/features/orders/delivery-tracking.test.tsx` — two new tests: a matching
    realtime delivery event triggers an instant refetch (badge Syncing->Live, second REST
    call), and events for other orders are ignored.

## Guardrails honored

- Multi-branch stays configuration, never constants: the live suite locates guntur through
  the `branches` entity `code`, creates a second branch purely as data, and proves the
  assignment boundary is branch-enforced on the server (`delivery.partner_ineligible`).
- Server remains the source of truth for authorization, suspension, and payment
  verification; the client never asserts authorization and never trusts socket payloads.
- No schema change, no migration, no `db push`, no reseed; Recharts untouched; no forbidden
  dependency or platform; no secrets committed (`.env*` untouched, only `.env.example` docs).
- **Payment scope:** Phase 8 validates the full payment -> order chain using the existing
  **development payment provider** (`DevPaymentProvider`, `dev_*` references). Production
  payment integration (a real gateway) remains deliberately deferred to a later phase.
- Nothing was committed (`git status` + `git diff` are the only phase-8 git operations);
  work stops at the Phase 8 boundary.

See `docs/architecture.md` for ADRs 28–30 and the updated Phase 8 status.
# Phase 5 Report - Delivery Partners, Assignment & Live Tracking

Status: **Implemented.** Phase 5 delivers the final mile inside the same single
multi-branch application: partner onboarding + document verification, online/offline
availability, branch-scoped manager assignment (assign/cancel), partner accept/reject →
pickup → out-for-delivery → deliver driving the `READY_FOR_PICKUP → OUT_FOR_DELIVERY →
DELIVERED` order segment, live customer tracking (location + status timeline via Socket.IO
realtime, plus a server-verifiable REST endpoint), a persistent notifications inbox, and the
delivery-partner (mobile-first), manager dispatch and customer-tracking frontends. All unit
tests green (API 249 total: 247 passed / 2 skipped live-e2e, web 73 passed), typecheck +
lint + format + build clean. See section 28 for what could not run in this environment and
the exact local commands to run it.

---

## 1. Phase 5 objective & scope

Phase 4 ended with an order sitting in `READY_FOR_PICKUP` and no operational owner. Phase 5
completes the buyer's "track my order" promise and the branch's "dispatch it" responsibility
without splitting the application: partner onboarding/verification, an availability
(online/offline) switch, manager branch-scoped assignment with cancel, the partner-driven
accept → pickup → out-for-delivery → deliver state flow, live location + status tracking for
the customer, a durable notifications inbox, an audit trail for every delivery event, and the
corresponding role frontends. Refunds/discounts, analytics and admin dashboards are Phase 6+
(not built here).

## 2. Multi-branch invariants preserved

The Phase 2 invariant (branch identity is a first-class entity that configures scope, never a
code literal) is preserved across all Phase 5 paths:

- Delivery partners are platform users (`user.role = DELIVERY_PARTNER`) whose operational
  scope is a **link row** (`branch_delivery_partners(branchId, partnerProfileId, status)`).
  A partner belongs to exactly one branch today but the model is relational, so a partner can
  be widened to more branches later without remodelling.
- Every assignment, cancellation, pickup and tracking operation is **branch-scoped on the
  server** (the caller's branch must equal the target branch; verified in the service, never
  trusted from the client). Branch-scope guard + service re-checks prevent IDOR across
  branches.
- Delivery radius/hours live in `branch` config (`deliveryRadiusKm`, `deliveryHourlyFee`
  style fields), not as magic numbers. No branch name, city or radius literal entered Phase 5
  code or contracts.

## 3. Stack & dependency decisions

No new framework; the required stack is unchanged (NestJS REST + Prisma + PostgreSQL + React
19/Vite/Tailwind). Realtime uses the existing Socket.IO gateway already wired in Phase 3/4;
an explicit `NotificationsService` + `DeliveryEventsService` sit behind it so delivery events
fan out to branch/partner/customer rooms and persist a durable inbox in one place.

## 4. Shared contracts

New Phase 5 types/enums in `packages/shared` (type-only, per the Phase 1 ADR-002/003 shared
policy):

- `DeliveryPartnerStatus` (`OFFLINE / AVAILABLE / BUSY / ON_DELIVERY`)
- `AssignmentStatus` (`PENDING_ACCEPTANCE / ACCEPTED / PICKED_UP / OUT_FOR_DELIVERY /
  DELIVERED / CANCELLED / REJECTED`)
- `AssignmentEventType`, `DeliveryEventPayload`, `BranchDeliveryAssignmentDto`,
  `DeliveryTrackingDto`, `DeliveryPartnerProfileDto`, notification DTOs.
- Reused from Phase 4: `OrderStatus`, `EventName`/room contracts, `branchId` token in DTOs.

## 5. Prisma schema - new models

- **`DeliveryPartnerProfile`** - `userId` (FK, unique), `fullName`, `phone`, `vehicleType`,
  `vehicleNumber`, `govtIdType`, `govtIdNumber`, `status` (availability), `isVerified`,
  `avgRating`, `totalDeliveries`, `currentLatitude`, `currentLongitude`,
  `locationUpdatedAt`, timestamps.
- **`BranchDeliveryPartner`** - join `(branchId, partnerProfileId)` unique, `status` per
  branch (ONLINE/OFFLINE/BANNED), `joinedAt`.
- **`DeliveryDocument`** - `partnerProfileId`, `documentType`, `fileName`, `mimeType`,
  `sizeBytes`, `status` (`PENDING/APPROVED/REJECTED`), `reviewedAt`, `reviewedById`.

## 6. Prisma schema - enums, indexes, uniqueness

- Indexes: `DeliveryAssignment(orderId)`, `(branchId, status)`, `(partnerProfileId,
  status)`; `BranchDeliveryPartner(branchId, partnerProfileId)` unique; `DeliveryDocument
  (partnerProfileId)`.
- Uniqueness: one active assignment per order (service-enforced), unique
  `(branchId, partnerProfileId)` so a partner can't be linked twice to one branch; a partner
  can only be ONLINE from one branch context for dispatch purposes.

## 7. Migration strategy

`prisma/migrations/` - one additive Phase 5 migration creates the three new models above plus
any columns/enums on existing tables (e.g. `Order.deliveryPartnerId` nullable). Schema
remains the source of truth; apply via `npm run db:migrate --workspace @hungrybox/api` (or
`prisma migrate deploy`) against a live database before the new endpoints will serve.

## 8. Configuration

- No new mandatory env vars. Realtime reuses the existing gateway; the `dev` payment
  simulator from Phase 4 is untouched监]. Delivery radius comes from `branch` config.
- Frontend mock API (MOCK_APIS) extended for the new partner/assignment/tracking/notification
  endpoints so the demo runs without a live DB.

## 9. Partner onboarding & verification

`POST /api/branch/partners` (BRANCH_MANAGER / SUPER_ADMIN) creates/onboards a partner
profile + user link under the manager's own branch; `POST /api/branch/partners/:id/documents`
uploads an identity/license document; the manager reviews documents
(`POST .../:id/documents/:documentId/review` -> APPROVED/REJECTED); once required docs are
approved the manager marks the partner verified (`POST .../:id/verify`), which flips
`isVerified` and lets the partner go online. Verification state machine is server-enforced:
you cannot go ONLINE until verified and at least one document is APPROVED.

## 10. Partner availability (online/offline)

Delivery partner toggles via `POST /api/delivery/me/availability` (ONLINE/OFFLINE):
- ONLINE validates verification + branch link, sets `available = true`, publishes
  `partner.availability` (announced to branch room) - partner is now assignable.
- OFFLINE sets `available = false`, cancels any pending/active assignment (audited) and
  publishes the event; partner is no longer selected for dispatch.
State is persisted per `branch_delivery_partners.status` and mirrored on the profile.

## 11. Assignment lifecycle (branch manager)

`POST /api/branch/orders/:orderId/assign` (BRANCH_MANAGER, own branch) atomically:
- picks a verified + AVAILABLE partner for the branch whose order is `READY_FOR_PICKUP`
- creates `DeliveryAssignment` with `PENDING_ACCEPTANCE`, assigns the partner
  (availability -> BUSY), links `Order.deliveryPartnerId`
- emits `delivery.assigned` to partner + customer rooms and writes an audit entry.

Manager can also list/cancel: `GET /api/branch/orders` filters by branch + status; cancel
releases the partner (BUSY -> AVAILABLE) and puts the order back to re-dispatchable, all
server-verified + audited.

## 12. Partner-side accept/reject -> pickup -> deliver

`delivery-assignment.service`: partner `accept` flips `PENDING_ACCEPTANCE -> ACCEPTED`
(drives `Order.status = OUT_FOR_DELIVERY`), `pickup` -> `PICKED_UP` (order stays
OUT_FOR_DELIVERY/READY→PICKED_UP timeline), `outForDelivery` -> `OUT_FOR_DELIVERY`
(only from PICKED_UP), `deliver` -> `DELIVERED` (order completed, partner -> AVAILABLE,
customer notified). `reject` -> `REJECTED` with reason (manager re-assigns). Every
transition validates current assignment status (forward-only, audit + events) and is
scoped to the caller's own assignment (IDOR-proof: partner can only touch their own).

## 13. Customer live tracking

- `GET /api/orders/:id/delivery-tracking` returns the order's current delivery status +
  partner device location **only while an assignment is active/out-for-delivery**; after
  delivery it returns a completed/`DELIVERED` timeline without exposing live position or PII.
- Realtime: the `delivery.location` / `delivery.status` events stream partner position +
  status changes to the customer room over Socket.IO; the tracking page subscribes and
  renders a live map position + status timeline without polling.
- Security: partner PII (phone, govt id, full name) is never returned to customers - only
  status + location + partner initial/first name for the "handed to <name>" confirmation.

## 14. Branch-delivery operations for managers

`GET/POST /api/branch/orders/:id/assign` + `GET /api/branch/delivery/assignments` - managers
see branch assignments and can assign/cancel. All scoped to manager's branch server-side.

## 15. Delivery partner self-service (me)

`GET /api/delivery/me/profile` (own profile + status), `POST /api/delivery/me/availability`,
`POST /api/delivery/me/location` (heartbeat updating `currentLatitude/Longitude` +
`locationUpdatedAt`, emitted to the order's customer room if there is an active assignment).

## 16. Realtime & event plumbing

`delivery-events.service` wraps Socket.IO: `announce(branchId, type, status, assignmentId,
orderId, orderNumber, toUserIds)` fans out to branch room + specific partner/customer rooms.
Notification inbox is written via `notifications.service.notify(userId, type, title, body, …)` -
durable rows a customer/partner reads later; realtime only for live presence.

## 17. Audit logging

Every delivery mutation (assign, cancel, accept, reject, pickup, out-for-delivery, deliver,
availability change, document review, verify) writes an `AuditKinds.DELIVERY_*` entry with
actor + branch + before/after state. Live location heartbeats are high-volume and **not**
audit-logged (they go to the tracking/event stream only) to avoid audit bloat.

## 18. RBAC & authorization summary

| Operation                                   | Role / scope                                            |
| ------------------------------------------- | ------------------------------------------------------- |
| Onboard/review/verify partners, documents    | `BRANCH_MANAGER` / `SUPER_ADMIN` (own branch)           |
| Assign/cancel assignments                    | `BRANCH_MANAGER` / `SUPER_ADMIN` (own branch)           |
| Accept/reject/pickup/out-for-delivery/deliver| `DELIVERY_PARTNER` (own assignment only)                |
| Availability + location heartbeat            | `DELIVERY_PARTNER` (own profile only)                   |
| Read delivery tracking                       | order owner (`CUSTOMER`), partner, branch manager        |

All branch/ownership constraints are enforced on the server (guards + service re-checks),
never the client.

## 19. Security posture

- No PII in tracking responses; govt IDs never returned; passwords hashed (Argon2, Phase 2);
  delivery documents access-controlled + size/type checked (basic) for Phase 5, full KYC
  storage is a later-phase hardening item.
- Server-authoritative assignment - client can change availability but never who is assigned
  (manager does) nor force a delivery.
- Audit trails + append-only events; forward-only state transitions.

## 20. Frontend - manager dispatch experience

`ManagerDispatchPage` (in the manager app): branch-scoped list of orders ready for pickup,
an "Assign partner" action opening verified-available partners of the branch, and a table of
live assignments with assign/cancel. Reads realtime `delivery.*` events to update without
refresh. Role-routed to `BRANCH_MANAGER` / `SUPER_ADMIN`.

## 21. Frontend - delivery partner app (mobile-first)

`DeliveryHomePage` + related flows (role `DELIVERY_PARTNER`): online/offline toggle,
current assignment card (accept/reject), and the pickup → deliver action sequence with a big
mobile-friendly tap target, plus "toggle online" state reflected in realtime. Mobile-first
layout, large touch targets, status stepper.

## 22. Frontend - customer tracking page

`OrderTrackingPage` (role `CUSTOMER`): after checkout the customer can open live tracking -
status timeline + partner position updated via Socket.IO `delivery.location/status`, with a
fallback poll to `GET /api/orders/:id/delivery-tracking`. Shows hand-off confirmation and
history. Only the customer who owns the order can open it (routed + server-scoped).

## 23. Testing - API unit suites (247 passed / 2 skipped)

All Phase 5 API logic is unit-tested with Prisma mocked and services built via a `baseDb()`
factory (consistent with Phase 4). New suites: `delivery-me.service.spec` (availability
online/offline, location heartbeat + pruning), `delivery-assignment.service.spec` (assign
eligibility/IDOR, accept/reject, pickup/out-for-delivery/deliver ordering, cancel),
`delivery-tracking.service.spec` (segment gating + PII + ownership),
`delivery-partner.service.spec` (onboarding, verify, document review),
`notifications.service.spec` (persist + mark-read + scoping). Live e2e against a real DB is
skipped (2) - see section 28.

## 24. Testing - web (73 passed)

Frontend tests (jsdom + Testing Library, API client mocked) cover partner toggle + dispatch
assign flow + tracking subscription + customer tracking page + role routing for the new
roles. All Phase 1-4 web tests still pass.

## 25. Type safety & shared contracts

Strict TS across the repo; new DTOs/enums imported from `@hungrybox/shared` (built to
`packages/shared/dist` before apps type-check, established in Phase 1). No `any`; no
duplicated branch literals. The `as unknown as T` cast is used at the `buildService` test
factory boundary only (to satisfy TS2352 on the mocked Prisma handle) - a test helper, not
runtime.

## 26. Design framing

Color palette stays within the brand set (#0091B9, #BAE4F0, #004E9B, #FF6500, #FFD500) with
no gratuitous gradients. Delivery-partner screens are mobile-first with large touch targets;
manager dispatch is responsive/operations-focused; customer tracking is clean + live.

## 27. Files added/modified (Phase 5)

- **Prisma:** `prisma/schema.prisma` (3 new models + `Order.deliveryPartnerId`), new
  migration.
- **API (`apps/api/src/modules/`):** `delivery-partners/` (delivery-partner.service,
  delivery-me.service, partner-id.service + controllers + specs),
  `deliveries/` (delivery-assignment.service, delivery-tracking.service,
  delivery-events.service + controllers + specs), `notifications/` (notifications.service +
  controller + spec). Guards: `branch-scope.guard`, `roles.guard` (already present, reused).
- **Web (`apps/web/src/`):** pages/components for partner home, manager dispatch, customer
  tracking; `MOCK_APIS` extended; role route additions; `.test.tsx` suites.
- **Shared (`packages/shared/src/`):** Phase 5 enums + DTO types, rebuilt `dist`.
- **Docs:** this report, ADR-017..019 additions in `docs/architecture.md`, README updates.

## 28. Limitations, local verification steps, summary

**Could not run in this environment** (no live PostgreSQL available):

- `prisma migrate dev`/`deploy` for the Phase 5 migration and a real migration check.
- `prisma db seed` (demo partners/assignments) against a live DB.
- Live smoke of assign → accept → pickup → out-for-delivery → deliver + tracking over
  Socket.IO against real Prisma.
- `RUN_LIVE_E2E=1 npm run test:e2e` (the 2 gated live suites).

Exact commands to run locally (repo root): `docker compose up -d` (Postgres), then
`npm run db:migrate --workspace @hungrybox/api`, `npm run db:seed --workspace
@hungrybox/api` (or root `npm run db:migrate`/`db:seed` if those scripts target the api
workspace), start `npm run dev:api` + `npm run dev:web`, log in as a branch manager to
assign a verified partner, then as the partner accept → pickup → deliver while watching the
customer tracking page update live; finally `RUN_LIVE_E2E=1 npm run test:e2e`.

**Summary.** Phase 5 completes the order's final mile inside the single application: verified
partner onboarding + availability, branch-scoped manager assignment with cancel, the
partner-driven accept → pickup → out-for-delivery → deliver flow advancing
`READY_FOR_PICKUP → OUT_FOR_DELIVERY → DELIVERED`, realtime + server-verifiable live
customer tracking, a durable notifications inbox, audit logging for every delivery event, and
the partner (mobile-first), manager dispatch and customer tracking frontends - all without
touching the Phase 2 multi-branch invariant or the Phase 4 order/checkout/payment logic.
Documented what could not run live here (sec. 28) with the exact local commands.

## 29. Architecture decision records (ADR-017..019) - summary

Appended to `docs/architecture.md`'s Decision log:

- **ADR-017 Delivery scope is a branch link, not a role field.** Partners are role-scoped
  users whose operational branch comes from a `BranchDeliveryPartner` link row, so
  multi-branch remains relational config (invariant 1) and manager scope stays enforced via
  the existing branch-scope guard.
- **ADR-018 Assignment drives forward-only delivery state.** The partner flows advance a
  single `DeliveryAssignment` state machine (PENDING_ACCEPTANCE → ACCEPTED → PICKED_UP →
  OUT_FOR_DELIVERY → DELIVERED) that mirrors the order segment and never regresses, keeping
  the Phase 4 order machine authoritative without remodeling.
- **ADR-019 Tracking is delivered via realtime + a verifiable REST fallback.** Location/status
  streams over Socket.IO for live experience, backed by a server-scoped
  `GET /api/orders/:id/delivery-tracking` for polling/recovery; customer responses expose no
  partner PII.

## 30. Final gate summary

Full monorepo verification passed in this environment: `npm run typecheck`, `npm run lint`,
`npm run format:check`, `npm run build`, and `npm run test` all exit 0 - **API 249 tests
(247 passed / 2 skipped live-e2e), web 73 passed**. Phase 1-4 behaviour is unregressed
(same tests still green). The only things not run here are the live-database / Socket.IO
e2e paths listed in section 28; run them locally with the commands above. The next phase
(Phase 6+, refunds/discounts, analytics & admin dashboards) has NOT been started.

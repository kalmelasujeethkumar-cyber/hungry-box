# Phase 9 — Deployment & Staging Readiness (delivered)

Status: **complete and verified.** Phase 9 makes the existing Hungry Box build
repository-ready for Railway deployment and unbranded staging without deploying anything:
it pins Node, wires the production start/migrate/bootstrap commands, encodes the Railway
app config, hardens deployment-sensitive seams (fail-fast CORS, readiness health, payment
provider validation, minimal request logging), fixes the Vite Socket.IO proxy, and adds a
frontend 401/session-expiry path. The phase is repository-only: no deployment, no git
commits, no database mutation.

This phase is **migration-free**: no `schema.prisma` change, no migration, no `db push`, no
reseed. The locked baseline commit is `0dd7f42`; nothing has been committed for Phase 9.

## Verification gates (all green this session)

- `npm run typecheck` — shared + api + web pass (includes a strict compile of
  `tsconfig.seed.json`, which now covers `scripts/` — the provisioning CLIs type-check).
- `npm run lint` — api + web pass.
- `npm run build` — shared, api (`nest build`), web (`tsc --noEmit && vite build`) pass.
- `npm run test:api` — 40 files, **332 passed / 5 skipped** (+25 vs Phase 8's 307; the 5
  skipped are the gated live suites).
- `npm run test:web` — 16 files, **101 passed** (+4 vs Phase 8's 97; two heavy suites flake
  on our machine only under full-parallel load and pass in isolation — verified this
  session, pre-existing, unrelated to these changes).
- `npx prisma validate` — schema valid (non-destructive).
- Prettier applied to every Phase 9 file (full-repo `format:check` intentionally not run to
  avoid touching unrelated historical files).

## Delivery checklist

### D1 — Production command wiring (repo + workspace scripts)

1. Root `package.json` — new scripts: `start:api`
   (`npm run start:prod --workspace @hungrybox/api`), `db:deploy`
   (`npm run db:deploy --workspace @hungrybox/api`), `provision:admin` and `provision:branch`
   (each delegates to the API workspace). Railway is configured to call the root scripts, so
   workspace details stay internal.
2. `apps/api/package.json` — `prebuild` and `pretypecheck` now append `&& prisma generate`
   (single generation point for `npm run build` / `npm run typecheck`); explicit
   `db:generate` remains for interactive use. New scripts: `start:prod`
   (`node dist/main.js`), `db:deploy` (`prisma migrate deploy` — non-interactive, applies
   pending migrations on staging/production), `provision:admin` and `provision:branch`
   (`tsx scripts/provision-*.ts`).
3. `apps/api/tsconfig.seed.json` — `include` now covers `scripts/**/*.ts` (excludes
   `scripts/**/*.spec.ts`), so the provisioning CLIs and the seed stay strictly typed.

### D2 — Node version pinning

4. `.nvmrc` (new) — `22`. `package.json` engines already require `node >=22`; the pin makes
   the major version deterministic across local dev, CI, and the Railway Nixpacks build
   (Railway uses `.nvmrc` to select the build Node).

### D3 — Railway application configuration

5. `railway.json` (new) — single API service at the monorepo root: Nixpacks builder (no
   Dockerfile yet), `build.buildCommand: "npm run build"` (workspace build → dists),
   `deploy.startCommand: "npm run start:api"` (compiled `dist/main.js`),
   `deploy.preDeployCommand: "npm run db:deploy"` with a 300 s timeout (runs
   `prisma migrate deploy` against `DATABASE_URL` before serving),
   `deploy.healthcheckPath: "/api/health"` with a 60 s timeout,
   `deploy.restartPolicyType: "ON_FAILURE"` / max 5, `deploy.numReplicas: 1`,
   `build.watchPatterns` scoped to `apps/api`, `packages/shared`, `package.json`,
   `package-lock.json`.
6. Rationale recorded: the pre-deploy migration step is the Railway-supported home for
   schema application; `prisma migrate deploy` is preferred over `db push` because it is
   declarative and recorded. The web build is not yet deployed as an artifact in this phase
   (a frontend service is added when it goes live).

### D4 — Bootstrap CLIs (operator-only provisioning)

7. `apps/api/src/provisioning/provision-admin.ts` (new) — `provisionSuperAdmin(input, deps)`:
   idempotent, refuse-by-default. If no user exists it creates an `ACTIVE` `SUPER_ADMIN`
   with an Argon2 hash. If a user exists it **refuses** to promote a non-SUPER_ADMIN and
   **refuses** to reactivate an `INACTIVE`/`SUSPENDED`/`PENDING` SUPER_ADMIN; an already
   ACTIVE SUPER_ADMIN is a no-op. Login IDs are normalized identically to the auth flow.
8. `apps/api/scripts/provision-admin.ts` (new) — CLI: requires dev-credit-free
   `PROVISION_ADMIN_LOGIN_ID` + `PROVISION_ADMIN_PASSWORD` (reads `DATABASE_URL`), never
   echoes the password, connects with the same `PrismaPg` adapter as the app, reports the
   outcome, and exits non-zero on refusal. No hard-coded credentials.
9. `apps/api/src/provisioning/provision-branch.ts` (new) — `provisionBranch` +
   `validateBranchInput`: branch `code` must match `/^[a-z0-9][a-z0-9-]{1,49}$/`, required
   name/city/state/country, `deliveryRadiusKm` 1–100, optional latitude/longitude bounds
   (−90..90 / −180..180). Creates an `ACTIVE` `Branch`; an existing code is a no-op
   (never overwrites). **No Guntur, no radius constant** — every field is explicit input.
10. `apps/api/scripts/provision-branch.ts` (new) — CLI driven by `BRANCH_CODE`,
    `BRANCH_NAME`, `BRANCH_CITY`, `BRANCH_STATE`, `BRANCH_COUNTRY`, optional
    `BRANCH_ADDRESS`/`BRANCH_LATITUDE`/`BRANCH_LONGITUDE`, required
    `BRANCH_DELIVERY_RADIUS_KM`; reports outcome, exits non-zero on invalid input.
11. Tests: `provision-admin.spec.ts` (5) and `provision-branch.spec.ts` (6) cover create,
    idempotent no-op, refuse-to-promote, refuse-to-reactivate, normalization, validation
    bounds, and duplicate-code handling (hash injected for isolated, fast tests).

### D5 — Reference environment documentation

12. `apps/api/.env.example` — documented `CORS_ORIGINS` (validated by the CORS parser, no
    wildcard), `DATABASE_URL` as required for generate/validate/migrate/runtime, `JWT_SECRET`
    (production must set it; the dev fallback is called out), a payment note stating that
    only the `dev` provider ships in this phase, that an unknown `PAYMENT_PROVIDER` fails
    boot, that `dev` is rejected under `NODE_ENV=production`, and that Phase 9 makes
    deployment possible, **not** live payments — plus commented `PROVISION_*` and `BRANCH_*`
    placeholders for the bootstrap CLIs.
13. `apps/web/.env.example` — `VITE_API_BASE_URL` documented (dev proxies `/api` +
    `/socket.io`; production must be the real API origin, which must be listed in the API's
    `CORS_ORIGINS`; HTTPS required outside local dev). No secrets.

### D6 — CORS: one shared validator that fails fast (HTTP + Socket.IO)

14. `apps/api/src/common/config/cors.ts` (new) — `parseCorsOrigins`: trims a
    comma-separated `CORS_ORIGINS`, ignores empty entries, rejects `*` (the API always sends
    credentials), rejects any entry that is not an absolute `http(s)` URL without a path
    (a single trailing slash is normalized away so it matches the browser `Origin` header),
    and **throws at startup** on an invalid value instead of silently producing a broken or
    wide-open policy.
15. `apps/api/src/main.ts` — HTTP CORS and the Socket.IO adapter now share the parsed
    allow-list (both HTTP and `/socket.io` are governed by the same `CORS_ORIGINS`).
16. `apps/api/src/common/config/cors.spec.ts` (new) — 7 tests: blank, comma-list with
    whitespace/empty entries, localhost dev origins, wildcard rejection, non-URL rejection,
    path rejection, trailing-slash normalization.

### D7 — Readiness health semantics

17. `packages/shared/src/health.ts` — `HealthReport.status` is now `'ok' | 'degraded'`
    (typed in the shared contract, not a string).
18. `apps/api/src/modules/health/health.service.ts` — `status = database === 'connected' ?
'ok' : 'degraded'` (single source of truth).
19. `apps/api/src/modules/health/health.controller.ts` — `@Res({ passthrough: true })`:
    HTTP **200** when `status === 'ok'`, **503** when `degraded`, with the same
    `HealthReport` body, so Railway's `healthcheckPath` reflects readiness (503 → container
    restart) without exposing `DATABASE_URL`, hostnames, or stack traces.
20. `apps/api/src/modules/health/health.service.spec.ts` (new) — 3 tests: ok/connected,
    degraded/unreachable, degraded/unconfigured.

### D8 — Minimal request logging (safely defaulted on)

21. `apps/api/src/common/middleware/request-logging.middleware.ts` (new) — logs
    `METHOD path status durationMs` on `res 'finish'`; never logs query strings, bodies, or
    headers (no tokens/credentials in logs); skips `/api/health` and `/socket.io` to keep
    health probes and live connections quiet.
22. `apps/api/src/app.module.ts` — `implements NestModule`, middleware applied to `*`.

### D9 — Payment provider boot validation

23. `apps/api/src/modules/payments/payment-provider.registry.ts` — `OnModuleInit`: the API
    **fails to boot** on an unknown provider id, and rejects the `dev` provider when
    `NODE_ENV=production` (a misconfigured staging/production cannot start in a
    pretend-payment mode). The selected provider id is logged at boot for operators.
24. `apps/api/src/modules/payments/payment-provider.registry.spec.ts` (new) — 4 tests:
    `dev` is fine in development, unknown id throws, `dev` + production throws, `list()`.

### D10 — Graceful shutdown

25. `apps/api/src/main.ts` — `app.enableShutdownHooks()` so Railway/K8s SIGTERM closes
    connections and flushes in-flight work instead of a hard cut.

### D11 — Vite Socket.IO proxy correction

26. `apps/web/vite.config.ts` — removed the spurious `/realtime` proxy entry (the Socket.IO
    _engine handshake_ path is `/socket.io`, not the gateway namespace) and added the
    correct websocket proxy: `/socket.io` → `ws: true`, `changeOrigin: true`. The `/api`
    proxy is unchanged. Dev realtime now actually proxied.

### D12 — Frontend 401 / session-expiry path

27. `apps/web/src/api/session-expiry.ts` (new) — `SESSION_EXPIRED_EVENT` +
    `notifySessionExpired()`, which dispatches a `CustomEvent`-free `Event` on `window`
    (no jsdom navigation surprises).
28. `apps/web/src/api/client.ts` — both `apiRequest` and `apiRequestText` broadcast
    session-expiry on **401 responses that carried a token**; public logins (no token),
    `403` (e.g. suspension), and `409`/5xx are untouched — 403 is an authorization state,
    not a dead session.
29. `apps/web/src/auth/auth-context.tsx` — the provider listens for
    `SESSION_EXPIRED_EVENT`, clears storage + user + token; `RequireAuth` then performs one
    redirect to `/login`. Every authenticated screen inherits this with no per-screen
    handling and no redirect loops.
30. Tests: `apps/web/src/api/client-session-expiry.test.ts` (3) — 401+token broadcasts,
    401 login (no token) does not, 403+token does not. `apps/web/src/auth/auth-context.test.tsx`
    (1) — dispatching the event clears user/token and removes the stored session.

## Multi-branch invariants preserved

- Branch bootstrap takes **explicit operator input** (code/name/city/radius); there is no
  Guntur literal and no radius constant anywhere in the Phase 9 code (`provision-branch.ts`
  validates against the same bounds the CreateBranchDto uses).
- `CORS_ORIGINS`, `PROVISION_*`/`BRANCH_*`, `PAYMENT_PROVIDER`, `DATABASE_URL` are all
  configuration; adding a branch remains a data/config operation with no code changes.
- The shared health/type contracts live in `packages/shared` (built to `dist`), consumed
  type-first — no duplicated types in the apps.

## Security posture

- Provisioning CLIs and env docs never hard-code credentials; passwords exist only in
  operator-provided env vars, are hashed with the project's Argon2 profile, and are never
  printed.
- CORS fails fast (invalid origins throw at boot); `*` is rejected because credentials are
  always enabled.
- Request logs and health payloads never contain tokens, query strings, secrets, or
  connection strings.
- Payment provider selection is validated at boot and the `dev` provider cannot run under
  `NODE_ENV=production`.
- 401 handling only clears a session that the client believed was authenticated; 403
  semantics (suspension/authorization) are untouched.

## Guardrails honored

- Repository-only phase: no Railway CLI, no deployment, no `git add/commit/push`, no
  `migrate`/`db push`/reseed, no `rm`/destructive cleanup, no external paths touched.
- No new dependencies — everything reuses Prisma-aware Nixpacks, existing `tsx`, Argon2,
  and the framework's own primitives.
- Recharts untouched; forbidden stack/platform rules untouched.
- `.env*` files are untouched and git-ignored; only `.env.example` documentation changed.

## Files added / modified

Added:

- `.nvmrc`, `railway.json`
- `apps/api/src/common/config/cors.ts` + `cors.spec.ts`
- `apps/api/src/common/middleware/request-logging.middleware.ts`
- `apps/api/src/modules/health/health.service.spec.ts`
- `apps/api/src/modules/payments/payment-provider.registry.spec.ts`
- `apps/api/src/provisioning/provision-admin.ts` + `provision-admin.spec.ts`
- `apps/api/src/provisioning/provision-branch.ts` + `provision-branch.spec.ts`
- `apps/api/scripts/provision-admin.ts`, `apps/api/scripts/provision-branch.ts`
- `apps/web/src/api/session-expiry.ts`, `apps/web/src/api/client-session-expiry.test.ts`
- `apps/web/src/auth/auth-context.test.tsx`

Modified:

- `package.json` (root), `apps/api/package.json`, `apps/api/tsconfig.seed.json`
- `apps/api/src/main.ts`, `apps/api/src/app.module.ts`
- `packages/shared/src/health.ts`
- `apps/api/src/modules/health/health.service.ts`, `health.controller.ts`
- `apps/api/src/modules/payments/payment-provider.registry.ts`
- `apps/api/.env.example`, `apps/web/.env.example`
- `apps/web/vite.config.ts`
- `apps/web/src/api/client.ts`, `apps/web/src/auth/auth-context.tsx`

## Limitations & staging notes

- `dev` payment provider remains the only implementation; a real gateway is a later phase.
  Staging/demo deployments may keep `PAYMENT_PROVIDER=dev` deliberately with
  `NODE_ENV=staging` (the guard only rejects `dev` when `NODE_ENV === 'production'`).
- The web frontend is built but not yet served by Railway (no static-asset service in this
  phase; `VITE_API_BASE_URL` is ready for when it is).
- Two pre-existing web suites (`storefront`, `manager-delivery`) can flake under full
  parallel load on this machine; both pass in isolation this session (unrelated to Phase 9).
- Live E2E suites remain opt-in (`RUN_LIVE_E2E` + `DATABASE_URL`).

## Architecture decision records (ADR-031..036)

See `docs/architecture.md` → Decision log for ADR-031 (Prisma generation is a single
prebuild step), ADR-032 (Railway Nixpacks workspace build with pre-deploy
`prisma migrate deploy` + `/api/health` readiness), ADR-033 (operator-only provisioning over
auto-bootstrap), ADR-034 (CORS fails fast and is shared across HTTP/Socket.IO),
ADR-035 (health semantics: 200 ok / 503 degraded), ADR-036 (Node 22 pinned for
reproducible builds).

## Final gate summary

- Typecheck: shared + api (+ `tsconfig.seed.json`) + web — **pass**
- Lint (eslint): api + web — **pass**
- Build: shared + api (`nest build`) + web (`tsc && vite build`) — **pass**
- API tests: **332 passed / 5 skipped** — **pass**; Web tests: **101 passed** (+4) — **pass**
- `prisma validate` — **pass**
- `git status --short` / `git diff --stat` are the only git operations performed in Phase 9;
  nothing committed, nothing pushed.

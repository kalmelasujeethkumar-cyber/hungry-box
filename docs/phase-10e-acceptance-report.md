# Phase 10E — Final Phase 10 Acceptance Report

- **Baseline:** commit `e608da7` ("Complete Phase 10D private delivery partner KYC")
- **Scope:** final acceptance/security/integration verification of Phase 10B (Cash on Delivery),
  Phase 10C (public catalog media), and Phase 10D (private delivery partner KYC), plus repair of
  the three confirmed defects (D1, D2, D3) found by the Phase 10E public-media audit.
- **Date:** 2026-09-25 (session completion)
- **Result:** ACCEPTED. No blocking defect remains open.

## Verification methodology

All checks in this phase were performed directly in the main session using read/search of the
codebase and the repository test suites. No live branch is used and none was configured.

Honesty labels used below:

- `CODE REVIEW VERIFIED` — established by reading the implementation in source.
- `AUTOMATED TEST VERIFIED` — established by an automated unit test that passes in this repo.
- `NOT LIVE-TESTED` — requires a live environment/real provider/real credentials; not run here
  (see "Known limitations").

## Components under review

| Phase | Surface |
| --- | --- |
| 10B | COD: `orders.createCod`/`PaymentsService.createCodPayment`, `deliveries.deliver` (cash),
  `branch-orders.collectCod`, COD analytics/CSV, branch-scoped audit events |
| 10C | Public media: `products` image upload/primary/reorder/remove, `categories` image
  upload/replace/remove, media-storage providers, public-image validator |
| 10D | Private KYC: `kyc` module (partner upload, manager request/review, document access),
  roles guard `@AllowInactiveDeliveryPartner`, private-document validator, private storage provider |

## Checklist results

### 1. Migration chain — PASS (`CODE REVIEW VERIFIED`)

7 migrations exist, chronological for 10B → 10C → 10D:

- 10C reconciliation (AuditEvent `branchId` FK, PartnerIdCounter default) is intact and is not
  re-run by any later migration.
- 10C = exactly 4 `ADD COLUMN` (`ProductImage.providerPublicId`, `ProductImage.resourceType`,
  `Category.providerPublicId`, `Category.resourceType`).
- 10D = exactly 5 `ADD COLUMN` (`DeliveryPartnerDocument.storageProvider`,
  `providerPublicId`, `resourceType`, `format`, `fileSize`).
- No DROPs, no destructive operations, no history rewrites.
- `prisma validate` — valid. `prisma migrate status` — 7/7 migrations applied, up to date.

### 2. Cash on Delivery — PASS (`CODE REVIEW VERIFIED`, `AUTOMATED TEST VERIFIED`)

- `OrdersService.createCod` → `createCodPayment` bypasses the external payment provider entirely;
  payment row is `provider: 'cod'`, `method: 'COD'`, `status: PENDING`.
- `deliver` requires `cashCollected === true`, enforced server-side, and flips assignment →
  DELIVERED, order → DELIVERED/PAID, and payment → PAID (with `collectedAt`,
  `collectedByRole`, `collectedById`) inside one `$transaction`, audited `COD_COLLECTED`.
- Wrong-partner delivery is blocked (assignment ownership check).
- `branch-orders.collectCod` is branch-scoped (`enforcedBranchId`), requires a `reason`, and a
  double-collect is rejected with 409 `cod.already_collected` (`COD_COLLECTION_FAILED` audit).
- Analytics revenue counts only PAID orders; the CSV export includes payment method and
  `collectedAt`/`collectedByRole`/`collectedById`.
- Route RBAC: `branch/orders` is `@Roles('SUPER_ADMIN','BRANCH_MANAGER')`.
- Covered by `orders.service.spec`, `payments.service.spec`, `delivery-assignment.service.spec`,
  `branch-orders.service.spec` (15 tests incl. collect-cod), `analytics.service.spec`.

### 3. Public catalog media — REPAIRED (D1, D2, D3)

The audit completed with 19 PASS / 4 PARTIAL / 2 FAIL, producing three confirmed defects.
All three were repaired with focused regression tests. Details below.

### 4. Private delivery partner KYC — PASS (`CODE REVIEW VERIFIED`, `AUTOMATED TEST VERIFIED`)

- Gating is exactly `AADHAAR` + `DRIVING_LICENSE`; legacy `DocumentType` values remain only for
  the older partner-document table and forward-compat.
- Uploads are validated for JPEG/PNG magic bytes only and ≤ 5 MB; stored privately
  (`type: 'authenticated'`, `hungry-box/kyc`, `randomUUID` public ids); no permanent or signed
  URLs are persisted.
- Only the owning partner can upload/read their documents; a manager can only access documents
  of a partner in their own branch (`enforcedBranchId`), and only SUPER_ADMIN/BRANCH_MANAGER
  roles reach any KYC read path.
- Review (verify/reject) is restricted to BRANCH_MANAGER (method-level `@Roles` overrides the
  class-level SUPER_ADMIN/BRANCH_MANAGER and the service double-checks the actor role).
- Coverage: `kyc.service.spec` (25), `kyc-rbac.spec` (5), `roles.guard.spec` (16, incl. the
  inactive-partner opt-out), `private-document-validator.spec` (7), `cloudinary-private-document-storage.provider.spec` (6).

### 5. Inactive delivery partner exception — PASS (`CODE REVIEW VERIFIED`, `AUTOMATED TEST VERIFIED`)

- `@AllowInactiveDeliveryPartner()` appears exactly on the three partner-KYC handlers
  (`delivery/kyc` status GET, documents POST, document access POST).
- `JwtAuthGuard` still requires an ACTIVE user before the profile-status skip applies.
- No delivery/COD route carries the flag; the flag does not weaken any other surface.

### 6. RBAC matrix — PASS (`CODE REVIEW VERIFIED`)

Full route→role matrix enumerated from all controllers and the global guards in
`app.module.ts` (`JwtAuthGuard`, `RolesGuard`, `BranchScopeGuard`):

- **CUSTOMER:** `addresses`, `cart`, `checkout`, `orders` (incl. `createCod`), `payments`,
  `delivery-tracking`, `notifications`.
- **DELIVERY_PARTNER:** `delivery` (me), `delivery/assignments`, `delivery/kyc`.
- **BRANCH_MANAGER:** `branch/*` controllers + `notifications`; no global product/category
  mutation.
- **SUPER_ADMIN:** all admin surfaces (`products`, `categories`, `branches`,
  `branch-products`, `users`, `admin` analytics, global `branch/*` read paths).
- Media admin routes (product/category image upload/primary/reorder/remove) are
  SUPER_ADMIN-only.
- Controllers with no `@Roles` are public/anonymous (auth, health, locations, catalog,
  public branch/category/product reads).

### 7. Audit trail & privacy — PASS (`CODE REVIEW VERIFIED`)

- `AuditService.record` persists only `actorRole`, `actorId`, `kind`, `entityType`,
  `entityId`, `branchId`, and a human `message`; never document bytes, signed URLs,
  passwords, keys, or identity numbers.
- Audit reads (`list`, `exportCsv`) are branch-scoped via `buildWhere`/`enforcedBranchId`:
  a BRANCH_MANAGER can only ever see their own branch's events, and any client-supplied
  `branchId` is ignored for managers.
- KYC access URLs are short-lived and delivered only to the authorized requestor; no
  permanent/signed URL is stored or audited.
- Minor observation (not blocking): `KYC_CLEANUP_FAILED` messages embed the opaque storage
  `publicId` for operational diagnosis. A storage publicId is not identity data, not a signed
  URL, and cannot be used to fetch the private asset. Catalog cleanup events do not embed it.

### 8. Upload & file security — PASS (`CODE REVIEW VERIFIED`, `AUTOMATED TEST VERIFIED`)

- Public images: magic-byte validation (JPEG/PNG/WebP), size limit enforced at the file
  interceptor; `originalname`/`mimetype` never drive storage layout (randomUUID public ids,
  `hungry-box/catalog/...` folders).
- Private documents: magic-byte JPEG/PNG only, ≤ 5 MB; the validator rejects everything else.
- Cloudinary credentials are read server-side only (env) and never exposed through API
  responses or the frontend (`VITE_` has no Cloudinary keys; no `documentReference`/
  `providerPublicId` is surfaced in shared contracts).

### 9. Frontend/API contract review — PASS (`CODE REVIEW VERIFIED`)

- `customerOrdersApi.createCod`, `deliveryApi.deliver` (cashCollected), `branchOrdersApi
  .collectCod` map 1:1 to API DTOs and routes.
- `deliveryKycApi` (`status`, `documents`, `documents/:type/access`) and `branchKycApi`
  (`list`, `get`, `documentAccess`, `review`) match `partner-kyc.controller.ts` and
  `branch-kyc.controller.ts` exactly.
- Media client methods (`setPrimaryImage`, `reorderImages`, `removeImage`, category
  upload/remove) match the controllers' routes and DTOs.
- `KycDocumentType` in `packages/shared` is the 2-value set used by the web app; web label
  maps live in `apps/web/src/features/delivery/delivery-status.ts`.

### 10. Multi-branch / hard-coded assumptions — PASS (`CODE REVIEW VERIFIED`)

- "Guntur" appears only in `prisma/seed.ts` (demo data) and test fixtures / live-e2e helpers —
  never in production logic, Phase-10 modules, or the web app sources.
- No branch ID, city, or delivery radius is hard-coded; delivery radius is
  `branch.delivery_radius_km` configuration.

## Confirmed defects and repairs

### D1 — Best-effort media cleanup could let an audit-write failure escape (REPAIRED)

`bestEffortDeleteAsset` in `products.service.ts` and `categories.service.ts` treats the
external delete as best-effort but, when the provider delete throws AND the
`MEDIA_CLEANUP_FAILED` audit write also fails (e.g. DB down), the audit error escaped and
could (a) replace the original error in upload paths or (b) turn an already-committed removal
into an HTTP 500. Cleanup is best-effort by contract.

**Fix:** the audit write inside `bestEffortDeleteAsset` is now also swallowed on failure.
Cleanup/audit failure can no longer surface; the committed mutation and the original error are
preserved.

**Regression tests:**
- `products.service.spec`: upload rejects with the original `BadRequestException` even when
  cleanup and its audit both fail; removeImage resolves after a committed removal even when
  the cleanup audit write fails.
- `categories.service.spec`: upload rethrows the original DB error with both failures;
  removeImage resolves with the cleanup audit write failing.

### D2 — Product primary transitions lacked product-level serialization (REPAIRED)

`setPrimaryImage` read the current image and cleared/re-set primaries in a transaction without
locking the product row. Concurrent requests for the same product could interleave their
clear+set and leave two `isPrimary` images. `removeImage` (delete + promote next) and
`reorderImages` (primary re-normalization) have the same joinable race with `setPrimaryImage`.

**Fix:** a `requireProductLock` helper runs `SELECT id FROM "Product" WHERE id = $productId
FOR UPDATE` inside the same transaction for `setPrimaryImage`, `removeImage`, and
`reorderImages`, and the pre-existing inline lock in `uploadImage` now uses the same helper.
Any concurrent primary transition on a product serializes on the product row, guaranteeing
exactly one primary. A disappearing product row raises `NotFoundException` and writes nothing.

**Regression tests:** FOR UPDATE SQL is issued within the transition transaction for
`setPrimaryImage`, `removeImage`, and `reorderImages`; a product that disappears between the
image read and the lock yields `NotFoundException` with zero writes.

### D3 — Category upload/remove read the old asset without category-level serialization (REPAIRED)

`uploadImage` and `removeImage` read the current category image outside any lock and mutated
the row outside a transaction. Two concurrent uploads, or an upload racing a remove, could
clean the wrong asset and leave a newly uploaded asset orphaned (still billed) while the DB
points at another (or no) image.

**Fix:** both methods now operate inside a transaction that takes a category-row lock
(`SELECT id FROM "Category" WHERE id = $categoryId FOR UPDATE`), read the authoritative
previous `imagePublicId`, and commit the DB switch. Exactly the previous asset is cleaned
after commit; on any DB failure the newly uploaded asset is cleaned and the original error
rethrows; cleanup remains best-effort. A fail-fast non-locking existence check still precedes
the external upload.

**Regression tests:** uploads/replaces/removes assert FOR UPDATE within the write transaction,
the exact old asset is the only delete target after commit, `NotFound`/`BadRequest`/
DB-failure paths, and D1 swallows.

## Additional defects found by the direct audits

None blocking. Observations recorded: `KYC_CLEANUP_FAILED` embeds the opaque storage
`publicId` (diagnostic only, not a secret/identity); legacy `DocumentType` labels remain in
the web constants for the older partner-document flow (intentional, data-compat).

## Files changed (this phase, exactly four)

- `apps/api/src/modules/products/products.service.ts`
- `apps/api/src/modules/products/products.service.spec.ts`
- `apps/api/src/modules/categories/categories.service.ts`
- `apps/api/src/modules/categories/categories.service.spec.ts`

No other source file was modified. This report
(`docs/phase-10e-acceptance-report.md`) is the only new file created in this phase.

## Tests added / changed

- `products.service.spec.ts`: added D1 (2 tests), D2 (4 tests: lock before clear, missing
  product row, lock before delete, lock during reorder), and updated transaction mocks to
  provide `$queryRaw` for the new FOR UPDATE queries. (29 tests total)
- `categories.service.spec.ts`: rewrote the upload/remove blocks for the transactional +
  locked design; added D1 swallow tests (2). (17 tests total)

## Quality gates (all run as the final step)

| Gate | Result |
| --- | --- |
| `npm run typecheck` | PASS (shared build + API + web, incl. seed config) |
| `npm run lint` | PASS (API ESLint + Web ESLint) |
| `npm run test --workspace=@hungrybox/api` | 449 passed / 5 skipped, 44 files, 5 live-e2e skipped |
| `npm run test --workspace=@hungrybox/web` | 136 passed, 19 files |
| `npm run build` | PASS (shared + API Nest + Web Vite) |
| `prisma validate` | PASS |
| `prisma migrate status` | 7/7 migrations, up to date |

Baseline comparison: the API suite grew from 440 to 449 passing with the new regression tests.

## Warnings vs failures

Benign (not failures):

- Vite build: single chunk ≈ 990 kB minified / 271 kB gzip (>500 kB warning) — no code
  splitting added in this phase.
- Web test stderr: Recharts jsdom `width(0)/height(0)` chart warnings, jsdom
  "not implemented" navigation/window.open messages — expected in jsdom.
- Git line-ending notices (LF will be replaced by CRLF) — cosmetic on Windows; unrelated to
  content.

## Known limitations

- Nothing in this phase was exercised against a live PostgreSQL + Cloudinary instance; all
  verification is unit-level with mocked providers (repository policy: live e2e gated behind
  `RUN_LIVE_E2E=1`, not run here).
- Concurrency behavior is proven at the SQL-statement level (FOR UPDATE issued inside the
  write transaction). No live multi-connection race was executed.
- `MEDIA_CLEANUP_FAILED` for catalog images does not record the storage `publicId`, so an
  orphaned asset is not directly addressable from the audit event (by design; the KYC events
  include it).

## Deferred (explicitly out of scope for this phase)

Real PhonePe integration, refunds, production Cloudinary account/credentials, OCR/DigiLocker/
Aadhaar API, auto-KYC, PDF KYC, branch-specific imagery, Redis/multi-instance realtime,
Railway deployment, Phase 11 UI polish, Phase 12 release.

## Final forensics

- HEAD: `e608da7` (unchanged).
- `git diff HEAD --name-status`: only the 4 source files listed above (`M`).
- `git ls-files --others --exclude-standard`: exactly `docs/phase-10e-acceptance-report.md`
  (this report, the single untracked artifact).
- Nothing was staged, committed, or pushed.
- No commit, no push, no deployment, no database reset, no `prisma db push`, no real
  Cloudinary credentials, no real KYC documents, and the external backup directory was not
  accessed.

## Conclusion

Phase 10B/10C/10D acceptance is complete. The three confirmed defects (D1 cleanup best-effort,
D2 product primary serialization, D3 category serialization) are repaired with focused
regression tests, all quality gates pass, and the working tree contains exactly the four
intended files on an unchanged baseline. **Phase 10E ACCEPTED.**
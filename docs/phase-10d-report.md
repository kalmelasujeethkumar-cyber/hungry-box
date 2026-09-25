# Phase 10D — Private delivery-partner KYC documents (Cloudinary authenticated storage + review) (delivered)

Status: **complete and verified.** Phase 10D gives every delivery partner a real, audited
document-KYC process: **Aadhaar + Driving Licence** must be uploaded as private,
`authenticated` Cloudinary images under `hungry-box/kyc` (never publicly addressable, never
with a persisted signed URL or identity numbers). Partners self-service upload/re-upload;
Branch Managers of the partner's assigned branch verify or reject each document (rejection
requires a note); Super Admin gets global read/audit visibility but cannot review. A derived
overall state (`INCOMPLETE` / `ACTION_REQUIRED` / `AWAITING_REVIEW` / `VERIFIED`) appears on
the partner profile, the manager partner-detail screen, and the admin partner list.

Private storage is a first-class provider abstraction (`PRIVATE_KYC_STORAGE_PROVIDER`,
`PrivateDocumentStorageProvider`) mirroring the public `MEDIA_STORAGE_PROVIDER` pattern: the
API boots and everything except KYC-storage flows works even when Cloudinary credentials are
absent (those requests fail with a clear 503 instead of crashing the service). Validation is
magic-byte based (JPEG/PNG only, ≤ 5 MB) — never MIME/extension trust.

This phase is **repository-only**: no commits, no push, no deployment, no `db push`, no
`migrate reset`, no reseed. The locked baseline commit is `da2f469`.

## Verification gates (all green this session)

- `npm run typecheck` — shared + api + web pass.
- `npm run lint` — api + web pass (eslint clean).
- `npm run build` — shared, api, web pass.
- `npm run test:api` — 44 files, **440 passed / 5 skipped** (the 5 skipped are the gated live
  e2e suites; +50 vs Phase 10C's 390).
- `npm run test:web` — 19 files, **136 passed** (+12 vs Phase 10C's 124).
- `npx prisma validate` — schema valid (non-destructive).
- `npx prisma migrate status` — **Database schema is up to date!** (7 migrations applied).

## Delivered checklist

### D1 — Data model & migration (one additive ALTER)

1. `DeliveryPartnerDocument` gains nullable `storageProvider`, `providerPublicId`,
   `resourceType`, `format`, `fileSize` — storage facts side-by-side with the existing
   `status`/`verificationNote`/`verifiedById`/`verifiedAt` review columns; no identity
   numbers are ever stored.
2. One non-destructive migration, `20261001030000_phase10d_private_kyc_documents`
   (`--create-only` → `prisma migrate deploy`): **exactly 5 `ADD COLUMN`, no drops**, nothing
   else in the migration set (status clean, 7 migrations). `prisma generate` ran afterwards.

### D2 — Private storage abstraction (`apps/api/src/modules/media`)

3. `PrivateDocumentStorageProvider` interface + `PRIVATE_KYC_STORAGE_PROVIDER` symbol:
   `uploadPrivateDocument`, `deletePrivateDocument`, `generatePrivateDocumentAccess`.
   `MAX_PRIVATE_DOCUMENT_BYTES = 5 MB`, `PRIVATE_DOCUMENT_ACCESS_TTL_MS = 5 min`,
   `KYC_STORAGE_FOLDER = 'hungry-box/kyc'`.
4. `CloudinaryPrivateDocumentStorageProvider` — upload/destroy with
   `{ resource_type: 'image', type: 'authenticated' }` into the KYC folder, `public_id` from
   `crypto.randomUUID()`; `generatePrivateDocumentAccess` returns
   `cloudinary.utils.private_download_url(publicId, toDeliveryFormat(format), { expiration,
   resource_type: 'image', type: 'authenticated' })` where `toDeliveryFormat('jpeg')` = `'jpg'`.
5. `UnavailablePrivateDocumentStorageProvider` — `ServiceUnavailableException` on all three
   operations (never a boot blocker).
6. `PrivateDocumentStorageModule` exports the symbol via a pure factory
   `resolvePrivateDocumentStorageProvider(config)` (Cloudinary only when all three
   `CLOUDINARY_*` creds are set), unit-tested directly without a Nest container.

### D3 — Server-side document validation (magic bytes, never MIME trust)

7. `detectPrivateDocumentFormat` reads actual bytes: JPEG `FF D8 FF`, PNG 8-byte signature.
   `validatePrivateKycDocument` rejects missing/empty buffers, > 5 MB, and anything that is
   not JPEG/PNG ("Only JPEG and PNG document images are allowed"). PDF, SVG, WebP, GIF, HEIC,
   and disguised payloads are rejected by construction. The upload route additionally carries
   a `FileInterceptor` limit of `MAX_PRIVATE_DOCUMENT_BYTES` so memory stays bounded.

### D4 — Partner self-service API (`/delivery/kyc`, DELIVERY_PARTNER only)

8. `GET /delivery/kyc` — `KycStatusDto` (overall state, per-document status/note/verifiedAt/
   canReupload) derived without exposing any storage internals or identity numbers.
9. `POST /delivery/kyc/documents` — multipart `file` + form `type`. Flow: validate bytes →
   load profile → upload the asset → transactionally `upsert` the document row (re-upload
   resets `status='UPLOADED'`, clears note/verified fields, stores the new storage facts) →
   audit `KYC_DOCUMENT_UPLOADED` or `KYC_DOCUMENT_REUPLOADED` → delete the old asset
   best-effort. A DB failure after a successful upload deletes the orphan best-effort
   (`KYC_CLEANUP_FAILED` SYSTEM audit if that also fails); a VERIFIED document is protected
   with a 409 ("This verified document cannot be replaced"); SUSPENDED/REJECTED partners get
   a 409 ("Cannot upload KYC documents for a suspended or rejected partner").
10. `POST /delivery/kyc/documents/:type/access` — backend-authorized `private_download_url`
    (+ audit `KYC_DOCUMENT_VIEWED`), ~5-minute TTL, never persisted.
11. All three routes are `@Roles('DELIVERY_PARTNER')` **and**
    `@AllowInactiveDeliveryPartner()`: the new RolesGuard opt-out keeps the user-account
    ACTIVE requirement and other role gating intact while letting a
    `PENDING_VERIFICATION` / `DOCUMENT_REVIEW` / `INACTIVE` partner upload or re-view their
    own paperwork (they must be able to complete KYC *because* they are inactive). `SUSPENDED`
    and `REJECTED` partners remain denied by the service (D4.9) and no longer by the guard.

### D5 — Branch Manager + Super Admin API (`/branch/kyc`, SUPER_ADMIN + BRANCH_MANAGER)

12. `GET /branch/kyc?branchId=` — `KycListItemDto[]` (presence booleans `hasAadhaar`/
    `hasDrivingLicense`, `overallState`); a manager is always pinned to their own branch on
    the server (`enforcedBranchId`), an admin may filter globally or list all.
13. `GET /branch/kyc/:partnerId` — full `KycStatusDto` for one partner. Branch isolation is
    IDOR-safe: a manager who asks for a partner outside their branch gets 404, never data.
14. `POST /branch/kyc/:partnerId/documents/:type/access` — short-lived view (audited
    `KYC_DOCUMENT_VIEWED` with the viewer's role/id).
15. `POST /branch/kyc/:partnerId/documents/:type/review` — **additionally `@Roles('BRANCH_MANAGER')`
    at the method level** so a Super Admin is *never* able to review; the service double-checks
    `actor.role === 'BRANCH_MANAGER'`. `VERIFY` records `status='VERIFIED'`,
    `verifiedById`, `verifiedAt`; `REJECT` requires a `note` (400 otherwise) and records the
    note as `verificationNote`. Both audit `KYC_DOCUMENT_VERIFIED` / `KYC_DOCUMENT_REJECTED`
    inside the same transaction.

### D6 — Review-state rules and derived overall state

16. `REQUIRED_DOCUMENTS = ['AADHAAR', 'DRIVING_LICENSE']` is data/config in
    `DeliveryPartnerService` (and mirrored on the frontend); legacy `PAN`/`ADDRESS_PROOF`
    document rows remain supported for historical data and migration but are not KYC-gating.
17. `KycOverallState`: both VERIFIED → `VERIFIED`; any REJECTED → `ACTION_REQUIRED`; any
    non-PENDING (uploaded/reviewable) document set → `AWAITING_REVIEW`; else `INCOMPLETE`.
    Re-upload of a rejected document resets it to `UPLOADED`, which returns the overall state
    to `AWAITING_REVIEW` for re-reviewing.

### D7 — RolesGuard opt-out (`@AllowInactiveDeliveryPartner`)

18. New `@AllowInactiveDeliveryPartner()` metadata decorator +
    `ALLOW_INACTIVE_DELIVERY_PARTNER_KEY`; `RolesGuard` checks the handler-level flag first
    and, when set, skips only the delivery-partner status re-validation (the required-role
    check still applies). Unit-tested in `roles.guard.spec.ts` (16 tests, incl. opt-out on
    allowed/disallowed roles).

### D8 — Shared contracts (type-only)

19. `packages/shared/src/kyc.ts`: `KycDocumentType`, `KycDocumentStatus`, `KycOverallState`,
    `KycDocumentDto`, `KycStatusDto`, `KycListItemDto`, `KycReviewInput`,
    `KycDocumentAccessDto`. Consumed type-only (no runtime shared values shipped yet); API DTOs
    (`review-kyc-document.dto` with class-validator) stay the runtime authority. Shared dist
    rebuilt.

### D9 — Frontend

20. `client.ts` — `deliveryPartnerApi.kycStatus`, `kycUploadDocument` (FormData via the
    existing `uploadRequest`), `kycDocumentAccess`; new `branchKycApi` with `list`, `get`,
    `documentAccess`, `review`; KYC types imported from `@hungrybox/shared`.
21. `delivery-status.ts` — `KYC_DOCUMENT_TYPES`, `KYC_DOCUMENT_LABELS`,
    `KYC_DOCUMENT_STATUS_LABELS`, `KYC_OVERALL_LABELS`, `KYC_OVERALL_CHIP_CLASSES`;
    `REQUIRED_VERIFICATION_DOCUMENTS = ['AADHAAR', 'DRIVING_LICENSE']` matches the server.
22. `PartnerKycCard.tsx` (mounted in `DeliveryProfilePage`): overall-state chip, per-document
    status/rejection note/verified date, Upload / Re-upload / Replace via hidden file input,
    View via the short-lived access URL, client-side JPEG/PNG + ≤ 5 MB pre-validation, error
    banner.
23. `ManagerKycCard.tsx` (mounted in `ManagerPartnerDetailPage`, prop `partnerId`): chips,
    View/Verify/Reject with a *required* reason dialog (reason input) mirroring the API rule.
24. `AdminPartnersPage.tsx`: KYC data now comes from `branchKycApi.list` — per-partner overall
    chip, "Aadhaar uploaded · licence missing" presence line, and secure View buttons for each
    uploaded AADHAAR/DRIVING_LICENSE image, with a `kycError` banner when the KYC surface is
    unavailable (e.g. Cloudinary not configured — the rest of the admin page still works).

### D10 — Tests

25. **API (+50 → 440):** `kyc.service.spec.ts` (25 — status derivation; upload
    uploads-then-persists, formats stored, verified-replacement 409, suspended/rejected 409,
    re-upload resets + audits REUPLOADED, DB-failure orphan cleanup, re-upload old-asset
    cleanup, overall-state transitions INCLUDING ACTION_REQUIRED on reject and re-review return
    to AWAITING_REVIEW, review verify/reject, reject-without-note 400, cross-branch 404 for
    manager, admin filter/list), `kyc-rbac.spec.ts` (5 — role gating incl. SUPER_ADMIN
    forbidden from review), `roles.guard.spec.ts` (16 — +4 opt-out cases), new
    `private-document-validator.spec.ts` (7 — magic bytes, JPEG/PNG, reject types/sizes),
    `cloudinary-private-document-storage.provider.spec.ts` (6 — upload/delete/auth-download,
    jpeg→jpg conversion, expiration), `private-document-storage.module.spec.ts` (3 — provider
    selection/unavailable).
26. **Web (+12 → 136):** new `PartnerKycCard.test.tsx` (6: status chip, upload happy path,
    oversized/type rejection, view, re-upload, verified-no-reupload) and
    `ManagerKycCard.test.tsx` (4: load, verify, reject-requires-reason, cancel), plus updated
    `DeliveryProfilePage.test.tsx`, `manager-delivery.test.tsx`, and `admin-operations.test.tsx`
    (branchKycApi mocked; new global KYC visibility test), and `delivery-status.test.ts` for
    the required-docs set + labels.
27. Test-support notes: `userEvent.upload` filters by the input's `accept` attribute by
    default, so non-image rejection tests use `fireEvent.change`; oversized-file test files are
    built as 5 MB + 1 byte; loading-heading `findByText` can race with React reconciliation
    (detached node), so assertions first await a loaded-state chip.

## Multi-branch & architecture invariants preserved

- No branch/city literal anywhere: the KYC policy, the storage folder (`hungry-box/kyc`), and
  the review rules are configurable data, not source code (ADR-048).
- Branch isolation is server-enforced and IDOR-safe: `enforcedBranchId` pins every manager
  read/review/access to their own branch (404 across branches); Super Admin is global but
  review-only-by-branch-manager (ADR-052).
- Reuses the one shared `DeliveryPartnerDocument` entity and one auth flow; no separate app or
  duplicated role logic. The shared package stays **type-only** (ADR rule: runtime values need
  the ESM build step first).

## Security posture

- Identity **numbers are never stored, logged, audited, or exposed** — the DB keeps only
  storage facts + review state, and list/status contracts carry presence booleans (ADR-054).
- Documents are `authenticated`-type cloud assets with `randomUUID()` ids in a dedicated
  folder: no guessable URL, no permanent public URL, no signed URL persisted anywhere; access
  is backend-authorized per request and expires after ~5 minutes (ADR-050).
- Validation trusts bytes, not `mimetype`/extension; uploads are size-capped at the route and
  in the validator (ADR-051).
- Server is the source of truth for authorization (roles + branch) and for review semantics;
  the client only mirrors UX limits. Cloudinary creds are server-only, never `VITE_*`.
- Remote deletes are best-effort after the DB write; failures surface as `SYSTEM`
  `KYC_CLEANUP_FAILED` audits and never break a request (ADR-053).

## Files added / modified

Added:

- `apps/api/prisma/migrations/20261001030000_phase10d_private_kyc_documents/`
- `apps/api/src/modules/kyc/` (service, partner + branch controllers, module, DTO, spec,
  RBAC spec)
- `apps/api/src/modules/media/private-document-*` + `cloudinary-private-document-storage*`
  (interface, validator, module, providers, specs)
- `apps/api/src/common/decorators/allow-inactive-delivery-partner.decorator.ts`
- `packages/shared/src/kyc.ts`, `packages/shared/dist/*` (rebuilt)
- `apps/web/src/features/delivery/PartnerKycCard.tsx`, `ManagerKycCard.tsx` (+ tests)

Modified (highlights):

- `apps/api/prisma/schema.prisma`, `apps/api/src/app.module.ts`, `audit/audit.service.ts`
  (new AuditKinds), `common/guards/roles.guard.ts`
  (+ `allow-inactive-delivery-partner` opt-out), `delivery-partners/delivery-partner.service.ts`
  (`REQUIRED_DOCUMENTS`), `.env.example` (documents the same placeholder creds).
- `apps/web/src/api/client.ts`, `delivery-status.ts` (+ test),
  `DeliveryProfilePage.tsx`, `ManagerPartnerDetailPage.tsx`, `AdminPartnersPage.tsx`
  (+ their tests), `manager-delivery.test.tsx`, `admin-operations.test.tsx`.
- `docs/architecture.md` (Phase 10D status + ADRs 48–54), `docs/phase-10d-report.md`
  (this file).

## Architecture decision records (ADR-048..054)

**ADR-048 — KYC requires exactly Aadhaar + Driving Licence for every delivery partner.** The
private-document policy is `['AADHAAR', 'DRIVING_LICENSE']` — capability is configurable data,
not a branch/city literal. Legacy PAN/ADDRESS_PROOF rows remain supported for historical data
and migration, and the activation flow reuses the same `REQUIRED_DOCUMENTS` source of truth.

**ADR-049 — Private identity documents are stored behind their own provider, never as public
media.** KYC assets live in Cloudinary as `type: 'authenticated'` under `hungry-box/kyc`
through `PRIVATE_KYC_STORAGE_PROVIDER`, mirroring the public `MEDIA_STORAGE_PROVIDER` pattern
(Cloudinary when configured, else a 503 provider). No permanent public URL, no signed URL, and
no identity number is ever persisted in DB/audit/logs.

**ADR-050 — Private document access is backend-authorized and short-lived.** No asset is
downloadable by guessing a URL; partner/manager/admin request access on demand, the server
re-checks RBAC + branch ownership, and returns a Cloudinary `private_download_url` that
expires after ~5 minutes and is never persisted.

**ADR-051 — Private documents are validated server-side by magic bytes, not MIME/extension.**
`validatePrivateKycDocument` mirrors the public validator (JPEG/PNG signatures only, ≤ 5 MB);
PDF/SVG/WebP/HEIC and disguised payloads are rejected, and the multipart route carries a
matching `FileInterceptor` size cap.

**ADR-052 — KYC verification is a human Branch Manager decision, never machine.** No
OCR/auto-verification. Only a manager of the partner's assigned branch (server-enforced
`branch_id` match, IDOR-safe 404) may VERIFY/REJECT; rejection requires a note; Super Admin
has global read/audit access but is forbidden from review both declaratively (method-level
`@Roles('BRANCH_MANAGER')`) and defensively in the service; re-upload resets to `UPLOADED` and
clears review fields.

**ADR-053 — Storage and DB stay consistent with the DB as source of truth and best-effort
remote cleanup.** Upload writes the asset first, then the DB row; a failed DB write deletes
the orphan best-effort; re-upload deletes the old asset only after DB success; any failed
cleanup becomes a `SYSTEM`-actor `KYC_CLEANUP_FAILED` audit, never a request error.
`@AllowInactiveDeliveryPartner()` lets a PENDING_VERIFICATION / DOCUMENT_REVIEW / INACTIVE
partner upload or re-view their own documents while keeping the user-account ACTIVE check,
the required-role gate, and all other RBAC intact (SUSPENDED/REJECTED partners stay denied).

**ADR-054 — KYC metadata never contains sensitive identity numbers.** The DB stores only
storage facts (`storageProvider`, `providerPublicId`, `resourceType`, `format`, `fileSize`)
plus review state, and list/status contracts expose presence booleans and statuses — never
Aadhaar/licence numbers, references, or URLs.

## Guardrails honored

- No commits, no push, no deployment, no backup access, no destructive DB commands, no
  hard-coded credentials, no Cloudinary calls in automated tests (projected specs mock
  `uploadPrivateDocument`/`deletePrivateDocument`/`generatePrivateDocumentAccess`; module fact
  tests assert selection logic only), no new Guntur logic, no schema logic leaked into the
  frontend, no identity numbers committed or logged, no secrets exposed. `.env*` untouched.
  Everything is left **uncommitted** for owner review.

## Final gate summary (re-run at end of session)

| Gate                    | Result                      |
| ----------------------- | --------------------------- |
| `prisma validate`       | pass                        |
| `prisma migrate status` | up to date, 7 migrations    |
| shared build / dist     | pass                        |
| api typecheck + lint    | pass                        |
| api tests               | 440 passed / 5 skipped      |
| web typecheck + lint    | pass                        |
| web tests               | 136 passed                  |
| full `npm run build`    | pass                        |
| git commits             | none (`da2f469` still HEAD) |
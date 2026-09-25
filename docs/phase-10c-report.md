# Phase 10C — Public catalog media (Cloudinary product & category images) (delivered)

Status: **complete and verified.** Phase 10C ships real, public, cloud-hosted images for the
global catalog: SUPER_ADMIN can upload up to **3 images per product** (choose primary,
reorder, add alt text, remove) and **one image per category** (upload/replace/remove),
all served to customers through the read-only storefront as optimized, secure Cloudinary
URLs. Uploads are validated server-side by magic bytes (JPEG/PNG/WebP only, ≤ 5 MB — SVG and
disguised payloads rejected), and storage goes through a provider abstraction so this phase
introduces **zero branch-, city-, or product-logic coupling** and **no Cloudinary secrets in
the frontend**.

The API is architected so the app still boots and serves the storefront when Cloudinary
credentials are absent: media-management requests fail with a clear 503
(`Image storage is not configured for this environment`) instead of crashing the service.

This phase is **repository-only**: no commits, no push, no deployment, no `db push`, no
`migrate reset`, no reseed. The locked baseline commit is `46942aa`.

## Verification gates (all green this session)

- `npm run typecheck` — shared + api + web pass.
- `npm run lint` — api + web pass (eslint clean).
- `npm run build` — shared, api, web pass.
- `npm run test:api` — 44 files, **390 passed / 5 skipped** (the 5 skipped are the gated live
  e2e suites; +45 vs Phase 10B's 345).
- `npm run test:web` — 17 files, **124 passed** (+15 vs Phase 10B's 109).
- `npx prisma validate` — schema valid (non-destructive).
- `npx prisma migrate status` — **Database schema is up to date!** (6 migrations applied).

## Delivered checklist

### C1 — Data model & migration (media references live next to their entities)

1. `ProductImage` gains `providerPublicId String?` + `resourceType String?` (only the public
   URL is client-facing; the storage pair-key is internal).
2. `Category` gains `imagePublicId String?` + `imageResourceType String?` (next to the
   existing `imageUrl`).
3. One non-destructive migration, `20261001020000_phase10c_public_catalog_media`
   (`--create-only` → `prisma migrate deploy`): **exactly 4 `ADD COLUMN`, no drops**,
   nothing else in the migration set (status clean, 6 migrations). `prisma generate` ran
   afterwards.

### C2 — Media storage abstraction (`apps/api/src/modules/media`)

4. `MediaStorageProvider` interface with `uploadPublicImage({ buffer, folder, publicId })`
   and `deletePublicImage(publicId)`; return `StoredPublicImage { secureUrl, publicId,
resourceType }`. `MAX_PUBLIC_IMAGE_BYTES = 5 MB` lives on the interface module.
5. `CloudinaryMediaStorageProvider` — `cloudinary.uploader.upload_stream` with
   `resource_type: 'image'`, folder `hungry-box/catalog/products/<productId>` /
   `hungry-box/catalog/categories/<categoryId>`, `public_id` from `crypto.randomUUID()`;
   the stored `secureUrl` is generated with `cloudinary.url(public_id, { secure: true, ...
TRANSFORM_OPTIONS })` where `TRANSFORM_OPTIONS = { width: 800, crop: 'limit', f_auto:
true, q_auto: true }`.
6. `UnavailableMediaStorageProvider` — throws `ServiceUnavailableException` on both
   operations (never a boot blocker).
7. `MediaModule` exports the `MEDIA_STORAGE_PROVIDER` symbol via a factory
   `resolveMediaStorageProvider(config)`: Cloudinary when
   `CLOUDINARY_CLOUD_NAME/API_KEY/API_SECRET` are all set, otherwise the unavailable
   provider. `resolveMediaStorageProvider` is a pure function, unit-tested directly without
   a Nest container. Imported by both `ProductsModule` and `CategoriesModule`.

### C3 — Server-side image validation (magic bytes, never mimetype trust)

8. `public-image-validator.ts` detects real content from bytes: JPEG `FF D8 FF`, PNG
   signature, WebP `RIFF`/`WEBP`. `BadRequestException` on missing/empty buffer, > 5 MB, or
   unsupported type ("Unsupported image type. Allowed: JPEG, PNG, WebP"). SVG and any
   non-image payload are rejected by construction.

### C4 — Products API (SUPER_ADMIN only)

9. `POST /products/:id/images` — multipart `file` (FileInterceptor, size cap
   `MAX_PUBLIC_IMAGE_BYTES`) + optional `altText`. Upload → then an **explicit `FOR UPDATE`
   row lock** on the product: count ≥ 3 → `BadRequestException`; first image is
   `isPrimary: true`. New audit kinds `PRODUCT_IMAGE_UPLOADED`.
10. `PATCH /products/images/reorder` — `ReorderProductImagesDto { orderedImageIds }`
    (`@IsArray/ArrayNotEmpty/ArrayUnique/IsString each`; shared `ReorderProductImagesInput`).
    Service rejects a set mixing products or omitting any image, rewrites `sortOrder`, and
    normalizes back to **exactly one primary** (first in the list) when needed. Audits
    `PRODUCT_IMAGES_REORDERED`.
11. `PATCH /products/images/:imageId/primary` — clears the old primary then sets the chosen
    one (`updateMany` + `update`). Audits `PRODUCT_IMAGE_PRIMARY_CHANGED`.
12. `DELETE /products/images/:imageId` — deletes the row, promotes the lowest `sortOrder`
    image to primary when the removed one was primary, then best-effort deletes the remote
    asset. Audits `PRODUCT_IMAGE_REMOVED`.
13. Orphan protection: if the DB write fails after a successful upload, the fresh asset is
    deleted best-effort so no dangling object is billed; a cleanup that itself fails becomes
    a `SYSTEM`-actor `MEDIA_CLEANUP_FAILED` audit, never a request error.
14. Old `CreateProductImageInput`/`UpdateProductImageInput` shared contracts and their
    `create-product-image.dto`/`update-product-image.dto` files are deleted (the new flow is
    upload-and-persist, not additive JSON editing).

### C5 — Categories API (SUPER_ADMIN only)

15. `POST /categories/:id/image` — upload/replace: persists the new asset, then best-effort
    deletes the previous asset (audit `CATEGORY_IMAGE_UPLOADED` or
    `CATEGORY_IMAGE_REPLACED` based on whether one existed).
16. `DELETE /categories/:id/image` — clears `imageUrl`/`imagePublicId`/`imageResourceType`,
    deletes the asset best-effort. Audits `CATEGORY_IMAGE_REMOVED`; 404 when the category is
    missing, 400 when it never had an image.

### C6 — Shared contracts

17. `ReorderProductImagesInput { orderedImageIds: string[] }` added; obsolete product-image
    create/update inputs removed; `CategoryDto.imageUrl` stays the single public image field
    (no storage internals leak into the contract). Shared dist rebuilt, consumed type-only.

### C7 — Frontend: admin catalogue

18. `client.ts` — `uploadRequest<T>(path, form: FormData, token)` (multipart POST, no manual
    `Content-Type`); productsApi gains `uploadImage(id, file, altText, token)`,
    `setPrimaryImage(imageId, token)`, `reorderImages(input, token)`, `removeImage(imageId,
token)`; categoriesApi gains `uploadImage(id, file, token)`, `removeImage(id, token)`.
19. `AdminCataloguePage` — product image manager per product (upload with client-side
    validation, "Make primary", Move up/down, Remove, alt text, live `n of 3` counter),
    enforced by the same `MAX_PRODUCT_IMAGES = 3` / 5 MB / JPEG-PNG-WebP rules as the server;
    and a category image section inside the category edit modal plus row thumbnails.
20. `CategoryChips` (storefront) — small rounded thumbnail next to the category name when an
    image exists.

### C8 — Tests

21. **API (+45 → 390):** new `media/` module specs (validator magic bytes, allowed/denied
    types, size, empty; provider specs; `resolveMediaStorageProvider` selection), extended
    `products.service.spec` (upload happy-path + max-3 + primary auto-set + orphan cleanup,
    set-primary, reorder incl. set-mismatch/partial-list/normalization, remove +
    promotion + best-effort delete), extended `categories.service.spec` (first upload,
    replace-deletes-old-only, remove, no-image 400, DB-failure orphan cleanup), and new
    `catalog-media-rbac.spec.ts` proving every media endpoint is SUPER_ADMIN-only.
22. **Web (+15 → 124):** new `catalogue-media.test.tsx` (12 tests) covering upload happy path
    - alt text, oversized/type rejection, max-3 UI lockout, primary/reorder/remove flows,
      category upload-replace-remove, and row thumbnail; `manager-operations.test.tsx` gains a
      lock test proving a branch manager never sees global media controls; `storefront.test.tsx`
      gains 2 media tests (optimized primary image + letter fallback, cart item image).
23. Test-support notes: `userEvent.upload` filters by the input's `accept` attribute, so type
    validation tests use `userEvent.setup({ applyAccept: false })`; `<img alt="">` is
    presentational (no `img` role), so components under test are queried via `querySelector`.

## Multi-branch & architecture invariants preserved

- Storage folders are `hungry-box/catalog/{products,categories}/<id>` — **no branch/city
  literal anywhere**; cloud media is per-entity global catalog data, exactly like products
  and categories (ADR-025).
- Customers keep read-only access: the storefront only ever renders public `imageUrl`/alt
  values from the catalog; management routes are SUPER_ADMIN-only; branch managers have no
  media surface (lock-tested).
- The 3-image-per-product, primary, and reorder rules are server-enforced; the UI mirrors
  them for UX only.

## Security posture

- Server-side magic-byte validation blocks SVG/HTML/script disguises and binary bombs; the
  client-provided `mimetype` is never trusted.
- Cloudinary credentials are server-only: used in `ConfigService`, never a `VITE_*` var,
  never in a payload, never in an audit message or log.
- Audit events carry only ids and human messages (`MEDIA_CLEANUP_FAILED` uses the `SYSTEM`
  actor) — never binaries, URLs with secret-query params, or storage keys.
- External-asset deletion is always best-effort and non-blocking; the database stays the
  source of truth for what is displayed.
- No secrets introduced; `.env*` unchanged (only `.env.example` documents the new
  placeholders with fake values).

## Files added / modified

Added:

- `apps/api/prisma/migrations/20261001020000_phase10c_public_catalog_media/`
- `apps/api/src/modules/media/` (interface, module, Cloudinary + unavailable providers,
  validator, specs)
- `apps/api/src/modules/products/dto/reorder-product-images.dto.ts`
- `apps/api/src/modules/catalog/catalog-media-rbac.spec.ts`
- `apps/web/src/pages/admin/catalogue-media.test.tsx`
- `packages/shared/dist/*` (rebuilt)

Deleted:

- `apps/api/src/modules/products/dto/create-product-image.dto.ts`
- `apps/api/src/modules/products/dto/update-product-image.dto.ts`

Modified (highlights):

- `apps/api/prisma/schema.prisma`, `products.service.ts`, `products.controller.ts`,
  `products.module.ts`, `categories.service.ts`, `categories.controller.ts`,
  `categories.module.ts`, category DTOs, `audit/audit.service.ts` (new AuditKinds),
  `catalog.service.spec.ts`.
- `apps/web/src/api/client.ts`, `AdminCataloguePage.tsx`,
  `features/storefront/components/CategoryChips.tsx`, `storefront.test.tsx`,
  `manager-operations.test.tsx`.
- `packages/shared/src/catalog.ts`, `apps/api/.env.example`,
  `apps/api/package.json` (+ `cloudinary@2.11.0`), root `package-lock.json`.
- `docs/architecture.md` (Phase 10C status), `docs/phase-10c-report.md` (this file).

## Architecture decision records (ADR-043..047)

**ADR-043 — Media storage is a provider abstraction behind a symbol, not a hard dependency.**
`MEDIA_STORAGE_PROVIDER` + `MediaStorageProvider` keep Cloudinary an implementation detail:
the module factory (`resolveMediaStorageProvider`) selects Cloudinary only when all three
creds are present, else an unavailable provider that 503s. The API boots and the storefront
works without media configured; adding/venting a provider later is an interface change, not
an app change.

**ADR-044 — Image validation is magic-byte based, size-capped server-side.** `mimetype`/`ext`
are attacker-influenceable; actual byte signatures (JPEG/PNG/WebP) gate everything, a 5 MB
cap bounds file memory, and SVG is deliberately excluded (script-bearing vector polyglots).
The same limits are mirrored client-side only as UX.

**ADR-045 — Max-3 product images enforced with FOR UPDATE + transaction normalization.**
Concurrent uploads must not exceed the cap, so the count check happens under an explicit
product row lock; primary is derived (first image auto-primary) and reordering/removal
normalize back to exactly one primary. Storage uniqueness on `providerPublicId` is not relied
on — `randomUUID()` public ids make duplicates practically impossible and the transaction is
the real guard.

**ADR-046 — Remote delete is always best-effort after the DB write, never before.**
The database remains the source of truth for what customers see: rows/columns are updated
first, then the cloud asset is deleted; a failed delete can never break a request — it
surfaces as a `SYSTEM` `MEDIA_CLEANUP_FAILED` audit (forensic, non-blocking). The reverse
orphan case (upload succeeded, DB write failed) also cleans up best-effort so nothing is
billed and forgotten.

**ADR-047 — Customers receive optimized secure URLs, never raw uploads or storage keys.**
`secureUrl` is built at upload time through `cloudinary.url(public_id, { secure: true,
width: 800, crop: 'limit', f_auto, q_auto })`, so the storefront gets a fast, responsive,
HTTPS delivery URL and no transformation knowledge; `providerPublicId`/`resourceType` are
server-internal and excluded from shared contracts and audit payloads.

## Guardrails honored

- No commits, no push, no deployment, no backup access, no destructive DB commands, no
  hard-coded credentials, no Cloudinary calls in automated tests (projected specs mock
  `uploadPublicImage`/`deletePublicImage` and the module fact test asserts selection logic
  only), no new Guntur logic, no schema logic leaked into the frontend, no secrets exposed.
  `.env*` untouched. Everything is left **uncommitted** for owner review.

## Final gate summary (re-run at end of session)

| Gate                    | Result                      |
| ----------------------- | --------------------------- |
| `prisma validate`       | pass                        |
| `prisma migrate status` | up to date, 6 migrations    |
| shared build / dist     | pass                        |
| api typecheck + lint    | pass                        |
| api tests               | 390 passed / 5 skipped      |
| web typecheck + lint    | pass                        |
| web tests               | 124 passed                  |
| full `npm run build`    | pass                        |
| git commits             | none (`46942aa` still HEAD) |

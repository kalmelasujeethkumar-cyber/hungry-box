# Phase 11D - Super Admin + Branch Manager production UX (delivered)

**Baseline:** `f8a2549` (Phase 11C - customer production experience)
**Scope:** Super Admin (`pages/admin`) + Branch Manager (`pages/manager`) and the shared components
they consume. No app-wide refactor, no file reorganisation, no Customer redesign, no Delivery Partner
redesign, no schema or backend change.

## Summary

Phase 11D finishes the shared-UI consistency pass for the Super Admin and Branch Manager dashboards.
It extracts reusable primitives (`AuditLogPanel`, `FilterChips`, extra `Button` variants), centralises
date formatting, replaces hand-rolled button/loading/status markup with the Phase 11B shared
components, and removes code proven to be unreferenced. Existing public media architecture, backend
RBAC, and branch isolation are untouched. Web tests: **195/195 passing**.

## Key changes

### Shared UI components

- Extended `Button` variants: `success`, `successOutline`, `dangerOutline`, `accentOutline` (used by KYC/partner review flows).
- Added `FilterChips<T>` reusable chip group with `aria-pressed` semantics and `undefined`-safe reset values.
- Added `AuditLogPanel` (`features/audit/AuditLogPanel.tsx`) that centralizes filters (actor/branch/action/date), CSV export, states, StatusBadge usage, and date formatting. `AdminAuditPage` and `ManagerAuditPage` are now thin role-specific wrappers.
- Added `formatPlacedAt()` in `lib/format.ts` for consistent date/time display across order lists.

### Admin + Manager refactors

- Orders: `AdminOrdersPage` and `ManagerOrdersPage` now use `FilterChips`, `LoadingState`, `Notice`, `StatusBadge`, shared payment labels, and `formatPlacedAt()`.
- Admin pages converted to shared components: `AdminBranchesPage`, `AdminManagersPage`, `AdminPartnersPage`, `AdminReportsPage`, `AdminCataloguePage` (view switch now uses `FilterChips`; minor edit-loading state standardized).
- Manager pages converted to shared components: `ManagerCatalogPage`, `ManagerOrderDetailPage`, `ManagerPartnerDetailPage`, `ManagerPartnersPage`, `ManagerAssignmentsPage`, `ManagerKycCard`, `ManagerHomePage` (quick links extracted to constants).
- Delivery realtime: split `RealtimeIndicator` into `RealtimePill(connected)` (when a caller already owns the socket) and `RealtimeIndicator()` (self-contained). `DeliveryTrackingSection` now uses `RealtimePill` to avoid double connections.

### Dead code removal (verified)

- Removed files: `layouts/RoleHomeShell.tsx` (zero references), and customer shim
  `pages/customer/OrdersPage.tsx` (re-export only; `AppRoutes.tsx` now imports `OrderHistoryPage`
  and `OrdersProfilePage` directly, and both were verified to exist and export the expected names).
- Removed unused web exports, each verified to have **zero** references across all 407 TS/TSX files
  in `apps/` and `packages/`: `notificationsApi` (`api/client.ts`), `MinusIcon`
  (`features/storefront/components/icons.tsx`), `findCartItem` (`features/storefront/cart-context.tsx`),
  `OrderStatusStep` (web-side duplicate in `features/orders/order-status.ts`),
  `managerStatusLabel`/`managerStatusTone`/`productStatusLabel`/`productStatusTone`
  (`components/status.ts`), `KYC_OVERALL_CHIP_CLASSES` (`features/delivery/delivery-status.ts`), and
  `statusBadgeClass` (`features/delivery/AssignmentCard.tsx`).
- Cleaned up the imports those removals orphaned (`NotificationDto`, `CartItemDto`, `badgeToneClass`).
- `.gitkeep` placeholders were **kept** (an earlier pass had deleted them; restored as unrelated churn).
- `packages/shared` retains its `OrderStatusStep` type: it is the published contract surface, and
  `packages/shared` is still type-only in this phase, so the web-side duplicate could not be
  consolidated into a shared runtime value without first adding the shared ESM build step.

### Tests

- Added `FilterChips.test.tsx` and extended `Button.test.tsx` to cover the new variants.
- Updated `delivery-tracking.test.tsx` mock to preserve the real `RealtimePill` via `importOriginal`
  (the previous whole-module mock left the new export undefined).
- `states.test.tsx` retains all three `ErrorState` tests (see Notes).
- Full web test suite: **195/195 passed (31 files)**.

### Routing

- `AppRoutes.tsx` updated to import `OrderHistoryPage` and `ProfilePage` directly (no shim dependency). Shim file deleted.

## Verification

- `npm run typecheck --workspace @hungrybox/web` — clean
- `npm run lint --workspace @hungrybox/web` — clean
- `npm run test:web` — **195 passed (31 files)**
- `npm run build:web` — succeeded in ~1s; pre-existing Vite large-chunk warning remains
  (`index.js` ~980 kB / ~273 kB gzip)
- API suite re-verified earlier in the phase: 449 passed, 5 skipped (no API files changed)
- Scope-limited scan for raw `<button>` in Admin/Manager: only pre-existing complex widgets remain
  (catalogue media/action groups). Layout primitives consistently use `Button`.

## Notes

- `ErrorState` was reviewed and **retained**. It is a Phase 11B foundation component (Notice +
  title + technical detail + retry) with dedicated tests. During this phase it was initially
  removed as unreferenced, but the Admin/Manager error paths use inline `Notice` banners (correct,
  because partial content is still rendered) and `EmptyState` for not-found (correct for
  `ManagerPartnerDetailPage`). There is therefore no semantically correct Admin/Manager site to move
  it into, so the component and its 3 tests are preserved rather than forced into an incorrect usage
  or deleted. Only the missing final newline was corrected.
- `StatusBadge`-based tone helpers replaced dead raw-class helpers; no visual regressions.
- README contains pre-existing UTF-8 mojibake in a legacy tree diagram (lines 47-58) and in three
  older phase bullets; left unchanged to avoid unrelated churn in this commit.
- Delivery Partner **pages** were not redesigned. Only shared leaf files were touched, and only where
  the change was required by Manager/Admin usage or was verified dead code.
- `ConfirmDialog` relocation and app-wide file reorganisation remain deferred.

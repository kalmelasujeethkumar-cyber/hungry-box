# Guest commerce — architecture assessment (Phase 13A preparation)

**Status: assessment only. Nothing in Phase 13A is implemented, and nothing here is a
committed design.** This document records what the current code would and would not tolerate,
so that a later phase can be planned against facts rather than assumptions.

It was produced by reading the schema, the guards and the customer services. Where it claims
something is load-bearing, that is because the code refuses to proceed without it — not
because a convention says so.

Scope limits agreed for this work, and honoured here:

- No Customer authentication is removed or weakened. `RequireAuth` + `RequireRole(['CUSTOMER'])`
  still guards every `/customer/*` route, and `JwtAuthGuard` is still the API's entry gate.
- No schema or migration is written. Every change described below is a *proposal* requiring a
  migration when — and only when — the phase is authorised.
- No Customer visual design is decided. The design lock in `architecture.md` §17 still holds.

---

## 1. What guest commerce actually requires

Guest commerce means: browse, build a cart, check out, and track an order **without a
`User` row**. That is narrower than it looks, and the existing system is already about halfway
to being able to do it, for a reason worth stating first.

### 1.1 The good news: the order already owns its address

`OrderAddress` is a **denormalised snapshot** stored on the order (`orderId` unique,
`onDelete: Cascade`), not a reference to a customer's saved address:

```
model OrderAddress {
  orderId   String @unique
  order     Order  @relation(...)
  recipientName, phone, houseFlat, streetArea, landmark, city, state, postalCode,
  latitude?, longitude?, deliveryInstructions?
}
```

A guest order needs no address *model* change at all — the delivery address a guest types at
checkout lands in exactly the same place a signed-in customer's does. This is the single most
important fact in this document: the checkout-critical piece of the data model is already
guest-shaped, and any plan that proposes a new guest address table is proposing something the
schema does not need.

### 1.2 The blocker: identity is a required foreign key

Four models require a `User` row and will not accept a guest:

| Model | Column | Current rule | Guest consequence |
| --- | --- | --- | --- |
| `Order` | `customerId String` | required, `@relation` to `User`, no `onDelete` | cannot record a guest order |
| `Payment` | `customerId String` | required, `@relation` to `User` | cannot record a guest payment |
| `Cart` | `customerId String` | required, `@@unique([customerId, branchId])` | no guest cart, and the uniqueness rule is written in terms of a user id |
| `Address` | `customerId String` | required, `onDelete: Cascade` | no saved guest addresses (acceptable — see §3.3) |

`IdempotencyKey.customerId` is also required, and `Notification.recipientUserId` is required
with `onDelete: Cascade`.

Note the two different `onDelete` stories already present in the schema: `Address` and
`Notification` cascade from `User`, while `Order` and `Payment` do not. That asymmetry is
deliberate — it is what stops an account deletion from silently destroying order and payment
history. **Any guest-identity design must preserve that asymmetry.** Making `Order.customerId`
nullable is safe; making it cascade-able is not.

### 1.3 The second blocker: the customer domain is written against a *user row*

`orders.service.ts` is representative and is the pattern the rest of the customer domain
follows:

```ts
async myOrders(customerId: string, status?: OrderStatus) {
  await requireActiveUser(db, customerId);
  return db.order.findMany({ where: { customerId, ... } });
}
async myOrder(customerId: string, orderId: string) { /* requireOwnedDetail(...) */ }
async create(customerId: string, dto: CreateOrderDto) {
  await requireActiveUser(db, customerId);
  const replay = await db.idempotencyKey.findUnique({ where: { key: dto.idempotencyKey } });
  if (replay) {
    if (replay.customerId !== customerId || !replay.orderId) {
      throw new BadRequestException('Idempotency key is already in use');
    }
    return this.myOrder(customerId, replay.orderId);
  }
  const verification = await this.payments.requireFinalVerification(dto.paymentId, customerId);
  ...
}
```

Note the idempotency replay already re-checks `replay.customerId !== customerId` rather than
trusting the key — that is the behaviour a guest principal must keep, and under Option B it
gains a second legitimate owner kind to reject.

`requireActiveUser` (`common/utils/active-user.ts`) is a single shared helper that loads the
`User` and throws unless `status === ACTIVE`. It is called from exactly four services, at
**19 call sites**:

| Service | Call sites |
| --- | --- |
| `orders.service.ts` | 5 |
| `addresses.service.ts` | 6 |
| `cart.service.ts` | 5 |
| `checkout-validation.service.ts` | 1 |

Notably `checkout.service.ts` and `payments.service.ts` do **not** call it — they receive
`customerId` and pass it along. So the coupling is not uniform: order, address, cart and
checkout-*validation* demand a live user row, while payment-intent creation and the dev
simulator do not.

Ownership, separately, is enforced by `where: { customerId }` in the queries and by
`requireOwnedDetail(db, customerId, orderId)` on reads. `checkout.controller.ts` passes
`user.sub` straight through from the JWT.

The practical consequence: the customer domain is written against a *principal* that is always
a `User` row, and the demand is concentrated in one small helper plus the ownership predicates.
Guest commerce is therefore a change to **what a principal may be**, expressed in one
consistent way, rather than a scattering of null checks — but the "consistency" is the hard
part, and the four services above are the places to get wrong.

## 2. The one decision everything else depends on

There is a single architectural choice to make first, and the rest of the work follows from it.

> **Is a guest a distinct kind of principal, or is a guest an anonymous `User` row?**

**Option A — a real guest `User` row** (`role: CUSTOMER`, no usable credential, random
unusable password, `status: ACTIVE`).

- Cheapest by a wide margin. `Order.customerId`, `Payment.customerId`, `Cart.customerId`,
  `Address.customerId` and `IdempotencyKey.customerId` all keep their current shape, so this
  is **zero migrations**. `requireActiveUser` keeps working. Every `where: { customerId }`
  ownership check keeps working unchanged. `CheckoutController` keeps reading `user.sub`.
- A guest session is an ordinary session token whose `sub` points at that row.
- Cost: an unverified `User` row per visitor who reaches checkout. That is a real row per
  guest, which is the thing a database is actually for, but it does mean identity rows
  without verified identities. It also means "sign in" for a returning guest has to be an
  explicit attach/claim step, and "never verified" must be representable in the `User` model
  without lying about the email.
- The risk to manage is the obvious one: a guest row must never be able to become a
  credential-bearing account without an explicit verification, and
  `auth.service.ts` must not treat "row exists" as "may sign in".

**Option B — a separate guest identity** (nullable `customerId`, plus a guest session/token
table, e.g. `GuestSession`).

- Semantically honest: no fake users, and a guest order can express "this was never claimed"
  in the data itself.
- Requires a migration making at least `Order.customerId` and `Payment.customerId` nullable,
  and `Cart`/`IdempotencyKey` need a new owner key. `@@unique([customerId, branchId])` has to
  be reworked because a nullable column cannot carry the uniqueness guarantee the way it
  does now.
- Every `where: { customerId }` ownership check becomes a dual-path check ("owned by this user
  **or** by this guest session"). `requireActiveUser` gains a guest sibling. This is the
  option that actually touches the security model, which is exactly why it needs to be a
  deliberate decision rather than a consequence of starting the work.
- Higher risk of an IDOR regression in exactly the places this project has already had to be
  careful: `addresses.service.ts` (foreign ids are 404 today) and `requireOwnedDetail`.

**Assessment: Option A is the better fit for this codebase, and the deciding factor is that
it needs no migration and leaves every existing ownership check intact.** Option B is more
honest data modelling and is the right answer eventually if guest volume or claim-merge
requirements justify it, but it converts a data problem into a security-model change. Under the
project rule that performance and scope work must not quietly introduce a schema migration,
Option A is also the only one that could be delivered without stopping to report.

**This is a recommendation, not a decision.** It needs explicit approval, because it commits
the project to "identity rows without verified identities" as a permanent modelling choice.

## 3. What each flow would need

### 3.1 Browsing — the easy part

`catalog.service.ts` is not customer-scoped: `listProducts(query)`, `getProductDetail(productId,
branchId)` and `listCategories(branchId?)` take no customer identity at all, and the only
`requireActiveUser`-free branch check is `assertActiveBranch(branchId)`. A guest can already
browse the storefront for a branch. The work here is entirely frontend: the
`CustomerLayout` providers and `RequireAuth`/`RequireRole` currently redirect a signed-out
visitor to `/login`, so making browsing public means widening the guard on `storefront` only
and deciding what an anonymous visitor sees in the header and cart affordances. This is a
**visual decision**, and it is therefore blocked behind the design lock, not behind
engineering.

### 3.2 Cart — needs a decision, not just a schema change

`Cart` is `@@unique([customerId, branchId])`: one cart per customer per branch, with server
derived totals. Under Option A a guest simply has a `customerId` like anyone else and the
existing shape works. Under Option B the uniqueness constraint must be re-expressed over
"owner" rather than "customer".

`AGENTS.md` invariant 3 (radius from `branch.delivery_radius_km`) and the Haversine
serviceability contract are untouched by either option and must stay untouched.

### 3.3 Addresses — deliberately not needed for guests

`Address` is customer-owned CRUD with at most one default. A guest does not need saved
addresses to check out, because `OrderAddress` snapshots whatever they typed. `architecture.md`
§17 already lists a guest address architecture as future work; this assessment's position is
that **guest checkout does not require it**, and it should not be bundled into a first guest
phase. The frontend simply stops sending an `addressId` for a guest and supplies the fields
directly.

### 3.4 Checkout and payments — the sensitive part

`checkout.service.preview(customerId, addressId)` is address-id-based, and
`checkout-validation.service.ts` is where `requireActiveUser` is enforced for the checkout
preview. `payments.service.ts` verifies ownership in its own right —
`verifyPayment(paymentId, customerId)` and `requireFinalVerification(...)`.

Under Option A these keep working as-is for a guest principal, but the **dev payment simulator
and cash-on-delivery flow must be reviewed for whether a guest principal is acceptable to them
at all**, and no real gateway exists yet (`PAYMENT_PROVIDER=dev` plus COD). A guest order paid
by COD is the most likely first shipping combination precisely because it needs no verified
payer identity — and that is a business and risk decision for the user, not an implementation
detail.

### 3.5 Order tracking — separate problem, do not merge it

`architecture.md` §17 lists "guest order tracking by order number/phone" as future work. It
is a **different** feature from guest checkout: it is about a customer who has already placed
an order and needs to see it without an account. It needs its own authorisation design (an
order number is a guessable-ish secret and must not be the only factor). It should not be
folded into a guest-commerce phase, and it must not be satisfied by simply loosening
`requireOwnedDetail`.

### 3.6 Notifications — will silently not fire for guests

`Notification.recipientUserId` is required with `onDelete: Cascade`. Under Option A a guest has
a real `User` id, so notifications work with no change. Under Option B, guest order updates
have nowhere to go, and the choice of "no notifications for guests" is a product decision that
has to be made explicitly rather than discovered later.

## 4. Security properties that must survive

These are the invariants from `architecture.md` §22 that a guest flow must not weaken, restated
because this is where the risk is:

1. **Branch scoping is unaffected.** A guest still orders into exactly one `branch_id`, with
   the radius and Haversine logic unchanged. Guest commerce must not become a way to address
   a branch a signed-in customer could not be served.
2. **Ownership stays server-side.** Guest access to an order must be proven per request from an
   unguessable credential, never from anything the client asserts. `requireOwnedDetail` is the
   thing to extend carefully.
3. **A guest credential must not be a login.** Under Option A specifically: no password, no
   password-reset path, no email-verification bypass that would let a claimed guest account
   become a real one. `auth.service.ts` login must not accept it.
4. **Order numbers and idempotency keys stay unguessable or scoped.** `IdempotencyKey.key` is
   the primary id; it must be at least as unguessable as today's customer-scoped key.
5. **Payments are still verified server-side.** A guest order changes who may pay, not whether
   the server verifies.
6. **Audit logging still applies.** `AuditEvent` has `branchId` and an actor; guest order
   creation must still be attributable.

## 5. Recommended sequencing, if the phase is authorised

1. Decide **Option A vs Option B** (§2). Nothing else should start before this.
2. Decide the **payment question** (§3.4) — whether a guest principal may transact at all, and
   under which methods.
3. Decide the **tracking question** (§3.5) separately; it is not implied by the first two.
4. Then, and only then: make `storefront` publicly reachable, add the guest principal, and
   extend the customer domain to accept it — smallest possible first slice, with the existing
   ownership tests as the regression net.
5. Guest order tracking as its own later change.

## 6. What this assessment did not do

- No code change, no migration, no DTO, no guard, no route.
- No decision. §2 and §3.4 are open questions for the user.
- No Customer visual direction. Browsing-guest and cart-guest both have a visual answer that
  this assessment deliberately does not supply.
- No claim that guest commerce is small. The frontend half of §3.1 and §3.2 is blocked on the
  design lock regardless of how clean the backend path looks.

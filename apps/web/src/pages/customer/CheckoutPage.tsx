import type { JSX } from 'react';
import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import type {
  AddressDto,
  CheckoutPreviewDto,
  PaymentIntentDto,
  PaymentMethod,
} from '@hungrybox/shared';
import { addressApi, ApiError, checkoutApi, ordersApi, paymentsApi } from '../../api/client';
import { useAuth } from '../../auth/auth-context';
import EmptyState from '../../components/EmptyState';
import ConfirmDialog from '../../features/storefront/components/ConfirmDialog';
import { CartIcon, LocationIcon } from '../../features/storefront/components/icons';
import { useCart } from '../../features/storefront/cart-context';
import { useStorefront } from '../../features/storefront/storefront-context';
import { formatPaise } from '../../lib/money';
import { PAYMENT_METHOD_LABELS } from '../../features/orders/order-status';

type PayPhase = 'idle' | 'creating-intent' | 'awaiting-simulation' | 'verifying' | 'placing';

export default function CheckoutPage(): JSX.Element {
  const navigate = useNavigate();
  const { token } = useAuth();
  const { branch } = useStorefront();
  const { hasItems, loading: cartLoading, clearCart } = useCart();

  const [addresses, setAddresses] = useState<AddressDto[]>([]);
  const [addressesLoading, setAddressesLoading] = useState(true);
  const [selectedAddressId, setSelectedAddressId] = useState<string | null>(null);

  const [preview, setPreview] = useState<CheckoutPreviewDto | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);

  const [method, setMethod] = useState<PaymentMethod | null>(null);
  const [payPhase, setPayPhase] = useState<PayPhase>('idle');
  const [payError, setPayError] = useState<string | null>(null);
  const [intent, setIntent] = useState<PaymentIntentDto | null>(null);
  const [simulating, setSimulating] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    setAddressesLoading(true);
    addressApi
      .list(token)
      .then((list) => {
        if (cancelled) return;
        setAddresses(list);
        const preferred = list.find((address) => address.isDefault) ?? list[0] ?? null;
        if (preferred) {
          setSelectedAddressId(preferred.id);
        }
      })
      .catch(() => {
        if (!cancelled) setPreviewError('Could not load your delivery addresses.');
      })
      .finally(() => {
        if (!cancelled) setAddressesLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  useEffect(() => {
    if (!token || !selectedAddressId) {
      setPreview(null);
      return;
    }
    let cancelled = false;
    setPreviewLoading(true);
    setPreviewError(null);
    setPayError(null);
    checkoutApi
      .preview(selectedAddressId, token)
      .then((result) => {
        if (!cancelled) setPreview(result);
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        if (error instanceof ApiError && error.details?.preview) {
          setPreview(error.details.preview as CheckoutPreviewDto);
        } else {
          setPreviewError(error instanceof Error ? error.message : 'Could not review your order.');
        }
      })
      .finally(() => {
        if (!cancelled) setPreviewLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [token, selectedAddressId]);

  useEffect(() => {
    const available = preview?.availablePaymentMethods ?? [];
    setMethod((current) =>
      current && available.includes(current) ? current : (available[0] ?? null),
    );
  }, [preview]);

  if (cartLoading) {
    return <p className="px-4 py-10 text-center text-sm text-slate-500">Loading your cart…</p>;
  }

  if (!branch) {
    return (
      <EmptyState
        icon={<LocationIcon className="h-8 w-8" />}
        title="Pick a delivery location first"
        message="Choose a serviceable address so we know which branch is preparing your order."
        action={
          <Link
            to="/customer/storefront"
            className="rounded-lg bg-brand-orange px-4 py-2.5 text-sm font-bold text-white"
          >
            Back to the menu
          </Link>
        }
      />
    );
  }

  if (!hasItems) {
    return (
      <EmptyState
        icon={<CartIcon className="h-8 w-8" />}
        title="Nothing to check out"
        message="Your cart is empty. Add items from the menu first."
        action={
          <Link
            to="/customer/storefront"
            className="rounded-lg bg-brand-orange px-4 py-2.5 text-sm font-bold text-white"
          >
            Browse the menu
          </Link>
        }
      />
    );
  }

  if (addressesLoading) {
    return <p className="px-4 py-10 text-center text-sm text-slate-500">Loading addresses…</p>;
  }

  if (addresses.length === 0) {
    return (
      <EmptyState
        icon={<LocationIcon className="h-8 w-8" />}
        title="Add a delivery address"
        message="You need at least one saved address with your location to place an order."
        action={
          <Link
            to="/customer/addresses"
            className="rounded-lg bg-brand-orange px-4 py-2.5 text-sm font-bold text-white"
          >
            Manage addresses
          </Link>
        }
      />
    );
  }

  const blockIssues = preview && preview.status !== 'ok' ? preview.issues : [];

  const startPayment = (): void => {
    setPayError(null);
    setPayPhase('creating-intent');
    checkoutApi
      .paymentIntent({ addressId: selectedAddressId!, method: method ?? 'UPI' }, token!)
      .then((created) => {
        setIntent(created);
        if (created.provider === 'dev') {
          setPayPhase('awaiting-simulation');
          return;
        }
        setPayError(
          `Online payment via ${created.provider} is not available in this branch yet. Choose Cash on delivery instead.`,
        );
        setPayPhase('idle');
      })
      .catch((error: unknown) => {
        setPayPhase('idle');
        if (error instanceof ApiError && error.details?.preview) {
          setPreview(error.details.preview as CheckoutPreviewDto);
          setPayError(error.message);
        } else {
          setPayError(error instanceof Error ? error.message : 'Could not start your payment.');
        }
      });
  };

  const verifyThenPlace = (paymentId: string): void => {
    setPayPhase('verifying');
    paymentsApi
      .verify({ paymentId }, token!)
      .then((result) => {
        if (!result.verified) {
          setPayError(result.failureReason ?? 'The payment did not go through.');
          setPayPhase('idle');
          return;
        }
        placeOrder(paymentId);
      })
      .catch((error: unknown) => {
        setPayError(error instanceof Error ? error.message : 'Payment verification failed.');
        setPayPhase('idle');
      });
  };

  const placeOrder = (paymentId: string): void => {
    if (payPhase === 'placing') return;
    setPayPhase('placing');
    ordersApi
      .create(
        {
          paymentId,
          idempotencyKey: crypto.randomUUID(),
          addressId: selectedAddressId!,
        },
        token!,
      )
      .then(async (order) => {
        try {
          await clearCart();
        } catch {
          // Cart refresh is cosmetic; the server already removed it.
        }
        navigate(`/customer/checkout/success/${order.id}`);
      })
      .catch((error: unknown) => {
        setPayPhase('idle');
        if (error instanceof ApiError && error.details?.preview) {
          setPreview(error.details.preview as CheckoutPreviewDto);
          setPayError(error.message);
        } else {
          setPayError(error instanceof Error ? error.message : 'Your order could not be placed.');
        }
      });
  };

  const placeCodOrder = (): void => {
    if (payPhase === 'placing') return;
    setPayPhase('placing');
    ordersApi
      .createCod(
        { idempotencyKey: crypto.randomUUID(), addressId: selectedAddressId! },
        token!,
      )
      .then(async (order) => {
        try {
          await clearCart();
        } catch {
          // Cart refresh is cosmetic; the server already removed it.
        }
        navigate(`/customer/checkout/success/${order.id}`);
      })
      .catch((error: unknown) => {
        setPayPhase('idle');
        if (error instanceof ApiError && error.details?.preview) {
          setPreview(error.details.preview as CheckoutPreviewDto);
          setPayError(error.message);
        } else {
          setPayError(error instanceof Error ? error.message : 'Your order could not be placed.');
        }
      });
  };

  const handlePayClick = (): void => {
    if (preview?.needsConfirmation) {
      setConfirmOpen(true);
      return;
    }
    if (method === 'COD') {
      placeCodOrder();
      return;
    }
    startPayment();
  };

  const simulatePayment = (outcome: 'success' | 'failure'): void => {
    if (!intent) return;
    setSimulating(true);
    setPayPhase('verifying');
    paymentsApi
      .devSimulate({ providerPaymentId: intent.providerPaymentId, outcome }, token!)
      .then(() => verifyThenPlace(intent.paymentId))
      .catch((error: unknown) => {
        setPayError(error instanceof Error ? error.message : 'Payment simulation failed.');
        setPayPhase('idle');
      })
      .finally(() => setSimulating(false));
  };

  const payButtonLabel = (): string => {
    if (method === 'COD') {
      if (payPhase === 'placing') return 'Placing your order…';
      return `Place order · Pay ${formatPaise(preview?.totalMinor ?? 0)} on delivery`;
    }
    if (payPhase === 'creating-intent') return 'Starting payment…';
    if (payPhase === 'awaiting-simulation') return 'Waiting for payment…';
    if (payPhase === 'verifying') return 'Verifying payment…';
    if (payPhase === 'placing') return 'Placing your order…';
    return `Pay ${formatPaise(preview?.totalMinor ?? 0)}`;
  };

  return (
    <section className="mx-auto max-w-2xl space-y-4">
      <header>
        <h1 className="text-xl font-extrabold tracking-tight text-brand-navy">Checkout</h1>
        <p className="mt-1 text-sm text-slate-500">
          Order from {preview?.branch.name ?? branch.name}. Final prices are confirmed by the
          branch, never by the page.
        </p>
      </header>

      {previewError ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {previewError}
        </div>
      ) : null}

      <div className="space-y-4">
        <section className="rounded-2xl border border-slate-200 bg-white p-4">
          <h2 className="text-sm font-bold uppercase tracking-wide text-slate-500">Deliver to</h2>
          <div className="mt-3 space-y-2">
            {addresses.map((address) => {
              const active = address.id === selectedAddressId;
              return (
                <label
                  key={address.id}
                  className={`flex cursor-pointer gap-3 rounded-xl border p-3 ${
                    active ? 'border-brand-teal bg-brand-sky/40' : 'border-slate-200'
                  }`}
                >
                  <input
                    type="radio"
                    name="checkout-address"
                    value={address.id}
                    checked={active}
                    onChange={() => {
                      setSelectedAddressId(address.id);
                      setPayError(null);
                    }}
                    className="mt-1 accent-brand-teal"
                  />
                  <span className="min-w-0">
                    <span className="block text-sm font-bold text-slate-800">
                      {address.label ?? 'Address'}
                    </span>
                    <span className="block truncate text-xs text-slate-500">
                      {address.houseFlat}, {address.streetArea}
                      {address.landmark ? `, ${address.landmark}` : ''} · {address.city}
                    </span>
                  </span>
                </label>
              );
            })}
            <Link
              to="/customer/addresses"
              className="inline-block text-sm font-semibold text-brand-teal"
            >
              Manage addresses
            </Link>
          </div>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-4">
          <h2 className="text-sm font-bold uppercase tracking-wide text-slate-500">Your items</h2>
          {previewLoading ? (
            <p className="px-2 py-6 text-center text-sm text-slate-500">Reviewing your cart…</p>
          ) : (
            <ul className="mt-3 divide-y divide-slate-100">
              {(preview?.items ?? []).map((item) => (
                <li
                  key={item.branchProductId}
                  className="flex items-center justify-between gap-3 py-2.5"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-semibold text-slate-800">
                      {item.productName}
                    </span>
                    <span className="text-xs text-slate-500">Qty {item.quantity}</span>
                  </span>
                  <span className="text-sm font-bold text-slate-900">
                    {formatPaise(item.lineTotalMinor)}
                  </span>
                </li>
              ))}
              {!previewLoading && !preview ? (
                <li className="py-6 text-center text-sm text-slate-500">
                  Select an address to review your order.
                </li>
              ) : null}
            </ul>
          )}
        </section>

        {blockIssues.length > 0 ? (
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
            <p className="text-sm font-bold text-amber-800">A few things to fix before ordering</p>
            <ul className="mt-1 list-inside list-disc space-y-0.5 text-sm text-amber-800">
              {blockIssues.map((issue) => (
                <li key={issue}>{issue}</li>
              ))}
            </ul>
          </div>
        ) : null}

        <section className="rounded-2xl border border-slate-200 bg-white p-4">
          <h2 className="text-sm font-bold uppercase tracking-wide text-slate-500">
            Payment method
          </h2>
          {preview ? (
            <div className="mt-3 grid grid-cols-2 gap-2">
              {preview.availablePaymentMethods.map((option) => (
                <label
                  key={option}
                  className={`flex items-center gap-2 rounded-xl border p-3 text-sm font-semibold ${
                    method === option
                      ? 'border-brand-teal bg-brand-sky/40 text-brand-navy'
                      : 'border-slate-200 text-slate-700'
                  }`}
                >
                  <input
                    type="radio"
                    name="payment-method"
                    value={option}
                    checked={method === option}
                    onChange={() => {
                      setMethod(option);
                      setPayError(null);
                    }}
                    className="accent-brand-teal"
                  />
                  {PAYMENT_METHOD_LABELS[option]}
                </label>
              ))}
            </div>
          ) : null}
          <dl className="mt-4 space-y-1 text-sm">
            <div className="flex justify-between text-slate-600">
              <dt>Item total</dt>
              <dd>{formatPaise(preview?.subtotalMinor ?? 0)}</dd>
            </div>
            {preview && preview.discountMinor > 0 ? (
              <div className="flex justify-between text-brand-teal">
                <dt>Discounts</dt>
                <dd>−{formatPaise(preview.discountMinor)}</dd>
              </div>
            ) : null}
            <div className="flex justify-between text-slate-600">
              <dt>Delivery fee</dt>
              <dd>{formatPaise(preview?.deliveryFeeMinor ?? 0)}</dd>
            </div>
            {preview && preview.taxMinor > 0 ? (
              <div className="flex justify-between text-slate-600">
                <dt>Taxes</dt>
                <dd>{formatPaise(preview.taxMinor)}</dd>
              </div>
            ) : null}
            <div className="flex justify-between pt-1 text-base font-extrabold text-slate-900">
              <dt>To pay</dt>
              <dd>{formatPaise(preview?.totalMinor ?? 0)}</dd>
            </div>
          </dl>
        </section>

        {intent && intent.provider === 'dev' && payPhase === 'awaiting-simulation' ? (
          <div className="rounded-2xl border border-brand-sky bg-brand-sky/30 p-4">
            <p className="text-sm font-bold text-brand-navy">Online payment test</p>
            <p className="mt-1 text-xs leading-relaxed text-slate-600">
              Hungry Box is still accepting card, wallet and UPI payments through a test gateway in
              this environment — no account is charged here. Approve the test payment to place the
              order, or decline it to see how a failed payment is handled.
            </p>
            <div className="mt-3 flex gap-2">
              <button
                type="button"
                onClick={() => simulatePayment('success')}
                disabled={simulating}
                className="flex-1 rounded-lg bg-brand-teal px-4 py-2.5 text-sm font-bold text-white hover:bg-brand-teal/90 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Approve test payment
              </button>
              <button
                type="button"
                onClick={() => simulatePayment('failure')}
                disabled={simulating}
                className="flex-1 rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-bold text-slate-600 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Decline test payment
              </button>
            </div>
          </div>
        ) : null}

        {payError ? (
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {payError}
          </div>
        ) : null}

        <button
          type="button"
          onClick={handlePayClick}
          disabled={payPhase !== 'idle' || previewLoading || blockIssues.length > 0 || !method}
          className="w-full rounded-xl bg-brand-orange px-4 py-3.5 text-base font-bold text-white shadow-sm hover:bg-brand-orange/90 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {payButtonLabel()}
        </button>
        <p className="text-center text-xs text-slate-400">
          {method === 'COD'
            ? 'Cash on delivery — nothing is charged up front. Pay the delivery partner when your order arrives.'
            : 'Online payments run on a test gateway in this environment — no card, wallet or bank is charged. Cash on delivery is fully available.'}
        </p>
      </div>

      <ConfirmDialog
        open={confirmOpen}
        title="Prices changed"
        description={
          'Some item prices changed since you added them to the cart. Review the totals above; ordering now uses the updated prices shown.'
        }
        confirmLabel={method === 'COD' ? 'Place order' : 'Pay updated total'}
        onConfirm={() => {
          setConfirmOpen(false);
          if (method === 'COD') {
            placeCodOrder();
          } else {
            startPayment();
          }
        }}
        onClose={() => setConfirmOpen(false)}
      />
    </section>
  );
}

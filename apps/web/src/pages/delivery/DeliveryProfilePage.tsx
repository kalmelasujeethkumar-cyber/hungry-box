import type { JSX } from 'react';
import { useEffect, useState } from 'react';
import type { DeliveryPartnerProfileDto } from '@hungrybox/shared';
import { deliveryPartnerApi } from '../../api/client';
import { useAuth } from '../../auth/auth-context';
import {
  DOCUMENT_STATUS_LABELS,
  DOCUMENT_TYPE_LABELS,
  PARTNER_STATUS_LABELS,
  PARTNER_TYPE_LABELS,
} from '../../features/delivery/delivery-status';
import PartnerKycCard from '../../features/delivery/PartnerKycCard';
import EmptyState from '../../features/storefront/components/EmptyState';
import { UserIcon } from '../../features/storefront/components/icons';
import { formatDateOnly } from '../../lib/format';

function Field({ label, value }: { label: string; value: string | null }): JSX.Element {
  return (
    <div>
      <dt className="text-xs font-semibold uppercase text-slate-500">{label}</dt>
      <dd className="mt-0.5 text-sm font-medium text-slate-800">{value ?? '—'}</dd>
    </div>
  );
}

export default function DeliveryProfilePage(): JSX.Element {
  const { token } = useAuth();
  const [profile, setProfile] = useState<DeliveryPartnerProfileDto | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    deliveryPartnerApi
      .profile(token)
      .then(setProfile)
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : 'Could not load your profile.');
      });
  }, [token]);

  if (error && !profile) {
    return (
      <EmptyState icon={<UserIcon className="h-8 w-8" />} title="Profile unavailable" message={error} />
    );
  }
  if (!profile) {
    return <p className="py-16 text-center text-sm text-slate-500">Loading profile…</p>;
  }

  const verifiedDocuments = profile.documents.filter((doc) => doc.status === 'VERIFIED').length;

  return (
    <section className="space-y-4">
      <header className="rounded-2xl bg-brand-navy p-5 text-white">
        <h1 className="text-xl font-extrabold tracking-tight">{profile.fullName}</h1>
        <p className="mt-1 text-xs text-brand-sky">
          {profile.partnerId} · {PARTNER_STATUS_LABELS[profile.status]}
        </p>
      </header>

      {profile.status !== 'ACTIVE' ? (
        <div className="rounded-xl bg-brand-yellow/20 px-4 py-3 text-sm text-slate-700">
          Your profile is {PARTNER_STATUS_LABELS[profile.status].toLowerCase()}. Your branch manager
          reviews your documents before you can go online.
        </div>
      ) : null}

      <PartnerKycCard />

      <section className="rounded-2xl border border-slate-200 bg-white p-4">
        <h2 className="text-sm font-bold uppercase tracking-wide text-slate-500">Personal</h2>
        <dl className="mt-3 grid gap-3 sm:grid-cols-2">
          <Field label="Mobile" value={profile.mobile} />
          <Field label="Email" value={profile.email} />
          <Field label="Date of birth" value={profile.dateOfBirth ? formatDateOnly(profile.dateOfBirth) : null} />
          <Field label="Gender" value={profile.gender} />
          <Field label="Emergency contact" value={profile.emergencyContactName ? `${profile.emergencyContactName} ${profile.emergencyContactPhone ?? ''}` : null} />
          <Field label="Partner type" value={profile.partnerType ? PARTNER_TYPE_LABELS[profile.partnerType] : null} />
          {profile.joinedAt ? <Field label="Joined" value={formatDateOnly(profile.joinedAt)} /> : null}
        </dl>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-4">
        <h2 className="text-sm font-bold uppercase tracking-wide text-slate-500">Vehicle</h2>
        <dl className="mt-3 grid gap-3 sm:grid-cols-2">
          <Field label="Type" value={profile.vehicleType} />
          <Field label="Registration" value={profile.vehicleNumber} />
          <Field label="Brand / model" value={[profile.vehicleBrand, profile.vehicleModel].filter(Boolean).join(' ') || null} />
          <Field label="Colour" value={profile.vehicleColour} />
        </dl>
      </section>

      {profile.drivingLicenceNumber ? (
        <section className="rounded-2xl border border-slate-200 bg-white p-4">
          <h2 className="text-sm font-bold uppercase tracking-wide text-slate-500">Driving licence</h2>
          <dl className="mt-3 grid gap-3 sm:grid-cols-2">
            <Field label="Number" value={profile.drivingLicenceNumber} />
            <Field label="Type" value={profile.licenceType} />
            <Field label="Expiry" value={profile.licenceExpiry ? formatDateOnly(profile.licenceExpiry) : null} />
            <Field label="Bank account" value={profile.accountNumberMasked} />
            <Field label="IFSC" value={profile.ifsc} />
            <Field label="Payout" value={profile.payoutVerified ? 'Verified' : 'Not verified'} />
          </dl>
        </section>
      ) : null}

      <section className="rounded-2xl border border-slate-200 bg-white p-4">
        <h2 className="text-sm font-bold uppercase tracking-wide text-slate-500">
          Documents · {verifiedDocuments}/{profile.documents.length} verified
        </h2>
        <ul className="mt-3 divide-y divide-slate-100">
          {profile.documents.map((doc) => (
            <li key={doc.id} className="flex items-center justify-between gap-3 py-2.5">
              <div>
                <p className="text-sm font-semibold text-slate-800">
                  {DOCUMENT_TYPE_LABELS[doc.type]}
                </p>
                {doc.documentReference ? (
                  <p className="text-xs text-slate-500">{doc.documentReference}</p>
                ) : null}
              </div>
              <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-600">
                {DOCUMENT_STATUS_LABELS[doc.status]}
              </span>
            </li>
          ))}
        </ul>
      </section>
    </section>
  );
}
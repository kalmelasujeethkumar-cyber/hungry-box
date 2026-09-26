import type { JSX } from 'react';
import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import type { DeliveryPartnerDocumentDto, DeliveryPartnerProfileDto } from '@hungrybox/shared';
import { branchDeliveryApi } from '../../api/client';
import { useAuth } from '../../auth/auth-context';
import {
  AVAILABILITY_LABELS,
  DOCUMENT_STATUS_LABELS,
  DOCUMENT_TYPE_LABELS,
  PARTNER_STATUS_LABELS,
  PARTNER_TYPE_LABELS,
  REQUIRED_VERIFICATION_DOCUMENTS,
} from '../../features/delivery/delivery-status';
import ConfirmDialog from '../../features/storefront/components/ConfirmDialog';
import EmptyState from '../../components/EmptyState';
import { Button } from '../../components/Button';
import { LoadingState } from '../../components/LoadingState';
import { Notice } from '../../components/Notice';
import { StatusBadge } from '../../components/StatusBadge';
import { UserIcon } from '../../features/storefront/components/icons';
import ManagerKycCard from '../../features/delivery/ManagerKycCard';
import { formatDateOnly } from '../../lib/format';
import ManagerLayout from './ManagerLayout';

function Field({ label, value }: { label: string; value: string | null }): JSX.Element {
  return (
    <div>
      <dt className="text-xs font-semibold uppercase text-slate-500">{label}</dt>
      <dd className="mt-0.5 text-sm font-medium text-slate-800">{value ?? '—'}</dd>
    </div>
  );
}

function verifyable(doc: DeliveryPartnerDocumentDto): boolean {
  return doc.status === 'PENDING' || doc.status === 'UPLOADED';
}

export default function ManagerPartnerDetailPage(): JSX.Element {
  const { partnerId } = useParams<{ partnerId: string }>();
  const { token } = useAuth();
  const [profile, setProfile] = useState<DeliveryPartnerProfileDto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [dialog, setDialog] = useState<{
    kind: 'reject-profile' | 'reject-doc';
    documentId?: string;
  } | null>(null);
  const [reason, setReason] = useState('');

  const refresh = useCallback(() => {
    if (!token || !partnerId) return;
    branchDeliveryApi
      .getPartner(partnerId, token)
      .then(setProfile)
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : 'Could not load the partner.');
      });
  }, [token, partnerId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const runVerify = (input: Parameters<typeof branchDeliveryApi.verifyPartner>[1]): void => {
    if (!token || !partnerId) return;
    setBusy(true);
    setError(null);
    branchDeliveryApi
      .verifyPartner(partnerId, input, token)
      .then(setProfile)
      .catch((err: unknown) => setError(err instanceof Error ? err.message : 'Action failed.'))
      .finally(() => setBusy(false));
  };

  const runSetStatus = (status: 'ACTIVE' | 'INACTIVE' | 'SUSPENDED'): void => {
    if (!token || !partnerId) return;
    setBusy(true);
    setError(null);
    branchDeliveryApi
      .setPartnerStatus(partnerId, { status }, token)
      .then(setProfile)
      .catch((err: unknown) => setError(err instanceof Error ? err.message : 'Action failed.'))
      .finally(() => setBusy(false));
  };

  const runReviewDoc = (documentId: string, action: 'APPROVE' | 'REJECT', note?: string): void => {
    if (!token || !partnerId) return;
    setBusy(true);
    setError(null);
    branchDeliveryApi
      .reviewPartnerDocument(partnerId, documentId, { action, note }, token)
      .then(setProfile)
      .catch((err: unknown) => setError(err instanceof Error ? err.message : 'Review failed.'))
      .finally(() => setBusy(false));
  };

  const confirmProfileReject = (): void => {
    const rejectionReason = reason.trim() || undefined;
    setDialog(null);
    setReason('');
    runVerify({ action: 'REJECT', rejectionReason });
  };

  const confirmDocReject = (): void => {
    if (!dialog?.documentId) return;
    const documentId = dialog.documentId;
    setDialog(null);
    setReason('');
    runReviewDoc(documentId, 'REJECT', reason.trim() || undefined);
  };

  if (error && !profile) {
    return (
      <ManagerLayout kicker="Branch operations" title="Delivery partner">
        <EmptyState
          icon={<UserIcon className="h-8 w-8" />}
          title="Partner not found"
          message={error}
        />
      </ManagerLayout>
    );
  }
  if (!profile) {
    return (
      <ManagerLayout kicker="Branch operations" title="Delivery partner">
        <LoadingState message="Loading partner…" className="mt-16" />
      </ManagerLayout>
    );
  }

  const requiredVerified = REQUIRED_VERIFICATION_DOCUMENTS.every((type) =>
    profile.documents.some((doc) => doc.type === type && doc.status === 'VERIFIED'),
  );
  const hasRejectedRequired = profile.documents.some(
    (doc) => REQUIRED_VERIFICATION_DOCUMENTS.includes(doc.type) && doc.status === 'REJECTED',
  );
  const verifiedCount = profile.documents.filter((doc) => doc.status === 'VERIFIED').length;

  return (
    <ManagerLayout kicker="Branch operations" title={profile.fullName}>
      <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm text-slate-500">
            {profile.partnerId} · {profile.branch.name}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            Joined {profile.joinedAt ? formatDateOnly(profile.joinedAt) : '—'}
          </p>
        </div>
        <Link
          to="/manager/partners"
          className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-semibold text-slate-600 hover:border-brand-teal"
        >
          ← All partners
        </Link>
      </div>

      {error ? (
        <Notice tone="error" className="mt-4">
          {error}
        </Notice>
      ) : null}

      <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-bold text-brand-navy">Status</p>
            <p className="text-xs text-slate-500">
              {PARTNER_STATUS_LABELS[profile.status]}
              {profile.status === 'ACTIVE' ? ` · ${AVAILABILITY_LABELS[profile.availability]}` : ''}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {profile.status === 'PENDING_VERIFICATION' ? (
              <Button
                variant="accent"
                disabled={busy}
                onClick={() => runVerify({ action: 'BEGIN_REVIEW' })}
              >
                Start document review
              </Button>
            ) : null}
            {profile.status === 'DOCUMENT_REVIEW' ? (
              <>
                <Button
                  variant="accent"
                  disabled={busy}
                  onClick={() => runVerify({ action: 'APPROVE' })}
                >
                  Approve &amp; verify
                </Button>
                <Button
                  variant="dangerOutline"
                  disabled={busy}
                  onClick={() => {
                    setDialog({ kind: 'reject-profile' });
                    setReason('');
                  }}
                >
                  Reject profile
                </Button>
              </>
            ) : null}
            {profile.status === 'VERIFIED' ||
            profile.status === 'INACTIVE' ||
            profile.status === 'SUSPENDED' ? (
              <Button
                variant="success"
                disabled={busy}
                onClick={() => runVerify({ action: 'ACTIVATE' })}
              >
                Activate
              </Button>
            ) : null}
            {profile.status === 'ACTIVE' ? (
              <>
                <Button
                  variant="secondary"
                  disabled={busy}
                  onClick={() => runSetStatus('INACTIVE')}
                >
                  Deactivate
                </Button>
                <Button
                  variant="dangerOutline"
                  disabled={busy}
                  onClick={() => runSetStatus('SUSPENDED')}
                >
                  Suspend
                </Button>
              </>
            ) : null}
          </div>
        </div>
        {profile.status === 'DOCUMENT_REVIEW' ? (
          <div className="mt-3">
            <Notice
              tone={requiredVerified ? 'success' : hasRejectedRequired ? 'error' : 'warning'}
              className="text-xs"
            >
              {requiredVerified
                ? 'All required documents verified — ready to approve.'
                : hasRejectedRequired
                  ? 'A required document was rejected. Re-upload or reject the profile.'
                  : `Awaiting ${REQUIRED_VERIFICATION_DOCUMENTS.length - verifiedCount} more required documents.`}
            </Notice>
          </div>
        ) : null}
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <section className="rounded-2xl border border-slate-200 bg-white p-4">
          <h2 className="text-sm font-bold uppercase tracking-wide text-slate-500">Personal</h2>
          <dl className="mt-3 grid gap-3 sm:grid-cols-2">
            <Field label="Mobile" value={profile.mobile} />
            <Field label="Email" value={profile.email} />
            <Field
              label="Date of birth"
              value={profile.dateOfBirth ? formatDateOnly(profile.dateOfBirth) : null}
            />
            <Field label="Gender" value={profile.gender} />
            <Field
              label="Emergency contact"
              value={
                profile.emergencyContactName
                  ? `${profile.emergencyContactName} ${profile.emergencyContactPhone ?? ''}`
                  : null
              }
            />
            <Field
              label="Partner type"
              value={profile.partnerType ? PARTNER_TYPE_LABELS[profile.partnerType] : null}
            />
            <Field
              label="Address"
              value={
                [profile.houseFlat, profile.streetArea, profile.city].filter(Boolean).join(', ') ||
                null
              }
            />
          </dl>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-4">
          <h2 className="text-sm font-bold uppercase tracking-wide text-slate-500">
            Vehicle & payout
          </h2>
          <dl className="mt-3 grid gap-3 sm:grid-cols-2">
            <Field label="Vehicle type" value={profile.vehicleType} />
            <Field label="Registration" value={profile.vehicleNumber} />
            <Field
              label="Brand / model"
              value={[profile.vehicleBrand, profile.vehicleModel].filter(Boolean).join(' ') || null}
            />
            <Field label="Driving licence" value={profile.drivingLicenceNumber} />
            <Field label="Bank account" value={profile.accountNumberMasked} />
            <Field label="IFSC" value={profile.ifsc} />
            <Field label="Payout verified" value={profile.payoutVerified ? 'Yes' : 'No'} />
          </dl>
        </section>
      </div>

      <section className="mt-4 rounded-2xl border border-slate-200 bg-white p-4">
        <h2 className="text-sm font-bold uppercase tracking-wide text-slate-500">
          Documents · {verifiedCount}/{profile.documents.length} verified
        </h2>
        <ul className="mt-3 divide-y divide-slate-100">
          {profile.documents.map((doc) => (
            <li
              key={doc.id}
              className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between"
            >
              <div>
                <p className="text-sm font-semibold text-slate-800">
                  {DOCUMENT_TYPE_LABELS[doc.type]}
                  {REQUIRED_VERIFICATION_DOCUMENTS.includes(doc.type) ? (
                    <span className="ml-2 rounded bg-brand-sky/50 px-1.5 py-0.5 text-[10px] font-bold text-brand-navy">
                      required
                    </span>
                  ) : null}
                </p>
                <p className="text-xs text-slate-500">
                  {doc.documentReference ?? '—'}
                  {doc.verificationNote ? ` · ${doc.verificationNote}` : ''}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <StatusBadge
                  label={DOCUMENT_STATUS_LABELS[doc.status]}
                  tone={
                    doc.status === 'VERIFIED'
                      ? 'success'
                      : doc.status === 'REJECTED'
                        ? 'danger'
                        : 'neutral'
                  }
                />
                {verifyable(doc) ? (
                  <Button
                    variant="accent"
                    size="sm"
                    disabled={busy}
                    onClick={() => runReviewDoc(doc.id, 'APPROVE')}
                  >
                    Approve
                  </Button>
                ) : null}
                {verifyable(doc) ? (
                  <Button
                    variant="dangerOutline"
                    size="sm"
                    disabled={busy}
                    onClick={() => {
                      setDialog({ kind: 'reject-doc', documentId: doc.id });
                      setReason('');
                    }}
                  >
                    Reject
                  </Button>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      </section>

      <div className="mt-4">
        <ManagerKycCard partnerId={partnerId} />
      </div>

      <ConfirmDialog
        open={dialog?.kind === 'reject-profile'}
        title="Reject this partner?"
        description="The partner account is marked REJECTED and cannot go online."
        confirmLabel="Reject profile"
        cancelLabel="Keep"
        danger
        onConfirm={confirmProfileReject}
        onClose={() => setDialog(null)}
      >
        <textarea
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          placeholder="Rejection reason"
          maxLength={200}
          rows={2}
          className="mt-3 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-800 focus:border-brand-teal focus:outline-none"
        />
      </ConfirmDialog>

      <ConfirmDialog
        open={dialog?.kind === 'reject-doc'}
        title="Reject this document?"
        description="The partner will need to re-upload it before verification can finish."
        confirmLabel="Reject document"
        cancelLabel="Keep"
        danger
        onConfirm={confirmDocReject}
        onClose={() => setDialog(null)}
      >
        <textarea
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          placeholder="Reason (optional)"
          maxLength={200}
          rows={2}
          className="mt-3 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-800 focus:border-brand-teal focus:outline-none"
        />
      </ConfirmDialog>
    </ManagerLayout>
  );
}

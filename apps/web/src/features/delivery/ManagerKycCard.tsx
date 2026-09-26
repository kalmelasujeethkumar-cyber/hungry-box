import type { JSX } from 'react';
import { useCallback, useEffect, useState } from 'react';
import type { KycDocumentType, KycStatusDto } from '@hungrybox/shared';
import { branchKycApi } from '../../api/client';
import { useAuth } from '../../auth/auth-context';
import { Button } from '../../components/Button';
import { LoadingState } from '../../components/LoadingState';
import { Notice } from '../../components/Notice';
import { StatusBadge } from '../../components/StatusBadge';
import { TextareaField } from '../../components/forms/TextareaField';
import {
  KYC_DOCUMENT_LABELS,
  KYC_DOCUMENT_STATUS_LABELS,
  KYC_DOCUMENT_STATUS_TONES,
  KYC_DOCUMENT_TYPES,
  KYC_OVERALL_LABELS,
  KYC_OVERALL_TONES,
} from './delivery-status';
import ConfirmDialog from '../../components/ConfirmDialog';

export default function ManagerKycCard({
  partnerId,
}: {
  partnerId: string | undefined;
}): JSX.Element {
  const { token } = useAuth();
  const [kyc, setKyc] = useState<KycStatusDto | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rejectType, setRejectType] = useState<KycDocumentType | null>(null);
  const [reason, setReason] = useState('');

  const refresh = useCallback(() => {
    if (!token || !partnerId) return;
    branchKycApi
      .get(partnerId, token)
      .then(setKyc)
      .catch(() => setError('Could not load KYC status.'));
  }, [token, partnerId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const runReview = (type: KycDocumentType, action: 'VERIFY' | 'REJECT', note?: string): void => {
    if (!token || !partnerId) return;
    setBusy(true);
    setError(null);
    branchKycApi
      .review(partnerId, type, { action, note }, token)
      .then(setKyc)
      .catch((err: unknown) => setError(err instanceof Error ? err.message : 'Review failed.'))
      .finally(() => setBusy(false));
  };

  const confirmReject = (): void => {
    if (!rejectType) return;
    const type = rejectType;
    const note = reason.trim();
    setRejectType(null);
    setReason('');
    if (!note) {
      setError('A reason is required to reject a document.');
      return;
    }
    runReview(type, 'REJECT', note);
  };

  const handleView = async (type: KycDocumentType): Promise<void> => {
    if (!token || !partnerId) return;
    setBusy(true);
    setError(null);
    try {
      const access = await branchKycApi.documentAccess(partnerId, type, token);
      window.open(access.url, '_blank', 'noopener,noreferrer');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not open the document.');
    } finally {
      setBusy(false);
    }
  };

  if (kyc === null && !error) {
    return (
      <section className="rounded-2xl border border-slate-200 bg-white p-4">
        <h2 className="text-sm font-bold uppercase tracking-wide text-slate-500">KYC review</h2>
        <LoadingState message="Loading KYC status…" className="mt-3" />
      </section>
    );
  }

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-bold uppercase tracking-wide text-slate-500">KYC review</h2>
        {kyc ? (
          <StatusBadge
            label={KYC_OVERALL_LABELS[kyc.overallState]}
            tone={KYC_OVERALL_TONES[kyc.overallState]}
          />
        ) : null}
      </div>
      <p className="mt-1 text-xs text-slate-500">
        Securely review the partner&apos;s Aadhaar and driving licence images before verification.
      </p>

      {error ? <Notice tone="error">{error}</Notice> : null}

      <ul className="mt-3 divide-y divide-slate-100">
        {KYC_DOCUMENT_TYPES.map((type) => {
          const doc = kyc?.documents.find((item) => item.type === type);
          const status = doc?.status ?? 'PENDING';
          const canReview = status === 'UPLOADED' || status === 'REJECTED';
          const canView = status !== 'PENDING';
          return (
            <li
              key={type}
              className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between"
            >
              <div>
                <p className="text-sm font-semibold text-slate-800">{KYC_DOCUMENT_LABELS[type]}</p>
                <p className="text-xs text-slate-500">{KYC_DOCUMENT_STATUS_LABELS[status]}</p>
                {doc?.verificationNote ? (
                  <p className="mt-1 text-xs text-rose-600">Note: {doc.verificationNote}</p>
                ) : null}
                {doc?.verifiedAt ? (
                  <p className="mt-1 text-xs text-emerald-600">
                    Verified {new Date(doc.verifiedAt).toLocaleDateString()}
                  </p>
                ) : null}
              </div>
              <div className="flex items-center gap-2">
                <StatusBadge
                  label={KYC_DOCUMENT_STATUS_LABELS[status]}
                  tone={KYC_DOCUMENT_STATUS_TONES[status]}
                />
                {canView ? (
                  <Button
                    variant="secondary"
                    size="sm"
                    disabled={busy}
                    onClick={() => void handleView(type)}
                  >
                    View
                  </Button>
                ) : null}
                {canReview ? (
                  <>
                    <Button
                      variant="accent"
                      size="sm"
                      disabled={busy || status === 'REJECTED'}
                      onClick={() => runReview(type, 'VERIFY')}
                    >
                      Verify
                    </Button>
                    <Button
                      variant="dangerOutline"
                      size="sm"
                      disabled={busy}
                      onClick={() => {
                        setRejectType(type);
                        setReason('');
                      }}
                    >
                      Reject
                    </Button>
                  </>
                ) : null}
              </div>
            </li>
          );
        })}
      </ul>

      <ConfirmDialog
        open={rejectType !== null}
        title="Reject this document?"
        description="The partner will need to re-upload it before KYC can complete."
        confirmLabel="Reject document"
        cancelLabel="Keep"
        danger
        onConfirm={confirmReject}
        onClose={() => setRejectType(null)}
      >
        <TextareaField
          label="Reason for rejection"
          required
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          placeholder="Reason (required)"
          maxLength={500}
          rows={2}
        />
      </ConfirmDialog>
    </section>
  );
}

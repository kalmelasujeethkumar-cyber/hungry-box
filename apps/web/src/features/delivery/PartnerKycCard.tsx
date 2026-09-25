import type { JSX, ChangeEvent } from 'react';
import { useEffect, useRef, useState } from 'react';
import type { KycDocumentType, KycStatusDto } from '@hungrybox/shared';
import { deliveryPartnerApi } from '../../api/client';
import { useAuth } from '../../auth/auth-context';
import {
  KYC_DOCUMENT_LABELS,
  KYC_DOCUMENT_STATUS_LABELS,
  KYC_DOCUMENT_TYPES,
  KYC_OVERALL_CHIP_CLASSES,
  KYC_OVERALL_LABELS,
} from './delivery-status';

const ACCEPTED_TYPES = ['image/jpeg', 'image/png'];
const MAX_BYTES = 5 * 1024 * 1024;

export default function PartnerKycCard(): JSX.Element {
  const { token } = useAuth();
  const [kyc, setKyc] = useState<KycStatusDto | null>(null);
  const [pendingType, setPendingType] = useState<KycDocumentType | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputs = useRef<Record<KycDocumentType, HTMLInputElement | null>>({
    AADHAAR: null,
    DRIVING_LICENSE: null,
  });

  const load = () => {
    if (!token) return;
    deliveryPartnerApi
      .kycStatus(token)
      .then(setKyc)
      .catch(() => setError('Could not load your KYC status.'));
  };

  useEffect(load, [token]);

  const handleFile = async (type: KycDocumentType, event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file || !token) return;

    if (!ACCEPTED_TYPES.includes(file.type)) {
      setError('Only JPEG and PNG document images are allowed.');
      return;
    }
    if (file.size > MAX_BYTES) {
      setError('Documents must be 5 MB or smaller.');
      return;
    }

    setPendingType(type);
    setBusy(true);
    setError(null);
    try {
      const updated = await deliveryPartnerApi.kycUploadDocument(type, file, token);
      setKyc(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed. Please try again.');
    } finally {
      setPendingType(null);
      setBusy(false);
    }
  };

  const handleView = async (type: KycDocumentType) => {
    if (!token) return;
    setBusy(true);
    setError(null);
    try {
      const access = await deliveryPartnerApi.kycDocumentAccess(type, token);
      window.open(access.url, '_blank', 'noopener,noreferrer');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not open your document.');
    } finally {
      setBusy(false);
    }
  };

  if (kyc === null && !error) {
    return (
      <section className="rounded-2xl border border-slate-200 bg-white p-4">
        <h2 className="text-sm font-bold uppercase tracking-wide text-slate-500">KYC verification</h2>
        <p className="mt-3 text-sm text-slate-500">Loading your KYC status…</p>
      </section>
    );
  }

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-bold uppercase tracking-wide text-slate-500">KYC verification</h2>
        {kyc ? (
          <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${KYC_OVERALL_CHIP_CLASSES[kyc.overallState]}`}>
            {KYC_OVERALL_LABELS[kyc.overallState]}
          </span>
        ) : null}
      </div>

      <p className="mt-1 text-xs text-slate-500">
        Upload your Aadhaar and driving licence as JPEG or PNG images (maximum 5 MB each). Documents are
        stored privately and reviewed by your branch manager.
      </p>

      {error ? (
        <p className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-sm font-medium text-rose-700">{error}</p>
      ) : null}

      <ul className="mt-3 divide-y divide-slate-100">
        {KYC_DOCUMENT_TYPES.map((type) => {
          const doc = kyc?.documents.find((item) => item.type === type);
          const status = doc?.status ?? 'PENDING';
          const canUpload = status !== 'VERIFIED';
          const canView = status !== 'PENDING';
          return (
            <li key={type} className="py-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-slate-800">{KYC_DOCUMENT_LABELS[type]}</p>
                  <p className="text-xs text-slate-500">{KYC_DOCUMENT_STATUS_LABELS[status]}</p>
                  {doc?.verificationNote ? (
                    <p className="mt-1 text-xs text-rose-600">Reason: {doc.verificationNote}</p>
                  ) : null}
                  {doc?.verifiedAt ? (
                    <p className="mt-1 text-xs text-emerald-600">Verified {new Date(doc.verifiedAt).toLocaleDateString()}</p>
                  ) : null}
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {canView ? (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void handleView(type)}
                      className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 disabled:opacity-50"
                    >
                      View
                    </button>
                  ) : null}
                  {canUpload ? (
                    <>
                      <input
                        ref={(node) => {
                          fileInputs.current[type] = node;
                        }}
                        id={`kyc-upload-${type}`}
                        type="file"
                        accept=".jpg,.jpeg,.png,image/jpeg,image/png"
                        className="sr-only"
                        disabled={busy}
                        onChange={(event) => void handleFile(type, event)}
                      />
                      <label
                        htmlFor={`kyc-upload-${type}`}
                        className="cursor-pointer rounded-lg bg-brand-navy px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
                      >
                        {status === 'REJECTED' ? 'Re-upload' : status === 'PENDING' ? 'Upload' : 'Replace'}
                      </label>
                    </>
                  ) : null}
                  {pendingType === type ? <span className="text-xs text-slate-400">Uploading…</span> : null}
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
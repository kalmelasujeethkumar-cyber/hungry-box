import type { JSX, ReactNode } from 'react';
import { Dialog } from './Dialog';
import { Button } from './Button';

export default function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel,
  cancelLabel,
  danger,
  busy = false,
  busyLabel = 'Working…',
  children,
  onConfirm,
  onClose,
}: {
  open: boolean;
  title: string;
  description: string;
  confirmLabel: string;
  cancelLabel?: string;
  danger?: boolean;
  busy?: boolean;
  busyLabel?: string;
  children?: ReactNode;
  onConfirm: () => void;
  onClose: () => void;
}): JSX.Element | null {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={title}
      description={description}
      className="max-w-sm"
      closeOnBackdrop
    >
      {children}
      <div className="mt-6 flex gap-3">
        <Button variant="secondary" className="flex-1" onClick={onClose} disabled={busy}>
          {cancelLabel ?? 'Keep browsing'}
        </Button>
        <Button
          variant={danger ? 'destructive' : 'primary'}
          className="flex-1"
          onClick={onConfirm}
          loading={busy}
          loadingLabel={busyLabel}
        >
          {confirmLabel}
        </Button>
      </div>
    </Dialog>
  );
}

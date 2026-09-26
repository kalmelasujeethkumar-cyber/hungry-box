import type { JSX } from 'react';
import { useEffect, useRef, useState } from 'react';
import { Button } from './Button';

export const ACCEPTED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
export const ACCEPTED_IMAGE_ATTR = ACCEPTED_IMAGE_TYPES.join(',');
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

export function imageFileError(file: File): string | null {
  if (!ACCEPTED_IMAGE_TYPES.includes(file.type)) {
    return 'Choose a JPEG, PNG or WebP image.';
  }
  if (file.size > MAX_IMAGE_BYTES) {
    return 'Image must be 5 MB or smaller.';
  }
  return null;
}

export interface ImageFieldProps {
  /** Accessible name of the hidden file input, unique per surface. */
  inputLabel: string;
  triggerLabel: string;
  file: File | null;
  onFileChange: (file: File | null) => void;
  disabled?: boolean;
  clearLabel?: string;
  className?: string;
}

/**
 * Shared device file picker with an immediate local preview. It deliberately does
 * not upload or validate: the owning screen stays in charge of when the upload
 * happens, and of the user-facing validation copy. Both management roles use this
 * so the picker behaves identically everywhere.
 */
export function ImageField({
  inputLabel,
  triggerLabel,
  file,
  onFileChange,
  disabled = false,
  clearLabel = 'Clear selection',
  className,
}: ImageFieldProps): JSX.Element {
  const inputRef = useRef<HTMLInputElement>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!file || typeof URL.createObjectURL !== 'function') {
      setPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    return () => {
      URL.revokeObjectURL(url);
    };
  }, [file]);

  return (
    <div className={className}>
      <div className="flex flex-wrap items-center gap-2">
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPTED_IMAGE_ATTR}
          aria-label={inputLabel}
          className="sr-only"
          disabled={disabled}
          onChange={(event) => onFileChange(event.target.files?.[0] ?? null)}
        />
        <Button
          variant="secondary"
          size="sm"
          onClick={() => inputRef.current?.click()}
          disabled={disabled}
        >
          {file ? `Selected: ${file.name}` : triggerLabel}
        </Button>
        {file ? (
          <Button variant="ghost" size="sm" onClick={() => onFileChange(null)} disabled={disabled}>
            {clearLabel}
          </Button>
        ) : null}
      </div>
      {previewUrl ? (
        <img
          src={previewUrl}
          alt="Selected image preview"
          data-testid="image-field-preview"
          className="mt-3 h-24 w-24 rounded-lg border border-slate-200 object-cover"
        />
      ) : null}
    </div>
  );
}

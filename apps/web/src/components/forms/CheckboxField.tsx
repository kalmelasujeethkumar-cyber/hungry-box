import type { InputHTMLAttributes, ReactNode } from 'react';
import { useId } from 'react';

export interface CheckboxFieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  description?: ReactNode;
  required?: boolean;
  error?: string | null;
}

export function CheckboxField({
  label,
  description,
  required = false,
  error,
  id,
  className,
  ...inputProps
}: CheckboxFieldProps) {
  const generatedId = useId();
  const fieldId = id ?? generatedId;
  const errorId = error ? `${fieldId}-error` : undefined;

  return (
    <div className={className}>
      <label htmlFor={fieldId} className="flex items-start gap-2.5">
        <input
          id={fieldId}
          type="checkbox"
          required={required}
          aria-invalid={error ? true : undefined}
          aria-describedby={errorId}
          className="mt-0.5 h-4 w-4 shrink-0 accent-brand-teal"
          {...inputProps}
        />
        <span className="text-sm">
          <span className="font-semibold text-slate-700">
            {label}
            {required ? (
              <span aria-hidden="true" className="text-red-500">
                {' '}
                *
              </span>
            ) : null}
          </span>
          {description ? <span className="mt-0.5 block text-xs text-slate-500">{description}</span> : null}
        </span>
      </label>
      {error ? (
        <p id={errorId} role="alert" className="mt-1 pl-6 text-xs font-semibold text-red-600">
          {error}
        </p>
      ) : null}
    </div>
  );
}
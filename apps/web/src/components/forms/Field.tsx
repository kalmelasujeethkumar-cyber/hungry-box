import type { ReactElement, ReactNode } from 'react';
import { Children, cloneElement, useId } from 'react';

export interface FieldProps {
  label: string;
  htmlFor?: string;
  required?: boolean;
  error?: string | null;
  helper?: string;
  children: ReactNode;
  className?: string;
  labelClassName?: string;
}

export function Field({
  label,
  htmlFor,
  required = false,
  error,
  helper,
  children,
  className,
  labelClassName,
}: FieldProps) {
  const generatedId = useId();
  const fieldId = htmlFor ?? generatedId;
  const helperId = helper ? `${fieldId}-helper` : undefined;
  const errorId = error ? `${fieldId}-error` : undefined;
  const describedBy = [helperId, errorId].filter(Boolean).join(' ') || undefined;

  const control = Children.only(children) as ReactElement<{
    id?: string;
    'aria-describedby'?: string;
    'aria-invalid'?: boolean;
  }>;
  const controlWithAria = cloneElement(control, {
    id: control.props.id ?? fieldId,
    'aria-describedby': describedBy,
    'aria-invalid': error ? true : undefined,
  });

  return (
    <div className={className}>
      <label
        htmlFor={fieldId}
        className={['block text-sm font-semibold text-slate-700', labelClassName ?? ''].join(' ')}
      >
        {label}
        {required ? (
          <span aria-hidden="true" className="text-red-500">
            {' '}
            *
          </span>
        ) : null}
      </label>
      <div className="mt-1.5">{controlWithAria}</div>
      {helper ? (
        <p id={helperId} className="mt-1 text-xs text-slate-500">
          {helper}
        </p>
      ) : null}
      {error ? (
        <p id={errorId} role="alert" className="mt-1 text-xs font-semibold text-red-600">
          {error}
        </p>
      ) : null}
    </div>
  );
}
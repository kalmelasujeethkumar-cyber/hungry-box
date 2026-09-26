import type { ReactNode, SelectHTMLAttributes } from 'react';
import { Field } from './Field';

export interface SelectFieldProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label: string;
  required?: boolean;
  error?: string | null;
  helper?: string;
  children?: ReactNode;
  fieldClassName?: string;
}

export function SelectField({
  label,
  required = false,
  error,
  helper,
  children,
  className,
  fieldClassName,
  ...selectProps
}: SelectFieldProps) {
  return (
    <Field label={label} required={required} error={error} helper={helper} className={fieldClassName}>
      <select
        {...selectProps}
        required={required}
        className={[
          'w-full appearance-none rounded-lg border bg-white px-3 py-2 text-sm text-slate-800 outline-none transition-colors',
          error ? 'border-red-400' : 'border-slate-300',
          'focus:ring-2',
          error ? 'focus:border-red-500 focus:ring-red-200' : 'focus:border-brand-teal focus:ring-brand-teal/20',
          className ?? '',
        ].join(' ')}
      >
        {children}
      </select>
    </Field>
  );
}
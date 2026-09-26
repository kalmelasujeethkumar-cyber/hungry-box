import type { InputHTMLAttributes } from 'react';
import { Field } from './Field';

export interface TextFieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  required?: boolean;
  error?: string | null;
  helper?: string;
  fieldClassName?: string;
}

export function TextField({
  label,
  required = false,
  error,
  helper,
  className,
  fieldClassName,
  ...inputProps
}: TextFieldProps) {
  return (
    <Field label={label} required={required} error={error} helper={helper} className={fieldClassName}>
      <input
        {...inputProps}
        required={required}
        className={[
          'w-full rounded-lg border px-3 py-2 text-sm text-slate-800 outline-none transition-colors placeholder:text-slate-400',
          error ? 'border-red-400' : 'border-slate-300',
          'focus:ring-2',
          error ? 'focus:border-red-500 focus:ring-red-200' : 'focus:border-brand-teal focus:ring-brand-teal/20',
          className ?? '',
        ].join(' ')}
      />
    </Field>
  );
}
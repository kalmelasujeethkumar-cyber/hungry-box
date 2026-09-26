import type { JSX } from 'react';

export interface FilterChipOption<TValue> {
  value: TValue;
  label: string;
}

export interface FilterChipsProps<TValue> {
  options: readonly FilterChipOption<TValue>[];
  value: TValue;
  onChange: (value: TValue) => void;
  ariaLabel: string;
  className?: string;
}

export function FilterChips<TValue extends string | undefined>({
  options,
  value,
  onChange,
  ariaLabel,
  className,
}: FilterChipsProps<TValue>): JSX.Element {
  return (
    <div
      role="group"
      aria-label={ariaLabel}
      className={['flex flex-wrap gap-2', className ?? ''].filter(Boolean).join(' ')}
    >
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <button
            key={option.label}
            type="button"
            aria-pressed={selected}
            onClick={() => onChange(option.value)}
            className={[
              'rounded-full px-3 py-1.5 text-sm font-semibold transition-colors',
              selected
                ? 'bg-brand-teal text-white'
                : 'bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-brand-sky/40',
            ].join(' ')}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

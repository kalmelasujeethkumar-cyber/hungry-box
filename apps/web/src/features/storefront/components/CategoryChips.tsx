import type { JSX } from 'react';
import { useStorefront } from '../storefront-context';

export default function CategoryChips(): JSX.Element | null {
  const { categories, categorySlug, setCategory } = useStorefront();

  if (categories.length === 0) return null;

  return (
    <nav aria-label="Menu categories" className="-mx-4 overflow-x-auto px-4">
      <ul className="flex w-max gap-2 pb-1">
        <li>
          <button
            type="button"
            onClick={() => setCategory(null)}
            className={`whitespace-nowrap rounded-full px-4 py-2 text-sm font-semibold transition-colors ${
              categorySlug === null
                ? 'bg-brand-navy text-white'
                : 'border border-slate-200 bg-white text-slate-700 hover:border-brand-teal hover:text-brand-teal'
            }`}
          >
            All
          </button>
        </li>
        {categories.map((category) => {
          const active = categorySlug === category.slug;
          return (
            <li key={category.id}>
              <button
                type="button"
                onClick={() => setCategory(active ? null : category.slug)}
                aria-pressed={active}
                className={`whitespace-nowrap rounded-full px-4 py-2 text-sm font-semibold transition-colors ${
                  active
                    ? 'bg-brand-navy text-white'
                    : 'border border-slate-200 bg-white text-slate-700 hover:border-brand-teal hover:text-brand-teal'
                }`}
              >
                {category.name}
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

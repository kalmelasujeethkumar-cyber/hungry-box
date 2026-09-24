import type { JSX } from 'react';
import { useStorefront } from '../storefront-context';
import { SearchIcon } from './icons';

export default function SearchBar(): JSX.Element {
  const { search, setSearch } = useStorefront();

  return (
    <div className="relative">
      <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
      <input
        type="search"
        value={search}
        onChange={(event) => setSearch(event.target.value)}
        placeholder="Search dishes, snacks, biryani…"
        aria-label="Search the menu"
        className="w-full rounded-xl border border-slate-200 bg-white py-3 pl-10 pr-4 text-base text-slate-800 placeholder:text-slate-400 focus:border-brand-teal focus:outline-none"
      />
    </div>
  );
}

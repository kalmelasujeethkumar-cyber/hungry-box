import type { JSX } from 'react';
import { Link } from 'react-router-dom';
import { HOME_PATH } from '../routes/paths';

export default function NotFoundPage(): JSX.Element {
  return (
    <main className="min-h-screen bg-white flex flex-col items-center justify-center px-6 py-16 text-center">
      <p className="text-xs font-semibold uppercase tracking-widest text-brand-orange">404</p>
      <h1 className="mt-4 text-3xl font-bold text-brand-navy">Page not found</h1>
      <p className="mt-3 text-sm text-slate-600">The page you are looking for does not exist.</p>
      <Link
        to={HOME_PATH}
        className="mt-6 rounded-lg bg-brand-teal px-5 py-2.5 text-sm font-semibold text-white hover:bg-brand-navy"
      >
        Back home
      </Link>
    </main>
  );
}

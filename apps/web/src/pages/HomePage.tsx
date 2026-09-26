import type { JSX } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth/auth-context';
import { homePathForRole } from '../auth/role-paths';
import { CartIcon, LocationIcon, PackageIcon } from '../features/storefront/components/icons';
import { LOGIN_PATH } from '../routes/paths';

const FEATURES = [
  {
    icon: LocationIcon,
    title: 'Delivers from your branch',
    copy: 'Pick a saved address and we serve you from the nearest Hungry Box branch in range.',
  },
  {
    icon: CartIcon,
    title: 'Order in minutes',
    copy: 'Browse a live menu of snacks and meals, build your cart, and check out without friction.',
  },
  {
    icon: PackageIcon,
    title: 'Track every step',
    copy: 'Follow your order from the kitchen to your door, and pay cash on delivery if you prefer.',
  },
] as const;

export default function HomePage(): JSX.Element {
  const { user } = useAuth();

  return (
    <main className="flex min-h-screen flex-col bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
          <Link
            to="/"
            className="text-xl font-extrabold tracking-tight text-brand-navy"
            aria-label="Hungry Box home"
          >
            hungry <span className="text-brand-orange">box</span>
          </Link>
          {user ? (
            <Link to={homePathForRole(user.role)} className="text-sm font-semibold text-brand-teal">
              Continue to your account
            </Link>
          ) : null}
        </div>
      </header>

      <section className="flex flex-1 flex-col items-center justify-center px-6 py-16 text-center">
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-brand-orange">
          Multi-branch food delivery
        </p>
        <h1 className="mt-4 max-w-2xl text-4xl font-extrabold leading-tight tracking-tight text-brand-navy sm:text-5xl">
          Snacks and meals, delivered from the branch near you
        </h1>
        <p className="mt-4 max-w-xl text-base leading-relaxed text-slate-600">
          Browse the menu, place an order, and watch it travel from our kitchen to your door. Pay
          online when it is ready, or keep it simple with cash on delivery.
        </p>

        <div className="mt-8 flex flex-col items-center gap-3 sm:flex-row">
          {user ? (
            <Link
              to={homePathForRole(user.role)}
              className="rounded-lg bg-brand-orange px-6 py-3 text-sm font-bold text-white hover:bg-brand-orange/90"
            >
              Continue as {user.name ?? user.loginId}
            </Link>
          ) : (
            <>
              <Link
                to={LOGIN_PATH}
                className="rounded-lg bg-brand-orange px-6 py-3 text-sm font-bold text-white hover:bg-brand-orange/90"
              >
                Order now
              </Link>
              <Link
                to={LOGIN_PATH}
                className="rounded-lg border border-slate-300 bg-white px-6 py-3 text-sm font-bold text-slate-700 hover:border-brand-teal hover:text-brand-teal"
              >
                Sign in
              </Link>
            </>
          )}
        </div>

        <ul className="mt-14 grid w-full max-w-3xl grid-cols-1 gap-4 sm:grid-cols-3">
          {FEATURES.map((feature) => (
            <li
              key={feature.title}
              className="rounded-2xl border border-slate-200 bg-white p-5 text-left"
            >
              <span className="flex h-10 w-10 items-center justify-center rounded-full bg-brand-sky text-brand-navy">
                <feature.icon className="h-5 w-5" />
              </span>
              <h2 className="mt-3 text-sm font-extrabold text-brand-navy">{feature.title}</h2>
              <p className="mt-1.5 text-sm leading-relaxed text-slate-600">{feature.copy}</p>
            </li>
          ))}
        </ul>
      </section>

      <footer className="border-t border-slate-200 bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4 text-xs text-slate-500">
          <span className="font-extrabold tracking-tight text-brand-navy">
            hungry <span className="text-brand-orange">box</span>
          </span>
          <span>Fresh from the box, at your door.</span>
        </div>
      </footer>
    </main>
  );
}
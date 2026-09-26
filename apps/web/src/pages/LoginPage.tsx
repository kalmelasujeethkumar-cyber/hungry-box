import type { FormEvent, JSX } from 'react';
import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { ApiError } from '../api/client';
import { useAuth } from '../auth/auth-context';
import { homePathForRole } from '../auth/role-paths';
import { Button } from '../components/Button';
import { Notice } from '../components/Notice';
import { TextField } from '../components/forms/TextField';
import { HOME_PATH, LOGIN_PATH } from '../routes/paths';

const DEMO_HINT = 'Demo accounts: admin@gmail.com · branch1@gmail.com · shiva@ (see AGENTS.md)';

export default function LoginPage(): JSX.Element {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [loginId, setLoginId] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    let user;
    try {
      user = await login(loginId, password);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Login failed');
      setSubmitting(false);
      return;
    }
    setSubmitting(false);
    const from = (location.state as { from?: string } | null)?.from;
    const target =
      from && from.startsWith('/') && from !== LOGIN_PATH ? from : homePathForRole(user.role);
    navigate(target, { replace: true });
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-slate-50 px-6 py-16">
      <div className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-widest text-brand-orange">
          Welcome to
        </p>
        <h1 className="mt-2 text-3xl font-extrabold tracking-tight text-brand-navy">hungry box</h1>

        <form className="mt-8 flex flex-col gap-4" onSubmit={(event) => void handleSubmit(event)}>
          <TextField
            label="Login ID or email"
            type="text"
            autoComplete="username"
            required
            value={loginId}
            onChange={(event) => setLoginId(event.target.value)}
          />
          <TextField
            label="Password"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />

          {error ? <Notice tone="error">{error}</Notice> : null}

          <Button type="submit" loading={submitting} loadingLabel="Signing in…" className="mt-2">
            Sign in
          </Button>
        </form>

        <p className="mt-6 text-xs leading-relaxed text-slate-500">{DEMO_HINT}</p>
      </div>

      <Link to={HOME_PATH} className="mt-6 text-sm font-medium text-brand-teal hover:underline">
        Back to home
      </Link>
    </main>
  );
}

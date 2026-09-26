import type { FormEvent, JSX } from 'react';
import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { ApiError } from '../../api/client';
import { useAuth } from '../../auth/auth-context';
import { isManagementRole, resolvePostLoginPath } from '../../auth/role-paths';
import { Button } from '../../components/Button';
import { Notice } from '../../components/Notice';
import { TextField } from '../../components/forms/TextField';
import { HOME_PATH } from '../../routes/paths';

const UNAUTHORIZED_ROLE_MESSAGE =
  'This account is not authorized for Hungry Box management. Sign in with a management account.';

export default function ManagementLoginPage(): JSX.Element {
  const { login, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [loginId, setLoginId] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const from = (location.state as { from?: string } | null)?.from;

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    let user;
    try {
      user = await login(loginId, password);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Sign in failed. Please try again.');
      setSubmitting(false);
      return;
    }
    setSubmitting(false);

    if (!isManagementRole(user.role)) {
      // The backend authenticated the account, but management is role-restricted.
      // Drop the session immediately so no management access is ever held.
      logout();
      setPassword('');
      setError(UNAUTHORIZED_ROLE_MESSAGE);
      return;
    }

    setPassword('');
    navigate(resolvePostLoginPath(user.role, from), { replace: true });
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-slate-50 px-4 py-12 sm:px-6">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-brand-orange">
          Hungry Box Management
        </p>
        <h1 className="mt-2 text-2xl font-extrabold tracking-tight text-brand-navy sm:text-3xl">
          hungry <span className="text-brand-orange">box</span>
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-slate-600">
          Sign in with your management account. Your role determines the dashboard you get.
        </p>

        <form className="mt-8 flex flex-col gap-4" onSubmit={(event) => void handleSubmit(event)}>
          <TextField
            label="Management email or username"
            type="text"
            name="loginId"
            autoComplete="username"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            required
            value={loginId}
            onChange={(event) => setLoginId(event.target.value)}
          />
          <TextField
            label="Password"
            type="password"
            name="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />

          {error ? <Notice tone="error">{error}</Notice> : null}

          <Button
            type="submit"
            loading={submitting}
            loadingLabel="Signing in…"
            className="mt-2 w-full"
          >
            Sign in
          </Button>
        </form>
      </div>

      <div className="mt-6 flex flex-col items-center gap-2 text-center">
        <Link
          to={HOME_PATH}
          className="text-sm font-medium text-brand-teal hover:underline"
        >
          Back to hungry box
        </Link>
      </div>
    </main>
  );
}

import { useAuth } from '../auth/auth-context';
import { Button } from './Button';
import type { ButtonVariant } from './Button';

export interface SignOutButtonProps {
  className?: string;
  variant?: ButtonVariant;
  size?: 'sm' | 'md' | 'lg';
  label?: string;
}

export function SignOutButton({ className, variant = 'secondary', size = 'sm', label = 'Sign out' }: SignOutButtonProps) {
  const { logout } = useAuth();
  return (
    <Button type="button" variant={variant} size={size} className={className} onClick={logout}>
      {label}
    </Button>
  );
}
import type { JSX } from 'react';
import RoleHomeShell from '../../layouts/RoleHomeShell';

export default function AdminHomePage(): JSX.Element {
  return (
    <RoleHomeShell
      kicker="Super Admin"
      title="Administration"
      intro="Global access across all branches. Branch analytics and management tools arrive in later phases."
    />
  );
}

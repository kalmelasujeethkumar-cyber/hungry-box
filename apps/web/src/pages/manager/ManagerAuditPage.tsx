import type { JSX } from 'react';
import { useAuth } from '../../auth/auth-context';
import { AuditLogPanel } from '../../features/audit/AuditLogPanel';
import ManagerLayout from './ManagerLayout';

export default function ManagerAuditPage(): JSX.Element {
  const { token } = useAuth();

  return (
    <ManagerLayout kicker="Branch operations" title="Audit log">
      <AuditLogPanel
        token={token}
        emptyMessage="Branch activity will be recorded here as it happens."
      />
    </ManagerLayout>
  );
}

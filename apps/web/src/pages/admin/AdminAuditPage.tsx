import type { JSX } from 'react';
import { useEffect, useState } from 'react';
import type { BranchDto } from '@hungrybox/shared';
import { branchesApi } from '../../api/client';
import { useAuth } from '../../auth/auth-context';
import { AuditLogPanel } from '../../features/audit/AuditLogPanel';
import AdminLayout from './AdminLayout';

export default function AdminAuditPage(): JSX.Element {
  const { token } = useAuth();
  const [branches, setBranches] = useState<BranchDto[] | undefined>(undefined);

  useEffect(() => {
    if (!token) return undefined;
    let cancelled = false;
    branchesApi
      .list(token)
      .then((loaded) => {
        if (!cancelled) setBranches(loaded);
      })
      .catch(() => {
        if (!cancelled) setBranches([]);
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  return (
    <AdminLayout kicker="Global operations" title="Audit log">
      <AuditLogPanel
        token={token}
        emptyMessage="Platform activity will be recorded here as it happens."
        branches={branches}
      />
    </AdminLayout>
  );
}

export interface AuditEventDto {
  id: string;
  actorRole: string;
  actorId: string | null;
  kind: string;
  entityType: string;
  entityId: string | null;
  branchId: string | null;
  message: string | null;
  createdAt: string;
}

export interface AuditListQuery {
  kind?: string;
  entityType?: string;
  from?: string;
  to?: string;
  /** Required for SUPER_ADMIN when targeting a specific branch; ignored for BRANCH_MANAGER (always own branch). */
  branchId?: string;
  page?: number;
  limit?: number;
}

export interface AuditListResultDto {
  items: AuditEventDto[];
  total: number;
  page: number;
  limit: number;
}

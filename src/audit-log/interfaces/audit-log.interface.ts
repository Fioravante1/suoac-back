export type AuditAction = 'CREATE' | 'UPDATE' | 'DELETE' | 'DEACTIVATE';

export interface AuditLogDetails {
  oldValues: Record<string, unknown> | null;
  newValues: Record<string, unknown> | null;
  actor?: Record<string, unknown>;
}

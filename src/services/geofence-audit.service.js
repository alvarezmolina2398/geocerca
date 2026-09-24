import { postgresBackground } from './postgres-background.service.js';

const insertAudit = `
INSERT INTO public.geofence_audit_logs (
  request_id, requested_at, usuario, method, path, status_code,
  request_payload, response_payload
) VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8::jsonb)
`;

export function createGeofenceAuditService({ background = postgresBackground } = {}) {
  function record(entry) {
    return background.send(insertAudit, [
      entry.requestId,
      entry.requestedAt,
      entry.usuario,
      entry.method,
      entry.path,
      entry.statusCode,
      entry.received,
      entry.responded
    ]);
  }

  return { record, close: () => background.close() };
}

export const geofenceAudit = createGeofenceAuditService();

CREATE TABLE IF NOT EXISTS public.geofence_audit_logs (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  request_id TEXT NOT NULL,
  requested_at TIMESTAMPTZ NOT NULL,
  usuario TEXT,
  method TEXT NOT NULL,
  path TEXT NOT NULL,
  status_code SMALLINT NOT NULL CHECK (status_code BETWEEN 100 AND 599),
  request_payload JSONB,
  response_payload JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS geofence_audit_logs_requested_at_idx
  ON public.geofence_audit_logs (requested_at DESC);

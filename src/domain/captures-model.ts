export type CaptureProtocol = 'http' | 'https' | 'http2' | 'websocket' | 'tcp' | 'tunnel' | 'unknown';

export interface CaptureQueryFilters {
  host?: string;
  path?: string;
  method?: string;
  status?: number;
  keyword?: string;
}

export interface CaptureQuery {
  instance_id: string;
  filters: CaptureQueryFilters;
  limit: number;
}

export interface CaptureTiming {
  start_at?: string;
  end_at?: string;
  duration_ms?: number;
}

export interface CaptureRecord {
  capture_id: string;
  instance_id: string;
  protocol: CaptureProtocol;
  method?: string;
  url?: string;
  host?: string;
  path?: string;
  status_code?: number;
  timing?: CaptureTiming;
  // Note: matched_rules / full headers/bodies are intentionally omitted in v1 model until
  // a stable backend representation is finalized.
}

export interface ComposeRequest {
  compose_id: string;
  instance_id: string;
  base_capture_id?: string;
  method?: string;
  url?: string;
  headers?: Record<string, string>;
  body?: string;
}


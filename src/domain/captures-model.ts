export type CaptureProtocol = 'http' | 'https' | 'http2' | 'websocket' | 'tcp' | 'tunnel' | 'unknown';
export type CaptureBackend = 'runtime' | 'whistle-web';

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
  backend?: 'auto' | CaptureBackend;
}

export interface CaptureTiming {
  start_at?: string;
  end_at?: string;
  duration_ms?: number;
}

export interface CaptureRecord {
  capture_id: string;
  instance_id: string;
  backend?: CaptureBackend;
  protocol: CaptureProtocol;
  method?: string;
  url?: string;
  host?: string;
  path?: string;
  status_code?: number;
  timing?: CaptureTiming;
  request_headers?: Record<string, string>;
  matched_rules?: unknown;
}

export interface ComposeRequest {
  compose_id: string;
  instance_id: string;
  base_capture_id?: string;
  method?: string;
  url?: string;
  headers?: Record<string, string>;
  body?: string;
  execution_mode?: 'preview' | 'send' | 'send_and_capture';
  temporary_overrides?: {
    rules_text?: string;
    values?: Record<string, string>;
  };
}

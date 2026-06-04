export type CaptureProtocol =
  | 'http'
  | 'https'
  | 'http2'
  | 'websocket'
  | 'tcp'
  | 'tunnel'
  | 'unknown';
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

export type CaptureAssertClassification = 'MATCHED' | 'TIMEOUT';

export interface CaptureSummary {
  capture_id: string;
  method?: string;
  status_code?: number;
  url?: string;
  host?: string;
  path?: string;
  x_tt_logid?: string;
  request_id?: string;
  env?: string;
  x_tt_env?: string;
  referer?: string;
  matched_rules_summary?: string[];
  redacted_headers?: string[];
}

export interface CaptureSummaryOptions {
  fields?: string[];
}

export interface CaptureAssertRequestOptions extends CaptureSummaryOptions {
  timeoutMs?: number;
  pollIntervalMs?: number;
}

export interface CaptureAssertRequestResult {
  matched: boolean;
  classification: CaptureAssertClassification;
  observed: number;
  filters: CaptureQueryFilters;
  match?: CaptureSummary;
  next_actions?: string[];
}

export interface CaptureHeaderResult {
  capture_id: string;
  backend: CaptureBackend;
  header: string;
  value: string;
}

export interface CaptureHeaderSelection {
  header: string;
  value: string;
}

export interface CaptureHeaderPresence {
  present: boolean;
}

export interface CaptureHeadersOptions {
  headers: string[];
  timeoutMs?: number;
  pollIntervalMs?: number;
  allowExisting?: boolean;
}

export interface CaptureHeadersResult {
  capture_id: string;
  backend: CaptureBackend;
  method?: string;
  host?: string;
  path?: string;
  headers: Record<string, CaptureHeaderPresence>;
  values: CaptureHeaderSelection[];
  scanned: number;
  matched: number;
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

export type HeaderAssertionClassification = 'OK' | 'OVERRIDDEN' | 'MISS' | 'NO_TRAFFIC';

export interface HeaderAssertionOptions {
  header: string;
  equals: string;
}

export interface HeaderAssertionExample {
  capture_id: string;
  url?: string;
  method?: string;
  status_code?: number;
  expected: string;
  actual?: string;
  classification: HeaderAssertionClassification;
}

export interface HeaderAssertionResult {
  backend: CaptureBackend;
  observed: number;
  ok: number;
  overridden: number;
  miss: number;
  no_traffic: boolean;
  classification: HeaderAssertionClassification;
  events: HeaderAssertionExample[];
  examples: HeaderAssertionExample[];
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

import type { OutputFormat } from '../cli/program';
import type { Envelope } from './result';

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
}

function asRecordArray(value: unknown): Array<Record<string, unknown>> {
  return Array.isArray(value)
    ? (value.filter((item) => item && typeof item === 'object') as Array<Record<string, unknown>>)
    : [];
}

function renderAsTable(envelope: Envelope): string {
  if (envelope.resource === 'captures' && envelope.action === 'find') {
    const data = asRecord(envelope.data);
    const items = asRecordArray(data.items);
    const header = ['capture_id', 'method', 'status_code', 'host', 'path'].join('\t');
    const rows = items.map((it) =>
      [
        it.capture_id ?? '',
        it.method ?? '',
        it.status_code ?? '',
        it.host ?? '',
        it.path ?? '',
      ].join('\t'),
    );
    return `${header}\n${rows.join('\n')}\n`;
  }

  if (envelope.resource === 'frames' && envelope.action === 'list') {
    const data = asRecord(envelope.data);
    const items = asRecordArray(data.items);
    const header = ['frame_id', 'direction', 'ts', 'data'].join('\t');
    const rows = items.map((it) =>
      [it.frame_id ?? '', it.direction ?? '', it.ts ?? '', it.data ?? ''].join('\t'),
    );
    return `${header}\n${rows.join('\n')}\n`;
  }

  // Fallback: pretty JSON.
  return `${JSON.stringify(envelope, null, 2)}\n`;
}

export function renderEnvelope(envelope: Envelope, format: OutputFormat): string {
  switch (format) {
    case 'pretty':
      return `${JSON.stringify(envelope, null, 2)}\n`;
    case 'ndjson':
    case 'json':
      return `${JSON.stringify(envelope)}\n`;
    case 'table':
      return renderAsTable(envelope);
    default:
      return `${JSON.stringify(envelope)}\n`;
  }
}

import type { OutputFormat } from '../cli/program';
import type { Envelope } from './result';

function renderAsTable(envelope: Envelope): string {
  if (envelope.resource === 'captures' && envelope.action === 'find') {
    const data: any = envelope.data ?? {};
    const items: any[] = Array.isArray(data.items) ? data.items : [];
    const header = ['capture_id', 'method', 'status_code', 'host', 'path'].join('\t');
    const rows = items.map((it) =>
      [it.capture_id ?? '', it.method ?? '', it.status_code ?? '', it.host ?? '', it.path ?? ''].join('\t'),
    );
    return `${header}\n${rows.join('\n')}\n`;
  }

  if (envelope.resource === 'frames' && envelope.action === 'list') {
    const data: any = envelope.data ?? {};
    const items: any[] = Array.isArray(data.items) ? data.items : [];
    const header = ['frame_id', 'direction', 'ts', 'data'].join('\t');
    const rows = items.map((it) => [it.frame_id ?? '', it.direction ?? '', it.ts ?? '', it.data ?? ''].join('\t'));
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

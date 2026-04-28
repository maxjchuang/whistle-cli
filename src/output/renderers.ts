import type { OutputFormat } from '../cli/program';
import type { Envelope } from './result';

export function renderEnvelope(envelope: Envelope, format: OutputFormat): string {
  switch (format) {
    case 'pretty':
      return `${JSON.stringify(envelope, null, 2)}\n`;
    case 'ndjson':
    case 'json':
      return `${JSON.stringify(envelope)}\n`;
    case 'table':
      // Placeholder. `table` is a human-friendly view and will be added later.
      return `${JSON.stringify(envelope, null, 2)}\n`;
    default:
      return `${JSON.stringify(envelope)}\n`;
  }
}


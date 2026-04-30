import type { ErrorDetails } from './errors';

export type EnvelopeStatus = 'ok' | 'warning' | 'error' | 'blocked';

export type ResourceName =
  | 'instance'
  | 'rules'
  | 'values'
  | 'mocks'
  | 'captures'
  | 'composer'
  | 'frames'
  | 'certs'
  | 'proxy'
  | 'plugins'
  | 'doctor'
  | 'raw';

export interface NextAction {
  action: string;
  reason?: string;
}

export interface InstanceRef {
  id: string;
  name?: string;
}

export interface EnvelopeMeta {
  preview?: boolean;
  verified?: boolean;
  action_id?: string;
}

export interface Envelope<TData = unknown> {
  status: EnvelopeStatus;
  resource: ResourceName;
  action: string;
  /** Streaming event type for ndjson streams like `captures tail` (contract: output-contract.md). */
  event?: string;
  instance?: InstanceRef;
  effective?: boolean;
  data?: TData;
  warnings?: string[];
  next_actions?: NextAction[];
  meta?: EnvelopeMeta;
  error?: ErrorDetails;
}

export function okEnvelope<TData>(
  resource: ResourceName,
  action: string,
  data: TData,
  opts?: Partial<Pick<Envelope<TData>, 'event' | 'instance' | 'effective' | 'warnings' | 'next_actions' | 'meta'>>,
): Envelope<TData> {
  return {
    status: 'ok',
    resource,
    action,
    data,
    ...opts,
  };
}

export function blockedEnvelope<TData>(
  resource: ResourceName,
  action: string,
  data: TData,
  opts?: Partial<Pick<Envelope<TData>, 'event' | 'instance' | 'effective' | 'warnings' | 'next_actions' | 'meta'>>,
): Envelope<TData> {
  return {
    status: 'blocked',
    resource,
    action,
    data,
    effective: false,
    ...opts,
  };
}

export function warningEnvelope<TData>(
  resource: ResourceName,
  action: string,
  data: TData,
  warnings: string[],
  opts?: Partial<Pick<Envelope<TData>, 'event' | 'instance' | 'effective' | 'next_actions' | 'meta'>>,
): Envelope<TData> {
  return {
    status: 'warning',
    resource,
    action,
    data,
    warnings,
    ...opts,
  };
}

export function errorEnvelope(
  resource: ResourceName,
  action: string,
  error: { details: ErrorDetails } | ErrorDetails,
  opts?: Partial<Pick<Envelope, 'event' | 'instance' | 'effective' | 'warnings' | 'next_actions' | 'meta'>>,
): Envelope {
  const details = 'details' in error ? error.details : error;
  return {
    status: 'error',
    resource,
    action,
    error: details,
    effective: false,
    ...opts,
  };
}

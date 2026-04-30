import { InstanceService } from './instance-service';
import { loadConfig } from '../shared/config';
import { RuntimeClient } from '../backends/runtime/runtime-client';

export type FrameDirection = 'to_server' | 'to_client' | 'unknown';

export interface FrameRecord {
  frame_id: string;
  session_id: string;
  direction: FrameDirection;
  data?: string;
  ts?: string;
}

function parseDirection(v: unknown): FrameDirection {
  const s = String(v ?? '').toLowerCase();
  if (s === 'to_server' || s === 'server') return 'to_server';
  if (s === 'to_client' || s === 'client') return 'to_client';
  return 'unknown';
}

export class FramesService {
  private readonly instances: InstanceService;

  constructor(instances?: InstanceService) {
    this.instances = instances ?? new InstanceService();
  }

  private async runtimeClientForInstance(instanceId: string): Promise<RuntimeClient> {
    const cfg = loadConfig();
    if (cfg.runtimeUrl) return new RuntimeClient({ baseUrl: cfg.runtimeUrl });
    const st = await this.instances.status(instanceId);
    const baseUrl = `http://${st.host}:${st.port}`;
    return new RuntimeClient({ baseUrl });
  }

  async list(instanceId: string, sessionId: string, limit: number): Promise<{ session_id: string; count: number; items: FrameRecord[] }> {
    const client = await this.runtimeClientForInstance(instanceId);
    const res = await client.listFrames({ session_id: sessionId, limit });
    const rawItems = Array.isArray((res as any).items) ? ((res as any).items as any[]) : [];
    const items: FrameRecord[] = rawItems.map((r) => {
      const frame_id = String(r.frame_id ?? r.id ?? r.frameId ?? '');
      return {
        frame_id: frame_id || `frame_${Math.random().toString(16).slice(2)}`,
        session_id: sessionId,
        direction: parseDirection(r.direction ?? r.dir),
        data: r.data ? String(r.data) : r.payload ? String(r.payload) : undefined,
        ts: r.ts ? String(r.ts) : r.time ? String(r.time) : undefined,
      };
    });
    return { session_id: sessionId, count: items.length, items };
  }

  async send(instanceId: string, sessionId: string, data: string, direction?: FrameDirection): Promise<Record<string, unknown>> {
    const client = await this.runtimeClientForInstance(instanceId);
    return client.sendFrame({ session_id: sessionId, data, direction: direction === 'unknown' ? undefined : direction });
  }
}


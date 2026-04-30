import { InstanceService } from './instance-service';
import { loadConfig } from '../shared/config';
import { RuntimeClient } from '../backends/runtime/runtime-client';
import type { ComposeRequest } from './captures-model';

export interface ReplayRequest {
  instance_id: string;
  capture_id: string;
  overrides?: {
    method?: string;
    url?: string;
    headers?: Record<string, string>;
    body?: string;
  };
}

export class ComposerService {
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

  async replay(req: ReplayRequest): Promise<Record<string, unknown>> {
    const client = await this.runtimeClientForInstance(req.instance_id);
    return client.replayCapture({
      capture_id: req.capture_id,
      ...(req.overrides ?? {}),
    });
  }

  async compose(req: ComposeRequest): Promise<Record<string, unknown>> {
    const client = await this.runtimeClientForInstance(req.instance_id);
    const method = (req.method ?? 'GET').toUpperCase();
    const url = req.url ?? '';
    return client.composeRequest({
      method,
      url,
      headers: req.headers,
      body: req.body,
    });
  }
}


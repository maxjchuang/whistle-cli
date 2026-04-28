import { loadConfig } from './config';
import { StateStore } from '../backends/storage/state-store';

export interface ResolvedInstance {
  id: string;
  name: string;
}

export async function resolveInstanceId(explicit?: string): Promise<ResolvedInstance> {
  if (explicit?.trim()) {
    return { id: explicit.trim(), name: explicit.trim() };
  }

  const config = loadConfig();
  const store = new StateStore(config.stateDir);
  const state = await store.read();
  const id = state.current_instance_id ?? 'default';
  return { id, name: id };
}


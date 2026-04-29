import crypto from 'node:crypto';
import { loadConfig } from '../shared/config';
import { StateStore } from '../backends/storage/state-store';

export type FlowStatus = 'ready' | 'waiting_for_user' | 'verifying' | 'complete' | 'blocked' | 'failed';

export interface FlowState {
  flow_id: string;
  status: FlowStatus;
  current_step?: string;
  instruction?: string;
  completion_criteria?: string[];
  auto_checks?: string[];
}

export class FlowRunner {
  async create(initial: Omit<FlowState, 'flow_id'>): Promise<FlowState> {
    const flow_id = `flow_${crypto.randomUUID()}`;
    const flow: FlowState = { flow_id, ...initial };
    await this.save(flow);
    return flow;
  }

  async load(flowId: string): Promise<FlowState | null> {
    const config = loadConfig();
    const store = new StateStore(config.stateDir);
    const flows = await store.readFlows();
    const flow = flows[flowId];
    return (flow as FlowState | undefined) ?? null;
  }

  async save(flow: FlowState): Promise<void> {
    const config = loadConfig();
    const store = new StateStore(config.stateDir);
    const flows = await store.readFlows();
    flows[flow.flow_id] = flow;
    await store.writeFlows(flows);
  }

  async createWaitingForUser(input: {
    current_step: string;
    instruction: string;
    completion_criteria?: string[];
    auto_checks?: string[];
  }): Promise<FlowState> {
    return this.create({
      status: 'waiting_for_user',
      current_step: input.current_step,
      instruction: input.instruction,
      completion_criteria: input.completion_criteria,
      auto_checks: input.auto_checks,
    });
  }
}

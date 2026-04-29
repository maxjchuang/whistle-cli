import fs from 'node:fs/promises';
import path from 'node:path';

export interface StateFile {
  current_instance_id?: string;
}

export interface ActionLogRecord {
  action_id: string;
  resource: string;
  action: string;
  created_at: string;
  instance_id?: string;
  preview?: unknown;
  apply_result?: unknown;
  verify_result?: unknown;
  rollback?: unknown;
}

export class StateStore {
  private readonly stateFilePath: string;
  private readonly actionsFilePath: string;
  private readonly flowsFilePath: string;

  constructor(stateDir: string) {
    this.stateFilePath = path.join(stateDir, 'state.json');
    this.actionsFilePath = path.join(stateDir, 'actions.ndjson');
    this.flowsFilePath = path.join(stateDir, 'flows.json');
  }

  async read(): Promise<StateFile> {
    try {
      const raw = await fs.readFile(this.stateFilePath, 'utf8');
      return JSON.parse(raw) as StateFile;
    } catch {
      return {};
    }
  }

  async write(next: StateFile): Promise<void> {
    await fs.mkdir(path.dirname(this.stateFilePath), { recursive: true });
    await fs.writeFile(this.stateFilePath, JSON.stringify(next, null, 2), 'utf8');
  }

  async appendActionLog(record: ActionLogRecord): Promise<void> {
    await fs.mkdir(path.dirname(this.actionsFilePath), { recursive: true });
    await fs.appendFile(this.actionsFilePath, `${JSON.stringify(record)}\n`, 'utf8');
  }

  async findActionLog(actionId: string): Promise<ActionLogRecord | null> {
    try {
      const raw = await fs.readFile(this.actionsFilePath, 'utf8');
      // Newest entries at the end. Scan backwards to find the latest matching record.
      const lines = raw.split('\n');
      for (let i = lines.length - 1; i >= 0; i--) {
        const line = lines[i]?.trim();
        if (!line) continue;
        try {
          const parsed = JSON.parse(line) as ActionLogRecord;
          if (parsed.action_id === actionId) return parsed;
        } catch {
          // Ignore malformed lines.
        }
      }
      return null;
    } catch {
      return null;
    }
  }

  async readFlows(): Promise<Record<string, unknown>> {
    try {
      const raw = await fs.readFile(this.flowsFilePath, 'utf8');
      return JSON.parse(raw) as Record<string, unknown>;
    } catch {
      return {};
    }
  }

  async writeFlows(next: Record<string, unknown>): Promise<void> {
    await fs.mkdir(path.dirname(this.flowsFilePath), { recursive: true });
    await fs.writeFile(this.flowsFilePath, JSON.stringify(next, null, 2), 'utf8');
  }
}

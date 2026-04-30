import { RulesService } from './rules-service';
import { ValuesService } from './values-service';

export interface RulesSummary {
  total_rulesets: number;
  enabled_rulesets: number;
  disabled_rulesets: number;
  names_enabled: string[];
}

export interface ValuesSummary {
  total_values: number;
  keys: string[];
}

export interface ConfigExplainResult {
  instance_id: string;
  persistence_scope: 'persistent';
  rules: RulesSummary;
  values: ValuesSummary;
  notes?: string[];
}

export class ConfigExplainer {
  private readonly rules: RulesService;
  private readonly values: ValuesService;

  constructor(rulesService?: RulesService, valuesService?: ValuesService) {
    this.rules = rulesService ?? new RulesService();
    this.values = valuesService ?? new ValuesService();
  }

  async explain(instanceId: string): Promise<ConfigExplainResult> {
    const ruleSets = await this.rules.list(instanceId);
    const enabled = ruleSets.filter((r) => r.enabled);
    const disabled = ruleSets.filter((r) => !r.enabled);
    const values = await this.values.list(instanceId);

    return {
      instance_id: instanceId,
      persistence_scope: 'persistent',
      rules: {
        total_rulesets: ruleSets.length,
        enabled_rulesets: enabled.length,
        disabled_rulesets: disabled.length,
        names_enabled: enabled.map((r) => r.name),
      },
      values: {
        total_values: values.length,
        keys: values.map((v) => v.key),
      },
      notes: [
        'v1 默认把快捷命令和资源命令的规则/Values 变更视为持久化（persistent）。',
        '当前 explain 是静态摘要（基于存储层），不会验证运行时是否已生效。',
      ],
    };
  }
}


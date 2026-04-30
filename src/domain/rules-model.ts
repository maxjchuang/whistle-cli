export type RuleSetScope = 'global' | 'profile' | 'temporary';

export type RuleSetOrigin = 'user' | 'imported' | 'generated';

export interface RuleSet {
  /** Whistle instance id or baseDir identifier used by the CLI */
  instance_id: string;
  /** Whistle internal file id (stored under `.whistle/rules/files/<id>`) */
  file_id: string;
  /** Human-friendly name (best-effort; may fall back to file_id) */
  name: string;
  /** Whether the rule set is enabled in the current instance */
  enabled: boolean;
  /** Where this rule set “belongs” logically; v1 defaults to global */
  scope: RuleSetScope;
  /** Ordering hint if present in Whistle metadata */
  priority?: number;
  origin?: RuleSetOrigin;
  /** Raw rule DSL text when requested */
  source_text?: string;
}

export type RulePatchIntentType =
  | 'set_header'
  | 'map_local'
  | 'rewrite_body'
  | 'throttle'
  | 'enable_group'
  | 'disable_group'
  | 'custom';

export interface RulePatch {
  patch_id: string;
  instance_id: string;
  target_file_id?: string;
  intent_type: RulePatchIntentType;
  desired_effect: string;
  preview_diff?: string;
  verification_plan?: string;
}


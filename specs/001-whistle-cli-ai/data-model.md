# Data Model: Whistle AI CLI

## Overview

`whistle-cli` exposes an AI-friendly operational model over Whistle’s existing runtime, persisted configuration, and command surface. The public model separates user-intent objects from underlying Whistle implementation details.

## Entities

### WhistleInstance

- Purpose: Represents a target Whistle process and its associated working context.
- Fields:
  - `instance_id`: Stable logical identifier
  - `name`: Human-friendly label
  - `host`: Reachable host for proxy and Web UI
  - `port`: Primary listening port
  - `storage_path`: Whistle storage root used by this instance
  - `web_ui_url`: Reachable management URL
  - `status`: `stopped | starting | running | degraded | stopping`
  - `mode`: `desktop | headless`
  - `is_default`: Boolean
  - `last_seen_at`: Timestamp
- Relationships:
  - One instance owns many `RuleSet`, `MockRule`, `CaptureRecord`, `PluginRecord`, `CertificateState`, and `ProxyState` views.
- Validation:
  - `instance_id` must be unique within whistle-cli state.
  - `port` must be numeric and non-conflicting for local operations.

### RuleSet

- Purpose: Represents a named collection of persisted Whistle rules managed as one logical unit.
- Fields:
  - `ruleset_id`
  - `instance_id`
  - `name`
  - `scope`: `global | profile | temporary`
  - `enabled`: Boolean
  - `priority`: Ordered integer
  - `source_text`: Canonical underlying rule text
  - `summary`: Human-readable explanation
  - `last_applied_at`
  - `origin`: `user | imported | generated`
- Relationships:
  - One `RuleSet` may reference many `ValueEntry` items.
  - One `RuleSet` may be modified by many `RulePatch` operations.
- Validation:
  - Name must be unique within an instance and scope.
  - Priority must preserve deterministic ordering.

### RulePatch

- Purpose: Represents a structured requested mutation against one or more rules.
- Fields:
  - `patch_id`
  - `instance_id`
  - `target_ruleset_id`
  - `intent_type`: e.g. `set_header | map_local | rewrite_body | throttle | enable_group`
  - `matcher`
  - `desired_effect`
  - `preview_diff`
  - `verification_plan`
  - `status`: `previewed | applied | verified | rolled_back | failed`
- Relationships:
  - Belongs to one `RuleSet`.
  - May emit one or more `ActionLogEntry`.
- Validation:
  - Must retain enough structured information to regenerate a preview without rereading user intent.

### ValueEntry

- Purpose: Represents a reusable named value consumed by rules or plugins.
- Fields:
  - `value_id`
  - `instance_id`
  - `key`
  - `content_type`: `text | json | binary_ref`
  - `content`
  - `description`
  - `origin`
  - `updated_at`
- Relationships:
  - May be referenced by many `RuleSet` or `PluginRecord` entries.
- Validation:
  - `key` must be unique within the instance.
  - Content must be serializable or resolvable by the target backend.

### MockRule

- Purpose: Represents a mock-oriented response override exposed as a dedicated AI-friendly resource.
- Fields:
  - `mock_id`
  - `instance_id`
  - `name`
  - `match_host`
  - `match_path`
  - `match_method`
  - `response_status`
  - `response_headers`
  - `response_body`
  - `ttl`
  - `enabled`
  - `backing_ruleset_id`
- Relationships:
  - Maps to one or more underlying rule/value artifacts.
  - May be verified against matching `CaptureRecord` entries.
- Validation:
  - At least one matcher field must be supplied.
  - TTL, when present, must be positive and future-bounded.

### CaptureQuery

- Purpose: Represents a structured request for capture search, filtering, aggregation, or streaming.
- Fields:
  - `query_id`
  - `instance_id`
  - `filters`: host, path, method, status, time range, keyword, protocol, app source
  - `sort`
  - `limit`
  - `stream`: Boolean
  - `analysis_goal`: optional high-level intent such as `find_redirects`, `compare_headers`, `locate_proxy_route`
- Relationships:
  - Returns zero or more `CaptureRecord` entries.
- Validation:
  - `limit` must stay within configured safe bounds for AI consumption.

### CaptureRecord

- Purpose: Represents a single captured network event or session summary.
- Fields:
  - `capture_id`
  - `instance_id`
  - `protocol`: `http | https | http2 | websocket | tcp | tunnel`
  - `method`
  - `url`
  - `host`
  - `path`
  - `status_code`
  - `request_headers`
  - `response_headers`
  - `request_body_summary`
  - `response_body_summary`
  - `timing`
  - `matched_rules`
  - `error_flags`
  - `captured_at`
- Relationships:
  - May be replayed by a `ComposeRequest`.
  - May feed `DoctorReport` analysis.
- Validation:
  - Must preserve the original capture identifier from the runtime backend when available.

### ComposeRequest

- Purpose: Represents a replay or user-authored request construction task.
- Fields:
  - `compose_id`
  - `instance_id`
  - `base_capture_id`: optional
  - `method`
  - `url`
  - `headers`
  - `body`
  - `temporary_overrides`
  - `execution_mode`: `preview | send | send_and_capture`
  - `result_capture_id`: optional
- Relationships:
  - May originate from one `CaptureRecord`.
  - May generate one resulting `CaptureRecord`.
- Validation:
  - Must be serializable into the runtime/composer backend.

### CertificateState

- Purpose: Represents the Whistle CA lifecycle and trust state for a target environment.
- Fields:
  - `cert_state_id`
  - `instance_id`
  - `target_env`: `local_system | browser | mobile_device`
  - `ca_present`
  - `ca_trusted`
  - `install_material_path`
  - `last_checked_at`
  - `blocking_reason`
- Relationships:
  - May be inspected or modified by an `InteractiveFlow`.
- Validation:
  - Target environment must be explicit for installation and verification tasks.

### ProxyState

- Purpose: Represents effective proxy routing from the user’s environment to a Whistle instance.
- Fields:
  - `proxy_state_id`
  - `instance_id`
  - `mode`: `system | app_specific | browser_extension | off`
  - `target_host`
  - `target_port`
  - `effective`
  - `verification_method`
  - `last_checked_at`
- Relationships:
  - Closely coupled with one `WhistleInstance`.
  - Often referenced by `DoctorReport`.
- Validation:
  - `effective` must be backed by a verification step, not only by requested config.

### PluginRecord

- Purpose: Represents an installed or discoverable Whistle plugin.
- Fields:
  - `plugin_id`
  - `instance_id`
  - `name`
  - `version`
  - `installed`
  - `enabled`
  - `description`
  - `capability_manifest`: optional reserved field for future standardized plugin actions
  - `config_state_summary`
- Relationships:
  - May expose related rules, values, or future plugin actions.
- Validation:
  - Name must map to a unique plugin identity per instance.

### InteractiveFlow

- Purpose: Represents a multi-step operation that may require user action between automated checks.
- Fields:
  - `flow_id`
  - `instance_id`
  - `flow_type`: `cert_install_local | cert_install_mobile | proxy_set | doctor_https_capture`
  - `current_step`
  - `steps`
  - `status`: `ready | waiting_for_user | verifying | complete | blocked | failed`
  - `blocking_instruction`
  - `auto_verification_targets`
- Relationships:
  - May operate on `CertificateState`, `ProxyState`, or `WhistleInstance`.
- Validation:
  - Each step must declare whether it is CLI-automated, user-executed, or verification-only.

### ActionLogEntry

- Purpose: Represents an auditable record of an AI- or user-issued action.
- Fields:
  - `action_id`
  - `instance_id`
  - `resource_type`
  - `resource_id`
  - `operation`
  - `requested_by`: `ai | user | shortcut | raw`
  - `preview_summary`
  - `apply_result`
  - `verify_result`
  - `rollback_reference`
  - `created_at`
- Relationships:
  - May reference any mutable entity.
- Validation:
  - Mutating actions must generate a log entry.
  - Rollback-capable actions must persist enough context to undo the change.

### DoctorReport

- Purpose: Represents a structured diagnosis for a failed or uncertain Whistle workflow.
- Fields:
  - `report_id`
  - `instance_id`
  - `doctor_type`: `https_capture | proxy_routing | instance_status | capture_analysis`
  - `inputs`
  - `findings`
  - `severity`: `info | warning | error`
  - `suggested_actions`
  - `generated_at`
- Relationships:
  - May reference `WhistleInstance`, `CertificateState`, `ProxyState`, and `CaptureRecord`.
- Validation:
  - Findings must be serializable into both JSON output and human-readable summaries.

## State Transitions

### Mutation Lifecycle

- `previewed -> applied -> verified`
- Failure branches:
  - `previewed -> failed`
  - `applied -> failed`
  - `applied -> rolled_back`
  - `verified -> rolled_back` for explicit user reversal

### Interactive Flow Lifecycle

- `ready -> waiting_for_user -> verifying -> complete`
- Failure branches:
  - `ready -> blocked`
  - `waiting_for_user -> blocked`
  - `verifying -> failed`

### Instance Lifecycle

- `stopped -> starting -> running`
- `running -> stopping -> stopped`
- `running -> degraded` when the process is up but key capabilities fail validation

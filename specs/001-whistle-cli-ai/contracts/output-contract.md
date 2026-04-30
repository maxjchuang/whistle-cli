# Contract: Output Envelope

## Purpose

Define the canonical machine-readable response format for `whistle-cli`.

## Common Envelope

All JSON responses should conform to the following high-level shape:

```json
{
  "status": "ok | warning | error | blocked",
  "resource": "instance | rules | values | captures | composer | frames | certs | proxy | plugins | doctor | raw",
  "action": "string",
  "instance": {
    "id": "default",
    "name": "default"
  },
  "effective": true,
  "data": {},
  "warnings": [],
  "next_actions": [],
  "meta": {
    "preview": false,
    "verified": true,
    "action_id": "act_xxx"
  }
}
```

## Mutation Response

Mutating responses should include:

- `changed`: list of added, updated, removed, enabled, disabled, or reordered objects
- `preview_diff`: structured before/after summary when previewed
- `effective`: whether runtime verification confirms the change is live
- `rollback`: rollback handle or action id when supported

## Read Response

Read responses should include:

- `filters`: resolved query filters
- `count`: number of returned items
- `items`: returned resources
- `analysis`: optional AI-friendly summaries or diagnostics derived from the raw data

## Flow Response

Interactive or guided flows should include:

- `flow_id`
- `current_step`
- `status`
- `requires_user_action`
- `instruction`
- `auto_checks`
- `completion_criteria`

## Error Contract

Errors should use a stable code set with machine-readable hints.

```json
{
  "status": "error",
  "resource": "proxy",
  "action": "set",
  "error": {
    "code": "PROXY_NOT_ACTIVE",
    "message": "System proxy is not pointing to the target Whistle instance.",
    "reason": "The requested host:port does not match the active proxy settings.",
    "suggested_fix": "Run proxy set for the target instance, then verify again."
  },
  "next_actions": [
    {
      "action": "proxy set",
      "reason": "Re-point the system proxy to the selected instance."
    }
  ]
}
```

### Initial Stable Error Codes

- `INSTANCE_NOT_RUNNING`
- `INSTANCE_PORT_CONFLICT`
- `CERT_NOT_INSTALLED`
- `CERT_NOT_TRUSTED`
- `PROXY_NOT_ACTIVE`
- `RULE_CONFLICT`
- `RULE_VERIFY_FAILED`
- `NO_CAPTURE_MATCH`
- `CAPTURE_BACKEND_UNAVAILABLE`
- `PLUGIN_NOT_INSTALLED`
- `PLUGIN_CAPABILITY_UNAVAILABLE`
- `PERMISSION_REQUIRED`
- `USER_ACTION_REQUIRED`
- `UNSUPPORTED_OPERATION`

## Streaming Contract

Streaming commands such as `captures tail` should support `ndjson` output, one envelope per line, with a stable `event` field such as:

- `capture`
- `summary`
- `warning`
- `error`
- `end`

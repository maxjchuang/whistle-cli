# Contract: Capture Watch and Assertion Commands

## `captures watch`

Purpose: Stream newly observed matching capture summaries.

Command shape:

```bash
whistle-cli --format ndjson captures watch \
  --backend whistle-web \
  --host <host> \
  --path <path-substring> \
  --method <method> \
  --status <status> \
  --keyword <keyword> \
  --since now \
  --timeout 60s \
  --poll-interval 2s
```

Expected events:

- `event: "capture"` for each new matching summary.
- `event: "end"` when timeout or limit ends the watch.
- `event: "error"` for backend or validation failures.

## `captures assert-request`

Purpose: Wait for the first newly observed matching request and return one JSON envelope.

Command shape:

```bash
whistle-cli --format json captures assert-request \
  --backend whistle-web \
  --host <host> \
  --path <path-substring> \
  --method <method> \
  --status <status> \
  --keyword <keyword> \
  --timeout 60s \
  --poll-interval 2s \
  --fields capture_id,method,status_code,path,x_tt_logid,request_id,env,referer,matched_rules_summary \
  --save ./captures/latest.json
```

Success envelope:

```json
{
  "status": "ok",
  "resource": "captures",
  "action": "assert-request",
  "data": {
    "matched": true,
    "classification": "MATCHED",
    "observed": 1,
    "match": {
      "capture_id": "1779802673027-868",
      "method": "GET",
      "status_code": 200,
      "path": "/space/api/workspace/chatbot/7644029911824633053/skills",
      "x_tt_logid": "02177980267301200000000000000000000fffffd73fc1fa73248",
      "request_id": "MvRMQM9Wb1hV-c6e3b508792e00da0beab5aecf13fcd1f9970799",
      "env": "pre_release",
      "referer": "https://app.example.com/base/agent/7644029911824633053",
      "matched_rules_summary": ["/^https?:\\/\\/[^/]+\\.example\\.com\\// reqHeaders://env=pre_release"],
      "redacted_headers": ["cookie"]
    }
  },
  "effective": true
}
```

Timeout envelope:

```json
{
  "status": "warning",
  "resource": "captures",
  "action": "assert-request",
  "data": {
    "matched": false,
    "classification": "TIMEOUT",
    "observed": 0,
    "filters": {
      "host": "app.example.com",
      "path": "/space/api/workspace/chatbot/"
    },
    "next_actions": [
      "Trigger the target UI action again while the capture watch is active.",
      "Broaden the path filter only if the target endpoint is unknown."
    ]
  },
  "effective": false
}
```

## Field Projection and Redaction

- `--fields` limits summary fields.
- Sensitive request headers are redacted by default.
- Raw capture output remains outside the default assert/watch contract.

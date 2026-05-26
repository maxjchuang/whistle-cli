# Data Model: Agent-Driven Capture Workflow Reliability

## CaptureWatchSession

- **Purpose**: Represents a bounded attempt to observe matching captures after a known start point.
- **Fields**:
  - `instance_id`: Whistle instance id.
  - `backend`: `auto`, `runtime`, or `whistle-web`.
  - `filters`: CaptureFilter.
  - `timeout_ms`: Maximum wait duration.
  - `poll_interval_ms`: Delay between Web backend polls.
  - `baseline_capture_ids`: Capture ids visible when the session starts.
  - `started_at` / `ended_at`: ISO timestamps for reporting.
  - `result`: `matched` or `timeout`.

## CaptureFilter

- **Purpose**: Selects relevant traffic.
- **Fields**:
  - `host`: Optional host substring or exact host filter matching existing behavior.
  - `path`: Optional path substring.
  - `method`: Optional HTTP method.
  - `status`: Optional status code.
  - `keyword`: Optional keyword search.

## CaptureSummary

- **Purpose**: Safe, high-signal representation for agent output.
- **Fields**:
  - `capture_id`
  - `method`
  - `status_code`
  - `url`
  - `host`
  - `path`
  - `x_tt_logid`
  - `request_id`
  - `env`
  - `x_tt_env`
  - `referer`
  - `matched_rules_summary`
  - `redacted_headers`: names of sensitive headers omitted from output.

## CaptureAssertResult

- **Purpose**: Structured result for `captures assert-request`.
- **Fields**:
  - `matched`: boolean.
  - `classification`: `MATCHED` or `TIMEOUT`.
  - `observed`: number of matching captures seen after baseline.
  - `match`: CaptureSummary when matched.
  - `filters`: CaptureFilter.
  - `next_actions`: actions to take on timeout.

## IntentMapping

- **Purpose**: Documents common natural-language capture goals in the skill.
- **Fields**:
  - `intent_name`
  - `recommended_filters`
  - `user_trigger_instruction`
  - `expected_diagnostic_fields`

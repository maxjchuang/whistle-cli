# Data Model: Whistle Web Capture Retrieval

## CaptureLookupOptions

- `instance_id`: Target Whistle instance id.
- `backend`: `whistle-web` or `runtime`.
- `capture_id`: Capture id to find.
- `limit`: Recent Whistle Web data window size.

## CaptureHeaderResult

- `capture_id`: Exact capture id.
- `backend`: Backend used for lookup.
- `header`: Header name as requested by the user.
- `value`: Header value from the capture request headers.

## WhistleWebExportResult

- `backend`: `whistle-web`.
- `format`: `json`.
- `filters`: Host/path/method/status/keyword filters used.
- `count`: Number of returned records.
- `items`: Normalized capture records.

## CaptureRecord

Existing normalized capture model remains unchanged:

- `capture_id`
- `instance_id`
- `backend`
- `protocol`
- `method`
- `url`
- `host`
- `path`
- `status_code`
- `request_headers`
- `matched_rules`

## Validation Rules

- `capture_id` is required for exact get and get-header.
- `header` is required for get-header and matched case-insensitively.
- Whistle Web JSON export supports `json` only.
- Explicit retrieval commands may return captured request header values.

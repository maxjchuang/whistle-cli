# Data Model: Runtime Backend Server

## RuntimeBackendOptions

- `host`: Host interface for the local backend to bind.
- `port`: TCP port for the local backend. `0` allows the OS to choose a free port for tests.
- `targetBaseUrl`: Base URL for the running Whistle Web API.
- `requestTimeoutMs`: Timeout for Whistle Web and outbound compose/replay requests.
- `captureLimit`: Default maximum captures to read from Whistle Web.

## RuntimeCaptureRecord

- `capture_id`: Stable capture id.
- `protocol`: Normalized protocol: `http`, `https`, `http2`, `websocket`, `tcp`, `tunnel`, or `unknown`.
- `method`: HTTP method when present.
- `url`: Full request URL when present.
- `host`: Host header or URL host.
- `path`: URL path and query.
- `status_code`: Response status when present.
- `request_headers`: Lower-cased request headers.
- `matched_rules`: Matched rule evidence when exposed by Whistle Web data.
- `raw`: Original normalized record is not emitted by default, but the backend may keep the source payload in memory for replay.

## RuntimeCaptureCache

- `recordsById`: Map of capture id to normalized record and source request details.
- `lastRefreshAt`: Timestamp of last Whistle Web read.
- `sourceCount`: Number of source records inspected during last refresh.

## RuntimeRequestExecution

- `method`: Outbound HTTP method.
- `url`: Outbound URL.
- `headers`: Optional request headers.
- `body`: Optional request body.
- `timeoutMs`: Effective timeout for the request.

## RuntimeResponseSummary

- `ok`: Boolean indicating whether the fetch completed.
- `method`: Request method.
- `url`: Request URL.
- `status`: HTTP response status when available.
- `status_text`: HTTP response status text when available.
- `headers`: Response headers as string values.
- `body_length`: Number of response body bytes or characters read.
- `body_preview`: Small text preview for diagnostic use.

## RuntimeErrorEnvelope

- `error.code`: Stable code such as `BAD_REQUEST`, `TARGET_UNAVAILABLE`, `UNSUPPORTED_OPERATION`, or `REQUEST_FAILED`.
- `error.message`: Human-readable failure.
- `error.reason`: Optional detailed reason.
- `error.suggested_fix`: Optional actionable next step.

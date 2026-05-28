# Quickstart: Whistle Web Capture Retrieval

## Detect A New Browser Request

```bash
whistle-cli --format json captures assert-request \
  --backend whistle-web \
  --host app.example.com \
  --path /api/ \
  --timeout 90s \
  --poll-interval 2s \
  --fields capture_id,method,status_code,path,referer
```

Copy the returned `data.match.capture_id`.

## Retrieve Exact Capture

```bash
whistle-cli --format json captures get \
  --backend whistle-web \
  --id <capture_id>
```

## Extract One Header

```bash
whistle-cli --format json captures get-header \
  --backend whistle-web \
  --id <capture_id> \
  --header cookie
```

The command returns the explicitly requested header value. Avoid logging this output when the header contains credentials.

## Export Filtered Whistle Web Captures

```bash
whistle-cli --format json captures export \
  --backend whistle-web \
  --host app.example.com \
  --path /api/ \
  --export-format json
```

## Direct Whistle Web Fallback

If direct fallback is unavoidable, use `dumpCount` to widen the returned Whistle Web data window:

```text
GET /cgi-bin/get-data?startTime=0&dumpCount=1000
```

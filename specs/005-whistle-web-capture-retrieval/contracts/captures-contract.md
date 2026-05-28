# Capture Command Contract Updates

## `captures get`

### Whistle Web Backend

```bash
whistle-cli --format json captures get --backend whistle-web --id <capture_id>
```

Success envelope data is a normalized capture record:

```json
{
  "capture_id": "cap_1",
  "backend": "whistle-web",
  "method": "GET",
  "url": "https://app.example.com/api/widgets",
  "request_headers": {
    "cookie": "session=abc"
  }
}
```

If the capture is absent from the current Whistle Web data window, the command returns an error envelope with `NO_CAPTURE_MATCH`.

## `captures export`

### Whistle Web JSON Export

```bash
whistle-cli --format json captures export \
  --backend whistle-web \
  --host app.example.com \
  --path /api/ \
  --export-format json
```

Success envelope data:

```json
{
  "backend": "whistle-web",
  "format": "json",
  "filters": {
    "host": "app.example.com",
    "path": "/api/"
  },
  "count": 1,
  "items": []
}
```

`--export-format har` with `--backend whistle-web` returns `UNSUPPORTED_OPERATION`.

## `captures get-header`

```bash
whistle-cli --format json captures get-header \
  --backend whistle-web \
  --id <capture_id> \
  --header cookie
```

Success envelope data:

```json
{
  "capture_id": "cap_1",
  "backend": "whistle-web",
  "header": "cookie",
  "value": "session=abc"
}
```

Rules:

- Header lookup is case-insensitive.
- Only the requested header is returned.
- No extra sensitive-output flag is required.
- Missing capture or missing header returns a stable error envelope.

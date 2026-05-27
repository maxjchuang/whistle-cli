# Runtime Backend Contract

The runtime backend exposes HTTP routes under `__whistle_cli__` and is consumed by `RuntimeClient`.

## Capture Routes

### `GET /__whistle_cli__/captures/find`

Query parameters:

- `host`
- `path`
- `method`
- `status`
- `keyword`
- `limit`

Response:

```json
{
  "items": [
    {
      "id": "n1",
      "capture_id": "n1",
      "protocol": "https",
      "method": "GET",
      "url": "https://example.com/api/ok",
      "host": "example.com",
      "path": "/api/ok",
      "status_code": 200,
      "request_headers": {
        "host": "example.com"
      },
      "matched_rules": {}
    }
  ]
}
```

### `GET /__whistle_cli__/captures/get?id=<capture-id>`

Response:

```json
{
  "item": {
    "capture_id": "n1",
    "method": "GET",
    "url": "https://example.com/api/ok"
  }
}
```

### `GET /__whistle_cli__/captures/export`

Uses the same filters as `find`.

Response:

```json
{
  "items": [],
  "format": "json"
}
```

### `GET /__whistle_cli__/captures/tail`

Uses the same filters as `find`. The response content type is `application/x-ndjson`. Each line is one runtime capture record. The first implementation is bounded by `limit` and completes after emitting the current matching snapshot.

## Composer Routes

### `POST /__whistle_cli__/composer/compose`

Request:

```json
{
  "method": "POST",
  "url": "https://example.com/api",
  "headers": {
    "content-type": "application/json"
  },
  "body": "{}"
}
```

Response:

```json
{
  "ok": true,
  "method": "POST",
  "url": "https://example.com/api",
  "status": 200,
  "status_text": "OK",
  "headers": {},
  "body_length": 12,
  "body_preview": "{\"ok\":true}"
}
```

### `POST /__whistle_cli__/composer/replay`

Request:

```json
{
  "capture_id": "n1",
  "headers": {
    "x-debug": "1"
  }
}
```

The backend looks up the capture from the latest capture cache, applies overrides, and executes the request. Response shape matches `compose`.

## Frame Routes

### `GET /__whistle_cli__/frames/list`

Returns HTTP 501 with an unsupported-operation error envelope.

### `POST /__whistle_cli__/frames/send`

Returns HTTP 501 with an unsupported-operation error envelope.

## Error Response

```json
{
  "error": {
    "code": "UNSUPPORTED_OPERATION",
    "message": "Runtime frame routes are not implemented",
    "suggested_fix": "Use capture and composer runtime routes, or implement frame support in a later feature."
  }
}
```

# Quickstart: Runtime Backend Server

## Start Whistle

```bash
npm run dev -- instance status --format json
```

Use the reported Whistle UI URL, usually `http://127.0.0.1:8899`, as the runtime backend target.

## Start Runtime Backend

```bash
npm run dev -- runtime serve --target-url http://127.0.0.1:8899 --host 127.0.0.1 --port 8898
```

In another shell:

```bash
export WHISTLE_CLI_RUNTIME_URL=http://127.0.0.1:8898
```

## Verify Capture Runtime Routes

```bash
npm run dev -- captures find --backend runtime --host example.com --format json
npm run dev -- captures export --backend runtime --host example.com --format json
npm run dev -- captures tail --backend runtime --host example.com --limit 5 --format ndjson
```

## Verify Composer Runtime Routes

```bash
npm run dev -- composer compose --method GET --url https://example.com --apply --format json
```

## Expected Behavior

- Runtime capture commands should return structured output instead of `RUNTIME_BACKEND_UNAVAILABLE`.
- Runtime tail should emit bounded NDJSON and terminate for command-line use.
- Frame routes should return a structured unsupported-operation error until a later frame-support feature.

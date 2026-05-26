# Quickstart: Capture Workflow Reliability

## Verify Whistle

```bash
whistle-cli --format json instance status
whistle-cli --format json proxy status
```

## Capture a chatbot skill-list request

Start the assertion before triggering the UI:

```bash
whistle-cli --format json captures assert-request \
  --backend whistle-web \
  --host app.example.com \
  --path /space/api/workspace/chatbot/ \
  --keyword /skills \
  --timeout 60s \
  --poll-interval 2s \
  --fields capture_id,method,status_code,path,x_tt_logid,request_id,env,referer,matched_rules_summary
```

Then trigger the chatbot skill list in the browser.

Expected result:

- `matched: true`
- `classification: MATCHED`
- `match.x_tt_logid` is present when the backend emits `x-tt-logid`
- No cookie or authorization values appear in the output

## Stream matching captures

```bash
whistle-cli --format ndjson captures watch \
  --backend whistle-web \
  --host app.example.com \
  --path /space/api/workspace/chatbot/ \
  --since now \
  --timeout 60s
```

## Timeout behavior

If no match is observed, the command returns next actions instructing the user to trigger the exact UI action again while the watch is active.

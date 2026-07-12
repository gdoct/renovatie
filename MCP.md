# Talking to your board from Claude (MCP)

The backend ships a built-in [MCP](https://modelcontextprotocol.io/) server, so you can manage
your renovation board in natural language from Claude — "add 'request painter quote' to the
bathroom backlog", "what has the bathroom cost so far?", "mark the tile task as done". No API
key or LLM integration is needed in the app itself: Claude (Desktop, Code, or the apps) provides
the model and the chat UI, and calls the tools below over HTTP.

## Endpoint

| Setup | URL |
|---|---|
| Local development (`uvicorn app.main:app --port 8000`) | `http://localhost:8000/mcp` |
| Docker deployment (API mounted under `/api`) | `http://<host>:5567/api/mcp` |

The transport is streamable HTTP (stateless), the current MCP default.

## Connecting a Claude client

### Claude Code

```bash
claude mcp add --transport http renovatie http://<host>:5567/api/mcp
```

Then ask things like *"list my renovation projects"* in a session. `claude mcp list` should show
the server as connected. This is the quickest way to verify the endpoint works.

### Claude Desktop

Desktop's **Settings → Connectors → Add custom connector** accepts a remote MCP URL. Custom
connectors generally expect HTTPS for non-localhost hosts; for a plain-HTTP server on your LAN,
the reliable route is the [`mcp-remote`](https://www.npmjs.com/package/mcp-remote) bridge
(requires Node.js) in `claude_desktop_config.json` (Settings → Developer → Edit Config):

```json
{
  "mcpServers": {
    "renovatie": {
      "command": "npx",
      "args": ["-y", "mcp-remote", "http://<host>:5567/api/mcp", "--allow-http"]
    }
  }
}
```

Restart Claude Desktop; the Renovatie tools appear under the tools icon in the chat box.

### claude.ai and the mobile app

Remote connectors on claude.ai/mobile connect from Anthropic's servers, so the endpoint must be
**publicly reachable over HTTPS** — and therefore must not be exposed without authentication
(see below). A Cloudflare Tunnel or Tailscale Funnel in front of the Docker host is the usual
low-effort way to get HTTPS; add an auth layer before doing this.

## What Claude can do

Read tools:

- `list_projects`, `list_users`, `list_rooms`, `list_features`
- `list_pbis` — work items with their tasks and costs, filterable by room/feature/status
- `get_pbi` — one work item incl. tasks, costs, and comments
- `cost_summary` — estimated/actual totals, overall and per room
- `list_comments`

Write tools:

- `create_pbi`, `update_pbi` (status changes, reprioritizing, moving between rooms), `delete_pbi`
- `create_task`, `update_task`
- `create_cost`, `update_cost`
- `create_room`, `create_feature`, `add_comment`

All domain rules from the REST API apply identically — the tools call the same code. In
particular, `delete_pbi` is the app's soft delete (reversible by setting a status again), and
the write surface is deliberately conservative: there are no tools that hard-delete rooms,
features, projects, or users, and update tools cannot clear fields to null.

Example prompts:

> Voeg "stukadoor offerte aanvragen" toe aan de badkamer, toegewezen aan Guido.

> What's left to do in the kitchen, and what will it roughly cost?

> Mark the "tegels kopen" cost as purchased at €840 and move the PBI to done.

## Security

**The MCP endpoint has no authentication**, matching the rest of the app ("intended for your
trusted home network"). Anyone who can reach the port can read and modify board data through
it. Keep it LAN-only (or tailnet-only); do not port-forward or tunnel it to the public internet
as-is. Adding an auth layer (a bearer token check, or an authenticating proxy such as
Cloudflare Access) is a prerequisite for exposing it to claude.ai or the mobile app.

## Development notes

- The server lives in [`backend/app/mcp_server.py`](backend/app/mcp_server.py); tools wrap the
  FastAPI router functions directly (same process and database), and router `HTTPException`s
  are converted into MCP tool errors so Claude can react to "PBI not found" or "PBI is deleted".
- It is mounted at `/mcp` on the API app in `main.py`; in production `serve.py` mounts the API
  under `/api`, hence `/api/mcp`. The MCP session manager runs inside the shared lifespan in
  `main.py`.
- Quick smoke test (from `backend/`, against a running dev server):

  ```bash
  uv run python - <<'EOF'
  import asyncio
  from mcp import ClientSession
  from mcp.client.streamable_http import streamablehttp_client

  async def main():
      async with streamablehttp_client("http://localhost:8000/mcp") as (r, w, _):
          async with ClientSession(r, w) as s:
              await s.initialize()
              print([t.name for t in (await s.list_tools()).tools])

  asyncio.run(main())
  EOF
  ```

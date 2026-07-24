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
| Docker deployment with HTTPS (see below) | `https://<host>:8443/api/mcp` |

The transport is streamable HTTP (stateless), the current MCP default.

## HTTPS

`./setup-https.sh` sets up TLS on the Docker host: it generates a local CA in `tls/`
(gitignored), issues a server certificate covering the host's names and LAN/Tailscale IPs,
and configures the host's nginx to terminate TLS on port 8443 and proxy to the app.
Re-run it to renew the certificate (valid 825 days; the CA lasts 10 years). This gives you
warning-free browser access, an encrypted MCP transport on the LAN, and the groundwork for
ever exposing the app beyond it.

Each client machine must then trust `tls/ca.crt` once:

- **Windows**: `certutil.exe -user -addstore Root ca.crt`, or double-click the file →
  Install Certificate → Current User → Trusted Root Certification Authorities.
- **Linux**: `sudo cp tls/ca.crt /usr/local/share/ca-certificates/renovatie-ca.crt && sudo update-ca-certificates`
- **Android/iOS**: send `ca.crt` to the device and install it as a CA certificate in the
  security settings.

Note that HTTPS is transport encryption only — the endpoint is still unauthenticated
(see Security below).

## Connecting a Claude client

### Claude Code

```bash
claude mcp add --transport http renovatie http://<host>:5567/api/mcp
```

Then ask things like *"list my renovation projects"* in a session. `claude mcp list` should show
the server as connected. This is the quickest way to verify the endpoint works.

### Claude Desktop

**Don't use "Add custom connector" for a LAN server** — custom connectors are brokered by
Anthropic's cloud (the handshake bounces through claude.ai), so they can only reach publicly
accessible URLs. For a server on your home network, use the local
[`mcp-remote`](https://www.npmjs.com/package/mcp-remote) bridge instead: a small process on
your own machine (needs Node.js) that Claude Desktop talks to over stdio and that forwards to
the MCP endpoint directly. Configure it in `claude_desktop_config.json`
(Settings → Developer → Edit Config):

```json
{
  "mcpServers": {
    "renovatie": {
      "command": "npx",
      "args": ["-y", "mcp-remote", "https://<host>:8443/api/mcp"],
      "env": { "NODE_EXTRA_CA_CERTS": "<path to tls/ca.crt>" }
    }
  }
}
```

(Node reads its own CA bundle, not the OS trust store — hence `NODE_EXTRA_CA_CERTS`. Without
HTTPS, use `http://<host>:5567/api/mcp` plus an `--allow-http` argument and drop the `env`.)

On Windows with Node living in WSL, launch the bridge through `wsl.exe`:

```json
{
  "mcpServers": {
    "renovatie": {
      "command": "wsl.exe",
      "args": [
        "-e", "bash", "-c",
        "export NODE_EXTRA_CA_CERTS=/home/<user>/renovatie/tls/ca.crt; . \"$HOME/.nvm/nvm.sh\"; exec npx -y mcp-remote https://<host>:8443/api/mcp"
      ]
    }
  }
}
```

(`wsl.exe` spawns a bare non-login shell, so nvm-managed Node is not on PATH — hence sourcing
`nvm.sh` first. With a system-wide Node in WSL, plain `npx` works without it.)

Note: the Microsoft Store version of Claude Desktop does **not** read
`%APPDATA%\Claude\claude_desktop_config.json` — its config lives inside the package sandbox at
`%LOCALAPPDATA%\Packages\Claude_<id>\LocalCache\Roaming\Claude\claude_desktop_config.json`
(preserve the other keys in that file when editing). Settings → Developer → Edit Config opens
the right file either way.

Fully restart Claude Desktop afterwards (quit it from the system tray — closing the window
is not enough); the Renovatie tools then appear under the tools icon in the chat box.

### claude.ai, the mobile app, and Desktop custom connectors

All of these use remote connectors that connect from Anthropic's servers, so the endpoint must
be **publicly reachable over HTTPS with a publicly trusted certificate** — and therefore must
not be exposed without authentication (see below). A Cloudflare Tunnel or Tailscale Funnel in
front of the Docker host is the usual low-effort way to get there; add an auth layer before
doing this.

## What Claude can do

Read tools:

- `list_projects`, `list_users`, `list_rooms`, `list_features`
- `list_pbis` — work items with their tasks and costs, filterable by room/feature/status
- `get_pbi` — one work item incl. tasks, costs, and comments
- `cost_summary` — estimated/actual totals, overall and per room
- `list_feature_dependencies` — timeline constraints ("feature X can only start once PBI Y is done")
- `list_comments`

Write tools:

- `create_pbi`, `update_pbi` (status changes, reprioritizing, moving between rooms), `delete_pbi`
- `create_task`, `update_task`
- `create_cost`, `update_cost`
- `create_room`, `create_feature`, `add_comment`
- `update_feature` — rename/describe a feature or plan it on the timeline (`start_date`/`end_date`)
- `add_feature_dependency`, `remove_feature_dependency`

All domain rules from the REST API apply identically — the tools call the same code. In
particular, `delete_pbi` is the app's soft delete (reversible by setting a status again), and
the write surface is deliberately conservative: there are no tools that hard-delete rooms,
features, projects, or users, and update tools cannot clear fields to null.

Example prompts:

> Voeg "stukadoor offerte aanvragen" toe aan de badkamer, toegewezen aan Guido.

> What's left to do in the kitchen, and what will it roughly cost?

> Mark the "tegels kopen" cost as purchased at €840 and move the PBI to done.

## Security

**The MCP endpoint has no authentication.** The REST API and web app require a login (JWT),
but MCP clients (Claude Desktop/Code) have no login flow, so `/api/mcp` deliberately bypasses
it — its trust boundary is the network. Anyone who can reach the port can read and modify
board data through it. Keep it LAN-only (or tailnet-only); do not port-forward or tunnel it to
the public internet as-is. Adding an auth layer (a static bearer token check, or an
authenticating proxy such as Cloudflare Access) is a prerequisite for exposing it to claude.ai
or the mobile app.

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

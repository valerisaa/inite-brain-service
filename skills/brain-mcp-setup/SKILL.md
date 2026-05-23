---
name: brain-mcp-setup
description: Walk a developer through connecting a fresh MCP client (Claude Desktop, Cursor, Goose, n8n) to the INITE Brain service. Covers obtaining an API key, the per-tenant URL shape, config snippets, and the smoke test. Use when the user says "add brain MCP", "connect brain to Claude", "set up brain for Cursor".
---

# brain-mcp-setup

INITE Brain ships a Streamable HTTP MCP endpoint at `/mcp/:companyId`. Each tenant has its own URL, scoped by API key. This skill walks the user from zero to "tools visible in Claude".

## What the user needs

1. A **brain API key** for their company (format `brain_<base64>`).
2. The **companyId** the key was issued for (visible at `https://brain.inite.ai/admin/keys`).
3. The **MCP URL**: `https://brain.inite.ai/mcp/<companyId>`.
4. One of: Claude Desktop, Cursor, Goose, n8n.

If they don't have a key yet, point them to `https://brain.inite.ai/admin/keys` and pause. Brain refuses unsigned MCP calls — there's no anonymous mode.

## Claude Desktop

Edit `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS) or `%APPDATA%\Claude\claude_desktop_config.json` (Windows):

```json
{
  "mcpServers": {
    "brain": {
      "url": "https://brain.inite.ai/mcp/<companyId>",
      "transport": "http",
      "headers": {
        "Authorization": "Bearer <api-key>"
      }
    }
  }
}
```

Restart Claude Desktop. The brain server should appear in the MCP panel with six tools (or four, if the key only has `brain:read`).

## Cursor

Edit `.cursor/mcp.json` in the user's workspace (or `~/.cursor/mcp.json` for global):

```json
{
  "mcpServers": {
    "brain": {
      "url": "https://brain.inite.ai/mcp/<companyId>",
      "transport": "http",
      "headers": {
        "Authorization": "Bearer <api-key>"
      }
    }
  }
}
```

Reload the workspace. Brain tools become available under `@brain` in the AI panel.

## Goose

Edit `~/.config/goose/config.yaml`:

```yaml
extensions:
  brain:
    type: streamable_http
    uri: https://brain.inite.ai/mcp/<companyId>
    headers:
      Authorization: Bearer <api-key>
    enabled: true
```

`goose session start` will load brain tools.

## n8n

Use the **MCP Client** node in n8n:

- URL: `https://brain.inite.ai/mcp/<companyId>`
- Transport: HTTP (Streamable)
- Header: `Authorization: Bearer <api-key>`

Pin a credential so it's reusable across workflows.

## Smoke test (any client)

Once the client is connected, ask it:

> List available brain tools and call `search_knowledge` with query `"hello"` limit 1.

Expected: a tool list of either 4 or 6 tools, and a `search_knowledge` call that returns an empty `hits` array on a fresh tenant (or one hit if there's seed data). If the tool call returns a 401 or 403, the API key scope is wrong — go back to `https://brain.inite.ai/admin/keys` and check the key's scopes (`brain:read`, `brain:write`, `brain:read_pii`).

## Scope matrix

| Scope | Tools unlocked |
| --- | --- |
| `brain:read` (always) | `search_knowledge`, `get_entity_profile`, `get_entity_timeline`, `find_related_entities` |
| `brain:write` | + `record_fact`, `retract_fact` |
| `brain:read_pii` | unlocks `email` / `phone` / `dob` / `address` object values in read results (predicate stays visible without it) |

A key with only `brain:read` will see four tools, not six — that's the security invariant, not a bug. Tell the user explicitly when their key is read-only so they don't waste time looking for `record_fact`.

## Common failures

| Symptom | Cause | Fix |
| --- | --- | --- |
| `400: MCP path companyId (...) does not match ApiKey companyId` | URL has wrong companyId for this key | Use the companyId from the `/admin/keys` row, not from another tenant |
| `401: Unauthorized` | Key missing, expired, or wrong format | Check the `Authorization` header is `Bearer brain_…` exactly; no quotes, no extra spaces |
| `403: scope brain:write required` | The user has `brain:read` only and tried `record_fact` | Either elevate the key to `brain:write` (admin only) or drop the write call |
| Tools list empty | Client never reached brain — check the URL is HTTPS and reachable | `curl -I https://brain.inite.ai/mcp/<companyId>` should return 401 (not 404 or DNS error) |
| Cursor / Claude don't see tools after editing config | Client cache | Quit fully (not just close window) and reopen |

## After setup

Once connected, point the user at the three workflow skills:

- `brain-search` — finding facts and entities
- `brain-recall` — pulling one entity's full picture
- `brain-bitemporal` — when temporal questions come up

These describe how to actually *use* the six tools brain exposes, not just how to wire them in.

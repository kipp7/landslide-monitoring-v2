---
title: use-mcp-router-as-unified-remote-mcp-entrypoint
type: note
tags:
- decision
- mcp
- tooling
status: active
permalink: landslide-monitoring-v2-mainline/memory/decisions/use-mcp-router-as-unified-remote-mcp-entrypoint
---

# Decision: use-mcp-router-as-unified-remote-mcp-entrypoint

## Context

The local Codex setup already has direct browser-focused MCP entries for website reconstruction, but the user also has an MCP Router token and wants MCP inventory centrally managed through that router instead of scattering everything across unrelated local entries.

## Decision

Keep `mcp-router` configured as a global Codex MCP entrypoint.

Security rule:

- keep `MCPR_TOKEN` in user environment state
- do not write the token into repository memory notes or project journal
- do not keep the token inside `C:\Users\Administrator\.codex\config.toml`

## Rationale

- it provides one unified remote MCP entrypoint
- it avoids hardcoding the router token into workspace artifacts
- it keeps future MCP expansion compatible with centralized routing instead of per-tool manual sprawl

## Consequences

What gets easier:

- central MCP management
- later expansion of external MCP inventory
- secret hygiene inside the repository

What gets harder:

- runtime availability depends on the user environment carrying `MCPR_TOKEN`

What is deferred:

- deciding which existing direct MCP entries should later be folded under the router versus kept local

## Follow-up

- use `mcp-router` as the default remote MCP entrypoint going forward
- keep direct local browser MCP entries for now because they are already working and useful for reconstruction

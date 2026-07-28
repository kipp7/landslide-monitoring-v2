from __future__ import annotations

import argparse
import asyncio
import json
from pathlib import Path

from mcp import ClientSession, StdioServerParameters
from mcp.client.stdio import stdio_client


async def probe(server_script: Path) -> None:
    params = StdioServerParameters(
        command="powershell",
        args=[
            "-NoProfile",
            "-ExecutionPolicy",
            "Bypass",
            "-File",
            str(server_script),
        ],
        cwd=str(server_script.parents[4]),
    )
    async with stdio_client(params) as (read, write):
        async with ClientSession(read, write) as session:
            init = await session.initialize()
            tools = await session.list_tools()
            required = {
                "create_part",
                "create_sketch",
                "add_rectangle",
                "create_extrusion",
                "save_as",
                "export_step",
                "export_image",
            }
            names = {tool.name for tool in tools.tools}
            missing = sorted(required - names)
            if missing:
                raise RuntimeError(f"Missing required tools: {missing}")
            print(
                json.dumps(
                    {
                        "server": init.serverInfo.name,
                        "version": init.serverInfo.version,
                        "tool_count": len(names),
                        "required_tools": "ok",
                    },
                    ensure_ascii=False,
                )
            )


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--server-script", required=True, type=Path)
    args = parser.parse_args()
    asyncio.run(probe(args.server_script.resolve()))


if __name__ == "__main__":
    main()

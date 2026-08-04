#!/usr/bin/env python3
"""Run the strict Compact V5 hardware gate through the shared acceptance runner."""

from __future__ import annotations

import sys

from xls1_compact_v4_acceptance import main


if __name__ == "__main__":
    if any(
        argument == "--required-compact-version"
        or argument.startswith("--required-compact-version=")
        for argument in sys.argv[1:]
    ):
        raise SystemExit("Compact V5 runner fixes --required-compact-version=5")
    sys.argv.extend(("--required-compact-version", "5"))
    raise SystemExit(main())

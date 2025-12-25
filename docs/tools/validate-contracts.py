from __future__ import annotations

import json
import re
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import yaml
from jsonschema import Draft202012Validator


@dataclass(frozen=True)
class Problem:
    kind: str
    message: str
    hint: str | None = None


def _repo_root() -> Path:
    # .../docs/tools/validate-contracts.py -> repo root
    return Path(__file__).resolve().parents[2]


def _docs_root() -> Path:
    # .../docs/tools -> .../docs
    return Path(__file__).resolve().parents[1]


def _load_openapi(openapi_path: Path) -> dict[str, Any]:
    with open(openapi_path, "rb") as f:
        data = yaml.safe_load(f)
    if not isinstance(data, dict):
        raise TypeError("openapi.yaml root must be a mapping")
    return data


def _collect_openapi_operations(openapi: dict[str, Any]) -> set[tuple[str, str]]:
    paths = openapi.get("paths", {})
    if not isinstance(paths, dict):
        return set()

    ops: set[tuple[str, str]] = set()
    for path, item in paths.items():
        if not isinstance(path, str) or not isinstance(item, dict):
            continue
        for method, operation in item.items():
            if method in {"parameters", "summary", "description"}:
                continue
            if not isinstance(method, str) or not isinstance(operation, dict):
                continue
            if method.lower() in {"get", "post", "put", "delete", "patch"}:
                ops.add((method.upper(), path))
    return ops


_MD_ENDPOINT_RE = re.compile(r"\*\*(GET|POST|PUT|DELETE|PATCH)\*\*\s+\x60([^\x60]+)\x60")


def _collect_markdown_endpoints(api_docs_dir: Path) -> set[tuple[str, str]]:
    endpoints: set[tuple[str, str]] = set()
    for path in sorted(api_docs_dir.glob("[0-9][0-9]-*.md")):
        text = path.read_text(encoding="utf-8")
        for match in _MD_ENDPOINT_RE.finditer(text):
            method = match.group(1)
            endpoint = match.group(2)
            endpoints.add((method, endpoint))
    return endpoints


def _openapi_required_responses(openapi: dict[str, Any]) -> list[Problem]:
    problems: list[Problem] = []

    paths = openapi.get("paths", {})
    if not isinstance(paths, dict):
        return [Problem("openapi", "openapi.paths must be a mapping")]

    for path, item in paths.items():
        if not isinstance(item, dict):
            continue
        for method, op in item.items():
            if method in {"parameters", "summary", "description"}:
                continue
            if not isinstance(method, str) or method.lower() not in {"get", "post", "put", "delete", "patch"}:
                continue
            if not isinstance(op, dict):
                continue

            responses = op.get("responses")
            if not isinstance(responses, dict):
                problems.append(
                    Problem(
                        "openapi",
                        f"{method.upper()} {path}: missing responses",
                        "每个 operation 必须定义 responses（至少 200/500/default）。",
                    )
                )
                continue

            # 200/201
            if "200" not in responses and "201" not in responses:
                problems.append(
                    Problem(
                        "openapi",
                        f"{method.upper()} {path}: missing 200/201 response",
                        "至少定义一个成功响应（200 或 201）。",
                    )
                )

            # default + 500
            if "default" not in responses:
                problems.append(
                    Problem(
                        "openapi",
                        f"{method.upper()} {path}: missing default response",
                        "默认错误响应用于兜底（例如指向 ErrorResponse）。",
                    )
                )
            if "500" not in responses:
                problems.append(
                    Problem(
                        "openapi",
                        f"{method.upper()} {path}: missing 500 response",
                        "服务端错误必须显式定义为 500。",
                    )
                )

            # 404 for path params
            has_path_param = "{" in path and "}" in path
            if has_path_param and "404" not in responses:
                problems.append(
                    Problem(
                        "openapi",
                        f"{method.upper()} {path}: missing 404 response",
                        "包含 path 参数的接口需要定义 404（资源不存在）。",
                    )
                )

            # 401/403 if secured
            is_public = op.get("security") == []
            if not is_public:
                if "401" not in responses:
                    problems.append(
                        Problem(
                            "openapi",
                            f"{method.upper()} {path}: missing 401 response",
                            "需要鉴权的接口必须定义 401。",
                        )
                    )
                if "403" not in responses:
                    problems.append(
                        Problem(
                            "openapi",
                            f"{method.upper()} {path}: missing 403 response",
                            "需要鉴权的接口必须定义 403。",
                        )
                    )

    return problems


def _validate_schema_examples(schema_dir: Path, examples_dir: Path) -> list[Problem]:
    problems: list[Problem] = []

    if not schema_dir.exists():
        return [Problem("schema", f"missing schema dir: {schema_dir.as_posix()}")]
    if not examples_dir.exists():
        return [Problem("schema", f"missing examples dir: {examples_dir.as_posix()}")]

    schema_paths = sorted(schema_dir.glob("*.schema.json"))
    if not schema_paths:
        problems.append(Problem("schema", f"no schema files found in: {schema_dir.as_posix()}"))
        return problems

    for schema_path in schema_paths:
        schema_name = schema_path.name.replace(".schema.json", "")
        example_path = examples_dir / f"{schema_name}.json"

        if not example_path.exists():
            problems.append(
                Problem(
                    "schema",
                    f"missing example for schema: {schema_path.as_posix()}",
                    f"期望示例文件：{example_path.as_posix()}",
                )
            )
            continue

        try:
            schema = json.loads(schema_path.read_text(encoding="utf-8"))
            example = json.loads(example_path.read_text(encoding="utf-8"))
        except Exception as e:  # noqa: BLE001
            problems.append(Problem("schema", f"failed to load json: {schema_name}: {e}"))
            continue

        validator = Draft202012Validator(schema)
        errors = sorted(validator.iter_errors(example), key=lambda err: list(err.path))
        if errors:
            problems.append(Problem("schema", f"schema validation failed: {example_path.as_posix()}"))
            for err in errors[:10]:
                problems.append(Problem("schema", f"  path={list(err.path)}: {err.message}"))

    return problems


def _validate_rules_examples(schema_path: Path, examples_dir: Path) -> list[Problem]:
    problems: list[Problem] = []
    if not schema_path.exists():
        return [Problem("schema", f"missing rules schema: {schema_path.as_posix()}")]
    if not examples_dir.exists():
        return [Problem("schema", f"missing rules examples dir: {examples_dir.as_posix()}")]

    schema = json.loads(schema_path.read_text(encoding="utf-8"))
    validator = Draft202012Validator(schema)

    example_paths = sorted(examples_dir.glob("*.v1.json"))
    if not example_paths:
        problems.append(Problem("schema", f"no rules examples found in: {examples_dir.as_posix()}"))
        return problems

    for example_path in example_paths:
        example = json.loads(example_path.read_text(encoding="utf-8"))
        errors = sorted(validator.iter_errors(example), key=lambda err: list(err.path))
        if errors:
            problems.append(Problem("schema", f"rules DSL schema validation failed: {example_path.as_posix()}"))
            for err in errors[:10]:
                problems.append(Problem("schema", f"  path={list(err.path)}: {err.message}"))

    return problems


def _validate_registry_paths(repo_root: Path, registry_path: Path) -> list[Problem]:
    problems: list[Problem] = []
    if not registry_path.exists():
        return [Problem("registry", f"missing contract registry: {registry_path.as_posix()}")]

    text = registry_path.read_text(encoding="utf-8")
    # backtick paths like `docs/...`
    for match in re.finditer(r"`([^`]+)`", text):
        token = match.group(1).strip()
        if not token.startswith("docs/"):
            continue
        candidate = repo_root / token
        if not candidate.exists():
            problems.append(Problem("registry", f"registry path does not exist: {token}"))
    return problems


def main() -> int:
    repo_root = _repo_root()
    docs_root = _docs_root()

    problems: list[Problem] = []

    openapi_path = docs_root / "integrations" / "api" / "openapi.yaml"
    api_docs_dir = docs_root / "integrations" / "api"

    try:
        openapi = _load_openapi(openapi_path)
    except Exception as e:  # noqa: BLE001
        problems.append(Problem("openapi", f"failed to parse openapi.yaml: {e}"))
        openapi = {}

    if openapi:
        if "openapi" not in openapi:
            problems.append(Problem("openapi", "openapi.yaml missing 'openapi' field"))
        problems.extend(_openapi_required_responses(openapi))

        md_ops = _collect_markdown_endpoints(api_docs_dir)
        oa_ops = _collect_openapi_operations(openapi)

        missing_in_openapi = sorted(md_ops - oa_ops)
        extra_in_openapi = sorted(oa_ops - md_ops)

        if missing_in_openapi:
            problems.append(
                Problem(
                    "api",
                    f"openapi.yaml missing endpoints from markdown: {len(missing_in_openapi)}",
                    "修复：补齐 OpenAPI paths/methods，或删除/修正文档中的端点。",
                )
            )
            for method, path in missing_in_openapi[:50]:
                problems.append(Problem("api", f"  missing: {method} {path}"))

        if extra_in_openapi:
            problems.append(
                Problem(
                    "api",
                    f"markdown missing endpoints from openapi.yaml: {len(extra_in_openapi)}",
                    "修复：在 `integrations/api/*.md` 补齐端点说明，或从 OpenAPI 移除。",
                )
            )
            for method, path in extra_in_openapi[:50]:
                problems.append(Problem("api", f"  undocumented: {method} {path}"))

    # MQTT/Kafka schema examples
    problems.extend(
        _validate_schema_examples(
            docs_root / "integrations" / "mqtt" / "schemas",
            docs_root / "integrations" / "mqtt" / "examples",
        )
    )
    problems.extend(
        _validate_schema_examples(
            docs_root / "integrations" / "kafka" / "schemas",
            docs_root / "integrations" / "kafka" / "examples",
        )
    )
    problems.extend(
        _validate_rules_examples(
            docs_root / "integrations" / "rules" / "rule-dsl.schema.json",
            docs_root / "integrations" / "rules" / "examples",
        )
    )

    # Registry sanity
    problems.extend(_validate_registry_paths(repo_root, docs_root / "integrations" / "contract-registry.md"))

    if problems:
        print("Contract validation failed:\n")
        for p in problems:
            if p.hint:
                print(f"- [{p.kind}] {p.message}\n  hint: {p.hint}")
            else:
                print(f"- [{p.kind}] {p.message}")
        return 1

    print("Contract validation passed.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

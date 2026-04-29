#!/usr/bin/env python3
"""Run DeepSeek-based review/automation against git diff or provided text.

Examples:
  pnpm agent:deepseek
  pnpm agent:deepseek --diff "HEAD~1..HEAD" --json
  pnpm agent:deepseek --file apps/api/src/modules/ai/ai.service.ts
"""

from __future__ import annotations

import argparse
import json
import os
import subprocess
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def parse_env_file(path: Path) -> dict[str, str]:
    env = {}
    if not path.exists():
        return env
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        env[key.strip()] = value.strip().strip("\"'")
    return env


def run_command(cmd: list[str]) -> str:
    try:
        proc = subprocess.run(cmd, cwd=ROOT, text=True, capture_output=True, check=False)
    except OSError as exc:
        raise RuntimeError(f"Command failed: {exc}")

    if proc.returncode != 0:
        raise RuntimeError(proc.stderr.strip() or "Command failed")

    return proc.stdout.strip()


def gather_payload(args, env: dict[str, str]) -> str:
    if args.file:
        path = ROOT / args.file
        return path.read_text(encoding="utf-8")

    if args.diff == "staged":
        return run_command(["git", "diff", "--cached"])
    if args.diff:
        return run_command(["git", "diff", args.diff])

    try:
        return run_command(["git", "diff", "--", "HEAD~1"])
    except RuntimeError:
        return ""


def call_chat_completion(
    base_url: str,
    model: str,
    prompt: str,
    max_tokens: int = 1200,
    api_key: str = "",
    system_prompt: str = "You are a concise technical reviewer for a TypeScript/NestJS/Next.js monorepo.",
    timeout_seconds: int = 60,
) -> str:
    url = f"{base_url.rstrip('/')}/chat/completions"
    headers = {
        "Content-Type": "application/json",
    }
    if api_key:
        headers["Authorization"] = f"Bearer {api_key}"

    body = {
        "model": model,
        "messages": [
            {
                "role": "system",
                "content": system_prompt,
            },
            {
                "role": "user",
                "content": prompt,
            },
        ],
        "temperature": 0.2,
        "max_tokens": max_tokens,
    }

    data = json.dumps(body).encode("utf-8")
    req = urllib.request.Request(url, data=data, headers=headers, method="POST")
    with urllib.request.urlopen(req, timeout=timeout_seconds) as response:
        payload = json.loads(response.read().decode("utf-8"))

    choices = payload.get("choices", [])
    if not choices:
        raise RuntimeError("No response content from DeepSeek")

    return (choices[0].get("message", {}).get("content") or "").strip()


def call_chat_completion_with_fallback(
    base_urls: list[str],
    model: str,
    prompt: str,
    max_tokens: int = 1200,
    api_key: str = "",
    system_prompt: str = "You are a concise technical reviewer for a TypeScript/NestJS/Next.js monorepo.",
    timeout_seconds: int = 60,
) -> tuple[str, str]:
    """Try multiple compatible endpoints and return (reply, used_base)."""
    last_error: Exception | None = None
    attempt_timeout = min(timeout_seconds, 12)
    for base_url in base_urls:
        if not base_url:
            continue
        try:
            answer = call_chat_completion(
                base_url,
                model,
                prompt,
                max_tokens=max_tokens,
                api_key=api_key,
                system_prompt=system_prompt,
                timeout_seconds=attempt_timeout,
            )
            return answer, base_url
        except Exception as exc:  # noqa: BLE001
            last_error = exc
            continue
    raise RuntimeError(str(last_error) if last_error else "No local review endpoint available")


def main() -> int:
    parser = argparse.ArgumentParser(description="DeepSeek code-review helper")
    parser.add_argument("--diff", default="staged", help="Diff range to review (default: staged if available, fallback HEAD~1)")
    parser.add_argument("--file", default="", help="Optional file path to review directly")
    parser.add_argument("--json", action="store_true", help="Emit JSON output")
    parser.add_argument("--api-base", default="", help="Optional override: API base URL")
    parser.add_argument("--model", default="", help="Model override")
    parser.add_argument("--max-tokens", type=int, default=1200)
    parser.add_argument("--provider", default="auto", choices=["auto", "deepseek", "local"])
    parser.add_argument("--local-base", default="", help="Optional override for local OpenAI-compatible base URL")
    parser.add_argument("--timeout-seconds", type=int, default=0, help="HTTP timeout for remote or local model calls")
    args = parser.parse_args()

    env = parse_env_file(ROOT / ".env.local")
    api_key = os.environ.get("DEEPSEEK_API_KEY") or env.get("DEEPSEEK_API_KEY")
    local_base = (
        args.local_base
        or os.environ.get("LOCAL_REVIEW_BASE_URL")
        or env.get("LOCAL_REVIEW_BASE_URL")
        or os.environ.get("LOCAL_LLM_BASE_URL")
        or env.get("LOCAL_LLM_BASE_URL")
        or "http://127.0.0.1:11435/v1"
    )
    local_model = (
        args.model
        or os.environ.get("LOCAL_REVIEW_MODEL")
        or env.get("LOCAL_REVIEW_MODEL")
        or os.environ.get("LOCAL_LLM_MODEL")
        or env.get("LOCAL_LLM_MODEL")
        or "qwen3-4b-thinking"
    )
    remote_model = args.model or os.environ.get("DEEPSEEK_MODEL") or env.get("DEEPSEEK_MODEL") or "deepseek-chat"
    timeout_seconds = args.timeout_seconds or int(
        os.environ.get("LOCAL_REVIEW_TIMEOUT_SECONDS")
        or env.get("LOCAL_REVIEW_TIMEOUT_SECONDS")
        or os.environ.get("DEEPSEEK_TIMEOUT_SECONDS")
        or env.get("DEEPSEEK_TIMEOUT_SECONDS")
        or "60"
    )

    provider = args.provider
    if provider == "auto":
        if api_key:
            provider = "deepseek"
        else:
            provider = "local"

    if provider == "deepseek" and not api_key:
        print("DEEPSEEK_API_KEY is missing; skip review.")
        print("Set DEEPSEEK_API_KEY in .env.local or use --provider local.")
        return 0

    payload_text = gather_payload(args, env)
    if not payload_text:
        if args.json:
            print(json.dumps({"status": "skipped", "reason": "No input diff/text found for review"}, ensure_ascii=False))
        else:
            print("No input diff/text found for review")
        return 0

    prompt = (
        "Review the following diff for correctness, security, reliability and test impact. "
        "Return: priority findings (high/medium/low), missing tests, and concrete next fixes.\n\n"
        f"{payload_text}"
    )

    if args.api_base:
        os.environ["DEEPSEEK_BASE_URL"] = args.api_base

    try:
        if provider == "deepseek":
            answer = call_chat_completion(
                os.environ.get("DEEPSEEK_BASE_URL", "https://api.deepseek.com"),
                remote_model,
                prompt,
                args.max_tokens,
                api_key=api_key,
                timeout_seconds=timeout_seconds,
            )
            model = remote_model
        else:
            fallback_bases = [local_base, os.environ.get("LOCAL_LLM_BASE_URL", ""), local_base]
            # Keep deterministic order but avoid duplicate checks when both values are same.
            deduped_bases = []
            for value in [b for b in fallback_bases if b]:
                if value not in deduped_bases:
                    deduped_bases.append(value)

            answer, _ = call_chat_completion_with_fallback(
                deduped_bases,
                local_model,
                prompt,
                max_tokens=args.max_tokens,
                api_key=api_key,
                timeout_seconds=timeout_seconds,
            )
            model = local_model
    except Exception as exc:
        if args.json:
            print(json.dumps({"error": str(exc)}))
            return 1
        print(f"DeepSeek call failed: {exc}")
        return 1

    if args.json:
        print(json.dumps({"model": model, "review": answer}, ensure_ascii=False, indent=2))
    else:
        print("--- DeepSeek Review ---")
        print(answer)

    return 0


if __name__ == "__main__":
    raise SystemExit(main())

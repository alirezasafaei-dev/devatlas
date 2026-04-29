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


def call_deepseek(api_key: str, model: str, prompt: str, max_tokens: int = 1200) -> str:
    base_url = os.environ.get("DEEPSEEK_BASE_URL", "https://api.deepseek.com")
    url = f"{base_url.rstrip('/')}/chat/completions"
    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {api_key}",
    }

    body = {
        "model": model,
        "messages": [
            {
                "role": "system",
                "content": "You are a concise technical reviewer for a TypeScript/NestJS/Next.js monorepo.",
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
    with urllib.request.urlopen(req, timeout=60) as response:
        payload = json.loads(response.read().decode("utf-8"))

    choices = payload.get("choices", [])
    if not choices:
        raise RuntimeError("No response content from DeepSeek")

    return (choices[0].get("message", {}).get("content") or "").strip()


def main() -> int:
    parser = argparse.ArgumentParser(description="DeepSeek code-review helper")
    parser.add_argument("--diff", default="staged", help="Diff range to review (default: staged if available, fallback HEAD~1)")
    parser.add_argument("--file", default="", help="Optional file path to review directly")
    parser.add_argument("--json", action="store_true", help="Emit JSON output")
    parser.add_argument("--api-base", default="", help="Optional override: API base URL")
    parser.add_argument("--model", default="", help="Model override")
    parser.add_argument("--max-tokens", type=int, default=1200)
    args = parser.parse_args()

    env = parse_env_file(ROOT / ".env.local")
    api_key = os.environ.get("DEEPSEEK_API_KEY") or env.get("DEEPSEEK_API_KEY")
    model = args.model or os.environ.get("DEEPSEEK_MODEL") or env.get("DEEPSEEK_MODEL") or "deepseek-chat"

    if not api_key:
        print("DEEPSEEK_API_KEY is missing; skip review.")
        print("Set DEEPSEEK_API_KEY in .env.local and rerun.")
        return 0

    payload_text = gather_payload(args, env)
    if not payload_text:
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
        answer = call_deepseek(api_key, model, prompt, args.max_tokens)
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

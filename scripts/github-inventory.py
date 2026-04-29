#!/usr/bin/env python3
"""Generate repository automation inventory from local GitHub workspace artifacts.

Usage:
  python3 scripts/github-inventory.py [--json]

If token exists in environment or .env.local, fetches GitHub workflow run metadata.
"""

from __future__ import annotations

import json
import os
import re
import sys
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

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


def list_local_workflows() -> list[str]:
    wf_dir = ROOT / ".github" / "workflows"
    if not wf_dir.exists():
        return []
    workflow_files = []
    for suffix in (".yml", ".yaml"):
        workflow_files.extend(p.name for p in wf_dir.glob(f"*{suffix}"))
    return sorted(workflow_files)


def read_agents() -> list[str]:
    skill_file = ROOT / "skill.toml"
    if not skill_file.exists():
        return []
    text = skill_file.read_text(encoding="utf-8")
    return re.findall(r"^\[skills\.([a-z_]+)\]", text, re.M)


def github_api(path: str, token: str | None) -> dict:
    url = f"https://api.github.com{path}"
    headers = {
        "Accept": "application/vnd.github+json",
        "User-Agent": "devatlas-inventory",
    }
    if token:
        headers["Authorization"] = f"Bearer {token}"

    req = Request(url, headers=headers)
    with urlopen(req, timeout=20) as resp:
        return json.loads(resp.read().decode("utf-8"))


def main() -> int:
    env_local = parse_env_file(ROOT / ".env.local")
    token = os.environ.get("GITHUB_TOKEN") or os.environ.get("GH_TOKEN") or env_local.get("GITHUB_TOKEN") or env_local.get("GH_TOKEN")
    owner = os.environ.get("GITHUB_OWNER") or os.environ.get("OWNER") or "asdeveloop"
    repo = os.environ.get("GITHUB_REPO") or os.environ.get("REPO") or "devatlas"
    output_json = "--json" in sys.argv

    local_workflows = list_local_workflows()
    agents = read_agents()

    report = {
        "repo": {
            "owner": owner,
            "name": repo,
        },
        "local": {
            "workflows": local_workflows,
            "agents": agents,
            "env_template_exists": (ROOT / ".env.example").exists(),
        },
        "remote": {
            "workflows": [],
            "latest_runs": [],
        },
        "notes": [],
    }

    if not token:
        report["notes"].append("No GitHub token; remote checks skipped")
        if output_json:
            print(json.dumps(report, ensure_ascii=False, indent=2))
        else:
            print(f"Local workflows: {len(local_workflows)}")
            print(f"Agents: {', '.join(agents) if agents else 'none'}")
            print("Remote: skipped (missing GITHUB_TOKEN / GH_TOKEN)")
        return 0

    try:
        wf_data = github_api(f"/repos/{owner}/{repo}/actions/workflows", token)
        report["remote"]["workflows"] = [
            {
                "name": w.get("name"),
                "path": w.get("path"),
                "state": w.get("state"),
            }
            for w in wf_data.get("workflows", [])
        ]

        runs_data = github_api(f"/repos/{owner}/{repo}/actions/runs?per_page=5", token)
        report["remote"]["latest_runs"] = [
            {
                "name": r.get("name"),
                "status": r.get("status"),
                "conclusion": r.get("conclusion"),
                "run_number": r.get("run_number"),
                "updated_at": r.get("updated_at"),
            }
            for r in runs_data.get("workflow_runs", [])
        ]
    except (HTTPError, URLError, OSError, ValueError) as exc:
        report["notes"].append(f"GitHub API failed: {exc}")

    if output_json:
        print(json.dumps(report, ensure_ascii=False, indent=2))
    else:
        print(f"Local workflows ({len(local_workflows)}):")
        for wf in local_workflows:
            print(f" - {wf}")

        print(f"Agents ({len(agents)}):")
        for agent in agents:
            print(f" - {agent}")

        print("\nRemote workflows:")
        if report["remote"]["workflows"]:
            for wf in report["remote"]["workflows"]:
                print(f" - {wf['name']} [{wf['state']}]")
        else:
            print(" - skipped or failed")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())

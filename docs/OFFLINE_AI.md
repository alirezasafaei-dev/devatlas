# Offline AI Guide

Last updated: 2026-04-29

## Current setup

- `llama.cpp` is built with Vulkan and uses the AMD RX 580 for local chat and embeddings.
- `Ollama` is configured to use the existing model store at `/media/dev/38588EDB588E96F2/Users/dev13/.ollama/models`.
- Default local chat model: `Qwen3-4B-Thinking-2507-Q3_K_L.gguf`
- Default local embedding model: `bge-m3.gguf`
- Default local review model: `qwen2.5-coder:7b`

## Manual commands

Start local chat server:

```bash
pnpm agent:local:chat
```

Start local embedding server:

```bash
pnpm agent:local:embed
```

Smoke check the local chat server:

```bash
pnpm agent:local:smoke
```

Smoke check the local embedding server:

```bash
pnpm agent:local:smoke:embed
```

Run offline local review against a file:

```bash
pnpm agent:deepseek:local --file package.json --json
```

Run offline local review against a diff:

```bash
pnpm agent:deepseek:local --diff HEAD~1..HEAD --json
```

## Auto tasks

Install the user services and timers:

```bash
pnpm agent:offline:install
```

This installs:

- `devatlas-ollama.service`: keeps `Ollama` running with Vulkan enabled
- `devatlas-llama-chat.service`: keeps the `llama.cpp` chat server running
- `devatlas-offline-health.timer`: runs `pnpm agent:local:smoke` every 30 minutes
- `devatlas-offline-review.timer`: runs a daily local review and writes `tmp/offline-review-latest.json`

Read the latest offline review:

```bash
pnpm agent:offline:review:last
```

Inspect status:

```bash
systemctl --user status devatlas-ollama.service
systemctl --user status devatlas-llama-chat.service
systemctl --user list-timers --all | grep devatlas-offline
```

Stop auto tasks:

```bash
systemctl --user disable --now devatlas-offline-health.timer
systemctl --user disable --now devatlas-offline-review.timer
systemctl --user disable --now devatlas-llama-chat.service
systemctl --user disable --now devatlas-ollama.service
```

## Environment

Important variables in `.env.local`:

- `LOCAL_LLM_BASE_URL`
- `LOCAL_LLM_MODEL`
- `LOCAL_LLM_CHAT_MODEL`
- `LOCAL_LLM_EMBED_MODEL`
- `LOCAL_REVIEW_BASE_URL`
- `LOCAL_REVIEW_MODEL`
- `LOCAL_REVIEW_TIMEOUT_SECONDS`
- `LOCAL_LLM_N_GPU_LAYERS`
- `LOCAL_LLM_CTX`
- `LOCAL_LLM_THREADS`

## Notes

- `llama.cpp` chat startup can take some time because the model is loaded into GPU memory.
- The default daily review uses the local `qwen2.5-coder:7b` model via `Ollama`.
- The health timer is intentionally lightweight and only checks that the local chat endpoint responds.

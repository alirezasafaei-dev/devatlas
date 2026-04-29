#!/usr/bin/env node

import { spawn } from 'node:child_process';

const argv = process.argv.slice(2);
const command = argv[0] || 'chat';

function getArg(name, fallback = null) {
  const prefix = `--${name}=`;
  for (const arg of argv) {
    if (arg.startsWith(prefix)) return arg.slice(prefix.length);
  }
  return fallback;
}

function envInt(name, fallback) {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function resolveConfig(mode) {
  const isEmbedding = mode === 'embed';
  const defaultPort = isEmbedding ? 11436 : 11435;
  const baseUrl = isEmbedding
    ? process.env.LOCAL_EMBEDDING_BASE_URL || `http://127.0.0.1:${defaultPort}/v1`
    : process.env.LOCAL_LLM_BASE_URL || `http://127.0.0.1:${defaultPort}/v1`;

  return {
    serverBin: process.env.LOCAL_LLM_SERVER || '/home/dev/Downloads/tools/llama.cpp/build/bin/llama-server',
    modelPath: isEmbedding
      ? process.env.LOCAL_LLM_EMBED_MODEL || '/home/dev/Downloads/tools/bge-m3.gguf'
      : process.env.LOCAL_LLM_CHAT_MODEL || '/home/dev/Downloads/tools/Qwen3-4B-Thinking-2507-Q3_K_L.gguf',
    alias: isEmbedding
      ? process.env.LOCAL_EMBEDDING_MODEL || 'bge-m3'
      : process.env.LOCAL_LLM_MODEL || 'qwen3-4b-thinking',
    host: process.env.LOCAL_LLM_HOST || '127.0.0.1',
    port: Number.parseInt(getArg('port', String(envInt(isEmbedding ? 'LOCAL_EMBEDDING_PORT' : 'LOCAL_LLM_PORT', defaultPort))), 10),
    ctx: envInt('LOCAL_LLM_CTX', isEmbedding ? 8192 : 16384),
    gpuLayers: envInt('LOCAL_LLM_N_GPU_LAYERS', 99),
    threads: envInt('LOCAL_LLM_THREADS', 8),
    baseUrl,
    isEmbedding,
  };
}

function startServer(mode) {
  const cfg = resolveConfig(mode);
  const args = [
    '-m',
    cfg.modelPath,
    '--host',
    cfg.host,
    '--port',
    String(cfg.port),
    '-ngl',
    String(cfg.gpuLayers),
    '-t',
    String(cfg.threads),
    '-c',
    String(cfg.ctx),
    '--alias',
    cfg.alias,
    '--jinja',
  ];

  if (cfg.isEmbedding) {
    args.push('--embedding', '--pooling', 'cls');
  }

  console.log(`Starting ${cfg.isEmbedding ? 'embedding' : 'chat'} server`);
  console.log(`- binary: ${cfg.serverBin}`);
  console.log(`- model : ${cfg.modelPath}`);
  console.log(`- url   : ${cfg.baseUrl}`);

  const child = spawn(cfg.serverBin, args, {
    stdio: 'inherit',
    env: process.env,
  });

  child.on('exit', code => {
    process.exitCode = code ?? 0;
  });
}

async function smoke(mode) {
  const cfg = resolveConfig(mode);
  const health = await fetch(`${cfg.baseUrl.replace(/\/v1$/, '')}/health`);
  if (!health.ok) {
    throw new Error(`health check failed with status ${health.status}`);
  }

  if (cfg.isEmbedding) {
    const response = await fetch(`${cfg.baseUrl}/embeddings`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        model: cfg.alias,
        input: 'devatlas offline embedding smoke test',
      }),
    });

    if (!response.ok) {
      throw new Error(`embedding request failed with status ${response.status}`);
    }

    const payload = await response.json();
    console.log(JSON.stringify({ status: 'ok', mode, dims: payload?.data?.[0]?.embedding?.length ?? 0 }, null, 2));
    return;
  }

  const response = await fetch(`${cfg.baseUrl}/chat/completions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      model: cfg.alias,
      temperature: 0,
      max_tokens: 24,
      messages: [
        { role: 'system', content: 'Reply with exactly the requested token.' },
        { role: 'user', content: 'Reply with exactly: GPU_OK' },
      ],
    }),
  });

  if (!response.ok) {
    throw new Error(`chat request failed with status ${response.status}`);
  }

  const payload = await response.json();
  const content = payload?.choices?.[0]?.message?.content ?? '';
  console.log(JSON.stringify({ status: 'ok', mode, reply: content.trim() }, null, 2));
}

async function main() {
  if (command === 'chat' || command === 'embed') {
    startServer(command);
    return;
  }

  if (command === 'smoke') {
    await smoke(getArg('mode', 'chat'));
    return;
  }

  console.error('Usage: node scripts/local-llm.mjs <chat|embed|smoke> [--mode=chat|embed] [--port=11435]');
  process.exitCode = 1;
}

main().catch(err => {
  console.error(`local-llm failed: ${err.message}`);
  process.exitCode = 1;
});

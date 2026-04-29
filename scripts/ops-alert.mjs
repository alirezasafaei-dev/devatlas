#!/usr/bin/env node

const args = process.argv.slice(2);

function getArg(name, fallback = undefined) {
  const index = args.indexOf(`--${name}`);
  if (index === -1) {
    return fallback;
  }

  return args[index + 1];
}

const apiBaseUrl = getArg('api', process.env.OBS_API_URL ?? 'https://staging.alirezasafeidev.ir');
const failOn = getArg('fail-on', process.env.OBS_FAIL_ON ?? 'critical');
const asJson = args.includes('--json');
const timeoutMs = Number(getArg('timeout-ms', '10000'));
const verbose = args.includes('--verbose');

if (!['critical', 'warn', 'none'].includes(failOn)) {
  console.error(`[ops-alert] invalid --fail-on: ${failOn}`);
  process.exit(2);
}

function failThreshold(level, target) {
  if (target === 'critical') {
    return level === 'critical';
  }
  if (target === 'warn') {
    return level === 'critical' || level === 'warn';
  }
  return false;
}

async function fetchHealth() {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(`${apiBaseUrl}/api/v1/health`, {
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new Error(`GET /api/v1/health failed: status=${response.status}`);
    }

    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}

function evaluateAlerts(health) {
  const alerts = [];
  const { status, database, metrics } = health;

  alerts.push({
    key: 'api_database_ready',
    status: database === 'connected' ? 'ok' : 'critical',
    value: database === 'connected' ? 1 : 0,
    threshold: 1,
    message: database === 'connected' ? 'Database readiness healthy.' : 'Database readiness failed.',
  });

  alerts.push({
    key: 'api_error_rate',
    status: metrics.errorRate >= 20 ? 'critical' : metrics.errorRate >= 5 ? 'warn' : 'ok',
    value: metrics.errorRate,
    threshold: metrics.errorRate >= 20 ? 20 : 5,
    message: `API error rate is ${metrics.errorRate}%.`,
  });

  alerts.push({
    key: 'api_p95_proxy',
    status: metrics.averageDurationMs >= 500 ? 'critical' : metrics.averageDurationMs >= 250 ? 'warn' : 'ok',
    value: metrics.averageDurationMs,
    threshold: metrics.averageDurationMs >= 500 ? 500 : 250,
    message: `Average API latency proxy is ${metrics.averageDurationMs}ms.`,
  });

  alerts.push({
    key: 'api_rate_limited_requests',
    status: metrics.rateLimitedRequests >= 20 ? 'warn' : 'ok',
    value: metrics.rateLimitedRequests,
    threshold: 20,
    message: `Rate-limited requests observed: ${metrics.rateLimitedRequests}.`,
  });

  if (status !== 'ok') {
    alerts.push({
      key: 'api_health_status',
      status: 'critical',
      value: status === 'ok' ? 1 : 0,
      threshold: 1,
      message: `Health status is ${status}.`,
    });
  }

  return alerts;
}

(async () => {
  try {
    const health = await fetchHealth();
    const alerts = evaluateAlerts(health);
    const webhook = process.env.OBS_WEBHOOK_URL;
    const failed = alerts.some((alert) => failThreshold(alert.status, failOn));

    if (asJson) {
      console.log(JSON.stringify({ apiBaseUrl, health, alerts, failed }, null, 2));
      process.exit(failed ? 1 : 0);
    }

    console.log(`[ops-alert] checked: ${apiBaseUrl}`);
    console.log(`[ops-alert] status=${health.status} db=${health.database}`);
    for (const alert of alerts) {
      const line = `[${alert.status.toUpperCase()}] ${alert.key}=${alert.value} threshold=${alert.threshold} ${alert.message}`;
      if (alert.status === 'critical') {
        console.error(line);
      } else if (alert.status === 'warn' && verbose) {
        console.warn(line);
      } else if (verbose) {
        console.log(line);
      }
    }

    if (webhook && failed) {
      try {
        await fetch(webhook, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            text: `DevAtlas OBS alert on ${apiBaseUrl}\n${alerts
              .filter((alert) => alert.status !== 'ok')
              .map((alert) => `${alert.key}: ${alert.status} -> ${alert.message}`)
              .join('\n')}`,
          }),
        });
      } catch (error) {
        console.error('[ops-alert] webhook send failed:', error instanceof Error ? error.message : String(error));
      }
    }

    process.exit(failed ? 1 : 0);
  } catch (error) {
    console.error('[ops-alert] fail:', error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
})();

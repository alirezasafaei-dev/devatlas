export default () => ({
  app: {
    port: parseInt(process.env['PORT'] ?? '3001', 10),
    env: process.env['NODE_ENV'] ?? 'development',
    baseUrl: process.env['APP_BASE_URL'],
    corsOrigin: (process.env['CORS_ORIGIN'] ?? 'http://localhost:3000')
      .split(',')
      .map((origin) => origin.trim())
      .filter(Boolean),
    rateLimit: {
      windowMs: parseInt(process.env['RATE_LIMIT_WINDOW_MS'] ?? '60000', 10),
      searchMax: parseInt(process.env['RATE_LIMIT_SEARCH_MAX'] ?? '30', 10),
      aiMax: parseInt(process.env['RATE_LIMIT_AI_MAX'] ?? '10', 10),
    },
  },
  database: {
    url: process.env['DATABASE_URL'],
  },
});

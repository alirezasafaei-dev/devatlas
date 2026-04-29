import { spawnSync } from 'node:child_process';

import type { INestApplication } from '@nestjs/common';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { contentRelations, guides, searchDocuments, tools } from '../db/schema';
import { createTestDatabase, hasTestDatabaseConfig } from '../testing/test-db';

const describeIfDb = hasTestDatabaseConfig ? describe.sequential : describe.skip;

describeIfDb('content ingestion script', () => {
  let testDb: ReturnType<typeof createTestDatabase>;
  let app: INestApplication;
  let baseUrl: string;

  beforeAll(async () => {
    process.env.NODE_ENV = process.env.NODE_ENV ?? 'test';
    process.env.APP_BASE_URL = process.env.APP_BASE_URL ?? 'http://localhost:3001';
    testDb = createTestDatabase();

    const { createTestApp } = await import('../testing/test-app');
    const testApp = await createTestApp();
    app = testApp.app;
    baseUrl = testApp.baseUrl;
  });

  beforeEach(async () => {
    await testDb.reset();
  });

  afterAll(async () => {
    await app.close();
    await testDb.close();
  });

  it('ingests content into guides, tools, relations, and search', async () => {
    const result = spawnSync('pnpm', ['content:ingest'], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        NODE_ENV: 'test',
        APP_BASE_URL: 'http://localhost:3001',
        DATABASE_URL: process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL,
        CONTENT_DIR: '../../packages/content/src/__tests__/fixtures',
      },
      encoding: 'utf8',
    });

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('"event":"content-ingest-complete"');

    const persistedGuides = await testDb.db.select().from(guides);
    const persistedTools = await testDb.db.select().from(tools);
    const persistedRelations = await testDb.db.select().from(contentRelations);
    const persistedSearchDocuments = await testDb.db.select().from(searchDocuments);

    expect(persistedGuides).toHaveLength(1);
    expect(persistedGuides[0]?.slug).toBe('getting-started-with-react');
    expect(persistedTools).toHaveLength(1);
    expect(persistedTools[0]?.slug).toBe('visual-studio-code');
    expect(persistedRelations.length).toBeGreaterThan(0);
    expect(persistedSearchDocuments).toHaveLength(2);

    const guidesRes = await fetch(`${baseUrl}/api/v1/guides/getting-started-with-react`);
    const guidesJson = await guidesRes.json();
    expect(guidesRes.status).toBe(200);
    expect(guidesJson.data).toMatchObject({
      slug: 'getting-started-with-react',
      title: 'Getting Started with React',
      category: { slug: 'frontend' },
    });

    const searchRes = await fetch(`${baseUrl}/api/v1/search`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ query: 'Visual Studio Code', limit: 5 }),
    });
    const searchJson = await searchRes.json();

    expect(searchRes.status).toBe(201);
    expect(searchJson.data).toMatchObject({
      query: 'Visual Studio Code',
      total: 1,
    });
    expect(searchJson.data.results[0]).toMatchObject({
      contentType: 'tool',
      title: 'Visual Studio Code',
      url: '/tools/visual-studio-code',
    });
  });
});

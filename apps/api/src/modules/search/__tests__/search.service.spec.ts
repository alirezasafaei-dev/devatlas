import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { SearchRepository } from '../search.repository';
import { SearchService } from '../search.service';

const mockRepository = (): Record<keyof SearchRepository, ReturnType<typeof vi.fn>> => ({
  search: vi.fn(),
  logQuery: vi.fn(),
  replaceIndexWithGuides: vi.fn(),
  replaceIndexWithTools: vi.fn(),
});

describe('SearchService', () => {
  let service: SearchService;
  let repository: ReturnType<typeof mockRepository>;

  beforeEach(() => {
    repository = mockRepository();
    service = new SearchService(repository as unknown as SearchRepository);
  });

  it('returns mapped results and logs the query', async () => {
    repository.search.mockResolvedValue([
      {
        id: 'guide-1',
        contentType: 'guide',
        title: 'React Search Patterns',
        description: 'Search UX guide',
        category: 'frontend',
        url: '/guides/react-search-patterns',
        tags: ['react'],
        score: 0.82,
      },
    ]);
    repository.logQuery.mockResolvedValue(undefined);

    await expect(service.search({ query: '  React search  ', limit: 5 })).resolves.toStrictEqual({
      query: 'React search',
      total: 1,
      results: [
        {
          id: 'guide-1',
          contentType: 'guide',
          title: 'React Search Patterns',
          description: 'Search UX guide',
          category: 'frontend',
          url: '/guides/react-search-patterns',
          tags: ['react'],
          score: 0.82,
        },
      ],
    });

    expect(repository.search).toHaveBeenCalledWith('React search', 5);
    expect(repository.logQuery).toHaveBeenCalledWith('React search', 1);
  });

  it('returns empty results for an already-trimmed empty query without logging it', async () => {
    await expect(service.search({ query: '', limit: 5 })).resolves.toStrictEqual({
      query: '',
      total: 0,
      results: [],
    });

    expect(repository.search).toHaveBeenCalledTimes(0);
    expect(repository.logQuery).toHaveBeenCalledTimes(0);
  });
});

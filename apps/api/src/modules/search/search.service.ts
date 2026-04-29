import type { SearchResultItem } from '@devatlas/types';
import { Inject, Injectable } from '@nestjs/common';

import type { SearchRequestDto } from './dto/search-request.dto';
import { SearchRepository } from './search.repository';

@Injectable()
export class SearchService {
  constructor(@Inject(SearchRepository) private readonly repo: SearchRepository) {}

  async search(dto: SearchRequestDto): Promise<{ query: string; results: SearchResultItem[]; total: number }> {
    const query = dto.query.trim();

    if (!query) {
      return {
        query,
        results: [],
        total: 0,
      };
    }

    const result = await this.repo.search(query, dto.limit);
    const results = result.map((item) => ({
      id: item.id,
      contentType: item.contentType as 'guide' | 'tool',
      title: item.title,
      description: item.description,
      category: item.category,
      url: item.url,
      tags: item.tags ?? [],
      score: Number(item.score),
    }));

    await this.repo.logQuery(query, results.length);

    return {
      query,
      results,
      total: results.length,
    };
  }
}

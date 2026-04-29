import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';

import { ContentStatus, EntityType, RelationType, ToolPrice, ToolTier } from '@devatlas/types';
import { NestFactory } from '@nestjs/core';
import { inArray, notInArray, sql } from 'drizzle-orm';

import { AppModule } from '../app.module';
import {
  aiSummaries,
  categories,
  contentRelations,
  guideTags,
  guides,
  searchDocuments,
  tags,
  toolTags,
  tools,
} from '../db/schema';
import { DrizzleService } from '../modules/database/drizzle.service';

type ImportedRelation = {
  id: string;
  source_type: 'guide' | 'tool' | 'topic';
  source_id: string;
  target_type: 'guide' | 'tool' | 'topic';
  target_id: string;
  relation_type: 'related' | 'prerequisite' | 'next' | 'uses';
};

type ImportedContentIndex = {
  categories: Array<{ id: string; slug: string; name: string }>;
  tags: Array<{ id: string; slug: string; name: string }>;
  guides: Array<{
    id: string;
    slug: string;
    title: string;
    description: string | null;
    content: string;
    difficulty: 'beginner' | 'intermediate' | 'advanced' | null;
    reading_time: number | null;
    category_id: string | null;
    created_at: string;
    updated_at: string;
  }>;
  tools: Array<{
    id: string;
    slug: string;
    name: string;
    description: string;
    website: string | null;
    github: string | null;
    popularity_score: number;
    category_id: string | null;
    created_at: string;
    updated_at: string;
  }>;
  guideTags: Array<{ guide_id: string; tag_id: string }>;
  toolTags: Array<{ tool_id: string; tag_id: string }>;
  relations: ImportedRelation[];
  searchDocuments: Array<{
    content_type: 'guide' | 'tool';
    title: string;
    description: string;
    content: string;
    tags: string[];
    category: string;
    url: string;
  }>;
};

type IngestSummary = {
  categories: number;
  tags: number;
  guides: number;
  tools: number;
  relations: number;
  searchDocuments: number;
};

const relationTypeMap: Record<ImportedRelation['relation_type'], RelationType> = {
  related: RelationType.RELATES_TO,
  prerequisite: RelationType.PREREQUISITE,
  next: RelationType.MENTIONS,
  uses: RelationType.MENTIONS,
};

const entityTypeMap = {
  guide: EntityType.GUIDE,
  tool: EntityType.TOOL,
} as const;

function requireContentDir(): string {
  const contentDir = process.env['CONTENT_DIR'];
  const workspaceRoot = process.env['INIT_CWD'] ?? process.cwd();

  if (!contentDir) {
    throw new Error('Set CONTENT_DIR to the root directory that contains guides/ and tools/ before running content:ingest.');
  }

  return resolve(workspaceRoot, contentDir);
}

function loadContentIndex(contentDir: string): ImportedContentIndex {
  const loaderScript = resolve(process.cwd(), 'src/scripts/load-content-index.mjs');
  const output = execFileSync('node', ['--loader', 'ts-node/esm', loaderScript, contentDir], {
    cwd: process.cwd(),
    encoding: 'utf8',
    env: {
      ...process.env,
      TS_NODE_PROJECT: resolve(process.cwd(), '../../packages/content/tsconfig.json'),
    },
  });

  return JSON.parse(output) as ImportedContentIndex;
}

async function main(): Promise<void> {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['log', 'warn', 'error'],
  });

  try {
    const contentDir = requireContentDir();
    const index = loadContentIndex(contentDir);

    if (index.guides.length === 0 && index.tools.length === 0) {
      throw new Error(`No valid guides or tools were parsed from ${contentDir}. Aborting to avoid wiping live content.`);
    }

    const drizzle = app.get(DrizzleService).db;

    const importedCategorySlugs = index.categories.map((item) => item.slug);
    const importedTagSlugs = index.tags.map((item) => item.slug);
    const importedGuideSlugs = index.guides.map((item) => item.slug);
    const importedToolSlugs = index.tools.map((item) => item.slug);

    console.log(`Importing content from ${contentDir}`);
    console.log(`- categories: ${index.categories.length}`);
    console.log(`- tags: ${index.tags.length}`);
    console.log(`- guides: ${index.guides.length}`);
    console.log(`- tools: ${index.tools.length}`);

    await drizzle.transaction(async (tx) => {
      await tx.delete(guideTags).execute();
      await tx.delete(toolTags).execute();
      await tx.delete(contentRelations).execute();
      await tx.delete(searchDocuments).execute();
      await tx.delete(aiSummaries).execute();

      if (importedGuideSlugs.length > 0) {
        await tx.delete(guides).where(notInArray(guides.slug, importedGuideSlugs)).execute();
      } else {
        await tx.delete(guides).execute();
      }

      if (importedToolSlugs.length > 0) {
        await tx.delete(tools).where(notInArray(tools.slug, importedToolSlugs)).execute();
      } else {
        await tx.delete(tools).execute();
      }

      if (importedCategorySlugs.length > 0) {
        await tx.delete(categories).where(notInArray(categories.slug, importedCategorySlugs)).execute();
      } else {
        await tx.delete(categories).execute();
      }

      if (importedTagSlugs.length > 0) {
        await tx.delete(tags).where(notInArray(tags.slug, importedTagSlugs)).execute();
      } else {
        await tx.delete(tags).execute();
      }

      if (index.categories.length > 0) {
        await tx.insert(categories).values(
          index.categories.map((item) => ({
            slug: item.slug,
            name: item.name,
          })),
        ).onConflictDoUpdate({
          target: categories.slug,
          set: {
            name: sql`excluded.name`,
          },
        }).execute();
      }

      if (index.tags.length > 0) {
        await tx.insert(tags).values(
          index.tags.map((item) => ({
            slug: item.slug,
            name: item.name,
          })),
        ).onConflictDoUpdate({
          target: tags.slug,
          set: {
            name: sql`excluded.name`,
          },
        }).execute();
      }

      const persistedCategories = importedCategorySlugs.length > 0
        ? await tx.select({ id: categories.id, slug: categories.slug }).from(categories).where(inArray(categories.slug, importedCategorySlugs)).execute()
        : [];
      const persistedTags = importedTagSlugs.length > 0
        ? await tx.select({ id: tags.id, slug: tags.slug }).from(tags).where(inArray(tags.slug, importedTagSlugs)).execute()
        : [];

      const categoryIdBySlug = new Map<string, string>(persistedCategories.map((item) => [item.slug, item.id]));
      const tagIdBySlug = new Map<string, string>(persistedTags.map((item) => [item.slug, item.id]));

      await tx.insert(guides).values(
        index.guides.map((item) => ({
          id: item.id,
          slug: item.slug,
          title: item.title,
          description: item.description,
          content: item.content,
          readingTime: item.reading_time,
          difficulty: item.difficulty,
          status: ContentStatus.PUBLISHED,
          categoryId: categoryIdBySlug.get(index.categories.find((category) => category.id === item.category_id)?.slug ?? '') ?? '',
          createdAt: new Date(item.created_at),
          updatedAt: new Date(item.updated_at),
        })),
      ).onConflictDoUpdate({
        target: guides.slug,
        set: {
          title: sql`excluded.title`,
          description: sql`excluded.description`,
          content: sql`excluded.content`,
          readingTime: sql`excluded."readingTime"`,
          difficulty: sql`excluded.difficulty`,
          status: sql`excluded.status`,
          categoryId: sql`excluded."categoryId"`,
          updatedAt: sql`excluded.updated_at`,
        },
      }).execute();

      await tx.insert(tools).values(
        index.tools.map((item) => ({
          id: item.id,
          slug: item.slug,
          name: item.name,
          description: item.description,
          website: item.website,
          github: item.github,
          active: true,
          tier: ToolTier.FREE,
          price: ToolPrice.FREE,
          popularity: item.popularity_score,
          categoryId: categoryIdBySlug.get(index.categories.find((category) => category.id === item.category_id)?.slug ?? '') ?? '',
          createdAt: new Date(item.created_at),
          updatedAt: new Date(item.updated_at),
        })),
      ).onConflictDoUpdate({
        target: tools.slug,
        set: {
          name: sql`excluded.name`,
          description: sql`excluded.description`,
          website: sql`excluded.website`,
          github: sql`excluded.github`,
          active: sql`excluded.active`,
          tier: sql`excluded.tier`,
          price: sql`excluded.price`,
          popularity: sql`excluded.popularity`,
          categoryId: sql`excluded."categoryId"`,
          updatedAt: sql`excluded.updated_at`,
        },
      }).execute();

      const persistedGuides = importedGuideSlugs.length > 0
        ? await tx.select({ id: guides.id, slug: guides.slug }).from(guides).where(inArray(guides.slug, importedGuideSlugs)).execute()
        : [];
      const persistedTools = importedToolSlugs.length > 0
        ? await tx.select({ id: tools.id, slug: tools.slug }).from(tools).where(inArray(tools.slug, importedToolSlugs)).execute()
        : [];

      const guideIdBySlug = new Map<string, string>(persistedGuides.map((item) => [item.slug, item.id]));
      const toolIdBySlug = new Map<string, string>(persistedTools.map((item) => [item.slug, item.id]));

      const categorySlugByTempId = new Map<string, string>(index.categories.map((item) => [item.id, item.slug]));
      const guideSlugByTempId = new Map<string, string>(index.guides.map((item) => [item.id, item.slug]));
      const toolSlugByTempId = new Map<string, string>(index.tools.map((item) => [item.id, item.slug]));
      const tagSlugByTempId = new Map<string, string>(index.tags.map((item) => [item.id, item.slug]));

      if (index.guideTags.length > 0) {
        await tx.insert(guideTags).values(
          index.guideTags.flatMap((item) => {
            const guideSlug = guideSlugByTempId.get(item.guide_id);
            const tagSlug = tagSlugByTempId.get(item.tag_id);
            const guideId = guideSlug ? guideIdBySlug.get(guideSlug) : undefined;
            const tagId = tagSlug ? tagIdBySlug.get(tagSlug) : undefined;

            return guideId && tagId ? [{ guideId, tagId }] : [];
          }),
        ).execute();
      }

      if (index.toolTags.length > 0) {
        await tx.insert(toolTags).values(
          index.toolTags.flatMap((item) => {
            const toolSlug = toolSlugByTempId.get(item.tool_id);
            const tagSlug = tagSlugByTempId.get(item.tag_id);
            const toolId = toolSlug ? toolIdBySlug.get(toolSlug) : undefined;
            const tagId = tagSlug ? tagIdBySlug.get(tagSlug) : undefined;

            return toolId && tagId ? [{ toolId, tagId }] : [];
          }),
        ).execute();
      }

      const relationRows = index.relations.flatMap((item: ImportedRelation) => {
        if (!(item.source_type in entityTypeMap) || !(item.target_type in entityTypeMap)) {
          return [];
        }

        const sourceSlug = item.source_type === 'guide'
          ? guideSlugByTempId.get(item.source_id)
          : toolSlugByTempId.get(item.source_id);
        const targetSlug = item.target_type === 'guide'
          ? guideSlugByTempId.get(item.target_id)
          : toolSlugByTempId.get(item.target_id);
        const sourceId = sourceSlug
          ? (item.source_type === 'guide' ? guideIdBySlug.get(sourceSlug) : toolIdBySlug.get(sourceSlug))
          : undefined;
        const targetId = targetSlug
          ? (item.target_type === 'guide' ? guideIdBySlug.get(targetSlug) : toolIdBySlug.get(targetSlug))
          : undefined;

        return sourceId && targetId
          ? [{
              sourceType: entityTypeMap[item.source_type],
              sourceId,
              targetType: entityTypeMap[item.target_type],
              targetId,
              relationType: relationTypeMap[item.relation_type],
            }]
          : [];
      });

      if (relationRows.length > 0) {
        await tx.insert(contentRelations).values(relationRows).execute();
      }

      const searchRows = index.searchDocuments.flatMap((item) => {
        const persistedCategorySlug = categorySlugByTempId.get(
          index.categories.find((category) => category.slug === item.category)?.id ?? '',
        );

        return [{
          contentType: item.content_type,
          title: item.title,
          description: item.description,
          content: item.content,
          status: ContentStatus.PUBLISHED,
          tags: item.tags,
          category: persistedCategorySlug ?? item.category,
          url: item.url,
        }];
      });

      if (searchRows.length > 0) {
        await tx.insert(searchDocuments).values(searchRows).execute();
      }
    });

    const summary: IngestSummary = {
      categories: index.categories.length,
      tags: index.tags.length,
      guides: index.guides.length,
      tools: index.tools.length,
      relations: index.relations.length,
      searchDocuments: index.searchDocuments.length,
    };

    console.log(JSON.stringify({ event: 'content-ingest-complete', summary }));
    console.log('Content ingestion complete.');
  } finally {
    await app.close();
  }
}

void main().catch((error: unknown) => {
  console.error('Content ingestion failed:', error);
  process.exit(1);
});

import { PrismaClient } from '@prisma/client';

export interface KnowledgeMatch {
  runbookId: string;
  title: string;
  serviceSlug?: string;
  content: string;
  tags: string[];
  relevanceScore: number;
}

export class KnowledgeAgent {
  constructor(private db: PrismaClient) {}

  async searchRunbooks(query: string, serviceId?: string): Promise<KnowledgeMatch[]> {
    // Search runbooks matching serviceId or tags/title
    const runbooks = await this.db.runbook.findMany({
      where: {
        isActive: true,
        OR: [
          ...(serviceId ? [{ serviceId }] : []),
          { title: { contains: query, mode: 'insensitive' as const } },
          { description: { contains: query, mode: 'insensitive' as const } },
          { serviceId: null },
        ],
      },
      include: { service: { select: { slug: true } } },
      take: 5,
    });

    return runbooks.map((rb) => ({
      runbookId: rb.id,
      title: rb.title,
      ...(rb.service?.slug ? { serviceSlug: rb.service.slug } : {}),
      content: rb.content,
      tags: rb.tags,
      relevanceScore: rb.serviceId === serviceId ? 0.95 : 0.75,
    }));
  }
}

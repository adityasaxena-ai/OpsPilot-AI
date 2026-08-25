export interface ChunkOptions {
  chunkSize?: number;
  overlap?: number;
}

export interface TextChunk {
  chunkIndex: number;
  content: string;
}

/**
 * Fixed-size character chunking with overlap.
 * Intentionally simple, deterministic, and explainable.
 */
export function chunkText(text: string, options: ChunkOptions = {}): TextChunk[] {
  const chunkSize = options.chunkSize ?? 500;
  const overlap = options.overlap ?? 50;

  const normalized = text.trim();
  if (!normalized) {
    return [];
  }

  const chunks: TextChunk[] = [];
  let start = 0;
  let chunkIndex = 0;

  while (start < normalized.length) {
    const end = Math.min(start + chunkSize, normalized.length);
    const content = normalized.slice(start, end).trim();

    if (content.length > 0) {
      chunks.push({ chunkIndex, content });
      chunkIndex++;
    }

    if (end >= normalized.length) {
      break;
    }

    start += chunkSize - overlap;
  }

  return chunks;
}

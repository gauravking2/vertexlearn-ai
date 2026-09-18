export interface TextChunk {
  index: number;
  text: string;
  charStart: number;
  charEnd: number;
}

export const RAG_CHUNK_SIZE = 800;
export const RAG_CHUNK_OVERLAP = 200;
export const RAG_MAX_CHUNKS = 200;

export function splitSentences(normalized: string): string[] {
  return normalized
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

export function chunkTranscript(transcript: string, size = RAG_CHUNK_SIZE, overlap = RAG_CHUNK_OVERLAP): TextChunk[] {
  const normalized = transcript.replace(/\s+/g, ' ').trim();
  if (!normalized) return [];
  const sentences = splitSentences(normalized);
  const spans: { text: string; start: number; end: number }[] = [];
  let search = 0;
  for (const s of sentences) {
    const i = normalized.indexOf(s, search);
    const start = i >= 0 ? i : search;
    spans.push({ text: s, start, end: start + s.length });
    search = start + s.length;
  }
  const chunks: TextChunk[] = [];
  let buf: { text: string; start: number; end: number }[] = [];
  const bufText = (): string => buf.map((b) => b.text).join(' ');
  const emit = (): void => {
    if (!buf.length || chunks.length >= RAG_MAX_CHUNKS) return;
    const text = bufText();
    chunks.push({ index: chunks.length, text, charStart: buf[0].start, charEnd: buf[buf.length - 1].end });
  };
  const carryOverlap = (): void => {
    if (!buf.length) return;
    const full = bufText();
    const acc: { text: string; start: number; end: number }[] = [];
    let len = 0;
    for (let i = buf.length - 1; i >= 0; i--) {
      const add = (acc.length ? 1 : 0) + buf[i].text.length;
      if (len + add > overlap) break;
      acc.unshift(buf[i]);
      len += add;
    }
    if (!acc.length) {
      const tail = full.slice(-overlap);
      const start = buf[buf.length - 1].end - tail.length;
      buf = [{ text: tail, start, end: start + tail.length }];
      void full;
    } else {
      buf = acc;
    }
  };
  for (const s of spans) {
    let pending: { text: string; start: number; end: number } | null = s;
    while (pending) {
      const candidate = buf.length ? `${bufText()} ${pending.text}` : pending.text;
      if (candidate.length <= size) {
        buf.push(pending);
        pending = null;
      } else if (!buf.length) {
        const slice = pending.text.slice(0, size);
        chunks.push({ index: chunks.length, text: slice, charStart: pending.start, charEnd: pending.start + slice.length });
        if (chunks.length >= RAG_MAX_CHUNKS) return chunks;
        const rest = pending.text.slice(size - Math.min(overlap, size - 1));
        pending = rest ? { text: rest, start: pending.start + (pending.text.length - rest.length), end: pending.end } : null;
        void candidate;
      } else {
        emit();
        if (chunks.length >= RAG_MAX_CHUNKS) return chunks;
        carryOverlap();
      }
    }
  }
  emit();
  return chunks;
}

export function batchChunks(chunks, chunksPerBatch = 5) {
  if (!Number.isInteger(chunksPerBatch) || chunksPerBatch < 1) throw new Error('Batch size must be positive.');
  if (!chunks || chunks.length === 0) {
    return [];
  }

  const batches = [];

  for (let i = 0; i < chunks.length; i += chunksPerBatch) {
    batches.push(chunks.slice(i, i + chunksPerBatch));
  }

  return batches;
}
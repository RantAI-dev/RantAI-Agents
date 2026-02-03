-- Create vector similarity search index for faster retrieval
-- This uses IVFFlat index which is good for approximate nearest neighbor search

-- Create the index on the embedding column
CREATE INDEX IF NOT EXISTS "DocumentChunk_embedding_idx"
ON "DocumentChunk"
USING ivfflat (embedding vector_cosine_ops)
WITH (lists = 100);

-- Note: For production with more documents, you may want to increase 'lists' parameter
-- Rule of thumb: lists = sqrt(number_of_rows)

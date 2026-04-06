-- =====================================================
-- SurrealDB Schema for RantAI Knowledge Base
-- =====================================================
-- This schema defines tables and indexes for:
-- - Document chunks with vector embeddings for RAG
-- =====================================================

-- =====================================
-- Document Chunks (Vector Storage)
-- =====================================

DEFINE TABLE document_chunk SCHEMAFULL;

-- Fields
DEFINE FIELD id ON document_chunk TYPE string;
DEFINE FIELD document_id ON document_chunk TYPE string;
DEFINE FIELD content ON document_chunk TYPE string;
DEFINE FIELD chunk_index ON document_chunk TYPE int;
DEFINE FIELD embedding ON document_chunk TYPE array<float>;
DEFINE FIELD metadata ON document_chunk TYPE option<object>;
DEFINE FIELD created_at ON document_chunk TYPE datetime DEFAULT time::now();

-- Vector index for similarity search (OpenAI text-embedding-3-small = 1536 dimensions)
DEFINE INDEX embedding_idx ON document_chunk FIELDS embedding MTREE DIMENSION 1536 DIST COSINE;

-- Indexes for filtering and lookups
DEFINE INDEX document_id_idx ON document_chunk FIELDS document_id;
DEFINE INDEX id_idx ON document_chunk FIELDS id UNIQUE;

-- =====================================
-- Entities (Knowledge Graph Nodes)
-- =====================================

DEFINE TABLE entity SCHEMAFULL;

-- Fields
DEFINE FIELD id ON entity TYPE string;
DEFINE FIELD name ON entity TYPE string;
DEFINE FIELD type ON entity TYPE string;
DEFINE FIELD confidence ON entity TYPE float;
DEFINE FIELD document_id ON entity TYPE option<string>;
DEFINE FIELD chunk_id ON entity TYPE option<string>;
DEFINE FIELD metadata ON entity TYPE option<object>;
DEFINE FIELD created_at ON entity TYPE datetime DEFAULT time::now();

-- Indexes for entity lookup and filtering
DEFINE INDEX entity_id_idx ON entity FIELDS id UNIQUE;
DEFINE INDEX entity_name_idx ON entity FIELDS name;
DEFINE INDEX entity_type_idx ON entity FIELDS type;
DEFINE INDEX entity_document_id_idx ON entity FIELDS document_id;
DEFINE INDEX entity_name_type_idx ON entity FIELDS name, type;

-- =====================================
-- Conversation Memory (Semantic Memory)
-- =====================================
-- Stores conversation embeddings for semantic recall

DEFINE TABLE conversation_memory SCHEMAFULL;

-- Fields
DEFINE FIELD id ON conversation_memory TYPE string;
DEFINE FIELD userId ON conversation_memory TYPE string;
DEFINE FIELD threadId ON conversation_memory TYPE string;
DEFINE FIELD role ON conversation_memory TYPE string;
DEFINE FIELD content ON conversation_memory TYPE string;
DEFINE FIELD embedding ON conversation_memory TYPE array<float>;
DEFINE FIELD metadata ON conversation_memory TYPE option<object>;
DEFINE FIELD createdAt ON conversation_memory TYPE datetime DEFAULT time::now();

-- Vector index for similarity search (1536 dimensions for text-embedding-3-small)
DEFINE INDEX conversation_embedding_idx ON conversation_memory FIELDS embedding MTREE DIMENSION 1536 DIST COSINE;

-- Indexes for filtering
DEFINE INDEX conversation_user_idx ON conversation_memory FIELDS userId;
DEFINE INDEX conversation_thread_idx ON conversation_memory FIELDS threadId;
DEFINE INDEX conversation_id_idx ON conversation_memory FIELDS id UNIQUE;

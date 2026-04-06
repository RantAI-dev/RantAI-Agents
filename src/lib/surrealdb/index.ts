/**
 * SurrealDB Module for RantAI Knowledge Base
 *
 * Provides vector storage and similarity search capabilities
 * using SurrealDB as the vector database backend.
 */

export {
  SurrealDBClient,
  getSurrealClient,
  getSurrealDBConfigFromEnv,
} from "./client";

export type {
  SurrealDBConfig,
  SurrealQueryResult,
} from "./client";

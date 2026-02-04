import Surreal from "surrealdb";

/**
 * Escape a SurrealDB record ID for use in queries
 * Record IDs with special characters (like hyphens in UUIDs) need backtick escaping
 * e.g., "entity:uuid-with-hyphens" becomes "entity:`uuid-with-hyphens`"
 */
function escapeRecordId(recordId: string): string {
  // Check if it's a table:id format
  const colonIndex = recordId.indexOf(":");
  if (colonIndex === -1) {
    // No table prefix, just escape the whole thing if needed
    if (/[^a-zA-Z0-9_]/.test(recordId)) {
      return `\`${recordId}\``;
    }
    return recordId;
  }

  const table = recordId.slice(0, colonIndex);
  const id = recordId.slice(colonIndex + 1);

  // If the ID contains special characters (like hyphens), escape it with backticks
  if (/[^a-zA-Z0-9_]/.test(id)) {
    return `${table}:\`${id}\``;
  }

  return recordId;
}

/**
 * SurrealDB Client Configuration
 */
export interface SurrealDBConfig {
  url: string;
  username?: string;
  password?: string;
  namespace: string;
  database: string;
}

/**
 * SurrealDB Query Result type
 */
export interface SurrealQueryResult<T = unknown> {
  result?: T[];
  status?: string;
  time?: string;
}

/**
 * SurrealDB Client - Singleton pattern for managing connections
 */
export class SurrealDBClient {
  private static instance: SurrealDBClient | null = null;
  private static initializationPromise: Promise<SurrealDBClient> | null = null;
  private db: Surreal;
  private connected = false;
  private connectionPromise: Promise<void> | null = null;
  private reconnectPromise: Promise<void> | null = null;
  private config: SurrealDBConfig;
  private lastAuthTime: number = 0;
  private static readonly TOKEN_REFRESH_INTERVAL = 50 * 60 * 1000; // 50 minutes

  private constructor(config: SurrealDBConfig) {
    this.config = config;
    this.db = new Surreal();
  }

  /**
   * Get or create singleton instance
   */
  static async getInstance(config?: SurrealDBConfig): Promise<SurrealDBClient> {
    if (SurrealDBClient.instance) {
      return SurrealDBClient.instance;
    }

    if (SurrealDBClient.initializationPromise) {
      return SurrealDBClient.initializationPromise;
    }

    if (!config) {
      throw new Error("SurrealDBClient: config required for first initialization");
    }

    SurrealDBClient.initializationPromise = (async () => {
      try {
        const instance = new SurrealDBClient(config);
        await instance.connect();
        SurrealDBClient.instance = instance;
        return instance;
      } finally {
        SurrealDBClient.initializationPromise = null;
      }
    })();

    return SurrealDBClient.initializationPromise;
  }

  /**
   * Reset singleton instance (for testing)
   */
  static async resetInstance(): Promise<void> {
    if (SurrealDBClient.instance) {
      await SurrealDBClient.instance.disconnect();
      SurrealDBClient.instance = null;
    }
    SurrealDBClient.initializationPromise = null;
  }

  /**
   * Connect to SurrealDB
   */
  private async connect(): Promise<void> {
    if (this.connected) return;

    if (this.connectionPromise) {
      return this.connectionPromise;
    }

    this.connectionPromise = (async () => {
      try {
        await this.db.connect(this.config.url);

        if (this.config.username && this.config.password) {
          await this.db.signin({
            username: this.config.username,
            password: this.config.password,
          });
          this.lastAuthTime = Date.now();
        }

        await this.db.use({
          namespace: this.config.namespace,
          database: this.config.database,
        });

        this.connected = true;
        console.log(`[SurrealDB] Connected: ${this.config.namespace}/${this.config.database}`);
      } catch (error) {
        console.error("[SurrealDB] Connection failed:", error);
        throw error;
      } finally {
        this.connectionPromise = null;
      }
    })();

    return this.connectionPromise;
  }

  /**
   * Disconnect from SurrealDB
   */
  async disconnect(): Promise<void> {
    if (!this.connected) return;

    try {
      await this.db.close();
      this.connected = false;
      this.connectionPromise = null;
      console.log("[SurrealDB] Disconnected");
    } catch (error) {
      console.error("[SurrealDB] Disconnect failed:", error);
      throw error;
    }
  }

  /**
   * Check if connected
   */
  isConnected(): boolean {
    return this.connected;
  }

  /**
   * Re-authenticate if token expired
   */
  private async reauthenticate(): Promise<void> {
    console.log("[SurrealDB] Token expired, re-authenticating...");

    try {
      if (this.config.username && this.config.password) {
        await this.db.signin({
          username: this.config.username,
          password: this.config.password,
        });
        this.lastAuthTime = Date.now();
      }

      await this.db.use({
        namespace: this.config.namespace,
        database: this.config.database,
      });

      console.log("[SurrealDB] Re-authenticated successfully");
    } catch (error) {
      console.error("[SurrealDB] Re-authentication failed:", error);
      throw error;
    }
  }

  /**
   * Full reconnect - closes connection and reconnects fresh
   */
  private async fullReconnect(): Promise<void> {
    if (this.reconnectPromise) {
      return this.reconnectPromise;
    }

    this.reconnectPromise = (async () => {
      console.log("[SurrealDB] Performing full reconnect...");

      try {
        try {
          await this.db.close();
        } catch {
          // Ignore close errors
        }

        this.db = new Surreal();
        this.connected = false;
        this.connectionPromise = null;

        await this.db.connect(this.config.url);

        if (this.config.username && this.config.password) {
          await this.db.signin({
            username: this.config.username,
            password: this.config.password,
          });
          this.lastAuthTime = Date.now();
        }

        await this.db.use({
          namespace: this.config.namespace,
          database: this.config.database,
        });

        this.connected = true;
        console.log("[SurrealDB] Full reconnect successful");
      } catch (error) {
        console.error("[SurrealDB] Full reconnect failed:", error);
        this.connected = false;
        throw error;
      } finally {
        this.reconnectPromise = null;
      }
    })();

    return this.reconnectPromise;
  }

  /**
   * Ensure authentication is fresh
   */
  private async ensureFreshAuth(): Promise<void> {
    const timeSinceAuth = Date.now() - this.lastAuthTime;
    if (this.lastAuthTime > 0 && timeSinceAuth > SurrealDBClient.TOKEN_REFRESH_INTERVAL) {
      await this.reauthenticate();
    }
  }

  /**
   * Check if error is a token expiration error
   */
  private isTokenExpiredError(error: unknown): boolean {
    const err = error as { message?: string; status?: number; statusText?: string; cause?: { message?: string } };
    const errorMessage = typeof err?.message === "string" ? err.message.toLowerCase() : "";
    const causeMessage = typeof err?.cause?.message === "string" ? err.cause.message.toLowerCase() : "";

    return (
      err?.status === 401 ||
      err?.statusText === "Unauthorized" ||
      errorMessage.includes("token has expired") ||
      errorMessage.includes("unauthorized") ||
      causeMessage.includes("token has expired")
    );
  }

  /**
   * Check if error is a connection error
   */
  private isConnectionError(error: unknown): boolean {
    const err = error as { message?: string; cause?: { message?: string; code?: string }; code?: string };
    const errorMessage = typeof err?.message === "string" ? err.message.toLowerCase() : "";
    const causeMessage = typeof err?.cause?.message === "string" ? err.cause.message.toLowerCase() : "";
    const errorCode = err?.cause?.code || err?.code || "";

    return (
      errorMessage.includes("fetch failed") ||
      errorMessage.includes("connection") ||
      errorMessage.includes("enotfound") ||
      errorMessage.includes("econnrefused") ||
      causeMessage.includes("getaddrinfo") ||
      causeMessage.includes("enotfound") ||
      causeMessage.includes("econnrefused") ||
      errorCode === "ENOTFOUND" ||
      errorCode === "ECONNREFUSED"
    );
  }

  /**
   * Execute raw SurrealQL query with automatic retry on token expiration
   */
  async query<T = unknown>(sql: string, vars?: Record<string, unknown>): Promise<SurrealQueryResult<T>[]> {
    if (!this.connected) {
      throw new Error("SurrealDB not connected. Call connect() first.");
    }

    try {
      await this.ensureFreshAuth();
      const result = await this.db.query(sql, vars);
      return result as SurrealQueryResult<T>[];
    } catch (error) {
      if (this.isConnectionError(error)) {
        try {
          await this.fullReconnect();
          const result = await this.db.query(sql, vars);
          return result as SurrealQueryResult<T>[];
        } catch (reconnectError) {
          console.error("[SurrealDB] Query failed after full reconnect:", reconnectError);
          throw reconnectError;
        }
      }

      if (this.isTokenExpiredError(error)) {
        try {
          await this.reauthenticate();
          const result = await this.db.query(sql, vars);
          return result as SurrealQueryResult<T>[];
        } catch (reauthError) {
          try {
            await this.fullReconnect();
            const result = await this.db.query(sql, vars);
            return result as SurrealQueryResult<T>[];
          } catch (reconnectError) {
            console.error("[SurrealDB] Query failed after full reconnect:", reconnectError);
            throw reconnectError;
          }
        }
      }

      console.error("[SurrealDB] Query failed:", error);
      throw error;
    }
  }

  /**
   * Create a record in a table
   */
  async create<T = unknown>(table: string, data: Partial<T>): Promise<T> {
    if (!this.connected) {
      throw new Error("SurrealDB not connected. Call connect() first.");
    }

    try {
      await this.ensureFreshAuth();
      const result = await this.db.create(table, data);
      return result as T;
    } catch (error) {
      if (this.isConnectionError(error) || this.isTokenExpiredError(error)) {
        await this.fullReconnect();
        const result = await this.db.create(table, data);
        return result as T;
      }
      throw error;
    }
  }

  /**
   * Delete a record by ID
   */
  async delete(id: string): Promise<void> {
    if (!this.connected) {
      throw new Error("SurrealDB not connected. Call connect() first.");
    }

    try {
      await this.ensureFreshAuth();
      await this.db.delete(id);
    } catch (error) {
      if (this.isConnectionError(error) || this.isTokenExpiredError(error)) {
        await this.fullReconnect();
        await this.db.delete(id);
        return;
      }
      throw error;
    }
  }

  /**
   * Vector similarity search
   */
  async vectorSearch<T = unknown>(
    table: string,
    embedding: number[],
    limit: number = 10,
    filters?: Record<string, unknown>
  ): Promise<T[]> {
    if (!this.connected) {
      throw new Error("SurrealDB not connected. Call connect() first.");
    }

    try {
      const whereClause = filters
        ? Object.entries(filters)
            .map(([key]) => `${key} = $${key}`)
            .join(" AND ")
        : "true";

      const sql = `
        SELECT *, vector::similarity::cosine(embedding, $embedding) AS similarity
        FROM ${table}
        WHERE ${whereClause}
        ORDER BY similarity DESC
        LIMIT $limit;
      `;

      const vars = {
        embedding,
        limit,
        ...filters,
      };

      const result = await this.query<T>(sql, vars);
      return result[0]?.result || [];
    } catch (error) {
      console.error(`[SurrealDB] Vector search in ${table} failed:`, error);
      throw error;
    }
  }

  /**
   * Create a graph relation between two entities using RELATE syntax
   *
   * SurrealDB RELATE syntax: RELATE source->relation_type->target
   * This creates a graph edge connecting two nodes.
   *
   * @param sourceId - Source entity ID (e.g., "entity:abc123")
   * @param relationType - Type of relation (e.g., "works_for", "PART_OF")
   * @param targetId - Target entity ID (e.g., "entity:xyz789")
   * @param data - Additional data to store on the relation
   * @returns The created relation record
   */
  async relate<T = unknown>(
    sourceId: string,
    relationType: string,
    targetId: string,
    data?: Record<string, unknown>
  ): Promise<T> {
    if (!this.connected) {
      throw new Error("SurrealDB not connected. Call connect() first.");
    }

    try {
      await this.ensureFreshAuth();

      // Build RELATE query with SET clause if data provided
      // Escape record IDs to handle UUIDs with hyphens
      const escapedSourceId = escapeRecordId(sourceId);
      const escapedTargetId = escapeRecordId(targetId);
      const setClause = data
        ? `SET ${Object.entries(data)
            .map(([key]) => `${key} = $${key}`)
            .join(", ")}`
        : "";

      const sql = `RELATE ${escapedSourceId}->${relationType}->${escapedTargetId} ${setClause};`;

      const result = await this.db.query(sql, data || {});
      const relationResult = result as SurrealQueryResult<T>[];
      return relationResult[0]?.result?.[0] as T;
    } catch (error) {
      if (this.isConnectionError(error) || this.isTokenExpiredError(error)) {
        await this.fullReconnect();
        const escapedSourceId = escapeRecordId(sourceId);
        const escapedTargetId = escapeRecordId(targetId);
        const setClause = data
          ? `SET ${Object.entries(data)
              .map(([key]) => `${key} = $${key}`)
              .join(", ")}`
          : "";
        const sql = `RELATE ${escapedSourceId}->${relationType}->${escapedTargetId} ${setClause};`;
        const result = await this.db.query(sql, data || {});
        const relationResult = result as SurrealQueryResult<T>[];
        return relationResult[0]?.result?.[0] as T;
      }
      throw error;
    }
  }

  /**
   * Create multiple relations in a batch using transaction
   * More efficient than calling relate() multiple times
   *
   * @param relations - Array of relations to create
   * @returns Array of created relation records
   */
  async relateBatch<T = unknown>(
    relations: Array<{
      sourceId: string;
      relationType: string;
      targetId: string;
      data?: Record<string, unknown>;
    }>
  ): Promise<T[]> {
    if (!this.connected) {
      throw new Error("SurrealDB not connected. Call connect() first.");
    }

    if (relations.length === 0) {
      return [];
    }

    try {
      await this.ensureFreshAuth();

      // Build batch RELATE queries
      const queries: string[] = [];
      const vars: Record<string, unknown> = {};

      relations.forEach((rel, idx) => {
        const dataVars: Record<string, string> = {};
        if (rel.data) {
          Object.entries(rel.data).forEach(([key, value]) => {
            const varName = `${key}_${idx}`;
            vars[varName] = value;
            dataVars[key] = `$${varName}`;
          });
        }

        const setClause = rel.data
          ? `SET ${Object.entries(dataVars)
              .map(([key, varRef]) => `${key} = ${varRef}`)
              .join(", ")}`
          : "";

        // Escape record IDs to handle UUIDs with hyphens
        const escapedSourceId = escapeRecordId(rel.sourceId);
        const escapedTargetId = escapeRecordId(rel.targetId);
        queries.push(`RELATE ${escapedSourceId}->${rel.relationType}->${escapedTargetId} ${setClause}`);
      });

      // Execute as transaction
      const sql = `BEGIN TRANSACTION;\n${queries.join(";\n")};\nCOMMIT TRANSACTION;`;

      const result = await this.db.query(sql, vars);
      const results: T[] = [];

      // Extract results from transaction response
      const queryResults = result as SurrealQueryResult<T>[];
      for (const qr of queryResults) {
        if (qr.result && Array.isArray(qr.result)) {
          results.push(...qr.result);
        }
      }

      return results;
    } catch (error) {
      console.error("[SurrealDB] Batch relate failed:", error);
      throw error;
    }
  }

  /**
   * Traverse graph from an entity to find related entities
   * Uses SurrealDB graph traversal syntax
   *
   * @param entityId - Starting entity ID
   * @param relationType - Optional relation type to filter (e.g., "WORKS_FOR")
   * @param direction - Direction to traverse: "out" (default), "in", or "both"
   * @param depth - Maximum depth to traverse (default: 1)
   * @returns Related entities found
   */
  async traverseGraph<T = unknown>(
    entityId: string,
    relationType?: string,
    direction: "out" | "in" | "both" = "out",
    depth: number = 1
  ): Promise<T[]> {
    if (!this.connected) {
      throw new Error("SurrealDB not connected. Call connect() first.");
    }

    try {
      await this.ensureFreshAuth();

      // Build graph traversal query
      // SurrealDB syntax: ->relation->entity or <-relation<-entity
      const arrow = direction === "in" ? "<-" : "->";
      const relationFilter = relationType || "";
      const depthStr = depth > 1 ? `{${depth}}` : "";

      let sql: string;
      if (direction === "both") {
        sql = `
          SELECT VALUE id FROM ${entityId}->${relationFilter}${depthStr}->entity
          UNION
          SELECT VALUE id FROM ${entityId}<-${relationFilter}${depthStr}<-entity;
        `;
      } else {
        sql = `SELECT * FROM ${entityId}${arrow}${relationFilter}${depthStr}${arrow}entity;`;
      }

      const result = await this.query<T>(sql);
      return result[0]?.result || [];
    } catch (error) {
      console.error("[SurrealDB] Graph traversal failed:", error);
      throw error;
    }
  }

  /**
   * Find entities connected to given entity with their relations
   */
  async getRelatedEntities<T = unknown>(
    entityId: string,
    options?: {
      relationType?: string;
      direction?: "out" | "in" | "both";
      limit?: number;
    }
  ): Promise<Array<{ entity: T; relation: { type: string; confidence?: number } }>> {
    if (!this.connected) {
      throw new Error("SurrealDB not connected. Call connect() first.");
    }

    const { relationType, direction = "both", limit = 50 } = options || {};

    try {
      await this.ensureFreshAuth();

      const relationFilter = relationType ? `WHERE relation_type = $relationType` : "";

      // Get outgoing relations
      const outQuery = `
        SELECT
          out AS entity,
          relation_type,
          confidence
        FROM ${entityId}->*->entity
        ${relationFilter}
        LIMIT $limit;
      `;

      // Get incoming relations
      const inQuery = `
        SELECT
          in AS entity,
          relation_type,
          confidence
        FROM ${entityId}<-*<-entity
        ${relationFilter}
        LIMIT $limit;
      `;

      const vars = { relationType, limit };
      let results: Array<{ entity: T; relation: { type: string; confidence?: number } }> = [];

      if (direction === "out" || direction === "both") {
        const outResult = await this.query<{ entity: T; relation_type: string; confidence?: number }>(
          outQuery,
          vars
        );
        const outEntities = outResult[0]?.result || [];
        results.push(
          ...outEntities.map((r) => ({
            entity: r.entity,
            relation: { type: r.relation_type, confidence: r.confidence },
          }))
        );
      }

      if (direction === "in" || direction === "both") {
        const inResult = await this.query<{ entity: T; relation_type: string; confidence?: number }>(
          inQuery,
          vars
        );
        const inEntities = inResult[0]?.result || [];
        results.push(
          ...inEntities.map((r) => ({
            entity: r.entity,
            relation: { type: r.relation_type, confidence: r.confidence },
          }))
        );
      }

      return results;
    } catch (error) {
      console.error("[SurrealDB] Get related entities failed:", error);
      throw error;
    }
  }

  /**
   * Clean up document intelligence data (entities and relations) for a document
   * Relations are stored in dynamic tables created by RELATE syntax
   * Dynamically discovers all relation tables from database info
   *
   * @param documentId - The document ID to clean up data for
   * @returns Stats about what was deleted
   */
  async cleanupDocumentIntelligence(
    documentId: string
  ): Promise<{ deletedRelationTables: number; entitiesDeleted: boolean; chunksDeleted: boolean }> {
    if (!this.connected) {
      throw new Error("SurrealDB not connected. Call connect() first.");
    }

    let deletedRelationTables = 0;

    // Dynamically discover relation tables from database info
    try {
      const dbInfo = await this.query<{ tables: Record<string, string> }>(`INFO FOR DB`);
      const rawInfo = dbInfo[0];
      const info = Array.isArray(rawInfo) ? rawInfo[0] : rawInfo;

      if (info?.tables) {
        // Filter out non-relation tables
        const excludedTables = ["entity", "document_chunk"];
        const relationTables = Object.keys(info.tables).filter(
          (table) => !excludedTables.includes(table)
        );

        // Delete relations from all discovered tables
        for (const relType of relationTables) {
          try {
            await this.query(
              `DELETE ${relType} WHERE document_id = $document_id`,
              { document_id: documentId }
            );
            deletedRelationTables++;
          } catch {
            // Query failed, skip silently
          }
        }
      }
    } catch (infoError) {
      console.error("[SurrealDB] Failed to discover relation tables:", infoError);
    }

    // Delete entities
    let entitiesDeleted = false;
    try {
      await this.query(
        `DELETE entity WHERE document_id = $document_id`,
        { document_id: documentId }
      );
      entitiesDeleted = true;
    } catch (error) {
      console.error("[SurrealDB] Failed to delete entities:", error);
    }

    // Delete chunks
    let chunksDeleted = false;
    try {
      await this.query(
        `DELETE document_chunk WHERE document_id = $document_id`,
        { document_id: documentId }
      );
      chunksDeleted = true;
    } catch (error) {
      console.error("[SurrealDB] Failed to delete chunks:", error);
    }

    return { deletedRelationTables, entitiesDeleted, chunksDeleted };
  }

  /**
   * Health check
   */
  async healthCheck(): Promise<boolean> {
    try {
      await this.query("SELECT 1;");
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get raw SurrealDB instance
   */
  getRawClient(): Surreal {
    return this.db;
  }
}

/**
 * Get SurrealDB config from environment variables
 */
export function getSurrealDBConfigFromEnv(): SurrealDBConfig {
  return {
    url: process.env.SURREAL_DB_URL || "ws://localhost:8000/rpc",
    username: process.env.SURREAL_DB_USER || "root",
    password: process.env.SURREAL_DB_PASS || "root",
    namespace: process.env.SURREAL_DB_NAMESPACE || "rantai",
    database: process.env.SURREAL_DB_DATABASE || "knowledge",
  };
}

/**
 * Get SurrealDB client singleton (convenience function)
 */
export async function getSurrealClient(): Promise<SurrealDBClient> {
  return SurrealDBClient.getInstance(getSurrealDBConfigFromEnv());
}

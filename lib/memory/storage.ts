/**
 * Memory Storage Provider
 * Uses LibSQL for Mastra Memory storage
 */

import { LibSQLStore } from '@mastra/libsql';

// Initialize LibSQL client
const url = process.env.LIBSQL_URL || 'file:./data/libsql/memory.db';
const authToken = process.env.LIBSQL_AUTH_TOKEN;

// Export raw config for other uses
export const dbConfig = {
  url,
  authToken,
};

// Create LibSQL storage instance for Mastra Memory
export const createStorageProvider = () => {
  return new LibSQLStore({
    id: 'rantai-memory',
    url,
    ...(authToken && { authToken }),
  });
};

// Singleton storage instance
let storageInstance: LibSQLStore | null = null;

export const getStorageProvider = (): LibSQLStore => {
  if (!storageInstance) {
    storageInstance = createStorageProvider();
  }
  return storageInstance;
};



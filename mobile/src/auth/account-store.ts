import * as SecureStore from "expo-secure-store"

const INDEX_KEY = "accounts/index"
const ACTIVE_KEY = "accounts/active"

export interface StoredAccount {
  id: string
  email: string
  name: string
  refreshToken: string
}

async function readIndex(): Promise<string[]> {
  const raw = await SecureStore.getItemAsync(INDEX_KEY)
  if (!raw) return []
  try { return JSON.parse(raw) } catch { return [] }
}

async function writeIndex(ids: string[]): Promise<void> {
  await SecureStore.setItemAsync(INDEX_KEY, JSON.stringify(ids))
}

function key(id: string): string {
  return `accounts/${id}`
}

export async function addAccount(acct: StoredAccount): Promise<void> {
  const ids = await readIndex()
  if (!ids.includes(acct.id)) ids.push(acct.id)
  await writeIndex(ids)
  await SecureStore.setItemAsync(key(acct.id), JSON.stringify(acct))
}

export async function listAccounts(): Promise<StoredAccount[]> {
  const ids = await readIndex()
  const out: StoredAccount[] = []
  for (const id of ids) {
    const raw = await SecureStore.getItemAsync(key(id))
    if (raw) {
      try { out.push(JSON.parse(raw)) } catch { /* skip corrupt entry */ }
    }
  }
  return out
}

export async function getAccount(id: string): Promise<StoredAccount | null> {
  const raw = await SecureStore.getItemAsync(key(id))
  if (!raw) return null
  try { return JSON.parse(raw) } catch { return null }
}

export async function removeAccount(id: string): Promise<void> {
  const ids = (await readIndex()).filter(x => x !== id)
  await writeIndex(ids)
  await SecureStore.deleteItemAsync(key(id))
  if (await getActiveAccountId() === id) {
    await SecureStore.deleteItemAsync(ACTIVE_KEY)
  }
}

export async function setActiveAccount(id: string): Promise<void> {
  await SecureStore.setItemAsync(ACTIVE_KEY, id)
}

export async function getActiveAccountId(): Promise<string | null> {
  return SecureStore.getItemAsync(ACTIVE_KEY)
}

export async function clearAllAccounts(): Promise<void> {
  for (const id of await readIndex()) {
    await SecureStore.deleteItemAsync(key(id))
  }
  await SecureStore.deleteItemAsync(INDEX_KEY)
  await SecureStore.deleteItemAsync(ACTIVE_KEY)
}

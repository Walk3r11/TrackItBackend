import { createClient } from "redis";

type CacheEntry<T> = {
  value: T;
  expiresAt: number;
};

const MAX_ENTRIES = 500;
const localCache = new Map<string, CacheEntry<unknown>>();

type RedisClient = ReturnType<typeof createClient>;

let redisClient: RedisClient | null = null;
let redisConnectPromise: Promise<RedisClient | null> | null = null;

function pruneExpired() {
  const now = Date.now();
  for (const [key, entry] of localCache.entries()) {
    if (entry.expiresAt <= now) {
      localCache.delete(key);
    }
  }
}

function pruneOverflow() {
  if (localCache.size <= MAX_ENTRIES) return;
  const keys = localCache.keys();
  while (localCache.size > MAX_ENTRIES) {
    const key = keys.next().value as string | undefined;
    if (!key) break;
    localCache.delete(key);
  }
}

async function getRedisClient() {
  if (!process.env.REDIS_URL) return null;
  if (redisClient) return redisClient;
  if (!redisConnectPromise) {
    const client = createClient({ url: process.env.REDIS_URL });
    redisConnectPromise = client
      .connect()
      .then(() => {
        client.on("error", (err) => {
          console.error("[redis] client error", err);
        });
        redisClient = client;
        return client;
      })
      .catch((err) => {
        console.error("[redis] connect error", err);
        redisConnectPromise = null;
        redisClient = null;
        return null;
      });
  }
  return redisConnectPromise;
}

export async function getCache<T>(key: string): Promise<T | null> {
  const now = Date.now();
  const entry = localCache.get(key) as CacheEntry<T> | undefined;
  if (entry && entry.expiresAt > now) {
    return entry.value;
  }
  if (entry) {
    localCache.delete(key);
  }

  const client = await getRedisClient();
  if (!client) return null;

  try {
    const raw = await client.get(key);
    if (!raw) return null;
    return JSON.parse(raw) as T;
  } catch (err) {
    console.error("[redis] get error", err);
    return null;
  }
}

export async function setCache<T>(key: string, value: T, ttlMs: number) {
  localCache.set(key, { value, expiresAt: Date.now() + ttlMs });
  pruneExpired();
  pruneOverflow();

  const client = await getRedisClient();
  if (!client) return;

  try {
    await client.set(key, JSON.stringify(value), {
      PX: ttlMs,
    });
  } catch (err) {
    console.error("[redis] set error", err);
  }
}

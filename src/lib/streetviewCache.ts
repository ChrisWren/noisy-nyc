import { promises as fs } from "fs";
import path from "path";

export type StreetViewFrame = {
  imageUrl: string;
  capturedAt: string | null;
  compassAngle: number | null;
  id: string | null;
};

export type StreetViewPayload = {
  images: StreetViewFrame[];
  preferredIndex: number;
};

type CacheEntry = StreetViewPayload & {
  lat: number;
  lng: number;
  bearing: number;
  cachedAt: number;
};

type CacheShape = {
  version: 2;
  entries: Record<string, CacheEntry>;
};

const CACHE_VERSION = 2;
const CACHE_TTL_MS = 1000 * 60 * 60 * 24 * 7; // 7 days
const CACHE_DIR = path.join(process.cwd(), ".cache");
const CACHE_FILE = path.join(CACHE_DIR, "streetview-cache.json");

let cacheStore: CacheShape | null = null;

const getKey = (lat: number, lng: number, bearing: number) => {
  const latKey = lat.toFixed(6);
  const lngKey = lng.toFixed(6);
  const bearingKey = bearing.toFixed(1);
  return `${latKey}|${lngKey}|${bearingKey}`;
};

const normalizeBearing = (bearing: number) => {
  const normalized = bearing % 360;
  return normalized < 0 ? normalized + 360 : normalized;
};

const loadCache = async (): Promise<CacheShape> => {
  if (cacheStore) {
    return cacheStore;
  }

  try {
    const data = await fs.readFile(CACHE_FILE, "utf8");
    const parsed = JSON.parse(data) as Partial<CacheShape>;
    if (parsed.version === CACHE_VERSION && parsed.entries) {
      cacheStore = { version: CACHE_VERSION, entries: parsed.entries };
      return cacheStore;
    }
  } catch (error) {
    // Ignore missing file or parse errors; we'll recreate.
  }

  cacheStore = { version: CACHE_VERSION, entries: {} };
  return cacheStore;
};

const persistCache = async () => {
  if (!cacheStore) {
    return;
  }
  await fs.mkdir(CACHE_DIR, { recursive: true });
  await fs.writeFile(CACHE_FILE, JSON.stringify(cacheStore, null, 2), "utf8");
};

export const getCachedStreetView = async (
  lat: number,
  lng: number,
  bearing: number
): Promise<StreetViewPayload | null> => {
  const cache = await loadCache();
  const key = getKey(lat, lng, normalizeBearing(bearing));
  const entry = cache.entries[key];
  if (!entry) {
    return null;
  }

  if (Date.now() - entry.cachedAt > CACHE_TTL_MS) {
    delete cache.entries[key];
    await persistCache();
    return null;
  }

  const { images, preferredIndex } = entry;
  return { images, preferredIndex };
};

export const setCachedStreetView = async (
  lat: number,
  lng: number,
  bearing: number,
  payload: StreetViewPayload
) => {
  const cache = await loadCache();
  const key = getKey(lat, lng, normalizeBearing(bearing));
  cache.entries[key] = {
    lat,
    lng,
    bearing: normalizeBearing(bearing),
    cachedAt: Date.now(),
    images: payload.images,
    preferredIndex: payload.preferredIndex,
  };
  await persistCache();
};


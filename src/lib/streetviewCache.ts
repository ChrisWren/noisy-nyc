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

type CacheEntry = {
  payload: StreetViewPayload;
  cachedAt: number;
  version: number;
};

const CACHE_VERSION = 2;
const CACHE_TTL_MS = 1000 * 60 * 60 * 24 * 7; // 7 days
const CACHE_KEY_PREFIX = `streetview-cache:v${CACHE_VERSION}:`;

const memoryCache = new Map<string, CacheEntry>();

const normalizeBearing = (bearing: number) => {
  if (!Number.isFinite(bearing)) {
    return 0;
  }
  const normalized = bearing % 360;
  return normalized < 0 ? normalized + 360 : normalized;
};

const getCacheKey = (lat: number, lng: number, bearing: number) => {
  return `${lat.toFixed(6)}|${lng.toFixed(6)}|${normalizeBearing(bearing).toFixed(1)}`;
};

const isExpired = (entry: CacheEntry) => Date.now() - entry.cachedAt > CACHE_TTL_MS;

let persistentStorage: Storage | null | undefined;

const getPersistentStorage = (): Storage | null => {
  if (persistentStorage !== undefined) {
    return persistentStorage;
  }

  if (typeof window === "undefined") {
    persistentStorage = null;
    return persistentStorage;
  }

  try {
    const { localStorage } = window;
    const testKey = `${CACHE_KEY_PREFIX}__test__`;
    localStorage.setItem(testKey, "1");
    localStorage.removeItem(testKey);
    persistentStorage = localStorage;
  } catch {
    persistentStorage = null;
  }

  return persistentStorage;
};

const loadFromStorage = (key: string): CacheEntry | null => {
  const storage = getPersistentStorage();
  if (!storage) {
    return null;
  }

  try {
    const raw = storage.getItem(key);
    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw) as Partial<CacheEntry>;
    if (
      typeof parsed !== "object" ||
      parsed === null ||
      parsed.version !== CACHE_VERSION ||
      typeof parsed.cachedAt !== "number" ||
      typeof parsed.payload !== "object" ||
      parsed.payload === null
    ) {
      storage.removeItem(key);
      return null;
    }

    return parsed as CacheEntry;
  } catch {
    storage.removeItem(key);
    return null;
  }
};

const saveToStorage = (key: string, entry: CacheEntry) => {
  const storage = getPersistentStorage();
  if (!storage) {
    return;
  }

  try {
    storage.setItem(key, JSON.stringify(entry));
  } catch {
    // If storage is full or unavailable, ignore and rely on in-memory cache.
  }
};

const removeFromStorage = (key: string) => {
  const storage = getPersistentStorage();
  if (!storage) {
    return;
  }

  try {
    storage.removeItem(key);
  } catch {
    // Ignore storage removal issues.
  }
};

export const getCachedStreetView = async (
  lat: number,
  lng: number,
  bearing: number
): Promise<StreetViewPayload | null> => {
  if (typeof window === "undefined") {
    return null;
  }

  const cacheKey = `${CACHE_KEY_PREFIX}${getCacheKey(lat, lng, bearing)}`;

  const inMemory = memoryCache.get(cacheKey);
  if (inMemory) {
    if (isExpired(inMemory)) {
      memoryCache.delete(cacheKey);
      removeFromStorage(cacheKey);
      return null;
    }
    return inMemory.payload;
  }

  const persisted = loadFromStorage(cacheKey);
  if (!persisted) {
    return null;
  }

  if (isExpired(persisted)) {
    removeFromStorage(cacheKey);
    return null;
  }

  memoryCache.set(cacheKey, persisted);
  return persisted.payload;
};

export const setCachedStreetView = async (
  lat: number,
  lng: number,
  bearing: number,
  payload: StreetViewPayload
) => {
  if (typeof window === "undefined") {
    return;
  }

  const cacheKey = `${CACHE_KEY_PREFIX}${getCacheKey(lat, lng, bearing)}`;
  const entry: CacheEntry = {
    payload,
    cachedAt: Date.now(),
    version: CACHE_VERSION,
  };

  memoryCache.set(cacheKey, entry);
  saveToStorage(cacheKey, entry);
};

const MAPILLARY_GRAPH_ENDPOINT = "https://graph.mapillary.com/images";

const normalizeBearingDifference = (a: number, b: number) => {
  const diff = Math.abs(a - b) % 360;
  return diff > 180 ? 360 - diff : diff;
};

type FetchStreetViewOptions = {
  signal?: AbortSignal;
};

export const fetchStreetView = async (
  lat: number,
  lng: number,
  bearing: number,
  options: FetchStreetViewOptions = {}
): Promise<StreetViewPayload> => {
  const { signal } = options;

  const throwIfAborted = () => {
    if (signal?.aborted) {
      const reason = signal.reason;
      if (reason instanceof DOMException && reason.name === "AbortError") {
        throw reason;
      }
      throw new DOMException(typeof reason === "string" ? reason : "Aborted", "AbortError");
    }
  };

  throwIfAborted();

  const normalizedBearing = normalizeBearing(bearing);

  const cached = await getCachedStreetView(lat, lng, normalizedBearing);
  if (cached) {
    return cached;
  }

  const accessToken = process.env.NEXT_PUBLIC_MAPILLARY_ACCESS_TOKEN;
  if (!accessToken) {
    throw new Error("Street imagery unavailable. No access token configured.");
  }

  const BBOX_HALF_WIDTH_METERS = 110;
  const metersPerDegreeLat = 111_320;
  const cosLat = Math.abs(Math.cos((lat * Math.PI) / 180));
  const metersPerDegreeLng = 111_320 * Math.max(cosLat, 0.000001);
  const deltaLat = BBOX_HALF_WIDTH_METERS / metersPerDegreeLat;
  const deltaLng = BBOX_HALF_WIDTH_METERS / metersPerDegreeLng;

  const minLat = lat - deltaLat;
  const maxLat = lat + deltaLat;
  const minLng = lng - deltaLng;
  const maxLng = lng + deltaLng;

  const mapillaryUrl = new URL(MAPILLARY_GRAPH_ENDPOINT);
  mapillaryUrl.searchParams.set("access_token", accessToken);
  mapillaryUrl.searchParams.set("limit", "12");
  mapillaryUrl.searchParams.set("bbox", `${minLng},${minLat},${maxLng},${maxLat}`);
  mapillaryUrl.searchParams.set(
    "fields",
    ["id", "thumb_2048_url", "thumb_1024_url", "thumb_512_url", "captured_at", "compass_angle"].join(",")
  );

  throwIfAborted();

  let response: Response;
  try {
    response = await fetch(mapillaryUrl.toString(), {
      headers: {
        Accept: "application/json",
      },
      cache: "no-store",
      signal,
    });
  } catch (error) {
    throwIfAborted();
    throw error instanceof Error
      ? error
      : new Error("Failed to reach street imagery service.");
  }

  if (!response.ok) {
    throw new Error("Street imagery request failed.");
  }

  const payload = (await response.json()) as { data?: Array<Record<string, unknown>> };
  const images = payload.data ?? [];

  if (images.length === 0) {
    const emptyPayload: StreetViewPayload = { images: [], preferredIndex: 0 };
    await setCachedStreetView(lat, lng, normalizedBearing, emptyPayload);
    return emptyPayload;
  }

  type CandidateFrame = {
    frame: StreetViewPayload["images"][number];
    diff: number;
  };

  const candidates: CandidateFrame[] = [];

  for (const image of images) {
    const thumb =
      typeof image.thumb_2048_url === "string"
        ? image.thumb_2048_url
        : typeof image.thumb_1024_url === "string"
          ? image.thumb_1024_url
          : typeof image.thumb_512_url === "string"
            ? image.thumb_512_url
            : null;

    if (!thumb) {
      continue;
    }

    const compassAngle = typeof image.compass_angle === "number" ? image.compass_angle : null;
    const diff =
      Number.isFinite(normalizedBearing) && compassAngle != null
        ? normalizeBearingDifference(compassAngle, normalizedBearing)
        : Number.POSITIVE_INFINITY;

    candidates.push({
      frame: {
        imageUrl: thumb,
        capturedAt: typeof image.captured_at === "string" ? image.captured_at : null,
        compassAngle,
        id: typeof image.id === "string" ? image.id : null,
      },
      diff,
    });
  }

  if (candidates.length === 0) {
    const emptyPayload: StreetViewPayload = { images: [], preferredIndex: 0 };
    await setCachedStreetView(lat, lng, normalizedBearing, emptyPayload);
    return emptyPayload;
  }

  let preferredIndex = 0;
  if (Number.isFinite(normalizedBearing)) {
    let bestDiff = Number.POSITIVE_INFINITY;
    candidates.forEach(({ diff }, index) => {
      if (diff < bestDiff) {
        bestDiff = diff;
        preferredIndex = index;
      }
    });
  }

  const frames = candidates.map(({ frame }) => frame);

  const payloadToReturn: StreetViewPayload = {
    images: frames,
    preferredIndex: Math.min(Math.max(preferredIndex, 0), frames.length - 1),
  };

  await setCachedStreetView(lat, lng, normalizedBearing, payloadToReturn);

  return payloadToReturn;
};

import { NextRequest, NextResponse } from "next/server";

import { getCachedStreetView, setCachedStreetView, type StreetViewPayload } from "@/lib/streetviewCache";

const debug = (...args: unknown[]) => {
  if (process.env.NODE_ENV !== "production") {
    console.info("[streetview]", ...args);
  }
};

const MAPILLARY_GRAPH_ENDPOINT = "https://graph.mapillary.com/images";

const normalizeBearingDifference = (a: number, b: number) => {
  const diff = Math.abs(a - b) % 360;
  return diff > 180 ? 360 - diff : diff;
};

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const latParam = searchParams.get("lat");
  const lngParam = searchParams.get("lng");
  const bearingParam = searchParams.get("bearing");

  debug("Incoming request", {
    url: request.nextUrl.toString(),
    latParam,
    lngParam,
    bearingParam,
  });

  if (!latParam || !lngParam) {
    debug("Missing lat/lng parameters", { latParam, lngParam });
    return NextResponse.json({ error: "Missing lat/lng parameters." }, { status: 400 });
  }

  const accessToken = process.env.MAPILLARY_ACCESS_TOKEN;
  if (!accessToken) {
    debug("Missing MAPILLARY_ACCESS_TOKEN env variable");
    return NextResponse.json({ error: "Street imagery unavailable. No access token." }, { status: 500 });
  }

  const toNumber = (value: string) => Number.parseFloat(value);

  const lat = toNumber(latParam);
  const lng = toNumber(lngParam);
  const bearingPreference =
    bearingParam !== null && bearingParam !== undefined ? toNumber(bearingParam) % 360 : null;

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    debug("Invalid lat/lng numeric conversion", { latParam, lngParam, lat, lng });
    return NextResponse.json({ error: "Invalid lat/lng parameters." }, { status: 400 });
  }

  const normalizedBearingRaw =
    bearingPreference == null ? null : ((bearingPreference % 360) + 360) % 360;
  const normalizedBearing =
    normalizedBearingRaw == null || !Number.isFinite(normalizedBearingRaw)
      ? null
      : normalizedBearingRaw;

  if (normalizedBearing != null) {
    const cached = await getCachedStreetView(lat, lng, normalizedBearing);
    if (cached) {
      debug("Cache hit", { lat, lng, bearing: normalizedBearing, imageCount: cached.images.length });
      return NextResponse.json(cached);
    }
    debug("Cache miss", { lat, lng, bearing: normalizedBearing });
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
  mapillaryUrl.searchParams.set("fields", [
    "id",
    "thumb_2048_url",
    "thumb_1024_url",
    "thumb_512_url",
    "captured_at",
    "compass_angle",
  ].join(","));

  const logUrl = new URL(mapillaryUrl);
  logUrl.searchParams.set("access_token", "***");

  debug("Requesting Mapillary imagery", {
    url: logUrl.toString(),
    lat,
    lng,
    bearing: normalizedBearing,
    bbox: { minLat, minLng, maxLat, maxLng },
  });

  let response: Response;
  try {
    response = await fetch(mapillaryUrl, {
      headers: {
        Accept: "application/json",
      },
      cache: "no-store",
    });
  } catch (error) {
    debug("Mapillary fetch error", { lat, lng, error });
    return NextResponse.json(
      { error: "Failed to reach street imagery service." },
      { status: 502 }
    );
  }

  if (!response.ok) {
    debug("Mapillary non-ok response", {
      lat,
      lng,
      status: response.status,
      statusText: response.statusText,
    });
    return NextResponse.json(
      { error: "Street imagery request failed." },
      { status: 502 }
    );
  }

  const payload = (await response.json()) as { data?: Array<Record<string, unknown>> };
  const images = payload.data ?? [];

  if (images.length === 0) {
    debug("Mapillary returned no images", { lat, lng });
    const emptyPayload: StreetViewPayload = { images: [], preferredIndex: 0 };
    if (normalizedBearing != null) {
      await setCachedStreetView(lat, lng, normalizedBearing, emptyPayload);
    }
    return NextResponse.json(emptyPayload);
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
      normalizedBearing != null && compassAngle != null
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
    debug("Mapillary returned no usable images", { lat, lng });
    const emptyPayload: StreetViewPayload = { images: [], preferredIndex: 0 };
    if (normalizedBearing != null) {
      await setCachedStreetView(lat, lng, normalizedBearing, emptyPayload);
    }
    return NextResponse.json(emptyPayload);
  }

  let preferredIndex = 0;
  if (normalizedBearing != null) {
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

  if (normalizedBearing != null) {
    await setCachedStreetView(lat, lng, normalizedBearing, payloadToReturn);
  }

  debug("Returning payload", {
    lat,
    lng,
    bearing: normalizedBearing,
    imageCount: frames.length,
    preferredIndex: payloadToReturn.preferredIndex,
  });

  return NextResponse.json(payloadToReturn);
}

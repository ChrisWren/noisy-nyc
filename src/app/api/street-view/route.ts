import { NextResponse, type NextRequest } from "next/server";

const MAPILLARY_GRAPH_ENDPOINT = "https://graph.mapillary.com/images";
const DEFAULT_LIMIT = 12;
const BBOX_HALF_WIDTH_METERS = 110;
const METERS_PER_DEGREE_LAT = 111_320;

const computeBoundingBox = (lat: number, lng: number) => {
  const cosLat = Math.abs(Math.cos((lat * Math.PI) / 180));
  const metersPerDegreeLng = METERS_PER_DEGREE_LAT * Math.max(cosLat, 0.000001);
  const deltaLat = BBOX_HALF_WIDTH_METERS / METERS_PER_DEGREE_LAT;
  const deltaLng = BBOX_HALF_WIDTH_METERS / metersPerDegreeLng;

  return {
    minLat: lat - deltaLat,
    maxLat: lat + deltaLat,
    minLng: lng - deltaLng,
    maxLng: lng + deltaLng,
  };
};

const parseNumericParam = (value: string | null) => {
  if (!value) {
    return null;
  }
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : null;
};

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;

  const lat = parseNumericParam(searchParams.get("lat"));
  const lng = parseNumericParam(searchParams.get("lng"));
  if (lat == null || lng == null) {
    return NextResponse.json({ error: "Missing or invalid lat/lng parameters." }, { status: 400 });
  }

  const limitParam = searchParams.get("limit");
  const limit = parseNumericParam(limitParam);
  const mapillaryLimit = limit && limit > 0 && limit < 50 ? Math.floor(limit).toString() : DEFAULT_LIMIT.toString();

  const fieldsParam = searchParams.get("fields");
  const fields = fieldsParam
    ? fieldsParam
    : ["id", "thumb_2048_url", "thumb_1024_url", "thumb_512_url", "captured_at", "compass_angle"].join(",");

  const accessToken = process.env.MAPILLARY_ACCESS_TOKEN;
  if (!accessToken) {
    return NextResponse.json({ error: "Street imagery unavailable. Missing server access token." }, { status: 500 });
  }

  const { minLat, maxLat, minLng, maxLng } = computeBoundingBox(lat, lng);

  const mapillaryUrl = new URL(MAPILLARY_GRAPH_ENDPOINT);
  mapillaryUrl.searchParams.set("access_token", accessToken);
  mapillaryUrl.searchParams.set("limit", mapillaryLimit);
  mapillaryUrl.searchParams.set("bbox", `${minLng},${minLat},${maxLng},${maxLat}`);
  mapillaryUrl.searchParams.set("fields", fields);

  let response: Response;
  try {
    response = await fetch(mapillaryUrl.toString(), {
      headers: {
        Accept: "application/json",
      },
      cache: "no-store",
      next: { revalidate: 0 },
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: "Failed to reach street imagery service.",
        details: error instanceof Error ? error.message : undefined,
      },
      { status: 502 }
    );
  }

  if (!response.ok) {
    let details: unknown;
    try {
      details = await response.json();
    } catch {
      details = await response.text();
    }
    return NextResponse.json(
      {
        error: "Street imagery request failed.",
        upstreamStatus: response.status,
        details,
      },
      { status: 502 }
    );
  }

  const payload = await response.json();
  return NextResponse.json(payload, { status: 200 });
}

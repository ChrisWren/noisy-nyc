"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { KeyboardEvent as ReactKeyboardEvent } from "react";

import type { StreetViewFrame, StreetViewPayload } from "@/lib/streetviewCache";

import { MapContainer, TileLayer, CircleMarker } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import L from "leaflet";


type GridPosition = {
  street: number;
  avenue: number;
};

type Heading = "north" | "east" | "south" | "west";

type IntersectionLabel = {
  street: string;
  avenue: string;
};

type LatLng = [number, number];

const headingOrder: Heading[] = ["north", "east", "south", "west"];
const headingVectors: Record<Heading, GridPosition> = {
  north: { street: 1, avenue: 0 },
  south: { street: -1, avenue: 0 },
  east: { street: 0, avenue: 1 },
  west: { street: 0, avenue: -1 },
};
const oppositeHeading: Record<Heading, Heading> = {
  north: "south",
  south: "north",
  east: "west",
  west: "east",
};

const GRID_BOUNDS = {
  minStreet: -25,
  maxStreet: 55,
  minAvenue: -6,
  maxAvenue: 6,
};

const ORIGIN_STREET_NUMBER = 45;
const ORIGIN_AVENUE_NUMBER = 7;

const AVENUE_LABELS: Record<number, string> = {
  1: "1st Ave",
  2: "2nd Ave",
  3: "3rd Ave",
  4: "Lexington Ave",
  5: "Madison Ave",
  6: "6th Ave",
  7: "7th Ave",
  8: "8th Ave",
  9: "9th Ave",
  10: "10th Ave",
  11: "11th Ave",
  12: "12th Ave",
};

const rotateHeading = (heading: Heading, turn: "left" | "right"): Heading => {
  const index = headingOrder.indexOf(heading);
  const offset = turn === "right" ? 1 : -1;
  const nextIndex = (index + offset + headingOrder.length) % headingOrder.length;
  return headingOrder[nextIndex]!;
};

const EARTH_RADIUS_METERS = 6_378_137;

const moveByMeters = ([lat, lng]: LatLng, distanceInMeters: number, bearingDeg: number): LatLng => {
  if (distanceInMeters === 0) {
    return [lat, lng];
  }

  const angularDistance = distanceInMeters / EARTH_RADIUS_METERS;
  const bearing = (bearingDeg * Math.PI) / 180;
  const latRad = (lat * Math.PI) / 180;
  const lngRad = (lng * Math.PI) / 180;

  const newLatRad = Math.asin(
    Math.sin(latRad) * Math.cos(angularDistance) +
      Math.cos(latRad) * Math.sin(angularDistance) * Math.cos(bearing)
  );

  const newLngRad =
    lngRad +
    Math.atan2(
      Math.sin(bearing) * Math.sin(angularDistance) * Math.cos(latRad),
      Math.cos(angularDistance) - Math.sin(latRad) * Math.sin(newLatRad)
    );

  const newLat = (newLatRad * 180) / Math.PI;
  const newLng = (newLngRad * 180) / Math.PI;

  return [newLat, newLng];
};

const toRadians = (degrees: number) => (degrees * Math.PI) / 180;

const distanceBetween = (a: LatLng, b: LatLng) => {
  const earthRadius = EARTH_RADIUS_METERS;
  const dLat = toRadians(b[0] - a[0]);
  const dLng = toRadians(b[1] - a[1]);
  const lat1 = toRadians(a[0]);
  const lat2 = toRadians(b[0]);

  const sinLat = Math.sin(dLat / 2);
  const sinLng = Math.sin(dLng / 2);
  const aa = sinLat * sinLat + Math.cos(lat1) * Math.cos(lat2) * sinLng * sinLng;
  const c = 2 * Math.atan2(Math.sqrt(aa), Math.sqrt(1 - aa));
  return earthRadius * c;
};

const INITIAL_LAT_LNG: LatLng = [40.758, -73.9855];
const STREET_BLOCK_METERS = 80;
const AVENUE_BLOCK_METERS = 274;

const headingBearings: Record<Heading, number> = {
  north: 0,
  east: 90,
  south: 180,
  west: 270,
};

const computeLatLngFromGrid = ({ street, avenue }: GridPosition): LatLng => {
  let position: LatLng = INITIAL_LAT_LNG;

  if (street !== 0) {
    position = moveByMeters(position, Math.abs(street) * STREET_BLOCK_METERS, street > 0 ? 0 : 180);
  }

  if (avenue !== 0) {
    position = moveByMeters(position, Math.abs(avenue) * AVENUE_BLOCK_METERS, avenue > 0 ? 90 : 270);
  }

  return position;
};

const ordinalSuffix = (value: number) => {
  const absValue = Math.abs(value);
  const lastDigit = absValue % 10;
  const lastTwoDigits = absValue % 100;

  if (lastTwoDigits >= 11 && lastTwoDigits <= 13) {
    return `${value}th`;
  }

  if (lastDigit === 1) {
    return `${value}st`;
  }
  if (lastDigit === 2) {
    return `${value}nd`;
  }
  if (lastDigit === 3) {
    return `${value}rd`;
  }

  return `${value}th`;
};

const computeGridFromLatLng = ([lat, lng]: LatLng): GridPosition | null => {
  const latDistance = distanceBetween([lat, INITIAL_LAT_LNG[1]], [INITIAL_LAT_LNG[0], INITIAL_LAT_LNG[1]]);
  const lngDistance = distanceBetween([INITIAL_LAT_LNG[0], lng], [INITIAL_LAT_LNG[0], INITIAL_LAT_LNG[1]]);

  const streetBlocks = Math.round(latDistance / STREET_BLOCK_METERS) * (lat >= INITIAL_LAT_LNG[0] ? 1 : -1);
  const avenueBlocks = Math.round(lngDistance / AVENUE_BLOCK_METERS) * (lng >= INITIAL_LAT_LNG[1] ? 1 : -1);

  if (
    streetBlocks < GRID_BOUNDS.minStreet ||
    streetBlocks > GRID_BOUNDS.maxStreet ||
    avenueBlocks < GRID_BOUNDS.minAvenue ||
    avenueBlocks > GRID_BOUNDS.maxAvenue
  ) {
    return null;
  }

  return { street: streetBlocks, avenue: avenueBlocks };
};

const formatStreetLabel = (position: GridPosition): string => {
  const streetNumber = ORIGIN_STREET_NUMBER + position.street;
  const avenueNumber = ORIGIN_AVENUE_NUMBER + position.avenue;
  const eastWestPrefix = avenueNumber >= 5 ? "W" : "E";
  return `${eastWestPrefix} ${ordinalSuffix(streetNumber)} St`;
};

const formatAvenueLabel = (position: GridPosition): string => {
  const avenueNumber = ORIGIN_AVENUE_NUMBER + position.avenue;
  if (AVENUE_LABELS[avenueNumber]) {
    return AVENUE_LABELS[avenueNumber]!;
  }
  return `${ordinalSuffix(avenueNumber)} Ave`;
};

const describeIntersection = (position: GridPosition): IntersectionLabel => ({
  street: formatStreetLabel(position),
  avenue: formatAvenueLabel(position),
});

const clampToBounds = (candidate: GridPosition): GridPosition => ({
  street: Math.min(Math.max(candidate.street, GRID_BOUNDS.minStreet), GRID_BOUNDS.maxStreet),
  avenue: Math.min(Math.max(candidate.avenue, GRID_BOUNDS.minAvenue), GRID_BOUNDS.maxAvenue),
});

const isWithinBounds = (candidate: GridPosition) => {
  return (
    candidate.street >= GRID_BOUNDS.minStreet &&
    candidate.street <= GRID_BOUNDS.maxStreet &&
    candidate.avenue >= GRID_BOUNDS.minAvenue &&
    candidate.avenue <= GRID_BOUNDS.maxAvenue
  );
};

const headingDescriptions: Record<Heading, string> = {
  north: "north uptown",
  south: "south downtown",
  east: "east toward the river",
  west: "west toward the river",
};

const headingShort: Record<Heading, string> = {
  north: "North",
  south: "South",
  east: "East",
  west: "West",
};

type MoveAvailability = {
  forward: boolean;
  backward: boolean;
  left: boolean;
  right: boolean;
};

export default function ComplaintMap() {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const minimapRef = useRef<L.Map | null>(null);
  const [position, setPosition] = useState<GridPosition>(() => {
    const seedBuffer = typeof window !== "undefined" && window.crypto?.getRandomValues
      ? window.crypto.getRandomValues(new Uint32Array(2))
      : null;
    const randomStreet = seedBuffer ? seedBuffer[0] / 0xffffffff : Math.random();
    const randomAvenue = seedBuffer ? seedBuffer[1] / 0xffffffff : Math.random();
    const initialStreet = Math.floor(randomStreet * (GRID_BOUNDS.maxStreet - GRID_BOUNDS.minStreet + 1)) + GRID_BOUNDS.minStreet;
    const initialAvenue = Math.floor(randomAvenue * (GRID_BOUNDS.maxAvenue - GRID_BOUNDS.minAvenue + 1)) + GRID_BOUNDS.minAvenue;
    return { street: initialStreet, avenue: initialAvenue };
  });
  const [heading, setHeading] = useState<Heading>("north");
  const [statusLine, setStatusLine] = useState<string>("You’re posted up in Times Square. Arrow keys to explore.");
  const [streetFrames, setStreetFrames] = useState<StreetViewFrame[]>([]);
  const [currentFrameIndex, setCurrentFrameIndex] = useState(0);
  const [previousFrame, setPreviousFrame] = useState<StreetViewFrame | null>(null);
  const [streetImageError, setStreetImageError] = useState<string | null>(null);
  const [isStreetImageLoading, setIsStreetImageLoading] = useState(false);
  const previousFrameRef = useRef<StreetViewFrame | null>(null);
  const fadeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const rawIntersectionLatLng = useMemo(() => computeLatLngFromGrid(position), [position]);

  const { displayGrid, intersectionLatLng } = useMemo(() => {
    const snappedGrid = computeGridFromLatLng(rawIntersectionLatLng);
    if (!snappedGrid) {
      return { displayGrid: position, intersectionLatLng: rawIntersectionLatLng };
    }
    return { displayGrid: snappedGrid, intersectionLatLng: computeLatLngFromGrid(snappedGrid) };
  }, [position, rawIntersectionLatLng]);

  const currentIntersection = useMemo(() => describeIntersection(displayGrid), [displayGrid]);

  const canMove = useCallback((from: GridPosition, direction: Heading) => {
    const vector = headingVectors[direction];
    const candidate: GridPosition = {
      street: from.street + vector.street,
      avenue: from.avenue + vector.avenue,
    };
    return isWithinBounds(candidate);
  }, []);

  const { leftHeading, rightHeading } = useMemo(() => {
    const nextLeft = rotateHeading(heading, "left");
    const nextRight = rotateHeading(heading, "right");
    return { leftHeading: nextLeft, rightHeading: nextRight };
  }, [heading]);

  const availableMoves = useMemo<MoveAvailability>(() => {
    const forward = canMove(position, heading);
    const backward = canMove(position, oppositeHeading[heading]);
    const left = canMove(position, leftHeading);
    const right = canMove(position, rightHeading);
    return { forward, backward, left, right };
  }, [canMove, heading, leftHeading, position, rightHeading]);

  const { forward, backward, left, right } = availableMoves;

  const nextIntersection = useMemo(() => {
    const vector = headingVectors[heading];
    const nextPosition: GridPosition = {
      street: position.street + vector.street,
      avenue: position.avenue + vector.avenue,
    };
    return describeIntersection(clampToBounds(nextPosition));
  }, [heading, position]);

  const moveOneBlock = useCallback(
    (movementHeading: Heading) => {
      setPosition((prev) => {
        const vector = headingVectors[movementHeading];
        const candidate: GridPosition = {
          street: prev.street + vector.street,
          avenue: prev.avenue + vector.avenue,
        };

        if (!isWithinBounds(candidate)) {
          return prev;
        }

        const nextIntersectionLabel = describeIntersection(candidate);
        setStatusLine(
          `Rolling ${headingDescriptions[movementHeading]} toward ${nextIntersectionLabel.street} and ${nextIntersectionLabel.avenue}.`
        );

        return candidate;
      });
    },
    []
  );

  const handleMoveForward = useCallback(() => {
    if (!forward) {
      setStatusLine(`Can't head toward ${headingShort[heading]} — that block is closed off.`);
      return;
    }
    moveOneBlock(heading);
  }, [forward, heading, moveOneBlock]);

  const handleMoveBackward = useCallback(() => {
    const reverseHeading = oppositeHeading[heading];
    if (!backward) {
      setStatusLine(`Can't back toward ${headingShort[reverseHeading]} — construction behind you.`);
      return;
    }
    moveOneBlock(reverseHeading);
  }, [backward, heading, moveOneBlock]);

  const handleTurn = useCallback(
    (direction: "left" | "right") => {
      const nextHeading = direction === "left" ? leftHeading : rightHeading;

      setHeading(nextHeading);

      if (!canMove(position, nextHeading)) {
        setStatusLine(`Facing ${headingShort[nextHeading]} — that block is closed off. Try another way or head back.`);
        return;
      }

      moveOneBlock(nextHeading);
    },
    [canMove, leftHeading, moveOneBlock, position, rightHeading]
  );

  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      if (event.key === "ArrowUp" || event.key === "w" || event.key === "W") {
        event.preventDefault();
        handleMoveForward();
      } else if (event.key === "ArrowDown" || event.key === "s" || event.key === "S") {
        event.preventDefault();
        handleMoveBackward();
      } else if (event.key === "ArrowLeft" || event.key === "a" || event.key === "A") {
        event.preventDefault();
        handleTurn("left");
      } else if (event.key === "ArrowRight" || event.key === "d" || event.key === "D") {
        event.preventDefault();
        handleTurn("right");
      }
    },
    [handleMoveBackward, handleMoveForward, handleTurn]
  );

  useEffect(() => {
    containerRef.current?.focus();
  }, []);

  useEffect(() => {
    const mapInstance = minimapRef.current;
    if (!mapInstance) {
      return;
    }

    const [lat, lng] = intersectionLatLng;
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      return;
    }

    const currentZoom = mapInstance.getZoom();
    const nextZoom = Number.isFinite(currentZoom)
      ? currentZoom
      : mapInstance.options.zoom ?? mapInstance.getMinZoom() ?? 15;

    mapInstance.setView([lat, lng], nextZoom, { animate: true });
  }, [intersectionLatLng]);

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();

    const [lat, lng] = intersectionLatLng;
    const params = new URLSearchParams({
      lat: lat.toString(),
      lng: lng.toString(),
      bearing: headingBearings[heading].toString(),
    });

    setIsStreetImageLoading(true);
    setStreetImageError(null);
    setStreetFrames([]);
    setCurrentFrameIndex(0);
    setPreviousFrame(null);
    previousFrameRef.current = null;
    if (fadeTimerRef.current) {
      clearTimeout(fadeTimerRef.current);
      fadeTimerRef.current = null;
    }

    fetch(`/api/streetview?${params.toString()}`, { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error("Street view request failed");
        }
        return (await response.json()) as StreetViewPayload;
      })
      .then((data) => {
        if (cancelled) {
          return;
        }
        const frames = Array.isArray(data.images) ? data.images : [];
        setStreetFrames(frames);
        if (frames.length > 0) {
          const nextIndex = Number.isFinite(data.preferredIndex)
            ? Math.min(Math.max(data.preferredIndex, 0), frames.length - 1)
            : 0;
          setCurrentFrameIndex(nextIndex);
        } else {
          setCurrentFrameIndex(0);
        }
      })
      .catch((error: unknown) => {
        if (cancelled || (error instanceof DOMException && error.name === "AbortError")) {
          return;
        }
        setStreetImageError("Mapillary imagery unavailable right now.");
        setStreetFrames([]);
        setCurrentFrameIndex(0);
      })
      .finally(() => {
        if (!cancelled) {
          setIsStreetImageLoading(false);
        }
      });

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [heading, intersectionLatLng]);

  useEffect(() => {
    const activeFrame = streetFrames[currentFrameIndex] ?? null;
    const lastFrame = previousFrameRef.current;

    if (!activeFrame) {
      setPreviousFrame(null);
      previousFrameRef.current = null;
      if (fadeTimerRef.current) {
        clearTimeout(fadeTimerRef.current);
        fadeTimerRef.current = null;
      }
      return;
    }

    if (!lastFrame || lastFrame.imageUrl === activeFrame.imageUrl) {
      previousFrameRef.current = activeFrame;
      return;
    }

    setPreviousFrame(lastFrame);
    if (fadeTimerRef.current) {
      clearTimeout(fadeTimerRef.current);
    }
    fadeTimerRef.current = setTimeout(() => {
      setPreviousFrame(null);
      fadeTimerRef.current = null;
    }, 900);

    previousFrameRef.current = activeFrame;
  }, [currentFrameIndex, streetFrames]);

  useEffect(() => {
    if (streetFrames.length <= 1) {
      return;
    }

    const interval = window.setInterval(() => {
      setCurrentFrameIndex((index) => (index + 1) % streetFrames.length);
    }, 4500);

    return () => window.clearInterval(interval);
  }, [streetFrames.length]);

  useEffect(() => {
    return () => {
      if (fadeTimerRef.current) {
        clearTimeout(fadeTimerRef.current);
        fadeTimerRef.current = null;
      }
    };
  }, []);

  const handleReactKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLDivElement>) => {
      handleKeyDown(event.nativeEvent);
    },
    [handleKeyDown]
  );

  const currentFrame = streetFrames[currentFrameIndex] ?? null;
  const streetImageUrl = currentFrame?.imageUrl ?? null;
  const streetImageCapturedAt = currentFrame?.capturedAt ?? null;
  const totalFrames = streetFrames.length;

  return (
    <div
      ref={containerRef}
      className="street-game"
      tabIndex={0}
      onKeyDown={handleReactKeyDown}
      onClick={() => containerRef.current?.focus()}
    >
      <div className={`street-scene ${streetImageUrl ? "street-scene--photo" : ""}`} aria-hidden="true">
        {previousFrame ? (
          <div
            key={`prev-${previousFrame.id ?? previousFrame.imageUrl}`}
            className="street-scene__image street-scene__image--fade-out"
            style={{ backgroundImage: `url(${previousFrame.imageUrl})` }}
          >
            <div className="street-scene__image-mask" />
          </div>
        ) : null}
        <div
          key={currentFrame ? currentFrame.id ?? currentFrame.imageUrl : "no-image"}
          className={`street-scene__image ${streetImageUrl ? "street-scene__image--visible" : ""}`}
          style={streetImageUrl ? { backgroundImage: `url(${streetImageUrl})` } : undefined}
        >
          <div className="street-scene__image-mask" />
        </div>
        <div className="street-skyline">
          <div className="street-building street-building--left" />
          <div className="street-building street-building--center" />
          <div className="street-building street-building--right" />
        </div>
        <div className="street-road">
          <div className="street-sidewalk street-sidewalk--left" />
          <div className="street-road-surface">
            <div className="street-road-lines" />
          </div>
          <div className="street-sidewalk street-sidewalk--right" />
        </div>
      </div>

      <div className="street-sign" role="presentation">
        <div className="street-sign-post">
          <div className="street-sign-panels">
            <div className="street-sign-panel street-sign-panel--primary">{currentIntersection.street}</div>
            <div className="street-sign-panel street-sign-panel--secondary street-sign-panel--perpendicular">{currentIntersection.avenue}</div>
          </div>
        </div>
      </div>

      <div className="street-hud">
        <div className="street-hud-heading">Facing {headingShort[heading]}</div>
        <div className="street-hud-next">
          Next intersection: {nextIntersection.street} &amp; {nextIntersection.avenue}
        </div>
        <div className="street-hud-moves" role="status" aria-live="polite">
          <span className={`street-move ${forward ? "street-move--open" : "street-move--blocked"}`}>
            ↑ Forward
          </span>
          <span className={`street-move ${left ? "street-move--open" : "street-move--blocked"}`}>
            ← Left
          </span>
          <span className={`street-move ${right ? "street-move--open" : "street-move--blocked"}`}>
            → Right
          </span>
          <span className={`street-move ${backward ? "street-move--open" : "street-move--blocked"}`}>
            ↓ Back
          </span>
        </div>
        <div className="street-hud-status">{statusLine}</div>
        <div className="street-hud-imagery">
          {isStreetImageLoading
            ? "Loading street view..."
            : streetImageError
              ? streetImageError
              : streetImageUrl
                ? `Image ${currentFrameIndex + 1}/${totalFrames} courtesy of Mapillary${streetImageCapturedAt ? ` · Captured ${new Date(streetImageCapturedAt).toLocaleDateString()}` : ""}`
                : "No street imagery at this corner yet."}
        </div>
        <div className="street-hud-help">Use arrow keys or WASD to move, click to refocus.</div>
      </div>
      <div className="street-mini-map">
        <MapContainer
          center={intersectionLatLng}
          zoom={15}
          zoomControl={false}
          dragging={false}
          doubleClickZoom={false}
          scrollWheelZoom={false}
          touchZoom={false}
          boxZoom={false}
          attributionControl={false}
          keyboard={false}
          style={{ height: "100%", width: "100%" }}
          whenCreated={(mapInstance) => {
            minimapRef.current = mapInstance;
          }}
        >
          <TileLayer url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png" />
          <CircleMarker
            center={intersectionLatLng}
            radius={6}
            pathOptions={{ color: "#f8d74c", fillColor: "#f8d74c", fillOpacity: 0.9, opacity: 0.9 }}
          />
        </MapContainer>
      </div>
      <div className="street-attribution">© Mapillary</div>
    </div>
  );
}

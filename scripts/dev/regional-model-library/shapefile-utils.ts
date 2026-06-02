import { readFileSync } from "node:fs";
import * as XLSX from "xlsx";

export type SourceRow = Record<string, unknown>;

export type GeometryCoordinate = {
  longitude: number | null;
  latitude: number | null;
  geometryType: string;
  coordinateSource: "point" | "bbox-center" | "none";
};

export type BoundingBox = {
  xMin: number;
  yMin: number;
  xMax: number;
  yMax: number;
};

export type PolygonPoint = {
  longitude: number;
  latitude: number;
};

export type PolygonGeometry = {
  geometryType: string;
  bbox: BoundingBox;
  rings: PolygonPoint[][];
};

const POINT_TYPES = new Set([1, 11, 21]);
const POLYGON_TYPES = new Set([5, 15, 25]);
const BBOX_TYPES = new Set([3, 5, 8, 13, 15, 18, 23, 25, 28, 31]);
const EPSILON = 1e-9;

export function readDbfRows(dbfPath: string): {
  sheetName: string;
  rows: SourceRow[];
} {
  const workbook = XLSX.readFile(dbfPath, {
    cellDates: false,
    dense: false
  });
  const sheetName = workbook.SheetNames[0] ?? "Sheet1";
  const worksheet = workbook.Sheets[sheetName];
  if (!worksheet) {
    return {
      sheetName,
      rows: []
    };
  }

  return {
    sheetName,
    rows: XLSX.utils.sheet_to_json<SourceRow>(worksheet, {
      defval: "",
      raw: false
    })
  };
}

export function getString(value: unknown): string {
  if (value === null || value === undefined) {
    return "";
  }

  return String(value).trim();
}

export function getNumber(value: unknown): number | null {
  const normalized = getString(value);
  if (normalized.length === 0) {
    return null;
  }

  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

export function shapeTypeName(shapeType: number): string {
  switch (shapeType) {
    case 0:
      return "NullShape";
    case 1:
      return "Point";
    case 3:
      return "PolyLine";
    case 5:
      return "Polygon";
    case 8:
      return "MultiPoint";
    case 11:
      return "PointZ";
    case 13:
      return "PolyLineZ";
    case 15:
      return "PolygonZ";
    case 18:
      return "MultiPointZ";
    case 21:
      return "PointM";
    case 23:
      return "PolyLineM";
    case 25:
      return "PolygonM";
    case 28:
      return "MultiPointM";
    case 31:
      return "MultiPatch";
    default:
      return `ShapeType-${String(shapeType)}`;
  }
}

export function parseShapefileCoordinates(shpPath: string): GeometryCoordinate[] {
  const buffer = readFileSync(shpPath);
  const coordinates: GeometryCoordinate[] = [];
  let offset = 100;

  while (offset + 8 <= buffer.length) {
    const contentLengthBytes = buffer.readInt32BE(offset + 4) * 2;
    const contentOffset = offset + 8;
    const recordEnd = contentOffset + contentLengthBytes;

    if (recordEnd > buffer.length || contentLengthBytes < 4) {
      break;
    }

    const shapeType = buffer.readInt32LE(contentOffset);
    const geometryType = shapeTypeName(shapeType);

    if (POINT_TYPES.has(shapeType) && recordEnd >= contentOffset + 20) {
      coordinates.push({
        longitude: buffer.readDoubleLE(contentOffset + 4),
        latitude: buffer.readDoubleLE(contentOffset + 12),
        geometryType,
        coordinateSource: "point"
      });
    } else if (BBOX_TYPES.has(shapeType) && recordEnd >= contentOffset + 36) {
      const xMin = buffer.readDoubleLE(contentOffset + 4);
      const yMin = buffer.readDoubleLE(contentOffset + 12);
      const xMax = buffer.readDoubleLE(contentOffset + 20);
      const yMax = buffer.readDoubleLE(contentOffset + 28);
      coordinates.push({
        longitude: (xMin + xMax) / 2,
        latitude: (yMin + yMax) / 2,
        geometryType,
        coordinateSource: "bbox-center"
      });
    } else {
      coordinates.push({
        longitude: null,
        latitude: null,
        geometryType,
        coordinateSource: "none"
      });
    }

    offset = recordEnd;
  }

  return coordinates;
}

export function parsePolygonGeometries(shpPath: string): PolygonGeometry[] {
  const buffer = readFileSync(shpPath);
  const polygons: PolygonGeometry[] = [];
  let offset = 100;

  while (offset + 8 <= buffer.length) {
    const contentLengthBytes = buffer.readInt32BE(offset + 4) * 2;
    const contentOffset = offset + 8;
    const recordEnd = contentOffset + contentLengthBytes;

    if (recordEnd > buffer.length || contentLengthBytes < 4) {
      break;
    }

    const shapeType = buffer.readInt32LE(contentOffset);
    if (!POLYGON_TYPES.has(shapeType) || recordEnd < contentOffset + 44) {
      offset = recordEnd;
      continue;
    }

    const bbox: BoundingBox = {
      xMin: buffer.readDoubleLE(contentOffset + 4),
      yMin: buffer.readDoubleLE(contentOffset + 12),
      xMax: buffer.readDoubleLE(contentOffset + 20),
      yMax: buffer.readDoubleLE(contentOffset + 28)
    };
    const numParts = buffer.readInt32LE(contentOffset + 36);
    const numPoints = buffer.readInt32LE(contentOffset + 40);
    const partsOffset = contentOffset + 44;
    const pointsOffset = partsOffset + numParts * 4;

    if (numParts <= 0 || numPoints <= 0 || pointsOffset + numPoints * 16 > recordEnd) {
      polygons.push({
        geometryType: shapeTypeName(shapeType),
        bbox,
        rings: []
      });
      offset = recordEnd;
      continue;
    }

    const parts: number[] = [];
    for (let index = 0; index < numParts; index += 1) {
      parts.push(buffer.readInt32LE(partsOffset + index * 4));
    }

    const points: PolygonPoint[] = [];
    for (let index = 0; index < numPoints; index += 1) {
      const pointOffset = pointsOffset + index * 16;
      points.push({
        longitude: buffer.readDoubleLE(pointOffset),
        latitude: buffer.readDoubleLE(pointOffset + 8)
      });
    }

    const rings: PolygonPoint[][] = [];
    for (let index = 0; index < parts.length; index += 1) {
      const start = parts[index] ?? 0;
      const end = parts[index + 1] ?? points.length;
      if (start < 0 || end > points.length || start >= end) {
        continue;
      }
      rings.push(points.slice(start, end));
    }

    polygons.push({
      geometryType: shapeTypeName(shapeType),
      bbox,
      rings
    });
    offset = recordEnd;
  }

  return polygons;
}

function pointOnSegment(point: PolygonPoint, start: PolygonPoint, end: PolygonPoint): boolean {
  const cross =
    (point.latitude - start.latitude) * (end.longitude - start.longitude) -
    (point.longitude - start.longitude) * (end.latitude - start.latitude);
  if (Math.abs(cross) > EPSILON) {
    return false;
  }

  const dot =
    (point.longitude - start.longitude) * (end.longitude - start.longitude) +
    (point.latitude - start.latitude) * (end.latitude - start.latitude);
  if (dot < -EPSILON) {
    return false;
  }

  const squaredLength =
    (end.longitude - start.longitude) ** 2 + (end.latitude - start.latitude) ** 2;
  return dot <= squaredLength + EPSILON;
}

function pointInRing(point: PolygonPoint, ring: readonly PolygonPoint[]): boolean {
  if (ring.length < 3) {
    return false;
  }

  let inside = false;
  for (let index = 0, previous = ring.length - 1; index < ring.length; previous = index, index += 1) {
    const current = ring[index]!;
    const prior = ring[previous]!;

    if (pointOnSegment(point, prior, current)) {
      return true;
    }

    const intersects =
      (current.latitude > point.latitude) !== (prior.latitude > point.latitude) &&
      point.longitude <
        ((prior.longitude - current.longitude) * (point.latitude - current.latitude)) /
          (prior.latitude - current.latitude + 0) +
          current.longitude;

    if (intersects) {
      inside = !inside;
    }
  }

  return inside;
}

export function pointInPolygon(point: PolygonPoint, polygon: PolygonGeometry): boolean {
  if (
    point.longitude < polygon.bbox.xMin - EPSILON ||
    point.longitude > polygon.bbox.xMax + EPSILON ||
    point.latitude < polygon.bbox.yMin - EPSILON ||
    point.latitude > polygon.bbox.yMax + EPSILON
  ) {
    return false;
  }

  let inside = false;
  for (const ring of polygon.rings) {
    if (pointInRing(point, ring)) {
      inside = !inside;
    }
  }

  return inside;
}

export function computePolygonCentroid(polygon: PolygonGeometry): {
  longitude: number | null;
  latitude: number | null;
  coordinateSource: "polygon-centroid" | "bbox-center" | "none";
} {
  let crossSum = 0;
  let centroidX = 0;
  let centroidY = 0;

  for (const ring of polygon.rings) {
    if (ring.length < 3) {
      continue;
    }

    for (let index = 0; index < ring.length; index += 1) {
      const current = ring[index]!;
      const next = ring[(index + 1) % ring.length]!;
      const cross = current.longitude * next.latitude - next.longitude * current.latitude;
      crossSum += cross;
      centroidX += (current.longitude + next.longitude) * cross;
      centroidY += (current.latitude + next.latitude) * cross;
    }
  }

  if (Math.abs(crossSum) > EPSILON) {
    return {
      longitude: centroidX / (3 * crossSum),
      latitude: centroidY / (3 * crossSum),
      coordinateSource: "polygon-centroid"
    };
  }

  if (
    Number.isFinite(polygon.bbox.xMin) &&
    Number.isFinite(polygon.bbox.xMax) &&
    Number.isFinite(polygon.bbox.yMin) &&
    Number.isFinite(polygon.bbox.yMax)
  ) {
    return {
      longitude: (polygon.bbox.xMin + polygon.bbox.xMax) / 2,
      latitude: (polygon.bbox.yMin + polygon.bbox.yMax) / 2,
      coordinateSource: "bbox-center"
    };
  }

  return {
    longitude: null,
    latitude: null,
    coordinateSource: "none"
  };
}

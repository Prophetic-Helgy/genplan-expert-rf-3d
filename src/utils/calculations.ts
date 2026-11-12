import {
  PlotConfig,
  Point2D,
  SiteObject,
  NormViolation,
  RoofGeometryMetrics,
  SnowLoadResult,
  FoundationCheckResult,
  MaterialWallRecommendation,
  BOMSummary,
  BOMItem,
  FireResistanceMaterial,
  BoundaryEdgeType,
  BuildingCategory,
  BuildingWindowsConfig,
  BuildingDoorsConfig,
  InteriorSunPatch,
  RegionInfo,
  SlopeDirection,
  HeatingTariffsConfig,
  EnergyEfficiencyClass,
  EnergyAndHeatingResult,
  ParameterRecommendation,
  AdjacentParcelConfig,
  BuildingInteriorAreaResult,
  FacadeInsolationMetric,
  BuildingInsolationAnalysis,
  FacadeThermalMetric,
  BuildingThermalHeatmapAnalysis,
  WindowConstructionTypeId,
  RoofInsulationTypeId,
  WallInsulationTypeId,
  MaterialUnitPrices,
  PlotReliefConfig,
  PlotDrainageZone,
  PlotReliefAnalysis,
  ObjectCategoryCapabilities
} from '../types';
import {
  REGIONS_RF,
  SOILS_DB,
  FOUNDATION_NAMES,
  WALL_MATERIALS_INFO,
  WINDOW_TYPES_INFO,
  ROOF_INSULATION_INFO,
  WALL_INSULATION_INFO
} from '../data/regions';

/**
 * Rounds a number in meters to 1 millimeter (0.001 m) precision.
 */
export function roundToMm(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.round(value * 1000) / 1000;
}

/**
 * Formats a metric value preserving up to 3 decimal places (1 mm precision) without trailing zeros.
 */
export function formatMetersMm(value: number): string {
  if (!Number.isFinite(value)) return '0';
  return String(roundToMm(value));
}

/**
 * Parses a decimal string into a number regardless of whether the user typed a dot ('.'),
 * a comma (','), or Russian keyboard layout equivalents ('ю', 'б', '/') on the decimal key.
 */
export function parseFlexibleDecimal(raw: string | number): number | null {
  if (typeof raw === 'number') {
    return Number.isFinite(raw) ? raw : null;
  }
  if (typeof raw !== 'string') return null;
  const normalized = raw
    .trim()
    .replace(/\s+/g, '')
    .replace(/[,юЮбБ/]/g, '.');
  if (!normalized || normalized === '-' || normalized === '.' || normalized === '-.') {
    return null;
  }
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * Computes Haversine distance in km between two (lat, lng) coordinates.
 */
export function haversineDistanceKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Determines the nearest climatic region in Russia and derives climate/snow/soil parameters
 * from an exact (lat, lng) point.
 */
export function resolveRegionFromCoordinates(lat: number, lng: number): {
  nearestRegion: RegionInfo;
  distanceKm: number;
  effectiveRegion: RegionInfo;
} {
  const clampedLat = Math.max(41.0, Math.min(78.0, lat));
  const clampedLng = Math.max(19.0, Math.min(180.0, lng));

  let nearest = REGIONS_RF[0];
  let minDist = Infinity;

  for (const reg of REGIONS_RF) {
    const d = haversineDistanceKm(clampedLat, clampedLng, reg.lat, reg.lng);
    if (d < minDist) {
      minDist = d;
      nearest = reg;
    }
  }

  // Return effective region using exact lat/lng for SunCalc solar geometry while inheriting normative zone
  const effectiveRegion: RegionInfo = {
    ...nearest,
    lat: Number(clampedLat.toFixed(5)),
    lng: Number(clampedLng.toFixed(5))
  };

  return {
    nearestRegion: nearest,
    distanceKm: Math.round(minDist),
    effectiveRegion
  };
}

/**
 * Returns the effective RegionInfo for a PlotConfig, taking customLat/customLng into account if set.
 */
export function getEffectivePlotRegion(plot: Pick<PlotConfig, 'regionId' | 'customLat' | 'customLng'>): RegionInfo {
  const base = REGIONS_RF.find((r) => r.id === plot.regionId) || REGIONS_RF[0];
  if (typeof plot.customLat === 'number' && typeof plot.customLng === 'number') {
    return {
      ...base,
      lat: plot.customLat,
      lng: plot.customLng
    };
  }
  return base;
}

/**
 * Generates polygon points for a plot based on preset and dimensions, centered around (0, 0).
 */
export function generatePlotPolygon(config: Pick<PlotConfig, 'preset' | 'width' | 'length' | 'trapezoidTopWidth' | 'lCutoutWidth' | 'lCutoutLength' | 'points'>): Point2D[] {
  const W = Math.max(6, config.width);
  const L = Math.max(6, config.length);
  const hw = W / 2;
  const hl = L / 2;

  if (config.preset === 'rectangle') {
    // Clockwise starting from bottom-left (South-West if North is -Z):
    // Edge 0: South (Front / Street typically) -> ( -hw, hl ) to ( hw, hl )
    // Edge 1: East -> ( hw, hl ) to ( hw, -hl )
    // Edge 2: North -> ( hw, -hl ) to ( -hw, -hl )
    // Edge 3: West -> ( -hw, -hl ) to ( -hw, hl )
    return [
      { x: -hw, z: hl },
      { x: hw, z: hl },
      { x: hw, z: -hl },
      { x: -hw, z: -hl }
    ];
  }

  if (config.preset === 'trapezoid') {
    const topW = Math.max(4, Math.min(W * 1.5, config.trapezoidTopWidth || W * 0.7));
    const hTop = topW / 2;
    return [
      { x: -hw, z: hl },
      { x: hw, z: hl },
      { x: hTop, z: -hl },
      { x: -hTop, z: -hl }
    ];
  }

  if (config.preset === 'l_shape') {
    const cw = Math.max(3, Math.min(W - 4, config.lCutoutWidth || W * 0.4));
    const cl = Math.max(3, Math.min(L - 4, config.lCutoutLength || L * 0.4));
    return [
      { x: -hw, z: hl },
      { x: hw, z: hl },
      { x: hw, z: -hl + cl },
      { x: hw - cw, z: -hl + cl },
      { x: hw - cw, z: -hl },
      { x: -hw, z: -hl }
    ];
  }

  return config.points.length >= 3
    ? config.points
    : [
        { x: -hw, z: hl },
        { x: hw, z: hl },
        { x: hw, z: -hl },
        { x: -hw, z: -hl }
      ];
}

/**
 * Shoelace formula to calculate polygon area in m².
 */
export function calculatePolygonArea(points: Point2D[]): number {
  if (points.length < 3) return 0;
  let area = 0;
  for (let i = 0; i < points.length; i++) {
    const j = (i + 1) % points.length;
    area += points[i].x * points[j].z - points[j].x * points[i].z;
  }
  return Math.abs(area) / 2;
}

/**
 * Calculates polygon perimeter in meters.
 */
export function calculatePolygonPerimeter(points: Point2D[]): number {
  if (points.length < 2) return 0;
  let perimeter = 0;
  for (let i = 0; i < points.length; i++) {
    const j = (i + 1) % points.length;
    perimeter += Math.hypot(points[j].x - points[i].x, points[j].z - points[i].z);
  }
  return perimeter;
}

/**
 * Ray-casting check whether a 2D point (x, z) lies inside a polygon.
 */
export function pointInPolygon(pt: Point2D, poly: Point2D[]): boolean {
  if (poly.length < 3) return false;
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i].x;
    const zi = poly[i].z;
    const xj = poly[j].x;
    const zj = poly[j].z;
    const intersect =
      zi > pt.z !== zj > pt.z && pt.x < ((xj - xi) * (pt.z - zi)) / (zj - zi + 1e-12) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}


/**
 * Mathematical cheat-sheet implementation for 4 roof types:
 * Calculates exact roof area S_roof, slope angle alpha, shape factor mu, and overhang rule.
 * Preserves 1-millimeter (0.001 m) precision on dimensions.
 */
export function calculateRoofGeometryMetrics(
  obj: Pick<SiteObject, 'width' | 'length' | 'roofHeight' | 'overhang' | 'roofType'> & {
    slopeDirection?: SlopeDirection;
  }
): RoofGeometryMetrics {
  const W = Math.max(0.5, obj.width);
  const L = Math.max(0.5, obj.length);
  const O = Math.max(0, obj.overhang);
  const H = Math.max(0, obj.roofHeight);

  // Rule of roof overhang (СП 53.13330.2019 п. 6.7):
  // If Overhang <= 0.5m, measured from walls. If Overhang > 0.5m, measured from roof projection.
  const overhangRuleTriggered = O > 0.5;
  const effectiveFootprintWidth = overhangRuleTriggered ? W + 2 * O : W;
  const effectiveFootprintLength = overhangRuleTriggered ? L + 2 * O : L;
  const horizontalProjectionSqm = (W + 2 * O) * (L + 2 * O);

  let roofAreaSqm = horizontalProjectionSqm;
  let slopeAngleRad = 0;
  let wasteFactor = 1.12;

  if (obj.roofType === 'flat') {
    // S_roof = (L + 2*O) * (W + 2*O), alpha = 0° => mu = 1.0
    roofAreaSqm = (L + 2 * O) * (W + 2 * O);
    slopeAngleRad = 0;
    wasteFactor = 1.08;
  } else if (obj.roofType === 'shed') {
    // Односкатная (Прямая трапециевидная призма):
    const span = obj.slopeDirection === 'north' || obj.slopeDirection === 'south' ? L : W;
    const cross = obj.slopeDirection === 'north' || obj.slopeDirection === 'south' ? W : L;
    roofAreaSqm = (cross + 2 * O) * Math.sqrt(Math.pow(span + 2 * O, 2) + Math.pow(H, 2));
    slopeAngleRad = Math.atan(H / span);
    wasteFactor = 1.10;
  } else if (obj.roofType === 'gable') {
    // Двускатная (Прямая пятиугольная призма):
    // S_roof = 2 * (L + 2*O) * sqrt((W/2 + O)^2 + H_ridge^2)
    // alpha = arctan(H_ridge / (W/2))
    roofAreaSqm = 2 * (L + 2 * O) * Math.sqrt(Math.pow(W / 2 + O, 2) + Math.pow(H, 2));
    slopeAngleRad = Math.atan(H / (W / 2));
    wasteFactor = 1.12;
  } else if (obj.roofType === 'hip') {
    // Пирамидальная / Шатровая (Обелиск / Четырехугольная пирамида):
    const halfSpan = Math.min(W, L) / 2;
    slopeAngleRad = Math.atan(H / halfSpan);
    if (Math.abs(L - W) < 0.01) {
      roofAreaSqm = 2 * (W + 2 * O) * Math.sqrt(Math.pow(W / 2 + O, 2) + Math.pow(H, 2));
    } else {
      roofAreaSqm = horizontalProjectionSqm / Math.cos(slopeAngleRad);
    }
    wasteFactor = 1.20; // +20% waste on hip/pyramid roof edges
  }

  const slopeAngleDeg = (slopeAngleRad * 180) / Math.PI;

  // Shape coefficient mu according to СП 20.13330.2016:
  // alpha <= 30° => mu = 1.0
  // 30° < alpha < 60° => mu = (60 - alpha) / 30
  // alpha >= 60° => mu = 0
  let shapeFactorMu = 1.0;
  if (slopeAngleDeg <= 30) {
    shapeFactorMu = 1.0;
  } else if (slopeAngleDeg >= 60) {
    shapeFactorMu = 0.0;
  } else {
    shapeFactorMu = (60 - slopeAngleDeg) / 30;
  }

  return {
    roofType: obj.roofType,
    slopeAngleDeg: Number(slopeAngleDeg.toFixed(1)),
    shapeFactorMu: Number(shapeFactorMu.toFixed(3)),
    roofAreaSqm: Number(roofAreaSqm.toFixed(2)),
    horizontalProjectionSqm: Number(horizontalProjectionSqm.toFixed(2)),
    effectiveFootprintWidth: roundToMm(effectiveFootprintWidth),
    effectiveFootprintLength: roundToMm(effectiveFootprintLength),
    overhangRuleTriggered,
    wasteFactor
  };
}

/**
 * Calculates the exact roof height H_roof (in meters, 1mm precision) required to achieve
 * a given roof slope angle alpha (in degrees) for the object's width, length, and roofType.
 */
export function calculateRoofHeightFromAngle(
  obj: Pick<SiteObject, 'width' | 'length' | 'roofType'> & { slopeDirection?: SlopeDirection },
  angleDeg: number
): number {
  if (obj.roofType === 'flat') {
    return 0.4;
  }
  const clampedAngle = Math.max(1, Math.min(72, angleDeg));
  const rad = (clampedAngle * Math.PI) / 180;
  const W = Math.max(0.5, obj.width);
  const L = Math.max(0.5, obj.length);

  if (obj.roofType === 'shed') {
    const span = obj.slopeDirection === 'north' || obj.slopeDirection === 'south' ? L : W;
    return Math.max(0.05, roundToMm(span * Math.tan(rad)));
  }
  if (obj.roofType === 'gable') {
    return Math.max(0.05, roundToMm((W / 2) * Math.tan(rad)));
  }
  // hip / pyramid
  const halfSpan = Math.min(W, L) / 2;
  return Math.max(0.05, roundToMm(halfSpan * Math.tan(rad)));
}

/**
 * Calculates the current roof slope angle alpha (in degrees, 0.1° precision) from the object's roofHeight.
 */
export function calculateRoofAngleFromHeight(
  obj: Pick<SiteObject, 'width' | 'length' | 'roofHeight' | 'roofType'> & {
    overhang?: number;
    slopeDirection?: SlopeDirection;
  }
): number {
  return calculateRoofGeometryMetrics({ ...obj, overhang: obj.overhang ?? 0 }).slopeAngleDeg;
}

/**
 * Returns true if the category represents a roofed structure that should display roof slope arrows.
 */
export function isRoofedBuildingCategory(category: BuildingCategory): boolean {
  return (
    category === 'house' ||
    category === 'bathhouse' ||
    category === 'garage' ||
    category === 'shed' ||
    category === 'poultry' ||
    category === 'greenhouse' ||
    category === 'toilet' ||
    category === 'neighbor_house' ||
    category === 'well' ||
    category === 'neighbor_well'
  );
}

/**
 * Returns true if the category represents an enclosed building with walls, doors, windows, and interior rooms.
 */
export function isEnclosedBuildingCategory(category: BuildingCategory): boolean {
  return (
    category === 'house' ||
    category === 'bathhouse' ||
    category === 'garage' ||
    category === 'shed' ||
    category === 'poultry' ||
    category === 'greenhouse' ||
    category === 'toilet' ||
    category === 'neighbor_house'
  );
}

/**
 * Returns true if the category represents an external environment, utility network, or neighbor object.
 */
export function isExternalOrUtilityCategory(category: BuildingCategory): boolean {
  return (
    category === 'neighbor_house' ||
    category === 'neighbor_well' ||
    category === 'forest' ||
    category === 'water_body' ||
    category === 'power_line' ||
    category === 'gas_pipe' ||
    category === 'water_main' ||
    category === 'sewer_main' ||
    category === 'road'
  );
}

/**
 * Returns local 2D slope direction arrow descriptors for ALL roof types (flat, shed, gable, hip)
 * so both 2D and 3D viewports can draw clear slope direction arrows on every roofed building.
 */
export interface RoofSlopeArrowLocal {
  dirX: number;
  dirZ: number;
  originFactorX: number; // multiplied by W
  originFactorZ: number; // multiplied by L
  label: string;
}

export function getRoofSlopeVectorsLocal(
  obj: Pick<SiteObject, 'roofType' | 'slopeDirection'>
): RoofSlopeArrowLocal[] {
  let primaryVec = { x: 0, z: 1 };
  if (obj.slopeDirection === 'north') primaryVec = { x: 0, z: -1 };
  else if (obj.slopeDirection === 'south') primaryVec = { x: 0, z: 1 };
  else if (obj.slopeDirection === 'east') primaryVec = { x: 1, z: 0 };
  else if (obj.slopeDirection === 'west') primaryVec = { x: -1, z: 0 };

  if (obj.roofType === 'flat') {
    return [
      {
        dirX: primaryVec.x,
        dirZ: primaryVec.z,
        originFactorX: 0,
        originFactorZ: 0,
        label: 'Уклон 2%'
      }
    ];
  }

  if (obj.roofType === 'shed') {
    return [
      {
        dirX: primaryVec.x,
        dirZ: primaryVec.z,
        originFactorX: 0,
        originFactorZ: 0,
        label: 'Скат'
      }
    ];
  }

  if (obj.roofType === 'gable') {
    // Ridge runs along local Z axis (-L/2 .. +L/2), slopes go to -X (West) and +X (East)
    return [
      {
        dirX: -1,
        dirZ: 0,
        originFactorX: -0.22,
        originFactorZ: 0,
        label: 'Скат'
      },
      {
        dirX: 1,
        dirZ: 0,
        originFactorX: 0.22,
        originFactorZ: 0,
        label: 'Скат'
      }
    ];
  }

  // 'hip' (четырехскатная шатровая / вальмовая) — 4 slopes outward
  return [
    { dirX: 0, dirZ: 1, originFactorX: 0, originFactorZ: 0.22, label: 'Скат' },
    { dirX: 0, dirZ: -1, originFactorX: 0, originFactorZ: -0.22, label: 'Скат' },
    { dirX: 1, dirZ: 0, originFactorX: 0.22, originFactorZ: 0, label: 'Скат' },
    { dirX: -1, dirZ: 0, originFactorX: -0.22, originFactorZ: 0, label: 'Скат' }
  ];
}

/**
 * Resolves the effective window construction type ID for a building.
 */
export function getEffectiveWindowTypeId(obj: Pick<SiteObject, 'category' | 'windowTypeId' | 'windows'>): WindowConstructionTypeId {
  const explicit = obj.windowTypeId || obj.windows?.windowTypeId;
  if (explicit && WINDOW_TYPES_INFO[explicit]) {
    return explicit;
  }
  if (obj.category === 'house' || obj.category === 'neighbor_house') {
    return 'pvc_double_chamber';
  }
  if (obj.category === 'bathhouse') {
    return 'wood_double_glass';
  }
  if (obj.category === 'garage') {
    return 'pvc_single_chamber';
  }
  return 'wood_single_glass';
}

/**
 * Resolves the effective roof insulation type ID for a building.
 */
export function getEffectiveRoofInsulationId(obj: Pick<SiteObject, 'category' | 'roofInsulationId'>): RoofInsulationTypeId {
  if (obj.roofInsulationId && ROOF_INSULATION_INFO[obj.roofInsulationId]) {
    return obj.roofInsulationId;
  }
  if (obj.category === 'house' || obj.category === 'neighbor_house') {
    return 'mineral_wool_200_50';
  }
  if (obj.category === 'bathhouse') {
    return 'mineral_wool_150';
  }
  return 'none';
}

/**
 * Resolves the effective external wall insulation type ID for a building.
 */
export function getEffectiveWallInsulationId(obj: Pick<SiteObject, 'category' | 'wallInsulationId'>): WallInsulationTypeId {
  if (obj.wallInsulationId && WALL_INSULATION_INFO[obj.wallInsulationId]) {
    return obj.wallInsulationId;
  }
  return 'none';
}

/**
 * Returns default or custom window count, dimensions, and offset per facade for a building.
 */
export function getObjectWindowsConfig(obj: SiteObject): BuildingWindowsConfig {
  const windowWidth =
    obj.windows?.windowWidth !== undefined
      ? Math.max(0.4, Math.min(3.5, Number(obj.windows.windowWidth)))
      : 1.3;
  const windowHeight =
    obj.windows?.windowHeight !== undefined
      ? Math.max(0.4, Math.min(2.6, Number(obj.windows.windowHeight)))
      : 1.3;
  const sillHeight =
    obj.windows?.sillHeight !== undefined
      ? Math.max(0.1, Math.min(2.0, Number(obj.windows.sillHeight)))
      : 0.85;
  const positionOffset =
    obj.windows?.positionOffset !== undefined
      ? Math.max(-0.35, Math.min(0.35, Number(obj.windows.positionOffset)))
      : 0;
  const windowTypeId = getEffectiveWindowTypeId(obj);

  if (obj.windows) {
    return {
      south: Math.max(0, Math.min(4, Math.round(obj.windows.south ?? 0))),
      north: Math.max(0, Math.min(4, Math.round(obj.windows.north ?? 0))),
      east: Math.max(0, Math.min(4, Math.round(obj.windows.east ?? 0))),
      west: Math.max(0, Math.min(4, Math.round(obj.windows.west ?? 0))),
      windowWidth,
      windowHeight,
      sillHeight,
      positionOffset,
      windowTypeId
    };
  }
  if (obj.category === 'house' || obj.category === 'neighbor_house') {
    return { south: 2, north: 1, east: 1, west: 1, windowWidth, windowHeight, sillHeight, positionOffset, windowTypeId };
  }
  if (obj.category === 'bathhouse' || obj.category === 'garage' || obj.category === 'shed' || obj.category === 'poultry') {
    return { south: 1, north: 0, east: 1, west: 0, windowWidth, windowHeight, sillHeight, positionOffset, windowTypeId };
  }
  if (obj.category === 'greenhouse') {
    return { south: 2, north: 2, east: 2, west: 2, windowWidth, windowHeight, sillHeight, positionOffset, windowTypeId };
  }
  return { south: 0, north: 0, east: 0, west: 0, windowWidth, windowHeight, sillHeight, positionOffset, windowTypeId };
}

/**
 * Returns default or custom entrance/patio door count, dimensions, threshold, and offset per facade for a building.
 */
export function getObjectDoorsConfig(obj: SiteObject): BuildingDoorsConfig {
  const defaultDoorW = obj.category === 'garage' ? 2.4 : 0.95;
  const doorWidth =
    obj.doors?.doorWidth !== undefined
      ? Math.max(0.6, Math.min(2.8, Number(obj.doors.doorWidth)))
      : defaultDoorW;
  const doorHeight =
    obj.doors?.doorHeight !== undefined
      ? Math.max(1.6, Math.min(2.6, Number(obj.doors.doorHeight)))
      : 2.05;
  const thresholdHeight =
    obj.doors?.thresholdHeight !== undefined
      ? Math.max(0, Math.min(0.5, Number(obj.doors.thresholdHeight)))
      : 0.05;
  const positionOffset =
    obj.doors?.positionOffset !== undefined
      ? Math.max(-0.4, Math.min(0.4, Number(obj.doors.positionOffset)))
      : 0;
  const hasGlazing =
    obj.doors?.hasGlazing !== undefined
      ? Boolean(obj.doors.hasGlazing)
      : obj.category === 'greenhouse';

  if (obj.doors) {
    return {
      south: Math.max(0, Math.min(3, Math.round(obj.doors.south ?? 0))),
      north: Math.max(0, Math.min(3, Math.round(obj.doors.north ?? 0))),
      east: Math.max(0, Math.min(3, Math.round(obj.doors.east ?? 0))),
      west: Math.max(0, Math.min(3, Math.round(obj.doors.west ?? 0))),
      doorWidth,
      doorHeight,
      thresholdHeight,
      positionOffset,
      hasGlazing
    };
  }

  if (isEnclosedBuildingCategory(obj.category)) {
    return {
      south: 1,
      north: 0,
      east: 0,
      west: 0,
      doorWidth,
      doorHeight,
      thresholdHeight,
      positionOffset,
      hasGlazing
    };
  }

  return {
    south: 0,
    north: 0,
    east: 0,
    west: 0,
    doorWidth,
    doorHeight,
    thresholdHeight,
    positionOffset,
    hasGlazing
  };
}

/**
 * Returns the polygon vertices of a building's footprint in its local coordinate system (centered around 0,0).
 */
export function getLocalObjectFootprintPolygon(obj: SiteObject, useEffectiveOverhang = false): Point2D[] {
  const metrics = calculateRoofGeometryMetrics(obj);
  const w = useEffectiveOverhang ? metrics.effectiveFootprintWidth : obj.width;
  const l = useEffectiveOverhang ? metrics.effectiveFootprintLength : obj.length;
  const hw = w / 2;
  const hl = l / 2;
  const shape = obj.footprintShape || 'rectangle';

  if (shape === 'l_shape' && w >= 3 && l >= 3) {
    const cw = Math.max(1.2, Math.min(w * 0.6, obj.wingWidth || w * 0.42));
    const cl = Math.max(1.2, Math.min(l * 0.6, obj.wingLength || l * 0.42));
    // L-shape with cutout in NE corner (x > hw - cw, z < -hl + cl)
    return [
      { x: -hw, z: -hl },
      { x: hw - cw, z: -hl },
      { x: hw - cw, z: -hl + cl },
      { x: hw, z: -hl + cl },
      { x: hw, z: hl },
      { x: -hw, z: hl }
    ];
  }

  if (shape === 't_shape' && w >= 3.5 && l >= 3.5) {
    const bayW = Math.max(1.4, Math.min(w * 0.65, obj.wingWidth || w * 0.46));
    const bayL = Math.max(1.0, Math.min(l * 0.45, obj.wingLength || l * 0.28));
    const hBayW = bayW / 2;
    const bodyNorthZ = -hl;
    const bodySouthZ = hl - bayL;
    return [
      { x: -hw, z: bodyNorthZ },
      { x: hw, z: bodyNorthZ },
      { x: hw, z: bodySouthZ },
      { x: hBayW, z: bodySouthZ },
      { x: hBayW, z: hl },
      { x: -hBayW, z: hl },
      { x: -hBayW, z: bodySouthZ },
      { x: -hw, z: bodySouthZ }
    ];
  }

  if (shape === 'chamfered') {
    const chX = Math.min(hw * 0.32, 1.8);
    const chZ = Math.min(hl * 0.32, 1.8);
    return [
      { x: -hw + chX, z: -hl },
      { x: hw - chX, z: -hl },
      { x: hw, z: -hl + chZ },
      { x: hw, z: hl - chZ },
      { x: hw - chX, z: hl },
      { x: -hw + chX, z: hl },
      { x: -hw, z: hl - chZ },
      { x: -hw, z: -hl + chZ }
    ];
  }

  return [
    { x: -hw, z: -hl },
    { x: hw, z: -hl },
    { x: hw, z: hl },
    { x: -hw, z: hl }
  ];
}

/**
 * Returns the corners of an object's effective footprint in world (plot) coordinates.
 */
export function getObjectFootprintCorners(obj: SiteObject, useEffectiveOverhang = true): Point2D[] {
  const useOverhang = useEffectiveOverhang && isRoofedBuildingCategory(obj.category);
  const localCorners = getLocalObjectFootprintPolygon(obj, useOverhang);
  const rad = (obj.rotation * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);

  return localCorners.map((p) => ({
    x: obj.x + p.x * cos - p.z * sin,
    z: obj.z + p.x * sin + p.z * cos
  }));
}

/**
 * Computes exact interior sunlight patches (световые пятна на полу внутри здания)
 * cast through the windows of a building for a given world sun position vector.
 */
export function calculateInteriorSunPatches(
  obj: SiteObject,
  sunVecWorld: { x: number; y: number; z: number; altitudeDeg: number }
): InteriorSunPatch[] {
  if (sunVecWorld.altitudeDeg <= 2 || !isEnclosedBuildingCategory(obj.category)) {
    return [];
  }

  const wins = getObjectWindowsConfig(obj);
  const doors = getObjectDoorsConfig(obj);
  const W = Math.max(1.2, obj.width);
  const L = Math.max(1.2, obj.length);
  const hw = W / 2;
  const hl = L / 2;
  const plinthH = Math.max(0.05, obj.plinthHeight ?? 0.35);
  const H_wall = computeTotalAboveGroundWallHeight(obj);
  const bodyH = Math.max(1.0, H_wall - plinthH);

  const rad = (obj.rotation * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);

  const sxLocal = sunVecWorld.x * cos + sunVecWorld.z * sin;
  const szLocal = -sunVecWorld.x * sin + sunVecWorld.z * cos;
  const syLocal = Math.max(1.5, sunVecWorld.y);

  const horizLen = Math.hypot(sxLocal, szLocal, syLocal) || 1;
  const sunDirLocal = {
    x: sxLocal / horizLen,
    y: syLocal / horizLen,
    z: szLocal / horizLen
  };

  // Respect user-configured sillHeight and windowHeight
  const floorY = plinthH + 0.04;
  const sillOffset = Math.min(bodyH - 0.45, Math.max(0.1, wins.sillHeight ?? 0.85));
  const reqWinH = Math.min(bodyH - sillOffset - 0.08, Math.max(0.4, wins.windowHeight ?? 1.3));
  const sillY = plinthH + sillOffset;
  const topY = sillY + reqWinH;

  const patches: InteriorSunPatch[] = [];

  const facades: Array<{
    facade: 'south' | 'north' | 'east' | 'west';
    count: number;
    normal: { x: number; z: number };
    spanLen: number;
  }> = [
    { facade: 'south', count: wins.south, normal: { x: 0, z: 1 }, spanLen: W },
    { facade: 'north', count: wins.north, normal: { x: 0, z: -1 }, spanLen: W },
    { facade: 'east', count: wins.east, normal: { x: 1, z: 0 }, spanLen: L },
    { facade: 'west', count: wins.west, normal: { x: -1, z: 0 }, spanLen: L }
  ];

  const clampX = (x: number) => Math.max(-hw + 0.18, Math.min(hw - 0.18, x));
  const clampZ = (z: number) => Math.max(-hl + 0.18, Math.min(hl - 0.18, z));

  for (const f of facades) {
    if (f.count <= 0) continue;
    const dot = f.normal.x * sunDirLocal.x + f.normal.z * sunDirLocal.z;
    if (dot <= 0.06) continue;

    const maxAllowedWinW = (f.spanLen * 0.82) / f.count;
    const winWidth = Math.max(0.35, Math.min(maxAllowedWinW, wins.windowWidth ?? 1.3));
    const shiftAlongWall = (wins.positionOffset ?? 0) * (f.spanLen * 0.35);
    const maxCenter = Math.max(0, f.spanLen / 2 - winWidth / 2 - 0.15);

    for (let i = 0; i < f.count; i++) {
      const baseOffset = ((i + 0.5) / f.count - 0.5) * (f.spanLen * 0.72) + shiftAlongWall;
      const offsetAlongWall = Math.max(-maxCenter, Math.min(maxCenter, baseOffset));
      const halfWin = winWidth / 2;

      const tNear = Math.max(0.12, (sillY - floorY) / syLocal);
      const tFar = Math.min(12.0, (topY - floorY) / syLocal);

      const dxNear = -sxLocal * tNear;
      const dzNear = -szLocal * tNear;
      const dxFar = -sxLocal * tFar;
      const dzFar = -szLocal * tFar;

      let winCorners3D: Array<{ x: number; y: number; z: number }> = [];
      let rawFloorPoly: Point2D[] = [];
      let centerLocal = { x: 0, y: (sillY + topY) / 2, z: 0 };

      if (f.facade === 'south') {
        const zWall = hl - 0.05;
        const x1 = offsetAlongWall - halfWin;
        const x2 = offsetAlongWall + halfWin;
        centerLocal = { x: offsetAlongWall, y: (sillY + topY) / 2, z: zWall };
        winCorners3D = [
          { x: x1, y: sillY, z: zWall },
          { x: x2, y: sillY, z: zWall },
          { x: x2, y: topY, z: zWall },
          { x: x1, y: topY, z: zWall }
        ];
        rawFloorPoly = [
          { x: clampX(x1 + dxNear), z: clampZ(zWall + dzNear) },
          { x: clampX(x2 + dxNear), z: clampZ(zWall + dzNear) },
          { x: clampX(x2 + dxFar), z: clampZ(zWall + dzFar) },
          { x: clampX(x1 + dxFar), z: clampZ(zWall + dzFar) }
        ];
      } else if (f.facade === 'north') {
        const zWall = -hl + 0.05;
        const x1 = offsetAlongWall - halfWin;
        const x2 = offsetAlongWall + halfWin;
        centerLocal = { x: offsetAlongWall, y: (sillY + topY) / 2, z: zWall };
        winCorners3D = [
          { x: x1, y: sillY, z: zWall },
          { x: x2, y: sillY, z: zWall },
          { x: x2, y: topY, z: zWall },
          { x: x1, y: topY, z: zWall }
        ];
        rawFloorPoly = [
          { x: clampX(x1 + dxNear), z: clampZ(zWall + dzNear) },
          { x: clampX(x2 + dxNear), z: clampZ(zWall + dzNear) },
          { x: clampX(x2 + dxFar), z: clampZ(zWall + dzFar) },
          { x: clampX(x1 + dxFar), z: clampZ(zWall + dzFar) }
        ];
      } else if (f.facade === 'east') {
        const xWall = hw - 0.05;
        const z1 = offsetAlongWall - halfWin;
        const z2 = offsetAlongWall + halfWin;
        centerLocal = { x: xWall, y: (sillY + topY) / 2, z: offsetAlongWall };
        winCorners3D = [
          { x: xWall, y: sillY, z: z1 },
          { x: xWall, y: sillY, z: z2 },
          { x: xWall, y: topY, z: z2 },
          { x: xWall, y: topY, z: z1 }
        ];
        rawFloorPoly = [
          { x: clampX(xWall + dxNear), z: clampZ(z1 + dzNear) },
          { x: clampX(xWall + dxNear), z: clampZ(z2 + dzNear) },
          { x: clampX(xWall + dxFar), z: clampZ(z2 + dzFar) },
          { x: clampX(xWall + dxFar), z: clampZ(z1 + dzFar) }
        ];
      } else {
        const xWall = -hw + 0.05;
        const z1 = offsetAlongWall - halfWin;
        const z2 = offsetAlongWall + halfWin;
        centerLocal = { x: xWall, y: (sillY + topY) / 2, z: offsetAlongWall };
        winCorners3D = [
          { x: xWall, y: sillY, z: z1 },
          { x: xWall, y: sillY, z: z2 },
          { x: xWall, y: topY, z: z2 },
          { x: xWall, y: topY, z: z1 }
        ];
        rawFloorPoly = [
          { x: clampX(xWall + dxNear), z: clampZ(z1 + dzNear) },
          { x: clampX(xWall + dxNear), z: clampZ(z2 + dzNear) },
          { x: clampX(xWall + dxFar), z: clampZ(z2 + dzFar) },
          { x: clampX(xWall + dxFar), z: clampZ(z1 + dzFar) }
        ];
      }

      patches.push({
        facade: f.facade,
        windowIndex: i,
        windowCenterLocal: {
          x: Number(centerLocal.x.toFixed(2)),
          y: Number(centerLocal.y.toFixed(2)),
          z: Number(centerLocal.z.toFixed(2))
        },
        windowCornersLocal3D: winCorners3D,
        floorPolygonLocal: rawFloorPoly.map((p) => ({
          x: Number(p.x.toFixed(2)),
          z: Number(p.z.toFixed(2))
        })),
        intensity: Number(Math.min(1, dot * 1.25).toFixed(2))
      });
    }
  }

  // Also cast interior sunlight patches through glazed doors (when doors.hasGlazing is enabled)
  if (doors.hasGlazing) {
    const doorFacades: Array<{
      facade: 'south' | 'north' | 'east' | 'west';
      count: number;
      normal: { x: number; z: number };
      spanLen: number;
    }> = [
      { facade: 'south', count: doors.south, normal: { x: 0, z: 1 }, spanLen: W },
      { facade: 'north', count: doors.north, normal: { x: 0, z: -1 }, spanLen: W },
      { facade: 'east', count: doors.east, normal: { x: 1, z: 0 }, spanLen: L },
      { facade: 'west', count: doors.west, normal: { x: -1, z: 0 }, spanLen: L }
    ];

    const doorBotY = plinthH + (doors.thresholdHeight ?? 0.05) + 0.35;
    const doorTopY = Math.min(plinthH + bodyH - 0.1, plinthH + (doors.thresholdHeight ?? 0.05) + (doors.doorHeight ?? 2.05) - 0.1);
    if (doorTopY > doorBotY + 0.25) {
      for (const df of doorFacades) {
        if (df.count <= 0) continue;
        const dot = df.normal.x * sunDirLocal.x + df.normal.z * sunDirLocal.z;
        if (dot <= 0.06) continue;
        const maxDoorW = (df.spanLen * 0.75) / df.count;
        const dW = Math.max(0.5, Math.min(maxDoorW, doors.doorWidth ?? 0.95));
        const shiftD = (doors.positionOffset ?? 0) * (df.spanLen * 0.38);
        const maxCenterD = Math.max(0, df.spanLen / 2 - dW / 2 - 0.12);

        for (let di = 0; di < df.count; di++) {
          const baseCx = (df.count === 1 ? 0 : ((di + 0.5) / df.count - 0.5) * (df.spanLen * 0.65)) + shiftD;
          const cx = Math.max(-maxCenterD, Math.min(maxCenterD, baseCx));
          const halfD = (dW * 0.72) / 2;

          const tNear = Math.max(0.08, (doorBotY - floorY) / syLocal);
          const tFar = Math.min(12.0, (doorTopY - floorY) / syLocal);
          const dxNear = -sxLocal * tNear;
          const dzNear = -szLocal * tNear;
          const dxFar = -sxLocal * tFar;
          const dzFar = -szLocal * tFar;

          const zWall = df.facade === 'south' ? hl - 0.05 : -hl + 0.05;
          const xWall = df.facade === 'east' ? hw - 0.05 : -hw + 0.05;
          let winCorners3D: Array<{ x: number; y: number; z: number }> = [];
          let rawFloorPoly: Point2D[] = [];
          let centerLocal = { x: 0, y: (doorBotY + doorTopY) / 2, z: 0 };

          if (df.facade === 'south' || df.facade === 'north') {
            const x1 = cx - halfD;
            const x2 = cx + halfD;
            centerLocal = { x: cx, y: (doorBotY + doorTopY) / 2, z: zWall };
            winCorners3D = [
              { x: x1, y: doorBotY, z: zWall },
              { x: x2, y: doorBotY, z: zWall },
              { x: x2, y: doorTopY, z: zWall },
              { x: x1, y: doorTopY, z: zWall }
            ];
            rawFloorPoly = [
              { x: clampX(x1 + dxNear), z: clampZ(zWall + dzNear) },
              { x: clampX(x2 + dxNear), z: clampZ(zWall + dzNear) },
              { x: clampX(x2 + dxFar), z: clampZ(zWall + dzFar) },
              { x: clampX(x1 + dxFar), z: clampZ(zWall + dzFar) }
            ];
          } else {
            const z1 = cx - halfD;
            const z2 = cx + halfD;
            centerLocal = { x: xWall, y: (doorBotY + doorTopY) / 2, z: cx };
            winCorners3D = [
              { x: xWall, y: doorBotY, z: z1 },
              { x: xWall, y: doorBotY, z: z2 },
              { x: xWall, y: doorTopY, z: z2 },
              { x: xWall, y: doorTopY, z: z1 }
            ];
            rawFloorPoly = [
              { x: clampX(xWall + dxNear), z: clampZ(z1 + dzNear) },
              { x: clampX(xWall + dxNear), z: clampZ(z2 + dzNear) },
              { x: clampX(xWall + dxFar), z: clampZ(z2 + dzFar) },
              { x: clampX(xWall + dxFar), z: clampZ(z1 + dzFar) }
            ];
          }

          patches.push({
            facade: df.facade,
            windowIndex: 100 + di,
            windowCenterLocal: {
              x: Number(centerLocal.x.toFixed(2)),
              y: Number(centerLocal.y.toFixed(2)),
              z: Number(centerLocal.z.toFixed(2))
            },
            windowCornersLocal3D: winCorners3D,
            floorPolygonLocal: rawFloorPoly.map((p) => ({
              x: Number(p.x.toFixed(2)),
              z: Number(p.z.toFixed(2))
            })),
            intensity: Number(Math.min(1, dot * 1.15).toFixed(2))
          });
        }
      }
    }
  }

  return patches;
}

/**
 * Shortest distance from a 2D point P to line segment AB.
 */
export function pointToSegmentDistance(p: Point2D, a: Point2D, b: Point2D): number {
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const lenSq = dx * dx + dz * dz;
  if (lenSq === 0) return Math.hypot(p.x - a.x, p.z - a.z);
  let t = ((p.x - a.x) * dx + (p.z - a.z) * dz) / lenSq;
  t = Math.max(0, Math.min(1, t));
  const projX = a.x + t * dx;
  const projZ = a.z + t * dz;
  return Math.hypot(p.x - projX, p.z - projZ);
}

/**
 * Shortest distance between two convex polygons (such as two rotated building footprints).
 */
export function polygonToPolygonDistance(polyA: Point2D[], polyB: Point2D[]): number {
  let minDist = Infinity;
  for (const p of polyA) {
    for (let i = 0; i < polyB.length; i++) {
      const a = polyB[i];
      const b = polyB[(i + 1) % polyB.length];
      minDist = Math.min(minDist, pointToSegmentDistance(p, a, b));
    }
  }
  for (const p of polyB) {
    for (let i = 0; i < polyA.length; i++) {
      const a = polyA[i];
      const b = polyA[(i + 1) % polyA.length];
      minDist = Math.min(minDist, pointToSegmentDistance(p, a, b));
    }
  }
  return minDist;
}

/**
 * Required setback in meters from a given boundary edge type for a building/tree category
 * per СП 53.13330.2019 & СП 42.13330.2016.
 */
export function getRequiredBoundarySetback(category: BuildingCategory, edgeType: BoundaryEdgeType): number {
  if (isExternalOrUtilityCategory(category)) return 0;

  if (edgeType === 'street') {
    if (category === 'well' || category === 'tree_tall' || category === 'tree_medium') return 1;
    return 5;
  }

  if (edgeType === 'driveway') {
    if (category === 'house') return 3;
    if (category === 'poultry') return 4;
    if (category === 'toilet') return 2;
    return 1;
  }

  // Межа с соседом (neighbor) по СП 53.13330.2019 п. 6.7:
  switch (category) {
    case 'house':
      return 3;
    case 'poultry':
    case 'tree_tall':
      return 4;
    case 'toilet':
    case 'tree_medium':
      return 2;
    case 'bathhouse':
    case 'garage':
    case 'shed':
    case 'greenhouse':
    case 'well':
      return 1;
    default:
      return 1;
  }
}

/**
 * Required fire safety distance between houses per СП 4.13130.2013 Table 1.
 */
export function getRequiredFireDistance(matA: FireResistanceMaterial, matB: FireResistanceMaterial): number {
  if (matA === 'stone' && matB === 'stone') return 6;
  if ((matA === 'stone' && matB === 'mixed') || (matA === 'mixed' && matB === 'stone')) return 8;
  if (matA === 'mixed' && matB === 'mixed') return 10;
  if ((matA === 'stone' && matB === 'wood') || (matA === 'wood' && matB === 'stone')) return 10;
  if ((matA === 'mixed' && matB === 'wood') || (matA === 'wood' && matB === 'mixed')) return 12;
  return 15; // wood - wood
}

/**
 * Computes unit vector of water runoff direction in plot coordinates for a shed/flat roof.
 */
export function getShedSlopeWorldVector(obj: SiteObject): Point2D {
  let localVec: Point2D = { x: 0, z: 1 };
  if (obj.slopeDirection === 'north') localVec = { x: 0, z: -1 };
  else if (obj.slopeDirection === 'south') localVec = { x: 0, z: 1 };
  else if (obj.slopeDirection === 'east') localVec = { x: 1, z: 0 };
  else if (obj.slopeDirection === 'west') localVec = { x: -1, z: 0 };

  const rad = (obj.rotation * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  return {
    x: localVec.x * cos - localVec.z * sin,
    z: localVec.x * sin + localVec.z * cos
  };
}

/**
 * Computes outward unit normal vector for boundary segment a -> b pointing outside the plot.
 */
export function getEdgeOutwardNormal(a: Point2D, b: Point2D): Point2D {
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const len = Math.hypot(dx, dz) || 1;
  // For clockwise polygon in (x, z), inward is (dz/len, -dx/len), so outward is (-dz/len, dx/len)
  let outX = -dz / len;
  let outZ = dx / len;
  const midX = (a.x + b.x) / 2;
  const midZ = (a.z + b.z) / 2;
  if (outX * midX + outZ * midZ < 0) {
    outX = -outX;
    outZ = -outZ;
  }
  return { x: outX, z: outZ };
}

/**
 * Comprehensive Russian Building Code (СП / СНиП / ЗК РФ / ВК РФ) validation engine.
 */
export function validateSitePlan(plot: PlotConfig, objects: SiteObject[], shadowNeighborRatio = 0): NormViolation[] {
  const violations: NormViolation[] = [];
  const poly = generatePlotPolygon(plot);
  const plotArea = calculatePolygonArea(poly);

  // 1. Check fence regulations (СП 53.13330.2019 п. 6.2)
  plot.edges.forEach((edge, idx) => {
    if (edge.type === 'neighbor' && plot.category === 'SNT') {
      if ((edge.fenceType === 'solid' || edge.fenceHeight > 1.8) && !edge.hasNeighborConsent) {
        violations.push({
          id: `fence-edge-${idx}`,
          edgeIndex: idx,
          severity: 'warning',
          code: 'СП 53.13330.2019 п. 6.2',
          title: `Глухой или высокий забор на границе с соседом (Граница #${idx + 1})`,
          description: `По периметру садовых участков в СНТ рекомендуется устраивать сетчатое ограждение высотой 1.2–1.8 м. Установлен ${edge.fenceType === 'solid' ? 'глухой забор' : 'забор'} высотой ${edge.fenceHeight.toFixed(1)} м.`,
          recommendation: 'Замените полотно на прозрачную сетку/штакетник (≤ 1.8 м) или сформируйте и подпишите письменное согласие смежного землепользователя.',
          canGenerateConsent: true,
          consentType: 'fence',
          measuredValue: edge.fenceHeight,
          requiredValue: 1.8
        });
      }
    }
  });

  // 2. Check ZOUIT (Охранная зона ЛЭП / Газопровода на границе участка)
  if (plot.hasZouit && poly.length >= 3) {
    const edgeIdx = plot.zouitEdgeIndex % poly.length;
    const a = poly[edgeIdx];
    const b = poly[(edgeIdx + 1) % poly.length];

    for (const obj of objects) {
      if (isExternalOrUtilityCategory(obj.category)) continue;
      const corners = getObjectFootprintCorners(obj, true);
      const minDist = Math.min(...corners.map((c) => pointToSegmentDistance(c, a, b)));
      if (minDist < plot.zouitDepth) {
        violations.push({
          id: `zouit-${obj.id}`,
          objectId: obj.id,
          severity: 'error',
          code: 'ЗК РФ ст. 105 / ПП РФ №160 (ЗОУИТ)',
          title: `Объект «${obj.name}» в охранной зоне коммуникаций`,
          description: `Объект находится на расстоянии ${minDist.toFixed(1)} м от границы с обременением (ЛЭП/газопровод) при запретной зоне ${plot.zouitDepth} м.`,
          recommendation: `Переместите «${obj.name}» за пределы охранной зоны (${plot.zouitDepth} м). В ЗОУИТ регистрация построек невозможна, снос безусловный.`,
          measuredValue: Number(minDist.toFixed(2)),
          requiredValue: plot.zouitDepth
        });
      }
    }
  }

  // 3. Check each site object against boundaries, overhang rules, and external neighbor setback violations
  let totalFootprintArea = 0;

  for (const obj of objects) {
    const isExtOrUtility = isExternalOrUtilityCategory(obj.category);
    const isTree = obj.category === 'tree_tall' || obj.category === 'tree_medium';
    const metrics = calculateRoofGeometryMetrics(obj);

    // Check if a neighbor's house outside the plot violates the 3.0m setback from the shared boundary
    if (obj.category === 'neighbor_house' && poly.length >= 3) {
      const corners = getObjectFootprintCorners(obj, false);
      let minNeighborBoundaryDist = Infinity;
      let nearestEdgeIdx = 0;
      for (let i = 0; i < poly.length; i++) {
        const a = poly[i];
        const b = poly[(i + 1) % poly.length];
        const d = Math.min(...corners.map((c) => pointToSegmentDistance(c, a, b)));
        if (d < minNeighborBoundaryDist) {
          minNeighborBoundaryDist = d;
          nearestEdgeIdx = i;
        }
      }
      if (minNeighborBoundaryDist < 3.0 - 0.05) {
        violations.push({
          id: `neighbor-violation-setback-${obj.id}`,
          objectId: obj.id,
          edgeIndex: nearestEdgeIdx,
          severity: 'warning',
          code: 'СП 53.13330.2019 п. 6.7 / ГК РФ ст. 304',
          title: `Нарушение соседа: «${obj.name}» ближе 3 м от вашей межи (${minNeighborBoundaryDist.toFixed(2)} м)`,
          description: `Жилой дом соседа за пределами участка расположен в ${minNeighborBoundaryDist.toFixed(2)} м от границы #${nearestEdgeIdx + 1} (норматив ≥ 3.0 м) и накладывает противопожарное обременение на вашу территорию.`,
          recommendation: 'Зафиксируйте нарушение отступа соседом (акт кадастрового инженера) или учитывайте противопожарный разрыв СП 4.13130.2013 при посадке своего дома.',
          measuredValue: Number(minNeighborBoundaryDist.toFixed(2)),
          requiredValue: 3.0
        });
      }
    }

    if (!isExtOrUtility) {
      if (!isTree && obj.category !== 'well') {
        totalFootprintArea += metrics.effectiveFootprintWidth * metrics.effectiveFootprintLength;
      }

      // Overhang trap check (СП 53.13330.2019 п. 6.7)
      if (!isTree && obj.category !== 'well' && metrics.overhangRuleTriggered) {
        violations.push({
          id: `overhang-trap-${obj.id}`,
          objectId: obj.id,
          severity: 'info',
          code: 'СП 53.13330.2019 п. 6.7',
          title: `Ловушка свеса крыши у объекта «${obj.name}» (${obj.overhang} м)`,
          description: `Свес кровли более 50 см (${(obj.overhang * 100).toFixed(0)} см)! По закону отступ до границы участка измеряется НЕ от стены, а от горизонтальной проекции края кровли на землю.`,
          recommendation: `Учитывайте габарит проверки ${metrics.effectiveFootprintWidth}×${metrics.effectiveFootprintLength} м или уменьшите вылет свеса до ≤ 0.50 м.`
        });
      }

      // Check distances to each boundary edge
      const corners = getObjectFootprintCorners(obj, !isTree);
      for (let i = 0; i < poly.length; i++) {
        const a = poly[i];
        const b = poly[(i + 1) % poly.length];
        const edgeCfg = plot.edges[i] || { type: 'neighbor', fenceType: 'mesh', fenceHeight: 1.5, hasNeighborConsent: false };
        const reqSetback = getRequiredBoundarySetback(obj.category, edgeCfg.type);
        const minDist = Math.min(...corners.map((c) => pointToSegmentDistance(c, a, b)));

        if (minDist < reqSetback - 0.02) {
          const edgeTypeLabel =
            edgeCfg.type === 'street'
              ? 'красной линии улицы'
              : edgeCfg.type === 'driveway'
              ? 'границы проезда'
              : 'межи соседнего участка';
          const codeRef =
            edgeCfg.type === 'neighbor' ? 'СП 53.13330.2019 п. 6.7' : 'СП 42.13330.2016 / СП 30-102-99';

          violations.push({
            id: `setback-${obj.id}-edge-${i}`,
            objectId: obj.id,
            edgeIndex: i,
            severity: 'error',
            code: codeRef,
            title: `Нарушен отступ «${obj.name}» от ${edgeTypeLabel}`,
            description: `Фактическое расстояние составляет ${minDist.toFixed(2)} м (${isTree ? 'от ствола дерева' : metrics.overhangRuleTriggered ? 'с учетом проекции свеса крыши' : 'от стен'}) при минимально допустимом ${reqSetback.toFixed(1)} м.`,
            recommendation:
              obj.category === 'house' && edgeCfg.type === 'neighbor'
                ? 'Сдвиньте дом минимум на 3.0 м от межи. Внимание: письменное согласие соседа на уменьшение отступа дома НЕ отменяет муниципальные ПЗЗ и пожарные нормы СП 4.13130.2013!'
                : `Отодвиньте объект «${obj.name}» минимум на ${reqSetback.toFixed(1)} м от границы #${i + 1}.`,
            canGenerateConsent: edgeCfg.type === 'neighbor',
            consentType: 'setback',
            measuredValue: Number(minDist.toFixed(2)),
            requiredValue: reqSetback
          });
        } else if (
          edgeCfg.type === 'neighbor' &&
          !isTree &&
          obj.category !== 'house' &&
          obj.category !== 'well' &&
          minDist >= 1.0 &&
          minDist <= 1.6 &&
          obj.roofType === 'shed'
        ) {
          // Edge case: Shed roof slope toward THIS specific neighbor boundary when placed at 1.0–1.6m
          // Use the true outward normal of boundary segment a -> b (not vector to edge midpoint!)
          const outwardNormal = getEdgeOutwardNormal(a, b);
          const slopeVec = getShedSlopeWorldVector(obj);
          const dot = slopeVec.x * outwardNormal.x + slopeVec.z * outwardNormal.z;

          if (dot > 0.65) {
            violations.push({
              id: `roof-slope-neighbor-${obj.id}-edge-${i}`,
              objectId: obj.id,
              edgeIndex: i,
              severity: 'error',
              code: 'СП 53.13330.2019 п. 6.7',
              title: `Скат крыши «${obj.name}» направлен к соседу (Граница #${i + 1})!`,
              description: `При размещении хозпостройки в ${minDist.toFixed(2)} м от межи скат крыши ориентирован непосредственно в сторону соседнего участка (риск схода снега и залива).`,
              recommendation: 'Измените направление ската односкатной крыши на свой участок или разверните постройку.'
            });
          }
        }
      }
    }
  }

  // 4. Check plot building coverage ratio (Процент застройки до 30% в СНТ, п. 6.1 СП 53.13330.2019)
  if (plotArea > 0) {
    const coveragePercent = (totalFootprintArea / plotArea) * 100;
    if (plot.category === 'SNT' && coveragePercent > 30) {
      violations.push({
        id: 'plot-coverage-exceeded',
        severity: 'warning',
        code: 'СП 53.13330.2019 п. 6.1',
        title: `Превышен процент застройки участка СНТ (${coveragePercent.toFixed(1)}% > 30%)`,
        description: `Суммарная площадь застройки составляет ${totalFootprintArea.toFixed(1)} м² при площади участка ${plotArea.toFixed(1)} м² (норматив до 30%).`,
        recommendation: 'Уменьшите габариты построек или объедините хозблок/гараж с домом под одной крышей.',
        measuredValue: Number(coveragePercent.toFixed(1)),
        requiredValue: 30
      });
    }
  }

  // 5. Pairwise checks: Internal sanitary gaps, Fire safety distances, Forest/Water/Utilities/Roads/Trees
  for (let i = 0; i < objects.length; i++) {
    for (let j = i + 1; j < objects.length; j++) {
      const A = objects[i];
      const B = objects[j];
      const polyA = getObjectFootprintCorners(A, false);
      const polyB = getObjectFootprintCorners(B, false);
      const dist = polygonToPolygonDistance(polyA, polyB);

      // 5a. Fire break between user's house and neighbor's house (СП 4.13130.2013)
      const isHousePair =
        (A.category === 'house' && B.category === 'neighbor_house') ||
        (B.category === 'house' && A.category === 'neighbor_house');

      if (isHousePair) {
        const reqFireDist = getRequiredFireDistance(A.material, B.material);
        if (dist < reqFireDist) {
          const ownHouse = A.category === 'house' ? A : B;
          violations.push({
            id: `fire-break-${A.id}-${B.id}`,
            objectId: ownHouse.id,
            severity: 'error',
            code: 'СП 4.13130.2013 Табл. 1',
            title: `Нарушен противопожарный разрыв между домами (${dist.toFixed(1)} м < ${reqFireDist} м)`,
            description: `Между вашим домом («${ownHouse.name}») и соседским домом расстояние ${dist.toFixed(1)} м. Для выбранных классов огнестойкости минимум составляет ${reqFireDist} м.`,
            recommendation: `Отодвиньте дом вглубь участка до ${reqFireDist} м ИЛИ замените материал стен на негорючий камень/бетон (снижает требуемый разрыв до 6–10 м). Расписка соседа противопожарные нормы НЕ отменяет!`,
            measuredValue: Number(dist.toFixed(1)),
            requiredValue: reqFireDist
          });
        }
      }

      // 5b. Sanitary gap: Well (own or neighbor) to Toilet/Septic/Poultry >= 8 m
      const isWellToSeptic =
        ((A.category === 'well' || A.category === 'neighbor_well') &&
          (B.category === 'toilet' || B.category === 'poultry')) ||
        ((B.category === 'well' || B.category === 'neighbor_well') &&
          (A.category === 'toilet' || A.category === 'poultry'));

      if (isWellToSeptic) {
        const minSanitary = 8;
        if (dist < minSanitary) {
          const targetObj = A.category === 'toilet' || A.category === 'poultry' ? A : B;
          violations.push({
            id: `sanitary-well-${A.id}-${B.id}`,
            objectId: targetObj.id,
            severity: 'error',
            code: 'СП 53.13330.2019 п. 6.8',
            title: `Опасное сближение скважины/колодца и септика (${dist.toFixed(1)} м < 8 м)`,
            description: `Расстояние между источником питьевой воды («${A.name}») и «${B.name}» составляет всего ${dist.toFixed(1)} м при санитарном минимуме 8 м (для ИЖС рекомендуется 15–20 м).`,
            recommendation: 'Разнесите колодец/скважину и септик/туалет в противоположные углы участка (не менее 8 м).',
            measuredValue: Number(dist.toFixed(1)),
            requiredValue: minSanitary
          });
        }
      }

      // 5c. Sanitary gap: House to Bathhouse / Toilet >= 8 m, or House to Poultry >= 15 m
      const isHouseToBathOrToilet =
        (A.category === 'house' && (B.category === 'bathhouse' || B.category === 'toilet')) ||
        (B.category === 'house' && (A.category === 'bathhouse' || A.category === 'toilet'));

      if (isHouseToBathOrToilet && dist < 8) {
        const subObj = A.category === 'house' ? B : A;
        violations.push({
          id: `sanitary-bath-${A.id}-${B.id}`,
          objectId: subObj.id,
          severity: 'warning',
          code: 'СП 53.13330.2019 п. 6.8',
          title: `Санитарный разрыв от дома до «${subObj.name}» (${dist.toFixed(1)} м < 8 м)`,
          description: `По СП 53.13330.2019 от жилого дома до бани, душа и уличного туалета должно быть не менее 8 м (сейчас ${dist.toFixed(1)} м).`,
          recommendation: 'Увеличьте дистанцию между жилым домом и баней/септиком до 8 метров.',
          measuredValue: Number(dist.toFixed(1)),
          requiredValue: 8
        });
      }

      const isHouseToPoultry =
        (A.category === 'house' && B.category === 'poultry') ||
        (B.category === 'house' && A.category === 'poultry');

      if (isHouseToPoultry && dist < 15) {
        const subObj = A.category === 'poultry' ? A : B;
        violations.push({
          id: `sanitary-poultry-${A.id}-${B.id}`,
          objectId: subObj.id,
          severity: 'error',
          code: 'СП 53.13330.2019 п. 6.8',
          title: `Санитарный разрыв от дома до птичника (${dist.toFixed(1)} м < 15 м)`,
          description: `От жилого дома до постройки для содержания скота и птицы требуется минимум 15 м (сейчас ${dist.toFixed(1)} м).`,
          recommendation: 'Перенесите птичник в дальнюю зону участка не ближе 15 м от жилого дома и 4 м от межи.',
          measuredValue: Number(dist.toFixed(1)),
          requiredValue: 15
        });
      }

      // 5d. Tall tree to House foundation/walls >= 5 m (СП 42.13330.2016 Табл. 9.1)
      const isTallTreeToHouse =
        (A.category === 'tree_tall' && B.category === 'house') ||
        (B.category === 'tree_tall' && A.category === 'house');
      if (isTallTreeToHouse && dist < 5) {
        const treeObj = A.category === 'tree_tall' ? A : B;
        violations.push({
          id: `tree-house-${A.id}-${B.id}`,
          objectId: treeObj.id,
          severity: 'warning',
          code: 'СП 42.13330.2016 Табл. 9.1',
          title: `Высокорослое дерево «${treeObj.name}» слишком близко к дому (${dist.toFixed(1)} м < 5 м)`,
          description: `Расстояние от ствола высокорослого дерева до наружной стены жилого дома составляет ${dist.toFixed(1)} м при нормативе 5.0 м (риск разрушения фундамента корнями и затенения окон).`,
          recommendation: 'Пересадите высокорослое дерево на расстояние ≥ 5 м от стен дома и ≥ 4 м от соседской межи.',
          measuredValue: Number(dist.toFixed(1)),
          requiredValue: 5
        });
      }

      // 5e. Environment & Linear Infrastructure protective setbacks to user's capital buildings
      const isUserCapitalBuilding = (cat: BuildingCategory) =>
        cat === 'house' ||
        cat === 'bathhouse' ||
        cat === 'garage' ||
        cat === 'shed' ||
        cat === 'poultry' ||
        cat === 'greenhouse' ||
        cat === 'toilet';

      const checkEnvToBuilding = (envObj: SiteObject, bldObj: SiteObject) => {
        if (envObj.category === 'forest' && isUserCapitalBuilding(bldObj.category) && dist < 15) {
          violations.push({
            id: `forest-gap-${envObj.id}-${bldObj.id}`,
            objectId: bldObj.id,
            severity: 'error',
            code: 'СП 4.13130.2013 п. 4.14 (Лесной разрыв)',
            title: `Постройка «${bldObj.name}» в 15-метровой противопожарной зоне леса (${dist.toFixed(1)} м)`,
            description: `Противопожарное расстояние от границ застройки/зданий до лесного массива («${envObj.name}») должно быть не менее 15 м (сейчас ${dist.toFixed(1)} м).`,
            recommendation: 'Отодвиньте постройку минимум на 15 м от границы лесного массива.',
            measuredValue: Number(dist.toFixed(1)),
            requiredValue: 15
          });
        }

        if (envObj.category === 'water_body' && isUserCapitalBuilding(bldObj.category) && dist < 20) {
          violations.push({
            id: `water-zone-${envObj.id}-${bldObj.id}`,
            objectId: bldObj.id,
            severity: 'error',
            code: 'Водный кодекс РФ ст. 65',
            title: `«${bldObj.name}» в 20-метровой береговой/водоохранной зоне (${dist.toFixed(1)} м < 20 м)`,
            description: `Объект расположен в ${dist.toFixed(1)} м от уреза воды («${envObj.name}»). Береговая полоса общего пользования составляет 20 м, размещение септиков и кап. объектов без защиты запрещено.`,
            recommendation: 'Переместите объект за пределы 20-метровой береговой полосы водоема.',
            measuredValue: Number(dist.toFixed(1)),
            requiredValue: 20
          });
        }

        if (envObj.category === 'power_line' && (isUserCapitalBuilding(bldObj.category) || bldObj.category === 'tree_tall') && dist < 10) {
          violations.push({
            id: `power-line-${envObj.id}-${bldObj.id}`,
            objectId: bldObj.id,
            severity: 'error',
            code: 'ПП РФ №160 (Охранная зона ЛЭП)',
            title: `«${bldObj.name}» в охранной зоне ЛЭП (${dist.toFixed(1)} м < 10 м)`,
            description: `Расстояние до воздушной линии электропередачи («${envObj.name}») составляет ${dist.toFixed(1)} м при охранной зоне ЗОУИТ 10 м.`,
            recommendation: 'Уберите постройку/высокорослые деревья на расстояние не менее 10 м от оси ЛЭП.',
            measuredValue: Number(dist.toFixed(1)),
            requiredValue: 10
          });
        }

        if (envObj.category === 'gas_pipe' && (isUserCapitalBuilding(bldObj.category) || bldObj.category === 'tree_tall') && dist < 4) {
          violations.push({
            id: `gas-pipe-${envObj.id}-${bldObj.id}`,
            objectId: bldObj.id,
            severity: 'error',
            code: 'ПП РФ №878 / СП 42.13330 Табл. 12.5',
            title: `«${bldObj.name}» в охранной зоне газопровода (${dist.toFixed(1)} м < 4 м)`,
            description: `От фундамента/объекта «${bldObj.name}» до трассы газопровода («${envObj.name}») всего ${dist.toFixed(1)} м при минимально допустимой зоне безопасности 4.0 м.`,
            recommendation: 'Перенесите постройку минимум на 4.0 м от оси газопровода.',
            measuredValue: Number(dist.toFixed(1)),
            requiredValue: 4
          });
        }

        if (envObj.category === 'water_main' && isUserCapitalBuilding(bldObj.category) && dist < 5) {
          violations.push({
            id: `water-main-${envObj.id}-${bldObj.id}`,
            objectId: bldObj.id,
            severity: 'error',
            code: 'СП 42.13330.2016 Табл. 12.5',
            title: `Фундамент «${bldObj.name}» ближе 5 м к магистральному водопроводу (${dist.toFixed(1)} м)`,
            description: `По СП 42.13330 минимальное расстояние по горизонтали от напорного водопровода до фундамента здания составляет 5.0 м (при прорыве размывает грунт основания).`,
            recommendation: 'Отодвиньте фундамент постройки минимум на 5.0 м от оси магистрального водопровода.',
            measuredValue: Number(dist.toFixed(1)),
            requiredValue: 5
          });
        }

        if (envObj.category === 'sewer_main') {
          if (bldObj.category === 'well' && dist < 10) {
            violations.push({
              id: `sewer-main-well-${envObj.id}-${bldObj.id}`,
              objectId: bldObj.id,
              severity: 'error',
              code: 'СП 42.13330.2016 / СанПиН',
              title: `Питьевой источник «${bldObj.name}» ближе 10 м к магистральной канализации (${dist.toFixed(1)} м)`,
              description: `Расстояние от скважины/колодца до коллектора магистральной канализации составляет ${dist.toFixed(1)} м при минимуме 10 м.`,
              recommendation: 'Перенесите скважину/колодец минимум на 10 м от магистральной канализации.',
              measuredValue: Number(dist.toFixed(1)),
              requiredValue: 10
            });
          } else if (isUserCapitalBuilding(bldObj.category) && dist < 3) {
            violations.push({
              id: `sewer-main-bld-${envObj.id}-${bldObj.id}`,
              objectId: bldObj.id,
              severity: 'error',
              code: 'СП 42.13330.2016 Табл. 12.5',
              title: `Фундамент «${bldObj.name}» ближе 3 м к магистральной канализации (${dist.toFixed(1)} м)`,
              description: `По СП 42.13330 минимальный отступ от сети канализации до фундаментов зданий и сооружений составляет 3.0 м.`,
              recommendation: 'Отодвиньте постройку минимум на 3.0 м от трассы магистральной канализации.',
              measuredValue: Number(dist.toFixed(1)),
              requiredValue: 3
            });
          }
        }

        if (envObj.category === 'road' && isUserCapitalBuilding(bldObj.category) && dist < 5) {
          violations.push({
            id: `road-setback-${envObj.id}-${bldObj.id}`,
            objectId: bldObj.id,
            severity: 'error',
            code: 'СП 53.13330.2019 п. 6.6',
            title: `Нарушен 5-метровый отступ «${bldObj.name}» от автодороги (${dist.toFixed(1)} м < 5 м)`,
            description: `Расстояние от постройки «${bldObj.name}» до автодороги («${envObj.name}») составляет ${dist.toFixed(1)} м при обязательном отступе 5.0 м.`,
            recommendation: 'Отодвиньте постройку минимум на 5.0 м от края дороги / красной линии.',
            measuredValue: Number(dist.toFixed(1)),
            requiredValue: 5
          });
        }
      };

      checkEnvToBuilding(A, B);
      checkEnvToBuilding(B, A);
    }
  }

  // 6. Shadow / Insolation check on neighbor plot
  if (shadowNeighborRatio > 0.5) {
    violations.push({
      id: 'insolation-neighbor-shading',
      severity: 'warning',
      code: 'ГК РФ ст. 304 / СанПиН инсоляция',
      title: `Риск судебного иска за затенение соседнего участка (${(shadowNeighborRatio * 100).toFixed(0)}%)`,
      description: 'Тень от высоких построек или глухого забора перекрывает более 50% прилегающей полосы соседнего участка дольше 3 часов светового дня.',
      recommendation: 'Сместите высокую постройку к югу/центру своего участка или уменьшите высоту конька крыши.'
    });
  }

  return violations;
}

/**
 * Calculates snow load per СП 20.13330.2016 for a building and region.
 */
export function calculateSnowLoad(house: SiteObject, regionId: string): SnowLoadResult {
  const region = REGIONS_RF.find((r) => r.id === regionId) || REGIONS_RF[0];
  const metrics = calculateRoofGeometryMetrics(house);

  // Full design snow load on 1 m² of horizontal projection:
  // S = S_g * mu * c_e * c_t * gamma_f (where c_e=1, c_t=1, gamma_f=1.4)
  const designSnowLoadS = region.snowLoadSg * metrics.shapeFactorMu * 1.4;
  const totalSnowMassTons = (designSnowLoadS * metrics.horizontalProjectionSqm) / 1000;

  let recommendedRafterSection = 'Доска 50×150 мм';
  let recommendedRafterStepMm = 600;

  if (designSnowLoadS >= 280 || house.width > 9) {
    recommendedRafterSection = 'Доска 50×200 мм (сдвоенная) или LVL-брус';
    recommendedRafterStepMm = 400;
  } else if (designSnowLoadS >= 180 || house.width > 6.5) {
    recommendedRafterSection = 'Доска 50×200 мм (сосна 1 сорт)';
    recommendedRafterStepMm = 600;
  } else {
    recommendedRafterSection = 'Доска 50×150 мм (сосна 1 сорт)';
    recommendedRafterStepMm = 600;
  }

  return {
    snowZone: region.snowZone,
    normativeSg: region.snowLoadSg,
    slopeAngleDeg: metrics.slopeAngleDeg,
    mu: metrics.shapeFactorMu,
    designSnowLoadS: Number(designSnowLoadS.toFixed(1)),
    totalSnowMassTons: Number(totalSnowMassTons.toFixed(2)),
    recommendedRafterSection,
    recommendedRafterStepMm
  };
}

/**
 * Checks foundation pressure against soil bearing capacity R0 per СП 22.13330.2016,
 * accounting for up to 3 above-ground floors, +1 underground basement, interfloor slabs,
 * plinth height, and foundation slab overhang & thickness.
 */
export function calculateFoundationBearing(
  house: SiteObject,
  regionId: string,
  soilTypeId: PlotConfig['soilTypeId']
): FoundationCheckResult {
  const soil = SOILS_DB[soilTypeId] || SOILS_DB.loam;
  const snow = calculateSnowLoad(house, regionId);
  const fndInfo = FOUNDATION_NAMES[house.foundationTypeId] || FOUNDATION_NAMES.mzlf;

  const floorsAbove = Math.max(1, Math.min(3, Math.round(house.floors || 1)));
  const floorH = house.floorHeight ?? 3.0;
  const slabThick = house.interfloorSlabThickness ?? 0.22;
  const plinthH = house.plinthHeight ?? 0.45;
  const hasBasement = Boolean(house.hasBasement);
  const basementDepth = hasBasement ? (house.basementDepth ?? 2.5) : 0;
  const fndSlabOverhang = house.foundationSlabOverhang ?? 0.2;
  const fndSlabThick = house.foundationSlabThickness ?? 0.3;

  const footprintArea = house.width * house.length;
  const outerPerimeter = 2 * (house.width + house.length);
  const totalWallLength = outerPerimeter + (house.partitionLength || house.width + house.length);
  const aboveGroundWallsH = plinthH + floorsAbove * floorH + Math.max(0, floorsAbove - 1) * slabThick;

  const wallMat = WALL_MATERIALS_INFO[house.wallMaterialId] || WALL_MATERIALS_INFO.aerated_concrete;
  const wallThicknessM = house.wallMaterialId === 'frame' ? 0.2 : house.wallMaterialId === 'timber' ? 0.22 : 0.4;
  const wallVolumeM3 = totalWallLength * aboveGroundWallsH * wallThicknessM * (1 - (house.glazingRatio || 0.15));
  const basementWallVolumeM3 = hasBasement ? outerPerimeter * basementDepth * 0.35 : 0;
  const wallsMassTons =
    (wallVolumeM3 * wallMat.densityKgM3) / 1000 + basementWallVolumeM3 * 2.4;

  // Interfloor slabs + live payload (150 kg/m² per floor + concrete slab weight) + roof structure (65 kg/m²)
  const totalLevels = floorsAbove + (hasBasement ? 1 : 0);
  const interfloorSlabMassPerSqmKg = slabThick * 2200 * 0.65; // averaged RC/composite slab density
  const liveAndFloorMassTons =
    (footprintArea * totalLevels * (180 + interfloorSlabMassPerSqmKg)) / 1000;
  const roofStructureMassTons = (footprintArea * 65) / 1000;

  // Foundation self-weight and support area (accounting for foundationSlabOverhang & foundationSlabThickness)
  const effectiveSlabW = house.width + 2 * fndSlabOverhang;
  const effectiveSlabL = house.length + 2 * fndSlabOverhang;
  const effectiveSlabArea = effectiveSlabW * effectiveSlabL;

  let foundationSupportAreaSqm = effectiveSlabArea;
  let foundationSelfWeightTons = 0;

  if (house.foundationTypeId === 'slab' || hasBasement) {
    foundationSupportAreaSqm = effectiveSlabArea;
    foundationSelfWeightTons = effectiveSlabArea * fndSlabThick * 2.4;
  } else if (house.foundationTypeId === 'piles') {
    const pileCount = Math.ceil(totalWallLength / 1.8);
    foundationSupportAreaSqm = Math.max(2.5, pileCount * 0.25);
    foundationSelfWeightTons = totalWallLength * 0.35 * 0.4 * 2.4 + pileCount * 0.3;
  } else {
    const stripWidth = fndInfo.baseWidthM + fndSlabOverhang * 0.5;
    const stripDepth = house.foundationTypeId === 'deep_strip' ? 1.5 : 0.6;
    foundationSupportAreaSqm = totalWallLength * stripWidth;
    foundationSelfWeightTons = totalWallLength * stripWidth * stripDepth * 2.4;
  }

  const totalBuildingMassTons = wallsMassTons + liveAndFloorMassTons + roofStructureMassTons + foundationSelfWeightTons;
  const totalLoadWithSnowTons = totalBuildingMassTons + snow.totalSnowMassTons;

  const actualPressureKpa = (totalLoadWithSnowTons / foundationSupportAreaSqm) * 9.81;
  const safetyMarginRatio = soil.bearingCapacityR0 / Math.max(1, actualPressureKpa);
  const isSafe = actualPressureKpa <= soil.bearingCapacityR0 * 0.95;

  let warningMessage: string | undefined;
  if (!isSafe) {
    warningMessage = `Удельное давление дома со снегом (${actualPressureKpa.toFixed(0)} кПа) превышает расчетное сопротивление грунта R0 (${soil.bearingCapacityR0} кПа)! Увеличьте выступ плиты фундамента или перейдите на монолитную плиту.`;
  } else if (soilTypeId === 'peat' && house.foundationTypeId === 'mzlf') {
    warningMessage = 'Мелкозаглубленная лента (МЗЛФ) на торфяниках и плывунах недопустима из-за неравномерных осадок! Выберите свайный фундамент или плиту с выемкой грунта.';
  } else if (soilTypeId === 'peat' && hasBasement) {
    warningMessage = 'Устройство подземного этажа на торфянике/плывуне сопряжено с риском всплытия и затопления! Требуется пристенный дренаж и гидроизоляция под давлением.';
  } else if (soilTypeId === 'loam' && house.foundationTypeId === 'mzlf') {
    warningMessage = 'При устройстве МЗЛФ на пучинистых суглинках обязательна утепленная ЭППС отмостка на 1.2 м и кольцевой дренаж.';
  }

  return {
    totalBuildingMassTons: Number(totalBuildingMassTons.toFixed(1)),
    snowMassTons: snow.totalSnowMassTons,
    totalLoadWithSnowTons: Number(totalLoadWithSnowTons.toFixed(1)),
    foundationSupportAreaSqm: Number(foundationSupportAreaSqm.toFixed(1)),
    actualPressureKpa: Number(actualPressureKpa.toFixed(1)),
    soilBearingR0Kpa: soil.bearingCapacityR0,
    safetyMarginRatio: Number(safetyMarginRatio.toFixed(2)),
    isSafe: isSafe && !(soilTypeId === 'peat' && house.foundationTypeId === 'mzlf'),
    warningMessage
  };
}

/**
 * Generates optimal wall material thickness recommendations based on region's R_req (СП 50.13330.2012).
 */
export function getWallMaterialRecommendations(regionId: string): MaterialWallRecommendation[] {
  const region = REGIONS_RF.find((r) => r.id === regionId) || REGIONS_RF[0];
  const rReq = region.rReqWall;

  const isSouth = rReq < 2.6;
  const isNorth = rReq > 3.5;

  return [
    {
      id: 'aerated_concrete',
      name: 'Газобетон автоклавный D400',
      optimalThicknessSpec: isSouth
        ? 'Блок 300 мм без доп. утепления (штукатурка)'
        : isNorth
        ? 'Блок 400 мм + фасадная минвата 100 мм'
        : 'Блок 375–400 мм однослойная стена (или 300 мм + 50 мм минвата)',
      thermalResistanceR: isSouth ? 3.2 : isNorth ? 5.6 : 3.85,
      meetsNorm: true,
      notes: 'Оптимальное соотношение теплоемкости, негорючести (класс К0 — минимальный пожарный разрыв 6 м) и скорости кладки.'
    },
    {
      id: 'ceramic_block',
      name: 'Керамический блок / Кирпич 380–510 мм',
      optimalThicknessSpec: isSouth
        ? 'Теплая керамика 380 мм + облицовка'
        : isNorth
        ? 'Керамический блок 380 мм + базальтовый утеплитель 150 мм'
        : 'Керамический блок 380 мм + базальтовый утеплитель 100 мм',
      thermalResistanceR: isSouth ? 2.85 : isNorth ? 4.4 : 3.55,
      meetsNorm: true,
      notes: 'Высокая несущая способность под ЖБ перекрытия, долговечность более 100 лет, негорючий каменный класс.'
    },
    {
      id: 'frame',
      name: 'Каркасная технология (Сухая строганая доска)',
      optimalThicknessSpec: isSouth
        ? 'Стойки 150 мм (базальтовая вата)'
        : isNorth
        ? 'Стойки 200 мм + перекрестное утепление 50+50 мм (итого 300 мм)'
        : 'Стойки 150–200 мм + перекрестное утепление 50 мм',
      thermalResistanceR: isSouth ? 3.6 : isNorth ? 6.2 : 4.8,
      meetsNorm: true,
      notes: 'Легкий дом (минимальная нагрузка на грунт), быстрый прогрев, но требует противопожарного разрыва 10–15 м.'
    },
    {
      id: 'timber',
      name: 'Клееный / Профилированный брус',
      optimalThicknessSpec: isSouth
        ? 'Клееный брус 200 мм без утепления'
        : 'Брус 200–240 мм + наружное утепление 100 мм минватой для ПМЖ',
      thermalResistanceR: isSouth ? 2.4 : 2.15,
      meetsNorm: isSouth,
      notes: 'В регионах со значением R_req > 3.0 м²·°С/Вт чистый брус 200 мм (R ≈ 1.8–2.15) не проходит по СП 50.13330.2012 для ПМЖ без наружного утепления.'
    }
  ];
}

export const DEFAULT_MATERIAL_UNIT_PRICES: MaterialUnitPrices = {
  concreteRubPerM3: 6800,
  rebarRubPerKg: 78,
  sandGravelRubPerM3: 1950,
  aeratedConcreteRubPerM3: 7400,
  ceramicBrickRubPerM3: 9200,
  timberRubPerM3: 28000,
  frameWallRubPerM3: 14500,
  facadeFinishRubPerSqm: 1850,
  metalTileRubPerSqm: 1150,
  softShinglesRubPerSqm: 1450,
  corrugatedRoofRubPerSqm: 920,
  rafterTimberRubPerM3: 21500,
  fenceRubPerMeter: 2900
};

export function getEffectiveMaterialUnitPrices(
  plot?: Pick<PlotConfig, 'materialUnitPrices'>
): MaterialUnitPrices {
  const custom = plot?.materialUnitPrices;
  return {
    concreteRubPerM3: custom?.concreteRubPerM3 ?? DEFAULT_MATERIAL_UNIT_PRICES.concreteRubPerM3,
    rebarRubPerKg: custom?.rebarRubPerKg ?? DEFAULT_MATERIAL_UNIT_PRICES.rebarRubPerKg,
    sandGravelRubPerM3: custom?.sandGravelRubPerM3 ?? DEFAULT_MATERIAL_UNIT_PRICES.sandGravelRubPerM3,
    aeratedConcreteRubPerM3:
      custom?.aeratedConcreteRubPerM3 ?? DEFAULT_MATERIAL_UNIT_PRICES.aeratedConcreteRubPerM3,
    ceramicBrickRubPerM3:
      custom?.ceramicBrickRubPerM3 ?? DEFAULT_MATERIAL_UNIT_PRICES.ceramicBrickRubPerM3,
    timberRubPerM3: custom?.timberRubPerM3 ?? DEFAULT_MATERIAL_UNIT_PRICES.timberRubPerM3,
    frameWallRubPerM3: custom?.frameWallRubPerM3 ?? DEFAULT_MATERIAL_UNIT_PRICES.frameWallRubPerM3,
    facadeFinishRubPerSqm:
      custom?.facadeFinishRubPerSqm ?? DEFAULT_MATERIAL_UNIT_PRICES.facadeFinishRubPerSqm,
    metalTileRubPerSqm:
      custom?.metalTileRubPerSqm ?? DEFAULT_MATERIAL_UNIT_PRICES.metalTileRubPerSqm,
    softShinglesRubPerSqm:
      custom?.softShinglesRubPerSqm ?? DEFAULT_MATERIAL_UNIT_PRICES.softShinglesRubPerSqm,
    corrugatedRoofRubPerSqm:
      custom?.corrugatedRoofRubPerSqm ?? DEFAULT_MATERIAL_UNIT_PRICES.corrugatedRoofRubPerSqm,
    rafterTimberRubPerM3:
      custom?.rafterTimberRubPerM3 ?? DEFAULT_MATERIAL_UNIT_PRICES.rafterTimberRubPerM3,
    fenceRubPerMeter: custom?.fenceRubPerMeter ?? DEFAULT_MATERIAL_UNIT_PRICES.fenceRubPerMeter
  };
}

/**
 * Calculates full Bill of Materials (BOM) for the house and plot fences,
 * accounting for multi-story floors, underground basement, interfloor slabs, foundation slab overhang/thickness,
 * and user-configurable market unit prices per material type.
 */
export function calculateBillOfMaterials(
  plot: PlotConfig,
  objects: SiteObject[],
  pricesOverride?: Partial<MaterialUnitPrices>
): BOMSummary {
  const basePrices = getEffectiveMaterialUnitPrices(plot);
  const unitPrices: MaterialUnitPrices = {
    ...basePrices,
    ...(pricesOverride || {})
  };

  const house = objects.find((o) => o.category === 'house') || objects[0];
  const poly = generatePlotPolygon(plot);
  const fencePerimeterM = Number(calculatePolygonPerimeter(poly).toFixed(1));
  const fencePostsCount = Math.ceil(fencePerimeterM / 2.5);

  if (!house) {
    return {
      items: [],
      unitPrices,
      totalEstimatedCostRub: 0,
      foundationConcreteM3: 0,
      foundationRebarKg: 0,
      wallBlocksM3: 0,
      wallBlocksCount: 0,
      roofCoverAreaWithWasteSqm: 0,
      rafterTimberM3: 0,
      fencePerimeterM,
      fencePostsCount
    };
  }

  const roofMetrics = calculateRoofGeometryMetrics(house);
  const floorsAbove = Math.max(1, Math.min(3, Math.round(house.floors || 1)));
  const floorH = house.floorHeight ?? 3.0;
  const slabThick = house.interfloorSlabThickness ?? 0.22;
  const plinthH = house.plinthHeight ?? 0.45;
  const hasBasement = Boolean(house.hasBasement);
  const basementDepth = hasBasement ? (house.basementDepth ?? 2.5) : 0;
  const fndOverhang = house.foundationSlabOverhang ?? 0.2;
  const fndThick = house.foundationSlabThickness ?? 0.3;

  const footprintArea = house.width * house.length;
  const slabAreaWithOverhang = (house.width + 2 * fndOverhang) * (house.length + 2 * fndOverhang);
  const outerPerimeter = 2 * (house.width + house.length);
  const partitionLen = house.partitionLength || Math.round(house.width + house.length);
  const totalWallLength = outerPerimeter + partitionLen;

  // 1. Foundation + Basement + Interfloor Slabs concrete calculations
  let concreteRawM3 = 0;
  let formworkSqm = 0;
  let sandGravelCushionM3 = 0;

  if (house.foundationTypeId === 'slab' || hasBasement) {
    concreteRawM3 = slabAreaWithOverhang * fndThick;
    formworkSqm = 2 * (house.width + house.length + 4 * fndOverhang) * (fndThick + 0.05);
    sandGravelCushionM3 = (house.width + 2 * fndOverhang + 1.0) * (house.length + 2 * fndOverhang + 1.0) * 0.35;
  } else if (house.foundationTypeId === 'deep_strip') {
    concreteRawM3 = totalWallLength * 0.5 * 1.5;
    formworkSqm = totalWallLength * 1.5 * 2;
    sandGravelCushionM3 = totalWallLength * 0.8 * 0.3;
  } else if (house.foundationTypeId === 'piles') {
    const pilesCount = Math.ceil(totalWallLength / 1.8);
    concreteRawM3 = totalWallLength * 0.35 * 0.45 + pilesCount * (0.2 * 0.2 * 2.5);
    formworkSqm = totalWallLength * 0.45 * 2;
    sandGravelCushionM3 = totalWallLength * 0.6 * 0.2;
  } else {
    concreteRawM3 = totalWallLength * 0.4 * (0.5 + plinthH);
    formworkSqm = totalWallLength * (0.5 + plinthH) * 2;
    sandGravelCushionM3 = totalWallLength * 0.7 * 0.3;
  }

  // Add basement walls + interfloor slabs concrete
  if (hasBasement) {
    concreteRawM3 += outerPerimeter * basementDepth * 0.3 + footprintArea * slabThick;
    formworkSqm += outerPerimeter * basementDepth * 2;
  }
  if (floorsAbove > 1) {
    concreteRawM3 += (floorsAbove - 1) * footprintArea * slabThick * 0.75;
  }

  const foundationConcreteM3 = Number((concreteRawM3 * 1.05).toFixed(1));
  const foundationRebarKg = Math.round(foundationConcreteM3 * 85);

  // 2. Walls calculations (explicitly subtracting actual window area)
  const energyInfo = calculateEnergyAndHeating(house, plot);
  const netOuterWallArea = energyInfo.netWallAreaSqm;
  const totalWallHeight = floorsAbove * floorH;
  const partitionArea = partitionLen * totalWallHeight * 0.88;

  const outerThicknessM = house.wallMaterialId === 'frame' ? 0.2 : house.wallMaterialId === 'timber' ? 0.2 : 0.375;
  const wallBlocksM3 = Number((netOuterWallArea * outerThicknessM + partitionArea * 0.15).toFixed(1));
  const wallBlocksCount = Math.ceil(wallBlocksM3 * 17.1);
  const glueBagsCount = Math.ceil(wallBlocksM3 * 1.4);
  const facadeAreaSqm = Math.round(netOuterWallArea * 1.05);

  // 3. Roof calculations
  const roofCoverAreaWithWasteSqm = Number((roofMetrics.roofAreaSqm * roofMetrics.wasteFactor).toFixed(1));
  const rafterTimberM3 = Number((roofMetrics.roofAreaSqm * 0.048).toFixed(1));
  const membraneAreaSqm = Math.ceil(roofMetrics.roofAreaSqm * 1.15);

  // 4. Fence calculations
  const fenceLagRows = 2;
  const fenceSheetsCount = Math.ceil(fencePerimeterM / 1.15);

  const wallPriceKey: keyof MaterialUnitPrices =
    house.wallMaterialId === 'timber'
      ? 'timberRubPerM3'
      : house.wallMaterialId === 'ceramic_block'
      ? 'ceramicBrickRubPerM3'
      : house.wallMaterialId === 'frame'
      ? 'frameWallRubPerM3'
      : 'aeratedConcreteRubPerM3';
  const wallUnitPriceRub = unitPrices[wallPriceKey];

  const roofPriceKey: keyof MaterialUnitPrices =
    house.roofCoverId === 'soft_shingles'
      ? 'softShinglesRubPerSqm'
      : house.roofCoverId === 'corrugated'
      ? 'corrugatedRoofRubPerSqm'
      : 'metalTileRubPerSqm';
  const roofCoverUnitPriceRub = unitPrices[roofPriceKey];

  const roofCoverLabel =
    house.roofCoverId === 'soft_shingles'
      ? 'Гибкая черепица'
      : house.roofCoverId === 'corrugated'
      ? 'Профнастил кровельный'
      : 'Металлочерепица';

  const sandGravelQty = Number(sandGravelCushionM3.toFixed(1));

  const items: BOMItem[] = [
    {
      category: 'foundation',
      name: `Товарный бетон М350 (B25 W8) с учетом плиты ${Math.round(fndThick * 1000)} мм${hasBasement ? ', цокольного этажа' : ''} и перекрытий`,
      quantity: foundationConcreteM3,
      unit: 'м³',
      unitPriceRub: unitPrices.concreteRubPerM3,
      priceKey: 'concreteRubPerM3',
      estimatedCostRub: Math.round(foundationConcreteM3 * unitPrices.concreteRubPerM3),
      notes: `Выступ плиты ${Math.round(fndOverhang * 1000)} мм; опалубка ~${Math.round(formworkSqm)} м²`
    },
    {
      category: 'foundation',
      name: 'Арматура рифленая А500С (Ø12 мм рабочая + Ø8 мм хомуты)',
      quantity: foundationRebarKg,
      unit: 'кг',
      unitPriceRub: unitPrices.rebarRubPerKg,
      priceKey: 'rebarRubPerKg',
      estimatedCostRub: Math.round(foundationRebarKg * unitPrices.rebarRubPerKg),
      notes: `${(foundationRebarKg / 1000).toFixed(2)} т стального пространственного каркаса`
    },
    {
      category: 'foundation',
      name: 'Песок мытый и щебень фракции 20–40 (подушка с геотекстилем)',
      quantity: sandGravelQty,
      unit: 'м³',
      unitPriceRub: unitPrices.sandGravelRubPerM3,
      priceKey: 'sandGravelRubPerM3',
      estimatedCostRub: Math.round(sandGravelQty * unitPrices.sandGravelRubPerM3),
      notes: 'С послойной трамбовкой виброплитой каждые 15 см'
    },
    {
      category: 'walls',
      name:
        house.wallMaterialId === 'frame'
          ? 'Пиломатериал сухой строганый и базальтовый утеплитель стен'
          : house.wallMaterialId === 'timber'
          ? 'Домокомплект из профилированного / клееного бруса'
          : `${WALL_MATERIALS_INFO[house.wallMaterialId].name} (стены ${floorsAbove} эт. + перегородки)`,
      quantity: wallBlocksM3,
      unit: 'м³',
      unitPriceRub: wallUnitPriceRub,
      priceKey: wallPriceKey,
      estimatedCostRub: Math.round(wallBlocksM3 * wallUnitPriceRub),
      notes:
        house.wallMaterialId === 'aerated_concrete' || house.wallMaterialId === 'ceramic_block'
          ? `≈ ${wallBlocksCount} шт. блоков + ${glueBagsCount} мешков клея (чистая площадь стен ${energyInfo.netWallAreaSqm} м² за вычетом окон ${energyInfo.windowAreaSqm} м²)`
          : `Чистая площадь фасада за вычетом окон: ${energyInfo.netWallAreaSqm} м²`
    },
    {
      category: 'walls',
      name: 'Фасадное утепление / декоративная штукатурка и армопояс',
      quantity: facadeAreaSqm,
      unit: 'м²',
      unitPriceRub: unitPrices.facadeFinishRubPerSqm,
      priceKey: 'facadeFinishRubPerSqm',
      estimatedCostRub: Math.round(facadeAreaSqm * unitPrices.facadeFinishRubPerSqm),
      notes: `Длина внутренних перегородок: ${partitionLen} п.м.`
    },
    {
      category: 'roof',
      name: `${roofCoverLabel} с запасом +${Math.round((roofMetrics.wasteFactor - 1) * 100)}% на подрезку`,
      quantity: roofCoverAreaWithWasteSqm,
      unit: 'м²',
      unitPriceRub: roofCoverUnitPriceRub,
      priceKey: roofPriceKey,
      estimatedCostRub: Math.round(roofCoverAreaWithWasteSqm * roofCoverUnitPriceRub),
      notes: `Чистая площадь скатов 3D-фигуры: ${roofMetrics.roofAreaSqm} м², угол наклона ${roofMetrics.slopeAngleDeg}°`
    },
    {
      category: 'roof',
      name: 'Пиломатериал камерной сушки (стропила, мауэрлат, обрешетка)',
      quantity: rafterTimberM3,
      unit: 'м³',
      unitPriceRub: unitPrices.rafterTimberRubPerM3,
      priceKey: 'rafterTimberRubPerM3',
      estimatedCostRub: Math.round(rafterTimberM3 * unitPrices.rafterTimberRubPerM3),
      notes: `Паро- и гидроизоляционные мембраны: ${membraneAreaSqm} м²`
    },
    {
      category: 'fence',
      name: `Ограждение участка по периметру (столбы 60×60 шаг 2.5 м + ${fenceLagRows} ряда лаг)`,
      quantity: fencePerimeterM,
      unit: 'п.м.',
      unitPriceRub: unitPrices.fenceRubPerMeter,
      priceKey: 'fenceRubPerMeter',
      estimatedCostRub: Math.round(fencePerimeterM * unitPrices.fenceRubPerMeter),
      notes: `Столбов: ${fencePostsCount} шт., секций/листов: ${fenceSheetsCount} шт.`
    }
  ];

  const totalEstimatedCostRub = items.reduce((sum, item) => sum + item.estimatedCostRub, 0);

  return {
    items,
    unitPrices,
    totalEstimatedCostRub,
    foundationConcreteM3,
    foundationRebarKg,
    wallBlocksM3,
    wallBlocksCount,
    roofCoverAreaWithWasteSqm,
    rafterTimberM3,
    fencePerimeterM,
    fencePostsCount
  };
}

/**
 * Returns true if the object category represents an underground-capable utility or engineering structure.
 */
export function isUndergroundCapableCategory(category: BuildingCategory): boolean {
  return (
    category === 'water_main' ||
    category === 'sewer_main' ||
    category === 'gas_pipe' ||
    category === 'toilet' ||
    category === 'well' ||
    category === 'neighbor_well' ||
    category === 'power_line'
  );
}

/**
 * Returns default normative burial depth (заглубление под землю, м) by category.
 */
export function getDefaultBurialDepth(category: BuildingCategory): number {
  switch (category) {
    case 'water_main':
      return 1.8; // ниже промерзания по СП 31.13330
    case 'sewer_main':
      return 1.2; // СП 32.13330
    case 'gas_pipe':
      return 1.4; // СП 62.13330 (подземный газопровод)
    case 'toilet':
      return 2.0; // камера септика
    case 'well':
    case 'neighbor_well':
      return 4.0; // шахта колодца / кессон скважины
    case 'power_line':
      return 0; // по умолчанию воздушная ЛЭП (0 м), при >0 — подземный бронированный кабель
    default:
      return 0;
  }
}

/**
 * Computes total above-ground wall height H_wall from plinthHeight, floors (1..3), floorHeight, and interfloorSlabThickness,
 * or directly from obj.wallHeight when floorHeight is not explicitly overriding it.
 */
export function computeTotalAboveGroundWallHeight(
  obj: Pick<SiteObject, 'floors' | 'floorHeight' | 'interfloorSlabThickness' | 'plinthHeight' | 'wallHeight'>
): number {
  const floorsAbove = Math.max(1, Math.min(3, Math.round(obj.floors || 1)));
  if (obj.floorHeight !== undefined) {
    const floorH = obj.floorHeight;
    const slabThick = obj.interfloorSlabThickness ?? 0.22;
    const plinthH = obj.plinthHeight ?? 0.45;
    return roundToMm(plinthH + floorsAbove * floorH + Math.max(0, floorsAbove - 1) * slabThick);
  }
  if (typeof obj.wallHeight === 'number' && obj.wallHeight > 0) {
    return roundToMm(obj.wallHeight);
  }
  const floorH = 3.0;
  const slabThick = obj.interfloorSlabThickness ?? 0.22;
  const plinthH = obj.plinthHeight ?? 0.45;
  return roundToMm(plinthH + floorsAbove * floorH + Math.max(0, floorsAbove - 1) * slabThick);
}

/**
 * Calculates the house Energy Efficiency Class (A++ .. E per СП 50.13330.2012)
 * and annual/monthly heating costs for Electricity (кВт·ч), Natural Gas (м³), and Firewood (м³).
 * Explicitly subtracts window area from gross wall area and calculates window heat losses separately.
 */
export function calculateEnergyAndHeating(
  house: SiteObject,
  plot: PlotConfig,
  tariffsOverride?: Partial<HeatingTariffsConfig>
): EnergyAndHeatingResult {
  const region = getEffectivePlotRegion(plot);
  const tariffs: HeatingTariffsConfig = {
    electricityRubPerKwh: tariffsOverride?.electricityRubPerKwh ?? plot.heatingTariffs?.electricityRubPerKwh ?? 6.5,
    gasRubPerM3: tariffsOverride?.gasRubPerM3 ?? plot.heatingTariffs?.gasRubPerM3 ?? 7.5,
    firewoodRubPerM3: tariffsOverride?.firewoodRubPerM3 ?? plot.heatingTariffs?.firewoodRubPerM3 ?? 3200
  };

  const floorsAbove = Math.max(1, Math.min(3, Math.round(house.floors || 1)));
  const floorH = house.floorHeight ?? 3.0;
  const slabThick = house.interfloorSlabThickness ?? 0.22;
  const plinthH = house.plinthHeight ?? 0.45;
  const hasBasement = Boolean(house.hasBasement);
  const basementDepth = hasBasement ? (house.basementDepth ?? 2.5) : 0;
  const fndSlabThick = house.foundationSlabThickness ?? 0.3;

  // Footprint area & perimeter (supporting rectangle, l_shape, t_shape, chamfered)
  const localPoly = getLocalObjectFootprintPolygon(house, false);
  const footprintArea = Math.max(4, calculatePolygonArea(localPoly) || house.width * house.length);
  const perimeter = Math.max(8, calculatePolygonPerimeter(localPoly) || 2 * (house.width + house.length));

  const totalHeatedFloors = floorsAbove + (hasBasement ? 1 : 0);
  const heatedFloorAreaSqm = Number((footprintArea * totalHeatedFloors).toFixed(1));

  // Above-ground wall area (excluding plinth, which is accounted separately)
  const netWallElevationH = floorsAbove * floorH + Math.max(0, floorsAbove - 1) * slabThick;
  const grossWallAreaSqm = Number((perimeter * netWallElevationH).toFixed(2));

  // Window / Glazing area: compute from configured facade windows per floor
  const wins = getObjectWindowsConfig(house);
  const windowsPerFloorCount = (wins.south || 0) + (wins.north || 0) + (wins.east || 0) + (wins.west || 0);
  const singleWinArea = (wins.windowWidth ?? 1.4) * (wins.windowHeight ?? 1.4);
  const configuredWindowsArea = windowsPerFloorCount * singleWinArea * floorsAbove;
  const fallbackGlazingArea = grossWallAreaSqm * (house.glazingRatio || 0.15);

  const rawWindowArea = configuredWindowsArea > 0 ? configuredWindowsArea : fallbackGlazingArea;
  const windowAreaSqm = Number(Math.min(grossWallAreaSqm * 0.75, Math.max(0, rawWindowArea)).toFixed(2));

  // Strictly subtract windows from gross wall area!
  const netWallAreaSqm = Number(Math.max(0, grossWallAreaSqm - windowAreaSqm).toFixed(2));

  const plinthAreaSqm = Number((perimeter * plinthH).toFixed(2));
  const basementWallAreaSqm = hasBasement ? Number((perimeter * basementDepth).toFixed(2)) : 0;
  const roofMetrics = calculateRoofGeometryMetrics(house);
  const roofInsulationAreaSqm = Number(footprintArea.toFixed(1));

  // Thermal resistance R (м²·°С/Вт) by base wall material + external wall insulation
  const wallRByMat: Record<SiteObject['wallMaterialId'], number> = {
    frame: 4.35, // Каркас с базальтовым утеплением 200+50 мм
    aerated_concrete: 3.55, // Газобетон D400 375-400 мм
    ceramic_block: 3.30, // Керамический блок
    timber: 1.95 // Профилированный / клееный брус 200 мм без доп. утепления
  };
  const baseWallRValue = wallRByMat[house.wallMaterialId] || 3.55;
  const wallInsulationId = getEffectiveWallInsulationId(house);
  const wallInsInfo = WALL_INSULATION_INFO[wallInsulationId] || WALL_INSULATION_INFO.none;
  const wallInsulationBonusR = wallInsInfo.bonusRValue;
  const wallRValue = Number((baseWallRValue + wallInsulationBonusR).toFixed(2));

  // Window thermal resistance R by selected window profile & glazing type
  const windowTypeId = getEffectiveWindowTypeId(house);
  const winTypeInfo = WINDOW_TYPES_INFO[windowTypeId] || WINDOW_TYPES_INFO.pvc_double_chamber;
  const windowRValue = winTypeInfo.rValue;

  // Roof thermal resistance R by selected roof insulation assembly
  const roofInsulationId = getEffectiveRoofInsulationId(house);
  const roofInsInfo = ROOF_INSULATION_INFO[roofInsulationId] || ROOF_INSULATION_INFO.mineral_wool_200_50;
  const roofRValue = roofInsInfo.rValue;

  const slabFloorRValue = Number((2.8 + fndSlabThick * 2.5).toFixed(2));
  const basementWallEffectiveR = 3.4; // с учетом сопротивления грунта

  const requiredWallRValue = region.rReqWall;
  const requiredRoofRValue = Number((region.rReqWall * 1.32).toFixed(2));
  const requiredWindowRValue = Number((region.gsop >= 6000 ? 0.65 : region.gsop >= 4000 ? 0.54 : 0.45).toFixed(2));

  // Degree-hours of the heating season = GSOP * 24 / 1000 (kWh * m²·°C / W)
  const degreeHoursFactor = (region.gsop * 24) / 1000;

  // Heat losses by component (kWh / year)
  const annualHeatLossWallsKwh = Math.round(
    (netWallAreaSqm / wallRValue + plinthAreaSqm / (wallRValue * 0.9)) * degreeHoursFactor
  );
  const annualHeatLossWindowsKwh = Math.round((windowAreaSqm / windowRValue) * degreeHoursFactor);
  const annualHeatLossRoofKwh = Math.round((roofInsulationAreaSqm / roofRValue) * degreeHoursFactor);
  const annualHeatLossFloorKwh = Math.round(
    (footprintArea / slabFloorRValue +
      (hasBasement ? (basementWallAreaSqm * 0.55) / basementWallEffectiveR : 0)) *
      degreeHoursFactor
  );
  const annualHeatLossRoofAndFloorKwh = annualHeatLossRoofKwh + annualHeatLossFloorKwh;

  // Ventilation & infiltration heat loss (~0.35 air changes/h with natural/recuperated ventilation)
  const heatedVolumeM3 = footprintArea * (floorsAbove * floorH + (hasBasement ? basementDepth : 0));
  const annualHeatLossVentilationKwh = Math.round(heatedVolumeM3 * 0.34 * 0.38 * degreeHoursFactor);

  const totalAnnualHeatEnergyKwh =
    annualHeatLossWallsKwh +
    annualHeatLossWindowsKwh +
    annualHeatLossRoofAndFloorKwh +
    annualHeatLossVentilationKwh;

  const specificHeatLossPerSqmKwh = Number((totalAnnualHeatEnergyKwh / Math.max(1, heatedFloorAreaSqm)).toFixed(1));

  // Normalize against regional GSOP to classify Energy Efficiency Class per СП 50.13330.2012 Табл. 15
  // Normative baseline specific heat demand for individual houses in this GSOP ~ (region.gsop * 0.032) kWh/(m²·year)
  const normativeSpecificKwh = Math.max(75, (region.gsop / 4550) * 145);
  const ratioToNorm = specificHeatLossPerSqmKwh / normativeSpecificKwh;

  let energyClass: EnergyEfficiencyClass = 'B';
  let energyClassLabel = 'Высокий (B)';
  let energyClassColor = '#34d399';

  if (ratioToNorm <= 0.55) {
    energyClass = 'A++';
    energyClassLabel = 'Наивысший энергоэффективный (A++)';
    energyClassColor = '#10b981';
  } else if (ratioToNorm <= 0.68) {
    energyClass = 'A+';
    energyClassLabel = 'Очень высокий (A+)';
    energyClassColor = '#10b981';
  } else if (ratioToNorm <= 0.82) {
    energyClass = 'A';
    energyClassLabel = 'Высокий (A)';
    energyClassColor = '#22c55e';
  } else if (ratioToNorm <= 0.98) {
    energyClass = 'B';
    energyClassLabel = 'Повышенный (B)';
    energyClassColor = '#38bdf8';
  } else if (ratioToNorm <= 1.15) {
    energyClass = 'C';
    energyClassLabel = 'Нормальный базовый (C)';
    energyClassColor = '#facc15';
  } else if (ratioToNorm <= 1.38) {
    energyClass = 'D';
    energyClassLabel = 'Пониженный — повышенные теплопотери (D)';
    energyClassColor = '#f97316';
  } else {
    energyClass = 'E';
    energyClassLabel = 'Низкий — требуется утепление (E)';
    energyClassColor = '#ef4444';
  }

  const heatingSeasonDays = Math.min(280, Math.max(120, Math.round(region.gsop / 21)));
  const heatingSeasonMonths = Math.max(4, Number((heatingSeasonDays / 30).toFixed(1)));

  // 1. Electricity (КПД электрокотла 99%)
  const elecKwh = Math.round(totalAnnualHeatEnergyKwh / 0.99);
  const elecAnnualRub = Math.round(elecKwh * tariffs.electricityRubPerKwh);
  const elecMonthlyRub = Math.round(elecAnnualRub / heatingSeasonMonths);

  // 2. Natural Gas (теплотворная способность 9.3 кВт·ч/м³, КПД газового котла 92% => ~8.55 кВт·ч/м³)
  const gasM3 = Math.round(totalAnnualHeatEnergyKwh / 8.55);
  const gasAnnualRub = Math.round(gasM3 * tariffs.gasRubPerM3);
  const gasMonthlyRub = Math.round(gasAnnualRub / heatingSeasonMonths);

  // 3. Firewood (березовые сухие дрова ~1800 кВт·ч/складочный м³, КПД ТТ-котла/печи 75% => ~1350 кВт·ч/м³)
  const woodM3 = Number((totalAnnualHeatEnergyKwh / 1350).toFixed(1));
  const woodAnnualRub = Math.round(woodM3 * tariffs.firewoodRubPerM3);
  const woodMonthlyRub = Math.round(woodAnnualRub / heatingSeasonMonths);

  return {
    energyClass,
    energyClassLabel,
    energyClassColor,
    specificHeatLossPerSqmKwh,
    heatedFloorAreaSqm,
    aboveGroundFloors: floorsAbove,
    hasBasement,
    grossWallAreaSqm,
    windowAreaSqm,
    netWallAreaSqm,
    plinthAreaSqm,
    basementWallAreaSqm,
    roofInsulationAreaSqm: roofMetrics.roofAreaSqm,
    windowTypeId,
    windowTypeName: winTypeInfo.shortName,
    wallInsulationId,
    wallInsulationName: wallInsInfo.shortName,
    roofInsulationId,
    roofInsulationName: roofInsInfo.shortName,
    baseWallRValue,
    wallInsulationBonusR,
    wallRValue,
    windowRValue,
    roofRValue,
    requiredWallRValue,
    requiredRoofRValue,
    requiredWindowRValue,
    annualHeatLossWallsKwh,
    annualHeatLossWindowsKwh,
    annualHeatLossRoofKwh,
    annualHeatLossFloorKwh,
    annualHeatLossRoofAndFloorKwh,
    annualHeatLossVentilationKwh,
    totalAnnualHeatEnergyKwh,
    heatingSeasonDays,
    electricity: {
      tariffRubPerKwh: tariffs.electricityRubPerKwh,
      annualConsumptionKwh: elecKwh,
      annualCostRub: elecAnnualRub,
      monthlySeasonCostRub: elecMonthlyRub
    },
    gas: {
      tariffRubPerM3: tariffs.gasRubPerM3,
      annualConsumptionM3: gasM3,
      annualCostRub: gasAnnualRub,
      monthlySeasonCostRub: gasMonthlyRub
    },
    firewood: {
      tariffRubPerM3: tariffs.firewoodRubPerM3,
      annualConsumptionM3: woodM3,
      annualCostRub: woodAnnualRub,
      monthlySeasonCostRub: woodMonthlyRub
    }
  };
}

/**
 * Evaluates all configured house, foundation, basement, energy, and underground utility parameters
 * and generates engineering recommendations when chosen parameters are non-optimal.
 */
export function generateParameterRecommendations(
  selectedObj: SiteObject | undefined,
  plot: PlotConfig,
  allObjects: SiteObject[]
): ParameterRecommendation[] {
  const recs: ParameterRecommendation[] = [];
  const region = getEffectivePlotRegion(plot);
  const house =
    selectedObj && (selectedObj.category === 'house' || selectedObj.category === 'bathhouse')
      ? selectedObj
      : allObjects.find((o) => o.category === 'house');

  if (house) {
    const floorsAbove = Math.max(1, Math.min(3, Math.round(house.floors || 1)));
    const floorH = house.floorHeight ?? 3.0;
    const slabThick = house.interfloorSlabThickness ?? 0.22;
    const plinthH = house.plinthHeight ?? 0.45;
    const hasBasement = Boolean(house.hasBasement);
    const basementDepth = house.basementDepth ?? 2.5;
    const fndSlabOverhang = house.foundationSlabOverhang ?? 0.2;
    const fndSlabThick = house.foundationSlabThickness ?? 0.3;
    const energy = calculateEnergyAndHeating(house, plot);

    // 1. Floor height check (СП 55.13330.2016 п. 4.4)
    if (floorH < 2.5) {
      recs.push({
        id: 'rec-floor-height-low',
        severity: 'critical',
        category: 'floors',
        title: `Малая высота этажа (${formatMetersMm(floorH)} м < 2.5 м)`,
        normCode: 'СП 55.13330.2016 п. 4.4',
        currentValueText: `${formatMetersMm(floorH)} м`,
        recommendedValueText: '2.70 – 3.10 м',
        advice:
          'По СП 55.13330.2016 высота жилых комнат и кухни от пола до потолка должна быть не менее 2.5 м (в климатических подрайонах IA, IБ, IГ, IД, IIA — не менее 2.7 м). Увеличьте высоту этажа минимум до 2.7 м.'
      });
    } else if (floorH > 3.6) {
      recs.push({
        id: 'rec-floor-height-high',
        severity: 'warning',
        category: 'floors',
        title: `Избыточная высота этажей (${formatMetersMm(floorH)} м)`,
        normCode: 'СП 50.13330.2012 (Энергосбережение)',
        currentValueText: `${formatMetersMm(floorH)} м`,
        recommendedValueText: '2.80 – 3.20 м',
        advice:
          'Высота этажа свыше 3.6 м увеличивает отапливаемый объем и площадь наружных стен на 25–35%, а также требует удлинения межэтажных лестничных маршей.'
      });
    }

    // 2. Interfloor slab thickness check (СП 63.13330.2018)
    const minSpan = Math.min(house.width, house.length);
    if (floorsAbove > 1 && slabThick < 0.18) {
      recs.push({
        id: 'rec-interfloor-thin',
        severity: 'warning',
        category: 'floors',
        title: `Тонкое межэтажное перекрытие (${Math.round(slabThick * 1000)} мм)`,
        normCode: 'СП 63.13330.2018 / СП 51.13330 (Звукоизоляция)',
        currentValueText: `${Math.round(slabThick * 1000)} мм`,
        recommendedValueText: '200 – 250 мм',
        advice: `При пролете ${formatMetersMm(minSpan)} м перекрытие тоньше 180 мм склонно к зыбкости (прогибам) и плохо изолирует ударный шум. Рекомендуется монолитная плита 200–220 мм или балки 200 мм с акустической минватой.`
      });
    } else if (floorsAbove > 1 && slabThick > 0.32) {
      recs.push({
        id: 'rec-interfloor-thick',
        severity: 'warning',
        category: 'floors',
        title: `Перетяжеленное перекрытие (${Math.round(slabThick * 1000)} мм)`,
        normCode: 'СП 20.13330.2016',
        currentValueText: `${Math.round(slabThick * 1000)} мм`,
        recommendedValueText: '200 – 250 мм',
        advice:
          'Толщина межэтажного перекрытия свыше 320 мм создает избыточную постоянную нагрузку на стены и фундамент без прироста полезной несущей способности в ИЖС.'
      });
    }

    // 3. Basement checks (СП 55.13330 / СП 22.13330 / СП 402.1325800)
    if (hasBasement) {
      if (basementDepth < 2.0) {
        recs.push({
          id: 'rec-basement-shallow',
          severity: 'warning',
          category: 'basement',
          title: `Недостаточная глубина подземного этажа (${formatMetersMm(basementDepth)} м)`,
          normCode: 'СП 402.1325800.2018 п. 5.1',
          currentValueText: `${formatMetersMm(basementDepth)} м`,
          recommendedValueText: '2.20 – 2.70 м',
          advice:
            'Для размещения газовой котельной в цокольном/подвальном этаже требуется высота помещения в чистоте не менее 2.0–2.2 м (и объем от 15 м³). При меньшей глубине этаж пригоден только как техническое подполье.'
        });
      } else if (basementDepth > 3.2) {
        recs.push({
          id: 'rec-basement-deep',
          severity: 'warning',
          category: 'basement',
          title: `Большое заглубление подвала (${formatMetersMm(basementDepth)} м)`,
          normCode: 'СП 22.13330.2016',
          currentValueText: `${formatMetersMm(basementDepth)} м`,
          recommendedValueText: '2.40 – 2.80 м',
          advice:
            'Заглубление более 3.2 м резко увеличивает боковое гидростатическое давление грунта и грунтовых вод на стены подвала — требуется монолитный ЖБ контур от 300 мм и пристенный дренаж.'
        });
      }
      if (plot.soilTypeId === 'peat') {
        recs.push({
          id: 'rec-basement-peat',
          severity: 'critical',
          category: 'basement',
          title: 'Подземный этаж на торфянике / слабонесущем грунте',
          normCode: 'СП 22.13330.2016',
          currentValueText: 'Подвал на торфянике',
          recommendedValueText: 'Надземный тех. этаж без подвала',
          advice:
            'На торфяниках и плывунах высокий уровень грунтовых вод создает выталкивающую силу Архимеда и риск затопления подвала. Рекомендуется отказаться от подземного этажа или выполнить полную выемку торфа с кессонной гидроизоляцией.'
        });
      }
    }

    // 4. Plinth height check vs snow zone (СП 50.13330 / СП 70.13330)
    const minRecommendedPlinth = region.snowZone >= 4 ? 0.45 : 0.35;
    if (plinthH < minRecommendedPlinth) {
      recs.push({
        id: 'rec-plinth-low',
        severity: 'warning',
        category: 'plinth',
        title: `Низкий цоколь (${Math.round(plinthH * 1000)} мм) для ${region.snowZone}-го снегового района`,
        normCode: 'СП 55.13330 / Защита стен от увлажнения',
        currentValueText: `${Math.round(plinthH * 1000)} мм`,
        recommendedValueText: `${Math.round(minRecommendedPlinth * 1000)} – 600 мм`,
        advice: `В регионе «${region.name}» высота снежного покрова превышает ${Math.round(plinthH * 100)} см. Низкий цоколь приведет к намоканию нижнего ряда стеновых блоков/бруса при таянии снега.`
      });
    }

    // 5. Foundation slab thickness & overhang checks (СП 63.13330 / СП 22.13330)
    const minRecommendedSlabThick = floorsAbove >= 3 || hasBasement ? 0.30 : floorsAbove === 2 ? 0.25 : 0.20;
    if (fndSlabThick < minRecommendedSlabThick) {
      recs.push({
        id: 'rec-fnd-slab-thin',
        severity: 'critical',
        category: 'slab',
        title: `Недостаточная толщина плиты фундамента (${Math.round(fndSlabThick * 1000)} мм)`,
        normCode: 'СП 63.13330.2018 (Расчет на продавливание)',
        currentValueText: `${Math.round(fndSlabThick * 1000)} мм`,
        recommendedValueText: `${Math.round(minRecommendedSlabThick * 1000)} – 350 мм`,
        advice: `Для ${floorsAbove}-этажного дома${hasBasement ? ' с подземным этажом' : ''} плита тоньше ${Math.round(minRecommendedSlabThick * 1000)} мм не обеспечивает жесткость на изгиб и продавливание под несущими стенами.`
      });
    }
    if (fndSlabOverhang < 0.1 && floorsAbove >= 2) {
      recs.push({
        id: 'rec-fnd-overhang-small',
        severity: 'warning',
        category: 'slab',
        title: `Малый выступ плиты фундамента (${Math.round(fndSlabOverhang * 1000)} мм)`,
        normCode: 'СП 22.13330.2016',
        currentValueText: `${Math.round(fndSlabOverhang * 1000)} мм`,
        recommendedValueText: '150 – 300 мм',
        advice:
          'Консольный выступ плиты 150–300 мм за грань стены снижает краевое давление на грунт, предотвращает сползание облицовки цоколя и служит опорой для утеплителя.'
      });
    } else if (fndSlabOverhang > 0.6) {
      recs.push({
        id: 'rec-fnd-overhang-large',
        severity: 'warning',
        category: 'slab',
        title: `Избыточный выступ плиты фундамента (${Math.round(fndSlabOverhang * 1000)} мм)`,
        normCode: 'СП 63.13330.2018',
        currentValueText: `${Math.round(fndSlabOverhang * 1000)} мм`,
        recommendedValueText: '150 – 350 мм',
        advice:
          'Выступ плиты более 600 мм работает как длинная консоль под отпор грунта и ведет к перерасходу бетона М350 и арматуры.'
      });
    }

    // 6. Wall material, Roof insulation & Window glazing thermal efficiency checks (СП 50.13330.2012)
    if (energy.wallRValue < region.rReqWall) {
      recs.push({
        id: 'rec-wall-r-low',
        severity: 'warning',
        category: 'energy',
        title: `Теплосопротивление стен ниже нормы региона (R = ${energy.wallRValue} < ${region.rReqWall})`,
        normCode: 'СП 50.13330.2012 Табл. 3',
        currentValueText: `R = ${energy.wallRValue} (${energy.wallInsulationName})`,
        recommendedValueText: `R ≥ ${region.rReqWall} м²·°С/Вт`,
        advice: `Выбранный материал стен (${WALL_MATERIALS_INFO[house.wallMaterialId].name}) и утепление (${energy.wallInsulationName}) уступают норме региона «${region.name}». Выберите фасадное утепление минватой 100–150 мм или плитами PIR 80 мм.`
      });
    }
    if (energy.roofRValue < energy.requiredRoofRValue) {
      recs.push({
        id: 'rec-roof-r-low',
        severity: energy.roofInsulationId === 'none' ? 'critical' : 'warning',
        category: 'energy',
        title: `Недостаточное утепление крыши (R = ${energy.roofRValue} < ${energy.requiredRoofRValue})`,
        normCode: 'СП 50.13330.2012 Табл. 3 (Покрытия и мансарды)',
        currentValueText: `${energy.roofInsulationName} (R = ${energy.roofRValue})`,
        recommendedValueText: `R ≥ ${energy.requiredRoofRValue} м²·°С/Вт (Минвата 200+50 мм / PIR)`,
        advice: `Теплопотери через кровлю составляют ${energy.annualHeatLossRoofKwh} кВт·ч/год. Для региона «${region.name}» рекомендуется утепление крыши минватой 200+50 мм с перекрестным контр-утеплением, эковатой 250 мм или ППУ/PIR.`
      });
    }
    if (energy.windowRValue < energy.requiredWindowRValue) {
      recs.push({
        id: 'rec-window-r-low',
        severity: energy.windowTypeId === 'wood_single_glass' ? 'critical' : 'warning',
        category: 'energy',
        title: `Высокие теплопотери через окна (${energy.windowTypeName}, R = ${energy.windowRValue})`,
        normCode: 'СП 50.13330.2012 / ГОСТ 30674',
        currentValueText: `${energy.windowTypeName} (R = ${energy.windowRValue})`,
        recommendedValueText: `R ≥ ${energy.requiredWindowRValue} м²·°С/Вт (ПВХ + двойной стеклопакет)`,
        advice: `Окна «${energy.windowTypeName}» теряют ${energy.annualHeatLossWindowsKwh} кВт·ч/год. Для круглогодичного проживания установите ПВХ-профиль с двухкамерным энергосберегающим стеклопакетом (R = 0.78 м²·°С/Вт).`
      });
    }
    const glazingShare = energy.grossWallAreaSqm > 0 ? energy.windowAreaSqm / energy.grossWallAreaSqm : 0;
    if (glazingShare > 0.35) {
      recs.push({
        id: 'rec-glazing-excess',
        severity: 'warning',
        category: 'energy',
        title: `Высокая доля остекления фасадов (${Math.round(glazingShare * 100)}% площади стен)`,
        normCode: 'СП 50.13330.2012 п. 5.2',
        currentValueText: `${energy.windowAreaSqm} м² из ${energy.grossWallAreaSqm} м²`,
        recommendedValueText: '15% – 25% площади стен',
        advice:
          'Даже энергоэффективное окно теряет в 5 раз больше тепла, чем глухая стена. При панорамном остеклении свыше 35% используйте двухкамерные энергосберегающие стеклопакеты и внутрипольные конвекторы.'
      });
    }
  }

  // 7. Underground utilities burial depth recommendations (СП 31.13330, СП 32.13330, СП 62.13330)
  for (const obj of allObjects) {
    if (!isUndergroundCapableCategory(obj.category)) continue;
    const depth = obj.burialDepth ?? getDefaultBurialDepth(obj.category);

    if (obj.category === 'water_main') {
      const reqWaterDepth = roundToMm(region.frostDepth + 0.3);
      if (depth < region.frostDepth) {
        recs.push({
          id: `rec-utility-water-${obj.id}`,
          severity: 'critical',
          category: 'utilities',
          title: `Водопровод «${obj.name}» выше глубины промерзания (${formatMetersMm(depth)} м < ${region.frostDepth} м)`,
          normCode: 'СП 31.13330.2021 п. 11.40',
          currentValueText: `Заглубление ${formatMetersMm(depth)} м`,
          recommendedValueText: `≥ ${formatMetersMm(reqWaterDepth)} м (ниже промерзания)`,
          advice: `В регионе «${region.name}» глубина промерзания составляет ${region.frostDepth} м. По СП 31.13330 низ трубы водопровода должен лежать на 0.3–0.5 м ниже промерзания (${formatMetersMm(reqWaterDepth)} м), иначе труба перемерзнет зимой!`
        });
      }
    } else if (obj.category === 'sewer_main') {
      const minSewerDepth = roundToMm(Math.max(0.7, region.frostDepth - 0.3));
      if (depth < minSewerDepth) {
        recs.push({
          id: `rec-utility-sewer-${obj.id}`,
          severity: 'warning',
          category: 'utilities',
          title: `Малое заглубление канализации «${obj.name}» (${formatMetersMm(depth)} м)`,
          normCode: 'СП 32.13330.2018 п. 6.2.4',
          currentValueText: `Заглубление ${formatMetersMm(depth)} м`,
          recommendedValueText: `${formatMetersMm(minSewerDepth)} – ${formatMetersMm(region.frostDepth)} м`,
          advice: `При заглублении менее ${formatMetersMm(minSewerDepth)} м самотечная канализация Ø110 мм требует обязательного утепления скорлупой ЭППС и соблюдения уклона 2 см на 1 метр.`
        });
      }
    } else if (obj.category === 'gas_pipe' && depth > 0 && depth < 0.8) {
      recs.push({
        id: `rec-utility-gas-${obj.id}`,
        severity: 'critical',
        category: 'utilities',
        title: `Недостаточное заглубление газопровода «${obj.name}» (${formatMetersMm(depth)} м < 0.8 м)`,
        normCode: 'СП 62.13330.2011 п. 5.2.1',
        currentValueText: `Заглубление ${formatMetersMm(depth)} м`,
        recommendedValueText: '0.80 – 1.50 м',
        advice:
          'Подземные полиэтиленовые и стальные газопроводы должны укладываться на глубину не менее 0.8 м до верха трубы (а при пучинистых грунтах — не менее 0.9–1.2 м) с сигнальной желтой лентой.'
      });
    }
  }

  return recs;
}

export interface BaseFieldDimensions {
  multiplier: number;
  standardWidth: number;
  standardLength: number;
  fieldWidth: number;
  fieldLength: number;
  autoExpanded: boolean;
}

/**
 * Calculates the surrounding base field dimensions:
 * By default 4 times wider (plot.width * 4) and 4 times longer (plot.length * 4) than the plot,
 * and automatically expands further if any external object or protective buffer extends beyond 4x.
 */
export function calculateBaseFieldDimensions(
  plot: Pick<PlotConfig, 'width' | 'length' | 'baseFieldMultiplier'>,
  objects: Array<Pick<SiteObject, 'x' | 'z' | 'width' | 'length'>> = []
): BaseFieldDimensions {
  const multiplier = Math.max(2, plot.baseFieldMultiplier ?? 4);
  const standardWidth = roundToMm(Math.max(24, plot.width * multiplier));
  const standardLength = roundToMm(Math.max(24, plot.length * multiplier));

  let reqHalfW = standardWidth / 2;
  let reqHalfL = standardLength / 2;
  let autoExpanded = false;

  for (const obj of objects) {
    const extX = Math.abs(obj.x) + obj.width / 2 + 16;
    const extZ = Math.abs(obj.z) + obj.length / 2 + 16;
    if (extX > reqHalfW) {
      reqHalfW = extX;
      autoExpanded = true;
    }
    if (extZ > reqHalfL) {
      reqHalfL = extZ;
      autoExpanded = true;
    }
  }

  return {
    multiplier,
    standardWidth,
    standardLength,
    fieldWidth: roundToMm(reqHalfW * 2),
    fieldLength: roundToMm(reqHalfL * 2),
    autoExpanded
  };
}

export type LegalDocumentType = 'combined' | 'elimination_demand' | 'pretrial_claim';

export interface LegalClaimOptions {
  docType?: LegalDocumentType;
  claimantFullName?: string;
  claimantCadastral?: string;
  claimantAddress?: string;
  respondentFullName?: string;
  respondentCadastral?: string;
  respondentAddress?: string;
  deadlineDays?: number;
  selectedViolationIds?: string[];
}

/**
 * Generates an official Russian legal document:
 * - 'elimination_demand': ТРЕБОВАНИЕ ОБ УСТРАНЕНИИ НАРУШЕНИЙ (в Правление СНТ / Администрацию / соседу)
 * - 'pretrial_claim': ДОСУДЕБНАЯ ПРЕТЕНЗИЯ (в порядке ст. 304, 222 ГК РФ перед подачей негаторного иска в суд)
 * - 'combined': ДОСУДЕБНОЕ ТРЕБОВАНИЕ (ПРЕТЕНЗИЯ В ПОРЯДКЕ СТ. 304 ГК РФ)
 */
export function generateLegalClaimDocument(
  plot: PlotConfig,
  objects: SiteObject[],
  violations: NormViolation[],
  opts: LegalClaimOptions = {}
): string {
  const docType: LegalDocumentType = opts.docType || 'combined';
  const region = getEffectivePlotRegion(plot);
  const claimantName = opts.claimantFullName?.trim() || 'Иванов Иван Иванович';
  const claimantCad = opts.claimantCadastral?.trim() || '50:21:0040112:418';
  const claimantAddr =
    opts.claimantAddress?.trim() || `${region.name}, СНТ/ИЖС «Солнечный», уч. № 14`;

  const respondentName = opts.respondentFullName?.trim() || 'Петров Петр Петрович';
  const respondentCad = opts.respondentCadastral?.trim() || '50:21:0040112:419';
  const respondentAddr =
    opts.respondentAddress?.trim() || `${region.name}, СНТ/ИЖС «Солнечный», смежный уч. № 15`;

  const deadlineDays = opts.deadlineDays && opts.deadlineDays > 0 ? opts.deadlineDays : 30;
  const dateStr = new Date().toLocaleDateString('ru-RU');

  const filteredViolations =
    opts.selectedViolationIds && opts.selectedViolationIds.length > 0
      ? violations.filter((v) => opts.selectedViolationIds!.includes(v.id))
      : violations;

  const activeList =
    filteredViolations.length > 0
      ? filteredViolations
      : [
          {
            id: 'sample-setback',
            severity: 'error' as const,
            code: 'СП 53.13330.2019 п. 6.7 / ГК РФ ст. 304',
            title: 'Нарушение минимального отступа строения и параметров ограждения от смежной границы',
            description:
              'Фактическое размещение объектов капитального строительства / хозяйственных построек и (или) сплошного ограждения осуществлено с нарушением нормативных отступов от межевой границы.',
            recommendation:
              'Привести расстояние от построек до межи в соответствие с нормативом (не менее 3.0 м для жилого дома, 1.0 м для хозпостроек со скатом крыши на свой участок) и заменить глухое ограждение на светопрозрачное высотой до 1.8 м.',
            measuredValue: 1.5,
            requiredValue: 3.0
          }
        ];

  const violationsBlock = activeList
    .map((v, idx) => {
      const obj = v.objectId ? objects.find((o) => o.id === v.objectId) : undefined;
      const objInfo = obj
        ? ` (объект: «${obj.name}», габариты ${formatMetersMm(obj.width)}×${formatMetersMm(obj.length)} м, высота стен ${formatMetersMm(obj.wallHeight)} м, поворот ${obj.rotation}°)`
        : '';
      const metricsInfo =
        v.measuredValue !== undefined && v.requiredValue !== undefined
          ? `\n   — Фактическое значение: ${formatMetersMm(v.measuredValue)} м при допустимом по закону нормативе: ${formatMetersMm(v.requiredValue)} м.`
          : '';
      return `${idx + 1}. ${v.title}${objInfo}
   — Нарушенный нормативный акт РФ: ${v.code}
   — Существо нарушения: ${v.description}${metricsInfo}
   — Требуемое действие по устранению: ${v.recommendation}`;
    })
    .join('\n\n');

  const headerTitle =
    docType === 'elimination_demand'
      ? `          Т Р Е Б О В А Н И Е   О Б   У С Т Р А Н Е Н И И   Н А Р У Ш Е Н И Й
   градостроительных, строительных, противопожарных и санитарно-бытовых норм РФ
            при размещении строений, сооружений и межевых ограждений`
      : docType === 'pretrial_claim'
      ? `                  Д О С У Д Е Б Н А Я   П Р Е Т Е Н З И Я
         (ДОСУДЕБНОЕ ТРЕБОВАНИЕ В ПОРЯДКЕ СТ. 304, 222, 263 ГК РФ)
   об устранении препятствий в пользовании земельным участком и приведении
     размещения строений и заборов в соответствие с законодательством РФ`
      : `                          Т Р Е Б О В А Н И Е
            (ДОСУДЕБНАЯ ПРЕТЕНЗИЯ В ПОРЯДКЕ СТ. 304 ГК РФ)
   об устранении нарушений градостроительных, строительных, противопожарных
       и санитарно-бытовых норм Российской Федерации при размещении
                строений, сооружений и межевых ограждений`;

  return `КОМУ (Правообладателю смежного земельного участка / застройщику):
ФИО: ${respondentName}
Кадастровый номер участка: ${respondentCad}
Адрес: ${respondentAddr}
Копия: В Правление СНТ / Отдел муниципального земельного контроля Администрации

ОТ КОГО (Заявитель / Правообладатель земельного участка):
ФИО: ${claimantName}
Кадастровый номер участка: ${claimantCad}
Адрес: ${claimantAddr}
Категория земель: ${plot.category === 'IZHS' ? 'Земли населенных пунктов (ИЖС / ЛПХ)' : 'Ведение садоводства (СНТ)'}
Геокоординаты участка: ${region.lat.toFixed(5)}° с.ш., ${region.lng.toFixed(5)}° в.д. (${region.name})

================================================================================
${headerTitle}
================================================================================

Уважаемый(ая) ${respondentName}!

Я, ${claimantName}, являюсь законным собственником земельного участка с кадастровым номером ${claimantCad} (габариты по генплану ${formatMetersMm(plot.width)}×${formatMetersMm(plot.length)} м), расположенного по адресу: ${claimantAddr}.

В ходе проведения инструментального геодезического и градостроительного обследования границ и застройки в системе «ГенПлан-Эксперт РФ 3D» выявлены следующие нарушения обязательных требований законодательства РФ при размещении строений, линейных объектов и (или) ограждений:

${violationsBlock}

ПРАВОВОЕ ОБОСНОВАНИЕ ТРЕБОВАНИЙ:
1. Согласно ст. 304 Гражданского кодекса РФ (ГК РФ), собственник может требовать устранения всяких нарушений его права, хотя бы эти нарушения и не были соединены с лишением владения (негаторный иск).
2. В соответствии с п. 1 ст. 263 ГК РФ, ст. 222 ГК РФ и ст. 40, 42 Земельного кодекса РФ, собственник земельного участка обязан возводить здания, строения и сооружения с соблюдением градостроительных, строительных, экологических, санитарно-гигиенических и противопожарных норм и правил.
3. Согласно СП 53.13330.2019 «Планировка и застройка территории ведения гражданами садоводства. Здания и сооружения» (п. 6.2, 6.7, 6.8) и СП 42.13330.2016 «Градостроительство», минимальные расстояния до границы соседнего участка должны составлять: от жилого дома — не менее 3.0 м; от постройки для содержания скота и птицы — не менее 4.0 м; от других хозяйственных построек (бани, гаража, сарая) — не менее 1.0 м (при условии, что скат крыши ориентирован на свой участок и при вылете карнизного свеса более 0.5 м отступ измеряется от проекции кровли); от стволов высокорослых деревьев — не менее 4.0 м, среднерослых — не менее 2.0 м. По периметру садовых участков рекомендуется устройство сетчатого ограждения высотой 1.2–1.8 м (глухие заборы со стороны соседей допускаются исключительно с письменного согласия).
4. Согласно Таблице 1 СП 4.13130.2013 «Системы противопожарной защиты. Ограничение распространения пожара на объектах защиты», противопожарные расстояния между жилыми и общественными зданиями в зависимости от степени огнестойкости составляют от 6 до 15 метров и не могут быть уменьшены частным соглашением сторон.
5. В силу п. 45–47 Постановления Пленума Верховного Суда РФ № 10, Пленума ВАС РФ № 22 от 29.04.2010 и Постановления Пленума Верховного Суда РФ от 12.12.2023 № 44 «О некоторых вопросах, возникающих в судебной практике при применении норм о самовольной постройке», возведение постройки или забора с нарушением отступов, создающее угрозу пожарной безопасности, схода снега и ливневых вод, затенения (нарушения инсоляции) или загрязнения водоносного горизонта, подлежит пресечению вплоть до переноса, реконструкции ската крыши или сноса за счет нарушителя.

На основании изложенного, руководствуясь ст. 12, 209, 222, 263, 304 ГК РФ, ст. 42 ЗК РФ, СП 53.13330.2019, СП 42.13330.2016 и СП 4.13130.2013,

Т Р Е Б У Ю:

1. В добровольном порядке в срок не позднее ${deadlineDays} (тридцати) календарных дней с момента получения настоящего документа устранить указанные выше нарушения градостроительных, противопожарных и санитарных норм РФ:
   — привести отступы строений, свесов крыш, направление организованного водоотвода/снегозадержания и параметры межевого ограждения в строгое соответствие с нормативами СП 53.13330.2019 и СП 4.13130.2013;
   — либо (в случаях, прямо допускаемых законом для некапитальных ограждений и санитарно-бытовых отступов) заключить письменное соглашение о параметрах размещения объектов с устройством систем снегозадержания и ливневого дренажа.

2. О принятом решении и графике проведения работ уведомить меня письменно по указанному выше адресу в течение 10 календарных дней.

В случае оставления настоящего Требования (Досудебной претензии) без удовлетворения в установленный срок я буду вынужден(а) обратиться в суд с исковым заявлением об устранении препятствий в пользовании земельным участком (ст. 304 ГК РФ), признании постройки самовольной (ст. 222 ГК РФ) и обязании перенести/демонтировать строения (ограждения), а также о взыскании с Вас судебных расходов, включая оплату строительно-технической и землеустроительной экспертизы и государственной пошлины.

Приложения:
1. Схема генерального плана и чертеж нормативных отступов «ГенПлан-Эксперт РФ 3D».
2. Ведомость зафиксированных нарушений СП / СНиП РФ (${activeList.length} п.).
3. Выписка из ЕГРН на земельный участок ${claimantCad}.

Дата составления: ${dateStr} г.

Подпись Заявителя: _____________________ / ${claimantName} /`;
}

/**
 * Returns default wall thickness (meters) based on building category and wall material.
 */
export function getDefaultWallThicknessM(obj: Pick<SiteObject, 'category' | 'wallMaterialId' | 'wallThickness'>): number {
  if (obj.wallThickness !== undefined && obj.wallThickness > 0.02) {
    return roundToMm(obj.wallThickness);
  }
  if (obj.category === 'greenhouse') return 0.05;
  if (obj.category === 'shed' || obj.category === 'poultry' || obj.category === 'toilet') return 0.15;
  switch (obj.wallMaterialId) {
    case 'aerated_concrete':
      return 0.375; // Газобетон D400 375 мм
    case 'ceramic_block':
      return 0.380; // Керамический блок 380 мм
    case 'frame':
      return 0.250; // Каркасная стена 200+50 мм
    case 'timber':
      return 0.200; // Клееный / профилированный брус 200 мм
    default:
      return 0.300;
  }
}

/**
 * Calculates the exact net interior floor area inside the building walls (Площадь внутри стен строения),
 * accounting for external wall thickness, plan shape (rectangle, l_shape, t_shape, chamfered),
 * internal partitions, above-ground stories (1..3), and underground basement (+1).
 */
export function calculateBuildingInteriorArea(obj: SiteObject): BuildingInteriorAreaResult {
  const wallThicknessM = getDefaultWallThicknessM(obj);
  const localPoly = getLocalObjectFootprintPolygon(obj, false);
  const grossFootprintAreaSqm = Number(
    Math.max(0.5, calculatePolygonArea(localPoly) || obj.width * obj.length).toFixed(2)
  );
  const outerPerimeterM = Number(
    Math.max(2, calculatePolygonPerimeter(localPoly) || 2 * (obj.width + obj.length)).toFixed(2)
  );

  const effectiveInnerWidthM = roundToMm(Math.max(0.2, obj.width - 2 * wallThicknessM));
  const effectiveInnerLengthM = roundToMm(Math.max(0.2, obj.length - 2 * wallThicknessM));

  let netInteriorSingleFloorSqm: number;
  if (!obj.footprintShape || obj.footprintShape === 'rectangle') {
    netInteriorSingleFloorSqm = Number((effectiveInnerWidthM * effectiveInnerLengthM).toFixed(2));
  } else {
    // Exact inset area for orthogonal/convex polygon: S_in = S_gross - P * t + 4 * t^2
    const wallRingArea = outerPerimeterM * wallThicknessM - 4 * wallThicknessM * wallThicknessM;
    netInteriorSingleFloorSqm = Number(Math.max(0.4, grossFootprintAreaSqm - wallRingArea).toFixed(2));
  }

  const wallFootprintAreaSqm = Number(Math.max(0, grossFootprintAreaSqm - netInteriorSingleFloorSqm).toFixed(2));
  const partitionThicknessM = 0.12; // межкомнатные перегородки 120 мм
  const partitionLen = Math.max(0, obj.partitionLength || 0);
  const partitionFootprintAreaSqm = Number(
    Math.min(netInteriorSingleFloorSqm * 0.25, partitionLen * partitionThicknessM).toFixed(2)
  );
  const usableRoomSingleFloorSqm = Number(
    Math.max(0.2, netInteriorSingleFloorSqm - partitionFootprintAreaSqm).toFixed(2)
  );

  const aboveGroundFloors =
    obj.category === 'house' || obj.category === 'neighbor_house'
      ? Math.max(1, Math.min(3, Math.round(obj.floors || 1)))
      : 1;
  const hasBasement = Boolean(obj.hasBasement);

  const netInteriorAboveGroundSqm = Number((netInteriorSingleFloorSqm * aboveGroundFloors).toFixed(2));
  const netInteriorBasementSqm = hasBasement ? netInteriorSingleFloorSqm : 0;
  const totalNetInteriorAllFloorsSqm = Number((netInteriorAboveGroundSqm + netInteriorBasementSqm).toFixed(2));
  const totalUsableRoomsAllFloorsSqm = Number(
    (usableRoomSingleFloorSqm * (aboveGroundFloors + (hasBasement ? 1 : 0))).toFixed(2)
  );

  return {
    grossFootprintAreaSqm,
    wallThicknessM,
    outerPerimeterM,
    wallFootprintAreaSqm,
    partitionFootprintAreaSqm,
    netInteriorSingleFloorSqm,
    usableRoomSingleFloorSqm,
    aboveGroundFloors,
    hasBasement,
    netInteriorAboveGroundSqm,
    netInteriorBasementSqm,
    totalNetInteriorAllFloorsSqm,
    totalUsableRoomsAllFloorsSqm,
    effectiveInnerWidthM,
    effectiveInnerLengthM
  };
}

/**
 * Generates default adjacent neighbor parcels and state land boundaries around the main plot.
 */
export function getDefaultAdjacentParcels(
  plot: Pick<PlotConfig, 'width' | 'length'>
): AdjacentParcelConfig[] {
  const W = Math.max(10, plot.width || 30);
  const L = Math.max(10, plot.length || 40);
  const neighborW = 24;
  const stateNorthDepth = 20;
  const stateSouthDepth = 14;

  return [
    {
      id: 'parcel-neighbor-west',
      name: 'Соседский участок №1 (Запад)',
      type: 'neighbor_parcel',
      side: 'west',
      width: neighborW,
      length: L,
      offsetX: roundToMm(-(W / 2 + neighborW / 2)),
      offsetZ: 0,
      cadastralNote: 'Смежный участок ИЖС/СНТ (слева)'
    },
    {
      id: 'parcel-neighbor-east',
      name: 'Соседский участок №2 (Восток)',
      type: 'neighbor_parcel',
      side: 'east',
      width: neighborW,
      length: L,
      offsetX: roundToMm(W / 2 + neighborW / 2),
      offsetZ: 0,
      cadastralNote: 'Смежный участок ИЖС/СНТ (справа)'
    },
    {
      id: 'parcel-state-north',
      name: 'Государственные земли (Север / Лесфонд)',
      type: 'state_land',
      side: 'north',
      width: roundToMm(W + neighborW * 2),
      length: stateNorthDepth,
      offsetX: 0,
      offsetZ: roundToMm(-(L / 2 + stateNorthDepth / 2)),
      cadastralNote: 'Земли лесного фонда / неразграниченная госсобственность'
    },
    {
      id: 'parcel-state-south',
      name: 'Земли общего пользования / Улица (Юг)',
      type: 'state_land',
      side: 'south',
      width: roundToMm(W + neighborW * 2),
      length: stateSouthDepth,
      offsetX: 0,
      offsetZ: roundToMm(L / 2 + stateSouthDepth / 2),
      cadastralNote: 'Муниципальные земли общего пользования (красная линия улицы)'
    }
  ];
}

/**
 * Returns the active list of adjacent parcels (neighbor plots + state lands) for the plot.
 */
export function getEffectiveAdjacentParcels(plot: PlotConfig): AdjacentParcelConfig[] {
  if (plot.adjacentParcels && plot.adjacentParcels.length > 0) {
    return plot.adjacentParcels;
  }
  return getDefaultAdjacentParcels(plot);
}

/**
 * Determines which parcel ('main_plot' or an AdjacentParcelConfig.id) contains a site object.
 * Ensures that neighbor houses, neighbor wells, forests, and external utilities are grouped into
 * their respective neighbor or state land parcels rather than cluttering "Мой участок".
 */
export function resolveObjectParcelId(obj: SiteObject, plot: PlotConfig): string {
  const parcels = getEffectiveAdjacentParcels(plot);

  // If the object has an explicit valid parcelId and its coordinates haven't been dragged into another parcel, check spatial containment first
  const mainPoly = generatePlotPolygon(plot);
  const insideMain = mainPoly.length >= 3 && pointInPolygon({ x: obj.x, z: obj.z }, mainPoly);

  // Check if point is inside any adjacent parcel rectangle
  for (const p of parcels) {
    const halfW = p.width / 2;
    const halfL = p.length / 2;
    if (
      obj.x >= p.offsetX - halfW - 0.5 &&
      obj.x <= p.offsetX + halfW + 0.5 &&
      obj.z >= p.offsetZ - halfL - 0.5 &&
      obj.z <= p.offsetZ + halfL + 0.5 &&
      !insideMain
    ) {
      return p.id;
    }
  }

  if (obj.parcelId && (obj.parcelId === 'main_plot' || parcels.some((p) => p.id === obj.parcelId))) {
    // If it was explicitly assigned to an adjacent parcel and is outside the main plot, keep that assignment
    if (obj.parcelId !== 'main_plot' && !insideMain) {
      return obj.parcelId;
    }
    if (obj.parcelId === 'main_plot' && insideMain) {
      return 'main_plot';
    }
  }

  if (insideMain && obj.category !== 'neighbor_house' && obj.category !== 'neighbor_well') {
    return 'main_plot';
  }

  // Fallback by category or nearest parcel for objects outside the main plot
  if (obj.category === 'neighbor_house' || obj.category === 'neighbor_well') {
    const neighborParcels = parcels.filter((p) => p.type === 'neighbor_parcel');
    if (neighborParcels.length > 0) {
      let best = neighborParcels[0];
      let bestDist = Math.hypot(obj.x - best.offsetX, obj.z - best.offsetZ);
      for (const np of neighborParcels) {
        const d = Math.hypot(obj.x - np.offsetX, obj.z - np.offsetZ);
        if (d < bestDist) {
          best = np;
          bestDist = d;
        }
      }
      return best.id;
    }
  }

  if (
    obj.category === 'forest' ||
    obj.category === 'road' ||
    obj.category === 'power_line' ||
    obj.category === 'gas_pipe' ||
    obj.category === 'water_body'
  ) {
    const stateParcels = parcels.filter((p) => p.type === 'state_land');
    if (stateParcels.length > 0) {
      let best = stateParcels[0];
      let bestDist = Math.hypot(obj.x - best.offsetX, obj.z - best.offsetZ);
      for (const sp of stateParcels) {
        const d = Math.hypot(obj.x - sp.offsetX, obj.z - sp.offsetZ);
        if (d < bestDist) {
          best = sp;
          bestDist = d;
        }
      }
      return best.id;
    }
  }

  if (!insideMain && parcels.length > 0) {
    let best = parcels[0];
    let bestDist = Math.hypot(obj.x - best.offsetX, obj.z - best.offsetZ);
    for (const p of parcels) {
      const d = Math.hypot(obj.x - p.offsetX, obj.z - p.offsetZ);
      if (d < bestDist) {
        best = p;
        bestDist = d;
      }
    }
    return best.id;
  }

  return 'main_plot';
}

/**
 * Helper to format compass azimuth in degrees (0=С, 90=В, 180=Ю, 270=З) to Russian cardinal label.
 */
function formatCompassDirectionRu(azDeg: number): string {
  const norm = ((azDeg % 360) + 360) % 360;
  if (norm >= 337.5 || norm < 22.5) return 'Север (С)';
  if (norm < 67.5) return 'Северо-Восток (СВ)';
  if (norm < 112.5) return 'Восток (В)';
  if (norm < 157.5) return 'Юго-Восток (ЮВ)';
  if (norm < 202.5) return 'Юг (Ю)';
  if (norm < 247.5) return 'Юго-Запад (ЮЗ)';
  if (norm < 292.5) return 'Запад (З)';
  return 'Северо-Запад (СЗ)';
}

/**
 * Pure astronomical solar position calculator (altitude and true compass azimuth in degrees, where 0=North, 90=East, 180=South, 270=West)
 * for any latitude (°N), dayOfYear (1..365), and local solar hour (0..24).
 */
export function computeSolarAltAzAtHour(
  latDeg: number,
  dayOfYear: number,
  solarHour: number
): { altitudeDeg: number; trueAzimuthDeg: number } {
  const latRad = (latDeg * Math.PI) / 180;
  // Cooper's solar declination formula
  const declDeg = 23.45 * Math.sin(((2 * Math.PI) / 365) * (284 + dayOfYear));
  const declRad = (declDeg * Math.PI) / 180;

  // Hour angle H: 0 at solar noon (12:00), -15° per hour before noon, +15° per hour after noon
  const hourAngleDeg = (solarHour - 12) * 15;
  const hourAngleRad = (hourAngleDeg * Math.PI) / 180;

  const sinAlt =
    Math.sin(latRad) * Math.sin(declRad) +
    Math.cos(latRad) * Math.cos(declRad) * Math.cos(hourAngleRad);
  const altRad = Math.asin(Math.max(-1, Math.min(1, sinAlt)));
  const altitudeDeg = (altRad * 180) / Math.PI;

  const cosAz =
    (Math.sin(declRad) - Math.sin(altRad) * Math.sin(latRad)) /
    Math.max(1e-6, Math.cos(altRad) * Math.cos(latRad));
  const clampedCosAz = Math.max(-1, Math.min(1, cosAz));
  const baseAzDeg = (Math.acos(clampedCosAz) * 180) / Math.PI;
  const trueAzimuthDeg = solarHour <= 12 ? baseAzDeg : 360 - baseAzDeg;

  return { altitudeDeg, trueAzimuthDeg };
}

/**
 * Automated Room Insolation Analysis Module per СанПиН 1.2.3685-21 (Таблица 5.20) & ГОСТ Р 57795-2017.
 * Evaluates continuous and intermittent direct sunlight duration across all 4 building facades based on:
 * - Plot geographic coordinates (latitude/longitude),
 * - Cardinal orientation (plot.northAngle + house.rotation),
 * - Current day of year (season),
 * - Window presence on each facade, and
 * - Shadowing from neighboring buildings, tall trees, and forests.
 */
export function calculateBuildingInsolationSanPin(
  house: SiteObject,
  plot: PlotConfig,
  allObjects: SiteObject[],
  dayOfYear: number
): BuildingInsolationAnalysis {
  const region = getEffectivePlotRegion(plot);
  const lat = region.lat;

  // Classify latitude zone per СанПиН 1.2.3685-21 (п. 119 / табл. 5.20):
  // - Северная зона (севернее 58° с.ш.): >= 2.5 ч непрерывной (с 22 апреля по 22 августа, дни 112..234)
  // - Центральная зона (48°..58° с.ш.): >= 2.0 ч непрерывной (с 22 марта по 22 сентября, дни 81..265)
  // - Южная зона (южнее 48° с.ш.): >= 1.5 ч непрерывной (с 22 февраля по 22 октября, дни 53..295)
  let climateZone: 'northern' | 'central' | 'southern' = 'central';
  let climateZoneLabel = 'Центральная зона (48°–58° с.ш.)';
  let normativePeriodLabel = '22 марта – 22 сентября';
  let requiredContinuousHours = 2.0;
  let minSeasonDay = 80;
  let maxSeasonDay = 266;

  if (lat > 58) {
    climateZone = 'northern';
    climateZoneLabel = 'Северная зона (севернее 58° с.ш.)';
    normativePeriodLabel = '22 апреля – 22 августа';
    requiredContinuousHours = 2.5;
    minSeasonDay = 112;
    maxSeasonDay = 234;
  } else if (lat < 48) {
    climateZone = 'southern';
    climateZoneLabel = 'Южная зона (южнее 48° с.ш.)';
    normativePeriodLabel = '22 февраля – 22 октября';
    requiredContinuousHours = 1.5;
    minSeasonDay = 53;
    maxSeasonDay = 295;
  }

  const requiredIntermittentHours = roundToMm(requiredContinuousHours + 0.5);
  const isWithinNormativeSeason = dayOfYear >= minSeasonDay && dayOfYear <= maxSeasonDay;

  const wins = getObjectWindowsConfig(house);
  const facadeDefs: Array<{
    facade: 'south' | 'east' | 'west' | 'north';
    facadeLabel: string;
    localNormalAzDeg: number; // In scene coords: 0=-Z(North), 90=+X(East), 180=+Z(South), 270=-X(West)
    windowCount: number;
  }> = [
    { facade: 'south', facadeLabel: 'Южный фасад (Главный)', localNormalAzDeg: 180, windowCount: wins.south || 0 },
    { facade: 'east', facadeLabel: 'Восточный фасад', localNormalAzDeg: 90, windowCount: wins.east || 0 },
    { facade: 'west', facadeLabel: 'Западный фасад', localNormalAzDeg: 270, windowCount: wins.west || 0 },
    { facade: 'north', facadeLabel: 'Северный фасад', localNormalAzDeg: 0, windowCount: wins.north || 0 }
  ];

  // Other tall objects that can cast shadows on this building's windows
  const blockers = allObjects.filter(
    (o) =>
      o.id !== house.id &&
      (o.category === 'neighbor_house' ||
        o.category === 'forest' ||
        o.category === 'tree_tall' ||
        o.category === 'bathhouse' ||
        o.category === 'garage')
  );

  const stepHours = 10 / 60; // 10-minute step (1/6 hr)
  const formatHourMin = (h: number) => {
    const hrs = Math.floor(h);
    const mins = Math.round((h - hrs) * 60);
    return `${String(hrs).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;
  };

  const facades: FacadeInsolationMetric[] = facadeDefs.map((f) => {
    // True geographical compass azimuth of this facade's outward normal:
    // In scene: North is rotated by plot.northAngle, and object is rotated by house.rotation
    const worldAzimuthDeg = Math.round(((f.localNormalAzDeg + house.rotation - plot.northAngle) % 360 + 360) % 360);
    const compassLabel = formatCompassDirectionRu(worldAzimuthDeg);

    // Scene outward normal vector in (X, Z) where 0 deg is -Z and 90 deg is +X
    const sceneNormalAzRad = (((f.localNormalAzDeg + house.rotation) % 360) * Math.PI) / 180;
    const facadeCenterWorld = {
      x: house.x + Math.sin(sceneNormalAzRad) * (house.width * 0.45),
      z: house.z - Math.cos(sceneNormalAzRad) * (house.length * 0.45)
    };

    let totalSteps = 0;
    let maxContinuousSteps = 0;
    let currentContinuousSteps = 0;
    let shadedSteps = 0;
    const intervals: string[] = [];
    let intervalStartHour: number | null = null;

    // Step through 04:30 to 20:30 local solar time
    for (let h = 4.5; h <= 20.5 + 1e-4; h += stepHours) {
      const { altitudeDeg, trueAzimuthDeg } = computeSolarAltAzAtHour(lat, dayOfYear, h);

      // Per ГОСТ Р 57795-2017 & СанПиН 1.2.3685-21: exclude low sun (< 7° altitude) right after sunrise / before sunset
      if (altitudeDeg < 7) {
        if (intervalStartHour !== null) {
          intervals.push(`${formatHourMin(intervalStartHour)}–${formatHourMin(h)}`);
          intervalStartHour = null;
        }
        currentContinuousSteps = 0;
        continue;
      }

      // Horizontal angle difference between sun azimuth and facade true compass azimuth
      let deltaAz = Math.abs(trueAzimuthDeg - worldAzimuthDeg) % 360;
      if (deltaAz > 180) deltaAz = 360 - deltaAz;

      // Per ГОСТ Р 57795-2017: rays grazing the facade at < 15° to the wall plane (i.e. deltaAz > 75°) do not insolate rooms because of window reveal depth
      if (deltaAz <= 75) {
        // Check if any tall blocker casts a shadow on this facade at this solar angle
        const sunSceneAzRad = (((trueAzimuthDeg + plot.northAngle) % 360) * Math.PI) / 180;
        const rayDirX = Math.sin(sunSceneAzRad);
        const rayDirZ = -Math.cos(sunSceneAzRad);
        const tanAlt = Math.tan((altitudeDeg * Math.PI) / 180);
        const winSillElev = (house.plinthHeight ?? 0.45) + 1.1;

        let isBlockedByNeighbor = false;
        for (const blk of blockers) {
          const dx = blk.x - facadeCenterWorld.x;
          const dz = blk.z - facadeCenterWorld.z;
          const distAlongSun = dx * rayDirX + dz * rayDirZ;
          if (distAlongSun <= 1.0 || distAlongSun > 45) continue;
          const perpDist = Math.abs(dx * -rayDirZ + dz * rayDirX);
          const blkRadius = Math.max(blk.width, blk.length) * 0.55;
          if (perpDist <= blkRadius) {
            const blkTopH = (blk.wallHeight || 3.5) + (blk.roofHeight || 1.5);
            const shadowRayHeightAtFacade = blkTopH - distAlongSun * tanAlt;
            if (shadowRayHeightAtFacade > winSillElev) {
              isBlockedByNeighbor = true;
              break;
            }
          }
        }

        if (isBlockedByNeighbor) {
          shadedSteps++;
          if (intervalStartHour !== null) {
            intervals.push(`${formatHourMin(intervalStartHour)}–${formatHourMin(h)}`);
            intervalStartHour = null;
          }
          currentContinuousSteps = 0;
        } else {
          totalSteps++;
          currentContinuousSteps++;
          if (currentContinuousSteps > maxContinuousSteps) {
            maxContinuousSteps = currentContinuousSteps;
          }
          if (intervalStartHour === null) {
            intervalStartHour = h;
          }
        }
      } else {
        if (intervalStartHour !== null) {
          intervals.push(`${formatHourMin(intervalStartHour)}–${formatHourMin(h)}`);
          intervalStartHour = null;
        }
        currentContinuousSteps = 0;
      }
    }

    if (intervalStartHour !== null) {
      intervals.push(`${formatHourMin(intervalStartHour)}–20:30`);
    }

    const totalHours = Number((totalSteps * stepHours).toFixed(1));
    const maxContinuousHours = Number((maxContinuousSteps * stepHours).toFixed(1));
    const shadedByNeighborHours = Number((shadedSteps * stepHours).toFixed(1));

    const meetsContinuousNorm = f.windowCount > 0 && maxContinuousHours >= requiredContinuousHours - 0.05;
    const meetsIntermittentNorm = f.windowCount > 0 && totalHours >= requiredIntermittentHours - 0.05;

    let status: FacadeInsolationMetric['status'] = 'no_windows';
    if (f.windowCount > 0) {
      if (meetsContinuousNorm) status = 'compliant';
      else if (meetsIntermittentNorm) status = 'intermittent_ok';
      else status = 'violation';
    }

    return {
      facade: f.facade,
      facadeLabel: f.facadeLabel,
      windowCount: f.windowCount,
      worldAzimuthDeg,
      compassLabel,
      totalHours,
      maxContinuousHours,
      sunIntervals: intervals,
      shadedByNeighborHours,
      meetsContinuousNorm,
      meetsIntermittentNorm,
      status
    };
  });

  const windowedFacades = facades.filter((f) => f.windowCount > 0);
  const compliantFacades = windowedFacades.filter(
    (f) => f.status === 'compliant' || f.status === 'intermittent_ok'
  );

  // Per СанПиН 1.2.3685-21: normative insolation is achieved if at least 1-2 main windowed facades/living rooms meet the required hours
  const requiredCompliantFacades = windowedFacades.length >= 3 ? 2 : 1;
  const overallCompliant =
    windowedFacades.length > 0 && compliantFacades.length >= requiredCompliantFacades;

  const recommendations: string[] = [];
  if (windowedFacades.length === 0) {
    recommendations.push(
      'На фасадах здания не задано ни одного окна! Добавьте окна на южном, восточном или западном фасаде для обеспечения нормативной инсоляции жилых комнат по СанПиН 1.2.3685-21.'
    );
  } else if (!overallCompliant) {
    if (!isWithinNormativeSeason) {
      recommendations.push(
        `Текущая дата (день ${dayOfYear}) находится в зимнем периоде вне нормативного сезона СанПиН (${normativePeriodLabel}). Переключите дату на «21 Марта (Весна)» или «21 Июня (Лето)» для аттестационной проверки.`
      );
    }
    const northOnly = windowedFacades.every((f) => f.worldAzimuthDeg < 55 || f.worldAzimuthDeg > 305);
    if (northOnly) {
      recommendations.push(
        'Окна ориентированы преимущественно на северный сектор горизонта (310°–50°), где прямая солнечная инсоляция невозможна. Поверните дом или добавьте окна на Южный / Восточный / Западный фасады.'
      );
    }
    const shadedFacade = facades.find((f) => f.shadedByNeighborHours >= 0.5);
    if (shadedFacade) {
      recommendations.push(
        `${shadedFacade.facadeLabel} теряет ${shadedFacade.shadedByNeighborHours} ч солнечного света из-за затенения соседними объектами/деревьями. Отодвиньте дом от затеняющего объекта или сформируйте претензию соседу по ст. 304 ГК РФ.`
      );
    }
    if (recommendations.length === 0) {
      recommendations.push(
        `Для выполнения нормы СанПиН 1.2.3685-21 (не менее ${requiredContinuousHours} ч непрерывной инсоляции) увеличьте количество окон на солнечных фасадах (Юг, Юго-Восток, Восток) или скорректируйте угол поворота дома.`
      );
    }
  } else {
    recommendations.push(
      `Норматив СанПиН 1.2.3685-21 полностью соблюден: ${compliantFacades.length} из ${windowedFacades.length} остекленных фасадов получают ≥ ${requiredContinuousHours} ч прямого солнечного облучения.`
    );
  }

  const summaryVerdict = overallCompliant
    ? `Соблюдено по СанПиН 1.2.3685-21 (${compliantFacades.length}/${windowedFacades.length} фасадов с окнами получают ≥ ${requiredContinuousHours} ч солнца)`
    : windowedFacades.length === 0
    ? 'Нарушение СанПиН 1.2.3685-21: отсутствуют окна в жилых помещениях'
    : `Дефицит инсоляции по СанПиН 1.2.3685-21 (требуется ≥ ${requiredContinuousHours} ч непрерывного солнца)`;

  return {
    normCode: 'СанПиН 1.2.3685-21 (табл. 5.20) и ГОСТ Р 57795-2017',
    latitudeDeg: Number(lat.toFixed(2)),
    climateZone,
    climateZoneLabel,
    normativePeriodLabel,
    requiredContinuousHours,
    requiredIntermittentHours,
    dayOfYear,
    isWithinNormativeSeason,
    facades,
    compliantFacadesCount: compliantFacades.length,
    totalWindowedFacadesCount: windowedFacades.length,
    overallCompliant,
    summaryVerdict,
    recommendations
  };
}

/**
 * Calculates per-facade thermal heat loss metrics and thermographic colors for the 3D Facade Thermal Heatmap mode.
 * Accounts for selected wall material R-value, per-facade window glazing percentage, and linear thermal bridges.
 */
export function calculateBuildingThermalHeatmap(
  house: SiteObject,
  plot: PlotConfig
): BuildingThermalHeatmapAnalysis {
  const region = getEffectivePlotRegion(plot);
  const energy = calculateEnergyAndHeating(house, plot);
  const wins = getObjectWindowsConfig(house);

  // Design winter temperature difference ΔT (°C) between indoor (+21°C) and regional cold five-day average (t_5)
  // Derived from regional GSOP & heating season days: ΔT_design ≈ (GSOP / heatingSeasonDays) * 1.85
  const avgSeasonDeltaT = region.gsop / Math.max(120, energy.heatingSeasonDays);
  const designDeltaTempC = Math.round(Math.max(28, Math.min(62, avgSeasonDeltaT * 1.85)));

  const floorsAbove = Math.max(1, Math.min(3, Math.round(house.floors || 1)));
  const floorH = house.floorHeight ?? 3.0;
  const slabThick = house.interfloorSlabThickness ?? 0.22;
  const wallElevH = floorsAbove * floorH + Math.max(0, floorsAbove - 1) * slabThick;
  const singleWinArea = (wins.windowWidth ?? 1.4) * (wins.windowHeight ?? 1.4);

  const wallR = energy.wallRValue;
  const winR = energy.windowRValue;
  const roofR = energy.roofRValue;

  const wallHeatFluxWm2 = Number((designDeltaTempC / wallR).toFixed(1));
  const windowHeatFluxWm2 = Number((designDeltaTempC / winR).toFixed(1));
  const roofHeatFluxWm2 = Number((designDeltaTempC / roofR).toFixed(1));

  let roofThermalColorHex = '#10b981';
  if (roofHeatFluxWm2 >= 35) {
    roofThermalColorHex = '#ef4444';
  } else if (roofHeatFluxWm2 >= 14) {
    roofThermalColorHex = '#f97316';
  } else if (roofHeatFluxWm2 >= 9.5) {
    roofThermalColorHex = '#eab308';
  }

  const facadeConfigs: Array<{
    facade: 'south' | 'east' | 'west' | 'north';
    facadeLabel: string;
    spanM: number;
    winCountPerFloor: number;
  }> = [
    { facade: 'south', facadeLabel: 'Южный фасад', spanM: house.width, winCountPerFloor: wins.south || 0 },
    { facade: 'north', facadeLabel: 'Северный фасад', spanM: house.width, winCountPerFloor: wins.north || 0 },
    { facade: 'east', facadeLabel: 'Восточный фасад', spanM: house.length, winCountPerFloor: wins.east || 0 },
    { facade: 'west', facadeLabel: 'Западный фасад', spanM: house.length, winCountPerFloor: wins.west || 0 }
  ];

  const facades: FacadeThermalMetric[] = facadeConfigs.map((fc) => {
    const grossFacadeAreaSqm = Number((fc.spanM * wallElevH).toFixed(2));
    const totalWinsOnFacade = fc.winCountPerFloor * floorsAbove;
    const rawWinArea = totalWinsOnFacade * singleWinArea;
    const windowAreaSqm = Number(Math.min(grossFacadeAreaSqm * 0.78, rawWinArea).toFixed(2));
    const netWallAreaSqm = Number(Math.max(0, grossFacadeAreaSqm - windowAreaSqm).toFixed(2));
    const glazingPercent = Number(
      (grossFacadeAreaSqm > 0 ? (windowAreaSqm / grossFacadeAreaSqm) * 100 : 0).toFixed(1)
    );

    // Linear thermal bridge penalty at window perimeters and interfloor slabs (~12% of window flux + 1.8 W/m²)
    const bridgeFluxPenalty = (glazingPercent / 100) * 8.5 + (floorsAbove > 1 ? 2.4 : 1.1);
    const weightedFlux =
      grossFacadeAreaSqm > 0
        ? (netWallAreaSqm * wallHeatFluxWm2 + windowAreaSqm * windowHeatFluxWm2) / grossFacadeAreaSqm +
          bridgeFluxPenalty
        : wallHeatFluxWm2;

    const effectiveFacadeHeatFluxWm2 = Number(weightedFlux.toFixed(1));

    // Normalize heat flux on [8 W/m² .. 48 W/m²] into 0..1 thermographic scale
    const heatLossNormalized01 = Number(
      Math.max(0, Math.min(1, (effectiveFacadeHeatFluxWm2 - 8) / 40)).toFixed(2)
    );

    let thermalColorHex = '#10b981'; // low loss (emerald)
    let zoneSeverity: FacadeThermalMetric['zoneSeverity'] = 'low';
    let zoneSeverityLabel = 'Низкие теплопотери (Норма)';

    if (heatLossNormalized01 >= 0.68) {
      thermalColorHex = '#ef4444'; // critical hot red
      zoneSeverity = 'critical';
      zoneSeverityLabel = 'Критическая зона теплопотерь';
    } else if (heatLossNormalized01 >= 0.44) {
      thermalColorHex = '#f97316'; // elevated orange
      zoneSeverity = 'elevated';
      zoneSeverityLabel = 'Повышенные теплопотери';
    } else if (heatLossNormalized01 >= 0.24) {
      thermalColorHex = '#eab308'; // moderate amber/yellow
      zoneSeverity = 'moderate';
      zoneSeverityLabel = 'Умеренные теплопотери';
    }

    return {
      facade: fc.facade,
      facadeLabel: fc.facadeLabel,
      grossFacadeAreaSqm,
      windowCount: totalWinsOnFacade,
      windowAreaSqm,
      netWallAreaSqm,
      glazingPercent,
      wallHeatFluxWm2,
      windowHeatFluxWm2,
      effectiveFacadeHeatFluxWm2,
      heatLossNormalized01,
      thermalColorHex,
      zoneSeverity,
      zoneSeverityLabel
    };
  });

  const highestLossFacade = [...facades].sort(
    (a, b) => b.effectiveFacadeHeatFluxWm2 - a.effectiveFacadeHeatFluxWm2
  )[0];

  const overallGlazingPercent = Number(
    (energy.grossWallAreaSqm > 0 ? (energy.windowAreaSqm / energy.grossWallAreaSqm) * 100 : 0).toFixed(1)
  );

  const matInfo = WALL_MATERIALS_INFO[house.wallMaterialId] || WALL_MATERIALS_INFO.aerated_concrete;
  const thermalBridgeAlert =
    energy.roofInsulationId === 'none'
      ? `Крыша без утепления (R=${roofR}) создает критический тепловой поток ${roofHeatFluxWm2} Вт/м² через кровлю! Утеплите скаты или чердачное перекрытие (минвата 200+50 мм / ППУ).`
      : energy.windowRValue < 0.5
      ? `Окна «${energy.windowTypeName}» (R=${winR}) дают высокий тепловой поток ${windowHeatFluxWm2} Вт/м² (против ${wallHeatFluxWm2} Вт/м² у стены). Замените остекление на ПВХ с двухкамерным стеклопакетом.`
      : energy.wallRValue < region.rReqWall
      ? `Стены (${matInfo.name}, ${energy.wallInsulationName}, R=${wallR}) дают поток до ${highestLossFacade.effectiveFacadeHeatFluxWm2} Вт/м² на фасаде «${highestLossFacade.facadeLabel}». Добавьте наружное фасадное утепление 100–150 мм.`
      : overallGlazingPercent > 25
      ? `Основной канал теплопотерь — остекление (${overallGlazingPercent}% площади стен, поток через окна ${windowHeatFluxWm2} Вт/м² против ${wallHeatFluxWm2} Вт/м² через стену). Максимальная нагрузка на фасаде «${highestLossFacade.facadeLabel}».`
      : `Теплозащитная оболочка (${matInfo.name}, ${energy.wallInsulationName}, R=${wallR}; крыша R=${roofR}; окна R=${winR}) сбалансирована.`;

  return {
    designDeltaTempC,
    wallMaterialName: matInfo.name,
    wallInsulationName: energy.wallInsulationName,
    windowTypeName: energy.windowTypeName,
    roofInsulationName: energy.roofInsulationName,
    wallRValue: wallR,
    windowRValue: winR,
    roofRValue: roofR,
    roofHeatFluxWm2,
    roofThermalColorHex,
    overallGlazingPercent,
    facades,
    highestLossFacade,
    thermalBridgeAlert
  };
}

/**
 * Returns default normative outer pipeline diameter (mm) for linear pipeline categories.
 */
export function getDefaultPipelineDiameterMm(category: BuildingCategory): number {
  switch (category) {
    case 'water_main':
      return 110; // Напорный водопровод ПНД Ø110 мм
    case 'sewer_main':
      return 160; // Самотечный коллектор канализации Ø160 мм
    case 'gas_pipe':
      return 63; // Распределительный газопровод ПЭ Ø63 мм
    default:
      return 110;
  }
}

/**
 * Returns strict, domain-accurate capabilities and property labels for each of the 19 BuildingCategory types,
 * ensuring that pipelines, wells, septic tanks, power lines, roads, trees, forests, and water bodies
 * ONLY expose parameters inherent to their engineering nature (and never expose irrelevant roof/wall/window fields).
 */
export function getObjectCategoryCapabilities(
  category: BuildingCategory
): ObjectCategoryCapabilities {
  switch (category) {
    case 'house':
    case 'neighbor_house':
      return {
        category,
        kind: 'heated_building',
        categoryTitle: category === 'house' ? 'Жилой дом (ИЖС / СНТ)' : 'Жилой дом соседа',
        widthLabel: 'Ширина по фасаду W (м)',
        lengthLabel: 'Длина (глубина) дома L (м)',
        heightLabel: 'Высота стен H_wall (м)',
        hasPlanFootprintShape: true,
        hasInteriorAreaInsideWalls: true,
        hasMultiStoryAndBasement: true,
        hasPlinthAndFoundationSlab: true,
        hasRoofGeometry: true,
        hasRoofOverhang: true,
        hasRoofInsulation: true,
        hasWallInsulation: true,
        hasWindows: true,
        hasDoors: true,
        hasFireResistanceMaterial: true,
        hasBurialDepth: false,
        hasPipelineDiameter: false
      };

    case 'bathhouse':
    case 'garage':
      return {
        category,
        kind: 'heated_building',
        categoryTitle: category === 'bathhouse' ? 'Баня / Сауна' : 'Гараж / Мастерская',
        widthLabel: 'Ширина постройки W (м)',
        lengthLabel: 'Длина постройки L (м)',
        heightLabel: 'Высота стен H_wall (м)',
        hasPlanFootprintShape: true,
        hasInteriorAreaInsideWalls: true,
        hasMultiStoryAndBasement: false,
        hasPlinthAndFoundationSlab: true,
        hasRoofGeometry: true,
        hasRoofOverhang: true,
        hasRoofInsulation: true,
        hasWallInsulation: true,
        hasWindows: true,
        hasDoors: true,
        hasFireResistanceMaterial: false,
        hasBurialDepth: false,
        hasPipelineDiameter: false
      };

    case 'shed':
    case 'poultry':
      return {
        category,
        kind: 'unheated_outbuilding',
        categoryTitle: category === 'shed' ? 'Хозблок / Сарай' : 'Птичник / Вольер',
        widthLabel: 'Ширина постройки W (м)',
        lengthLabel: 'Длина постройки L (м)',
        heightLabel: 'Высота стен H_wall (м)',
        hasPlanFootprintShape: true,
        hasInteriorAreaInsideWalls: true,
        hasMultiStoryAndBasement: false,
        hasPlinthAndFoundationSlab: false,
        hasRoofGeometry: true,
        hasRoofOverhang: true,
        hasRoofInsulation: false,
        hasWallInsulation: false,
        hasWindows: true,
        hasDoors: true,
        hasFireResistanceMaterial: false,
        hasBurialDepth: false,
        hasPipelineDiameter: false
      };

    case 'greenhouse':
      return {
        category,
        kind: 'unheated_outbuilding',
        categoryTitle: 'Теплица / Оранжерея',
        widthLabel: 'Ширина теплицы W (м)',
        lengthLabel: 'Длина теплицы L (м)',
        heightLabel: 'Высота борта теплицы (м)',
        hasPlanFootprintShape: false,
        hasInteriorAreaInsideWalls: true,
        hasMultiStoryAndBasement: false,
        hasPlinthAndFoundationSlab: false,
        hasRoofGeometry: true,
        hasRoofOverhang: false,
        hasRoofInsulation: false,
        hasWallInsulation: false,
        hasWindows: false,
        hasDoors: true,
        hasFireResistanceMaterial: false,
        hasBurialDepth: false,
        hasPipelineDiameter: false
      };

    case 'toilet':
      return {
        category,
        kind: 'point_engineering',
        categoryTitle: 'Септик / ЛОС / Санузел',
        widthLabel: 'Ширина корпуса / септика (м)',
        lengthLabel: 'Длина корпуса / септика (м)',
        heightLabel: 'Надземная высота оголовка/кабины (м)',
        hasPlanFootprintShape: false,
        hasInteriorAreaInsideWalls: false,
        hasMultiStoryAndBasement: false,
        hasPlinthAndFoundationSlab: false,
        hasRoofGeometry: false,
        hasRoofOverhang: false,
        hasRoofInsulation: false,
        hasWallInsulation: false,
        hasWindows: false,
        hasDoors: false,
        hasFireResistanceMaterial: false,
        hasBurialDepth: true,
        hasPipelineDiameter: false
      };

    case 'well':
    case 'neighbor_well':
      return {
        category,
        kind: 'point_engineering',
        categoryTitle:
          category === 'well'
            ? 'Скважина / Питьевой колодец'
            : 'Колодец / Скважина соседа',
        widthLabel: 'Диаметр / габарит оголовка X (м)',
        lengthLabel: 'Диаметр / габарит оголовка Z (м)',
        heightLabel: 'Высота надземного кольца / оголовка (м)',
        hasPlanFootprintShape: false,
        hasInteriorAreaInsideWalls: false,
        hasMultiStoryAndBasement: false,
        hasPlinthAndFoundationSlab: false,
        hasRoofGeometry: false,
        hasRoofOverhang: false,
        hasRoofInsulation: false,
        hasWallInsulation: false,
        hasWindows: false,
        hasDoors: false,
        hasFireResistanceMaterial: false,
        hasBurialDepth: true,
        hasPipelineDiameter: false
      };

    case 'water_main':
    case 'sewer_main':
    case 'gas_pipe':
      return {
        category,
        kind: 'linear_pipeline',
        categoryTitle:
          category === 'water_main'
            ? 'Линейный трубопровод: Водопровод'
            : category === 'sewer_main'
            ? 'Линейный трубопровод: Канализация'
            : 'Линейный трубопровод: Газопровод',
        widthLabel: 'Протяженность трассы трубопровода (м)',
        lengthLabel: 'Ширина траншеи / тех. полосы (м)',
        heightLabel: null,
        hasPlanFootprintShape: false,
        hasInteriorAreaInsideWalls: false,
        hasMultiStoryAndBasement: false,
        hasPlinthAndFoundationSlab: false,
        hasRoofGeometry: false,
        hasRoofOverhang: false,
        hasRoofInsulation: false,
        hasWallInsulation: false,
        hasWindows: false,
        hasDoors: false,
        hasFireResistanceMaterial: false,
        hasBurialDepth: true,
        hasPipelineDiameter: true
      };

    case 'power_line':
      return {
        category,
        kind: 'overhead_or_road',
        categoryTitle: 'Воздушная / кабельная линия электропередачи (ЛЭП)',
        widthLabel: 'Протяженность линии ЛЭП (м)',
        lengthLabel: 'Ширина коридора трассы ЛЭП (м)',
        heightLabel: 'Высота опор ЛЭП (м)',
        hasPlanFootprintShape: false,
        hasInteriorAreaInsideWalls: false,
        hasMultiStoryAndBasement: false,
        hasPlinthAndFoundationSlab: false,
        hasRoofGeometry: false,
        hasRoofOverhang: false,
        hasRoofInsulation: false,
        hasWallInsulation: false,
        hasWindows: false,
        hasDoors: false,
        hasFireResistanceMaterial: false,
        hasBurialDepth: true,
        hasPipelineDiameter: false
      };

    case 'road':
      return {
        category,
        kind: 'overhead_or_road',
        categoryTitle: 'Автодорога / Проезд общего пользования',
        widthLabel: 'Протяженность участка дороги (м)',
        lengthLabel: 'Ширина проезжей части (м)',
        heightLabel: 'Высота бордюра / насыпи полотна (м)',
        hasPlanFootprintShape: false,
        hasInteriorAreaInsideWalls: false,
        hasMultiStoryAndBasement: false,
        hasPlinthAndFoundationSlab: false,
        hasRoofGeometry: false,
        hasRoofOverhang: false,
        hasRoofInsulation: false,
        hasWallInsulation: false,
        hasWindows: false,
        hasDoors: false,
        hasFireResistanceMaterial: false,
        hasBurialDepth: false,
        hasPipelineDiameter: false
      };

    case 'tree_tall':
    case 'tree_medium':
      return {
        category,
        kind: 'natural_feature',
        categoryTitle:
          category === 'tree_tall'
            ? 'Высокорослое дерево (норматив ≥ 4 м от межи)'
            : 'Среднерослое плодовое дерево (норматив ≥ 2 м от межи)',
        widthLabel: 'Диаметр кроны дерева X (м)',
        lengthLabel: 'Диаметр кроны дерева Z (м)',
        heightLabel: 'Полная высота дерева (м)',
        hasPlanFootprintShape: false,
        hasInteriorAreaInsideWalls: false,
        hasMultiStoryAndBasement: false,
        hasPlinthAndFoundationSlab: false,
        hasRoofGeometry: false,
        hasRoofOverhang: false,
        hasRoofInsulation: false,
        hasWallInsulation: false,
        hasWindows: false,
        hasDoors: false,
        hasFireResistanceMaterial: false,
        hasBurialDepth: false,
        hasPipelineDiameter: false
      };

    case 'forest':
      return {
        category,
        kind: 'natural_feature',
        categoryTitle: 'Лесной массив / Гослесфонд (разрыв 15 м СП 4.13130)',
        widthLabel: 'Протяженность кромки леса (м)',
        lengthLabel: 'Глубина лесной полосы (м)',
        heightLabel: 'Средняя высота древостоя (м)',
        hasPlanFootprintShape: false,
        hasInteriorAreaInsideWalls: false,
        hasMultiStoryAndBasement: false,
        hasPlinthAndFoundationSlab: false,
        hasRoofGeometry: false,
        hasRoofOverhang: false,
        hasRoofInsulation: false,
        hasWallInsulation: false,
        hasWindows: false,
        hasDoors: false,
        hasFireResistanceMaterial: false,
        hasBurialDepth: false,
        hasPipelineDiameter: false
      };

    case 'water_body':
    default:
      return {
        category,
        kind: 'natural_feature',
        categoryTitle: 'Водоем: Река / Ручей / Пруд (береговая полоса 20 м ВК РФ)',
        widthLabel: 'Протяженность береговой линии (м)',
        lengthLabel: 'Ширина акватории / русла (м)',
        heightLabel: null,
        hasPlanFootprintShape: false,
        hasInteriorAreaInsideWalls: false,
        hasMultiStoryAndBasement: false,
        hasPlinthAndFoundationSlab: false,
        hasRoofGeometry: false,
        hasRoofOverhang: false,
        hasRoofInsulation: false,
        hasWallInsulation: false,
        hasWindows: false,
        hasDoors: false,
        hasFireResistanceMaterial: false,
        hasBurialDepth: true,
        hasPipelineDiameter: false
      };
  }
}

/**
 * Returns default or user-configured corner elevations for the plot terrain relief.
 */
export function getEffectivePlotRelief(
  plot: Pick<PlotConfig, 'relief'>
): PlotReliefConfig {
  if (plot.relief) {
    return {
      elevationNW: Number.isFinite(plot.relief.elevationNW) ? roundToMm(plot.relief.elevationNW) : 145.6,
      elevationNE: Number.isFinite(plot.relief.elevationNE) ? roundToMm(plot.relief.elevationNE) : 145.3,
      elevationSE: Number.isFinite(plot.relief.elevationSE) ? roundToMm(plot.relief.elevationSE) : 144.4,
      elevationSW: Number.isFinite(plot.relief.elevationSW) ? roundToMm(plot.relief.elevationSW) : 144.8,
      showDrainageZones: plot.relief.showDrainageZones ?? true
    };
  }
  return {
    elevationNW: 145.6,
    elevationNE: 145.3,
    elevationSE: 144.4,
    elevationSW: 144.8,
    showDrainageZones: true
  };
}

/**
 * Calculates the surface slope of the plot based on corner terrain elevations (NW, NE, SE, SW)
 * and automatically generates stormwater drainage zones (перехватывающая нагорная дренажная канава,
 * направления поверхностного стока и нижняя зона водосбора / дренажный колодец-коллектор)
 * per СП 42.13330.2016, СП 32.13330.2018 и СП 250.1325800.2016.
 */
export function calculatePlotReliefAndDrainage(
  plot: PlotConfig,
  objects: SiteObject[] = []
): PlotReliefAnalysis {
  const relief = getEffectivePlotRelief(plot);
  const W = Math.max(6, plot.width || 28);
  const L = Math.max(6, plot.length || 36);
  const hw = W / 2;
  const hl = L / 2;

  const corners: Array<{
    id: 'NW' | 'NE' | 'SE' | 'SW';
    label: string;
    elev: number;
    pt: Point2D;
  }> = [
    { id: 'NW', label: 'СЗ (Северо-Запад)', elev: relief.elevationNW, pt: { x: -hw, z: -hl } },
    { id: 'NE', label: 'СВ (Северо-Восток)', elev: relief.elevationNE, pt: { x: hw, z: -hl } },
    { id: 'SE', label: 'ЮВ (Юго-Восток)', elev: relief.elevationSE, pt: { x: hw, z: hl } },
    { id: 'SW', label: 'ЮЗ (Юго-Запад)', elev: relief.elevationSW, pt: { x: -hw, z: hl } }
  ];

  const sortedByElev = [...corners].sort((a, b) => a.elev - b.elev);
  const lowestCorner = sortedByElev[0];
  const highestCorner = sortedByElev[sortedByElev.length - 1];

  const minElevationM = roundToMm(lowestCorner.elev);
  const maxElevationM = roundToMm(highestCorner.elev);
  const meanElevationM = roundToMm(
    (relief.elevationNW + relief.elevationNE + relief.elevationSE + relief.elevationSW) / 4
  );
  const elevationDeltaM = roundToMm(maxElevationM - minElevationM);

  // Compute partial derivatives of elevation z_elev(x, z):
  // Moving East (+X): average drop per meter = ((NW - NE) + (SW - SE)) / (2 * W)
  // Moving South (+Z): average drop per meter = ((NW - SW) + (NE - SE)) / (2 * L)
  const dropAlongEastPerM = (relief.elevationNW - relief.elevationNE + (relief.elevationSW - relief.elevationSE)) / (2 * W);
  const dropAlongSouthPerM = (relief.elevationNW - relief.elevationSW + (relief.elevationNE - relief.elevationSE)) / (2 * L);

  // Gradient of downhill water flow (steepest descent vector in X, Z):
  const gradMag = Math.hypot(dropAlongEastPerM, dropAlongSouthPerM);

  // Also check diagonal slope if opposite corners have greater slope than planar average
  const diagLen = Math.hypot(W, L);
  const diagSlope1 = Math.abs(relief.elevationNW - relief.elevationSE) / diagLen;
  const diagSlope2 = Math.abs(relief.elevationNE - relief.elevationSW) / diagLen;
  const effectiveSlopeRatio = Math.max(gradMag, diagSlope1, diagSlope2);

  const slopePercent = Number((effectiveSlopeRatio * 100).toFixed(2));
  const slopePermille = Number((effectiveSlopeRatio * 1000).toFixed(1));
  const slopeAngleDeg = Number(((Math.atan(effectiveSlopeRatio) * 180) / Math.PI).toFixed(2));

  let slopeVector: Point2D;
  if (gradMag > 1e-5) {
    slopeVector = {
      x: Number((dropAlongEastPerM / gradMag).toFixed(3)),
      z: Number((dropAlongSouthPerM / gradMag).toFixed(3))
    };
  } else if (elevationDeltaM > 1e-4) {
    const dx = lowestCorner.pt.x - highestCorner.pt.x;
    const dz = lowestCorner.pt.z - highestCorner.pt.z;
    const len = Math.hypot(dx, dz) || 1;
    slopeVector = {
      x: Number((dx / len).toFixed(3)),
      z: Number((dz / len).toFixed(3))
    };
  } else {
    // Default gentle drainage towards street (+Z South)
    slopeVector = { x: 0, z: 1 };
  }

  // Convert scene slopeVector (where -Z is 0° North, +X is 90° East, +Z is 180° South, -X is 270° West) to true compass azimuth
  const sceneAzDeg = ((Math.atan2(slopeVector.x, -slopeVector.z) * 180) / Math.PI + 360) % 360;
  const slopeDirectionAzimuthDeg = Math.round(((sceneAzDeg - (plot.northAngle || 0)) % 360 + 360) % 360);
  const slopeDirectionLabel = formatCompassDirectionRu(slopeDirectionAzimuthDeg);

  // Classify surface slope per СП 42.13330.2016 & СП 32.13330.2018:
  // - < 0.5% (5 ‰): Бессточный / плоский участок (риск застоя талых и ливневых вод, требуется искусственный разуклон и закрытый дренаж)
  // - 0.5% .. 3.0% (5 .. 30 ‰): Оптимальный спокойный рельеф (естественный самотек без размыва грунта)
  // - 3.0% .. 8.0% (30 .. 80 ‰): Умеренный склон (требуется перехватывающая нагорная канава и кольцевой дренаж фундамента)
  // - > 8.0% (> 80 ‰): Крутой склон (требуется георешетка, подпорные стенки / террасирование и гасители потока)
  let normativeCategory: PlotReliefAnalysis['normativeCategory'] = 'optimal';
  let normativeStatusLabel = 'Оптимальный уклон (0.5%–3.0%)';
  let recommendation =
    'Естественный уклон поверхности обеспечивает нормативный отвод дождевых и талых вод без заболачивания и эрозии почвенного слоя. Устройте ливнеприемный колодец в нижней точке участка.';

  if (slopePercent < 0.5) {
    normativeCategory = 'flat_stagnant';
    normativeStatusLabel = 'Плоский рельеф (< 0.5%) — риск застоя воды';
    recommendation =
      'Уклон поверхности менее минимально допустимых 5‰ (0.5% по СП 42.13330.2016)! Высокий риск застоя верховодки и подтопления фундамента весной. Выполните вертикальную планировку (подсыпку от дома к границам с уклоном ≥ 1%) и кольцевой трубчатый дренаж.';
  } else if (slopePercent > 8.0) {
    normativeCategory = 'steep_terracing';
    normativeStatusLabel = 'Крутой склон (> 8.0%) — террасирование';
    recommendation =
      'Уклон превышает 8% (80‰)! Высокий риск плоскостной эрозии грунта и сползания склона. Необходимо террасирование участка с подпорными стенками, устройство нагорной перехватывающей дрены выше дома и свайно-ростверковый/ступенчатый фундамент.';
  } else if (slopePercent > 3.0) {
    normativeCategory = 'moderate_slope';
    normativeStatusLabel = 'Выраженный уклон (3.0%–8.0%) — нагорный дренаж';
    recommendation =
      'При уклоне свыше 3% (30‰) ливневой поток с верхней части участка размывает отмостку здания. Обязательно устройство нагорной перехватывающей дренажной канавы перед постройками и сброс в дренажный колодец-коллектор в нижней точке.';
  }

  // Calculate design stormwater runoff Q (L/s) per СП 32.13330.2018 (метод предельных интенсивностей):
  // Q = psi_mid * q_20 * F_ha, where F_ha = plotArea / 10000
  const plotPoly = generatePlotPolygon(plot);
  const plotAreaSqm = Math.max(100, calculatePolygonArea(plotPoly) || W * L);
  const roofAreaTotalSqm = objects
    .filter((o) => isRoofedBuildingCategory(o.category) && !isExternalOrUtilityCategory(o.category))
    .reduce((acc, o) => acc + o.width * o.length, 0);
  const roofRatio = Math.min(0.6, roofAreaTotalSqm / plotAreaSqm);
  // Weighted runoff coefficient psi (roofs/paving = 0.90, lawn/soil = 0.22 + slope bonus)
  const psiWeighted = roofRatio * 0.9 + (1 - roofRatio) * Math.min(0.45, 0.2 + effectiveSlopeRatio * 1.5);
  const q20LitersPerSecHa = 80; // Средняя расчетная интенсивность 20-минутного ливня по РФ (л/(с·га))
  const stormwaterRunoffLitersPerSec = Number(
    ((psiWeighted * q20LitersPerSecHa * plotAreaSqm) / 10000).toFixed(2)
  );

  // Generate Automatic Stormwater Drainage Zones in plot coordinates:
  // 1. Uphill Interceptor Trench (Перехватывающая нагорная дренажная канава со стороны верхней отметки)
  const trenchInset = 1.4;
  const uphillCenter: Point2D = {
    x: roundToMm(-slopeVector.x * (hw - trenchInset * 1.5)),
    z: roundToMm(-slopeVector.z * (hl - trenchInset * 1.5))
  };
  const perpVec: Point2D = { x: -slopeVector.z, z: slopeVector.x };
  const trenchHalfSpan = Math.min(hw, hl) * 0.72;
  const trenchHalfWidth = 0.65;

  const interceptorPoints: Point2D[] = [
    {
      x: roundToMm(Math.max(-hw + 0.6, Math.min(hw - 0.6, uphillCenter.x - perpVec.x * trenchHalfSpan - slopeVector.x * trenchHalfWidth))),
      z: roundToMm(Math.max(-hl + 0.6, Math.min(hl - 0.6, uphillCenter.z - perpVec.z * trenchHalfSpan - slopeVector.z * trenchHalfWidth)))
    },
    {
      x: roundToMm(Math.max(-hw + 0.6, Math.min(hw - 0.6, uphillCenter.x + perpVec.x * trenchHalfSpan - slopeVector.x * trenchHalfWidth))),
      z: roundToMm(Math.max(-hl + 0.6, Math.min(hl - 0.6, uphillCenter.z + perpVec.z * trenchHalfSpan - slopeVector.z * trenchHalfWidth)))
    },
    {
      x: roundToMm(Math.max(-hw + 0.6, Math.min(hw - 0.6, uphillCenter.x + perpVec.x * trenchHalfSpan + slopeVector.x * trenchHalfWidth))),
      z: roundToMm(Math.max(-hl + 0.6, Math.min(hl - 0.6, uphillCenter.z + perpVec.z * trenchHalfSpan + slopeVector.z * trenchHalfWidth)))
    },
    {
      x: roundToMm(Math.max(-hw + 0.6, Math.min(hw - 0.6, uphillCenter.x - perpVec.x * trenchHalfSpan + slopeVector.x * trenchHalfWidth))),
      z: roundToMm(Math.max(-hl + 0.6, Math.min(hl - 0.6, uphillCenter.z - perpVec.z * trenchHalfSpan + slopeVector.z * trenchHalfWidth)))
    }
  ];

  // 2. Lowest-Corner Stormwater Collector Basin / Absorption Well (Нижняя зона водосбора и дренажный колодец)
  const collectorInset = 2.4;
  const collectorCenter: Point2D = {
    x: roundToMm(
      lowestCorner.pt.x > 0 ? lowestCorner.pt.x - collectorInset : lowestCorner.pt.x + collectorInset
    ),
    z: roundToMm(
      lowestCorner.pt.z > 0 ? lowestCorner.pt.z - collectorInset : lowestCorner.pt.z + collectorInset
    )
  };
  const collectorRadiusM = 2.2;
  const collectorPoints: Point2D[] = [];
  for (let k = 0; k < 8; k++) {
    const ang = (k * Math.PI) / 4;
    collectorPoints.push({
      x: roundToMm(collectorCenter.x + Math.cos(ang) * collectorRadiusM),
      z: roundToMm(collectorCenter.z + Math.sin(ang) * collectorRadiusM)
    });
  }

  // 3. Perimeter / Longitudinal Runoff Channel connecting uphill interceptor to lowest collector
  const midChannelPoint: Point2D = {
    x: roundToMm(lowestCorner.pt.x > 0 ? hw - 1.2 : -hw + 1.2),
    z: roundToMm(uphillCenter.z * 0.2)
  };

  const drainageZones: PlotDrainageZone[] = [
    {
      id: 'drainage-interceptor-trench',
      type: 'interceptor_trench',
      title: 'Нагорная перехватывающая дрена',
      description: `Отсекает поверхностный сток со стороны верхней отметки (${maxElevationM.toFixed(2)} м, ${highestCorner.label})`,
      points: interceptorPoints,
      center: uphillCenter
    },
    {
      id: 'drainage-runoff-channel',
      type: 'runoff_channel',
      title: 'Ливневой лоток / дренажная магистраль',
      description: `Трасса отвода ливневых вод (${stormwaterRunoffLitersPerSec} л/с) по уклону ${slopePercent}% (${slopePermille}‰)`,
      points: [uphillCenter, midChannelPoint, collectorCenter],
      center: midChannelPoint
    },
    {
      id: 'drainage-collector-well',
      type: 'collector_well',
      title: 'Зона водосбора (Дренажный колодец-коллектор)',
      description: `Нижняя точка рельефа (${minElevationM.toFixed(2)} м, ${lowestCorner.label}) для приемного колодца или поля фильтрации`,
      points: collectorPoints,
      center: collectorCenter,
      radiusM: collectorRadiusM
    }
  ];

  return {
    elevationNW: relief.elevationNW,
    elevationNE: relief.elevationNE,
    elevationSE: relief.elevationSE,
    elevationSW: relief.elevationSW,
    minElevationM,
    maxElevationM,
    meanElevationM,
    elevationDeltaM,
    slopePercent,
    slopePermille,
    slopeAngleDeg,
    slopeVector,
    slopeDirectionAzimuthDeg,
    slopeDirectionLabel,
    highestCornerLabel: highestCorner.label,
    lowestCornerLabel: lowestCorner.label,
    lowestCornerPoint: lowestCorner.pt,
    highestCornerPoint: highestCorner.pt,
    normativeCategory,
    normativeStatusLabel,
    normCode: 'СП 42.13330.2016 п. 13.2 / СП 32.13330.2018 (Водоотвод)',
    stormwaterRunoffLitersPerSec,
    recommendation,
    drainageZones
  };
}





/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { PlotConfig, SiteObject, BuildingCategory } from './types';
import {
  validateSitePlan,
  getObjectWindowsConfig,
  getObjectDoorsConfig,
  calculateSnowLoad,
  calculateFoundationBearing,
  calculateBillOfMaterials,
  getDefaultAdjacentParcels,
  calculateBuildingInteriorArea,
  calculateEnergyAndHeating,
  calculateBuildingInsolationSanPin,
  calculateBuildingThermalHeatmap
} from './utils/calculations';
import { BUILDING_CATEGORY_LABELS } from './data/regions';
import { LeftSidebar } from './components/LeftSidebar';
import { Viewport2D3D } from './components/Viewport2D3D';
import { RightInspector } from './components/RightInspector';
import { SunTimelineBar } from './components/SunTimelineBar';
import { NeighborConsentModal } from './components/NeighborConsentModal';
import { ViolationClaimModal } from './components/ViolationClaimModal';
import { BOMExportModal } from './components/BOMExportModal';
import { MCPServerModal, MCPToolCallResult } from './components/MCPServerModal';
import { PromoVideoShowcaseModal } from './components/PromoVideoShowcaseModal';
import { PromoSceneStateAction } from './utils/promoVideoScript';
import { downloadUrbanPlanningPdfReport } from './utils/pdfReportGenerator';

const STORAGE_KEY = 'genplan_expert_rf_project_v2';

declare global {
  interface Window {
    mcpServer?: {
      callTool: (name: string, args?: Record<string, unknown>) => Promise<unknown>;
      handleRpc: (rpcPayload: Record<string, unknown>) => Promise<MCPToolCallResult>;
      getState: () => { plot: PlotConfig; objects: SiteObject[] };
    };
  }
}

const INITIAL_PLOT: PlotConfig = {
  preset: 'rectangle',
  width: 28,
  length: 36,
  trapezoidTopWidth: 20,
  lCutoutWidth: 10,
  lCutoutLength: 12,
  points: [],
  edges: [
    // Edge 0: South (Street / Красная линия 5 м)
    { edgeIndex: 0, type: 'street', fenceType: 'solid', fenceHeight: 2.0, hasNeighborConsent: false },
    // Edge 1: East (Neighbor)
    { edgeIndex: 1, type: 'neighbor', fenceType: 'mesh', fenceHeight: 1.5, hasNeighborConsent: false },
    // Edge 2: North (Neighbor)
    { edgeIndex: 2, type: 'neighbor', fenceType: 'mesh', fenceHeight: 1.5, hasNeighborConsent: false },
    // Edge 3: West (Driveway / Проезд 3 м)
    { edgeIndex: 3, type: 'driveway', fenceType: 'solid', fenceHeight: 1.8, hasNeighborConsent: false }
  ],
  category: 'SNT',
  northAngle: 0,
  regionId: 'moscow',
  soilTypeId: 'loam',
  hasZouit: false,
  zouitEdgeIndex: 0,
  zouitDepth: 5,
  baseFieldMultiplier: 4,
  mainParcelName: 'Мой участок (ИЖС / СНТ)',
  adjacentParcels: getDefaultAdjacentParcels({ width: 28, length: 36 }),
  heatingTariffs: {
    electricityRubPerKwh: 6.5,
    gasRubPerM3: 7.8,
    firewoodRubPerM3: 3200
  }
};

const INITIAL_OBJECTS: SiteObject[] = [
  {
    id: 'house-main',
    name: 'Жилой дом',
    category: 'house',
    x: -2,
    z: 3,
    width: 9,
    length: 10,
    wallHeight: 5.85,
    roofHeight: 2.6,
    overhang: 0.45,
    rotation: 0,
    roofType: 'gable',
    footprintShape: 'rectangle',
    windows: {
      south: 2,
      north: 1,
      east: 1,
      west: 1,
      windowWidth: 1.4,
      windowHeight: 1.4,
      sillHeight: 0.9,
      positionOffset: 0
    },
    doors: {
      south: 1,
      north: 0,
      east: 0,
      west: 0,
      doorWidth: 0.95,
      doorHeight: 2.05,
      thresholdHeight: 0.05,
      positionOffset: 0,
      hasGlazing: false
    },
    slopeDirection: 'south',
    material: 'stone',
    floors: 2,
    floorHeight: 2.8,
    hasBasement: false,
    basementDepth: 2.4,
    interfloorSlabThickness: 0.25,
    plinthHeight: 0.45,
    foundationSlabOverhang: 0.25,
    foundationSlabThickness: 0.3,
    wallThickness: 0.4,
    parcelId: 'main_plot',
    glazingRatio: 0.15,
    partitionLength: 26,
    wallMaterialId: 'aerated_concrete',
    roofCoverId: 'metal_tile',
    foundationTypeId: 'deep_strip'
  },
  {
    id: 'bath-1',
    name: 'Баня / Сауна',
    category: 'bathhouse',
    x: 8.5,
    z: -12,
    width: 5,
    length: 6,
    wallHeight: 2.7,
    roofHeight: 1.6,
    overhang: 0.35,
    rotation: 0,
    roofType: 'shed',
    footprintShape: 'rectangle',
    windows: {
      south: 1,
      north: 0,
      east: 1,
      west: 0,
      windowWidth: 1.4,
      windowHeight: 1.4,
      sillHeight: 0.9,
      positionOffset: 0
    },
    slopeDirection: 'west',
    material: 'wood',
    floors: 1,
    floorHeight: 2.7,
    hasBasement: false,
    basementDepth: 2.0,
    interfloorSlabThickness: 0.2,
    plinthHeight: 0.35,
    foundationSlabOverhang: 0.15,
    foundationSlabThickness: 0.25,
    wallThickness: 0.2,
    parcelId: 'main_plot',
    glazingRatio: 0.1,
    partitionLength: 6,
    wallMaterialId: 'timber',
    roofCoverId: 'metal_tile',
    foundationTypeId: 'mzlf'
  },
  {
    id: 'well-1',
    name: 'Скважина',
    category: 'well',
    x: -9,
    z: -11,
    width: 1.6,
    length: 1.6,
    wallHeight: 1.2,
    roofHeight: 0.6,
    overhang: 0.2,
    rotation: 0,
    roofType: 'gable',
    footprintShape: 'rectangle',
    windows: {
      south: 0,
      north: 0,
      east: 0,
      west: 0,
      windowWidth: 1.4,
      windowHeight: 1.4,
      sillHeight: 0.9,
      positionOffset: 0
    },
    slopeDirection: 'south',
    material: 'stone',
    floors: 1,
    burialDepth: 3.5,
    parcelId: 'main_plot',
    glazingRatio: 0,
    partitionLength: 0,
    wallMaterialId: 'aerated_concrete',
    roofCoverId: 'metal_tile',
    foundationTypeId: 'mzlf'
  },
  {
    id: 'septic-1',
    name: 'Септик',
    category: 'toilet',
    x: 10,
    z: 11.5,
    width: 2.2,
    length: 2.2,
    wallHeight: 2.2,
    roofHeight: 0.4,
    overhang: 0.2,
    rotation: 0,
    roofType: 'flat',
    footprintShape: 'rectangle',
    windows: {
      south: 0,
      north: 0,
      east: 0,
      west: 0,
      windowWidth: 1.4,
      windowHeight: 1.4,
      sillHeight: 0.9,
      positionOffset: 0
    },
    slopeDirection: 'south',
    material: 'stone',
    floors: 1,
    burialDepth: 2.2,
    parcelId: 'main_plot',
    glazingRatio: 0,
    partitionLength: 0,
    wallMaterialId: 'aerated_concrete',
    roofCoverId: 'corrugated',
    foundationTypeId: 'slab'
  },
  {
    id: 'neighbor-house-east',
    name: 'Дом соседа',
    category: 'neighbor_house',
    x: 19.5,
    z: 2,
    width: 8,
    length: 9,
    wallHeight: 3.2,
    roofHeight: 2.4,
    overhang: 0.4,
    rotation: 0,
    roofType: 'hip',
    footprintShape: 'rectangle',
    windows: {
      south: 2,
      north: 1,
      east: 1,
      west: 1,
      windowWidth: 1.4,
      windowHeight: 1.4,
      sillHeight: 0.9,
      positionOffset: 0
    },
    slopeDirection: 'south',
    material: 'wood',
    floors: 1,
    floorHeight: 2.8,
    wallThickness: 0.25,
    parcelId: 'parcel-neighbor-east',
    glazingRatio: 0.15,
    partitionLength: 14,
    wallMaterialId: 'timber',
    roofCoverId: 'metal_tile',
    foundationTypeId: 'mzlf'
  }
];

interface SavedProjectPayload {
  version: number;
  savedAt: string;
  plot: PlotConfig;
  objects: SiteObject[];
  viewMode?: '3d' | '2d';
  showForbiddenZones?: boolean;
  xrayWallsMode?: boolean;
  undergroundViewMode?: boolean;
  thermalHeatmapMode?: boolean;
  dayOfYear?: number;
  hourOfDay?: number;
}

function normalizeSiteObject(obj: SiteObject): SiteObject {
  const cleanedName = obj.name
    ? obj.name.replace(/\s*\((Восток|Запад|Север|Юг)\)/gi, '').trim()
    : obj.name;
  return {
    ...obj,
    name: cleanedName,
    footprintShape: obj.footprintShape || 'rectangle',
    windows: getObjectWindowsConfig(obj),
    doors: getObjectDoorsConfig(obj)
  };
}

function loadSavedProject(): SavedProjectPayload | null {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return null;
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<SavedProjectPayload>;
    if (!parsed || !parsed.plot || !Array.isArray(parsed.objects)) return null;
    const mergedPlot: PlotConfig = {
      ...INITIAL_PLOT,
      ...parsed.plot,
      mainParcelName: parsed.plot.mainParcelName || INITIAL_PLOT.mainParcelName,
      adjacentParcels:
        parsed.plot.adjacentParcels && parsed.plot.adjacentParcels.length > 0
          ? parsed.plot.adjacentParcels
          : getDefaultAdjacentParcels(parsed.plot),
      heatingTariffs: {
        ...INITIAL_PLOT.heatingTariffs!,
        ...(parsed.plot.heatingTariffs || {})
      }
    };
    return {
      version: 2,
      savedAt: parsed.savedAt || new Date().toISOString(),
      plot: mergedPlot,
      objects: parsed.objects.map(normalizeSiteObject),
      viewMode: parsed.viewMode === '2d' ? '2d' : '3d',
      showForbiddenZones: parsed.showForbiddenZones ?? true,
      xrayWallsMode: parsed.xrayWallsMode ?? false,
      undergroundViewMode: parsed.undergroundViewMode ?? false,
      thermalHeatmapMode: parsed.thermalHeatmapMode ?? false,
      dayOfYear: typeof parsed.dayOfYear === 'number' ? parsed.dayOfYear : 172,
      hourOfDay: typeof parsed.hourOfDay === 'number' ? parsed.hourOfDay : 14.5
    };
  } catch {
    return null;
  }
}

export default function App() {
  const initialSaved = useMemo(() => loadSavedProject(), []);

  const [plot, setPlot] = useState<PlotConfig>(() => initialSaved?.plot || INITIAL_PLOT);
  const [objects, setObjects] = useState<SiteObject[]>(
    () => (initialSaved?.objects || INITIAL_OBJECTS).map(normalizeSiteObject)
  );
  const [selectedObjectId, setSelectedObjectId] = useState<string | null>(() => {
    const list = initialSaved?.objects || INITIAL_OBJECTS;
    return list[0]?.id || null;
  });
  const [selectedEdgeIndex, setSelectedEdgeIndex] = useState<number | null>(null);

  const [viewMode, setViewMode] = useState<'3d' | '2d'>(() => initialSaved?.viewMode || '3d');
  const [showForbiddenZones, setShowForbiddenZones] = useState<boolean>(
    () => initialSaved?.showForbiddenZones ?? true
  );
  const [xrayWallsMode, setXrayWallsMode] = useState<boolean>(
    () => initialSaved?.xrayWallsMode ?? false
  );
  const [undergroundViewMode, setUndergroundViewMode] = useState<boolean>(
    () => initialSaved?.undergroundViewMode ?? false
  );
  const [thermalHeatmapMode, setThermalHeatmapMode] = useState<boolean>(
    () => initialSaved?.thermalHeatmapMode ?? false
  );
  const [dayOfYear, setDayOfYear] = useState<number>(() => initialSaved?.dayOfYear ?? 172);
  const [hourOfDay, setHourOfDay] = useState<number>(() => initialSaved?.hourOfDay ?? 14.5);
  const [saveStatusText, setSaveStatusText] = useState<string>('Автосохранение ВКЛ');

  // Modals state
  const [consentModalState, setConsentModalState] = useState<{
    isOpen: boolean;
    edgeIndex?: number;
    objectId?: string;
  }>({ isOpen: false });
  const [isClaimModalOpen, setIsClaimModalOpen] = useState<boolean>(false);
  const [isBOMModalOpen, setIsBOMModalOpen] = useState<boolean>(false);
  const [isMCPModalOpen, setIsMCPModalOpen] = useState<boolean>(false);
  const [isPromoVideoOpen, setIsPromoVideoOpen] = useState<boolean>(false);

  const snapshotGetterRef = useRef<(() => string) | null>(null);

  // Automatic localStorage persistence + backend MCP state sync whenever project state changes
  useEffect(() => {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        const payload: SavedProjectPayload = {
          version: 2,
          savedAt: new Date().toISOString(),
          plot,
          objects,
          viewMode,
          showForbiddenZones,
          xrayWallsMode,
          undergroundViewMode,
          thermalHeatmapMode,
          dayOfYear,
          hourOfDay
        };
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
      }
      if (typeof fetch !== 'undefined') {
        fetch('/api/mcp/state', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ plot, objects })
        }).catch(() => {
          // Ignore network errors if offline
        });
      }
    } catch {
      // Ignore storage quota errors in restricted environments
    }
  }, [
    plot,
    objects,
    viewMode,
    showForbiddenZones,
    xrayWallsMode,
    undergroundViewMode,
    thermalHeatmapMode,
    dayOfYear,
    hourOfDay
  ]);

  // Real-time Normative Validation
  const violations = useMemo(() => {
    return validateSitePlan(plot, objects, 0);
  }, [plot, objects]);

  // Object CRUD Handlers
  const handleAddObject = useCallback(
    (category: BuildingCategory, customName?: string, overrides?: Partial<SiteObject>) => {
      const meta = BUILDING_CATEGORY_LABELS[category] || {
        label: 'Постройка',
        shortLabel: 'Объект'
      };
      const id = `${category}-${Date.now().toString().slice(-4)}`;
      const isNeighbor = category === 'neighbor_house' || category === 'neighbor_well';

      const defaultsByCat: Record<
        BuildingCategory,
        {
          w: number;
          l: number;
          hWall: number;
          hRoof: number;
          roof: SiteObject['roofType'];
          x: number;
          z: number;
        }
      > = {
        house: { w: 9, l: 10, hWall: 5.85, hRoof: 2.5, roof: 'gable', x: 0, z: 0 },
        bathhouse: { w: 5, l: 6, hWall: 2.7, hRoof: 1.5, roof: 'gable', x: 6, z: -8 },
        garage: { w: 4.5, l: 7, hWall: 2.8, hRoof: 1.2, roof: 'shed', x: -7, z: 9 },
        shed: { w: 3, l: 4, hWall: 2.4, hRoof: 0.9, roof: 'shed', x: 8, z: -12 },
        greenhouse: { w: 3, l: 6, hWall: 2.1, hRoof: 0.8, roof: 'gable', x: -6, z: -6 },
        poultry: { w: 3.5, l: 4.5, hWall: 2.4, hRoof: 1.1, roof: 'shed', x: 7, z: -11 },
        toilet: { w: 2.0, l: 2.0, hWall: 2.2, hRoof: 0.4, roof: 'flat', x: 8, z: 10 },
        well: { w: 1.6, l: 1.6, hWall: 1.2, hRoof: 0.6, roof: 'gable', x: -8, z: -10 },
        neighbor_house: {
          w: 8,
          l: 9,
          hWall: 3.2,
          hRoof: 2.5,
          roof: 'hip',
          x: plot.width / 2 + 6,
          z: 0
        },
        neighbor_well: {
          w: 1.6,
          l: 1.6,
          hWall: 1.2,
          hRoof: 0.6,
          roof: 'gable',
          x: -plot.width / 2 - 4,
          z: -5
        },
        forest: { w: 14, l: 8, hWall: 8.5, hRoof: 0, roof: 'flat', x: 0, z: -plot.length / 2 - 6 },
        tree_tall: { w: 2.5, l: 2.5, hWall: 6.5, hRoof: 0, roof: 'flat', x: -8, z: -12 },
        tree_medium: { w: 1.8, l: 1.8, hWall: 3.2, hRoof: 0, roof: 'flat', x: -5, z: -12 },
        water_body: {
          w: 16,
          l: 6,
          hWall: 0.5,
          hRoof: 0,
          roof: 'flat',
          x: -plot.width / 2 - 8,
          z: -8
        },
        power_line: {
          w: 28,
          l: 2.0,
          hWall: 7.5,
          hRoof: 0,
          roof: 'flat',
          x: 0,
          z: plot.length / 2 + 5
        },
        gas_pipe: {
          w: 28,
          l: 1.4,
          hWall: 1.2,
          hRoof: 0,
          roof: 'flat',
          x: 0,
          z: plot.length / 2 + 3
        },
        water_main: {
          w: 16,
          l: 1.2,
          hWall: 1.0,
          hRoof: 0,
          roof: 'flat',
          x: -1,
          z: 8.5
        },
        sewer_main: {
          w: 14,
          l: 1.2,
          hWall: 1.0,
          hRoof: 0,
          roof: 'flat',
          x: 2,
          z: 11.5
        },
        road: { w: 34, l: 6.0, hWall: 0.2, hRoof: 0, roof: 'flat', x: 0, z: plot.length / 2 + 4.5 }
      };

      const d = defaultsByCat[category] || defaultsByCat.house;
      let spawnX = overrides?.x ?? d.x;
      let spawnZ = overrides?.z ?? d.z;
      const sameSpotCount = objects.filter(
        (o) => Math.hypot(o.x - spawnX, o.z - spawnZ) < 3.5
      ).length;
      if (sameSpotCount > 0 && overrides?.x === undefined) {
        spawnX = Number((spawnX - 6 * sameSpotCount).toFixed(1));
        spawnZ = Number((spawnZ - 4 * sameSpotCount).toFixed(1));
      }

      const trimmedCustom = customName?.trim();
      const defaultObjName =
        category === 'neighbor_house' ? 'Дом соседа' : `${meta.shortLabel} #${objects.length + 1}`;

      const newObj: SiteObject = normalizeSiteObject({
        id,
        name: trimmedCustom || defaultObjName,
        category,
        x: spawnX,
        z: spawnZ,
        width: d.w,
        length: d.l,
        wallHeight: d.hWall,
        roofHeight: d.hRoof,
        overhang: 0.4,
        rotation: 0,
        roofType: d.roof,
        footprintShape: 'rectangle',
        slopeDirection: 'south',
        material: category === 'house' || category === 'garage' ? 'stone' : 'wood',
        floors: category === 'house' ? 2 : 1,
        floorHeight: 2.8,
        hasBasement: false,
        basementDepth: 2.4,
        interfloorSlabThickness: 0.25,
        plinthHeight: 0.45,
        foundationSlabOverhang: 0.25,
        foundationSlabThickness: 0.3,
        wallThickness: category === 'house' ? 0.4 : 0.2,
        glazingRatio: isNeighbor ? 0.15 : 0.15,
        partitionLength: category === 'house' ? 22 : 4,
        wallMaterialId: category === 'house' ? 'aerated_concrete' : 'timber',
        roofCoverId: 'metal_tile',
        foundationTypeId: category === 'house' ? 'deep_strip' : 'mzlf',
        ...overrides
      });

      setObjects((prev) => [...prev, newObj]);
      setSelectedObjectId(newObj.id);
      return newObj;
    },
    [objects, plot.length, plot.width]
  );

  const handleDuplicateObject = (id: string) => {
    const orig = objects.find((o) => o.id === id);
    if (!orig) return;
    const newId = `${orig.category}-${Date.now().toString().slice(-4)}`;
    const copy: SiteObject = {
      ...orig,
      id: newId,
      name: `${orig.name} (копия)`,
      x: Number((orig.x + 2.5).toFixed(1)),
      z: Number((orig.z + 2.5).toFixed(1))
    };
    setObjects((prev) => [...prev, copy]);
    setSelectedObjectId(newId);
  };

  const handleUpdateObject = (id: string, updater: (prev: SiteObject) => SiteObject) => {
    setObjects((prev) => prev.map((o) => (o.id === id ? updater(o) : o)));
    setSelectedObjectId(id);
  };

  const handleMoveObject = (id: string, x: number, z: number) => {
    setObjects((prev) =>
      prev.map((o) => (o.id === id ? { ...o, x, z, parcelId: undefined } : o))
    );
  };

  const handleDeleteObject = useCallback(
    (id: string) => {
      const filtered = objects.filter((o) => o.id !== id);
      setObjects(filtered);
      if (selectedObjectId === id) {
        setSelectedObjectId(filtered[0]?.id || null);
      }
    },
    [objects, selectedObjectId]
  );

  const handleClearAllObjects = () => {
    setObjects([]);
    setSelectedObjectId(null);
  };

  const handleToggleXrayWalls = (forceValue?: boolean) => {
    setXrayWallsMode((prev) => (typeof forceValue === 'boolean' ? forceValue : !prev));
  };

  const handleToggleUndergroundView = (forceValue?: boolean) => {
    setUndergroundViewMode((prev) => (typeof forceValue === 'boolean' ? forceValue : !prev));
  };

  const handleToggleThermalHeatmap = (forceValue?: boolean) => {
    setThermalHeatmapMode((prev) => (typeof forceValue === 'boolean' ? forceValue : !prev));
  };

  const handleApplyPromoSceneState = useCallback((action: PromoSceneStateAction) => {
    setViewMode(action.viewMode);
    setShowForbiddenZones(action.showForbiddenZones);
    setXrayWallsMode(action.xrayWallsMode);
    setUndergroundViewMode(action.undergroundViewMode);
    setThermalHeatmapMode(action.thermalHeatmapMode);
    setDayOfYear(action.dayOfYear);
    setHourOfDay(action.hourOfDay);
    setObjects((prev) => {
      if (action.selectedObjectCategory) {
        const target = prev.find((o) => o.category === action.selectedObjectCategory);
        if (target) {
          setSelectedObjectId(target.id);
        }
      }
      if (!action.demoHousePatch) return prev;
      const patch = action.demoHousePatch;
      return prev.map((obj) => {
        if (obj.category !== 'house') return obj;
        const nextFloors = patch.floors ?? obj.floors ?? 2;
        const floorH = obj.floorHeight ?? 2.8;
        const prevWin = obj.windows || {
          north: 1,
          south: 2,
          east: 2,
          west: 1
        };
        return {
          ...obj,
          x: patch.x !== undefined ? patch.x : obj.x,
          z: patch.z !== undefined ? patch.z : obj.z,
          width: patch.width !== undefined ? patch.width : obj.width,
          length: patch.length !== undefined ? patch.length : obj.length,
          floors: nextFloors,
          wallHeight: Number((nextFloors * floorH).toFixed(2)),
          hasBasement: patch.hasBasement !== undefined ? patch.hasBasement : obj.hasBasement,
          roofType: patch.roofType !== undefined ? patch.roofType : obj.roofType,
          windows: {
            ...prevWin,
            south: patch.southWindows !== undefined ? patch.southWindows : prevWin.south,
            east: patch.eastWindows !== undefined ? patch.eastWindows : prevWin.east,
            positionOffset:
              patch.windowOffset !== undefined ? patch.windowOffset : prevWin.positionOffset
          }
        };
      });
    });
    if (typeof action.showDrainageZones === 'boolean') {
      setPlot((prev) => ({
        ...prev,
        relief: {
          elevationNW: prev.relief?.elevationNW ?? 145.6,
          elevationNE: prev.relief?.elevationNE ?? 145.2,
          elevationSW: prev.relief?.elevationSW ?? 144.8,
          elevationSE: prev.relief?.elevationSE ?? 144.4,
          showDrainageZones: action.showDrainageZones!
        }
      }));
    }
  }, []);

  // Execute MCP JSON-RPC 2.0 request against server AND synchronize local React state
  const handleExecuteMcpRpc = useCallback(
    async (rpcPayload: Record<string, unknown>): Promise<MCPToolCallResult> => {
      try {
        await fetch('/api/mcp/state', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ plot, objects })
        });
        const response = await fetch('/mcp', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(rpcPayload)
        });
        const json = (await response.json()) as MCPToolCallResult & {
          result?: { state?: { plot: PlotConfig; objects: SiteObject[] } };
        };
        if (
          json.result &&
          typeof json.result === 'object' &&
          'state' in json.result &&
          json.result.state
        ) {
          const nextState = json.result.state;
          if (nextState.plot) setPlot(nextState.plot);
          if (Array.isArray(nextState.objects)) {
            const normalized = nextState.objects.map(normalizeSiteObject);
            setObjects(normalized);
            if (normalized.length > 0) {
              setSelectedObjectId(normalized[normalized.length - 1].id);
            }
          }
        }
        return json;
      } catch (err) {
        return {
          jsonrpc: '2.0',
          id: (rpcPayload.id as number | string) ?? 1,
          error: {
            code: -32000,
            message: err instanceof Error ? err.message : 'Ошибка выполнения MCP-вызова'
          }
        };
      }
    },
    [objects, plot]
  );

  // Expose window.mcpServer bridge for browser AI agents & automated testing
  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.mcpServer = {
      getState: () => ({ plot, objects }),
      handleRpc: handleExecuteMcpRpc,
      callTool: async (name: string, args: Record<string, unknown> = {}) => {
        if (name === 'get_site_plan') {
          return { plot, objects, violations: validateSitePlan(plot, objects, 0) };
        }
        if (name === 'validate_sp_regulations') {
          const v = validateSitePlan(plot, objects, 0);
          return {
            compliant: v.filter((i) => i.severity === 'error').length === 0,
            violations: v
          };
        }
        if (name === 'calculate_engineering_and_bom') {
          const obj = objects.find((o) => o.id === args.objectId) || objects[0];
          if (!obj) return null;
          return {
            snowLoad: calculateSnowLoad(obj, plot.regionId),
            foundation: calculateFoundationBearing(obj, plot.regionId, plot.soilTypeId),
            interiorArea: calculateBuildingInteriorArea(obj),
            energyAndHeating: calculateEnergyAndHeating(obj, plot),
            insolationSanPin: calculateBuildingInsolationSanPin(
              obj,
              plot,
              objects,
              dayOfYear
            ),
            thermalHeatmap: calculateBuildingThermalHeatmap(obj, plot),
            bom: calculateBillOfMaterials(plot, objects)
          };
        }
        const rpcRes = await handleExecuteMcpRpc({
          jsonrpc: '2.0',
          id: Date.now(),
          method: 'tools/call',
          params: { name, arguments: args }
        });
        return rpcRes.result;
      }
    };
  }, [dayOfYear, handleExecuteMcpRpc, hourOfDay, objects, plot]);

  // Keyboard shortcuts: Escape closes modals, Delete/Backspace deletes selected building
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setConsentModalState({ isOpen: false });
        setIsClaimModalOpen(false);
        setIsBOMModalOpen(false);
        setIsMCPModalOpen(false);
        setIsPromoVideoOpen(false);
        return;
      }
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedObjectId) {
        const tag = (e.target as HTMLElement | null)?.tagName;
        if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;
        handleDeleteObject(selectedObjectId);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [handleDeleteObject, selectedObjectId]);

  // Project Save / Load / Reset Handlers
  const handleSaveProjectNow = () => {
    try {
      const payload: SavedProjectPayload = {
        version: 2,
        savedAt: new Date().toISOString(),
        plot,
        objects,
        viewMode,
        showForbiddenZones,
        xrayWallsMode,
        undergroundViewMode,
        thermalHeatmapMode,
        dayOfYear,
        hourOfDay
      };
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
      const nowTime = new Date().toLocaleTimeString('ru-RU', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
      });
      setSaveStatusText(`Сохранено в ${nowTime}`);
    } catch {
      setSaveStatusText('Ошибка сохранения');
    }
  };

  const handleExportProjectJson = () => {
    const payload: SavedProjectPayload = {
      version: 2,
      savedAt: new Date().toISOString(),
      plot,
      objects,
      viewMode,
      showForbiddenZones,
      xrayWallsMode,
      undergroundViewMode,
      thermalHeatmapMode,
      dayOfYear,
      hourOfDay
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `genplan-project-${plot.regionId}.json`;
    link.click();
    URL.revokeObjectURL(url);
    setSaveStatusText('Файл JSON скачан');
  };

  const handleImportProjectJson = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result)) as Partial<SavedProjectPayload>;
        if (parsed && parsed.plot && Array.isArray(parsed.objects)) {
          const nextPlot = { ...INITIAL_PLOT, ...parsed.plot };
          const nextObjs = parsed.objects.map(normalizeSiteObject);
          setPlot(nextPlot);
          setObjects(nextObjs);
          setSelectedObjectId(nextObjs[0]?.id || null);
          if (parsed.dayOfYear) setDayOfYear(parsed.dayOfYear);
          if (parsed.hourOfDay) setHourOfDay(parsed.hourOfDay);
          setSaveStatusText('Проект загружен');
        }
      } catch {
        setSaveStatusText('Неверный формат JSON');
      }
    };
    reader.readAsText(file);
  };

  const handleResetProject = () => {
    setPlot(INITIAL_PLOT);
    setObjects(INITIAL_OBJECTS);
    setSelectedObjectId(INITIAL_OBJECTS[0].id);
    setSelectedEdgeIndex(null);
    setUndergroundViewMode(false);
    setThermalHeatmapMode(false);
    setDayOfYear(172);
    setHourOfDay(14.5);
    try {
      window.localStorage.removeItem(STORAGE_KEY);
    } catch {
      // Ignore
    }
    setSaveStatusText('Сброшено к исходному');
  };

  const handleExportMasterPlanPng = () => {
    if (snapshotGetterRef.current) {
      const dataUrl = snapshotGetterRef.current();
      const link = document.createElement('a');
      link.href = dataUrl;
      link.download = `genplan-${plot.regionId}-${viewMode}.png`;
      link.click();
    }
  };

  return (
    <div className="h-screen w-screen flex flex-col bg-slate-950 text-slate-100 overflow-hidden">
      {/* Strict 3-Zone Top Bar Contract */}
      <header className="flex items-center justify-between gap-6 px-6 py-3 bg-slate-900 border-b border-slate-800 shrink-0">
        {/* Zone 1: Single text element wordmark */}
        <a
          href="#top"
          onClick={(e) => e.preventDefault()}
          className="text-base font-bold tracking-tight text-white whitespace-nowrap shrink-0"
        >
          ГенПлан-Эксперт РФ 3D
        </a>

        {/* Zone 2: Navigation links including MCP Server */}
        <nav className="hidden md:flex items-center gap-5 text-xs font-medium text-slate-300">
          <a
            href="#view-3d"
            onClick={(e) => {
              e.preventDefault();
              setViewMode('3d');
            }}
            className={`hover:text-white transition-colors whitespace-nowrap shrink-0 ${
              viewMode === '3d' ? 'text-sky-400 underline underline-offset-4' : ''
            }`}
          >
            3D Моделирование
          </a>
          <a
            href="#view-2d"
            onClick={(e) => {
              e.preventDefault();
              setViewMode('2d');
            }}
            className={`hover:text-white transition-colors whitespace-nowrap shrink-0 ${
              viewMode === '2d' ? 'text-sky-400 underline underline-offset-4' : ''
            }`}
          >
            2D Чертеж отступов
          </a>
          <a
            href="#consent"
            onClick={(e) => {
              e.preventDefault();
              setConsentModalState({ isOpen: true, edgeIndex: 1 });
            }}
            className="hover:text-white transition-colors whitespace-nowrap shrink-0"
          >
            Согласие соседей
          </a>
          <a
            href="#claim-violation"
            data-testid="open-claim-modal-btn"
            onClick={(e) => {
              e.preventDefault();
              setIsClaimModalOpen(true);
            }}
            className="text-red-400 hover:text-red-300 transition-colors whitespace-nowrap shrink-0 font-semibold"
          >
            Требование об устранении
          </a>
          <a
            href="#mcp-ai"
            data-testid="open-mcp-modal-btn"
            onClick={(e) => {
              e.preventDefault();
              setIsMCPModalOpen(true);
            }}
            className="text-emerald-400 hover:text-emerald-300 transition-colors whitespace-nowrap shrink-0 font-semibold"
          >
            MCP для ИИ
          </a>
          <a
            href="#save-project"
            data-testid="header-save-export-link"
            onClick={(e) => {
              e.preventDefault();
              handleSaveProjectNow();
              handleExportMasterPlanPng();
            }}
            className="hover:text-white transition-colors whitespace-nowrap shrink-0"
          >
            Сохранение и Экспорт
          </a>
        </nav>

        {/* Zone 3: Primary action */}
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            data-testid="open-promo-video-btn"
            onClick={() => setIsPromoVideoOpen(true)}
            className="px-3.5 py-2 text-xs font-semibold text-white bg-rose-600 rounded-lg hover:bg-rose-500 transition-colors whitespace-nowrap shrink-0"
          >
            Промо-ролик
          </button>
          <button
            type="button"
            data-testid="header-export-pdf-btn"
            onClick={() => {
              const snapshot = snapshotGetterRef.current ? snapshotGetterRef.current() : null;
              downloadUrbanPlanningPdfReport(plot, objects, violations, snapshot, dayOfYear);
              setSaveStatusText('Отчет PDF скачан');
            }}
            className="px-3.5 py-2 text-xs font-semibold text-white bg-indigo-600 rounded-lg hover:bg-indigo-500 transition-colors whitespace-nowrap shrink-0"
          >
            Отчет PDF
          </button>
          <button
            type="button"
            data-testid="header-open-bom-btn"
            onClick={() => setIsBOMModalOpen(true)}
            className="px-4 py-2 text-xs font-semibold text-white bg-sky-600 rounded-lg hover:bg-sky-500 transition-colors whitespace-nowrap shrink-0"
          >
            Расчет материалов и Смета
          </button>
        </div>
      </header>

      {/* Main CAD Workspace: Left Tool Panel | Center 3D/2D Viewport | Right Normative & Engineering Inspector */}
      <main className="flex-1 flex min-h-0 overflow-hidden">
        <LeftSidebar
          plot={plot}
          objects={objects}
          selectedObjectId={selectedObjectId}
          selectedEdgeIndex={selectedEdgeIndex}
          saveStatusText={saveStatusText}
          onUpdatePlot={setPlot}
          onSelectObject={setSelectedObjectId}
          onUpdateObject={handleUpdateObject}
          onDeleteObject={handleDeleteObject}
          onClearAllObjects={handleClearAllObjects}
          onSelectEdge={setSelectedEdgeIndex}
          onAddObject={handleAddObject}
          onOpenConsentModal={(edgeIdx) =>
            setConsentModalState({ isOpen: true, edgeIndex: edgeIdx })
          }
          onOpenClaimModal={() => setIsClaimModalOpen(true)}
          onSaveProjectNow={handleSaveProjectNow}
          onExportProjectJson={handleExportProjectJson}
          onImportProjectJson={handleImportProjectJson}
          onResetProject={handleResetProject}
        />

        <div className="flex-1 relative min-w-0 h-full">
          <Viewport2D3D
            viewMode={viewMode}
            plot={plot}
            objects={objects}
            selectedObjectId={selectedObjectId}
            selectedEdgeIndex={selectedEdgeIndex}
            violations={violations}
            dayOfYear={dayOfYear}
            hourOfDay={hourOfDay}
            showForbiddenZones={showForbiddenZones}
            xrayWallsMode={xrayWallsMode}
            undergroundViewMode={undergroundViewMode}
            thermalHeatmapMode={thermalHeatmapMode}
            onSelectObject={setSelectedObjectId}
            onSelectEdge={setSelectedEdgeIndex}
            onMoveObject={handleMoveObject}
            onUpdateObject={handleUpdateObject}
            onDeleteObject={handleDeleteObject}
            onCanvasReady={(getter) => {
              snapshotGetterRef.current = getter;
            }}
          />

          <SunTimelineBar
            dayOfYear={dayOfYear}
            hourOfDay={hourOfDay}
            viewMode={viewMode}
            showForbiddenZones={showForbiddenZones}
            xrayWallsMode={xrayWallsMode}
            undergroundViewMode={undergroundViewMode}
            thermalHeatmapMode={thermalHeatmapMode}
            onChangeDay={setDayOfYear}
            onChangeHour={setHourOfDay}
            onToggleViewMode={setViewMode}
            onToggleForbiddenZones={() => setShowForbiddenZones((z) => !z)}
            onToggleXrayWalls={handleToggleXrayWalls}
            onToggleUndergroundView={handleToggleUndergroundView}
            onToggleThermalHeatmap={handleToggleThermalHeatmap}
          />
        </div>

        <RightInspector
          plot={plot}
          objects={objects}
          selectedObjectId={selectedObjectId}
          violations={violations}
          xrayWallsMode={xrayWallsMode}
          undergroundViewMode={undergroundViewMode}
          thermalHeatmapMode={thermalHeatmapMode}
          dayOfYear={dayOfYear}
          hourOfDay={hourOfDay}
          onUpdateObject={handleUpdateObject}
          onDeleteObject={handleDeleteObject}
          onDuplicateObject={handleDuplicateObject}
          onSelectObject={(id) => setSelectedObjectId(id)}
          onUpdatePlot={setPlot}
          onToggleXrayWalls={handleToggleXrayWalls}
          onToggleUndergroundView={handleToggleUndergroundView}
          onToggleThermalHeatmap={handleToggleThermalHeatmap}
          onOpenConsentModal={(edgeIdx, objId) =>
            setConsentModalState({ isOpen: true, edgeIndex: edgeIdx, objectId: objId })
          }
          onOpenClaimModal={() => setIsClaimModalOpen(true)}
          onOpenBOMModal={() => setIsBOMModalOpen(true)}
        />
      </main>

      {/* Neighbor Legal Consent Generator Modal */}
      <NeighborConsentModal
        isOpen={consentModalState.isOpen}
        plot={plot}
        objects={objects}
        targetEdgeIndex={consentModalState.edgeIndex}
        targetObjectId={consentModalState.objectId}
        onClose={() => setConsentModalState({ isOpen: false })}
        onMarkConsentSigned={(edgeIdx) => {
          setPlot((prev) => {
            const nextEdges = [...prev.edges];
            if (nextEdges[edgeIdx]) {
              nextEdges[edgeIdx] = { ...nextEdges[edgeIdx], hasNeighborConsent: true };
            }
            return { ...prev, edges: nextEdges };
          });
        }}
      />

      {/* Pre-trial Legal Claim / Demand to Eliminate Violations Modal (ст. 304 ГК РФ) */}
      <ViolationClaimModal
        isOpen={isClaimModalOpen}
        plot={plot}
        objects={objects}
        violations={violations}
        onClose={() => setIsClaimModalOpen(false)}
      />

      {/* Bill of Materials (BOM) & Export Modal */}
      <BOMExportModal
        isOpen={isBOMModalOpen}
        plot={plot}
        objects={objects}
        violations={violations}
        onClose={() => setIsBOMModalOpen(false)}
        onUpdateObject={handleUpdateObject}
        onUpdatePlot={setPlot}
        onExportMasterPlanPng={handleExportMasterPlanPng}
        getCanvasSnapshot={() => (snapshotGetterRef.current ? snapshotGetterRef.current() : null)}
      />

      {/* MCP Server for Neural Networks / AI Agents Modal */}
      <MCPServerModal
        isOpen={isMCPModalOpen}
        plot={plot}
        objects={objects}
        violations={violations}
        onClose={() => setIsMCPModalOpen(false)}
        onExecuteMcpRpc={handleExecuteMcpRpc}
      />

      {/* Pure Code-Generated Selling Promotional Video & Live Workspace HUD Director */}
      <PromoVideoShowcaseModal
        isOpen={isPromoVideoOpen}
        plot={plot}
        objects={objects}
        violations={violations}
        onClose={() => setIsPromoVideoOpen(false)}
        onApplyPromoSceneState={handleApplyPromoSceneState}
        getCanvasSnapshot={() => (snapshotGetterRef.current ? snapshotGetterRef.current() : null)}
      />
    </div>
  );
}

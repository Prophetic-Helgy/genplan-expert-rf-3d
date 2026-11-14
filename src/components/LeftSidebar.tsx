import React, { useRef, useState } from 'react';
import {
  MapPin,
  Plus,
  Fence,
  Compass,
  ShieldAlert,
  Home,
  Flame,
  Droplets,
  Warehouse,
  Trash2,
  RotateCw,
  Save,
  Download,
  Upload,
  RotateCcw,
  Scale,
  Maximize2,
  Layers,
  Sliders,
  Wind
} from 'lucide-react';
import {
  PlotConfig,
  SiteObject,
  BuildingCategory,
  PlotShapePreset,
  BoundaryEdgeType,
  FenceType,
  BuildingFootprintShape,
  RoofType,
  AdjacentParcelConfig
} from '../types';
import { REGIONS_RF, BUILDING_CATEGORY_LABELS } from '../data/regions';
import {
  generatePlotPolygon,
  calculatePolygonArea,
  resolveRegionFromCoordinates,
  getEffectivePlotRegion,
  formatMetersMm,
  calculateBaseFieldDimensions,
  getEffectiveAdjacentParcels,
  resolveObjectParcelId,
  calculateBuildingInteriorArea,
  getObjectCategoryCapabilities,
  getDefaultBurialDepth,
  getDefaultPipelineDiameterMm,
  getEffectivePlotRelief,
  calculatePlotReliefAndDrainage,
  calculateWindRoseAndLoads
} from '../utils/calculations';
import { MillimeterInput } from './MillimeterInput';

interface LeftSidebarProps {
  plot: PlotConfig;
  objects: SiteObject[];
  selectedObjectId: string | null;
  selectedEdgeIndex: number | null;
  saveStatusText?: string;
  onUpdatePlot: (updater: (prev: PlotConfig) => PlotConfig) => void;
  onSelectObject: (id: string | null) => void;
  onUpdateObject: (id: string, updater: (prev: SiteObject) => SiteObject) => void;
  onDeleteObject: (id: string) => void;
  onClearAllObjects: () => void;
  onSelectEdge: (idx: number | null) => void;
  onAddObject: (category: BuildingCategory, customName?: string, overrides?: Partial<SiteObject>) => void;
  onOpenConsentModal: (edgeIdx?: number) => void;
  onOpenClaimModal?: () => void;
  onSaveProjectNow: () => void;
  onExportProjectJson: () => void;
  onImportProjectJson: (file: File) => void;
  onResetProject: () => void;
}

export const LeftSidebar: React.FC<LeftSidebarProps> = ({
  plot,
  objects,
  selectedObjectId,
  selectedEdgeIndex,
  saveStatusText,
  onUpdatePlot,
  onSelectObject,
  onUpdateObject,
  onDeleteObject,
  onClearAllObjects,
  onSelectEdge,
  onAddObject,
  onOpenConsentModal,
  onOpenClaimModal,
  onSaveProjectNow,
  onExportProjectJson,
  onImportProjectJson,
  onResetProject
}) => {
  const [activeTab, setActiveTab] = useState<'plot' | 'objects' | 'fences'>('plot');
  const [newObjectCustomName, setNewObjectCustomName] = useState<string>('');
  const [expandedParcelBoundsId, setExpandedParcelBoundsId] = useState<string | null>(
    'parcel-neighbor-east'
  );
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleAddWithCustomName = (
    category: BuildingCategory,
    overrides?: Partial<SiteObject>
  ) => {
    const trimmed = newObjectCustomName.trim();
    onAddObject(category, trimmed.length > 0 ? trimmed : undefined, overrides);
    if (trimmed.length > 0) {
      setNewObjectCustomName('');
    }
  };

  const poly = generatePlotPolygon(plot);
  const areaSqm = calculatePolygonArea(poly);
  const areaSotki = (areaSqm / 100).toFixed(2);
  const currentRegion = getEffectivePlotRegion(plot);
  const baseField = calculateBaseFieldDimensions(plot, objects);
  const selectedObj = objects.find((o) => o.id === selectedObjectId) || objects[0] || null;
  const selectedCaps = selectedObj ? getObjectCategoryCapabilities(selectedObj.category) : null;
  const adjacentParcels = getEffectiveAdjacentParcels(plot);
  const plotReliefConfig = getEffectivePlotRelief(plot);
  const reliefAnalysis = calculatePlotReliefAndDrainage(plot, objects);
  const windAnalysis = calculateWindRoseAndLoads(plot, objects, selectedObj);

  const updateAdjacentParcel = (
    parcelId: string,
    updater: (prevParcel: AdjacentParcelConfig) => AdjacentParcelConfig
  ) => {
    onUpdatePlot((prev) => {
      const currentList = getEffectiveAdjacentParcels(prev);
      const nextList = currentList.map((p) => (p.id === parcelId ? updater(p) : p));
      return { ...prev, adjacentParcels: nextList };
    });
  };

  const handleAddAdjacentParcel = (type: 'neighbor_parcel' | 'state_land') => {
    const newId = `${type === 'neighbor_parcel' ? 'parcel-neighbor' : 'parcel-state'}-${Date.now()
      .toString()
      .slice(-4)}`;
    onUpdatePlot((prev) => {
      const currentList = getEffectiveAdjacentParcels(prev);
      const countOfType = currentList.filter((p) => p.type === type).length + 1;
      const newParcel: AdjacentParcelConfig =
        type === 'neighbor_parcel'
          ? {
              id: newId,
              name: `Соседский участок №${countOfType}`,
              type: 'neighbor_parcel',
              side: 'north',
              width: prev.width,
              length: 22,
              offsetX: 0,
              offsetZ: -Math.round((prev.length / 2 + 11) * 10) / 10,
              cadastralNote: `50:21:0040112:${200 + countOfType}`
            }
          : {
              id: newId,
              name: `Гос. земли / Лесфонд №${countOfType}`,
              type: 'state_land',
              side: 'north',
              width: prev.width + 24,
              length: 14,
              offsetX: 0,
              offsetZ: -Math.round((prev.length / 2 + 7) * 10) / 10,
              cadastralNote: `Госземфонд РФ #${countOfType}`
            };
      return {
        ...prev,
        adjacentParcels: [...currentList, newParcel]
      };
    });
    setExpandedParcelBoundsId(newId);
  };

  const handleDeleteAdjacentParcel = (parcelId: string) => {
    onUpdatePlot((prev) => {
      const currentList = getEffectiveAdjacentParcels(prev);
      return {
        ...prev,
        adjacentParcels: currentList.filter((p) => p.id !== parcelId)
      };
    });
  };

  const handleApplyGeoPoint = (latVal: number, lngVal: number, labelHint?: string) => {
    const resolved = resolveRegionFromCoordinates(latVal, lngVal);
    onUpdatePlot((prev) => ({
      ...prev,
      regionId: resolved.nearestRegion.id,
      soilTypeId: resolved.nearestRegion.defaultSoil,
      customLat: resolved.effectiveRegion.lat,
      customLng: resolved.effectiveRegion.lng,
      customLocationLabel:
        labelHint ||
        `${resolved.nearestRegion.name} (${resolved.distanceKm} км от метеопоста, ${resolved.effectiveRegion.lat.toFixed(4)}° СШ, ${resolved.effectiveRegion.lng.toFixed(4)}° ВД)`
    }));
  };

  const handlePresetChange = (preset: PlotShapePreset) => {
    onUpdatePlot((prev) => {
      const next = { ...prev, preset };
      const nextPoly = generatePlotPolygon(next);
      const nextEdges = nextPoly.map((_, idx) => {
        if (prev.edges[idx]) return prev.edges[idx];
        return {
          edgeIndex: idx,
          type: idx === 0 ? ('street' as BoundaryEdgeType) : ('neighbor' as BoundaryEdgeType),
          fenceType: idx === 0 ? ('solid' as FenceType) : ('mesh' as FenceType),
          fenceHeight: idx === 0 ? 2.0 : 1.5,
          hasNeighborConsent: false
        };
      });
      return { ...next, edges: nextEdges };
    });
  };

  // Group objects by parcel ID so neighbor buildings and state utilities appear inside their respective parcel cards
  const mainPlotObjects = objects.filter(
    (obj) => resolveObjectParcelId(obj, plot) === 'main_plot'
  );

  const renderObjectCard = (obj: SiteObject) => {
    const isSel = obj.id === selectedObj?.id;
    const objCaps = getObjectCategoryCapabilities(obj.category);
    const shapeLabel =
      obj.footprintShape === 'l_shape'
        ? 'Г-обр.'
        : obj.footprintShape === 't_shape'
        ? 'Т-обр.'
        : obj.footprintShape === 'chamfered'
        ? 'Скош.'
        : 'Прямоуг.';
    const interiorMetrics = objCaps.hasInteriorAreaInsideWalls
      ? calculateBuildingInteriorArea(obj)
      : null;

    return (
      <div
        key={obj.id}
        data-testid={`parcel-object-item-${obj.id}`}
        onClick={() => onSelectObject(obj.id)}
        className={`flex items-center justify-between gap-2 p-2 rounded-lg border cursor-pointer transition-colors ${
          isSel
            ? 'bg-sky-950/50 border-sky-500 text-white'
            : 'bg-slate-900/90 border-slate-800 text-slate-300 hover:border-slate-700'
        }`}
      >
        <div className="min-w-0 flex-1 space-y-0.5">
          <input
            type="text"
            aria-label={`Название постройки ${obj.id}`}
            data-testid={`object-name-input-${obj.id}`}
            value={obj.name}
            onClick={(ev) => ev.stopPropagation()}
            onChange={(ev) =>
              onUpdateObject(obj.id, (p) => ({
                ...p,
                name: ev.target.value
              }))
            }
            className="w-full bg-slate-950 border border-slate-700/80 focus:border-sky-400 rounded px-1.5 py-0.5 text-xs font-semibold text-white outline-none"
            title="Редактировать название объекта"
          />
          <div className="text-[10px] font-mono tabular-nums text-slate-400 px-0.5 flex flex-wrap items-center gap-x-1.5">
            {objCaps.hasPipelineDiameter ? (
              <>
                <span className="text-sky-300 font-semibold">
                  Трасса {formatMetersMm(obj.width)} м · Ø{obj.pipelineDiameterMm ?? getDefaultPipelineDiameterMm(obj.category)} мм
                </span>
                <span className="text-amber-300">
                  · Загл. −{formatMetersMm(obj.burialDepth ?? getDefaultBurialDepth(obj.category))} м
                </span>
              </>
            ) : (
              <>
                <span>
                  {formatMetersMm(obj.width)}×{formatMetersMm(obj.length)} м
                </span>
                <span>· {obj.rotation}°</span>
                {objCaps.hasPlanFootprintShape && <span>· {shapeLabel}</span>}
                {objCaps.hasBurialDepth && (
                  <span className="text-amber-300">
                    · Загл. −{formatMetersMm(obj.burialDepth ?? getDefaultBurialDepth(obj.category))} м
                  </span>
                )}
                {interiorMetrics && (
                  <span className="text-emerald-400 font-semibold">
                    · Внутр. S: {interiorMetrics.totalNetInteriorAllFloorsSqm} м²
                  </span>
                )}
              </>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            data-testid={`rotate-45-object-${obj.id}`}
            onClick={(ev) => {
              ev.stopPropagation();
              onUpdateObject(obj.id, (p) => ({
                ...p,
                rotation: (p.rotation + 45) % 360
              }));
            }}
            title="Повернуть на +45°"
            className="px-1.5 py-1 rounded bg-slate-950 hover:bg-slate-800 text-sky-300 border border-slate-700/80 text-[10px] font-mono tabular-nums flex items-center gap-0.5 whitespace-nowrap"
          >
            <RotateCw className="w-3 h-3" />
            <span>{obj.rotation}°</span>
          </button>
          <button
            type="button"
            data-testid={`delete-object-${obj.id}`}
            onClick={(ev) => {
              ev.stopPropagation();
              onDeleteObject(obj.id);
            }}
            title="Убрать постройку"
            className="px-1.5 py-1 rounded bg-red-950/70 hover:bg-red-900 text-red-200 border border-red-800/60 text-[10px] font-medium flex items-center gap-1 whitespace-nowrap"
          >
            <Trash2 className="w-3 h-3 text-red-400" />
            <span>Убрать</span>
          </button>
        </div>
      </div>
    );
  };

  return (
    <aside className="w-80 shrink-0 h-full bg-slate-900 border-r border-slate-800 flex flex-col overflow-hidden">
      {/* Segmented Navigation Tabs */}
      <div className="p-3 border-b border-slate-800">
        <div className="grid grid-cols-3 gap-1 p-1 bg-slate-950 rounded-lg border border-slate-800">
          <button
            type="button"
            data-testid="sidebar-tab-plot"
            onClick={() => setActiveTab('plot')}
            className={`px-1.5 py-1.5 text-[11px] font-medium rounded-md transition-colors whitespace-nowrap ${
              activeTab === 'plot'
                ? 'bg-slate-800 text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            1. Участок
          </button>
          <button
            type="button"
            data-testid="sidebar-tab-objects"
            onClick={() => setActiveTab('objects')}
            className={`px-1 py-1.5 text-[11px] font-medium rounded-md transition-colors whitespace-nowrap ${
              activeTab === 'objects'
                ? 'bg-slate-800 text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            2. Постройки ({objects.length})
          </button>
          <button
            type="button"
            data-testid="sidebar-tab-fences"
            onClick={() => setActiveTab('fences')}
            className={`px-1.5 py-1.5 text-[11px] font-medium rounded-md transition-colors whitespace-nowrap ${
              activeTab === 'fences'
                ? 'bg-slate-800 text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            3. Границы
          </button>
        </div>
      </div>

      {/* Tab Content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-5">
        {activeTab === 'plot' && (
          <>
            {/* Geolocation & Land Category */}
            <section className="space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                  <MapPin className="w-3.5 h-3.5 text-sky-400" />
                  Геолокация и статус земли
                </h2>
                <span className="text-xs font-mono tabular-nums text-slate-400">
                  Район снега: {currentRegion.snowZone}
                </span>
              </div>

              <div>
                <label htmlFor="region-select" className="block text-xs text-slate-400 mb-1">
                  Регион РФ (климат, снег, солнце)
                </label>
                <select
                  id="region-select"
                  value={plot.regionId}
                  onChange={(e) => {
                    const reg = REGIONS_RF.find((r) => r.id === e.target.value);
                    onUpdatePlot((prev) => ({
                      ...prev,
                      regionId: e.target.value,
                      soilTypeId: reg ? reg.defaultSoil : prev.soilTypeId,
                      customLat: reg ? reg.lat : prev.customLat,
                      customLng: reg ? reg.lng : prev.customLng,
                      customLocationLabel: reg
                        ? `${reg.name} (${reg.lat.toFixed(4)}° СШ, ${reg.lng.toFixed(4)}° ВД)`
                        : undefined
                    }));
                  }}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-2 text-xs text-slate-100 focus:outline-none focus:border-sky-500"
                >
                  {REGIONS_RF.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name}
                    </option>
                  ))}
                </select>
                <p className="mt-1.5 text-xs text-slate-400 leading-relaxed">
                  {currentRegion.climateSummary}
                </p>
              </div>

              {/* Exact Geolocation Point Input & Auto-Detection */}
              <div className="p-2.5 rounded-lg bg-slate-950 border border-slate-800 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-semibold text-sky-400">
                    Точная геолокация участка (WGS-84)
                  </span>
                  <button
                    type="button"
                    data-testid="gps-locate-btn"
                    onClick={() => {
                      if (typeof navigator !== 'undefined' && navigator.geolocation) {
                        navigator.geolocation.getCurrentPosition(
                          (pos) => {
                            handleApplyGeoPoint(
                              pos.coords.latitude,
                              pos.coords.longitude,
                              'Координаты GPS браузера'
                            );
                          },
                          () => {
                            handleApplyGeoPoint(55.7558, 37.6173, 'По умолчанию (Москва)');
                          }
                        );
                      } else {
                        handleApplyGeoPoint(55.7558, 37.6173, 'По умолчанию (Москва)');
                      }
                    }}
                    className="px-2 py-0.5 rounded bg-sky-900/50 hover:bg-sky-800/70 text-[10px] font-medium text-sky-300 border border-sky-700/50 transition-colors whitespace-nowrap"
                    title="Определить координаты по GPS"
                  >
                    Мои координаты (GPS)
                  </button>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label htmlFor="geo-lat-input" className="block text-[10px] text-slate-400 mb-0.5">
                      Широта (° с.ш.)
                    </label>
                    <MillimeterInput
                      id="geo-lat-input"
                      ariaLabel="Широта участка"
                      dataTestId="geo-lat-input"
                      value={currentRegion.lat}
                      min={41}
                      max={78}
                      step={0.01}
                      precision={5}
                      onChange={(nextLat) => handleApplyGeoPoint(nextLat, currentRegion.lng)}
                      className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-xs font-mono tabular-nums text-white"
                    />
                  </div>
                  <div>
                    <label htmlFor="geo-lng-input" className="block text-[10px] text-slate-400 mb-0.5">
                      Долгота (° в.д.)
                    </label>
                    <MillimeterInput
                      id="geo-lng-input"
                      ariaLabel="Долгота участка"
                      dataTestId="geo-lng-input"
                      value={currentRegion.lng}
                      min={19}
                      max={180}
                      step={0.01}
                      precision={5}
                      onChange={(nextLng) => handleApplyGeoPoint(currentRegion.lat, nextLng)}
                      className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-xs font-mono tabular-nums text-white"
                    />
                  </div>
                </div>

                <div className="flex flex-wrap gap-1 pt-0.5">
                  {[
                    { label: 'Сочи', lat: 43.5855, lng: 39.7231 },
                    { label: 'Казань', lat: 55.7961, lng: 49.1064 },
                    { label: 'Екатеринбург', lat: 56.8389, lng: 60.6057 },
                    { label: 'Мурманск', lat: 68.9585, lng: 33.0827 }
                  ].map((pt) => (
                    <button
                      key={pt.label}
                      type="button"
                      data-testid={`geo-preset-${pt.label}`}
                      onClick={() => handleApplyGeoPoint(pt.lat, pt.lng, `Точка: ${pt.label}`)}
                      className="px-1.5 py-0.5 rounded bg-slate-900 hover:bg-slate-800 text-[10px] text-slate-300 border border-slate-700 whitespace-nowrap"
                    >
                      {pt.label}
                    </button>
                  ))}
                </div>

                <div
                  data-testid="geo-resolved-summary"
                  className="text-[10px] font-mono tabular-nums text-emerald-300 bg-emerald-950/30 border border-emerald-800/40 rounded px-2 py-1.5 leading-snug space-y-0.5"
                >
                  <div>
                    Точка: {currentRegion.lat.toFixed(4)}° СШ, {currentRegion.lng.toFixed(4)}° ВД
                  </div>
                  <div>
                    Снег: {currentRegion.snowZone} р-н (Sg={currentRegion.snowLoadSg} кг/м²) · Промерзание: {currentRegion.frostDepth} м · R_req={currentRegion.rReqWall}
                  </div>
                  <div className="text-sky-300" data-testid="sidebar-wind-summary">
                    Ветер: {windAnalysis.windZone} р-н (w₀={windAnalysis.windPressureW0KgM2} кг/м², {windAnalysis.avgWindSpeedMs}–{windAnalysis.maxGustWindSpeedMs} м/с) · {windAnalysis.prevailingWindLabel}
                  </div>
                </div>
              </div>

              <div>
                <span className="block text-xs text-slate-400 mb-1.5">
                  Категория земель (регламент СП)
                </span>
                <div className="grid grid-cols-2 gap-1.5 p-1 bg-slate-950 rounded-lg border border-slate-800">
                  <button
                    type="button"
                    onClick={() => onUpdatePlot((prev) => ({ ...prev, category: 'SNT' }))}
                    className={`py-1.5 px-2 text-xs font-medium rounded transition-colors whitespace-nowrap ${
                      plot.category === 'SNT'
                        ? 'bg-sky-600 text-white'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    СНТ / Садоводство
                  </button>
                  <button
                    type="button"
                    onClick={() => onUpdatePlot((prev) => ({ ...prev, category: 'IZHS' }))}
                    className={`py-1.5 px-2 text-xs font-medium rounded transition-colors whitespace-nowrap ${
                      plot.category === 'IZHS'
                        ? 'bg-sky-600 text-white'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    ИЖС / ЛПХ
                  </button>
                </div>
              </div>
            </section>

            <hr className="border-slate-800" />

            {/* Plot Geometry & Dimensions */}
            <section className="space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-xs font-semibold text-slate-300">Геометрия и габариты участка</h2>
                <span className="text-xs font-mono tabular-nums text-emerald-400">
                  {areaSqm.toFixed(0)} м² · {areaSotki} сот.
                </span>
              </div>

              <div className="grid grid-cols-3 gap-1.5">
                {(
                  [
                    { id: 'rectangle', label: 'Прямоуг.' },
                    { id: 'trapezoid', label: 'Трапеция' },
                    { id: 'l_shape', label: 'Г-образный' }
                  ] as const
                ).map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => handlePresetChange(item.id)}
                    className={`py-1.5 px-2 text-xs font-medium rounded border transition-colors whitespace-nowrap ${
                      plot.preset === item.id
                        ? 'bg-slate-800 border-sky-500 text-white'
                        : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="plot-width" className="block text-xs text-slate-400 mb-1">
                    Ширина по фасаду (м)
                  </label>
                  <MillimeterInput
                    id="plot-width"
                    ariaLabel="Ширина по фасаду (м)"
                    dataTestId="plot-width-input"
                    min={6}
                    max={150}
                    step={0.001}
                    value={plot.width}
                    onChange={(val) =>
                      onUpdatePlot((prev) => ({
                        ...prev,
                        width: Math.max(6, val)
                      }))
                    }
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs font-mono tabular-nums text-white"
                  />
                </div>
                <div>
                  <label htmlFor="plot-length" className="block text-xs text-slate-400 mb-1">
                    Глубина участка (м)
                  </label>
                  <MillimeterInput
                    id="plot-length"
                    ariaLabel="Глубина участка (м)"
                    dataTestId="plot-length-input"
                    min={6}
                    max={150}
                    step={0.001}
                    value={plot.length}
                    onChange={(val) =>
                      onUpdatePlot((prev) => ({
                        ...prev,
                        length: Math.max(6, val)
                      }))
                    }
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs font-mono tabular-nums text-white"
                  />
                </div>
              </div>
              <p className="text-[10px] text-slate-400">
                Точность ввода: до 1 мм (0.001 м) через точку «.» или запятую «,» в любой раскладке.
              </p>

              {plot.preset === 'trapezoid' && (
                <div>
                  <label htmlFor="plot-trap-top" className="block text-xs text-slate-400 mb-1">
                    Ширина тыльной стороны трапеции (м)
                  </label>
                  <MillimeterInput
                    id="plot-trap-top"
                    ariaLabel="Ширина тыльной стороны трапеции (м)"
                    min={4}
                    max={150}
                    step={0.001}
                    value={plot.trapezoidTopWidth}
                    onChange={(val) =>
                      onUpdatePlot((prev) => ({
                        ...prev,
                        trapezoidTopWidth: Math.max(4, val)
                      }))
                    }
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs font-mono tabular-nums text-white"
                  />
                </div>
              )}

              {plot.preset === 'l_shape' && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label htmlFor="l-cut-w" className="block text-xs text-slate-400 mb-1">
                      Вырез ширина (м)
                    </label>
                    <MillimeterInput
                      id="l-cut-w"
                      ariaLabel="Вырез ширина (м)"
                      min={2}
                      max={plot.width - 4}
                      step={0.001}
                      value={plot.lCutoutWidth}
                      onChange={(val) =>
                        onUpdatePlot((prev) => ({
                          ...prev,
                          lCutoutWidth: Math.max(2, val)
                        }))
                      }
                      className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs font-mono tabular-nums text-white"
                    />
                  </div>
                  <div>
                    <label htmlFor="l-cut-l" className="block text-xs text-slate-400 mb-1">
                      Вырез глубина (м)
                    </label>
                    <MillimeterInput
                      id="l-cut-l"
                      ariaLabel="Вырез глубина (м)"
                      min={2}
                      max={plot.length - 4}
                      step={0.001}
                      value={plot.lCutoutLength}
                      onChange={(val) =>
                        onUpdatePlot((prev) => ({
                          ...prev,
                          lCutoutLength: Math.max(2, val)
                        }))
                      }
                      className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs font-mono tabular-nums text-white"
                    />
                  </div>
                </div>
              )}

              {/* Automatic Base Field Expansion */}
              <div className="p-2.5 rounded-lg bg-slate-950 border border-slate-800 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-semibold text-sky-400 flex items-center gap-1">
                    <Maximize2 className="w-3.5 h-3.5" />
                    Базовое поле вокруг участка (Авто)
                  </span>
                  <span
                    className="text-[11px] font-mono tabular-nums font-semibold text-emerald-400"
                    data-testid="base-field-summary"
                  >
                    {formatMetersMm(baseField.fieldWidth)}×{formatMetersMm(baseField.fieldLength)} м ({baseField.multiplier}×)
                  </span>
                </div>
                <p className="text-[10px] text-slate-400 leading-snug">
                  Базовое поле автоматически увеличивается пропорционально размерам участка ({formatMetersMm(plot.width)}×{formatMetersMm(plot.length)} м → {formatMetersMm(baseField.fieldWidth)}×{formatMetersMm(baseField.fieldLength)} м).
                </p>
                <div className="grid grid-cols-2 gap-1.5">
                  {[
                    { m: 2, label: '2× Поле' },
                    { m: 4, label: '4× (Стандарт)' },
                    { m: 6, label: '6× Поле' },
                    { m: 8, label: '8× Поле' }
                  ].map((item) => {
                    const activeM = plot.baseFieldMultiplier ?? 4;
                    return (
                      <button
                        key={item.m}
                        type="button"
                        data-testid={`base-field-mult-${item.m}`}
                        onClick={() =>
                          onUpdatePlot((prev) => ({
                            ...prev,
                            baseFieldMultiplier: item.m
                          }))
                        }
                        className={`py-1.5 px-2 text-xs font-mono rounded border transition-colors text-center ${
                          activeM === item.m
                            ? 'bg-sky-600 text-white border-sky-400 font-semibold'
                            : 'bg-slate-900 text-slate-300 border-slate-800 hover:border-slate-700'
                        }`}
                      >
                        {item.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            </section>

            <hr className="border-slate-800" />

            {/* Terrain Relief, Surface Slope & Automatic Drainage Zones (СП 42.13330 / СП 32.13330) */}
            <section
              data-testid="plot-relief-drainage-card"
              className="p-3 rounded-lg bg-slate-950 border border-cyan-500/35 space-y-2.5"
            >
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-xs font-semibold text-cyan-300 flex items-center gap-1.5">
                  <Droplets className="w-3.5 h-3.5 text-cyan-400" />
                  Рельеф участка, уклон и водоотведение
                </h2>
                <span
                  data-testid="relief-slope-badge"
                  className="text-[11px] font-mono tabular-nums font-bold text-cyan-300"
                >
                  {reliefAnalysis.slopePercent}% ({reliefAnalysis.slopePermille}‰)
                </span>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label htmlFor="relief-elev-nw" className="block text-[10px] text-slate-400 mb-0.5">
                    СЗ угол (м БС)
                  </label>
                  <MillimeterInput
                    id="relief-elev-nw"
                    ariaLabel="Высотная отметка СЗ угла (м)"
                    dataTestId="relief-elev-nw"
                    min={0}
                    max={1500}
                    step={0.05}
                    value={plotReliefConfig.elevationNW}
                    onChange={(val) =>
                      onUpdatePlot((prev) => ({
                        ...prev,
                        relief: {
                          ...getEffectivePlotRelief(prev),
                          elevationNW: val
                        }
                      }))
                    }
                    className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-xs font-mono tabular-nums text-white"
                  />
                </div>
                <div>
                  <label htmlFor="relief-elev-ne" className="block text-[10px] text-slate-400 mb-0.5">
                    СВ угол (м БС)
                  </label>
                  <MillimeterInput
                    id="relief-elev-ne"
                    ariaLabel="Высотная отметка СВ угла (м)"
                    dataTestId="relief-elev-ne"
                    min={0}
                    max={1500}
                    step={0.05}
                    value={plotReliefConfig.elevationNE}
                    onChange={(val) =>
                      onUpdatePlot((prev) => ({
                        ...prev,
                        relief: {
                          ...getEffectivePlotRelief(prev),
                          elevationNE: val
                        }
                      }))
                    }
                    className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-xs font-mono tabular-nums text-white"
                  />
                </div>
                <div>
                  <label htmlFor="relief-elev-sw" className="block text-[10px] text-slate-400 mb-0.5">
                    ЮЗ угол (м БС)
                  </label>
                  <MillimeterInput
                    id="relief-elev-sw"
                    ariaLabel="Высотная отметка ЮЗ угла (м)"
                    dataTestId="relief-elev-sw"
                    min={0}
                    max={1500}
                    step={0.05}
                    value={plotReliefConfig.elevationSW}
                    onChange={(val) =>
                      onUpdatePlot((prev) => ({
                        ...prev,
                        relief: {
                          ...getEffectivePlotRelief(prev),
                          elevationSW: val
                        }
                      }))
                    }
                    className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-xs font-mono tabular-nums text-white"
                  />
                </div>
                <div>
                  <label htmlFor="relief-elev-se" className="block text-[10px] text-slate-400 mb-0.5">
                    ЮВ угол (м БС)
                  </label>
                  <MillimeterInput
                    id="relief-elev-se"
                    ariaLabel="Высотная отметка ЮВ угла (м)"
                    dataTestId="relief-elev-se"
                    min={0}
                    max={1500}
                    step={0.05}
                    value={plotReliefConfig.elevationSE}
                    onChange={(val) =>
                      onUpdatePlot((prev) => ({
                        ...prev,
                        relief: {
                          ...getEffectivePlotRelief(prev),
                          elevationSE: val
                        }
                      }))
                    }
                    className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-xs font-mono tabular-nums text-white"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-1.5">
                {[
                  {
                    id: 'flat',
                    label: 'Плоский 0.2%',
                    nw: 145.05,
                    ne: 145.04,
                    sw: 145.0,
                    se: 145.0
                  },
                  {
                    id: 'optimal',
                    label: 'Норма 2.6%',
                    nw: 145.6,
                    ne: 145.3,
                    sw: 144.8,
                    se: 144.4
                  },
                  {
                    id: 'moderate',
                    label: 'Склон 5.2%',
                    nw: 147.2,
                    ne: 146.6,
                    sw: 145.4,
                    se: 144.8
                  },
                  {
                    id: 'steep',
                    label: 'Крутой 10%',
                    nw: 149.5,
                    ne: 148.2,
                    sw: 146.0,
                    se: 144.9
                  }
                ].map((preset) => (
                  <button
                    key={preset.id}
                    type="button"
                    data-testid={`relief-preset-${preset.id}`}
                    onClick={() =>
                      onUpdatePlot((prev) => ({
                        ...prev,
                        relief: {
                          ...getEffectivePlotRelief(prev),
                          elevationNW: preset.nw,
                          elevationNE: preset.ne,
                          elevationSW: preset.sw,
                          elevationSE: preset.se
                        }
                      }))
                    }
                    className="py-1.5 px-2 text-xs font-mono rounded bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-800 text-center"
                  >
                    {preset.label}
                  </button>
                ))}
              </div>

              <div
                data-testid="relief-drainage-summary"
                className="p-2 rounded bg-slate-900/90 border border-slate-800 text-[10px] space-y-1 text-slate-300"
              >
                <div className="flex items-center justify-between font-mono">
                  <span>Перепад ΔH: {reliefAnalysis.elevationDeltaM.toFixed(2)} м</span>
                  <span>Угол: {reliefAnalysis.slopeAngleDeg}°</span>
                </div>
                <div className="flex items-center justify-between">
                  <span>Сток: {reliefAnalysis.slopeDirectionLabel}</span>
                  <span className="font-mono text-cyan-300">
                    Q = {reliefAnalysis.stormwaterRunoffLitersPerSec} л/с
                  </span>
                </div>
                <div className="text-emerald-300 font-medium">{reliefAnalysis.normativeStatusLabel}</div>
              </div>

              <label className="flex items-center gap-2 text-xs text-slate-200 cursor-pointer pt-0.5">
                <input
                  type="checkbox"
                  data-testid="toggle-drainage-zones-checkbox"
                  checked={plotReliefConfig.showDrainageZones}
                  onChange={(e) =>
                    onUpdatePlot((prev) => ({
                      ...prev,
                      relief: {
                        ...getEffectivePlotRelief(prev),
                        showDrainageZones: e.target.checked
                      }
                    }))
                  }
                  className="accent-cyan-500"
                />
                <span>Показать зоны водоотведения на 2D/3D плане</span>
              </label>
            </section>

            <hr className="border-slate-800" />

            {/* Compass Orientation & ZOUIT */}
            <section className="space-y-3">
              <div className="flex items-center justify-between">
                <label
                  htmlFor="north-angle"
                  className="text-xs font-semibold text-slate-300 flex items-center gap-1.5"
                >
                  <Compass className="w-3.5 h-3.5 text-amber-400" />
                  Ориентация на Север
                </label>
                <span className="text-xs font-mono tabular-nums text-amber-400">
                  {plot.northAngle}°
                </span>
              </div>
              <input
                id="north-angle"
                type="range"
                min={0}
                max={355}
                step={5}
                value={plot.northAngle}
                onChange={(e) =>
                  onUpdatePlot((prev) => ({ ...prev, northAngle: Number(e.target.value) }))
                }
                className="w-full accent-sky-500"
              />
              <div className="flex justify-between text-[11px] text-slate-400 font-mono">
                <button
                  type="button"
                  onClick={() => onUpdatePlot((p) => ({ ...p, northAngle: 0 }))}
                  className="hover:text-white whitespace-nowrap"
                >
                  0° (Сверху)
                </button>
                <button
                  type="button"
                  onClick={() => onUpdatePlot((p) => ({ ...p, northAngle: 90 }))}
                  className="hover:text-white whitespace-nowrap"
                >
                  90° (Справа)
                </button>
                <button
                  type="button"
                  onClick={() => onUpdatePlot((p) => ({ ...p, northAngle: 180 }))}
                  className="hover:text-white whitespace-nowrap"
                >
                  180° (Снизу)
                </button>
                <button
                  type="button"
                  onClick={() => onUpdatePlot((p) => ({ ...p, northAngle: 270 }))}
                  className="hover:text-white whitespace-nowrap"
                >
                  270° (Слева)
                </button>
              </div>

              {/* ZOUIT Checkbox */}
              <div className="pt-2">
                <label className="flex items-start gap-2.5 p-2.5 rounded-lg bg-slate-950 border border-slate-800 cursor-pointer hover:border-slate-700">
                  <input
                    type="checkbox"
                    checked={plot.hasZouit}
                    onChange={(e) =>
                      onUpdatePlot((prev) => ({ ...prev, hasZouit: e.target.checked }))
                    }
                    className="mt-0.5 accent-red-500"
                  />
                  <div className="text-xs">
                    <span className="font-medium text-slate-200 flex items-center gap-1">
                      <ShieldAlert className="w-3.5 h-3.5 text-red-400" />
                      Обременение ЗОУИТ (ЛЭП / Газ)
                    </span>
                    <span className="block text-slate-400 mt-0.5">
                      Охранная зона коммуникаций вдоль фасада (запрет строительства)
                    </span>
                  </div>
                </label>

                {plot.hasZouit && (
                  <div className="mt-2 flex items-center justify-between gap-2 px-1">
                    <label htmlFor="zouit-depth" className="text-xs text-slate-400">
                      Глубина охранной зоны (м):
                    </label>
                    <input
                      id="zouit-depth"
                      type="number"
                      min={2}
                      max={20}
                      value={plot.zouitDepth}
                      onChange={(e) =>
                        onUpdatePlot((prev) => ({
                          ...prev,
                          zouitDepth: Math.max(2, Number(e.target.value) || 5)
                        }))
                      }
                      className="w-16 bg-slate-950 border border-slate-700 rounded px-2 py-1 text-xs font-mono tabular-nums text-white"
                    />
                  </div>
                )}
              </div>
            </section>

            <hr className="border-slate-800" />

            {/* Project Save / Load / Reset Section */}
            <section className="p-3 rounded-lg bg-slate-950 border border-slate-800 space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-200 flex items-center gap-1.5">
                  <Save className="w-3.5 h-3.5 text-emerald-400" />
                  Сохранение проекта
                </span>
                <span className="text-[10px] font-mono text-emerald-400">
                  {saveStatusText || 'Автосохранение ВКЛ'}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-1.5">
                <button
                  type="button"
                  onClick={onSaveProjectNow}
                  className="py-1.5 px-2 text-xs font-medium bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 border border-emerald-500/40 rounded flex items-center justify-center gap-1 transition-colors whitespace-nowrap"
                >
                  <Save className="w-3.5 h-3.5" />
                  Сохранить
                </button>
                <button
                  type="button"
                  onClick={onExportProjectJson}
                  className="py-1.5 px-2 text-xs font-medium bg-slate-900 hover:bg-slate-800 text-slate-200 border border-slate-700 rounded flex items-center justify-center gap-1 transition-colors whitespace-nowrap"
                >
                  <Download className="w-3.5 h-3.5" />
                  Скачать JSON
                </button>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="py-1.5 px-2 text-xs font-medium bg-slate-900 hover:bg-slate-800 text-slate-200 border border-slate-700 rounded flex items-center justify-center gap-1 transition-colors whitespace-nowrap"
                >
                  <Upload className="w-3.5 h-3.5" />
                  Загрузить
                </button>
                <button
                  type="button"
                  onClick={onResetProject}
                  className="py-1.5 px-2 text-xs font-medium bg-red-950/50 hover:bg-red-900/60 text-red-300 border border-red-800/50 rounded flex items-center justify-center gap-1 transition-colors whitespace-nowrap"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  Сбросить
                </button>
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept=".json,application/json"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) {
                    onImportProjectJson(f);
                    e.target.value = '';
                  }
                }}
              />
            </section>
          </>
        )}

        {activeTab === 'objects' && (
          <div className="space-y-4">
            {/* PARCEL-GROUPED OBJECTS & BOUNDARIES SECTION */}
            <section className="space-y-3" data-testid="parcels-and-objects-section">
              <div className="flex items-center justify-between">
                <h2 className="text-xs font-semibold text-white flex items-center gap-1.5">
                  <Layers className="w-3.5 h-3.5 text-sky-400" />
                  Участки и постройки ({objects.length})
                </h2>
                {objects.length > 0 && (
                  <button
                    type="button"
                    onClick={onClearAllObjects}
                    className="text-[11px] text-red-400 hover:text-red-300 font-medium whitespace-nowrap"
                  >
                    Убрать все
                  </button>
                )}
              </div>

              {/* CARD 1: MAIN USER PLOT (Мой участок) */}
              <div
                data-testid="parcel-card-main_plot"
                className="p-2.5 rounded-lg bg-slate-950 border border-sky-500/40 space-y-2"
              >
                <div className="flex items-center justify-between gap-2">
                  <input
                    type="text"
                    aria-label="Название основного участка"
                    data-testid="rename-parcel-main_plot"
                    value={plot.mainParcelName || 'Мой участок (ИЖС / СНТ)'}
                    onChange={(e) =>
                      onUpdatePlot((prev) => ({
                        ...prev,
                        mainParcelName: e.target.value
                      }))
                    }
                    className="flex-1 bg-slate-900 border border-slate-700 focus:border-sky-400 rounded px-2 py-1 text-xs font-bold text-sky-300 outline-none"
                    title="Переименовать основной участок"
                  />
                  <span className="text-[10px] font-mono tabular-nums text-emerald-400 shrink-0">
                    {formatMetersMm(plot.width)}×{formatMetersMm(plot.length)} м
                  </span>
                </div>

                <div className="text-[10px] text-slate-400 flex items-center justify-between px-0.5">
                  <span>Постройки на этом участке ({mainPlotObjects.length}):</span>
                  <span className="font-mono text-slate-400">{areaSotki} сот.</span>
                </div>

                {mainPlotObjects.length === 0 ? (
                  <div className="p-2 rounded bg-slate-900/70 border border-slate-800 text-[11px] text-slate-400 text-center">
                    На вашем участке нет построек. Добавьте дом или хозблок ниже.
                  </div>
                ) : (
                  <div className="space-y-1.5" data-testid="parcel-objects-list-main_plot">
                    {mainPlotObjects.map((obj) => renderObjectCard(obj))}
                  </div>
                )}
              </div>

              {/* ADJACENT PARCELS HEADER (Соседские участки и Государственные земли) */}
              <div className="pt-1 space-y-2">
                <div className="flex items-center justify-between gap-1">
                  <span className="text-[11px] font-semibold text-amber-300">
                    Смежные участки соседей и Гос. земли
                  </span>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      data-testid="add-neighbor-parcel-btn"
                      onClick={() => handleAddAdjacentParcel('neighbor_parcel')}
                      className="px-1.5 py-0.5 rounded bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 text-[10px] font-medium whitespace-nowrap"
                      title="Добавить соседский участок"
                    >
                      + Сосед. уч.
                    </button>
                    <button
                      type="button"
                      data-testid="add-state-land-btn"
                      onClick={() => handleAddAdjacentParcel('state_land')}
                      className="px-1.5 py-0.5 rounded bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/40 text-[10px] font-medium whitespace-nowrap"
                      title="Добавить государственные земли / ЗОУИТ"
                    >
                      + Гос. земли
                    </button>
                  </div>
                </div>

                {adjacentParcels.map((parcel) => {
                  const parcelObjects = objects.filter(
                    (o) => resolveObjectParcelId(o, plot) === parcel.id
                  );
                  const isNeighbor = parcel.type === 'neighbor_parcel';
                  const isBoundsOpen = expandedParcelBoundsId === parcel.id;

                  return (
                    <div
                      key={parcel.id}
                      data-testid={`parcel-card-${parcel.id}`}
                      className={`p-2.5 rounded-lg bg-slate-950 border space-y-2 ${
                        isNeighbor ? 'border-amber-500/35' : 'border-emerald-500/35'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-1.5">
                        <input
                          type="text"
                          aria-label={`Название участка ${parcel.id}`}
                          data-testid={`rename-parcel-${parcel.id}`}
                          value={parcel.name}
                          onChange={(e) =>
                            updateAdjacentParcel(parcel.id, (p) => ({
                              ...p,
                              name: e.target.value
                            }))
                          }
                          className={`flex-1 bg-slate-900 border border-slate-700 focus:border-sky-400 rounded px-2 py-1 text-xs font-semibold outline-none ${
                            isNeighbor ? 'text-amber-200' : 'text-emerald-200'
                          }`}
                          title="Переименовать участок"
                        />
                        <button
                          type="button"
                          data-testid={`toggle-parcel-bounds-${parcel.id}`}
                          onClick={() =>
                            setExpandedParcelBoundsId((prev) =>
                              prev === parcel.id ? null : parcel.id
                            )
                          }
                          className="px-1.5 py-1 rounded bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-700 text-[10px] font-mono tabular-nums flex items-center gap-1 whitespace-nowrap"
                          title="Настроить границы участка (ширина, длина, смещение)"
                        >
                          <Sliders className="w-3 h-3 text-sky-400" />
                          <span>
                            {formatMetersMm(parcel.width)}×{formatMetersMm(parcel.length)}м
                          </span>
                        </button>
                        {adjacentParcels.length > 1 && (
                          <button
                            type="button"
                            onClick={() => handleDeleteAdjacentParcel(parcel.id)}
                            title="Удалить участок из схемы"
                            className="p-1 rounded bg-slate-900 hover:bg-red-950 text-slate-400 hover:text-red-300 border border-slate-800"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        )}
                      </div>

                      {/* Configurable Parcel Boundaries (Ширина, Длина, Смещение X/Z, Тип земли) */}
                      {isBoundsOpen && (
                        <div
                          data-testid={`parcel-bounds-editor-${parcel.id}`}
                          className="p-2 rounded bg-slate-900/90 border border-slate-800 space-y-2"
                        >
                          <div className="flex items-center justify-between text-[10px] text-slate-400">
                            <span>Границы и положение участка:</span>
                            <select
                              value={parcel.type}
                              onChange={(e) =>
                                updateAdjacentParcel(parcel.id, (p) => ({
                                  ...p,
                                  type: e.target.value as AdjacentParcelConfig['type']
                                }))
                              }
                              className="bg-slate-950 border border-slate-700 rounded px-1.5 py-0.5 text-[10px] text-slate-200"
                            >
                              <option value="neighbor_parcel">Соседский участок</option>
                              <option value="state_land">Государственные земли</option>
                            </select>
                          </div>
                          <div className="grid grid-cols-2 gap-1.5">
                            <div>
                              <label className="block text-[10px] text-slate-400 mb-0.5">
                                Ширина границ W (м)
                              </label>
                              <MillimeterInput
                                ariaLabel={`Ширина участка ${parcel.name}`}
                                dataTestId={`parcel-width-${parcel.id}`}
                                min={4}
                                max={200}
                                step={0.5}
                                value={parcel.width}
                                onChange={(val) =>
                                  updateAdjacentParcel(parcel.id, (p) => ({
                                    ...p,
                                    width: Math.max(4, val)
                                  }))
                                }
                                className="w-full bg-slate-950 border border-slate-700 rounded px-1.5 py-0.5 text-xs font-mono tabular-nums text-white"
                              />
                            </div>
                            <div>
                              <label className="block text-[10px] text-slate-400 mb-0.5">
                                Длина границ L (м)
                              </label>
                              <MillimeterInput
                                ariaLabel={`Длина участка ${parcel.name}`}
                                dataTestId={`parcel-length-${parcel.id}`}
                                min={4}
                                max={200}
                                step={0.5}
                                value={parcel.length}
                                onChange={(val) =>
                                  updateAdjacentParcel(parcel.id, (p) => ({
                                    ...p,
                                    length: Math.max(4, val)
                                  }))
                                }
                                className="w-full bg-slate-950 border border-slate-700 rounded px-1.5 py-0.5 text-xs font-mono tabular-nums text-white"
                              />
                            </div>
                            <div>
                              <label className="block text-[10px] text-slate-400 mb-0.5">
                                Центр X (Восток/Запад, м)
                              </label>
                              <MillimeterInput
                                ariaLabel={`Смещение X участка ${parcel.name}`}
                                dataTestId={`parcel-offset-x-${parcel.id}`}
                                min={-150}
                                max={150}
                                step={0.5}
                                value={parcel.offsetX}
                                onChange={(val) =>
                                  updateAdjacentParcel(parcel.id, (p) => ({
                                    ...p,
                                    offsetX: val
                                  }))
                                }
                                className="w-full bg-slate-950 border border-slate-700 rounded px-1.5 py-0.5 text-xs font-mono tabular-nums text-white"
                              />
                            </div>
                            <div>
                              <label className="block text-[10px] text-slate-400 mb-0.5">
                                Центр Z (Юг/Север, м)
                              </label>
                              <MillimeterInput
                                ariaLabel={`Смещение Z участка ${parcel.name}`}
                                dataTestId={`parcel-offset-z-${parcel.id}`}
                                min={-150}
                                max={150}
                                step={0.5}
                                value={parcel.offsetZ}
                                onChange={(val) =>
                                  updateAdjacentParcel(parcel.id, (p) => ({
                                    ...p,
                                    offsetZ: val
                                  }))
                                }
                                className="w-full bg-slate-950 border border-slate-700 rounded px-1.5 py-0.5 text-xs font-mono tabular-nums text-white"
                              />
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Objects Placed on this Specific Neighbor / State Parcel */}
                      <div className="space-y-1.5" data-testid={`parcel-objects-list-${parcel.id}`}>
                        {parcelObjects.length === 0 ? (
                          <div className="flex items-center justify-between text-[10px] text-slate-400 px-1 py-0.5">
                            <span>Построек на участке: 0</span>
                            {isNeighbor ? (
                              <button
                                type="button"
                                onClick={() =>
                                  handleAddWithCustomName('neighbor_house', {
                                    x: parcel.offsetX,
                                    z: parcel.offsetZ,
                                    parcelId: parcel.id
                                  })
                                }
                                className="text-amber-300 hover:text-amber-200 font-medium whitespace-nowrap"
                              >
                                + Дом соседа сюда
                              </button>
                            ) : (
                              <button
                                type="button"
                                onClick={() =>
                                  handleAddWithCustomName('road', {
                                    x: parcel.offsetX,
                                    z: parcel.offsetZ,
                                    parcelId: parcel.id
                                  })
                                }
                                className="text-emerald-300 hover:text-emerald-200 font-medium whitespace-nowrap"
                              >
                                + Дорогу / сеть сюда
                              </button>
                            )}
                          </div>
                        ) : (
                          parcelObjects.map((obj) => renderObjectCard(obj))
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Inline Dimension, Shape & Parcel Assignment Editor for Selected Building */}
              {selectedObj && (
                <div className="p-3 rounded-lg bg-slate-950 border border-sky-500/40 space-y-2.5">
                  <div className="flex items-center justify-between border-b border-slate-800 pb-1.5">
                    <span className="text-xs font-semibold text-sky-400 truncate">
                      Редактирование: «{selectedObj.name}»
                    </span>
                    <span className="text-[11px] font-mono tabular-nums text-slate-400 shrink-0">
                      {formatMetersMm(selectedObj.width)}×{formatMetersMm(selectedObj.length)} м
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-[11px] text-slate-400 mb-1">
                        Название постройки
                      </label>
                      <input
                        type="text"
                        data-testid="selected-object-name-input"
                        value={selectedObj.name}
                        onChange={(e) =>
                          onUpdateObject(selectedObj.id, (p) => ({ ...p, name: e.target.value }))
                        }
                        className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-xs text-white"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] text-slate-400 mb-1">
                        Участок размещения
                      </label>
                      <select
                        data-testid="selected-object-parcel-select"
                        value={resolveObjectParcelId(selectedObj, plot)}
                        onChange={(e) => {
                          const targetParcelId = e.target.value;
                          if (targetParcelId === 'main_plot') {
                            onUpdateObject(selectedObj.id, (p) => ({
                              ...p,
                              parcelId: 'main_plot',
                              x: Math.max(-plot.width / 2 + 3, Math.min(plot.width / 2 - 3, p.x)),
                              z: Math.max(-plot.length / 2 + 3, Math.min(plot.length / 2 - 3, p.z))
                            }));
                          } else {
                            const targetParcel = adjacentParcels.find(
                              (ap) => ap.id === targetParcelId
                            );
                            onUpdateObject(selectedObj.id, (p) => ({
                              ...p,
                              parcelId: targetParcelId,
                              x: targetParcel ? targetParcel.offsetX : p.x,
                              z: targetParcel ? targetParcel.offsetZ : p.z
                            }));
                          }
                        }}
                        className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-xs text-white"
                      >
                        <option value="main_plot">
                          {plot.mainParcelName || 'Мой участок (ИЖС / СНТ)'}
                        </option>
                        {adjacentParcels.map((ap) => (
                          <option key={ap.id} value={ap.id}>
                            {ap.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-[11px] text-slate-400 mb-1 truncate" title={selectedCaps?.widthLabel || 'Ширина W (м)'}>
                        {selectedCaps?.widthLabel || 'Ширина W (м)'}
                      </label>
                      <MillimeterInput
                        ariaLabel={selectedCaps?.widthLabel || 'Ширина выбранной постройки W (м)'}
                        dataTestId="sidebar-obj-width-input"
                        min={0.3}
                        max={80}
                        step={0.001}
                        value={selectedObj.width}
                        onChange={(val) =>
                          onUpdateObject(selectedObj.id, (p) => ({
                            ...p,
                            width: Math.max(0.3, val)
                          }))
                        }
                        className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-xs font-mono tabular-nums text-white"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] text-slate-400 mb-1 truncate" title={selectedCaps?.lengthLabel || 'Длина L (м)'}>
                        {selectedCaps?.lengthLabel || 'Длина L (м)'}
                      </label>
                      <MillimeterInput
                        ariaLabel={selectedCaps?.lengthLabel || 'Длина выбранной постройки L (м)'}
                        dataTestId="sidebar-obj-length-input"
                        min={0.3}
                        max={80}
                        step={0.001}
                        value={selectedObj.length}
                        onChange={(val) =>
                          onUpdateObject(selectedObj.id, (p) => ({
                            ...p,
                            length: Math.max(0.3, val)
                          }))
                        }
                        className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-xs font-mono tabular-nums text-white"
                      />
                    </div>
                  </div>

                  {(selectedCaps?.hasPlanFootprintShape || selectedCaps?.hasRoofGeometry) && (
                    <div className="grid grid-cols-2 gap-2">
                      {selectedCaps?.hasPlanFootprintShape && (
                        <div>
                          <label className="block text-[11px] text-slate-400 mb-1">
                            Форма в плане
                          </label>
                          <select
                            value={selectedObj.footprintShape || 'rectangle'}
                            onChange={(e) =>
                              onUpdateObject(selectedObj.id, (p) => ({
                                ...p,
                                footprintShape: e.target.value as BuildingFootprintShape
                              }))
                            }
                            className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-xs text-white"
                          >
                            <option value="rectangle">Прямоугольная</option>
                            <option value="l_shape">Г-образная</option>
                            <option value="t_shape">Т-образная (эркер)</option>
                            <option value="chamfered">Скошенная</option>
                          </select>
                        </div>
                      )}
                      {selectedCaps?.hasRoofGeometry && (
                        <div>
                          <label className="block text-[11px] text-slate-400 mb-1">Форма крыши</label>
                          <select
                            value={selectedObj.roofType}
                            onChange={(e) =>
                              onUpdateObject(selectedObj.id, (p) => ({
                                ...p,
                                roofType: e.target.value as RoofType
                              }))
                            }
                            className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-xs text-white"
                          >
                            <option value="flat">Плоская</option>
                            <option value="shed">Односкатная</option>
                            <option value="gable">Двускатная</option>
                            <option value="hip">Пирамидальная</option>
                          </select>
                        </div>
                      )}
                    </div>
                  )}

                  {selectedCaps?.hasBurialDepth && (
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-[11px] text-amber-300 mb-1">
                          Глубина заложения (м)
                        </label>
                        <MillimeterInput
                          ariaLabel="Глубина заложения объекта (м)"
                          dataTestId="sidebar-obj-burial-depth-input"
                          min={0}
                          max={50}
                          step={0.1}
                          value={
                            selectedObj.burialDepth ?? getDefaultBurialDepth(selectedObj.category)
                          }
                          onChange={(val) =>
                            onUpdateObject(selectedObj.id, (p) => ({
                              ...p,
                              burialDepth: Math.max(0, val)
                            }))
                          }
                          className="w-full bg-slate-900 border border-amber-500/40 rounded px-2 py-1 text-xs font-mono tabular-nums text-amber-200"
                        />
                      </div>
                      {selectedCaps?.hasPipelineDiameter && (
                        <div>
                          <label className="block text-[11px] text-sky-300 mb-1">
                            Диаметр трубы Ø (мм)
                          </label>
                          <select
                            data-testid="sidebar-pipeline-diameter-select"
                            value={
                              selectedObj.pipelineDiameterMm ??
                              getDefaultPipelineDiameterMm(selectedObj.category)
                            }
                            onChange={(e) =>
                              onUpdateObject(selectedObj.id, (p) => ({
                                ...p,
                                pipelineDiameterMm: Number(e.target.value)
                              }))
                            }
                            className="w-full bg-slate-900 border border-sky-500/40 rounded px-2 py-1 text-xs font-mono text-sky-200"
                          >
                            <option value={32}>Ø 32 мм (ПНД ввод)</option>
                            <option value={63}>Ø 63 мм (Газ / Вода)</option>
                            <option value={110}>Ø 110 мм (Магистраль)</option>
                            <option value={160}>Ø 160 мм (Коллектор)</option>
                            <option value={225}>Ø 225 мм (Магистраль ВД)</option>
                            <option value={315}>Ø 315 мм (Коллектор ГК)</option>
                          </select>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Object Rotation Control (0°..360°) in Sidebar */}
                  <div className="pt-1.5 border-t border-slate-800 space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-semibold text-slate-300 flex items-center gap-1">
                        <RotateCw className="w-3 h-3 text-sky-400" />
                        Поворот объекта (°)
                      </span>
                      <div className="flex items-center gap-1">
                        <MillimeterInput
                          ariaLabel="Угол поворота постройки"
                          dataTestId="sidebar-rotation-input"
                          min={0}
                          max={360}
                          step={1}
                          precision={1}
                          value={selectedObj.rotation}
                          onChange={(deg) =>
                            onUpdateObject(selectedObj.id, (p) => ({
                              ...p,
                              rotation: ((deg % 360) + 360) % 360
                            }))
                          }
                          className="w-16 bg-slate-900 border border-slate-700 rounded px-1.5 py-0.5 text-xs font-mono tabular-nums text-sky-400 text-right"
                        />
                        <span className="text-xs font-mono text-sky-400">°</span>
                      </div>
                    </div>
                    <input
                      type="range"
                      aria-label="Ползунок поворота постройки"
                      data-testid="sidebar-rotation-slider"
                      min={0}
                      max={355}
                      step={5}
                      value={selectedObj.rotation}
                      onChange={(e) =>
                        onUpdateObject(selectedObj.id, (p) => ({
                          ...p,
                          rotation: Number(e.target.value)
                        }))
                      }
                      className="w-full accent-sky-500"
                    />
                    <div className="grid grid-cols-5 gap-1">
                      {[0, 45, 90, 180, 270].map((deg) => (
                        <button
                          key={deg}
                          type="button"
                          onClick={() =>
                            onUpdateObject(selectedObj.id, (p) => ({
                              ...p,
                              rotation: deg
                            }))
                          }
                          className={`py-0.5 text-[10px] font-mono rounded border whitespace-nowrap ${
                            selectedObj.rotation === deg
                              ? 'bg-sky-600 text-white border-sky-400'
                              : 'bg-slate-900 text-slate-300 border-slate-800 hover:border-slate-700'
                          }`}
                        >
                          {deg}°
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </section>

            <hr className="border-slate-800" />

            {/* COMPACT CATALOG FOR ADDING OBJECTS */}
            <div className="space-y-2.5">
              <h2 className="text-xs font-semibold text-slate-300">
                Добавить новый объект на генплан
              </h2>
              <div>
                <label
                  htmlFor="new-object-custom-name"
                  className="block text-[11px] text-slate-400 mb-1"
                >
                  Свое название при создании (необязательно):
                </label>
                <input
                  id="new-object-custom-name"
                  data-testid="new-object-custom-name-input"
                  type="text"
                  placeholder="Напр.: Гостевой дом / Кедр / Пруд"
                  value={newObjectCustomName}
                  onChange={(e) => setNewObjectCustomName(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 focus:border-sky-500 rounded-lg px-2.5 py-1.5 text-xs text-white placeholder:text-slate-500 outline-none"
                />
              </div>

              {/* Primary Residential Building */}
              <button
                type="button"
                data-testid="add-cat-house"
                onClick={() => handleAddWithCustomName('house')}
                className="w-full flex items-center justify-between p-2.5 rounded-lg bg-sky-600/15 border border-sky-500/40 hover:bg-sky-600/25 text-left transition-colors"
              >
                <div className="flex items-center gap-2">
                  <Home className="w-4 h-4 text-sky-400 shrink-0" />
                  <div>
                    <div className="text-xs font-semibold text-white">Жилой дом (1–3 эт.)</div>
                    <div className="text-[10px] text-slate-400">
                      Отступ: 5м от улицы · 3м от соседей
                    </div>
                  </div>
                </div>
                <Plus className="w-4 h-4 text-sky-400 shrink-0" />
              </button>

              {/* Outbuildings (Хозпостройки) - Compact 2-Column Grid */}
              <div className="space-y-1.5">
                <span className="text-[11px] font-medium text-slate-400">
                  Хозпостройки и инженерия (Мой участок)
                </span>
                <div className="grid grid-cols-2 gap-1.5">
                  {(
                    [
                      { cat: 'bathhouse', desc: '1м от межи' },
                      { cat: 'garage', desc: '1м от межи' },
                      { cat: 'shed', desc: 'Хозблок 1м' },
                      { cat: 'greenhouse', desc: 'Теплица 1м' },
                      { cat: 'poultry', desc: 'Птичник 4м' },
                      { cat: 'toilet', desc: 'Септик 2м' },
                      { cat: 'well', desc: 'Скважина ≥8м' }
                    ] as { cat: BuildingCategory; desc: string }[]
                  ).map((item) => {
                    const info = BUILDING_CATEGORY_LABELS[item.cat];
                    return (
                      <button
                        key={item.cat}
                        type="button"
                        data-testid={`add-cat-${item.cat}`}
                        onClick={() => handleAddWithCustomName(item.cat)}
                        className="flex items-center justify-between p-2 rounded-lg bg-slate-950 border border-slate-800 hover:border-slate-700 text-left transition-colors"
                      >
                        <div className="min-w-0">
                          <div className="text-[11px] font-medium text-slate-200 truncate">
                            {info.shortLabel}
                          </div>
                          <div className="text-[10px] text-slate-400 truncate">{item.desc}</div>
                        </div>
                        <Plus className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Neighbor Context Objects */}
              <div className="space-y-1.5 pt-1 border-t border-slate-800">
                <span className="text-[11px] font-medium text-amber-400 flex items-center gap-1">
                  <Flame className="w-3.5 h-3.5" />
                  Объекты на соседских участках
                </span>
                <div className="grid grid-cols-2 gap-1.5">
                  <button
                    type="button"
                    data-testid="add-cat-neighbor_house"
                    onClick={() => handleAddWithCustomName('neighbor_house')}
                    className="flex items-center justify-between p-2 rounded-lg bg-slate-950 border border-slate-800 hover:border-amber-500/50 text-left transition-colors"
                  >
                    <div className="min-w-0">
                      <div className="text-[11px] font-medium text-slate-200 truncate">
                        Дом соседа
                      </div>
                      <div className="text-[10px] text-slate-400 truncate">Пож. разрыв 6–15м</div>
                    </div>
                    <Plus className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                  </button>

                  <button
                    type="button"
                    data-testid="add-cat-neighbor_well"
                    onClick={() => handleAddWithCustomName('neighbor_well')}
                    className="flex items-center justify-between p-2 rounded-lg bg-slate-950 border border-slate-800 hover:border-sky-500/50 text-left transition-colors"
                  >
                    <div className="min-w-0">
                      <div className="text-[11px] font-medium text-slate-200 truncate">
                        Колодец соседа
                      </div>
                      <div className="text-[10px] text-slate-400 truncate">Сан. зона 8 м</div>
                    </div>
                    <Droplets className="w-3.5 h-3.5 text-sky-400 shrink-0" />
                  </button>
                </div>
              </div>

              {/* Nature & Landscape + Utilities & Roads */}
              <div className="space-y-1.5 pt-1 border-t border-slate-800">
                <span className="text-[11px] font-medium text-emerald-400">
                  Природа, водоемы, магистральные сети и дороги
                </span>
                <div className="grid grid-cols-2 gap-1.5">
                  {(
                    [
                      { cat: 'forest', desc: 'Лес (разрыв 15м)' },
                      { cat: 'tree_tall', desc: 'Дерево выс. (4м)' },
                      { cat: 'tree_medium', desc: 'Дерево ср. (2м)' },
                      { cat: 'water_body', desc: 'Река/Пруд (20м)' },
                      { cat: 'power_line', desc: 'ЛЭП (ЗОУИТ 10м)' },
                      { cat: 'gas_pipe', desc: 'Газопровод (4м)' },
                      { cat: 'water_main', desc: 'Водопровод (5м)' },
                      { cat: 'sewer_main', desc: 'Канализация (3м)' },
                      { cat: 'road', desc: 'Дорога (5м)' }
                    ] as { cat: BuildingCategory; desc: string }[]
                  ).map((item) => {
                    const info = BUILDING_CATEGORY_LABELS[item.cat];
                    return (
                      <button
                        key={item.cat}
                        type="button"
                        data-testid={`add-cat-${item.cat}`}
                        onClick={() => handleAddWithCustomName(item.cat)}
                        className="flex items-center justify-between p-2 rounded-lg bg-slate-950 border border-slate-800 hover:border-emerald-500/50 text-left transition-colors"
                      >
                        <div className="min-w-0">
                          <div className="text-[11px] font-medium text-slate-200 truncate">
                            {info.shortLabel}
                          </div>
                          <div className="text-[10px] text-slate-400 truncate">{item.desc}</div>
                        </div>
                        <Plus className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'fences' && (
          <div className="space-y-4">
            <div>
              <h2 className="text-xs font-semibold text-slate-300 flex items-center gap-1.5 mb-1">
                <Fence className="w-3.5 h-3.5 text-emerald-400" />
                Маркировка границ и заборов
              </h2>
              <p className="text-xs text-slate-400">
                Назначьте каждой стороне участка статус («Улица 5м», «Проезд 3м», «Сосед») и параметры ограждения.
              </p>
            </div>

            <div className="space-y-3">
              {poly.map((_, idx) => {
                const edge = plot.edges[idx] || {
                  edgeIndex: idx,
                  type: 'neighbor',
                  fenceType: 'mesh',
                  fenceHeight: 1.5,
                  hasNeighborConsent: false
                };
                const isIllegal =
                  plot.category === 'SNT' &&
                  edge.type === 'neighbor' &&
                  (edge.fenceType === 'solid' || edge.fenceHeight > 1.8) &&
                  !edge.hasNeighborConsent;

                const sideNames = [
                  'Южная (Фасад #1)',
                  'Восточная (#2)',
                  'Северная (#3)',
                  'Западная (#4)',
                  'Сторона #5',
                  'Сторона #6'
                ];

                return (
                  <div
                    key={idx}
                    onClick={() => onSelectEdge(idx)}
                    className={`p-3 rounded-lg border transition-colors cursor-pointer space-y-2.5 ${
                      selectedEdgeIndex === idx
                        ? 'bg-slate-800/90 border-sky-500'
                        : isIllegal
                        ? 'bg-slate-950 border-amber-500/60'
                        : 'bg-slate-950 border-slate-800 hover:border-slate-700'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-white">
                        Граница #{idx + 1}: {sideNames[idx] || `Ребро #${idx + 1}`}
                      </span>
                      <span className="text-[11px] font-mono tabular-nums text-slate-400">
                        Отступ дома:{' '}
                        {edge.type === 'street' ? '5.0м' : edge.type === 'driveway' ? '3.0м' : '3.0м'}
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-[11px] text-slate-400 mb-1">Тип границы</label>
                        <select
                          aria-label={`Тип границы ${idx + 1}`}
                          value={edge.type}
                          onChange={(e) => {
                            const newType = e.target.value as BoundaryEdgeType;
                            onUpdatePlot((prev) => {
                              const nextEdges = [...prev.edges];
                              nextEdges[idx] = { ...edge, type: newType };
                              return { ...prev, edges: nextEdges };
                            });
                          }}
                          className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-xs text-slate-100"
                        >
                          <option value="street">Улица (Красная 5м)</option>
                          <option value="driveway">Проезд (3м)</option>
                          <option value="neighbor">Сосед (Межа)</option>
                        </select>
                      </div>

                      <div>
                        <label className="block text-[11px] text-slate-400 mb-1">Полотно забора</label>
                        <select
                          aria-label={`Полотно забора ${idx + 1}`}
                          value={edge.fenceType}
                          onChange={(e) => {
                            const newFence = e.target.value as FenceType;
                            onUpdatePlot((prev) => {
                              const nextEdges = [...prev.edges];
                              nextEdges[idx] = { ...edge, fenceType: newFence };
                              return { ...prev, edges: nextEdges };
                            });
                          }}
                          className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-xs text-slate-100"
                        >
                          <option value="mesh">Сетка / Штакетник (≥50%)</option>
                          <option value="solid">Профлист / Камень (Глухой)</option>
                        </select>
                      </div>
                    </div>

                    <div className="flex items-center justify-between gap-2 pt-1">
                      <label className="text-[11px] text-slate-400">
                        Высота забора:{' '}
                        <span className="font-mono tabular-nums text-white">
                          {edge.fenceHeight.toFixed(1)} м
                        </span>
                      </label>
                      <input
                        type="range"
                        aria-label={`Высота забора ${idx + 1}`}
                        min={1.0}
                        max={2.5}
                        step={0.1}
                        value={edge.fenceHeight}
                        onChange={(e) => {
                          const h = Number(e.target.value);
                          onUpdatePlot((prev) => {
                            const nextEdges = [...prev.edges];
                            nextEdges[idx] = { ...edge, fenceHeight: h };
                            return { ...prev, edges: nextEdges };
                          });
                        }}
                        className="w-28 accent-sky-500"
                      />
                    </div>

                    {/* Wind Load on Fence Edge (СП 20.13330.2016 Раздел 11) */}
                    {(() => {
                      const fenceWind = windAnalysis.fences[idx];
                      if (!fenceWind) return null;
                      return (
                        <div
                          data-testid={`fence-wind-load-card-${idx}`}
                          className="p-2 rounded bg-slate-900/90 border border-slate-800 text-[10px] space-y-1"
                        >
                          <div className="flex items-center justify-between gap-1">
                            <span className="text-sky-300 font-semibold flex items-center gap-1">
                              <Wind className="w-3 h-3 text-sky-400 shrink-0" />
                              Ветровая нагрузка ({windAnalysis.windZone} р-н):
                            </span>
                            <span className="font-mono text-white font-bold">
                              {fenceWind.designWindPressureKgM2} кг/м²
                            </span>
                          </div>
                          <div className="flex items-center justify-between text-slate-300 font-mono">
                            <span>На столб (шаг 2.5м): {fenceWind.forcePerPostKgf} кгс</span>
                            <span className="text-amber-300">M = {fenceWind.bendingMomentPerPostKnm} кН·м</span>
                          </div>
                          <div className="text-slate-400 leading-snug">
                            Реком.: <span className="text-emerald-300">{fenceWind.recommendedPostSpec}</span> (заглубл. {fenceWind.recommendedEmbedmentM} м)
                          </div>
                        </div>
                      );
                    })()}

                    {edge.type === 'neighbor' &&
                      plot.category === 'SNT' &&
                      (edge.fenceType === 'solid' || edge.fenceHeight > 1.8) && (
                        <div className="pt-2 border-t border-slate-800 space-y-2">
                          <p className="text-[11px] text-amber-300 leading-snug">
                            По СП 53.13330.2019 глухой забор или высота &gt;1.8 м между соседями в СНТ требуют письменного согласия!
                          </p>
                          <div className="flex items-center justify-between gap-2">
                            <label className="flex items-center gap-1.5 text-[11px] text-slate-300 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={edge.hasNeighborConsent}
                                onChange={(e) => {
                                  const checked = e.target.checked;
                                  onUpdatePlot((prev) => {
                                    const nextEdges = [...prev.edges];
                                    nextEdges[idx] = { ...edge, hasNeighborConsent: checked };
                                    return { ...prev, edges: nextEdges };
                                  });
                                }}
                                className="accent-emerald-500"
                              />
                              Согласие подписано
                            </label>
                            <button
                              type="button"
                              onClick={(ev) => {
                                ev.stopPropagation();
                                onOpenConsentModal(idx);
                              }}
                              className="px-2.5 py-1 text-[11px] font-medium bg-amber-500/20 text-amber-300 border border-amber-500/40 rounded hover:bg-amber-500/30 transition-colors whitespace-nowrap"
                            >
                              Бланк согласия
                            </button>
                          </div>
                        </div>
                      )}
                  </div>
                );
              })}
            </div>

            {onOpenClaimModal && (
              <div className="p-3 rounded-lg bg-red-950/30 border border-red-700/60 space-y-2">
                <div className="text-xs font-semibold text-red-200 flex items-center gap-1.5">
                  <Scale className="w-3.5 h-3.5 text-red-400" />
                  Нарушены границы или поставлен глухой забор?
                </div>
                <button
                  type="button"
                  data-testid="sidebar-fences-open-claim-btn"
                  onClick={onOpenClaimModal}
                  className="w-full py-2 px-3 bg-red-600 hover:bg-red-500 text-white text-xs font-semibold rounded-lg flex items-center justify-center gap-1.5 transition-colors whitespace-nowrap"
                >
                  <Scale className="w-3.5 h-3.5" />
                  Требование / Досудебная претензия по РФ
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </aside>
  );
};

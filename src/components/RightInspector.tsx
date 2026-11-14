import React, { useState } from 'react';
import {
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Trash2,
  RotateCw,
  FileText,
  Calculator,
  Sun,
  ShieldCheck,
  Info,
  Copy,
  Sparkles,
  Scale,
  Sliders,
  Flame,
  Layers,
  Zap,
  DoorOpen,
  Wind
} from 'lucide-react';
import {
  PlotConfig,
  SiteObject,
  NormViolation,
  RoofType,
  FireResistanceMaterial,
  SlopeDirection,
  FoundationTypeId,
  WallMaterialId,
  BuildingFootprintShape,
  WindowConstructionTypeId,
  RoofInsulationTypeId,
  WallInsulationTypeId
} from '../types';
import {
  calculateRoofGeometryMetrics,
  calculateRoofHeightFromAngle,
  calculateSnowLoad,
  calculateFoundationBearing,
  getWallMaterialRecommendations,
  getObjectWindowsConfig,
  getObjectDoorsConfig,
  getEffectiveWindowTypeId,
  getEffectiveRoofInsulationId,
  getEffectiveWallInsulationId,
  isRoofedBuildingCategory,
  isEnclosedBuildingCategory,
  getEffectivePlotRegion,
  formatMetersMm,
  roundToMm,
  calculateBuildingInteriorArea,
  calculateEnergyAndHeating,
  generateParameterRecommendations,
  calculateBuildingInsolationSanPin,
  calculateBuildingThermalHeatmap,
  computeTotalAboveGroundWallHeight,
  getDefaultWallThicknessM,
  isUndergroundCapableCategory,
  getDefaultBurialDepth,
  getDefaultPipelineDiameterMm,
  getObjectCategoryCapabilities,
  calculatePlotReliefAndDrainage,
  calculateWindRoseAndLoads
} from '../utils/calculations';
import { downloadUrbanPlanningPdfReport } from '../utils/pdfReportGenerator';
import {
  SOILS_DB,
  FOUNDATION_NAMES,
  WINDOW_TYPES_INFO,
  ROOF_INSULATION_INFO,
  WALL_INSULATION_INFO
} from '../data/regions';
import { MillimeterInput } from './MillimeterInput';

interface RightInspectorProps {
  plot: PlotConfig;
  objects: SiteObject[];
  selectedObjectId: string | null;
  violations: NormViolation[];
  xrayWallsMode: boolean;
  undergroundViewMode?: boolean;
  thermalHeatmapMode?: boolean;
  dayOfYear?: number;
  hourOfDay?: number;
  onUpdateObject: (id: string, updater: (prev: SiteObject) => SiteObject) => void;
  onDeleteObject: (id: string) => void;
  onDuplicateObject: (id: string) => void;
  onSelectObject: (id: string) => void;
  onUpdatePlot: (updater: (prev: PlotConfig) => PlotConfig) => void;
  onToggleXrayWalls: (forceVal?: boolean) => void;
  onToggleUndergroundView?: (forceVal?: boolean) => void;
  onToggleThermalHeatmap?: (forceVal?: boolean) => void;
  onOpenConsentModal: (edgeIdx?: number, objectId?: string) => void;
  onOpenClaimModal: () => void;
  onOpenBOMModal: () => void;
}

const ROOF_GEOMETRY_DESCRIPTIONS: Record<
  RoofType,
  { title: string; body3D: string; roof3D: string; formula: string }
> = {
  flat: {
    title: 'Плоская крыша (α ≈ 0°–2°)',
    body3D: 'Прямоугольный параллелепипед или куб (при L = W = H).',
    roof3D: 'Плоский прямоугольник + тонкий параллелепипед парапета.',
    formula: 'S_roof = (L + 2·O)·(W + 2·O), μ = 1.0'
  },
  shed: {
    title: 'Односкатная крыша',
    body3D: 'Прямая трапециевидная призма (боковой фасад — прямоугольная трапеция).',
    roof3D: 'Треугольная призма (клин), лежащая на параллелепипеде стен.',
    formula: 'H_roof = Span·tg(α), S_roof = (L + 2·O)·√((W + 2·O)² + ΔH²)'
  },
  gable: {
    title: 'Двускатная крыша',
    body3D: 'Прямая пятиугольная призма (торцевой фасад со стенами и треугольным фронтоном).',
    roof3D: 'Треугольная призма, поставленная на боковую прямоугольную грань.',
    formula: 'H_roof = (W/2 + O)·tg(α), S_roof = 2·(L + 2·O)·√((W/2 + O)² + H_roof²)'
  },
  hip: {
    title: 'Пирамидальная (шатровая / вальмовая)',
    body3D: 'Обелиск (при прямоугольном плане) или комбинация параллелепипеда и пирамиды.',
    roof3D: 'Четырехугольная пирамида (при L = W) или 4-скатный вальмовый многогранник.',
    formula: 'H_roof = (min(W,L)/2 + O)·tg(α), 4 треугольных/трапециевидных ската'
  }
};

export const RightInspector: React.FC<RightInspectorProps> = ({
  plot,
  objects,
  selectedObjectId,
  violations,
  xrayWallsMode,
  undergroundViewMode = false,
  thermalHeatmapMode = false,
  dayOfYear = 172,
  hourOfDay = 14.5,
  onUpdateObject,
  onDeleteObject,
  onDuplicateObject,
  onSelectObject,
  onUpdatePlot,
  onToggleXrayWalls,
  onToggleUndergroundView,
  onToggleThermalHeatmap,
  onOpenConsentModal,
  onOpenClaimModal,
  onOpenBOMModal
}) => {
  const [activeTab, setActiveTab] = useState<'object' | 'norms' | 'engineering' | 'windows'>(
    'object'
  );

  const selectedObj =
    objects.find((o) => o.id === selectedObjectId) ||
    objects.find((o) => o.category === 'house') ||
    objects[0];

  const region = getEffectivePlotRegion(plot);

  const primaryHouse =
    (selectedObj && isEnclosedBuildingCategory(selectedObj.category)
      ? selectedObj
      : objects.find((o) => o.category === 'house')) || selectedObj;

  const roofMetrics = selectedObj ? calculateRoofGeometryMetrics(selectedObj) : null;
  const selectedSnow = selectedObj ? calculateSnowLoad(selectedObj, region.id) : null;
  const fndResult = primaryHouse
    ? calculateFoundationBearing(primaryHouse, region.id, plot.soilTypeId)
    : null;
  const wallRecs = getWallMaterialRecommendations(region.id);
  const interiorArea = selectedObj ? calculateBuildingInteriorArea(selectedObj) : null;
  const energyResult = primaryHouse ? calculateEnergyAndHeating(primaryHouse, plot) : null;
  const paramRecommendations = generateParameterRecommendations(
    selectedObj,
    plot,
    objects
  );
  const insolationResult = primaryHouse
    ? calculateBuildingInsolationSanPin(primaryHouse, plot, objects, dayOfYear)
    : null;
  const thermalHeatmapResult = primaryHouse
    ? calculateBuildingThermalHeatmap(primaryHouse, plot)
    : null;

  const errorCount = violations.filter((v) => v.severity === 'error').length;
  const warnCount = violations.filter((v) => v.severity === 'warning').length;

  const currentTariffs = plot.heatingTariffs || {
    electricityRubPerKwh: 6.5,
    gasRubPerM3: 7.8,
    firewoodRubPerM3: 3200
  };

  const selectedCaps = selectedObj ? getObjectCategoryCapabilities(selectedObj.category) : null;
  const reliefAnalysis = calculatePlotReliefAndDrainage(plot, objects);
  const windAnalysis = calculateWindRoseAndLoads(plot, objects, selectedObj);
  const activeUtilityObj =
    selectedObj && isUndergroundCapableCategory(selectedObj.category) ? selectedObj : null;

  return (
    <aside className="w-96 shrink-0 h-full bg-slate-900 border-l border-slate-800 flex flex-col overflow-hidden">
      {/* Top Inspector Mode Tabs */}
      <div className="p-3 border-b border-slate-800">
        <div className="grid grid-cols-4 gap-1 p-1 bg-slate-950 rounded-lg border border-slate-800">
          <button
            type="button"
            data-testid="inspector-tab-object"
            onClick={() => setActiveTab('object')}
            className={`py-1.5 px-1.5 text-xs font-medium rounded transition-colors whitespace-nowrap ${
              activeTab === 'object'
                ? 'bg-slate-800 text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            3D Фигура
          </button>
          <button
            type="button"
            data-testid="inspector-tab-norms"
            onClick={() => setActiveTab('norms')}
            className={`py-1.5 px-1.5 text-xs font-medium rounded transition-colors whitespace-nowrap ${
              activeTab === 'norms'
                ? 'bg-slate-800 text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Законы ({errorCount + warnCount})
          </button>
          <button
            type="button"
            data-testid="inspector-tab-engineering"
            onClick={() => setActiveTab('engineering')}
            title="Инженерный расчет"
            className={`py-1.5 px-1 text-[11px] font-medium rounded transition-colors whitespace-nowrap ${
              activeTab === 'engineering'
                ? 'bg-slate-800 text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Инж. расчет
          </button>
          <button
            type="button"
            data-testid="inspector-tab-windows"
            onClick={() => {
              setActiveTab('windows');
              onToggleXrayWalls(true);
            }}
            className={`py-1.5 px-1.5 text-xs font-medium rounded transition-colors whitespace-nowrap ${
              activeTab === 'windows'
                ? 'bg-slate-800 text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Окна/Двери
          </button>
        </div>
      </div>

      {/* Scrollable Inspector Body */}
      <div className="flex-1 overflow-y-auto p-4 space-y-5">
        {/* TAB 1: OBJECT, FLOORS, INTERIOR AREA, FOUNDATION & 3D ROOF GEOMETRY INSPECTOR */}
        {activeTab === 'object' && !selectedObj && (
          <div className="p-4 rounded-lg bg-slate-950 border border-slate-800 text-center space-y-2">
            <p className="text-xs text-slate-400">
              На участке нет выбранных построек. Добавьте постройку во вкладке «2. Постройки» слева.
            </p>
          </div>
        )}
        {activeTab === 'object' && selectedObj && selectedCaps && roofMetrics && selectedSnow && interiorArea && (
          <div className="space-y-4">
            {/* Object Selector Bar + Rotate / Duplicate / Delete Actions */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label htmlFor="active-object-select" className="block text-xs text-slate-400">
                  Выбранный объект на генплане
                </label>
                <span
                  data-testid="inspector-object-category-badge"
                  className="px-2 py-0.5 rounded bg-slate-800 border border-slate-700 text-[10px] font-mono text-sky-300"
                >
                  {selectedCaps.categoryTitle}
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                <select
                  id="active-object-select"
                  value={selectedObj.id}
                  onChange={(e) => onSelectObject(e.target.value)}
                  className="flex-1 bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-2 text-xs font-medium text-white"
                >
                  {objects.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.name} ({formatMetersMm(o.width)}×{formatMetersMm(o.length)} м)
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() =>
                    onUpdateObject(selectedObj.id, (prev) => ({
                      ...prev,
                      rotation: (prev.rotation + 90) % 360
                    }))
                  }
                  title="Повернуть на 90°"
                  aria-label="Повернуть объект на 90 градусов"
                  className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg border border-slate-700 transition-colors"
                >
                  <RotateCw className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => onDuplicateObject(selectedObj.id)}
                  title="Дублировать постройку"
                  aria-label="Дублировать постройку"
                  className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg border border-slate-700 transition-colors"
                >
                  <Copy className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  data-testid="inspector-delete-btn"
                  onClick={() => onDeleteObject(selectedObj.id)}
                  title="Убрать постройку с участка"
                  aria-label="Удалить выбранную постройку"
                  className="px-2.5 py-2 bg-red-950/70 hover:bg-red-900/80 text-red-200 rounded-lg border border-red-800/70 transition-colors flex items-center gap-1 text-xs font-medium whitespace-nowrap"
                >
                  <Trash2 className="w-3.5 h-3.5 text-red-400" />
                  <span>Убрать</span>
                </button>
              </div>
            </div>

            {/* NET INTERIOR AREA INSIDE WALLS CARD (только для строений со стенами) */}
            {selectedCaps.hasInteriorAreaInsideWalls && (
              <div
                data-testid="interior-area-card"
                className="p-3 rounded-lg bg-slate-950 border border-emerald-500/40 space-y-2.5"
              >
                <div className="flex items-center justify-between border-b border-slate-800 pb-1.5">
                  <span className="text-xs font-semibold text-emerald-300">
                    Расчет площади внутри стен строения
                  </span>
                  <span
                    data-testid="interior-net-area-value"
                    className="text-xs font-mono tabular-nums font-bold text-emerald-400"
                  >
                    {interiorArea.totalNetInteriorAllFloorsSqm} м²
                  </span>
                </div>

                {selectedCaps.hasInteriorAreaInsideWalls && (
                  <div className="grid grid-cols-2 gap-2 items-center">
                    <label htmlFor="wall-thickness-input" className="text-[11px] text-slate-300">
                      Толщина наружных стен (м):
                    </label>
                    <MillimeterInput
                      id="wall-thickness-input"
                      ariaLabel="Толщина наружных стен (м)"
                      dataTestId="wall-thickness-input"
                      min={0.05}
                      max={1.2}
                      step={0.01}
                      precision={3}
                      value={getDefaultWallThicknessM(selectedObj)}
                      onChange={(val) =>
                        onUpdateObject(selectedObj.id, (prev) => ({
                          ...prev,
                          wallThickness: Math.max(0.05, Math.min(1.2, val))
                        }))
                      }
                      className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-xs font-mono tabular-nums text-white text-right"
                    />
                  </div>
                )}

                <div className="grid grid-cols-2 gap-1.5 text-[11px]">
                  <div className="p-1.5 rounded bg-slate-900 border border-slate-800">
                    <span className="block text-[10px] text-slate-400">Внешняя (застройка):</span>
                    <span
                      data-testid="interior-gross-area-value"
                      className="font-mono tabular-nums font-semibold text-slate-200"
                    >
                      {interiorArea.grossFootprintAreaSqm} м²
                    </span>
                  </div>
                  <div className="p-1.5 rounded bg-slate-900 border border-slate-800">
                    <span className="block text-[10px] text-slate-400">Внутри стен (1 этаж):</span>
                    <span
                      data-testid="interior-single-floor-value"
                      className="font-mono tabular-nums font-semibold text-emerald-300"
                    >
                      {interiorArea.netInteriorSingleFloorSqm} м²
                    </span>
                  </div>
                  <div className="p-1.5 rounded bg-slate-900 border border-slate-800">
                    <span className="block text-[10px] text-slate-400">Полезная (без перег.):</span>
                    <span className="font-mono tabular-nums font-semibold text-sky-300">
                      {interiorArea.usableRoomSingleFloorSqm} м²
                    </span>
                  </div>
                  <div className="p-1.5 rounded bg-slate-900 border border-slate-800">
                    <span className="block text-[10px] text-slate-400">
                      Все этажи ({interiorArea.aboveGroundFloors + (interiorArea.hasBasement ? 1 : 0)} ур.):
                    </span>
                    <span className="font-mono tabular-nums font-bold text-emerald-400">
                      {interiorArea.totalNetInteriorAllFloorsSqm} м²
                    </span>
                  </div>
                </div>
              </div>
            )}

            {/* MULTI-STORY & UNDERGROUND BASEMENT CONFIGURATION (До 3х этажей + 1 подземный) */}
            {selectedCaps.hasMultiStoryAndBasement && (
              <div
                data-testid="floors-config-card"
                className="p-3 rounded-lg bg-slate-950 border border-sky-500/40 space-y-2.5"
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-sky-300 flex items-center gap-1.5">
                    <Layers className="w-3.5 h-3.5 text-sky-400" />
                    Этажность (1–3 эт. + 1 подземный)
                  </span>
                  <span className="text-[11px] font-mono tabular-nums text-slate-400">
                    H_стен = {formatMetersMm(selectedObj.wallHeight)} м
                  </span>
                </div>

                {/* 1, 2, 3 Above-Ground Floors Selector */}
                <div className="grid grid-cols-3 gap-1.5">
                  {[1, 2, 3].map((fl) => {
                    const currentFloors = Math.min(3, Math.max(1, Math.round(selectedObj.floors || 1)));
                    return (
                      <button
                        key={fl}
                        type="button"
                        data-testid={`floors-btn-${fl}`}
                        onClick={() =>
                          onUpdateObject(selectedObj.id, (prev) => {
                            const fh = prev.floorHeight ?? 2.8;
                            const slab = prev.interfloorSlabThickness ?? 0.25;
                            const nextWallH = roundToMm(fl * fh + Math.max(0, fl - 1) * slab);
                            return {
                              ...prev,
                              floors: fl,
                              floorHeight: fh,
                              interfloorSlabThickness: slab,
                              wallHeight: nextWallH
                            };
                          })
                        }
                        className={`py-1.5 px-2 text-xs font-semibold rounded-lg border transition-colors whitespace-nowrap ${
                          currentFloors === fl
                            ? 'bg-sky-600 text-white border-sky-400'
                            : 'bg-slate-900 text-slate-300 border-slate-800 hover:border-slate-700'
                        }`}
                      >
                        {fl} {fl === 1 ? 'этаж' : 'этажа'}
                      </button>
                    );
                  })}
                </div>

                {/* +1 Underground Basement Checkbox */}
                <label className="flex items-center justify-between p-2 rounded-lg bg-slate-900 border border-slate-800 cursor-pointer hover:border-slate-700">
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      data-testid="toggle-basement-checkbox"
                      checked={Boolean(selectedObj.hasBasement)}
                      onChange={(e) => {
                        const checked = e.target.checked;
                        onUpdateObject(selectedObj.id, (prev) => ({
                          ...prev,
                          hasBasement: checked,
                          basementDepth: prev.basementDepth ?? 2.4
                        }));
                        if (checked && onToggleUndergroundView) {
                          onToggleUndergroundView(true);
                        }
                      }}
                      className="accent-sky-500"
                    />
                    <span className="text-xs font-medium text-slate-200">
                      + 1 Подземный этаж (цокольный / подвал)
                    </span>
                  </div>
                  <span className="text-[10px] font-mono tabular-nums text-sky-400">
                    {selectedObj.hasBasement ? `−${(selectedObj.basementDepth ?? 2.4).toFixed(2)}м` : 'Выкл'}
                  </span>
                </label>

                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <label htmlFor="floor-height-input" className="block text-[10px] text-slate-400 mb-1">
                      Выс. этажа (м)
                    </label>
                    <MillimeterInput
                      id="floor-height-input"
                      ariaLabel="Высота этажа в чистоте (м)"
                      dataTestId="floor-height-input"
                      min={2.1}
                      max={4.5}
                      step={0.05}
                      precision={3}
                      value={selectedObj.floorHeight ?? 2.8}
                      onChange={(val) =>
                        onUpdateObject(selectedObj.id, (prev) => {
                          const fh = Math.max(2.1, Math.min(4.5, val));
                          const fl = Math.min(3, Math.max(1, Math.round(prev.floors || 1)));
                          const slab = prev.interfloorSlabThickness ?? 0.25;
                          return {
                            ...prev,
                            floorHeight: fh,
                            wallHeight: roundToMm(fl * fh + Math.max(0, fl - 1) * slab)
                          };
                        })
                      }
                      className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-xs font-mono tabular-nums text-white"
                    />
                  </div>
                  <div>
                    <label htmlFor="interfloor-slab-input" className="block text-[10px] text-slate-400 mb-1">
                      Перекрытие (м)
                    </label>
                    <MillimeterInput
                      id="interfloor-slab-input"
                      ariaLabel="Толщина межэтажного перекрытия (м)"
                      dataTestId="interfloor-slab-input"
                      min={0.1}
                      max={0.6}
                      step={0.01}
                      precision={3}
                      value={selectedObj.interfloorSlabThickness ?? 0.25}
                      onChange={(val) =>
                        onUpdateObject(selectedObj.id, (prev) => {
                          const slab = Math.max(0.1, Math.min(0.6, val));
                          const fl = Math.min(3, Math.max(1, Math.round(prev.floors || 1)));
                          const fh = prev.floorHeight ?? 2.8;
                          return {
                            ...prev,
                            interfloorSlabThickness: slab,
                            wallHeight: roundToMm(fl * fh + Math.max(0, fl - 1) * slab)
                          };
                        })
                      }
                      className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-xs font-mono tabular-nums text-white"
                    />
                  </div>
                  <div>
                    <label htmlFor="basement-depth-input" className="block text-[10px] text-slate-400 mb-1">
                      Глуб. подвала (м)
                    </label>
                    <MillimeterInput
                      id="basement-depth-input"
                      ariaLabel="Глубина подземного этажа (м)"
                      dataTestId="basement-depth-input"
                      min={1.5}
                      max={4.5}
                      step={0.1}
                      precision={3}
                      value={selectedObj.basementDepth ?? 2.4}
                      onChange={(val) =>
                        onUpdateObject(selectedObj.id, (prev) => ({
                          ...prev,
                          hasBasement: true,
                          basementDepth: Math.max(1.5, Math.min(4.5, val))
                        }))
                      }
                      className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-xs font-mono tabular-nums text-white"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* PLINTH HEIGHT & FOUNDATION SLAB OVERHANG / THICKNESS CARD */}
            {selectedCaps.hasPlinthAndFoundationSlab && (
              <div
                data-testid="plinth-foundation-card"
                className="p-3 rounded-lg bg-slate-950 border border-slate-800 space-y-2.5"
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-200">
                    Цоколь и плита фундамента (3D)
                  </span>
                  <span className="text-[10px] font-mono tabular-nums text-slate-400">
                    Цоколь {(selectedObj.plinthHeight ?? 0.45).toFixed(2)}м
                  </span>
                </div>

                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <label htmlFor="plinth-height-input" className="block text-[10px] text-slate-400 mb-1">
                      Выс. цоколя (м)
                    </label>
                    <MillimeterInput
                      id="plinth-height-input"
                      ariaLabel="Высота цоколя (м)"
                      dataTestId="plinth-height-input"
                      min={0.1}
                      max={1.5}
                      step={0.05}
                      precision={3}
                      value={selectedObj.plinthHeight ?? 0.45}
                      onChange={(val) =>
                        onUpdateObject(selectedObj.id, (prev) => ({
                          ...prev,
                          plinthHeight: Math.max(0.1, Math.min(1.5, val))
                        }))
                      }
                      className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-xs font-mono tabular-nums text-white"
                    />
                  </div>
                  <div>
                    <label htmlFor="fnd-slab-overhang-input" className="block text-[10px] text-slate-400 mb-1">
                      Выступ плиты (м)
                    </label>
                    <MillimeterInput
                      id="fnd-slab-overhang-input"
                      ariaLabel="Выступ плиты фундамента (м)"
                      dataTestId="fnd-slab-overhang-input"
                      min={0}
                      max={1.2}
                      step={0.05}
                      precision={3}
                      value={selectedObj.foundationSlabOverhang ?? 0.25}
                      onChange={(val) =>
                        onUpdateObject(selectedObj.id, (prev) => ({
                          ...prev,
                          foundationSlabOverhang: Math.max(0, Math.min(1.2, val))
                        }))
                      }
                      className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-xs font-mono tabular-nums text-white"
                    />
                  </div>
                  <div>
                    <label htmlFor="fnd-slab-thickness-input" className="block text-[10px] text-slate-400 mb-1">
                      Толщ. плиты (м)
                    </label>
                    <MillimeterInput
                      id="fnd-slab-thickness-input"
                      ariaLabel="Толщина плиты фундамента (м)"
                      dataTestId="fnd-slab-thickness-input"
                      min={0.15}
                      max={0.8}
                      step={0.05}
                      precision={3}
                      value={selectedObj.foundationSlabThickness ?? 0.3}
                      onChange={(val) =>
                        onUpdateObject(selectedObj.id, (prev) => ({
                          ...prev,
                          foundationSlabThickness: Math.max(0.15, Math.min(0.8, val))
                        }))
                      }
                      className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-xs font-mono tabular-nums text-white"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* QUICK DOORS & WINDOWS SUMMARY CARD IN TAB 1 */}
            {(selectedCaps.hasDoors || selectedCaps.hasWindows) && (() => {
              const dCfg = getObjectDoorsConfig(selectedObj);
              const wCfg = getObjectWindowsConfig(selectedObj);
              const totalDoors = (dCfg.south || 0) + (dCfg.north || 0) + (dCfg.east || 0) + (dCfg.west || 0);
              const totalWins = (wCfg.south || 0) + (wCfg.north || 0) + (wCfg.east || 0) + (wCfg.west || 0);
              return (
                <div
                  data-testid="quick-doors-windows-card"
                  className="p-3 rounded-lg bg-slate-950 border border-amber-500/35 space-y-2"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-semibold text-amber-300 flex items-center gap-1.5">
                      <DoorOpen className="w-3.5 h-3.5 text-amber-400" />
                      Двери ({totalDoors} шт.) и Окна ({totalWins} шт./эт.)
                    </span>
                    <button
                      type="button"
                      data-testid="quick-open-doors-tab-btn"
                      onClick={() => {
                        setActiveTab('windows');
                        onToggleXrayWalls(true);
                      }}
                      className="px-2 py-0.5 rounded text-[10px] font-semibold bg-amber-500/20 hover:bg-amber-500/30 text-amber-200 border border-amber-500/40 transition-colors whitespace-nowrap"
                    >
                      Настроить двери и окна →
                    </button>
                  </div>
                  <div className="text-[11px] font-mono text-slate-400 flex items-center justify-between">
                    <span>
                      Дверь: {(dCfg.doorWidth ?? 0.95).toFixed(2)}×{(dCfg.doorHeight ?? 2.05).toFixed(2)} м
                      {dCfg.hasGlazing ? ' (остекл.)' : ''}
                    </span>
                    <span>
                      Ю:{dCfg.south} В:{dCfg.east} З:{dCfg.west} С:{dCfg.north}
                    </span>
                  </div>
                </div>
              );
            })()}

            {/* UNDERGROUND UTILITIES & PIPELINE-SPECIFIC CARD (только для инженерных сетей, скважины и септика) */}
            {selectedCaps.hasBurialDepth && activeUtilityObj && (
              <div
                data-testid="underground-utility-card"
                className="p-3 rounded-lg bg-slate-950 border border-cyan-500/45 space-y-2.5"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-xs font-semibold text-cyan-300 min-w-0 break-words">
                    {selectedCaps.hasPipelineDiameter
                      ? 'Характеристики трубопровода и трассы'
                      : 'Заглубление подземного сооружения'}
                  </span>
                  {onToggleUndergroundView && (
                    <button
                      type="button"
                      data-testid="inspector-toggle-underground-btn"
                      onClick={() => onToggleUndergroundView()}
                      className={`px-2 py-0.5 rounded text-[10px] font-semibold border transition-colors whitespace-nowrap shrink-0 ${
                        undergroundViewMode
                          ? 'bg-cyan-500 text-slate-950 border-cyan-300'
                          : 'bg-slate-900 text-cyan-300 border-cyan-500/40 hover:bg-slate-800'
                      }`}
                    >
                      {undergroundViewMode ? '3D Подземный ВКЛ' : 'Показать под землей'}
                    </button>
                  )}
                </div>

                {selectedCaps.hasPipelineDiameter && (
                  <div
                    data-testid="pipeline-specific-card"
                    className="p-2 rounded bg-slate-900 border border-cyan-500/30 space-y-2"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <label htmlFor="pipeline-diameter-select" className="text-[11px] text-slate-300">
                        Наружный диаметр трубы Ø (мм):
                      </label>
                      <select
                        id="pipeline-diameter-select"
                        data-testid="pipeline-diameter-select"
                        value={
                          selectedObj.pipelineDiameterMm ??
                          getDefaultPipelineDiameterMm(selectedObj.category)
                        }
                        onChange={(e) => {
                          const dia = Number(e.target.value);
                          onUpdateObject(selectedObj.id, (prev) => ({
                            ...prev,
                            pipelineDiameterMm: dia
                          }));
                        }}
                        className="bg-slate-950 border border-cyan-500/50 rounded px-2 py-1 text-xs font-mono text-cyan-300"
                      >
                        <option value={32}>Ø 32 мм (ПНД ввод)</option>
                        <option value={63}>Ø 63 мм (распред. сеть)</option>
                        <option value={110}>Ø 110 мм (магистраль)</option>
                        <option value={160}>Ø 160 мм (коллектор)</option>
                        <option value={225}>Ø 225 мм (магистр. сеть)</option>
                        <option value={315}>Ø 315 мм (высокого давл.)</option>
                      </select>
                    </div>
                    <div className="text-[10px] font-mono text-slate-400 flex flex-wrap items-center justify-between gap-x-2 gap-y-0.5">
                      <span className="whitespace-nowrap">Конфигурация: Линейная труба</span>
                      <span className="whitespace-nowrap">
                        L = {formatMetersMm(selectedObj.width)} м · B = {formatMetersMm(selectedObj.length)} м
                      </span>
                    </div>
                  </div>
                )}

                <div className="space-y-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <label
                      htmlFor="utility-burial-depth-input"
                      className="text-[11px] text-slate-300 truncate"
                    >
                      Глубина заложения «{activeUtilityObj.name}» (м):
                    </label>
                    <div className="w-24 shrink-0">
                      <MillimeterInput
                        id="utility-burial-depth-input"
                        ariaLabel="Глубина заложения подземной коммуникации (м)"
                        dataTestId="utility-burial-depth-input"
                        min={0.3}
                        max={25.0}
                        step={0.1}
                        precision={2}
                        value={
                          activeUtilityObj.burialDepth ??
                          getDefaultBurialDepth(activeUtilityObj.category)
                        }
                        onChange={(val) =>
                          onUpdateObject(activeUtilityObj.id, (prev) => ({
                            ...prev,
                            burialDepth: Math.max(0.3, val)
                          }))
                        }
                        className="w-full bg-slate-900 border border-cyan-500/50 rounded px-2 py-1 text-xs font-mono tabular-nums text-cyan-300 text-right"
                      />
                    </div>
                  </div>
                  <div className="text-[10px] font-mono tabular-nums text-slate-400 flex flex-wrap items-center justify-between gap-x-2 gap-y-0.5">
                    <span className="whitespace-nowrap">Промерзание грунта: {region.frostDepth} м</span>
                    <span className="whitespace-nowrap">
                      Рек. норма СП 31.13330: ≥ {(region.frostDepth + 0.3).toFixed(2)} м
                    </span>
                  </div>
                </div>
              </div>
            )}

            {/* Object Name & Plan Footprint Shape (конфигурация стен — только для зданий) */}
            <div className="p-3 rounded-lg bg-slate-950 border border-slate-800 space-y-3">
              <div>
                <label htmlFor="obj-name-input" className="block text-xs text-slate-400 mb-1">
                  Наименование объекта
                </label>
                <input
                  id="obj-name-input"
                  type="text"
                  value={selectedObj.name}
                  onChange={(e) =>
                    onUpdateObject(selectedObj.id, (prev) => ({
                      ...prev,
                      name: e.target.value
                    }))
                  }
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white"
                />
              </div>

              {selectedCaps.hasPlanFootprintShape && (
                <>
                  <div>
                    <span className="block text-xs font-semibold text-slate-300 mb-1.5">
                      Форма здания в плане (конфигурация стен)
                    </span>
                    <div className="grid grid-cols-2 gap-1.5">
                      {(
                        [
                          { id: 'rectangle', label: 'Прямоугольная' },
                          { id: 'l_shape', label: 'Г-образная (крыло)' },
                          { id: 't_shape', label: 'Т-образная (эркер)' },
                          { id: 'chamfered', label: 'Скошенная (октагон)' }
                        ] as { id: BuildingFootprintShape; label: string }[]
                      ).map((sh) => {
                        const currentShape = selectedObj.footprintShape || 'rectangle';
                        return (
                          <button
                            key={sh.id}
                            type="button"
                            onClick={() =>
                              onUpdateObject(selectedObj.id, (prev) => ({
                                ...prev,
                                footprintShape: sh.id,
                                wingWidth: prev.wingWidth || roundToMm(prev.width * 0.42),
                                wingLength: prev.wingLength || roundToMm(prev.length * 0.38)
                              }))
                            }
                            className={`py-1.5 px-2 text-xs font-medium rounded-lg border text-left transition-colors ${
                              currentShape === sh.id
                                ? 'bg-sky-600/20 border-sky-500 text-white'
                                : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200'
                            }`}
                          >
                            {sh.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {(selectedObj.footprintShape === 'l_shape' ||
                    selectedObj.footprintShape === 't_shape') && (
                    <div className="grid grid-cols-2 gap-2 pt-1 border-t border-slate-800">
                      <div>
                        <label className="block text-[11px] text-slate-400 mb-1">
                          {selectedObj.footprintShape === 'l_shape'
                            ? 'Ширина выреза (м, до 1мм)'
                            : 'Ширина эркера (м, до 1мм)'}
                        </label>
                        <MillimeterInput
                          min={1.0}
                          max={Math.max(2, selectedObj.width - 1.0)}
                          step={0.001}
                          precision={3}
                          value={selectedObj.wingWidth || roundToMm(selectedObj.width * 0.4)}
                          onChange={(val) =>
                            onUpdateObject(selectedObj.id, (prev) => ({
                              ...prev,
                              wingWidth: Math.max(1.0, val)
                            }))
                          }
                          className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-xs font-mono tabular-nums text-white"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] text-slate-400 mb-1">
                          {selectedObj.footprintShape === 'l_shape'
                            ? 'Глубина выреза (м, до 1мм)'
                            : 'Вылет эркера (м, до 1мм)'}
                        </label>
                        <MillimeterInput
                          min={0.5}
                          max={Math.max(2, selectedObj.length - 1.0)}
                          step={0.001}
                          precision={3}
                          value={selectedObj.wingLength || roundToMm(selectedObj.length * 0.35)}
                          onChange={(val) =>
                            onUpdateObject(selectedObj.id, (prev) => ({
                              ...prev,
                              wingLength: Math.max(0.5, val)
                            }))
                          }
                          className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-xs font-mono tabular-nums text-white"
                        />
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>

            {/* Position & Object-Specific Dimensions with 1mm accuracy */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-300">
                  {selectedCaps.hasPipelineDiameter
                    ? 'Протяженность трассы и траншея (точность 1 мм)'
                    : 'Габариты и привязка (точность 1 мм)'}
                </span>
                <span className="text-[10px] font-mono text-emerald-400">
                  Ввод через «.» или «,»
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label htmlFor="obj-width" className="block text-xs text-slate-400 mb-1">
                    {selectedCaps.widthLabel}
                  </label>
                  <MillimeterInput
                    id="obj-width"
                    dataTestId="inspector-width-input"
                    min={0.4}
                    max={80}
                    step={0.001}
                    precision={3}
                    value={selectedObj.width}
                    onChange={(val) =>
                      onUpdateObject(selectedObj.id, (prev) => ({
                        ...prev,
                        width: Math.max(0.4, val)
                      }))
                    }
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs font-mono tabular-nums text-white"
                  />
                </div>
                <div>
                  <label htmlFor="obj-length" className="block text-xs text-slate-400 mb-1">
                    {selectedCaps.lengthLabel}
                  </label>
                  <MillimeterInput
                    id="obj-length"
                    dataTestId="inspector-length-input"
                    min={0.4}
                    max={80}
                    step={0.001}
                    precision={3}
                    value={selectedObj.length}
                    onChange={(val) =>
                      onUpdateObject(selectedObj.id, (prev) => ({
                        ...prev,
                        length: Math.max(0.4, val)
                      }))
                    }
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs font-mono tabular-nums text-white"
                  />
                </div>
                {selectedCaps.heightLabel !== null && (
                  <div>
                    <label htmlFor="obj-wall-h" className="block text-xs text-slate-400 mb-1">
                      {selectedCaps.heightLabel}
                    </label>
                    <MillimeterInput
                      id="obj-wall-h"
                      dataTestId="inspector-wall-height-input"
                      min={0.2}
                      max={25}
                      step={0.001}
                      precision={3}
                      value={selectedObj.wallHeight}
                      onChange={(val) =>
                        onUpdateObject(selectedObj.id, (prev) => {
                          const nextWallH = Math.max(0.2, val);
                          const fl = Math.min(3, Math.max(1, Math.round(prev.floors || 1)));
                          const slab = prev.interfloorSlabThickness ?? 0.25;
                          const nextFloorH =
                            prev.floorHeight !== undefined
                              ? roundToMm(Math.max(1.2, (nextWallH - Math.max(0, fl - 1) * slab) / fl))
                              : undefined;
                          return {
                            ...prev,
                            wallHeight: nextWallH,
                            ...(nextFloorH !== undefined ? { floorHeight: nextFloorH } : {})
                          };
                        })
                      }
                      className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs font-mono tabular-nums text-white"
                    />
                  </div>
                )}
                {selectedCaps.hasRoofGeometry && (
                  <div>
                    <label htmlFor="obj-roof-h" className="block text-xs text-slate-400 mb-1">
                      Высота крыши H_roof (м)
                    </label>
                    <MillimeterInput
                      id="obj-roof-h"
                      dataTestId="inspector-roof-height-input"
                      min={0.05}
                      max={12}
                      step={0.001}
                      precision={3}
                      value={selectedObj.roofHeight}
                      onChange={(val) =>
                        onUpdateObject(selectedObj.id, (prev) => ({
                          ...prev,
                          roofHeight: Math.max(0.05, val)
                        }))
                      }
                      className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs font-mono tabular-nums text-white"
                    />
                  </div>
                )}
              </div>
            </div>

            {/* Coordinates X / Z */}
            <div className="grid grid-cols-2 gap-2.5">
              <div>
                <label htmlFor="obj-pos-x" className="block text-xs text-slate-400 mb-1">
                  Смещение Восток/Запад X (м)
                </label>
                <MillimeterInput
                  id="obj-pos-x"
                  dataTestId="inspector-pos-x-input"
                  step={0.001}
                  precision={3}
                  value={selectedObj.x}
                  onChange={(val) =>
                    onUpdateObject(selectedObj.id, (prev) => ({
                      ...prev,
                      x: val
                    }))
                  }
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs font-mono tabular-nums text-white"
                />
              </div>
              <div>
                <label htmlFor="obj-pos-z" className="block text-xs text-slate-400 mb-1">
                  Смещение Юг/Север Z (м)
                </label>
                <MillimeterInput
                  id="obj-pos-z"
                  dataTestId="inspector-pos-z-input"
                  step={0.001}
                  precision={3}
                  value={selectedObj.z}
                  onChange={(val) =>
                    onUpdateObject(selectedObj.id, (prev) => ({
                      ...prev,
                      z: val
                    }))
                  }
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs font-mono tabular-nums text-white"
                />
              </div>
            </div>

            {/* Object Rotation Control (0°..360°) */}
            <div className="p-3 rounded-lg bg-slate-950 border border-slate-800 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <label
                  htmlFor="inspector-rotation-slider"
                  className="text-xs font-semibold text-slate-200 flex items-center gap-1.5"
                >
                  <RotateCw className="w-3.5 h-3.5 text-sky-400" />
                  Поворот объекта на участке (°)
                </label>
                <div className="flex items-center gap-1">
                  <MillimeterInput
                    ariaLabel="Угол поворота объекта в градусах"
                    dataTestId="inspector-rotation-input"
                    min={0}
                    max={360}
                    step={1}
                    precision={1}
                    value={selectedObj.rotation}
                    onChange={(deg) =>
                      onUpdateObject(selectedObj.id, (prev) => ({
                        ...prev,
                        rotation: ((deg % 360) + 360) % 360
                      }))
                    }
                    className="w-16 bg-slate-900 border border-slate-700 rounded px-1.5 py-0.5 text-xs font-mono tabular-nums font-bold text-sky-400 text-right"
                  />
                  <span className="text-xs font-mono text-sky-400">°</span>
                </div>
              </div>
              <input
                id="inspector-rotation-slider"
                data-testid="inspector-rotation-slider"
                type="range"
                min={0}
                max={359}
                step={1}
                value={selectedObj.rotation}
                onChange={(e) =>
                  onUpdateObject(selectedObj.id, (prev) => ({
                    ...prev,
                    rotation: Number(e.target.value)
                  }))
                }
                className="w-full accent-sky-500"
              />
              <div className="grid grid-cols-6 gap-1">
                {[
                  {
                    label: '−45°',
                    fn: (r: number) => (((r - 45) % 360) + 360) % 360,
                    testId: 'rot-minus-45'
                  },
                  { label: '+45°', fn: (r: number) => (r + 45) % 360, testId: 'rot-plus-45' },
                  { label: '0°', fn: () => 0, testId: 'rot-preset-0' },
                  { label: '90°', fn: () => 90, testId: 'rot-preset-90' },
                  { label: '180°', fn: () => 180, testId: 'rot-preset-180' },
                  { label: '270°', fn: () => 270, testId: 'rot-preset-270' }
                ].map((btn) => (
                  <button
                    key={btn.label}
                    type="button"
                    data-testid={`inspector-${btn.testId}`}
                    onClick={() =>
                      onUpdateObject(selectedObj.id, (prev) => ({
                        ...prev,
                        rotation: btn.fn(prev.rotation)
                      }))
                    }
                    className="py-1 text-[10px] font-mono rounded bg-slate-900 hover:bg-slate-800 text-slate-200 border border-slate-800 hover:border-slate-700 transition-colors whitespace-nowrap"
                  >
                    {btn.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Overhang Slider & 1mm Input with Trap Warning (> 0.5m) — только для строений с кровлей */}
            {selectedCaps.hasRoofOverhang && (
              <div className="p-3 rounded-lg bg-slate-950 border border-slate-800 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <label htmlFor="overhang-slider" className="text-xs font-medium text-slate-200">
                    Вылет свеса кровли (м)
                  </label>
                  <div className="w-24">
                    <MillimeterInput
                      dataTestId="inspector-overhang-input"
                      min={0}
                      max={2.0}
                      step={0.001}
                      precision={3}
                      value={selectedObj.overhang}
                      onChange={(val) =>
                        onUpdateObject(selectedObj.id, (prev) => ({
                          ...prev,
                          overhang: Math.max(0, val)
                        }))
                      }
                      className={`w-full bg-slate-900 border border-slate-700 rounded px-2 py-0.5 text-xs font-mono tabular-nums text-right ${
                        roofMetrics.overhangRuleTriggered ? 'text-amber-400' : 'text-sky-400'
                      }`}
                    />
                  </div>
                </div>
                <input
                  id="overhang-slider"
                  type="range"
                  min={0.05}
                  max={1.2}
                  step={0.005}
                  value={selectedObj.overhang}
                  onChange={(e) =>
                    onUpdateObject(selectedObj.id, (prev) => ({
                      ...prev,
                      overhang: roundToMm(Number(e.target.value))
                    }))
                  }
                  className="w-full accent-sky-500"
                />
                {roofMetrics.overhangRuleTriggered ? (
                  <p className="text-[11px] text-amber-300 leading-snug">
                    Внимание (п. 6.7 СП 53.13330.2019): Свес крыши более 500 мм! Отступ до границы считается от проекции края кровли ({formatMetersMm(roofMetrics.effectiveFootprintWidth)}×{formatMetersMm(roofMetrics.effectiveFootprintLength)} м).
                  </p>
                ) : (
                  <p className="text-[11px] text-slate-400">
                    Свес ≤ 500 мм: отступ до забора измеряется по наружным стенам ({formatMetersMm(selectedObj.width)}×{formatMetersMm(selectedObj.length)} м).
                  </p>
                )}
              </div>
            )}

            {/* 4 Mathematical Roof Types + Coupled Slope Angle α (°) Regulator — только для строений с крышей */}
            {selectedCaps.hasRoofGeometry && (
              <div className="space-y-2.5">
                <span className="block text-xs font-semibold text-slate-300">
                  Тип крыши, угол наклона α (°) и 3D-геометрия
                </span>
                <div className="grid grid-cols-2 gap-1.5">
                  {(
                    [
                      { id: 'flat', label: 'Плоская' },
                      { id: 'shed', label: 'Односкатная' },
                      { id: 'gable', label: 'Двускатная' },
                      { id: 'hip', label: 'Пирамидальная' }
                    ] as { id: RoofType; label: string }[]
                  ).map((rt) => (
                    <button
                      key={rt.id}
                      type="button"
                      data-testid={`roof-type-btn-${rt.id}`}
                      onClick={() =>
                        onUpdateObject(selectedObj.id, (prev) => ({ ...prev, roofType: rt.id }))
                      }
                      className={`py-2 px-2.5 text-xs font-medium rounded-lg border text-left transition-colors ${
                        selectedObj.roofType === rt.id
                          ? 'bg-sky-600/20 border-sky-500 text-white'
                          : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      {rt.label}
                    </button>
                  ))}
                </div>

                {/* Roof Slope Angle Regulator coupled with 3D roofHeight & Snow Load */}
                {selectedObj.roofType !== 'flat' && (
                  <div className="p-3 rounded-lg bg-slate-950 border border-sky-500/40 space-y-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5">
                        <Sliders className="w-3.5 h-3.5 text-sky-400" />
                        <label htmlFor="roof-angle-slider" className="text-xs font-semibold text-white">
                          Угол наклона ската α (°)
                        </label>
                      </div>
                      <div className="flex items-center gap-1">
                        <MillimeterInput
                          ariaLabel="Угол ската крыши в градусах"
                          dataTestId="roof-angle-input"
                          min={1}
                          max={65}
                          step={0.5}
                          precision={1}
                          value={roofMetrics.slopeAngleDeg}
                          onChange={(deg) =>
                            onUpdateObject(selectedObj.id, (prev) => ({
                              ...prev,
                              roofHeight: calculateRoofHeightFromAngle(prev, deg)
                            }))
                          }
                          className="w-16 bg-slate-900 border border-sky-500/60 rounded px-1.5 py-0.5 text-xs font-mono tabular-nums font-bold text-sky-400 text-right"
                        />
                        <span className="text-xs font-mono text-sky-400">°</span>
                      </div>
                    </div>

                    <input
                      id="roof-angle-slider"
                      data-testid="roof-angle-slider"
                      type="range"
                      min={2}
                      max={62}
                      step={0.5}
                      value={Math.min(62, Math.max(2, roofMetrics.slopeAngleDeg))}
                      onChange={(e) => {
                        const deg = Number(e.target.value);
                        onUpdateObject(selectedObj.id, (prev) => ({
                          ...prev,
                          roofHeight: calculateRoofHeightFromAngle(prev, deg)
                        }));
                      }}
                      className="w-full accent-sky-500"
                    />

                    {/* Quick Normative Angle Presets (СП 20.13330.2016) */}
                    <div className="grid grid-cols-2 gap-1.5">
                      {[
                        { deg: 15, label: '15° (Пологая)' },
                        { deg: 30, label: '30° (μ=1.0)' },
                        { deg: 45, label: '45° (μ=0.5)' },
                        { deg: 60, label: '60° (μ=0)' }
                      ].map((preset) => (
                        <button
                          key={preset.deg}
                          type="button"
                          data-testid={`roof-angle-preset-${preset.deg}`}
                          onClick={() =>
                            onUpdateObject(selectedObj.id, (prev) => ({
                              ...prev,
                              roofHeight: calculateRoofHeightFromAngle(prev, preset.deg)
                            }))
                          }
                          className={`py-1.5 px-2 text-xs font-mono rounded border transition-colors text-center ${
                            Math.abs(roofMetrics.slopeAngleDeg - preset.deg) < 0.8
                              ? 'bg-sky-600 text-white border-sky-400 font-semibold'
                              : 'bg-slate-900 text-slate-300 border-slate-800 hover:border-slate-700'
                          }`}
                        >
                          {preset.label}
                        </button>
                      ))}
                    </div>

                    {/* Coupled Height & Snow Load Live Readout */}
                    <div className="grid grid-cols-3 gap-1.5 pt-1 border-t border-slate-800/90 text-[11px]">
                      <div className="p-1.5 rounded bg-slate-900/90 border border-slate-800">
                        <span className="block text-[10px] text-slate-400">Высота H_roof:</span>
                        <span
                          className="font-mono tabular-nums font-semibold text-white"
                          data-testid="coupled-roof-height-val"
                        >
                          {formatMetersMm(selectedObj.roofHeight)} м
                        </span>
                      </div>
                      <div className="p-1.5 rounded bg-slate-900/90 border border-slate-800">
                        <span className="block text-[10px] text-slate-400">Коэфф. СП μ:</span>
                        <span
                          className="font-mono tabular-nums font-semibold text-emerald-400"
                          data-testid="coupled-snow-mu-val"
                        >
                          μ = {selectedSnow.mu}
                        </span>
                      </div>
                      <div className="p-1.5 rounded bg-slate-900/90 border border-slate-800">
                        <span className="block text-[10px] text-slate-400">Нагрузка снега:</span>
                        <span
                          className="font-mono tabular-nums font-semibold text-sky-400"
                          data-testid="coupled-snow-load-val"
                        >
                          {selectedSnow.designSnowLoadS} кг/м²
                        </span>
                      </div>
                    </div>
                  </div>
                )}

                {selectedObj.roofType === 'shed' || selectedObj.roofType === 'flat' ? (
                  <div className="pt-1">
                    <label className="block text-xs text-slate-400 mb-1">
                      Направление ската воды (стрелка на крыше):
                    </label>
                    <div className="grid grid-cols-4 gap-1">
                      {(
                        [
                          { dir: 'south', label: 'На Юг' },
                          { dir: 'north', label: 'На Север' },
                          { dir: 'east', label: 'На Восток' },
                          { dir: 'west', label: 'На Запад' }
                        ] as { dir: SlopeDirection; label: string }[]
                      ).map((d) => (
                        <button
                          key={d.dir}
                          type="button"
                          onClick={() =>
                            onUpdateObject(selectedObj.id, (prev) => ({
                              ...prev,
                              slopeDirection: d.dir
                            }))
                          }
                          className={`py-1 text-[11px] font-medium rounded border whitespace-nowrap ${
                            selectedObj.slopeDirection === d.dir
                              ? 'bg-sky-600 text-white border-sky-500'
                              : 'bg-slate-950 text-slate-400 border-slate-800'
                          }`}
                        >
                          {d.label}
                        </button>
                      ))}
                    </div>
                  </div>
                ) : (
                  <p className="text-[11px] text-sky-400/90 pt-0.5">
                    Направление скатов ({selectedObj.roofType === 'gable' ? '2 стрелки от конька' : '4 стрелки по сторонам пирамиды'}) отображается автоматически в 2D и 3D.
                  </p>
                )}

                {/* Mathematical 3D Primitive Reference Card */}
                <div className="p-3 rounded-lg bg-slate-950 border border-slate-800 space-y-1.5 text-xs">
                  <div className="font-semibold text-sky-400">
                    {ROOF_GEOMETRY_DESCRIPTIONS[selectedObj.roofType].title}
                  </div>
                  <div className="text-slate-300">
                    <span className="text-slate-400">Основная 3D-фигура (со стенами): </span>
                    {ROOF_GEOMETRY_DESCRIPTIONS[selectedObj.roofType].body3D}
                  </div>
                  <div className="text-slate-300">
                    <span className="text-slate-400">Форма крыши отдельно: </span>
                    {ROOF_GEOMETRY_DESCRIPTIONS[selectedObj.roofType].roof3D}
                  </div>
                  <div className="pt-1 flex items-center justify-between text-[11px] font-mono tabular-nums text-slate-400 border-t border-slate-800/80">
                    <span>Угол α = {roofMetrics.slopeAngleDeg}°</span>
                    <span>S_roof = {roofMetrics.roofAreaSqm} м²</span>
                    <span>Полная выс. = {formatMetersMm(selectedObj.wallHeight + selectedObj.roofHeight)} м</span>
                  </div>
                </div>

                {/* Roof Insulation Device Selector inside 3D Roof Card (только для утепляемых зданий) */}
                {selectedCaps.hasRoofInsulation && (
                  <div className="pt-2 border-t border-slate-800 space-y-1.5">
                    <div className="flex items-center justify-between">
                      <label
                        htmlFor="roof-insulation-select-tab1"
                        className="text-xs font-semibold text-sky-300"
                      >
                        Устройство утепления крыши:
                      </label>
                      <span className="text-[11px] font-mono tabular-nums text-emerald-400">
                        R_roof ={' '}
                        {
                          ROOF_INSULATION_INFO[getEffectiveRoofInsulationId(selectedObj)]
                            .thermalResistanceR
                        }{' '}
                        м²·°С/Вт
                      </span>
                    </div>
                    <select
                      id="roof-insulation-select-tab1"
                      data-testid="roof-insulation-select-tab1"
                      value={getEffectiveRoofInsulationId(selectedObj)}
                      onChange={(e) => {
                        const val = e.target.value as RoofInsulationTypeId;
                        onUpdateObject(selectedObj.id, (prev) => ({
                          ...prev,
                          roofInsulationId: val
                        }));
                      }}
                      className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-2 text-xs text-white"
                    >
                      {Object.values(ROOF_INSULATION_INFO).map((ins) => (
                        <option key={ins.id} value={ins.id}>
                          {ins.name} (R = {ins.thermalResistanceR}, U = {ins.heatTransferU} Вт/м²·°С)
                        </option>
                      ))}
                    </select>
                    <p className="text-[10px] text-slate-400 leading-snug">
                      {ROOF_INSULATION_INFO[getEffectiveRoofInsulationId(selectedObj)].description}
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* Wall Insulation & Window Glazing Quick Card in Tab 1 */}
            {selectedCaps.hasWallInsulation && selectedCaps.hasWindows && (
              <div
                data-testid="thermal-envelope-quick-card"
                className="p-3 rounded-lg bg-slate-900 border border-orange-500/35 space-y-2.5"
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-orange-300 flex items-center gap-1.5">
                    <Flame className="w-3.5 h-3.5 text-orange-400" />
                    Утепление стен и тип окон
                  </span>
                  {energyResult && (
                    <span className="text-[11px] font-mono tabular-nums text-amber-300">
                      Класс {energyResult.energyClass} · {energyResult.totalAnnualHeatEnergyKwh} кВт·ч/г
                    </span>
                  )}
                </div>

                <div className="space-y-1">
                  <div className="flex items-center justify-between text-[11px]">
                    <label htmlFor="wall-insulation-select-tab1" className="text-slate-300">
                      Вариант утепления стен:
                    </label>
                    <span className="font-mono tabular-nums text-emerald-400">
                      +ΔR ={' '}
                      {
                        WALL_INSULATION_INFO[getEffectiveWallInsulationId(selectedObj)]
                          .bonusThermalResistanceR
                      }{' '}
                      м²·°С/Вт
                    </span>
                  </div>
                  <select
                    id="wall-insulation-select-tab1"
                    data-testid="wall-insulation-select-tab1"
                    value={getEffectiveWallInsulationId(selectedObj)}
                    onChange={(e) => {
                      const val = e.target.value as WallInsulationTypeId;
                      onUpdateObject(selectedObj.id, (prev) => ({
                        ...prev,
                        wallInsulationId: val
                      }));
                    }}
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white"
                  >
                    {Object.values(WALL_INSULATION_INFO).map((ins) => (
                      <option key={ins.id} value={ins.id}>
                        {ins.name} (+R = {ins.bonusThermalResistanceR} м²·°С/Вт)
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1">
                  <div className="flex items-center justify-between text-[11px]">
                    <label htmlFor="window-type-select-tab1" className="text-slate-300">
                      Вид окон и остекления:
                    </label>
                    <span className="font-mono tabular-nums text-sky-400">
                      R_win ={' '}
                      {WINDOW_TYPES_INFO[getEffectiveWindowTypeId(selectedObj)].thermalResistanceR}{' '}
                      м²·°С/Вт
                    </span>
                  </div>
                  <select
                    id="window-type-select-tab1"
                    data-testid="window-type-select-tab1"
                    value={getEffectiveWindowTypeId(selectedObj)}
                    onChange={(e) => {
                      const val = e.target.value as WindowConstructionTypeId;
                      onUpdateObject(selectedObj.id, (prev) => ({
                        ...prev,
                        windows: {
                          ...getObjectWindowsConfig(prev),
                          windowTypeId: val
                        }
                      }));
                    }}
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white"
                  >
                    {Object.values(WINDOW_TYPES_INFO).map((wt) => (
                      <option key={wt.id} value={wt.id}>
                        {wt.name} (R = {wt.thermalResistanceR}, U = {wt.heatTransferU} Вт/м²·°С)
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            )}

            {/* Fire Resistance Material Class (СП 4.13130.2013) */}
            {selectedCaps.hasFireResistanceMaterial && (
              <div className="space-y-1.5">
                <label htmlFor="fire-mat-select" className="block text-xs font-semibold text-slate-300">
                  Класс огнестойкости стен (СП 4.13130.2013)
                </label>
                <select
                  id="fire-mat-select"
                  value={selectedObj.material}
                  onChange={(e) =>
                    onUpdateObject(selectedObj.id, (prev) => ({
                      ...prev,
                      material: e.target.value as FireResistanceMaterial
                    }))
                  }
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-2 text-xs text-white"
                >
                  <option value="stone">Камень / Бетон / Газобетон (I–II ст., разрыв 6–10 м)</option>
                  <option value="mixed">Камень с деревянными перекрытиями (III ст., 8–12 м)</option>
                  <option value="wood">Дерево / Каркас / Брус (IV–V ст., разрыв 10–15 м)</option>
                </select>
              </div>
            )}
          </div>
        )}

        {/* TAB 2: NORMATIVE VALIDATION CHECKLIST (ЗАКОНЫ РФ) & LEGAL CLAIM GENERATOR */}
        {activeTab === 'norms' && (
          <div className="space-y-4">
            <div className="p-3 rounded-lg bg-slate-950 border border-slate-800 flex items-center justify-between">
              <div>
                <div className="text-xs font-semibold text-white">Статус проверки по СП РФ</div>
                <div className="text-[11px] text-slate-400">
                  СП 53.13330.2019 · СП 42.13330 · СП 4.13130
                </div>
              </div>
              <div className="text-right font-mono tabular-nums text-xs">
                {errorCount === 0 && warnCount === 0 ? (
                  <span className="text-emerald-400 font-semibold">Нормы соблюдены</span>
                ) : (
                  <span className="text-red-400 font-semibold">
                    Ошибок: {errorCount} · Предупр.: {warnCount}
                  </span>
                )}
              </div>
            </div>

            {/* Legal Claim Document Generator Banner (Требование об устранении нарушений) */}
            <div className="p-3 rounded-lg bg-red-950/30 border border-red-700/60 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-red-200 flex items-center gap-1.5">
                  <Scale className="w-4 h-4 text-red-400" />
                  Требование об устранении нарушений
                </span>
                <span className="text-[10px] font-mono text-red-300">ст. 304 ГК РФ</span>
              </div>
              <p className="text-[11px] text-slate-300 leading-snug">
                Сформируйте официальную досудебную претензию соседу об устранении нарушений в размещении строений, скатов крыш и заборов со ссылками на СП 53.13330.2019, СП 4.13130.2013 и ГК РФ.
              </p>
              <button
                type="button"
                data-testid="open-claim-from-inspector-btn"
                onClick={onOpenClaimModal}
                className="w-full py-2 px-3 bg-red-600 hover:bg-red-500 text-white text-xs font-semibold rounded-lg flex items-center justify-center gap-1.5 transition-colors shadow-sm whitespace-nowrap"
              >
                <Scale className="w-3.5 h-3.5" />
                Сформировать Требование (Претензию) по РФ
              </button>
            </div>

            {violations.length === 0 ? (
              <div className="p-5 rounded-lg bg-emerald-950/25 border border-emerald-800/50 text-center space-y-2">
                <CheckCircle2 className="w-8 h-8 text-emerald-400 mx-auto" />
                <div className="text-xs font-semibold text-emerald-200">
                  Все градостроительные, санитарные и пожарные отступы соблюдены!
                </div>
                <p className="text-xs text-slate-400">
                  Ни одна постройка не пересекает красные запретные зоны и противопожарные радиусы.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {violations.map((v) => (
                  <div
                    key={v.id}
                    className={`p-3 rounded-lg border space-y-2 ${
                      v.severity === 'error'
                        ? 'bg-red-950/30 border-red-800/70'
                        : v.severity === 'warning'
                        ? 'bg-amber-950/30 border-amber-800/70'
                        : 'bg-slate-950 border-slate-800'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-1.5">
                        {v.severity === 'error' ? (
                          <XCircle className="w-4 h-4 text-red-400 shrink-0" />
                        ) : v.severity === 'warning' ? (
                          <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
                        ) : (
                          <Info className="w-4 h-4 text-sky-400 shrink-0" />
                        )}
                        <span className="text-xs font-semibold text-white">{v.title}</span>
                      </div>
                      <span className="text-[10px] font-mono text-slate-400 shrink-0">{v.code}</span>
                    </div>

                    <p className="text-xs text-slate-300 leading-relaxed">{v.description}</p>
                    <p className="text-[11px] text-sky-300 leading-relaxed">
                      Решение: {v.recommendation}
                    </p>

                    <div className="pt-1 flex flex-wrap gap-1.5">
                      {v.canGenerateConsent && (
                        <button
                          type="button"
                          onClick={() => onOpenConsentModal(v.edgeIndex, v.objectId)}
                          className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium bg-amber-500/20 hover:bg-amber-500/30 text-amber-200 border border-amber-500/40 rounded-md transition-colors whitespace-nowrap"
                        >
                          <FileText className="w-3.5 h-3.5" />
                          Согласие соседа
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={onOpenClaimModal}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium bg-red-500/20 hover:bg-red-500/30 text-red-200 border border-red-500/40 rounded-md transition-colors whitespace-nowrap"
                      >
                        <Scale className="w-3.5 h-3.5" />
                        Требование об устранении
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Legal Disclaimer on Neighbor Consent */}
            <div className="p-3 rounded-lg bg-slate-950 border border-slate-800 space-y-1.5">
              <div className="text-xs font-semibold text-amber-400 flex items-center gap-1.5">
                <ShieldCheck className="w-4 h-4" />
                Юридический нюанс «Согласия соседа»
              </div>
              <p className="text-[11px] text-slate-400 leading-relaxed">
                Письменное согласие смежного собственника полностью законно для установки глухого забора в СНТ. Однако при уменьшении отступа жилого дома (&lt; 3 м) расписка соседа НЕ отменяет муниципальные ПЗЗ и противопожарные разрывы СП 4.13130.2013 (6–15 м).
              </p>
            </div>
          </div>
        )}

        {/* TAB 3: ENGINEERING MODULE (РЕЛЬЕФ И ДРЕНАЖ, СНЕГ, ЭНЕРГОЭФФЕКТИВНОСТЬ, ТЕПЛОВАЯ КАРТА, ОТОПЛЕНИЕ, ГРУНТ) */}
        {activeTab === 'engineering' && selectedObj && primaryHouse && fndResult && energyResult && (
          <div className="space-y-4">
            {/* 0. Plot Surface Slope & Stormwater Drainage Zones (СП 42.13330 / СП 32.13330) */}
            <section
              data-testid="inspector-relief-drainage-section"
              className="p-3 rounded-lg bg-slate-950 border border-cyan-500/40 space-y-2.5"
            >
              <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                <div>
                  <h2 className="text-xs font-bold text-white">
                    Рельеф участка и зоны водоотведения
                  </h2>
                  <p className="text-[11px] text-slate-400">
                    СП 42.13330.2016 · СП 32.13330.2018
                  </p>
                </div>
                <span
                  data-testid="inspector-relief-slope-percent"
                  className="text-xs font-mono tabular-nums font-bold text-cyan-300"
                >
                  i = {reliefAnalysis.slopePercent}% ({reliefAnalysis.slopePermille}‰)
                </span>
              </div>

              <div className="grid grid-cols-3 gap-1.5 text-[11px]">
                <div className="p-1.5 rounded bg-slate-900 border border-slate-800 min-w-0 overflow-hidden">
                  <span className="block text-[10px] text-slate-400 truncate">Перепад ΔH:</span>
                  <span className="font-mono tabular-nums font-semibold text-white whitespace-nowrap block truncate">
                    {reliefAnalysis.elevationDeltaM.toFixed(2)} м ({reliefAnalysis.slopeAngleDeg}°)
                  </span>
                </div>
                <div className="p-1.5 rounded bg-slate-900 border border-slate-800 min-w-0 overflow-hidden">
                  <span className="block text-[10px] text-slate-400 truncate">Сток к границе:</span>
                  <span className="font-mono tabular-nums font-semibold text-sky-300 truncate block">
                    {reliefAnalysis.slopeDirectionLabel}
                  </span>
                </div>
                <div className="p-1.5 rounded bg-slate-900 border border-slate-800 min-w-0 overflow-hidden">
                  <span className="block text-[10px] text-slate-400 truncate">Расход ливневки:</span>
                  <span className="font-mono tabular-nums font-semibold text-emerald-300 whitespace-nowrap block truncate">
                    {reliefAnalysis.stormwaterRunoffLitersPerSec} л/с
                  </span>
                </div>
              </div>

              <div className="space-y-1 text-[11px]">
                <div className="text-cyan-300 font-semibold">{reliefAnalysis.normativeStatusLabel}</div>
                <p className="text-slate-300 leading-snug">{reliefAnalysis.recommendation}</p>
                <div className="pt-1 space-y-1">
                  {reliefAnalysis.drainageZones.map((zone) => (
                    <div
                      key={zone.id}
                      className="p-1.5 rounded bg-slate-900/90 border border-slate-800 flex items-center justify-between gap-2 text-[10px]"
                    >
                      <span className="text-slate-200 font-medium">{zone.title}</span>
                      <span className="font-mono text-cyan-400 shrink-0">СП 32.13330</span>
                    </div>
                  ))}
                </div>
              </div>

              <button
                type="button"
                data-testid="inspector-export-pdf-btn"
                onClick={() => downloadUrbanPlanningPdfReport(plot, objects, violations, null, dayOfYear)}
                className="w-full py-2 px-3 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold rounded-lg flex items-center justify-center gap-1.5 transition-colors shadow-sm"
              >
                <FileText className="w-3.5 h-3.5" />
                Экспорт полного градостроительного отчета (PDF)
              </button>
            </section>

            {/* 1. Snow Load Calculation (СП 20.13330.2016) */}
            {(() => {
              const activeSnowObj = isRoofedBuildingCategory(selectedObj.category)
                ? selectedObj
                : primaryHouse;
              const activeSnow = calculateSnowLoad(activeSnowObj, region.id);
              const activeRoof = calculateRoofGeometryMetrics(activeSnowObj);
              const roofTypeLabel =
                activeSnowObj.roofType === 'flat'
                  ? 'Плоская'
                  : activeSnowObj.roofType === 'shed'
                  ? 'Односкатная'
                  : activeSnowObj.roofType === 'gable'
                  ? 'Двускатная'
                  : 'Пирамидальная (шатровая)';

              return (
                <section className="p-3 rounded-lg bg-slate-950 border border-slate-800 space-y-3">
                  <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                    <div>
                      <h2 className="text-xs font-bold text-white">
                        1. Инженерный расчет снега (СП 20.13330.2016)
                      </h2>
                      <p className="text-[11px] text-slate-400">
                        Снеговая нагрузка: «{activeSnowObj.name}»
                      </p>
                    </div>
                    <span className="text-xs font-mono tabular-nums text-sky-400">
                      Район {activeSnow.snowZone}
                    </span>
                  </div>

                  {activeSnowObj.roofType !== 'flat' && (
                    <div className="p-2.5 rounded-lg bg-slate-900 border border-sky-500/30 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] font-semibold text-sky-300">
                          Регулировка угла крыши α (°) ↔ H_roof:
                        </span>
                        <span className="text-xs font-mono tabular-nums font-bold text-white">
                          α = {activeSnow.slopeAngleDeg}° · H = {formatMetersMm(activeSnowObj.roofHeight)} м
                        </span>
                      </div>
                      <input
                        type="range"
                        aria-label="Угол наклона крыши для снеговой нагрузки"
                        data-testid="eng-roof-angle-slider"
                        min={2}
                        max={62}
                        step={0.5}
                        value={Math.min(62, Math.max(2, activeSnow.slopeAngleDeg))}
                        onChange={(e) => {
                          const deg = Number(e.target.value);
                          onUpdateObject(activeSnowObj.id, (prev) => ({
                            ...prev,
                            roofHeight: calculateRoofHeightFromAngle(prev, deg)
                          }));
                        }}
                        className="w-full accent-sky-500"
                      />
                      <div className="flex justify-between text-[10px] font-mono text-slate-400">
                        <span>≤30°: μ=1.0 (100%)</span>
                        <span>45°: μ=0.5 (50%)</span>
                        <span>≥60°: μ=0 (снег сходит)</span>
                      </div>
                    </div>
                  )}

                  <div className="rounded-lg border border-slate-800 overflow-hidden">
                    <table className="w-full text-left border-collapse text-xs">
                      <thead>
                        <tr className="bg-slate-900 border-b border-slate-800 text-slate-400 text-[11px]">
                          <th className="py-1.5 px-2.5 font-medium">Параметр СП 20.13330.2016</th>
                          <th className="py-1.5 px-2.5 font-medium text-right">Значение</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/80 bg-slate-950">
                        <tr>
                          <td className="py-1.5 px-2.5 text-slate-300">Координаты / Регион РФ</td>
                          <td className="py-1.5 px-2.5 text-right font-mono tabular-nums text-slate-200 text-[11px]">
                            {region.name.split(' ')[0]} ({region.lat.toFixed(2)}°N, {region.lng.toFixed(2)}°E)
                          </td>
                        </tr>
                        <tr>
                          <td className="py-1.5 px-2.5 text-slate-300">Нормативный вес снега (Sg)</td>
                          <td className="py-1.5 px-2.5 text-right font-mono tabular-nums text-slate-200">
                            {activeSnow.normativeSg} кг/м² (Район {activeSnow.snowZone})
                          </td>
                        </tr>
                        <tr>
                          <td className="py-1.5 px-2.5 text-slate-300">Тип крыши и уклон ската (α)</td>
                          <td className="py-1.5 px-2.5 text-right font-mono tabular-nums text-slate-200">
                            {roofTypeLabel} · {activeSnow.slopeAngleDeg}°
                          </td>
                        </tr>
                        <tr>
                          <td className="py-1.5 px-2.5 text-slate-300">Коэффициент формы крыши (μ)</td>
                          <td className="py-1.5 px-2.5 text-right font-mono tabular-nums text-emerald-400 font-semibold">
                            {activeSnow.mu}
                          </td>
                        </tr>
                        <tr>
                          <td className="py-1.5 px-2.5 text-slate-300">Полная масса снега на крыше</td>
                          <td className="py-1.5 px-2.5 text-right font-mono tabular-nums font-semibold text-amber-400">
                            {activeSnow.totalSnowMassTons} т
                          </td>
                        </tr>
                      </tbody>
                      <tfoot>
                        <tr className="bg-sky-950/40 border-t border-sky-500/40">
                          <td className="py-2 px-2.5 font-semibold text-white">
                            Итого расчетная нагрузка (S):
                          </td>
                          <td
                            className="py-2 px-2.5 text-right font-mono tabular-nums font-bold text-sm text-sky-400 whitespace-nowrap"
                            data-testid="snow-load-final-value"
                          >
                            {activeSnow.designSnowLoadS} кг/м²
                          </td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                </section>
              );
            })()}

            {/* 2. ENERGY EFFICIENCY CLASS & HEATING COST CALCULATOR (СП 50.13330.2012) */}
            <section
              data-testid="energy-heating-section"
              className="p-3 rounded-lg bg-slate-950 border border-orange-500/40 space-y-3"
            >
              <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                <div>
                  <h3 className="text-xs font-bold text-white flex items-center gap-1.5">
                    <Zap className="w-3.5 h-3.5 text-amber-400" />
                    2. Класс энергоэффективности и отопление
                  </h3>
                  <p className="text-[11px] text-slate-400">
                    «{primaryHouse.name}» · Отапливаемая S = {energyResult.heatedFloorAreaSqm} м²
                  </p>
                </div>
                <span
                  data-testid="energy-class-badge"
                  className="px-2 py-1 rounded text-xs font-mono font-bold text-white border border-white/20 whitespace-nowrap"
                  style={{ backgroundColor: energyResult.energyClassColor }}
                >
                  Класс {energyResult.energyClass}
                </span>
              </div>

              {/* 3D Thermal Heatmap Mode Quick Toggle + Facade Heat Loss Summary */}
              {thermalHeatmapResult && (
                <div className="p-2.5 rounded-lg bg-slate-900 border border-orange-500/35 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[11px] font-semibold text-orange-300 flex items-center gap-1">
                      <Flame className="w-3.5 h-3.5 text-orange-400" />
                      Тепловая карта фасадов (3D)
                    </span>
                    {onToggleThermalHeatmap && (
                      <button
                        type="button"
                        data-testid="inspector-toggle-thermal-heatmap"
                        onClick={() => onToggleThermalHeatmap()}
                        className={`px-2 py-0.5 rounded text-[10px] font-semibold border transition-colors whitespace-nowrap ${
                          thermalHeatmapMode
                            ? 'bg-orange-500 text-slate-950 border-orange-300'
                            : 'bg-slate-950 text-orange-300 border-orange-500/50 hover:bg-slate-800'
                        }`}
                      >
                        {thermalHeatmapMode ? 'Теплокарта 3D ВКЛ' : 'Включить теплокарту 3D'}
                      </button>
                    )}
                  </div>
                  <div
                    data-testid="inspector-thermal-facades-table"
                    className="grid grid-cols-2 gap-1 text-[10px] font-mono tabular-nums"
                  >
                    {thermalHeatmapResult.facades.map((f) => (
                      <div
                        key={f.facade}
                        className="px-2 py-1 rounded bg-slate-950 border border-slate-800 flex items-center justify-between gap-1 min-w-0 overflow-hidden"
                      >
                        <span className="text-slate-300 truncate">
                          {f.facadeLabel.split(' ')[0]} ({f.glazingPercent}% ок.):
                        </span>
                        <span style={{ color: f.thermalColorHex }} className="font-bold whitespace-nowrap shrink-0">
                          {f.effectiveFacadeHeatFluxWm2} Вт/м²
                        </span>
                      </div>
                    ))}
                  </div>
                  <div className="px-2 py-1 rounded bg-slate-950 border border-slate-800 flex flex-wrap items-center justify-between gap-1 text-[10px] font-mono tabular-nums">
                    <span className="text-slate-300 min-w-0 truncate">
                      Крыша ({thermalHeatmapResult.roofInsulationName}):
                    </span>
                    <span
                      data-testid="thermal-roof-flux-val"
                      style={{ color: thermalHeatmapResult.roofThermalColorHex }}
                      className="font-bold whitespace-nowrap shrink-0"
                    >
                      {thermalHeatmapResult.roofHeatFluxWm2} Вт/м² (R={thermalHeatmapResult.roofRValue})
                    </span>
                  </div>
                </div>
              )}

              {/* Envelope Configuration Selectors: Windows, Roof Insulation, Wall Insulation */}
              <div className="p-2.5 rounded-lg bg-slate-900 border border-slate-800 space-y-2">
                <div className="text-[11px] font-semibold text-sky-300">
                  Теплозащитный контур здания (Окна · Крыша · Стены):
                </div>

                {/* Window Construction Type Selector */}
                <div className="space-y-1">
                  <div className="flex items-center justify-between text-[10px] text-slate-400">
                    <label htmlFor="eng-window-type-select">Вид окон и стеклопакетов:</label>
                    <span className="font-mono text-sky-400">
                      R_ок = {energyResult.windowRValue} (норма {energyResult.requiredWindowRValue})
                    </span>
                  </div>
                  <select
                    id="eng-window-type-select"
                    data-testid="eng-window-type-select"
                    value={energyResult.windowTypeId}
                    onChange={(e) => {
                      const val = e.target.value as WindowConstructionTypeId;
                      onUpdateObject(primaryHouse.id, (prev) => ({
                        ...prev,
                        windows: {
                          ...getObjectWindowsConfig(prev),
                          windowTypeId: val
                        }
                      }));
                    }}
                    className="w-full bg-slate-950 border border-slate-700 rounded px-2 py-1.5 text-xs text-white"
                  >
                    {Object.values(WINDOW_TYPES_INFO).map((wt) => (
                      <option key={wt.id} value={wt.id}>
                        {wt.name} (R = {wt.thermalResistanceR}, U = {wt.heatTransferU} Вт/м²·°С)
                      </option>
                    ))}
                  </select>
                </div>

                {/* Roof Insulation Selector */}
                <div className="space-y-1">
                  <div className="flex items-center justify-between text-[10px] text-slate-400">
                    <label htmlFor="eng-roof-insulation-select">Устройство утепления крыши:</label>
                    <span className="font-mono text-emerald-400">
                      R_кр = {energyResult.roofRValue} (норма {energyResult.requiredRoofRValue})
                    </span>
                  </div>
                  <select
                    id="eng-roof-insulation-select"
                    data-testid="eng-roof-insulation-select"
                    value={energyResult.roofInsulationId}
                    onChange={(e) => {
                      const val = e.target.value as RoofInsulationTypeId;
                      onUpdateObject(primaryHouse.id, (prev) => ({
                        ...prev,
                        roofInsulationId: val
                      }));
                    }}
                    className="w-full bg-slate-950 border border-slate-700 rounded px-2 py-1.5 text-xs text-white"
                  >
                    {Object.values(ROOF_INSULATION_INFO).map((ri) => (
                      <option key={ri.id} value={ri.id}>
                        {ri.name} (R = {ri.thermalResistanceR}, U = {ri.heatTransferU} Вт/м²·°С)
                      </option>
                    ))}
                  </select>
                </div>

                {/* Wall Insulation Selector */}
                <div className="space-y-1">
                  <div className="flex items-center justify-between text-[10px] text-slate-400">
                    <label htmlFor="eng-wall-insulation-select">Вариант утепления стен:</label>
                    <span className="font-mono text-amber-300">
                      R_ст = {energyResult.baseWallRValue} + {energyResult.wallInsulationBonusR} ={' '}
                      {energyResult.wallRValue} (норма {energyResult.requiredWallRValue})
                    </span>
                  </div>
                  <select
                    id="eng-wall-insulation-select"
                    data-testid="eng-wall-insulation-select"
                    value={energyResult.wallInsulationId}
                    onChange={(e) => {
                      const val = e.target.value as WallInsulationTypeId;
                      onUpdateObject(primaryHouse.id, (prev) => ({
                        ...prev,
                        wallInsulationId: val
                      }));
                    }}
                    className="w-full bg-slate-950 border border-slate-700 rounded px-2 py-1.5 text-xs text-white"
                  >
                    {Object.values(WALL_INSULATION_INFO).map((wi) => (
                      <option key={wi.id} value={wi.id}>
                        {wi.name} (+R = {wi.bonusThermalResistanceR} м²·°С/Вт)
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Wall & Window Area Subtraction Breakdown (Окна вычтены из площади стен и посчитаны отдельно) */}
              <div className="grid grid-cols-3 gap-1.5 text-[11px]">
                <div className="p-1.5 rounded bg-slate-900 border border-slate-800">
                  <span className="block text-[10px] text-slate-400">Валовая S стен:</span>
                  <span className="font-mono tabular-nums font-semibold text-slate-200">
                    {energyResult.grossWallAreaSqm} м²
                  </span>
                </div>
                <div className="p-1.5 rounded bg-slate-900 border border-slate-800">
                  <span className="block text-[10px] text-slate-400">Окна (отдельно):</span>
                  <span
                    data-testid="energy-window-area"
                    className="font-mono tabular-nums font-semibold text-amber-300"
                  >
                    {energyResult.windowAreaSqm} м²
                  </span>
                </div>
                <div className="p-1.5 rounded bg-slate-900 border border-slate-800">
                  <span className="block text-[10px] text-slate-400">Чистая S стен:</span>
                  <span
                    data-testid="energy-net-wall-area"
                    className="font-mono tabular-nums font-semibold text-emerald-300"
                  >
                    {energyResult.netWallAreaSqm} м²
                  </span>
                </div>
              </div>

              {/* Detailed Heat Losses by Building Element Table */}
              <div
                data-testid="envelope-heat-loss-breakdown"
                className="rounded-lg border border-slate-800 overflow-hidden"
              >
                <table className="w-full text-left border-collapse text-[11px]">
                  <thead>
                    <tr className="bg-slate-900 border-b border-slate-800 text-slate-400 text-[10px]">
                      <th className="py-1 px-2 font-medium">Конструкция (Утепление / Вид)</th>
                      <th className="py-1 px-2 font-medium text-right">R (м²·°С/Вт)</th>
                      <th className="py-1 px-2 font-medium text-right">Теплопотери/год</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/80 bg-slate-950 font-mono tabular-nums">
                    <tr>
                      <td className="py-1 px-2 font-sans text-slate-200">
                        Стены ({WALL_INSULATION_INFO[energyResult.wallInsulationId].shortName})
                      </td>
                      <td className="py-1 px-2 text-right text-emerald-400">
                        {energyResult.wallRValue}
                      </td>
                      <td
                        data-testid="heat-loss-walls-kwh"
                        className="py-1 px-2 text-right font-semibold text-amber-300"
                      >
                        {energyResult.annualHeatLossWallsKwh.toLocaleString('ru-RU')} кВт·ч
                      </td>
                    </tr>
                    <tr>
                      <td className="py-1 px-2 font-sans text-slate-200">
                        Окна ({WINDOW_TYPES_INFO[energyResult.windowTypeId].shortName})
                      </td>
                      <td className="py-1 px-2 text-right text-sky-400">
                        {energyResult.windowRValue}
                      </td>
                      <td
                        data-testid="heat-loss-windows-kwh"
                        className="py-1 px-2 text-right font-semibold text-sky-300"
                      >
                        {energyResult.annualHeatLossWindowsKwh.toLocaleString('ru-RU')} кВт·ч
                      </td>
                    </tr>
                    <tr>
                      <td className="py-1 px-2 font-sans text-slate-200">
                        Крыша ({ROOF_INSULATION_INFO[energyResult.roofInsulationId].shortName})
                      </td>
                      <td className="py-1 px-2 text-right text-emerald-400">
                        {energyResult.roofRValue}
                      </td>
                      <td
                        data-testid="heat-loss-roof-kwh"
                        className="py-1 px-2 text-right font-semibold text-orange-300"
                      >
                        {energyResult.annualHeatLossRoofKwh.toLocaleString('ru-RU')} кВт·ч
                      </td>
                    </tr>
                    <tr>
                      <td className="py-1 px-2 font-sans text-slate-400">Пол / цоколь + вент.</td>
                      <td className="py-1 px-2 text-right text-slate-400">—</td>
                      <td
                        data-testid="heat-loss-floor-kwh"
                        className="py-1 px-2 text-right text-slate-300"
                      >
                        {energyResult.annualHeatLossFloorKwh.toLocaleString('ru-RU')} кВт·ч
                      </td>
                    </tr>
                  </tbody>
                  <tfoot>
                    <tr className="bg-slate-900/90 border-t border-slate-800 font-mono tabular-nums">
                      <td colSpan={2} className="py-1.5 px-2 font-sans font-semibold text-white">
                        Итого потребность в тепле за сезон:
                      </td>
                      <td
                        data-testid="total-annual-heat-kwh"
                        className="py-1.5 px-2 text-right font-bold text-amber-400"
                      >
                        {energyResult.totalAnnualHeatEnergyKwh.toLocaleString('ru-RU')} кВт·ч/год
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>

              {/* Manual Tariff Inputs (Электричество ₽/кВт·ч, Газ ₽/м³, Дрова ₽/м³) */}
              <div className="space-y-1.5 pt-1 border-t border-slate-800">
                <span className="block text-[11px] font-semibold text-slate-300">
                  Тарифы энергоносителей (ручной ввод):
                </span>
                <div className="grid grid-cols-3 gap-1.5">
                  <div>
                    <label
                      htmlFor="tariff-electricity-input"
                      className="block text-[10px] text-slate-400 mb-0.5"
                    >
                      Электр. (₽/кВт·ч)
                    </label>
                    <MillimeterInput
                      id="tariff-electricity-input"
                      ariaLabel="Тариф на электричество ₽ за кВт·ч"
                      dataTestId="tariff-electricity-input"
                      min={0.5}
                      max={50}
                      step={0.1}
                      precision={2}
                      value={currentTariffs.electricityRubPerKwh}
                      onChange={(val) =>
                        onUpdatePlot((prev) => ({
                          ...prev,
                          heatingTariffs: {
                            ...(prev.heatingTariffs || currentTariffs),
                            electricityRubPerKwh: Math.max(0.5, val)
                          }
                        }))
                      }
                      className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-xs font-mono tabular-nums text-white"
                    />
                  </div>
                  <div>
                    <label
                      htmlFor="tariff-gas-input"
                      className="block text-[10px] text-slate-400 mb-0.5"
                    >
                      Газ сет. (₽/м³)
                    </label>
                    <MillimeterInput
                      id="tariff-gas-input"
                      ariaLabel="Тариф на магистральный газ ₽ за кубометр"
                      dataTestId="tariff-gas-input"
                      min={1}
                      max={100}
                      step={0.1}
                      precision={2}
                      value={currentTariffs.gasRubPerM3}
                      onChange={(val) =>
                        onUpdatePlot((prev) => ({
                          ...prev,
                          heatingTariffs: {
                            ...(prev.heatingTariffs || currentTariffs),
                            gasRubPerM3: Math.max(1, val)
                          }
                        }))
                      }
                      className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-xs font-mono tabular-nums text-white"
                    />
                  </div>
                  <div>
                    <label
                      htmlFor="tariff-firewood-input"
                      className="block text-[10px] text-slate-400 mb-0.5"
                    >
                      Дрова (₽/м³)
                    </label>
                    <MillimeterInput
                      id="tariff-firewood-input"
                      ariaLabel="Стоимость дров ₽ за кубометр"
                      dataTestId="tariff-firewood-input"
                      min={500}
                      max={25000}
                      step={100}
                      precision={0}
                      value={currentTariffs.firewoodRubPerM3}
                      onChange={(val) =>
                        onUpdatePlot((prev) => ({
                          ...prev,
                          heatingTariffs: {
                            ...(prev.heatingTariffs || currentTariffs),
                            firewoodRubPerM3: Math.max(500, val)
                          }
                        }))
                      }
                      className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-xs font-mono tabular-nums text-white"
                    />
                  </div>
                </div>
              </div>

              {/* Heating Cost Breakdown Table */}
              <div className="rounded-lg border border-slate-800 overflow-hidden">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-slate-900 border-b border-slate-800 text-slate-400 text-[10px]">
                      <th className="py-1.5 px-2 font-medium">Вид топлива</th>
                      <th className="py-1.5 px-2 font-medium text-right">Расход/год</th>
                      <th className="py-1.5 px-2 font-medium text-right">Сезон (₽)</th>
                      <th className="py-1.5 px-2 font-medium text-right">Месяц зимы</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/80 bg-slate-950 font-mono tabular-nums text-[11px]">
                    <tr>
                      <td className="py-1.5 px-2 font-sans text-slate-200">Электричество</td>
                      <td className="py-1.5 px-2 text-right text-slate-400">
                        {energyResult.electricity.annualConsumptionKwh.toLocaleString('ru-RU')} кВт·ч
                      </td>
                      <td
                        data-testid="heating-cost-electricity"
                        className="py-1.5 px-2 text-right font-bold text-amber-400"
                      >
                        {energyResult.electricity.annualCostRub.toLocaleString('ru-RU')} ₽
                      </td>
                      <td className="py-1.5 px-2 text-right text-slate-300">
                        {energyResult.electricity.monthlySeasonCostRub.toLocaleString('ru-RU')} ₽
                      </td>
                    </tr>
                    <tr>
                      <td className="py-1.5 px-2 font-sans text-slate-200">Магистр. газ</td>
                      <td className="py-1.5 px-2 text-right text-slate-400">
                        {energyResult.gas.annualConsumptionM3.toLocaleString('ru-RU')} м³
                      </td>
                      <td
                        data-testid="heating-cost-gas"
                        className="py-1.5 px-2 text-right font-bold text-emerald-400"
                      >
                        {energyResult.gas.annualCostRub.toLocaleString('ru-RU')} ₽
                      </td>
                      <td className="py-1.5 px-2 text-right text-slate-300">
                        {energyResult.gas.monthlySeasonCostRub.toLocaleString('ru-RU')} ₽
                      </td>
                    </tr>
                    <tr>
                      <td className="py-1.5 px-2 font-sans text-slate-200">Дрова (береза)</td>
                      <td className="py-1.5 px-2 text-right text-slate-400">
                        {energyResult.firewood.annualConsumptionM3} м³
                      </td>
                      <td
                        data-testid="heating-cost-firewood"
                        className="py-1.5 px-2 text-right font-bold text-sky-400"
                      >
                        {energyResult.firewood.annualCostRub.toLocaleString('ru-RU')} ₽
                      </td>
                      <td className="py-1.5 px-2 text-right text-slate-300">
                        {energyResult.firewood.monthlySeasonCostRub.toLocaleString('ru-RU')} ₽
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </section>

            {/* 3. PARAMETER OPTIMIZATION RECOMMENDATIONS */}
            <section
              data-testid="parameter-recommendations-section"
              className="p-3 rounded-lg bg-slate-950 border border-slate-800 space-y-2.5"
            >
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-bold text-white">
                  3. Рекомендации по выбранным параметрам
                </h3>
                <span className="text-[10px] font-mono text-sky-400">
                  {paramRecommendations.length} рек.
                </span>
              </div>
              {paramRecommendations.length === 0 ? (
                <div className="p-2.5 rounded-lg bg-emerald-950/25 border border-emerald-800/50 text-xs text-emerald-300">
                  Все выбранные параметры этажности, перекрытий, цоколя и заглубления коммуникаций оптимальны по СП РФ!
                </div>
              ) : (
                <div className="space-y-2">
                  {paramRecommendations.map((rec) => (
                    <div
                      key={rec.id}
                      className={`p-2.5 rounded-lg border text-xs space-y-1 ${
                        rec.severity === 'critical'
                          ? 'bg-red-950/30 border-red-700/60'
                          : rec.severity === 'warning'
                          ? 'bg-amber-950/30 border-amber-700/60'
                          : 'bg-slate-900 border-slate-800'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span
                          className={`font-semibold ${
                            rec.severity === 'critical'
                              ? 'text-red-300'
                              : rec.severity === 'warning'
                              ? 'text-amber-300'
                              : 'text-emerald-300'
                          }`}
                        >
                          {rec.title}
                        </span>
                        <span className="text-[10px] font-mono text-slate-400 shrink-0">
                          {rec.normCode}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-300 leading-snug">{rec.advice}</p>
                      <p className="text-[11px] text-sky-300 leading-snug">
                        Рекомендуемое значение: {rec.recommendedValueText} (сейчас: {rec.currentValueText})
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </section>

            {/* Mandatory IGI Soil Survey Disclaimer Banner */}
            <div className="p-3 rounded-lg bg-amber-950/35 border border-amber-700/60 space-y-1.5">
              <div className="text-xs font-semibold text-amber-300 flex items-center gap-1.5">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                Рекомендация заказать экспертизу грунта (ИГИ)
              </div>
              <p className="text-[11px] text-amber-100/90 leading-relaxed">
                Внимание! Справочные данные по грунтам носят предварительный характер. Настоятельно рекомендуем заказать профессиональные Инженерно-геологические изыскания (ИГИ) перед заливкой фундамента!
              </p>
            </div>

            {/* 4. Soil Selection & Foundation Bearing Check (СП 22.13330.2016) */}
            <section className="p-3 rounded-lg bg-slate-950 border border-slate-800 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-semibold text-white">
                  4. Грунт и несущая способность (СП 22.13330)
                </h3>
                <span className="text-[11px] font-mono tabular-nums text-slate-400">
                  Промерзание: {region.frostDepth} м
                </span>
              </div>

              <div>
                <label htmlFor="soil-select" className="block text-[11px] text-slate-400 mb-1">
                  Тип грунта на участке:
                </label>
                <select
                  id="soil-select"
                  value={plot.soilTypeId}
                  onChange={(e) =>
                    onUpdatePlot((prev) => ({
                      ...prev,
                      soilTypeId: e.target.value as PlotConfig['soilTypeId']
                    }))
                  }
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-2 text-xs text-white"
                >
                  {Object.values(SOILS_DB).map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} (R0 ≈ {s.bearingCapacityR0} кПа)
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label htmlFor="fnd-select" className="block text-[11px] text-slate-400 mb-1">
                  Выбранный тип фундамента дома:
                </label>
                <select
                  id="fnd-select"
                  value={primaryHouse.foundationTypeId}
                  onChange={(e) =>
                    onUpdateObject(primaryHouse.id, (prev) => ({
                      ...prev,
                      foundationTypeId: e.target.value as FoundationTypeId
                    }))
                  }
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-2 text-xs text-white"
                >
                  {Object.entries(FOUNDATION_NAMES).map(([id, info]) => (
                    <option key={id} value={id}>
                      {info.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="p-2.5 rounded bg-slate-900 border border-slate-800 space-y-1.5 text-xs">
                <div className="flex justify-between">
                  <span className="text-slate-400">Полная масса дома со снегом:</span>
                  <span className="font-mono tabular-nums font-semibold text-white">
                    {fndResult.totalLoadWithSnowTons} т (дом {fndResult.totalBuildingMassTons}т + снег{' '}
                    {fndResult.snowMassTons}т)
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Давление подошвы на грунт:</span>
                  <span
                    className={`font-mono tabular-nums font-semibold ${
                      fndResult.isSafe ? 'text-emerald-400' : 'text-red-400'
                    }`}
                  >
                    {fndResult.actualPressureKpa} кПа при R0 = {fndResult.soilBearingR0Kpa} кПа
                  </span>
                </div>
                {fndResult.warningMessage && (
                  <p className="text-[11px] text-amber-300 pt-1 border-t border-slate-800">
                    {fndResult.warningMessage}
                  </p>
                )}
              </div>
            </section>

            {/* 5. Wall Materials by Climate Thermal Protection (СП 50.13330.2012) */}
            <section className="p-3 rounded-lg bg-slate-950 border border-slate-800 space-y-2.5">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-semibold text-white">
                  5. Материал стен и теплозащита (СП 50.13330)
                </h3>
                <span className="text-[11px] font-mono tabular-nums text-sky-400">
                  Норма R_req = {region.rReqWall}
                </span>
              </div>

              <div className="space-y-2">
                {wallRecs.map((rec) => {
                  const isSelectedWall = primaryHouse.wallMaterialId === rec.id;
                  return (
                    <button
                      key={rec.id}
                      type="button"
                      data-testid={`wall-material-btn-${rec.id}`}
                      onClick={() =>
                        onUpdateObject(primaryHouse.id, (prev) => ({
                          ...prev,
                          wallMaterialId: rec.id as WallMaterialId,
                          wallThickness: getDefaultWallThicknessM({
                            category: prev.category,
                            wallMaterialId: rec.id as WallMaterialId
                          }),
                          material:
                            rec.id === 'frame' || rec.id === 'timber' ? 'wood' : 'stone'
                        }))
                      }
                      className={`w-full text-left p-2.5 rounded-lg border cursor-pointer transition-colors ${
                        isSelectedWall
                          ? 'bg-sky-950/40 border-sky-500'
                          : 'bg-slate-900 border-slate-800 hover:border-slate-700'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold text-white">{rec.name}</span>
                        <span className="text-[11px] font-mono tabular-nums text-emerald-400">
                          R = {rec.thermalResistanceR} м²·°С/Вт
                        </span>
                      </div>
                      <div className="text-xs text-sky-300 mt-0.5">{rec.optimalThicknessSpec}</div>
                      <div className="text-[11px] text-slate-400 mt-1">{rec.notes}</div>
                    </button>
                  );
                })}
              </div>

              {/* Additional Exterior Wall Insulation Variants */}
              <div className="pt-2.5 border-t border-slate-800 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-amber-300">
                    Варианты дополнительного утепления стен:
                  </span>
                  <span className="text-[11px] font-mono tabular-nums text-emerald-400">
                    Итого R_стен = {energyResult.wallRValue} м²·°С/Вт
                  </span>
                </div>
                <div className="grid grid-cols-1 gap-1.5">
                  {Object.values(WALL_INSULATION_INFO).map((wi) => {
                    const isSelectedIns = energyResult.wallInsulationId === wi.id;
                    return (
                      <button
                        key={wi.id}
                        type="button"
                        data-testid={`wall-insulation-btn-${wi.id}`}
                        onClick={() =>
                          onUpdateObject(primaryHouse.id, (prev) => ({
                            ...prev,
                            wallInsulationId: wi.id
                          }))
                        }
                        className={`w-full text-left p-2 rounded-lg border transition-colors ${
                          isSelectedIns
                            ? 'bg-amber-950/40 border-amber-500'
                            : 'bg-slate-900 border-slate-800 hover:border-slate-700'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-semibold text-white">{wi.name}</span>
                          <span className="text-[11px] font-mono tabular-nums text-emerald-400">
                            +ΔR = {wi.bonusThermalResistanceR} м²·°С/Вт
                          </span>
                        </div>
                        <div className="text-[10px] text-slate-400 mt-0.5">{wi.description}</div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Roof Insulation Devices Section */}
              <div className="pt-2.5 border-t border-slate-800 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-sky-300">
                    Устройство утепления крыши (СП 50.13330):
                  </span>
                  <span className="text-[11px] font-mono tabular-nums text-emerald-400">
                    R_крыши = {energyResult.roofRValue} (норма {energyResult.requiredRoofRValue})
                  </span>
                </div>
                <div className="grid grid-cols-1 gap-1.5">
                  {Object.values(ROOF_INSULATION_INFO).map((ri) => {
                    const isSelectedRoofIns = energyResult.roofInsulationId === ri.id;
                    return (
                      <button
                        key={ri.id}
                        type="button"
                        data-testid={`roof-insulation-btn-${ri.id}`}
                        onClick={() =>
                          onUpdateObject(primaryHouse.id, (prev) => ({
                            ...prev,
                            roofInsulationId: ri.id
                          }))
                        }
                        className={`w-full text-left p-2 rounded-lg border transition-colors ${
                          isSelectedRoofIns
                            ? 'bg-sky-950/40 border-sky-500'
                            : 'bg-slate-900 border-slate-800 hover:border-slate-700'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-semibold text-white">{ri.name}</span>
                          <span className="text-[11px] font-mono tabular-nums text-sky-400">
                            R = {ri.thermalResistanceR} · U = {ri.heatTransferU} Вт/м²·°С
                          </span>
                        </div>
                        <div className="text-[10px] text-slate-400 mt-0.5">{ri.description}</div>
                      </button>
                    );
                  })}
                </div>
              </div>
            </section>

            {/* 6. Regional Wind Rose, Wind Speed & Wind Load on Buildings and Fences (СП 20.13330.2016 Раздел 11) */}
            <section
              data-testid="engineering-wind-rose-loads-section"
              className="p-3 rounded-lg bg-slate-950 border border-sky-500/40 space-y-3"
            >
              <div className="flex items-center justify-between gap-2 border-b border-slate-800 pb-2">
                <div>
                  <h3 className="text-xs font-bold text-white flex items-center gap-1.5">
                    <Wind className="w-4 h-4 text-sky-400" />
                    6. Роза ветров и ветровые нагрузки (СП 20.13330)
                  </h3>
                  <p className="text-[11px] text-slate-400">
                    Регион: {windAnalysis.regionName} ({windAnalysis.windZone} ветровой район)
                  </p>
                </div>
                <span
                  data-testid="engineering-wind-zone-badge"
                  className="px-2 py-0.5 rounded bg-sky-950/90 border border-sky-500/50 text-[11px] font-mono font-bold text-sky-300 whitespace-nowrap"
                >
                  w₀ = {windAnalysis.windPressureW0KgM2} кг/м²
                </span>
              </div>

              {/* Wind Rose 8-Direction SVG Diagram + Key Wind Speed Metrics */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 items-center bg-slate-900/90 p-2.5 rounded-lg border border-slate-800">
                <div className="flex flex-col items-center">
                  {(() => {
                    const polyPts = windAnalysis.sectors
                      .map((s) => {
                        const rad = ((s.plotAngleDeg - 90) * Math.PI) / 180;
                        const r = 10 + (s.frequencyPercent / 28) * 34;
                        const x = (55 + Math.cos(rad) * r).toFixed(1);
                        const y = (55 + Math.sin(rad) * r).toFixed(1);
                        return `${x},${y}`;
                      })
                      .join(' ');
                    return (
                      <svg
                        className="w-28 h-28"
                        viewBox="0 0 110 110"
                        data-testid="inspector-wind-rose-svg"
                      >
                        <circle cx="55" cy="55" r="42" fill="none" stroke="#334155" strokeWidth="1" strokeDasharray="3 3" />
                        <circle cx="55" cy="55" r="24" fill="none" stroke="#1e293b" strokeWidth="1" />
                        <line x1="55" y1="8" x2="55" y2="102" stroke="#1e293b" strokeWidth="1" />
                        <line x1="8" y1="55" x2="102" y2="55" stroke="#1e293b" strokeWidth="1" />
                        <polygon
                          points={polyPts}
                          fill="rgba(56, 189, 248, 0.28)"
                          stroke="#38bdf8"
                          strokeWidth="2"
                        />
                        {windAnalysis.sectors.map((s) => {
                          const rad = ((s.plotAngleDeg - 90) * Math.PI) / 180;
                          const labelR = 48;
                          const lx = 55 + Math.cos(rad) * labelR;
                          const ly = 55 + Math.sin(rad) * labelR + 3;
                          const dotR = 10 + (s.frequencyPercent / 28) * 34;
                          const dx = 55 + Math.cos(rad) * dotR;
                          const dy = 55 + Math.sin(rad) * dotR;
                          return (
                            <g key={s.dir}>
                              <circle
                                cx={dx}
                                cy={dy}
                                r={s.isPrevailing ? 3.5 : 2}
                                fill={s.isPrevailing ? '#f59e0b' : '#38bdf8'}
                              />
                              <text
                                x={lx}
                                y={ly}
                                textAnchor="middle"
                                className={`text-[8px] font-mono ${
                                  s.isPrevailing ? 'fill-amber-300 font-bold' : 'fill-slate-400'
                                }`}
                              >
                                {s.shortRu}
                              </text>
                            </g>
                          );
                        })}
                      </svg>
                    );
                  })()}
                  <span className="text-[10px] font-mono text-amber-300 text-center">
                    Господствующий: {windAnalysis.prevailingWindLabel}
                  </span>
                </div>

                <div className="space-y-1.5 text-[11px]">
                  <div className="p-1.5 rounded bg-slate-950 border border-slate-800 flex justify-between">
                    <span className="text-slate-400">Средняя скорость:</span>
                    <span className="font-mono font-semibold text-white">
                      {windAnalysis.avgWindSpeedMs} м/с
                    </span>
                  </div>
                  <div className="p-1.5 rounded bg-slate-950 border border-slate-800 flex justify-between">
                    <span className="text-slate-400">Порывы (шторм):</span>
                    <span className="font-mono font-bold text-amber-300">
                      до {windAnalysis.maxGustWindSpeedMs} м/с
                    </span>
                  </div>
                  <div className="p-1.5 rounded bg-slate-950 border border-slate-800 flex justify-between">
                    <span className="text-slate-400">Давление w₀ (Па):</span>
                    <span className="font-mono text-sky-300">
                      {windAnalysis.windPressureW0Pa} Па ({windAnalysis.windPressureW0KgM2} кг/м²)
                    </span>
                  </div>
                  <div className="p-1.5 rounded bg-slate-950 border border-slate-800 flex justify-between">
                    <span className="text-slate-400">Расчетное (γ=1.4):</span>
                    <span className="font-mono font-semibold text-emerald-300">
                      {windAnalysis.designWindPressureW0KgM2} кг/м²
                    </span>
                  </div>
                </div>
              </div>

              {/* 8-Rumb Frequency Breakdown */}
              <div className="grid grid-cols-4 gap-1 text-[10px] font-mono">
                {windAnalysis.sectors.map((s) => (
                  <div
                    key={s.dir}
                    className={`p-1 rounded border text-center ${
                      s.isPrevailing
                        ? 'bg-amber-950/60 border-amber-500/60 text-amber-200 font-bold'
                        : 'bg-slate-900 border-slate-800 text-slate-300'
                    }`}
                  >
                    {s.shortRu}: {s.frequencyPercent}%
                  </div>
                ))}
              </div>

              {/* Wind Load on Selected Building */}
              <div
                data-testid="building-wind-load-card"
                className="p-2.5 rounded-lg bg-slate-900 border border-slate-800 space-y-1.5 text-xs"
              >
                <div className="flex items-center justify-between border-b border-slate-800 pb-1">
                  <span className="font-semibold text-sky-300">
                    Нагрузка на строение: «{windAnalysis.selectedBuildingWind.objectName}»
                  </span>
                  <span className="font-mono text-[11px] text-slate-400">
                    H = {windAnalysis.selectedBuildingWind.buildingTotalHeightM} м (k={windAnalysis.selectedBuildingWind.heightFactorKze})
                  </span>
                </div>
                <div className="flex justify-between text-[11px]">
                  <span className="text-slate-400">Наветренное давление на фасад:</span>
                  <span className="font-mono font-semibold text-white">
                    {windAnalysis.selectedBuildingWind.windwardPressureKgM2} кг/м²
                  </span>
                </div>
                <div className="flex justify-between text-[11px]">
                  <span className="text-slate-400">Подветренный отсос / отрыв кровли:</span>
                  <span className="font-mono text-amber-300">
                    −{windAnalysis.selectedBuildingWind.leewardSuctionKgM2} / −{windAnalysis.selectedBuildingWind.roofUpliftPressureKgM2} кг/м²
                  </span>
                </div>
                <div className="flex justify-between text-[11px]">
                  <span className="text-slate-400">Суммарная боковая сила ветра F:</span>
                  <span
                    data-testid="building-wind-total-force"
                    className="font-mono font-bold text-emerald-400"
                  >
                    {windAnalysis.selectedBuildingWind.totalHorizontalForceKn} кН ({windAnalysis.selectedBuildingWind.totalHorizontalForceKgf} кгс)
                  </span>
                </div>
                <div className="flex justify-between text-[11px]">
                  <span className="text-slate-400">Опрокидывающий момент M:</span>
                  <span className="font-mono text-sky-300">
                    {windAnalysis.selectedBuildingWind.overturningMomentKnm} кН·м
                  </span>
                </div>
                <p className="text-[10px] text-slate-300 pt-1 border-t border-slate-800 leading-snug">
                  {windAnalysis.selectedBuildingWind.roofAnchorRecommendation}
                </p>
              </div>

              {/* Wind Load on Plot Fences */}
              <div
                data-testid="fences-wind-load-table"
                className="p-2.5 rounded-lg bg-slate-900 border border-slate-800 space-y-2"
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-amber-300">
                    Ветровая нагрузка и парусность заборов (по сторонам):
                  </span>
                  <span className="text-[10px] font-mono text-slate-400">шаг столбов 2.5 м</span>
                </div>
                <div className="space-y-1.5">
                  {windAnalysis.fences.map((fw) => (
                    <div
                      key={fw.edgeIndex}
                      className="p-2 rounded bg-slate-950 border border-slate-800 text-[11px] space-y-1"
                    >
                      <div className="flex items-center justify-between gap-1">
                        <span className="font-semibold text-slate-200">
                          {fw.edgeLabel} ({fw.fenceType === 'solid' ? 'Профлист глухой' : 'Сетка/Штакетник'}, H={fw.fenceHeightM}м)
                        </span>
                        <span className="font-mono font-bold text-sky-300 shrink-0">
                          {fw.designWindPressureKgM2} кг/м²
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-[10px] font-mono text-slate-300">
                        <span>На 1 столб: {fw.forcePerPostKgf} кгс</span>
                        <span className="text-amber-300 font-semibold">
                          Момент M = {fw.bendingMomentPerPostKnm} кН·м
                        </span>
                        <span>Вся грань: {fw.totalEdgeWindForceKn} кН</span>
                      </div>
                      <div className="text-[10px] text-emerald-300 leading-snug">
                        Столбы: {fw.recommendedPostSpec} · бетонирование ≥ {fw.recommendedEmbedmentM} м
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </section>

            <button
              type="button"
              onClick={onOpenBOMModal}
              className="w-full py-2.5 px-4 bg-sky-600 hover:bg-sky-500 text-white text-xs font-semibold rounded-lg flex items-center justify-center gap-2 transition-colors whitespace-nowrap"
            >
              <Calculator className="w-4 h-4" />
              Рассчитать ведомость материалов и смету
            </button>
          </div>
        )}

        {/* TAB 4: SANPIN 1.2.3685-21 INSOLATION ANALYSIS & WINDOW ADVISOR */}
        {activeTab === 'windows' && (
          <div className="space-y-4">
            {/* AUTOMATED ROOM INSOLATION ANALYSIS MODULE (СанПиН 1.2.3685-21) */}
            {insolationResult && (
              <section
                data-testid="sanpin-insolation-section"
                className="p-3 rounded-lg bg-slate-950 border border-amber-500/40 space-y-3"
              >
                <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                  <div>
                    <h2 className="text-xs font-bold text-white flex items-center gap-1.5">
                      <Sun className="w-4 h-4 text-amber-400" />
                      Инсоляция помещений (СанПиН 1.2.3685-21)
                    </h2>
                    <p className="text-[11px] text-slate-400">
                      Зона: {insolationResult.climateZoneLabel} ({insolationResult.latitudeDeg.toFixed(2)}° с.ш.)
                    </p>
                  </div>
                  <span
                    data-testid="sanpin-insolation-verdict"
                    className={`px-2 py-0.5 rounded text-[11px] font-mono font-bold whitespace-nowrap ${
                      insolationResult.overallCompliant
                        ? 'bg-emerald-950/80 text-emerald-300 border border-emerald-500/50'
                        : 'bg-red-950/80 text-red-300 border border-red-500/50'
                    }`}
                  >
                    {insolationResult.overallCompliant ? 'Норма СанПиН' : 'Нарушение СанПиН'}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-1.5 text-[11px]">
                  <div className="p-1.5 rounded bg-slate-900 border border-slate-800">
                    <span className="block text-[10px] text-slate-400">Требуется непрерывно:</span>
                    <span className="font-mono tabular-nums font-semibold text-amber-300">
                      ≥ {insolationResult.requiredContinuousHours} ч/сут
                    </span>
                  </div>
                  <div className="p-1.5 rounded bg-slate-900 border border-slate-800">
                    <span className="block text-[10px] text-slate-400">Период СанПиН:</span>
                    <span className="font-mono tabular-nums font-semibold text-sky-300 truncate block">
                      {insolationResult.normativePeriodLabel}
                    </span>
                  </div>
                </div>

                {/* Per-Facade Insolation Duration Table */}
                <div className="rounded-lg border border-slate-800 overflow-hidden">
                  <table className="w-full text-left border-collapse text-[11px]">
                    <thead>
                      <tr className="bg-slate-900 border-b border-slate-800 text-slate-400 text-[10px]">
                        <th className="py-1.5 px-2 font-medium">Фасад (Окна)</th>
                        <th className="py-1.5 px-2 font-medium text-right">Непрер.</th>
                        <th className="py-1.5 px-2 font-medium text-right">Интервал</th>
                        <th className="py-1.5 px-2 font-medium text-right">Статус</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/80 bg-slate-950 font-mono tabular-nums">
                      {insolationResult.facades.map((fac) => (
                        <tr key={fac.facade}>
                          <td className="py-1.5 px-2 font-sans text-slate-200">
                            {fac.facadeLabel.split(' ')[0]} ({fac.windowCount} ок., {fac.worldAzimuthDeg}°)
                          </td>
                          <td className="py-1.5 px-2 text-right font-semibold text-white">
                            {fac.maxContinuousHours} ч
                          </td>
                          <td className="py-1.5 px-2 text-right text-slate-400 text-[10px]">
                            {fac.sunIntervals.length > 0 ? fac.sunIntervals.join(', ') : '—'}
                          </td>
                          <td className="py-1.5 px-2 text-right">
                            {fac.status === 'compliant' || fac.status === 'intermittent_ok' ? (
                              <span className="text-emerald-400 font-semibold">Норма</span>
                            ) : fac.status === 'violation' ? (
                              <span className="text-red-400 font-semibold">Мало</span>
                            ) : (
                              <span className="text-slate-500">0 ок.</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <p className="text-[11px] text-slate-300 leading-snug">
                  {insolationResult.summaryVerdict}
                </p>

                <div className="space-y-1">
                  {insolationResult.recommendations.map((rec, idx) => (
                    <div key={idx} className="text-[11px] text-sky-300 leading-snug">
                      • {rec}
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* Semi-Transparent Walls & Sunlight Patch Control Card */}
            <div className="p-3 rounded-lg bg-slate-950 border border-amber-500/40 space-y-2.5">
              <div className="flex items-center justify-between">
                <div className="text-xs font-semibold text-amber-300 flex items-center gap-1.5">
                  <Sparkles className="w-4 h-4 text-amber-400" />
                  Световое пятно и Теплокарта (3D/2D)
                </div>
                <span className="text-[11px] font-mono text-amber-400">
                  {xrayWallsMode ? 'Рентген ВКЛ' : 'ВЫКЛ'}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-1.5">
                <button
                  type="button"
                  onClick={() => onToggleXrayWalls()}
                  className={`py-2 px-2 rounded-lg text-[11px] font-semibold border transition-colors flex items-center justify-center gap-1.5 whitespace-nowrap ${
                    xrayWallsMode
                      ? 'bg-amber-500 text-slate-950 border-amber-400 hover:bg-amber-400'
                      : 'bg-slate-900 text-amber-300 border-amber-500/50 hover:bg-slate-800'
                  }`}
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  {xrayWallsMode ? 'Световое пятно ВКЛ' : 'Световое пятно'}
                </button>
                {onToggleThermalHeatmap && (
                  <button
                    type="button"
                    onClick={() => onToggleThermalHeatmap()}
                    className={`py-2 px-2 rounded-lg text-[11px] font-semibold border transition-colors flex items-center justify-center gap-1.5 whitespace-nowrap ${
                      thermalHeatmapMode
                        ? 'bg-orange-500 text-slate-950 border-orange-300 hover:bg-orange-400'
                        : 'bg-slate-900 text-orange-300 border-orange-500/50 hover:bg-slate-800'
                    }`}
                  >
                    <Flame className="w-3.5 h-3.5" />
                    {thermalHeatmapMode ? 'Теплокарта ВКЛ' : 'Теплокарта фасадов'}
                  </button>
                )}
              </div>
            </div>

            {/* Notice when selected object has no windows or doors */}
            {selectedObj && selectedCaps && !selectedCaps.hasDoors && !selectedCaps.hasWindows && (
              <div
                data-testid="no-openings-object-notice"
                className="p-3 rounded-lg bg-slate-950 border border-slate-800 space-y-2"
              >
                <div className="text-xs font-semibold text-amber-300">
                  Объект «{selectedObj.name}» ({selectedCaps.categoryTitle})
                </div>
                <p className="text-[11px] text-slate-400 leading-snug">
                  Данный тип объекта является инженерным или ландшафтным сооружением и не имеет оконных или дверных проемов. Для настройки дверей и окон выберите жилой дом или строение со стенами.
                </p>
              </div>
            )}

            {/* Per-Facade Door Count, Size, Threshold, Offset, and Glazing Editor for Selected Building */}
            {selectedObj && selectedCaps?.hasDoors && (
              <div
                data-testid="doors-editor-card"
                className="p-3 rounded-lg bg-slate-950 border border-amber-500/40 space-y-3"
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-amber-300 flex items-center gap-1.5">
                    <DoorOpen className="w-4 h-4 text-amber-400" />
                    Двери по фасадам (1 этаж): «{selectedObj.name}»
                  </span>
                  <span className="text-[11px] font-mono text-amber-400">0–3 двери</span>
                </div>
                {(() => {
                  const doorCfg = getObjectDoorsConfig(selectedObj);
                  const facades: Array<{
                    key: 'south' | 'east' | 'west' | 'north';
                    label: string;
                  }> = [
                    { key: 'south', label: 'Южный фасад (+Z)' },
                    { key: 'east', label: 'Восточный фасад (+X)' },
                    { key: 'west', label: 'Западный фасад (−X)' },
                    { key: 'north', label: 'Северный фасад (−Z)' }
                  ];
                  return (
                    <>
                      <div className="grid grid-cols-2 gap-2">
                        {facades.map((f) => (
                          <div
                            key={f.key}
                            className="p-2 rounded bg-slate-900 border border-slate-800 flex items-center justify-between"
                          >
                            <span className="text-[11px] text-slate-300">{f.label}</span>
                            <select
                              aria-label={`Двери: ${f.label}`}
                              data-testid={`door-count-${f.key}`}
                              value={doorCfg[f.key]}
                              onChange={(e) => {
                                const count = Number(e.target.value);
                                onUpdateObject(selectedObj.id, (prev) => ({
                                  ...prev,
                                  doors: {
                                    ...getObjectDoorsConfig(prev),
                                    [f.key]: count
                                  }
                                }));
                              }}
                              className="bg-slate-950 border border-slate-700 rounded px-1.5 py-0.5 text-xs font-mono text-white"
                            >
                              <option value={0}>0</option>
                              <option value={1}>1</option>
                              <option value={2}>2</option>
                              <option value={3}>3</option>
                            </select>
                          </div>
                        ))}
                      </div>

                      {/* Door Size, Threshold, Offset & Glazing Controls (1mm accuracy + sliders) */}
                      <div className="pt-2 border-t border-slate-800 space-y-2.5">
                        <div className="grid grid-cols-2 gap-2.5">
                          <div>
                            <div className="flex items-center justify-between text-[11px] text-slate-300 mb-1">
                              <span>Ширина двери (м):</span>
                              <div className="w-20">
                                <MillimeterInput
                                  ariaLabel="Точная ширина двери (м)"
                                  dataTestId="door-width-input"
                                  min={0.6}
                                  max={3.2}
                                  step={0.01}
                                  precision={3}
                                  value={doorCfg.doorWidth ?? 0.95}
                                  onChange={(val) =>
                                    onUpdateObject(selectedObj.id, (prev) => ({
                                      ...prev,
                                      doors: {
                                        ...getObjectDoorsConfig(prev),
                                        doorWidth: Math.max(0.6, Math.min(3.2, val))
                                      }
                                    }))
                                  }
                                  className="w-full bg-slate-900 border border-slate-700 rounded px-1.5 py-0.5 text-[11px] font-mono tabular-nums text-amber-300 text-right"
                                />
                              </div>
                            </div>
                            <input
                              type="range"
                              aria-label="Ширина двери"
                              data-testid="door-width-slider"
                              min={0.6}
                              max={3.0}
                              step={0.05}
                              value={doorCfg.doorWidth ?? 0.95}
                              onChange={(e) => {
                                const val = Number(e.target.value);
                                onUpdateObject(selectedObj.id, (prev) => ({
                                  ...prev,
                                  doors: {
                                    ...getObjectDoorsConfig(prev),
                                    doorWidth: val
                                  }
                                }));
                              }}
                              className="w-full accent-amber-500"
                            />
                          </div>

                          <div>
                            <div className="flex items-center justify-between text-[11px] text-slate-300 mb-1">
                              <span>Высота двери (м):</span>
                              <div className="w-20">
                                <MillimeterInput
                                  ariaLabel="Точная высота двери (м)"
                                  dataTestId="door-height-input"
                                  min={1.6}
                                  max={2.8}
                                  step={0.01}
                                  precision={3}
                                  value={doorCfg.doorHeight ?? 2.05}
                                  onChange={(val) =>
                                    onUpdateObject(selectedObj.id, (prev) => ({
                                      ...prev,
                                      doors: {
                                        ...getObjectDoorsConfig(prev),
                                        doorHeight: Math.max(1.6, Math.min(2.8, val))
                                      }
                                    }))
                                  }
                                  className="w-full bg-slate-900 border border-slate-700 rounded px-1.5 py-0.5 text-[11px] font-mono tabular-nums text-amber-300 text-right"
                                />
                              </div>
                            </div>
                            <input
                              type="range"
                              aria-label="Высота двери"
                              data-testid="door-height-slider"
                              min={1.6}
                              max={2.6}
                              step={0.05}
                              value={doorCfg.doorHeight ?? 2.05}
                              onChange={(e) => {
                                const val = Number(e.target.value);
                                onUpdateObject(selectedObj.id, (prev) => ({
                                  ...prev,
                                  doors: {
                                    ...getObjectDoorsConfig(prev),
                                    doorHeight: val
                                  }
                                }));
                              }}
                              className="w-full accent-amber-500"
                            />
                          </div>
                        </div>

                        <div className="grid grid-cols-2 gap-2.5">
                          <div>
                            <div className="flex items-center justify-between text-[11px] text-slate-300 mb-1">
                              <span>Высота порога (м):</span>
                              <div className="w-20">
                                <MillimeterInput
                                  ariaLabel="Высота порога двери (м)"
                                  dataTestId="door-threshold-input"
                                  min={0}
                                  max={0.6}
                                  step={0.01}
                                  precision={3}
                                  value={doorCfg.thresholdHeight ?? 0.05}
                                  onChange={(val) =>
                                    onUpdateObject(selectedObj.id, (prev) => ({
                                      ...prev,
                                      doors: {
                                        ...getObjectDoorsConfig(prev),
                                        thresholdHeight: Math.max(0, Math.min(0.6, val))
                                      }
                                    }))
                                  }
                                  className="w-full bg-slate-900 border border-slate-700 rounded px-1.5 py-0.5 text-[11px] font-mono tabular-nums text-amber-300 text-right"
                                />
                              </div>
                            </div>
                            <input
                              type="range"
                              aria-label="Высота порога двери"
                              data-testid="door-threshold-slider"
                              min={0}
                              max={0.5}
                              step={0.02}
                              value={doorCfg.thresholdHeight ?? 0.05}
                              onChange={(e) => {
                                const val = Number(e.target.value);
                                onUpdateObject(selectedObj.id, (prev) => ({
                                  ...prev,
                                  doors: {
                                    ...getObjectDoorsConfig(prev),
                                    thresholdHeight: val
                                  }
                                }));
                              }}
                              className="w-full accent-amber-500"
                            />
                          </div>

                          <div>
                            <div className="flex items-center justify-between text-[11px] text-slate-300 mb-1">
                              <span>Смещение двери (%):</span>
                              <div className="w-20">
                                <MillimeterInput
                                  ariaLabel="Смещение двери по фасаду (%)"
                                  dataTestId="door-offset-input"
                                  min={-40}
                                  max={40}
                                  step={1}
                                  precision={0}
                                  value={Math.round((doorCfg.positionOffset ?? 0) * 100)}
                                  onChange={(pct) =>
                                    onUpdateObject(selectedObj.id, (prev) => ({
                                      ...prev,
                                      doors: {
                                        ...getObjectDoorsConfig(prev),
                                        positionOffset: Math.max(-0.4, Math.min(0.4, pct / 100))
                                      }
                                    }))
                                  }
                                  className="w-full bg-slate-900 border border-slate-700 rounded px-1.5 py-0.5 text-[11px] font-mono tabular-nums text-amber-300 text-right"
                                />
                              </div>
                            </div>
                            <input
                              type="range"
                              aria-label="Смещение двери по фасаду"
                              data-testid="door-offset-slider"
                              min={-0.4}
                              max={0.4}
                              step={0.05}
                              value={doorCfg.positionOffset ?? 0}
                              onChange={(e) => {
                                const val = Number(e.target.value);
                                onUpdateObject(selectedObj.id, (prev) => ({
                                  ...prev,
                                  doors: {
                                    ...getObjectDoorsConfig(prev),
                                    positionOffset: val
                                  }
                                }));
                              }}
                              className="w-full accent-amber-500"
                            />
                          </div>
                        </div>

                        {/* Door Glazing Checkbox */}
                        <label className="flex items-center justify-between p-2 rounded-lg bg-slate-900 border border-slate-800 cursor-pointer hover:border-slate-700">
                          <div className="flex items-center gap-2">
                            <input
                              type="checkbox"
                              data-testid="door-glazing-checkbox"
                              checked={Boolean(doorCfg.hasGlazing)}
                              onChange={(e) => {
                                const checked = e.target.checked;
                                onUpdateObject(selectedObj.id, (prev) => ({
                                  ...prev,
                                  doors: {
                                    ...getObjectDoorsConfig(prev),
                                    hasGlazing: checked
                                  }
                                }));
                              }}
                              className="accent-amber-500"
                            />
                            <span className="text-xs font-medium text-slate-200">
                              Дверь со стеклопакетом (пропускает солнечный свет)
                            </span>
                          </div>
                          <span className="text-[10px] font-mono text-amber-400">
                            {doorCfg.hasGlazing ? 'Стекло ВКЛ' : 'Глухая'}
                          </span>
                        </label>
                      </div>
                    </>
                  );
                })()}
              </div>
            )}

            {/* Per-Facade Window Count, Type, Size, and Position Editor for Selected Building */}
            {selectedObj && selectedCaps?.hasWindows && (
              <div
                data-testid="windows-editor-card"
                className="p-3 rounded-lg bg-slate-950 border border-slate-800 space-y-3"
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-white">
                    Окна по фасадам (на каждом этаже): «{selectedObj.name}»
                  </span>
                  <span className="text-[11px] font-mono text-sky-400">0–4 окна</span>
                </div>
                {(() => {
                  const winCfg = getObjectWindowsConfig(selectedObj);
                  const activeWinTypeId = getEffectiveWindowTypeId(selectedObj);
                  const activeWinInfo = WINDOW_TYPES_INFO[activeWinTypeId];
                  const selectedEnergy = calculateEnergyAndHeating(selectedObj, plot);
                  const facades: Array<{
                    key: 'south' | 'east' | 'west' | 'north';
                    label: string;
                  }> = [
                    { key: 'south', label: 'Южный фасад (+Z)' },
                    { key: 'east', label: 'Восточный фасад (+X)' },
                    { key: 'west', label: 'Западный фасад (−X)' },
                    { key: 'north', label: 'Северный фасад (−Z)' }
                  ];
                  return (
                    <>
                      {/* Window Construction Type Selector (Wooden 1/2 glass, PVC 1/2 chamber glazing) */}
                      <div
                        data-testid="window-types-selector-group"
                        className="p-2.5 rounded-lg bg-slate-900 border border-sky-500/35 space-y-2"
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-[11px] font-semibold text-sky-300">
                            Вид окон (рама и остекление / стеклопакет):
                          </span>
                          <span
                            data-testid="window-card-heat-loss-kwh"
                            className="text-[11px] font-mono tabular-nums font-bold text-amber-300"
                          >
                            Потери: {selectedEnergy.annualHeatLossWindowsKwh.toLocaleString('ru-RU')} кВт·ч/г
                          </span>
                        </div>

                        <div className="grid grid-cols-1 gap-1.5">
                          {Object.values(WINDOW_TYPES_INFO).map((wt) => {
                            const isSelected = activeWinTypeId === wt.id;
                            return (
                              <button
                                key={wt.id}
                                type="button"
                                data-testid={`window-type-btn-${wt.id}`}
                                onClick={() =>
                                  onUpdateObject(selectedObj.id, (prev) => ({
                                    ...prev,
                                    windows: {
                                      ...getObjectWindowsConfig(prev),
                                      windowTypeId: wt.id
                                    }
                                  }))
                                }
                                className={`w-full text-left p-2 rounded-lg border transition-colors ${
                                  isSelected
                                    ? 'bg-sky-950/50 border-sky-500'
                                    : 'bg-slate-950 border-slate-800 hover:border-slate-700'
                                }`}
                              >
                                <div className="flex items-center justify-between gap-2">
                                  <span className="text-xs font-semibold text-white">
                                    {wt.name}
                                  </span>
                                  <span className="text-[10px] font-mono tabular-nums text-emerald-400 shrink-0">
                                    R={wt.thermalResistanceR} · U={wt.heatTransferU} Вт/м²·°С
                                  </span>
                                </div>
                                <div className="text-[10px] text-slate-400 mt-0.5 flex items-center justify-between">
                                  <span>
                                    Профиль: {wt.frameMaterial === 'wood' ? 'Дерево' : 'Пластик (ПВХ)'} · Стекол: {wt.glassCount}
                                  </span>
                                  <span className="font-mono text-sky-300">
                                    g = {wt.solarTransmittanceG}
                                  </span>
                                </div>
                              </button>
                            );
                          })}
                        </div>

                        <div className="text-[10px] text-slate-300 leading-snug pt-1 border-t border-slate-800 flex items-center justify-between">
                          <span>Выбрано: {activeWinInfo.shortName}</span>
                          <span className="font-mono text-sky-400">
                            S_окон = {selectedEnergy.windowAreaSqm} м²
                          </span>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-2">
                        {facades.map((f) => (
                          <div
                            key={f.key}
                            className="p-2 rounded bg-slate-900 border border-slate-800 flex items-center justify-between"
                          >
                            <span className="text-[11px] text-slate-300">{f.label}</span>
                            <select
                              aria-label={f.label}
                              data-testid={`window-count-${f.key}`}
                              value={winCfg[f.key]}
                              onChange={(e) => {
                                const count = Number(e.target.value);
                                onUpdateObject(selectedObj.id, (prev) => ({
                                  ...prev,
                                  windows: {
                                    ...getObjectWindowsConfig(prev),
                                    [f.key]: count
                                  }
                                }));
                              }}
                              className="bg-slate-950 border border-slate-700 rounded px-1.5 py-0.5 text-xs font-mono text-white"
                            >
                              <option value={0}>0</option>
                              <option value={1}>1</option>
                              <option value={2}>2</option>
                              <option value={3}>3</option>
                              <option value={4}>4</option>
                            </select>
                          </div>
                        ))}
                      </div>

                      {/* Window Size & Position Controls (1mm accuracy + sliders) */}
                      <div className="pt-2 border-t border-slate-800 space-y-2.5">
                        <div className="grid grid-cols-2 gap-2.5">
                          <div>
                            <div className="flex items-center justify-between text-[11px] text-slate-300 mb-1">
                              <span>Ширина окна (м):</span>
                              <div className="w-20">
                                <MillimeterInput
                                  ariaLabel="Точная ширина окна (м)"
                                  dataTestId="window-width-input"
                                  min={0.4}
                                  max={3.5}
                                  step={0.01}
                                  precision={3}
                                  value={winCfg.windowWidth ?? 1.3}
                                  onChange={(val) =>
                                    onUpdateObject(selectedObj.id, (prev) => ({
                                      ...prev,
                                      windows: {
                                        ...getObjectWindowsConfig(prev),
                                        windowWidth: Math.max(0.4, Math.min(3.5, val))
                                      }
                                    }))
                                  }
                                  className="w-full bg-slate-900 border border-slate-700 rounded px-1.5 py-0.5 text-[11px] font-mono tabular-nums text-sky-400 text-right"
                                />
                              </div>
                            </div>
                            <input
                              type="range"
                              aria-label="Ширина окна"
                              data-testid="window-width-slider"
                              min={0.5}
                              max={2.8}
                              step={0.1}
                              value={winCfg.windowWidth ?? 1.3}
                              onChange={(e) => {
                                const val = Number(e.target.value);
                                onUpdateObject(selectedObj.id, (prev) => ({
                                  ...prev,
                                  windows: {
                                    ...getObjectWindowsConfig(prev),
                                    windowWidth: val
                                  }
                                }));
                              }}
                              className="w-full accent-sky-500"
                            />
                          </div>

                          <div>
                            <div className="flex items-center justify-between text-[11px] text-slate-300 mb-1">
                              <span>Высота окна (м):</span>
                              <div className="w-20">
                                <MillimeterInput
                                  ariaLabel="Точная высота окна (м)"
                                  dataTestId="window-height-input"
                                  min={0.4}
                                  max={2.8}
                                  step={0.01}
                                  precision={3}
                                  value={winCfg.windowHeight ?? 1.3}
                                  onChange={(val) =>
                                    onUpdateObject(selectedObj.id, (prev) => ({
                                      ...prev,
                                      windows: {
                                        ...getObjectWindowsConfig(prev),
                                        windowHeight: Math.max(0.4, Math.min(2.8, val))
                                      }
                                    }))
                                  }
                                  className="w-full bg-slate-900 border border-slate-700 rounded px-1.5 py-0.5 text-[11px] font-mono tabular-nums text-sky-400 text-right"
                                />
                              </div>
                            </div>
                            <input
                              type="range"
                              aria-label="Высота окна"
                              data-testid="window-height-slider"
                              min={0.5}
                              max={2.4}
                              step={0.1}
                              value={winCfg.windowHeight ?? 1.3}
                              onChange={(e) => {
                                const val = Number(e.target.value);
                                onUpdateObject(selectedObj.id, (prev) => ({
                                  ...prev,
                                  windows: {
                                    ...getObjectWindowsConfig(prev),
                                    windowHeight: val
                                  }
                                }));
                              }}
                              className="w-full accent-sky-500"
                            />
                          </div>
                        </div>

                        <div className="grid grid-cols-2 gap-2.5">
                          <div>
                            <div className="flex items-center justify-between text-[11px] text-slate-300 mb-1">
                              <span>Подоконник (м):</span>
                              <div className="w-20">
                                <MillimeterInput
                                  ariaLabel="Точная высота подоконника (м)"
                                  dataTestId="window-sill-input"
                                  min={0.1}
                                  max={2.0}
                                  step={0.01}
                                  precision={3}
                                  value={winCfg.sillHeight ?? 0.85}
                                  onChange={(val) =>
                                    onUpdateObject(selectedObj.id, (prev) => ({
                                      ...prev,
                                      windows: {
                                        ...getObjectWindowsConfig(prev),
                                        sillHeight: Math.max(0.1, Math.min(2.0, val))
                                      }
                                    }))
                                  }
                                  className="w-full bg-slate-900 border border-slate-700 rounded px-1.5 py-0.5 text-[11px] font-mono tabular-nums text-sky-400 text-right"
                                />
                              </div>
                            </div>
                            <input
                              type="range"
                              aria-label="Высота подоконника"
                              data-testid="window-sill-slider"
                              min={0.2}
                              max={1.6}
                              step={0.05}
                              value={winCfg.sillHeight ?? 0.85}
                              onChange={(e) => {
                                const val = Number(e.target.value);
                                onUpdateObject(selectedObj.id, (prev) => ({
                                  ...prev,
                                  windows: {
                                    ...getObjectWindowsConfig(prev),
                                    sillHeight: val
                                  }
                                }));
                              }}
                              className="w-full accent-sky-500"
                            />
                          </div>

                          <div>
                            <div className="flex items-center justify-between text-[11px] text-slate-300 mb-1">
                              <span>Смещение (%):</span>
                              <div className="w-20">
                                <MillimeterInput
                                  ariaLabel="Смещение окон по стене (%)"
                                  dataTestId="window-offset-input"
                                  min={-35}
                                  max={35}
                                  step={1}
                                  precision={0}
                                  value={Math.round((winCfg.positionOffset ?? 0) * 100)}
                                  onChange={(pct) =>
                                    onUpdateObject(selectedObj.id, (prev) => ({
                                      ...prev,
                                      windows: {
                                        ...getObjectWindowsConfig(prev),
                                        positionOffset: Math.max(-0.35, Math.min(0.35, pct / 100))
                                      }
                                    }))
                                  }
                                  className="w-full bg-slate-900 border border-slate-700 rounded px-1.5 py-0.5 text-[11px] font-mono tabular-nums text-sky-400 text-right"
                                />
                              </div>
                            </div>
                            <input
                              type="range"
                              aria-label="Смещение окон по фасаду"
                              data-testid="window-offset-slider"
                              min={-0.35}
                              max={0.35}
                              step={0.05}
                              value={winCfg.positionOffset ?? 0}
                              onChange={(e) => {
                                const val = Number(e.target.value);
                                onUpdateObject(selectedObj.id, (prev) => ({
                                  ...prev,
                                  windows: {
                                    ...getObjectWindowsConfig(prev),
                                    positionOffset: val
                                  }
                                }));
                              }}
                              className="w-full accent-sky-500"
                            />
                          </div>
                        </div>
                      </div>
                    </>
                  );
                })()}
              </div>
            )}
          </div>
        )}
      </div>
    </aside>
  );
};

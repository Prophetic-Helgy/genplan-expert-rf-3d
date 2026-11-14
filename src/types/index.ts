export type LandCategory = 'SNT' | 'IZHS';

export type PlotShapePreset = 'rectangle' | 'trapezoid' | 'l_shape' | 'custom';

export type BoundaryEdgeType = 'street' | 'driveway' | 'neighbor';

export type BuildingCategory =
  | 'house'
  | 'bathhouse'
  | 'garage'
  | 'shed'
  | 'greenhouse'
  | 'poultry'
  | 'toilet'
  | 'well'
  | 'neighbor_house'
  | 'neighbor_well'
  | 'forest'
  | 'tree_tall'
  | 'tree_medium'
  | 'water_body'
  | 'power_line'
  | 'gas_pipe'
  | 'water_main'
  | 'sewer_main'
  | 'road';

export type RoofType = 'flat' | 'shed' | 'gable' | 'hip';

export type FireResistanceMaterial = 'stone' | 'mixed' | 'wood';

export type SlopeDirection = 'north' | 'south' | 'east' | 'west';

export type FenceType = 'mesh' | 'solid';

export type BuildingFootprintShape = 'rectangle' | 'l_shape' | 't_shape' | 'chamfered';

export type WindowConstructionTypeId =
  | 'wood_single_glass'
  | 'wood_double_glass'
  | 'pvc_single_chamber'
  | 'pvc_double_chamber';

export type RoofInsulationTypeId =
  | 'none'
  | 'mineral_wool_150'
  | 'mineral_wool_200_50'
  | 'pir_puf_150'
  | 'ecowool_250';

export type WallInsulationTypeId =
  | 'none'
  | 'mineral_wool_50'
  | 'mineral_wool_100'
  | 'mineral_wool_150'
  | 'eps_100'
  | 'pir_80';

export interface BuildingWindowsConfig {
  south: number;
  north: number;
  east: number;
  west: number;
  windowWidth?: number; // width in meters (0.6..2.6), default 1.3
  windowHeight?: number; // height in meters (0.5..2.2), default 1.3
  sillHeight?: number; // sill height in meters (0.3..1.5), default 0.85
  positionOffset?: number; // horizontal shift ratio (-0.35..+0.35), default 0
  windowTypeId?: WindowConstructionTypeId; // тип профиля и остекления окон
}

export interface BuildingDoorsConfig {
  south: number;
  north: number;
  east: number;
  west: number;
  doorWidth?: number; // width in meters (0.6..2.8), default 0.95 (or 2.4 for garage)
  doorHeight?: number; // height in meters (1.6..2.6), default 2.05
  thresholdHeight?: number; // threshold height from floor/plinth in meters (0.0..0.5), default 0.05
  positionOffset?: number; // horizontal shift ratio (-0.40..+0.40), default 0
  hasGlazing?: boolean; // whether door has a glass window insert / patio glazing
}

export interface InteriorSunPatch {
  facade: 'south' | 'north' | 'east' | 'west';
  windowIndex: number;
  floorIndex?: number; // 0 = 1-й этаж, 1 = 2-й этаж, 2 = 3-й этаж
  floorElevationY?: number; // локальная высота Y поверхности пола/перекрытия этажа (м)
  windowCenterLocal: { x: number; y: number; z: number };
  windowCornersLocal3D: Array<{ x: number; y: number; z: number }>;
  floorPolygonLocal: Point2D[];
  intensity: number;
}

export type SoilTypeId = 'rock' | 'sand' | 'loam' | 'peat';

export type WallMaterialId = 'aerated_concrete' | 'ceramic_block' | 'frame' | 'timber';

export type RoofCoverId = 'metal_tile' | 'soft_shingles' | 'corrugated';

export type FoundationTypeId = 'mzlf' | 'deep_strip' | 'slab' | 'piles';

export interface Point2D {
  x: number;
  z: number;
}

export interface BoundaryEdgeConfig {
  edgeIndex: number; // segment from points[i] to points[(i+1)%N]
  type: BoundaryEdgeType;
  fenceType: FenceType;
  fenceHeight: number;
  hasNeighborConsent: boolean;
}

export type ParcelZoneType = 'main_plot' | 'neighbor_parcel' | 'state_land';

export interface AdjacentParcelConfig {
  id: string;
  name: string;
  type: 'neighbor_parcel' | 'state_land';
  side: 'west' | 'east' | 'north' | 'south' | 'custom';
  width: number; // X dimension (m)
  length: number; // Z dimension (m)
  offsetX: number; // center X relative to main plot center (m)
  offsetZ: number; // center Z relative to main plot center (m)
  cadastralNote?: string;
}

export interface HeatingTariffsConfig {
  electricityRubPerKwh: number; // руб/кВт·ч (по умолчанию 6.5)
  gasRubPerM3: number; // руб/м³ магистрального газа (по умолчанию 7.5)
  firewoodRubPerM3: number; // руб/м³ сухих березовых дров (по умолчанию 3200)
}

export interface MaterialUnitPrices {
  concreteRubPerM3: number; // Бетон товарный М350 (₽/м³)
  rebarRubPerKg: number; // Арматура А500С (₽/кг)
  sandGravelRubPerM3: number; // Песчано-щебеночная подушка (₽/м³)
  aeratedConcreteRubPerM3: number; // Газобетон D400 (₽/м³)
  ceramicBrickRubPerM3: number; // Керамический блок / кирпич (₽/м³)
  timberRubPerM3: number; // Профилированный / клееный брус (₽/м³)
  frameWallRubPerM3: number; // Каркас + базальтовый утеплитель стен (₽/м³)
  facadeFinishRubPerSqm: number; // Фасадная отделка и утепление (₽/м²)
  metalTileRubPerSqm: number; // Металлочерепица (₽/м²)
  softShinglesRubPerSqm: number; // Гибкая битумная черепица (₽/м²)
  corrugatedRoofRubPerSqm: number; // Профнастил кровельный (₽/м²)
  rafterTimberRubPerM3: number; // Пиломатериал стропильной системы (₽/м³)
  fenceRubPerMeter: number; // Ограждение участка с лагами и столбами (₽/п.м.)
}

export interface PlotReliefConfig {
  elevationNW: number; // Высотная отметка Северо-Западного угла (м, балтийская или условная система)
  elevationNE: number; // Высотная отметка Северо-Восточного угла (м)
  elevationSE: number; // Высотная отметка Юго-Восточного угла (м)
  elevationSW: number; // Высотная отметка Юго-Западного угла (м)
  showDrainageZones: boolean; // Визуализировать зоны ливневого водоотведения и направления стока
}

export interface PlotDrainageZone {
  id: string;
  type: 'interceptor_trench' | 'collector_well' | 'runoff_channel';
  title: string;
  description: string;
  points: Point2D[]; // Полигон или трасса зоны в координатах участка
  center: Point2D;
  radiusM?: number;
}

export interface PlotReliefAnalysis {
  elevationNW: number;
  elevationNE: number;
  elevationSE: number;
  elevationSW: number;
  minElevationM: number;
  maxElevationM: number;
  meanElevationM: number;
  elevationDeltaM: number; // Перепад высот ΔH (м)
  slopePercent: number; // Уклон поверхности i (%)
  slopePermille: number; // Уклон в промилле (‰)
  slopeAngleDeg: number; // Угол уклона рельефа (°)
  slopeVector: Point2D; // Единичный вектор направления ската воды по рельефу (x, z)
  slopeDirectionAzimuthDeg: number; // Азимут направления уклона (0..360°)
  slopeDirectionLabel: string; // Текстовое направление стока (напр., "Юго-Восток (ЮВ)")
  highestCornerLabel: string;
  lowestCornerLabel: string;
  lowestCornerPoint: Point2D;
  highestCornerPoint: Point2D;
  normativeCategory: 'flat_stagnant' | 'optimal' | 'moderate_slope' | 'steep_terracing';
  normativeStatusLabel: string;
  normCode: string; // "СП 42.13330.2016 / СП 32.13330.2018 (Поверхностный водоотвод)"
  stormwaterRunoffLitersPerSec: number; // Расчетный расход дождевых вод Q (л/с)
  recommendation: string;
  drainageZones: PlotDrainageZone[];
}

export interface ObjectCategoryCapabilities {
  category: BuildingCategory;
  kind:
    | 'heated_building' // Жилой дом, баня, гараж, дом соседа
    | 'unheated_outbuilding' // Хозблок, птичник, теплица
    | 'point_engineering' // Скважина, колодец, септик/туалет
    | 'linear_pipeline' // Водопровод, канализация, газопровод
    | 'overhead_or_road' // ЛЭП, автодорога
    | 'natural_feature'; // Лес, деревья, водоем
  categoryTitle: string;
  widthLabel: string;
  lengthLabel: string;
  heightLabel: string | null; // null if above-ground wall height doesn't apply (e.g., underground pipeline / water body)
  hasPlanFootprintShape: boolean; // Форма здания в плане (Прямоугольная, Г-обр., Т-обр., Скошенная)
  hasInteriorAreaInsideWalls: boolean; // Расчет площади внутри стен и толщина наружных стен
  hasMultiStoryAndBasement: boolean; // Этажность (1–3 этажа) + 1 подземный этаж
  hasPlinthAndFoundationSlab: boolean; // Цоколь и выступ/толщина плиты фундамента
  hasRoofGeometry: boolean; // Тип крыши, высота крыши, угол ската α
  hasRoofOverhang: boolean; // Вылет свеса кровли
  hasRoofInsulation: boolean; // Устройство утепления крыши
  hasWallInsulation: boolean; // Вариант наружного утепления стен
  hasWindows: boolean; // Окна и вид стеклопакетов/профиля
  hasDoors: boolean; // Входные двери
  hasFireResistanceMaterial: boolean; // Класс огнестойкости по СП 4.13130
  hasBurialDepth: boolean; // Степень заглубления под землю (м)
  hasPipelineDiameter: boolean; // Диаметр трубы (мм) и логика линейного трубопровода
}

export interface PlotConfig {
  preset: PlotShapePreset;
  width: number; // X dimension (m)
  length: number; // Z dimension (m)
  trapezoidTopWidth: number; // for trapezoid preset
  lCutoutWidth: number; // for L-shape preset
  lCutoutLength: number;
  points: Point2D[]; // vertices of the plot polygon in meters, centered around (0,0)
  edges: BoundaryEdgeConfig[];
  category: LandCategory;
  northAngle: number; // 0..360 degrees (0 = -Z is North)
  regionId: string;
  soilTypeId: SoilTypeId;
  hasZouit: boolean; // Охранная зона (ЛЭП / Газопровод)
  zouitEdgeIndex: number;
  zouitDepth: number; // default 3m or 10m
  customLat?: number; // Точная широта участка (° с.ш.)
  customLng?: number; // Точная долгота участка (° в.д.)
  customLocationLabel?: string; // Описание определенной геолокации
  baseFieldMultiplier?: number; // Множитель базового поля вокруг участка (стандартно в 4 раза шире и длиннее)
  heatingTariffs?: HeatingTariffsConfig; // Тарифы на энергоносители (электричество, газ, дрова)
  materialUnitPrices?: MaterialUnitPrices; // Рыночные цены за единицу каждого материала для сметы BOM
  relief?: PlotReliefConfig; // Данные о высотных отметках рельефа и водоотведении
  mainParcelName?: string; // Пользовательское название основного участка
  adjacentParcels?: AdjacentParcelConfig[]; // Границы соседских участков и государственных земель
}

export interface SiteObject {
  id: string;
  name: string;
  category: BuildingCategory;
  x: number; // center X in meters relative to plot center
  z: number; // center Z in meters relative to plot center
  width: number; // W (along X when rotation = 0; for pipelines: route length in m)
  length: number; // L (along Z when rotation = 0; for pipelines: trench/corridor width in m)
  wallHeight: number; // H_wall (m) - total above-ground wall height including plinth
  roofHeight: number; // H_roof / ΔH / H_ridge / H_peak (m)
  overhang: number; // Overhang O (m), default 0.4
  rotation: number; // degrees (0, 90, 180, 270 or custom)
  roofType: RoofType;
  footprintShape?: BuildingFootprintShape; // plan shape: rectangle, l_shape, t_shape, chamfered
  wingWidth?: number; // cutout or wing width (m)
  wingLength?: number; // cutout or wing length (m)
  windows?: BuildingWindowsConfig; // number of windows on each facade
  doors?: BuildingDoorsConfig; // number & dimensions of entrance/patio doors on each facade
  windowTypeId?: WindowConstructionTypeId; // тип профиля и остекления окон
  roofInsulationId?: RoofInsulationTypeId; // устройство утепления крыши
  wallInsulationId?: WallInsulationTypeId; // вариант наружного утепления стен
  slopeDirection: SlopeDirection; // for 'shed' roof: which local side water runs towards
  material: FireResistanceMaterial;
  floors: number; // 1, 2, 3 (надземных этажей)
  floorHeight?: number; // высота одного этажа в чистоте (м), по умолчанию 3.0
  hasBasement?: boolean; // наличие подземного (цокольного/подвального) этажа (+1 подземный)
  basementDepth?: number; // глубина подземного этажа ниже уровня земли (м), по умолчанию 2.5
  interfloorSlabThickness?: number; // толщина межэтажных перекрытий (м), по умолчанию 0.22
  plinthHeight?: number; // высота надземного цоколя (м), по умолчанию 0.45
  foundationSlabOverhang?: number; // выступ плиты фундамента за контур стен (м), по умолчанию 0.20
  foundationSlabThickness?: number; // толщина плиты фундамента (м), по умолчанию 0.30
  wallThickness?: number; // толщина наружных стен (м), по умолчанию зависит от материала (0.25..0.40)
  burialDepth?: number; // глубина заложения подземных коммуникаций / септика / водопровода / газа (м)
  pipelineDiameterMm?: number; // наружный диаметр трубопровода (мм): напр. 32, 63, 110, 160, 225
  parcelId?: string; // ID участка, на котором расположена постройка ('main_plot' или ID из adjacentParcels)
  glazingRatio: number; // e.g., 0.15 (15%)
  partitionLength: number; // internal walls length (m)
  wallMaterialId: WallMaterialId;
  roofCoverId: RoofCoverId;
  foundationTypeId: FoundationTypeId;
}

export interface BuildingInteriorAreaResult {
  grossFootprintAreaSqm: number; // площадь застройки по наружному обводу стен (м²)
  wallThicknessM: number; // толщина наружных стен (м)
  outerPerimeterM: number; // периметр по наружному контуру (м)
  wallFootprintAreaSqm: number; // площадь сечения наружных стен на 1 этаже (м²)
  partitionFootprintAreaSqm: number; // площадь перегородок на 1 этаже (м²)
  netInteriorSingleFloorSqm: number; // чистая площадь внутри наружных стен (1 этаж, м²)
  usableRoomSingleFloorSqm: number; // полезная площадь комнат за вычетом перегородок (1 этаж, м²)
  aboveGroundFloors: number;
  hasBasement: boolean;
  netInteriorAboveGroundSqm: number; // суммарная площадь внутри стен надземных этажей (м²)
  netInteriorBasementSqm: number; // площадь внутри стен подземного этажа (м²)
  totalNetInteriorAllFloorsSqm: number; // полная площадь внутри стен всех этажей + подвал (м²)
  totalUsableRoomsAllFloorsSqm: number; // полная полезная площадь с вычетом перегородок (м²)
  effectiveInnerWidthM: number; // внутренний размер по ширине W - 2*t (м)
  effectiveInnerLengthM: number; // внутренний размер по длине L - 2*t (м)
}

export interface FacadeInsolationMetric {
  facade: 'south' | 'east' | 'west' | 'north';
  facadeLabel: string;
  windowCount: number;
  worldAzimuthDeg: number; // 0..360 (0=N, 90=E, 180=S, 270=W)
  compassLabel: string;
  totalHours: number; // суммарная инсоляция за день (ч)
  maxContinuousHours: number; // максимальная непрерывная инсоляция (ч)
  sunIntervals: string[]; // интервалы облучения (напр. ["09:20–14:50"])
  shadedByNeighborHours: number; // потери инсоляции из-за затенения соседними объектами (ч)
  meetsContinuousNorm: boolean;
  meetsIntermittentNorm: boolean;
  status: 'compliant' | 'intermittent_ok' | 'violation' | 'no_windows';
}

export interface BuildingInsolationAnalysis {
  normCode: string; // "СанПиН 1.2.3685-21 (табл. 5.20) и ГОСТ Р 57795-2017"
  latitudeDeg: number;
  climateZone: 'northern' | 'central' | 'southern';
  climateZoneLabel: string;
  normativePeriodLabel: string;
  requiredContinuousHours: number; // 2.5 (север), 2.0 (центр), 1.5 (юг)
  requiredIntermittentHours: number; // +0.5 ч
  dayOfYear: number;
  isWithinNormativeSeason: boolean;
  facades: FacadeInsolationMetric[];
  compliantFacadesCount: number;
  totalWindowedFacadesCount: number;
  overallCompliant: boolean;
  summaryVerdict: string;
  recommendations: string[];
}

export interface FacadeThermalMetric {
  facade: 'south' | 'east' | 'west' | 'north';
  facadeLabel: string;
  grossFacadeAreaSqm: number;
  windowCount: number;
  windowAreaSqm: number;
  netWallAreaSqm: number;
  glazingPercent: number; // % остекления фасада
  wallHeatFluxWm2: number; // удельный тепловой поток через глухую стену (Вт/м²)
  windowHeatFluxWm2: number; // удельный тепловой поток через окна (Вт/м²)
  effectiveFacadeHeatFluxWm2: number; // средневзвешенный тепловой поток фасада с учетом мостиков холода (Вт/м²)
  heatLossNormalized01: number; // 0..1 для цветовой шкалы тепловизора
  thermalColorHex: string; // цвет фасада на тепловой карте (#10b981 .. #ef4444)
  zoneSeverity: 'low' | 'moderate' | 'elevated' | 'critical';
  zoneSeverityLabel: string;
}

export interface BuildingThermalHeatmapAnalysis {
  designDeltaTempC: number; // расчетный перепад температур ΔT (°C)
  wallMaterialName: string;
  wallInsulationName: string;
  windowTypeName: string;
  roofInsulationName: string;
  wallRValue: number;
  windowRValue: number;
  roofRValue: number;
  roofHeatFluxWm2: number;
  roofThermalColorHex: string;
  overallGlazingPercent: number;
  facades: FacadeThermalMetric[];
  highestLossFacade: FacadeThermalMetric;
  thermalBridgeAlert: string;
}

export type EnergyEfficiencyClass = 'A++' | 'A+' | 'A' | 'B' | 'C' | 'D' | 'E';

export interface EnergyAndHeatingResult {
  energyClass: EnergyEfficiencyClass;
  energyClassLabel: string;
  energyClassColor: string;
  specificHeatLossPerSqmKwh: number; // удельный расход тепловой энергии (кВт·ч/м²·год)
  heatedFloorAreaSqm: number; // общая отапливаемая площадь всех этажей (включая подземный)
  aboveGroundFloors: number;
  hasBasement: boolean;
  grossWallAreaSqm: number; // полная площадь наружных стен (до вычета окон)
  windowAreaSqm: number; // суммарная площадь всех окон (остекления)
  netWallAreaSqm: number; // чистая площадь глухих стен (за вычетом окон!)
  plinthAreaSqm: number;
  basementWallAreaSqm: number;
  roofInsulationAreaSqm: number;
  windowTypeId: WindowConstructionTypeId;
  windowTypeName: string;
  wallInsulationId: WallInsulationTypeId;
  wallInsulationName: string;
  roofInsulationId: RoofInsulationTypeId;
  roofInsulationName: string;
  baseWallRValue: number; // базовое R несущей стены без утеплителя (м²·°С/Вт)
  wallInsulationBonusR: number; // добавочное R наружного утепления стен (м²·°С/Вт)
  wallRValue: number; // суммарное сопротивление теплопередаче стен (м²·°С/Вт)
  windowRValue: number; // сопротивление теплопередаче окон (м²·°С/Вт)
  roofRValue: number; // сопротивление теплопередаче крыши/чердака (м²·°С/Вт)
  requiredWallRValue: number; // нормативное R_req стен региона
  requiredRoofRValue: number; // нормативное R_req крыши региона (обычно 1.32 * R_req_wall)
  requiredWindowRValue: number; // нормативное R_req окон региона
  annualHeatLossWallsKwh: number;
  annualHeatLossWindowsKwh: number;
  annualHeatLossRoofKwh: number;
  annualHeatLossFloorKwh: number;
  annualHeatLossRoofAndFloorKwh: number;
  annualHeatLossVentilationKwh: number;
  totalAnnualHeatEnergyKwh: number; // суммарные теплопотери за отопительный сезон (кВт·ч/год)
  heatingSeasonDays: number;
  electricity: {
    tariffRubPerKwh: number;
    annualConsumptionKwh: number;
    annualCostRub: number;
    monthlySeasonCostRub: number;
  };
  gas: {
    tariffRubPerM3: number;
    annualConsumptionM3: number;
    annualCostRub: number;
    monthlySeasonCostRub: number;
  };
  firewood: {
    tariffRubPerM3: number;
    annualConsumptionM3: number;
    annualCostRub: number;
    monthlySeasonCostRub: number;
  };
}

export interface ParameterRecommendation {
  id: string;
  severity: 'optimal' | 'warning' | 'critical';
  category: 'floors' | 'basement' | 'slab' | 'plinth' | 'energy' | 'utilities';
  title: string;
  normCode: string;
  currentValueText: string;
  recommendedValueText: string;
  advice: string;
}

export type ViolationSeverity = 'error' | 'warning' | 'info';

export interface NormViolation {
  id: string;
  objectId?: string;
  edgeIndex?: number;
  severity: ViolationSeverity;
  code: string; // e.g. "СП 53.13330.2019 п. 6.7"
  title: string;
  description: string;
  recommendation: string;
  canGenerateConsent?: boolean;
  consentType?: 'fence' | 'setback';
  measuredValue?: number;
  requiredValue?: number;
}

export type WindDirection8 = 'N' | 'NE' | 'E' | 'SE' | 'S' | 'SW' | 'W' | 'NW';
export type WindZoneId = 'I' | 'II' | 'III' | 'IV' | 'V' | 'VI' | 'VII';

export interface RegionInfo {
  id: string;
  name: string;
  lat: number;
  lng: number;
  snowZone: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;
  snowLoadSg: number; // kg/m² normative snow weight S_g
  windZone: WindZoneId; // Ветровой район по СП 20.13330.2016 Табл. 11.1
  windPressureW0Pa: number; // Нормативное ветровое давление w_0 (Па)
  windPressureW0KgM2: number; // Нормативное ветровое давление w_0 (кгс/м²)
  avgWindSpeedMs: number; // Средняя скорость ветра (м/с) по СП 131.13330.2020
  maxGustWindSpeedMs: number; // Расчетная порывистая скорость ветра (м/с)
  prevailingWindDir: WindDirection8; // Господствующее направление ветра
  prevailingWindLabel: string; // Текстовое описание господствующего ветра (например, "ЮЗ (Юго-Западный)")
  windRose: Record<WindDirection8, number>; // Повторяемость направлений ветра за год (%) по 8 румбам
  frostDepth: number; // meters d_f
  gsop: number; // Градусо-сутки отопительного периода
  rReqWall: number; // Требуемое сопротивление теплопередаче стен R_req (м²·°С/Вт)
  defaultSoil: SoilTypeId;
  climateSummary: string;
}

export interface SoilInfo {
  id: SoilTypeId;
  name: string;
  bearingCapacityR0: number; // kPa (100 kPa ≈ 10.2 t/m²)
  heavingClass: string;
  recommendedFoundations: FoundationTypeId[];
  description: string;
  recommendationText: string;
}

export interface RoofGeometryMetrics {
  roofType: RoofType;
  slopeAngleDeg: number; // α in degrees
  shapeFactorMu: number; // μ according to СП 20.13330.2016
  roofAreaSqm: number; // S_roof exact surface area (m²)
  horizontalProjectionSqm: number; // (L + 2*O)*(W + 2*O)
  effectiveFootprintWidth: number; // considering overhang rule (>0.5m)
  effectiveFootprintLength: number;
  overhangRuleTriggered: boolean;
  wasteFactor: number; // 1.12 for flat/shed/gable, 1.20 for hip/pyramid
}

export interface SnowLoadResult {
  snowZone: number;
  normativeSg: number; // kg/m²
  slopeAngleDeg: number;
  mu: number;
  designSnowLoadS: number; // S = S_g * μ * 1.4 (kg/m²)
  totalSnowMassTons: number; // M_snow (tons)
  recommendedRafterSection: string;
  recommendedRafterStepMm: number;
}

export interface FoundationCheckResult {
  totalBuildingMassTons: number;
  snowMassTons: number;
  totalLoadWithSnowTons: number;
  foundationSupportAreaSqm: number;
  actualPressureKpa: number;
  soilBearingR0Kpa: number;
  safetyMarginRatio: number;
  isSafe: boolean;
  warningMessage?: string;
}

export interface MaterialWallRecommendation {
  id: WallMaterialId;
  name: string;
  optimalThicknessSpec: string;
  thermalResistanceR: number;
  meetsNorm: boolean;
  notes: string;
}

export interface BOMItem {
  category: 'foundation' | 'walls' | 'roof' | 'fence';
  name: string;
  quantity: number;
  unit: string;
  unitPriceRub: number;
  priceKey?: keyof MaterialUnitPrices;
  estimatedCostRub: number;
  notes: string;
}

export interface BOMSummary {
  items: BOMItem[];
  unitPrices: MaterialUnitPrices;
  totalEstimatedCostRub: number;
  foundationConcreteM3: number;
  foundationRebarKg: number;
  wallBlocksM3: number;
  wallBlocksCount: number;
  roofCoverAreaWithWasteSqm: number;
  rafterTimberM3: number;
  fencePerimeterM: number;
  fencePostsCount: number;
}

export interface WindRoseSectorItem {
  dir: WindDirection8;
  labelRu: string;
  shortRu: string;
  azimuthDeg: number; // 0 = N, 45 = NE, 90 = E...
  plotAngleDeg: number; // Azimuth adjusted for plot.northAngle
  frequencyPercent: number;
  isPrevailing: boolean;
}

export interface BuildingWindLoadResult {
  objectId: string;
  objectName: string;
  buildingTotalHeightM: number;
  heightFactorKze: number; // k(z_e) по Табл. 11.2 СП 20.13330.2016 (тип местности B)
  gustFactorGf: number; // Коэффициент пульсации ветра (1 + ζ)
  windwardPressureKgM2: number; // Наветренное расчетное давление (кгс/м²)
  leewardSuctionKgM2: number; // Подветренный отсос (кгс/м²)
  roofUpliftPressureKgM2: number; // Ветровой отрыв/давление на кровлю (кгс/м²)
  windwardFacadeAreaSqm: number; // Наветренная площадь фасада (м²)
  totalHorizontalForceKn: number; // Суммарная горизонтальная ветровая нагрузка на здание (кН)
  totalHorizontalForceKgf: number; // Суммарная горизонтальная ветровая нагрузка (кгс)
  overturningMomentKnm: number; // Опрокидывающий ветровой момент (кН·м)
  mostLoadedFacadeLabel: string; // Наиболее нагруженный ветром фасад
  roofAnchorRecommendation: string; // Рекомендация по креплению мауэрлата и стропил от ветрового отрыва
}

export interface FenceWindLoadItem {
  edgeIndex: number;
  edgeLabel: string;
  borderType: BoundaryEdgeType;
  fenceType: FenceType;
  fenceHeightM: number;
  edgeLengthM: number;
  fillFactorPhi: number; // Коэффициент сплошности (1.0 для глухого профлиста, 0.25 для сетки/штакетника)
  aerodynamicCx: number; // Аэродинамический коэффициент лобового сопротивления c_x
  designWindPressureKgM2: number; // Расчетная ветровая нагрузка на 1 м² полотна забора (кгс/м²)
  forcePerPostKgf: number; // Ветровое усилие на 1 столб при шаге 2.5 м (кгс)
  bendingMomentPerPostKnm: number; // Изгибающий момент у основания столба M (кН·м)
  totalEdgeWindForceKn: number; // Суммарная ветровая нагрузка на всю сторону забора (кН)
  recommendedPostSpec: string; // Рекомендуемое сечение столба и шаг
  recommendedEmbedmentM: number; // Рекомендуемая глубина бетонирования столба (м)
  status: 'safe' | 'reinforced_required' | 'high_sail_warning';
  statusLabel: string;
}

export interface PlotWindAnalysis {
  regionId: string;
  regionName: string;
  windZone: WindZoneId;
  normCode: string; // "СП 20.13330.2016 Раздел 11 / СП 131.13330.2020"
  windPressureW0Pa: number;
  windPressureW0KgM2: number;
  designWindPressureW0KgM2: number; // с учетом коэф. надежности γ_f = 1.4
  avgWindSpeedMs: number;
  maxGustWindSpeedMs: number;
  prevailingWindDir: WindDirection8;
  prevailingWindLabel: string;
  prevailingPlotVector: Point2D; // Направление господствующего ветра в координатах участка (куда дует ветер)
  sectors: WindRoseSectorItem[];
  selectedBuildingWind: BuildingWindLoadResult;
  fences: FenceWindLoadItem[];
  maxFenceMomentKnm: number;
  summaryRecommendation: string;
}


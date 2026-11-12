import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateRoofGeometryMetrics,
  calculateRoofHeightFromAngle,
  calculateRoofAngleFromHeight,
  calculateSnowLoad,
  calculateFoundationBearing,
  validateSitePlan,
  calculatePolygonArea,
  generatePlotPolygon,
  getRequiredFireDistance,
  getLocalObjectFootprintPolygon,
  calculateInteriorSunPatches,
  getRoofSlopeVectorsLocal,
  parseFlexibleDecimal,
  roundToMm,
  formatMetersMm,
  resolveRegionFromCoordinates,
  getEffectivePlotRegion,
  calculateBaseFieldDimensions,
  generateLegalClaimDocument,
  calculateBuildingInteriorArea,
  calculateEnergyAndHeating,
  generateParameterRecommendations,
  calculateBuildingInsolationSanPin,
  calculateBuildingThermalHeatmap,
  getEffectiveAdjacentParcels,
  resolveObjectParcelId,
  getObjectDoorsConfig,
  isRoofedBuildingCategory,
  isEnclosedBuildingCategory,
  computeTotalAboveGroundWallHeight,
  getObjectFootprintCorners,
  calculatePlotReliefAndDrainage,
  calculateBillOfMaterials,
  DEFAULT_MATERIAL_UNIT_PRICES,
  getObjectCategoryCapabilities
} from './calculations';
import { buildSiteObject3DGroup, buildRoofOnlyGroup } from './roofGeometry3D';
import { buildMultiPageJpegPdfBytes } from './pdfReportGenerator';
import {
  PROMO_VIDEO_RESOLUTIONS,
  PROMO_VIDEO_SCENES,
  PROMO_VIDEO_TOTAL_DURATION_SEC,
  getPromoSceneAtTime,
  computeLivePromoSceneMetrics
} from './promoVideoScript';
import { buildValidIsoBmffMp4Bytes } from './mp4VideoExporter';
import {
  PlotConfig,
  SiteObject,
  RoofType,
  WindowConstructionTypeId,
  RoofInsulationTypeId,
  WallInsulationTypeId
} from '../types';
import * as THREE from 'three';

const mockHouse: SiteObject = {
  id: 'house-1',
  name: 'Жилой дом',
  category: 'house',
  x: 0,
  z: 0,
  width: 10,
  length: 10,
  wallHeight: 3.5,
  roofHeight: 2.5,
  overhang: 0.4,
  rotation: 0,
  roofType: 'gable',
  slopeDirection: 'south',
  material: 'stone',
  floors: 2,
  glazingRatio: 0.15,
  partitionLength: 24,
  wallMaterialId: 'aerated_concrete',
  roofCoverId: 'metal_tile',
  foundationTypeId: 'mzlf'
};

const mockPlot: PlotConfig = {
  preset: 'rectangle',
  width: 30,
  length: 40,
  trapezoidTopWidth: 20,
  lCutoutWidth: 10,
  lCutoutLength: 12,
  points: [],
  edges: [
    { edgeIndex: 0, type: 'street', fenceType: 'solid', fenceHeight: 2.0, hasNeighborConsent: false },
    { edgeIndex: 1, type: 'neighbor', fenceType: 'mesh', fenceHeight: 1.5, hasNeighborConsent: false },
    { edgeIndex: 2, type: 'neighbor', fenceType: 'mesh', fenceHeight: 1.5, hasNeighborConsent: false },
    { edgeIndex: 3, type: 'driveway', fenceType: 'solid', fenceHeight: 1.8, hasNeighborConsent: false }
  ],
  category: 'SNT',
  northAngle: 0,
  regionId: 'moscow',
  soilTypeId: 'loam',
  hasZouit: false,
  zouitEdgeIndex: 0,
  zouitDepth: 5
};

test('Plot polygon generation and area calculation', () => {
  const poly = generatePlotPolygon(mockPlot);
  assert.equal(poly.length, 4);
  const area = calculatePolygonArea(poly);
  assert.equal(area, 1200); // 30m * 40m = 1200 m² (12 соток)
});

test('Roof geometry formulas match specification for all 4 roof types', () => {
  // 1. Flat roof: S_roof = (L + 2*O)*(W + 2*O), alpha = 0, mu = 1.0
  const flatMetrics = calculateRoofGeometryMetrics({
    width: 10,
    length: 12,
    roofHeight: 0,
    overhang: 0.5,
    roofType: 'flat'
  });
  assert.equal(flatMetrics.roofAreaSqm, (12 + 1) * (10 + 1)); // 13 * 11 = 143
  assert.equal(flatMetrics.slopeAngleDeg, 0);
  assert.equal(flatMetrics.shapeFactorMu, 1.0);
  assert.equal(flatMetrics.overhangRuleTriggered, false);

  // 2. Shed roof: S_roof = (L + 2*O)*sqrt((W + 2*O)^2 + dH^2)
  const shedMetrics = calculateRoofGeometryMetrics({
    width: 8,
    length: 10,
    roofHeight: 2,
    overhang: 0.6, // > 0.5m triggers overhang rule!
    roofType: 'shed'
  });
  assert.equal(shedMetrics.overhangRuleTriggered, true);
  assert.equal(shedMetrics.effectiveFootprintWidth, 9.2);
  const expectedShedArea = (10 + 1.2) * Math.sqrt(Math.pow(8 + 1.2, 2) + Math.pow(2, 2));
  assert.equal(shedMetrics.roofAreaSqm, Number(expectedShedArea.toFixed(2)));

  // 3. Gable roof: S_roof = 2*(L + 2*O)*sqrt((W/2 + O)^2 + H_ridge^2)
  const gableMetrics = calculateRoofGeometryMetrics({
    width: 8,
    length: 10,
    roofHeight: 4, // H_ridge = 4, W/2 = 4 => alpha = 45° => mu = (60-45)/30 = 0.5
    overhang: 0.4,
    roofType: 'gable'
  });
  assert.equal(gableMetrics.slopeAngleDeg, 45);
  assert.equal(gableMetrics.shapeFactorMu, 0.5);

  // 4. Pyramid / Hip roof on square building (L = W = 10)
  const hipMetrics = calculateRoofGeometryMetrics({
    width: 10,
    length: 10,
    roofHeight: 3,
    overhang: 0.4,
    roofType: 'hip'
  });
  const expectedHipArea = 2 * (10 + 0.8) * Math.sqrt(Math.pow(5 + 0.4, 2) + Math.pow(3, 2));
  assert.equal(hipMetrics.roofAreaSqm, Number(expectedHipArea.toFixed(2)));
  assert.equal(hipMetrics.wasteFactor, 1.2);
});

test('Snow load calculation per СП 20.13330.2016', () => {
  // Moscow (Zone III, Sg = 150 kg/m²), Gable roof with alpha < 30° (mu = 1.0)
  // S = 150 * 1.0 * 1.4 = 210 kg/m²
  const snow = calculateSnowLoad(mockHouse, 'moscow');
  assert.equal(snow.snowZone, 3);
  assert.equal(snow.normativeSg, 150);
  assert.equal(snow.mu, 1.0);
  assert.equal(snow.designSnowLoadS, 210);
});

test('Fire safety distance matrix per СП 4.13130.2013', () => {
  assert.equal(getRequiredFireDistance('stone', 'stone'), 6);
  assert.equal(getRequiredFireDistance('stone', 'mixed'), 8);
  assert.equal(getRequiredFireDistance('stone', 'wood'), 10);
  assert.equal(getRequiredFireDistance('wood', 'wood'), 15);
});

test('Normative validation catches overhang trap, setback violation, and blind neighbor fence', () => {
  const houseNearEdge: SiteObject = {
    ...mockHouse,
    x: 7.5,
    overhang: 0.8
  };

  const plotWithBlindFence: PlotConfig = {
    ...mockPlot,
    edges: [
      mockPlot.edges[0],
      { edgeIndex: 1, type: 'neighbor', fenceType: 'solid', fenceHeight: 2.0, hasNeighborConsent: false },
      mockPlot.edges[2],
      mockPlot.edges[3]
    ]
  };

  const violations = validateSitePlan(plotWithBlindFence, [houseNearEdge]);
  assert.ok(violations.some((v) => v.id.startsWith('overhang-trap-')), 'Should flag overhang > 0.5m');
  assert.ok(violations.some((v) => v.id.startsWith('setback-')), 'Should flag house setback < 3m');
  assert.ok(violations.some((v) => v.id.startsWith('fence-edge-1')), 'Should flag solid fence on neighbor boundary in SNT');
});

test('Foundation bearing capacity check detects overload on weak peat soil', () => {
  const res = calculateFoundationBearing(mockHouse, 'perm', 'peat');
  assert.equal(res.isSafe, false);
  assert.ok(res.warningMessage && res.warningMessage.length > 0);
});

test('Building footprint shapes generate expected polygon vertex counts', () => {
  const rectPoly = getLocalObjectFootprintPolygon({ ...mockHouse, footprintShape: 'rectangle' });
  assert.equal(rectPoly.length, 4);

  const lPoly = getLocalObjectFootprintPolygon({ ...mockHouse, footprintShape: 'l_shape', wingWidth: 4, wingLength: 4 });
  assert.equal(lPoly.length, 6);

  const tPoly = getLocalObjectFootprintPolygon({ ...mockHouse, footprintShape: 't_shape', wingWidth: 4, wingLength: 3 });
  assert.equal(tPoly.length, 8);

  const chamPoly = getLocalObjectFootprintPolygon({ ...mockHouse, footprintShape: 'chamfered' });
  assert.equal(chamPoly.length, 8);
});

test('Interior sunlight patches (световое пятно) project through illuminated facade windows and respect size/offset', () => {
  const sunSE = { x: 20, y: 25, z: 25, altitudeDeg: 40 };
  const patches = calculateInteriorSunPatches(
    {
      ...mockHouse,
      windows: { south: 2, east: 1, west: 1, north: 1, windowWidth: 1.8, windowHeight: 1.6, sillHeight: 0.7, positionOffset: 0.2 }
    },
    sunSE
  );
  assert.equal(patches.length, 3);
  assert.equal(patches.filter((p) => p.facade === 'south').length, 2);
  assert.equal(patches.filter((p) => p.facade === 'east').length, 1);
  assert.equal(patches.filter((p) => p.facade === 'west').length, 0);
  const defaultPatches = calculateInteriorSunPatches(
    {
      ...mockHouse,
      windows: { south: 2, east: 1, west: 1, north: 1, windowWidth: 1.8, windowHeight: 1.6, sillHeight: 0.7, positionOffset: 0 }
    },
    sunSE
  );
  assert.ok(patches[0].windowCenterLocal.x > defaultPatches[0].windowCenterLocal.x);
});

test('Bathhouse shed roof sloping into yard (west) near back (north) or east boundary does NOT trigger false slope error', () => {
  const bathSlopingInward: SiteObject = {
    ...mockHouse,
    id: 'bath-1',
    name: 'Баня / Сауна',
    category: 'bathhouse',
    x: 11.8,
    z: -16.2,
    width: 4,
    length: 5,
    overhang: 0.4,
    roofType: 'shed',
    slopeDirection: 'west'
  };

  const vInward = validateSitePlan(mockPlot, [bathSlopingInward]);
  assert.equal(
    vInward.some((v) => v.id.startsWith('roof-slope-neighbor-')),
    false,
    'Should NOT flag roof slope when bathhouse slopes West into the yard'
  );

  const vTowardNorth = validateSitePlan(mockPlot, [{ ...bathSlopingInward, slopeDirection: 'north' }]);
  assert.equal(
    vTowardNorth.some((v) => v.id === 'roof-slope-neighbor-bath-1-edge-2'),
    true,
    'Should flag roof slope when bathhouse slopes North directly toward North neighbor at 1.3m'
  );
});

test('Roof slope vectors are generated for all 4 roof types (flat, shed, gable, hip)', () => {
  assert.equal(getRoofSlopeVectorsLocal({ roofType: 'flat', slopeDirection: 'south' }).length, 1);
  assert.equal(getRoofSlopeVectorsLocal({ roofType: 'shed', slopeDirection: 'west' }).length, 1);
  assert.equal(getRoofSlopeVectorsLocal({ roofType: 'gable', slopeDirection: 'south' }).length, 2);
  assert.equal(getRoofSlopeVectorsLocal({ roofType: 'hip', slopeDirection: 'south' }).length, 4);
});

test('Environment, utility, tree, and external neighbor violation rules', () => {
  const forestNearHouse: SiteObject = {
    ...mockHouse,
    id: 'forest-1',
    name: 'Лесной массив',
    category: 'forest',
    x: 0,
    z: -14,
    width: 10,
    length: 6
  };
  const gasPipeNearHouse: SiteObject = {
    ...mockHouse,
    id: 'gas-1',
    name: 'Газопровод',
    category: 'gas_pipe',
    x: 0,
    z: 7,
    width: 20,
    length: 1
  };
  const violatingNeighbor: SiteObject = {
    ...mockHouse,
    id: 'neighbor-bad',
    name: 'Дом соседа',
    category: 'neighbor_house',
    x: 19,
    z: 0,
    width: 8,
    length: 8
  };

  const violations = validateSitePlan(mockPlot, [mockHouse, forestNearHouse, gasPipeNearHouse, violatingNeighbor]);
  assert.ok(violations.some((v) => v.id.startsWith('forest-gap-')), 'Should flag house < 15m from forest');
  assert.ok(violations.some((v) => v.id.startsWith('gas-pipe-')), 'Should flag house < 4m from gas pipe');
  assert.ok(violations.some((v) => v.id.startsWith('neighbor-violation-setback-')), 'Should flag neighbor house < 3m from plot boundary');
});

test('1mm precision and layout-independent dot/comma decimal parsing', () => {
  assert.equal(parseFlexibleDecimal('9.125'), 9.125);
  assert.equal(parseFlexibleDecimal('9,125'), 9.125);
  assert.equal(parseFlexibleDecimal('9ю125'), 9.125); // Russian layout dot key
  assert.equal(parseFlexibleDecimal('12б005'), 12.005); // Russian layout comma key
  assert.equal(roundToMm(9.1254), 9.125);
  assert.equal(formatMetersMm(9.125), '9.125');
  assert.equal(formatMetersMm(10.0), '10');
});

test('Exact geolocation coordinate resolution determines nearest Russian region and climate zone', () => {
  const sochiRes = resolveRegionFromCoordinates(43.5855, 39.7231);
  assert.equal(sochiRes.nearestRegion.id, 'krasnodar');
  assert.equal(sochiRes.nearestRegion.snowZone, 2);

  const northRes = resolveRegionFromCoordinates(68.97, 33.07);
  assert.equal(northRes.nearestRegion.id, 'murmansk');
  assert.equal(northRes.nearestRegion.snowZone, 7);

  const eff = getEffectivePlotRegion({
    ...mockPlot,
    regionId: 'krasnodar',
    customLat: 43.5855,
    customLng: 39.7231
  });
  assert.equal(eff.id, 'krasnodar');
  assert.equal(eff.lat, 43.5855);
  assert.equal(eff.lng, 39.7231);
});

test('Roof slope angle regulation couples directly with roofHeight and snow load mu (СП 20.13330.2016)', () => {
  const h30 = calculateRoofHeightFromAngle(mockHouse, 30);
  assert.equal(h30, 2.887);
  const house30 = { ...mockHouse, roofHeight: h30 };
  assert.equal(calculateRoofAngleFromHeight(house30), 30);
  const snow30 = calculateSnowLoad(house30, 'moscow');
  assert.equal(snow30.mu, 1.0);
  assert.equal(snow30.designSnowLoadS, 210);

  const h45 = calculateRoofHeightFromAngle(mockHouse, 45);
  assert.equal(h45, 5);
  const house45 = { ...mockHouse, roofHeight: h45 };
  assert.equal(calculateRoofAngleFromHeight(house45), 45);
  const snow45 = calculateSnowLoad(house45, 'moscow');
  assert.equal(snow45.mu, 0.5);
  assert.equal(snow45.designSnowLoadS, 105);

  const h60 = calculateRoofHeightFromAngle(mockHouse, 60);
  assert.equal(h60, 8.66);
  const house60 = { ...mockHouse, roofHeight: h60 };
  const snow60 = calculateSnowLoad(house60, 'moscow');
  assert.equal(snow60.mu, 0);
  assert.equal(snow60.designSnowLoadS, 0);
});

test('Automatic base field expansion defaults to 4x plot width and length and auto-expands for distant objects', () => {
  const defaultField = calculateBaseFieldDimensions(mockPlot, [mockHouse]);
  assert.equal(defaultField.multiplier, 4);
  assert.equal(defaultField.fieldWidth, 120); // 30m * 4 = 120m
  assert.equal(defaultField.fieldLength, 160); // 40m * 4 = 160m
  assert.equal(defaultField.autoExpanded, false);

  const farForest: SiteObject = {
    ...mockHouse,
    id: 'far-forest',
    category: 'forest',
    x: 80,
    z: 0,
    width: 20,
    length: 20
  };
  const expandedField = calculateBaseFieldDimensions(mockPlot, [mockHouse, farForest]);
  assert.ok(expandedField.fieldWidth > 120, 'Base field should auto-expand beyond 4x when an object is placed far away');
  assert.equal(expandedField.autoExpanded, true);
});

test('Legal claim document generator supports all 3 statutory document modes (combined, elimination_demand, pretrial_claim)', () => {
  const violatingNeighbor: SiteObject = {
    ...mockHouse,
    id: 'neighbor-bad',
    name: 'Дом соседа',
    category: 'neighbor_house',
    x: 19,
    z: 0,
    width: 8,
    length: 8
  };
  const violations = validateSitePlan(mockPlot, [mockHouse, violatingNeighbor]);
  const docCombined = generateLegalClaimDocument(mockPlot, [mockHouse, violatingNeighbor], violations, {
    docType: 'combined',
    claimantFullName: 'Иванов И.И.',
    respondentFullName: 'Петров П.П.',
    deadlineDays: 30
  });
  assert.ok(docCombined.includes('ДОСУДЕБНАЯ ПРЕТЕНЗИЯ В ПОРЯДКЕ СТ. 304 ГК РФ'));
  assert.ok(docCombined.includes('СП 53.13330.2019'));

  const docDemand = generateLegalClaimDocument(mockPlot, [mockHouse, violatingNeighbor], violations, {
    docType: 'elimination_demand',
    claimantFullName: 'Иванов И.И.',
    respondentFullName: 'Петров П.П.'
  });
  assert.ok(docDemand.includes('Т Р Е Б О В А Н И Е   О Б   У С Т Р А Н Е Н И И   Н А Р У Ш Е Н И Й'));

  const docPretrial = generateLegalClaimDocument(mockPlot, [mockHouse, violatingNeighbor], violations, {
    docType: 'pretrial_claim',
    claimantFullName: 'Иванов И.И.',
    respondentFullName: 'Петров П.П.'
  });
  assert.ok(docPretrial.includes('ДОСУДЕБНОЕ ТРЕБОВАНИЕ В ПОРЯДКЕ СТ. 304, 222, 263 ГК РФ'));
});

test('Net interior area inside building walls accounts for wall thickness, floors (1-3), and underground basement', () => {
  // 10m x 10m house with 0.40m wall thickness -> inner dimensions 9.2m x 9.2m = 84.64 m² per floor
  const house3FlBasement: SiteObject = {
    ...mockHouse,
    width: 10,
    length: 10,
    wallThickness: 0.4,
    floors: 3,
    hasBasement: true
  };
  const res = calculateBuildingInteriorArea(house3FlBasement);
  assert.equal(res.grossFootprintAreaSqm, 100);
  assert.equal(res.netInteriorSingleFloorSqm, 84.64); // (10 - 0.8) * (10 - 0.8) = 84.64
  assert.equal(res.aboveGroundFloors, 3);
  assert.equal(res.hasBasement, true);
  assert.equal(res.totalNetInteriorAllFloorsSqm, Number((84.64 * 4).toFixed(2)));
});

test('Energy efficiency class and heating cost calculator subtracts window area from wall area and respects manual tariffs', () => {
  const houseEnergy: SiteObject = {
    ...mockHouse,
    width: 10,
    length: 10,
    floors: 2,
    floorHeight: 2.8,
    hasBasement: false,
    windows: {
      south: 2,
      north: 1,
      east: 1,
      west: 1,
      windowWidth: 1.5,
      windowHeight: 1.5,
      sillHeight: 0.9
    }
  };
  const plotCustomTariffs: PlotConfig = {
    ...mockPlot,
    heatingTariffs: {
      electricityRubPerKwh: 10.0,
      gasRubPerM3: 8.0,
      firewoodRubPerM3: 4000
    }
  };
  const energy = calculateEnergyAndHeating(houseEnergy, plotCustomTariffs);
  // 5 windows per floor * 2 floors * (1.5 * 1.5) = 10 * 2.25 = 22.5 m² window area
  assert.equal(energy.windowAreaSqm, 22.5);
  assert.equal(energy.netWallAreaSqm, Number((energy.grossWallAreaSqm - energy.windowAreaSqm).toFixed(2)));
  assert.ok(['A++', 'A+', 'A', 'B', 'C', 'D', 'E'].includes(energy.energyClass));
  assert.equal(energy.electricity.annualCostRub, Math.round(energy.electricity.annualConsumptionKwh * 10.0));
});

test('Automated room insolation analysis (СанПиН 1.2.3685-21) checks facade continuous hours and latitude zone', () => {
  // Moscow (55.75°N) -> Central zone (48°–58°N) -> requires >= 2.0h continuous insolation
  const moscowIns = calculateBuildingInsolationSanPin(mockHouse, mockPlot, [mockHouse], 110);
  assert.equal(moscowIns.requiredContinuousHours, 2.0);
  assert.equal(moscowIns.overallCompliant, true);
  const southFac = moscowIns.facades.find((f) => f.facade === 'south');
  assert.ok(southFac && southFac.maxContinuousHours >= 2.0, 'South facade in Moscow should receive >= 2.0h continuous sun');

  // House with windows only on the North facade should fail СанПиН
  const northOnlyHouse: SiteObject = {
    ...mockHouse,
    windows: { south: 0, east: 0, west: 0, north: 2, windowWidth: 1.4, windowHeight: 1.4, sillHeight: 0.9 }
  };
  const northIns = calculateBuildingInsolationSanPin(northOnlyHouse, mockPlot, [northOnlyHouse], 110);
  assert.equal(northIns.overallCompliant, false);
});

test('3D facade thermal heatmap analysis computes higher specific heat flux on heavily glazed facades and uninsulated timber', () => {
  const houseAsymmetricGlazing: SiteObject = {
    ...mockHouse,
    wallMaterialId: 'timber',
    windows: { south: 4, north: 0, east: 1, west: 1, windowWidth: 2.0, windowHeight: 1.8, sillHeight: 0.8 }
  };
  const thermal = calculateBuildingThermalHeatmap(houseAsymmetricGlazing, mockPlot);
  const southThermal = thermal.facades.find((f) => f.facade === 'south')!;
  const northThermal = thermal.facades.find((f) => f.facade === 'north')!;
  assert.ok(southThermal.glazingPercent > northThermal.glazingPercent);
  assert.ok(southThermal.effectiveFacadeHeatFluxWm2 > northThermal.effectiveFacadeHeatFluxWm2);
});

test('Parameter recommendations flag non-optimal floor height, slab thickness, plinth height, and shallow utility burial depth', () => {
  const badHouse: SiteObject = {
    ...mockHouse,
    floorHeight: 2.2,
    interfloorSlabThickness: 0.12,
    plinthHeight: 0.15,
    hasBasement: true,
    basementDepth: 1.7
  };
  const shallowWaterMain: SiteObject = {
    ...mockHouse,
    id: 'water-1',
    name: 'Водопровод',
    category: 'water_main',
    burialDepth: 0.6 // Moscow frost depth is 1.4m -> too shallow!
  };
  const recs = generateParameterRecommendations(badHouse, mockPlot, [badHouse, shallowWaterMain]);
  assert.ok(recs.some((r) => r.id === 'rec-floor-height-low'));
  assert.ok(recs.some((r) => r.id === 'rec-interfloor-thin'));
  assert.ok(recs.some((r) => r.id === 'rec-plinth-low'));
  assert.ok(recs.some((r) => r.id === 'rec-basement-shallow'));
  assert.ok(recs.some((r) => r.id.startsWith('rec-utility-water-')));
});

test('Adjacent parcels and resolveObjectParcelId separate neighbor houses from main plot buildings', () => {
  const parcels = getEffectiveAdjacentParcels(mockPlot);
  assert.ok(parcels.length >= 4);
  const mainHouseParcel = resolveObjectParcelId({ ...mockHouse, x: 0, z: 0 }, mockPlot);
  assert.equal(mainHouseParcel, 'main_plot');

  const neighborEastHouse: SiteObject = {
    ...mockHouse,
    id: 'neighbor-east',
    category: 'neighbor_house',
    x: 22,
    z: 0
  };
  const resolvedNeighbor = resolveObjectParcelId(neighborEastHouse, mockPlot);
  assert.equal(resolvedNeighbor, 'parcel-neighbor-east');
});

test('Well (Скважина) and non-house objects support rotation, overhang (>0.5m), wallHeight, roofHeight, and roofType in 3D and 2D', () => {
  assert.equal(isRoofedBuildingCategory('well'), true);
  assert.equal(isRoofedBuildingCategory('neighbor_well'), true);
  assert.equal(isEnclosedBuildingCategory('well'), false);
  assert.equal(isEnclosedBuildingCategory('bathhouse'), true);

  const wellObj: SiteObject = {
    ...mockHouse,
    id: 'well-test',
    name: 'Скважина',
    category: 'well',
    width: 1.8,
    length: 2.2,
    wallHeight: 1.6,
    roofHeight: 0.9,
    overhang: 0.75, // > 0.5m triggers overhang projection
    rotation: 65,
    roofType: 'hip',
    burialDepth: 4.0
  };

  assert.equal(computeTotalAboveGroundWallHeight(wellObj), 1.6);

  // Check effective footprint expansion when overhang > 0.5m on well
  const wallCorners = getObjectFootprintCorners(wellObj, false);
  const effCorners = getObjectFootprintCorners(wellObj, true);
  const distWall0 = Math.hypot(wallCorners[0].x - wellObj.x, wallCorners[0].z - wellObj.z);
  const distEff0 = Math.hypot(effCorners[0].x - wellObj.x, effCorners[0].z - wellObj.z);
  assert.ok(distEff0 > distWall0 + 0.7, 'Well overhang > 0.5m should expand effective footprint corners');

  // Check 3D group rotation and canopy generation for well
  const group3D = buildSiteObject3DGroup(wellObj, true, false, false, false);
  const expectedRotY = -(65 * Math.PI) / 180;
  assert.ok(Math.abs(group3D.rotation.y - expectedRotY) < 1e-6, 'Well 3D group must rotate by -(rotation * PI)/180');
  assert.ok(group3D.children.length >= 4, 'Well 3D group should include concrete ring, posts, roof canopy, overhang projection, and selection halo');

  // Check tree_tall rotation and height scaling in 3D
  const treeObj: SiteObject = {
    ...mockHouse,
    id: 'tree-test',
    name: 'Дерево',
    category: 'tree_tall',
    width: 3.0,
    length: 2.0,
    wallHeight: 8.0,
    roofHeight: 1.5,
    overhang: 0.5,
    rotation: 120
  };
  const treeGroup = buildSiteObject3DGroup(treeObj, false, false, false, false);
  assert.ok(Math.abs(treeGroup.rotation.y - (-(120 * Math.PI) / 180)) < 1e-6, 'Tree 3D group must rotate');
});

test('Doors configuration and 3D door cutouts/leafs work across all 4 facades and alongside 1, 2, or 3 windows', () => {
  const houseWithDoors: SiteObject = {
    ...mockHouse,
    width: 9,
    length: 10,
    wallHeight: 5.85,
    floors: 2,
    floorHeight: 2.8,
    windows: {
      south: 3, // Even with 3 windows on south facade, door must NOT disappear!
      north: 1, // Even with 1 window on north facade, door must NOT disappear!
      east: 2,
      west: 0,
      windowWidth: 1.4,
      windowHeight: 1.4,
      sillHeight: 0.9,
      positionOffset: 0.15
    },
    doors: {
      south: 1,
      north: 1,
      east: 2,
      west: 1,
      doorWidth: 1.05,
      doorHeight: 2.15,
      thresholdHeight: 0.06,
      positionOffset: -0.1,
      hasGlazing: true
    }
  };

  const doorCfg = getObjectDoorsConfig(houseWithDoors);
  assert.equal(doorCfg.south, 1);
  assert.equal(doorCfg.east, 2);
  assert.equal(doorCfg.doorWidth, 1.05);
  assert.equal(doorCfg.doorHeight, 2.15);
  assert.equal(doorCfg.hasGlazing, true);

  const group3D = buildSiteObject3DGroup(houseWithDoors, false, false, false, false);
  let doorLeafCount = 0;
  let doorGlazingCount = 0;
  group3D.traverse((child) => {
    if (child.userData?.isDoor) doorLeafCount++;
    if (child.userData?.isDoorGlazing) doorGlazingCount++;
  });

  // Total doors requested: south(1) + north(1) + east(2) + west(1) = 5 doors
  assert.equal(doorLeafCount, 5, 'All 5 doors across all 4 facades must be rendered in 3D even with 1 or 3 windows');
  assert.equal(doorGlazingCount, 5, 'All 5 glazed doors should include 3D glass inserts');

  // Verify glazed door casts interior sunlight patch when facade has 0 windows
  const westDoorOnlyObj: SiteObject = {
    ...mockHouse,
    windows: { south: 0, north: 0, east: 0, west: 0 },
    doors: {
      south: 0,
      north: 0,
      east: 0,
      west: 1,
      doorWidth: 1.1,
      doorHeight: 2.1,
      thresholdHeight: 0.05,
      positionOffset: 0,
      hasGlazing: true
    }
  };
  const patches = calculateInteriorSunPatches(westDoorOnlyObj, { x: -30, y: 20, z: 0, altitudeDeg: 35 });
  assert.equal(patches.length, 1, 'Glazed door on West facade should cast an interior sunlight patch when sun is in the West');
});

test('3D walls, gable/shed pediments, and interfloor slabs NEVER poke through the roof across all roof types and floor configurations', () => {
  const roofTypes: RoofType[] = ['flat', 'shed', 'gable', 'hip'];
  const floorConfigs = [
    { floors: 1, wallHeight: 3.2, floorHeight: undefined },
    { floors: 2, wallHeight: 6.2, floorHeight: undefined }, // Default 2-story house where floorHeight is undefined!
    { floors: 2, wallHeight: 6.0, floorHeight: 2.85 },
    { floors: 3, wallHeight: 9.1, floorHeight: 2.85 }
  ];

  for (const roofType of roofTypes) {
    for (const cfg of floorConfigs) {
      const testObj: SiteObject = {
        ...mockHouse,
        width: 9,
        length: 11,
        roofType,
        floors: cfg.floors,
        wallHeight: cfg.wallHeight,
        floorHeight: cfg.floorHeight,
        roofHeight: roofType === 'flat' ? 0.2 : 2.4,
        overhang: 0.5,
        plinthHeight: 0.45
      };

      const bodyH = computeTotalAboveGroundWallHeight(testObj);
      const plinthH = testObj.plinthHeight ?? 0.45;
      const expectedWallTopWorldY = plinthH + bodyH;

      // 1. Check buildSiteObject3DGroup walls and interfloor slabs do not exceed plinthH + bodyH
      const group = buildSiteObject3DGroup(testObj, false, false, false, false);
      group.updateMatrixWorld(true);

      group.traverse((child) => {
        if (child instanceof THREE.Mesh && (child.userData?.isBuildingWall || child.userData?.isInterfloorSlab)) {
          const box = new THREE.Box3().setFromObject(child);
          assert.ok(
            box.max.y <= expectedWallTopWorldY + 1e-4,
            `Wall/slab mesh max.y (${box.max.y}) must not exceed wall top Y (${expectedWallTopWorldY}) for roofType=${roofType}, floors=${cfg.floors}`
          );
        }
      });

      // 2. Check buildRoofOnlyGroup sits strictly above H_wall at the eaves and ridge
      const roofGroup = buildRoofOnlyGroup(
        testObj.width,
        testObj.length,
        bodyH,
        testObj.roofHeight,
        testObj.overhang,
        testObj.roofType,
        testObj.slopeDirection,
        0x991b1b,
        new THREE.MeshStandardMaterial()
      );
      roofGroup.updateMatrixWorld(true);
      const roofBox = new THREE.Box3().setFromObject(roofGroup);

      assert.ok(
        roofBox.min.y >= bodyH - 0.35, // Overhang eave drops below H_wall outside the wall perimeter
        `Roof min.y (${roofBox.min.y}) must be valid for roofType=${roofType}`
      );
      assert.ok(
        roofBox.max.y > bodyH + 0.05,
        `Roof max.y (${roofBox.max.y}) must sit strictly above H_wall (${bodyH}) for roofType=${roofType}`
      );
    }
  }
});

test('Window types (wooden 1/2 glass, PVC 1/2 chamber), roof insulation devices, and wall insulation variants accurately compute heat losses and 3D panes', () => {
  const windowOrder: WindowConstructionTypeId[] = [
    'wood_single_glass',
    'wood_double_glass',
    'pvc_single_chamber',
    'pvc_double_chamber'
  ];

  const windowLosses: number[] = [];
  for (const winTypeId of windowOrder) {
    const objWin: SiteObject = {
      ...mockHouse,
      floors: 1,
      windows: {
        south: 2,
        east: 1,
        west: 1,
        north: 1,
        windowWidth: 1.4,
        windowHeight: 1.4,
        sillHeight: 0.9,
        windowTypeId: winTypeId
      }
    };
    const res = calculateEnergyAndHeating(objWin, mockPlot);
    assert.equal(res.windowTypeId, winTypeId);
    windowLosses.push(res.annualHeatLossWindowsKwh);

    // Check 3D glass pane count matches window type (1, 2, 2, 3 panes per window)
    const group3D = buildSiteObject3DGroup(objWin, false, false, false, false);
    let glassPanes = 0;
    group3D.traverse((c) => {
      if (c.userData?.isWindowGlass) glassPanes++;
    });
    const totalWindows = 5; // 1 floor * 5 windows
    const expectedPanesPerWindow =
      winTypeId === 'wood_single_glass' ? 1 : winTypeId === 'pvc_double_chamber' ? 3 : 2;
    assert.equal(
      glassPanes,
      totalWindows * expectedPanesPerWindow,
      `Window type ${winTypeId} should render ${expectedPanesPerWindow} glass panes per window in 3D`
    );
  }

  // Heat loss through windows must strictly decrease as glazing improves:
  // wood_single_glass > wood_double_glass > pvc_single_chamber > pvc_double_chamber
  assert.ok(windowLosses[0] > windowLosses[1], 'Wooden 1-glass must lose more heat than wooden 2-glass');
  assert.ok(windowLosses[1] > windowLosses[2], 'Wooden 2-glass must lose more heat than PVC single-chamber');
  assert.ok(windowLosses[2] > windowLosses[3], 'PVC single-chamber must lose more heat than PVC double-chamber');

  // Check Roof Insulation Devices ordered by increasing R:
  // none (R=0.35) -> mineral_wool_150 (R=3.65) -> mineral_wool_200_50 (R=5.45) -> ecowool_250 (R=5.80) -> pir_puf_150 (R=6.40)
  const roofInsOrder: RoofInsulationTypeId[] = [
    'none',
    'mineral_wool_150',
    'mineral_wool_200_50',
    'ecowool_250',
    'pir_puf_150'
  ];
  const roofLosses: number[] = [];
  for (const roofInsId of roofInsOrder) {
    const objRoof: SiteObject = {
      ...mockHouse,
      roofInsulationId: roofInsId
    };
    const res = calculateEnergyAndHeating(objRoof, mockPlot);
    assert.equal(res.roofInsulationId, roofInsId);
    roofLosses.push(res.annualHeatLossRoofKwh);
  }
  assert.ok(roofLosses[0] > roofLosses[1], 'Uninsulated roof must lose much more heat than 150mm mineral wool');
  assert.ok(roofLosses[1] > roofLosses[2], '150mm mineral wool (R=3.65) must lose more heat than 200+50mm mineral wool (R=5.45)');
  assert.ok(roofLosses[2] > roofLosses[3], '200+50mm mineral wool (R=5.45) must lose more heat than Ecowool 250mm (R=5.80)');
  assert.ok(roofLosses[3] > roofLosses[4], 'Ecowool 250mm (R=5.80) must lose more heat than PIR 160mm (R=6.40)');

  // Check Wall Insulation Options: none > mineral_wool_50 > mineral_wool_100 > mineral_wool_150
  const wallInsOrder: WallInsulationTypeId[] = [
    'none',
    'mineral_wool_50',
    'mineral_wool_100',
    'mineral_wool_150'
  ];
  const wallLosses: number[] = [];
  for (const wallInsId of wallInsOrder) {
    const objWall: SiteObject = {
      ...mockHouse,
      wallMaterialId: 'ceramic_block',
      wallInsulationId: wallInsId
    };
    const res = calculateEnergyAndHeating(objWall, mockPlot);
    assert.equal(res.wallInsulationId, wallInsId);
    wallLosses.push(res.annualHeatLossWallsKwh);
  }
  assert.ok(wallLosses[0] > wallLosses[1], 'Uninsulated brick wall must lose more heat than +50mm wool');
  assert.ok(wallLosses[1] > wallLosses[2], '+50mm wool must lose more heat than +100mm wool');
  assert.ok(wallLosses[2] > wallLosses[3], '+100mm wool must lose more heat than +150mm wool');
});

test('Plot surface slope and stormwater drainage zone calculation (СП 42.13330 / СП 32.13330)', () => {
  // 1. Default optimal slope (NW=145.60, SE=144.40 on 30x40m plot)
  const defaultRelief = calculatePlotReliefAndDrainage(mockPlot, [mockHouse]);
  assert.equal(defaultRelief.maxElevationM, 145.6);
  assert.equal(defaultRelief.minElevationM, 144.4);
  assert.equal(defaultRelief.elevationDeltaM, 1.2);
  assert.ok(defaultRelief.slopePercent >= 1.5 && defaultRelief.slopePercent <= 3.5);
  assert.equal(defaultRelief.normativeCategory, 'optimal');
  assert.equal(defaultRelief.drainageZones.length, 3);
  assert.deepEqual(
    defaultRelief.drainageZones.map((z) => z.type),
    ['interceptor_trench', 'runoff_channel', 'collector_well']
  );

  // 2. Flat stagnant plot (< 0.5% slope)
  const flatPlot: PlotConfig = {
    ...mockPlot,
    relief: {
      elevationNW: 150.0,
      elevationNE: 150.02,
      elevationSW: 150.0,
      elevationSE: 150.01,
      showDrainageZones: true
    }
  };
  const flatRelief = calculatePlotReliefAndDrainage(flatPlot, [mockHouse]);
  assert.equal(flatRelief.normativeCategory, 'flat_stagnant');
  assert.ok(flatRelief.slopePercent < 0.5);

  // 3. Steep slope requiring terracing (> 8% slope)
  const steepPlot: PlotConfig = {
    ...mockPlot,
    relief: {
      elevationNW: 165.0,
      elevationNE: 164.0,
      elevationSW: 161.0,
      elevationSE: 159.5,
      showDrainageZones: true
    }
  };
  const steepRelief = calculatePlotReliefAndDrainage(steepPlot, [mockHouse]);
  assert.equal(steepRelief.normativeCategory, 'steep_terracing');
  assert.ok(steepRelief.slopePercent > 8.0);
});

test('Bill of Materials dynamically recalculates costs based on custom market unit prices for each material', () => {
  const baseBom = calculateBillOfMaterials(mockPlot, [mockHouse], DEFAULT_MATERIAL_UNIT_PRICES);
  assert.ok(baseBom.totalEstimatedCostRub > 0);

  // Double the price of aerated concrete and metal tile
  const customPrices = {
    ...DEFAULT_MATERIAL_UNIT_PRICES,
    aeratedConcreteRubPerM3: DEFAULT_MATERIAL_UNIT_PRICES.aeratedConcreteRubPerM3 * 2,
    metalTileRubPerSqm: DEFAULT_MATERIAL_UNIT_PRICES.metalTileRubPerSqm * 2
  };
  const customBom = calculateBillOfMaterials(mockPlot, [mockHouse], customPrices);
  assert.ok(
    customBom.totalEstimatedCostRub > baseBom.totalEstimatedCostRub,
    'Custom higher market unit prices must increase total BOM cost'
  );

  const wallBlockItemBase = baseBom.items.find((i) => i.priceKey === 'aeratedConcreteRubPerM3');
  const wallBlockItemCustom = customBom.items.find((i) => i.priceKey === 'aeratedConcreteRubPerM3');
  assert.ok(wallBlockItemBase && wallBlockItemCustom);
  assert.equal(wallBlockItemCustom.estimatedCostRub, wallBlockItemBase.estimatedCostRub * 2);
});

test('Strict object capabilities ensure each object category exposes only its inherent properties', () => {
  // Pipeline: water_main
  const waterCaps = getObjectCategoryCapabilities('water_main');
  assert.equal(waterCaps.hasBurialDepth, true);
  assert.equal(waterCaps.hasPipelineDiameter, true);
  assert.equal(waterCaps.hasRoofOverhang, false);
  assert.equal(waterCaps.hasRoofGeometry, false);
  assert.equal(waterCaps.hasRoofInsulation, false);
  assert.equal(waterCaps.hasWallInsulation, false);
  assert.equal(waterCaps.hasPlanFootprintShape, false);
  assert.equal(waterCaps.hasWindows, false);
  assert.equal(waterCaps.hasDoors, false);
  assert.equal(waterCaps.heightLabel, null);

  // Well: well
  const wellCaps = getObjectCategoryCapabilities('well');
  assert.equal(wellCaps.hasBurialDepth, true);
  assert.equal(wellCaps.hasPipelineDiameter, false);
  assert.equal(wellCaps.hasRoofOverhang, false);
  assert.equal(wellCaps.hasRoofGeometry, false);
  assert.equal(wellCaps.hasRoofInsulation, false);
  assert.equal(wellCaps.hasWindows, false);

  // Tree: tree_tall
  const treeCaps = getObjectCategoryCapabilities('tree_tall');
  assert.equal(treeCaps.hasBurialDepth, false);
  assert.equal(treeCaps.hasRoofOverhang, false);
  assert.equal(treeCaps.hasRoofGeometry, false);
  assert.equal(treeCaps.hasPlanFootprintShape, false);
  assert.ok(treeCaps.heightLabel?.includes('дерева'));

  // Main House: house
  const houseCaps = getObjectCategoryCapabilities('house');
  assert.equal(houseCaps.hasRoofOverhang, true);
  assert.equal(houseCaps.hasRoofGeometry, true);
  assert.equal(houseCaps.hasRoofInsulation, true);
  assert.equal(houseCaps.hasWallInsulation, true);
  assert.equal(houseCaps.hasPlanFootprintShape, true);
  assert.equal(houseCaps.hasMultiStoryAndBasement, true);
  assert.equal(houseCaps.hasWindows, true);
  assert.equal(houseCaps.hasDoors, true);
  assert.equal(houseCaps.hasPipelineDiameter, false);
  assert.equal(houseCaps.hasBurialDepth, false);
});

test('Interfloor slab and floor slab on 2-story neighbor house are strictly inset inside exterior walls with zero ceiling gap (no blue stripe artifact)', () => {
  const neighborHouse: SiteObject = {
    ...mockHouse,
    id: 'neighbor-house-east',
    name: 'Дом соседа',
    category: 'neighbor_house',
    width: 8,
    length: 9,
    wallHeight: 6.2,
    roofHeight: 2.2,
    overhang: 0.45,
    floors: 2,
    roofType: 'hip'
  };

  const group = buildSiteObject3DGroup(neighborHouse, false, false, false, false);
  group.updateMatrixWorld(true);

  const wallMeshThick = 0.11;
  const maxAllowedHalfX = neighborHouse.width / 2 - wallMeshThick;
  const maxAllowedHalfZ = neighborHouse.length / 2 - wallMeshThick;

  let interSlabFound = false;
  group.traverse((child) => {
    if (
      child instanceof THREE.Mesh &&
      (child.userData?.isInterfloorSlab || child.name === 'interior-floor-slab')
    ) {
      if (child.userData?.isInterfloorSlab) interSlabFound = true;
      const box = new THREE.Box3().setFromObject(child);
      assert.ok(
        box.max.x < maxAllowedHalfX && box.min.x > -maxAllowedHalfX,
        `Slab ${child.name} X extent (${box.min.x}..${box.max.x}) must sit strictly inside inner wall face (±${maxAllowedHalfX}) so it never shines through exterior walls`
      );
      assert.ok(
        box.max.z < maxAllowedHalfZ && box.min.z > -maxAllowedHalfZ,
        `Slab ${child.name} Z extent (${box.min.z}..${box.max.z}) must sit strictly inside inner wall face (±${maxAllowedHalfZ})`
      );
    }
  });
  assert.ok(interSlabFound, '2-story neighbor house must contain an interfloor slab');
});

test('Multi-page binary PDF generator produces valid %PDF-1.4 document with 2 pages and %%EOF', () => {
  const dummyJpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0xff, 0xd9]);
  const pdfBytes = buildMultiPageJpegPdfBytes([
    { jpegBytes: dummyJpeg, pixelWidth: 1240, pixelHeight: 1754 },
    { jpegBytes: dummyJpeg, pixelWidth: 1240, pixelHeight: 1754 }
  ]);
  const text = new TextDecoder('latin1').decode(pdfBytes);
  assert.ok(text.startsWith('%PDF-1.4'), 'PDF must start with %PDF-1.4 header');
  assert.ok(text.includes('/Type /Pages /Kids [ 3 0 R 6 0 R ] /Count 2'), 'PDF must contain 2 pages');
  assert.ok(text.trimEnd().endsWith('%%EOF'), 'PDF must end with %%EOF');
});

test('Code-generated promotional video script has 8 contiguous scenes with explanatory plaques and live metrics', () => {
  assert.equal(PROMO_VIDEO_SCENES.length, 8);
  assert.equal(PROMO_VIDEO_TOTAL_DURATION_SEC, 64);

  let expectedStart = 0;
  for (const scene of PROMO_VIDEO_SCENES) {
    assert.equal(scene.startSec, expectedStart);
    assert.equal(scene.endSec, scene.startSec + scene.durationSec);
    assert.ok(scene.whatHappensOnScreen.length > 40, `Scene ${scene.id} must have detailed 'whatHappensOnScreen' plaque`);
    assert.ok(scene.whyItIsDone.length > 40, `Scene ${scene.id} must have detailed 'whyItIsDone' plaque`);
    assert.ok(scene.normativeCode.length > 5, `Scene ${scene.id} must reference Russian normative codes`);

    const metrics = computeLivePromoSceneMetrics(scene, mockPlot, [mockHouse], 2);
    assert.equal(metrics.length, 3, `Scene ${scene.id} must compute 3 live telemetry pills`);
    expectedStart = scene.endSec;
  }
  assert.equal(expectedStart, PROMO_VIDEO_TOTAL_DURATION_SEC);

  const atStart = getPromoSceneAtTime(0);
  assert.equal(atStart.scene.index, 1);
  assert.equal(atStart.sceneLocalProgress01, 0);

  const atMiddle = getPromoSceneAtTime(20);
  assert.equal(atMiddle.scene.index, 3);
  assert.equal(atMiddle.scene.visualFocus, 'sun_insolation_xray');
  assert.equal(atMiddle.sceneLocalProgress01, 0.5);

  const atEnd = getPromoSceneAtTime(63.9);
  assert.equal(atEnd.scene.index, 8);
  assert.ok(atEnd.overallProgress01 > 0.99);

  // Verify Full HD (1920x1080), 2K (2560x1440), and 4K (3840x2160) 16:9 resolutions and MP4 container export
  for (const resId of ['1080p', '1440p', '2160p'] as const) {
    const spec = PROMO_VIDEO_RESOLUTIONS[resId];
    assert.equal(spec.aspectRatio, '16:9');
    assert.ok(Math.abs(spec.width / spec.height - 16 / 9) < 1e-6, `Resolution ${resId} must be exact 16:9`);

    const mp4Bytes = buildValidIsoBmffMp4Bytes({
      width: spec.width,
      height: spec.height,
      durationSec: PROMO_VIDEO_TOTAL_DURATION_SEC,
      fps: 30,
      frameSamples: [new Uint8Array([0xff, 0xd8, 0xff, 0xd9])]
    });
    const ascii = new TextDecoder('latin1').decode(mp4Bytes);
    assert.ok(ascii.includes('ftypmp42'), `MP4 for ${resId} must start with ftypmp42 box`);
    assert.ok(ascii.includes('moov') && ascii.includes('trak') && ascii.includes('avc1') && ascii.includes('mdat'), `MP4 for ${resId} must contain moov, trak, avc1, and mdat boxes`);
  }
});




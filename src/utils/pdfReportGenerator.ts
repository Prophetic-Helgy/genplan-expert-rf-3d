import { PlotConfig, SiteObject, NormViolation } from '../types';
import {
  calculateSnowLoad,
  calculateFoundationBearing,
  calculateEnergyAndHeating,
  calculateBuildingInsolationSanPin,
  calculateBillOfMaterials,
  calculatePlotReliefAndDrainage,
  calculateBuildingInteriorArea,
  getObjectCategoryCapabilities,
  getEffectivePlotRegion,
  getDefaultBurialDepth,
  getDefaultPipelineDiameterMm
} from './calculations';
import { BUILDING_CATEGORY_LABELS, SOILS_DB } from '../data/regions';

/**
 * Pure helper that builds a valid binary multi-page PDF (%PDF-1.4) from an array of JPEG byte arrays.
 * Each page is A4 portrait (595.28 x 841.89 pt) with the rendered high-DPI canvas image drawn full-bleed.
 */
export function buildMultiPageJpegPdfBytes(
  pages: Array<{ jpegBytes: Uint8Array; pixelWidth: number; pixelHeight: number }>
): Uint8Array {
  const encoder = new TextEncoder();
  const chunks: Uint8Array[] = [];
  let offset = 0;

  const pushString = (str: string) => {
    const bytes = encoder.encode(str);
    chunks.push(bytes);
    offset += bytes.length;
  };

  const pushBytes = (bytes: Uint8Array) => {
    chunks.push(bytes);
    offset += bytes.length;
  };

  const totalObjects = 2 + pages.length * 3;
  const objOffsets: number[] = new Array(totalObjects + 1).fill(0);

  pushString('%PDF-1.4\n%\xFF\xFF\xFF\xFF\n');

  // 1: Catalog
  objOffsets[1] = offset;
  pushString('1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n');

  // 2: Pages
  const kidsRefs = pages.map((_, i) => `${3 + i * 3} 0 R`).join(' ');
  objOffsets[2] = offset;
  pushString(`2 0 obj\n<< /Type /Pages /Kids [ ${kidsRefs} ] /Count ${pages.length} >>\nendobj\n`);

  const pageWidthPt = 595.28;
  const pageHeightPt = 841.89;

  pages.forEach((page, i) => {
    const pageObjId = 3 + i * 3;
    const contentObjId = 4 + i * 3;
    const imageObjId = 5 + i * 3;
    const imgName = `/Im${i + 1}`;

    objOffsets[pageObjId] = offset;
    pushString(
      `${pageObjId} 0 obj\n` +
        `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidthPt.toFixed(2)} ${pageHeightPt.toFixed(2)}] ` +
        `/Resources << /XObject << ${imgName} ${imageObjId} 0 R >> >> /Contents ${contentObjId} 0 R >>\n` +
        `endobj\n`
    );

    const contentStream = `q\n${pageWidthPt.toFixed(2)} 0 0 ${pageHeightPt.toFixed(2)} 0 0 cm\n${imgName} Do\nQ\n`;
    const contentBytes = encoder.encode(contentStream);
    objOffsets[contentObjId] = offset;
    pushString(`${contentObjId} 0 obj\n<< /Length ${contentBytes.length} >>\nstream\n`);
    pushBytes(contentBytes);
    pushString('\nendstream\nendobj\n');

    objOffsets[imageObjId] = offset;
    pushString(
      `${imageObjId} 0 obj\n` +
        `<< /Type /XObject /Subtype /Image /Width ${page.pixelWidth} /Height ${page.pixelHeight} ` +
        `/ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${page.jpegBytes.length} >>\n` +
        `stream\n`
    );
    pushBytes(page.jpegBytes);
    pushString('\nendstream\nendobj\n');
  });

  const xrefOffset = offset;
  pushString(`xref\n0 ${totalObjects + 1}\n`);
  pushString('0000000000 65535 f \n');
  for (let id = 1; id <= totalObjects; id++) {
    const offStr = String(objOffsets[id]).padStart(10, '0');
    pushString(`${offStr} 00000 n \n`);
  }

  pushString(
    `trailer\n<< /Size ${totalObjects + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`
  );

  const out = new Uint8Array(offset);
  let cursor = 0;
  for (const chunk of chunks) {
    out.set(chunk, cursor);
    cursor += chunk.length;
  }
  return out;
}

function dataUrlToUint8Array(dataUrl: string): Uint8Array {
  const base64Index = dataUrl.indexOf(';base64,');
  const base64 = base64Index >= 0 ? dataUrl.slice(base64Index + 8) : dataUrl;
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

/**
 * Generates a complete 2-page Urban Planning & Engineering Report PDF Blob (`application/pdf`).
 * Works 100% client-side with full Cyrillic typography using HTML5 Canvas rendered into `%PDF-1.4`.
 */
export async function generateUrbanPlanningPdfBlob(
  plot: PlotConfig,
  objects: SiteObject[],
  violations: NormViolation[],
  mapSnapshotDataUrl?: string | null,
  dayOfYear = 172
): Promise<Blob> {
  const W = 1240;
  const H = 1754; // A4 @ ~150 DPI

  const house = objects.find((o) => o.category === 'house') || objects[0];
  const region = getEffectivePlotRegion(plot);
  const soil = SOILS_DB[plot.soilTypeId] || SOILS_DB.loam;

  const snow = house ? calculateSnowLoad(house, plot.regionId) : null;
  const foundation = house ? calculateFoundationBearing(house, plot.regionId, plot.soilTypeId) : null;
  const energy = house ? calculateEnergyAndHeating(house, plot) : null;
  const insolation = house ? calculateBuildingInsolationSanPin(house, plot, objects, dayOfYear) : null;
  const bom = calculateBillOfMaterials(plot, objects);
  const relief = calculatePlotReliefAndDrainage(plot, objects);

  const createPageCanvas = () => {
    const canvas = document.createElement('canvas');
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, W, H);
    return { canvas, ctx };
  };

  // ==================== PAGE 1: PLOT, RELIEF, SNAPSHOT & SITE OBJECTS ====================
  const page1 = createPageCanvas();
  const ctx1 = page1.ctx;

  // Header Banner
  ctx1.fillStyle = '#0f172a';
  ctx1.fillRect(0, 0, W, 118);
  ctx1.fillStyle = '#10b981';
  ctx1.fillRect(0, 114, W, 4);

  ctx1.fillStyle = '#ffffff';
  ctx1.font = 'bold 25px Inter, system-ui, sans-serif';
  ctx1.fillText('ГРАДОСТРОИТЕЛЬНЫЙ И ИНЖЕНЕРНЫЙ ОТЧЕТ ПО УЧАСТКУ (СПОЗУ)', 48, 52);

  ctx1.fillStyle = '#94a3b8';
  ctx1.font = '15px Inter, system-ui, sans-serif';
  ctx1.fillText(
    `САПР «ГенПлан-Эксперт РФ 3D» · Сформировано: ${new Date().toLocaleDateString('ru-RU')} · Регион: ${region.name}`,
    48,
    86
  );

  let y = 148;

  // Section 1: Plot & Relief Summary (2 columns)
  ctx1.fillStyle = '#f8fafc';
  ctx1.strokeStyle = '#cbd5e1';
  ctx1.lineWidth = 1.5;
  ctx1.fillRect(48, y, 555, 225);
  ctx1.strokeRect(48, y, 555, 225);

  ctx1.fillRect(625, y, 567, 225);
  ctx1.strokeRect(625, y, 567, 225);

  ctx1.fillStyle = '#0f172a';
  ctx1.font = 'bold 16px Inter, system-ui, sans-serif';
  ctx1.fillText('1. ХАРАКТЕРИСТИКИ ЗЕМЕЛЬНОГО УЧАСТКА', 66, y + 30);

  ctx1.font = '13.5px Inter, system-ui, sans-serif';
  ctx1.fillStyle = '#334155';
  const plotAreaSqm = plot.width * plot.length;
  const streetEdge = plot.edges[0] || { fenceType: 'solid', fenceHeight: 2.0 };
  const plotLines = [
    `Габариты и площадь: ${plot.width.toFixed(2)} × ${plot.length.toFixed(2)} м (${plotAreaSqm.toFixed(1)} м² / ${(plotAreaSqm / 100).toFixed(2)} сот.)`,
    `Категория земель: ${plot.category === 'IZHS' ? 'ИЖС / ЛПХ (Земли населенных пунктов)' : 'СНТ (Садоводство)'}`,
    `Координаты точки (WGS84): ${region.lat.toFixed(5)}° N, ${region.lng.toFixed(5)}° E`,
    `Тип грунта (СП 22.13330): ${soil.name} (R0 = ${soil.bearingCapacityR0} кПа)`,
    `Снеговой район: ${region.snowZone} (${region.snowLoadSg} кг/м²) · Промерзание: ${region.frostDepth.toFixed(2)} м`,
    `Фасадное ограждение: ${streetEdge.fenceType === 'mesh' ? 'Сетка / продуваемое' : streetEdge.fenceType === 'solid' ? 'Сплошной профиль' : 'Без забора'} (H = ${streetEdge.fenceHeight.toFixed(2)} м)`
  ];
  plotLines.forEach((line, idx) => {
    ctx1.fillText(line, 66, y + 60 + idx * 26);
  });

  // Right card: Relief & Stormwater Drainage
  ctx1.fillStyle = '#0f172a';
  ctx1.font = 'bold 16px Inter, system-ui, sans-serif';
  ctx1.fillText('2. РЕЛЬЕФ ПОВЕРХНОСТИ И ВОДООТВЕДЕНИЕ', 643, y + 30);

  ctx1.font = '13.5px Inter, system-ui, sans-serif';
  ctx1.fillStyle = '#334155';
  const reliefLines = [
    `Отметки углов: СЗ ${relief.elevationNW.toFixed(2)}м · СВ ${relief.elevationNE.toFixed(2)}м · ЮВ ${relief.elevationSE.toFixed(2)}м · ЮЗ ${relief.elevationSW.toFixed(2)}м`,
    `Перепад высот ΔH: ${relief.elevationDeltaM.toFixed(3)} м (min ${relief.minElevationM.toFixed(2)} м / max ${relief.maxElevationM.toFixed(2)} м)`,
    `Расчетный уклон поверхности i: ${relief.slopePercent.toFixed(2)} % (${relief.slopePermille.toFixed(1)} ‰ · угол ${relief.slopeAngleDeg.toFixed(2)}°)`,
    `Направление поверхностного стока: ${relief.slopeDirectionLabel} (азимут ${relief.slopeDirectionAzimuthDeg}°)`,
    `Расчетный ливневый сток (СП 32.13330): Q = ${relief.stormwaterRunoffLitersPerSec.toFixed(2)} л/с`,
    `Оценка по СП 42.13330: ${relief.normativeStatusLabel}`
  ];
  reliefLines.forEach((line, idx) => {
    ctx1.fillText(line, 643, y + 60 + idx * 26);
  });

  y += 248;

  // Optional 2D/3D snapshot if available
  if (mapSnapshotDataUrl) {
    try {
      const img = await new Promise<HTMLImageElement>((resolve, reject) => {
        const image = new Image();
        image.onload = () => resolve(image);
        image.onerror = reject;
        image.src = mapSnapshotDataUrl;
      });
      ctx1.fillStyle = '#0f172a';
      ctx1.font = 'bold 16px Inter, system-ui, sans-serif';
      ctx1.fillText('3. СХЕМА ГЕНЕРАЛЬНОГО ПЛАНА УЧАСТКА И ЗОН ВОДООТВЕДЕНИЯ', 48, y + 20);

      const boxW = W - 96;
      const boxH = 380;
      ctx1.fillStyle = '#0f172a';
      ctx1.fillRect(48, y + 32, boxW, boxH);
      const scale = Math.min(boxW / img.width, boxH / img.height);
      const drawW = img.width * scale;
      const drawH = img.height * scale;
      ctx1.drawImage(img, 48 + (boxW - drawW) / 2, y + 32 + (boxH - drawH) / 2, drawW, drawH);
      ctx1.strokeStyle = '#94a3b8';
      ctx1.strokeRect(48, y + 32, boxW, boxH);
      y += 434;
    } catch {
      // Fallback if snapshot fails to decode
    }
  }

  // Table of Site Objects
  ctx1.fillStyle = '#0f172a';
  ctx1.font = 'bold 16px Inter, system-ui, sans-serif';
  ctx1.fillText(`4. ЭКСПЛИКАЦИЯ ЗДАНИЙ, СООРУЖЕНИЙ И ИНЖЕНЕРНЫХ СЕТЕЙ (Всего: ${objects.length})`, 48, y + 22);
  y += 34;

  const colX = [48, 86, 330, 515, 690, 875, 1045];
  ctx1.fillStyle = '#1e293b';
  ctx1.fillRect(48, y, W - 96, 34);
  ctx1.fillStyle = '#ffffff';
  ctx1.font = 'bold 13px Inter, system-ui, sans-serif';
  ctx1.fillText('№', colX[0] + 8, y + 22);
  ctx1.fillText('Наименование объекта', colX[1] + 6, y + 22);
  ctx1.fillText('Категория объекта', colX[2] + 6, y + 22);
  ctx1.fillText('Габариты / Трасса', colX[3] + 6, y + 22);
  ctx1.fillText('Площадь / Заглубл.', colX[4] + 6, y + 22);
  ctx1.fillText('Кровля / Диаметр', colX[5] + 6, y + 22);
  ctx1.fillText('Коорд. (X; Z)', colX[6] + 6, y + 22);
  y += 34;

  const maxRowsPage1 = Math.min(objects.length, 24);
  for (let i = 0; i < maxRowsPage1; i++) {
    const obj = objects[i];
    const caps = getObjectCategoryCapabilities(obj.category);
    const areas = calculateBuildingInteriorArea(obj);
    const catMeta = BUILDING_CATEGORY_LABELS[obj.category];
    const rowH = 32;

    ctx1.fillStyle = i % 2 === 0 ? '#ffffff' : '#f8fafc';
    ctx1.fillRect(48, y, W - 96, rowH);
    ctx1.strokeStyle = '#e2e8f0';
    ctx1.lineWidth = 1;
    ctx1.strokeRect(48, y, W - 96, rowH);

    ctx1.fillStyle = '#0f172a';
    ctx1.font = '12.5px Inter, system-ui, sans-serif';
    ctx1.fillText(String(i + 1), colX[0] + 8, y + 21);
    ctx1.fillText(obj.name.slice(0, 28), colX[1] + 6, y + 21);
    ctx1.fillText((catMeta?.shortLabel || obj.category).slice(0, 22), colX[2] + 6, y + 21);

    const dimText = caps.hasPipelineDiameter
      ? `L=${obj.width.toFixed(1)}м · B=${obj.length.toFixed(2)}м`
      : `${obj.width.toFixed(2)}×${obj.length.toFixed(2)}${caps.heightLabel ? `×${obj.wallHeight.toFixed(1)}м` : ' м'}`;
    ctx1.fillText(dimText, colX[3] + 6, y + 21);

    const areaOrDepthText = caps.hasBurialDepth
      ? `Загл. −${(obj.burialDepth ?? getDefaultBurialDepth(obj.category)).toFixed(2)} м`
      : caps.hasInteriorAreaInsideWalls
      ? `${areas.grossFootprintAreaSqm} / вн. ${areas.totalNetInteriorAllFloorsSqm} м²`
      : `${(obj.width * obj.length).toFixed(1)} м²`;
    ctx1.fillText(areaOrDepthText, colX[4] + 6, y + 21);

    const roofOrPipeText = caps.hasPipelineDiameter
      ? `Ø ${obj.pipelineDiameterMm ?? getDefaultPipelineDiameterMm(obj.category)} мм`
      : caps.hasRoofGeometry
      ? `${obj.roofType} (H=${obj.roofHeight.toFixed(1)}м)`
      : '—';
    ctx1.fillText(roofOrPipeText, colX[5] + 6, y + 21);

    ctx1.fillText(`(${obj.x.toFixed(1)}; ${obj.z.toFixed(1)})`, colX[6] + 6, y + 21);
    y += rowH;
  }

  ctx1.fillStyle = '#64748b';
  ctx1.font = '12px Inter, system-ui, sans-serif';
  ctx1.fillText(
    'Лист 1 из 2 · ГенПлан-Эксперт РФ 3D · Градостроительный план, рельеф и экспликация объектов (СП 53.13330.2019, СП 42.13330.2016)',
    48,
    H - 28
  );

  // ==================== PAGE 2: NORMATIVE AUDIT, ENGINEERING & BOM WITH PRICES ====================
  const page2 = createPageCanvas();
  const ctx2 = page2.ctx;

  ctx2.fillStyle = '#0f172a';
  ctx2.fillRect(0, 0, W, 92);
  ctx2.fillStyle = '#3b82f6';
  ctx2.fillRect(0, 88, W, 4);

  ctx2.fillStyle = '#ffffff';
  ctx2.font = 'bold 22px Inter, system-ui, sans-serif';
  ctx2.fillText('НОРМАТИВНЫЙ АУДИТ РФ, ИНЖЕНЕРНЫЕ РАСЧЕТЫ И СМЕТА МАТЕРИАЛОВ', 48, 52);

  let y2 = 122;

  // Section 5: Normative Audit
  ctx2.fillStyle = '#0f172a';
  ctx2.font = 'bold 16px Inter, system-ui, sans-serif';
  ctx2.fillText(
    `5. РЕЗУЛЬТАТЫ ПРОВЕРКИ ГРАДОСТРОИТЕЛЬНЫХ И САНИТАРНЫХ НОРМ РФ (Выявлено: ${violations.length})`,
    48,
    y2
  );
  y2 += 16;

  if (violations.length === 0) {
    ctx2.fillStyle = '#ecfdf5';
    ctx2.strokeStyle = '#10b981';
    ctx2.lineWidth = 1.5;
    ctx2.fillRect(48, y2, W - 96, 54);
    ctx2.strokeRect(48, y2, W - 96, 54);
    ctx2.fillStyle = '#065f46';
    ctx2.font = 'bold 15px Inter, system-ui, sans-serif';
    ctx2.fillText(
      '✓ Нарушений отступов СП 53.13330.2019, СП 42.13330.2016, СП 4.13130.2013 и СанПиН не выявлено.',
      66,
      y2 + 33
    );
    y2 += 74;
  } else {
    const shownViolations = violations.slice(0, 8);
    shownViolations.forEach((v, idx) => {
      const boxH = 44;
      ctx2.fillStyle = v.severity === 'error' ? '#fef2f2' : '#fffbeb';
      ctx2.strokeStyle = v.severity === 'error' ? '#ef4444' : '#f59e0b';
      ctx2.lineWidth = 1;
      ctx2.fillRect(48, y2, W - 96, boxH);
      ctx2.strokeRect(48, y2, W - 96, boxH);

      ctx2.fillStyle = v.severity === 'error' ? '#991b1b' : '#92400e';
      ctx2.font = 'bold 12.5px Inter, system-ui, sans-serif';
      ctx2.fillText(`${idx + 1}. [${v.code}] ${v.title.slice(0, 92)}`, 62, y2 + 18);
      ctx2.fillStyle = '#475569';
      ctx2.font = '12px Inter, system-ui, sans-serif';
      const valSummary =
        v.measuredValue !== undefined && v.requiredValue !== undefined
          ? `Факт: ${v.measuredValue} м (норматив: ${v.requiredValue} м) · `
          : '';
      ctx2.fillText(`${valSummary}${v.recommendation.slice(0, 95)}`, 62, y2 + 35);
      y2 += boxH + 6;
    });
    y2 += 12;
  }

  // Section 6: Engineering Calculations Summary (4 cards in 2x2 grid)
  ctx2.fillStyle = '#0f172a';
  ctx2.font = 'bold 16px Inter, system-ui, sans-serif';
  ctx2.fillText('6. СВОДКА ИНЖЕНЕРНЫХ РАСЧЕТОВ (КРОВЛЯ, ФУНДАМЕНТ, ТЕПЛОТЕХНИКА, ИНСОЛЯЦИЯ)', 48, y2);
  y2 += 16;

  const cardW = 560;
  const cardH = 128;

  // Card A: Snow Load
  ctx2.fillStyle = '#f8fafc';
  ctx2.strokeStyle = '#cbd5e1';
  ctx2.fillRect(48, y2, cardW, cardH);
  ctx2.strokeRect(48, y2, cardW, cardH);
  ctx2.fillStyle = '#0f172a';
  ctx2.font = 'bold 14px Inter, system-ui, sans-serif';
  ctx2.fillText('Снеговая нагрузка (СП 20.13330.2016)', 64, y2 + 24);
  ctx2.font = '13px Inter, system-ui, sans-serif';
  ctx2.fillStyle = '#334155';
  if (snow) {
    ctx2.fillText(`Район ${snow.snowZone} · Sg = ${snow.normativeSg} кг/м² · Коэфф. μ = ${snow.mu} (α = ${snow.slopeAngleDeg}°)`, 64, y2 + 48);
    ctx2.fillText(`Расчетная нагрузка S0: ${snow.designSnowLoadS} кг/м²`, 64, y2 + 72);
    ctx2.fillText(`Полная масса снега: ${snow.totalSnowMassTons} т (${snow.recommendedRafterSection}, шаг ${snow.recommendedRafterStepMm} мм)`, 64, y2 + 96);
  }

  // Card B: Foundation
  ctx2.fillStyle = '#f8fafc';
  ctx2.fillRect(632, y2, cardW, cardH);
  ctx2.strokeRect(632, y2, cardW, cardH);
  ctx2.fillStyle = '#0f172a';
  ctx2.font = 'bold 14px Inter, system-ui, sans-serif';
  ctx2.fillText('Несущая способность грунта (СП 22.13330.2016)', 648, y2 + 24);
  ctx2.font = '13px Inter, system-ui, sans-serif';
  ctx2.fillStyle = '#334155';
  if (foundation) {
    ctx2.fillText(`Расчетное сопротивление грунта R0: ${foundation.soilBearingR0Kpa} кПа`, 648, y2 + 48);
    ctx2.fillText(`Полная масса здания со снегом: ${foundation.totalLoadWithSnowTons} т`, 648, y2 + 72);
    ctx2.fillText(
      `Давление на грунт: ${foundation.actualPressureKpa} кПа (Запас ×${foundation.safetyMarginRatio})`,
      648,
      y2 + 96
    );
  }

  y2 += cardH + 14;

  // Card C: Energy Efficiency
  ctx2.fillStyle = '#f8fafc';
  ctx2.fillRect(48, y2, cardW, cardH);
  ctx2.strokeRect(48, y2, cardW, cardH);
  ctx2.fillStyle = '#0f172a';
  ctx2.font = 'bold 14px Inter, system-ui, sans-serif';
  ctx2.fillText(
    energy
      ? `Энергоэффективность (Класс ${energy.energyClass} — ${energy.energyClassLabel})`
      : 'Энергоэффективность и отопление',
    64,
    y2 + 24
  );
  ctx2.font = '13px Inter, system-ui, sans-serif';
  ctx2.fillStyle = '#334155';
  if (energy) {
    ctx2.fillText(`Отапливаемая площадь: ${energy.heatedFloorAreaSqm} м² · Сезон: ${energy.heatingSeasonDays} сут`, 64, y2 + 48);
    ctx2.fillText(`Теплопотери за сезон: ${energy.totalAnnualHeatEnergyKwh} кВт·ч (${energy.specificHeatLossPerSqmKwh} кВт·ч/м²)`, 64, y2 + 72);
    ctx2.fillText(
      `Отопление/год: Газ ${energy.gas.annualCostRub.toLocaleString('ru-RU')} ₽ · Эл-во ${energy.electricity.annualCostRub.toLocaleString('ru-RU')} ₽ · Дрова ${energy.firewood.annualCostRub.toLocaleString('ru-RU')} ₽`,
      64,
      y2 + 96
    );
  }

  // Card D: Insolation & Drainage Zones
  ctx2.fillStyle = '#f8fafc';
  ctx2.fillRect(632, y2, cardW, cardH);
  ctx2.strokeRect(632, y2, cardW, cardH);
  ctx2.fillStyle = '#0f172a';
  ctx2.font = 'bold 14px Inter, system-ui, sans-serif';
  ctx2.fillText('Инсоляция (СанПиН 1.2.3685-21) и зоны дренажа', 648, y2 + 24);
  ctx2.font = '13px Inter, system-ui, sans-serif';
  ctx2.fillStyle = '#334155';
  if (insolation) {
    ctx2.fillText(
      `Норма (${insolation.climateZoneLabel}): ≥ ${insolation.requiredContinuousHours} ч · ${insolation.overallCompliant ? 'Соблюдена' : 'Дефицит'}`,
      648,
      y2 + 48
    );
    ctx2.fillText(
      `Фасадов с нормой инсоляции: ${insolation.compliantFacadesCount} из ${insolation.totalWindowedFacadesCount}`,
      648,
      y2 + 72
    );
  }
  ctx2.fillText(
    `Зоны дренажа: ${relief.drainageZones.map((z) => z.title.split('(')[0].trim()).join(', ')}`,
    648,
    y2 + 96
  );

  y2 += cardH + 26;

  // Section 7: Bill of Materials with Market Prices
  ctx2.fillStyle = '#0f172a';
  ctx2.font = 'bold 16px Inter, system-ui, sans-serif';
  ctx2.fillText('7. СВОДНАЯ ВЕДОМОСТЬ МАТЕРИАЛОВ И СМЕТА ПО РЫНОЧНЫМ ЦЕНАМ', 48, y2);
  y2 += 14;

  const bomColX = [48, 220, 710, 825, 925, 1055];
  ctx2.fillStyle = '#1e293b';
  ctx2.fillRect(48, y2, W - 96, 34);
  ctx2.fillStyle = '#ffffff';
  ctx2.font = 'bold 13px Inter, system-ui, sans-serif';
  ctx2.fillText('Раздел', bomColX[0] + 8, y2 + 22);
  ctx2.fillText('Наименование материала', bomColX[1] + 6, y2 + 22);
  ctx2.fillText('Кол-во', bomColX[2] + 6, y2 + 22);
  ctx2.fillText('Ед.', bomColX[3] + 6, y2 + 22);
  ctx2.fillText('Цена за ед.', bomColX[4] + 6, y2 + 22);
  ctx2.fillText('Сумма, ₽', bomColX[5] + 6, y2 + 22);
  y2 += 34;

  bom.items.forEach((item, idx) => {
    const rowH = 30;
    ctx2.fillStyle = idx % 2 === 0 ? '#ffffff' : '#f8fafc';
    ctx2.fillRect(48, y2, W - 96, rowH);
    ctx2.strokeStyle = '#e2e8f0';
    ctx2.strokeRect(48, y2, W - 96, rowH);

    const catRu =
      item.category === 'foundation'
        ? 'Фундамент'
        : item.category === 'walls'
        ? 'Стены'
        : item.category === 'roof'
        ? 'Кровля'
        : 'Забор';

    ctx2.fillStyle = '#0f172a';
    ctx2.font = '12.5px Inter, system-ui, sans-serif';
    ctx2.fillText(catRu, bomColX[0] + 8, y2 + 20);
    ctx2.fillText(item.name.slice(0, 52), bomColX[1] + 6, y2 + 20);
    ctx2.fillText(String(item.quantity), bomColX[2] + 6, y2 + 20);
    ctx2.fillText(item.unit, bomColX[3] + 6, y2 + 20);
    ctx2.fillText(`${item.unitPriceRub.toLocaleString('ru-RU')} ₽`, bomColX[4] + 6, y2 + 20);
    ctx2.font = 'bold 12.5px Inter, system-ui, sans-serif';
    ctx2.fillText(`${item.estimatedCostRub.toLocaleString('ru-RU')} ₽`, bomColX[5] + 6, y2 + 20);
    y2 += rowH;
  });

  // Total Row
  ctx2.fillStyle = '#ecfdf5';
  ctx2.strokeStyle = '#10b981';
  ctx2.fillRect(48, y2, W - 96, 38);
  ctx2.strokeRect(48, y2, W - 96, 38);
  ctx2.fillStyle = '#065f46';
  ctx2.font = 'bold 15px Inter, system-ui, sans-serif';
  ctx2.fillText('ИТОГО РАСЧЕТНАЯ СТОИМОСТЬ МАТЕРИАЛОВ ПО ВЕДОМОСТИ:', 64, y2 + 25);
  ctx2.fillText(`${bom.totalEstimatedCostRub.toLocaleString('ru-RU')} ₽`, bomColX[5] - 12, y2 + 25);

  ctx2.fillStyle = '#64748b';
  ctx2.font = '12px Inter, system-ui, sans-serif';
  ctx2.fillText(
    'Лист 2 из 2 · ГенПлан-Эксперт РФ 3D · Полный градостроительный и сметный отчет по участку',
    48,
    H - 28
  );

  const page1Jpeg = dataUrlToUint8Array(page1.canvas.toDataURL('image/jpeg', 0.92));
  const page2Jpeg = dataUrlToUint8Array(page2.canvas.toDataURL('image/jpeg', 0.92));

  const pdfBytes = buildMultiPageJpegPdfBytes([
    { jpegBytes: page1Jpeg, pixelWidth: W, pixelHeight: H },
    { jpegBytes: page2Jpeg, pixelWidth: W, pixelHeight: H }
  ]);

  return new Blob([pdfBytes.buffer as ArrayBuffer], { type: 'application/pdf' });
}

/**
 * Triggers a client-side download of the full Urban Planning PDF report.
 */
export async function downloadUrbanPlanningPdfReport(
  plot: PlotConfig,
  objects: SiteObject[],
  violations: NormViolation[],
  mapSnapshotDataUrl?: string | null,
  dayOfYear = 172
): Promise<void> {
  let snapshot = mapSnapshotDataUrl;
  if (!snapshot && typeof document !== 'undefined') {
    const mainCanvas = document.querySelector('canvas') as HTMLCanvasElement | null;
    if (mainCanvas) {
      try {
        snapshot = mainCanvas.toDataURL('image/png');
      } catch {
        snapshot = null;
      }
    }
  }

  const blob = await generateUrbanPlanningPdfBlob(plot, objects, violations, snapshot, dayOfYear);
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `gradostroitelny-otchet-genplan-${plot.regionId}.pdf`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 3000);
}

import React, { useState } from 'react';
import {
  X,
  Download,
  Calculator,
  FileSpreadsheet,
  Image as ImageIcon,
  FileText,
  RotateCcw,
  Coins
} from 'lucide-react';
import {
  PlotConfig,
  SiteObject,
  NormViolation,
  FoundationTypeId,
  WallMaterialId,
  RoofCoverId,
  MaterialUnitPrices
} from '../types';
import {
  calculateBillOfMaterials,
  calculateSnowLoad,
  calculateFoundationBearing,
  calculateRoofGeometryMetrics,
  DEFAULT_MATERIAL_UNIT_PRICES,
  getEffectiveMaterialUnitPrices
} from '../utils/calculations';
import { REGIONS_RF, FOUNDATION_NAMES, WALL_MATERIALS_INFO } from '../data/regions';
import { downloadUrbanPlanningPdfReport } from '../utils/pdfReportGenerator';

interface BOMExportModalProps {
  isOpen: boolean;
  plot: PlotConfig;
  objects: SiteObject[];
  violations: NormViolation[];
  onClose: () => void;
  onUpdateObject: (id: string, updater: (prev: SiteObject) => SiteObject) => void;
  onUpdatePlot?: React.Dispatch<React.SetStateAction<PlotConfig>>;
  onExportMasterPlanPng: () => void;
  getCanvasSnapshot?: () => string | null;
}

const MATERIAL_PRICE_FIELDS: Array<{
  key: keyof MaterialUnitPrices;
  label: string;
  unitLabel: string;
  testId: string;
}> = [
  {
    key: 'aeratedConcreteRubPerM3',
    label: 'Газобетон D400',
    unitLabel: '₽/м³',
    testId: 'bom-price-aerated-concrete'
  },
  {
    key: 'timberRubPerM3',
    label: 'Брус (профил./клеен.)',
    unitLabel: '₽/м³',
    testId: 'bom-price-timber'
  },
  {
    key: 'ceramicBrickRubPerM3',
    label: 'Керамический блок',
    unitLabel: '₽/м³',
    testId: 'bom-price-ceramic-brick'
  },
  {
    key: 'frameWallRubPerM3',
    label: 'Каркасный пирог стен',
    unitLabel: '₽/м³',
    testId: 'bom-price-frame-wall'
  },
  {
    key: 'metalTileRubPerSqm',
    label: 'Металлочерепица',
    unitLabel: '₽/м²',
    testId: 'bom-price-metal-tile'
  },
  {
    key: 'softShinglesRubPerSqm',
    label: 'Гибкая черепица',
    unitLabel: '₽/м²',
    testId: 'bom-price-soft-shingles'
  },
  {
    key: 'corrugatedRoofRubPerSqm',
    label: 'Профлист кровельный',
    unitLabel: '₽/м²',
    testId: 'bom-price-corrugated'
  },
  {
    key: 'rafterTimberRubPerM3',
    label: 'Пиломатериал стропил',
    unitLabel: '₽/м³',
    testId: 'bom-price-rafter-timber'
  },
  {
    key: 'concreteRubPerM3',
    label: 'Бетон М350 (В25)',
    unitLabel: '₽/м³',
    testId: 'bom-price-concrete'
  },
  {
    key: 'rebarRubPerKg',
    label: 'Арматура А500С',
    unitLabel: '₽/кг',
    testId: 'bom-price-rebar'
  },
  {
    key: 'sandGravelRubPerM3',
    label: 'Песок и щебень (подушка)',
    unitLabel: '₽/м³',
    testId: 'bom-price-sand-gravel'
  },
  {
    key: 'facadeFinishRubPerSqm',
    label: 'Отделка фасада / клей',
    unitLabel: '₽/м²',
    testId: 'bom-price-facade-finish'
  },
  {
    key: 'fenceRubPerMeter',
    label: 'Забор по периметру',
    unitLabel: '₽/п.м.',
    testId: 'bom-price-fence'
  }
];

export const BOMExportModal: React.FC<BOMExportModalProps> = ({
  isOpen,
  plot,
  objects,
  violations,
  onClose,
  onUpdateObject,
  onUpdatePlot,
  onExportMasterPlanPng,
  getCanvasSnapshot
}) => {
  const [localPrices, setLocalPrices] = useState<Partial<MaterialUnitPrices>>({});
  const [pdfStatusText, setPdfStatusText] = useState<string>('');
  const [isGeneratingPdf, setIsGeneratingPdf] = useState<boolean>(false);

  if (!isOpen) return null;

  const effectivePrices: MaterialUnitPrices = {
    ...getEffectiveMaterialUnitPrices(plot),
    ...localPrices
  };

  const handlePriceChange = (key: keyof MaterialUnitPrices, rawVal: string) => {
    const parsed = Math.max(0, Number(rawVal.replace(',', '.')) || 0);
    setLocalPrices((prev) => ({ ...prev, [key]: parsed }));
    if (onUpdatePlot) {
      onUpdatePlot((prev) => ({
        ...prev,
        materialUnitPrices: {
          ...getEffectiveMaterialUnitPrices(prev),
          ...localPrices,
          [key]: parsed
        }
      }));
    }
  };

  const handleResetMarketPrices = () => {
    setLocalPrices({});
    if (onUpdatePlot) {
      onUpdatePlot((prev) => ({
        ...prev,
        materialUnitPrices: { ...DEFAULT_MATERIAL_UNIT_PRICES }
      }));
    }
  };

  const house = objects.find((o) => o.category === 'house') || objects[0];
  const bom = calculateBillOfMaterials(plot, objects, effectivePrices);
  const snow = house ? calculateSnowLoad(house, plot.regionId) : null;
  const fnd = house ? calculateFoundationBearing(house, plot.regionId, plot.soilTypeId) : null;
  const roofMetrics = house ? calculateRoofGeometryMetrics(house) : null;
  const region = REGIONS_RF.find((r) => r.id === plot.regionId) || REGIONS_RF[0];

  const handleDownloadCsv = () => {
    const headers = [
      'Категория',
      'Наименование материала',
      'Количество',
      'Ед. изм.',
      'Цена за ед. (руб.)',
      'Ориентировочная стоимость (руб.)',
      'Примечание'
    ];
    const rows = bom.items.map((item) => [
      item.category,
      `"${item.name.replace(/"/g, '""')}"`,
      item.quantity,
      item.unit,
      item.unitPriceRub,
      item.estimatedCostRub,
      `"${item.notes.replace(/"/g, '""')}"`
    ]);
    const csvContent = '\uFEFF' + [headers.join(';'), ...rows.map((r) => r.join(';'))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `smeta-genplan-${plot.regionId}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleExportFullPdfReport = async () => {
    try {
      setIsGeneratingPdf(true);
      setPdfStatusText('Формирование PDF-отчета...');
      const snapshot = getCanvasSnapshot ? getCanvasSnapshot() : null;
      await downloadUrbanPlanningPdfReport(
        {
          ...plot,
          materialUnitPrices: effectivePrices
        },
        objects,
        violations,
        snapshot
      );
      setPdfStatusText('Градостроительный отчет PDF сформирован и скачан');
    } catch {
      setPdfStatusText('Ошибка формирования PDF');
    } finally {
      setIsGeneratingPdf(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-950/80 flex items-center justify-center p-4 overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-labelledby="bom-modal-title"
    >
      <div className="bg-slate-900 border border-slate-700 rounded-xl max-w-5xl w-full overflow-hidden shadow-2xl flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between">
          <div>
            <h2
              id="bom-modal-title"
              className="text-base font-bold text-white flex items-center gap-2"
            >
              <Calculator className="w-5 h-5 text-sky-400" />
              Ведомость строительных материалов (BOM), Рыночные цены и Градостроительный отчет PDF
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Регион: {region.name} · Снеговой район {region.snowZone} ({region.snowLoadSg} кг/м²) ·
              Объектов: {objects.length} · Нарушений СП: {violations.length}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Закрыть окно расчета материалов"
            className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          {/* Step 1: Simple Input Parameters Requested After Sitting House on Plot */}
          {house && (
            <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-3">
              <div className="text-xs font-semibold text-sky-400">
                Вводные параметры конструктива здания «{house.name}» ({house.width}×{house.length} м)
              </div>

              <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
                <div>
                  <label htmlFor="bom-floors" className="block text-[11px] text-slate-400 mb-1">
                    Этажность
                  </label>
                  <select
                    id="bom-floors"
                    value={house.floors}
                    onChange={(e) =>
                      onUpdateObject(house.id, (prev) => ({
                        ...prev,
                        floors: Number(e.target.value)
                      }))
                    }
                    className="w-full bg-slate-900 border border-slate-700 rounded px-2.5 py-1.5 text-xs font-mono text-white"
                  >
                    <option value={1}>1 этаж</option>
                    <option value={2}>2 этажа</option>
                    <option value={3}>3 этажа</option>
                  </select>
                </div>

                <div>
                  <label htmlFor="bom-wall-h" className="block text-[11px] text-slate-400 mb-1">
                    Высота стен (м)
                  </label>
                  <input
                    id="bom-wall-h"
                    type="number"
                    step={0.1}
                    min={2.4}
                    max={12.0}
                    value={house.wallHeight}
                    onChange={(e) =>
                      onUpdateObject(house.id, (prev) => ({
                        ...prev,
                        wallHeight: Number(e.target.value) || 3.0
                      }))
                    }
                    className="w-full bg-slate-900 border border-slate-700 rounded px-2.5 py-1.5 text-xs font-mono text-white"
                  />
                </div>

                <div>
                  <label htmlFor="bom-glazing" className="block text-[11px] text-slate-400 mb-1">
                    Доля остекления (%)
                  </label>
                  <input
                    id="bom-glazing"
                    type="number"
                    step={5}
                    min={5}
                    max={50}
                    value={Math.round(house.glazingRatio * 100)}
                    onChange={(e) =>
                      onUpdateObject(house.id, (prev) => ({
                        ...prev,
                        glazingRatio: Math.max(0.05, Math.min(0.5, Number(e.target.value) / 100))
                      }))
                    }
                    className="w-full bg-slate-900 border border-slate-700 rounded px-2.5 py-1.5 text-xs font-mono text-white"
                  />
                </div>

                <div>
                  <label htmlFor="bom-partitions" className="block text-[11px] text-slate-400 mb-1">
                    Перегородки (п.м.)
                  </label>
                  <input
                    id="bom-partitions"
                    type="number"
                    step={2}
                    min={0}
                    max={120}
                    value={house.partitionLength}
                    onChange={(e) =>
                      onUpdateObject(house.id, (prev) => ({
                        ...prev,
                        partitionLength: Math.max(0, Number(e.target.value) || 20)
                      }))
                    }
                    className="w-full bg-slate-900 border border-slate-700 rounded px-2.5 py-1.5 text-xs font-mono text-white"
                  />
                </div>

                <div>
                  <label htmlFor="bom-wall-mat" className="block text-[11px] text-slate-400 mb-1">
                    Материал стен
                  </label>
                  <select
                    id="bom-wall-mat"
                    value={house.wallMaterialId}
                    onChange={(e) =>
                      onUpdateObject(house.id, (prev) => ({
                        ...prev,
                        wallMaterialId: e.target.value as WallMaterialId
                      }))
                    }
                    className="w-full bg-slate-900 border border-slate-700 rounded px-2.5 py-1.5 text-xs text-white"
                  >
                    {Object.entries(WALL_MATERIALS_INFO).map(([id, info]) => (
                      <option key={id} value={id}>
                        {info.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label htmlFor="bom-roof-cover" className="block text-[11px] text-slate-400 mb-1">
                    Кровля
                  </label>
                  <select
                    id="bom-roof-cover"
                    value={house.roofCoverId}
                    onChange={(e) =>
                      onUpdateObject(house.id, (prev) => ({
                        ...prev,
                        roofCoverId: e.target.value as RoofCoverId
                      }))
                    }
                    className="w-full bg-slate-900 border border-slate-700 rounded px-2.5 py-1.5 text-xs text-white"
                  >
                    <option value="metal_tile">Металлочерепица</option>
                    <option value="soft_shingles">Гибкая черепица</option>
                    <option value="corrugated">Профлист кровельный</option>
                  </select>
                </div>
              </div>

              <div className="pt-2">
                <label htmlFor="bom-fnd-type" className="block text-[11px] text-slate-400 mb-1">
                  Тип фундамента (по расчету грунта СП 22.13330.2016)
                </label>
                <select
                  id="bom-fnd-type"
                  value={house.foundationTypeId}
                  onChange={(e) =>
                    onUpdateObject(house.id, (prev) => ({
                      ...prev,
                      foundationTypeId: e.target.value as FoundationTypeId
                    }))
                  }
                  className="w-full bg-slate-900 border border-slate-700 rounded px-3 py-1.5 text-xs text-white"
                >
                  {Object.entries(FOUNDATION_NAMES).map(([id, info]) => (
                    <option key={id} value={id}>
                      {info.name} — {info.description}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          )}

          {/* Market Unit Prices Editor Panel */}
          <div
            data-testid="bom-market-prices-panel"
            className="p-4 rounded-xl bg-slate-950 border border-emerald-500/30 space-y-3"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="text-xs font-semibold text-emerald-400 flex items-center gap-1.5">
                <Coins className="w-4 h-4" />
                Рыночные цены за единицу материала (автоматический пересчет сметы)
              </div>
              <button
                type="button"
                data-testid="bom-reset-prices-btn"
                onClick={handleResetMarketPrices}
                className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-[11px] text-slate-300 flex items-center gap-1 transition-colors"
              >
                <RotateCcw className="w-3 h-3" />
                Сбросить к среднерыночным ценам
              </button>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2.5">
              {MATERIAL_PRICE_FIELDS.map((field) => (
                <div
                  key={field.key}
                  className="p-2 rounded-lg bg-slate-900/90 border border-slate-800"
                >
                  <label
                    htmlFor={field.testId}
                    className="block text-[11px] text-slate-300 font-medium truncate"
                    title={field.label}
                  >
                    {field.label}
                  </label>
                  <div className="mt-1 flex items-center gap-1">
                    <input
                      id={field.testId}
                      data-testid={field.testId}
                      type="number"
                      min={0}
                      step={50}
                      value={effectivePrices[field.key]}
                      onChange={(e) => handlePriceChange(field.key, e.target.value)}
                      className="w-full bg-slate-950 border border-slate-700 rounded px-2 py-1 text-xs font-mono text-emerald-300 focus:border-emerald-500 focus:outline-none"
                    />
                    <span className="text-[10px] text-slate-400 whitespace-nowrap shrink-0">
                      {field.unitLabel}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Key Engineering Metrics Summary Strip */}
          {snow && fnd && roofMetrics && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="p-3 rounded-lg bg-slate-950 border border-slate-800">
                <div className="text-[11px] text-slate-400">Бетон и арматура фундамента</div>
                <div className="text-sm font-mono font-bold text-white mt-0.5">
                  {bom.foundationConcreteM3} м³ · {bom.foundationRebarKg} кг
                </div>
                <div className="text-[11px] text-slate-400 mt-0.5">
                  Давление: {fnd.actualPressureKpa} кПа (R0={fnd.soilBearingR0Kpa})
                </div>
              </div>

              <div className="p-3 rounded-lg bg-slate-950 border border-slate-800">
                <div className="text-[11px] text-slate-400">Объем стеновых материалов</div>
                <div className="text-sm font-mono font-bold text-white mt-0.5">
                  {bom.wallBlocksM3} м³ ({bom.wallBlocksCount} бл.)
                </div>
                <div className="text-[11px] text-slate-400 mt-0.5">
                  С учетом перегородок и проемов
                </div>
              </div>

              <div className="p-3 rounded-lg bg-slate-950 border border-slate-800">
                <div className="text-[11px] text-slate-400">Кровля (с запасом подрезки)</div>
                <div className="text-sm font-mono font-bold text-sky-400 mt-0.5">
                  {bom.roofCoverAreaWithWasteSqm} м² · лес {bom.rafterTimberM3} м³
                </div>
                <div className="text-[11px] text-slate-400 mt-0.5">
                  Чистая S_roof = {roofMetrics.roofAreaSqm} м² (α={roofMetrics.slopeAngleDeg}°)
                </div>
              </div>

              <div className="p-3 rounded-lg bg-slate-950 border border-slate-800">
                <div className="text-[11px] text-slate-400">Периметр забора участка</div>
                <div className="text-sm font-mono font-bold text-emerald-400 mt-0.5">
                  {bom.fencePerimeterM} п.м. ({bom.fencePostsCount} столбов)
                </div>
                <div className="text-[11px] text-slate-400 mt-0.5">
                  Шаг столбов 2.5 м + лаги
                </div>
              </div>
            </div>
          )}

          {/* Detailed BOM Table */}
          <div className="rounded-xl border border-slate-800 overflow-hidden">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-950 border-b border-slate-800 text-slate-400">
                  <th className="py-2.5 px-3 font-medium">Раздел</th>
                  <th className="py-2.5 px-3 font-medium">Наименование материала и конструктива</th>
                  <th className="py-2.5 px-3 font-medium text-right">Кол-во</th>
                  <th className="py-2.5 px-3 font-medium text-right">Цена за ед.</th>
                  <th className="py-2.5 px-3 font-medium text-right">Сумма (₽)</th>
                  <th className="py-2.5 px-3 font-medium">Техническое примечание</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/80 bg-slate-900">
                {bom.items.map((item, i) => (
                  <tr key={i} className="hover:bg-slate-800/50">
                    <td className="py-2.5 px-3 font-medium text-slate-300 capitalize">
                      {item.category === 'foundation'
                        ? 'Фундамент'
                        : item.category === 'walls'
                        ? 'Стены'
                        : item.category === 'roof'
                        ? 'Крыша'
                        : 'Забор'}
                    </td>
                    <td className="py-2.5 px-3 text-white font-medium">{item.name}</td>
                    <td className="py-2.5 px-3 text-right font-mono font-semibold text-sky-400 whitespace-nowrap">
                      {item.quantity} {item.unit}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono text-slate-300 whitespace-nowrap">
                      {item.unitPriceRub.toLocaleString('ru-RU')} ₽/{item.unit}
                    </td>
                    <td
                      data-testid={`bom-item-cost-${i}`}
                      className="py-2.5 px-3 text-right font-mono font-semibold text-emerald-300 whitespace-nowrap"
                    >
                      {item.estimatedCostRub.toLocaleString('ru-RU')} ₽
                    </td>
                    <td className="py-2.5 px-3 text-slate-400 text-[11px]">{item.notes}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-slate-950 border-t border-slate-800 font-semibold text-white">
                  <td colSpan={4} className="py-3 px-3 text-right">
                    Итого расчетная стоимость материалов по заданным рыночным ценам:
                  </td>
                  <td
                    data-testid="bom-total-cost"
                    className="py-3 px-3 text-right font-mono text-emerald-400 text-sm whitespace-nowrap"
                  >
                    {bom.totalEstimatedCostRub.toLocaleString('ru-RU')} ₽
                  </td>
                  <td className="py-3 px-3 text-[11px] text-slate-400 font-normal">
                    Автоматический расчет по текущей ведомости
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>

          {pdfStatusText && (
            <div
              data-testid="pdf-export-status"
              className="px-3.5 py-2 rounded-lg bg-emerald-950/60 border border-emerald-500/40 text-xs text-emerald-300 font-medium"
            >
              {pdfStatusText}
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="px-6 py-4 bg-slate-950 border-t border-slate-800 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              data-testid="download-pdf-report-btn"
              disabled={isGeneratingPdf}
              onClick={handleExportFullPdfReport}
              className="px-3.5 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-60 text-white text-xs font-semibold rounded-lg flex items-center gap-1.5 transition-colors shadow-sm"
            >
              <FileText className="w-4 h-4" />
              {isGeneratingPdf
                ? 'Генерация PDF...'
                : 'Скачать полный градостроительный отчет (PDF)'}
            </button>
            <button
              type="button"
              onClick={onExportMasterPlanPng}
              className="px-3.5 py-2 bg-sky-600 hover:bg-sky-500 text-white text-xs font-semibold rounded-lg flex items-center gap-1.5 transition-colors"
            >
              <ImageIcon className="w-4 h-4" />
              Скачать чертеж Генплана (PNG)
            </button>
            <button
              type="button"
              onClick={handleDownloadCsv}
              className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold rounded-lg flex items-center gap-1.5 transition-colors"
            >
              <FileSpreadsheet className="w-4 h-4" />
              Скачать ведомость материалов (CSV)
            </button>
            <button
              type="button"
              onClick={() => window.print()}
              className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium rounded-lg flex items-center gap-1.5 border border-slate-700 transition-colors"
            >
              <Download className="w-4 h-4" />
              Печать
            </button>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium rounded-lg transition-colors"
          >
            Закрыть
          </button>
        </div>
      </div>
    </div>
  );
};

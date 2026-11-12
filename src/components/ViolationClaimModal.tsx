import React, { useMemo, useState } from 'react';
import { X, Scale, Copy, Check, Download, Printer, AlertTriangle } from 'lucide-react';
import { PlotConfig, SiteObject, NormViolation } from '../types';
import { generateLegalClaimDocument, formatMetersMm, LegalDocumentType } from '../utils/calculations';

interface ViolationClaimModalProps {
  isOpen: boolean;
  plot: PlotConfig;
  objects: SiteObject[];
  violations: NormViolation[];
  onClose: () => void;
}

export const ViolationClaimModal: React.FC<ViolationClaimModalProps> = ({
  isOpen,
  plot,
  objects,
  violations,
  onClose
}) => {
  const [docType, setDocType] = useState<LegalDocumentType>('combined');
  const [claimantFullName, setClaimantFullName] = useState('Иванов Иван Иванович');
  const [claimantCadastral, setClaimantCadastral] = useState('50:21:0040112:418');
  const [claimantAddress, setClaimantAddress] = useState('Московская обл., СНТ «Солнечный», уч. № 14');

  const [respondentFullName, setRespondentFullName] = useState('Петров Петр Петрович');
  const [respondentCadastral, setRespondentCadastral] = useState('50:21:0040112:419');
  const [respondentAddress, setRespondentAddress] = useState('Московская обл., СНТ «Солнечный», смежный уч. № 15');

  const [deadlineDays, setDeadlineDays] = useState<number>(30);
  const [copied, setCopied] = useState(false);

  const claimText = useMemo(() => {
    return generateLegalClaimDocument(plot, objects, violations, {
      docType,
      claimantFullName,
      claimantCadastral,
      claimantAddress,
      respondentFullName,
      respondentCadastral,
      respondentAddress,
      deadlineDays
    });
  }, [
    docType,
    plot,
    objects,
    violations,
    claimantFullName,
    claimantCadastral,
    claimantAddress,
    respondentFullName,
    respondentCadastral,
    respondentAddress,
    deadlineDays
  ]);

  if (!isOpen) return null;

  const handleCopy = () => {
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(claimText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleDownloadTxt = () => {
    const blob = new Blob([claimText], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `trebovanie-ustranenie-narusheniy-${claimantCadastral.replace(/:/g, '-')}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4"
      data-testid="violation-claim-modal"
    >
      <div className="bg-slate-900 border border-slate-700 rounded-xl max-w-4xl w-full max-h-[92vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 bg-slate-800/90 border-b border-slate-700">
          <div className="flex items-center gap-2.5">
            <Scale className="w-5 h-5 text-amber-400 shrink-0" />
            <div>
              <h2 className="text-sm font-bold text-white">
                Требование об устранении нарушений и Досудебная претензия (по законодательству РФ)
              </h2>
              <p className="text-[11px] text-slate-400">
                В соответствии со ст. 304, 222, 263 ГК РФ, ст. 40, 42 ЗК РФ, СП 53.13330.2019, СП 4.13130.2013 и СП 42.13330.2016
              </p>
            </div>
          </div>
          <button
            type="button"
            data-testid="close-claim-modal-btn"
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-700 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 overflow-y-auto space-y-4 text-xs text-slate-200">
          {/* Statutory Document Type Selector */}
          <div className="p-3 rounded-lg bg-slate-950 border border-slate-800 space-y-2">
            <span className="block text-xs font-semibold text-slate-300">
              Вид процессуального документа (по законодательству РФ):
            </span>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
              <button
                type="button"
                data-testid="claim-doctype-combined"
                onClick={() => setDocType('combined')}
                className={`p-2 rounded-lg border text-left transition-colors ${
                  docType === 'combined'
                    ? 'bg-red-950/50 border-red-500 text-white font-semibold'
                    : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200'
                }`}
              >
                <div className="text-xs">1. Требование + Досудебная претензия</div>
                <div className="text-[10px] text-slate-400 mt-0.5">
                  Единый документ по ст. 304 ГК РФ и СП РФ
                </div>
              </button>
              <button
                type="button"
                data-testid="claim-doctype-demand"
                onClick={() => setDocType('elimination_demand')}
                className={`p-2 rounded-lg border text-left transition-colors ${
                  docType === 'elimination_demand'
                    ? 'bg-red-950/50 border-red-500 text-white font-semibold'
                    : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200'
                }`}
              >
                <div className="text-xs">2. Требование об устранении нарушений</div>
                <div className="text-[10px] text-slate-400 mt-0.5">
                  Для вручения соседу, в Правление СНТ и Администрацию
                </div>
              </button>
              <button
                type="button"
                data-testid="claim-doctype-pretrial"
                onClick={() => setDocType('pretrial_claim')}
                className={`p-2 rounded-lg border text-left transition-colors ${
                  docType === 'pretrial_claim'
                    ? 'bg-red-950/50 border-red-500 text-white font-semibold'
                    : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200'
                }`}
              >
                <div className="text-xs">3. Досудебное требование (претензия в суд)</div>
                <div className="text-[10px] text-slate-400 mt-0.5">
                  Перед подачей негаторного иска по ст. 304 и 222 ГК РФ
                </div>
              </button>
            </div>
          </div>

          {/* Summary of detected violations */}
          <div className="p-3 rounded-lg bg-amber-950/30 border border-amber-600/40 flex items-start gap-2.5">
            <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <div className="font-semibold text-amber-300">
                Зафиксировано нарушений на генплане для включения в Требование: {violations.length}
              </div>
              <p className="text-[11px] text-slate-300">
                Документ формируется автоматически на основании инструментальных обмеров 3D/2D-плана (с точностью до 1 мм): нарушений отступов от межи (3 м / 1 м), противопожарных разрывов (6–15 м), высоты и прозрачности заборов (свыше 1.8 м без согласия), уклонов крыш к соседям и охранных зон ЗОУИТ.
              </p>
            </div>
          </div>

          {/* Parties details form */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="p-3 rounded-lg bg-slate-950 border border-slate-800 space-y-2">
              <div className="font-semibold text-sky-400">Данные Заявителя (Ваши реквизиты):</div>
              <div>
                <label className="block text-[11px] text-slate-400 mb-0.5">ФИО собственника участка</label>
                <input
                  type="text"
                  data-testid="claimant-name-input"
                  value={claimantFullName}
                  onChange={(e) => setClaimantFullName(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded px-2.5 py-1.5 text-xs text-white"
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[11px] text-slate-400 mb-0.5">Кадастровый номер</label>
                  <input
                    type="text"
                    value={claimantCadastral}
                    onChange={(e) => setClaimantCadastral(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-xs font-mono text-white"
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-slate-400 mb-0.5">Срок устранения (дней)</label>
                  <input
                    type="number"
                    min={7}
                    max={180}
                    value={deadlineDays}
                    onChange={(e) => setDeadlineDays(Math.max(7, Number(e.target.value) || 30))}
                    className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-xs font-mono text-white"
                  />
                </div>
              </div>
              <div>
                <label className="block text-[11px] text-slate-400 mb-0.5">Адрес участка Заявителя</label>
                <input
                  type="text"
                  value={claimantAddress}
                  onChange={(e) => setClaimantAddress(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded px-2.5 py-1.5 text-xs text-white"
                />
              </div>
            </div>

            <div className="p-3 rounded-lg bg-slate-950 border border-slate-800 space-y-2">
              <div className="font-semibold text-red-400">Данные Нарушителя (Соседа / Застройщика):</div>
              <div>
                <label className="block text-[11px] text-slate-400 mb-0.5">ФИО правообладателя смежного участка</label>
                <input
                  type="text"
                  data-testid="respondent-name-input"
                  value={respondentFullName}
                  onChange={(e) => setRespondentFullName(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded px-2.5 py-1.5 text-xs text-white"
                />
              </div>
              <div>
                <label className="block text-[11px] text-slate-400 mb-0.5">Кадастровый номер смежного участка</label>
                <input
                  type="text"
                  value={respondentCadastral}
                  onChange={(e) => setRespondentCadastral(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-xs font-mono text-white"
                />
              </div>
              <div>
                <label className="block text-[11px] text-slate-400 mb-0.5">Адрес смежного участка</label>
                <input
                  type="text"
                  value={respondentAddress}
                  onChange={(e) => setRespondentAddress(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded px-2.5 py-1.5 text-xs text-white"
                />
              </div>
            </div>
          </div>

          {/* Violations Table Summary */}
          {violations.length > 0 && (
            <div className="p-3 rounded-lg bg-slate-950 border border-slate-800 space-y-1.5">
              <div className="font-semibold text-slate-200">
                Перечень нарушений, включенных в доказательственную базу Требования:
              </div>
              <div className="max-h-32 overflow-y-auto divide-y divide-slate-800/80 text-[11px]">
                {violations.map((v, i) => (
                  <div key={v.id} className="py-1.5 flex items-center justify-between gap-2">
                    <div>
                      <span className="font-mono text-amber-400 mr-1.5">#{i + 1} [{v.code}]</span>
                      <span className="font-medium text-white">{v.title}</span>
                    </div>
                    {v.measuredValue !== undefined && v.requiredValue !== undefined && (
                      <span className="font-mono text-red-300 shrink-0">
                        Факт: {formatMetersMm(v.measuredValue)} м / Норма: {formatMetersMm(v.requiredValue)} м
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Full Generated Legal Document Text */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-white">
                Готовый юридический текст Требования (Досудебной претензии):
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  data-testid="copy-claim-btn"
                  onClick={handleCopy}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-medium text-white transition-colors"
                >
                  {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  {copied ? 'Скопировано в буфер' : 'Копировать текст'}
                </button>
                <button
                  type="button"
                  data-testid="download-claim-btn"
                  onClick={handleDownloadTxt}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-500 text-xs font-semibold text-white transition-colors"
                >
                  <Download className="w-3.5 h-3.5" />
                  Скачать Требование (.TXT)
                </button>
                <button
                  type="button"
                  onClick={handlePrint}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-sky-600 hover:bg-sky-500 text-xs font-semibold text-white transition-colors"
                >
                  <Printer className="w-3.5 h-3.5" />
                  Печать
                </button>
              </div>
            </div>
            <textarea
              readOnly
              data-testid="claim-document-textarea"
              value={claimText}
              rows={13}
              className="w-full p-3 rounded-lg bg-slate-950 border border-slate-800 text-[11px] font-mono text-slate-200 leading-relaxed focus:outline-none"
            />
          </div>
        </div>
      </div>
    </div>
  );
};

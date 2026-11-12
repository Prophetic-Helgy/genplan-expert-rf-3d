import React, { useState } from 'react';
import { X, Printer, CheckCircle, AlertTriangle, FileCheck } from 'lucide-react';
import { PlotConfig, SiteObject } from '../types';

interface NeighborConsentModalProps {
  isOpen: boolean;
  plot: PlotConfig;
  objects: SiteObject[];
  targetEdgeIndex?: number;
  targetObjectId?: string;
  onClose: () => void;
  onMarkConsentSigned: (edgeIndex: number) => void;
}

export const NeighborConsentModal: React.FC<NeighborConsentModalProps> = ({
  isOpen,
  plot,
  objects,
  targetEdgeIndex = 1,
  targetObjectId,
  onClose,
  onMarkConsentSigned
}) => {
  const [ownerFio, setOwnerFio] = useState('Иванов Иван Иванович');
  const [ownerPassport, setOwnerPassport] = useState('4512 № 654321, выдан ГУ МВД России');
  const [ownerCadastre, setOwnerCadastre] = useState('50:21:0040112:458');
  const [ownerAddress, setOwnerAddress] = useState('Московская обл., СНТ «Зодчий», уч. 42');

  const [neighborFio, setNeighborFio] = useState('Петров Сергей Александрович');
  const [neighborPassport, setNeighborPassport] = useState('4515 № 112233, выдан ОУФМС России');
  const [neighborCadastre, setNeighborCadastre] = useState('50:21:0040112:459');
  const [neighborAddress, setNeighborAddress] = useState('Московская обл., СНТ «Зодчий», уч. 43');

  const [consentSubject, setConsentSubject] = useState<'fence' | 'outbuilding' | 'house'>(
    targetObjectId ? 'outbuilding' : 'fence'
  );
  const [customFenceHeight, setCustomFenceHeight] = useState(
    plot.edges[targetEdgeIndex]?.fenceHeight || 2.0
  );
  const [customSetbackM, setCustomSetbackM] = useState(0.8);

  if (!isOpen) return null;

  const targetObj = objects.find((o) => o.id === targetObjectId) || objects[0];
  const todayStr = new Date().toLocaleDateString('ru-RU');

  const handlePrintConsent = () => {
    window.print();
  };

  const handleApplyAndClose = () => {
    onMarkConsentSigned(targetEdgeIndex);
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-950/80 flex items-center justify-center p-4 overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-labelledby="consent-modal-title"
    >
      <div className="bg-slate-900 border border-slate-700 rounded-xl max-w-4xl w-full overflow-hidden shadow-2xl flex flex-col max-h-[92vh]">
        {/* Modal Header */}
        <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between">
          <div>
            <h2 id="consent-modal-title" className="text-base font-bold text-white flex items-center gap-2">
              <FileCheck className="w-5 h-5 text-amber-400" />
              Генератор юридического согласия собственника смежного участка (РФ)
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Соответствует ст. 209, 263 ГК РФ и п. 6.2 СП 53.13330.2019 (установка глухого ограждения / согласование отступов)
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Закрыть окно согласия"
            className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body: Left Form Inputs, Right Printable Document Preview */}
        <div className="flex-1 overflow-y-auto p-6 grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Form Controls */}
          <div className="lg:col-span-5 space-y-4">
            {/* Strict Legal Warning Banner */}
            <div className="p-3 rounded-lg bg-amber-950/40 border border-amber-700/70 space-y-1">
              <div className="text-xs font-semibold text-amber-300 flex items-center gap-1.5">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                Юридическое предупреждение
              </div>
              <p className="text-[11px] text-amber-100/90 leading-relaxed">
                Согласие соседа имеет полную юридическую силу для установки <strong>глухого забора</strong> на меже в СНТ. Однако при уменьшении отступа жилого дома (&lt; 3 м) расписка соседа НЕ отменяет муниципальные ПЗЗ и пожарные разрывы СП 4.13130.2013 (6–15 м)! Рекомендуется нотариальное удостоверение.
              </p>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">
                Предмет согласования
              </label>
              <select
                value={consentSubject}
                onChange={(e) => setConsentSubject(e.target.value as 'fence' | 'outbuilding' | 'house')}
                className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white"
              >
                <option value="fence">Установка глухого / высокого забора на меже (п. 6.2 СП 53.13330)</option>
                <option value="outbuilding">Размещение хозпостройки ближе 1.0 м от межи</option>
                <option value="house">Уменьшение межевого отступа жилого дома (&lt; 3.0 м)</option>
              </select>
            </div>

            {consentSubject === 'fence' ? (
              <div>
                <label className="block text-xs text-slate-400 mb-1">
                  Согласуемая высота глухого забора (м)
                </label>
                <input
                  type="number"
                  step={0.1}
                  min={1.2}
                  max={3.0}
                  value={customFenceHeight}
                  onChange={(e) => setCustomFenceHeight(Number(e.target.value) || 2.0)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-1.5 text-xs font-mono text-white"
                />
              </div>
            ) : (
              <div>
                <label className="block text-xs text-slate-400 mb-1">
                  Фактический отступ постройки от межи (м)
                </label>
                <input
                  type="number"
                  step={0.1}
                  min={0.1}
                  max={3.0}
                  value={customSetbackM}
                  onChange={(e) => setCustomSetbackM(Number(e.target.value) || 0.8)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-1.5 text-xs font-mono text-white"
                />
              </div>
            )}

            <div className="space-y-2 pt-2 border-t border-slate-800">
              <div className="text-xs font-semibold text-sky-400">
                1. Данные соседа (кто дает согласие)
              </div>
              <input
                type="text"
                value={neighborFio}
                onChange={(e) => setNeighborFio(e.target.value)}
                placeholder="ФИО соседа полностью"
                className="w-full bg-slate-950 border border-slate-700 rounded px-2.5 py-1.5 text-xs text-white"
              />
              <input
                type="text"
                value={neighborPassport}
                onChange={(e) => setNeighborPassport(e.target.value)}
                placeholder="Паспортные данные соседа"
                className="w-full bg-slate-950 border border-slate-700 rounded px-2.5 py-1.5 text-xs text-white"
              />
              <div className="grid grid-cols-2 gap-2">
                <input
                  type="text"
                  value={neighborCadastre}
                  onChange={(e) => setNeighborCadastre(e.target.value)}
                  placeholder="Кадастровый номер соседа"
                  className="w-full bg-slate-950 border border-slate-700 rounded px-2.5 py-1.5 text-xs font-mono text-white"
                />
                <input
                  type="text"
                  value={neighborAddress}
                  onChange={(e) => setNeighborAddress(e.target.value)}
                  placeholder="Адрес участка соседа"
                  className="w-full bg-slate-950 border border-slate-700 rounded px-2.5 py-1.5 text-xs text-white"
                />
              </div>
            </div>

            <div className="space-y-2 pt-2 border-t border-slate-800">
              <div className="text-xs font-semibold text-emerald-400">
                2. Ваши данные (застройщик)
              </div>
              <input
                type="text"
                value={ownerFio}
                onChange={(e) => setOwnerFio(e.target.value)}
                placeholder="Ваше ФИО полностью"
                className="w-full bg-slate-950 border border-slate-700 rounded px-2.5 py-1.5 text-xs text-white"
              />
              <input
                type="text"
                value={ownerPassport}
                onChange={(e) => setOwnerPassport(e.target.value)}
                placeholder="Ваши паспортные данные"
                className="w-full bg-slate-950 border border-slate-700 rounded px-2.5 py-1.5 text-xs text-white"
              />
              <div className="grid grid-cols-2 gap-2">
                <input
                  type="text"
                  value={ownerCadastre}
                  onChange={(e) => setOwnerCadastre(e.target.value)}
                  placeholder="Ваш кадастровый номер"
                  className="w-full bg-slate-950 border border-slate-700 rounded px-2.5 py-1.5 text-xs font-mono text-white"
                />
                <input
                  type="text"
                  value={ownerAddress}
                  onChange={(e) => setOwnerAddress(e.target.value)}
                  placeholder="Адрес вашего участка"
                  className="w-full bg-slate-950 border border-slate-700 rounded px-2.5 py-1.5 text-xs text-white"
                />
              </div>
            </div>
          </div>

          {/* Printable Legal Document Sheet */}
          <div className="lg:col-span-7 bg-white text-slate-900 rounded-lg p-6 shadow-inner text-xs leading-relaxed font-serif space-y-4">
            <div className="text-center space-y-1 border-b border-slate-300 pb-3">
              <div className="text-sm font-bold uppercase tracking-wide">
                СОГЛАСИЕ СОБСТВЕННИКА СМЕЖНОГО ЗЕМЕЛЬНОГО УЧАСТКА
              </div>
              <div className="text-[11px] text-slate-600">
                на {consentSubject === 'fence' ? 'установку глухого ограждения по смежной границе' : 'размещение строения с уменьшением нормативного отступа от межи'}
              </div>
            </div>

            <div className="flex justify-between text-[11px] text-slate-700">
              <span>Место составления: Российская Федерация</span>
              <span>Дата: {todayStr} г.</span>
            </div>

            <p className="text-justify">
              Я, нижеподписавшийся(-аяся) гражданин(-ка) РФ <strong>{neighborFio}</strong>, паспорт серия и номер: <strong>{neighborPassport}</strong>, являясь законным собственником земельного участка с кадастровым номером <strong>{neighborCadastre}</strong>, расположенного по адресу: <em>{neighborAddress}</em>,
            </p>

            <p className="text-justify">
              настоящим даю свое добровольное, безусловное и бессрочное письменное согласие собственнику смежного земельного участка с кадастровым номером <strong>{ownerCadastre}</strong> (расположенного по адресу: <em>{ownerAddress}</em>) гражданину(-ке) РФ <strong>{ownerFio}</strong> (паспорт: {ownerPassport}) на выполнение следующих строительно-монтажных работ по смежной границе наших участков:
            </p>

            {consentSubject === 'fence' ? (
              <div className="p-3 bg-slate-100 border border-slate-300 rounded text-slate-900">
                <strong>Предмет согласования (в соответствии с п. 6.2 СП 53.13330.2019):</strong> Установка сплошного (глухого, светонепроницаемого) ограждения из профилированного стального листа / камня по смежной межевой границе между участками с кадастровыми номерами {neighborCadastre} и {ownerCadastre} высотой до <strong>{customFenceHeight.toFixed(2)} м</strong>. Претензий по вопросу инсоляции и затенения прилегающей территории не имею.
              </div>
            ) : (
              <div className="p-3 bg-slate-100 border border-slate-300 rounded text-slate-900">
                <strong>Предмет согласования (отступ от межи):</strong> Строительство и регистрация объекта «{targetObj?.name || 'Постройка'}» (габариты в плане {targetObj?.width || 6}×{targetObj?.length || 8} м, высота стен {targetObj?.wallHeight || 3} м) на расстоянии <strong>{customSetbackM.toFixed(2)} м</strong> от общей межевой границы наших участков при условии организации организованного водостока и снегозадержания на территорию участка застройщика ({ownerCadastre}).
              </div>
            )}

            <p className="text-justify text-[11px] text-slate-700">
              Настоящее согласие составлено в двух экземплярах, имеющих равную юридическую силу, по одному для каждой из сторон. Я подтверждаю, что ознакомлен(-а) с проектными габаритами и расположением объекта, и обязуюсь не предъявлять судебных исков по ст. 304 ГК РФ по указанным параметрам, в том числе при переходе права собственности на участок.
            </p>

            <div className="pt-6 grid grid-cols-2 gap-6 border-t border-slate-300 text-[11px]">
              <div>
                <div className="font-bold mb-4">Собственник смежного участка (Сосед):</div>
                <div className="border-b border-slate-400 pb-1 mb-1">
                  ___________________ / {neighborFio}
                </div>
                <div className="text-[10px] text-slate-500">(личная подпись и расшифровка ФИО)</div>
              </div>
              <div>
                <div className="font-bold mb-4">Застройщик (Собственник участка):</div>
                <div className="border-b border-slate-400 pb-1 mb-1">
                  ___________________ / {ownerFio}
                </div>
                <div className="text-[10px] text-slate-500">(личная подпись и расшифровка ФИО)</div>
              </div>
            </div>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="px-6 py-4 bg-slate-950 border-t border-slate-800 flex flex-wrap items-center justify-between gap-3">
          <button
            type="button"
            onClick={handleApplyAndClose}
            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold rounded-lg flex items-center gap-2 transition-colors"
          >
            <CheckCircle className="w-4 h-4" />
            Отметить согласие подписанным и снять предупреждение
          </button>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handlePrintConsent}
              className="px-4 py-2 bg-sky-600 hover:bg-sky-500 text-white text-xs font-semibold rounded-lg flex items-center gap-2 transition-colors"
            >
              <Printer className="w-4 h-4" />
              Печать / Сохранить бланк в PDF
            </button>
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
    </div>
  );
};

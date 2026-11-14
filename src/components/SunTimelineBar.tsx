import React, { useEffect, useState } from 'react';
import { Sun, Play, Pause, Eye, EyeOff, ChevronDown, ChevronUp, Layers, Sparkles, Flame } from 'lucide-react';

interface SunTimelineBarProps {
  dayOfYear: number;
  hourOfDay: number;
  viewMode: '3d' | '2d';
  showForbiddenZones: boolean;
  xrayWallsMode: boolean;
  undergroundViewMode: boolean;
  thermalHeatmapMode: boolean;
  onChangeDay: (day: number) => void;
  onChangeHour: (hour: number) => void;
  onToggleViewMode: (mode: '3d' | '2d') => void;
  onToggleForbiddenZones: () => void;
  onToggleXrayWalls: (forceValue?: boolean) => void;
  onToggleUndergroundView: (forceValue?: boolean) => void;
  onToggleThermalHeatmap: (forceValue?: boolean) => void;
}

const SOLSTICE_PRESETS = [
  { id: 'spring', label: '21 Мар (Весна)', day: 80 },
  { id: 'summer', label: '21 Июн (Лето)', day: 172 },
  { id: 'autumn', label: '23 Сен (Осень)', day: 266 },
  { id: 'winter', label: '21 Дек (Зима)', day: 355 }
];

export const SunTimelineBar: React.FC<SunTimelineBarProps> = ({
  dayOfYear,
  hourOfDay,
  viewMode,
  showForbiddenZones,
  xrayWallsMode,
  undergroundViewMode,
  thermalHeatmapMode,
  onChangeDay,
  onChangeHour,
  onToggleViewMode,
  onToggleForbiddenZones,
  onToggleXrayWalls,
  onToggleUndergroundView,
  onToggleThermalHeatmap
}) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(false);

  useEffect(() => {
    if (!isPlaying) return;
    const timer = window.setInterval(() => {
      onChangeHour(hourOfDay >= 21.5 ? 5.0 : Number((hourOfDay + 0.25).toFixed(2)));
    }, 180);
    return () => clearInterval(timer);
  }, [isPlaying, hourOfDay, onChangeHour]);

  const handleTogglePlay = () => {
    setIsPlaying((prev) => {
      const next = !prev;
      if (next && !xrayWallsMode) {
        onToggleXrayWalls(true);
      }
      return next;
    });
  };

  const formatTime = (h: number) => {
    const hrs = Math.floor(h);
    const mins = Math.round((h - hrs) * 60);
    return `${String(hrs).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;
  };

  const formatDateFromDay = (day: number) => {
    const d = new Date(2026, 0, day);
    return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
  };

  return (
    <div
      data-testid="sun-timeline-bar"
      className="absolute bottom-3 left-1/2 -translate-x-1/2 z-20 w-[min(680px,95%)] pointer-events-auto"
    >
      {/* Collapse/Expand Handle */}
      <div className="flex justify-center mb-1">
        <button
          type="button"
          onClick={() => setIsCollapsed((c) => !c)}
          className="px-3 py-1 text-[11px] font-medium bg-slate-900/95 hover:bg-slate-800 text-slate-300 border border-slate-700/80 rounded-t-lg flex items-center gap-1 transition-colors whitespace-nowrap"
        >
          {isCollapsed ? (
            <>
              <ChevronUp className="w-3.5 h-3.5" />
              Показать панель режимов и инсоляции
            </>
          ) : (
            <>
              <ChevronDown className="w-3.5 h-3.5" />
              Скрыть панель управления
            </>
          )}
        </button>
      </div>

      {!isCollapsed && (
        <div
          data-testid="sun-timeline-panel"
          className="p-2.5 bg-slate-900/95 border border-slate-700/90 rounded-xl shadow-2xl space-y-2"
        >
          {/* Top Row: View Mode Switcher + Visualization Modes */}
          <div className="flex flex-wrap items-center justify-between gap-1.5">
            {/* 2D / 3D Switch */}
            <div className="flex items-center gap-1 p-0.5 bg-slate-950 rounded-lg border border-slate-800">
              <button
                type="button"
                onClick={() => onToggleViewMode('3d')}
                className={`px-2 py-1 text-[11px] font-semibold rounded transition-colors whitespace-nowrap ${
                  viewMode === '3d'
                    ? 'bg-sky-600 text-white'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                3D Сцена
              </button>
              <button
                type="button"
                onClick={() => onToggleViewMode('2d')}
                className={`px-2 py-1 text-[11px] font-semibold rounded transition-colors whitespace-nowrap ${
                  viewMode === '2d'
                    ? 'bg-sky-600 text-white'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                2D Чертеж
              </button>
            </div>

            {/* Visualization Mode Toggles Group */}
            <div className="flex flex-wrap items-center gap-1">
              {/* Semi-Transparent Walls / Sunlight Patch Inside House Toggle */}
              <button
                type="button"
                data-testid="toggle-xray-walls"
                onClick={() => onToggleXrayWalls()}
                className={`px-2 py-1 text-[11px] font-medium rounded-lg border flex items-center gap-1 transition-colors whitespace-nowrap ${
                  xrayWallsMode
                    ? 'bg-amber-500/20 border-amber-400 text-amber-200 shadow-sm'
                    : 'bg-slate-950 border-slate-800 text-slate-300 hover:text-white hover:border-slate-700'
                }`}
                title="Полупрозрачность стен и крыши для отслеживания светового пятна внутри дома через окна"
              >
                <Sparkles className={`w-3 h-3 ${xrayWallsMode ? 'text-amber-400' : 'text-slate-400'}`} />
                <span>Световое пятно: {xrayWallsMode ? 'ВКЛ' : 'ВЫКЛ'}</span>
              </button>

              {/* 3D Facade Thermal Heatmap Toggle */}
              <button
                type="button"
                data-testid="toggle-thermal-heatmap"
                onClick={() => onToggleThermalHeatmap()}
                className={`px-2 py-1 text-[11px] font-medium rounded-lg border flex items-center gap-1 transition-colors whitespace-nowrap ${
                  thermalHeatmapMode
                    ? 'bg-rose-500/25 border-rose-400 text-rose-200 shadow-sm'
                    : 'bg-slate-950 border-slate-800 text-slate-300 hover:text-white hover:border-slate-700'
                }`}
                title="Тепловая карта фасадов здания: показывает зоны повышенных теплопотерь от материала стен и процента остекления"
              >
                <Flame className={`w-3 h-3 ${thermalHeatmapMode ? 'text-rose-400' : 'text-slate-400'}`} />
                <span>Тепловая карта: {thermalHeatmapMode ? 'ВКЛ' : 'ВЫКЛ'}</span>
              </button>

              {/* Underground Utilities & Basement Inspection Mode Toggle */}
              <button
                type="button"
                data-testid="toggle-underground-btn"
                onClick={() => onToggleUndergroundView()}
                className={`px-2 py-1 text-[11px] font-medium rounded-lg border flex items-center gap-1 transition-colors whitespace-nowrap ${
                  undergroundViewMode
                    ? 'bg-cyan-500/25 border-cyan-400 text-cyan-200 shadow-sm'
                    : 'bg-slate-950 border-slate-800 text-slate-300 hover:text-white hover:border-slate-700'
                }`}
                title="Полупрозрачный грунт для просмотра подземного этажа, плиты фундамента, глубины заложения труб и уровня промерзания"
              >
                <Layers className={`w-3 h-3 ${undergroundViewMode ? 'text-cyan-400' : 'text-slate-400'}`} />
                <span>Подземный вид: {undergroundViewMode ? 'ВКЛ' : 'ВЫКЛ'}</span>
              </button>

              {/* Forbidden Red Zones Toggle */}
              <button
                type="button"
                onClick={onToggleForbiddenZones}
                className={`px-2 py-1 text-[11px] font-medium rounded-lg border flex items-center gap-1 transition-colors whitespace-nowrap ${
                  showForbiddenZones
                    ? 'bg-red-950/60 border-red-500/60 text-red-200'
                    : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200'
                }`}
              >
                {showForbiddenZones ? (
                  <>
                    <Eye className="w-3 h-3 text-red-400" />
                    Отступы: ВКЛ
                  </>
                ) : (
                  <>
                    <EyeOff className="w-3 h-3" />
                    Отступы: ВЫКЛ
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Stacked Sliders Section: 1. Дата года (TOP) -> 2. Время суток (BOTTOM) */}
          <div className="flex flex-col gap-2 pt-1.5 border-t border-slate-800/80">
            {/* 1. Day of Year Slider (ABOVE Time of Day) */}
            <div data-testid="day-of-year-row" className="space-y-1">
              <div className="flex flex-wrap items-center justify-between gap-1 text-[11px]">
                <span className="text-slate-300 font-medium flex items-center gap-1 whitespace-nowrap">
                  <Layers className="w-3 h-3 text-sky-400 shrink-0" />
                  Дата года
                </span>

                {/* Quick Solstice & Equinox Buttons */}
                <div className="flex flex-wrap items-center gap-1" data-testid="solstice-presets-bar">
                  {SOLSTICE_PRESETS.map((p) => (
                    <button
                      key={p.day}
                      type="button"
                      data-testid={`solstice-preset-${p.id}`}
                      onClick={() => onChangeDay(p.day)}
                      className={`px-1.5 py-0.5 text-[10px] font-medium rounded border transition-colors whitespace-nowrap ${
                        Math.abs(dayOfYear - p.day) <= 3
                          ? 'bg-amber-500/20 border-amber-500/60 text-amber-300 font-semibold'
                          : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>

                <span className="font-mono font-semibold text-sky-400 whitespace-nowrap">
                  {formatDateFromDay(dayOfYear)} (день {dayOfYear})
                </span>
              </div>
              <input
                type="range"
                aria-label="День года"
                data-testid="day-of-year-slider"
                min={1}
                max={365}
                step={1}
                value={dayOfYear}
                onChange={(e) => onChangeDay(Number(e.target.value))}
                className="w-full accent-sky-400 cursor-pointer"
              />
            </div>

            {/* 2. Time of Day Slider (BELOW Day of Year) */}
            <div data-testid="hour-of-day-row" className="flex items-center gap-2.5">
              <button
                type="button"
                data-testid="sun-play-btn"
                onClick={handleTogglePlay}
                aria-label={isPlaying ? 'Остановить анимацию солнца' : 'Анимация светового дня'}
                className="px-2.5 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-semibold flex items-center gap-1 shrink-0 transition-colors"
              >
                {isPlaying ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                <span>{isPlaying ? 'Стоп' : 'Ход солнца'}</span>
              </button>

              <div className="flex-1 space-y-0.5">
                <div className="flex justify-between text-[11px]">
                  <span className="text-slate-300 font-medium flex items-center gap-1">
                    <Sun className="w-3 h-3 text-amber-400 shrink-0" />
                    Время суток (инсоляция, тени и световое пятно в доме)
                  </span>
                  <span className="font-mono font-semibold text-amber-400 whitespace-nowrap">
                    {formatTime(hourOfDay)}
                  </span>
                </div>
                <input
                  type="range"
                  aria-label="Время суток"
                  data-testid="hour-of-day-slider"
                  min={4}
                  max={22}
                  step={0.25}
                  value={hourOfDay}
                  onChange={(e) => onChangeHour(Number(e.target.value))}
                  className="w-full accent-amber-400 cursor-pointer"
                />
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

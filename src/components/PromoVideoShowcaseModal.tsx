import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Film,
  Play,
  Pause,
  RotateCcw,
  SkipBack,
  SkipForward,
  Maximize2,
  Minimize2,
  Download,
  Camera,
  CheckCircle2,
  ShieldCheck,
  Sparkles,
  Eye,
  Monitor,
  X
} from 'lucide-react';
import { PlotConfig, SiteObject, NormViolation } from '../types';
import {
  PROMO_VIDEO_RESOLUTIONS,
  PROMO_VIDEO_SCENES,
  PROMO_VIDEO_TOTAL_DURATION_SEC,
  PromoSceneStateAction,
  PromoVideoResolutionId,
  PromoVideoScene,
  computeLivePromoSceneMetrics,
  getPromoSceneAtTime
} from '../utils/promoVideoScript';
import { renderPromoVideoFrameOnCanvas } from '../utils/promoCanvasRenderer';
import { exportPromoVideoToMp4 } from '../utils/mp4VideoExporter';

interface PromoVideoShowcaseModalProps {
  isOpen: boolean;
  plot: PlotConfig;
  objects: SiteObject[];
  violations: NormViolation[];
  onClose: () => void;
  onApplyPromoSceneState: (action: PromoSceneStateAction) => void;
  getCanvasSnapshot: () => string | null;
}

export const PromoVideoShowcaseModal: React.FC<PromoVideoShowcaseModalProps> = ({
  isOpen,
  plot,
  objects,
  violations,
  onClose,
  onApplyPromoSceneState,
  getCanvasSnapshot
}) => {
  const [elapsedSec, setElapsedSec] = useState<number>(0);
  const [isPlaying, setIsPlaying] = useState<boolean>(true);
  const [playbackSpeed, setPlaybackSpeed] = useState<number>(1);
  const [resolutionId, setResolutionId] = useState<PromoVideoResolutionId>('1080p');
  const resolutionIdRef = useRef<PromoVideoResolutionId>('1080p');
  const [presentationMode, setPresentationMode] = useState<'studio' | 'hud'>('studio');
  const [isRecordingWebm, setIsRecordingWebm] = useState<boolean>(false);
  const [isExportingMp4, setIsExportingMp4] = useState<boolean>(false);
  const [recordingStatusText, setRecordingStatusText] = useState<string>('');

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const liveSnapshotImgRef = useRef<HTMLImageElement | null>(null);
  const lastAppliedSceneIdRef = useRef<string>('');
  const lastSunSyncTimeRef = useRef<number>(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);

  const resSpec = PROMO_VIDEO_RESOLUTIONS[resolutionId] || PROMO_VIDEO_RESOLUTIONS['1080p'];

  const { scene: activeScene, sceneLocalProgress01, overallProgress01 } = useMemo(
    () => getPromoSceneAtTime(elapsedSec),
    [elapsedSec]
  );

  const liveMetrics = useMemo(
    () => computeLivePromoSceneMetrics(activeScene, plot, objects, violations.length),
    [activeScene, plot, objects, violations.length]
  );

  const refreshLiveSnapshot = useCallback(() => {
    // Live 3D/2D canvas is rendered synchronously via window.__renderLiveViewportCanvasForPromo
  }, []);

  // Synchronize live application workspace state whenever the active promo scene changes in HUD mode
  useEffect(() => {
    if (!isOpen) {
      lastAppliedSceneIdRef.current = '';
      (window as unknown as { __restoreViewportAfterPromo?: () => void }).__restoreViewportAfterPromo?.();
      return;
    }
    if (presentationMode === 'hud' && lastAppliedSceneIdRef.current !== activeScene.id) {
      lastAppliedSceneIdRef.current = activeScene.id;
      onApplyPromoSceneState(activeScene.appAction);
    }
  }, [activeScene, isOpen, onApplyPromoSceneState, presentationMode]);

  // Main timeline progression loop (throttled to ~15 FPS so software WebGL + UI controls stay snappy)
  useEffect(() => {
    if (!isOpen || !isPlaying || isExportingMp4) return;
    let lastTs = performance.now();
    let rafId = 0;

    const tick = (now: number) => {
      const elapsedMs = now - lastTs;
      if (elapsedMs >= 66) {
        const dt = Math.min(0.15, Math.max(0, elapsedMs / 1000));
        lastTs = now;
        setElapsedSec((prev) => {
          const next = prev + dt * playbackSpeed;
          if (next >= PROMO_VIDEO_TOTAL_DURATION_SEC) {
            if (
              isRecordingWebm &&
              mediaRecorderRef.current &&
              mediaRecorderRef.current.state === 'recording'
            ) {
              mediaRecorderRef.current.stop();
            }
            return 0;
          }
          return next;
        });
      }
      rafId = window.requestAnimationFrame(tick);
    };

    rafId = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(rafId);
  }, [isOpen, isPlaying, isExportingMp4, playbackSpeed, isRecordingWebm]);

  // Pure Code-Generated 16:9 Canvas Renderer (1920x1080 Full HD, 2560x1440 2K, 3840x2160 4K)
  useEffect(() => {
    if (!isOpen || isExportingMp4) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    renderPromoVideoFrameOnCanvas({
      ctx,
      canvasWidth: resSpec.width,
      canvasHeight: resSpec.height,
      resolutionId,
      activeScene,
      elapsedSec,
      sceneLocalProgress01,
      overallProgress01,
      liveMetrics,
      liveSnapshotImg: liveSnapshotImgRef.current
    });
  }, [
    activeScene,
    elapsedSec,
    isExportingMp4,
    isOpen,
    liveMetrics,
    overallProgress01,
    presentationMode,
    resSpec.height,
    resSpec.width,
    resolutionId,
    sceneLocalProgress01
  ]);

  const handleSelectScene = (scene: PromoVideoScene) => {
    setElapsedSec(scene.startSec + 0.35);
    if (presentationMode === 'hud') {
      onApplyPromoSceneState(scene.appAction);
    }
  };

  const handlePrevScene = () => {
    const prevIdx = Math.max(0, activeScene.index - 2);
    handleSelectScene(PROMO_VIDEO_SCENES[prevIdx]);
  };

  const handleNextScene = () => {
    const nextIdx = Math.min(PROMO_VIDEO_SCENES.length - 1, activeScene.index);
    handleSelectScene(PROMO_VIDEO_SCENES[nextIdx]);
  };

  const handleCaptureFramePng = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const url = canvas.toDataURL('image/png');
    const a = document.createElement('a');
    a.href = url;
    a.download = `promo-frame-scene-${activeScene.index}-${resSpec.width}x${resSpec.height}.png`;
    a.click();
    setRecordingStatusText(`Кадр PNG (${resSpec.width}×${resSpec.height}) скачан`);
  };

  const handleExportMp4 = async () => {
    if (isExportingMp4) return;
    const activeResId = resolutionIdRef.current;
    const activeResSpec = PROMO_VIDEO_RESOLUTIONS[activeResId] || PROMO_VIDEO_RESOLUTIONS['1080p'];
    setIsExportingMp4(true);
    setRecordingStatusText(`Подготовка экспорта MP4 (${activeResSpec.shortLabel} 16:9)...`);
    try {
      const meta = await exportPromoVideoToMp4({
        resolutionId: activeResId,
        plot,
        objects,
        violationsCount: violations.length,
        liveSnapshotImg: liveSnapshotImgRef.current,
        onProgress: (_prog, msg) => {
          setRecordingStatusText(msg);
        }
      });
      setRecordingStatusText(
        `MP4 скачан: ${meta.filename} (${meta.width}×${meta.height}, 16:9)`
      );
    } catch {
      setRecordingStatusText('Ошибка при экспорте MP4');
    } finally {
      setIsExportingMp4(false);
    }
  };

  const handleStartOrStopWebmRecording = () => {
    if (isRecordingWebm && mediaRecorderRef.current) {
      mediaRecorderRef.current.stop();
      return;
    }
    const canvas = canvasRef.current;
    if (
      !canvas ||
      typeof canvas.captureStream !== 'function' ||
      typeof MediaRecorder === 'undefined'
    ) {
      handleCaptureFramePng();
      return;
    }

    try {
      recordedChunksRef.current = [];
      const stream = canvas.captureStream(30);
      const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9')
        ? 'video/webm;codecs=vp9'
        : 'video/webm';
      const recorder = new MediaRecorder(stream, {
        mimeType,
        videoBitsPerSecond: resSpec.bitratebps
      });

      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          recordedChunksRef.current.push(e.data);
        }
      };

      recorder.onstop = () => {
        setIsRecordingWebm(false);
        const blob = new Blob(recordedChunksRef.current, { type: 'video/webm' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `promo-genplan-expert-${resSpec.id}-${resSpec.width}x${resSpec.height}.webm`;
        a.click();
        URL.revokeObjectURL(url);
        setRecordingStatusText(
          `Видеоролик .WEBM (${resSpec.width}×${resSpec.height}) скачан`
        );
      };

      mediaRecorderRef.current = recorder;
      setElapsedSec(0);
      setIsPlaying(true);
      setIsRecordingWebm(true);
      setRecordingStatusText(`Идет запись .WEBM (${resSpec.shortLabel})...`);
      recorder.start(200);
    } catch {
      handleCaptureFramePng();
    }
  };

  if (!isOpen) return null;

  // LIVE HUD MODE: Floating broadcast overlays directly over the working 3D/2D application workspace
  if (presentationMode === 'hud') {
    return (
      <div
        data-testid="promo-live-hud-overlay"
        className="fixed inset-x-3 top-15 bottom-3 z-40 pointer-events-none flex flex-col justify-between gap-3"
      >
        {/* Hidden canvas at exact selected 16:9 resolution so MP4/WebM export stays warm */}
        <canvas
          ref={canvasRef}
          width={resSpec.width}
          height={resSpec.height}
          className="hidden"
        />

        {/* Top Live Broadcast Director Bar */}
        <div className="pointer-events-auto mx-auto w-full max-w-6xl bg-slate-950/95 border border-sky-500/50 rounded-2xl shadow-2xl px-4 py-3 backdrop-blur-md overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-2.5">
            <div className="flex items-center gap-2.5 min-w-0 flex-1">
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-rose-600 text-white text-[11px] font-bold tracking-wide uppercase shrink-0">
                <span className="w-2 h-2 rounded-full bg-white animate-pulse" />
                ЖИВОЙ ПОКАЗ ({resSpec.shortLabel})
              </span>
              <div className="min-w-0 flex-1">
                <div className="text-[11px] font-bold text-sky-400 uppercase tracking-wider truncate">
                  {activeScene.kicker} · {activeScene.normativeCode}
                </div>
                <div className="text-sm font-bold text-white truncate">
                  {activeScene.headline}
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-1.5 shrink-0">
              <button
                type="button"
                data-testid="promo-play-pause-btn"
                onClick={() => setIsPlaying((p) => !p)}
                className="px-3 py-1.5 rounded-lg bg-sky-600 hover:bg-sky-500 text-white text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
              >
                {isPlaying ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                <span>{isPlaying ? 'Пауза' : 'Пуск'}</span>
              </button>
              <button
                type="button"
                data-testid="promo-export-mp4-btn"
                onClick={handleExportMp4}
                disabled={isExportingMp4}
                className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-60 text-white text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Экспорт .MP4 ({resSpec.shortLabel})</span>
              </button>
              <button
                type="button"
                data-testid="promo-toggle-hud-mode-btn"
                onClick={() => setPresentationMode('studio')}
                className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
              >
                <Maximize2 className="w-3.5 h-3.5" />
                <span>Студия 16:9</span>
              </button>
              <button
                type="button"
                data-testid="promo-close-btn"
                onClick={onClose}
                className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 cursor-pointer"
                title="Закрыть промо-ролик"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Scene Quick Switcher Pills (Wrapped cleanly so nothing overflows) */}
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            {PROMO_VIDEO_SCENES.map((s) => (
              <button
                key={s.id}
                type="button"
                data-testid={`promo-scene-btn-${s.index}`}
                onClick={() => handleSelectScene(s)}
                className={`px-2.5 py-1 rounded-md text-[11px] font-semibold transition-colors cursor-pointer ${
                  s.id === activeScene.id
                    ? 'bg-sky-500 text-slate-950 font-bold'
                    : 'bg-slate-900 text-slate-300 hover:bg-slate-800'
                }`}
              >
                {s.index}. {s.kicker.replace(/^СЦЕНА \d+ · /, '')}
              </button>
            ))}
          </div>
        </div>

        {/* Bottom Live Explanatory Text Plaques over the Real 3D/2D Viewport */}
        <div className="pointer-events-auto mx-auto w-full max-w-6xl grid grid-cols-1 md:grid-cols-2 gap-3">
          <div
            data-testid="promo-plaque-what-happens"
            className="bg-slate-950/95 border-2 border-sky-500/70 rounded-xl p-3.5 shadow-2xl backdrop-blur-md min-w-0 overflow-hidden"
          >
            <div className="flex items-center gap-2 text-xs font-bold text-sky-400 uppercase tracking-wider mb-1">
              <Eye className="w-4 h-4 shrink-0" />
              <span className="truncate">Что происходит на экране</span>
            </div>
            <p className="text-xs sm:text-sm text-slate-100 leading-relaxed break-words">
              {activeScene.whatHappensOnScreen}
            </p>
          </div>

          <div
            data-testid="promo-plaque-why-done"
            className="bg-slate-950/95 border-2 border-emerald-500/70 rounded-xl p-3.5 shadow-2xl backdrop-blur-md min-w-0 overflow-hidden"
          >
            <div className="flex items-center gap-2 text-xs font-bold text-emerald-400 uppercase tracking-wider mb-1">
              <ShieldCheck className="w-4 h-4 shrink-0" />
              <span className="truncate">Зачем это делается (выгода и защита)</span>
            </div>
            <p className="text-xs sm:text-sm text-slate-100 leading-relaxed break-words">
              {activeScene.whyItIsDone}
            </p>
          </div>
        </div>
      </div>
    );
  }

  // STUDIO 16:9 CODE-GENERATED VIDEO PLAYER MODAL (Full HD 1080p / 2K 1440p / 4K 2160p)
  return (
    <div
      data-testid="promo-video-modal"
      className="fixed inset-0 z-50 bg-slate-950/90 backdrop-blur-md flex items-center justify-center p-2 sm:p-4 overflow-y-auto"
    >
      <div className="w-full max-w-6xl bg-slate-900 border border-slate-700/80 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[96vh]">
        {/* Modal Header */}
        <div className="px-4 sm:px-5 py-3 bg-slate-950 border-b border-slate-800 flex flex-wrap items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-sky-500/15 border border-sky-500/40 flex items-center justify-center text-sky-400 shrink-0">
              <Film className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h2
                  data-testid="promo-video-modal-title"
                  className="text-sm sm:text-base font-bold text-white break-words"
                >
                  Промо рекламный ролик «ГенПлан-Эксперт РФ 3D»
                </h2>
                <span
                  data-testid="promo-active-resolution-badge"
                  className="px-2 py-0.5 text-[10px] font-mono font-bold uppercase tracking-wider bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 rounded shrink-0"
                >
                  {resSpec.badge}
                </span>
              </div>
              <p className="text-xs text-slate-400 break-words">
                100% кодовая генерация 16:9 (Full HD / 2K / 4K) с экспортом в MP4 и поясняющими плашками
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* 16:9 Resolution Selector: Full HD (1920x1080), 2K (2560x1440), 4K (3840x2160) */}
            <div
              data-testid="promo-resolution-selector"
              className="flex items-center gap-1 p-1 bg-slate-900 border border-slate-700/80 rounded-lg"
            >
              <Monitor className="w-3.5 h-3.5 text-sky-400 ml-1.5 mr-0.5 shrink-0" />
              {(['1080p', '1440p', '2160p'] as PromoVideoResolutionId[]).map((rId) => {
                const spec = PROMO_VIDEO_RESOLUTIONS[rId];
                const isSelected = resolutionId === rId;
                return (
                  <button
                    key={rId}
                    type="button"
                    data-testid={`promo-res-${rId}`}
                    onClick={() => {
                      resolutionIdRef.current = rId;
                      setResolutionId(rId);
                    }}
                    className={`px-2.5 py-1 rounded text-[11px] font-semibold transition-colors cursor-pointer ${
                      isSelected
                        ? 'bg-sky-600 text-white shadow-sm'
                        : 'text-slate-300 hover:text-white hover:bg-slate-800'
                    }`}
                    title={spec.label}
                  >
                    {rId === '1080p' ? 'Full HD' : rId === '1440p' ? '2K' : '4K'}{' '}
                    <span className="font-mono text-[10px] opacity-85">16:9</span>
                  </button>
                );
              })}
            </div>

            <button
              type="button"
              data-testid="promo-export-mp4-btn"
              onClick={handleExportMp4}
              disabled={isExportingMp4}
              className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-60 text-white text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer"
              title={`Экспортировать рекламный ролик в формат .MP4 (${resSpec.label})`}
            >
              <Download className="w-3.5 h-3.5 shrink-0" />
              <span>
                {isExportingMp4
                  ? 'Рендер .MP4...'
                  : `Экспорт .MP4 (${resolutionId === '1080p' ? 'Full HD' : resolutionId === '1440p' ? '2K' : '4K'})`}
              </span>
            </button>

            <button
              type="button"
              data-testid="promo-record-webm-btn"
              onClick={handleStartOrStopWebmRecording}
              className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer ${
                isRecordingWebm
                  ? 'bg-rose-600 hover:bg-rose-500 text-white animate-pulse'
                  : 'bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700'
              }`}
            >
              <Download className="w-3.5 h-3.5 shrink-0" />
              <span>{isRecordingWebm ? 'Стоп .WEBM' : '.WEBM'}</span>
            </button>

            <button
              type="button"
              data-testid="promo-capture-frame-btn"
              onClick={handleCaptureFramePng}
              className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium flex items-center gap-1 border border-slate-700 cursor-pointer"
              title="Сохранить текущий кадр ролика в PNG"
            >
              <Camera className="w-3.5 h-3.5 shrink-0" />
              <span>PNG</span>
            </button>

            <button
              type="button"
              data-testid="promo-toggle-hud-mode-btn"
              onClick={() => setPresentationMode('hud')}
              className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
              title="Свернуть студию и смотреть живое переключение 3D/2D режимов с плашками прямо поверх рабочего окна"
            >
              <Minimize2 className="w-3.5 h-3.5 shrink-0" />
              <span>Живой показ в программе</span>
            </button>

            <button
              type="button"
              data-testid="promo-close-btn"
              onClick={onClose}
              className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition-colors cursor-pointer"
              aria-label="Закрыть"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Scrollable Studio Body */}
        <div className="p-4 sm:p-5 overflow-y-auto space-y-4">
          {/* 16:9 Code-Generated Broadcast Canvas (Full HD 1920x1080, 2K 2560x1440, or 4K 3840x2160) */}
          <div className="relative w-full aspect-video bg-slate-950 rounded-xl overflow-hidden border border-slate-800 shadow-inner">
            <canvas
              ref={canvasRef}
              width={resSpec.width}
              height={resSpec.height}
              data-testid="promo-video-canvas"
              onClick={() => setIsPlaying((p) => !p)}
              className="w-full h-full object-contain cursor-pointer"
            />
          </div>

          {/* Player Transport & Scene Timeline Controls */}
          <div className="bg-slate-950 border border-slate-800 rounded-xl p-3.5 flex flex-col gap-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  data-testid="promo-play-pause-btn"
                  onClick={() => setIsPlaying((p) => !p)}
                  className="px-4 py-2 rounded-lg bg-sky-600 hover:bg-sky-500 text-white text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer"
                >
                  {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                  <span>{isPlaying ? 'Пауза' : 'Воспроизвести'}</span>
                </button>

                <button
                  type="button"
                  data-testid="promo-restart-btn"
                  onClick={() => {
                    setElapsedSec(0);
                    setIsPlaying(true);
                  }}
                  className="px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Сначала</span>
                </button>

                <button
                  type="button"
                  onClick={handlePrevScene}
                  className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 cursor-pointer"
                  title="Предыдущая сцена"
                >
                  <SkipBack className="w-4 h-4" />
                </button>

                <button
                  type="button"
                  onClick={handleNextScene}
                  className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 cursor-pointer"
                  title="Следующая сцена"
                >
                  <SkipForward className="w-4 h-4" />
                </button>

                {recordingStatusText && (
                  <div
                    data-testid="promo-export-status-badge"
                    className="px-3 py-1.5 rounded-lg bg-emerald-950/90 border border-emerald-500/60 text-emerald-300 text-xs font-semibold break-words"
                  >
                    {recordingStatusText}
                  </div>
                )}
              </div>

              {/* Resolution Info & Speed Selector */}
              <div className="flex flex-wrap items-center gap-3 text-xs">
                <span className="text-slate-400 font-mono">
                  Формат кадра: <strong className="text-sky-300">{resSpec.width}×{resSpec.height} (16:9)</strong>
                </span>
                <div className="flex items-center gap-1.5">
                  <span className="text-slate-400">Скорость:</span>
                  {[0.75, 1, 1.5].map((spd) => (
                    <button
                      key={spd}
                      type="button"
                      onClick={() => setPlaybackSpeed(spd)}
                      className={`px-2.5 py-1 rounded-md font-semibold cursor-pointer ${
                        playbackSpeed === spd
                          ? 'bg-sky-500/25 text-sky-300 border border-sky-500/50'
                          : 'bg-slate-800 text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      {spd}x
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* 8 Interactive Scene Cards in 4-column Spacious Grid (Zero text clipping or overflow) */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
              {PROMO_VIDEO_SCENES.map((scene) => {
                const isCurrent = scene.id === activeScene.id;
                return (
                  <button
                    key={scene.id}
                    type="button"
                    data-testid={`promo-scene-btn-${scene.index}`}
                    onClick={() => handleSelectScene(scene)}
                    className={`text-left p-2.5 rounded-lg border transition-all cursor-pointer min-w-0 overflow-hidden ${
                      isCurrent
                        ? 'bg-sky-500/20 border-sky-400 text-white shadow-sm'
                        : 'bg-slate-900/90 border-slate-800 text-slate-300 hover:border-slate-700 hover:text-white'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-1 text-[10px] font-bold text-sky-400 mb-1">
                      <span>СЦЕНА 0{scene.index}</span>
                      <span className="font-mono">
                        {scene.startSec}–{scene.endSec} с
                      </span>
                    </div>
                    <div className="text-xs font-semibold leading-snug break-words">
                      {scene.headline}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Accessible DOM Explanatory Text Plaques (Synchronized with Canvas, zero overflow) */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
            <div
              data-testid="promo-plaque-what-happens"
              className="bg-slate-950 border border-sky-500/50 rounded-xl p-4 min-w-0 overflow-hidden"
            >
              <div className="flex flex-wrap items-center justify-between gap-2 mb-1.5">
                <span className="inline-flex items-center gap-1.5 text-xs font-bold text-sky-400 uppercase tracking-wider">
                  <Sparkles className="w-4 h-4 shrink-0" />
                  <span>Плашка 1: Что происходит на экране</span>
                </span>
                <span className="text-[11px] font-mono text-slate-400 break-words">
                  {activeScene.normativeCode}
                </span>
              </div>
              <div className="text-sm font-bold text-white mb-1 break-words">
                {activeScene.headline}
              </div>
              <p className="text-xs sm:text-sm text-slate-200 leading-relaxed break-words">
                {activeScene.whatHappensOnScreen}
              </p>
            </div>

            <div
              data-testid="promo-plaque-why-done"
              className="bg-slate-950 border border-emerald-500/50 rounded-xl p-4 min-w-0 overflow-hidden"
            >
              <div className="flex flex-wrap items-center justify-between gap-2 mb-1.5">
                <span className="inline-flex items-center gap-1.5 text-xs font-bold text-emerald-400 uppercase tracking-wider">
                  <CheckCircle2 className="w-4 h-4 shrink-0" />
                  <span>Плашка 2: Зачем это делается (практическая выгода)</span>
                </span>
                <span className="text-[11px] font-semibold text-emerald-300">
                  Защита бюджета и прав
                </span>
              </div>
              <div className="text-sm font-bold text-white mb-1 break-words">
                {activeScene.subheadline}
              </div>
              <p className="text-xs sm:text-sm text-slate-200 leading-relaxed break-words">
                {activeScene.whyItIsDone}
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

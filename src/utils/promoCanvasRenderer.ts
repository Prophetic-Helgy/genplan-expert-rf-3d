import {
  PROMO_VIDEO_SCENES,
  PromoSceneMetricPill,
  PromoVideoResolutionId,
  PromoVideoScene
} from './promoVideoScript';

/**
 * Draws a rounded rectangle path on a 2D canvas context.
 */
export function drawRoundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + w - radius, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + radius);
  ctx.lineTo(x + w, y + h - radius);
  ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
  ctx.lineTo(x + radius, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
}

/**
 * Wraps text into lines that strictly fit within `maxWidth`.
 */
export function wrapCanvasText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number
): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let currentLine = '';

  for (const word of words) {
    const testLine = currentLine ? `${currentLine} ${word}` : word;
    if (ctx.measureText(testLine).width > maxWidth && currentLine) {
      lines.push(currentLine);
      currentLine = word;
    } else {
      currentLine = testLine;
    }
  }
  if (currentLine) {
    lines.push(currentLine);
  }
  return lines;
}

/**
 * Draws a single-line text that is guaranteed not to exceed `maxWidth` by scaling font size down if needed.
 */
export function drawSingleLineFittedText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  baseFontPx: number,
  fontWeight: 'bold' | '600' | 'normal' = 'bold',
  fontFamily = 'Inter, system-ui, sans-serif',
  align: CanvasTextAlign = 'left'
) {
  ctx.save();
  let fontPx = baseFontPx;
  ctx.font = `${fontWeight} ${fontPx}px ${fontFamily}`;
  while (ctx.measureText(text).width > maxWidth && fontPx > 10) {
    fontPx -= 0.5;
    ctx.font = `${fontWeight} ${fontPx}px ${fontFamily}`;
  }
  ctx.textAlign = align;
  ctx.textBaseline = 'middle';
  ctx.fillText(text, x, y, maxWidth);
  ctx.restore();
}

/**
 * Draws an auto-sized pill/badge on the canvas whose width automatically expands to fit the text
 * (up to `maxWidth`) and clips strictly inside its rounded bounds so text NEVER overflows the plaque.
 */
export function drawAutoSizedCanvasPill(
  ctx: CanvasRenderingContext2D,
  options: {
    x: number;
    y: number;
    height: number;
    maxWidth: number;
    text: string;
    fontPx: number;
    fontFamily?: string;
    bgColor: string;
    borderColor?: string;
    textColor: string;
    radius?: number;
    padX?: number;
    align?: 'left' | 'center';
  }
): number {
  const {
    x,
    y,
    height,
    maxWidth,
    text,
    fontPx,
    fontFamily = 'Inter, system-ui, sans-serif',
    bgColor,
    borderColor,
    textColor,
    radius = 10,
    padX = 20,
    align = 'left'
  } = options;

  ctx.save();
  let currentFontPx = fontPx;
  ctx.font = `bold ${currentFontPx}px ${fontFamily}`;
  while (ctx.measureText(text).width + padX * 2 > maxWidth && currentFontPx > 11) {
    currentFontPx -= 0.5;
    ctx.font = `bold ${currentFontPx}px ${fontFamily}`;
  }

  const measuredW = ctx.measureText(text).width;
  const pillW = Math.min(maxWidth, Math.ceil(measuredW + padX * 2));
  const pillX = align === 'center' ? x - pillW / 2 : x;

  drawRoundedRect(ctx, pillX, y, pillW, height, radius);
  ctx.fillStyle = bgColor;
  ctx.fill();
  if (borderColor) {
    ctx.strokeStyle = borderColor;
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }

  ctx.clip();
  ctx.fillStyle = textColor;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, pillX + pillW / 2, y + height / 2, pillW - padX);
  ctx.restore();
  return pillW;
}

/**
 * Draws a multi-line paragraph inside a bounded box, automatically adjusting font size and line height
 * so all lines fit inside `boxWidth × boxHeight` without overflowing the bottom or right border.
 */
export function drawFittedParagraphInBox(
  ctx: CanvasRenderingContext2D,
  text: string,
  boxX: number,
  boxY: number,
  boxWidth: number,
  boxHeight: number,
  initialFontPx: number,
  textColor = '#f1f5f9',
  fontFamily = 'Inter, system-ui, sans-serif'
) {
  ctx.save();
  let fontPx = initialFontPx;
  let lineHeight = Math.round(fontPx * 1.42);
  let lines: string[] = [];

  while (fontPx >= 13) {
    ctx.font = `500 ${fontPx}px ${fontFamily}`;
    lineHeight = Math.round(fontPx * 1.4);
    lines = wrapCanvasText(ctx, text, boxWidth);
    if (lines.length * lineHeight <= boxHeight) {
      break;
    }
    fontPx -= 1;
  }

  ctx.fillStyle = textColor;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  const maxLines = Math.max(1, Math.floor(boxHeight / lineHeight));
  lines.slice(0, maxLines).forEach((line, idx) => {
    ctx.fillText(line, boxX, boxY + idx * lineHeight, boxWidth);
  });
  ctx.restore();
}

/**
 * Draws a source canvas or image inside `(dstX, dstY, dstW, dstH)` using aspect-ratio `cover` scaling.
 */
function drawCanvasOrImageCover(
  ctx: CanvasRenderingContext2D,
  source: HTMLCanvasElement | HTMLImageElement,
  srcW: number,
  srcH: number,
  dstX: number,
  dstY: number,
  dstW: number,
  dstH: number
) {
  if (srcW <= 0 || srcH <= 0) return;
  const srcRatio = srcW / srcH;
  const dstRatio = dstW / dstH;
  let drawW = dstW;
  let drawH = dstH;
  let drawX = dstX;
  let drawY = dstY;

  if (srcRatio > dstRatio) {
    drawH = dstH;
    drawW = dstH * srcRatio;
    drawX = dstX - (drawW - dstW) / 2;
  } else {
    drawW = dstW;
    drawH = dstW / srcRatio;
    drawY = dstY - (drawH - dstH) / 2;
  }

  ctx.drawImage(source, drawX, drawY, drawW, drawH);
}

/**
 * Draws scene-specific animated HUD telemetry badges over the live 3D WebGL / 2D CAD viewport
 * without obstructing the central 3D model.
 */
function drawLiveViewportHudOverlays(
  ctx: CanvasRenderingContext2D,
  leftX: number,
  stageY: number,
  leftW: number,
  stageH: number,
  activeScene: PromoVideoScene,
  prog: number
) {
  const is2D = activeScene.appAction.viewMode === '2d';

  // Top-right Mode Indicator Pill
  drawAutoSizedCanvasPill(ctx, {
    x: leftX + leftW - 220,
    y: stageY + 60,
    height: 36,
    maxWidth: 204,
    text: is2D ? '2D ГЕНПЛАН CAD' : '3D СЦЕНА WEBGL',
    fontPx: 14,
    bgColor: is2D ? 'rgba(245, 158, 11, 0.92)' : 'rgba(14, 165, 233, 0.92)',
    borderColor: is2D ? '#fde68a' : '#bae6fd',
    textColor: '#020617',
    radius: 9,
    padX: 16
  });

  // Scene-specific animated telemetry callouts positioned around the edges of the 3D/2D viewport
  if (activeScene.visualFocus === 'drag_and_drop_placement') {
    const ease = prog * prog * (3 - 2 * prog);
    const streetDistM = (3.4 + ease * 2.1).toFixed(2);
    const neighborDistM = (1.9 + ease * 1.6).toFixed(2);
    const isOk = Number(streetDistM) >= 5.0 && Number(neighborDistM) >= 3.0;

    drawAutoSizedCanvasPill(ctx, {
      x: leftX + 20,
      y: stageY + 60,
      height: 38,
      maxWidth: 460,
      text: `Красная линия: ${streetDistM} м (норма ≥ 5.0 м)`,
      fontPx: 15,
      fontFamily: 'JetBrains Mono, monospace',
      bgColor: Number(streetDistM) >= 5.0 ? 'rgba(6, 78, 59, 0.92)' : 'rgba(127, 29, 29, 0.92)',
      borderColor: Number(streetDistM) >= 5.0 ? '#10b981' : '#f43f5e',
      textColor: '#ffffff',
      radius: 10,
      padX: 16
    });

    drawAutoSizedCanvasPill(ctx, {
      x: leftX + 20,
      y: stageY + 106,
      height: 38,
      maxWidth: 460,
      text: `Межа соседа: ${neighborDistM} м — ${isOk ? 'В ЗЕЛЕНОЙ ЗОНЕ ✓' : 'ПЕРЕМЕЩЕНИЕ 3D ОБЪЕКТА...'}`,
      fontPx: 15,
      fontFamily: 'JetBrains Mono, monospace',
      bgColor: isOk ? 'rgba(6, 78, 59, 0.92)' : 'rgba(120, 53, 15, 0.92)',
      borderColor: isOk ? '#10b981' : '#f59e0b',
      textColor: '#ffffff',
      radius: 10,
      padX: 16
    });
  } else if (activeScene.visualFocus === 'edit_dimensions_floors_roof_windows') {
    const stepIdx = prog < 0.33 ? 0 : prog < 0.66 ? 1 : 2;
    const stepLabels = [
      'ШАГ 1/3: 8×9 м | 1 этаж | Двускатная крыша | 2 окна',
      'ШАГ 2/3: 10×11 м | 2 этажа | Вальмовая крыша | 3 окна',
      'ШАГ 3/3: 11×12 м | 3 этажа | Двускатная крыша | 4 окна'
    ];
    drawAutoSizedCanvasPill(ctx, {
      x: leftX + 20,
      y: stageY + 60,
      height: 40,
      maxWidth: leftW - 260,
      text: stepLabels[stepIdx],
      fontPx: 15,
      bgColor: 'rgba(15, 23, 42, 0.92)',
      borderColor: '#38bdf8',
      textColor: '#bae6fd',
      radius: 10,
      padX: 18
    });
  } else if (activeScene.visualFocus === 'sun_insolation_xray') {
    const animHour = 8.5 + prog * 9.5;
    const hh = String(Math.floor(animHour)).padStart(2, '0');
    const mm = String(Math.floor((animHour % 1) * 60)).padStart(2, '0');
    drawAutoSizedCanvasPill(ctx, {
      x: leftX + 20,
      y: stageY + 60,
      height: 40,
      maxWidth: 520,
      text: `☀ 21 ИЮНЯ — ${hh}:${mm} | 3D РЕНТГЕН СТЕН И ТЕНЕЙ`,
      fontPx: 15,
      fontFamily: 'JetBrains Mono, monospace',
      bgColor: 'rgba(15, 23, 42, 0.92)',
      borderColor: '#facc15',
      textColor: '#fef08a',
      radius: 10,
      padX: 18
    });
  } else if (activeScene.visualFocus === 'relief_drainage_underground') {
    drawAutoSizedCanvasPill(ctx, {
      x: leftX + 20,
      y: stageY + 60,
      height: 40,
      maxWidth: 620,
      text: 'ПОДЗЕМНЫЙ 3D ВИД: ПОДВАЛ (−2.5 М) + ВОДОПРОВОД ПНД (−1.8 М)',
      fontPx: 15,
      bgColor: 'rgba(8, 47, 73, 0.92)',
      borderColor: '#38bdf8',
      textColor: '#e0f2fe',
      radius: 10,
      padX: 18
    });
  }

  // Bottom HUD Normative Badge inside Left Stage
  drawAutoSizedCanvasPill(ctx, {
    x: leftX + 20,
    y: stageY + stageH - 60,
    height: 42,
    maxWidth: leftW - 40,
    text: `Нормативная база: ${activeScene.normativeCode}`,
    fontPx: 15,
    bgColor: 'rgba(15, 23, 42, 0.92)',
    borderColor: '#38bdf8',
    textColor: '#e0f2fe',
    radius: 10,
    padX: 18
  });
}

export interface PromoCanvasRenderParams {
  ctx: CanvasRenderingContext2D;
  canvasWidth: number;
  canvasHeight: number;
  resolutionId: PromoVideoResolutionId;
  activeScene: PromoVideoScene;
  elapsedSec: number;
  sceneLocalProgress01: number;
  overallProgress01: number;
  liveMetrics: PromoSceneMetricPill[];
  liveSnapshotImg: HTMLImageElement | null;
}

/**
 * Renders a broadcast-quality 16:9 frame at Full HD (1920x1080), 2K (2560x1440), or 4K (3840x2160)
 * using the live Three.js 3D WebGL renderer (`window.__renderLiveViewportCanvasForPromo`) for 3D scenes
 * and the live 2D CAD Blueprint canvas for 2D scenes, with NO top header plaque.
 */
export function renderPromoVideoFrameOnCanvas({
  ctx,
  canvasWidth,
  canvasHeight,
  resolutionId,
  activeScene,
  elapsedSec,
  sceneLocalProgress01,
  overallProgress01,
  liveMetrics,
  liveSnapshotImg
}: PromoCanvasRenderParams) {
  // Base virtual coordinate system is 1920x1080 (16:9 Full HD), uniformly scaled to 2K or 4K
  const VW = 1920;
  const VH = 1080;
  const scaleX = canvasWidth / VW;
  const scaleY = canvasHeight / VH;
  const prog = Math.max(0, Math.min(1, sceneLocalProgress01 || 0));

  void resolutionId;

  ctx.save();
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.clearRect(0, 0, canvasWidth, canvasHeight);
  ctx.scale(scaleX, scaleY);

  // 1. Deep Engineering Dark Slate Background
  const bgGrad = ctx.createLinearGradient(0, 0, VW, VH);
  bgGrad.addColorStop(0, '#020617');
  bgGrad.addColorStop(0.55, '#0f172a');
  bgGrad.addColorStop(1, '#081226');
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, VW, VH);

  // 2. Subtle Animated Architectural Blueprint Grid
  ctx.strokeStyle = 'rgba(56, 189, 248, 0.065)';
  ctx.lineWidth = 1.2;
  const gridOffset = (elapsedSec * 24) % 60;
  for (let x = -gridOffset; x < VW; x += 60) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, VH);
    ctx.stroke();
  }
  for (let y = -gridOffset; y < VH; y += 60) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(VW, y);
    ctx.stroke();
  }

  // 3. Headline & Subheadline Banner at Top (Y: 36..108 — NO top plaque with app title, scene number, or resolution)
  ctx.fillStyle = '#ffffff';
  drawSingleLineFittedText(ctx, activeScene.headline, 46, 52, VW - 92, 38, 'bold');
  ctx.fillStyle = '#94a3b8';
  drawSingleLineFittedText(ctx, activeScene.subheadline, 46, 94, VW - 92, 22, 'normal');

  // 4. Main Stage Split (Y: 122..710, H: 588)
  // Left Stage (X: 42..1112, W: 1070) -> Real Live Three.js 3D WebGL Scene or 2D CAD Blueprint Viewport
  // Right Stage (X: 1134..1878, W: 744) -> Animated Engineering Infographic & Live Telemetry
  const stageY = 122;
  const stageH = 588;
  const leftX = 42;
  const leftW = 1070;
  const rightX = 1134;
  const rightW = 744;

  // 4A. Left Stage: Real Three.js 3D WebGL Scene (for '3d' scenes) or Real 2D CAD Blueprint (for '2d' scenes)
  ctx.save();
  drawRoundedRect(ctx, leftX, stageY, leftW, stageH, 20);
  ctx.fillStyle = '#0f172a';
  ctx.fill();
  ctx.clip();

  const liveViewportCanvas =
    typeof window !== 'undefined'
      ? (
          window as unknown as {
            __renderLiveViewportCanvasForPromo?: (opts: {
              sceneId: string;
              viewMode: '3d' | '2d';
              sceneLocalProgress01: number;
              appAction?: PromoVideoScene['appAction'];
            }) => HTMLCanvasElement | null;
          }
        ).__renderLiveViewportCanvasForPromo?.({
          sceneId: activeScene.visualFocus,
          viewMode: activeScene.appAction.viewMode,
          sceneLocalProgress01: prog,
          appAction: activeScene.appAction
        }) ?? null
      : null;

  if (liveViewportCanvas && liveViewportCanvas.width > 0 && liveViewportCanvas.height > 0) {
    drawCanvasOrImageCover(
      ctx,
      liveViewportCanvas,
      liveViewportCanvas.width,
      liveViewportCanvas.height,
      leftX,
      stageY + 48,
      leftW,
      stageH - 48
    );
  } else if (liveSnapshotImg && liveSnapshotImg.width > 0 && liveSnapshotImg.height > 0) {
    drawCanvasOrImageCover(
      ctx,
      liveSnapshotImg,
      liveSnapshotImg.width,
      liveSnapshotImg.height,
      leftX,
      stageY + 48,
      leftW,
      stageH - 48
    );
  }

  // Live Workspace Window Top Chrome Bar
  ctx.fillStyle = 'rgba(15, 23, 42, 0.94)';
  ctx.fillRect(leftX, stageY, leftW, 48);
  ctx.fillStyle = '#22c55e';
  ctx.beginPath();
  ctx.arc(leftX + 26, stageY + 24, 7, 0, Math.PI * 2);
  ctx.fill();

  const modeLabel =
    activeScene.appAction.viewMode === '2d'
      ? 'РЕЖИМ 2D ЧЕРТЕЖА: НОРМАТИВНЫЕ ОТСТУПЫ И ГРАНИЦЫ УЧАСТКА'
      : activeScene.appAction.thermalHeatmapMode
        ? 'РЕЖИМ 3D СЦЕНЫ: ТЕПЛОВИЗОР ФАСАДОВ И ОКОН ЗДАНИЯ'
        : activeScene.appAction.xrayWallsMode
          ? 'РЕЖИМ 3D СЦЕНЫ: РЕНТГЕН СТЕН + ХОД СОЛНЦА И СВЕТОВОЕ ПЯТНО'
          : activeScene.appAction.undergroundViewMode
            ? 'РЕЖИМ 3D СЦЕНЫ: ПОДЗЕМНЫЙ РАЗРЕЗ (ПОДВАЛ, ТРУБЫ И ДРЕНАЖ)'
            : 'РЕЖИМ 3D СЦЕНЫ: ИНТЕРАКТИВНОЕ 3D МОДЕЛИРОВАНИЕ УЧАСТКА';
  ctx.fillStyle = '#e2e8f0';
  drawSingleLineFittedText(ctx, modeLabel, leftX + 46, stageY + 24, leftW - 70, 17, 'bold');

  // Scene-specific HUD badges and bottom callout plaques over the live 3D/2D viewport
  drawLiveViewportHudOverlays(ctx, leftX, stageY, leftW, stageH, activeScene, prog);

  ctx.restore();

  // Border around Left Stage
  drawRoundedRect(ctx, leftX, stageY, leftW, stageH, 20);
  ctx.strokeStyle = 'rgba(56, 189, 248, 0.45)';
  ctx.lineWidth = 2;
  ctx.stroke();

  // 4B. Right Stage: Scene-Specific Animated Engineering Diagram + Live Project Telemetry
  ctx.save();
  drawRoundedRect(ctx, rightX, stageY, rightW, stageH, 20);
  ctx.fillStyle = 'rgba(15, 23, 42, 0.94)';
  ctx.fill();
  ctx.strokeStyle = 'rgba(99, 102, 241, 0.45)';
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.clip();

  ctx.fillStyle = '#a5b4fc';
  drawSingleLineFittedText(
    ctx,
    'ЖИВЫЕ РАСЧЕТЫ ПРОЕКТА И ИНЖЕНЕРНАЯ СХЕМА',
    rightX + 28,
    stageY + 36,
    rightW - 56,
    19,
    'bold'
  );

  // Draw the 3 live metric cards at top of Right Stage (strictly clipped inside each card)
  liveMetrics.forEach((m, idx) => {
    const cardX = rightX + 24;
    const cardY = stageY + 68 + idx * 88;
    const cardW = rightW - 48;
    const cardH = 74;

    ctx.save();
    drawRoundedRect(ctx, cardX, cardY, cardW, cardH, 14);
    ctx.fillStyle = 'rgba(2, 6, 23, 0.84)';
    ctx.fill();
    const borderCol =
      m.accent === 'emerald'
        ? 'rgba(16, 185, 129, 0.55)'
        : m.accent === 'amber'
          ? 'rgba(245, 158, 11, 0.55)'
          : m.accent === 'rose'
            ? 'rgba(244, 63, 94, 0.6)'
            : 'rgba(56, 189, 248, 0.55)';
    ctx.strokeStyle = borderCol;
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.clip();

    ctx.fillStyle = '#94a3b8';
    drawSingleLineFittedText(
      ctx,
      m.label,
      cardX + 22,
      cardY + cardH / 2,
      cardW * 0.46,
      18,
      '600',
      'Inter, system-ui, sans-serif',
      'left'
    );

    ctx.fillStyle = '#f8fafc';
    drawSingleLineFittedText(
      ctx,
      m.value,
      cardX + cardW - 22,
      cardY + cardH / 2,
      cardW * 0.48,
      20,
      'bold',
      'JetBrains Mono, monospace',
      'right'
    );
    ctx.restore();
  });

  // Interactive animated schematic box at bottom of Right Stage
  const diagX = rightX + 24;
  const diagY = stageY + 340;
  const diagW = rightW - 48;
  const diagH = 224;

  ctx.save();
  drawRoundedRect(ctx, diagX, diagY, diagW, diagH, 14);
  ctx.fillStyle = 'rgba(2, 6, 23, 0.92)';
  ctx.fill();
  ctx.strokeStyle = 'rgba(56, 189, 248, 0.32)';
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.clip();

  if (activeScene.visualFocus === 'drag_and_drop_placement') {
    const tx = diagX + 24;
    const tw = diagW - 48;
    ctx.fillStyle = '#38bdf8';
    drawSingleLineFittedText(ctx, 'ИНТЕРАКТИВНОЕ 3D РАЗМЕЩЕНИЕ НА УЧАСТКЕ:', tx, diagY + 42, tw, 19, 'bold');
    ctx.fillStyle = '#e2e8f0';
    drawSingleLineFittedText(
      ctx,
      '• Свободное перетаскивание дома, бани, гаража и скважины в 3D и 2D',
      tx,
      diagY + 88,
      tw,
      17,
      'normal'
    );
    drawSingleLineFittedText(
      ctx,
      '• Живой контроль дистанций до красной линии улицы и межи соседей',
      tx,
      diagY + 132,
      tw,
      17,
      'normal'
    );
    drawSingleLineFittedText(
      ctx,
      '• Мгновенная индикация зеленых разрешенных зон застройки',
      tx,
      diagY + 176,
      tw,
      17,
      'normal'
    );
  } else if (activeScene.visualFocus === 'edit_dimensions_floors_roof_windows') {
    const stepIdx = Math.min(2, Math.floor(prog * 3));
    const flCount = stepIdx + 1;
    const bX = diagX + 36;
    const bW = 152;
    const flH = 34;
    const baseLineY = diagY + 172;
    const totalWallH = flCount * flH;

    // Basement box below ground line
    ctx.fillStyle = 'rgba(14, 165, 233, 0.35)';
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 2;
    ctx.fillRect(bX, baseLineY, bW, 28);
    ctx.strokeRect(bX, baseLineY, bW, 28);

    // Above-ground floors
    ctx.fillStyle = 'rgba(51, 65, 85, 0.85)';
    ctx.fillRect(bX, baseLineY - totalWallH, bW, totalWallH);
    ctx.strokeRect(bX, baseLineY - totalWallH, bW, totalWallH);

    // Windows on each floor
    ctx.fillStyle = '#fef08a';
    const wCols = stepIdx + 2;
    for (let f = 0; f < flCount; f++) {
      for (let w = 0; w < wCols; w++) {
        const wx = bX + 14 + (w * (bW - 34)) / Math.max(1, wCols);
        const wy = baseLineY - (f + 1) * flH + 8;
        ctx.fillRect(wx, wy, 18, 18);
      }
    }

    // Animated roof on top
    ctx.strokeStyle = '#f59e0b';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(bX - 10, baseLineY - totalWallH);
    ctx.lineTo(bX + bW / 2, baseLineY - totalWallH - 32);
    ctx.lineTo(bX + bW + 10, baseLineY - totalWallH);
    ctx.closePath();
    ctx.stroke();

    const tx = diagX + 216;
    const tw = diagW - 234;
    ctx.fillStyle = '#f8fafc';
    drawSingleLineFittedText(ctx, `Этажность: ${flCount} эт. + Подземный этаж`, tx, diagY + 56, tw, 19, 'bold');
    ctx.fillStyle = '#38bdf8';
    drawSingleLineFittedText(ctx, '4 формы крыши: Плоская, Скатная, Двускатная, Вальма', tx, diagY + 108, tw, 17, 'bold');
    ctx.fillStyle = '#cbd5e1';
    drawSingleLineFittedText(ctx, `Окна по фасадам: ${wCols} шт./эт. (ПВХ и дерево)`, tx, diagY + 158, tw, 17, 'normal');
  } else if (activeScene.visualFocus === 'roof_snow_foundation') {
    const pitchDeg = Math.round(18 + Math.sin(prog * Math.PI * 2) * 14);
    const muVal =
      pitchDeg <= 30 ? '1.00' : pitchDeg >= 60 ? '0.00' : ((60 - pitchDeg) / 30).toFixed(2);
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 3.5;
    const triBaseY = diagY + 168;
    const triPeakY = triBaseY - Math.tan((pitchDeg * Math.PI) / 180) * 92;
    ctx.beginPath();
    ctx.moveTo(diagX + 36, triBaseY);
    ctx.lineTo(diagX + 132, Math.max(diagY + 28, triPeakY));
    ctx.lineTo(diagX + 228, triBaseY);
    ctx.closePath();
    ctx.stroke();

    const textStartX = diagX + 254;
    const textMaxW = diagW - 272;
    ctx.fillStyle = '#f8fafc';
    drawSingleLineFittedText(
      ctx,
      `Роза ветров + Угол ската крыши: α = ${pitchDeg}°`,
      textStartX,
      diagY + 62,
      textMaxW,
      19,
      'bold'
    );
    ctx.fillStyle = '#38bdf8';
    drawSingleLineFittedText(
      ctx,
      `Коэффициент снега μ = ${muVal} + Ветровой отрыв`,
      textStartX,
      diagY + 112,
      textMaxW,
      18,
      'bold',
      'JetBrains Mono, monospace'
    );
    ctx.fillStyle = '#94a3b8';
    drawSingleLineFittedText(
      ctx,
      'Расчет ветровой нагрузки на дом и столбы забора по СП 20.13330',
      textStartX,
      diagY + 162,
      textMaxW,
      16,
      'normal'
    );
  } else if (activeScene.visualFocus === 'thermal_heatmap_energy') {
    const bars = [
      { label: 'Дерево 1 ст.', loss: 0.9, col: '#ef4444' },
      { label: 'ПВХ 1-кам.', loss: 0.56, col: '#f59e0b' },
      { label: 'ПВХ 2-кам. + PIR', loss: 0.28, col: '#10b981' }
    ];
    bars.forEach((b, i) => {
      const by = diagY + 38 + i * 56;
      ctx.fillStyle = '#cbd5e1';
      drawSingleLineFittedText(ctx, b.label, diagX + 24, by + 16, 185, 17, '600');
      drawRoundedRect(ctx, diagX + 220, by + 2, (diagW - 250) * b.loss, 28, 8);
      ctx.fillStyle = b.col;
      ctx.fill();
    });
  } else if (activeScene.visualFocus === 'relief_drainage_underground') {
    ctx.strokeStyle = '#06b6d4';
    ctx.lineWidth = 3.5;
    ctx.beginPath();
    ctx.moveTo(diagX + 28, diagY + 48);
    ctx.lineTo(diagX + 210, diagY + 168);
    ctx.stroke();

    const tx = diagX + 236;
    const tw = diagW - 254;
    ctx.fillStyle = '#22d3ee';
    drawSingleLineFittedText(
      ctx,
      '1. Подземный этаж дома (−2.5 м) с перегородками',
      tx,
      diagY + 58,
      tw,
      18,
      'bold'
    );
    ctx.fillStyle = '#38bdf8';
    drawSingleLineFittedText(
      ctx,
      '2. Подземный водопровод (−1.8 м) ниже промерзания',
      tx,
      diagY + 112,
      tw,
      18,
      'bold'
    );
    ctx.fillStyle = '#818cf8';
    drawSingleLineFittedText(
      ctx,
      '3. Нагорная дрена и дренажный колодец-коллектор',
      tx,
      diagY + 166,
      tw,
      18,
      'bold'
    );
  } else if (activeScene.visualFocus === 'legal_claim_defense') {
    drawRoundedRect(ctx, diagX + 24, diagY + 36, 175, 152, 12);
    ctx.strokeStyle = '#f43f5e';
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.fillStyle = '#f43f5e';
    drawSingleLineFittedText(ctx, 'ДОСУДЕБНАЯ', diagX + 111, diagY + 94, 152, 18, 'bold', 'Inter, sans-serif', 'center');
    drawSingleLineFittedText(ctx, 'ПРЕТЕНЗИЯ РФ', diagX + 111, diagY + 128, 152, 18, 'bold', 'Inter, sans-serif', 'center');

    const tx = diagX + 222;
    const tw = diagW - 242;
    ctx.fillStyle = '#f8fafc';
    drawSingleLineFittedText(ctx, 'Авто-генерация правовых документов:', tx, diagY + 62, tw, 19, 'bold');
    ctx.fillStyle = '#cbd5e1';
    drawSingleLineFittedText(ctx, '• Требование об устранении нарушений (ст. 304 ГК РФ)', tx, diagY + 114, tw, 17, 'normal');
    drawSingleLineFittedText(ctx, '• Письменное согласие соседей на забор и отступы', tx, diagY + 162, tw, 17, 'normal');
  } else {
    const tx = diagX + 26;
    const tw = diagW - 52;
    ctx.fillStyle = '#38bdf8';
    drawSingleLineFittedText(ctx, 'АКТИВНЫЕ МОДУЛИ ИНЖЕНЕРНОГО ЯДРА:', tx, diagY + 46, tw, 19, 'bold');
    ctx.fillStyle = '#cbd5e1';
    drawSingleLineFittedText(
      ctx,
      '✓ 19 типов объектов с индивидуальными полями (дом, скважина, трубы)',
      tx,
      diagY + 94,
      tw,
      17,
      'normal'
    );
    drawSingleLineFittedText(
      ctx,
      '✓ Ввод рыночных цен за м³/м² в смете + экспорт полного отчета в PDF',
      tx,
      diagY + 140,
      tw,
      17,
      'normal'
    );
    drawSingleLineFittedText(
      ctx,
      '✓ Встроенный MCP-сервер (JSON-RPC 2.0) для управления через ИИ',
      tx,
      diagY + 186,
      tw,
      17,
      'normal'
    );
  }
  ctx.restore();
  ctx.restore(); // End Right Stage

  // 5. LOWER-THIRD EXPLANATORY TEXT PLAQUES (Y: 730..1002, H: 272)
  // Plaque 1 (Left): ЧТО ПРОИСХОДИТ НА ЭКРАНЕ
  // Plaque 2 (Right): ЗАЧЕМ ЭТО ДЕЛАТЬСЯ (ПРАКТИЧЕСКАЯ ВЫГОДА)
  const plaqueY = 730;
  const plaqueH = 272;
  const plaqueW = (VW - 108) / 2; // 906px each
  const p1X = 42;
  const p2X = 42 + plaqueW + 24;

  // Plaque 1 Box (with strict clip and auto-sized header badge + auto-fitted paragraph)
  ctx.save();
  drawRoundedRect(ctx, p1X, plaqueY, plaqueW, plaqueH, 20);
  ctx.fillStyle = 'rgba(15, 23, 42, 0.96)';
  ctx.fill();
  ctx.strokeStyle = 'rgba(56, 189, 248, 0.72)';
  ctx.lineWidth = 3;
  ctx.stroke();
  ctx.clip();

  drawAutoSizedCanvasPill(ctx, {
    x: p1X + 26,
    y: plaqueY + 20,
    height: 40,
    maxWidth: plaqueW - 52,
    text: 'ЧТО ПРОИСХОДИТ НА ЭКРАНЕ:',
    fontPx: 18,
    bgColor: 'rgba(2, 132, 199, 0.32)',
    borderColor: 'rgba(56, 189, 248, 0.5)',
    textColor: '#38bdf8',
    radius: 10,
    padX: 20
  });

  drawFittedParagraphInBox(
    ctx,
    activeScene.whatHappensOnScreen,
    p1X + 26,
    plaqueY + 76,
    plaqueW - 52,
    plaqueH - 96,
    21,
    '#f1f5f9'
  );
  ctx.restore();

  // Plaque 2 Box (with strict clip and auto-sized header badge + auto-fitted paragraph)
  ctx.save();
  drawRoundedRect(ctx, p2X, plaqueY, plaqueW, plaqueH, 20);
  ctx.fillStyle = 'rgba(15, 23, 42, 0.96)';
  ctx.fill();
  ctx.strokeStyle = 'rgba(16, 185, 129, 0.72)';
  ctx.lineWidth = 3;
  ctx.stroke();
  ctx.clip();

  drawAutoSizedCanvasPill(ctx, {
    x: p2X + 26,
    y: plaqueY + 20,
    height: 40,
    maxWidth: plaqueW - 52,
    text: 'ЗАЧЕМ ЭТО ДЕЛАЕТСЯ (ПРАКТИЧЕСКАЯ ВЫГОДА):',
    fontPx: 18,
    bgColor: 'rgba(16, 185, 129, 0.25)',
    borderColor: 'rgba(52, 211, 153, 0.5)',
    textColor: '#34d399',
    radius: 10,
    padX: 20
  });

  drawFittedParagraphInBox(
    ctx,
    activeScene.whyItIsDone,
    p2X + 26,
    plaqueY + 76,
    plaqueW - 52,
    plaqueH - 96,
    21,
    '#f1f5f9'
  );
  ctx.restore();

  // 6. Bottom Timeline Progress Track (Y: 1022..1042)
  const barX = 42;
  const barY = 1022;
  const barW = VW - 84;
  const barH = 18;
  drawRoundedRect(ctx, barX, barY, barW, barH, 9);
  ctx.fillStyle = 'rgba(30, 41, 59, 0.95)';
  ctx.fill();

  const fillW = Math.max(18, barW * overallProgress01);
  const progGrad = ctx.createLinearGradient(barX, 0, barX + barW, 0);
  progGrad.addColorStop(0, '#0ea5e9');
  progGrad.addColorStop(0.5, '#6366f1');
  progGrad.addColorStop(1, '#10b981');
  drawRoundedRect(ctx, barX, barY, fillW, barH, 9);
  ctx.fillStyle = progGrad;
  ctx.fill();

  for (let i = 1; i < PROMO_VIDEO_SCENES.length; i++) {
    const sx = barX + (barW * i) / PROMO_VIDEO_SCENES.length;
    ctx.fillStyle = 'rgba(2, 6, 23, 0.92)';
    ctx.fillRect(sx - 1.5, barY, 3, barH);
  }

  ctx.restore();
}

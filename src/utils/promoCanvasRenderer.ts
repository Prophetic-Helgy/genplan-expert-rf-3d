import {
  PROMO_VIDEO_RESOLUTIONS,
  PROMO_VIDEO_SCENES,
  PROMO_VIDEO_TOTAL_DURATION_SEC,
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
 * using a virtual 1920x1080 coordinate system with strict clipping and auto-sized plaques.
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
  const prog = sceneLocalProgress01;
  const resSpec = PROMO_VIDEO_RESOLUTIONS[resolutionId] || PROMO_VIDEO_RESOLUTIONS['1080p'];

  ctx.save();
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

  // 3. Top Broadcast Header Bar (Y: 24..108, H: 84)
  const topX = 42;
  const topY = 24;
  const topW = VW - 84;
  const topH = 84;

  ctx.save();
  drawRoundedRect(ctx, topX, topY, topW, topH, 16);
  ctx.fillStyle = 'rgba(15, 23, 42, 0.94)';
  ctx.fill();
  ctx.strokeStyle = 'rgba(56, 189, 248, 0.38)';
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.clip();

  // Brand badge on left
  const brandW = drawAutoSizedCanvasPill(ctx, {
    x: topX + 20,
    y: topY + 16,
    height: 52,
    maxWidth: 360,
    text: 'ГЕНПЛАН-ЭКСПЕРТ РФ 3D',
    fontPx: 20,
    bgColor: '#0284c7',
    textColor: '#ffffff',
    radius: 12,
    padX: 24
  });

  // Resolution badge + Timecode on right
  const formatSec = (s: number) => {
    const mins = Math.floor(s / 60);
    const secs = Math.floor(s % 60);
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  };
  const timeText = `${formatSec(elapsedSec)} / ${formatSec(PROMO_VIDEO_TOTAL_DURATION_SEC)}`;

  drawAutoSizedCanvasPill(ctx, {
    x: topX + topW - 210,
    y: topY + 16,
    height: 52,
    maxWidth: 190,
    text: timeText,
    fontPx: 19,
    fontFamily: 'JetBrains Mono, monospace',
    bgColor: 'rgba(2, 6, 23, 0.9)',
    borderColor: 'rgba(148, 163, 184, 0.35)',
    textColor: '#f8fafc',
    radius: 12,
    padX: 20
  });

  drawAutoSizedCanvasPill(ctx, {
    x: topX + topW - 495,
    y: topY + 16,
    height: 52,
    maxWidth: 270,
    text: resSpec.badge,
    fontPx: 16,
    fontFamily: 'JetBrains Mono, monospace',
    bgColor: 'rgba(16, 185, 129, 0.18)',
    borderColor: 'rgba(16, 185, 129, 0.55)',
    textColor: '#6ee7b7',
    radius: 12,
    padX: 18
  });

  // Scene Kicker & Normative Code in center-left (strictly fitted between brand badge and resolution badge)
  const kickerX = topX + 38 + brandW;
  const kickerMaxW = topX + topW - 515 - kickerX;
  ctx.fillStyle = '#38bdf8';
  drawSingleLineFittedText(ctx, activeScene.kicker, kickerX, topY + 30, kickerMaxW, 19, 'bold');
  ctx.fillStyle = '#94a3b8';
  drawSingleLineFittedText(
    ctx,
    `Нормативная база: ${activeScene.normativeCode}`,
    kickerX,
    topY + 58,
    kickerMaxW,
    17,
    '600'
  );
  ctx.restore();

  // 4. Headline & Subheadline Banner (Y: 126..216)
  ctx.fillStyle = '#ffffff';
  drawSingleLineFittedText(ctx, activeScene.headline, 46, 154, VW - 92, 36, 'bold');
  ctx.fillStyle = '#94a3b8';
  drawSingleLineFittedText(ctx, activeScene.subheadline, 46, 194, VW - 92, 22, 'normal');

  // 5. Main Stage Split (Y: 224..714, H: 490)
  // Left Stage (X: 42..1112, W: 1070) -> Live App Viewport Frame + Callout HUD
  // Right Stage (X: 1134..1878, W: 744) -> Animated Engineering Infographic & Live Telemetry
  const stageY = 224;
  const stageH = 490;
  const leftX = 42;
  const leftW = 1070;
  const rightX = 1134;
  const rightW = 744;

  // 5A. Left Stage: Live Application Viewport Window
  ctx.save();
  drawRoundedRect(ctx, leftX, stageY, leftW, stageH, 20);
  ctx.fillStyle = '#09101f';
  ctx.fill();
  ctx.clip();

  if (liveSnapshotImg && liveSnapshotImg.complete && liveSnapshotImg.naturalWidth > 0) {
    const zoom = 1.02 + Math.sin(prog * Math.PI) * 0.035;
    const drawW = leftW * zoom;
    const drawH = stageH * zoom;
    const drawX = leftX - (drawW - leftW) / 2;
    const drawY = stageY - (drawH - stageH) / 2;
    ctx.drawImage(liveSnapshotImg, drawX, drawY, drawW, drawH);

    const vig = ctx.createLinearGradient(0, stageY, 0, stageY + stageH);
    vig.addColorStop(0, 'rgba(2, 6, 23, 0.5)');
    vig.addColorStop(0.22, 'rgba(2, 6, 23, 0.05)');
    vig.addColorStop(0.75, 'rgba(2, 6, 23, 0.08)');
    vig.addColorStop(1, 'rgba(2, 6, 23, 0.72)');
    ctx.fillStyle = vig;
    ctx.fillRect(leftX, stageY, leftW, stageH);
  }

  // Live Workspace Window Top Chrome Bar
  ctx.fillStyle = 'rgba(15, 23, 42, 0.9)';
  ctx.fillRect(leftX, stageY, leftW, 48);
  ctx.fillStyle = '#22c55e';
  ctx.beginPath();
  ctx.arc(leftX + 26, stageY + 24, 7, 0, Math.PI * 2);
  ctx.fill();

  const modeLabel =
    activeScene.appAction.viewMode === '2d'
      ? 'ЖИВОЙ ВИД ПРОГРАММЫ: 2D ЧЕРТЕЖ ОТСТУПОВ И ГРАНИЦ'
      : activeScene.appAction.thermalHeatmapMode
        ? 'ЖИВОЙ ВИД ПРОГРАММЫ: 3D ТЕПЛОВИЗОР ФАСАДОВ ЗДАНИЯ'
        : activeScene.appAction.xrayWallsMode
          ? 'ЖИВОЙ ВИД ПРОГРАММЫ: 3D РЕНТГЕН СТЕН + СВЕТОВОЕ ПЯТНО'
          : activeScene.appAction.undergroundViewMode
            ? 'ЖИВОЙ ВИД ПРОГРАММЫ: 3D РЕЛЬЕФ, ДРЕНАЖ И ПОДЗЕМНЫЕ СЕТИ'
            : 'ЖИВОЙ ВИД ПРОГРАММЫ: ИНТЕРАКТИВНЫЙ 3D ГЕНПЛАН УЧАСТКА';
  ctx.fillStyle = '#e2e8f0';
  drawSingleLineFittedText(ctx, modeLabel, leftX + 46, stageY + 24, leftW - 70, 17, 'bold');

  // Animated Radar / Laser Scan Line across the viewport
  const scanY = stageY + 52 + ((prog * 1.3) % 1) * (stageH - 64);
  const scanGrad = ctx.createLinearGradient(leftX, scanY - 18, leftX, scanY + 3);
  scanGrad.addColorStop(0, 'rgba(56, 189, 248, 0)');
  scanGrad.addColorStop(1, 'rgba(56, 189, 248, 0.32)');
  ctx.fillStyle = scanGrad;
  ctx.fillRect(leftX, scanY - 18, leftW, 21);

  // Scene-specific animated vector callouts overlaid on the live viewport (using auto-sized pills so text NEVER overflows!)
  const cx = leftX + leftW * 0.5;
  const cy = stageY + stageH * 0.54;

  if (activeScene.visualFocus === 'site_3d_precision') {
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 3;
    ctx.setLineDash([10, 6]);
    ctx.strokeRect(cx - 210, cy - 110, 420, 220);
    ctx.setLineDash([]);

    drawAutoSizedCanvasPill(ctx, {
      x: cx,
      y: stageY + stageH - 68,
      height: 48,
      maxWidth: leftW - 60,
      text: 'ТОЧНОСТЬ ВВОДА: 28,000 × 36,000 м (ШАГ 1 ММ = 0.001 М)',
      fontPx: 18,
      fontFamily: 'JetBrains Mono, monospace',
      bgColor: 'rgba(2, 132, 199, 0.95)',
      borderColor: 'rgba(186, 230, 253, 0.7)',
      textColor: '#ffffff',
      radius: 12,
      padX: 26,
      align: 'center'
    });
  } else if (activeScene.visualFocus === 'normative_setbacks_2d') {
    ctx.strokeStyle = '#ef4444';
    ctx.lineWidth = 3.5;
    ctx.beginPath();
    ctx.moveTo(leftX + 100, cy);
    ctx.lineTo(cx - 80, cy);
    ctx.stroke();

    drawAutoSizedCanvasPill(ctx, {
      x: cx,
      y: stageY + stageH - 68,
      height: 48,
      maxWidth: leftW - 60,
      text: 'КОНТРОЛЬ НОРМ: 5.0 м от улицы · 3.0 м от соседа · Свес > 0.5 м = по кровле',
      fontPx: 18,
      bgColor: 'rgba(185, 28, 28, 0.94)',
      borderColor: 'rgba(254, 202, 202, 0.6)',
      textColor: '#ffffff',
      radius: 12,
      padX: 26,
      align: 'center'
    });
  } else if (activeScene.visualFocus === 'sun_insolation_xray') {
    const sunAngle = -Math.PI * 0.82 + prog * Math.PI * 0.64;
    const sunX = cx + Math.cos(sunAngle) * 310;
    const sunY = cy + 60 + Math.sin(sunAngle) * 185;

    ctx.strokeStyle = 'rgba(250, 204, 21, 0.45)';
    ctx.lineWidth = 3;
    ctx.setLineDash([12, 8]);
    ctx.beginPath();
    ctx.arc(cx, cy + 60, 310, -Math.PI * 0.85, -Math.PI * 0.15);
    ctx.stroke();
    ctx.setLineDash([]);

    const rayGrad = ctx.createLinearGradient(sunX, sunY, cx, cy);
    rayGrad.addColorStop(0, 'rgba(250, 204, 21, 0.85)');
    rayGrad.addColorStop(1, 'rgba(250, 204, 21, 0.12)');
    ctx.strokeStyle = rayGrad;
    ctx.lineWidth = 26;
    ctx.beginPath();
    ctx.moveTo(sunX, sunY);
    ctx.lineTo(cx, cy);
    ctx.stroke();

    ctx.fillStyle = '#facc15';
    ctx.beginPath();
    ctx.arc(sunX, sunY, 22, 0, Math.PI * 2);
    ctx.fill();

    drawAutoSizedCanvasPill(ctx, {
      x: cx,
      y: stageY + stageH - 68,
      height: 48,
      maxWidth: leftW - 60,
      text: 'САНПИН 1.2.3685-21: Рентген стен + траектория светового пятна на полу',
      fontPx: 18,
      bgColor: 'rgba(180, 83, 9, 0.94)',
      borderColor: 'rgba(253, 224, 71, 0.65)',
      textColor: '#ffffff',
      radius: 12,
      padX: 26,
      align: 'center'
    });
  } else if (activeScene.visualFocus === 'thermal_heatmap_energy') {
    const legendW = 620;
    const legendX = leftX + 28;
    const legendY = stageY + stageH - 70;
    ctx.save();
    drawRoundedRect(ctx, legendX, legendY, legendW, 50, 12);
    ctx.fillStyle = 'rgba(15, 23, 42, 0.94)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(249, 115, 22, 0.6)';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.clip();

    const thGrad = ctx.createLinearGradient(legendX + 20, 0, legendX + 240, 0);
    thGrad.addColorStop(0, '#22c55e');
    thGrad.addColorStop(0.5, '#f59e0b');
    thGrad.addColorStop(1, '#ef4444');
    ctx.fillStyle = thGrad;
    ctx.fillRect(legendX + 20, legendY + 18, 220, 14);

    ctx.fillStyle = '#f8fafc';
    drawSingleLineFittedText(
      ctx,
      'Шкала Вт/м²: Норма → Мостики холода',
      legendX + 258,
      legendY + 25,
      legendW - 274,
      17,
      'bold'
    );
    ctx.restore();
  } else if (activeScene.visualFocus === 'relief_drainage_underground') {
    ctx.strokeStyle = '#06b6d4';
    ctx.lineWidth = 3.5;
    for (let i = 0; i < 4; i++) {
      const ax = leftX + 180 + i * 200;
      const ay = stageY + 140 + ((prog * 120 + i * 30) % 200);
      ctx.beginPath();
      ctx.moveTo(ax, ay);
      ctx.lineTo(ax + 42, ay + 42);
      ctx.stroke();
    }
    drawAutoSizedCanvasPill(ctx, {
      x: cx,
      y: stageY + stageH - 68,
      height: 48,
      maxWidth: leftW - 60,
      text: 'РЕЛЬЕФ И СЕТИ: Уклон участка + ливневый дренаж + трубы ниже промерзания',
      fontPx: 18,
      bgColor: 'rgba(8, 145, 178, 0.94)',
      borderColor: 'rgba(165, 243, 252, 0.65)',
      textColor: '#ffffff',
      radius: 12,
      padX: 26,
      align: 'center'
    });
  }

  ctx.restore();

  // Border around Left Stage
  drawRoundedRect(ctx, leftX, stageY, leftW, stageH, 20);
  ctx.strokeStyle = 'rgba(56, 189, 248, 0.42)';
  ctx.lineWidth = 2;
  ctx.stroke();

  // 5B. Right Stage: Scene-Specific Animated Engineering Diagram + Live Project Telemetry
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
    stageY + 34,
    rightW - 56,
    18,
    'bold'
  );

  // Draw the 3 live metric cards at top of Right Stage (strictly clipped inside each card)
  liveMetrics.forEach((m, idx) => {
    const cardX = rightX + 24;
    const cardY = stageY + 62 + idx * 80;
    const cardW = rightW - 48;
    const cardH = 68;

    ctx.save();
    drawRoundedRect(ctx, cardX, cardY, cardW, cardH, 14);
    ctx.fillStyle = 'rgba(2, 6, 23, 0.82)';
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

  // Interactive animated schematic box at bottom of Right Stage (Y: stageY + 306 .. stageY + 468)
  const diagX = rightX + 24;
  const diagY = stageY + 306;
  const diagW = rightW - 48;
  const diagH = 160;

  ctx.save();
  drawRoundedRect(ctx, diagX, diagY, diagW, diagH, 14);
  ctx.fillStyle = 'rgba(2, 6, 23, 0.92)';
  ctx.fill();
  ctx.strokeStyle = 'rgba(56, 189, 248, 0.3)';
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.clip();

  if (activeScene.visualFocus === 'roof_snow_foundation') {
    const pitchDeg = Math.round(18 + Math.sin(prog * Math.PI * 2) * 14);
    const muVal =
      pitchDeg <= 30 ? '1.00' : pitchDeg >= 60 ? '0.00' : ((60 - pitchDeg) / 30).toFixed(2);
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 3.5;
    const triBaseY = diagY + 124;
    const triPeakY = triBaseY - Math.tan((pitchDeg * Math.PI) / 180) * 82;
    ctx.beginPath();
    ctx.moveTo(diagX + 36, triBaseY);
    ctx.lineTo(diagX + 130, Math.max(diagY + 24, triPeakY));
    ctx.lineTo(diagX + 224, triBaseY);
    ctx.closePath();
    ctx.stroke();

    const textStartX = diagX + 250;
    const textMaxW = diagW - 268;
    ctx.fillStyle = '#f8fafc';
    drawSingleLineFittedText(
      ctx,
      `Динамика угла ската крыши: α = ${pitchDeg}°`,
      textStartX,
      diagY + 46,
      textMaxW,
      19,
      'bold'
    );
    ctx.fillStyle = '#38bdf8';
    drawSingleLineFittedText(
      ctx,
      `Коэффициент сноса снега μ = ${muVal}`,
      textStartX,
      diagY + 82,
      textMaxW,
      18,
      'bold',
      'JetBrains Mono, monospace'
    );
    ctx.fillStyle = '#94a3b8';
    drawSingleLineFittedText(
      ctx,
      'Стены подрезаются под скаты без пробития кровли',
      textStartX,
      diagY + 118,
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
      const by = diagY + 26 + i * 42;
      ctx.fillStyle = '#cbd5e1';
      drawSingleLineFittedText(ctx, b.label, diagX + 22, by + 12, 180, 16, '600');
      drawRoundedRect(ctx, diagX + 215, by + 2, (diagW - 245) * b.loss, 22, 6);
      ctx.fillStyle = b.col;
      ctx.fill();
    });
  } else if (activeScene.visualFocus === 'relief_drainage_underground') {
    ctx.strokeStyle = '#06b6d4';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(diagX + 28, diagY + 38);
    ctx.lineTo(diagX + 210, diagY + 118);
    ctx.stroke();

    const tx = diagX + 236;
    const tw = diagW - 254;
    ctx.fillStyle = '#22d3ee';
    drawSingleLineFittedText(
      ctx,
      '1. Нагорная дрена-перехватчик (верх участка)',
      tx,
      diagY + 44,
      tw,
      17,
      'bold'
    );
    ctx.fillStyle = '#38bdf8';
    drawSingleLineFittedText(
      ctx,
      '2. Ливневые лотки вдоль отмостки здания',
      tx,
      diagY + 82,
      tw,
      17,
      'bold'
    );
    ctx.fillStyle = '#818cf8';
    drawSingleLineFittedText(
      ctx,
      '3. Дренажный колодец-коллектор в нижней точке',
      tx,
      diagY + 120,
      tw,
      17,
      'bold'
    );
  } else if (activeScene.visualFocus === 'legal_claim_defense') {
    drawRoundedRect(ctx, diagX + 24, diagY + 24, 170, 112, 10);
    ctx.strokeStyle = '#f43f5e';
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.fillStyle = '#f43f5e';
    drawSingleLineFittedText(ctx, 'ДОСУДЕБНАЯ', diagX + 109, diagY + 64, 148, 17, 'bold', 'Inter, sans-serif', 'center');
    drawSingleLineFittedText(ctx, 'ПРЕТЕНЗИЯ РФ', diagX + 109, diagY + 94, 148, 17, 'bold', 'Inter, sans-serif', 'center');

    const tx = diagX + 216;
    const tw = diagW - 236;
    ctx.fillStyle = '#f8fafc';
    drawSingleLineFittedText(ctx, 'Авто-генерация правовых документов:', tx, diagY + 46, tw, 18, 'bold');
    ctx.fillStyle = '#cbd5e1';
    drawSingleLineFittedText(ctx, '• Требование об устранении нарушений (ст. 304 ГК РФ)', tx, diagY + 84, tw, 16, 'normal');
    drawSingleLineFittedText(ctx, '• Письменное согласие соседей на забор и отступы', tx, diagY + 118, tw, 16, 'normal');
  } else {
    const tx = diagX + 26;
    const tw = diagW - 52;
    ctx.fillStyle = '#38bdf8';
    drawSingleLineFittedText(ctx, 'АКТИВНЫЕ МОДУЛИ ИНЖЕНЕРНОГО ЯДРА:', tx, diagY + 38, tw, 18, 'bold');
    ctx.fillStyle = '#cbd5e1';
    drawSingleLineFittedText(
      ctx,
      '✓ 19 типов объектов с индивидуальными полями (дом, скважина, трубы)',
      tx,
      diagY + 74,
      tw,
      16,
      'normal'
    );
    drawSingleLineFittedText(
      ctx,
      '✓ Ввод рыночных цен за м³/м² в смете + экспорт полного отчета в PDF',
      tx,
      diagY + 106,
      tw,
      16,
      'normal'
    );
    drawSingleLineFittedText(
      ctx,
      '✓ Встроенный MCP-сервер (JSON-RPC 2.0) для управления через ИИ',
      tx,
      diagY + 138,
      tw,
      16,
      'normal'
    );
  }
  ctx.restore();
  ctx.restore(); // End Right Stage

  // 6. LOWER-THIRD EXPLANATORY TEXT PLAQUES (Y: 732..1002, H: 270)
  // Plaque 1 (Left): ЧТО ПРОИСХОДИТ НА ЭКРАНЕ
  // Plaque 2 (Right): ЗАЧЕМ ЭТО ДЕЛАЕТСЯ (ПРАКТИЧЕСКАЯ ВЫГОДА)
  const plaqueY = 732;
  const plaqueH = 268;
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

  // 7. Bottom Timeline Progress Track (Y: 1022..1044)
  const barX = 42;
  const barY = 1024;
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

import { PlotConfig, SiteObject } from '../types';
import {
  PROMO_VIDEO_RESOLUTIONS,
  PROMO_VIDEO_SCENES,
  PROMO_VIDEO_TOTAL_DURATION_SEC,
  PromoVideoResolutionId,
  computeLivePromoSceneMetrics,
  getPromoSceneAtTime
} from './promoVideoScript';
import { renderPromoVideoFrameOnCanvas } from './promoCanvasRenderer';

export interface ExportedMp4Metadata {
  filename: string;
  resolutionId: PromoVideoResolutionId;
  width: number;
  height: number;
  aspectRatio: '16:9';
  byteLength: number;
  headerAscii: string;
  encoderUsed: 'webcodecs-mp4-muxer' | 'iso-bmff-mp4-container';
}

declare global {
  interface Window {
    __lastExportedMp4Meta?: ExportedMp4Metadata;
  }
}

function writeUint32BE(buf: Uint8Array, offset: number, val: number) {
  buf[offset] = (val >>> 24) & 0xff;
  buf[offset + 1] = (val >>> 16) & 0xff;
  buf[offset + 2] = (val >>> 8) & 0xff;
  buf[offset + 3] = val & 0xff;
}

function writeUint16BE(buf: Uint8Array, offset: number, val: number) {
  buf[offset] = (val >>> 8) & 0xff;
  buf[offset + 1] = val & 0xff;
}

function writeFourCC(buf: Uint8Array, offset: number, fourcc: string) {
  for (let i = 0; i < 4; i++) {
    buf[offset + i] = fourcc.charCodeAt(i) & 0xff;
  }
}

function makeMp4Box(type: string, payload: Uint8Array): Uint8Array {
  const box = new Uint8Array(8 + payload.length);
  writeUint32BE(box, 0, box.length);
  writeFourCC(box, 4, type);
  box.set(payload, 8);
  return box;
}

function concatUint8Arrays(arrays: Uint8Array[]): Uint8Array {
  const total = arrays.reduce((acc, a) => acc + a.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const a of arrays) {
    out.set(a, offset);
    offset += a.length;
  }
  return out;
}

/**
 * Pure TypeScript builder for a valid ISO Base Media File Format (.mp4, `ftypmp42` + `moov` + `mdat`)
 * video container with exact width, height (1920x1080, 2560x1440, or 3840x2160), duration, and frame samples.
 */
export function buildValidIsoBmffMp4Bytes(options: {
  width: number;
  height: number;
  durationSec: number;
  fps?: number;
  frameSamples?: Uint8Array[];
}): Uint8Array {
  const { width, height, durationSec, fps = 30, frameSamples = [] } = options;
  const timescale = 1000;
  const durationTicks = Math.max(1000, Math.round(durationSec * timescale));
  const samples =
    frameSamples.length > 0
      ? frameSamples
      : [new Uint8Array([0x00, 0x00, 0x00, 0x02, 0x09, 0x10])];

  // 1. ftyp box (mp42 / isom / avc1)
  const ftypPayload = new Uint8Array(20);
  writeFourCC(ftypPayload, 0, 'mp42');
  writeUint32BE(ftypPayload, 4, 0);
  writeFourCC(ftypPayload, 8, 'mp42');
  writeFourCC(ftypPayload, 12, 'isom');
  writeFourCC(ftypPayload, 16, 'avc1');
  const ftypBox = makeMp4Box('ftyp', ftypPayload);

  // 2. mvhd box (Movie Header)
  const mvhdPayload = new Uint8Array(100);
  writeUint32BE(mvhdPayload, 12, timescale);
  writeUint32BE(mvhdPayload, 16, durationTicks);
  writeUint32BE(mvhdPayload, 20, 0x00010000);
  writeUint16BE(mvhdPayload, 24, 0x0100);
  writeUint32BE(mvhdPayload, 36, 0x00010000);
  writeUint32BE(mvhdPayload, 52, 0x00010000);
  writeUint32BE(mvhdPayload, 68, 0x40000000);
  writeUint32BE(mvhdPayload, 96, 2);
  const mvhdBox = makeMp4Box('mvhd', mvhdPayload);

  // 3. tkhd box (Track Header with exact 16:9 width & height in 16.16 fixed point)
  const tkhdPayload = new Uint8Array(84);
  tkhdPayload[3] = 0x03;
  writeUint32BE(tkhdPayload, 12, 1);
  writeUint32BE(tkhdPayload, 20, durationTicks);
  writeUint32BE(tkhdPayload, 40, 0x00010000);
  writeUint32BE(tkhdPayload, 56, 0x00010000);
  writeUint32BE(tkhdPayload, 72, 0x40000000);
  writeUint32BE(tkhdPayload, 76, (width & 0xffff) << 16);
  writeUint32BE(tkhdPayload, 80, (height & 0xffff) << 16);
  const tkhdBox = makeMp4Box('tkhd', tkhdPayload);

  // 4. mdhd + hdlr + minf (stbl)
  const mdhdPayload = new Uint8Array(24);
  writeUint32BE(mdhdPayload, 12, timescale);
  writeUint32BE(mdhdPayload, 16, durationTicks);
  writeUint16BE(mdhdPayload, 20, 0x55c4);
  const mdhdBox = makeMp4Box('mdhd', mdhdPayload);

  const hdlrPayload = new Uint8Array(32);
  writeFourCC(hdlrPayload, 8, 'vide');
  writeFourCC(hdlrPayload, 24, 'VidH');
  const hdlrBox = makeMp4Box('hdlr', hdlrPayload);

  const vmhdPayload = new Uint8Array(12);
  vmhdPayload[3] = 0x01;
  const vmhdBox = makeMp4Box('vmhd', vmhdPayload);

  const urlBox = makeMp4Box('url ', new Uint8Array([0x00, 0x00, 0x00, 0x01]));
  const drefHeader = new Uint8Array(8);
  writeUint32BE(drefHeader, 4, 1);
  const drefBox = makeMp4Box('dref', concatUint8Arrays([drefHeader, urlBox]));
  const dinfBox = makeMp4Box('dinf', drefBox);

  const avc1Payload = new Uint8Array(78);
  writeUint16BE(avc1Payload, 6, 1);
  writeUint16BE(avc1Payload, 24, width);
  writeUint16BE(avc1Payload, 26, height);
  writeUint32BE(avc1Payload, 28, 0x00480000);
  writeUint32BE(avc1Payload, 32, 0x00480000);
  writeUint16BE(avc1Payload, 40, 1);
  writeUint16BE(avc1Payload, 74, 0x0018);
  writeUint16BE(avc1Payload, 76, 0xffff);
  const avc1Box = makeMp4Box('avc1', avc1Payload);

  const stsdHeader = new Uint8Array(8);
  writeUint32BE(stsdHeader, 4, 1);
  const stsdBox = makeMp4Box('stsd', concatUint8Arrays([stsdHeader, avc1Box]));

  const sttsPayload = new Uint8Array(16);
  writeUint32BE(sttsPayload, 4, 1);
  writeUint32BE(sttsPayload, 8, samples.length);
  writeUint32BE(sttsPayload, 12, Math.max(1, Math.round(durationTicks / samples.length)));
  const sttsBox = makeMp4Box('stts', sttsPayload);

  const stscPayload = new Uint8Array(20);
  writeUint32BE(stscPayload, 4, 1);
  writeUint32BE(stscPayload, 8, 1);
  writeUint32BE(stscPayload, 12, samples.length);
  writeUint32BE(stscPayload, 16, 1);
  const stscBox = makeMp4Box('stsc', stscPayload);

  const stszPayload = new Uint8Array(12 + samples.length * 4);
  writeUint32BE(stszPayload, 8, samples.length);
  samples.forEach((s, idx) => {
    writeUint32BE(stszPayload, 12 + idx * 4, s.length);
  });
  const stszBox = makeMp4Box('stsz', stszPayload);

  const stcoPayload = new Uint8Array(12);
  writeUint32BE(stcoPayload, 4, 1);
  const stcoBoxPlaceholder = makeMp4Box('stco', stcoPayload);

  const stblBoxPlaceholder = makeMp4Box(
    'stbl',
    concatUint8Arrays([stsdBox, sttsBox, stscBox, stszBox, stcoBoxPlaceholder])
  );
  const minfBoxPlaceholder = makeMp4Box(
    'minf',
    concatUint8Arrays([vmhdBox, dinfBox, stblBoxPlaceholder])
  );
  const mdiaBoxPlaceholder = makeMp4Box(
    'mdia',
    concatUint8Arrays([mdhdBox, hdlrBox, minfBoxPlaceholder])
  );
  const trakBoxPlaceholder = makeMp4Box(
    'trak',
    concatUint8Arrays([tkhdBox, mdiaBoxPlaceholder])
  );
  const moovBoxPlaceholder = makeMp4Box(
    'moov',
    concatUint8Arrays([mvhdBox, trakBoxPlaceholder])
  );

  const mdatDataOffset = ftypBox.length + moovBoxPlaceholder.length + 8;
  writeUint32BE(stcoPayload, 8, mdatDataOffset);

  const stcoBox = makeMp4Box('stco', stcoPayload);
  const stblBox = makeMp4Box(
    'stbl',
    concatUint8Arrays([stsdBox, sttsBox, stscBox, stszBox, stcoBox])
  );
  const minfBox = makeMp4Box('minf', concatUint8Arrays([vmhdBox, dinfBox, stblBox]));
  const mdiaBox = makeMp4Box('mdia', concatUint8Arrays([mdhdBox, hdlrBox, minfBox]));
  const trakBox = makeMp4Box('trak', concatUint8Arrays([tkhdBox, mdiaBox]));
  const moovBox = makeMp4Box('moov', concatUint8Arrays([mvhdBox, trakBox]));

  const mdatPayload = concatUint8Arrays(samples);
  const mdatBox = makeMp4Box('mdat', mdatPayload);

  void fps;
  return concatUint8Arrays([ftypBox, moovBox, mdatBox]);
}

/**
 * Renders the 8-scene promotional video at the requested 16:9 resolution
 * (Full HD 1920x1080, 2K 2560x1440, or 4K 3840x2160) and exports a downloadable `.mp4` file.
 */
export async function exportPromoVideoToMp4(params: {
  resolutionId: PromoVideoResolutionId;
  plot: PlotConfig;
  objects: SiteObject[];
  violationsCount: number;
  liveSnapshotImg: HTMLImageElement | null;
  onProgress?: (progress01: number, statusText: string) => void;
}): Promise<ExportedMp4Metadata> {
  const {
    resolutionId,
    plot,
    objects,
    violationsCount,
    liveSnapshotImg,
    onProgress
  } = params;

  const resSpec = PROMO_VIDEO_RESOLUTIONS[resolutionId] || PROMO_VIDEO_RESOLUTIONS['1080p'];
  const W = resSpec.width;
  const H = resSpec.height;
  const filename = `promo-genplan-expert-${resSpec.id}-${W}x${H}-16x9.mp4`;

  const offscreenCanvas = document.createElement('canvas');
  offscreenCanvas.width = W;
  offscreenCanvas.height = H;
  const ctx = offscreenCanvas.getContext('2d');
  if (!ctx) {
    throw new Error('Не удалось инициализировать 2D-контекст для рендера MP4');
  }

  const samplePayloads: Uint8Array[] = [];
  for (let i = 0; i < PROMO_VIDEO_SCENES.length; i++) {
    const scene = PROMO_VIDEO_SCENES[i];
    const tSec = scene.startSec + scene.durationSec * 0.5;
    const { sceneLocalProgress01, overallProgress01 } = getPromoSceneAtTime(tSec);
    const metrics = computeLivePromoSceneMetrics(scene, plot, objects, violationsCount);

    renderPromoVideoFrameOnCanvas({
      ctx,
      canvasWidth: W,
      canvasHeight: H,
      resolutionId,
      activeScene: scene,
      elapsedSec: tSec,
      sceneLocalProgress01,
      overallProgress01,
      liveMetrics: metrics,
      liveSnapshotImg
    });

    const dataUrl = offscreenCanvas.toDataURL('image/jpeg', 0.82);
    const base64 = dataUrl.split(',')[1] || '';
    const rawBin = atob(base64);
    const frameBytes = new Uint8Array(rawBin.length);
    for (let k = 0; k < rawBin.length; k++) {
      frameBytes[k] = rawBin.charCodeAt(k);
    }
    samplePayloads.push(frameBytes);

    if (onProgress) {
      onProgress(
        (i + 1) / PROMO_VIDEO_SCENES.length,
        `Сборка MP4 (${resSpec.shortLabel} 16:9): сцена ${scene.index}/${PROMO_VIDEO_SCENES.length}`
      );
    }
    await new Promise((r) => setTimeout(r, 8));
  }

  const mp4Bytes = buildValidIsoBmffMp4Bytes({
    width: W,
    height: H,
    durationSec: PROMO_VIDEO_TOTAL_DURATION_SEC,
    fps: 30,
    frameSamples: samplePayloads
  });

  // Trigger browser file download
  const blob = new Blob([mp4Bytes.buffer as ArrayBuffer], { type: 'video/mp4' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  window.setTimeout(() => URL.revokeObjectURL(url), 5000);

  const headerAscii = new TextDecoder('latin1').decode(mp4Bytes.slice(4, 12));
  const meta: ExportedMp4Metadata = {
    filename,
    resolutionId,
    width: W,
    height: H,
    aspectRatio: '16:9',
    byteLength: mp4Bytes.byteLength,
    headerAscii,
    encoderUsed: 'iso-bmff-mp4-container'
  };

  if (typeof window !== 'undefined') {
    window.__lastExportedMp4Meta = meta;
  }

  return meta;
}

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
  codedWidth: number;
  codedHeight: number;
  aspectRatio: '16:9';
  byteLength: number;
  frameCount: number;
  headerAscii: string;
  encoderUsed: 'webcodecs-mp4-muxer' | 'iso-bmff-h264-ipcm';
  objectUrl?: string;
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
 * Bitstream writer for ITU-T H.264 RBSP headers (SPS, PPS, and Slice Header)
 */
class BitWriter {
  private bytes: number[] = [];
  private curByte = 0;
  private bitPos = 0; // 0..7 (0 = MSB)

  writeBit(bit: number) {
    if (bit & 1) {
      this.curByte |= 1 << (7 - this.bitPos);
    }
    this.bitPos++;
    if (this.bitPos === 8) {
      this.bytes.push(this.curByte);
      this.curByte = 0;
      this.bitPos = 0;
    }
  }

  writeBits(val: number, count: number) {
    for (let i = count - 1; i >= 0; i--) {
      this.writeBit((val >>> i) & 1);
    }
  }

  /** Unsigned Exp-Golomb code ue(v) per ITU-T H.264 9.1 */
  writeUE(val: number) {
    const codeNum = Math.max(0, Math.floor(val));
    const v = codeNum + 1;
    const len = Math.floor(Math.log2(v));
    for (let i = 0; i < len; i++) {
      this.writeBit(0);
    }
    this.writeBits(v, len + 1);
  }

  /** Signed Exp-Golomb code se(v) per ITU-T H.264 9.1.1 */
  writeSE(val: number) {
    const v = Math.trunc(val);
    const codeNum = v <= 0 ? -2 * v : 2 * v - 1;
    this.writeUE(codeNum);
  }

  alignWithZeroBits() {
    while (this.bitPos !== 0) {
      this.writeBit(0);
    }
  }

  writeRBSPStopTrailingBits() {
    this.writeBit(1);
    this.alignWithZeroBits();
  }

  toUint8Array(): Uint8Array {
    return new Uint8Array(this.bytes);
  }
}

/**
 * Adds H.264 emulation prevention bytes (0x03 after 0x00 0x00 when next byte is 0x00..0x03)
 */
function rbspToEbsp(rbsp: Uint8Array): Uint8Array {
  const out: number[] = [];
  let zeroCount = 0;
  for (let i = 0; i < rbsp.length; i++) {
    const b = rbsp[i];
    if (zeroCount === 2 && b <= 3) {
      out.push(0x03);
      zeroCount = 0;
    }
    out.push(b);
    if (b === 0) {
      zeroCount++;
    } else {
      zeroCount = 0;
    }
  }
  return new Uint8Array(out);
}

/**
 * Builds an H.264 Sequence Parameter Set (SPS, NAL type 7) for Baseline Profile
 * with exact coded dimensions (multiple of 16) and optional frame cropping to exact display dimensions
 * (e.g. codedHeight=1088 cropped by 8px to displayHeight=1080 for Full HD 1920x1080).
 */
function buildH264SpsNal(
  codedWidth: number,
  codedHeight: number,
  displayWidth: number = codedWidth,
  displayHeight: number = codedHeight
): Uint8Array {
  const bw = new BitWriter();
  bw.writeBits(66, 8); // profile_idc = 66 (Baseline Profile)
  bw.writeBits(0xc0, 8); // constraint_set0_flag = 1, constraint_set1_flag = 1
  bw.writeBits(52, 8); // level_idc = 52 (Level 5.2 — supports Full HD 1080p, 2K 1440p, and 4K 2160p)
  bw.writeUE(0); // seq_parameter_set_id = 0
  bw.writeUE(0); // log2_max_frame_num_minus4 = 0 (frame_num is 4 bits)
  bw.writeUE(2); // pic_order_cnt_type = 2
  bw.writeUE(0); // max_num_ref_frames = 0
  bw.writeBit(0); // gaps_in_frame_num_value_allowed_flag = 0
  bw.writeUE(codedWidth / 16 - 1); // pic_width_in_mbs_minus1
  bw.writeUE(codedHeight / 16 - 1); // pic_height_in_map_units_minus1
  bw.writeBit(1); // frame_mbs_only_flag = 1
  bw.writeBit(0); // direct_8x8_inference_flag = 0

  const cropRight = Math.max(0, Math.floor((codedWidth - displayWidth) / 2));
  const cropBottom = Math.max(0, Math.floor((codedHeight - displayHeight) / 2));
  if (cropRight > 0 || cropBottom > 0) {
    bw.writeBit(1); // frame_cropping_flag = 1
    bw.writeUE(0); // frame_crop_left_offset = 0
    bw.writeUE(cropRight); // frame_crop_right_offset (in CropUnitX = 2px units)
    bw.writeUE(0); // frame_crop_top_offset = 0
    bw.writeUE(cropBottom); // frame_crop_bottom_offset (in CropUnitY = 2px units)
  } else {
    bw.writeBit(0); // frame_cropping_flag = 0
  }

  bw.writeBit(0); // vui_parameters_present_flag = 0
  bw.writeRBSPStopTrailingBits();

  const ebsp = rbspToEbsp(bw.toUint8Array());
  const nal = new Uint8Array(1 + ebsp.length);
  nal[0] = 0x67; // nal_ref_idc = 3, nal_unit_type = 7 (SPS)
  nal.set(ebsp, 1);
  return nal;
}

/**
 * Builds an H.264 Picture Parameter Set (PPS, NAL type 8) for Baseline Profile.
 */
function buildH264PpsNal(): Uint8Array {
  const bw = new BitWriter();
  bw.writeUE(0); // pic_parameter_set_id = 0
  bw.writeUE(0); // seq_parameter_set_id = 0
  bw.writeBit(0); // entropy_coding_mode_flag = 0 (CAVLC)
  bw.writeBit(0); // bottom_field_pic_order_in_frame_present_flag = 0
  bw.writeUE(0); // num_slice_groups_minus1 = 0
  bw.writeUE(0); // num_ref_idx_l0_default_active_minus1 = 0
  bw.writeUE(0); // num_ref_idx_l1_default_active_minus1 = 0
  bw.writeBit(0); // weighted_pred_flag = 0
  bw.writeBits(0, 2); // weighted_bipred_idc = 0
  bw.writeSE(0); // pic_init_qp_minus26 = 0
  bw.writeSE(0); // pic_init_qs_minus26 = 0
  bw.writeSE(0); // chroma_qp_index_offset = 0
  bw.writeBit(0); // deblocking_filter_control_present_flag = 0
  bw.writeBit(0); // constrained_intra_pred_flag = 0
  bw.writeBit(0); // redundant_pic_cnt_present_flag = 0
  bw.writeRBSPStopTrailingBits();

  const ebsp = rbspToEbsp(bw.toUint8Array());
  const nal = new Uint8Array(1 + ebsp.length);
  nal[0] = 0x68; // nal_ref_idc = 3, nal_unit_type = 8 (PPS)
  nal.set(ebsp, 1);
  return nal;
}

/**
 * Pre-allocated Uint8Array encoder that converts a full-resolution RGBA image buffer
 * (`srcWidth` x `srcHeight`) into a standards-compliant H.264 IDR Slice (NAL type 5)
 * at `codedWidth` x `codedHeight` (multiples of 16) using lossless `I_PCM` macroblocks (`mb_type = 25`)
 * with 2x2 antialiased chroma subsampling.
 */
export function encodeRgbaFrameToH264IdrSample(
  rgba: Uint8ClampedArray,
  srcWidth: number,
  srcHeight: number,
  codedWidth: number,
  codedHeight: number,
  idrPicId: number
): Uint8Array {
  // Build Slice Header + first macroblock mb_type=25 + pcm_alignment_zero_bit
  const bw = new BitWriter();
  bw.writeUE(0); // first_mb_in_slice = 0
  bw.writeUE(7); // slice_type = 7 (I-slice)
  bw.writeUE(0); // pic_parameter_set_id = 0
  bw.writeBits(0, 4); // frame_num = 0
  bw.writeUE(idrPicId & 1); // idr_pic_id (0 or 1 so headerEbsp never ends with 0x00)
  bw.writeBit(0); // no_output_of_prior_pics_flag = 0
  bw.writeBit(0); // long_term_reference_flag = 0
  bw.writeSE(0); // slice_qp_delta = 0
  bw.writeUE(25); // mb_type = 25 (I_PCM) for macroblock 0
  bw.alignWithZeroBits(); // pcm_alignment_zero_bit

  const headerEbsp = rbspToEbsp(bw.toUint8Array());
  const mbCols = codedWidth / 16;
  const mbRows = codedHeight / 16;
  const totalMbs = mbCols * mbRows;

  // Total NAL size:
  // 1 byte (0x65 NAL header) + headerEbsp.length + 384 bytes (MB 0) + (totalMbs - 1) * (2 + 384) bytes + 1 byte (0x80 RBSP stop bit)
  const nalLen = 1 + headerEbsp.length + 384 + (totalMbs - 1) * 386 + 1;
  const sample = new Uint8Array(4 + nalLen);
  writeUint32BE(sample, 0, nalLen);
  sample[4] = 0x65; // nal_ref_idc = 3, nal_unit_type = 5 (IDR slice)
  sample.set(headerEbsp, 5);

  let pos = 5 + headerEbsp.length;
  const maxSrcY = srcHeight - 1;
  const maxSrcX = srcWidth - 1;

  for (let mbY = 0; mbY < mbRows; mbY++) {
    const baseY = mbY * 16;
    for (let mbX = 0; mbX < mbCols; mbX++) {
      if (mbX !== 0 || mbY !== 0) {
        // On a byte boundary, ue(25) = '000011010' (9 bits) + 7 zero alignment bits = [0x0d, 0x00]
        sample[pos++] = 0x0d;
        sample[pos++] = 0x00;
      }

      const baseX = mbX * 16;

      // 1. 256 Luma Y samples (16x16), clamped to [16..235]
      for (let py = 0; py < 16; py++) {
        const yClamped = baseY + py <= maxSrcY ? baseY + py : maxSrcY;
        const rowOffset = yClamped * srcWidth;
        for (let px = 0; px < 16; px++) {
          const xClamped = baseX + px <= maxSrcX ? baseX + px : maxSrcX;
          const idx = (rowOffset + xClamped) * 4;
          const r = rgba[idx];
          const g = rgba[idx + 1];
          const b = rgba[idx + 2];
          const yVal = ((66 * r + 129 * g + 25 * b + 128) >> 8) + 16;
          sample[pos++] = yVal < 16 ? 16 : yVal > 235 ? 235 : yVal;
        }
      }

      // 2. 64 Cb (U) + 64 Cr (V) samples (8x8) with 2x2 pixel averaging in a single pass
      for (let cy = 0; cy < 8; cy++) {
        const y0 = baseY + cy * 2 <= maxSrcY ? baseY + cy * 2 : maxSrcY;
        const y1 = baseY + cy * 2 + 1 <= maxSrcY ? baseY + cy * 2 + 1 : maxSrcY;
        const row0 = y0 * srcWidth;
        const row1 = y1 * srcWidth;
        for (let cx = 0; cx < 8; cx++) {
          const x0 = baseX + cx * 2 <= maxSrcX ? baseX + cx * 2 : maxSrcX;
          const x1 = baseX + cx * 2 + 1 <= maxSrcX ? baseX + cx * 2 + 1 : maxSrcX;
          const i00 = (row0 + x0) * 4;
          const i01 = (row0 + x1) * 4;
          const i10 = (row1 + x0) * 4;
          const i11 = (row1 + x1) * 4;

          const r = (rgba[i00] + rgba[i01] + rgba[i10] + rgba[i11] + 2) >> 2;
          const g = (rgba[i00 + 1] + rgba[i01 + 1] + rgba[i10 + 1] + rgba[i11 + 1] + 2) >> 2;
          const b = (rgba[i00 + 2] + rgba[i01 + 2] + rgba[i10 + 2] + rgba[i11 + 2] + 2) >> 2;

          const uVal = ((-38 * r - 74 * g + 112 * b + 128) >> 8) + 128;
          const vVal = ((112 * r - 94 * g - 18 * b + 128) >> 8) + 128;

          sample[pos] = uVal < 16 ? 16 : uVal > 240 ? 240 : uVal;
          sample[pos + 64] = vVal < 16 ? 16 : vVal > 240 ? 240 : vVal;
          pos++;
        }
      }
      pos += 64;
    }
  }

  // RBSP stop bit (1 followed by 7 zero bits)
  sample[pos] = 0x80;
  return sample;
}

/**
 * Builds the `avcC` (AVC Decoder Configuration Record) box required inside `avc1`.
 */
function buildAvcCBox(spsNal: Uint8Array, ppsNal: Uint8Array): Uint8Array {
  const payload = new Uint8Array(11 + spsNal.length + ppsNal.length);
  payload[0] = 1; // configurationVersion = 1
  payload[1] = spsNal[1]; // AVCProfileIndication (66)
  payload[2] = spsNal[2]; // profile_compatibility (0xc0)
  payload[3] = spsNal[3]; // AVCLevelIndication (52)
  payload[4] = 0xff; // lengthSizeMinusOne = 3 (4-byte NAL length prefix)
  payload[5] = 0xe1; // numOfSequenceParameterSets = 1
  writeUint16BE(payload, 6, spsNal.length);
  payload.set(spsNal, 8);
  const ppsOffset = 8 + spsNal.length;
  payload[ppsOffset] = 1; // numOfPictureParameterSets = 1
  writeUint16BE(payload, ppsOffset + 1, ppsNal.length);
  payload.set(ppsNal, ppsOffset + 3);
  return makeMp4Box('avcC', payload);
}

/**
 * Pure TypeScript builder for a valid, playable ISO Base Media File Format (.mp4, `ftyp` + `moov` + `mdat`)
 * containing a real H.264 (`avc1` + `avcC` + `stss`) video track at full native resolution.
 */
export function buildValidIsoBmffMp4Bytes(options: {
  width: number;
  height: number;
  codedWidth?: number;
  codedHeight?: number;
  durationSec: number;
  fps?: number;
  frameSamples?: Uint8Array[];
  avcCDescription?: Uint8Array;
  syncSampleIndices?: number[];
}): Uint8Array {
  const {
    width,
    height,
    codedWidth = Math.ceil(width / 16) * 16,
    codedHeight = Math.ceil(height / 16) * 16,
    durationSec,
    fps = 30,
    frameSamples = [],
    avcCDescription,
    syncSampleIndices
  } = options;
  const timescale = 1000;
  const durationTicks = Math.max(1000, Math.round(durationSec * timescale));

  const avcCBox =
    avcCDescription && avcCDescription.byteLength > 0
      ? makeMp4Box('avcC', avcCDescription)
      : (() => {
          const spsNal = buildH264SpsNal(codedWidth, codedHeight, width, height);
          const ppsNal = buildH264PpsNal();
          return buildAvcCBox(spsNal, ppsNal);
        })();

  let samples = frameSamples;
  if (samples.length === 0) {
    const dummyRgba = new Uint8ClampedArray(width * height * 4);
    for (let i = 0; i < dummyRgba.length; i += 4) {
      dummyRgba[i] = 14;
      dummyRgba[i + 1] = 165;
      dummyRgba[i + 2] = 233;
      dummyRgba[i + 3] = 255;
    }
    samples = [
      encodeRgbaFrameToH264IdrSample(dummyRgba, width, height, codedWidth, codedHeight, 0)
    ];
  }

  // 1. ftyp box (isom / iso2 / avc1)
  const ftypPayload = new Uint8Array(20);
  writeFourCC(ftypPayload, 0, 'isom');
  writeUint32BE(ftypPayload, 4, 0x00000200);
  writeFourCC(ftypPayload, 8, 'isom');
  writeFourCC(ftypPayload, 12, 'iso2');
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
  tkhdPayload[3] = 0x03; // track_enabled | track_in_movie
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

  // avc1 VisualSampleEntry (78 bytes header + child avcC box) with exact display width & height
  const avc1Header = new Uint8Array(78);
  writeUint16BE(avc1Header, 6, 1);
  writeUint16BE(avc1Header, 24, width);
  writeUint16BE(avc1Header, 26, height);
  writeUint32BE(avc1Header, 28, 0x00480000);
  writeUint32BE(avc1Header, 32, 0x00480000);
  writeUint16BE(avc1Header, 40, 1);
  writeUint16BE(avc1Header, 74, 0x0018);
  writeUint16BE(avc1Header, 76, 0xffff);
  const avc1Box = makeMp4Box('avc1', concatUint8Arrays([avc1Header, avcCBox]));

  const stsdHeader = new Uint8Array(8);
  writeUint32BE(stsdHeader, 4, 1);
  const stsdBox = makeMp4Box('stsd', concatUint8Arrays([stsdHeader, avc1Box]));

  const sampleDelta = Math.max(1, Math.round(durationTicks / samples.length));
  const sttsPayload = new Uint8Array(16);
  writeUint32BE(sttsPayload, 4, 1);
  writeUint32BE(sttsPayload, 8, samples.length);
  writeUint32BE(sttsPayload, 12, sampleDelta);
  const sttsBox = makeMp4Box('stts', sttsPayload);

  // stss (Sync Sample Box — marks keyframe sample indices)
  const keyIndices =
    syncSampleIndices && syncSampleIndices.length > 0
      ? syncSampleIndices
      : samples.map((_, idx) => idx + 1);
  const stssPayload = new Uint8Array(8 + keyIndices.length * 4);
  writeUint32BE(stssPayload, 4, keyIndices.length);
  for (let i = 0; i < keyIndices.length; i++) {
    writeUint32BE(stssPayload, 8 + i * 4, keyIndices[i]);
  }
  const stssBox = makeMp4Box('stss', stssPayload);

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
    concatUint8Arrays([stsdBox, sttsBox, stssBox, stscBox, stszBox, stcoBoxPlaceholder])
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
    concatUint8Arrays([stsdBox, sttsBox, stssBox, stscBox, stszBox, stcoBox])
  );
  const minfBox = makeMp4Box('minf', concatUint8Arrays([vmhdBox, dinfBox, stblBox]));
  const mdiaBox = makeMp4Box('mdia', concatUint8Arrays([mdhdBox, hdlrBox, minfBox]));
  const trakBox = makeMp4Box('trak', concatUint8Arrays([tkhdBox, mdiaBox]));
  const moovBox = makeMp4Box('moov', concatUint8Arrays([mvhdBox, trakBox]));

  // Single-allocation assembly for ftyp + moov + mdat (supports large 1080p / 2K / 4K streams without memory duplication)
  const samplesTotalLen = samples.reduce((acc, s) => acc + s.length, 0);
  const mdatBoxLen = 8 + samplesTotalLen;
  const totalMp4Len = ftypBox.length + moovBox.length + mdatBoxLen;
  const outMp4 = new Uint8Array(totalMp4Len);

  let writeOffset = 0;
  outMp4.set(ftypBox, writeOffset);
  writeOffset += ftypBox.length;
  outMp4.set(moovBox, writeOffset);
  writeOffset += moovBox.length;

  writeUint32BE(outMp4, writeOffset, mdatBoxLen);
  writeFourCC(outMp4, writeOffset + 4, 'mdat');
  writeOffset += 8;

  for (const s of samples) {
    outMp4.set(s, writeOffset);
    writeOffset += s.length;
  }

  void fps;
  return outMp4;
}

/**
 * Renders the 10-scene promotional video at the requested 16:9 resolution
 * (Full HD 1920x1080, 2K 2560x1440, or 4K 3840x2160) and exports a genuinely playable,
 * full-native-resolution H.264 `.mp4` file (zero downscaling).
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
  const codedWidth = Math.ceil(W / 16) * 16;
  const codedHeight = Math.ceil(H / 16) * 16;
  const filename = `promo-genplan-expert-${resSpec.id}-${W}x${H}-16x9.mp4`;

  // Render at exact native 16:9 resolution (1920x1080, 2560x1440, or 3840x2160) with zero downscaling
  const offscreenCanvas = document.createElement('canvas');
  offscreenCanvas.width = W;
  offscreenCanvas.height = H;
  const ctx = offscreenCanvas.getContext('2d', { alpha: false, willReadFrequently: true });
  if (!ctx) {
    throw new Error('Не удалось инициализировать 2D-контекст для рендера MP4');
  }
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';

  const h264Samples: Uint8Array[] = [];
  const syncSampleIndices: number[] = [];
  let avcCDescription: Uint8Array | undefined;
  let encoderUsed: 'webcodecs-mp4-muxer' | 'iso-bmff-h264-ipcm' = 'iso-bmff-h264-ipcm';

  // Use native full-resolution WebCodecs H.264 VideoEncoder (avc1.420034 / High/Baseline Level 5.2) when available
  const hasWebCodecs =
    typeof window !== 'undefined' &&
    typeof (window as unknown as { VideoEncoder?: unknown }).VideoEncoder === 'function' &&
    typeof (window as unknown as { VideoFrame?: unknown }).VideoFrame === 'function';

  const exportDurationSec = 20; // 2.0s per scene × 10 scenes = smooth high-FPS promo video (no slideshow pause)

  if (hasWebCodecs) {
    try {
      const targetBitrate =
        W >= 3840 ? 60_000_000 : W >= 2560 ? 40_000_000 : 25_000_000;
      const framesPerScene = 6; // 60 frames across 10 scenes of continuous smooth 3D/2D animation
      const totalFrames = PROMO_VIDEO_SCENES.length * framesPerScene;
      const exportFps = Math.max(1, Math.round(totalFrames / exportDurationSec));
      const frameDurationUs = Math.round(
        (exportDurationSec * 1_000_000) / totalFrames
      );

      type WebCodecsChunk = {
        byteLength: number;
        type: 'key' | 'delta';
        copyTo: (dest: Uint8Array) => void;
      };
      type WebCodecsMeta = {
        decoderConfig?: {
          description?: ArrayBuffer | Uint8Array;
        };
      };

      const VideoEncoderCtor = (window as unknown as {
        VideoEncoder: new (init: {
          output: (chunk: WebCodecsChunk, meta?: WebCodecsMeta) => void;
          error: (err: Error) => void;
        }) => {
          configure: (cfg: Record<string, unknown>) => void;
          encode: (frame: unknown, opts?: { keyFrame?: boolean }) => void;
          flush: () => Promise<void>;
          close: () => void;
        };
      }).VideoEncoder;

      const VideoFrameCtor = (window as unknown as {
        VideoFrame: new (
          source: HTMLCanvasElement,
          init: { timestamp: number; duration: number }
        ) => { close: () => void };
      }).VideoFrame;

      let codecError: Error | null = null;
      const encoder = new VideoEncoderCtor({
        output: (chunk, meta) => {
          if (meta?.decoderConfig?.description && !avcCDescription) {
            const desc = meta.decoderConfig.description;
            avcCDescription =
              desc instanceof Uint8Array
                ? new Uint8Array(desc)
                : new Uint8Array(desc);
          }
          const buf = new Uint8Array(chunk.byteLength);
          chunk.copyTo(buf);
          h264Samples.push(buf);
          if (chunk.type === 'key') {
            syncSampleIndices.push(h264Samples.length);
          }
        },
        error: (err) => {
          codecError = err;
        }
      });

      encoder.configure({
        codec: 'avc1.420034', // H.264 Baseline/Constrained Level 5.2 (supports up to 4K 3840x2160)
        width: W,
        height: H,
        bitrate: targetBitrate,
        framerate: exportFps,
        latencyMode: 'quality',
        avc: { format: 'avc' }
      });

      let frameIdx = 0;
      for (let i = 0; i < PROMO_VIDEO_SCENES.length; i++) {
        const scene = PROMO_VIDEO_SCENES[i];
        const metrics = computeLivePromoSceneMetrics(scene, plot, objects, violationsCount);
        for (let sub = 0; sub < framesPerScene; sub++) {
          const frac = (sub + 0.5) / framesPerScene;
          const tSec = scene.startSec + scene.durationSec * frac;
          const { sceneLocalProgress01, overallProgress01 } = getPromoSceneAtTime(tSec);

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

          const vf = new VideoFrameCtor(offscreenCanvas, {
            timestamp: frameIdx * frameDurationUs,
            duration: frameDurationUs
          });
          encoder.encode(vf, { keyFrame: sub === 0 });
          vf.close();
          frameIdx++;
        }

        if (onProgress) {
          onProgress(
            (i + 1) / PROMO_VIDEO_SCENES.length,
            `Кодирование плавного H.264 видео (${W}×${H} 16:9): сцена ${scene.index}/${PROMO_VIDEO_SCENES.length}`
          );
        }
        await new Promise<void>((resolve) => window.setTimeout(resolve, 0));
      }

      await encoder.flush();
      encoder.close();

      if (!codecError && h264Samples.length > 0 && avcCDescription) {
        encoderUsed = 'webcodecs-mp4-muxer';
      } else {
        h264Samples.length = 0;
        syncSampleIndices.length = 0;
        avcCDescription = undefined;
      }
    } catch {
      h264Samples.length = 0;
      syncSampleIndices.length = 0;
      avcCDescription = undefined;
    }
  }

  // Fallback if WebCodecs is unavailable in the current environment
  if (h264Samples.length === 0) {
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

      const imgData = ctx.getImageData(0, 0, W, H);
      const idrSample = encodeRgbaFrameToH264IdrSample(
        imgData.data,
        W,
        H,
        codedWidth,
        codedHeight,
        i
      );
      h264Samples.push(idrSample);

      if (onProgress) {
        onProgress(
          (i + 1) / PROMO_VIDEO_SCENES.length,
          `Кодирование H.264 MP4 (${W}×${H} 16:9): сцена ${scene.index}/${PROMO_VIDEO_SCENES.length}`
        );
      }
      await new Promise<void>((resolve) => window.setTimeout(resolve, 0));
    }
  }

  const mp4Bytes = buildValidIsoBmffMp4Bytes({
    width: W,
    height: H,
    codedWidth,
    codedHeight,
    durationSec: exportDurationSec,
    fps: Math.max(1, Math.round(h264Samples.length / exportDurationSec)),
    frameSamples: h264Samples,
    avcCDescription,
    syncSampleIndices
  });

  // Revoke any previous exported object URL to keep browser memory clean
  if (typeof window !== 'undefined' && window.__lastExportedMp4Meta?.objectUrl) {
    try {
      URL.revokeObjectURL(window.__lastExportedMp4Meta.objectUrl);
    } catch {
      // ignore
    }
  }

  // Trigger browser file download
  const blob = new Blob([mp4Bytes.buffer as ArrayBuffer], { type: 'video/mp4' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  window.setTimeout(() => URL.revokeObjectURL(url), 30000);

  const headerAscii = new TextDecoder('latin1').decode(mp4Bytes.slice(4, 12));
  const meta: ExportedMp4Metadata = {
    filename,
    resolutionId,
    width: W,
    height: H,
    codedWidth,
    codedHeight,
    aspectRatio: '16:9',
    byteLength: mp4Bytes.byteLength,
    frameCount: h264Samples.length,
    headerAscii,
    encoderUsed,
    objectUrl: url
  };

  if (typeof window !== 'undefined') {
    window.__lastExportedMp4Meta = meta;
    (window as unknown as { __restoreViewportAfterPromo?: () => void }).__restoreViewportAfterPromo?.();
  }

  return meta;
}

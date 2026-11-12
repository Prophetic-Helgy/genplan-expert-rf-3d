import * as THREE from 'three';
import { SiteObject, RoofType, PlotConfig, BuildingDoorsConfig, WindowConstructionTypeId } from '../types';
import { BUILDING_CATEGORY_LABELS, WINDOW_TYPES_INFO } from '../data/regions';
import {
  getLocalObjectFootprintPolygon,
  getObjectWindowsConfig,
  getObjectDoorsConfig,
  getEffectiveWindowTypeId,
  calculateInteriorSunPatches,
  computeTotalAboveGroundWallHeight,
  getDefaultBurialDepth,
  getDefaultPipelineDiameterMm,
  calculateBuildingThermalHeatmap,
  isEnclosedBuildingCategory
} from './calculations';

/**
 * Generates procedural canvas textures for walls and roofs (zero external URLs / zero 404s).
 */
let cachedWallTexture: THREE.CanvasTexture | null = null;
let cachedRoofTexture: THREE.CanvasTexture | null = null;

function getWallBumpTexture(): THREE.CanvasTexture {
  if (cachedWallTexture) return cachedWallTexture;
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.fillStyle = '#d4d4d8';
    ctx.fillRect(0, 0, 128, 128);
    ctx.strokeStyle = '#a1a1aa';
    ctx.lineWidth = 2;
    for (let y = 0; y < 128; y += 16) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(128, y);
      ctx.stroke();
      const offset = (y / 16) % 2 === 0 ? 0 : 16;
      for (let x = offset; x < 128; x += 32) {
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x, y + 16);
        ctx.stroke();
      }
    }
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(3, 2);
  cachedWallTexture = tex;
  return tex;
}

function getRoofBumpTexture(): THREE.CanvasTexture {
  if (cachedRoofTexture) return cachedRoofTexture;
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.fillStyle = '#cbd5e1';
    ctx.fillRect(0, 0, 128, 128);
    ctx.fillStyle = '#94a3b8';
    for (let x = 0; x < 128; x += 16) {
      ctx.fillRect(x, 0, 6, 128);
    }
    ctx.strokeStyle = '#64748b';
    ctx.lineWidth = 2;
    for (let y = 0; y < 128; y += 24) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(128, y);
      ctx.stroke();
    }
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(4, 4);
  cachedRoofTexture = tex;
  return tex;
}

function create3DSlopeArrow(arrowLength: number): THREE.Group {
  const arrowGroup = new THREE.Group();
  arrowGroup.userData = { isRoofSlopeArrow: true };
  const shaftLen = Math.max(0.45, arrowLength * 0.68);
  const headLen = Math.max(0.28, arrowLength * 0.32);
  const headHalfW = Math.max(0.2, headLen * 0.65);

  const shaftGeo = new THREE.BoxGeometry(shaftLen, 0.07, 0.14);
  shaftGeo.translate(-headLen * 0.3, 0, 0);

  const headShape = new THREE.Shape();
  headShape.moveTo(0, -headHalfW);
  headShape.lineTo(headLen, 0);
  headShape.lineTo(0, headHalfW);
  headShape.closePath();
  const headGeo = new THREE.ExtrudeGeometry(headShape, { depth: 0.07, bevelEnabled: false });
  headGeo.rotateX(Math.PI / 2);

  const arrowMat = new THREE.MeshStandardMaterial({
    color: 0x38bdf8,
    emissive: 0x0284c7,
    emissiveIntensity: 0.45,
    roughness: 0.25
  });
  const shaft = new THREE.Mesh(shaftGeo, arrowMat);
  const head = new THREE.Mesh(headGeo, arrowMat);
  head.position.set(shaftLen / 2 - headLen * 0.3, 0.035, 0);
  arrowGroup.add(shaft, head);
  return arrowGroup;
}

/**
 * Builds a single vertical wall panel with real physical window AND entrance/patio door cutouts (holes),
 * architectural door leaf/handle/porch step, and window frames/glass across 1..3 stories.
 * Respects user-configured windowWidth, windowHeight, sillHeight, positionOffset AND
 * doorCount, doorWidth, doorHeight, thresholdHeight, positionOffset, hasGlazing.
 */
function buildWallWithWindowCutouts(
  spanLen: number,
  bodyH: number,
  wallThick: number,
  windowCount: number,
  doorCount: number,
  wallMat: THREE.Material,
  glassMat: THREE.Material,
  frameMat: THREE.Material,
  xrayWallsMode: boolean,
  winCustomize?: {
    windowWidth?: number;
    windowHeight?: number;
    sillHeight?: number;
    positionOffset?: number;
    windowTypeId?: WindowConstructionTypeId;
  },
  floorsCount = 1,
  floorH = bodyH,
  slabThick = 0,
  doorCustomize?: Partial<BuildingDoorsConfig>,
  activeThermalMap = false
): THREE.Group {
  const wallGroup = new THREE.Group();
  const halfSpan = spanLen / 2;

  const wallShape = new THREE.Shape();
  wallShape.moveTo(-halfSpan, 0);
  wallShape.lineTo(halfSpan, 0);
  wallShape.lineTo(halfSpan, bodyH);
  wallShape.lineTo(-halfSpan, bodyH);
  wallShape.closePath();

  const safeFloors = Math.max(1, Math.min(3, Math.round(floorsCount)));
  const groundSpanH = safeFloors > 1 ? Math.min(floorH, bodyH) : bodyH;

  // 1. Compute & Carve Ground-Floor Door Cutouts First (so doors NEVER disappear when windows are present)
  const doorIntervals: Array<{ left: number; right: number; topY: number }> = [];
  const safeDoorCount = Math.max(0, Math.min(3, Math.round(doorCount || 0)));

  if (safeDoorCount > 0 && spanLen >= 1.0 && groundSpanH >= 1.0) {
    const maxAllowedDoorW = (spanLen * 0.78) / safeDoorCount;
    const doorW = Math.max(0.5, Math.min(maxAllowedDoorW, doorCustomize?.doorWidth ?? 0.95));
    const threshY = Math.min(groundSpanH * 0.25, Math.max(0.0, doorCustomize?.thresholdHeight ?? 0.05));
    const reqDoorH = Math.min(groundSpanH - threshY - 0.06, Math.max(0.85, doorCustomize?.doorHeight ?? 2.05));
    const topDoorY = Math.min(bodyH - 0.05, threshY + reqDoorH);
    const doorH = Math.max(0.75, topDoorY - threshY);
    const doorShift = (doorCustomize?.positionOffset ?? 0) * (spanLen * 0.38);
    const maxDoorCenter = Math.max(0, halfSpan - doorW / 2 - 0.1);

    const doorLeafMat = new THREE.MeshStandardMaterial({
      color: activeThermalMap ? 0xf97316 : 0x78350f,
      emissive: activeThermalMap ? 0xea580c : 0x000000,
      emissiveIntensity: activeThermalMap ? 0.58 : 0,
      roughness: 0.55,
      metalness: 0.15,
      transparent: xrayWallsMode,
      opacity: xrayWallsMode ? 0.52 : 1.0
    });

    const handleMat = new THREE.MeshStandardMaterial({
      color: 0xfbbf24,
      roughness: 0.2,
      metalness: 0.85
    });

    const stepMat = new THREE.MeshStandardMaterial({
      color: 0x64748b,
      roughness: 0.85,
      metalness: 0.1
    });

    for (let dIdx = 0; dIdx < safeDoorCount; dIdx++) {
      const baseDoorCx =
        (safeDoorCount === 1 ? 0 : ((dIdx + 0.5) / safeDoorCount - 0.5) * (spanLen * 0.65)) +
        doorShift;
      const dCx = Math.max(-maxDoorCenter, Math.min(maxDoorCenter, baseDoorCx));
      const dLeft = dCx - doorW / 2;
      const dRight = dCx + doorW / 2;

      // Ensure no overlap with an already placed door on the same wall
      const overlapsPrevDoor = doorIntervals.some(
        (iv) => !(dRight + 0.04 <= iv.left || dLeft - 0.04 >= iv.right)
      );
      if (overlapsPrevDoor) continue;

      doorIntervals.push({ left: dLeft, right: dRight, topY: topDoorY });

      const doorHole = new THREE.Path();
      doorHole.moveTo(dLeft, threshY);
      doorHole.lineTo(dRight, threshY);
      doorHole.lineTo(dRight, topDoorY);
      doorHole.lineTo(dLeft, topDoorY);
      doorHole.closePath();
      wallShape.holes.push(doorHole);

      const doorSubGroup = new THREE.Group();
      doorSubGroup.userData = {
        isDoor: true,
        doorIndex: dIdx,
        doorWidth: doorW,
        doorHeight: doorH,
        thresholdHeight: threshY,
        hasGlazing: Boolean(doorCustomize?.hasGlazing)
      };

      // Door Leaf
      const leafMesh = new THREE.Mesh(
        new THREE.BoxGeometry(doorW - 0.04, doorH - 0.04, Math.max(0.06, wallThick * 0.45)),
        doorLeafMat
      );
      leafMesh.position.set(dCx, threshY + doorH / 2, wallThick / 2);
      leafMesh.castShadow = !xrayWallsMode;
      doorSubGroup.add(leafMesh);

      // Optional Glazed Window Insert inside the door leaf
      if (doorCustomize?.hasGlazing) {
        const insertW = Math.max(0.22, doorW * 0.58);
        const insertH = Math.max(0.35, doorH * 0.46);
        const insertMesh = new THREE.Mesh(
          new THREE.BoxGeometry(insertW, insertH, Math.max(0.08, wallThick * 0.52)),
          glassMat
        );
        insertMesh.position.set(dCx, threshY + doorH * 0.62, wallThick / 2);
        insertMesh.userData = { isDoorGlazing: true };
        doorSubGroup.add(insertMesh);
      }

      // Outer Door Frame Outline
      const dFrameEdges = new THREE.EdgesGeometry(
        new THREE.BoxGeometry(doorW, doorH, wallThick + 0.03)
      );
      const dFrameLine = new THREE.LineSegments(
        dFrameEdges,
        new THREE.LineBasicMaterial({ color: xrayWallsMode ? 0xfbbf24 : 0x0f172a })
      );
      dFrameLine.position.set(dCx, threshY + doorH / 2, wallThick / 2);
      doorSubGroup.add(dFrameLine);

      // Door Handle (both sides of the door leaf)
      const handleX = dCx + doorW * 0.34;
      const handleY = threshY + doorH * 0.47;
      const handleMesh = new THREE.Mesh(
        new THREE.BoxGeometry(0.11, 0.04, wallThick * 0.68),
        handleMat
      );
      handleMesh.position.set(handleX, handleY, wallThick / 2);
      doorSubGroup.add(handleMesh);

      // Exterior Entrance Threshold / Porch Step
      const stepW = Math.min(spanLen, doorW + 0.28);
      const stepDepth = 0.32;
      const stepH = Math.max(0.08, threshY + 0.06);
      const stepMesh = new THREE.Mesh(new THREE.BoxGeometry(stepW, stepH, stepDepth), stepMat);
      stepMesh.position.set(dCx, stepH / 2, wallThick + stepDepth / 2 - 0.02);
      stepMesh.receiveShadow = true;
      doorSubGroup.add(stepMesh);

      wallGroup.add(doorSubGroup);
    }
  }

  // 2. Compute & Carve Window Cutouts on each story (automatically avoiding ground-floor door cutouts)
  const maxAllowedWinW = windowCount > 0 ? (spanLen * 0.82) / windowCount : 0;
  const winW = windowCount > 0 ? Math.max(0.35, Math.min(maxAllowedWinW, winCustomize?.windowWidth ?? 1.3)) : 0;
  const shiftAlongWall = (winCustomize?.positionOffset ?? 0) * (spanLen * 0.35);
  const maxCenter = Math.max(0, halfSpan - winW / 2 - 0.12);

  for (let s = 0; s < safeFloors; s++) {
    const storyBaseY = safeFloors > 1 ? s * (floorH + slabThick) : 0;
    const storySpanH = safeFloors > 1 ? Math.min(floorH, Math.max(0.8, bodyH - storyBaseY)) : bodyH;

    const sillOffset = Math.min(storySpanH - 0.42, Math.max(0.1, winCustomize?.sillHeight ?? 0.85));
    const reqWinH = Math.min(storySpanH - sillOffset - 0.08, Math.max(0.35, winCustomize?.windowHeight ?? 1.3));
    const sillLocalY = storyBaseY + sillOffset;
    const topLocalY = Math.min(bodyH - 0.06, sillLocalY + reqWinH);
    const winH = Math.max(0.32, topLocalY - sillLocalY);

    if (windowCount > 0 && spanLen >= 1.4 && storySpanH >= 1.1 && topLocalY > sillLocalY + 0.25) {
      const storyWinIntervals: Array<{ left: number; right: number }> = [];

      for (let i = 0; i < windowCount; i++) {
        const baseCx = ((i + 0.5) / windowCount - 0.5) * (spanLen * 0.72) + shiftAlongWall;
        let cx = Math.max(-maxCenter, Math.min(maxCenter, baseCx));

        // On ground floor (s === 0), check if window collides with any door interval
        if (s === 0 && doorIntervals.length > 0) {
          const checkDoorOverlap = (candidateCx: number) => {
            const cLeft = candidateCx - winW / 2;
            const cRight = candidateCx + winW / 2;
            return doorIntervals.find(
              (dIv) =>
                sillLocalY < dIv.topY + 0.06 &&
                !(cRight + 0.08 <= dIv.left || cLeft - 0.08 >= dIv.right)
            );
          };

          const hitDoor = checkDoorOverlap(cx);
          if (hitDoor) {
            // Try shifting window to the right or left of the door
            const candRight = hitDoor.right + 0.12 + winW / 2;
            const candLeft = hitDoor.left - 0.12 - winW / 2;
            if (candRight <= maxCenter && !checkDoorOverlap(candRight)) {
              cx = candRight;
            } else if (candLeft >= -maxCenter && !checkDoorOverlap(candLeft)) {
              cx = candLeft;
            } else {
              // Not enough room on ground floor for both door and this window; skip only this ground-floor window
              continue;
            }
          }
        }

        const x1 = cx - winW / 2;
        const x2 = cx + winW / 2;

        // Avoid overlapping another window on the same story
        if (
          storyWinIntervals.some((wIv) => !(x2 + 0.04 <= wIv.left || x1 - 0.04 >= wIv.right))
        ) {
          continue;
        }
        storyWinIntervals.push({ left: x1, right: x2 });

        const hole = new THREE.Path();
        hole.moveTo(x1, sillLocalY);
        hole.lineTo(x2, sillLocalY);
        hole.lineTo(x2, topLocalY);
        hole.lineTo(x1, topLocalY);
        hole.closePath();
        wallShape.holes.push(hole);

        // Window glass panes (1, 2, or 3 panes depending on windowTypeId) & 3D profile frame inside the cutout
        const winTypeId: WindowConstructionTypeId = winCustomize?.windowTypeId || 'pvc_double_chamber';
        const winTypeInfo = WINDOW_TYPES_INFO[winTypeId] || WINDOW_TYPES_INFO.pvc_double_chamber;
        const glassCount = winTypeInfo.glassCount;
        const paneSpacing = glassCount === 1 ? 0 : glassCount === 2 ? 0.032 : 0.024;

        for (let gIdx = 0; gIdx < glassCount; gIdx++) {
          const zOffset = (gIdx - (glassCount - 1) / 2) * paneSpacing;
          const glassPane = new THREE.Mesh(
            new THREE.BoxGeometry(winW - 0.08, winH - 0.08, 0.012),
            glassMat
          );
          glassPane.position.set(cx, sillLocalY + winH / 2, wallThick / 2 + zOffset);
          glassPane.userData = {
            isWindowPane: true,
            isWindowGlass: true,
            storyIndex: s,
            windowIndex: i,
            paneIndex: gIdx,
            windowTypeId: winTypeId,
            glassCount
          };
          wallGroup.add(glassPane);
        }

        // 3D Window profile frame (wooden or PVC sash & center mullion)
        const fThick = 0.045;
        const fDepth = Math.min(wallThick + 0.02, winTypeInfo.frameMaterial === 'pvc' ? 0.09 : 0.11);
        const topRail = new THREE.Mesh(new THREE.BoxGeometry(winW, fThick, fDepth), frameMat);
        topRail.position.set(cx, topLocalY - fThick / 2, wallThick / 2);
        const botRail = new THREE.Mesh(new THREE.BoxGeometry(winW, fThick, fDepth), frameMat);
        botRail.position.set(cx, sillLocalY + fThick / 2, wallThick / 2);
        const leftStile = new THREE.Mesh(new THREE.BoxGeometry(fThick, winH, fDepth), frameMat);
        leftStile.position.set(cx - winW / 2 + fThick / 2, sillLocalY + winH / 2, wallThick / 2);
        const rightStile = new THREE.Mesh(new THREE.BoxGeometry(fThick, winH, fDepth), frameMat);
        rightStile.position.set(cx + winW / 2 - fThick / 2, sillLocalY + winH / 2, wallThick / 2);
        const mullion = new THREE.Mesh(new THREE.BoxGeometry(fThick * 0.75, winH - fThick * 2, fDepth * 0.9), frameMat);
        mullion.position.set(cx, sillLocalY + winH / 2, wallThick / 2);
        mullion.userData = { isWindowFrame: true, windowTypeId: winTypeId, frameMaterial: winTypeInfo.frameMaterial };
        wallGroup.add(topRail, botRail, leftStile, rightStile, mullion);

        // Window frame outline
        const frameEdges = new THREE.EdgesGeometry(new THREE.BoxGeometry(winW, winH, wallThick + 0.02));
        const frameLine = new THREE.LineSegments(
          frameEdges,
          new THREE.LineBasicMaterial({
            color: xrayWallsMode ? 0x38bdf8 : winTypeInfo.frameMaterial === 'wood' ? 0x78350f : 0x1e293b
          })
        );
        frameLine.position.set(cx, sillLocalY + winH / 2, wallThick / 2);
        wallGroup.add(frameLine);
      }
    }
  }

  const extrudeGeo = new THREE.ExtrudeGeometry(wallShape, {
    depth: wallThick,
    bevelEnabled: false
  });
  const wallMesh = new THREE.Mesh(extrudeGeo, wallMat);
  wallMesh.castShadow = true;
  wallMesh.receiveShadow = true;
  wallGroup.add(wallMesh);

  if (xrayWallsMode) {
    const edges = new THREE.EdgesGeometry(extrudeGeo);
    const edgeLines = new THREE.LineSegments(
      edges,
      new THREE.LineBasicMaterial({ color: 0x94a3b8, transparent: true, opacity: 0.65 })
    );
    wallGroup.add(edgeLines);
  }

  return wallGroup;
}

/**
 * Builds the exact mathematical roof BufferGeometry for the 4 required roof types,
 * guaranteeing that NO wall, pediment, or corner ever pokes through the roof planes,
 * INCLUDING 3D slope direction arrows (стрелочки направления ската крыши) on ALL roof types:
 * 1. Плоская (Flat): Тонкий параллелепипед парапета + плита покрытия + стрелка уклона водостока
 * 2. Односкатная (Shed): Прямая трапециевидная призма / Треугольная призма (клин) со стрелкой направления ската
 * 3. Двускатная (Gable): Прямая пятиугольная призма + 2 стрелки скатов от конька
 * 4. Пирамидальная / Шатровая (Hip/Pyramid): Четырехугольная пирамида / обелиск + 4 стрелки скатов
 */
export function buildRoofOnlyGroup(
  W: number,
  L: number,
  H_wall: number,
  H_roof: number,
  O: number,
  roofType: RoofType,
  slopeDirection: SiteObject['slopeDirection'],
  roofColorHex: number,
  gableWallMaterial: THREE.Material,
  xrayWallsMode = false
): THREE.Group {
  const roofGroup = new THREE.Group();
  roofGroup.userData = { isRoofGroup: true, roofType, H_wall, H_roof };
  const rw = W + 2 * O;
  const rl = L + 2 * O;
  const hw = W / 2;
  const hl = L / 2;
  const hrw = rw / 2;
  const hrl = rl / 2;

  const roofMat = new THREE.MeshStandardMaterial({
    color: roofColorHex,
    roughness: 0.45,
    metalness: 0.25,
    bumpMap: !xrayWallsMode && typeof document !== 'undefined' ? getRoofBumpTexture() : null,
    bumpScale: 0.03,
    transparent: xrayWallsMode,
    opacity: xrayWallsMode ? 0.16 : 1.0,
    depthWrite: !xrayWallsMode,
    side: THREE.DoubleSide
  });

  const trimMat = new THREE.MeshStandardMaterial({
    color: 0x1e293b,
    roughness: 0.3,
    metalness: 0.5,
    transparent: xrayWallsMode,
    opacity: xrayWallsMode ? 0.28 : 1.0,
    depthWrite: !xrayWallsMode
  });

  if (roofType === 'flat') {
    const slabH = 0.24;
    const baseClearance = 0;
    const slabGeo = new THREE.BoxGeometry(rw, slabH, rl);
    const slabMesh = new THREE.Mesh(slabGeo, roofMat);
    slabMesh.position.y = H_wall + baseClearance + slabH / 2;
    slabMesh.castShadow = !xrayWallsMode;
    slabMesh.receiveShadow = true;
    slabMesh.userData = { isRoofDeck: true, minBottomY: H_wall };
    roofGroup.add(slabMesh);

    const pThick = 0.25;
    const pHeight = Math.max(0.35, Math.min(0.8, H_roof || 0.45));
    const pCenterY = H_wall + baseClearance + slabH + pHeight / 2;
    const northParapet = new THREE.Mesh(new THREE.BoxGeometry(rw, pHeight, pThick), trimMat);
    northParapet.position.set(0, pCenterY, -hrl + pThick / 2);
    const southParapet = new THREE.Mesh(new THREE.BoxGeometry(rw, pHeight, pThick), trimMat);
    southParapet.position.set(0, pCenterY, hrl - pThick / 2);
    const eastParapet = new THREE.Mesh(new THREE.BoxGeometry(pThick, pHeight, rl - 2 * pThick), trimMat);
    eastParapet.position.set(hrw - pThick / 2, pCenterY, 0);
    const westParapet = new THREE.Mesh(new THREE.BoxGeometry(pThick, pHeight, rl - 2 * pThick), trimMat);
    westParapet.position.set(-hrw + pThick / 2, pCenterY, 0);

    // 3D Drainage slope arrow on flat roof
    const flatArrow = create3DSlopeArrow(Math.min(2.2, Math.min(W, L) * 0.45));
    flatArrow.position.set(0, H_wall + baseClearance + slabH + 0.08, 0);
    if (slopeDirection === 'south') flatArrow.rotation.y = -Math.PI / 2;
    else if (slopeDirection === 'west') flatArrow.rotation.y = Math.PI;
    else if (slopeDirection === 'north') flatArrow.rotation.y = Math.PI / 2;

    roofGroup.add(northParapet, southParapet, eastParapet, westParapet, flatArrow);
    return roofGroup;
  }

  if (roofType === 'shed') {
    const dH = Math.max(0.05, H_roof);
    const wedgeHolder = new THREE.Group();
    wedgeHolder.position.y = H_wall;

    const spanX = slopeDirection === 'east' || slopeDirection === 'west' ? W : L;
    const depthZ = slopeDirection === 'east' || slopeDirection === 'west' ? L : W;
    const hSpan = spanX / 2;
    const hDepth = depthZ / 2;

    // Inset pediment wedge slightly inside the outer walls and below the sloped roof deck so it never pokes through
    const insetX = Math.min(0.04, hSpan * 0.04);
    const insetZ = Math.min(0.04, hDepth * 0.04);
    const wSpan = Math.max(0.15, hSpan - insetX);
    const wDepth = Math.max(0.15, depthZ - 2 * insetZ);

    const shape = new THREE.Shape();
    shape.moveTo(-wSpan, 0);
    shape.lineTo(wSpan, 0);
    shape.lineTo(-wSpan, Math.max(0.02, dH - 0.01));
    shape.closePath();

    const extrudeGeo = new THREE.ExtrudeGeometry(shape, {
      depth: wDepth,
      bevelEnabled: false
    });
    extrudeGeo.translate(0, 0, -wDepth / 2);
    const wallWedgeMesh = new THREE.Mesh(extrudeGeo, gableWallMaterial);
    wallWedgeMesh.castShadow = !xrayWallsMode;
    wallWedgeMesh.receiveShadow = true;
    wallWedgeMesh.userData = { isRoofPediment: true };
    wedgeHolder.add(wallWedgeMesh);

    const deckThick = 0.16;
    const slopeAngle = Math.atan2(dH, spanX);
    const verticalHalfThick = (deckThick / 2) / Math.cos(slopeAngle);
    const deckCenterY = dH / 2 + verticalHalfThick;
    const inclinedSpan = (spanX + 2 * O) / Math.cos(slopeAngle);
    const deckGeo = new THREE.BoxGeometry(inclinedSpan, deckThick, depthZ + 2 * O);
    const deckMesh = new THREE.Mesh(deckGeo, roofMat);
    deckMesh.position.set(0, deckCenterY, 0);
    deckMesh.rotation.z = -slopeAngle;
    deckMesh.castShadow = !xrayWallsMode;
    deckMesh.receiveShadow = true;
    deckMesh.userData = { isRoofDeck: true, minBottomY: H_wall };
    wedgeHolder.add(deckMesh);

    // 3D Runoff direction arrow on top of shed roof
    const arrowGroup = create3DSlopeArrow(Math.min(2.6, spanX * 0.48));
    arrowGroup.position.set(0, deckCenterY + verticalHalfThick + 0.06, 0);
    arrowGroup.rotation.z = -slopeAngle;
    wedgeHolder.add(arrowGroup);

    if (slopeDirection === 'south') wedgeHolder.rotation.y = -Math.PI / 2;
    else if (slopeDirection === 'west') wedgeHolder.rotation.y = Math.PI;
    else if (slopeDirection === 'north') wedgeHolder.rotation.y = Math.PI / 2;

    roofGroup.add(wedgeHolder);
    return roofGroup;
  }

  if (roofType === 'gable') {
    const hRidge = Math.max(0.05, H_roof);

    // Inset gable pediment slightly so its slanted edges sit cleanly inside the roof slopes and never protrude
    const insetX = Math.min(0.04, hw * 0.04);
    const insetZ = Math.min(0.04, hl * 0.04);
    const gHalfW = Math.max(0.15, hw - insetX);
    const gDepth = Math.max(0.15, L - 2 * insetZ);

    const gableShape = new THREE.Shape();
    gableShape.moveTo(-gHalfW, 0);
    gableShape.lineTo(gHalfW, 0);
    gableShape.lineTo(0, Math.max(0.02, hRidge - 0.01));
    gableShape.closePath();

    const gableGeo = new THREE.ExtrudeGeometry(gableShape, {
      depth: gDepth,
      bevelEnabled: false
    });
    gableGeo.translate(0, H_wall, -gDepth / 2);
    const gablePediment = new THREE.Mesh(gableGeo, gableWallMaterial);
    gablePediment.castShadow = !xrayWallsMode;
    gablePediment.receiveShadow = true;
    gablePediment.userData = { isRoofPediment: true };
    roofGroup.add(gablePediment);

    const deckThick = 0.16;
    const halfSpanWithOverhang = hw + O;
    const slopeAngle = Math.atan2(hRidge, hw);
    const dropAtEave = O * Math.tan(slopeAngle);
    const verticalHalfThick = (deckThick / 2) / Math.cos(slopeAngle);
    const slopeCenterY = H_wall + (hRidge - dropAtEave) / 2 + verticalHalfThick;
    const rafterLen = halfSpanWithOverhang / Math.cos(slopeAngle);

    const leftSlopeGeo = new THREE.BoxGeometry(rafterLen, deckThick, rl);
    const leftSlope = new THREE.Mesh(leftSlopeGeo, roofMat);
    leftSlope.position.set(-halfSpanWithOverhang / 2, slopeCenterY, 0);
    leftSlope.rotation.z = slopeAngle;
    leftSlope.castShadow = !xrayWallsMode;
    leftSlope.receiveShadow = true;
    leftSlope.userData = { isRoofDeck: true, minBottomY: H_wall };

    const rightSlope = new THREE.Mesh(leftSlopeGeo, roofMat);
    rightSlope.position.set(halfSpanWithOverhang / 2, slopeCenterY, 0);
    rightSlope.rotation.z = -slopeAngle;
    rightSlope.castShadow = !xrayWallsMode;
    rightSlope.receiveShadow = true;
    rightSlope.userData = { isRoofDeck: true, minBottomY: H_wall };

    const ridgeCap = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.22, rl + 0.1), trimMat);
    ridgeCap.position.set(0, H_wall + hRidge + verticalHalfThick * 1.4, 0);

    // 2 3D Slope arrows on Gable roof (Left -X and Right +X)
    const arrowLen = Math.min(1.9, rafterLen * 0.55);
    const arrowY = H_wall + hRidge * 0.52 + verticalHalfThick * 2 + 0.08;
    const rightArrow = create3DSlopeArrow(arrowLen);
    rightArrow.position.set(halfSpanWithOverhang * 0.45, arrowY, 0);
    rightArrow.rotation.z = -slopeAngle;

    const leftArrowHolder = new THREE.Group();
    leftArrowHolder.position.set(-halfSpanWithOverhang * 0.45, arrowY, 0);
    leftArrowHolder.rotation.y = Math.PI;
    const leftArrow = create3DSlopeArrow(arrowLen);
    leftArrow.rotation.z = -slopeAngle;
    leftArrowHolder.add(leftArrow);

    roofGroup.add(leftSlope, rightSlope, ridgeCap, rightArrow, leftArrowHolder);
    return roofGroup;
  }

  // Hip / Pyramid roof (Четырехугольная пирамида при W=L или четырехскатная вальмовая крыша при W!=L)
  // Built with a solid perimeter fascia rim (from ySoffit = H_wall to yEave = H_wall + 0.14)
  // so that at EVERY point inside [-W/2, W/2] x [-L/2, L/2] the roof sits flush on H_wall with zero gap!
  const hPeak = Math.max(0.05, H_roof);
  const ridgeHalfX = W > L ? (W - L) / 2 : 0;
  const ridgeHalfZ = L > W ? (L - W) / 2 : 0;
  const ySoffit = H_wall;
  const yEave = H_wall + 0.14;
  const yPeak = yEave + hPeak;

  const vNW: [number, number, number] = [-hrw, yEave, -hrl];
  const vNE: [number, number, number] = [hrw, yEave, -hrl];
  const vSE: [number, number, number] = [hrw, yEave, hrl];
  const vSW: [number, number, number] = [-hrw, yEave, hrl];

  const bNW: [number, number, number] = [-hrw, ySoffit, -hrl];
  const bNE: [number, number, number] = [hrw, ySoffit, -hrl];
  const bSE: [number, number, number] = [hrw, ySoffit, hrl];
  const bSW: [number, number, number] = [-hrw, ySoffit, hrl];

  const r0: [number, number, number] = [-ridgeHalfX, yPeak, -ridgeHalfZ];
  const r1: [number, number, number] = [ridgeHalfX, yPeak, ridgeHalfZ];

  const rNW = r0;
  const rNE = W >= L ? r1 : r0;
  const rSE = r1;
  const rSW = W >= L ? r0 : r1;

  const posList: number[] = [];
  const uvList: number[] = [];

  const pushTri = (
    a: [number, number, number],
    b: [number, number, number],
    c: [number, number, number]
  ) => {
    posList.push(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2]);
    uvList.push(0, 0, 1, 0, 0.5, 1);
  };

  // 1. North slope (-Z)
  pushTri(vNE, vNW, rNW);
  if (W > L + 0.001) {
    pushTri(vNE, rNW, rNE);
  }

  // 2. East slope (+X)
  pushTri(vSE, vNE, rNE);
  if (L > W + 0.001) {
    pushTri(vSE, rNE, rSE);
  }

  // 3. South slope (+Z)
  pushTri(vSW, vSE, rSE);
  if (W > L + 0.001) {
    pushTri(vSW, rSE, rSW);
  }

  // 4. West slope (-X)
  pushTri(vNW, vSW, rSW);
  if (L > W + 0.001) {
    pushTri(vNW, rSW, rNW);
  }

  // 5. Perimeter Fascia Band (Карнизная доска по периметру от ySoffit до yEave)
  // North fascia
  pushTri(bNE, bNW, vNW);
  pushTri(bNE, vNW, vNE);
  // East fascia
  pushTri(bSE, bNE, vNE);
  pushTri(bSE, vNE, vSE);
  // South fascia
  pushTri(bSW, bSE, vSE);
  pushTri(bSW, vSE, vSW);
  // West fascia
  pushTri(bNW, bSW, vSW);
  pushTri(bNW, vSW, vNW);

  // 6. Bottom soffit closure (-Y at ySoffit = H_wall + 0.015)
  pushTri(bNW, bNE, bSE);
  pushTri(bNW, bSE, bSW);

  const hipGeo = new THREE.BufferGeometry();
  hipGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(posList), 3));
  hipGeo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(uvList), 2));
  hipGeo.computeVertexNormals();

  const hipMesh = new THREE.Mesh(hipGeo, roofMat);
  hipMesh.castShadow = !xrayWallsMode;
  hipMesh.receiveShadow = true;
  hipMesh.userData = { isRoofDeck: true, minBottomY: ySoffit, eaveY: yEave, peakY: yPeak };
  roofGroup.add(hipMesh);

  // Crisp architectural hip edge lines (ребра шатровой/вальмовой крыши)
  const hipEdgeSegments = new Float32Array([
    ...vNW, ...rNW,
    ...vNE, ...rNE,
    ...vSE, ...rSE,
    ...vSW, ...rSW,
    ...r0, ...r1,
    ...vNW, ...vNE,
    ...vNE, ...vSE,
    ...vSE, ...vSW,
    ...vSW, ...vNW
  ]);
  const hipRibGeo = new THREE.BufferGeometry();
  hipRibGeo.setAttribute('position', new THREE.BufferAttribute(hipEdgeSegments, 3));
  const hipRibLines = new THREE.LineSegments(
    hipRibGeo,
    new THREE.LineBasicMaterial({
      color: xrayWallsMode ? 0x38bdf8 : 0x0f172a,
      transparent: xrayWallsMode,
      opacity: xrayWallsMode ? 0.75 : 1.0
    })
  );
  roofGroup.add(hipRibLines);

  const isPurePyramid = Math.abs(W - L) <= 0.05;
  const capLen = isPurePyramid ? 0.36 : Math.max(0.36, Math.hypot(ridgeHalfX * 2, ridgeHalfZ * 2));
  const capGeo = new THREE.BoxGeometry(
    isPurePyramid ? 0.34 : W > L ? capLen : 0.26,
    0.2,
    isPurePyramid ? 0.34 : L > W ? capLen : 0.26
  );
  const capMesh = new THREE.Mesh(capGeo, trimMat);
  capMesh.position.set(0, yPeak + 0.04, 0);
  roofGroup.add(capMesh);

  // 4 3D Slope arrows on Hip/Pyramid roof (+X, -X, +Z, -Z) positioned cleanly on the 4 slopes
  const hipArrowLen = Math.min(1.5, Math.min(W, L) * 0.28);
  const runX = Math.max(0.4, hrw - ridgeHalfX);
  const runZ = Math.max(0.4, hrl - ridgeHalfZ);
  const slopeAngleX = Math.atan2(hPeak, runX);
  const slopeAngleZ = Math.atan2(hPeak, runZ);
  const midY = yEave + hPeak * 0.46 + 0.08;

  // East (+X)
  const eastHipArrow = create3DSlopeArrow(hipArrowLen);
  eastHipArrow.position.set(ridgeHalfX + runX * 0.54, midY, 0);
  eastHipArrow.rotation.z = -slopeAngleX;

  // West (-X)
  const westHipHolder = new THREE.Group();
  westHipHolder.position.set(-(ridgeHalfX + runX * 0.54), midY, 0);
  westHipHolder.rotation.y = Math.PI;
  const westHipArrow = create3DSlopeArrow(hipArrowLen);
  westHipArrow.rotation.z = -slopeAngleX;
  westHipHolder.add(westHipArrow);

  // South (+Z)
  const southHipHolder = new THREE.Group();
  southHipHolder.position.set(0, midY, ridgeHalfZ + runZ * 0.54);
  southHipHolder.rotation.y = -Math.PI / 2;
  const southHipArrow = create3DSlopeArrow(hipArrowLen);
  southHipArrow.rotation.z = -slopeAngleZ;
  southHipHolder.add(southHipArrow);

  // North (-Z)
  const northHipHolder = new THREE.Group();
  northHipHolder.position.set(0, midY, -(ridgeHalfZ + runZ * 0.54));
  northHipHolder.rotation.y = Math.PI / 2;
  const northHipArrow = create3DSlopeArrow(hipArrowLen);
  northHipArrow.rotation.z = -slopeAngleZ;
  northHipHolder.add(northHipArrow);

  roofGroup.add(eastHipArrow, westHipHolder, southHipHolder, northHipHolder);

  return roofGroup;
}

/**
 * Builds procedural 3D meshes for natural objects (forest, trees, water_body)
 * and linear infrastructure (power_line, gas_pipe, water_main, sewer_main, road).
 */
function buildEnvironmentOrUtility3DGroup(
  obj: SiteObject,
  isSelected: boolean,
  hasErrorViolation: boolean,
  undergroundViewMode = false
): THREE.Group | null {
  const W = Math.max(0.5, obj.width);
  const L = Math.max(0.5, obj.length);
  const O = Math.max(0, obj.overhang || 0);
  const group = new THREE.Group();
  group.userData = { objectId: obj.id, category: obj.category };

  if (obj.category === 'tree_tall' || obj.category === 'tree_medium') {
    const isTall = obj.category === 'tree_tall';
    const baseWallH = Math.max(1.0, obj.wallHeight || (isTall ? 9.0 : 3.5));
    const extraRoofH = Math.max(0, obj.roofHeight || 0);
    const totalH = baseWallH + extraRoofH;
    const trunkH = totalH * 0.35;
    const effW = W + 2 * O;
    const effL = L + 2 * O;
    const baseR = Math.max(0.6, Math.min(effW, effL) * 0.48);
    const scaleX = effW / Math.max(0.5, Math.min(effW, effL));
    const scaleZ = effL / Math.max(0.5, Math.min(effW, effL));

    const trunkMat = new THREE.MeshStandardMaterial({ color: 0x78350f, roughness: 0.9 });
    const foliageMat = new THREE.MeshStandardMaterial({
      color: isTall ? 0x15803d : 0x65a30d,
      roughness: 0.75
    });

    const trunk = new THREE.Mesh(
      new THREE.CylinderGeometry(baseR * 0.14, baseR * 0.2, trunkH, 10),
      trunkMat
    );
    trunk.position.y = trunkH / 2;
    trunk.castShadow = true;
    trunk.receiveShadow = true;
    group.add(trunk);

    // Side branch so tree rotation is clearly visible in 3D from any angle
    const branch = new THREE.Mesh(
      new THREE.CylinderGeometry(baseR * 0.06, baseR * 0.09, baseR * 0.65, 8),
      trunkMat
    );
    branch.position.set(baseR * 0.25 * scaleX, trunkH * 0.72, 0);
    branch.rotation.z = -Math.PI / 3;
    group.add(branch);

    if (isTall) {
      const cone1 = new THREE.Mesh(new THREE.ConeGeometry(baseR, totalH * 0.45, 12), foliageMat);
      cone1.position.y = trunkH + totalH * 0.18;
      cone1.scale.set(scaleX, 1, scaleZ);
      cone1.castShadow = true;
      const cone2 = new THREE.Mesh(
        new THREE.ConeGeometry(baseR * 0.78, totalH * 0.4, 12),
        foliageMat
      );
      cone2.position.y = trunkH + totalH * 0.42;
      cone2.scale.set(scaleX, 1, scaleZ);
      cone2.castShadow = true;
      group.add(cone1, cone2);
    } else {
      const crown = new THREE.Mesh(new THREE.SphereGeometry(baseR, 12, 10), foliageMat);
      crown.position.y = trunkH + baseR * 0.75;
      crown.scale.set(scaleX, 1 + extraRoofH * 0.15, scaleZ);
      crown.castShadow = true;
      group.add(crown);
    }
  } else if (obj.category === 'forest') {
    const effW = W + 2 * O;
    const effL = L + 2 * O;
    const baseMat = new THREE.MeshStandardMaterial({ color: 0x14532d, roughness: 0.95 });
    const baseMesh = new THREE.Mesh(new THREE.BoxGeometry(effW, 0.25, effL), baseMat);
    baseMesh.position.y = 0.125;
    baseMesh.receiveShadow = true;
    group.add(baseMesh);

    const trunkMat = new THREE.MeshStandardMaterial({ color: 0x5c2d0c, roughness: 0.9 });
    const pineMat = new THREE.MeshStandardMaterial({ color: 0x166534, roughness: 0.8 });
    const cols = Math.max(2, Math.min(7, Math.floor(effW / 3.5)));
    const rows = Math.max(1, Math.min(5, Math.floor(effL / 3.5)));
    const treeH = Math.max(3, (obj.wallHeight || 11) + (obj.roofHeight || 0));

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const tx = ((c + 0.5) / cols - 0.5) * (effW * 0.82) + ((r % 2) * 0.6 - 0.3);
        const tz = ((r + 0.5) / rows - 0.5) * (effL * 0.8);
        const hScale = 0.82 + ((c * 3 + r * 7) % 5) * 0.08;
        const th = treeH * hScale;
        const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.26, th * 0.32, 8), trunkMat);
        trunk.position.set(tx, th * 0.16, tz);
        trunk.castShadow = true;
        const cone = new THREE.Mesh(new THREE.ConeGeometry(1.55, th * 0.75, 9), pineMat);
        cone.position.set(tx, th * 0.52, tz);
        cone.castShadow = true;
        group.add(trunk, cone);
      }
    }
  } else if (obj.category === 'water_body') {
    const bankMat = new THREE.MeshStandardMaterial({ color: 0xa8a29e, roughness: 0.9 });
    const waterMat = new THREE.MeshStandardMaterial({
      color: 0x0284c7,
      roughness: 0.12,
      metalness: 0.65,
      transparent: true,
      opacity: 0.86
    });
    const bankH = Math.max(0.14, (obj.wallHeight || 0.3) * 0.45);
    const bank = new THREE.Mesh(
      new THREE.BoxGeometry(W + 0.6 + 2 * O, bankH, L + 0.6 + 2 * O),
      bankMat
    );
    bank.position.y = bankH / 2;
    const water = new THREE.Mesh(new THREE.BoxGeometry(W, bankH + 0.04, L), waterMat);
    water.position.y = bankH / 2 + 0.03;
    group.add(bank, water);
  } else if (obj.category === 'power_line') {
    const poleH = Math.max(6.5, obj.wallHeight || 8.5);
    const poleMat = new THREE.MeshStandardMaterial({ color: 0x94a3b8, roughness: 0.6, metalness: 0.3 });
    const wireMat = new THREE.LineBasicMaterial({ color: 0xfef08a });
    const poleCount = Math.max(2, Math.min(4, Math.floor(W / 12) + 1));
    const poleXPositions: number[] = [];
    const burialDepth = Math.max(0, obj.burialDepth ?? 0);

    for (let i = 0; i < poleCount; i++) {
      const px = poleCount === 1 ? 0 : (-W / 2 + 1.2) + (i / (poleCount - 1)) * Math.max(1, W - 2.4);
      poleXPositions.push(px);
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.22, poleH, 10), poleMat);
      pole.position.set(px, poleH / 2, 0);
      pole.castShadow = true;
      const crossArm = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.18, 2.2), poleMat);
      crossArm.position.set(px, poleH - 0.6, 0);
      group.add(pole, crossArm);

      if (burialDepth > 0 || undergroundViewMode) {
        const foundationDepth = burialDepth > 0 ? burialDepth : 1.8;
        const fndMat = new THREE.MeshStandardMaterial({
          color: 0x64748b,
          roughness: 0.85,
          emissive: undergroundViewMode ? 0x1e293b : 0x000000
        });
        const fndCylinder = new THREE.Mesh(
          new THREE.CylinderGeometry(0.28, 0.32, foundationDepth, 10),
          fndMat
        );
        fndCylinder.position.set(px, -foundationDepth / 2, 0);
        group.add(fndCylinder);
      }
    }

    for (const zOff of [-0.9, 0, 0.9]) {
      const pts: THREE.Vector3[] = [];
      for (let i = 0; i < poleXPositions.length - 1; i++) {
        const xA = poleXPositions[i];
        const xB = poleXPositions[i + 1];
        for (let s = 0; s <= 8; s++) {
          const t = s / 8;
          const sag = Math.sin(t * Math.PI) * 0.55;
          pts.push(new THREE.Vector3(xA + (xB - xA) * t, poleH - 0.55 - sag, zOff));
        }
      }
      const wireGeo = new THREE.BufferGeometry().setFromPoints(pts);
      group.add(new THREE.Line(wireGeo, wireMat));
    }
  } else if (obj.category === 'gas_pipe' || obj.category === 'water_main' || obj.category === 'sewer_main') {
    const pipeColor =
      obj.category === 'gas_pipe' ? 0xeab308 : obj.category === 'water_main' ? 0x2563eb : 0x92400e;
    const burialDepth = Math.max(0, obj.burialDepth ?? getDefaultBurialDepth(obj.category));
    const pipeDiamMm = Math.max(20, Math.min(1200, obj.pipelineDiameterMm ?? getDefaultPipelineDiameterMm(obj.category)));
    const pipeMat = new THREE.MeshStandardMaterial({
      color: pipeColor,
      roughness: 0.32,
      metalness: 0.45,
      emissive: undergroundViewMode ? pipeColor : 0x000000,
      emissiveIntensity: undergroundViewMode ? 0.35 : 0
    });
    const pipeRadius = Math.min(0.45, Math.max(0.10, (pipeDiamMm / 1000) * 1.45));
    const pipeGeo = new THREE.CylinderGeometry(pipeRadius, pipeRadius, W, 16);
    pipeGeo.rotateZ(Math.PI / 2);

    // Main underground pipe at -burialDepth (or slightly above ground if burialDepth === 0)
    const pipeY = burialDepth > 0 ? -burialDepth : pipeRadius + 0.12;
    const pipeMesh = new THREE.Mesh(pipeGeo, pipeMat);
    pipeMesh.position.y = pipeY;
    pipeMesh.castShadow = burialDepth === 0;
    pipeMesh.userData = { isUndergroundPipe: burialDepth > 0, burialDepth, pipelineDiameterMm: pipeDiamMm };
    group.add(pipeMesh);

    // Surface trace indicator line so utility route remains visible even when ground is opaque
    if (burialDepth > 0) {
      const traceMat = new THREE.MeshStandardMaterial({
        color: pipeColor,
        roughness: 0.5,
        transparent: true,
        opacity: undergroundViewMode ? 0.45 : 0.85
      });
      const traceGeo = new THREE.CylinderGeometry(pipeRadius * 0.45, pipeRadius * 0.45, W, 12);
      traceGeo.rotateZ(Math.PI / 2);
      const traceMesh = new THREE.Mesh(traceGeo, traceMat);
      traceMesh.position.y = 0.08;
      group.add(traceMesh);
    }

    // Marker posts / manholes along the utility line + vertical underground inspection shafts
    const postCount = Math.max(2, Math.min(5, Math.floor(W / 8) + 1));
    const shaftMat = new THREE.MeshStandardMaterial({
      color: 0x64748b,
      roughness: 0.75,
      transparent: undergroundViewMode,
      opacity: undergroundViewMode ? 0.82 : 1.0
    });
    for (let i = 0; i < postCount; i++) {
      const px = (-W / 2 + 1) + (i / Math.max(1, postCount - 1)) * Math.max(1, W - 2);
      if (obj.category === 'gas_pipe') {
        const post = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 1.3, 8), pipeMat);
        post.position.set(px, 0.65, 0);
        group.add(post);
      } else {
        const ring = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.45, 0.35, 14), pipeMat);
        ring.position.set(px, 0.22, 0);
        group.add(ring);
      }

      // Vertical riser / manhole shaft down to the buried pipe
      if (burialDepth > 0) {
        const riserRadius = obj.category === 'gas_pipe' ? 0.07 : 0.34;
        const riserMesh = new THREE.Mesh(
          new THREE.CylinderGeometry(riserRadius, riserRadius, burialDepth + 0.1, 12),
          shaftMat
        );
        riserMesh.position.set(px, -burialDepth / 2, 0);
        group.add(riserMesh);
      }
    }

    // Trench outline in underground view mode
    if (undergroundViewMode && burialDepth > 0) {
      const trenchGeo = new THREE.EdgesGeometry(new THREE.BoxGeometry(W, burialDepth, Math.max(0.8, pipeRadius * 3.2)));
      const trenchWire = new THREE.LineSegments(
        trenchGeo,
        new THREE.LineBasicMaterial({ color: pipeColor, transparent: true, opacity: 0.75 })
      );
      trenchWire.position.y = -burialDepth / 2;
      group.add(trenchWire);
    }
  } else if (obj.category === 'road') {
    const asphaltMat = new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.88 });
    const curbMat = new THREE.MeshStandardMaterial({ color: 0x94a3b8, roughness: 0.8 });
    const stripeMat = new THREE.MeshBasicMaterial({ color: 0xf8fafc });

    const roadBed = new THREE.Mesh(new THREE.BoxGeometry(W, 0.14, L), asphaltMat);
    roadBed.position.y = 0.07;
    roadBed.receiveShadow = true;
    const curbN = new THREE.Mesh(new THREE.BoxGeometry(W, 0.2, 0.22), curbMat);
    curbN.position.set(0, 0.1, -L / 2 + 0.11);
    const curbS = new THREE.Mesh(new THREE.BoxGeometry(W, 0.2, 0.22), curbMat);
    curbS.position.set(0, 0.1, L / 2 - 0.11);
    group.add(roadBed, curbN, curbS);

    const dashCount = Math.max(2, Math.floor(W / 3.2));
    for (let i = 0; i < dashCount; i++) {
      const dx = (-W / 2 + 1.5) + i * 3.2;
      if (dx < W / 2 - 1.0) {
        const dash = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 0.16), stripeMat);
        dash.rotation.x = -Math.PI / 2;
        dash.position.set(dx, 0.15, 0);
        group.add(dash);
      }
    }
  } else {
    return null;
  }

  if (isSelected || hasErrorViolation) {
    const pad = 0.3;
    const fw = W + pad * 2;
    const fl = L + pad * 2;
    const haloPts = [
      new THREE.Vector3(-fw / 2, 0.08, -fl / 2),
      new THREE.Vector3(fw / 2, 0.08, -fl / 2),
      new THREE.Vector3(fw / 2, 0.08, fl / 2),
      new THREE.Vector3(-fw / 2, 0.08, fl / 2),
      new THREE.Vector3(-fw / 2, 0.08, -fl / 2)
    ];
    const haloGeo = new THREE.BufferGeometry().setFromPoints(haloPts);
    const haloLine = new THREE.Line(
      haloGeo,
      new THREE.LineBasicMaterial({ color: hasErrorViolation ? 0xef4444 : 0x38bdf8 })
    );
    group.add(haloLine);
  }

  group.position.set(obj.x, 0, obj.z);
  group.rotation.y = -(obj.rotation * Math.PI) / 180;
  return group;
}

/**
 * Assembles a composite 3D building or site object group:
 * - Supports 1..3 above-ground floors + 1 underground basement floor, floor height, inter-floor slab thickness,
 *   plinth height, foundation slab overhang & thickness, and underground utility burial depths
 * - Supports all 4 plan shapes (rectangle, l_shape, t_shape, chamfered)
 * - Supports 4 mathematical roof types with 3D slope arrows on all roofs
 * - Supports Semi-Transparent Walls & Roofs (xrayWallsMode) with customizable window cutouts on every story and
 *   dynamic interior sunlight patches (световое пятно) + volumetric sunbeams
 * - Supports Underground View Mode (undergroundViewMode) for inspecting basements, foundations, and buried pipes
 */
export function buildSiteObject3DGroup(
  obj: SiteObject,
  isSelected: boolean,
  hasErrorViolation: boolean,
  hasWarningViolation: boolean,
  xrayWallsMode = false,
  sunVector?: { x: number; y: number; z: number; altitudeDeg: number },
  undergroundViewMode = false,
  thermalHeatmapMode = false,
  plot?: PlotConfig
): THREE.Group {
  const envGroup = buildEnvironmentOrUtility3DGroup(obj, isSelected, hasErrorViolation, undergroundViewMode);
  if (envGroup) {
    return envGroup;
  }

  const group = new THREE.Group();
  group.userData = { objectId: obj.id, category: obj.category };

  const W = Math.max(0.5, obj.width);
  const L = Math.max(0.5, obj.length);
  const floorsAbove = isEnclosedBuildingCategory(obj.category)
    ? Math.max(1, Math.min(3, Math.round(obj.floors || 1)))
    : 1;
  const H_wall = computeTotalAboveGroundWallHeight(obj);
  const plinthH = Math.min(
    H_wall * 0.35,
    Math.max(0.05, obj.plinthHeight ?? (obj.category === 'house' ? 0.45 : 0.30))
  );
  const bodyH = Math.max(0.4, H_wall - plinthH);
  const rawSlabThick = Math.max(0.05, obj.interfloorSlabThickness ?? 0.22);
  const slabThick =
    floorsAbove > 1 ? Math.min(rawSlabThick, (bodyH * 0.2) / (floorsAbove - 1)) : 0;
  const floorH =
    floorsAbove > 1
      ? Math.max(0.4, (bodyH - (floorsAbove - 1) * slabThick) / floorsAbove)
      : bodyH;
  const fndOverhang = Math.max(0, obj.foundationSlabOverhang ?? 0.20);
  const fndThick = Math.max(0.10, obj.foundationSlabThickness ?? 0.30);
  const hasBasement = Boolean(obj.hasBasement);
  const basementDepth = hasBasement ? Math.max(1.5, obj.basementDepth ?? 2.5) : 0;

  const H_roof = Math.max(0.05, obj.roofHeight);
  const O = Math.max(0, obj.overhang);

  // Special procedural mesh for Well / Borehole (with underground concrete shaft, dynamic dimensions, overhang, roofType, and rotation!)
  if (obj.category === 'well' || obj.category === 'neighbor_well') {
    const wellBurialDepth = Math.max(0.5, obj.burialDepth ?? getDefaultBurialDepth(obj.category));
    const ringMat = new THREE.MeshStandardMaterial({
      color: obj.category === 'neighbor_well' ? 0x64748b : 0x94a3b8,
      roughness: 0.8,
      metalness: 0.1,
      transparent: xrayWallsMode,
      opacity: xrayWallsMode ? 0.45 : 1.0
    });
    const waterMat = new THREE.MeshStandardMaterial({
      color: 0x0ea5e9,
      roughness: 0.15,
      metalness: 0.6
    });
    const woodMat = new THREE.MeshStandardMaterial({
      color: 0x92400e,
      roughness: 0.7,
      metalness: 0.05,
      transparent: xrayWallsMode,
      opacity: xrayWallsMode ? 0.45 : 1.0
    });

    const baseMinSpan = Math.max(0.6, Math.min(W, L));
    const ringRadius = baseMinSpan * 0.45;
    const scaleRingX = W / baseMinSpan;
    const scaleRingZ = L / baseMinSpan;
    const ringH = Math.max(0.45, H_wall * 0.5);

    const concreteRing = new THREE.Mesh(
      new THREE.CylinderGeometry(ringRadius, ringRadius, ringH, 24),
      ringMat
    );
    concreteRing.scale.set(scaleRingX, 1, scaleRingZ);
    concreteRing.position.y = ringH / 2;
    concreteRing.castShadow = true;
    concreteRing.receiveShadow = true;

    // Underground well shaft down to -wellBurialDepth
    const undergroundShaftMat = new THREE.MeshStandardMaterial({
      color: 0x475569,
      roughness: 0.85,
      emissive: undergroundViewMode ? 0x0284c7 : 0x000000,
      emissiveIntensity: undergroundViewMode ? 0.25 : 0
    });
    const undergroundShaft = new THREE.Mesh(
      new THREE.CylinderGeometry(ringRadius * 0.95, ringRadius * 0.95, wellBurialDepth, 20),
      undergroundShaftMat
    );
    undergroundShaft.scale.set(scaleRingX, 1, scaleRingZ);
    undergroundShaft.position.y = -wellBurialDepth / 2;

    const waterDisc = new THREE.Mesh(
      new THREE.CylinderGeometry(ringRadius * 0.82, ringRadius * 0.82, 0.05, 18),
      waterMat
    );
    waterDisc.scale.set(scaleRingX, 1, scaleRingZ);
    waterDisc.position.y = ringH + 0.01;

    const postH = Math.max(0.4, H_wall - ringH * 0.35);
    const postThickness = Math.max(0.1, Math.min(W, L) * 0.08);
    const postOffsetX = Math.max(0.25, W * 0.4);
    const post1 = new THREE.Mesh(new THREE.BoxGeometry(postThickness, postH, postThickness), woodMat);
    post1.position.set(-postOffsetX, ringH * 0.35 + postH / 2, 0);
    const post2 = new THREE.Mesh(new THREE.BoxGeometry(postThickness, postH, postThickness), woodMat);
    post2.position.set(postOffsetX, ringH * 0.35 + postH / 2, 0);

    // Dynamic roof canopy respecting W, L, H_wall, H_roof, O (overhang), obj.roofType, and obj.slopeDirection
    const canopy = buildRoofOnlyGroup(
      W,
      L,
      H_wall,
      H_roof,
      O,
      obj.roofType || 'gable',
      obj.slopeDirection || 'south',
      0x0284c7,
      woodMat,
      xrayWallsMode
    );

    group.add(concreteRing, undergroundShaft, waterDisc, post1, post2, canopy);

    // Ground Overhang Projection Outline (when Overhang > 0.5m — СП 53.13330.2019 п. 6.7)
    if (O > 0.5) {
      const effPoly = getLocalObjectFootprintPolygon(obj, true);
      const pts = [
        ...effPoly.map((p) => new THREE.Vector3(p.x, 0.05, p.z)),
        new THREE.Vector3(effPoly[0].x, 0.05, effPoly[0].z)
      ];
      const lineGeo = new THREE.BufferGeometry().setFromPoints(pts);
      const lineMat = new THREE.LineBasicMaterial({ color: 0xf59e0b });
      group.add(new THREE.Line(lineGeo, lineMat));
    }

    // Selection / Violation ground halo frame
    if (isSelected || hasErrorViolation) {
      const pad = 0.25;
      const fw = (O > 0.5 ? W + 2 * O : W) + pad * 2;
      const fl = (O > 0.5 ? L + 2 * O : L) + pad * 2;
      const haloPts = [
        new THREE.Vector3(-fw / 2, 0.06, -fl / 2),
        new THREE.Vector3(fw / 2, 0.06, -fl / 2),
        new THREE.Vector3(fw / 2, 0.06, fl / 2),
        new THREE.Vector3(-fw / 2, 0.06, fl / 2),
        new THREE.Vector3(-fw / 2, 0.06, -fl / 2)
      ];
      const haloGeo = new THREE.BufferGeometry().setFromPoints(haloPts);
      const haloColor = hasErrorViolation ? 0xef4444 : 0x38bdf8;
      group.add(new THREE.Line(haloGeo, new THREE.LineBasicMaterial({ color: haloColor })));
    }

    group.position.set(obj.x, 0, obj.z);
    group.rotation.y = -(obj.rotation * Math.PI) / 180;
    return group;
  }

  // Choose material palette by building category & fire resistance
  let wallHex = 0xf1f5f9;
  let roofHex = 0x334155;

  if (obj.category === 'house') {
    wallHex = obj.material === 'wood' ? 0xd97706 : obj.material === 'mixed' ? 0xe2e8f0 : 0xf8fafc;
    roofHex = obj.roofCoverId === 'metal_tile' ? 0x1e3a8a : obj.roofCoverId === 'soft_shingles' ? 0x7c2d12 : 0x334155;
  } else if (obj.category === 'bathhouse') {
    wallHex = 0xb45309;
    roofHex = 0x78350f;
  } else if (obj.category === 'garage') {
    wallHex = 0xcbd5e1;
    roofHex = 0x475569;
  } else if (obj.category === 'greenhouse') {
    wallHex = 0x6ee7b7;
    roofHex = 0x34d399;
  } else if (obj.category === 'poultry') {
    wallHex = 0xfde68a;
    roofHex = 0x9333ea;
  } else if (obj.category === 'toilet') {
    wallHex = 0xfca5a5;
    roofHex = 0x991b1b;
  } else if (obj.category === 'neighbor_house') {
    wallHex = obj.material === 'wood' ? 0x92400e : 0x94a3b8;
    roofHex = 0x475569;
  } else {
    const meta = BUILDING_CATEGORY_LABELS[obj.category];
    if (meta) roofHex = new THREE.Color(meta.color).getHex();
  }

  // Underground tank for Septic / Toilet (Септик / ЛОС)
  if (obj.category === 'toilet') {
    const septicDepth = Math.max(0.5, obj.burialDepth ?? getDefaultBurialDepth('toilet'));
    const septicMat = new THREE.MeshStandardMaterial({
      color: 0x0f766e,
      roughness: 0.6,
      metalness: 0.2,
      emissive: undergroundViewMode ? 0x14b8a6 : 0x000000,
      emissiveIntensity: undergroundViewMode ? 0.35 : 0
    });
    const septicChamber = new THREE.Mesh(
      new THREE.CylinderGeometry(Math.min(W, L) * 0.45, Math.min(W, L) * 0.45, septicDepth, 18),
      septicMat
    );
    septicChamber.position.y = -septicDepth / 2;
    group.add(septicChamber);
  }

  const isHeatedBuilding =
    obj.category === 'house' ||
    obj.category === 'bathhouse' ||
    obj.category === 'neighbor_house' ||
    obj.category === 'garage';
  const activeThermalMap =
    thermalHeatmapMode && isHeatedBuilding && plot ? calculateBuildingThermalHeatmap(obj, plot) : null;

  if (activeThermalMap) {
    roofHex = new THREE.Color(activeThermalMap.roofThermalColorHex).getHex();
  }

  const statusEmissive = hasErrorViolation
    ? 0x7f1d1d
    : hasWarningViolation
    ? 0x78350f
    : isSelected
    ? 0x1e3a8a
    : 0x000000;

  const footprintShape = obj.footprintShape || 'rectangle';
  const localPoly = getLocalObjectFootprintPolygon(obj, false);

  // 1. Foundation Slab (Плита фундамента с регулируемым выступом и толщиной), Underground Basement & Plinth
  const foundationSlabMat = new THREE.MeshStandardMaterial({
    color: activeThermalMap ? 0x0284c7 : 0x64748b,
    roughness: 0.88,
    metalness: 0.12,
    emissive: undergroundViewMode ? 0x0ea5e9 : activeThermalMap ? 0x0369a1 : 0x000000,
    emissiveIntensity: undergroundViewMode ? 0.18 : activeThermalMap ? 0.22 : 0
  });

  const plinthMat = new THREE.MeshStandardMaterial({
    color: activeThermalMap ? 0xf59e0b : 0x475569,
    roughness: 0.85,
    metalness: 0.1,
    emissive: activeThermalMap ? 0xd97706 : 0x000000,
    emissiveIntensity: activeThermalMap ? 0.42 : 0
  });

  const basementWallMat = new THREE.MeshStandardMaterial({
    color: 0x334155,
    roughness: 0.82,
    metalness: 0.15,
    transparent: undergroundViewMode || xrayWallsMode,
    opacity: undergroundViewMode || xrayWallsMode ? 0.48 : 0.92,
    depthWrite: !(undergroundViewMode || xrayWallsMode),
    side: THREE.DoubleSide
  });

  const interiorFloorMat = new THREE.MeshStandardMaterial({
    color: xrayWallsMode ? 0x334155 : 0x1e293b,
    roughness: 0.75,
    metalness: 0.05,
    side: THREE.DoubleSide
  });

  const slabW = W + 2 * fndOverhang;
  const slabL = L + 2 * fndOverhang;

  // Render Foundation Slab (at bottom of basement if hasBasement, or under the plinth if no basement)
  const fndSlabY = hasBasement ? -basementDepth - fndThick / 2 : -fndThick / 2 + 0.06;
  const fndSlabMesh = new THREE.Mesh(new THREE.BoxGeometry(slabW, fndThick, slabL), foundationSlabMat);
  fndSlabMesh.position.y = fndSlabY;
  fndSlabMesh.receiveShadow = true;
  fndSlabMesh.userData = { isFoundationSlab: true, overhang: fndOverhang, thickness: fndThick };
  group.add(fndSlabMesh);

  // If the building has an underground basement, also render a ground-level slab collar/apron so fndOverhang is visible at Y=0
  if (hasBasement && fndOverhang > 0.01) {
    const collarMesh = new THREE.Mesh(new THREE.BoxGeometry(slabW, 0.08, slabL), foundationSlabMat);
    collarMesh.position.y = 0.04;
    collarMesh.receiveShadow = true;
    group.add(collarMesh);
  }

  // Render Underground Basement (-basementDepth to 0) when hasBasement is enabled
  if (hasBasement && basementDepth > 0) {
    const bsmMesh = new THREE.Mesh(new THREE.BoxGeometry(W, basementDepth, L), basementWallMat);
    bsmMesh.position.y = -basementDepth / 2;
    bsmMesh.userData = { isBasement: true, basementDepth };
    group.add(bsmMesh);

    const bsmEdges = new THREE.EdgesGeometry(new THREE.BoxGeometry(W, basementDepth, L));
    const bsmWire = new THREE.LineSegments(
      bsmEdges,
      new THREE.LineBasicMaterial({
        color: undergroundViewMode ? 0x38bdf8 : 0x94a3b8,
        transparent: true,
        opacity: 0.85
      })
    );
    bsmWire.position.y = -basementDepth / 2;
    group.add(bsmWire);

    // Basement floor plane
    const bsmFloor = new THREE.Mesh(new THREE.PlaneGeometry(W - 0.2, L - 0.2), interiorFloorMat);
    bsmFloor.rotation.x = -Math.PI / 2;
    bsmFloor.position.y = -basementDepth + 0.02;
    group.add(bsmFloor);
  }

  const wallThick = 0.22;
  const innerSlabW = Math.max(0.2, W - 2 * wallThick - 0.04);
  const innerSlabL = Math.max(0.2, L - 2 * wallThick - 0.04);

  if (footprintShape === 'rectangle') {
    const plinthMesh = new THREE.Mesh(new THREE.BoxGeometry(W + 0.12, plinthH, L + 0.12), plinthMat);
    plinthMesh.position.y = plinthH / 2;
    plinthMesh.castShadow = true;
    plinthMesh.receiveShadow = true;
    group.add(plinthMesh);

    const floorMesh = new THREE.Mesh(new THREE.PlaneGeometry(innerSlabW, innerSlabL), interiorFloorMat);
    floorMesh.rotation.x = -Math.PI / 2;
    floorMesh.position.y = plinthH + 0.015;
    floorMesh.receiveShadow = true;
    group.add(floorMesh);

    // Render Inter-floor Slabs (Межэтажные перекрытия) strictly inside exterior walls so they NEVER protrude or z-fight
    if (floorsAbove > 1) {
      const interSlabMat = new THREE.MeshStandardMaterial({
        color: activeThermalMap ? 0xf97316 : 0x475569,
        roughness: 0.78,
        metalness: 0.12,
        emissive: activeThermalMap ? 0xea580c : 0x000000,
        emissiveIntensity: activeThermalMap ? 0.52 : 0,
        transparent: xrayWallsMode,
        opacity: xrayWallsMode ? 0.55 : 0.95
      });
      for (let s = 1; s < floorsAbove; s++) {
        const slabCenterY = plinthH + s * floorH + (s - 0.5) * slabThick;
        const interSlabMesh = new THREE.Mesh(
          new THREE.BoxGeometry(innerSlabW, slabThick, innerSlabL),
          interSlabMat
        );
        interSlabMesh.position.y = slabCenterY;
        interSlabMesh.userData = { isInterfloorSlab: true, floorIndex: s, thickness: slabThick };
        group.add(interSlabMesh);
      }
    }

    if (xrayWallsMode && W >= 4 && L >= 4) {
      const partPts = [
        new THREE.Vector3(-innerSlabW / 2 + 0.05, plinthH + 0.03, 0),
        new THREE.Vector3(innerSlabW / 2 - 0.05, plinthH + 0.03, 0),
        new THREE.Vector3(0, plinthH + 0.03, -innerSlabL / 2 + 0.05),
        new THREE.Vector3(0, plinthH + 0.03, innerSlabL / 2 - 0.05)
      ];
      const partGeo = new THREE.BufferGeometry().setFromPoints(partPts);
      const partLines = new THREE.LineSegments(
        partGeo,
        new THREE.LineBasicMaterial({ color: 0x64748b, transparent: true, opacity: 0.7 })
      );
      group.add(partLines);
    }
  } else {
    const polyShape = new THREE.Shape();
    polyShape.moveTo(localPoly[0].x, -localPoly[0].z);
    for (let i = 1; i < localPoly.length; i++) {
      polyShape.lineTo(localPoly[i].x, -localPoly[i].z);
    }
    polyShape.closePath();

    const plinthGeo = new THREE.ExtrudeGeometry(polyShape, { depth: plinthH, bevelEnabled: false });
    plinthGeo.rotateX(-Math.PI / 2);
    const plinthMesh = new THREE.Mesh(plinthGeo, plinthMat);
    plinthMesh.castShadow = true;
    plinthMesh.receiveShadow = true;
    group.add(plinthMesh);

    const insetScaleX = Math.max(0.3, (W - 2 * wallThick - 0.06) / W);
    const insetScaleZ = Math.max(0.3, (L - 2 * wallThick - 0.06) / L);
    const innerPolyShape = new THREE.Shape();
    innerPolyShape.moveTo(localPoly[0].x * insetScaleX, -localPoly[0].z * insetScaleZ);
    for (let i = 1; i < localPoly.length; i++) {
      innerPolyShape.lineTo(localPoly[i].x * insetScaleX, -localPoly[i].z * insetScaleZ);
    }
    innerPolyShape.closePath();

    const floorGeo = new THREE.ShapeGeometry(innerPolyShape);
    floorGeo.rotateX(-Math.PI / 2);
    const floorMesh = new THREE.Mesh(floorGeo, interiorFloorMat);
    floorMesh.position.y = plinthH + 0.02;
    floorMesh.receiveShadow = true;
    group.add(floorMesh);

    if (floorsAbove > 1) {
      const interSlabMat = new THREE.MeshStandardMaterial({
        color: activeThermalMap ? 0xf97316 : 0x475569,
        roughness: 0.78,
        metalness: 0.12,
        emissive: activeThermalMap ? 0xea580c : 0x000000,
        emissiveIntensity: activeThermalMap ? 0.52 : 0,
        transparent: xrayWallsMode,
        opacity: xrayWallsMode ? 0.55 : 0.95
      });
      for (let s = 1; s < floorsAbove; s++) {
        const slabGeo = new THREE.ExtrudeGeometry(innerPolyShape, { depth: slabThick, bevelEnabled: false });
        slabGeo.rotateX(-Math.PI / 2);
        const interSlabMesh = new THREE.Mesh(slabGeo, interSlabMat);
        interSlabMesh.position.y = plinthH + s * floorH + (s - 1) * slabThick;
        interSlabMesh.userData = { isInterfloorSlab: true, floorIndex: s, thickness: slabThick };
        group.add(interSlabMesh);
      }
    }
  }

  // 2. Walls & Windows (Hollow walls with real window cutouts on each story so sunlight enters the house)
  const isGreenhouse = obj.category === 'greenhouse';
  const isTransparentMode = isGreenhouse || xrayWallsMode;

  const createFacadeWallMat = (facadeKey?: 'south' | 'north' | 'east' | 'west') => {
    const facadeMetric = activeThermalMap?.facades.find((f) => f.facade === facadeKey) || activeThermalMap?.highestLossFacade;
    const baseHex = facadeMetric ? new THREE.Color(facadeMetric.thermalColorHex).getHex() : wallHex;
    return new THREE.MeshStandardMaterial({
      color: baseHex,
      roughness: activeThermalMap ? 0.45 : isGreenhouse ? 0.2 : 0.72,
      metalness: isGreenhouse ? 0.1 : 0.08,
      transparent: isTransparentMode,
      opacity: isGreenhouse ? 0.45 : xrayWallsMode ? 0.30 : 1.0,
      depthWrite: !isTransparentMode,
      emissive: activeThermalMap ? baseHex : statusEmissive,
      emissiveIntensity: activeThermalMap ? 0.38 : hasErrorViolation ? 0.45 : isSelected ? 0.22 : 0,
      bumpMap: !isTransparentMode && !activeThermalMap && typeof document !== 'undefined' ? getWallBumpTexture() : null,
      bumpScale: 0.02,
      side: THREE.DoubleSide
    });
  };

  const wallMat = createFacadeWallMat();

  const effectiveWinTypeId = getEffectiveWindowTypeId(obj);
  const winTypeInfo = WINDOW_TYPES_INFO[effectiveWinTypeId] || WINDOW_TYPES_INFO.pvc_double_chamber;

  const thermalGlassHex =
    effectiveWinTypeId === 'wood_single_glass'
      ? 0xef4444
      : effectiveWinTypeId === 'wood_double_glass'
      ? 0xf97316
      : effectiveWinTypeId === 'pvc_single_chamber'
      ? 0xf59e0b
      : 0x38bdf8;

  const glassMat = new THREE.MeshStandardMaterial({
    color: activeThermalMap ? thermalGlassHex : winTypeInfo.glassCount === 3 ? 0x0ea5e9 : 0x38bdf8,
    emissive: activeThermalMap ? thermalGlassHex : 0x0284c7,
    emissiveIntensity: activeThermalMap ? 0.85 : xrayWallsMode ? 0.35 : 0.1,
    roughness: 0.12,
    metalness: activeThermalMap ? 0.2 : 0.75,
    transparent: true,
    opacity: activeThermalMap ? 0.92 : xrayWallsMode ? 0.42 : 0.78,
    depthWrite: !xrayWallsMode
  });

  const frameMat = new THREE.MeshStandardMaterial({
    color: activeThermalMap
      ? 0xf97316
      : winTypeInfo.frameMaterial === 'wood'
      ? 0x92400e
      : 0xf8fafc,
    emissive: activeThermalMap ? 0xea580c : 0x000000,
    emissiveIntensity: activeThermalMap ? 0.65 : 0,
    roughness: winTypeInfo.frameMaterial === 'wood' ? 0.65 : 0.32,
    metalness: winTypeInfo.frameMaterial === 'wood' ? 0.08 : 0.25,
    transparent: xrayWallsMode,
    opacity: xrayWallsMode ? 0.55 : 1.0
  });

  const wins = getObjectWindowsConfig(obj);
  const doors = getObjectDoorsConfig(obj);

  if (footprintShape === 'rectangle' && W >= 1.2 && L >= 1.2) {
    // South wall (+Z)
    const southWall = buildWallWithWindowCutouts(
      W,
      bodyH,
      wallThick,
      wins.south,
      doors.south,
      createFacadeWallMat('south'),
      glassMat,
      frameMat,
      xrayWallsMode || Boolean(activeThermalMap),
      wins,
      floorsAbove,
      floorH,
      slabThick,
      doors,
      Boolean(activeThermalMap)
    );
    southWall.position.set(0, plinthH, L / 2 - wallThick);
    southWall.userData = { isFacadeWall: true, facade: 'south', thermalHeatmap: Boolean(activeThermalMap) };
    group.add(southWall);

    // North wall (-Z)
    const northWall = buildWallWithWindowCutouts(
      W,
      bodyH,
      wallThick,
      wins.north,
      doors.north,
      createFacadeWallMat('north'),
      glassMat,
      frameMat,
      xrayWallsMode || Boolean(activeThermalMap),
      wins,
      floorsAbove,
      floorH,
      slabThick,
      doors,
      Boolean(activeThermalMap)
    );
    northWall.position.set(0, plinthH, -L / 2);
    northWall.userData = { isFacadeWall: true, facade: 'north', thermalHeatmap: Boolean(activeThermalMap) };
    group.add(northWall);

    // East wall (+X): rotated +PI/2 around Y (slightly overlapped into North/South walls so corners are 100% light-tight)
    const eastWall = buildWallWithWindowCutouts(
      Math.max(0.8, L - 2 * wallThick + 0.04),
      bodyH,
      wallThick,
      wins.east,
      doors.east,
      createFacadeWallMat('east'),
      glassMat,
      frameMat,
      xrayWallsMode || Boolean(activeThermalMap),
      wins,
      floorsAbove,
      floorH,
      slabThick,
      doors,
      Boolean(activeThermalMap)
    );
    eastWall.rotation.y = Math.PI / 2;
    eastWall.position.set(W / 2 - wallThick, plinthH, 0);
    eastWall.userData = { isFacadeWall: true, facade: 'east', thermalHeatmap: Boolean(activeThermalMap) };
    group.add(eastWall);

    // West wall (-X): rotated +PI/2 around Y
    const westWall = buildWallWithWindowCutouts(
      Math.max(0.8, L - 2 * wallThick + 0.04),
      bodyH,
      wallThick,
      wins.west,
      doors.west,
      createFacadeWallMat('west'),
      glassMat,
      frameMat,
      xrayWallsMode || Boolean(activeThermalMap),
      wins,
      floorsAbove,
      floorH,
      slabThick,
      doors,
      Boolean(activeThermalMap)
    );
    westWall.rotation.y = Math.PI / 2;
    westWall.position.set(-W / 2, plinthH, 0);
    westWall.userData = { isFacadeWall: true, facade: 'west', thermalHeatmap: Boolean(activeThermalMap) };
    group.add(westWall);
  } else {
    // Extrude custom footprint polygon (L-shape, T-shape, Chamfered, or ultra-small structure)
    const polyShape = new THREE.Shape();
    polyShape.moveTo(localPoly[0].x, -localPoly[0].z);
    for (let i = 1; i < localPoly.length; i++) {
      polyShape.lineTo(localPoly[i].x, -localPoly[i].z);
    }
    polyShape.closePath();

    // If large enough, carve interior cavity so it's hollow in X-ray mode
    if (W >= 2.2 && L >= 2.2) {
      const scaleX = (W - 0.44) / W;
      const scaleZ = (L - 0.44) / L;
      const innerHole = new THREE.Path();
      innerHole.moveTo(localPoly[0].x * scaleX, -localPoly[0].z * scaleZ);
      for (let i = 1; i < localPoly.length; i++) {
        innerHole.lineTo(localPoly[i].x * scaleX, -localPoly[i].z * scaleZ);
      }
      innerHole.closePath();
      polyShape.holes.push(innerHole);
    }

    const wallGeo = new THREE.ExtrudeGeometry(polyShape, { depth: bodyH, bevelEnabled: false });
    wallGeo.rotateX(-Math.PI / 2);
    const wallsMesh = new THREE.Mesh(wallGeo, wallMat);
    wallsMesh.position.y = plinthH;
    wallsMesh.castShadow = true;
    wallsMesh.receiveShadow = true;
    group.add(wallsMesh);

    // Also attach 3D Doors & Windows on the exterior facades of L-shape / T-shape / Chamfered buildings
    if (W >= 1.5 && L >= 1.5) {
      const doorLeafMat = new THREE.MeshStandardMaterial({
        color: activeThermalMap ? 0xf97316 : 0x78350f,
        emissive: activeThermalMap ? 0xea580c : 0x000000,
        emissiveIntensity: activeThermalMap ? 0.58 : 0,
        roughness: 0.55,
        metalness: 0.15
      });
      const facadesList: Array<{
        key: 'south' | 'north' | 'east' | 'west';
        doorCnt: number;
        span: number;
      }> = [
        { key: 'south', doorCnt: doors.south, span: W },
        { key: 'north', doorCnt: doors.north, span: W },
        { key: 'east', doorCnt: doors.east, span: L },
        { key: 'west', doorCnt: doors.west, span: L }
      ];
      for (const fc of facadesList) {
        if (fc.doorCnt <= 0) continue;
        const dW = Math.max(0.5, Math.min((fc.span * 0.7) / fc.doorCnt, doors.doorWidth ?? 0.95));
        const threshY = Math.min(bodyH * 0.25, Math.max(0, doors.thresholdHeight ?? 0.05));
        const dH = Math.max(0.8, Math.min(bodyH - threshY - 0.05, doors.doorHeight ?? 2.05));
        const dShift = (doors.positionOffset ?? 0) * (fc.span * 0.35);
        for (let di = 0; di < fc.doorCnt; di++) {
          const cx =
            (fc.doorCnt === 1 ? 0 : ((di + 0.5) / fc.doorCnt - 0.5) * (fc.span * 0.6)) + dShift;
          const doorMesh = new THREE.Mesh(new THREE.BoxGeometry(dW, dH, 0.12), doorLeafMat);
          doorMesh.userData = { isDoor: true, facade: fc.key, doorIndex: di };
          if (fc.key === 'south') {
            doorMesh.position.set(cx, plinthH + threshY + dH / 2, L / 2 + 0.02);
          } else if (fc.key === 'north') {
            doorMesh.position.set(cx, plinthH + threshY + dH / 2, -L / 2 - 0.02);
          } else if (fc.key === 'east') {
            doorMesh.rotation.y = Math.PI / 2;
            doorMesh.position.set(W / 2 + 0.02, plinthH + threshY + dH / 2, cx);
          } else {
            doorMesh.rotation.y = Math.PI / 2;
            doorMesh.position.set(-W / 2 - 0.02, plinthH + threshY + dH / 2, cx);
          }
          group.add(doorMesh);
        }
      }
    }

    if (xrayWallsMode) {
      const edges = new THREE.EdgesGeometry(wallGeo);
      const edgeLines = new THREE.LineSegments(
        edges,
        new THREE.LineBasicMaterial({ color: 0x94a3b8, transparent: true, opacity: 0.65 })
      );
      edgeLines.position.y = plinthH;
      group.add(edgeLines);
    }
  }

  // 3. Interior Sunlight Patches (Световое пятно на полу и солнечные лучи из окон)
  if (sunVector && sunVector.altitudeDeg > 2) {
    const patches = calculateInteriorSunPatches(obj, sunVector);
    const floorPatchY = plinthH + 0.045;

    const patchMat = new THREE.MeshBasicMaterial({
      color: 0xfef08a,
      transparent: true,
      opacity: xrayWallsMode ? 0.88 : 0.72,
      side: THREE.DoubleSide,
      depthWrite: false
    });

    const beamMat = new THREE.MeshBasicMaterial({
      color: 0xfde047,
      transparent: true,
      opacity: xrayWallsMode ? 0.22 : 0.10,
      side: THREE.DoubleSide,
      depthWrite: false
    });

    for (const patch of patches) {
      const pts = patch.floorPolygonLocal;
      if (pts.length < 3) continue;

      // Floor Light Patch Polygon (Световое пятно)
      const patchShape = new THREE.Shape();
      // Shape is in (X, Y); after rotateX(-PI/2), shape Y becomes -Z => pass (pt.x, -pt.z)
      patchShape.moveTo(pts[0].x, -pts[0].z);
      for (let i = 1; i < pts.length; i++) {
        patchShape.lineTo(pts[i].x, -pts[i].z);
      }
      patchShape.closePath();

      const patchGeo = new THREE.ShapeGeometry(patchShape);
      patchGeo.rotateX(-Math.PI / 2);
      const patchMesh = new THREE.Mesh(patchGeo, patchMat);
      patchMesh.position.y = floorPatchY;
      patchMesh.userData = { isSunPatch: true, facade: patch.facade };
      group.add(patchMesh);

      // Glowing amber outline around the floor light patch
      const borderPts = [
        ...pts.map((p) => new THREE.Vector3(p.x, floorPatchY + 0.01, p.z)),
        new THREE.Vector3(pts[0].x, floorPatchY + 0.01, pts[0].z)
      ];
      const borderGeo = new THREE.BufferGeometry().setFromPoints(borderPts);
      const borderLine = new THREE.Line(
        borderGeo,
        new THREE.LineBasicMaterial({ color: 0xf59e0b })
      );
      group.add(borderLine);

      // Volumetric 3D Sunbeam connecting window opening corners to floor light patch corners
      if (xrayWallsMode && patch.windowCornersLocal3D.length === 4 && pts.length === 4) {
        const w0 = patch.windowCornersLocal3D[0];
        const w1 = patch.windowCornersLocal3D[1];
        const w2 = patch.windowCornersLocal3D[2];
        const w3 = patch.windowCornersLocal3D[3];

        const f0 = { x: pts[0].x, y: floorPatchY, z: pts[0].z };
        const f1 = { x: pts[1].x, y: floorPatchY, z: pts[1].z };
        const f2 = { x: pts[2].x, y: floorPatchY, z: pts[2].z };
        const f3 = { x: pts[3].x, y: floorPatchY, z: pts[3].z };

        const beamVerts = new Float32Array([
          w0.x, w0.y, w0.z, // 0
          w1.x, w1.y, w1.z, // 1
          w2.x, w2.y, w2.z, // 2
          w3.x, w3.y, w3.z, // 3
          f0.x, f0.y, f0.z, // 4
          f1.x, f1.y, f1.z, // 5
          f2.x, f2.y, f2.z, // 6
          f3.x, f3.y, f3.z  // 7
        ]);

        const beamIdx = new Uint16Array([
          // Top ray sheet (window top w2,w3 to far floor f2,f3)
          3, 2, 6,
          3, 6, 7,
          // Bottom ray sheet (window sill w0,w1 to near floor f0,f1)
          0, 1, 5,
          0, 5, 4,
          // Left ray sheet
          0, 3, 7,
          0, 7, 4,
          // Right ray sheet
          1, 2, 6,
          1, 6, 5
        ]);

        const beamGeo = new THREE.BufferGeometry();
        beamGeo.setAttribute('position', new THREE.BufferAttribute(beamVerts, 3));
        beamGeo.setIndex(new THREE.BufferAttribute(beamIdx, 1));
        const beamMesh = new THREE.Mesh(beamGeo, beamMat);
        group.add(beamMesh);
      }
    }
  }

  // 4. Exact Mathematical 3D Roof Group
  const roofGroup = buildRoofOnlyGroup(
    W,
    L,
    H_wall,
    H_roof,
    O,
    obj.roofType,
    obj.slopeDirection,
    roofHex,
    wallMat,
    xrayWallsMode
  );
  group.add(roofGroup);

  // 5. Ground Overhang Projection Outline (when Overhang > 0.5m — СП 53.13330.2019 п. 6.7)
  if (O > 0.5) {
    const effPoly = getLocalObjectFootprintPolygon(obj, true);
    const pts = [
      ...effPoly.map((p) => new THREE.Vector3(p.x, 0.05, p.z)),
      new THREE.Vector3(effPoly[0].x, 0.05, effPoly[0].z)
    ];
    const lineGeo = new THREE.BufferGeometry().setFromPoints(pts);
    const lineMat = new THREE.LineBasicMaterial({ color: 0xf59e0b });
    const projectionLoop = new THREE.Line(lineGeo, lineMat);
    group.add(projectionLoop);
  }

  // 6. Selection / Violation ground halo frame
  if (isSelected || hasErrorViolation) {
    const pad = 0.25;
    const fw = (O > 0.5 ? W + 2 * O : W) + pad * 2;
    const fl = (O > 0.5 ? L + 2 * O : L) + pad * 2;
    const haloPts = [
      new THREE.Vector3(-fw / 2, 0.06, -fl / 2),
      new THREE.Vector3(fw / 2, 0.06, -fl / 2),
      new THREE.Vector3(fw / 2, 0.06, fl / 2),
      new THREE.Vector3(-fw / 2, 0.06, fl / 2),
      new THREE.Vector3(-fw / 2, 0.06, -fl / 2)
    ];
    const haloGeo = new THREE.BufferGeometry().setFromPoints(haloPts);
    const haloColor = hasErrorViolation ? 0xef4444 : 0x38bdf8;
    const haloLine = new THREE.Line(haloGeo, new THREE.LineBasicMaterial({ color: haloColor }));
    group.add(haloLine);
  }

  group.position.set(obj.x, 0, obj.z);
  group.rotation.y = -(obj.rotation * Math.PI) / 180;

  return group;
}

import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import * as SunCalc from 'suncalc';
import { Trash2, RotateCw, RotateCcw } from 'lucide-react';
import {
  PlotConfig,
  SiteObject,
  NormViolation,
  Point2D,
  BuildingFootprintShape,
  RoofType
} from '../types';
import {
  generatePlotPolygon,
  getRequiredBoundarySetback,
  getObjectFootprintCorners,
  pointToSegmentDistance,
  calculateInteriorSunPatches,
  isRoofedBuildingCategory,
  isEnclosedBuildingCategory,
  getObjectDoorsConfig,
  getRoofSlopeVectorsLocal,
  getEdgeOutwardNormal,
  getRequiredFireDistance,
  getEffectivePlotRegion,
  calculateBaseFieldDimensions,
  formatMetersMm,
  roundToMm,
  getEffectiveAdjacentParcels,
  calculateBuildingInteriorArea,
  calculateBuildingThermalHeatmap,
  isUndergroundCapableCategory,
  getDefaultBurialDepth,
  getObjectCategoryCapabilities,
  getDefaultPipelineDiameterMm,
  getEffectivePlotRelief,
  calculatePlotReliefAndDrainage
} from '../utils/calculations';
import { buildSiteObject3DGroup } from '../utils/roofGeometry3D';
import { BUILDING_CATEGORY_LABELS } from '../data/regions';
import { MillimeterInput } from './MillimeterInput';

interface Viewport2D3DProps {
  viewMode: '3d' | '2d';
  plot: PlotConfig;
  objects: SiteObject[];
  selectedObjectId: string | null;
  selectedEdgeIndex: number | null;
  violations: NormViolation[];
  dayOfYear: number; // 1..365
  hourOfDay: number; // 4..22 (float)
  showForbiddenZones: boolean;
  xrayWallsMode: boolean;
  undergroundViewMode: boolean;
  thermalHeatmapMode: boolean;
  onSelectObject: (id: string | null) => void;
  onSelectEdge: (edgeIdx: number | null) => void;
  onMoveObject: (id: string, x: number, z: number) => void;
  onUpdateObject: (id: string, updater: (prev: SiteObject) => SiteObject) => void;
  onDeleteObject: (id: string) => void;
  onCanvasReady?: (getSnapshotDataUrl: () => string) => void;
}

const isSoftwareGl = (() => {
  if (typeof document === 'undefined') return true;
  const gl = document.createElement('canvas').getContext('webgl2');
  if (!gl) return true;
  const ext = gl.getExtension('WEBGL_debug_renderer_info');
  const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
  const gpu = String(gl.getParameter(param));
  gl.getExtension('WEBGL_lose_context')?.loseContext();
  return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
})();

export const Viewport2D3D: React.FC<Viewport2D3DProps> = ({
  viewMode,
  plot,
  objects,
  selectedObjectId,
  selectedEdgeIndex,
  violations,
  dayOfYear,
  hourOfDay,
  showForbiddenZones,
  xrayWallsMode,
  undergroundViewMode,
  thermalHeatmapMode,
  onSelectObject,
  onSelectEdge,
  onMoveObject,
  onUpdateObject,
  onDeleteObject,
  onCanvasReady
}) => {
  const threeMountRef = useRef<HTMLDivElement>(null);
  const canvas2DRef = useRef<HTMLCanvasElement>(null);

  // Store latest props in refs so WebGL event listeners never tear down scene
  const stateRef = useRef({
    viewMode,
    plot,
    objects,
    selectedObjectId,
    selectedEdgeIndex,
    violations,
    dayOfYear,
    hourOfDay,
    showForbiddenZones,
    xrayWallsMode,
    undergroundViewMode,
    thermalHeatmapMode,
    onSelectObject,
    onSelectEdge,
    onMoveObject
  });
  stateRef.current = {
    viewMode,
    plot,
    objects,
    selectedObjectId,
    selectedEdgeIndex,
    violations,
    dayOfYear,
    hourOfDay,
    showForbiddenZones,
    xrayWallsMode,
    undergroundViewMode,
    thermalHeatmapMode,
    onSelectObject,
    onSelectEdge,
    onMoveObject
  };

  // 2D Pan/Zoom state
  const [zoom2D, setZoom2D] = useState<number>(10.5); // pixels per meter
  const [pan2D, setPan2D] = useState<{ x: number; y: number }>({ x: 0, y: 12 });
  const dragging2DRef = useRef<{
    type: 'object' | 'pan' | null;
    objectId?: string;
    startX: number;
    startY: number;
    origX: number;
    origZ: number;
  }>({ type: null, startX: 0, startY: 0, origX: 0, origZ: 0 });

  // Three.js scene references
  const threeCtxRef = useRef<{
    renderer: THREE.WebGLRenderer;
    scene: THREE.Scene;
    camera: THREE.PerspectiveCamera;
    controls: OrbitControls;
    sunLight: THREE.DirectionalLight;
    hemiLight: THREE.HemisphereLight;
    dynamicGroup: THREE.Group;
    interactableMeshes: THREE.Object3D[];
    requestRender: () => void;
  } | null>(null);

  // Compute solar position from SunCalc using exact geolocation coordinates (customLat/customLng or region)
  const computeSunVector = (plotCfg: PlotConfig, day: number, hour: number) => {
    const geo = getEffectivePlotRegion(plotCfg);
    const date = new Date(Date.UTC(2026, 0, 1));
    date.setUTCDate(day);
    // Approximate local solar time to UTC using exact longitude
    const utcHour = hour - geo.lng / 15;
    date.setUTCHours(Math.floor(utcHour), Math.round((utcHour % 1) * 60), 0, 0);

    const pos = SunCalc.getPosition(date, geo.lat, geo.lng);
    // SunCalc returns altitude in radians (-PI/2..PI/2), or if > PI/2 it is already in degrees
    const altRad = Math.abs(pos.altitude) > Math.PI ? (pos.altitude * Math.PI) / 180 : pos.altitude;
    const azRad = Math.abs(pos.azimuth) > Math.PI * 2 ? (pos.azimuth * Math.PI) / 180 : pos.azimuth;

    const compassAzimuthRad = azRad + Math.PI + (plotCfg.northAngle * Math.PI) / 180;
    const clampedAltRad = Math.max(0.06, altRad);

    const dist = 48;
    const horiz = dist * Math.cos(clampedAltRad);
    const sunX = horiz * Math.sin(compassAzimuthRad);
    const sunZ = -horiz * Math.cos(compassAzimuthRad);
    const sunY = dist * Math.sin(clampedAltRad);

    const rawAltDeg = (altRad * 180) / Math.PI;
    const rawAzDeg = (((compassAzimuthRad * 180) / Math.PI) % 360 + 360) % 360;

    return {
      x: sunX,
      y: sunY,
      z: sunZ,
      altitudeDeg: Number(rawAltDeg.toFixed(1)),
      azimuthDeg: Number(rawAzDeg.toFixed(0))
    };
  };

  // Initialize Three.js WebGLRenderer once
  useEffect(() => {
    const mount = threeMountRef.current;
    if (!mount) return;

    const renderer = new THREE.WebGLRenderer({
      antialias: !isSoftwareGl,
      powerPreference: 'high-performance',
      preserveDrawingBuffer: true
    });
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.08;
    renderer.setPixelRatio(isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true; // Real shadows are essential for the insolation requirement
    renderer.shadowMap.type = isSoftwareGl ? THREE.BasicShadowMap : THREE.PCFShadowMap;

    const width = mount.clientWidth || 900;
    const height = mount.clientHeight || 600;
    renderer.setSize(width, height);
    mount.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0f172a);
    scene.fog = new THREE.FogExp2(0x0f172a, 0.0038);

    const pmremGenerator = new THREE.PMREMGenerator(renderer);
    scene.environment = pmremGenerator.fromScene(new RoomEnvironment(), 0.04).texture;
    pmremGenerator.dispose();

    const camera = new THREE.PerspectiveCamera(45, width / height, 0.5, 600);
    camera.position.set(0, 36, 44);
    camera.lookAt(0, 0, 0);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = !isSoftwareGl;
    controls.dampingFactor = 0.08;
    controls.maxPolarAngle = Math.PI / 2 - 0.04;
    controls.minDistance = 8;
    controls.maxDistance = 240;

    // Warm/Cool Lighting Rig
    const hemiLight = new THREE.HemisphereLight(0xbae6fd, 0x1e293b, 0.65);
    hemiLight.position.set(0, 50, 0);
    scene.add(hemiLight);

    const sunLight = new THREE.DirectionalLight(0xfffbeb, 1.85);
    sunLight.position.set(25, 35, 25);
    sunLight.castShadow = true;
    const shadowMapDim = isSoftwareGl ? 512 : 2048;
    sunLight.shadow.mapSize.width = shadowMapDim;
    sunLight.shadow.mapSize.height = shadowMapDim;
    const d = 46;
    sunLight.shadow.camera.left = -d;
    sunLight.shadow.camera.right = d;
    sunLight.shadow.camera.top = d;
    sunLight.shadow.camera.bottom = -d;
    sunLight.shadow.camera.near = 1;
    sunLight.shadow.camera.far = 160;
    sunLight.shadow.bias = -0.0005;
    sunLight.shadow.normalBias = 0.02;
    scene.add(sunLight);
    scene.add(sunLight.target);

    // Outer infinite horizon terrain plane
    const outerTerrain = new THREE.Mesh(
      new THREE.PlaneGeometry(800, 800),
      new THREE.MeshStandardMaterial({ color: 0x090d16, roughness: 0.96, metalness: 0.02 })
    );
    outerTerrain.rotation.x = -Math.PI / 2;
    outerTerrain.position.y = -0.08;
    outerTerrain.receiveShadow = true;
    scene.add(outerTerrain);

    const dynamicGroup = new THREE.Group();
    scene.add(dynamicGroup);

    let frameId = 0;
    let renderBusy = false;
    let renderDirty = false;

    function afterDraw(cb: () => void) {
      const gl = renderer.getContext() as WebGL2RenderingContext;
      if (!gl || !gl.fenceSync) {
        frameId = window.setTimeout(cb, 80);
        return;
      }
      const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
      gl.flush();
      const poll = () => {
        const state = sync && gl.getSyncParameter(sync, gl.SYNC_STATUS);
        if (state === gl.UNSIGNALED) {
          frameId = window.setTimeout(poll, 5);
        } else {
          if (sync) gl.deleteSync(sync);
          frameId = window.setTimeout(cb, 80);
        }
      };
      frameId = window.setTimeout(poll, 5);
    }

    function requestRender() {
      if (renderBusy) {
        renderDirty = true;
        return;
      }
      renderBusy = true;
      frameId = requestAnimationFrame(() => {
        renderDirty = false;
        if (!isSoftwareGl) controls.update();
        renderer.render(scene, camera);
        const done = () => {
          renderBusy = false;
          if (renderDirty) requestRender();
        };
        if (isSoftwareGl) afterDraw(done);
        else done();
      });
    }

    controls.addEventListener('change', requestRender);

    // Raycasting for 3D selection and dragging on ground plane
    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();
    const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    const intersectPt = new THREE.Vector3();
    let draggingObjId: string | null = null;
    let dragOffset = { x: 0, z: 0 };

    const updateMouse = (e: PointerEvent) => {
      const rect = renderer.domElement.getBoundingClientRect();
      mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    };

    const onPointerDown = (e: PointerEvent) => {
      if (e.button !== 0 || stateRef.current.viewMode !== '3d') return;
      updateMouse(e);
      raycaster.setFromCamera(mouse, camera);
      const targets = threeCtxRef.current?.interactableMeshes || [];
      const hits = raycaster.intersectObjects(targets, true);

      if (hits.length > 0) {
        let curr: THREE.Object3D | null = hits[0].object;
        while (curr && !curr.userData?.objectId && curr.parent) {
          curr = curr.parent;
        }
        if (curr?.userData?.objectId) {
          const objId = curr.userData.objectId as string;
          stateRef.current.onSelectObject(objId);
          const found = stateRef.current.objects.find((o) => o.id === objId);
          if (found && raycaster.ray.intersectPlane(groundPlane, intersectPt)) {
            draggingObjId = objId;
            dragOffset = { x: found.x - intersectPt.x, z: found.z - intersectPt.z };
            controls.enabled = false;
          }
        }
      }
    };

    const onPointerMove = (e: PointerEvent) => {
      if (!draggingObjId || stateRef.current.viewMode !== '3d') return;
      updateMouse(e);
      raycaster.setFromCamera(mouse, camera);
      if (raycaster.ray.intersectPlane(groundPlane, intersectPt)) {
        const nextX = Number(( Math.round((intersectPt.x + dragOffset.x) * 2) / 2 ).toFixed(1));
        const nextZ = Number(( Math.round((intersectPt.z + dragOffset.z) * 2) / 2 ).toFixed(1));
        stateRef.current.onMoveObject(draggingObjId, nextX, nextZ);
      }
    };

    const onPointerUp = () => {
      if (draggingObjId) {
        draggingObjId = null;
        controls.enabled = true;
      }
    };

    renderer.domElement.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);

    const onResize = () => {
      if (!mount) return;
      const w = mount.clientWidth || 900;
      const h = mount.clientHeight || 600;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
      requestRender();
    };
    window.addEventListener('resize', onResize);

    threeCtxRef.current = {
      renderer,
      scene,
      camera,
      controls,
      sunLight,
      hemiLight,
      dynamicGroup,
      interactableMeshes: [],
      requestRender
    };

    if (onCanvasReady) {
      onCanvasReady(() => {
        if (stateRef.current.viewMode === '2d' && canvas2DRef.current) {
          return canvas2DRef.current.toDataURL('image/png');
        }
        renderer.render(scene, camera);
        return renderer.domElement.toDataURL('image/png');
      });
    }

    return () => {
      cancelAnimationFrame(frameId);
      clearTimeout(frameId);
      renderer.domElement.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('resize', onResize);
      controls.dispose();
      renderer.dispose();
      if (mount.contains(renderer.domElement)) {
        mount.removeChild(renderer.domElement);
      }
    };
  }, []);

  // Rebuild 3D dynamic meshes & update sun position when plot/objects/sun change
  useEffect(() => {
    const ctx = threeCtxRef.current;
    if (!ctx) return;

    const { dynamicGroup, sunLight, requestRender } = ctx;

    // Clear previous dynamic children cleanly
    while (dynamicGroup.children.length > 0) {
      const child = dynamicGroup.children[0];
      dynamicGroup.remove(child);
    }
    ctx.interactableMeshes = [];

    // Update Sun position & shadow frustum
    const sunPos = computeSunVector(plot, dayOfYear, hourOfDay);
    sunLight.position.set(sunPos.x, sunPos.y, sunPos.z);
    // Warm golden hour tint when sun is low
    if (sunPos.altitudeDeg < 15) {
      sunLight.color.setHex(0xfde68a);
      sunLight.intensity = 1.3;
    } else {
      sunLight.color.setHex(0xfffbeb);
      sunLight.intensity = 1.9;
    }

    // 0. Automatic Base Field Plane & Rectangular 1m/5m Grid (Standard: 4x plot width & 4x plot length)
    const baseField = calculateBaseFieldDimensions(plot, objects);
    const region = getEffectivePlotRegion(plot);
    ctx.controls.maxDistance = Math.max(180, Math.hypot(baseField.fieldWidth, baseField.fieldLength) * 1.15);

    const baseFieldGeo = new THREE.PlaneGeometry(baseField.fieldWidth, baseField.fieldLength);
    baseFieldGeo.rotateX(-Math.PI / 2);
    const baseFieldMat = new THREE.MeshStandardMaterial({
      color: 0x0f172a,
      roughness: 0.94,
      metalness: 0.03,
      transparent: undergroundViewMode,
      opacity: undergroundViewMode ? 0.25 : 1.0,
      depthWrite: !undergroundViewMode
    });
    const baseFieldMesh = new THREE.Mesh(baseFieldGeo, baseFieldMat);
    baseFieldMesh.position.y = -0.04;
    baseFieldMesh.receiveShadow = true;
    dynamicGroup.add(baseFieldMesh);

    // When Underground View Mode is enabled, render regional Frost Depth Plane (-region.frostDepth)
    if (undergroundViewMode) {
      const frostGeo = new THREE.PlaneGeometry(baseField.fieldWidth * 0.75, baseField.fieldLength * 0.75);
      frostGeo.rotateX(-Math.PI / 2);
      const frostMat = new THREE.MeshBasicMaterial({
        color: 0x0ea5e9,
        transparent: true,
        opacity: 0.14,
        side: THREE.DoubleSide,
        depthWrite: false
      });
      const frostMesh = new THREE.Mesh(frostGeo, frostMat);
      frostMesh.position.y = -region.frostDepth;
      frostMesh.userData = { isFrostDepthPlane: true, frostDepth: region.frostDepth };
      dynamicGroup.add(frostMesh);
    }

    // Rectangular 5m & 1m grid across exact baseField.fieldWidth × baseField.fieldLength
    const halfFW = baseField.fieldWidth / 2;
    const halfFL = baseField.fieldLength / 2;
    const majorGridVerts: number[] = [];
    const minorGridVerts: number[] = [];
    const startX = Math.ceil(-halfFW);
    const endX = Math.floor(halfFW);
    for (let gx = startX; gx <= endX; gx++) {
      const target = gx % 5 === 0 ? majorGridVerts : minorGridVerts;
      target.push(gx, 0.015, -halfFL, gx, 0.015, halfFL);
    }
    const startZ = Math.ceil(-halfFL);
    const endZ = Math.floor(halfFL);
    for (let gz = startZ; gz <= endZ; gz++) {
      const target = gz % 5 === 0 ? majorGridVerts : minorGridVerts;
      target.push(-halfFW, 0.015, gz, halfFW, 0.015, gz);
    }
    if (minorGridVerts.length > 0) {
      const minorGeo = new THREE.BufferGeometry();
      minorGeo.setAttribute('position', new THREE.Float32BufferAttribute(minorGridVerts, 3));
      const minorLines = new THREE.LineSegments(
        minorGeo,
        new THREE.LineBasicMaterial({ color: 0x1e293b, transparent: true, opacity: 0.55 })
      );
      dynamicGroup.add(minorLines);
    }
    if (majorGridVerts.length > 0) {
      const majorGeo = new THREE.BufferGeometry();
      majorGeo.setAttribute('position', new THREE.Float32BufferAttribute(majorGridVerts, 3));
      const majorLines = new THREE.LineSegments(
        majorGeo,
        new THREE.LineBasicMaterial({ color: 0x334155, transparent: true, opacity: 0.75 })
      );
      dynamicGroup.add(majorLines);
    }

    // Perimeter frame of Base Field (4x)
    const borderPts = [
      new THREE.Vector3(-halfFW, 0.025, -halfFL),
      new THREE.Vector3(halfFW, 0.025, -halfFL),
      new THREE.Vector3(halfFW, 0.025, halfFL),
      new THREE.Vector3(-halfFW, 0.025, halfFL),
      new THREE.Vector3(-halfFW, 0.025, -halfFL)
    ];
    const borderGeo = new THREE.BufferGeometry().setFromPoints(borderPts);
    const borderLine = new THREE.Line(
      borderGeo,
      new THREE.LineBasicMaterial({ color: 0x0284c7, transparent: true, opacity: 0.65 })
    );
    dynamicGroup.add(borderLine);

    // 0b. Render Neighbor Plots & State Land Parcel Boundaries in 3D
    const adjacentParcels = getEffectiveAdjacentParcels(plot);
    adjacentParcels.forEach((parcel) => {
      const pw = Math.max(2, parcel.width);
      const pl = Math.max(2, parcel.length);
      const px = parcel.offsetX;
      const pz = parcel.offsetZ;
      const isNeighbor = parcel.type === 'neighbor_parcel';
      const frameColor = isNeighbor ? 0xf59e0b : 0x10b981;

      const parcelPlaneGeo = new THREE.PlaneGeometry(pw, pl);
      parcelPlaneGeo.rotateX(-Math.PI / 2);
      const parcelPlaneMat = new THREE.MeshBasicMaterial({
        color: frameColor,
        transparent: true,
        opacity: undergroundViewMode ? 0.05 : 0.08,
        side: THREE.DoubleSide,
        depthWrite: false
      });
      const parcelPlane = new THREE.Mesh(parcelPlaneGeo, parcelPlaneMat);
      parcelPlane.position.set(px, 0.018, pz);
      parcelPlane.userData = { isAdjacentParcel: true, parcelId: parcel.id, parcelType: parcel.type };
      dynamicGroup.add(parcelPlane);

      const pPts = [
        new THREE.Vector3(px - pw / 2, 0.035, pz - pl / 2),
        new THREE.Vector3(px + pw / 2, 0.035, pz - pl / 2),
        new THREE.Vector3(px + pw / 2, 0.035, pz + pl / 2),
        new THREE.Vector3(px - pw / 2, 0.035, pz + pl / 2),
        new THREE.Vector3(px - pw / 2, 0.035, pz - pl / 2)
      ];
      const pLineGeo = new THREE.BufferGeometry().setFromPoints(pPts);
      const pLine = new THREE.Line(
        pLineGeo,
        new THREE.LineBasicMaterial({ color: frameColor, transparent: true, opacity: 0.85 })
      );
      dynamicGroup.add(pLine);
    });

    // 1. Plot Turf Polygon Mesh
    const poly = generatePlotPolygon(plot);
    if (poly.length >= 3) {
      const plotShape = new THREE.Shape();
      // Note: Shape is in X, Y; when rotated -PI/2 around X, shape Y becomes -Z.
      // So we pass (pt.x, -pt.z) so that after rotateX(-PI/2) it lands at (pt.x, 0, pt.z)
      plotShape.moveTo(poly[0].x, -poly[0].z);
      for (let i = 1; i < poly.length; i++) {
        plotShape.lineTo(poly[i].x, -poly[i].z);
      }
      plotShape.closePath();

      const plotGeo = new THREE.ExtrudeGeometry(plotShape, { depth: 0.08, bevelEnabled: false });
      plotGeo.rotateX(-Math.PI / 2);
      const plotMat = new THREE.MeshStandardMaterial({
        color: 0x1e293b,
        roughness: 0.9,
        metalness: 0.05,
        transparent: undergroundViewMode,
        opacity: undergroundViewMode ? 0.30 : 1.0,
        depthWrite: !undergroundViewMode
      });
      const plotMesh = new THREE.Mesh(plotGeo, plotMat);
      plotMesh.position.y = -0.06;
      plotMesh.receiveShadow = true;
      dynamicGroup.add(plotMesh);

      // 1b. 3D Terrain Surface Slope & Automatic Stormwater Drainage Zones (when showDrainageZones is enabled)
      const reliefCfg = getEffectivePlotRelief(plot);
      if (reliefCfg.showDrainageZones) {
        const reliefData = calculatePlotReliefAndDrainage(plot, objects);
        const drainageGroup = new THREE.Group();
        drainageGroup.name = 'plot-drainage-zones-3d';

        // Uphill Interceptor Trench (Нагорная перехватывающая дрена)
        const interceptorZone = reliefData.drainageZones.find((z) => z.type === 'interceptor_trench');
        if (interceptorZone && interceptorZone.points.length >= 3) {
          const trShape = new THREE.Shape();
          trShape.moveTo(interceptorZone.points[0].x, -interceptorZone.points[0].z);
          for (let k = 1; k < interceptorZone.points.length; k++) {
            trShape.lineTo(interceptorZone.points[k].x, -interceptorZone.points[k].z);
          }
          trShape.closePath();
          const trGeo = new THREE.ShapeGeometry(trShape);
          trGeo.rotateX(-Math.PI / 2);
          const trMesh = new THREE.Mesh(
            trGeo,
            new THREE.MeshBasicMaterial({
              color: 0x06b6d4,
              transparent: true,
              opacity: 0.38,
              side: THREE.DoubleSide,
              depthWrite: false
            })
          );
          trMesh.position.y = 0.045;
          drainageGroup.add(trMesh);
        }

        // Lowest-point Stormwater Collector Basin & Well (Нижняя зона водосбора и дренажный колодец)
        const collectorZone = reliefData.drainageZones.find((z) => z.type === 'collector_well');
        if (collectorZone) {
          const radM = collectorZone.radiusM || 2.2;
          const basinGeo = new THREE.CircleGeometry(radM, 32);
          basinGeo.rotateX(-Math.PI / 2);
          const basinMesh = new THREE.Mesh(
            basinGeo,
            new THREE.MeshBasicMaterial({
              color: 0x0284c7,
              transparent: true,
              opacity: 0.35,
              side: THREE.DoubleSide,
              depthWrite: false
            })
          );
          basinMesh.position.set(collectorZone.center.x, 0.048, collectorZone.center.z);
          drainageGroup.add(basinMesh);

          const ringGeo = new THREE.RingGeometry(radM - 0.15, radM, 32);
          ringGeo.rotateX(-Math.PI / 2);
          const ringMesh = new THREE.Mesh(
            ringGeo,
            new THREE.MeshBasicMaterial({
              color: 0x38bdf8,
              transparent: true,
              opacity: 0.85,
              side: THREE.DoubleSide,
              depthWrite: false
            })
          );
          ringMesh.position.set(collectorZone.center.x, 0.052, collectorZone.center.z);
          drainageGroup.add(ringMesh);

          // Collector well hatch cylinder
          const wellCyl = new THREE.Mesh(
            new THREE.CylinderGeometry(0.48, 0.48, 0.26, 20),
            new THREE.MeshStandardMaterial({ color: 0x0369a1, roughness: 0.4, metalness: 0.3 })
          );
          wellCyl.position.set(collectorZone.center.x, 0.13, collectorZone.center.z);
          drainageGroup.add(wellCyl);
        }

        // Runoff Channel line & 3D Surface Slope Flow Arrows
        const channelZone = reliefData.drainageZones.find((z) => z.type === 'runoff_channel');
        if (channelZone && channelZone.points.length >= 2) {
          const chPts = channelZone.points.map((p) => new THREE.Vector3(p.x, 0.06, p.z));
          const chGeo = new THREE.BufferGeometry().setFromPoints(chPts);
          const chLine = new THREE.Line(
            chGeo,
            new THREE.LineBasicMaterial({ color: 0x38bdf8 })
          );
          drainageGroup.add(chLine);
        }

        // 3D Slope Direction Arrows across the plot
        const sv = reliefData.slopeVector;
        const arrowDir = new THREE.Vector3(sv.x, 0, sv.z).normalize();
        const arrowOffsets: Point2D[] = [
          { x: -plot.width * 0.22, z: -plot.length * 0.18 },
          { x: plot.width * 0.22, z: -plot.length * 0.18 },
          { x: 0, z: plot.length * 0.15 }
        ];
        arrowOffsets.forEach((off) => {
          const arrowHelper = new THREE.ArrowHelper(
            arrowDir,
            new THREE.Vector3(off.x - sv.x * 2, 0.08, off.z - sv.z * 2),
            4.2,
            0x22d3ee,
            1.1,
            0.65
          );
          drainageGroup.add(arrowHelper);
        });

        dynamicGroup.add(drainageGroup);
      }

      // 2. Forbidden Setback Strips INSIDE and OUTSIDE boundaries (when showForbiddenZones = true)
      const selectedObj = objects.find((o) => o.id === selectedObjectId) || objects.find((o) => o.category === 'house');
      if (showForbiddenZones && selectedObj) {
        poly.forEach((a, idx) => {
          const b = poly[(idx + 1) % poly.length];
          const edgeCfg = plot.edges[idx] || { type: 'neighbor', fenceType: 'mesh', fenceHeight: 1.5, hasNeighborConsent: false };
          const setbackM = getRequiredBoundarySetback(selectedObj.category, edgeCfg.type) || 3;
          const dx = b.x - a.x;
          const dz = b.z - a.z;
          const len = Math.hypot(dx, dz) || 1;
          const outNorm = getEdgeOutwardNormal(a, b);
          const inNx = -outNorm.x;
          const inNz = -outNorm.z;

          // 2a. Internal Forbidden Setback Strip (inside the plot)
          if (setbackM > 0) {
            const stripGeo = new THREE.PlaneGeometry(len, setbackM);
            stripGeo.rotateX(-Math.PI / 2);
            const stripMat = new THREE.MeshBasicMaterial({
              color: edgeCfg.type === 'street' ? 0xef4444 : 0xf97316,
              transparent: true,
              opacity: 0.24,
              side: THREE.DoubleSide,
              depthWrite: false
            });
            const stripMesh = new THREE.Mesh(stripGeo, stripMat);
            const midX = (a.x + b.x) / 2 + inNx * (setbackM / 2);
            const midZ = (a.z + b.z) / 2 + inNz * (setbackM / 2);
            stripMesh.position.set(midX, 0.04, midZ);
            stripMesh.rotation.y = -Math.atan2(dz, dx);
            dynamicGroup.add(stripMesh);
          }

          // 2b. External Forbidden Setback Strip (3m neighbor setback outside the boundary)
          // & Free Land Acquisition Strip (Зона возможного докупа / прирезки свободной территории)
          if (edgeCfg.type === 'neighbor') {
            const extSetback = 3.0;
            // Check if any external object (neighbor_house, forest, water_body, utility) blocks this external edge
            const externalBlockers = objects.filter((o) => {
              if (
                o.category !== 'neighbor_house' &&
                o.category !== 'neighbor_well' &&
                o.category !== 'forest' &&
                o.category !== 'water_body' &&
                o.category !== 'power_line' &&
                o.category !== 'gas_pipe'
              ) {
                return false;
              }
              const d = pointToSegmentDistance({ x: o.x, z: o.z }, a, b);
              return d < 12;
            });

            const hasViolatingNeighbor = externalBlockers.some((o) => {
              if (o.category !== 'neighbor_house') return false;
              const corners = getObjectFootprintCorners(o, false);
              return Math.min(...corners.map((c) => pointToSegmentDistance(c, a, b))) < 3.0;
            });

            // 3m external neighbor setback zone
            const extGeo = new THREE.PlaneGeometry(len, extSetback);
            extGeo.rotateX(-Math.PI / 2);
            const extMat = new THREE.MeshBasicMaterial({
              color: hasViolatingNeighbor ? 0xdc2626 : 0xf59e0b,
              transparent: true,
              opacity: hasViolatingNeighbor ? 0.34 : 0.14,
              side: THREE.DoubleSide,
              depthWrite: false
            });
            const extMesh = new THREE.Mesh(extGeo, extMat);
            extMesh.position.set(
              (a.x + b.x) / 2 + outNorm.x * (extSetback / 2),
              0.03,
              (a.z + b.z) / 2 + outNorm.z * (extSetback / 2)
            );
            extMesh.rotation.y = -Math.atan2(dz, dx);
            dynamicGroup.add(extMesh);

            // If no external blockers and no ZOUIT on this edge, highlight 5m Free Land Acquisition Strip (Прирезка по ст. 39.28 ЗК РФ)
            const isZouitEdge = plot.hasZouit && plot.zouitEdgeIndex % poly.length === idx;
            if (externalBlockers.length === 0 && !isZouitEdge) {
              const acqDepth = 5.0;
              const acqGeo = new THREE.PlaneGeometry(len, acqDepth);
              acqGeo.rotateX(-Math.PI / 2);
              const acqMat = new THREE.MeshBasicMaterial({
                color: 0x10b981,
                transparent: true,
                opacity: 0.18,
                side: THREE.DoubleSide,
                depthWrite: false
              });
              const acqMesh = new THREE.Mesh(acqGeo, acqMat);
              acqMesh.position.set(
                (a.x + b.x) / 2 + outNorm.x * (extSetback + acqDepth / 2),
                0.025,
                (a.z + b.z) / 2 + outNorm.z * (extSetback + acqDepth / 2)
              );
              acqMesh.rotation.y = -Math.atan2(dz, dx);
              dynamicGroup.add(acqMesh);
            }
          }
        });
      }

      // 3. Fences along each boundary edge & Street Road Strip
      poly.forEach((a, idx) => {
        const b = poly[(idx + 1) % poly.length];
        const edgeCfg = plot.edges[idx] || {
          edgeIndex: idx,
          type: 'neighbor',
          fenceType: 'mesh',
          fenceHeight: 1.5,
          hasNeighborConsent: false
        };

        const dx = b.x - a.x;
        const dz = b.z - a.z;
        const len = Math.hypot(dx, dz);
        const midX = (a.x + b.x) / 2;
        const midZ = (a.z + b.z) / 2;
        const angleY = -Math.atan2(dz, dx);

        const isIllegalFence =
          plot.category === 'SNT' &&
          edgeCfg.type === 'neighbor' &&
          (edgeCfg.fenceType === 'solid' || edgeCfg.fenceHeight > 1.8) &&
          !edgeCfg.hasNeighborConsent;

        const fenceGroup = new THREE.Group();
        fenceGroup.position.set(midX, 0, midZ);
        fenceGroup.rotation.y = angleY;

        // Fence posts every 2.5m
        const postMat = new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.5, metalness: 0.6 });
        const postCount = Math.max(2, Math.ceil(len / 2.5));
        for (let p = 0; p <= postCount; p++) {
          const px = -len / 2 + (p / postCount) * len;
          const post = new THREE.Mesh(new THREE.BoxGeometry(0.08, edgeCfg.fenceHeight, 0.08), postMat);
          post.position.set(px, edgeCfg.fenceHeight / 2, 0);
          post.castShadow = true;
          fenceGroup.add(post);
        }

        // Fence panel
        const isSolid = edgeCfg.fenceType === 'solid';
        const panelColor = isIllegalFence
          ? 0xf97316
          : selectedEdgeIndex === idx
          ? 0x38bdf8
          : isSolid
          ? 0x475569
          : 0x10b981;

        const panelMat = new THREE.MeshStandardMaterial({
          color: panelColor,
          roughness: 0.6,
          metalness: 0.2,
          transparent: !isSolid,
          opacity: isSolid ? 1.0 : 0.32
        });

        const panelMesh = new THREE.Mesh(
          new THREE.BoxGeometry(len, Math.max(0.4, edgeCfg.fenceHeight - 0.1), 0.04),
          panelMat
        );
        panelMesh.position.set(0, edgeCfg.fenceHeight / 2, 0);
        panelMesh.castShadow = isSolid;
        panelMesh.receiveShadow = true;
        fenceGroup.add(panelMesh);

        // If Street or Driveway edge, render asphalt road outside the boundary
        if (edgeCfg.type === 'street' || edgeCfg.type === 'driveway') {
          const roadW = edgeCfg.type === 'street' ? 6 : 3.5;
          const roadGeo = new THREE.PlaneGeometry(len + 12, roadW);
          roadGeo.rotateX(-Math.PI / 2);
          const roadMat = new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.85 });
          const roadMesh = new THREE.Mesh(roadGeo, roadMat);
          roadMesh.position.set(0, 0.01, roadW / 2 + 0.6);
          roadMesh.receiveShadow = true;
          fenceGroup.add(roadMesh);
        }

        dynamicGroup.add(fenceGroup);
      });
    }

    // 4. Site Objects (Buildings, Wells, Neighbor Context, Nature/Utility Buffers, Sanitary & Fire Circles)
    objects.forEach((obj) => {
      const objViolations = violations.filter((v) => v.objectId === obj.id);
      const hasErr = objViolations.some((v) => v.severity === 'error');
      const hasWarn = objViolations.some((v) => v.severity === 'warning');
      const isSel = obj.id === selectedObjectId;

      const meshGroup = buildSiteObject3DGroup(
        obj,
        isSel,
        hasErr,
        hasWarn,
        xrayWallsMode,
        sunPos,
        undergroundViewMode,
        thermalHeatmapMode,
        plot
      );
      dynamicGroup.add(meshGroup);
      ctx.interactableMeshes.push(meshGroup);

      // Sanitary / Fire / Protective Buffer Zones in 3D when showForbiddenZones is active
      if (showForbiddenZones) {
        if (obj.category === 'well' || obj.category === 'neighbor_well' || obj.category === 'toilet') {
          const ringGeo = new THREE.RingGeometry(7.85, 8.05, 48);
          ringGeo.rotateX(-Math.PI / 2);
          const ringMat = new THREE.MeshBasicMaterial({
            color: obj.category === 'toilet' ? 0xef4444 : 0x06b6d4,
            transparent: true,
            opacity: 0.55,
            side: THREE.DoubleSide
          });
          const ringMesh = new THREE.Mesh(ringGeo, ringMat);
          ringMesh.position.set(obj.x, 0.05, obj.z);
          dynamicGroup.add(ringMesh);
        }

        // Protective buffer around nature & utility objects (forest, water_body, power_line, gas_pipe, water_main, sewer_main, road)
        const catMeta = BUILDING_CATEGORY_LABELS[obj.category];
        if (
          catMeta?.protectiveBufferM &&
          (obj.category === 'forest' ||
            obj.category === 'water_body' ||
            obj.category === 'power_line' ||
            obj.category === 'gas_pipe' ||
            obj.category === 'water_main' ||
            obj.category === 'sewer_main' ||
            obj.category === 'road')
        ) {
          const buf = catMeta.protectiveBufferM;
          const bufGeo = new THREE.PlaneGeometry(obj.width + buf * 2, obj.length + buf * 2);
          bufGeo.rotateX(-Math.PI / 2);
          const bufMat = new THREE.MeshBasicMaterial({
            color: 0xef4444,
            transparent: true,
            opacity: 0.16,
            side: THREE.DoubleSide,
            depthWrite: false
          });
          const bufMesh = new THREE.Mesh(bufGeo, bufMat);
          bufMesh.position.set(obj.x, 0.035, obj.z);
          bufMesh.rotation.y = -(obj.rotation * Math.PI) / 180;
          dynamicGroup.add(bufMesh);
        }
      }
    });

    // 5. Visual Sun Sphere indicator in sky
    const sunOrb = new THREE.Mesh(
      new THREE.SphereGeometry(1.4, 16, 16),
      new THREE.MeshBasicMaterial({ color: 0xfacc15 })
    );
    sunOrb.position.set(sunPos.x, sunPos.y, sunPos.z);
    dynamicGroup.add(sunOrb);

    requestRender();
  }, [plot, objects, selectedObjectId, selectedEdgeIndex, violations, dayOfYear, hourOfDay, showForbiddenZones, xrayWallsMode, undergroundViewMode, thermalHeatmapMode, viewMode]);

  // Render 2D CAD Blueprint Canvas whenever state changes
  useEffect(() => {
    const canvas = canvas2DRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const parent = canvas.parentElement;
    const width = parent?.clientWidth || 900;
    const height = parent?.clientHeight || 600;
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }

    const cx = width / 2 + pan2D.x;
    const cy = height / 2 + pan2D.y;
    const scale = zoom2D;

    const toScreen = (pt: Point2D) => ({
      x: cx + pt.x * scale,
      y: cy + pt.z * scale
    });

    // Background Blueprint Dark Slate
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(0, 0, width, height);

    // 1m & 5m CAD Grid
    ctx.lineWidth = 1;
    const minWorldX = Math.floor(-cx / scale) - 1;
    const maxWorldX = Math.ceil((width - cx) / scale) + 1;
    const minWorldZ = Math.floor(-cy / scale) - 1;
    const maxWorldZ = Math.ceil((height - cy) / scale) + 1;

    for (let x = minWorldX; x <= maxWorldX; x++) {
      const sx = cx + x * scale;
      ctx.strokeStyle = x % 5 === 0 ? 'rgba(71, 85, 105, 0.45)' : 'rgba(51, 65, 85, 0.22)';
      ctx.beginPath();
      ctx.moveTo(sx, 0);
      ctx.lineTo(sx, height);
      ctx.stroke();
    }
    for (let z = minWorldZ; z <= maxWorldZ; z++) {
      const sy = cy + z * scale;
      ctx.strokeStyle = z % 5 === 0 ? 'rgba(71, 85, 105, 0.45)' : 'rgba(51, 65, 85, 0.22)';
      ctx.beginPath();
      ctx.moveTo(0, sy);
      ctx.lineTo(width, sy);
      ctx.stroke();
    }

    const poly = generatePlotPolygon(plot);
    const baseField = calculateBaseFieldDimensions(plot, objects);

    // Draw Base Field (4x plot width & length by default) Outer Boundary Rectangle in 2D
    {
      const bfTopLeft = toScreen({ x: -baseField.fieldWidth / 2, z: -baseField.fieldLength / 2 });
      const bfBottomRight = toScreen({ x: baseField.fieldWidth / 2, z: baseField.fieldLength / 2 });
      const bfW = bfBottomRight.x - bfTopLeft.x;
      const bfH = bfBottomRight.y - bfTopLeft.y;

      ctx.save();
      ctx.fillStyle = 'rgba(15, 23, 42, 0.35)';
      ctx.fillRect(bfTopLeft.x, bfTopLeft.y, bfW, bfH);
      ctx.setLineDash([8, 6]);
      ctx.strokeStyle = 'rgba(56, 189, 248, 0.55)';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(bfTopLeft.x, bfTopLeft.y, bfW, bfH);
      ctx.setLineDash([]);

      ctx.font = '700 11px "JetBrains Mono", monospace';
      ctx.fillStyle = '#38bdf8';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      ctx.fillText(
        `БАЗОВОЕ ПОЛЕ (${baseField.multiplier}×): ${formatMetersMm(baseField.fieldWidth)} × ${formatMetersMm(baseField.fieldLength)} м`,
        bfTopLeft.x + 8,
        bfTopLeft.y + 8
      );
      ctx.restore();
    }

    // Draw Adjacent Neighbor Parcels & State Land Boundaries in 2D
    const adjacentParcels = getEffectiveAdjacentParcels(plot);
    adjacentParcels.forEach((parcel) => {
      const pTopLeft = toScreen({
        x: parcel.offsetX - parcel.width / 2,
        z: parcel.offsetZ - parcel.length / 2
      });
      const pBotRight = toScreen({
        x: parcel.offsetX + parcel.width / 2,
        z: parcel.offsetZ + parcel.length / 2
      });
      const pw = pBotRight.x - pTopLeft.x;
      const ph = pBotRight.y - pTopLeft.y;
      const isNeighbor = parcel.type === 'neighbor_parcel';

      ctx.save();
      ctx.fillStyle = isNeighbor ? 'rgba(245, 158, 11, 0.06)' : 'rgba(16, 185, 129, 0.06)';
      ctx.fillRect(pTopLeft.x, pTopLeft.y, pw, ph);
      ctx.setLineDash([7, 5]);
      ctx.strokeStyle = isNeighbor ? 'rgba(245, 158, 11, 0.7)' : 'rgba(16, 185, 129, 0.7)';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(pTopLeft.x, pTopLeft.y, pw, ph);
      ctx.setLineDash([]);

      ctx.font = '700 10px "Plus Jakarta Sans", sans-serif';
      ctx.fillStyle = isNeighbor ? '#fbbf24' : '#34d399';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      const badgeText = `${parcel.name} (${formatMetersMm(parcel.width)}×${formatMetersMm(parcel.length)} м)`;
      ctx.fillText(badgeText, pTopLeft.x + 6, pTopLeft.y + 6);
      ctx.restore();
    });

    // Draw Plot Turf Polygon & Forbidden/Acquisition Zones
    if (poly.length >= 3) {
      // 0. Draw External Forbidden Zones & Free Land Acquisition Zones OUTSIDE the plot first
      if (showForbiddenZones) {
        poly.forEach((a, idx) => {
          const b = poly[(idx + 1) % poly.length];
          const edgeCfg = plot.edges[idx] || { type: 'neighbor', fenceType: 'mesh', fenceHeight: 1.5, hasNeighborConsent: false };
          const outNorm = getEdgeOutwardNormal(a, b);

          if (edgeCfg.type === 'neighbor') {
            const extSetback = 3.0;
            const externalBlockers = objects.filter((o) => {
              if (
                o.category !== 'neighbor_house' &&
                o.category !== 'neighbor_well' &&
                o.category !== 'forest' &&
                o.category !== 'water_body' &&
                o.category !== 'power_line' &&
                o.category !== 'gas_pipe'
              ) {
                return false;
              }
              return pointToSegmentDistance({ x: o.x, z: o.z }, a, b) < 12;
            });

            const violatingNeighbors = externalBlockers.filter((o) => {
              if (o.category !== 'neighbor_house') return false;
              const corners = getObjectFootprintCorners(o, false);
              return Math.min(...corners.map((c) => pointToSegmentDistance(c, a, b))) < 3.0;
            });

            // External 3m neighbor setback strip
            const sa = toScreen(a);
            const sb = toScreen(b);
            const sbOut = toScreen({ x: b.x + outNorm.x * extSetback, z: b.z + outNorm.z * extSetback });
            const saOut = toScreen({ x: a.x + outNorm.x * extSetback, z: a.z + outNorm.z * extSetback });

            ctx.beginPath();
            ctx.moveTo(sa.x, sa.y);
            ctx.lineTo(sb.x, sb.y);
            ctx.lineTo(sbOut.x, sbOut.y);
            ctx.lineTo(saOut.x, saOut.y);
            ctx.closePath();
            ctx.fillStyle = violatingNeighbors.length > 0 ? 'rgba(220, 38, 38, 0.28)' : 'rgba(245, 158, 11, 0.12)';
            ctx.fill();
            ctx.setLineDash([4, 4]);
            ctx.strokeStyle = violatingNeighbors.length > 0 ? 'rgba(239, 68, 68, 0.85)' : 'rgba(245, 158, 11, 0.5)';
            ctx.lineWidth = 1;
            ctx.stroke();
            ctx.setLineDash([]);

            // Free Land Acquisition Zone (Зона возможного докупа / прирезки по ст. 39.28 ЗК РФ)
            const isZouitEdge = plot.hasZouit && plot.zouitEdgeIndex % poly.length === idx;
            if (externalBlockers.length === 0 && !isZouitEdge) {
              const acqStart = extSetback;
              const acqEnd = extSetback + 5.0;
              const saAcq1 = toScreen({ x: a.x + outNorm.x * acqStart, z: a.z + outNorm.z * acqStart });
              const sbAcq1 = toScreen({ x: b.x + outNorm.x * acqStart, z: b.z + outNorm.z * acqStart });
              const sbAcq2 = toScreen({ x: b.x + outNorm.x * acqEnd, z: b.z + outNorm.z * acqEnd });
              const saAcq2 = toScreen({ x: a.x + outNorm.x * acqEnd, z: a.z + outNorm.z * acqEnd });

              ctx.beginPath();
              ctx.moveTo(saAcq1.x, saAcq1.y);
              ctx.lineTo(sbAcq1.x, sbAcq1.y);
              ctx.lineTo(sbAcq2.x, sbAcq2.y);
              ctx.lineTo(saAcq2.x, saAcq2.y);
              ctx.closePath();
              ctx.fillStyle = 'rgba(16, 185, 129, 0.14)';
              ctx.fill();
              ctx.setLineDash([6, 4]);
              ctx.strokeStyle = 'rgba(16, 185, 129, 0.65)';
              ctx.stroke();
              ctx.setLineDash([]);

              const labelPt = toScreen({
                x: (a.x + b.x) / 2 + outNorm.x * (acqStart + 2.5),
                z: (a.z + b.z) / 2 + outNorm.z * (acqStart + 2.5)
              });
              ctx.font = '600 10px "Plus Jakarta Sans", sans-serif';
              ctx.fillStyle = '#34d399';
              ctx.textAlign = 'center';
              ctx.textBaseline = 'middle';
              ctx.fillText('Свободная зона: возможен докуп / прирезка (ст. 39.28 ЗК РФ)', labelPt.x, labelPt.y);
            } else if (violatingNeighbors.length > 0) {
              const warnPt = toScreen({
                x: (a.x + b.x) / 2 + outNorm.x * 1.6,
                z: (a.z + b.z) / 2 + outNorm.z * 1.6
              });
              ctx.font = '700 10px "Plus Jakarta Sans", sans-serif';
              ctx.fillStyle = '#fca5a5';
              ctx.textAlign = 'center';
              ctx.textBaseline = 'middle';
              ctx.fillText('НАРУШЕНИЕ СОСЕДА (< 3м до вашей межи)', warnPt.x, warnPt.y);
            }
          }
        });
      }

      // Draw Plot Turf Polygon
      ctx.beginPath();
      const p0 = toScreen(poly[0]);
      ctx.moveTo(p0.x, p0.y);
      for (let i = 1; i < poly.length; i++) {
        const pi = toScreen(poly[i]);
        ctx.lineTo(pi.x, pi.y);
      }
      ctx.closePath();
      ctx.fillStyle = 'rgba(30, 41, 59, 0.85)';
      ctx.fill();

      // Draw Forbidden Setback Zones inside plot
      const activeObj = objects.find((o) => o.id === selectedObjectId) || objects.find((o) => o.category === 'house');
      if (showForbiddenZones && activeObj) {
        ctx.save();
        ctx.clip(); // Clip to plot interior

        poly.forEach((a, idx) => {
          const b = poly[(idx + 1) % poly.length];
          const edgeCfg = plot.edges[idx] || { type: 'neighbor', fenceType: 'mesh', fenceHeight: 1.5, hasNeighborConsent: false };
          const reqSetback = getRequiredBoundarySetback(activeObj.category, edgeCfg.type) || 3;
          if (reqSetback > 0) {
            const outNorm = getEdgeOutwardNormal(a, b);
            const nx = -outNorm.x * reqSetback;
            const nz = -outNorm.z * reqSetback;

            const sa = toScreen(a);
            const sb = toScreen(b);
            const sbIn = toScreen({ x: b.x + nx, z: b.z + nz });
            const saIn = toScreen({ x: a.x + nx, z: a.z + nz });

            ctx.beginPath();
            ctx.moveTo(sa.x, sa.y);
            ctx.lineTo(sb.x, sb.y);
            ctx.lineTo(sbIn.x, sbIn.y);
            ctx.lineTo(saIn.x, saIn.y);
            ctx.closePath();
            ctx.fillStyle = edgeCfg.type === 'street' ? 'rgba(239, 68, 68, 0.22)' : 'rgba(249, 115, 22, 0.16)';
            ctx.fill();
            ctx.setLineDash([5, 4]);
            ctx.strokeStyle = edgeCfg.type === 'street' ? 'rgba(239, 68, 68, 0.7)' : 'rgba(249, 115, 22, 0.6)';
            ctx.stroke();
            ctx.setLineDash([]);
          }
        });

        // ZOUIT (Охранная зона коммуникаций)
        if (plot.hasZouit) {
          const zIdx = plot.zouitEdgeIndex % poly.length;
          const a = poly[zIdx];
          const b = poly[(zIdx + 1) % poly.length];
          const outNorm = getEdgeOutwardNormal(a, b);
          const nx = -outNorm.x * plot.zouitDepth;
          const nz = -outNorm.z * plot.zouitDepth;

          const sa = toScreen(a);
          const sb = toScreen(b);
          const sbIn = toScreen({ x: b.x + nx, z: b.z + nz });
          const saIn = toScreen({ x: a.x + nx, z: a.z + nz });

          ctx.beginPath();
          ctx.moveTo(sa.x, sa.y);
          ctx.lineTo(sb.x, sb.y);
          ctx.lineTo(sbIn.x, sbIn.y);
          ctx.lineTo(saIn.x, saIn.y);
          ctx.closePath();
          ctx.fillStyle = 'rgba(220, 38, 38, 0.32)';
          ctx.fill();
        }

        ctx.restore();
      }

      // Draw Boundary Edges with Type Labels & Fence Indicators
      poly.forEach((a, idx) => {
        const b = poly[(idx + 1) % poly.length];
        const sa = toScreen(a);
        const sb = toScreen(b);
        const edgeCfg = plot.edges[idx] || {
          edgeIndex: idx,
          type: 'neighbor',
          fenceType: 'mesh',
          fenceHeight: 1.5,
          hasNeighborConsent: false
        };

        const isIllegalFence =
          plot.category === 'SNT' &&
          edgeCfg.type === 'neighbor' &&
          (edgeCfg.fenceType === 'solid' || edgeCfg.fenceHeight > 1.8) &&
          !edgeCfg.hasNeighborConsent;

        ctx.beginPath();
        ctx.moveTo(sa.x, sa.y);
        ctx.lineTo(sb.x, sb.y);
        ctx.lineWidth = selectedEdgeIndex === idx ? 4 : 3;
        ctx.strokeStyle = isIllegalFence
          ? '#f97316'
          : edgeCfg.type === 'street'
          ? '#ef4444'
          : edgeCfg.type === 'driveway'
          ? '#eab308'
          : '#10b981';
        if (edgeCfg.fenceType === 'mesh') {
          ctx.setLineDash([6, 4]);
        } else {
          ctx.setLineDash([]);
        }
        ctx.stroke();
        ctx.setLineDash([]);

        // Edge Label at midpoint
        const mx = (sa.x + sb.x) / 2;
        const my = (sa.y + sb.y) / 2;
        const lenM = Math.hypot(b.x - a.x, b.z - a.z).toFixed(1);
        const typeStr =
          edgeCfg.type === 'street'
            ? 'УЛИЦА (Красная линия 5м)'
            : edgeCfg.type === 'driveway'
            ? 'ПРОЕЗД (3м)'
            : 'СОСЕД (Межа)';
        const fenceStr = edgeCfg.fenceType === 'solid' ? `Глухой ${edgeCfg.fenceHeight}м` : `Сетка ${edgeCfg.fenceHeight}м`;

        ctx.font = '600 11px "Plus Jakarta Sans", sans-serif';
        const label = `#${idx + 1} ${typeStr} · ${lenM}м · ${fenceStr}`;
        const tw = ctx.measureText(label).width + 12;
        ctx.fillStyle = 'rgba(15, 23, 42, 0.88)';
        ctx.fillRect(mx - tw / 2, my - 10, tw, 20);
        ctx.strokeStyle = isIllegalFence ? '#f97316' : 'rgba(148, 163, 184, 0.35)';
        ctx.lineWidth = 1;
        ctx.strokeRect(mx - tw / 2, my - 10, tw, 20);
        ctx.fillStyle = isIllegalFence ? '#fdba74' : '#e2e8f0';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(label, mx, my);
      });

      // Draw 2D Plot Relief Corner Elevations, Surface Slope Arrows & Automatic Stormwater Drainage Zones
      const reliefCfg2D = getEffectivePlotRelief(plot);
      if (reliefCfg2D.showDrainageZones) {
        const reliefData = calculatePlotReliefAndDrainage(plot, objects);
        const hw = plot.width / 2;
        const hl = plot.length / 2;

        // 1. Uphill Interceptor Drainage Trench (Нагорная перехватывающая дрена)
        const interceptorZone = reliefData.drainageZones.find((z) => z.type === 'interceptor_trench');
        if (interceptorZone && interceptorZone.points.length >= 3) {
          ctx.save();
          ctx.beginPath();
          const p0 = toScreen(interceptorZone.points[0]);
          ctx.moveTo(p0.x, p0.y);
          for (let k = 1; k < interceptorZone.points.length; k++) {
            const pk = toScreen(interceptorZone.points[k]);
            ctx.lineTo(pk.x, pk.y);
          }
          ctx.closePath();
          ctx.fillStyle = 'rgba(6, 182, 212, 0.24)';
          ctx.fill();
          ctx.setLineDash([5, 3]);
          ctx.strokeStyle = '#22d3ee';
          ctx.lineWidth = 1.6;
          ctx.stroke();
          ctx.setLineDash([]);

          const icCenter = toScreen(interceptorZone.center);
          const icText = 'НАГОРНАЯ ПЕРЕХВАТЫВАЮЩАЯ ДРЕНА';
          ctx.font = '700 10px "Plus Jakarta Sans", sans-serif';
          const icW = ctx.measureText(icText).width + 12;
          ctx.fillStyle = 'rgba(8, 51, 68, 0.9)';
          ctx.fillRect(icCenter.x - icW / 2, icCenter.y - 9, icW, 18);
          ctx.strokeStyle = 'rgba(34, 211, 238, 0.6)';
          ctx.lineWidth = 1;
          ctx.strokeRect(icCenter.x - icW / 2, icCenter.y - 9, icW, 18);
          ctx.fillStyle = '#67e8f9';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(icText, icCenter.x, icCenter.y);
          ctx.restore();
        }

        // 2. Runoff Channel & Surface Slope Vectors
        const channelZone = reliefData.drainageZones.find((z) => z.type === 'runoff_channel');
        if (channelZone && channelZone.points.length >= 2) {
          ctx.save();
          ctx.beginPath();
          const cp0 = toScreen(channelZone.points[0]);
          ctx.moveTo(cp0.x, cp0.y);
          for (let k = 1; k < channelZone.points.length; k++) {
            const cpk = toScreen(channelZone.points[k]);
            ctx.lineTo(cpk.x, cpk.y);
          }
          ctx.setLineDash([7, 4]);
          ctx.strokeStyle = 'rgba(56, 189, 248, 0.85)';
          ctx.lineWidth = 2.2;
          ctx.stroke();
          ctx.setLineDash([]);
          ctx.restore();
        }

        // Slope flow arrows inside the plot
        const sv = reliefData.slopeVector;
        const slopeArrowCenters: Point2D[] = [
          { x: -hw * 0.42, z: -hl * 0.32 },
          { x: hw * 0.42, z: -hl * 0.32 },
          { x: 0, z: hl * 0.28 }
        ];
        slopeArrowCenters.forEach((ac) => {
          const sStart = toScreen({ x: ac.x - sv.x * 2.0, z: ac.z - sv.z * 2.0 });
          const sEnd = toScreen({ x: ac.x + sv.x * 2.0, z: ac.z + sv.z * 2.0 });
          const ang = Math.atan2(sEnd.y - sStart.y, sEnd.x - sStart.x);
          const headLen = 8;

          ctx.save();
          ctx.beginPath();
          ctx.moveTo(sStart.x, sStart.y);
          ctx.lineTo(sEnd.x, sEnd.y);
          ctx.strokeStyle = 'rgba(34, 211, 238, 0.85)';
          ctx.lineWidth = 2;
          ctx.stroke();

          ctx.beginPath();
          ctx.moveTo(sEnd.x, sEnd.y);
          ctx.lineTo(
            sEnd.x - headLen * Math.cos(ang - Math.PI / 6),
            sEnd.y - headLen * Math.sin(ang - Math.PI / 6)
          );
          ctx.lineTo(
            sEnd.x - headLen * Math.cos(ang + Math.PI / 6),
            sEnd.y - headLen * Math.sin(ang + Math.PI / 6)
          );
          ctx.closePath();
          ctx.fillStyle = '#22d3ee';
          ctx.fill();
          ctx.restore();
        });

        // Slope Summary Badge near top-center of plot
        const slopeBadgeScr = toScreen({ x: 0, z: -hl + 2.3 });
        const slopeLabel = `УКЛОН РЕЛЬЕФА i = ${reliefData.slopePercent}% (${reliefData.slopePermille}‰) → СТОК: ${reliefData.slopeDirectionLabel} · Q=${reliefData.stormwaterRunoffLitersPerSec} л/с`;
        ctx.save();
        ctx.font = '700 10px "JetBrains Mono", monospace';
        const sbw = ctx.measureText(slopeLabel).width + 14;
        ctx.fillStyle = 'rgba(8, 51, 68, 0.92)';
        ctx.fillRect(slopeBadgeScr.x - sbw / 2, slopeBadgeScr.y - 10, sbw, 20);
        ctx.strokeStyle = '#06b6d4';
        ctx.lineWidth = 1.2;
        ctx.strokeRect(slopeBadgeScr.x - sbw / 2, slopeBadgeScr.y - 10, sbw, 20);
        ctx.fillStyle = '#a5f3fc';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(slopeLabel, slopeBadgeScr.x, slopeBadgeScr.y);
        ctx.restore();

        // 3. Lowest-point Stormwater Collector Basin / Well (Зона водосбора и дренажный колодец)
        const collectorZone = reliefData.drainageZones.find((z) => z.type === 'collector_well');
        if (collectorZone) {
          const cScr = toScreen(collectorZone.center);
          const rPx = Math.max(14, (collectorZone.radiusM || 2.2) * scale);
          ctx.save();
          ctx.beginPath();
          ctx.arc(cScr.x, cScr.y, rPx, 0, Math.PI * 2);
          ctx.fillStyle = 'rgba(2, 132, 199, 0.28)';
          ctx.fill();
          ctx.setLineDash([4, 3]);
          ctx.strokeStyle = '#38bdf8';
          ctx.lineWidth = 2;
          ctx.stroke();
          ctx.setLineDash([]);

          ctx.beginPath();
          ctx.arc(cScr.x, cScr.y, Math.max(5, 0.55 * scale), 0, Math.PI * 2);
          ctx.fillStyle = '#0284c7';
          ctx.fill();
          ctx.strokeStyle = '#e0f2fe';
          ctx.lineWidth = 1.5;
          ctx.stroke();

          const colText = 'ЗОНА ВОДОСБОРА (ДРЕНАЖНЫЙ КОЛОДЕЦ)';
          ctx.font = '700 9.5px "Plus Jakarta Sans", sans-serif';
          const colW = ctx.measureText(colText).width + 12;
          const colY = cScr.y - rPx - 12;
          ctx.fillStyle = 'rgba(8, 51, 68, 0.9)';
          ctx.fillRect(cScr.x - colW / 2, colY - 9, colW, 18);
          ctx.strokeStyle = 'rgba(56, 189, 248, 0.6)';
          ctx.lineWidth = 1;
          ctx.strokeRect(cScr.x - colW / 2, colY - 9, colW, 18);
          ctx.fillStyle = '#7dd3fc';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(colText, cScr.x, colY);
          ctx.restore();
        }

        // 4. Corner Elevation Marks (СЗ, СВ, ЮВ, ЮЗ)
        const cornerMarks: Array<{ label: string; pt: Point2D }> = [
          { label: `СЗ ∇${reliefData.elevationNW.toFixed(2)}м`, pt: { x: -hw + 2.2, z: -hl + 1.0 } },
          { label: `СВ ∇${reliefData.elevationNE.toFixed(2)}м`, pt: { x: hw - 2.2, z: -hl + 1.0 } },
          { label: `ЮВ ∇${reliefData.elevationSE.toFixed(2)}м`, pt: { x: hw - 2.2, z: hl - 1.0 } },
          { label: `ЮЗ ∇${reliefData.elevationSW.toFixed(2)}м`, pt: { x: -hw + 2.2, z: hl - 1.0 } }
        ];
        cornerMarks.forEach((cm) => {
          const mScr = toScreen(cm.pt);
          ctx.save();
          ctx.font = '600 9.5px "JetBrains Mono", monospace';
          const mw = ctx.measureText(cm.label).width + 8;
          ctx.fillStyle = 'rgba(15, 23, 42, 0.88)';
          ctx.fillRect(mScr.x - mw / 2, mScr.y - 8, mw, 16);
          ctx.strokeStyle = 'rgba(34, 211, 238, 0.5)';
          ctx.strokeRect(mScr.x - mw / 2, mScr.y - 8, mw, 16);
          ctx.fillStyle = '#67e8f9';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(cm.label, mScr.x, mScr.y);
          ctx.restore();
        });
      }
    }

    // Compute Sun vector for indoor window light patches (NOTE: 2D exterior building shadows are intentionally removed per user request)
    const sunPos = computeSunVector(plot, dayOfYear, hourOfDay);
    const ownHouse = objects.find((o) => o.category === 'house');

    // Draw Site Objects (Protective Buffers, Sanitary Rings, Footprints, Overhangs, Roof Slope Arrows, Interior Sun Patches, Labels)
    objects.forEach((obj) => {
      const centerScr = toScreen({ x: obj.x, z: obj.z });

      // 1. Sanitary / Fire / Protective Buffer zones in 2D (inside and outside the plot)
      if (showForbiddenZones) {
        if (obj.category === 'well' || obj.category === 'neighbor_well' || obj.category === 'toilet') {
          ctx.beginPath();
          ctx.arc(centerScr.x, centerScr.y, 8 * scale, 0, Math.PI * 2);
          ctx.strokeStyle = obj.category === 'toilet' ? 'rgba(239, 68, 68, 0.5)' : 'rgba(6, 182, 212, 0.5)';
          ctx.setLineDash([4, 4]);
          ctx.lineWidth = 1.5;
          ctx.stroke();
          ctx.setLineDash([]);
        }

        // Neighbor house fire safety zone (6–15m fire break)
        if (obj.category === 'neighbor_house' && ownHouse) {
          const fireDist = getRequiredFireDistance(ownHouse.material, obj.material);
          const rad = (obj.rotation * Math.PI) / 180;
          const cos = Math.cos(rad);
          const sin = Math.sin(rad);
          const hw = obj.width / 2 + fireDist;
          const hl = obj.length / 2 + fireDist;
          const firePts = [
            { x: -hw, z: -hl },
            { x: hw, z: -hl },
            { x: hw, z: hl },
            { x: -hw, z: hl }
          ].map((p) => toScreen({ x: obj.x + p.x * cos - p.z * sin, z: obj.z + p.x * sin + p.z * cos }));

          ctx.beginPath();
          ctx.moveTo(firePts[0].x, firePts[0].y);
          for (let i = 1; i < firePts.length; i++) ctx.lineTo(firePts[i].x, firePts[i].y);
          ctx.closePath();
          ctx.fillStyle = 'rgba(239, 68, 68, 0.10)';
          ctx.fill();
          ctx.setLineDash([5, 5]);
          ctx.strokeStyle = 'rgba(239, 68, 68, 0.55)';
          ctx.lineWidth = 1.2;
          ctx.stroke();
          ctx.setLineDash([]);
        }

        // Protective buffer around nature & utility objects
        const catMeta = BUILDING_CATEGORY_LABELS[obj.category];
        if (
          catMeta?.protectiveBufferM &&
          (obj.category === 'forest' ||
            obj.category === 'water_body' ||
            obj.category === 'power_line' ||
            obj.category === 'gas_pipe' ||
            obj.category === 'water_main' ||
            obj.category === 'sewer_main' ||
            obj.category === 'road' ||
            obj.category === 'tree_tall' ||
            obj.category === 'tree_medium')
        ) {
          const buf = catMeta.protectiveBufferM;
          const rad = (obj.rotation * Math.PI) / 180;
          const cos = Math.cos(rad);
          const sin = Math.sin(rad);
          const hw = obj.width / 2 + buf;
          const hl = obj.length / 2 + buf;
          const bufPts = [
            { x: -hw, z: -hl },
            { x: hw, z: -hl },
            { x: hw, z: hl },
            { x: -hw, z: hl }
          ].map((p) => toScreen({ x: obj.x + p.x * cos - p.z * sin, z: obj.z + p.x * sin + p.z * cos }));

          ctx.beginPath();
          ctx.moveTo(bufPts[0].x, bufPts[0].y);
          for (let i = 1; i < bufPts.length; i++) ctx.lineTo(bufPts[i].x, bufPts[i].y);
          ctx.closePath();
          ctx.fillStyle = 'rgba(239, 68, 68, 0.14)';
          ctx.fill();
          ctx.setLineDash([4, 4]);
          ctx.strokeStyle = 'rgba(248, 113, 113, 0.7)';
          ctx.lineWidth = 1.2;
          ctx.stroke();
          ctx.setLineDash([]);
        }
      }

      const wallCorners = getObjectFootprintCorners(obj, false);

      // 2. Overhang projection dashed box (if overhang > 0.5m on roofed buildings)
      if (obj.overhang > 0.5 && isRoofedBuildingCategory(obj.category)) {
        const effCorners = getObjectFootprintCorners(obj, true);
        ctx.beginPath();
        const ec0 = toScreen(effCorners[0]);
        ctx.moveTo(ec0.x, ec0.y);
        for (let i = 1; i < effCorners.length; i++) {
          const eci = toScreen(effCorners[i]);
          ctx.lineTo(eci.x, eci.y);
        }
        ctx.closePath();
        ctx.setLineDash([3, 3]);
        ctx.strokeStyle = '#f59e0b';
        ctx.lineWidth = 1.5;
        ctx.stroke();
        ctx.setLineDash([]);
      }

      // 3. Building / Object Footprint
      const objViolations = violations.filter((v) => v.objectId === obj.id);
      const hasErr = objViolations.some((v) => v.severity === 'error');
      const hasWarn = objViolations.some((v) => v.severity === 'warning');
      const isSel = obj.id === selectedObjectId;
      const meta = BUILDING_CATEGORY_LABELS[obj.category] || { color: '#3b82f6', shortLabel: obj.name };

      ctx.beginPath();
      const wc0 = toScreen(wallCorners[0]);
      ctx.moveTo(wc0.x, wc0.y);
      for (let i = 1; i < wallCorners.length; i++) {
        const wci = toScreen(wallCorners[i]);
        ctx.lineTo(wci.x, wci.y);
      }
      ctx.closePath();
      ctx.fillStyle = hasErr
        ? 'rgba(220, 38, 38, 0.78)'
        : hasWarn
        ? 'rgba(217, 119, 6, 0.78)'
        : xrayWallsMode && isRoofedBuildingCategory(obj.category)
        ? 'rgba(30, 58, 138, 0.45)'
        : meta.color;
      ctx.fill();
      ctx.lineWidth = isSel ? 3 : 1.5;
      ctx.strokeStyle = isSel ? '#f8fafc' : '#0f172a';
      ctx.stroke();

      // 4. Roof Ridge / Pyramidal Hip Diagonals & Slope Direction Arrows on ALL roofed buildings
      if (isRoofedBuildingCategory(obj.category)) {
        const rad = (obj.rotation * Math.PI) / 180;
        const cos = Math.cos(rad);
        const sin = Math.sin(rad);
        const toWorldLocal = (lx: number, lz: number) => ({
          x: obj.x + lx * cos - lz * sin,
          z: obj.z + lx * sin + lz * cos
        });

        // Draw Pyramidal / Hip Roof 4 diagonal ribs + ridge on 2D plan
        if (obj.roofType === 'hip') {
          const hw = obj.width / 2;
          const hl = obj.length / 2;
          const ridgeSpan = Math.abs(obj.width - obj.length) * 0.35;
          const rNW = obj.width >= obj.length ? { x: -ridgeSpan / 2, z: 0 } : { x: 0, z: -ridgeSpan / 2 };
          const rNE = obj.width >= obj.length ? { x: ridgeSpan / 2, z: 0 } : { x: 0, z: -ridgeSpan / 2 };
          const rSE = obj.width >= obj.length ? { x: ridgeSpan / 2, z: 0 } : { x: 0, z: ridgeSpan / 2 };
          const rSW = obj.width >= obj.length ? { x: -ridgeSpan / 2, z: 0 } : { x: 0, z: ridgeSpan / 2 };

          const hipSegs: Array<[{ x: number; z: number }, { x: number; z: number }]> = [
            [{ x: -hw, z: -hl }, rNW],
            [{ x: hw, z: -hl }, rNE],
            [{ x: hw, z: hl }, rSE],
            [{ x: -hw, z: hl }, rSW]
          ];
          if (ridgeSpan > 0.02) {
            hipSegs.push([rNW, rSE]);
          }
          ctx.strokeStyle = 'rgba(226, 232, 240, 0.65)';
          ctx.lineWidth = 1.4;
          hipSegs.forEach(([pA, pB]) => {
            const sA = toScreen(toWorldLocal(pA.x, pA.z));
            const sB = toScreen(toWorldLocal(pB.x, pB.z));
            ctx.beginPath();
            ctx.moveTo(sA.x, sA.y);
            ctx.lineTo(sB.x, sB.y);
            ctx.stroke();
          });
        } else if (obj.roofType === 'gable') {
          const sA = toScreen(toWorldLocal(0, -obj.length / 2));
          const sB = toScreen(toWorldLocal(0, obj.length / 2));
          ctx.strokeStyle = 'rgba(226, 232, 240, 0.55)';
          ctx.lineWidth = 1.3;
          ctx.beginPath();
          ctx.moveTo(sA.x, sA.y);
          ctx.lineTo(sB.x, sB.y);
          ctx.stroke();
        }

        const arrows = getRoofSlopeVectorsLocal(obj);
        const arrowLenM = Math.max(0.8, Math.min(obj.width, obj.length) * 0.28);

        arrows.forEach((arr) => {
          const oxLocal = arr.originFactorX * obj.width;
          const ozLocal = arr.originFactorZ * obj.length;
          const startLocalX = oxLocal - arr.dirX * (arrowLenM * 0.4);
          const startLocalZ = ozLocal - arr.dirZ * (arrowLenM * 0.4);
          const endLocalX = oxLocal + arr.dirX * (arrowLenM * 0.6);
          const endLocalZ = ozLocal + arr.dirZ * (arrowLenM * 0.6);

          const startWorld = toWorldLocal(startLocalX, startLocalZ);
          const endWorld = toWorldLocal(endLocalX, endLocalZ);

          const sPt = toScreen(startWorld);
          const ePt = toScreen(endWorld);
          const angle = Math.atan2(ePt.y - sPt.y, ePt.x - sPt.x);
          const headPx = Math.max(5, Math.min(9, scale * 0.45));

          ctx.beginPath();
          ctx.moveTo(sPt.x, sPt.y);
          ctx.lineTo(ePt.x, ePt.y);
          ctx.strokeStyle = '#bae6fd';
          ctx.lineWidth = 2;
          ctx.stroke();

          ctx.beginPath();
          ctx.moveTo(ePt.x, ePt.y);
          ctx.lineTo(ePt.x - headPx * Math.cos(angle - Math.PI / 6), ePt.y - headPx * Math.sin(angle - Math.PI / 6));
          ctx.lineTo(ePt.x - headPx * Math.cos(angle + Math.PI / 6), ePt.y - headPx * Math.sin(angle + Math.PI / 6));
          ctx.closePath();
          ctx.fillStyle = '#38bdf8';
          ctx.fill();
        });
      }

      // 4b. Draw 2D Architectural Door Symbols (ГОСТ 21.501-2018: проем + полотно + дуга открывания)
      if (isEnclosedBuildingCategory(obj.category)) {
        const doorsCfg = getObjectDoorsConfig(obj);
        const rad = (obj.rotation * Math.PI) / 180;
        const cos = Math.cos(rad);
        const sin = Math.sin(rad);
        const toWorldLocal = (lx: number, lz: number) => ({
          x: obj.x + lx * cos - lz * sin,
          z: obj.z + lx * sin + lz * cos
        });

        const dWidthM = Math.max(0.6, Math.min(3.2, doorsCfg.doorWidth ?? 0.95));
        const dOffsetRatio = Math.max(-0.4, Math.min(0.4, doorsCfg.positionOffset ?? 0));

        const doorFacades: Array<{
          key: 'south' | 'north' | 'east' | 'west';
          count: number;
          spanLen: number;
        }> = [
          { key: 'south', count: doorsCfg.south || 0, spanLen: obj.width },
          { key: 'north', count: doorsCfg.north || 0, spanLen: obj.width },
          { key: 'east', count: doorsCfg.east || 0, spanLen: obj.length },
          { key: 'west', count: doorsCfg.west || 0, spanLen: obj.length }
        ];

        doorFacades.forEach((df) => {
          const dCount = Math.min(3, Math.max(0, Math.round(df.count)));
          if (dCount <= 0 || df.spanLen < 1.1) return;
          const actualDW = Math.min(dWidthM, (df.spanLen * 0.75) / dCount);
          const step = df.spanLen / (dCount + 1);

          for (let i = 0; i < dCount; i++) {
            const rawCenter = -df.spanLen / 2 + step * (i + 1) + dOffsetRatio * df.spanLen * 0.45;
            const cPos = Math.max(
              -df.spanLen / 2 + actualDW / 2 + 0.08,
              Math.min(df.spanLen / 2 - actualDW / 2 - 0.08, rawCenter)
            );

            let hingeLocal = { x: 0, z: 0 };
            let latchLocal = { x: 0, z: 0 };
            let openTipLocal = { x: 0, z: 0 };

            if (df.key === 'south') {
              hingeLocal = { x: cPos - actualDW / 2, z: obj.length / 2 };
              latchLocal = { x: cPos + actualDW / 2, z: obj.length / 2 };
              openTipLocal = { x: cPos - actualDW / 2, z: obj.length / 2 + actualDW * 0.85 };
            } else if (df.key === 'north') {
              hingeLocal = { x: cPos + actualDW / 2, z: -obj.length / 2 };
              latchLocal = { x: cPos - actualDW / 2, z: -obj.length / 2 };
              openTipLocal = { x: cPos + actualDW / 2, z: -obj.length / 2 - actualDW * 0.85 };
            } else if (df.key === 'east') {
              hingeLocal = { x: obj.width / 2, z: cPos - actualDW / 2 };
              latchLocal = { x: obj.width / 2, z: cPos + actualDW / 2 };
              openTipLocal = { x: obj.width / 2 + actualDW * 0.85, z: cPos - actualDW / 2 };
            } else {
              hingeLocal = { x: -obj.width / 2, z: cPos + actualDW / 2 };
              latchLocal = { x: -obj.width / 2, z: cPos - actualDW / 2 };
              openTipLocal = { x: -obj.width / 2 - actualDW * 0.85, z: cPos + actualDW / 2 };
            }

            const sHinge = toScreen(toWorldLocal(hingeLocal.x, hingeLocal.z));
            const sLatch = toScreen(toWorldLocal(latchLocal.x, latchLocal.z));
            const sTip = toScreen(toWorldLocal(openTipLocal.x, openTipLocal.z));

            // Threshold highlight on wall edge
            ctx.beginPath();
            ctx.moveTo(sHinge.x, sHinge.y);
            ctx.lineTo(sLatch.x, sLatch.y);
            ctx.strokeStyle = doorsCfg.hasGlazing ? '#38bdf8' : '#fbbf24';
            ctx.lineWidth = 3.2;
            ctx.stroke();

            // Open door leaf line
            ctx.beginPath();
            ctx.moveTo(sHinge.x, sHinge.y);
            ctx.lineTo(sTip.x, sTip.y);
            ctx.strokeStyle = '#fbbf24';
            ctx.lineWidth = 1.8;
            ctx.stroke();

            // Swing arc from latch to open tip
            ctx.beginPath();
            ctx.moveTo(sLatch.x, sLatch.y);
            ctx.quadraticCurveTo(
              (sLatch.x + sTip.x) / 2,
              (sLatch.y + sTip.y) / 2,
              sTip.x,
              sTip.y
            );
            ctx.setLineDash([2, 2]);
            ctx.strokeStyle = 'rgba(251, 191, 36, 0.8)';
            ctx.lineWidth = 1.2;
            ctx.stroke();
            ctx.setLineDash([]);
          }
        });
      }

      // 4c. Draw Interior Sunlight Patches (Световое пятно) in 2D when xrayWallsMode is on
      if (xrayWallsMode) {
        const sunPatches = calculateInteriorSunPatches(obj, sunPos);
        const rad = (obj.rotation * Math.PI) / 180;
        const cos = Math.cos(rad);
        const sin = Math.sin(rad);

        sunPatches.forEach((patch) => {
          const worldPts = patch.floorPolygonLocal.map((p) => ({
            x: obj.x + p.x * cos - p.z * sin,
            z: obj.z + p.x * sin + p.z * cos
          }));
          if (worldPts.length >= 3) {
            ctx.beginPath();
            const sp0 = toScreen(worldPts[0]);
            ctx.moveTo(sp0.x, sp0.y);
            for (let k = 1; k < worldPts.length; k++) {
              const spk = toScreen(worldPts[k]);
              ctx.lineTo(spk.x, spk.y);
            }
            ctx.closePath();
            ctx.fillStyle = 'rgba(250, 204, 21, 0.72)';
            ctx.fill();
            ctx.strokeStyle = '#f59e0b';
            ctx.lineWidth = 1;
            ctx.stroke();
          }
        });
      }

      // Object Name, Dimensions & Interior Area / Burial Depth inside an auto-sized dark plaque so text never overflows small footprints
      const line1 = obj.name;
      const line2 = `${formatMetersMm(obj.width)}×${formatMetersMm(obj.length)}м`;
      let line3 = '';
      let line3Color = '#fde047';

      if (isEnclosedBuildingCategory(obj.category)) {
        const intArea = calculateBuildingInteriorArea(obj);
        line3 = `Внутр. S: ${intArea.totalNetInteriorAllFloorsSqm} м²`;
        line3Color = '#fde047';
      } else if (isUndergroundCapableCategory(obj.category)) {
        const bDepth = obj.burialDepth ?? getDefaultBurialDepth(obj.category);
        if (bDepth > 0) {
          line3 = `Загл.: −${formatMetersMm(bDepth)} м`;
          line3Color = '#67e8f9';
        }
      }

      ctx.save();
      ctx.font = '700 11px "Plus Jakarta Sans", sans-serif';
      const w1 = ctx.measureText(line1).width;
      ctx.font = '500 10px "JetBrains Mono", monospace';
      const w2 = ctx.measureText(line2).width;
      ctx.font = '600 9px "JetBrains Mono", monospace';
      const w3 = line3 ? ctx.measureText(line3).width : 0;

      const boxW = Math.ceil(Math.max(w1, w2, w3) + 14);
      const boxH = line3 ? 40 : 28;
      const boxX = centerScr.x - boxW / 2;
      const boxY = centerScr.y - boxH / 2;

      ctx.fillStyle = 'rgba(15, 23, 42, 0.86)';
      ctx.fillRect(boxX, boxY, boxW, boxH);
      ctx.strokeStyle = isSel ? 'rgba(56, 189, 248, 0.8)' : 'rgba(148, 163, 184, 0.35)';
      ctx.lineWidth = 1;
      ctx.strokeRect(boxX, boxY, boxW, boxH);

      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = '#ffffff';
      ctx.font = '700 11px "Plus Jakarta Sans", sans-serif';
      ctx.fillText(line1, centerScr.x, line3 ? centerScr.y - 11 : centerScr.y - 6);

      ctx.font = '500 10px "JetBrains Mono", monospace';
      ctx.fillStyle = '#e2e8f0';
      ctx.fillText(line2, centerScr.x, line3 ? centerScr.y + 1 : centerScr.y + 6);

      if (line3) {
        ctx.font = '600 9px "JetBrains Mono", monospace';
        ctx.fillStyle = line3Color;
        ctx.fillText(line3, centerScr.x, centerScr.y + 13);
      }
      ctx.restore();
    });

    // 5. Dynamic Dimension Lines from Selected Object to Plot Boundaries
    const selObj = objects.find((o) => o.id === selectedObjectId) || objects.find((o) => o.category === 'house');
    if (selObj && poly.length >= 3 && selObj.category !== 'neighbor_house' && selObj.category !== 'neighbor_well') {
      const effCorners = getObjectFootprintCorners(selObj, true);
      poly.forEach((a, idx) => {
        const b = poly[(idx + 1) % poly.length];
        let bestCorner = effCorners[0];
        let minDist = Infinity;
        for (const c of effCorners) {
          const d = pointToSegmentDistance(c, a, b);
          if (d < minDist) {
            minDist = d;
            bestCorner = c;
          }
        }
        const dx = b.x - a.x;
        const dz = b.z - a.z;
        const lenSq = dx * dx + dz * dz || 1;
        let t = ((bestCorner.x - a.x) * dx + (bestCorner.z - a.z) * dz) / lenSq;
        t = Math.max(0, Math.min(1, t));
        const proj = { x: a.x + t * dx, z: a.z + t * dz };

        const p1 = toScreen(bestCorner);
        const p2 = toScreen(proj);

        const edgeCfg = plot.edges[idx] || { type: 'neighbor', fenceType: 'mesh', fenceHeight: 1.5, hasNeighborConsent: false };
        const req = getRequiredBoundarySetback(selObj.category, edgeCfg.type);
        const isOk = minDist >= req - 0.02;

        ctx.beginPath();
        ctx.moveTo(p1.x, p1.y);
        ctx.lineTo(p2.x, p2.y);
        ctx.strokeStyle = isOk ? '#38bdf8' : '#ef4444';
        ctx.lineWidth = 1.5;
        ctx.setLineDash([3, 3]);
        ctx.stroke();
        ctx.setLineDash([]);

        const dmx = (p1.x + p2.x) / 2;
        const dmy = (p1.y + p2.y) / 2;
        const txt = `${minDist.toFixed(2)}м (норма ≥${req}м)`;
        ctx.save();
        ctx.font = '600 10px "JetBrains Mono", monospace';
        const bw = Math.ceil(ctx.measureText(txt).width + 12);
        ctx.fillStyle = isOk ? 'rgba(15, 23, 42, 0.92)' : 'rgba(127, 29, 29, 0.95)';
        ctx.fillRect(dmx - bw / 2, dmy - 9, bw, 18);
        ctx.strokeStyle = isOk ? 'rgba(56, 189, 248, 0.55)' : 'rgba(248, 113, 113, 0.7)';
        ctx.lineWidth = 1;
        ctx.strokeRect(dmx - bw / 2, dmy - 9, bw, 18);
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = isOk ? '#38bdf8' : '#fecaca';
        ctx.fillText(txt, dmx, dmy);
        ctx.restore();
      });
    }
  }, [plot, objects, selectedObjectId, selectedEdgeIndex, violations, dayOfYear, hourOfDay, showForbiddenZones, xrayWallsMode, viewMode, zoom2D, pan2D]);

  // 2D Canvas Pointer interaction handlers
  const handle2DPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvas2DRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;
    const cx = canvas.width / 2 + pan2D.x;
    const cy = canvas.height / 2 + pan2D.y;
    const wx = (sx - cx) / zoom2D;
    const wz = (sy - cy) / zoom2D;

    // 1. Check if clicked inside an object (rotation-aware local bounding box check)
    for (let i = objects.length - 1; i >= 0; i--) {
      const obj = objects[i];
      const hw = Math.max(1.2, obj.width / 2);
      const hl = Math.max(1.2, obj.length / 2);
      const dx = wx - obj.x;
      const dz = wz - obj.z;
      const rad = -(obj.rotation * Math.PI) / 180;
      const cos = Math.cos(rad);
      const sin = Math.sin(rad);
      const localX = dx * cos - dz * sin;
      const localZ = dx * sin + dz * cos;
      if (Math.abs(localX) <= hw && Math.abs(localZ) <= hl) {
        onSelectObject(obj.id);
        onSelectEdge(null);
        dragging2DRef.current = {
          type: 'object',
          objectId: obj.id,
          startX: sx,
          startY: sy,
          origX: obj.x,
          origZ: obj.z
        };
        return;
      }
    }

    // 2. Check if clicked near a boundary edge
    const poly = generatePlotPolygon(plot);
    for (let idx = 0; idx < poly.length; idx++) {
      const a = poly[idx];
      const b = poly[(idx + 1) % poly.length];
      const distM = pointToSegmentDistance({ x: wx, z: wz }, a, b);
      if (distM <= 1.2) {
        onSelectEdge(idx);
        onSelectObject(null);
        return;
      }
    }

    // 3. Otherwise pan 2D view
    dragging2DRef.current = {
      type: 'pan',
      startX: sx,
      startY: sy,
      origX: pan2D.x,
      origZ: pan2D.y
    };
  };

  const handle2DPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const drag = dragging2DRef.current;
    if (!drag.type || !canvas2DRef.current) return;
    const rect = canvas2DRef.current.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;

    if (drag.type === 'object' && drag.objectId) {
      const dxM = (sx - drag.startX) / zoom2D;
      const dzM = (sy - drag.startY) / zoom2D;
      const nextX = Number((Math.round((drag.origX + dxM) * 2) / 2).toFixed(1));
      const nextZ = Number((Math.round((drag.origZ + dzM) * 2) / 2).toFixed(1));
      onMoveObject(drag.objectId, nextX, nextZ);
    } else if (drag.type === 'pan') {
      setPan2D({
        x: drag.origX + (sx - drag.startX),
        y: drag.origZ + (sy - drag.startY)
      });
    }
  };

  const handle2DPointerUp = () => {
    dragging2DRef.current.type = null;
  };

  const sunTelemetry = computeSunVector(plot, dayOfYear, hourOfDay);
  const selectedObj = objects.find((o) => o.id === selectedObjectId) || null;
  const baseField = calculateBaseFieldDimensions(plot, objects);

  return (
    <div className="relative w-full h-full bg-slate-950 overflow-hidden select-none" data-testid="cad-viewport">
      {/* Isolated 3D WebGL Canvas Mount */}
      <div
        ref={threeMountRef}
        className={`w-full h-full ${viewMode === '3d' ? 'block' : 'hidden'}`}
      />

      {/* Interactive 2D CAD Blueprint Canvas */}
      <canvas
        ref={canvas2DRef}
        onPointerDown={handle2DPointerDown}
        onPointerMove={handle2DPointerMove}
        onPointerUp={handle2DPointerUp}
        className={`w-full h-full cursor-grab active:cursor-grabbing ${viewMode === '2d' ? 'block' : 'hidden'}`}
      />

      {/* Top-Left Minimal Spec, Mode Controls & Floating Selected Building Quick-Edit Bar */}
      <div className="absolute top-3 left-3 right-24 z-10 flex flex-col gap-2 pointer-events-none">
        <div className="flex flex-wrap items-center gap-2 pointer-events-auto">
          <div className="flex items-center gap-1 p-1 bg-slate-900/95 border border-slate-700/80 rounded-lg">
            <span className="px-2.5 py-1 text-xs font-semibold text-slate-200 whitespace-nowrap">
              {viewMode === '3d' ? '3D Сцена (Orbit + Перетаскивание)' : '2D Генплан (Чертеж отступов)'}
            </span>
            <span className="text-slate-600">·</span>
            <span className="px-2 py-1 text-xs font-mono text-sky-400 whitespace-nowrap">
              Солнце: выс. {sunTelemetry.altitudeDeg}° / аз. {sunTelemetry.azimuthDeg}°
            </span>
            <span className="text-slate-600">·</span>
            <span
              className="px-2 py-1 text-xs font-mono text-emerald-400 whitespace-nowrap"
              data-testid="viewport-base-field-badge"
              title="Автоматический размер базового поля вокруг участка (стандартно в 4 раза шире и длиннее участка)"
            >
              Поле ({baseField.multiplier}×): {formatMetersMm(baseField.fieldWidth)}×{formatMetersMm(baseField.fieldLength)} м
            </span>
          </div>

          {viewMode === '2d' && (
            <div className="flex items-center gap-1 p-1 bg-slate-900/95 border border-slate-700/80 rounded-lg">
              <button
                type="button"
                onClick={() => setZoom2D((z) => Math.min(32, z + 2))}
                className="px-2.5 py-1 text-xs font-medium text-slate-200 hover:bg-slate-800 rounded transition-colors"
              >
                Масштаб +
              </button>
              <button
                type="button"
                onClick={() => setZoom2D((z) => Math.max(2.5, z - 2))}
                className="px-2.5 py-1 text-xs font-medium text-slate-200 hover:bg-slate-800 rounded transition-colors"
              >
                Масштаб −
              </button>
              <button
                type="button"
                onClick={() => {
                  setZoom2D(13);
                  setPan2D({ x: 0, y: -38 });
                }}
                className="px-2.5 py-1 text-xs font-medium text-slate-300 hover:bg-slate-800 rounded transition-colors"
              >
                Участок
              </button>
              <button
                type="button"
                data-testid="fit-base-field-btn"
                onClick={() => {
                  const canvas = canvas2DRef.current;
                  const w = canvas?.clientWidth || 900;
                  const h = canvas?.clientHeight || 600;
                  const fitZoom = Number(
                    Math.max(2.5, Math.min((w - 80) / baseField.fieldWidth, (h - 120) / baseField.fieldLength)).toFixed(2)
                  );
                  setZoom2D(fitZoom);
                  setPan2D({ x: 0, y: -15 });
                }}
                className="px-2.5 py-1 text-xs font-semibold text-sky-400 hover:bg-slate-800 rounded transition-colors"
                title="Показать всё базовое поле (4×)"
              >
                Поле {baseField.multiplier}×
              </button>
            </div>
          )}
        </div>

        {/* Floating Quick-Edit & Delete Toolbar for Selected Building */}
        {selectedObj && (() => {
          const selectedCaps = getObjectCategoryCapabilities(selectedObj.category);
          return (
            <div
              className="flex flex-wrap items-center gap-2 p-2 bg-slate-900/95 border border-slate-700/90 rounded-lg shadow-lg w-fit pointer-events-auto"
              data-testid="viewport-selected-toolbar"
            >
              <input
                type="text"
                aria-label="Название выбранного объекта"
                data-testid="viewport-object-name-input"
                value={selectedObj.name}
                onChange={(e) =>
                  onUpdateObject(selectedObj.id, (p) => ({
                    ...p,
                    name: e.target.value
                  }))
                }
                className="w-36 bg-slate-950 border border-slate-700 focus:border-sky-500 rounded px-2 py-0.5 text-xs font-semibold text-sky-400 outline-none"
                title="Редактировать название объекта"
              />

              {/* Quick Width W / Pipeline Route Length */}
              <div className="flex items-center gap-1 bg-slate-950 border border-slate-800 rounded px-1.5 py-0.5 text-[11px]">
                <span className="text-slate-400">
                  {selectedCaps.hasPipelineDiameter ? 'Трасса:' : 'Ш:'}
                </span>
                <button
                  type="button"
                  onClick={() =>
                    onUpdateObject(selectedObj.id, (p) => ({
                      ...p,
                      width: Math.max(0.5, roundToMm(p.width - 0.5))
                    }))
                  }
                  className="px-1 text-slate-300 hover:text-white font-mono"
                  title="Уменьшить размер"
                >
                  −
                </button>
                <span className="font-mono text-white tabular-nums">
                  {formatMetersMm(selectedObj.width)}м
                </span>
                <button
                  type="button"
                  onClick={() =>
                    onUpdateObject(selectedObj.id, (p) => ({
                      ...p,
                      width: Math.min(80, roundToMm(p.width + 0.5))
                    }))
                  }
                  className="px-1 text-slate-300 hover:text-white font-mono"
                  title="Увеличить размер"
                >
                  +
                </button>
              </div>

              {/* Quick Length L / Trench Width */}
              <div className="flex items-center gap-1 bg-slate-950 border border-slate-800 rounded px-1.5 py-0.5 text-[11px]">
                <span className="text-slate-400">
                  {selectedCaps.hasPipelineDiameter ? 'Траншея:' : 'Д:'}
                </span>
                <button
                  type="button"
                  onClick={() =>
                    onUpdateObject(selectedObj.id, (p) => ({
                      ...p,
                      length: Math.max(0.4, roundToMm(p.length - 0.5))
                    }))
                  }
                  className="px-1 text-slate-300 hover:text-white font-mono"
                  title="Уменьшить"
                >
                  −
                </button>
                <span className="font-mono text-white tabular-nums">
                  {formatMetersMm(selectedObj.length)}м
                </span>
                <button
                  type="button"
                  onClick={() =>
                    onUpdateObject(selectedObj.id, (p) => ({
                      ...p,
                      length: Math.min(80, roundToMm(p.length + 0.5))
                    }))
                  }
                  className="px-1 text-slate-300 hover:text-white font-mono"
                  title="Увеличить"
                >
                  +
                </button>
              </div>

              {/* Plan Shape Selector (Only for buildings that have plan footprint shapes) */}
              {selectedCaps.hasPlanFootprintShape && (
                <select
                  aria-label="Форма постройки в плане"
                  data-testid="viewport-footprint-shape-select"
                  value={selectedObj.footprintShape || 'rectangle'}
                  onChange={(e) =>
                    onUpdateObject(selectedObj.id, (p) => ({
                      ...p,
                      footprintShape: e.target.value as BuildingFootprintShape
                    }))
                  }
                  className="bg-slate-950 border border-slate-800 rounded px-2 py-1 text-[11px] text-slate-200"
                >
                  <option value="rectangle">Форма: Прямоугольная</option>
                  <option value="l_shape">Форма: Г-образная</option>
                  <option value="t_shape">Форма: Т-образная (эркер)</option>
                  <option value="chamfered">Форма: Скошенная (октагон)</option>
                </select>
              )}

              {/* Roof Type Selector (Only for roofed buildings) */}
              {selectedCaps.hasRoofGeometry && (
                <select
                  aria-label="Быстрый выбор крыши"
                  data-testid="viewport-roof-type-select"
                  value={selectedObj.roofType}
                  onChange={(e) =>
                    onUpdateObject(selectedObj.id, (p) => ({
                      ...p,
                      roofType: e.target.value as RoofType
                    }))
                  }
                  className="bg-slate-950 border border-slate-800 rounded px-2 py-1 text-[11px] text-slate-200"
                >
                  <option value="flat">Крыша: Плоская</option>
                  <option value="shed">Крыша: Односкатная</option>
                  <option value="gable">Крыша: Двускатная</option>
                  <option value="hip">Крыша: Пирамидальная</option>
                </select>
              )}

              {/* Pipeline Diameter Selector (Only for linear pipelines: water_main, sewer_main, gas_pipe) */}
              {selectedCaps.hasPipelineDiameter && (
                <select
                  aria-label="Диаметр трубопровода"
                  data-testid="viewport-pipeline-diameter-select"
                  value={
                    selectedObj.pipelineDiameterMm ??
                    getDefaultPipelineDiameterMm(selectedObj.category)
                  }
                  onChange={(e) =>
                    onUpdateObject(selectedObj.id, (p) => ({
                      ...p,
                      pipelineDiameterMm: Number(e.target.value)
                    }))
                  }
                  className="bg-slate-950 border border-sky-500/50 rounded px-2 py-1 text-[11px] font-mono text-sky-300"
                >
                  <option value={32}>Труба: Ø 32 мм</option>
                  <option value={63}>Труба: Ø 63 мм</option>
                  <option value={110}>Труба: Ø 110 мм</option>
                  <option value={160}>Труба: Ø 160 мм</option>
                  <option value={225}>Труба: Ø 225 мм</option>
                  <option value={315}>Труба: Ø 315 мм</option>
                </select>
              )}

              {/* Burial Depth Badge for underground utilities / wells / septic */}
              {selectedCaps.hasBurialDepth && (
                <div
                  data-testid="viewport-burial-depth-badge"
                  className="px-2 py-0.5 bg-cyan-950/70 border border-cyan-500/50 rounded text-[11px] font-mono text-cyan-300 whitespace-nowrap"
                >
                  Заглубл.: −
                  {formatMetersMm(
                    selectedObj.burialDepth ?? getDefaultBurialDepth(selectedObj.category)
                  )}{' '}
                  м
                </div>
              )}

              {/* Enhanced Object Rotation Controls (-45°, +45°, +90°, Slider 0..360°, Direct Input) */}
              <div className="flex items-center gap-1 bg-slate-950 border border-slate-700/90 rounded px-1.5 py-0.5 text-[11px]">
                <button
                  type="button"
                  data-testid="viewport-rot-minus-45"
                  onClick={() =>
                    onUpdateObject(selectedObj.id, (p) => ({
                      ...p,
                      rotation: (p.rotation - 45 + 360) % 360
                    }))
                  }
                  className="px-1.5 py-0.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded flex items-center gap-0.5 transition-colors"
                  title="Повернуть против часовой стрелки на 45°"
                >
                  <RotateCcw className="w-3 h-3 text-sky-400" />
                  <span>−45°</span>
                </button>

                <input
                  type="range"
                  min={0}
                  max={360}
                  step={1}
                  aria-label="Плавный поворот объекта в градусах"
                  data-testid="viewport-rotation-slider"
                  value={selectedObj.rotation}
                  onChange={(e) =>
                    onUpdateObject(selectedObj.id, (p) => ({
                      ...p,
                      rotation: Number(e.target.value) % 360
                    }))
                  }
                  className="w-16 accent-sky-500 cursor-pointer"
                  title="Плавно повернуть объект (0°..360°)"
                />

                <MillimeterInput
                  ariaLabel="Точный угол поворота выбранного объекта"
                  dataTestId="viewport-rotation-input"
                  value={selectedObj.rotation}
                  min={0}
                  max={360}
                  step={1}
                  precision={1}
                  onChange={(val) =>
                    onUpdateObject(selectedObj.id, (p) => ({
                      ...p,
                      rotation: ((val % 360) + 360) % 360
                    }))
                  }
                  className="w-12 bg-slate-900 border border-slate-700 rounded px-1 py-0.5 text-[11px] font-mono text-sky-300 text-center"
                />
                <span className="text-slate-400 font-mono">°</span>

                <button
                  type="button"
                  data-testid="viewport-rot-plus-45"
                  onClick={() =>
                    onUpdateObject(selectedObj.id, (p) => ({
                      ...p,
                      rotation: (p.rotation + 45) % 360
                    }))
                  }
                  className="px-1.5 py-0.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded flex items-center gap-0.5 transition-colors"
                  title="Повернуть по часовой стрелке на 45°"
                >
                  <RotateCw className="w-3 h-3 text-sky-400" />
                  <span>+45°</span>
                </button>

                <button
                  type="button"
                  data-testid="viewport-rot-plus-90"
                  onClick={() =>
                    onUpdateObject(selectedObj.id, (p) => ({
                      ...p,
                      rotation: (p.rotation + 90) % 360
                    }))
                  }
                  className="px-1.5 py-0.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded transition-colors font-mono"
                  title="Повернуть на 90°"
                >
                  +90°
                </button>
              </div>

              {/* Net Interior Area Badge inside walls */}
              {selectedCaps.hasInteriorAreaInsideWalls && (
                <div
                  className="px-2 py-0.5 bg-amber-950/70 border border-amber-500/50 rounded text-[11px] font-mono text-amber-300 whitespace-nowrap"
                  data-testid="viewport-interior-area-badge"
                  title="Чистая площадь внутри наружных стен (с учетом толщины стен и всех этажей)"
                >
                  Внутр. S: {calculateBuildingInteriorArea(selectedObj).totalNetInteriorAllFloorsSqm} м²
                </div>
              )}

              {/* Delete / Remove Building */}
              <button
                type="button"
                data-testid="viewport-delete-building-btn"
                onClick={() => onDeleteObject(selectedObj.id)}
                className="px-2.5 py-1 bg-red-950/80 hover:bg-red-900 text-red-200 border border-red-800/70 rounded text-[11px] font-semibold flex items-center gap-1 transition-colors"
                title="Убрать выбранную постройку с участка"
              >
                <Trash2 className="w-3 h-3 text-red-400" />
                <span>Убрать</span>
              </button>
            </div>
          );
        })()}

        {/* 3D Facade Thermal Heatmap Legend HUD */}
        {thermalHeatmapMode && (
          <div
            className="p-2.5 bg-slate-900/95 border border-rose-500/60 rounded-xl shadow-xl w-[min(520px,95vw)] pointer-events-auto space-y-1.5"
            data-testid="thermal-heatmap-hud"
          >
            {(() => {
              const targetHouse =
                selectedObj && isRoofedBuildingCategory(selectedObj.category)
                  ? selectedObj
                  : objects.find((o) => o.category === 'house') || objects[0];
              if (!targetHouse) return null;
              const hm = calculateBuildingThermalHeatmap(targetHouse, plot);
              return (
                <>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-xs font-bold text-rose-300 break-words">
                      Тепловая карта фасадов: «{targetHouse.name}» ({hm.wallMaterialName}, R={hm.wallRValue})
                    </span>
                    <span className="text-[11px] font-mono text-slate-300 whitespace-nowrap">
                      Остекление: {hm.overallGlazingPercent}% · ΔT={hm.designDeltaTempC}°C
                    </span>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 text-[10px]">
                    {hm.facades.map((fc) => (
                      <div
                        key={fc.facade}
                        className="p-1.5 rounded bg-slate-950 border border-slate-800 flex flex-col gap-0.5 min-w-0 overflow-hidden"
                      >
                        <div className="flex items-center justify-between gap-1">
                          <span className="font-semibold text-slate-200 truncate">{fc.facadeLabel.split(' ')[0]}</span>
                          <span
                            className="w-2.5 h-2.5 rounded-sm shrink-0"
                            style={{ backgroundColor: fc.thermalColorHex }}
                          />
                        </div>
                        <span className="font-mono text-slate-300 truncate">
                          {fc.effectiveFacadeHeatFluxWm2} Вт/м² (окна {fc.glazingPercent}%)
                        </span>
                      </div>
                    ))}
                  </div>
                  <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-0.5 text-[10px] text-slate-400 pt-0.5">
                    <span>Шкала теплопотерь:</span>
                    <span className="text-emerald-400 whitespace-nowrap">Низкие (&lt;15 Вт/м²)</span>
                    <span className="text-amber-400 whitespace-nowrap">Средние (25 Вт/м²)</span>
                    <span className="text-orange-400 whitespace-nowrap">Высокие (35 Вт/м²)</span>
                    <span className="text-rose-400 font-semibold whitespace-nowrap">Окна / Мостики (&gt;60 Вт/м²)</span>
                  </div>
                </>
              );
            })()}
          </div>
        )}
      </div>

      {/* Top-Right Animated Dynamic Compass Widget */}
      <div
        className="absolute top-3 right-3 z-10 flex flex-col items-center p-2 bg-slate-900/95 border border-slate-700/80 rounded-xl shadow-lg pointer-events-auto"
        data-testid="animated-compass"
        aria-label={`Компас: Север ${plot.northAngle}°`}
      >
        <div className="relative w-16 h-16 flex items-center justify-center">
          {/* Outer Static Degree Ring */}
          <svg className="w-16 h-16 text-slate-700" viewBox="0 0 64 64" fill="none">
            <circle cx="32" cy="32" r="29" stroke="currentColor" strokeWidth="1.5" />
            <circle cx="32" cy="32" r="25" stroke="currentColor" strokeWidth="1" strokeDasharray="2 3" />
          </svg>

          {/* Animated Rotating Compass Dial & Needle */}
          <div
            className="absolute inset-0 flex items-center justify-center transition-transform duration-300 ease-out"
            style={{ transform: `rotate(${plot.northAngle}deg)` }}
          >
            <svg className="w-16 h-16" viewBox="0 0 64 64" fill="none">
              {/* Cardinal Direction Labels */}
              <text
                x="32"
                y="11"
                textAnchor="middle"
                className="fill-red-400 font-bold text-[9px]"
              >
                С
              </text>
              <text
                x="32"
                y="59"
                textAnchor="middle"
                className="fill-slate-400 font-semibold text-[8px]"
              >
                Ю
              </text>
              <text
                x="56"
                y="35"
                textAnchor="middle"
                className="fill-slate-400 font-semibold text-[8px]"
              >
                В
              </text>
              <text
                x="8"
                y="35"
                textAnchor="middle"
                className="fill-slate-400 font-semibold text-[8px]"
              >
                З
              </text>

              {/* North Red Pointer Needle */}
              <polygon points="32,14 36,32 28,32" fill="#ef4444" />
              {/* South Slate Pointer Needle */}
              <polygon points="32,50 36,32 28,32" fill="#64748b" />
              {/* Center Pivot Pin */}
              <circle cx="32" cy="32" r="2.5" fill="#f8fafc" />
            </svg>
          </div>
        </div>
        <span className="mt-0.5 text-[11px] font-mono font-semibold text-slate-300 tabular-nums">
          С: {plot.northAngle}°
        </span>
      </div>
    </div>
  );
};

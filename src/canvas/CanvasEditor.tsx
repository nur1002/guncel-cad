import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useStore, type Selection } from "../engine/core/store";
import * as M from "../engine/core/mutations";
import { hitTestComponent, hitTestCorner, hitTestRoom, hitTestWall } from "../engine/drawing/hitTest";
import {
  drawBackgroundImage,
  drawVectorTrace,
  drawComponent,
  drawCornerHandle,
  drawDimension,
  drawDraftChain,
  drawFloorComponent,
  drawMarquee,
  drawReferenceGrid,
  drawRoomDraft,
  drawRoomChainPreview,
  drawGrid,
  drawParselBoundary,
  drawMeasurePreview,
  drawRoom,
  drawSmartGuides,
  drawSnapIndicator,
  drawTextAnnotations,
  drawWall,
  drawGhostWallPreview,
  screenToWorld,
  wallQuad,
  worldToScreen,
  roomPolygon,
  roomAreaM2,
  type View2D,
} from "../engine/drawing/render2d";
import type { FloorVariantData, ID } from "../data/model";
import {
  applyTransform,
  dist,
  pointInRotatedRect,
  projectPointToSegment,
  snapToGrid,
  polygonCentroid,
  type Pt,
} from "../engine/drawing/geometry";
import { computeSmartGuides, resolveSnapPoint, type GuideLine, type SnapKind } from "../engine/drawing/snapping";
import { getRoomType, DEFAULT_ROOM_TYPE_ID } from "../data/roomTypes";
import ContextMenu, { type ContextMenuItem } from "./ContextMenu";

interface CanvasEditorProps {
  // Stage 2'nin kendi FloorTabsBar'ı / Stage 1'in sade önizleme alanı sayfa
  // sekmesi ve cetvel şeridini tekrar çizmesin diye eklendi — çizim/pointer
  // mantığı bu prop'lardan etkilenmez, yalnızca bu iki üst şerit gizlenir.
  showPageTabs?: boolean;
  showRulers?: boolean;
}

export default function CanvasEditor({ showPageTabs = true, showRulers = true }: CanvasEditorProps = {}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 800, height: 600 });

  const activeTool = useStore((s) => s.activeTool);
  const nextWallThickness = useStore((s) => s.nextWallThickness);
  const pxPerCm = useStore((s) => s.px_per_cm);
  const pan = useStore((s) => s.pan);
  const pendingPlacement = useStore((s) => s.pendingPlacement);
  const selection = useStore((s) => s.selection);
  const layerVisibility = useStore((s) => s.layerVisibility);
  const planMode = useStore((s) => s.planMode);
  const roomTypes = useStore((s) => s.roomTypes);
  const activeRoomTypeId = useStore((s) => s.activeRoomTypeId);
  const setChainDrawingActive = useStore((s) => s.setChainDrawingActive);
  const catalog = useStore((s) => s.catalog);
  const fitRequestId = useStore((s) => s.fitRequestId);
  const showRaster = useStore((s) => s.showRaster);
  const setCursorWorld = useStore((s) => s.setCursorWorld);
  const cursorWorld = useStore((s) => s.cursorWorld);
  const parsel = useStore((s) => s.parsel);
  const pages = useStore((s) => s.pages);
  const activePageId = useStore((s) => s.activePageId);
  const setActivePageId = useStore((s) => s.setActivePageId);
  const createPage = useStore((s) => s.createPage);
  const currentPage = pages.find((p) => p.id === activePageId) || pages[0];
  const variant = currentPage.drawing;
  const otherFloorsMode = useStore((s) => s.otherFloorsMode);
  const gridVisible = useStore((s) => s.gridVisible);
  const gridStepCm = useStore((s) => s.gridStepCm);
  const gridSnapEnabled = useStore((s) => s.gridSnapEnabled);
  const snapEnabled = useStore((s) => s.snapEnabled);
  const wallRenderMode = useStore((s) => s.wallRenderMode);
  const pushToast = useStore((s) => s.pushToast);
  const calibrationMode = useStore((s) => s.calibrationMode);
  const setCalibrationMode = useStore((s) => s.setCalibrationMode);
  const areaUpdateMode = useStore((s) => s.areaUpdateMode);
  const setAreaUpdateMode = useStore((s) => s.setAreaUpdateMode);

  const setSelection = useStore((s) => s.setSelection);
  const selectSingle = useStore((s) => s.selectSingle);
  const toggleMultiSelect = useStore((s) => s.toggleMultiSelect);
  const setMultiSelection = useStore((s) => s.setMultiSelection);
  const multiSelection = useStore((s) => s.multiSelection);
  const deleteSelection = useStore((s) => s.deleteSelection);
  const copySelectionToClipboard = useStore((s) => s.copySelectionToClipboard);
  const pasteClipboard = useStore((s) => s.pasteClipboard);
  const setZoom = useStore((s) => s.setZoom);
  const setPan = useStore((s) => s.setPan);
  const updateVariant = useStore((s) => s.updateVariant);
  const mutateVariantLive = useStore((s) => s.mutateVariantLive);
  const commitPendingChange = useStore((s) => s.commitPendingChange);

  const [hovered, setHovered] = useState<{ type: string; id: ID } | null>(null);
  const [pointerScreen, setPointerScreen] = useState<{ x: number; y: number } | null>(null);
  const [areaUpdateRoomId, setAreaUpdateRoomId] = useState<ID | null>(null);
  const [targetAreaInput, setTargetAreaInput] = useState<string>("");
  const lastPanDraggedRef = useRef(false);
  const bgImageCacheRef = useRef<Map<string, HTMLImageElement>>(new Map());
  const dragCornerRef = useRef<{ id: ID; before: FloorVariantData } | null>(null);
  const dragFloorComponentRef = useRef<{ id: ID; before: FloorVariantData } | null>(null);
  const panRef = useRef<{ startScreen: Pt; startPan: Pt } | null>(null);
  const measureRef = useRef<Pt | null>(null);
  const [measureLine, setMeasureLine] = useState<{ a: Pt; b: Pt } | null>(null);

  const groupDragRef = useRef<{
    cornerStarts: Map<ID, Pt>;
    floorCompStarts: Map<ID, Pt>;
    startWorld: Pt;
    before: FloorVariantData;
  } | null>(null);

  // Transient refs to prevent high-frequency React re-renders during mouse move
  const liveSnapRef = useRef<{ point: Pt; kind: SnapKind } | null>(null);
  const liveGuidesRef = useRef<GuideLine[]>([]);
  const wallDragRef = useRef<{ anchorCornerId: ID | null; anchorWorld: Pt; rawStartWorld: Pt } | null>(null);
  const wallDragEndRef = useRef<Pt | null>(null);
  const placeDragStartRef = useRef<Pt | null>(null);
  const roomDragRef = useRef<Pt | null>(null);
  const roomDragEndRef = useRef<Pt | null>(null);
  // "room" aracı artık varsayılan olarak serbest-çizgi (tık-tık-tık) çokgen modunda çalışır;
  // "roomRect" ayrı bir araç olarak eski dikdörtgen-sürükleme modelini korur (kullanıcı seçerse).
  const roomChainPointsRef = useRef<Pt[]>([]);
  const roomChainCursorRef = useRef<Pt | null>(null);
  const polyDragRef = useRef<Pt | null>(null);
  const polyDragEndRef = useRef<Pt | null>(null);
  const marqueeRef = useRef<Pt | null>(null);
  const marqueeEndRef = useRef<Pt | null>(null);
  const calibrationPointRef = useRef<Pt | null>(null);
  // DWG/DXF krokisi (§ "Bounding box → parsel merkezi → sürükle → döndür → Parsele
  // Yerleştir"): konum sürükleme ve döndürme kolu sürüklemesi için ayrı ref'ler.
  const traceDragRef = useRef<{ startWorld: Pt; startX: number; startY: number; before: FloorVariantData } | null>(null);
  const traceRotateRef = useRef<{ centerScreen: Pt; startAngle: number; startRotationDeg: number; before: FloorVariantData } | null>(
    null
  );

  const [contextMenu, setContextMenu] = useState<{
    screenX: number;
    screenY: number;
    worldPt: Pt;
    target: Selection;
  } | null>(null);

  const view: View2D = useMemo(
    () => ({ pxPerCm, pan, width: size.width, height: size.height }),
    [pxPerCm, pan, size]
  );

  // Cetvel (ruler) çentikleri: gerçek pan/zoom durumuna göre dinamik hesaplanır
  // (önceden sabit, statik bir dizi olduğu için ekran kaydırılınca/yakınlaştırılınca
  // gösterilen sayılar gerçek dünya koordinatlarıyla uyuşmuyordu).
  const RULER_STEP_CANDIDATES = [10, 25, 50, 100, 200, 250, 500, 1000, 2000, 2500, 5000, 10000, 20000, 50000, 100000];
  const pickRulerStep = (pxPerCmVal: number, minPx = 55) => {
    for (const step of RULER_STEP_CANDIDATES) {
      if (step * pxPerCmVal >= minPx) return step;
    }
    return RULER_STEP_CANDIDATES[RULER_STEP_CANDIDATES.length - 1];
  };
  const hRulerTicks = useMemo(() => {
    if (view.pxPerCm <= 0) return [];
    const step = pickRulerStep(view.pxPerCm);
    const worldStart = Math.floor(-view.pan.x / view.pxPerCm / step) * step;
    const worldEnd = Math.ceil((size.width - view.pan.x) / view.pxPerCm / step) * step;
    const ticks: { val: number; screenX: number }[] = [];
    for (let v = worldStart; v <= worldEnd; v += step) {
      ticks.push({ val: v, screenX: view.pan.x + v * view.pxPerCm });
    }
    return ticks;
  }, [view.pan.x, view.pxPerCm, size.width]);
  const vRulerTicks = useMemo(() => {
    if (view.pxPerCm <= 0) return [];
    const step = pickRulerStep(view.pxPerCm);
    const worldStart = Math.floor(-view.pan.y / view.pxPerCm / step) * step;
    const worldEnd = Math.ceil((size.height - view.pan.y) / view.pxPerCm / step) * step;
    const ticks: { val: number; screenY: number }[] = [];
    for (let v = worldStart; v <= worldEnd; v += step) {
      ticks.push({ val: v, screenY: view.pan.y + v * view.pxPerCm });
    }
    return ticks;
  }, [view.pan.y, view.pxPerCm, size.height]);

  // Throttled cursor update for BottomBar to eliminate UI lag
  const lastCursorUpdateRef = useRef(0);
  const updateCursorThrottled = useCallback(
    (pt: Pt) => {
      const now = performance.now();
      if (now - lastCursorUpdateRef.current > 40) {
        lastCursorUpdateRef.current = now;
        setCursorWorld(pt);
      }
    },
    [setCursorWorld]
  );

  // Resize Observer
  useEffect(() => {
    const el = wrapperRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) {
        setSize({ width: entry.contentRect.width, height: entry.contentRect.height });
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Fit to screen
  useEffect(() => {
    if (fitRequestId === 0) return;
    const xs: number[] = [];
    const ys: number[] = [];
    for (const c of Object.values(variant.corners)) {
      xs.push(c.x);
      ys.push(c.y);
    }
    // İçe aktarılan DWG/DXF krokisi Wall/Corner üretmez (§ "otomatik tanıma yapmasın"),
    // bu yüzden yalnızca corners'a bakmak krokiyi görünmez bırakıyordu — döndürülmüş
    // bbox'ın 4 köşesi de sınırlara dahil edilir.
    const trace = variant.vectorTrace;
    if (trace && trace.segments.length > 0) {
      const halfW = trace.widthCm / 2;
      const halfH = trace.heightCm / 2;
      for (const [lx, ly] of [
        [-halfW, -halfH],
        [halfW, -halfH],
        [halfW, halfH],
        [-halfW, halfH],
      ]) {
        const p = applyTransform({ x: lx, y: ly }, trace);
        xs.push(p.x);
        ys.push(p.y);
      }
    }
    if (xs.length === 0) return;
    const minX = Math.min(...xs) - 100;
    const maxX = Math.max(...xs) + 100;
    const minY = Math.min(...ys) - 100;
    const maxY = Math.max(...ys) + 100;
    const w = Math.max(1, maxX - minX);
    const h = Math.max(1, maxY - minY);
    const scale = Math.min(size.width / w, size.height / h, 4);
    setZoom(scale);
    setPan({
      x: size.width / 2 - ((minX + maxX) / 2) * scale,
      y: size.height / 2 - ((minY + maxY) / 2) * scale,
    });
  }, [fitRequestId]);

  // Canvas RAF rendering loop for ultra-smooth 60 FPS performance
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = size.width * dpr;
    canvas.height = size.height * dpr;
    canvas.style.width = `${size.width}px`;
    canvas.style.height = `${size.height}px`;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animId = 0;
    const render = () => {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, size.width, size.height);

      const isMultiSelected = (type: Selection["type"], id: string) =>
        multiSelection.some((s) => s.type === type && s.id === id);

      drawGrid(ctx, view, { visible: gridVisible, baseStepCm: gridStepCm });
      drawParselBoundary(ctx, view, parsel);

      // Render reference ghost pages (pages where visible === true and id !== activePageId)
      for (const p of pages) {
        if (!p.visible || p.id === activePageId) continue;
        const otherVariant = p.drawing;
        ctx.save();
        ctx.globalAlpha = p.opacity;
        for (const wall of Object.values(otherVariant.walls)) {
          const a = otherVariant.corners[wall.a];
          const b = otherVariant.corners[wall.b];
          if (!a || !b) continue;
          const quad = wallQuad(a, b, wall.thickness).map((pt) => worldToScreen(view, pt));
          ctx.beginPath();
          quad.forEach((pt, i) => (i === 0 ? ctx.moveTo(pt.x, pt.y) : ctx.lineTo(pt.x, pt.y)));
          ctx.closePath();
          ctx.fillStyle = "#64748B";
          ctx.fill();
        }
        ctx.restore();
      }

      if (variant.backgroundImage && showRaster) {
        const bg = variant.backgroundImage;
        let img = bgImageCacheRef.current.get(bg.dataUrl);
        if (!img) {
          img = new Image();
          img.src = bg.dataUrl;
          bgImageCacheRef.current.set(bg.dataUrl, img);
        }
        if (img.complete) {
          drawBackgroundImage(ctx, view, img, bg.xCm, bg.yCm, bg.widthCm, bg.heightCm, bg.opacity);
        }
      }

      if (variant.vectorTrace) {
        drawVectorTrace(ctx, view, variant.vectorTrace, traceDragRef.current !== null);
      }

      if (planMode !== "duvarlar" && layerVisibility["alanlar"] !== false) {
        for (const room of Object.values(variant.rooms)) {
          const roomSelected = (selection?.type === "room" && selection.id === room.id) || isMultiSelected("room", room.id);
          drawRoom(ctx, view, room, variant.corners, getRoomType(roomTypes, room.typeId), roomSelected);

          if (areaUpdateMode) {
            const wpts = roomPolygon(room, variant.corners);
            if (wpts.length >= 3) {
              const spts = wpts.map(p => worldToScreen(view, p));
              ctx.save();
              ctx.strokeStyle = "#F59E0B";
              ctx.lineWidth = 2.5;
              ctx.setLineDash([6, 4]);
              ctx.beginPath();
              spts.forEach((pt, idx) => idx === 0 ? ctx.moveTo(pt.x, pt.y) : ctx.lineTo(pt.x, pt.y));
              ctx.closePath();
              ctx.stroke();

              const centroid = worldToScreen(view, polygonCentroid(wpts));
              ctx.font = "bold 9px system-ui, sans-serif";
              ctx.fillStyle = "#F59E0B";
              ctx.textAlign = "center";
              ctx.textBaseline = "middle";
              ctx.fillText("⚡ ALAN GÜNCELLE", centroid.x, centroid.y - 28);
              ctx.restore();
            }
          }
        }
      }

      if (layerVisibility["bolme_duvarlar"] !== false && layerVisibility["duvar"] !== false) {
        for (const wall of Object.values(variant.walls)) {
          const a = variant.corners[wall.a];
          const b = variant.corners[wall.b];
          if (!a || !b) continue;
          const wallSelected = (selection?.type === "wall" && selection.id === wall.id) || isMultiSelected("wall", wall.id);
          drawWall(ctx, view, wall, a, b, wallSelected, hovered?.type === "wall" && hovered.id === wall.id, undefined, undefined, wallRenderMode);
          drawDimension(ctx, view, a, b);
        }
      }

      if (planMode !== "duvarlar") {
        for (const comp of Object.values(variant.components)) {
          if (layerVisibility[comp.tip] === false) continue;
          const isSelected = (selection?.type === "component" && selection.id === comp.id) || isMultiSelected("component", comp.id);
          if (comp.konum.kind === "zemin") {
            const width = Number(comp.oznitelikler["genislik"] ?? 60);
            const depth = Number(comp.oznitelikler["derinlik"] ?? 60);
            drawFloorComponent(ctx, view, comp, comp.konum, comp.konum.rotationDeg, width, depth, isSelected);
            continue;
          }
          const wall = variant.walls[comp.konum.duvarId];
          if (!wall) continue;
          const a = variant.corners[wall.a];
          const b = variant.corners[wall.b];
          if (!a || !b) continue;
          const width = Number(comp.oznitelikler["genislik"] ?? 80);
          drawComponent(ctx, view, comp, a, b, wall.thickness, width, comp.konum.offsetCm, isSelected);
        }
        drawTextAnnotations(ctx, view, variant);
      }

      if (activeTool === "wall" && wallDragRef.current && wallDragEndRef.current) {
        drawGhostWallPreview(ctx, view, wallDragRef.current.anchorWorld, wallDragEndRef.current, nextWallThickness);
        drawDraftChain(ctx, view, [wallDragRef.current.anchorWorld], wallDragEndRef.current);
      }

      if (activeTool === "roomRect" && roomDragRef.current && roomDragEndRef.current) {
        drawRoomDraft(ctx, view, roomDragRef.current, roomDragEndRef.current);
      }

      if (activeTool === "room" && roomChainPointsRef.current.length > 0) {
        const activeTypeConfig = roomTypes.find((r) => r.id === activeRoomTypeId);
        drawRoomChainPreview(ctx, view, roomChainPointsRef.current, roomChainCursorRef.current, activeTypeConfig?.color ?? "#3B82F688");
      }

      if (activeTool === "polygon" && polyDragRef.current && polyDragEndRef.current) {
        const center = polyDragRef.current;
        const radius = dist(center, polyDragEndRef.current);
        const sides = useStore.getState().polygonSides || 6;
        if (radius > 5) {
          const pts: Pt[] = [];
          for (let i = 0; i < sides; i++) {
            const angle = (i * 2 * Math.PI) / sides - Math.PI / 2;
            pts.push({ x: center.x + radius * Math.cos(angle), y: center.y + radius * Math.sin(angle) });
          }
          for (let i = 0; i < sides; i++) {
            drawDraftChain(ctx, view, [pts[i]], pts[(i + 1) % sides]);
          }
        }
      }

      if (marqueeRef.current && marqueeEndRef.current) {
        drawMarquee(ctx, view, marqueeRef.current, marqueeEndRef.current);
      }

      if (activeTool === "place" && placeDragStartRef.current && cursorWorld) {
        const p0 = worldToScreen(view, placeDragStartRef.current);
        const p1 = worldToScreen(view, cursorWorld);
        ctx.save();
        ctx.strokeStyle = "#3B82F6";
        ctx.lineWidth = 1.5;
        ctx.setLineDash([4, 4]);
        ctx.strokeRect(p0.x, p0.y, p1.x - p0.x, p1.y - p0.y);
        ctx.restore();
      }

      if (measureLine) {
        drawMeasurePreview(ctx, view, measureLine.a, measureLine.b);
      }

      Object.values(variant.corners).forEach((corner, i) => {
        const cornerSelected = (selection?.type === "corner" && selection.id === corner.id) || isMultiSelected("corner", corner.id);
        drawCornerHandle(ctx, view, corner, cornerSelected, hovered?.type === "corner" && hovered.id === corner.id, i + 1);
      });

      if (liveGuidesRef.current.length > 0) drawSmartGuides(ctx, view, liveGuidesRef.current);
      if (liveSnapRef.current) drawSnapIndicator(ctx, view, liveSnapRef.current.point, liveSnapRef.current.kind);
      if (calibrationPointRef.current) drawSnapIndicator(ctx, view, calibrationPointRef.current, "corner");

      drawReferenceGrid(ctx, view);

      animId = requestAnimationFrame(render);
    };

    render();
    return () => cancelAnimationFrame(animId);
  }, [
    size,
    view,
    gridVisible,
    gridStepCm,
    otherFloorsMode,
    pages,
    activePageId,
    variant,
    showRaster,
    planMode,
    layerVisibility,
    roomTypes,
    activeRoomTypeId,
    selection,
    hovered,
    activeTool,
    measureLine,
    multiSelection,
  ]);

  const getWorldFromEvent = useCallback(
    (e: React.PointerEvent): Pt => {
      const rect = canvasRef.current!.getBoundingClientRect();
      const screenPt = { x: e.clientX - rect.left, y: e.clientY - rect.top };
      return screenToWorld(view, screenPt);
    },
    [view]
  );

  const snapWorldPoint = useCallback(
    (raw: Pt) =>
      resolveSnapPoint(raw, variant, {
        pxPerCm: view.pxPerCm,
        snapEnabled,
        gridSnapEnabled,
        gridStepCm,
      }),
    [variant, view.pxPerCm, snapEnabled, gridSnapEnabled, gridStepCm]
  );

  const guideSnap = useCallback(
    (raw: Pt, anchor: Pt | null) =>
      computeSmartGuides(raw, variant, {
        pxPerCm: view.pxPerCm,
        snapEnabled,
        gridSnapEnabled,
        gridStepCm,
        anchor,
        guideExtentCm: Math.max(view.width, view.height) / view.pxPerCm + 2000,
      }),
    [variant, view.pxPerCm, view.width, view.height, snapEnabled, gridSnapEnabled, gridStepCm]
  );

  const findSubtype = useCallback(
    (tip: string, subtypeId: string) => {
      const cat = catalog.find((c) => c.id === tip);
      return cat?.subtypes.find((s) => s.id === subtypeId) ?? null;
    },
    [catalog]
  );

  // Enhanced wall finder for smooth door & window placement
  const findNearestWallForPlacement = (worldPt: Pt) => {
    let bestId: ID | null = null;
    let bestDist = Infinity;
    for (const w of Object.values(variant.walls)) {
      const a = variant.corners[w.a];
      const b = variant.corners[w.b];
      if (!a || !b) continue;
      const proj = projectPointToSegment(worldPt, a, b);
      const tolerance = w.thickness / 2 + 35; // 35 cm tolerance for easy door/window placement
      if (proj.distance <= tolerance && proj.distance < bestDist) {
        bestId = w.id;
        bestDist = proj.distance;
      }
    }
    return bestId;
  };

  const onPointerDown = (e: React.PointerEvent) => {
    const worldPt = getWorldFromEvent(e);
    try {
      (e.target as Element).setPointerCapture(e.pointerId);
    } catch {}

    if (e.button === 2) {
      panRef.current = {
        startScreen: { x: e.clientX, y: e.clientY },
        startPan: { ...view.pan },
      };
      lastPanDraggedRef.current = false;
      return;
    }

    // Ölçek Kalibrasyonu (§ Arka plan görseli): kullanıcı bilinen gerçek uzunluğa
    // sahip iki noktaya tıklar, gerçek cm değerini girer; arka plan görseli o
    // oranda yeniden boyutlandırılır — ilk tıklanan nokta dünya konumunda sabit
    // kalır, görsel onun etrafında ölçeklenir.
    if (calibrationMode) {
      if (!calibrationPointRef.current) {
        calibrationPointRef.current = worldPt;
        pushToast("Şimdi aynı bilinen uzunluğun ikinci ucuna tıklayın.", "bilgi");
        return;
      }
      const p1 = calibrationPointRef.current;
      const p2 = worldPt;
      calibrationPointRef.current = null;
      setCalibrationMode(false);
      const measuredCm = dist(p1, p2);
      if (measuredCm < 1) return;
      const input = window.prompt(
        `Bu iki nokta arasındaki GERÇEK uzunluk kaç cm? (Şu an ${Math.round(measuredCm)} cm olarak çizili)`,
        String(Math.round(measuredCm))
      );
      const realCm = input ? Number(input) : NaN;
      const bg = variant.backgroundImage;
      if (input && Number.isFinite(realCm) && realCm > 0 && bg) {
        const scale = realCm / measuredCm;
        const relX = p1.x - bg.xCm;
        const relY = p1.y - bg.yCm;
        updateVariant((v) =>
          v.backgroundImage
            ? M.updateBackgroundImage(v, {
                widthCm: v.backgroundImage.widthCm * scale,
                heightCm: v.backgroundImage.heightCm * scale,
                xCm: p1.x - relX * scale,
                yCm: p1.y - relY * scale,
              })
            : v
        );
        pushToast(`Arka plan görseli kalibre edildi (×${scale.toFixed(3)}).`, "basari");
      }
      return;
    }

    // DWG/DXF krokisi: "Parsele Yerleştir" ile onaylanmadan önce (locked=false)
    // tuvalde sürüklenip döndürebilir — döndürme kolu, sonra gövde (bbox) sırasıyla
    // denenir. Onaylandıktan sonra normal seçim/çizim davranışına karışmaz.
    if (activeTool === "select" && variant.vectorTrace && !variant.vectorTrace.locked) {
      const trace = variant.vectorTrace;
      const rect = canvasRef.current!.getBoundingClientRect();
      const screenPt = { x: e.clientX - rect.left, y: e.clientY - rect.top };
      const originScreen = worldToScreen(view, { x: trace.x, y: trace.y });
      // Paylaşılan applyTransform (bkz. geometry.ts) — render2d.ts'teki çizilen kol
      // ile BİREBİR aynı matematik; ayrı yazılmış kopyalar daha önce birbirinden
      // sapmıştı (döndürme kolu işaret hatası).
      const halfH = trace.heightCm / 2;
      const handleGapLocal = 30 / (view.pxPerCm * (trace.scale || 1));
      const handleWorld = applyTransform({ x: 0, y: -halfH - handleGapLocal }, trace);
      const handleScreen = worldToScreen(view, handleWorld);

      if (dist(screenPt, handleScreen) <= 10) {
        traceRotateRef.current = {
          centerScreen: originScreen,
          startAngle: Math.atan2(screenPt.y - originScreen.y, screenPt.x - originScreen.x),
          startRotationDeg: trace.rotationDeg,
          before: variant,
        };
        return;
      }

      if (pointInRotatedRect(worldPt, { x: trace.x, y: trace.y }, trace.widthCm * trace.scale, trace.heightCm * trace.scale, trace.rotationDeg)) {
        traceDragRef.current = { startWorld: worldPt, startX: trace.x, startY: trace.y, before: variant };
        return;
      }
    }

    if (e.ctrlKey || e.metaKey) {
      const cId = hitTestCorner(variant, view, worldPt);
      const compIdCtrl = !cId ? hitTestComponent(variant, worldPt) : null;
      const wIdCtrl = !cId && !compIdCtrl ? hitTestWall(variant, worldPt) : null;
      const rIdCtrl = !cId && !compIdCtrl && !wIdCtrl ? hitTestRoom(variant, worldPt) : null;
      const hitCtrl: Selection | null = cId
        ? { type: "corner", id: cId }
        : compIdCtrl
        ? { type: "component", id: compIdCtrl }
        : wIdCtrl
        ? { type: "wall", id: wIdCtrl }
        : rIdCtrl
        ? { type: "room", id: rIdCtrl }
        : null;
      if (hitCtrl) {
        toggleMultiSelect(hitCtrl);
      } else {
        marqueeRef.current = worldPt;
        marqueeEndRef.current = worldPt;
      }
      return;
    }

    if (activeTool === "wall") {
      // Tık-tık-tık zincir çizimi: fareyi basılı tutmaya gerek yok. İlk tık başlangıç
      // köşesini işaretler; sonraki her tık bir önceki köşeden buraya bir duvar segmenti
      // ekler ve zinciri buradan sürdürür. Zincir 'S' tuşuna basılana (veya Esc/araç
      // değişimine) kadar açık kalır (§ "line durması için S'ye basınca dursun").
      const snappedId = M.findNearestCorner(variant, worldPt);
      const snap = snappedId ? { point: variant.corners[snappedId], kind: "corner" as SnapKind } : snapWorldPoint(worldPt);

      if (!wallDragRef.current) {
        wallDragRef.current = { anchorCornerId: snappedId, anchorWorld: snap.point, rawStartWorld: worldPt };
        wallDragEndRef.current = snap.point;
        liveSnapRef.current = snap.kind === "guide" ? null : snap;
        setChainDrawingActive(true);
        return;
      }

      const anchor = wallDragRef.current;
      // Bu tıklamanın kendi konumundan yeniden hesapla — sadece önceki pointermove'a
      // güvenmek, ardışık iki tık arasında hiç fare hareketi olmazsa (örn. çok hızlı
      // çift tıklama) yanlışlıkla eski (henüz güncellenmemiş) uç noktayı kullanabilir.
      const endWorld = snappedId ? snap.point : guideSnap(snap.point, anchor.anchorWorld).point;
      if (dist(anchor.anchorWorld, endWorld) * view.pxPerCm < 4) return;

      let anchorCornerId: ID | null = anchor.anchorCornerId;
      let endCornerId: ID | null = snappedId;
      let closedRoomId: ID | null = null;

      updateVariant((v) => {
        let vv = v;
        if (!anchorCornerId) {
          const [next, id] = M.resolveWallEndpoint(vv, anchor.anchorWorld);
          vv = next;
          anchorCornerId = id;
        }
        if (!endCornerId) {
          const [next2, id2] = M.resolveWallEndpoint(vv, endWorld);
          vv = next2;
          endCornerId = id2;
        }
        if (anchorCornerId === endCornerId) return vv;
        vv = M.addWallWithJunctions(vv, anchorCornerId, endCornerId, nextWallThickness);

        const activeRoomTypeId = useStore.getState().activeRoomTypeId || DEFAULT_ROOM_TYPE_ID;
        const selectedTypeConfig = roomTypes.find((r) => r.id === activeRoomTypeId);
        const roomName = selectedTypeConfig ? selectedTypeConfig.label : "Yeni Oda";
        const [next3, roomIds] = M.autoDetectAllRooms(vv, activeRoomTypeId, roomName);
        vv = next3;
        if (roomIds.length > 0) closedRoomId = roomIds[0];
        return vv;
      });

      if (closedRoomId) setSelection({ type: "room", id: closedRoomId });

      // Zinciri bu yeni köşeden sürdür.
      wallDragRef.current = { anchorCornerId: endCornerId, anchorWorld: endWorld, rawStartWorld: worldPt };
      wallDragEndRef.current = endWorld;
      return;
    }

    if (activeTool === "room") {
      // Oda aracı varsayılan olarak tık-tık-tık serbest çokgen çizer (dörtgene
      // zorlamaz): her tık bir köşe ekler, ilk köşeye yakın tıklamak döngüyü kapatıp
      // odayı oluşturur. Dikdörtgen isteyen kullanıcı "roomRect" aracını seçer.
      const nearId = M.findNearestCorner(variant, worldPt);
      const snapped = nearId ? { x: variant.corners[nearId].x, y: variant.corners[nearId].y } : snapToGrid(worldPt);
      const pts = roomChainPointsRef.current;

      if (pts.length >= 3 && dist(pts[0], snapped) * view.pxPerCm < 14) {
        const activeRoomTypeId = useStore.getState().activeRoomTypeId || DEFAULT_ROOM_TYPE_ID;
        const selectedTypeConfig = roomTypes.find((r) => r.id === activeRoomTypeId);
        const roomName = selectedTypeConfig ? selectedTypeConfig.label : "Yeni Oda";
        let createdRoomId: ID | null = null;
        updateVariant((v) => {
          const [next, roomId] = M.createPolygonRoom(v, pts, nextWallThickness, activeRoomTypeId, roomName);
          createdRoomId = roomId;
          return next;
        });
        if (createdRoomId) setSelection({ type: "room", id: createdRoomId });
        roomChainPointsRef.current = [];
        roomChainCursorRef.current = null;
        setChainDrawingActive(false);
        return;
      }

      if (pts.length > 0 && dist(pts[pts.length - 1], snapped) * view.pxPerCm < 4) return;

      roomChainPointsRef.current = [...pts, snapped];
      roomChainCursorRef.current = snapped;
      liveSnapRef.current = nearId ? { point: snapped, kind: "corner" } : { point: snapped, kind: "grid" };
      setChainDrawingActive(true);
      return;
    }

    if (activeTool === "roomRect") {
      const nearId = M.findNearestCorner(variant, worldPt);
      const start = nearId ? { x: variant.corners[nearId].x, y: variant.corners[nearId].y } : snapToGrid(worldPt);
      roomDragRef.current = start;
      roomDragEndRef.current = start;
      liveSnapRef.current = nearId ? { point: start, kind: "corner" } : { point: start, kind: "grid" };
      return;
    }

    if (activeTool === "polygon") {
      polyDragRef.current = worldPt;
      polyDragEndRef.current = worldPt;
      return;
    }

    if (activeTool === "point") {
      updateVariant((v) => M.addCorner(v, worldPt)[0]);
      return;
    }

    if (activeTool === "measure") {
      if (!measureRef.current) {
        measureRef.current = worldPt;
        setMeasureLine(null);
      } else {
        setMeasureLine({ a: measureRef.current, b: worldPt });
        measureRef.current = null;
      }
      return;
    }

    if (activeTool === "text") {
      const text = window.prompt("Metin / Not girin:");
      if (text) {
        updateVariant((v) => M.addTextAnnotation(v, worldPt, text));
        pushToast("Metin eklendi.", "basari");
      }
      return;
    }

    // Door, Window & Block Placement Logic
    if (activeTool === "place") {
      const activePlacement = pendingPlacement ?? {
        tip: "kapi",
        subtypeId: "tek_kanat_kapi",
        overrides: { genislik: 90, yukseklik: 210 },
      };
      const category = catalog.find((c) => c.id === activePlacement.tip);

      if (category?.placement === "zemin") {
        const subtype = findSubtype(activePlacement.tip, activePlacement.subtypeId) ?? {
          id: activePlacement.subtypeId,
          name: "Bileşen",
          attributes: [],
        };
        updateVariant((v) => M.addFloorComponent(v, activePlacement.tip, subtype as any, worldPt, activePlacement.overrides));
        pushToast("Bileşen zemine yerleştirildi.", "basari");
        return;
      }

      placeDragStartRef.current = worldPt;
      return;
    }

    if (activeTool === "paint") {
      const roomId = hitTestRoom(variant, worldPt);
      setSelection(roomId ? { type: "room", id: roomId } : null);
      return;
    }

    if (areaUpdateMode) {
      const roomId = hitTestRoom(variant, worldPt);
      if (roomId) {
        const room = variant.rooms[roomId];
        const currentArea = room.manuelAlanM2 ?? roomAreaM2(room, variant.corners);
        setAreaUpdateRoomId(roomId);
        setTargetAreaInput(currentArea.toFixed(2));
      } else {
        pushToast("Lütfen alanını güncellemek istediğiniz odanın içine tıklayın.", "uyari");
      }
      return;
    }

    // Select Tool
    const cornerId = hitTestCorner(variant, view, worldPt);
    const compId = !cornerId ? hitTestComponent(variant, worldPt) : null;
    const wallId = !cornerId && !compId ? hitTestWall(variant, worldPt) : null;
    const roomId = !cornerId && !compId && !wallId ? hitTestRoom(variant, worldPt) : null;
    const hit: Selection | null = cornerId
      ? { type: "corner", id: cornerId }
      : compId
      ? { type: "component", id: compId }
      : wallId
      ? { type: "wall", id: wallId }
      : roomId
      ? { type: "room", id: roomId }
      : null;

    if (hit && multiSelection.length > 1 && multiSelection.some((s) => s.type === hit.type && s.id === hit.id)) {
      const cornerIds = new Set<ID>();
      const floorCompIds = new Set<ID>();
      for (const sel of multiSelection) {
        if (sel.type === "corner") cornerIds.add(sel.id);
        else if (sel.type === "wall") {
          const w = variant.walls[sel.id];
          if (w) {
            cornerIds.add(w.a);
            cornerIds.add(w.b);
          }
        } else if (sel.type === "room") {
          const r = variant.rooms[sel.id];
          if (r) for (const cid of r.cornerLoop) cornerIds.add(cid);
        } else if (sel.type === "component") {
          const c = variant.components[sel.id];
          if (c && c.konum.kind === "zemin") floorCompIds.add(sel.id);
        }
      }
      const cornerStarts = new Map<ID, Pt>();
      for (const id of cornerIds) {
        const c = variant.corners[id];
        if (c) cornerStarts.set(id, { x: c.x, y: c.y });
      }
      const floorCompStarts = new Map<ID, Pt>();
      for (const id of floorCompIds) {
        const c = variant.components[id];
        if (c && c.konum.kind === "zemin") floorCompStarts.set(id, { x: c.konum.x, y: c.konum.y });
      }
      groupDragRef.current = { cornerStarts, floorCompStarts, startWorld: worldPt, before: variant };
      return;
    }

    if (cornerId) {
      dragCornerRef.current = { id: cornerId, before: variant };
      selectSingle({ type: "corner", id: cornerId });
      return;
    }
    if (compId) {
      if (variant.components[compId].konum.kind === "zemin") {
        dragFloorComponentRef.current = { id: compId, before: variant };
      }
      selectSingle({ type: "component", id: compId });
      return;
    }
    if (wallId) {
      selectSingle({ type: "wall", id: wallId });
      return;
    }
    if (roomId) {
      selectSingle({ type: "room", id: roomId });
      return;
    }
    selectSingle(null);
    const rect = canvasRef.current!.getBoundingClientRect();
    panRef.current = { startScreen: { x: e.clientX - rect.left, y: e.clientY - rect.top }, startPan: pan };
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const worldPt = getWorldFromEvent(e);
    updateCursorThrottled(worldPt);

    const rect = canvasRef.current!.getBoundingClientRect();
    const screenPt = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    setPointerScreen(screenPt);

    if (panRef.current) {
      const dx = e.clientX - panRef.current.startScreen.x;
      const dy = e.clientY - panRef.current.startScreen.y;
      if (Math.hypot(dx, dy) > 5) {
        lastPanDraggedRef.current = true;
      }
      setPan({ x: panRef.current.startPan.x + dx, y: panRef.current.startPan.y + dy });
      return;
    }

    if (traceRotateRef.current) {
      const rect = canvasRef.current!.getBoundingClientRect();
      const screenPt = { x: e.clientX - rect.left, y: e.clientY - rect.top };
      const { centerScreen, startAngle, startRotationDeg } = traceRotateRef.current;
      const currentAngle = Math.atan2(screenPt.y - centerScreen.y, screenPt.x - centerScreen.x);
      const deltaDeg = ((currentAngle - startAngle) * 180) / Math.PI;
      mutateVariantLive((v) => M.updateVectorTrace(v, { rotationDeg: startRotationDeg + deltaDeg }));
      return;
    }

    if (traceDragRef.current) {
      const { startWorld, startX, startY } = traceDragRef.current;
      const dx = worldPt.x - startWorld.x;
      const dy = worldPt.y - startWorld.y;
      mutateVariantLive((v) => M.updateVectorTrace(v, { x: startX + dx, y: startY + dy }));
      return;
    }

    if (wallDragRef.current) {
      const snappedId = M.findNearestCorner(variant, worldPt);
      if (snappedId) {
        const p = variant.corners[snappedId];
        wallDragEndRef.current = p;
        liveSnapRef.current = { point: p, kind: "corner" };
        liveGuidesRef.current = [];
      } else {
        const s = snapWorldPoint(worldPt);
        const g = guideSnap(s.point, wallDragRef.current.anchorWorld);
        wallDragEndRef.current = g.point;
        liveSnapRef.current = s.kind === "guide" ? null : s;
        liveGuidesRef.current = g.guides;
      }
      return;
    }

    if (roomChainPointsRef.current.length > 0) {
      const nearId = M.findNearestCorner(variant, worldPt);
      const snapped = nearId ? { x: variant.corners[nearId].x, y: variant.corners[nearId].y } : snapToGrid(worldPt);
      roomChainCursorRef.current = snapped;
      liveSnapRef.current = nearId ? { point: snapped, kind: "corner" } : { point: snapped, kind: "grid" };
      return;
    }

    if (groupDragRef.current) {
      const { cornerStarts, floorCompStarts, startWorld } = groupDragRef.current;
      const dx = worldPt.x - startWorld.x;
      const dy = worldPt.y - startWorld.y;
      mutateVariantLive((v) => {
        let vv = v;
        for (const [id, start] of cornerStarts) vv = M.moveCorner(vv, id, { x: start.x + dx, y: start.y + dy });
        for (const [id, start] of floorCompStarts) vv = M.moveFloorComponent(vv, id, { x: start.x + dx, y: start.y + dy });
        return vv;
      });
      return;
    }

    if (marqueeRef.current) {
      marqueeEndRef.current = worldPt;
      return;
    }

    if (polyDragRef.current) {
      polyDragEndRef.current = worldPt;
      return;
    }

    if (roomDragRef.current) {
      const start = roomDragRef.current;
      const nearId = M.findNearestCorner(variant, worldPt);
      let end = nearId ? { x: variant.corners[nearId].x, y: variant.corners[nearId].y } : snapToGrid(worldPt);
      if (e.shiftKey && !nearId) {
        const side = Math.max(Math.abs(end.x - start.x), Math.abs(end.y - start.y));
        end = {
          x: start.x + Math.sign(end.x - start.x || 1) * side,
          y: start.y + Math.sign(end.y - start.y || 1) * side,
        };
      }
      roomDragEndRef.current = end;
      liveSnapRef.current = nearId ? { point: end, kind: "corner" } : { point: end, kind: "grid" };
      return;
    }

    if (liveSnapRef.current) liveSnapRef.current = null;
    if (liveGuidesRef.current.length > 0) liveGuidesRef.current = [];

    if (placeDragStartRef.current) {
      return;
    }

    if (dragCornerRef.current) {
      mutateVariantLive((v) => M.moveCorner(v, dragCornerRef.current!.id, worldPt));
      return;
    }
    if (dragFloorComponentRef.current) {
      mutateVariantLive((v) => M.moveFloorComponent(v, dragFloorComponentRef.current!.id, worldPt));
      return;
    }
    if (activeTool === "select" || activeTool === "paint" || activeTool === "place") {
      const cornerId = hitTestCorner(variant, view, worldPt);
      if (cornerId) {
        setHovered({ type: "corner", id: cornerId });
        return;
      }
      const compId = hitTestComponent(variant, worldPt);
      if (compId) {
        setHovered({ type: "component", id: compId });
        return;
      }
      const wallId = hitTestWall(variant, worldPt);
      if (wallId) {
        setHovered({ type: "wall", id: wallId });
        return;
      }
      const roomId = hitTestRoom(variant, worldPt);
      if (roomId) {
        setHovered({ type: "room", id: roomId });
        return;
      }
      setHovered(null);
    }
  };

  const onPointerUp = (e: React.PointerEvent) => {
    const worldPt = getWorldFromEvent(e);

    if (e.button === 2) {
      panRef.current = null;
      return;
    }

    if (placeDragStartRef.current) {
      const p0 = placeDragStartRef.current;
      const p1 = worldPt;
      placeDragStartRef.current = null;

      const activePlacement = pendingPlacement ?? { tip: "kapi", subtypeId: "tek_kanat_kapi", overrides: { genislik: 90, yukseklik: 210 } };
      const subtype = findSubtype(activePlacement.tip, activePlacement.subtypeId) ?? {
        id: activePlacement.subtypeId,
        name: "Eleman",
        attributes: [],
      };

      const dragDistance = dist(p0, p1);
      const isClick = dragDistance < 15;

      if (isClick) {
        const wallId = findNearestWallForPlacement(p0);
        if (!wallId) {
          pushToast("Bir duvara tıklayarak veya sürükleyerek yerleştirin.", "uyari");
          return;
        }
        const wall = variant.walls[wallId];
        const a = variant.corners[wall.a];
        const b = variant.corners[wall.b];
        if (a && b) {
          const wallLen = dist(a, b);
          const offsetCm = projectPointToSegment(p0, a, b).t * wallLen;
          const finalWidth = Number(activePlacement.overrides["genislik"] ?? 90);
          const overrides = { ...activePlacement.overrides, genislik: finalWidth };
          updateVariant((v) => M.addWallComponent(v, activePlacement.tip, subtype as any, wallId, offsetCm, overrides));
        }
      } else {
        let bestWallId: ID | null = null;
        let bestDistance = Infinity;
        let t0 = 0.5, t1 = 0.5;

        for (const w of Object.values(variant.walls)) {
          const wa = variant.corners[w.a];
          const wb = variant.corners[w.b];
          if (!wa || !wb) continue;
          
          const proj0 = projectPointToSegment(p0, wa, wb);
          const proj1 = projectPointToSegment(p1, wa, wb);
          const avgDist = (proj0.distance + proj1.distance) / 2;
          
          if (avgDist < bestDistance && avgDist < w.thickness / 2 + 50) {
            bestWallId = w.id;
            bestDistance = avgDist;
            t0 = proj0.t;
            t1 = proj1.t;
          }
        }

        if (!bestWallId) {
          pushToast("Duvar kesişimi bulunamadı. Lütfen bir duvar üzerinden sürükleyin.", "uyari");
          return;
        }

        const wall = variant.walls[bestWallId];
        const a = variant.corners[wall.a];
        const b = variant.corners[wall.b];
        if (a && b) {
          const wallLen = dist(a, b);
          const offset0 = t0 * wallLen;
          const offset1 = t1 * wallLen;
          const startOffset = Math.min(offset0, offset1);
          const endOffset = Math.max(offset0, offset1);
          const centerOffsetCm = (startOffset + endOffset) / 2;
          const finalWidth = Math.max(15, Math.round(endOffset - startOffset));
          
          const overrides = { ...activePlacement.overrides, genislik: finalWidth };
          updateVariant((v) => M.addWallComponent(v, activePlacement.tip, subtype as any, bestWallId!, centerOffsetCm, overrides));
        }
      }
      return;
    }

    if (traceRotateRef.current) {
      commitPendingChange(traceRotateRef.current.before);
      traceRotateRef.current = null;
      return;
    }
    if (traceDragRef.current) {
      commitPendingChange(traceDragRef.current.before);
      traceDragRef.current = null;
      return;
    }

    if (marqueeRef.current) {
      const start = marqueeRef.current;
      const end = worldPt;
      marqueeRef.current = null;
      marqueeEndRef.current = null;

      const movedPx = dist(start, end) * view.pxPerCm;
      if (movedPx < 4) return;

      const minX = Math.min(start.x, end.x);
      const maxX = Math.max(start.x, end.x);
      const minY = Math.min(start.y, end.y);
      const maxY = Math.max(start.y, end.y);
      const inBox = (p: Pt) => p.x >= minX && p.x <= maxX && p.y >= minY && p.y <= maxY;

      const picked: Selection[] = [];
      for (const corner of Object.values(variant.corners)) {
        if (inBox(corner)) picked.push({ type: "corner", id: corner.id });
      }
      for (const wall of Object.values(variant.walls)) {
        const a = variant.corners[wall.a];
        const b = variant.corners[wall.b];
        if (a && b && inBox(a) && inBox(b)) picked.push({ type: "wall", id: wall.id });
      }
      for (const comp of Object.values(variant.components)) {
        if (comp.konum.kind === "zemin" && inBox(comp.konum)) picked.push({ type: "component", id: comp.id });
      }
      setMultiSelection(picked);
      return;
    }

    if (polyDragRef.current) {
      const center = polyDragRef.current;
      const end = polyDragEndRef.current || worldPt;
      polyDragRef.current = null;
      polyDragEndRef.current = null;

      const radius = dist(center, end);
      if (radius >= 20) {
        const sides = useStore.getState().polygonSides || 6;
        const pts: Pt[] = [];
        for (let i = 0; i < sides; i++) {
          const angle = (i * 2 * Math.PI) / sides - Math.PI / 2;
          pts.push({ x: center.x + radius * Math.cos(angle), y: center.y + radius * Math.sin(angle) });
        }
        const activeRoomTypeId = useStore.getState().activeRoomTypeId || DEFAULT_ROOM_TYPE_ID;
        const selectedTypeConfig = roomTypes.find((r) => r.id === activeRoomTypeId);
        const roomName = selectedTypeConfig ? selectedTypeConfig.label : "Yeni Çokgen Oda";

        let createdRoomId: ID | null = null;
        updateVariant((v) => {
          const [next, roomId] = M.createPolygonRoom(v, pts, nextWallThickness, activeRoomTypeId, roomName);
          createdRoomId = roomId;
          return next;
        });
        if (createdRoomId) selectSingle({ type: "room", id: createdRoomId });
      }
      return;
    }

    if (roomDragRef.current) {
      const start = roomDragRef.current;
      const end = roomDragEndRef.current ?? snapToGrid(worldPt);
      roomDragRef.current = null;
      roomDragEndRef.current = null;
      liveSnapRef.current = null;

      const activeRoomTypeId = useStore.getState().activeRoomTypeId || DEFAULT_ROOM_TYPE_ID;
      const selectedTypeConfig = roomTypes.find((r) => r.id === activeRoomTypeId);
      const roomName = selectedTypeConfig ? selectedTypeConfig.label : "Yeni Oda";

      let createdRoomId: ID | null = null;
      updateVariant((v) => {
        const [next, roomId] = M.createRectangularRoom(
          v,
          start,
          end,
          nextWallThickness,
          activeRoomTypeId,
          roomName
        );
        createdRoomId = roomId;
        return next;
      });
      if (createdRoomId) selectSingle({ type: "room", id: createdRoomId });
      return;
    }

    if (dragCornerRef.current) {
      commitPendingChange(dragCornerRef.current.before);
      dragCornerRef.current = null;
    }
    if (dragFloorComponentRef.current) {
      commitPendingChange(dragFloorComponentRef.current.before);
      dragFloorComponentRef.current = null;
    }
    panRef.current = null;
  };

  // Smooth Zoom wheel handler
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const handler = (e: WheelEvent) => {
      e.preventDefault();
      const rect = canvas.getBoundingClientRect();
      const cursorScreen = { x: e.clientX - rect.left, y: e.clientY - rect.top };
      const cursorWorld = screenToWorld(view, cursorScreen);
      const factor = e.deltaY < 0 ? 1.15 : 1 / 1.15;
      const nextZoom = Math.min(Math.max(view.pxPerCm * factor, 0.05), 15);
      setZoom(nextZoom);
      setPan({
        x: cursorScreen.x - cursorWorld.x * nextZoom,
        y: cursorScreen.y - cursorWorld.y * nextZoom,
      });
    };
    canvas.addEventListener("wheel", handler, { passive: false });
    return () => canvas.removeEventListener("wheel", handler);
  }, [view, setZoom, setPan]);

  // Aktif çizim zinciri (duvar/oda) araç değişince veya Escape ile otomatik iptal edilir.
  useEffect(() => {
    if (activeTool !== "wall") {
      wallDragRef.current = null;
      wallDragEndRef.current = null;
    }
    if (activeTool !== "room") {
      roomChainPointsRef.current = [];
      roomChainCursorRef.current = null;
    }
    if (activeTool !== "wall" && activeTool !== "room") setChainDrawingActive(false);
  }, [activeTool]);

  // 'S' tuşu: App.tsx'teki TEK global handler karar veriyor (isChainDrawingActive
  // bayrağına bakarak zinciri mi durduracak yoksa Snap'i mi aç/kapat edecek — bkz.
  // store.ts). Burada sadece o kararın sonucunu (stopDrawRequestId artışını)
  // dinleyip yerel zincir ref'lerini temizliyoruz; iki ayrı `window` keydown
  // dinleyicisinin kayıt sırasına bağlı kalmıyoruz.
  const stopDrawRequestId = useStore((s) => s.stopDrawRequestId);
  const isFirstStopSignal = useRef(true);
  useEffect(() => {
    if (isFirstStopSignal.current) {
      isFirstStopSignal.current = false;
      return;
    }
    wallDragRef.current = null;
    wallDragEndRef.current = null;
    roomChainPointsRef.current = [];
    roomChainCursorRef.current = null;
  }, [stopDrawRequestId]);

  const onContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    if (lastPanDraggedRef.current) {
      lastPanDraggedRef.current = false;
      return;
    }
    const rect = canvasRef.current!.getBoundingClientRect();
    const screenPt = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    const worldPt = screenToWorld(view, screenPt);

    const cornerId = hitTestCorner(variant, view, worldPt);
    const compId = !cornerId ? hitTestComponent(variant, worldPt) : null;
    const wallId = !cornerId && !compId ? hitTestWall(variant, worldPt) : null;
    const roomId = !cornerId && !compId && !wallId ? hitTestRoom(variant, worldPt) : null;
    const target: Selection | null = cornerId
      ? { type: "corner", id: cornerId }
      : compId
      ? { type: "component", id: compId }
      : wallId
      ? { type: "wall", id: wallId }
      : roomId
      ? { type: "room", id: roomId }
      : null;

    if (!target) return;
    setContextMenu({ screenX: e.clientX, screenY: e.clientY, worldPt, target });
  };

  const getContextMenuItems = (): ContextMenuItem[] => {
    if (!contextMenu) return [];
    const { target } = contextMenu;
    const items: ContextMenuItem[] = [];

    items.push({
      label: "Kopyala ve Yapıştır",
      onSelect: () => {
        selectSingle(target);
        copySelectionToClipboard();
        pasteClipboard();
      },
    });

    items.push({
      label: "Sil",
      onSelect: () => {
        selectSingle(target);
        deleteSelection();
      },
    });

    return items;
  };

  const wallHeightFor = (wallId: string, variantData: FloorVariantData) => {
    const wall = variantData.walls[wallId];
    if (wall && wall.height !== undefined && wall.height > 50) return wall.height;
    for (const room of Object.values(variantData.rooms)) {
      if (room.wallLoop.includes(wallId) && room.height > 50) return room.height;
    }
    return 280;
  };

  const getTooltipData = () => {
    let type = "";
    let id = "";
    let screenPos: { x: number; y: number } | null = null;
    let isSelectedOnly = false;

    if (hovered && pointerScreen) {
      type = hovered.type;
      id = hovered.id;
      screenPos = pointerScreen;
    } else if (selection && !wallDragRef.current && !roomDragRef.current && !placeDragStartRef.current && !panRef.current) {
      type = selection.type;
      id = selection.id;
      isSelectedOnly = true;

      if (type === "room") {
        const room = variant.rooms[id];
        if (room) {
          const wpts = roomPolygon(room, variant.corners);
          if (wpts.length >= 3) {
            const centroid = polygonCentroid(wpts);
            screenPos = worldToScreen(view, centroid);
            screenPos = { x: screenPos.x, y: screenPos.y + 40 };
          }
        }
      } else if (type === "wall") {
        const wall = variant.walls[id];
        if (wall) {
          const a = variant.corners[wall.a];
          const b = variant.corners[wall.b];
          if (a && b) {
            const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
            screenPos = worldToScreen(view, mid);
            screenPos = { x: screenPos.x, y: screenPos.y - 30 };
          }
        }
      } else if (type === "component") {
        const comp = variant.components[id];
        if (comp) {
          if (comp.konum.kind === "zemin") {
            screenPos = worldToScreen(view, comp.konum);
            screenPos = { x: screenPos.x, y: screenPos.y - 30 };
          } else {
            const wall = variant.walls[comp.konum.duvarId];
            if (wall) {
              const a = variant.corners[wall.a];
              const b = variant.corners[wall.b];
              if (a && b) {
                const wallLen = dist(a, b);
                const dirX = (b.x - a.x) / wallLen;
                const dirY = (b.y - a.y) / wallLen;
                const pt = {
                  x: a.x + dirX * comp.konum.offsetCm,
                  y: a.y + dirY * comp.konum.offsetCm
                };
                screenPos = worldToScreen(view, pt);
                screenPos = { x: screenPos.x, y: screenPos.y - 30 };
              }
            }
          }
        }
      }
    }

    if (!screenPos) return null;

    let title = "";
    let details: { label: string; value: string }[] = [];

    if (type === "room") {
      const room = variant.rooms[id];
      if (room) {
        const rType = roomTypes.find((r) => r.id === room.typeId) || { label: "Özel Oda" };
        const area = room.manuelAlanM2 ?? roomAreaM2(room, variant.corners);
        title = room.name || rType.label;
        details = [
          { label: "Oda Tipi", value: rType.label },
          { label: "Hesaplanan Alan", value: `${area.toFixed(2)} m²` },
          { label: "Duvar Yüksekliği", value: `${room.height} cm` },
          { label: "Zemin Malzemesi", value: room.zeminMalzemesi || "Sıva/Şap" }
        ];
      }
    } else if (type === "wall") {
      const wall = variant.walls[id];
      if (wall) {
        const a = variant.corners[wall.a];
        const b = variant.corners[wall.b];
        if (a && b) {
          const length = dist(a, b);
          const height = wall.height ?? wallHeightFor(wall.id, variant);
          title = `Duvar (${id.substring(0, 5)})`;
          details = [
            { label: "Uzunluk", value: `${Math.round(length)} cm` },
            { label: "Kalınlık", value: `${wall.thickness} cm` },
            { label: "Yükseklik", value: `${height} cm` },
            { label: "Malzeme", value: wall.malzeme || "Sıva" }
          ];
        }
      }
    } else if (type === "component") {
      const comp = variant.components[id];
      if (comp) {
        const cat = catalog.find((c) => c.id === comp.tip);
        const sub = cat?.subtypes.find((s) => s.id === comp.altTip);
        title = sub?.label || comp.altTip;
        details = [
          { label: "Kategori", value: cat?.label || comp.tip },
          { label: "Genişlik", value: `${comp.oznitelikler["genislik"] ?? 90} cm` }
        ];
        if (comp.oznitelikler["derinlik"]) {
          details.push({ label: "Derinlik", value: `${comp.oznitelikler["derinlik"]} cm` });
        }
        if (comp.oznitelikler["yukseklik"]) {
          details.push({ label: "Yükseklik", value: `${comp.oznitelikler["yukseklik"]} cm` });
        }
      }
    }

    if (title === "") return null;

    return { title, details, screenPos, isSelectedOnly };
  };

  const tooltipData = getTooltipData();

  return (
    <div ref={wrapperRef} className="canvas-wrapper" style={{ width: "100%", height: "100%", position: "relative", display: "flex", flexDirection: "column" }}>
      {/* Top Page Tab Bar (Matches Target Screenshot) */}
      {showPageTabs && (
      <div style={{ height: "32px", background: "#f1f5f9", borderBottom: "1px solid #cbd5e1", display: "flex", alignItems: "center", padding: "0 10px", gap: "4px", flexShrink: 0 }}>
        {pages.map((p) => (
          <div
            key={p.id}
            onClick={() => setActivePageId(p.id)}
            style={{
              padding: "4px 10px",
              borderRadius: "4px 4px 0 0",
              background: p.id === activePageId ? "#ffffff" : "#e2e8f0",
              border: "1px solid #cbd5e1",
              borderBottom: p.id === activePageId ? "1px solid #ffffff" : "1px solid #cbd5e1",
              fontSize: "12px",
              fontWeight: p.id === activePageId ? "700" : "500",
              color: p.id === activePageId ? "#1e293b" : "#64748b",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: "6px",
            }}
          >
            <span>{p.name}</span>
            <span style={{ fontSize: "10px", color: "#94a3b8" }}>✕</span>
          </div>
        ))}
        <button
          onClick={() => {
            const name = window.prompt("Yeni Sayfa Adı:", `Kat ${pages.length + 1}`);
            if (name && name.trim()) {
              const lastKot = pages.length > 0 ? pages[pages.length - 1].kotElevationCm + pages[pages.length - 1].heightCm : 0;
              const createdId = createPage(name.trim(), "konut", lastKot, 280);
              setActivePageId(createdId);
            }
          }}
          style={{ background: "#ffffff", border: "1px solid #cbd5e1", borderRadius: "4px", width: "22px", height: "22px", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", fontWeight: "bold", fontSize: "14px", color: "#475569" }}
          title="Yeni Sayfa Ekle"
        >
          +
        </button>
      </div>
      )}

      {/* Top Horizontal Ruler Scale Bar — gerçek pan/zoom durumuna göre dinamik cm değerleri */}
      {showRulers && (
      <div style={{ height: "20px", background: "#f8fafc", borderBottom: "1px solid #cbd5e1", position: "relative", fontSize: "10px", color: "#64748b", fontFamily: "var(--font-mono)", flexShrink: 0, overflow: "hidden" }}>
        {hRulerTicks.map((t) => (
          <div key={t.val} style={{ position: "absolute", left: `${30 + t.screenX}px`, top: "3px" }}>
            {t.val}
          </div>
        ))}
        <span style={{ position: "absolute", right: "8px", top: "3px", fontSize: "9px" }}>cm</span>
      </div>
      )}

      {/* Main Canvas Container with Left Vertical Ruler Scale */}
      <div style={{ flex: 1, position: "relative", display: "flex", overflow: "hidden" }}>
        {/* Left Vertical Ruler Scale — gerçek pan/zoom durumuna göre dinamik cm değerleri */}
        {showRulers && (
        <div style={{ width: "30px", background: "#f8fafc", borderRight: "1px solid #cbd5e1", position: "relative", fontSize: "9px", color: "#64748b", fontFamily: "var(--font-mono)", flexShrink: 0, overflow: "hidden" }}>
          {vRulerTicks.map((t) => (
            <div key={t.val} style={{ position: "absolute", top: `${t.screenY}px`, left: "2px", whiteSpace: "nowrap", transformOrigin: "left top", transform: "rotate(-90deg)" }}>
              {t.val}
            </div>
          ))}
        </div>
        )}

        <canvas
          ref={canvasRef}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onContextMenu={onContextMenu}
          style={{ flex: 1, touchAction: "none", cursor: activeTool === "wall" ? "crosshair" : "default" }}
        />
      </div>

      {contextMenu && (
        <ContextMenu
          x={contextMenu.screenX}
          y={contextMenu.screenY}
          items={getContextMenuItems()}
          onClose={() => setContextMenu(null)}
        />
      )}

      {/* Floating Tooltip */}
      {tooltipData && (
        <div
          style={{
            position: "absolute",
            left: `${tooltipData.screenPos.x + 30}px`,
            top: `${tooltipData.screenPos.y + 60}px`,
            background: "rgba(15, 23, 42, 0.85)",
            backdropFilter: "blur(4px)",
            border: "1px solid rgba(255, 255, 255, 0.15)",
            borderRadius: "6px",
            padding: "8px 12px",
            color: "#f8fafc",
            fontSize: "11px",
            fontFamily: "system-ui, -apple-system, sans-serif",
            pointerEvents: "none",
            zIndex: 100,
            boxShadow: "0 4px 12px rgba(0, 0, 0, 0.25)",
            maxWidth: "200px"
          }}
        >
          <div style={{ fontWeight: "700", borderBottom: "1px solid rgba(255,255,255,0.2)", paddingBottom: "3px", marginBottom: "4px", fontSize: "12px", color: tooltipData.isSelectedOnly ? "#38bdf8" : "#fb7185" }}>
            {tooltipData.title} {tooltipData.isSelectedOnly && "(Seçili)"}
          </div>
          {tooltipData.details.map((d, i) => (
            <div key={i} style={{ display: "flex", justifyContent: "space-between", gap: "10px", marginTop: "2px" }}>
              <span style={{ color: "#94a3b8" }}>{d.label}:</span>
              <strong style={{ color: "#f1f5f9" }}>{d.value}</strong>
            </div>
          ))}
        </div>
      )}

      {/* Area Update Mode Banner */}
      {areaUpdateMode && !areaUpdateRoomId && (
        <div style={{
          position: "absolute",
          top: "60px",
          left: "50%",
          transform: "translateX(-50%)",
          background: "#F59E0B",
          color: "#ffffff",
          padding: "8px 18px",
          borderRadius: "99px",
          fontSize: "11px",
          fontWeight: "600",
          boxShadow: "0 4px 12px rgba(0, 0, 0, 0.15)",
          zIndex: 10,
          display: "flex",
          alignItems: "center",
          gap: "8px"
        }}>
          <span>⚡ Alan Güncelleme Modu: Bir odaya tıklayın</span>
          <button
            onClick={() => setAreaUpdateMode(false)}
            style={{
              background: "transparent",
              border: "none",
              color: "#ffffff",
              fontWeight: "bold",
              cursor: "pointer",
              padding: 0,
              fontSize: "12px",
              marginLeft: "8px"
            }}
          >
            ✕
          </button>
        </div>
      )}

      {/* Area Update Modal */}
      {areaUpdateRoomId && (
        <div style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: "rgba(15, 23, 42, 0.4)",
          backdropFilter: "blur(2px)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          zIndex: 1000
        }}>
          <div style={{
            background: "#ffffff",
            border: "1px solid #cbd5e1",
            borderRadius: "8px",
            padding: "16px",
            width: "320px",
            boxShadow: "0 10px 25px -5px rgba(0,0,0,0.1)",
            display: "flex",
            flexDirection: "column",
            gap: "12px"
          }}>
            <h3 style={{ margin: 0, fontSize: "14px", fontWeight: "700", color: "#1e293b" }}>Gerçek Oda Alanını Güncelle</h3>
            <p style={{ margin: 0, fontSize: "11px", color: "#64748b" }}>
              Geometriyi bozmadan küçük bir kaydırma ile alanı günceller. Lütfen gerçek değeri m² olarak girin:
            </p>
            <div>
              <label style={{ fontSize: "11px", color: "#475569", display: "block", marginBottom: "4px" }}>Hedef Alan (m²)</label>
              <input
                type="number"
                step="0.01"
                value={targetAreaInput}
                onChange={(e) => setTargetAreaInput(e.target.value)}
                style={{
                  width: "100%",
                  padding: "6px 8px",
                  fontSize: "12px",
                  border: "1px solid #cbd5e1",
                  borderRadius: "4px",
                  boxSizing: "border-box"
                }}
              />
            </div>
            
            <div>
              <label style={{ fontSize: "11px", color: "#475569", display: "block", marginBottom: "4px" }}>Kaydırılacak Duvar Sınırı</label>
              <select
                id="area-update-wall-select"
                style={{
                  width: "100%",
                  padding: "6px 8px",
                  fontSize: "12px",
                  border: "1px solid #cbd5e1",
                  borderRadius: "4px",
                  boxSizing: "border-box"
                }}
              >
                <option value="">Otomatik Seçim (En Uygun)</option>
                {variant.rooms[areaUpdateRoomId]?.wallLoop.map((wId, i) => {
                  const wall = variant.walls[wId];
                  if (!wall) return null;
                  const wa = variant.corners[wall.a];
                  const wb = variant.corners[wall.b];
                  const len = wa && wb ? Math.round(dist(wa, wb)) : 0;
                  return (
                    <option key={wId} value={wId}>
                      Duvar {i + 1} ({len} cm, {wall.thickness} cm)
                    </option>
                  );
                })}
              </select>
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px", marginTop: "4px" }}>
              <button
                onClick={() => {
                  setAreaUpdateRoomId(null);
                  setAreaUpdateMode(false);
                }}
                style={{
                  background: "#f1f5f9",
                  border: "none",
                  borderRadius: "4px",
                  padding: "6px 12px",
                  fontSize: "12px",
                  cursor: "pointer",
                  color: "#475569"
                }}
              >
                İptal
              </button>
              <button
                onClick={() => {
                  const val = Number(targetAreaInput);
                  if (Number.isFinite(val) && val > 0) {
                    const wallSelectEl = document.getElementById("area-update-wall-select") as HTMLSelectElement;
                    const chosenWallId = wallSelectEl?.value || undefined;
                    updateVariant((v) => M.adjustRoomArea(v, areaUpdateRoomId, val, chosenWallId));
                    pushToast("Oda alanı geometrik düzeltme ile güncellendi.", "basari");
                  } else {
                    pushToast("Lütfen geçerli bir alan değeri girin.", "uyari");
                  }
                  setAreaUpdateRoomId(null);
                  setAreaUpdateMode(false);
                }}
                style={{
                  background: "#2563eb",
                  color: "#ffffff",
                  border: "none",
                  borderRadius: "4px",
                  padding: "6px 12px",
                  fontSize: "12px",
                  cursor: "pointer",
                  fontWeight: "600"
                }}
              >
                Uygula
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useStore, type Selection } from "../engine/store";
import * as M from "../engine/mutations";
import { hitTestComponent, hitTestCorner, hitTestRoom, hitTestWall } from "../engine/hitTest";
import {
  drawBackgroundImage,
  drawComponent,
  drawCornerHandle,
  drawDimension,
  drawDraftChain,
  drawFloorComponent,
  drawMarquee,
  drawReferenceGrid,
  drawRoomDraft,
  drawGrid,
  drawParselBoundary,
  drawMeasurePreview,
  drawPlacementPreview,
  drawRoom,
  drawSmartGuides,
  drawSnapIndicator,
  drawTextAnnotations,
  drawWall,
  screenToWorld,
  wallQuad,
  worldToScreen,
  type View2D,
} from "../engine/render2d";
import type { FloorVariantData, ID } from "../data/model";
import { dist, projectPointToSegment, snapToGrid, type Pt } from "../engine/geometry";
import { computeSmartGuides, resolveSnapPoint, type GuideLine, type SnapKind } from "../engine/snapping";
import { getRoomType, DEFAULT_ROOM_TYPE_ID } from "../data/roomTypes";
import ContextMenu, { type ContextMenuItem } from "./ContextMenu";

export default function CanvasEditor() {
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
  const catalog = useStore((s) => s.catalog);
  const fitRequestId = useStore((s) => s.fitRequestId);
  const showRaster = useStore((s) => s.showRaster);
  const setCursorWorld = useStore((s) => s.setCursorWorld);
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
  const pushToast = useStore((s) => s.pushToast);
  const calibrationMode = useStore((s) => s.calibrationMode);
  const setCalibrationMode = useStore((s) => s.setCalibrationMode);

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
  const placeDragRef = useRef<{ wallId: ID; startOffsetCm: number; wallLen: number } | null>(null);
  const placeDragEndRef = useRef<number | null>(null);
  const roomDragRef = useRef<Pt | null>(null);
  const roomDragEndRef = useRef<Pt | null>(null);
  const polyDragRef = useRef<Pt | null>(null);
  const polyDragEndRef = useRef<Pt | null>(null);
  const marqueeRef = useRef<Pt | null>(null);
  const marqueeEndRef = useRef<Pt | null>(null);
  const calibrationPointRef = useRef<Pt | null>(null);

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
    const corners = Object.values(variant.corners);
    if (corners.length === 0) return;
    const xs = corners.map((c) => c.x);
    const ys = corners.map((c) => c.y);
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

      if (planMode !== "duvarlar" && layerVisibility["alanlar"] !== false) {
        for (const room of Object.values(variant.rooms)) {
          const roomSelected = (selection?.type === "room" && selection.id === room.id) || isMultiSelected("room", room.id);
          drawRoom(ctx, view, room, variant.corners, getRoomType(roomTypes, room.typeId), roomSelected);
        }
      }

      if (layerVisibility["bolme_duvarlar"] !== false && layerVisibility["duvar"] !== false) {
        for (const wall of Object.values(variant.walls)) {
          const a = variant.corners[wall.a];
          const b = variant.corners[wall.b];
          if (!a || !b) continue;
          const wallSelected = (selection?.type === "wall" && selection.id === wall.id) || isMultiSelected("wall", wall.id);
          drawWall(ctx, view, wall, a, b, wallSelected, hovered?.type === "wall" && hovered.id === wall.id);
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
        drawDraftChain(ctx, view, [wallDragRef.current.anchorWorld], wallDragEndRef.current);
      }

      if (activeTool === "room" && roomDragRef.current && roomDragEndRef.current) {
        drawRoomDraft(ctx, view, roomDragRef.current, roomDragEndRef.current);
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

      if (activeTool === "place" && placeDragRef.current && placeDragEndRef.current !== null) {
        const { wallId, startOffsetCm } = placeDragRef.current;
        const wall = variant.walls[wallId];
        if (wall) {
          const a = variant.corners[wall.a];
          const b = variant.corners[wall.b];
          if (a && b) drawPlacementPreview(ctx, view, a, b, wall.thickness, startOffsetCm, placeDragEndRef.current);
        }
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
      const snappedId = M.findNearestCorner(variant, worldPt);
      const snap = snappedId ? { point: variant.corners[snappedId], kind: "corner" as SnapKind } : snapWorldPoint(worldPt);
      wallDragRef.current = {
        anchorCornerId: snappedId,
        anchorWorld: snap.point,
        rawStartWorld: worldPt,
      };
      wallDragEndRef.current = snap.point;
      liveSnapRef.current = snap.kind === "guide" ? null : snap;
      return;
    }

    if (activeTool === "room") {
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
        subtypeId: "kapi_tek",
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

      // Door or Window Placement: search for nearest wall with 35cm tolerance
      const wallId = findNearestWallForPlacement(worldPt);
      if (!wallId) {
        pushToast("Lütfen kapı veya pencereyi bir duvara tıklayarak yerleştirin.", "uyari");
        return;
      }
      const wall = variant.walls[wallId];
      const a = variant.corners[wall.a];
      const b = variant.corners[wall.b];
      const wallLen = dist(a, b);
      const startOffsetCm = projectPointToSegment(worldPt, a, b).t * wallLen;
      placeDragRef.current = { wallId, startOffsetCm, wallLen };
      placeDragEndRef.current = startOffsetCm;
      return;
    }

    if (activeTool === "paint") {
      const roomId = hitTestRoom(variant, worldPt);
      setSelection(roomId ? { type: "room", id: roomId } : null);
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

    if (placeDragRef.current) {
      const { wallId, wallLen } = placeDragRef.current;
      const wall = variant.walls[wallId];
      const a = variant.corners[wall.a];
      const b = variant.corners[wall.b];
      placeDragEndRef.current = projectPointToSegment(worldPt, a, b).t * wallLen;
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
    if (panRef.current) {
      const rect = canvasRef.current!.getBoundingClientRect();
      const cur = { x: e.clientX - rect.left, y: e.clientY - rect.top };
      const dx = cur.x - panRef.current.startScreen.x;
      const dy = cur.y - panRef.current.startScreen.y;
      setPan({ x: panRef.current.startPan.x + dx, y: panRef.current.startPan.y + dy });
      return;
    }

    if (activeTool === "select" || activeTool === "paint") {
      const cornerId = hitTestCorner(variant, view, worldPt);
      if (cornerId) {
        setHovered({ type: "corner", id: cornerId });
        return;
      }
      const wallId = hitTestWall(variant, worldPt);
      if (wallId) {
        setHovered({ type: "wall", id: wallId });
        return;
      }
      setHovered(null);
    }
  };

  const onPointerUp = (e: React.PointerEvent) => {
    const worldPt = getWorldFromEvent(e);

    if (wallDragRef.current) {
      const anchor = wallDragRef.current;
      wallDragRef.current = null;
      wallDragEndRef.current = null;
      liveSnapRef.current = null;
      liveGuidesRef.current = [];

      const movedScreenPx = dist(anchor.rawStartWorld, worldPt) * view.pxPerCm;
      if (movedScreenPx < 4) return;

      let anchorCornerId: ID | null = anchor.anchorCornerId;
      let endCornerId: ID | null = M.findNearestCorner(variant, worldPt);
      const snappedEndWorld = endCornerId
        ? variant.corners[endCornerId]
        : guideSnap(snapWorldPoint(worldPt).point, anchor.anchorWorld).point;
      let closedRoomId: ID | null = null;

      updateVariant((v) => {
        let vv = v;
        if (!anchorCornerId) {
          const [next, id] = M.addCorner(vv, anchor.anchorWorld);
          vv = next;
          anchorCornerId = id;
        }
        if (!endCornerId) {
          const [next2, id2] = M.addCorner(vv, snappedEndWorld);
          vv = next2;
          endCornerId = id2;
        }
        if (anchorCornerId === endCornerId) return vv;
        vv = M.addWall(vv, anchorCornerId, endCornerId, nextWallThickness);

        const activeRoomTypeId = useStore.getState().activeRoomTypeId || DEFAULT_ROOM_TYPE_ID;
        const selectedTypeConfig = roomTypes.find((r) => r.id === activeRoomTypeId);
        const roomName = selectedTypeConfig ? selectedTypeConfig.label : "Yeni Oda";

        const [next3, roomIds] = M.autoDetectAllRooms(vv, activeRoomTypeId, roomName);
        vv = next3;
        if (roomIds.length > 0) closedRoomId = roomIds[0];
        return vv;
      });

      if (closedRoomId) setSelection({ type: "room", id: closedRoomId });
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

    if (placeDragRef.current) {
      const { wallId, startOffsetCm, wallLen } = placeDragRef.current;
      placeDragRef.current = null;
      placeDragEndRef.current = null;

      const wall = variant.walls[wallId];
      const a = variant.corners[wall.a];
      const b = variant.corners[wall.b];
      const endOffsetCm = projectPointToSegment(worldPt, a, b).t * wallLen;
      const rawWidth = Math.abs(endOffsetCm - startOffsetCm);
      const activePlacement = pendingPlacement ?? { tip: "kapi", subtypeId: "kapi_tek", overrides: { genislik: 90 } };
      const subtype = findSubtype(activePlacement.tip, activePlacement.subtypeId) ?? {
        id: activePlacement.subtypeId,
        name: "Eleman",
        attributes: [],
      };

      const MIN_DRAG_CM = 15;
      let finalWidth: number;
      let centerOffsetCm: number;
      if (rawWidth >= MIN_DRAG_CM) {
        // User dragged out a length along the wall: use exact dynamic dragged width!
        finalWidth = Math.round(rawWidth);
        centerOffsetCm = (startOffsetCm + endOffsetCm) / 2;
      } else {
        // User just clicked: use default item width
        finalWidth = Number(activePlacement.overrides["genislik"] ?? 90);
        centerOffsetCm = startOffsetCm;
      }
      const overrides = { ...activePlacement.overrides, genislik: finalWidth };
      updateVariant((v) => M.addWallComponent(v, activePlacement.tip, subtype as any, wallId, centerOffsetCm, overrides));
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

  const onContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
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

  return (
    <div ref={wrapperRef} className="canvas-wrapper" style={{ width: "100%", height: "100%", position: "relative", display: "flex", flexDirection: "column" }}>
      {/* Top Page Tab Bar (Matches Target Screenshot) */}
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

      {/* Top Horizontal Ruler Scale Bar (Matches Target Screenshot: 0, 500, 1000, 1500, 2000, 2500... cm) */}
      <div style={{ height: "20px", background: "#f8fafc", borderBottom: "1px solid #cbd5e1", display: "flex", alignItems: "center", paddingLeft: "30px", position: "relative", fontSize: "10px", color: "#64748b", fontFamily: "var(--font-mono)", flexShrink: 0 }}>
        {[0, 500, 1000, 1500, 2000, 2500, 3000, 4000, 4500, 5000].map((val, idx) => (
          <div key={idx} style={{ position: "absolute", left: `${30 + idx * 55}px` }}>
            {val}
          </div>
        ))}
        <span style={{ position: "absolute", right: "8px", fontSize: "9px" }}>cm</span>
      </div>

      {/* Main Canvas Container with Left Vertical Ruler Scale */}
      <div style={{ flex: 1, position: "relative", display: "flex", overflow: "hidden" }}>
        {/* Left Vertical Ruler Scale */}
        <div style={{ width: "30px", background: "#f8fafc", borderRight: "1px solid #cbd5e1", display: "flex", flexDirection: "column", alignItems: "center", position: "relative", fontSize: "9px", color: "#64748b", fontFamily: "var(--font-mono)", flexShrink: 0 }}>
          {[-1000, 0, 500, 1000, 1500, 2000, 2500].map((val, idx) => (
            <div key={idx} style={{ position: "absolute", top: `${15 + idx * 45}px`, transform: "rotate(-90deg)" }}>
              {val}
            </div>
          ))}
        </div>

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
    </div>
  );
}

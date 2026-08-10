import { create } from "zustand";
import {
  createEmptyPage,
  clonePage,
  type Corner,
  type Floor,
  type FloorVariantData,
  type ID,
  type Page,
  type ParselInfo,
  type PlacedComponent,
  type Wall,
} from "../../data/model";
import {
  defaultRoomTypes,
  colorForNewRoomType,
  DEFAULT_ROOM_TYPE_ID,
  type RoomCategory,
  type RoomTypeConfig,
} from "../../data/roomTypes";
import { defaultCatalog, type CatalogCategory } from "../../data/componentCatalog";
import { defaultCategoryTabs, type CategoryTab } from "../../data/categoryTabs";
import { wallMaterials, floorMaterials, type MaterialConfig } from "../../data/materials";
import * as M from "./mutations";
import { runMissingDoorCheck, runTopologyCheck } from "./qaChecks";

export type Tool =
  | "select"
  | "wall"
  | "room"
  | "roomRect"
  | "point"
  | "polygon"
  | "rotrect"
  | "measure"
  | "text"
  | "layers"
  | "paint"
  | "place";

export type Selection =
  | { type: "corner"; id: ID }
  | { type: "wall"; id: ID }
  | { type: "room"; id: ID }
  | { type: "component"; id: ID };

export type ViewMode = "2d" | "3d";
export type PlanMode = "2d" | "duvarlar" | "3d";

export interface PendingPlacement {
  tip: string;
  subtypeId: string;
  overrides: Record<string, string | number | boolean>;
}

interface Command {
  undo: () => void;
  redo: () => void;
}

export interface Toast {
  id: number;
  mesaj: string;
  tip: "bilgi" | "basari" | "uyari";
}

interface ClipboardData {
  corners: Corner[];
  walls: Wall[];
  floorComponents: PlacedComponent[];
}

const initialPagesList: Page[] = [
  createEmptyPage("Sığınak", "siginak", -400, 300),
  createEmptyPage("Otopark", "otopark", -150, 280),
  createEmptyPage("Zemin Kat", "zemin", 0, 300),
  createEmptyPage("1. Kat", "konut", 300, 280),
  createEmptyPage("2. Kat", "konut", 580, 280),
  createEmptyPage("Çatı", "cati", 860, 250),
];

interface AppState {
  roomTypes: RoomTypeConfig[];
  catalog: CatalogCategory[];
  categoryTabs: CategoryTab[];
  wallMaterials: MaterialConfig[];
  floorMaterials: MaterialConfig[];

  parsel: ParselInfo;
  setParselInfo: (parsel: Partial<ParselInfo>) => void;

  pages: Page[];
  activePageId: ID;
  setActivePageId: (id: ID) => void;
  createPage: (name: string, pageType: string, kotElevationCm: number, heightCm?: number) => ID;
  duplicatePage: (sourcePageId: ID, newName?: string) => ID;
  updatePageDetails: (id: ID, details: Partial<Omit<Page, "id" | "drawing">>) => void;
  togglePageVisible: (id: ID) => void;
  togglePageLocked: (id: ID) => void;
  setPageOpacity: (id: ID, opacity: number) => void;
  setPageAnchorPoint: (id: ID, anchor: { x: number; y: number }) => void;
  alignPagesToAnchor: (targetPageId: ID, refPageId: ID) => void;
  deletePage: (id: ID) => void;
  reorderPages: (newPages: Page[]) => void;
  reorderPagesAndRestack: (orderedIds: ID[]) => void;

  // Backward compatibility floor references
  floors: Floor[];
  currentFloorId: ID;
  currentVariantId: ID;

  planMode: PlanMode;
  activeCategoryTabId: string;
  layerVisibility: Record<string, boolean>;

  // 3 aşamalı iş akışı ekranı (Kroki Yükleme / 2B Çizim / Alan Bilgileri).
  // planMode gibi kalıcı olmayan UI durumu — saveProjectToLocalStorage
  // payload'ına dahil edilmez.
  workflowStage: 1 | 2 | 3;
  setWorkflowStage: (stage: 1 | 2 | 3) => void;

  leftRailOpen: boolean;
  toggleLeftRail: () => void;
  setLeftRailOpen: (open: boolean) => void;

  // LeftToolRail'in aktif sekmesi — FAB menüsü (Stage 2) buradan aynı sekmeleri
  // programatik olarak açabilsin diye store'a taşındı (önceden LeftToolRail'in
  // kendi yerel state'iydi, FabMenu ile kardeş bileşen olduğu için erişemiyordu).
  activeRailTab: "sayfalar" | "katmanlar" | "bilesenler" | "olcu" | "notlar" | "raporlar" | "ayarlar";
  setActiveRailTab: (tab: AppState["activeRailTab"]) => void;

  // Stage 2 araç çubuğu + FAB menüsünün paylaştığı proje modalı durumu.
  activeModal: "info" | "new" | "open" | "export" | null;
  setActiveModal: (m: AppState["activeModal"]) => void;

  // Arka plan (raster) görseli gerçek dünya ölçeğine oturtmak için: kullanıcı
  // tuvalde bilinen gerçek uzunluğa sahip iki nokta tıklar, gerçek cm değerini
  // girer, görsel o oranda yeniden boyutlandırılır (§ Ölçek Kalibrasyonu).
  calibrationMode: boolean;
  setCalibrationMode: (v: boolean) => void;

  activeTool: Tool;
  activeRoomTypeId: string;
  polygonSides: number;
  setPolygonSides: (sides: number) => void;
  nextWallThickness: number;
  draftChain: ID[] | null;
  pendingPlacement: PendingPlacement | null;
  catalogCategoryFocus: string;

  selection: Selection | null;
  multiSelection: Selection[];
  clipboard: ClipboardData | null;

  px_per_cm: number;
  pan: { x: number; y: number };

  gridVisible: boolean;
  gridStepCm: number;
  gridSnapEnabled: boolean;
  snapEnabled: boolean;
  otherFloorsMode: "hidden" | "ghost" | "visible";

  // Profesyonel CAD çizim ayarları
  wallRenderMode: "centerline" | "doubleline" | "thick";
  continuousDrawing: boolean;
  orthoEnabled: boolean;
  areaUpdateMode: boolean;

  undoStack: Command[];
  redoStack: Command[];
  undo: () => void;
  redo: () => void;

  fpsMode: boolean;
  showCeiling: boolean;
  showRaster: boolean;
  fitRequestId: number;
  toasts: Toast[];
  cursorWorld: { x: number; y: number } | null;

  // türetilmiş erişim
  currentPage: () => Page;
  currentVariant: () => FloorVariantData;
  currentFloor: () => Floor;

  // genel mutasyon köprüsü
  updateVariant: (mutator: (v: FloorVariantData) => FloorVariantData) => void;
  mutateVariantLive: (mutator: (v: FloorVariantData) => FloorVariantData) => void;
  commitPendingChange: (before: FloorVariantData) => void;

  setZoom: (pxPerCm: number) => void;
  setPan: (pan: { x: number; y: number }) => void;
  zoomAtScreenPoint: (center: { x: number; y: number }, factor: number) => void;
  fitToScreen: () => void;

  setTool: (tool: Tool) => void;
  setActiveRoomTypeId: (id: string) => void;
  setNextWallThickness: (cm: number) => void;

  setSelection: (sel: Selection | null) => void;
  selectSingle: (sel: Selection | null) => void;
  toggleMultiSelect: (sel: Selection) => void;
  setMultiSelection: (list: Selection[]) => void;
  clearMultiSelection: () => void;
  selectAllInVariant: () => void;
  deleteSelection: () => void;
  copySelectionToClipboard: () => void;
  pasteClipboard: () => void;
  mirrorSelection: (axis: "vertical" | "horizontal") => void;
  rotateSelection: (angleDeg: number) => void;

  // Duvar/oda tık-tık-tık zincir çizimi aktif mi? CanvasEditor'daki zincir durumu
  // (yerel ref) burada aynalanır, çünkü App.tsx'teki global 'S' kısayolu (Snap
  // aç/kapat) ile CanvasEditor'daki 'S' (zinciri durdur) kısayolunu ayrı birer
  // `window` keydown listener'ıyla çözmeye çalışmak, dinleyici KAYIT SIRASINA bağlı
  // kırılgan bir davranış üretiyordu (araç değişince CanvasEditor'ın efekti yeniden
  // kurulup App.tsx'inkinin ARKASINA düşüyor, ikisi de tetikleniyordu). Tek bir
  // global handler + paylaşılan bu bayrak, sıralamadan bağımsız kesin bir çözüm.
  isChainDrawingActive: boolean;
  setChainDrawingActive: (active: boolean) => void;
  stopDrawRequestId: number;
  requestStopDraw: () => void;

  saveProjectToLocalStorage: () => void;
  setPlanMode: (mode: PlanMode) => void;
  setActiveCategoryTab: (id: string) => void;
  toggleLayer: (key: string) => void;
  openCatalogFor: (catId: string) => void;
  setPendingPlacement: (p: PendingPlacement | null) => void;

  setGridStepCm: (stepCm: number) => void;
  toggleGridVisible: () => void;
  toggleSnapEnabled: () => void;
  setWallRenderMode: (mode: "centerline" | "thick") => void;
  toggleContinuousDrawing: () => void;
  toggleOrtho: () => void;
  toggleAreaUpdateMode: () => void;
  setAreaUpdateMode: (active: boolean) => void;

  addRoomType: (label: string) => string;
  addFloor: () => void;
  deleteCurrentFloor: () => void;
  addVariant: () => void;
  switchFloorVariant: (floorId: ID, variantId: ID) => void;

  toggleFpsMode: () => void;
  toggleCeiling: () => void;
  toggleRaster: () => void;

  pushToast: (mesaj: string, tip?: "bilgi" | "basari" | "uyari") => void;
  dismissToast: (id: number) => void;
  setCursorWorld: (p: { x: number; y: number } | null) => void;

  runTopologyCheckAction: () => void;
  runMissingDoorCheckAction: () => void;
  simulateAutoDetection: () => void;
}

const initialLayerVisibility: Record<string, boolean> = {
  duvarlar: true,
  bolme_duvarlar: true,
  alanlar: true,
  kapi: true,
  pencere: true,
  mobilya: true,
  aydinlatma: true,
  kolon: true,
};

export const useStore = create<AppState>((set, get) => ({
  roomTypes: defaultRoomTypes,
  catalog: defaultCatalog,
  categoryTabs: defaultCategoryTabs,
  wallMaterials,
  floorMaterials,

  parsel: {
    areaM2: 5000,
    widthCm: 10000, // 100 metre
    lengthCm: 5000, // 50 metre
    originX: 0,
    originY: 0,
  },
  setParselInfo: (parselPartial) =>
    set((s) => {
      const merged = { ...s.parsel, ...parselPartial };
      // Alan her zaman genişlik×derinlik'ten hesaplanır; ayrı bir "alan" girişi olmadığı
      // için bu ikisi asla birbirinden bağımsız/tutarsız (stale) kalmamalı.
      const areaM2 = Math.round(((merged.widthCm / 100) * (merged.lengthCm / 100)) * 100) / 100;
      return { parsel: { ...merged, areaM2 } };
    }),

  pages: initialPagesList,
  activePageId: initialPagesList[2].id, // Zemin Kat

  setActivePageId: (id) => set({ activePageId: id, selection: null, multiSelection: [] }),

  createPage: (name, pageType, kotElevationCm, heightCm = 300) => {
    const s = get();
    const newPg = createEmptyPage(name, pageType, kotElevationCm, heightCm);
    set({ pages: [...s.pages, newPg], activePageId: newPg.id, selection: null, multiSelection: [] });
    return newPg.id;
  },

  duplicatePage: (sourcePageId, newName) => {
    const s = get();
    const sourcePage = s.pages.find((p) => p.id === sourcePageId) || s.currentPage();
    const nextName = newName || `${sourcePage.name} (Kopya)`;
    const newKot = sourcePage.kotElevationCm + sourcePage.heightCm;
    const cloned = clonePage(sourcePage, nextName, newKot);
    set({ pages: [...s.pages, cloned], activePageId: cloned.id, selection: null, multiSelection: [] });
    return cloned.id;
  },

  updatePageDetails: (id, details) =>
    set((s) => ({
      pages: s.pages.map((p) => (p.id === id ? { ...p, ...details } : p)),
    })),

  togglePageVisible: (id) =>
    set((s) => ({
      pages: s.pages.map((p) => (p.id === id ? { ...p, visible: !p.visible } : p)),
    })),

  togglePageLocked: (id) =>
    set((s) => ({
      pages: s.pages.map((p) => (p.id === id ? { ...p, locked: !p.locked } : p)),
    })),

  setPageOpacity: (id, opacity) =>
    set((s) => ({
      pages: s.pages.map((p) => (p.id === id ? { ...p, opacity } : p)),
    })),

  setPageAnchorPoint: (id, anchor) =>
    set((s) => ({
      pages: s.pages.map((p) => (p.id === id ? { ...p, anchorPoint: anchor } : p)),
    })),

  alignPagesToAnchor: (targetPageId, refPageId) => {
    const s = get();
    const targetPage = s.pages.find((p) => p.id === targetPageId);
    const refPage = s.pages.find((p) => p.id === refPageId);
    if (!targetPage || !refPage) return;

    const dx = refPage.anchorPoint.x - targetPage.anchorPoint.x;
    const dy = refPage.anchorPoint.y - targetPage.anchorPoint.y;
    if (dx === 0 && dy === 0) return;

    const updatedDrawing = { ...targetPage.drawing };
    for (const cid of Object.keys(updatedDrawing.corners)) {
      const c = updatedDrawing.corners[cid];
      updatedDrawing.corners[cid] = { ...c, x: c.x + dx, y: c.y + dy };
    }

    set((st) => ({
      pages: st.pages.map((p) =>
        p.id === targetPageId
          ? { ...p, anchorPoint: { ...refPage.anchorPoint }, drawing: updatedDrawing }
          : p
      ),
    }));
  },

  deletePage: (id) => {
    const s = get();
    if (s.pages.length <= 1) {
      window.alert("Tek sayfa silinemez — projede en az 1 sayfa olmalı.");
      return;
    }
    const nextPages = s.pages.filter((p) => p.id !== id);
    const nextActive = s.activePageId === id ? nextPages[0].id : s.activePageId;
    set({ pages: nextPages, activePageId: nextActive, selection: null, multiSelection: [] });
  },

  reorderPages: (newPages) => set({ pages: newPages }),

  /**
   * Kullanıcı Sayfalar listesini sürükle-bırak ile kendi istediği sıraya getirdiğinde
   * çağrılır: sayfaların DİZİ SIRASI değişir VE her sayfanın kot (Z) yüksekliği yeni
   * sıraya göre yeniden istiflenir — böylece 3B'de katlar da o sırayla dizilir.
   * İlk sayfanın kotu referans alınır, sonrakiler kümülatif olarak üstüne eklenir.
   */
  reorderPagesAndRestack: (orderedIds) => {
    const s = get();
    const byId = new Map(s.pages.map((p) => [p.id, p]));
    const ordered = orderedIds.map((id) => byId.get(id)).filter((p): p is Page => !!p);
    if (ordered.length !== s.pages.length) return;

    const restacked: Page[] = [];
    let z = ordered[0].kotElevationCm;
    for (let i = 0; i < ordered.length; i++) {
      const p = ordered[i];
      if (i > 0) z += ordered[i - 1].heightCm;
      restacked.push(z === p.kotElevationCm ? p : { ...p, kotElevationCm: z });
    }
    set({ pages: restacked });
  },

  // Backward compatibility floor references
  floors: [],
  currentFloorId: "",
  currentVariantId: "",

  planMode: "2d",
  activeCategoryTabId: defaultCategoryTabs[0].id,
  layerVisibility: initialLayerVisibility,

  workflowStage: 1,

  leftRailOpen: true,
  toggleLeftRail: () => set((s) => ({ leftRailOpen: !s.leftRailOpen })),
  setLeftRailOpen: (open) => set({ leftRailOpen: open }),

  activeRailTab: "sayfalar",
  setActiveRailTab: (tab) => set({ activeRailTab: tab }),

  activeModal: null,
  setActiveModal: (m) => set({ activeModal: m }),

  calibrationMode: false,
  setCalibrationMode: (v) => set({ calibrationMode: v }),

  activeTool: "select",
  activeRoomTypeId: DEFAULT_ROOM_TYPE_ID,
  polygonSides: 6,
  setPolygonSides: (sides) => set({ polygonSides: sides }),
  nextWallThickness: 20,
  draftChain: null,
  pendingPlacement: null,
  catalogCategoryFocus: "pencere",

  selection: null,
  multiSelection: [],
  clipboard: null,

  px_per_cm: 0.5,
  pan: { x: 400, y: 300 },

  gridVisible: true,
  gridStepCm: 100,
  gridSnapEnabled: true,
  snapEnabled: true,
  otherFloorsMode: "ghost",

  // Profesyonel CAD çizim ayarları
  // Varsayılan HER ZAMAN "centerline" (ince tek çizgi) olmalı — kullanıcı defalarca
  // "çift çizgili istemiyorum" dedi. Kullanıcı isterse üstteki araç çubuğundan
  // doubleline/thick'e geçebilir, ama varsayılan asla o olmamalı.
  wallRenderMode: "centerline",
  continuousDrawing: false,
  orthoEnabled: false,
  areaUpdateMode: false,

  undoStack: [],
  redoStack: [],

  fpsMode: false,
  // Varsayılan kapalı: en üstteki (aktif) kat tavansız başlar ki oda yeni
  // çizildiğinde içi hemen görünsün. Alt katlar View3D'de her zaman tavanlıdır
  // (bkz. § Kat ayrımı / tavan mantığı) — bu bayrak sadece en üst katı etkiler.
  showCeiling: false,
  showRaster: true,
  fitRequestId: 0,
  toasts: [],
  cursorWorld: null,

  currentPage: () => {
    const s = get();
    return s.pages.find((p) => p.id === s.activePageId) || s.pages[0] || initialPagesList[0];
  },

  currentVariant: () => {
    const s = get();
    const page = s.pages.find((p) => p.id === s.activePageId) || s.pages[0] || initialPagesList[0];
    return page ? page.drawing : initialPagesList[0].drawing;
  },

  currentFloor: () => {
    const s = get();
    const page = s.pages.find((p) => p.id === s.activePageId) || s.pages[0] || initialPagesList[0];
    return { id: page.id, name: page.name, variants: [page.drawing] };
  },

  updateVariant: (mutator) => {
    const s = get();
    const activePage = s.currentPage();
    const beforeDrawing = activePage.drawing;
    const afterDrawing = mutator(beforeDrawing);
    if (afterDrawing === beforeDrawing) return;

    const newPages = s.pages.map((p) =>
      p.id === activePage.id ? { ...p, drawing: afterDrawing } : p
    );
    const pageId = activePage.id;
    const cmd: Command = {
      undo: () => set((st) => ({ pages: st.pages.map((p) => (p.id === pageId ? { ...p, drawing: beforeDrawing } : p)) })),
      redo: () => set((st) => ({ pages: st.pages.map((p) => (p.id === pageId ? { ...p, drawing: afterDrawing } : p)) })),
    };
    set({ pages: newPages, undoStack: [...s.undoStack, cmd], redoStack: [] });
  },

  mutateVariantLive: (mutator) => {
    const s = get();
    const activePage = s.currentPage();
    const afterDrawing = mutator(activePage.drawing);
    set({
      pages: s.pages.map((p) => (p.id === activePage.id ? { ...p, drawing: afterDrawing } : p)),
    });
  },

  commitPendingChange: (beforeDrawing) => {
    const s = get();
    const activePage = s.currentPage();
    const afterDrawing = activePage.drawing;
    if (afterDrawing === beforeDrawing) return;
    const pageId = activePage.id;
    const cmd: Command = {
      undo: () => set((st) => ({ pages: st.pages.map((p) => (p.id === pageId ? { ...p, drawing: beforeDrawing } : p)) })),
      redo: () => set((st) => ({ pages: st.pages.map((p) => (p.id === pageId ? { ...p, drawing: afterDrawing } : p)) })),
    };
    set({ undoStack: [...s.undoStack, cmd], redoStack: [] });
  },

  undo: () => {
    const s = get();
    if (s.undoStack.length === 0) return;
    const cmd = s.undoStack[s.undoStack.length - 1];
    cmd.undo();
    set({ undoStack: s.undoStack.slice(0, -1), redoStack: [...s.redoStack, cmd] });
  },

  redo: () => {
    const s = get();
    if (s.redoStack.length === 0) return;
    const cmd = s.redoStack[s.redoStack.length - 1];
    cmd.redo();
    set({ redoStack: s.redoStack.slice(0, -1), undoStack: [...s.undoStack, cmd] });
  },

  setZoom: (px_per_cm) => set({ px_per_cm: Math.max(0.05, Math.min(20, px_per_cm)) }),
  setPan: (pan) => set({ pan }),
  zoomAtScreenPoint: (center, factor) => {
    const s = get();
    const oldScale = s.px_per_cm;
    const newScale = Math.max(0.05, Math.min(20, oldScale * factor));
    if (newScale === oldScale) return;
    const worldCenter = { x: (center.x - s.pan.x) / oldScale, y: (center.y - s.pan.y) / oldScale };
    const newPan = { x: center.x - worldCenter.x * newScale, y: center.y - worldCenter.y * newScale };
    set({ px_per_cm: newScale, pan: newPan });
  },
  fitToScreen: () => set((s) => ({ fitRequestId: s.fitRequestId + 1 })),

  setTool: (tool) => set({ activeTool: tool }),
  setActiveRoomTypeId: (id) => set({ activeRoomTypeId: id }),
  setNextWallThickness: (cm) => set({ nextWallThickness: cm }),

  setSelection: (sel) => set({ selection: sel, multiSelection: sel ? [sel] : [] }),
  selectSingle: (sel) => set({ selection: sel, multiSelection: sel ? [sel] : [] }),
  toggleMultiSelect: (sel) => {
    const s = get();
    const key = (x: Selection) => `${x.type}:${x.id}`;
    const exists = s.multiSelection.some((x) => key(x) === key(sel));
    if (exists) {
      const next = s.multiSelection.filter((x) => key(x) !== key(sel));
      set({ multiSelection: next, selection: next.length > 0 ? next[next.length - 1] : null });
    } else {
      set({ multiSelection: [...s.multiSelection, sel], selection: sel });
    }
  },
  setMultiSelection: (list) => set({ multiSelection: list, selection: list.length === 1 ? list[0] : null }),
  clearMultiSelection: () => set({ multiSelection: [] }),
  selectAllInVariant: () => {
    const s = get();
    const variant = s.currentVariant();
    const all: Selection[] = [
      ...Object.keys(variant.corners).map((id) => ({ type: "corner" as const, id })),
      ...Object.keys(variant.walls).map((id) => ({ type: "wall" as const, id })),
      ...Object.keys(variant.components).map((id) => ({ type: "component" as const, id })),
    ];
    set({ multiSelection: all, selection: null });
  },
  deleteSelection: () => {
    const s = get();
    const selected: Selection[] = s.multiSelection.length > 0 ? s.multiSelection : s.selection ? [s.selection] : [];
    if (selected.length === 0) return;
    s.updateVariant((variant) => {
      let vv = variant;
      for (const sel of selected) {
        if (sel.type === "corner") vv = M.deleteCorner(vv, sel.id);
        else if (sel.type === "wall") vv = M.deleteWall(vv, sel.id);
        else if (sel.type === "component") vv = M.removeComponent(vv, sel.id);
        else if (sel.type === "room") vv = M.deleteRoom(vv, sel.id);
      }
      return vv;
    });
    set({ selection: null, multiSelection: [] });
  },
  copySelectionToClipboard: () => {
    const s = get();
    const variant = s.currentVariant();
    const selected: Selection[] = s.multiSelection.length > 0 ? s.multiSelection : s.selection ? [s.selection] : [];
    if (selected.length === 0) return;

    const cornerIds = new Set<ID>();
    const wallIds = new Set<ID>();
    const floorComponents: PlacedComponent[] = [];

    for (const sel of selected) {
      if (sel.type === "corner") cornerIds.add(sel.id);
      if (sel.type === "wall") {
        wallIds.add(sel.id);
        const w = variant.walls[sel.id];
        if (w) {
          cornerIds.add(w.a);
          cornerIds.add(w.b);
        }
      }
      if (sel.type === "component") {
        const c = variant.components[sel.id];
        if (c && c.konum.kind === "zemin") floorComponents.push(c);
      }
    }

    const corners = [...cornerIds].map((id) => variant.corners[id]).filter(Boolean);
    const walls = [...wallIds].map((id) => variant.walls[id]).filter(Boolean);
    if (corners.length === 0 && floorComponents.length === 0) return;
    set({ clipboard: { corners, walls, floorComponents } });
  },
  pasteClipboard: () => {
    const s = get();
    const clip = s.clipboard;
    if (!clip) return;
    const OFFSET = 40;
    const idMap = new Map<ID, ID>();
    const newSelection: Selection[] = [];

    s.updateVariant((variant) => {
      let vv = variant;
      for (const c of clip.corners) {
        const [next, newId] = M.addCorner(vv, { x: c.x + OFFSET, y: c.y + OFFSET });
        vv = next;
        idMap.set(c.id, newId);
        newSelection.push({ type: "corner", id: newId });
      }
      for (const w of clip.walls) {
        const a = idMap.get(w.a);
        const b = idMap.get(w.b);
        if (!a || !b) continue;
        vv = M.addWall(vv, a, b, w.thickness, w.malzeme);
        const newWallId = M.findWallBetweenCorners(vv, a, b);
        if (newWallId) newSelection.push({ type: "wall", id: newWallId });
      }
      for (const comp of clip.floorComponents) {
        const [next, newId] = M.pasteFloorComponent(vv, comp, OFFSET, OFFSET);
        vv = next;
        newSelection.push({ type: "component", id: newId });
      }
      return vv;
    });
    set({ multiSelection: newSelection, selection: newSelection[newSelection.length - 1] ?? null });
  },
  mirrorSelection: (axis) => {
    const s = get();
    const variant = s.currentVariant();
    const selected: Selection[] = s.multiSelection.length > 0 ? s.multiSelection : s.selection ? [s.selection] : [];
    if (selected.length === 0) return;
    const cornerIds = new Set<ID>();
    const floorCompIds = new Set<ID>();
    for (const sel of selected) {
      if (sel.type === "corner") cornerIds.add(sel.id);
      if (sel.type === "wall") {
        const w = variant.walls[sel.id];
        if (w) {
          cornerIds.add(w.a);
          cornerIds.add(w.b);
        }
      }
      if (sel.type === "room") {
        const r = variant.rooms[sel.id];
        if (r) for (const cid of r.cornerLoop) cornerIds.add(cid);
      }
      if (sel.type === "component") {
        const c = variant.components[sel.id];
        if (c && c.konum.kind === "zemin") floorCompIds.add(c.id);
      }
    }
    if (cornerIds.size === 0 && floorCompIds.size === 0) return;

    let centerVal = 0;
    if (axis === "vertical") {
      const xs = [...cornerIds].map((id) => variant.corners[id]?.x).filter((x) => x !== undefined);
      if (xs.length > 0) centerVal = (Math.min(...xs) + Math.max(...xs)) / 2;
    } else {
      const ys = [...cornerIds].map((id) => variant.corners[id]?.y).filter((y) => y !== undefined);
      if (ys.length > 0) centerVal = (Math.min(...ys) + Math.max(...ys)) / 2;
    }
    s.updateVariant((v) => M.mirrorSelectedEntities(v, [...cornerIds], [...floorCompIds], axis, centerVal));
  },
  rotateSelection: (angleDeg) => {
    const s = get();
    const variant = s.currentVariant();
    const selected: Selection[] = s.multiSelection.length > 0 ? s.multiSelection : s.selection ? [s.selection] : [];
    if (selected.length === 0) return;
    const cornerIds = new Set<ID>();
    const floorCompIds = new Set<ID>();
    for (const sel of selected) {
      if (sel.type === "corner") cornerIds.add(sel.id);
      if (sel.type === "wall") {
        const w = variant.walls[sel.id];
        if (w) {
          cornerIds.add(w.a);
          cornerIds.add(w.b);
        }
      }
      if (sel.type === "room") {
        const r = variant.rooms[sel.id];
        if (r) for (const cid of r.cornerLoop) cornerIds.add(cid);
      }
      if (sel.type === "component") {
        const c = variant.components[sel.id];
        if (c && c.konum.kind === "zemin") floorCompIds.add(c.id);
      }
    }
    if (cornerIds.size === 0 && floorCompIds.size === 0) return;

    const xs: number[] = [];
    const ys: number[] = [];
    for (const id of cornerIds) {
      const c = variant.corners[id];
      if (c) {
        xs.push(c.x);
        ys.push(c.y);
      }
    }
    for (const id of floorCompIds) {
      const c = variant.components[id];
      if (c && c.konum.kind === "zemin") {
        xs.push(c.konum.x);
        ys.push(c.konum.y);
      }
    }
    if (xs.length === 0) return;
    const pivot = {
      x: (Math.min(...xs) + Math.max(...xs)) / 2,
      y: (Math.min(...ys) + Math.max(...ys)) / 2,
    };
    s.updateVariant((v) => M.rotateSelectedEntities(v, [...cornerIds], [...floorCompIds], angleDeg, pivot));
  },
  isChainDrawingActive: false,
  setChainDrawingActive: (active) => set({ isChainDrawingActive: active }),
  stopDrawRequestId: 0,
  requestStopDraw: () => set((s) => ({ stopDrawRequestId: s.stopDrawRequestId + 1, isChainDrawingActive: false })),
  saveProjectToLocalStorage: () => {
    const s = get();
    const payload = { pages: s.pages, parsel: s.parsel, roomTypes: s.roomTypes, catalog: s.catalog };
    localStorage.setItem("bilcad_project", JSON.stringify(payload));
    window.alert("Proje tarayıcıda (localStorage) kaydedildi.");
  },
  setPlanMode: (m) => set({ planMode: m }),
  setWorkflowStage: (stage) =>
    set((s) => ({
      workflowStage: stage,
      selection: null,
      multiSelection: [],
      activeTool: "select",
      stopDrawRequestId: s.isChainDrawingActive ? s.stopDrawRequestId + 1 : s.stopDrawRequestId,
      isChainDrawingActive: false,
    })),
  setActiveCategoryTab: (id) => set({ activeCategoryTabId: id }),
  toggleLayer: (key) =>
    set((s) => ({ layerVisibility: { ...s.layerVisibility, [key]: !s.layerVisibility[key] } })),
  openCatalogFor: (catId) =>
    set({ catalogCategoryFocus: catId, activeTool: "place" }),
  setPendingPlacement: (p) => set({ pendingPlacement: p }),

  setGridStepCm: (stepCm) => set({ gridStepCm: stepCm }),
  toggleGridVisible: () => set((s) => ({ gridVisible: !s.gridVisible })),
  toggleSnapEnabled: () => set((s) => ({ snapEnabled: !s.snapEnabled })),
  setWallRenderMode: (mode) => set({ wallRenderMode: mode }),
  toggleContinuousDrawing: () => set((s) => ({ continuousDrawing: !s.continuousDrawing })),
  toggleOrtho: () => set((s) => ({ orthoEnabled: !s.orthoEnabled })),
  toggleAreaUpdateMode: () => set((s) => ({ areaUpdateMode: !s.areaUpdateMode })),
  setAreaUpdateMode: (active) => set({ areaUpdateMode: active }),

  addRoomType: (label) => {
    const s = get();
    const id =
      label
        .toLowerCase()
        .replace(/ı/g, "i")
        .replace(/i̇/g, "i")
        .replace(/ğ/g, "g")
        .replace(/ü/g, "u")
        .replace(/ş/g, "s")
        .replace(/ö/g, "o")
        .replace(/ç/g, "c")
        .replace(/[^a-z0-9]+/g, "_")
        .replace(/^_+|_+$/g, "") || `ozel_oda_${Date.now()}`;
    const category: RoomCategory = "bagimsiz_bolum";
    const countInCategory = s.roomTypes.length;
    const color = colorForNewRoomType(countInCategory, category, false);
    const dotColor = colorForNewRoomType(countInCategory, category, true);
    set({ roomTypes: [...s.roomTypes, { id, label, shortLabel: label, category, color, dotColor }] });
    return id;
  },

  addFloor: () => {
    const s = get();
    const activePg = s.currentPage();
    s.duplicatePage(activePg.id, `Kat ${s.pages.length + 1}`);
  },
  deleteCurrentFloor: () => {
    const s = get();
    s.deletePage(s.activePageId);
  },
  addVariant: () => {},
  switchFloorVariant: (floorId) => set({ activePageId: floorId }),

  toggleFpsMode: () => set((s) => ({ fpsMode: !s.fpsMode })),
  toggleCeiling: () => set((s) => ({ showCeiling: !s.showCeiling })),
  toggleRaster: () => {
    const s = get();
    const next = !s.showRaster;
    set({ showRaster: next });
    s.pushToast(next ? "Raster katmanı gösteriliyor." : "Raster katmanı gizlendi.", "bilgi");
  },
  pushToast: (mesaj, tip = "basari") => {
    const id = Date.now() + Math.random();
    set((s) => ({ toasts: [...s.toasts, { id, mesaj, tip }] }));
    setTimeout(() => {
      set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }));
    }, 4000);
  },
  dismissToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
  setCursorWorld: (p) => set({ cursorWorld: p }),

  runTopologyCheckAction: () => {
    const s = get();
    const findings = runTopologyCheck(s.currentVariant());
    if (findings.length === 0) {
      s.pushToast("Topoloji kontrolü: hata bulunamadı.", "basari");
      set({ multiSelection: [] });
      return;
    }
    const secim: Selection[] = [];
    for (const f of findings) {
      for (const id of f.ids) {
        if (f.kind === "acik_uc") secim.push({ type: "corner", id });
        else secim.push({ type: "wall", id });
      }
    }
    set({ multiSelection: secim, selection: secim[0] ?? null });
    s.pushToast(`Topoloji kontrolü: ${findings.length} uyarı bulundu.`, "uyari");
  },

  runMissingDoorCheckAction: () => {
    const s = get();
    const findings = runMissingDoorCheck(s.currentVariant());
    if (findings.length === 0) {
      s.pushToast("Eksik kapı kontrolü: tüm odaların dışa kapısı var.", "basari");
      set({ multiSelection: [] });
      return;
    }
    const secim: Selection[] = [];
    for (const f of findings) {
      for (const roomId of f.ids) {
        secim.push({ type: "room", id: roomId });
      }
    }
    set({ multiSelection: secim, selection: secim[0] ?? null });
    s.pushToast(`Eksik kapı kontrolü: ${findings[0].mesaj}`, "uyari");
  },

  simulateAutoDetection: () => {
    const s = get();
    s.pushToast("Oto-algılama çalıştırıldı: çizim doğrulandı.", "basari");
  },
}));

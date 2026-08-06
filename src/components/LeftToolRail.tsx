import { useRef, useState } from "react";
import { useStore, type Tool } from "../engine/store";
import * as M from "../engine/mutations";
import { handleImportFile } from "../engine/importDispatch";
import { OpenProjectModal } from "./Modals";
import { roomCategoryLabels, roomCategoryOrder } from "../data/roomTypes";
import { roomAreaM2 } from "../engine/render2d";
import { dist } from "../engine/geometry";

const THICKNESS_OPTIONS = [10, 15, 20, 25, 30];

const COLOR_MAP: Record<string, string> = {
  siginak: "#ef4444",
  otopark: "#22c55e",
  zemin: "#2563eb",
  konut: "#38bdf8",
  dukkan: "#eab308",
  bodrum: "#10b981",
  cati: "#10b981",
  teknik: "#8b5cf6",
};

// Basit çizgi ikonlar (mevcut rail ikonlarıyla aynı stroke/viewBox deseninde)
const DRAWING_TOOL_ICONS: Record<string, React.ReactNode> = {
  point: (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="2.5" fill="currentColor" stroke="none" />
      <circle cx="12" cy="12" r="9" strokeDasharray="2 3" />
    </svg>
  ),
  wall: (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2">
      <line x1="4" y1="20" x2="20" y2="4" />
      <circle cx="4" cy="20" r="1.6" fill="currentColor" stroke="none" />
      <circle cx="20" cy="4" r="1.6" fill="currentColor" stroke="none" />
    </svg>
  ),
  polygon: (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2">
      <polygon points="12 3 21 9 18 20 6 20 3 9" />
    </svg>
  ),
  room: (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="3" y="6" width="18" height="12" rx="1" />
    </svg>
  ),
  rotrect: (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="5" y="7" width="14" height="10" rx="1" transform="rotate(-18 12 12)" />
    </svg>
  ),
};

const EDIT_TOOL_ICONS: Record<string, React.ReactNode> = {
  select: (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M4 3l6.5 17 2.5-7 7-2.5z" strokeLinejoin="round" />
    </svg>
  ),
  copy: (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="9" y="9" width="12" height="12" rx="1" />
      <path d="M5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1" />
    </svg>
  ),
  delete: (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2">
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6m5 0V4a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v2" />
    </svg>
  ),
  mirror: (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2">
      <line x1="12" y1="2" x2="12" y2="22" strokeDasharray="2 2" />
      <path d="M18 9l3 3-3 3" />
      <path d="M6 9L3 12l3 3" />
    </svg>
  ),
};

/** Sol raydaki "Katmanlar" sekmesinin içeriği: oda tipi paleti + çizim/düzenleme araçları. */
function RoomAddPanel() {
  const roomTypes = useStore((s) => s.roomTypes);
  const activeRoomTypeId = useStore((s) => s.activeRoomTypeId);
  const setActiveRoomTypeId = useStore((s) => s.setActiveRoomTypeId);
  const activeTool = useStore((s) => s.activeTool);
  const setTool = useStore((s) => s.setTool);
  const addRoomType = useStore((s) => s.addRoomType);
  const deleteSelection = useStore((s) => s.deleteSelection);
  const copySelectionToClipboard = useStore((s) => s.copySelectionToClipboard);
  const pasteClipboard = useStore((s) => s.pasteClipboard);
  const mirrorSelection = useStore((s) => s.mirrorSelection);
  const pushToast = useStore((s) => s.pushToast);

  const ROOM_SHAPE_TOOLS: Tool[] = ["room", "polygon", "rotrect"];

  const pickType = (id: string) => {
    setActiveRoomTypeId(id);
    // Zaten bir çizim şekli aracındaysak o araçta kal; değilse varsayılan olarak
    // Dikdörtgen (Hızlı Oda) aracına geç.
    if (!ROOM_SHAPE_TOOLS.includes(activeTool)) setTool("room");
  };

  const handleAddCustom = () => {
    const name = window.prompt("Yeni oda tipi adı girin:");
    if (name && name.trim()) {
      const id = addRoomType(name.trim());
      setActiveRoomTypeId(id);
      setTool("room");
      pushToast(`"${name.trim()}" tipi eklendi.`, "basari");
    }
  };

  const DRAWING_TOOLS: { id: Tool; label: string }[] = [
    { id: "point", label: "Nokta" },
    { id: "wall", label: "Çizgi" },
    { id: "polygon", label: "Poligon" },
    { id: "room", label: "Dikdörtgen" },
    { id: "rotrect", label: "D.Dikdörtgen" },
  ];

  const EDIT_TOOLS: { id: string; label: string; onClick: () => void; active?: boolean }[] = [
    { id: "select", label: "Seç", onClick: () => setTool("select"), active: activeTool === "select" },
    {
      id: "copy",
      label: "Kopyala",
      onClick: () => {
        copySelectionToClipboard();
        pasteClipboard();
      },
    },
    { id: "delete", label: "Sil", onClick: () => deleteSelection() },
    { id: "mirror", label: "Aynala", onClick: () => mirrorSelection("vertical") },
  ];

  return (
    <div className="tools-panel-content">
      {roomCategoryOrder.map((cat) => {
        const typesInCat = roomTypes.filter((rt) => rt.category === cat);
        if (typesInCat.length === 0) return null;
        return (
          <div key={cat}>
            <div className="tool-section-title">{roomCategoryLabels[cat]}</div>
            <div className="room-types-grid">
              {typesInCat.map((rt) => (
                <button
                  key={rt.id}
                  className={`room-type-card ${activeRoomTypeId === rt.id ? "room-type-card--active" : ""}`}
                  onClick={() => pickType(rt.id)}
                  title={rt.label}
                >
                  <span className="room-type-dot" style={{ background: rt.dotColor }} />
                  <span className="room-type-name">{rt.shortLabel}</span>
                </button>
              ))}
              {cat === "bagimsiz_bolum" && (
                <button className="room-type-card room-type-card--add" onClick={handleAddCustom}>
                  + Özel Oda
                </button>
              )}
            </div>
          </div>
        );
      })}

      <div>
        <div className="tool-section-title">Çizim Araçları</div>
        <div className="tool-section-sub">Seçili oda tipi bu araçla çizilir: {roomTypes.find((r) => r.id === activeRoomTypeId)?.label ?? "—"}</div>
        <div className="tools-grid-3col">
          {DRAWING_TOOLS.map((t) => (
            <button
              key={t.id}
              className={`cad-tool-card ${activeTool === t.id ? "cad-tool-card--active" : ""}`}
              onClick={() => setTool(t.id)}
              title={t.label}
            >
              <span className="cad-tool-icon">{DRAWING_TOOL_ICONS[t.id]}</span>
              <span className="cad-tool-label">{t.label}</span>
            </button>
          ))}
        </div>
      </div>

      <div>
        <div className="tool-section-title">Düzenleme Araçları</div>
        <div className="tools-grid-3col">
          {EDIT_TOOLS.map((t) => (
            <button
              key={t.id}
              className={`cad-tool-card ${t.active ? "cad-tool-card--active" : ""}`}
              onClick={t.onClick}
              title={t.label}
            >
              <span className="cad-tool-icon">{EDIT_TOOL_ICONS[t.id]}</span>
              <span className="cad-tool-label">{t.label}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// Katalog kategorisi ikonları (kısa emoji — mevcut rail tarzıyla tutarlı, sade)
const CATALOG_CATEGORY_ICONS: Record<string, string> = {
  pencere: "🪟",
  kapi: "🚪",
  mobilya: "🛋️",
  yapisal: "🏗️",
  sihhi_tesisat: "🚿",
  prizler: "🔌",
  anahtarlar: "💡",
  aydinlatma: "☼",
};

/** Sol raydaki "Bileşenler" sekmesinin içeriği: kapı/pencere/mobilya/tesisat kataloğu. */
function ComponentCatalogPanel() {
  const catalog = useStore((s) => s.catalog);
  const catalogCategoryFocus = useStore((s) => s.catalogCategoryFocus);
  const pendingPlacement = useStore((s) => s.pendingPlacement);
  const setPendingPlacement = useStore((s) => s.setPendingPlacement);
  const openCatalogFor = useStore((s) => s.openCatalogFor);
  const setTool = useStore((s) => s.setTool);
  const activeTool = useStore((s) => s.activeTool);
  const [search, setSearch] = useState("");

  const category = catalog.find((c) => c.id === catalogCategoryFocus) ?? catalog[0];
  const filteredSubtypes = category.subtypes.filter((st) =>
    st.label.toLowerCase().includes(search.toLowerCase())
  );

  const pickSubtype = (subtypeId: string) => {
    const subtype = category.subtypes.find((st) => st.id === subtypeId);
    if (!subtype) return;
    const overrides: Record<string, string | number | boolean> = {};
    for (const attr of subtype.attributes) overrides[attr.key] = attr.default;
    setPendingPlacement({ tip: category.id, subtypeId, overrides });
    setTool("place");
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", minHeight: 0 }}>
      <input
        className="catalog-search-input"
        placeholder="Bileşen ara…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />
      <div className="catalog-split-body-expanded">
        <div className="catalog-side-nav">
          {catalog.map((cat) => (
            <button
              key={cat.id}
              className={`catalog-side-tab ${cat.id === category.id ? "catalog-side-tab--active" : ""}`}
              onClick={() => openCatalogFor(cat.id)}
              title={cat.label}
            >
              <span className="cat-icon">{CATALOG_CATEGORY_ICONS[cat.id] ?? "📦"}</span>
              <span className="cat-label">{cat.label}</span>
            </button>
          ))}
        </div>
        <div className="catalog-cards-grid-full">
          {filteredSubtypes.length === 0 && (
            <p className="tool-section-sub" style={{ padding: "6px" }}>
              Sonuç bulunamadı.
            </p>
          )}
          {filteredSubtypes.map((st) => {
            const w = st.attributes.find((a) => a.key === "genislik")?.default;
            const d = st.attributes.find((a) => a.key === "derinlik")?.default;
            const dims = w && d ? `${w}×${d} cm` : w ? `${w} cm` : "";
            const active =
              activeTool === "place" && pendingPlacement?.tip === category.id && pendingPlacement?.subtypeId === st.id;
            return (
              <button
                key={st.id}
                className={`component-card-box ${active ? "component-card-box--active" : ""}`}
                onClick={() => pickSubtype(st.id)}
                title={st.label}
              >
                <span className="comp-card-icon">{st.icon}</span>
                <span className="comp-card-code">{st.label}</span>
                {dims && <span className="comp-card-dims">{dims}</span>}
              </button>
            );
          })}
        </div>
      </div>
      {pendingPlacement && activeTool === "place" && (
        <p className="tool-section-sub" style={{ padding: "6px 10px", borderTop: "1px solid #e2e8f0" }}>
          {category.placement === "zemin"
            ? "Odanın içine tıklayarak yerleştirin."
            : "Bir duvarın üzerine tıklayın (veya sürükleyerek genişliği belirleyin)."}
        </p>
      )}
    </div>
  );
}

/**
 * Sol raydaki "Ölçü" sekmesinin içeriği: bir duvar veya oda seçildiğinde ölçülerini
 * gösterir, duvar kalınlığını (odaya aitse tüm duvarlarının kalınlığını tek tek)
 * buradan değiştirmeyi sağlar. Hiçbir şey seçili değilken yeni çizilecek duvarların
 * varsayılan kalınlığını ayarlar.
 */
function DimensionPanel() {
  const selection = useStore((s) => s.selection);
  const currentPage = useStore((s) => s.currentPage());
  const variant = currentPage.drawing;
  const updateVariant = useStore((s) => s.updateVariant);
  const nextWallThickness = useStore((s) => s.nextWallThickness);
  const setNextWallThickness = useStore((s) => s.setNextWallThickness);
  const selectSingle = useStore((s) => s.selectSingle);

  const ThicknessRow = ({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) => (
    <div className="dim-row">
      <span className="dim-row-label">{label}</span>
      <select value={THICKNESS_OPTIONS.includes(value) ? value : "custom"} onChange={(e) => e.target.value !== "custom" && onChange(Number(e.target.value))}>
        {THICKNESS_OPTIONS.map((t) => (
          <option key={t} value={t}>
            {t} cm
          </option>
        ))}
        <option value="custom">Özel…</option>
      </select>
      <input
        type="number"
        className="dim-row-custom"
        value={value}
        onChange={(e) => onChange(Number(e.target.value) || value)}
      />
    </div>
  );

  if (selection?.type === "wall") {
    const wall = variant.walls[selection.id];
    if (!wall) return <p className="tool-section-sub" style={{ padding: 10 }}>Duvar bulunamadı.</p>;
    const a = variant.corners[wall.a];
    const b = variant.corners[wall.b];
    const length = a && b ? dist(a, b) : 0;
    return (
      <div className="tools-panel-content">
        <div className="tool-section-title">Seçili Duvar</div>
        <div className="readonly-dim-row">
          <span>Uzunluk</span>
          <strong>{Math.round(length)} cm</strong>
        </div>
        <ThicknessRow
          label="Kalınlık"
          value={wall.thickness}
          onChange={(v) => updateVariant((vv) => M.setWallThickness(vv, wall.id, v))}
        />
      </div>
    );
  }

  if (selection?.type === "room") {
    const room = variant.rooms[selection.id];
    if (!room) return <p className="tool-section-sub" style={{ padding: 10 }}>Oda bulunamadı.</p>;
    const area = room.manuelAlanM2 ?? roomAreaM2(room, variant.corners);
    const roomWalls = room.wallLoop.map((id) => variant.walls[id]).filter(Boolean);
    return (
      <div className="tools-panel-content">
        <div className="tool-section-title">{room.name}</div>
        <div className="readonly-dim-row">
          <span>Alan</span>
          <strong>{area.toFixed(2)} m²</strong>
        </div>
        <div className="dim-row">
          <span className="dim-row-label">Duvar Yüksekliği</span>
          <input
            type="number"
            className="dim-row-custom"
            value={room.height}
            onChange={(e) => updateVariant((vv) => M.setRoomHeight(vv, room.id, Number(e.target.value) || room.height))}
          />
        </div>
        <div className="dim-row">
          <span className="dim-row-label">Alan Yaz (elle)</span>
          <input
            type="number"
            step="0.01"
            className="dim-row-custom"
            placeholder={area.toFixed(2)}
            defaultValue={room.manuelAlanM2 ?? ""}
            onBlur={(e) => {
              const raw = e.target.value.trim();
              const v = raw === "" ? undefined : Number(raw);
              updateVariant((vv) => M.setRoomManualArea(vv, room.id, Number.isFinite(v as number) ? v : undefined));
            }}
          />
        </div>

        <div className="tool-section-title" style={{ marginTop: 6 }}>
          Duvarların Kalınlığı ({roomWalls.length})
        </div>
        {roomWalls.map((w, i) => (
          <ThicknessRow
            key={w.id}
            label={`Duvar ${i + 1}`}
            value={w.thickness}
            onChange={(v) => updateVariant((vv) => M.setWallThickness(vv, w.id, v))}
          />
        ))}
      </div>
    );
  }

  return (
    <div className="tools-panel-content">
      <p className="tool-section-sub" style={{ padding: "0 2px" }}>
        Ölçülerini görmek ve duvar kalınlığını değiştirmek için tuvalde bir duvara veya odaya tıklayın.
      </p>
      <div className="tool-section-title">Yeni Duvar Varsayılan Kalınlığı</div>
      <ThicknessRow label="Kalınlık" value={nextWallThickness} onChange={setNextWallThickness} />
      {Object.keys(variant.walls).length > 0 && (
        <>
          <div className="tool-section-title" style={{ marginTop: 6 }}>
            Bu Sayfadaki Duvarlar
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 4, maxHeight: 220, overflowY: "auto" }}>
            {Object.values(variant.walls).map((w, i) => {
              const a = variant.corners[w.a];
              const b = variant.corners[w.b];
              const len = a && b ? Math.round(dist(a, b)) : 0;
              return (
                <button
                  key={w.id}
                  className="page-sidebar-card"
                  style={{ padding: "6px 10px" }}
                  onClick={() => selectSingle({ type: "wall", id: w.id })}
                >
                  <span style={{ fontSize: 12 }}>Duvar {i + 1}</span>
                  <span style={{ fontSize: 11, color: "#64748b" }}>{len} cm · {w.thickness} cm kalın</span>
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

/**
 * Sol raydaki "Ayarlar" sekmesinin içeriği: arka plan (raster) görselinin gerçek
 * ölçeğe göre boyutu/konumu + kalibrasyon aracı + parsel bilgileri.
 */
function ProjectSettingsPanel() {
  const currentPage = useStore((s) => s.currentPage());
  const variant = currentPage.drawing;
  const bg = variant.backgroundImage;
  const updateVariant = useStore((s) => s.updateVariant);
  const calibrationMode = useStore((s) => s.calibrationMode);
  const setCalibrationMode = useStore((s) => s.setCalibrationMode);
  const parsel = useStore((s) => s.parsel);
  const setParselInfo = useStore((s) => s.setParselInfo);
  const pushToast = useStore((s) => s.pushToast);

  return (
    <div className="tools-panel-content">
      <div className="tool-section-title">Parsel</div>
      <div className="dim-row">
        <span className="dim-row-label">Genişlik</span>
        <input
          type="number"
          className="dim-row-custom"
          defaultValue={Math.round(parsel.widthCm)}
          onBlur={(e) => setParselInfo({ widthCm: Number(e.target.value) || parsel.widthCm })}
        />
      </div>
      <div className="dim-row">
        <span className="dim-row-label">Derinlik</span>
        <input
          type="number"
          className="dim-row-custom"
          defaultValue={Math.round(parsel.lengthCm)}
          onBlur={(e) => setParselInfo({ lengthCm: Number(e.target.value) || parsel.lengthCm })}
        />
      </div>

      <div className="tool-section-title" style={{ marginTop: 10 }}>
        Arka Plan Görseli (İzleme Katmanı)
      </div>
      {!bg ? (
        <p className="tool-section-sub" style={{ padding: "0 2px" }}>
          Henüz bir kroki/plan görseli yüklenmedi. Üstteki araç çubuğundaki "İçe Aktar" ile jpg/png/pdf yükleyin.
        </p>
      ) : (
        <>
          <div className="dim-row">
            <span className="dim-row-label">Genişlik (cm)</span>
            <input
              type="number"
              className="dim-row-custom"
              defaultValue={Math.round(bg.widthCm)}
              onBlur={(e) => {
                const newWidth = Number(e.target.value) || bg.widthCm;
                const ratio = bg.heightCm / bg.widthCm;
                updateVariant((v) => M.updateBackgroundImage(v, { widthCm: newWidth, heightCm: newWidth * ratio }));
              }}
            />
          </div>
          <div className="dim-row">
            <span className="dim-row-label">Sol-Üst X</span>
            <input
              type="number"
              className="dim-row-custom"
              defaultValue={Math.round(bg.xCm)}
              onBlur={(e) => updateVariant((v) => M.updateBackgroundImage(v, { xCm: Number(e.target.value) || 0 }))}
            />
          </div>
          <div className="dim-row">
            <span className="dim-row-label">Sol-Üst Y</span>
            <input
              type="number"
              className="dim-row-custom"
              defaultValue={Math.round(bg.yCm)}
              onBlur={(e) => updateVariant((v) => M.updateBackgroundImage(v, { yCm: Number(e.target.value) || 0 }))}
            />
          </div>
          <div className="dim-row">
            <span className="dim-row-label">Saydamlık</span>
            <input
              type="range"
              min={0.1}
              max={1}
              step={0.05}
              defaultValue={bg.opacity}
              onChange={(e) => updateVariant((v) => M.updateBackgroundImage(v, { opacity: Number(e.target.value) }))}
            />
          </div>

          <button
            className={`btn-modal-submit`}
            style={{
              width: "100%",
              marginTop: 8,
              padding: "9px 0",
              fontSize: 12,
              fontWeight: 700,
              background: calibrationMode ? "#dc2626" : undefined,
            }}
            onClick={() => {
              if (calibrationMode) {
                setCalibrationMode(false);
              } else {
                setCalibrationMode(true);
                pushToast("Kalibrasyon: tuvalde bilinen gerçek uzunluğa sahip iki noktaya tıklayın.", "bilgi");
              }
            }}
          >
            {calibrationMode ? "✕ Kalibrasyonu İptal Et" : "📐 Ölçek Kalibrasyonu Başlat"}
          </button>
          <p className="tool-section-sub" style={{ padding: "4px 2px 0" }}>
            Görsel üzerinde gerçek uzunluğunu bildiğiniz iki nokta (örn. bir duvarın iki ucu) seçip cm cinsinden
            gerçek değeri girin — görsel otomatik olarak doğru ölçeğe oturtulur. Böylece üzerinden çizdiğiniz odalar
            gerçek boyutlarında çıkar.
          </p>

          <button
            className="btn-danger"
            style={{ width: "100%", marginTop: 8 }}
            onClick={() => updateVariant((v) => M.removeBackgroundImage(v))}
          >
            Arka Planı Kaldır
          </button>
        </>
      )}
    </div>
  );
}

export default function LeftToolRail() {
  const setTool = useStore((s) => s.setTool);
  const leftRailOpen = useStore((s) => s.leftRailOpen);
  const toggleLeftRail = useStore((s) => s.toggleLeftRail);

  const pages = useStore((s) => s.pages);
  const activePageId = useStore((s) => s.activePageId);
  const setActivePageId = useStore((s) => s.setActivePageId);
  const togglePageVisible = useStore((s) => s.togglePageVisible);
  const togglePageLocked = useStore((s) => s.togglePageLocked);
  const createPage = useStore((s) => s.createPage);
  const reorderPagesAndRestack = useStore((s) => s.reorderPagesAndRestack);
  const pushToast = useStore((s) => s.pushToast);
  const cursorWorld = useStore((s) => s.cursorWorld);
  const currentPageDrawing = (pages.find((p) => p.id === activePageId) ?? pages[0]).drawing;

  const [activeRailTab, setActiveRailTab] = useState<"sayfalar" | "katmanlar" | "bilesenler" | "olcu" | "notlar" | "raporlar" | "ayarlar">("sayfalar");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [openModalVisible, setOpenModalVisible] = useState(false);

  // Sayfalar listesi sürükle-bırak: sıra değişince katların kotu (Z) da yeni
  // sıraya göre otomatik yeniden istiflenir.
  const [dragPageId, setDragPageId] = useState<string | null>(null);
  const [dragOverPageId, setDragOverPageId] = useState<string | null>(null);

  const handlePageDrop = (targetId: string) => {
    if (!dragPageId || dragPageId === targetId) {
      setDragPageId(null);
      setDragOverPageId(null);
      return;
    }
    const ids = pages.map((p) => p.id);
    const fromIdx = ids.indexOf(dragPageId);
    const toIdx = ids.indexOf(targetId);
    if (fromIdx === -1 || toIdx === -1) return;
    ids.splice(fromIdx, 1);
    ids.splice(toIdx, 0, dragPageId);
    reorderPagesAndRestack(ids);
    setDragPageId(null);
    setDragOverPageId(null);
  };

  const cursorX = cursorWorld ? cursorWorld.x.toFixed(2) : "1250.00";
  const cursorY = cursorWorld ? cursorWorld.y.toFixed(2) : "840.00";

  const handleAddPagePrompt = () => {
    const name = window.prompt("Yeni Sayfa Adı Girin (Örn: 3. Kat, Dükkan Katı, Sığınak):", `Kat ${pages.length + 1}`);
    if (name && name.trim()) {
      const lastKot = pages.length > 0 ? pages[pages.length - 1].kotElevationCm + pages[pages.length - 1].heightCm : 0;
      const createdId = createPage(name.trim(), "konut", lastKot, 280);
      pushToast(`"${name.trim()}" sayfası eklendi.`, "basari");
      setActivePageId(createdId);
    }
  };

  return (
    <>
      <aside className="left-sidebar" style={{ display: "flex", width: "100%", background: "#f8fafc" }}>
        {/* Far Left Dark Vertical Navigation Rail (Matches Target Screenshot) */}
        <div className="far-left-nav-column">
          <button
            className={`far-left-nav-item ${activeRailTab === "sayfalar" ? "far-left-nav-item--active" : ""}`}
            onClick={() => {
              setActiveRailTab("sayfalar");
              if (!leftRailOpen) toggleLeftRail();
            }}
            title="Sayfalar"
          >
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14 2 14 8 20 8" />
            </svg>
            <span>Sayfalar</span>
          </button>

          <button
            className={`far-left-nav-item ${activeRailTab === "katmanlar" ? "far-left-nav-item--active" : ""}`}
            onClick={() => {
              setActiveRailTab("katmanlar");
              if (!leftRailOpen) toggleLeftRail();
              setTool("layers");
            }}
            title="Katmanlar"
          >
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2">
              <polygon points="12 2 2 7 12 12 22 7 12 2" />
              <polyline points="2 17 12 22 22 17" />
              <polyline points="2 12 12 17 22 12" />
            </svg>
            <span>Katmanlar</span>
          </button>

          <button
            className={`far-left-nav-item ${activeRailTab === "bilesenler" ? "far-left-nav-item--active" : ""}`}
            onClick={() => {
              setActiveRailTab("bilesenler");
              if (!leftRailOpen) toggleLeftRail();
            }}
            title="Bileşenler Katalogu"
          >
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="3" y="3" width="7" height="7" />
              <rect x="14" y="3" width="7" height="7" />
              <rect x="14" y="14" width="7" height="7" />
              <rect x="3" y="14" width="7" height="7" />
            </svg>
            <span>Bileşenler</span>
          </button>

          <button
            className={`far-left-nav-item ${activeRailTab === "olcu" ? "far-left-nav-item--active" : ""}`}
            onClick={() => {
              setActiveRailTab("olcu");
              if (!leftRailOpen) toggleLeftRail();
            }}
            title="Ölçü"
          >
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="4" y1="12" x2="20" y2="12" />
              <polyline points="14 6 20 12 14 18" />
            </svg>
            <span>Ölçü</span>
          </button>

          <button
            className={`far-left-nav-item ${activeRailTab === "notlar" ? "far-left-nav-item--active" : ""}`}
            onClick={() => {
              setActiveRailTab("notlar");
              if (!leftRailOpen) toggleLeftRail();
              setTool("text");
            }}
            title="Notlar"
          >
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
            </svg>
            <span>Notlar</span>
          </button>

          <button
            className={`far-left-nav-item ${activeRailTab === "raporlar" ? "far-left-nav-item--active" : ""}`}
            onClick={() => {
              setActiveRailTab("raporlar");
              if (!leftRailOpen) toggleLeftRail();
            }}
            title="Raporlar"
          >
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="20" x2="18" y2="10" />
              <line x1="12" y1="20" x2="12" y2="4" />
              <line x1="6" y1="20" x2="6" y2="14" />
            </svg>
            <span>Raporlar</span>
          </button>

          <button
            className={`far-left-nav-item ${activeRailTab === "ayarlar" ? "far-left-nav-item--active" : ""}`}
            onClick={() => {
              setActiveRailTab("ayarlar");
              if (!leftRailOpen) toggleLeftRail();
            }}
            title="Ayarlar"
          >
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
            </svg>
            <span>Ayarlar</span>
          </button>
        </div>

        {/* Main Left Tool Panel Content — sekmeye göre değişir */}
        {leftRailOpen && (
          <div className="tools-panel" style={{ flex: 1, borderRight: "1px solid #e2e8f0" }}>
            {/* Panel Header */}
            <div className="tools-panel-header">
              <h2>
                {activeRailTab === "katmanlar"
                  ? "ARAÇLAR & ODA EKLE"
                  : activeRailTab === "bilesenler"
                  ? "BİLEŞEN KATALOĞU"
                  : activeRailTab === "olcu"
                  ? "ÖLÇÜ & DUVAR KALINLIĞI"
                  : activeRailTab === "ayarlar"
                  ? "PROJE AYARLARI"
                  : activeRailTab === "notlar"
                  ? "NOTLAR"
                  : activeRailTab === "raporlar"
                  ? "RAPORLAR"
                  : "SAYFALAR (PAGES)"}
              </h2>
              <button className="tools-close-btn" title="Paneli Kapat" onClick={toggleLeftRail}>
                ✕
              </button>
            </div>

            {activeRailTab === "katmanlar" ? (
              <RoomAddPanel />
            ) : activeRailTab === "bilesenler" ? (
              <ComponentCatalogPanel />
            ) : activeRailTab === "olcu" ? (
              <DimensionPanel />
            ) : activeRailTab === "ayarlar" ? (
              <ProjectSettingsPanel />
            ) : activeRailTab === "notlar" ? (
              <div className="tools-panel-content">
                <p className="tool-section-sub" style={{ padding: "0 2px" }}>
                  Tuvale not eklemek için tıklayın; tüm notlar burada listelenir.
                </p>
                <button
                  className="btn-modal-submit"
                  style={{ width: "100%", padding: "9px 0", fontSize: 13, fontWeight: 700 }}
                  onClick={() => setTool("text")}
                >
                  + Tuvale Not Ekle
                </button>
                {Object.keys(currentPageDrawing.textAnnotations).length === 0 ? (
                  <p className="tool-section-sub" style={{ padding: "8px 2px" }}>Henüz not eklenmedi.</p>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                    {Object.values(currentPageDrawing.textAnnotations).map((ann) => (
                      <div key={ann.id} className="page-sidebar-card" style={{ padding: "6px 10px" }}>
                        <span style={{ fontSize: 12 }}>{ann.text}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ) : activeRailTab === "raporlar" ? (
              <div className="tools-panel-content">
                <div className="tool-section-title">Kat Özeti</div>
                {pages.map((p) => {
                  const roomCount = Object.keys(p.drawing.rooms).length;
                  const wallCount = Object.keys(p.drawing.walls).length;
                  const totalArea = Object.values(p.drawing.rooms).reduce(
                    (sum, r) => sum + (r.manuelAlanM2 ?? roomAreaM2(r, p.drawing.corners)),
                    0
                  );
                  return (
                    <div key={p.id} className="page-sidebar-card" style={{ padding: "8px 10px", cursor: "default" }}>
                      <div>
                        <div className="page-card-title">{p.name}</div>
                        <div className="page-card-kot">
                          {roomCount} oda · {wallCount} duvar · {totalArea.toFixed(1)} m²
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="tools-panel-content">
                {/* + Yeni Sayfa Ekle Button */}
                <button
                  className="btn-modal-submit"
                  style={{ width: "100%", padding: "9px 0", fontSize: "13px", fontWeight: "700", marginBottom: "12px" }}
                  onClick={handleAddPagePrompt}
                >
                  + Yeni Sayfa Ekle
                </button>

                {/* SAYFA KARTLARI LİSTESİ */}
                <div className="tool-section">
                  <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                    {pages.map((page) => {
                      const isActive = page.id === activePageId;
                      const dotColor = COLOR_MAP[page.pageType] || "#2563eb";
                      return (
                        <div
                          key={page.id}
                          draggable
                          onDragStart={() => setDragPageId(page.id)}
                          onDragOver={(e) => {
                            e.preventDefault();
                            if (dragOverPageId !== page.id) setDragOverPageId(page.id);
                          }}
                          onDragLeave={() => setDragOverPageId((cur) => (cur === page.id ? null : cur))}
                          onDrop={(e) => {
                            e.preventDefault();
                            handlePageDrop(page.id);
                          }}
                          onDragEnd={() => {
                            setDragPageId(null);
                            setDragOverPageId(null);
                          }}
                          className={`page-sidebar-card ${isActive ? "page-sidebar-card--active" : ""} ${
                            dragPageId === page.id ? "page-sidebar-card--dragging" : ""
                          } ${dragOverPageId === page.id && dragPageId && dragPageId !== page.id ? "page-sidebar-card--drop-target" : ""}`}
                          onClick={() => setActivePageId(page.id)}
                        >
                          <div className="page-card-left">
                            <span className="page-drag-handle" title="Sürükleyerek sırayı değiştirin">
                              ⠿
                            </span>
                            <span className="page-card-dot" style={{ background: dotColor }} />
                            <div>
                              <div className="page-card-title">{page.name}</div>
                              <div className="page-card-kot">Kot: {(page.kotElevationCm / 100).toFixed(2)} m</div>
                            </div>
                          </div>

                          <div className="page-card-actions" onClick={(e) => e.stopPropagation()}>
                            <button
                              className="page-card-action-btn"
                              title={page.visible ? "Görünür" : "Gizli"}
                              onClick={() => togglePageVisible(page.id)}
                            >
                              {page.visible ? "👁" : "🙈"}
                            </button>
                            <button
                              className="page-card-action-btn"
                              title={page.locked ? "Kilitli" : "Açık"}
                              onClick={() => togglePageLocked(page.id)}
                            >
                              {page.locked ? "🔒" : "🔓"}
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  <div style={{ fontSize: "11px", color: "#94a3b8", textAlign: "center", marginTop: "8px" }}>
                    Sürükle & Bırak ile sıralayın
                  </div>
                </div>

                {/* REFERANS & KOORDİNAT KARTI */}
                <div className="tool-section" style={{ marginTop: "auto" }}>
                  <div className="ref-coord-card">
                    <div className="ref-coord-header">REFERANS & KOORDİNAT</div>
                    <div className="ref-coord-body">
                      <div className="coord-svg-box">
                        <svg viewBox="0 0 50 50" width="46" height="46">
                          <line x1="8" y1="42" x2="42" y2="42" stroke="#ef4444" strokeWidth="2.5" />
                          <text x="44" y="45" fontSize="10" fontWeight="bold" fill="#ef4444">X</text>
                          <line x1="8" y1="42" x2="8" y2="8" stroke="#22c55e" strokeWidth="2.5" />
                          <text x="5" y="7" fontSize="10" fontWeight="bold" fill="#22c55e">Y</text>
                          <circle cx="8" cy="42" r="3" fill="#000" />
                          <text x="12" y="38" fontSize="8" fontWeight="bold" fill="#0f172a">(0,0)</text>
                        </svg>
                      </div>

                      <div className="coord-stats">
                        <div><strong>Origin (0,0):</strong></div>
                        <div style={{ color: "#64748b" }}>Parselin Sol Alt Köşesi</div>
                        <div>X: <strong>{cursorX} cm</strong></div>
                        <div>Y: <strong>{cursorY} cm</strong></div>
                        <div>Z: <strong>0.00 cm</strong></div>
                        <div>Ölçek: <strong>1/100</strong></div>
                        <div>Birim: <strong>cm</strong></div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Hidden File Input */}
        <input
          ref={fileInputRef}
          type="file"
          accept=".jpg,.jpeg,.png,.webp,.pdf,.geojson,.dxf,.dwg"
          style={{ display: "none" }}
          onChange={async (e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (!file) return;
            try {
              await handleImportFile(file);
            } catch (err) {
              window.alert(`Hata: ${err instanceof Error ? err.message : String(err)}`);
            }
          }}
        />
      </aside>

      {openModalVisible && <OpenProjectModal onClose={() => setOpenModalVisible(false)} />}
    </>
  );
}

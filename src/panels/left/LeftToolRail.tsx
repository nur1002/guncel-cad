import { useRef, useState } from "react";
import { useStore } from "../../engine/core/store";
import * as M from "../../engine/core/mutations";
import { handleImportFile } from "../../engine/io/importDispatch";
import RoomListPanel from "./RoomListPanel";

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

export default function LeftToolRail() {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const currentPage = useStore((s) => s.currentPage());
  const activePageId = useStore((s) => s.activePageId);
  const setActivePageId = useStore((s) => s.setActivePageId);
  const pages = useStore((s) => s.pages);
  const createPage = useStore((s) => s.createPage);
  const updateVariant = useStore((s) => s.updateVariant);
  const nextWallThickness = useStore((s) => s.nextWallThickness);
  const setNextWallThickness = useStore((s) => s.setNextWallThickness);
  const parsel = useStore((s) => s.parsel);
  const setParselInfo = useStore((s) => s.setParselInfo);
  const pushToast = useStore((s) => s.pushToast);
  const activeRailTab = useStore((s) => s.activeRailTab);
  const setActiveRailTab = useStore((s) => s.setActiveRailTab);

  const variant = currentPage.drawing;
  const trace = variant.vectorTrace;

  const [expanded, setExpanded] = useState<Record<string, boolean>>({
    sayfalar: true,
    kroki: true,
    proje: true,
  });

  const toggleExpanded = (key: string) => {
    setExpanded((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const handleAddPagePrompt = () => {
    const name = window.prompt("Yeni Sayfa Adı Girin:", `Kat ${pages.length + 1}`);
    if (name && name.trim()) {
      const lastKot = pages.length > 0 ? pages[pages.length - 1].kotElevationCm + pages[pages.length - 1].heightCm : 0;
      const createdId = createPage(name.trim(), "konut", lastKot, 280);
      setActivePageId(createdId);
      pushToast(`"${name.trim()}" sayfası eklendi.`, "basari");
    }
  };

  const togglePageVisible = (pageId: string) => {
    useStore.getState().togglePageVisible(pageId);
  };

  const togglePageLocked = (pageId: string) => {
    useStore.getState().togglePageLocked(pageId);
  };

  // Decide what to render based on activeRailTab
  let panelContent = null;
  if (activeRailTab === "home") {
    panelContent = (
      <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
        <div style={{ marginBottom: "6px", borderBottom: "1px solid #e2e8f0", paddingBottom: "8px" }}>
          <span style={{ fontSize: "11px", fontWeight: "700", color: "#475569", textTransform: "uppercase", letterSpacing: "0.05em" }}>
            PROJE MENÜSÜ
          </span>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
          {[
            { id: "mekanlar", label: "Mekânlar", icon: "🏠", desc: "Odalar ve Ortak Alanlar" },
            { id: "bilesenler", label: "Bileşenler", icon: "🧱", desc: "Mimari Elemanlar Kataloğu" },
            { id: "katmanlar", label: "Katmanlar", icon: "🥞", desc: "CAD Katman Yönetimi" },
            { id: "koordinat", label: "Referanslar", icon: "🗺️", desc: "Kroki / DWG Kalibrasyonu" },
            { id: "parsel", label: "Parsel Ayarları", icon: "🗺️", desc: "Ada, Parsel ve Koordinatlar" },
            { id: "analiz", label: "Rapor ve Analiz", icon: "📊", desc: "Yapı ve Alan Bilgileri" },
            { id: "ayarlar", label: "Çizim Ayarları", icon: "⚙️", desc: "Ortho, Grid ve Yakalamalar" },
          ].map((cat) => (
            <button
              key={cat.id}
              onClick={() => setActiveRailTab(cat.id)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "10px",
                padding: "8px 12px",
                background: "#ffffff",
                border: "1px solid #e2e8f0",
                borderRadius: "6px",
                cursor: "pointer",
                textAlign: "left",
                transition: "all 0.15s ease",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = "var(--primary-blue)";
                e.currentTarget.style.background = "#eff6ff";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = "#e2e8f0";
                e.currentTarget.style.background = "#ffffff";
              }}
            >
              <span style={{ fontSize: "18px" }}>{cat.icon}</span>
              <div style={{ display: "flex", flexDirection: "column" }}>
                <span style={{ fontSize: "12px", fontWeight: "600", color: "#334155" }}>{cat.label}</span>
                <span style={{ fontSize: "9.5px", color: "#64748b" }}>{cat.desc}</span>
              </div>
            </button>
          ))}
        </div>
      </div>
    );
  } else if (activeRailTab === "mekanlar") {
    panelContent = <RoomListPanel />;
  } else if (activeRailTab === "bilesenler") {
    panelContent = (
      <div className="accordion-card" style={{ padding: "12px" }}>
        <div style={{ marginBottom: "10px" }}>
          <span style={{ fontSize: "11px", fontWeight: "700", color: "#475569", textTransform: "uppercase", letterSpacing: "0.05em" }}>
            BİLEŞENLER KATALOĞU
          </span>
        </div>
        <ComponentCatalogPanel />
      </div>
    );
  } else if (activeRailTab === "sayfalar" || activeRailTab === "katlar" || activeRailTab === "kesitler" || activeRailTab === "gorunumler") {
    panelContent = (
      <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
        {/* Accordion 1: KATLAR */}
        <div className="accordion-card" style={{ padding: "12px" }}>
          <div
            onClick={() => toggleExpanded("sayfalar")}
            style={{ display: "flex", justifyContent: "space-between", alignItems: "center", cursor: "pointer", userSelect: "none", marginBottom: expanded.sayfalar ? "10px" : 0 }}
          >
            <span style={{ fontSize: "11px", fontWeight: "700", color: "#475569", textTransform: "uppercase", letterSpacing: "0.05em" }}>
              KATLAR
            </span>
            <button
              onClick={(e) => { e.stopPropagation(); handleAddPagePrompt(); }}
              style={{ background: "none", border: "none", color: "var(--primary-blue)", fontSize: "12px", fontWeight: "600", cursor: "pointer", padding: 0 }}
            >
              + Kat Ekle
            </button>
          </div>
          {expanded.sayfalar && (
            <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
              {pages.map((page) => {
                const isActive = page.id === activePageId;
                const dotColor = COLOR_MAP[page.pageType] || "#2563eb";
                return (
                  <div
                    key={page.id}
                    className={`page-sidebar-card ${isActive ? "page-sidebar-card--active" : ""}`}
                    onClick={() => setActivePageId(page.id)}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      padding: "8px",
                      borderRadius: "6px",
                      border: "1px solid " + (isActive ? "var(--primary-blue)" : "#cbd5e1"),
                      background: isActive ? "var(--primary-blue-light)" : "#ffffff",
                      cursor: "pointer",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                      <span style={{ width: "8px", height: "8px", borderRadius: "50%", background: dotColor }} />
                      <div>
                        <div style={{ fontSize: "12px", fontWeight: "600", color: "#334155" }}>{page.name}</div>
                        <div style={{ fontSize: "10px", color: "#64748b" }}>Kot: {(page.kotElevationCm / 100).toFixed(2)} m</div>
                      </div>
                    </div>

                    <div style={{ display: "flex", gap: "4px" }} onClick={(e) => e.stopPropagation()}>
                      <button
                        onClick={() => togglePageVisible(page.id)}
                        style={{ background: "none", border: "none", cursor: "pointer", fontSize: "12px", padding: "2px" }}
                        title={page.visible ? "Görünür" : "Gizli"}
                      >
                        {page.visible ? "👁" : "🙈"}
                      </button>
                      <button
                        onClick={() => togglePageLocked(page.id)}
                        style={{ background: "none", border: "none", cursor: "pointer", fontSize: "12px", padding: "2px" }}
                        title={page.locked ? "Kilitli" : "Açık"}
                      >
                        {page.locked ? "🔒" : "🔓"}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Accordion 2: KESİTLER */}
        <div className="accordion-card" style={{ padding: "12px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
            <span style={{ fontSize: "11px", fontWeight: "700", color: "#475569", textTransform: "uppercase", letterSpacing: "0.05em" }}>
              KESİTLER
            </span>
            <button
              onClick={() => pushToast("Kesit Çizgisi Ekleme yakında eklenecek.", "bilgi")}
              style={{ background: "none", border: "none", color: "var(--primary-blue)", fontSize: "12px", fontWeight: "600", cursor: "pointer", padding: 0 }}
            >
              + Kesit Ekle
            </button>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
            {["A-A Kesiti", "B-B Kesiti", "C-C Kesiti", "D-D Kesiti"].map((sect) => (
              <div key={sect} style={{ display: "flex", justifyContent: "space-between", padding: "6px 8px", background: "#f8fafc", borderRadius: "6px", fontSize: "12px" }}>
                <span>{sect}</span>
                <span style={{ cursor: "pointer" }} onClick={() => pushToast(`${sect} görünümü açılıyor...`, "bilgi")}>👁</span>
              </div>
            ))}
          </div>
        </div>

        {/* Accordion 3: GÖRÜNÜMLER */}
        <div className="accordion-card" style={{ padding: "12px" }}>
          <div style={{ marginBottom: "8px" }}>
            <span style={{ fontSize: "11px", fontWeight: "700", color: "#475569", textTransform: "uppercase", letterSpacing: "0.05em" }}>
              GÖRÜNÜMLER
            </span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
            {["3D İzometrik", "3D Perspektif", "Ön Görünüm", "Arka Görünüm", "Sol Görünüm", "Sağ Görünüm", "Üst Görünüm"].map((view) => (
              <div key={view} style={{ display: "flex", justifyContent: "space-between", padding: "6px 8px", background: "#f8fafc", borderRadius: "6px", fontSize: "12px" }}>
                <span>{view}</span>
                <span style={{ cursor: "pointer" }} onClick={() => pushToast(`${view} yükleniyor...`, "bilgi")}>👁</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  } else if (activeRailTab === "katmanlar") {
    panelContent = (
      <div className="accordion-card" style={{ padding: "12px" }}>
        <div style={{ marginBottom: "12px" }}>
          <span style={{ fontSize: "11px", fontWeight: "700", color: "#475569", textTransform: "uppercase", letterSpacing: "0.05em" }}>
            KATMANLAR
          </span>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
          {[
            { id: 0, name: "0 - Referans", color: "#64748b" },
            { id: 1, name: "1 - Dış Duvar", color: "#ef4444" },
            { id: 2, name: "2 - İç Duvar", color: "#f97316" },
            { id: 3, name: "3 - Kapı/Pencere", color: "#3b82f6" },
            { id: 4, name: "4 - Mobilya", color: "#22c55e" },
            { id: 5, name: "5 - Ölçülendirme", color: "#8b5cf6" },
            { id: 6, name: "6 - Alan Etiketleri", color: "#eab308" },
            { id: 7, name: "7 - Parsel", color: "#10b981" },
          ].map((layer) => (
            <div key={layer.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "6px 8px", background: "#f8fafc", borderRadius: "6px", fontSize: "12px", gap: "8px" }}>
              <span style={{ width: "10px", height: "10px", borderRadius: "20%", background: layer.color, flexShrink: 0 }} />
              <span style={{ flex: 1, color: "#334155" }}>{layer.name}</span>
              <span style={{ cursor: "pointer", fontSize: "12px" }}>👁</span>
              <span style={{ cursor: "pointer", fontSize: "12px" }}>🔒</span>
            </div>
          ))}
        </div>
      </div>
    );
  } else if (activeRailTab === "parsel") {
    panelContent = (
      <div className="accordion-card" style={{ padding: "12px" }}>
        <div style={{ marginBottom: "12px" }}>
          <span style={{ fontSize: "11px", fontWeight: "700", color: "#475569", textTransform: "uppercase", letterSpacing: "0.05em" }}>
            PROJE & PARSEL AYARLARI
          </span>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
            <span style={{ fontSize: "11px", color: "#64748b" }}>Parsel Genişliği (cm)</span>
            <input
              type="number"
              value={Math.round(parsel.widthCm)}
              onChange={(e) => setParselInfo({ widthCm: Number(e.target.value) || parsel.widthCm })}
              style={{ padding: "4px 8px", fontSize: "12px", border: "1px solid #cbd5e1", borderRadius: "4px" }}
            />
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
            <span style={{ fontSize: "11px", color: "#64748b" }}>Parsel Uzunluğu (cm)</span>
            <input
              type="number"
              value={Math.round(parsel.lengthCm)}
              onChange={(e) => setParselInfo({ lengthCm: Number(e.target.value) || parsel.lengthCm })}
              style={{ padding: "4px 8px", fontSize: "12px", border: "1px solid #cbd5e1", borderRadius: "4px" }}
            />
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: "4px", borderTop: "1px dashed #e2e8f0", paddingTop: "8px" }}>
            <span style={{ fontSize: "11px", color: "#64748b" }}>Varsayılan Duvar Kalınlığı (cm)</span>
            <select
              value={THICKNESS_OPTIONS.includes(nextWallThickness) ? nextWallThickness : "custom"}
              onChange={(e) => e.target.value !== "custom" && setNextWallThickness(Number(e.target.value))}
              style={{ padding: "4px 8px", fontSize: "12px", border: "1px solid #cbd5e1", borderRadius: "4px" }}
            >
              {THICKNESS_OPTIONS.map((t) => (
                <option key={t} value={t}>{t} cm</option>
              ))}
              <option value="custom">Diğer...</option>
            </select>
          </div>
        </div>
      </div>
    );
  } else if (activeRailTab === "koordinat" || activeRailTab === "duvarlar" || activeRailTab === "olculer" || activeRailTab === "olculendirme") {
    panelContent = (
      <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
        <div className="accordion-card" style={{ padding: "12px" }}>
          <div style={{ marginBottom: "12px" }}>
            <span style={{ fontSize: "11px", fontWeight: "700", color: "#475569", textTransform: "uppercase", letterSpacing: "0.05em" }}>
              KROKİ (DWG/DXF) AYARLARI
            </span>
          </div>
          {trace ? (
            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: "12px", color: "#475569" }}>Görünürlük</span>
                <input
                  type="checkbox"
                  checked={trace.visible}
                  onChange={(e) => updateVariant((v) => M.updateVectorTrace(v, { visible: e.target.checked }))}
                />
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: "11px", color: "#64748b" }}>
                  <span>Saydamlık</span>
                  <span>%{Math.round(trace.opacity * 100)}</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.05"
                  className="custom-slider"
                  value={trace.opacity}
                  onChange={(e) => updateVariant((v) => M.updateVectorTrace(v, { opacity: parseFloat(e.target.value) }))}
                />
              </div>
            </div>
          ) : (
            <p style={{ fontSize: "11px", color: "#94a3b8", textAlign: "center" }}>Henüz yüklenmiş kroki yok.</p>
          )}
        </div>
      </div>
    );
  } else {
    // Default Ayarlar
    panelContent = (
      <div className="accordion-card" style={{ padding: "12px" }}>
        <div style={{ marginBottom: "12px" }}>
          <span style={{ fontSize: "11px", fontWeight: "700", color: "#475569", textTransform: "uppercase", letterSpacing: "0.05em" }}>
            AYARLAR
          </span>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: "8px", fontSize: "12px" }}>
          <button style={{ padding: "8px", fontSize: "12px", border: "1px solid #cbd5e1", borderRadius: "6px", background: "#ffffff", cursor: "pointer" }} onClick={() => useStore.getState().fitToScreen()}>
            ⛶ Ekrana Sığdır
          </button>
          <button style={{ padding: "8px", fontSize: "12px", border: "1px solid #cbd5e1", borderRadius: "6px", background: "#ffffff", cursor: "pointer" }} onClick={() => useStore.getState().undo()}>
            ↶ Geri Al
          </button>
          <button style={{ padding: "8px", fontSize: "12px", border: "1px solid #cbd5e1", borderRadius: "6px", background: "#ffffff", cursor: "pointer" }} onClick={() => useStore.getState().redo()}>
            ↷ İleri Al
          </button>
        </div>
      </div>
    );
  }

  return (
    <aside
      className="left-panel-container"
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "12px",
        padding: "12px",
        background: "#f8fafc",
        width: "100%",
        height: "100%",
        overflowY: "auto",
        borderRight: "1px solid #e2e8f0",
        boxSizing: "border-box",
      }}
    >
      <input
        type="file"
        ref={fileInputRef}
        style={{ display: "none" }}
        accept=".jpg,.jpeg,.png,.webp,.pdf,.geojson,.dxf,.dwg"
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
      {panelContent}
    </aside>
  );
}

const CATALOG_CATEGORY_ICONS: Record<string, string> = {
  kapi: "🚪",
  pencere: "🪟",
  mobilya: "🛋️",
  sihhi_tesisat: "🚿",
  aydinlatma: "🍳",
  yapisal: "🧱",
};

function ComponentCatalogPanel() {
  const catalog = useStore((s) => s.catalog);
  const pendingPlacement = useStore((s) => s.pendingPlacement);
  const setPendingPlacement = useStore((s) => s.setPendingPlacement);
  const setTool = useStore((s) => s.setTool);
  const activeTool = useStore((s) => s.activeTool);
  const [search, setSearch] = useState("");
  const [expandedCat, setExpandedCat] = useState<string | null>("kapi");

  const pickSubtype = (categoryId: string, subtypeId: string) => {
    const category = catalog.find((c) => c.id === categoryId);
    const subtype = category?.subtypes.find((st) => st.id === subtypeId);
    if (!category || !subtype) return;

    const overrides: Record<string, any> = {};
    for (const attr of subtype.attributes) {
      overrides[attr.key] = attr.default;
    }
    setPendingPlacement({ tip: categoryId, subtypeId, overrides });
    setTool("place");
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
      <div style={{ position: "relative", marginBottom: "4px" }}>
        <input
          type="text"
          placeholder="Ara..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{
            width: "100%",
            padding: "6px 28px 6px 10px",
            fontSize: "12px",
            border: "1px solid #cbd5e1",
            borderRadius: "6px",
            background: "#ffffff",
            outline: "none"
          }}
        />
        <span style={{ position: "absolute", right: "8px", top: "50%", transform: "translateY(-50%)", color: "#94a3b8", fontSize: "11px", pointerEvents: "none" }}>
          🔍
        </span>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
        {catalog.map((cat) => {
          const isCatExpanded = expandedCat === cat.id;
          const filteredSubtypes = cat.subtypes.filter((st) =>
            st.label.toLowerCase().includes(search.toLowerCase())
          );

          if (search && filteredSubtypes.length === 0) return null;

          return (
            <div key={cat.id} style={{ display: "flex", flexDirection: "column", borderBottom: "1px solid #f1f5f9" }}>
              <button
                style={{
                  display: "flex",
                  alignItems: "center",
                  padding: "8px 6px",
                  background: "none",
                  border: "none",
                  width: "100%",
                  cursor: "pointer",
                  textAlign: "left",
                  fontSize: "12.5px",
                  color: "#334155",
                  fontWeight: isCatExpanded ? "600" : "500",
                  transition: "all 0.15s ease"
                }}
                onClick={() => setExpandedCat(isCatExpanded ? null : cat.id)}
              >
                <span style={{ marginRight: "8px", fontSize: "14px" }}>
                  {CATALOG_CATEGORY_ICONS[cat.id] ?? "📦"}
                </span>
                <span style={{ flex: 1 }}>{cat.label}</span>
                <span style={{ color: "#94a3b8", fontSize: "10px" }}>
                  {isCatExpanded ? "▲" : "▼"}
                </span>
              </button>

              {isCatExpanded && (
                <div style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: "6px",
                  padding: "6px 4px 10px",
                  background: "#f8fafc",
                  borderRadius: "6px"
                }}>
                  {filteredSubtypes.map((st) => {
                    const active = activeTool === "place" && pendingPlacement?.tip === cat.id && pendingPlacement?.subtypeId === st.id;
                    const w = st.attributes.find((a) => a.key === "genislik")?.default;
                    const d = st.attributes.find((a) => a.key === "derinlik")?.default;
                    const dims = w && d ? `${w}×${d} cm` : w ? `${w} cm` : "";
                    return (
                      <button
                        key={st.id}
                        onClick={() => pickSubtype(cat.id, st.id)}
                        className={`catalog-subtype-btn ${active ? "active" : ""}`}
                        style={{
                          border: active ? "1px solid var(--primary-blue)" : "1px solid #e2e8f0",
                          background: active ? "var(--primary-blue-light)" : "#ffffff",
                          minHeight: "56px"
                        }}
                      >
                        <span style={{ fontSize: "16px", marginBottom: "4px" }}>{st.icon}</span>
                        <span style={{ fontSize: "10px", color: active ? "var(--primary-blue)" : "#334155", fontWeight: "600", textAlign: "center", width: "100%", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {st.label}
                        </span>
                        {dims && (
                          <span style={{ fontSize: "8px", color: active ? "var(--primary-blue)" : "#94a3b8", marginTop: "2px" }}>
                            {dims}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

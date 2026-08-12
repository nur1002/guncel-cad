import { useState, type CSSProperties } from "react";
import { useStore } from "../../engine/core/store";
import * as M from "../../engine/core/mutations";
import { roomAreaM2, roomPerimeterM } from "../../engine/drawing/render2d";
import { getRoomType } from "../../data/roomTypes";

export default function RoomListPanel() {
  const currentPage = useStore((s) => s.currentPage());
  const variant = currentPage.drawing;
  const roomTypes = useStore((s) => s.roomTypes);
  const updateVariant = useStore((s) => s.updateVariant);
  const setTool = useStore((s) => s.setTool);
  const selectSingle = useStore((s) => s.selectSingle);
  const pushToast = useStore((s) => s.pushToast);
  const setActiveRoomTypeId = useStore((s) => s.setActiveRoomTypeId);
  const addRoomType = useStore((s) => s.addRoomType);

  const [search, setSearch] = useState("");
  const [activeMenuRoomId, setActiveMenuRoomId] = useState<string | null>(null);
  const [bbAssignRoomId, setBbAssignRoomId] = useState<string | null>(null);
  const [showAddMenu, setShowAddMenu] = useState(false);
  const [menuStage, setMenuStage] = useState<"main" | "oda" | "ortak">("main");

  const rooms = Object.values(variant.rooms);
  const filteredRooms = rooms.filter((r) =>
    r.name.toLowerCase().includes(search.toLowerCase())
  );

  // Split into categories
  const bagimsizRooms = filteredRooms.filter(
    (r) => getRoomType(roomTypes, r.typeId).category === "bagimsiz_bolum"
  );
  const ortakRooms = filteredRooms.filter(
    (r) => getRoomType(roomTypes, r.typeId).category === "ortak_alan"
  );

  // Bağımsız Bölümler (§4.4): odalar bu gerçek BB nesnelerinin içine gruplanır —
  // sadece kategori etiketi değil (bkz. TKGM kılavuzu: Bina → Kat → BB → Kısımlar).
  const bbList = Object.values(variant.bagimsizBolumler);
  const bagimsizByBB: Record<string, typeof bagimsizRooms> = {};
  const unassignedBagimsiz: typeof bagimsizRooms = [];
  for (const r of bagimsizRooms) {
    if (r.bagimsizBolumId && variant.bagimsizBolumler[r.bagimsizBolumId]) {
      (bagimsizByBB[r.bagimsizBolumId] ??= []).push(r);
    } else {
      unassignedBagimsiz.push(r);
    }
  }

  const handleCreateBB = () => {
    setShowAddMenu(false);
    setMenuStage("main");
    const kod = window.prompt("Bağımsız Bölüm No/Kod Girin (örn. 1, A-3):", String(bbList.length + 1));
    if (!kod || !kod.trim()) return;
    const tipInput = window.prompt("Kullanım Amacı — Mesken için 'M', Ticari için 'T' yazın:", "M");
    const tip: "MSKN" | "TIC" = (tipInput || "").trim().toUpperCase().startsWith("T") ? "TIC" : "MSKN";
    updateVariant((v) => {
      const [next, id] = M.createEmptyBagimsizBolum(v, currentPage.name);
      return M.updateBagimsizBolum(next, id, { kod: kod.trim(), tip });
    });
    pushToast(`"${kod.trim()}" bağımsız bölümü oluşturuldu. Odaları içine atamak için oda menüsündeki "🏢 Bağımsız Bölüm..." seçeneğini kullanın.`, "basari");
  };

  const handleRenameBB = (bb: (typeof bbList)[number]) => {
    const kod = window.prompt("Bağımsız Bölüm No/Kod:", bb.kod);
    if (!kod || !kod.trim()) return;
    updateVariant((v) => M.updateBagimsizBolum(v, bb.id, { kod: kod.trim() }));
  };

  const handleDeleteBB = (bb: (typeof bbList)[number]) => {
    if (!window.confirm(`"${bb.kod}" bağımsız bölümünü silmek istediğinize emin misiniz? İçindeki odalar silinmez, sadece atamaları kaldırılır.`)) return;
    updateVariant((v) => M.deleteBagimsizBolum(v, bb.id));
  };

  const menuBtnStyle: CSSProperties = {
    background: "none",
    border: "none",
    padding: "6px 12px",
    fontSize: "11px",
    color: "#334155",
    textAlign: "left",
    cursor: "pointer",
    display: "block",
    width: "100%",
  };

  const selectPredefinedType = (typeId: string, customName?: string) => {
    setActiveRoomTypeId(typeId);
    setTool("room");
    setShowAddMenu(false);
    setMenuStage("main");
    pushToast(
      `"${customName || typeId.toUpperCase()}" çizim aracı seçildi. Tuvalde alanı çizerek mekânı oluşturabilirsiniz.`,
      "bilgi"
    );
  };

  const handleCreateCustom = () => {
    setShowAddMenu(false);
    setMenuStage("main");
    const name = window.prompt("Özel Mekân Adı Girin:");
    if (name && name.trim()) {
      const newTypeId = addRoomType(name.trim());
      selectPredefinedType(newTypeId, name.trim());
    }
  };

  // Row renderer for layout uniformity
  const renderRoomRow = (room: any) => {
    const type = getRoomType(roomTypes, room.typeId);
    const area = room.manuelAlanM2 ?? roomAreaM2(room, variant.corners);
    const visible = room.visible !== false;

    return (
      <div
        key={room.id}
        className="pro-room-row"
        style={{
          position: "relative",
          display: "flex",
          alignItems: "center",
          padding: "6px 8px",
          borderRadius: "6px",
          background: "#ffffff",
          border: "1px solid #e2e8f0",
          cursor: "pointer",
          transition: "all 0.15s ease",
          gap: "8px",
          marginBottom: "4px"
        }}
        onClick={() => selectSingle({ type: "room", id: room.id })}
      >
        <span
          className="pro-room-dot"
          style={{
            width: "8px",
            height: "8px",
            borderRadius: "50%",
            background: type.dotColor,
            flexShrink: 0
          }}
        />
        <span
          className="pro-room-name"
          style={{
            fontSize: "12px",
            fontWeight: "600",
            color: "#334155",
            flex: 1,
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis"
          }}
        >
          {room.name}
        </span>
        <span
          className="pro-room-area"
          style={{
            fontSize: "11px",
            color: "#64748b",
            fontFamily: "var(--font-mono)",
            marginRight: "6px"
          }}
        >
          {area > 0 ? `${area.toFixed(2)} m²` : "—"}
        </span>
        <button
          className="pro-room-icon-btn"
          style={{
            background: "none",
            border: "none",
            color: "#94a3b8",
            cursor: "pointer",
            fontSize: "12px",
            padding: "2px",
            display: "flex",
            alignItems: "center"
          }}
          onClick={(e) => {
            e.stopPropagation();
            updateVariant((v) => M.setRoomVisible(v, room.id, !visible));
          }}
          title={visible ? "Gizle" : "Göster"}
        >
          {visible ? "👁" : "🙈"}
        </button>
        <button
          className="pro-room-icon-btn"
          style={{
            background: "none",
            border: "none",
            color: "#94a3b8",
            cursor: "pointer",
            fontSize: "12.5px",
            padding: "2px",
            display: "flex",
            alignItems: "center"
          }}
          onClick={(e) => {
            e.stopPropagation();
            setBbAssignRoomId(null);
            setActiveMenuRoomId(activeMenuRoomId === room.id ? null : room.id);
          }}
        >
          ⋮
        </button>

        {/* Dropdown Menu Overlay */}
        {activeMenuRoomId === room.id && (
          <div
            style={{
              position: "absolute",
              top: "28px",
              right: "4px",
              background: "#ffffff",
              border: "1px solid #cbd5e1",
              borderRadius: "6px",
              boxShadow: "0 4px 12px rgba(0,0,0,0.12)",
              zIndex: 1000,
              display: "flex",
              flexDirection: "column",
              width: "140px",
              padding: "4px 0"
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => {
                setActiveMenuRoomId(null);
                updateVariant((v) => M.setRoomVisible(v, room.id, !visible));
              }}
              style={{
                background: "none",
                border: "none",
                padding: "6px 12px",
                fontSize: "11px",
                color: "#334155",
                textAlign: "left",
                cursor: "pointer",
                display: "block",
                width: "100%"
              }}
            >
              {visible ? "👁 Gizle" : "👁 Göster"}
            </button>
            <button
              onClick={() => {
                setActiveMenuRoomId(null);
                const name = window.prompt("Yeniden Adlandır:", room.name);
                if (name && name.trim()) {
                  updateVariant((v) => M.setRoomName(v, room.id, name.trim()));
                }
              }}
              style={{
                background: "none",
                border: "none",
                padding: "6px 12px",
                fontSize: "11px",
                color: "#334155",
                textAlign: "left",
                cursor: "pointer",
                display: "block",
                width: "100%"
              }}
            >
              ✏️ Yeniden Adlandır
            </button>
            <button
              onClick={() => {
                setActiveMenuRoomId(null);
                const color = window.prompt("Yeni pastel oda rengi (örn: #f472b6 veya rgb(244,114,182)):", type.color);
                if (color) {
                  useStore.setState((s) => ({
                    roomTypes: s.roomTypes.map((t) => (t.id === type.id ? { ...t, color, dotColor: color } : t)),
                  }));
                }
              }}
              style={{
                background: "none",
                border: "none",
                padding: "6px 12px",
                fontSize: "11px",
                color: "#334155",
                textAlign: "left",
                cursor: "pointer",
                display: "block",
                width: "100%"
              }}
            >
              🎨 Renk Değiştir
            </button>
            <button
              onClick={() => {
                setActiveMenuRoomId(null);
                const perimeter = roomPerimeterM(room, variant.corners);
                window.alert(`Mahal: ${room.name}\nNet Alan: ${area.toFixed(2)} m²\nÇevre: ${perimeter.toFixed(2)} m\nKat: ${currentPage.name}`);
              }}
              style={{
                background: "none",
                border: "none",
                padding: "6px 12px",
                fontSize: "11px",
                color: "#334155",
                textAlign: "left",
                cursor: "pointer",
                display: "block",
                width: "100%"
              }}
            >
              ℹ️ Alan Bilgisi
            </button>
            {type.category === "bagimsiz_bolum" && (
              <button
                onClick={() => {
                  setActiveMenuRoomId(null);
                  setBbAssignRoomId(room.id);
                }}
                style={menuBtnStyle}
              >
                🏢 Bağımsız Bölüm...
              </button>
            )}
            <button
              onClick={() => {
                setActiveMenuRoomId(null);
                if (window.confirm(`"${room.name}" odasını silmek istediğinize emin misiniz?`)) {
                  updateVariant((v) => M.deleteRoom(v, room.id));
                }
              }}
              style={{
                background: "none",
                border: "none",
                padding: "6px 12px",
                fontSize: "11px",
                color: "#ef4444",
                textAlign: "left",
                cursor: "pointer",
                display: "block",
                width: "100%"
              }}
            >
              🗑 Sil
            </button>
          </div>
        )}

        {/* Bağımsız Bölüme Atama Overlay */}
        {bbAssignRoomId === room.id && (
          <div
            style={{
              position: "absolute",
              top: "28px",
              right: "4px",
              background: "#ffffff",
              border: "1px solid #cbd5e1",
              borderRadius: "6px",
              boxShadow: "0 4px 12px rgba(0,0,0,0.12)",
              zIndex: 1001,
              display: "flex",
              flexDirection: "column",
              width: "180px",
              maxHeight: "220px",
              overflowY: "auto",
              padding: "4px 0"
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ padding: "4px 12px", fontSize: "10px", fontWeight: "700", color: "#94a3b8", textTransform: "uppercase" }}>
              Bağımsız Bölüme Ata
            </div>
            {room.bagimsizBolumId && (
              <button
                onClick={() => {
                  setBbAssignRoomId(null);
                  updateVariant((v) => M.assignRoomToBagimsizBolum(v, room.id, null));
                }}
                style={{ ...menuBtnStyle, color: "#ef4444" }}
              >
                ✕ Atamayı Kaldır
              </button>
            )}
            {bbList.length === 0 ? (
              <p style={{ fontSize: "10.5px", color: "#94a3b8", padding: "4px 12px", margin: 0 }}>Henüz bağımsız bölüm yok.</p>
            ) : (
              bbList.map((bb) => (
                <button
                  key={bb.id}
                  onClick={() => {
                    setBbAssignRoomId(null);
                    updateVariant((v) => M.assignRoomToBagimsizBolum(v, room.id, bb.id));
                  }}
                  style={{
                    ...menuBtnStyle,
                    fontWeight: room.bagimsizBolumId === bb.id ? 700 : 400,
                    color: room.bagimsizBolumId === bb.id ? "#2563eb" : "#334155"
                  }}
                >
                  🏢 {bb.kod} {room.bagimsizBolumId === bb.id ? "✓" : ""}
                </button>
              ))
            )}
            <div style={{ borderTop: "1px dashed #e2e8f0", margin: "2px 0" }} />
            <button
              onClick={() => {
                const kod = window.prompt("Yeni Bağımsız Bölüm No/Kod:", String(bbList.length + 1));
                if (!kod || !kod.trim()) return;
                setBbAssignRoomId(null);
                updateVariant((v) => {
                  const [next, id] = M.createEmptyBagimsizBolum(v, currentPage.name);
                  const withKod = M.updateBagimsizBolum(next, id, { kod: kod.trim() });
                  return M.assignRoomToBagimsizBolum(withKod, room.id, id);
                });
              }}
              style={{ ...menuBtnStyle, color: "#2563eb" }}
            >
              + Yeni Bağımsız Bölüm...
            </button>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="pro-roomlist" style={{ display: "flex", flexDirection: "column", gap: "8px", position: "relative" }}>
      {/* MEKÂNLAR Title + Add button */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", position: "relative" }}>
        <span style={{ fontSize: "11px", fontWeight: "700", color: "#475569", textTransform: "uppercase", letterSpacing: "0.05em" }}>
          MEKÂNLAR
        </span>
        <button
          onClick={() => {
            setShowAddMenu(!showAddMenu);
            setMenuStage("main");
          }}
          style={{
            background: "none",
            border: "none",
            color: "var(--primary-blue)",
            fontSize: "12px",
            fontWeight: "600",
            cursor: "pointer",
            padding: 0
          }}
        >
          + Mekân Ekle
        </button>

        {/* Floating Add Menu Popover */}
        {showAddMenu && (
          <div
            style={{
              position: "absolute",
              top: "24px",
              right: 0,
              background: "#ffffff",
              border: "1px solid #cbd5e1",
              borderRadius: "6px",
              boxShadow: "0 4px 12px rgba(0,0,0,0.12)",
              width: "180px",
              zIndex: 1000,
              padding: "6px"
            }}
          >
            {menuStage === "main" ? (
              <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                <button
                  onClick={() => setMenuStage("oda")}
                  style={{
                    background: "none",
                    border: "none",
                    padding: "8px",
                    textAlign: "left",
                    fontSize: "11.5px",
                    cursor: "pointer",
                    borderRadius: "4px",
                    width: "100%",
                    display: "flex",
                    justifyContent: "space-between"
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = "#f1f5f9")}
                  onMouseLeave={(e) => (e.currentTarget.style.background = "none")}
                >
                  <span>🚪 Yeni Oda</span>
                  <span style={{ color: "#94a3b8" }}>→</span>
                </button>
                <button
                  onClick={() => setMenuStage("ortak")}
                  style={{
                    background: "none",
                    border: "none",
                    padding: "8px",
                    textAlign: "left",
                    fontSize: "11.5px",
                    cursor: "pointer",
                    borderRadius: "4px",
                    width: "100%",
                    display: "flex",
                    justifyContent: "space-between"
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = "#f1f5f9")}
                  onMouseLeave={(e) => (e.currentTarget.style.background = "none")}
                >
                  <span>🏢 Yeni Ortak Alan</span>
                  <span style={{ color: "#94a3b8" }}>→</span>
                </button>
                <button
                  onClick={handleCreateCustom}
                  style={{
                    background: "none",
                    border: "none",
                    padding: "8px",
                    textAlign: "left",
                    fontSize: "11.5px",
                    cursor: "pointer",
                    borderRadius: "4px",
                    width: "100%"
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = "#f1f5f9")}
                  onMouseLeave={(e) => (e.currentTarget.style.background = "none")}
                >
                  ✨ Özel Mekân...
                </button>
                <div style={{ borderTop: "1px dashed #e2e8f0", margin: "2px 0" }} />
                <button
                  onClick={handleCreateBB}
                  style={{
                    background: "none",
                    border: "none",
                    padding: "8px",
                    textAlign: "left",
                    fontSize: "11.5px",
                    cursor: "pointer",
                    borderRadius: "4px",
                    width: "100%",
                    color: "#2563eb"
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = "#f1f5f9")}
                  onMouseLeave={(e) => (e.currentTarget.style.background = "none")}
                >
                  🏢 Yeni Bağımsız Bölüm...
                </button>
              </div>
            ) : menuStage === "oda" ? (
              <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                <button
                  onClick={() => setMenuStage("main")}
                  style={{
                    background: "none",
                    border: "none",
                    padding: "6px",
                    textAlign: "left",
                    fontSize: "11px",
                    cursor: "pointer",
                    color: "#2563eb",
                    fontWeight: "600"
                  }}
                >
                  ← Geri Dön
                </button>
                {[
                  { id: "salon", label: "Salon" },
                  { id: "mutfak", label: "Mutfak" },
                  { id: "yatak_odasi", label: "Yatak Odası" },
                  { id: "oda", label: "Oda" },
                  { id: "banyo", label: "Banyo" },
                  { id: "tuvalet", label: "Antre" }
                ].map((preset) => (
                  <button
                    key={preset.id}
                    onClick={() => selectPredefinedType(preset.id, preset.label)}
                    style={{
                      background: "none",
                      border: "none",
                      padding: "6px 8px",
                      textAlign: "left",
                      fontSize: "11px",
                      cursor: "pointer",
                      borderRadius: "4px",
                      width: "100%"
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = "#f1f5f9")}
                    onMouseLeave={(e) => (e.currentTarget.style.background = "none")}
                  >
                    ● {preset.label}
                  </button>
                ))}
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                <button
                  onClick={() => setMenuStage("main")}
                  style={{
                    background: "none",
                    border: "none",
                    padding: "6px",
                    textAlign: "left",
                    fontSize: "11px",
                    cursor: "pointer",
                    color: "#2563eb",
                    fontWeight: "600"
                  }}
                >
                  ← Geri Dön
                </button>
                {[
                  { id: "siginak", label: "Sığınak" },
                  { id: "otopark", label: "Otopark" },
                  { id: "merdiven_ortak", label: "Merdiven" },
                  { id: "ic_asansor", label: "Asansör" },
                  { id: "guvenlik_odasi", label: "Güvenlik Odası" },
                  { id: "elektrik_merkezi", label: "Elektrik Merkezi" },
                  { id: "isi_merkezi", label: "Isı Merkezi" },
                  { id: "teknik_hacim", label: "Teknik Hacim" }
                ].map((preset) => (
                  <button
                    key={preset.id}
                    onClick={() => selectPredefinedType(preset.id, preset.label)}
                    style={{
                      background: "none",
                      border: "none",
                      padding: "6px 8px",
                      textAlign: "left",
                      fontSize: "11px",
                      cursor: "pointer",
                      borderRadius: "4px",
                      width: "100%"
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = "#f1f5f9")}
                    onMouseLeave={(e) => (e.currentTarget.style.background = "none")}
                  >
                    ● {preset.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Search Input */}
      <div style={{ position: "relative", marginBottom: "4px" }}>
        <input
          type="text"
          placeholder="Mekân ara..."
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

      {/* Lists — "Bu katta hangi mekanlar var?" sorusuna cevap veren 3 net bölüm
          (§ Wall/Room/BuildingOutline semantik ayrımı, 2026-08-11): MEKANLAR (henüz
          BB'ye atanmamış odalar — duvar kapanır kapanmaz burada görünür, "+ Mekân
          Ekle" ZORUNLU değildir), ORTAK ALANLAR, ve sadece gerçek BB gruplarını
          gösteren BAĞIMSIZ BÖLÜMLER. */}
      <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
        {/* MEKANLAR */}
        <div>
          <div style={{ fontSize: "10px", fontWeight: "700", color: "#94a3b8", letterSpacing: "0.03em", textTransform: "uppercase", marginBottom: "6px" }}>
            MEKANLAR
          </div>
          {unassignedBagimsiz.length === 0 ? (
            <p style={{ fontSize: "11px", color: "#94a3b8", paddingLeft: "4px", margin: "4px 0" }}>—</p>
          ) : (
            unassignedBagimsiz.map((r) => renderRoomRow(r))
          )}
        </div>

        {/* ORTAK ALANLAR */}
        <div>
          <div style={{ fontSize: "10px", fontWeight: "700", color: "#94a3b8", letterSpacing: "0.03em", textTransform: "uppercase", marginBottom: "6px" }}>
            ORTAK ALANLAR
          </div>
          {ortakRooms.length === 0 ? (
            <p style={{ fontSize: "11px", color: "#94a3b8", paddingLeft: "4px", margin: "4px 0" }}>—</p>
          ) : (
            ortakRooms.map((r) => renderRoomRow(r))
          )}
        </div>

        {/* BAĞIMSIZ BÖLÜMLER — sadece gerçek BB grupları, atanmamış odalar artık
            MEKANLAR'da görünüyor (§ madde 8, "kafa karıştıran" eski birleşik görünüm). */}
        <div>
          <div style={{ fontSize: "10px", fontWeight: "700", color: "#94a3b8", letterSpacing: "0.03em", textTransform: "uppercase", marginBottom: "6px" }}>
            BAĞIMSIZ BÖLÜMLER
          </div>
          {bbList.length === 0 ? (
            <p style={{ fontSize: "11px", color: "#94a3b8", paddingLeft: "4px", margin: "4px 0" }}>—</p>
          ) : (
            bbList.map((bb) => {
              const bbRooms = bagimsizByBB[bb.id] ?? [];
              const totalArea = bbRooms.reduce((sum, r) => sum + (r.manuelAlanM2 ?? roomAreaM2(r, variant.corners)), 0);
              return (
                <div key={bb.id} style={{ marginBottom: "8px" }}>
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      padding: "4px 6px",
                      background: "#f1f5f9",
                      borderRadius: "4px",
                      marginBottom: "4px"
                    }}
                  >
                    <span style={{ fontSize: "10.5px", fontWeight: "700", color: "#475569" }}>
                      🏢 {bb.kod}{" "}
                      <span style={{ fontWeight: "400", color: "#94a3b8" }}>
                        ({bb.tip === "MSKN" ? "Mesken" : "Ticari"} · {totalArea.toFixed(2)} m²)
                      </span>
                    </span>
                    <div style={{ display: "flex", gap: "2px" }}>
                      <button
                        onClick={() => handleRenameBB(bb)}
                        title="Yeniden Adlandır"
                        style={{ background: "none", border: "none", cursor: "pointer", fontSize: "11px", padding: "2px", color: "#94a3b8" }}
                      >
                        ✏️
                      </button>
                      <button
                        onClick={() => handleDeleteBB(bb)}
                        title="Bağımsız Bölümü Sil"
                        style={{ background: "none", border: "none", cursor: "pointer", fontSize: "11px", padding: "2px", color: "#94a3b8" }}
                      >
                        🗑
                      </button>
                    </div>
                  </div>
                  {bbRooms.length === 0 ? (
                    <p style={{ fontSize: "10.5px", color: "#cbd5e1", paddingLeft: "8px", margin: "2px 0 4px" }}>Henüz oda atanmadı</p>
                  ) : (
                    <div style={{ paddingLeft: "8px" }}>{bbRooms.map((r) => renderRoomRow(r))}</div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}

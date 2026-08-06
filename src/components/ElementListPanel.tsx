// "Elementleri Listele" (§4.8): mevcut kattaki tüm çizim nesnelerinin aranabilir
// tablo görünümü. Bir satıra tıklamak o nesneyi tuvalde seçer.

import { useMemo, useState } from "react";
import { useStore, type Selection } from "../engine/store";
import { getRoomType } from "../data/roomTypes";
import { roomAreaM2 } from "../engine/render2d";
import { dist } from "../engine/geometry";

interface Row {
  sel: Selection;
  tur: string;
  ad: string;
  detay: string;
}

export default function ElementListPanel({ onClose }: { onClose: () => void }) {
  const variant = useStore((s) => s.currentVariant());
  const roomTypes = useStore((s) => s.roomTypes);
  const catalog = useStore((s) => s.catalog);
  const selectSingle = useStore((s) => s.selectSingle);
  const deleteSelection = useStore((s) => s.deleteSelection);
  const [arama, setArama] = useState("");

  const rows = useMemo<Row[]>(() => {
    const out: Row[] = [];

    for (const room of Object.values(variant.rooms)) {
      const tip = getRoomType(roomTypes, room.typeId);
      const alan = room.manuelAlanM2 ?? roomAreaM2(room, variant.corners);
      out.push({
        sel: { type: "room", id: room.id },
        tur: "Oda",
        ad: room.name,
        detay: `${tip.label} · ${alan.toFixed(2)} m² · H=${room.height} cm`,
      });
    }

    for (const wall of Object.values(variant.walls)) {
      const a = variant.corners[wall.a];
      const b = variant.corners[wall.b];
      const uzunluk = a && b ? Math.round(dist(a, b)) : 0;
      out.push({
        sel: { type: "wall", id: wall.id },
        tur: "Duvar",
        ad: `Duvar ${wall.id.slice(-4)}`,
        detay: `${uzunluk} cm · ${wall.thickness} cm kalınlık`,
      });
    }

    for (const comp of Object.values(variant.components)) {
      const kategori = catalog.find((c) => c.id === comp.tip);
      const altTip = kategori?.subtypes.find((s) => s.id === comp.altTip);
      out.push({
        sel: { type: "component", id: comp.id },
        tur: kategori?.label ?? comp.tip,
        ad: altTip?.label ?? comp.altTip,
        detay:
          comp.konum.kind === "duvar"
            ? `Duvarda · ${Math.round(comp.konum.offsetCm)} cm`
            : `Zeminde · X ${Math.round(comp.konum.x)} Y ${Math.round(comp.konum.y)}`,
      });
    }

    return out;
  }, [variant, roomTypes, catalog]);

  const filtreli = useMemo(() => {
    const q = arama.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => `${r.tur} ${r.ad} ${r.detay}`.toLowerCase().includes(q));
  }, [rows, arama]);

  return (
    <>
      <div className="modal-backdrop" onPointerDown={onClose} />
      <div className="element-list-panel">
        <div className="element-list-header">
          <h3>Elementler ({filtreli.length}/{rows.length})</h3>
          <button className="icon-btn" onClick={onClose} title="Kapat">
            ✕
          </button>
        </div>
        <input
          className="catalog-search"
          placeholder="Ara (tür, ad, ölçü)..."
          value={arama}
          onChange={(e) => setArama(e.target.value)}
        />
        <div className="element-list-body">
          {filtreli.length === 0 && <p className="hint-text">Kayıt bulunamadı.</p>}
          {filtreli.map((r, i) => (
            <div key={i} className="element-row">
              <button
                className="element-row-main"
                onClick={() => {
                  selectSingle(r.sel);
                  onClose();
                }}
              >
                <span className="element-row-tur">{r.tur}</span>
                <span className="element-row-ad">{r.ad}</span>
                <span className="element-row-detay">{r.detay}</span>
              </button>
              <button
                className="element-row-del"
                title="Sil"
                onClick={() => {
                  selectSingle(r.sel);
                  deleteSelection();
                }}
              >
                🗑
              </button>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

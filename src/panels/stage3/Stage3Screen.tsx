import { useState } from "react";
import { useStore } from "../../engine/core/store";
import { computePageSummaries, computeRoomRows, computeTaksKaks } from "../../engine/drawing/reports";

const SELECTABLE = [
  { id: "oda", label: "Oda", icon: "▦" },
  { id: "bb", label: "Bağımsız Bölüm", icon: "▤" },
  { id: "ortak", label: "Ortak Alan", icon: "▥" },
  { id: "bina", label: "Bina", icon: "▧" },
  { id: "parsel", label: "Parsel", icon: "⬚" },
] as const;

export default function Stage3Screen() {
  const pages = useStore((s) => s.pages);
  const parsel = useStore((s) => s.parsel);
  const pushToast = useStore((s) => s.pushToast);

  const [selectable, setSelectable] = useState<(typeof SELECTABLE)[number]["id"]>("oda");
  // Ada/Parsel no ve çekme mesafeleri veri modelinde henüz gerçek karşılığı
  // olmayan alanlar — EPSG alanlarıyla aynı mantıkla görsel/kozmetik bırakıldı
  // (§ onaylanan ürün kararı). Parsel Alanı ise gerçek `parsel.areaM2`'den okunur.
  const [adaParsel, setAdaParsel] = useState("214 / 7");
  const [cekmeMesafesi, setCekmeMesafesi] = useState("5.0");
  const [yapiYaklasma, setYapiYaklasma] = useState("3.0");

  const roomRows = computeRoomRows(pages);
  const pageSummaries = computePageSummaries(pages);
  const taksKaks = computeTaksKaks(pages, parsel.areaM2);

  const allBagimsizBolumler = pages.flatMap((p) => Object.values(p.drawing.bagimsizBolumler).map((bb) => ({ ...bb, pageName: p.name })));
  const bbNetAlan = (bb: (typeof allBagimsizBolumler)[number]) => {
    const page = pages.find((p) => p.name === bb.pageName);
    if (!page) return 0;
    return bb.odaIds.reduce((sum, roomId) => {
      const room = page.drawing.rooms[roomId];
      if (!room) return sum;
      const row = roomRows.find((r) => r.roomId === roomId);
      return sum + (row?.areaM2 ?? 0);
    }, 0);
  };

  return (
    <div className="stage-body" style={{ flex: 1 }}>
      <div className="panel" style={{ width: 230 }}>
        <div className="section-title">Seçilebilir</div>
        {SELECTABLE.map((s) => (
          <button key={s.id} className={`pbtn ${selectable === s.id ? "active" : ""}`} onClick={() => setSelectable(s.id)}>
            <span className="ic">{s.icon}</span>
            {s.label}
          </button>
        ))}

        <div className="section-title">Yapı</div>
        <div className="prop-card">
          <div className="stat">
            <span>Taban Alanı</span>
            <span className="v">{taksKaks.tabanAlaniM2.toFixed(2)} m²</span>
          </div>
          <div className="stat">
            <span>Toplam İnşaat Alanı</span>
            <span className="v">{taksKaks.toplamInsaatAlaniM2.toFixed(2)} m²</span>
          </div>
          <div className="stat">
            <span>Kat Sayısı</span>
            <span className="v">{taksKaks.katSayisi}</span>
          </div>
          <div className="stat">
            <span>TAKS</span>
            <span className="v">{taksKaks.taks.toFixed(2)}</span>
          </div>
          <div className="stat">
            <span>KAKS / Emsal</span>
            <span className="v">{taksKaks.kaks.toFixed(2)}</span>
          </div>
        </div>
        <button className="primary-btn" onClick={() => pushToast("Alanlar güncel (canlı veriden hesaplanır).", "bilgi")}>
          ↻ Alan Güncelle
        </button>
      </div>

      <div className="stage3-wrap">
        <div className="grid3">
          <div className="card">
            <h3>Odalar</h3>
            <table>
              <thead>
                <tr>
                  <th>Ad</th>
                  <th>Kat</th>
                  <th className="num">Alan</th>
                  <th className="num">Çevre</th>
                </tr>
              </thead>
              <tbody>
                {roomRows.length === 0 ? (
                  <tr>
                    <td colSpan={4} style={{ color: "var(--text-faint)" }}>
                      Henüz oda algılanmadı
                    </td>
                  </tr>
                ) : (
                  roomRows.map((r) => (
                    <tr key={r.roomId}>
                      <td>{r.roomName}</td>
                      <td>{r.pageName}</td>
                      <td className="num">{r.areaM2.toFixed(2)} m²</td>
                      <td className="num">{r.perimeterM.toFixed(2)} m</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <div className="card">
            <h3>Bağımsız Bölüm</h3>
            {allBagimsizBolumler.length === 0 ? (
              <div className="empty-state">Henüz bağımsız bölüm tanımlanmadı</div>
            ) : (
              allBagimsizBolumler.map((bb) => {
                const net = bbNetAlan(bb);
                return (
                  <div key={bb.id} style={{ marginBottom: 10 }}>
                    <div className="stat">
                      <span>Bağımsız Bölüm</span>
                      <span className="v">{bb.kod || bb.id}</span>
                    </div>
                    <div className="stat">
                      <span>Net Alan</span>
                      <span className="v">{net.toFixed(2)} m²</span>
                    </div>
                    <div className="stat">
                      <span>Brüt Alan (tahmini)</span>
                      <span className="v">{(net * 1.18).toFixed(2)} m²</span>
                    </div>
                    <div className="stat">
                      <span>Oda Sayısı</span>
                      <span className="v">{bb.odaIds.length}</span>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          <div className="card">
            <h3>Parsel</h3>
            <div className="stat">
              <span>Ada / Parsel</span>
              <span className="v">
                <input
                  value={adaParsel}
                  onChange={(e) => setAdaParsel(e.target.value)}
                  style={{ width: 70, background: "transparent", border: "none", color: "var(--accent)", textAlign: "right", fontFamily: "var(--mono)" }}
                />
              </span>
            </div>
            <div className="stat">
              <span>Alan</span>
              <span className="v">{parsel.areaM2.toFixed(1)} m²</span>
            </div>
            <div className="stat">
              <span>Genişlik / Derinlik</span>
              <span className="v">{(parsel.widthCm / 100).toFixed(1)} / {(parsel.lengthCm / 100).toFixed(1)} m</span>
            </div>
            <div className="stat">
              <span>Çekme Mesafesi</span>
              <span className="v">
                <input
                  value={cekmeMesafesi}
                  onChange={(e) => setCekmeMesafesi(e.target.value)}
                  style={{ width: 50, background: "transparent", border: "none", color: "var(--accent)", textAlign: "right", fontFamily: "var(--mono)" }}
                /> m
              </span>
            </div>
            <div className="stat">
              <span>Yapı Yaklaşma Sınırı</span>
              <span className="v">
                <input
                  value={yapiYaklasma}
                  onChange={(e) => setYapiYaklasma(e.target.value)}
                  style={{ width: 50, background: "transparent", border: "none", color: "var(--accent)", textAlign: "right", fontFamily: "var(--mono)" }}
                /> m
              </span>
            </div>
          </div>

          <div className="card">
            <h3>Kat Alanları</h3>
            <table>
              <thead>
                <tr>
                  <th>Kat</th>
                  <th className="num">Alan</th>
                </tr>
              </thead>
              <tbody>
                {pageSummaries.map((s) => (
                  <tr key={s.pageId}>
                    <td>{s.pageName}</td>
                    <td className="num">{s.totalAreaM2.toFixed(2)} m²</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}

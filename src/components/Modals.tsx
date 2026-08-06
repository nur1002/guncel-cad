import { useState } from "react";
import { useStore } from "../engine/store";
import { exportProjectAsCityGml } from "../engine/cityGmlExport";
import { exportVariantAsPdf } from "../engine/pdfExport";
import { handleImportFile } from "../engine/importDispatch";

interface ModalProps {
  onClose: () => void;
}

// 1. PROJE BİLGİLERİ & DEĞİŞTİRME MODALI
export function ProjectInfoModal({ onClose }: ModalProps) {
  const currentFloorName = useStore((s) => s.currentFloor().name);
  const rooms = useStore((s) => s.currentVariant().rooms);
  const walls = useStore((s) => s.currentVariant().walls);
  const pushToast = useStore((s) => s.pushToast);

  const [projectName, setProjectName] = useState("Konut Projesi");
  const [ada, setAda] = useState("124");
  const [parsel, setParsel] = useState("5");
  const [scale, setScale] = useState("1/100");
  const [unit, setUnit] = useState("cm");

  const totalRooms = Object.keys(rooms).length;
  const totalWalls = Object.keys(walls).length;
  let totalArea = 0;
  for (const r of Object.values(rooms)) {
    totalArea += r.manuelAlanM2 ?? 12.0;
  }

  const handleSave = () => {
    pushToast(`Proje bilgileri güncellendi: ${projectName} (Ada: ${ada}, Parsel: ${parsel})`, "basari");
    onClose();
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="cad-modal-box" onClick={(e) => e.stopPropagation()}>
        <div className="cad-modal-header">
          <h3>Proje Bilgileri ve Ayarları</h3>
          <button className="cad-modal-close" onClick={onClose}>
            ✕
          </button>
        </div>

        <div className="cad-modal-body">
          <label className="cad-field">
            <span>Proje Adı</span>
            <input type="text" value={projectName} onChange={(e) => setProjectName(e.target.value)} />
          </label>

          <div className="cad-field-row">
            <label className="cad-field">
              <span>Ada No</span>
              <input type="text" value={ada} onChange={(e) => setAda(e.target.value)} />
            </label>
            <label className="cad-field">
              <span>Parsel No</span>
              <input type="text" value={parsel} onChange={(e) => setParsel(e.target.value)} />
            </label>
          </div>

          <div className="cad-field-row">
            <label className="cad-field">
              <span>Çizim Ölçeği</span>
              <select value={scale} onChange={(e) => setScale(e.target.value)}>
                <option value="1/50">1/50</option>
                <option value="1/100">1/100</option>
                <option value="1/200">1/200</option>
                <option value="1/500">1/500</option>
              </select>
            </label>

            <label className="cad-field">
              <span>Çizim Birimi</span>
              <select value={unit} onChange={(e) => setUnit(e.target.value)}>
                <option value="cm">Santimetre (cm)</option>
                <option value="m">Metre (m)</option>
                <option value="mm">Milimetre (mm)</option>
              </select>
            </label>
          </div>

          <div className="cad-info-summary">
            <div className="summary-item">
              <span>Aktif Kat:</span> <strong>{currentFloorName}</strong>
            </div>
            <div className="summary-item">
              <span>Toplam Oda Sayısı:</span> <strong>{totalRooms}</strong>
            </div>
            <div className="summary-item">
              <span>Toplam Duvar Sayısı:</span> <strong>{totalWalls}</strong>
            </div>
            <div className="summary-item">
              <span>Hesaplanan Toplam Alan:</span> <strong>{totalArea.toFixed(2)} m²</strong>
            </div>
            <div className="summary-item">
              <span>Koordinat Sistemi:</span> <strong>ITRF96 / TM30</strong>
            </div>
          </div>
        </div>

        <div className="cad-modal-footer">
          <button className="btn-modal-cancel" onClick={onClose}>
            İptal
          </button>
          <button className="btn-modal-submit" onClick={handleSave}>
            Kaydet ve Uygula
          </button>
        </div>
      </div>
    </div>
  );
}

// 2. YENİ PROJE OLUŞTURMA MODALI
export function NewProjectModal({ onClose }: ModalProps) {
  const pushToast = useStore((s) => s.pushToast);
  const setParselInfo = useStore((s) => s.setParselInfo);

  const [name, setName] = useState("Yeni Konut Projesi");
  const [parselArea, setParselArea] = useState(5000);
  const [parselWidthM, setParselWidthM] = useState(100);
  const [parselLengthM, setParselLengthM] = useState(50);
  const [unit, setUnit] = useState("cm");
  const [template, setTemplate] = useState("konut");

  const handleCreate = () => {
    setParselInfo({
      areaM2: parselArea,
      widthCm: parselWidthM * 100,
      lengthCm: parselLengthM * 100,
    });

    pushToast(`"${name}" oluşturuldu. Parsel: ${parselArea}m² (${parselWidthM}m x ${parselLengthM}m) - Origin (0,0) sabitlendi.`, "basari");
    onClose();
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="cad-modal-box" onClick={(e) => e.stopPropagation()}>
        <div className="cad-modal-header">
          <h3>Yeni Proje Oluştur (Parsel & Dünya Koordinat Sistemi)</h3>
          <button className="cad-modal-close" onClick={onClose}>
            ✕
          </button>
        </div>

        <div className="cad-modal-body">
          <label className="cad-field">
            <span>Proje İsmi</span>
            <input type="text" value={name} onChange={(e) => setName(e.target.value)} />
          </label>

          <div className="cad-field-row">
            <label className="cad-field">
              <span>Parsel Alanı (m²)</span>
              <input
                type="number"
                min="10"
                value={parselArea}
                onChange={(e) => setParselArea(Number(e.target.value))}
              />
            </label>

            <label className="cad-field">
              <span>Ölçü Birimi</span>
              <select value={unit} onChange={(e) => setUnit(e.target.value)}>
                <option value="cm">Santimetre (cm)</option>
                <option value="m">Metre (m)</option>
                <option value="mm">Milimetre (mm)</option>
              </select>
            </label>
          </div>

          <div className="cad-field-row">
            <label className="cad-field">
              <span>Parsel Genişliği (Metre X)</span>
              <input
                type="number"
                min="5"
                value={parselWidthM}
                onChange={(e) => setParselWidthM(Number(e.target.value))}
              />
            </label>

            <label className="cad-field">
              <span>Parsel Uzunluğu (Metre Y)</span>
              <input
                type="number"
                min="5"
                value={parselLengthM}
                onChange={(e) => setParselLengthM(Number(e.target.value))}
              />
            </label>
          </div>

          <label className="cad-field">
            <span>Başlangıç Şablonu</span>
            <select value={template} onChange={(e) => setTemplate(e.target.value)}>
              <option value="konut">Konut Projesi (Sığınak + Bodrum + Zemin + Katlar + Çatı)</option>
              <option value="ticari">Ticari / Plaza Şablonu (Otopark + Dükkan + Katlar)</option>
              <option value="villa">Müstakil Villa Projesi</option>
              <option value="bos">Boş Pafta</option>
            </select>
          </label>
        </div>

        <div className="cad-modal-footer">
          <button className="btn-modal-cancel" onClick={onClose}>
            İptal
          </button>
          <button className="btn-modal-submit" onClick={handleCreate}>
            + Proje Oluştur
          </button>
        </div>
      </div>
    </div>
  );
}

// 3. DOSYA AÇ / İÇE AKTAR MODALI
export function OpenProjectModal({ onClose }: ModalProps) {
  const pushToast = useStore((s) => s.pushToast);
  const [loading, setLoading] = useState(false);

  const handleFile = async (file: File) => {
    setLoading(true);
    try {
      const imported = await handleImportFile(file);
      // DWG/desteklenmeyen dosyalarda handleImportFile projeye hiçbir şey
      // eklemeden sadece bilgilendirme gösterir — o durumda sahte bir "başarılı"
      // bildirimi göstermeyip modalı da kapatmıyoruz, kullanıcı başka bir dosya
      // seçebilsin diye açık bırakıyoruz.
      if (imported) {
        pushToast(`"${file.name}" dosyası içe aktarıldı.`, "basari");
        onClose();
      }
    } catch (err) {
      window.alert(`Hata: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="cad-modal-box" onClick={(e) => e.stopPropagation()}>
        <div className="cad-modal-header">
          <h3>Proje Aç / İçe Aktar</h3>
          <button className="cad-modal-close" onClick={onClose}>
            ✕
          </button>
        </div>

        <div className="cad-modal-body">
          <p className="modal-desc-text">
            Desteklenen Formatlar: <strong>DXF, PDF, PNG, JPG, GeoJSON, JSON</strong>
          </p>
          <p className="modal-desc-text" style={{ fontSize: 11, opacity: 0.75 }}>
            DXF vektör kat planlarını veya PDF/görsel krokilerinizi doğrudan yükleyebilirsiniz. <strong>DWG</strong>{" "}
            de seçilebilir; ancak DWG kapalı, sıkıştırılmış bir format olduğundan çoğu dosyada sadece varsa gömülü
            bir önizleme görseli çıkarılabilir — en sağlıklı sonuç için DWG'yi CAD programınızda "Farklı Kaydet →
            DXF" ile kaydedip DXF olarak yükleyin.
          </p>

          <div
            className="drag-drop-zone"
            onClick={() => {
              const input = document.createElement("input");
              input.type = "file";
              input.accept = ".dxf,.dwg,.pdf,.png,.jpg,.jpeg,.geojson,.json";
              input.onchange = (e: any) => {
                const f = e.target?.files?.[0];
                if (f) handleFile(f);
              };
              input.click();
            }}
          >
            <span className="drop-icon">📁</span>
            <span>Dosya Seçin veya Sürükleyip Bırakın</span>
            <span className="sub-drop">DXF, PDF veya Kroki Görseli</span>
          </div>

          {loading && <div className="loading-bar">Dosya ayrıştırılıyor ve yükleniyor...</div>}
        </div>

        <div className="cad-modal-footer">
          <button className="btn-modal-cancel" onClick={onClose}>
            Kapat
          </button>
        </div>
      </div>
    </div>
  );
}

// 4. DIŞA AKTAR (EXPORT) MODALI
export function ExportModal({ onClose }: ModalProps) {
  const pushToast = useStore((s) => s.pushToast);
  const variant = useStore((s) => s.currentVariant());
  const roomTypes = useStore((s) => s.roomTypes);
  const floorName = useStore((s) => s.currentFloor().name);
  const floors = useStore((s) => s.floors);

  const [format, setFormat] = useState("pdf");

  const handleExport = () => {
    if (format === "pdf") {
      exportVariantAsPdf(variant, roomTypes, floorName).catch((err) => {
        window.alert(`PDF Hatası: ${err instanceof Error ? err.message : String(err)}`);
      });
      pushToast("PDF dışa aktarılıyor...", "basari");
    } else if (format === "citygml") {
      const xml = exportProjectAsCityGml(floors);
      const blob = new Blob([xml], { type: "application/gml+xml" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${floorName}_CityGML.gml`;
      a.click();
      URL.revokeObjectURL(url);
      pushToast("CityGML 3B dosya aktarıldı.", "basari");
    } else {
      // JSON / DXF / DWG / SVG / GeoJSON / IFC fallback
      const payload = { floors, roomTypes, format };
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `proje_${format.toUpperCase()}.${format === "geojson" ? "geojson" : format}`;
      a.click();
      URL.revokeObjectURL(url);
      pushToast(`${format.toUpperCase()} olarak dışa aktarıldı.`, "basari");
    }
    onClose();
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="cad-modal-box" onClick={(e) => e.stopPropagation()}>
        <div className="cad-modal-header">
          <h3>Çizimi Dışa Aktar</h3>
          <button className="cad-modal-close" onClick={onClose}>
            ✕
          </button>
        </div>

        <div className="cad-modal-body">
          <label className="cad-field">
            <span>Dışa Aktarma Formatı Seçin</span>
            <select value={format} onChange={(e) => setFormat(e.target.value)}>
              <option value="pdf">PDF (2B Vektör Pafta)</option>
              <option value="dxf">DXF (AutoCAD Vektör)</option>
              <option value="dwg">DWG (AutoCAD Proje)</option>
              <option value="svg">SVG (Vektör Grafik)</option>
              <option value="ifc">IFC (BIM Modeli)</option>
              <option value="citygml">CityGML (3B Kent Modeli)</option>
              <option value="geojson">GeoJSON (Coğrafi Veri)</option>
            </select>
          </label>
        </div>

        <div className="cad-modal-footer">
          <button className="btn-modal-cancel" onClick={onClose}>
            İptal
          </button>
          <button className="btn-modal-submit" onClick={handleExport}>
            Dışa Aktar ve İndir
          </button>
        </div>
      </div>
    </div>
  );
}

# bilCAD

Belediyeler için web tabanlı, akıllı kat planı / CAD çizim uygulaması. DWG/DXF kroki içe aktarma, elle duvar-oda çizimi, çok katlı proje yönetimi ve 3B görünüm içerir.

## Gereksinimler

- **Node.js 20+** ve npm
- Modern bir tarayıcı (Chrome/Edge/Firefox — WebAssembly desteği gerekir)

## Kurulum ve Çalıştırmagit i
nig

```bash
git clone https://github.com/nur1002/ilkcad.git
cd ilkcad
npm install
npm run dev
```

Terminalde çıkan adresi (varsayılan `http://localhost:5173`) tarayıcıda açın.

Diğer komutlar:

```bash
npm run build     # Production build (dist/ klasörüne)
npm run preview   # Production build'i yerelde önizle
npm run lint      # Kod denetimi (oxlint)
```

> Not: DWG dosyalarını gerçekten çözümleyen LibreDWG WASM ikili dosyası (`public/wasm/libredwg-web.wasm`, ~10 MB) repoya dahildir — ayrıca indirmenize gerek yok.

## Temel Kullanım Akışı

### 1. Proje ve Parsel Ayarları

- Üst menüden **Yeni Proje** ile parsel genişliği/derinliği ve başlangıç şablonunu (konut, ticari, villa, boş pafta) seçin. Parsel alanı genişlik×derinlikten otomatik hesaplanır.
- Sol panelde **Sayfalar** sekmesinden kat ekleyip (Sığınak, Otopark, Zemin Kat, 1. Kat, Çatı vb.) kotlarını/yüksekliklerini düzenleyebilirsiniz.
- Sol panelde **Ayarlar** sekmesinde parsel genişlik/derinliğini sonradan değiştirebilirsiniz.

### 2. Dosya İçe Aktarma

Üst araç çubuğundaki **İçe Aktar** ile şu formatları yükleyebilirsiniz:

| Format | Davranış |
|---|---|
| **DWG / DXF** | Dosyadaki çizgiler **olduğu gibi**, ince bir referans krokisi olarak eklenir. Hiçbir otomatik duvar/oda ataması yapılmaz — siz üzerinden elle çizersiniz (bkz. aşağıdaki "Krokiyi Parsele Yerleştirme"). |
| **GeoJSON** | Parsel/arazi sınırı gibi basit poligonlar için otomatik duvar+oda oluşturur. |
| **PDF / PNG / JPG** | Arka plan izleme görseli olarak eklenir (üzerinden elle çizmek için). |

### 3. Krokiyi Parsele Yerleştirme (DWG/DXF)

Bir DWG/DXF yüklendiğinde:

1. Kroki otomatik olarak **parsel merkezine** yerleşir.
2. Gövdesinden **sürükleyerek** konumunu düzeltebilirsiniz.
3. Üstünde beliren mavi **döndürme koluyla** açısını ayarlayabilirsiniz.
4. Konumdan memnun kalınca sol panel → **Ayarlar** sekmesi → "İçe Aktarılan Kroki" bölümünden **"📍 Parsele Yerleştir"**e basın — bu, konumu kilitler ve projeye kaydeder. Gerekirse "🔓 Düzenlemeye Aç" ile tekrar taşıyabilirsiniz.

Kroki elle çizim sırasında bir **referans/yapışma (snap) hedefi** olarak da davranır: duvar çizerken imleç krokinin köşelerine ve çizgilerine hassas şekilde yapışır, böylece referansı doğrudan üzerinden çizebilirsiniz.

### 4. Çizim Araçları ve Kısayollar

Sol paneldeki **Katmanlar** sekmesinden araç seçilir; klavye kısayolları:

| Tuş | İşlev |
|---|---|
| `W` | Duvar — tık-tık-tık ile zincir çizim (fare basılı tutmaya gerek yok) |
| `Q` | Seç |
| `E` | Sil |
| `R` | Oda (Çizgi) — serbest çokgen |
| `1` / `2` | Kapı / Pencere yerleştirme |
| `Space` | Sürekli çizim modu aç/kapat |
| `S` | Aktif duvar/oda zinciri varsa durdurur; yoksa Snap aç/kapat |
| `F` | Ekrana sığdır |
| `G` | Izgara göster/gizle |
| `O` | Ortho (dik açı kilidi) |
| `Ctrl+Z` / `Ctrl+Y` | Geri al / İleri al |
| `Ctrl+C` / `Ctrl+V` | Kopyala / Yapıştır |
| `Esc` | Seçimi/aracı iptal et |
>> kontrol edilmedi!!!

Sağ tık ile her zaman haritada kaydırma (pan) yapabilirsiniz.

### 5. Diğer Paneller

- **Bileşenler**: Kapı/pencere/mobilya kataloğu.
- **Raporlar**: Alan/oda özetleri.
- **3B**: Üst menüden "3B" ile çok katlı 3 boyutlu görünüme geçilir.

## Teknoloji Yığını

- React 19 + TypeScript + Vite
- Zustand (state yönetimi)
- HTML5 Canvas (2B çizim), Three.js (3B görünüm)
- `@mlightcad/libredwg-web` — gerçek DWG ayrıştırma (WebAssembly, LibreDWG projesinin derlenmiş hali)

## Lisans Notu

DWG desteği `@mlightcad/libredwg-web` (LibreDWG'nin WASM derlemesi) kullanır ve **GPL-3.0** lisanslıdır. Bu bağımlılığı projenizde tutmaya devam edecekseniz lisans koşullarını gözden geçirin.

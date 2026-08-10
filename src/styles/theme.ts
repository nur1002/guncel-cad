// Tasarım sistemi renk sabitleri (§9). CSS tarafında aynı değerler
// src/styles/stage-theme.css içindeki :root değişkenleriyle (--bg, --border,
// --border-soft vb.) senkron tutulur — canvas fillStyle/strokeStyle doğrudan
// CSS değişkeni okuyamadığı için burada da tutuluyor. Koyu tema (Stage 2
// prototip kabuğuyla birebir) — tek değişiklik noktası burasıdır.

export const COLOR_INK = "#E7E9EF"; // mürekkep: metin/çizgi (--text)
export const COLOR_BLUEPRINT = "#6FA8D0"; // mavi baskı: vurgu, yükseklik etiketi
export const COLOR_RUST = "#E2884F"; // pas: aksiyon/seçili/alan etiketi
export const COLOR_GRID = "#1b2130"; // ince ızgara çizgisi (--border-soft)
export const COLOR_GRID_MAJOR = "#232a3a"; // her 5 adımda bir kalın ana çizgi (--border)
export const COLOR_ORIGIN_AXIS = "#3a4258"; // dünya orijini (0,0) eksen çizgileri
export const COLOR_CANVAS_BG = "#0a0d14"; // (--bg)
export const COLOR_REF_BAND = "#161c28"; // mimari referans kadranı şerit zemini (--panel-2)

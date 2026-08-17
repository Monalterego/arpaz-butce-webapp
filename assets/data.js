/* =====================================================================
   VERİ KATMANI — GERÇEK DEMO VERİ
   ---------------------------------------------------------------------
   Kaynak: Demo Gerçek Veri.xlsx (2025-07..2026-07, 13 ay ortalaması).
   Gerçek veri assets/realdata.js içinde REAL_DATA olarak bulunur.
   Satır şeması (app.js ile uyumlu): [ Ad, StokAdet, SatışAdet, SatışTutar, Marj%, İndirim% ]
     → Brüt Kâr = SatışTutar × Marj% (sentetik; IT gerçeğini verene kadar).
   IT tam veri verince: realdata.js yenilenir ya da loadMixFor içi fetch'e çevrilir.
   ===================================================================== */

// Kampanya / Özel Gün takvimi (2021+ mantığı, prototip):
const CALENDAR = [
  ["Ocak",   "Yılbaşı Devri",      "Sezon Sonu", "İndirim Dönemi",            "Bundle +",   "0,95x"],
  ["Mart",   "8 Mart / Bahar",     "Event",      "Küçük Ev Aletleri Kampanya","Event +8%",  "1,08x"],
  ["Nisan",  "Ramazan",            "Event",      "Mutfak & Beyaz Eşya",       "Event +12%", "1,15x"],
  ["Mayıs",  "Anneler Günü",       "Event",      "Süpürge / Mutfak",          "Paro +10%",  "1,12x"],
  ["Haziran","Yaz Sezonu / Klima", "Sezon",      "Klima Push",                "Kota ayı",   "1,25x"],
  ["Eylül",  "Okula Dönüş",        "Event",      "Çamaşır & Bulaşık",         "Bundle +6%", "1,06x"],
  ["Kasım",  "Efsane Cuma",        "Kampanya",   "Yıl Sonu Büyük İndirim",    "Paro +18%",  "1,35x"],
  ["Aralık", "Yılbaşı",            "Event",      "Hediyelik / TV",            "Event +14%", "1,18x"],
];

// Perakende / Toptan rasyosu (pandemi sonrası, prototip):
const RATIO = [
  ["2021", 38, 62, "Pandemi çıkışı, toptan ağırlıklı"],
  ["2022", 42, 58, "Perakende toparlanıyor"],
  ["2023", 46, 54, "Dengelenme"],
  ["2024", 49, 51, "Perakende payı artışta"],
  ["2025", 52, 48, "Perakende çoğunlukta"],
  ["2026", 54, 46, "Trend yukarı"],
];

const MONTHS = ['Oca','Şub','Mar','Nis','May','Haz','Tem','Ağu','Eyl','Eki','Kas','Ara'];
const SEASONAL_INDEX = [0.9, 0.85, 1.05, 1.10, 1.05, 1.20, 1.15, 0.95, 1.00, 0.95, 1.35, 1.15];

const DataService = {
  loadMix()      { return this.loadMixFor(this.firstSelection(), "uh4"); },
  loadCalendar() { return CALENDAR; },
  loadRatio()    { return RATIO; },
  months()       { return MONTHS; },
  seasonal()     { return SEASONAL_INDEX; },

  firstSelection() {
    const uh1 = Object.keys(HIERARCHY)[0];
    const uh2 = Object.keys(HIERARCHY[uh1])[0];
    return { uh1, uh2, uh3: "" };
  },

  // REAL_DATA'yı seçime göre süzer ve satır şemasına indirger.
  // level: 'uh4' | 'uh3' | 'uh2'
  loadMixFor(sel, level) {
    const src = (typeof REAL_DATA !== "undefined" ? REAL_DATA : []);
    const inSel = src.filter((d) =>
      d.uh1 === sel.uh1 &&
      (level === "uh2" ? true : d.uh2 === sel.uh2) &&
      (!sel.uh3 || level === "uh2" ? true : d.uh3 === sel.uh3)
    );

    if (level === "uh4") {
      // ÜH4 satırları doğrudan
      return inSel.map((d) => [d.uh4, d.stok_adet, d.satis_adet, d.satis_tutar, d.marj, d.indirim]);
    }

    // uh3 veya uh2: alt grubu topla (marj ve indirim satış tutarına göre ağırlıklı)
    const keyOf = (d) => (level === "uh2" ? d.uh2 : d.uh3);
    const map = new Map();
    inSel.forEach((d) => {
      const k = keyOf(d);
      if (!map.has(k)) map.set(k, { stok: 0, satis: 0, tutar: 0, mW: 0, dW: 0 });
      const o = map.get(k);
      o.stok += d.stok_adet; o.satis += d.satis_adet; o.tutar += d.satis_tutar;
      o.mW += d.marj * d.satis_tutar; o.dW += d.indirim * d.satis_tutar;
    });
    const out = [];
    map.forEach((o, k) => {
      const marj = o.tutar > 0 ? Math.round(o.mW / o.tutar) : 20;
      const ind = o.tutar > 0 ? Math.round(o.dW / o.tutar) : 8;
      out.push([k, o.stok, o.satis, o.tutar, marj, ind]);
    });
    return out;
  },
};

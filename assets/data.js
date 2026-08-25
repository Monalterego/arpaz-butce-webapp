/* =====================================================================
   VERİ KATMANI — GERÇEK DEMO VERİ (ORG × BÖLGE × ÜH4)
   ---------------------------------------------------------------------
   Kaynak: Demo Gerçek Veri.xlsx (2025-07..2026-07, 13 ay ort).
   realdata.js: ORGS, REGIONS, REAL_DATA (org, region, uh1..uh4, metrikler).
   Teşkilat seçimi (org + bölge) metrikleri gerçekten filtreler.
   "Tümü" = ilgili boyutta toplam. Brüt kâr sentetiktir (marj ile).
   Satır şeması (app.js ile uyumlu): [ Ad, StokAdet, SatışAdet, SatışTutar, Marj%, İndirim% ]
   ===================================================================== */

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
const MONTHS = ['Oca','Şub','Mar','Nis','May','Haz','Tem','Ağu','Eyl','Eki','Kas','Ara'];
const SEASONAL_INDEX = [0.9, 0.85, 1.05, 1.10, 1.05, 1.20, 1.15, 0.95, 1.00, 0.95, 1.35, 1.15];

const DataService = {
  // Teşkilat seçimi (app.js günceller). "" = Tümü.
  _org: "",     // "" | "Arçelik" | "Beko"
  _region: "",  // "" | bölge adı

  loadCalendar() { return CALENDAR; },
  months()       { return MONTHS; },
  seasonal()     { return SEASONAL_INDEX; },
  orgs()         { return (typeof ORGS !== "undefined") ? ORGS : []; },
  regions()      { return (typeof REGIONS !== "undefined") ? REGIONS : []; },

  firstSelection() {
    const uh1 = Object.keys(HIERARCHY)[0];
    const uh2 = Object.keys(HIERARCHY[uh1])[0];
    return { uh1, uh2, uh3: "" };
  },
  setOrg(org)       { this._org = org || ""; },
  setRegion(region) { this._region = region || ""; },

  loadMix()      { return this.loadMixFor(this.firstSelection(), "uh4"); },

  // Teşkilat + ürün seçimine göre süz, satır şemasına indir.
  loadMixFor(sel, level) {
    const src = (typeof REAL_DATA !== "undefined" ? REAL_DATA : []);
    const norm = (value) => String(value || "")
      .toLocaleLowerCase("tr-TR")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/\s+/g, " ")
      .trim();
    const inSel = src.filter((d) =>
      (!this._org || norm(d.org) === norm(this._org)) &&
      (!this._region || norm(d.region) === norm(this._region)) &&
      norm(d.uh1) === norm(sel.uh1) &&
      (level === "uh2" ? true : norm(d.uh2) === norm(sel.uh2)) &&
      ((!sel.uh3 || level === "uh2") ? true : norm(d.uh3) === norm(sel.uh3))
    );

    // Org/bölge "Tümü" ise aynı ÜH4 birden çok satırda gelir → grupla-topla.
    const groupKey = (d) =>
      level === "uh2" ? d.uh2 : level === "uh3" ? d.uh3 : d.uh4;

    const map = new Map();
    inSel.forEach((d) => {
      const k = groupKey(d);
      if (!map.has(k)) map.set(k, { stok: 0, satis: 0, tutar: 0, mW: 0, dW: 0 });
      const o = map.get(k);
      o.stok += d.stok_adet; o.satis += d.satis_adet; o.tutar += d.satis_tutar;
      o.mW += d.marj * d.satis_tutar; o.dW += d.indirim * d.satis_tutar;
    });

    const out = [];
    map.forEach((o, k) => {
      const marj = o.tutar > 0 ? Math.round(o.mW / o.tutar) : 20;
      const ind = o.tutar > 0 ? Math.round(o.dW / o.tutar) : 8;
      out.push([k, Math.max(1, o.stok), Math.max(1, o.satis), o.tutar, marj, ind]);
    });
    return out;
  },
};

/* =====================================================================
   VERİ KATMANI — GERÇEK DEMO VERİ (ORG × BÖLGE × ÜH4, AY BAZLI)
   ---------------------------------------------------------------------
   Kaynak: TPM_Data.xlsx (2026-01..2026-08).
   realdata.js: ORGS, REGIONS, REAL_DATA (org, region, uh1..uh4, marj,
   indirim + `aylar` alt-objesi: { "YYYY-MM": {satis_adet, satis_tutar,
   stok_adet, toptan_adet, toptan_tutar, brut_kar}, ... }).
   Teşkilat seçimi (org + bölge) ve PERİYOT seçimi metrikleri gerçekten filtreler.
   "Tümü" = ilgili boyutta toplam. Brüt kâr sentetiktir (marj ile).
   Satır şeması (app.js ile uyumlu, DEĞİŞMEDİ):
     [ Ad, StokAdet, SatışAdet, SatışTutar, Marj%, İndirim% ]
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
  // Periyot seçimi. "" (varsayılan) = "TUM_YIL" ile AYNI davranır —
  // UI henüz bağlı değil, bağlanana kadar ekran tüm dönemi görür.
  _period: "",  // "" | "2026-01" | ... | "TUM_YIL"

  loadCalendar() { return CALENDAR; },
  months()       { return MONTHS; },
  seasonal()     { return SEASONAL_INDEX; },
  orgs()         { return (typeof ORGS !== "undefined") ? ORGS : []; },
  regions()      { return (typeof REGIONS !== "undefined") ? REGIONS : []; },

  // REAL_DATA'daki TÜM kayıtların `aylar` anahtarlarının BİRLEŞİMİ, kronolojik.
  availablePeriods() {
    const src = (typeof REAL_DATA !== "undefined" ? REAL_DATA : []);
    const set = new Set();
    src.forEach((d) => Object.keys(d.aylar || {}).forEach((k) => set.add(k)));
    return Array.from(set).sort();
  },

  firstSelection() {
    const uh1 = Object.keys(HIERARCHY)[0];
    const uh2 = Object.keys(HIERARCHY[uh1])[0];
    return { uh1, uh2, uh3: "" };
  },
  setOrg(org)       { this._org = org || ""; },
  setRegion(region) { this._region = region || ""; },
  setPeriod(p)      { this._period = p || ""; },

  // Türkçe locale'e duyarlı normalize — hiyerarşi adları ile veri adlarını
  // eşleştiren TEK yer. tr-TR küçültme ŞART: noktalı "İ" ile noktasız "I"
  // aksi halde asla eşleşmez (bkz. CLAUDE.md Bölüm 4 DERS notu).
  _norm(value) {
    return String(value || "")
      .toLocaleLowerCase("tr-TR")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/\s+/g, " ")
      .trim();
  },

  // Bir kaydı bir periyoda göre düz metriklere indirger.
  //  - TUM_YIL (ve varsayılan ""): stok = EN SON ayın stoğu (ortalama DEĞİL),
  //    satış adet/tutar/toptan = mevcut ayların TOPLAMI ÷ o kaydın KENDİ mevcut
  //    ay sayısı (akış metriklerinin AYLIK ORTALAMASI).
  //  - Belirli ay: o ayın değerleri; kayıtta o ay YOKSA hepsi 0 (hata fırlatılmaz).
  // `period` verilmezse aktif seçim (this._period) kullanılır — mevcut çağrılar
  // (loadMixFor) bu yüzden DEĞİŞMEDİ. lyMetricsFor ise satırın KENDİ baz
  // periyodunu dışarıdan geçer, aktif sidebar seçimini kullanmaz.
  _periodMetrics(d, period) {
    const p = (period === undefined || period === null) ? this._period : period;
    const aylar = d.aylar || {};
    const keys = Object.keys(aylar).sort();
    if (!keys.length) return { stok: 0, satis: 0, tutar: 0, toptan: 0 };

    if (!p || p === "TUM_YIL") {
      const son = aylar[keys[keys.length - 1]] || {};
      let sa = 0, st = 0, ta = 0;
      keys.forEach((k) => {
        sa += (aylar[k].satis_adet || 0);
        st += (aylar[k].satis_tutar || 0);
        ta += (aylar[k].toptan_adet || 0);
      });
      return { stok: (son.stok_adet || 0), satis: sa / keys.length, tutar: st / keys.length, toptan: ta / keys.length };
    }

    const ay = aylar[p];
    if (!ay) return { stok: 0, satis: 0, tutar: 0, toptan: 0 };
    return {
      stok:   (ay.stok_adet    || 0),
      satis:  (ay.satis_adet   || 0),
      tutar:  (ay.satis_tutar  || 0),
      toptan: (ay.toptan_adet  || 0),
    };
  },

  // --- LY (GERÇEKLEŞEN) ARAMA — Toptan/Revize rollup'ının "Geçen Sene" tarafı ---
  // Rollup satırları KAYITTAN gelir ve içlerinde LY toptan adedi YOKTUR; bu veri
  // yalnızca REAL_DATA'da (aylar[].toptan_adet) durur. app.js REAL_DATA'ya
  // doğrudan erişmez (CLAUDE.md Bölüm 3), o yüzden kapı burasıdır.
  //
  // Neden loadMixFor yetmiyor: o, aktif sidebar seçimine + aktif periyoda göre
  // TÜM bir seviyeyi döndürür ve toptan_adet'i şemasında taşımaz. Rollup ise
  // satır satır, her satırın KENDİ boyutlarıyla (kaydedildiği org/bölge/ÜH/baz
  // periyot) sorar. Şema değişmesin diye ayrı API.
  _lyIndex: null,   // ÜH4(norm) -> kayıt listesi. REAL_DATA sabit, bir kez kurulur.
  _lyCache: null,   // aynı boyut tekrar sorulursa (her render) yeniden taranmasın

  _ensureLyIndex() {
    if (this._lyIndex) return this._lyIndex;
    const src = (typeof REAL_DATA !== "undefined" ? REAL_DATA : []);
    const idx = new Map();
    src.forEach((d) => {
      const k = this._norm(d.uh4);
      if (!idx.has(k)) idx.set(k, []);
      idx.get(k).push(d);
    });
    this._lyIndex = idx;
    this._lyCache = new Map();
    return idx;
  },

  // dim: { org, region, uh1, uh2, uh3, uh4, period }
  //   · org/region/uh1/uh2/uh3 boşsa ("", "—", "Tümü") o boyutta FİLTRE YOK.
  //   · uh4 ZORUNLU (satırın kimliği). Eşleşme yoksa {0,0} döner — çağıran
  //     tarafta "veri yok" olarak gösterilir, hata fırlatılmaz.
  //   · period: "YYYY-MM" | "TUM_YIL" | "" (TUM_YIL gibi davranır).
  // Dönüş: { perakendeAdet, toptanAdet } — ikisi de GERÇEK gözlem (sentetik değil).
  lyMetricsFor(dim) {
    const d = dim || {};
    if (!d.uh4) return { perakendeAdet: 0, toptanAdet: 0 };
    const idx = this._ensureLyIndex();

    const serbest = (v) => {
      const n = this._norm(v);
      return !n || n === "—" || n === "-" || n === "tumu" || n === "tümü";
    };
    const key = [d.org, d.region, d.uh1, d.uh2, d.uh3, d.uh4, d.period].map((v) => this._norm(v)).join("|");
    if (this._lyCache.has(key)) return this._lyCache.get(key);

    const kovada = idx.get(this._norm(d.uh4)) || [];
    let perakendeAdet = 0, toptanAdet = 0;
    kovada.forEach((rec) => {
      if (!serbest(d.org)    && this._norm(rec.org)    !== this._norm(d.org))    return;
      if (!serbest(d.region) && this._norm(rec.region) !== this._norm(d.region)) return;
      if (!serbest(d.uh1)    && this._norm(rec.uh1)    !== this._norm(d.uh1))    return;
      if (!serbest(d.uh2)    && this._norm(rec.uh2)    !== this._norm(d.uh2))    return;
      if (!serbest(d.uh3)    && this._norm(rec.uh3)    !== this._norm(d.uh3))    return;
      const m = this._periodMetrics(rec, d.period || "TUM_YIL");
      perakendeAdet += m.satis;
      toptanAdet    += m.toptan;
    });

    const out = { perakendeAdet, toptanAdet };
    this._lyCache.set(key, out);
    return out;
  },

  loadMix()      { return this.loadMixFor(this.firstSelection(), "uh4"); },

  // Teşkilat + periyot + ürün seçimine göre süz, satır şemasına indir.
  loadMixFor(sel, level) {
    const src = (typeof REAL_DATA !== "undefined" ? REAL_DATA : []);
    const norm = (value) => this._norm(value);   // TEK normalize kural\u0131, bkz. _norm
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
      const m = this._periodMetrics(d);
      const k = groupKey(d);
      if (!map.has(k)) map.set(k, { stok: 0, satis: 0, tutar: 0, mW: 0, dW: 0 });
      const o = map.get(k);
      o.stok += m.stok; o.satis += m.satis; o.tutar += m.tutar;
      o.mW += d.marj * m.tutar; o.dW += d.indirim * m.tutar;
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

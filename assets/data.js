/* =====================================================================
   VERİ KATMANI (PROTOTİP)
   ---------------------------------------------------------------------
   Ekranın kullandığı TÜM veri buradadır. Gerçek veri (IT/Arpaz) geldiğinde
   SADECE bu dosya değişir; app.js ve arayüz aynı kalır.
   API'ye geçmek için DataService fonksiyonlarını fetch(...) ile değiştir.
   ===================================================================== */

// [ ÜH2/Grup, StokAdet, SatışAdet(aylık baz), SatışTutar, Marj%, İndirim% ]
const MIX_ROWS = [
  ["Mutfak Aletleri",       9080617, 950390,  5370520384, 22,  8],
  ["Çamaşır Makinesi",      2760321, 508960, 14620527236, 31, 12],
  ["Soğutucu",              3677904, 496905, 20181550720, 29,  9],
  ["Bulaşık Makinesi",      2434383, 391285,  8362610159, 25, 10],
  ["Klima",                 2665464, 321056, 13225807056, 33, 14],
  ["Ocak",                  2646409, 314664,  3472066234, 18,  6],
  ["Aspiratör - Davlumbaz", 2377096, 260405,  2431037079, 15,  5],
  ["Fırın",                 2514643, 259786,  4888382438, 27, 11],
  ["Çamaşır Kurutma Mak.",  1718531, 253815,  6823722758, 30, 13],
  ["Süpürge",               2676917, 235726,  2814121922, 14,  4],
  ["Televizyon",            1767818, 211567,  5759053169, 24,  9],
  ["Dondurucu",             1568560, 178231,  4137997090, 26, 10],
];

// [ Ay, Etkinlik, Tip, Kampanya, ÇarpanÖnerisi, GeçmişUplift ]
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

// [ Yıl, Perakende%, Toptan%, Yorum ]
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

/* ---- Deterministik prototip metrik üreteci ----
   Gerçek veri gelene kadar, her ÜH4/ÜH3 grubu için ADI'ndan türetilen sabit
   (seed'li) sayılar üretir. Böylece seçim değişince tablo gerçekçi ve tutarlı kalır.
   Gerçek veri bağlanınca loadMixFor(...) fetch('/api/miks?uh2=...') ile değişir. */
function _seed(str){ let h=2166136261; for(let i=0;i<str.length;i++){ h^=str.charCodeAt(i); h=Math.imul(h,16777619); } return (h>>>0); }
function _rand(seed){ let s=seed; return ()=>{ s=(Math.imul(s,1103515245)+12345)&0x7fffffff; return s/0x7fffffff; }; }
function _mkRow(name, salt){
  const r=_rand(_seed(name)+salt);
  const sales = Math.round(200 + r()*3000);            // aylık satış adet
  const cover = 2 + r()*7;                              // gerçekleşen stok ay
  const stock = Math.round(sales*cover);               // stok adet
  const price = Math.round(3000 + r()*40000);          // ort. birim fiyat
  const margin = Math.round(10 + r()*28);              // marj %
  const disc = Math.round(3 + r()*15);                 // indirim %
  return [name, stock, sales, sales*price, margin, disc];
}

const DataService = {
  // Varsayılan (geriye dönük): ilk ÜH1'in ilk ÜH2'sinin ÜH4 kırılımı
  loadMix()      { return this.loadMixFor(this.firstSelection(), "uh4"); },
  loadCalendar() { return CALENDAR; },   // TODO: fetch('/api/calendar')
  loadRatio()    { return RATIO; },      // TODO: fetch('/api/ratio')
  months()       { return MONTHS; },
  seasonal()     { return SEASONAL_INDEX; },

  firstSelection(){
    const uh1 = Object.keys(HIERARCHY)[0];
    const uh2 = Object.keys(HIERARCHY[uh1])[0];
    return { uh1, uh2, uh3: "" };
  },
  // Seçime göre satır üretir. level: 'uh4' | 'uh3' | 'uh2'
  loadMixFor(sel, level){
    const H = HIERARCHY;
    if(level==="uh2"){
      // Seçili ÜH1 altındaki tüm ÜH2 klasmanları (her biri bir satır = alt ağaç toplamı)
      const out=[];
      Object.keys(H[sel.uh1]||{}).forEach((uh2,i)=>{
        // klasman toplamı = altındaki ÜH4'lerin toplamı
        let st=0,sa=0,tut=0,mw=0,dw=0,n=0;
        Object.values(H[sel.uh1][uh2]).forEach(arr=>arr.forEach(l=>{
          const rw=_mkRow(l, i*7+3); st+=rw[1]; sa+=rw[2]; tut+=rw[3]; mw+=rw[4]*rw[2]; dw+=rw[5]*rw[2]; n+=rw[2];
        }));
        out.push([uh2, st, sa, tut, Math.round(mw/(n||1)), Math.round(dw/(n||1))]);
      });
      return out;
    }
    if(level==="uh3"){
      const out=[]; const uh2node=(H[sel.uh1]||{})[sel.uh2]||{};
      Object.keys(uh2node).forEach((uh3,i)=>{
        let st=0,sa=0,tut=0,mw=0,dw=0,n=0;
        uh2node[uh3].forEach(l=>{ const rw=_mkRow(l, i*5+2); st+=rw[1]; sa+=rw[2]; tut+=rw[3]; mw+=rw[4]*rw[2]; dw+=rw[5]*rw[2]; n+=rw[2]; });
        out.push([uh3, st, sa, tut, Math.round(mw/(n||1)), Math.round(dw/(n||1))]);
      });
      return out;
    }
    // uh4: seçili ÜH2 (ve varsa ÜH3) altındaki ÜH4 grupları
    const uh2node=(H[sel.uh1]||{})[sel.uh2]||{};
    const uh3keys = sel.uh3 ? [sel.uh3] : Object.keys(uh2node);
    const out=[];
    uh3keys.forEach(uh3=>(uh2node[uh3]||[]).forEach(l=>out.push(_mkRow(l,1))));
    return out;
  },
};

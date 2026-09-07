// ============================================================
// ARPAZ | Perakende Bütçe -> Toptan Bütçe Dönüşümü
// Ulusal seviye aylık çarpanlar. Python çalıştırmadan kullanılabilir.
// Kaynak: 2021-2025 bayi kanalı verisi, ÜH4 × ay
// ============================================================
//
// TEMEL BULGU
//   Yıllık olarak toptan ≈ perakende (K = 1.0028). Bayi kanalında
//   sell-in ile sell-out uzun vadede eşitlenir.
//   ANCAK aylık dağılımları farklıdır: bayi Ocak-Mart'ta yüklenir,
//   Temmuz ve Aralık'ta stoktan satar, sipariş vermez.
//
//   F(ay) = K × ToptanSezonsellik(ay) / PerakendeSezonsellik(ay)
//
// VARSAYIM
//   Perakende bütçesinin aylık fazı, tarihsel perakende fazına yakındır.
//   Bütçe sahibi bir ayda olağandışı bir kampanya planlıyorsa bu bozulur.

const DONUSUM = {
  K: 1.0011,

  // 1.00 = ortalama ay. Son 5 tam yıl (2021-2025) ortalaması.
  SEZON_PERAKENDE: [0.705, 0.722, 0.935, 0.900, 1.070, 1.073,
                    1.275, 1.044, 0.919, 1.087, 1.134, 1.135],
  SEZON_TOPTAN:    [0.990, 0.942, 1.124, 0.944, 1.044, 1.090,
                    1.020, 0.978, 1.002, 0.930, 1.103, 0.832],

  // F(ay) = K × TOPTAN/PERAKENDE   (dogrulama.py ciktisi, 2021-2025)
  CARPAN: [1.405, 1.306, 1.204, 1.049, 0.977, 1.017,
           0.801, 0.938, 1.092, 0.856, 0.974, 0.734],

  // Kullanıcıya gösterilecek gerekçeler
  ACIKLAMA: [
    "Bayi sezon öncesi yükleniyor; Ocak perakendenin en zayıf ayı",
    "Sezon öncesi yükleme sürüyor",
    "Yılın en yüksek toptan ayı",
    "Toptan ve perakende yakınsıyor",
    "Dengeli ay",
    "Dengeli ay",
    "Perakende zirvede, bayi stoktan satıyor",
    "Perakende toptanın üzerinde",
    "Sezon öncesi hafif yükleme",
    "Bayi stok eritiyor",
    "Dengeli ay",
    "Yıl sonu: bayi stoktan satıyor, sipariş vermiyor"
  ],

  TOLERANS: { "ÜH2 × Yıl": 0.09, "Toplam × Çeyrek": 0.06, "ÜH4 × Ay": 0.37 }
};

const AY_ADI = ["Ocak","Şubat","Mart","Nisan","Mayıs","Haziran",
                "Temmuz","Ağustos","Eylül","Ekim","Kasım","Aralık"];

/** "2027 Ocak" / "2027-01" / 1 -> 1..12 */
function ayNo(periyot) {
  if (typeof periyot === "number") return periyot;
  const s = String(periyot);
  for (let i = 0; i < 12; i++) if (s.includes(AY_ADI[i])) return i + 1;
  const m = s.match(/[-\/](\d{1,2})\b/);
  return m ? parseInt(m[1], 10) : null;
}

/**
 * Tek satırlık dönüşüm.
 * @param {number} perakendeButceAdet - o ÜH4/ay için perakende satış bütçesi
 * @param {string|number} hedefPeriyot - "2027 Ocak" veya 1..12
 * @param {number} stokPolitikasi - opsiyonel. Bayi stok DEĞİŞİMİ hedefi,
 *        perakendenin yüzdesi. 0 = stok sabit. -0.10 = stok %10 erisin
 *        (üst yönetim "az stokla çalışacağız" dediyse burası).
 * @returns {{toptanButce:number, carpan:number, ay:number, aciklama:string}}
 */
function toptanButce(perakendeButceAdet, hedefPeriyot, stokPolitikasi = 0) {
  const m = ayNo(hedefPeriyot);
  if (!m || m < 1 || m > 12) throw new Error("Geçersiz periyot: " + hedefPeriyot);
  const f = DONUSUM.CARPAN[m - 1] + stokPolitikasi;
  return {
    toptanButce: Math.round(Math.max(0, perakendeButceAdet) * f),
    carpan: Math.round(f * 1000) / 1000,
    ay: m,
    aciklama: DONUSUM.ACIKLAMA[m - 1]
  };
}

/** Tablo satırları için toplu dönüşüm. */
function toptanButceTablo(satirlar, stokPolitikasi = 0) {
  return satirlar.map(r => {
    const s = toptanButce(r.perakendeSatisAdetButce, r.hedefPeriyot, stokPolitikasi);
    return { ...r, toptanSatisAdetButce: s.toptanButce,
             donusumCarpani: s.carpan, donusumAciklama: s.aciklama };
  });
}

if (typeof module !== "undefined") {
  module.exports = { DONUSUM, toptanButce, toptanButceTablo, ayNo };
}

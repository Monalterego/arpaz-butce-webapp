/* Perakende→Toptan analizi — GERÇEK bulgular (historical Perakende-Toptan.xlsx) */
const KANIT = {
  ozet: {
    donem: "2022-01 → 2026-03",
    satir: 19043, uh2: 34, uh4: 411,
    korelasyon: 0.894,          // kimlik testi
    sapma: 0.346,               // MAPE-benzeri
    lead_lag_en_guclu: -2,      // toptan perakendeyi 2 ay önden besliyor
  },
  // Lead-Lag çapraz korelasyon (lag ay : korelasyon)
  leadlag: [
    {lag:-3, r:0.399}, {lag:-2, r:0.633}, {lag:-1, r:0.535},
    {lag:0, r:0.478}, {lag:1, r:0.103}, {lag:2, r:-0.102}, {lag:3, r:-0.125}
  ],
  // ÜH2 yıllık ortalama toptan/perakende rasyosu (çekirdek kategoriler, temiz)
  yillik_rasyo: [
    {uh2:"KLIMA", r:1.20}, {uh2:"DONDURUCU", r:1.13}, {uh2:"ÇAMAŞIR KURUTMA MAKINESI", r:1.11},
    {uh2:"ÇAMAŞIR MAKINESI", r:1.11}, {uh2:"SOĞUTUCU", r:1.10}, {uh2:"BULAŞIK MAKINESI", r:1.09},
    {uh2:"SÜPÜRGE", r:1.08}, {uh2:"MUTFAK ALETLERI", r:1.06}, {uh2:"TELEVIZYON", r:1.03},
    {uh2:"MIKRO DALGA FIRIN", r:1.01}, {uh2:"BILGISAYAR", r:0.99}, {uh2:"ISITICILAR", r:0.98},
    {uh2:"FIRIN", r:0.90}, {uh2:"ASPIRATÖR - DAVLUMBAZ", r:0.89}, {uh2:"OCAK", r:0.89},
    {uh2:"CEP TELEFONU", r:0.84}, {uh2:"YAZARKASA", r:0.79}
  ],
  // Mevsim imzaları (anlatı kartları)
  mevsim: [
    {baslik:"❄️ Klima", metin:"Oca–May dolum (1,7–2,5x) → Tem eritme (~0,8x). Bayi yaz öncesi stoklar."},
    {baslik:"🧊 Dondurucu", metin:"Oca–Nis güçlü dolum (2,8–5,0x) → Ağu–Eyl eritme (~0,5x)."},
    {baslik:"🔥 Isıtıcılar", metin:"Ağu–Eyl kış öncesi dolum (3,2–3,7x)."},
    {baslik:"📅 Aralık", metin:"Neredeyse tüm kategoriler <1: yıl sonu stok eritme (evrensel imza)."}
  ]
  // NOT: Aylık ÜH2 ısı haritası için mevcut assets/toptan_katsayi.js (TOPTAN_KATSAYI) kullanılacak.
};

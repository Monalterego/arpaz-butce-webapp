# Arpaz — Bütçe & Stok Miks Çalışma Ekranı (Web App)

LC Waikiki perakende planlama yaklaşımının Arçelik Pazarlama / Tedarik Zinciri
veri analitiğine uyarlanmış **web uygulaması**.

> Durum: **Gerçek demo veri** ile çalışır (Demo Gerçek Veri.xlsx'ten türetilmiş, org×bölge×
> ÜH4 aylık ortalama — sentetik olan tek alan brüt kâr). IT tam (API) veri verdiğinde
> yalnızca `assets/data.js` katmanı değişir; arayüz ve mantık aynı kalır.

## Bütçe Kurgusu (ekranın çekirdeği)
Çalışma ÜH4'ten yapılır. Her grup için:
```
Plan Stok %  = ( Kâr%×wK + Satış%×wS + Stok%×wSt ) / (wK+wS+wSt)   [varsayılan 40/30/20]
Plan Stok Ad = ( ToplamStok × (1 + HedefStokBüyüme%) ) × Plan Stok %
Satış Bütçe  = ( Plan Stok Ad ÷ Hedef Cover[elle] ) × PazarlamaBüyüme × Çarpanlar
LFL          = Satış Bütçe / LY Satış − 1
R-LFL        = (Satış Bütçe / Plan Stok) / (LY Satış / LY Stok) − 1
Stok Büyüme  = Plan Stok / LY Stok − 1
```
**Hedef Cover** her satırda elle girilir (bütçe sahibinin uzman yargısı).
**R-LFL** = stoktan arındırılmış büyüme (LFL'nin ne kadarı stok şişirmeden geldiğini gösterir).

## Proje Yapısı
```
arpaz-butce-webapp/
├── index.html          # Arayüz iskeleti
├── assets/
│   ├── hierarchy.js    # GERÇEK ürün hiyerarşisi (ÜH1→ÜH4), temizlenmiş REAL_DATA'dan üretilir
│   ├── realdata.js     # ORGS, REGIONS, REAL_DATA (gerçek demo veri, sentetik kâr)
│   ├── styles.css      # Stiller
│   ├── data.js         # VERİ KATMANI — filtre + satır şemasına indirgeme
│   └── app.js          # Hesap motoru + kaskad seçim + senaryo + forecast
└── README.md
```

## Ürün Hiyerarşisi
`hierarchy.js` gerçek ağacı içerir: **7 ÜH1 · 31 ÜH2 · 120 ÜH3 · 328 ÜH4** (tüm (İPTAL) satırları
elenmiş, büyük/küçük harf tekrarları birleştirilmiş; hiyerarşi elle değil, temizlenmiş
`REAL_DATA`'dan script ile üretiliyor). Sidebar kaskad çalışır: ÜH1 → ÜH2 → ÜH3 seçilir,
tablo her zaman ÜH4 kırılımı ile üretilir ("Çalışma Seviyesi" kaldırıldı).
Metrikler `assets/realdata.js`'teki **gerçek demo veriden** geliyor (stok/satış/tutar gerçek,
brüt kâr marj bandından sentetik); IT tam veri verince `DataService.loadMixFor()` fetch'e
çevrilir, şema aynı kalır.

## Çalıştırma
- **En kolay:** `index.html`'e çift tıkla.
- **Önerilen:** proje klasöründe `python -m http.server 8000` → `http://localhost:8000`
- **Host:** Klasörü statik sunucuya (IIS/Nginx/Azure Static Web Apps/SharePoint) koy.

## Gerçek Veriye Geçiş (IT notu)
`assets/data.js` içindeki `DataService.loadMixFor()` şu an yerel `REAL_DATA` dizisini
(gerçek demo veri) filtreler. API hazır olduğunda:
```js
async loadMix(){ const r = await fetch('/api/miks'); return await r.json(); }
// beklenen satır şeması: [ Grup, StokAdet, SatışAdet, SatışTutar, Marj%, İndirim% ]
```

## İleride
- Web mi masaüstü (Electron) mi → IT kararı; yapı ikisine de hazır.
- Copilot Studio agent katmanı doğal dil aksiyonları için üstüne eklenebilir.
- ÜH3/ÜH4 drill-down, gerçek kâr/marj alanı, kampanya geçmişi.

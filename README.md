# Arpaz — Bütçe & Stok Miks Çalışma Ekranı (Web App)

LC Waikiki perakende planlama yaklaşımının Arçelik Pazarlama / Tedarik Zinciri
veri analitiğine uyarlanmış **prototip web uygulaması**.

> Durum: **Prototip veri** ile çalışır. Gerçek veri (IT/Arpaz) geldiğinde yalnızca
> `assets/data.js` katmanı değişir; arayüz ve mantık aynı kalır.

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

## Proje Yapısı
```
arpaz-butce-webapp/
├── index.html          # Arayüz iskeleti
├── assets/
│   ├── hierarchy.js    # GERÇEK ürün hiyerarşisi (ÜH1→ÜH4, İPTAL'ler elenmiş)
│   ├── styles.css      # Stiller
│   ├── data.js         # VERİ KATMANI (prototip) — gerçek veri buraya bağlanır
│   └── app.js          # Hesap motoru + kaskad seçim + senaryo + forecast
└── README.md
```

## Ürün Hiyerarşisi
`hierarchy.js` gerçek ağacı içerir: **10 ÜH1 · 34 ÜH2 · 128 ÜH3 · 346 ÜH4** (tüm (İPTAL) satırları
elenmiş, büyük/küçük harf tekrarları birleştirilmiş). Sidebar kaskad çalışır: ÜH1 → ÜH2 → ÜH3 seçilir,
"Çalışma Seviyesi" ile tablo ÜH4 / ÜH3 / ÜH2 kırılımında üretilir.
Metrikler şu an **deterministik prototip** (grup adından türetilen sabit sayılar); gerçek veri gelince
`DataService.loadMixFor()` fetch ile değişir.

## Çalıştırma
- **En kolay:** `index.html`'e çift tıkla.
- **Önerilen:** proje klasöründe `python -m http.server 8000` → `http://localhost:8000`
- **Host:** Klasörü statik sunucuya (IIS/Nginx/Azure Static Web Apps/SharePoint) koy.

## Gerçek Veriye Geçiş (IT notu)
`assets/data.js` içindeki `DataService.loadMix()` şu an sabit dizi döndürür.
API hazır olduğunda:
```js
async loadMix(){ const r = await fetch('/api/miks'); return await r.json(); }
// beklenen satır şeması: [ Grup, StokAdet, SatışAdet, SatışTutar, Marj%, İndirim% ]
```

## İleride
- Web mi masaüstü (Electron) mi → IT kararı; yapı ikisine de hazır.
- Copilot Studio agent katmanı doğal dil aksiyonları için üstüne eklenebilir.
- ÜH3/ÜH4 drill-down, gerçek kâr/marj alanı, kampanya geçmişi.

# Arpaz — Bütçe & Stok Miks Çalışma Ekranı · Proje Talimatları

Bu bir **web uygulaması**dır (saf HTML + CSS + JS, framework yok). LC Waikiki'deki
perakende planlama yaklaşımının Arçelik Pazarlama / Tedarik Zinciri veri analitiğine
uyarlanmış prototipidir. Aşağıdaki kurallara **her zaman** uy.

## Genel Kurallar
- **Arayüz dili Türkçe** olacak. Son kullanıcılar İngilizce kullanamaz. Tüm etiket,
  başlık, buton ve mesajlar Türkçe.
- Sayı biçimi **Türkçe locale**: ondalık virgül, binlik nokta (ör. `1.234,5`), yüzde `%12,3`.
- Framework/derleme yok. Sadece `index.html` + `assets/*.js` + `assets/*.css`.
  Yeni bağımlılık ekleme, npm kurma. Tarayıcıda çift tıkla veya `python -m http.server` ile çalışır.
- Değişiklikten sonra kısa açıklama yap; gereksiz dosya oluşturma.

## Dosya Yapısı
```
index.html            → arayüz iskeleti
assets/hierarchy.js   → GERÇEK ürün hiyerarşisi (ÜH1→ÜH4). ELLE DÜZENLEME; üreticiyle güncellenir.
assets/data.js        → VERİ KATMANI (prototip). Gerçek veri buraya bağlanır (DataService).
assets/app.js         → hesap motoru + kaskad seçim + senaryo + forecast
assets/styles.css     → stiller
```

## Ürün Hiyerarşisi Kuralları
- Kaynak liste ÜH1 › ÜH2 › ÜH3 › ÜH4 dört seviyelidir.
- **(İPTAL) / (İptal) içeren tüm satırlar elenir** — asla eklenmez.
- Büyük/küçük harf kaynaklı tekrarlar **tek kayıtta birleştirilir** (ör. "OCAK" = "Ocak").
- Ekran ÜH4'ten çalışır; "Çalışma Seviyesi" ile ÜH4 / ÜH3 / ÜH2 kırılımı seçilebilir.
- Güncel sayılar: 10 ÜH1 · 34 ÜH2 · 128 ÜH3 · 346 ÜH4.

## Bütçe Kurgusu (ÇEKİRDEK MANTIK — değiştirme, sadece geliştir)
Her grup için, gerçekleşen (LY) verinin alt-toplamdaki **yüzdelik payına** göre:
```
Plan Stok %  = ( Kâr%×wK + Satış%×wS + Stok%×wSt ) / (wK+wS+wSt)   [varsayılan ağırlık 40/30/20]
Plan Stok Ad = ( ToplamStok × (1 + HedefStokBüyüme%) ) × Plan Stok %
Satış Bütçe  = ( Plan Stok Ad ÷ HedefCover[elle] ) × PazarlamaBüyüme × ÇarpanFaktörü
LFL          = Satış Bütçe / LY Satış − 1
R-LFL        = (Satış Bütçe / Plan Stok) / (LY Satış / LY Stok) − 1
Stok Büyüme  = Plan Stok / LY Stok − 1
```
- **Hedef Cover her satırda elle girilir** (sarı hücre) — bütçe sahibinin uzman yargısıdır.
  Bu alan asla otomatik hesaplanan bir değerle EZİLMEZ.
- Kâr = Satış Tutarı × Marj% (gerçek kâr). (Ciro'ya çevrilirse kullanıcı açıkça söyler.)
- Çarpanlar (kampanya): Paro, Bundle, Özel gün (event), Gam değişimi, Kota ayı.
  Hepsi çarpımsal: `Π(1 + çarpan%)`. Pazarlama Büyümesi de çarpımsaldır.

## Aksiyon Etiketleri (LC yaklaşımı)
Plan Stok % ile Stok payı farkına ve cover sinyaline göre:
- Plan% − Stok% > +2 puan → "Stok Payını Artır" (yeşil)
- Plan% − Stok% < −2 puan → "Stok Payını Azalt" (kırmızı)
- LY Cover < HedefCover×0,7 → "Cover Düşük → Satış Kaçırma" (amber)
- diğer → "Koru / Dengeli" (gri)

## Veri Katmanı (gerçek veriye geçiş)
- Şu an `DataService.loadMixFor(sel, level)` deterministik prototip sayı üretir
  (grup adından seed'li; seçim değişince tutarlı kalır).
- Gerçek veri gelince yalnızca burası değişir:
  `async loadMix(){ const r=await fetch('/api/miks'); return await r.json(); }`
  Satır şeması: `[ Grup, StokAdet, SatışAdet, SatışTutar, Marj%, İndirim% ]`.

## Sekmeler
1. Bütçe & Stok Miks (ana) — 2. Kampanya/Özel Gün Takvimi (2021+) —
3. Perakende/Toptan Rasyo — 4. Tahmin (Forecast: LFL / Mevsimsel / Hareketli ort.)

## Yapma
- Arayüzü İngilizceye çevirme. Locale'i bozma. Framework/paket ekleme.
- hierarchy.js'e (İPTAL) grup ekleme. Bütçe formüllerinin özünü değiştirme.
- Hedef Cover elle-giriş hücresini otomatik değerle ezme.

# CLAUDE.md — Arpaz Bütçe & Stok Miks Çalışma Ekranı

> Bu dosya projenin **tek kaynak bağlamıdır**. Claude Code / Claude uygulaması her
> oturumda bunu okuyup projeye buradan devam etmelidir. Kod yazmadan önce bu dosyayı
> tamamen oku. Türkçe cevap ver, Türkçe UI üret.

---

## 0) Hızlı Özet (TL;DR)
LC Waikiki'deki **perakende planlama (pay-bazlı performans + bütçe)** yaklaşımının
Arçelik Pazarlama A.Ş. / **Arpaz** tedarik zinciri veri analitiğine uyarlanmış bir
**web uygulaması** (saf HTML + CSS + Vanilla JS, framework yok). Kullanıcı; teşkilat
(org/bölge) ve ürün hiyerarşisi (ÜH1→ÜH4) seçer, geçmiş (LY) stok/satış/kâr paylarına
bakarak gelecek yıl (TY) için **plan stok payını, satış bütçesini ve hedef cover'ı**
belirler. Şu an **prototip veri** ile çalışır; IT tam veri verene kadar bu böyle kalacak.

**Rol:** Ben (kullanıcı) veri/analitik uzmanıyım (Power BI, Power Apps, Qlik, Excel,
DAX/M). Yazılım geliştirici değilim; bu yüzden **açık, adım adım, kopyala-yapıştır kod**
ver. Türkçe locale kritik (ondalık virgül, binlik nokta). Ekranın İngilizceye çevrilmesi
YASAK — son kullanıcılar İngilizce kullanamaz.

---

## 1) Projenin Kökeni ve Vizyonu
- LC Waikiki'de "International Store Merchandiser" olarak MENA'da 4 ülke / 50 mağazanın
  Kız Çocuk bölümünden sorumluydum. Orada perakende matematiğini öğrendim:
  **stok–satış–kâr'ı yüzdelik paya çevirip** (üst kırılımın alt-toplamına göre) kıyaslamak,
  etiketlemek ve buna göre aksiyon almak.
- Şimdi Arçelik Pazarlama'da (3 yıl) Arpaz tedarik zinciri veri analitiği ekibindeyim.
- Amaç: LC'deki "planlama uygulaması" mantığını Arpaz'a taşımak. Excel'de yaptım;
  şimdi bir **ekrana** taşıyoruz. İleride Arpaz'ın yapısına göre evrimleşecek.
- Pazarlama'dan Sedef Büşra Şir yardımcı oluyor. Sonraki fazda eklenecek çarpanlar:
  **Paro etkisi, Bundle (perakende kampanya), Özel gün (event), Gam değişimi, Kota ayı.**
- Uzun vade next-steps: like-for-like takvim, 2021+ özel gün takvimi, kampanya geçmişi
  meta datası, perakende/toptan rasyosu (pandemi sonrası), tahmin (forecast) yöntemi.

---

## 2) Teknik Mimari ve Dosya Yapısı
Framework/derleme YOK. Live Server veya `python -m http.server` ile açılır.
Script yükleme sırası KRİTİK: **hierarchy.js → realdata.js → data.js → app.js**.

```
arpaz-butce-webapp/
├── index.html            # Arayüz iskeleti (tek dosya; assets/ içinde KOPYA olmamalı)
├── assets/
│   ├── hierarchy.js      # HIERARCHY: gerçek ürün ağacı (ÜH1→ÜH4), İPTAL elenmiş
│   ├── realdata.js       # ORGS, REGIONS, REAL_DATA (gerçek demo veri, sentetik kâr)
│   ├── data.js           # DataService: filtre + satır şemasına indirgeme
│   ├── app.js            # Hesap motoru + kaskad seçim + tablo + senaryo + forecast
│   └── styles.css        # Stiller (Segoe UI, lacivert/yeşil tema)
├── .github/
│   └── copilot-instructions.md   # (varsa) kısa kural özeti
└── CLAUDE.md             # BU DOSYA
```

**Çalıştırma:** `index.html`'e çift tıkla YA DA VS Code'da Live Server (`127.0.0.1:5500`).
Git kullanılıyor; her anlamlı değişiklikten sonra commit al.

---

## 3) Veri Katmanı (DataService)
`realdata.js` içeriği:
- `ORGS = ["Arçelik","Beko"]`
- `REGIONS = ["ADANA","ANKARA","MARMARA BATI KARADENİZ","İSTANBUL TRAKYA","İZMİR"]`
- `REAL_DATA = [{ org, region, uh1, uh2, uh3, uh4, stok_adet, satis_adet,
   stok_tutar, satis_tutar, marj, indirim, brut_kar }, ...]`  (~3.060 satır)

Kaynak: **Demo Gerçek Veri.xlsx** (2025-07 … 2026-07, 13 ay). Değerler **aylık ortalamadır**.
Temizlik: (İPTAL/İptal) satırları elendi; büyük/küçük harf ve TR/EN tekrarları birleştirildi
(ENERGY SOLUTIONS→ENERJİ ÇÖZÜMLERİ, NON-GROUPED→GRUPSUZ; İST.TRK.=İSTANBUL TRAKYA;
MR-B.K.DENİZ=MARMARA BATI KARADENİZ). Ölü gruplar (satış<0.5 & stok<1) atıldı.

**Brüt kâr SENTETİKtir** (IT gerçek perakende brüt kârı verene kadar):
`brut_kar = satis_tutar × marj%`. Marj = ÜH2 baz bandı + ÜH4 deterministik ±4 puan sapma.
Baz bantlar: Beyaz eşya %12-22 · Elektronik (TV/PC/telefon) %6-12 · Klima/enerji ~%20 ·
Küçük ev aletleri/kişisel bakım %30-45 · Aksesuar/yedek parça ~%48.

**DataService API (app.js bunları kullanır):**
- `orgs()`, `regions()` → dropdown doldurma
- `setOrg(org)`, `setRegion(region)` → "" = Tümü
- `firstSelection()` → ilk ÜH1/ÜH2
- `loadMixFor(sel, level)` → seçime göre süzer, org/bölge "Tümü" ise **grupla-topla**,
  satır şemasına indirir: **`[ Ad, StokAdet, SatışAdet, SatışTutar, Marj%, İndirim% ]`**
  - `sel = { uh1, uh2, uh3 }`, `level ∈ {"uh4","uh3","uh2"}`
- `loadMix()` = mevcut seçim için wrapper
- `loadCalendar()`, `loadRatio()`, `months()`, `seasonal()`

**Gerçek veriye geçiş (IT için):** `loadMixFor` içi `fetch('/api/miks?...')`'e çevrilir;
şema aynı kalır. Beklenen alanlar yukarıdaki gibi.

---

## 4) Ürün Hiyerarşisi (HIERARCHY)
- Dört seviye: **ÜH1 › ÜH2 › ÜH3 › ÜH4**. Ekran ÜH4'ten çalışır (buyer grup DEĞİL — Arpaz'da
  "buyer grup" kavramı yoktur, sadece "ÜH4" de).
- Yaklaşık boyut: 7-8 ÜH1 · ~33 ÜH2 · ~132 ÜH3 · ~375 ÜH4 (gerçek demo veriden türetildi).
- **(İPTAL) satırları ASLA eklenmez.** Büyük/küçük harf tekrarları tek kayıtta birleşir.
- Sidebar kaskad: ÜH1 seç → ÜH2 dolar → ÜH3 dolar ("Tümü (ÜH3)" seçeneği var).
- "Çalışma Seviyesi" seçici KALDIRILDI; `state.level` sabit `"uh4"`. (Not: app.js'te ÜH3
  drill-down için `level==='uh3'` dalları hâlâ var; ÜH3 görünümünde ana satır + gizli ÜH4
  child satırlar açılıp kapanır.)

---

## 5) Bütçe Kurgusu (ÇEKİRDEK MANTIK — özünü değiştirme, sadece geliştir)
Her grup için, gerçekleşen (LY) verinin **alt-toplamdaki yüzdelik payına** göre:

```
Plan Stok %  = ( Kâr%×wK + Satış%×wS + Stok%×wSt ) / (wK + wS + wSt)   [varsayılan 40/30/20]
Plan Stok Ad = ( ToplamStok × (1 + HedefStokBüyüme%) ) × Plan Stok %
Satış Bütçe  = ( Plan Stok Ad ÷ HedefCover[elle] ) × PazarlamaBüyüme × ÇarpanFaktörü
LFL          = Satış Bütçe / LY Satış − 1
R-LFL        = (Satış Bütçe / Plan Stok) / (LY Satış / LY Stok) − 1
Stok Büyüme  = Plan Stok / LY Stok − 1
```
- Paylar üst-toplama (seçili alt-toplam) göre orandır. Kâr payı = grup brüt kârının
  toplam brüt kâra oranı. Kâr = SatışTutarı × Marj%.
- **HedefCover her satırda ELLE girilir** (sarı hücre). Bu bütçe sahibinin uzman yargısıdır
  ve otomatik bir değerle ASLA ezilmez. Default başlangıç = LY cover (stok/satış).
- Çarpanlar çarpımsal: `Π(1 + çarpan%)`. Çarpanlar: Paro, Bundle, Özel gün, Gam, Kota.
  Pazarlama Büyümesi de çarpımsaldır (×1,05 gibi).
- **Doğrulama (Excel ile birebir tutmalı):** LFL, R-LFL, Stok Büyümesi formülleri kullanıcının
  Excel'iyle test edildi ve tuttu (örn. bir satırda LFL %12, R-LFL %19, Stok Büyümesi −6).

---

## 6) Durum + Aksiyon (LC 2×2 pay matrisi — İKİ AYRI KOLON)
İki eksen, **ikisi de o kalemin STOK payıyla** kıyaslanır:
- **Hız:** Satış payı > Stok payı → "Hızlı", değilse "Yavaş"
- **Kârlılık:** Kâr payı > Stok payı → "Kârlı", değilse "Kârsız"

Tabloda **önce "Durum" (tespit) kolonu, sonra "Aksiyon" (öneri) kolonu** olmalı.

| Durum | Renk | Aksiyon (Arpaz'a uygun — İADE/TRANSFER YOK) |
|---|---|---|
| Hızlı & Kârlı | 🟢 b-green | Plan stok payını artır (sevkiyat/tedarik önceliği) |
| Hızlı & Kârsız | 🟠 b-amber | Fiyat / marj gözden geçir |
| Yavaş & Kârlı | 🔵 b-blue | İndirim/kampanya ile hızlandır · stok payını azalt |
| Yavaş & Kârsız | 🔴 b-red | Stok payını azalt · fiyat/kampanya gözden geçir (gam gözden geçir) |

**ÖNEMLİ (Arpaz gerçeği):** Arpaz ürünleri **toptan bayilere** satar; bayiler arası
**iade/transfer YOKTUR.** Aksiyonlar yalnızca sevkiyat/sipariş temposu, tedarik önceliği,
bayi kampanya/iskonto, fiyat/marj ve gam kararı üzerinden olur. "iade"/"transfer" kelimeleri
UI'da geçmemeli.

`actionTag(stockShare, salesShare, profitShare)` → `{ etiket, eCls, aksiyon, aCls }` döndürür;
`computeFromData` çağırır; `updateAll` iki hücreye (tag_/act_) basar (ana + ÜH3 child satırlar).

---

## 7) Arayüz (index.html) — Bölümler
Sol menü sırası: **TEŞKİLAT → ÜRÜN HİYERARŞİSİ → PERİYOT**.
- **Teşkilat:** `#h_org` (Satış Teşkilatı: Tümü/Arçelik/Beko), `#h_region` (Şube/Bölge:
  Tümü + 5 bölge). app.js bunları `DataService.orgs()/regions()` ile doldurur; change →
  `setOrg/setRegion` + `rebuild()`. Başlangıç "Tümü" (value="").
- **Ürün Hiyerarşisi:** `#h_uh1`, `#h_uh2`, `#h_uh3` (kaskad).
- **Periyot (like-for-like):** Baz (LY) / Hedef (TY) — şimdilik görsel.
- Sekmeler: **Bütçe & Stok Miks** (ana) · Kampanya/Özel Gün Takvimi (2021+) ·
  Perakende/Toptan Rasyo · Tahmin (Forecast: LFL / Mevsimsel / 3-Aylık Hareketli Ort.).
- Ana tablo blokları: **GERÇEKLEŞEN (LY)** [Stok Adet, Stok%, Satış Adet, Satış%,
  Brüt Kâr (₺), Kâr%, Cover, Turnover] ve **GELECEK YIL PLANI (TY)** [Plan Stok %,
  Plan Stok Adet, Hedef Cover(elle), Satış Bütçe, LFL%, Stok Büy.%] + Durum + Aksiyon.
- KPI kartları: Toplam Stok, Toplam Satış (LY), Toplam Kâr (LY ₺), Bayi Stok Ay (Cover),
  Toplam Satış Bütçe (TY), LFL Büyüme.
- Senaryo Yönetimi: parametre + hedef cover setini kaydet/karşılaştır; en iyi LFL yeşil.

---

## 8) app.js — Anahtar Fonksiyonlar
- `initHierarchy()` — org/region + ÜH1/ÜH2/ÜH3 select'lerini kurar, event bağlar.
- `readParams()` — stokBuyume, pazar, wKar/wSatis/wStok, camp{paro,bundle,event,gam,kota}.
- `computeFromData(data, p, covers)` — SAF hesap; `computeModel` = loadMix wrapper.
- `buildTable()` — DOM'u bir kez kurar (input focus korunur). uh4/uh2 düz; uh3 drill-down.
- `updateAll()` — hücreleri yeniden hesaplayıp yazar; tfoot TOPLAM; KPI; forecast.
- `actionTag(...)` — 2×2 matris (bkz. Bölüm 6).
- `renderKpis / renderScenarios / renderCalendar / renderRatio / renderForecast`.
- Biçimleyiciler: `fmtN` (tr-TR tam sayı), `fmtP`/`fmtP0` (yüzde), `fmtX` (çarpan),
  `fmtD`/`fmtD2` (ondalık). Türkçe locale ZORUNLU.

---

## 9) Kod & Çalışma Kuralları (ZORUNLU)
- **Türkçe UI ve locale.** Sayı: `toLocaleString('tr-TR')`, yüzde `%12,3`, çarpan `1,05x`.
- **Framework/paket EKLEME.** Saf HTML/CSS/JS kalsın. Yeni bağımlılık yok.
- **`index.html` TEK olmalı** (kökte). `assets/index.html` gibi kopya oluşturma; varsa sil.
- **Her değişiklikten sonra dosyayı PARSE ET, syntax hatası bırakma.** (Geçmişte
  tekrar tekrar `SyntaxError` çıktı — genelde template literal/backtick veya kapanmayan
  paren. Değişiklik sonrası konsol temiz olmalı.)
- **Bütçe formüllerinin özünü değiştirme; HedefCover elle-girişini ezme.**
- **hierarchy.js'e (İPTAL) grup ekleme.** "buyer grup" deme; "ÜH4" de.
- **Cerrahi düzenleme yap** (mümkünse tüm dosyayı değil ilgili bloğu değiştir).
- Küçük, sık commit al. Geri dönülebilir olsun.

---

## 10) Mevcut Durum (Bilinen Noktalar)
- ÇALIŞIYOR: kaskad hiyerarşi, gerçek veri, KPI, bütçe hesabı, Hedef Cover elle giriş,
  Brüt Kâr (₺) kolonu, senaryo/takvim/rasyo/forecast sekmeleri, org/bölge filtreleme
  (data.js + yeni realdata.js ile).
- SON ADIM/DİKKAT: Teşkilat dropdown'ları `ORGS/REGIONS`'tan beslenir. Boş görünüyorsa
  neredeyse her zaman sebep: **eski realdata.js** yüklü (ORGS/REGIONS yok). Konsolda `ORGS`
  yazıp kontrol et; `ReferenceError` gelirse yeni realdata.js konmamış demektir.
- AÇIK İŞ (yarım kalan): **Durum + Aksiyon iki kolon** ayrımı (Bölüm 6) ekrana tam
  oturtulmalı; `actionTag` 2×2 matrise göre iki değer döndürmeli; index.html başlığında
  "Aksiyon" yerine "Durum" + "Aksiyon" olmalı; tfoot kolon sayısı eşlenmeli.
- OLASI İYİLEŞTİRME: default Hedef Cover'a makul tavan (ör. ≤12 ay) — niş ÜH4'lerde
  satış çok düşük olunca cover 140 gibi uçuk çıkıyor (gerçekçi ama sunumda dikkat çekiyor).

---

## 11) Sıradaki Adımlar (Öncelik Sırası)
1. **Durum + Aksiyon iki kolonunu** tamamla (2×2 matris, Arpaz aksiyonları).
2. Teşkilat filtresini uçtan uca doğrula (org/bölge seçince tüm tablo + KPI değişsin).
3. Default Hedef Cover tavanı / uyarı (opsiyonel).
4. 4 duruma göre **özet KPI** ("kaç grup kırmızı/aksiyon adayı").
5. Kampanya/Özel gün takvimini (2021+) ve kampanya geçmişini metadata olarak modele bağla.
6. Forecast yöntemini bütçe adedine tam entegre et (aylara dağıtım + cover ile plan stok).
7. IT tam veri verince `DataService`'i API'ye çevir (şema aynı).

---

## 12) İletişim Tarzı Tercihi
- Adım adım, net, kopyala-yapıştır kod. Gereksiz teori değil, çalışan çözüm.
- Hata olduğunda: F12 → Console → kırmızı satırı ver → hedefli düzelt.
- Frustrasyonda kısa empati + hızlı çözüm. Ben test edip geri bildiririm (iteratif).
- Türkçe konuş. Locale ve UI dili Türkçe kalsın.

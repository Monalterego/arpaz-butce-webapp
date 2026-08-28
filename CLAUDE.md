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
belirler. Şu an **gerçek demo veri** ile çalışır (Demo Gerçek Veri.xlsx'ten türetilmiş,
org×bölge×ÜH4 aylık ortalama); IT tam (API) veri verene kadar bu böyle kalacak. Sentetik
olan tek alan **brüt kâr** (marj bandından hesaplanıyor) — stok/satış/tutar gerçek.

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
├── docs/                 # Detaylı özellik referansları (SADECE o özelliğe dokunurken oku)
│   ├── TOPTAN_KOPRUSU.md # Bölüm 13'ün tamamı: sell-in köprüsü + kanıt vitrini
│   └── ROLLUP_PANELI.md  # Bölüm 14'ün tamamı: Özet/Rollup paneli mimarisi
├── .github/
│   └── copilot-instructions.md   # (varsa) kısa kural özeti
└── CLAUDE.md             # BU DOSYA (tek kaynak bağlam; detaylar docs/'ta)
```

**Çalıştırma:** `index.html`'e çift tıkla YA DA VS Code'da Live Server (`127.0.0.1:5500`).
Git kullanılıyor; her anlamlı değişiklikten sonra commit al.

---

## 3) Veri Katmanı (DataService)
`realdata.js` içeriği:
- `ORGS = ["Arçelik","Beko"]`
- `REGIONS = ["ADANA","ANKARA","MARMARA BATI KARADENİZ","İSTANBUL TRAKYA","İZMİR"]`
- `REAL_DATA = [{ org, region, uh1, uh2, uh3, uh4, stok_adet, satis_adet,
   stok_tutar, satis_tutar, marj, indirim, brut_kar }, ...]`  (**2.866 satır**)

Kaynak: **Demo Gerçek Veri.xlsx** (2025-07 … 2026-07, 13 ay). Değerler **aylık ortalamadır**.
Temizlik TAMAMLANDI: (İPTAL/İptal) satırları elendi (194 kayıt silindi, 3.060→2.866);
büyük/küçük harf ve TR/EN tekrarları birleştirildi (ENERGY SOLUTIONS→ENERJİ ÇÖZÜMLERİ,
NON-GROUPED→GRUPSUZ; İST.TRK.=İSTANBUL TRAKYA; MR-B.K.DENİZ=MARMARA BATI KARADENİZ).
Ölü gruplar (satış<0.5 & stok<1) atıldı. `grep -c "PTAL" assets/realdata.js` → 0.

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
- `loadCalendar()`, `months()`, `seasonal()`

**Gerçek veriye geçiş (IT için):** `loadMixFor` içi `fetch('/api/miks?...')`'e çevrilir;
şema aynı kalır. Beklenen alanlar yukarıdaki gibi.

---

## 4) Ürün Hiyerarşisi (HIERARCHY)
- Dört seviye: **ÜH1 › ÜH2 › ÜH3 › ÜH4**. Ekran ÜH4'ten çalışır (buyer grup DEĞİL — Arpaz'da
  "buyer grup" kavramı yoktur, sadece "ÜH4" de).
- Güncel boyut: **7 ÜH1 · 31 ÜH2 · 120 ÜH3 · 328 ÜH4** (gerçek demo veriden türetildi).
  ÜH1 listesi: BEYAZ EŞYA, DİĞER, ENERJİ ÇÖZÜMLERİ, EV KONFORU, KEA, NON-PRODUCT,
  TÜKETİCİ ELEKTRONİĞİ.
- **(İPTAL) satırları ASLA eklenmez.** Büyük/küçük harf tekrarları tek kayıtta birleşir.
- **HIERARCHY elle tutulmuyor** — temizlenmiş REAL_DATA'dan script ile üretiliyor (bkz.
  Bölüm 10). Bu yüzden her yaprağın veride karşılığı GARANTİ (0 eşleşmeyen düğüm); veri
  değişirse hiyerarşi de yeniden üretilmeli. Veride hiç karşılığı olmayan **GRUPSUZ** dalı
  (eski hiyerarşide GRUPSUZ›GRUPSUZ›GRUPSUZ vardı, seçilince tablo boş kalıyordu) bu
  yüzden düştü.
- Sidebar kaskad: ÜH1 seç → ÜH2 dolar → ÜH3 dolar. **ÜH3 seçimi ZORUNLUDUR** —
  **"Tümü (ÜH3)" seçeneği YOKTUR**, bilinçli bir tasarım kararıdır (bkz. Bölüm 10):
  `refreshUh3()` her zaman ilgili ÜH2'nin ilk ÜH3'ünü (`keys[0]`) otomatik seçili
  getirir, boş/placeholder option üretmez. Kullanıcı her zaman belirli bir ÜH3
  seçili durumdadır; tablo o ÜH3'ün ÜH4 kırılımını gösterir.
- "Çalışma Seviyesi" seçici (ayrı bir dropdown) KALDIRILDI. `state.level` **HER ZAMAN
  `"uh4"`** — `syncLevel()` koşulsuz sabit atama yapar, ÜH3 seçimine göre DALLANMAZ.
  Eski "ÜH3 seçiliyse drill-down (ana satır + gizli ÜH4 child satırlar, expander
  ▶/▼)" davranışı ve buna ait render mantığı kod tabanından TAMAMEN kaldırılmıştır;
  `buildTable()`/`updateAll()` tek dallı, düz ÜH4 listesi üretir (bkz. Bölüm 8, 10).

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
  Excel'iyle test edildi ve tuttu (örn. bir satırda LFL %12, R-LFL %19, Stok Büyümesi −6;
  gerçek veride Hedef Cover elle ayarlanarak yeniden üretildi — bkz. Bölüm 10 doğrulama notu).

### 5.1) R-LFL ne anlama gelir?
- **R-LFL = stoktan arındırılmış büyüme.** LFL "büyüdüm mü" sorusunu cevaplar; R-LFL
  "stoğu şişirmeden mi büyüdüm" sorusunu cevaplar.
- Üç metrik çarpımsal olarak kapanır — bu bir **cebirsel kimliktir, her satırda her zaman
  tutar** (kodda doğrulandı):
  ```
  (1 + LFL) = (1 + R-LFL) × (1 + Stok Büyümesi)
  ```
  İyi bir kanarya: formüllerden birine dokunulup diğeri unutulursa bu kimlik bozulur.
- Formül sadeleştiğinde **Plan Stok tamamen düşer**:
  ```
  1 + R-LFL = ÇarpanFaktörü × (LY Cover / Hedef Cover)
  ```
  Yani R-LFL; Hedef Stok Büyümesi %'inden, 40/30/20 ağırlıklarından ve Plan Stok payından
  **ETKİLENMEZ**. Sadece elle girilen Hedef Cover'ın LY Cover'a oranına ve çarpanlara
  (Pazarlama Büyümesi × kampanyalar) bağlıdır.
- Pratik anlamı: pay dağıtımı mekaniktir (formül yapar), cover ise insan kararıdır. R-LFL,
  bütçe sahibinin uzman yargısını izole eden tek metriktir — "cover'ı 10'dan 8'e çektim"
  demek "aynı stoktan %25 daha hızlı satacağımı varsayıyorum" demektir.
- **Uyarı:** Yüksek LFL + negatif R-LFL = büyüme tamamen stok yatırımından geliyor,
  verimlilik geriliyor demektir. Arpaz'da bayiler arası iade/transfer olmadığı için bu
  doğrudan bayi stok riskidir; tek başına LFL'e bakan bu tuzağı göremez.

### 5.2) Ölü Stok İşaretleme (SADECE GÖRSEL — bütçe hesabına sıfır etkisi)
Bir ÜH4 kalemi ölü stok sayılır ancak ve ancak:
```
LY Cover > (Ölü Stok Çarpanı × görünen satırların LY Cover MEDYANI)   VE   LY Cover >= 12 ay
```
- Çarpan **SABİTTİR: 3,0** (`OLU_STOK_CARPANI`, app.js başında). **Kullanıcı parametresi
  DEĞİL** — panelde ayrı bir "Ölü Stok" kartı YOK, rozet LY Cover hücresinde otomatik
  görünür. (Önceden `#p_olucarpan` input'u vardı, kaldırıldı: soyut bir çarpan girdisi,
  ekranda karşılık gelen somut bir "eşik = X ay" göstergesi olmadan kullanıcı için
  anlamsız kaldı. Basitlik için sabitlendi; talep gelirse yeniden parametreleştirilebilir.)
- **Medyan** kullanılır, ortalama DEĞİL (uç değerler — bazı kalemlerde 3.000+ ay — ortalamayı
  şişirip eşiği anlamsızlaştırır).
- Medyan tabanı `computeFromData`'ya gelen `data`, yani **o an ekranda görünen satırlar**
  (varsayılanda bir ÜH2'nin tüm ÜH4'leri; kullanıcı bir ÜH3 seçerse otomatik olarak o
  ÜH3'ün normuna döner — bunun için ekstra kod gerekmedi, davranış istenen budur).
- Rozet (kırmızı, mevcut `.badge b-red`) sadece **LY Cover hücresinin görünümünü** değiştirir;
  Hedef Cover, Plan Stok, Satış Bütçe, LFL, R-LFL, Stok Büyümesi hesaplarına **dokunmaz**.

**Gerekçe (ölçüldü, uydurulmadı):**
- *Sabit eşik (ör. 24 ay) neden reddedildi:* cover normu ÜH2'ye göre çok değişiyor —
  KLIMA medyanı 7,4 ay, ÇAMAŞIR KURUTMA MAKINESI medyanı **20,5 ay**. Sabit 24 ay eşiği
  Çamaşır Kurutma'da neredeyse hiçbir şeyi yakalamaz, Klima'daki gerçek sorunu (7,4 ayın
  3 katı = ~22 ay üstü) kaçırırdı.
- *ÜH3 medyanı neden taban alınmadı:* ÜH3 başına ortalama **2,7 ÜH4** var, **%45,8'i
  (~%46) tek yapraklı**. Tek yapraklı ÜH3'te medyan kalemin kendisidir → o kalem hiçbir
  zaman kendi medyanının katı olamaz, yapısal kör nokta. Ölçüldü: ÜH2 tabanlı yaklaşım
  328 kalemden **33'ünü** işaretler, ÜH3 tabanlı yaklaşım sadece **18'ini**; aradaki farkta
  AYDINLATMA (129 ay) ve SÜPÜRGE AKSESUARLARI (63 ay) gibi gerçek ölü stoklar ÜH3 tabanında
  kaçıyordu.
- *12 ay alt sınırı neden var:* medyanı düşük hızlı gruplarda (ör. NON-PRODUCT/CUSTOMER
  CARE medyanı 1,6 ay) saf göreli kural sağlıklı kalemleri damgalar — ACCESSORIES-AS SPARE
  PART (cover 11,9 ay, medyanın 7,4 katı ama 12 ay altında) tam bu senaryoyu doğruluyor.
  KALDIRMA.
- Rozetin bütçeye etkisi yoktur; **cover'a tavan UYGULANMAZ** (bkz. Bölüm 10) çünkü
  Satış Bütçe = Plan Stok ÷ Hedef Cover olduğundan cover'ı düşürmek ölü stoğa yapay yüksek
  satış hedefi yazmak olurdu.

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
`computeFromData` çağırır; `updateAll` iki hücreye (tag_/act_) basar (düz ÜH4 satırları,
bkz. Bölüm 4/8 — ÜH3 child satır render'ı yoktur).

---

## 7) Arayüz (index.html) — Bölümler

### 7.0 Tasarım Sistemi (2. tur — "nefes + tek accent", SADECE kabuk katmanı)
Ana tablonun (`#grid`) kolon/satır/hesap yapısına DOKUNULMADI; tüm değişiklik
stil + sarmalayıcı yapı katmanındadır.
- **Tek vurgu rengi:** `--accent:#0077b6` (`--accent2` aynı değere alias, geriye
  dönük uyumluluk). Durum renkleri (`--good/--warn/--bad/--info` = mevcut
  `--green/--amber/--red/--blue`) SADECE tabloda ve rozetlerde kullanılır.
  `--navy/--navy2` artık yalnızca **marka/yapı** rengi: header gradyanı, tablo
  başlık şeritleri, `.segmented button.is-on`. Yeni bir vurgu rengi EKLEME.
- **8px boşluk gridi:** `--s1:8px --s2:16px --s3:24px --s4:32px`. Yeni ham piksel
  boşluk YAZMA. Panel padding = `--s3`, paneller arası = `--s3`, kart arası = `--s2`.
- **Tipografi ölçeği:** `--f-hero:22px` (KPI rakamı) · `--f-h1:18px` (panel başlığı,
  `.panel h2`) · `--f-h2:13px` (kart başlığı, `.params .pgroup .ptitle`) ·
  `--f-body:13px` · `--f-label:11px` (uppercase micro-etiket: `.side h3`,
  `.kpi .lbl`, `.weights-note`).
- **`--radius:12px` + `--shadow`** tek tip kabuk; mevcut `--radius-sm/md/pill` ve
  `--shadow-sm/md` ince ayrımlar için KORUNDU. Gölge ve kenarlık aynı anda güçlü
  olmasın: hafif gölge + 1px `--line` yeter.
- **KPI şeridi KOMPAKT:** `#kpis` kartlarında etiket üstte, BÜYÜK rakam ile
  birim/alt-not AYNI satırda (grid alan atamasıyla, baseline hizalı) → kart
  yüksekliği ~yarıya indi. Bu düzen SADECE `#kpis`'e uygulanır — `.rollup-kpis`
  ve `.kanit-kpis`'in `.sub`'ı tam cümledir, onlar dikey (yığılmış) kalır.
  `renderKpis()` DEĞİŞMEDİ, salt CSS.
- **Durum Dağılımı şeridi KALDIRILDI** (`#durumKpis` + `renderDurumKpis()` +
  `.durum-kpis` CSS bloğu, hepsi silindi). Önce 4 dev kart, sonra tek satırlık ince
  pill şeridiydi; kullanıcı isteğiyle tamamen çıkarıldı — bilgi zaten tablodaki
  Durum kolonunda var. `actionTag()` DURUYOR (tablo kolonu onu kullanıyor).
  Geri isteniyorsa yeniden yazılmalı, gizli kod YOK.
- **Sekme çubuğu ÜST NAVY BAR'IN İÇİNDE** (`<nav class="tabs">`, `<header>` içinde,
  "Web App · Prototip" rozetinden sonra — `<main>`'de DEĞİL). Navbar dili: pasif
  sekmeler şeffaf zemin + `rgba(255,255,255,.7)` metin (kenarlık YOK), hover'da
  `rgba(255,255,255,.14)` zemin + tam beyaz, **aktif sekme dolu BEYAZ pill +
  `--navy` metin** (navy zeminde en yüksek kontrastlı ayrım). 6 uzun Türkçe etiket
  sığmazsa çubuk İKİNCİ SATIRA SARAR (yatay scroll değil — scroll'da sekmelerin bir
  kısmı görünmez kalırdı); `@media (max-width:1100px)` altında `margin-left:auto`
  kalkar, çubuk kendi satırında SOLDAN başlar. `header` bu yüzden `flex-wrap:wrap`.
  JS seçicileri (`.tabs button`, `.tabpane`) document geneli olduğundan taşımadan
  ETKİLENMEDİ — `<div>` → `<nav>` değişimi de güvenli.
- **Header yüksekliği artık DEĞİŞKEN** (sekmeler sarabilir). Bu yüzden `.wrap`'teki
  eski `min-height:calc(100vh - 52px)` sabiti KALDIRILDI; yerine `body` dikey flex
  (`display:flex;flex-direction:column;min-height:100vh`) + `.wrap{flex:1}` geldi.
  Header'a yükseklik ekleyen bir değişiklik yaparsan bu mekanizma kendiliğinden
  uyum sağlar, sabit piksel HESAPLAMA.
- **"Bütçe Kurgusu — Nasıl Hesaplanıyor?" ARTIK PANEL DEĞİL, MODAL.** Eski
  accordion paneli (`.panel.formula` + `#formulaBox` + `initFormulaToggle()`)
  kaldırıldı; içerik aynen, ana tablo başlığındaki `(i)` ikonuna
  (`#formulaInfoBtn`, `.info-ico`) tıklanınca açılan ekrana ortalı modal'da
  (`#formulaModal`, `.modal-overlay`/`.modal-box`, `initFormulaModal()`).
  Kapanış üç yoldan: `×` butonu, overlay boşluğuna tıklama, `Esc`. Modal markup'ı
  `<body>` sonunda, script etiketlerinden hemen ÖNCE durur (panel/tablo
  `overflow` kutularına takılmasın diye) — `.tabpane` içine TAŞIMA. Tamamen
  bilgilendirme; hiçbir parametreye/hesaba dokunmaz.
  NOT: `.panel.formula`, `.fbox`, `.wK/.wS/.wSt/.wH` CSS kuralları SİLİNMEDİ —
  Toptan'ın "Nasıl Çalışır?" paneli ve Ağırlıklar kartı hâlâ kullanıyor.
  Toptan'ın paneli KASITLI olarak açık (`▾`) accordion kalır — orası yöntemin
  kendisini anlatır, `initToptanInfoToggle()` DEĞİŞMEDİ.
- **Planlama Parametreleri: DÖRT EŞİT KART, TEK SATIR, TEK STİL.** Global Hedefler ·
  Kampanya Çarpanları · Gam & Kota · Plan Stok % Ağırlıkları — hepsi tek `.params`
  gridinde (`repeat(4,minmax(0,1fr))`), hepsi sade `--surface`. `align-items:stretch`
  + `.pgroup{display:flex;flex-direction:column}` ile kart yükseklikleri EŞİTLENİR;
  "Toplam Çarpan" pill'i ve `.weights-note` `margin-top:auto` ile kartın DİBİNE
  yaslanır. Kırılım: 1240px altı 2 sütun, 720px altı tek sütun (doğrulandı:
  1100px'te 2 satır, kart içi taşma yok, yatay scroll yok).
  TARİHÇE (artık geçersiz): ağırlıklar kartı bir dönem ayrı satırda, `--accent-bg`
  zeminli, `border-left:4px solid var(--accent)` ve 🎯 ikonlu VURGULU bir kart idi
  (`.params-weights` / `.pgroup-weights` / `.weights-grid` kuralları). Kullanıcı
  "hepsi aynı stilde olsun" dediği için bu ayrıcalıklı stil ve 🎯 KALDIRILDI;
  o CSS kuralları da silindi. Geri isteniyorsa yeniden yazılmalı.
- **Slider YOK — `.numfield` sayı kontrolü.** Kampanya Çarpanları ve Gam & Kota
  bir dönem `input[type=range]` kullanıyordu; hassas ayar için uygun değildi
  (1 puanı tutturmak zor, dokunmatikte hantal). Yerine `.numfield`: `−` / sayı /
  `%` / `+`. Üç giriş yolu birden: rakamı doğrudan yaz · −/+ ile adımla ·
  odaktayken klavye ok tuşları (native `input[type=number]` davranışı).
  Adım input'un `step` niteliğinden okunur (parametreler 1, ağırlıklar 5);
  `min`/`max` varsa kırpılır (kampanya −30..40). Native spinner okları CSS ile
  gizlidir (kendi butonlarımız var), klavye okları YİNE ÇALIŞIR.
  `initNumFields()` butona basınca `input` olayı YAYAR — bu yüzden mevcut
  dinleyiciler (`updateAll`, `enforceWeightTotal`) hiç değişmeden çalışır; yeni
  bir parametre eklerken de aynı deseni kullan, ayrı bir hesap yolu AÇMA.
  NOT: slider'ların yanındaki `v_paro`/`v_bundle`... değer etiketleri KALDIRILDI
  (değer artık input'un içinde). `updateAll()` içindeki `$("v_"+k)` satırı da
  silindi — geri eklersen `null` hatası alırsın.
- **Buton hizalama — ÖLÇÜLDÜ, TAHMİN DEĞİL.** Ana tablo başlığındaki dört buton
  aynı `.btn.ghost.mini` sınıfına sahipken üç FARKLI yükseklikte ve dört farklı
  dikey konumda çıkıyordu (ölçüm: 20,0 / 21,0 / 23,0px · top 129/130/131/134).
  İki kök neden: (1) emoji ve simge karakterleri (📐 🔁 💾 ↺) farklı font
  metrikleriyle `line-height:normal` altında her butonda başka satır yüksekliği
  üretiyor; (2) `.grid-format-wrap` `display:inline-block` idi, yani h2'nin flex
  hizalamasına katılmayıp baseline'a oturuyordu.
  ÇÖZÜM (ikisi birden, tek başına yeterli değil):
  · `.btn` artık `inline-flex + align-items:center + min-height + line-height:1`
    — yükseklik İÇERİĞE BIRAKILMAZ. Yeni buton eklerken bu kuralı bozma.
  · `.grid-format-wrap` `display:flex`.
  · Butonlardaki emoji/simge KALDIRILDI (miks başlığı + Senaryo sekmesi).
    Bu, Bölüm 7.0'daki "buton emojilerine dokunulmadı" kararını GEÇERSİZ kılar —
    emoji hizasızlığın ölçülmüş kök nedeniydi, kozmetik tercih değil.
    Aksiyon hiyerarşisi artık renkle: birincil = dolu accent (`.btn`),
    ikincil = `.btn.ghost`. Emoji GERİ EKLEME.
  · `.stepper .btn{min-height:0}` — stepper butonları kompakt kalsın (19px).
  Doğrulama sonrası: dört butonun top/bottom/yükseklik sapması **0,00px**,
  yatay aralık 6/6/6px.
- **Aksiyon grubu sarmalayıcısı:** başlıktaki not + butonlar tek `.panel-actions`
  (`margin-left:auto`) içinde, butonlar `.btn-group` içinde. `margin-left:auto`
  SADECE `.panel-actions`'ta — tekil butona EKLEME (iki eleman bağımsız sağa
  yaslanınca aralarında ölü boşluk oluşuyordu, bu daha önce yaşandı).
- **"Toplam Çarpan"** tam genişlik şerit değil, accent zeminli küçük pill rozet.
- **Senaryo Karşılaştırma AYRI SEKME** (eski "Senaryo Yönetimi" kartı miks
  sekmesinden SÖKÜLDÜ). Kayıt yokken tablo (dolayısıyla dev lacivert boş başlık
  şeridi) tamamen gizlenir, yerine ince gri "Henüz senaryo kaydedilmedi." satırı
  (`#scEmpty` / `#scTableWrap`, `renderScenarios()` ikisini takas eder).

- **Tasarım tutarlılığı (1. tur — "AI slop" geçişi, SADECE kabuk katmanı):** Başlık emoji'leri
  (📊🧠⚙️💾🧮📅⚖️🔮🎨) tamamen kaldırıldı — başlık metni direkt kelimeyle başlar (bazı
  buton emoji'leri, ör. ➕/🗑️/↺, kasıtlı olarak dokunulmadan bırakıldı, kapsam dışıydı).
  `:root`'a ortak tasarım token'ları eklendi: `--radius-sm/--radius-md/--radius-pill`,
  `--shadow-sm/--shadow-md` (bkz. Bölüm 9 kuralı). `.kpi/.panel/.pgroup/.pill/.badge/.tag/
  .stepper/.btn` gibi kabuk elemanları bu token'lara geçirildi (mevcut görünüm korunarak,
  saf kaynak birleştirme). `.segmented button.is-on` gradyanı düz `var(--navy)` rengine
  çevrildi (KPI/badge/panel'lerle tutarlı olsun diye); ana header'daki navy→navy2 gradyanı
  kasıtlı marka vurgusu olarak KORUNDU. `#grid` içindeki tablo-özel mantığa (colgroup,
  `--grid-row-pad` vb.) bu turda dokunulmadı.

Sol menü sırası: **TEŞKİLAT → ÜRÜN HİYERARŞİSİ → PERİYOT**.

**Sidebar SADECE "Bütçe & Stok Karışımı" sekmesinde görünür** (`syncSidebarVisibility()`,
`showTab` içinden çağrılır; `.wrap.side-hidden .side{display:none}`). Diğer sekmeler ya
kayıtlı veriden beslenir (Perakende/Toptan Bütçe) ya statiktir (Takvim, Metodoloji) ya da
seçimden bağımsızdır (Senaryo) — seçimi orada göstermek yanıltıcı olurdu. `.side` sabit
240px bir flex item olduğundan gizlenince `.main` (flex:1) boşluğu KENDİLİĞİNDEN doldurur;
ayrıca genişlik kuralı yazma. Gizlemek `state.sel`i DEĞİŞTİRMEZ, sadece görünürlüktür.
**Kullanıcı da kapatabilir:** `#sideToggle` düğmesi (`initSidebarToggle()` /
`applySidebarCollapsed()`) `.wrap`'e `side-collapsed` sınıfı ekler; tercih
`SIDE_COLLAPSE_KEY` ("arpaz_side_collapsed") ile localStorage'da KALICIdır.
Düğme `.side`'ın DIŞINDA, `.wrap` içinde durur — içinde olsaydı kapanınca kendisi de
kaybolur, geri açmanın yolu kalmazdı. Kapalıyken sol kenara yaslanır ve ok yönü
değişir (‹ / ›). `#selInfo` bar'ın içinde olduğundan kapalıyken seçim görünmez;
bu yüzden güncel seçim düğmenin `title`'ına taşınır ve `updateSelInfo()` her
çalıştığında tazelenir. İki gizleme sebebi BAĞIMSIZdır ve aynı anda geçerli
olabilir: `.side-hidden` (sekme kaynaklı) · `.side-collapsed` (kullanıcı kaynaklı).
**İSTİSNA/DİKKAT:** "Tahmin (Forecast)" sekmesi hâlâ CANLI modelden (`computeModel`,
dolayısıyla sidebar seçiminden) besleniyor — orada sidebar gizli olduğu için kullanıcı
seçimi değiştiremez, miks ekranında en son ne seçtiyse onun tahminini görür. Forecast
gerçek veriyle bağlandığında (bkz. Bölüm 11.3) bu yeniden değerlendirilmeli.
- **Teşkilat:** `#h_org` (Satış Teşkilatı: Tümü/Arçelik/Beko), `#h_region` (Şube/Bölge:
  Tümü + 5 bölge). app.js bunları `DataService.orgs()/regions()` ile doldurur; change →
  `setOrg/setRegion` + `rebuild()`. Başlangıç "Tümü" (value="").
- **Ürün Hiyerarşisi:** `#h_uh1`, `#h_uh2`, `#h_uh3` (kaskad).
- **Periyot (like-for-like):** Baz (LY) / Hedef (TY) — şimdilik görsel.
- Sekmeler (üst navy bar içinde, soldan sağa GÜNCEL sıra — sadece buton metni/sırası,
  `data-tab` değerleri DEĞİŞMEDİ): **Bütçe & Stok Karışımı** (`data-tab="miks"`, ana) · **Perakende Bütçe**
  (`data-tab="kayitlar"`, eski adı "Kayıtlar" — Özet/Rollup paneli + kayıtlı çalışmalar,
  bkz. Bölüm 14) · **Toptan Bütçe** (`data-tab="toptan"`, bkz. Bölüm 13) · Kampanya/Özel
  Gün Takvimi (2021+, `data-tab="takvim"`) · **Perakende → Toptan (Metodoloji)**
  (`data-tab="rasyo"`, eski adı "...(Kanıt)"/"...Rasyo" — statik infografik vitrini,
  bkz. Bölüm 13.9) · Tahmin (Forecast, `data-tab="forecast"`) · **Senaryo
  Karşılaştırma** (`data-tab="senaryo"`, çubuğun EN SONU — bkz. Bölüm 7).
- Ana tablo blokları: **GERÇEKLEŞEN (LY)** [Stok Adet, Stok%, Satış Adet, Satış%,
  Brüt Kâr (₺), Kâr%, Cover, Turnover, **Ortalama Satış Fiyatı** — 9 kolon] ve
  **GELECEK YIL PLANI (TY)** [Plan Stok %, Plan Stok Adet, Hedef Cover(elle), Satış Bütçe,
  **Ortalama Satış Fiyatı(elle)**, **Ciro Bütçe**, LFL%, **R-LFL%**, Stok Büy.% — 9 kolon]
  + Durum + Aksiyon. Toplam: Grup(1) + LY(9) + TY(9) + Durum(1) + Aksiyon(1) = **21 kolon**.
  LY Fiyat = SatışTutar/SatışAdet (gerçek veri). TY Fiyat elle girilebilir (boşaltılırsa
  LY Fiyat × Fiyat Büyümesi %'ye otomatik döner, Hedef Cover ile AYNI desen — bkz. Bölüm 8).
  Ciro Bütçe = Satış Bütçe × TY Fiyat.
- **Pay (%) kolonlarının hücre vurgusu:** Stok Adet % · Satış Adet % · Brüt Kâr %
  hücreleri `.pct-hl` sınıfıyla hafif mavi tint alır (`--accent-tint`), TOPLAM
  satırı dahil. Bu üç kolon aynı alt-toplama göre kıyaslanır ve Durum/Aksiyon
  2×2 matrisini besler (bkz. Bölüm 6) — birlikte okunmaları için gruplanmıştır.
  Tint YARI SAYDAM olmalı: opak bir renk `tbody tr:hover` zeminini ezip satır
  vurgusunu öldürüyor. Üç hücre de AYNI görünür: düz metin, `.pct` gri rengi,
  aynı tint. Kâr % hücresinde bir dönem `.heat` pill'i vardı (kâr payına göre
  kırmızı→yeşil tek-bacaklı skala); kullanıcı isteğiyle KALDIRILDI, çünkü tint
  vurgusunu örtüyordu. Onunla birlikte artık ölü kalan `heat()` fonksiyonu ve
  `.heat` CSS kuralı da SİLİNDİ — geri isteniyorsa yeniden yazılmalı. Kanıt
  sekmesindeki `heatDiverge()` AYRI bir fonksiyondur, ondan etkilenmedi.
- **KPI şeridi (`#kpis`, 6 kart) — ana tablonun ÜSTÜNDE** (özet önce, detay sonra;
  eskiden tablonun ve parametrelerin ALTINDAydı). Dördü "LY → TY" kıyası (büyük
  değerde çift + `.kpi-arrow`, alt satırda birim · yüzdesel değişim), ikisi saf oran:
  **STOK** (LY stok → TY plan stok · Stok Büyümesi %) · **SATIŞ** (LY satış → TY satış
  bütçesi · LFL %) · **BRÜT KÂR** (LY kâr → TY kâr ₺ · değişim %) · **BAYİ STOK AY
  (COVER)** (LY → TY ay · değişim %) · **LFL BÜYÜME** · **R-LFL BÜYÜME**.
  - Değerler ana tablonun TOPLAM satırıyla (tfoot) BİREBİR aynı kaynaktan gelir
    (`m.T.*`) — doğrulandı, iki yerde farklı formül YOK.
  - **COVER kartında renk mantığı TERStir:** cover'ın DÜŞMESİ iyidir (stok daha hızlı
    dönüyor) → yeşil; artması kırmızı. Diğer kartlarda artış yeşildir. Bunu "hata"
    sanıp düzeltme.
  - "Toplam Satış Bütçe (TY)" kartı KALDIRILDI — TY satış zaten SATIŞ kartının sağ
    tarafı, iki yerde göstermek tekrardı.
- **`T.tyProfit` — TY brüt kâr SENTETİK ÜSTÜNE VARSAYIM.** LY brüt kârın kendisi zaten
  sentetik (bkz. Bölüm 3: `satis_tutar × marj%`); TY kârı ise `tyRevenue × AYNI marj%`
  ile türetilir. Yani **TY marjı = LY marjı** varsayılır — uygulamada marj değişimi
  parametresi YOK. Bu değer **bütçe hesabına GİRMEZ**, sadece BRÜT KÂR kartında LY→TY
  kıyası için üretilir. Marj değişimi parametresi eklenirse burası da güncellenmeli.
  Türetilen diğer toplamlar (`T.tyCover`, `T.stockGrowth`, `T.profitGrowth`, `T.rlfl`)
  `computeFromData` içinde, tfoot'takiyle AYNI formüllerle hesaplanır.
- **Senaryo Karşılaştırma** (`data-pane="senaryo"`, AYRI SEKME — miks ekranında
  kart olarak DEĞİL): parametre setini kaydet/karşılaştır; en iyi LFL yeşil.
  Giriş noktası ana tablo başlığındaki **📐 Senaryo kaydet** butonu
  (`#saveScenarioBtn`) — otomatik "Senaryo N" adıyla kaydeder ve `showTab("senaryo")`
  ile kullanıcıyı bu sekmeye AKTARIR. Sekmenin kendi çubuğunda isim alanı
  (`#scName` + `#saveSc`) ve Temizle (`#clearSc`) durur; satırdaki senaryo adı
  `contenteditable` (`.sc-name`) — tıklayıp yeniden adlandırılır, boş bırakılırsa
  eski ada döner. Senaryolar OTURUMA ÖZELDİR (localStorage YOK, sayfa yenilenince
  sıfırlanır) — "Kaydet"/`savedMixSets` ile KARIŞTIRMA, o ayrı bir mekanizma.
- **Ana tablo (`#grid`) — Görünüm araç çubuğu** ("Görünüm" butonu, `#gridFormatPanel`):
  PowerBI tarzı, SADECE bu tabloyu etkiler. Satır yüksekliği (sürükle veya +/-), başlık/
  hücre yazı boyutu + kalın, başlık/hücre hizalama (Sol/Orta/Sağ). Ayrıca sütun genişlikleri
  başlık kenarından sürüklenerek ayarlanabilir (Power BI tarzı). Tüm ayarlar localStorage'a
  yazılır (bkz. Bölüm 8). "Kayıtlı Görünüm" alt-bölümü bu ayar setini isimle kaydedip
  sonra tekrar uygulamaya izin verir. "↺ Görünümü sıfırla" hem sütun genişliğini hem
  format ayarlarını (kayıtlı görünüm dahil değil) varsayılana döndürür.

---

## 8) app.js — Anahtar Fonksiyonlar
- `initHierarchy()` — org/region + ÜH1/ÜH2/ÜH3 select'lerini kurar, event bağlar.
- `readParams()` — stokBuyume, pazar, fiyatBuyume, wKar/wSatis/wStok, camp{paro,bundle,event,gam,kota}.
- `computeFromData(data, p, covers, tyFiyatOverrides)` — SAF hesap; `computeModel` = loadMix wrapper.
- `buildTable()` — DOM'u bir kez kurar (input focus korunur). Tek dallı, düz ÜH4 listesi
  üretir; `state.level` HER ZAMAN `"uh4"` olduğundan (bkz. Bölüm 4, 10) `level`'e göre
  bir dallanma YOKTUR (eski uh3 drill-down dalı kaldırılmıştır).
- `syncLevel()` — `state.level`'i koşulsuz `"uh4"`'e sabitler (kasıtlı, bkz. Bölüm 10).
  `refreshUh3()` — ÜH2 değişince ÜH3 select'ini doldurur, HER ZAMAN ilk ÜH3'ü
  (`keys[0]`) otomatik seçer; boş/"Tümü" option'ı YOKTUR, ÜH3 seçimi zorunludur.
- `updateAll()` — hücreleri yeniden hesaplayıp yazar; tfoot TOPLAM; KPI; forecast.
- `actionTag(...)` — 2×2 matris (bkz. Bölüm 6).
- `showTab(t)` — sekme geçişini yapan TEK yer; hem navbar butonları hem programatik
  çağrı (`#saveScenarioBtn`) bunu kullanır. Yeni bir sekme açılışında iş yapılması
  gerekiyorsa (ör. `toptan` için `renderToptanFromSaved`) koşul BURAYA eklenir.
- `addScenario(name)` — o anki parametre setini senaryoya ekler; `name` boşsa
  otomatik "Senaryo N". Hem başlıktaki `#saveScenarioBtn` hem paneldeki `#saveSc`
  bunu çağırır (kayıt mantığı TEK yerde).
- `renderKpis / renderScenarios / renderCalendar / renderKanit / renderForecast`.
- Biçimleyiciler: `fmtN` (tr-TR tam sayı), `fmtP`/`fmtP0` (yüzde), `fmtX` (çarpan),
  `fmtD`/`fmtD2`/`fmtD3` (ondalık, 1/2/3 basamak). Türkçe locale ZORUNLU.
- **`initColResize()`** — `#grid` başlık hücrelerine sürüklenebilir kenar tutamacı
  (`.col-resize-handle`) ekler; sütun genişliğini `<colgroup>`'taki ilgili `<col>`'a yazar.
  `GRID_COLS_KEY` ("arpaz_grid_col_widths") ile localStorage'a kaydedilir. Sütun bazlı
  minimum genişlik `COL_MIN_WIDTHS` sabitinde (ÜH4/Hedef Cover/Durum/Aksiyon için özel,
  diğerleri 36px). `rebuild()` `grpColHead`'in içeriğini ezdiği için ÜH4 tutamacı ayrıca
  `attachUh4ResizeHandle()` ile yeniden takılır.
- **`initSavedMixColResize(list)`** — AYNI davranışı "Çalışılmış Bütçe ve Stok
  Karışım" tablosuna (`.saved-mix-table`, Perakende Bütçe sekmesi) getirir; ortak
  olan tek şey `.col-resize-handle` CSS sınıfıdır, gerisi AYRI bir uygulamadır
  (`#grid`'in makinesi modül seviyesindeki `gridCols`/`GRID_COLS_KEY`'e sıkı bağlı,
  genelleştirmek yerine ikinci bir uygulama yazıldı). Genişlikler
  `SAVED_MIX_COLS_KEY` ("arpaz_saved_mix_col_widths") altında saklanır; kolon
  seti değişirse (dizi uzunluğu tutmazsa) eski kayıt GEÇERSİZ sayılıp varsayılana
  dönülür. Minimum 40px (`SAVED_MIX_MIN_COL_WIDTH`). Tutamağa ÇİFT TIK o kolonu
  varsayılana döndürür (bu tablonun `#grid`'deki gibi "Görünümü sıfırla" butonu yok).
  **DİKKAT — iki tuzak:** (1) Tablo her filtre/kayıt değişiminde `innerHTML` ile
  SIFIRDAN kurulur; bu yüzden genişlikler `renderSavedMixTable()` içinde
  colgroup'a localStorage'den basılır ve tutamaklar render SONUNDA yeniden takılır.
  (2) CSS'te `.saved-mix-table{width:100%;min-width:3286px}` var — sabit min-width
  sürüklemeyi yutuyordu (tarayıcı farkı diğer kolonlara dağıtıyor), bu yüzden
  `syncSavedMixTableWidth()` tablo `width`.ini VE `min-width`.ini colgroup toplamına
  eşitler.
- **`syncSavedMixHeaderOffset()`** — "Çalışılmış Bütçe ve Stok Karışım" tablosunda
  DONMUŞ BAŞLIK (freeze pane). İki satır donar: kolon adları (`.saved-mix-header-row`,
  `top:0`) ve filtre satırı (`.saved-mix-filter-row`, `top` = 1. satırın ÖLÇÜLEN
  yüksekliği — sabit yazılamaz, kolon genişliğine göre başlık sarıp yükseliyor).
  Ana `#grid`'in `syncHeaderStickyOffset()`'i ile AYNI desen.
  **Kritik ön koşul:** `.saved-mix-table-wrap` eskiden `overflow-y:hidden` idi ve
  başlık DONMUYORDU — `position:sticky` en yakın KAYDIRILABİLİR ataya tutunur,
  `overflow-y:hidden` sarmalayıcıyı "dikeyde kaydırılamaz" bir scroll container
  yapıyordu. Artık `max-height:520px;overflow:auto` (ana `#grid`'in sarmalayıcısıyla
  aynı çözüm). Bu yüzden tablo ARTIK KENDİ İÇİNDE kayar, sayfayla birlikte değil.
  **İkinci tuzak:** "Perakende Bütçe" sekmesi varsayılan GİZLİ geldiği için tablo
  ilk kez gizliyken render edilir → başlık yüksekliği 0 ölçülür → filtre satırı
  başlığın üstüne biner. Bu yüzden `showTab("kayitlar")` içinde YENİDEN çağrılır
  (Toptan sekmesindeki `syncToptanHeaderOffset` ile birebir aynı tuzak). Ayrıca
  sütun sürüklemede ve `window.resize`'ta da çağrılır.
- **`initGridFormat()` / `applyGridFormat()`** — Görünüm araç çubuğunun motoru. Ayarlar
  (`rowPad, headerSize, headerBold, cellSize, cellBold, headerAlign, cellAlign`) CSS
  custom property olarak `#grid` öğesine yazılır (`--grid-row-pad`, `--grid-h-size`,
  `--grid-h-weight`, `--grid-c-size`, `--grid-c-weight`, `--grid-h-align`, `--grid-c-align`);
  `styles.css`'teki `#grid` kuralları bu değişkenleri güvenli fallback'lerle (`var(--x,eski
  değer)`) okur — böylece `#grid` DIŞINDAki hiçbir öğe (aynı sınıfları paylaşsa bile,
  ör. `.badge`) etkilenmez. `GRID_FORMAT_KEY` ("arpaz_grid_format") ile
  localStorage'a kaydedilir; `loadSavedGridFormat()` bozuk/eksik veriye karşı her alanı
  ayrı ayrı doğrular (aralık dışıysa veya tipi yanlışsa varsayılana döner).
- **`syncHeaderStickyOffset()`** — iki satırlı sticky başlığın (rowspan=2 ÜH4/Durum/Aksiyon
  + 15 metrik başlıklı 2. satır) çakışmasını önler. 2. satırın `top`'u sabit 0 DEĞİL,
  1. satırın `getBoundingClientRect().height` ile ÖLÇÜLEN gerçek yüksekliğidir (Başlık
  Yazı Boyutu değiştikçe bu yükseklik değişir). Sayfa yüklendiğinde, `applyGridFormat()`
  her çalıştığında ve pencere resize'ında yeniden çağrılır.
- **Kayıtlı Görünüm (saved views)** — `saveCurrentView()/applySavedView()/deleteSavedView()/
  renderSavedViews()`: kullanıcının o anki tüm Görünüm ayarlarını (`gridFormat` objesinin
  tamamı) isimle `VIEW_STORAGE_KEY` ("arpaz_table_views") altında bir obje olarak saklar
  (`{ isim: gridFormat }`). `LAST_VIEW_KEY` ("arpaz_last_view") en son uygulanan/kaydedilen
  görünümün adını tutar — sayfa yeniden açıldığında (`initGridFormat()`) önce bu isimdeki
  kayıtlı görünüm varsa o yüklenir, yoksa düz `GRID_FORMAT_KEY`'e döner. `normalizeViewConfig`
  hem tekil ayarı hem kayıtlı görünüm setini aynı doğrulama mantığından geçirir.

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
- **Ana tabloya (`#grid`) kolon eklerken/çıkarırken TÜM bu yerleri BİRLİKTE güncelle**
  (22 kolona çıkarken hepsi elden geçti, bkz. commit geçmişi):
  1) `index.html` `<colgroup>` (yeni `<col>` + genişlik — bkz. Bölüm 9'daki ölçüm kuralı),
  2) `index.html` thead (grup `colspan` + 2. satır `<th>`, `title` attribute'uyla),
  3) `app.js` `buildTable()` satır şablonu (yeni `<td>`/input hücreleri),
  4) `app.js` `updateAll()` (yeni hücrelerin render'ı) ve `tfoot` (`<td>` sayısı + toplamı),
  5) `app.js` boş-veri satırının `colspan`'ı,
  6) `assets/styles.css` `#grid{width:...}` (colgroup toplamına eşit olmalı),
  7) `app.js` `COL_MIN_WIDTHS` ve `initColResize()`'daki Durum/Aksiyon `makeResizeHandle`
  index'leri (satır 2'nin th'leri `i+1` ile otomatik kayar, ama rowspan'lı ÜH4/Durum/
  Aksiyon'un sabit index'leri elle güncellenmeli). Güncel toplam kolon sayısı: **22**
  (Grup 1 + GERÇEKLEŞEN 10 [LY Satış Tutar/Ciro dahil] + GELECEK YIL PLANI 9
  + Durum 1 + Aksiyon 1).
- **Cerrahi düzenleme yap** (mümkünse tüm dosyayı değil ilgili bloğu değiştir).
- Küçük, sık commit al. Geri dönülebilir olsun.
- **Yeni renk/boşluk/tipografi/radius/gölge değeri eklerken önce `:root`'taki mevcut
  token'ları kullan** (bkz. Bölüm 7.0 — `--accent/--accent-bg`, `--s1..--s4`,
  `--f-hero/--f-h1/--f-h2/--f-body/--f-label`, `--radius`, `--shadow`; ince ayrımlar
  için `--radius-sm/--radius-md/--radius-pill`, `--shadow-sm/--shadow-md`),
  yeni ham değer YAZMA. **İkiden fazla vurgu rengi kullanma** — accent mavi +
  durum renkleri (sadece rozet/tabloda); `--navy` marka/yapı rengidir, vurgu değil.
  Kabuk (panel/kart/badge/buton) katmanı bu token'lardan besleniyor; `#grid` içindeki
  tablo-özel değerler (`--grid-row-pad` vb., bkz. Bölüm 8) bu token'lardan AYRI ve
  kasıtlı olarak farklı bir mekanizma — birbirine karıştırılmasın.
- **Orantılılık:** Görev küçük/kozmetikse (tek metin, tek CSS kuralı, tek
  renk/etiket değişikliği) SADECE ilgili bölümü/dosyayı oku, kabul
  kriterini 1-2 maddeye indir — dosyanın tamamını satır satır yeniden
  okumaya veya 10 maddelik test matrisine gerek yok. Bu rijitlik
  yapı/formül değişikliklerinde (Bölüm 5, kolon ekleme/çıkarma) haklı,
  kozmetik işlerde gereksiz yavaşlatır. Şüphedeysen sor, ama varsayılan
  orantılı davranmak olsun.
- **Detaylı özellik dokümanları ayrı dosyalarda:** "Toptan Bütçe"/"Kanıt"
  sekmesi için `docs/TOPTAN_KOPRUSU.md`, Rollup paneli için
  `docs/ROLLUP_PANELI.md` — SADECE o özelliğe dokunurken oku, her görevde
  okumana gerek yok.

---

## 10) Mevcut Durum (Bilinen Noktalar)
- TAMAMLANANLAR:
  - Durum + Aksiyon iki ayrı kolon (2×2 matris, Arpaz aksiyonları — bkz. Bölüm 6).
  - Teşkilat (org/bölge) filtresi uçtan uca çalışıyor; marj/indirim ciro-ağırlıklı
    (satış tutarına göre) toplanıyor, düz ortalama değil.
  - (İPTAL) temizliği TAMAMLANDI ve hiyerarşi artık veriden yeniden üretiliyor (bkz.
    Bölüm 3-4).
  - Boş seçim koruması: org/bölge/ÜH filtresi 0 satır dönerse tabloda "Bu seçim için
    veri bulunamadı." bilgi satırı çıkar; tfoot/KPI'lar NaN/Infinity yerine 0 veya "—"
    gösterir.
  - R-LFL kolonu (bkz. Bölüm 5.1). Durum Dağılımı KPI şeridi eklenmiş, sonra
    kullanıcı isteğiyle KALDIRILMIŞTIR (bkz. Bölüm 7.0).
  - Ölü stok işaretleme — KARAR VERİLDİ ve UYGULANDI (bkz. Bölüm 5.2): göreli eşik
    (çarpan × görünen satırların medyanı, min 12 ay), SADECE görsel rozet, bütçeye etkisi yok.
  - TARİHÇE (artık geçersiz) — bir ara dönemde `syncLevel()` `state.sel.uh3`'e göre
    `"uh3"`/`"uh4"` arasında dallanıyordu ve buna eşlik eden bir ÜH3 drill-down
    (ana satır + gizli ÜH4 child satır, expander ▶/▼) UI'ı vardı. Bu UI daha sonra
    tamamen kod tabanından kaldırıldı; `refreshUh3()` da aynı dönemde "Tümü (ÜH3)"
    placeholder'ını üretmeyi bıraktı. Bu ikisi birbirinden bağımsız gibi görünse de
    birlikte ele alınmalı — bkz. DİKKAT NOTU aşağıda.
- **DİKKAT NOTU — ÜH3 seçimi ZORUNLU, `state.level` HER ZAMAN "uh4": BİLİNÇLİ TASARIM
  KARARI, eksik/regresyon DEĞİL.** `refreshUh3()` boş/"Tümü (ÜH3)" option'ı üretmiyor
  (kullanıcı her zaman belirli bir ÜH3 seçili durumda); `syncLevel()` koşulsuz
  `"uh4"` atar. Bir düzeltme talebi üzerine `state.level = state.sel.uh3 ? "uh3" :
  "uh4"` mantığı test edildi ve GERÇEK bir regresyona yol açtığı doğrulandı:
  `state.sel.uh3` hiçbir zaman boş olamadığından koşul her zaman `"uh3"`e düşüyor,
  `DataService.loadMixFor` da bu durumda ÜH4 detay satırlarını TEK bir ÜH3 toplam
  satırına indirgiyor — tablo her seçimde 1 satıra düşüyordu (test edildi). Ayrıca
  eski ÜH3 drill-down/expander UI'ı da kod tabanından kaldırılmış durumda; düzeltilse
  bile sonuç "roll-up" olurdu, "drill-down" değil. Kullanıcı üç seçenek arasından
  ("Tümü (ÜH3)"yü geri getir / `state.level`'i `"uh4"`'te sabit bırak / talimatı
  harfiyen uygula) **`"uh4"`'te sabit bırakmayı seçti** — mevcut çok satırlı, detaylı
  tablo davranışı bilinçli olarak korunuyor. **İleride biri bunu "düzeltmeye"
  kalkışmasın: "Tümü (ÜH3)" placeholder'ı geri getirilmeden `syncLevel()`'deki
  koşulu DEĞİŞTİRME** (bkz. Bölüm 4, 8; `app.js`'te `syncLevel()` üzerindeki yorum
  aynı gerekçeyi taşır).
- DİKKAT NOTU — Hedef Cover tavanı tartışıldı, TAVAN UYGULANMAYACAK: Varsayılan (org/bölge
  Tümü) görünümde 328 ÜH4 yaprağının LY cover'ı ölçüldü — medyan ≈11,4 ay, ~153'ü 12 ayın
  üzerinde, en uçta satışı sıfıra yakın kalemlerde 3.687 aya kadar çıkıyor. Yine de tavan
  KONULMAYACAK: `Satış Bütçe = Plan Stok ÷ Hedef Cover` olduğu için cover'ı düşürmek
  bütçeyi BÜYÜTÜR — ölü stoğa yapay yüksek satış hedefi yazmak olur. Bunun yerine göreli
  ölü stok rozeti eklendi (Bölüm 5.2); eşik kullanıcı kararı değil, veriden ölçülerek
  (medyan-tabanlı, göreli) belirlendi.
- GELİŞTİRME ORTAMI NOTU: Bu makinede Node.js ve Python KURULU DEĞİL. `node --check`
  çalıştırılamıyor; sözdizimi/mantık doğrulaması headless Edge (`msedge --headless=new
  --dump-dom`) ile uygulamayı gerçekten çalıştırıp konsol/DOM kontrolüyle yapılıyor.
  Yeni bir oturumda önce `node`/`python` PATH'te var mı kontrol et, yoksa aynı yönteme dön.
- TROUBLESHOOTING: Teşkilat dropdown'ları `ORGS/REGIONS`'tan beslenir. Boş görünüyorsa
  neredeyse her zaman sebep: **eski realdata.js** yüklü (ORGS/REGIONS yok). Konsolda `ORGS`
  yazıp kontrol et; `ReferenceError` gelirse yeni realdata.js konmamış demektir.

---

## 11) Sıradaki Adımlar (Öncelik Sırası)
1. **Senaryo kaydı Hedef Cover setini tutmuyor.** `currentScenario()` sadece parametreleri
   ve toplamları saklıyor, `state.covers` saklanmıyor; senaryo kaydedilirken elle girilen
   cover seti dahil edilmiyor (geri yükleme özelliği de şu an yok, sadece kayıt/kıyas var).
   (Not: "en iyi LFL yeşil" vurgusu kontrol edildi — `renderScenarios()` içinde MEVCUT ve
   çalışıyor, kaldırılmasına gerek yok.)
2. Kampanya/Özel gün takvimini (2021+) ve kampanya geçmişini metadata olarak modele bağla.
3. Forecast yöntemini bütçe adedine tam entegre et (aylara dağıtım + cover ile plan stok).
4. IT tam veri verince `DataService`'i API'ye çevir (şema aynı).

---

## 12) İletişim Tarzı Tercihi
- Adım adım, net, kopyala-yapıştır kod. Gereksiz teori değil, çalışan çözüm.
- Hata olduğunda: F12 → Console → kırmızı satırı ver → hedefli düzelt.
- Frustrasyonda kısa empati + hızlı çözüm. Ben test edip geri bildiririm (iteratif).
- Türkçe konuş. Locale ve UI dili Türkçe kalsın.

---

## 13) Perakende → Toptan Köprüsü (Sell-out → Sell-in) — DETAY AYRI DOSYADA

Toptan Bütçe sekmesi + "Perakende → Toptan (Kanıt)" sekmesi için envanter
köprüsü formülü (r=0,894 doğrulanmış), mevsimsel katsayı, outlier kuralları,
Kayıtlar'dan besleme mimarisi ("Revize Et"), Durum/Sevki-durdur mantığı ve
kanıt vitrini render fonksiyonlarının TAM detayı:

**→ `docs/TOPTAN_KOPRUSU.md`** (SADECE bu sekmelere dokunurken oku)

---

## 14) "Perakende Bütçe" Sekmesi — Rollup Paneli — DETAY AYRI DOSYADA

ÜH1→ÜH2→ÜH3 özet/rollup paneli. **KAYNAK: "Çalışılmış Bütçe ve Stok Karışım"
kayıtları (savedMixSets) — CANLI sidebar seçimi DEĞİL.** Yani panel Toptan
Bütçe ile aynı mantıkta DONDURULMUŞtur: parametre oynatmak değiştirmez, önce
Kaydet/Revize Et gerekir. (Bir dönem CANLI idi, kullanıcı isteğiyle değişti.)
Gruplama, tetikleyiciler, kırılım/periyot seçicileri için TAM detay:

**→ `docs/ROLLUP_PANELI.md`** (SADECE bu panele dokunurken oku)

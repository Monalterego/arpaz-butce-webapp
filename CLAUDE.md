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
- **Tasarım tutarlılığı ("AI slop" geçişi, SADECE kabuk katmanı):** Başlık emoji'leri
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
- **Teşkilat:** `#h_org` (Satış Teşkilatı: Tümü/Arçelik/Beko), `#h_region` (Şube/Bölge:
  Tümü + 5 bölge). app.js bunları `DataService.orgs()/regions()` ile doldurur; change →
  `setOrg/setRegion` + `rebuild()`. Başlangıç "Tümü" (value="").
- **Ürün Hiyerarşisi:** `#h_uh1`, `#h_uh2`, `#h_uh3` (kaskad).
- **Periyot (like-for-like):** Baz (LY) / Hedef (TY) — şimdilik görsel.
- Sekmeler: **Bütçe & Stok Miks** (ana) · Toptan Bütçe (bkz. Bölüm 13) ·
  Kampanya/Özel Gün Takvimi (2021+) · **Perakende → Toptan (Kanıt)** (bkz. Bölüm 13.9,
  eski "Perakende/Toptan Rasyo" — statik infografik vitrini, RATIO verisi kaldırıldı) ·
  Tahmin (Forecast: LFL / Mevsimsel / 3-Aylık Hareketli Ort.) · Kayıtlar.
- Ana tablo blokları: **GERÇEKLEŞEN (LY)** [Stok Adet, Stok%, Satış Adet, Satış%,
  Brüt Kâr (₺), Kâr%, Cover, Turnover, **Ortalama Satış Fiyatı** — 9 kolon] ve
  **GELECEK YIL PLANI (TY)** [Plan Stok %, Plan Stok Adet, Hedef Cover(elle), Satış Bütçe,
  **Ortalama Satış Fiyatı(elle)**, **Ciro Bütçe**, LFL%, **R-LFL%**, Stok Büy.% — 9 kolon]
  + Durum + Aksiyon. Toplam: Grup(1) + LY(9) + TY(9) + Durum(1) + Aksiyon(1) = **21 kolon**.
  LY Fiyat = SatışTutar/SatışAdet (gerçek veri). TY Fiyat elle girilebilir (boşaltılırsa
  LY Fiyat × Fiyat Büyümesi %'ye otomatik döner, Hedef Cover ile AYNI desen — bkz. Bölüm 8).
  Ciro Bütçe = Satış Bütçe × TY Fiyat.
- KPI kartları (üst şerit, `#kpis`, 6 kart): Toplam Stok, Toplam Satış (LY), Toplam Kâr
  (LY ₺), Bayi Stok Ay (Cover), Toplam Satış Bütçe (TY), LFL Büyüme.
- Durum Dağılımı şeridi (`#durumKpis`, ayrı grid, 4 kart): actionTag'in 2×2 matrisindeki
  dört durumun (Hızlı&Kârlı/Kârsız, Yavaş&Kârlı/Kârsız) grup sayısı ve toplam içindeki payı
  — rozet renkleri `.badge b-green/b-amber/b-blue/b-red` ile aynı.
- Senaryo Yönetimi: parametre + hedef cover setini kaydet/karşılaştır; en iyi LFL yeşil.
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
- `renderDurumKpis(m)` — actionTag'in ürettiği 4 duruma göre grup sayısını ve payını
  `#durumKpis` şeridine yazar (kategori adları actionTag'ten türetilir, hardcode değil).
- `renderKpis / renderScenarios / renderCalendar / renderKanit / renderForecast`.
- Biçimleyiciler: `fmtN` (tr-TR tam sayı), `fmtP`/`fmtP0` (yüzde), `fmtX` (çarpan),
  `fmtD`/`fmtD2`/`fmtD3` (ondalık, 1/2/3 basamak). Türkçe locale ZORUNLU.
- **`initColResize()`** — `#grid` başlık hücrelerine sürüklenebilir kenar tutamacı
  (`.col-resize-handle`) ekler; sütun genişliğini `<colgroup>`'taki ilgili `<col>`'a yazar.
  `GRID_COLS_KEY` ("arpaz_grid_col_widths") ile localStorage'a kaydedilir. Sütun bazlı
  minimum genişlik `COL_MIN_WIDTHS` sabitinde (ÜH4/Hedef Cover/Durum/Aksiyon için özel,
  diğerleri 36px). `rebuild()` `grpColHead`'in içeriğini ezdiği için ÜH4 tutamacı ayrıca
  `attachUh4ResizeHandle()` ile yeniden takılır.
- **`initGridFormat()` / `applyGridFormat()`** — Görünüm araç çubuğunun motoru. Ayarlar
  (`rowPad, headerSize, headerBold, cellSize, cellBold, headerAlign, cellAlign`) CSS
  custom property olarak `#grid` öğesine yazılır (`--grid-row-pad`, `--grid-h-size`,
  `--grid-h-weight`, `--grid-c-size`, `--grid-c-weight`, `--grid-h-align`, `--grid-c-align`);
  `styles.css`'teki `#grid` kuralları bu değişkenleri güvenli fallback'lerle (`var(--x,eski
  değer)`) okur — böylece `#grid` DIŞINDAki hiçbir öğe (aynı sınıfları paylaşsa bile,
  ör. `.badge`/`.heat`) etkilenmez. `GRID_FORMAT_KEY` ("arpaz_grid_format") ile
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
  (21 kolona çıkarken hepsi elden geçti, bkz. commit geçmişi):
  1) `index.html` `<colgroup>` (yeni `<col>` + genişlik — bkz. Bölüm 9'daki ölçüm kuralı),
  2) `index.html` thead (grup `colspan` + 2. satır `<th>`, `title` attribute'uyla),
  3) `app.js` `buildTable()` satır şablonu (yeni `<td>`/input hücreleri),
  4) `app.js` `updateAll()` (yeni hücrelerin render'ı) ve `tfoot` (`<td>` sayısı + toplamı),
  5) `app.js` boş-veri satırının `colspan`'ı,
  6) `assets/styles.css` `#grid{width:...}` (colgroup toplamına eşit olmalı),
  7) `app.js` `COL_MIN_WIDTHS` ve `initColResize()`'daki Durum/Aksiyon `makeResizeHandle`
  index'leri (satır 2'nin th'leri `i+1` ile otomatik kayar, ama rowspan'lı ÜH4/Durum/
  Aksiyon'un sabit index'leri elle güncellenmeli). Güncel toplam kolon sayısı: **21**
  (Grup 1 + GERÇEKLEŞEN 9 + GELECEK YIL PLANI 9 + Durum 1 + Aksiyon 1).
- **Cerrahi düzenleme yap** (mümkünse tüm dosyayı değil ilgili bloğu değiştir).
- Küçük, sık commit al. Geri dönülebilir olsun.
- **Yeni border-radius/box-shadow/spacing değeri eklerken önce `:root`'taki mevcut
  token'ları kullan** (`--radius-sm/--radius-md/--radius-pill`, `--shadow-sm/--shadow-md`),
  yeni ham değer YAZMA. Kabuk (panel/kart/badge/buton) katmanı bu token'lardan besleniyor;
  `#grid` içindeki tablo-özel değerler (`--grid-row-pad` vb., bkz. Bölüm 8) bu token'lardan
  AYRI ve kasıtlı olarak farklı bir mekanizma — birbirine karıştırılmasın.

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
  - R-LFL kolonu ve Durum Dağılımı KPI şeridi (bkz. Bölüm 5.1 ve 7).
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

## 13) Perakende → Toptan Köprüsü (Sell-out → Sell-in)

### 13.1 Problem
Şimdiye kadar ekran, bayinin yerine geçerek **Perakende (sell-out) bütçesi** kuruyordu.
Ancak Arpaz için asıl kritik olan **Toptan (sell-in) bütçesi**: Arçelik'in bayilere
**sevk edeceği** adet. Perakende bütçesinden toptan bütçesine geçmek için bilimsel,
açıklanabilir bir yöntem gerekiyordu.

### 13.2 Yöntem — Envanter Akış Kimliği (ANA YÖNTEM)
Fiziksel kimlik (adet bazında):
```
Toptan_t  ≈  Perakende_t  +  ΔBayiStok_t
ΔBayiStok_t = BayiStok_t − BayiStok_(t−1)
```
Yani bayiye sevk = bayinin sattığı + bayi deposundaki stok değişimi. Bayi sezon
öncesi stoklar (toptan > perakende), sezon sonu eritir (toptan < perakende).

**DOĞRULANDI (historical veri, 2022-01 → 2026-03, 19.043 satır, 34 ÜH2, 411 ÜH4):**
- Korelasyon(beklenen toptan, gerçek toptan) = **0.894** (çok güçlü)
- Sapma oranı (ÜH4/aylık) = %34.6 → ÜH2/çeyrek bazında toplandığında çok azalır.
- Sonuç: kimlik güçlü; toptan'ı fiziksel köprüyle türetmek sağlam ve savunulabilir.

**Ekranla mükemmel uyum:** Kullanıcı zaten **Hedef Cover** giriyor →
Hedef Bayi Stok'u belirliyor → ΔStok otomatik çıkıyor → Toptan otomatik türeniyor.
Ekstra parametre gerekmez.

### 13.3 Yöntem — Mevsimsel Katsayı (KONTROL / DOĞRULAMA)
İkincil, çapraz-kontrol yöntemi:
```
Toptan Bütçe(ÜH2, ay) = Perakende Bütçe × KATSAYI(ÜH2, ay)
```
Katsayılar historical Toptan/Perakende oranından ÜH2 × ay bazında üretildi
(`toptan_katsayi.js` → `TOPTAN_KATSAYI[uh2][ay]`).

**Gözlemlenen desenler (yönetime anlatım için):**
- **Aralık = evrensel eritme:** neredeyse tüm kategoriler < 1 (yıl sonu stok kapama).
- **Klima:** Oca-May 1.7–2.5 (sezon öncesi dolum) → Tem ~0.8 (eritme).
- **Dondurucu:** Oca-Nis 2.8–5.0 (yaz öncesi dolum) → Ağu-Eyl ~0.5 (eritme).
- **Isıtıcılar:** Ağu-Eyl 3.2–3.7 (kış öncesi dolum).
- **Çekirdek beyaz eşya** (soğutucu/çamaşır/bulaşık): ılımlı dolum 1.1–1.7, yıl sonu ~0.85.

**Lead-Lag bulgusu:** Toptan, perakendeyi ~**2 ay önden** besliyor
(cross-correlation en güçlü lag = −2, r = +0.633). Yani sezon planlamasında
toptan bütçesi perakendeye göre öne çekilmelidir.

### 13.4 Outlier / Güvenilirlik Kuralları
Mevsimsel katsayıda ELE / DİKKAT:
- ELE: SOLAR ENERJI (rasyo yüzlerce/binlerce — perakende≈0), tüm (İPTAL) ÜH2'ler,
  GRUPSUZ (0), HAVALANDIRMA/HIJYEN/PROFESYONEL GÖRÜNTÜLEME (yeni rampa, 4–41).
- KIRP: katsayıyı 0.5–2.0 aralığına sıkıştır (aşırı uçları makul sınıra çek).
- Yıllık rasyo oynaklığı ~%56-59 (makro sell-in/sell-out döngüsü) → düz yıllık
  ortalamaya GÜVENME; envanter kimliğini veya aylık katsayıyı kullan.

### 13.5 Ekran Formülü (Toptan Bütçe sekmesi)
```
Toptan Bütçe(ÜH4, ay) = Perakende Bütçe + (Hedef Bayi Stok − Mevcut Bayi Stok)
  Hedef Bayi Stok = Hedef Cover × (aylık Perakende Bütçe)
  Mevcut Bayi Stok = son LY stok (stok_adet)

Kontrol kolonu (mevsimsel):
  Mevsimsel Toptan = Perakende Bütçe × TOPTAN_KATSAYI[uh2][ay]
  → İki değer yakınsa yöntemler birbirini doğruluyor (✓).
```

### 13.6 Veri/Dosya Notları
- `assets/toptan_katsayi.js`: `const TOPTAN_KATSAYI = { "ÜH2": { "1":kat, ... "12":kat } }`
  (index.html'de app.js'ten ÖNCE yüklenir).
- Katsayılar Colab analizinden üretildi (historical Perakende-Toptan.xlsx).
- Envanter kimliği için ekstra veri gerekmez; mevcut stok_adet + hedef cover yeter.

### 13.7 Son Kullanıcıya Anlatım İlkesi (ÖNEMLİ)
Ekranda toptan mantığı MUTLAKA sade Türkçe ile açıklanmalı (bkz. "Nasıl Çalışır?"
bilgi paneli). Son kullanıcı formülün ARDINDAKİ MANTIĞI anlamalı:
"Bayiye ne kadar mal göndereceğiz? = Bayinin satacağı kadar + bayinin deposunu
hedeflediğimiz seviyeye getirmek için gereken fark." Teknik jargon değil, sezgi ver.

### 13.8 Veri Kaynağı: KAYITLI Planlar, CANLI Seçim DEĞİL (ÖNEMLİ DAVRANIŞ)
Toptan Bütçe sekmesi artık sidebar'daki CANLI seçimden/parametrelerden BESLENMİYOR —
`buildFlatRows()` (Kayıtlar sekmesiyle AYNI düzleştirme) ile TÜM kayıtlı set'lerin
TÜM satırlarını okuyup, her satırın KAYIT ANINDA dondurulmuş `salesBudget/hedefCover/
stock` değerleriyle hesap yapar (`computeToptanFromSaved()`/`renderToptanFromSaved()`,
bkz. Bölüm 8). Sonuç: global bir parametreyi (ör. Hedef Stok Büyümesi %) sonradan
değiştirmek Toptan Bütçe'yi ETKİLEMEZ — o grubu güncellemek için kullanıcı o seçime
dönüp yeniden **Kaydet/Revize Et** yapmalı. Mevsimsel katsayı için `ay` de artık global
`h_targetperiod`'dan değil, HER SATIRIN KENDİ `targetperiod` alanından (`monthFromPeriodLabel`)
türetiliyor — aynı ÜH4 farklı Hedef Periyot'larla kaydedilmişse farklı katsayı kullanır
(test edildi: aynı bütçe, "Ocak" periyodunda katsayı×1, "Tam Yıl" periyodunda 12 ayın
ortalaması — iki satır farklı Mevsimsel Kontrol üretir, beklenen davranış).

**"Revize Et" mekanizması** (Bütçe & Stok Miks ekranı, `#saveMixSetBtn`): Eşleşme
anahtarı Satış Teşkilatı + Şube/Bölge + ÜH1 + ÜH2 + ÜH3 + Baz Periyot + Hedef Periyot
(**ÜH4 DAHİL DEĞİL** — bir kayıt zaten o ÜH3'ün tüm ÜH4'lerini birlikte tutuyor).
`findMatchingSavedSet()` sidebar seçimi bu 7 alanla mevcut bir kayıtla TAM eşleşiyorsa
butonu "🔁 Revize Et"e çevirir (yanında `#saveMixSetNote`'ta son kayıt zamanı görünür);
`saveCurrentMixSet()` bu durumda YENİ set EKLEMEZ, eşleşen set'i aynı `id` ile YERİNDE
üzerine yazar (Kayıtlar tablosunda ayrı bir blok olarak eklenmez, mevcut satırlar
güncellenir). Eşleşme yoksa normal "💾 Kaydet" (yeni set, 25 kayıt sınırı korunur).
Buton durumu `rebuild()` (ÜH1/2/3/org/bölge değişince) ve `h_baseperiod`/`h_targetperiod`
"change" olaylarında CANLI güncellenir. Kayıt/Revize/Silme her işlemden sonra
`renderToptanFromSaved()` de çağrılır ki Toptan Bütçe güncel kalsın.

**Bilinen sınırlama (kullanıcıya bildirildi, otomatik temizlenmedi):** Bu mekanizma
kurulmadan ÖNCE kaydedilmiş yinelenen (duplicate) satırlar Kayıtlar'da hâlâ olabilir —
bunlar Toptan Bütçe'de çift sayıma yol açar. Kayıtlar'ın mevcut "Sil" butonuyla elle
temizlenebilir; ayrı bir "Tekilleştir" (aynı 7 alanı paylaşan kayıtlardan en yenisini
tutup eskilerini silen) özelliği henüz YOK, talep gelirse eklenebilir.

### 13.9 "Perakende → Toptan (Kanıt)" Sekmesi — Statik İnfografik Vitrini
Eski "Perakende/Toptan Rasyo" sekmesi (yıl bazlı temsili `RATIO` tablosu — kaldırıldı,
`assets/data.js`'te artık yok) **gerçek analiz kanıtlarını** gösteren bir vitrine
dönüştürüldü. Amaç: son kullanıcı "toptan neden bu formülle hesaplanıyor" sorusuna
somut, ölçülmüş kanıtla cevap bulsun (bkz. Bölüm 13.2 envanter kimliği doğrulaması).

**Veri:** `assets/kanit.js` → `const KANIT` (özet istatistikler + lead-lag korelasyon
dizisi + ÜH2 yıllık rasyo listesi + mevsim imzası kartları — hepsi Colab analizinden
üretilmiş GERÇEK, sabit/geçmiş değerler, sidebar seçimine bağlı DEĞİL). Aylık ısı
haritası için ayrı veri gerekmedi, mevcut `assets/toptan_katsayi.js` (`TOPTAN_KATSAYI`)
tekrar kullanıldı. İkisi de `index.html`'de `app.js`'ten ÖNCE yüklenir.

**Render:** `renderKanit()` (app.js) tek seferde DOMContentLoaded'da çalışır — hiçbir
alt fonksiyonu `updateAll()`'a bağlı değildir, sidebar/parametre değişikliği bu
sekmeyi ETKİLEMEZ (bilinçli, çünkü veri zaten sabit/geçmiş). Alt fonksiyonlar:
- `renderKanitKpis()` — 3 KPI kartı (Doğruluk %89, Lead-Time −2 Ay, Test Kapsamı).
- `renderKanitLeadLag()` — lag −3..+3 bar grafik, saf CSS flexbox (canvas YOK); her
  kolon üstte pozitif bölge (sıfır çizgisinden yukarı büyür), altta ince negatif bölge
  (sıfır çizgisinden aşağı büyür); en güçlü lag (`KANIT.ozet.lead_lag_en_guclu`) yeşil
  vurgulu.
- `heatDiverge(v)` + `renderKanitHeatmap()` — ÜH2×ay ısı haritası; `isToptanOutlierUh2()`
  (Bölüm 13.4'teki AYNI fonksiyon, tekrar yazılmadı) ile outlier ÜH2'ler elenir, değerler
  0,5–2,0'a kırpılır, renk 1,0 pivotlu diverging skala (yeşil→amber→kırmızı, `heat()`
  ana tablodaki gibi iki-renk lineer interpolasyon, burada iki bacaklı).
- `renderKanitYillikRasyo()` — `KANIT.yillik_rasyo` yatay bar liste, 1,0 referans çizgili.
- `renderKanitMevsim()` — `KANIT.mevsim`, mevcut `.action-row`/`.action-card` kabuğu
  (önceden kullanılmayan, dead CSS idi) yeniden kullanılarak 4 kart.
- `renderKanitFootnote()` — sabit dipnot metni.

**KISIT (bilinçli):** Bu sekme SADECE görsel/kanıt — bütçe hesaplarına (computeFromData,
computeToptanFromSaved) dokunmaz, hiçbir kullanıcı girdisi almaz.

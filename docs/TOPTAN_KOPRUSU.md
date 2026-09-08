# Toptan (Sell-in) Bütçe — Detaylı Referans

> ## ⚠ DURUM: ENVANTER KÖPRÜSÜ KALDIRILDI (2026-09-07)
>
> Bu dosyanın **13.1 – 13.8** bölümleri artık **TARİHSEL KAYITTIR**, uygulanan
> davranış DEĞİLDİR. Envanter köprüsü (`Perakende Bütçe + (Hedef Bayi Stok −
> Mevcut Bayi Stok)`) kod tabanından tamamen çıkarıldı.
>
> **Neden kaldırıldı (kullanıcı kararı):** Köprü **yanlış bir zaman ekseni**
> üzerine kuruluydu. `Mevcut Bayi Stok` seçili Baz Periyot'un (LY) gerçek stok
> fotoğrafıydı; `Hedef Bayi Stok` ise gelecek yıl (TY) bütçesinden türetiliyordu.
> İkisinin farkı "bayinin deposunu hedefe getirmek için gereken sevk" gibi
> okunuyordu ama aslında iki farklı yılın büyüklüklerini çıkarıyordu.
> **Düzeltmenin yolu yok: eksik olan veri gelecekte, geçmişte değil** — bayinin
> TY başındaki gerçek stok seviyesi bilinmiyor ve geçmiş veriden türetilemez.
>
> **Yürürlükteki yöntem → bkz. 13.10.** Tek formül:
> `Toptan Bütçe = Perakende Satış Adet Bütçe × Dönüşüm Çarpanı(ay)`
>
> Dosya adı geriye dönük uyumluluk için (`TOPTAN_KOPRUSU.md`) korundu;
> CLAUDE.md ve kod yorumları bu ada referans veriyor.

> Bu dosya SADECE "Toptan Bütçe" veya "Perakende → Toptan (Metodoloji)" sekmelerine
> dokunurken okunur. CLAUDE.md'nin ana gövdesi bu detayları GEREKTİRMEZ.

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

### 13.5 Ekran Formülü — TARİHSEL (artık uygulanmıyor)
> Aşağıdaki formül 2026-09-07'de kaldırıldı. Yürürlükteki formül için **13.10**'a bak.
```
Toptan Bütçe(ÜH4, ay) = Perakende Bütçe + (Hedef Bayi Stok − Mevcut Bayi Stok)
  Hedef Bayi Stok = Hedef Cover × (aylık Perakende Bütçe)     [TY büyüklüğü]
  Mevcut Bayi Stok = seçili Baz Periyot'un GERÇEK stok_adet'i [LY büyüklüğü]  ← ZAMAN EKSENİ ÇAKIŞMASI
```

### 13.6 Veri/Dosya Notları
- `assets/toptan_katsayi.js`: `const TOPTAN_KATSAYI = { "ÜH2": { "1":kat, ... "12":kat } }`
  **(BU DOSYA 2026-09-07 İTİBARIYLA PROJEDE YOK — kaldırıldı, bkz. 13.9.)**
  (index.html'de app.js'ten ÖNCE yüklenir).
- Katsayılar Colab analizinden üretildi (historical Perakende-Toptan.xlsx).
- Envanter kimliği için ekstra veri gerekmez; mevcut stok_adet + hedef cover yeter.
- **ESKİ SINIRLAMA ORTADAN KALKTI (ay-bazlı veri geçişi):** `Mevcut Bayi Stok` eskiden
  13 ayın ORTALAMASI olan bir `stok_adet` idi — yani gerçek bir "şu an depoda ne var"
  fotoğrafı DEĞİLDİ ve köprünün stok düzeltme bacağı (`Hedef − Mevcut`) bulanık kalıyordu.
  Artık `realdata.js` ay bazlı: `Mevcut Bayi Stok`, kullanıcının seçtiği **Baz Periyot'un
  GERÇEK ay stok_adet'idir** (bkz. CLAUDE.md 3.1). "Tam Yıl" seçilirse **EN SON ayın**
  stoğu kullanılır — stok bir AN fotoğrafı olduğu için aylar boyunca ortalanmaz. Sonuç:
  envanter köprüsü artık gerçek bir stok seviyesiyle çalışıyor; bu bacak için "veri
  temsili/ortalama" uyarısı YAZMA.

### 13.7 Son Kullanıcıya Anlatım İlkesi (ÖNEMLİ)
Ekranda toptan mantığı MUTLAKA sade Türkçe ile açıklanmalı. Bu anlatım artık
**"Toptan Bütçe Tablosu" başlığındaki `(i)` ikonuyla açılan modal'dadır**
(`#toptanInfoBtn` → `#toptanModal`; eskiden tablonun üstünde açık duran bir accordion
paneldi, bkz. CLAUDE.md Bölüm 7.0). Son kullanıcı formülün ARDINDAKİ MANTIĞI anlamalı:
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

### 13.9 "Perakende → Toptan (Metodoloji)" Sekmesi — SAF STATİK AÇIKLAMA

`data-tab="rasyo"` (id geriye dönük uyumluluk için değişmedi). Sekme **tamamen
statik HTML**tir: `index.html` içinde tek bir `<section class="metodoloji">`.
**JS ile render EDİLMEZ**, veri dosyası YOKTUR, hiçbir hesaba dokunmaz.
Kaynak metin: `docs/metodoloji_ekran.html` (oradaki geçici `<style>` bloğu
projeye taşınırken `:root` token'larına çevrildi, ham renk/piksel bırakılmadı).

İçerik: (1) yıllık toptan = perakende, (2) 12 aylık pay/çarpan tablosu,
(3) formül + örnek, (4) sapma tablosu ±%10 / ±%25 / ±%37, (5) stok politikası,
(6) açılır "Metodoloji ve veri kaynağı" bloğu.

**ESKİ "KANIT" İNFOGRAFİK VİTRİNİ KALDIRILDI (2026-09-07) — GERİ EKLEME.**
Kaldırılan: `assets/kanit.js` (`KANIT`), `assets/toptan_katsayi.js`
(`TOPTAN_KATSAYI`), `renderKanitKpis/LeadLag/Heatmap/YillikRasyo/Mevsim/Footnote`,
`renderKanit`, `heatDiverge`, `isToptanOutlierUh2`, tüm `.kanit-*` CSS blokları
ve iki `<script>` etiketi. **Gerekçe — bu ekranla DOĞRUDAN ÇELİŞİYORDU:**

| Eski vitrin | Yürürlükteki metodoloji |
|---|---|
| KPI "Doğruluk %89" (`KANIT.ozet.korelasyon = 0.894`) | Bu, **envanter köprüsünün** kimlik testiydi; köprü kaldırıldı (bkz. üstteki DURUM bloğu) |
| KPI "Lead-Time −2 Ay" + lead/lag grafiği + dipnot | *"Neden gecikme terimi yok? Toptan, perakendeyi önden götürmüyor."* |
| Giriş: "Toptan = Perakende + Bayi Stok Değişimi" | `Toptan = Perakende × Çarpan(ay)` |

ÜH2×ay ısı haritası, kategori rasyoları ve mevsim imzaları çelişmiyordu ama
kullanıcı kararıyla onlar da kaldırıldı: sekme tek bir tutarlı anlatı olsun diye.
Geri istenirse **yeniden yazılmalı** — gizli/yorumlanmış kod YOK; dosyalar git
geçmişinde (`ad04b7a` öncesi) duruyor.

**Sonuç — `toptan_katsayi.js` artık projede YOK.** ÜH2×ay katsayı tablosunun son
kullanıcısı bu ısı haritasıydı. Toptan Bütçe hesabı zaten ulusal çarpanı kullanıyor
(13.10); ÜH2 bazlı çarpan **eklenmeyecek** (denendi, ulusal çarpanı geçemedi).

---

### 13.10 YÜRÜRLÜKTEKİ YÖNTEM — Ulusal Aylık Dönüşüm Çarpanı

```
Toptan Bütçe = Perakende Satış Adet Bütçe × Dönüşüm Çarpanı(Hedef Periyot ayı)
Dönüşüm Çarpanı = DONUSUM.CARPAN[ay-1]
```

Çarpanlar `assets/donusum.js` içinde SABİTtir (2021-2025 bayi kanalı verisi,
`F(ay) = K × ToptanSezonsellik(ay) / PerakendeSezonsellik(ay)`, K = 1,0011).
Ocak 1,405 · Şubat 1,306 · Mart 1,204 · Temmuz 0,801 · Aralık 0,734.
Yıllık olarak toptan ≈ perakende; farklı olan aylık FAZdır (bayi sezon öncesi
yüklenir, sezon sonunda stoktan satar).

**Ürün grubu / bölge bazında ayrı çarpan YOKTUR.** ÜH2 bazlı çarpan denendi ve
ulusal çarpanı geçemedi (docs/donusum-spec.md §2). `assets/toptan_katsayi.js`
(`TOPTAN_KATSAYI`, ÜH2×ay) projeden TAMAMEN KALDIRILDI — tek kullanıcısı olan
Kanıt ısı haritası da kaldırıldı (bkz. 13.9). Geri ekleme.

#### Tablo — 11 kolon, tamamı salt okunur ve türetilmiş

| # | Kolon | Kaynak |
|---|---|---|
| 1-6 | Satış Teşkilatı · Şube/Bölge · ÜH1 · ÜH2 · ÜH3 · ÜH4 | perakende kaydından |
| 7-8 | Baz Periyot (LY) · Hedef Periyot (TY) | perakende kaydından |
| 9 | Perakende Bütçe | perakende kaydından (`salesBudget`) |
| 10 | Dönüşüm Çarpanı | `donusum.js`, 3 ondalık; tooltip = `ACIKLAMA`; >1,10 yeşil tint, <0,90 kırmızı tint |
| 11 | Toptan Bütçe | 9 × 10, tam sayı, `.toptan-highlight` |

Toptan ekranında **hiçbir hücre elle düzenlenmez** (doğrulandı: tabloda 0 adet
input/select/contenteditable). Tek girdi alanı tablonun ÜSTÜNDEki Bayi Stok
Politikası'dır.

**TOPLAM satırının çarpanı** satır çarpanlarının düz ortalaması DEĞİL,
`T.toptanButce / T.salesBudget` (gerçekleşen oran) — ay karışımını doğru yansıtır.

#### Bayi Stok Politikası — KALDIRILDI

Bir dönem Toptan sekmesinin üstünde `#t_stokpolitikasi` adlı bir `.numfield`
vardı (varsayılan 0, aralık −30..30) ve değeri `/100` ile **çarpana doğrudan
ekleniyordu**. Alan, `readToptanStokPolitikasi()`, `input` dinleyicisi,
`.params.toptan-params` CSS kuralı ve ekrandaki açıklama metinleri **tamamen
silindi** (kullanıcı kararı).

`donusum.js` API'si DEĞİŞMEDİ: `toptanButce(adet, periyot, stokPolitikasi = 0)`
üçüncü parametreyi hâlâ kabul eder. Ama `donusumSatir()` onu **hiç geçmez**,
yani varsayılan 0 devreye girer. Geri istenirse tek yapılacak, alanı ekleyip
değerini `donusumSatir` üzerinden bu parametreye taşımaktır.

**Sonuç:** çarpanlar bayi stok seviyesinin sabit kalacağını varsayar. Şirket
"seneye %10 daha az stokla çalışacağız" derse ekranda bunu söyleyecek bir alan
YOKTUR; sonucun ayrıca elle düzeltilmesi gerekir (Metodoloji sekmesi 5. bölüm
bunu açıkça yazar).


#### İki tuzak (yaşandı, tekrar etmesin)

1. **"Tam Yıl" / "—" periyodu:** `ayNo()` null döner. Bu durumda yıllık çarpan
   `DONUSUM.K` (1,0011) kullanılır. `CARPAN`'ın DÜZ ortalamasını (1,0294)
   KULLANMA — doğru olan perakende sezonuyla ağırlıklı ortalamadır ve o tam K'dır.
2. **HTML düzenlerken kapsam:** `index.html` içinde `#grid` (ana tablo, 22 kolon)
   `#toptanGrid`'den ÖNCE gelir ve ikisinin `<colgroup>`/`<thead>` girintisi
   AYNIdır. Regex ile kolon düzenlerken önce `<table id="toptanGrid">` … `</table>`
   bölgesini çıkar, sonra onun İÇİNDE değiştir — aksi halde ana tablonun başlığı
   ezilir (bu hata yapıldı; `#grid` 22 `<col>` + 2. satırda 19 `<th>` olmalı).

#### Filtreler
`computeToptanFromSaved()` `buildFlatRows().filter(rowPassesFilters)` kullanır —
**Perakende Bütçe sekmesindeki kolon filtreleri Toptan'a da uygulanır**, iki tablo
TEK filtre durumunu (`savedMixFilterState`) paylaşır. Tazeleme
`renderSavedMixRows()` içinden tetiklenir (filtre değişikliklerinin tek hunisi).

#### Boş durum — İKİ FARKLI mesaj
- Hiç kayıt yok → *"Önce Perakende Bütçe ekranından bütçe çalışın. Toptan bütçesi
  otomatik türetilir."*
- Kayıt var ama filtre hepsini eledi → *"...filtreler bu tabloya da uygulanıyor ve
  hiçbir satır kalmadı. Filtreleri gevşetin."*
  İkisini TEK mesaja indirgeme; "kayıt yok" derken aslında filtrelenmiş olmak yanıltır.

#### Kaldırılan kod (geri eklenecekse tamamen yeniden yazılmalı)
`computeToptanYakinsama`, `renderToptanConvergence`, `toptanDurumBadge`,
`toptanImaBadge`, `TOPTAN_IMA_ESIK`, `isToptanOutlierUh2`, `toptanKatsayiRaw`,
`getToptanKatsayi`, `monthFromPeriodLabel`, `TR_MONTH_NUM`; CSS'te
`.toptan-convergence*` ve `#toptanGrid th.tgrp-referans`. Hiçbiri gizli/yorumlu
DEĞİL — silindiler.

---

### 13.11 Planlama Parametreleri (Toptan) + Toptan Düzeltmeleri

İki katman var ve **karıştırılmamalı**: paneldeki CANLI değerler geçici bir
ÖNİZLEMEdir; "Revize Et" ile kaydedilen **Toptan Düzeltmeleri** kalıcıdır.

```
Toptan = Perakende × [DönüşümÇarpanı(ay) + StokPolitikası%] × Π(1 + Paro/Bundle/ÖzelGün/Gam/Kota %)
```

#### Toptan Bütçe sekmesinde parametre kartı YOKTUR
Bir dönem orada "Planlama Parametreleri (Toptan)" kartı (`t_m_*`) vardı ve canlı
önizleme yapıyordu; **kaldırıldı**. Onunla birlikte `readToptanPanelParams()`,
`syncToptanPanelFromFixes()`, `#toptanRevizeNote`, `#t_mult_total` ve parametre
input dinleyicileri de silindi. `TOPTAN_CAMP` artık DOM'a bağlı değildir, yalnızca
`{key,label}` taşır (rozet tooltip'i, düzeltme listesi ve çarpan hesabı için).

Sonuç: **Toptan Bütçe sekmesi hiçbir kullanıcı girdisi almaz.** Her satır ya kayıtlı
düzeltmesiyle ya da SAF formülle hesaplanır — `computeToptanFromSaved()`'in
varsayılan `canliParams`'ı artık `bosToptanParams()` (hepsi %0).

#### Store: `toptanDuzeltmeleri` (`localStorage["arpaz_toptan_duzeltmeleri"]`)
Kayıtlı mix set'leriyle aynı desen (JSON dizi). Kayıt şeması:
```js
{ dims: { org, region, uh1, uh2, uh3, uh4, baseperiod, targetperiod },
  params: { paro, bundle, event, gam, kota, stokPolitikasi },
  savedAt }
```
Kimlik anahtarı `toptanFixKey(dims)` — 8 alanın `␟` ile birleşimi.
`buildFlatRows()` çıktısı org'u `salesOrg`, ÜH4'ü `name` taşıdığı için kimlik
**TEK yerde** (`toptanRowDims()`) kurulur; tablo, "Revize Et" ve düzeltme listesi
aynı anahtarı üretsin diye. Yeni bir dims alanı eklersen `TOPTAN_DIM_ALANLARI`'nı
güncelle — eski kayıtların anahtarı değişir ve eşleşmeyi kaybederler.

#### Yazma yolu: SADECE "Revize Toptan Bütçe" sekmesi (`data-tab="revize"`)
Toptan Bütçe sekmesindeki panel (`t_m_*`) **hiçbir zaman kayıt yazmaz** — yalnızca
canlı önizleme. Store'a yazan TEK yer Revize sekmesidir. (Bir dönem Toptan panelinde
`#toptanRevizeBtn` vardı; kaldırıldı, `initToptanRevize()` de silindi.)

Revize sekmesi:
- **Filtre bloğu** (`r_f_org` … `r_f_target`, 8 dropdown): boş = "hepsi".
  `revizeFiltreleriDoldur()` **kaskad** doldurur — her dropdown'ın seçenekleri
  KENDİNDEN ÖNCEKİ seçimlerle daraltılmış satır kümesinden üretilir (ÜH4, ÜH3'e göre
  daralır). Seçim artık geçerli değilse "Tümü"ye düşer, böylece 0 satır döndüren
  kombinasyon seçilemez.
- **Eşleşen satırlar tablosu** + "N satır eşleşiyor" sayacı. Satırlar **MEVCUT**
  değerleriyle listelenir: kayıtlı düzeltmesi varsa onunla, yoksa **saf formülle**
  (`canliParams: bosToptanParams()`) — Toptan sekmesinin önizleme paneli buraya
  SIZMAZ. Panele değer yazmak bu tabloyu değiştirmez; kaydedene kadar önizleme yok.
- **Parametreler** `r_m_*` + `r_stokpolitikasi` (Bayi Stok Politikası burada VAR;
  Toptan sekmesinden kaldırılmıştı). `t_m_*`'dan tamamen bağımsız.
- **"Revize Et & Kaydet"** (`#revizeKaydetBtn`): eşleşen her satır için kendi tam
  dims kimliğiyle upsert. Altında "N satır güncellenecek"; eşleşen 0 ise buton pasif.
- **Kayıtlı Düzeltmeler** listesi bu sekmenin altındadır (Toptan sekmesinden
  BURAYA TAŞINDI; `#toptanFixList` id'si korundu, `renderToptanFixes()` aynı).

`computeToptanFromSaved(opts)` iki seçenek alır — argümansız çağrı davranışı
DEĞİŞTİRMEZ: `opts.tumSatirlar` Perakende Bütçe kolon filtrelerini atlar,
`opts.canliParams` düzeltmesi olmayan satırlar için kullanılacak parametreleri verir.

#### Render önceliği
Her satır çizilirken kendi dims'ine TAM eşleşen kayıt aranır:
- **Varsa** → o kaydın params'ı kullanılır (canlı panel DEĞİL) + `.badge b-blue`
  **"Revize Edildi"** rozeti; tooltip'te parametreler ve kayıt zamanı.
- **Yoksa** → eski davranış: canlı panel değerleri geçici önizleme, hiçbir yere yazılmaz.

Dönüşüm Çarpanı tooltip'i dört satır: temel çarpan + ay gerekçesi · kampanya/gam-kota
katkısı · toplam çarpan · **kaynak** (kayıtlı düzeltme mi, canlı önizleme mi).

#### Panel yükleme kuralı (`syncToptanPanelFromFixes`)
**Panel, GÖRÜNEN satırların KAYITLI durumunu yansıtır:**
- hepsi aynı düzeltmeyi taşıyor → o değerler yüklenir
- karışık **VEYA hiç kayıt yok** → panel **0'a döner** + "Karışık…" uyarısı

**Sıfırlama şart, kaldırma:** aksi halde bir önceki filtrede yüklenen değer,
düzeltmesi OLMAYAN satırlara canlı önizleme olarak sızar. (Yaşandı: Beko satırı
revize edilip filtre kaldırılınca Arçelik satırı da 1.949 yerine 2.144 görünüyordu;
kayıt silindiğinde de satır 1.018'e dönmüyordu.)

**SADECE** filtre değişiminde, sekme açılışında, init'te ve Revize/Sil sonrasında
çağrılır. Parametre input'una her yazışta çağırma — kullanıcının yazdığını ezer.
Panel değerlerini yazarken `input` olayı YAYILMAZ (sonsuz döngü olur); tablo bir
kez elle tazelenir.

#### Rollup
Ayrı formül YOK — satır sonuçlarını topladığı için düzeltmeler kendiliğinden yansır
(bkz. 13.10 ve `computeToptanRollup`).

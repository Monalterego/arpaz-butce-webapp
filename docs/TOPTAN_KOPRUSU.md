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

> Bu dosya SADECE "Toptan Bütçe" veya "Perakende → Toptan (Kanıt)" sekmelerine
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
  0,5–2,0'a kırpılır, renk 1,0 pivotlu diverging skala (iki-renk lineer interpolasyon,
  iki bacaklı). NOT: ana tablodaki tek-bacaklı `heat()` fonksiyonu silindi;
  `heatDiverge()` ondan bağımsızdır ve YAŞIYOR.
- `renderKanitYillikRasyo()` — `KANIT.yillik_rasyo` yatay bar liste, 1,0 referans çizgili.
- `renderKanitMevsim()` — `KANIT.mevsim`, mevcut `.action-row`/`.action-card` kabuğu
  (önceden kullanılmayan, dead CSS idi) yeniden kullanılarak 4 kart.
- `renderKanitFootnote()` — sabit dipnot metni.

**KISIT (bilinçli):** Bu sekme SADECE görsel/kanıt — bütçe hesaplarına (computeFromData,
computeToptanFromSaved) dokunmaz, hiçbir kullanıcı girdisi almaz.

---

### 13.10 YÜRÜRLÜKTEKİ YÖNTEM — Ulusal Aylık Dönüşüm Çarpanı

```
Toptan Bütçe = Perakende Satış Adet Bütçe × Dönüşüm Çarpanı(Hedef Periyot ayı)
Dönüşüm Çarpanı = DONUSUM.CARPAN[ay-1] + BayiStokPolitikası
```

Çarpanlar `assets/donusum.js` içinde SABİTtir (2021-2025 bayi kanalı verisi,
`F(ay) = K × ToptanSezonsellik(ay) / PerakendeSezonsellik(ay)`, K = 1,0011).
Ocak 1,405 · Şubat 1,306 · Mart 1,204 · Temmuz 0,801 · Aralık 0,734.
Yıllık olarak toptan ≈ perakende; farklı olan aylık FAZdır (bayi sezon öncesi
yüklenir, sezon sonunda stoktan satar).

**Ürün grubu / bölge bazında ayrı çarpan YOKTUR.** ÜH2 bazlı çarpan denendi ve
ulusal çarpanı geçemedi (docs/donusum-spec.md §2). `assets/toptan_katsayi.js`
(`TOPTAN_KATSAYI`, ÜH2×ay) dosyası HÂLÂ YÜKLÜdür ama Toptan Bütçe hesabında
KULLANILMAZ — yalnızca **Metodoloji sekmesindeki ısı haritasını** besler.
Silme, Toptan hesabına da geri bağlama.

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

#### Bayi Stok Politikası % (`#t_stokpolitikasi`)
Toptan sekmesinin üstünde, `.numfield` deseni (−/sayı/%/+), varsayılan **0**,
aralık −30..30. `readToptanStokPolitikasi()` değeri `/100` ile okur ve
`donusumSatir(..., stokPolitikasi)` üzerinden **çarpana doğrudan ekler**.
`input` olayında tablo anında yeniden hesaplanır (`initNumFields()` −/+
butonlarında da `input` YAYDIĞI için tek dinleyici yeter).

- `0` = bayi stok seviyesi sabit kalsın.
- `-10` = bayi stoğu erisin → toptan bütçesi düşer.

**Perakende ekranındaki `Hedef Stok Büyüme %` ile BİRLEŞTİRME.** O, bayinin kendi
stok bütçesini belirler ve oradan perakende satış bütçesi türer; bu ise sell-in ile
sell-out arasındaki farkı ayarlar. Farklı katmanlarda, farklı işler.

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

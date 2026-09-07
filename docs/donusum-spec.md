# Toptan Bütçe Dönüşüm Katmanı — Şartname

Bu doküman `arpaz-butce-webapp` projesine eklenecek **Perakende → Toptan
dönüşüm katmanını** tanımlar. Claude Code bu dosyayı referans alarak
uygulama yapacaktır.

---

## 1. Bağlam

Uygulama şu an **perakende satış adet bütçesi** üretiyor:

```
Plan Stok %   = (Kâr%×wK + Satış%×wS + Stok%×wSt) / (wK+wS+wSt)
Plan Stok Ad  = ToplamStok × (1+HedefStokBüyüme%) × Plan Stok %
Satış Bütçe   = (Plan Stok Ad ÷ Hedef Cover) × PazarlamaBüyüme × Çarpanlar
```

Eklenecek katman bu çıktıyı **toptan satış adet bütçesine** çevirir.
ArPaz bayi teşkilatına toptan satar; toptan bütçesi tedarik planlamasının
girdisidir.

**Kritik nokta:** Bütçe satır bazında (ÜH4 × tek ay) çalışılır.
`Hedef Periyot (TY)` sütunu tek bir ayı gösterir (örn. "2027 Ocak").
Dönüşüm de satır bazında, o ayın çarpanıyla yapılır.

---

## 2. Formül

```
Toptan Satış Adet Bütçe = Perakende Satış Adet Bütçe × Çarpan(ay) + StokPolitikası
```

Çarpanlar `assets/donusum.js` içinde sabittir (2021-2025 verisinden türetilmiş,
ulusal seviye):

| Ay | Çarpan | Ay | Çarpan |
|---|---|---|---|
| Ocak | 1,405 | Temmuz | 0,801 |
| Şubat | 1,306 | Ağustos | 0,938 |
| Mart | 1,204 | Eylül | 1,092 |
| Nisan | 1,049 | Ekim | 0,856 |
| Mayıs | 0,977 | Kasım | 0,974 |
| Haziran | 1,017 | Aralık | 0,734 |

**Ürün grubu bazında ayrı çarpan YOK.** Denendi, ulusal çarpanı geçemedi.
ÜH2 bazlı çarpan eklemeyin.

---

## 3. Yapılacaklar

### Görev 1 — Dönüşüm modülünü bağla
- `assets/donusum.js` dosyasını projeye ekle (hazır, elle düzenleme).
- `index.html`'de `app.js`'ten **önce** yükle.
- `donusum.js` şu API'yi sağlar:
  - `toptanButce(perakendeAdet, hedefPeriyot, stokPolitikasi=0)`
    → `{toptanButce, carpan, ay, aciklama}`
  - `toptanButceTablo(satirlar, stokPolitikasi=0)` → toplu dönüşüm
  - `ayNo(periyot)` → "2027 Ocak" / "2027-01" / 1 → 1..12

### Görev 2 — Toptan Bütçe Tablosunu dönüşümle besle

Toptan Bütçe ekranı **kendi başına bütçe üretmez**. Perakende ekranında
kaydedilmiş bütçe satırlarını okur ve her satıra dönüşümü uygular.
Veri akışı tek yönlüdür:

```
Perakende Bütçe ekranı  →  kaydedilmiş satırlar  →  Toptan Bütçe ekranı
        (kaynak)                                        (türetilmiş)
```

**Toptan Bütçe Tablosu sütunları**

| Sütun | Kaynak |
|---|---|
| Satış Teşkilatı | perakende kaydından |
| Şube / Bölge | perakende kaydından |
| ÜH1 – ÜH4 | perakende kaydından |
| Hedef Periyot (TY) | perakende kaydından |
| Perakende Satış Adet Bütçe | perakende kaydından (referans, salt okunur) |
| **Dönüşüm Çarpanı** | `donusum.js` → `carpan`, 3 ondalık |
| **Toptan Satış Adet Bütçe** | `perakendeAdet × carpan`, tam sayı |

Tüm sütunlar **salt okunur ve türetilmiştir.** Toptan Bütçe ekranında hiçbir
hücre elle düzenlenmez. Perakende tarafında bir kayıt değişir veya silinirse
Toptan tablosu da güncellenmelidir.

Çarpan hücresinde tooltip olarak `donusum.js`'ten gelen `aciklama` metni
gösterilir. Görsel ipucu: çarpan > 1,10 yeşilimsi, < 0,90 kırmızımsı arka plan.
Kullanıcı Aralık'ta 0,734 gördüğünde sebebini tooltip'ten okuyabilmeli.

**Boş durum.** Henüz perakende bütçe kaydı yoksa tablo yerine yönlendirme
göster: *"Önce Perakende Bütçe ekranından bütçe çalışın. Toptan bütçesi
otomatik türetilir."*

**Filtreler.** Perakende ekranındaki kaskad seçim (ÜH1→ÜH2→ÜH3) ve varsa
bölge/periyot filtreleri Toptan ekranında da çalışmalı.

### Görev 3 — Stok politikası alanı
**Toptan Bütçe ekranının** üst paneline **Bayi Stok Politikası %** alanı ekle
(perakende ekranına değil). Varsayılan `0`.

- Anlamı: bayi stoğunun hedeflenen değişimi, perakende bütçesinin yüzdesi.
- `0` = bayi stok seviyesi sabit kalsın.
- `-10` = bayi stoğu erisin → toptan bütçesi ek olarak düşer.
- `toptanButce(..., stokPolitikasi)` parametresine `deger/100` olarak geçilir.
- Değiştirildiğinde tablo anında yeniden hesaplanmalı.

Alanın yanına kısa açıklama: *"Bayi stok seviyesini değiştirmek istiyorsanız
kullanın. Perakende ekranındaki Hedef Stok Büyüme'den bağımsız bir karardır."*

Bu iki alanın **birleştirilmemesi** önemlidir. Perakende tarafındaki
`Hedef Stok Büyüme%` bayinin kendi stok bütçesini belirler ve oradan perakende
satış bütçesi türer. Buradaki stok politikası ise sell-in ile sell-out
arasındaki farkı ayarlar. Farklı katmanlarda, farklı işler.

### Görev 4 — Özet paneli
Toptan Bütçe ekranının üstünde özet kartları:

- Toplam perakende bütçe adedi (referans)
- Toplam toptan bütçe adedi
- Ortalama dönüşüm oranı (toptan ÷ perakende)
- Seçili periyot(lar)

Kullanıcı ay seçimine göre oranın nasıl değiştiğini burada görür. Ocak seçiliyse
~1,40; Aralık seçiliyse ~0,73 çıkmalı.

### Görev 5 — Metodoloji ekranı
`metodoloji_ekran.html` içeriğini **Perakende → Toptan (Metodoloji)**
sekmesine yerleştir. Stiller projenin `styles.css`'ine uyarlanmalı;
dosyadaki `<style>` bloğu geçicidir.

### Görev 6 — Dışa aktarım
Mevcut export'a iki yeni sütun dahil edilmeli.

---

## 4. Sınırlar ve dikkat edilecekler

**Bölge boyutu.** Çarpanlar ulusal seviyede türetildi; bölge kırılımlı veriyle
test edilmedi. Tüm bölgelere aynı çarpan uygulanır. Bu bir varsayımdır.

**Baz periyot tutarlılığı.** `Baz Periyot (LY)` ile `Hedef Periyot (TY)` aynı ay
olmalı (2026 Ocak → 2027 Ocak). Farklı aylar seçilirse LFL hesabı ve dönüşüm
anlamsızlaşır. **Uyarı göster veya seçimi kısıtla.**

**Doğruluk beklentisi.** ÜH4 × Ay seviyesinde sapma ±%37. Bu indirilemez;
tek bir ürün grubunun tek bir aydaki bayi siparişi değişkendir.
Toplulaştırdıkça iyileşir (Toplam × Ay ±%10). Arayüz bunu gizlememeli.

**Kapsam.** Yalnızca bayi kanalı. Yedek parça, proje/kurumsal, solar ve
pazaryeri kanalları dahil değildir; ayrı bütçelenir.

**Çarpanların güncellenmesi.** Her bütçe döneminde son beş yıllık veriyle
yenilenir. Sadece `donusum.js` içindeki `CARPAN` ve `K` değişir, kod değişmez.

---

## 5. Kabul kriterleri

- [ ] 2027 Ocak, perakende 1.387 → toptan **1.949**
- [ ] 2027 Aralık, perakende 1.387 → toptan **1.018**
- [ ] Perakende ekranında kayıt eklenince Toptan tablosunda satır beliriyor
- [ ] Perakende kaydı silinince Toptan tablosundan da kalkıyor
- [ ] Toptan tablosunda hiçbir hücre elle düzenlenemiyor
- [ ] Stok politikası `-10` girilince toptan bütçesi düşüyor
- [ ] Kayıt yokken boş durum mesajı görünüyor
- [ ] Özet panelinde ortalama oran, seçili aya göre değişiyor
- [ ] Baz ve hedef periyot ayları farklıysa uyarı çıkıyor
- [ ] Export dönüşüm çarpanı ve toptan bütçe sütunlarını içeriyor
- [ ] Metodoloji sekmesi projenin stiline uygun görünüyor
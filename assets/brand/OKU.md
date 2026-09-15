# planAR — marka dosyaları

Bu klasör uygulamanın logo/ikon varlıklarını tutar. `index.html` buradaki
dosyalara **göreli** yolla bağlanır (`assets/brand/...`) — mutlak `/...` yolu
KULLANMA, index.html'e çift tıklayarak (`file://`) açıldığında kırılır.

## Klasördeki dosyalar
| Dosya | Nerede kullanılıyor |
|---|---|
| `planar-favicon.svg` | index.html head — `rel="icon"` (32 px tabanlı) |
| `planar-favicon-16.svg` | index.html head — `rel="icon" sizes="16x16"` |
| `planar-wordmark-dark.svg` | **header `<h1>`** — koyu zemin varyantı |
| `planar-wordmark.svg` | açık zemin kilidi; ekranda KULLANILMIYOR (doküman/sunum için) |

**Header neden koyu varyant:** `header` lacivert gradyan (`--navy` → `--navy2`).
Açık varyantın `plan` yazısı `#13315c`, yani bu zeminde neredeyse görünmez.
Yeni bir yere logo koyarken zemine göre varyant seç.

## Henüz EKLENMEDİ (gelince bu klasöre koy + head'deki satırı aç)
- `planar-icon-16 / 32 / 64 / 192 / 512 .png` — raster kademeler (192 ve 512 PWA
  manifest için). `index.html` head'inde `<link>` satırları YORUMDA hazır bekliyor.
- `planar-wordmark-mono.svg` — tek renk (#201e1d), alt çizgisiz
- `planar-wordmark.png` — 1488x460, açık zemin

## Notlar
- **`planar-wordmark-dark.svg` TÜRETİLMİŞTİR.** Asıl dosya elime geçmediği için
  açık varyantın renk takasıyla üretildi (lacivert → beyaz, `#cc1526` → `#ff4a30`);
  geometri birebir aynı. Claude Design'daki ASIL dosya gelince ÜZERİNE YAZ.
- **C2PA metadata'sı çıkarıldı.** Orijinal SVG'lerde ~21 KB'lık base64 bir
  `<metadata><c2pa:manifest>` bloğu vardı; favicon her sayfa yüklemesinde
  istendiği için temizlendi. Çizim birebir aynı, görsel fark yok.
- **Wordmark'ın viewBox'ında boşluk var:** ink y≈20–90 arasında, viewBox 115
  yüksekliğinde — yani kutunun yalnızca ~%61'i dolu. Bu yüzden header'da
  `height:30px` veriliyor ama harfler ~18px görünür (eski 17px başlık metniyle
  denk). Logoyu büyütmek istersen bu boşluğu hesaba kat.
- SVG'lerde yazı `<text>` olarak duruyor; Archivo yüklü değilse sistem
  sans-serif'e düşer (harf genişlikleri değişir, alt çizgi barları metinle
  tam hizalanmayabilir). Kurumsal fontla kesinleştirilecekse yazıyı outline'a
  çevir (Illustrator: Type > Create Outlines).
- Renkler: lacivert #0b2545 / #13315c, veri mavisi #0077b6, Arçelik kırmızısı
  #cc1526 (koyu zeminde #ff4a30). Lacivert ve #0077b6 zaten `styles.css`
  içindeki `--navy` / `--accent` token'larıyla aynı — yeni renk token'ı EKLEME
  (bkz. CLAUDE.md Bölüm 9).

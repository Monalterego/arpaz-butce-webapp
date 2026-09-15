# planAR — marka dosyaları

Bu klasör uygulamanın logo/ikon varlıklarını tutar. `index.html` buradaki
dosyalara **göreli** yolla bağlanır (`assets/brand/...`) — Claude Design'ın
verdiği mutlak `/planar-favicon.svg` yolunu KULLANMA: index.html'e çift
tıklayarak (`file://`) açıldığında kırılır, Live Server'da çalışıp masaüstünde
çalışmayan bir ekran çıkar.

## Ekranda KULLANILAN dosyalar
| Dosya | Nerede |
|---|---|
| `planar-favicon.svg` | head — `rel="icon"` (ana favicon, 32 px tabanlı) |
| `planar-favicon-16.svg` | head — `rel="icon" sizes="16x16"` |
| `planar-icon-16/32/64.png` | head — SVG desteklemeyen tarayıcılar için raster yedek |
| `planar-icon-192.png` | head — `apple-touch-icon` |
| `planar-wordmark-dark.svg` | **header `<h1>`** (`styles.css` satır 39-43) |

**Header neden KOYU varyant:** `header` lacivert gradyan (`--navy` → `--navy2`).
Açık varyantın `plan` yazısı `#13315c`, bu zeminde neredeyse görünmez. Yeni bir
yere logo koyarken zemine göre varyant seç.

## Ekranda kullanılmayan (doküman/sunum için duruyor)
- `planar-wordmark.svg` — açık zemin kilidi (beyaz sayfa, Word/PowerPoint)
- `planar-wordmark-mono.svg` — tek renk `#201e1d`, alt çizgisiz (faks/damga/tek renk baskı)
- `planar-wordmark.png` — 1488x460 raster, açık zemin
- `planar-icon-512.png` — PWA manifest kademesi. **Manifest dosyası HENÜZ YOK**;
  uygulama "ana ekrana ekle" ile kurulabilir yapılacaksa `manifest.webmanifest`
  yazılıp 192+512 oraya bağlanmalı.

## Notlar
- **C2PA metadata'sı çıkarıldı.** Her SVG'nin içinde ~8 KB'lık base64 bir
  `<metadata><c2pa:manifest>` bloğu vardı (dosyaların %95'i); favicon her sayfa
  yüklemesinde istendiği için temizlendi, 8 KB → ~0,4 KB. Çizim birebir aynı.
  **Dosyaları Claude Design'dan yeniden indirirsen metadata geri gelir** — aynı
  temizliği tekrarla.
- **Wordmark'ın viewBox'ında boşluk var:** çizim y≈20–90 arasında ama viewBox
  115 yüksekliğinde, yani kutunun ~%61'i dolu (`planar-wordmark-mono.svg` bunun
  istisnası: viewBox 90, alt çizgisi de yok). Bu yüzden header'da `height:30px`
  veriliyor ama harfler ~18px görünüyor. Logoyu büyütmek istersen bu boşluğu
  hesaba kat.
- SVG'lerde yazı `<text>` olarak duruyor; **Archivo yüklü değilse** sistem
  sans-serif'e düşer — harf genişlikleri değişir ve alt çizgi barları (x=0-167
  lacivert / 167-260 kırmızı) metnin `plan|AR` sınırıyla tam hizalanmayabilir.
  Kurumsal fontla kesinleştirilecekse yazıyı outline'a çevir (Illustrator:
  Type > Create Outlines).
- Renkler: lacivert `#0b2545` / `#13315c`, veri mavisi `#0077b6`, Arçelik
  kırmızısı `#cc1526` (koyu zeminde `#ff4a30`), koyu zemin `plan` tonu `#9fc3e0`.
  Lacivert ve `#0077b6` zaten `styles.css`'teki `--navy` / `--accent`
  token'larıyla aynı — yeni renk token'ı EKLEME (bkz. CLAUDE.md Bölüm 9).

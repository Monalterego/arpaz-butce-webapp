# "Perakende Bütçe" Sekmesi — Rollup Paneli Detaylı Referans

> Bu dosya SADECE Rollup/Özet paneline dokunurken okunur. CLAUDE.md'nin ana
> gövdesi bu detayları GEREKTİRMEZ.

---

## 14) "Perakende Bütçe" Sekmesi — Özet / Rollup Paneli

### 14.1 Amaç
Kullanıcı bütçeyi ÜH4'te çalışıyor; bu panel üst kırılımda (ÜH1→ÜH2→ÜH3) "bütçe LY'ye
göre nereden nereye geldi?" sorusunu cevaplar. "Perakende Bütçe" (data-pane="kayitlar")
sekmesinde, "Çalışılmış Bütçe ve Stok Karışım" (Kayıtlar) panelinin ÜSTÜNDE yer alır.

### 14.2 Mimari — YENİDEN FORMÜL YOK, mevcut computeFromData'yı ÇOKLU ÇAĞIRIR
Rollup, bütçe formülünü ASLA yeniden yazmaz. Bunun yerine:
1. `rollupLeafTriples(level)` — HIERARCHY ağacında kırılım seviyesine göre taranacak
   tüm "yaprak" (uh1,uh2,uh3) üçlülerini + hangi rollup grubuna (groupKey) ait
   olduklarını çıkarır. `level="uh1"` TÜM hiyerarşiyi tarar (global, 7 ÜH1); `"uh2"`
   sidebar'ın mevcut `state.sel.uh1`'i altını tarar; `"uh3"` `state.sel.uh1/uh2`
   altını tarar. **data.js'e HİÇ dokunulmadı** — `DataService.loadMixFor({uh1,uh2,uh3},
   "uh4")` zaten TEK bir ÜH3'ün ÜH4 satırlarını döndürüyordu, rollup bunu her yaprak
   için ayrı ayrı çağırır (ana ekranın `buildTable()`'ının yaptığının AYNISI, sadece
   döngüde).
2. `computeRollupLeaf(leaf, params)` — her yaprağın ÜH4 satırlarını **computeFromData**
   ile hesaplar (aynı fonksiyon, ana ekranla BİREBİR). Hedef Cover/TY Fiyat elle-giriş
   override'ları SADECE `state.sel` ile TAM eşleşen (o an sidebar'da GÖRÜNEN) yaprağa
   uygulanır — uygulamada zaten başka hiçbir ÜH3'ün elle-girişleri hafızada tutulmuyor
   (`state.covers`/`state.tyFiyat` her ÜH3 değişiminde sıfırlanıyor, bkz. `rebuild()`),
   bu yüzden diğer yapraklar computeFromData'nın override'sız varsayılanına (LY cover,
   LY fiyat × Fiyat Büyümesi %) döner — bilinçli, mevcut mimariyle tutarlı.
   **DİKKAT:** `computeFromData` Plan Stok% override'ını PARAMETRE olarak almıyor,
   doğrudan dış `state.planPctOverrides`'ı okuyor (satır index'iyle) — başka bir
   yaprak için çağrılırken bu dizi geçici olarak `null`'a çekilip hesap sonrası GERİ
   YÜKLENİR, yoksa mevcut ÜH3'ün override index'leri YANLIŞ yaprağın satırlarına
   uygulanıp sessiz bir hesap hatası yaratırdı (kod incelemesiyle bulundu, düzeltildi).
3. Her yaprağın `model.rows`'u (`r.sales, r.salesBudget, r.stock, r.planStock,
   r.lyFiyat, r.tyRevenue`) hem kendi rollup grubuna (`groupKey`) hem GENEL TOPLAM'a
   toplanır (`rollupAddRow`); grup metrikleri (`rollupFinalize`) bu Σ alanlarından
   LFL/R-LFL/Stok Δ/Cover/Ort.Fiyat Δ formülleriyle türetilir — formüller ana ekrandaki
   TOPLAM satırının (bkz. `updateAll()` `tfoot`) AYNI mantığıyla (ağırlıklı toplam,
   satır bazlı ortalama DEĞİL).

**Doğrulama (iç tutarlılık testiyle kanıtlandı):** ÜH1 görünümünde "BEYAZ EŞYA"
satırının LY/TY toplamı, ÜH2 görünümünün TOPLAM satırıyla BİREBİR eşleşiyor; ÜH2
görünümünde "ASPİRATÖR - DAVLUMBAZ" satırı ÜH3 görünümünün TOPLAM'ıyla eşleşiyor —
rollup'ın iç içe geçmiş kırılımlar arasında matematiksel olarak tutarlı olduğunu
kanıtlar (headless test, bkz. commit).

### 14.3 CANLI mı, DONDURULMUŞ mu? — CANLI (Toptan Bütçe'nin TAM TERSİ)
Bu panel `updateAll()` içinden `renderRollup()` ile çağrılır — global parametre
(Hedef Stok Büyümesi % vb.) VEYA herhangi bir Hedef Cover elle-değişikliği ANINDA
rollup'a yansır (test edildi: bir ÜH4'ün Hedef Cover'ı 16→2 yapılınca SADECE o ÜH4'ün
ait olduğu grup güncellendi, diğer gruplar değişmedi; global Hedef Stok Büyümesi %
-10→80 yapılınca TÜM gruplar güncellendi). Bu, **Bölüm 13.8'deki Toptan Bütçe'nin TAM
TERSİDİR** — Toptan Bütçe kayıtlı/dondurulmuş planları gösterir, bu panel ise CANLI
sonuç/izleme ekranıdır. İkisini birbirine KARIŞTIRMA.

### 14.4 Kırılım Seçici + Bağımsız Periyot Seçici
- `#rollupLevelSeg` — 3 buton (segmented control, mevcut `.segmented` kabuğu), `rollupState.level`
  (varsayılan `"uh2"`) tutuyor; tıklanınca `renderRollup()` yeniden çağrılır.
- `#rollup_baseperiod` / `#rollup_targetperiod` — sidebar'ın `#h_baseperiod`/
  `#h_targetperiod`'undan TAMAMEN BAĞIMSIZ, KENDİ periyot seçicileri (aynı seçenek
  listesi: "2026 Ocak"/"2026 Tam Yıl" ve "2027 Ocak"/"2027 Tam Yıl"). Prototip veri
  TEK dönem içerdiğinden bu seçiciler şu an sayıları DEĞİŞTİRMEZ (sadece `renderRollup()`
  tetiklenir, no-op) — gerçek çok-dönem veri gelince aynı seçici canlı çalışacak
  (bilinçli, görev tanımında istenen davranış).

### 14.5 Görünüm
KPI şeridi (5 kart, mevcut `.kpi`/`.kpis` kabuğu, `.rollup-kpis{grid-template-columns:
repeat(5,1fr)}`): Satış Bütçe (TY)+LFL, R-LFL, Stok Büyümesi, Cover (LY→TY ay), Ort.
Fiyat Değişimi. Tablo (`#rollupTable`, 10 kolon): Grup | LY Satış | TY Bütçe | LFL %
(mini CSS bar ile, `.rollup-lfl-track/.rollup-lfl-fill`) | R-LFL % | Stok Δ% | Cover
LY→TY | LY Ort.Fiyat | TY Ort.Fiyat | Fiyat Δ%. Δ kolonları `rollupDeltaSpan()` ile
▲/▼ ok + yeşil/kırmızı; TOPLAM satırı `tfoot`'ta.

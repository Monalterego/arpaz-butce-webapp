# "Perakende Bütçe" Sekmesi — Rollup Paneli Detaylı Referans

> Bu dosya SADECE Rollup/Özet paneline dokunurken okunur. CLAUDE.md'nin ana
> gövdesi bu detayları GEREKTİRMEZ.

---

## 14) "Perakende Bütçe" Sekmesi — Özet / Rollup Paneli

### 14.1 Amaç
Kullanıcı bütçeyi ÜH4'te çalışıyor; bu panel üst kırılımda (ÜH1→ÜH2→ÜH3) "bütçe LY'ye
göre nereden nereye geldi?" sorusunu cevaplar. "Perakende Bütçe" (data-pane="kayitlar")
sekmesinde, "Çalışılmış Bütçe ve Stok Karışım" (Kayıtlar) panelinin ÜSTÜNDE yer alır.

### 14.2 KAYNAK: "Çalışılmış Bütçe ve Stok Karışım" kayıtları (savedMixSets)
Panel, `loadSavedMixSets()` ile localStorage'taki KAYITLI çalışmaları okur ve kırılım
seviyesine göre gruplar. Kayıt satırları (`set.rows`, bkz. `buildCurrentMixRecord`)
toplama fonksiyonunun beklediği alan adlarını (`sales`, `salesBudget`, `stock`,
`planStock`, `lyFiyat`, `tyRevenue`) ZATEN birebir taşır — bu yüzden `rollupAddRow` /
`rollupFinalize` DEĞİŞMEDEN kullanılır ve bütçe formülü burada YENİDEN YAZILMAZ.

- Gruplama anahtarı: `level="uh1"` → `set.uh1`, `"uh2"` → `set.uh2`, `"uh3"` → `set.uh3`.
- Kırılım seçici SADECE gruplama derinliğini belirler; sidebar seçimine göre kapsam
  DARALTILMAZ — kayıtlı işlerin tamamı özetlenir. (Kaynak artık o anki seçim değil,
  kayıt listesi; sidebar'a göre süzmek kayıtları gizlerdi.)
- Çift sayım YOK: aynı boyut anahtarı (org/bölge/ÜH1/ÜH2/ÜH3/periyot) için "Revize Et"
  kaydı YERİNDE günceller, yeni kayıt EKLEMEZ (bkz. `saveCurrentMixSet`).
- Kayıt yokken tablo "Henüz kayıt yok — ... Kaydet'e bastığında çalışman burada
  özetlenir." mesajını gösterir.

**TARİHÇE (artık geçersiz):** Panel bir dönem CANLI idi — `rollupLeafTriples()` ile
HIERARCHY ağacını tarayıp her yaprak için `computeRollupLeaf()` → `computeFromData`
çağırıyor, sidebar seçimi + parametrelerden ANLIK hesaplıyordu. Kullanıcı kaynağın
Kayıtlar olmasını istediği için bu iki fonksiyon SİLİNDİ. Geri getirilecekse bilinmesi
gereken tuzak: `computeFromData` Plan Stok% override'ını parametre olarak ALMAZ,
doğrudan dış `state.planPctOverrides`'ı okur — başka bir yaprak için çağrılırken bu
dizi geçici olarak `null`'a çekilip hesap sonrası geri yüklenmeliydi, yoksa mevcut
ÜH3'ün override index'leri YANLIŞ yaprağın satırlarına uygulanıyordu.

### 14.3 DONDURULMUŞ — Toptan Bütçe ile AYNI mantık (eskiden CANLI idi)
Panel `updateAll()` içinden ÇAĞRILMAZ. Yenilenme tetikleyicileri Toptan Bütçe ile
AYNI: kayıt eklendiğinde/revize edildiğinde (`saveCurrentMixSet`), kayıt silindiğinde,
"Perakende Bütçe" sekmesi açıldığında (`showTab`) ve ilk yüklemede. Global parametre
veya Hedef Cover oynatmak paneli DEĞİŞTİRMEZ — önce Kaydet/Revize Et gerekir.

Doğrulandı (headless test): kayıt yokken boş mesaj · kaydedince rollup LY Satış =
ana tablo TOPLAM satırı (birebir) · Hedef Stok Büyümesi %-10→60 yapıldığında rollup
DEĞİŞMEDİ · Revize Et sonrası güncellendi ve satır sayısı ARTMADI (çift sayım yok).

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

/* =====================================================================
   UYGULAMA MANTIĞI  (Bütçe kurgusu — LC Waikiki yaklaşımı)
   ---------------------------------------------------------------------
   Plan Stok %  = ( Kâr%×wK + Satış%×wS + Stok%×wSt ) / (wK+wS+wSt)
   Plan Stok Ad = ( ToplamStok × (1+StokBüyüme%) ) × Plan Stok %
   Satış Bütçe  = ( Plan Stok Ad / Hedef Cover ) × PazarFaktör × ÇarpanFaktör
   LFL          = Satış Bütçe / LY Satış − 1
   R-LFL        = (Satış Bütçe/Plan Stok) / (LY Satış/LY Stok) − 1
   Stok Büyüme  = Plan Stok / LY Stok − 1
   ===================================================================== */
(function () {
  "use strict";

  const $ = (id) => document.getElementById(id);
  const fmtN = (n) => Math.round(n).toLocaleString("tr-TR");
  const fmtP = (n) => (n * 100).toFixed(1).replace(".", ",") + "%";
  const fmtP0 = (n) => Math.round(n * 100) + "%";
  const fmtX = (n) => n.toFixed(2).replace(".", ",") + "x";
  const fmtD = (n) => n.toFixed(1).replace(".", ",");
  const fmtD2 = (n) => n.toFixed(2).replace(".", ",");
  const fmtD3 = (n) => n.toFixed(3).replace(".", ",");

  const CAMP = ["paro", "bundle", "event", "gam", "kota"];
  const OLU_STOK_CARPANI = 3; // sabit: grup medyanının 3 katı (kullanıcı ayarlamıyor)
  const state = { covers: null, tyFiyat: null, sel: null, level: "uh4", planPctOverrides: null };  // seçim + Hedef Cover + TY Fiyat + manuel plan stok % override

  // --- Hiyerarşi kaskad seçimleri ---
  function fillSelect(el, items, placeholder) {
    el.innerHTML = (placeholder ? `<option value="">${placeholder}</option>` : "") +
      items.map((i) => `<option value="${i.replace(/"/g, "&quot;")}">${i}</option>`).join("");
  }
  // Sidebar select'leri (h_org/h_region/h_uh1/h_uh2/h_uh3) uzun seçenek metinlerinde
  // (ör. "ASPIRATÖR - DAVLUMBAZ") taşabiliyordu. Tablo başlıklarında kullanılan Canvas
  // measureText yöntemiyle (026c436) aynı mantık: seçili option'ın GERÇEK genişliğini
  // ölç, sığmıyorsa font-size'ı 12px'ten 8px'e kadar 1px adımlarla küçült. En uzun
  // ÜH2/ÜH3 adları (34-41 karakter) 8px'te bile sığmayabilir — bu bir sınır, bug
  // değil; CSS ellipsis güvenlik ağı + title tooltip'i devreye girer (zorlama yok).
  const SELECT_FONT_MAX = 12;
  const SELECT_FONT_MIN = 8;
  const SELECT_ARROW_RESERVE = 22; // native dropdown ok ikonu için pay (padding'e dahil değil)
  let _measureCanvas = null;
  function measureTextWidth(text, font) {
    if (!_measureCanvas) _measureCanvas = document.createElement("canvas");
    const ctx = _measureCanvas.getContext("2d");
    ctx.font = font;
    return ctx.measureText(text).width;
  }
  function autoFitSelectFont(el) {
    if (!el) return;
    const opt = el.options[el.selectedIndex];
    const text = opt ? opt.textContent : "";
    el.style.fontSize = "";
    el.title = text; // taban boyutta bile sığmayan uzun ÜH2/ÜH3 adları için tam metin tooltip'i
    if (!text) return;
    const cs = getComputedStyle(el);
    const available = el.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight) - SELECT_ARROW_RESERVE;
    let size = SELECT_FONT_MAX;
    if (available > 0) {
      while (size > SELECT_FONT_MIN && measureTextWidth(text, `${cs.fontWeight} ${size}px ${cs.fontFamily}`) > available) {
        size -= 1;
      }
    }
    if (size < SELECT_FONT_MAX) el.style.fontSize = size + "px";
  }
  // KASITLI SABİT "uh4": state.sel.uh3 → state.level ? "uh3" : "uh4" mantığı doğru
  // GÖRÜNSE de burada UYGULANMAMALI. Sebep: refreshUh3() artık "Tümü (ÜH3)"
  // placeholder'ı üretmiyor (bkz. 445fa36) — h_uh3.value HİÇBİR ZAMAN boş olamıyor,
  // bu yüzden o koşul her zaman "uh3"e düşer ve DataService.loadMixFor ÜH4 detay
  // satırlarını TEK bir ÜH3 toplam satırına indirger (tablo her seçimde 1 satıra
  // düşer — test edildi, doğrulandı). Ayrıca eski "uh3 drill-down" (ana satır +
  // gizli ÜH4 child satırlar, expander ▶/▼) UI'ı da başka bir refactor'da tamamen
  // kaldırıldı; buildTable() artık tek dallı, düz liste üretiyor. "Tümü (ÜH3)"
  // placeholder'ı geri getirilmeden bu koşulu değiştirme.
  function syncLevel() {
    state.level = "uh4";
  }
  function initHierarchy() {
    state.sel = DataService.firstSelection();
    syncLevel();

    // --- Teşkilat select'lerini doldur (DataService.orgs / regions)
    if (document.getElementById('h_org')) {
      fillSelect($("h_org"), DataService.orgs());
      $("h_org").value = DataService.orgs()[0] || "";
      autoFitSelectFont($("h_org"));
      DataService.setOrg($("h_org").value);
      $("h_org").addEventListener("change", () => { DataService.setOrg($("h_org").value); autoFitSelectFont($("h_org")); rebuild(); });
    }
    if (document.getElementById('h_region')) {
      fillSelect($("h_region"), DataService.regions());
      $("h_region").value = DataService.regions()[0] || "";
      autoFitSelectFont($("h_region"));
      DataService.setRegion($("h_region").value);
      $("h_region").addEventListener("change", () => { DataService.setRegion($("h_region").value); autoFitSelectFont($("h_region")); rebuild(); });
    }

    // --- Periyot select'leri (DataService.availablePeriods) ---------------------
    // Baz Periyot GERÇEK bir filtredir: DataService.setPeriod() ile veri katmanını
    // süzer (bkz. data.js _periodMetrics). Hedef Periyot hâlâ SADECE BİR ETİKETtir —
    // gerçek gelecek verisi yoktur; kayıt anahtarına ve Toptan'ın ay katsayısına
    // (donusum.js ayNo()) girdiği için seçenekleri baz listeden +1 yıl kaydırılır.
    const AY_ADI = { "01": "Ocak", "02": "Şubat", "03": "Mart", "04": "Nisan", "05": "Mayıs", "06": "Haziran",
      "07": "Temmuz", "08": "Ağustos", "09": "Eylül", "10": "Ekim", "11": "Kasım", "12": "Aralık" };
    const periods = DataService.availablePeriods(); // ["2026-01",...,"2026-08"]
    const etiket = (p, yilFark) => { const [y, m] = p.split("-"); return `${Number(y) + (yilFark || 0)} ${AY_ADI[m]}`; };
    const sonYil = periods.length ? Number(periods[periods.length - 1].split("-")[0]) : new Date().getFullYear();

    if (document.getElementById('h_baseperiod') && periods.length) {
      const labels = periods.map((p) => etiket(p, 0)).concat([`${sonYil} Tam Yıl`]);
      fillSelect($("h_baseperiod"), labels);
      // VARSAYILAN: EN SON (güncel) ay — periods[0] DEĞİL, periods[son].
      $("h_baseperiod").value = labels[periods.length - 1];
      autoFitSelectFont($("h_baseperiod"));
      DataService.setPeriod(periods[periods.length - 1]);
      $("h_baseperiod").addEventListener("change", () => {
        const idx = labels.indexOf($("h_baseperiod").value);
        DataService.setPeriod(idx === periods.length ? "TUM_YIL" : periods[idx]);
        autoFitSelectFont($("h_baseperiod"));
        rebuild();
      });
    }
    if (document.getElementById('h_targetperiod') && periods.length) {
      // Baz listesinin +1 yıl kaydırılmışı. FONKSİYONEL DEĞİŞİKLİK YOK: değeri
      // saveCurrentMixSet()/Kayıtlar/Toptan aynı şekilde metin olarak okumaya devam eder.
      const tLabels = periods.map((p) => etiket(p, 1)).concat([`${sonYil + 1} Tam Yıl`]);
      fillSelect($("h_targetperiod"), tLabels);
      $("h_targetperiod").value = tLabels[0]; // varsayılan: ilk seçenek
      autoFitSelectFont($("h_targetperiod"));
      $("h_targetperiod").addEventListener("change", () => autoFitSelectFont($("h_targetperiod")));
    }

    const uh1s = Object.keys(HIERARCHY);
    fillSelect($("h_uh1"), uh1s);
    $("h_uh1").value = state.sel.uh1;
    autoFitSelectFont($("h_uh1"));
    refreshUh2();
    refreshUh3();
    $("h_uh1").addEventListener("change", () => {
      state.sel.uh1 = $("h_uh1").value;
      autoFitSelectFont($("h_uh1"));
      syncLevel();
      refreshUh2();
      refreshUh3();
      rebuild();
    });
    $("h_uh2").addEventListener("change", () => {
      state.sel.uh2 = $("h_uh2").value;
      autoFitSelectFont($("h_uh2"));
      syncLevel();
      refreshUh3();
      rebuild();
    });
    $("h_uh3").addEventListener("change", () => {
      state.sel.uh3 = $("h_uh3").value;
      autoFitSelectFont($("h_uh3"));
      syncLevel();
      rebuild();
    });
  }
  function refreshUh2() {
    const uh2s = Object.keys(HIERARCHY[state.sel.uh1] || {});
    fillSelect($("h_uh2"), uh2s);
    state.sel.uh2 = uh2s[0] || "";
    $("h_uh2").value = state.sel.uh2;
    autoFitSelectFont($("h_uh2"));
  }
  function refreshUh3() {
    const node = (HIERARCHY[state.sel.uh1] || {})[state.sel.uh2] || {};
    const keys = Object.keys(node);
    state.sel.uh3 = keys[0] || "";
    fillSelect($("h_uh3"), keys);
    $("h_uh3").value = state.sel.uh3;
    autoFitSelectFont($("h_uh3"));
  }
  function rebuild() {
    // DataService güncel seçimi kullansın
    DataService._cur = { sel: state.sel, level: state.level };
    state.covers = null;             // yeni satırlara göre Hedef Cover'ı sıfırla
    buildTable();
    updateAll();
    updateSelInfo();
    // başlık kolon adı
    $("grpColHead").textContent = "ÜH4";
    attachUh4ResizeHandle(); // textContent ataması ÜH4 hücresindeki resize tutamacını sildi, yeniden ekle
    updateSaveButtonState(); // seçim değişti — "Kaydet"/"Revize Et" eşleşmesi yeniden değerlendirilsin
  }
  function updateSelInfo() {
    const path = [state.sel.uh1, state.sel.uh2, state.sel.uh3].filter(Boolean).join(" › ");
    const n = DataService.loadMix().length;
    $("selInfo").textContent = `Seçim: ${path}  •  Seviye: ${state.level.toUpperCase()}  •  ${n} satır.`;
    // Bar kapalıysa seçim sadece tooltip'ten görülebiliyor — tazele.
    if (document.querySelector(".wrap.side-collapsed")) applySidebarCollapsed(true);
  }

  function enforceWeightTotal() {
    const ids = ["w_kar", "w_satis", "w_stok"];
    const values = ids.map((id) => {
      const v = parseFloat($(id).value);
      return isFinite(v) ? v : 0;
    });
    const total = values.reduce((sum, v) => sum + v, 0);
    if (total === 0) {
      $("w_kar").value = 40;
      $("w_satis").value = 30;
      $("w_stok").value = 30;
      return;
    }
    if (total !== 100) {
      const lastId = ids[ids.length - 1];
      const lastValue = parseFloat($(lastId).value) || 0;
      const currentOtherSum = values.slice(0, -1).reduce((sum, v) => sum + v, 0);
      const adjustedLast = Math.max(0, 100 - currentOtherSum);
      $(lastId).value = adjustedLast;
    }
  }

  // --- Parametreleri oku ---
  function readParams() {
    const num = (id, d) => { const v = parseFloat($(id).value); return isNaN(v) ? d : v; };
    const camp = {};
    CAMP.forEach((k) => (camp[k] = num("m_" + k, 0)));
    return {
      stokBuyume: num("p_stokbuyume", 0),
      pazar: num("p_pazar", 0),
      fiyatBuyume: num("p_fiyatbuyume", 0),
      wKar: num("w_kar", 40), wSatis: num("w_satis", 30), wStok: num("w_stok", 30),
      camp,
    };
  }

    // --- Aksiyon etiketi (LC 2x2 pay matrisi, Arpaz aksiyonları) ---
  // Hız: Satış payı vs Stok payı | Kârlılık: Kâr payı vs Stok payı
  function actionTag(stockShare, salesShare, profitShare) {
    const hizli = salesShare > stockShare;
    const karli = profitShare > stockShare;
    if (hizli && karli) return { etiket: "Hızlı & Kârlı", eCls: "b-green", aksiyon: "Plan stok payını artır", aCls: "b-green" };
    if (hizli && !karli) return { etiket: "Hızlı & Kârsız", eCls: "b-amber", aksiyon: "Fiyat / marj gözden geçir", aCls: "b-amber" };
    if (!hizli && karli) return { etiket: "Yavaş & Kârlı", eCls: "b-blue", aksiyon: "İndirim/kampanya ile hızlandır · stok payını azalt", aCls: "b-blue" };
    return { etiket: "Yavaş & Kârsız", eCls: "b-red", aksiyon: "Stok payını azalt · fiyat/kampanya gözden geçir", aCls: "b-red" };
  }

  // --- SAF yardımcı: medyan (çift sayıda elemanda ortadaki ikinin ortalaması) ---
  function median(arr) {
    if (!arr.length) return 0;
    const s = [...arr].sort((a, b) => a - b);
    const mid = Math.floor(s.length / 2);
    return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
  }

  // --- SAF HESAP MODELİ (render'dan bağımsız) ---
  // computeFromData: herhangi bir veri kümesi (ÜH4 veya ÜH3) için hesaplar
  function computeFromData(data, p, covers, tyFiyatOverrides) {
    const totStock = data.reduce((a, d) => a + d[1], 0);
    const totSales = data.reduce((a, d) => a + d[2], 0);
    const totValue = data.reduce((a, d) => a + d[3], 0);
    const totProfit = data.reduce((a, d) => a + d[3] * d[4] / 100, 0);
    const totalPlanStock = totStock * (1 + p.stokBuyume / 100);
    const pazarF = 1 + p.pazar / 100;
    const campF = CAMP.reduce((a, k) => a * (1 + p.camp[k] / 100), 1);
    const wsum = (p.wKar + p.wSatis + p.wStok) || 1;

    const rows = data.map((d, i) => {
      const [name, stock, sales, value, margin] = d;
      const profit = value * margin / 100;
      const stockShare = stock / totStock || 0;
      const salesShare = sales / totSales || 0;
      const profitShare = profit / totProfit || 0;
      const lyCover = sales ? stock / sales : 0;
      const turnover = stock ? sales / stock : 0;
      const lyFiyat = sales ? value / sales : 0;

      const computedPlanPct = (p.wKar * profitShare + p.wSatis * salesShare + p.wStok * stockShare) / wsum;
      const planPctOverride = (Array.isArray((typeof state !== 'undefined' && state.planPctOverrides)) ? state.planPctOverrides[i] : null);
      const planPct = (planPctOverride !== null && planPctOverride !== undefined) ? planPctOverride : computedPlanPct;
      const planStock = totalPlanStock * planPct;
      const hedefCover = (covers && typeof covers[i] !== 'undefined') ? covers[i] : Math.max(1, Math.round(stock / (sales || 1)));
      const salesBudget = hedefCover ? (planStock / hedefCover) * pazarF * campF : 0;
      const lfl = sales ? salesBudget / sales - 1 : 0;
      const rlfl = (planStock && sales && stock) ? (salesBudget / planStock) / (sales / stock) - 1 : 0;
      const stockGrowth = stock ? planStock / stock - 1 : 0;
      const tag = actionTag(stockShare, salesShare, profitShare);

      const tyFiyatManual = (tyFiyatOverrides && tyFiyatOverrides[i] != null) ? tyFiyatOverrides[i] : null;
      const tyFiyat = tyFiyatManual !== null ? tyFiyatManual : lyFiyat * (1 + p.fiyatBuyume / 100);
      const tyRevenue = salesBudget * tyFiyat;
      // TY brüt kâr: TY ciro × AYNI marj. VARSAYIM — uygulamada marj değişimi
      // parametresi YOK, bu yüzden TY marjı LY marjına eşit alınır. Bütçe
      // hesabına GİRMEZ, sadece KPI kartında LY→TY kâr kıyası için türetilir.
      const tyProfit = tyRevenue * margin / 100;

      return { name, stock, sales, profit, margin, tyProfit, stockShare, salesShare, profitShare,
        lyCover, turnover, lyFiyat, planPct, planStock, hedefCover, salesBudget, lfl, rlfl, stockGrowth,
        tyFiyat, tyRevenue, tag };
    });

    // --- Ölü stok işaretleme (SADECE görsel — bütçe hesabına etkisi yok) ---
    // Kural: LY Cover > (oluCarpan × görünen satırların LY Cover medyanı) VE LY Cover >= 12 ay
    const oluCarpan = OLU_STOK_CARPANI;
    const coverMedian = median(rows.map((r) => r.lyCover));
    const oluEsik = oluCarpan * coverMedian;
    rows.forEach((r) => {
      r.oluStok = r.lyCover > oluEsik && r.lyCover >= 12;
      r.coverMedian = coverMedian;
      r.oluCarpan = oluCarpan;
    });

    const T = {
      stock: totStock, sales: totSales, value: totValue, profit: totProfit,
      planPct: rows.reduce((a, r) => a + r.planPct, 0),
      planStock: rows.reduce((a, r) => a + r.planStock, 0),
      salesBudget: rows.reduce((a, r) => a + r.salesBudget, 0),
      tyRevenue: rows.reduce((a, r) => a + r.tyRevenue, 0),
      tyProfit: rows.reduce((a, r) => a + r.tyProfit, 0),
      oluAdet: rows.filter((r) => r.oluStok).length,
    };
    T.lfl = T.salesBudget / (totSales || 1) - 1;
    T.cover = totStock / (totSales || 1);
    // KPI kartları için türetilenler (tfoot ile AYNI formüller — tek kaynak):
    T.tyCover = T.salesBudget ? T.planStock / T.salesBudget : 0;
    T.stockGrowth = totStock ? T.planStock / totStock - 1 : 0;
    T.profitGrowth = totProfit ? T.tyProfit / totProfit - 1 : 0;
    T.rlfl = (T.planStock && totSales && totStock)
      ? (T.salesBudget / T.planStock) / (totSales / totStock) - 1 : 0;
    return { rows, T, campF, pazarF };
  }

  // computeModel: mevcut görünümdeki DataService.loadMix() için wrapper
  function computeModel(p, covers, tyFiyat) {
    const data = DataService.loadMix();
    return computeFromData(data, p, covers, tyFiyat);
  }

  // --- Tabloyu bir kez kur (input'lar korunsun diye) ---
  function buildTable() {
    const data = DataService.loadMix();
    if (!data.length) {
      $("rows").innerHTML = `<tr><td colspan="22" style="text-align:center;color:var(--grey);padding:18px">Bu seçim için veri bulunamadı.</td></tr>`;
      state.covers = [];
      state.tyFiyat = [];
      return;
    }
    if (!state.covers || state.covers.length !== data.length)
      state.covers = data.map((d) => Math.max(1, Math.round(d[1] / (d[2] || 1)))); // default = LY cover
    if (!state.tyFiyat || state.tyFiyat.length !== data.length)
      state.tyFiyat = new Array(data.length).fill(null);   // null = otomatik hesap (LY Fiyat × Fiyat Büyümesi)
    if (!state.planPctOverrides || state.planPctOverrides.length !== data.length)
      state.planPctOverrides = new Array(data.length).fill(null);

    const tb = $("rows");
    tb.innerHTML = "";

    data.forEach((d, i) => {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${d[0]}</td>
        <td class="num-cell" id="st_${i}"></td><td class="pct pct-hl" id="stp_${i}"></td>
        <td class="num-cell" id="sa_${i}"></td><td class="pct pct-hl" id="sap_${i}"></td>
        <td class="num-cell" id="bk_${i}"></td>
        <td class="pct pct-hl" id="ktp_${i}"></td>
        <td id="cov_${i}"></td><td id="tov_${i}"></td>
        <td class="num-cell" id="lyciro_${i}"></td><td id="lyfiyat_${i}"></td>
        <td class="planpctcell"><input type="number" class="planpctin" id="psp_${i}" min="0" max="100" step="0.1"></td><td class="num-cell" id="psa_${i}"></td>
        <td class="covcell"><input type="number" class="covin" id="hcov_${i}" min="1" step="0.5" value="${state.covers[i]}"><button type="button" class="cov-ref-btn" data-row="${i}" title="Geçmiş stok ay referansını göster" aria-label="Geçmiş stok ay referansı">i</button></td>
        <td class="num-cell" id="sb_${i}"></td>
        <td class="fiyatcell"><input type="number" class="fiyatin" id="tyfiyat_${i}" min="0" step="1"></td>
        <td id="ciro_${i}"></td>
        <td id="lfl_${i}"></td><td id="rlfl_${i}"></td><td id="sg_${i}"></td>
        <td id="tag_${i}"></td>
        <td id="act_${i}"></td>`;
      tb.appendChild(tr);
    });

    data.forEach((d, i) => {
      const covInput = $("hcov_" + i);
      if (covInput) covInput.addEventListener("input", (e) => {
        const v = parseFloat(e.target.value);
        state.covers[i] = isNaN(v) || v <= 0 ? state.covers[i] : v;
        updateAll();
      });
      const fiyatInput = $("tyfiyat_" + i);
      if (fiyatInput) fiyatInput.addEventListener("input", (e) => {
        const v = parseFloat(e.target.value);
        state.tyFiyat[i] = (isNaN(v) || v < 0) ? null : v;   // boşaltılırsa "otomatik"a döner
        updateAll();
      });
      const planPctInput = $("psp_" + i);
      if (planPctInput) planPctInput.addEventListener("input", (e) => {
        const v = parseFloat(e.target.value);
        state.planPctOverrides[i] = (isNaN(v) || v < 0 || v > 100) ? null : v / 100;
        updateAll();
      });
      // Hedef Cover hücresindeki (i) — o satırın ÜH4'ü için geçmiş stok ay grafiği.
      const refBtn = document.querySelector('.cov-ref-btn[data-row="' + i + '"]');
      if (refBtn) refBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        stokRefAc(refBtn, d[0]);   // d[0] = satırın ÜH4 adı
      });
    });
  }

  // --- Hücreleri güncelle (DOM'u yeniden kurmadan) ---
function updateAll() {
  const p = readParams();
  const m = computeModel(p, state.covers, state.tyFiyat);
  $("mult_total").textContent = fmtX(m.pazarF * m.campF);

  m.rows.forEach((r, i) => {
    $("st_" + i).textContent = fmtN(r.stock);
    $("stp_" + i).textContent = fmtP(r.stockShare);
    $("sa_" + i).textContent = fmtN(r.sales);
    $("sap_" + i).textContent = fmtP(r.salesShare);
    $("bk_" + i).textContent = fmtN(r.profit);
    $("ktp_" + i).textContent = fmtP(r.profitShare);
    $("cov_" + i).innerHTML = coverCellHtml(r);
    $("tov_" + i).textContent = fmtD2(r.turnover);
    $("lyciro_" + i).textContent = fmtN(r.sales * r.lyFiyat);
    $("lyfiyat_" + i).textContent = fmtN(r.lyFiyat);
    const planPctEl = $("psp_" + i);
    if (planPctEl && document.activeElement !== planPctEl) planPctEl.value = Number((r.planPct * 100).toFixed(1));
    $("psa_" + i).textContent = fmtN(r.planStock);
    $("sb_" + i).textContent = fmtN(r.salesBudget);
    const fiyatEl = $("tyfiyat_" + i);
    if (fiyatEl && document.activeElement !== fiyatEl) fiyatEl.value = String(Math.round(r.tyFiyat));
    // Display Ciro Bütçe using the rounded displayed sales budget × TY fiyat so UI matches what user sees
    const displayCiro = Math.round(r.salesBudget) * (r.tyFiyat || 0);
    $("ciro_" + i).textContent = fmtN(displayCiro);
    const lflEl = $("lfl_" + i); if (lflEl) { lflEl.textContent = fmtP0(r.lfl); lflEl.className = r.lfl >= 0 ? "up" : "down"; }
    const rlflEl = $("rlfl_" + i); if (rlflEl) { rlflEl.textContent = fmtP0(r.rlfl); rlflEl.className = r.rlfl >= 0 ? "up" : "down"; }
    const sgEl = $("sg_" + i); if (sgEl) { sgEl.textContent = fmtP0(r.stockGrowth); sgEl.className = r.stockGrowth >= 0 ? "up" : "down"; }
    $("tag_" + i).innerHTML = `<span class="badge ${r.tag.eCls}">${r.tag.etiket}</span>`;
    $("act_" + i).innerHTML = `<span class="badge ${r.tag.aCls}">${r.tag.aksiyon}</span>`;
    const covEl = $("hcov_" + i);
    if (covEl && document.activeElement !== covEl) covEl.value = r.hedefCover;
  });

  const footCover = m.T.sales ? m.T.stock / m.T.sales : 0;
  const footTurnover = m.T.stock ? m.T.sales / m.T.stock : 0;
  const footStockGrowth = m.T.stock ? m.T.planStock / m.T.stock - 1 : 0;
  const footRlfl = (m.T.planStock && m.T.sales && m.T.stock)
    ? (m.T.salesBudget / m.T.planStock) / (m.T.sales / m.T.stock) - 1 : null;
  // "Etkin" Hedef Cover: tüm satırlara UYGULANSAYDI aynı toplam Satış Bütçe'yi
  // üretecek değer — satır formülünün (salesBudget = planStock/hedefCover × pazarF
  // × campF) tersi. Hesaba/satır formülüne dokunmaz, sadece TOPLAM'a türetilmiş
  // bir gösterge ekler.
  const footHedefCover = m.T.salesBudget
    ? (m.T.planStock * m.pazarF * m.campF) / m.T.salesBudget
    : null;
  const footLyFiyat = m.T.sales ? m.T.value / m.T.sales : 0;
  // TY Fiyat toplamı da Hedef Cover ile AYNI yöntem: "etkin" ağırlıklı ortalama
  // (tyRevenue/salesBudget) — tüm satırlara uygulansaydı aynı toplam Ciro Bütçe'yi
  // üretecek değer, tutarlılık için.
  const footTyFiyat = m.T.salesBudget ? m.T.tyRevenue / m.T.salesBudget : null;
  $("tfoot").innerHTML = `
    <td>TOPLAM</td>
    <td>${fmtN(m.T.stock)}</td><td class="pct-hl">${m.rows.length ? "100%" : "—"}</td>
    <td>${fmtN(m.T.sales)}</td><td class="pct-hl">${m.rows.length ? "100%" : "—"}</td>
    <td class="num-cell">${fmtN(m.T.profit)}</td><td class="pct-hl">${m.rows.length ? "100%" : "—"}</td>
    <td>${fmtD(footCover)}</td><td>${fmtD2(footTurnover)}</td>
    <td>${fmtN(m.T.value)}</td><td>${fmtN(footLyFiyat)}</td>
    <td>${m.rows.length ? fmtP(m.T.planPct) : "—"}</td><td>${fmtN(m.T.planStock)}</td>
    <td>${footHedefCover === null ? "—" : fmtD(footHedefCover)}</td><td>${fmtN(m.T.salesBudget)}</td>
    <td>${footTyFiyat === null ? "—" : fmtN(footTyFiyat)}</td>    <td>${fmtN(m.T.tyRevenue)}</td>
    <td class="${m.rows.length ? (m.T.lfl >= 0 ? "up" : "down") : ""}">${m.rows.length ? fmtP0(m.T.lfl) : "—"}</td>
    <td class="${footRlfl === null ? "" : (footRlfl >= 0 ? "up" : "down")}">${footRlfl === null ? "—" : fmtP0(footRlfl)}</td>
    <td class="${m.rows.length ? (footStockGrowth >= 0 ? "up" : "down") : ""}">${m.rows.length ? fmtP0(footStockGrowth) : "—"}</td>
    <td></td><td></td>`;

  renderKpis(m);
  // NOT: renderForecast(m) BURADAN KALDIRILDI — Tahmin sekmesi artık canlı
  // modelden (computeModel) DEĞİL, kendi kaskadından + FORECAST_DATA'dan
  // besleniyor. Miks parametrelerini oynatmak tahmini DEĞİŞTİRMEZ.
  // NOT: renderToptan(m) BURADAN KALDIRILDI — Toptan Bütçe artık canlı sidebar/parametre
  // değişikliklerine değil, Kayıtlar'a bağlı (bkz. renderToptanFromSaved, saveCurrentMixSet).
}


  // LY Cover hücresi: normalde düz sayı, ölü stok işaretliyse mevcut b-red rozetiyle sarılır (görsel — bütçeye etkisi yok)
  function coverCellHtml(r) {
    const val = fmtD(r.lyCover);
    if (!r.oluStok) return val;
    const kat = r.coverMedian ? fmtD(r.lyCover / r.coverMedian) : "—";
    const title = `Ölü stok: grup medyanının ${kat} katı (eşik = çarpan ${fmtD(r.oluCarpan)} × medyan ${fmtD(r.coverMedian)} ay)`;
    return `<span class="badge b-red" title="${title}">${val}</span>`;
  }

  // KPI şeridi: ana tablonun ÜSTÜNDE, 6 kart. Dördü "LY → TY" kıyası (büyük
  // değerde çift, alt satırda birim + yüzdesel değişim), ikisi saf büyüme oranı.
  // NOT: "Toplam Satış Bütçe (TY)" kartı KALDIRILDI — TY satış zaten SATIŞ
  // kartının sağ tarafı; iki yerde göstermek tekrar oluyordu.
  function renderKpis(m) {
    const has = m.rows.length > 0;
    const dir = (v) => (v >= 0 ? "up" : "down");
    // Cover'da AZALMA iyidir (stok daha hızlı dönüyor) — renk mantığı TERS.
    const coverD = m.T.cover ? m.T.tyCover / m.T.cover - 1 : 0;
    const pair = (a, b) => `${a} <span class="kpi-arrow">→</span> ${b}`;
    const kpis = has ? [
      ["STOK", pair(fmtN(m.T.stock), fmtN(m.T.planStock)),
        `adet · ${fmtP0(m.T.stockGrowth)}`, dir(m.T.stockGrowth)],
      ["SATIŞ", pair(fmtN(m.T.sales), fmtN(m.T.salesBudget)),
        `adet · ${fmtP0(m.T.lfl)}`, dir(m.T.lfl)],
      ["BRÜT KÂR", pair(fmtN(m.T.profit), fmtN(m.T.tyProfit)),
        `₺ · ${fmtP0(m.T.profitGrowth)}`, dir(m.T.profitGrowth)],
      ["BAYİ STOK AY (COVER)", pair(fmtD(m.T.cover), fmtD(m.T.tyCover)),
        `ay · ${fmtP0(coverD)}`, coverD <= 0 ? "up" : "down"],
      ["LFL BÜYÜME", fmtP0(m.T.lfl), "TY bütçe / LY satış", dir(m.T.lfl)],
      ["R-LFL BÜYÜME", fmtP0(m.T.rlfl), "stoktan arındırılmış", dir(m.T.rlfl)],
    ] : [
      ["STOK", "—", "adet", ""], ["SATIŞ", "—", "adet", ""],
      ["BRÜT KÂR", "—", "₺", ""], ["BAYİ STOK AY (COVER)", "—", "ay", ""],
      ["LFL BÜYÜME", "—", "", ""], ["R-LFL BÜYÜME", "—", "", ""],
    ];
    $("kpis").innerHTML = kpis.map((k) => {
      const sc = k[3] === "up" || k[3] === "down" ? k[3] : "";
      return `<div class="kpi"><div class="lbl">${k[0]}</div>
        <div class="val">${k[1]}</div><div class="sub ${sc}">${k[2]}</div></div>`;
    }).join("");
  }

  // --- "Perakende Bütçe" sekmesi: Özet / Rollup Paneli ---
  // ÜH4'te çalışılan bütçenin ÜH1→ÜH2→ÜH3 alt-toplamda LY→TY özeti. Mevcut
  // computeFromData YENİDEN FORMÜL YAZILMADAN kullanılır: her "yaprak" ÜH3'ün
  // ÜH4 satırları computeFromData ile hesaplanır, sonuçlar (r.sales,
  // r.salesBudget, r.stock, r.planStock, r.lyFiyat, r.tyRevenue) istenen
  // kırılım seviyesinde (ÜH1/ÜH2/ÜH3) toplanır. Bu panel CANLIDIR — global
  // parametre veya Hedef Cover değişince (updateAll() üzerinden) yeniden
  // hesaplanır; Toptan Bütçe'nin aksine "dondurulmuş" DEĞİLDİR (bilinçli
  // fark — bu panel sonuç/izleme ekranı, Toptan Bütçe kayıtlı plan arşivi).
  const rollupState = { level: "uh2" };

  // HIERARCHY ağacında verilen kırılım seviyesindeki tüm "yaprak" ÜH3
  // üçlülerini (uh1,uh2,uh3) + hangi rollup grubuna (groupKey) ait
  // olduklarını döndürür. ÜH1 seviyesi TÜM hiyerarşiyi tarar (global);
  // ÜH2/ÜH3 seviyeleri sidebar'daki mevcut state.sel.uh1/(uh2) altını tarar.
  function rollupBlankAcc(name) {
    return { name, lySales: 0, tyBudget: 0, lyStock: 0, tyPlanStock: 0, lyValue: 0, tyRevenue: 0 };
  }
  function rollupAddRow(acc, r) {
    acc.lySales += r.sales; acc.tyBudget += r.salesBudget;
    acc.lyStock += r.stock; acc.tyPlanStock += r.planStock;
    acc.lyValue += r.sales * r.lyFiyat; acc.tyRevenue += r.tyRevenue;
  }
  // Toplanan Σ alanlarından (LY Satış, TY Bütçe, LY Stok, TY Plan Stok, LY/TY
  // ciro) grup metriklerini türetir — formüller görev tanımındakiyle AYNI.
  function rollupFinalize(acc) {
    const lfl = acc.lySales ? acc.tyBudget / acc.lySales - 1 : 0;
    const stokD = acc.lyStock ? acc.tyPlanStock / acc.lyStock - 1 : 0;
    const lyCover = acc.lySales ? acc.lyStock / acc.lySales : 0;
    const tyCover = acc.tyBudget ? acc.tyPlanStock / acc.tyBudget : 0;
    const rlfl = (acc.tyPlanStock && acc.lySales && acc.lyStock)
      ? (acc.tyBudget / acc.tyPlanStock) / (acc.lySales / acc.lyStock) - 1 : 0;
    const lyFiyat = acc.lySales ? acc.lyValue / acc.lySales : 0;
    const tyFiyat = acc.tyBudget ? acc.tyRevenue / acc.tyBudget : 0;
    const fiyatD = lyFiyat ? tyFiyat / lyFiyat - 1 : 0;
    return { name: acc.name, lySales: acc.lySales, tyBudget: acc.tyBudget, lfl, rlfl, stokD,
      lyCover, tyCover, lyFiyat, tyFiyat, fiyatD };
  }
  // KAYNAK: "Çalışılmış Bütçe ve Stok Karışım" kayıtları (savedMixSets) — CANLI
  // sidebar seçimi DEĞİL. Kayıtların satırları (`set.rows`) rollupAddRow'ın
  // beklediği alan adlarını (sales/salesBudget/stock/planStock/lyFiyat/tyRevenue)
  // zaten birebir taşıyor (bkz. buildCurrentMixRecord), bu yüzden toplama ve
  // metrik türetme fonksiyonları DEĞİŞMEDEN kullanılır.
  // Kırılım seviyesi sadece GRUPLAMA derinliğini belirler; sidebar seçimine göre
  // kapsam DARALTILMAZ — kayıtlı işlerin tamamı özetlenir (bilinçli: kaynak artık
  // o anki seçim değil, kayıt listesi).
  // Aynı boyut anahtarı için "Revize Et" kaydı YERİNDE günceller (bkz.
  // saveCurrentMixSet), bu yüzden çift sayım OLMAZ.
  function computeRollup(level) {
    const sets = loadSavedMixSets();
    const groups = new Map();
    const totalAcc = rollupBlankAcc("TOPLAM");
    sets.forEach((set) => {
      const groupKey = level === "uh1" ? set.uh1 : level === "uh2" ? set.uh2 : set.uh3;
      if (!groupKey || !Array.isArray(set.rows)) return;
      if (!groups.has(groupKey)) groups.set(groupKey, rollupBlankAcc(groupKey));
      const g = groups.get(groupKey);
      set.rows.forEach((r) => { rollupAddRow(g, r); rollupAddRow(totalAcc, r); });
    });
    return { rows: Array.from(groups.values()).map(rollupFinalize), total: rollupFinalize(totalAcc) };
  }

  function rollupDeltaSpan(v) {
    const cls = v >= 0 ? "up" : "down";
    const arrow = v >= 0 ? "▲" : "▼";
    return `<span class="${cls}">${arrow} ${fmtP0(v)}</span>`;
  }
  function rollupLflBar(lfl) {
    const widthPct = Math.min(50, Math.abs(lfl) * 100);
    const cls = lfl >= 0 ? "pos" : "neg";
    return `<div class="rollup-lfl-track"><div class="rollup-lfl-fill ${cls}" style="width:${widthPct}%"></div></div>`;
  }
  function renderRollupKpis(t) {
    const el = $("rollupKpis");
    if (!el) return;
    const kpis = [
      ["Satış Bütçe (TY)", fmtN(t.tyBudget), "adet · LFL " + fmtP0(t.lfl), t.lfl >= 0 ? "up" : "down"],
      ["R-LFL", fmtP0(t.rlfl), "stoktan arındırılmış büyüme", t.rlfl >= 0 ? "up" : "down"],
      ["Stok Büyümesi", fmtP0(t.stokD), "TY Plan Stok / LY Stok − 1", t.stokD >= 0 ? "up" : "down"],
      ["Bayi Stok Ay (Cover)", `${fmtD(t.lyCover)} → ${fmtD(t.tyCover)}`, "LY → TY ay", ""],
      ["Ort. Fiyat Değişimi", fmtP0(t.fiyatD), "ağırlıklı ortalama fiyat", t.fiyatD >= 0 ? "up" : "down"],
    ];
    el.innerHTML = kpis.map((k) => `<div class="kpi"><div class="lbl">${k[0]}</div>
      <div class="val">${k[1]}</div><div class="sub ${k[3]}">${k[2]}</div></div>`).join("");
  }
  function renderRollupTable(data) {
    const tbody = $("rollupRows");
    if (!tbody) return;
    if (!data.rows.length) {
      // Kaynak artık Kayıtlar olduğu için boş durum "veri yok" değil "henüz kayıt yok".
      tbody.innerHTML = `<tr><td colspan="10" style="text-align:center;color:var(--grey);padding:18px">Henüz kayıt yok — "Bütçe &amp; Stok Karışımı" ekranında <b>Kaydet</b>'e bastığında çalışman burada özetlenir.</td></tr>`;
      $("rollupFoot").innerHTML = "";
      return;
    }
    tbody.innerHTML = data.rows.map((r) => `
      <tr>
        <td>${r.name}</td>
        <td class="num-cell">${fmtN(r.lySales)}</td>
        <td class="num-cell">${fmtN(r.tyBudget)}</td>
        <td>${rollupDeltaSpan(r.lfl)}${rollupLflBar(r.lfl)}</td>
        <td class="${r.rlfl >= 0 ? "up" : "down"}">${fmtP0(r.rlfl)}</td>
        <td class="${r.stokD >= 0 ? "up" : "down"}">${fmtP0(r.stokD)}</td>
        <td>${fmtD(r.lyCover)} → ${fmtD(r.tyCover)}</td>
        <td class="num-cell">${fmtN(r.lyFiyat)}</td>
        <td class="num-cell">${fmtN(r.tyFiyat)}</td>
        <td class="${r.fiyatD >= 0 ? "up" : "down"}">${fmtP0(r.fiyatD)}</td>
      </tr>`).join("");
    const t = data.total;
    $("rollupFoot").innerHTML = `
      <td>TOPLAM</td>
      <td class="num-cell">${fmtN(t.lySales)}</td>
      <td class="num-cell">${fmtN(t.tyBudget)}</td>
      <td class="${t.lfl >= 0 ? "up" : "down"}">${fmtP0(t.lfl)}</td>
      <td class="${t.rlfl >= 0 ? "up" : "down"}">${fmtP0(t.rlfl)}</td>
      <td class="${t.stokD >= 0 ? "up" : "down"}">${fmtP0(t.stokD)}</td>
      <td>${fmtD(t.lyCover)} → ${fmtD(t.tyCover)}</td>
      <td class="num-cell">${fmtN(t.lyFiyat)}</td>
      <td class="num-cell">${fmtN(t.tyFiyat)}</td>
      <td class="${t.fiyatD >= 0 ? "up" : "down"}">${fmtP0(t.fiyatD)}</td>`;
  }
  function renderRollup() {
    if (!$("rollupKpis") || !state.sel) return;
    const data = computeRollup(rollupState.level);
    renderRollupKpis(data.total);
    renderRollupTable(data);
  }

  // --- Toptan Bütçe Özet / Rollup Paneli ---
  const toptanRollupState = { level: "uh2" };

  // Rollup KENDİ hesabını YAPMAZ — Toptan tablosunun satır bazlı toptanButce
  // değerlerini toplar. TEK doğruluk kaynağı satır seviyesidir; burada bağımsız
  // bir formül çalıştırma.
  //
  // ESKİ HATA (tekrarlama): bu fonksiyon loadSavedMixSets()'i doğrudan okuyup
  // donusumSatir(r.salesBudget, r.targetperiod ...) çağırıyordu. Ama periyot SATIR
  // seviyesinde YOK — buildFlatRows() onu SET seviyesinden (dims.targetperiod)
  // taşır. r.targetperiod undefined kalıyor, ayNo() null dönüyor ve çarpan yıllık
  // K'ya (≈1,00) düşüyordu. Bütçe tek bir ay için çalışıldığından o ayın çarpanı
  // geçerlidir. Aynı sebeple set.uh1/uh2/uh3 de yanlıştı (dims altında duruyorlar)
  // ve rowPassesFilters uygulanmadığı için filtreler rollup'a yansımıyordu.
  //
  // Çarpan da hesaplanmaz, TÜRETİLİR: toptan toplamı ÷ perakende toplamı. Böylece
  // birden fazla ay seçiliyse ağırlıklı ortalama kendiliğinden doğru çıkar.
  function computeToptanRollup(level) {
    const satirlar = computeToptanFromSaved().rows;
    const groups = new Map();
    const totalAcc = { perakendeBudget: 0, toptanBudget: 0, adFark: 0 };

    satirlar.forEach((r) => {
      const groupKey = level === "uh1" ? r.uh1 : level === "uh2" ? r.uh2 : r.uh3;
      if (!groupKey) return;
      if (!groups.has(groupKey)) groups.set(groupKey, { name: groupKey, perakendeBudget: 0, toptanBudget: 0, adFark: 0 });
      const g = groups.get(groupKey);
      const perakendeBudget = Number(r.salesBudget) || 0;
      const toptanBudget = Number(r.toptanButce) || 0;
      g.perakendeBudget += perakendeBudget;
      g.toptanBudget += toptanBudget;
      g.adFark += toptanBudget - perakendeBudget;
      totalAcc.perakendeBudget += perakendeBudget;
      totalAcc.toptanBudget += toptanBudget;
      totalAcc.adFark += toptanBudget - perakendeBudget;
    });

    const turetilmisCarpan = (toptan, perakende) => (perakende ? toptan / perakende : 0);
    const rows = Array.from(groups.values()).map((g) => ({
      name: g.name,
      perakendeBudget: g.perakendeBudget,
      toptanBudget: g.toptanBudget,
      carpan: turetilmisCarpan(g.toptanBudget, g.perakendeBudget),
      adFark: g.adFark,
    }));
    const total = {
      name: "TOPLAM",
      perakendeBudget: totalAcc.perakendeBudget,
      toptanBudget: totalAcc.toptanBudget,
      carpan: turetilmisCarpan(totalAcc.toptanBudget, totalAcc.perakendeBudget),
      adFark: totalAcc.adFark,
    };
    return { rows, total };
  }

  function renderToptanRollupKpis(t) {
    const el = $("toptanRollupKpis");
    if (!el) return;
    const kpis = [
      ["Perakende Bütçe", fmtN(t.perakendeBudget), "kaynak bütçe", "up"],
      ["Toptan Bütçe", fmtN(t.toptanBudget), `Dönüşüm ${fmtD3(t.carpan)}x`, "up"],
    ];
    el.innerHTML = kpis.map((k) => `<div class="kpi"><div class="lbl">${k[0]}</div>
      <div class="val">${k[1]}</div><div class="sub ${k[3]}">${k[2]}</div></div>`).join("");
  }

  function renderToptanRollupTable(data) {
    const tbody = $("toptanRollupRows");
    if (!tbody) return;
    if (!data.rows.length) {
      tbody.innerHTML = `<tr><td colspan="5" style="text-align:center;color:var(--grey);padding:18px">Henüz kayıt yok — "Bütçe &amp; Stok Karışımı" ekranında <b>Kaydet</b>'e bastığında çalışma burada özetlenir.</td></tr>`;
      $("toptanRollupFoot").innerHTML = "";
      return;
    }
    tbody.innerHTML = data.rows.map((r) => `
      <tr>
        <td>${r.name}</td>
        <td class="num-cell">${fmtN(r.perakendeBudget)}</td>
        <td class="num-cell">${fmtN(r.toptanBudget)}</td>
        <td class="num-cell">${fmtD3(r.carpan)}</td>
        <td class="num-cell ${r.adFark >= 0 ? "up" : "down"}">${fmtN(r.adFark)}</td>
      </tr>`).join("");
    const t = data.total;
    $("toptanRollupFoot").innerHTML = `
      <td>TOPLAM</td>
      <td class="num-cell">${fmtN(t.perakendeBudget)}</td>
      <td class="num-cell">${fmtN(t.toptanBudget)}</td>
      <td class="num-cell">${fmtD3(t.carpan)}</td>
      <td class="num-cell ${t.adFark >= 0 ? "up" : "down"}">${fmtN(t.adFark)}</td>`;
  }

  function renderToptanRollup() {
    if (!$("toptanRollupKpis") || !state.sel) return;
    const data = computeToptanRollup(toptanRollupState.level);
    renderToptanRollupKpis(data.total);
    renderToptanRollupTable(data);
  }

  // --- Kayıtlı ÜH3 / ÜH4 miks kayıtları ---
  const MIX_SAVE_KEY = "arpaz_saved_mix_sets";
  function escapeHtml(str) {
    return String(str || "").replace(/[&<>\"']/g, (ch) => ({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#039;"}[ch]));
  }
  function escapeAttribute(str) {
    return escapeHtml(str);
  }
  function loadSavedMixSets() {
    try {
      const raw = localStorage.getItem(MIX_SAVE_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch (e) {
      return [];
    }
  }
  function saveSavedMixSets(list) {
    try { localStorage.setItem(MIX_SAVE_KEY, JSON.stringify(list)); } catch (e) { /* geç */ }
  }
  function buildCurrentMixRecord() {
    const p = readParams();
    const model = computeModel(p, state.covers, state.tyFiyat);
    const salesOrg = ($("h_org") && $("h_org").value) || "";
    const region = ($("h_region") && $("h_region").value) || "";
    const baseperiod = ($("h_baseperiod") && $("h_baseperiod").value) || "";
    const targetperiod = ($("h_targetperiod") && $("h_targetperiod").value) || "";
    const periodText = (baseperiod || targetperiod) ? `${baseperiod || "?"} → ${targetperiod || "?"}` : "";
    return {
      id: (Date.now() + Math.random().toString(16).slice(2)),
      savedAt: new Date().toLocaleString("tr-TR"),
      salesOrg,
      region,
      uh1: state.sel.uh1,
      uh2: state.sel.uh2,
      uh3: state.sel.uh3,
      dimensions: {
        salesOrg,
        region,
        uh1: state.sel.uh1,
        uh2: state.sel.uh2,
        uh3: state.sel.uh3,
        baseperiod,
        targetperiod,
      },
      filterText: [salesOrg, region, state.sel.uh1, state.sel.uh2, state.sel.uh3, periodText].filter(Boolean).join(" / "),
      filters: {
        salesOrg,
        region,
        uh1: state.sel.uh1,
        uh2: state.sel.uh2,
        uh3: state.sel.uh3,
        baseperiod,
        targetperiod,
      },
      keyFigures: {
        stock: model.T.stock,
        salesLy: model.T.sales,
        profitLy: model.T.profit,
        cover: model.T.cover,
        salesBudgetTy: model.T.salesBudget,
        lfl: model.T.lfl,
        tyRevenue: model.T.tyRevenue,
      },
      total: {
        planStock: model.T.planStock,
        salesBudget: model.T.salesBudget,
        tyRevenue: model.T.tyRevenue,
        lfl: model.T.lfl,
      },
      rows: model.rows.map((r) => ({
        name: r.name,
        stock: r.stock,
        sales: r.sales,
        profit: r.profit,
        stockShare: r.stockShare,
        salesShare: r.salesShare,
        profitShare: r.profitShare,
        lyCover: r.lyCover,
        turnover: r.turnover,
        lyRevenue: r.sales * r.lyFiyat,
        lyFiyat: r.lyFiyat,
        planPct: r.planPct,
        planStock: r.planStock,
        hedefCover: r.hedefCover,
        salesBudget: r.salesBudget,
        lfl: r.lfl,
        rlfl: r.rlfl,
        stockGrowth: r.stockGrowth,
        tyFiyat: r.tyFiyat,
        tyRevenue: r.tyRevenue,
        tag: r.tag.etiket,
        action: r.tag.aksiyon,
      })),
    };
  }
  // key -> Set (o kolonda DIŞLANAN/işareti kaldırılmış GÖRÜNTÜLENEN değerler).
  // Boş/eksik Set = filtre yok, hepsi görünür (Excel AutoFilter ile aynı mantık).
  let savedMixFilterState = {};

  function normalizeSavedMixValue(value) {
    return String(value ?? "").trim().toLocaleLowerCase("tr-TR");
  }

  // Excel AutoFilter GÖRÜNTÜLENEN değere göre filtreler/gruplar, ham sayıya göre
  // değil (ör. iki farklı LFL değeri ikisi de "%5"e yuvarlanıyorsa checkbox
  // listesinde TEK satır olarak görünüp birlikte filtrelenmeli) — bu yüzden
  // tabloda hücrede GÖSTERİLEN metni üreten formatlayıcıyla eşleştirildi.
  const SAVED_MIX_VALUE_FORMATTERS = {
    stock: fmtN, stockShare: fmtP, sales: fmtN, salesShare: fmtP, profit: fmtN, profitShare: fmtP,
    lyCover: fmtD, turnover: fmtD2, lyRevenue: fmtN, lyFiyat: fmtN, planPct: fmtP, planStock: fmtN,
    hedefCover: fmtD, salesBudget: fmtN, tyFiyat: fmtN, tyRevenue: fmtN,
    lfl: fmtP0, rlfl: fmtP0, stockGrowth: fmtP0,
  };
  function savedMixDisplayValue(row, key) {
    // Special-case tyRevenue: display should show rounded salesBudget × tyFiyat
    if (key === "tyRevenue") {
      const sb = typeof row.salesBudget === "number" ? Math.round(row.salesBudget) : 0;
      const tf = typeof row.tyFiyat === "number" ? row.tyFiyat : 0;
      return fmtN(sb * tf);
    }
    const raw = row[key];
    const fmt = SAVED_MIX_VALUE_FORMATTERS[key];
    if (fmt) return fmt(typeof raw === "number" ? raw : 0);
    return String(raw ?? "—");
  }
  // Bir kolonun TÜM olası (görüntülenen) değerlerini bulur — mevcut diğer
  // filtrelerden BAĞIMSIZ, buildFlatRows() HİÇ filtrelenmeden taranır (Excel'de
  // her kolonun kendi dropdown'ı hep tüm değerleri gösterir).
  function savedMixUniqueValues(key) {
    const set = new Set();
    buildFlatRows().forEach((row) => set.add(savedMixDisplayValue(row, key)));
    const values = Array.from(set);
    values.sort((a, b) => {
      const na = parseTRNumberLike(a);
      const nb = parseTRNumberLike(b);
      if (!isNaN(na) && !isNaN(nb)) return na - nb;
      return a.localeCompare(b, "tr-TR");
    });
    return values;
  }
  function parseTRNumberLike(s) {
    return parseFloat(String(s).replace(/[%\s]/g, "").replace(/\./g, "").replace(",", "."));
  }

  // Tüm kayıtlı set'lerin tüm satırlarını TEK bir düz diziye indirger — her satır
  // kendi boyut (org/bölge/ÜH/periyot) bilgisini de taşır, filtreleme artık set
  // değil doğrudan satır bazlı yapılabilir.
  function buildFlatRows() {
    const saved = loadSavedMixSets();
    const flat = [];
    saved.forEach((set) => {
      const dims = set.dimensions || set.filters || { salesOrg: set.salesOrg, region: set.region, uh1: set.uh1, uh2: set.uh2, uh3: set.uh3 };
      (set.rows || []).forEach((r) => {
        flat.push({
          setId: set.id,
          savedAt: set.savedAt || "—",
          salesOrg: dims.salesOrg || set.salesOrg || "—",
          region: dims.region || set.region || "—",
          uh1: dims.uh1 || set.uh1 || "—",
          uh2: dims.uh2 || set.uh2 || "—",
          uh3: dims.uh3 || set.uh3 || "—",
          // eski kayıtlarda baseperiod/targetperiod alanları yok (undefined) — "—" göster
          baseperiod: dims.baseperiod || "—",
          targetperiod: dims.targetperiod || "—",
          name: r.name || "—",
          stock: typeof r.stock === "number" ? r.stock : 0,
          sales: typeof r.sales === "number" ? r.sales : 0,
          profit: typeof r.profit === "number" ? r.profit : 0,
          stockShare: typeof r.stockShare === "number" ? r.stockShare : 0,
          salesShare: typeof r.salesShare === "number" ? r.salesShare : 0,
          profitShare: typeof r.profitShare === "number" ? r.profitShare : 0,
          lyCover: typeof r.lyCover === "number" ? r.lyCover : 0,
          turnover: typeof r.turnover === "number" ? r.turnover : 0,
          lyRevenue: typeof r.lyRevenue === "number" ? r.lyRevenue : (typeof r.sales === "number" && typeof r.lyFiyat === "number" ? r.sales * r.lyFiyat : 0),
          lyFiyat: typeof r.lyFiyat === "number" ? r.lyFiyat : 0,
          planPct: typeof r.planPct === "number" ? r.planPct : 0,
          planStock: typeof r.planStock === "number" ? r.planStock : 0,
          hedefCover: typeof r.hedefCover === "number" ? r.hedefCover : 0,
          salesBudget: typeof r.salesBudget === "number" ? r.salesBudget : 0,
          tyFiyat: typeof r.tyFiyat === "number" ? r.tyFiyat : 0,
          tyRevenue: typeof r.tyRevenue === "number" ? r.tyRevenue : 0,
          lfl: typeof r.lfl === "number" ? r.lfl : 0,
          rlfl: typeof r.rlfl === "number" ? r.rlfl : 0,
          stockGrowth: typeof r.stockGrowth === "number" ? r.stockGrowth : 0,
          tag: r.tag || "",
          action: r.action || "",
        });
      });
    });
    return flat;
  }

  // Satır geçer eğer HER kolonda kendi (görüntülenen) değeri o kolonun
  // dışlanan (unchecked) Set'inde DEĞİLSE. Boş/eksik Set = filtre yok.
  function rowPassesFilters(row) {
    return Object.keys(savedMixFilterState).every((key) => {
      const excluded = savedMixFilterState[key];
      if (!excluded || !excluded.size) return true;
      return !excluded.has(savedMixDisplayValue(row, key));
    });
  }

  // Sütun tanımları (key + başlık + genişlik) — hem thead hem colgroup hem
  // <tbody> render'ı bu TEK listeden beslenir. Genişlikler Canvas measureText
  // (600 11px "Segoe UI", ana tablodaki yöntem) + gerçek HIERARCHY/ORGS/REGIONS
  // taramasıyla ölçüldü; metrik kolonlar (stock→action) ana #grid'in colgroup'undaki
  // AYNI kolonlarla BİREBİR aynı (aynı veri tipi, tekrar ölçülmedi).
  const SAVED_MIX_COLUMNS = [
    { key: "savedAt", label: "Kayıt Zamanı", width: 120 },
    { key: "salesOrg", label: "Satış Teşkilatı", width: 68 },
    { key: "region", label: "Şube / Bölge", width: 164 },
    { key: "uh1", label: "ÜH1", width: 140 },
    { key: "uh2", label: "ÜH2", width: 240 },
    { key: "uh3", label: "ÜH3", width: 262 },
    { key: "name", label: "ÜH4", width: 260 },
    { key: "baseperiod", label: "Baz Periyot (LY)", width: 85 },
    { key: "targetperiod", label: "Hedef Periyot (TY)", width: 85 },
    { key: "stock", label: "Perakende Stok Adet", width: 77 },
    { key: "stockShare", label: "Perakende Stok Adet %", width: 77 },
    { key: "sales", label: "Perakende Satış Adet", width: 77 },
    { key: "salesShare", label: "Perakende Satış Adet %", width: 77 },
    { key: "profit", label: "Perakende Brüt Kar", width: 90 },
    { key: "profitShare", label: "Perakende Brüt Kar %", width: 77 },
    { key: "lyCover", label: "Stock Cover (Stok Ay)", width: 60 },
    { key: "turnover", label: "Turnover (Devir Hızı)", width: 69 },
    { key: "lyRevenue", label: "Perakende Satış Tutar (Ciro)", width: 103 },
    { key: "lyFiyat", label: "Perakende Ortalama Satış Fiyatı (LY)", width: 79 },
    { key: "planPct", label: "Gelecek Yıl Periyot Perakende Plan Stok %", width: 77 },
    { key: "planStock", label: "Gelecek Yıl Periyot Perakende Plan Stok Adet", width: 77 },
    { key: "hedefCover", label: "Hedef Stock Cover (Hedef Stok Ay)", width: 76 },
    { key: "salesBudget", label: "Perakende Satış Adet Bütçe", width: 77 },
    { key: "tyFiyat", label: "Perakende Ortalama Satış Fiyatı (TY)", width: 83 },
    { key: "tyRevenue", label: "Perakende Satış Bütçe Tutar (Ciro Bütçe)", width: 103 },
    { key: "lfl", label: "LFL(Like for like) Büyüme %", width: 65 },
    { key: "rlfl", label: "R-LFL Büyüme %", width: 65 },
    { key: "stockGrowth", label: "Stok Büyümesi", width: 73 },
    { key: "tag", label: "Durum", width: 110 },
    { key: "action", label: "Aksiyon", width: 210 },
  ];
  const SAVED_MIX_DELETE_COL_WIDTH = 60;

  // --- Excel AutoFilter tarzı checkbox dropdown (tek/paylaşılan panel) ---
  // document.body'ye BİR KEZ eklenir, hangi kolonun tıklandığına göre yeniden
  // doldurulup konumlanır — #savedMixList'in innerHTML rebuild'lerinden (ekleme/
  // silme) BAĞIMSIZ yaşar, bu yüzden thead/tbody yeniden kurulumu onu etkilemez.
  let savedMixDropdownEl = null;
  let savedMixDropdownKey = null;

  function updateSavedMixFilterIconState(key, btnEl) {
    const btn = btnEl || document.querySelector(`.saved-mix-filter-btn[data-filter-key="${key}"]`);
    if (!btn) return;
    const excluded = savedMixFilterState[key];
    btn.classList.toggle("is-active", !!(excluded && excluded.size));
  }

  function closeSavedMixDropdown() {
    if (savedMixDropdownEl) savedMixDropdownEl.style.display = "none";
    savedMixDropdownKey = null;
  }

  function positionSavedMixDropdown(panel, btnEl) {
    const btnRect = btnEl.getBoundingClientRect();
    panel.style.left = btnRect.left + "px";
    panel.style.top = (btnRect.bottom + 4) + "px";
    const panelRect = panel.getBoundingClientRect();
    if (panelRect.bottom > window.innerHeight) {
      panel.style.top = Math.max(4, btnRect.top - panelRect.height - 4) + "px";
    }
    if (panelRect.right > window.innerWidth) {
      panel.style.left = Math.max(4, window.innerWidth - panelRect.width - 4) + "px";
    }
  }

  function ensureSavedMixDropdown() {
    if (savedMixDropdownEl) return savedMixDropdownEl;
    const el = document.createElement("div");
    el.className = "saved-mix-filter-dropdown";
    el.style.display = "none";
    el.innerHTML = `
      <input type="text" class="saved-mix-filter-search" placeholder="Ara...">
      <div class="saved-mix-filter-actions">
        <button type="button" data-action="all">Tümünü Seç</button>
        <button type="button" data-action="none">Tümünü Kaldır</button>
      </div>
      <div class="saved-mix-filter-options"></div>
    `;
    document.body.appendChild(el);
    savedMixDropdownEl = el;

    // Arama SADECE checkbox listesindeki satırları görsel olarak daraltır —
    // tabloyu filtrelemez, dropdown'ı kapatmaz (odak kaybı hatasına düşmez,
    // çünkü checkbox'lar/inputlar yeniden kurulmuyor, sadece gizleniyor).
    el.querySelector(".saved-mix-filter-search").addEventListener("input", (e) => {
      const needle = normalizeSavedMixValue(e.target.value);
      el.querySelectorAll(".saved-mix-filter-option").forEach((opt) => {
        const match = !needle || normalizeSavedMixValue(opt.dataset.value).includes(needle);
        opt.style.display = match ? "" : "none";
      });
    });

    el.querySelector('[data-action="all"]').addEventListener("click", () => {
      if (!savedMixDropdownKey) return;
      savedMixFilterState[savedMixDropdownKey] = new Set();
      el.querySelectorAll('.saved-mix-filter-options input[type="checkbox"]').forEach((cb) => { cb.checked = true; });
      updateSavedMixFilterIconState(savedMixDropdownKey);
      renderSavedMixRows();
    });
    el.querySelector('[data-action="none"]').addEventListener("click", () => {
      if (!savedMixDropdownKey) return;
      savedMixFilterState[savedMixDropdownKey] = new Set(savedMixUniqueValues(savedMixDropdownKey));
      el.querySelectorAll('.saved-mix-filter-options input[type="checkbox"]').forEach((cb) => { cb.checked = false; });
      updateSavedMixFilterIconState(savedMixDropdownKey);
      renderSavedMixRows();
    });

    el.addEventListener("click", (e) => e.stopPropagation()); // dropdown içine tıklama dışarı sızıp kapatmasın
    document.addEventListener("click", () => closeSavedMixDropdown());
    document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeSavedMixDropdown(); });

    return el;
  }

  function openSavedMixDropdown(key, btnEl) {
    const el = ensureSavedMixDropdown();
    savedMixDropdownKey = key;
    const excluded = savedMixFilterState[key] instanceof Set ? savedMixFilterState[key] : new Set();
    const values = savedMixUniqueValues(key);

    el.querySelector(".saved-mix-filter-search").value = "";
    const optionsWrap = el.querySelector(".saved-mix-filter-options");
    optionsWrap.innerHTML = values.map((v) => `
      <label class="saved-mix-filter-option" data-value="${escapeAttribute(v)}">
        <input type="checkbox" value="${escapeAttribute(v)}" ${excluded.has(v) ? "" : "checked"}>
        <span>${escapeHtml(v)}</span>
      </label>
    `).join("");
    optionsWrap.querySelectorAll('input[type="checkbox"]').forEach((cb) => {
      cb.addEventListener("change", () => {
        const cur = savedMixFilterState[key] instanceof Set ? savedMixFilterState[key] : new Set();
        if (cb.checked) cur.delete(cb.value); else cur.add(cb.value);
        savedMixFilterState[key] = cur;
        updateSavedMixFilterIconState(key);
        renderSavedMixRows();
      });
    });

    el.style.display = "flex";
    positionSavedMixDropdown(el, btnEl);
  }

  function savedMixRowHtml(r) {
    return `
      <tr>
        <td>${escapeHtml(r.savedAt)}</td>
        <td>${escapeHtml(r.salesOrg)}</td>
        <td>${escapeHtml(r.region)}</td>
        <td>${escapeHtml(r.uh1)}</td>
        <td>${escapeHtml(r.uh2)}</td>
        <td>${escapeHtml(r.uh3)}</td>
        <td>${escapeHtml(r.name)}</td>
        <td>${escapeHtml(r.baseperiod)}</td>
        <td>${escapeHtml(r.targetperiod)}</td>
        <td>${fmtN(r.stock)}</td>
        <td>${fmtP(r.stockShare)}</td>
        <td>${fmtN(r.sales)}</td>
        <td>${fmtP(r.salesShare)}</td>
        <td>${fmtN(r.profit)}</td>
        <td>${fmtP(r.profitShare)}</td>
        <td>${fmtD(r.lyCover)}</td>
        <td>${fmtD2(r.turnover)}</td>
        <td>${fmtN(r.lyRevenue)}</td>
        <td>${fmtN(r.lyFiyat)}</td>
        <td>${fmtP(r.planPct)}</td>
        <td>${fmtN(r.planStock)}</td>
        <td>${fmtD(r.hedefCover)}</td>
        <td>${fmtN(r.salesBudget)}</td>
        <td>${fmtN(r.tyFiyat)}</td>
        <td>${fmtN(Math.round(r.salesBudget) * (r.tyFiyat || 0))}</td>
        <td class="${r.lfl >= 0 ? "up" : "down"}">${fmtP0(r.lfl)}</td>
        <td class="${r.rlfl >= 0 ? "up" : "down"}">${fmtP0(r.rlfl)}</td>
        <td class="${r.stockGrowth >= 0 ? "up" : "down"}">${fmtP0(r.stockGrowth)}</td>
        <td>${r.tag ? `<span class="badge ${r.tag === "Hızlı & Kârlı" ? "b-green" : r.tag === "Hızlı & Kârsız" ? "b-amber" : r.tag === "Yavaş & Kârlı" ? "b-blue" : "b-red"}">${escapeHtml(r.tag)}</span>` : "—"}</td>
        <td>${r.action ? `<span class="badge ${r.action.includes("Plan") ? "b-green" : r.action.includes("Fiyat") ? "b-amber" : r.action.includes("Stok") ? "b-red" : "b-blue"}">${escapeHtml(r.action)}</span>` : "—"}</td>
        <td><button type="button" class="btn ghost mini" data-delete-save="${escapeHtml(r.setId)}">Sil</button></td>
      </tr>
    `;
  }

  // Silme setId'ye göre çalışır — bir set'in HERHANGİ bir satırındaki "Sil"e
  // tıklanınca o set'in TÜM satırları (localStorage'daki tüm kaydı) kalkar.
  // Satır sayısı değişeceğinden (belki 0'a düşüp boş mesaja geçilecek) tam
  // renderSavedMixTable() çağırır.
  function bindSavedMixDeleteButtons(container) {
    container.querySelectorAll("[data-delete-save]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const id = btn.getAttribute("data-delete-save");
        const next = loadSavedMixSets().filter((item) => item.id !== id);
        saveSavedMixSets(next);
        renderSavedMixTable();
        updateSaveButtonState();
        renderToptanFromSaved(); // Kayıtlar değişti — Toptan Bütçe bundan besleniyor
        renderRollup();          // Özet/Rollup da Kayıtlar'dan besleniyor
      });
    });
  }

  // SADECE <tbody> içeriğini günceller — thead/filtre input'larına DOKUNMAZ,
  // bu yüzden filtre kutusuna yazarken input DOM'dan hiç silinmiyor, focus/
  // imleç konumu korunuyor. Filtre input'larının "input" olayı bunu çağırır.
  // NOT: filtre değişikliklerinin TEK hunisi burasıdır (dropdown'daki üç yol da
  // buraya iner), bu yüzden Toptan Bütçe tazelemesi de buraya bağlandı —
  // iki tablo aynı filtre durumunu paylaşıyor (bkz. computeToptanFromSaved).
  function renderSavedMixRows() {
    renderToptanFromSaved();
    renderToptanRollup();
    const list = $("savedMixList");
    if (!list) return;
    const tbody = list.querySelector(".saved-mix-table tbody");
    if (!tbody) return;
    const flat = buildFlatRows().filter(rowPassesFilters);
    tbody.innerHTML = flat.map(savedMixRowHtml).join("");
    bindSavedMixDeleteButtons(tbody);
  }

  // TABLO YAPISINI (colgroup, thead — başlık satırı + filtre ikon/butonları) kurar.
  // Sadece ilk açılışta ve kayıt ekleme/silme sonrası çağrılır (satır SAYISI
  // değişebilir); filtrelemede ÇAĞRILMAZ (bkz. renderSavedMixRows) — dropdown
  // içindeki checkbox'lar SADECE renderSavedMixRows()'u tetikler, thead bu
  // yüzden hiç yeniden kurulmaz, odak kaybı riski yok.
  // --- "Çalışılmış Bütçe ve Stok Karışım" tablosu: sütun genişliği sürükleme ---
  // Ana #grid'deki initColResize ile AYNI kullanıcı deneyimi (başlık kenarından
  // sürükle), ama AYRI bir uygulama: #grid'in makinesi modül seviyesindeki
  // gridCols/#grid/GRID_COLS_KEY'e sıkı bağlı. Ortak olan tek şey .col-resize-handle
  // CSS sınıfı. Bu tablo her filtre/kayıt değişiminde innerHTML ile YENİDEN kurulduğu
  // için genişlikler hem localStorage'dan colgroup'a basılır hem tutamaklar
  // render sonunda YENİDEN takılır (bkz. renderSavedMixTable sonu).
  const SAVED_MIX_COLS_KEY = "arpaz_saved_mix_col_widths";
  const SAVED_MIX_MIN_COL_WIDTH = 40;
  function savedMixDefaultWidths() {
    return SAVED_MIX_COLUMNS.map((c) => c.width).concat([SAVED_MIX_DELETE_COL_WIDTH]);
  }
  function loadSavedMixColWidths() {
    try {
      const raw = localStorage.getItem(SAVED_MIX_COLS_KEY);
      if (!raw) return null;
      const arr = JSON.parse(raw);
      const def = savedMixDefaultWidths();
      // Kolon seti değişmişse (kolon eklendi/çıkarıldı) eski kayıt GEÇERSİZ — varsayılana dön.
      if (!Array.isArray(arr) || arr.length !== def.length) return null;
      if (arr.some((n) => typeof n !== "number" || !isFinite(n) || n < SAVED_MIX_MIN_COL_WIDTH)) return null;
      return arr;
    } catch (e) {
      return null;
    }
  }
  function saveSavedMixColWidths(cols) {
    try {
      localStorage.setItem(SAVED_MIX_COLS_KEY, JSON.stringify(cols.map((c) => parseFloat(c.style.width))));
    } catch (e) { /* localStorage kullanılamıyorsa sessizce geç */ }
  }
  // CSS'te .saved-mix-table{width:100%;min-width:3286px} var — sabit min-width
  // sürüklemeyi yutar (tarayıcı artan/azalan farkı diğer kolonlara dağıtır).
  // Bu yüzden tablo genişliği colgroup toplamına EŞİTLENİR, min-width de aynı değere.
  function syncSavedMixTableWidth(table, cols) {
    const total = cols.reduce((a, c) => a + (parseFloat(c.style.width) || 0), 0);
    table.style.width = total + "px";
    table.style.minWidth = total + "px";
  }
  // İki satırlı donmuş başlık: 1. satır (kolon adları) top:0'da, 2. satır (filtre
  // düğmeleri) onun ALTINDA durmalı. `top` sabit yazılamaz — başlık yüksekliği
  // kolon genişliğine göre değişiyor (uzun etiketler sarınca satır uzuyor), bu
  // yüzden ÖLÇÜLÜR. Ana #grid'deki syncHeaderStickyOffset ile AYNI mantık.
  // Sütun sürükleme başlığı yeniden sardırabildiği için orada da çağrılır.
  function syncSavedMixHeaderOffset() {
    const row1 = document.querySelector(".saved-mix-table .saved-mix-header-row");
    const filterThs = document.querySelectorAll(".saved-mix-table .saved-mix-filter-row th");
    if (!row1 || !filterThs.length) return;
    const h = row1.getBoundingClientRect().height;
    filterThs.forEach((th) => { th.style.top = h + "px"; });
  }
  function initSavedMixColResize(list) {
    const table = list.querySelector(".saved-mix-table");
    if (!table) return;
    const cols = Array.from(table.querySelectorAll("colgroup col"));
    const ths = table.querySelectorAll(".saved-mix-header-row th");
    if (!cols.length || !ths.length) return;
    syncSavedMixTableWidth(table, cols);
    ths.forEach((th, i) => {
      if (i >= cols.length) return;
      const handle = document.createElement("span");
      handle.className = "col-resize-handle";
      handle.title = "Sürükleyerek genişliği ayarla · çift tıkla varsayılana dön";
      handle.addEventListener("mousedown", (e) => {
        e.preventDefault();
        e.stopPropagation(); // başlıktaki sıralama/filtre davranışlarına karışmasın
        const col = cols[i];
        const startX = e.clientX;
        const startWidth = parseFloat(col.style.width);
        handle.classList.add("dragging");
        function onMove(ev) {
          col.style.width = Math.max(SAVED_MIX_MIN_COL_WIDTH,
            Math.round(startWidth + (ev.clientX - startX))) + "px";
          syncSavedMixTableWidth(table, cols);
          syncSavedMixHeaderOffset(); // genişlik değişince başlık sarması, dolayısıyla yüksekliği değişebilir
        }
        function onUp() {
          document.removeEventListener("mousemove", onMove);
          document.removeEventListener("mouseup", onUp);
          handle.classList.remove("dragging");
          saveSavedMixColWidths(cols);
        }
        document.addEventListener("mousemove", onMove);
        document.addEventListener("mouseup", onUp);
      });
      // Çift tık: SADECE o kolonu varsayılan genişliğine döndürür (bu tablonun
      // #grid'deki gibi bir "Görünümü sıfırla" butonu yok, çıkış yolu bu).
      handle.addEventListener("dblclick", (e) => {
        e.preventDefault();
        e.stopPropagation();
        cols[i].style.width = savedMixDefaultWidths()[i] + "px";
        syncSavedMixTableWidth(table, cols);
        syncSavedMixHeaderOffset();
        saveSavedMixColWidths(cols);
      });
      th.appendChild(handle);
    });
  }
  function renderSavedMixTable() {
    const list = $("savedMixList");
    if (!list) return;
    closeSavedMixDropdown(); // olası açık dropdown eski th referansına yapışıp kalmasın
    const flat = buildFlatRows().filter(rowPassesFilters);

    if (!flat.length) {
      list.innerHTML = '<div class="saved-mix-empty">Henüz kaydedilmiş çalışma bulunmuyor.</div>';
      return;
    }

    // Kullanıcının sürükleyerek ayarladığı genişlikler varsa ONLAR, yoksa varsayılanlar.
    const colWidths = loadSavedMixColWidths() || savedMixDefaultWidths();
    const colgroupHtml = colWidths.map((w) => `<col style="width:${w}px">`).join("");

    const filterControls = SAVED_MIX_COLUMNS.map((col) => `
      <th>
        <button type="button" class="saved-mix-filter-btn" data-filter-key="${col.key}" title="Filtrele">▾</button>
      </th>
    `).join("") + "<th></th>";

    list.innerHTML = `
      <div class="saved-mix-table-wrap">
        <table class="saved-mix-table">
          <colgroup>${colgroupHtml}</colgroup>
          <thead>
            <tr class="saved-mix-header-row">
              ${SAVED_MIX_COLUMNS.map((col) => `<th>${escapeHtml(col.label)}</th>`).join("")}
              <th></th>
            </tr>
            <tr class="saved-mix-filter-row">
              ${filterControls}
            </tr>
          </thead>
          <tbody></tbody>
        </table>
      </div>
    `;

    list.querySelectorAll(".saved-mix-filter-btn").forEach((btn) => {
      const key = btn.dataset.filterKey;
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        if (savedMixDropdownKey === key && savedMixDropdownEl && savedMixDropdownEl.style.display !== "none") {
          closeSavedMixDropdown();
        } else {
          openSavedMixDropdown(key, btn);
        }
      });
      updateSavedMixFilterIconState(key, btn);
    });

    // Tablo her render'da sıfırdan kurulduğu için tutamaklar da yeniden takılır.
    initSavedMixColResize(list);
    syncSavedMixHeaderOffset(); // donmuş başlığın 2. satırı 1. satırın ALTINA otursun

    renderSavedMixRows();
  }
  // --- "Revize Et" eşleşmesi ---
  // Eşleşme anahtarı: Satış Teşkilatı + Şube/Bölge + ÜH1 + ÜH2 + ÜH3 + Baz Periyot +
  // Hedef Periyot — ÜH4 DAHİL DEĞİL (bir kayıt zaten o ÜH3'ün tüm ÜH4'lerini tutuyor).
  function currentDimensionKey() {
    return {
      salesOrg: ($("h_org") && $("h_org").value) || "",
      region: ($("h_region") && $("h_region").value) || "",
      uh1: state.sel.uh1 || "",
      uh2: state.sel.uh2 || "",
      uh3: state.sel.uh3 || "",
      baseperiod: ($("h_baseperiod") && $("h_baseperiod").value) || "",
      targetperiod: ($("h_targetperiod") && $("h_targetperiod").value) || "",
    };
  }
  function findMatchingSavedSet() {
    const cur = currentDimensionKey();
    return loadSavedMixSets().find((set) => {
      const d = set.dimensions || set.filters || {};
      return (d.salesOrg || "") === cur.salesOrg && (d.region || "") === cur.region &&
        (d.uh1 || "") === cur.uh1 && (d.uh2 || "") === cur.uh2 && (d.uh3 || "") === cur.uh3 &&
        (d.baseperiod || "") === cur.baseperiod && (d.targetperiod || "") === cur.targetperiod;
    }) || null;
  }
  // Kaydet/Revize Et butonunun metnini + notunu CANLI günceller — sidebar seçimi
  // (ÜH1/ÜH2/ÜH3/periyot) her değiştiğinde çağrılır (bkz. rebuild(), bind()).
  function updateSaveButtonState() {
    const btn = $("saveMixSetBtn");
    if (!btn) return;
    const note = $("saveMixSetNote");
    const match = findMatchingSavedSet();
    if (match) {
      btn.textContent = "Revize Et";
      if (note) note.textContent = `Bu grup için kayıt var: ${match.savedAt}`;
    } else {
      btn.textContent = "Kaydet";
      if (note) note.textContent = "";
    }
  }
  function saveCurrentMixSet() {
    // "Seçim yok" görünen kayıtların kök nedeni: bu beş boyuttan biri boşken
    // kaydediliyordu. Guard: hiçbiri boş olmadan kayıt oluşturulamaz.
    const salesOrg = ($("h_org") && $("h_org").value) || "";
    const region = ($("h_region") && $("h_region").value) || "";
    if (!salesOrg || !region || !state.sel.uh1 || !state.sel.uh2 || !state.sel.uh3) return;
    const payload = buildCurrentMixRecord();
    if (!payload.rows.length) return;
    const match = findMatchingSavedSet();
    const next = loadSavedMixSets();
    if (match) {
      // Revize Et: YENİ set eklenmez, aynı id korunarak eşleşen set'in içeriği
      // (rows/savedAt/dimensions vb.) YERİNDE üzerine yazılır — sırası değişmez.
      const idx = next.findIndex((s) => s.id === match.id);
      if (idx !== -1) next[idx] = { ...payload, id: next[idx].id };
      saveSavedMixSets(next);
    } else {
      next.unshift(payload);
      saveSavedMixSets(next.slice(0, 25));
    }
    renderSavedMixTable();
    updateSaveButtonState();
    renderToptanFromSaved(); // Kayıtlar değişti — Toptan Bütçe bundan besleniyor
    renderToptanRollup();    // Toptan tabındaki Özet/Rollup da güncellensin
    renderRollup();          // Özet/Rollup da Kayıtlar'dan besleniyor
  }

  // --- Sekme geçişi (hem navbar butonları hem programatik çağrı kullanır) ---
  // Ana tablo başlığındaki "Senaryo kaydet" butonu bunu çağırarak kullanıcıyı
  // Senaryo Karşılaştırma ekranına aktarır.
  function showTab(t) {
    syncSidebarVisibility(t);
    document.querySelectorAll(".tabs button").forEach((x) =>
      x.classList.toggle("active", x.dataset.tab === t));
    document.querySelectorAll(".tabpane").forEach((p) =>
      (p.style.display = p.dataset.pane === t ? "" : "none"));
    if (t === "kayitlar") {
      renderRollup();               // sekme açılınca Kayıtlar'ın GÜNCEL hali
      syncSavedMixHeaderOffset();   // ZORUNLU: tablo sekme GİZLİyken render edildiyse
                                    // başlık yüksekliği 0 ölçülür, filtre satırı
                                    // başlığın üstüne biner (Toptan'dakiyle aynı tuzak)
    }
    if (t === "revize") renderRevizeSets();
    if (t === "sop") renderSop();
    // Tahmin SADECE sekme açılınca render edilir: Chart.js gizli (display:none)
    // bir kapsayıcıda canvas'ı 0x0 ölçer ve grafik boş çıkar. Aynı tuzağın
    // tablo başlığı sürümü için bkz. syncToptanHeaderOffset.
    if (t === "forecast") renderForecast();
    if (t === "toptan") {
      renderToptanFromSaved(); // sekme her açıldığında Kayıtlar'ın GÜNCEL halini yansıt
      renderToptanRollup();
      syncToptanHeaderOffset(); // sekme az önce görünür oldu, gizliyken 0 ölçülen yükseklik şimdi düzeltilir
    }
  }

  // Sidebar SADECE "Bütçe & Stok Karışımı" ekranında görünür — diğer sekmeler
  // (Perakende/Toptan Bütçe, Takvim, Metodoloji, Senaryo) ya kayıtlı veriden
  // beslenir ya statiktir, seçimi orada göstermek yanıltıcı olurdu.
  // .side sabit 240px bir flex item; gizlenince .main (flex:1) genişliği
  // kendiliğinden alır, ek bir genişlik hesabı GEREKMEZ.
  // --- Sidebar aç/kapa (kullanıcı kaynaklı, sekme kaynaklı gizlemeden AYRI) ---
  // Filtreler bir kez ayarlandıktan sonra kullanıcı barı kapatıp ekranı
  // genişletebilsin diye. Tercih localStorage'da tutulur — her açılışta yeniden
  // kapatmak zorunda kalmasın. Sekme kaynaklı gizleme (.side-hidden) bundan
  // BAĞIMSIZDIR; ikisi aynı anda geçerli olabilir.
  const SIDE_COLLAPSE_KEY = "arpaz_side_collapsed";
  function applySidebarCollapsed(collapsed) {
    const wrap = document.querySelector(".wrap");
    const btn = $("sideToggle");
    if (!wrap || !btn) return;
    wrap.classList.toggle("side-collapsed", collapsed);
    btn.textContent = collapsed ? "›" : "‹";
    btn.setAttribute("aria-expanded", collapsed ? "false" : "true");
    // Kapalıyken kullanıcı seçimi göremez (#selInfo bar'ın içinde) — o yüzden
    // güncel seçim tooltip'e taşınır.
    btn.title = collapsed
      ? "Filtreleri göster — " + (($("selInfo") && $("selInfo").textContent) || "")
      : "Filtreleri gizle";
  }
  function initSidebarToggle() {
    const btn = $("sideToggle");
    if (!btn) return;
    let collapsed = false;
    try { collapsed = localStorage.getItem(SIDE_COLLAPSE_KEY) === "1"; } catch (e) { /* geç */ }
    applySidebarCollapsed(collapsed);
    btn.addEventListener("click", () => {
      const next = !document.querySelector(".wrap").classList.contains("side-collapsed");
      applySidebarCollapsed(next);
      try { localStorage.setItem(SIDE_COLLAPSE_KEY, next ? "1" : "0"); } catch (e) { /* geç */ }
    });
  }

  // Sidebar iki sekmede görünür: "miks" (bütçe kaskadı) ve "sop" (S&OP kaskadı).
  // Tek .side kabuğu, içinde iki blok — ikinci bir <aside> layout'u bozardı.
  // Sidebar ÜÇ sekmede görünür ve her birinin KENDİ bloğu vardır:
  // "miks" (bütçe kaskadı) · "sop" (S&OP kaskadı) · "forecast" (tahmin kaskadı).
  // Bloklar birbirini dışlar — aynı anda yalnızca biri açıktır.
  function syncSidebarVisibility(tab) {
    const wrap = document.querySelector(".wrap");
    const bloklar = { miks: "miksSideBlock", sop: "sopSideBlock", forecast: "forecastSideBlock" };
    const sidebarliSekme = Object.prototype.hasOwnProperty.call(bloklar, tab);
    if (wrap) wrap.classList.toggle("side-hidden", !sidebarliSekme);
    Object.keys(bloklar).forEach((k) => {
      const el = $(bloklar[k]);
      if (el) el.style.display = (k === tab) ? "" : "none";
    });
  }

  // --- Senaryo yönetimi ---
  let scenarios = [];
  function currentScenario() {
    const p = readParams();
    const m = computeModel(p, state.covers, state.tyFiyat);
    return { p, budget: m.T.salesBudget, planStock: m.T.planStock, lfl: m.T.lfl };
  }
  // Mevcut parametre setini senaryo olarak ekler. name boş/verilmemişse
  // otomatik "Senaryo N" adı verilir (başlıktaki buton bu yolu kullanır).
  function addScenario(name) {
    const s = currentScenario();
    s.name = (name || "").trim() || "Senaryo " + (scenarios.length + 1);
    scenarios.push(s);
    renderScenarios();
    return s;
  }
  function renderScenarios() {
    const tb = $("scRows"); tb.innerHTML = "";
    // Kayıt yokken tabloyu (dolayısıyla başlık şeridini) tamamen gizle, yerine
    // ince gri bilgi satırını göster (bkz. styles.css .sc-empty).
    const wrap = $("scTableWrap"), empty = $("scEmpty");
    if (wrap) wrap.style.display = scenarios.length ? "block" : "none";
    if (empty) empty.style.display = scenarios.length ? "none" : "block";
    scenarios.forEach((s, i) => {
      const p = s.p;
      const campF = CAMP.reduce((a, k) => a * (1 + p.camp[k] / 100), 1) * (1 + p.pazar / 100);
      const tr = document.createElement("tr");
      tr.innerHTML = `<td class="sc-name" data-name="${i}" contenteditable="true" spellcheck="false" title="Yeniden adlandırmak için tıkla">${s.name}</td><td>${p.stokBuyume}%</td><td>${p.pazar}%</td>
        <td>${p.wKar}/${p.wSatis}/${p.wStok}</td><td>${fmtX(campF)}</td>
        <td>${fmtN(s.budget)}</td><td>${fmtN(s.planStock)}</td>
        <td class="${s.lfl >= 0 ? "up" : "down"}">${fmtP0(s.lfl)}</td>
        <td><button class="btn ghost mini" data-del="${i}">sil</button></td>`;
      tb.appendChild(tr);
    });
    if (scenarios.length >= 2) {
      const best = scenarios.reduce((a, b) => (b.lfl > a.lfl ? b : a));
      [...tb.rows].forEach((r, i) => { if (scenarios[i] === best) r.style.background = "var(--greenbg)"; });
    }
    tb.querySelectorAll("[data-del]").forEach((x) => {
      x.onclick = () => { scenarios.splice(+x.dataset.del, 1); renderScenarios(); };
    });
    // Senaryo adı yeniden adlandırma: Enter onaylar, blur yazar. Boş bırakılırsa
    // eski ada geri döner (isimsiz satır olmasın).
    tb.querySelectorAll(".sc-name").forEach((c) => {
      c.onkeydown = (e) => { if (e.key === "Enter") { e.preventDefault(); c.blur(); } };
      c.onblur = () => {
        const i = +c.dataset.name, v = c.textContent.trim();
        if (v) { scenarios[i].name = v; } else { c.textContent = scenarios[i].name; }
      };
    });
  }

  // --- Takvim / Rasyo / Forecast ---
  // ==========================================================================
  // S&OP PLANLAMA — SKU × Ay toptan (sell-in) tahmini
  // --------------------------------------------------------------------------
  // Pazarlama'nın SAP IBP'ye gireceği plan. MVP: assets/sop_sku_data.js.
  // BÖLGE YOKTUR (org × ÜH1-4 × SKU) — S&OP ulusal seviyede planlanır.
  //
  // Girilen S&OP adetleri, Lead Time değişiklikleri ve Gerçekleşen değerleri
  // BELLEKTE tutulur (localStorage YOK), sayfa yenilenince sıfırlanır. Bu ekran
  // hiçbir bütçe state'ini/formülünü BESLEMEZ; Toptan Bütçe kayıtlarını yalnızca
  // OKUR (karşılaştırma rozeti için).
  // ==========================================================================
  const SOP_AY_ADI = ["Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran",
    "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"];
  const SOP_YIL = 2026; // Plan yılı — pencere SABİT: 2026 Ocak → 2026 Aralık
  const sopState = {
    sop: new Map(),        // "kimlik␟2026-09" → adet
    gerceklesen: new Map(),// "kimlik␟2026-09" → adet
    leadTime: new Map(),   // "kimlik" → ay (kullanıcı değiştirebilir)
    tohumlanan: new Set(), // otomatik başlangıç değeri BASILMIŞ seçimler (bkz. sopTohumla)
    gerceklesenAcik: false,
  };
  function sopVeri() {
    return (typeof SOP_SKU_DATA !== "undefined" && Array.isArray(SOP_SKU_DATA)) ? SOP_SKU_DATA : [];
  }
  // SKU adı TEK BAŞINA anahtar DEĞİLDİR: veri dosyasında her ÜH4'ün kendi
  // "SKU-1/2/3"ü var (1929 kayıt, 3 ayrı ad). Sadece r.sku ile anahtarlanırsa
  // bir ÜH4'e girilen adet/lead time DİĞER TÜM ÜH4'lere sızar. Bu yüzden
  // state anahtarı HER ZAMAN tam kimliktir — yeni bir state haritası eklerken
  // de r.sku değil sopKimlik(r) kullan.
  function sopKimlik(r) {
    return [r.org, r.uh1, r.uh2, r.uh3, r.uh4, r.sku].join("␟");
  }
  function sopAnahtar(kimlik, ay) { return kimlik + "␟" + ay; }

  // TAKVİM YILI penceresi — SABİT 2026 Ocak → 2026 Aralık.
  // (Eskiden "veri dosyasındaki son aydan sonraki 12 ay" şeklinde İLERLEYEN bir
  // pencereydi; kullanıcı kararıyla takvim yılına sabitlendi. Plan yılı değişince
  // SOP_YIL'i güncelle, başka yer DEĞİŞMEZ.)
  function sopPencere() {
    const out = [];
    for (let m = 1; m <= 12; m++) {
      out.push({ key: SOP_YIL + "-" + String(m).padStart(2, "0"), yil: SOP_YIL, ayNo: m,
        etiket: SOP_AY_ADI[m - 1], uzun: SOP_YIL + " " + SOP_AY_ADI[m - 1] });
    }
    return out;
  }
  // Veride GERÇEK rakamı bulunan EN SON ay (bu veri setinde "2026-08").
  // Elle 8'e sabitlenmedi: veri dosyasına 9. ay eklenince tablo kendiliğinden
  // o ayı da "Gerçekleşen" olarak salt-okunur gösterir.
  function sopSonGercekAy() {
    let son = "";
    sopVeri().forEach((r) => Object.keys(r.aylar || {}).forEach((a) => { if (a > son) son = a; }));
    return son;
  }
  // Dondurma penceresinin BAŞLANGICI: gerçek takvimde bulunduğumuz ay.
  // Pencere dışındaysak (2026'dan önce/sonra) sırasıyla başa/sona kırpılır.
  function sopBugunIndeks(aylar) {
    const d = new Date();
    const key = d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0");
    const i = aylar.findIndex((a) => a.key === key);
    if (i >= 0) return i;
    if (!aylar.length) return 0;
    return key < aylar[0].key ? 0 : aylar.length;
  }
  function sopSecim() {
    const al = (id) => { const el = $(id); return el ? el.value : ""; };
    return { org: al("s_org"), uh1: al("s_uh1"), uh2: al("s_uh2"), uh3: al("s_uh3"), uh4: al("s_uh4") };
  }
  // Kaskad: her seviye kendinden ÖNCEKİ seçimlerle daraltılmış kümeden üretilir.
  // ÜH3/ÜH4 seçimi ZORUNLUdur ("Tümü" YOK) — proje kuralı (CLAUDE.md Bölüm 4).
  function sopKaskadDoldur() {
    const veri = sopVeri();
    if (!veri.length) return;
    const seviyeler = [
      { id: "s_org", key: "org" }, { id: "s_uh1", key: "uh1" }, { id: "s_uh2", key: "uh2" },
      { id: "s_uh3", key: "uh3" }, { id: "s_uh4", key: "uh4" },
    ];
    let havuz = veri;
    seviyeler.forEach((s) => {
      const el = $(s.id);
      if (!el) return;
      const degerler = Array.from(new Set(havuz.map((r) => r[s.key])))
        .filter(Boolean).sort((a, b) => String(a).localeCompare(String(b), "tr"));
      const gecerli = degerler.includes(el.value) ? el.value : (degerler[0] || "");
      el.innerHTML = degerler.map((v) => '<option value="' + escapeAttribute(v) + '">' + escapeHtml(v) + "</option>").join("");
      el.value = gecerli;
      havuz = havuz.filter((r) => r[s.key] === gecerli);
    });
  }
  function sopSatirlar() {
    const s = sopSecim();
    return sopVeri().filter((r) => r.org === s.org && r.uh1 === s.uh1 &&
      r.uh2 === s.uh2 && r.uh3 === s.uh3 && r.uh4 === s.uh4);
  }
  function sopLeadTime(r) {
    const k = sopKimlik(r);
    return sopState.leadTime.has(k) ? sopState.leadTime.get(k) : (Number(r.leadTimeAy) || 0);
  }
  function sopDeger(harita, kimlik, ay) {
    const v = harita.get(sopAnahtar(kimlik, ay));
    return v == null ? null : v;
  }

  // --- Yıl Sonu Toptan Hedefi + Eylül-Aralık otomatik başlangıç değeri ---
  // BASİT YILLIKLANDIRMA — mevsimsel çarpan YOK (kullanıcı kararı):
  //   Yıl Sonu Hedefi = Gerçekleşen(Ocak-Ağustos) × 12 / 8
  //   Kalan Adet      = Yıl Sonu Hedefi − Gerçekleşen
  // 12 ve 8 elle SABİTLENMEDİ: 8 = veride gerçek rakamı olan ay sayısı,
  // 12 = pencere uzunluğu. Veri dosyasına 9. ay eklenince oran kendiliğinden
  // 12/9 olur (bkz. sopSonGercekAy).
  function sopYilSonuHedefi(satirlar, aylar, gercekMi) {
    const gercekAylar = aylar.filter(gercekMi);
    const gercek = satirlar.reduce((acc, r) => acc +
      gercekAylar.reduce((s, a) => s + (Number((r.aylar || {})[a.key]) || 0), 0), 0);
    if (!gercekAylar.length || gercek <= 0) return { yilSonuHedef: 0, kalanAdet: 0, gercek };
    const yilSonuHedef = Math.round(gercek * aylar.length / gercekAylar.length);
    return { yilSonuHedef, kalanAdet: yilSonuHedef - gercek, gercek };
  }

  // `toplam`ı `agirliklar` oranında TAM SAYILARA böler ve toplamı BİREBİR korur
  // (en büyük artık yöntemi). Ağırlıkların hepsi 0 ise EŞİT bölünür.
  function sopBol(toplam, agirliklar) {
    const n = agirliklar.length;
    if (!n) return [];
    const tw = agirliklar.reduce((x, y) => x + y, 0);
    const oran = tw > 0 ? agirliklar.map((w) => w / tw) : agirliklar.map(() => 1 / n);
    const ham = oran.map((o) => toplam * o);
    const taban = ham.map((h) => Math.floor(h));
    let artik = toplam - taban.reduce((x, y) => x + y, 0);
    // Kesirli kısmı en büyük olanlara birer birer dağıt.
    const sira = ham.map((h, i) => ({ i, kesir: h - Math.floor(h) }))
      .sort((a, b) => b.kesir - a.kesir);
    for (let j = 0; artik > 0 && j < sira.length; j++, artik--) taban[sira[j].i] += 1;
    return taban;
  }

  // SKU'ların Ocak-Ağustos (gerçekleşen) toplamları — dağıtım ağırlığı.
  // Tek SKU'nun kendi geçmişine göre değil, ÜH4 toplamına göre pay verilir
  // (kullanıcı kararı); bu dizi sopBol'a ham adet olarak geçer, sopBol zaten
  // kendi içinde orana çevirir.
  function sopSkuAgirlik(satirlar, gercekAylar) {
    return satirlar.map((r) =>
      gercekAylar.reduce((s, a) => s + (Number((r.aylar || {})[a.key]) || 0), 0));
  }

  // `toplam`ı önce ay kümesine EŞİT, sonra ay içinde SKU'lara `skuAgirlik`
  // oranında böler. Dönüş: { "2026-01": [sku0Payı, sku1Payı, ...], ... }
  // Her iki kademe de sopBol kullandığı için toplam BİREBİR korunur.
  // Ocak-Ağustos "Plan" referansı ile Eylül-Aralık başlangıç değeri BU TEK
  // fonksiyondan üretilir — iki ayrı hesap yolu AÇMA.
  function sopPlanDagit(toplam, aylarListesi, skuAgirlik) {
    const out = {};
    if (!aylarListesi.length || toplam <= 0) return out;
    const aylikPay = sopBol(toplam, aylarListesi.map(() => 1));
    aylarListesi.forEach((a, ai) => { out[a.key] = sopBol(aylikPay[ai], skuAgirlik); });
    return out;
  }

  // Ocak-Ağustos'un "Plan" referansı — SALT GÖSTERİM, hiçbir state'e yazılmaz.
  // Aylık plan = Yıl Sonu Hedefi / 12. Burada `gercek` toplamı 8 aya bölünüyor;
  // bu AYNI sayıdır çünkü hedef = gercek × 12/8 ⇒ hedef/12 = gercek/8. Tamsayıya
  // bölmeyi `gercek` üzerinden yapmak ayrıca şunu garanti eder:
  //   Ocak-Ağustos planı (= gercek) + Eylül-Aralık planı (= kalanAdet) = Hedef.
  function sopGercekAyPlani(satirlar, aylar, gercekMi) {
    const gercekAylar = aylar.filter(gercekMi);
    const { gercek } = sopYilSonuHedefi(satirlar, aylar, gercekMi);
    return sopPlanDagit(gercek, gercekAylar, sopSkuAgirlik(satirlar, gercekAylar));
  }

  // Eylül-Aralık kutularına BAŞLANGIÇ değeri basar (aynı dağıtım mantığı).
  // Kutular EDİTABLE kalır; bu yalnızca başlangıç değeridir.
  // Seçim başına BİR KEZ çalışır (sopState.tohumlanan): kullanıcının sildiği
  // hücre her render'da geri gelmesin, ÜH4'ler arasında gidip gelmek de
  // girilen değerleri EZMESİN. "Girişleri Temizle" bu işareti sıfırlar.
  function sopTohumla(satirlar, aylar, gercekMi) {
    if (!satirlar.length) return;
    const isaret = sopKimlik(satirlar[0]);
    if (sopState.tohumlanan.has(isaret)) return;
    sopState.tohumlanan.add(isaret);

    const { kalanAdet } = sopYilSonuHedefi(satirlar, aylar, gercekMi);
    const planAylar = aylar.filter((a) => !gercekMi(a));
    if (kalanAdet <= 0 || !planAylar.length) return;

    const skuAgirlik = sopSkuAgirlik(satirlar, aylar.filter(gercekMi));
    const dagilim = sopPlanDagit(kalanAdet, planAylar, skuAgirlik);
    planAylar.forEach((a) => {
      const paylar = dagilim[a.key] || [];
      satirlar.forEach((r, ri) => {
        const k = sopAnahtar(sopKimlik(r), a.key);
        if (sopState.sop.has(k)) return;   // kullanıcı girdisini EZME
        if (paylar[ri] > 0) sopState.sop.set(k, paylar[ri]);
      });
    });
  }

  // KALDIRILDI (kapsam dışı) — TOPLAM satırındaki "Toptan Bütçe karşılaştırma
  // rozeti". Burada bir `sopToptanKayit()` + `sopKarsilastirmaRozeti()` ikilisi
  // vardı: onaylanmış Toptan Bütçe kayıtlarını (arpaz_toptan_revize_setleri) aynı
  // org + ÜH1-4 + Hedef Periyot için toplayıp %20 sapma eşiğiyle ✓/⚠ basıyordu.
  // Kayıtlardaki Hedef Periyot HER ZAMAN gelecek yılı (2027) gösteriyor; S&OP
  // penceresi ise artık 2026 takvim yılına sabit — eşleşme hiçbir zaman olmaz,
  // rozet kalıcı olarak "—" kalırdı. Gerçek 2026 toptan bütçesi eklendiğinde
  // (aynı yılı hedefleyen kayıtlar) bu karşılaştırma geri getirilebilir; o zaman
  // sopNorm() (tr-TR BÜYÜK harf normalizasyonu) da yeniden gerekecek — ham
  // string karşılaştırması 339 ÜH4'ün yalnızca 3'ünü eşleştiriyordu.

  function renderSopReferans(satirlar) {
    const el = $("sopReferansIcerik");
    if (!el) return;
    const tumAylar = Array.from(new Set(sopVeri().flatMap((r) => Object.keys(r.aylar || {})))).sort();
    const son3 = tumAylar.slice(-3);
    if (!satirlar.length || !son3.length) { el.innerHTML = '<div class="note">Referans veri yok.</div>'; return; }
    el.innerHTML = '<table class="sop-ref-table"><thead><tr><th>SKU</th>' +
      son3.map((a) => "<th>" + escapeHtml(a) + "</th>").join("") +
      "<th>Son 3 Ay Ort.</th></tr></thead><tbody>" +
      satirlar.map((r) => {
        const vals = son3.map((a) => Number((r.aylar || {})[a]) || 0);
        const ort = vals.reduce((x, y) => x + y, 0) / vals.length;
        return "<tr><td>" + escapeHtml(r.sku) + "</td>" +
          vals.map((v) => '<td class="num-cell">' + fmtN(v) + "</td>").join("") +
          '<td class="num-cell toptan-highlight">' + fmtD(ort) + "</td></tr>";
      }).join("") + "</tbody></table>" +
      '<div class="note" style="margin-top:8px">Bu değerler GEÇMİŞTİR ve yalnızca referanstır — S&OP hücrelerini otomatik doldurmaz.</div>';
  }

  function renderSop() {
    const tbody = $("sopRows");
    if (!tbody) return;
    sopKaskadDoldur();
    const aylar = sopPencere();
    const satirlar = sopSatirlar();
    const sayac = $("sopSayac");
    if (sayac) sayac.textContent = fmtN(satirlar.length) + " SKU · " + (aylar.length ? aylar[0].uzun + " → " + aylar[aylar.length - 1].uzun : "—");
    renderSopReferans(satirlar);

    const sonGercek = sopSonGercekAy();
    const gercekMi = (a) => !!sonGercek && a.key <= sonGercek;
    const donmaBas = sopBugunIndeks(aylar);
    sopTohumla(satirlar, aylar, gercekMi); // plan aylarına başlangıç değeri (bir kez)
    const bilgi = $("sopDagitBilgi");
    if (bilgi) bilgi.style.display = sopState.gerceklesenAcik ? "" : "none";

    // Her SKU İKİ satır: A = Gerçekleşen, B = Plan / S&OP. SKU/Kaynak/Lead Time
    // hücreleri rowspan=2 ile bu iki satırı kapsar. 4. sabit kolon satır
    // etiketidir — kolon sayısı değişirse SOP_SABIT_KOLON'u güncelle (thead,
    // tfoot, hedef satırı ve boş-veri colspan'i buradan besleniyor).
    const SOP_SABIT_KOLON = 4;
    const head = $("sopHeadRow");
    if (head) {
      head.innerHTML = "<th>SKU</th><th>Kaynak</th><th>Lead Time (Ay)</th><th class=\"sop-th-etiket\"></th>" +
        aylar.map((a) => '<th' + (gercekMi(a) ? ' class="sop-th-gercek" title="Gerçekleşen ay — gerçek veri, düzenlenemez"' : "") + ">" +
          a.etiket + "<br><span class=\"sop-yil\">" + a.yil + "</span></th>").join("");
    }
    const hedefRow = $("sopHedefRow");
    if (!satirlar.length) {
      tbody.innerHTML = '<tr><td colspan="' + (SOP_SABIT_KOLON + aylar.length) + '" style="text-align:center;color:var(--grey);padding:18px">Bu seçim için SKU bulunamadı.</td></tr>';
      $("sopFoot").innerHTML = "";
      if (hedefRow) hedefRow.innerHTML = "";
      return;
    }

    const gercekAylar = aylar.filter(gercekMi);
    const planAylar = aylar.filter((a) => !gercekMi(a));
    // Hedef / Gerçekleşen / Kalan — HEPSİ sopYilSonuHedefi()'nden, yeniden
    // hesap YOK. Ay aralığı etiketleri de elle yazılmaz, dizilerden türer.
    if (hedefRow) {
      const { yilSonuHedef, kalanAdet, gercek } = sopYilSonuHedefi(satirlar, aylar, gercekMi);
      const aralik = (l) => (l.length ? l[0].etiket + "-" + l[l.length - 1].etiket : "—");
      const aylikKalan = planAylar.length
        ? (kalanAdet / planAylar.length).toLocaleString("tr-TR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })
        : "—";
      hedefRow.innerHTML = '<td class="sop-hedef" colspan="' + (SOP_SABIT_KOLON + aylar.length) + '">' +
        '<span class="sop-hedef-kalem">Yıl Sonu Toptan Hedefi: <b>' + fmtN(yilSonuHedef) + "</b> adet</span>" +
        '<span class="sop-hedef-kalem">' + aralik(gercekAylar) + " Gerçekleşen Toplam: <b>" + fmtN(gercek) + "</b> adet</span>" +
        '<span class="sop-hedef-kalem">Kalan (' + aralik(planAylar) + " için): <b>" + fmtN(kalanAdet) +
          "</b> adet → Aylık: <b>" + aylikKalan + "</b> adet</span></td>";
    }

    // Ocak-Ağustos "Plan" referansı — render başına BİR KEZ hesaplanır.
    const gercekAyPlani = sopGercekAyPlani(satirlar, aylar, gercekMi);

    tbody.innerHTML = satirlar.map((r, i) => {
      const kimlik = sopKimlik(r);
      const lt = sopLeadTime(r);
      const altSinif = i % 2 ? " sop-alt" : "";   // şerit SKU BAŞINA (satır başına değil)

      // --- Satır A: GERÇEKLEŞEN ---
      const gercekHucreler = aylar.map((a, ai) => {
        if (gercekMi(a)) {
          const gercek = Number((r.aylar || {})[a.key]) || 0;
          return '<td class="sop-ay sop-gercek" title="Gerçekleşen — ' + escapeAttribute(a.uzun) + ' gerçek toptan adedi (düzenlenemez)">' +
            '<span class="sop-gercek-deger">' + fmtN(gercek) + "</span></td>";
        }
        // Plan ayında gerçekleşen ELLE girilir. Toggle kapalıyken girdi yerine
        // düz metin (değer yoksa "—") gösterilir — satır her zaman durur.
        const donmus = ai >= donmaBas && ai < donmaBas + lt;
        const sopV = sopDeger(sopState.sop, kimlik, a.key);
        const gerV = sopDeger(sopState.gerceklesen, kimlik, a.key);
        const fark = (gerV != null && sopV != null) ? (gerV - sopV) : null;
        if (!sopState.gerceklesenAcik) {
          return '<td class="sop-ay' + (donmus ? " sop-frozen" : "") + '">' +
            '<span class="sop-ger-metin">' + (gerV != null ? fmtN(gerV) : "—") + "</span></td>";
        }
        return '<td class="sop-ay' + (donmus ? " sop-frozen" : "") + '">' +
          '<input type="text" inputmode="numeric" class="sop-in sop-gerin" data-k="' + escapeAttribute(kimlik) + '" data-ay="' + a.key + '" ' +
          'value="' + (gerV != null ? fmtN(gerV) : "") + '" placeholder="gerç." title="Gerçekleşen (elle girilir)">' +
          (fark ? '<button type="button" class="btn ghost mini sop-dagit" data-k="' + escapeAttribute(kimlik) + '" data-ay="' + a.key + '" ' +
            'title="Fark ' + (fark > 0 ? "+" : "") + fmtN(fark) + ' adet. Yıl toplamı sabit kalsın diye kalan (dondurulmamış) aylardan mevcut S&OP ağırlıklarına orantılı olarak düşülür/eklenir.">Dağıt</button>' : "") +
          "</td>";
      }).join("");

      // --- Satır B: PLAN / S&OP ---
      const planHucreler = aylar.map((a, ai) => {
        if (gercekMi(a)) {
          // Türetilmiş plan referansı — SALT-OKUNUR, state'e yazılmaz.
          const planV = (gercekAyPlani[a.key] || [])[i] || 0;
          return '<td class="sop-ay sop-gercek" title="Plan (türetilmiş) — Yıl Sonu Hedefi ÷ ' + aylar.length + ', SKU payına göre">' +
            '<span class="sop-plan-deger">' + fmtN(planV) + "</span></td>";
        }
        // Dondurma penceresi: BUGÜNden (gerçek takvim ayı) lead time kadar ileri.
        const donmus = ai >= donmaBas && ai < donmaBas + lt;
        const sopV = sopDeger(sopState.sop, kimlik, a.key);
        return '<td class="sop-ay' + (donmus ? " sop-frozen" : "") + '"' +
          (donmus ? ' title="Dondurma penceresi — değiştirilebilir ama tedarik zincirine geç haber olabilir"' : "") + ">" +
          (donmus ? '<span class="sop-kilit">🔒</span>' : "") +
          '<input type="text" inputmode="numeric" class="sop-in sop-sop" data-k="' + escapeAttribute(kimlik) + '" data-ay="' + a.key + '" ' +
          'value="' + (sopV != null ? fmtN(sopV) : "") + '" placeholder="0"></td>';
      }).join("");

      return '<tr class="sop-grup-bas' + altSinif + '">' +
          '<td rowspan="2">' + escapeHtml(r.sku) + "</td>" +
          '<td rowspan="2"><span class="badge ' + (r.kaynak === "Outsource" ? "b-blue" : "b-grey") + '">' + escapeHtml(r.kaynak) + "</span></td>" +
          '<td class="sop-lt" rowspan="2"><input type="number" class="sop-ltin" data-k="' + escapeAttribute(kimlik) + '" min="0" max="12" step="1" value="' + lt + '" ' +
            'title="Lead Time (ay) — tedarik değişince değişebilir. Dondurma penceresinin genişliğini belirler."></td>' +
          '<td class="sop-satir-etiket">Gerçekleşen</td>' + gercekHucreler +
        "</tr>" +
        '<tr class="' + altSinif.trim() + '">' +
          '<td class="sop-satir-etiket sop-satir-etiket-plan">Plan / S&amp;OP</td>' + planHucreler +
        "</tr>";
    }).join("");

    // TOPLAM — gerçekleşen aylarda gerçek verinin, plan aylarında girilen
    // S&OP adetlerinin toplamı. (Toptan Bütçe karşılaştırma rozeti KALDIRILDI,
    // gerekçe yukarıdaki blok yorumunda.)
    const foot = $("sopFoot");
    if (foot) {
      foot.innerHTML = "<td>TOPLAM</td><td>—</td><td>—</td><td>—</td>" + aylar.map((a) => {
        const g = gercekMi(a);
        const toplam = satirlar.reduce((acc, r) => acc +
          (g ? (Number((r.aylar || {})[a.key]) || 0) : (sopDeger(sopState.sop, sopKimlik(r), a.key) || 0)), 0);
        return '<td class="sop-ay' + (g ? " sop-gercek" : "") + '"><div class="sop-toplam">' + fmtN(toplam) + "</div></td>";
      }).join("");
    }
    bindSopInputs();
  }

  function bindSopInputs() {
    const tbody = $("sopRows");
    if (!tbody) return;
    const yaz = (harita, kimlik, ay, ham) => {
      const k = sopAnahtar(kimlik, ay);
      if (String(ham).trim() === "") harita.delete(k);
      else {
        const v = parseToptanAdet(ham); // tr-TR binlik ayracını temizler
        if (v == null || v < 0) return false;
        harita.set(k, v);
      }
      return true;
    };
    tbody.querySelectorAll("input.sop-sop").forEach((inp) => {
      inp.addEventListener("change", () => { yaz(sopState.sop, inp.dataset.k, inp.dataset.ay, inp.value); renderSop(); });
      inp.addEventListener("keydown", (e) => { if (e.key === "Enter") inp.blur(); });
    });
    tbody.querySelectorAll("input.sop-gerin").forEach((inp) => {
      inp.addEventListener("change", () => { yaz(sopState.gerceklesen, inp.dataset.k, inp.dataset.ay, inp.value); renderSop(); });
      inp.addEventListener("keydown", (e) => { if (e.key === "Enter") inp.blur(); });
    });
    tbody.querySelectorAll("input.sop-ltin").forEach((inp) => {
      inp.addEventListener("change", () => {
        const v = parseInt(inp.value, 10);
        sopState.leadTime.set(inp.dataset.k, isFinite(v) && v >= 0 ? v : 0);
        renderSop();
      });
    });
    tbody.querySelectorAll("button.sop-dagit").forEach((btn) => {
      btn.addEventListener("click", () => sopDagit(btn.dataset.k, btn.dataset.ay));
    });
  }

  // "Kalan Aylara Dağıt" — YIL TOPLAMI SABİT kalır (kullanıcı kararı):
  // fark = Gerçekleşen − S&OP; bu fark kalan aylardan DÜŞÜLÜR (fazla satıldıysa
  // ileriden düşer, eksik satıldıysa ileriye eklenir). Kalan ay =
  //   (a) girilen aydan SONRAKİ ay VE (b) dondurma penceresi DIŞINDA.
  // Dağıtım o ayların MEVCUT S&OP ağırlıklarına orantılıdır; hepsi 0 ise
  // orantı tanımsız olur, o durumda EŞİT bölünür.
  function sopDagit(kimlik, ay) {
    const aylar = sopPencere();
    const satir = sopSatirlar().find((r) => sopKimlik(r) === kimlik);
    if (!satir) return;
    const lt = sopLeadTime(satir);
    const sonGercek = sopSonGercekAy();
    const donmaBas = sopBugunIndeks(aylar);
    const idx = aylar.findIndex((a) => a.key === ay);
    if (idx < 0) return;
    const sopV = sopDeger(sopState.sop, kimlik, ay);
    const gerV = sopDeger(sopState.gerceklesen, kimlik, ay);
    if (sopV == null || gerV == null) return;
    const fark = gerV - sopV;
    if (!fark) return;

    // Kalan ay = girilen aydan SONRAKİ · gerçekleşen OLMAYAN · dondurma
    // penceresi DIŞINDA kalan ay.
    const hedefler = aylar.filter((a, i) =>
      i > idx && !(sonGercek && a.key <= sonGercek) && !(i >= donmaBas && i < donmaBas + lt));
    if (!hedefler.length) { alert("Dağıtılacak kalan ay yok — bu aydan sonraki tüm aylar dondurma penceresinde ya da pencere sonunda."); return; }

    const agirliklar = hedefler.map((a) => sopDeger(sopState.sop, kimlik, a.key) || 0);
    const toplamAgirlik = agirliklar.reduce((x, y) => x + y, 0);
    const paylar = toplamAgirlik > 0
      ? agirliklar.map((w) => (w / toplamAgirlik) * fark)
      : hedefler.map(() => fark / hedefler.length);

    // Yuvarlama artığı son aya bindirilir ki toplam BİREBİR korunsun.
    let dagitilan = 0;
    hedefler.forEach((a, i) => {
      const pay = i === hedefler.length - 1 ? (fark - dagitilan) : Math.round(paylar[i]);
      dagitilan += pay;
      const mevcut = sopDeger(sopState.sop, kimlik, a.key) || 0;
      sopState.sop.set(sopAnahtar(kimlik, a.key), Math.max(0, mevcut - pay));
    });
    renderSop();
  }

  function initSop() {
    ["s_org", "s_uh1", "s_uh2", "s_uh3", "s_uh4"].forEach((id) => {
      const el = $(id);
      if (el) el.addEventListener("change", renderSop);
    });
    const tgl = $("sopGerceklesenToggle");
    if (tgl) tgl.addEventListener("click", () => {
      sopState.gerceklesenAcik = !sopState.gerceklesenAcik;
      tgl.textContent = sopState.gerceklesenAcik ? "Gerçekleşen girişini gizle" : "Gerçekleşen girişini göster";
      renderSop();
    });
    const tmz = $("sopTemizleBtn");
    if (tmz) tmz.addEventListener("click", () => {
      if (!sopState.sop.size && !sopState.gerceklesen.size) return;
      if (!confirm("Girilen tüm S&OP ve Gerçekleşen adetleri silinecek; plan ayları otomatik BAŞLANGIÇ değerine döner (Lead Time değişiklikleri kalır).\n\nDevam edilsin mi?")) return;
      sopState.sop.clear();
      sopState.gerceklesen.clear();
      sopState.tohumlanan.clear(); // temizlik = ekranın ilk açılış hâline dönmek
      renderSop();
    });
  }

  // --- Kampanya / Özel Gün Takvimi — SALT BİLGİ ---
  // Kaynak: assets/ozelgunler.js (OZEL_GUNLER, 278 kayıt, 2021-2027).
  // Hiçbir çarpanı/formülü/state'i BESLEMEZ. Kampanya Çarpanları kartlarına
  // (Miks m_*, Toptan t_m_*) bağlanmasın — bilinçli bir sınırdır.
  // Eski DataService.loadCalendar() prototip verisi kullanımdan kalktı.
  const TAKVIM_2027_UYARI =
    "Dinî bayramlar ve kandiller (Ramazan, Kurban Bayramı vb.) Hicri takvime bağlıdır ve " +
    "Diyanet'in resmi 2027 takvimi yayımlanmadan hesaplanamaz. Bu listede yer almazlar.";
  // "2021-01-01" → "01.01.2021". Date nesnesi KULLANMA: saat dilimi kayması
  // tarihi bir gün geriye/ileriye atabilir, veri zaten düz metin.
  function trTarih(iso) {
    const p = String(iso).split("-");
    return p.length === 3 ? p[2] + "." + p[1] + "." + p[0] : String(iso);
  }
  function takvimVerisi() {
    return (typeof OZEL_GUNLER !== "undefined" && Array.isArray(OZEL_GUNLER)) ? OZEL_GUNLER : [];
  }
  function initTakvim() {
    const sel = $("cal_yil");
    if (!sel) return;
    const yillar = Array.from(new Set(takvimVerisi().map((g) => g.yil))).sort((a, b) => a - b);
    if (!yillar.length) return;
    sel.innerHTML = yillar.map((y) => '<option value="' + y + '">' + y + "</option>").join("");
    const buYil = new Date().getFullYear();
    sel.value = String(yillar.includes(buYil) ? buYil : (yillar.includes(2027) ? 2027 : yillar[yillar.length - 1]));
    sel.addEventListener("change", renderCalendar);
  }
  function renderCalendar() {
    const tbody = $("calRows");
    if (!tbody) return;
    const sel = $("cal_yil");
    const yil = sel && sel.value ? Number(sel.value) : null;
    const satirlar = takvimVerisi().filter((g) => yil == null || g.yil === yil)
      .slice().sort((a, b) => String(a.tarih).localeCompare(String(b.tarih)));

    const sayac = $("calSayac");
    if (sayac) sayac.textContent = fmtN(satirlar.length) + " kayıt";

    const banner = $("calBanner");
    if (banner) {
      banner.innerHTML = yil === 2027
        ? '<div class="takvim-banner"><b>2027 listesi eksiktir.</b> ' + escapeHtml(TAKVIM_2027_UYARI) + "</div>"
        : "";
    }

    if (!satirlar.length) {
      tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:var(--grey);padding:18px">Bu yıl için kayıt yok.</td></tr>';
      return;
    }
    tbody.innerHTML = satirlar.map((g) => "<tr>" +
      "<td>" + trTarih(g.tarih) + "</td>" +
      "<td>" + escapeHtml(g.haftaninGunu || "—") + "</td>" +
      "<td>" + escapeHtml(g.isim || "—") +
        (g.tahmini2027 ? ' <span class="badge b-amber" title="Gregoryen kural ile hesaplandı, resmi kaynak değil">Hesaplanan</span>' : "") + "</td>" +
      "<td>" + escapeHtml(g.kategori || "—") + "</td>" +
      "<td>" + escapeHtml(g.resmiTatilStatu || "—") + "</td>" +
      "<td>" + escapeHtml(g.planlamaKullanimi || "—") + "</td>" +
      "</tr>").join("");
  }
  // --- Toptan (Sell-in) Bütçe — bkz. docs/TOPTAN_KOPRUSU.md 13.10 ---
  function donusumSatir(perakendeAdet, targetperiod) {
    if (typeof toptanButce !== "function" || typeof DONUSUM === "undefined") {
      return { carpanRaw: 1, aciklama: "donusum.js yüklenmedi — çarpan 1,000 kabul edildi" };
    }
    const ay = ayNo(targetperiod); // "2027 Ocak" / "2027-01" / 1 → 1..12, aksi halde null
    if (!ay) {
      // "Tam Yıl" / "—" gibi tek aya inmeyen periyotlar: yıllık çarpan K.
      // (CARPAN'ın perakende sezonuyla AĞIRLIKLI ortalaması tam olarak K'dır —
      // düz ortalaması 1,0294'tür, onu KULLANMA.)
      return { carpanRaw: DONUSUM.K,
        aciklama: "Hedef Periyot tek bir aya inmiyor (Tam Yıl / belirsiz) — yıllık çarpan K kullanıldı" };
    }
    // 3. parametre (stokPolitikasi) donusum.js API'sinde DURUYOR, varsayılanı 0.
    // Arayüzden BESLENMİYOR — "Bayi Stok Politikası %" alanı kaldırıldı.
    const d = toptanButce(perakendeAdet, ay);
    return { carpanRaw: d.carpan, aciklama: d.aciklama };
  }

  // ==========================================================================
  // TOPTAN BÜTÇE — ÇALIŞMA EKRANI
  // --------------------------------------------------------------------------
  // Boru hattı: Bütçe & Stok Karışımı → Perakende Bütçe (kayıt) →
  //             Toptan Bütçe (BURASI: filtrele · revize et · onayla) →
  //             Revize Toptan Bütçe (kayıt).
  //
  // Toptan Bütçe, Bütçe & Stok Karışımı'nın toptan taraftaki muadilidir:
  // ÜZERİNDE ÇALIŞILIR ama kendisi kayıt DEĞİLDİR. Elle girişler ve parametreler
  // bellekte durur (localStorage YOK), sayfa yenilenince sıfırlanır. Kalıcı olan
  // tek şey "Onayla & Kaydet" ile dondurulan setlerdir.
  //
  // HESAP ZİNCİRİ:
  //   temel  = Perakende × [DönüşümÇarpanı(ay) + BayiStokPolitikası%]
  //   taban  = elle girilen değer varsa O, yoksa temel
  //   Toptan = taban × Π(1 + kampanya/gam-kota %)
  //
  // Yani elle giriş DÖNÜŞÜMÜ değiştirir (bu yüzden stok politikası elle girilmiş
  // satırı etkilemez — dönüşüm zaten kullanıcının sayısıyla değiştirilmiştir),
  // kampanya çarpanları ise sonuçtan SONRA biner.
  // ==========================================================================
  const TOPTAN_CAMP = [
    { id: "t_m_paro", key: "paro", label: "Paro" },
    { id: "t_m_bundle", key: "bundle", label: "Bundle" },
    { id: "t_m_event", key: "event", label: "Özel gün" },
    { id: "t_m_gam", key: "gam", label: "Gam değişimi" },
    { id: "t_m_kota", key: "kota", label: "Kota ayı" },
  ];
  function bosToptanParams() {
    return { paro: 0, bundle: 0, event: 0, gam: 0, kota: 0, stokPolitikasi: 0 };
  }
  function readToptanParams() {
    const p = bosToptanParams();
    TOPTAN_CAMP.forEach((c) => {
      const el = $(c.id);
      const v = el ? parseFloat(el.value) : 0;
      p[c.key] = isFinite(v) ? v : 0;
    });
    const sp = $("t_stokpolitikasi");
    const spv = sp ? parseFloat(sp.value) : 0;
    p.stokPolitikasi = isFinite(spv) ? spv : 0;
    return p;
  }
  function toptanCampFactor(p) {
    return TOPTAN_CAMP.reduce((f, c) => f * (1 + (Number(p[c.key]) || 0) / 100), 1);
  }
  function toptanCampParts(p) {
    return TOPTAN_CAMP.filter((c) => (Number(p[c.key]) || 0) !== 0).map((c) => {
      const v = Number(p[c.key]);
      return c.label + " " + (v > 0 ? "+" : "−") + "%" + String(Math.abs(v)).replace(".", ",");
    });
  }

  // --- Satır kimliği (TEK yerde) ---
  // buildFlatRows() çıktısı org'u salesOrg, ÜH4'ü name olarak taşır. Tablo, elle
  // giriş haritası, filtre ve onaylanan set AYNI anahtarı üretsin diye burada.
  const TOPTAN_DIM_ALANLARI = ["org", "region", "uh1", "uh2", "uh3", "uh4", "baseperiod", "targetperiod"];
  function toptanFixKey(d) {
    return TOPTAN_DIM_ALANLARI.map((k) => String((d && d[k]) == null ? "" : d[k])).join("␟");
  }
  function toptanRowDims(r) {
    return { org: r.salesOrg, region: r.region, uh1: r.uh1, uh2: r.uh2, uh3: r.uh3,
      uh4: r.name, baseperiod: r.baseperiod, targetperiod: r.targetperiod };
  }

  // --- Elle girişler: BELLEKTE, kalıcı DEĞİL ---
  // Miks ekranındaki state.covers ile aynı felsefe: çalışma ekranının geçici
  // durumu. Filtre değişse de oturum boyunca korunur (anahtar dims'tir),
  // sayfa yenilenince sıfırlanır. Kalıcılık yalnızca onayla gelir.
  const toptanManuel = new Map();
  // Toptan Ortalama Satış Fiyatı (TY) — aynı felsefe, ama ZORUNLU alan:
  // fiyatı girilmemiş satır varken "Onayla & Kaydet" pasiftir. Otomatik
  // doldurulmaz; kayıttaki perakende TY fiyatı bayiye kesilen fiyat DEĞİLDİR,
  // onu varsayılan yapmak sessizce yanlış bir tutar üretirdi.
  const toptanFiyat = new Map();

  // --- Kaskad filtre (Toptan çalışma ekranı) ---
  const TOPTAN_FILTRE = [
    { id: "t_f_org", key: "org" },
    { id: "t_f_region", key: "region" },
    { id: "t_f_uh1", key: "uh1" },
    { id: "t_f_uh2", key: "uh2" },
    { id: "t_f_uh3", key: "uh3" },
    { id: "t_f_uh4", key: "uh4" },
    { id: "t_f_base", key: "baseperiod" },
    { id: "t_f_target", key: "targetperiod" },
  ];
  function toptanSecim() {
    const s = {};
    TOPTAN_FILTRE.forEach((f) => { const el = $(f.id); s[f.key] = el ? el.value : ""; });
    return s;
  }
  function toptanFiltreUygula(rows, sec) {
    return rows.filter((r) => TOPTAN_FILTRE.every((f) => !sec[f.key] || String(r.dims[f.key]) === sec[f.key]));
  }
  // Her dropdown'ın seçenekleri KENDİNDEN ÖNCEKİ seçimlerle daraltılmış kümeden
  // üretilir (ÜH4, ÜH3'e göre daralır). Geçersiz kalan seçim "Tümü"ye düşer, yani
  // kullanıcı 0 satır döndüren bir kombinasyon seçemez.
  function toptanFiltreleriDoldur(rows) {
    let havuz = rows;
    TOPTAN_FILTRE.forEach((f) => {
      const el = $(f.id);
      if (!el) return;
      const degerler = Array.from(new Set(havuz.map((r) => String(r.dims[f.key] == null ? "" : r.dims[f.key]))))
        .filter((v) => v !== "").sort((a, b) => a.localeCompare(b, "tr"));
      const gecerli = degerler.includes(el.value) ? el.value : "";
      el.innerHTML = '<option value="">Tümü</option>' +
        degerler.map((v) => '<option value="' + escapeAttribute(v) + '">' + escapeHtml(v) + '</option>').join("");
      el.value = gecerli;
      if (gecerli) havuz = havuz.filter((r) => String(r.dims[f.key]) === gecerli);
    });
  }

  // --- Hesap ---
  // Perakende Bütçe sekmesinin kolon filtreleri BURAYA uygulanmaz; bu ekranın
  // kendi kaskad filtresi vardır (kapsam = onaylanacak küme).
  function computeToptanFromSaved() {
    const params = readToptanParams();
    const campFactor = toptanCampFactor(params);
    const campParts = toptanCampParts(params);
    const spPct = Number(params.stokPolitikasi) || 0;

    const tum = buildFlatRows().map((r) => {
      const don = donusumSatir(r.salesBudget, r.targetperiod);
      const dims = toptanRowDims(r);
      const anahtar = toptanFixKey(dims);
      // temel = dönüşüm (stok politikası dönüşümün parçası)
      const temelCarpan = don.carpanRaw + spPct / 100;
      const temel = Math.max(0, r.salesBudget) * temelCarpan;
      // taban = elle giriş varsa o, yoksa temel
      const manuel = toptanManuel.has(anahtar) ? toptanManuel.get(anahtar) : null;
      const taban = manuel != null ? manuel : temel;
      const toptanButce = Math.round(taban * campFactor);
      // Kolon SAF aylık dönüşüm çarpanını gösterir (donusum.js, ay bazında sabit,
      // ulusal). Parametreler (kampanya/gam-kota/stok politikası) ve elle girişler
      // bu kolonu DEĞİŞTİRMEZ — yalnızca Toptan Bütçe sayısına etki ederler.
      //
      // İki kez yanlış kurgulandı, tekrarlama:
      // 1) Gerçekleşen oran (toptan ÷ perakende) gösteriliyordu; toptan tam sayıya
      //    yuvarlandığı için küçük adetlerde savruluyordu (perakende 1,94 → toptan
      //    3 → oran 1,546) ve tek bir ulusal çarpan varken kolon onlarca değer
      //    gösteriyordu.
      // 2) Uygulanan çarpan (× kampanya) gösteriliyordu; bu da Paro %10 girilince
      //    çarpanı 1,405'ten 1,546'ya taşıyordu — oysa çarpan bir VERİ sabitidir,
      //    kullanıcı parametresi değil.
      const carpan = don.carpanRaw;
      const aciklama = [
        manuel != null
          ? "Taban: ELLE GİRİLDİ → " + fmtN(manuel) + " adet (formül yerine bu kullanıldı)"
          : "Taban: " + fmtN(Math.round(temel)) + " adet = " + fmtN(r.salesBudget) + " × " + fmtD3(temelCarpan),
        manuel != null
          ? "Dönüşüm çarpanı: " + fmtD3(don.carpanRaw) + " — " + don.aciklama + " (elle giriş bunu geçersiz kıldı)"
          : "Dönüşüm çarpanı: " + fmtD3(don.carpanRaw) + " — " + don.aciklama,
        spPct !== 0
          ? "Bayi Stok Politikası: " + (spPct > 0 ? "+" : "−") + "%" + String(Math.abs(spPct)).replace(".", ",") +
            (manuel != null ? " (elle girilmiş satırı ETKİLEMEZ)" : " → çarpana eklendi")
          : "Bayi Stok Politikası: %0",
        campParts.length
          ? "Kampanya & Gam/Kota: ×" + fmtD3(campFactor) + "  (" + campParts.join(" · ") + ")"
          : "Kampanya & Gam/Kota: etkisiz (tüm alanlar %0)",
        "SONUÇ: " + fmtN(toptanButce) + " adet · gerçekleşen oran " + fmtD3(carpan),
      ].join("\n");
      const fiyat = toptanFiyat.has(anahtar) ? toptanFiyat.get(anahtar) : null;
      const tutar = fiyat != null ? toptanButce * fiyat : null;
      return {
        org: r.salesOrg, region: r.region, uh1: r.uh1, uh2: r.uh2, uh3: r.uh3, name: r.name,
        baseperiod: r.baseperiod, targetperiod: r.targetperiod,
        salesBudget: r.salesBudget,
        temel: Math.round(temel), manuel, carpan, carpanAciklama: aciklama, toptanButce,
        fiyat, tutar,
        dims, anahtar,
      };
    });

    const rows = toptanFiltreUygula(tum, toptanSecim());
    const T = rows.reduce((a, r) => {
      a.salesBudget += r.salesBudget;
      a.toptanButce += r.toptanButce;
      a.carpanAgirlikli += r.salesBudget * r.carpan;
      if (r.tutar != null) a.tutar += r.tutar; else a.fiyatsiz++;
      return a;
    }, { salesBudget: 0, toptanButce: 0, carpanAgirlikli: 0, tutar: 0, fiyatsiz: 0 });
    // TOPLAM çarpanı da kolonla AYNI şeyi ölçer: saf aylık çarpanların perakende
    // ağırlıklı ortalaması. Tek ay seçiliyse o ayın çarpanının kendisi çıkar.
    // Gerçekleşen oran (toptan ÷ perakende) KULLANILMAZ — parametreleri içine
    // katardı ve kolon ile toplam farklı şeyleri ölçerdi.
    T.carpan = T.salesBudget > 0 ? T.carpanAgirlikli / T.salesBudget : 0;
    return { rows, T, tum };
  }

  function toptanCarpanCls(c) {
    if (c > 1.10) return " toptan-carpan-yuksek";
    if (c < 0.90) return " toptan-carpan-dusuk";
    return "";
  }

  const TOPTAN_COL_MIN = 40;
  const TOPTAN_COL_MAX = 340;
  const TOPTAN_CELL_PAD = 20;   // th/td yatay padding (8+8) + güvenlik payı
  const TOPTAN_BADGE_PAD = 22;  // .badge kendi padding-inline'ı (9+9) için ek pay
  function measureToptanColumnWidths() {
    const table = $("toptanGrid");
    if (!table) return null;
    const headerThs = table.querySelectorAll("thead tr:last-child th");
    if (!headerThs.length) return null;
    const headerFont = "600 11px 'Segoe UI', Arial, sans-serif";
    const cellFont = "400 12px 'Segoe UI', Arial, sans-serif";
    const boldCellFont = "700 12px 'Segoe UI', Arial, sans-serif";
    const widths = Array.from(headerThs).map((th) =>
      measureTextWidth(th.textContent.trim(), headerFont) + TOPTAN_CELL_PAD);
    table.querySelectorAll("tbody tr, tfoot tr").forEach((tr) => {
      Array.from(tr.children).forEach((td, i) => {
        if (i >= widths.length) return;
        const badge = td.querySelector(".badge");
        // td.textContent rozet metnini ZATEN içerir.
        // DİKKAT: Toptan Bütçe hücresi artık bir <input>; textContent'i BOŞtur ve
        // ölçüm o kolonu sıfıra çökertir. Bu yüzden input'un değeri de sayılır,
        // üstüne input'un kendi border/padding'i için sabit pay eklenir.
        const inp = td.querySelector("input");
        const text = (inp ? inp.value + "0000" : "") + td.textContent.trim();
        const bold = td.classList.contains("num-cell") || td.classList.contains("toptan-highlight");
        const pad = badge ? TOPTAN_CELL_PAD + TOPTAN_BADGE_PAD : TOPTAN_CELL_PAD;
        const w = measureTextWidth(text, bold ? boldCellFont : cellFont) + pad;
        if (w > widths[i]) widths[i] = w;
      });
    });
    return widths.map((w) => Math.max(TOPTAN_COL_MIN, Math.min(TOPTAN_COL_MAX, Math.round(w))));
  }
  function applyToptanColumnWidths(widths) {
    const table = $("toptanGrid");
    if (!table || !widths) return;
    table.querySelectorAll("colgroup col").forEach((col, i) => {
      if (widths[i] != null) col.style.width = widths[i] + "px";
    });
    table.style.width = widths.reduce((a, b) => a + b, 0) + "px";
    syncToptanHeaderOffset(); // genişlik değişince başlık satırının yüksekliği de değişebilir
  }
  function autoFitToptanColumns() {
    applyToptanColumnWidths(measureToptanColumnWidths());
  }
  // ---- Revize Toptan Bütçe sekmesi: toptanDuzeltmeleri'ne YAZAN TEK YER ----
  // Toptan Bütçe sekmesinde artık parametre kartı YOKTUR (kaldırıldı) — orası
  // düzeltmesi olan satırı kayıttan, olmayanı SAF formülden hesaplar. Kampanya/
  // gam-kota/stok politikası girişinin TEK yeri burasıdır.
  function renderToptanFromSaved() {
    const tbody = $("toptanRows");
    if (!tbody) return;
    const data = computeToptanFromSaved();

    toptanFiltreleriDoldur(data.tum);
    const sayac = $("toptanSayac");
    const sec = toptanSecim();
    const seciliSayisi = TOPTAN_FILTRE.filter((f) => sec[f.key]).length;
    if (sayac) {
      sayac.textContent = fmtN(data.rows.length) + " satır kapsamda" +
        (seciliSayisi ? " · " + seciliSayisi + " filtre etkin" : " · filtre yok (tümü)");
    }
    // Hiç seçim yokken buton ölü durmasın diye pasifleştirilir.
    const temizleBtn = $("toptanFiltreTemizleBtn");
    if (temizleBtn) temizleBtn.disabled = seciliSayisi === 0;
    const multEl = $("t_mult_total");
    if (multEl) multEl.textContent = fmtX(toptanCampFactor(readToptanParams()));

    if (!data.rows.length) {
      const hicKayitYok = !buildFlatRows().length;
      const mesaj = hicKayitYok
        ? "Önce Bütçe & Stok Karışımı ekranından bütçe çalışıp kaydedin. Toptan bütçesi Perakende Bütçe kayıtlarından otomatik türetilir."
        : "Bu filtreyle eşleşen satır yok. Yukarıdaki seçimleri gevşetin.";
      tbody.innerHTML = '<tr><td colspan="13" style="text-align:center;color:var(--grey);padding:18px">' + mesaj + "</td></tr>";
      $("toptanFoot").innerHTML = "";
      guncelleToptanOnayNote(0, 0);
      autoFitToptanColumns();
      return;
    }

    tbody.innerHTML = data.rows.map((r, i) => '<tr>' +
      "<td>" + escapeHtml(r.org) + "</td>" +
      "<td>" + escapeHtml(r.region) + "</td>" +
      "<td>" + escapeHtml(r.uh1) + "</td>" +
      "<td>" + escapeHtml(r.uh2) + "</td>" +
      "<td>" + escapeHtml(r.uh3) + "</td>" +
      "<td>" + escapeHtml(r.name) + "</td>" +
      "<td>" + escapeHtml(r.baseperiod) + "</td>" +
      "<td>" + escapeHtml(r.targetperiod) + "</td>" +
      '<td class="num-cell">' + fmtN(r.salesBudget) + "</td>" +
      '<td class="num-cell' + toptanCarpanCls(r.carpan) + '" title="' + escapeAttribute(r.carpanAciklama) + '">' + fmtD3(r.carpan) + "</td>" +
      // type="number" tr-TR binlik ayracını GÖSTEREMEZ ("1084" çıkar, tablonun geri
      // kalanı "1.084" yazarken). Bu yüzden type="text" + inputmode="numeric":
      // değer fmtN ile biçimli durur, girişte parseToptanAdet() ayracı temizler.
      '<td class="toptancell">' +
        '<input type="text" inputmode="numeric" class="toptanin toptanadetin" id="tman_' + i + '" ' +
        'data-anahtar="' + escapeAttribute(r.anahtar) + '" value="' + fmtN(r.toptanButce) + '" ' +
        'title="' + escapeAttribute(r.carpanAciklama) + '">' +
        (r.manuel != null ? '<span class="badge b-amber toptan-manuel-rozet" title="Bu satırın tabanı elle girildi. Kampanya/gam-kota çarpanları bunun ÜZERİNE biner; Bayi Stok Politikası etkilemez. Hücreyi boşaltıp Enter\'a basarsanız formüle döner.">Elle</span>' : "") +
      "</td>" +
      // Fiyat ZORUNLU: boşken hücre kırmızı çerçeveli, onay pasif.
      '<td class="toptancell' + (r.fiyat == null ? " toptancell-eksik" : "") + '">' +
        '<input type="text" inputmode="decimal" class="toptanin toptanfiyatin" id="tfiy_' + i + '" ' +
        'data-anahtar="' + escapeAttribute(r.anahtar) + '" value="' + (r.fiyat != null ? fmtD2(r.fiyat) : "") + '" ' +
        'placeholder="zorunlu" title="Toptan Ortalama Satış Fiyatı (TY) — bayiye kesilecek ortalama birim fiyat. Girilmeden onay yapılamaz.">' +
      "</td>" +
      '<td class="num-cell toptan-highlight">' + (r.tutar != null ? fmtN(r.tutar) : "—") + "</td>" +
      "</tr>").join("");

    $("toptanFoot").innerHTML =
      "<td>TOPLAM</td><td>—</td><td>—</td><td>—</td><td>—</td><td>—</td><td>—</td><td>—</td>" +
      '<td class="num-cell">' + fmtN(data.T.salesBudget) + "</td>" +
      '<td class="num-cell' + toptanCarpanCls(data.T.carpan) + '" title="Saf aylık çarpanların perakende ağırlıklı ortalaması">' + fmtD3(data.T.carpan) + "</td>" +
      '<td class="num-cell">' + fmtN(data.T.toptanButce) + "</td>" +
      // Ortalama fiyat = toplam tutar ÷ toplam adet (düz ortalama DEĞİL); fiyatı
      // eksik satır varsa toplam tutar yanıltıcı olur, o yüzden "—" gösterilir.
      "<td>" + (data.T.fiyatsiz === 0 && data.T.toptanButce > 0 ? fmtD2(data.T.tutar / data.T.toptanButce) : "—") + "</td>" +
      '<td class="num-cell toptan-highlight">' + (data.T.fiyatsiz === 0 ? fmtN(data.T.tutar) : "—") + "</td>";

    bindToptanManuelInputs(tbody);
    guncelleToptanOnayNote(data.rows.length, data.T.fiyatsiz);
    autoFitToptanColumns();
  }

  // Hücre düzenlemesi "change"de işlenir ("input" değil): kullanıcı yazarken her
  // tuşta tabloyu yeniden kurmak odağı kaybettirir. Boşaltılırsa formüle döner.
  // "1.084" / "1084" / "1 084" → 1084. tr-TR binlik ayracı (.) ve boşluk atılır,
  // ondalık virgül noktaya çevrilir. Geçersizse null.
  function parseToptanAdet(s) {
    const temiz = String(s).replace(/[.\s ]/g, "").replace(",", ".");
    if (temiz === "") return null;
    const v = parseFloat(temiz);
    return isFinite(v) ? v : null;
  }
  // DİKKAT: .toptanin ORTAK STİL sınıfıdır (adet + fiyat ikisinde de var).
  // Dinleyici seçicisi olarak KULLANMA — fiyat yazınca adet handler'ı da tetiklenir
  // ve girilen fiyat adet olarak kaydedilir (bu hata yaşandı: fiyat 1.250,50
  // girilince adet 36'dan 1.251'e sıçradı). Davranış sınıfları ayrı:
  // .toptanadetin ve .toptanfiyatin.
  function bindToptanManuelInputs(tbody) {
    tbody.querySelectorAll("input.toptanadetin").forEach((inp) => {
      inp.addEventListener("change", () => {
        const anahtar = inp.dataset.anahtar;
        const ham = inp.value.trim();
        if (ham === "") toptanManuel.delete(anahtar);
        else {
          const v = parseToptanAdet(ham);
          if (v == null || v < 0) { renderToptanFromSaved(); return; }
          // Girilen değer SONUÇtur; tabana çevirmek için kampanya çarpanını geri al.
          // Böylece kullanıcı hücreye ne yazdıysa (çarpanlar sabitken) onu görür.
          const f = toptanCampFactor(readToptanParams());
          toptanManuel.set(anahtar, f > 0 ? v / f : v);
        }
        renderToptanFromSaved();
        renderToptanRollup();
      });
      inp.addEventListener("keydown", (e) => { if (e.key === "Enter") inp.blur(); });
    });
    tbody.querySelectorAll("input.toptanfiyatin").forEach((inp) => {
      inp.addEventListener("change", () => {
        const anahtar = inp.dataset.anahtar;
        const ham = inp.value.trim();
        if (ham === "") toptanFiyat.delete(anahtar);
        else {
          const v = parseToptanAdet(ham); // aynı tr-TR ayraç mantığı (1.234,56)
          if (v == null || v <= 0) { renderToptanFromSaved(); return; }
          toptanFiyat.set(anahtar, v);
        }
        renderToptanFromSaved();
        renderToptanRollup();
      });
      inp.addEventListener("keydown", (e) => { if (e.key === "Enter") inp.blur(); });
    });
  }

  // Fiyat ZORUNLU: kapsamdaki her satırın Toptan Ortalama Satış Fiyatı (TY)
  // girilmiş olmalı, aksi halde onay pasif. Adet var ama fiyat yoksa tutar
  // hesaplanamaz; eksik tutarla kayıt donmasın diye kapıyı burada tutuyoruz.
  function guncelleToptanOnayNote(n, fiyatsiz) {
    const note = $("toptanOnayNote");
    const btn = $("toptanOnayBtn");
    const elle = toptanManuel.size;
    const eksik = fiyatsiz || 0;
    if (btn) btn.disabled = n === 0 || eksik > 0;
    if (!note) return;
    if (n === 0) { note.textContent = "Kapsamda satır yok — onaylanacak bir şey bulunamadı."; note.classList.remove("karisik"); return; }
    if (eksik > 0) {
      note.classList.add("karisik");
      note.textContent = fmtN(eksik) + " satırda Toptan Ortalama Satış Fiyatı girilmemiş — onay için tümü doldurulmalı.";
      return;
    }
    note.classList.remove("karisik");
    note.textContent = fmtN(n) + " satır onaylanacak" + (elle ? " · " + fmtN(elle) + " satırda elle giriş var" : "") + ".";
  }

  // ==========================================================================
  // ONAYLANMIŞ REVİZYON SETLERİ — "Revize Toptan Bütçe" sekmesinin kaynağı
  // Perakende Bütçe (savedMixSets) ile AYNI desen: bir onay = bir SET, içinde
  // o anki filtreye uyan tüm satırların DONDURULMUŞ değerleri. Sonradan
  // parametre oynatmak kaydı DEĞİŞTİRMEZ; güncellemek için yeniden onaylanır.
  // ==========================================================================
  const TOPTAN_SET_KEY = "arpaz_toptan_revize_setleri";
  function loadToptanSets() {
    try {
      const raw = localStorage.getItem(TOPTAN_SET_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch (e) { return []; }
  }
  function saveToptanSets(list) {
    try { localStorage.setItem(TOPTAN_SET_KEY, JSON.stringify(list)); } catch (e) { /* geç */ }
  }
  function toptanKapsamOzeti(sec) {
    const etiket = { org: "Teşkilat", region: "Bölge", uh1: "ÜH1", uh2: "ÜH2", uh3: "ÜH3",
      uh4: "ÜH4", baseperiod: "Baz", targetperiod: "Hedef" };
    const secili = TOPTAN_FILTRE.filter((f) => sec[f.key]).map((f) => etiket[f.key] + ": " + sec[f.key]);
    return secili.length ? secili.join(" · ") : "Tümü (filtresiz)";
  }
  // Filtre ve parametre değişimlerinde tablo + rollup anında yeniden hesaplanır.
  // initNumFields() −/+ butonlarında "input" olayı YAYAR, tek dinleyici yeter.
  function initToptanParamListeners() {
    const tazele = () => { renderToptanFromSaved(); renderToptanRollup(); };
    TOPTAN_FILTRE.forEach((f) => { const el = $(f.id); if (el) el.addEventListener("change", tazele); });
    const temizle = $("toptanFiltreTemizleBtn");
    if (temizle) temizle.addEventListener("click", () => {
      TOPTAN_FILTRE.forEach((f) => { const el = $(f.id); if (el) el.value = ""; });
      tazele(); // toptanFiltreleriDoldur() seçenekleri de yeniden genişletir
    });
    TOPTAN_CAMP.concat([{ id: "t_stokpolitikasi" }]).forEach((c) => {
      const el = $(c.id);
      if (el) el.addEventListener("input", tazele);
    });
  }

  function initToptanOnay() {
    const sifirla = $("toptanSifirlaBtn");
    if (sifirla) sifirla.addEventListener("click", () => {
      if (!toptanManuel.size) return;
      if (!confirm(fmtN(toptanManuel.size) + " satırdaki elle giriş silinecek ve o satırlar formüle dönecek.\n\nDevam edilsin mi?")) return;
      toptanManuel.clear();
      renderToptanFromSaved();
      renderToptanRollup();
    });
    const btn = $("toptanOnayBtn");
    if (!btn) return;
    btn.addEventListener("click", () => {
      const data = computeToptanFromSaved();
      if (!data.rows.length) return; // buton zaten pasif
      const p = readToptanParams();
      const parts = toptanCampParts(p);
      if (p.stokPolitikasi) {
        parts.push("Bayi Stok Politikası " + (p.stokPolitikasi > 0 ? "+" : "−") + "%" + String(Math.abs(p.stokPolitikasi)).replace(".", ","));
      }
      const elleSayisi = data.rows.filter((r) => r.manuel != null).length;
      const onay = [
        fmtN(data.rows.length) + " satır onaylanacak ve Revize Toptan Bütçe'ye kayıt olarak akacak.",
        "",
        "Kapsam: " + toptanKapsamOzeti(toptanSecim()),
        "Toplam toptan: " + fmtN(data.T.toptanButce) + " adet · " + fmtN(data.T.tutar) + " ₺",
        elleSayisi ? "Elle girilmiş satır: " + fmtN(elleSayisi) : "Elle giriş yok",
        "Parametreler: " + (parts.length ? parts.join(" · ") : "tümü %0"),
        "",
        "Devam edilsin mi?",
      ].join("\n");
      if (!confirm(onay)) return;

      const set = {
        id: "tset_" + Date.now() + "_" + Math.random().toString(36).slice(2, 7),
        savedAt: new Date().toLocaleString("tr-TR"),
        kapsam: toptanSecim(),
        kapsamOzeti: toptanKapsamOzeti(toptanSecim()),
        params: Object.assign(bosToptanParams(), p),
        rows: data.rows.map((r) => ({
          org: r.org, region: r.region, uh1: r.uh1, uh2: r.uh2, uh3: r.uh3, uh4: r.name,
          baseperiod: r.baseperiod, targetperiod: r.targetperiod,
          perakendeBudget: r.salesBudget, temel: r.temel,
          elle: r.manuel != null, carpan: r.carpan, toptanButce: r.toptanButce,
          fiyat: r.fiyat, tutar: r.tutar,
        })),
      };
      const list = loadToptanSets();
      list.unshift(set);
      saveToptanSets(list.slice(0, 25)); // savedMixSets ile aynı sınır
      renderRevizeSets();
      showTab("revize"); // Miks ekranındaki "Senaryo kaydet" gibi: sonucu göster
    });
  }

  // Revize Toptan Bütçe sekmesi — SALT OKUNUR kayıt listesi.
  // Perakende Bütçe'deki .saved-mix-table deseni; min-width override edilir.
  // Kolon tanımları — SAVED_MIX_COLUMNS ile AYNI desen: başlık ve genişlik tek
  // listede, hem <colgroup> hem <thead> buradan üretilir. Genişlikler referans
  // tablodaki muadil kolonlardan alındı (teşkilat/ÜH/periyot birebir aynı).
  // DİKKAT: .saved-mix-table "table-layout:fixed" kullanır — colgroup YOKSA
  // kolonlar eşit bölünür ve uzun ÜH2/ÜH3/ÜH4 metinleri üst üste biner
  // (bu hata yaşandı). Kolon eklerken bu listeye genişliğiyle ekle.
  const REVIZE_SET_COLUMNS = [
    { label: "Onay Zamanı", width: 92 },
    { label: "Satış Teşkilatı", width: 68 },
    { label: "Şube / Bölge", width: 164 },
    { label: "ÜH1", width: 140 },
    { label: "ÜH2", width: 240 },
    { label: "ÜH3", width: 262 },
    { label: "ÜH4", width: 260 },
    { label: "Baz Periyot", width: 85 },
    { label: "Hedef Periyot", width: 85 },
    { label: "Perakende Bütçe", width: 82 },
    { label: "Dönüşüm Çarpanı", width: 78 },
    { label: "Toptan Bütçe", width: 84 },
    { label: "Toptan Ort. Satış Fiyatı (TY)", width: 96 },
    { label: "Toptan Satış Tutar Bütçe", width: 110 },
    { label: "Taban", width: 62 },
    { label: "Paro", width: 58 },
    { label: "Bundle", width: 58 },
    { label: "Özel gün", width: 62 },
    { label: "Gam", width: 58 },
    { label: "Kota", width: 58 },
    { label: "Stok Pol.", width: 62 },
    { label: "", width: 56 },
  ];
  function renderRevizeSets() {
    const el = $("revizeSetList");
    if (!el) return;
    const sets = loadToptanSets();
    if (!sets.length) {
      el.innerHTML = '<div class="saved-mix-empty">Henüz onaylanmış revizyon yok. Toptan Bütçe ekranında kapsamı filtreleyip revize ettikten sonra "Onayla &amp; Kaydet" ile buraya gönderin.</div>';
      return;
    }
    const yuzde = (v) => (Number(v) || 0) === 0 ? "—" : ((Number(v) > 0 ? "+" : "−") + "%" + String(Math.abs(Number(v))).replace(".", ","));
    const satirlar = [];
    sets.forEach((s) => {
      const p = Object.assign(bosToptanParams(), s.params);
      (s.rows || []).forEach((r) => {
        satirlar.push("<tr>" +
          "<td>" + escapeHtml(s.savedAt || "—") + "</td>" +
          "<td>" + escapeHtml(r.org || "—") + "</td>" +
          "<td>" + escapeHtml(r.region || "—") + "</td>" +
          "<td>" + escapeHtml(r.uh1 || "—") + "</td>" +
          "<td>" + escapeHtml(r.uh2 || "—") + "</td>" +
          "<td>" + escapeHtml(r.uh3 || "—") + "</td>" +
          "<td>" + escapeHtml(r.uh4 || "—") + "</td>" +
          "<td>" + escapeHtml(r.baseperiod || "—") + "</td>" +
          "<td>" + escapeHtml(r.targetperiod || "—") + "</td>" +
          '<td class="num-cell">' + fmtN(r.perakendeBudget || 0) + "</td>" +
          "<td>" + fmtD3(r.carpan || 0) + "</td>" +
          '<td class="num-cell">' + fmtN(r.toptanButce || 0) + "</td>" +
          "<td>" + (r.fiyat != null ? fmtD2(r.fiyat) : "—") + "</td>" +
          '<td class="num-cell toptan-highlight">' + (r.tutar != null ? fmtN(r.tutar) : "—") + "</td>" +
          "<td>" + (r.elle ? '<span class="badge b-amber">Elle</span>' : "—") + "</td>" +
          "<td>" + yuzde(p.paro) + "</td><td>" + yuzde(p.bundle) + "</td><td>" + yuzde(p.event) + "</td>" +
          "<td>" + yuzde(p.gam) + "</td><td>" + yuzde(p.kota) + "</td><td>" + yuzde(p.stokPolitikasi) + "</td>" +
          '<td><button type="button" class="btn ghost mini" data-delete-tset="' + escapeAttribute(s.id) + '">Sil</button></td>' +
        "</tr>");
      });
    });
    const toplamGenislik = REVIZE_SET_COLUMNS.reduce((a, c) => a + c.width, 0);
    el.innerHTML = '<div class="saved-mix-table-wrap">' +
      '<table class="saved-mix-table toptan-fix-table" style="width:' + toplamGenislik + "px;min-width:" + toplamGenislik + 'px">' +
      "<colgroup>" + REVIZE_SET_COLUMNS.map((c) => '<col style="width:' + c.width + 'px">').join("") + "</colgroup>" +
      '<thead><tr class="saved-mix-header-row">' +
      REVIZE_SET_COLUMNS.map((c) => "<th>" + escapeHtml(c.label) + "</th>").join("") +
      "</tr></thead><tbody>" + satirlar.join("") + "</tbody></table></div>";

    // Silme SET bazlıdır: bir satırdaki "Sil" o onayın TÜM satırlarını kaldırır
    // (Perakende Bütçe'deki setId davranışıyla aynı).
    el.querySelectorAll("[data-delete-tset]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const id = btn.getAttribute("data-delete-tset");
        const hedef = loadToptanSets().find((s) => s.id === id);
        const n = hedef && hedef.rows ? hedef.rows.length : 0;
        if (!confirm("Bu onayın TÜM satırları silinecek (" + fmtN(n) + " satır).\n\nDevam edilsin mi?")) return;
        saveToptanSets(loadToptanSets().filter((s) => s.id !== id));
        renderRevizeSets();
      });
    });
  }

  // ==========================================================================
  // HEDEF COVER REFERANSI — geçmiş stok ay grafiği (satır içi popup)
  // --------------------------------------------------------------------------
  // Kaynak: assets/stok_ay_referans.js (STOK_AY_REFERANS, 330 ÜH4, 2021-01 →
  // 2025-12). Hedef Cover hücresindeki (i) butonuna basılınca o satırın ÜH4'ü
  // için geçmiş stok ay serisi çizilir. TAMAMEN BİLGİLENDİRME: Hedef Cover'a,
  // state.covers'a veya herhangi bir bütçe hesabına DOKUNMAZ (CLAUDE.md
  // Bölüm 5: Hedef Cover bütçe sahibinin uzman yargısıdır, otomatik bir
  // değerle ASLA ezilmez).
  //
  // EŞLEŞTİRME — neden İ/I katlaması şart: referans dosyası "ÇAMAŞIR MAKINESI"
  // (noktasız I), HIERARCHY ise "ÇAMAŞIR MAKİNESİ" yazıyor. Ölçüldü:
  //   ham karşılaştırma           →  47/339 yaprak eşleşiyor (%13,9)
  //   tr-TR BÜYÜK harf            →  47/339 (DEĞİŞMİYOR — İ ve I ayrı harfler)
  //   BÜYÜK harf + İ/I katlaması  → 313/339 (%92,3)
  // Kalan 26 yaprağın referans dosyasında gerçekten karşılığı yok (330 kayıt
  // vs 339 yaprak); onlar "veri bulunamadı" mesajına düşer, uydurma yapılmaz.
  // ==========================================================================
  let stokRefChart = null;
  let stokRefAnchor = null;   // popup'ı açan (i) butonu — yeniden konumlandırma için
  function stokRefVeri() {
    return (typeof STOK_AY_REFERANS !== "undefined" && Array.isArray(STOK_AY_REFERANS)) ? STOK_AY_REFERANS : [];
  }
  // tr-TR BÜYÜK harf + İ/I katlaması. Katlama OLMADAN eşleşme %13,9'da kalıyor
  // (yukarıdaki ölçüm) — sadece toLocaleUpperCase YETMEZ.
  function stokRefNorm(s) {
    return String(s == null ? "" : s).toLocaleUpperCase("tr-TR")
      .replace(/[İI]/g, "I").replace(/[ıi]/g, "I").trim();
  }
  function stokRefKayit(uh4) {
    const sel = state.sel || {};
    const n = stokRefNorm;
    return stokRefVeri().find((r) =>
      n(r.uh1) === n(sel.uh1) && n(r.uh2) === n(sel.uh2) &&
      n(r.uh3) === n(sel.uh3) && n(r.uh4) === n(uh4)) || null;
  }
  // Baz Periyot seçicisinden ay NUMARASI. Değer "2026 Ocak" / "2026 Tam Yıl"
  // biçiminde; "Tam Yıl"da vurgulanacak tek bir ay yoktur → null.
  function stokRefBazAy() {
    const el = $("h_baseperiod");
    const v = el ? String(el.value) : "";
    const i = SOP_AY_ADI.findIndex((ad) => v.indexOf(ad) >= 0);
    return i >= 0 ? { no: i + 1, ad: SOP_AY_ADI[i] } : null;
  }

  function stokRefCiz(rec, bazAy) {
    const cv = $("stokRefChart");
    const bos = $("stokRefBos");
    if (!cv || !bos) return;
    if (stokRefChart) { stokRefChart.destroy(); stokRefChart = null; }

    const seri = (rec && rec.seri) ? rec.seri : [];
    const dolu = seri.filter((p) => p.stokAy != null).length;
    if (!dolu || typeof Chart === "undefined") {
      cv.style.display = "none";
      bos.style.display = "";
      bos.textContent = !dolu
        ? "Bu ürün için geçmiş referans verisi bulunamadı."
        : "Grafik kütüphanesi (Chart.js) yüklenemedi — çevrimdışı olabilirsiniz.";
      return;
    }
    cv.style.display = "";
    bos.style.display = "none";

    const vurgu = bazAy ? bazAy.no : null;
    const etiket = seri.map((p) => p.yil + " " + FC_AY_KISA[p.ay - 1]);
    // stokAy null → nokta ATLANIR (spanGaps çizgiyi boşluk üstünden bağlar).
    const deger = seri.map((p) => (p.stokAy == null ? null : Number(p.stokAy)));
    // Baz Periyot'un ayına denk gelen TÜM yıllar vurgulanır (2021 Ocak,
    // 2022 Ocak, …) — tek bir yıl değil; amaç o ayın yıllar içindeki
    // seyrini göstermek.
    const vurguMu = seri.map((p) => vurgu != null && p.ay === vurgu && p.stokAy != null);
    const acc = fcRenk("--accent", "#0077b6");
    const amb = fcRenk("--amber", "#b26a00");

    stokRefChart = new Chart(cv.getContext("2d"), {
      type: "line",
      data: {
        labels: etiket,
        datasets: [{
          label: "Stok Ay", data: deger, spanGaps: true,
          borderColor: acc, backgroundColor: "rgba(0,119,182,.08)",
          borderWidth: 2, tension: .25, fill: true,
          pointRadius: vurguMu.map((v) => (v ? 5 : 0)),
          pointHoverRadius: vurguMu.map((v) => (v ? 7 : 4)),
          pointBackgroundColor: vurguMu.map((v) => (v ? amb : acc)),
          pointBorderColor: vurguMu.map((v) => (v ? amb : acc)),
        }],
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        interaction: { mode: "index", intersect: false },
        plugins: {
          legend: { display: false },
          tooltip: { callbacks: { label: (c) => "Stok Ay: " + fmtD(c.parsed.y) } },
        },
        scales: {
          x: { grid: { display: false }, ticks: { maxRotation: 0, autoSkipPadding: 12, font: { size: 9 } } },
          y: { beginAtZero: true, ticks: { callback: (v) => fmtD(v), font: { size: 9 } },
               grid: { color: "rgba(11,37,69,.07)" } },
        },
      },
    });
  }

  // Popup'ı butonun yanında konumlar. #gridFormatPanel ile AYNI desen ama
  // popup `position:fixed` (tablo `overflow:auto` kutusunun içinde duruyor,
  // absolute olsaydı kırpılırdı): butonun ekran koordinatına göre yerleşir,
  // alta/sağa taşarsa yukarı/sola döner.
  function stokRefKonumla(btn) {
    const pop = $("stokRefPop");
    if (!pop || !btn) return;
    const b = btn.getBoundingClientRect();
    const p = pop.getBoundingClientRect();
    const bosluk = 8;
    let top = b.bottom + bosluk;
    if (top + p.height > window.innerHeight - bosluk) top = b.top - p.height - bosluk;
    top = Math.max(bosluk, Math.min(top, window.innerHeight - p.height - bosluk));
    let left = b.left + b.width / 2 - p.width / 2;
    left = Math.max(bosluk, Math.min(left, window.innerWidth - p.width - bosluk));
    pop.style.top = top + "px";
    pop.style.left = left + "px";
  }

  function stokRefKapat() {
    const pop = $("stokRefPop");
    if (pop) pop.style.display = "none";
    stokRefAnchor = null;
    if (stokRefChart) { stokRefChart.destroy(); stokRefChart = null; }
  }

  // Pencere yeniden boyutlanınca / tablo kaydırılınca popup'ı KAPATMAK yerine
  // butonun yeni yerine taşı; buton ekrandan çıktıysa (ya da satır yeniden
  // kurulduysa) kapat. Kapatmak kullanıcıyı grafikten ediyordu.
  function stokRefTazele() {
    const pop = $("stokRefPop");
    if (!pop || pop.style.display === "none" || !stokRefAnchor) return;
    if (!stokRefAnchor.isConnected) { stokRefKapat(); return; }
    const b = stokRefAnchor.getBoundingClientRect();
    const gorunmez = b.bottom < 0 || b.top > window.innerHeight || b.right < 0 || b.left > window.innerWidth;
    if (gorunmez) { stokRefKapat(); return; }
    stokRefKonumla(stokRefAnchor);
  }

  function stokRefAc(btn, uh4) {
    const pop = $("stokRefPop"), baslik = $("stokRefBaslik");
    if (!pop) return;
    stokRefAnchor = btn;
    const rec = stokRefKayit(uh4);
    const bazAy = stokRefBazAy();
    if (baslik) {
      const yillar = (rec && rec.seri && rec.seri.length)
        ? rec.seri[0].yil + "–" + rec.seri[rec.seri.length - 1].yil : "—";
      baslik.textContent = uh4 + " — Geçmiş Stok Ay" +
        (bazAy ? " (" + bazAy.ad + " " + yillar + ")" : " (" + yillar + ")");
    }
    const not = $("stokRefNot");
    if (not) {
      not.innerHTML = bazAy
        ? "Turuncu noktalar Baz Periyot ayınız olan <b>" + escapeHtml(bazAy.ad) +
          "</b> aylarıdır — her yılın " + escapeHtml(bazAy.ad) + " değeri işaretli."
        : "Baz Periyot <b>Tam Yıl</b> olduğu için vurgulanacak tek bir ay yok.";
    }
    pop.style.display = "block";
    stokRefCiz(rec, bazAy);
    stokRefKonumla(btn);
  }

  function initStokRef() {
    const kapat = $("stokRefKapat");
    if (kapat) kapat.addEventListener("click", stokRefKapat);
    document.addEventListener("click", (e) => {
      const pop = $("stokRefPop");
      if (!pop || pop.style.display === "none") return;
      if (!pop.contains(e.target) && !e.target.closest(".cov-ref-btn")) stokRefKapat();
    });
    document.addEventListener("keydown", (e) => { if (e.key === "Escape") stokRefKapat(); });
    window.addEventListener("resize", stokRefTazele);
    // capture:true ZORUNLU — tablo kendi `overflow:auto` kutusunda kayar ve
    // iç scroll olayları window'a BALONLANMAZ; capture fazında yakalanır.
    window.addEventListener("scroll", stokRefTazele, true);
  }

  // ==========================================================================
  // TAHMİN (FORECAST) — çoklu model, backtest ile seçilmiş
  // --------------------------------------------------------------------------
  // Kaynak: assets/forecast_data.js (FORECAST_DATA, 296 ÜH4). Her kayıtta 4
  // yöntemden (Mevsimsel Naif · SES · Holt-Winters · Doğrusal Regresyon)
  // backtest'le seçilmiş model, 6 aylık ileri tahmin, trend eğimi, 12 aylık
  // mevsimsel indeks ve ham geçmiş seri (2022-01 → 2025-12) bulunur.
  //
  // ULUSAL veri — org/bölge kırılımı YOKTUR; bu yüzden sekmenin kaskadında
  // Satış Teşkilatı seçici de yoktur.
  //
  // Kaskad KENDİ VERİSİNDEN kurulur, HIERARCHY'den DEĞİL: FORECAST_DATA
  // "ASPIRATÖR" (noktasız I) yazarken hiyerarşi "ASPİRATÖR" yazıyor —
  // CLAUDE.md Bölüm 4'teki İ/I tuzağının aynısı, ham eşleşme tutmaz. Kendi
  // verisinden kurunca bu tuzak yapısal olarak imkânsız.
  //
  // Ekran SALT OKUNUR: hiçbir bütçe state'ini/parametresini beslemez, kullanıcı
  // girdisi almaz. (Eski placeholder — fcMethod dropdown'ı + computeModel'den
  // türetilen basit tablo — tamamen KALDIRILDI.)
  // ==========================================================================
  const FC_AY_KISA = ["Oca", "Şub", "Mar", "Nis", "May", "Haz",
    "Tem", "Ağu", "Eyl", "Eki", "Kas", "Ara"];
  // mevsimsel_indeks anahtarları tam Türkçe ay adları — SOP_AY_ADI ile aynı
  // liste, tekrar tanımlamak yerine onu kullanıyoruz.
  const FC_GUVEN_ESIK = { yuksek: 0.30, orta: 0.60 };
  // Trend eşiği: |aylık eğim| ÷ aylık ortalama < %0,5 ise "Stabil".
  // MUTLAK eşik (ör. "±5 adet") OLMAZ — aylık ortalama 0 ile 41.390 arasında
  // değişiyor (ölçüldü), tek bir adet eşiği ya her şeyi stabil sayar ya
  // hiçbir şeyi. %0,5/ay ≈ %6/yıl; bu eşikte 296 kaydın 81'i "Stabil"
  // (bunların 52'sinin eğimi zaten tam 0).
  const FC_TREND_ESIK = 0.005;

  let fcAnaChart = null, fcMevsimChart = null;

  function fcVeri() {
    return (typeof FORECAST_DATA !== "undefined" && Array.isArray(FORECAST_DATA)) ? FORECAST_DATA : [];
  }
  function fcChartVar() { return typeof Chart !== "undefined"; }
  function fcEtiket(yil, ay) { return yil + " " + FC_AY_KISA[ay - 1]; }
  // CSS token'larını Chart.js'e taşır — grafik renkleri :root'takiyle aynı
  // kalsın, ham hex ikinci bir yerde tekrar etmesin (CLAUDE.md Bölüm 9).
  function fcRenk(token, yedek) {
    const v = getComputedStyle(document.documentElement).getPropertyValue(token).trim();
    return v || yedek;
  }
  function fcSecim() {
    const al = (id) => { const el = $(id); return el ? el.value : ""; };
    return { uh1: al("f_uh1"), uh2: al("f_uh2"), uh3: al("f_uh3"), uh4: al("f_uh4") };
  }
  // Kaskad: her seviye kendinden ÖNCEKİ seçimlerle daraltılmış kümeden üretilir.
  // "Tümü" seçeneği YOK — proje kuralı (CLAUDE.md Bölüm 4).
  function fcKaskadDoldur() {
    const veri = fcVeri();
    if (!veri.length) return;
    let havuz = veri;
    [{ id: "f_uh1", key: "uh1" }, { id: "f_uh2", key: "uh2" },
     { id: "f_uh3", key: "uh3" }, { id: "f_uh4", key: "uh4" }].forEach((s) => {
      const el = $(s.id);
      if (!el) return;
      const degerler = Array.from(new Set(havuz.map((r) => r[s.key])))
        .filter(Boolean).sort((a, b) => String(a).localeCompare(String(b), "tr"));
      const gecerli = degerler.includes(el.value) ? el.value : (degerler[0] || "");
      el.innerHTML = degerler.map((v) => '<option value="' + escapeAttribute(v) + '">' + escapeHtml(v) + "</option>").join("");
      el.value = gecerli;
      havuz = havuz.filter((r) => r[s.key] === gecerli);
    });
  }
  function fcKayit() {
    const s = fcSecim();
    return fcVeri().find((r) => r.uh1 === s.uh1 && r.uh2 === s.uh2 &&
      r.uh3 === s.uh3 && r.uh4 === s.uh4) || null;
  }

  // Güven rozeti — backtest MAPE'ye göre. Eşikler: <%30 yüksek, %30-60 orta,
  // >%60 düşük. Bu veri setinde dağılım 118 / 97 / 81 (ölçüldü).
  function fcGuvenRozeti(mape) {
    const yuzde = "%" + (mape * 100).toLocaleString("tr-TR", { maximumFractionDigits: 1 });
    const baslik = escapeAttribute("Backtest hata oranı: " + yuzde);
    if (mape < FC_GUVEN_ESIK.yuksek)
      return '<span class="badge b-green" title="' + baslik + '">Yüksek Güven</span>';
    if (mape <= FC_GUVEN_ESIK.orta)
      return '<span class="badge b-amber" title="' + baslik + '">Orta Güven</span>';
    return '<span class="badge b-red" title="' + baslik + '">Düşük Güven (düşük hacim/yüksek dalgalanma)</span>';
  }

  function fcTrendHtml(rec) {
    const seri = rec.gecmis_seri || [];
    const ort = seri.length ? seri.reduce((a, b) => a + (Number(b.deger) || 0), 0) / seri.length : 0;
    const egim = Number(rec.trend_egim_aylik) || 0;
    const rel = ort > 0 ? Math.abs(egim) / ort : 0;
    const adet = Math.abs(egim).toLocaleString("tr-TR", { maximumFractionDigits: 1 });
    if (rel < FC_TREND_ESIK)
      return '<div class="fc-trend fc-trend-duz"><span class="fc-trend-ok">→</span>' +
        "<span><b>Stabil</b> — belirgin bir artış/azalış eğilimi yok.</span></div>";
    if (egim > 0)
      return '<div class="fc-trend fc-trend-artan"><span class="fc-trend-ok">↗</span>' +
        "<span><b>Artan eğilim</b> — aylık ortalama <b>+" + adet + "</b> adet.</span></div>";
    return '<div class="fc-trend fc-trend-azalan"><span class="fc-trend-ok">↘</span>' +
      "<span><b>Azalan eğilim</b> — aylık ortalama <b>−" + adet + "</b> adet.</span></div>";
  }

  // Ana grafik: geçmiş + tahmin TEK eksende. Tahmin dizisi son gerçek noktadan
  // BAŞLATILIR (o indekse gerçek değer yazılır) ki iki çizgi görsel olarak
  // bağlansın — yoksa aralarında kopukluk görünür.
  function fcAnaGrafikCiz(rec) {
    const cv = $("fcAnaChart");
    if (!cv || !fcChartVar()) return;
    const gecmis = rec.gecmis_seri || [];
    const ileri = rec.ileri_tahmin || [];
    const etiketler = gecmis.concat(ileri).map((p) => fcEtiket(p.yil, p.ay));
    const gercekSeri = gecmis.map((p) => Number(p.deger) || 0).concat(ileri.map(() => null));
    const tahminSeri = gecmis.map((p, i) => (i === gecmis.length - 1 ? (Number(p.deger) || 0) : null))
      .concat(ileri.map((p) => Number(p.deger) || 0));

    if (fcAnaChart) fcAnaChart.destroy();
    fcAnaChart = new Chart(cv.getContext("2d"), {
      type: "line",
      data: {
        labels: etiketler,
        datasets: [
          { label: "Gerçekleşen", data: gercekSeri, borderColor: fcRenk("--accent", "#0077b6"),
            backgroundColor: "rgba(0,119,182,.10)", borderWidth: 2, pointRadius: 0,
            pointHoverRadius: 4, tension: .25, fill: true },
          { label: "Tahmin", data: tahminSeri, borderColor: fcRenk("--amber", "#b26a00"),
            backgroundColor: "transparent", borderWidth: 2, borderDash: [6, 4],
            pointRadius: 3, pointHoverRadius: 5, tension: .25, fill: false },
        ],
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        interaction: { mode: "index", intersect: false },
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: (c) => c.parsed.y == null ? null : c.dataset.label + ": " + fmtN(c.parsed.y) + " adet",
            },
          },
        },
        scales: {
          x: { grid: { display: false }, ticks: { maxRotation: 0, autoSkipPadding: 14, font: { size: 10 } } },
          y: { beginAtZero: true, ticks: { callback: (v) => fmtN(v), font: { size: 10 } },
               grid: { color: "rgba(11,37,69,.07)" } },
        },
      },
    });
  }

  // Mevsimsellik: 12 bar + Y=1,00'da kesikli referans çizgisi. Referans çizgisi
  // için AYRI bir eklenti (chartjs-plugin-annotation) YÜKLENMEZ — tek grafiğe
  // özel, birkaç satırlık yerel eklenti yeterli.
  const fcRefCizgiEklenti = {
    id: "fcRefCizgi",
    afterDatasetsDraw(chart) {
      const y = chart.scales.y;
      if (!y) return;
      const py = y.getPixelForValue(1);
      if (!isFinite(py)) return;
      const { ctx, chartArea } = chart;
      ctx.save();
      ctx.strokeStyle = "rgba(11,37,69,.45)";
      ctx.lineWidth = 1;
      ctx.setLineDash([5, 4]);
      ctx.beginPath();
      ctx.moveTo(chartArea.left, py);
      ctx.lineTo(chartArea.right, py);
      ctx.stroke();
      ctx.restore();
    },
  };

  function fcMevsimGrafikCiz(rec) {
    const cv = $("fcMevsimChart");
    if (!cv || !fcChartVar()) return;
    const idx = rec.mevsimsel_indeks || {};
    const degerler = SOP_AY_ADI.map((ad) => Number(idx[ad]) || 0);
    if (fcMevsimChart) fcMevsimChart.destroy();
    fcMevsimChart = new Chart(cv.getContext("2d"), {
      type: "bar",
      data: {
        labels: FC_AY_KISA,
        datasets: [{ label: "Mevsimsel indeks", data: degerler,
          backgroundColor: fcRenk("--accent", "#0077b6"), borderRadius: 3, maxBarThickness: 34 }],
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: { callbacks: { label: (c) => fmtD2(c.parsed.y) + "x (1,00 = yıl ortalaması)" } },
        },
        scales: {
          x: { grid: { display: false }, ticks: { font: { size: 10 } } },
          y: { beginAtZero: true, ticks: { callback: (v) => fmtD(v), font: { size: 10 } },
               grid: { color: "rgba(11,37,69,.07)" } },
        },
      },
      plugins: [fcRefCizgiEklenti],
    });
  }

  // 6 aylık tablo. "Geçen Yıl Aynı Ay" geçmiş seriden (yıl−1, aynı ay) okunur;
  // o ay veride yoksa ya da 0 ise fark hesaplanmaz — "—" yazılır, uydurulmaz.
  function fcTabloCiz(rec) {
    const tb = $("fcRows");
    if (!tb) return;
    const gecmisHarita = new Map();
    (rec.gecmis_seri || []).forEach((p) => gecmisHarita.set(p.yil + "-" + p.ay, Number(p.deger) || 0));
    tb.innerHTML = (rec.ileri_tahmin || []).map((p) => {
      const tahmin = Number(p.deger) || 0;
      const gy = gecmisHarita.has((p.yil - 1) + "-" + p.ay) ? gecmisHarita.get((p.yil - 1) + "-" + p.ay) : null;
      const fark = (gy != null && gy !== 0) ? (tahmin - gy) / gy : null;
      return "<tr><td>" + escapeHtml(p.yil + " " + SOP_AY_ADI[p.ay - 1]) + "</td>" +
        '<td class="num-cell toptan-highlight">' + fmtN(tahmin) + "</td>" +
        '<td class="num-cell">' + (gy == null ? "—" : fmtN(gy)) + "</td>" +
        '<td class="num-cell ' + (fark == null ? "" : (fark >= 0 ? "up" : "down")) + '">' +
          (fark == null ? "—" : (fark >= 0 ? "+" : "") + fmtP0(fark)) + "</td></tr>";
    }).join("");
  }

  function renderForecast() {
    const tb = $("fcRows");
    if (!tb) return;
    fcKaskadDoldur();
    const rec = fcKayit();
    const ad = $("fcUh4Ad"), yontem = $("fcYontem"), guven = $("fcGuven"),
      ozet = $("fcOzet"), trend = $("fcTrend");

    if (!rec) {
      if (ad) ad.textContent = "Tahmin (Forecast)";
      if (yontem) yontem.textContent = "—";
      if (guven) guven.innerHTML = "";
      if (ozet) ozet.textContent = "Bu seçim için tahmin kaydı bulunamadı.";
      if (trend) trend.innerHTML = "";
      tb.innerHTML = '<tr><td colspan="4" style="text-align:center;color:var(--grey);padding:18px">Veri yok.</td></tr>';
      if (fcAnaChart) { fcAnaChart.destroy(); fcAnaChart = null; }
      if (fcMevsimChart) { fcMevsimChart.destroy(); fcMevsimChart = null; }
      return;
    }

    if (ad) ad.textContent = rec.uh4;
    if (yontem) yontem.textContent = "Seçilen Yöntem: " + rec.secilen_yontem;
    if (guven) guven.innerHTML = fcGuvenRozeti(Number(rec.backtest_mape) || 0);
    if (trend) trend.innerHTML = fcTrendHtml(rec);
    if (ozet) {
      ozet.innerHTML = "Yöntem <b>" + escapeHtml(rec.secilen_yontem) + "</b>, dört aday model " +
        "(Mevsimsel Naif · SES · Holt-Winters · Doğrusal Regresyon) arasından <b>backtest</b> ile seçildi. " +
        "Geçmiş seri <b>" + fmtN(rec.n_ay) + " ay</b>." +
        (fcChartVar() ? "" : ' <b style="color:var(--red)">Grafik kütüphanesi (Chart.js) yüklenemedi — ' +
          "çevrimdışı olabilirsiniz. Rozetler ve tablo etkilenmedi.</b>");
    }
    fcTabloCiz(rec);
    fcAnaGrafikCiz(rec);
    fcMevsimGrafikCiz(rec);
  }

  function initForecast() {
    ["f_uh1", "f_uh2", "f_uh3", "f_uh4"].forEach((id) => {
      const el = $(id);
      if (el) el.addEventListener("change", renderForecast);
    });
  }

  // --- Olaylar ---
  // .numfield −/+ butonları: input.step kadar artırır/azaltır, min/max varsa
  // kırpar ve "input" olayı yayar — böylece mevcut dinleyiciler (updateAll,
  // enforceWeightTotal) hiç değişmeden çalışır.
  function initNumFields() {
    document.querySelectorAll(".nf-btn[data-step]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const inp = $(btn.dataset.step);
        if (!inp) return;
        const step = parseFloat(inp.step) || 1;
        const dir = parseInt(btn.dataset.dir, 10);
        let v = parseFloat(inp.value);
        if (!isFinite(v)) v = 0;
        v += dir * step;
        if (inp.min !== "" && isFinite(parseFloat(inp.min))) v = Math.max(v, parseFloat(inp.min));
        if (inp.max !== "" && isFinite(parseFloat(inp.max))) v = Math.min(v, parseFloat(inp.max));
        // Kayan nokta artığını temizle (0.1 adımlarda 0.30000000000000004 olmasın)
        inp.value = Math.round(v * 1000) / 1000;
        inp.dispatchEvent(new Event("input", { bubbles: true }));
      });
    });
  }

  function bind() {
    ["p_stokbuyume","p_pazar","p_fiyatbuyume","w_kar","w_satis","w_stok",...CAMP.map(k=>"m_"+k)]
      .forEach((id) => $(id).addEventListener("input", () => {
        if (["w_kar","w_satis","w_stok"].includes(id)) {
          enforceWeightTotal();
        }
        updateAll();
      }));
    // (fcMethod dinleyicisi KALDIRILDI — Tahmin sekmesinin yöntem dropdown'ı
    //  yok, yöntem her ÜH4 için backtest'le veride seçili geliyor.)
    // Baz/Hedef Periyot artık Toptan'ı CANLI etkilemiyor (bkz. renderToptanFromSaved) —
    // ama "Kaydet"/"Revize Et" eşleşme anahtarının bir parçası, değişince buton güncellensin.
    const basePeriodEl = $("h_baseperiod");
    if (basePeriodEl) basePeriodEl.addEventListener("change", updateSaveButtonState);
    const targetPeriodEl = $("h_targetperiod");
    if (targetPeriodEl) targetPeriodEl.addEventListener("change", updateSaveButtonState);
    // Özet/Rollup paneli — kırılım seçici (ÜH1/ÜH2/ÜH3) + kendi (bağımsız) periyot seçicileri
    document.querySelectorAll("#rollupLevelSeg [data-level]").forEach((btn) => {
      btn.addEventListener("click", () => {
        rollupState.level = btn.dataset.level;
        document.querySelectorAll("#rollupLevelSeg [data-level]").forEach((b) => b.classList.toggle("is-on", b === btn));
        renderRollup();
      });
    });
    document.querySelectorAll("#toptanRollupLevelSeg [data-level]").forEach((btn) => {
      btn.addEventListener("click", () => {
        toptanRollupState.level = btn.dataset.level;
        document.querySelectorAll("#toptanRollupLevelSeg [data-level]").forEach((b) => b.classList.toggle("is-on", b === btn));
        renderToptanRollup();
      });
    });
    const rollupBaseEl = $("rollup_baseperiod");
    if (rollupBaseEl) rollupBaseEl.addEventListener("change", renderRollup);
    const rollupTargetEl = $("rollup_targetperiod");
    if (rollupTargetEl) rollupTargetEl.addEventListener("change", renderRollup);
    document.querySelectorAll(".tabs button").forEach((b) => {
      b.addEventListener("click", () => showTab(b.dataset.tab));
    });
    $("saveSc").onclick = () => {
      addScenario($("scName").value);
      $("scName").value = "";
    };
    // Ana tablo başlığındaki buton: otomatik adla kaydeder ve kullanıcıyı
    // Senaryo Karşılaştırma ekranına aktarır (isim orada düzenlenebilir).
    const scHeadBtn = $("saveScenarioBtn");
    if (scHeadBtn) scHeadBtn.onclick = () => { addScenario(); showTab("senaryo"); };
    $("clearSc").onclick = () => { scenarios = []; renderScenarios(); };
    const saveMixSetBtn = $("saveMixSetBtn");
    if (saveMixSetBtn) saveMixSetBtn.addEventListener("click", saveCurrentMixSet);
  }

  // --- Bütçe kurgusu bilgi modal'ı (tablo başlığındaki (i) ikonu) ---
  // Eski "Bütçe Kurgusu — Nasıl Hesaplanıyor?" accordion paneli KALDIRILDI;
  // içerik artık ortalı, kapatılabilir modal. SADECE bilgilendirme — hiçbir
  // parametreye/hesaba dokunmaz. Kapanış: × butonu, overlay boşluğuna tıklama, Esc.
  // Panel başlığındaki (i) ikonuyla açılan bilgi modal'ı. İKİ yerde kullanılır:
  //   · #formulaInfoBtn  → #formulaModal (Bütçe & Stok Karışım Tablosu)
  //   · #toptanInfoBtn   → #toptanModal  (Toptan Bütçe Tablosu)
  // Yeni bir bilgi modal'ı eklerken AYRI bir init yazma, bunu çağır.
  function initInfoModal(btnId, overlayId, closeId) {
    const overlay = $(overlayId);
    const btn = $(btnId);
    const closeBtn = $(closeId);
    if (!overlay || !btn || !closeBtn) return;
    const open = () => { overlay.hidden = false; closeBtn.focus(); };
    const close = () => { overlay.hidden = true; btn.focus(); };
    btn.addEventListener("click", open);
    closeBtn.addEventListener("click", close);
    // Sadece overlay boşluğu kapatır; kutunun içine tıklamak kapatmaz
    overlay.addEventListener("click", (e) => { if (e.target === overlay) close(); });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && !overlay.hidden) close();
    });
  }

  // --- Sürüklenebilir sütun genişliği (SADECE #grid) + localStorage kalıcılık ---
  // Bu GERÇEK bir web uygulaması (GitHub Pages), Claude "artifact" ortamı DEĞİL — localStorage kullanılır.
  const GRID_COLS_KEY = "arpaz_grid_col_widths";
  const COL_MIN_WIDTHS = { 0: 80, 12: 96, 14: 76, 19: 90, 20: 120 }; // ÜH4, Hedef Cover, TY Fiyat, Durum, Aksiyon
  const colMinWidth = (idx) => COL_MIN_WIDTHS[idx] || 36;
  let gridCols = [];
  let gridDefaultWidths = [];

  function syncGridWidth() {
    const total = gridCols.reduce((a, c) => a + parseFloat(c.style.width), 0);
    $("grid").style.width = total + "px";
  }
  function applyColWidths(widths) {
    gridCols.forEach((c, i) => { c.style.width = widths[i] + "px"; });
    syncGridWidth();
  }
  function loadSavedColWidths() {
    try {
      const raw = localStorage.getItem(GRID_COLS_KEY);
      if (!raw) return null;
      const arr = JSON.parse(raw);
      if (!Array.isArray(arr) || arr.length !== gridDefaultWidths.length) return null;
      if (arr.some((n) => typeof n !== "number" || !isFinite(n) || n <= 0)) return null;
      return arr;
    } catch (e) {
      return null; // bozuk veri: sessizce varsayılana dön
    }
  }
  function saveColWidths() {
    try {
      localStorage.setItem(GRID_COLS_KEY, JSON.stringify(gridCols.map((c) => parseFloat(c.style.width))));
    } catch (e) { /* localStorage kullanılamıyorsa sessizce geç */ }
  }
  function makeResizeHandle(colIdx) {
    const handle = document.createElement("span");
    handle.className = "col-resize-handle";
    handle.addEventListener("mousedown", (e) => {
      e.preventDefault();
      e.stopPropagation();
      const col = gridCols[colIdx];
      const startX = e.clientX;
      const startWidth = parseFloat(col.style.width);
      const min = colMinWidth(colIdx);
      handle.classList.add("dragging");
      function onMove(ev) {
        const newWidth = Math.max(min, Math.round(startWidth + (ev.clientX - startX)));
        col.style.width = newWidth + "px";
        syncGridWidth();
      }
      function onUp() {
        document.removeEventListener("mousemove", onMove);
        document.removeEventListener("mouseup", onUp);
        handle.classList.remove("dragging");
        saveColWidths();
      }
      document.addEventListener("mousemove", onMove);
      document.addEventListener("mouseup", onUp);
    });
    return handle;
  }
  function attachUh4ResizeHandle() {
    const th = $("grpColHead");
    if (th && !th.querySelector(".col-resize-handle")) th.appendChild(makeResizeHandle(0));
  }
  function initColResize() {
    gridCols = Array.from(document.querySelectorAll("#grid colgroup col"));
    if (!gridCols.length) return;
    gridDefaultWidths = gridCols.map((c) => parseFloat(c.style.width));

    const saved = loadSavedColWidths();
    if (saved) applyColWidths(saved); else syncGridWidth();

    const row1Ths = document.querySelectorAll("#grid thead tr")[0].querySelectorAll("th"); // [ÜH4, GERÇEKLEŞEN, GELECEK YIL, Durum, Aksiyon]
    const row2Ths = document.querySelectorAll("#grid thead tr")[1].querySelectorAll("th"); // 18 metrik başlık
    attachUh4ResizeHandle();
    row1Ths[3].appendChild(makeResizeHandle(19)); // Durum
    row1Ths[4].appendChild(makeResizeHandle(20)); // Aksiyon
    row2Ths.forEach((th, i) => th.appendChild(makeResizeHandle(i + 1)));

    const resetBtn = $("gridColReset");
    if (resetBtn) {
      resetBtn.addEventListener("click", (e) => {
        e.preventDefault();
        try { localStorage.removeItem(GRID_COLS_KEY); } catch (err) { /* geç */ }
        applyColWidths(gridDefaultWidths);
      });
    }
  }

  // --- Görünüm araç çubuğu: satır yüksekliği + başlık/hücre yazı boyutu-kalınlık (SADECE #grid) ---
  // Bu GERÇEK bir web uygulaması (GitHub Pages), Claude "artifact" ortamı DEĞİL — localStorage kullanılır.
  const GRID_FORMAT_KEY = "arpaz_grid_format";
  const VIEW_STORAGE_KEY = "arpaz_table_views";
  const LAST_VIEW_KEY = "arpaz_last_view";
  const FORMAT_DEFAULTS = { rowPad: 7, headerSize: 11, headerBold: true, cellSize: 12, cellBold: false, headerAlign: "center", cellAlign: "right" };
  const FORMAT_LIMITS = { rowPad: [4, 20], headerSize: [9, 16], cellSize: [9, 14] };
  const VALID_ALIGNS = ["left", "center", "right"];
  let gridFormat = { ...FORMAT_DEFAULTS };

  function clamp(v, [min, max]) { return Math.max(min, Math.min(max, v)); }

  function normalizeViewConfig(obj) {
    if (!obj || typeof obj !== "object") return null;
    const rowPad = clamp(Number(obj.rowPad), FORMAT_LIMITS.rowPad);
    const headerSize = clamp(Number(obj.headerSize), FORMAT_LIMITS.headerSize);
    const cellSize = clamp(Number(obj.cellSize), FORMAT_LIMITS.cellSize);
    if (!isFinite(rowPad) || !isFinite(headerSize) || !isFinite(cellSize)) return null;
    return {
      rowPad, headerSize, cellSize,
      headerBold: typeof obj.headerBold === "boolean" ? obj.headerBold : FORMAT_DEFAULTS.headerBold,
      cellBold: typeof obj.cellBold === "boolean" ? obj.cellBold : FORMAT_DEFAULTS.cellBold,
      headerAlign: VALID_ALIGNS.includes(obj.headerAlign) ? obj.headerAlign : FORMAT_DEFAULTS.headerAlign,
      cellAlign: VALID_ALIGNS.includes(obj.cellAlign) ? obj.cellAlign : FORMAT_DEFAULTS.cellAlign,
    };
  }

  // İkinci thead satırının sticky "top"u birinci satırın GERÇEK yüksekliği kadar olmalı
  // (0 değil) — yoksa aşağı kaydırınca ikinci satır birincinin üstüne biniyor. Birinci
  // satırın yüksekliği sabit değil (Başlık Yazı Boyutu kontrolüyle değişir), bu yüzden
  // dinamik hesaplanır.
  function syncHeaderStickyOffset() {
    const row1 = document.querySelector("#grid thead tr:first-child");
    const row2Ths = document.querySelectorAll("#grid thead tr:last-child th");
    if (!row1 || !row2Ths.length) return;
    const h = row1.getBoundingClientRect().height;
    row2Ths.forEach((th) => { th.style.top = h + "px"; });
  }

  // Toptan Bütçe tablosu için AYNI mantık (bkz. syncHeaderStickyOffset yorumu) —
  // ÜH4 rowspan=2 olduğundan bu hesaba dahil değil (tüm başlık yüksekliğini zaten
  // kendi sticky top:0'ıyla kapsıyor, main #grid'deki ÜH4/Durum/Aksiyon gibi).
  // Sekme varsayılan gizli (display:none) geldiğinden ilk yüklemede 0 ölçülür —
  // zararsız, sekme ilk açıldığında (bkz. bind() tab click) yeniden çağrılır.
  function syncToptanHeaderOffset() {
    const row1 = document.querySelector("#toptanGrid thead tr:first-child");
    const row2Ths = document.querySelectorAll("#toptanGrid thead tr:last-child th");
    if (!row1 || !row2Ths.length) return;
    const h = row1.getBoundingClientRect().height;
    if (!h) return;
    row2Ths.forEach((th) => { th.style.top = h + "px"; });
  }

  function applyGridFormat() {
    const grid = $("grid");
    if (!grid) return;
    grid.style.setProperty("--grid-row-pad", gridFormat.rowPad + "px");
    grid.style.setProperty("--grid-h-size", gridFormat.headerSize + "px");
    grid.style.setProperty("--grid-h-weight", gridFormat.headerBold ? "700" : "400");
    grid.style.setProperty("--grid-c-size", gridFormat.cellSize + "px");
    grid.style.setProperty("--grid-c-weight", gridFormat.cellBold ? "700" : "400");
    grid.style.setProperty("--grid-h-align", gridFormat.headerAlign);
    grid.style.setProperty("--grid-c-align", gridFormat.cellAlign);
    updateFormatUI();
    syncHeaderStickyOffset(); // satır yüksekliği/başlık boyutu değiştiği için 2. satırın sticky top'u yeniden hesaplanmalı
  }
  function updateFormatUI() {
    const rowPadEl = $("fmtRowPadVal"); if (rowPadEl) rowPadEl.textContent = gridFormat.rowPad + "px";
    const hSizeEl = $("fmtHeaderSizeVal"); if (hSizeEl) hSizeEl.textContent = gridFormat.headerSize + "px";
    const cSizeEl = $("fmtCellSizeVal"); if (cSizeEl) cSizeEl.textContent = gridFormat.cellSize + "px";

    const hBoldInput = $("fmtHeaderBoldToggle");
    if (hBoldInput) hBoldInput.checked = !!gridFormat.headerBold;
    const cBoldInput = $("fmtCellBoldToggle");
    if (cBoldInput) cBoldInput.checked = !!gridFormat.cellBold;

    document.querySelectorAll('[data-fmt-align="header"]').forEach((btn) => {
      btn.classList.toggle("is-on", btn.dataset.val === gridFormat.headerAlign);
    });
    document.querySelectorAll('[data-fmt-align="cell"]').forEach((btn) => {
      btn.classList.toggle("is-on", btn.dataset.val === gridFormat.cellAlign);
    });
  }
  function loadSavedGridFormat() {
    try {
      const raw = localStorage.getItem(GRID_FORMAT_KEY);
      if (!raw) return null;
      return normalizeViewConfig(JSON.parse(raw));
    } catch (e) {
      return null; // bozuk veri: sessizce varsayılana dön
    }
  }
  function saveGridFormat() {
    try { localStorage.setItem(GRID_FORMAT_KEY, JSON.stringify(gridFormat)); } catch (e) { /* geç */ }
  }
  function loadSavedViews() {
    try {
      const raw = localStorage.getItem(VIEW_STORAGE_KEY);
      if (!raw) return {};
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== "object") return {};
      const clean = {};
      Object.keys(parsed).forEach((name) => {
        const view = normalizeViewConfig(parsed[name]);
        if (view && name && name.trim()) clean[name.trim()] = view;
      });
      return clean;
    } catch (e) {
      return {};
    }
  }
  function saveSavedViews(views) {
    try { localStorage.setItem(VIEW_STORAGE_KEY, JSON.stringify(views)); } catch (e) { /* geç */ }
  }
  function renderSavedViews() {
    const select = $("savedViewSelect");
    if (!select) return;
    const views = loadSavedViews();
    const names = Object.keys(views);
    const lastUsed = localStorage.getItem(LAST_VIEW_KEY);
    select.innerHTML = '<option value="">Kayıtlı görünüm</option>' + names.map((name) => `<option value="${name}">${name}</option>`).join("");
    if (lastUsed && views[lastUsed]) select.value = lastUsed;
  }
  function applySavedView(name) {
    const views = loadSavedViews();
    const saved = views[name];
    if (!saved) return;
    gridFormat = { ...FORMAT_DEFAULTS, ...saved };
    applyGridFormat();
    saveGridFormat();
    localStorage.setItem(LAST_VIEW_KEY, name);
    renderSavedViews();
  }
  function saveCurrentView() {
    const input = $("viewNameInput");
    const name = input ? input.value.trim() : "";
    if (!name) return;
    const views = loadSavedViews();
    views[name] = { ...gridFormat };
    saveSavedViews(views);
    localStorage.setItem(LAST_VIEW_KEY, name);
    renderSavedViews();
    if (input) input.value = "";
  }
  function deleteSavedView() {
    const select = $("savedViewSelect");
    const selected = select ? select.value : "";
    if (!selected) return;
    const views = loadSavedViews();
    delete views[selected];
    saveSavedViews(views);
    const lastUsed = localStorage.getItem(LAST_VIEW_KEY);
    if (lastUsed === selected) localStorage.removeItem(LAST_VIEW_KEY);
    renderSavedViews();
  }
  function initGridFormat() {
    const savedViews = loadSavedViews();
    const lastView = localStorage.getItem(LAST_VIEW_KEY);
    const currentPreset = lastView && savedViews[lastView] ? savedViews[lastView] : loadSavedGridFormat();
    gridFormat = currentPreset ? { ...FORMAT_DEFAULTS, ...currentPreset } : { ...FORMAT_DEFAULTS };
    applyGridFormat();
    renderSavedViews();

    const toggleBtn = $("gridFormatToggle");
    const panel = $("gridFormatPanel");
    if (toggleBtn && panel) {
      const syncToggleState = () => {
        const open = panel.style.display !== "none";
        toggleBtn.setAttribute("aria-expanded", String(open));
        toggleBtn.classList.toggle("is-on", open);
      };
      // Viewport altına yakın açılırsa panel ekran dışına taşıyordu (sabit top:calc(100%+10px)).
      // Her açılışta gerçek boyutlarla ölç, alta sığmıyorsa panel YUKARI açılsın.
      const positionPanel = () => {
        panel.style.top = "calc(100% + 10px)";
        panel.style.bottom = "auto";
        const btnRect = toggleBtn.getBoundingClientRect();
        const panelRect = panel.getBoundingClientRect();
        const overflowsBottom = btnRect.bottom + panelRect.height + 10 > window.innerHeight;
        if (overflowsBottom) {
          panel.style.top = "auto";
          panel.style.bottom = "calc(100% + 10px)";
        }
      };
      toggleBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        const open = panel.style.display === "none";
        panel.style.display = open ? "block" : "none";
        if (open) positionPanel();
        syncToggleState();
      });
      document.addEventListener("click", (event) => {
        if (!panel.contains(event.target) && !toggleBtn.contains(event.target)) {
          panel.style.display = "none";
          syncToggleState();
        }
      });
      syncToggleState();
    }

    document.querySelectorAll("[data-fmt-step]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const key = btn.dataset.fmtStep;
        const dir = parseInt(btn.dataset.dir, 10);
        gridFormat[key] = clamp(gridFormat[key] + dir, FORMAT_LIMITS[key]);
        applyGridFormat();
        saveGridFormat();
      });
    });

    const hBoldBtn = $("fmtHeaderBoldToggle");
    if (hBoldBtn) hBoldBtn.addEventListener("change", () => {
      gridFormat.headerBold = hBoldBtn.checked;
      applyGridFormat();
      saveGridFormat();
    });
    const cBoldBtn = $("fmtCellBoldToggle");
    if (cBoldBtn) cBoldBtn.addEventListener("change", () => {
      gridFormat.cellBold = cBoldBtn.checked;
      applyGridFormat();
      saveGridFormat();
    });

    // [data-val] şart: sarmalayıcı .segmented div'i de data-fmt-align taşıyor (stil
    // gruplaması için), onu da eşleştirseydik click bubbling'de div'in dinleyicisi
    // dataset.val=undefined ile ikinci kez çalışıp doğru seçimi ezerdi.
    document.querySelectorAll("[data-fmt-align][data-val]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const field = btn.dataset.fmtAlign === "header" ? "headerAlign" : "cellAlign";
        gridFormat[field] = btn.dataset.val;
        applyGridFormat();
        saveGridFormat();
      });
    });

    const rowPadHandle = $("rowPadHandle");
    if (rowPadHandle) {
      rowPadHandle.addEventListener("mousedown", (e) => {
        e.preventDefault();
        const startY = e.clientY;
        const startPad = gridFormat.rowPad;
        rowPadHandle.classList.add("dragging");
        function onMove(ev) {
          const delta = Math.round((ev.clientY - startY) / 2); // ~2px sürükleme = 1px yükseklik
          gridFormat.rowPad = clamp(startPad + delta, FORMAT_LIMITS.rowPad);
          applyGridFormat();
        }
        function onUp() {
          document.removeEventListener("mousemove", onMove);
          document.removeEventListener("mouseup", onUp);
          rowPadHandle.classList.remove("dragging");
          saveGridFormat();
        }
        document.addEventListener("mousemove", onMove);
        document.addEventListener("mouseup", onUp);
      });
    }

    const saveViewBtn = $("saveViewBtn");
    if (saveViewBtn) saveViewBtn.addEventListener("click", saveCurrentView);
    const input = $("viewNameInput");
    if (input) input.addEventListener("keydown", (e) => { if (e.key === "Enter") saveCurrentView(); });
    const applySavedBtn = $("applySavedViewBtn");
    if (applySavedBtn) applySavedBtn.addEventListener("click", () => {
      const select = $("savedViewSelect");
      if (select && select.value) applySavedView(select.value);
    });
    const deleteSavedBtn = $("deleteSavedViewBtn");
    if (deleteSavedBtn) deleteSavedBtn.addEventListener("click", deleteSavedView);

    // "Görünümü sıfırla" — mevcut gridColReset butonuna İKİNCİ bir dinleyici (sütun
    // genişliği sıfırlama initColResize()'da zaten bağlı, ona dokunmadan ekleniyor)
    const resetBtn = $("gridColReset");
    if (resetBtn) {
      resetBtn.addEventListener("click", (e) => {
        e.preventDefault();
        try { localStorage.removeItem(GRID_FORMAT_KEY); } catch (err) { /* geç */ }
        localStorage.removeItem(LAST_VIEW_KEY);
        gridFormat = { ...FORMAT_DEFAULTS };
        applyGridFormat();
        saveGridFormat();
      });
    }

    // başlık metni farklı satıra bölünüp yüksekliği değişebilir (pencere yeniden boyutlanınca)
    window.addEventListener("resize", syncHeaderStickyOffset);
    window.addEventListener("resize", syncToptanHeaderOffset);
    window.addEventListener("resize", syncSavedMixHeaderOffset);
  }

  document.addEventListener("DOMContentLoaded", () => {
    initHierarchy();
    DataService._cur = { sel: state.sel, level: state.level };
    DataService.loadMix = function () { return this.loadMixFor(this._cur.sel, this._cur.level); };
    buildTable();
    bind();
    initInfoModal("formulaInfoBtn", "formulaModal", "formulaModalClose");
    initInfoModal("toptanInfoBtn", "toptanModal", "toptanModalClose");
    initNumFields();
    initSidebarToggle();
    initColResize();
    initGridFormat();
    renderSavedMixTable();
    updateAll();
    updateSelInfo();
    updateSaveButtonState();
    initToptanOnay();
    initToptanParamListeners();
    renderToptanFromSaved(); // ilk yüklemede de Kayıtlar'ın o anki hali gösterilsin
    renderToptanRollup();    // Toptan tabındaki Özet/Rollup da ilk yüklemede Kayıtlar'ı yansıtsın
    renderRollup();          // Özet/Rollup da ilk yüklemede Kayıtlar'ı yansıtsın
    renderRevizeSets();
    initTakvim();
    initSop();
    renderSop();
    initForecast();
    initStokRef();
    renderCalendar();
  });
})();

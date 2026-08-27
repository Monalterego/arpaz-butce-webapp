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

      return { name, stock, sales, profit, stockShare, salesShare, profitShare,
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
      oluAdet: rows.filter((r) => r.oluStok).length,
    };
    T.lfl = T.salesBudget / (totSales || 1) - 1;
    T.cover = totStock / (totSales || 1);
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
        <td class="covcell"><input type="number" class="covin" id="hcov_${i}" min="1" step="0.5" value="${state.covers[i]}"></td>
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
  renderForecast(m);
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

  function renderKpis(m) {
    const kpis = [
      ["Toplam Stok", fmtN(m.T.stock), "adet", ""],
      ["Toplam Satış (LY)", fmtN(m.T.sales), "adet", ""],
      ["Toplam Kâr (LY)", fmtN(m.T.profit), "₺", ""],
      ["Bayi Stok Ay (Cover)", fmtD(m.T.cover), "ay", ""],
      ["Toplam Satış Bütçe (TY)", fmtN(m.T.salesBudget), "adet", m.rows.length ? (m.T.lfl >= 0 ? "up" : "down") : ""],
      ["LFL Büyüme", m.rows.length ? fmtP0(m.T.lfl) : "—", "", m.rows.length ? (m.T.lfl >= 0 ? "up" : "down") : ""],
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
  function renderSavedMixRows() {
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
    renderRollup();          // Özet/Rollup da Kayıtlar'dan besleniyor
  }

  // --- Sekme geçişi (hem navbar butonları hem programatik çağrı kullanır) ---
  // Ana tablo başlığındaki "Senaryo kaydet" butonu bunu çağırarak kullanıcıyı
  // Senaryo Karşılaştırma ekranına aktarır.
  function showTab(t) {
    document.querySelectorAll(".tabs button").forEach((x) =>
      x.classList.toggle("active", x.dataset.tab === t));
    document.querySelectorAll(".tabpane").forEach((p) =>
      (p.style.display = p.dataset.pane === t ? "" : "none"));
    if (t === "kayitlar") renderRollup(); // sekme açılınca Kayıtlar'ın GÜNCEL hali
    if (t === "toptan") {
      renderToptanFromSaved(); // sekme her açıldığında Kayıtlar'ın GÜNCEL halini yansıt
      syncToptanHeaderOffset(); // sekme az önce görünür oldu, gizliyken 0 ölçülen yükseklik şimdi düzeltilir
    }
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
  function renderCalendar() {
    $("calRows").innerHTML = DataService.loadCalendar()
      .map((c) => `<tr><td>${c[0]}</td><td>${c[1]}</td>
        <td><span class="badge b-blue">${c[2]}</span></td><td>${c[3]}</td>
        <td><span class="badge b-amber">${c[4]}</span></td><td class="up">${c[5]}</td></tr>`).join("");
  }
  // --- Perakende → Toptan (Kanıt) — statik infografik vitrini ---
  // KANIT (assets/kanit.js) ve TOPTAN_KATSAYI (assets/toptan_katsayi.js) sabit/geçmiş
  // veridir, sidebar seçimine bağlı DEĞİLDİR — bu yüzden bir kez render edilir (bkz.
  // DOMContentLoaded), updateAll()'a bağlı değildir. Bütçe hesaplarına dokunmaz, SADECE
  // görsel/kanıt sekmesidir (bkz. CLAUDE.md Bölüm 13.9).
  function renderKanitKpis() {
    const el = $("kanitKpis");
    if (!el || typeof KANIT === "undefined") return;
    const o = KANIT.ozet;
    const dogruluk = Math.round(o.korelasyon * 100);
    const leadAbs = Math.abs(o.lead_lag_en_guclu);
    const kpis = [
      ["Doğruluk", "%" + dogruluk, `Fiziksel kural gerçek toptanla %${dogruluk} korelasyon gösterdi`],
      ["Lead-Time", `−${leadAbs} Ay`, `Toptan sevk, perakende satıştan ~${leadAbs} ay önce gerçekleşiyor (bayi önce alır, sonra satar)`],
      ["Test Kapsamı", fmtN(o.satir) + " Kayıt", `${o.donem}, ${o.uh2} ürün grubu, ${o.uh4} alt grup ile test edildi`],
    ];
    el.innerHTML = kpis.map((k) => `<div class="kpi"><div class="lbl">${k[0]}</div>
      <div class="val">${k[1]}</div><div class="sub">${k[2]}</div></div>`).join("");
  }
  function renderKanitLeadLag() {
    const el = $("kanitLeadLag");
    if (!el || typeof KANIT === "undefined") return;
    const data = KANIT.leadlag;
    const bestLag = KANIT.ozet.lead_lag_en_guclu;
    const maxAbs = Math.max(...data.map((d) => Math.abs(d.r)));
    const POS_H = 140, NEG_H = 34;
    el.innerHTML = `<div class="kanit-leadlag-chart">` + data.map((d) => {
      const highlight = d.lag === bestLag;
      const posH = d.r > 0 ? Math.round((d.r / maxAbs) * POS_H) : 0;
      const negH = d.r < 0 ? Math.round((Math.abs(d.r) / maxAbs) * NEG_H) : 0;
      const valTxt = fmtD3(d.r);
      return `
        <div class="kanit-leadlag-col">
          <div class="kanit-leadlag-val">${d.r > 0 ? valTxt : "&nbsp;"}</div>
          <div class="kanit-leadlag-pos"><div class="kanit-leadlag-bar${highlight ? " highlight" : ""}" style="height:${posH}px" title="lag ${d.lag}: r=${valTxt}"></div></div>
          <div class="kanit-leadlag-zeroline"></div>
          <div class="kanit-leadlag-neg"><div class="kanit-leadlag-bar-neg" style="height:${negH}px" title="lag ${d.lag}: r=${valTxt}"></div></div>
          <div class="kanit-leadlag-val-neg">${d.r < 0 ? valTxt : "&nbsp;"}</div>
          <div class="kanit-leadlag-lbl">${d.lag > 0 ? "+" : ""}${d.lag}</div>
        </div>`;
    }).join("") + `</div>`;
    $("kanitLeadLagNote").textContent =
      `En güçlü ilişki ${bestLag} ayda: toptan, perakendeyi ${Math.abs(bestLag)} ay önden götürür.`;
  }
  // Diverging renk skalası: 0,5(yeşil) → 1,0(amber) → 2,0(kırmızı). İki renk arası
  // lineer interpolasyon; iki bacaklı (pivot 1,0da) çünkü "<1 iyi/eritme, >1 dolum"
  // anlamı ortadan ikiye ayrılıyor. (Ana #gridde bir zamanlar Brüt Kâr % hücresinde
  // benzer bir tek-bacaklı heat() vardı; o pill kaldırıldı, fonksiyon da silindi.)
  function heatDiverge(v) {
    const GREEN = [46, 125, 50], AMBER = [178, 106, 0], RED = [198, 40, 40];
    const clipped = Math.max(0.5, Math.min(2.0, v));
    const lerp = (a, b, t) => Math.round(a + (b - a) * t);
    const c = clipped <= 1
      ? GREEN.map((g, i) => lerp(g, AMBER[i], (clipped - 0.5) / 0.5))
      : AMBER.map((a, i) => lerp(a, RED[i], clipped - 1));
    return `rgb(${c[0]},${c[1]},${c[2]})`;
  }
  function renderKanitHeatmap() {
    const table = $("kanitHeatmap");
    if (!table || typeof TOPTAN_KATSAYI === "undefined") return;
    const months = DataService.months();
    const uh2List = Object.keys(TOPTAN_KATSAYI)
      .filter((u) => !isToptanOutlierUh2(u))
      .sort((a, b) => a.localeCompare(b, "tr-TR"));
    const thead = `<thead><tr><th>ÜH2</th>${months.map((m) => `<th>${m}</th>`).join("")}</tr></thead>`;
    const tbody = "<tbody>" + uh2List.map((uh2) => {
      const node = TOPTAN_KATSAYI[uh2] || {};
      const cells = months.map((_, i) => {
        const raw = node[String(i + 1)];
        if (raw == null) return `<td class="kanit-heat-cell kanit-heat-empty">—</td>`;
        const clipped = Math.max(0.5, Math.min(2.0, raw));
        return `<td class="kanit-heat-cell" style="background:${heatDiverge(raw)}" title="${uh2} — ${months[i]}: ${fmtD2(clipped)}">${fmtD2(clipped)}</td>`;
      }).join("");
      return `<tr><td class="kanit-heat-rowlabel">${uh2}</td>${cells}</tr>`;
    }).join("") + "</tbody>";
    table.innerHTML = thead + tbody;
  }
  function renderKanitYillikRasyo() {
    const el = $("kanitYillikRasyo");
    if (!el || typeof KANIT === "undefined") return;
    const data = KANIT.yillik_rasyo;
    const maxVal = Math.max(...data.map((d) => d.r), 1) * 1.15;
    const refPct = (1 / maxVal) * 100;
    el.innerHTML = data.map((d) => {
      const barPct = (d.r / maxVal) * 100;
      const cls = d.r >= 1 ? "over" : "under";
      return `
        <div class="kanit-bar-row">
          <div class="kanit-bar-label" title="${d.uh2}">${d.uh2}</div>
          <div class="kanit-bar-track">
            <div class="kanit-bar-fill ${cls}" style="width:${barPct}%"></div>
            <div class="kanit-bar-refline" style="left:${refPct}%" title="1,0 referans"></div>
          </div>
          <div class="kanit-bar-value">${fmtD2(d.r)}</div>
        </div>`;
    }).join("");
  }
  function renderKanitMevsim() {
    const el = $("kanitMevsim");
    if (!el || typeof KANIT === "undefined") return;
    el.innerHTML = KANIT.mevsim.map((m) => `
      <div class="action-card">
        <b>${m.baslik}</b>
        <div style="margin-top:4px;font-size:12px;color:#33475b;line-height:1.5">${m.metin}</div>
      </div>`).join("");
  }
  function renderKanitFootnote() {
    const el = $("kanitFootnote");
    if (!el) return;
    el.textContent = "Not: Bu analiz geçmiş gerçek veriden üretildi. Sapmanın bir kısmı, " +
      "siparişle satışın aynı aya denk gelmemesinden (2 aylık gecikme) kaynaklanır; ürün " +
      "grubu ve çeyrek bazında toplandığında doğruluk daha da artar.";
  }
  function renderKanit() {
    renderKanitKpis();
    renderKanitLeadLag();
    renderKanitHeatmap();
    renderKanitYillikRasyo();
    renderKanitMevsim();
    renderKanitFootnote();
  }
  // --- Toptan (Sell-in) Bütçe — Envanter Akış Kimliği (bkz. CLAUDE.md Bölüm 13) ---
  // Toptan = Perakende Bütçe + (Hedef Bayi Stok − Mevcut Bayi Stok)
  const TR_MONTH_NUM = {
    "OCAK": 1, "ŞUBAT": 2, "MART": 3, "NİSAN": 4, "MAYIS": 5, "HAZİRAN": 6,
    "TEMMUZ": 7, "AĞUSTOS": 8, "EYLÜL": 9, "EKİM": 10, "KASIM": 11, "ARALIK": 12,
  };
  // Bir periyot etiketinden (ör. "2027 Ocak" → 1, "2027 Tam Yıl" → null) ay çıkarır.
  // Her kayıtlı satırın KENDİ targetperiod'undan çağrılır (bkz. computeToptanFromSaved) —
  // artık tek bir global sidebar seçimi değil, satır bazlı.
  function monthFromPeriodLabel(label) {
    const lastWord = String(label || "").toLocaleUpperCase("tr-TR").trim().split(/\s+/).pop();
    return TR_MONTH_NUM[lastWord] || null;
  }
  // Güvenilmez/uç ÜH2'ler (rasyo yüzlerce/binlerce, yeni rampa, İPTAL, GRUPSUZ) — katsayı yerine 1,0 kullan
  function isToptanOutlierUh2(uh2) {
    const u = (uh2 || "").toLocaleUpperCase("tr-TR");
    return u.includes("SOLAR ENERJI") || u.includes("İPTAL") || u === "GRUPSUZ" ||
      u.includes("HAVALANDIRMA") || u.includes("HIJYEN") || u.includes("PROFESYONEL GÖRÜNTÜLEME");
  }
  function toptanKatsayiRaw(uh2, ay) {
    const table = (typeof TOPTAN_KATSAYI !== "undefined") ? TOPTAN_KATSAYI : {};
    const node = table[uh2];
    if (!node) return null;
    if (ay && node[String(ay)] != null) return node[String(ay)];
    const vals = Object.values(node).filter((v) => v != null);
    return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
  }
  function getToptanKatsayi(uh2, ay) {
    if (isToptanOutlierUh2(uh2)) return 1;
    const raw = toptanKatsayiRaw(uh2, ay);
    if (raw == null || !isFinite(raw)) return 1;
    return Math.max(0.5, Math.min(2, raw));
  }
  // Toptan Bütçe artık CANLI sidebar seçiminden DEĞİL, Kayıtlar'daki (loadSavedMixSets)
  // KAYITLI/dondurulmuş satırlardan besleniyor — buildFlatRows() (Kayıtlar sekmesiyle
  // AYNI düzleştirme) her satırın kendi salesBudget/hedefCover/stock/uh2/targetperiod
  // değerini taşıyor; global parametreler (Hedef Stok Büyümesi % vb.) burayı ETKİLEMEZ,
  // sadece yeniden Kaydet/Revize Et yapılan gruplar güncellenir (bkz. CLAUDE.md 13).
  function computeToptanFromSaved() {
    const flat = buildFlatRows();
    const rows = flat.map((r) => {
      // Mevsimsel katsayı için ay artık HER SATIRIN KENDİ Hedef Periyot'undan türetiliyor
      const ay = monthFromPeriodLabel(r.targetperiod);
      const katsayi = getToptanKatsayi(r.uh2, ay);
      const hedefBayiStok = r.hedefCover * r.salesBudget;
      const mevcutBayiStok = r.stock;
      const deltaStok = hedefBayiStok - mevcutBayiStok;
      // Bayiye eksi adet sevk edilemez — 0'ın altına düşen ham değer burada kırpılır.
      // toptanButceClipped: hücrede "Sevki durdur" etiketi mi, yoksa sayı mı gösterilecek.
      const toptanButceRaw = r.salesBudget + deltaStok;
      const toptanButce = Math.max(0, toptanButceRaw);
      const toptanButceClipped = toptanButceRaw < 0;
      const mevsimselKontrol = r.salesBudget * katsayi;
      return {
        org: r.salesOrg, region: r.region, uh1: r.uh1, uh2: r.uh2, uh3: r.uh3, name: r.name,
        baseperiod: r.baseperiod, targetperiod: r.targetperiod, stock: r.stock, sales: r.sales,
        salesBudget: r.salesBudget, hedefCover: r.hedefCover, lyCover: r.lyCover,
        mevcutBayiStok, hedefBayiStok, deltaStok, toptanButce, toptanButceClipped, mevsimselKontrol,
      };
    });
    // TOPLAM = TÜM kayıtlı satırların (kırpılmış) toplamı (önce kırp, sonra topla)
    const T = rows.reduce((a, r) => {
      a.stock += r.stock; a.sales += r.sales;
      a.salesBudget += r.salesBudget; a.mevcutBayiStok += r.mevcutBayiStok;
      a.hedefBayiStok += r.hedefBayiStok; a.deltaStok += r.deltaStok;
      a.toptanButce += r.toptanButce; a.mevsimselKontrol += r.mevsimselKontrol;
      return a;
    }, { stock: 0, sales: 0, salesBudget: 0, mevcutBayiStok: 0, hedefBayiStok: 0, deltaStok: 0, toptanButce: 0, mevsimselKontrol: 0 });
    T.cover = T.sales ? T.stock / T.sales : 0; // ana tablodaki footCover ile AYNI yöntem (ağırlıklı toplam)
    return { rows, T };
  }
  // Durum kolonu: TOPTAN BÜTÇE artık HER ZAMAN sayısal (bkz. renderToptanFromSaved) —
  // kırpma durumu/sevkiyat aksiyonu buraya, ayrı bir rozet kolonuna taşındı.
  // Kırpıldıysa (ham değer <0) kırmızı uyarı; pozitif sevkiyat varsa nötr "Sevk et";
  // ham değer tam olarak 0'sa (kırpma değil, gerçek sıfır talep) rozet YOK.
  function toptanDurumBadge(r) {
    if (r.toptanButceClipped) {
      return '<span class="badge b-red" title="Perakende Bütçe + Δ Stok < 0: bayi zaten hedef stok seviyesinin üzerinde, bu dönem için ek sevkiyat gerekmiyor">Sevki durdur (bayi fazla stoklu)</span>';
    }
    if (r.toptanButce > 0) return '<span class="badge b-grey">Sevk et</span>';
    return "";
  }
  // Envanter-köprüsü toptanı (T.toptanButce) ile mevsimsel kontrol toptanının
  // (T.mevsimselKontrol) ÜH2 toplam düzeyinde yakınsama yüzdesi (0-100).
  // Satır bazlı ✓uyumlu/⚠farklı karşılaştırmasının YERİNE geçen tek özet metrik.
  function computeToptanYakinsama(T) {
    const a = T.toptanButce, b = T.mevsimselKontrol;
    const maxAB = Math.max(a, b);
    return maxAB > 0 ? Math.max(0, 100 - Math.abs(a - b) / maxAB * 100) : 100;
  }
  function renderToptanConvergence(T, hasRows) {
    const el = $("toptanConvergence");
    if (!el) return;
    if (!hasRows) { el.className = "toptan-convergence"; el.innerHTML = ""; return; }
    const yakinsama = computeToptanYakinsama(T);
    const good = yakinsama >= 80;
    el.className = "toptan-convergence " + (good ? "good" : "bad");
    el.innerHTML = `<span>${good ? "✓" : "⚠"} Bu seçimde iki yöntem ÜH2 düzeyinde %${Math.round(yakinsama)} yakınsıyor</span>
      <span class="toptan-convergence-sub">Envanter Köprüsü: ${fmtN(T.toptanButce)} adet · Mevsimsel Kontrol: ${fmtN(T.mevsimselKontrol)} adet</span>`;
  }

  // --- Toptan Bütçe tablosu: sütun genişlikleri hücre içeriğine göre otomatik ---
  // Ana #grid'in aksine (elle ölçülüp sabitlenmiş genişlikler + kullanıcı sürükleme),
  // bu tablonun içeriği seçime göre çok değişken (farklı ÜH4 adları, farklı büyüklükte
  // sayılar) — bu yüzden HER render'da GERÇEK içerikten yeniden ölçülür. table-layout:
  // fixed KORUNUR (table-layout:auto #grid'de öngörülemez sıkışmaya yol açtığı için
  // reddedilmişti, bkz. #grid{width:...} yorumu) — sadece <colgroup>'taki piksel
  // değerleri ve tablo genişliği JS ile güncellenir. Satır yüksekliği zaten HTML
  // tablolarının doğal davranışıyla içeriğe göre otomatik (hiçbir yerde sabit
  // yükseklik verilmedi), bu yüzden ayrı bir satır-yüksekliği hesabı gerekmiyor.
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
        const text = (badge ? badge.textContent : td.textContent).trim();
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
  function renderToptanFromSaved() {
    const tbody = $("toptanRows");
    if (!tbody) return;
    const data = computeToptanFromSaved();
    if (!data.rows.length) {
      tbody.innerHTML = `<tr><td colspan="16" style="text-align:center;color:var(--grey);padding:18px">Henüz kayıtlı bir çalışma yok. Önce Bütçe &amp; Stok Miks ekranından bir kombinasyon çalışıp kaydedin.</td></tr>`;
      $("toptanFoot").innerHTML = "";
      renderToptanConvergence(data.T, false);
      autoFitToptanColumns();
      return;
    }
    tbody.innerHTML = data.rows.map((r) => `
      <tr>
        <td>${r.org}</td>
        <td>${r.region}</td>
        <td>${r.uh1}</td>
        <td>${r.uh2}</td>
        <td>${r.uh3}</td>
        <td>${r.name}</td>
        <td>${r.baseperiod}</td>
        <td>${r.targetperiod}</td>
        <td class="num-cell">${fmtN(r.salesBudget)}</td>
        <td>${fmtD(r.hedefCover)}</td>
        <td>${fmtD(r.lyCover)}</td>
        <td class="num-cell">${fmtN(r.mevcutBayiStok)}</td>
        <td class="num-cell">${fmtN(r.hedefBayiStok)}</td>
        <td class="num-cell ${r.deltaStok >= 0 ? "up" : "down"}">${r.deltaStok >= 0 ? "+" : ""}${fmtN(r.deltaStok)}</td>
        <td>${toptanDurumBadge(r)}</td>
        <td class="num-cell toptan-highlight">${fmtN(r.toptanButce)}</td>
      </tr>`).join("");
    $("toptanFoot").innerHTML = `
      <td>TOPLAM</td>
      <td>—</td>
      <td>—</td>
      <td>—</td>
      <td>—</td>
      <td>—</td>
      <td>—</td>
      <td>—</td>
      <td class="num-cell">${fmtN(data.T.salesBudget)}</td>
      <td>—</td>
      <td>${fmtD(data.T.cover)}</td>
      <td class="num-cell">${fmtN(data.T.mevcutBayiStok)}</td>
      <td class="num-cell">${fmtN(data.T.hedefBayiStok)}</td>
      <td class="num-cell ${data.T.deltaStok >= 0 ? "up" : "down"}">${data.T.deltaStok >= 0 ? "+" : ""}${fmtN(data.T.deltaStok)}</td>
      <td>—</td>
      <td class="num-cell toptan-highlight">${fmtN(data.T.toptanButce)}</td>`;
    renderToptanConvergence(data.T, true);
    autoFitToptanColumns();
  }

  function renderForecast(model) {
    const m = model || computeModel(readParams(), state.covers, state.tyFiyat);
    const method = $("fcMethod").value;
    const covSum = state.covers.reduce((a, b) => a + b, 0);
    const avgCover = (state.covers.length && covSum) ? covSum / state.covers.length : 0;
    const months = DataService.months();
    const seasonal = DataService.seasonal();
    let idx;
    if (method === "seasonal") idx = seasonal;
    else if (method === "avg")
      idx = seasonal.map((_, i) => (seasonal[i] + seasonal[(i + 11) % 12] + seasonal[(i + 10) % 12]) / 3);
    else idx = seasonal.map(() => 1);
    const base = m.T.sales / 12;
    const sumIdx = idx.reduce((a, b) => a + b, 0);
    $("fcRows").innerHTML = months.map((mo, i) => {
      const ly = base * seasonal[i];
      const ty = m.T.salesBudget * (idx[i] / sumIdx);
      return `<tr><td>${mo}</td><td>${fmtN(ly)}</td><td>${fmtD2(idx[i])}</td>
        <td class="num-cell">${fmtN(ty)}</td><td>${fmtN(ty * avgCover)}</td></tr>`;
    }).join("");
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
    $("fcMethod").addEventListener("change", () => renderForecast());
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
  function initFormulaModal() {
    const overlay = $("formulaModal");
    const btn = $("formulaInfoBtn");
    const closeBtn = $("formulaModalClose");
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

  // --- Toptan Bütçe "Nasıl Çalışır?" bilgi paneli aç/kapa (sadece görünürlük) ---
  function initToptanInfoToggle() {
    const box = $("toptanInfoBox");
    const ico = $("toptanInfoToggle");
    const head = box && box.previousElementSibling;
    if (!box || !ico || !head) return;
    head.addEventListener("click", () => {
      const opening = box.style.display === "none";
      box.style.display = opening ? "flex" : "none";
      ico.textContent = opening ? "▾" : "▸";
    });
  }

  // --- Sürüklenebilir sütun genişliği (SADECE #grid) + localStorage kalıcılık ---
  // Bu GERÇEK bir web uygulaması (GitHub Pages), Claude "artifact" ortamı DEĞİL — localStorage kullanılır.
  const GRID_COLS_KEY = "arpaz_grid_col_widths";
  const COL_MIN_WIDTHS = { 0: 80, 12: 76, 14: 76, 19: 90, 20: 120 }; // ÜH4, Hedef Cover, TY Fiyat, Durum, Aksiyon
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
  }

  document.addEventListener("DOMContentLoaded", () => {
    initHierarchy();
    DataService._cur = { sel: state.sel, level: state.level };
    DataService.loadMix = function () { return this.loadMixFor(this._cur.sel, this._cur.level); };
    buildTable();
    bind();
    initFormulaModal();
    initNumFields();
    initToptanInfoToggle();
    initColResize();
    initGridFormat();
    renderSavedMixTable();
    updateAll();
    updateSelInfo();
    updateSaveButtonState();
    renderToptanFromSaved(); // ilk yüklemede de Kayıtlar'ın o anki hali gösterilsin
    renderRollup();          // Özet/Rollup da ilk yüklemede Kayıtlar'ı yansıtsın
    renderCalendar();
    renderKanit();
  });
})();

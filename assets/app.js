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

  const CAMP = ["paro", "bundle", "event", "gam", "kota"];
  const OLU_STOK_CARPANI = 3; // sabit: grup medyanının 3 katı (kullanıcı ayarlamıyor)
  const state = { covers: null, tyFiyat: null, sel: null, level: "uh4" };  // seçim + Hedef Cover + TY Fiyat

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
      fillSelect($("h_org"), DataService.orgs(), "Tümü");
      $("h_org").value = "";
      autoFitSelectFont($("h_org"));
      $("h_org").addEventListener("change", () => { DataService.setOrg($("h_org").value); autoFitSelectFont($("h_org")); rebuild(); });
    }
    if (document.getElementById('h_region')) {
      fillSelect($("h_region"), DataService.regions(), "Tümü");
      $("h_region").value = "";
      autoFitSelectFont($("h_region"));
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
  }
  function updateSelInfo() {
    const path = [state.sel.uh1, state.sel.uh2, state.sel.uh3].filter(Boolean).join(" › ");
    const n = DataService.loadMix().length;
    $("selInfo").textContent = `Seçim: ${path}  •  Seviye: ${state.level.toUpperCase()}  •  ${n} satır.`;
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
      wKar: num("w_kar", 40), wSatis: num("w_satis", 30), wStok: num("w_stok", 20),
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

      const planPct = (p.wKar * profitShare + p.wSatis * salesShare + p.wStok * stockShare) / wsum;
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
      $("rows").innerHTML = `<tr><td colspan="21" style="text-align:center;color:var(--grey);padding:18px">Bu seçim için veri bulunamadı.</td></tr>`;
      state.covers = [];
      state.tyFiyat = [];
      return;
    }
    if (!state.covers || state.covers.length !== data.length)
      state.covers = data.map((d) => Math.max(1, Math.round(d[1] / (d[2] || 1)))); // default = LY cover
    if (!state.tyFiyat || state.tyFiyat.length !== data.length)
      state.tyFiyat = new Array(data.length).fill(null);   // null = otomatik hesap (LY Fiyat × Fiyat Büyümesi)

    const tb = $("rows");
    tb.innerHTML = "";

    data.forEach((d, i) => {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${d[0]}</td>
        <td class="num-cell" id="st_${i}"></td><td class="pct" id="stp_${i}"></td>
        <td class="num-cell" id="sa_${i}"></td><td class="pct" id="sap_${i}"></td>
        <td class="num-cell" id="bk_${i}"></td>
        <td id="ktp_${i}"></td>
        <td id="cov_${i}"></td><td id="tov_${i}"></td>
        <td id="lyfiyat_${i}"></td>
        <td class="pct" id="psp_${i}"></td><td class="num-cell" id="psa_${i}"></td>
        <td class="covcell"><input type="number" class="covin" id="hcov_${i}" min="1" step="0.5" value="${state.covers[i]}"></td>
        <td class="num-cell" id="sb_${i}"></td>
        <td class="fiyatcell"><input type="number" class="fiyatin" id="tyfiyat_${i}" min="0" step="0.01"></td>
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
    });
  }

  // --- Hücreleri güncelle (DOM'u yeniden kurmadan) ---
function updateAll() {
  const p = readParams();
  CAMP.forEach((k) => ($("v_" + k).textContent = $("m_" + k).value + "%"));
  const m = computeModel(p, state.covers, state.tyFiyat);
  $("mult_total").textContent = fmtX(m.pazarF * m.campF);

  m.rows.forEach((r, i) => {
    $("st_" + i).textContent = fmtN(r.stock);
    $("stp_" + i).textContent = fmtP(r.stockShare);
    $("sa_" + i).textContent = fmtN(r.sales);
    $("sap_" + i).textContent = fmtP(r.salesShare);
    $("bk_" + i).textContent = fmtN(r.profit);
    $("ktp_" + i).innerHTML = `<span class="heat" style="background:${heat(r.profitShare, 0, 0.3)}">${fmtP(r.profitShare)}</span>`;
    $("cov_" + i).innerHTML = coverCellHtml(r);
    $("tov_" + i).textContent = fmtD2(r.turnover);
    $("lyfiyat_" + i).textContent = fmtD2(r.lyFiyat);
    $("psp_" + i).textContent = fmtP(r.planPct);
    $("psa_" + i).textContent = fmtN(r.planStock);
    $("sb_" + i).textContent = fmtN(r.salesBudget);
    const fiyatEl = $("tyfiyat_" + i);
    if (fiyatEl && document.activeElement !== fiyatEl) fiyatEl.value = r.tyFiyat.toFixed(2);
    $("ciro_" + i).textContent = fmtN(r.tyRevenue);
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
    <td>${fmtN(m.T.stock)}</td><td>${m.rows.length ? "100%" : "—"}</td>
    <td>${fmtN(m.T.sales)}</td><td>${m.rows.length ? "100%" : "—"}</td>
    <td class="num-cell">${fmtN(m.T.profit)}</td><td>${m.rows.length ? "100%" : "—"}</td>
    <td>${fmtD(footCover)}</td><td>${fmtD2(footTurnover)}</td>
    <td>${fmtD2(footLyFiyat)}</td>
    <td>${m.rows.length ? "100%" : "—"}</td><td>${fmtN(m.T.planStock)}</td>
    <td>${footHedefCover === null ? "—" : fmtD(footHedefCover)}</td><td>${fmtN(m.T.salesBudget)}</td>
    <td>${footTyFiyat === null ? "—" : fmtD2(footTyFiyat)}</td>
    <td>${fmtN(m.T.tyRevenue)}</td>
    <td class="${m.rows.length ? (m.T.lfl >= 0 ? "up" : "down") : ""}">${m.rows.length ? fmtP0(m.T.lfl) : "—"}</td>
    <td class="${footRlfl === null ? "" : (footRlfl >= 0 ? "up" : "down")}">${footRlfl === null ? "—" : fmtP0(footRlfl)}</td>
    <td class="${m.rows.length ? (footStockGrowth >= 0 ? "up" : "down") : ""}">${m.rows.length ? fmtP0(footStockGrowth) : "—"}</td>
    <td></td><td></td>`;

  renderKpis(m);
  renderDurumKpis(m);
  renderForecast(m);
}

  function heat(v, lo, hi) {
    const t = Math.max(0, Math.min(1, (v - lo) / (hi - lo)));
    const r = Math.round(198 + (46 - 198) * t);
    const g = Math.round(40 + (125 - 40) * t);
    const b = Math.round(40 + (50 - 40) * t);
    return `rgba(${r},${g},${b},.14)`;
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

  // --- Durum dağılımı özet KPI'ları (2x2 matris — bkz. actionTag) ---
  // Kategori adları/rozet sınıfları actionTag'ten üretilir, burada tekrar yazılmaz.
  function renderDurumKpis(m) {
    const quadrants = [
      { stockShare: 0, salesShare: 1, profitShare: 1 }, // Hızlı & Kârlı
      { stockShare: 1, salesShare: 2, profitShare: 0 }, // Hızlı & Kârsız
      { stockShare: 1, salesShare: 0, profitShare: 2 }, // Yavaş & Kârlı
      { stockShare: 1, salesShare: 0, profitShare: 0 }, // Yavaş & Kârsız
    ];
    const total = m.rows.length;
    const cards = quadrants.map((q) => {
      const tag = actionTag(q.stockShare, q.salesShare, q.profitShare);
      const count = m.rows.filter((r) => r.tag.etiket === tag.etiket).length;
      const pct = total ? count / total : 0;
      return { tag, count, pct };
    });
    $("durumKpis").innerHTML = cards.map((c) => `
      <div class="kpi">
        <div class="lbl"><span class="badge ${c.tag.eCls}">${c.tag.etiket}</span></div>
        <div class="val">${c.count}</div>
        <div class="sub">${fmtP0(c.pct)}</div>
      </div>`).join("");
  }

  // --- Senaryo yönetimi ---
  let scenarios = [];
  function currentScenario() {
    const p = readParams();
    const m = computeModel(p, state.covers, state.tyFiyat);
    return { p, budget: m.T.salesBudget, planStock: m.T.planStock, lfl: m.T.lfl };
  }
  function renderScenarios() {
    const tb = $("scRows"); tb.innerHTML = "";
    scenarios.forEach((s, i) => {
      const p = s.p;
      const campF = CAMP.reduce((a, k) => a * (1 + p.camp[k] / 100), 1) * (1 + p.pazar / 100);
      const tr = document.createElement("tr");
      tr.innerHTML = `<td>${s.name}</td><td>${p.stokBuyume}%</td><td>${p.pazar}%</td>
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
  }

  // --- Takvim / Rasyo / Forecast ---
  function renderCalendar() {
    $("calRows").innerHTML = DataService.loadCalendar()
      .map((c) => `<tr><td>${c[0]}</td><td>${c[1]}</td>
        <td><span class="badge b-blue">${c[2]}</span></td><td>${c[3]}</td>
        <td><span class="badge b-amber">${c[4]}</span></td><td class="up">${c[5]}</td></tr>`).join("");
  }
  function renderRatio() {
    $("ratioRows").innerHTML = DataService.loadRatio()
      .map((r) => `<tr><td>${r[0]}</td><td>${r[1]}%</td><td>${r[2]}%</td>
        <td><b>${fmtD2(r[1] / r[2])}</b></td><td>${r[3]}</td></tr>`).join("");
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
  function bind() {
    ["p_stokbuyume","p_pazar","p_fiyatbuyume","w_kar","w_satis","w_stok",...CAMP.map(k=>"m_"+k)]
      .forEach((id) => $(id).addEventListener("input", updateAll));
    $("fcMethod").addEventListener("change", () => renderForecast());
    document.querySelectorAll(".tabs button").forEach((b) => {
      b.addEventListener("click", () => {
        document.querySelectorAll(".tabs button").forEach((x) => x.classList.remove("active"));
        b.classList.add("active");
        const t = b.dataset.tab;
        document.querySelectorAll(".tabpane").forEach((p) => (p.style.display = p.dataset.pane === t ? "" : "none"));
      });
    });
    $("saveSc").onclick = () => {
      const s = currentScenario();
      s.name = $("scName").value.trim() || "Senaryo " + (scenarios.length + 1);
      scenarios.push(s); $("scName").value = ""; renderScenarios();
    };
    $("clearSc").onclick = () => { scenarios = []; renderScenarios(); };
  }

  // --- Formül kutusu aç/kapa (sadece görünürlük, hesaba etkisi yok) ---
  function initFormulaToggle() {
    const box = $("formulaBox");
    const ico = $("formulaToggle");
    const head = box && box.previousElementSibling; // .fbox'tan önceki <h2>
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

    // "↺ Görünümü sıfırla" — mevcut gridColReset butonuna İKİNCİ bir dinleyici (sütun
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
  }

  document.addEventListener("DOMContentLoaded", () => {
    initHierarchy();
    DataService._cur = { sel: state.sel, level: state.level };
    DataService.loadMix = function () { return this.loadMixFor(this._cur.sel, this._cur.level); };
    buildTable();
    bind();
    initFormulaToggle();
    initColResize();
    initGridFormat();
    updateAll();
    updateSelInfo();
    renderCalendar();
    renderRatio();
  });
})();

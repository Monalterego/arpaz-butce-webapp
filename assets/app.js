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
  const state = { covers: null, sel: null, level: "uh4" };  // seçim + Hedef Cover

  // --- Hiyerarşi kaskad seçimleri ---
  function fillSelect(el, items, placeholder) {
    el.innerHTML = (placeholder ? `<option value="">${placeholder}</option>` : "") +
      items.map((i) => `<option value="${i.replace(/"/g, "&quot;")}">${i}</option>`).join("");
  }
  function initHierarchy() {
    state.sel = DataService.firstSelection();
    const uh1s = Object.keys(HIERARCHY);
    fillSelect($("h_uh1"), uh1s);
    $("h_uh1").value = state.sel.uh1;
    refreshUh2(); refreshUh3();
    $("h_uh1").addEventListener("change", () => {
      state.sel.uh1 = $("h_uh1").value; state.sel.uh3 = "";
      refreshUh2(); refreshUh3(); rebuild();
    });
    $("h_uh2").addEventListener("change", () => {
      state.sel.uh2 = $("h_uh2").value; state.sel.uh3 = "";
      refreshUh3(); rebuild();
    });
    $("h_uh3").addEventListener("change", () => {
      state.sel.uh3 = $("h_uh3").value; rebuild();
    });
  }
  function refreshUh2() {
    const uh2s = Object.keys(HIERARCHY[state.sel.uh1] || {});
    fillSelect($("h_uh2"), uh2s);
    state.sel.uh2 = uh2s[0] || "";
    $("h_uh2").value = state.sel.uh2;
  }
  function refreshUh3() {
    const node = (HIERARCHY[state.sel.uh1] || {})[state.sel.uh2] || {};
    fillSelect($("h_uh3"), Object.keys(node), "Tümü (ÜH3)");
    $("h_uh3").value = state.sel.uh3 || "";
  }
  function rebuild() {
    // DataService güncel seçimi kullansın
    DataService._cur = { sel: state.sel, level: state.level };
    state.covers = null;             // yeni satırlara göre Hedef Cover'ı sıfırla
    buildTable();
    updateAll();
    updateSelInfo();
    // başlık kolon adı
    const head = state.level === "uh2" ? "Klasman (ÜH2)" : state.level === "uh3" ? "Alt Grup (ÜH3)" : "Grup (ÜH4)";
    $("grpColHead").textContent = head;
  }
  function updateSelInfo() {
    const path = [state.sel.uh1, state.sel.uh2, state.sel.uh3].filter(Boolean).join(" › ");
    const n = DataService.loadMix().length;
    $("selInfo").textContent = `Seçim: ${path}  •  Seviye: ${state.level.toUpperCase()}  •  ${n} satır  (metrikler prototip/deterministik).`;
  }

  // --- Parametreleri oku ---
  function readParams() {
    const num = (id, d) => { const v = parseFloat($(id).value); return isNaN(v) ? d : v; };
    const camp = {};
    CAMP.forEach((k) => (camp[k] = num("m_" + k, 0)));
    return {
      stokBuyume: num("p_stokbuyume", 0),
      pazar: num("p_pazar", 0),
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

  // --- SAF HESAP MODELİ (render'dan bağımsız) ---
  // computeFromData: herhangi bir veri kümesi (ÜH4 veya ÜH3) için hesaplar
  function computeFromData(data, p, covers) {
    const totStock = data.reduce((a, d) => a + d[1], 0);
    const totSales = data.reduce((a, d) => a + d[2], 0);
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

      const planPct = (p.wKar * profitShare + p.wSatis * salesShare + p.wStok * stockShare) / wsum;
      const planStock = totalPlanStock * planPct;
      const hedefCover = (covers && typeof covers[i] !== 'undefined') ? covers[i] : Math.max(1, Math.round(stock / (sales || 1)));
      const salesBudget = hedefCover ? (planStock / hedefCover) * pazarF * campF : 0;
      const lfl = sales ? salesBudget / sales - 1 : 0;
      const rlfl = (planStock && sales && stock) ? (salesBudget / planStock) / (sales / stock) - 1 : 0;
      const stockGrowth = stock ? planStock / stock - 1 : 0;
      const tag = actionTag(stockShare, salesShare, profitShare);

      return { name, stock, sales, profit, stockShare, salesShare, profitShare,
        lyCover, turnover, planPct, planStock, hedefCover, salesBudget, lfl, rlfl, stockGrowth, tag };
    });

    const T = {
      stock: totStock, sales: totSales, profit: totProfit,
      planStock: rows.reduce((a, r) => a + r.planStock, 0),
      salesBudget: rows.reduce((a, r) => a + r.salesBudget, 0),
    };
    T.lfl = T.salesBudget / (totSales || 1) - 1;
    T.cover = totStock / (totSales || 1);
    return { rows, T, campF, pazarF };
  }

  // computeModel: mevcut görünümdeki DataService.loadMix() için wrapper
  function computeModel(p, covers) {
    const data = DataService.loadMix();
    return computeFromData(data, p, covers);
  }

  // --- Tabloyu bir kez kur (input'lar korunsun diye) ---
  function buildTable() {
    const data = DataService.loadMix();
    // main covers = ÜH3 veya ÜH4 satırlarına göre set edilir
    if (!state.covers)
      state.covers = data.map((d) => Math.max(1, Math.round(d[1] / (d[2] || 1)))); // default = LY cover
    state.childCovers = state.childCovers || {}; // key: `${i}_${j}` for ÜH4 children under ÜH3 index i

    const tb = $("rows");
    tb.innerHTML = "";

    if (state.level !== 'uh3') {
      // existing behavior for ÜH4 or ÜH2 views
      data.forEach((d, i) => {
        const tr = document.createElement("tr");
        tr.innerHTML = `
          <td>${d[0]}</td>
          <td class="num-cell" id="st_${i}"></td><td class="pct" id="stp_${i}"></td>
          <td class="num-cell" id="sa_${i}"></td><td class="pct" id="sap_${i}"></td>
          <td class="num-cell" id="bk_${i}"></td>
          <td id="ktp_${i}"></td>
          <td id="cov_${i}"></td><td id="tov_${i}"></td>
          <td class="pct" id="psp_${i}"></td><td class="num-cell" id="psa_${i}"></td>
          <td class="covcell"><input type="number" class="covin" id="hcov_${i}" min="1" step="0.5" value="${state.covers[i]}"></td>
          <td class="num-cell" id="sb_${i}"></td>
          <td id="lfl_${i}"></td><td id="sg_${i}"></td>
          <td id="tag_${i}"></td>
          <td id="act_${i}"></td>`;
        tb.appendChild(tr);
      });
      // Hedef Cover input dinleyicileri
      data.forEach((d, i) => {
        $("hcov_" + i).addEventListener("input", (e) => {
          const v = parseFloat(e.target.value);
          state.covers[i] = isNaN(v) || v <= 0 ? state.covers[i] : v;
          updateAll();
        });
      });
      return;
    }

    // --- UH3 görünümü: ÜH3 satırı + gizli ÜH4 alt satırlar ---
    data.forEach((d, i) => {
      // ÜH3 ana satır
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td><span class="expander" data-i="${i}">▶</span>${d[0]}</td>
        <td class="num-cell" id="st_${i}"></td><td class="pct" id="stp_${i}"></td>
        <td class="num-cell" id="sa_${i}"></td><td class="pct" id="sap_${i}"></td>
      <td class="num-cell" id="bk_${i}"></td>
      <td id="ktp_${i}"></td>
      <td id="cov_${i}"></td><td id="tov_${i}"></td>
      <td class="pct" id="psp_${i}"></td><td class="num-cell" id="psa_${i}"></td>
      <td class="covcell"><input type="number" class="covin" id="hcov_${i}" min="1" step="0.5" value="${state.covers[i]}"></td>
      <td class="num-cell" id="sb_${i}"></td>
      <td id="lfl_${i}"></td><td id="sg_${i}"></td>
      <td id="tag_${i}"></td>
      <td id="act_${i}"></td>`;
      tb.appendChild(tr);

      // ÜH4 alt satırlar (gizli başlat)
      const uh3name = d[0];
      const uh4data = DataService.loadMixFor({ uh1: state.sel.uh1, uh2: state.sel.uh2, uh3: uh3name }, 'uh4');
      uh4data.forEach((c, j) => {
        const key = `${i}_${j}`;
        if (typeof state.childCovers[key] === 'undefined')
          state.childCovers[key] = Math.max(1, Math.round(c[1] / (c[2] || 1)));
        const ctr = document.createElement("tr");
        ctr.className = `child-row parent-${i}`;
        ctr.style.display = 'none';
        ctr.innerHTML = `
          <td style="padding-left:18px">${c[0]}</td>
          <td class="num-cell" id="st_${i}_c${j}"></td><td class="pct" id="stp_${i}_c${j}"></td>
          <td class="num-cell" id="sa_${i}_c${j}"></td><td class="pct" id="sap_${i}_c${j}"></td>
          <td class="num-cell" id="bk_${i}_c${j}"></td>
          <td id="ktp_${i}_c${j}"></td>
          <td id="cov_${i}_c${j}"></td><td id="tov_${i}_c${j}"></td>
          <td class="pct" id="psp_${i}_c${j}"></td><td class="num-cell" id="psa_${i}_c${j}"></td>
          <td class="covcell"><input type="number" class="covin" id="hcov_${i}_c${j}" min="1" step="0.5" value="${state.childCovers[key]}"></td>
          <td class="num-cell" id="sb_${i}_c${j}"></td>
          <td id="lfl_${i}_c${j}"></td><td id="sg_${i}_c${j}"></td>
          <td id="tag_${i}_c${j}"></td>
          <td id="act_${i}_c${j}"></td>`;
        tb.appendChild(ctr);
      });
    });

    // Expander click handler
    document.querySelectorAll('.expander').forEach((el) => {
      el.addEventListener('click', (e) => {
        const i = el.dataset.i;
        const opened = el.textContent === '▼';
        const list = document.querySelectorAll('.parent-' + i);
        list.forEach((r) => r.style.display = opened ? 'none' : 'table-row');
        el.textContent = opened ? '▶' : '▼';
      });
    });

    // Hedef Cover input dinleyicileri (ana + child)
    data.forEach((d, i) => {
      $("hcov_" + i).addEventListener("input", (e) => {
        const v = parseFloat(e.target.value);
        state.covers[i] = isNaN(v) || v <= 0 ? state.covers[i] : v;
        updateAll();
      });
      const uh3name = d[0];
      const uh4data = DataService.loadMixFor({ uh1: state.sel.uh1, uh2: state.sel.uh2, uh3: uh3name }, 'uh4');
      uh4data.forEach((c, j) => {
        const key = `${i}_${j}`;
        $("hcov_" + i + "_c" + j).addEventListener('input', (e) => {
          const v = parseFloat(e.target.value);
          state.childCovers[key] = isNaN(v) || v <= 0 ? state.childCovers[key] : v;
          updateAll();
        });
      });
    });
  }

  // --- Hücreleri güncelle (DOM'u yeniden kurmadan) ---
  function updateAll() {
    const p = readParams();
    CAMP.forEach((k) => ($("v_" + k).textContent = $("m_" + k).value + "%"));
    const m = computeModel(p, state.covers);
    $("mult_total").textContent = fmtX(m.pazarF * m.campF);

    // Ana satırlar (ÜH4 veya ÜH3 aggregate)
    m.rows.forEach((r, i) => {
      $("st_" + i).textContent = fmtN(r.stock);
      $("stp_" + i).textContent = fmtP(r.stockShare);
      $("sa_" + i).textContent = fmtN(r.sales);
      $("sap_" + i).textContent = fmtP(r.salesShare);
    $("bk_" + i).textContent = fmtN(r.profit);
    $("ktp_" + i).innerHTML = `<span class="heat" style="background:${heat(r.profitShare, 0, 0.3)}">${fmtP(r.profitShare)}</span>`;
    $("cov_" + i).textContent = fmtD(r.lyCover);
    $("tov_" + i).textContent = fmtD2(r.turnover);
    $("psp_" + i).textContent = fmtP(r.planPct);
    $("psa_" + i).textContent = fmtN(r.planStock);
    $("sb_" + i).textContent = fmtN(r.salesBudget);
    const lflEl = $("lfl_" + i); lflEl.textContent = fmtP0(r.lfl); lflEl.className = r.lfl >= 0 ? "up" : "down";
    const sgEl = $("sg_" + i); sgEl.textContent = fmtP0(r.stockGrowth); sgEl.className = r.stockGrowth >= 0 ? "up" : "down";
    $("tag_" + i).innerHTML = `<span class="badge ${r.tag.eCls}">${r.tag.etiket}</span>`;
    $("act_" + i).innerHTML = `<span class="badge ${r.tag.aCls}">${r.tag.aksiyon}</span>`;
    // ensure Hedef Cover input value shown
    const covEl = $("hcov_" + i);
    if (covEl && document.activeElement !== covEl) covEl.value = r.hedefCover;
    });

    // Eğer ÜH3 görünümündeyse, her ÜH3 için altındaki ÜH4'leri hesaplayıp doldur
    if (state.level === 'uh3') {
      const data = DataService.loadMix(); // ÜH3 list
      data.forEach((d, i) => {
        const uh3name = d[0];
        const uh4data = DataService.loadMixFor({ uh1: state.sel.uh1, uh2: state.sel.uh2, uh3: uh3name }, 'uh4');
        // child covers sıralı dizi
        const childCovers = uh4data.map((c, j) => state.childCovers[`${i}_${j}`]);
        const childModel = computeFromData(uh4data, p, childCovers);
        childModel.rows.forEach((r, j) => {
          const prefix = `${i}_c${j}`;
          const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
          set('st_' + prefix, fmtN(r.stock)); set('stp_' + prefix, fmtP(r.stockShare));
          set('sa_' + prefix, fmtN(r.sales)); set('sap_' + prefix, fmtP(r.salesShare));
          set('bk_' + prefix, fmtN(r.profit));
          set('ktp_' + prefix, `<span class="heat" style="background:${heat(r.profitShare, 0, 0.3)}">${fmtP(r.profitShare)}</span>`);
          set('cov_' + prefix, fmtD(r.lyCover)); set('tov_' + prefix, fmtD2(r.turnover));
          set('psp_' + prefix, fmtP(r.planPct)); set('psa_' + prefix, fmtN(r.planStock));
          set('sb_' + prefix, fmtN(r.salesBudget));
          const lflEl = document.getElementById('lfl_' + prefix); if (lflEl) { lflEl.textContent = fmtP0(r.lfl); lflEl.className = r.lfl >= 0 ? 'up' : 'down'; }
          const sgEl = document.getElementById('sg_' + prefix); if (sgEl) { sgEl.textContent = fmtP0(r.stockGrowth); sgEl.className = r.stockGrowth >= 0 ? 'up' : 'down'; }
          const tEl = document.getElementById('tag_' + prefix); if (tEl) tEl.innerHTML = `<span class="badge ${r.tag.eCls}">${r.tag.etiket}</span>`;
          const aEl = document.getElementById('act_' + prefix); if (aEl) aEl.innerHTML = `<span class="badge ${r.tag.aCls}">${r.tag.aksiyon}</span>`;
          // ensure child cov input shows current value
          const covInput = document.getElementById('hcov_' + prefix);
          if (covInput && document.activeElement !== covInput) covInput.value = state.childCovers[`${i}_${j}`];
        });
      });
    }

    // footer, kpis ve forecast
    $("tfoot").innerHTML = `
      <td>TOPLAM</td>
      <td>${fmtN(m.T.stock)}</td><td>100%</td>
      <td>${fmtN(m.T.sales)}</td><td>100%</td>
      <td class="num-cell">${fmtN(m.T.profit)}</td><td>100%</td>
      <td>${fmtD(m.T.stock / m.T.sales)}</td><td>${fmtD2(m.T.sales / m.T.stock)}</td>
      <td>100%</td><td>${fmtN(m.T.planStock)}</td>
      <td>—</td><td>${fmtN(m.T.salesBudget)}</td>
      <td class="${m.T.lfl >= 0 ? "up" : "down"}">${fmtP0(m.T.lfl)}</td>
      <td class="${m.T.planStock / m.T.stock - 1 >= 0 ? "up" : "down"}">${fmtP0(m.T.planStock / m.T.stock - 1)}</td>
      <td></td><td></td>`;

    renderKpis(m);
    renderForecast(m);

}

  function heat(v, lo, hi) {
    const t = Math.max(0, Math.min(1, (v - lo) / (hi - lo)));
    const r = Math.round(198 + (46 - 198) * t);
    const g = Math.round(40 + (125 - 40) * t);
    const b = Math.round(40 + (50 - 40) * t);
    return `rgba(${r},${g},${b},.14)`;
  }

  function renderKpis(m) {
    const kpis = [
      ["Toplam Stok", fmtN(m.T.stock), "adet", ""],
      ["Toplam Satış (LY)", fmtN(m.T.sales), "adet", ""],
      ["Toplam Kâr (LY)", fmtN(m.T.profit), "₺", ""],
      ["Bayi Stok Ay (Cover)", fmtD(m.T.cover), "ay", ""],
      ["Toplam Satış Bütçe (TY)", fmtN(m.T.salesBudget), "adet", m.T.lfl >= 0 ? "up" : "down"],
      ["LFL Büyüme", fmtP0(m.T.lfl), "", m.T.lfl >= 0 ? "up" : "down"],
    ];
    $("kpis").innerHTML = kpis.map((k) => {
      const sc = k[3] === "up" || k[3] === "down" ? k[3] : "";
      return `<div class="kpi"><div class="lbl">${k[0]}</div>
        <div class="val">${k[1]}</div><div class="sub ${sc}">${k[2]}</div></div>`;
    }).join("");
  }

  // --- Senaryo yönetimi ---
  let scenarios = [];
  function currentScenario() {
    const p = readParams();
    const m = computeModel(p, state.covers);
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
    const m = model || computeModel(readParams(), state.covers);
    const method = $("fcMethod").value;
    const avgCover = state.covers.reduce((a, b) => a + b, 0) / state.covers.length;
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
    ["p_stokbuyume","p_pazar","w_kar","w_satis","w_stok",...CAMP.map(k=>"m_"+k)]
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

  document.addEventListener("DOMContentLoaded", () => {
    initHierarchy();
    DataService._cur = { sel: state.sel, level: state.level };
    DataService.loadMix = function () { return this.loadMixFor(this._cur.sel, this._cur.level); };
    buildTable();
    bind();
    updateAll();
    updateSelInfo();
    renderCalendar();
    renderRatio();
  });
})();

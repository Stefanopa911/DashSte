/* Piano Ammortamento Enterprise Dashboard (Offline) - v4 */
(function(){
  "use strict";

  const APP_VERSION = "8.2";
  const LS_KEY = "amm_enterprise_state_v7";
  const LS_SCEN = "amm_enterprise_scenarios_v7";

  const $ = (id) => document.getElementById(id);

  function toNum(v){
    // Robust number parsing for IT locale (comma decimals) + optional thousand separators
    const s0 = String(v ?? "").trim().replace(/\s+/g,"");
    if(s0 === "") return 0;
    let s = s0;
    if(s.includes(",") && s.includes(".")){
      // assume "." thousands, "," decimals
      s = s.replace(/\./g,"").replace(",", ".");
    }else{
      s = s.replace(",", ".");
    }
    const n = Number(s);
    return Number.isFinite(n) ? n : 0;
  }
  function clamp(v,min,max){ return Math.max(min, Math.min(max, v)); }

  function euro(n){
    try{ return new Intl.NumberFormat('it-IT',{style:'currency',currency:'EUR'}).format(n); }
    catch(e){ return (Math.round(n*100)/100).toFixed(2) + " €"; }
  }
  function pad2(n){ return String(n).padStart(2,"0"); }
  function fmtDate(d){
    if(!d) return "—";
    const dd = new Date(d);
    if(Number.isNaN(dd.getTime())) return "—";
    return dd.getFullYear() + "-" + pad2(dd.getMonth()+1) + "-" + pad2(dd.getDate());
  }
  function addMonths(dateObj, months){
    const d = new Date(dateObj.getTime());
    const day = d.getDate();
    d.setMonth(d.getMonth() + months);
    if(d.getDate() !== day) d.setDate(0);
    return d;
  }

  function showError(msg){
    const el = $("err");
    if(!el) return;
    if(!msg){ el.classList.add("d-none"); el.textContent=""; return; }
    el.classList.remove("d-none"); el.textContent = msg;
  }

  window.onerror = function(message, source, lineno){
    showError("Errore JS:\n" + message + (lineno?("\nRiga: "+lineno):"") + (source?("\nFile: "+source):""));
    const st = $("statusText"); if(st) st.textContent = "JS: errore";
    return false;
  };

  // Excel-like PMT
  function pmt(rate, nper, pv){
    if(nper <= 0) return 0;
    if(Math.abs(rate) < 1e-12) return pv / nper;
    const r1 = Math.pow(1 + rate, nper);
    return (pv * rate * r1) / (r1 - 1);
  }

  function pctDelta(newV, baseV){
    if(!isFinite(newV) || !isFinite(baseV) || baseV === 0) return null;
    return (newV - baseV) / baseV * 100;
  }
  function fmtPct(p){
    if(p === null || p === undefined || !isFinite(p)) return "—";
    return (p>0?"+":"") + p.toFixed(2) + "%";
  }
  function setDelta(elId, p, goodWhenLower){
    const el = $(elId);
    if(!el){ return; }
    if(p === null || p === undefined || !isFinite(p)){
      el.textContent = "—";
      el.className = "delta neu";
      return;
    }
    el.textContent = fmtPct(p);
    let cls = "neu";
    if(Math.abs(p) < 0.005){
      cls = "neu";
    }else{
      const better = goodWhenLower ? (p < 0) : (p > 0);
      cls = better ? "good" : "bad";
    }
    el.className = "delta " + cls;
  }

  function parseISODate(s){
    if(!s) return null;
    const d = new Date(s);
    if(Number.isNaN(d.getTime())) return null;
    return d;
  }

  function readStateFromUI(){
    const P = toNum($("P").value);
    const APR = toNum($("APR").value);
    const Y = clamp(toNum($("Y").value), 1, 30);
    const m = Math.max(1, Math.floor(toNum($("m").value) || 12));
    const START = $("START").value || "";
    const MODE = $("MODE").value || "reduce_term";

    const EX = Math.max(0, toNum($("EX").value));
    let EXM = Math.floor(toNum($("EXM").value) || 1);
    const EXY = Math.max(1, Math.floor(toNum($("EXY").value) || 1));
    const EXEND = Math.max(0, Math.floor(toNum($("EXEND").value) || 0));
    EXM = clamp(EXM, 1, m);
    $("EXM_LABEL").textContent = (m === 12) ? "Mese extra (1..12)" : ("Periodo extra (1.." + m + ")");
    $("EXM").setAttribute("max", String(m));

    const extraCustom = window.__extraCustom || [];

    const investments = window.__investments || [];

    // incomes
    const INC_FIXED = Math.max(0, toNum($("INC_FIXED").value));
    const INC_VAR = Math.max(0, toNum($("INC_VAR").value));
    const INC_MODE = $("INC_MODE").value || "flat";
    const INC_START = $("INC_START").value || "";

    const chartFlags = {
      bal: $("CH_BAL") ? $("CH_BAL").checked : true,
      cum: $("CH_CUM") ? $("CH_CUM").checked : true,
      cf:  $("CH_CF") ? $("CH_CF").checked : true,
      bar: $("CH_BAR") ? $("CH_BAR").checked : false,
    };

    return {P, APR, Y, m, START, MODE, EX, EXM, EXY, EXEND, extraCustom, investments, INC_FIXED, INC_VAR, INC_MODE, INC_START, chartFlags};
  }

  function validate(s){
    if(s.P <= 0) return "Inserisci un importo finanziato > 0.";
    if(s.APR < 0) return "Il tasso annuo non può essere negativo.";
    if(s.Y < 1 || s.Y > 30) return "Durata anni non valida (1–30).";
    if(s.m < 1) return "Rate per anno non valido.";
    if(s.EXM < 1 || s.EXM > s.m) return "Periodo/mese extra fuori range.";
    if(s.EXY < 1) return "Da anno n° deve essere >= 1.";
    return null;
  }

  function mapCustomExtras(state, installmentDates){
    const mapped = new Array(installmentDates.length).fill(0);
    const list = state.extraCustom || [];
    if(!list.length) return mapped;
    for(const item of list){
      const d = parseISODate(item.date);
      const amt = Math.max(0, Number(item.amount) || 0);
      if(!d || amt <= 0) continue;
      let idx = installmentDates.findIndex(x => x && x.getTime() >= d.getTime());
      if(idx < 0) idx = installmentDates.length - 1;
      mapped[idx] += amt;
    }
    return mapped;
  }

  function monthlyIncomeAt(state, dateObj){
    // Income per "period" (installment). Base on monthly inputs, scaled if m != 12.
    const factor = 12 / state.m; // income per period = monthly * factor
    let fixedPerPeriod = state.INC_FIXED * factor;

    let varPerPeriod = 0;
    if(state.INC_MODE === "pct"){
      varPerPeriod = fixedPerPeriod * (state.INC_VAR/100);
    }else{
      varPerPeriod = state.INC_VAR * factor;
    }

    // Portfolio investments (sum of nets), each can start from a date
    let invNetMonthly = 0;
    const inv = state.investments || [];
    for(const it of inv){
      if(!it) continue;
      const start = it.start ? parseISODate(it.start) : null;
      if(start && dateObj && dateObj.getTime() < start.getTime()) continue;

      const f = Math.max(0, Number(it.fixed)||0);
      let v = Math.max(0, Number(it.var)||0);
      const mode = it.varMode || "flat";
      const cost = Math.max(0, Number(it.cost)||0);

      if(mode === "pct"){
        v = f * (v/100);
      }
      invNetMonthly += (f + v - cost);
    }

    const invPerPeriod = invNetMonthly * factor;

    return fixedPerPeriod + varPerPeriod + invPerPeriod;
  }

  function buildSchedule(state){
    const nperMax = state.Y * state.m;
    const r = (state.APR/100) / state.m;

    const startDate = parseISODate(state.START) || new Date();
    const stepMonths = Math.round(12 / state.m);
    const installmentDates = [];
    for(let k=0;k<nperMax;k++){
      installmentDates.push(addMonths(startDate, k * stepMonths));
    }

    let payment = pmt(r, nperMax, state.P);

    const annualExtra = new Array(nperMax).fill(0);
    if(state.EX > 0){
      for(let k=1;k<=nperMax;k++){
        const year = Math.floor((k-1)/state.m) + 1;
        const period = ((k-1)%state.m) + 1;
        const withinEnd = (state.EXEND === 0) ? true : (year <= state.EXEND);
        if(withinEnd && year >= state.EXY && period === state.EXM){
          annualExtra[k-1] = state.EX;
        }
      }
    }

    const customExtra = mapCustomExtras(state, installmentDates);

    let bal = state.P;
    let cumInt = 0;
    let cumCap = 0;
    let breakPointIdx = null; // when balance hits 0
    let bepIdx = null;        // when cumCap >= cumInt
    const rows = [];

    let incomePerPeriod = 0;

    for(let k=1;k<=nperMax;k++){
      if(bal <= 0) break;

      const year = Math.floor((k-1)/state.m) + 1;
      const period = ((k-1)%state.m) + 1;
      const date = installmentDates[k-1];

      const interest = bal * r;
      incomePerPeriod = monthlyIncomeAt(state, date);
      let principal = Math.max(0, payment - interest);
      if(principal > bal) principal = bal;

      const extra = Math.max(0, Math.min(bal - principal, annualExtra[k-1] + customExtra[k-1]));
      const newBal = Math.max(0, bal - principal - extra);

      cumInt += interest;
      cumCap += principal + extra;

      if(bepIdx === null && cumCap >= cumInt) bepIdx = rows.length;

      const outflow = payment + extra;
      const cashflow = incomePerPeriod - outflow;

      rows.push({
        n:k, date, year, period,
        start:bal, pmt:payment, intr:interest, princ:principal, extra, end:newBal,
        cumInt, cumCap, cashflow, outflow, income: incomePerPeriod
      });

      bal = newBal;

      if(bal === 0 && breakPointIdx === null) breakPointIdx = rows.length - 1;

      if(state.MODE === "reduce_payment" && bal > 0){
        const remaining = nperMax - k;
        if(remaining > 0){
          payment = pmt(r, remaining, bal);
        }
      }
    }

    let totalPaid = 0, totalExtra = 0;
    let minCF = Infinity, negMonths = 0;
    for(const r0 of rows){
      totalPaid += r0.pmt + r0.extra;
      totalExtra += r0.extra;
      if(r0.cashflow < minCF) minCF = r0.cashflow;
      if(r0.cashflow < 0) negMonths++;
    }
    const totalInt = rows.length ? rows[rows.length-1].cumInt : 0;

    return {rows, nperMax, firstPayment: rows.length ? rows[0].pmt : 0, totalPaid, totalExtra, totalInt, breakPointIdx, bepIdx, minCF, negMonths};
  }

  // ---- Charts (simple canvas) ----
  function resizeCanvasToDisplaySize(canvas){
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const w = Math.max(1, Math.round(rect.width * dpr));
    const h = Math.max(1, Math.round(rect.height * dpr));
    if(canvas.width !== w || canvas.height !== h){
      canvas.width = w; canvas.height = h;
      return true;
    }
    return false;
  }

  function drawAxes(ctx, w, h, pad){
    ctx.save();
    ctx.strokeStyle = "rgba(154,164,178,.35)";
    ctx.lineWidth = 1;
    // y axis
    ctx.beginPath(); ctx.moveTo(pad, pad); ctx.lineTo(pad, h-pad); ctx.lineTo(w-pad, h-pad); ctx.stroke();
    ctx.restore();
  }

  function drawLine(ctx, xs, ys, w, h, pad){
    if(xs.length < 2) return;
    const minX = Math.min(...xs), maxX = Math.max(...xs);
    const minY = Math.min(...ys), maxY = Math.max(...ys);
    const dx = (maxX-minX) || 1;
    const dy = (maxY-minY) || 1;

    ctx.save();
    ctx.strokeStyle = "rgba(45,212,191,.95)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    for(let i=0;i<xs.length;i++){
      const x = pad + (xs[i]-minX)/dx*(w-2*pad);
      const y = (h-pad) - (ys[i]-minY)/dy*(h-2*pad);
      if(i===0) ctx.moveTo(x,y); else ctx.lineTo(x,y);
    }
    ctx.stroke();

    // faint fill
    ctx.globalAlpha = 0.10;
    ctx.fillStyle = "rgba(45,212,191,.9)";
    ctx.lineTo(pad + (xs[xs.length-1]-minX)/dx*(w-2*pad), h-pad);
    ctx.lineTo(pad, h-pad);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  function drawTwoLines(ctx, xs, y1, y2, w, h, pad){
    const ysAll = y1.concat(y2);
    const minX = Math.min(...xs), maxX = Math.max(...xs);
    const minY = Math.min(...ysAll), maxY = Math.max(...ysAll);
    const dx = (maxX-minX) || 1;
    const dy = (maxY-minY) || 1;

    function line(ys, stroke){
      ctx.save();
      ctx.strokeStyle = stroke;
      ctx.lineWidth = 2;
      ctx.beginPath();
      for(let i=0;i<xs.length;i++){
        const x = pad + (xs[i]-minX)/dx*(w-2*pad);
        const y = (h-pad) - (ys[i]-minY)/dy*(h-2*pad);
        if(i===0) ctx.moveTo(x,y); else ctx.lineTo(x,y);
      }
      ctx.stroke();
      ctx.restore();
    }
    line(y1, "rgba(45,212,191,.95)");
    line(y2, "rgba(13,110,253,.9)");
  }

  function drawBars(ctx, labels, values, w, h, pad){
    const maxV = Math.max(...values, 1);
    const n = values.length;
    const bw = (w-2*pad) / Math.max(1,n);
    ctx.save();
    ctx.fillStyle = "rgba(13,110,253,.55)";
    for(let i=0;i<n;i++){
      const v = values[i];
      const x = pad + i*bw + bw*0.15;
      const barW = bw*0.7;
      const barH = (v/maxV) * (h-2*pad);
      const y = (h-pad) - barH;
      ctx.fillRect(x, y, barW, barH);
    }
    ctx.restore();
  }

  function renderCharts(state, res){
    const flags = state.chartFlags || {bal:true,cum:true,cf:true,bar:false};

    // Toggle cards
    const setCard = (idCard, idLabel, on) => {
      const card = $(idCard);
      const lab = $(idLabel);
      if(card) card.style.display = on ? "" : "none";
      if(lab) lab.textContent = on ? "ON" : "OFF";
    };
    setCard("cardBal","chBalLabel", flags.bal);
    setCard("cardCum","chCumLabel", flags.cum);
    setCard("cardCF","chCfLabel", flags.cf);
    setCard("cardBar","chBarLabel", flags.bar);

    const xs = res.rows.map((r,i)=>i);

    // Balance
    if(flags.bal){
      const c = $("chBalance"); if(c){
        resizeCanvasToDisplaySize(c);
        const ctx = c.getContext("2d");
        const w=c.width, h=c.height, pad=24;
        ctx.clearRect(0,0,w,h);
        drawAxes(ctx,w,h,pad);
        drawLine(ctx, xs, res.rows.map(r=>r.end), w,h,pad);
      }
    }

    // Cumulatives
    if(flags.cum){
      const c = $("chCum"); if(c){
        resizeCanvasToDisplaySize(c);
        const ctx=c.getContext("2d");
        const w=c.width, h=c.height, pad=24;
        ctx.clearRect(0,0,w,h);
        drawAxes(ctx,w,h,pad);
        drawTwoLines(ctx, xs, res.rows.map(r=>r.cumInt), res.rows.map(r=>r.cumCap), w,h,pad);
      }
    }

    // Cashflow
    if(flags.cf){
      const c = $("chCashflow"); if(c){
        resizeCanvasToDisplaySize(c);
        const ctx=c.getContext("2d");
        const w=c.width, h=c.height, pad=24;
        ctx.clearRect(0,0,w,h);
        drawAxes(ctx,w,h,pad);
        // line1 income, line2 outflow
        drawTwoLines(ctx, xs, res.rows.map(r=>r.income), res.rows.map(r=>r.outflow), w,h,pad);
      }
    }

    // Extra per year
    if(flags.bar){
      const c = $("chExtraBar"); if(c){
        resizeCanvasToDisplaySize(c);
        const ctx=c.getContext("2d");
        const w=c.width, h=c.height, pad=24;
        ctx.clearRect(0,0,w,h);
        drawAxes(ctx,w,h,pad);
        const map = new Map();
        for(const r0 of res.rows){
          map.set(r0.year, (map.get(r0.year)||0) + r0.extra);
        }
        const years = Array.from(map.keys()).sort((a,b)=>a-b);
        const vals = years.map(y=>map.get(y));
        drawBars(ctx, years.map(String), vals, w,h,pad);
      }
    }
  }

  function render(res, baseRes, state){
    $("k_n").textContent = res.rows.length + " / " + res.nperMax;
    $("k_pmt").textContent = euro(res.firstPayment);
    $("k_int").textContent = euro(res.totalInt);
    $("k_tot").textContent = euro(res.totalPaid);

    if(baseRes){
      setDelta("d_n", pctDelta(res.rows.length, baseRes.rows.length), true);
      setDelta("d_pmt", pctDelta(res.firstPayment, baseRes.firstPayment), false);
      setDelta("d_int", pctDelta(res.totalInt, baseRes.totalInt), true);
      setDelta("d_tot", pctDelta(res.totalPaid, baseRes.totalPaid), true);
      const bs = $("baseSummary");
      if(bs){
        bs.textContent = "Base: " + baseRes.rows.length + " rate • " + euro(baseRes.firstPayment) + " • int. " + euro(baseRes.totalInt);
      }
    }else{
      setDelta("d_n", null, true);
      setDelta("d_pmt", null, false);
      setDelta("d_int", null, true);
      setDelta("d_tot", null, true);
    }

    const bp = res.breakPointIdx;
    if(bp !== null && bp !== undefined){
      const r = res.rows[bp];
      $("breakInfo").textContent = "Break point: rata #" + r.n + " (" + fmtDate(r.date) + ", Anno " + r.year + ")";
    } else $("breakInfo").textContent = "Break point: —";

    const bep = res.bepIdx;
    if(bep !== null && bep !== undefined){
      const r = res.rows[bep];
      $("bepInfo").textContent = "Break-even (capitale ≥ interessi): rata #" + r.n + " (" + fmtDate(r.date) + ", Anno " + r.year + ")";
    } else $("bepInfo").textContent = "Break-even (capitale ≥ interessi): —";

    
    // Portfolio summary
    const pf = $("portfolioInfo");
    if(pf){
      const inv = (state && state.investments) ? state.investments : [];
      if(!inv || !inv.length){
        pf.textContent = "Portfolio: nessuno";
      }else{
        let net = 0;
        for(const it of inv){
          const f = Math.max(0, Number(it.fixed)||0);
          let v = Math.max(0, Number(it.var)||0);
          const mode = it.varMode || "flat";
          const cost = Math.max(0, Number(it.cost)||0);
          if(mode === "pct") v = f*(v/100);
          net += (f+v-cost);
        }
        pf.textContent = "Portfolio: " + inv.length + " • netto/mese " + euro(net);
      }
    }

$("totExtraNote").textContent =
      "Totale extra versato: " + euro(res.totalExtra) +
      " • Mesi/periodi in cashflow negativo: " + res.negMonths +
      " • Min cashflow: " + euro(res.minCF) +
      " • Modalità: " + ($("MODE").value === "reduce_term" ? "Riduci durata" : "Riduci rata");

    const tb = $("tbodyMain");
    let html = "";
    for(let i=0;i<res.rows.length;i++){
      const r = res.rows[i];
      const isBP = (bp === i);
      const isBEP = (bep === i);
      const cls = isBP ? "row-highlight" : (isBEP ? "row-bep" : "");
      const cf = r.cashflow;
      const cfTxt = euro(cf);
      html += `<tr class="${cls}">
        <td class="text-center">${r.n}</td>
        <td class="text-center">${fmtDate(r.date)}</td>
        <td class="text-center">${r.year}</td>
        <td class="text-center">${r.period}</td>
        <td class="text-end">${euro(r.start)}</td>
        <td class="text-end">${euro(r.pmt)}</td>
        <td class="text-end">${euro(r.intr)}</td>
        <td class="text-end">${euro(r.princ)}</td>
        <td class="text-end">${euro(r.extra)}</td>
        <td class="text-end">${euro(r.end)}</td>
        <td class="text-end">${euro(r.cumInt)}</td>
        <td class="text-end">${euro(r.cumCap)}</td>
        <td class="text-end">${cfTxt}</td>
      </tr>`;
    }
    tb.innerHTML = html;

    renderCharts(state, res);

    $("statusText").textContent = "Aggiornato: " + new Date().toLocaleTimeString();
    window.__lastResult = res;
  }

  function compute(){
    const s = readStateFromUI();
    const err = validate(s);
    if(err){ showError(err); return; }
    showError(null);

    const baseState = JSON.parse(JSON.stringify(s));
    baseState.EX = 0;
    baseState.extraCustom = [];
    const baseRes = buildSchedule(baseState);

    const res = buildSchedule(s);
    render(res, baseRes, s);
  }

  function debounce(fn, ms){
    let t=null;
    return function(){ if(t) clearTimeout(t); t=setTimeout(fn, ms); };
  }

  function setDefaultDates(){
    const today = new Date();
    const d = new Date(today.getFullYear(), today.getMonth(), 1);
    $("START").value = fmtDate(d);
    $("EX_DATE").value = fmtDate(today);
    $("INC_START").value = fmtDate(d);
  }

  function resetAll(){
    $("P").value = 200000;
    $("APR").value = 3.5;
    $("Y").value = 30;
    $("m").value = 12;
    $("MODE").value = "reduce_term";
    $("EX").value = 0;
    $("EXM").value = 12;
    $("EXY").value = 1;
    $("EXEND").value = 0;

    $("INC_FIXED").value = 0;
    $("INC_VAR").value = 0;
    $("INC_MODE").value = "flat";
    $("CH_BAL").checked = true;
    $("CH_CUM").checked = true;
    $("CH_CF").checked = true;
    $("CH_BAR").checked = false;

    window.__extraCustom = [];
    renderExtraList();
    setDefaultDates();
    compute();
  }

  function saveState(){
    const s = readStateFromUI();
    localStorage.setItem(LS_KEY, JSON.stringify(s));
    $("statusText").textContent = "Salvato: " + new Date().toLocaleTimeString();
  }

  function loadStateFromJSON(obj){
    if(!obj) return;
    $("P").value = obj.P ?? 200000;
    $("APR").value = obj.APR ?? 3.5;
    $("Y").value = obj.Y ?? 30;
    $("m").value = obj.m ?? 12;
    $("START").value = obj.START ?? $("START").value;
    $("MODE").value = obj.MODE ?? "reduce_term";
    $("EX").value = obj.EX ?? 0;
    $("EXM").value = obj.EXM ?? 12;
    $("EXY").value = obj.EXY ?? 1;
    $("EXEND").value = obj.EXEND ?? 0;

    $("INC_FIXED").value = obj.INC_FIXED ?? 0;
    $("INC_VAR").value = obj.INC_VAR ?? 0;
    $("INC_MODE").value = obj.INC_MODE ?? "flat";
    $("INC_START").value = obj.INC_START ?? $("INC_START").value;

    if(obj.chartFlags){
      if($("CH_BAL")) $("CH_BAL").checked = !!obj.chartFlags.bal;
      if($("CH_CUM")) $("CH_CUM").checked = !!obj.chartFlags.cum;
      if($("CH_CF"))  $("CH_CF").checked  = !!obj.chartFlags.cf;
      if($("CH_BAR")) $("CH_BAR").checked = !!obj.chartFlags.bar;
    }

    window.__extraCustom = Array.isArray(obj.extraCustom) ? obj.extraCustom : [];
    renderExtraList();
    compute();
  }

  function loadState(){
    try{
      const raw = localStorage.getItem(LS_KEY);
      if(raw){
        loadStateFromJSON(JSON.parse(raw));
        $("statusText").textContent = "Caricato: " + new Date().toLocaleTimeString();
      } else $("statusText").textContent = "Nessun salvataggio trovato";
    }catch(e){
      showError("Caricamento fallito: " + String(e));
    }
  }

  function toCSV(res){
    const header = ["N","Data","Anno","Periodo","Debito_iniziale","Rata","Interessi","Capitale","Extra","Debito_finale","Interessi_cumulati","Capitale_cumulato","Cashflow"];
    const lines = [header.join(",")];
    for(const r of res.rows){
      lines.push([
        r.n, fmtDate(r.date), r.year, r.period,
        r.start.toFixed(2), r.pmt.toFixed(2), r.intr.toFixed(2), r.princ.toFixed(2),
        r.extra.toFixed(2), r.end.toFixed(2), r.cumInt.toFixed(2), r.cumCap.toFixed(2),
        r.cashflow.toFixed(2)
      ].join(","));
    }
    return lines.join("\n");
  }

  function download(filename, content, mime){
    const blob = new Blob([content], {type:mime});
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  function downloadCSV(){
    if(!window.__lastResult) compute();
    const res = window.__lastResult;
    if(!res || !res.rows || !res.rows.length){ showError("Nessun dato da esportare."); return; }
    download("ammortamento.csv", toCSV(res), "text/csv;charset=utf-8");
    $("statusText").textContent = "CSV: " + new Date().toLocaleTimeString();
  }

  function exportJSON(){
    const s = readStateFromUI();
    const txt = JSON.stringify(s, null, 2);
    $("jsonBox").value = txt;
    download("ammortamento_config.json", txt, "application/json;charset=utf-8");
  }

  function printPDF(){ window.print(); }

  // ---- Extras list UI ----
  function renderExtraList(){
    const tbody = $("extraList");
    const list = window.__extraCustom || [];
    if(!tbody) return;
    let html = "";
    list.forEach((it, idx) => {
      html += `<tr>
        <td class="text-center">${idx+1}</td>
        <td>${it.date || ""}</td>
        <td class="text-end">${euro(Number(it.amount)||0)}</td>
        <td class="text-center"><button class="btn btn-danger" type="button" data-del="${idx}">Rimuovi</button></td>
      </tr>`;
    });
    tbody.innerHTML = html || `<tr><td colspan="4" class="text-center text-muted">Nessun extra personalizzato</td></tr>`;
    tbody.querySelectorAll("[data-del]").forEach(btn => {
      btn.addEventListener("click", () => {
        const i = Number(btn.getAttribute("data-del"));
        window.__extraCustom.splice(i,1);
        renderExtraList();
        compute();
      });
    });
  }

  function addExtraCustom(){
    const d = $("EX_DATE").value;
    const amt = toNum($("EX_AMT").value);
    if(!d || amt <= 0){ showError("Inserisci una data e un importo extra > 0."); return; }
    showError(null);
    window.__extraCustom = window.__extraCustom || [];
    window.__extraCustom.push({date:d, amount:amt});
    window.__extraCustom.sort((a,b) => (a.date||"").localeCompare(b.date||""));
    renderExtraList();
    compute();
  }
  function clearExtraCustom(){
    window.__extraCustom = [];
    renderExtraList();
    compute();
  }


  // ---- Investments (portfolio) ----
  function renderInvList(){
    const tbody = $("invList");
    const list = window.__investments || [];
    if(!tbody) return;
    let html = "";
    list.forEach((it, idx) => {
      const f = Math.max(0, Number(it.fixed)||0);
      let v = Math.max(0, Number(it.var)||0);
      const mode = it.varMode || "flat";
      const cost = Math.max(0, Number(it.cost)||0);
      if(mode === "pct") v = f*(v/100);
      const net = f + v - cost;
      html += `<tr>
        <td>${idx+1}</td>
        <td>${it.name || ""}</td>
        <td class="text-end">${euro(f+v)}</td>
        <td class="text-end">${euro(cost)}</td>
        <td class="text-end">${euro(net)}</td>
        <td class="text-center"><button class="btn btn-danger" type="button" data-del-inv="${idx}">Rimuovi</button></td>
      </tr>`;
    });
    tbody.innerHTML = html || `<tr><td colspan="6" class="text-center text-muted">Nessun investimento</td></tr>`;
    tbody.querySelectorAll("[data-del-inv]").forEach(btn => {
      btn.addEventListener("click", () => {
        const i = Number(btn.getAttribute("data-del-inv"));
        window.__investments.splice(i,1);
        renderInvList();
        compute();
      });
    });
  }

  function addInvestment(){
    const name = ($("INV_NAME").value || "").trim() || ("Investimento " + ((window.__investments||[]).length+1));
    const fixed = toNum($("INV_FIXED").value);
    const varv = toNum($("INV_VAR").value);
    const varMode = $("INV_VAR_MODE").value || "flat";
    const cost = toNum($("INV_COST").value);
    const start = $("INV_START").value || "";

    window.__investments = window.__investments || [];
    window.__investments.push({name, fixed, var: varv, varMode, cost, start});
    renderInvList();
    compute();
  }

  function clearInvestments(){
    window.__investments = [];
    renderInvList();
    compute();
  }


  // ---- Scenarios ----
  function getScenarios(){
    try{
      const raw = localStorage.getItem(LS_SCEN);
      const obj = raw ? JSON.parse(raw) : {};
      return (obj && typeof obj === "object") ? obj : {};
    }catch(e){ return {}; }
  }
  function setScenarios(obj){ localStorage.setItem(LS_SCEN, JSON.stringify(obj)); }

  function renderScenarioList(){
    const tbody = $("scenarioList");
    if(!tbody) return;
    const scen = getScenarios();
    const names = Object.keys(scen).sort((a,b)=>a.localeCompare(b));
    let html = "";
    for(const name of names){
      html += `<tr>
        <td>${name}</td>
        <td class="text-center"><button class="btn btn-primary" type="button" data-load="${name}">Carica</button></td>
      </tr>`;
    }
    tbody.innerHTML = html || `<tr><td colspan="2" class="text-center text-muted">Nessuno scenario salvato</td></tr>`;
    tbody.querySelectorAll("[data-load]").forEach(btn => {
      btn.addEventListener("click", () => {
        const name = btn.getAttribute("data-load");
        const s = getScenarios()[name];
        if(s){
          $("SCEN_NAME").value = name;
          loadStateFromJSON(s);
        }
      });
    });
    fillCompareDropdowns();
  }

  function saveScenario(){
    const name = ($("SCEN_NAME").value || "").trim();
    if(!name){ showError("Inserisci un nome scenario."); return; }
    showError(null);
    const scen = getScenarios();
    scen[name] = readStateFromUI();
    setScenarios(scen);
    renderScenarioList();
    $("statusText").textContent = "Scenario salvato";
  }
  function deleteScenario(){
    const name = ($("SCEN_NAME").value || "").trim();
    if(!name){ showError("Inserisci il nome scenario da eliminare."); return; }
    const scen = getScenarios();
    if(!scen[name]){ showError("Scenario non trovato."); return; }
    delete scen[name];
    setScenarios(scen);
    renderScenarioList();
    $("statusText").textContent = "Scenario eliminato";
    showError(null);
  }

  function applyPreset(kind){
    if(kind === "base"){
      $("MODE").value = "reduce_term";
      $("EX").value = 0;
      $("EXM").value = 12;
      $("EXY").value = 1;
      $("EXEND").value = 0;
      window.__extraCustom = [];
      renderExtraList();
    }else if(kind === "aggressive"){
      $("MODE").value = "reduce_term";
      $("EX").value = 5000;
      $("EXM").value = 12;
      $("EXY").value = 1;
      $("EXEND").value = 0;
    }else if(kind === "safe"){
      $("MODE").value = "reduce_payment";
      $("EX").value = 1000;
      $("EXM").value = 12;
      $("EXY").value = 2;
      $("EXEND").value = 0;
    }
    compute();
  }

  // ---- Compare ----
  function fillCompareDropdowns(){
    const selA = $("CMP_A");
    const selB = $("CMP_B");
    if(!selA || !selB) return;
    const scen = getScenarios();
    const names = Object.keys(scen).sort((a,b)=>a.localeCompare(b));
    const fill = (sel) => {
      sel.innerHTML = "";
      const opt0 = document.createElement("option");
      opt0.value = ""; opt0.textContent = "— seleziona —";
      sel.appendChild(opt0);
      for(const n of names){
        const opt = document.createElement("option");
        opt.value = n; opt.textContent = n;
        sel.appendChild(opt);
      }
    };
    fill(selA); fill(selB);
  }

  function kpisFromRes(res){
    return {
      "Numero rate": res.rows.length,
      "Rata periodica": res.firstPayment,
      "Totale interessi": res.totalInt,
      "Totale pagato": res.totalPaid,
      "Totale extra": res.totalExtra,
      "Cashflow negativo (mesi/periodi)": res.negMonths,
      "Min cashflow": res.minCF
    };
  }

  function renderCompare(nameA, nameB, resA, resB){
    const left = $("cmpLeft");
    const right = $("cmpRight");
    const note = $("cmpNote");
    if(!left || !right || !note) return;

    if(!resA || !resB){
      left.innerHTML = `<tr><td colspan="2" class="text-center text-muted">Seleziona due scenari</td></tr>`;
      right.innerHTML = `<tr><td colspan="3" class="text-center text-muted">—</td></tr>`;
      note.textContent = "Seleziona due scenari in “Scenari → Confronta scenario”.";
      return;
    }

    const A = kpisFromRes(resA);
    const B = kpisFromRes(resB);
    const keys = Object.keys(A);

    left.innerHTML = keys.map(k => {
      const v = A[k];
      const isMoney = (k.includes("Rata") || k.includes("Totale") || k.includes("cashflow") || k.includes("Cashflow") || k.includes("Min cashflow"));
      const out = isMoney ? euro(v) : String(v);
      return `<tr><td>${k}</td><td class="text-end">${out}</td></tr>`;
    }).join("");

    right.innerHTML = keys.map(k => {
      const va = A[k], vb = B[k];
      const isMoney = (k.includes("Rata") || k.includes("Totale") || k.includes("cashflow") || k.includes("Cashflow") || k.includes("Min cashflow"));
      const delta = vb - va;
      const pct = (va && isFinite(va) && va !== 0) ? (delta/va*100) : null;
      const outB = isMoney ? euro(vb) : String(vb);
      const dTxt = isMoney ? ((delta>0?"+":"") + euro(delta).replace("€","").trim() + " €") : ((delta>0?"+":"") + String(delta));
      const pTxt = (pct===null||!isFinite(pct)) ? "" : (" (" + (pct>0?"+":"") + pct.toFixed(2) + "%)");
      return `<tr><td>${k}</td><td class="text-end">${outB}</td><td class="text-end">${dTxt}${pTxt}</td></tr>`;
    }).join("");

    note.textContent = `Scenario A: ${nameA} • Scenario B: ${nameB}`;
  }

  function doCompare(){
    const a = $("CMP_A") ? $("CMP_A").value : "";
    const b = $("CMP_B") ? $("CMP_B").value : "";
    const scen = getScenarios();
    if(!a || !b || !scen[a] || !scen[b]){
      renderCompare(null,null,null,null);
      return;
    }
    renderCompare(a, b, buildSchedule(scen[a]), buildSchedule(scen[b]));
  }

  // ---- Tabs ----
  function wireTabs(){
    document.querySelectorAll(".tab").forEach(t => {
      t.addEventListener("click", () => {
        document.querySelectorAll(".tab").forEach(x => x.classList.remove("active"));
        document.querySelectorAll(".panel").forEach(p => p.classList.remove("active"));
        t.classList.add("active");
        const id = t.getAttribute("data-tab");
        const panel = document.getElementById(id);
        if(panel) panel.classList.add("active");
      });
    });
  }

  function wire(){
    const vEl = $("ver"); if(vEl) vEl.textContent = "v" + APP_VERSION;
    const jsEl = $("jsLoaded"); if(jsEl) jsEl.textContent = "• JS OK";

    setDefaultDates();
    window.__extraCustom = [];
    renderExtraList();
    renderScenarioList();
    wireTabs();
    renderCompare(null,null,null,null);

    const liveIds = ["P","APR","Y","m","START","MODE","EX","EXM","EXY","EXEND","INC_FIXED","INC_VAR","INC_MODE","INC_START","INV_FIXED","INV_VAR","INV_COST","INV_VAR_MODE","INV_START","INV_NAME"];
    const recompute = debounce(compute, 120);
    liveIds.forEach(id => {
      const el = $(id);
      if(!el) return;
      el.addEventListener("input", recompute);
      el.addEventListener("change", recompute);
    });

    // chart toggles
    ["CH_BAL","CH_CUM","CH_CF","CH_BAR"].forEach(id => {
      const el = $(id);
      if(el){
        el.addEventListener("change", recompute);
      }
    });

    // Buttons
    $("btnCalc").addEventListener("click", compute);
    $("btnReset").addEventListener("click", resetAll);
    $("btnSave").addEventListener("click", saveState);
    $("btnLoad").addEventListener("click", loadState);

    $("btnAddExtra").addEventListener("click", addExtraCustom);
    $("btnClearExtra").addEventListener("click", clearExtraCustom);

    document.querySelectorAll("[data-preset]").forEach(btn => {
      btn.addEventListener("click", () => applyPreset(btn.getAttribute("data-preset")));
    });

    $("btnSaveScenario").addEventListener("click", saveScenario);
    $("btnDeleteScenario").addEventListener("click", deleteScenario);

    const bc = $("btnCompare"); if(bc) bc.addEventListener("click", doCompare);

    $("btnCsv").addEventListener("click", downloadCSV);
    $("btnJson").addEventListener("click", exportJSON);
    $("btnPrint").addEventListener("click", printPDF);

    // Load saved state if any
    try{
      const raw = localStorage.getItem(LS_KEY);
      if(raw) loadStateFromJSON(JSON.parse(raw));
      else compute();
    }catch(e){
      compute();
    }

    // Redraw charts on resize
    window.addEventListener("resize", debounce(compute, 200));
  }

  function loadState(){
    try{
      const raw = localStorage.getItem(LS_KEY);
      if(raw){
        loadStateFromJSON(JSON.parse(raw));
        $("statusText").textContent = "Caricato: " + new Date().toLocaleTimeString();
      } else $("statusText").textContent = "Nessun salvataggio trovato";
    }catch(e){
      showError("Caricamento fallito: " + String(e));
    }
  }

  if(document.readyState === "loading") document.addEventListener("DOMContentLoaded", wire);
  else wire();
})();
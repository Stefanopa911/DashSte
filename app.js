/* DashSte - calcolo base rata + simulazione con extra
   JS "semplice" (niente roba strana), costanti in MAIUSCOLO.
*/

const $ = (ID) => document.getElementById(ID);

const BTN_CALCOLA = $("btnCalcola");
const BTN_CALCOLA_TOP = $("btnCalcolaTop");
const BTN_RESET = $("btnReset");
const BTN_ESEMPIO = $("btnEsempio");

const IN_IMPORTO = $("importo");
const IN_TASSO = $("tasso");
const IN_ANNI = $("anni");
const IN_EXTRA = $("extra");
const IN_FREQ = $("freq");

const OUT_RATA = $("outRata");
const OUT_INTERESSI = $("outInteressi");
const OUT_TOTALE = $("outTotale");
const OUT_TEMPO = $("outTempo");
const OUT_DETTAGLI = $("outDettagli");
const OUT_TABELLA = $("outTabella");

const EURO_FMT = new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" });

const EPS = 0.01;              // chiusura residuo
const MAX_MONTHS = 1200;       // 100 anni di simulazione (sicurezza)

function toNumber(v) {
  const n = Number(v);
  if (!isFinite(n)) return 0;
  return n;
}

function clampMin(n, min) {
  return n < min ? min : n;
}

function formatEuro(n) {
  return EURO_FMT.format(n);
}

function formatMesiToAnniMesi(mesi) {
  const anni = Math.floor(mesi / 12);
  const rest = mesi % 12;
  if (anni <= 0) return `${rest} mesi`;
  if (rest === 0) return `${anni} anni`;
  return `${anni} anni ${rest} mesi`;
}

/* rata mensile con formula ammortamento (annuity) */
function calcolaRataMensile(CAPITALE, TASSO_ANNUO_PCT, ANNI) {
  const N = Math.round(ANNI * 12);
  if (N <= 0) return 0;

  const I = (TASSO_ANNUO_PCT / 100) / 12;

  if (I <= 0) {
    return CAPITALE / N;
  }

  // P = C * i / (1 - (1+i)^-N)
  const DEN = 1 - Math.pow(1 + I, -N);
  if (DEN <= 0) return 0;

  return CAPITALE * I / DEN;
}

/* simulazione mese per mese con extra a frequenza */
function simula(CAPITALE, TASSO_ANNUO_PCT, ANNI, EXTRA, FREQ) {
  const RATA = calcolaRataMensile(CAPITALE, TASSO_ANNUO_PCT, ANNI);
  const I = (TASSO_ANNUO_PCT / 100) / 12;

  let residuo = CAPITALE;
  let totInteressi = 0;
  let totPagato = 0;

  let stepExtra = 1;
  if (FREQ === "bimestrale") stepExtra = 2;
  if (FREQ === "annuale") stepExtra = 12;

  const righe = [];
  let month = 0;

  while (residuo > EPS && month < MAX_MONTHS) {
    month++;

    const interesseMese = residuo * I;
    let quotaCapitale = RATA - interesseMese;

    // Se rata non basta a coprire interessi (caso estremo): blocco
    if (quotaCapitale <= 0) {
      return {
        ok: false,
        errore: "Il tasso è troppo alto rispetto alla rata (ammortamento negativo). Riduci il tasso o aumenta la durata.",
      };
    }

    // Extra quando tocca
    let extraQuestoMese = 0;
    if (EXTRA > 0 && (month % stepExtra === 0)) {
      extraQuestoMese = EXTRA;
    }

    // non pagare più del residuo
    let pagamento = quotaCapitale + extraQuestoMese;
    if (pagamento > residuo) {
      pagamento = residuo;
    }

    residuo -= pagamento;

    totInteressi += interesseMese;
    totPagato += (interesseMese + pagamento);

    // salva ultimi 12 mesi
    righe.push({
      m: month,
      interesse: interesseMese,
      capitale: pagamento,
      extra: extraQuestoMese,
      residuo: residuo
    });
    if (righe.length > 12) righe.shift();
  }

  return {
    ok: true,
    rata: RATA,
    mesi: month,
    interessi: totInteressi,
    totale: totPagato,
    ultimi: righe
  };
}

function renderTabella(ultimi) {
  if (!ultimi || ultimi.length === 0) {
    OUT_TABELLA.innerHTML = "";
    return;
  }

  let html = "";
  html += "<table>";
  html += "<thead><tr>";
  html += "<th>Mese</th><th>Interessi</th><th>Capitale</th><th>Extra</th><th>Residuo</th>";
  html += "</tr></thead>";
  html += "<tbody>";

  for (let i = 0; i < ultimi.length; i++) {
    const r = ultimi[i];
    html += "<tr>";
    html += `<td>${r.m}</td>`;
    html += `<td>${formatEuro(r.interesse)}</td>`;
    html += `<td>${formatEuro(r.capitale)}</td>`;
    html += `<td>${formatEuro(r.extra)}</td>`;
    html += `<td>${formatEuro(Math.max(0, r.residuo))}</td>`;
    html += "</tr>";
  }

  html += "</tbody></table>";
  OUT_TABELLA.innerHTML = html;
}

function calcola() {
  const CAPITALE = clampMin(toNumber(IN_IMPORTO.value), 0);
  const TASSO = clampMin(toNumber(IN_TASSO.value), 0);
  const ANNI = clampMin(toNumber(IN_ANNI.value), 0);

  const EXTRA = clampMin(toNumber(IN_EXTRA.value), 0);
  const FREQ = String(IN_FREQ.value || "mensile");

  if (CAPITALE <= 0 || ANNI <= 0) {
    OUT_DETTAGLI.textContent = "Inserisci almeno Importo e Durata (anni).";
    return;
  }

  const res = simula(CAPITALE, TASSO, ANNI, EXTRA, FREQ);

  if (!res.ok) {
    OUT_DETTAGLI.textContent = res.errore || "Errore nel calcolo.";
    OUT_RATA.textContent = "—";
    OUT_INTERESSI.textContent = "—";
    OUT_TOTALE.textContent = "—";
    OUT_TEMPO.textContent = "—";
    OUT_TABELLA.innerHTML = "";
    return;
  }

  OUT_RATA.textContent = `${formatEuro(res.rata)} / mese`;
  OUT_INTERESSI.textContent = formatEuro(res.interessi);
  OUT_TOTALE.textContent = formatEuro(res.totale);
  OUT_TEMPO.textContent = formatMesiToAnniMesi(res.mesi);

  const extraTxt = EXTRA > 0 ? `${formatEuro(EXTRA)} (${FREQ})` : "nessuno";
  OUT_DETTAGLI.innerHTML =
    `Capitale: <b>${formatEuro(CAPITALE)}</b><br>` +
    `Tasso annuo: <b>${TASSO.toFixed(2)}%</b><br>` +
    `Durata: <b>${ANNI} anni</b><br>` +
    `Extra: <b>${extraTxt}</b><br><br>` +
    `Chiusura stimata in <b>${formatMesiToAnniMesi(res.mesi)}</b>.`;

  renderTabella(res.ultimi);
}

function resetAll() {
  IN_IMPORTO.value = "";
  IN_TASSO.value = "";
  IN_ANNI.value = "";
  IN_EXTRA.value = "";
  IN_FREQ.value = "mensile";

  OUT_RATA.textContent = "—";
  OUT_INTERESSI.textContent = "—";
  OUT_TOTALE.textContent = "—";
  OUT_TEMPO.textContent = "—";
  OUT_DETTAGLI.innerHTML = "Inserisci i dati e premi <b>Calcola</b>.";
  OUT_TABELLA.innerHTML = "";
}

function esempio() {
  IN_IMPORTO.value = "120000";
  IN_TASSO.value = "3.14";
  IN_ANNI.value = "30";
  IN_EXTRA.value = "200";
  IN_FREQ.value = "mensile";
  calcola();
}

/* Reveal on scroll */
function initReveal() {
  const els = document.querySelectorAll(".reveal");
  if (!("IntersectionObserver" in window) || els.length === 0) {
    els.forEach(el => el.classList.add("is-in"));
    return;
  }

  const io = new IntersectionObserver((entries) => {
    entries.forEach(e => {
      if (e.isIntersecting) {
        e.target.classList.add("is-in");
        io.unobserve(e.target);
      }
    });
  }, { threshold: 0.12 });

  els.forEach(el => io.observe(el));
}

function bind() {
  if (BTN_CALCOLA) BTN_CALCOLA.addEventListener("click", calcola);
  if (BTN_CALCOLA_TOP) BTN_CALCOLA_TOP.addEventListener("click", calcola);
  if (BTN_RESET) BTN_RESET.addEventListener("click", resetAll);
  if (BTN_ESEMPIO) BTN_ESEMPIO.addEventListener("click", esempio);

  // Enter per calcolare (su input)
  [IN_IMPORTO, IN_TASSO, IN_ANNI, IN_EXTRA].forEach((el) => {
    if (!el) return;
    el.addEventListener("keydown", (e) => {
      if (e.key === "Enter") calcola();
    });
  });
}

document.addEventListener("DOMContentLoaded", () => {
  bind();
  initReveal();
});

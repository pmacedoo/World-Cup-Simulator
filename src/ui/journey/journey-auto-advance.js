
/* =================================================================
   AVANÇO AUTOMÁTICO DO RELÓGIO DA JORNADA
   -----------------------------------------------------------------
   Avança o tempo até o próximo evento (jogo de outra seleção ou jogo
   da favorita), animando o céu e o relógio com requestAnimationFrame.
   Jogos de terceiros são revelados com um banner de resultado; ao
   chegar num jogo da favorita, o avanço para e devolve o controle.

   Timers: o rAF é guardado em autoAdvanceRafId e o encadeamento em
   appState.autoAdvanceTimer — ambos limpos em pauseAutoAdvance.
   ================================================================= */

import { absoluteJourneyMinute, dayPhaseForMinute, formatJourneyMinute, getMatchWinnerTeam, matchesWithAbsoluteMinutes } from "../../domain/matches/match-queries.js";
import { activeRecord, appState, persistSims } from "../../state/simulation-store.js";
import { flag } from "../render-helpers.js";
import { canRevealMatchTeams, hasWatchedMatch, journeyVisibleContext, nightIntensityForMinute, periodInfoForMinute, revealCalendarMatch, skyVarsForMinute } from "./journey-context.js";
import { renderFavoriteTeamJourney } from "./journey-screens.js";

let autoAdvanceRafId = null;

function startAutoAdvance(){
  if(appState.autoAdvancing) return;
  appState.autoAdvancing = true;
  renderFavoriteTeamJourney();
  setTimeout(runAutoAdvance, 80);
}

function pauseAutoAdvance(){
  appState.autoAdvancing = false;
  if(autoAdvanceRafId){ cancelAnimationFrame(autoAdvanceRafId); autoAdvanceRafId = null; }
  if(appState.autoAdvanceTimer){ clearTimeout(appState.autoAdvanceTimer); appState.autoAdvanceTimer = null; }
  document.querySelector(".auto-advance-banner")?.remove();
  renderFavoriteTeamJourney();
}

function runAutoAdvance(){
  if(!appState.autoAdvancing) return;
  const record = activeRecord();
  if(!record){ pauseAutoAdvance(); return; }
  const ctx = journeyVisibleContext(record);
  if(ctx.finished || ctx.canPlayFavoriteToday){ pauseAutoAdvance(); return; }

  const fromAbs = absoluteJourneyMinute(record.calendarDayIndex, record.journeyMinute);
  const pending = matchesWithAbsoluteMinutes(ctx.days)
    .filter(x => !hasWatchedMatch(record, x.match) && x.abs >= fromAbs);
  const favorite = record.favoriteTeam;
  const nextOther = pending.find(x => x.match.home !== favorite && x.match.away !== favorite);
  const nextFavorite = pending.find(x => (x.match.home === favorite || x.match.away === favorite) && canRevealMatchTeams(ctx, x.match));
  if(!nextOther && !nextFavorite){ pauseAutoAdvance(); return; }

  const event = (!nextOther || (nextFavorite && nextFavorite.abs <= nextOther.abs))
    ? {type:"favorite", ...nextFavorite}
    : {type:"match", ...nextOther};

  // duração proporcional ao salto (mín. 850ms, máx. 2.6s)
  const jumpMinutes = Math.max(1, absoluteJourneyMinute(event.dayIndex, event.minute) - fromAbs);
  const duration = Math.max(850, Math.min(2600, 520 + Math.sqrt(jumpMinutes) * 58));

  animateSkyTransition(record.calendarDayIndex, record.journeyMinute, event.dayIndex, event.minute, duration, () => {
    if(!appState.autoAdvancing) return;
    const previousDay = record.calendarDayIndex;
    record.calendarDayIndex = event.dayIndex;
    record.journeyMinute = event.minute;
    record.dayPhase = dayPhaseForMinute(event.minute);

    if(event.type === "favorite"){
      // chegou no jogo da favorita: para o avanço e devolve a decisão
      appState.autoAdvancing = false;
      persistSims();
      renderFavoriteTeamJourney();
      return;
    }

    revealCalendarMatch(record, event.match);
    persistSims();
    updateJourneyClockDisplay(event.minute);
    const continueAuto = () => {
      if(!appState.autoAdvancing) return;
      appState.autoAdvanceTimer = setTimeout(runAutoAdvance, 120);
    };
    if(previousDay !== event.dayIndex){
      renderFavoriteTeamJourney();
      appState.autoAdvanceTimer = setTimeout(() => showAutoAdvanceBanner(event.match, continueAuto), 100);
    } else {
      showAutoAdvanceBanner(event.match, continueAuto);
    }
  });
}

// Anima céu + relógio do minuto atual até o do evento (easing exponencial:
// começa lento e acelera, simulando o tempo "passando voando").
function animateSkyTransition(fromDay, fromMin, toDay, toMin, duration, onComplete){
  const fromAbs = absoluteJourneyMinute(fromDay, fromMin);
  const toAbs = absoluteJourneyMinute(toDay, toMin);
  if(toAbs <= fromAbs){ onComplete(); return; }
  const diff = toAbs - fromAbs;
  const start = performance.now();
  function frame(now){
    if(!appState.autoAdvancing) return;
    const t = Math.min(1, (now - start) / duration);
    const ease = (Math.exp(3 * t) - 1) / (Math.exp(3) - 1);
    const minute = Math.round(fromAbs + diff * ease) % 1440;
    const shell = document.querySelector(".guided-shell");
    if(shell){
      shell.setAttribute("style", skyVarsForMinute(minute));
      const night = dayPhaseForMinute(minute) === "night";
      shell.classList.toggle("guided-night", night);
      shell.classList.toggle("guided-day", !night);
    }
    updateJourneyClockDisplay(minute);
    if(t < 1){ autoAdvanceRafId = requestAnimationFrame(frame); }
    else onComplete();
  }
  autoAdvanceRafId = requestAnimationFrame(frame);
}

function updateJourneyClockDisplay(minute){
  const clockEl = document.getElementById("journeyClock");
  if(clockEl) clockEl.textContent = formatJourneyMinute(minute);
  const trackEl = document.querySelector(".journey-clock-track span");
  if(trackEl) trackEl.style.width = `${Math.max(0, Math.min(100, (minute / 1440) * 100))}%`;
  const period = periodInfoForMinute(minute);
  const label = document.getElementById("journeyPeriodLabel");
  if(label) label.textContent = period.label;
  const level = document.getElementById("journeyNightLevel");
  if(level) level.style.width = `${Math.round(nightIntensityForMinute(minute) * 100)}%`;
  const pill = document.querySelector(".journey-period-pill");
  if(pill){
    pill.style.setProperty("--night-level", period.night.toFixed(3));
    pill.classList.toggle("is-night", period.tone === "night");
    pill.title = `Intensidade da noite: ${Math.round(period.night * 100)}%`;
  }
}

// Banner com o resultado de um jogo revelado durante o avanço.
function showAutoAdvanceBanner(match, onComplete){
  document.querySelector(".auto-advance-banner")?.remove();
  const container = document.querySelector(".journey-hero-card");
  if(!container){ onComplete(); return; }
  const winner = getMatchWinnerTeam(match);
  const barClass = !winner ? "draw" : winner === match.home ? "from-left" : "from-right";
  const banner = document.createElement("div");
  banner.className = "auto-advance-banner";
  banner.innerHTML = `<div class="auto-advance-bar ${barClass}"></div>
    <div class="auto-advance-result">
      <span class="auto-advance-team">${flag(match.home)} <b>${match.home}</b></span>
      <span class="auto-advance-score" data-final-score="${match.ga} × ${match.gb}">0<span style="margin:0 8px;opacity:.5">×</span>0</span>
      <span class="auto-advance-team"><b>${match.away}</b> ${flag(match.away)}</span>
    </div>`;
  container.style.position = "relative";
  container.appendChild(banner);
  const score = banner.querySelector(".auto-advance-score");
  appState.autoAdvanceTimer = setTimeout(() => {
    if(score){
      score.classList.add("is-final");
      score.textContent = score.dataset.finalScore || `${match.ga} × ${match.gb}`;
    }
  }, 520);
  appState.autoAdvanceTimer = setTimeout(() => {
    banner.classList.add("is-out");
    setTimeout(() => { banner.remove(); onComplete(); }, 420);
  }, 1850);
}

export { pauseAutoAdvance, startAutoAdvance };

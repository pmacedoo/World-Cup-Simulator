
/* =================================================================
   SIMULADOR VISUAL DE PARTIDAS (transmissão acelerada)
   -----------------------------------------------------------------
   Reproduz uma partida já simulada pelo motor como uma "transmissão":
   relógio virtual, eventos (gols, cartões, substituições) surgindo no
   minuto correto, intervalo com trocas no jogo atual da favorita e
   disputa de pênaltis animada quando houver.

   Timers: a transmissão usa appState.matchTimer (setInterval único),
   sempre limpo antes de recomeçar, ao pular e ao fechar o modal.
   ================================================================= */

import { getMatchWinnerTeam } from "../../domain/matches/match-queries.js";
import { profileFor } from "../../state/simulation-profiles.js";
import { activeRecord, appState, currentSim, markMatchRevealed } from "../../state/simulation-store.js";
import { $, el, flag, getFavoriteTeam, ic, matchScheduleLine, paintIcons, renderSimulationTypeBadge, scoreLine, uiConfirm } from "../render-helpers.js";
import { markCalendarMatchWatched } from "../journey/journey-context.js";
import { renderFavoriteTeamJourney } from "../journey/journey-screens.js";
import { closeModal } from "../bracket.js";
import { startShootout, stopShootout } from "./penalty-shootout.js";
import { clearLiveSubPicker, consumeLastConfirmedSubs, openHalftimeBreak, openLiveSubPicker } from "./live-substitutions.js";

/* ---------- formatação de eventos ---------- */
// Normaliza o minuto de um evento para ordenação + exibição ("45+2'").
function normalizeGoalMinute(minute, match = null){
  if(typeof minute === "string"){
    const clean = minute.replace("'", "");
    if(clean.includes("+")){
      const [base, add] = clean.split("+").map(Number);
      return {value:base + add, display:`${base}+${add}'`};
    }
    const n = Number(clean);
    return {value:n, display:`${n}'`};
  }
  const n = Number(minute) || 0;
  // o motor sorteia minutos 1–90 uniformes: 46–49 são minutos normais do
  // 2º tempo, nunca acréscimos do 1º — só >90 (sem prorrogação) é acréscimo
  if(!match?.aet && n > 90) return {value:n, display:`90+${n - 90}'`};
  return {value:n, display:`${n}'`};
}

function matchPhaseLabel(minute, match){
  if(match.aet && minute > 105) return "Prorrogação · 2º tempo";
  if(match.aet && minute > 90) return "Prorrogação";
  if(minute >= 46) return "2º tempo";
  if(minute >= 45) return "Intervalo";
  return "1º tempo";
}

function matchStageTone(match){
  const stage = match.stage || "";
  const round = stage.includes("Rodada") ? (stage.match(/Rodada\s+(\d+)/)?.[1] || "") : "";
  const label = match.matchNo ? `M${match.matchNo} · ${stage}` : stage;
  if(stage.includes("Final")) return {label, cls:"stage-final"};
  if(stage.includes("Semifinal")) return {label, cls:"stage-semi"};
  if(stage.includes("Quartas")) return {label, cls:"stage-qf"};
  if(stage.includes("Oitavas")) return {label, cls:"stage-r16"};
  if(stage.includes("16-avos") || stage.includes("32")) return {label, cls:"stage-r32"};
  if(round === "3") return {label, cls:"stage-group-3"};
  if(round === "2") return {label, cls:"stage-group-2"};
  return {label, cls:"stage-group-1"};
}

function compactPlayerName(name){
  const parts = String(name || "").trim().split(/\s+/).filter(Boolean);
  if(parts.length <= 1) return name;
  const rest = parts.slice(1).join(" ").replace(/\bJr\b\.?/i, "Junior");
  return `${parts[0][0]}. ${rest}`;
}

/* ---------- montagem dos eventos da partida ---------- */
// Agrupa substituições da mesma parada (time+minuto+janela) num evento só.
function groupSubstitutionWindows(match){
  return Object.values((match.substitutions || []).reduce((acc, sub) => {
    const key = [sub.team, sub.minute, sub.window, sub.extraTime ? "et" : "", sub.concussion ? "conc" : ""].join("|");
    acc[key] = acc[key] || {...sub, kind:"subWindow", norm:normalizeGoalMinute(sub.minute, match), changes:[]};
    acc[key].changes.push(sub);
    return acc;
  }, {}));
}

function currentTacticForMatch(match){
  const journeyIdx = appState.currentSimulatedMatch?.journeyIndex;
  const record = activeRecord();
  return (record?.tactics && journeyIdx != null ? record.tactics[journeyIdx] : null)
    || match?.favoriteTactic
    || null;
}

// Lista ordenada de eventos exibíveis. Os gols da favorita respeitam os
// cobradores designados na tática (pênalti / falta), quando definidos.
function buildMatchEvents(match, favoriteTeam, tactic, options = {}){
  const includeSubstitutions = !!options.includeSubstitutions;
  const goals = (match.goals || []).map(goal => {
    let player = goal.player;
    if(tactic && goal.team === favoriteTeam){
      if(goal.type === "de pênalti" && tactic.penaltyTaker) player = tactic.penaltyTaker;
      else if(goal.type === "cobrança de falta" && tactic.freeKickTaker) player = tactic.freeKickTaker;
    }
    return {...goal, player, kind:"goal", norm:normalizeGoalMinute(goal.minute, match)};
  });
  const yellows = (match.yellows || []).map(y => ({...y, kind:"yellow", norm:normalizeGoalMinute(y.minute, match)}));
  return [...goals, ...(includeSubstitutions ? groupSubstitutionWindows(match) : []), ...yellows]
    .sort((a, b) => a.norm.value - b.norm.value || (a.kind === "goal" ? -1 : 1));
}

function goalEventHTML(ev, homeGoals, awayGoals){
  return `<div class="flex items-start gap-3">
    <div class="grid place-items-center w-9 h-9 rounded-full bg-mxgreen/12 text-mxgreen font-extrabold">⚽</div>
    <div>
      <div class="font-extrabold text-slate-800">${ev.norm.display} — ${ev.player} marca para ${flag(ev.team)} ${ev.team}</div>
      <div class="text-sm text-slate-500">${ev.type}${ev.assist ? ` · assistência de ${ev.assist}` : ""} · placar ${homeGoals} x ${awayGoals}</div>
    </div>
  </div>`;
}

function yellowEventHTML(ev){
  return `<div class="flex items-start gap-3">
    <div class="grid place-items-center w-9 h-9 rounded-full bg-gold-500/15 text-gold-600 font-extrabold text-base">🟨</div>
    <div>
      <div class="font-extrabold text-slate-800">${ev.norm.display} — ${ev.player} recebe cartão amarelo</div>
      <div class="text-sm text-slate-500">${flag(ev.team)} ${ev.team}</div>
    </div>
  </div>`;
}

function substitutionWindowNote(ev){
  if(ev.concussion) return "substituição extra por concussão";
  if(ev.extraTime) return "troca extra na prorrogação";
  if(ev.window === "tecnico") return "decisão do técnico";
  if(ev.window === "intervalo") return "troca no intervalo";
  return `janela ${ev.window}`;
}

function substitutionEventHTML(ev){
  const changes = ev.changes || [ev];
  return `<div class="flex items-start gap-3">
    <div class="grid place-items-center w-9 h-9 rounded-full bg-usablue/10 text-usablue font-extrabold">${ic('repeat-2','w-4 h-4')}</div>
    <div class="min-w-0 flex-1">
      <div class="font-extrabold text-slate-800">${ev.norm.display} — ${flag(ev.team)} ${ev.team} mexe no time</div>
      <div class="text-sm text-slate-500">${substitutionWindowNote(ev)}${changes.length > 1 ? ` · ${changes.length} trocas` : ''}</div>
      <div class="mt-2 grid sm:grid-cols-2 gap-1.5">
        ${changes.map(s => `<div class="rounded-xl bg-slate-50/90 border border-slate-100 px-2.5 py-1.5 text-xs font-semibold text-slate-600">
          <span class="text-mxgreen">${compactPlayerName(s.in.name)}</span>
          <span class="text-slate-300 px-1">por</span>
          <span class="text-slate-500">${compactPlayerName(s.out.name)}</span>
        </div>`).join("")}
      </div>
    </div>
  </div>`;
}

function matchFinalSummaryHTML(match){
  const fav = getFavoriteTeam();
  const favPlayed = match.home === fav || match.away === fav;
  const favWon = favPlayed && getMatchWinnerTeam(match) === fav;
  const winnerName = match.winner?.team || getMatchWinnerTeam(match);
  return {
    html: `${flag(winnerName || match.home)} <b>${winnerName || "Empate"}</b> ${getMatchWinnerTeam(match) ? "vence a partida" : "fica no empate"} por <b>${scoreLine(match)}</b> em ${match.city}.`,
    favPlayed, favWon,
  };
}

/* ---------- abertura / fechamento do modal ---------- */
function openMatchSimulator(match, journeyIndex = 0){
  closeModal();
  appState.currentSimulatedMatch = {match, journeyIndex, minute:0, finished:false};
  let modal = $("#matchSimulator");
  if(!modal){
    modal = el("div", "fixed inset-0 z-[80] hidden items-center justify-center p-3 sm:p-5");
    modal.id = "matchSimulator";
    modal.innerHTML = `<div class="absolute inset-0 bg-ink/55 backdrop-blur-xl" data-close></div>
      <div id="matchSimulatorBox" class="relative guided-card rounded-[2rem] shadow-lift w-full max-w-5xl max-h-[94vh] overflow-y-auto p-4 sm:p-6 swap" role="dialog" aria-modal="true" aria-label="Transmissão da partida"></div>`;
    document.body.appendChild(modal);
    modal.addEventListener("click", e => { if(e.target.dataset.close !== undefined) closeMatchSimulator(); });
  }
  const type = currentSim()?.simulationType || activeRecord()?.type || "realistic";
  const profile = profileFor(type);
  const fav = getFavoriteTeam();
  const stageTone = matchStageTone(match);
  // edição ao vivo só vale para o jogo ATUAL da favorita (não em replays)
  const favPlaysHere = match.home === fav || match.away === fav;
  const editable = favPlaysHere && journeyIndex === (activeRecord()?.revealed);

  $("#matchSimulatorBox").innerHTML = `
    <button class="absolute top-4 right-4 text-slate-400 hover:text-ink" data-close aria-label="Fechar transmissão">✕</button>
    <div class="flex flex-wrap items-center justify-between gap-3 pr-8">
      <div>
        <div class="text-[11px] uppercase tracking-widest font-extrabold text-slate-400">${match.matchNo ? `M${match.matchNo} · ` : ''}${match.stage}</div>
        <div class="text-sm text-slate-500 font-semibold mt-1">${matchScheduleLine(match)}</div>
      </div>
      <div class="match-top-actions flex flex-wrap items-center justify-end gap-2">
        ${editable ? `<button id="liveSubBtn" class="btn-premium text-white rounded-2xl px-4 py-2.5 font-extrabold flex items-center gap-1.5">${ic('repeat-2','w-4 h-4')} Substituir</button>` : ''}
        <button id="skipMatchSim" class="glass rounded-2xl px-4 py-2.5 font-bold text-slate-700 flex items-center gap-1.5">${ic('fast-forward','w-4 h-4')} Pular</button>
        ${renderSimulationTypeBadge(type)}
      </div>
    </div>
    <div class="mt-6 grid grid-cols-[1fr_auto_1fr] items-center gap-3 sm:gap-6">
      <div id="simHomeSide" class="match-side rounded-3xl p-4 bg-white/60 text-right">
        <div class="flex justify-end mb-2">${flag(match.home, 'flag-xl')}</div>
        <div class="match-team-name font-display font-extrabold text-xl sm:text-3xl">${match.home}</div>
      </div>
      <div class="text-center">
        <div id="simStageBadge" class="match-stage-badge ${stageTone.cls} mx-auto">${stageTone.label}</div>
        <div id="simClock" class="text-xs uppercase tracking-widest font-extrabold text-slate-400">00'</div>
        <div id="simScore" class="match-sim-score mt-2 rounded-[1.5rem] bg-ink text-white px-5 sm:px-8 py-3 font-display font-extrabold text-3xl sm:text-5xl tnum">0 x 0</div>
        <div id="simPhase" class="mt-2 text-xs font-extrabold text-slate-500">${matchPhaseLabel(0, match)}</div>
      </div>
      <div id="simAwaySide" class="match-side rounded-3xl p-4 bg-white/60 text-left">
        <div class="flex justify-start mb-2">${flag(match.away, 'flag-xl')}</div>
        <div class="match-team-name font-display font-extrabold text-xl sm:text-3xl">${match.away}</div>
      </div>
    </div>
    <div class="mt-6 h-3 rounded-full bg-slate-200/70 overflow-hidden">
      <div id="simProgress" class="h-full rounded-full" style="width:0%;background:linear-gradient(90deg,${profile.color},#1f7a4d,#c8962f)"></div>
    </div>
    <div id="pkMount" class="mt-5"></div>
    <div id="liveSubMount" class="mt-4"></div>
    <div id="simInfoGrid" class="mt-5 grid lg:grid-cols-[1fr_.78fr] gap-4">
      <div class="match-event-panel rounded-3xl bg-white/55 border border-white/70 p-4">
        <div class="text-[11px] uppercase tracking-widest font-extrabold text-slate-400 mb-3">Eventos da partida</div>
        <div id="simTimeline" class="match-scroll-area journey-scroll-list space-y-2"></div>
      </div>
      <div class="match-summary-panel rounded-3xl bg-white/55 border border-white/70 p-4">
        <div class="text-[11px] uppercase tracking-widest font-extrabold text-slate-400">Resumo final</div>
        <div id="simSummary" class="match-summary-scroll journey-scroll-list mt-3 text-sm text-slate-600 leading-relaxed">A transmissão acelerada vai começar. O placar final só aparece quando os eventos acontecerem.</div>
      </div>
    </div>
    <div class="mt-5 flex flex-wrap justify-between gap-3">
      <div></div>
      <button id="backToJourney" class="btn-premium text-white rounded-2xl px-4 py-2.5 font-bold">Voltar à jornada</button>
    </div>`;

  const backToJourney = () => { closeMatchSimulator(); renderFavoriteTeamJourney(); };
  $("#matchSimulatorBox").querySelector("[data-close]").onclick = backToJourney;
  $("#backToJourney").onclick = backToJourney;
  if($("#liveSubBtn")) $("#liveSubBtn").onclick = () => openLiveSubPicker("live");
  $("#skipMatchSim").onclick = () => uiConfirm("Pular a transmissão e mostrar o resultado final?", () => skipMatchSimulation(match));
  modal.classList.remove("hidden");
  modal.classList.add("flex");
  setTimeout(() => simulateMatch(match), 160);
  paintIcons();
}

function closeMatchSimulator(){
  if(appState.matchTimer) clearInterval(appState.matchTimer);
  appState.matchTimer = null;
  stopShootout();
  clearLiveSubPicker();
  const modal = $("#matchSimulator");
  if(modal){ modal.classList.add("hidden"); modal.classList.remove("flex"); }
}

// Revela o jogo na jornada (idempotente) e sincroniza relógio/calendário.
function markSimulatedMatchComplete(match){
  const item = appState.currentSimulatedMatch;
  if(item && item.match === match){
    item.finished = true;
    markCalendarMatchWatched(activeRecord(), match);
    if((item.journeyIndex | 0) >= 0) markMatchRevealed(activeRecord(), item.journeyIndex);
  }
}

/* ---------- pular transmissão ---------- */
function skipMatchSimulation(match){
  if(appState.matchTimer){ clearInterval(appState.matchTimer); appState.matchTimer = null; }
  stopShootout();
  const scoreEl = $("#simScore"), clockEl = $("#simClock"), progressEl = $("#simProgress");
  const timeline = $("#simTimeline"), summary = $("#simSummary"), phaseEl = $("#simPhase");
  const pkMount = $("#pkMount"), infoGrid = $("#simInfoGrid"), skipBtn = $("#skipMatchSim");
  if(!scoreEl) return;

  scoreEl.textContent = `${match.ga} x ${match.gb}`;
  clockEl.textContent = match.aet ? "120'" : "90'";
  phaseEl.textContent = "Fim de jogo";
  progressEl.style.width = "100%";
  if(skipBtn) skipBtn.classList.add("hidden");

  if(timeline){
    // mesma favorita/tática da transmissão: pular não pode trocar o nome
    // dos cobradores designados (pênalti/falta) nos gols da favorita
    const favTeam = getFavoriteTeam();
    const tactic = currentTacticForMatch(match);
    const events = buildMatchEvents(match, favTeam, tactic, {includeSubstitutions:true});
    timeline.innerHTML = `<div class="goal-event rounded-2xl bg-slate-100/80 px-4 py-3 text-sm font-semibold text-slate-500">Apito inicial · Partida encerrada.</div>`;
    let homeGoals = 0, awayGoals = 0;
    events.forEach(ev => {
      let html;
      if(ev.kind === "goal"){
        if(ev.team === match.home) homeGoals++; else awayGoals++;
        html = goalEventHTML(ev, homeGoals, awayGoals);
      } else if(ev.kind === "yellow"){
        html = yellowEventHTML(ev);
      } else {
        html = substitutionEventHTML(ev);
      }
      timeline.insertAdjacentHTML("afterbegin", `<div class="goal-event rounded-2xl bg-white/80 border border-white/80 px-4 py-3 shadow-glass">${html}</div>`);
    });
  }

  markSimulatedMatchComplete(match);

  if(infoGrid) infoGrid.classList.remove("hidden");
  if(match.penalties){
    const sh = match.penalties;
    if(pkMount) pkMount.innerHTML = `<div class="glass rounded-2xl p-5 text-center">
      <div class="text-[11px] uppercase tracking-widest font-extrabold text-slate-400 mb-3 flex items-center justify-center gap-2">${ic('target','w-4 h-4 text-usared')} Disputa de pênaltis</div>
      <div class="font-display font-extrabold text-4xl tnum">${sh.homeScore} <span class="text-slate-300 px-2">x</span> ${sh.awayScore}</div>
      <div class="mt-3 font-extrabold text-lg text-mxgreen">${flag(sh.winner)} ${sh.winner} avança!</div>
      <div class="mt-2 text-sm text-slate-500">(no tempo normal: ${match.ga}–${match.gb})</div></div>`;
    if(summary) summary.innerHTML = `${flag(sh.winner)} <b>${sh.winner}</b> avança nos pênaltis por <b>${sh.homeScore} x ${sh.awayScore}</b> (no tempo normal, ${match.ga}–${match.gb}).`;
    const fav = getFavoriteTeam();
    if((match.home === fav || match.away === fav) && sh.winner === fav) celebrateConfetti();
  } else {
    if(pkMount) pkMount.innerHTML = "";
    const result = matchFinalSummaryHTML(match);
    if(summary) summary.innerHTML = `${result.html}${result.favPlayed ? (result.favWon ? " Sua seleção venceu este capítulo da jornada." : " Sua seleção não venceu este jogo.") : ""}`;
    if(result.favPlayed && result.favWon) celebrateConfetti();
  }
  paintIcons();
}

/* ---------- transmissão acelerada ---------- */
const MATCH_SIM_TICK_MS = 120;

function simulateMatch(match, resumeFrom = 0){
  if(appState.matchTimer) clearInterval(appState.matchTimer);
  stopShootout();
  clearLiveSubPicker();
  const pkMount = $("#pkMount"); if(pkMount) pkMount.innerHTML = "";
  const infoGrid = $("#simInfoGrid"); if(infoGrid) infoGrid.classList.remove("hidden");
  if(appState.currentSimulatedMatch) appState.currentSimulatedMatch.finished = false;

  const totalMs = match.pens ? 28000 : match.aet ? 25000 : 20000;
  const virtualMax = match.aet ? 120 : 90;

  // intervalo só pausa no jogo ATUAL da favorita (onde trocas são permitidas)
  const favTeam = getFavoriteTeam(), record = activeRecord();
  const editable = !!record && (match.home === favTeam || match.away === favTeam)
    && (appState.currentSimulatedMatch?.journeyIndex) === record.revealed;
  const tactic = currentTacticForMatch(match);
  let halftimeOffered = resumeFrom >= 45;

  const events = buildMatchEvents(match, favTeam, tactic);
  let shown = 0, homeGoals = 0, awayGoals = 0;
  const scoreEl = $("#simScore"), clockEl = $("#simClock"), progressEl = $("#simProgress");
  const timeline = $("#simTimeline"), summary = $("#simSummary");
  const homeSide = $("#simHomeSide"), awaySide = $("#simAwaySide"), phaseEl = $("#simPhase");

  // mensagem de retomada após troca ao vivo confirmada
  const confirmedSubs = consumeLastConfirmedSubs();
  const resumeMsg = resumeFrom > 0
    ? (confirmedSubs && confirmedSubs.length
        ? `<div class="font-bold mb-1.5">Substituição${confirmedSubs.length > 1 ? "ões" : ""} confirmada${confirmedSubs.length > 1 ? "s" : ""} aos ${resumeFrom}′</div>`
          + confirmedSubs.map(s => `<div class="flex items-center gap-1.5 mt-1"><span class="text-usared font-extrabold">↑</span> <span>${s.out}</span> <span class="text-slate-400 mx-0.5">→</span> <span class="text-mxgreen font-extrabold">↓</span> <span>${s.in}</span></div>`).join("")
        : `Substituição confirmada aos ${resumeFrom}'. A partida segue daqui.`)
    : "Apito inicial. A partida começa em ritmo acelerado.";
  timeline.innerHTML = `<div class="goal-event rounded-2xl bg-slate-100/80 px-4 py-3 text-sm font-semibold text-slate-500">${resumeMsg}</div>`;
  summary.textContent = "Acompanhe os eventos surgindo no minuto correto da simulação.";

  function addEvent(html){
    timeline.insertAdjacentHTML("afterbegin", `<div class="goal-event rounded-2xl bg-white/80 border border-white/80 px-4 py-3 shadow-glass">${html}</div>`);
  }
  function flashScore(team){
    scoreEl.classList.remove("flash"); void scoreEl.offsetWidth; scoreEl.classList.add("flash");
    const side = team === match.home ? homeSide : awaySide;
    side.classList.remove("hot"); void side.offsetWidth; side.classList.add("hot");
  }
  function applyEvent(ev, animate){
    if(ev.kind === "goal"){
      if(ev.team === match.home) homeGoals++; else awayGoals++;
      scoreEl.textContent = `${homeGoals} x ${awayGoals}`;
      if(animate) flashScore(ev.team);
      addEvent(goalEventHTML(ev, homeGoals, awayGoals));
    } else if(ev.kind === "yellow"){
      addEvent(yellowEventHTML(ev));
    } else {
      addEvent(substitutionEventHTML(ev));
      if(animate) paintIcons();
    }
  }

  // retomada após troca ao vivo: reaplica instantaneamente o que já passou
  if(resumeFrom > 0){
    while(shown < events.length && events[shown].norm.value < resumeFrom) applyEvent(events[shown++], false);
    scoreEl.textContent = `${homeGoals} x ${awayGoals}`;
    paintIcons();
  }

  const start = Date.now() - (resumeFrom / virtualMax) * totalMs;
  appState.matchTimer = setInterval(() => {
    const elapsed = Date.now() - start;
    const ratio = Math.min(1, elapsed / totalMs);
    const minute = Math.round(ratio * virtualMax);
    if(appState.currentSimulatedMatch) appState.currentSimulatedMatch.minute = minute;
    clockEl.textContent = `${String(minute).padStart(2, "0")}'`;
    phaseEl.textContent = matchPhaseLabel(minute, match);
    progressEl.style.width = `${Math.min(100, ratio * 100)}%`;
    while(shown < events.length && events[shown].norm.value <= minute) applyEvent(events[shown++], true);

    // pausa no intervalo: oferece trocas (só no jogo atual da favorita)
    if(editable && !halftimeOffered && minute >= 45 && ratio < 1){
      halftimeOffered = true;
      clearInterval(appState.matchTimer);
      appState.matchTimer = null;
      clockEl.textContent = "45'";
      phaseEl.textContent = "Intervalo";
      openHalftimeBreak();
      return;
    }

    if(ratio >= 1){
      clearInterval(appState.matchTimer);
      appState.matchTimer = null;
      scoreEl.textContent = `${match.ga} x ${match.gb}`;
      clockEl.textContent = match.aet ? "120'" : "90'";
      phaseEl.textContent = "Fim de jogo";
      progressEl.style.width = "100%";
      const skipBtn = $("#skipMatchSim");
      if(skipBtn) skipBtn.classList.add("hidden");
      // com pênaltis, a revelação acontece só no fim da disputa
      if(!match.penalties) markSimulatedMatchComplete(match);
      if(!events.some(ev => ev.kind === "goal")) addEvent(`<div class="font-extrabold text-slate-700">Fim do tempo${match.aet ? ' (após prorrogação)' : ''}.</div><div class="text-sm text-slate-500">${match.penalties ? 'Empate persiste — a decisão vai para os pênaltis.' : 'Defesas dominaram e ninguém abriu o placar.'}</div>`);
      if(match.penalties){
        addEvent(`<div class="font-extrabold text-slate-700 flex items-center gap-2">${ic('target','w-4 h-4 text-usared')} Decisão por pênaltis</div><div class="text-sm text-slate-500">Tudo igual em ${scoreLine({...match, pens:null})}. As cobranças vão definir quem avança.</div>`);
        summary.innerHTML = `Empate até o fim. A vaga será decidida nas cobranças de pênalti — acompanhe abaixo, cobrança a cobrança.`;
        startShootout(match);
      } else {
        const result = matchFinalSummaryHTML(match);
        summary.innerHTML = `${result.html} ${result.favPlayed ? (result.favWon ? "Sua seleção venceu este capítulo da jornada." : "Sua seleção não venceu este jogo.") : ""}`;
        if(result.favPlayed && result.favWon) celebrateConfetti();
      }
    }
  }, MATCH_SIM_TICK_MS);
}

/* ---------- confetes (vitória da favorita) ---------- */
function celebrateConfetti(){
  const box = $("#matchSimulatorBox");
  if(!box) return;
  const colors = ["#0a3161", "#b31942", "#1f7a4d", "#c8962f", "#e9b949"];
  for(let i = 0; i < 48; i++){
    const piece = document.createElement("div");
    piece.className = "confetti-pc";
    piece.style.left = Math.random() * 100 + "%";
    piece.style.background = colors[i % colors.length];
    piece.style.animationDuration = (1.6 + Math.random() * 1.4) + "s";
    piece.style.animationDelay = (Math.random() * 0.4) + "s";
    box.appendChild(piece);
    setTimeout(() => piece.remove(), 3400);
  }
}

export { celebrateConfetti, closeMatchSimulator, markSimulatedMatchComplete, openMatchSimulator, simulateMatch };

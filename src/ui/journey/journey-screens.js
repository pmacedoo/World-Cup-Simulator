
/* =================================================================
   TELAS DA JORNADA GUIADA + ROTEAMENTO ENTRE VISÕES
   -----------------------------------------------------------------
   Fluxo: escolher seleção -> escolher tipo -> jornada dia a dia ->
   (Copa encerrada) -> dashboard completo. `renderApp` decide qual
   tela mostrar a partir de appState.view e do registro ativo.
   ================================================================= */

import { TEAMS } from "../../data/worldcup-data.js";
import { pick } from "../../engine/random.js";
import { teamMeta } from "../../domain/teams/team-meta.js";
import { matchFavoriteIndex } from "../../domain/matches/match-queries.js";
import { PROFILE_ORDER, profileFor } from "../../state/simulation-profiles.js";
import { activeRecord, appState, createSimulation, deleteSimulation, persistSims, setActiveSimulation } from "../../state/simulation-store.js";
import { $, flag, getAllTeamsFromSimulation, getFavoriteTeam, ic, paintIcons, renderSimulationTypeBadge, uiConfirm } from "../render-helpers.js";
import { journeyVisibleContext, jumpToNextFavoriteMatch, skyVarsForMinute } from "./journey-context.js";
import { stopJourneyNewsCarousel, wireJourneyNewsCarousel } from "./journey-news.js";
import { renderIntroNav, statusPill } from "./journey-components.js";
import { openDaySnapshot } from "./journey-snapshots.js";
import { isMobileJourneyViewport, renderDesktopJourneyApp, renderMobileJourneyApp, setJourneyLayoutIsMobile, wireMobileJourneyTabs } from "./journey-mobile.js";
import { pauseAutoAdvance, startAutoAdvance } from "./journey-auto-advance.js";
import { openTacticPlanner } from "../match/lineup-editor.js";
import { openMatchSimulator } from "../match/match-simulator.js";
import { flashLoader, renderAll } from "../../app/app.js";

/* ---------- ações de fluxo ---------- */
function startNewSimulation(){
  appState.draftTeam = null;
  appState.teamSearch = "";
  appState.view = "picker-team";
  renderTeamPickerIntro();
}

// Cria uma nova simulação (seleção + tipo), salva e entra na jornada.
function commitSimulation(team, type){
  flashLoader();
  createSimulation(team, type);
  appState.view = "journey";
  setTimeout(() => renderFavoriteTeamJourney(), 320);
}

// "Trocar tipo": gera uma NOVA simulação com a mesma seleção e outro tom.
function changeSimulationType(){
  appState.draftTeam = getFavoriteTeam();
  appState.view = "picker-type";
  renderSimulationTypePicker();
}

// "Trocar seleção": começa uma nova simulação do zero.
function changeFavoriteTeam(){ startNewSimulation(); }

// Reinicia o PROGRESSO da simulação ativa (revive a campanha do zero).
function resetGuidedExperience(){
  const record = activeRecord();
  if(record){
    record.revealed = 0;
    record.watchIndex = 0;
    record.calendarDayIndex = 0;
    record.journeyMinute = 300;
    record.watchedMatchNos = [];
    record.finished = false;
    record.dashboardUnlocked = false;
    record.dayPhase = "morning";
    persistSims();
  }
  appState.view = "journey";
  renderFavoriteTeamJourney();
}

function openFullDashboard(){
  const record = activeRecord();
  if(record){ record.dashboardUnlocked = true; persistSims(); }
  appState.view = "dashboard";
  renderFullDashboard();
}

/* ---------- casca da experiência guiada ---------- */
function setGuidedVisibility(showGuided){
  $("#guidedExperience").classList.toggle("hidden", !showGuided);
  $("#siteHeader").classList.toggle("hidden", showGuided);
  $("#top").classList.toggle("hidden", showGuided);
  $("#siteFooter").classList.toggle("hidden", showGuided);
}

// Renderiza uma tela dentro da casca guiada. Limpa o carrossel de
// notícias anterior para nunca acumular timers entre renders.
function renderGuided(html, shellTone = "", transitionTone = "", shellStyle = ""){
  stopJourneyNewsCarousel();
  setGuidedVisibility(true);
  const mobileShell = String(html).includes("mobile-journey-app") ? "guided-mobile-shell" : "";
  $("#guidedExperience").innerHTML = `<section class="guided-shell ${shellTone} ${transitionTone} ${mobileShell}" style="${shellStyle}"><div class="guided-sky-fade" aria-hidden="true"></div><div class="guided-celestial" aria-hidden="true"></div><div class="guided-content">${html}</div></section>`;
  paintIcons();
}

// Remove acentos para busca tolerante ("Tcheq" encontra "Tchéquia").
function normalizeSearchText(value){
  return String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

/* ---------- tela 1: escolha da seleção ---------- */
function renderTeamPickerIntro(){
  appState.view = "picker-team";
  const hasSims = appState.sims.length > 0;
  const teams = getAllTeamsFromSimulation();
  const query = normalizeSearchText(appState.teamSearch).trim();
  const teamSearchBlob = team => {
    const meta = teamMeta[team];
    return normalizeSearchText(`${team} ${meta.confederation} ${meta.status} ${meta.keyPlayers.join(" ")}`);
  };
  const filtered = teams.filter(team => !query || teamSearchBlob(team).includes(query));

  renderGuided(`
    ${renderIntroNav("team-picker")}
    <div class="max-w-7xl mx-auto grid lg:grid-cols-[.85fr_1.15fr] gap-6 items-start">
      <div class="guided-card rounded-[2rem] p-7 sm:p-9 guided-enter">
        <div class="inline-flex items-center gap-2 px-3 py-1.5 rounded-full glass text-xs font-extrabold text-slate-600 mb-5">${ic('sparkles','w-4 h-4 text-gold-600')} Experiência guiada</div>
        <h1 class="font-display font-extrabold text-4xl sm:text-6xl leading-[1.02]">Escolha sua <span class="grad-text">seleção favorita</span></h1>
        <p class="mt-5 text-slate-600 text-lg leading-relaxed">Antes de ver a Copa inteira, acompanhe a jornada da sua seleção dentro da simulação.</p>
        <div class="mt-7 rounded-3xl p-5 bg-white/60 border border-white/70">
          <div class="text-[11px] uppercase tracking-widest font-extrabold text-slate-400">Como funciona</div>
          <div class="mt-3 grid gap-3 text-sm text-slate-600 font-semibold">
            <div class="flex gap-3">${ic('mouse-pointer-click','w-5 h-5 text-usablue')} Escolha a seleção.</div>
            <div class="flex gap-3">${ic('sliders-horizontal','w-5 h-5 text-mxgreen')} Defina o tom da Copa.</div>
            <div class="flex gap-3">${ic('play','w-5 h-5 text-usared')} Assista aos jogos em modo acelerado.</div>
          </div>
        </div>
        <div class="mt-7 flex flex-wrap gap-3">
          <button id="continueTeamPick" class="btn-premium text-white font-extrabold px-6 py-3.5 rounded-2xl disabled:opacity-40 disabled:pointer-events-none" ${appState.draftTeam ? '' : 'disabled'}>Continuar</button>
          ${hasSims ? `<button id="cancelPick" class="glass rounded-2xl px-5 py-3.5 font-extrabold text-slate-600">Voltar às minhas simulações</button>` : ''}
        </div>
      </div>
      <div class="guided-card rounded-[2rem] p-4 sm:p-5 guided-enter">
        <div class="flex flex-col sm:flex-row sm:items-center gap-3 mb-4">
          <div class="relative flex-1">
            <i data-lucide="search" class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400"></i>
            <input id="teamSearchInput" value="${appState.teamSearch || ''}" placeholder="Buscar por seleção, confederação ou status" aria-label="Buscar seleção" class="w-full rounded-2xl glass px-10 py-3 text-sm font-semibold outline-none" />
          </div>
          <div id="teamSearchCount" class="text-xs text-slate-400 font-bold" aria-live="polite">${filtered.length} seleções</div>
        </div>
        <div id="teamPickerGrid" class="journey-scroll-list grid sm:grid-cols-2 xl:grid-cols-3 gap-3 max-h-[68vh] pr-1">
          ${filtered.map((team, i) => `
            <button class="team-pick-card text-left rounded-3xl p-4 glass ${appState.draftTeam === team ? 'active' : ''} guided-stagger" style="--i:${i % 18}" data-team="${team}" data-search="${teamSearchBlob(team)}">
              <div class="flex items-start justify-between gap-3">
                <div class="flex items-center gap-3 min-w-0">
                  ${flag(team, 'flag-lg')}
                  <div class="min-w-0">
                    <div class="font-display font-extrabold truncate">${team}</div>
                    <div class="text-xs text-slate-500 font-bold">${teamMeta[team].confederation} · força ${teamMeta[team].strength}</div>
                  </div>
                </div>
                ${statusPill(teamMeta[team].status)}
              </div>
              <div class="mt-3 text-xs text-slate-500 truncate">Destaques: ${teamMeta[team].keyPlayers.slice(0, 3).join(", ")}</div>
            </button>`).join("")}
          <div class="scroll-affordance">Mais seleções abaixo</div>
        </div>
      </div>
    </div>`);

  wireTeamPickerEvents();
}

// Busca filtra os cards já renderizados (sem re-render da tela inteira).
function wireTeamPickerEvents(){
  $("#teamSearchInput").oninput = e => {
    appState.teamSearch = e.target.value;
    const query = normalizeSearchText(appState.teamSearch).trim();
    let visible = 0;
    document.querySelectorAll("#teamPickerGrid [data-team]").forEach((card, idx) => {
      const show = !query || (card.dataset.search || "").includes(query);
      card.classList.toggle("hidden", !show);
      if(show){
        visible++;
        card.style.setProperty("--i", String(Math.min(idx, 18)));
      }
    });
    if($("#teamSearchCount")) $("#teamSearchCount").textContent = `${visible} seleç${visible === 1 ? "ão" : "ões"}`;
  };
  document.querySelectorAll("#teamPickerGrid [data-team]").forEach(card => card.onclick = () => {
    appState.draftTeam = card.dataset.team;
    document.querySelectorAll("#teamPickerGrid [data-team]").forEach(c => c.classList.toggle("active", c === card));
    const continueBtn = $("#continueTeamPick");
    if(continueBtn) continueBtn.disabled = false;
  });
  $("#continueTeamPick").onclick = () => {
    if(!appState.draftTeam) return;
    appState.view = "picker-type";
    renderSimulationTypePicker();
  };
  if($("#cancelPick")) $("#cancelPick").onclick = () => {
    appState.view = activeRecord()?.dashboardUnlocked ? "dashboard" : "journey";
    renderApp();
  };
}

/* ---------- tela 2: escolha do tipo de simulação ---------- */
const PROFILE_BULLETS = {
  realistic: ["Favoritos tendem a ir mais longe", "Placares mais controlados", "Elencos profundos e técnicos pesam mais"],
  epic: ["Craques decidem jogos grandes", "Clássicos e finais ganham peso narrativo", "Mais viradas, prorrogações e legado"],
  dramatic: ["Mais zebras e eliminações chocantes", "Mais pênaltis e gols no fim", "Seleções médias podem crescer muito"],
};

function renderSimulationTypePicker(){
  appState.view = "picker-type";
  const team = appState.draftTeam || getFavoriteTeam();
  renderGuided(`
    ${renderIntroNav("type-picker")}
    <div class="max-w-6xl mx-auto guided-enter">
      <div class="text-center max-w-3xl mx-auto">
        <div class="mb-4">${flag(team, 'flag-xl')}</div>
        <h1 class="font-display font-extrabold text-4xl sm:text-6xl leading-[1.02]">Escolha o tipo de <span class="grad-text">simulação</span></h1>
        <p class="mt-4 text-slate-600 text-lg">Cada estilo muda o tom da Copa, as zebras, o peso dos favoritos e o roteiro do torneio.</p>
      </div>
      <div class="grid lg:grid-cols-3 gap-5 mt-9">
        ${PROFILE_ORDER.map((type, i) => {
          const p = profileFor(type);
          const bullets = PROFILE_BULLETS[type] || [];
          return `<button class="type-pick-card ${p.className} guided-card rounded-[2rem] p-6 text-left guided-stagger" style="--i:${i}" data-type="${type}">
            ${renderSimulationTypeBadge(type)}
            <h2 class="mt-5 font-display font-extrabold text-2xl">${p.label}</h2>
            <p class="mt-2 text-slate-600 leading-relaxed">${p.description}</p>
            <div class="mt-5 space-y-2">${bullets.map(b => `<div class="flex gap-2 text-sm font-semibold text-slate-600">${ic('check-circle-2','w-4 h-4')} ${b}</div>`).join("")}</div>
          </button>`;
        }).join("")}
      </div>
      <div class="mt-7 text-center">
        <button id="backToTeams" class="glass rounded-2xl px-5 py-3 font-bold text-slate-600">Trocar seleção</button>
      </div>
    </div>`);
  document.querySelectorAll("[data-type]").forEach(card => card.onclick = () => {
    commitSimulation(team, card.dataset.type);
  });
  $("#backToTeams").onclick = startNewSimulation;
}

/* ---------- tela 3: jornada dia a dia ---------- */
function renderFavoriteTeamJourney(){
  appState.view = "journey";
  const record = activeRecord();
  if(!record){ startNewSimulation(); return; }
  const team = record.favoriteTeam, type = record.type;
  const ctx = journeyVisibleContext(record);
  const matches = ctx.matches;
  const revealed = ctx.revealed;
  const finished = ctx.finished;
  if(record.finished !== finished){ record.finished = finished; persistSims(); }

  // transição suave de céu quando o período (dia/noite) muda entre renders
  const previousShell = document.querySelector("#guidedExperience .guided-shell");
  const previousTone = previousShell?.classList.contains("guided-night") ? "night"
    : previousShell?.classList.contains("guided-day") ? "day" : "";
  const nextTone = ctx.period === "night" ? "night" : "day";
  const transitionTone = previousTone && previousTone !== nextTone ? `sky-from-${previousTone}` : "";
  const shellTone = ctx.dayPhase === "night" ? "guided-night" : "guided-day";

  const isMobileJourney = isMobileJourneyViewport();
  setJourneyLayoutIsMobile(isMobileJourney);
  const journeyHtml = isMobileJourney
    ? renderMobileJourneyApp(ctx, type, matches, revealed)
    : `${renderIntroNav("journey")}
      <div class="max-w-[1800px] mx-auto">
        ${renderDesktopJourneyApp(ctx, type, matches, revealed)}
      </div>`;

  renderGuided(journeyHtml, `guided-${nextTone}`, transitionTone, skyVarsForMinute(ctx.journeyMinute));
  wireJourneyEvents(ctx, matches, revealed, finished);
}

// Liga todos os eventos da tela da jornada (re-executado a cada render,
// sempre sobre nós recém-criados — sem listeners acumulados).
function wireJourneyEvents(ctx, matches, revealed, finished){
  document.querySelectorAll(".day-snap-btn").forEach(b => b.onclick = () => openDaySnapshot(b.dataset.snap));
  document.querySelectorAll(".replay-btn").forEach(b => b.onclick = () => {
    const i = Number(b.dataset.idx);
    if(matches[i]) openMatchSimulator(matches[i], i);
  });
  document.querySelectorAll(".switch-sim").forEach(b => b.onclick = () => { setActiveSimulation(b.dataset.id); renderApp(); });
  document.querySelectorAll(".del-sim").forEach(b => b.onclick = () => {
    uiConfirm("Excluir esta simulação?", () => { deleteSimulation(b.dataset.id); renderApp(); });
  });
  if($("#newSimFromJourney")) $("#newSimFromJourney").onclick = startNewSimulation;
  wireJourneyNewsCarousel();
  document.querySelectorAll(".calendar-play").forEach(b => b.onclick = () => {
    const matchNo = Number(b.dataset.matchNo);
    const match = ctx.dayMatches.find(m => m.matchNo === matchNo);
    const idx = match ? matchFavoriteIndex(match, matches) : -1;
    if(match && idx >= 0) openTacticPlanner(match, idx);
  });
  document.querySelectorAll(".calendar-watch").forEach(b => b.onclick = () => {
    const matchNo = Number(b.dataset.matchNo);
    const match = ctx.dayMatches.find(m => m.matchNo === matchNo);
    if(!match) return;
    const idx = matchFavoriteIndex(match, matches);
    openMatchSimulator(match, idx >= 0 ? idx : -1);
  });
  if($("#autoAdvanceClock")) $("#autoAdvanceClock").onclick = startAutoAdvance;
  if($("#jumpToNextMatch")) $("#jumpToNextMatch").onclick = () => {
    jumpToNextFavoriteMatch(activeRecord());
    renderFavoriteTeamJourney();
  };
  if($("#pauseAutoAdvance")) $("#pauseAutoAdvance").onclick = pauseAutoAdvance;
  if($("#startJourney")) $("#startJourney").onclick = () => {
    if(matches[revealed] && !finished) openTacticPlanner(matches[revealed], revealed);
  };
  if($("#askDashboard")) $("#askDashboard").onclick = () => { if(finished) renderDashboardConfirmation(); };
  if($("#journeyTypeBack")) $("#journeyTypeBack").onclick = changeSimulationType;
  if($("#resetGuidedSmall")) $("#resetGuidedSmall").onclick = resetGuidedExperience;
  wireMobileJourneyTabs();
}

/* ---------- tela 4: confirmação do dashboard completo ---------- */
function renderDashboardConfirmation(){
  const team = getFavoriteTeam();
  renderGuided(`
    ${renderIntroNav("dashboard")}
    <div class="max-w-3xl mx-auto guided-card rounded-[2rem] p-8 sm:p-10 text-center guided-enter">
      <div class="mx-auto w-16 h-16 rounded-3xl grid place-items-center text-white mb-5" style="background:var(--grad-2026)">${ic('layout-dashboard','w-8 h-8')}</div>
      <h1 class="font-display font-extrabold text-4xl sm:text-5xl">Agora deseja abrir o dashboard completo da Copa?</h1>
      <p class="mt-4 text-slate-600 text-lg leading-relaxed">Você acompanhou a jornada de ${flag(team)} ${team}. Agora pode explorar todos os grupos, jogos, chaveamentos, estatísticas e histórias da simulação.</p>
      <div class="mt-8 flex flex-col sm:flex-row justify-center gap-3">
        <button id="openDashboardNow" class="btn-premium text-white font-extrabold rounded-2xl px-6 py-3.5">Abrir dashboard completo</button>
        <button id="keepJourney" class="glass rounded-2xl px-6 py-3.5 font-extrabold text-slate-700">Continuar vendo minha seleção</button>
      </div>
    </div>`);
  $("#openDashboardNow").onclick = openFullDashboard;
  $("#keepJourney").onclick = renderFavoriteTeamJourney;
}

/* ---------- dashboard completo (seções da página principal) ---------- */
function renderFullDashboard(){
  setGuidedVisibility(false);
  const record = activeRecord();
  if(record){ record.dashboardUnlocked = true; persistSims(); }
  renderAll();
}

/* ---------- roteamento ---------- */
function renderApp(){
  if(appState.draftTeam && !TEAMS[appState.draftTeam]) appState.draftTeam = null;
  if(appState.view === "picker-team"){ renderTeamPickerIntro(); return; }
  if(appState.view === "picker-type"){ renderSimulationTypePicker(); return; }
  if(!appState.sims.length){ appState.view = "picker-team"; renderTeamPickerIntro(); return; }
  const record = activeRecord();
  if(!record){ appState.view = "picker-team"; renderTeamPickerIntro(); return; }
  if(appState.view === "dashboard" || record.dashboardUnlocked){ renderFullDashboard(); return; }
  renderFavoriteTeamJourney();
}

export { changeFavoriteTeam, changeSimulationType, commitSimulation, renderApp, renderFavoriteTeamJourney, renderSimulationTypePicker, resetGuidedExperience, startNewSimulation };


/* =================================================================
   DASHBOARD COMPLETO — tabs de simulações, resumo e "Minha Seleção"
   ================================================================= */

import { teamMeta } from "../domain/teams/team-meta.js";
import { getTeamMatches, groupRowForTeam } from "../domain/matches/match-queries.js";
import { profileFor } from "../state/simulation-profiles.js";
import { activeRecord, appState, currentSim, deleteSimulation, setActiveSimulation, simObjFor, timeAgo } from "../state/simulation-store.js";
import { $, UI, cx, el, flag, getFavoriteTeam, ic, matchScheduleLine, paintIcons, renderSimulationTypeBadge, renderSimulationTypeControls, scoreLine, uiConfirm, zebraTeam } from "./render-helpers.js";
import { campaignSummary, progressiveCampaign, statusPill } from "./journey/journey-components.js";
import { changeFavoriteTeam, changeSimulationType, renderFavoriteTeamJourney, resetGuidedExperience, startNewSimulation } from "./journey/journey-screens.js";
import { openMatchSimulator } from "./match/match-simulator.js";
import { renderAll } from "../app/app.js";

// Tabs do hero: uma por simulação salva + botão de nova simulação.
function renderTabs(){
  const wrap = $("#simTabs");
  wrap.innerHTML = "";
  appState.sims.forEach(record => {
    const sim = simObjFor(record), profile = profileFor(record.type);
    const active = record.id === appState.activeId;
    const tab = el("button",
      `sim-tab glass card-hover rounded-2xl px-4 py-3 pr-9 text-left min-w-[210px] flex-1 relative ${active ? 'active' : ''}`,
      `<div class="text-[11px] font-bold uppercase tracking-wider ${active ? 'text-white/80' : 'text-slate-400'} flex items-center gap-1.5">${flag(record.favoriteTeam)} ${record.favoriteTeam} · ${profile.label}</div>
       <div class="font-display font-extrabold text-[15px] ${active ? 'text-white' : 'text-ink'} leading-tight mt-0.5 flex items-center gap-2">${flag(sim.champion)} ${sim.champion} campeão</div>
       <div class="text-[11px] mt-1 ${active ? 'text-white/85' : 'text-slate-500'}">criada ${timeAgo(record.createdAt)}</div>
       <span class="del-tab absolute top-2.5 right-2.5 w-6 h-6 grid place-items-center rounded-full ${active ? 'text-white/70 hover:text-white hover:bg-white/15' : 'text-slate-300 hover:text-usared'}" data-id="${record.id}" role="button" aria-label="Excluir simulação de ${record.favoriteTeam}" title="Excluir">${ic('trash-2','w-3.5 h-3.5')}</span>`);
    if(active) tab.style.background = "linear-gradient(125deg," + profile.color + ",#0b1020)";
    tab.onclick = e => {
      if(e.target.closest('[data-id]')) return;
      setActiveSimulation(record.id);
      renderAll();
    };
    wrap.appendChild(tab);
  });
  const addTab = el("button", "sim-tab glass card-hover rounded-2xl px-4 py-3 text-left min-w-[150px] flex items-center gap-2 font-extrabold text-slate-600", `${ic('plus','w-4 h-4')} Nova simulação`);
  addTab.onclick = startNewSimulation;
  wrap.appendChild(addTab);
  wrap.querySelectorAll(".del-tab").forEach(btn => btn.onclick = e => {
    e.stopPropagation();
    uiConfirm("Excluir esta simulação?", () => {
      deleteSimulation(btn.dataset.id);
      if(!appState.sims.length) startNewSimulation();
      else renderAll();
    });
  });
  paintIcons();
}

/* ---------- cards rápidos do hero ---------- */
function renderHeroCards(){
  const sim = currentSim();
  const zebra = zebraTeam(sim);
  const cards = [
    {icon:"trophy", color:"text-gold-600", label:"Campeão", main:`${flag(sim.champion)} ${sim.champion}`, sub:`Vice: ${flag(sim.runnerUp)} ${sim.runnerUp}`, accent:"from-gold-400/30 to-gold-600/10"},
    {icon:"crosshair", color:"text-usablue", label:"Artilheiro", main:sim.awards.topScorer.player, sub:`${flag(sim.awards.topScorer.team)} ${sim.awards.topScorer.goals} gols`, accent:"from-usablue/15 to-usablue/5"},
    {icon:"zap", color:"text-usared", label:"Grande zebra", main:`${flag(zebra.team)} ${zebra.team}`, sub:zebra.sub, accent:"from-usared/15 to-usared/5"},
  ];
  const wrap = $("#heroCards");
  wrap.innerHTML = "";
  cards.forEach(card => {
    wrap.appendChild(el("div", cx("glass card-hover rounded-3xl p-5 shadow-glass bg-gradient-to-br", card.accent),
      `<div class="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-500">${ic(card.icon, `w-[18px] h-[18px] ${card.color}`)}${card.label}</div>
       <div class="mt-2 flex items-center gap-2 font-display text-xl font-extrabold leading-tight">${card.main}</div>
       <div class="mt-0.5 flex items-center gap-1.5 text-sm text-slate-500">${card.sub}</div>`));
  });
  $("#simMeta").textContent = `Seed ${sim.seed} · variância ${Math.round(sim.chaos * 100)}% · ${sim.tone}`;
}

/* ---------- resumo / prêmios ---------- */
function renderOverview(){
  const sim = currentSim();
  const record = activeRecord();
  $("#ovTone").textContent = record
    ? `${record.favoriteTeam} · Simulação ${profileFor(record.type).label} · ${profileFor(record.type).sub}`
    : "";
  const awards = sim.awards, highlights = sim.highlights;
  const cards = [
    ["medal", "text-slate-400", "Vice-campeão", `${flag(sim.runnerUp)} ${sim.runnerUp}`, "Caiu na final", "border-slate-300"],
    ["award", "text-amber-700", "Terceiro lugar", `${flag(sim.thirdPlace)} ${sim.thirdPlace}`, `4º: ${flag(sim.fourthPlace)} ${sim.fourthPlace}`, "border-amber-700/30"],
    ["star", "text-usablue", "Melhor jogador", `${awards.bestPlayer.player}`, `${flag(awards.bestPlayer.team)} ${awards.bestPlayer.team} · ${awards.bestPlayer.goals} gols`, "border-usablue/30"],
    ["sparkles", "text-mxgreen", "Melhor jovem", `${awards.bestYoung.player}`, `${flag(awards.bestYoung.team)} ${awards.bestYoung.team}`, "border-mxgreen/30"],
    ["hand", "text-slate-500", "Melhor goleiro", `${awards.bestGK ? awards.bestGK.player : '—'}`, `${awards.bestGK ? flag(awards.bestGK.team) + ' ' + awards.bestGK.team + ' · ' + awards.bestGK.conceded + ' sofridos' : ''}`, "border-slate-300"],
    ["heart-crack", "text-slate-400", "Grande decepção", `${flag(highlights.disappointment)} ${highlights.disappointment}`, "Abaixo do esperado", "border-slate-300"],
  ];
  const wrap = $("#overviewGrid");
  wrap.innerHTML = "";
  cards.forEach(([icon, color, label, main, sub, border]) => {
    wrap.appendChild(el("div", `reveal glass card-hover rounded-3xl p-5 shadow-glass border ${border}`,
      `<div class="flex items-center gap-2 text-slate-500 text-[11px] font-bold uppercase tracking-wider">${ic(icon, `w-4 h-4 ${color}`)}${label}</div>
       <div class="font-display font-extrabold text-lg mt-2 leading-tight flex items-center gap-2">${main}</div>
       <div class="text-[13px] text-slate-500 mt-0.5 flex items-center gap-1.5 flex-wrap">${sub}</div>`));
  });

  // jogo mais emocionante
  const best = highlights.bestMatch;
  wrap.appendChild(el("div", "reveal glass card-hover rounded-3xl p-5 shadow-glass border border-usablue/30 sm:col-span-2 lg:col-span-3 bg-gradient-to-br from-usablue/5 to-usared/5",
    `<div class="flex items-center gap-2 text-slate-500 text-[11px] font-bold uppercase tracking-wider">${ic('flame','w-4 h-4 text-usared')}Jogo mais emocionante · ${best.stage}</div>
     <div class="font-display font-extrabold text-xl mt-2 flex items-center gap-2 flex-wrap">${flag(best.home)} ${best.home} <span class="px-2">${scoreLine(best)}</span> ${best.away} ${flag(best.away)}</div>
     <div class="text-sm text-slate-500 mt-1">${matchScheduleLine(best)} · ${best.ga + best.gb} gols${best.pens ? ' · decidido nos pênaltis' : best.aet ? ' · na prorrogação' : ''}</div>`));

  // banner da final / pódio
  const final = sim.knockout.final;
  $("#podium").innerHTML =
    `<div class="reveal glass champ-glow rounded-3xl p-6 sm:p-8 shadow-lift overflow-hidden relative bg-gradient-to-br from-gold-400/15 via-white/40 to-gold-500/10">
       <div class="absolute -right-8 -top-8 opacity-[0.07] select-none">${ic('trophy','w-40 h-40 text-gold-600')}</div>
       <div class="text-xs font-bold uppercase tracking-[.2em] text-gold-600">A Grande Final · ${final.kickoff || final.city}</div>
       <div class="mt-3 flex flex-wrap items-center gap-x-6 gap-y-3">
         <div class="text-3xl sm:text-5xl font-display font-extrabold flex items-center gap-3">${flag(final.home,'flag-lg')} ${final.home}</div>
         <div class="trophy-shine text-3xl sm:text-5xl font-display font-extrabold tnum">${scoreLine(final)}</div>
         <div class="text-3xl sm:text-5xl font-display font-extrabold flex items-center gap-3">${final.away} ${flag(final.away,'flag-lg')}</div>
       </div>
       <div class="mt-4 text-lg font-bold flex items-center gap-2">${ic('trophy','w-5 h-5 text-gold-600')} Campeão: <span class="gold-text flex items-center gap-2">${flag(sim.champion)} ${sim.champion}</span></div>
       ${final.goals.length ? `<div class="mt-3 flex flex-wrap gap-2">${final.goals.map(g => `<span class="text-xs font-semibold glass px-2.5 py-1 rounded-full inline-flex items-center gap-1.5">${g.minute}' ${g.player} ${flag(g.team)}</span>`).join("")}</div>` : ''}
     </div>`;
}

/* ---------- seção "Minha Seleção" ---------- */
function renderFavoriteTeamDashboard(){
  renderSimulationTypeControls("myTeamTypeControls", true);
  const wrap = $("#myTeamWrap");
  const team = getFavoriteTeam();
  if(!team){
    wrap.innerHTML = `<div class="glass rounded-3xl p-6 shadow-glass">
      <div class="font-display font-extrabold text-2xl">Nenhuma seleção favorita escolhida</div>
      <p class="text-slate-500 mt-2">Inicie a experiência guiada para destacar uma seleção dentro do dashboard.</p>
      <button id="dashPickTeam" class="mt-4 btn-premium text-white font-bold px-5 py-3 rounded-2xl">Escolher seleção</button>
    </div>`;
    if($("#dashPickTeam")) $("#dashPickTeam").onclick = resetGuidedExperience;
    return;
  }
  const sim = currentSim();
  const type = sim.simulationType || activeRecord()?.type || "realistic";
  const summary = campaignSummary(sim, team);
  const row = groupRowForTeam(sim, team);
  const meta = teamMeta[team];
  wrap.innerHTML = `
    <div class="grid xl:grid-cols-[.92fr_1.08fr] gap-5">
      <div class="reveal glass rounded-[2rem] p-6 shadow-glass ${summary.status === "champion" ? 'confetti-soft' : ''}">
        <div class="flex items-start justify-between gap-4">
          <div class="flex items-center gap-4">
            ${flag(team, 'flag-xl')}
            <div>
              <div class="${UI.label11}">Minha Seleção</div>
              <h3 class="font-display font-extrabold text-3xl">${team}</h3>
              <div class="mt-1 flex flex-wrap gap-2 items-center">${renderSimulationTypeBadge(type)} ${statusPill(meta.status)}</div>
            </div>
          </div>
        </div>
        <div class="mt-6 rounded-3xl p-5 ${summary.status === "champion" ? 'bg-gold-500/15 border border-gold-400/40' : summary.status === "eliminated" ? 'bg-usared/10 border border-usared/20' : 'bg-mxgreen/10 border border-mxgreen/20'}">
          <div class="font-display font-extrabold text-xl">${summary.title}</div>
          <p class="mt-2 text-slate-600 leading-relaxed">${summary.text}</p>
        </div>
        <div class="mt-5 grid sm:grid-cols-3 gap-3">
          <div class="rounded-2xl bg-white/60 p-4">
            <div class="text-[10px] uppercase tracking-widest font-extrabold text-slate-400">Grupo</div>
            <div class="font-extrabold mt-1">${row ? `${row.pos}º no Grupo ${row.group}` : "-"}</div>
          </div>
          <div class="rounded-2xl bg-white/60 p-4">
            <div class="text-[10px] uppercase tracking-widest font-extrabold text-slate-400">Campanha</div>
            <div class="font-extrabold mt-1">${row ? `${row.P} pts · SG ${row.SG > 0 ? "+" : ""}${row.SG}` : "-"}</div>
          </div>
          <div class="rounded-2xl bg-white/60 p-4">
            <div class="text-[10px] uppercase tracking-widest font-extrabold text-slate-400">Força</div>
            <div class="font-extrabold mt-1">${meta.strength} · ${meta.confederation}</div>
          </div>
        </div>
        <div class="mt-5 flex flex-wrap gap-2">
          <button id="dashChangeTeam" class="glass rounded-2xl px-4 py-2.5 font-bold text-slate-700">Trocar seleção</button>
          <button id="dashChangeType" class="glass rounded-2xl px-4 py-2.5 font-bold text-slate-700">Escolher outro tipo</button>
          <button id="dashResetGuided" class="glass rounded-2xl px-4 py-2.5 font-bold text-usared">Reiniciar experiência guiada</button>
        </div>
      </div>
      <div class="reveal glass rounded-[2rem] p-4 sm:p-5 shadow-glass">
        <div class="flex flex-wrap items-center justify-between gap-3 mb-4">
          <div>
            <div class="${UI.label11}">Jornada</div>
            <div class="font-display font-extrabold text-2xl">Partidas de ${team}</div>
          </div>
          <button id="dashStartJourney" class="btn-premium text-white font-bold px-4 py-2.5 rounded-2xl">Voltar à jornada</button>
        </div>
        <div class="journey-scroll-list max-h-[620px] pr-1">
          ${progressiveCampaign(activeRecord())}
          <div class="scroll-affordance">Mais partidas abaixo</div>
        </div>
      </div>
    </div>`;
  document.querySelectorAll("#myTeamWrap .replay-btn").forEach(btn => btn.onclick = () => {
    const matches = getTeamMatches(currentSim(), team);
    const i = Number(btn.dataset.idx);
    if(matches[i]) openMatchSimulator(matches[i], i);
  });
  $("#dashChangeTeam").onclick = changeFavoriteTeam;
  $("#dashChangeType").onclick = changeSimulationType;
  $("#dashResetGuided").onclick = resetGuidedExperience;
  $("#dashStartJourney").onclick = () => { appState.view = "journey"; renderFavoriteTeamJourney(); };
}

export { renderFavoriteTeamDashboard, renderHeroCards, renderOverview, renderTabs };

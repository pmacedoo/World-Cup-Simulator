
/* =================================================================
   SNAPSHOTS "SITUAÇÃO DA COPA NESTE MOMENTO"
   -----------------------------------------------------------------
   Modal que mostra grupos parciais ou o chaveamento no estado do dia,
   sem revelar resultados que o usuário ainda não viveu na jornada.
   ================================================================= */

import { KO_ORDER, favoriteFrontierKO, isGroupStage } from "../../domain/matches/match-queries.js";
import { partialStandings } from "../../domain/standings/partial-standings.js";
import { activeRecord } from "../../state/simulation-store.js";
import { $, el, paintIcons } from "../render-helpers.js";
import { canRevealMatchTeams, journeyVisibleContext } from "./journey-context.js";
import { compactGroupCard } from "./journey-components.js";
import { buildBracketHTML } from "../bracket.js";

function showSnapshotModal(title, body){
  let modal = $("#snapshotModal");
  if(!modal){
    modal = el("div", "fixed inset-0 z-[75] hidden items-center justify-center p-3 sm:p-5");
    modal.id = "snapshotModal";
    modal.innerHTML = `<div class="absolute inset-0 bg-ink/55 backdrop-blur-xl" data-close></div>
      <div id="snapshotBox" class="relative guided-card rounded-[2rem] shadow-lift w-full max-w-5xl max-h-[92vh] overflow-y-auto p-5 sm:p-7 swap" role="dialog" aria-modal="true" aria-label="Situação da Copa"></div>`;
    document.body.appendChild(modal);
    modal.addEventListener("click", e => { if(e.target.dataset.close !== undefined) closeSnapshotModal(); });
  }
  $("#snapshotBox").innerHTML = `
    <button class="absolute top-4 right-4 text-slate-400 hover:text-ink" data-close aria-label="Fechar">✕</button>
    <div class="text-[11px] uppercase tracking-widest font-extrabold text-slate-400">Situação da Copa</div>
    <h3 class="font-display font-extrabold text-2xl mb-4">${title}</h3>
    ${body}`;
  $("#snapshotBox").querySelector("[data-close]").onclick = closeSnapshotModal;
  modal.classList.remove("hidden");
  modal.classList.add("flex");
  paintIcons();
}

function closeSnapshotModal(){
  const modal = $("#snapshotModal");
  if(modal){ modal.classList.add("hidden"); modal.classList.remove("flex"); }
}

// Snapshot do estado ATUAL do dia da jornada (botões "Grupos agora" /
// "Chaveamento agora"). kind: "groups" | "bracket".
function openDaySnapshot(kind){
  const record = activeRecord();
  if(!record) return;
  const ctx = journeyVisibleContext(record);
  const {sim, team, matches, revealed, currentRound, observerMode, watchedMatches, nextMatch, nextWatchMatch} = ctx;
  let title = "", body = "";
  const livedNos = new Set([
    ...matches.slice(0, revealed).map(m => m.matchNo).filter(Boolean),
    ...watchedMatches.map(m => m.matchNo).filter(Boolean),
    ...(activeRecord()?.watchedMatchNos || []),
  ]);

  if(kind === "groups"){
    const uptoRound = Math.max(currentRound, 0);
    const groups = ctx.allPartialGroups || partialStandings(sim, uptoRound, m => livedNos.has(m.matchNo));
    title = uptoRound ? `Grupos no estado do dia · Rodada ${uptoRound}` : "Grupos antes da estreia";
    body = `<p class="text-sm text-slate-500 mb-3">Mostra apenas o estado já vivido na jornada, sem antecipar o próximo jogo da sua seleção.</p>
      <div class="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">${groups.map(g => compactGroupCard(g, team)).join("")}</div>`;
  } else {
    // chave: rodadas vividas = placar; rodada atual = só confronto; futuras = "A definir"
    const targetMatch = observerMode ? nextWatchMatch : nextMatch;
    const nextKO = targetMatch && !isGroupStage(targetMatch);
    const frontier = nextKO ? (KO_ORDER[targetMatch.stage] || 1) : favoriteFrontierKO(matches, revealed);
    if(!frontier){
      title = "Chaveamento do dia";
      body = `<div class="glass rounded-2xl p-8 text-center text-slate-500 font-semibold">O mata-mata ainda não começou no estado atual da jornada. Quando a Copa chegar lá, este painel mostra a chave sem entregar resultados futuros.</div>`;
    } else {
      const modeFn = m => {
        if(livedNos.has(m.matchNo)) return 'full';
        if(canRevealMatchTeams(ctx, m)) return 'teams';
        return 'locked';
      };
      title = "Chaveamento no estado do dia";
      body = `<p class="text-sm text-slate-500 mb-3">Rodadas já vividas aparecem com placar; o momento atual mostra confrontos sem resultado; fases futuras ficam como <b>“A definir”</b>.</p>${buildBracketHTML(sim, null, modeFn)}`;
    }
  }
  showSnapshotModal(title, body);
}

export { closeSnapshotModal, openDaySnapshot };

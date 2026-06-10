
/* =================================================================
   CHAVEAMENTO DO MATA-MATA (bracket em colunas espelhadas)
   -----------------------------------------------------------------
   Renderiza a árvore de 32 em dois lados + final ao centro. Cada
   card aceita três modos de revelação (usados pelos snapshots da
   jornada para não dar spoiler):
     'full'   -> seleções + placar
     'teams'  -> confronto conhecido, placar oculto
     'locked' -> "A definir"
   ================================================================= */

import { currentSim } from "../state/simulation-store.js";
import { $, el, flag, ic, matchScheduleLine, paintIcons, scoreLine } from "./render-helpers.js";
import { goalChips, renderRankingProtection } from "./tournament-sections.js";

// rótulo de origem do slot nos 16-avos: 1A / 2B / 3C...
function slotLabel(slot){
  if(!slot || !slot.group) return "";
  if(slot.tier === 0) return `1${slot.group}`;
  if(slot.tier === 1) return `2${slot.group}`;
  if(slot.tier === 2) return `3${slot.group}`;
  return slot.group;
}

// linha de uma seleção dentro de um card (goals=null oculta o placar)
function bracketTeamRow(match, team, goals, pens, seed, isWinner){
  return `<div class="bracket-team ${isWinner ? 'bracket-winner' : ''}">
    ${seed ? `<span class="br-seed">${seed}</span>` : ''}
    ${flag(team)}
    <span class="bracket-team-name">${team}</span>
    ${goals != null ? `<span class="bracket-score">${goals}${pens != null ? `<span class="pk">(${pens})</span>` : ''}</span>` : ''}
  </div>`;
}

// linha "vaga em aberto" — não revela quem vai jogar
function bracketSlotRow(seed, label){
  return `<div class="bracket-team">
    ${seed ? `<span class="br-seed">${seed}</span>` : ''}
    <span class="flag-img bracket-flag-empty"></span>
    <span class="bracket-team-name italic text-slate-400">${label}</span>
  </div>`;
}

function bracketMatchCard(match, champ, mode = 'full'){
  const isR32 = match.stage === "16-avos" || match.stage === "Fase de 32";
  const homeSeed = isR32 ? slotLabel(match.A) : "";
  const awaySeed = isR32 ? slotLabel(match.B) : "";
  if(mode === 'locked'){
    return `<div class="bracket-match bracket-locked">
      <div class="bracket-match-head"><span>${match.matchNo ? `M${match.matchNo}` : ''}</span><span>${ic('lock','w-3 h-3')}</span></div>
      ${bracketSlotRow(homeSeed, "A definir")}
      ${bracketSlotRow(awaySeed, "A definir")}
    </div>`;
  }
  if(mode === 'teams'){
    return `<div class="bracket-match bracket-pending">
      <div class="bracket-match-head"><span>${match.matchNo ? `M${match.matchNo}` : ''}</span><span class="text-usablue">a jogar</span></div>
      ${bracketTeamRow(match, match.home, null, null, homeSeed, false)}
      ${bracketTeamRow(match, match.away, null, null, awaySeed, false)}
    </div>`;
  }
  const isChamp = champ && match.stage === "Final" && match.winner.team === champ;
  const extra = match.penalties ? "pênaltis" : (match.aet ? "prorrog." : "");
  return `<div class="bracket-match ${isChamp ? 'bracket-champion champ-glow' : ''}" data-match-no="${match.matchNo}">
    <div class="bracket-match-head"><span>${match.matchNo ? `M${match.matchNo}` : ''}</span><span>${extra}</span></div>
    ${bracketTeamRow(match, match.home, match.ga, match.pens?.[0], homeSeed, match.winner.team === match.home)}
    ${bracketTeamRow(match, match.away, match.gb, match.pens?.[1], awaySeed, match.winner.team === match.away)}
  </div>`;
}

// Layout oficial da chave: ids dos jogos por coluna, lado esquerdo/direito.
const BRACKET_LEFT_COLUMNS = [
  ["16-avos", [74, 77, 73, 75, 83, 84, 81, 82], "r32"],
  ["Oitavas", [89, 90, 93, 94], "r16"],
  ["Quartas", [97, 98], "qf"],
  ["Semifinal", [101], "sf"],
];
const BRACKET_RIGHT_COLUMNS = [
  ["Semifinal", [102], "sf"],
  ["Quartas", [99, 100], "qf"],
  ["Oitavas", [91, 92, 95, 96], "r16"],
  ["16-avos", [76, 78, 79, 80, 86, 88, 85, 87], "r32"],
];

// Monta o chaveamento completo. modeFn(match) -> 'full' | 'teams' | 'locked'.
function buildBracketHTML(sim, champ, modeFn = () => 'full'){
  const k = sim.knockout;
  const byId = Object.fromEntries(
    [...k.R32, ...k.R16, ...k.QF, ...k.SF, k.final].map(m => [m.matchNo, m])
  );
  const stack = ([title, ids, cls]) => `<div class="bracket-stack ${cls}">
    <div class="bracket-round-title">${title}</div>
    <div class="bracket-stack-matches">${ids.map(id => bracketMatchCard(byId[id], champ, modeFn(byId[id]))).join("")}</div>
  </div>`;
  const finalMode = modeFn(k.final);
  const champKnown = champ && finalMode === "full";
  return `<div class="scroll-x-affordance">Role lateralmente para ver todas as fases</div><div class="bracket-scroll"><div class="bracket-stage">
    <div class="bracket-side bracket-left">
      ${BRACKET_LEFT_COLUMNS.map(stack).join("")}
    </div>
    <div class="bracket-center">
      <div class="bracket-final-node">
        <div class="bracket-round-title text-gold-600">Final</div>
        ${bracketMatchCard(k.final, champ, finalMode)}
        ${champKnown ? `<div class="bracket-champ-banner">
          <div class="text-[10px] uppercase tracking-widest font-extrabold text-gold-600 flex items-center justify-center gap-1.5">${ic('trophy','w-3.5 h-3.5')} Campeão</div>
          <div class="font-display font-extrabold text-base mt-1 flex items-center justify-center gap-2">${flag(champ)} ${champ}</div>
        </div>` : ''}
      </div>
    </div>
    <div class="bracket-side bracket-right">
      ${BRACKET_RIGHT_COLUMNS.map(stack).join("")}
    </div>
  </div></div>`;
}

// Seção "Mata-mata" do dashboard completo (sempre revelada).
function renderBracket(){
  const sim = currentSim(), k = sim.knockout, champ = sim.champion;
  renderRankingProtection();
  $("#bracket").innerHTML = buildBracketHTML(sim, champ, () => 'full');

  // 3º lugar + ficha da final
  $("#thirdFinalWrap").innerHTML =
    knockoutDetailCard(`${ic('award','w-4 h-4 text-amber-700')} Disputa de 3º lugar`, k.third) +
    knockoutDetailCard(`${ic('trophy','w-4 h-4 text-gold-600')} Final`, k.final);

  // clique nas partidas abre o modal com gols/resumo
  const allKnockout = [...k.R32, ...k.R16, ...k.QF, ...k.SF, k.third, k.final];
  document.querySelectorAll("#bracket .bracket-match[data-match-no]").forEach(card => {
    card.onclick = () => {
      const match = allKnockout.find(m => String(m.matchNo) === card.dataset.matchNo);
      if(match) openMatchModal(match);
    };
  });
  paintIcons();
}

function knockoutDetailCard(title, match){
  return `<div class="glass card-hover rounded-3xl p-5 shadow-glass">
    <div class="text-[11px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">${title} · ${match.kickoff || match.city}</div>
    <div class="flex items-center justify-center gap-3 sm:gap-5 mt-3">
      <div class="flex-1 min-w-0 text-right font-display font-extrabold text-lg flex items-center justify-end gap-2 ${match.winner.team === match.home ? '' : 'text-slate-400'}"><span class="truncate">${match.home}</span> ${flag(match.home)}</div>
      <div class="px-3 py-1 rounded-xl bg-ink text-white font-extrabold tnum text-lg">${scoreLine(match)}</div>
      <div class="flex-1 min-w-0 text-left font-display font-extrabold text-lg flex items-center gap-2 ${match.winner.team === match.away ? '' : 'text-slate-400'}">${flag(match.away)} <span class="truncate">${match.away}</span></div>
    </div>
    ${goalChips(match)}
    <div class="mt-3 text-sm text-slate-500 flex items-center gap-1.5 flex-wrap"><b class="text-slate-700">Destaque:</b> ${match.goals.length ? match.goals.slice().sort((a, b) => b.minute - a.minute)[0].player : 'defesas decisivas'} · <b class="text-slate-700">Vencedor:</b> ${flag(match.winner.team)} ${match.winner.team}</div>
  </div>`;
}

/* ---------- modal de detalhes de uma partida ---------- */
function openMatchModal(match){
  let modal = $("#matchModal");
  if(!modal){
    modal = el("div", "fixed inset-0 z-[70] hidden items-center justify-center p-4");
    modal.id = "matchModal";
    modal.innerHTML = `<div class="absolute inset-0 bg-ink/40 backdrop-blur-sm" data-close></div>
      <div id="modalBox" class="relative glass rounded-3xl shadow-lift max-w-lg w-full p-6 swap" role="dialog" aria-modal="true" aria-label="Detalhes da partida"></div>`;
    document.body.appendChild(modal);
    modal.addEventListener("click", e => { if(e.target.dataset.close !== undefined) closeModal(); });
  }
  $("#modalBox").innerHTML = `
    <button class="absolute top-4 right-4 text-slate-400 hover:text-ink" data-close aria-label="Fechar">✕</button>
    <div class="text-[11px] font-bold uppercase tracking-wider text-slate-400">${match.stage}</div>
    <div class="flex items-center justify-center gap-4 mt-3">
      <div class="flex-1 min-w-0 text-right font-display font-extrabold text-xl truncate ${match.winner && match.winner.team === match.home ? '' : 'text-slate-400'}">${match.home} ${flag(match.home)}</div>
      <div class="px-3 py-1.5 rounded-xl bg-ink text-white font-extrabold tnum text-xl">${scoreLine(match)}</div>
      <div class="flex-1 min-w-0 text-left font-display font-extrabold text-xl truncate ${match.winner && match.winner.team === match.away ? '' : 'text-slate-400'}">${flag(match.away)} ${match.away}</div>
    </div>
    <div class="text-center text-xs text-slate-400 mt-2">${matchScheduleLine(match)}</div>
    ${goalChips(match)}`;
  $("#modalBox").querySelector("[data-close]").onclick = closeModal;
  modal.classList.remove("hidden");
  modal.classList.add("flex");
}

function closeModal(){
  const modal = $("#matchModal");
  if(modal){ modal.classList.add("hidden"); modal.classList.remove("flex"); }
}

export { buildBracketHTML, closeModal, renderBracket };

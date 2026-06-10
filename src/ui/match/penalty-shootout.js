
/* =================================================================
   DISPUTA DE PÊNALTIS ANIMADA
   -----------------------------------------------------------------
   Reproduz a disputa cobrança a cobrança sobre a imagem do gol.
   Ajuste o ritmo nas 3 constantes abaixo — o tempo total por
   cobrança é PK_PREP_MS + PK_SHOT_MS + PK_RESULT_MS.
   Todos os timeouts ficam em appState.penaltyTimers e são limpos
   por stopShootout (chamado ao pular, fechar ou re-simular).
   ================================================================= */

import { TEAMS } from "../../data/worldcup-data.js";
import { clamp } from "../../engine/random.js";
import { activeRecord, appState } from "../../state/simulation-store.js";
import { $, flag, getFavoriteTeam, ic, paintIcons } from "../render-helpers.js";
import { celebrateConfetti, markSimulatedMatchComplete } from "./match-simulator.js";
const PK_PREP_MS = 1700;     // "Fulano se prepara para a cobrança…"
const PK_SHOT_MS = 800;      // animação do chute entrando no gol
const PK_RESULT_MS = 1450;   // exibe o resultado antes da próxima cobrança

// posição (% dentro do mini-gol) de cada zona de chute
const PK_ZONE_XY = {
  "top-left":[27,42], "top-center":[50,40], "top-right":[73,42],
  "bottom-left":[28,63], "bottom-center":[50,64], "bottom-right":[72,63],
};
// pequenos desvios para cobranças repetidas na mesma zona não se sobreporem
const PK_ZONE_OFFSETS = [
  [-3,-2],[2,-3],[4,1],[-2,3],[1,2],[-4,0],
  [3,3],[-1,-4],[0,4],[5,-2],[-5,2],[2,0],
];
const PK_ZONE_LABELS = {
  "top-left":"alto esquerdo",
  "top-center":"alto centro",
  "top-right":"alto direito",
  "bottom-left":"baixo esquerdo",
  "bottom-center":"baixo centro",
  "bottom-right":"baixo direito",
};

// Posição visual do chute: erros são deslocados para fora/trave/defesa.
function penaltyShotPosition(kick, index){
  const base = PK_ZONE_XY[kick.shotZone] || [50, 50];
  const offset = PK_ZONE_OFFSETS[index % PK_ZONE_OFFSETS.length];
  let x = base[0] + offset[0];
  let y = base[1] + offset[1];
  if(kick.result === "Para fora"){
    const side = x < 50 ? -1 : 1;
    x = x + side * (18 + (index % 3) * 4);
    y = y + (kick.shotZone?.startsWith("top") ? -12 : 12);
  } else if(kick.result === "Na trave"){
    x = x < 40 ? 19 : x > 60 ? 81 : x;
    y = kick.shotZone?.startsWith("top") ? 31 : 73;
  } else if(kick.result === "Defendido"){
    x = base[0] + offset[0] * 0.6;
    y = base[1] + offset[1] * 0.6;
  }
  return [clamp(x, -10, 110), clamp(y, 18, 88)];
}

function stopShootout(){
  (appState.penaltyTimers || []).forEach(t => clearTimeout(t));
  appState.penaltyTimers = [];
}

// Reordena os cobradores da favorita conforme o XI/tática do usuário:
// cobrador designado primeiro, depois FW > MF > DF por peso técnico.
function applyFavoriteKickTakers(shootout, match){
  const fav = getFavoriteTeam(), record = activeRecord(), item = appState.currentSimulatedMatch;
  if(!fav || !record || !item || (match.home !== fav && match.away !== fav)) return shootout;
  const tactic = (record.tactics && record.tactics[item.journeyIndex]) || null;
  const lineup = (tactic?.starters || []);
  if(!lineup.length) return shootout;

  const squad = TEAMS[fav]?.sq || [];
  const posOf = name => squad.find(p => p[0] === name)?.[1] || "MF";
  const ovrOf = name => squad.find(p => p[0] === name)?.[2] || 70;
  const posOrder = {FW:0, MF:1, DF:2, GK:9};
  const designated = tactic?.penaltyTaker || "";
  const takers = lineup.filter(n => posOf(n) !== "GK")
    .sort((a, b) => {
      if(a === designated) return -1;
      if(b === designated) return 1;
      return (posOrder[posOf(a)] || 0) - (posOrder[posOf(b)] || 0) || ovrOf(b) - ovrOf(a);
    });
  if(!takers.length) return shootout;

  let kickIndex = 0;
  return {...shootout, kicks: shootout.kicks.map(kick => {
    if(kick.team !== fav) return kick;
    const player = takers[kickIndex++ % takers.length] || kick.player;
    return {...kick, player};
  })};
}

function startShootout(match){
  stopShootout();
  let shootout = match.penalties;
  if(!shootout) return;
  shootout = applyFavoriteKickTakers(shootout, match);

  const mount = $("#pkMount");
  if(!mount) return;
  const infoGrid = $("#simInfoGrid");
  if(infoGrid) infoGrid.classList.add("hidden");
  const home = match.home, away = match.away;
  const fav = getFavoriteTeam();

  mount.innerHTML = `
    <div class="pk-wrap">
      <div class="text-[11px] uppercase tracking-widest font-extrabold text-slate-400 mb-3 flex items-center gap-2">${ic('target','w-4 h-4 text-usared')} Disputa de pênaltis</div>
      <div class="pk-scoreline">
        <div id="pkSideHome" class="pk-side text-right">
          <div class="flex items-center justify-end gap-2 font-display font-extrabold">${home} ${flag(home)}</div>
          <div id="pkDotsHome" class="pk-dots justify-end"></div>
        </div>
        <div class="pk-bigscore font-display text-3xl sm:text-4xl"><span id="pkScoreH">0</span> <span class="text-slate-300">x</span> <span id="pkScoreA">0</span></div>
        <div id="pkSideAway" class="pk-side text-left">
          <div class="flex items-center gap-2 font-display font-extrabold">${flag(away)} ${away}</div>
          <div id="pkDotsAway" class="pk-dots"></div>
        </div>
      </div>
      <div id="pkFeaturedEvent" class="pk-featured-event mt-4">Preparando a disputa…</div>
      <div class="mt-4">
        <div class="pk-goal" aria-label="Mapa do gol">
          <div class="pk-goal-zone zone-tl"></div>
          <div class="pk-goal-zone zone-tc"></div>
          <div class="pk-goal-zone zone-tr"></div>
          <div class="pk-goal-zone zone-bl"></div>
          <div class="pk-goal-zone zone-bc"></div>
          <div class="pk-goal-zone zone-br"></div>
          <div class="pk-goal-mouth" id="pkGoalShots"></div>
        </div>
        <div class="mt-3 text-center">
          <div id="pkKicker" class="pk-kicker text-slate-600 min-h-[28px]">Preparando a disputa…</div>
          <div id="pkResult" class="mt-2 min-h-[30px]"></div>
          <div id="pkRound" class="mt-1 text-[11px] uppercase tracking-widest font-extrabold text-slate-400"></div>
        </div>
      </div>
    </div>`;
  paintIcons();

  const homeKicks = shootout.kicks.filter(k => k.team === home);
  const awayKicks = shootout.kicks.filter(k => k.team === away);
  const dotsHome = $("#pkDotsHome"), dotsAway = $("#pkDotsAway");
  for(let i = 0; i < Math.max(5, homeKicks.length); i++) dotsHome.insertAdjacentHTML("beforeend", `<span class="pk-dot" data-h="${i}"></span>`);
  for(let i = 0; i < Math.max(5, awayKicks.length); i++) dotsAway.insertAdjacentHTML("beforeend", `<span class="pk-dot" data-a="${i}"></span>`);
  const goalShots = $("#pkGoalShots");

  let homeUsed = 0, awayUsed = 0, homeScore = 0, awayScore = 0;
  const wait = ms => new Promise(resolve => {
    const t = setTimeout(resolve, ms);
    appState.penaltyTimers.push(t);
  });

  (async () => {
    for(let i = 0; i < shootout.kicks.length; i++){
      const kick = shootout.kicks[i], isHome = kick.team === home;
      $("#pkSideHome").classList.toggle("active", isHome);
      $("#pkSideAway").classList.toggle("active", !isHome);
      $("#pkRound").innerHTML = `${i >= 10 ? 'Cobranças alternadas · ' : ''}Cobrança ${i + 1}`;
      $("#pkKicker").className = "pk-kicker prep text-slate-700";
      $("#pkKicker").innerHTML = `${flag(kick.team)} <b>${kick.player}</b> se prepara para a cobrança…${kick.decisive ? ` <span class="text-gold-600 font-extrabold">· decisiva</span>` : ''}`;
      $("#pkFeaturedEvent").innerHTML = `${flag(kick.team)} <b>${kick.player}</b> na bola por ${kick.team}`;
      $("#pkFeaturedEvent").className = "pk-featured-event mt-4 prep";
      $("#pkResult").innerHTML = "";
      await wait(PK_PREP_MS);

      const [zx, zy] = penaltyShotPosition(kick, i);
      goalShots.innerHTML = "";
      const shot = document.createElement("div");
      shot.className = `pk-shot ${kick.scored ? 'goal' : 'miss'} ${kick.result === "Para fora" ? 'wide' : ''}`;
      shot.style.left = zx + "%";
      shot.style.top = zy + "%";
      shot.textContent = kick.scored ? "●" : "✕";
      goalShots.appendChild(shot);
      requestAnimationFrame(() => shot.classList.add("show"));
      $("#pkKicker").className = "pk-kicker text-slate-500";
      await wait(PK_SHOT_MS);

      if(kick.scored){ if(isHome) homeScore++; else awayScore++; }
      $("#pkScoreH").textContent = homeScore;
      $("#pkScoreA").textContent = awayScore;
      const dot = mount.querySelector(isHome ? `[data-h="${homeUsed}"]` : `[data-a="${awayUsed}"]`);
      if(dot) dot.classList.add(kick.scored ? "goal" : "miss");
      if(isHome) homeUsed++; else awayUsed++;
      $("#pkResult").innerHTML = `<span class="pk-result-badge ${kick.scored ? 'goal' : 'miss'}">${ic(kick.scored ? 'check' : 'x', 'w-4 h-4')} ${kick.result}</span><div class="mt-1 text-xs font-bold text-slate-400">Chute no ${PK_ZONE_LABELS[kick.shotZone] || "centro do gol"}</div>`;
      $("#pkFeaturedEvent").innerHTML = `${flag(kick.team)} <b>${kick.player}</b>: <span class="${kick.scored ? 'text-mxgreen' : 'text-usared'}">${kick.result}</span>`;
      $("#pkFeaturedEvent").className = `pk-featured-event mt-4 ${kick.scored ? 'goal' : 'miss'}`;
      paintIcons();
      await wait(PK_RESULT_MS);
    }

    $("#pkSideHome").classList.remove("active");
    $("#pkSideAway").classList.remove("active");
    const winner = shootout.winner;
    $("#pkKicker").className = "pk-kicker text-slate-800";
    $("#pkKicker").innerHTML = `${flag(winner)} <b>${winner}</b> vence a disputa por ${shootout.homeScore} x ${shootout.awayScore}!`;
    $("#pkFeaturedEvent").innerHTML = `${flag(winner)} <b>${winner}</b> vence a disputa por ${shootout.homeScore} x ${shootout.awayScore}`;
    $("#pkFeaturedEvent").className = "pk-featured-event mt-4 goal";
    $("#pkRound").textContent = "Fim da disputa";
    const box = $("#matchSimulatorBox");
    if(box && winner === match.winner?.team) box.classList.add("pk-decisive");
    const summary = $("#simSummary");
    const favPlayed = home === fav || away === fav, favWon = favPlayed && winner === fav;
    if(summary) summary.innerHTML = `${flag(winner)} <b>${winner}</b> avança nos pênaltis por <b>${shootout.homeScore} x ${shootout.awayScore}</b> (no tempo normal, ${match.ga}–${match.gb}). ${favPlayed ? (favWon ? 'Sua seleção sobreviveu ao drama das cobranças!' : 'Sua seleção caiu na loteria dos pênaltis.') : ''}`;
    markSimulatedMatchComplete(match);
    if(favWon) celebrateConfetti();
  })();
}

export { startShootout, stopShootout };

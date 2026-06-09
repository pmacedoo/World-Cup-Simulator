"use strict";

function normalizeGoalMinute(minute, match=null){
  if(typeof minute==="string"){
    const clean=minute.replace("'","");
    if(clean.includes("+")){
      const [base,add]=clean.split("+").map(Number);
      return {value:base+add, display:`${base}+${add}'`};
    }
    const n=Number(clean);
    return {value:n, display:`${n}'`};
  }
  const n=Number(minute)||0;
  if(!match?.aet && n>90) return {value:n, display:`90+${n-90}'`};
  if(!match?.aet && n>45 && n<50) return {value:n, display:`45+${n-45}'`};
  return {value:n, display:`${n}'`};
}
function matchPhaseLabel(minute, match){
  if(match.aet && minute>105) return "Prorrogação · 2º tempo";
  if(match.aet && minute>90) return "Prorrogação";
  if(minute>=46) return "2º tempo";
  if(minute>=45) return "Intervalo";
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
  if(round==="3") return {label, cls:"stage-group-3"};
  if(round==="2") return {label, cls:"stage-group-2"};
  return {label, cls:"stage-group-1"};
}
function compactPlayerName(name){
  const parts = String(name || "").trim().split(/\s+/).filter(Boolean);
  if(parts.length <= 1) return name;
  const rest = parts.slice(1).join(" ").replace(/\bJr\b\.?/i, "Junior");
  return `${parts[0][0]}. ${rest}`;
}
function openMatchSimulator(match, journeyIndex=0){
  closeModal();
  appState.currentSimulatedMatch={match, journeyIndex, minute:0, finished:false};
  let modal=$("#matchSimulator");
  if(!modal){
    modal=el("div","fixed inset-0 z-[80] hidden items-center justify-center p-3 sm:p-5");
    modal.id="matchSimulator";
    modal.innerHTML=`<div class="absolute inset-0 bg-ink/55 backdrop-blur-xl" data-close></div>
      <div id="matchSimulatorBox" class="relative guided-card rounded-[2rem] shadow-lift w-full max-w-5xl max-h-[94vh] overflow-y-auto p-4 sm:p-6 swap"></div>`;
    document.body.appendChild(modal);
    modal.addEventListener("click",e=>{ if(e.target.dataset.close!==undefined) closeMatchSimulator(); });
  }
  const type=currentSim()?.simulationType || activeRecord()?.type || "realistic";
  const profile=profileFor(type);
  const fav=getFavoriteTeam();
  const nextMatch=getTeamMatches(currentSim(),fav)[journeyIndex+1];
  const stageTone=matchStageTone(match);
  // edição ao vivo só vale para o jogo ATUAL da favorita (não em replays/jogos passados)
  const favPlaysHere = match.home===fav || match.away===fav;
  const editable = favPlaysHere && journeyIndex===(activeRecord()?.revealed);
  $("#matchSimulatorBox").innerHTML=`
    <button class="absolute top-4 right-4 text-slate-400 hover:text-ink" data-close>✕</button>
    <div class="flex flex-wrap items-center justify-between gap-3 pr-8">
      <div>
        <div class="text-[11px] uppercase tracking-widest font-extrabold text-slate-400">${match.matchNo?`M${match.matchNo} · `:''}${match.stage}</div>
        <div class="text-sm text-slate-500 font-semibold mt-1">${matchScheduleLine(match)}</div>
      </div>
      ${renderSimulationTypeBadge(type)}
    </div>
    <div class="mt-6 grid grid-cols-[1fr_auto_1fr] items-center gap-3 sm:gap-6">
      <div id="simHomeSide" class="match-side rounded-3xl p-4 bg-white/60 text-right">
        <div class="flex justify-end mb-2">${flag(match.home,'flag-xl')}</div>
        <div class="font-display font-extrabold text-xl sm:text-3xl">${match.home}</div>
      </div>
      <div class="text-center">
        <div id="simStageBadge" class="match-stage-badge ${stageTone.cls} mx-auto">${stageTone.label}</div>
        <div id="simClock" class="text-xs uppercase tracking-widest font-extrabold text-slate-400">00'</div>
        <div id="simScore" class="match-sim-score mt-2 rounded-[1.5rem] bg-ink text-white px-5 sm:px-8 py-3 font-display font-extrabold text-3xl sm:text-5xl tnum">0 x 0</div>
        <div id="simPhase" class="mt-2 text-xs font-extrabold text-slate-500">${matchPhaseLabel(0,match)}</div>
      </div>
      <div id="simAwaySide" class="match-side rounded-3xl p-4 bg-white/60 text-left">
        <div class="flex justify-start mb-2">${flag(match.away,'flag-xl')}</div>
        <div class="font-display font-extrabold text-xl sm:text-3xl">${match.away}</div>
      </div>
    </div>
    <div class="mt-6 h-3 rounded-full bg-slate-200/70 overflow-hidden">
      <div id="simProgress" class="h-full rounded-full" style="width:0%;background:linear-gradient(90deg,${profile.color},#1f7a4d,#c8962f)"></div>
    </div>
    <div id="pkMount" class="mt-5"></div>
    <div id="liveSubMount" class="mt-4"></div>
    <div id="simInfoGrid" class="mt-5 grid lg:grid-cols-[1fr_.78fr] gap-4">
      <div class="rounded-3xl bg-white/55 border border-white/70 p-4">
        <div class="text-[11px] uppercase tracking-widest font-extrabold text-slate-400 mb-3">Eventos da partida</div>
        <div id="simTimeline" class="space-y-2 min-h-[220px]"></div>
      </div>
      <div class="rounded-3xl bg-white/55 border border-white/70 p-4">
        <div class="text-[11px] uppercase tracking-widest font-extrabold text-slate-400">Resumo final</div>
        <div id="simSummary" class="mt-3 text-sm text-slate-600 leading-relaxed">A transmissão acelerada vai começar. O placar final só aparece quando os eventos acontecerem.</div>
      </div>
    </div>
    <div class="mt-5 flex flex-wrap justify-between gap-3">
      <div class="flex flex-wrap gap-2">
        ${editable?`<button id="liveSubBtn" class="btn-premium text-white rounded-2xl px-4 py-2.5 font-extrabold flex items-center gap-1.5">${ic('repeat-2','w-4 h-4')} Substituir</button>`:''}
        <button id="restartMatchSim" class="glass rounded-2xl px-4 py-2.5 font-bold text-slate-700">Reiniciar simulação</button>
        <button id="closeMatchSim" class="glass rounded-2xl px-4 py-2.5 font-bold text-slate-700">Fechar</button>
      </div>
      <button id="backToJourney" class="btn-premium text-white rounded-2xl px-4 py-2.5 font-bold">Voltar à jornada</button>
    </div>`;
  const backToJourney=()=>{ closeMatchSimulator(); renderFavoriteTeamJourney(); };
  $("#matchSimulatorBox").querySelector("[data-close]").onclick=backToJourney;
  $("#restartMatchSim").onclick=()=>simulateMatch(appState.currentSimulatedMatch?.match || match);
  $("#closeMatchSim").onclick=backToJourney;
  $("#backToJourney").onclick=backToJourney;
  if($("#liveSubBtn")) $("#liveSubBtn").onclick=()=>openLiveSubPicker("live");
  modal.classList.remove("hidden"); modal.classList.add("flex");
  setTimeout(()=>simulateMatch(match), 160);
  paintIcons();
}
function simulateMatch(match, resumeFrom=0){
  if(appState.matchTimer) clearInterval(appState.matchTimer);
  stopShootout();                                  // limpa disputa anterior, se houver
  clearLiveSubPicker();
  const pkMount=$("#pkMount"); if(pkMount) pkMount.innerHTML="";
  const infoGrid=$("#simInfoGrid"); if(infoGrid) infoGrid.classList.remove("hidden");
  appState.matchAnimationStarted=true;
  if(appState.currentSimulatedMatch) appState.currentSimulatedMatch.finished=false;
  const totalMs = match.pens ? 28000 : match.aet ? 25000 : 20000;
  const virtualMax = match.aet ? 120 : 90;
  // intervalo só pausa no jogo ATUAL da favorita (onde trocas são permitidas)
  const favTeam=getFavoriteTeam(), rec0=activeRecord();
  const editable = !!rec0 && (match.home===favTeam||match.away===favTeam) && (appState.currentSimulatedMatch?.journeyIndex)===rec0.revealed;
  let halftimeOffered = resumeFrom >= 45;
  const goals = (match.goals||[]).map(g=>({...g, kind:"goal", norm:normalizeGoalMinute(g.minute, match)}));
  const subWindows = Object.values((match.substitutions||[]).reduce((acc,s)=>{
    const key = [s.team, s.minute, s.window, s.extraTime ? "et" : "", s.concussion ? "conc" : ""].join("|");
    acc[key] = acc[key] || {...s, kind:"subWindow", norm:normalizeGoalMinute(s.minute, match), changes:[]};
    acc[key].changes.push(s);
    return acc;
  }, {}));
  const events = [...goals, ...subWindows].sort((a,b)=>a.norm.value-b.norm.value || (a.kind==="goal" ? -1 : 1));
  let shown=0, homeGoals=0, awayGoals=0;
  const scoreEl=$("#simScore"), clockEl=$("#simClock"), progressEl=$("#simProgress"), timeline=$("#simTimeline"), summary=$("#simSummary");
  const homeSide=$("#simHomeSide"), awaySide=$("#simAwaySide"), phaseEl=$("#simPhase");
  timeline.innerHTML = `<div class="goal-event rounded-2xl bg-slate-100/80 px-4 py-3 text-sm font-semibold text-slate-500">${resumeFrom>0?`Substituição confirmada aos ${resumeFrom}'. A partida segue daqui.`:"Apito inicial. A partida começa em ritmo acelerado."}</div>`;
  summary.textContent = "Acompanhe os eventos surgindo no minuto correto da simulação.";
  function addEvent(html){
    timeline.insertAdjacentHTML("afterbegin",`<div class="goal-event rounded-2xl bg-white/80 border border-white/80 px-4 py-3 shadow-glass">${html}</div>`);
  }
  function flash(team){
    scoreEl.classList.remove("flash"); void scoreEl.offsetWidth; scoreEl.classList.add("flash");
    const side = team===match.home ? homeSide : awaySide;
    side.classList.remove("hot"); void side.offsetWidth; side.classList.add("hot");
  }
  function applyEvent(ev, animate){
    if(ev.kind==="goal"){
      const g=ev;
      if(g.team===match.home) homeGoals++; else awayGoals++;
      scoreEl.textContent = `${homeGoals} x ${awayGoals}`;
      if(animate) flash(g.team);
      addEvent(`<div class="flex items-start gap-3">
        <div class="grid place-items-center w-9 h-9 rounded-full bg-mxgreen/12 text-mxgreen font-extrabold">⚽</div>
        <div>
          <div class="font-extrabold text-slate-800">${g.norm.display} — ${g.player} marca para ${flag(g.team)} ${g.team}</div>
          <div class="text-sm text-slate-500">${g.type}${g.assist?` · assistência de ${g.assist}`:""} · placar ${homeGoals} x ${awayGoals}</div>
        </div>
      </div>`);
    } else {
      const note = ev.concussion ? "substituição extra por concussão" : ev.extraTime ? "troca extra na prorrogação" : ev.window==="tecnico" ? "decisão do técnico" : ev.window==="intervalo" ? "troca no intervalo" : `janela ${ev.window}`;
      const changes = ev.changes || [ev];
      addEvent(`<div class="flex items-start gap-3">
        <div class="grid place-items-center w-9 h-9 rounded-full bg-usablue/10 text-usablue font-extrabold">${ic('repeat-2','w-4 h-4')}</div>
        <div class="min-w-0 flex-1">
          <div class="font-extrabold text-slate-800">${ev.norm.display} — ${flag(ev.team)} ${ev.team} mexe no time</div>
          <div class="text-sm text-slate-500">${note}${changes.length>1?` · ${changes.length} trocas`:''}</div>
          <div class="mt-2 grid sm:grid-cols-2 gap-1.5">
            ${changes.map(s=>`<div class="rounded-xl bg-slate-50/90 border border-slate-100 px-2.5 py-1.5 text-xs font-semibold text-slate-600">
              <span class="text-mxgreen">${compactPlayerName(s.in.name)}</span>
              <span class="text-slate-300 px-1">por</span>
              <span class="text-slate-500">${compactPlayerName(s.out.name)}</span>
            </div>`).join("")}
          </div>
        </div>
      </div>`);
      if(animate) paintIcons();
    }
  }
  // retomada após troca ao vivo: mostra instantaneamente o que já aconteceu antes do minuto
  if(resumeFrom>0){
    while(shown<events.length && events[shown].norm.value < resumeFrom) applyEvent(events[shown++], false);
    scoreEl.textContent = `${homeGoals} x ${awayGoals}`;
    paintIcons();
  }
  const start=Date.now() - (resumeFrom/virtualMax)*totalMs;
  appState.matchTimer=setInterval(()=>{
    const elapsed=Date.now()-start;
    const ratio=Math.min(1,elapsed/totalMs);
    const minute=Math.round(ratio*virtualMax);
    if(appState.currentSimulatedMatch) appState.currentSimulatedMatch.minute=minute;
    clockEl.textContent = `${String(minute).padStart(2,"0")}'`;
    phaseEl.textContent = matchPhaseLabel(minute, match);
    progressEl.style.width = `${Math.min(100,ratio*100)}%`;
    while(shown<events.length && events[shown].norm.value<=minute) applyEvent(events[shown++], true);
    // pausa no intervalo: oferece trocas + botão Continuar (só no jogo atual da favorita)
    if(editable && !halftimeOffered && minute>=45 && ratio<1){
      halftimeOffered=true;
      clearInterval(appState.matchTimer); appState.matchTimer=null;
      clockEl.textContent="45'"; phaseEl.textContent="Intervalo";
      openHalftimeBreak();
      return;
    }
    if(ratio>=1){
      clearInterval(appState.matchTimer);
      appState.matchTimer=null;
      if(appState.currentSimulatedMatch) appState.currentSimulatedMatch.finished=true;
      scoreEl.textContent=`${match.ga} x ${match.gb}`;
      clockEl.textContent=match.aet?"120'":"90'";
      phaseEl.textContent="Fim de jogo";
      progressEl.style.width="100%";
      // revela este jogo na jornada (idempotente; só avança o progresso)
      const item=appState.currentSimulatedMatch;
      if(item && item.match===match) markMatchRevealed(activeRecord(), item.journeyIndex);
      if(!goals.length) addEvent(`<div class="font-extrabold text-slate-700">Fim do tempo${match.aet?' (após prorrogação)':''}.</div><div class="text-sm text-slate-500">${match.penalties?'Empate persiste — a decisão vai para os pênaltis.':'Defesas dominaram e ninguém abriu o placar.'}</div>`);
      if(match.penalties){
        clockEl.textContent = match.aet?"120'":"90'";
        addEvent(`<div class="font-extrabold text-slate-700 flex items-center gap-2">${ic('target','w-4 h-4 text-usared')} Decisão por pênaltis</div><div class="text-sm text-slate-500">Tudo igual em ${scoreLine({...match,pens:null})}. As cobranças vão definir quem avança.</div>`);
        summary.innerHTML = `Empate até o fim. A vaga será decidida nas cobranças de pênalti — acompanhe abaixo, cobrança a cobrança.`;
        startShootout(match);
      } else {
        const fav=getFavoriteTeam();
        const favPlayed=match.home===fav||match.away===fav;
        const favWon=favPlayed && getMatchWinnerTeam(match)===fav;
        summary.innerHTML = `${flag(match.winner?.team||getMatchWinnerTeam(match)||match.home)} <b>${match.winner?.team||getMatchWinnerTeam(match)||"Empate"}</b> ${getMatchWinnerTeam(match)?"vence a partida":"fica no empate"} por <b>${scoreLine(match)}</b> em ${match.city}. ${match.substitutions?.length?`Foram ${match.substitutions.length} substituição(ões) registradas seguindo a regra FIFA. `:""}${favPlayed?(favWon?"Sua seleção venceu este capítulo da jornada.":"Sua seleção não venceu este jogo."):""}`;
        if(favPlayed && favWon) celebrateConfetti();
      }
    }
  },120);
}
/* =================================================================
   DISPUTA DE PÊNALTIS ANIMADA (estilo simulador de futebol)
   -----------------------------------------------------------------
   >>> Ajuste a duração de cada cobrança nestas 3 constantes <<<
   Total por cobrança ≈ PK_PREP_MS + PK_SHOT_MS + PK_RESULT_MS.
   Para o ritmo de 5s/5s do enunciado: PK_PREP_MS=5000, PK_RESULT_MS=5000.
   ================================================================= */
const PK_PREP_MS   = 1700;   // "Fulano se prepara para a cobrança…"
const PK_SHOT_MS   = 800;    // animação do chute entrando no gol
const PK_RESULT_MS = 1450;   // exibe o resultado antes da próxima cobrança
// posição (% dentro do mini-gol) de cada zona de chute
const PK_ZONE_XY = {
  "top-left":[27,42],"top-center":[50,40],"top-right":[73,42],
  "bottom-left":[28,63],"bottom-center":[50,64],"bottom-right":[72,63],
};
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
function penaltyShotPosition(k, index){
  const base = PK_ZONE_XY[k.shotZone] || [50,50];
  const offset = PK_ZONE_OFFSETS[index % PK_ZONE_OFFSETS.length];
  let x = base[0] + offset[0];
  let y = base[1] + offset[1];
  if(k.result==="Para fora"){
    const side = x < 50 ? -1 : 1;
    x = x + side * (18 + (index % 3) * 4);
    y = y + (k.shotZone?.startsWith("top") ? -12 : 12);
  } else if(k.result==="Na trave"){
    x = x < 40 ? 19 : x > 60 ? 81 : x;
    y = k.shotZone?.startsWith("top") ? 31 : 73;
  } else if(k.result==="Defendido"){
    x = base[0] + offset[0] * 0.6;
    y = base[1] + offset[1] * 0.6;
  }
  return [clamp(x, -10, 110), clamp(y, 18, 88)];
}
function stopShootout(){
  (appState.penaltyTimers||[]).forEach(t=>clearTimeout(t));
  appState.penaltyTimers=[];
}
function startShootout(match){
  stopShootout();
  const sh=match.penalties; if(!sh) return;
  const mount=$("#pkMount"); if(!mount) return;
  const infoGrid=$("#simInfoGrid");
  if(infoGrid) infoGrid.classList.add("hidden");
  const fav=getFavoriteTeam(), home=match.home, away=match.away;
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
  const homeKicks=sh.kicks.filter(k=>k.team===home), awayKicks=sh.kicks.filter(k=>k.team===away);
  const dotsHome=$("#pkDotsHome"), dotsAway=$("#pkDotsAway");
  for(let i=0;i<Math.max(5,homeKicks.length);i++) dotsHome.insertAdjacentHTML("beforeend",`<span class="pk-dot" data-h="${i}"></span>`);
  for(let i=0;i<Math.max(5,awayKicks.length);i++) dotsAway.insertAdjacentHTML("beforeend",`<span class="pk-dot" data-a="${i}"></span>`);
  const goalShots=$("#pkGoalShots");
  let hUsed=0,aUsed=0,hScore=0,aScore=0;
  const wait=ms=>new Promise(res=>{ const t=setTimeout(res,ms); appState.penaltyTimers.push(t); });
  (async()=>{
    for(let i=0;i<sh.kicks.length;i++){
      const k=sh.kicks[i], isHome=k.team===home;
      $("#pkSideHome").classList.toggle("active",isHome);
      $("#pkSideAway").classList.toggle("active",!isHome);
      $("#pkRound").innerHTML = `${i>=10?'Cobranças alternadas · ':''}Cobrança ${i+1}`;
      $("#pkKicker").className="pk-kicker prep text-slate-700";
      $("#pkKicker").innerHTML = `${flag(k.team)} <b>${k.player}</b> se prepara para a cobrança…${k.decisive?` <span class="text-gold-600 font-extrabold">· decisiva</span>`:''}`;
      $("#pkFeaturedEvent").innerHTML = `${flag(k.team)} <b>${k.player}</b> na bola por ${k.team}`;
      $("#pkFeaturedEvent").className = "pk-featured-event mt-4 prep";
      $("#pkResult").innerHTML="";
      await wait(PK_PREP_MS);
      const [zx,zy]=penaltyShotPosition(k, i);
      goalShots.innerHTML="";
      const shot=document.createElement("div");
      shot.className=`pk-shot ${k.scored?'goal':'miss'} ${k.result==="Para fora"?'wide':''}`;
      shot.style.left=zx+"%"; shot.style.top=zy+"%";
      shot.textContent = k.scored ? "●" : "✕";
      goalShots.appendChild(shot);
      requestAnimationFrame(()=>shot.classList.add("show"));
      $("#pkKicker").className="pk-kicker text-slate-500";
      await wait(PK_SHOT_MS);
      if(k.scored){ if(isHome) hScore++; else aScore++; }
      $("#pkScoreH").textContent=hScore; $("#pkScoreA").textContent=aScore;
      const dot=mount.querySelector(isHome?`[data-h="${hUsed}"]`:`[data-a="${aUsed}"]`);
      if(dot) dot.classList.add(k.scored?"goal":"miss");
      if(isHome) hUsed++; else aUsed++;
      $("#pkResult").innerHTML = `<span class="pk-result-badge ${k.scored?'goal':'miss'}">${ic(k.scored?'check':'x','w-4 h-4')} ${k.result}</span><div class="mt-1 text-xs font-bold text-slate-400">Chute no ${PK_ZONE_LABELS[k.shotZone]||"centro do gol"}</div>`;
      $("#pkFeaturedEvent").innerHTML = `${flag(k.team)} <b>${k.player}</b>: <span class="${k.scored?'text-mxgreen':'text-usared'}">${k.result}</span>`;
      $("#pkFeaturedEvent").className = `pk-featured-event mt-4 ${k.scored?'goal':'miss'}`;
      paintIcons();
      await wait(PK_RESULT_MS);
    }
    $("#pkSideHome").classList.remove("active"); $("#pkSideAway").classList.remove("active");
    const winner=sh.winner;
    $("#pkKicker").className="pk-kicker text-slate-800";
    $("#pkKicker").innerHTML = `${flag(winner)} <b>${winner}</b> vence a disputa por ${sh.homeScore} x ${sh.awayScore}!`;
    $("#pkFeaturedEvent").innerHTML = `${flag(winner)} <b>${winner}</b> vence a disputa por ${sh.homeScore} x ${sh.awayScore}`;
    $("#pkFeaturedEvent").className = "pk-featured-event mt-4 goal";
    $("#pkRound").textContent="Fim da disputa";
    const box=$("#matchSimulatorBox"); if(box && winner===match.winner?.team) box.classList.add("pk-decisive");
    const summary=$("#simSummary");
    const favPlayed=home===fav||away===fav, favWon=favPlayed&&winner===fav;
    if(summary) summary.innerHTML = `${flag(winner)} <b>${winner}</b> avança nos pênaltis por <b>${sh.homeScore} x ${sh.awayScore}</b> (no tempo normal, ${match.ga}–${match.gb}). ${favPlayed?(favWon?'Sua seleção sobreviveu ao drama das cobranças!':'Sua seleção caiu na loteria dos pênaltis.'):''}`;
    if(favWon) celebrateConfetti();
  })();
}
function celebrateConfetti(){
  const box=$("#matchSimulatorBox"); if(!box) return;
  const colors=["#0a3161","#b31942","#1f7a4d","#c8962f","#e9b949"];
  for(let i=0;i<48;i++){
    const c=document.createElement("div");
    c.className="confetti-pc"; c.style.left=Math.random()*100+"%";
    c.style.background=colors[i%colors.length];
    c.style.animationDuration=(1.6+Math.random()*1.4)+"s";
    c.style.animationDelay=(Math.random()*0.4)+"s";
    box.appendChild(c); setTimeout(()=>c.remove(),3400);
  }
}
function closeMatchSimulator(){
  if(appState.matchTimer) clearInterval(appState.matchTimer);
  appState.matchTimer=null;
  stopShootout();
  clearLiveSubPicker();
  const modal=$("#matchSimulator");
  if(modal){ modal.classList.add("hidden"); modal.classList.remove("flex"); }
}
function resetMatchSimulator(){
  const item=appState.currentSimulatedMatch;
  if(item) simulateMatch(item.match);
}
function goToNextFavoriteTeamMatch(){
  const item=appState.currentSimulatedMatch;
  const matches=getTeamMatches(currentSim(), getFavoriteTeam());
  const next=(item?.journeyIndex ?? -1)+1;
  if(matches[next]) openTacticPlanner(matches[next], next);
}

/* =================================================================
   SUBSTITUIÇÃO AO VIVO (durante a partida)
   -----------------------------------------------------------------
   Pausa a transmissão, escolhe sai/entra, grava a troca no roteiro da
   tática (liveScript) e re-simula. Como o motor é prefixo-estável, os
   minutos já mostrados não mudam: a partida apenas RETOMA do minuto da
   troca com o desfecho recalculado a partir dali.
   ================================================================= */
const LIVE_SUB_PER_WINDOW = 3;            // até 3 trocas na MESMA parada
const LIVE_SUB_INPLAY_WINDOWS = 3;       // no máx. 3 paradas com bola rolando (fora o intervalo)
let liveSubDraft = null;                  // [{out,in}] em edição na janela atual
let liveSubCtx = null;                    // contexto da janela aberta

function onFieldNamesAt(tactic, minute){
  const field = new Set(tactic.starters||[]);
  (tactic.liveScript||[]).filter(e=>e.type==="sub" && e.out && e.in)
    .slice().sort((a,b)=>(a.minute|0)-(b.minute|0))
    .forEach(s=>{ if((s.minute|0)<=minute){ field.delete(s.out); field.add(s.in); } });
  return field;
}
// info de janelas: intervalo (min 45-46) não conta nas 3 paradas com bola rolando
function subWindowInfo(liveScript){
  const subs=(liveScript||[]).filter(e=>e.type==="sub");
  const isHalf=m=>(m|0)>=45 && (m|0)<=46;
  const inPlay=[...new Set(subs.map(s=>s.minute|0).filter(m=>!isHalf(m)))];
  return { total:subs.length, inPlayWindows:inPlay.length, inPlayMins:new Set(inPlay), halftimeUsed:subs.some(s=>isHalf(s.minute)) };
}
function clearLiveSubPicker(){
  const mount=$("#liveSubMount"); if(mount) mount.innerHTML="";
  appState.liveSubPaused=false;
  liveSubDraft=null; liveSubCtx=null;
}
function openHalftimeBreak(){ openLiveSubPicker("halftime"); }
function openLiveSubPicker(mode){
  mode = mode==="halftime" ? "halftime" : "live";
  const item=appState.currentSimulatedMatch;
  if(!item || appState.liveSubPaused) return;
  if(mode==="live" && !appState.matchTimer) return;                    // live só durante a partida
  const { match, journeyIndex }=item;
  const fav=getFavoriteTeam(), record=activeRecord();
  if(!record || journeyIndex!==record.revealed) return;
  if(match.home!==fav && match.away!==fav) return;
  if(mode==="live"){ clearInterval(appState.matchTimer); appState.matchTimer=null; } // pausa (no intervalo já está pausado)
  appState.liveSubPaused=true;
  const maxMin = match.aet?120:90;
  const curMin = Math.max(1, Math.min(maxMin-1, item.minute||1));
  const tactic = (record.tactics && record.tactics[journeyIndex]) || WC_LINEUPS.autoTactic(fav);
  const totalMax = match.aet?6:5;
  const info = subWindowInfo(tactic.liveScript);
  const sq = TEAMS[fav].sq;
  const posOf = n => sq.find(p=>p[0]===n)?.[1];
  const rank = n => WC_LINEUPS.playerRank(fav, n);
  const subMinute = mode==="halftime" ? 46 : curMin;
  const resumeMinute = curMin;
  const baseField = onFieldNamesAt(tactic, mode==="halftime" ? 45 : curMin);
  const usedIn = new Set((tactic.liveScript||[]).filter(e=>e.type==="sub").map(e=>e.in));
  const benchPool = sq.map(p=>p[0]).filter(n=>!baseField.has(n) && !usedIn.has(n) && posOf(n)!=="GK").sort((a,b)=>rank(b)-rank(a));
  const newInPlayWindow = mode==="live" && !info.inPlayMins.has(subMinute);
  const blockedReason = info.total>=totalMax ? "total"
    : (newInPlayWindow && info.inPlayWindows>=LIVE_SUB_INPLAY_WINDOWS) ? "window" : null;
  liveSubCtx = { mode, match, journeyIndex, fav, subMinute, resumeMinute, totalMax, info, baseField, benchPool, posOf, rank, blockedReason };
  liveSubDraft = [{out:"", in:""}];
  renderLiveSubPicker();
}
// opções de saída/entrada para a linha i, excluindo os jogadores escolhidos nas OUTRAS linhas
function liveSubRowOptions(i){
  const { baseField, benchPool, posOf, rank } = liveSubCtx;
  const otherOuts = new Set(liveSubDraft.filter((_,j)=>j!==i).map(r=>r.out).filter(Boolean));
  const otherIns  = new Set(liveSubDraft.filter((_,j)=>j!==i).map(r=>r.in).filter(Boolean));
  const outs = [...baseField].filter(n=>posOf(n)!=="GK" && !otherOuts.has(n) && !otherIns.has(n)).sort((a,b)=>rank(a)-rank(b));
  const ins  = benchPool.filter(n=>!otherIns.has(n) && !otherOuts.has(n));
  return { outs, ins };
}
function liveSubMaxRows(){
  const { totalMax, info, benchPool } = liveSubCtx;
  return Math.max(1, Math.min(LIVE_SUB_PER_WINDOW, totalMax-info.total, benchPool.length));
}
function renderLiveSubPicker(){
  if(!liveSubCtx) return;
  const mount=$("#liveSubMount"); if(!mount) return;
  const { mode, subMinute, totalMax, info, posOf, blockedReason } = liveSubCtx;
  const isHalf = mode==="halftime";
  const maxRows = liveSubMaxRows();
  const ready = liveSubDraft.filter(r=>r.out && r.in).length;
  const opt = (sel, list, ph)=> `<option value="">${ph}</option>` + list.map(n=>`<option value="${n}" ${n===sel?'selected':''}>${n} · ${posOf(n)}</option>`).join("");
  const counter = `${info.total}/${totalMax} trocas · ${info.inPlayWindows}/${LIVE_SUB_INPLAY_WINDOWS} paradas`;
  let body;
  if(blockedReason){
    const msg = blockedReason==="total" ? "Você já usou todas as substituições."
      : "Você já usou as 3 paradas permitidas (fora o intervalo).";
    body = `<div class="text-sm font-semibold text-slate-500">${msg}</div>
      <div class="mt-3 flex justify-end"><button id="liveSubGo" class="btn-premium text-white rounded-2xl px-5 py-2.5 font-bold">${isHalf?'Continuar 2º tempo':'Continuar jogo'}</button></div>`;
  } else {
    const rowsHtml = liveSubDraft.map((r,i)=>{
      const { outs, ins } = liveSubRowOptions(i);
      return `<div class="grid grid-cols-[1fr_auto_1fr_auto] items-center gap-2">
          <select class="ls-out rounded-2xl border border-slate-200 px-3 py-2.5 text-sm font-bold" data-i="${i}">${opt(r.out, outs, "— sai —")}</select>
          <span class="text-slate-300">${ic('arrow-right','w-4 h-4')}</span>
          <select class="ls-in rounded-2xl border border-slate-200 px-3 py-2.5 text-sm font-bold" data-i="${i}">${opt(r.in, ins, "— entra —")}</select>
          <button class="ls-del w-8 h-8 grid place-items-center rounded-full text-slate-300 hover:text-usared ${liveSubDraft.length>1?'':'invisible'}" data-i="${i}" title="Remover">${ic('x','w-4 h-4')}</button>
        </div>`;
    }).join("");
    body = `<div class="text-[11px] text-slate-400 font-semibold mb-2">${isHalf?'Trocas no intervalo (não contam nas 3 paradas).':'Você pode fazer até '+maxRows+' troca(s) nesta parada.'}</div>
       <div class="space-y-2">${rowsHtml}</div>
       <div class="mt-2">${liveSubDraft.length<maxRows ? `<button id="liveSubAdd" class="glass rounded-xl px-3 py-1.5 text-xs font-extrabold text-slate-600 flex items-center gap-1">${ic('plus','w-3.5 h-3.5')} Outra troca</button>` : ''}</div>
       <div class="mt-3 flex justify-between gap-2">
         <button id="liveSubCancel" class="glass rounded-2xl px-4 py-2.5 font-bold text-slate-600">${isHalf?'Sem trocas':'Cancelar'}</button>
         <button id="liveSubConfirm" class="btn-premium text-white rounded-2xl px-5 py-2.5 font-extrabold ${(isHalf||ready)?'':'opacity-40 pointer-events-none'}">${isHalf?'Continuar 2º tempo':('Confirmar '+(ready>1?ready+' trocas':'troca'))}</button>
       </div>`;
  }
  mount.innerHTML = `
    <div class="guided-card rounded-3xl p-4 border-2 ${isHalf?'border-gold-400/50':'border-usablue/30'}">
      <div class="flex items-center justify-between mb-3 gap-2">
        <div class="font-display font-extrabold text-lg flex items-center gap-2 min-w-0">${ic(isHalf?'coffee':'repeat-2',(isHalf?'w-5 h-5 text-gold-600':'w-5 h-5 text-usablue')+' flex-none')} <span class="truncate">${isHalf?'Intervalo · 1º tempo encerrado':'Substituições — '+subMinute+"'"}</span></div>
        <div class="flex items-center gap-2 flex-none">
          <div class="text-[11px] font-extrabold rounded-full px-2 py-0.5 ${info.total>=totalMax?'text-usared bg-usared/10':'text-slate-500 bg-slate-100'}">${counter}</div>
          <button id="liveSubClose" class="w-8 h-8 grid place-items-center rounded-full bg-slate-100 text-slate-500 hover:bg-usared/10 hover:text-usared font-bold" title="${isHalf?'Continuar sem trocas':'Cancelar e continuar o jogo'}">✕</button>
        </div>
      </div>
      ${body}
    </div>`;
  paintIcons();
  if($("#liveSubClose")) $("#liveSubClose").onclick=cancelLiveSub;
  if($("#liveSubGo")) $("#liveSubGo").onclick=cancelLiveSub;
  if($("#liveSubCancel")) $("#liveSubCancel").onclick=cancelLiveSub;
  if($("#liveSubAdd")) $("#liveSubAdd").onclick=()=>{ liveSubDraft.push({out:"", in:""}); renderLiveSubPicker(); };
  document.querySelectorAll("#liveSubMount .ls-out").forEach(s=> s.onchange=()=>{ liveSubDraft[Number(s.dataset.i)].out=s.value; renderLiveSubPicker(); });
  document.querySelectorAll("#liveSubMount .ls-in").forEach(s=> s.onchange=()=>{ liveSubDraft[Number(s.dataset.i)].in=s.value; renderLiveSubPicker(); });
  document.querySelectorAll("#liveSubMount .ls-del").forEach(b=> b.onclick=()=>{ liveSubDraft.splice(Number(b.dataset.i),1); renderLiveSubPicker(); });
  // no intervalo o botão principal "Continuar" aplica as trocas (se houver) ou só segue
  if($("#liveSubConfirm")) $("#liveSubConfirm").onclick=()=> (liveSubDraft.some(r=>r.out&&r.in) ? confirmLiveSubs() : cancelLiveSub());
  mount.scrollIntoView({behavior:"smooth", block:"nearest"});
}
function cancelLiveSub(){
  const item=appState.currentSimulatedMatch;
  const resume = liveSubCtx ? liveSubCtx.resumeMinute : (item?.minute||0);
  clearLiveSubPicker();
  if(item) simulateMatch(item.match, Math.max(0, resume));   // retoma sem mudar nada
}
function confirmLiveSubs(){
  const item=appState.currentSimulatedMatch, record=activeRecord();
  if(!item || !record || !liveSubCtx) return;
  const { fav, journeyIndex, subMinute, resumeMinute } = liveSubCtx;
  // linhas completas e distintas (sem repetir quem sai ou quem entra)
  const seenOut=new Set(), seenIn=new Set(), picks=[];
  liveSubDraft.forEach(r=>{
    if(r.out && r.in && r.out!==r.in && !seenOut.has(r.out) && !seenIn.has(r.in)){
      seenOut.add(r.out); seenIn.add(r.in); picks.push({minute:subMinute, type:"sub", out:r.out, in:r.in});
    }
  });
  if(!picks.length){ cancelLiveSub(); return; }            // nada escolhido -> só continua
  const cur = (record.tactics && record.tactics[journeyIndex]) || WC_LINEUPS.autoTactic(fav);
  const tactic = { ...cur, starters:cur.starters.slice(), liveScript:[...(cur.liveScript||[]), ...picks] };
  setMatchTactic(record, journeyIndex, tactic);            // grava + invalida cache (prefixo estável)
  const fresh = getTeamMatches(currentSim(), fav)[journeyIndex];
  clearLiveSubPicker();
  if(fresh){ appState.currentSimulatedMatch={match:fresh, journeyIndex, minute:resumeMinute}; simulateMatch(fresh, Math.max(0, resumeMinute)); }
}

/* ---- NARRATIVE ---- */

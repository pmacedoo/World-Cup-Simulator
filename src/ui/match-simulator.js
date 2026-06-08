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
function openMatchSimulator(match, journeyIndex=0){
  closeModal();
  appState.currentSimulatedMatch={match, journeyIndex};
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
  $("#matchSimulatorBox").innerHTML=`
    <button class="absolute top-4 right-4 text-slate-400 hover:text-ink" data-close>✕</button>
    <div class="flex flex-wrap items-center justify-between gap-3 pr-8">
      <div>
        <div class="text-[11px] uppercase tracking-widest font-extrabold text-slate-400">${match.matchNo?`M${match.matchNo} · `:''}${match.stage}</div>
        <div class="text-sm text-slate-500 font-semibold mt-1">${match.city} · ${match.venue}</div>
      </div>
      ${renderSimulationTypeBadge(type)}
    </div>
    <div class="mt-6 grid grid-cols-[1fr_auto_1fr] items-center gap-3 sm:gap-6">
      <div id="simHomeSide" class="match-side rounded-3xl p-4 bg-white/60 text-right">
        <div class="flex justify-end mb-2">${flag(match.home,'flag-xl')}</div>
        <div class="font-display font-extrabold text-xl sm:text-3xl">${match.home}</div>
      </div>
      <div class="text-center">
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
    <div class="mt-5 grid lg:grid-cols-[1fr_.78fr] gap-4">
      <div class="rounded-3xl bg-white/55 border border-white/70 p-4">
        <div class="text-[11px] uppercase tracking-widest font-extrabold text-slate-400 mb-3">Eventos da partida</div>
        <div id="simTimeline" class="space-y-2 min-h-[220px]"></div>
      </div>
      <div class="rounded-3xl bg-white/55 border border-white/70 p-4">
        <div class="text-[11px] uppercase tracking-widest font-extrabold text-slate-400">Resumo final</div>
        <div id="simSummary" class="mt-3 text-sm text-slate-600 leading-relaxed">A transmissão acelerada vai começar. O placar final só aparece quando os eventos acontecerem.</div>
      </div>
    </div>
    <div id="pkMount" class="mt-5"></div>
    <div class="mt-5 flex flex-wrap justify-between gap-3">
      <div class="flex flex-wrap gap-2">
        <button id="restartMatchSim" class="glass rounded-2xl px-4 py-2.5 font-bold text-slate-700">Reiniciar simulação</button>
        <button id="closeMatchSim" class="glass rounded-2xl px-4 py-2.5 font-bold text-slate-700">Fechar</button>
      </div>
      <button id="backToJourney" class="btn-premium text-white rounded-2xl px-4 py-2.5 font-bold">Voltar à jornada</button>
    </div>`;
  const backToJourney=()=>{ closeMatchSimulator(); renderFavoriteTeamJourney(); };
  $("#matchSimulatorBox").querySelector("[data-close]").onclick=backToJourney;
  $("#restartMatchSim").onclick=()=>simulateMatch(match);
  $("#closeMatchSim").onclick=backToJourney;
  $("#backToJourney").onclick=backToJourney;
  modal.classList.remove("hidden"); modal.classList.add("flex");
  setTimeout(()=>simulateMatch(match), 160);
  paintIcons();
}
function simulateMatch(match){
  if(appState.matchTimer) clearInterval(appState.matchTimer);
  stopShootout();                                  // limpa disputa anterior, se houver
  const pkMount=$("#pkMount"); if(pkMount) pkMount.innerHTML="";
  appState.matchAnimationStarted=true;
  const totalMs = match.pens ? 28000 : match.aet ? 25000 : 20000;
  const virtualMax = match.aet ? 120 : 90;
  const goals = (match.goals||[]).map(g=>({...g, norm:normalizeGoalMinute(g.minute, match)})).sort((a,b)=>a.norm.value-b.norm.value);
  let shown=0, homeGoals=0, awayGoals=0;
  const scoreEl=$("#simScore"), clockEl=$("#simClock"), progressEl=$("#simProgress"), timeline=$("#simTimeline"), summary=$("#simSummary");
  const homeSide=$("#simHomeSide"), awaySide=$("#simAwaySide"), phaseEl=$("#simPhase");
  timeline.innerHTML = `<div class="goal-event rounded-2xl bg-slate-100/80 px-4 py-3 text-sm font-semibold text-slate-500">Apito inicial. A partida começa em ritmo acelerado.</div>`;
  summary.textContent = "Acompanhe os eventos surgindo no minuto correto da simulação.";
  const start=Date.now();
  function addEvent(html){
    timeline.insertAdjacentHTML("afterbegin",`<div class="goal-event rounded-2xl bg-white/80 border border-white/80 px-4 py-3 shadow-glass">${html}</div>`);
  }
  function flash(team){
    scoreEl.classList.remove("flash"); void scoreEl.offsetWidth; scoreEl.classList.add("flash");
    const side = team===match.home ? homeSide : awaySide;
    side.classList.remove("hot"); void side.offsetWidth; side.classList.add("hot");
  }
  appState.matchTimer=setInterval(()=>{
    const elapsed=Date.now()-start;
    const ratio=Math.min(1,elapsed/totalMs);
    const minute=Math.round(ratio*virtualMax);
    clockEl.textContent = `${String(minute).padStart(2,"0")}'`;
    phaseEl.textContent = matchPhaseLabel(minute, match);
    progressEl.style.width = `${Math.min(100,ratio*100)}%`;
    while(shown<goals.length && goals[shown].norm.value<=minute){
      const g=goals[shown++];
      if(g.team===match.home) homeGoals++; else awayGoals++;
      scoreEl.textContent = `${homeGoals} x ${awayGoals}`;
      flash(g.team);
      addEvent(`<div class="flex items-start gap-3">
        <div class="grid place-items-center w-9 h-9 rounded-full bg-mxgreen/12 text-mxgreen font-extrabold">⚽</div>
        <div>
          <div class="font-extrabold text-slate-800">${g.norm.display} — ${g.player} marca para ${flag(g.team)} ${g.team}</div>
          <div class="text-sm text-slate-500">${g.type}${g.assist?` · assistência de ${g.assist}`:""} · placar ${homeGoals} x ${awayGoals}</div>
        </div>
      </div>`);
    }
    if(ratio>=1){
      clearInterval(appState.matchTimer);
      appState.matchTimer=null;
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
        summary.innerHTML = `${flag(match.winner?.team||getMatchWinnerTeam(match)||match.home)} <b>${match.winner?.team||getMatchWinnerTeam(match)||"Empate"}</b> ${getMatchWinnerTeam(match)?"vence a partida":"fica no empate"} por <b>${scoreLine(match)}</b> em ${match.city}. ${favPlayed?(favWon?"Sua seleção venceu este capítulo da jornada.":"Sua seleção não venceu este jogo."):""}`;
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
  "top-left":[20,30],"top-center":[50,25],"top-right":[80,30],
  "bottom-left":[22,72],"bottom-center":[50,77],"bottom-right":[78,72],
};
function stopShootout(){
  (appState.penaltyTimers||[]).forEach(t=>clearTimeout(t));
  appState.penaltyTimers=[];
}
function startShootout(match){
  stopShootout();
  const sh=match.penalties; if(!sh) return;
  const mount=$("#pkMount"); if(!mount) return;
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
      <div class="mt-4 grid sm:grid-cols-[auto_1fr] gap-4 items-center">
        <div class="pk-goal"><div class="absolute inset-0" id="pkGoalShots"></div></div>
        <div class="text-center sm:text-left">
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
      $("#pkResult").innerHTML="";
      await wait(PK_PREP_MS);
      const [zx,zy]=PK_ZONE_XY[k.shotZone]||[50,50];
      const shot=document.createElement("div");
      shot.className=`pk-shot ${k.scored?'goal':'miss'}`;
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
      $("#pkResult").innerHTML = `<span class="pk-result-badge ${k.scored?'goal':'miss'}">${ic(k.scored?'check':'x','w-4 h-4')} ${k.result}</span>`;
      paintIcons();
      await wait(PK_RESULT_MS);
    }
    $("#pkSideHome").classList.remove("active"); $("#pkSideAway").classList.remove("active");
    const winner=sh.winner;
    $("#pkKicker").className="pk-kicker text-slate-800";
    $("#pkKicker").innerHTML = `${flag(winner)} <b>${winner}</b> vence a disputa por ${sh.homeScore} x ${sh.awayScore}!`;
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
  if(matches[next]) openMatchSimulator(matches[next], next);
}

/* ---- NARRATIVE ---- */

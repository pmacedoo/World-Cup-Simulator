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
      <div class="match-top-actions flex flex-wrap items-center justify-end gap-2">
        ${editable?`<button id="liveSubBtn" class="btn-premium text-white rounded-2xl px-4 py-2.5 font-extrabold flex items-center gap-1.5">${ic('repeat-2','w-4 h-4')} Substituir</button>`:''}
        <button id="skipMatchSim" class="glass rounded-2xl px-4 py-2.5 font-bold text-slate-700 flex items-center gap-1.5">${ic('fast-forward','w-4 h-4')} Pular</button>
        ${renderSimulationTypeBadge(type)}
      </div>
    </div>
    <div class="mt-6 grid grid-cols-[1fr_auto_1fr] items-center gap-3 sm:gap-6">
      <div id="simHomeSide" class="match-side rounded-3xl p-4 bg-white/60 text-right">
        <div class="flex justify-end mb-2">${flag(match.home,'flag-xl')}</div>
        <div class="match-team-name font-display font-extrabold text-xl sm:text-3xl">${match.home}</div>
      </div>
      <div class="text-center">
        <div id="simStageBadge" class="match-stage-badge ${stageTone.cls} mx-auto">${stageTone.label}</div>
        <div id="simClock" class="text-xs uppercase tracking-widest font-extrabold text-slate-400">00'</div>
        <div id="simScore" class="match-sim-score mt-2 rounded-[1.5rem] bg-ink text-white px-5 sm:px-8 py-3 font-display font-extrabold text-3xl sm:text-5xl tnum">0 x 0</div>
        <div id="simPhase" class="mt-2 text-xs font-extrabold text-slate-500">${matchPhaseLabel(0,match)}</div>
      </div>
      <div id="simAwaySide" class="match-side rounded-3xl p-4 bg-white/60 text-left">
        <div class="flex justify-start mb-2">${flag(match.away,'flag-xl')}</div>
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
  const backToJourney=()=>{ closeMatchSimulator(); renderFavoriteTeamJourney(); };
  $("#matchSimulatorBox").querySelector("[data-close]").onclick=backToJourney;
  $("#backToJourney").onclick=backToJourney;
  if($("#liveSubBtn")) $("#liveSubBtn").onclick=()=>openLiveSubPicker("live");
  $("#skipMatchSim").onclick=()=>{ if(confirm("Pular a transmissão e mostrar o resultado final?")) skipMatchSimulation(match); };
  modal.classList.remove("hidden"); modal.classList.add("flex");
  setTimeout(()=>simulateMatch(match), 160);
  paintIcons();
}
function skipMatchSimulation(match){
  if(appState.matchTimer){ clearInterval(appState.matchTimer); appState.matchTimer=null; }
  stopShootout();
  const scoreEl=$("#simScore"), clockEl=$("#simClock"), progressEl=$("#simProgress");
  const timeline=$("#simTimeline"), summary=$("#simSummary"), phaseEl=$("#simPhase");
  const pkMount=$("#pkMount"), infoGrid=$("#simInfoGrid"), skipBtn=$("#skipMatchSim");
  if(!scoreEl) return;

  scoreEl.textContent=`${match.ga} x ${match.gb}`;
  clockEl.textContent=match.aet?"120'":"90'";
  phaseEl.textContent="Fim de jogo";
  progressEl.style.width="100%";
  if(skipBtn) skipBtn.classList.add("hidden");

  if(timeline){
    const goals=(match.goals||[]).slice().sort((a,b)=>a.minute-b.minute);
    const subWindows=Object.values((match.substitutions||[]).reduce((acc,s)=>{
      const key=[s.team,s.minute,s.window,s.extraTime?"et":"",s.concussion?"conc":""].join("|");
      acc[key]=acc[key]||{...s,kind:"subWindow",norm:normalizeGoalMinute(s.minute,match),changes:[]};
      acc[key].changes.push(s); return acc;
    },{}));
    const yellowEvs=(match.yellows||[]).map(y=>({...y,kind:"yellow",norm:normalizeGoalMinute(y.minute,match)}));
    const events=[
      ...goals.map(g=>({...g,kind:"goal",norm:normalizeGoalMinute(g.minute,match)})),
      ...subWindows,...yellowEvs
    ].sort((a,b)=>a.norm.value-b.norm.value);
    timeline.innerHTML=`<div class="goal-event rounded-2xl bg-slate-100/80 px-4 py-3 text-sm font-semibold text-slate-500">Apito inicial · Partida encerrada.</div>`;
    let hg=0, ag=0;
    const evWithScore=events.map(ev=>{
      if(ev.kind==="goal"){ if(ev.team===match.home) hg++; else ag++; }
      return {...ev, _hg:hg, _ag:ag};
    });
    evWithScore.forEach(ev=>{
      if(ev.kind==="goal"){
        timeline.insertAdjacentHTML("afterbegin",`<div class="goal-event rounded-2xl bg-white/80 border border-white/80 px-4 py-3 shadow-glass">
          <div class="flex items-start gap-3">
            <div class="grid place-items-center w-9 h-9 rounded-full bg-mxgreen/12 text-mxgreen font-extrabold">⚽</div>
            <div><div class="font-extrabold text-slate-800">${ev.norm.display} — ${ev.player} marca para ${flag(ev.team)} ${ev.team}</div>
            <div class="text-sm text-slate-500">${ev.type}${ev.assist?` · assistência de ${ev.assist}`:""} · placar ${ev._hg} x ${ev._ag}</div></div>
          </div></div>`);
      } else if(ev.kind==="yellow"){
        timeline.insertAdjacentHTML("afterbegin",`<div class="goal-event rounded-2xl bg-white/80 border border-white/80 px-4 py-3 shadow-glass">
          <div class="flex items-start gap-3">
            <div class="grid place-items-center w-9 h-9 rounded-full bg-gold-500/15 text-gold-600 font-extrabold text-base">🟨</div>
            <div><div class="font-extrabold text-slate-800">${ev.norm.display} — ${ev.player} recebe cartão amarelo</div>
            <div class="text-sm text-slate-500">${flag(ev.team)} ${ev.team}</div></div>
          </div></div>`);
      } else {
        const note=ev.concussion?"substituição extra":ev.extraTime?"troca na prorrogação":ev.window==="intervalo"?"troca no intervalo":`janela ${ev.window}`;
        timeline.insertAdjacentHTML("afterbegin",`<div class="goal-event rounded-2xl bg-white/80 border border-white/80 px-4 py-3 shadow-glass">
          <div class="flex items-start gap-3">
            <div class="grid place-items-center w-9 h-9 rounded-full bg-usablue/10 text-usablue font-extrabold">${ic('repeat-2','w-4 h-4')}</div>
            <div><div class="font-extrabold text-slate-800">${ev.norm.display} — ${flag(ev.team)} ${ev.team} mexe no time</div>
            <div class="text-sm text-slate-500">${note}</div></div>
          </div></div>`);
      }
    });
  }

  markSimulatedMatchComplete(match);

  if(match.penalties){
    if(infoGrid) infoGrid.classList.remove("hidden");
    const sh=match.penalties;
    if(pkMount) pkMount.innerHTML=`<div class="glass rounded-2xl p-5 text-center">
      <div class="text-[11px] uppercase tracking-widest font-extrabold text-slate-400 mb-3 flex items-center justify-center gap-2">${ic('target','w-4 h-4 text-usared')} Disputa de pênaltis</div>
      <div class="font-display font-extrabold text-4xl tnum">${sh.homeScore} <span class="text-slate-300 px-2">x</span> ${sh.awayScore}</div>
      <div class="mt-3 font-extrabold text-lg text-mxgreen">${flag(sh.winner)} ${sh.winner} avança!</div>
      <div class="mt-2 text-sm text-slate-500">(no tempo normal: ${match.ga}–${match.gb})</div></div>`;
    if(summary) summary.innerHTML=`${flag(sh.winner)} <b>${sh.winner}</b> avança nos pênaltis por <b>${sh.homeScore} x ${sh.awayScore}</b> (no tempo normal, ${match.ga}–${match.gb}).`;
    const fav=getFavoriteTeam(); const favPlayed=match.home===fav||match.away===fav;
    if(favPlayed && sh.winner===fav) celebrateConfetti();
  } else {
    if(infoGrid) infoGrid.classList.remove("hidden");
    if(pkMount) pkMount.innerHTML="";
    const fav=getFavoriteTeam(); const favPlayed=match.home===fav||match.away===fav;
    const favWon=favPlayed&&getMatchWinnerTeam(match)===fav;
    if(summary) summary.innerHTML=`${flag(match.winner?.team||getMatchWinnerTeam(match)||match.home)} <b>${match.winner?.team||getMatchWinnerTeam(match)||"Empate"}</b> ${getMatchWinnerTeam(match)?"vence a partida":"fica no empate"} por <b>${scoreLine(match)}</b> em ${match.city}.${favPlayed?(favWon?" Sua seleção venceu este capítulo da jornada.":" Sua seleção não venceu este jogo."):""}`;
    if(favPlayed&&favWon) celebrateConfetti();
  }
  paintIcons();
}

function markSimulatedMatchComplete(match){
  const item=appState.currentSimulatedMatch;
  if(item && item.match===match){
    item.finished=true;
    if(typeof markCalendarMatchWatched==="function") markCalendarMatchWatched(activeRecord(), match);
    if((item.journeyIndex|0) >= 0) markMatchRevealed(activeRecord(), item.journeyIndex);
  }
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
  const simJourneyIdx = appState.currentSimulatedMatch?.journeyIndex;
  const simTactic = (rec0?.tactics && simJourneyIdx!=null) ? (rec0.tactics[simJourneyIdx] || null) : null;
  let halftimeOffered = resumeFrom >= 45;
  const goals = (match.goals||[]).map(g=>{
    let player = g.player;
    if(simTactic && g.team===favTeam){
      if(g.type==="de pênalti" && simTactic.penaltyTaker) player = simTactic.penaltyTaker;
      else if(g.type==="cobrança de falta" && simTactic.freeKickTaker) player = simTactic.freeKickTaker;
    }
    return {...g, player, kind:"goal", norm:normalizeGoalMinute(g.minute, match)};
  });
  const subWindows = Object.values((match.substitutions||[]).reduce((acc,s)=>{
    const key = [s.team, s.minute, s.window, s.extraTime ? "et" : "", s.concussion ? "conc" : ""].join("|");
    acc[key] = acc[key] || {...s, kind:"subWindow", norm:normalizeGoalMinute(s.minute, match), changes:[]};
    acc[key].changes.push(s);
    return acc;
  }, {}));
  const yellowEvs = (match.yellows||[]).map(y=>({...y, kind:"yellow", norm:normalizeGoalMinute(y.minute, match)}));
  const events = [...goals, ...subWindows, ...yellowEvs].sort((a,b)=>a.norm.value-b.norm.value || (a.kind==="goal" ? -1 : 1));
  let shown=0, homeGoals=0, awayGoals=0;
  const scoreEl=$("#simScore"), clockEl=$("#simClock"), progressEl=$("#simProgress"), timeline=$("#simTimeline"), summary=$("#simSummary");
  const homeSide=$("#simHomeSide"), awaySide=$("#simAwaySide"), phaseEl=$("#simPhase");
  const _subs = _lastConfirmedSubs; _lastConfirmedSubs = null;
  const resumeMsg = resumeFrom>0
    ? (_subs&&_subs.length
        ? `<div class="font-bold mb-1.5">Substituição${_subs.length>1?"ões":""} confirmada${_subs.length>1?"s":""} aos ${resumeFrom}′</div>`
          + _subs.map(s=>`<div class="flex items-center gap-1.5 mt-1"><span class="text-usared font-extrabold">↑</span> <span>${s.out}</span> <span class="text-slate-400 mx-0.5">→</span> <span class="text-mxgreen font-extrabold">↓</span> <span>${s.in}</span></div>`).join("")
        : `Substituição confirmada aos ${resumeFrom}'. A partida segue daqui.`)
    : "Apito inicial. A partida começa em ritmo acelerado.";
  timeline.innerHTML = `<div class="goal-event rounded-2xl bg-slate-100/80 px-4 py-3 text-sm font-semibold text-slate-500">${resumeMsg}</div>`;
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
      } else if(ev.kind==="yellow"){
        addEvent(`<div class="flex items-start gap-3">
          <div class="grid place-items-center w-9 h-9 rounded-full bg-gold-500/15 text-gold-600 font-extrabold text-base">🟨</div>
          <div>
            <div class="font-extrabold text-slate-800">${ev.norm.display} — ${ev.player} recebe cartão amarelo</div>
            <div class="text-sm text-slate-500">${flag(ev.team)} ${ev.team}</div>
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
      scoreEl.textContent=`${match.ga} x ${match.gb}`;
      clockEl.textContent=match.aet?"120'":"90'";
      phaseEl.textContent="Fim de jogo";
      progressEl.style.width="100%";
      const skipBtn=$("#skipMatchSim"); if(skipBtn) skipBtn.classList.add("hidden");
      // revela este jogo na jornada (idempotente; só avança o progresso)
      if(!match.penalties) markSimulatedMatchComplete(match);
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
// ---- mini-campo interativo para o painel de substituição ----
let _liveSubBenchSel = null;   // bench player seleccionado por clique

function buildSubMiniField(){
  if(!liveSubCtx) return "";
  const {fav, journeyIndex, baseField, benchPool, posOf:ctxPosOf} = liveSubCtx;
  const record = activeRecord(); if(!record) return "";
  const tactic = (record.tactics && record.tactics[journeyIndex]) || WC_LINEUPS.autoTactic(fav);
  const formation = tactic.formation || "4-3-3";
  const nums = String(formation).match(/\d+/g)?.map(Number) || [4,3,3];
  const sq = TEAMS[fav]?.sq; if(!sq) return "";
  const posOf = n => sq.find(p=>p[0]===n)?.[1] || ctxPosOf(n) || "MF";
  const distY = c => ({1:[50],2:[35,65],3:[25,50,75],4:[18,39,61,82],5:[14,32,50,68,86]})[c] || [18,39,61,82];
  const lines = nums.length >= 4
    ? [{pos:"GK",x:11,count:1},{pos:"DF",x:29,count:nums[0]},{pos:"MF",x:43,count:nums[1]},{pos:"MF",x:57,count:nums[2]},{pos:"FW",x:71,count:nums[3]}]
    : [{pos:"GK",x:11,count:1},{pos:"DF",x:30,count:nums[0]||4},{pos:"MF",x:50,count:nums[1]||3},{pos:"FW",x:69,count:nums[2]||3}];
  const slots = lines.flatMap(line => distY(line.count).map((y,i) => ({pos:line.pos, x:line.x, y, name:""})));
  const fp = tactic.positions || {};
  const placed = new Set();
  const fieldArr = [...baseField];
  fieldArr.forEach(name=>{
    const saved=fp[name]; if(!saved) return;
    const sl=slots.find(s=>!s.name && s.pos===(saved.pos||posOf(name)));
    if(sl){ sl.name=name; placed.add(name); }
  });
  fieldArr.forEach(name=>{
    if(placed.has(name)) return;
    const sl=slots.find(s=>!s.name && s.pos===posOf(name));
    if(sl){ sl.name=name; placed.add(name); }
  });
  fieldArr.forEach(name=>{
    if(placed.has(name)) return;
    const sl=slots.find(s=>!s.name);
    if(sl){ sl.name=name; placed.add(name); }
  });
  const outSet = new Set((liveSubDraft||[]).filter(r=>r.out).map(r=>r.out));
  const hasSel = !!_liveSubBenchSel;
  const playerDivs = slots.filter(s=>s.name).map(slot=>{
    const isOut = outSet.has(slot.name);
    const canDrop = slot.pos !== "GK";
    const parts = slot.name.split(" ");
    const surname = parts.slice(1).join(" ") || parts[0];
    const size = surname.length>12?"tiny":surname.length>9?"small":"";
    const toneClass = isOut ? "sub-out-player" : "pos-tone-"+slot.pos.toLowerCase();
    const dropAttrs = canDrop ? `data-field-name="${slot.name}" data-field-pos="${slot.pos}"` : "";
    const dropClass = canDrop ? "sub-drop-target" : "";
    const hoverClass = canDrop && hasSel ? "bench-click-hover" : "";
    return `<div class="lineup-drop-slot filled ${dropClass} ${hoverClass}" ${dropAttrs} style="left:${slot.x}%;top:${slot.y}%">
      <div class="lineup-field-player ${toneClass}">
        <span class="lineup-pos">${slot.pos}</span>
        <span class="lineup-name"><span class="lineup-surname ${size}">${surname}</span></span>
      </div>
    </div>`;
  }).join("");
  const inSet = new Set((liveSubDraft||[]).filter(r=>r.in).map(r=>r.in));
  const benchDivs = (benchPool||[]).slice(0,10).map(name=>{
    const isUsed = inSet.has(name);
    const isSel = _liveSubBenchSel === name;
    const pos = posOf(name);
    const parts = name.split(" ");
    const surname = parts.slice(1).join(" ") || parts[0];
    const size = surname.length>10?"tiny":surname.length>7?"small":"";
    return `<div class="sub-bench-slot ${isUsed?'is-used':''} ${isSel?'is-selected':''}" draggable="true" data-bench-name="${name}" title="${name}">
      <div class="lineup-field-player pos-tone-${pos.toLowerCase()}">
        <span class="lineup-pos">${pos}</span>
        <span class="lineup-name"><span class="lineup-surname ${size}">${surname}</span></span>
      </div>
    </div>`;
  }).join("");
  return `<div class="lineup-field-wrap sub-field-mini">
    <img class="lineup-field-img" src="public/assets/images/soccerfieldremaster.png" alt="">
    <div class="lineup-field-overlay">${playerDivs}</div>
    <div class="sub-field-badge">${formation}</div>
  </div>
  <div class="sub-bench-row">${benchDivs}</div>`;
}

function handleSubDrop(fieldPlayer, benchPlayer){
  if(!liveSubCtx || !liveSubDraft || !fieldPlayer || !benchPlayer) return;
  const {benchPool, posOf} = liveSubCtx;
  if(!benchPool.includes(benchPlayer)) return;
  if(posOf(fieldPlayer)==="GK") return;
  // don't allow if bench player already used in a different row
  if(liveSubDraft.some(r=>r.in===benchPlayer && r.out!==fieldPlayer)) return;
  const existing = liveSubDraft.find(r=>r.out===fieldPlayer);
  if(existing){ existing.in=benchPlayer; renderLiveSubPicker(); return; }
  const empty = liveSubDraft.find(r=>!r.out && !r.in);
  if(empty){ empty.out=fieldPlayer; empty.in=benchPlayer; renderLiveSubPicker(); return; }
  if(liveSubDraft.length < liveSubMaxRows()){ liveSubDraft.push({out:fieldPlayer, in:benchPlayer}); renderLiveSubPicker(); }
}

function createLiveSubDragGhost(name){
  const pos=liveSubCtx?.posOf?.(name) || "MF";
  const ghost=document.createElement("div");
  ghost.className="lineup-drag-ghost live-sub-drag-ghost";
  ghost.innerHTML=`<div class="lineup-field-player pos-tone-${pos.toLowerCase()}">
    <span class="lineup-pos">${pos}</span>
    <span class="lineup-name">${_lsNameCircle(name)}</span>
  </div>`;
  document.body.appendChild(ghost);
  return ghost;
}

function wireLiveSubDragAndDrop(){
  document.querySelectorAll("#liveSubMount [data-ls-bench='1'][draggable='true']").forEach(card=>{
    let pointerDrag=null;
    card.ondragstart=e=>{
      const name=card.dataset.lsPlayer;
      e.dataTransfer.effectAllowed="move";
      e.dataTransfer.setData("text/plain", name);
      card.classList.add("is-dragging");
      const ghost=createLiveSubDragGhost(name);
      if(e.dataTransfer.setDragImage) e.dataTransfer.setDragImage(ghost, 23, 23);
      setTimeout(()=>ghost.remove(),0);
    };
    card.ondragend=()=>card.classList.remove("is-dragging");
    card.onpointerdown=e=>{
      if(e.pointerType==="mouse") return;
      const name=card.dataset.lsPlayer;
      pointerDrag={name, moved:false, ghost:createLiveSubDragGhost(name)};
      card.setPointerCapture?.(e.pointerId);
      card.classList.add("is-dragging");
      pointerDrag.ghost.style.left=`${e.clientX-23}px`;
      pointerDrag.ghost.style.top=`${e.clientY-23}px`;
    };
    card.onpointermove=e=>{
      if(!pointerDrag) return;
      pointerDrag.moved=true;
      pointerDrag.ghost.style.left=`${e.clientX-23}px`;
      pointerDrag.ghost.style.top=`${e.clientY-23}px`;
    };
    card.onpointerup=e=>{
      if(!pointerDrag) return;
      const ghost=pointerDrag.ghost;
      ghost.style.display="none";
      const target=document.elementFromPoint(e.clientX,e.clientY)?.closest?.(".sub-drop-target[data-field-name]");
      ghost.remove();
      card.classList.remove("is-dragging");
      card.releasePointerCapture?.(e.pointerId);
      const benchName=pointerDrag.name;
      const moved=pointerDrag.moved;
      pointerDrag=null;
      if(target || moved) _liveSubSuppressClickUntil=Date.now()+350;
      if(target){
        handleSubDrop(target.dataset.fieldName, benchName);
        _liveSubFieldSel=null; _liveSubBenchSel=null;
      }
    };
    card.onpointercancel=()=>{
      if(pointerDrag?.ghost) pointerDrag.ghost.remove();
      pointerDrag=null;
      card.classList.remove("is-dragging");
    };
  });
  document.querySelectorAll("#liveSubMount .sub-drop-target[data-field-name]").forEach(slot=>{
    slot.ondragover=e=>{ e.preventDefault(); slot.classList.add("drag-over"); };
    slot.ondragleave=()=>slot.classList.remove("drag-over");
    slot.ondrop=e=>{
      e.preventDefault();
      slot.classList.remove("drag-over");
      const benchPlayer=e.dataTransfer.getData("text/plain");
      if(benchPlayer){
        handleSubDrop(slot.dataset.fieldName, benchPlayer);
        _liveSubFieldSel=null; _liveSubBenchSel=null;
      }
    };
  });
}

function startShootout(match){
  stopShootout();
  let sh=match.penalties; if(!sh) return;
  // Usa os jogadores de linha do XI escolhido pelo usuário como cobradores
  const fav=getFavoriteTeam(), record=activeRecord(), item=appState.currentSimulatedMatch;
  if(fav && record && item && (match.home===fav || match.away===fav)){
    const tactic=(record.tactics && record.tactics[item.journeyIndex]) || null;
    const lineup=(tactic?.starters||[]);
    if(lineup.length){
      const sq=TEAMS[fav]?.sq||[];
      const posOf=n=>sq.find(p=>p[0]===n)?.[1]||"MF";
      const ovrOf=n=>sq.find(p=>p[0]===n)?.[2]||70;
      const posOrd={FW:0,MF:1,DF:2,GK:9};
      const designatedPen = tactic?.penaltyTaker || "";
      const penOrder=lineup.filter(n=>posOf(n)!=="GK")
        .sort((a,b)=>{
          if(a===designatedPen) return -1;
          if(b===designatedPen) return 1;
          return (posOrd[posOf(a)]||0)-(posOrd[posOf(b)]||0)||ovrOf(b)-ovrOf(a);
        });
      if(penOrder.length){
        let ki=0;
        sh={...sh, kicks:sh.kicks.map(k=>{
          if(k.team!==fav) return k;
          const player=penOrder[ki++ % penOrder.length]||k.player;
          return {...k, player};
        })};
      }
    }
  }
  const mount=$("#pkMount"); if(!mount) return;
  const infoGrid=$("#simInfoGrid");
  if(infoGrid) infoGrid.classList.add("hidden");
  const home=match.home, away=match.away;
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
    markSimulatedMatchComplete(match);
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
let _liveSubListIdx = 0;                  // índice do carrossel de posições
let _liveSubFieldSel = null;              // jogador de campo selecionado para sair
let _lastConfirmedSubs = null;            // [{out,in}] da última janela confirmada
let _liveSubSuppressClickUntil = 0;

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
  liveSubDraft=null; liveSubCtx=null; _liveSubBenchSel=null;
  _liveSubListIdx=0; _liveSubFieldSel=null;
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
// ---- campo e carrossel para o painel de substituição (estilo planejador tático) ----
function _lsNameCircle(name){
  const parts=String(name||"").trim().split(/\s+/).filter(Boolean);
  const sz=s=>s.length>12?"tiny":s.length>9?"small":"";
  if(parts.length<=1) return `<span class="lineup-main ${sz(name)}">${name||""}</span>`;
  const first=`${parts[0][0]}.`;
  const surname=parts.slice(1).join(" ");
  return `<span class="lineup-initial">${first}</span><span class="lineup-surname ${sz(surname)}">${surname}</span>`;
}
function buildLiveSubField(){
  if(!liveSubCtx) return "";
  const {fav, journeyIndex, baseField, posOf:ctxPosOf} = liveSubCtx;
  const record=activeRecord(); if(!record) return "";
  const tactic=(record.tactics&&record.tactics[journeyIndex])||WC_LINEUPS.autoTactic(fav);
  const formation=tactic.formation||"4-3-3";
  const nums=String(formation).match(/\d+/g)?.map(Number)||[4,3,3];
  const sq=TEAMS[fav]?.sq; if(!sq) return "";
  const posOf=n=>sq.find(p=>p[0]===n)?.[1]||ctxPosOf(n)||"MF";
  const distY=c=>({1:[50],2:[35,65],3:[25,50,75],4:[18,39,61,82],5:[14,32,50,68,86]})[c]||[18,39,61,82];
  const lines=nums.length>=4
    ?[{pos:"GK",x:11,count:1},{pos:"DF",x:29,count:nums[0]},{pos:"MF",x:43,count:nums[1]},{pos:"MF",x:57,count:nums[2]},{pos:"FW",x:71,count:nums[3]}]
    :[{pos:"GK",x:11,count:1},{pos:"DF",x:30,count:nums[0]||4},{pos:"MF",x:50,count:nums[1]||3},{pos:"FW",x:69,count:nums[2]||3}];
  const slots=lines.flatMap(line=>distY(line.count).map((y)=>({pos:line.pos,x:line.x,y,name:""})));
  const fp=tactic.positions||{};
  const placed=new Set();
  const fieldArr=[...baseField];
  fieldArr.forEach(name=>{
    const saved=fp[name]; if(!saved) return;
    const sl=slots.find(s=>!s.name&&s.pos===(saved.pos||posOf(name)));
    if(sl){sl.name=name;placed.add(name);}
  });
  fieldArr.forEach(name=>{
    if(placed.has(name)) return;
    const sl=slots.find(s=>!s.name&&s.pos===posOf(name));
    if(sl){sl.name=name;placed.add(name);}
  });
  fieldArr.forEach(name=>{
    if(placed.has(name)) return;
    const sl=slots.find(s=>!s.name);
    if(sl){sl.name=name;placed.add(name);}
  });
  const outSet=new Set((liveSubDraft||[]).filter(r=>r.out).map(r=>r.out));
  const slotDivs=slots.filter(s=>s.name).map(slot=>{
    const isOut=outSet.has(slot.name);
    const isSel=_liveSubFieldSel===slot.name;
    const canInteract=slot.pos!=="GK";
    const toneClass=isOut?"sub-out-player":isSel?"ls-field-sel-bubble":"pos-tone-"+slot.pos.toLowerCase();
    const dataAttrs=canInteract?`data-field-name="${slot.name}" data-field-pos="${slot.pos}"`:"";
    const cls=`lineup-drop-slot filled${canInteract?" sub-drop-target":""}`;
    return `<div class="${cls}" ${dataAttrs} style="left:${slot.x}%;top:${slot.y}%;${canInteract?"cursor:pointer":""}">
      <div class="lineup-field-player ${toneClass}">
        <span class="lineup-pos">${slot.pos}</span>
        <span class="lineup-name">${_lsNameCircle(slot.name)}</span>
      </div>
    </div>`;
  }).join("");
  return `<div class="lineup-field-wrap">
    <img class="lineup-field-img" src="public/assets/images/soccerfieldremaster.png" alt="">
    <div class="lineup-field-overlay">${slotDivs}</div>
    <div class="ls-formation-badge">${formation}</div>
  </div>`;
}
function buildLiveSubCarousel(){
  if(!liveSubCtx) return "";
  const {fav, baseField, benchPool, posOf:ctxPosOf} = liveSubCtx;
  const sq=TEAMS[fav]?.sq||[];
  const posOf=n=>sq.find(p=>p[0]===n)?.[1]||ctxPosOf(n)||"MF";
  const inSet=new Set((liveSubDraft||[]).filter(r=>r.in).map(r=>r.in));
  const outSet=new Set((liveSubDraft||[]).filter(r=>r.out).map(r=>r.out));
  const i=Math.max(0,Math.min(_liveSubListIdx,POS_GROUPS.length-1));
  const group=POS_GROUPS[i];
  const posPlayers=benchPool.filter(name=>posOf(name)===group.pos);
  const cards=posPlayers.map(name=>{
    const isOnField=baseField.has(name);
    const isBench=benchPool.includes(name);
    const isGK=group.pos==="GK";
    const isOut=outSet.has(name);
    const isIn=inSet.has(name);
    const isFieldSel=_liveSubFieldSel===name;
    const isBenchSel=_liveSubBenchSel===name;
    const canInteract=!isGK&&!isOut&&!isIn&&(isBench||isOnField);
    let statusLabel, statusCls;
    if(isOut){statusLabel="Saindo";statusCls="ls-status-out";}
    else if(isIn){statusLabel="Entrando";statusCls="ls-status-in";}
    else if(isFieldSel){statusLabel="Selecionado · sai";statusCls="ls-status-sel";}
    else if(isBenchSel){statusLabel="Selecionado · entra";statusCls="ls-status-sel";}
    else if(isOnField){statusLabel="Titular";statusCls="ls-status-field";}
    else if(isBench){statusLabel="Reserva";statusCls="ls-status-bench";}
    else{statusLabel="Fora";statusCls="ls-status-bench";}
    let extraCls="";
    if(isFieldSel||isBenchSel) extraCls="ls-player-sel";
    else if(isOut||isIn) extraCls="ls-player-used";
    else if(!canInteract) extraCls="opacity-50 pointer-events-none";
    const icon=isOut?ic('arrow-up-from-line','w-3.5 h-3.5 flex-none')
      :isIn?ic('arrow-down-to-line','w-3.5 h-3.5 flex-none')
      :isFieldSel||isBenchSel?ic('check','w-3.5 h-3.5 flex-none'):"";
    return `<button type="button" class="ls-player-card pos-tone-${group.pos.toLowerCase()} ${extraCls}" draggable="${isBench&&!isIn&&!isOut?'true':'false'}"
      data-ls-player="${name}" data-ls-field="${isOnField?'1':''}" data-ls-bench="${isBench?'1':''}">
      <span class="ls-pos-badge">${group.pos}</span>
      <span class="min-w-0 flex-1">
        <span class="block font-bold text-sm truncate leading-tight">${name}</span>
        <span class="block text-[10px] uppercase tracking-wider font-extrabold ${statusCls}">${statusLabel}</span>
      </span>
      ${icon}
    </button>`;
  }).join("");
  return `<div class="lineup-player-carousel">
    <div class="flex items-center justify-between gap-3 mb-3">
      <button class="pos-carousel-btn" data-ls-dir="-1">${ic('chevron-left','w-4 h-4')}</button>
      <div class="text-center min-w-0">
        <div class="text-[10px] uppercase tracking-widest font-extrabold text-slate-400 mb-0.5">Banco de reservas</div>
        <div class="font-display font-extrabold text-lg leading-tight">${group.label}</div>
      </div>
      <button class="pos-carousel-btn" data-ls-dir="1">${ic('chevron-right','w-4 h-4')}</button>
    </div>
    <div class="flex justify-center gap-1.5 mb-3">
      ${POS_GROUPS.map((g,idx)=>`<button class="pos-carousel-dot ${idx===i?'active':''}" data-ls-dot="${idx}" title="${g.label}"></button>`).join("")}
    </div>
    <div class="space-y-2">${cards||`<div class="text-sm text-slate-400 py-2 text-center font-semibold">Nenhum jogador</div>`}</div>
  </div>`;
}
function renderLiveSubPicker(){
  if(!liveSubCtx) return;
  const mount=$("#liveSubMount"); if(!mount) return;
  const {mode, subMinute, totalMax, info, blockedReason} = liveSubCtx;
  const isHalf=mode==="halftime";
  const maxRows=liveSubMaxRows();
  const readyRows=liveSubDraft.filter(r=>r.out&&r.in);
  const counter=`${info.total}/${totalMax} trocas · ${info.inPlayWindows}/${LIVE_SUB_INPLAY_WINDOWS} paradas`;
  const hint=_liveSubBenchSel
    ? `${ic('arrow-down-to-line','w-3.5 h-3.5 text-usablue inline-block mr-1')}<b>${_liveSubBenchSel}</b> — agora clique em quem sai`
    : _liveSubFieldSel
    ? `${ic('arrow-up-from-line','w-3.5 h-3.5 text-amber-500 inline-block mr-1')}<b>${_liveSubFieldSel}</b> sai — clique em quem entra`
    : isHalf
    ? "Selecione quem entra e quem sai no intervalo."
    : "Clique num reserva para selecionar quem entra, depois clique em quem sai.";
  const pendingHtml=readyRows.length?`<div class="space-y-1.5 mt-3">
    ${readyRows.map((r,i)=>`<div class="flex items-center gap-1.5 rounded-xl bg-emerald-50 border border-emerald-200 px-3 py-2 text-sm font-bold">
      <span class="flex-1 truncate text-slate-700">${r.out}</span>
      <span class="text-emerald-500 shrink-0">${ic('arrow-right','w-3.5 h-3.5')}</span>
      <span class="flex-1 truncate text-slate-700">${r.in}</span>
      <button class="ls-del-row w-5 h-5 grid place-items-center text-slate-400 hover:text-usared rounded-full shrink-0" data-ri="${i}">${ic('x','w-3 h-3')}</button>
    </div>`).join("")}
  </div>`:"";
  let rightPanel;
  if(blockedReason){
    const msg=blockedReason==="total"?"Você já usou todas as substituições.":"Você já usou as 3 paradas permitidas (fora o intervalo).";
    rightPanel=`<div class="p-4">
      <div class="text-sm font-semibold text-slate-500 mb-3">${msg}</div>
      <button id="liveSubGo" class="btn-premium text-white rounded-2xl px-5 py-2.5 font-bold w-full">${isHalf?'Continuar 2º tempo':'Continuar jogo'}</button>
    </div>`;
  } else {
    rightPanel=`<div class="p-4 flex flex-col gap-3">
      ${buildLiveSubCarousel()}
      <div class="text-[11px] text-slate-400 font-semibold leading-snug px-1">${hint}</div>
      ${pendingHtml}
      <div class="flex gap-2 pt-1">
        <button id="liveSubCancel" class="glass rounded-2xl px-4 py-2.5 font-bold text-slate-600 flex-none">${isHalf?'Sem trocas':'Cancelar'}</button>
        <button id="liveSubConfirm" class="btn-premium text-white rounded-2xl px-5 py-2.5 font-extrabold flex-1 ${(isHalf||readyRows.length)?'':'opacity-40 pointer-events-none'}">${isHalf?'Continuar 2º tempo':readyRows.length>1?'Confirmar '+readyRows.length+' trocas':'Confirmar troca'}</button>
      </div>
    </div>`;
  }
  mount.innerHTML=`
    <div class="guided-card rounded-3xl border-2 overflow-hidden ${isHalf?'border-gold-400/50':'border-usablue/30'}">
      <div class="flex items-center justify-between px-4 pt-4 pb-2 gap-2">
        <div class="font-display font-extrabold text-lg flex items-center gap-2 min-w-0">
          ${ic(isHalf?'coffee':'repeat-2',(isHalf?'w-5 h-5 text-gold-600':'w-5 h-5 text-usablue')+' flex-none')}
          <span class="truncate">${isHalf?'Intervalo · 1º tempo encerrado':'Substituições — '+subMinute+"'"}</span>
        </div>
        <div class="flex items-center gap-2 flex-none">
          <div class="text-[11px] font-extrabold rounded-full px-2 py-0.5 ${info.total>=totalMax?'text-usared bg-usared/10':'text-slate-500 bg-slate-100'}">${counter}</div>
          <button id="liveSubClose" class="w-8 h-8 grid place-items-center rounded-full bg-slate-100 text-slate-500 hover:bg-usared/10 hover:text-usared font-bold" title="${isHalf?'Continuar sem trocas':'Cancelar e continuar o jogo'}">✕</button>
        </div>
      </div>
      <div class="ls-planner-layout">
        <div class="ls-field-col p-4">${buildLiveSubField()}</div>
        <div class="ls-carousel-col">${rightPanel}</div>
      </div>
    </div>`;
  paintIcons();
  if($("#liveSubClose")) $("#liveSubClose").onclick=cancelLiveSub;
  if($("#liveSubGo")) $("#liveSubGo").onclick=cancelLiveSub;
  if($("#liveSubCancel")) $("#liveSubCancel").onclick=cancelLiveSub;
  if($("#liveSubConfirm")) $("#liveSubConfirm").onclick=()=>(liveSubDraft.some(r=>r.out&&r.in)?confirmLiveSubs():cancelLiveSub());
  document.querySelectorAll("#liveSubMount .ls-del-row").forEach(b=>{
    b.onclick=()=>{
      liveSubDraft.splice(Number(b.dataset.ri),1);
      if(!liveSubDraft.length) liveSubDraft.push({out:"",in:""});
      renderLiveSubPicker();
    };
  });
  document.querySelectorAll("#liveSubMount [data-ls-dir]").forEach(btn=>{
    btn.onclick=()=>{ _liveSubListIdx=(POS_GROUPS.length+_liveSubListIdx+Number(btn.dataset.lsDir))%POS_GROUPS.length; renderLiveSubPicker(); };
  });
  document.querySelectorAll("#liveSubMount [data-ls-dot]").forEach(btn=>{
    btn.onclick=()=>{ _liveSubListIdx=Number(btn.dataset.lsDot); renderLiveSubPicker(); };
  });
  document.querySelectorAll("#liveSubMount [data-ls-player]").forEach(card=>{
    card.onclick=()=>{
      if(Date.now()<_liveSubSuppressClickUntil) return;
      if(card.classList.contains("is-dragging")) return;
      const name=card.dataset.lsPlayer;
      const isBench=card.dataset.lsBench==="1";
      const isField=card.dataset.lsField==="1";
      if(isBench){
        if(_liveSubFieldSel){
          handleSubDrop(_liveSubFieldSel,name);
          _liveSubFieldSel=null; _liveSubBenchSel=null;
        } else {
          _liveSubBenchSel=(_liveSubBenchSel===name)?null:name;
          renderLiveSubPicker();
        }
      } else if(isField){
        if(_liveSubBenchSel){
          handleSubDrop(name,_liveSubBenchSel);
          _liveSubFieldSel=null; _liveSubBenchSel=null;
        } else {
          _liveSubFieldSel=(_liveSubFieldSel===name)?null:name;
          renderLiveSubPicker();
        }
      }
    };
  });
  document.querySelectorAll("#liveSubMount .sub-drop-target[data-field-name]").forEach(slot=>{
    slot.onclick=()=>{
      const fieldPlayer=slot.dataset.fieldName;
      if(_liveSubBenchSel){
        handleSubDrop(fieldPlayer,_liveSubBenchSel);
        _liveSubFieldSel=null; _liveSubBenchSel=null;
      } else {
        _liveSubFieldSel=(_liveSubFieldSel===fieldPlayer)?null:fieldPlayer;
        renderLiveSubPicker();
      }
    };
  });
  wireLiveSubDragAndDrop();
  mount.scrollIntoView({behavior:"smooth",block:"nearest"});
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
  _lastConfirmedSubs = picks.map(p=>({out:p.out, in:p.in}));
  clearLiveSubPicker();
  if(fresh){ appState.currentSimulatedMatch={match:fresh, journeyIndex, minute:resumeMinute}; simulateMatch(fresh, Math.max(0, resumeMinute)); }
}

/* ---- NARRATIVE ---- */

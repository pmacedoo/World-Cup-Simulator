"use strict";

let journeyNewsTimer = null;

function startNewSimulation(){
  appState.draftTeam=null; appState.teamSearch=""; appState.view="picker-team";
  renderTeamPickerIntro();
}
// cria uma nova simulação (seleção + tipo), salva e entra na jornada
function commitSimulation(team, type){
  flashLoader();
  createSimulation(team, type);
  appState.view="journey";
  setTimeout(()=>renderFavoriteTeamJourney(), 320);
}
// "trocar tipo": gera uma NOVA simulação com a mesma seleção e outro tom
function changeSimulationType(){
  appState.draftTeam=getFavoriteTeam();
  appState.view="picker-type";
  renderSimulationTypePicker();
}
// "trocar seleção": começa uma nova simulação do zero
function changeFavoriteTeam(){ startNewSimulation(); }
// reinicia o PROGRESSO da simulação ativa (revive a campanha do zero)
function resetGuidedExperience(){
  const r=activeRecord();
  if(r){ r.revealed=0; r.watchIndex=0; r.calendarDayIndex=0; r.journeyMinute=300; r.watchedMatchNos=[]; r.finished=false; r.dashboardUnlocked=false; r.dayPhase="morning"; persistSims(); }
  appState.view="journey";
  renderFavoriteTeamJourney();
}
function advanceObserverMatch(){
  const r=activeRecord();
  if(!r) return;
  const ctx=journeyVisibleContext(r);
  if(!ctx.observerMode || ctx.finished) return;
  r.watchIndex = Math.min(ctx.watchMatches.length, (r.watchIndex||0)+1);
  r.dayPhase = "night";
  persistSims();
  renderFavoriteTeamJourney();
}
function openFullDashboard(){
  const r=activeRecord(); if(r){ r.dashboardUnlocked=true; persistSims(); }
  appState.view="dashboard";
  renderFullDashboard();
}
function renderIntroNav(step){
  const steps=[["team-picker","Seleção"],["type-picker","Tipo"],["journey","Jornada"],["dashboard","Dashboard"]];
  const isDark=appState.darkMode;
  return `<div class="guided-top-nav max-w-7xl mx-auto flex items-center justify-between gap-4 mb-8 guided-enter">
    <div class="flex items-center gap-2.5">
      <span class="grid place-items-center w-10 h-10 rounded-2xl text-white text-sm font-extrabold" style="background:var(--grad-2026)">26</span>
      <div>
        <div class="font-display font-extrabold leading-tight">Copa 2026 · Jornada guiada</div>
        <div class="text-xs text-slate-500 font-semibold">Viva primeiro a campanha da sua seleção</div>
      </div>
    </div>
    <div class="flex items-center gap-2">
      <div class="hidden sm:flex items-center gap-2">
        ${steps.map(([id,label],i)=>`<span class="px-3 py-1.5 rounded-full text-xs font-extrabold ${id===step?'bg-ink text-white':'glass text-slate-500'}">${i+1}. ${label}</span>`).join("")}
      </div>
      <button class="dark-mode-toggle guided-dark-toggle grid place-items-center w-9 h-9 rounded-xl glass shrink-0" title="${isDark?'Modo claro':'Modo escuro'}" aria-label="Alternar modo escuro">
        ${ic(isDark?'sun':'moon','w-4 h-4')}
      </button>
    </div>
  </div>`;
}
function statusPill(status){
  const color = status==="Favorita"?"text-gold-600 bg-gold-500/15":status==="Anfitriã"?"text-usablue bg-usablue/10":status==="Zebra"?"text-usared bg-usared/10":"text-mxgreen bg-mxgreen/10";
  return `<span class="text-[10px] font-extrabold uppercase tracking-wider px-2 py-1 rounded-full ${color}">${status}</span>`;
}
function getMatchWinnerTeam(m){
  if(!m) return null;
  if(m.winner?.team) return m.winner.team;
  if(m.ga>m.gb) return m.home;
  if(m.gb>m.ga) return m.away;
  return null;
}
function getTeamMatches(sim, teamName){
  if(!sim || !teamName) return [];
  const groupMatches = sim.groups.flatMap(g=>g.matches);
  const knockoutMatches = [
    ...sim.knockout.R32,...sim.knockout.R16,...sim.knockout.QF,...sim.knockout.SF,
    sim.knockout.third, sim.knockout.final
  ];
  return [...groupMatches,...knockoutMatches]
    .filter(m=>m.home===teamName || m.away===teamName)
    .map((m,i)=>({
      ...m,
      journeyIndex:i,
      favoriteSide:m.home===teamName?"home":"away",
      favoriteWon:getMatchWinnerTeam(m)===teamName,
      favoriteDrew:!getMatchWinnerTeam(m),
      opponent:m.home===teamName?m.away:m.home,
    }));
}
function allTournamentMatches(sim){
  if(!sim) return [];
  return [
    ...sim.groups.flatMap(g=>g.matches),
    ...sim.knockout.R32,
    ...sim.knockout.R16,
    ...sim.knockout.QF,
    ...sim.knockout.SF,
    sim.knockout.third,
    sim.knockout.final,
  ].filter(Boolean).slice().sort((a,b)=>(a.matchNo||999)-(b.matchNo||999));
}
function tournamentDays(sim){
  const groups = new Map();
  allTournamentMatches(sim).forEach(m=>{
    const key=m.dateISO || `match-${m.matchNo||0}`;
    if(!groups.has(key)) groups.set(key, {dateISO:key, dateLabel:m.dateLabel || m.kickoff || "Data a definir", matches:[]});
    groups.get(key).matches.push(m);
  });
  return [...groups.values()]
    .sort((a,b)=>String(a.dateISO).localeCompare(String(b.dateISO)))
    .map((d,i)=>({...d, dayIndex:i, matches:d.matches.sort((a,b)=>(a.matchNo||999)-(b.matchNo||999))}));
}
function parseMatchMinute(time){
  const text=String(time||"").trim().toLowerCase();
  const m=text.match(/(\d{1,2})h(?:(\d{2}))?/);
  if(!m) return 12*60;
  return Math.max(0, Math.min(1439, (Number(m[1])%24)*60 + Number(m[2]||0)));
}
function formatJourneyMinute(minute){
  const m=Math.max(0, Math.min(1439, minute|0));
  return `${String(Math.floor(m/60)).padStart(2,"0")}:${String(m%60).padStart(2,"0")}`;
}
function daysBetweenISO(fromISO, toISO){
  if(!fromISO || !toISO) return null;
  const from=Date.parse(`${fromISO}T00:00:00`);
  const to=Date.parse(`${toISO}T00:00:00`);
  if(!Number.isFinite(from) || !Number.isFinite(to)) return null;
  return Math.max(0, Math.round((to-from)/86400000));
}
function periodForMinute(minute){
  return minute>=300 && minute<1080 ? "day" : "night";
}
function dayPhaseForMinute(minute){
  return periodForMinute(minute)==="day" ? "morning" : "night";
}
function absoluteJourneyMinute(dayIndex, minute){
  return Math.max(0, dayIndex|0)*1440 + Math.max(0, Math.min(1439, minute|0));
}
function matchesWithAbsoluteMinutes(days){
  return (days||[]).flatMap((day,dayIndex)=>(day.matches||[]).map(match=>({
    match,
    dayIndex,
    minute:parseMatchMinute(match.time),
    abs:absoluteJourneyMinute(dayIndex, parseMatchMinute(match.time)),
  }))).sort((a,b)=>a.abs-b.abs || (a.match.matchNo||999)-(b.match.matchNo||999));
}
function skyVarsForMinute(minute){
  const m=((minute%1440)+1440)%1440;
  let dayStrength=0;
  if(m>=300 && m<480) dayStrength=(m-300)/180;
  else if(m>=480 && m<900) dayStrength=1;
  else if(m>=900 && m<1080) dayStrength=.25 + (1 - (m-900)/180) * .75;
  let nightStrength=0;
  if(m>=1080) nightStrength=(m-1080)/360;
  else if(m<300) nightStrength=1 - m/300;
  const skyTop = dayStrength>.72 ? "#fbfdff" : dayStrength>.25 ? "#dbeafe" : nightStrength>.72 ? "#07111f" : "#64748b";
  const skyBottom = dayStrength>.72 ? "#eef5fb" : dayStrength>.25 ? "#cbd5e1" : nightStrength>.72 ? "#111827" : "#475569";
  return `--sky-top:${skyTop};--sky-bottom:${skyBottom};--sky-day:${dayStrength.toFixed(3)};--sky-night:${nightStrength.toFixed(3)};`;
}
function matchFavoriteIndex(match, favoriteMatches){
  return favoriteMatches.findIndex(m=>m.matchNo===match.matchNo);
}
function nextFavoriteCalendarMatch(ctx){
  return matchesWithAbsoluteMinutes(ctx.days)
    .filter(x=>x.match.home===ctx.team || x.match.away===ctx.team)
    .filter(x=>!hasWatchedMatch(activeRecord(), x.match))
    .find(x=>x.abs>=absoluteJourneyMinute(ctx.calendarDayIndex, ctx.journeyMinute)) || null;
}
function hasWatchedMatch(record, match){
  return !!match?.matchNo && (record.watchedMatchNos||[]).includes(match.matchNo);
}
function markCalendarMatchWatched(record, match){
  if(!record || !match?.matchNo) return;
  appState.clockAdvance = null;
  record.watchedMatchNos = [...new Set([...(record.watchedMatchNos||[]), match.matchNo])];
  const minute=parseMatchMinute(match.time);
  const days=tournamentDays(simObjFor(record));
  const found=matchesWithAbsoluteMinutes(days).find(x=>x.match.matchNo===match.matchNo);
  const currentAbs=absoluteJourneyMinute(record.calendarDayIndex||0, record.journeyMinute??300);
  if(found && found.abs>=currentAbs){
    record.calendarDayIndex=found.dayIndex;
    record.journeyMinute=found.minute;
  } else {
    record.journeyMinute=Math.max(record.journeyMinute??300, minute);
  }
  record.dayPhase=dayPhaseForMinute(record.journeyMinute);
  persistSims();
}
function revealCalendarMatch(record, match){
  if(!record || !match?.matchNo) return;
  record.watchedMatchNos = [...new Set([...(record.watchedMatchNos||[]), match.matchNo])];
}
function observerMatchesAfterFavorite(sim, favoriteMatches){
  const last=favoriteMatches[favoriteMatches.length-1];
  if(!last) return allTournamentMatches(sim);
  return allTournamentMatches(sim).filter(m=>(m.matchNo||0)>(last.matchNo||0));
}
function matchTeamLine(match){
  if(!match) return "";
  return `${flag(match.home)} ${match.home} ${match.ga!=null?`<span class="tnum px-1.5">${scoreLine(match)}</span>`:"<span class=\"px-1.5 text-slate-400\">x</span>"} ${flag(match.away)} ${match.away}`;
}
function groupRowForTeam(sim, team){
  return sim.groups.flatMap(g=>g.table.map(r=>({...r, group:g.letter}))).find(r=>r.team===team);
}
function campaignSummary(sim, team){
  const row=groupRowForTeam(sim,team);
  const matches=getTeamMatches(sim,team);
  const last=matches[matches.length-1];
  const knockoutLost = last && last.stage && !last.stage.includes("Grupo") && !last.favoriteWon;
  if(sim.champion===team) return {status:"champion", title:"Sua seleção é campeã do mundo!", text:`Campanha dourada: ${flag(team)} ${team} ergueu a taça depois de ${matches.length} jogos e uma final vencida contra ${sim.runnerUp}.`};
  if(knockoutLost) return {status:"eliminated", title:"A campanha terminou aqui.", text:`${flag(team)} ${team} caiu em ${last.stage}, contra ${flag(last.opponent)} ${last.opponent}, por ${scoreLine(last)}.`};
  if(row && row.status==="Eliminado") return {status:"eliminated", title:"Eliminação na fase de grupos.", text:`${flag(team)} ${team} terminou o Grupo ${row.group} em ${row.pos}º, com ${row.P} pontos e saldo ${row.SG>0?"+":""}${row.SG}.`};
  return {status:"alive", title:"Campanha em destaque.", text:`${flag(team)} ${team} fez uma campanha de ${matches.length} jogo(s), passando pelo Grupo ${row?.group||"?"} e deixando sua marca nesta simulação.`};
}
/* ---- Revelação progressiva sem spoilers ---- */
const KO_ORDER = {"16-avos":1,"Fase de 32":1,"Oitavas de final":2,"Quartas de final":3,"Semifinal":4,"Disputa de 3º lugar":4,"Final":5};
const isGroupStage = m => (m.stage||"").includes("Grupo");
// fronteira de mata-mata já vivida pela favorita (maior fase entre os jogos revelados)
function favoriteFrontierKO(matches, revealed){
  let f=0;
  for(let i=0;i<revealed && i<matches.length;i++){ const m=matches[i]; if(!isGroupStage(m)) f=Math.max(f, KO_ORDER[m.stage]||0); }
  return f;
}
// classificação parcial dos grupos contando só rodadas <= uptoRound
function partialStandings(sim, uptoRound){
  return sim.groups.map(g=>{
    const st={}; g.teams.forEach(t=> st[t]={team:t,P:0,J:0,V:0,E:0,D:0,GP:0,GC:0});
    g.matches.filter(m=>(m.round||0)<=uptoRound).forEach(m=>{
      const A=st[m.home], B=st[m.away]; if(!A||!B) return;
      A.J++;B.J++;A.GP+=m.ga;A.GC+=m.gb;B.GP+=m.gb;B.GC+=m.ga;
      if(m.ga>m.gb){A.V++;B.D++;A.P+=3;} else if(m.ga<m.gb){B.V++;A.D++;B.P+=3;} else {A.E++;B.E++;A.P++;B.P++;}
    });
    const table=Object.values(st).map(r=>({...r,SG:r.GP-r.GC,ovr:TEAMS[r.team].ovr}))
      .sort((a,b)=>b.P-a.P||b.SG-a.SG||b.GP-a.GP||b.ovr-a.ovr);
    table.forEach((r,i)=>r.pos=i+1);
    return {letter:g.letter, table, played:uptoRound};
  });
}
function compactGroupCard(g, favTeam){
  return `<div class="glass rounded-2xl p-3 shadow-glass">
    <div class="flex items-center justify-between mb-1.5"><div class="font-display font-extrabold text-sm">Grupo ${g.letter}</div><div class="text-[10px] text-slate-400 font-bold">${g.played}/3</div></div>
    <table class="w-full text-xs"><tbody>
      ${g.table.map(r=>`<tr class="${r.team===favTeam?'font-extrabold text-ink':'text-slate-600'}">
        <td class="py-0.5 w-4 ${rowDot(r.pos,r.pos===3)==='bg-mxgreen'?'text-mxgreen':'text-slate-400'} tnum">${r.pos}</td>
        <td class="py-0.5"><span class="inline-flex items-center gap-1.5">${flag(r.team)}<span>${r.team}</span></span></td>
        <td class="py-0.5 text-right tnum text-slate-400">${r.J}j</td>
        <td class="py-0.5 text-right tnum font-extrabold">${r.P}</td>
        <td class="py-0.5 text-right tnum ${r.SG>0?'text-mxgreen':r.SG<0?'text-usared':'text-slate-400'}">${r.SG>0?'+':''}${r.SG}</td>
      </tr>`).join("")}
    </tbody></table>
  </div>`;
}
// modal de "situação da Copa neste momento" (grupos parciais ou chave parcial)
function showSnapshotModal(title, body){
  let modal=$("#snapshotModal");
  if(!modal){
    modal=el("div","fixed inset-0 z-[75] hidden items-center justify-center p-3 sm:p-5");
    modal.id="snapshotModal";
    modal.innerHTML=`<div class="absolute inset-0 bg-ink/55 backdrop-blur-xl" data-close></div>
      <div id="snapshotBox" class="relative guided-card rounded-[2rem] shadow-lift w-full max-w-5xl max-h-[92vh] overflow-y-auto p-5 sm:p-7 swap"></div>`;
    document.body.appendChild(modal);
    modal.addEventListener("click",e=>{ if(e.target.dataset.close!==undefined){ modal.classList.add("hidden"); modal.classList.remove("flex"); } });
  }
  $("#snapshotBox").innerHTML=`
    <button class="absolute top-4 right-4 text-slate-400 hover:text-ink" data-close>✕</button>
    <div class="text-[11px] uppercase tracking-widest font-extrabold text-slate-400">Situação da Copa</div>
    <h3 class="font-display font-extrabold text-2xl mb-4">${title}</h3>
    ${body}`;
  $("#snapshotBox").querySelector("[data-close]").onclick=()=>{ modal.classList.add("hidden"); modal.classList.remove("flex"); };
  modal.classList.remove("hidden"); modal.classList.add("flex");
  paintIcons();
}
function openSnapshot(kind, journeyIndex){
  const record=activeRecord(); const sim=simObjFor(record); const team=record.favoriteTeam;
  const matches=getTeamMatches(sim,team); const m=matches[journeyIndex]; if(!m) return;
  let title="", body="";
  if(kind==="groups"){
    const uptoRound = isGroupStage(m) ? (m.round||1) : 3;
    const groups=partialStandings(sim, uptoRound);
    title = isGroupStage(m) ? `Grupos após a Rodada ${uptoRound}` : "Classificação final dos grupos";
    body = `<div class="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">${groups.map(g=>compactGroupCard(g,team)).join("")}</div>`;
  } else {
    if(isGroupStage(m)){
      title="Chaveamento";
      body=`<div class="glass rounded-2xl p-8 text-center text-slate-500 font-semibold">O mata-mata ainda não começou — sua seleção está na fase de grupos.</div>`;
    } else {
      const frontier=favoriteFrontierKO(matches, journeyIndex+1);
      const favNos=new Set(matches.slice(0,journeyIndex+1).filter(x=>!isGroupStage(x)).map(x=>x.matchNo));
      // rodadas já decididas + jogos da favorita = placar; rodada atual = confronto sem placar; rodadas futuras = "A definir"
      const modeFn = mm => {
        const o=KO_ORDER[mm.stage]||9;
        if(favNos.has(mm.matchNo) || o<frontier) return 'full';
        if(o===frontier) return 'teams';
        return 'locked';
      };
      title="Chaveamento até este momento";
      body = `<p class="text-sm text-slate-500 mb-3">Rodadas decididas aparecem com o placar; a rodada atual mostra os confrontos sem resultado; rodadas futuras ficam como <b>“A definir”</b> para não estragar a surpresa.</p>${buildBracketHTML(sim, null, modeFn)}`;
    }
  }
  showSnapshotModal(title, body);
}
function openDaySnapshot(kind){
  const record=activeRecord(); if(!record) return;
  const ctx=journeyVisibleContext(record);
  const {sim, team, matches, revealed, dayPhase, nextMatch, currentRound, observerMode, watchedMatches, nextWatchMatch}=ctx;
  let title="", body="";
  if(kind==="groups"){
    const uptoRound = dayPhase==="morning" ? currentRound : Math.max(currentRound, 0);
    const groups=partialStandings(sim, uptoRound);
    title = uptoRound ? `Grupos no estado do dia · Rodada ${uptoRound}` : "Grupos antes da estreia";
    body = `<p class="text-sm text-slate-500 mb-3">Mostra apenas o estado já vivido na jornada, sem antecipar o próximo jogo da sua seleção.</p>
      <div class="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">${groups.map(g=>compactGroupCard(g,team)).join("")}</div>`;
  } else {
    const revealedMatches=observerMode ? [...matches.slice(0,revealed), ...watchedMatches] : matches.slice(0,revealed);
    const targetMatch=observerMode ? nextWatchMatch : nextMatch;
    const nextKO = targetMatch && !isGroupStage(targetMatch);
    const frontier = nextKO ? (KO_ORDER[targetMatch.stage]||1) : favoriteFrontierKO(matches, revealed);
    const favNos=new Set(revealedMatches.filter(x=>!isGroupStage(x)).map(x=>x.matchNo));
    if(!frontier){
      title="Chaveamento do dia";
      body=`<div class="glass rounded-2xl p-8 text-center text-slate-500 font-semibold">O mata-mata ainda não começou no estado atual da jornada. Quando a Copa chegar lá, este painel mostra a chave sem entregar resultados futuros.</div>`;
    } else {
      const modeFn = mm => {
        const o=KO_ORDER[mm.stage]||9;
        if(favNos.has(mm.matchNo) || o<frontier) return 'full';
        if(o===frontier) return 'teams';
        return 'locked';
      };
      title="Chaveamento no estado do dia";
      body = `<p class="text-sm text-slate-500 mb-3">Rodadas já vividas aparecem com placar; o momento atual mostra confrontos sem resultado; fases futuras ficam como <b>“A definir”</b>.</p>${buildBracketHTML(sim, null, modeFn)}`;
    }
  }
  showSnapshotModal(title, body);
}
function daySnapshotButtons(){
  return `<div class="mt-3 grid grid-cols-2 gap-2">
    <button class="day-snap-btn glass rounded-xl px-3 py-2 text-xs font-extrabold text-slate-600 flex items-center justify-center gap-1.5" data-snap="groups">${ic('table-2','w-3.5 h-3.5')} Grupos agora</button>
    <button class="day-snap-btn glass rounded-xl px-3 py-2 text-xs font-extrabold text-slate-600 flex items-center justify-center gap-1.5" data-snap="bracket">${ic('git-fork','w-3.5 h-3.5')} Chaveamento agora</button>
  </div>`;
}
// lista da campanha revelada progressivamente (sem spoilers de jogos futuros)
function progressiveCampaign(record){
  const sim=simObjFor(record), team=record.favoriteTeam;
  const matches=getTeamMatches(sim,team);
  if(!matches.length) return `<div class="glass rounded-3xl p-6 text-slate-500 font-semibold">Nenhum jogo encontrado.</div>`;
  const revealed=Math.min(record.revealed, matches.length);
  let html=`<div class="journey-rail space-y-3">`;
  for(let i=0;i<revealed;i++){
    const m=matches[i];
    html+=`<div class="journey-match-card glass rounded-3xl p-4 pl-14 shadow-glass ${m.favoriteWon?'border-mxgreen/20':''}">
      <div class="absolute left-[13px] top-5 grid place-items-center w-10 h-10 rounded-full bg-white shadow-glass border border-white/80 font-extrabold text-xs ${m.favoriteWon?'text-mxgreen':m.favoriteDrew?'text-slate-500':'text-usared'}">${i+1}</div>
      <div class="text-[11px] uppercase tracking-wider font-extrabold text-slate-400">${m.matchNo?`M${m.matchNo} · `:''}${m.stage} · ${m.kickoff || m.city}</div>
      <div class="mt-1 font-display font-extrabold text-lg flex flex-wrap items-center gap-2">${flag(m.home)} ${m.home} <span class="px-2 py-0.5 rounded-xl bg-ink text-white tnum">${scoreLine(m)}</span> ${flag(m.away)} ${m.away}</div>
      <div class="text-sm text-slate-500 mt-1">${m.goals.length?`${m.goals.length} gol(s): ${m.goals.slice(0,3).map(g=>`${g.minute}' ${g.player}`).join(" · ")}${m.goals.length>3?"...":""}`:"Sem gols no tempo jogado."}</div>
      <div class="mt-3 flex flex-wrap gap-2">
        <button class="replay-btn glass rounded-xl px-3 py-1.5 text-xs font-bold text-slate-600" data-idx="${i}">${ic('rotate-ccw','w-3.5 h-3.5')} Rever jogo</button>
      </div>
    </div>`;
  }
  if(revealed < matches.length){
    html+=`<div class="glass rounded-3xl p-5 text-slate-500 font-semibold">
      Os próximos jogos aparecem no card do dia. Aqui fica só o histórico da campanha e os replays.
    </div>`;
  } else {
    const cs=campaignSummary(sim,team);
    html+=`<div class="rounded-3xl p-5 ${cs.status==="champion"?'bg-gold-500/15 border border-gold-400/40':'bg-usared/10 border border-usared/20'}">
      <div class="font-display font-extrabold text-lg flex items-center gap-2">${ic(cs.status==="champion"?'trophy':'flag','w-5 h-5')} ${cs.title}</div>
      <p class="mt-1 text-slate-600 leading-relaxed">${cs.text}</p>
    </div>`;
  }
  html+=`</div>`;
  return html;
}
// painel lateral "Minhas simulações" (trocar / excluir / nova)
function savedSimsPanel(){
  return `<div class="text-[10px] uppercase tracking-widest font-extrabold text-slate-400 mb-2 mt-6">Minhas simulações</div>
    <div class="journey-scroll-list saved-sims-scroll space-y-2">
      ${appState.sims.map(r=>{ const p=profileFor(r.type); const active=r.id===appState.activeId;
        return `<div class="flex items-center gap-2 rounded-2xl p-2.5 ${active?'bg-ink text-white':'glass'}">
          <span class="flex-none">${flag(r.favoriteTeam,'flag-lg')}</span>
          <button class="switch-sim flex-1 text-left min-w-0" data-id="${r.id}">
            <div class="font-extrabold text-sm truncate ${active?'text-white':''}">${r.favoriteTeam}</div>
            <div class="text-[11px] ${active?'text-white/75':'text-slate-500'} truncate">${p.label} · ${r.finished?'concluída':`${r.revealed} jogo(s)`} · ${timeAgo(r.createdAt)}</div>
          </button>
          <button class="del-sim flex-none w-7 h-7 grid place-items-center rounded-full ${active?'text-white/70 hover:text-white':'text-slate-300 hover:text-usared'}" data-id="${r.id}" title="Excluir">${ic('trash-2','w-4 h-4')}</button>
        </div>`;
      }).join("")}
    </div>
    <button id="newSimFromJourney" class="mt-3 w-full glass rounded-2xl px-4 py-3 font-extrabold text-slate-700 flex items-center justify-center gap-2">${ic('plus','w-4 h-4')} Nova simulação</button>`;
}
function favoriteGroup(sim, team){
  return sim.groups.find(g=>g.teams.includes(team)) || null;
}
function journeyVisibleContext(record){
  const sim=simObjFor(record), team=record.favoriteTeam;
  const matches=getTeamMatches(sim,team);
  const revealed=Math.min(record.revealed, matches.length);
  const days=tournamentDays(sim);
  const calendarDayIndex=Math.max(0, Math.min(record.calendarDayIndex||0, Math.max(0,days.length-1)));
  if(record.calendarDayIndex!==calendarDayIndex) record.calendarDayIndex=calendarDayIndex;
  const journeyMinute=Number.isFinite(record.journeyMinute) ? Math.max(0, Math.min(1439, record.journeyMinute|0)) : 300;
  if(record.journeyMinute!==journeyMinute) record.journeyMinute=journeyMinute;
  const period=periodForMinute(journeyMinute);
  const currentDay=days[calendarDayIndex] || {dayIndex:0,dateLabel:"Calendário",matches:[]};
  const dayMatches=currentDay.matches || [];
  const favoriteMatchToday=dayMatches.find(m=>m.home===team || m.away===team) || null;
  const favoriteIndexToday=favoriteMatchToday ? matchFavoriteIndex(favoriteMatchToday, matches) : -1;
  const favoriteMatchDue=favoriteMatchToday && parseMatchMinute(favoriteMatchToday.time)<=journeyMinute;
  const canPlayFavoriteToday=favoriteIndexToday>=0 && favoriteIndexToday===revealed && favoriteMatchDue && !hasWatchedMatch(record, favoriteMatchToday);
  const dayWatched=dayMatches.length>0 && dayMatches.every(m=>hasWatchedMatch(record,m));
  const previousDayMatches=days.slice(0,calendarDayIndex).flatMap(d=>d.matches);
  const watchedCalendarMatches=allTournamentMatches(sim).filter(m=>hasWatchedMatch(record,m));
  const cupCalendarDone=allTournamentMatches(sim).every(m=>hasWatchedMatch(record,m));
  const favoriteJourneyDone=revealed>=matches.length;
  const watchMatches=observerMatchesAfterFavorite(sim, matches);
  const watchIndex=Math.max(0, Math.min(record.watchIndex||0, watchMatches.length));
  const observerMode=favoriteJourneyDone && sim.champion!==team && !cupCalendarDone;
  const finished=cupCalendarDone;
  const dayPhase = dayPhaseForMinute(journeyMinute);
  const revealedMatches=matches.slice(0,revealed);
  const watchedMatches=observerMode ? watchMatches.slice(0,watchIndex) : watchedCalendarMatches.filter(m=>m.home!==team && m.away!==team);
  const nextWatchMatch=observerMode && !finished ? watchMatches[watchIndex] : null;
  const lastWatchMatch=watchedMatches[watchedMatches.length-1] || null;
  const nextMatch=observerMode || finished ? null : (canPlayFavoriteToday ? matches[revealed] : null);
  const groupMatches=matches.filter(isGroupStage);
  const groupRevealed=revealedMatches.filter(isGroupStage);
  const observerRound = [...previousDayMatches, ...dayMatches.filter(m=>hasWatchedMatch(record,m))].filter(isGroupStage);
  const currentRound = observerRound.length
    ? Math.max(...observerRound.map(m=>m.round||0))
    : (groupRevealed.length ? Math.max(...groupRevealed.map(m=>m.round||0)) : 0);
  const favGroup=favoriteGroup(sim,team);
  const allPartialGroups=partialStandings(sim, currentRound);
  const partialGroup=favGroup ? allPartialGroups.find(g=>g.letter===favGroup.letter) : null;
  return {sim, team, matches, revealed, days, calendarDayIndex, journeyMinute, period, currentDay, dayMatches, favoriteMatchToday, favoriteIndexToday, favoriteMatchDue, canPlayFavoriteToday, dayWatched, favoriteJourneyDone, observerMode, watchMatches, watchIndex, watchedMatches, nextWatchMatch, lastWatchMatch, finished, dayPhase, revealedMatches, nextMatch, groupMatches, groupRevealed, currentRound, favGroup, partialGroup, allPartialGroups};
}
function journeyQuickSituation(ctx){
  const {sim, team, revealed, finished, dayPhase, revealedMatches, nextMatch, partialGroup, observerMode, nextWatchMatch, lastWatchMatch, watchIndex, watchMatches}=ctx;
  const last=revealedMatches[revealedMatches.length-1];
  if(observerMode){
    if(finished){
      return {tone:"champion", eyebrow:"Noite · Copa encerrada", title:`${sim.champion} é campeão do mundo`, text:`${flag(sim.champion)} ${sim.champion} venceu a final contra ${flag(sim.runnerUp)} ${sim.runnerUp}. Terceiro lugar: ${flag(sim.thirdPlace)} ${sim.thirdPlace}.`};
    }
    if(dayPhase==="morning"){
      return {tone:"ready", eyebrow:`Manhã · Modo espectador`, title:`A Copa continua sem ${team}`, text:`Sua seleção já caiu, mas o calendário segue. Próximo foco: ${nextWatchMatch?.stage || "rodada"} com ${nextWatchMatch ? `${flag(nextWatchMatch.home)} ${nextWatchMatch.home} x ${flag(nextWatchMatch.away)} ${nextWatchMatch.away}` : "jogos restantes"}.`};
    }
    const m=lastWatchMatch;
    return {tone:"alive", eyebrow:`Noite · ${m?.stage || "Rodada acompanhada"}`, title:m?`Resultado acompanhado: ${scoreLine(m)}`:"Rodada acompanhada", text:m?`${matchTeamLine(m)}. Você está acompanhando ${watchIndex}/${watchMatches.length} jogo(s) restantes até a decisão.`:"A rodada avançou e a Copa segue afunilando."};
  }
  if(finished){
    const cs=campaignSummary(sim,team);
    return {tone:cs.status, eyebrow:"Noite · Jornada concluída", title:cs.title, text:cs.text};
  }
  if(dayPhase==="morning"){
    if(!nextMatch) return {tone:"ready", eyebrow:"Manhã", title:"Aguardando próximo capítulo", text:`${flag(team)} ${team} ainda não tem um novo jogo aberto nesta jornada.`};
    const stage=isGroupStage(nextMatch) ? `Rodada ${nextMatch.round || revealed+1}` : nextMatch.stage;
    return {tone:"ready", eyebrow:`Manhã · ${stage}`, title:`Preparação contra ${nextMatch.opponent}`, text:`${flag(team)} ${team} se prepara para enfrentar ${flag(nextMatch.opponent)} ${nextMatch.opponent}. As notícias agora são de pré-jogo.`};
  }
  const row=partialGroup?.table.find(r=>r.team===team);
  if(last){
    const won=last.favoriteWon;
    const tone=won?"alive":last.favoriteDrew?"ready":"danger";
    return {tone, eyebrow:`Noite · ${last.stage}`, title:`Pós-jogo: ${scoreLine(last)}`, text:`${flag(last.home)} ${last.home} ${scoreLine(last)} ${flag(last.away)} ${last.away}. ${row?`${team} tem ${row.P} ponto(s), saldo ${row.SG>0?"+":""}${row.SG}. `:""}As notícias agora repercutem resultados, atuações e tabela do dia.`};
  }
  return {tone:"alive", eyebrow:"Noite", title:"Rodada em análise", text:"Acompanhe a repercussão antes de avançar para a próxima manhã."};
}
function calendarMatchAction(ctx, match){
  const record=activeRecord();
  const favIdx=matchFavoriteIndex(match, ctx.matches);
  const isFavorite=match.home===ctx.team || match.away===ctx.team;
  const watched=hasWatchedMatch(record, match);
  const due=parseMatchMinute(match.time)<=ctx.journeyMinute;
  if(!due){
    return `<span class="inline-flex items-center gap-1.5 rounded-xl bg-slate-100 px-3 py-2 text-xs font-extrabold text-slate-400">${ic('clock','w-3.5 h-3.5')} ${match.time || "--"}</span>`;
  }
  if(isFavorite && favIdx===ctx.revealed && !watched){
    return `<button class="calendar-play btn-premium text-white rounded-xl px-3 py-2 text-xs font-extrabold" data-match-no="${match.matchNo}">${ic('play','w-3.5 h-3.5')} Jogar</button>`;
  }
  if(!watched){
    return `<button class="calendar-watch glass rounded-xl px-3 py-2 text-xs font-extrabold text-slate-600" data-match-no="${match.matchNo}">${ic('eye','w-3.5 h-3.5')} Assistir</button>`;
  }
  return `<button class="calendar-watch glass rounded-xl px-3 py-2 text-xs font-extrabold text-slate-500" data-match-no="${match.matchNo}">${ic('rotate-ccw','w-3.5 h-3.5')} Rever</button>`;
}
function renderCalendarDayCard(ctx, type){
  const {team, currentDay, dayMatches, calendarDayIndex, days, finished, dayPhase, journeyMinute}=ctx;
  const dayNo=calendarDayIndex+1;
  const totalDays=days.length || 1;
  const advance=appState.clockAdvance;
  return `<div class="journey-hero-card guided-card rounded-[2rem] p-4 sm:p-5 guided-enter ${finished&&ctx.sim.champion===team?'confetti-soft':''}">
    <div class="flex items-center justify-between gap-4">
      ${renderSimulationTypeBadge(type)}
      <div class="flex items-center gap-2">
        <span class="px-3 py-1.5 rounded-full text-[10px] uppercase tracking-widest font-extrabold ${dayPhase==="morning"?'bg-gold-500/15 text-gold-700':'bg-ink text-white'}">${dayPhase==="morning"?'Dia':'Noite'}</span>
        <button id="journeyTypeBack" class="text-xs font-extrabold text-slate-500 hover:text-ink">Trocar tipo</button>
      </div>
    </div>
    <div class="mt-5 flex items-start justify-between gap-4">
      <div>
        <div class="text-[10px] uppercase tracking-widest font-extrabold text-slate-400">Dia ${dayNo}/${totalDays}</div>
        <h1 class="font-display font-extrabold text-3xl leading-tight">${currentDay.dateLabel}</h1>
        <p class="mt-2 text-sm text-slate-500 font-semibold">${flag(team)} ${team} · calendário da Copa</p>
      </div>
      ${flag(team,'flag-xl')}
    </div>
    <div class="journey-clock-panel ${advance?'is-ticking':''} mt-4 rounded-3xl p-4">
      <div class="flex items-center justify-between gap-3">
        <div>
          <div class="text-[10px] uppercase tracking-widest font-extrabold text-slate-400">Relógio da jornada</div>
          <div id="journeyClock" class="font-display font-extrabold text-3xl tnum">${formatJourneyMinute(journeyMinute)}</div>
        </div>
        <div class="text-right text-xs font-extrabold text-slate-500">
          ${advance?`Avançou de ${formatJourneyMinute(advance.from)} para ${formatJourneyMinute(advance.to%1440)}`:dayPhase==="morning"?"Período diurno":"Período noturno"}
        </div>
      </div>
      <div class="journey-clock-track mt-3"><span style="width:${Math.max(0, Math.min(100, (journeyMinute/1440)*100))}%"></span></div>
    </div>
    <div class="mt-4 calendar-day-list journey-scroll-list space-y-2">
      ${dayMatches.map(m=>{
        const isFavorite=m.home===team || m.away===team;
        const watched=hasWatchedMatch(activeRecord(), m);
        const due=parseMatchMinute(m.time)<=journeyMinute;
        return `<div class="calendar-day-match rounded-2xl ${isFavorite?'bg-mxgreen/10 border-mxgreen/25':'bg-white/70 border-white/75'} border p-3">
          <div class="flex items-start justify-between gap-3">
            <div class="min-w-0">
              <div class="text-[10px] uppercase tracking-widest font-extrabold ${isFavorite?'text-mxgreen':'text-slate-400'}">${m.matchNo?`M${m.matchNo} · `:''}${m.stage}${m.time?` · ${m.time}`:''}</div>
              <div class="mt-1 font-extrabold text-sm leading-tight">${flag(m.home)} ${m.home} <span class="px-1.5 ${watched?'text-ink':'text-slate-400'}">${watched?scoreLine(m):(due?'aguardando':'x')}</span> ${flag(m.away)} ${m.away}</div>
            </div>
            <div class="flex-none">${calendarMatchAction(ctx,m)}</div>
          </div>
        </div>`;
      }).join("")}
    </div>
    <div class="mt-4 grid gap-2">
      ${finished
        ? `<button id="askDashboard" class="btn-premium text-white font-extrabold rounded-2xl px-5 py-3.5">${ic('layout-dashboard','w-4 h-4')} Ver Copa completa</button>`
        : ctx.canPlayFavoriteToday
            ? `<button class="glass rounded-2xl px-5 py-3.5 font-extrabold text-slate-500 opacity-70 cursor-not-allowed">${ic('flag','w-4 h-4')} Jogue sua partida para encerrar o dia</button>`
            : appState.autoAdvancing
                ? `<button id="pauseAutoAdvance" class="glass rounded-2xl px-5 py-3.5 font-extrabold text-slate-600 flex items-center justify-center gap-2">${ic('pause','w-4 h-4')} Pausar avanço</button>`
                : `<button id="autoAdvanceClock" class="btn-premium text-white font-extrabold rounded-2xl px-5 py-3.5 flex items-center justify-center gap-2">${ic('play-circle','w-4 h-4')} Avançar automaticamente</button>`}
    </div>
    ${savedSimsPanel()}
    <button id="resetGuidedSmall" class="mt-3 text-xs font-extrabold text-slate-400 hover:text-usared">Reiniciar progresso desta simulação</button>
  </div>`;
}
function newsPlayer(team, offset=0){
  const players=teamMeta[team]?.keyPlayers || TEAMS[team]?.sq?.map(p=>p[0]) || [];
  return players[offset % Math.max(players.length,1)] || "o camisa 10";
}
function matchResultText(match){
  if(!match) return "sem resultado";
  return `${match.home} ${scoreLine(match)} ${match.away}`;
}
function groupRoundMatches(sim, round, excludeTeam=null){
  const r=Math.max(1, Math.min(round || 1, 3));
  return sim.groups.flatMap(g=>g.matches.map(m=>({...m, group:g.letter})))
    .filter(m=>(m.round||0)===r && (!excludeTeam || (m.home!==excludeTeam && m.away!==excludeTeam)));
}
function pickMatch(matches, index=0){
  return matches.length ? matches[index % matches.length] : null;
}
function matchHeadlinePlayer(match, fallbackTeam){
  const goal = match?.goals?.slice().sort((a,b)=>b.minute-a.minute)[0];
  return goal?.player || newsPlayer(fallbackTeam || match?.home || match?.away, 0);
}
function matchResultMood(match){
  if(!match) return "jogo aberto";
  const total=(match.ga||0)+(match.gb||0);
  const diff=Math.abs((match.ga||0)-(match.gb||0));
  if(match.pens) return "drama nos pênaltis";
  if(match.aet) return "noite de prorrogação";
  if(diff>=3) return "placar pesado";
  if(total>=4) return "jogo aberto";
  if(total<=1) return "partida travada";
  return "resultado controlado";
}
function trainingNewsForOffDay(team, ctx){
  const dayIndex = ctx.calendarDayIndex || 0;
  const variants = [
    {
      tag:"TREINO FECHADO",
      title:`${flag(team)} ${team} faz atividade reservada em dia sem jogo`,
      text:`A comissão usa a pausa no calendário para ajustar bola parada, recuperação física e encaixes sem exposição pública.`,
      meta:`Técnico: ${TEAMS[team].coach}`,
    },
    {
      tag:"RECUPERAÇÃO",
      title:`${flag(team)} ${team} prioriza controle de carga antes da sequência`,
      text:`O dia livre de partida vira oportunidade para tratar desgaste, revisar vídeos e preparar alternativas para o próximo compromisso.`,
      meta:"Gestão de elenco",
    },
    {
      tag:"AJUSTE TÁTICO",
      title:`${flag(team)} ${TEAMS[team].coach} testa variações no treino`,
      text:`Sem bola rolando para a seleção hoje, a comissão trabalha movimentações curtas e cenários de pressão para a próxima rodada.`,
      meta:`Esquema-base ${TEAMS[team].shape}`,
    },
    {
      tag:"BASTIDOR",
      title:`${flag(team)} elenco de ${team} acompanha rodada do hotel`,
      text:`A delegação observa adversários possíveis e transforma o dia sem jogo em leitura de tabela, descanso e conversa interna.`,
      meta:"Dia de observação",
    },
  ];
  const item = variants[dayIndex % variants.length];
  return {type:"good", section:"Manhã · Treino", ...item};
}
function journeyNewsItems(ctx){
  const {sim, team, revealed, finished, revealedMatches, nextMatch, partialGroup, allPartialGroups, currentRound, observerMode, nextWatchMatch, lastWatchMatch, watchIndex, favoriteMatchToday, dayMatches}=ctx;
  const last=revealedMatches[revealedMatches.length-1];
  const row=partialGroup?.table.find(r=>r.team===team);
  const groupRivals=(partialGroup?.table||[]).filter(r=>r.team!==team).slice(0,3).map(r=>r.team);
  const key=newsPlayer(team,0);
  const secondKey=newsPlayer(team,1);
  const lastScore=last ? `${last.home} ${scoreLine(last)} ${last.away}` : "";
  const won=last?.favoriteWon, lost=last && !last.favoriteWon && !last.favoriteDrew;
  const roundLabel = nextMatch
    ? (isGroupStage(nextMatch) ? `Rodada ${nextMatch.round || currentRound+1} do grupo` : nextMatch.stage)
    : (last ? (isGroupStage(last) ? `Rodada ${last.round || currentRound} do grupo` : last.stage) : "Pré-jogo");
  const nextLine = nextMatch ? `${nextMatch.home} x ${nextMatch.away}` : "Jornada concluída";
  const lead = last ? `Após ${lastScore},` : `Antes da estreia,`;
  const newsRound = Math.max(1, Math.min(currentRound || nextMatch?.round || 1, 3));
  const globalGroups = (allPartialGroups?.length ? allPartialGroups : partialStandings(sim, newsRound))
    .filter(g=>g.letter !== partialGroup?.letter);
  const groupLeaders = globalGroups.map(g=>({group:g, row:g.table[0]})).filter(x=>x.row).slice(0,4);
  const tightGroup = globalGroups
    .map(g=>({group:g, first:g.table[0], second:g.table[1]}))
    .filter(x=>x.first && x.second)
    .sort((a,b)=>(a.first.P-a.second.P)-(b.first.P-b.second.P))[0];
  const otherA = groupLeaders[0]?.row?.team || groupRivals[0] || team;
  const otherB = groupLeaders[1]?.row?.team || groupRivals[1] || team;
  const otherC = tightGroup?.second?.team || groupLeaders[2]?.row?.team || groupRivals[2] || team;
  const otherD = groupLeaders[3]?.row?.team || otherA;
  const pressureMeta = row ? `${row.pos}º no grupo · ${row.P} ponto(s)` : "Primeiro capítulo da campanha";
  const knockoutPool = allTournamentMatches(sim).filter(m=>!isGroupStage(m));
  const recentKnockouts = knockoutPool.filter(m=>(m.matchNo||0)<=((lastWatchMatch||last)?.matchNo||0)).slice(-8);
  const stageMatches = stage => knockoutPool.filter(m=>m.stage===stage);
  const championNews = () => [
    {type:"good", section:"Noite · Final", tag:"CAMPEÃO", title:`${flag(sim.champion)} ${sim.champion} conquista a Copa do Mundo`, text:`A final contra ${sim.runnerUp} fecha a simulação com festa, taça erguida e nome marcado na história do torneio.`, meta:`Final: ${sim.champion} x ${sim.runnerUp}`},
    {type:"good", section:"Noite · Final", tag:"HERÓI DA TAÇA", title:`${flag(sim.champion)} ${newsPlayer(sim.champion,0)} vira símbolo do título`, text:`O jogador sai da Copa como rosto da campanha campeã e domina as manchetes do dia seguinte.`, meta:"Central da Copa"},
    {type:"bad", section:"Noite · Final", tag:"VICE DOLORIDO", title:`${flag(sim.runnerUp)} ${sim.runnerUp} fica a um jogo da glória`, text:`A derrota na decisão deixa frustração enorme, mas a campanha ainda será lembrada pela força até a final.`, meta:"Depois da decisão"},
    {type:"good", section:"Noite · 3º lugar", tag:"PÓDIO", title:`${flag(sim.thirdPlace)} ${sim.thirdPlace} fecha Copa no pódio`, text:`A vitória na disputa de terceiro lugar dá um último capítulo positivo para uma seleção que chegou longe.`, meta:`3º: ${sim.thirdPlace}`},
  ];
  if(finished && (sim.champion || sim.runnerUp)) return championNews();
  if(observerMode){
    const focus = nextWatchMatch || lastWatchMatch || recentKnockouts[recentKnockouts.length-1];
    const stage = focus?.stage || "Copa";
    const alive = recentKnockouts.length
      ? [...new Set(recentKnockouts.map(m=>getMatchWinnerTeam(m)).filter(Boolean))]
      : [sim.champion, sim.runnerUp, otherA, otherB].filter(Boolean);
    const a=alive[0] || focus?.home || otherA;
    const b=alive[1] || focus?.away || otherB;
    const c=alive[2] || otherC;
    if(ctx.dayPhase==="morning"){
      return [
        {type:"bad", section:`Manhã · ${stage}`, tag:"PÓS-ELIMINAÇÃO", title:`${flag(team)} comissão de ${TEAMS[team].coach} segue acompanhando a Copa`, text:`Sem jogar, a delegação observa os jogos restantes e tenta entender onde a campanha perdeu força.`, meta:"Primeira página após a queda"},
        {type:"good", section:`Manhã · ${stage}`, tag:"PREPARAÇÃO", title:focus?`${flag(focus.home)} ${focus.home} e ${flag(focus.away)} ${focus.away} entram em dia decisivo`:`${flag(a)} ${a} mira próximo passo`, text:`A rodada agora coloca os sobreviventes sob pressão máxima, com treino curto e pouco espaço para erro.`, meta:focus?`${focus.stage} · ${matchScheduleLine(focus)}`:"Calendário final"},
        {type:"good", section:`Manhã · ${stage}`, tag:"SEDE DE FINAL", title:`${flag(a)} ${newsPlayer(a,0)} puxa clima de confiança`, text:`O vestiário tenta transformar favoritismo em controle emocional antes de mais um jogo pesado.`, meta:`Olho em ${a}`},
        {type:"bad", section:`Manhã · ${stage}`, tag:"RISCO", title:`${flag(b)} ${b} entra sob ameaça de desgaste`, text:`A sequência cobra preço físico, e a comissão avalia preservar intensidade sem desmontar a estrutura.`, meta:`${newsPlayer(b,1)} monitorado`},
        {type:"good", section:`Manhã · ${stage}`, tag:"SONHO VIVO", title:`${flag(c)} ${c} começa a acreditar em campanha histórica`, text:`A seleção aparece entre os assuntos fortes do dia e tenta transformar momento em vaga na fase seguinte.`, meta:"Central da Copa"},
      ];
    }
    return [
      {type:"bad", section:`Noite · ${lastWatchMatch?.stage || stage}`, tag:"PÓS-ELIMINAÇÃO", title:`${flag(team)} bastidor ainda revisa a queda`, text:`A comissão acompanha os jogos restantes e compara escolhas, desgaste e resposta emocional com quem ainda está vivo.`, meta:"Sem jogo da sua seleção"},
      {type:"good", section:`Noite · ${lastWatchMatch?.stage || stage}`, tag:lastWatchMatch?.stage==="Semifinal"?"FINALISTA":lastWatchMatch?.stage==="Quartas de final"?"SEMIFINALISTA":"RESULTADO", title:lastWatchMatch?`${flag(getMatchWinnerTeam(lastWatchMatch)||lastWatchMatch.home)} ${getMatchWinnerTeam(lastWatchMatch)||lastWatchMatch.home} avança em noite grande`:`${flag(a)} ${a} segue vivo`, text:lastWatchMatch?`${matchResultText(lastWatchMatch)} muda o mapa da Copa e aproxima a competição da decisão.`:`A rodada movimenta o torneio e reduz ainda mais a lista de candidatos.`, meta:lastWatchMatch?`${lastWatchMatch.stage} · ${matchResultMood(lastWatchMatch)}`:`${watchIndex} jogo(s) acompanhados`},
      {type:"good", section:"Noite · Mata-mata", tag:"PERSONAGEM", title:`${flag(a)} ${newsPlayer(a,0)} ganha status de protagonista`, text:`A atuação recente coloca o jogador entre os nomes mais comentados da fase decisiva.`, meta:"Manchete da noite"},
      {type:"bad", section:"Noite · Mata-mata", tag:"ELIMINADO", title:lastWatchMatch?`${flag(lastWatchMatch.home===getMatchWinnerTeam(lastWatchMatch)?lastWatchMatch.away:lastWatchMatch.home)} queda pesa no vestiário`:`${flag(b)} ${b} sente pressão`, text:`A fase decisiva deixa pouco espaço para tropeço, e cada detalhe vira tema de cobrança pública.`, meta:"Pós-jogo geral"},
      {type:"good", section:"Noite · Central da Copa", tag:"CAMINHO DA TAÇA", title:`${flag(a)} ${a} aparece no radar da taça`, text:`As projeções internas da simulação começam a apontar quem tem elenco, momento e chave para chegar até a final.`, meta:"Projeção sem mostrar placar futuro"},
    ];
  }
  if(!favoriteMatchToday && dayMatches?.length){
    const baseDayPool = dayMatches.filter(m=>m.home!==team && m.away!==team);
    const dayPool = ctx.dayPhase==="morning"
      ? baseDayPool.filter(m=>!hasWatchedMatch(activeRecord(),m) && parseMatchMinute(m.time)>=ctx.journeyMinute)
      : baseDayPool.filter(m=>hasWatchedMatch(activeRecord(),m));
    const fallbackPool = ctx.dayPhase==="morning" ? (dayPool.length ? dayPool : baseDayPool) : dayPool;
    const dm1=pickMatch(fallbackPool,0), dm2=pickMatch(fallbackPool,1), dm3=pickMatch(fallbackPool,2), dm4=pickMatch(fallbackPool,3), dm5=pickMatch(fallbackPool,4);
    const training = trainingNewsForOffDay(team, ctx);
    if(ctx.dayPhase==="morning"){
      return [
        training,
        {type:"good", section:"Manhã · Jogos do dia", tag:"AGENDA CHEIA", title:dm1?`${flag(dm1.home)} ${dm1.home} encara ${flag(dm1.away)} ${dm1.away}`:`${flag(otherA)} ${otherA} abre dia importante`, text:dm1?`A partida aparece como uma das vitrines do dia e pode mexer no humor da rodada.`:`A rodada começa com atenção dividida entre tabela, desgaste e favoritos.`, meta:dm1?matchScheduleLine(dm1):"Calendário da Copa"},
        {type:"bad", section:"Manhã · Jogos do dia", tag:"PRESSÃO", title:dm2?`${flag(dm2.home)} ${dm2.home} entra sob cobrança antes da bola rolar`:`${flag(otherB)} ${otherB} joga com alerta ligado`, text:`A margem para erro diminui, e a comissão tenta blindar o elenco do barulho externo antes da partida.`, meta:dm2?matchScheduleLine(dm2):"Pré-jogo"},
        {type:"good", section:"Manhã · Personagem", tag:"OLHO NO CRAQUE", title:dm3?`${flag(dm3.home)} ${newsPlayer(dm3.home,0)} pode definir o ritmo`:`${flag(otherC)} ${newsPlayer(otherC,0)} vira nome da rodada`, text:`O jogador chega cercado de expectativa e concentra parte das atenções antes dos jogos paralelos.`, meta:dm3?`${dm3.home} x ${dm3.away}`:"Central da Copa"},
        {type:"bad", section:"Manhã · Bastidor", tag:"RISCO DE ZEBRA", title:dm4?`${flag(dm4.away)} ${dm4.away} tenta frustrar favoritismo`:`${flag(otherD)} ${otherD} teme tropeço`, text:`O clima de favoritismo vira armadilha se a equipe não transformar controle em vantagem no placar.`, meta:dm4?matchScheduleLine(dm4):"Rodada paralela"},
        {type:"good", section:"Manhã · Tabela", tag:"CONTA ABERTA", title:dm5?`${flag(dm5.home)} ${dm5.home} pode mudar a leitura do grupo`:`${flag(otherA)} ${otherA} mira salto na tabela`, text:`Os resultados do dia podem redesenhar liderança, saldo e pressão para a próxima data do calendário.`, meta:dm5?`M${dm5.matchNo || "?"}`:"Panorama"},
      ];
    }
    return [
      {...training, section:"Noite · Treino", tag:"TREINO E OBSERVAÇÃO"},
      {type:"good", section:"Noite · Resultado", tag:"DESTAQUE", title:dm1?`${flag(getMatchWinnerTeam(dm1)||dm1.home)} ${getMatchWinnerTeam(dm1)||dm1.home} domina manchetes`:`${flag(otherA)} ${otherA} fecha noite em alta`, text:dm1?`${matchResultText(dm1)} vira um dos resultados de referência do dia.`:`A noite termina com projeções mexendo no mapa da Copa.`, meta:dm1?matchResultMood(dm1):"Pós-jogo"},
      {type:"bad", section:"Noite · Resultado", tag:"TROPEÇO", title:dm2?`${flag(dm2.home)} ${dm2.home} sai pressionado da rodada`:`${flag(otherB)} ${otherB} perde conforto`, text:dm2?`${matchResultText(dm2)} abre debate sobre postura, escolhas e capacidade de reação.`:`A combinação de resultados aumenta o peso do próximo jogo.`, meta:dm2?`M${dm2.matchNo || "?"}`:"Mesa redonda"},
      {type:"good", section:"Noite · Personagem", tag:"NOME DO DIA", title:dm3?`${flag(getMatchWinnerTeam(dm3)||dm3.home)} ${matchHeadlinePlayer(dm3, getMatchWinnerTeam(dm3)||dm3.home)} aparece nos holofotes`:`${flag(otherC)} ${newsPlayer(otherC,0)} ganha destaque`, text:`A atuação entra na conversa da rodada e ajuda a explicar por que a tabela ficou mais apertada.`, meta:dm3?matchResultText(dm3):"Central da Copa"},
      {type:"bad", section:"Noite · Tabela", tag:"ALERTA", title:dm4?`${flag(dm4.away)} ${dm4.away} deixa sinais de desgaste`:`${flag(otherD)} ${otherD} liga alerta`, text:`O calendário cobra intensidade, e a próxima manhã deve começar com ajustes físicos e táticos.`, meta:dm4?matchResultMood(dm4):"Sequência pesada"},
      {type:"good", section:"Noite · Rodada", tag:"MAPA DA COPA", title:dm5?`${flag(getMatchWinnerTeam(dm5)||dm5.home)} ${getMatchWinnerTeam(dm5)||dm5.home} muda projeções`:`${flag(otherA)} ${otherA} ganha fôlego`, text:`Com a sua seleção sem jogo, o dia foi marcado por movimentos paralelos que importam para o caminho futuro.`, meta:dm5?matchResultText(dm5):"Panorama do dia"},
    ];
  }
  if(ctx.dayPhase==="morning"){
    const prepMatch=nextMatch;
    const opponent=prepMatch?.opponent || groupRivals[0] || otherA;
    const homeAway = prepMatch?.home===team ? "como mandante da tabela" : "fora da ordem principal da tabela";
    const needsResult = row && row.P <= 1 && newsRound >= 2;
    const comfortable = row && row.pos <= 2 && row.P >= 4;
    const favoriteNews = [
      {type:"good", section:`Manhã · ${roundLabel}`, tag:"PLANO DE JOGO", title:`${flag(team)} ${team} prepara pressão inicial contra ${opponent}`, text:`A comissão de ${TEAMS[team].coach} ensaia uma entrada forte para não deixar o jogo cair no ritmo do adversário.`, meta:nextLine},
      {type:"good", section:`Manhã · ${roundLabel}`, tag:"PROTAGONISTA", title:`${flag(team)} ${key} vira referência no vestiário`, text:`O camisa de maior peso técnico aparece como ponto de apoio para acelerar jogadas e quebrar linhas.`, meta:pressureMeta},
      {type:"good", section:`Manhã · ${roundLabel}`, tag:"AJUSTE FINO", title:`${flag(team)} ${secondKey} ganha liberdade no último treino`, text:`A preparação indica uma função mais solta para atacar o espaço entre meio-campo e defesa rival.`, meta:homeAway},
      {type:comfortable?"good":"bad", section:`Manhã · ${roundLabel}`, tag:comfortable?"CONTROLE":"PRESSÃO", title:comfortable?`${flag(team)} ${team} tenta administrar vantagem no grupo`:`${flag(team)} ${team} joga com margem curta`, text:comfortable?`A campanha permite um plano mais paciente, mas a comissão evita falar em classificação antecipada.`:`O ambiente é de atenção total: qualquer tropeço pode bagunçar a tabela da seleção.`, meta:pressureMeta},
    ];
    const worldNews = [
      {type:"good", section:`Manhã · Rodada ${newsRound}`, tag:"TERMÔMETRO", title:`${flag(otherA)} ${otherA} chega com bastidor positivo`, text:`Em outro grupo, a seleção aparece entre as mais confiantes do dia e tenta transformar favoritismo em placar.`, meta:groupLeaders[0]?`Grupo ${groupLeaders[0].group.letter}`:"Central da Copa"},
      {type:"bad", section:`Manhã · Rodada ${newsRound}`, tag:"ALERTA MÉDICO", title:`${flag(otherB)} ${newsPlayer(otherB,0)} vira preocupação antes da rodada`, text:`A escalação ainda não é tratada como problema fechado, mas a notícia muda o tom da preparação.`, meta:groupLeaders[1]?`Grupo ${groupLeaders[1].group.letter}`:"Pré-jogo geral"},
      {type:"good", section:`Manhã · Rodada ${newsRound}`, tag:"BRIGA ABERTA", title:`${flag(otherC)} ${otherC} mira topo em grupo apertado`, text:`A rodada pode redesenhar a liderança e transformar confronto paralelo em notícia central do dia.`, meta:tightGroup?`${tightGroup.first.team} na cola`:"Rodada geral"},
      {type:"bad", section:`Manhã · Rodada ${newsRound}`, tag:"RISCO DE ZEBRA", title:`${flag(otherD)} ${otherD} entra sob aviso contra tropeço`, text:`A comissão evita clima de oba-oba e cobra concentração para não perder pontos em jogo teoricamente controlável.`, meta:`${newsPlayer(otherD,1)} cobrado`},
      {type:"good", section:`Manhã · Rodada ${newsRound}`, tag:"OLHO NO CRAQUE", title:`${flag(otherA)} ${newsPlayer(otherA,0)} promete movimentar a rodada`, text:`O jogador chega cercado de expectativa e pode influenciar diretamente a tabela do grupo.`, meta:groupLeaders[0]?`Líder do Grupo ${groupLeaders[0].group.letter}`:"Panorama"},
    ];
    return [...favoriteNews, ...worldNews];
  }
  const playedRound = Math.max(1, Math.min(last?.round || currentRound || newsRound, 3));
  const roundMatches = groupRoundMatches(sim, playedRound, team);
  const gm1=pickMatch(roundMatches,0), gm2=pickMatch(roundMatches,1), gm3=pickMatch(roundMatches,2), gm4=pickMatch(roundMatches,3);
  const lastWinner=getMatchWinnerTeam(last);
  const decisiveTeam=lastWinner || team;
  const decisivePlayer=matchHeadlinePlayer(last, decisiveTeam);
  const worldDecisiveTeam=decisiveTeam===team ? (last?.opponent || otherA) : decisiveTeam;
  const worldDecisivePlayer=matchHeadlinePlayer(last, worldDecisiveTeam);
  const resultMood=matchResultMood(last);
  const resultMeta = row ? `${row.pos}º no grupo · ${row.P} ponto(s), SG ${row.SG>0?"+":""}${row.SG}` : (last ? matchResultText(last) : "Pós-jogo");
  const favoritePain = lost && row?.pos > 2;
  const groupEliminated = row?.status==="Eliminado";
  const knockoutEliminated = lost && last && !isGroupStage(last);
  const eliminated = groupEliminated || knockoutEliminated;
  const eliminationStageIdx = knockoutEliminated ? (KO_ORDER[last.stage] || 1) : 0;
  const earlyElimination = groupEliminated || eliminationStageIdx < 3;
  const eliminationTitle = earlyElimination
    ? `${flag(team)} ${team} cai cedo e torcida explode em cobrança`
    : `${flag(team)} ${team} se despede em noite triste`;
  const eliminationText = earlyElimination
    ? `${matchResultText(last)} confirma a eliminação e transforma o pós-jogo em crise: torcedores cobram explicações, escolhas de escalação e postura nos momentos decisivos.`
    : `${matchResultText(last)} encerra a caminhada. A queda dói, mas o tom é menos de revolta e mais de frustração por uma campanha que chegou perto de virar história.`;
  const phaseNews = [];
  if(last?.stage==="Quartas de final" && won){
    phaseNews.push({type:"good", section:"Noite · Quartas", tag:"SEMIFINALISTA", title:`${flag(team)} ${team} está entre os quatro melhores da Copa`, text:`A vaga na semifinal muda o patamar da campanha e coloca ${newsPlayer(team,0)} no centro das manchetes.`, meta:matchResultText(last)});
  }
  if(last?.stage==="Semifinal"){
    phaseNews.push(won
      ? {type:"good", section:"Noite · Semifinal", tag:"FINALISTA", title:`${flag(team)} ${team} vai jogar a final da Copa`, text:`A classificação transforma a campanha em história nacional e deixa o vestiário a um jogo da taça.`, meta:matchResultText(last)}
      : {type:"bad", section:"Noite · Semifinal", tag:"QUASE", title:`${flag(team)} ${team} para na semifinal`, text:`A queda perto da decisão machuca, mas a campanha ainda coloca a seleção entre as grandes histórias do torneio.`, meta:matchResultText(last)});
  }
  if(last?.stage==="Final"){
    phaseNews.push(getMatchWinnerTeam(last)===team
      ? {type:"good", section:"Noite · Final", tag:"CAMPEÃO", title:`${flag(team)} ${team} é campeão do mundo`, text:`A final encerra a jornada com taça, festa e uma campanha que vira referência para a seleção.`, meta:matchResultText(last)}
      : {type:"bad", section:"Noite · Final", tag:"VICE", title:`${flag(team)} ${team} fica no quase`, text:`A derrota na decisão fecha a campanha com tristeza, mas também com a marca de ter chegado ao último jogo da Copa.`, meta:matchResultText(last)});
  }
  const favoriteNews = [
    ...phaseNews,
    {type:won?"good":"bad", section:`Noite · ${last?.stage || roundLabel}`, tag:eliminated?"ELIMINAÇÃO":"RESULTADO", title:eliminated?eliminationTitle:won?`${flag(team)} ${team} vence e muda o tom da campanha`:`${flag(team)} ${team} tropeça e liga alerta`, text:eliminated?eliminationText:last?`${matchResultText(last)} foi tratado internamente como ${resultMood}. A leitura agora passa pela tabela e pelo desgaste do elenco.`:"A rodada termina com clima de análise.", meta:eliminated?(earlyElimination?"Pressão máxima":"Fim de campanha"):resultMeta},
    {type:lost?"bad":"good", section:`Noite · ${last?.stage || roundLabel}`, tag:"VESTIÁRIO", title:lost?`${flag(team)} ${team}: vestiário cobra reação imediata`:`${flag(team)} ${team}: vestiário fala em passo importante`, text:lost?`A comissão evita caça às bruxas, mas a conversa pós-jogo aponta ajustes urgentes para a próxima manhã.`:`A vitória não vira festa exagerada: o grupo fala em recuperar energia e manter concentração.`, meta:nextLine},
    {type:favoritePain?"bad":"good", section:`Noite · ${last?.stage || roundLabel}`, tag:favoritePain?"SITUAÇÃO DELICADA":"TABELA", title:favoritePain?`${flag(team)} ${team} fica fora da zona desejada`:`${flag(team)} ${team} ainda controla parte do próprio caminho`, text:favoritePain?`A pontuação coloca pressão real na sequência e torna os critérios de desempate assunto obrigatório.`:`A tabela não está resolvida, mas o cenário permite planejamento sem desespero.`, meta:resultMeta},
    {type:"bad", section:`Noite · ${last?.stage || roundLabel}`, tag:"ANÁLISE", title:`${flag(team)} ${newsPlayer(team,1)} vira foco do debate tático`, text:`A atuação individual entra no centro da conversa porque mexeu com encaixes, pressão pós-perda e saída de bola.`, meta:last?matchResultText(last):"Mesa redonda"},
  ].slice(0,4);
  const worldNews = [
    {type:"good", section:`Noite · ${last?.stage || roundLabel}`, tag:"PERSONAGEM", title:`${flag(worldDecisiveTeam)} ${worldDecisivePlayer} ganha manchete da noite`, text:`O jogador sai do jogo como rosto mais citado da transmissão e vira tema da entrevista coletiva.`, meta:last?matchResultText(last):"Pós-jogo"},
    {type:"good", section:`Noite · Rodada ${playedRound}`, tag:"TABELA DO DIA", title:`${flag(otherA)} ${otherA} fecha a noite em alta`, text:`A combinação de resultados melhora o ambiente e coloca a seleção entre os assuntos fortes da rodada.`, meta:groupLeaders[0]?`Grupo ${groupLeaders[0].group.letter}`:"Tabela parcial"},
    {type:"bad", section:`Noite · Rodada ${playedRound}`, tag:"ZEBRA", title:gm1?`${flag(getMatchWinnerTeam(gm1)||gm1.home)} ${getMatchWinnerTeam(gm1)||gm1.home} bagunça projeções`:`${flag(otherB)} ${otherB} escapa de crise por pouco`, text:gm1?`${matchResultText(gm1)} entra no pacote de resultados que muda leitura de força da rodada.`:`A seleção deixa a noite sem tranquilidade total.`, meta:gm1?`Grupo ${gm1.group} · ${matchResultMood(gm1)}`:"Pós-jogo geral"},
    {type:"good", section:`Noite · Rodada ${playedRound}`, tag:"NOME DA RODADA", title:`${flag(otherB)} ${matchHeadlinePlayer(gm2, otherB)} aparece nos holofotes`, text:`O nome ganha manchetes depois de influenciar uma rodada cheia de jogos paralelos importantes.`, meta:gm2?matchResultText(gm2):"Rodada paralela"},
    {type:"bad", section:`Noite · Rodada ${playedRound}`, tag:"TROPEÇO", title:gm3?`${flag(gm3.home)} ${gm3.home} vê resultado virar problema`:`${flag(otherC)} ${otherC} perde margem`, text:gm3?`${matchResultText(gm3)} aumenta a pressão por resposta imediata e muda o peso da próxima partida.`:`A seleção entra na próxima manhã com menos conforto.`, meta:gm3?`Grupo ${gm3.group} · ${matchResultMood(gm3)}`:"Tabela"},
    {type:"good", section:`Noite · Rodada ${playedRound}`, tag:"CLASSIFICAÇÃO", title:`${flag(otherC)} ${otherC} esquenta briga da chave`, text:`A noite termina com a seleção no centro dos cálculos, especialmente pelos critérios de saldo e gols marcados.`, meta:tightGroup?`${tightGroup.first.team} e ${otherC}`:"Grupo aberto"},
    {type:"bad", section:`Noite · Rodada ${playedRound}`, tag:"CRISE", title:gm4?`${flag(gm4.away)} ${gm4.away} fecha o dia sob suspeita`:`${flag(otherD)} ${otherD} vira assunto negativo`, text:gm4?`${matchResultText(gm4)} deixa perguntas sobre postura, banco e capacidade de reação.`:`A seleção precisa responder rápido para não perder força.`, meta:gm4?`Grupo ${gm4.group}`:`${newsPlayer(otherD,1)} cobrado`},
  ];
  return [...favoriteNews, ...worldNews];
}
function renderJourneyNews(ctx){
  const items=journeyNewsItems(ctx);
  return `<div class="journey-hero-card journey-news-card guided-card rounded-[2rem] p-4 guided-enter">
    <div class="flex items-center justify-between gap-3">
      <div>
        <div class="text-[11px] uppercase tracking-widest font-extrabold text-slate-400">Notícias</div>
        <h2 class="font-display font-extrabold text-2xl">Central da Copa</h2>
      </div>
      ${ic('newspaper','w-6 h-6 text-usablue')}
    </div>
    <div class="journey-news-window mt-3" id="journeyNewsWindow">
      <div class="journey-news-stage" id="journeyNewsStage">
        ${items.map((n,i)=>`<article class="journey-news-item ${n.type} ${i===0?'is-active':''}" data-news-index="${i}">
          <div class="journey-news-paperhead">
            <span>${n.section}</span>
            <span>Central da Copa</span>
          </div>
          <div class="journey-news-tag">${n.tag}</div>
          <h3>${n.title}</h3>
          <p>${n.text}</p>
          <div class="journey-news-meta">${n.meta}</div>
        </article>`).join("")}
      </div>
    </div>
    <div class="journey-news-progress mt-3" aria-hidden="true">
      <div id="journeyNewsProgress" class="journey-news-progress-fill"></div>
    </div>
    <div class="mt-3 flex items-center justify-between gap-3">
      <div class="flex gap-1.5" id="journeyNewsDots">
        ${items.map((_,i)=>`<span class="journey-news-dot ${i===0?'is-active':''}" data-news-dot="${i}"></span>`).join("")}
      </div>
      <div class="text-[10px] uppercase tracking-widest font-extrabold text-slate-400"><span id="journeyNewsCount">1</span>/${items.length}</div>
    </div>
  </div>`;
}
function wireJourneyNewsCarousel(){
  const cards=[...document.querySelectorAll(".journey-news-item")];
  if(!cards.length) return;
  const dots=[...document.querySelectorAll(".journey-news-dot")];
  const count=$("#journeyNewsCount");
  const windowEl=$("#journeyNewsWindow");
  const progress=$("#journeyNewsProgress");
  const duration=6000;
  let active=0;
  let elapsed=0;
  let lastTick=Date.now();
  let paused=false;
  const paintProgress=()=>{
    if(progress) progress.style.width = `${Math.min(100, (elapsed / duration) * 100)}%`;
  };
  const show=(i, resetProgress=true)=>{
    active=(i+cards.length)%cards.length;
    cards.forEach((card,idx)=>card.classList.toggle("is-active", idx===active));
    dots.forEach((dot,idx)=>dot.classList.toggle("is-active", idx===active));
    if(count) count.textContent=String(active+1);
    if(resetProgress){
      elapsed=0;
      lastTick=Date.now();
      paintProgress();
    }
  };
  dots.forEach(dot=>dot.onclick=()=>show(Number(dot.dataset.newsDot)));
  if(windowEl){
    windowEl.addEventListener("mouseenter",()=>{ paused=true; windowEl.classList.add("is-paused"); });
    windowEl.addEventListener("mouseleave",()=>{ paused=false; lastTick=Date.now(); windowEl.classList.remove("is-paused"); });
  }
  paintProgress();
  journeyNewsTimer=setInterval(()=>{
    const now=Date.now();
    if(!paused){
      elapsed += now - lastTick;
      if(elapsed >= duration) show(active+1);
      else paintProgress();
    }
    lastTick=now;
  }, 80);
}
function renderNextFavoriteScouting(ctx){
  const nextFav=nextFavoriteCalendarMatch(ctx);
  if(!nextFav){
    return `<div class="rounded-2xl bg-slate-100/80 border border-white/70 p-3 text-sm font-extrabold text-slate-500">Sem próximo jogo pendente da sua seleção.</div>`;
  }
  const match=nextFav.match;
  const opponent=match.home===ctx.team ? match.away : match.home;
  const daysLeft=daysBetweenISO(ctx.currentDay.dateISO, match.dateISO);
  const lineup=window.WC_LINEUPS?.buildLineup?.(opponent);
  const starters=(lineup?.starters || []).map(p=>p.name).slice(0,11);
  const compactPlayerName=name=>{
    const parts=String(name||"").trim().split(/\s+/).filter(Boolean);
    if(parts.length<=1) return parts[0] || "";
    return `${parts[0][0]}. ${parts[parts.length-1]}`;
  };
  const gk=starters[0];
  const outfield=starters.slice(1,11);
  return `<div class="rounded-3xl bg-mxgreen/10 border border-mxgreen/20 p-4">
    <div class="flex items-start justify-between gap-3">
      <div>
        <div class="text-[10px] uppercase tracking-widest font-extrabold text-mxgreen">Próximo jogo</div>
        <div class="mt-1 font-display font-extrabold text-xl leading-tight">${flag(match.home)} ${match.home} <span class="text-slate-400 px-1">x</span> ${flag(match.away)} ${match.away}</div>
      </div>
      <div class="text-right shrink-0">
        <div class="text-xs font-extrabold text-slate-700 tnum">${match.dateLabel}</div>
        <div class="text-[11px] font-bold text-slate-500">${daysLeft===0?"É hoje":`Faltam ${daysLeft} dia${daysLeft===1?"":"s"}`}${match.time?` · ${match.time}`:""}</div>
      </div>
    </div>
    <div class="mt-3 grid sm:grid-cols-2 gap-2 text-xs">
      <div class="rounded-2xl bg-white/65 border border-white/70 p-2.5">
        <div class="uppercase tracking-widest font-extrabold text-slate-400 text-[9px]">Local</div>
        <div class="mt-1 font-extrabold text-slate-700">${match.venue || "Estádio a definir"}</div>
        <div class="text-slate-500 font-semibold">${match.city || matchScheduleLine(match)}</div>
      </div>
      <div class="rounded-2xl bg-white/65 border border-white/70 p-2.5">
        <div class="uppercase tracking-widest font-extrabold text-slate-400 text-[9px]">Adversário</div>
        <div class="mt-1 font-extrabold text-slate-700">${flag(opponent)} ${opponent}</div>
        <div class="text-slate-500 font-semibold">${TEAMS[opponent]?.shape || "Esquema indefinido"} · ${TEAMS[opponent]?.coach || "técnico a definir"}</div>
      </div>
    </div>
    <div class="mt-3 rounded-2xl bg-white/65 border border-white/70 p-3">
      <div class="text-[9px] uppercase tracking-widest font-extrabold text-slate-400">Provável escalação do adversário</div>
      <div class="mt-2 text-xs font-semibold text-slate-600 leading-relaxed">
        ${gk?`<b>GK:</b> ${gk}<br>`:""}
        ${outfield.length?outfield.map(compactPlayerName).join(" · "):"Escalação provável ainda indisponível."}
      </div>
    </div>
  </div>`;
}
function renderJourneySituation(ctx){
  const {team, revealed, dayPhase, nextMatch, partialGroup, groupMatches, revealedMatches, observerMode, nextWatchMatch, lastWatchMatch, watchIndex, watchMatches, sim}=ctx;
  const nextScouting=renderNextFavoriteScouting(ctx);
  if(observerMode){
    const m = dayPhase==="morning" ? nextWatchMatch : lastWatchMatch;
    return `<div class="journey-hero-card guided-card rounded-[2rem] p-4 guided-enter">
      <div class="flex items-center justify-between gap-3 mb-3">
        <div>
          <div class="text-[11px] uppercase tracking-widest font-extrabold text-slate-400">${dayPhase==="morning"?"Manhã · Copa continua":"Noite · Resultado acompanhado"}</div>
          <h2 class="font-display font-extrabold text-2xl">Estado da chave</h2>
        </div>
        ${ic(dayPhase==="morning"?'eye':'git-fork','w-6 h-6 text-mxgreen')}
      </div>
      ${m?`<div class="rounded-3xl bg-white/70 border border-white/75 p-4">
        <div class="text-[10px] uppercase tracking-widest font-extrabold text-slate-400">${m.stage}${m.matchNo?` · M${m.matchNo}`:""}</div>
        <div class="mt-3 font-display font-extrabold text-lg leading-tight">${matchTeamLine(m)}</div>
        <div class="mt-3 text-sm font-semibold text-slate-500">${dayPhase==="morning"?matchScheduleLine(m):`${getMatchWinnerTeam(m) || "Empate"} segue na leitura da rodada.`}</div>
      </div>`:`<div class="rounded-3xl bg-white/70 border border-white/75 p-4">
        <div class="font-display font-extrabold text-xl">${flag(sim.champion)} ${sim.champion} campeão</div>
        <div class="mt-2 text-sm font-semibold text-slate-500">A simulação já passou por todos os jogos restantes.</div>
      </div>`}
      <div class="mt-3 text-xs font-extrabold text-slate-500">${Math.min(watchIndex, watchMatches.length)}/${watchMatches.length} jogo(s) restantes acompanhados depois da eliminação.</div>
      <div class="mt-3">${nextScouting}</div>
      ${daySnapshotButtons()}
    </div>`;
  }
  const lastRevealed = revealedMatches[revealedMatches.length-1];
  const inGroups = nextMatch ? isGroupStage(nextMatch) : lastRevealed && isGroupStage(lastRevealed) && revealed <= groupMatches.length;
  if(dayPhase==="morning" && nextMatch){
    return `<div class="journey-hero-card guided-card rounded-[2rem] p-4 guided-enter">
      <div class="flex items-center justify-between gap-3 mb-3">
        <div>
          <div class="text-[11px] uppercase tracking-widest font-extrabold text-slate-400">Manhã de jogo</div>
          <h2 class="font-display font-extrabold text-2xl">Próxima partida</h2>
        </div>
        ${ic('sun','w-6 h-6 text-gold-600')}
      </div>
      <div class="rounded-3xl bg-white/70 border border-white/75 p-4">
        <div class="text-[10px] uppercase tracking-widest font-extrabold text-slate-400">${nextMatch.stage}${nextMatch.matchNo?` · M${nextMatch.matchNo}`:""}</div>
        <div class="mt-3 grid grid-cols-[1fr_auto_1fr] items-center gap-3">
          <div class="text-right font-extrabold">${flag(nextMatch.home)} ${nextMatch.home}</div>
          <div class="rounded-xl bg-slate-100 px-2 py-1 text-xs font-black text-slate-400">VS</div>
          <div class="font-extrabold">${flag(nextMatch.away)} ${nextMatch.away}</div>
        </div>
        <div class="mt-3 text-sm font-semibold text-slate-500">${matchScheduleLine(nextMatch)}</div>
      </div>
      <div class="mt-3">${nextScouting}</div>
      ${partialGroup?`<div class="mt-3">${compactGroupCard(partialGroup, team)}</div>`:""}
      ${daySnapshotButtons()}
    </div>`;
  }
  if(inGroups && partialGroup){
    return `<div class="journey-hero-card guided-card rounded-[2rem] p-4 guided-enter">
      <div class="flex items-center justify-between gap-3 mb-3">
        <div>
          <div class="text-[11px] uppercase tracking-widest font-extrabold text-slate-400">${dayPhase==="night"?"Noite · Tabela do dia":"Tabela"}</div>
          <h2 class="font-display font-extrabold text-2xl">Grupo ${partialGroup.letter}</h2>
        </div>
        <span class="text-[11px] font-extrabold text-slate-400">${partialGroup.played}/3 rodadas</span>
      </div>
      ${compactGroupCard(partialGroup, team)}
      <div class="mt-3">${nextScouting}</div>
      <p class="mt-3 text-xs font-semibold text-slate-500">${dayPhase==="night"?"Resultados do dia já entraram na classificação parcial.":"A tabela acompanha apenas o que já foi revelado na jornada."}</p>
      ${daySnapshotButtons()}
    </div>`;
  }
  const koMatches=revealedMatches.filter(m=>!isGroupStage(m));
  return `<div class="journey-hero-card guided-card rounded-[2rem] p-4 guided-enter">
    <div class="flex items-center justify-between gap-3 mb-3">
      <div>
        <div class="text-[11px] uppercase tracking-widest font-extrabold text-slate-400">${dayPhase==="night"?"Noite · Mata-mata":"Mata-mata"}</div>
        <h2 class="font-display font-extrabold text-2xl">Estado da chave</h2>
      </div>
      ${ic('git-fork','w-6 h-6 text-mxgreen')}
    </div>
    <div class="space-y-2.5">
      ${koMatches.length?koMatches.slice(-4).map(m=>`<div class="rounded-2xl bg-white/65 border border-white/70 p-3">
        <div class="text-[10px] uppercase tracking-widest font-extrabold text-slate-400">${m.stage}</div>
        <div class="mt-1 font-extrabold text-sm leading-tight">${flag(m.home)} ${m.home} <span class="tnum px-1.5">${scoreLine(m)}</span> ${flag(m.away)} ${m.away}</div>
      </div>`).join(""):`<div class="rounded-2xl bg-white/65 border border-white/70 p-4 text-sm font-semibold text-slate-500">O mata-mata ainda não começou para ${flag(team)} ${team}.</div>`}
      ${nextMatch&&!isGroupStage(nextMatch)?`<div class="rounded-2xl border border-mxgreen/25 bg-mxgreen/10 p-3">
        <div class="text-[10px] uppercase tracking-widest font-extrabold text-mxgreen">Próximo confronto</div>
        <div class="mt-1 font-extrabold text-sm leading-tight">${flag(nextMatch.home)} ${nextMatch.home} <span class="px-1.5 text-slate-400">x</span> ${flag(nextMatch.away)} ${nextMatch.away}</div>
      </div>`:""}
    </div>
    <div class="mt-3">${nextScouting}</div>
    ${daySnapshotButtons()}
  </div>`;
}

function setGuidedVisibility(showGuided){
  $("#guidedExperience").classList.toggle("hidden", !showGuided);
  $("#siteHeader").classList.toggle("hidden", showGuided);
  $("#top").classList.toggle("hidden", showGuided);
  $("#siteFooter").classList.toggle("hidden", showGuided);
}
function renderGuided(html, shellTone="", transitionTone="", shellStyle=""){
  if(journeyNewsTimer){
    clearInterval(journeyNewsTimer);
    journeyNewsTimer = null;
  }
  setGuidedVisibility(true);
  $("#guidedExperience").innerHTML = `<section class="guided-shell ${shellTone} ${transitionTone}" style="${shellStyle}"><div class="guided-sky-fade" aria-hidden="true"></div><div class="guided-celestial" aria-hidden="true"></div><div class="guided-content">${html}</div></section>`;
  paintIcons();
}
function normalizeSearchText(value){
  return String(value||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase();
}
function renderTeamPickerIntro(){
  appState.view="picker-team";
  const hasSims=appState.sims.length>0;
  const teams=getAllTeamsFromSimulation();
  const q=normalizeSearchText(appState.teamSearch).trim();
  const matchesTeamSearch=team=>{
    const meta=teamMeta[team];
    return !q || normalizeSearchText(`${team} ${meta.confederation} ${meta.status} ${meta.keyPlayers.join(" ")}`).includes(q);
  };
  const filtered=teams.filter(matchesTeamSearch);
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
          <button id="continueTeamPick" class="btn-premium text-white font-extrabold px-6 py-3.5 rounded-2xl disabled:opacity-40 disabled:pointer-events-none" ${appState.draftTeam?'':'disabled'}>Continuar</button>
          ${hasSims?`<button id="cancelPick" class="glass rounded-2xl px-5 py-3.5 font-extrabold text-slate-600">Voltar às minhas simulações</button>`:''}
        </div>
      </div>
      <div class="guided-card rounded-[2rem] p-4 sm:p-5 guided-enter">
        <div class="flex flex-col sm:flex-row sm:items-center gap-3 mb-4">
          <div class="relative flex-1">
            <i data-lucide="search" class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400"></i>
            <input id="teamSearchInput" value="${appState.teamSearch||''}" placeholder="Buscar por seleção, confederação ou status" class="w-full rounded-2xl glass px-10 py-3 text-sm font-semibold outline-none" />
          </div>
          <div id="teamSearchCount" class="text-xs text-slate-400 font-bold">${filtered.length} seleções</div>
        </div>
        <div id="teamPickerGrid" class="grid sm:grid-cols-2 xl:grid-cols-3 gap-3 max-h-[68vh] overflow-y-auto pr-1">
          ${filtered.map((team,i)=>`
            <button class="team-pick-card text-left rounded-3xl p-4 glass ${appState.draftTeam===team?'active':''} guided-stagger" style="--i:${i%18}" data-team="${team}" data-search="${normalizeSearchText(`${team} ${teamMeta[team].confederation} ${teamMeta[team].status} ${teamMeta[team].keyPlayers.join(" ")}`)}">
              <div class="flex items-start justify-between gap-3">
                <div class="flex items-center gap-3 min-w-0">
                  ${flag(team,'flag-lg')}
                  <div class="min-w-0">
                    <div class="font-display font-extrabold truncate">${team}</div>
                    <div class="text-xs text-slate-500 font-bold">${teamMeta[team].confederation} · força ${teamMeta[team].strength}</div>
                  </div>
                </div>
                ${statusPill(teamMeta[team].status)}
              </div>
              <div class="mt-3 text-xs text-slate-500 truncate">Destaques: ${teamMeta[team].keyPlayers.slice(0,3).join(", ")}</div>
            </button>`).join("")}
        </div>
      </div>
    </div>`);
  $("#teamSearchInput").oninput=e=>{
    appState.teamSearch=e.target.value;
    const q=normalizeSearchText(appState.teamSearch).trim();
    let visible=0;
    document.querySelectorAll("#teamPickerGrid [data-team]").forEach((card,idx)=>{
      const show=!q || (card.dataset.search||"").includes(q);
      card.classList.toggle("hidden", !show);
      if(show){
        visible++;
        card.style.setProperty("--i", String(Math.min(idx,18)));
      }
    });
    if($("#teamSearchCount")) $("#teamSearchCount").textContent=`${visible} seleç${visible===1?"ão":"ões"}`;
  };
  document.querySelectorAll("#teamPickerGrid [data-team]").forEach(card=>card.onclick=()=>{
    appState.draftTeam=card.dataset.team;
    document.querySelectorAll("#teamPickerGrid [data-team]").forEach(c=>c.classList.toggle("active", c===card));
    const continueBtn=$("#continueTeamPick");
    if(continueBtn) continueBtn.disabled=false;
  });
  $("#continueTeamPick").onclick=()=>{
    if(!appState.draftTeam) return;
    appState.view="picker-type";
    renderSimulationTypePicker();
  };
  if($("#cancelPick")) $("#cancelPick").onclick=()=>{ appState.view = activeRecord()?.dashboardUnlocked?"dashboard":"journey"; renderApp(); };
}
function renderSimulationTypePicker(){
  appState.view="picker-type";
  const team=appState.draftTeam || getFavoriteTeam();
  renderGuided(`
    ${renderIntroNav("type-picker")}
    <div class="max-w-6xl mx-auto guided-enter">
      <div class="text-center max-w-3xl mx-auto">
        <div class="mb-4">${flag(team,'flag-xl')}</div>
        <h1 class="font-display font-extrabold text-4xl sm:text-6xl leading-[1.02]">Escolha o tipo de <span class="grad-text">simulação</span></h1>
        <p class="mt-4 text-slate-600 text-lg">Cada estilo muda o tom da Copa, as zebras, o peso dos favoritos e o roteiro do torneio.</p>
      </div>
      <div class="grid lg:grid-cols-3 gap-5 mt-9">
        ${PROFILE_ORDER.map((type,i)=>{
          const p=profileFor(type);
          const bullets = type==="realistic"
            ? ["Favoritos tendem a ir mais longe","Placares mais controlados","Elencos profundos e técnicos pesam mais"]
            : type==="epic"
              ? ["Craques decidem jogos grandes","Clássicos e finais ganham peso narrativo","Mais viradas, prorrogações e legado"]
              : ["Mais zebras e eliminações chocantes","Mais pênaltis e gols no fim","Seleções médias podem crescer muito"];
          return `<button class="type-pick-card ${p.className} guided-card rounded-[2rem] p-6 text-left guided-stagger" style="--i:${i}" data-type="${type}">
            ${renderSimulationTypeBadge(type)}
            <h2 class="mt-5 font-display font-extrabold text-2xl">${p.label}</h2>
            <p class="mt-2 text-slate-600 leading-relaxed">${p.description}</p>
            <div class="mt-5 space-y-2">${bullets.map(b=>`<div class="flex gap-2 text-sm font-semibold text-slate-600">${ic('check-circle-2','w-4 h-4')} ${b}</div>`).join("")}</div>
          </button>`;
        }).join("")}
      </div>
      <div class="mt-7 text-center">
        <button id="backToTeams" class="glass rounded-2xl px-5 py-3 font-bold text-slate-600">Trocar seleção</button>
      </div>
    </div>`);
  document.querySelectorAll("[data-type]").forEach(card=>card.onclick=()=>{
    commitSimulation(team, card.dataset.type);
  });
  $("#backToTeams").onclick=startNewSimulation;
}

// ============================================================
// AUTO-ADVANCE
// ============================================================
let _autoRafId = null;

function startAutoAdvance(){
  if(appState.autoAdvancing) return;
  appState.autoAdvancing = true;
  renderFavoriteTeamJourney();
  setTimeout(runAutoAdvance, 80);
}

function pauseAutoAdvance(){
  appState.autoAdvancing = false;
  if(_autoRafId){ cancelAnimationFrame(_autoRafId); _autoRafId = null; }
  if(appState.autoAdvanceTimer){ clearTimeout(appState.autoAdvanceTimer); appState.autoAdvanceTimer = null; }
  document.querySelector(".auto-advance-banner")?.remove();
  renderFavoriteTeamJourney();
}

function runAutoAdvance(){
  if(!appState.autoAdvancing) return;
  const r=activeRecord(); if(!r){ pauseAutoAdvance(); return; }
  const ctx=journeyVisibleContext(r);
  if(ctx.finished || ctx.canPlayFavoriteToday){ pauseAutoAdvance(); return; }

  const fromAbs=absoluteJourneyMinute(r.calendarDayIndex, r.journeyMinute);
  const all=matchesWithAbsoluteMinutes(ctx.days).filter(x=>!hasWatchedMatch(r,x.match) && x.abs>=fromAbs);
  const fav=r.favoriteTeam;
  const nextOther=all.find(x=>x.match.home!==fav && x.match.away!==fav);
  const nextFav=all.find(x=>x.match.home===fav || x.match.away===fav);
  if(!nextOther && !nextFav){ pauseAutoAdvance(); return; }
  const event = (!nextOther || (nextFav && nextFav.abs<=nextOther.abs))
    ? {type:"favorite", ...nextFav}
    : {type:"match", ...nextOther};

  autoAnimateSky(r.calendarDayIndex, r.journeyMinute, event.dayIndex, event.minute, 700, ()=>{
    if(!appState.autoAdvancing) return;
    const previousDay=r.calendarDayIndex;
    r.calendarDayIndex=event.dayIndex;
    r.journeyMinute=event.minute;
    r.dayPhase=dayPhaseForMinute(event.minute);

    if(event.type==="favorite"){
      appState.autoAdvancing=false;
      persistSims();
      renderFavoriteTeamJourney();
      return;
    }

    revealCalendarMatch(r, event.match);
    persistSims();
    updateAutoAdvanceClock(event.minute);
    const continueAuto=()=>{
      if(!appState.autoAdvancing) return;
      appState.autoAdvanceTimer=setTimeout(runAutoAdvance, 120);
    };
    if(previousDay!==event.dayIndex){
      renderFavoriteTeamJourney();
      appState.autoAdvanceTimer=setTimeout(()=>showAutoAdvanceBanner(event.match, continueAuto), 100);
    } else {
      showAutoAdvanceBanner(event.match, continueAuto);
    }
  });
}

function autoAnimateSky(fromDay, fromMin, toDay, toMin, duration, onComplete){
  const fromAbs=absoluteJourneyMinute(fromDay, fromMin);
  const toAbs=absoluteJourneyMinute(toDay, toMin);
  if(toAbs<=fromAbs){ onComplete(); return; }
  const diff=toAbs-fromAbs;
  const start=performance.now();
  function frame(now){
    if(!appState.autoAdvancing){ onComplete(); return; }
    const t=Math.min(1,(now-start)/duration);
    const ease=1-Math.pow(1-t,3);
    const minute=Math.round(fromAbs+diff*ease)%1440;
    const shell=document.querySelector(".guided-shell");
    if(shell){
      shell.setAttribute("style", skyVarsForMinute(minute));
      const night=dayPhaseForMinute(minute)==="night";
      shell.classList.toggle("guided-night", night);
      shell.classList.toggle("guided-day", !night);
    }
    const clockEl=document.getElementById("journeyClock");
    if(clockEl) clockEl.textContent=formatJourneyMinute(minute);
    const trackEl=document.querySelector(".journey-clock-track span");
    if(trackEl) trackEl.style.width=`${Math.max(0,Math.min(100,(minute/1440)*100))}%`;
    if(t<1){ _autoRafId=requestAnimationFrame(frame); }
    else onComplete();
  }
  _autoRafId=requestAnimationFrame(frame);
}

function updateAutoAdvanceClock(minute){
  const clockEl=document.getElementById("journeyClock");
  if(clockEl) clockEl.textContent=formatJourneyMinute(minute);
  const trackEl=document.querySelector(".journey-clock-track span");
  if(trackEl) trackEl.style.width=`${Math.max(0,Math.min(100,(minute/1440)*100))}%`;
}

function showAutoAdvanceBanner(match, onComplete){
  document.querySelector(".auto-advance-banner")?.remove();
  const container=document.querySelector(".journey-hero-card");
  if(!container){ onComplete(); return; }
  const winner=getMatchWinnerTeam(match);
  const barClass=!winner?"draw":winner===match.home?"from-left":"from-right";
  const b=document.createElement("div");
  b.className="auto-advance-banner";
  b.innerHTML=`<div class="auto-advance-bar ${barClass}"></div>
    <div class="auto-advance-result">
      <span class="auto-advance-team">${flag(match.home)} <b>${match.home}</b></span>
      <span class="auto-advance-score" data-final-score="${match.ga} × ${match.gb}">0<span style="margin:0 8px;opacity:.5">×</span>0</span>
      <span class="auto-advance-team"><b>${match.away}</b> ${flag(match.away)}</span>
    </div>`;
  container.style.position="relative";
  container.appendChild(b);
  const score=b.querySelector(".auto-advance-score");
  appState.autoAdvanceTimer=setTimeout(()=>{
    if(score){
      score.classList.add("is-final");
      score.textContent=score.dataset.finalScore || `${match.ga} × ${match.gb}`;
    }
  }, 520);
  appState.autoAdvanceTimer=setTimeout(()=>{
    b.classList.add("is-out");
    setTimeout(()=>{ b.remove(); onComplete(); }, 420);
  }, 1850);
}

function renderFavoriteTeamJourney(){
  appState.view="journey";
  const record=activeRecord();
  if(!record){ startNewSimulation(); return; }
  const team=record.favoriteTeam, type=record.type, profile=profileFor(type);
  const sim=simObjFor(record);
  const ctx=journeyVisibleContext(record);
  const matches=ctx.matches;
  const revealed=ctx.revealed;
  const finished = ctx.finished;
  if(record.finished!==finished) { record.finished=finished; persistSims(); }
  const status=journeyQuickSituation(ctx);
  const nextMatch=ctx.nextMatch;
  const dayPhase=ctx.dayPhase;
  const period=ctx.period;
  const previousShell=document.querySelector("#guidedExperience .guided-shell");
  const previousTone=previousShell?.classList.contains("guided-night") ? "night" : previousShell?.classList.contains("guided-day") ? "day" : "";
  const nextTone=period==="night" ? "night" : "day";
  const transitionTone=previousTone && previousTone!==nextTone ? `sky-from-${previousTone}` : "";
  const shellTone = dayPhase === "night" ? "guided-night" : "guided-day";
  renderGuided(`
    ${renderIntroNav("journey")}
    <div class="max-w-7xl mx-auto">
      <div class="grid xl:grid-cols-[1fr_1.08fr_1fr] gap-5 items-stretch">
      ${renderCalendarDayCard(ctx, type)}
      ${renderJourneyNews(ctx)}
      ${renderJourneySituation(ctx)}
    </div>
      <div class="guided-card rounded-[2rem] p-4 sm:p-5 guided-enter mt-5">
        <div class="mb-4">
          <div class="flex items-start justify-between gap-4">
            <div>
              <div class="text-[11px] uppercase tracking-widest font-extrabold text-slate-400">Campanha de ${team}</div>
              <div class="font-display font-extrabold text-2xl">Jogo a jogo</div>
            </div>
            <div class="text-right shrink-0">
              <div class="text-[10px] uppercase tracking-widest font-extrabold text-slate-400">Progresso</div>
              <div class="font-extrabold text-xl tnum">${revealed}<span class="text-slate-400 font-semibold text-sm"> / ${matches.length}</span></div>
            </div>
          </div>
          <div class="mt-3 h-2.5 rounded-full bg-slate-200/70 overflow-hidden">
            <div class="h-full rounded-full" style="width:${matches.length ? Math.round(revealed/matches.length*100) : 0}%;background:var(--grad-2026);transition:width .6s cubic-bezier(.2,.8,.2,1)"></div>
          </div>
          <div class="mt-1.5 flex items-center justify-between text-[10px] font-bold text-slate-400">
            <span>${revealed===0 ? 'Nenhum jogo revelado ainda' : revealed>=matches.length ? '🏆 Campanha concluída!' : matches.length-revealed===1 ? '1 jogo restante' : `${matches.length-revealed} jogos restantes`}</span>
            <span class="tnum">${matches.length ? Math.round(revealed/matches.length*100) : 0}%</span>
          </div>
        </div>
        ${progressiveCampaign(record)}
      </div>
    </div>`, `guided-${nextTone}`, transitionTone, skyVarsForMinute(ctx.journeyMinute));
  document.querySelectorAll(".day-snap-btn").forEach(b=> b.onclick=()=>openDaySnapshot(b.dataset.snap));
  document.querySelectorAll(".replay-btn").forEach(b=> b.onclick=()=>{ const i=Number(b.dataset.idx); if(matches[i]) openMatchSimulator(matches[i], i); });
  document.querySelectorAll(".switch-sim").forEach(b=> b.onclick=()=>{ setActiveSimulation(b.dataset.id); renderApp(); });
  document.querySelectorAll(".del-sim").forEach(b=> b.onclick=()=>{ if(confirm("Excluir esta simulação?")){ deleteSimulation(b.dataset.id); renderApp(); } });
  if($("#newSimFromJourney")) $("#newSimFromJourney").onclick=startNewSimulation;
  if($("#campaignDashboard")) $("#campaignDashboard").onclick=openFullDashboard;
  wireJourneyNewsCarousel();
  document.querySelectorAll(".calendar-play").forEach(b=> b.onclick=()=>{
    const matchNo=Number(b.dataset.matchNo);
    const match=ctx.dayMatches.find(m=>m.matchNo===matchNo);
    const idx=match ? matchFavoriteIndex(match, matches) : -1;
    if(match && idx>=0) openTacticPlanner(match, idx);
  });
  document.querySelectorAll(".calendar-watch").forEach(b=> b.onclick=()=>{
    const matchNo=Number(b.dataset.matchNo);
    const match=ctx.dayMatches.find(m=>m.matchNo===matchNo);
    if(!match) return;
    const idx=matchFavoriteIndex(match, matches);
    openMatchSimulator(match, idx>=0 ? idx : -1);
  });
  if($("#autoAdvanceClock")) $("#autoAdvanceClock").onclick=startAutoAdvance;
  if($("#pauseAutoAdvance")) $("#pauseAutoAdvance").onclick=pauseAutoAdvance;
  if($("#startJourney")) $("#startJourney").onclick=()=>{ if(matches[revealed] && !finished) openTacticPlanner(matches[revealed], revealed); };
  if($("#observeMatch")) $("#observeMatch").onclick=advanceObserverMatch;
  if($("#askDashboard")) $("#askDashboard").onclick=()=>{ if(finished) renderDashboardConfirmation(); };
  $("#journeyTypeBack").onclick=changeSimulationType;
  $("#resetGuidedSmall").onclick=resetGuidedExperience;
}
function renderDashboardConfirmation(){
  const team=getFavoriteTeam();
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
  $("#openDashboardNow").onclick=openFullDashboard;
  $("#keepJourney").onclick=renderFavoriteTeamJourney;
}
function renderFullDashboard(){
  setGuidedVisibility(false);
  const r=activeRecord(); if(r){ r.dashboardUnlocked=true; persistSims(); }
  syncDashboardState();
  renderAll();
}
function renderApp(){
  if(appState.draftTeam && !TEAMS[appState.draftTeam]) appState.draftTeam=null;
  if(appState.view==="picker-team"){ renderTeamPickerIntro(); return; }
  if(appState.view==="picker-type"){ renderSimulationTypePicker(); return; }
  if(!appState.sims.length){ appState.view="picker-team"; renderTeamPickerIntro(); return; }
  const r=activeRecord();
  if(!r){ appState.view="picker-team"; renderTeamPickerIntro(); return; }
  if(appState.view==="dashboard" || r.dashboardUnlocked){ renderFullDashboard(); return; }
  renderFavoriteTeamJourney();
}
/* ---- TABS = simulações salvas (trocar / excluir / nova) ---- */

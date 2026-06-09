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
  if(r){ r.revealed=0; r.finished=false; r.dashboardUnlocked=false; r.dayPhase="morning"; persistSims(); }
  appState.view="journey";
  renderFavoriteTeamJourney();
}
function advanceToNextMorning(){
  const r=activeRecord();
  if(r){ r.dayPhase="morning"; persistSims(); }
  renderFavoriteTeamJourney();
}
function openFullDashboard(){
  const r=activeRecord(); if(r){ r.dashboardUnlocked=true; persistSims(); }
  appState.view="dashboard";
  renderFullDashboard();
}
function renderIntroNav(step){
  const steps=[["team-picker","Seleção"],["type-picker","Tipo"],["journey","Jornada"],["dashboard","Dashboard"]];
  return `<div class="max-w-7xl mx-auto flex items-center justify-between gap-4 mb-8 guided-enter">
    <div class="flex items-center gap-2.5">
      <span class="grid place-items-center w-10 h-10 rounded-2xl text-white text-sm font-extrabold" style="background:var(--grad-2026)">26</span>
      <div>
        <div class="font-display font-extrabold leading-tight">Copa 2026 · Jornada guiada</div>
        <div class="text-xs text-slate-500 font-semibold">Viva primeiro a campanha da sua seleção</div>
      </div>
    </div>
    <div class="hidden sm:flex items-center gap-2">
      ${steps.map(([id,label],i)=>`<span class="px-3 py-1.5 rounded-full text-xs font-extrabold ${id===step?'bg-ink text-white':'glass text-slate-500'}">${i+1}. ${label}</span>`).join("")}
    </div>
  </div>`;
}
function statusPill(status){
  const color = status==="Favorita"?"text-gold-600 bg-gold-500/15":status==="Anfitriã"?"text-usablue bg-usablue/10":status==="Zebra"?"text-usared bg-usared/10":"text-mxgreen bg-mxgreen/10";
  return `<span class="text-[10px] font-extrabold uppercase tracking-wider px-2 py-1 rounded-full ${color}">${status}</span>`;
}
function getMatchWinnerTeam(m){
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
  const {sim, team, matches, revealed, dayPhase, nextMatch, currentRound}=ctx;
  let title="", body="";
  if(kind==="groups"){
    const uptoRound = dayPhase==="morning" ? currentRound : Math.max(currentRound, 0);
    const groups=partialStandings(sim, uptoRound);
    title = uptoRound ? `Grupos no estado do dia · Rodada ${uptoRound}` : "Grupos antes da estreia";
    body = `<p class="text-sm text-slate-500 mb-3">Mostra apenas o estado já vivido na jornada, sem antecipar o próximo jogo da sua seleção.</p>
      <div class="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">${groups.map(g=>compactGroupCard(g,team)).join("")}</div>`;
  } else {
    const revealedMatches=matches.slice(0,revealed);
    const nextKO = nextMatch && !isGroupStage(nextMatch);
    const frontier = nextKO ? (KO_ORDER[nextMatch.stage]||1) : favoriteFrontierKO(matches, revealed);
    const favNos=new Set(revealedMatches.filter(x=>!isGroupStage(x)).map(x=>x.matchNo));
    if(!frontier){
      title="Chaveamento do dia";
      body=`<div class="glass rounded-2xl p-8 text-center text-slate-500 font-semibold">O mata-mata ainda não começou para ${flag(team)} ${team}. Quando a jornada chegar lá, este painel mostra a chave sem entregar resultados futuros.</div>`;
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
    const m=matches[revealed];
    html+=`<div class="journey-match-card glass rounded-3xl p-4 pl-14 shadow-glass" style="box-shadow:0 0 0 2px rgba(10,49,97,.25),0 12px 36px -22px rgba(15,23,42,.5)">
      <div class="absolute left-[13px] top-5 grid place-items-center w-10 h-10 rounded-full text-white shadow-glass font-extrabold text-xs" style="background:var(--grad-2026)">${revealed+1}</div>
      <div class="text-[11px] uppercase tracking-wider font-extrabold text-usablue">Próximo jogo${m.matchNo?` · M${m.matchNo}`:''}</div>
      <div class="text-[11px] uppercase tracking-wider font-extrabold text-slate-400">${m.stage} · ${m.kickoff || m.city}</div>
      <div class="mt-1 font-display font-extrabold text-lg flex flex-wrap items-center gap-2">${flag(m.home)} ${m.home} <span class="px-2 py-0.5 rounded-xl bg-slate-200 text-slate-500 tnum text-sm">VS</span> ${flag(m.away)} ${m.away}</div>
      <div class="text-sm text-slate-500 mt-1">Resultado oculto — simule a partida para viver o placar.</div>
      <button class="simulate-team-match btn-premium text-white font-bold px-4 py-2.5 rounded-2xl mt-3" data-match-index="${revealed}">${ic('play','w-4 h-4')} Simular partida</button>
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
    <div class="space-y-2">
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
  const finished=revealed>=matches.length;
  const dayPhase = finished ? "night" : (record.dayPhase==="night" ? "night" : "morning");
  const revealedMatches=matches.slice(0,revealed);
  const nextMatch=finished ? null : matches[revealed];
  const groupMatches=matches.filter(isGroupStage);
  const groupRevealed=revealedMatches.filter(isGroupStage);
  const currentRound = groupRevealed.length ? Math.max(...groupRevealed.map(m=>m.round||0)) : 0;
  const favGroup=favoriteGroup(sim,team);
  const allPartialGroups=partialStandings(sim, currentRound);
  const partialGroup=favGroup ? allPartialGroups.find(g=>g.letter===favGroup.letter) : null;
  return {sim, team, matches, revealed, finished, dayPhase, revealedMatches, nextMatch, groupMatches, groupRevealed, currentRound, favGroup, partialGroup, allPartialGroups};
}
function journeyQuickSituation(ctx){
  const {sim, team, revealed, finished, dayPhase, revealedMatches, nextMatch, partialGroup}=ctx;
  const last=revealedMatches[revealedMatches.length-1];
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
function journeyNewsItems(ctx){
  const {sim, team, revealed, finished, revealedMatches, nextMatch, partialGroup, allPartialGroups, currentRound}=ctx;
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
  if(ctx.dayPhase==="morning"){
    const prepMatch=nextMatch;
    const opponent=prepMatch?.opponent || groupRivals[0] || otherA;
    const homeAway = prepMatch?.home===team ? "como mandante da tabela" : "fora da ordem principal da tabela";
    const needsResult = row && row.P <= 1 && newsRound >= 2;
    const comfortable = row && row.pos <= 2 && row.P >= 4;
    return [
      {type:"good", section:`Manhã · ${roundLabel}`, tag:"PLANO DE JOGO", title:`${flag(team)} ${team} prepara pressão inicial contra ${opponent}`, text:`A comissão de ${TEAMS[team].coach} ensaia uma entrada forte para não deixar o jogo cair no ritmo do adversário.`, meta:nextLine},
      {type:"good", section:`Manhã · ${roundLabel}`, tag:"PROTAGONISTA", title:`${flag(team)} ${key} vira referência no vestiário`, text:`O camisa de maior peso técnico aparece como ponto de apoio para acelerar jogadas e quebrar linhas.`, meta:pressureMeta},
      {type:"good", section:`Manhã · ${roundLabel}`, tag:"AJUSTE FINO", title:`${flag(team)} ${secondKey} ganha liberdade no último treino`, text:`A preparação indica uma função mais solta para atacar o espaço entre meio-campo e defesa rival.`, meta:homeAway},
      {type:comfortable?"good":"bad", section:`Manhã · ${roundLabel}`, tag:comfortable?"CONTROLE":"PRESSÃO", title:comfortable?`${flag(team)} ${team} tenta administrar vantagem no grupo`:`${flag(team)} ${team} joga com margem curta`, text:comfortable?`A campanha permite um plano mais paciente, mas a comissão evita falar em classificação antecipada.`:`O ambiente é de atenção total: qualquer tropeço pode bagunçar a tabela da seleção.`, meta:pressureMeta},
      {type:"bad", section:`Manhã · ${roundLabel}`, tag:"DÚVIDA FÍSICA", title:`${flag(team)} ${newsPlayer(team,2)} fica sob observação`, text:`O jogador participa da preparação, mas a intensidade do aquecimento virou pauta entre comissão e imprensa.`, meta:"Decisão perto da bola rolar"},
      {type:needsResult?"bad":"good", section:`Manhã · ${roundLabel}`, tag:needsResult?"JOGO-CHAVE":"CONFIANÇA", title:needsResult?`${flag(team)} ${team} trata partida como virada de chave`:`${flag(team)} elenco vê jogo como chance de crescer`, text:needsResult?`A pontuação força uma resposta imediata, e o plano passa por reduzir riscos nos primeiros minutos.`:`A leitura interna é que uma vitória pode mudar o peso emocional da campanha.`, meta:nextLine},
      {type:"bad", section:`Manhã · ${roundLabel}`, tag:"ADVERSÁRIO", title:`${flag(opponent)} ${newsPlayer(opponent,0)} concentra atenção defensiva`, text:`O rival tem um nome monitorado de perto e pode puxar marcações para abrir espaço no último terço.`, meta:`Olho em ${opponent}`},
      {type:"good", section:`Manhã · Rodada ${newsRound}`, tag:"TERMÔMETRO", title:`${flag(otherA)} ${otherA} chega com bastidor positivo`, text:`Em outro grupo, a seleção aparece entre as mais confiantes do dia e tenta transformar favoritismo em placar.`, meta:groupLeaders[0]?`Grupo ${groupLeaders[0].group.letter}`:"Central da Copa"},
      {type:"bad", section:`Manhã · Rodada ${newsRound}`, tag:"ALERTA MÉDICO", title:`${flag(otherB)} ${newsPlayer(otherB,0)} vira preocupação antes da rodada`, text:`A escalação ainda não é tratada como problema fechado, mas a notícia muda o tom da preparação.`, meta:groupLeaders[1]?`Grupo ${groupLeaders[1].group.letter}`:"Pré-jogo geral"},
      {type:"good", section:`Manhã · Rodada ${newsRound}`, tag:"BRIGA ABERTA", title:`${flag(otherC)} ${otherC} mira topo em grupo apertado`, text:`A rodada pode redesenhar a liderança e transformar confronto paralelo em notícia central do dia.`, meta:tightGroup?`${tightGroup.first.team} na cola`:"Rodada geral"},
      {type:"bad", section:`Manhã · Rodada ${newsRound}`, tag:"RISCO DE ZEBRA", title:`${flag(otherD)} ${otherD} entra sob aviso contra tropeço`, text:`A comissão evita clima de oba-oba e cobra concentração para não perder pontos em jogo teoricamente controlável.`, meta:`${newsPlayer(otherD,1)} cobrado`},
      {type:"good", section:`Manhã · ${roundLabel}`, tag:"ARQUIBANCADA", title:`${flag(team)} torcida cria clima de decisão`, text:`A movimentação em torno do estádio dá ao jogo cara de mata-mata, mesmo antes da bola rolar.`, meta:matchScheduleLine(prepMatch || {})},
      {type:"bad", section:`Manhã · ${roundLabel}`, tag:"BASTIDOR TÁTICO", title:`${flag(team)} ${TEAMS[team].shape} pode mudar durante o jogo`, text:`A formação inicial é mantida, mas a comissão prepara alternativas se o adversário bloquear os lados do campo.`, meta:`Técnico: ${TEAMS[team].coach}`},
      {type:"good", section:`Manhã · Rodada ${newsRound}`, tag:"OLHO NO CRAQUE", title:`${flag(otherA)} ${newsPlayer(otherA,0)} promete movimentar a rodada`, text:`O jogador chega cercado de expectativa e pode influenciar diretamente a tabela do grupo.`, meta:groupLeaders[0]?`Líder do Grupo ${groupLeaders[0].group.letter}`:"Panorama"},
    ];
  }
  const playedRound = Math.max(1, Math.min(last?.round || currentRound || newsRound, 3));
  const roundMatches = groupRoundMatches(sim, playedRound, team);
  const gm1=pickMatch(roundMatches,0), gm2=pickMatch(roundMatches,1), gm3=pickMatch(roundMatches,2), gm4=pickMatch(roundMatches,3);
  const lastWinner=getMatchWinnerTeam(last);
  const decisiveTeam=lastWinner || team;
  const decisivePlayer=matchHeadlinePlayer(last, decisiveTeam);
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
  return [
    {type:won?"good":"bad", section:`Noite · ${last?.stage || roundLabel}`, tag:eliminated?"ELIMINAÇÃO":"RESULTADO", title:eliminated?eliminationTitle:won?`${flag(team)} ${team} vence e muda o tom da campanha`:`${flag(team)} ${team} tropeça e liga alerta`, text:eliminated?eliminationText:last?`${matchResultText(last)} foi tratado internamente como ${resultMood}. A leitura agora passa pela tabela e pelo desgaste do elenco.`:"A rodada termina com clima de análise.", meta:eliminated?(earlyElimination?"Pressão máxima":"Fim de campanha"):resultMeta},
    {type:"good", section:`Noite · ${last?.stage || roundLabel}`, tag:"PERSONAGEM", title:`${flag(decisiveTeam)} ${decisivePlayer} ganha manchete da noite`, text:`O jogador sai do jogo como rosto mais citado da transmissão e vira tema da entrevista coletiva.`, meta:last?matchResultText(last):"Pós-jogo"},
    {type:lost?"bad":"good", section:`Noite · ${last?.stage || roundLabel}`, tag:"VESTIÁRIO", title:lost?`${flag(team)} ${team}: vestiário cobra reação imediata`:`${flag(team)} ${team}: vestiário fala em passo importante`, text:lost?`A comissão evita caça às bruxas, mas a conversa pós-jogo aponta ajustes urgentes para a próxima manhã.`:`A vitória não vira festa exagerada: o grupo fala em recuperar energia e manter concentração.`, meta:nextLine},
    {type:favoritePain?"bad":"good", section:`Noite · ${last?.stage || roundLabel}`, tag:favoritePain?"SITUAÇÃO DELICADA":"TABELA", title:favoritePain?`${flag(team)} ${team} fica fora da zona desejada`:`${flag(team)} ${team} ainda controla parte do próprio caminho`, text:favoritePain?`A pontuação coloca pressão real na sequência e torna os critérios de desempate assunto obrigatório.`:`A tabela não está resolvida, mas o cenário permite planejamento sem desespero.`, meta:resultMeta},
    {type:"bad", section:`Noite · ${last?.stage || roundLabel}`, tag:"ANÁLISE", title:`${flag(team)} ${newsPlayer(team,1)} vira foco do debate tático`, text:`A atuação individual entra no centro da conversa porque mexeu com encaixes, pressão pós-perda e saída de bola.`, meta:last?matchResultText(last):"Mesa redonda"},
    {type:"good", section:`Noite · ${last?.stage || roundLabel}`, tag:"BANCO DECISIVO", title:`${flag(decisiveTeam)} mudanças alteram ritmo no fim`, text:`As substituições foram lidas como tentativa de controlar energia e ganhar duelos nos minutos finais.`, meta:last?.substitutions?.length?`${last.substitutions.length} troca(s) no jogo`:"Gestão de elenco"},
    {type:"good", section:`Noite · Rodada ${playedRound}`, tag:"TABELA DO DIA", title:`${flag(otherA)} ${otherA} fecha a noite em alta`, text:`A combinação de resultados melhora o ambiente e coloca a seleção entre os assuntos fortes da rodada.`, meta:groupLeaders[0]?`Grupo ${groupLeaders[0].group.letter}`:"Tabela parcial"},
    {type:"bad", section:`Noite · Rodada ${playedRound}`, tag:"ZEBRA", title:gm1?`${flag(getMatchWinnerTeam(gm1)||gm1.home)} ${getMatchWinnerTeam(gm1)||gm1.home} bagunça projeções`:`${flag(otherB)} ${otherB} escapa de crise por pouco`, text:gm1?`${matchResultText(gm1)} entra no pacote de resultados que muda leitura de força da rodada.`:`A seleção deixa a noite sem tranquilidade total.`, meta:gm1?`Grupo ${gm1.group} · ${matchResultMood(gm1)}`:"Pós-jogo geral"},
    {type:"good", section:`Noite · Rodada ${playedRound}`, tag:"NOME DA RODADA", title:`${flag(otherB)} ${matchHeadlinePlayer(gm2, otherB)} aparece nos holofotes`, text:`O nome ganha manchetes depois de influenciar uma rodada cheia de jogos paralelos importantes.`, meta:gm2?matchResultText(gm2):"Rodada paralela"},
    {type:"bad", section:`Noite · Rodada ${playedRound}`, tag:"TROPEÇO", title:gm3?`${flag(gm3.home)} ${gm3.home} vê resultado virar problema`:`${flag(otherC)} ${otherC} perde margem`, text:gm3?`${matchResultText(gm3)} aumenta a pressão por resposta imediata e muda o peso da próxima partida.`:`A seleção entra na próxima manhã com menos conforto.`, meta:gm3?`Grupo ${gm3.group} · ${matchResultMood(gm3)}`:"Tabela"},
    {type:"good", section:`Noite · Rodada ${playedRound}`, tag:"CLASSIFICAÇÃO", title:`${flag(otherC)} ${otherC} esquenta briga da chave`, text:`A noite termina com a seleção no centro dos cálculos, especialmente pelos critérios de saldo e gols marcados.`, meta:tightGroup?`${tightGroup.first.team} e ${otherC}`:"Grupo aberto"},
    {type:"bad", section:`Noite · Rodada ${playedRound}`, tag:"CRISE", title:gm4?`${flag(gm4.away)} ${gm4.away} fecha o dia sob suspeita`:`${flag(otherD)} ${otherD} vira assunto negativo`, text:gm4?`${matchResultText(gm4)} deixa perguntas sobre postura, banco e capacidade de reação.`:`A seleção precisa responder rápido para não perder força.`, meta:gm4?`Grupo ${gm4.group}`:`${newsPlayer(otherD,1)} cobrado`},
    {type:"good", section:`Noite · ${last?.stage || roundLabel}`, tag:"LEITURA TÁTICA", title:`${flag(team)} plano de ${TEAMS[team].coach} ganha nova interpretação`, text:`O resultado reforça que a campanha será decidida tanto por nomes fortes quanto pela gestão dos momentos de pressão.`, meta:`Esquema-base ${TEAMS[team].shape}`},
    {type:"bad", section:`Noite · ${last?.stage || roundLabel}`, tag:"DESGASTE", title:`${flag(team)} sequência liga alerta físico`, text:`A comissão já monitora recuperação, minutos jogados e possíveis mudanças para evitar queda de intensidade.`, meta:"Recuperação até a próxima manhã"},
  ];
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
function renderJourneySituation(ctx){
  const {team, revealed, dayPhase, nextMatch, partialGroup, groupMatches, revealedMatches}=ctx;
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
    ${daySnapshotButtons()}
  </div>`;
}

function setGuidedVisibility(showGuided){
  $("#guidedExperience").classList.toggle("hidden", !showGuided);
  $("#siteHeader").classList.toggle("hidden", showGuided);
  $("#top").classList.toggle("hidden", showGuided);
  $("#siteFooter").classList.toggle("hidden", showGuided);
}
function renderGuided(html, shellTone=""){
  if(journeyNewsTimer){
    clearInterval(journeyNewsTimer);
    journeyNewsTimer = null;
  }
  setGuidedVisibility(true);
  $("#guidedExperience").innerHTML = `<section class="guided-shell ${shellTone}"><div class="guided-celestial" aria-hidden="true"></div>${html}</section>`;
  paintIcons();
}
function renderTeamPickerIntro(){
  appState.view="picker-team";
  const hasSims=appState.sims.length>0;
  const teams=getAllTeamsFromSimulation();
  const q=(appState.teamSearch||"").trim().toLowerCase();
  const filtered=teams.filter(t=>!q || t.toLowerCase().includes(q) || teamMeta[t].confederation.toLowerCase().includes(q) || teamMeta[t].status.toLowerCase().includes(q));
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
          <div class="text-xs text-slate-400 font-bold">${filtered.length} seleções</div>
        </div>
        <div id="teamPickerGrid" class="grid sm:grid-cols-2 xl:grid-cols-3 gap-3 max-h-[68vh] overflow-y-auto pr-1">
          ${filtered.map((team,i)=>`
            <button class="team-pick-card text-left rounded-3xl p-4 glass ${appState.draftTeam===team?'active':''} guided-stagger" style="--i:${i%18}" data-team="${team}">
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
  $("#teamSearchInput").oninput=e=>{ appState.teamSearch=e.target.value; renderTeamPickerIntro(); };
  document.querySelectorAll("#teamPickerGrid [data-team]").forEach(card=>card.onclick=()=>{
    appState.draftTeam=card.dataset.team;
    renderTeamPickerIntro();
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
function renderFavoriteTeamJourney(){
  appState.view="journey";
  const record=activeRecord();
  if(!record){ startNewSimulation(); return; }
  const team=record.favoriteTeam, type=record.type, profile=profileFor(type);
  const sim=simObjFor(record);
  const matches=getTeamMatches(sim,team);
  const revealed=Math.min(record.revealed, matches.length);
  const finished = revealed>=matches.length;
  if(finished) { record.finished=true; persistSims(); }
  const ctx=journeyVisibleContext(record);
  const status=journeyQuickSituation(ctx);
  const nextMatch=ctx.nextMatch;
  const dayPhase=ctx.dayPhase;
  renderGuided(`
    ${renderIntroNav("journey")}
    <div class="max-w-7xl mx-auto">
      <div class="grid xl:grid-cols-[1fr_1.08fr_1fr] gap-5 items-stretch">
        <div class="journey-hero-card guided-card rounded-[2rem] p-4 sm:p-5 guided-enter ${finished&&sim.champion===team?'confetti-soft':''}">
        <div class="flex items-center justify-between gap-4">
          ${renderSimulationTypeBadge(type)}
          <div class="flex items-center gap-2">
            <span class="px-3 py-1.5 rounded-full text-[10px] uppercase tracking-widest font-extrabold ${dayPhase==="morning"?'bg-gold-500/15 text-gold-700':'bg-ink text-white'}">${dayPhase==="morning"?'Manhã':'Noite'}</span>
            <button id="journeyTypeBack" class="text-xs font-extrabold text-slate-500 hover:text-ink">Trocar tipo</button>
          </div>
        </div>
        <div class="mt-5 flex items-center gap-4">
          ${flag(team,'flag-xl')}
          <div>
            <h1 class="font-display font-extrabold text-3xl leading-tight">${team}</h1>
            <p class="mt-2 text-slate-500 font-semibold">${teamMeta[team].confederation} · ${teamMeta[team].status} · técnico: ${TEAMS[team].coach}</p>
          </div>
        </div>
        <div class="mt-4 journey-status ${status.tone}">
          <div class="text-[10px] uppercase tracking-widest font-extrabold opacity-70">${status.eyebrow}</div>
          <div class="mt-1 font-display font-extrabold text-xl">${status.title}</div>
          <p class="mt-2 text-sm leading-relaxed">${status.text}</p>
        </div>
        <div class="mt-4 grid gap-3">
          ${finished
            ? `<button id="askDashboard" class="btn-premium text-white font-extrabold rounded-2xl px-5 py-3.5">${ic('layout-dashboard','w-4 h-4')} Ver Copa completa</button>`
            : dayPhase==="morning"
              ? `<button id="startJourney" class="btn-premium text-white font-extrabold rounded-2xl px-5 py-3.5" ${matches.length?'':'disabled'}>${revealed===0?'Jogar estreia':nextMatch?`Jogar ${nextMatch.stage}`:'Jogar próxima partida'}</button>`
              : `<button id="advanceMorning" class="btn-premium text-white font-extrabold rounded-2xl px-5 py-3.5">${ic('sun','w-4 h-4')} Avançar para a próxima manhã</button>`}
        </div>
        ${savedSimsPanel()}
        <button id="resetGuidedSmall" class="mt-3 text-xs font-extrabold text-slate-400 hover:text-usared">Reiniciar progresso desta simulação</button>
      </div>
      ${renderJourneyNews(ctx)}
      ${renderJourneySituation(ctx)}
    </div>
      <div class="guided-card rounded-[2rem] p-4 sm:p-5 guided-enter mt-5">
        <div class="mb-4">
          <div class="text-[11px] uppercase tracking-widest font-extrabold text-slate-400">Campanha de ${team}</div>
          <div class="font-display font-extrabold text-2xl">Jogo a jogo</div>
        </div>
        ${progressiveCampaign(record)}
      </div>
    </div>`, dayPhase==="night" ? "guided-night" : "guided-day");
  wireJourneyMatchButtons();
  document.querySelectorAll(".day-snap-btn").forEach(b=> b.onclick=()=>openDaySnapshot(b.dataset.snap));
  document.querySelectorAll(".replay-btn").forEach(b=> b.onclick=()=>{ const i=Number(b.dataset.idx); if(matches[i]) openMatchSimulator(matches[i], i); });
  document.querySelectorAll(".switch-sim").forEach(b=> b.onclick=()=>{ setActiveSimulation(b.dataset.id); renderApp(); });
  document.querySelectorAll(".del-sim").forEach(b=> b.onclick=()=>{ if(confirm("Excluir esta simulação?")){ deleteSimulation(b.dataset.id); renderApp(); } });
  if($("#newSimFromJourney")) $("#newSimFromJourney").onclick=startNewSimulation;
  if($("#campaignDashboard")) $("#campaignDashboard").onclick=openFullDashboard;
  wireJourneyNewsCarousel();
  if($("#startJourney")) $("#startJourney").onclick=()=>{ if(matches[revealed] && !finished) openMatchSimulator(matches[revealed], revealed); };
  if($("#advanceMorning")) $("#advanceMorning").onclick=advanceToNextMorning;
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
function wireJourneyMatchButtons(){
  document.querySelectorAll(".simulate-team-match").forEach(btn=>{
    btn.onclick=()=>{
      const matches=getTeamMatches(currentSim(), getFavoriteTeam());
      const idx=Number(btn.dataset.matchIndex||0);
      if(matches[idx]) openMatchSimulator(matches[idx], idx);
    };
  });
}

/* ---- TABS = simulações salvas (trocar / excluir / nova) ---- */

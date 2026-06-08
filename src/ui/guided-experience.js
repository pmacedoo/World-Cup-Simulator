"use strict";

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
  if(r){ r.revealed=0; r.finished=false; r.dashboardUnlocked=false; persistSims(); }
  appState.view="journey";
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
const KO_ORDER = {"Fase de 32":1,"Oitavas de final":2,"Quartas de final":3,"Semifinal":4,"Disputa de 3º lugar":4,"Final":5};
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
      <div class="text-[11px] uppercase tracking-wider font-extrabold text-slate-400">${m.matchNo?`M${m.matchNo} · `:''}${m.stage} · ${m.city}</div>
      <div class="mt-1 font-display font-extrabold text-lg flex flex-wrap items-center gap-2">${flag(m.home)} ${m.home} <span class="px-2 py-0.5 rounded-xl bg-ink text-white tnum">${scoreLine(m)}</span> ${flag(m.away)} ${m.away}</div>
      <div class="text-sm text-slate-500 mt-1">${m.goals.length?`${m.goals.length} gol(s): ${m.goals.slice(0,3).map(g=>`${g.minute}' ${g.player}`).join(" · ")}${m.goals.length>3?"...":""}`:"Sem gols no tempo jogado."}</div>
      <div class="mt-3 flex flex-wrap gap-2">
        <button class="snap-btn glass rounded-xl px-3 py-1.5 text-xs font-bold text-slate-600" data-snap="groups" data-idx="${i}">${ic('table-2','w-3.5 h-3.5')} Grupos agora</button>
        <button class="snap-btn glass rounded-xl px-3 py-1.5 text-xs font-bold text-slate-600" data-snap="bracket" data-idx="${i}">${ic('git-fork','w-3.5 h-3.5')} Chaveamento agora</button>
        <button class="replay-btn glass rounded-xl px-3 py-1.5 text-xs font-bold text-slate-600" data-idx="${i}">${ic('rotate-ccw','w-3.5 h-3.5')} Rever jogo</button>
      </div>
    </div>`;
  }
  if(revealed < matches.length){
    const m=matches[revealed];
    html+=`<div class="journey-match-card glass rounded-3xl p-4 pl-14 shadow-glass" style="box-shadow:0 0 0 2px rgba(10,49,97,.25),0 12px 36px -22px rgba(15,23,42,.5)">
      <div class="absolute left-[13px] top-5 grid place-items-center w-10 h-10 rounded-full text-white shadow-glass font-extrabold text-xs" style="background:var(--grad-2026)">${revealed+1}</div>
      <div class="text-[11px] uppercase tracking-wider font-extrabold text-usablue">Próximo jogo${m.matchNo?` · M${m.matchNo}`:''}</div>
      <div class="text-[11px] uppercase tracking-wider font-extrabold text-slate-400">${m.stage} · ${m.city}</div>
      <div class="mt-1 font-display font-extrabold text-lg flex flex-wrap items-center gap-2">${flag(m.home)} ${m.home} <span class="px-2 py-0.5 rounded-xl bg-slate-200 text-slate-500 tnum text-sm">VS</span> ${flag(m.away)} ${m.away}</div>
      <div class="text-sm text-slate-500 mt-1">Resultado oculto — simule a partida para viver o placar.</div>
      <button class="simulate-team-match btn-premium text-white font-bold px-4 py-2.5 rounded-2xl mt-3" data-match-index="${revealed}">${ic('play','w-4 h-4')} Simular partida</button>
    </div>`;
  } else {
    const cs=campaignSummary(sim,team);
    html+=`<div class="rounded-3xl p-5 ${cs.status==="champion"?'bg-gold-500/15 border border-gold-400/40':'bg-usared/10 border border-usared/20'}">
      <div class="font-display font-extrabold text-lg flex items-center gap-2">${ic(cs.status==="champion"?'trophy':'flag','w-5 h-5')} ${cs.title}</div>
      <p class="mt-1 text-slate-600 leading-relaxed">${cs.text}</p>
      <button id="campaignDashboard" class="btn-premium text-white font-extrabold rounded-2xl px-5 py-3 mt-4">${ic('layout-dashboard','w-4 h-4')} Ver Copa completa</button>
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

function setGuidedVisibility(showGuided){
  $("#guidedExperience").classList.toggle("hidden", !showGuided);
  $("#siteHeader").classList.toggle("hidden", showGuided);
  $("#top").classList.toggle("hidden", showGuided);
  $("#siteFooter").classList.toggle("hidden", showGuided);
}
function renderGuided(html){
  setGuidedVisibility(true);
  $("#guidedExperience").innerHTML = `<section class="guided-shell">${html}</section>`;
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
  // status SEM SPOILER: só revela o desfecho quando a jornada termina
  let statusBox;
  if(finished){
    const cs=campaignSummary(sim,team);
    statusBox=`<div class="rounded-3xl p-5 ${cs.status==="champion"?'bg-gold-500/15 border border-gold-400/40':'bg-usared/10 border border-usared/20'}">
      <div class="font-display font-extrabold text-xl">${cs.title}</div><p class="mt-2 text-slate-600 leading-relaxed">${cs.text}</p></div>`;
  } else if(revealed===0){
    statusBox=`<div class="rounded-3xl p-5 bg-usablue/8 border border-usablue/20">
      <div class="font-display font-extrabold text-xl">Sua Copa começa agora.</div>
      <p class="mt-2 text-slate-600 leading-relaxed">Os resultados serão revelados <b>jogo a jogo</b>. Nada de placares, campeão ou chaveamento antes da hora — só o que você viver.</p></div>`;
  } else {
    statusBox=`<div class="rounded-3xl p-5 bg-mxgreen/10 border border-mxgreen/20">
      <div class="font-display font-extrabold text-xl">Campanha em andamento</div>
      <p class="mt-2 text-slate-600 leading-relaxed">${revealed} jogo(s) disputado(s). Simule o próximo para continuar a jornada de ${flag(team)} ${team}.</p></div>`;
  }
  renderGuided(`
    ${renderIntroNav("journey")}
    <div class="max-w-7xl mx-auto grid xl:grid-cols-[.86fr_1.14fr] gap-6 items-start">
      <div class="guided-card rounded-[2rem] p-7 sm:p-9 guided-enter ${finished&&sim.champion===team?'confetti-soft':''}">
        <div class="flex items-center justify-between gap-4">
          ${renderSimulationTypeBadge(type)}
          <button id="journeyTypeBack" class="text-xs font-extrabold text-slate-500 hover:text-ink">Trocar tipo</button>
        </div>
        <div class="mt-8 flex items-center gap-5">
          ${flag(team,'flag-xl')}
          <div>
            <h1 class="font-display font-extrabold text-4xl leading-tight">${team} na Simulação ${profile.label}</h1>
            <p class="mt-2 text-slate-500 font-semibold">${teamMeta[team].confederation} · ${teamMeta[team].status} · técnico: ${TEAMS[team].coach}</p>
          </div>
        </div>
        <div class="mt-7">${statusBox}</div>
        <div class="mt-7 grid sm:grid-cols-2 gap-3">
          <button id="startJourney" class="btn-premium text-white font-extrabold rounded-2xl px-5 py-3.5" ${matches.length && !finished?'':'disabled'}>${revealed===0?'Começar jornada':'Simular próximo jogo'}</button>
          <button id="askDashboard" class="glass rounded-2xl px-5 py-3.5 font-extrabold text-slate-700 disabled:opacity-40 disabled:pointer-events-none" ${finished?'':'disabled'} title="${finished?'':'Disponível ao fim da jornada'}">Ver Copa completa</button>
        </div>
        ${savedSimsPanel()}
        <button id="resetGuidedSmall" class="mt-4 text-xs font-extrabold text-slate-400 hover:text-usared">Reiniciar progresso desta simulação</button>
      </div>
      <div class="guided-card rounded-[2rem] p-4 sm:p-5 guided-enter">
        <div class="mb-4">
          <div class="text-[11px] uppercase tracking-widest font-extrabold text-slate-400">Campanha de ${team}</div>
          <div class="font-display font-extrabold text-2xl">Jogo a jogo</div>
        </div>
        ${progressiveCampaign(record)}
      </div>
    </div>`);
  wireJourneyMatchButtons();
  document.querySelectorAll(".snap-btn").forEach(b=> b.onclick=()=>openSnapshot(b.dataset.snap, Number(b.dataset.idx)));
  document.querySelectorAll(".replay-btn").forEach(b=> b.onclick=()=>{ const i=Number(b.dataset.idx); if(matches[i]) openMatchSimulator(matches[i], i); });
  document.querySelectorAll(".switch-sim").forEach(b=> b.onclick=()=>{ setActiveSimulation(b.dataset.id); renderApp(); });
  document.querySelectorAll(".del-sim").forEach(b=> b.onclick=()=>{ if(confirm("Excluir esta simulação?")){ deleteSimulation(b.dataset.id); renderApp(); } });
  if($("#newSimFromJourney")) $("#newSimFromJourney").onclick=startNewSimulation;
  if($("#campaignDashboard")) $("#campaignDashboard").onclick=openFullDashboard;
  $("#startJourney").onclick=()=>{ if(matches[revealed] && !finished) openMatchSimulator(matches[revealed], revealed); };
  $("#askDashboard").onclick=()=>{ if(finished) renderDashboardConfirmation(); };
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

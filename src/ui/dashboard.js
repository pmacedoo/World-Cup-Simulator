"use strict";

function renderTabs(){
  const wrap=$("#simTabs"); wrap.innerHTML="";
  appState.sims.forEach((rec,i)=>{
    const obj=simObjFor(rec), p=profileFor(rec.type), active=rec.id===appState.activeId;
    const b = el("button",
      `sim-tab glass card-hover rounded-2xl px-4 py-3 pr-9 text-left min-w-[210px] flex-1 relative ${active?'active':''}`,
      `<div class="text-[11px] font-bold uppercase tracking-wider ${active?'text-white/80':'text-slate-400'} flex items-center gap-1.5">${flag(rec.favoriteTeam)} ${rec.favoriteTeam} · ${p.label}</div>
       <div class="font-display font-extrabold text-[15px] ${active?'text-white':'text-ink'} leading-tight mt-0.5 flex items-center gap-2">${flag(obj.champion)} ${obj.champion} campeão</div>
       <div class="text-[11px] mt-1 ${active?'text-white/85':'text-slate-500'}">criada ${timeAgo(rec.createdAt)}</div>
       <span class="del-tab absolute top-2.5 right-2.5 w-6 h-6 grid place-items-center rounded-full ${active?'text-white/70 hover:text-white hover:bg-white/15':'text-slate-300 hover:text-usared'}" data-id="${rec.id}" title="Excluir">${ic('trash-2','w-3.5 h-3.5')}</span>`);
    if(active) b.style.background = "linear-gradient(125deg,"+p.color+",#0b1020)";
    b.onclick=(e)=>{ if(e.target.closest('[data-id]')) return; setActiveSimulation(rec.id); syncDashboardState(); renderAll(); };
    wrap.appendChild(b);
  });
  const add=el("button","sim-tab glass card-hover rounded-2xl px-4 py-3 text-left min-w-[150px] flex items-center gap-2 font-extrabold text-slate-600",`${ic('plus','w-4 h-4')} Nova simulação`);
  add.onclick=startNewSimulation;
  wrap.appendChild(add);
  wrap.querySelectorAll(".del-tab").forEach(x=> x.onclick=(e)=>{
    e.stopPropagation();
    if(confirm("Excluir esta simulação?")){
      deleteSimulation(x.dataset.id);
      if(!appState.sims.length) startNewSimulation();
      else { syncDashboardState(); renderAll(); }
    }
  });
  paintIcons();
}

/* ---- HERO QUICK CARDS ---- */
function renderHeroCards(){
  const s=currentSim();
  const z = zebraTeam(s);
  const cards=[
    {icon:"trophy", color:"text-gold-600", label:"Campeão", main:`${flag(s.champion)} ${s.champion}`, sub:`Vice: ${flag(s.runnerUp)} ${s.runnerUp}`, accent:"from-gold-400/30 to-gold-600/10"},
    {icon:"crosshair", color:"text-usablue", label:"Artilheiro", main:s.awards.topScorer.player, sub:`${flag(s.awards.topScorer.team)} ${s.awards.topScorer.goals} gols`, accent:"from-usablue/15 to-usablue/5"},
    {icon:"zap", color:"text-usared", label:"Grande zebra", main:`${flag(z.team)} ${z.team}`, sub:z.sub, accent:"from-usared/15 to-usared/5"},
  ];
  const wrap=$("#heroCards"); wrap.innerHTML="";
  cards.forEach(c=>{
    wrap.appendChild(el("div",`glass card-hover rounded-3xl p-5 shadow-glass bg-gradient-to-br ${c.accent}`,
      `<div class="flex items-center gap-2 text-slate-500 text-xs font-bold uppercase tracking-wider">${ic(c.icon,`w-[18px] h-[18px] ${c.color}`)}${c.label}</div>
       <div class="font-display font-extrabold text-xl mt-2 leading-tight flex items-center gap-2">${c.main}</div>
       <div class="text-sm text-slate-500 mt-0.5 flex items-center gap-1.5">${c.sub}</div>`));
  });
  $("#simMeta").textContent = `Seed ${s.seed} · variância ${Math.round(s.chaos*100)}% · ${s.tone}`;
}

/* ---- OVERVIEW ---- */
function renderOverview(){
  const s=currentSim();
  $("#ovTone").textContent = (()=>{ const r=activeRecord(); return r?`${r.favoriteTeam} · Simulação ${profileFor(r.type).label} · ${profileFor(r.type).sub}`:(state.meta[state.active]?.sub||""); })();
  const a=s.awards, h=s.highlights;
  const cards=[
    ["medal","text-slate-400","Vice-campeão",`${flag(s.runnerUp)} ${s.runnerUp}`,"Caiu na final","border-slate-300"],
    ["award","text-amber-700","Terceiro lugar",`${flag(s.thirdPlace)} ${s.thirdPlace}`,`4º: ${flag(s.fourthPlace)} ${s.fourthPlace}`,"border-amber-700/30"],
    ["star","text-usablue","Melhor jogador",`${a.bestPlayer.player}`,`${flag(a.bestPlayer.team)} ${a.bestPlayer.team} · ${a.bestPlayer.goals} gols`,"border-usablue/30"],
    ["sparkles","text-mxgreen","Melhor jovem",`${a.bestYoung.player}`,`${flag(a.bestYoung.team)} ${a.bestYoung.team}`,"border-mxgreen/30"],
    ["hand","text-slate-500","Melhor goleiro",`${a.bestGK?a.bestGK.player:'—'}`,`${a.bestGK?flag(a.bestGK.team)+' '+a.bestGK.team+' · '+a.bestGK.conceded+' sofridos':''}`,"border-slate-300"],
    ["heart-crack","text-slate-400","Grande decepção",`${flag(h.disappointment)} ${h.disappointment}`,"Abaixo do esperado","border-slate-300"],
  ];
  const wrap=$("#overviewGrid"); wrap.innerHTML="";
  cards.forEach(([icon,color,lb,mn,sb,bd])=>{
    wrap.appendChild(el("div",`reveal glass card-hover rounded-3xl p-5 shadow-glass border ${bd}`,
      `<div class="flex items-center gap-2 text-slate-500 text-[11px] font-bold uppercase tracking-wider">${ic(icon,`w-4 h-4 ${color}`)}${lb}</div>
       <div class="font-display font-extrabold text-lg mt-2 leading-tight flex items-center gap-2">${mn}</div>
       <div class="text-[13px] text-slate-500 mt-0.5 flex items-center gap-1.5 flex-wrap">${sb}</div>`));
  });

  // jogo mais emocionante
  const bm=h.bestMatch;
  wrap.appendChild(el("div","reveal glass card-hover rounded-3xl p-5 shadow-glass border border-usablue/30 sm:col-span-2 lg:col-span-3 bg-gradient-to-br from-usablue/5 to-usared/5",
    `<div class="flex items-center gap-2 text-slate-500 text-[11px] font-bold uppercase tracking-wider">${ic('flame','w-4 h-4 text-usared')}Jogo mais emocionante · ${bm.stage}</div>
     <div class="font-display font-extrabold text-xl mt-2 flex items-center gap-2 flex-wrap">${flag(bm.home)} ${bm.home} <span class="px-2">${scoreLine(bm)}</span> ${bm.away} ${flag(bm.away)}</div>
     <div class="text-sm text-slate-500 mt-1">${matchScheduleLine(bm)} · ${bm.ga+bm.gb} gols${bm.pens?' · decidido nos pênaltis':bm.aet?' · na prorrogação':''}</div>`));

  // podium / final banner
  const f=s.knockout.final;
  $("#podium").innerHTML =
    `<div class="reveal glass champ-glow rounded-3xl p-6 sm:p-8 shadow-lift overflow-hidden relative bg-gradient-to-br from-gold-400/15 via-white/40 to-gold-500/10">
       <div class="absolute -right-8 -top-8 opacity-[0.07] select-none">${ic('trophy','w-40 h-40 text-gold-600')}</div>
       <div class="text-xs font-bold uppercase tracking-[.2em] text-gold-600">A Grande Final · ${f.kickoff || f.city}</div>
       <div class="mt-3 flex flex-wrap items-center gap-x-6 gap-y-3">
         <div class="text-3xl sm:text-5xl font-display font-extrabold flex items-center gap-3">${flag(f.home,'flag-lg')} ${f.home}</div>
         <div class="trophy-shine text-3xl sm:text-5xl font-display font-extrabold tnum">${scoreLine(f)}</div>
         <div class="text-3xl sm:text-5xl font-display font-extrabold flex items-center gap-3">${f.away} ${flag(f.away,'flag-lg')}</div>
       </div>
       <div class="mt-4 text-lg font-bold flex items-center gap-2">${ic('trophy','w-5 h-5 text-gold-600')} Campeão: <span class="gold-text flex items-center gap-2">${flag(s.champion)} ${s.champion}</span></div>
       ${f.goals.length?`<div class="mt-3 flex flex-wrap gap-2">${f.goals.map(g=>`<span class="text-xs font-semibold glass px-2.5 py-1 rounded-full inline-flex items-center gap-1.5">${g.minute}' ${g.player} ${flag(g.team)}</span>`).join("")}</div>`:''}
     </div>`;
}

function renderFavoriteTeamDashboard(){
  renderSimulationTypeControls("myTeamTypeControls", true);
  const wrap=$("#myTeamWrap");
  const team=getFavoriteTeam();
  if(!team){
    wrap.innerHTML=`<div class="glass rounded-3xl p-6 shadow-glass">
      <div class="font-display font-extrabold text-2xl">Nenhuma seleção favorita escolhida</div>
      <p class="text-slate-500 mt-2">Inicie a experiência guiada para destacar uma seleção dentro do dashboard.</p>
      <button class="mt-4 btn-premium text-white font-bold px-5 py-3 rounded-2xl" onclick="resetGuidedExperience()">Escolher seleção</button>
    </div>`;
    return;
  }
  const sim=currentSim();
  const type=sim.simulationType || activeRecord()?.type || "realistic";
  const summary=campaignSummary(sim,team);
  const row=groupRowForTeam(sim,team);
  const meta=teamMeta[team];
  wrap.innerHTML=`
    <div class="grid xl:grid-cols-[.92fr_1.08fr] gap-5">
      <div class="reveal glass rounded-[2rem] p-6 shadow-glass ${summary.status==="champion"?'confetti-soft':''}">
        <div class="flex items-start justify-between gap-4">
          <div class="flex items-center gap-4">
            ${flag(team,'flag-xl')}
            <div>
              <div class="text-[11px] uppercase tracking-widest font-extrabold text-slate-400">Minha Seleção</div>
              <h3 class="font-display font-extrabold text-3xl">${team}</h3>
              <div class="mt-1 flex flex-wrap gap-2 items-center">${renderSimulationTypeBadge(type)} ${statusPill(meta.status)}</div>
            </div>
          </div>
        </div>
        <div class="mt-6 rounded-3xl p-5 ${summary.status==="champion"?'bg-gold-500/15 border border-gold-400/40':summary.status==="eliminated"?'bg-usared/10 border border-usared/20':'bg-mxgreen/10 border border-mxgreen/20'}">
          <div class="font-display font-extrabold text-xl">${summary.title}</div>
          <p class="mt-2 text-slate-600 leading-relaxed">${summary.text}</p>
        </div>
        <div class="mt-5 grid sm:grid-cols-3 gap-3">
          <div class="rounded-2xl bg-white/60 p-4">
            <div class="text-[10px] uppercase tracking-widest font-extrabold text-slate-400">Grupo</div>
            <div class="font-extrabold mt-1">${row?`${row.pos}º no Grupo ${row.group}`:"-"}</div>
          </div>
          <div class="rounded-2xl bg-white/60 p-4">
            <div class="text-[10px] uppercase tracking-widest font-extrabold text-slate-400">Campanha</div>
            <div class="font-extrabold mt-1">${row?`${row.P} pts · SG ${row.SG>0?"+":""}${row.SG}`:"-"}</div>
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
        <div class="flex items-center justify-between gap-4 mb-4">
          <div>
            <div class="text-[11px] uppercase tracking-widest font-extrabold text-slate-400">Jornada</div>
            <div class="font-display font-extrabold text-2xl">Partidas de ${team}</div>
          </div>
          <button id="dashStartJourney" class="btn-premium text-white font-bold px-4 py-2.5 rounded-2xl">Voltar à jornada</button>
        </div>
        ${progressiveCampaign(activeRecord())}
      </div>
    </div>`;
  wireJourneyMatchButtons();
  document.querySelectorAll(".snap-btn").forEach(b=> b.onclick=()=>openSnapshot(b.dataset.snap, Number(b.dataset.idx)));
  document.querySelectorAll(".replay-btn").forEach(b=> b.onclick=()=>{ const ms=getTeamMatches(currentSim(),team); const i=Number(b.dataset.idx); if(ms[i]) openMatchSimulator(ms[i], i); });
  if($("#campaignDashboard")) $("#campaignDashboard").onclick=()=>{};
  $("#dashChangeTeam").onclick=changeFavoriteTeam;
  $("#dashChangeType").onclick=changeSimulationType;
  $("#dashResetGuided").onclick=resetGuidedExperience;
  $("#dashStartJourney").onclick=()=>{ appState.view="journey"; renderFavoriteTeamJourney(); };
}

/* ---- GROUPS ---- */

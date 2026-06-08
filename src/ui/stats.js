"use strict";

function renderNarrative(){
  const s=currentSim();
  const n=narrativeFor(s);
  const blocks=[
    ["A abertura do torneio", n.intro, "from-usablue/8 to-transparent"],
    ["Os favoritos", n.favoritos, "from-mxgreen/8 to-transparent"],
    ["A grande zebra", `${n.surpresa} ${n.cinder}`, "from-usared/8 to-transparent"],
    ["Heróis e artilharia", `${n.heroi} ${n.artilheiro}`, "from-gold-500/12 to-transparent"],
    ["A decepção", n.decepcao || "Sem grandes decepções nesta edição — os favoritos confirmaram o favoritismo.", "from-slate-200/40 to-transparent"],
    ["O caminho da final", `${n.semis} ${n.final}`, "from-usablue/8 to-transparent"],
  ];
  $("#narrative").innerHTML = blocks.map((b,i)=>`
    <div class="reveal glass card-hover rounded-3xl p-6 shadow-glass bg-gradient-to-br ${b[2]} ${i===5?'lg:col-span-2':''} ${i===0?'lg:col-span-3':''}">
      <div class="text-[11px] font-bold uppercase tracking-widest text-slate-400 mb-2">${b[0]}</div>
      <p class="text-[15px] leading-relaxed text-slate-700">${b[1]}</p>
    </div>`).join("");
}

/* ---- STATS ---- */
function renderStats(){
  const s=currentSim(), st=s.stats, h=s.highlights;
  const scorers = st.topScorers.map((p,i)=>`
    <div class="flex items-center gap-3 py-2 ${i?'border-t border-slate-100/80':''}">
      <span class="w-6 text-center font-extrabold tnum ${i<3?'gold-text':'text-slate-300'}">${i+1}</span>
      <span class="flex-1 font-semibold">${p.player} <span class="text-slate-400 font-normal">${flag(p.team)}</span></span>
      <span class="font-extrabold tnum">${p.goals}</span><span class="text-xs text-slate-400">gols</span>
    </div>`).join("");
  const assistsRows = st.topAssists.map((p,i)=>`
    <div class="flex items-center gap-3 py-2 ${i?'border-t border-slate-100/80':''}">
      <span class="w-6 text-center font-extrabold tnum text-slate-300">${i+1}</span>
      <span class="flex-1 font-semibold">${p.player} <span class="text-slate-400 font-normal">${flag(p.team)}</span></span>
      <span class="font-extrabold tnum">${p.assists}</span><span class="text-xs text-slate-400">assist.</span>
    </div>`).join("");

  // seleção ideal pitch
  const posRows = { GK:[], DF:[], MF:[], FW:[] };
  st.bestXI.forEach(p=> posRows[p.pos]?.push(p));
  const xiChip = p=>`<div class="glass rounded-xl px-2 py-1.5 text-center shadow-glass min-w-[88px]">
      <div class="flex justify-center mb-1">${flag(p.team,'flag-lg')}</div>
      <div class="text-[12px] font-bold leading-tight text-slate-800">${p.player.split(' ').slice(-1)[0]}</div>
      ${p.goals?`<div class="text-[10px] text-mxgreen font-bold flex items-center justify-center gap-0.5">${ic('circle-dot','w-2.5 h-2.5')} ${p.goals}</div>`:''}
    </div>`;
  const pitch = `
    <div class="rounded-2xl p-4" style="background:linear-gradient(160deg,#15803d,#166534);">
      <div class="space-y-3">
        <div class="flex justify-center gap-2">${posRows.FW.map(xiChip).join("")}</div>
        <div class="flex justify-center gap-2">${posRows.MF.map(xiChip).join("")}</div>
        <div class="flex justify-center gap-2">${posRows.DF.map(xiChip).join("")}</div>
        <div class="flex justify-center gap-2">${posRows.GK.map(xiChip).join("")}</div>
      </div>
    </div>`;

  const facts=[
    ["swords","text-usared","Melhor ataque (mata-mata)", `${flag(h.bestAttack)} ${h.bestAttack}`, `${s.scoredBy[h.bestAttack]} gols marcados`],
    ["shield","text-usablue","Defesa menos vazada", `${flag(h.bestDefense)} ${h.bestDefense}`, `${s.conceded[h.bestDefense]} gols sofridos`],
    ["bomb","text-slate-700","Maior goleada", `${flag(h.biggestRout.home)} ${h.biggestRout.ga}–${h.biggestRout.gb} ${h.biggestRout.away} ${flag(h.biggestRout.away)}`, h.biggestRout.stage],
    ["party-popper","text-mxgreen","Jogo com mais gols", `${flag(h.mostGoals.home)} ${h.mostGoals.ga}–${h.mostGoals.gb} ${h.mostGoals.away} ${flag(h.mostGoals.away)}`, `${h.mostGoals.ga+h.mostGoals.gb} gols · ${h.mostGoals.stage}`],
    ["trending-up","text-mxgreen","Melhor campanha de grupos", `${flag(h.bestGroupCampaign.team)} ${h.bestGroupCampaign.team}`, `${h.bestGroupCampaign.P} pts · SG ${h.bestGroupCampaign.SG>0?'+':''}${h.bestGroupCampaign.SG} (Grupo ${h.bestGroupCampaign.group})`],
    ["trending-down","text-usared","Pior campanha (tradicional)", `${flag(h.worstTrad.team)} ${h.worstTrad.team}`, `${h.worstTrad.P} pts · Grupo ${h.worstTrad.group}`],
    ["zap","text-emerald-500","Maior zebra", h.biggestUpset?`${flag(h.biggestUpset.m.winner.team)} ${h.biggestUpset.m.winner.team}`:`${flag(h.cinderella)} ${h.cinderella}`, h.biggestUpset?`bateu ${h.biggestUpset.m.loser.team} ${scoreLine(h.biggestUpset.m)} (${h.biggestUpset.m.stage})`:"surpresa do torneio"],
    ["brain","text-usablue","Melhor técnico", `${s.awards.bestCoach.name}`, `${flag(s.awards.bestCoach.team)} ${s.awards.bestCoach.team} · campeão`],
  ];

  $("#statsWrap").innerHTML = `
    <div class="reveal glass card-hover rounded-3xl p-5 shadow-glass">
      <div class="flex items-center gap-2 text-slate-500 text-[11px] font-bold uppercase tracking-wider mb-2">${ic('crosshair','w-4 h-4 text-usared')} Top 10 artilheiros</div>
      ${scorers}
    </div>
    <div class="reveal glass card-hover rounded-3xl p-5 shadow-glass">
      <div class="flex items-center gap-2 text-slate-500 text-[11px] font-bold uppercase tracking-wider mb-2">${ic('handshake','w-4 h-4 text-usablue')} Top 10 assistências</div>
      ${assistsRows}
    </div>
    <div class="reveal glass card-hover rounded-3xl p-5 shadow-glass">
      <div class="flex items-center gap-2 text-slate-500 text-[11px] font-bold uppercase tracking-wider mb-3">${ic('star','w-4 h-4 text-gold-600')} Seleção ideal (4-3-3)</div>
      ${pitch}
    </div>
    <div class="reveal grid sm:grid-cols-2 gap-4 lg:col-span-3">
      ${facts.map(f=>`<div class="glass card-hover rounded-2xl p-4 shadow-glass">
        <div class="text-[11px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">${ic(f[0],`w-4 h-4 ${f[1]}`)} ${f[2]}</div>
        <div class="font-display font-extrabold text-lg mt-1 flex items-center gap-2 flex-wrap">${f[3]}</div>
        <div class="text-[13px] text-slate-500">${f[4]}</div></div>`).join("")}
    </div>`;
}

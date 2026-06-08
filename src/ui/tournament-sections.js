"use strict";

const POS_LABEL = {GK:"GOL",DF:"DEF",MF:"MEI",FW:"ATA"};
function teamSquadDetails(team){
  const t = TEAMS[team];
  const xi = (t.xi||[]).map(p=>`<span class="text-[11px] font-bold px-2 py-1 rounded-lg bg-ink/5">${p}</span>`).join("");
  const roster = ["GK","DF","MF","FW"].map(pos=>{
    const chips = t.sq.filter(p=>p[1]===pos).map(p=>
      `<span class="text-[10px] font-semibold px-2 py-1 rounded-lg bg-white/55 border border-white/70">${p[0]}</span>`
    ).join("");
    return `<div class="mt-2"><span class="text-[10px] font-extrabold text-slate-400 mr-1">${POS_LABEL[pos]}</span><span class="inline-flex flex-wrap gap-1">${chips}</span></div>`;
  }).join("");
  return `<details class="rounded-2xl bg-white/35 border border-white/60 px-3 py-2">
    <summary class="cursor-pointer list-none flex items-center justify-between gap-2 text-xs font-extrabold text-slate-700">
      <span class="inline-flex items-center gap-1.5">${flag(team)} ${team}</span>
      <span class="text-[10px] text-slate-400 font-bold">${t.shape||"XI"} · ${t.coach}</span>
    </summary>
    <div class="mt-2">
      <div class="text-[10px] uppercase tracking-wider font-extrabold text-slate-400 mb-1">XI base usado na simulação</div>
      <div class="flex flex-wrap gap-1.5">${xi}</div>
      <div class="text-[10px] uppercase tracking-wider font-extrabold text-slate-400 mt-3">Convocados do PDF</div>
      ${roster}
    </div>
  </details>`;
}

function renderGroups(){
  const s=currentSim();
  const wrap=$("#groupsGrid"); wrap.innerHTML="";
  s.groups.forEach(g=>{
    const rows = g.table.map(r=>{
      const dot = rowDot(r.pos, s.qualThirds.find(t=>t.team===r.team));
      return `<tr class="border-t border-slate-100/80">
        <td class="py-2 pl-3 pr-1"><span class="inline-flex items-center gap-2"><span class="w-1.5 h-6 rounded-full ${dot}"></span><span class="text-slate-400 text-xs font-bold tnum w-4">${r.pos}</span></span></td>
        <td class="py-2 pr-2 font-semibold whitespace-nowrap">${flag(r.team)} ${r.team}</td>
        <td class="py-2 text-center font-extrabold tnum">${r.P}</td>
        <td class="py-2 text-center text-slate-500 tnum hidden sm:table-cell">${r.J}</td>
        <td class="py-2 text-center text-slate-500 tnum hidden sm:table-cell">${r.V}</td>
        <td class="py-2 text-center text-slate-500 tnum hidden sm:table-cell">${r.E}</td>
        <td class="py-2 text-center text-slate-500 tnum hidden sm:table-cell">${r.D}</td>
        <td class="py-2 text-center text-slate-500 tnum hidden md:table-cell">${r.GP}</td>
        <td class="py-2 text-center text-slate-500 tnum hidden md:table-cell">${r.GC}</td>
        <td class="py-2 text-center font-semibold tnum ${r.SG>0?'text-mxgreen':r.SG<0?'text-usared':'text-slate-500'}">${r.SG>0?'+':''}${r.SG}</td>
        <td class="py-2 pr-3 text-right">${statusBadge(r.status)}</td>
      </tr>`;
    }).join("");
    const squads = g.teams.map(teamSquadDetails).join("");
    wrap.appendChild(el("div","reveal glass card-hover rounded-3xl shadow-glass overflow-hidden",
      `<div class="px-4 py-3 flex items-center justify-between" style="background:linear-gradient(120deg,rgba(10,49,97,.06),rgba(179,25,66,.05))">
         <div class="font-display font-extrabold text-lg">Grupo ${g.letter}</div>
         <div class="text-xs text-slate-400 font-semibold">Classificação final</div>
       </div>
       <div class="overflow-x-auto">
       <table class="w-full text-sm">
         <thead class="text-[10px] uppercase tracking-wider text-slate-400">
           <tr>
             <th class="py-2 pl-3 text-left font-bold">#</th>
             <th class="py-2 text-left font-bold">Seleção</th>
             <th class="py-2 text-center font-bold">Pts</th>
             <th class="py-2 text-center font-bold hidden sm:table-cell">J</th>
             <th class="py-2 text-center font-bold hidden sm:table-cell">V</th>
             <th class="py-2 text-center font-bold hidden sm:table-cell">E</th>
             <th class="py-2 text-center font-bold hidden sm:table-cell">D</th>
             <th class="py-2 text-center font-bold hidden md:table-cell">GP</th>
             <th class="py-2 text-center font-bold hidden md:table-cell">GC</th>
             <th class="py-2 text-center font-bold">SG</th>
             <th class="py-2 pr-3 text-right font-bold">Status</th>
           </tr>
         </thead>
         <tbody>${rows}</tbody>
       </table></div>
       <div class="border-t border-white/60 p-3 space-y-2">
         <div class="text-[10px] uppercase tracking-wider font-extrabold text-slate-400">Elencos e escalações-base</div>
         ${squads}
       </div>`));
  });
}

/* ---- MATCHES ---- */
function goalChips(m){
  if(!m.goals.length) return `<div class="text-xs text-slate-400 italic mt-2">Sem gols.</div>`;
  return `<div class="mt-2 flex flex-wrap gap-1.5">`+ m.goals.map(g=>
    `<span class="text-[11px] font-semibold glass px-2 py-1 rounded-lg">
       <span class="text-slate-400 tnum">${g.minute}'</span> ${g.player} ${flag(g.team)}
       <span class="text-slate-400">· ${g.type}</span>${g.assist?` <span class="text-slate-400">(assist. ${g.assist})</span>`:''}
     </span>`).join("") + `</div>`;
}
function matchCard(m){
  const aWin=m.ga>m.gb, bWin=m.gb>m.ga;
  return `<div class="glass rounded-2xl p-4 shadow-glass">
    <div class="flex items-center justify-between text-[11px] text-slate-400 font-bold uppercase tracking-wider mb-2">
      <span>${m.matchNo?`M${m.matchNo} · `:''}${m.stage}</span><span class="font-semibold normal-case tracking-normal">${m.city} · ${m.venue}</span>
    </div>
    <div class="flex items-center justify-center gap-3 sm:gap-5">
      <div class="flex-1 text-right font-display font-extrabold text-base sm:text-lg ${aWin?'':'text-slate-400'}">${m.home} ${flag(m.home)}</div>
      <div class="px-3 py-1 rounded-xl bg-ink text-white font-extrabold tnum text-lg">${scoreLine(m)}</div>
      <div class="flex-1 text-left font-display font-extrabold text-base sm:text-lg ${bWin?'':'text-slate-400'}">${flag(m.away)} ${m.away}</div>
    </div>
    ${goalChips(m)}
  </div>`;
}
function renderMatches(){
  const s=currentSim();
  const gf=$("#filterGroup").value, rf=$("#filterRound").value;
  const wrap=$("#matchesWrap"); wrap.innerHTML="";
  let shown=0;
  s.groups.forEach(g=>{
    if(gf!=="all" && gf!==g.letter) return;
    const matches = g.matches.filter(m=> rf==="all" || String(m.round)===rf);
    if(!matches.length) return;
    const body = matches.map(matchCard).join("");
    // abre o primeiro grupo (ou o grupo filtrado); os demais começam recolhidos
    const startOpen = (gf!=="all") || shown===0;
    shown++;
    const accEl = el("div",`acc glass rounded-3xl shadow-glass overflow-hidden ${startOpen?'open':''}`);
    accEl.innerHTML =
      `<button class="acc-toggle w-full px-5 py-4 flex items-center justify-between text-left">
         <div class="flex items-center gap-3">
           <span class="font-display font-extrabold text-lg">Grupo ${g.letter}</span>
           <span class="text-xs text-slate-400 font-semibold">${matches.length} jogo(s)</span>
         </div>
         <svg class="chev" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M6 9l6 6 6-6"/></svg>
       </button>
       <div class="acc-body"><div class="px-4 sm:px-5 pb-5 space-y-3">${body}</div></div>`;
    accEl.querySelector(".acc-toggle").onclick=()=> accEl.classList.toggle("open");
    wrap.appendChild(accEl);
  });
  if(!wrap.children.length) wrap.innerHTML=`<div class="glass rounded-3xl p-8 text-center text-slate-400 font-semibold">Nenhum jogo para este filtro.</div>`;
}

/* ---- THIRDS ---- */
function renderThirds(){
  const s=currentSim();
  const rows = s.thirds.map((t,i)=>`
    <tr class="border-t border-slate-100/80 ${t.advanced?'':'opacity-60'}">
      <td class="py-2.5 pl-4 tnum font-bold text-slate-400">${i+1}</td>
      <td class="py-2.5 font-semibold whitespace-nowrap">${flag(t.team)} ${t.team}</td>
      <td class="py-2.5 text-center text-slate-500">Grupo ${t.group}</td>
      <td class="py-2.5 text-center font-extrabold tnum">${t.P}</td>
      <td class="py-2.5 text-center tnum ${t.SG>0?'text-mxgreen':t.SG<0?'text-usared':'text-slate-500'}">${t.SG>0?'+':''}${t.SG}</td>
      <td class="py-2.5 text-center text-slate-500 tnum">${t.GP}</td>
      <td class="py-2.5 pr-4 text-right">${t.advanced?`<span class="text-[10px] font-bold px-2 py-0.5 rounded-full bg-mxgreen/15 text-mxgreen">Avançou</span>`:`<span class="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-200 text-slate-500">Eliminado</span>`}</td>
    </tr>`).join("");
  $("#thirdsWrap").innerHTML = `
    <div class="px-5 py-3 text-xs text-slate-400 font-semibold border-b border-slate-100/80" style="background:linear-gradient(120deg,rgba(31,122,77,.06),rgba(233,185,73,.06))">Linha de corte após o 8º colocado</div>
    <div class="overflow-x-auto"><table class="w-full text-sm">
      <thead class="text-[10px] uppercase tracking-wider text-slate-400">
        <tr><th class="py-2.5 pl-4 text-left font-bold">#</th><th class="py-2.5 text-left font-bold">Seleção</th>
        <th class="py-2.5 text-center font-bold">Grupo</th><th class="py-2.5 text-center font-bold">Pts</th>
        <th class="py-2.5 text-center font-bold">SG</th><th class="py-2.5 text-center font-bold">GP</th>
        <th class="py-2.5 pr-4 text-right font-bold">Status</th></tr>
      </thead><tbody>${rows}</tbody></table></div>`;
}

/* ---- BRACKET ---- */
function renderRankingProtection(){
  const s=currentSim(), p=s.topSeedProtection;
  if(!p){
    $("#rankingProtectionWrap").innerHTML="";
    return;
  }
  const seedChips = p.seeds.map(seed=>{
    const ok = seed.protectedPath;
    return `<div class="flex items-center justify-between gap-3 rounded-2xl px-3 py-2 ${ok?'bg-mxgreen/10':'bg-amber-100/70'}">
      <div class="font-extrabold text-sm">${flag(seed.team)} ${seed.team}</div>
      <div class="text-[10px] uppercase tracking-wider font-bold ${ok?'text-mxgreen':'text-amber-700'}">#${seed.rank} · Grupo ${seed.group} · ${ok?'caminho protegido':'proteção perdida se não vencer'}</div>
    </div>`;
  }).join("");
  const attempts = p.resampleAttempts || 0;
  const attemptsLine = attempts
    ? `<span class="font-extrabold text-amber-700">${attempts} seed(s) descartada(s)</span> para evitar confronto protegido antes da fase permitida.`
    : `Nenhuma reamostragem foi necessária nesta simulação.`;
  const clashLine = p.clashes.length
    ? p.clashes.map(c=>`M${c.matchNo}: ${c.teams.map(t=>`${flag(t)} ${t}`).join(" x ")} (${c.stage})`).join(" · ")
    : `Nenhum confronto direto entre top 4 aconteceu neste cenário.`;
  $("#rankingProtectionWrap").innerHTML = `
    <div class="rounded-3xl p-4 border border-gold-400/30" style="background:linear-gradient(120deg,rgba(233,185,73,.14),rgba(31,122,77,.08),rgba(255,255,255,.72));">
      <div class="flex flex-col lg:flex-row lg:items-start gap-4">
        <div class="flex-1">
          <div class="text-[11px] uppercase tracking-[.22em] font-extrabold text-gold-700 flex items-center gap-1.5">${ic('shield-check','w-4 h-4')} Proteção ranking FIFA</div>
          <p class="text-sm text-slate-600 mt-1 leading-relaxed">
            Espanha e Argentina ficam em metades opostas e só podem se cruzar na final; França e Inglaterra também formam par de final.
            Os demais duelos entre top 4 ficam restritos à semifinal ou à final. ${attemptsLine}
          </p>
          <div class="text-xs text-slate-500 mt-2"><b class="text-slate-700">Confrontos top 4 nesta simulação:</b> ${clashLine}</div>
        </div>
        <div class="grid sm:grid-cols-2 gap-2 lg:min-w-[520px]">${seedChips}</div>
      </div>
    </div>`;
}

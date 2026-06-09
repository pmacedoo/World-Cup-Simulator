"use strict";

const BRACKET_POSITIONS = {
  74:{x:6.8,y:5.5,cls:"r32",side:"left"}, 77:{x:6.8,y:17.5,cls:"r32",side:"left"},
  73:{x:6.8,y:29.5,cls:"r32",side:"left"},75:{x:6.8,y:41.5,cls:"r32",side:"left"},
  83:{x:6.8,y:58.5,cls:"r32",side:"left"},84:{x:6.8,y:70.5,cls:"r32",side:"left"},
  81:{x:6.8,y:82.5,cls:"r32",side:"left"},82:{x:6.8,y:94.5,cls:"r32",side:"left"},
  89:{x:22.8,y:11.5,cls:"r16",side:"left"},90:{x:22.8,y:35.5,cls:"r16",side:"left"},
  93:{x:22.8,y:64.5,cls:"r16",side:"left"},94:{x:22.8,y:88.5,cls:"r16",side:"left"},
  97:{x:36.0,y:23.5,cls:"qf",side:"left"},98:{x:36.0,y:76.5,cls:"qf",side:"left"},
  101:{x:44.6,y:50,cls:"sf",side:"left"},

  76:{x:93.2,y:5.5,cls:"r32",side:"right"},78:{x:93.2,y:17.5,cls:"r32",side:"right"},
  79:{x:93.2,y:29.5,cls:"r32",side:"right"},80:{x:93.2,y:41.5,cls:"r32",side:"right"},
  86:{x:93.2,y:58.5,cls:"r32",side:"right"},88:{x:93.2,y:70.5,cls:"r32",side:"right"},
  85:{x:93.2,y:82.5,cls:"r32",side:"right"},87:{x:93.2,y:94.5,cls:"r32",side:"right"},
  91:{x:77.2,y:11.5,cls:"r16",side:"right"},92:{x:77.2,y:35.5,cls:"r16",side:"right"},
  95:{x:77.2,y:64.5,cls:"r16",side:"right"},96:{x:77.2,y:88.5,cls:"r16",side:"right"},
  99:{x:64.0,y:23.5,cls:"qf",side:"right"},100:{x:64.0,y:76.5,cls:"qf",side:"right"},
  102:{x:55.4,y:50,cls:"sf",side:"right"},

  104:{x:50,y:56.8,cls:"final",side:"center"},
};
const BRACKET_LINKS = [
  [74,89],[77,89],[73,90],[75,90],[89,97],[90,97],
  [83,93],[84,93],[81,94],[82,94],[93,98],[94,98],[97,101],[98,101],
  [76,91],[78,91],[79,92],[80,92],[91,99],[92,99],
  [86,95],[88,95],[85,96],[87,96],[95,100],[96,100],[99,102],[100,102],
  [101,104],[102,104],
];
const BRACKET_HALF_WIDTH = {r32:6,r16:6.25,qf:6.5,sf:6.75,final:9};
function slotLabel(slot){
  if(!slot || !slot.group) return "";
  if(slot.tier===0) return `1${slot.group}`;
  if(slot.tier===1) return `2${slot.group}`;
  if(slot.tier===2) return `3${slot.group}`;
  return slot.group;
}
function bkTeamRow(m, team, goals, pens, slot, isWinner){
  return `<div class="br-team ${isWinner?'win':''}">
    <div class="br-team-main">
      ${slot?`<span class="br-seed">${slot}</span>`:''}
      ${flag(team)}
      <span class="br-team-name">${team}</span>
    </div>
    <span class="br-score">${goals}${pens!=null?`<span class="text-[8px] text-slate-400">(${pens})</span>`:''}</span>
  </div>`;
}
function bkCard(m, champ){
  const champWin = champ && (m.winner.team===champ);
  const homeSeed = m.stage==="16-avos" || m.stage==="Fase de 32" ? slotLabel(m.A) : "";
  const awaySeed = m.stage==="16-avos" || m.stage==="Fase de 32" ? slotLabel(m.B) : "";
  const protection = m.topSeedRule ? `<div class="br-meta" style="color:${m.topSeedRule.allowed?'#1f7a4d':'#b31942'}">${m.topSeedRule.allowed?'Top 4 FIFA ok':'Top 4 FIFA violado'}</div>` : "";
  const extra = m.pens ? "pên." : (m.aet ? "prorr." : "");
  const finalHead = m.stage==="Final" ? `<div class="br-final-title">${ic('trophy','w-3 h-3')} Final</div>` : "";
  return `<div class="bk-match card-hover cursor-pointer ${champWin?'champ-glow':''}" data-match-no="${m.matchNo}">
    ${finalHead || `<div class="br-match-head"><span>M${m.matchNo}</span><span>${m.stage.replace(" de final","").replace("Fase de ","F")}</span></div>`}
    ${bkTeamRow(m, m.home, m.ga, m.pens?.[0], homeSeed, m.winner.team===m.home)}
    ${bkTeamRow(m, m.away, m.gb, m.pens?.[1], awaySeed, m.winner.team===m.away)}
    ${extra?`<div class="br-meta">${extra}</div>`:''}
    ${protection}
  </div>`;
}
function bracketPath(fromPos, toPos){
  const side = fromPos.side==="right" ? "right" : "left";
  const fromHalf = BRACKET_HALF_WIDTH[fromPos.cls] || 6;
  const toHalf = BRACKET_HALF_WIDTH[toPos.cls] || 6;
  const sx = fromPos.x + (side==="left" ? fromHalf : -fromHalf);
  const tx = toPos.x + (side==="left" ? -toHalf : toHalf);
  const mx = (sx + tx) / 2;
  return `M ${sx} ${fromPos.y} H ${mx} V ${toPos.y} H ${tx}`;
}
function renderBracketNode(match){
  const pos = BRACKET_POSITIONS[match.matchNo];
  if(!pos) return "";
  return `<div class="br-node ${pos.cls} ${pos.side}" style="--x:${pos.x};--y:${pos.y};">${bkCard(match, currentSim().champion)}</div>`;
}
// linha de uma seleção dentro de um card do bracket
// goals=null oculta o placar (confronto conhecido mas ainda não jogado)
function bracketTeamRow(m, team, goals, pk, seed, isWinner){
  return `<div class="bracket-team ${isWinner?'bracket-winner':''}">
    ${seed?`<span class="br-seed">${seed}</span>`:''}
    ${flag(team)}
    <span class="bracket-team-name">${team}</span>
    ${goals!=null?`<span class="bracket-score">${goals}${pk!=null?`<span class="pk">(${pk})</span>`:''}</span>`:''}
  </div>`;
}
// linha "vaga em aberto" (a definir) — não revela quem vai jogar
function bracketSlotRow(seed,label){
  return `<div class="bracket-team">
    ${seed?`<span class="br-seed">${seed}</span>`:''}
    <span class="flag-img bracket-flag-empty"></span>
    <span class="bracket-team-name italic text-slate-400">${label}</span>
  </div>`;
}
// card de um confronto. mode:
//   'full'   -> seleções + placar (jogo já vivido ou rodada já decidida)
//   'teams'  -> seleções conhecidas, placar oculto (confronto ainda não jogado)
//   'locked' -> "A definir" (rodada futura: depende de resultados não revelados)
function bracketMatchCard(m, champ, mode='full'){
  const homeSeed = m.stage==="16-avos" || m.stage==="Fase de 32" ? slotLabel(m.A) : "";
  const awaySeed = m.stage==="16-avos" || m.stage==="Fase de 32" ? slotLabel(m.B) : "";
  if(mode==='locked'){
    return `<div class="bracket-match bracket-locked">
      <div class="bracket-match-head"><span>${m.matchNo?`M${m.matchNo}`:''}</span><span>${ic('lock','w-3 h-3')}</span></div>
      ${bracketSlotRow(homeSeed,"A definir")}
      ${bracketSlotRow(awaySeed,"A definir")}
    </div>`;
  }
  if(mode==='teams'){
    return `<div class="bracket-match bracket-pending">
      <div class="bracket-match-head"><span>${m.matchNo?`M${m.matchNo}`:''}</span><span class="text-usablue">a jogar</span></div>
      ${bracketTeamRow(m, m.home, null, null, homeSeed, false)}
      ${bracketTeamRow(m, m.away, null, null, awaySeed, false)}
    </div>`;
  }
  const isChamp = champ && m.stage==="Final" && m.winner.team===champ;
  const extra = m.penalties ? "pênaltis" : (m.aet ? "prorrog." : "");
  return `<div class="bracket-match ${isChamp?'bracket-champion champ-glow':''}" data-match-no="${m.matchNo}">
    <div class="bracket-match-head"><span>${m.matchNo?`M${m.matchNo}`:''}</span><span>${extra}</span></div>
    ${bracketTeamRow(m, m.home, m.ga, m.pens?.[0], homeSeed, m.winner.team===m.home)}
    ${bracketTeamRow(m, m.away, m.gb, m.pens?.[1], awaySeed, m.winner.team===m.away)}
  </div>`;
}
// monta o chaveamento em colunas. modeFn(m) -> 'full' | 'teams' | 'locked'.
function buildBracketHTML(sim, champ, modeFn=()=>'full'){
  const k=sim.knockout;
  const byId = Object.fromEntries([
    ...k.R32, ...k.R16, ...k.QF, ...k.SF, k.final
  ].map(m=>[m.matchNo,m]));
  const stack = (title, ids, cls="") => `<div class="bracket-stack ${cls}">
    <div class="bracket-round-title">${title}</div>
    <div class="bracket-stack-matches">${ids.map(id=>bracketMatchCard(byId[id], champ, modeFn(byId[id]))).join("")}</div>
  </div>`;
  const finalMode = modeFn(k.final);
  const champKnown = champ && finalMode === "full";
  return `<div class="bracket-scroll"><div class="bracket-stage">
    <div class="bracket-side bracket-left">
      ${stack("16-avos", [74,77,73,75,83,84,81,82], "r32")}
      ${stack("Oitavas", [89,90,93,94], "r16")}
      ${stack("Quartas", [97,98], "qf")}
      ${stack("Semifinal", [101], "sf")}
    </div>
    <div class="bracket-center">
      <div class="bracket-final-node">
        <div class="bracket-round-title text-gold-600">Final</div>
        ${bracketMatchCard(k.final, champ, finalMode)}
        ${champKnown?`<div class="bracket-champ-banner">
          <div class="text-[10px] uppercase tracking-widest font-extrabold text-gold-600 flex items-center justify-center gap-1.5">${ic('trophy','w-3.5 h-3.5')} Campeão</div>
          <div class="font-display font-extrabold text-base mt-1 flex items-center justify-center gap-2">${flag(champ)} ${champ}</div>
        </div>`:''}
      </div>
    </div>
    <div class="bracket-side bracket-right">
      ${stack("Semifinal", [102], "sf")}
      ${stack("Quartas", [99,100], "qf")}
      ${stack("Oitavas", [91,92,95,96], "r16")}
      ${stack("16-avos", [76,78,79,80,86,88,85,87], "r32")}
    </div>
  </div></div>`;
}
function renderBracket(){
  const s=currentSim(), k=s.knockout, champ=s.champion;
  renderRankingProtection();
  $("#bracket").innerHTML = buildBracketHTML(s, champ, ()=>'full');

  // 3º lugar + ficha da final
  const tp=k.third, f=k.final;
  $("#thirdFinalWrap").innerHTML =
    knockoutDetailCard(`${ic('award','w-4 h-4 text-amber-700')} Disputa de 3º lugar`, tp) +
    knockoutDetailCard(`${ic('trophy','w-4 h-4 text-gold-600')} Final`, f);

  // clique nas partidas do bracket abre o modal com gols/resumo
  const all=[...k.R32,...k.R16,...k.QF,...k.SF,k.third,k.final];
  document.querySelectorAll("#bracket .bracket-match[data-match-no]").forEach(card=>{
    card.onclick=()=>{
      const m=all.find(x=>String(x.matchNo)===card.dataset.matchNo);
      if(m) openMatchModal(m);
    };
  });
  paintIcons();
}
function knockoutDetailCard(title, m){
  return `<div class="glass card-hover rounded-3xl p-5 shadow-glass">
    <div class="text-[11px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">${title} · ${m.kickoff || m.city}</div>
    <div class="flex items-center justify-center gap-3 sm:gap-5 mt-3">
      <div class="flex-1 text-right font-display font-extrabold text-lg flex items-center justify-end gap-2 ${m.winner.team===m.home?'':'text-slate-400'}">${m.home} ${flag(m.home)}</div>
      <div class="px-3 py-1 rounded-xl bg-ink text-white font-extrabold tnum text-lg">${scoreLine(m)}</div>
      <div class="flex-1 text-left font-display font-extrabold text-lg flex items-center gap-2 ${m.winner.team===m.away?'':'text-slate-400'}">${flag(m.away)} ${m.away}</div>
    </div>
    ${goalChips(m)}
    <div class="mt-3 text-sm text-slate-500 flex items-center gap-1.5 flex-wrap"><b class="text-slate-700">Destaque:</b> ${m.goals.length?m.goals.sort((a,b)=>b.minute-a.minute)[0].player:'defesas decisivas'} · <b class="text-slate-700">Vencedor:</b> ${flag(m.winner.team)} ${m.winner.team}</div>
  </div>`;
}

/* ---- MATCH MODAL ---- */
function openMatchModal(m){
  let modal=$("#matchModal");
  if(!modal){
    modal=el("div","fixed inset-0 z-[70] hidden items-center justify-center p-4");
    modal.id="matchModal";
    modal.innerHTML=`<div class="absolute inset-0 bg-ink/40 backdrop-blur-sm" data-close></div>
      <div id="modalBox" class="relative glass rounded-3xl shadow-lift max-w-lg w-full p-6 swap"></div>`;
    document.body.appendChild(modal);
    modal.addEventListener("click",e=>{ if(e.target.dataset.close!==undefined) closeModal(); });
  }
  $("#modalBox").innerHTML=`
    <button class="absolute top-4 right-4 text-slate-400 hover:text-ink" data-close>✕</button>
    <div class="text-[11px] font-bold uppercase tracking-wider text-slate-400">${m.stage}</div>
    <div class="flex items-center justify-center gap-4 mt-3">
      <div class="flex-1 text-right font-display font-extrabold text-xl ${m.winner&&m.winner.team===m.home?'':'text-slate-400'}">${m.home} ${flag(m.home)}</div>
      <div class="px-3 py-1.5 rounded-xl bg-ink text-white font-extrabold tnum text-xl">${scoreLine(m)}</div>
      <div class="flex-1 text-left font-display font-extrabold text-xl ${m.winner&&m.winner.team===m.away?'':'text-slate-400'}">${flag(m.away)} ${m.away}</div>
    </div>
    <div class="text-center text-xs text-slate-400 mt-2">${matchScheduleLine(m)}</div>
    ${goalChips(m)}`;
  $("#modalBox").querySelector("[data-close]").onclick=closeModal;
  modal.classList.remove("hidden"); modal.classList.add("flex");
}
function closeModal(){ const m=$("#matchModal"); if(m){ m.classList.add("hidden"); m.classList.remove("flex"); } }

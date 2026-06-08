"use strict";

/* =================================================================
   RENDER HELPERS
   ================================================================= */
const $ = s=>document.querySelector(s);
const el = (tag,cls,html)=>{ const e=document.createElement(tag); if(cls)e.className=cls; if(html!=null)e.innerHTML=html; return e; };

// código ISO de cada seleção para bandeiras reais (flag-icons).
// gb-eng / gb-sct usam as bandeiras das subnações do Reino Unido.
const ISO = window.WC_DATA.ISO;
// bandeira real da seleção (retorna HTML); size: ""|"flag-lg"|"flag-xl"
const flag = (t,size="") => { const c=ISO[t]; return c?`<span class="fi fi-${c} flag-img ${size}"></span>`:""; };
function teamStatus(team){
  const o=TEAMS[team].ovr;
  if(["México","Canadá","Estados Unidos"].includes(team)) return "Anfitriã";
  if(o>=88) return "Favorita";
  if(o>=82) return "Candidata";
  if(o>=76) return "Competitiva";
  return "Zebra";
}
function deriveTeamMeta(team){
  const data=TEAMS[team];
  const byPos = pos => data.sq.filter(p=>p[1]===pos).sort((a,b)=>b[2]-a[2]);
  const attack = byPos("FW").slice(0,5).reduce((s,p)=>s+p[2],0);
  const midfield = byPos("MF").slice(0,5).reduce((s,p)=>s+p[2],0);
  const defense = byPos("DF").slice(0,5).reduce((s,p)=>s+p[2],0);
  const stars = data.sq.filter(p=>(p[3]||"").includes("S")).sort((a,b)=>b[2]-a[2]);
  const likely = data.sq.filter(p=>p[2]>0).sort((a,b)=>b[2]-a[2]).slice(0,6).map(p=>p[0]);
  return {
    flag:flag(team),
    confederation:data.conf,
    strength:data.ovr,
    attack:Math.round(70+attack*1.4),
    midfield:Math.round(70+midfield*1.7),
    defense:Math.round(70+defense*2.4),
    goalkeeper:Math.round(72+(byPos("GK")[0]?.[2]||0)*4),
    coach:data.coach,
    morale:Math.round(64+data.ovr*.32),
    history:["Brasil","Argentina","Alemanha","França","Espanha","Inglaterra","Holanda","Portugal","Uruguai"].includes(team)?94:Math.round(56+data.ovr*.35),
    pressureResistance:Math.round(58+data.ovr*.38),
    starPower:stars.length?Math.min(99,78+stars.length*5+Math.round((stars[0]?.[2]||0)*1.3)):Math.round(52+data.ovr*.35),
    status:teamStatus(team),
    keyPlayers:(stars.length?stars:data.sq.slice().sort((a,b)=>b[2]-a[2])).slice(0,5).map(p=>p[0]),
    likelyScorers:likely,
  };
}
const teamMeta = Object.fromEntries(Object.keys(TEAMS).map(t=>[t,deriveTeamMeta(t)]));
// ícone lucide (placeholder convertido por lucide.createIcons())
const ic = (name,cls="") => `<i data-lucide="${name}" class="ico ${cls}"></i>`;
// renderiza/atualiza todos os ícones lucide presentes no DOM
function paintIcons(){ if(window.lucide && lucide.createIcons) lucide.createIcons(); }

function statusBadge(status){
  if(status==="Classificado") return `<span class="text-[10px] font-bold px-2 py-0.5 rounded-full bg-mxgreen/15 text-mxgreen">Classificado</span>`;
  if(status==="3º classificado") return `<span class="text-[10px] font-bold px-2 py-0.5 rounded-full bg-gold-500/20 text-gold-600">3º · melhores</span>`;
  return `<span class="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-200 text-slate-500">Eliminado</span>`;
}
function rowDot(pos, qualified){
  if(pos<=2) return "bg-mxgreen";
  if(pos===3 && qualified) return "bg-gold-500";
  return "bg-slate-300";
}
// "grande zebra positiva": prioriza o azarão que foi mais longe (cinderela);
// se ele protagonizou a maior zebra, cita a vítima.
function zebraTeam(s){
  const h=s.highlights, up=h.biggestUpset;
  if(h.cinderella){
    if(up && up.m.winner.team===h.cinderella) return {team:h.cinderella, sub:`bateu ${up.m.loser.team} e chegou ${h.cinderellaStage}`};
    return {team:h.cinderella, sub:`chegou ${h.cinderellaStage}`};
  }
  if(up) return {team:up.m.winner.team, sub:`bateu ${up.m.loser.team}`};
  return {team:s.champion, sub:"surpresa do torneio"};
}

function renderSimulationTypeBadge(type){
  const p=profileFor(type);
  return `<span class="profile-badge ${p.className} inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-extrabold uppercase tracking-wider">${ic(type==="epic"?"sparkles":type==="dramatic"?"flame":"bar-chart-3","w-3.5 h-3.5")} ${p.label}</span>`;
}
function profileButton(type, active=false, compact=false){
  const p=profileFor(type);
  return `<button class="type-control ${p.className} ${active?'active':''} ${compact?'px-3 py-2 text-xs':'px-4 py-2.5 text-sm'} rounded-2xl font-extrabold glass card-hover border border-white/60" data-type="${type}">
    <span class="profile-badge ${p.className} px-2 py-1 rounded-full">${p.label}</span>
  </button>`;
}
function renderSimulationTypeControls(targetId, compact=false){
  const target=$("#"+targetId);
  if(!target) return;
  const activeType = activeRecord()?.type || "realistic";
  target.innerHTML = PROFILE_ORDER.map(type=>profileButton(type, type===activeType, compact)).join("");
  target.querySelectorAll("[data-type]").forEach(btn=>{
    btn.onclick=()=>generateSimulation(btn.dataset.type);
  });
}
function getAllTeamsFromSimulation(){ return Object.keys(TEAMS).sort((a,b)=>a.localeCompare(b,"pt-BR")); }
function getFavoriteTeam(){ return activeRecord()?.favoriteTeam || appState.draftTeam || null; }
// inicia o assistente de criação de uma nova simulação

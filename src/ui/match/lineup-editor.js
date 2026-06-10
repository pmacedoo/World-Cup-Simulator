
/* =================================================================
   EDITOR DE ESCALAÇÃO (MODO TÉCNICO)
   -----------------------------------------------------------------
   Antes de cada jogo da seleção favorita, o usuário monta a tática:
   formação, XI titular, capitão, postura e cobradores. A escolha é
   gravada no registro (setMatchTactic) e passa a valer na partida:
   XI exibido, cobradores de pênalti/falta e deltas de força.
   ================================================================= */

import { TEAMS } from "../../data/worldcup-data.js";
import { WC_LINEUPS } from "../../engine/lineups.js";
import { getTeamMatches } from "../../domain/matches/match-queries.js";
import { activeRecord, currentSim, setDefaultTactic, setMatchTactic } from "../../state/simulation-store.js";
import { $, el, flag, getFavoriteTeam, ic, paintIcons } from "../render-helpers.js";
import { renderFavoriteTeamJourney } from "../journey/journey-screens.js";
import { openMatchSimulator } from "./match-simulator.js";

const MENTALITIES = [
  { key:"attack",   label:"Ofensivo",    note:"+ataque / -defesa", icon:"swords" },
  { key:"balanced", label:"Equilibrado", note:"postura neutra",    icon:"scale" },
  { key:"defend",   label:"Defensivo",   note:"+defesa / -ataque", icon:"shield" },
];
const POS_GROUPS = [
  { pos:"GK", label:"Goleiro" },
  { pos:"DF", label:"Defesa" },
  { pos:"MF", label:"Meio-campo" },
  { pos:"FW", label:"Ataque" },
];

// Resolvida relativa a ESTE módulo: funciona no vite dev, no build
// (o vite detecta o padrão e empacota com hash) e em servidor estático
// comum servindo a raiz do projeto — sem depender do public/ na raiz.
const FIELD_IMAGE_URL = new URL("../../assets/images/soccerfieldremaster.png", import.meta.url);

let plannerState = null;
let _plannerSuppressClickUntil = 0;

function openTacticPlanner(match, journeyIndex=0){
  const record = activeRecord();
  const team = getFavoriteTeam();
  // só edita a PRÓXIMA partida ainda não jogada; replays/jogos passados vão direto
  if(!record || !team || !TEAMS[team] || journeyIndex !== record.revealed){
    openMatchSimulator(match, journeyIndex);
    return;
  }
  const saved = record.tactics && record.tactics[journeyIndex];
  const defaultTactic = record.defaultTactic;
  const auto = WC_LINEUPS.autoTactic(team);
  const base = clonePlannerBase(
    WC_LINEUPS.validateTactic(team, saved).valid ? saved
      : WC_LINEUPS.validateTactic(team, defaultTactic).valid ? defaultTactic
      : auto
  );

  plannerState = {
    match, journeyIndex, team,
    formation: base.formation,
    starters: base.starters.slice(),
    captain: base.captain,
    penaltyTaker: base.penaltyTaker || "",
    freeKickTaker: base.freeKickTaker || "",
    mentality: base.mentality || "balanced",
    fieldPositions: base.positions || {},
    listPositionIndex: 0,
    fieldSelection: "",
    error: "",
  };
  orderStarters();

  let modal = $("#tacticPlanner");
  if(!modal){
    modal = el("div","fixed inset-0 z-[80] hidden items-center justify-center p-3 sm:p-5");
    modal.id = "tacticPlanner";
    modal.innerHTML = `<div class="absolute inset-0 bg-ink/55 backdrop-blur-xl" data-close></div>
      <div id="tacticPlannerBox" class="relative guided-card rounded-[2rem] shadow-lift w-full max-w-5xl max-h-[94vh] overflow-y-auto p-4 sm:p-6 swap" role="dialog" aria-modal="true" aria-label="Planejador tático"></div>`;
    document.body.appendChild(modal);
    modal.addEventListener("click", e=>{ if(e.target.dataset.close!==undefined) closeTacticPlanner(true); });
  }
  modal.classList.remove("hidden"); modal.classList.add("flex");
  renderPlanner();
}

function emptyTactic(team){
  return {
    formation: TEAMS[team]?.shape || "4-3-3",
    starters: [],
    captain: "",
    penaltyTaker: "",
    freeKickTaker: "",
    mentality: "balanced",
    liveScript: [],
    positions: {},
  };
}

function clonePlannerBase(tactic){
  const base = tactic || emptyTactic(getFavoriteTeam());
  return {
    formation: base.formation || "4-3-3",
    starters: Array.isArray(base.starters) ? base.starters.slice(0, 11) : [],
    captain: base.captain || "",
    penaltyTaker: base.penaltyTaker || "",
    freeKickTaker: base.freeKickTaker || "",
    mentality: base.mentality || "balanced",
    positions: Object.fromEntries(Object.entries(base.positions || {}).map(([name, pos]) => [name, {...pos}])),
    liveScript: [],
  };
}

function closeTacticPlanner(backToJourney){
  const modal = $("#tacticPlanner");
  if(modal){ modal.classList.add("hidden"); modal.classList.remove("flex"); }
  plannerState = null;
  if(backToJourney) renderFavoriteTeamJourney();
}

/* ---------- helpers de estado ---------- */
function plSquad(){ return TEAMS[plannerState.team].sq; }
function plRaw(name){ return plSquad().find(p=>p[0]===name); }
function plPos(name){ return plRaw(name)?.[1]; }
function plStar(name){ return (plRaw(name)?.[3]||"").includes("S"); }
function plTitular(name){ return (plRaw(name)?.[3]||"").includes("XI"); }
function plRank(name){ return WC_LINEUPS.playerRank(plannerState.team, name); }
function plSlots(){ return WC_LINEUPS.formationSlots(plannerState.formation); }
function plPosCount(pos){ return slotAssignments().filter(s=>s.pos===pos && s.name).length; }
function distributeY(count){
  const presets = {
    1:[50],
    2:[35,65],
    3:[25,50,75],
    4:[18,39,61,82],
    5:[14,32,50,68,86],
  };
  return presets[count] || presets[4];
}
function formationFieldSlots(){
  const shape = plannerState.formation || "4-3-3";
  const nums = String(shape).match(/\d+/g)?.map(Number) || [4,3,3];
  const mentalityShift = plannerState.mentality==="attack" ? 6 : plannerState.mentality==="defend" ? -6 : 0;
  const lineX = (base, pos) => pos==="GK" ? 11 : Math.max(18, Math.min(82, base + mentalityShift));
  // 4-number formations (e.g. 4-2-3-1): render two separate MF rows
  const lines = nums.length >= 4
    ? [
        {pos:"GK", x:lineX(13,"GK"), count:1},
        {pos:"DF", x:lineX(29,"DF"), count:nums[0]},
        {pos:"MF", x:lineX(43,"MF"), count:nums[1]},
        {pos:"MF", x:lineX(57,"MF"), count:nums[2]},
        {pos:"FW", x:lineX(71,"FW"), count:nums[3]},
      ]
    : [
        {pos:"GK", x:lineX(13,"GK"), count:1},
        {pos:"DF", x:lineX(30,"DF"), count:nums[0]||4},
        {pos:"MF", x:lineX(50,"MF"), count:nums[1]||3},
        {pos:"FW", x:lineX(69,"FW"), count:nums[2]||3},
      ];
  return lines.flatMap((line,li)=>distributeY(line.count).map((y,i)=>({
    id:`${line.pos}-${li}-${i}`,
    pos:line.pos,
    x:line.x,
    y,
    label:`${line.pos}${i+1}`,
  })));
}
function slotPayload(slot){
  return {slot:slot.id, pos:slot.pos, x:slot.x, y:slot.y};
}
function setFieldSlot(name, slot){
  if(!name || !slot) return;
  plannerState.fieldPositions[name] = slotPayload(slot);
}
function slotAssignments(){
  const slots=formationFieldSlots().map(slot=>({...slot, name:""}));
  const slotIndex=Object.fromEntries(slots.map((slot,i)=>[slot.id,i]));
  const names=new Set(plSquad().map(p=>p[0]));
  const starters=[...new Set(plannerState.starters.filter(n=>names.has(n)))].slice(0,11);
  const placed=new Set();
  starters.forEach(name=>{
    const fp=plannerState.fieldPositions?.[name];
    const i=fp && slotIndex[fp.slot];
    if(i!==undefined && !slots[i].name){
      slots[i].name=name;
      placed.add(name);
    }
  });
  const place=(name, predicate)=>{
    const i=slots.findIndex(slot=>!slot.name && predicate(slot));
    if(i<0) return false;
    slots[i].name=name;
    placed.add(name);
    return true;
  };
  starters.forEach(name=>{ if(!placed.has(name)) place(name, slot=>slot.pos===plPos(name)); });
  starters.forEach(name=>{ if(!placed.has(name)) place(name, slot=>slot.pos!=="GK"); });
  starters.forEach(name=>{ if(!placed.has(name)) place(name, ()=>true); });
  return slots;
}
function replaceStarterInSlot(slotIndex, name){
  const st=plannerState;
  const slot=formationFieldSlots()[slotIndex];
  if(!slot || !name) return;
  const assignedNow=slotAssignments();
  const currentNow=assignedNow[slotIndex]?.name;
  const incomingSlot=assignedNow.find(s=>s.name===name);
  const currentIdxNow=currentNow ? st.starters.indexOf(currentNow) : -1;
  const incomingIdxNow=st.starters.indexOf(name);
  if(currentNow===name) return;
  if(incomingIdxNow>=0){
    if(currentNow && incomingSlot) setFieldSlot(currentNow, incomingSlot);
    setFieldSlot(name, slot);
  } else if(currentIdxNow>=0) {
    st.starters[currentIdxNow]=name;
    delete st.fieldPositions[currentNow];
    setFieldSlot(name, slot);
  } else {
    if(st.starters.length>=11){
      st.error="A escalação já tem 11 jogadores. Remova alguém antes de adicionar outro.";
      renderPlanner();
      return;
    }
    st.starters.push(name);
    setFieldSlot(name, slot);
  }
  st.error=plPos(name)!==slot.pos ? `${name} improvisado em ${slot.pos}: desempenho reduzido.` : "";
  st.fieldSelection="";
  sanitizeRoles();
  renderPlanner();
}
const POS_ORDER = { GK:0, DF:1, MF:2, FW:3 };
function orderStarters(){
  plannerState.starters.sort((a,b)=> (POS_ORDER[plPos(a)]??9)-(POS_ORDER[plPos(b)]??9) || plRank(b)-plRank(a));
}
// Tática final enviada ao registro. O roteiro ao vivo (liveScript) nasce
// vazio aqui: trocas em jogo são adicionadas pela janela de substituição.
function plTactic(){
  const st = plannerState;
  const positions = Object.fromEntries(slotAssignments().filter(s=>s.name).map(s=>[s.name,slotPayload(s)]));
  const penaltyTaker = st.starters.includes(st.penaltyTaker) ? st.penaltyTaker : "";
  const freeKickTaker = st.starters.includes(st.freeKickTaker) ? st.freeKickTaker : "";
  return { formation:st.formation, starters:st.starters.slice(), captain:st.captain, penaltyTaker, freeKickTaker, mentality:st.mentality, positions, liveScript:[] };
}
function sanitizeRoles(){
  const st = plannerState;
  if(!st.starters.includes(st.captain)) st.captain = WC_LINEUPS.pickCaptain(st.team, st.starters) || st.starters[0] || "";
  if(st.penaltyTaker && !st.starters.includes(st.penaltyTaker)) st.penaltyTaker = "";
  if(st.freeKickTaker && !st.starters.includes(st.freeKickTaker)) st.freeKickTaker = "";
}

/* ---------- mutações ---------- */
function setFormation(f){
  const st = plannerState;
  if(st.formation===f) return;
  const kept = st.starters.slice(0,11);
  st.formation = f;
  st.starters = kept;
  orderStarters();
  sanitizeRoles();
  if(!st.starters.length) st.captain = "";
  st.fieldPositions = {};
  st.fieldSelection = "";
  st.error = "";
  renderPlanner();
}
function toggleStarter(name){
  const st = plannerState;
  if(st.fieldSelection && !st.starters.includes(name)){
    const assigned=slotAssignments();
    const slotIndex=assigned.findIndex(s=>s.name===st.fieldSelection);
    if(slotIndex>=0){
      replaceStarterInSlot(slotIndex, name);
      return;
    }
  }
  const existingIdx = st.starters.indexOf(name);
  if(existingIdx>=0){
    st.starters.splice(existingIdx,1);
    delete st.fieldPositions[name];
    if(st.fieldSelection===name) st.fieldSelection="";
    sanitizeRoles();
    st.error="";
    renderPlanner();
    return;
  }
  if(st.starters.length>=11){
    st.error="A escalação já tem 11 jogadores. Remova alguém antes de adicionar outro.";
    renderPlanner();
    return;
  }
  const assigned=slotAssignments();
  const slot=assigned.find(s=>!s.name && s.pos===plPos(name)) || assigned.find(s=>!s.name);
  st.starters.push(name);
  if(slot) setFieldSlot(name, slot);
  sanitizeRoles();
  st.error=slot && plPos(name)!==slot.pos ? `${name} improvisado em ${slot.pos}: desempenho reduzido.` : "";
  renderPlanner();
}
function setCaptain(name){ if(plannerState.starters.includes(name)){ plannerState.captain=name; renderPlanner(); } }
function setMentality(m){ plannerState.mentality=m; renderPlanner(); }
function selectFieldPlayer(name){
  if(!plannerState || !name) return;
  plannerState.fieldSelection = plannerState.fieldSelection===name ? "" : name;
  plannerState.error = plannerState.fieldSelection ? `${name} selecionado para sair. Agora escolha um reserva.` : "";
  renderPlanner();
}
function resetAuto(){
  const st = plannerState;
  const auto = WC_LINEUPS.autoTactic(st.team);
  st.formation = auto.formation; st.starters = auto.starters.slice();
  st.captain = auto.captain; st.penaltyTaker = ""; st.freeKickTaker = "";
  st.mentality = "balanced"; st.fieldPositions = {}; st.fieldSelection = ""; st.error = "";
  orderStarters();
  renderPlanner();
}
function activePositionGroup(){
  const i=Math.max(0, Math.min(plannerState.listPositionIndex||0, POS_GROUPS.length-1));
  return POS_GROUPS[i];
}
function movePositionCarousel(delta){
  plannerState.listPositionIndex = (POS_GROUPS.length + (plannerState.listPositionIndex||0) + delta) % POS_GROUPS.length;
  renderPlanner();
}
function scrollPlayerCarousel(button){
  const list = button.closest(".lineup-player-carousel")?.querySelector(".lineup-scroll-target");
  if(!list) return;
  const dir = Number(button.dataset.playerScroll || 0);
  list.scrollBy({top: dir * Math.max(96, Math.round(list.clientHeight * .78)), behavior:"smooth"});
}

/* ---------- render ---------- */
function deltaPill(label, v){
  const up = v>0.05, down = v<-0.05;
  const cls = up?"text-mxgreen bg-mxgreen/10":down?"text-usared bg-usared/10":"text-slate-500 bg-slate-100";
  const arrow = up?"▲":down?"▼":"■";
  return `<div class="flex-1 rounded-2xl px-3 py-2.5 ${cls}">
    <div class="text-[10px] uppercase tracking-widest font-extrabold opacity-70">${label}</div>
    <div class="font-display font-extrabold text-lg">${arrow} ${v>=0?"+":""}${v.toFixed(1)}</div>
  </div>`;
}
function posToneClass(pos){
  return `pos-tone-${String(pos||"").toLowerCase()}`;
}
function playerChip(name){
  const st = plannerState;
  const selected = st.starters.includes(name);
  const isCap = st.captain===name && selected;
  const star = plStar(name), tit = plTitular(name);
  const base = selected
    ? "is-selected bg-slate-100 text-slate-400 border-slate-200"
    : "bg-white/70 text-slate-700 border-white hover:border-usablue/40";
  return `<button type="button" draggable="true" class="planner-player ${posToneClass(plPos(name))} flex items-center gap-2 rounded-2xl border px-3 py-2 text-left transition ${base}" data-name="${name}">
    <span class="planner-player-badge w-9 h-9 rounded-xl grid place-items-center font-extrabold text-[11px]">${plPos(name)}</span>
    <span class="min-w-0 flex-1">
      <span class="block font-bold text-sm truncate flex items-center gap-1">${name} ${star?'<span class="text-gold-400">★</span>':''}</span>
      <span class="block text-[10px] uppercase tracking-wider font-extrabold ${selected?'text-slate-400':'text-slate-400'}">${tit?'Titular base':'Reserva'}</span>
    </span>
    ${isCap?'<span class="flex-none w-6 h-6 rounded-full bg-gold-400 text-ink grid place-items-center font-extrabold text-[11px]">C</span>':''}
    ${selected?'<span class="flex-none text-slate-400">'+ic('check','w-4 h-4')+'</span>':''}
  </button>`;
}
function renderLineupField(){
  const assigned=slotAssignments();
  return `<div class="lineup-field-wrap">
    <img class="lineup-field-img" src="${FIELD_IMAGE_URL}" alt="Campo de futebol">
    <div class="lineup-field-overlay">
      ${assigned.map((slot,i)=>`
        <div class="lineup-drop-slot ${slot.name?'filled':''} ${slot.name && plPos(slot.name)!==slot.pos?'misplaced':''} ${plannerState.fieldSelection===slot.name?'field-selected':''}" data-slot="${i}" data-pos="${slot.pos}" ${slot.name?`data-field-name="${slot.name}"`:""} style="left:${slot.x}%;top:${slot.y}%">
          ${slot.name ? `<div class="lineup-field-player ${posToneClass(plPos(slot.name))} ${plannerState.fieldSelection===slot.name?'is-field-selected':''} ${plPos(slot.name)!==slot.pos?'is-misplaced':''}" draggable="true" data-name="${slot.name}">
            <span class="lineup-pos">${slot.pos}</span>
            <span class="lineup-name">${lineupCircleName(slot.name)}</span>
            ${plannerState.captain===slot.name?'<span class="lineup-captain">C</span>':''}
          </div>` : `<div class="lineup-empty">${slot.label}</div>`}
        </div>`).join("")}
    </div>
  </div>`;
}
function lineupCircleName(name){
  const parts=String(name||"").trim().split(/\s+/).filter(Boolean);
  const sizeClass = value => {
    const n=String(value||"").length;
    return n>12 ? "tiny" : n>9 ? "small" : "";
  };
  if(parts.length<=1) return `<span class="lineup-main ${sizeClass(name)}">${name||""}</span>`;
  const first=`${parts[0][0]}.`;
  const surname=parts.slice(1).join(" ").replace(/\bJr\b\.?/i,"Junior");
  return `<span class="lineup-initial">${first}</span><span class="lineup-surname ${sizeClass(surname)}">${surname}</span>`;
}
function positionBlock(group){
  const st = plannerState;
  const want = plSlots()[group.pos] || 0;
  const have = plPosCount(group.pos);
  const full = have===want;
  const countCls = full?"text-mxgreen bg-mxgreen/10":"text-amber-600 bg-amber-100";
  const players = plSquad().filter(p=>p[1]===group.pos).map(p=>p[0]).sort((a,b)=>plRank(b)-plRank(a));
  return `<div>
    <div class="flex items-center justify-between mb-2">
      <div class="text-[11px] uppercase tracking-widest font-extrabold text-slate-400">${group.label}</div>
      <div class="text-[11px] font-extrabold rounded-full px-2 py-0.5 ${countCls}">${have}/${want}</div>
    </div>
    <div class="lineup-scroll-shell">
      <button type="button" class="player-scroll-btn" data-player-scroll="-1" aria-label="Rolar jogadores para cima">${ic('chevron-up','w-4 h-4')}</button>
      <div class="lineup-scroll-target grid sm:grid-cols-2 gap-2">${players.map(playerChip).join("")}</div>
      <button type="button" class="player-scroll-btn" data-player-scroll="1" aria-label="Rolar jogadores para baixo">${ic('chevron-down','w-4 h-4')}</button>
    </div>
  </div>`;
}
function positionCarousel(){
  const i=Math.max(0, Math.min(plannerState.listPositionIndex||0, POS_GROUPS.length-1));
  const group=POS_GROUPS[i];
  return `<div class="lineup-player-carousel">
    <div class="flex items-center justify-between gap-3 mb-3">
      <button class="pos-carousel-btn" data-dir="-1" title="Posição anterior">${ic('chevron-left','w-4 h-4')}</button>
      <div class="text-center min-w-0">
        <div class="text-[10px] uppercase tracking-widest font-extrabold text-slate-400">Lista de jogadores</div>
        <div class="font-display font-extrabold text-lg leading-tight">${group.label}</div>
      </div>
      <button class="pos-carousel-btn" data-dir="1" title="Próxima posição">${ic('chevron-right','w-4 h-4')}</button>
    </div>
    <div class="flex justify-center gap-1.5 mb-3">
      ${POS_GROUPS.map((g,idx)=>`<button class="pos-carousel-dot ${idx===i?'active':''}" data-pos-dot="${idx}" title="${g.label}"></button>`).join("")}
    </div>
    ${positionBlock(group)}
  </div>`;
}
function captainOptions(){
  return plannerState.starters.map(n=>`<option value="${n}" ${n===plannerState.captain?'selected':''}>${n}</option>`).join("");
}
function createLineupDragGhost(name){
  const ghost = document.createElement("div");
  ghost.className = "lineup-drag-ghost";
  ghost.innerHTML = `<div class="lineup-field-player ${posToneClass(plPos(name))}">
    <span class="lineup-pos">${plPos(name)}</span>
    <span class="lineup-name">${lineupCircleName(name)}</span>
  </div>`;
  document.body.appendChild(ghost);
  return ghost;
}
function setPlayerDragVisual(name, active){
  document.querySelectorAll("#tacticPlannerBox [draggable='true'][data-name]").forEach(node=>{
    if(node.dataset.name===name) node.classList.toggle("is-dragging", active);
  });
}
function clearPlannerPointerDrag(drag, source, pointerId){
  if(drag?.ghost) drag.ghost.remove();
  if(source){
    source.classList.remove("is-dragging");
    source.releasePointerCapture?.(pointerId);
  }
  if(drag?.name) setPlayerDragVisual(drag.name, false);
}
function renderPlanner(){
  const st = plannerState; if(!st) return;
  const box = $("#tacticPlannerBox"); if(!box) return;
  const m = st.match;
  const opp = m.home===st.team ? m.away : m.home;
  const tactic = plTactic();
  const valid = WC_LINEUPS.validateTactic(st.team, tactic).valid;
  const rating = WC_LINEUPS.lineupRating(st.team, tactic);
  const coach = TEAMS[st.team].coach;

  box.innerHTML = `
    <button class="absolute top-4 right-4 text-slate-400 hover:text-ink" data-close aria-label="Fechar planejador">✕</button>
    <div class="pr-8">
      <div class="text-[11px] uppercase tracking-widest font-extrabold text-usablue">${m.matchNo?`M${m.matchNo} · `:''}${m.stage} · você comanda</div>
      <div class="mt-1 font-display font-extrabold text-2xl sm:text-3xl flex flex-wrap items-center gap-2">
        ${flag(st.team,'flag-lg')} ${st.team}
        <span class="text-slate-300 text-lg">vs</span>
        ${flag(opp,'flag-lg')} <span class="text-slate-500">${opp}</span>
      </div>
      <p class="mt-1 text-sm text-slate-500 font-semibold">Técnico ${coach} · monte a escalação que vai a campo. Suas escolhas mudam o resultado.</p>
    </div>

    <div class="mt-5 space-y-5">
      <div class="guided-card rounded-3xl p-4">
        <div class="flex items-center justify-between mb-3">
          <div class="flex items-center gap-2">
            <div class="font-display font-extrabold text-lg">Escalação atual</div>
            <button type="button" class="lineup-help-tip" aria-label="Como montar a escalação">
              ${ic('help-circle','w-4 h-4')}
              <span>Clique em um jogador para colocar ou tirar do campo. Se preferir, arraste da lista e solte na bolinha da posição.</span>
            </button>
          </div>
          <button id="autoLineup" class="text-xs font-extrabold text-usablue hover:underline flex items-center gap-1">${ic('wand-2','w-3.5 h-3.5')} Automática</button>
        </div>
        ${st.error?`<div class="mb-3 rounded-2xl bg-usared/10 border border-usared/20 px-3 py-2 text-sm font-bold text-usared">${st.error}</div>`:""}
        ${renderLineupField()}
        <div class="mt-4">
          ${positionCarousel()}
        </div>
      </div>

      <div class="grid lg:grid-cols-2 gap-4 items-start">
        <div class="guided-card rounded-3xl p-4">
          <div class="text-[11px] uppercase tracking-widest font-extrabold text-slate-400 mb-2">Esquema tático</div>
          <div class="flex flex-wrap gap-2">
            ${WC_LINEUPS.FORMATIONS.map(f=>`<button class="formation-btn rounded-xl px-3 py-1.5 text-sm font-extrabold border ${f===st.formation?'bg-ink text-white border-ink':'glass text-slate-600 border-white/70'}" data-f="${f}">${f}</button>`).join("")}
          </div>
        </div>

        <div class="guided-card rounded-3xl p-4">
          <div class="text-[11px] uppercase tracking-widest font-extrabold text-slate-400 mb-2">Força vs escalação padrão</div>
          <div class="flex gap-2">
            ${deltaPill("Ataque", rating.attackDelta)}
            ${deltaPill("Defesa", rating.defenseDelta)}
          </div>
          <p class="mt-2 text-[11px] text-slate-400 font-semibold leading-snug">Em equivalente de força. O padrão do seu time é 0/0; mudanças de XI, formação e postura movem a agulha.</p>
        </div>

        <div class="guided-card rounded-3xl p-4">
          <div class="text-[11px] uppercase tracking-widest font-extrabold text-slate-400 mb-2">Postura</div>
          <div class="grid grid-cols-3 gap-2">
            ${MENTALITIES.map(mt=>`<button class="mentality-btn rounded-2xl px-2 py-2.5 text-center border ${mt.key===st.mentality?'bg-usablue text-white border-usablue':'glass text-slate-600 border-white/70'}" data-m="${mt.key}">
              <div class="flex justify-center mb-1">${ic(mt.icon,'w-4 h-4')}</div>
              <div class="font-extrabold text-sm">${mt.label}</div>
              <div class="text-[10px] ${mt.key===st.mentality?'text-white/70':'text-slate-400'} font-semibold">${mt.note}</div>
            </button>`).join("")}
          </div>
        </div>

        <div class="guided-card rounded-3xl p-4">
          <div class="text-[11px] uppercase tracking-widest font-extrabold text-slate-400 mb-2">Capitão</div>
          <select id="captainSelect" class="w-full rounded-2xl border border-slate-200 px-3 py-2.5 font-bold text-sm">${captainOptions()}</select>
        </div>

        <div class="guided-card rounded-3xl p-4 lg:col-span-2">
          <div class="text-[11px] uppercase tracking-widest font-extrabold text-slate-400 mb-3">Cobradores</div>
          <div class="grid sm:grid-cols-2 gap-3">
            <div class="flex items-center gap-3">
              <span class="text-xs font-extrabold text-slate-500 w-20 shrink-0 flex items-center gap-1">${ic('circle-dot','w-3.5 h-3.5 text-usared')} Pênalti</span>
              <select id="penTakerSelect" class="flex-1 rounded-2xl border border-slate-200 px-3 py-2 font-bold text-sm">
                <option value="">— automático —</option>
                ${st.starters.filter(n=>plPos(n)!=="GK").map(n=>`<option value="${n}" ${n===st.penaltyTaker?'selected':''}>${n}</option>`).join("")}
              </select>
            </div>
            <div class="flex items-center gap-3">
              <span class="text-xs font-extrabold text-slate-500 w-20 shrink-0 flex items-center gap-1">${ic('flame','w-3.5 h-3.5 text-gold-500')} Falta</span>
              <select id="fkTakerSelect" class="flex-1 rounded-2xl border border-slate-200 px-3 py-2 font-bold text-sm">
                <option value="">— automático —</option>
                ${st.starters.filter(n=>plPos(n)!=="GK").map(n=>`<option value="${n}" ${n===st.freeKickTaker?'selected':''}>${n}</option>`).join("")}
              </select>
            </div>
          </div>
          <p class="mt-2.5 text-[10px] text-slate-400 font-semibold leading-snug">Escolha quem cobra pênaltis e faltas na partida. Afeta a narrativa e as cobranças na disputa.</p>
        </div>
      </div>
    </div>

    <div class="mt-5 flex flex-wrap items-center justify-between gap-3">
      <button id="cancelPlanner" class="glass rounded-2xl px-4 py-2.5 font-bold text-slate-600">Voltar</button>
      <div class="flex items-center gap-3">
        ${valid?'' : '<span class="text-xs font-extrabold text-amber-600">Complete o XI nas posições da formação</span>'}
        <button id="confirmPlanner" class="btn-premium text-white font-extrabold rounded-2xl px-6 py-3 ${valid?'':'opacity-40 pointer-events-none'}">${ic('play','w-4 h-4')} Confirmar e jogar</button>
      </div>
    </div>`;

  wirePlanner();
  paintIcons();
}

function wirePlanner(){
  document.querySelectorAll("#tacticPlannerBox .formation-btn").forEach(b=> b.onclick=()=>setFormation(b.dataset.f));
  document.querySelectorAll("#tacticPlannerBox .mentality-btn").forEach(b=> b.onclick=()=>setMentality(b.dataset.m));
  document.querySelectorAll("#tacticPlannerBox .planner-player").forEach(b=> b.onclick=()=>{
    if(Date.now()<_plannerSuppressClickUntil || b.classList.contains("is-dragging")) return;
    toggleStarter(b.dataset.name);
  });
  document.querySelectorAll("#tacticPlannerBox .pos-carousel-btn").forEach(b=> b.onclick=()=>movePositionCarousel(Number(b.dataset.dir||0)));
  document.querySelectorAll("#tacticPlannerBox .pos-carousel-dot").forEach(b=> b.onclick=()=>{ plannerState.listPositionIndex=Number(b.dataset.posDot||0); renderPlanner(); });
  document.querySelectorAll("#tacticPlannerBox [data-player-scroll]").forEach(b=> b.onclick=()=>scrollPlayerCarousel(b));
  document.querySelectorAll("#tacticPlannerBox [draggable='true'][data-name]").forEach(el=>{
    let pointerDrag=null;
    el.ondragstart=e=>{
      const name = el.dataset.name;
      e.dataTransfer.effectAllowed="move";
      e.dataTransfer.setData("text/plain", name);
      setPlayerDragVisual(name, true);
      const ghost = createLineupDragGhost(name);
      if(e.dataTransfer.setDragImage) e.dataTransfer.setDragImage(ghost, 23, 23);
      setTimeout(()=>ghost.remove(), 0);
      plannerState.error="";
    };
    el.ondragend=()=>setPlayerDragVisual(el.dataset.name, false);
    el.onpointerdown=e=>{
      if(e.pointerType==="mouse") return;
      const name=el.dataset.name;
      pointerDrag={name, moved:false, ghost:createLineupDragGhost(name)};
      el.setPointerCapture?.(e.pointerId);
      el.classList.add("is-dragging");
      setPlayerDragVisual(name, true);
      pointerDrag.ghost.style.left=`${e.clientX-23}px`;
      pointerDrag.ghost.style.top=`${e.clientY-23}px`;
    };
    el.onpointermove=e=>{
      if(!pointerDrag) return;
      pointerDrag.moved=true;
      pointerDrag.ghost.style.left=`${e.clientX-23}px`;
      pointerDrag.ghost.style.top=`${e.clientY-23}px`;
    };
    el.onpointerup=e=>{
      if(!pointerDrag) return;
      const drag=pointerDrag;
      drag.ghost.style.display="none";
      const target=document.elementFromPoint(e.clientX,e.clientY)?.closest?.("#tacticPlannerBox .lineup-drop-slot[data-slot]");
      clearPlannerPointerDrag(drag, el, e.pointerId);
      pointerDrag=null;
      if(target || drag.moved) _plannerSuppressClickUntil=Date.now()+350;
      if(target) replaceStarterInSlot(Number(target.dataset.slot), drag.name);
    };
    el.onpointercancel=e=>{
      clearPlannerPointerDrag(pointerDrag, el, e.pointerId);
      pointerDrag=null;
    };
  });
  document.querySelectorAll("#tacticPlannerBox .lineup-drop-slot").forEach(slot=>{
    slot.onclick=e=>{
      const fieldName=slot.dataset.fieldName;
      if(fieldName && Date.now()>=_plannerSuppressClickUntil) selectFieldPlayer(fieldName);
    };
    slot.ondragover=e=>{
      e.preventDefault();
      slot.classList.add("drag-over");
    };
    slot.ondragleave=()=>slot.classList.remove("drag-over");
    slot.ondrop=e=>{
      e.preventDefault();
      slot.classList.remove("drag-over");
      replaceStarterInSlot(Number(slot.dataset.slot), e.dataTransfer.getData("text/plain"));
    };
  });
  const cap = $("#captainSelect"); if(cap) cap.onchange=()=>setCaptain(cap.value);
  const penSel = $("#penTakerSelect"); if(penSel) penSel.onchange=()=>{ plannerState.penaltyTaker=penSel.value; };
  const fkSel = $("#fkTakerSelect"); if(fkSel) fkSel.onchange=()=>{ plannerState.freeKickTaker=fkSel.value; };
  const auto = $("#autoLineup"); if(auto) auto.onclick=resetAuto;
  const cancel = $("#cancelPlanner"); if(cancel) cancel.onclick=()=>closeTacticPlanner(true);
  const confirm = $("#confirmPlanner"); if(confirm) confirm.onclick=confirmAndPlay;
}

function confirmAndPlay(){
  const st = plannerState; if(!st) return;
  const tactic = plTactic();
  if(!WC_LINEUPS.validateTactic(st.team, tactic).valid) return;
  const record = activeRecord();
  const journeyIndex = st.journeyIndex;
  setDefaultTactic(record, tactic);
  setMatchTactic(record, journeyIndex, tactic);                 // grava + invalida cache
  const fresh = getTeamMatches(currentSim(), st.team)[journeyIndex];  // re-simula com a tática
  closeTacticPlanner(false);
  if(fresh) openMatchSimulator(fresh, journeyIndex);
}

export { FIELD_IMAGE_URL, POS_GROUPS, closeTacticPlanner, openTacticPlanner };

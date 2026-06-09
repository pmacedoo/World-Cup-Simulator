"use strict";

/* =================================================================
   EDITOR DE ESCALAÇÃO (MODO TÉCNICO)
   -----------------------------------------------------------------
   Antes de cada jogo da seleção favorita, o usuário monta a tática:
   formação, XI titular, capitão, postura e trocas planejadas. A
   escolha é gravada no registro (setMatchTactic) e o motor recomputa
   a partida com ela — XI/trocas exibidos e placar passam a refletir
   exatamente o que o técnico decidiu.
   ================================================================= */

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

let plannerState = null;

function openTacticPlanner(match, journeyIndex=0){
  const record = activeRecord();
  const team = getFavoriteTeam();
  // só edita a PRÓXIMA partida ainda não jogada; replays/jogos passados vão direto
  if(!record || !team || !TEAMS[team] || journeyIndex !== record.revealed){
    openMatchSimulator(match, journeyIndex);
    return;
  }
  let base = record.tactics && record.tactics[journeyIndex];
  if(!base || !WC_LINEUPS.validateTactic(team, base).valid) base = lastUsedTactic(record, journeyIndex, team);

  plannerState = {
    match, journeyIndex, team,
    formation: base.formation,
    starters: base.starters.slice(),
    captain: base.captain,
    mentality: base.mentality || "balanced",
    subs: [],
    fieldPositions: base.positions || {},
    listPositionIndex: 0,
    error: "",
  };
  orderStarters();

  let modal = $("#tacticPlanner");
  if(!modal){
    modal = el("div","fixed inset-0 z-[80] hidden items-center justify-center p-3 sm:p-5");
    modal.id = "tacticPlanner";
    modal.innerHTML = `<div class="absolute inset-0 bg-ink/55 backdrop-blur-xl" data-close></div>
      <div id="tacticPlannerBox" class="relative guided-card rounded-[2rem] shadow-lift w-full max-w-5xl max-h-[94vh] overflow-y-auto p-4 sm:p-6 swap"></div>`;
    document.body.appendChild(modal);
    modal.addEventListener("click", e=>{ if(e.target.dataset.close!==undefined) closeTacticPlanner(true); });
  }
  modal.classList.remove("hidden"); modal.classList.add("flex");
  renderPlanner();
}

// puxa a ÚLTIMA escalação usada (jogo anterior) como ponto de partida — herda
// formação/XI/capitão/postura, mas zera as trocas (são por jogo). Sem histórico,
// cai na escalação automática.
function lastUsedTactic(record, journeyIndex, team){
  const tx = record.tactics || {};
  for(let i=journeyIndex-1; i>=0; i--){
    const t = tx[i];
    if(t && WC_LINEUPS.validateTactic(team, t).valid){
      return { formation:t.formation, starters:t.starters.slice(), captain:t.captain, mentality:t.mentality, liveScript:[] };
    }
  }
  return WC_LINEUPS.autoTactic(team);
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
function plPosCount(pos){ return plannerState.starters.filter(n=>plPos(n)===pos).length; }
function plBench(){
  const set = new Set(plannerState.starters);
  return plSquad().map(p=>p[0]).filter(n=>!set.has(n)).sort((a,b)=>plRank(b)-plRank(a));
}
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
function slotAssignments(){
  const pools={GK:[],DF:[],MF:[],FW:[]};
  plannerState.starters.forEach(name=>{ const pos=plPos(name); if(pools[pos]) pools[pos].push(name); });
  const used={GK:0,DF:0,MF:0,FW:0};
  return formationFieldSlots().map(slot=>{
    const name=pools[slot.pos][used[slot.pos]++] || "";
    return {...slot, name};
  });
}
function replaceStarterInSlot(slotIndex, name){
  const st=plannerState;
  const slot=formationFieldSlots()[slotIndex];
  if(!slot || !name) return;
  if(plPos(name)!==slot.pos){
    st.error=`${name} é ${plPos(name)}. Solte em uma zona ${slot.pos}.`;
    renderPlanner();
    return;
  }
  const assigned=slotAssignments();
  const current=assigned[slotIndex]?.name;
  const currentIdx=current ? st.starters.indexOf(current) : -1;
  const incomingIdx=st.starters.indexOf(name);
  if(incomingIdx>=0 && currentIdx>=0){
    st.starters[currentIdx]=name;
    st.starters[incomingIdx]=current;
  } else if(currentIdx>=0) {
    st.starters[currentIdx]=name;
  } else if(incomingIdx<0) {
    const cap=plSlots()[slot.pos] || 0;
    const samePos=st.starters.filter(n=>plPos(n)===slot.pos);
    if(samePos.length>=cap){
      const weakest=samePos.slice().sort((a,b)=>plRank(a)-plRank(b))[0];
      if(weakest) st.starters.splice(st.starters.indexOf(weakest),1,name);
    } else {
      st.starters.push(name);
    }
  }
  st.error="";
  if(!st.starters.includes(st.captain)) st.captain = WC_LINEUPS.pickCaptain(st.team, st.starters) || st.starters[0];
  st.fieldPositions = Object.fromEntries(slotAssignments().filter(s=>s.name).map(s=>[s.name,{slot:s.id,pos:s.pos,x:s.x,y:s.y}]));
  sanitizeSubs();
  renderPlanner();
}
const POS_ORDER = { GK:0, DF:1, MF:2, FW:3 };
function orderStarters(){
  plannerState.starters.sort((a,b)=> (POS_ORDER[plPos(a)]??9)-(POS_ORDER[plPos(b)]??9) || plRank(b)-plRank(a));
}
function plTactic(){
  const st = plannerState;
  const startSet = new Set(st.starters);
  const positions = Object.fromEntries(slotAssignments().filter(s=>s.name).map(s=>[s.name,{slot:s.id,pos:s.pos,x:s.x,y:s.y}]));
  const liveScript = st.subs
    .filter(s=>s.out && s.in && startSet.has(s.out) && !startSet.has(s.in))
    .map(s=>({ minute:Math.max(1,Math.min(120, s.minute|0)), type:"sub", out:s.out, in:s.in }))
    .sort((a,b)=>a.minute-b.minute);
  return { formation:st.formation, starters:st.starters.slice(), captain:st.captain, mentality:st.mentality, positions, liveScript };
}
function sanitizeSubs(){
  const startSet = new Set(plannerState.starters);
  plannerState.subs = plannerState.subs.filter(s=>
    (!s.out || startSet.has(s.out)) && (!s.in || !startSet.has(s.in)));
}

/* ---------- mutações ---------- */
function setFormation(f){
  const st = plannerState;
  if(st.formation===f) return;
  st.formation = f;
  st.starters = WC_LINEUPS.bestElevenNames(st.team, f);  // XI válido p/ a nova forma
  orderStarters();
  if(!st.starters.includes(st.captain)) st.captain = WC_LINEUPS.pickCaptain(st.team, st.starters);
  sanitizeSubs();
  renderPlanner();
}
function toggleStarter(name){
  const st = plannerState;
  const pos = plPos(name);
  const i = st.starters.indexOf(name);
  if(i>=0){
    st.starters.splice(i,1);
  } else {
    const cap = plSlots()[pos] || 0;
    const samePos = st.starters.filter(n=>plPos(n)===pos);
    if(samePos.length>=cap){
      const weakest = samePos.slice().sort((a,b)=>plRank(a)-plRank(b))[0]; // tira o mais fraco da posição
      if(weakest) st.starters.splice(st.starters.indexOf(weakest),1);
    }
    st.starters.push(name);
  }
  orderStarters();
  if(!st.starters.includes(st.captain)) st.captain = WC_LINEUPS.pickCaptain(st.team, st.starters) || st.starters[0];
  sanitizeSubs();
  renderPlanner();
}
function setCaptain(name){ if(plannerState.starters.includes(name)){ plannerState.captain=name; renderPlanner(); } }
function setMentality(m){ plannerState.mentality=m; renderPlanner(); }
function addSub(){ if(plannerState.subs.length<5){ plannerState.subs.push({minute:70, out:"", in:""}); renderPlanner(); } }
function removeSub(i){ plannerState.subs.splice(i,1); renderPlanner(); }
function updateSub(i, field, value){
  const s = plannerState.subs[i]; if(!s) return;
  s[field] = field==="minute" ? (value|0) : value;   // minuto não re-renderiza (mantém foco)
}
function resetAuto(){
  const st = plannerState;
  const auto = WC_LINEUPS.autoTactic(st.team);
  st.formation = auto.formation; st.starters = auto.starters.slice();
  st.captain = auto.captain; st.mentality = "balanced"; st.subs = []; st.fieldPositions = {}; st.error = "";
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
function playerChip(name){
  const st = plannerState;
  const selected = st.starters.includes(name);
  const isCap = st.captain===name && selected;
  const star = plStar(name), tit = plTitular(name);
  const base = selected
    ? "bg-ink text-white border-ink"
    : "bg-white/70 text-slate-700 border-white hover:border-usablue/40";
  return `<button type="button" draggable="true" class="planner-player flex items-center gap-2 rounded-2xl border px-3 py-2 text-left transition ${base}" data-name="${name}">
    <span class="w-9 h-9 rounded-xl grid place-items-center font-extrabold text-[11px] ${selected?'bg-white/15':'bg-slate-100 text-slate-500'}">${plPos(name)}</span>
    <span class="min-w-0 flex-1">
      <span class="block font-bold text-sm truncate flex items-center gap-1">${name} ${star?'<span class="text-gold-400">★</span>':''}</span>
      <span class="block text-[10px] uppercase tracking-wider font-extrabold ${selected?'text-white/60':'text-slate-400'}">${tit?'Titular base':'Reserva'}</span>
    </span>
    ${isCap?'<span class="flex-none w-6 h-6 rounded-full bg-gold-400 text-ink grid place-items-center font-extrabold text-[11px]">C</span>':''}
    ${selected?'<span class="flex-none text-mxgreen">'+ic('check','w-4 h-4')+'</span>':''}
  </button>`;
}
function renderLineupField(){
  const assigned=slotAssignments();
  return `<div class="lineup-field-wrap">
    <img class="lineup-field-img" src="public/assets/images/soccerfieldremaster.png" alt="Campo de futebol">
    <div class="lineup-field-overlay">
      ${assigned.map((slot,i)=>`
        <div class="lineup-drop-slot ${slot.name?'filled':''}" data-slot="${i}" data-pos="${slot.pos}" style="left:${slot.x}%;top:${slot.y}%">
          ${slot.name ? `<div class="lineup-field-player" draggable="true" data-name="${slot.name}">
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
    <div class="grid sm:grid-cols-2 gap-2">${players.map(playerChip).join("")}</div>
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
function subRow(s, i){
  const startersOpts = [`<option value="">— sai —</option>`, ...plannerState.starters.map(n=>`<option value="${n}" ${n===s.out?'selected':''}>${n}</option>`)].join("");
  const benchOpts = [`<option value="">— entra —</option>`, ...plBench().map(n=>`<option value="${n}" ${n===s.in?'selected':''}>${n}</option>`)].join("");
  return `<div class="flex flex-wrap items-center gap-2 rounded-2xl bg-white/60 border border-white/70 p-2">
    <input type="number" min="1" max="120" value="${s.minute|0}" class="sub-min w-16 rounded-xl border border-slate-200 px-2 py-1.5 text-sm font-bold text-center" data-i="${i}" title="Minuto">
    <span class="text-[10px] uppercase font-extrabold text-slate-400">min</span>
    <select class="sub-out flex-1 min-w-[120px] rounded-xl border border-slate-200 px-2 py-1.5 text-sm" data-i="${i}">${startersOpts}</select>
    <span class="text-slate-400">${ic('arrow-right','w-4 h-4')}</span>
    <select class="sub-in flex-1 min-w-[120px] rounded-xl border border-slate-200 px-2 py-1.5 text-sm" data-i="${i}">${benchOpts}</select>
    <button class="sub-del flex-none w-8 h-8 grid place-items-center rounded-full text-slate-300 hover:text-usared" data-i="${i}" title="Remover">${ic('x','w-4 h-4')}</button>
  </div>`;
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
    <button class="absolute top-4 right-4 text-slate-400 hover:text-ink" data-close>✕</button>
    <div class="pr-8">
      <div class="text-[11px] uppercase tracking-widest font-extrabold text-usablue">${m.matchNo?`M${m.matchNo} · `:''}${m.stage} · você comanda</div>
      <div class="mt-1 font-display font-extrabold text-2xl sm:text-3xl flex flex-wrap items-center gap-2">
        ${flag(st.team,'flag-lg')} ${st.team}
        <span class="text-slate-300 text-lg">vs</span>
        ${flag(opp,'flag-lg')} <span class="text-slate-500">${opp}</span>
      </div>
      <p class="mt-1 text-sm text-slate-500 font-semibold">Técnico ${coach} · monte a escalação que vai a campo. Suas escolhas mudam o resultado.</p>
    </div>

    <div class="mt-5 grid lg:grid-cols-[.92fr_1.08fr] gap-5 items-start">
      <div class="space-y-4">
        <div class="guided-card rounded-3xl p-4">
          <div class="text-[11px] uppercase tracking-widest font-extrabold text-slate-400 mb-2">Formação</div>
          <div class="flex flex-wrap gap-2">
            ${WC_LINEUPS.FORMATIONS.map(f=>`<button class="formation-btn rounded-xl px-3 py-1.5 text-sm font-extrabold border ${f===st.formation?'bg-ink text-white border-ink':'glass text-slate-600 border-white/70'}" data-f="${f}">${f}</button>`).join("")}
          </div>
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

        <div class="guided-card rounded-3xl p-4">
          <div class="text-[11px] uppercase tracking-widest font-extrabold text-slate-400 mb-2">Força vs escalação padrão</div>
          <div class="flex gap-2">
            ${deltaPill("Ataque", rating.attackDelta)}
            ${deltaPill("Defesa", rating.defenseDelta)}
          </div>
          <p class="mt-2 text-[11px] text-slate-400 font-semibold leading-snug">Em equivalente de força. O padrão do seu time é 0/0; mudanças de XI, formação e postura movem a agulha.</p>
        </div>
      </div>

      <div class="space-y-4">
        <div class="guided-card rounded-3xl p-4">
          <div class="flex items-center justify-between mb-3">
            <div class="font-display font-extrabold text-lg">Escalação titular</div>
            <button id="autoLineup" class="text-xs font-extrabold text-usablue hover:underline flex items-center gap-1">${ic('wand-2','w-3.5 h-3.5')} Automática</button>
          </div>
          ${st.error?`<div class="mb-3 rounded-2xl bg-usared/10 border border-usared/20 px-3 py-2 text-sm font-bold text-usared">${st.error}</div>`:""}
          ${renderLineupField()}
          <div class="mt-4">
            ${positionCarousel()}
          </div>
        </div>

        <div class="guided-card rounded-3xl p-4">
          <div class="flex items-center justify-between mb-2">
            <div>
              <div class="font-display font-extrabold text-lg">Trocas planejadas</div>
              <div class="text-[11px] text-slate-400 font-semibold">Opcional — entram no minuto marcado e afetam o jogo.</div>
            </div>
            <button id="addSub" class="glass rounded-xl px-3 py-1.5 text-xs font-extrabold text-slate-600 flex items-center gap-1 ${st.subs.length>=5?'opacity-40 pointer-events-none':''}">${ic('plus','w-3.5 h-3.5')} Troca</button>
          </div>
          <div class="space-y-2">
            ${st.subs.length ? st.subs.map(subRow).join("") : '<div class="text-sm text-slate-400 font-semibold py-2">Sem trocas planejadas. Sua seleção pode jogar os 90 com o XI inicial.</div>'}
          </div>
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

  $("#addSub")?.closest(".guided-card")?.remove();
  wirePlanner();
  paintIcons();
}

function wirePlanner(){
  document.querySelectorAll("#tacticPlannerBox .formation-btn").forEach(b=> b.onclick=()=>setFormation(b.dataset.f));
  document.querySelectorAll("#tacticPlannerBox .mentality-btn").forEach(b=> b.onclick=()=>setMentality(b.dataset.m));
  document.querySelectorAll("#tacticPlannerBox .planner-player").forEach(b=> b.onclick=()=>toggleStarter(b.dataset.name));
  document.querySelectorAll("#tacticPlannerBox .pos-carousel-btn").forEach(b=> b.onclick=()=>movePositionCarousel(Number(b.dataset.dir||0)));
  document.querySelectorAll("#tacticPlannerBox .pos-carousel-dot").forEach(b=> b.onclick=()=>{ plannerState.listPositionIndex=Number(b.dataset.posDot||0); renderPlanner(); });
  document.querySelectorAll("#tacticPlannerBox [draggable='true'][data-name]").forEach(el=>{
    el.ondragstart=e=>{
      e.dataTransfer.effectAllowed="move";
      e.dataTransfer.setData("text/plain", el.dataset.name);
      plannerState.error="";
    };
  });
  document.querySelectorAll("#tacticPlannerBox .lineup-drop-slot").forEach(slot=>{
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
  const auto = $("#autoLineup"); if(auto) auto.onclick=resetAuto;
  const add = $("#addSub"); if(add) add.onclick=addSub;
  document.querySelectorAll("#tacticPlannerBox .sub-del").forEach(b=> b.onclick=()=>removeSub(Number(b.dataset.i)));
  document.querySelectorAll("#tacticPlannerBox .sub-out").forEach(s=> s.onchange=()=>{ updateSub(Number(s.dataset.i),"out",s.value); renderPlanner(); });
  document.querySelectorAll("#tacticPlannerBox .sub-in").forEach(s=> s.onchange=()=>{ updateSub(Number(s.dataset.i),"in",s.value); renderPlanner(); });
  document.querySelectorAll("#tacticPlannerBox .sub-min").forEach(inp=> inp.oninput=()=>updateSub(Number(inp.dataset.i),"minute",Number(inp.value)));
  const cancel = $("#cancelPlanner"); if(cancel) cancel.onclick=()=>closeTacticPlanner(true);
  const confirm = $("#confirmPlanner"); if(confirm) confirm.onclick=confirmAndPlay;
}

function confirmAndPlay(){
  const st = plannerState; if(!st) return;
  const tactic = plTactic();
  if(!WC_LINEUPS.validateTactic(st.team, tactic).valid) return;
  const record = activeRecord();
  const journeyIndex = st.journeyIndex;
  setMatchTactic(record, journeyIndex, tactic);                 // grava + invalida cache
  const fresh = getTeamMatches(currentSim(), st.team)[journeyIndex];  // re-simula com a tática
  closeTacticPlanner(false);
  if(fresh) openMatchSimulator(fresh, journeyIndex);
}

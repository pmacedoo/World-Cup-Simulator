"use strict";

// Escalacoes e substituicoes ficam isoladas para evoluir depois
// sem misturar regra de elenco com placar/chaveamento.
(function(){
  const { TEAMS } = window.WC_DATA;

  function playerObj(teamName, raw){
    return {
      name: raw[0],
      pos: raw[1],
      ovr: Number(raw[2] || 0),
      tags: raw[3] || "",
      team: teamName,
    };
  }

  function playerScore(p){
    return p.ovr + (p.tags.includes("S") ? 1.5 : 0) + (p.tags.includes("XI") ? 0.5 : 0);
  }

  function formationSlots(shape){
    const nums = String(shape || "4-3-3").match(/\d+/g)?.map(Number) || [4,3,3];
    return {
      GK: 1,
      DF: nums[0] || 4,
      MF: nums.length > 2 ? nums.slice(1,-1).reduce((sum,n)=>sum+n,0) : (nums[1] || 3),
      FW: nums[nums.length - 1] || 3,
    };
  }

  function sortByRoleValue(a,b){
    return playerScore(b) - playerScore(a) || a.name.localeCompare(b.name, "pt-BR");
  }

  function takeBestForPos(pool, pos, amount, selected){
    const picked = [];
    const candidates = pool.filter(p=>p.pos===pos && !selected.has(p.name)).sort(sortByRoleValue);
    while(picked.length < amount && candidates.length){
      const p = candidates.shift();
      selected.add(p.name);
      picked.push(p);
    }
    return picked;
  }

  function buildLineup(teamName){
    const team = TEAMS[teamName];
    if(!team) return null;
    const slots = formationSlots(team.shape);
    const pool = team.sq.map(p=>playerObj(teamName, p));
    const selected = new Set();
    const starters = [];

    ["GK","DF","MF","FW"].forEach(pos=>{
      starters.push(...takeBestForPos(pool, pos, slots[pos], selected));
    });

    const fieldNeeded = 11 - starters.length;
    if(fieldNeeded > 0){
      pool
        .filter(p=>p.pos!=="GK" && !selected.has(p.name))
        .sort(sortByRoleValue)
        .slice(0, fieldNeeded)
        .forEach(p=>{ selected.add(p.name); starters.push(p); });
    }

    const bench = pool.filter(p=>!selected.has(p.name)).sort(sortByRoleValue);
    return {
      team: teamName,
      formation: team.shape || "4-3-3",
      slots,
      starters: starters.slice(0,11),
      bench,
    };
  }

  function seedFromMatch(match, salt=0){
    const text = `${match.matchNo || 0}|${match.home}|${match.away}|${match.stage}|${salt}`;
    let h = 2166136261 >>> 0;
    for(let i=0;i<text.length;i++){
      h ^= text.charCodeAt(i);
      h = Math.imul(h, 16777619) >>> 0;
    }
    return h;
  }

  function rngInt(rng, min, max){
    return min + Math.floor(rng() * (max - min + 1));
  }

  function pickWeighted(rng, list, weightFn){
    const total = list.reduce((sum,item)=>sum+Math.max(0.1, weightFn(item)),0);
    let roll = rng() * total;
    for(const item of list){
      roll -= Math.max(0.1, weightFn(item));
      if(roll <= 0) return item;
    }
    return list[list.length - 1];
  }

  function chooseIncoming(rng, bench, outgoing){
    const same = bench.filter(p=>p.pos===outgoing.pos);
    const compatible = same.length ? same : bench.filter(p=>p.pos!=="GK");
    if(!compatible.length) return null;
    return pickWeighted(rng, compatible, p=>playerScore(p) + 1);
  }

  function normalSubWindows(rng){
    const templates = [
      [58, 72, 83],
      [61, 69, 78],
      [55, 66, 80],
      [63, 75],
    ];
    return templates[rngInt(rng, 0, templates.length - 1)].map(m=>m + rngInt(rng, -2, 3));
  }

  function makeTeamSubstitutions(match, lineup, side, rng){
    if(!lineup) return [];
    const onField = lineup.starters.slice();
    const bench = lineup.bench.slice();
    const subs = [];
    const baseTarget = rng() < 0.18 ? 3 : rng() < 0.72 ? 4 : 5;
    const halftimeSubs = rng() < 0.26 ? 1 : 0;
    const windows = normalSubWindows(rng);
    const plan = [];

    for(let i=0;i<halftimeSubs && plan.length<baseTarget;i++) plan.push({minute:46, window:"intervalo"});
    windows.forEach((minute, idx)=>{
      if(plan.length >= baseTarget) return;
      plan.push({minute, window:idx+1});
      if(plan.length < baseTarget && rng() < 0.35) plan.push({minute, window:idx+1});
    });

    if(match.aet && plan.length < 6){
      plan.push({minute:rngInt(rng, 103, 116), window:"prorrogacao", extraTime:true});
    }

    const trySub = (slot, concussion=false)=>{
      const candidates = onField.filter(p=>p.pos!=="GK");
      if(!candidates.length || !bench.length) return;
      const outgoing = pickWeighted(rng, candidates, p=>Math.max(0.4, 8 - playerScore(p)));
      const incoming = chooseIncoming(rng, bench, outgoing);
      if(!incoming) return;
      onField.splice(onField.findIndex(p=>p.name===outgoing.name), 1, incoming);
      bench.splice(bench.findIndex(p=>p.name===incoming.name), 1);
      subs.push({
        team: lineup.team,
        side,
        minute: slot.minute,
        window: slot.window,
        extraTime: !!slot.extraTime,
        concussion,
        reason: concussion ? "Concussao" : slot.extraTime ? "Substituicao extra da prorrogacao" : "Substituicao",
        out: outgoing,
        in: incoming,
      });
    };

    plan.slice(0, match.aet ? 6 : 5).forEach(slot=>trySub(slot, false));

    const concussionChance = match.aet ? 0.03 : 0.02;
    if(rng() < concussionChance){
      trySub({minute:rngInt(rng, 18, match.aet ? 112 : 86), window:"concussao"}, true);
    }

    return subs;
  }

  // monta a escalação EXIBIDA a partir da tática do usuário (XI + capitão),
  // para a UI mostrar na partida exatamente o que o técnico escolheu.
  function lineupFromTactic(teamName, tactic){
    const team=TEAMS[teamName];
    if(!team || !tactic) return buildLineup(teamName);
    const shape=tactic.formation || team.shape || "4-3-3";
    const byName=Object.fromEntries(team.sq.map(p=>[p[0],p]));
    const names=(tactic.starters||[]).filter(n=>byName[n]);
    const posOrder={GK:0,DF:1,MF:2,FW:3};
    const starters=names.map(n=>playerObj(teamName, byName[n]))
      .sort((a,b)=>(posOrder[a.pos]??9)-(posOrder[b.pos]??9));
    if(starters.length<11){
      const have=new Set(starters.map(p=>p.name));
      team.sq.filter(p=>!have.has(p[0]) && p[1]!=="GK").map(p=>playerObj(teamName,p)).sort(sortByRoleValue)
        .slice(0, 11-starters.length).forEach(p=>{ starters.push(p); have.add(p.name); });
    }
    const startSet=new Set(starters.map(p=>p.name));
    const bench=team.sq.filter(p=>!startSet.has(p[0])).map(p=>playerObj(teamName,p)).sort(sortByRoleValue);
    return { team:teamName, formation:shape, slots:formationSlots(shape),
      starters:starters.slice(0,11), bench, captain:tactic.captain };
  }

  // converte o roteiro ao vivo (trocas planejadas pelo técnico) no formato de
  // substituição que a UI já anima. Mudanças de postura não são trocas: ficam
  // só no rating (ratingTimeline), não nesta lista.
  function subsFromScript(lineup, side, tactic){
    if(!lineup || !tactic) return [];
    const team=lineup.team;
    const byName=Object.fromEntries((TEAMS[team]?.sq||[]).map(p=>[p[0],p]));
    const P=n=> byName[n] ? playerObj(team, byName[n]) : null;
    return (tactic.liveScript||[])
      .filter(ev=>ev.type==="sub" && byName[ev.out] && byName[ev.in])
      .map(ev=>{ const min=Math.max(1, Math.min(120, ev.minute|0)); return {
        team, side, minute:min, window:"tecnico", extraTime:min>90, concussion:false,
        reason:"Substituição do técnico", out:P(ev.out), in:P(ev.in),
      };})
      .sort((a,b)=>a.minute-b.minute);
  }

  function attachMatchPersonnel(match){
    const favSide = match.favoriteSide;            // "home" | "away" | undefined
    const tac = match.favoriteTactic || null;      // tática do usuário p/ a favorita
    const home = (favSide==="home" && tac) ? lineupFromTactic(match.home, tac) : buildLineup(match.home);
    const away = (favSide==="away" && tac) ? lineupFromTactic(match.away, tac) : buildLineup(match.away);
    const rng = mulberry32(seedFromMatch(match, 91));
    const homeSubs = (favSide==="home" && tac) ? subsFromScript(home, "home", tac) : makeTeamSubstitutions(match, home, "home", rng);
    const awaySubs = (favSide==="away" && tac) ? subsFromScript(away, "away", tac) : makeTeamSubstitutions(match, away, "away", rng);
    const substitutions = [...homeSubs, ...awaySubs]
      .sort((a,b)=>a.minute-b.minute || a.team.localeCompare(b.team, "pt-BR"));

    match.lineups = {home, away};
    match.substitutions = substitutions;
    match.substitutionRules = {
      normalLimit: 5,
      normalWindows: 3,
      halftimeCountsAsWindow: false,
      extraTimeLimit: match.aet ? 6 : 5,
      concussionExtra: true,
    };
    return match;
  }

  /* =================================================================
     MODO TÉCNICO — formações, rating de escalação e táticas
     -----------------------------------------------------------------
     Aqui a escalação deixa de ser cosmética: vira insumo do motor.
     `lineupRating` traduz a escolha do técnico (formação + XI + capitão
     + postura) em deltas de ataque/defesa (ovr-equivalente), com peso
     MODERADO (clamp em ±3.4). `ratingTimeline` dobra o roteiro ao vivo
     (subs/postura) em segmentos. `matchLocalSeed` dá um seed estável e
     determinístico por (simulação, jogo, tática) para o RNG isolado.
     ================================================================= */
  const FORMATIONS = ["4-3-3","4-4-2","4-2-3-1","3-5-2","5-3-2","3-4-3","4-2-4"];

  function squad(teamName){ return (TEAMS[teamName]?.sq || []).map(p=>playerObj(teamName,p)); }

  // melhor XI para uma formação específica (melhor por posição via playerScore)
  function bestElevenNames(teamName, shape){
    const team=TEAMS[teamName]; if(!team) return [];
    const slots=formationSlots(shape);
    const pool=squad(teamName); const selected=new Set(); const out=[];
    ["GK","DF","MF","FW"].forEach(pos=>{
      takeBestForPos(pool, pos, slots[pos], selected).forEach(p=>out.push(p.name));
    });
    if(out.length<11){
      pool.filter(p=>p.pos!=="GK" && !selected.has(p.name)).sort(sortByRoleValue)
        .slice(0, 11-out.length).forEach(p=>{ selected.add(p.name); out.push(p.name); });
    }
    return out.slice(0,11);
  }

  // capitão padrão: craque presente > titular base (xi) > maior peso
  function pickCaptain(teamName, starters){
    const team=TEAMS[teamName]; if(!team) return starters[0];
    const set=new Set(starters);
    const stars=team.sq.filter(p=>set.has(p[0]) && (p[3]||"").includes("S")).sort((a,b)=>b[2]-a[2]);
    if(stars.length) return stars[0][0];
    const xi=(team.xi||[]).find(n=>set.has(n));
    if(xi) return xi;
    return team.sq.filter(p=>set.has(p[0])).sort((a,b)=>b[2]-a[2])[0]?.[0] || starters[0];
  }

  // formação derivada da composição real de um XI (ex.: 4 DF, 3 MF, 3 FW -> "4-3-3").
  // Usada p/ alinhar a formação ao XI titular informado, evitando incoerência
  // quando team.shape não bate com team.xi (XI ficaria "inválido" pelos slots).
  function shapeFromStarters(teamName, starters){
    const team=TEAMS[teamName]; if(!team) return "4-3-3";
    const byName=Object.fromEntries(team.sq.map(p=>[p[0],p]));
    const c={DF:0,MF:0,FW:0};
    starters.forEach(n=>{ const pos=byName[n]?.[1]; if(c[pos]!=null) c[pos]++; });
    return `${c.DF||4}-${c.MF||3}-${c.FW||3}`;
  }

  // tática automática (baseline neutra): XI canônico do time + postura equilibrada.
  // A formação é alinhada ao XI real para que o padrão seja válido E neutro
  // (lineupRating do auto = 0/0 por ser relativo a si mesmo).
  function autoTactic(teamName){
    const team=TEAMS[teamName];
    const xi=(team?.xi||[]);
    const useXi = xi.length===11;
    const shape = useXi ? shapeFromStarters(teamName, xi) : (team?.shape || "4-3-3");
    const starters = useXi ? xi.slice() : bestElevenNames(teamName, shape);
    return { formation:shape, starters, captain:pickCaptain(teamName, starters), mentality:"balanced", liveScript:[] };
  }

  // ranking de um jogador (mesma métrica do motor) — p/ a UI ordenar/escolher
  function playerRank(teamName, name){
    const raw=(TEAMS[teamName]?.sq||[]).find(p=>p[0]===name);
    return raw ? playerScore(playerObj(teamName, raw)) : 0;
  }

  // soma de qualidade dos titulares (proxy de força do XI)
  function elevenQuality(teamName, starters){
    const team=TEAMS[teamName]; if(!team) return 0;
    const byName=Object.fromEntries(team.sq.map(p=>[p[0],p]));
    let sum=0;
    (starters||[]).forEach(n=>{ const p=byName[n]; if(p) sum+=playerScore(playerObj(teamName, p)); });
    return sum;
  }

  // rating ABSOLUTO de uma escalação (forma + qualidade do XI + postura + capitão),
  // antes de referenciar contra a tática padrão.
  function rawRating(teamName, tactic){
    const team=TEAMS[teamName];
    const shape=tactic.formation || team.shape || "4-3-3";
    const starters=(tactic.starters && tactic.starters.length===11) ? tactic.starters : bestElevenNames(teamName, shape);
    // 1) déficit de qualidade vs melhor XI possível NA MESMA formação.
    // Sem teto interno: o clamp final (±3.4) em lineupRating é quem limita.
    // Como o rating é relativo à autoTactic, na prática o termo de qualidade
    // vira (qualidadeXI − qualidadeAuto)·0.42 — proporcional ao quanto o
    // técnico enfraqueceu/reforçou o XI, sem saturar perto do padrão.
    const optimal=elevenQuality(teamName, bestElevenNames(teamName, shape));
    const chosen=elevenQuality(teamName, starters);
    const qualityPenalty=Math.max(0, optimal-chosen)*0.42;
    // 2) efeito da forma (relativo a 4-3-3: DF4/MF3/FW3)
    const slots=formationSlots(shape);
    const attackShape=(slots.FW-3)*0.8 + (slots.MF-3)*0.2;
    const defenseShape=(slots.DF-4)*0.8 - (slots.FW-3)*0.5;
    // 3) postura
    const m=tactic.mentality || "balanced";
    const attM=m==="attack"?1.3:m==="defend"?-1.3:0;
    const defM=m==="attack"?-1.1:m==="defend"?1.3:0;
    // 4) capitão (liderança)
    const cap=tactic.captain;
    const capBonus=(cap && ((team.sq.find(p=>p[0]===cap)?.[3]||"").includes("S") || (team.xi||[]).includes(cap))) ? 0.3 : 0;
    return {
      attack: attackShape + attM - qualityPenalty + capBonus,
      defense: defenseShape + defM - qualityPenalty + capBonus,
    };
  }

  // rating de uma escalação -> { attackDelta, defenseDelta } em ovr-equivalente,
  // medido SEMPRE relativo à tática padrão da própria seleção. Por construção a
  // autoTactic do time vale 0/0 (neutro, idêntico ao mundo de hoje): ativar o
  // modo técnico não muda a força base da favorita — só os desvios do técnico
  // (XI mais fraco, outra formação, postura, trocar o capitão) movem a agulha.
  function lineupRating(teamName, tactic){
    const team=TEAMS[teamName];
    if(!team || !tactic) return {attackDelta:0, defenseDelta:0};
    const cur=rawRating(teamName, tactic);
    const ref=rawRating(teamName, autoTactic(teamName));
    return {
      attackDelta: clamp(cur.attack - ref.attack, -3.4, 3.4),
      defenseDelta: clamp(cur.defense - ref.defense, -3.4, 3.4),
    };
  }

  // linha do tempo de rating: 1 segmento no pré-jogo + 1 ponto por evento ao vivo
  function ratingTimeline(teamName, tactic){
    const base=lineupRating(teamName, tactic);
    const tl=[{from:0, att:base.attackDelta, def:base.defenseDelta}];
    const script=(tactic.liveScript||[]).slice().sort((a,b)=>(a.minute|0)-(b.minute|0));
    const cur={ formation:tactic.formation, starters:(tactic.starters||[]).slice(), captain:tactic.captain, mentality:tactic.mentality };
    script.forEach(ev=>{
      if(ev.type==="mentality") cur.mentality=ev.value;
      else if(ev.type==="sub"){ const i=cur.starters.indexOf(ev.out); if(i>=0) cur.starters[i]=ev.in; }
      const r=lineupRating(teamName, cur);
      tl.push({from:Math.max(0, Math.min(120, ev.minute|0)), att:r.attackDelta, def:r.defenseDelta});
    });
    return tl;
  }

  // hash estável da tática (toda escolha entra, inclusive o roteiro ao vivo)
  function tacticHash(tactic){
    const t=tactic||{};
    const text=[t.formation, (t.starters||[]).join(","), t.captain, t.mentality,
      (t.liveScript||[]).map(e=>`${e.minute|0}${e.type}${e.out||""}${e.in||""}${e.value||""}`).join(";")].join("|");
    let h=2166136261>>>0;
    for(let i=0;i<text.length;i++){ h^=text.charCodeAt(i); h=Math.imul(h,16777619)>>>0; }
    return h>>>0;
  }

  // seed local determinístico p/ o RNG isolado do jogo da favorita.
  // Usa o seed PEDIDO da simulação (não o resolvido) p/ não cascatear no resample.
  function matchLocalSeed(simSeed, idx, tactic){
    return (((simSeed>>>0) ^ Math.imul((idx|0)+1, 2654435761) ^ tacticHash(tactic)) >>> 0);
  }

  // hash só do SETUP de kickoff (formação + XI + capitão + postura), SEM o liveScript.
  function setupHash(tactic){
    const t=tactic||{};
    const text=[t.formation, (t.starters||[]).join(","), t.captain, t.mentality].join("|");
    let h=2166136261>>>0;
    for(let i=0;i<text.length;i++){ h^=text.charCodeAt(i); h=Math.imul(h,16777619)>>>0; }
    return h>>>0;
  }
  // seed do jogo gerenciado baseado NO SETUP (não no roteiro ao vivo). Assim uma
  // troca no minuto M só muda o jogo de M em diante — os minutos anteriores ficam
  // idênticos (prefixo estável), viabilizando substituição ao vivo consistente.
  function matchSetupSeed(simSeed, idx, tactic){
    return (((simSeed>>>0) ^ Math.imul((idx|0)+1, 2654435761) ^ setupHash(tactic)) >>> 0);
  }

  // valida/saneia um XI (backstop; a UI já guia pelos slots da formação)
  function validateTactic(teamName, tactic){
    const team=TEAMS[teamName];
    const names=new Set((team?.sq||[]).map(p=>p[0]));
    const byName=Object.fromEntries((team?.sq||[]).map(p=>[p[0],p]));
    const slots=formationSlots(tactic?.formation);
    let starters=[...new Set((tactic?.starters||[]).filter(n=>names.has(n)))];
    const count=pos=>starters.filter(n=>byName[n]?.[1]===pos).length;
    const valid = starters.length===11 && count("GK")===1 &&
      count("DF")===slots.DF && count("MF")===slots.MF && count("FW")===slots.FW;
    return {valid, starters, slots};
  }

  window.WC_LINEUPS = {
    buildLineup,
    attachMatchPersonnel,
    // modo técnico
    FORMATIONS,
    formationSlots,
    squad,
    bestElevenNames,
    pickCaptain,
    autoTactic,
    lineupRating,
    ratingTimeline,
    tacticHash,
    matchLocalSeed,
    matchSetupSeed,
    validateTactic,
    lineupFromTactic,
    subsFromScript,
    playerRank,
  };
})();

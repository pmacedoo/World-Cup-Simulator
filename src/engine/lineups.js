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
    // Jogadores que saíram não podem voltar ao campo
    const substitutedOut = new Set();
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
      // Garante que quem já saiu não pode voltar como substituto
      const eligible = bench.filter(p=>!substitutedOut.has(p.name));
      const incoming = chooseIncoming(rng, eligible, outgoing);
      if(!incoming) return;
      onField.splice(onField.findIndex(p=>p.name===outgoing.name), 1, incoming);
      bench.splice(bench.findIndex(p=>p.name===incoming.name), 1);
      substitutedOut.add(outgoing.name);
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

  function attachMatchPersonnel(match){
    const home = buildLineup(match.home);
    const away = buildLineup(match.away);
    const rng = mulberry32(seedFromMatch(match, 91));
    const substitutions = [
      ...makeTeamSubstitutions(match, home, "home", rng),
      ...makeTeamSubstitutions(match, away, "away", rng),
    ].sort((a,b)=>a.minute-b.minute || a.team.localeCompare(b.team, "pt-BR"));

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

  window.WC_LINEUPS = {
    buildLineup,
    attachMatchPersonnel,
  };
})();

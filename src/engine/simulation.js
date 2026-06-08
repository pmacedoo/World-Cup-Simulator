"use strict";
// Motor de simulação do Simulador Copa do Mundo FIFA 2026.
// Carregado após worldcup-data.js (que define window.WC_DATA).

const { TEAMS, GROUPS, THIRD_PLACE_MAP } = window.WC_DATA;

/* =================================================================
   MOTOR DE SIMULAÇÃO
   ================================================================= */

function teamObj(name){ const t = TEAMS[name]; return {name, ...t}; }

// escolhe artilheiro ponderado pelo peso de gol do elenco
function pickScorer(team){
  const cands = team.sq.filter(p=>p[2] > 0);
  const total = cands.reduce((s,p)=>s+p[2],0);
  let r = RND()*total;
  for(const p of cands){ r -= p[2]; if(r<=0) return p; }
  return cands[cands.length-1];
}
function pickAssister(team, scorerName){
  const cands = team.sq.filter(p=>p[1]!=="GK" && p[0]!==scorerName);
  if(!cands.length) return null;
  const total = cands.reduce((s,p)=>s+p[2]+0.5,0);
  let r = RND()*total;
  for(const p of cands){ r -= (p[2]+0.5); if(r<=0) return p[0]; }
  return cands[0][0];
}

// gera lista de gols (autor, minuto, time, tipo) para um time
function makeGoals(team, n, extra=false){
  const goals = [];
  for(let i=0;i<n;i++){
    const minute = extra ? (91 + rint(30)) : (1 + rint(90));
    const stop = (!extra && minute>=90) ? "" : "";
    const scorer = pickScorer(team);
    const type = pick(GOAL_TYPES);
    const assist = (type==="de pênalti"||type==="cobrança de falta") ? null
                  : (RND()<0.62 ? pickAssister(team, scorer[0]) : null);
    goals.push({minute, player:scorer[0], team:team.name, type, assist});
  }
  return goals;
}

// ---- Disputa de pênaltis detalhada (cobrança a cobrança) ----
const PEN_ZONES = ["top-left","top-center","top-right","bottom-left","bottom-center","bottom-right"];
const PEN_MISS  = ["Defendido","Para fora","Na trave"];
// cobradores: jogadores de linha ordenados por peso de finalização
function penTakers(team){
  const out = team.sq.filter(p=>p[1]!=="GK").slice().sort((a,b)=> b[2]-a[2]).map(p=>p[0]);
  return out.length ? out : ["Cobrador 1","Cobrador 2","Cobrador 3","Cobrador 4","Cobrador 5"];
}
// gera uma disputa plausível que termina com o vencedor desejado.
// Usa PRNG LOCAL (seed estável) para NÃO consumir o RNG global do torneio.
function buildShootout(homeName, awayName, winnerHome, seed){
  const A = teamObj(homeName), B = teamObj(awayName);
  const takersA = penTakers(A), takersB = penTakers(B);
  const pConv = ovr => clamp(0.74 + (ovr-78)/260, 0.55, 0.9);
  for(let attempt=0; attempt<200; attempt++){
    const rng = mulberry32(((seed>>>0) + attempt*0x9E3779B1) >>> 0);
    let hs=0, as=0, hk=0, ak=0, ord=0, decided=false;
    const kicks=[];
    const kick = (home)=>{
      const team    = home ? homeName : awayName;
      const takers  = home ? takersA : takersB;
      const idx     = home ? hk : ak;
      const player  = takers[idx % takers.length];
      const ovr     = home ? A.ovr : B.ovr;
      const bias    = (home===winnerHome) ? 0.08 : -0.05;
      const scored  = rng() < (pConv(ovr) + bias);
      if(home) hk++; else ak++;
      if(scored){ if(home) hs++; else as++; }
      kicks.push({ order:++ord, team, player, scored,
        shotZone: PEN_ZONES[Math.floor(rng()*PEN_ZONES.length)],
        result: scored ? "Gol" : PEN_MISS[Math.floor(rng()*PEN_MISS.length)] });
    };
    const settled = ()=> (hs > as + (5-ak)) || (as > hs + (5-hk));
    for(let r=0; r<5 && !decided; r++){
      kick(true);  if(settled()){ decided=true; break; }
      kick(false); if(settled()){ decided=true; break; }
    }
    if(!decided){ // morte súbita
      let guard=0;
      while(hs===as && guard++<20){ kick(true); kick(false); }
    }
    if((hs>as) === winnerHome && hs!==as){
      kicks[kicks.length-1].decisive = true;
      return { homeScore:hs, awayScore:as, winner: winnerHome?homeName:awayName, kicks };
    }
  }
  // fallback determinístico (praticamente nunca usado)
  const hs = winnerHome?4:3, as = winnerHome?3:4;
  return { homeScore:hs, awayScore:as, winner: winnerHome?homeName:awayName,
    kicks:[{order:1,team:winnerHome?homeName:awayName,player:penTakers(winnerHome?A:B)[0],scored:true,shotZone:"top-right",result:"Gol",decisive:true}] };
}

// simula uma partida (chaos controla a variância/zebras)
function playMatch(homeName, awayName, stage, chaos, knockout=false, vIndex=0){
  const A = teamObj(homeName), B = teamObj(awayName);
  const base = 1.35;
  const diff = (A.ovr - B.ovr);
  // gols esperados modulados por força + ruído (chaos)
  const noiseA = Math.exp((RND()-0.5)*2*chaos);
  const noiseB = Math.exp((RND()-0.5)*2*chaos);
  let xgA = clamp(base * Math.exp(diff/14) * noiseA, 0.18, 4.2);
  let xgB = clamp(base * Math.exp(-diff/14) * noiseB, 0.18, 4.2);
  // gols do tempo regulamentar
  let gaReg = Math.min(6, poisson(xgA));
  let gbReg = Math.min(6, poisson(xgB));
  let gaExt = 0, gbExt = 0, aet = false, pens = null, penalties = null;

  if(knockout && gaReg===gbReg){
    // prorrogação (gols com minuto 91–120)
    aet = true;
    gaExt = Math.min(2, poisson(clamp(xgA*0.32, 0.05, 1.2)));
    gbExt = Math.min(2, poisson(clamp(xgB*0.32, 0.05, 1.2)));
    if(gaReg+gaExt === gbReg+gbExt){
      // o vencedor dos pênaltis é decidido pelo RNG global (1 sorteio, ponderado
      // pela força); os detalhes cobrança-a-cobrança vêm de um PRNG local.
      const winnerHome = RND() < (0.5 + (A.ovr - B.ovr)/120);
      const seed = ((vIndex*2654435761) ^ ((A.ovr*73856093)>>>0) ^ ((B.ovr*19349663)>>>0)) >>> 0;
      penalties = buildShootout(homeName, awayName, winnerHome, seed);
      pens = [penalties.homeScore, penalties.awayScore];
    }
  }

  const ga = gaReg + gaExt, gb = gbReg + gbExt;
  // minutos coerentes: gols normais em 1–90, gols de prorrogação em 91–120
  const finalGoals = [
    ...makeGoals(A, gaReg, false), ...makeGoals(A, gaExt, true),
    ...makeGoals(B, gbReg, false), ...makeGoals(B, gbExt, true),
  ].sort((x,y)=> x.minute - y.minute);

  const v = VENUES[vIndex % VENUES.length];
  return {
    stage, home:homeName, away:awayName, ga, gb, aet, pens, penalties,
    score:`${ga}-${gb}`,
    venue:v[0], city:v[1],
    goals: finalGoals,
    ovrA:A.ovr, ovrB:B.ovr,
  };
}

// round-robin de 4 times
const RR = [ [[0,1],[2,3]], [[0,2],[3,1]], [[0,3],[1,2]] ];

function simulateGroup(letter, teams, chaos, vStart){
  const matches=[];
  let vi=vStart;
  RR.forEach((round, ri)=>{
    round.forEach(([h,a])=>{
      const m = playMatch(teams[h], teams[a], `Grupo ${letter} · Rodada ${ri+1}`, chaos, false, vi++);
      m.round = ri+1; m.group = letter;
      matches.push(m);
    });
  });
  // tabela
  const st = {};
  teams.forEach(t=> st[t]={team:t, P:0,J:0,V:0,E:0,D:0,GP:0,GC:0,FP:0});
  matches.forEach(m=>{
    const A=st[m.home], B=st[m.away];
    A.J++; B.J++; A.GP+=m.ga; A.GC+=m.gb; B.GP+=m.gb; B.GC+=m.ga;
    A.FP += fairPlayScore(); B.FP += fairPlayScore();
    if(m.ga>m.gb){ A.V++;B.D++;A.P+=3; }
    else if(m.ga<m.gb){ B.V++;A.D++;B.P+=3; }
    else { A.E++;B.E++;A.P++;B.P++; }
  });
  const table = Object.values(st).map(r=>({...r, SG:r.GP-r.GC, ovr:TEAMS[r.team].ovr}))
    .sort(sortOfficialRows);
  table.forEach((r,i)=> r.pos=i+1);
  return {letter, teams, matches, table};
}

function fairPlayScore(){
  let score = 0;
  if(RND()<0.55) score -= 1; // amarelo
  if(RND()<0.10) score -= 2; // segundo cartão/conduta acumulada
  if(RND()<0.025) score -= 4; // vermelho direto raro
  return score;
}

function sortOfficialRows(a,b){
  return b.P-a.P || b.SG-a.SG || b.GP-a.GP || b.FP-a.FP || b.ovr-a.ovr;
}

function slotFromRow(r, tier){
  return {team:r.team, group:r.group||r.letter, P:r.P, SG:r.SG, GP:r.GP, FP:r.FP, ovr:r.ovr, tier};
}

function simulate(seed, chaos, name, tone){
  RND = mulberry32(seed);

  // ---- fase de grupos ----
  const groups = [];
  let vStart=0;
  GROUPS.forEach(([L,ts])=>{ const g=simulateGroup(L,ts,chaos,vStart); vStart+=6; g.table.forEach(r=>r.group=L); groups.push(g); });

  // ---- classificados ----
  const firsts = groups.map(g=>({...g.table[0], group:g.letter, tier:0}));
  const seconds= groups.map(g=>({...g.table[1], group:g.letter, tier:1}));
  const thirds = groups.map(g=>({...g.table[2], group:g.letter, tier:2}))
                  .sort(sortOfficialRows);
  thirds.forEach((t,i)=> t.advanced = i<8);
  const qualThirds = thirds.filter(t=>t.advanced);

  // marca status na tabela dos grupos
  groups.forEach(g=>{
    g.table.forEach(r=>{
      if(r.pos<=2) r.status="Classificado";
      else if(r.pos===3) r.status = qualThirds.find(t=>t.team===r.team) ? "3º classificado" : "Eliminado";
      else r.status="Eliminado";
    });
  });

  const groupByLetter = Object.fromEntries(groups.map(g=>[g.letter,g]));
  const thirdCombo = qualThirds.map(t=>t.group).sort().join("");
  const thirdSlotMap = THIRD_PLACE_MAP[thirdCombo];
  if(!thirdSlotMap) throw new Error(`Combinação de terceiros sem chave oficial: ${thirdCombo}`);
  const thirdByGroup = Object.fromEntries(qualThirds.map(t=>[t.group, slotFromRow(t,2)]));
  const winner = L => slotFromRow(groupByLetter[L].table[0],0);
  const runner = L => slotFromRow(groupByLetter[L].table[1],1);
  const thirdForWinner = L => {
    const thirdGroup = thirdSlotMap[L];
    const slot = thirdByGroup[thirdGroup];
    if(!slot) throw new Error(`Terceiro ${thirdGroup} não disponível para 1${L} (${thirdCombo})`);
    return slot;
  };

  // reach tracking
  const reach = {}; // team -> stage index (1 r32 ... 6 champ)
  const setReach=(t,v)=>{ if(!reach[t]||reach[t]<v) reach[t]=v; };
  Object.keys(TEAMS).forEach(t=> reach[t]=0);

  // ---- helpers de rodada eliminatória ----
  let vi = 80;
  const byMatch = {};
  function playKnockMatch(id, A, B, label, stageIdx){
    const m = playMatch(A.team, B.team, label, chaos, true, vi++);
    m.matchNo = id; m.A=A; m.B=B; m.stageIdx=stageIdx;
    m.topSeedRule = topSeedRuleFor(A.team, B.team, stageIdx);
    const aWin = (m.ga>m.gb) || (m.pens && m.pens[0]>m.pens[1]);
    m.winner = aWin? A: B; m.loser = aWin? B: A;
    setReach(A.team, stageIdx); setReach(B.team, stageIdx);
    byMatch[id] = m;
    return m;
  }

  const R32_SPECS = [
    [73, runner("A"), runner("B")],
    [74, winner("E"), thirdForWinner("E")],
    [75, winner("F"), runner("C")],
    [76, winner("C"), runner("F")],
    [77, winner("I"), thirdForWinner("I")],
    [78, runner("E"), runner("I")],
    [79, winner("A"), thirdForWinner("A")],
    [80, winner("L"), thirdForWinner("L")],
    [81, winner("D"), thirdForWinner("D")],
    [82, winner("G"), thirdForWinner("G")],
    [83, runner("K"), runner("L")],
    [84, winner("H"), runner("J")],
    [85, winner("B"), thirdForWinner("B")],
    [86, winner("J"), runner("H")],
    [87, winner("K"), thirdForWinner("K")],
    [88, runner("D"), runner("G")],
  ];
  const R32 = {matches:R32_SPECS.map(([id,A,B])=>playKnockMatch(id,A,B,"Fase de 32",1))};

  function playFromMatches(specs, label, stageIdx){
    return {matches:specs.map(([id,a,b])=>playKnockMatch(id, byMatch[a].winner, byMatch[b].winner, label, stageIdx))};
  }

  const R16 = playFromMatches([[89,74,77],[90,73,75],[91,76,78],[92,79,80],[93,83,84],[94,81,82],[95,86,88],[96,85,87]], "Oitavas de final", 2);
  const QF  = playFromMatches([[97,89,90],[98,93,94],[99,91,92],[100,95,96]], "Quartas de final", 3);
  const SF  = playFromMatches([[101,97,98],[102,99,100]], "Semifinal", 4);
  // 3º lugar
  const tpA = SF.matches[0].loser, tpB = SF.matches[1].loser;
  const third = playMatch(tpA.team, tpB.team, "Disputa de 3º lugar", chaos, true, vi++);
  third.matchNo=103; third.A=tpA; third.B=tpB; third.stageIdx=4;
  const thirdWin = (third.ga>third.gb)||(third.pens&&third.pens[0]>third.pens[1]);
  third.winner = thirdWin? tpA: tpB; third.loser = thirdWin? tpB: tpA;
  // final
  const fA = SF.matches[0].winner, fB = SF.matches[1].winner;
  const final = playMatch(fA.team, fB.team, "Final", chaos, true, 4); // MetLife
  final.matchNo=104; final.A=fA; final.B=fB; final.stageIdx=5;
  final.topSeedRule = topSeedRuleFor(fA.team, fB.team, 5);
  final.venue="MetLife Stadium"; final.city="Nova York / Nova Jersey";
  const champWin = (final.ga>final.gb)||(final.pens&&final.pens[0]>final.pens[1]);
  final.winner = champWin? fA: fB; final.loser = champWin? fB: fA;

  setReach(final.winner.team,6); setReach(final.loser.team,5);
  setReach(SF.matches[0].winner.team, Math.max(reach[SF.matches[0].winner.team],5));
  setReach(SF.matches[1].winner.team, Math.max(reach[SF.matches[1].winner.team],5));
  setReach(third.winner.team, Math.max(reach[third.winner.team],4));

  const champion = final.winner.team;
  const runnerUp = final.loser.team;
  const thirdPlace = third.winner.team;
  const fourthPlace = third.loser.team;

  // ---- estatísticas: artilheiros, assistências, gols por time ----
  const allMatches = [
    ...groups.flatMap(g=>g.matches),
    ...R32.matches, ...R16.matches, ...QF.matches, ...SF.matches, third, final
  ];
  const knockoutMatches = [...R32.matches, ...R16.matches, ...QF.matches, ...SF.matches, final];
  const topSeedProtection = analyzeTopSeedProtection(groups, knockoutMatches);
  const scorers={}, assists={}, conceded={}, scoredBy={};
  Object.keys(TEAMS).forEach(t=>{ conceded[t]=0; scoredBy[t]=0; });
  allMatches.forEach(m=>{
    conceded[m.home]+=m.gb; conceded[m.away]+=m.ga;
    scoredBy[m.home]+=m.ga; scoredBy[m.away]+=m.gb;
    m.goals.forEach(g=>{
      const k=g.player+"||"+g.team;
      scorers[k]=scorers[k]||{player:g.player,team:g.team,goals:0};
      scorers[k].goals++;
      if(g.assist){
        const a=g.assist+"||"+g.team;
        assists[a]=assists[a]||{player:g.assist,team:g.team,assists:0};
        assists[a].assists++;
      }
    });
  });
  const topScorers = Object.values(scorers).sort((a,b)=> b.goals-a.goals || TEAMS[b.team].ovr-TEAMS[a.team].ovr).slice(0,10);
  const topAssists = Object.values(assists).sort((a,b)=> b.assists-a.assists).slice(0,10);

  // ---- prêmios ----
  // chuteira de ouro
  const topScorer = topScorers[0];
  // melhor jogador: maior pontuação (gols*2 + alcance) entre semifinalistas
  const semiTeams = new Set([final.winner.team, final.loser.team, third.winner.team, third.loser.team]);
  let bestPlayer=null, bestScore=-1;
  Object.values(scorers).forEach(s=>{
    const score = s.goals*2 + (reach[s.team]||0)*1.4 + (TEAMS[s.team].sq.find(p=>p[0]===s.player)?.[3]?.includes("S")?2:0);
    if(score>bestScore){ bestScore=score; bestPlayer={...s, reach:reach[s.team]}; }
  });
  // garante craque de time finalista quando possível
  // melhor jovem: jovem (Y) com mais gols, peso por alcance
  let bestYoung=null, by=-1;
  Object.values(scorers).forEach(s=>{
    const pl = TEAMS[s.team].sq.find(p=>p[0]===s.player);
    if(pl && pl[3] && pl[3].includes("Y")){
      const sc = s.goals*2 + (reach[s.team]||0);
      if(sc>by){ by=sc; bestYoung={...s}; }
    }
  });
  if(!bestYoung){ // fallback: jovem do time campeão
    const y = TEAMS[champion].sq.find(p=>p[3]&&p[3].includes("Y"));
    bestYoung = {player: y?y[0]:TEAMS[champion].sq[0][0], team:champion, goals:0};
  }
  // melhor goleiro: GK do time que chegou longe e sofreu menos
  let bestGK=null, gkScore=-1;
  Object.keys(TEAMS).forEach(t=>{
    if((reach[t]||0)>=4){
      const gk = TEAMS[t].sq.find(p=>p[1]==="GK");
      if(gk){
        const sc = (reach[t])*3 - conceded[t]*0.5;
        if(sc>gkScore){ gkScore=sc; bestGK={player:gk[0], team:t, conceded:conceded[t]}; }
      }
    }
  });

  // ---- destaques ----
  // maior zebra: confronto eliminatório vencido pelo de menor ovr.
  // Exige diferença real (>=4) e prioriza o tamanho da diferença sobre a fase,
  // para não rotular "zebra" um confronto quase parelho (ex.: 89 x 91).
  let biggestUpset=null, upScore=-1;
  [...R32.matches,...R16.matches,...QF.matches,...SF.matches,final].forEach(m=>{
    const wO=TEAMS[m.winner.team].ovr, lO=TEAMS[m.loser.team].ovr;
    const diff = lO-wO;
    if(diff>=4){
      const stageW = {"Fase de 32":1,"Oitavas de final":2,"Quartas de final":3,"Semifinal":4,"Final":5}[m.stage]||1;
      const sc = diff*3 + stageW;
      if(sc>upScore){ upScore=sc; biggestUpset={m, diff}; }
    }
  });
  // cinderela: menor ovr entre os que chegaram às quartas+ (a grande surpresa positiva)
  const stageName = idx => idx>=6?"o título":idx>=5?"a final":idx>=4?"a semifinal":idx>=3?"as quartas":idx>=2?"as oitavas":"o mata-mata";
  let cinderella=null, cOvr=999;
  Object.keys(reach).forEach(t=>{ if(reach[t]>=3 && TEAMS[t].ovr<cOvr){ cOvr=TEAMS[t].ovr; cinderella=t; } });
  const cinderellaStage = cinderella ? stageName(reach[cinderella]) : "";
  // maior decepção: maior ovr eliminado na fase de grupos; senão eliminado mais cedo
  let disappointment=null, dOvr=-1;
  groups.forEach(g=> g.table.filter(r=>r.status==="Eliminado").forEach(r=>{
    if(TEAMS[r.team].ovr>dOvr){ dOvr=TEAMS[r.team].ovr; disappointment=r.team; }
  }));
  // jogo mais emocionante: muitos gols + fase avançada + virada/pênaltis
  let bestMatch=null, bmScore=-1;
  allMatches.forEach(m=>{
    const stageW = m.stage.includes("Final")?6:m.stage.includes("Semi")?5:m.stage.includes("Quartas")?4:m.stage.includes("Oitavas")?3:m.stage.includes("32")?2:1;
    const sc = (m.ga+m.gb)*1.0 + stageW + (m.pens?3:0) + (m.aet?1.5:0);
    if(sc>bmScore){ bmScore=sc; bestMatch=m; }
  });
  // maior goleada / jogo com mais gols
  let biggestRout=null, brDiff=-1, mostGoals=null, mgN=-1;
  allMatches.forEach(m=>{
    const d=Math.abs(m.ga-m.gb), tot=m.ga+m.gb;
    if(d>brDiff){ brDiff=d; biggestRout=m; }
    if(tot>mgN){ mgN=tot; mostGoals=m; }
  });
  // melhor ataque / defesa entre QF+
  const deepTeams = Object.keys(reach).filter(t=>reach[t]>=3);
  const bestAttack = deepTeams.slice().sort((a,b)=> scoredBy[b]-scoredBy[a])[0];
  const bestDefense= deepTeams.slice().sort((a,b)=> conceded[a]-conceded[b])[0];
  // melhor campanha de grupos / pior campanha tradicional
  const allRows = groups.flatMap(g=>g.table.map(r=>({...r})));
  const bestGroupCampaign = allRows.slice().sort((a,b)=> b.P-a.P || b.SG-a.SG)[0];
  const TRAD = ["Brasil","Argentina","Alemanha","França","Itália","Inglaterra","Espanha","Holanda","Portugal","Uruguai"];
  const worstTrad = allRows.filter(r=>TRAD.includes(r.team)).sort((a,b)=> a.P-b.P || a.SG-b.SG)[0];

  // ---- seleção ideal (4-3-3) ----
  const bucket = {GK:[],DF:[],MF:[],FW:[]};
  Object.keys(TEAMS).forEach(t=>{
    TEAMS[t].sq.forEach(p=>{
      const g = (scorers[p[0]+"||"+t]?.goals)||0;
      const a = (assists[p[0]+"||"+t]?.assists)||0;
      const sc = g*3 + a*1.5 + (reach[t]||0)*1.1 + TEAMS[t].ovr/22 + (p[3]&&p[3].includes("S")?1.5:0);
      bucket[p[1]].push({player:p[0],team:t,goals:g,assists:a,score:sc,pos:p[1]});
    });
  });
  Object.keys(bucket).forEach(k=> bucket[k].sort((a,b)=> b.score-a.score));
  const bestXI = [
    bestGK ? {player:bestGK.player,team:bestGK.team,pos:"GK",goals:0} : bucket.GK[0],
    ...bucket.DF.slice(0,4),
    ...bucket.MF.slice(0,3),
    ...bucket.FW.slice(0,3),
  ];

  // melhor técnico: do campeão
  const bestCoach = {name:TEAMS[champion].coach, team:champion};

  return {
    name, tone, seed, chaos,
    champion, runnerUp, thirdPlace, fourthPlace,
    groups, thirds, qualThirds,
    knockout:{ R32:R32.matches, R16:R16.matches, QF:QF.matches, SF:SF.matches, third, final },
    topSeedProtection,
    reach, scoredBy, conceded,
    awards:{ topScorer, bestPlayer, bestYoung, bestGK, bestCoach },
    highlights:{ biggestUpset, cinderella, cinderellaStage, disappointment, bestMatch, biggestRout, mostGoals,
                 bestAttack, bestDefense, bestGroupCampaign, worstTrad },
    stats:{ topScorers, topAssists, bestXI },
  };
}

function simulateWithRankingProtection(seed, chaos, name, tone){
  let attempt = 0;
  let resolvedSeed = seed >>> 0;
  let sim = null;
  const maxAttempts = 90;
  while(attempt < maxAttempts){
    sim = simulate(resolvedSeed, chaos, name, tone);
    if(!sim.topSeedProtection.violations.length) break;
    attempt++;
    // Salto determinístico: a mesma seed inicial sempre cai no mesmo cenário válido.
    resolvedSeed = (resolvedSeed + 0x9E3779B9 + attempt * 2654435761) >>> 0;
  }
  sim.requestedSeed = seed >>> 0;
  sim.resolvedSeed = resolvedSeed;
  sim.topSeedProtection.resampleAttempts = attempt;
  sim.topSeedProtection.enforced = !sim.topSeedProtection.violations.length;
  return sim;
}




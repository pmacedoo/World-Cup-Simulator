"use strict";
// Motor de simulação + interface do Simulador Copa do Mundo FIFA 2026.
// Carregado após worldcup-data.js (que define window.WC_DATA).

const { TEAMS, GROUPS, THIRD_PLACE_MAP } = window.WC_DATA;

/* ----- Sedes (16 cidades-sede oficiais) ----- */
const VENUES = [
 ["MetLife Stadium","Nova York / Nova Jersey"],["SoFi Stadium","Los Angeles"],
 ["AT&T Stadium","Dallas"],["Mercedes-Benz Stadium","Atlanta"],
 ["Hard Rock Stadium","Miami"],["NRG Stadium","Houston"],
 ["Lincoln Financial Field","Filadélfia"],["Lumen Field","Seattle"],
 ["Levi's Stadium","São Francisco"],["Arrowhead Stadium","Kansas City"],
 ["Gillette Stadium","Boston"],["Estádio Azteca","Cidade do México"],
 ["Estádio Akron","Guadalajara"],["Estádio BBVA","Monterrey"],
 ["BMO Field","Toronto"],["BC Place","Vancouver"],
];

/* =================================================================
   PRNG determinístico (mulberry32) + utilidades
   ================================================================= */
function mulberry32(seed){
  let a = seed >>> 0;
  return function(){
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
let RND = Math.random; // substituído por simulação
const rand  = () => RND();
const rint  = (n) => Math.floor(RND()*n);
const pick  = (arr) => arr[rint(arr.length)];
const clamp = (v,a,b) => Math.max(a, Math.min(b, v));
function poisson(lambda){ // amostra de Poisson via Knuth
  const L = Math.exp(-lambda); let k=0, p=1;
  do { k++; p *= RND(); } while (p > L);
  return k-1;
}

/* =================================================================
   MOTOR DE SIMULAÇÃO
   ================================================================= */
const GOAL_TYPES = ["dentro da área","cabeçada","chute de fora","contra-ataque","de pênalti","cobrança de falta","finalização de primeira","após bela jogada"];

// Regra de proteção do ranking FIFA no sorteio de 2026.
// A FIFA separou os quatro mais bem ranqueados em caminhos protegidos:
// Espanha x Argentina e França x Inglaterra só devem acontecer na final
// quando estes times cumprem o caminho esperado como vencedores de grupo.
const FIFA_RANKING_TOP4 = [
  {team:"Espanha", rank:1, group:"H", path:"M101"},
  {team:"Argentina", rank:2, group:"J", path:"M102"},
  {team:"França", rank:3, group:"I", path:"M101"},
  {team:"Inglaterra", rank:4, group:"L", path:"M102"},
];
const FIFA_TOP4_BY_TEAM = Object.fromEntries(FIFA_RANKING_TOP4.map(s=>[s.team,s]));
function pairKey(a,b){ return [a,b].sort().join("||"); }
const FIFA_FINAL_ONLY_PAIRS = new Set([
  pairKey("Espanha","Argentina"),
  pairKey("França","Inglaterra"),
]);
function topSeedRuleFor(teamA, teamB, stageIdx){
  const A = FIFA_TOP4_BY_TEAM[teamA], B = FIFA_TOP4_BY_TEAM[teamB];
  if(!A || !B) return null;
  const finalOnly = FIFA_FINAL_ONLY_PAIRS.has(pairKey(teamA,teamB));
  const minStageIdx = finalOnly ? 5 : 4;
  return {
    teams:[teamA,teamB],
    ranks:[A.rank,B.rank],
    finalOnly,
    minStageIdx,
    requiredStage: finalOnly ? "Final" : "Semifinal ou final",
    allowed: stageIdx >= minStageIdx,
  };
}
function analyzeTopSeedProtection(groups, knockoutMatches){
  const byGroup = Object.fromEntries(groups.map(g=>[g.letter,g]));
  const seeds = FIFA_RANKING_TOP4.map(seed=>{
    const row = byGroup[seed.group]?.table.find(r=>r.team===seed.team);
    return {...seed, position:row?.pos||0, protectedPath:(row?.pos===1)};
  });
  const clashes = knockoutMatches
    .map(m=>m.topSeedRule ? {
      matchNo:m.matchNo,
      stage:m.stage,
      teams:m.topSeedRule.teams,
      ranks:m.topSeedRule.ranks,
      requiredStage:m.topSeedRule.requiredStage,
      allowed:m.topSeedRule.allowed,
    } : null)
    .filter(Boolean);
  return {
    seeds,
    clashes,
    violations:clashes.filter(c=>!c.allowed),
    allProtectedSeedsWonGroups:seeds.every(s=>s.protectedPath),
    finalOnlyPairs:["Espanha x Argentina","França x Inglaterra"],
  };
}

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

/* =================================================================
   GERAÇÃO DE NARRATIVA (texto a partir dos resultados reais)
   ================================================================= */
function fmt(team){ return `${flag(team)} ${team}`; }
function scoreLine(m){
  let s = `${m.ga}–${m.gb}`;
  if(m.pens) s += ` (pên. ${m.pens[0]}–${m.pens[1]})`;
  else if(m.aet) s += " (a.p.)";
  return s;
}
function narrativeFor(sim){
  const f = sim.knockout.final;
  const champ = sim.champion, vice = sim.runnerUp;
  const ts = sim.awards.topScorer;
  const up = sim.highlights.biggestUpset;
  const cind = sim.highlights.cinderella;
  const dis = sim.highlights.disappointment;
  const bp = sim.awards.bestPlayer;
  const sf = sim.knockout.SF;

  const intro = `Sob o céu de três nações, a primeira Copa do Mundo com 48 seleções entregou exatamente o que prometia: caos controlado, gigantes sob pressão e uma final que ${flag(champ)} ${champ} venceu por ${scoreLine(f)} diante de ${flag(vice)} ${vice}. O torneio "${sim.name}" foi marcado pelo tom ${sim.tone.toLowerCase()} — e por histórias que só o futebol sabe escrever.`;

  const favoritos = `Os favoritos chegaram cercados de expectativa. ${flag(champ)} ${champ}, comandado por ${TEAMS[champ].coach}, soube dosar talento e equilíbrio: cresceu a cada rodada, encontrou o seu pico no momento certo e transformou o mata-mata em vitrine. Pelo outro lado da chave, ${flag(vice)} ${vice} provou ter elenco para o título, mas esbarrou na decisão.`;

  const surpresa = up ? `A maior zebra veio em ${up.m.stage.toLowerCase()}: ${flag(up.m.winner.team)} ${up.m.winner.team} eliminou ${flag(up.m.loser.team)} ${up.m.loser.team} por ${scoreLine(up.m)}, derrubando uma seleção teoricamente superior e mudando o desenho do torneio.`
    : `Houve sustos, mas os favoritos administraram bem os perigos do mata-mata.`;

  const cinder = cind ? `Entre os médios, ${flag(cind)} ${cind} foi a sensação da Copa, furando o teto que a lógica lhe reservava e chegando bem mais longe do que o ranking previa.` : ``;

  const heroi = bp ? `O herói tático e emocional foi ${bp.player} (${flag(bp.team)} ${bp.team}), eleito melhor jogador após ${bp.goals} gol(is) e atuações decisivas nas fases finais.` : ``;
  const artilheiro = ts ? `A artilharia ficou com ${ts.player} (${flag(ts.team)} ${ts.team}), que balançou as redes ${ts.goals} vezes e carregou o ataque do seu país.` : ``;

  const decepcao = dis ? `Nem todos sorriram. ${flag(dis)} ${dis} foi a grande decepção: caiu antes do esperado e deixou o torneio devendo, em uma campanha que vai render debates em casa.` : ``;

  const semis = `O caminho até a decisão passou por duas semifinais intensas: ${flag(sf[0].winner.team)} ${sf[0].winner.team} superou ${flag(sf[0].loser.team)} ${sf[0].loser.team} (${scoreLine(sf[0])}), enquanto ${flag(sf[1].winner.team)} ${sf[1].winner.team} bateu ${flag(sf[1].loser.team)} ${sf[1].loser.team} (${scoreLine(sf[1])}).`;

  const final = `Na final, ${flag(champ)} ${champ} venceu porque uniu as duas coisas que definem campeões: um plano de jogo claro de ${TEAMS[champ].coach} e jogadores capazes de resolver no detalhe. ${champ} ergueu a taça e escreveu mais um capítulo na história das Copas.`;

  return { intro, favoritos, surpresa, cinder, heroi, artilheiro, decepcao, semis, final };
}

/* =================================================================
   ESTADO + PERFIS DE SIMULAÇÃO
   ================================================================= */
const simulationProfiles = {
  realistic: {
    label:"Realística", tone:"Realista", className:"profile-realistic", color:"#0a3161",
    name:"A Era dos Favoritos", seed:14, chaos:0.42,
    favoriteBias:0.75, upsetChance:0.12, drawChance:0.22, lateGoalChance:0.18, penaltyChance:0.18,
    extraTimeChance:0.14, starPlayerImpact:0.75, moraleImpact:0.65, coachImpact:0.75,
    chaosWeight:0.15, narrativeWeight:0.35,
    description:"Prioriza força dos elencos, técnicos, ranking e resultados mais plausíveis.",
    sub:"Cenário mais provável: força e elenco falam mais alto, com poucas surpresas.",
  },
  epic: {
    label:"Épica", tone:"Épico", className:"profile-epic", color:"#c8962f",
    name:"A Copa Épica", seed:17, chaos:0.66,
    favoriteBias:0.68, upsetChance:0.18, drawChance:0.20, lateGoalChance:0.35, penaltyChance:0.28,
    extraTimeChance:0.25, starPlayerImpact:0.95, moraleImpact:0.75, coachImpact:0.70,
    chaosWeight:0.28, narrativeWeight:0.85,
    description:"Cria uma Copa cinematográfica, com craques decidindo e campanhas memoráveis.",
    sub:"Cenário equilibrado: gigantes vão longe, clássicos crescem e finais têm cara de legado.",
  },
  dramatic: {
    label:"Dramática", tone:"Dramático", className:"profile-dramatic", color:"#b31942",
    name:"Noite das Zebras", seed:4, chaos:0.92,
    favoriteBias:0.52, upsetChance:0.35, drawChance:0.26, lateGoalChance:0.45, penaltyChance:0.38,
    extraTimeChance:0.34, starPlayerImpact:0.65, moraleImpact:0.90, coachImpact:0.60,
    chaosWeight:0.55, narrativeWeight:0.95,
    description:"Valoriza caos, viradas, zebras, pênaltis e histórias inesperadas.",
    sub:"Cenário caótico: zebras, viradas e narrativas dramáticas dominam o roteiro.",
  },
};
const PROFILE_ORDER = ["realistic","epic","dramatic"];
const PROFILE_TO_SIM_INDEX = {realistic:0, epic:1, dramatic:2};
function profileFor(type){ return simulationProfiles[type] || simulationProfiles.realistic; }
function tagSimulation(sim, type){
  const profile = profileFor(type);
  sim.simulationType = type;
  sim.profile = profile;
  sim.tone = profile.label;
  return sim;
}
function buildProfileSimulation(type, seedOverride=null){
  const profile = profileFor(type);
  const seed = seedOverride ?? profile.seed;
  return tagSimulation(simulateWithRankingProtection(seed, profile.chaos, profile.name, profile.label), type);
}
function safeStorageGet(key){ try{return localStorage.getItem(key);}catch{return null;} }
function safeStorageSet(key,value){ try{localStorage.setItem(key,value);}catch{} }
function safeStorageRemove(key){ try{localStorage.removeItem(key);}catch{} }

/* =================================================================
   SIMULAÇÕES SALVAS PELO USUÁRIO
   -----------------------------------------------------------------
   Não há mais 3 simulações "padrão". O usuário cria simulações
   (seleção + tipo), cada uma é salva no localStorage e pode ser
   aberta, deletada ou usada para gerar uma nova. O objeto completo
   é regenerado de forma determinística a partir do seed salvo.
   ================================================================= */
const SIM_STORE_KEY  = "wc_simulations_v1";
const SIM_ACTIVE_KEY = "wc_active_simulation_v1";
const simCache = new Map();                       // id -> objeto de simulação completo

const state = { sims:[], meta:[], custom:null, active:0 };  // espelho usado pelo dashboard
const appState = {
  sims: [],            // registros: {id,favoriteTeam,type,seed,createdAt,revealed,finished,dashboardUnlocked}
  activeId: null,
  draftTeam: null,     // assistente de criação
  teamSearch: "",
  view: "picker-team", // picker-team | picker-type | journey | dashboard
  currentSimulatedMatch: null,
  matchTimer: null,
  penaltyTimers: [],
  matchAnimationStarted: false,
};
const uid = () => "s" + Date.now().toString(36) + Math.random().toString(36).slice(2,7);
function timeAgo(ts){
  const d=Math.max(0,Date.now()-ts), m=Math.floor(d/60000), h=Math.floor(m/60), dd=Math.floor(h/24);
  if(dd>0) return `há ${dd}d`; if(h>0) return `há ${h}h`; if(m>0) return `há ${m}min`; return "agora";
}
function persistSims(){
  safeStorageSet(SIM_STORE_KEY, JSON.stringify(appState.sims));
  safeStorageSet(SIM_ACTIVE_KEY, appState.activeId || "");
}
function loadSims(){
  let arr=[]; try{ arr=JSON.parse(safeStorageGet(SIM_STORE_KEY)||"[]"); }catch{ arr=[]; }
  appState.sims = (Array.isArray(arr)?arr:[])
    .filter(r=>r && TEAMS[r.favoriteTeam] && simulationProfiles[r.type])
    .map(r=>({ id:r.id||uid(), favoriteTeam:r.favoriteTeam, type:r.type, seed:(r.seed>>>0)||1,
      createdAt:r.createdAt||Date.now(), revealed:Math.max(0,r.revealed|0),
      finished:!!r.finished, dashboardUnlocked:!!r.dashboardUnlocked }));
  const act=safeStorageGet(SIM_ACTIVE_KEY);
  appState.activeId = appState.sims.some(r=>r.id===act) ? act : (appState.sims[0]?.id || null);
}
function profileNameFor(record){ return `${record.favoriteTeam} · ${profileFor(record.type).label}`; }
function simObjFor(record){
  if(!record) return null;
  if(simCache.has(record.id)) return simCache.get(record.id);
  const p=profileFor(record.type);
  const obj=tagSimulation(simulateWithRankingProtection(record.seed, p.chaos, profileNameFor(record), p.label), record.type);
  obj.__recordId=record.id;
  simCache.set(record.id, obj);
  return obj;
}
function activeRecord(){ return appState.sims.find(r=>r.id===appState.activeId) || null; }
function currentSim(){ return simObjFor(activeRecord()); }
function createSimulation(team, type){
  const rec={ id:uid(), favoriteTeam:team, type, seed:((Date.now()^(Math.random()*1e9))>>>0)||1,
    createdAt:Date.now(), revealed:0, finished:false, dashboardUnlocked:false };
  appState.sims.push(rec); appState.activeId=rec.id; persistSims();
  return rec;
}
function deleteSimulation(id){
  appState.sims = appState.sims.filter(r=>r.id!==id);
  simCache.delete(id);
  if(appState.activeId===id) appState.activeId = appState.sims[0]?.id || null;
  persistSims();
}
function setActiveSimulation(id){ appState.activeId=id; persistSims(); }
function markMatchRevealed(record, journeyIndex){
  if(!record) return;
  const sim=simObjFor(record);
  const total=getTeamMatches(sim, record.favoriteTeam).length;
  record.revealed = Math.min(total, Math.max(record.revealed, journeyIndex+1));
  if(record.revealed>=total) record.finished=true;
  persistSims();
}
function syncDashboardState(){
  state.sims = appState.sims.map(simObjFor);
  state.meta = appState.sims.map(r=>{ const p=profileFor(r.type); return {sub:p.sub,color:p.color,type:r.type}; });
  state.active = Math.max(0, appState.sims.findIndex(r=>r.id===appState.activeId));
}

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
function startNewSimulation(){
  appState.draftTeam=null; appState.teamSearch=""; appState.view="picker-team";
  renderTeamPickerIntro();
}
// cria uma nova simulação (seleção + tipo), salva e entra na jornada
function commitSimulation(team, type){
  flashLoader();
  createSimulation(team, type);
  appState.view="journey";
  setTimeout(()=>renderFavoriteTeamJourney(), 320);
}
// "trocar tipo": gera uma NOVA simulação com a mesma seleção e outro tom
function changeSimulationType(){
  appState.draftTeam=getFavoriteTeam();
  appState.view="picker-type";
  renderSimulationTypePicker();
}
// "trocar seleção": começa uma nova simulação do zero
function changeFavoriteTeam(){ startNewSimulation(); }
// reinicia o PROGRESSO da simulação ativa (revive a campanha do zero)
function resetGuidedExperience(){
  const r=activeRecord();
  if(r){ r.revealed=0; r.finished=false; r.dashboardUnlocked=false; persistSims(); }
  appState.view="journey";
  renderFavoriteTeamJourney();
}
function openFullDashboard(){
  const r=activeRecord(); if(r){ r.dashboardUnlocked=true; persistSims(); }
  appState.view="dashboard";
  renderFullDashboard();
}
function renderIntroNav(step){
  const steps=[["team-picker","Seleção"],["type-picker","Tipo"],["journey","Jornada"],["dashboard","Dashboard"]];
  return `<div class="max-w-7xl mx-auto flex items-center justify-between gap-4 mb-8 guided-enter">
    <div class="flex items-center gap-2.5">
      <span class="grid place-items-center w-10 h-10 rounded-2xl text-white text-sm font-extrabold" style="background:var(--grad-2026)">26</span>
      <div>
        <div class="font-display font-extrabold leading-tight">Copa 2026 · Jornada guiada</div>
        <div class="text-xs text-slate-500 font-semibold">Viva primeiro a campanha da sua seleção</div>
      </div>
    </div>
    <div class="hidden sm:flex items-center gap-2">
      ${steps.map(([id,label],i)=>`<span class="px-3 py-1.5 rounded-full text-xs font-extrabold ${id===step?'bg-ink text-white':'glass text-slate-500'}">${i+1}. ${label}</span>`).join("")}
    </div>
  </div>`;
}
function statusPill(status){
  const color = status==="Favorita"?"text-gold-600 bg-gold-500/15":status==="Anfitriã"?"text-usablue bg-usablue/10":status==="Zebra"?"text-usared bg-usared/10":"text-mxgreen bg-mxgreen/10";
  return `<span class="text-[10px] font-extrabold uppercase tracking-wider px-2 py-1 rounded-full ${color}">${status}</span>`;
}
function getMatchWinnerTeam(m){
  if(m.winner?.team) return m.winner.team;
  if(m.ga>m.gb) return m.home;
  if(m.gb>m.ga) return m.away;
  return null;
}
function getTeamMatches(sim, teamName){
  if(!sim || !teamName) return [];
  const groupMatches = sim.groups.flatMap(g=>g.matches);
  const knockoutMatches = [
    ...sim.knockout.R32,...sim.knockout.R16,...sim.knockout.QF,...sim.knockout.SF,
    sim.knockout.third, sim.knockout.final
  ];
  return [...groupMatches,...knockoutMatches]
    .filter(m=>m.home===teamName || m.away===teamName)
    .map((m,i)=>({
      ...m,
      journeyIndex:i,
      favoriteSide:m.home===teamName?"home":"away",
      favoriteWon:getMatchWinnerTeam(m)===teamName,
      favoriteDrew:!getMatchWinnerTeam(m),
      opponent:m.home===teamName?m.away:m.home,
    }));
}
function groupRowForTeam(sim, team){
  return sim.groups.flatMap(g=>g.table.map(r=>({...r, group:g.letter}))).find(r=>r.team===team);
}
function campaignSummary(sim, team){
  const row=groupRowForTeam(sim,team);
  const matches=getTeamMatches(sim,team);
  const last=matches[matches.length-1];
  const knockoutLost = last && last.stage && !last.stage.includes("Grupo") && !last.favoriteWon;
  if(sim.champion===team) return {status:"champion", title:"Sua seleção é campeã do mundo!", text:`Campanha dourada: ${flag(team)} ${team} ergueu a taça depois de ${matches.length} jogos e uma final vencida contra ${sim.runnerUp}.`};
  if(knockoutLost) return {status:"eliminated", title:"A campanha terminou aqui.", text:`${flag(team)} ${team} caiu em ${last.stage}, contra ${flag(last.opponent)} ${last.opponent}, por ${scoreLine(last)}.`};
  if(row && row.status==="Eliminado") return {status:"eliminated", title:"Eliminação na fase de grupos.", text:`${flag(team)} ${team} terminou o Grupo ${row.group} em ${row.pos}º, com ${row.P} pontos e saldo ${row.SG>0?"+":""}${row.SG}.`};
  return {status:"alive", title:"Campanha em destaque.", text:`${flag(team)} ${team} fez uma campanha de ${matches.length} jogo(s), passando pelo Grupo ${row?.group||"?"} e deixando sua marca nesta simulação.`};
}
/* ---- Revelação progressiva sem spoilers ---- */
const KO_ORDER = {"Fase de 32":1,"Oitavas de final":2,"Quartas de final":3,"Semifinal":4,"Disputa de 3º lugar":4,"Final":5};
const isGroupStage = m => (m.stage||"").includes("Grupo");
// fronteira de mata-mata já vivida pela favorita (maior fase entre os jogos revelados)
function favoriteFrontierKO(matches, revealed){
  let f=0;
  for(let i=0;i<revealed && i<matches.length;i++){ const m=matches[i]; if(!isGroupStage(m)) f=Math.max(f, KO_ORDER[m.stage]||0); }
  return f;
}
// classificação parcial dos grupos contando só rodadas <= uptoRound
function partialStandings(sim, uptoRound){
  return sim.groups.map(g=>{
    const st={}; g.teams.forEach(t=> st[t]={team:t,P:0,J:0,V:0,E:0,D:0,GP:0,GC:0});
    g.matches.filter(m=>(m.round||0)<=uptoRound).forEach(m=>{
      const A=st[m.home], B=st[m.away]; if(!A||!B) return;
      A.J++;B.J++;A.GP+=m.ga;A.GC+=m.gb;B.GP+=m.gb;B.GC+=m.ga;
      if(m.ga>m.gb){A.V++;B.D++;A.P+=3;} else if(m.ga<m.gb){B.V++;A.D++;B.P+=3;} else {A.E++;B.E++;A.P++;B.P++;}
    });
    const table=Object.values(st).map(r=>({...r,SG:r.GP-r.GC,ovr:TEAMS[r.team].ovr}))
      .sort((a,b)=>b.P-a.P||b.SG-a.SG||b.GP-a.GP||b.ovr-a.ovr);
    table.forEach((r,i)=>r.pos=i+1);
    return {letter:g.letter, table, played:uptoRound};
  });
}
function compactGroupCard(g, favTeam){
  return `<div class="glass rounded-2xl p-3 shadow-glass">
    <div class="flex items-center justify-between mb-1.5"><div class="font-display font-extrabold text-sm">Grupo ${g.letter}</div><div class="text-[10px] text-slate-400 font-bold">${g.played}/3</div></div>
    <table class="w-full text-xs"><tbody>
      ${g.table.map(r=>`<tr class="${r.team===favTeam?'font-extrabold text-ink':'text-slate-600'}">
        <td class="py-0.5 w-4 ${rowDot(r.pos,r.pos===3)==='bg-mxgreen'?'text-mxgreen':'text-slate-400'} tnum">${r.pos}</td>
        <td class="py-0.5"><span class="inline-flex items-center gap-1.5">${flag(r.team)}<span>${r.team}</span></span></td>
        <td class="py-0.5 text-right tnum text-slate-400">${r.J}j</td>
        <td class="py-0.5 text-right tnum font-extrabold">${r.P}</td>
        <td class="py-0.5 text-right tnum ${r.SG>0?'text-mxgreen':r.SG<0?'text-usared':'text-slate-400'}">${r.SG>0?'+':''}${r.SG}</td>
      </tr>`).join("")}
    </tbody></table>
  </div>`;
}
// modal de "situação da Copa neste momento" (grupos parciais ou chave parcial)
function openSnapshot(kind, journeyIndex){
  const record=activeRecord(); const sim=simObjFor(record); const team=record.favoriteTeam;
  const matches=getTeamMatches(sim,team); const m=matches[journeyIndex]; if(!m) return;
  let title="", body="";
  if(kind==="groups"){
    const uptoRound = isGroupStage(m) ? (m.round||1) : 3;
    const groups=partialStandings(sim, uptoRound);
    title = isGroupStage(m) ? `Grupos após a Rodada ${uptoRound}` : "Classificação final dos grupos";
    body = `<div class="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">${groups.map(g=>compactGroupCard(g,team)).join("")}</div>`;
  } else {
    if(isGroupStage(m)){
      title="Chaveamento";
      body=`<div class="glass rounded-2xl p-8 text-center text-slate-500 font-semibold">O mata-mata ainda não começou — sua seleção está na fase de grupos.</div>`;
    } else {
      const frontier=favoriteFrontierKO(matches, journeyIndex+1);
      const favNos=new Set(matches.slice(0,journeyIndex+1).filter(x=>!isGroupStage(x)).map(x=>x.matchNo));
      // rodadas já decididas + jogos da favorita = placar; rodada atual = confronto sem placar; rodadas futuras = "A definir"
      const modeFn = mm => {
        const o=KO_ORDER[mm.stage]||9;
        if(favNos.has(mm.matchNo) || o<frontier) return 'full';
        if(o===frontier) return 'teams';
        return 'locked';
      };
      title="Chaveamento até este momento";
      body = `<p class="text-sm text-slate-500 mb-3">Rodadas decididas aparecem com o placar; a rodada atual mostra os confrontos sem resultado; rodadas futuras ficam como <b>“A definir”</b> para não estragar a surpresa.</p>${buildBracketHTML(sim, null, modeFn)}`;
    }
  }
  let modal=$("#snapshotModal");
  if(!modal){
    modal=el("div","fixed inset-0 z-[75] hidden items-center justify-center p-3 sm:p-5");
    modal.id="snapshotModal";
    modal.innerHTML=`<div class="absolute inset-0 bg-ink/55 backdrop-blur-xl" data-close></div>
      <div id="snapshotBox" class="relative guided-card rounded-[2rem] shadow-lift w-full max-w-5xl max-h-[92vh] overflow-y-auto p-5 sm:p-7 swap"></div>`;
    document.body.appendChild(modal);
    modal.addEventListener("click",e=>{ if(e.target.dataset.close!==undefined){ modal.classList.add("hidden"); modal.classList.remove("flex"); } });
  }
  $("#snapshotBox").innerHTML=`
    <button class="absolute top-4 right-4 text-slate-400 hover:text-ink" data-close>✕</button>
    <div class="text-[11px] uppercase tracking-widest font-extrabold text-slate-400">Situação da Copa</div>
    <h3 class="font-display font-extrabold text-2xl mb-4">${title}</h3>
    ${body}`;
  $("#snapshotBox").querySelector("[data-close]").onclick=()=>{ modal.classList.add("hidden"); modal.classList.remove("flex"); };
  modal.classList.remove("hidden"); modal.classList.add("flex");
  paintIcons();
}
// lista da campanha revelada progressivamente (sem spoilers de jogos futuros)
function progressiveCampaign(record){
  const sim=simObjFor(record), team=record.favoriteTeam;
  const matches=getTeamMatches(sim,team);
  if(!matches.length) return `<div class="glass rounded-3xl p-6 text-slate-500 font-semibold">Nenhum jogo encontrado.</div>`;
  const revealed=Math.min(record.revealed, matches.length);
  let html=`<div class="journey-rail space-y-3">`;
  for(let i=0;i<revealed;i++){
    const m=matches[i];
    html+=`<div class="journey-match-card glass rounded-3xl p-4 pl-14 shadow-glass ${m.favoriteWon?'border-mxgreen/20':''}">
      <div class="absolute left-[13px] top-5 grid place-items-center w-10 h-10 rounded-full bg-white shadow-glass border border-white/80 font-extrabold text-xs ${m.favoriteWon?'text-mxgreen':m.favoriteDrew?'text-slate-500':'text-usared'}">${i+1}</div>
      <div class="text-[11px] uppercase tracking-wider font-extrabold text-slate-400">${m.matchNo?`M${m.matchNo} · `:''}${m.stage} · ${m.city}</div>
      <div class="mt-1 font-display font-extrabold text-lg flex flex-wrap items-center gap-2">${flag(m.home)} ${m.home} <span class="px-2 py-0.5 rounded-xl bg-ink text-white tnum">${scoreLine(m)}</span> ${flag(m.away)} ${m.away}</div>
      <div class="text-sm text-slate-500 mt-1">${m.goals.length?`${m.goals.length} gol(s): ${m.goals.slice(0,3).map(g=>`${g.minute}' ${g.player}`).join(" · ")}${m.goals.length>3?"...":""}`:"Sem gols no tempo jogado."}</div>
      <div class="mt-3 flex flex-wrap gap-2">
        <button class="snap-btn glass rounded-xl px-3 py-1.5 text-xs font-bold text-slate-600" data-snap="groups" data-idx="${i}">${ic('table-2','w-3.5 h-3.5')} Grupos agora</button>
        <button class="snap-btn glass rounded-xl px-3 py-1.5 text-xs font-bold text-slate-600" data-snap="bracket" data-idx="${i}">${ic('git-fork','w-3.5 h-3.5')} Chaveamento agora</button>
        <button class="replay-btn glass rounded-xl px-3 py-1.5 text-xs font-bold text-slate-600" data-idx="${i}">${ic('rotate-ccw','w-3.5 h-3.5')} Rever jogo</button>
      </div>
    </div>`;
  }
  if(revealed < matches.length){
    const m=matches[revealed];
    html+=`<div class="journey-match-card glass rounded-3xl p-4 pl-14 shadow-glass" style="box-shadow:0 0 0 2px rgba(10,49,97,.25),0 12px 36px -22px rgba(15,23,42,.5)">
      <div class="absolute left-[13px] top-5 grid place-items-center w-10 h-10 rounded-full text-white shadow-glass font-extrabold text-xs" style="background:var(--grad-2026)">${revealed+1}</div>
      <div class="text-[11px] uppercase tracking-wider font-extrabold text-usablue">Próximo jogo${m.matchNo?` · M${m.matchNo}`:''}</div>
      <div class="text-[11px] uppercase tracking-wider font-extrabold text-slate-400">${m.stage} · ${m.city}</div>
      <div class="mt-1 font-display font-extrabold text-lg flex flex-wrap items-center gap-2">${flag(m.home)} ${m.home} <span class="px-2 py-0.5 rounded-xl bg-slate-200 text-slate-500 tnum text-sm">VS</span> ${flag(m.away)} ${m.away}</div>
      <div class="text-sm text-slate-500 mt-1">Resultado oculto — simule a partida para viver o placar.</div>
      <button class="simulate-team-match btn-premium text-white font-bold px-4 py-2.5 rounded-2xl mt-3" data-match-index="${revealed}">${ic('play','w-4 h-4')} Simular partida</button>
    </div>`;
  } else {
    const cs=campaignSummary(sim,team);
    html+=`<div class="rounded-3xl p-5 ${cs.status==="champion"?'bg-gold-500/15 border border-gold-400/40':'bg-usared/10 border border-usared/20'}">
      <div class="font-display font-extrabold text-lg flex items-center gap-2">${ic(cs.status==="champion"?'trophy':'flag','w-5 h-5')} ${cs.title}</div>
      <p class="mt-1 text-slate-600 leading-relaxed">${cs.text}</p>
      <button id="campaignDashboard" class="btn-premium text-white font-extrabold rounded-2xl px-5 py-3 mt-4">${ic('layout-dashboard','w-4 h-4')} Ver Copa completa</button>
    </div>`;
  }
  html+=`</div>`;
  return html;
}
// painel lateral "Minhas simulações" (trocar / excluir / nova)
function savedSimsPanel(){
  return `<div class="text-[10px] uppercase tracking-widest font-extrabold text-slate-400 mb-2 mt-6">Minhas simulações</div>
    <div class="space-y-2">
      ${appState.sims.map(r=>{ const p=profileFor(r.type); const active=r.id===appState.activeId;
        return `<div class="flex items-center gap-2 rounded-2xl p-2.5 ${active?'bg-ink text-white':'glass'}">
          <span class="flex-none">${flag(r.favoriteTeam,'flag-lg')}</span>
          <button class="switch-sim flex-1 text-left min-w-0" data-id="${r.id}">
            <div class="font-extrabold text-sm truncate ${active?'text-white':''}">${r.favoriteTeam}</div>
            <div class="text-[11px] ${active?'text-white/75':'text-slate-500'} truncate">${p.label} · ${r.finished?'concluída':`${r.revealed} jogo(s)`} · ${timeAgo(r.createdAt)}</div>
          </button>
          <button class="del-sim flex-none w-7 h-7 grid place-items-center rounded-full ${active?'text-white/70 hover:text-white':'text-slate-300 hover:text-usared'}" data-id="${r.id}" title="Excluir">${ic('trash-2','w-4 h-4')}</button>
        </div>`;
      }).join("")}
    </div>
    <button id="newSimFromJourney" class="mt-3 w-full glass rounded-2xl px-4 py-3 font-extrabold text-slate-700 flex items-center justify-center gap-2">${ic('plus','w-4 h-4')} Nova simulação</button>`;
}

function setGuidedVisibility(showGuided){
  $("#guidedExperience").classList.toggle("hidden", !showGuided);
  $("#siteHeader").classList.toggle("hidden", showGuided);
  $("#top").classList.toggle("hidden", showGuided);
  $("#siteFooter").classList.toggle("hidden", showGuided);
}
function renderGuided(html){
  setGuidedVisibility(true);
  $("#guidedExperience").innerHTML = `<section class="guided-shell">${html}</section>`;
  paintIcons();
}
function renderTeamPickerIntro(){
  appState.view="picker-team";
  const hasSims=appState.sims.length>0;
  const teams=getAllTeamsFromSimulation();
  const q=(appState.teamSearch||"").trim().toLowerCase();
  const filtered=teams.filter(t=>!q || t.toLowerCase().includes(q) || teamMeta[t].confederation.toLowerCase().includes(q) || teamMeta[t].status.toLowerCase().includes(q));
  renderGuided(`
    ${renderIntroNav("team-picker")}
    <div class="max-w-7xl mx-auto grid lg:grid-cols-[.85fr_1.15fr] gap-6 items-start">
      <div class="guided-card rounded-[2rem] p-7 sm:p-9 guided-enter">
        <div class="inline-flex items-center gap-2 px-3 py-1.5 rounded-full glass text-xs font-extrabold text-slate-600 mb-5">${ic('sparkles','w-4 h-4 text-gold-600')} Experiência guiada</div>
        <h1 class="font-display font-extrabold text-4xl sm:text-6xl leading-[1.02]">Escolha sua <span class="grad-text">seleção favorita</span></h1>
        <p class="mt-5 text-slate-600 text-lg leading-relaxed">Antes de ver a Copa inteira, acompanhe a jornada da sua seleção dentro da simulação.</p>
        <div class="mt-7 rounded-3xl p-5 bg-white/60 border border-white/70">
          <div class="text-[11px] uppercase tracking-widest font-extrabold text-slate-400">Como funciona</div>
          <div class="mt-3 grid gap-3 text-sm text-slate-600 font-semibold">
            <div class="flex gap-3">${ic('mouse-pointer-click','w-5 h-5 text-usablue')} Escolha a seleção.</div>
            <div class="flex gap-3">${ic('sliders-horizontal','w-5 h-5 text-mxgreen')} Defina o tom da Copa.</div>
            <div class="flex gap-3">${ic('play','w-5 h-5 text-usared')} Assista aos jogos em modo acelerado.</div>
          </div>
        </div>
        <div class="mt-7 flex flex-wrap gap-3">
          <button id="continueTeamPick" class="btn-premium text-white font-extrabold px-6 py-3.5 rounded-2xl disabled:opacity-40 disabled:pointer-events-none" ${appState.draftTeam?'':'disabled'}>Continuar</button>
          ${hasSims?`<button id="cancelPick" class="glass rounded-2xl px-5 py-3.5 font-extrabold text-slate-600">Voltar às minhas simulações</button>`:''}
        </div>
      </div>
      <div class="guided-card rounded-[2rem] p-4 sm:p-5 guided-enter">
        <div class="flex flex-col sm:flex-row sm:items-center gap-3 mb-4">
          <div class="relative flex-1">
            <i data-lucide="search" class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400"></i>
            <input id="teamSearchInput" value="${appState.teamSearch||''}" placeholder="Buscar por seleção, confederação ou status" class="w-full rounded-2xl glass px-10 py-3 text-sm font-semibold outline-none" />
          </div>
          <div class="text-xs text-slate-400 font-bold">${filtered.length} seleções</div>
        </div>
        <div id="teamPickerGrid" class="grid sm:grid-cols-2 xl:grid-cols-3 gap-3 max-h-[68vh] overflow-y-auto pr-1">
          ${filtered.map((team,i)=>`
            <button class="team-pick-card text-left rounded-3xl p-4 glass ${appState.draftTeam===team?'active':''} guided-stagger" style="--i:${i%18}" data-team="${team}">
              <div class="flex items-start justify-between gap-3">
                <div class="flex items-center gap-3 min-w-0">
                  ${flag(team,'flag-lg')}
                  <div class="min-w-0">
                    <div class="font-display font-extrabold truncate">${team}</div>
                    <div class="text-xs text-slate-500 font-bold">${teamMeta[team].confederation} · força ${teamMeta[team].strength}</div>
                  </div>
                </div>
                ${statusPill(teamMeta[team].status)}
              </div>
              <div class="mt-3 text-xs text-slate-500 truncate">Destaques: ${teamMeta[team].keyPlayers.slice(0,3).join(", ")}</div>
            </button>`).join("")}
        </div>
      </div>
    </div>`);
  $("#teamSearchInput").oninput=e=>{ appState.teamSearch=e.target.value; renderTeamPickerIntro(); };
  document.querySelectorAll("#teamPickerGrid [data-team]").forEach(card=>card.onclick=()=>{
    appState.draftTeam=card.dataset.team;
    renderTeamPickerIntro();
  });
  $("#continueTeamPick").onclick=()=>{
    if(!appState.draftTeam) return;
    appState.view="picker-type";
    renderSimulationTypePicker();
  };
  if($("#cancelPick")) $("#cancelPick").onclick=()=>{ appState.view = activeRecord()?.dashboardUnlocked?"dashboard":"journey"; renderApp(); };
}
function renderSimulationTypePicker(){
  appState.view="picker-type";
  const team=appState.draftTeam || getFavoriteTeam();
  renderGuided(`
    ${renderIntroNav("type-picker")}
    <div class="max-w-6xl mx-auto guided-enter">
      <div class="text-center max-w-3xl mx-auto">
        <div class="mb-4">${flag(team,'flag-xl')}</div>
        <h1 class="font-display font-extrabold text-4xl sm:text-6xl leading-[1.02]">Escolha o tipo de <span class="grad-text">simulação</span></h1>
        <p class="mt-4 text-slate-600 text-lg">Cada estilo muda o tom da Copa, as zebras, o peso dos favoritos e o roteiro do torneio.</p>
      </div>
      <div class="grid lg:grid-cols-3 gap-5 mt-9">
        ${PROFILE_ORDER.map((type,i)=>{
          const p=profileFor(type);
          const bullets = type==="realistic"
            ? ["Favoritos tendem a ir mais longe","Placares mais controlados","Elencos profundos e técnicos pesam mais"]
            : type==="epic"
              ? ["Craques decidem jogos grandes","Clássicos e finais ganham peso narrativo","Mais viradas, prorrogações e legado"]
              : ["Mais zebras e eliminações chocantes","Mais pênaltis e gols no fim","Seleções médias podem crescer muito"];
          return `<button class="type-pick-card ${p.className} guided-card rounded-[2rem] p-6 text-left guided-stagger" style="--i:${i}" data-type="${type}">
            ${renderSimulationTypeBadge(type)}
            <h2 class="mt-5 font-display font-extrabold text-2xl">${p.label}</h2>
            <p class="mt-2 text-slate-600 leading-relaxed">${p.description}</p>
            <div class="mt-5 space-y-2">${bullets.map(b=>`<div class="flex gap-2 text-sm font-semibold text-slate-600">${ic('check-circle-2','w-4 h-4')} ${b}</div>`).join("")}</div>
          </button>`;
        }).join("")}
      </div>
      <div class="mt-7 text-center">
        <button id="backToTeams" class="glass rounded-2xl px-5 py-3 font-bold text-slate-600">Trocar seleção</button>
      </div>
    </div>`);
  document.querySelectorAll("[data-type]").forEach(card=>card.onclick=()=>{
    commitSimulation(team, card.dataset.type);
  });
  $("#backToTeams").onclick=startNewSimulation;
}
function renderFavoriteTeamJourney(){
  appState.view="journey";
  const record=activeRecord();
  if(!record){ startNewSimulation(); return; }
  const team=record.favoriteTeam, type=record.type, profile=profileFor(type);
  const sim=simObjFor(record);
  const matches=getTeamMatches(sim,team);
  const revealed=Math.min(record.revealed, matches.length);
  const finished = revealed>=matches.length;
  if(finished) { record.finished=true; persistSims(); }
  // status SEM SPOILER: só revela o desfecho quando a jornada termina
  let statusBox;
  if(finished){
    const cs=campaignSummary(sim,team);
    statusBox=`<div class="rounded-3xl p-5 ${cs.status==="champion"?'bg-gold-500/15 border border-gold-400/40':'bg-usared/10 border border-usared/20'}">
      <div class="font-display font-extrabold text-xl">${cs.title}</div><p class="mt-2 text-slate-600 leading-relaxed">${cs.text}</p></div>`;
  } else if(revealed===0){
    statusBox=`<div class="rounded-3xl p-5 bg-usablue/8 border border-usablue/20">
      <div class="font-display font-extrabold text-xl">Sua Copa começa agora.</div>
      <p class="mt-2 text-slate-600 leading-relaxed">Os resultados serão revelados <b>jogo a jogo</b>. Nada de placares, campeão ou chaveamento antes da hora — só o que você viver.</p></div>`;
  } else {
    statusBox=`<div class="rounded-3xl p-5 bg-mxgreen/10 border border-mxgreen/20">
      <div class="font-display font-extrabold text-xl">Campanha em andamento</div>
      <p class="mt-2 text-slate-600 leading-relaxed">${revealed} jogo(s) disputado(s). Simule o próximo para continuar a jornada de ${flag(team)} ${team}.</p></div>`;
  }
  renderGuided(`
    ${renderIntroNav("journey")}
    <div class="max-w-7xl mx-auto grid xl:grid-cols-[.86fr_1.14fr] gap-6 items-start">
      <div class="guided-card rounded-[2rem] p-7 sm:p-9 guided-enter ${finished&&sim.champion===team?'confetti-soft':''}">
        <div class="flex items-center justify-between gap-4">
          ${renderSimulationTypeBadge(type)}
          <button id="journeyTypeBack" class="text-xs font-extrabold text-slate-500 hover:text-ink">Trocar tipo</button>
        </div>
        <div class="mt-8 flex items-center gap-5">
          ${flag(team,'flag-xl')}
          <div>
            <h1 class="font-display font-extrabold text-4xl leading-tight">${team} na Simulação ${profile.label}</h1>
            <p class="mt-2 text-slate-500 font-semibold">${teamMeta[team].confederation} · ${teamMeta[team].status} · técnico: ${TEAMS[team].coach}</p>
          </div>
        </div>
        <div class="mt-7">${statusBox}</div>
        <div class="mt-7 grid sm:grid-cols-2 gap-3">
          <button id="startJourney" class="btn-premium text-white font-extrabold rounded-2xl px-5 py-3.5" ${matches.length && !finished?'':'disabled'}>${revealed===0?'Começar jornada':'Simular próximo jogo'}</button>
          <button id="askDashboard" class="glass rounded-2xl px-5 py-3.5 font-extrabold text-slate-700 disabled:opacity-40 disabled:pointer-events-none" ${finished?'':'disabled'} title="${finished?'':'Disponível ao fim da jornada'}">Ver Copa completa</button>
        </div>
        ${savedSimsPanel()}
        <button id="resetGuidedSmall" class="mt-4 text-xs font-extrabold text-slate-400 hover:text-usared">Reiniciar progresso desta simulação</button>
      </div>
      <div class="guided-card rounded-[2rem] p-4 sm:p-5 guided-enter">
        <div class="mb-4">
          <div class="text-[11px] uppercase tracking-widest font-extrabold text-slate-400">Campanha de ${team}</div>
          <div class="font-display font-extrabold text-2xl">Jogo a jogo</div>
        </div>
        ${progressiveCampaign(record)}
      </div>
    </div>`);
  wireJourneyMatchButtons();
  document.querySelectorAll(".snap-btn").forEach(b=> b.onclick=()=>openSnapshot(b.dataset.snap, Number(b.dataset.idx)));
  document.querySelectorAll(".replay-btn").forEach(b=> b.onclick=()=>{ const i=Number(b.dataset.idx); if(matches[i]) openMatchSimulator(matches[i], i); });
  document.querySelectorAll(".switch-sim").forEach(b=> b.onclick=()=>{ setActiveSimulation(b.dataset.id); renderApp(); });
  document.querySelectorAll(".del-sim").forEach(b=> b.onclick=()=>{ if(confirm("Excluir esta simulação?")){ deleteSimulation(b.dataset.id); renderApp(); } });
  if($("#newSimFromJourney")) $("#newSimFromJourney").onclick=startNewSimulation;
  if($("#campaignDashboard")) $("#campaignDashboard").onclick=openFullDashboard;
  $("#startJourney").onclick=()=>{ if(matches[revealed] && !finished) openMatchSimulator(matches[revealed], revealed); };
  $("#askDashboard").onclick=()=>{ if(finished) renderDashboardConfirmation(); };
  $("#journeyTypeBack").onclick=changeSimulationType;
  $("#resetGuidedSmall").onclick=resetGuidedExperience;
}
function renderDashboardConfirmation(){
  const team=getFavoriteTeam();
  renderGuided(`
    ${renderIntroNav("dashboard")}
    <div class="max-w-3xl mx-auto guided-card rounded-[2rem] p-8 sm:p-10 text-center guided-enter">
      <div class="mx-auto w-16 h-16 rounded-3xl grid place-items-center text-white mb-5" style="background:var(--grad-2026)">${ic('layout-dashboard','w-8 h-8')}</div>
      <h1 class="font-display font-extrabold text-4xl sm:text-5xl">Agora deseja abrir o dashboard completo da Copa?</h1>
      <p class="mt-4 text-slate-600 text-lg leading-relaxed">Você acompanhou a jornada de ${flag(team)} ${team}. Agora pode explorar todos os grupos, jogos, chaveamentos, estatísticas e histórias da simulação.</p>
      <div class="mt-8 flex flex-col sm:flex-row justify-center gap-3">
        <button id="openDashboardNow" class="btn-premium text-white font-extrabold rounded-2xl px-6 py-3.5">Abrir dashboard completo</button>
        <button id="keepJourney" class="glass rounded-2xl px-6 py-3.5 font-extrabold text-slate-700">Continuar vendo minha seleção</button>
      </div>
    </div>`);
  $("#openDashboardNow").onclick=openFullDashboard;
  $("#keepJourney").onclick=renderFavoriteTeamJourney;
}
function renderFullDashboard(){
  setGuidedVisibility(false);
  const r=activeRecord(); if(r){ r.dashboardUnlocked=true; persistSims(); }
  syncDashboardState();
  renderAll();
}
function renderApp(){
  if(appState.draftTeam && !TEAMS[appState.draftTeam]) appState.draftTeam=null;
  if(appState.view==="picker-team"){ renderTeamPickerIntro(); return; }
  if(appState.view==="picker-type"){ renderSimulationTypePicker(); return; }
  if(!appState.sims.length){ appState.view="picker-team"; renderTeamPickerIntro(); return; }
  const r=activeRecord();
  if(!r){ appState.view="picker-team"; renderTeamPickerIntro(); return; }
  if(appState.view==="dashboard" || r.dashboardUnlocked){ renderFullDashboard(); return; }
  renderFavoriteTeamJourney();
}
function wireJourneyMatchButtons(){
  document.querySelectorAll(".simulate-team-match").forEach(btn=>{
    btn.onclick=()=>{
      const matches=getTeamMatches(currentSim(), getFavoriteTeam());
      const idx=Number(btn.dataset.matchIndex||0);
      if(matches[idx]) openMatchSimulator(matches[idx], idx);
    };
  });
}

/* ---- TABS = simulações salvas (trocar / excluir / nova) ---- */
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
  const z=zebraTeam(s);
  const cards=[
    ["trophy","text-gold-600","Campeão",`${flag(s.champion)} ${s.champion}`,`Técnico: ${TEAMS[s.champion].coach}`,"border-gold-500/40"],
    ["medal","text-slate-400","Vice-campeão",`${flag(s.runnerUp)} ${s.runnerUp}`,"Caiu na final","border-slate-300"],
    ["award","text-amber-700","Terceiro lugar",`${flag(s.thirdPlace)} ${s.thirdPlace}`,`4º: ${flag(s.fourthPlace)} ${s.fourthPlace}`,"border-amber-700/30"],
    ["star","text-usablue","Melhor jogador",`${a.bestPlayer.player}`,`${flag(a.bestPlayer.team)} ${a.bestPlayer.team} · ${a.bestPlayer.goals} gols`,"border-usablue/30"],
    ["crosshair","text-usared","Artilheiro",`${a.topScorer.player}`,`${flag(a.topScorer.team)} ${a.topScorer.team} · ${a.topScorer.goals} gols`,"border-usared/30"],
    ["sparkles","text-mxgreen","Melhor jovem",`${a.bestYoung.player}`,`${flag(a.bestYoung.team)} ${a.bestYoung.team}`,"border-mxgreen/30"],
    ["hand","text-slate-500","Melhor goleiro",`${a.bestGK?a.bestGK.player:'—'}`,`${a.bestGK?flag(a.bestGK.team)+' '+a.bestGK.team+' · '+a.bestGK.conceded+' sofridos':''}`,"border-slate-300"],
    ["zap","text-emerald-500","Grande zebra positiva",`${flag(z.team)} ${z.team}`, z.sub,"border-emerald-400/40"],
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
     <div class="text-sm text-slate-500 mt-1">${bm.city} · ${bm.venue} · ${bm.ga+bm.gb} gols${bm.pens?' · decidido nos pênaltis':bm.aet?' · na prorrogação':''}</div>`));

  // podium / final banner
  const f=s.knockout.final;
  $("#podium").innerHTML =
    `<div class="reveal glass champ-glow rounded-3xl p-6 sm:p-8 shadow-lift overflow-hidden relative bg-gradient-to-br from-gold-400/15 via-white/40 to-gold-500/10">
       <div class="absolute -right-8 -top-8 opacity-[0.07] select-none">${ic('trophy','w-40 h-40 text-gold-600')}</div>
       <div class="text-xs font-bold uppercase tracking-[.2em] text-gold-600">A Grande Final · ${f.city}</div>
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
  const homeSeed = m.stage==="Fase de 32" ? slotLabel(m.A) : "";
  const awaySeed = m.stage==="Fase de 32" ? slotLabel(m.B) : "";
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
  const homeSeed = m.stage==="Fase de 32" ? slotLabel(m.A) : "";
  const awaySeed = m.stage==="Fase de 32" ? slotLabel(m.B) : "";
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
  const rounds = [
    ["Fase de 32", k.R32],
    ["Oitavas",    k.R16],
    ["Quartas",    k.QF],
    ["Semifinais", k.SF],
    ["Final",      [k.final]],
  ];
  const cols = rounds.map(([title,ms],ri)=>{
    const isFinal = ri===rounds.length-1;
    const champKnown = isFinal && champ && modeFn(k.final)==='full';
    return `<div class="bracket-round ${isFinal?'r-final':''}">
      <div class="bracket-round-title">${title}</div>
      <div class="bracket-round-matches">${ms.map(m=>bracketMatchCard(m,champ,modeFn(m))).join("")}</div>
      ${isFinal&&champKnown?`<div class="bracket-champ-banner">
        <div class="text-[10px] uppercase tracking-widest font-extrabold text-gold-600 flex items-center justify-center gap-1.5">${ic('trophy','w-3.5 h-3.5')} Campeão</div>
        <div class="font-display font-extrabold text-base mt-1 flex items-center justify-center gap-2">${flag(champ)} ${champ}</div>
      </div>`:''}
    </div>`;
  }).join("");
  return `<div class="bracket-scroll"><div class="bracket-wrapper">${cols}</div></div>`;
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
    <div class="text-[11px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">${title} · ${m.city}</div>
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
    <div class="text-center text-xs text-slate-400 mt-2">${m.city} · ${m.venue}</div>
    ${goalChips(m)}`;
  $("#modalBox").querySelector("[data-close]").onclick=closeModal;
  modal.classList.remove("hidden"); modal.classList.add("flex");
}
function closeModal(){ const m=$("#matchModal"); if(m){ m.classList.add("hidden"); m.classList.remove("flex"); } }

function normalizeGoalMinute(minute, match=null){
  if(typeof minute==="string"){
    const clean=minute.replace("'","");
    if(clean.includes("+")){
      const [base,add]=clean.split("+").map(Number);
      return {value:base+add, display:`${base}+${add}'`};
    }
    const n=Number(clean);
    return {value:n, display:`${n}'`};
  }
  const n=Number(minute)||0;
  if(!match?.aet && n>90) return {value:n, display:`90+${n-90}'`};
  if(!match?.aet && n>45 && n<50) return {value:n, display:`45+${n-45}'`};
  return {value:n, display:`${n}'`};
}
function matchPhaseLabel(minute, match){
  if(match.aet && minute>105) return "Prorrogação · 2º tempo";
  if(match.aet && minute>90) return "Prorrogação";
  if(minute>=46) return "2º tempo";
  if(minute>=45) return "Intervalo";
  return "1º tempo";
}
function openMatchSimulator(match, journeyIndex=0){
  closeModal();
  appState.currentSimulatedMatch={match, journeyIndex};
  let modal=$("#matchSimulator");
  if(!modal){
    modal=el("div","fixed inset-0 z-[80] hidden items-center justify-center p-3 sm:p-5");
    modal.id="matchSimulator";
    modal.innerHTML=`<div class="absolute inset-0 bg-ink/55 backdrop-blur-xl" data-close></div>
      <div id="matchSimulatorBox" class="relative guided-card rounded-[2rem] shadow-lift w-full max-w-5xl max-h-[94vh] overflow-y-auto p-4 sm:p-6 swap"></div>`;
    document.body.appendChild(modal);
    modal.addEventListener("click",e=>{ if(e.target.dataset.close!==undefined) closeMatchSimulator(); });
  }
  const type=currentSim()?.simulationType || activeRecord()?.type || "realistic";
  const profile=profileFor(type);
  const fav=getFavoriteTeam();
  const nextMatch=getTeamMatches(currentSim(),fav)[journeyIndex+1];
  $("#matchSimulatorBox").innerHTML=`
    <button class="absolute top-4 right-4 text-slate-400 hover:text-ink" data-close>✕</button>
    <div class="flex flex-wrap items-center justify-between gap-3 pr-8">
      <div>
        <div class="text-[11px] uppercase tracking-widest font-extrabold text-slate-400">${match.matchNo?`M${match.matchNo} · `:''}${match.stage}</div>
        <div class="text-sm text-slate-500 font-semibold mt-1">${match.city} · ${match.venue}</div>
      </div>
      ${renderSimulationTypeBadge(type)}
    </div>
    <div class="mt-6 grid grid-cols-[1fr_auto_1fr] items-center gap-3 sm:gap-6">
      <div id="simHomeSide" class="match-side rounded-3xl p-4 bg-white/60 text-right">
        <div class="flex justify-end mb-2">${flag(match.home,'flag-xl')}</div>
        <div class="font-display font-extrabold text-xl sm:text-3xl">${match.home}</div>
      </div>
      <div class="text-center">
        <div id="simClock" class="text-xs uppercase tracking-widest font-extrabold text-slate-400">00'</div>
        <div id="simScore" class="match-sim-score mt-2 rounded-[1.5rem] bg-ink text-white px-5 sm:px-8 py-3 font-display font-extrabold text-3xl sm:text-5xl tnum">0 x 0</div>
        <div id="simPhase" class="mt-2 text-xs font-extrabold text-slate-500">${matchPhaseLabel(0,match)}</div>
      </div>
      <div id="simAwaySide" class="match-side rounded-3xl p-4 bg-white/60 text-left">
        <div class="flex justify-start mb-2">${flag(match.away,'flag-xl')}</div>
        <div class="font-display font-extrabold text-xl sm:text-3xl">${match.away}</div>
      </div>
    </div>
    <div class="mt-6 h-3 rounded-full bg-slate-200/70 overflow-hidden">
      <div id="simProgress" class="h-full rounded-full" style="width:0%;background:linear-gradient(90deg,${profile.color},#1f7a4d,#c8962f)"></div>
    </div>
    <div class="mt-5 grid lg:grid-cols-[1fr_.78fr] gap-4">
      <div class="rounded-3xl bg-white/55 border border-white/70 p-4">
        <div class="text-[11px] uppercase tracking-widest font-extrabold text-slate-400 mb-3">Eventos da partida</div>
        <div id="simTimeline" class="space-y-2 min-h-[220px]"></div>
      </div>
      <div class="rounded-3xl bg-white/55 border border-white/70 p-4">
        <div class="text-[11px] uppercase tracking-widest font-extrabold text-slate-400">Resumo final</div>
        <div id="simSummary" class="mt-3 text-sm text-slate-600 leading-relaxed">A transmissão acelerada vai começar. O placar final só aparece quando os eventos acontecerem.</div>
      </div>
    </div>
    <div id="pkMount" class="mt-5"></div>
    <div class="mt-5 flex flex-wrap justify-between gap-3">
      <div class="flex flex-wrap gap-2">
        <button id="restartMatchSim" class="glass rounded-2xl px-4 py-2.5 font-bold text-slate-700">Reiniciar simulação</button>
        <button id="closeMatchSim" class="glass rounded-2xl px-4 py-2.5 font-bold text-slate-700">Fechar</button>
      </div>
      <button id="backToJourney" class="btn-premium text-white rounded-2xl px-4 py-2.5 font-bold">Voltar à jornada</button>
    </div>`;
  const backToJourney=()=>{ closeMatchSimulator(); renderFavoriteTeamJourney(); };
  $("#matchSimulatorBox").querySelector("[data-close]").onclick=backToJourney;
  $("#restartMatchSim").onclick=()=>simulateMatch(match);
  $("#closeMatchSim").onclick=backToJourney;
  $("#backToJourney").onclick=backToJourney;
  modal.classList.remove("hidden"); modal.classList.add("flex");
  setTimeout(()=>simulateMatch(match), 160);
  paintIcons();
}
function simulateMatch(match){
  if(appState.matchTimer) clearInterval(appState.matchTimer);
  stopShootout();                                  // limpa disputa anterior, se houver
  const pkMount=$("#pkMount"); if(pkMount) pkMount.innerHTML="";
  appState.matchAnimationStarted=true;
  const totalMs = match.pens ? 28000 : match.aet ? 25000 : 20000;
  const virtualMax = match.aet ? 120 : 90;
  const goals = (match.goals||[]).map(g=>({...g, norm:normalizeGoalMinute(g.minute, match)})).sort((a,b)=>a.norm.value-b.norm.value);
  let shown=0, homeGoals=0, awayGoals=0;
  const scoreEl=$("#simScore"), clockEl=$("#simClock"), progressEl=$("#simProgress"), timeline=$("#simTimeline"), summary=$("#simSummary");
  const homeSide=$("#simHomeSide"), awaySide=$("#simAwaySide"), phaseEl=$("#simPhase");
  timeline.innerHTML = `<div class="goal-event rounded-2xl bg-slate-100/80 px-4 py-3 text-sm font-semibold text-slate-500">Apito inicial. A partida começa em ritmo acelerado.</div>`;
  summary.textContent = "Acompanhe os eventos surgindo no minuto correto da simulação.";
  const start=Date.now();
  function addEvent(html){
    timeline.insertAdjacentHTML("afterbegin",`<div class="goal-event rounded-2xl bg-white/80 border border-white/80 px-4 py-3 shadow-glass">${html}</div>`);
  }
  function flash(team){
    scoreEl.classList.remove("flash"); void scoreEl.offsetWidth; scoreEl.classList.add("flash");
    const side = team===match.home ? homeSide : awaySide;
    side.classList.remove("hot"); void side.offsetWidth; side.classList.add("hot");
  }
  appState.matchTimer=setInterval(()=>{
    const elapsed=Date.now()-start;
    const ratio=Math.min(1,elapsed/totalMs);
    const minute=Math.round(ratio*virtualMax);
    clockEl.textContent = `${String(minute).padStart(2,"0")}'`;
    phaseEl.textContent = matchPhaseLabel(minute, match);
    progressEl.style.width = `${Math.min(100,ratio*100)}%`;
    while(shown<goals.length && goals[shown].norm.value<=minute){
      const g=goals[shown++];
      if(g.team===match.home) homeGoals++; else awayGoals++;
      scoreEl.textContent = `${homeGoals} x ${awayGoals}`;
      flash(g.team);
      addEvent(`<div class="flex items-start gap-3">
        <div class="grid place-items-center w-9 h-9 rounded-full bg-mxgreen/12 text-mxgreen font-extrabold">⚽</div>
        <div>
          <div class="font-extrabold text-slate-800">${g.norm.display} — ${g.player} marca para ${flag(g.team)} ${g.team}</div>
          <div class="text-sm text-slate-500">${g.type}${g.assist?` · assistência de ${g.assist}`:""} · placar ${homeGoals} x ${awayGoals}</div>
        </div>
      </div>`);
    }
    if(ratio>=1){
      clearInterval(appState.matchTimer);
      appState.matchTimer=null;
      scoreEl.textContent=`${match.ga} x ${match.gb}`;
      clockEl.textContent=match.aet?"120'":"90'";
      phaseEl.textContent="Fim de jogo";
      progressEl.style.width="100%";
      // revela este jogo na jornada (idempotente; só avança o progresso)
      const item=appState.currentSimulatedMatch;
      if(item && item.match===match) markMatchRevealed(activeRecord(), item.journeyIndex);
      if(!goals.length) addEvent(`<div class="font-extrabold text-slate-700">Fim do tempo${match.aet?' (após prorrogação)':''}.</div><div class="text-sm text-slate-500">${match.penalties?'Empate persiste — a decisão vai para os pênaltis.':'Defesas dominaram e ninguém abriu o placar.'}</div>`);
      if(match.penalties){
        clockEl.textContent = match.aet?"120'":"90'";
        addEvent(`<div class="font-extrabold text-slate-700 flex items-center gap-2">${ic('target','w-4 h-4 text-usared')} Decisão por pênaltis</div><div class="text-sm text-slate-500">Tudo igual em ${scoreLine({...match,pens:null})}. As cobranças vão definir quem avança.</div>`);
        summary.innerHTML = `Empate até o fim. A vaga será decidida nas cobranças de pênalti — acompanhe abaixo, cobrança a cobrança.`;
        startShootout(match);
      } else {
        const fav=getFavoriteTeam();
        const favPlayed=match.home===fav||match.away===fav;
        const favWon=favPlayed && getMatchWinnerTeam(match)===fav;
        summary.innerHTML = `${flag(match.winner?.team||getMatchWinnerTeam(match)||match.home)} <b>${match.winner?.team||getMatchWinnerTeam(match)||"Empate"}</b> ${getMatchWinnerTeam(match)?"vence a partida":"fica no empate"} por <b>${scoreLine(match)}</b> em ${match.city}. ${favPlayed?(favWon?"Sua seleção venceu este capítulo da jornada.":"Sua seleção não venceu este jogo."):""}`;
        if(favPlayed && favWon) celebrateConfetti();
      }
    }
  },120);
}
/* =================================================================
   DISPUTA DE PÊNALTIS ANIMADA (estilo simulador de futebol)
   -----------------------------------------------------------------
   >>> Ajuste a duração de cada cobrança nestas 3 constantes <<<
   Total por cobrança ≈ PK_PREP_MS + PK_SHOT_MS + PK_RESULT_MS.
   Para o ritmo de 5s/5s do enunciado: PK_PREP_MS=5000, PK_RESULT_MS=5000.
   ================================================================= */
const PK_PREP_MS   = 1700;   // "Fulano se prepara para a cobrança…"
const PK_SHOT_MS   = 800;    // animação do chute entrando no gol
const PK_RESULT_MS = 1450;   // exibe o resultado antes da próxima cobrança
// posição (% dentro do mini-gol) de cada zona de chute
const PK_ZONE_XY = {
  "top-left":[20,30],"top-center":[50,25],"top-right":[80,30],
  "bottom-left":[22,72],"bottom-center":[50,77],"bottom-right":[78,72],
};
function stopShootout(){
  (appState.penaltyTimers||[]).forEach(t=>clearTimeout(t));
  appState.penaltyTimers=[];
}
function startShootout(match){
  stopShootout();
  const sh=match.penalties; if(!sh) return;
  const mount=$("#pkMount"); if(!mount) return;
  const fav=getFavoriteTeam(), home=match.home, away=match.away;
  mount.innerHTML = `
    <div class="pk-wrap">
      <div class="text-[11px] uppercase tracking-widest font-extrabold text-slate-400 mb-3 flex items-center gap-2">${ic('target','w-4 h-4 text-usared')} Disputa de pênaltis</div>
      <div class="pk-scoreline">
        <div id="pkSideHome" class="pk-side text-right">
          <div class="flex items-center justify-end gap-2 font-display font-extrabold">${home} ${flag(home)}</div>
          <div id="pkDotsHome" class="pk-dots justify-end"></div>
        </div>
        <div class="pk-bigscore font-display text-3xl sm:text-4xl"><span id="pkScoreH">0</span> <span class="text-slate-300">x</span> <span id="pkScoreA">0</span></div>
        <div id="pkSideAway" class="pk-side text-left">
          <div class="flex items-center gap-2 font-display font-extrabold">${flag(away)} ${away}</div>
          <div id="pkDotsAway" class="pk-dots"></div>
        </div>
      </div>
      <div class="mt-4 grid sm:grid-cols-[auto_1fr] gap-4 items-center">
        <div class="pk-goal"><div class="absolute inset-0" id="pkGoalShots"></div></div>
        <div class="text-center sm:text-left">
          <div id="pkKicker" class="pk-kicker text-slate-600 min-h-[28px]">Preparando a disputa…</div>
          <div id="pkResult" class="mt-2 min-h-[30px]"></div>
          <div id="pkRound" class="mt-1 text-[11px] uppercase tracking-widest font-extrabold text-slate-400"></div>
        </div>
      </div>
    </div>`;
  paintIcons();
  const homeKicks=sh.kicks.filter(k=>k.team===home), awayKicks=sh.kicks.filter(k=>k.team===away);
  const dotsHome=$("#pkDotsHome"), dotsAway=$("#pkDotsAway");
  for(let i=0;i<Math.max(5,homeKicks.length);i++) dotsHome.insertAdjacentHTML("beforeend",`<span class="pk-dot" data-h="${i}"></span>`);
  for(let i=0;i<Math.max(5,awayKicks.length);i++) dotsAway.insertAdjacentHTML("beforeend",`<span class="pk-dot" data-a="${i}"></span>`);
  const goalShots=$("#pkGoalShots");
  let hUsed=0,aUsed=0,hScore=0,aScore=0;
  const wait=ms=>new Promise(res=>{ const t=setTimeout(res,ms); appState.penaltyTimers.push(t); });
  (async()=>{
    for(let i=0;i<sh.kicks.length;i++){
      const k=sh.kicks[i], isHome=k.team===home;
      $("#pkSideHome").classList.toggle("active",isHome);
      $("#pkSideAway").classList.toggle("active",!isHome);
      $("#pkRound").innerHTML = `${i>=10?'Cobranças alternadas · ':''}Cobrança ${i+1}`;
      $("#pkKicker").className="pk-kicker prep text-slate-700";
      $("#pkKicker").innerHTML = `${flag(k.team)} <b>${k.player}</b> se prepara para a cobrança…${k.decisive?` <span class="text-gold-600 font-extrabold">· decisiva</span>`:''}`;
      $("#pkResult").innerHTML="";
      await wait(PK_PREP_MS);
      const [zx,zy]=PK_ZONE_XY[k.shotZone]||[50,50];
      const shot=document.createElement("div");
      shot.className=`pk-shot ${k.scored?'goal':'miss'}`;
      shot.style.left=zx+"%"; shot.style.top=zy+"%";
      shot.textContent = k.scored ? "●" : "✕";
      goalShots.appendChild(shot);
      requestAnimationFrame(()=>shot.classList.add("show"));
      $("#pkKicker").className="pk-kicker text-slate-500";
      await wait(PK_SHOT_MS);
      if(k.scored){ if(isHome) hScore++; else aScore++; }
      $("#pkScoreH").textContent=hScore; $("#pkScoreA").textContent=aScore;
      const dot=mount.querySelector(isHome?`[data-h="${hUsed}"]`:`[data-a="${aUsed}"]`);
      if(dot) dot.classList.add(k.scored?"goal":"miss");
      if(isHome) hUsed++; else aUsed++;
      $("#pkResult").innerHTML = `<span class="pk-result-badge ${k.scored?'goal':'miss'}">${ic(k.scored?'check':'x','w-4 h-4')} ${k.result}</span>`;
      paintIcons();
      await wait(PK_RESULT_MS);
    }
    $("#pkSideHome").classList.remove("active"); $("#pkSideAway").classList.remove("active");
    const winner=sh.winner;
    $("#pkKicker").className="pk-kicker text-slate-800";
    $("#pkKicker").innerHTML = `${flag(winner)} <b>${winner}</b> vence a disputa por ${sh.homeScore} x ${sh.awayScore}!`;
    $("#pkRound").textContent="Fim da disputa";
    const box=$("#matchSimulatorBox"); if(box && winner===match.winner?.team) box.classList.add("pk-decisive");
    const summary=$("#simSummary");
    const favPlayed=home===fav||away===fav, favWon=favPlayed&&winner===fav;
    if(summary) summary.innerHTML = `${flag(winner)} <b>${winner}</b> avança nos pênaltis por <b>${sh.homeScore} x ${sh.awayScore}</b> (no tempo normal, ${match.ga}–${match.gb}). ${favPlayed?(favWon?'Sua seleção sobreviveu ao drama das cobranças!':'Sua seleção caiu na loteria dos pênaltis.'):''}`;
    if(favWon) celebrateConfetti();
  })();
}
function celebrateConfetti(){
  const box=$("#matchSimulatorBox"); if(!box) return;
  const colors=["#0a3161","#b31942","#1f7a4d","#c8962f","#e9b949"];
  for(let i=0;i<48;i++){
    const c=document.createElement("div");
    c.className="confetti-pc"; c.style.left=Math.random()*100+"%";
    c.style.background=colors[i%colors.length];
    c.style.animationDuration=(1.6+Math.random()*1.4)+"s";
    c.style.animationDelay=(Math.random()*0.4)+"s";
    box.appendChild(c); setTimeout(()=>c.remove(),3400);
  }
}
function closeMatchSimulator(){
  if(appState.matchTimer) clearInterval(appState.matchTimer);
  appState.matchTimer=null;
  stopShootout();
  const modal=$("#matchSimulator");
  if(modal){ modal.classList.add("hidden"); modal.classList.remove("flex"); }
}
function resetMatchSimulator(){
  const item=appState.currentSimulatedMatch;
  if(item) simulateMatch(item.match);
}
function goToNextFavoriteTeamMatch(){
  const item=appState.currentSimulatedMatch;
  const matches=getTeamMatches(currentSim(), getFavoriteTeam());
  const next=(item?.journeyIndex ?? -1)+1;
  if(matches[next]) openMatchSimulator(matches[next], next);
}

/* ---- NARRATIVE ---- */
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

/* =================================================================
   RENDER ALL + interações
   ================================================================= */
function renderAll(){
  renderTabs(); renderHeroCards(); renderSimulationTypeControls("heroTypeControls", true);
  renderFavoriteTeamDashboard(); renderOverview(); renderGroups();
  renderMatches(); renderThirds(); renderBracket(); renderNarrative(); renderStats();
  paintIcons();      // converte todos os <i data-lucide> em SVG
  observeReveals();
}
function setActive(i){
  const rec=appState.sims[i]; if(!rec) return;
  setActiveSimulation(rec.id);
  syncDashboardState();
  document.querySelectorAll("main section").forEach(s=>{ s.classList.remove("swap"); void s.offsetWidth; s.classList.add("swap"); });
  flashLoader();
  renderAll();
}

/* ---- group filter options ---- */
function fillGroupFilter(){
  const sel=$("#filterGroup");
  sel.innerHTML = `<option value="all">Todos os grupos</option>` +
    GROUPS.map(([L])=>`<option value="${L}">Grupo ${L}</option>`).join("");
}

/* ---- gerar uma NOVA simulação salva ----
   Com seleção+tipo definidos (ex.: botão "trocar tipo" da jornada), cria
   direto uma nova simulação com a mesma seleção; senão abre o assistente. */
function generateSimulation(type){
  const team=getFavoriteTeam();
  if(!team){ startNewSimulation(); return; }
  if(!type){ appState.draftTeam=team; appState.view="picker-type"; renderSimulationTypePicker(); return; }
  commitSimulation(team, type);
}
// botão "Nova simulação" do dashboard/nav → assistente de criação do zero
function generateNew(){ startNewSimulation(); }

/* ---- loading bar ---- */
function flashLoader(){
  const l=$("#loader");
  l.style.opacity="1"; l.style.width="0";
  requestAnimationFrame(()=>{ l.style.width="78%"; });
  setTimeout(()=>{ l.style.width="100%"; setTimeout(()=>{ l.style.opacity="0"; l.style.width="0"; },300); }, 420);
}

/* ---- reveal on scroll (robust) ----
   Synchronous pass reveals everything already in/above the viewport
   (works even without timers); IntersectionObserver handles the rest
   as the user scrolls. Any failure falls back to fully visible. */
let revealObs;
function revealInView(){
  const vh = (window.innerHeight || 800) * 1.2;
  document.querySelectorAll(".reveal:not(.in)").forEach(e=>{
    const r = e.getBoundingClientRect();
    if(r.top < vh) e.classList.add("in");
  });
}
function observeReveals(){
  if(!("IntersectionObserver" in window)){
    document.querySelectorAll(".reveal").forEach(e=>e.classList.add("in"));
    return;
  }
  if(!revealObs){
    revealObs=new IntersectionObserver((es)=>{ es.forEach(e=>{ if(e.isIntersecting){ e.target.classList.add("in"); revealObs.unobserve(e.target);} }); },{threshold:.05, rootMargin:"0px 0px -4% 0px"});
  }
  document.querySelectorAll(".reveal:not(.in)").forEach(e=>revealObs.observe(e));
  revealInView();                       // immediate above-the-fold reveal
  requestAnimationFrame(revealInView);  // catch post-layout positions
}
// extra safety nets in case scroll/IO never fire
window.addEventListener("scroll", ()=>revealInView(), {passive:true});
window.addEventListener("load", ()=> setTimeout(()=>document.querySelectorAll(".reveal").forEach(e=>e.classList.add("in")), 1400));

/* ---- scroll spy for nav ---- */
function setupScrollSpy(){
  const ids=["minha","overview","grupos","jogos","terceiros","mata","roteiro","stats"];
  const links=[...document.querySelectorAll(".nav-link")];
  const obs=new IntersectionObserver((es)=>{
    es.forEach(e=>{ if(e.isIntersecting){ links.forEach(l=>l.classList.toggle("active", l.getAttribute("href")==="#"+e.target.id)); } });
  },{rootMargin:"-45% 0px -50% 0px"});
  ids.forEach(id=>{ const s=document.getElementById(id); if(s) obs.observe(s); });
}

/* =================================================================
   INIT
   ================================================================= */
function init(){
  // progressive-enhancement flag: enables reveal hiding only when JS runs
  document.documentElement.classList.add("js");
  // carrega simulações salvas pelo usuário (não há mais 3 simulações padrão)
  loadSims();
  if(appState.sims.length){
    syncDashboardState();
    appState.view = activeRecord()?.dashboardUnlocked ? "dashboard" : "journey";
  } else {
    appState.view = "picker-team";
  }
  fillGroupFilter();

  // events
  $("#filterGroup").onchange=renderMatches;
  $("#filterRound").onchange=renderMatches;
  $("#heroGenerate").onclick=generateNew;
  $("#navGenerate").onclick=generateNew;
  $("#mobGenerate").onclick=()=>{ $("#mobMenu").classList.add("hidden"); generateNew(); };
  $("#mobBtn").onclick=()=> $("#mobMenu").classList.toggle("hidden");
  document.querySelectorAll("#mobMenu a").forEach(a=> a.onclick=()=> $("#mobMenu").classList.add("hidden"));
  document.addEventListener("keydown",e=>{ if(e.key==="Escape") closeModal(); });

  renderApp();
  setupScrollSpy();
  revealInView();
}
document.addEventListener("DOMContentLoaded", ()=>{
  try { init(); }
  catch(err){
    console.error("Falha ao iniciar a simulação:", err);
    // garante que o conteúdo apareça mesmo em caso de erro
    document.documentElement.classList.remove("js");
    document.querySelectorAll(".reveal").forEach(e=>e.classList.add("in"));
  }
});

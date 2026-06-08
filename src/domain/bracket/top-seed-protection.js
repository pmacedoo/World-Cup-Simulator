"use strict";

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
function topSeedRuleFor(teamA, teamB, stageIdx, protectedTeams){
  const A = FIFA_TOP4_BY_TEAM[teamA], B = FIFA_TOP4_BY_TEAM[teamB];
  if(!A || !B) return null;
  if(!protectedTeams?.has(teamA) || !protectedTeams?.has(teamB)) return null;
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
      protectedPath:true,
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

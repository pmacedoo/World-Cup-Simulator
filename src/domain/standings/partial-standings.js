
/* =================================================================
   CLASSIFICAÇÃO PARCIAL DOS GRUPOS
   -----------------------------------------------------------------
   Recalcula a tabela de cada grupo contando apenas rodadas <= uptoRound
   e partidas liberadas pelo predicado visibleMatch.
   É a base da revelação progressiva: a jornada nunca mostra pontos de
   rodadas que o usuário ainda não viveu.
   Desempate parcial (sem fair play, que só existe na tabela final):
   pontos > saldo > gols pró > força (ovr).
   ================================================================= */

import { TEAMS } from "../../data/worldcup-data.js";
function partialStandings(sim, uptoRound, visibleMatch = () => true){
  const maxRound = Math.max(0, Math.min(uptoRound || 0, 3));
  return sim.groups.map(group => {
    const rows = {};
    group.teams.forEach(team => rows[team] = {team, P:0, J:0, V:0, E:0, D:0, GP:0, GC:0});
    const visibleMatches = group.matches.filter(m => (m.round || 0) <= maxRound && visibleMatch(m));
    visibleMatches.forEach(m => {
      const home = rows[m.home], away = rows[m.away];
      if(!home || !away) return;
      home.J++; away.J++;
      home.GP += m.ga; home.GC += m.gb;
      away.GP += m.gb; away.GC += m.ga;
      if(m.ga > m.gb){ home.V++; away.D++; home.P += 3; }
      else if(m.ga < m.gb){ away.V++; home.D++; away.P += 3; }
      else { home.E++; away.E++; home.P++; away.P++; }
    });
    const table = Object.values(rows)
      .map(r => ({...r, SG:r.GP - r.GC, ovr:TEAMS[r.team].ovr}))
      .sort((a, b) => b.P - a.P || b.SG - a.SG || b.GP - a.GP || b.ovr - a.ovr);
    table.forEach((r, i) => r.pos = i + 1);
    const played = visibleMatches.length
      ? Math.max(...visibleMatches.map(m => m.round || 0))
      : 0;
    return {letter: group.letter, table, played};
  });
}

export { partialStandings };

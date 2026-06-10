
/* =================================================================
   METADADOS DERIVADOS DAS SELEÇÕES
   -----------------------------------------------------------------
   Dados calculados uma única vez a partir de TEAMS e consumidos pela
   UI (seletor de seleções, dashboard e notícias da jornada).
   ================================================================= */

import { TEAMS } from "../../data/worldcup-data.js";
const HOST_TEAMS = ["México", "Canadá", "Estados Unidos"];

function teamStatus(team){
  const ovr = TEAMS[team].ovr;
  if(HOST_TEAMS.includes(team)) return "Anfitriã";
  if(ovr >= 88) return "Favorita";
  if(ovr >= 82) return "Candidata";
  if(ovr >= 76) return "Competitiva";
  return "Zebra";
}

function deriveTeamMeta(team){
  const data = TEAMS[team];
  // craques (tag "S") primeiro; sem craques, os maiores pesos de gol
  const stars = data.sq.filter(p => (p[3] || "").includes("S")).sort((a, b) => b[2] - a[2]);
  const byWeight = data.sq.slice().sort((a, b) => b[2] - a[2]);
  return {
    confederation: data.conf,
    strength: data.ovr,
    status: teamStatus(team),
    keyPlayers: (stars.length ? stars : byWeight).slice(0, 5).map(p => p[0]),
  };
}

const teamMeta = Object.fromEntries(Object.keys(TEAMS).map(t => [t, deriveTeamMeta(t)]));

export { teamMeta };

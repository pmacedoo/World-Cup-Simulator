"use strict";

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

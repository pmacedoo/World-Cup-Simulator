// =============================================================================
// ADAPTER: player-profiles.js -> estruturas que o motor consome
// -----------------------------------------------------------------------------
// player-profiles.js é a FONTE DA VERDADE. Aqui derivamos, por seleção:
//   - elenco rico  (name, group, positions[], overall, stats)
//   - melhor XI    (por formação)
//   - ovr do time  (baseline a partir do melhor XI)
//   - tupla legada [name, group, overall, tags] no formato que TEAMS.sq usa
//
// Decisão de migração: TEAMS deixa de ter sq/ovr próprios — eles passam a ser
// derivados daqui (ver worldcup-data.js). Isto também resolve o desencontro de
// nomes entre as duas bases, porque passa a existir UM só conjunto de nomes.
// =============================================================================

import { PLAYER_PROFILES } from "./player-profiles.js";

// Código de posição (PT) -> grupo do motor (GK/DF/MF/FW).
// ADD/ADE (alas) e SA (segundo atacante) só aparecem como posição secundária,
// mas mapeamos todos para robustez.
const POS_GROUP = {
  GL: "GK",
  ZAG: "DF", LD: "DF", LE: "DF",
  VOL: "MF", MC: "MF", MEI: "MF", ME: "MF", MD: "MF", ADD: "MF", ADE: "MF",
  ATA: "FW", PE: "FW", PD: "FW", SA: "FW",
};

// Propensão ofensiva por grupo: recupera o formato do antigo appValue
// (atacante alto, zagueiro baixo, goleiro zero) já que agora o índice 2 da
// tupla carrega o overall real. Usada para ponderar autoria de gols/assist.
const GROUP_ATTACK = { GK: 0, DF: 0.55, MF: 1.5, FW: 3.0 };

export function groupOf(positionCode) {
  return POS_GROUP[positionCode] || "MF";
}

// peso de gol de um jogador a partir de (grupo, overall): atacantes pesam mais,
// e qualidade amplifica. Recebe a tupla legada [name, group, overall, tags].
export function goalWeight(raw) {
  const group = raw[1];
  const overall = Number(raw[2] || 0);
  return (GROUP_ATTACK[group] || 0) * Math.pow(Math.max(overall, 40) / 70, 1.5);
}

export function playerKey(name) {
  return String(name || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

// ---- elenco rico por seleção (memoizado) ----
let _byNation = null;
function byNation() {
  if (_byNation) return _byNation;
  _byNation = {};
  for (const p of PLAYER_PROFILES) {
    const record = {
      name: p.name,
      nationality: p.nationality,
      positions: p.positions.slice(),
      group: groupOf(p.positions[0]),
      overall: Number(p.overall || 0),
      stats: Number(p.stats || 0),
    };
    (_byNation[p.nationality] = _byNation[p.nationality] || []).push(record);
  }
  return _byNation;
}

export function squadProfiles(nationality) {
  return (byNation()[nationality] || []).map(p => ({ ...p, positions: p.positions.slice() }));
}

export function nationsWithProfiles() {
  return Object.keys(byNation());
}

// slots por formação (espelha lineups.formationSlots; inline p/ evitar ciclo)
function slotsFromShape(shape) {
  const nums = String(shape || "4-3-3").match(/\d+/g)?.map(Number) || [4, 3, 3];
  return {
    GK: 1,
    DF: nums[0] || 4,
    MF: nums.length > 2 ? nums.slice(1, -1).reduce((s, n) => s + n, 0) : (nums[1] || 3),
    FW: nums[nums.length - 1] || 3,
  };
}

// melhor XI de uma seleção para uma formação: melhor por posição (overall),
// completa com os melhores de linha restantes.
export function bestEleven(nationality, shape = "4-3-3") {
  const ps = squadProfiles(nationality);
  if (!ps.length) return [];
  const slots = slotsFromShape(shape);
  const used = new Set();
  const xi = [];
  for (const g of ["GK", "DF", "MF", "FW"]) {
    ps.filter(p => p.group === g && !used.has(p.name))
      .sort((a, b) => b.overall - a.overall)
      .slice(0, slots[g])
      .forEach(p => { used.add(p.name); xi.push(p); });
  }
  if (xi.length < 11) {
    ps.filter(p => !used.has(p.name) && p.group !== "GK")
      .sort((a, b) => b.overall - a.overall)
      .slice(0, 11 - xi.length)
      .forEach(p => { used.add(p.name); xi.push(p); });
  }
  return xi.slice(0, 11);
}

const _avg = arr => (arr.length ? arr.reduce((s, x) => s + x, 0) / arr.length : 0);

// ovr baseline do time = 0.72·média(melhor XI) + 0.28·média(top3 overall).
// Calibrado para preservar a amplitude/ranking do ovr antigo (68–92) usando
// agora exclusivamente os perfis como verdade.
export function teamOverall(nationality, shape = "4-3-3") {
  const ps = squadProfiles(nationality);
  if (!ps.length) return 70;
  const xiAvg = _avg(bestEleven(nationality, shape).map(p => p.overall));
  const top3 = _avg(ps.map(p => p.overall).sort((a, b) => b - a).slice(0, 3));
  return Math.round(xiAvg * 0.72 + top3 * 0.28);
}

// tupla legada [name, group, overall, tags] no formato TEAMS.sq.
// índice 2 passa a ser o OVERALL real (antes era um peso 0–11). Tags derivadas:
//   G  goleiro · S estrela (top overall) · XI titular (melhor XI) · Y jovem
// O "Y" não é derivável dos perfis (sem idade); preservamos do sq antigo por
// nome normalizado quando houver correspondência.
export function legacySquad(nationality, shape = "4-3-3", oldSq = []) {
  const ps = squadProfiles(nationality).sort((a, b) => b.overall - a.overall);
  if (!ps.length) return [];
  const xiNames = new Set(bestEleven(nationality, shape).map(p => p.name));
  const starNames = new Set(ps.filter((p, i) => i < 2 && p.overall >= 82).map(p => p.name));
  const oldYoung = new Set(
    (oldSq || []).filter(o => (o[3] || "").includes("Y")).map(o => playerKey(o[0]))
  );
  return ps.map(p => {
    let tags = "";
    if (p.group === "GK") tags += "G";
    if (starNames.has(p.name)) tags += "S";
    if (xiNames.has(p.name)) tags += "XI";
    if (oldYoung.has(playerKey(p.name))) tags += "Y";
    return [p.name, p.group, p.overall, tags];
  });
}

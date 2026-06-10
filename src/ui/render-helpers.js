
/* =================================================================
   HELPERS DE RENDERIZAÇÃO COMPARTILHADOS
   -----------------------------------------------------------------
   Atalhos de DOM, bandeiras, ícones e componentes pequenos usados
   por todas as telas (badges, botões de perfil, linhas de jogo).
   ================================================================= */

import { ISO, TEAMS } from "../data/worldcup-data.js";
import { PROFILE_ORDER, profileFor } from "../state/simulation-profiles.js";
import { activeRecord, appState } from "../state/simulation-store.js";
import { generateSimulation } from "../app/app.js";
const $ = selector => document.querySelector(selector);
const el = (tag, className, html) => {
  const node = document.createElement(tag);
  if(className) node.className = className;
  if(html != null) node.innerHTML = html;
  return node;
};

// Bandeira da seleção (HTML); size: "" | "flag-lg" | "flag-xl".
// O código ISO vem de WC_DATA (gb-eng/gb-sct = subnações do Reino Unido).
// Decorativa para leitores de tela: o nome da seleção sempre acompanha em texto.
const flag = (team, size = "") => {
  const code = ISO[team];
  return code ? `<span class="fi fi-${code} flag-img ${size}" aria-hidden="true"></span>` : "";
};

// Ícone lucide (placeholder convertido por paintIcons)
const ic = (name, cls = "") => `<i data-lucide="${name}" class="ico ${cls}"></i>`;
// Converte todos os <i data-lucide> presentes no DOM em SVG
function paintIcons(){ if(window.lucide && lucide.createIcons) lucide.createIcons(); }

// Confirmação não bloqueante no padrão visual do app (substitui o
// confirm() nativo, que ignora o tema e trava webviews/embeds).
function uiConfirm(message, onConfirm){
  $("#uiConfirmOverlay")?.remove();
  const overlay = el("div", "fixed inset-0 z-[95] flex items-center justify-center p-4");
  overlay.id = "uiConfirmOverlay";
  overlay.innerHTML = `<div class="absolute inset-0 bg-ink/55 backdrop-blur-sm" data-cancel></div>
    <div class="guided-card relative rounded-3xl p-6 w-full max-w-sm shadow-lift swap" role="alertdialog" aria-modal="true" aria-label="Confirmação">
      <div class="font-display font-extrabold text-lg text-slate-800">${message}</div>
      <div class="mt-5 flex gap-2 justify-end">
        <button class="glass rounded-2xl px-4 py-2.5 font-bold text-slate-600" data-cancel>Cancelar</button>
        <button class="btn-premium text-white rounded-2xl px-5 py-2.5 font-extrabold" data-ok>Confirmar</button>
      </div>
    </div>`;
  // captura para fechar só o diálogo no ESC, sem acionar o fechamento
  // global de modais (registrado em fase bubble no app.js)
  const onKey = e => { if(e.key === "Escape"){ e.stopPropagation(); close(); } };
  const close = () => { overlay.remove(); document.removeEventListener("keydown", onKey, true); };
  overlay.querySelectorAll("[data-cancel]").forEach(node => node.onclick = close);
  overlay.querySelector("[data-ok]").onclick = () => { close(); onConfirm(); };
  document.addEventListener("keydown", onKey, true);
  document.body.appendChild(overlay);
  overlay.querySelector("[data-ok]").focus();
}

/* ---------- componentes pequenos ---------- */
function statusBadge(status){
  if(status === "Classificado") return `<span class="text-[10px] font-bold px-2 py-0.5 rounded-full bg-mxgreen/15 text-mxgreen">Classificado</span>`;
  if(status === "3º classificado") return `<span class="text-[10px] font-bold px-2 py-0.5 rounded-full bg-gold-500/20 text-gold-600">3º · melhores</span>`;
  return `<span class="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-200 text-slate-500">Eliminado</span>`;
}

function rowDot(pos, qualified){
  if(pos <= 2) return "bg-mxgreen";
  if(pos === 3 && qualified) return "bg-gold-500";
  return "bg-slate-300";
}

function matchScheduleLine(match){
  const place = [match.city, match.venue].filter(Boolean).join(" · ");
  return [match.kickoff, place].filter(Boolean).join(" · ");
}

// "2–1", "1–1 (pên. 4–3)" ou "2–2 (a.p.)"
function scoreLine(match){
  let text = `${match.ga}–${match.gb}`;
  if(match.pens) text += ` (pên. ${match.pens[0]}–${match.pens[1]})`;
  else if(match.aet) text += " (a.p.)";
  return text;
}

// "Grande zebra positiva": prioriza o azarão que foi mais longe (cinderela);
// se ele protagonizou a maior zebra, cita a vítima.
function zebraTeam(sim){
  const h = sim.highlights, upset = h.biggestUpset;
  if(h.cinderella){
    if(upset && upset.m.winner.team === h.cinderella) return {team:h.cinderella, sub:`bateu ${upset.m.loser.team} e chegou ${h.cinderellaStage}`};
    return {team:h.cinderella, sub:`chegou ${h.cinderellaStage}`};
  }
  if(upset) return {team:upset.m.winner.team, sub:`bateu ${upset.m.loser.team}`};
  return {team:sim.champion, sub:"surpresa do torneio"};
}

function renderSimulationTypeBadge(type){
  const p = profileFor(type);
  const icon = type === "epic" ? "sparkles" : type === "dramatic" ? "flame" : "bar-chart-3";
  return `<span class="profile-badge ${p.className} inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-extrabold uppercase tracking-wider">${ic(icon, 'w-3.5 h-3.5')} ${p.label}</span>`;
}

function profileButton(type, active = false, compact = false){
  const p = profileFor(type);
  return `<button class="type-control ${p.className} ${active ? 'active' : ''} ${compact ? 'px-3 py-2 text-xs' : 'px-4 py-2.5 text-sm'} rounded-2xl font-extrabold glass card-hover border border-white/60" data-type="${type}">
    <span class="profile-badge ${p.className} px-2 py-1 rounded-full">${p.label}</span>
  </button>`;
}

function renderSimulationTypeControls(targetId, compact = false){
  const target = $("#" + targetId);
  if(!target) return;
  const activeType = activeRecord()?.type || "realistic";
  target.innerHTML = PROFILE_ORDER.map(type => profileButton(type, type === activeType, compact)).join("");
  target.querySelectorAll("[data-type]").forEach(btn => {
    btn.onclick = () => generateSimulation(btn.dataset.type);
  });
}

function getAllTeamsFromSimulation(){
  return Object.keys(TEAMS).sort((a, b) => a.localeCompare(b, "pt-BR"));
}

function getFavoriteTeam(){
  return activeRecord()?.favoriteTeam || appState.draftTeam || null;
}

export { $, el, flag, getAllTeamsFromSimulation, getFavoriteTeam, ic, matchScheduleLine, paintIcons, renderSimulationTypeBadge, renderSimulationTypeControls, rowDot, scoreLine, statusBadge, uiConfirm, zebraTeam };

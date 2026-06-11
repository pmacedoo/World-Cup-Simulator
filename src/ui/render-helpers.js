
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

const cx = (...parts) => parts.flat(Infinity).filter(Boolean).join(" ");

const UI = {
  overlay: "absolute inset-0 bg-ink/55 backdrop-blur-xl",
  modalClose: "absolute top-4 right-4 text-slate-400 hover:text-ink",
  card: "guided-card rounded-3xl p-4",
  heroCard: "journey-hero-card guided-card rounded-[2rem] p-4 guided-enter",
  softCard: "rounded-3xl bg-white/70 border border-white/75 p-4",
  softCardSm: "rounded-2xl bg-white/65 border border-white/70 p-2.5",
  label10: "text-[10px] uppercase tracking-widest font-extrabold text-slate-400",
  label11: "text-[11px] uppercase tracking-widest font-extrabold text-slate-400",
  headingLg: "font-display font-extrabold text-2xl",
  headingMd: "font-display font-extrabold text-xl",
  primaryAction: "btn-premium text-white font-extrabold rounded-2xl px-5 py-3.5 flex items-center justify-center gap-2",
  glassAction: "glass rounded-2xl px-4 py-2.5 font-bold text-slate-600",
  daySnapButton: "day-snap-btn glass rounded-xl px-3 py-2 text-xs font-extrabold text-slate-600 flex items-center justify-center gap-1.5",
  disabledChip: "inline-flex items-center gap-1.5 rounded-xl bg-slate-100 px-3 py-2 text-xs font-extrabold text-slate-400",
};

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
function pill(label, tone = "slate", extra = ""){
  const tones = {
    green:"bg-mxgreen/15 text-mxgreen",
    gold:"bg-gold-500/20 text-gold-600",
    red:"bg-usared/10 text-usared",
    blue:"bg-usablue/10 text-usablue",
    slate:"bg-slate-200 text-slate-500",
  };
  return `<span class="${cx("rounded-full px-2 py-0.5 text-[10px] font-bold", tones[tone] || tones.slate, extra)}">${label}</span>`;
}

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

/* ---------- cartinha de jogador (estilo FIFA, dourada) ---------- */
// Nome no formato "primeiro nome + sobrenome abreviado": "Neymar J.",
// "Gabriel M.", "Marquinhos" (nome único fica inteiro). Nomes que já vêm
// abreviados no início ("L. Messi", "E. Shomurodov") são mantidos como estão.
function playerDisplayName(name){
  const parts = String(name || "").trim().split(/\s+/).filter(Boolean);
  if(parts.length <= 1) return parts[0] || "";
  if(/^\p{L}\.?$/u.test(parts[0])) return parts.join(" ");
  const initial = parts[parts.length - 1].charAt(0).toUpperCase();
  return `${parts[0]} ${initial}.`;
}

// Monta a cartinha dourada do jogador (string HTML, pronta p/ innerHTML).
// Aceita string (nome) ou objeto { name, team|nationality, overall, pos,
// tags, captain }. Campos faltando são resolvidos de TEAMS[team].sq quando há
// `team`. options: { size:"sm"|"md"|"lg", team, captain }.
function playerCard(input, options = {}){
  const data = typeof input === "string" ? { name: input } : (input || {});
  const name = data.name || "";
  const team = data.team || data.nationality || options.team || null;
  let overall = data.overall, pos = data.pos, tags = data.tags || "";
  if((overall == null || pos == null) && team && TEAMS[team]){
    const raw = TEAMS[team].sq.find(p => p[0] === name);
    if(raw){
      if(overall == null) overall = raw[2];
      if(pos == null) pos = raw[1];
      if(!tags) tags = raw[3] || "";
    }
  }
  const captain = data.captain || options.captain || false;
  const sizeCls = options.size === "xs" ? "playercard-xs" : options.size === "sm" ? "playercard-sm" : options.size === "lg" ? "playercard-lg" : "";
  return `<div class="playercard ${sizeCls}" data-name="${name}">
    <div class="playercard-top">
      <span class="playercard-ovr">${overall != null ? overall : "—"}</span>
      <span class="playercard-pos">${pos || ""}</span>
    </div>
    <div class="playercard-flag">${team ? flag(team) : ""}</div>
    ${captain ? '<span class="playercard-cap">C</span>' : ""}
    <div class="playercard-name">${playerDisplayName(name)}</div>
  </div>`;
}

/* ---------- campo de futebol (SVG, em pé, redimensionável) ---------- */
// Campo pronto desenhado em SVG (viewBox 100×150 = 2:3, retrato). Escala junto
// com o container — tudo dentro (linhas, círculos, áreas) acompanha o tamanho.
// Goleiro embaixo, ataque em cima. Cores via CSS vars (--pitch-*) p/ tema.
// Retorna o <svg> já com a classe de posicionamento do campo (inset:0, fill).
function fieldPitch(opts = {}){
  const line = "rgba(255,255,255,0.72)";
  const bands = opts.stripes === false ? "" :
    Array.from({length:8}, (_,i)=> i%2 ? `<rect x="2" y="${(2+i*18.25).toFixed(2)}" width="96" height="18.25" fill="rgba(255,255,255,0.05)"/>` : "").join("");
  return `<svg class="lineup-field-img pitch-svg" viewBox="0 0 100 150" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <rect x="0" y="0" width="100" height="150" fill="var(--pitch-grass,#1f7a47)"/>
    ${bands}
    <g fill="none" stroke="${line}" stroke-width="0.5" stroke-linejoin="round">
      <rect x="2" y="2" width="96" height="146" rx="0.8"/>
      <line x1="2" y1="75" x2="98" y2="75"/>
      <circle cx="50" cy="75" r="9.2"/>
      <rect x="21" y="2" width="58" height="16.5"/>
      <rect x="37.5" y="2" width="25" height="6.2"/>
      <path d="M 43.6 18.5 A 9.15 9.15 0 0 0 56.4 18.5"/>
      <rect x="21" y="131.5" width="58" height="16.5"/>
      <rect x="37.5" y="141.8" width="25" height="6.2"/>
      <path d="M 43.6 131.5 A 9.15 9.15 0 0 1 56.4 131.5"/>
      <path d="M 4 2 A 2 2 0 0 0 2 4"/>
      <path d="M 96 2 A 2 2 0 0 1 98 4"/>
      <path d="M 2 146 A 2 2 0 0 0 4 148"/>
      <path d="M 98 146 A 2 2 0 0 1 96 148"/>
    </g>
    <g fill="${line}">
      <circle cx="50" cy="75" r="0.7"/>
      <circle cx="50" cy="12" r="0.7"/>
      <circle cx="50" cy="138" r="0.7"/>
    </g>
    <g fill="rgba(255,255,255,0.16)" stroke="${line}" stroke-width="0.4">
      <rect x="43" y="0.2" width="14" height="1.9"/>
      <rect x="43" y="147.9" width="14" height="1.9"/>
    </g>
  </svg>`;
}

export { $, UI, cx, el, fieldPitch, flag, getAllTeamsFromSimulation, getFavoriteTeam, ic, matchScheduleLine, paintIcons, pill, playerCard, playerDisplayName, renderSimulationTypeBadge, renderSimulationTypeControls, rowDot, scoreLine, statusBadge, uiConfirm, zebraTeam };

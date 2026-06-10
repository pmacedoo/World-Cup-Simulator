
/* =================================================================
   JORNADA — LAYOUT MOBILE (app de abas com swipe)
   -----------------------------------------------------------------
   Em viewports móveis a jornada vira um app de 5 abas (jogo, notícias,
   tabela, calendário e campanha) com navegação por toque. O listener
   de resize re-renderiza apenas quando o layout efetivamente muda de
   modo (mobile <-> desktop), com debounce.
   ================================================================= */

import { daysBetweenISO, parseMatchMinute } from "../../domain/matches/match-queries.js";
import { activeRecord, appState } from "../../state/simulation-store.js";
import { $, flag, ic, renderSimulationTypeBadge, scoreLine } from "../render-helpers.js";
import { canRevealMatchTeams, getNextVisibleMatch, getSpoilerSafeOpponent, hasWatchedMatch, periodInfoForMinute } from "./journey-context.js";
import { renderJourneyNews } from "./journey-news.js";
import { calendarMatchAction, daySnapshotButtons, renderCampaignProgressHeader, renderJourneyActionButtons, renderJourneyClockPanel, renderJourneySituation } from "./journey-components.js";
import { renderFavoriteTeamJourney } from "./journey-screens.js";

const MOBILE_JOURNEY_TABS = [
  {key:"game", label:"Jogo", icon:"play-circle"},
  {key:"news", label:"Notícias", icon:"newspaper"},
  {key:"table", label:"Tabela", icon:"git-fork"},
  {key:"calendar", label:"Jogos", icon:"calendar-days"},
  {key:"campaign", label:"Campanha", icon:"shield"},
];
const MOBILE_SWIPE_MIN_X = 55;   // deslocamento mínimo p/ trocar de aba

let journeyLayoutIsMobile = null;
let journeyResizeTimer = null;

// bindings importados são somente-leitura em ESM: quem renderiza a
// jornada registra o layout atual por esta função, não por atribuição
function setJourneyLayoutIsMobile(isMobile){ journeyLayoutIsMobile = isMobile; }

function isMobileJourneyViewport(){
  if(!window.matchMedia) return window.innerWidth <= 767;
  return window.matchMedia("(max-width: 767px), (pointer: coarse) and (max-width: 1024px)").matches;
}

function scheduleJourneyLayoutRefresh(){
  clearTimeout(journeyResizeTimer);
  journeyResizeTimer = setTimeout(() => {
    if(appState.view !== "journey" || !activeRecord()?.id) return;
    const nowMobile = isMobileJourneyViewport();
    if(journeyLayoutIsMobile !== null && nowMobile !== journeyLayoutIsMobile) renderFavoriteTeamJourney();
  }, 160);
}

window.addEventListener("resize", scheduleJourneyLayoutRefresh, {passive:true});
window.addEventListener("orientationchange", scheduleJourneyLayoutRefresh, {passive:true});

function currentMobileJourneyTab(){
  const key = appState.mobileJourneyTab || "game";
  return MOBILE_JOURNEY_TABS.some(t => t.key === key) ? key : "game";
}

function setMobileJourneyTab(key){
  appState.mobileJourneyTab = MOBILE_JOURNEY_TABS.some(t => t.key === key) ? key : "game";
  renderFavoriteTeamJourney();
}

function mobileJourneyTitle(key){
  return MOBILE_JOURNEY_TABS.find(t => t.key === key)?.label || "Jogo";
}

function renderMobileJourneyFooter(active){
  return `<nav class="mobile-journey-footer" aria-label="Navegação da jornada">
    ${MOBILE_JOURNEY_TABS.map(tab => `<button class="mobile-journey-tab ${active === tab.key ? 'active' : ''}" data-mobile-tab="${tab.key}" type="button" ${active === tab.key ? 'aria-current="page"' : ''}>
      ${ic(tab.icon, 'w-5 h-5')}
      <span>${tab.label}</span>
    </button>`).join("")}
  </nav>`;
}

function renderMobileCampaignPanel(ctx, matches, revealed){
  const team = ctx.team;
  const shown = matches.slice(0, revealed);
  return `<div class="mobile-journey-panel-inner no-scroll">
    <div class="guided-card rounded-[2rem] p-4 guided-enter">
      <div class="mb-4">
        ${renderCampaignProgressHeader(team, matches, revealed)}
      </div>
      <div class="journey-scroll-list mobile-campaign-list space-y-2">
        ${shown.length ? shown.map(m => `<div class="rounded-2xl bg-white/70 border border-white/75 p-3">
          <div class="text-[10px] uppercase tracking-widest font-extrabold text-slate-400">${m.stage}${m.matchNo ? ` · M${m.matchNo}` : ""}</div>
          <div class="mt-1 font-extrabold text-sm leading-tight">${flag(m.home)} ${m.home} <span class="tnum px-1.5">${scoreLine(m)}</span> ${flag(m.away)} ${m.away}</div>
        </div>`).join("") : `<div class="rounded-2xl bg-white/70 border border-white/75 p-4 text-sm font-semibold text-slate-500">A campanha ainda não tem jogos revelados.</div>`}
        <div class="scroll-affordance">Mais jogos abaixo</div>
      </div>
      <div class="mobile-scroll-hint">Role para ver mais</div>
    </div>
  </div>`;
}

function renderMobileCalendarPanel(ctx){
  const {team, currentDay, dayMatches, journeyMinute} = ctx;
  const visible = dayMatches;
  return `<div class="mobile-journey-panel-inner no-scroll">
    <div class="guided-card rounded-[2rem] p-4 guided-enter">
      <div class="flex items-center justify-between gap-3 mb-4">
        <div>
          <div class="text-[11px] uppercase tracking-widest font-extrabold text-slate-400">Jogos do dia</div>
          <h2 class="font-display font-extrabold text-2xl">${currentDay.dateLabel || "Calendário"}</h2>
        </div>
        ${ic('calendar-days','w-6 h-6 text-usablue')}
      </div>
      <div class="journey-scroll-list mobile-day-match-list space-y-2">
        ${visible.length ? visible.map(m => {
          const isFavorite = m.home === team || m.away === team;
          const watched = hasWatchedMatch(activeRecord(), m);
          const due = parseMatchMinute(m.time) <= journeyMinute;
          const teamsVisible = canRevealMatchTeams(ctx, m);
          const home = teamsVisible || m.home === team ? `${flag(m.home)} ${m.home}` : `<span class="text-slate-400 italic">A definir</span>`;
          const away = teamsVisible || m.away === team ? `${flag(m.away)} ${m.away}` : `<span class="text-slate-400 italic">A definir</span>`;
          return `<div class="calendar-day-match rounded-2xl ${isFavorite ? 'bg-mxgreen/10 border-mxgreen/25' : 'bg-white/70 border-white/75'} border p-3">
            <div class="flex items-start justify-between gap-3">
              <div class="min-w-0">
                <div class="text-[10px] uppercase tracking-widest font-extrabold ${isFavorite ? 'text-mxgreen' : 'text-slate-400'}">${m.matchNo ? `M${m.matchNo} · ` : ''}${m.stage}${m.time ? ` · ${m.time}` : ''}</div>
                <div class="mt-1 font-extrabold text-sm leading-tight">${home} <span class="px-1.5 ${watched ? 'text-ink' : 'text-slate-400'}">${watched ? scoreLine(m) : (due ? 'aguardando' : 'x')}</span> ${away}</div>
                <div class="mt-1 text-[11px] font-semibold text-slate-500">${m.venue || m.city || ""}</div>
              </div>
              <div class="flex-none">${calendarMatchAction(ctx, m)}</div>
            </div>
          </div>`;
        }).join("") : `<div class="rounded-2xl bg-white/70 border border-white/75 p-4 text-sm font-semibold text-slate-500">Nenhum jogo previsto para este dia.</div>`}
        <div class="scroll-affordance">Mais jogos abaixo</div>
      </div>
      <div class="mobile-scroll-hint">Role para ver mais</div>
      ${daySnapshotButtons()}
    </div>
  </div>`;
}

function renderMobileNextFavoriteCard(ctx){
  const nextFav = getNextVisibleMatch(ctx);
  if(!nextFav){
    return `<div class="rounded-2xl bg-slate-100/80 border border-white/70 p-3 text-xs font-extrabold text-slate-500">Sem próximo jogo pendente da sua seleção.</div>`;
  }
  const match = nextFav.match;
  const daysLeft = daysBetweenISO(ctx.currentDay.dateISO, match.dateISO);
  const safe = getSpoilerSafeOpponent(ctx, match);
  const teamsLine = safe.canReveal
    ? `${flag(match.home)} ${match.home} <span class="text-slate-400 px-1">x</span> ${flag(match.away)} ${match.away}`
    : `${flag(ctx.team)} ${ctx.team} <span class="text-slate-400 px-1">x</span> <span class="text-slate-400 italic">${safe.label}</span>`;
  return `<div class="rounded-2xl bg-mxgreen/10 border border-mxgreen/20 p-3">
    <div class="flex items-start justify-between gap-3">
      <div class="min-w-0">
        <div class="text-[9px] uppercase tracking-widest font-extrabold text-mxgreen">Próximo jogo</div>
        <div class="mt-1 font-display font-extrabold text-base leading-tight truncate">${teamsLine}</div>
        <div class="mt-1 text-[11px] font-bold text-slate-500 truncate">${safe.canReveal ? (match.venue || match.city || safe.label) : safe.reason}</div>
      </div>
      <div class="text-right shrink-0">
        <div class="text-[11px] font-extrabold text-slate-700 tnum">${match.dateLabel}</div>
        <div class="text-[10px] font-bold text-slate-500">${daysLeft === 0 ? "É hoje" : `Faltam ${daysLeft}d`}${match.time ? ` · ${match.time}` : ""}</div>
      </div>
    </div>
  </div>`;
}

function renderMobileGamePanel(ctx, type){
  const {team, currentDay, calendarDayIndex, days, finished, dayPhase, journeyMinute, dayMatches} = ctx;
  const dayNo = calendarDayIndex + 1;
  const totalDays = days.length || 1;
  const highlightMatches = dayMatches.slice(0, 2);
  const period = periodInfoForMinute(journeyMinute);
  return `<div class="mobile-journey-panel-inner no-scroll">
    <div class="journey-hero-card guided-card rounded-[2rem] p-4 guided-enter ${finished && ctx.sim.champion === team ? 'confetti-soft' : ''}">
      <div class="flex items-center justify-between gap-3">
        ${renderSimulationTypeBadge(type)}
        <span class="px-3 py-1.5 rounded-full text-[10px] uppercase tracking-widest font-extrabold ${period.tone === "night" ? 'bg-ink text-white' : 'bg-gold-500/15 text-gold-700'}">${period.label}</span>
      </div>
      <div class="mt-4 flex items-start justify-between gap-3">
        <div>
          <div class="text-[10px] uppercase tracking-widest font-extrabold text-slate-400">Dia ${dayNo}/${totalDays}</div>
          <h1 class="font-display font-extrabold text-2xl leading-tight">${currentDay.dateLabel}</h1>
          <p class="mt-1 text-xs text-slate-500 font-semibold">${flag(team)} ${team} · jornada da Copa</p>
        </div>
        ${flag(team, 'flag-lg')}
      </div>
      ${renderJourneyClockPanel(ctx, true)}
      <div class="mt-3">${renderJourneyActionButtons(ctx)}</div>
      <div class="mt-3 mobile-next-match-card">${renderMobileNextFavoriteCard(ctx)}</div>
      <div class="mt-3 mobile-today-strip">
        <div class="text-[9px] uppercase tracking-widest font-extrabold text-slate-400 mb-1.5">Hoje na Copa</div>
        <div class="grid gap-1.5">
          ${highlightMatches.length ? highlightMatches.map(m => {
            const watched = hasWatchedMatch(activeRecord(), m);
            const due = parseMatchMinute(m.time) <= journeyMinute;
            const teamsVisible = canRevealMatchTeams(ctx, m);
            const home = teamsVisible || m.home === team ? `${flag(m.home)} ${m.home}` : "A definir";
            const away = teamsVisible || m.away === team ? `${flag(m.away)} ${m.away}` : "A definir";
            return `<div class="rounded-xl bg-white/60 border border-white/70 px-2.5 py-2">
              <div class="flex items-center justify-between gap-2">
                <div class="min-w-0 text-[11px] font-extrabold truncate">${home} <span class="${watched ? 'text-ink' : 'text-slate-400'} px-1">${watched ? scoreLine(m) : (due ? 'aguardando' : 'x')}</span> ${away}</div>
                <div class="text-[9px] font-black text-slate-400 shrink-0">${m.time || ""}</div>
              </div>
            </div>`;
          }).join("") : `<div class="rounded-xl bg-white/60 border border-white/70 px-2.5 py-2 text-[11px] font-bold text-slate-500">Sem jogos neste dia.</div>`}
        </div>
      </div>
      <button id="resetGuidedSmall" class="mt-2 text-[11px] font-extrabold text-slate-400 hover:text-usared">Reiniciar progresso</button>
    </div>
  </div>`;
}

function renderMobileJourneyApp(ctx, type, matches, revealed){
  const active = currentMobileJourneyTab();
  const activeIndex = MOBILE_JOURNEY_TABS.findIndex(t => t.key === active);
  const panel = active === "news"
    ? `<div class="mobile-journey-panel-inner no-scroll">${renderJourneyNews(ctx)}</div>`
    : active === "table"
      ? `<div class="mobile-journey-panel-inner no-scroll">${renderJourneySituation(ctx, {showScouting:false})}</div>`
      : active === "calendar"
        ? renderMobileCalendarPanel(ctx)
        : active === "campaign"
          ? renderMobileCampaignPanel(ctx, matches, revealed)
          : renderMobileGamePanel(ctx, type);
  return `<div class="mobile-journey-app" data-active-index="${activeIndex}">
    <div class="mobile-journey-topbar">
      <div class="min-w-0 text-center">
        <div class="text-[10px] uppercase tracking-widest font-extrabold text-slate-400">Jornada</div>
        <div class="font-display font-extrabold text-xl leading-tight">${mobileJourneyTitle(active)}</div>
      </div>
    </div>
    <main id="mobileJourneyViewport" class="mobile-journey-viewport" data-mobile-active="${active}">
      ${panel}
    </main>
    ${renderMobileJourneyFooter(active)}
  </div>`;
}

// Troca de aba por toque (swipe horizontal) ou pelos botões do rodapé.
function wireMobileJourneyTabs(){
  document.querySelectorAll("[data-mobile-tab]").forEach(btn => btn.onclick = () => setMobileJourneyTab(btn.dataset.mobileTab));
  const viewport = $("#mobileJourneyViewport");
  if(!viewport) return;
  let startX = 0, startY = 0;
  viewport.addEventListener("touchstart", e => {
    const touch = e.touches[0];
    if(!touch) return;
    startX = touch.clientX;
    startY = touch.clientY;
  }, {passive:true});
  viewport.addEventListener("touchend", e => {
    const touch = e.changedTouches[0];
    if(!touch) return;
    const dx = touch.clientX - startX, dy = touch.clientY - startY;
    // ignora gestos curtos ou predominantemente verticais (scroll)
    if(Math.abs(dx) < MOBILE_SWIPE_MIN_X || Math.abs(dx) < Math.abs(dy) * 1.2) return;
    const active = currentMobileJourneyTab();
    const idx = MOBILE_JOURNEY_TABS.findIndex(tab => tab.key === active);
    const next = (MOBILE_JOURNEY_TABS.length + idx + (dx < 0 ? 1 : -1)) % MOBILE_JOURNEY_TABS.length;
    setMobileJourneyTab(MOBILE_JOURNEY_TABS[next].key);
  }, {passive:true});
}

export { isMobileJourneyViewport, renderMobileJourneyApp, setJourneyLayoutIsMobile, wireMobileJourneyTabs };

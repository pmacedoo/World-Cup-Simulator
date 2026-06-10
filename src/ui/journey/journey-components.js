
/* =================================================================
   COMPONENTES DA JORNADA (desktop)
   -----------------------------------------------------------------
   Cards e painéis reutilizados pelas telas da jornada e pelo
   dashboard: navegação superior, card do dia, notícias laterais,
   situação (tabela/chave), scouting e campanha jogo a jogo.
   ================================================================= */

import { TEAMS } from "../../data/worldcup-data.js";
import { WC_LINEUPS } from "../../engine/lineups.js";
import { daysBetweenISO, formatJourneyMinute, getMatchWinnerTeam, getTeamMatches, groupRowForTeam, isGroupStage, matchFavoriteIndex, parseMatchMinute } from "../../domain/matches/match-queries.js";
import { profileFor } from "../../state/simulation-profiles.js";
import { activeRecord, appState, simObjFor, timeAgo } from "../../state/simulation-store.js";
import { UI, cx, flag, ic, matchScheduleLine, renderSimulationTypeBadge, rowDot, scoreLine } from "../render-helpers.js";
import { canRevealMatchTeams, getNextVisibleMatch, getSpoilerSafeOpponent, hasWatchedMatch, periodInfoForMinute } from "./journey-context.js";
import { pauseAutoAdvance } from "./journey-auto-advance.js";

function renderIntroNav(step){
  const steps = [["team-picker","Seleção"],["type-picker","Tipo"],["journey","Jornada"],["dashboard","Dashboard"]];
  const isDark = appState.darkMode;
  return `<div class="guided-top-nav max-w-7xl mx-auto flex items-center justify-between gap-4 mb-8 guided-enter">
    <div class="flex items-center gap-2.5">
      <span class="grid place-items-center w-10 h-10 rounded-2xl text-white text-sm font-extrabold" style="background:var(--grad-2026)">26</span>
      <div>
        <div class="font-display font-extrabold leading-tight">Copa 2026 · Jornada guiada</div>
        <div class="text-xs text-slate-500 font-semibold">Viva primeiro a campanha da sua seleção</div>
      </div>
    </div>
    <div class="flex items-center gap-2">
      <div class="hidden sm:flex items-center gap-2">
        ${steps.map(([id, label], i) => `<span class="px-3 py-1.5 rounded-full text-xs font-extrabold ${id === step ? 'bg-ink text-white' : 'glass text-slate-500'}">${i + 1}. ${label}</span>`).join("")}
      </div>
      <button class="dark-mode-toggle guided-dark-toggle grid place-items-center w-9 h-9 rounded-xl glass shrink-0" title="${isDark ? 'Modo claro' : 'Modo escuro'}" aria-label="Alternar modo escuro">
        ${ic(isDark ? 'sun' : 'moon', 'w-4 h-4')}
      </button>
    </div>
  </div>`;
}

function statusPill(status){
  const color = status === "Favorita" ? "text-gold-600 bg-gold-500/15"
    : status === "Anfitriã" ? "text-usablue bg-usablue/10"
    : status === "Zebra" ? "text-usared bg-usared/10"
    : "text-mxgreen bg-mxgreen/10";
  return `<span class="text-[10px] font-extrabold uppercase tracking-wider px-2 py-1 rounded-full ${color}">${status}</span>`;
}

function matchTeamLine(match){
  if(!match) return "";
  return `${flag(match.home)} ${match.home} ${match.ga != null ? `<span class="tnum px-1.5">${scoreLine(match)}</span>` : "<span class=\"px-1.5 text-slate-400\">x</span>"} ${flag(match.away)} ${match.away}`;
}

// Resumo da campanha da favorita (campeã / eliminada / viva).
function campaignSummary(sim, team){
  const row = groupRowForTeam(sim, team);
  const matches = getTeamMatches(sim, team);
  const last = matches[matches.length - 1];
  const knockoutLost = last && last.stage && !last.stage.includes("Grupo") && !last.favoriteWon;
  if(sim.champion === team) return {status:"champion", title:"Sua seleção é campeã do mundo!", text:`Campanha dourada: ${flag(team)} ${team} ergueu a taça depois de ${matches.length} jogos e uma final vencida contra ${sim.runnerUp}.`};
  if(knockoutLost) return {status:"eliminated", title:"A campanha terminou aqui.", text:`${flag(team)} ${team} caiu em ${last.stage}, contra ${flag(last.opponent)} ${last.opponent}, por ${scoreLine(last)}.`};
  if(row && row.status === "Eliminado") return {status:"eliminated", title:"Eliminação na fase de grupos.", text:`${flag(team)} ${team} terminou o Grupo ${row.group} em ${row.pos}º, com ${row.P} pontos e saldo ${row.SG > 0 ? "+" : ""}${row.SG}.`};
  return {status:"alive", title:"Campanha em destaque.", text:`${flag(team)} ${team} fez uma campanha de ${matches.length} jogo(s), passando pelo Grupo ${row?.group || "?"} e deixando sua marca nesta simulação.`};
}

function compactGroupCard(group, favTeam){
  return `<div class="glass rounded-2xl p-3 shadow-glass">
    <div class="flex items-center justify-between mb-1.5"><div class="font-display font-extrabold text-sm">Grupo ${group.letter}</div><div class="text-[10px] text-slate-400 font-bold">${group.played}/3</div></div>
    <table class="w-full text-xs"><tbody>
      ${group.table.map(r => `<tr class="${r.team === favTeam ? 'font-extrabold text-ink' : 'text-slate-600'}">
        <td class="py-0.5 w-4 ${rowDot(r.pos, r.pos === 3) === 'bg-mxgreen' ? 'text-mxgreen' : 'text-slate-400'} tnum">${r.pos}</td>
        <td class="py-0.5"><span class="inline-flex items-center gap-1.5">${flag(r.team)}<span>${r.team}</span></span></td>
        <td class="py-0.5 text-right tnum text-slate-400">${r.J}j</td>
        <td class="py-0.5 text-right tnum font-extrabold">${r.P}</td>
        <td class="py-0.5 text-right tnum ${r.SG > 0 ? 'text-mxgreen' : r.SG < 0 ? 'text-usared' : 'text-slate-400'}">${r.SG > 0 ? '+' : ''}${r.SG}</td>
      </tr>`).join("")}
    </tbody></table>
  </div>`;
}

function daySnapshotButtons(){
  return `<div class="mt-3 grid grid-cols-2 gap-2">
    <button class="${UI.daySnapButton}" data-snap="groups">${ic('table-2','w-3.5 h-3.5')} Grupos agora</button>
    <button class="${UI.daySnapButton}" data-snap="bracket">${ic('git-fork','w-3.5 h-3.5')} Chaveamento agora</button>
  </div>`;
}

function safeTeamLabel(ctx, match, side){
  const team = side === "home" ? match.home : match.away;
  if(canRevealMatchTeams(ctx, match)) return `${flag(team)} ${team}`;
  if(team === ctx.team) return `${flag(ctx.team)} ${ctx.team}`;
  return `<span class="text-slate-400 italic">A definir</span>`;
}

// Histórico da campanha revelada (sem spoilers de jogos futuros).
function progressiveCampaign(record){
  const sim = simObjFor(record), team = record.favoriteTeam;
  const matches = getTeamMatches(sim, team);
  if(!matches.length) return `<div class="glass rounded-3xl p-6 text-slate-500 font-semibold">Nenhum jogo encontrado.</div>`;
  const revealed = Math.min(record.revealed, matches.length);
  let html = `<div class="journey-rail space-y-3">`;
  for(let i = 0; i < revealed; i++){
    const m = matches[i];
    html += `<div class="journey-match-card glass rounded-3xl p-4 pl-14 shadow-glass ${m.favoriteWon ? 'border-mxgreen/20' : ''}">
      <div class="absolute left-[13px] top-5 grid place-items-center w-10 h-10 rounded-full bg-white shadow-glass border border-white/80 font-extrabold text-xs ${m.favoriteWon ? 'text-mxgreen' : m.favoriteDrew ? 'text-slate-500' : 'text-usared'}">${i + 1}</div>
      <div class="text-[11px] uppercase tracking-wider font-extrabold text-slate-400">${m.matchNo ? `M${m.matchNo} · ` : ''}${m.stage} · ${m.kickoff || m.city}</div>
      <div class="mt-1 font-display font-extrabold text-lg flex flex-wrap items-center gap-2">${flag(m.home)} ${m.home} <span class="px-2 py-0.5 rounded-xl bg-ink text-white tnum">${scoreLine(m)}</span> ${flag(m.away)} ${m.away}</div>
      <div class="text-sm text-slate-500 mt-1">${m.goals.length ? `${m.goals.length} gol(s): ${m.goals.slice(0, 3).map(g => `${g.minute}' ${g.player}`).join(" · ")}${m.goals.length > 3 ? "..." : ""}` : "Sem gols no tempo jogado."}</div>
      <div class="mt-3 flex flex-wrap gap-2">
        <button class="replay-btn glass rounded-xl px-3 py-1.5 text-xs font-bold text-slate-600" data-idx="${i}">${ic('rotate-ccw','w-3.5 h-3.5')} Rever jogo</button>
      </div>
    </div>`;
  }
  if(revealed < matches.length){
    html += `<div class="glass rounded-3xl p-5 text-slate-500 font-semibold">
      Os próximos jogos aparecem no card do dia. Aqui fica só o histórico da campanha e os replays.
    </div>`;
  } else {
    const cs = campaignSummary(sim, team);
    html += `<div class="rounded-3xl p-5 ${cs.status === "champion" ? 'bg-gold-500/15 border border-gold-400/40' : 'bg-usared/10 border border-usared/20'}">
      <div class="font-display font-extrabold text-lg flex items-center gap-2">${ic(cs.status === "champion" ? 'trophy' : 'flag', 'w-5 h-5')} ${cs.title}</div>
      <p class="mt-1 text-slate-600 leading-relaxed">${cs.text}</p>
    </div>`;
  }
  html += `</div>`;
  return html;
}

// Painel lateral "Minhas simulações" (trocar / excluir / nova).
function savedSimsPanel(){
  return `<div class="text-[10px] uppercase tracking-widest font-extrabold text-slate-400 mb-2 mt-6">Minhas simulações</div>
    <div class="journey-scroll-list saved-sims-scroll space-y-2">
      ${appState.sims.map(record => {
        const p = profileFor(record.type);
        const active = record.id === appState.activeId;
        return `<div class="flex items-center gap-2 rounded-2xl p-2.5 ${active ? 'bg-ink text-white' : 'glass'}">
          <span class="flex-none">${flag(record.favoriteTeam, 'flag-lg')}</span>
          <button class="switch-sim flex-1 text-left min-w-0" data-id="${record.id}">
            <div class="font-extrabold text-sm truncate ${active ? 'text-white' : ''}">${record.favoriteTeam}</div>
            <div class="text-[11px] ${active ? 'text-white/75' : 'text-slate-500'} truncate">${p.label} · ${record.finished ? 'concluída' : `${record.revealed} jogo(s)`} · ${timeAgo(record.createdAt)}</div>
          </button>
          <button class="del-sim flex-none w-7 h-7 grid place-items-center rounded-full ${active ? 'text-white/70 hover:text-white' : 'text-slate-300 hover:text-usared'}" data-id="${record.id}" title="Excluir simulação de ${record.favoriteTeam}" aria-label="Excluir simulação de ${record.favoriteTeam}">${ic('trash-2','w-4 h-4')}</button>
        </div>`;
      }).join("")}
      <div class="scroll-affordance">Role para ver mais</div>
    </div>
    <button id="newSimFromJourney" class="mt-3 w-full glass rounded-2xl px-4 py-3 font-extrabold text-slate-700 flex items-center justify-center gap-2">${ic('plus','w-4 h-4')} Nova simulação</button>`;
}

// Ação disponível para um jogo do calendário no momento atual:
// aguardando horário, jogar (favorita), assistir ou rever.
function calendarMatchAction(ctx, match){
  const record = activeRecord();
  const favIdx = matchFavoriteIndex(match, ctx.matches);
  const isFavorite = match.home === ctx.team || match.away === ctx.team;
  const watched = hasWatchedMatch(record, match);
  const due = parseMatchMinute(match.time) <= ctx.journeyMinute;
  if(!canRevealMatchTeams(ctx, match)){
    return `<span class="${UI.disabledChip}">${ic('lock','w-3.5 h-3.5')} Chave</span>`;
  }
  if(!due){
    return `<span class="${UI.disabledChip}">${ic('clock','w-3.5 h-3.5')} ${match.time || "--"}</span>`;
  }
  if(isFavorite && favIdx === ctx.revealed && !watched){
    return `<button class="calendar-play btn-premium text-white rounded-xl px-3 py-2 text-xs font-extrabold" data-match-no="${match.matchNo}">${ic('play','w-3.5 h-3.5')} Jogar</button>`;
  }
  if(!watched){
    return `<button class="calendar-watch glass rounded-xl px-3 py-2 text-xs font-extrabold text-slate-600" data-match-no="${match.matchNo}">${ic('eye','w-3.5 h-3.5')} Assistir</button>`;
  }
  return `<button class="calendar-watch glass rounded-xl px-3 py-2 text-xs font-extrabold text-slate-500" data-match-no="${match.matchNo}">${ic('rotate-ccw','w-3.5 h-3.5')} Rever</button>`;
}

// Botão de ação principal do dia (dashboard final / jogar / avanço automático).
function renderJourneyActionButtons(ctx){
  const jumpMatch = !ctx.finished && !ctx.canPlayFavoriteToday && !appState.autoAdvancing
    ? getNextVisibleMatch(ctx)
    : null;
  return `<div class="grid gap-2">
    ${ctx.finished
      ? `<button id="askDashboard" class="${UI.primaryAction}">${ic('layout-dashboard','w-4 h-4')} Ver Copa completa</button>`
      : ctx.canPlayFavoriteToday
          ? `<button id="startJourney" class="${UI.primaryAction}">${ic('play','w-4 h-4')} Jogar partida</button>`
          : appState.autoAdvancing
              ? `<button id="pauseAutoAdvance" class="glass rounded-2xl px-5 py-3.5 font-extrabold text-slate-600 flex items-center justify-center gap-2">${ic('pause','w-4 h-4')} Pausar avanço</button>`
              : `${jumpMatch ? `<button id="jumpToNextMatch" class="jump-to-match-btn rounded-2xl px-5 py-3.5 font-extrabold flex items-center justify-center gap-2">${ic('fast-forward','w-4 h-4')} Pular para meu jogo</button>` : ''}
                <button id="autoAdvanceClock" class="btn-premium text-white font-extrabold rounded-2xl px-5 py-3.5 flex items-center justify-center gap-2">${ic('play-circle','w-4 h-4')} Avançar automaticamente</button>`}
  </div>`;
}

function renderJourneyClockPanel(ctx, compact = false){
  const {journeyMinute} = ctx;
  const period = periodInfoForMinute(journeyMinute);
  return `<div class="journey-clock-panel mt-${compact ? '3' : '4'} rounded-3xl p-${compact ? '3' : '4'}">
    <div class="flex items-center justify-between gap-3">
      <div>
        <div class="text-[${compact ? '9' : '10'}px] uppercase tracking-widest font-extrabold text-slate-400">${compact ? 'Relógio' : 'Relógio da jornada'}</div>
        <div id="journeyClock" class="font-display font-extrabold text-3xl tnum">${formatJourneyMinute(journeyMinute)}</div>
      </div>
      <div class="journey-period-pill ${period.tone === "night" ? "is-night" : ""}" style="--night-level:${period.night.toFixed(3)}" title="Intensidade da noite: ${Math.round(period.night * 100)}%">
        <span class="journey-period-dot" aria-hidden="true"></span>
        <div class="min-w-0">
          <div id="journeyPeriodLabel" class="text-${compact ? '[10px]' : 'xs'} font-extrabold leading-tight">${period.label}</div>
          <div class="journey-period-level mt-1"><span id="journeyNightLevel"></span></div>
        </div>
      </div>
    </div>
    <div class="journey-clock-track mt-${compact ? '2' : '3'}"><span style="width:${Math.max(0, Math.min(100, (journeyMinute / 1440) * 100))}%"></span></div>
  </div>`;
}

// Card principal do dia (desktop): badge do tipo, relógio, jogos do dia,
// ações e painel de simulações salvas.
function renderCalendarDayCard(ctx, type){
  const {team, currentDay, dayMatches, calendarDayIndex, days, finished, dayPhase, journeyMinute} = ctx;
  const dayNo = calendarDayIndex + 1;
  const totalDays = days.length || 1;
  const period = periodInfoForMinute(journeyMinute);
  return `<div class="${cx(UI.heroCard, "sm:p-5", finished && ctx.sim.champion === team && "confetti-soft")}">
    <div class="flex items-center justify-between gap-4">
      ${renderSimulationTypeBadge(type)}
      <div class="flex items-center gap-2">
        <span class="px-3 py-1.5 rounded-full text-[10px] uppercase tracking-widest font-extrabold ${period.tone === "night" ? 'bg-ink text-white' : 'bg-gold-500/15 text-gold-700'}">${period.label}</span>
        <button id="journeyTypeBack" class="text-xs font-extrabold text-slate-500 hover:text-ink">Trocar tipo</button>
      </div>
    </div>
    <div class="mt-5 flex items-start justify-between gap-4">
      <div>
        <div class="${UI.label10}">Dia ${dayNo}/${totalDays}</div>
        <h1 class="font-display font-extrabold text-3xl leading-tight">${currentDay.dateLabel}</h1>
        <p class="mt-2 text-sm text-slate-500 font-semibold">${flag(team)} ${team} · calendário da Copa</p>
      </div>
      ${flag(team, 'flag-xl')}
    </div>
    ${renderJourneyClockPanel(ctx)}
    <div class="mt-4 calendar-day-list journey-scroll-list space-y-2">
      ${dayMatches.map(m => {
        const isFavorite = m.home === team || m.away === team;
        const watched = hasWatchedMatch(activeRecord(), m);
        const due = parseMatchMinute(m.time) <= journeyMinute;
        return `<div class="calendar-day-match rounded-2xl ${isFavorite ? 'bg-mxgreen/10 border-mxgreen/25' : 'bg-white/70 border-white/75'} border p-3">
          <div class="flex items-start justify-between gap-3">
            <div class="min-w-0">
              <div class="text-[10px] uppercase tracking-widest font-extrabold ${isFavorite ? 'text-mxgreen' : 'text-slate-400'}">${m.matchNo ? `M${m.matchNo} · ` : ''}${m.stage}${m.time ? ` · ${m.time}` : ''}</div>
              <div class="mt-1 font-extrabold text-sm leading-tight">${safeTeamLabel(ctx, m, "home")} <span class="px-1.5 ${watched ? 'text-ink' : 'text-slate-400'}">${watched ? scoreLine(m) : (due ? 'aguardando' : 'x')}</span> ${safeTeamLabel(ctx, m, "away")}</div>
            </div>
            <div class="flex-none">${calendarMatchAction(ctx, m)}</div>
          </div>
        </div>`;
      }).join("")}
      <div class="scroll-affordance">Mais jogos abaixo</div>
    </div>
    <div class="mt-4">${renderJourneyActionButtons(ctx)}</div>
    ${savedSimsPanel()}
    <button id="resetGuidedSmall" class="mt-3 text-xs font-extrabold text-slate-400 hover:text-usared">Reiniciar progresso desta simulação</button>
  </div>`;
}

// Scouting do próximo jogo da favorita (local, adversário, provável XI).
function renderNextFavoriteScouting(ctx){
  const nextFav = getNextVisibleMatch(ctx);
  if(!nextFav){
    return `<div class="rounded-2xl bg-slate-100/80 border border-white/70 p-3 text-sm font-extrabold text-slate-500">Sem próximo jogo pendente da sua seleção.</div>`;
  }
  const match = nextFav.match;
  const safe = getSpoilerSafeOpponent(ctx, match);
  if(!safe.canReveal){
    return `<div class="rounded-3xl bg-slate-100/80 border border-white/70 p-4">
      <div class="text-[10px] uppercase tracking-widest font-extrabold text-slate-400">Próximo jogo</div>
      <div class="mt-1 font-display font-extrabold text-xl leading-tight">${flag(ctx.team)} ${ctx.team} <span class="text-slate-400 px-1">x</span> <span class="text-slate-400 italic">${safe.label}</span></div>
      <p class="mt-2 text-sm font-semibold text-slate-500">${safe.reason}</p>
    </div>`;
  }
  const opponent = match.home === ctx.team ? match.away : match.home;
  const daysLeft = daysBetweenISO(ctx.currentDay.dateISO, match.dateISO);
  const lineup = WC_LINEUPS.buildLineup?.(opponent);
  const starters = (lineup?.starters || []).map(p => p.name).slice(0, 11);
  const shortName = name => {
    const parts = String(name || "").trim().split(/\s+/).filter(Boolean);
    if(parts.length <= 1) return parts[0] || "";
    return `${parts[0][0]}. ${parts[parts.length - 1]}`;
  };
  const gk = starters[0];
  const outfield = starters.slice(1, 11);
  return `<div class="rounded-3xl bg-mxgreen/10 border border-mxgreen/20 p-4">
    <div class="flex items-start justify-between gap-3">
      <div>
        <div class="text-[10px] uppercase tracking-widest font-extrabold text-mxgreen">Próximo jogo</div>
        <div class="mt-1 font-display font-extrabold text-xl leading-tight">${safeTeamLabel(ctx, match, "home")} <span class="text-slate-400 px-1">x</span> ${safeTeamLabel(ctx, match, "away")}</div>
      </div>
      <div class="text-right shrink-0">
        <div class="text-xs font-extrabold text-slate-700 tnum">${match.dateLabel}</div>
        <div class="text-[11px] font-bold text-slate-500">${daysLeft === 0 ? "É hoje" : `Faltam ${daysLeft} dia${daysLeft === 1 ? "" : "s"}`}${match.time ? ` · ${match.time}` : ""}</div>
      </div>
    </div>
    <div class="mt-3 grid sm:grid-cols-2 gap-2 text-xs">
      <div class="rounded-2xl bg-white/65 border border-white/70 p-2.5">
        <div class="uppercase tracking-widest font-extrabold text-slate-400 text-[9px]">Local</div>
        <div class="mt-1 font-extrabold text-slate-700">${match.venue || "Estádio a definir"}</div>
        <div class="text-slate-500 font-semibold">${match.city || matchScheduleLine(match)}</div>
      </div>
      <div class="rounded-2xl bg-white/65 border border-white/70 p-2.5">
        <div class="uppercase tracking-widest font-extrabold text-slate-400 text-[9px]">Adversário</div>
        <div class="mt-1 font-extrabold text-slate-700">${flag(opponent)} ${opponent}</div>
        <div class="text-slate-500 font-semibold">${TEAMS[opponent]?.shape || "Esquema indefinido"} · ${TEAMS[opponent]?.coach || "técnico a definir"}</div>
      </div>
    </div>
    <div class="mt-3 rounded-2xl bg-white/65 border border-white/70 p-3">
      <div class="text-[9px] uppercase tracking-widest font-extrabold text-slate-400">Provável escalação do adversário</div>
      <div class="mt-2 text-xs font-semibold text-slate-600 leading-relaxed">
        ${gk ? `<b>GK:</b> ${gk}<br>` : ""}
        ${outfield.length ? outfield.map(shortName).join(" · ") : "Escalação provável ainda indisponível."}
      </div>
    </div>
  </div>`;
}

// Painel "situação" da jornada: estado da chave (espectador), próxima
// partida, tabela do grupo ou últimos jogos do mata-mata.
function renderJourneySituation(ctx, options = {}){
  const {team, revealed, dayPhase, nextMatch, partialGroup, groupMatches, revealedMatches,
    observerMode, nextWatchMatch, lastWatchMatch, watchIndex, watchMatches, sim} = ctx;
  const showScouting = options.showScouting !== false;
  const nextScouting = renderNextFavoriteScouting(ctx);

  if(observerMode){
    const m = dayPhase === "morning" ? nextWatchMatch : lastWatchMatch;
    return `<div class="journey-hero-card guided-card rounded-[2rem] p-4 guided-enter">
      <div class="flex items-center justify-between gap-3 mb-3">
        <div>
          <div class="text-[11px] uppercase tracking-widest font-extrabold text-slate-400">${dayPhase === "morning" ? "Manhã · Copa continua" : "Noite · Resultado acompanhado"}</div>
          <h2 class="font-display font-extrabold text-2xl">Estado da chave</h2>
        </div>
        ${ic(dayPhase === "morning" ? 'eye' : 'git-fork', 'w-6 h-6 text-mxgreen')}
      </div>
      ${m ? `<div class="rounded-3xl bg-white/70 border border-white/75 p-4">
        <div class="text-[10px] uppercase tracking-widest font-extrabold text-slate-400">${m.stage}${m.matchNo ? ` · M${m.matchNo}` : ""}</div>
        <div class="mt-3 font-display font-extrabold text-lg leading-tight">${matchTeamLine(m)}</div>
        <div class="mt-3 text-sm font-semibold text-slate-500">${dayPhase === "morning" ? matchScheduleLine(m) : `${getMatchWinnerTeam(m) || "Empate"} segue na leitura da rodada.`}</div>
      </div>` : `<div class="rounded-3xl bg-white/70 border border-white/75 p-4">
        <div class="font-display font-extrabold text-xl">Copa em andamento</div>
        <div class="mt-2 text-sm font-semibold text-slate-500">Os próximos confrontos aparecem aqui conforme o calendário avança.</div>
      </div>`}
      <div class="mt-3 text-xs font-extrabold text-slate-500">${Math.min(watchIndex, watchMatches.length)}/${watchMatches.length} jogo(s) restantes acompanhados depois da eliminação.</div>
      ${showScouting ? `<div class="mt-3">${nextScouting}</div>` : ""}
      ${daySnapshotButtons()}
    </div>`;
  }

  const lastRevealed = revealedMatches[revealedMatches.length - 1];
  const inGroups = nextMatch ? isGroupStage(nextMatch) : lastRevealed && isGroupStage(lastRevealed) && revealed <= groupMatches.length;

  if(nextMatch){
    const safe = getSpoilerSafeOpponent(ctx, nextMatch);
    return `<div class="journey-hero-card guided-card rounded-[2rem] p-4 guided-enter">
      <div class="flex items-center justify-between gap-3 mb-3">
        <div>
          <div class="text-[11px] uppercase tracking-widest font-extrabold text-slate-400">${dayPhase === "night" ? "Noite de jogo" : "Manhã de jogo"}</div>
          <h2 class="font-display font-extrabold text-2xl">Próxima partida</h2>
        </div>
        ${ic('sun','w-6 h-6 text-gold-600')}
      </div>
      <div class="rounded-3xl bg-white/70 border border-white/75 p-4">
        <div class="text-[10px] uppercase tracking-widest font-extrabold text-slate-400">${nextMatch.stage}${nextMatch.matchNo ? ` · M${nextMatch.matchNo}` : ""}</div>
        <div class="mt-3 grid grid-cols-[1fr_auto_1fr] items-center gap-3">
          <div class="text-right font-extrabold">${safeTeamLabel(ctx, nextMatch, "home")}</div>
          <div class="rounded-xl bg-slate-100 px-2 py-1 text-xs font-black text-slate-400">VS</div>
          <div class="font-extrabold">${safeTeamLabel(ctx, nextMatch, "away")}</div>
        </div>
        <div class="mt-3 text-sm font-semibold text-slate-500">${safe.canReveal ? matchScheduleLine(nextMatch) : safe.reason}</div>
      </div>
      ${showScouting ? `<div class="mt-3">${nextScouting}</div>` : ""}
      ${partialGroup ? `<div class="mt-3">${compactGroupCard(partialGroup, team)}</div>` : ""}
      ${daySnapshotButtons()}
    </div>`;
  }

  if(inGroups && partialGroup){
    return `<div class="journey-hero-card guided-card rounded-[2rem] p-4 guided-enter">
      <div class="flex items-center justify-between gap-3 mb-3">
        <div>
          <div class="text-[11px] uppercase tracking-widest font-extrabold text-slate-400">${dayPhase === "night" ? "Noite · Tabela do dia" : "Tabela"}</div>
          <h2 class="font-display font-extrabold text-2xl">Grupo ${partialGroup.letter}</h2>
        </div>
        <span class="text-[11px] font-extrabold text-slate-400">${partialGroup.played}/3 rodadas</span>
      </div>
      ${compactGroupCard(partialGroup, team)}
      ${showScouting ? `<div class="mt-3">${nextScouting}</div>` : ""}
      <p class="mt-3 text-xs font-semibold text-slate-500">${dayPhase === "night" ? "Resultados do dia já entraram na classificação parcial." : "A tabela acompanha apenas o que já foi revelado na jornada."}</p>
      ${daySnapshotButtons()}
    </div>`;
  }

  const koMatches = revealedMatches.filter(m => !isGroupStage(m));
  return `<div class="journey-hero-card guided-card rounded-[2rem] p-4 guided-enter">
    <div class="flex items-center justify-between gap-3 mb-3">
      <div>
        <div class="text-[11px] uppercase tracking-widest font-extrabold text-slate-400">${dayPhase === "night" ? "Noite · Mata-mata" : "Mata-mata"}</div>
        <h2 class="font-display font-extrabold text-2xl">Estado da chave</h2>
      </div>
      ${ic('git-fork','w-6 h-6 text-mxgreen')}
    </div>
    <div class="space-y-2.5">
      ${koMatches.length ? koMatches.slice(-4).map(m => `<div class="rounded-2xl bg-white/65 border border-white/70 p-3">
        <div class="text-[10px] uppercase tracking-widest font-extrabold text-slate-400">${m.stage}</div>
        <div class="mt-1 font-extrabold text-sm leading-tight">${flag(m.home)} ${m.home} <span class="tnum px-1.5">${scoreLine(m)}</span> ${flag(m.away)} ${m.away}</div>
      </div>`).join("") : `<div class="rounded-2xl bg-white/65 border border-white/70 p-4 text-sm font-semibold text-slate-500">O mata-mata ainda não começou para ${flag(team)} ${team}.</div>`}
      ${nextMatch && !isGroupStage(nextMatch) ? `<div class="rounded-2xl border border-mxgreen/25 bg-mxgreen/10 p-3">
        <div class="text-[10px] uppercase tracking-widest font-extrabold text-mxgreen">Próximo confronto</div>
        <div class="mt-1 font-extrabold text-sm leading-tight">${safeTeamLabel(ctx, nextMatch, "home")} <span class="px-1.5 text-slate-400">x</span> ${safeTeamLabel(ctx, nextMatch, "away")}</div>
      </div>` : ""}
    </div>
    ${showScouting ? `<div class="mt-3">${nextScouting}</div>` : ""}
    ${daySnapshotButtons()}
  </div>`;
}

// Bloco "Campanha · Jogo a jogo" com barra de progresso (desktop e mobile).
function renderCampaignProgressHeader(team, matches, revealed, doneLabel = "Campanha concluída!"){
  const percent = matches.length ? Math.round(revealed / matches.length * 100) : 0;
  const remaining = matches.length - revealed;
  const statusLabel = revealed === 0 ? "Nenhum jogo revelado ainda"
    : revealed >= matches.length ? doneLabel
    : remaining === 1 ? "1 jogo restante"
    : `${remaining} jogos restantes`;
  return `<div class="flex items-start justify-between gap-4">
      <div>
        <div class="text-[11px] uppercase tracking-widest font-extrabold text-slate-400">Campanha de ${team}</div>
        <div class="font-display font-extrabold text-2xl">Jogo a jogo</div>
      </div>
      <div class="text-right shrink-0">
        <div class="text-[10px] uppercase tracking-widest font-extrabold text-slate-400">Progresso</div>
        <div class="font-extrabold text-xl tnum">${revealed}<span class="text-slate-400 font-semibold text-sm"> / ${matches.length}</span></div>
      </div>
    </div>
    <div class="mt-3 h-2.5 rounded-full bg-slate-200/70 overflow-hidden">
      <div class="h-full rounded-full" style="width:${percent}%;background:var(--grad-2026);transition:width .6s cubic-bezier(.2,.8,.2,1)"></div>
    </div>
    <div class="mt-1.5 flex items-center justify-between text-[10px] font-bold text-slate-400">
      <span>${statusLabel}</span>
      <span class="tnum">${percent}%</span>
    </div>`;
}

export { calendarMatchAction, campaignSummary, compactGroupCard, daySnapshotButtons, progressiveCampaign, renderCalendarDayCard, renderCampaignProgressHeader, renderIntroNav, renderJourneyActionButtons, renderJourneyClockPanel, renderJourneySituation, statusPill };

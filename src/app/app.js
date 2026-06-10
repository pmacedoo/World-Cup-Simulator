
/* =================================================================
   BOOTSTRAP DA APLICAÇÃO
   -----------------------------------------------------------------
   Inicialização, eventos globais (nav, dark mode, teclado), efeitos
   de página (reveal on scroll, scroll spy, loader) e o renderAll do
   dashboard completo.
   ================================================================= */

import { GROUPS } from "../data/worldcup-data.js";
import { loadDarkModePreference, saveDarkModePreference } from "../state/storage.js";
import { activeRecord, appState, loadSims } from "../state/simulation-store.js";
import { $, getFavoriteTeam, paintIcons, renderSimulationTypeControls } from "../ui/render-helpers.js";
import { closeSnapshotModal } from "../ui/journey/journey-snapshots.js";
import { commitSimulation, renderApp, renderFavoriteTeamJourney, renderSimulationTypePicker, startNewSimulation } from "../ui/journey/journey-screens.js";
import { renderFavoriteTeamDashboard, renderHeroCards, renderOverview, renderTabs } from "../ui/dashboard.js";
import { renderGroups, renderMatches, renderThirds } from "../ui/tournament-sections.js";
import { closeModal, renderBracket } from "../ui/bracket.js";
import { renderNarrative, renderStats } from "../ui/stats.js";
import { closeTacticPlanner } from "../ui/match/lineup-editor.js";
import { closeMatchSimulator } from "../ui/match/match-simulator.js";

/* ---------- dark mode ---------- */
function applyDarkMode(dark){
  document.documentElement.classList.toggle("dark-mode", dark);
  document.querySelectorAll(".dark-mode-toggle i[data-lucide]").forEach(icon => {
    icon.dataset.lucide = dark ? "sun" : "moon";
  });
  document.querySelectorAll(".dark-mode-toggle").forEach(btn => {
    const label = dark ? "Alternar para modo claro" : "Alternar para modo escuro";
    btn.title = label;
    btn.setAttribute("aria-label", label);
  });
  paintIcons();
}

function toggleDarkMode(){
  appState.darkMode = !appState.darkMode;
  saveDarkModePreference(appState.darkMode);
  applyDarkMode(appState.darkMode);
  // re-renderiza a experiência guiada para atualizar tom da casca e ícone
  if(["journey", "picker-team", "picker-type"].includes(appState.view)) renderApp();
}

/* ---------- dashboard completo ---------- */
function renderAll(){
  renderTabs();
  renderHeroCards();
  renderSimulationTypeControls("heroTypeControls", true);
  renderFavoriteTeamDashboard();
  renderOverview();
  renderGroups();
  renderMatches();
  renderThirds();
  renderBracket();
  renderNarrative();
  renderStats();
  paintIcons();
  observeReveals();
}

function fillGroupFilter(){
  $("#filterGroup").innerHTML = `<option value="all">Todos os grupos</option>` +
    GROUPS.map(([letter]) => `<option value="${letter}">Grupo ${letter}</option>`).join("");
}

/* ---------- criação de simulações a partir do dashboard ---------- */
// Com seleção definida, "gerar por tipo" cria direto uma nova simulação
// com a mesma seleção; sem seleção, abre o assistente completo.
function generateSimulation(type){
  const team = getFavoriteTeam();
  if(!team){ startNewSimulation(); return; }
  if(!type){
    appState.draftTeam = team;
    appState.view = "picker-type";
    renderSimulationTypePicker();
    return;
  }
  commitSimulation(team, type);
}

// botão "Nova simulação" do dashboard/nav -> assistente do zero
function generateNew(){ startNewSimulation(); }

/* ---------- barra de loading ---------- */
function flashLoader(){
  const loader = $("#loader");
  loader.style.opacity = "1";
  loader.style.width = "0";
  requestAnimationFrame(() => { loader.style.width = "78%"; });
  setTimeout(() => {
    loader.style.width = "100%";
    setTimeout(() => { loader.style.opacity = "0"; loader.style.width = "0"; }, 300);
  }, 420);
}

/* ---------- reveal on scroll ----------
   Passada síncrona revela tudo que já está no viewport (funciona mesmo
   sem timers); o IntersectionObserver cuida do resto durante o scroll.
   Qualquer falha degrada para conteúdo totalmente visível. */
let revealObserver;
function revealInView(){
  const viewportLimit = (window.innerHeight || 800) * 1.2;
  document.querySelectorAll(".reveal:not(.in)").forEach(node => {
    if(node.getBoundingClientRect().top < viewportLimit) node.classList.add("in");
  });
}
function observeReveals(){
  if(!("IntersectionObserver" in window)){
    document.querySelectorAll(".reveal").forEach(node => node.classList.add("in"));
    return;
  }
  if(!revealObserver){
    revealObserver = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if(entry.isIntersecting){
          entry.target.classList.add("in");
          revealObserver.unobserve(entry.target);
        }
      });
    }, {threshold:.05, rootMargin:"0px 0px -4% 0px"});
  }
  document.querySelectorAll(".reveal:not(.in)").forEach(node => revealObserver.observe(node));
  revealInView();                        // revela o que já está acima da dobra
  requestAnimationFrame(revealInView);   // pega posições pós-layout
}
// redes de segurança caso scroll/IO nunca disparem
window.addEventListener("scroll", () => revealInView(), {passive:true});
window.addEventListener("load", () => setTimeout(() => document.querySelectorAll(".reveal").forEach(node => node.classList.add("in")), 1400));

/* ---------- scroll spy da navegação ---------- */
function setupScrollSpy(){
  const sectionIds = ["overview", "minha", "mata", "grupos", "terceiros", "jogos", "stats", "roteiro"];
  const links = [...document.querySelectorAll(".nav-link")];
  const observer = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if(entry.isIntersecting){
        links.forEach(link => link.classList.toggle("active", link.getAttribute("href") === "#" + entry.target.id));
      }
    });
  }, {rootMargin:"-45% 0px -50% 0px"});
  sectionIds.forEach(id => {
    const section = document.getElementById(id);
    if(section) observer.observe(section);
  });
}

/* ---------- teclado: ESC fecha o modal aberto ---------- */
function closeTopmostModalOnEscape(){
  const isOpen = id => { const m = $(id); return m && !m.classList.contains("hidden"); };
  if(isOpen("#matchSimulator")){ closeMatchSimulator(); renderFavoriteTeamJourney(); return; }
  if(isOpen("#tacticPlanner")){ closeTacticPlanner(true); return; }
  if(isOpen("#snapshotModal")){ closeSnapshotModal(); return; }
  closeModal();
}

/* ---------- init ---------- */
function init(){
  // flag de progressive enhancement: o reveal só esconde conteúdo com JS ativo
  document.documentElement.classList.add("js");

  appState.darkMode = loadDarkModePreference();
  applyDarkMode(appState.darkMode);

  loadSims();
  appState.view = appState.sims.length
    ? (activeRecord()?.dashboardUnlocked ? "dashboard" : "journey")
    : "picker-team";
  fillGroupFilter();

  // eventos globais
  $("#filterGroup").onchange = renderMatches;
  $("#filterRound").onchange = renderMatches;
  $("#heroGenerate").onclick = generateNew;
  $("#navGenerate").onclick = generateNew;
  $("#mobGenerate").onclick = () => { $("#mobMenu").classList.add("hidden"); generateNew(); };
  $("#mobBtn").onclick = () => $("#mobMenu").classList.toggle("hidden");
  document.querySelectorAll("#mobMenu a").forEach(a => a.onclick = () => $("#mobMenu").classList.add("hidden"));
  document.addEventListener("keydown", e => { if(e.key === "Escape") closeTopmostModalOnEscape(); });
  // dark mode: botão fixo do header + botões da jornada (re-renderizados a
  // cada tela), via delegação para não acumular listeners
  const darkToggle = $("#darkModeToggle");
  if(darkToggle) darkToggle.onclick = toggleDarkMode;
  document.addEventListener("click", e => {
    if(e.target.closest(".guided-dark-toggle")) toggleDarkMode();
  });

  renderApp();
  setupScrollSpy();
  revealInView();
}

document.addEventListener("DOMContentLoaded", () => {
  try {
    init();
  } catch(err){
    console.error("Falha ao iniciar a simulação:", err);
    // garante que o conteúdo apareça mesmo em caso de erro
    document.documentElement.classList.remove("js");
    document.querySelectorAll(".reveal").forEach(node => node.classList.add("in"));
  }
});

export { flashLoader, generateSimulation, renderAll };

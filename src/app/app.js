"use strict";

/* =================================================================
   DARK MODE
   ================================================================= */
const DARK_MODE_KEY = "wc_dark_mode";

function applyDarkMode(dark){
  document.documentElement.classList.toggle("dark-mode", dark);
  document.querySelectorAll(".dark-mode-toggle i[data-lucide]").forEach(icon=>{
    icon.dataset.lucide = dark ? "sun" : "moon";
  });
  document.querySelectorAll(".dark-mode-toggle").forEach(btn=>{
    btn.title = dark ? "Alternar para modo claro" : "Alternar para modo escuro";
    btn.setAttribute("aria-label", dark ? "Alternar para modo claro" : "Alternar para modo escuro");
  });
  paintIcons();
}

function toggleDarkMode(){
  appState.darkMode = !appState.darkMode;
  try { localStorage.setItem(DARK_MODE_KEY, String(appState.darkMode)); } catch{}
  applyDarkMode(appState.darkMode);
  // Re-render guided experience to update shell tone and toggle icon
  if(appState.view==="journey" || appState.view==="picker-team" || appState.view==="picker-type"){
    renderApp();
  }
}

/* =================================================================
   RENDER ALL + interações
   ================================================================= */
function renderAll(){
  renderTabs(); renderHeroCards(); renderSimulationTypeControls("heroTypeControls", true);
  renderFavoriteTeamDashboard(); renderOverview(); renderGroups();
  renderMatches(); renderThirds(); renderBracket(); renderNarrative(); renderStats();
  paintIcons();      // converte todos os <i data-lucide> em SVG
  observeReveals();
}
function setActive(i){
  const rec=appState.sims[i]; if(!rec) return;
  setActiveSimulation(rec.id);
  syncDashboardState();
  document.querySelectorAll("main section").forEach(s=>{ s.classList.remove("swap"); void s.offsetWidth; s.classList.add("swap"); });
  flashLoader();
  renderAll();
}

/* ---- group filter options ---- */
function fillGroupFilter(){
  const sel=$("#filterGroup");
  sel.innerHTML = `<option value="all">Todos os grupos</option>` +
    GROUPS.map(([L])=>`<option value="${L}">Grupo ${L}</option>`).join("");
}

/* ---- gerar uma NOVA simulação salva ----
   Com seleção+tipo definidos (ex.: botão "trocar tipo" da jornada), cria
   direto uma nova simulação com a mesma seleção; senão abre o assistente. */
function generateSimulation(type){
  const team=getFavoriteTeam();
  if(!team){ startNewSimulation(); return; }
  if(!type){ appState.draftTeam=team; appState.view="picker-type"; renderSimulationTypePicker(); return; }
  commitSimulation(team, type);
}
// botão "Nova simulação" do dashboard/nav → assistente de criação do zero
function generateNew(){ startNewSimulation(); }

/* ---- loading bar ---- */
function flashLoader(){
  const l=$("#loader");
  l.style.opacity="1"; l.style.width="0";
  requestAnimationFrame(()=>{ l.style.width="78%"; });
  setTimeout(()=>{ l.style.width="100%"; setTimeout(()=>{ l.style.opacity="0"; l.style.width="0"; },300); }, 420);
}

/* ---- reveal on scroll (robust) ----
   Synchronous pass reveals everything already in/above the viewport
   (works even without timers); IntersectionObserver handles the rest
   as the user scrolls. Any failure falls back to fully visible. */
let revealObs;
function revealInView(){
  const vh = (window.innerHeight || 800) * 1.2;
  document.querySelectorAll(".reveal:not(.in)").forEach(e=>{
    const r = e.getBoundingClientRect();
    if(r.top < vh) e.classList.add("in");
  });
}
function observeReveals(){
  if(!("IntersectionObserver" in window)){
    document.querySelectorAll(".reveal").forEach(e=>e.classList.add("in"));
    return;
  }
  if(!revealObs){
    revealObs=new IntersectionObserver((es)=>{ es.forEach(e=>{ if(e.isIntersecting){ e.target.classList.add("in"); revealObs.unobserve(e.target);} }); },{threshold:.05, rootMargin:"0px 0px -4% 0px"});
  }
  document.querySelectorAll(".reveal:not(.in)").forEach(e=>revealObs.observe(e));
  revealInView();                       // immediate above-the-fold reveal
  requestAnimationFrame(revealInView);  // catch post-layout positions
}
// extra safety nets in case scroll/IO never fire
window.addEventListener("scroll", ()=>revealInView(), {passive:true});
window.addEventListener("load", ()=> setTimeout(()=>document.querySelectorAll(".reveal").forEach(e=>e.classList.add("in")), 1400));

/* ---- scroll spy for nav ---- */
function setupScrollSpy(){
  const ids=["overview","minha","mata","grupos","terceiros","jogos","stats","roteiro"];
  const links=[...document.querySelectorAll(".nav-link")];
  const obs=new IntersectionObserver((es)=>{
    es.forEach(e=>{ if(e.isIntersecting){ links.forEach(l=>l.classList.toggle("active", l.getAttribute("href")==="#"+e.target.id)); } });
  },{rootMargin:"-45% 0px -50% 0px"});
  ids.forEach(id=>{ const s=document.getElementById(id); if(s) obs.observe(s); });
}

/* =================================================================
   INIT
   ================================================================= */
function init(){
  // progressive-enhancement flag: enables reveal hiding only when JS runs
  document.documentElement.classList.add("js");

  // Dark mode: load from localStorage
  try { appState.darkMode = localStorage.getItem(DARK_MODE_KEY)==="true"; } catch{ appState.darkMode=false; }
  applyDarkMode(appState.darkMode);

  // carrega simulações salvas pelo usuário (não há mais 3 simulações padrão)
  loadSims();
  if(appState.sims.length){
    syncDashboardState();
    appState.view = activeRecord()?.dashboardUnlocked ? "dashboard" : "journey";
  } else {
    appState.view = "picker-team";
  }
  fillGroupFilter();

  // events
  $("#filterGroup").onchange=renderMatches;
  $("#filterRound").onchange=renderMatches;
  $("#heroGenerate").onclick=generateNew;
  $("#navGenerate").onclick=generateNew;
  $("#mobGenerate").onclick=()=>{ $("#mobMenu").classList.add("hidden"); generateNew(); };
  $("#mobBtn").onclick=()=> $("#mobMenu").classList.toggle("hidden");
  document.querySelectorAll("#mobMenu a").forEach(a=> a.onclick=()=> $("#mobMenu").classList.add("hidden"));
  document.addEventListener("keydown",e=>{ if(e.key==="Escape") closeModal(); });
  // Dark mode toggle (static header button; guided nav buttons wired after each render via event delegation)
  const dmToggle=$("#darkModeToggle"); if(dmToggle) dmToggle.onclick=toggleDarkMode;
  document.addEventListener("click",e=>{
    const btn=e.target.closest(".guided-dark-toggle");
    if(btn) toggleDarkMode();
  });

  renderApp();
  setupScrollSpy();
  revealInView();
}
document.addEventListener("DOMContentLoaded", ()=>{
  try { init(); }
  catch(err){
    console.error("Falha ao iniciar a simulação:", err);
    // garante que o conteúdo apareça mesmo em caso de erro
    document.documentElement.classList.remove("js");
    document.querySelectorAll(".reveal").forEach(e=>e.classList.add("in"));
  }
});






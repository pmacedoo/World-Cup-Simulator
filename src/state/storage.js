
/* =================================================================
   CAMADA DE PERSISTÊNCIA (localStorage)
   -----------------------------------------------------------------
   Único ponto do app que toca o localStorage. Todas as chaves ficam
   centralizadas aqui; o restante do código usa as funções abaixo e
   nunca acessa o storage diretamente.
   ================================================================= */
const STORAGE_KEYS = Object.freeze({
  simulations: "wc_simulations_v1",
  activeSimulation: "wc_active_simulation_v1",
  darkMode: "wc_dark_mode",
});

// Acesso tolerante a falhas (modo privado, storage cheio, etc.):
// ler devolve null e gravar/remover viram no-ops silenciosos.
function storageGet(key){ try{ return localStorage.getItem(key); }catch{ return null; } }
function storageSet(key, value){ try{ localStorage.setItem(key, value); }catch{} }
function storageRemove(key){ try{ localStorage.removeItem(key); }catch{} }

function storageGetJSON(key, fallback){
  try{
    const parsed = JSON.parse(storageGet(key));
    return parsed ?? fallback;
  }catch{
    return fallback;
  }
}
function storageSetJSON(key, value){ storageSet(key, JSON.stringify(value)); }

/* ---- preferências do usuário ---- */
function loadDarkModePreference(){ return storageGet(STORAGE_KEYS.darkMode) === "true"; }
function saveDarkModePreference(enabled){ storageSet(STORAGE_KEYS.darkMode, String(enabled)); }

export { STORAGE_KEYS, loadDarkModePreference, saveDarkModePreference, storageGet, storageGetJSON, storageSet, storageSetJSON };

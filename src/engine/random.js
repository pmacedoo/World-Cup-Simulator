"use strict";

/* =================================================================
   PRNG determinístico (mulberry32) + utilidades
   ================================================================= */
function mulberry32(seed){
  let a = seed >>> 0;
  return function(){
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
let RND = Math.random; // substituído por simulação
const rand  = () => RND();
const rint  = (n) => Math.floor(RND()*n);
const pick  = (arr) => arr[rint(arr.length)];
const clamp = (v,a,b) => Math.max(a, Math.min(b, v));
function poisson(lambda){ // amostra de Poisson via Knuth
  const L = Math.exp(-lambda); let k=0, p=1;
  do { k++; p *= RND(); } while (p > L);
  return k-1;
}

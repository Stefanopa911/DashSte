(function(){
  "use strict";
  const $$ = (sel) => Array.from(document.querySelectorAll(sel));
  const $ = (id) => document.getElementById(id);

  function setActiveScreen(id){
    $$(".screen").forEach(s => s.classList.remove("active"));
    const el = $(id);
    if(el) el.classList.add("active");
    $$(".bbtn").forEach(b => b.classList.toggle("active", b.getAttribute("data-screen") === id));
    // scroll top for screen change (mobile UX)
    window.scrollTo({top:0, behavior:"smooth"});
  }

  function wire(){
    $$(".bbtn").forEach(b => {
      b.addEventListener("click", () => {
        const id = b.getAttribute("data-screen");
        if(id) setActiveScreen(id);
      });
    });

    // Table compact/full
    const tableCard = document.querySelector(".tableCard");
    const btnCompact = $("btnCompact");
    const btnFull = $("btnFull");
    if(btnCompact && tableCard){
      btnCompact.addEventListener("click", () => tableCard.classList.remove("table-full"));
    }
    if(btnFull && tableCard){
      btnFull.addEventListener("click", () => tableCard.classList.add("table-full"));
    }

    // Default: dashboard
    setActiveScreen("screen-dashboard");
  }

  if(document.readyState === "loading") document.addEventListener("DOMContentLoaded", wire);
  else wire();
})();
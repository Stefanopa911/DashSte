(function(){
  "use strict";
  const $ = (id) => document.getElementById(id);

  function activate(tabId){
    document.querySelectorAll(".seg-btn").forEach(x => x.classList.remove("active"));
    document.querySelectorAll(".bn").forEach(x => x.classList.remove("active"));
    document.querySelectorAll(".panel").forEach(p => p.classList.remove("active"));
    document.querySelectorAll(`[data-tab="${tabId}"]`).forEach(x => x.classList.add("active"));
    const panel = document.getElementById(tabId);
    if(panel) panel.classList.add("active");

    const drawer = $("drawer");
    const bd = $("drawerBackdrop");
    if(drawer && bd && window.matchMedia("(max-width: 991px)").matches){
      drawer.classList.remove("open");
      bd.classList.remove("open");
    }
  }

  function wire(){
    document.querySelectorAll("[data-tab]").forEach(t => {
      t.addEventListener("click", () => {
        const id = t.getAttribute("data-tab");
        if(id) activate(id);
      });
    });

    const btn = $("btnDrawer");
    const drawer = $("drawer");
    const bd = $("drawerBackdrop");
    if(btn && drawer && bd){
      btn.addEventListener("click", () => { drawer.classList.add("open"); bd.classList.add("open"); });
      bd.addEventListener("click", () => { drawer.classList.remove("open"); bd.classList.remove("open"); });
    }
  }

  if(document.readyState === "loading") document.addEventListener("DOMContentLoaded", wire);
  else wire();
})();
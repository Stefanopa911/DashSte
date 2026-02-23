(function(){
  "use strict";
  const $ = (id) => document.getElementById(id);
  function boot(){
    // Version pill is set by app.js too; keep safe
    const v = $("ver");
    if(v && v.textContent.trim() === "") v.textContent = "v8.0";
  }
  if(document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
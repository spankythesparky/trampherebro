/* Site-wide search for trampherebro.com — magnifier button + overlay. No dependencies. */
(function(){
  var IDX = null, loading = false, btn, overlay, input, panel, items = [], sel = -1;

  function css(){
    if(document.getElementById("thb-search-css")) return;
    var s = document.createElement("style"); s.id = "thb-search-css";
    s.textContent =
      '#thb-searchbtn{cursor:pointer;border:1px solid var(--line);background:var(--card);color:var(--navy);border-radius:8px;' +
        'width:34px;height:30px;font-size:15px;line-height:1;margin-left:8px;flex:none;vertical-align:middle;order:98}' +
      '.nav #thb-searchbtn,html[data-theme="dark"] #thb-searchbtn{background:transparent;color:#fff;border-color:rgba(255,255,255,.35)}' +
      '#thb-searchbtn:hover{border-color:#FF6B00}' +
      '#thb-overlay{position:fixed;inset:0;background:rgba(5,14,32,.55);backdrop-filter:blur(2px);z-index:10000;display:none;' +
        'align-items:flex-start;justify-content:center;padding:12vh 16px 16px}' +
      '#thb-overlay.on{display:flex}' +
      '#thb-modal{width:560px;max-width:100%;background:#fff;color:#0f2a52;border-radius:14px;overflow:hidden;box-shadow:0 24px 70px rgba(0,0,0,.45)}' +
      'html[data-theme="dark"] #thb-modal{background:#132034;color:#E7EEF9}' +
      '#thb-modal input{width:100%;box-sizing:border-box;padding:16px 18px;border:0;border-bottom:1px solid rgba(127,127,127,.25);' +
        'font:500 16px Inter,system-ui,sans-serif;background:transparent;color:inherit;outline:none}' +
      '#thb-results{max-height:56vh;overflow:auto}' +
      '#thb-results .thb-g{padding:10px 18px 4px;font:700 11px Inter,sans-serif;letter-spacing:.09em;text-transform:uppercase;opacity:.55}' +
      '#thb-results a{display:block;padding:10px 18px;text-decoration:none;color:inherit}' +
      '#thb-results a .thb-t{font:600 15px Inter,sans-serif}' +
      '#thb-results a .thb-s{font-size:13px;opacity:.7;margin-top:1px}' +
      '#thb-results a.on,#thb-results a:hover{background:rgba(255,107,0,.16)}' +
      '#thb-hint{padding:10px 18px;font-size:12px;opacity:.6;border-top:1px solid rgba(127,127,127,.2)}';
    document.head.appendChild(s);
  }

  function load(){
    if(IDX || loading) return;
    loading = true;
    fetch("/search-index.json").then(function(r){ return r.json(); })
      .then(function(j){ IDX = j; loading = false; if(input && input.value) run(); })
      .catch(function(){ loading = false; });
  }

  function score(e, q){
    var t = e.t.toLowerCase(), s = (e.s || "").toLowerCase();
    if(t === q) return 100;
    if(t.indexOf(q) === 0) return 80;
    if(t.indexOf(q) > -1) return 60;
    if(s.indexOf(q) > -1) return 40;
    var d = q.replace(/\D/g, "");
    if(d && t.replace(/\D/g, "").indexOf(d) > -1) return 50;
    return 0;
  }

  function run(){
    var q = input.value.trim().toLowerCase();
    panel.innerHTML = ""; items = []; sel = -1;
    if(!q) return;
    if(!IDX){ load(); return; }
    var hits = [];
    for(var i = 0; i < IDX.length; i++){
      var sc = score(IDX[i], q);
      if(sc) hits.push({ e: IDX[i], sc: sc });
    }
    hits.sort(function(a, b){ return b.sc - a.sc || a.e.t.length - b.e.t.length; });
    hits = hits.slice(0, 14);
    if(!hits.length){
      var n = document.createElement("div"); n.className = "thb-g"; n.style.textTransform = "none";
      n.style.letterSpacing = "0"; n.style.fontWeight = "500"; n.style.fontSize = "13.5px";
      n.textContent = "Nothing found for " + input.value.trim();
      panel.appendChild(n);
      return;
    }
    var group = "";
    hits.forEach(function(h){
      if(h.e.g !== group){
        group = h.e.g;
        var g = document.createElement("div"); g.className = "thb-g";
        g.textContent = group === "Local" ? "Locals" : "Pages";
        panel.appendChild(g);
      }
      var a = document.createElement("a");
      a.href = h.e.u;
      var t = document.createElement("div"); t.className = "thb-t"; t.textContent = h.e.t; a.appendChild(t);
      if(h.e.s){ var d = document.createElement("div"); d.className = "thb-s"; d.textContent = h.e.s; a.appendChild(d); }
      panel.appendChild(a);
      items.push(a);
    });
    sel = 0; mark();
  }

  function mark(){ items.forEach(function(a, i){ a.className = (i === sel ? "on" : ""); }); }
  function open(){ load(); overlay.classList.add("on"); input.value = ""; panel.innerHTML = ""; items = []; sel = -1; setTimeout(function(){ input.focus(); }, 10); }
  function close(){ overlay.classList.remove("on"); }

  function build(){
    if(document.getElementById("thb-searchbtn")) return true;
    var lt = document.querySelector(".langtog");
    var nv = document.querySelector("nav.nav") || document.querySelector(".nav");
    if(!lt && !nv) return false;
    css();

    btn = document.createElement("button");
    btn.id = "thb-searchbtn"; btn.type = "button";
    btn.setAttribute("aria-label", "Search the site");
    btn.innerHTML = "&#9906;";
    btn.onclick = open;
    if(lt) lt.appendChild(btn); else nv.parentNode.insertBefore(btn, nv.nextSibling);

    overlay = document.createElement("div"); overlay.id = "thb-overlay";
    var modal = document.createElement("div"); modal.id = "thb-modal";
    input = document.createElement("input");
    input.type = "search"; input.placeholder = "Search locals, cities, pages…";
    input.setAttribute("aria-label", "Search");
    panel = document.createElement("div"); panel.id = "thb-results";
    var hint = document.createElement("div"); hint.id = "thb-hint";
    hint.textContent = "Type a local number, city or page · Enter to open · Esc to close";
    modal.appendChild(input); modal.appendChild(panel); modal.appendChild(hint);
    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    overlay.addEventListener("click", function(e){ if(e.target === overlay) close(); });
    input.addEventListener("input", run);
    input.addEventListener("keydown", function(e){
      if(e.key === "Escape"){ close(); return; }
      if(!items.length) return;
      if(e.key === "ArrowDown"){ e.preventDefault(); sel = (sel + 1) % items.length; mark(); items[sel].scrollIntoView({block:"nearest"}); }
      else if(e.key === "ArrowUp"){ e.preventDefault(); sel = (sel - 1 + items.length) % items.length; mark(); items[sel].scrollIntoView({block:"nearest"}); }
      else if(e.key === "Enter"){ e.preventDefault(); if(sel > -1) window.location.href = items[sel].href; }
    });
    document.addEventListener("keydown", function(e){
      var tag = (document.activeElement || {}).tagName || "";
      if(/^(INPUT|TEXTAREA|SELECT)$/.test(tag)) return;
      if(e.key === "/" || ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k")){ e.preventDefault(); open(); }
    });
    return true;
  }

  if(document.readyState === "loading") document.addEventListener("DOMContentLoaded", build);
  else build();
})();

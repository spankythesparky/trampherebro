(function(){
  function get(){ try{ var t=localStorage.getItem("thb-theme"); if(t) return t; }catch(e){}
    return (window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches) ? "dark" : "light"; }
  function set(t){ document.documentElement.setAttribute("data-theme",t);
    try{ localStorage.setItem("thb-theme",t); }catch(e){}
    if(window.thbSweep) setTimeout(window.thbSweep,20);
    var b=document.getElementById("thb-toggle"); if(b) b.textContent = (t==="dark") ? "\u2600" : "\u263E"; }
  document.documentElement.setAttribute("data-theme", get());
  function css(){
    if(document.getElementById("thb-theme-css")) return;
    var s=document.createElement("style"); s.id="thb-theme-css";
    s.textContent =
      ':root{--ink:#1E293B}' +
      'html[data-theme="dark"]{--bg:#0B1220;--card:#132034;--ink:#E7EEF9;--charcoal:#E7EEF9;--slate:#9CB0CC;--line:#27364E;--line2:#1D2B41;--shadow:0 1px 2px rgba(0,0,0,.45),0 6px 20px rgba(0,0,0,.5);--shadow-lg:0 2px 6px rgba(0,0,0,.5),0 14px 40px rgba(0,0,0,.6)}' +
      'html[data-theme="dark"] body{background:var(--bg);color:var(--ink)}' +
      'html[data-theme="dark"] h1,html[data-theme="dark"] h2,html[data-theme="dark"] h3,html[data-theme="dark"] h4{color:var(--ink)}' +
      'html[data-theme="dark"] .hs-body,html[data-theme="dark"] .hs-body b{color:var(--ink)}' +
      'html[data-theme="dark"] img[alt="TrampHereBro"]{background:#fff;padding:4px 7px;border-radius:9px}' +
      'html[data-theme="dark"] .nav a{color:#DCE6F5}' +
      'html[data-theme="dark"] .nav a.on{color:#FF6B00}' +
      'html[data-theme="dark"] .ddmenu a{color:var(--ink)}' +
      'html[data-theme="dark"] .sec-h{color:var(--ink)}' +
      'html[data-theme="dark"] .tabs button{color:#B9C7DD}' +
      'html[data-theme="dark"] .tabs button.on{color:#FF6B00}' +
      'html[data-theme="dark"] .ctabs button{color:#B9C7DD}' +
      'html[data-theme="dark"] .topcalls,html[data-theme="dark"] .topcalls-h,html[data-theme="dark"] .topcalls-inner,html[data-theme="dark"] .toplist,html[data-theme="dark"] #topcalls-toggle{color:var(--ink)}' +
      'html[data-theme="dark"] .states,html[data-theme="dark"] .states a,html[data-theme="dark"] .hotstrip{color:var(--ink)}' +
      '.nav #thb-toggle{background:transparent;color:#fff;border-color:rgba(255,255,255,.35)}' +
      'html[data-theme="dark"] .ddmenu a:hover,html[data-theme="dark"] .ddmenu a:focus{background:rgba(255,255,255,.12) !important;color:#fff !important}' +
      'html[data-theme="dark"] .nav a:hover{background:rgba(255,255,255,.10) !important;color:#fff !important}' +
      'html[data-theme="dark"] .calc-row:hover{background:rgba(255,255,255,.10) !important}' +
      'html[data-theme="dark"] .calc-row.me{background:rgba(255,107,0,.16) !important}' +
      'html[data-theme="dark"] .calc-row,html[data-theme="dark"] .calc-row *{color:var(--ink)}' +
      '#thb-toggle{cursor:pointer;border:1px solid var(--line);background:var(--card);color:var(--navy);border-radius:8px;width:34px;height:30px;font-size:15px;line-height:1;margin-left:8px;flex:none;vertical-align:middle}' +
      'html[data-theme="dark"] #thb-toggle{border-color:rgba(255,255,255,.35);background:transparent;color:#fff}' +
      '#thb-toggle:hover{border-color:#FF6B00}';
    document.head.appendChild(s);
  }
  function btn(){
    if(document.getElementById("thb-toggle")) return;
    var lt=document.querySelector(".langtog"); var nv=document.querySelector("nav.nav")||document.querySelector(".nav"); if(!lt && !nv) return;
    var b=document.createElement("button"); b.id="thb-toggle"; b.type="button";
    b.setAttribute("aria-label","Toggle night mode");
    b.textContent = (document.documentElement.getAttribute("data-theme")==="dark") ? "\u2600" : "\u263E";
    b.onclick=function(){ set(document.documentElement.getAttribute("data-theme")==="dark" ? "light" : "dark"); };
    if(lt){ lt.appendChild(b); } else { b.style.marginLeft="10px"; nv.parentNode.insertBefore(b, nv.nextSibling); }
  }
  var NAVY = ["rgb(7, 37, 84)","rgb(12, 46, 99)","rgb(15, 42, 82)","rgb(10, 35, 80)","rgb(11, 42, 92)"];
  function lum(c){ var m=/rgba?\((\d+), (\d+), (\d+)(?:, ([\d.]+))?\)/.exec(c); if(!m) return -1;
    if(m[4]!==undefined && parseFloat(m[4])<0.5) return -1;
    return 0.299*(+m[1]) + 0.587*(+m[2]) + 0.114*(+m[3]); }
  function light(c){ var m=/rgb\((\d+), (\d+), (\d+)\)/.exec(c); if(!m) return false;
    return (0.299*(+m[1]) + 0.587*(+m[2]) + 0.114*(+m[3])) > 150; }
  function sweep(){
    if(document.documentElement.getAttribute("data-theme")!=="dark") return;
    var all=document.querySelectorAll("body *"), i, el, cs;
    for(i=0;i<all.length;i++){ el=all[i]; cs=window.getComputedStyle(el);
      var bi=cs.backgroundImage;
      if(bi && bi.indexOf("gradient")>-1){
        var cols=bi.match(/rgba?\([^)]+\)/g)||[], tot=0, cnt=0;
        for(var q=0;q<cols.length;q++){ var lv=lum(cols[q]); if(lv>=0){ tot+=lv; cnt++; } }
        if(cnt && tot/cnt>200){
          el.style.setProperty("background-image","none","important");
          el.style.setProperty("background-color","var(--card)","important");
          cs=window.getComputedStyle(el);
        }
      }
      var bg=cs.backgroundColor, t=el.tagName;
      if(t!=="IMG" && t!=="SVG" && t!=="CANVAS" && t!=="VIDEO" && lum(bg)>200){
        el.style.setProperty("background","var(--card)","important");
        if(!el.getAttribute("data-thb-fixed")){ el.style.color="var(--ink)"; el.setAttribute("data-thb-fixed","1"); }
        cs=window.getComputedStyle(el);
      }
      if(NAVY.indexOf(cs.color)>-1 && !light(cs.backgroundColor)) el.style.color="var(--ink)"; }
  }
  window.thbSweep = sweep;
  setTimeout(sweep, 60); setTimeout(sweep, 700); setTimeout(sweep, 2000);
  document.addEventListener("click", function(){ setTimeout(sweep, 120); }, true);
  document.addEventListener("mouseover", function(e){
    if(document.documentElement.getAttribute("data-theme")!=="dark") return;
    var el=e.target; if(!el || !el.tagName) return;
    for(var i=0;i<4 && el && el.tagName;i++){
      var t=el.tagName;
      if(t!=="IMG" && t!=="SVG" && t!=="CANVAS"){
        var cs=window.getComputedStyle(el);
        if(lum(cs.backgroundColor)>200){ el.style.setProperty("background","rgba(255,255,255,.10)","important"); el.style.setProperty("color","var(--ink)","important"); }
      }
      el = el.parentElement;
    }
  }, true);

  if(document.readyState==="loading"){ document.addEventListener("DOMContentLoaded", function(){ css(); btn(); }); }
  else { css(); btn(); }
})();

/* mobile nav in dark mode — hamburger bars and dropdown links */
(function(){
  var s = document.createElement("style");
  s.id = "thb-mobnav-dark";
  s.textContent =
    'html[data-theme="dark"] .navtoggle span{background:#E7EEF9 !important}' +
    '@media(max-width:640px){' +
      'html[data-theme="dark"] .nav{background:#132034 !important;border-color:rgba(255,255,255,.14) !important}' +
      'html[data-theme="dark"] .nav a{color:#C6D3E6 !important}' +
      'html[data-theme="dark"] .nav a.on{background:rgba(255,255,255,.08) !important;color:#fff !important}' +
    '}';
  (document.head || document.documentElement).appendChild(s);
})();

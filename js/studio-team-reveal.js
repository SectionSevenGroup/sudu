(function(){
  if(window.__suduTeamRevealWired)return;
  window.__suduTeamRevealWired=1;
  var REDUCED=window.matchMedia('(prefers-reduced-motion: reduce)');
  var DELAY=250,DUR=1900,EASE='cubic-bezier(.16,1,.3,1)';
  function get(){return document.getElementById('teamIllustration');}
  function settle(im){if(!im)return;im.style.transition='none';im.style.opacity='1';im.setAttribute('data-team-revealed','1');}
  function run(){
    var im=get(); if(!im)return;
    if(im.getAttribute('data-team-revealed')==='1'){settle(im);return;}
    if(REDUCED.matches){settle(im);return;}
    if(im.getAttribute('data-team-revealing')==='1')return;
    im.setAttribute('data-team-revealing','1');
    im.style.transition='none'; im.style.opacity='0';
    var decoded; try{decoded=im.decode();}catch(e){decoded=Promise.resolve();}
    Promise.resolve(decoded).catch(function(){}).then(function(){
      requestAnimationFrame(function(){setTimeout(function(){
        var live=get(); if(!live)return;
        live.style.transition='opacity '+DUR+'ms '+EASE;
        live.style.opacity='1';
        setTimeout(function(){var x=get();if(x){x.setAttribute('data-team-revealed','1');x.removeAttribute('data-team-revealing');x.style.transition='';x.style.opacity='1';}},DUR+80);
      },DELAY);});
    });
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',function(){if(!window.__suduVisited)run();},{once:true});
  else if(!window.__suduVisited)run();
  document.addEventListener('sudu:navigation-ready',run);
  document.addEventListener('turbo:before-cache',function(){var im=get();if(im)settle(im);});
})();

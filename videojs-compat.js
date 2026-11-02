// Narrow compatibility for Video.js's documented tech() opt-in guard.
// Runs in MAIN world because the host's Video.js is not in the extension world.
(() => {
  const patched=new WeakSet();
  function patch(){
    const Player=window.videojs?.getComponent?.('Player')||window.videojs?.Player;
    const proto=Player?.prototype,original=proto?.tech;
    if(typeof original!=='function'||patched.has(original)||!Function.prototype.toString.call(original).includes('IWillNotUseThisInPlugins'))return;
    function compatibleTech(...args){
      if(!args.length||args[0]==null)args[0]={IWillNotUseThisInPlugins:true};
      return Reflect.apply(original,this,args);
    }
    patched.add(compatibleTech);proto.tech=compatibleTech;
  }
  function attempt(){try{patch();}catch{/* A different player version must not break the page. */}}
  attempt();
  document.addEventListener('load',attempt,true);
  document.addEventListener('DOMContentLoaded',attempt);
  let ticks=0;const timer=setInterval(()=>{attempt();if(++ticks>=600)clearInterval(timer);},100);
})();

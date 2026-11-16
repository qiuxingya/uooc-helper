// 仅在已检查的跨域文件预览中运行，不接触扩展密钥或模型接口。
(() => {
 if(window===window.top||!PolymasParser.player(location.href))return;
 const origin='https://'+PolymasParser.HOST,channel='uooc-polymas-player-v1';
 let token=null,generation=0,rate=2,lastVideo=null,desired='pause';
 const videos=()=>[...document.querySelectorAll('video')].filter(v=>v.getClientRects().length);
 function send(extra={}){const list=videos(),v=list.length===1?list[0]:null;parent.postMessage({channel,token,...extra,state:v?{time:Number.isFinite(v.currentTime)?v.currentTime:0,duration:Number.isFinite(v.duration)?v.duration:0,paused:v.paused,ended:v.ended,seeking:v.seeking,readyState:v.readyState,rate:v.playbackRate,error:!!v.error}:null},origin);}
 window.addEventListener('message',async event=>{
  if(!event.isTrusted)return;
  const m=event.data;if(event.source!==parent||event.origin!==origin||m?.channel!==channel||typeof m.token!=='string'||!/^\w{32}$/.test(m.token))return;
  if(m.command==='hello'){if(token!==m.token){generation++;desired='pause';token=m.token;}tick();return;}
  if(m.token!==token||!Number.isSafeInteger(m.id)||m.id<1)return;
  const list=videos(),v=list.length===1?list[0]:null;
  if(!v){send({id:m.id,error:'PLAYER_MISSING'});return;}
  if(m.command==='rate'){
   if(![1,1.25,1.5,1.75,2].includes(m.rate))return;rate=m.rate;v.defaultPlaybackRate=rate;v.playbackRate=rate;send({id:m.id});
  }else if(m.command==='pause'){generation++;desired='pause';v.pause();send({id:m.id});}
  else if(m.command==='play'){
   const run=++generation;desired='play';try{v.defaultPlaybackRate=rate;v.playbackRate=rate;await v.play();if(run!==generation){if(desired==='pause')v.pause();send({id:m.id,error:'CANCELLED'});}else send({id:m.id});}
   catch(error){send({id:m.id,error:error.name==='NotAllowedError'?'AUTOPLAY':error.name==='AbortError'?'ABORT':'PLAYBACK'});}
  }
 });
 function tick(){if(!token)return;const list=videos(),v=list.length===1?list[0]:null;if(v!==lastVideo){lastVideo=v;if(v)for(const name of ['play','pause','ended','waiting','seeking','loadedmetadata','error'])v.addEventListener(name,()=>send({event:name}));}send();}
 setInterval(tick,500);
 window.addEventListener('pagehide',()=>{generation++;token=null;lastVideo?.pause();});
})();

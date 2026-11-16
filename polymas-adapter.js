(() => {
 if(!PolymasParser.course(location.href))return;
 const channel='uooc-polymas-player-v1',origin='https://'+PolymasParser.PLAYER;
 const visible=e=>!!e?.isConnected&&!!e.getClientRects().length&&getComputedStyle(e).visibility!=='hidden';
 let remote=null,selected=null,visited=new Set(),ended=new Set(),sequence=0;
 const pending=new Map();
 function currentFrame(){const course=PolymasParser.course(location.href),list=[...document.querySelectorAll('iframe')].filter(visible).filter(f=>{const p=PolymasParser.player(f.src);return p&&p.course===course?.id&&(!course.resource||p.file===course.resource);});return list.length===1?list[0]:null;}
 function rejectPending(){for(const item of pending.values()){clearTimeout(item.timer);item.reject(Object.assign(Error('播放器已切换'),{name:'AbortError'}));}pending.clear();}
 function frame(){const f=currentFrame(),info=f&&PolymasParser.player(f.src);if(remote?.frame===f&&remote.info.file===info?.file&&remote.info.course===info?.course)return remote;if(remote){remote.media.pause();remote.value.paused=true;rejectPending();remote=null;}if(!f)return null;
  const token=Array.from(crypto.getRandomValues(new Uint8Array(16)),n=>n.toString(16).padStart(2,'0')).join(''),events=new EventTarget();
  const value={paused:true,ended:false,seeking:false,readyState:0,time:0,duration:0,rate:2};
  const r={frame:f,token,value,lastSeen:0,info};
  function command(command,extra={},wait=false){if(!f.isConnected||!f.contentWindow)return wait?Promise.reject(Object.assign(Error('播放器已移除'),{code:'VIDEO_CHANGED'})):undefined;const id=++sequence;if(!r.lastSeen)f.contentWindow.postMessage({channel,token,command:'hello'},origin);f.contentWindow.postMessage({channel,token,command,id,...extra},origin);if(!wait)return;return new Promise((resolve,reject)=>{const timer=setTimeout(()=>{pending.delete(id);reject(Object.assign(Error('播放器响应超时'),{code:'VIDEO_TIMEOUT'}));},20000);pending.set(id,{resolve,reject,timer});});}
  r.media={ownerDocument:document,get isConnected(){return f.isConnected&&currentFrame()===f&&PolymasParser.player(f.src)?.file===info.file;},getClientRects:()=>f.getClientRects(),getBoundingClientRect:()=>f.getBoundingClientRect(),get currentTime(){return value.time;},get duration(){return value.duration;},get paused(){return value.paused;},get ended(){return value.ended;},get seeking(){return value.seeking;},get readyState(){return value.readyState;},get currentSrc(){return 'polymas:'+info.file;},getAttribute:name=>name==='src'?'polymas:'+info.file:null,get defaultPlaybackRate(){return value.rate;},set defaultPlaybackRate(n){if([1,1.25,1.5,1.75,2].includes(n)){value.rate=n;command('rate',{rate:n});}},get playbackRate(){return value.rate;},set playbackRate(n){this.defaultPlaybackRate=n;},play:()=>{r.pausePending=false;return command('play',{},true);},pause:()=>{r.pausePending=true;value.paused=true;command('pause');},addEventListener:(...args)=>events.addEventListener(...args)};
  r.events=events;remote=r;return r;
 }
 window.addEventListener('message',event=>{
  if(!event.isTrusted)return;
  const r=frame(),m=event.data;if(!r||event.source!==r.frame.contentWindow||event.origin!==origin||m?.channel!==channel||m.token!==r.token)return;
  const s=m.state,valid=s&&typeof s==='object'&&Number.isFinite(s.time)&&s.time>=0&&Number.isFinite(s.duration)&&s.duration>=0&&['paused','ended','seeking','error'].every(k=>typeof s[k]==='boolean')&&Number.isInteger(s.readyState)&&s.readyState>=0&&s.readyState<=4&&[1,1.25,1.5,1.75,2].includes(s.rate);
  if(valid){Object.assign(r.value,s);r.lastSeen=Date.now();if(r.pausePending){if(s.paused)r.pausePending=false;else r.media.pause();}}
  const task=pending.get(m.id);if(task){clearTimeout(task.timer);pending.delete(m.id);if(m.error)task.reject(Object.assign(Error('播放器操作失败'),{name:m.error==='AUTOPLAY'?'NotAllowedError':m.error==='ABORT'||m.error==='CANCELLED'?'AbortError':'Error'}));else task.resolve();}
  if(valid&&['play','pause','waiting','seeking','loadedmetadata','error'].includes(m.event))r.events.dispatchEvent(new Event(m.event));
  // 短视频或从末尾续播时，启动请求尚未返回就可能播完。
  // 持续报告真实结束状态，直至连播流程确认处理，防止漏掉切换。
  if(valid&&s.ended&&!ended.has(r.info.file))r.events.dispatchEvent(new Event('ended'));
 });
 setInterval(()=>{const r=frame();if(r){if(r.lastSeen&&Date.now()-r.lastSeen>3000){r.value.paused=true;r.value.readyState=0;}r.frame.contentWindow.postMessage({channel,token:r.token,command:'hello'},origin);}},500);
 function context(){const r=frame(),course=PolymasParser.course(location.href),entries=PolymasParser.entries(),item=entries.find(e=>e.id===(r?.info.file||course?.resource||selected));return {resource:r?'polymas:'+r.info.file:null,chapter:item?.title||'当前视频',finished:!!item&&ended.has(item.id)};}
 function gateNotice(){return [...document.querySelectorAll('[role=alert],.el-message,.el-dialog')].filter(visible).find(e=>/未解锁|请先完成|尚未开放|无权访问/.test(e.textContent))||null;}
 async function advance(cancelled,pause=250,initial=false){
  if(cancelled())return false;if(gateNotice())throw Object.assign(Error('当前资源尚未开放，请在网站完成前置要求后继续'),{code:'MANUAL'});
  const entries=PolymasParser.entries(),course=PolymasParser.course(location.href),current=remote?.info.file||course?.resource||selected,index=entries.findIndex(e=>e.id===current);
  if(current&&index<0)throw Object.assign(Error('目录中找不到当前资源，请展开目录后继续'),{code:'UNSUPPORTED'});
  if(current&&initial&&!ended.has(current))return true;
  if(remote&&!remote.value.ended&&!initial)throw Object.assign(Error('当前视频尚未正常结束，请继续播放'),{code:'PLAYBACK'});
  const candidates=initial&&!current?entries:entries.slice(index+1),next=candidates.find(e=>e.video&&!e.done&&!ended.has(e.id)&&!visited.has(e.id));
  if(!next)throw Object.assign(Error('当前目录没有待播放视频，请展开后续目录或核对完成情况'),{code:'UNSUPPORTED'});
  if(cancelled())return false;selected=next.id;visited.add(next.id);next.element.click();await new Promise(r=>setTimeout(r,pause));return !cancelled();
 }
 globalThis.PolymasLearning={name:'AI教学中心',quizzes:false,isPlayer:v=>v===remote?.media,videos:()=>{const r=frame();return r&&r.lastSeen&&Date.now()-r.lastSeen<=3000?[r.media]:[];},title:()=>PolymasParser.title(),markEnded:()=>{const r=frame();if(r)ended.add(r.info.file);},pause:()=>{frame()?.media.pause();},progress:()=>{const el=[...document.querySelectorAll('.count-span-item')].find(e=>/总学习进度/.test(e.textContent));return el?.textContent.match(/(?:100|\d{1,2})(?:\.\d+)?%/)?.[0]||null;}};
 globalThis.UoocCatalog={available:()=>!!document.querySelector('[role=tree]'),name:()=> 'POLYMAS 智能体课程',context,gateNotice,picker:()=>!currentFrame()&&!!document.querySelector('[role=tree]'),advance,reset:()=>{visited.clear();ended.clear();selected=null;}};
})();

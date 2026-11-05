(async () => {
  if (window.top !== window) return;
  if(globalThis.UoocPlatforms?.platform(location.href)==='chaoxing'&&!/\/studentstudy$/.test(location.pathname))return;
  if(globalThis.UoocCourseReader&&await UoocCourseReader.ready)return;
  if(document.getElementById('uooc-learning-helper'))return;
  let settings = {delay:3,autoExercises:!globalThis.ChaoxingLearning,rate:2,timerMinutes:0,sound:true,autoSubmit:false}, playing=false, busy=false, epoch=0, completed=0, advancing=false,submitting=false;
  const VERSION=chrome.runtime.getManifest?.().version||'2.1.6';
  const PLATFORM=globalThis.ChaoxingLearning?'学习通':'优课';
  const host=document.createElement('div');host.id='uooc-learning-helper';host.dataset.version=VERSION;
  host.style.cssText='position:fixed;right:18px;bottom:18px;z-index:2147483647';
  const shadow=host.attachShadow({mode:'closed'});
  shadow.innerHTML=`<style>
:host{font:14px/1.6 system-ui,-apple-system,"Segoe UI",sans-serif;color:#173b38;--accent:#147d70}*{box-sizing:border-box}button{font:inherit;cursor:pointer}button:focus-visible{outline:3px solid #6acbbd;outline-offset:3px}[hidden]{display:none!important}
.box{position:absolute;right:0;bottom:68px;width:min(330px,calc(100vw - 36px));max-height:calc(100dvh - 110px);overflow:auto;padding:20px;background:#fffffff5;border:1px solid #d8e9e4;border-radius:22px;box-shadow:0 16px 60px #163f3626;backdrop-filter:blur(16px)}
.head{display:flex;align-items:center;justify-content:space-between;gap:12px}.eyebrow{font-size:10px;letter-spacing:2px;color:#6d8c86}h3{font-size:18px;letter-spacing:-.5px;margin:2px 0}.close{display:inline-flex;align-items:center;justify-content:center;gap:5px;flex-shrink:0;height:32px;padding:0 11px;border:1px solid #d6e7df;border-radius:999px;background:linear-gradient(180deg,#f7fbf8,#eaf4ee);color:#327462;font-size:12px;font-weight:600;line-height:1;box-shadow:0 1px 2px #174e3810;transition:background .18s,box-shadow .18s}.close svg{width:14px;height:14px}.close:hover{background:#dcefe4;box-shadow:0 2px 6px #174e3820}.head>div{min-width:0}.head .eyebrow{font-size:9px;letter-spacing:1.1px}.status{border:1px solid #dfede7;background:#f4f9f6;border-radius:12px;padding:12px;margin:16px 0;font-size:13px;overflow-wrap:anywhere}
.actions{display:grid;grid-template-columns:1fr 1fr;gap:8px}.actions button{border:1px solid #d7e6de;border-radius:11px;padding:10px 5px;background:#fff;color:#33594f;font-size:13px}.actions #play{background:var(--accent);color:white;border-color:var(--accent)}button:hover{filter:brightness(.96)}button:disabled{opacity:.45;cursor:wait}.hint{font-size:11px;line-height:1.8;color:#789187;margin:14px 0 0}#log{max-height:150px;overflow:auto;white-space:pre-wrap;font-size:12px;color:#57796c;margin-top:10px}
.orb{position:relative;display:grid;place-items:center;width:54px;height:54px;padding:0;border:1px solid #ffffff80;border-radius:50%;color:#fff;background:linear-gradient(145deg,#299d8e,#126859);box-shadow:0 6px 22px #125e5140;transition:transform .18s}.orb:hover{transform:translateY(-2px)}.orb svg{width:24px;height:24px}.dot{position:absolute;right:2px;top:2px;width:10px;height:10px;border-radius:50%;border:2px solid #fff;background:#bfd7ca}.orb[data-mode=running] .dot{background:#8befaf}.orb[data-mode=attention] .dot{background:#ffbd69}@media(prefers-reduced-motion:reduce){.orb{transition:none}}
.quick-tools{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:13px}.quick-tools label{font-size:11px;color:#648377}.quick-tools select,.quick-tools input{display:block;width:100%;margin-top:5px;padding:7px;border:1px solid #d7e6de;border-radius:8px;background:#f7fbf8;color:#33594f;font:inherit}.quick-tools input{grid-column:1/-1}.session-stats{display:grid;gap:3px;margin-top:10px;font-size:11px;color:#648377}#countdown{color:#267466}#diagnostic{font-size:11px;margin-top:10px}#diagnostic pre{white-space:pre-wrap;overflow-wrap:anywhere}#diagnostic button{border:1px solid #d7e6de;border-radius:7px;background:#f7fbf8;color:#33594f;padding:5px 9px}.orb{touch-action:none;user-select:none}.box{position:fixed;right:auto;bottom:auto;width:min(330px,calc(100vw - 24px))}.grade-summary{margin-top:12px;border-top:1px solid #e1ece5;padding-top:11px;font-size:11px;color:#648377}.grade-summary span{display:block;line-height:1.8}.grade-summary button{margin-top:7px;padding:6px 10px;border:1px solid #d7e6de;border-radius:8px;color:#267466;background:#f7fbf8}.submit-toggle{display:flex;align-items:center;gap:8px;margin-top:12px;color:#426b60;font-size:12px}.submit-toggle input{width:15px;height:15px;accent-color:#147d70}.submit-toggle small{display:block;font-size:10px;color:#8a9f93;margin-top:3px}.secondary-actions{margin-top:8px}.secondary-actions button,#moreTools>button{border:0;background:transparent;color:#267466;padding:6px 0;font-size:12px}#moreTools{margin-top:10px;border-top:1px solid #e1ece5;padding-top:10px;font-size:12px;color:#648377}#moreTools>summary{cursor:pointer}summary:focus-visible,select:focus-visible{outline:2px solid #28866a;outline-offset:3px}.box{padding:16px;border-radius:16px}.status{margin:12px 0;padding:10px}.eyebrow{letter-spacing:0!important}@media(prefers-reduced-motion:reduce){*{transition:none!important;animation:none!important}}</style><section class="box" id="panel" aria-label="${PLATFORM}学习助手" hidden><header class="head"><div><div class="eyebrow">${PLATFORM} · v${VERSION}</div><h3>${PLATFORM}学习助手</h3></div><button class="close" id="minimize" aria-label="收起面板" title="收起为悬浮圆球（Esc）"><svg viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="m5 5 5 5 5-5M5 10l5 5 5-5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg><span>收起</span></button></header><p class="status" id="state" role="status">就绪，点击开始连播</p><div class="actions"><button id="play">开始连播 · 2×</button><button id="stop">暂停全部</button></div><div class="quick-tools"><label>倍速<select id="rate"><option value="1">1×</option><option value="1.25">1.25×</option><option value="1.5">1.5×</option><option value="1.75">1.75×</option><option value="2" selected>2×</option></select></label><label>定时停止<select id="timer"><option value="0">关闭</option><option value="15">15 分钟</option><option value="30">30 分钟</option><option value="60">60 分钟</option><option value="120">120 分钟</option><option value="custom">自定义</option></select></label><input id="timerCustom" type="number" min="1" max="240" aria-label="自定义定时分钟" placeholder="1–240 分钟" hidden></div><div class="session-stats"><span id="sessionStats">本次 0 分钟 · 0 个视频</span><span id="countdown"></span></div><div class="secondary-actions"><button id="solve">手动答题</button></div><details id="moreTools"><summary>更多</summary><button id="inspect">检查页面</button><label class="submit-toggle"><input id="autoSubmit" type="checkbox"><span>自动提交测验<small>开启后正式交卷；验证需人工处理</small></span></label><div class="grade-summary"><span id="gradeSummary">网站完成度与成绩：待刷新</span><button id="openGrades">课程与成绩 ↗</button></div><details id="diagnostic" hidden><summary>页面诊断</summary><pre id="diagnosticText"></pre><button id="copyDiagnostic">复制诊断</button></details><p class="hint" id="workflowHint">自动答题 → 保存答案 → 继续视频<br>提交留待你之后集中处理。题目及选项将发送至 DeepSeek。</p><div id="log" aria-live="polite"></div></details></section><button class="orb" id="orb" aria-label="展开优课学习助手" aria-expanded="false" aria-controls="panel" data-mode="idle" title="优课学习助手"><svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M5 6.5 12 3l7 3.5V16L12 20l-7-4V6.5Z" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/><path d="m10 8 5 3.5-5 3.5V8Z" fill="currentColor"/></svg><span class="dot"></span></button>`;
  document.documentElement.append(host);
  const el=id=>shadow.getElementById(id);
  const progress={total:0,filled:0,current:0,guessed:0,retries:0};
  let cancelBarrier=Promise.resolve();
  let lastStopReason=null;let phase='IDLE',resumeMode=null,checkpoint={context:location.href,records:new Map()},reviewResolver=null;
  const videoOwners=new WeakMap();
  const summary=document.createElement('p');summary.id='taskProgress';summary.style.cssText='font-size:11px;color:#648377;margin:8px 0;overflow-wrap:anywhere';summary.setAttribute('aria-live','polite');el('state').after(summary);summary.hidden=true;const nextAction=document.createElement('p');nextAction.id='nextAction';nextAction.hidden=true;nextAction.style.cssText='font-size:11px;color:#648377;margin:6px 0';summary.after(nextAction);
  const review=document.createElement('div');review.id='answerReview';review.hidden=true;review.style.cssText='padding:10px;border:1px solid #d7e6de;border-radius:10px;background:#f4f9f6';
  review.innerHTML='<p style="font-size:12px">检测到已填写答案被修改。保留并采用页面中的完整答案后继续？</p><button id="acceptPageAnswers">采用页面答案并继续</button><button id="cancelPageReview">取消</button>';
  summary.after(review);
  for(const button of review.querySelectorAll('button'))button.style.cssText='padding:7px 9px;margin:3px 4px 3px 0;border:1px solid #cce0d6;border-radius:8px;background:#fff;color:#267466;font:inherit;font-size:12px';
  function renderProgress(){summary.hidden=!progress.total||!['QUESTION','RETRY','REVIEW','PAUSED'].includes(phase);summary.textContent=progress.total?`已填写 ${progress.filled}/${progress.total} · 当前第 ${progress.current} 题 · 推测 ${progress.guessed} · 重试 ${progress.retries}`:'';}
  function resumeLabels(){el('solve').textContent=(resumeMode==='quiz'||resumeMode==='video'&&progress.current>0&&progress.filled<progress.total)?'继续答题':'手动答题';el('play').textContent=(resumeMode==='video'?'继续连播':'开始连播')+' · '+settings.rate+'×';}
  function interrupted(){return Object.assign(Error('操作已取消'),{code:'CANCELLED'});}
  function runCurrent(token,context){if(!valid(token))return false;if(location.href!==context){stop('页面已变化，已暂停；请检查当前资源');return false;}return true;}
  function runWait(promise,token,context,timeoutMs=0){
    return new Promise((resolve,reject)=>{
      let done=false,timer;const start=Date.now();
      const finish=(fn,value)=>{if(done)return;done=true;clearTimeout(timer);fn(value);};
      const tick=()=>{if(!runCurrent(token,context)){finish(reject,interrupted());return;}if(timeoutMs&&Date.now()-start>=timeoutMs){finish(reject,Object.assign(Error('播放器启动超过20秒，请检查视频线路后继续'),{code:'VIDEO_TIMEOUT'}));return;}timer=setTimeout(tick,100);};
      tick();Promise.resolve(promise).then(value=>{if(runCurrent(token,context))finish(resolve,value);else finish(reject,interrupted());},error=>finish(reject,error));
    });
  }
  async function retryWait(ms,token,context,model=true){
    const end=Date.now()+ms;
    while(Date.now()<end){if(!runCurrent(token,context))throw interrupted();say(`等待重试 ${Math.ceil((end-Date.now())/1000)} 秒${model?'；请求可能再次计费':''}`,'RETRY');await sleep(Math.min(200,end-Date.now()));}
    if(!runCurrent(token,context))throw interrupted();
  }
  async function requestAnswer(q,token,context){
    let guess=false,retried=false;
    for(let calls=0;calls<3;calls++){
      if(!runCurrent(token,context))throw interrupted();
      say(`正在分析第 ${progress.current}/${progress.total} 题${guess?'（请求最可能答案）':''}`,'QUESTION');
      await runWait(cancelBarrier,token,context);
      const fresh=questions().find(item=>item.root===q.root);
      if(!fresh||fresh.signature!==q.signature||fresh.inputs.some((input,i)=>input!==q.inputs[i]))throw Object.assign(Error('题目页面已变化，已停止旧题请求，请检查后继续'),{code:'PAGE_CHANGED'});
      let response;
      try{response=await runWait(chrome.runtime.sendMessage({type:'solve',question:q.payload,...(guess?{allowGuess:true}:{})}),token,context);}
      catch(error){if(error.code==='CANCELLED')throw error;throw Object.assign(Error('扩展通信失败，请重新加载扩展'),{code:'COMMUNICATION'});}
      if(!response?.error){if(!response?.result)throw Object.assign(Error('扩展通信失败'),{code:'COMMUNICATION'});return response.result;}
      const code=response.code||'REQUEST_FAILED';
      if(['ANSWER_UNCERTAIN','ANSWER_FORMAT','ANSWER_INCOMPLETE','INVALID_RESPONSE'].includes(code)&&!guess){guess=true;progress.retries++;renderProgress();record('stage',code);continue;}
      if(['NETWORK','TIMEOUT','SERVER','RATE_LIMIT'].includes(code)&&!retried){
        const ms=code==='RATE_LIMIT'&&Number.isFinite(response.retryAfterMs)?Math.max(0,response.retryAfterMs):3000;
        if(ms>60000)throw Object.assign(Error('接口要求等待超过60秒，已暂停，请稍后继续'),{code:'RATE_LIMIT'});
        retried=true;progress.retries++;renderProgress();record('stage',code);await retryWait(ms,token,context);continue;
      }
      throw Object.assign(Error(response.error),{code});
    }
    throw Object.assign(Error('当前题重试次数已用完，请检查后继续'),{code:'RETRY_EXHAUSTED'});
  }
  function pageAnswers(q){
    const answers=q.payload.type==='blank'?q.inputs.map(i=>i.value):q.inputs.flatMap((i,n)=>i.checked?[n]:[]);
    if(q.payload.type==='blank'?answers.some(s=>!s.trim()):!answers.length||(q.payload.type==='single'&&answers.length!==1))return null;
    return answers;
  }
  function matchesAnswer(q,answers){return !!answers&&q.inputs.every((input,i)=>q.payload.type==='blank'?input.value===answers[i]:input.checked===answers.includes(i));}
  async function reviewCheckpoint(items,token,context){
    const changed=[];
    for(const q of items){const old=checkpoint.records.get(q.root);if(!old)continue;if(old.signature!==q.signature||old.document!==q.root.ownerDocument.URL){checkpoint.records.delete(q.root);continue;}if(!matchesAnswer(q,old.answers)){const answers=pageAnswers(q);if(!answers)throw Error('已修改的答案尚未完整，请先补全页面答案，再继续');changed.push({q,answers});}}
    if(!changed.length)return;
    progress.current=items.indexOf(changed[0].q)+1;renderProgress();
    say(`有 ${changed.length} 道已填写题目被修改，请确认采用页面答案`,'REVIEW');review.hidden=false;togglePanel(true);placePanel();
    const accepted=await runWait(new Promise(resolve=>{reviewResolver=resolve;}),token,context).finally(()=>{if(token===epoch){review.hidden=true;reviewResolver=null;}});
    if(!accepted)throw Error('未确认采用页面答案，已保留修改并暂停');
    for(const {q,answers} of changed){if(!matchesAnswer(q,answers))throw Error('确认期间页面答案再次变化，请重新核对');checkpoint.records.set(q.root,{signature:q.signature,document:q.root.ownerDocument.URL,answers,uncertain:false});}
  }
  el('acceptPageAnswers').onclick=()=>reviewResolver?.(true);
  el('cancelPageReview').onclick=()=>reviewResolver?.(false);
  function togglePanel(open){el('panel').hidden=!open;el('orb').setAttribute('aria-expanded',String(open));el('orb').setAttribute('aria-label',open?'收起优课学习助手':'展开优课学习助手');if(!open)el('orb').focus();else {placePanel();refreshGradeSummary();el('minimize').focus({preventScroll:true});}}
  el('orb').onclick=()=>{if(Date.now()<suppressClick)return;togglePanel(el('panel').hidden);};
  el('minimize').onclick=()=>togglePanel(false);
  shadow.addEventListener('keydown',e=>{if(e.key==='Escape'){togglePanel(false);e.stopPropagation();}});
  const say=(text,nextPhase)=>{if(nextPhase)phase=nextPhase;el('state').textContent=text;el('orb').title=text;el('orb').dataset.mode=phase==='PAUSED'&&lastStopReason!=='manual'?'attention':playing?'running':'idle';nextAction.hidden=phase!=='PAUSED';nextAction.textContent=['MANUAL','EXAM','UNSUPPORTED'].includes(lastStopCode)?'请先在网站完成人工处理，再选择开始学习。':resumeMode==='quiz'?'检查上方提示后，点击“继续答题”恢复。':'检查上方提示后，点击“开始／继续连播”恢复。';renderProgress();}, log=text=>{el('log').textContent=(text+'\n'+el('log').textContent).slice(0,9000);};
  el('openGrades').onclick=()=>featureMessage('gradesOpen',{platform:globalThis.ChaoxingLearning?'chaoxing':'uooc'});
  const connected=!!chrome.runtime.onMessage?.addListener;
  const featureMessage=(type,data={})=>connected?chrome.runtime.sendMessage({type,...data}).then(r=>r?.error?null:r?.result).catch(()=>null):Promise.resolve(null);
  let gradeSummaryRequest=0;
  function resetGradeSummary(){
    gradeSummaryRequest++;
    el('gradeSummary').textContent='网站完成度与成绩：待刷新';
    if(!el('panel').hidden)refreshGradeSummary();
  }
  async function refreshGradeSummary(){
    const request=++gradeSummaryRequest,address=location.href;
    const chaoxing=!!globalThis.ChaoxingLearning;
    const data=await featureMessage(chaoxing?'cxGradeSummary':'gradeSummary');
    if(request!==gradeSummaryRequest||location.href!==address)return;
    const course=data?.course,snapshot=course?.snapshot,label=el('gradeSummary');
    if(!data?.verified){label.textContent='网站完成度与成绩：请在总览中刷新确认账号';return;}
    if(!snapshot){label.textContent='网站完成度与成绩：尚未读取';return;}
    const progress=snapshot.progress?.value;
    const score=snapshot.current?.state==='value'?snapshot.current.value:snapshot.current?.state==='unpublished'?'未公布':'—';
    const updatedAt=snapshot.progress?.updatedAt??snapshot.updatedAt;
    const progressDate=Number.isFinite(updatedAt)&&updatedAt>0?' · 进度采集 '+new Date(updatedAt).toLocaleDateString():'';
    const failure=course.lastError?(course.progressOnly?' · 进度与成绩分开采集':' · 上次刷新失败'):'';
    label.textContent=(chaoxing?'章节任务点 ':'视频＋测验 ')+(progress==null?'暂无数据':progress+'%')+(chaoxing?' · 综合成绩 ':' · 当前得分 ')+score+failure+progressDate;
  }
  window.addEventListener('hashchange',resetGradeSummary);
  window.addEventListener('popstate',resetGradeSummary);
  let position=null,drag=null,suppressClick=0,deadline=0,deadlineTimeout,run='',sessionMs=0,lastFlush=Date.now(),sampleState=null,segments=[],completedKeys=new Set(),completedNodes=new WeakMap(),lastStopCode='PAUSE',audio,alerted=new Set();
  function placePanel(){
    const box=el('panel');if(box.hidden)return;
    const orb=el('orb').getBoundingClientRect(),width=Math.min(330,innerWidth-24),above=orb.top>innerHeight/2;
    box.style.width=width+'px';box.style.maxWidth='calc(100vw - 24px)';const available=Math.max(80,(above?orb.top:innerHeight-orb.bottom)-20);box.style.maxHeight='min('+available+'px,calc(100dvh - var(--panel-top,12px) - 12px))';
    const left=Math.min(Math.max(12,orb.left>innerWidth/2?orb.right-width:orb.left),Math.max(12,innerWidth-width-12));
    box.style.left='clamp(12px,'+left+'px,calc(100vw - min(330px,100vw - 24px) - 12px))';const top=above?Math.max(12,orb.top-box.getBoundingClientRect().height-12):orb.bottom+12;box.style.setProperty('--panel-top','clamp(12px,'+top+'px,calc(100dvh - 80px))');box.style.top='var(--panel-top)';
  }
  function placeOrb(){
    if(position){host.style.right='auto';host.style.bottom='auto';host.style.left='clamp(0px,'+(Math.max(0,innerWidth-54)*position.x)+'px,calc(100vw - 54px))';host.style.top='clamp(0px,'+(Math.max(0,innerHeight-54)*position.y)+'px,calc(100dvh - 54px))';}
    else {host.style.left='auto';host.style.top='auto';host.style.right=Math.min(18,Math.max(0,innerWidth-54))+'px';host.style.bottom=Math.min(18,Math.max(0,innerHeight-54))+'px';}
    placePanel();
  }
  el('orb').addEventListener('pointerdown',e=>{if(e.button!==0)return;const r=el('orb').getBoundingClientRect();drag={id:e.pointerId,x:e.clientX,y:e.clientY,left:r.left,top:r.top,moved:false};el('orb').setPointerCapture(e.pointerId);});
  el('orb').addEventListener('pointermove',e=>{
    if(!drag||drag.id!==e.pointerId)return;
    if(Math.hypot(e.clientX-drag.x,e.clientY-drag.y)>6)drag.moved=true;if(!drag.moved)return;
    const left=Math.max(0,Math.min(innerWidth-54,drag.left+e.clientX-drag.x)),top=Math.max(0,Math.min(innerHeight-54,drag.top+e.clientY-drag.y));
    position={x:innerWidth>54?left/(innerWidth-54):0,y:innerHeight>54?top/(innerHeight-54):0};placeOrb();
  });
  function finishDrag(e){if(!drag||drag.id!==e.pointerId)return;if(drag.moved){suppressClick=Date.now()+350;featureMessage('orbSave',{position});}drag=null;}
  el('orb').addEventListener('pointerup',finishDrag);el('orb').addEventListener('pointercancel',finishDrag);window.addEventListener('resize',placeOrb);
  function applySettings(value){const wasEnabled=settings.autoSubmit;settings={...settings,...value};settings.autoSubmit=settings.autoSubmit===true;if(globalThis.ChaoxingLearning){settings.autoSubmit=false;settings.autoExercises=false;el('autoSubmit').disabled=true;el('autoSubmit').title='学习通可编辑章节测验尚待适配，当前保留人工提交';el('solve').hidden=true;el('autoSubmit').closest('label').hidden=true;el('solve').disabled=true;el('solve').title='学习通可编辑章节测验样例尚未取得，暂保留人工作答';}el('autoSubmit').checked=!!settings.autoSubmit;el('workflowHint').innerHTML=settings.autoSubmit?'自动答题 → 保存并提交测验 → 继续视频<br>遇到验证或未通过会暂停。题目及选项将发送至 DeepSeek。':(globalThis.ChaoxingLearning?'学习通视频按顺序连播；遇到章节测验暂停。<br>可编辑测验尚待适配，当前请人工作答、保存及交卷。':'自动答题 → 保存答案 → 继续视频<br>提交留待你之后集中处理。题目及选项将发送至 DeepSeek。');if(wasEnabled&&!settings.autoSubmit&&submitting)stop('已关闭自动提交，当前操作已暂停；已发出的交卷无法撤回','manual');if(![1,1.25,1.5,1.75,2].includes(settings.rate))settings.rate=2;el('rate').value=String(settings.rate);resumeLabels();const preset=[0,15,30,60,120].includes(settings.timerMinutes);el('timer').value=preset?String(settings.timerMinutes):'custom';el('timerCustom').hidden=preset;el('timerCustom').value=String(settings.timerMinutes||30);if(playing)videos().forEach(speed);}
  const settingsReady=connected?featureMessage('uiGet').then(data=>{if(data){applySettings(data.settings);position=data.position;placeOrb();}}):chrome.storage.sync.get('settings').then(data=>applySettings(data.settings));
  chrome.storage.onChanged?.addListener((changes,area)=>{
    if(area==='sync'&&changes.settings?.newValue)applySettings(changes.settings.newValue);
    const chaoxing=!!globalThis.ChaoxingLearning;
    const account=area==='session'&&changes[chaoxing?'cxGradeAccount':'gradeAccount'];
    if(account&&account.oldValue?.hash!==account.newValue?.hash)resetGradeSummary();
    else if(area==='local'&&changes[chaoxing?'cxGradeCache':'gradeCache']&&!el('panel').hidden)refreshGradeSummary();
  });
  el('autoSubmit').onchange=()=>{const autoSubmit=el('autoSubmit').checked;applySettings({...settings,autoSubmit});featureMessage('settingsPatch',{patch:{autoSubmit}});};
  el('rate').onchange=()=>{const rate=Number(el('rate').value);applySettings({...settings,rate});featureMessage('settingsPatch',{patch:{rate}});};
  function updateTimer(){const value=el('timer').value;el('timerCustom').hidden=value!=='custom';const minutes=value==='custom'?Number(el('timerCustom').value):Number(value);if(!Number.isInteger(minutes)||minutes<0||minutes>240||(value==='custom'&&!minutes)){say('自定义定时应为 1–240 分钟');return;}settings.timerMinutes=minutes;featureMessage('settingsPatch',{patch:{timerMinutes:minutes}});if(playing)say('定时设置将在下一次开始连播时生效');}
  el('timer').onchange=updateTimer;el('timerCustom').onchange=updateTimer;
  function prepareAudio(){if(!settings.sound)return;try{audio||=new (window.AudioContext||window.webkitAudioContext)();audio.resume().catch(()=>{});}catch{}}
  function beepOnce(code){if(!settings.sound||alerted.has(code))return;alerted.add(code);try{if(!audio||audio.state!=='running')return;const o=audio.createOscillator(),g=audio.createGain();o.frequency.value=660;g.gain.setValueAtTime(.08,audio.currentTime);g.gain.exponentialRampToValueAtTime(.001,audio.currentTime+.2);o.connect(g);g.connect(audio.destination);o.start();o.stop(audio.currentTime+.21);}catch{}}
  function classify(){return 'UNKNOWN';}
  function failure(message,code){return Object.assign(Error(message),{code});}
  function record(event,code){featureMessage('eventLog',{event,code,stage:phase.toLowerCase()});}
  function valid(token){if(token!==epoch)return false;if(deadline&&Date.now()>=deadline){stop('定时已到，已暂停；已填写内容保留','timer');return false;}return true;}
  async function playVideo(v,token){
    const context=location.href,source=v.currentSrc||v.getAttribute('src')||'';if(!runCurrent(token,context)||!playing)return;
    if(globalThis.ChaoxingLearning)query('video').filter(other=>other!==v).forEach(other=>other.pause());
    videoOwners.set(v,token);say('正在启动播放器，最长等待20秒','VIDEO_LOADING');
    for(let attempt=0;attempt<2;attempt++){
      if(!runCurrent(token,context)||!playing)return;
      const pending=Promise.resolve().then(()=>Reflect.apply(v.play,v,[]));
      pending.then(()=>{if(videoOwners.get(v)===token&&(!playing||token!==epoch))v.pause();},()=>{});
      try{await runWait(pending,token,context,20000);if(!v.isConnected)throw Object.assign(Error('播放器已被页面替换，请检查当前视频后继续'),{code:'VIDEO_CHANGED'});if(runCurrent(token,context)&&playing)say('正在连续播放，视频结束后切换','PLAYING');return;}
      catch(error){
        if(!runCurrent(token,context))throw interrupted();
        if(error.name==='NotAllowedError')throw Object.assign(Error('浏览器阻止自动播放，请点击播放器后继续'),{code:'AUTOPLAY'});
        if(['VIDEO_TIMEOUT','VIDEO_CHANGED'].includes(error.code))throw error;
        if(error.name!=='AbortError'||attempt||!v.isConnected||(v.currentSrc||v.getAttribute('src')||'')!==source)throw Object.assign(Error(error.name==='AbortError'?'播放器启动再次中断，请检查视频线路后继续':'播放器启动失败，请检查视频资源后继续'),{code:'VIDEO_START'});
        say('播放器启动被暂时中断，正在重试一次','VIDEO_LOADING');await retryWait(300,token,context,false);
      }
    }
  }
  async function beginRun(token){
    await settingsReady;if(token!==epoch||!playing)return;globalThis.UoocCatalog?.reset?.();if(el('timer').value==='custom'&&!el('timerCustom').checkValidity())throw Error('自定义定时应为 1–240 分钟');run=Date.now().toString(36)+'-'+epoch;sessionMs=0;completed=0;completedKeys=new Set();completedNodes=new WeakMap();sampleState=null;segments=[];alerted.clear();lastStopCode='START';
    deadline=settings.timerMinutes?Date.now()+settings.timerMinutes*60000:0;
    if(deadline)deadlineTimeout=setTimeout(()=>valid(token),Math.max(0,deadline-Date.now()));
    const answer=await featureMessage('timerStart',{minutes:settings.timerMinutes,run});if(!valid(token))return;if(connected&&settings.timerMinutes&&!answer)throw Error('无法创建定时停止，请重新加载扩展后重试');record('start','START');renderStats();
  }
  function meta(v){const context=globalThis.UoocCatalog?.context?.(v)||{};return {resource:context.resource||(/^#\/(?:\d+\/){2,}\w*$/.test(location.hash)?location.hash:null),position:{title:document.title,chapter:context.chapter||'当前视频',seconds:Number.isFinite(v?.currentTime)?v.currentTime:0}};}
  function renderStats(){el('sessionStats').textContent='本次 '+Math.floor(sessionMs/60000)+' 分 '+Math.floor(sessionMs/1000)%60+' 秒 · '+completed+' 个视频';el('countdown').textContent=deadline?'剩余 '+Math.max(0,Math.ceil((deadline-Date.now())/60000))+' 分钟后停止':'';}
  function sample(force=false){
    const now=Date.now(),list=videos(),v=list.length===1?list[0]:null;
    const active=playing&&v&&!v.paused&&!v.ended&&!v.seeking&&v.readyState>=2;
    if(sampleState&&v===sampleState.v&&sampleState.active&&(active||force)){
      const dt=now-sampleState.now,delta=v.currentTime-sampleState.time;
      if(dt>0&&dt<=60000&&delta>0&&delta<=dt/1000*Math.max(settings.rate,1)*1.5+.5){const elapsed=Math.min(dt,delta/Math.max(v.playbackRate||settings.rate,1)*1000),pair=[now-elapsed,now];sessionMs+=elapsed;const last=segments.at(-1);if(last&&last[1]===pair[0])last[1]=pair[1];else segments.push(pair);}
    }
    sampleState=v?{v,now,time:v.currentTime,active}:null;renderStats();
    if(now-lastFlush>=10000)flushStats();
  }
  function flushStats(ended=false,details){
    lastFlush=Date.now();const v=videos()[0];if(!connected){segments=[];return;}
    const items=segments.splice(0).filter(([a,b])=>b>Date.now()-60000).map(([a,b])=>[Math.max(a,Date.now()-59990),b]).filter(([a,b])=>b>a);const split=[];for(const [a,b] of items)for(let start=a;start<b;start+=10000)split.push([start,Math.min(b,start+10000)]);
    if(!split.length&&!playing&&!ended)return;
    const context=details||meta(v);featureMessage('activityReport',{segments:split.slice(0,20),ended,resource:context.resource,position:v||ended?context.position:null});
  }
  function finishVideo(v){sample(true);const info=meta(v),key=info.resource,signature=v.currentSrc||v.getAttribute('src')||'unknown';if(key?completedKeys.has(key):completedNodes.get(v)===signature)return false;if(key)completedKeys.add(key);completedNodes.set(v,signature);completed++;flushStats(true,info);renderStats();return true;}
  setInterval(()=>{if(deadline&&!valid(epoch))return;sample();},1000);
  document.addEventListener('visibilitychange',()=>{if(valid(epoch))sample();});window.addEventListener('pagehide',()=>{sample(true);flushStats();cancelBarrier=featureMessage('cancelRequests');featureMessage('timerStop',{run});});
  chrome.runtime.onMessage?.addListener(message=>{if(message.type==='timerExpired'&&message.run===run&&playing)stop('定时已到，已暂停；已填写内容保留','timer');if(message.type==='orbReset'){position=null;placeOrb();}if(message.type==='historyCleared'){el('log').textContent='';sessionMs=0;completed=0;segments=[];sampleState=null;completedKeys.clear();completedNodes=new WeakMap();renderStats();}});

  const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
  const wait=()=>sleep(settings.delay*1000);
  const visible=e=>{
    if(!e.getClientRects().length || e.ownerDocument.defaultView.getComputedStyle(e).visibility==='hidden')return false;
    let doc=e.ownerDocument;
    while(doc!==document){const frame=doc.defaultView?.frameElement;if(!frame||!frame.getClientRects().length)return false;doc=frame.ownerDocument;}
    return true;
  };
  function documents() {
    const docs=[document];
    for(let i=0;i<docs.length;i++) for(const frame of docs[i].querySelectorAll('iframe')) {
      try {const doc=frame.contentDocument;if(doc && !docs.includes(doc) && visible(frame))docs.push(doc);}catch{}
    }
    return docs;
  }
  const query=(selector,root)=>root ? Array.from(root.querySelectorAll(selector)) : documents().flatMap(doc=>Array.from(doc.querySelectorAll(selector)));
  const blocked=()=>documents().some(doc=>/期末考试|期末考核|正在考试|考试倒计时|人机验证|请完成验证|请拖动滑块/.test(doc.body?.innerText || ''));
  function blankQuestion(root){
    if(/填空|第\s*\d+\s*空/.test(root.innerText)||root.matches('.blank,.fill-blank,[data-blank]'))return true;
    const headings=Array.from(root.ownerDocument.querySelectorAll('h1,h2,h3,h4,[role=heading]')).filter(h=>h.compareDocumentPosition(root)&4);
    const heading=headings.reverse().find(h=>/填空题|简答题|论述题|单选题|多选题|判断题/.test(h.textContent));
    return !!heading&&/填空题/.test(heading.textContent);
  }
  const overlaySelector='[role=dialog],[aria-modal=true],.modal,.dialog,.popup,.layui-layer,[class*="overlay"]';
  function pageRect(e){
    const rect=e.getBoundingClientRect();let x=rect.left,y=rect.top,doc=e.ownerDocument;
    while(doc!==document){const frame=doc.defaultView?.frameElement;if(!frame)break;const r=frame.getBoundingClientRect();x+=r.left;y+=r.top;doc=frame.ownerDocument;}
    return {left:x,top:y,right:x+rect.width,bottom:y+rect.height};
  }
  function activeQuestionRoot(root){
    if(!root.isConnected||!visible(root)||root.closest('[aria-hidden=true],[inert]'))return false;
    // Standalone assessments retain their save workflow even alongside a video.
    if(/\/(exam|homework|test)(\/|$)/i.test(root.ownerDocument.location.pathname)||saveButtons().length)return true;
    const list=videos();if(list.length!==1)return true;
    const v=list[0],overlay=root.closest(overlaySelector);
    const a=pageRect(root),b=pageRect(v);
    const overlaps=a.right>b.left&&a.left<b.right&&a.bottom>b.top&&a.top<b.bottom;
    // Normal-flow questions beneath the player are history, not a blocking popup.
    // A paused player plus a visible modal also covers dialogs rendered beside it.
    return overlaps || !!(overlay&&visible(overlay)&&v.paused&&!v.ended);
  }
  function questions() {
    let roots=(globalThis.ChaoxingLearning&&!settings.questionSelector?ChaoxingLearning.questionRoots():query(settings.questionSelector || '.ti,.question-item,.question_item,.question,fieldset,[data-question-id],.exam-item,.test-item')).filter(visible);
    if(!roots.length) {
      const groups=new Map();
      query('input[type=radio],input[type=checkbox],input[type=text],input:not([type]),input[type=number]').filter(visible).forEach(input=>{
        const root=input.closest('fieldset,li,section,article') || input.parentElement?.parentElement;
        if(root) groups.set(root,true);
      });roots=[...groups.keys()];
    }
    roots=roots.filter(r=>!globalThis.ChaoxingLearning?.isReview(r.ownerDocument)&&activeQuestionRoot(r)&&!roots.some(other=>other!==r && r.contains(other)));
    return roots.map(root=>{
      const inputs=query('input[type=radio],input[type=checkbox]',root);
      const stem=settings.stemSelector ? root.querySelector(settings.stemSelector) : root.querySelector('.ti-q-c,.question-title,.question_title,.stem,legend,[data-stem]');
      const text=(stem?.innerText || root.innerText).trim();
      if(!inputs.length){
        const blanks=query('input[type=text],input:not([type]),input[type=number],textarea',root).filter(visible);
        if(!text||!blanks.length||blanks.length>20||blanks.some(i=>i.disabled||i.readOnly)||blanks.some(i=>i.tagName==='TEXTAREA')&&!blankQuestion(root))return null;
        return {root,inputs:blanks,payload:{text,type:'blank',blankCount:blanks.length},signature:JSON.stringify({text,type:'blank',count:blanks.length})};
      }
      if(inputs.some(i=>i.disabled))return null;
      if(inputs.length<2 || inputs.length>12 || new Set(inputs.map(i=>i.type)).size!==1 || new Set(inputs.map(i=>i.name)).size>1) return null;
      const options=inputs.map(i=>{
        const label=i.labels?.[0] || i.closest('label') || i.parentElement;
        return label?.innerText.trim() || '';
      });
      if(!text || options.some(o=>!o) || new Set(options).size!==options.length) return null;
      return {root,inputs,payload:{text,type:inputs[0].type==='checkbox'?'multiple':'single',options}, signature:JSON.stringify({text,options})};
    }).filter(Boolean);
  }
  function videos(){const list=query('video').filter(visible);return globalThis.ChaoxingLearning?ChaoxingLearning.selectVideos(list):list;}
  const savedQuestions=new WeakMap(),savedBatches=new WeakMap(),savedNavigation=new WeakMap(),submittedDocs=new WeakSet();
  function speed(v){if(v.defaultPlaybackRate!==settings.rate)v.defaultPlaybackRate=settings.rate;if(v.playbackRate!==settings.rate)v.playbackRate=settings.rate;}
  async function advance(token,initial=false,laterChapter=false){
    let selectedTarget=null;if(!settings.nextSelector&&globalThis.UoocCatalog?.available())await globalThis.UoocCatalog.advance(()=>!valid(token)||!playing,250,initial,settings.autoExercises,{onSelect:target=>selectedTarget=target,laterChapter:laterChapter||!!globalThis.UoocCatalog.gateNotice?.(),onSkip:()=>{log('检测到锁定或闯关限制，尝试后续可进入的章节');record('stage','ADAPTER');}});
    else {if(!valid(token)||!playing)return;selectedTarget=next();selectedTarget.click();}return selectedTarget;
  }
  function saveButtons(){return query('button,a,[role=button],input[type=button]').filter(e=>visible(e)&&!e.disabled&&/^(保存试卷|保存答案)$/.test((e.innerText||e.value||'').trim()));}
  function inlineVideoFor(items){
    if(saveButtons().length || items.some(q=>/\/(exam|homework|test)(\/|$)/i.test(q.root.ownerDocument.location.pathname)))return null;
    const list=videos();return list.length===1&&!list[0].ended?list[0]:null;
  }
  async function confirmInline(items,token){
    const selector='button,a,[role=button],input[type=button],input[type=submit],[ng-click],[onclick],[class*="btn"]';
    const candidates=(includeDisabled=false)=>{
      const found=new Set();
      for(const q of items){
        const dialog=q.root.closest('[role=dialog],.modal,.dialog,.popup,.layui-layer');
        for(let scope=dialog||q.root.parentElement;scope&&scope!==q.root.ownerDocument.body;scope=scope.parentElement){
          const list=query(selector,scope).filter(e=>visible(e)&&(includeDisabled||(!e.disabled&&e.getAttribute('aria-disabled')!=='true'&&!e.classList.contains('disabled')))&&/^(确定|确认|确认答案|继续播放|完成)$/.test((e.innerText||e.value||'').replace(/\s+/g,'')));
          if(list.length){list.forEach(e=>found.add(e));break;}
          if(dialog&&scope===dialog)break;
        }
      }
      return [...found].filter(e=>![...found].some(parent=>parent!==e&&parent.contains(e)));
    };
    const corrections=new Map();
    async function correctFeedback(){
      for(const q of items){
        if(!valid(token))return false;
        const scope=q.root.closest(overlaySelector)||q.root.parentElement;
        const own=q.root.innerText;
        const text=/正确答案|参考答案|标准答案/.test(own)?own:items.length===1?scope?.innerText||'':'';
        const match=text.match(/(?:正确答案|参考答案|标准答案)\s*[:：]\s*([^\n]+)/);
        if(!match||q.payload.type==='blank')continue;
        const value=match[1].trim().replace(/[Ａ-Ｚ]/g,c=>String.fromCharCode(c.charCodeAt(0)-65248));
        let answers;
        if(value.startsWith('[')){try{const end=value.indexOf(']');if(end<0)continue;const letters=JSON.parse(value.slice(0,end+1));if(!Array.isArray(letters)||!letters.length||letters.some(x=>typeof x!=='string'||!/^\s*[A-L]\s*$/.test(x)))continue;answers=[...new Set(letters.map(x=>x.trim().charCodeAt(0)-65))];}catch{continue;}}
        else if(/^[A-L](?:[\s、,，;；/和与]*[A-L])*[。.]?$/.test(value))answers=[...new Set((value.match(/[A-L]/g)||[]).map(c=>c.charCodeAt(0)-65))];
        else{
          const label=value.match(/^([A-L])[.．、\s]/);
          if(label&&q.payload.type==='single')answers=[label[1].charCodeAt(0)-65];
          else {const norm=s=>s.replace(/^[A-L][.．、]\s*/,'').replace(/\s+/g,'').trim();const i=q.payload.options.findIndex(o=>norm(o)===norm(value));if(i>=0)answers=[i];}
        }
        if(!answers?.length||answers.some(i=>i>=q.inputs.length)||(q.payload.type==='single'&&answers.length!==1))continue;
        if(q.inputs.every((input,i)=>input.checked===answers.includes(i)))continue;
        if((corrections.get(q.root)||0)>=2)throw failure('按网站正确答案修正后仍未通过，请人工检查','MANUAL');
        if(!q.root.isConnected||q.inputs.some(input=>!input.isConnected||input.disabled))throw failure('网站已锁定答案，无法自动修正，请人工处理','MANUAL');
        corrections.set(q.root,(corrections.get(q.root)||0)+1);
        for(let i=0;i<q.inputs.length;i++){
          if(!valid(token))return false;
          if(q.inputs[i].checked!==answers.includes(i)&&(q.payload.type==='multiple'||answers.includes(i)))q.inputs[i].click();
        }
        log('已根据网站公布的正确答案修正选项');await sleep(200);return true;
      }
      return false;
    }
    let buttons=[];
    for(let n=0;n<8;n++){if(!valid(token))return false;await correctFeedback();buttons=candidates();if(buttons.length)break;await sleep(200);}
    if(!buttons.length&&candidates(true).length)throw failure('弹题确定按钮仍不可用，请检查网站答案反馈','CONFIRM');
    if(buttons.length>1)throw failure('视频弹题的确定按钮不唯一，请人工确认','MANUAL');
    if(!buttons.length){log('视频弹题未提供确认按钮，直接恢复播放');return true;}
    const v=inlineVideoFor(items),time=v?.currentTime;
    let button=buttons[0];if(!valid(token))return false;record('stage','CONFIRM');button.click();say('已点击视频弹题“确定”，等待弹窗关闭或恢复播放');
    for(let n=0;n<40;n++){
      if(!valid(token))return false;
      if(!button.isConnected||!visible(button)||items.every(q=>!q.root.isConnected||!visible(q.root)))return true;
      if(v?.isConnected&&!v.paused&&v.currentTime>time+0.05&&items.every(q=>!activeQuestionRoot(q.root)))return true;
      if(await correctFeedback()){
        for(let retry=0;retry<8;retry++){if(!valid(token))return false;const available=candidates();if(available.length===1){button=available[0];if(!valid(token))return false;button.click();break;}await sleep(200);}
      }
      await sleep(150);
    }
    throw failure('已点击确定但弹题仍显示，请检查网站反馈','CONFIRM');
  }
  function sameQuestions(a,b){return a.length===b.length&&a.every((q,i)=>q.root===b[i].root&&q.signature===b[i].signature&&q.inputs.length===b[i].inputs.length&&q.inputs.every((input,j)=>input===b[i].inputs[j]));}
  async function readyQuestions(token){
    let previous=[],stableAt=Date.now();
    for(let n=0;n<100;n++){
      if(!valid(token))return null;
      const current=questions();
      if(!sameQuestions(previous,current)){previous=current;stableAt=Date.now();}
      const docs=[...new Set(current.map(q=>q.root.ownerDocument))];
      const complete=current.length>0&&docs.every(doc=>{
        const count=query('.ti',doc).filter(activeQuestionRoot).length;
        const expected=[...((doc.querySelector('.queList')?.innerText||'').matchAll(/共\s*(\d+)\s*题/g))].reduce((sum,m)=>sum+Number(m[1]),0);
        const recognized=current.filter(q=>q.root.ownerDocument===doc).length;
        return count<=recognized&&(!expected||recognized===expected);
      });
      if(complete&&Date.now()-stableAt>=750)return current;
      await sleep(150);
    }
    throw failure('测验题目尚未完整加载或有不支持的题型，未保存，请检查页面后重试','UNSUPPORTED');
  }
  function verifiedBatch(batch,allowNavigation=false){
    return batch&&(allowNavigation||batch.context===location.href)&&sameQuestions(batch.items,questions())&&batch.items.every((q,n)=>(allowNavigation||q.root.ownerDocument.URL===batch.documents[n])&&q.inputs.every((input,i)=>q.payload.type==='blank'?input.value===batch.answers[n][i]:input.checked===batch.answers[n].includes(i)));
  }
  async function saveAnswers(token,batch){
    if(!valid(token))return false;
    if(!verifiedBatch(batch))throw failure('当前测验尚未全部答完或答案发生变化，未点击保存','SAVE');
    const buttons=saveButtons();
    const specific=buttons.filter(e=>/保存试卷|保存答案/.test(e.innerText||e.value||''));
    const list=specific.length?specific:buttons;
    if(list.length!==1)throw failure('未找到唯一的答案保存按钮，已暂停','SAVE');
    const doc=list[0].ownerDocument;let saved=false;
    const observer=new MutationObserver(records=>{
      for(const r of records)for(const node of [...r.addedNodes,...(r.type==='characterData'?[r.target]:[])])
        if(/保存(?:试卷|答案)?成功|已成功保存|试卷已保存|答案已保存|没有新的内容需要保存/.test(node.textContent||''))saved=true;
    });
    observer.observe(doc.body,{childList:true,subtree:true,characterData:true});
    try{
      if(!valid(token))return false;
      if(list[0].ownerDocument!==batch.items[0].root.ownerDocument||!verifiedBatch(batch))throw failure('测验页面已变化，未点击保存','PAGE_CHANGED');
      record('stage','SAVE');list[0].click();say('全部答案已核对，等待网站确认保存','SAVE');
      for(let n=0;n<48;n++){if(!valid(token))return false;if(saved){log(settings.autoSubmit?'答案已保存，正在尝试提交普通测验':'答案已保存，提交留待之后集中处理；正在继续视频');return true;}await sleep(250);}
      throw failure('未收到网站保存成功提示，已暂停，请检查答案是否保存','SAVE');
    }finally{observer.disconnect();}
  }
  async function leaveSavedQuiz(batch,token){
    const identity=()=>location.href+'|'+(globalThis.UoocCatalog?.context?.().resource||'');
    let state=savedNavigation.get(batch);
    if(!state){state={origin:identity(),target:null,token,retried:false};savedNavigation.set(batch,state);say('答案已保存，正在打开下一资源','VIDEO_LOADING');state.target=await advance(token);}
    else if(state.token!==token){state.token=token;state.retried=false;if(!state.target&&identity()===state.origin)state.target=await advance(token);}
    for(let n=0;n<80;n++){
      if(!valid(token)||!playing)return false;if(blocked())throw failure('下一资源需要人工处理，已保留保存结果','MANUAL');
      const current=questions();if(!current.some(q=>batch.items.some(old=>old.root===q.root&&old.signature===q.signature))){savedNavigation.delete(batch);return true;}
      if(n>=12&&!state.retried&&identity()===state.origin){
        const target=state.target;state.retried=true;
        if(target?.isConnected&&visible(target)&&!target.disabled&&!target.classList.contains('disabled')&&!target.querySelector('.icon-lock,[class$="_icon_lock"],img[src$="/lock.png"]')&&target.getAttribute('aria-disabled')!=='true'&&!target.closest('.locked,.unopen,.is-locked,[data-locked=true]')){if(!valid(token)||!playing)return false;log('下一资源尚未响应，重试同一入口');target.click();}
      }
      await sleep(250);
    }
    throw failure('答案已保存，但下一资源尚未加载；请检查目录后点击继续连播重试','ADAPTER');
  }
  function quizDocument(doc){
    const title=[doc.title,...Array.from(doc.querySelectorAll('h1,.paper-title,.exam-title,.task-title')).map(e=>e.textContent)].join(' ');
    if(/期末|期中|考试|作业/.test(title))return false;
    const context=globalThis.UoocCatalog?.context?.().chapter||'';
    return !!doc.querySelector('.smallTest-view,[data-task-type=quiz]')||/测验|随堂测试|单元测试|章节测试|练习/.test(title)||(/测验/.test(context)&&/\/(exam|test)(\/|$)/.test(doc.location.pathname));
  }
  async function submitQuiz(token,batch){
    if(!globalThis.UoocQuizSubmission)throw Error('提交模块未加载，请重新加载扩展');
    submitting=true;phase='SUBMIT';record('stage','SAVE');
    try{const result=await UoocQuizSubmission.submit(batch,{visible,verify:verifiedBatch,isQuiz:quizDocument,allowed:()=>valid(token)&&playing&&settings.autoSubmit===true,say});if(result&&globalThis.UoocCatalog?.available?.()){for(let n=0;n<20;n++){if(!valid(token)||!settings.autoSubmit)return false;if(UoocCatalog.context?.().finished)break;await sleep(150);}}return result;}finally{if(token===epoch)submitting=false;}
  }
  async function loadedVideo(token) {
    const recoveredPickers=new Set();
    for(let n=0;n<60;n++){
      if(!valid(token)||!playing)return null;
      if(blocked())throw failure('当前资源需要人工处理，连播暂停','MANUAL');
      const passed=documents().find(doc=>quizDocument(doc)&&!submittedDocs.has(doc)&&globalThis.UoocQuizSubmission?.status(doc,visible));
      if(passed){submittedDocs.add(passed);await UoocQuizSubmission.acknowledge(passed,{visible,allowed:()=>valid(token)&&playing});if(!valid(token))return null;await advance(token);continue;}
      if(globalThis.UoocCatalog?.gateNotice?.()){log('当前小节被闯关规则限制，正在尝试后面的章节');await advance(token,false,true);continue;}
      if(questions().length){
        if(!settings.autoExercises)throw failure('当前资源需要人工处理，连播暂停','MANUAL');
        let current=questions();
        const inline=inlineVideoFor(current);
        if(current.every(q=>savedQuestions.get(q.root)===q.signature)){if(inline){speed(inline);return inline;}if(!settings.autoSubmit||submittedDocs.has(current[0].root.ownerDocument)){const saved=savedBatches.get(current[0].root.ownerDocument);if(saved&&verifiedBatch(saved,savedNavigation.has(saved))){if(!await leaveSavedQuiz(saved,token))return null;continue;}current.forEach(q=>savedQuestions.delete(q.root));}}
        busy=true;el('solve').disabled=true;
        try{
          const cached=savedBatches.get(current[0].root.ownerDocument);const answered=cached&&verifiedBatch(cached)?cached:await solveQuestions(token);if(!valid(token)||!answered)return null;current=answered.items;
          if(inline){
            if(!inline.isConnected||inlineVideoFor(current)!==inline)throw failure('视频弹题页面已变化，请检查','PAGE_CHANGED');
            if(!await confirmInline(current,token))return null;current.forEach(q=>savedQuestions.set(q.root,q.signature));
            say('视频弹题已填写，继续当前视频');speed(inline);return inline;
          }
          if(saveButtons().length){if(!await saveAnswers(token,answered))return null;}else if(!settings.autoSubmit){throw failure('未找到唯一的答案保存按钮，已暂停','SAVE');}
          savedBatches.set(current[0].root.ownerDocument,answered);
          if(settings.autoSubmit){if(!await submitQuiz(token,answered))return null;submittedDocs.add(current[0].root.ownerDocument);log('网站已确认测验提交成功，继续后续资源');}
          current.forEach(q=>savedQuestions.set(q.root,q.signature));if(!await leaveSavedQuiz(answered,token))return null;n=0;
        }
        finally{if(token===epoch){busy=false;el('solve').disabled=!!globalThis.ChaoxingLearning;}}
        continue;
      }
      const list=videos();if(!list.length&&n>=4&&globalThis.UoocCatalog?.picker?.()&&!recoveredPickers.has(location.href)){recoveredPickers.add(location.href);log('当前为目录占位页，继续查找可播放资源');await advance(token,true);continue;}if(list.length===1&&!list[0].ended){speed(list[0]);return list[0];}
      await sleep(250);
    }
    throw failure('视频加载超时，请检查网络或选择具体资源','VIDEO_TIMEOUT');
  }
  function stop(message,reason='error',code) {
    lastStopReason=reason;lastStopCode=reason==='timer'?'TIMER':reason==='manual'?'PAUSE':code||'UNKNOWN';
    sample(true);flushStats();playing=false;epoch++;deadline=0;clearTimeout(deadlineTimeout);busy=false;advancing=false;submitting=false;reviewResolver?.(false);reviewResolver=null;review.hidden=true;
    query('video').forEach(v=>v.pause());say(message,'PAUSED');el('play').disabled=false;el('solve').disabled=!!globalThis.ChaoxingLearning;resumeLabels();lastStopCode=reason==='timer'?'TIMER':reason==='manual'?'PAUSE':code||classify(message);
    cancelBarrier=featureMessage('cancelRequests');featureMessage('timerStop',{run});record(reason==='error'?'error':reason==='timer'?'timer':'pause',lastStopCode);
    if(reason==='error')beepOnce(lastStopCode);renderStats();
  }
  function next() {
    const candidates=settings.nextSelector?query(settings.nextSelector):query('button,a,[role=button]').filter(e=>/^(下一节|下一视频|下一课时|下一小节)$/.test(e.innerText.trim()));
    const available=candidates.filter(e=>visible(e)&&!e.disabled&&e.getAttribute('aria-disabled')!=='true');
    if(available.length!==1) throw Error(available.length?'下一节入口不唯一，请设置精确选择器':'未找到下一节；课程可能结束，请检查目录');
    if(/测验|作业|考试/.test(available[0].innerText)) throw Error('下一项需要答题，请手动进入');
    return available[0];
  }
  const bound=new WeakSet();
  function bind() {
    videos().forEach(v=>{if(playing)speed(v);if(bound.has(v)) return;bound.add(v);
      v.addEventListener('loadedmetadata',()=>{if(playing)speed(v);});
      v.addEventListener('seeking',()=>{sampleState=null;flushStats();});
      v.addEventListener('pause',()=>{sample(true);flushStats();});
      v.addEventListener('waiting',()=>{sample(true);sampleState=null;});
      v.addEventListener('ended', async()=>{
        if(!playing||advancing||!valid(epoch)||!v.isConnected||!visible(v)||videoOwners.get(v)!==epoch) return;if(!finishVideo(v))return;globalThis.ChaoxingLearning?.markEnded(v);advancing=true;const token=epoch;say(`本次已播完 ${completed} 节，等待切换`);
        try {await wait();if(!valid(token)||!playing)return;if(blocked())throw Error('需要人工处理当前页面');
          await advance(token);
          const nextVideo=await loadedVideo(token);if(!nextVideo||!valid(token))return;
          bind();lastProgress=Date.now();lastTime=-1;await playVideo(nextVideo,token);if(!valid(token))return;
          say(`已切换，等待播放器；本次播完 ${completed} 节`);
        } catch(e){if(token===epoch)stop(e.message,'error',e.code);} finally{if(token===epoch)advancing=false;}
      });
      v.addEventListener('error',()=>{if(playing&&v.isConnected&&videos().includes(v)&&videoOwners.get(v)===epoch)stop('视频加载失败，请检查网络后重试','error','PLAYBACK');});
    });
  }
  let lastProgress=Date.now(),lastTime=-1,pickerIdleSince=0;
  setInterval(async()=>{const tickToken=epoch;try{
    bind();if(!valid(epoch)||!playing||advancing)return;
    if(blocked()){stop('遇到考试或验证，请人工处理','error','MANUAL');return;}
    if(globalThis.UoocCatalog?.gateNotice?.()){advancing=true;try{await advance(tickToken,false,true);const v=await loadedVideo(tickToken);if(v)await playVideo(v,tickToken);}finally{if(tickToken===epoch)advancing=false;}return;}
    const pending=questions();
    if(pending.length&&!(inlineVideoFor(pending)&&pending.every(q=>savedQuestions.get(q.root)===q.signature))){advancing=true;try{const v=await loadedVideo(tickToken);if(v&&valid(tickToken)){bind();lastProgress=Date.now();await playVideo(v,tickToken);}}finally{if(tickToken===epoch)advancing=false;}return;}
    const list=videos();if(!list.length&&!pending.length&&globalThis.UoocCatalog?.picker?.()){if(!pickerIdleSince)pickerIdleSince=Date.now();if(Date.now()-pickerIdleSince>=1500){pickerIdleSince=0;const token=epoch;advancing=true;try{log('检测到资源选择占位页，继续查找视频');await advance(token,true);const nextVideo=await loadedVideo(token);if(nextVideo&&valid(token)){bind();lastProgress=Date.now();await playVideo(nextVideo,token);}}finally{if(token===epoch)advancing=false;}}return;}pickerIdleSince=0;if(list.length!==1){if(Date.now()-lastProgress>20000)stop('未找到唯一可见播放器，请手动进入视频页','error','UNSUPPORTED');return;}
    const v=list[0];if(v.currentTime!==lastTime){lastTime=v.currentTime;lastProgress=Date.now();}
    if(Date.now()-lastProgress>45000){stop('播放停滞，请检查网络或手动播放','error','PLAYBACK');return;}
    if(v.paused&&!v.ended){advancing=true;try{await playVideo(v,tickToken);}catch(e){if(tickToken===epoch)stop(e.message||'播放器启动失败，请点击视频后继续','error',e.code||'PLAYBACK');}finally{if(tickToken===epoch)advancing=false;}}
  }catch(e){if(tickToken===epoch)stop(e.message||'页面识别失败','error',e.code||'ADAPTER');}},1500);
  el('inspect').onclick=()=>{try{
    const items=questions(),info={version:VERSION,adapter:globalThis.UoocCatalog?.name?.()||'通用页面',accessibleIframes:documents().length-1,videos:videos().length,questions:{single:items.filter(q=>q.payload.type==='single').length,multiple:items.filter(q=>q.payload.type==='multiple').length,blank:items.filter(q=>q.payload.type==='blank').length},saveButtons:saveButtons().length,confirmButtons:query('button,a,[role=button],input[type=button],[ng-click]').filter(e=>visible(e)&&/^(确定|确认|确认答案|继续播放|完成)$/.test((e.innerText||e.value||'').replace(/\s+/g,''))).length,stopCode:lastStopCode,phase,progress:{...progress}};
    el('diagnosticText').textContent=JSON.stringify(info,null,2);el('moreTools').open=true;el('diagnostic').hidden=false;el('diagnostic').open=true;if(!busy&&!playing&&phase!=='REVIEW')say(info.adapter+'：'+info.videos+' 个视频、'+items.length+' 道题（选择/判断/填空）');record('diagnostic',lastStopCode);placePanel();
  }catch(e){say(e.message);}};
  el('copyDiagnostic').onclick=async()=>{try{await navigator.clipboard.writeText(el('diagnosticText').textContent);el('copyDiagnostic').textContent='已复制';}catch{el('copyDiagnostic').textContent='复制受限，请选中文本复制';}};
  el('play').onclick=async()=>{
    if(busy||advancing||playing)return;resumeMode='video';resumeLabels();const token=++epoch;
    try{if(blocked())throw Error('当前页面需要人工处理');
      playing=true;advancing=true;el('play').disabled=true;prepareAudio();await beginRun(token);if(!valid(token))return;say('正在打开视频资源','VIDEO_LOADING');
      let list=videos();
      if(!list.length && !questions().length && globalThis.UoocCatalog?.available())await advance(token,true);
      const v=await loadedVideo(token);if(!v||!valid(token))return;
      lastProgress=Date.now();lastTime=-1;bind();await playVideo(v,token);if(!valid(token))return;
      say('正在连续播放，视频结束后切换');
    }catch(e){if(token===epoch)stop(e.message,'error',e.code);}finally{if(token===epoch)advancing=false;}
  };
  el('stop').onclick=()=>stop('已暂停；正在进行的 API 请求可能仍产生费用，返回结果将被丢弃','manual');
  async function solveQuestions(token,attempt=0){
      if(blocked())throw Error('考试或验证页面保留人工操作');
      record('stage','QUESTION');say('等待当前测验题目加载完成','QUESTION');
      const context=location.href,items=await readyQuestions(token);if(!items||!valid(token))return null;
      const batch={context,items,documents:items.map(q=>q.root.ownerDocument.URL),answers:[]};
      const count=query('.ti').filter(activeQuestionRoot).length;
      if(count>items.length)throw Error('包含未识别或不支持的题型，已暂停，请人工处理');
      if(checkpoint.context!==context)checkpoint={context,records:new Map()};
      const currentRoots=new Set(items.map(q=>q.root));for(const root of checkpoint.records.keys())if(!currentRoots.has(root))checkpoint.records.delete(root);
      Object.assign(progress,{total:items.length,filled:0,current:0,guessed:0,retries:0});renderProgress();
      await reviewCheckpoint(items,token,context);if(!runCurrent(token,context))return null;
      for(let n=0;n<items.length;n++){
        if(!runCurrent(token,context))return;const q=items[n];progress.current=n+1;renderProgress();
        const cached=checkpoint.records.get(q.root);
        if(cached&&cached.signature===q.signature&&cached.document===q.root.ownerDocument.URL&&matchesAnswer(q,cached.answers)){
          batch.answers.push([...cached.answers]);progress.filled++;if(cached.uncertain)progress.guessed++;renderProgress();continue;
        }
        checkpoint.records.delete(q.root);
        say(`正在分析第 ${n+1}/${items.length} 题`);
        const initialValues=q.inputs.map(i=>q.payload.type==='blank'?i.value:i.checked);
        const result=await requestAnswer(q,token,context);if(!runCurrent(token,context))return;log(`第 ${n+1} 题${(result.guessed||result.uncertain)?'（推测答案）':''}：${q.payload.type==='blank'?result.answers.map((s,i)=>`第${i+1}空：${s}`).join('；'):result.answers.map(i=>String.fromCharCode(65+i)).join('、')}\n${result.explanation}`);
        batch.answers.push(result.answers);
        await wait();if(!runCurrent(token,context))return;
        const fresh=questions().find(x=>x.root===q.root);
        if(!q.root.isConnected || !fresh || fresh.signature!==q.signature || fresh.inputs.some((input,i)=>input!==q.inputs[i]) || blocked())throw Error('题目页面已变化，停止填写');
        if(q.inputs.some((input,i)=>(q.payload.type==='blank'?input.value:input.checked)!==initialValues[i])){checkpoint.records.set(q.root,{signature:q.signature,document:q.root.ownerDocument.URL,answers:[...result.answers],uncertain:!!(result.guessed||result.uncertain)});throw Error('模型请求期间页面答案已修改，已保留；点击继续后确认采用页面答案');}
        q.root.scrollIntoView({behavior:'smooth',block:'center'});
        for(let i=0;i<q.inputs.length;i++){
          if(!valid(token))return;
          const input=q.inputs[i],wanted=result.answers.includes(i);
          if(input.disabled||!input.isConnected)throw Error('选项不可操作');
          if(q.payload.type==='blank'){
            if(input.readOnly)throw Error('填空输入框只读');
            const win=input.ownerDocument.defaultView;
            const proto=input.tagName==='TEXTAREA'?win.HTMLTextAreaElement.prototype:win.HTMLInputElement.prototype;
            Object.getOwnPropertyDescriptor(proto,'value').set.call(input,result.answers[i]);
            input.dispatchEvent(new win.Event('input',{bubbles:true}));input.dispatchEvent(new win.Event('change',{bubbles:true}));input.dispatchEvent(new win.Event('blur',{bubbles:true}));
            input.dispatchEvent(new win.MouseEvent('mouseleave',{bubbles:false}));
          }else if(input.checked!==wanted && (q.payload.type==='multiple'||wanted))input.click();
          await sleep(350);if(!runCurrent(token,context))return;
          if(q.inputs.slice(0,i+1).some((input,j)=>q.payload.type==='blank'?input.value!==result.answers[j]:input.checked!==result.answers.includes(j))){checkpoint.records.set(q.root,{signature:q.signature,document:q.root.ownerDocument.URL,answers:[...result.answers],uncertain:!!(result.guessed||result.uncertain)});throw Error('填写期间页面答案已修改，已保留；请继续并确认页面答案');}
        }
        if(q.inputs.some((input,i)=>q.payload.type==='blank'?input.value!==result.answers[i]:input.checked!==result.answers.includes(i)))throw Error('答案未成功写入，请人工核对');
        checkpoint.records.set(q.root,{signature:q.signature,document:q.root.ownerDocument.URL,answers:[...result.answers],uncertain:!!(result.guessed||result.uncertain)});progress.filled++;if(result.guessed||result.uncertain)progress.guessed++;renderProgress();
        say(`已填写 ${n+1}/${items.length} 题`,'QUESTION');await wait();
      }
      await readyQuestions(token);if(!valid(token))return null;
      if(context!==location.href)throw Error('已离开原测验，未保存');
      if(!verifiedBatch(batch)){
        if(attempt>=2)throw Error('题目或答案持续变化，未保存，请检查页面');
        log('检测到题目追加或答案重置，重新核对本次测验');return solveQuestions(token,attempt+1);
      }
      say(playing?(settings.autoSubmit?'填写完成，正在保存并提交测验':'填写完成，正在保存并继续视频'):'填写完成，可手动保存，之后集中提交',playing?'SAVE':'COMPLETE');if(!playing){resumeMode=null;resumeLabels();}
      return batch;
  }
  el('solve').onclick=async()=>{
    if(globalThis.ChaoxingLearning){say('学习通可编辑测验尚待适配，请人工作答与保存');return;}
    if(busy)return;alerted.clear();prepareAudio();stop('正在读取题目','manual');resumeMode='quiz';resumeLabels();phase='QUESTION';const token=epoch;busy=true;el('solve').disabled=true;el('play').disabled=true;
    try {await solveQuestions(token);
    }catch(e){if(token===epoch){lastStopReason='error';lastStopCode=e.code||'UNKNOWN';say(e.message || '请求失败','PAUSED');record('error',lastStopCode);beepOnce(lastStopCode);}}finally{if(token===epoch){busy=false;el('solve').disabled=false;el('play').disabled=false;resumeLabels();}}
  };
})();









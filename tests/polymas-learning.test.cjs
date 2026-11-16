const {test,before,after}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const {chromium}=require('playwright');let browser;
const root='https://hike-teaching-center.polymas.com/custom-stu-hike/agent-course-full/demo',preview='https://polymas.com/resource/online/preview/';
const source=n=>fs.readFileSync(n,'utf8');
before(async()=>browser=await chromium.launch({channel:'msedge',headless:true}));after(async()=>browser?.close());
const item=(id,title,extra='')=>`<div role="treeitem" data-key="${id}"><div class="el-tree-node__content"><div class="file-tag">必学</div><div class="file-name" onclick="selectResource('${id}')">${title}</div><div class="node-actions"><label class="agent-course-form-item-checkbox ${extra}"><input type="checkbox" checked></label></div></div></div>`;
async function setup({detail=false,mode='normal'}={}){
 const p=await browser.newPage();
 await p.route('**/*',async route=>{
  const u=new URL(route.request().url());
  if(u.hostname==='polymas.com')return route.fulfill({contentType:'text/html',body:`<meta charset="utf-8"><video style="width:500px;height:260px"></video><script>
   const v=document.querySelector('video');window.media=v;window.running=${mode==='autoplay'};window.done=false;window.time=0;window.buffer=false;window.calls=[];
   Object.defineProperties(v,{paused:{get:()=>!running},ended:{get:()=>done},seeking:{get:()=>false},readyState:{get:()=>buffer?1:4},currentTime:{get:()=>time},duration:{get:()=>20}});
   v.play=async()=>{calls.push('play');${mode==='reject'?"throw Object.assign(Error('blocked'),{name:'NotAllowedError'});":mode==='pending'?"await new Promise(r=>window.releasePlay=r);":""}running=true;v.dispatchEvent(new Event('play'));};v.pause=()=>{calls.push('pause');running=false;v.dispatchEvent(new Event('pause'));};
  </script><script>${source('polymas-parser.js')}</script><script>${source('polymas-player.js')}</script>`});
  return route.fulfill({contentType:'text/html',body:`<meta charset="utf-8"><title>学习资源-AI教学中心</title><div class="course-title"><p class="line1">模拟人工智能课程</p></div><span class="count-span-item">总学习进度 <i>25%</i></span><div role="tree">${item('done','已完成.mp4','success')}${item('one','当前视频.mp4')}${item('pdf','课件.pdf')}${item('two','后续视频.mp4')}</div><div id="player"></div><script>
   window.selected=[];window.selectResource=id=>{selected.push(id);history.pushState({},'', '${root}/group/'+id+'/type/stu/study/resource-detail');document.querySelector('#player').innerHTML='<iframe style="width:600px;height:320px" src="${preview}?courseId=demo&fileId='+id+'"></iframe>';};
   const attach=Element.prototype.attachShadow;Element.prototype.attachShadow=function(o){window.panel=attach.call(this,o);return panel;};
   window.messages=[];window.listeners=[];window.chrome={runtime:{getManifest:()=>({version:'2.2.0'}),onMessage:{addListener:f=>listeners.push(f)},sendMessage:async m=>{messages.push(m);return {result:m.type==='uiGet'?{settings:{delay:.001,autoSubmit:true,rate:1.5,timerMinutes:0,sound:false}}:{}};}},storage:{onChanged:{addListener:()=>{}}}};
  </script>`});
 });
 await p.goto(root+'/stu/study?activeTab=resource');
 if(detail)await p.evaluate(()=>selectResource('one'));
 for(const n of ['platforms.js','polymas-parser.js','polymas-adapter.js','content.js'])await p.addScriptTag({content:source(n)});
 await p.waitForFunction(()=>window.panel&&panel.getElementById('autoSubmit').disabled);
 return p;
}
const click=(p,id)=>p.evaluate(id=>panel.getElementById(id).click(),id);
const player=p=>p.frames().find(f=>f.url().startsWith(preview));
test('打开资源页只建立媒体桥接，不自动播放、暂停或请求模型',async()=>{
 const p=await setup({detail:true});try{await p.waitForFunction(()=>PolymasLearning.videos().length===1);assert.deepEqual(await player(p).evaluate(()=>calls),[]);assert.equal(await p.evaluate(()=>messages.some(m=>m.type==='solve'||m.type==='timerStart')),false);}finally{await p.close();}
});
test('更多展开后重新定位，桌面与窄屏面板不与悬浮球重叠',async()=>{
 const p=await setup({detail:true});try{
  for(const width of [1100,390]){await p.setViewportSize({width,height:844});await p.evaluate(()=>{panel.getElementById('orb').click();panel.getElementById('moreTools').open=true;});await p.waitForFunction(()=>{const b=panel.getElementById('panel').getBoundingClientRect(),o=panel.getElementById('orb').getBoundingClientRect();return b.bottom<=o.top-8&&b.left>=0&&b.right<=innerWidth;});await click(p,'minimize');}
 }finally{await p.close();}
});
test('资源列表仅选择未完成视频，目录勾选不被识别为题目；播完跨域视频后跳过 PDF 并续播',async()=>{
 const p=await setup();try{
  assert.deepEqual(await p.evaluate(()=>PolymasParser.entries().map(e=>({id:e.id,done:e.done}))),[{id:'done',done:true},{id:'one',done:false},{id:'pdf',done:false},{id:'two',done:false}]);
  await click(p,'play');await p.waitForFunction(()=>PolymasLearning.videos()[0]?.paused===false);assert.deepEqual(await p.evaluate(()=>selected),['one']);assert.equal(await player(p).evaluate(()=>media.playbackRate),1.5);
  await player(p).evaluate(()=>{done=true;running=false;time=20;media.dispatchEvent(new Event('ended'));});
  await p.waitForFunction(()=>selected.includes('two'),null,{timeout:5000}).catch(async error=>{console.error(JSON.stringify(await p.evaluate(()=>({state:panel.getElementById('state').textContent,selected,media:PolymasLearning.videos().map(v=>({ended:v.ended,paused:v.paused,time:v.currentTime})),messages}))));throw error;});await p.waitForFunction(()=>PolymasLearning.videos()[0]?.currentSrc==='polymas:two'&&!PolymasLearning.videos()[0].paused);
  assert.deepEqual(await p.evaluate(()=>selected),['one','two']);assert.equal(await player(p).evaluate(()=>media.playbackRate),1.5);assert.equal(await p.evaluate(()=>messages.filter(m=>m.type==='solve').length),0);
  assert.ok(await p.evaluate(()=>messages.some(m=>m.type==='activityReport'&&m.ended&&m.resource==='polymas:one'&&m.position.title==='模拟人工智能课程')));
 }finally{await p.close();}
});
test('详情页加载握手期间开始，不跳过当前视频；倍速修改、暂停和继续有效',async()=>{
 const p=await setup({detail:true});try{
  await click(p,'play');await p.waitForFunction(()=>PolymasLearning.videos()[0]?.paused===false);assert.deepEqual(await p.evaluate(()=>selected),['one']);
  await p.evaluate(()=>{panel.getElementById('rate').value='1.75';panel.getElementById('rate').dispatchEvent(new Event('change'));});await player(p).waitForFunction(()=>media.playbackRate===1.75);
  await click(p,'stop');await player(p).waitForFunction(()=>!running);assert.match(await p.evaluate(()=>panel.getElementById('state').textContent),/已暂停/);
  await click(p,'play');await p.waitForFunction(()=>!PolymasLearning.videos()[0]?.paused);assert.deepEqual(await p.evaluate(()=>selected),['one']);
 }finally{await p.close();}
});
test('暂停后旧播放承诺返回不恢复；新一轮播放不被旧返回暂停',async()=>{
 const p=await setup({detail:true,mode:'pending'});try{
  await click(p,'play');await player(p).waitForFunction(()=>typeof releasePlay==='function');await click(p,'stop');await player(p).waitForFunction(()=>calls.includes('pause'));
  await player(p).evaluate(async()=>{releasePlay();await new Promise(r=>setTimeout(r,50));});assert.equal(await player(p).evaluate(()=>running),false);
  await click(p,'play');await player(p).waitForFunction(()=>calls.filter(c=>c==='play').length===2);await player(p).evaluate(()=>releasePlay());await p.waitForFunction(()=>PolymasLearning.videos()[0]?.paused===false);
 }finally{await p.close();}
});
test('自动播放拒绝时提示人工点击，不切换或计为完成',async()=>{
 const p=await setup({detail:true,mode:'reject'});try{await click(p,'play');await p.waitForFunction(()=>panel.getElementById('state').textContent.includes('浏览器阻止'));assert.deepEqual(await p.evaluate(()=>selected),['one']);assert.equal(await p.evaluate(()=>messages.some(m=>m.type==='activityReport'&&m.ended)),false);}finally{await p.close();}
});
test('新播放器尚未握手时暂停，加载后补发暂停且不会自动启动助手',async()=>{
 const p=await setup({mode:'autoplay'});try{
  await p.route('https://polymas.com/**',async route=>{await new Promise(r=>setTimeout(r,300));await route.fallback();});
  await p.evaluate(()=>{selectResource('one');PolymasLearning.pause();});
  await p.waitForFunction(()=>PolymasLearning.videos().length===1);await player(p).waitForFunction(()=>calls.includes('pause'));assert.equal(await player(p).evaluate(()=>running),false);assert.equal(await p.evaluate(()=>messages.some(m=>m.type==='timerStart')),false);
 }finally{await p.close();}
});
test('跨域消息拒绝父页面伪造、其他来源、错误令牌和损坏状态',async()=>{
 const p=await setup({detail:true});try{
  await p.waitForFunction(()=>PolymasLearning.videos().length===1);await p.evaluate(()=>{window.captured=null;const old=window.postMessage;window.addEventListener('message',e=>{if(e.data?.channel==='uooc-polymas-player-v1')captured=e.data;});});
  await p.waitForFunction(()=>captured?.token);const prior=await p.evaluate(()=>PolymasLearning.videos()[0].currentTime);
  await p.evaluate(()=>window.dispatchEvent(new MessageEvent('message',{source:document.querySelector('iframe').contentWindow,origin:'https://polymas.com',data:{...captured,state:{...captured.state,time:999}}})));
  assert.equal(await p.evaluate(()=>PolymasLearning.videos()[0].currentTime),prior);
  const before=await player(p).evaluate(()=>calls.length);await player(p).evaluate(()=>window.dispatchEvent(new MessageEvent('message',{source:parent,origin:'https://evil.example',data:{channel:'uooc-polymas-player-v1',token:'x'.repeat(32),command:'play',id:99}})));assert.equal(await player(p).evaluate(()=>calls.length),before);
 }finally{await p.close();}
});
test('定时停止暂停跨域播放器，保留当前位置；窄屏面板可收起',async()=>{
 const p=await setup({detail:true});try{
  await p.setViewportSize({width:390,height:844});await click(p,'orb');await click(p,'play');await p.waitForFunction(()=>PolymasLearning.videos()[0]?.paused===false);
  await p.evaluate(()=>{const m=messages.find(m=>m.type==='timerStart');listeners.forEach(f=>f({type:'timerExpired',run:m.run}));});await player(p).waitForFunction(()=>!running);assert.match(await p.evaluate(()=>panel.getElementById('state').textContent),/定时已到/);
  await click(p,'minimize');assert.equal(await p.evaluate(()=>panel.getElementById('panel').hidden),true);assert.equal(await p.evaluate(()=>panel.getElementById('solve').hidden),true);
 }finally{await p.close();}
});

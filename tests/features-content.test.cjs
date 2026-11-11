const {test,before,after}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const {chromium}=require('playwright');let browser;
before(async()=>browser=await chromium.launch({channel:'msedge',headless:true}));after(async()=>browser?.close());
async function setup(settings={},extra=''){
 const page=await browser.newPage({viewport:{width:900,height:700}});await page.setContent('<title>测试课程</title><video style="width:300px;height:180px"></video><button class="next">下一节</button>'+extra);
 await page.evaluate(settings=>{
 const attach=Element.prototype.attachShadow;Element.prototype.attachShadow=function(p){const root=attach.call(this,p);window.panel=root;return root;};
 window.clockOffset=0;const now=Date.now.bind(Date);Date.now=()=>now()+window.clockOffset;
 window.intervals={};window.setInterval=(fn,ms)=>{window.intervals[ms]=fn;return ms;};window.messages=[];window.listeners=[];
 const prefs={delay:1,rate:2,timerMinutes:0,sound:false,questionSelector:'',stemSelector:'',nextSelector:'',...settings};
 window.chrome={runtime:{onMessage:{addListener:fn=>window.listeners.push(fn)},sendMessage:async msg=>{
 window.messages.push(msg);if(msg.type==='uiGet')return {result:{settings:prefs,position:null}};if(msg.type==='solve'){if(window.holdAnswer)return new Promise(resolve=>window.finishAnswer=resolve);return {result:{answers:[1],explanation:'secret model explanation'}};}if(msg.type==='settingsPatch')return {result:Object.assign(prefs,msg.patch)};return {result:{ok:true}};
 }},storage:{sync:{get:async()=>({settings:prefs})},onChanged:{addListener:fn=>window.changeSettings=fn}}};
 window.UoocCatalog={context:()=>({resource:'video-1',chapter:'第一节'}),available:()=>false,name:()=> '测试适配'};
 const v=document.querySelector('video');window.running=false;window.videoTime=0;window.ready=4;Object.defineProperties(v,{paused:{get:()=>!window.running},readyState:{get:()=>window.ready},currentTime:{get:()=>window.videoTime},ended:{get:()=>false}});v.play=async()=>{window.running=true;window.plays=(window.plays||0)+1;};v.pause=()=>window.running=false;
 window.nextClicks=0;document.querySelector('.next').onclick=()=>window.nextClicks++;
 },settings);
 await page.addScriptTag({content:fs.readFileSync('platforms.js','utf8')});await page.addScriptTag({content:fs.readFileSync('content.js','utf8')});await page.waitForTimeout(30);return page;
}
const click=(p,id)=>p.evaluate(id=>window.panel.getElementById(id).click(),id);
const state=p=>p.evaluate(()=>window.panel.getElementById('state').textContent);
test('学习记录使用页面课程标题，忽略网站通用标题与题目标题',async()=>{
 const p=await setup({},'<header><h3>思想道德与法治</h3></header><fieldset><h2>第一题</h2></fieldset>');
 try{
  await p.evaluate(()=>document.title='优课在线-专注在线教育 专注高等教育');
  await click(p,'play');await p.waitForFunction(()=>window.running);
  await click(p,'stop');
  const reports=await p.evaluate(()=>messages.filter(m=>m.type==='activityReport'&&m.position));
  assert.ok(reports.length>0);
  assert.equal(reports.at(-1).position.title,'思想道德与法治');
  assert.equal(reports.at(-1).position.chapter,'第一节');
 }finally{await p.close();}
});
test('课程悬浮摘要丢弃账号变化前的迟到成绩',async()=>{
 const p=await setup();
 try{
  await p.evaluate(()=>{
   const original=chrome.runtime.sendMessage;
   let calls=0;
   chrome.runtime.sendMessage=message=>{
    if(message.type!=='gradeSummary')return original(message);
    if(++calls===1)return Promise.resolve({result:{verified:true,course:{snapshot:{progress:{value:42}}}}});
    if(calls===2)return new Promise(resolve=>window.resolveOldGrade=resolve);
    return Promise.resolve({result:{verified:false,course:null}});
   };
  });
  await click(p,'orb');
  const summary=()=>p.evaluate(()=>window.panel.getElementById('gradeSummary').textContent);
  assert.match(await summary(),/42%/);
  await click(p,'minimize');await click(p,'orb');
  await p.evaluate(async()=>{
   changeSettings({gradeAccount:{oldValue:{hash:'old'}}},'session');
   resolveOldGrade({result:{verified:true,course:{snapshot:{progress:{value:99}}}}});
   await new Promise(resolve=>setTimeout(resolve,0));
  });
  assert.match(await summary(),/确认账号/);
 }finally{await p.close();}
});
async function tick(page,seconds=1,progress=2){await page.evaluate(({seconds,progress})=>{window.clockOffset+=seconds*1000;window.videoTime+=progress;window.intervals[1000]();},{seconds,progress});}
test('drag persists position without opening and expanded panel stays visible after resize',async()=>{
 const p=await setup();try{
 const r=await p.evaluate(()=>{const r=window.panel.getElementById('orb').getBoundingClientRect();return {x:r.x+27,y:r.y+27};});await p.mouse.move(r.x,r.y);await p.mouse.down();await p.mouse.move(60,60,{steps:8});await p.mouse.up();
 assert.equal(await p.evaluate(()=>window.panel.getElementById('panel').hidden),true);assert.ok((await p.evaluate(()=>window.messages)).some(m=>m.type==='orbSave'));
 await p.waitForTimeout(360);await p.mouse.click(60,60);await p.setViewportSize({width:390,height:480});await p.waitForTimeout(70);
 const rect=await p.evaluate(()=>{const r=window.panel.getElementById('panel').getBoundingClientRect();return {left:r.left,right:r.right,top:r.top,bottom:r.bottom};});assert.ok(rect.left>=0&&rect.top>=0&&rect.right<=390&&rect.bottom<=480,JSON.stringify(rect));
 await p.evaluate(()=>window.listeners.forEach(fn=>fn({type:'orbReset'})));const reset=await p.locator('#uooc-learning-helper').boundingBox();assert.ok(reset.x>300);
 }finally{await p.close();}
});
test('rate changes apply to current and later video, with live cross-page settings',async()=>{
 const p=await setup({rate:1.25});try{await click(p,'play');await p.waitForFunction(()=>window.running);assert.equal(await p.locator('video').evaluate(v=>v.playbackRate),1.25);
 await p.evaluate(()=>{const select=window.panel.getElementById('rate');select.value='1.75';select.dispatchEvent(new Event('change'));});assert.equal(await p.locator('video').evaluate(v=>v.playbackRate),1.75);
 await p.evaluate(()=>window.changeSettings({settings:{newValue:{rate:1.5}}},'sync'));await p.evaluate(()=>document.querySelector('video').dispatchEvent(new Event('loadedmetadata')));assert.equal(await p.locator('video').evaluate(v=>v.playbackRate),1.5);
 }finally{await p.close();}
});
test('deadline stops before navigation and fresh start uses a new countdown',async()=>{
 const p=await setup({timerMinutes:1});try{await click(p,'play');await p.waitForFunction(()=>window.running);await p.evaluate(()=>{window.clockOffset+=60001;document.querySelector('video').dispatchEvent(new Event('ended'));});assert.match(await state(p),/定时已到/);assert.equal(await p.evaluate(()=>window.running),false);assert.equal(await p.evaluate(()=>window.nextClicks),0);assert.ok((await p.evaluate(()=>window.messages)).some(m=>m.type==='cancelRequests'));
 await click(p,'play');await p.waitForFunction(()=>window.running);const starts=(await p.evaluate(()=>window.messages)).filter(m=>m.type==='timerStart');assert.equal(starts.length,2);assert.notEqual(starts[0].run,starts[1].run);assert.match(await p.evaluate(()=>window.panel.getElementById('countdown').textContent),/1 分钟/);
 }finally{await p.close();}
});
test('timer during pending answer prevents filling or saving',async()=>{
 const extra='<fieldset><legend>题目</legend><label><input type="radio" name="q">甲</label><label><input type="radio" name="q">乙</label></fieldset><button id="save">保存答案</button>';
 const p=await setup({timerMinutes:1},extra);try{await p.evaluate(()=>{window.holdAnswer=true;window.saves=0;document.querySelector('#save').onclick=()=>window.saves++;});await click(p,'play');await p.waitForFunction(()=>!!window.finishAnswer);await p.evaluate(()=>{window.clockOffset+=60001;window.intervals[1000]();window.finishAnswer({result:{answers:[1],explanation:'late'}});});await p.waitForTimeout(50);assert.equal(await p.locator('input:checked').count(),0);assert.equal(await p.evaluate(()=>window.saves),0);assert.match(await state(p),/定时已到/);
 }finally{await p.close();}
});
test('buffering, pauses and no progress are excluded; duplicate ends do not double count',async()=>{
 const p=await setup();try{await click(p,'play');await p.waitForFunction(()=>window.running);await tick(p);await tick(p);await tick(p);await p.evaluate(()=>window.ready=1);await tick(p,1,0);await tick(p,1,0);await p.evaluate(()=>window.ready=4);await tick(p,1,0);await tick(p);await tick(p);await click(p,'stop');
 const reports=(await p.evaluate(()=>window.messages)).filter(m=>m.type==='activityReport');const total=reports.flatMap(m=>m.segments).reduce((n,[a,b])=>n+b-a,0);assert.ok(total>=3000&&total<5500,'counted '+total);
 await click(p,'play');await p.waitForFunction(()=>window.running);await p.evaluate(()=>{const v=document.querySelector('video');v.dispatchEvent(new Event('ended'));v.dispatchEvent(new Event('ended'));});await p.waitForTimeout(20);const completed=(await p.evaluate(()=>window.messages)).filter(m=>m.type==='activityReport'&&m.ended);assert.equal(completed.length,1);
 }finally{await p.close();}
});
test('diagnostic contains counts and fixed stop code without question text',async()=>{
 const p=await setup({},'<fieldset><legend>private question text</legend><label><input type="radio" name="q">甲</label><label><input type="radio" name="q">乙</label></fieldset><button>保存答案</button>');try{await click(p,'inspect');const text=await p.evaluate(()=>window.panel.getElementById('diagnosticText').textContent);assert.ok(!text.includes('private'));const data=JSON.parse(text);assert.equal(data.questions.single,1);assert.equal(data.version,JSON.parse(fs.readFileSync('manifest.json','utf8')).version);}finally{await p.close();}
});
test('deadline while waiting for save confirmation never advances',async()=>{
 const extra='<fieldset><legend>题目</legend><label><input type="radio" name="q">甲</label><label><input type="radio" name="q">乙</label></fieldset><button id="save">保存答案</button>';
 const p=await setup({timerMinutes:1,delay:.001},extra);try{await p.evaluate(()=>{window.saves=0;document.querySelector('#save').onclick=()=>window.saves++;});await click(p,'play');await p.waitForFunction(()=>window.saves===1);await p.evaluate(()=>{window.clockOffset+=60001;window.intervals[1000]();document.body.insertAdjacentHTML('beforeend','<p>保存成功</p>');});await p.waitForTimeout(300);assert.equal(await p.evaluate(()=>window.nextClicks),0);assert.match(await state(p),/定时已到/);}finally{await p.close();}
});
test('deadline during catalog transition cancels its deferred resource click',async()=>{
 const p=await setup({timerMinutes:1,delay:.001});try{await p.evaluate(()=>{UoocCatalog.available=()=>true;UoocCatalog.advance=cancel=>new Promise(resolve=>window.finishNavigation=()=>{if(!cancel())window.nextClicks++;resolve();});});await click(p,'play');await p.waitForFunction(()=>window.running);await p.evaluate(()=>document.querySelector('video').dispatchEvent(new Event('ended')));await p.waitForFunction(()=>!!window.finishNavigation);await p.evaluate(()=>{window.clockOffset+=60001;window.intervals[1000]();window.finishNavigation();});await p.waitForTimeout(50);assert.equal(await p.evaluate(()=>window.nextClicks),0);assert.equal(await p.evaluate(()=>window.running),false);}finally{await p.close();}
});
test('abnormal error sounds once and manual pause stays silent',async()=>{
 const p=await setup({sound:true});try{
 await p.evaluate(()=>{window.beeps=0;window.AudioContext=class{constructor(){this.state='running';this.currentTime=0;this.destination={};}resume(){return Promise.resolve();}createOscillator(){return {frequency:{value:0},connect(){},start(){window.beeps++;},stop(){}};}createGain(){return {gain:{setValueAtTime(){},exponentialRampToValueAtTime(){}},connect(){}};}};});
 await click(p,'play');await p.waitForFunction(()=>window.running);await click(p,'stop');assert.equal(await p.evaluate(()=>window.beeps),0);
 await click(p,'play');await p.waitForFunction(()=>window.running);await p.evaluate(()=>{const v=document.querySelector('video');v.dispatchEvent(new Event('error'));v.dispatchEvent(new Event('error'));});assert.equal(await p.evaluate(()=>window.beeps),1);
 }finally{await p.close();}
});
test('touch dragging moves orb and does not trigger click',async()=>{
 const p=await setup();try{const cdp=await p.context().newCDPSession(p);await cdp.send('Emulation.setTouchEmulationEnabled',{enabled:true,maxTouchPoints:1});const box=await p.locator('#uooc-learning-helper').boundingBox();await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:box.x+27,y:box.y+27}]});await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:160,y:180}]});await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await p.waitForFunction(()=>window.messages.some(m=>m.type==='orbSave'));assert.equal(await p.evaluate(()=>window.panel.getElementById('panel').hidden),true);const moved=await p.locator('#uooc-learning-helper').boundingBox();assert.ok(moved.x<200&&moved.y<200);}finally{await p.close();}
});

test('紧凑面板默认折叠更多并支持键盘收起',async()=>{const p=await setup();try{await click(p,'orb');assert.equal(await p.evaluate(()=>panel.getElementById('moreTools').open),false);assert.equal(await p.evaluate(()=>panel.getElementById('taskProgress').hidden),true);await p.setViewportSize({width:390,height:844});await p.screenshot({path:'.test-artifacts/panel-refined.png'});await p.keyboard.press('Escape');assert.equal(await p.evaluate(()=>panel.getElementById('panel').hidden),true);}finally{await p.close();}});

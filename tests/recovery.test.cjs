const {test,before,after}=require('node:test');
const assert=require('node:assert/strict'),fs=require('node:fs');
const {chromium}=require('playwright');let browser;
before(async()=>{browser=await chromium.launch({channel:'msedge',headless:true});fs.mkdirSync('.test-artifacts',{recursive:true});});after(async()=>browser?.close());
const source=fs.readFileSync('content.js','utf8');
function radio(n=3){return Array.from({length:n},(_,i)=>'<fieldset><legend>演示题'+(i+1)+'</legend><label><input type="radio" name="q'+i+'">甲</label><label><input type="radio" name="q'+i+'">乙</label></fieldset>').join('');}
async function setup(html=radio()){
 const page=await browser.newPage({viewport:{width:1000,height:800}});await page.setContent(html);
 await page.evaluate(()=>{
  const attach=Element.prototype.attachShadow;Element.prototype.attachShadow=function(o){window.panel=attach.call(this,o);return panel;};
  window.clockOffset=0;const now=Date.now.bind(Date);Date.now=()=>now()+clockOffset;
  const timer=setTimeout;window.setTimeout=(f,ms)=>timer(f,ms===350?1:ms);
  window.ticks={};window.setInterval=(f,ms)=>{ticks[ms]=f;return ms;};
  window.calls=[];window.defaultResult=q=>q.type==='blank'?{answers:Array(q.blankCount).fill('演示'),explanation:'模拟'}:{answers:q.type==='multiple'?[0,2]:[1],explanation:'模拟'};
  window.chrome={runtime:{sendMessage:async m=>{if(m.type!=='solve')return {};calls.push({text:m.question.text,guess:!!m.allowGuess});return window.respond?respond(m,calls.length):{result:defaultResult(m.question)};}},storage:{sync:{get:async()=>({settings:{delay:.001,rate:2,sound:false}})},onChanged:{addListener:()=>{}}}};
 });await page.addScriptTag({content:source});return page;
}
const click=(p,id)=>p.evaluate(id=>window.panel.getElementById(id).click(),id);
const text=p=>p.evaluate(()=>window.panel.getElementById('state').textContent);
const until=(p,s)=>p.waitForFunction(s=>window.panel.getElementById('state').textContent.includes(s),s,{timeout:15000});
const count=p=>p.evaluate(()=>calls.length);
const jump=(p,n)=>p.evaluate(n=>clockOffset+=n,n);
async function mockVideo(p,mode){await p.evaluate(mode=>{
 const v=document.querySelector('video');window.running=false;window.plays=0;window.pauses=0;
 Object.defineProperties(v,{paused:{get:()=>!running},ended:{get:()=>false},readyState:{get:()=>4},currentTime:{get:()=>0}});
 v.pause=()=>{running=false;pauses++;};v.play=()=>{plays++;if(mode==='never')return new Promise(resolve=>window.releasePlay=()=>{running=true;resolve();});if(mode==='denied')return Promise.reject(new DOMException('blocked','NotAllowedError'));if(mode==='abort'&&plays===1)return Promise.reject(new DOMException('interrupted','AbortError'));running=true;return Promise.resolve();};
},mode);}

test('50 mixed questions: uncertain twentieth is retried and continues through the last question',async()=>{
 const html=Array.from({length:50},(_,i)=>i%5===4?'<fieldset><legend>填空题'+i+'</legend><label>第1空<input type="text"></label><label>第2空<input type="text"></label></fieldset>':i%5===3?'<fieldset><legend>多选题'+i+'</legend>'+['甲','乙','丙'].map(x=>'<label><input type="checkbox" name="m'+i+'">'+x+'</label>').join('')+'</fieldset>':radio(1).replaceAll('演示题1','单选题'+i).replaceAll('name="q0"','name="r'+i+'"')).join('');
 const p=await setup(html);try{
 await p.evaluate(()=>{respond=(m,n)=>n===20?{error:'不确定',code:'ANSWER_UNCERTAIN'}:{result:{...defaultResult(m.question),...(m.allowGuess?{uncertain:true}:{})}};});
 await click(p,'solve');await until(p,'填写完成');assert.equal(await count(p),51);assert.equal(await p.evaluate(()=>calls[20].guess),true);
 assert.match(await p.evaluate(()=>panel.getElementById('taskProgress').textContent),/50\/50/);assert.match(await p.evaluate(()=>panel.getElementById('log').textContent),/推测答案/);assert.equal(await p.locator('fieldset').last().locator('input').first().inputValue(),'演示');
 }finally{await p.close();}
});
test('network retry and guess share a budget: at most three calls per question',async()=>{
 const p=await setup(radio(1));try{await p.evaluate(()=>{respond=(m,n)=>n===1?{error:'网络',code:'NETWORK'}:n===2?{error:'不确定',code:'ANSWER_UNCERTAIN'}:{error:'服务器故障',code:'SERVER'};});await click(p,'solve');await until(p,'请求可能再次计费');await jump(p,3100);await until(p,'服务器故障');assert.equal(await count(p),3);assert.equal(await p.locator('input:checked').count(),0);assert.equal(await p.evaluate(()=>panel.getElementById('solve').textContent),'继续答题');}finally{await p.close();}
});
for(const code of ['TIMEOUT','SERVER'])test(code+' retries once',async()=>{
 const p=await setup(radio(1));try{await p.evaluate(code=>{respond=(m,n)=>n===1?{error:'暂时失败',code}:{result:defaultResult(m.question)};},code);await click(p,'solve');await until(p,'请求可能再次计费');await jump(p,3100);await until(p,'填写完成');assert.equal(await count(p),2);}finally{await p.close();}
});
for(const code of ['AUTH','BALANCE','MODEL_UNAVAILABLE'])test(code+' never retries automatically',async()=>{
 const p=await setup(radio(1));try{await p.evaluate(code=>{respond=()=>({error:'需要处理',code});},code);await click(p,'solve');await until(p,'需要处理');assert.equal(await count(p),1);}finally{await p.close();}
});
for(const ms of [1000,61000])test('rate limit wait '+ms,async()=>{
 const p=await setup(radio(1));try{await p.evaluate(ms=>{respond=(m,n)=>n===1?{error:'限流',code:'RATE_LIMIT',retryAfterMs:ms}:{result:defaultResult(m.question)};},ms);await click(p,'solve');if(ms>60000){await until(p,'超过60秒');assert.equal(await count(p),1);}else{await until(p,'请求可能再次计费');assert.equal(await count(p),1);await jump(p,ms+100);await until(p,'填写完成');assert.equal(await count(p),2);}}finally{await p.close();}
});
test('resume reuses verified answers without a duplicate model call',async()=>{
 const p=await setup();try{await p.evaluate(()=>{respond=(m,n)=>n===2?{error:'余额不足',code:'BALANCE'}:{result:defaultResult(m.question)};});await click(p,'solve');await until(p,'余额不足');assert.equal(await p.locator('input:checked').count(),1);await click(p,'solve');await until(p,'填写完成');assert.equal(await count(p),4);assert.equal(await p.evaluate(()=>calls.filter(x=>x.text==='演示题1').length),1);}finally{await p.close();}
});
test('manual edits require confirmation and are never overwritten',async()=>{
 const p=await setup(radio(2));try{await p.evaluate(()=>{respond=(m,n)=>n===2?{error:'余额不足',code:'BALANCE'}:{result:defaultResult(m.question)};});await click(p,'solve');await until(p,'余额不足');await p.locator('input[name=q0]').first().check();await click(p,'solve');await until(p,'请确认采用页面答案');assert.equal(await count(p),2);assert.equal(await p.locator('input[name=q0]').first().isChecked(),true);await click(p,'acceptPageAnswers');await until(p,'填写完成');assert.equal(await count(p),3);assert.equal(await p.locator('input[name=q0]').first().isChecked(),true);}finally{await p.close();}
});
test('changed question invalidates the checkpoint',async()=>{
 const p=await setup(radio(2));try{await p.evaluate(()=>{respond=(m,n)=>n===2?{error:'余额不足',code:'BALANCE'}:{result:defaultResult(m.question)};});await click(p,'solve');await until(p,'余额不足');await p.locator('legend').first().evaluate(e=>e.textContent='替换后的题目');await click(p,'solve');await until(p,'填写完成');assert.equal(await count(p),4);assert.equal(await p.evaluate(()=>calls[2].text),'替换后的题目');}finally{await p.close();}
});
test('pending old answer cannot fill or release a newer task after pause and resume',async()=>{
 const p=await setup(radio(1));try{await p.evaluate(()=>{respond=(m,n)=>n===1?new Promise(resolve=>window.releaseAnswer=()=>resolve({result:{answers:[0],explanation:'旧'}})):{result:defaultResult(m.question)};});await click(p,'solve');await p.waitForFunction(()=>!!window.releaseAnswer);await click(p,'stop');await click(p,'solve');await until(p,'填写完成');await p.evaluate(()=>releaseAnswer());await p.waitForTimeout(150);assert.equal(await p.locator('input').nth(1).isChecked(),true);assert.equal(await p.locator('input').first().isChecked(),false);assert.match(await text(p),/填写完成/);}finally{await p.close();}
});
test('pause during retry prevents another request',async()=>{
 const p=await setup(radio(1));try{await p.evaluate(()=>{respond=()=>({error:'暂时失败',code:'NETWORK'});});await click(p,'solve');await until(p,'请求可能再次计费');await click(p,'stop');await jump(p,4000);await p.waitForTimeout(250);assert.equal(await count(p),1);assert.equal(await p.locator('input:checked').count(),0);assert.match(await text(p),/已暂停/);}finally{await p.close();}
});
test('route change during request stops instead of filling',async()=>{
 const p=await setup(radio(1));try{await p.evaluate(()=>{respond=()=>new Promise(resolve=>window.releaseAnswer=()=>resolve({result:defaultResult({type:'single'})}));});await click(p,'solve');await p.waitForFunction(()=>!!window.releaseAnswer);await p.evaluate(()=>{location.hash='changed';releaseAnswer();});await until(p,'页面已变化');assert.equal(await p.locator('input:checked').count(),0);}finally{await p.close();}
});
test('player promise has a 20 second timeout and re-enables continue',async()=>{
 const p=await setup('<video style="width:400px;height:200px"></video>');try{await mockVideo(p,'never');await click(p,'play');await p.waitForFunction(()=>plays===1);await jump(p,21000);await until(p,'启动超过20秒');assert.equal(await p.evaluate(()=>panel.getElementById('play').disabled),false);assert.equal(await p.evaluate(()=>panel.getElementById('play').textContent.startsWith('继续连播')),true);}finally{await p.close();}
});
test('interrupted player retries once, autoplay denial never loops',async()=>{
 for(const mode of ['abort','denied']){const p=await setup('<video style="width:400px;height:200px"></video>');try{await mockVideo(p,mode);await click(p,'play');await until(p,mode==='abort'?'正在连续播放':'浏览器阻止');assert.equal(await p.evaluate(()=>plays),mode==='abort'?2:1);}finally{await p.close();}}
});
test('late player result cannot pause a newer playback owner',async()=>{
 const p=await setup('<video style="width:400px;height:200px"></video>');try{await mockVideo(p,'never');await click(p,'play');await p.waitForFunction(()=>plays===1);await click(p,'stop');await p.evaluate(()=>{document.querySelector('video').play=async()=>{plays++;running=true;};});await click(p,'play');await until(p,'正在连续播放');const pauses=await p.evaluate(()=>window.pauses);await p.evaluate(()=>releasePlay());await p.waitForTimeout(200);assert.equal(await p.evaluate(()=>window.pauses),pauses);assert.equal(await p.evaluate(()=>running),true);}finally{await p.close();}
});
test('narrow review stays in bounds and diagnostics omit question and answer text',async()=>{
 const p=await setup(radio(1));try{await click(p,'orb');await click(p,'solve');await until(p,'填写完成');await p.locator('input').first().check();await click(p,'solve');await until(p,'请确认采用页面答案');await p.setViewportSize({width:390,height:844});await click(p,'inspect');const info=await p.evaluate(()=>panel.getElementById('diagnosticText').textContent);assert.ok(!info.includes('演示题'));assert.ok(!info.includes('模拟'));const rect=await p.evaluate(()=>{const b=panel.getElementById('panel').getBoundingClientRect();return {left:b.left,right:b.right,top:b.top,bottom:b.bottom};});assert.ok(rect.left>=0&&rect.right<=390&&rect.top>=0&&rect.bottom<=844);await p.screenshot({path:'.test-artifacts/recovery-mobile.png'});await click(p,'stop');}finally{await p.close();}
});
test('network failure during guess retries the guess without exceeding three calls',async()=>{
 const p=await setup(radio(1));try{await p.evaluate(()=>{respond=(m,n)=>n===1?{error:'不确定',code:'ANSWER_UNCERTAIN'}:n===2?{error:'网络',code:'NETWORK'}:{result:{answers:[0],explanation:'模拟推测',uncertain:true}};});await click(p,'solve');await until(p,'请求可能再次计费');await jump(p,3100);await until(p,'填写完成');assert.equal(await count(p),3);assert.deepEqual(await p.evaluate(()=>calls.map(x=>x.guess)),[false,true,true]);assert.equal(await p.locator('input').first().isChecked(),true);}finally{await p.close();}
});
test('failed guess stays on current question rather than skipping',async()=>{
 const p=await setup(radio(2));try{await p.evaluate(()=>{respond=()=>({error:'仍不确定',code:'ANSWER_UNCERTAIN'});});await click(p,'solve');await until(p,'仍不确定');assert.equal(await count(p),2);assert.equal(await p.locator('input:checked').count(),0);assert.equal(await p.evaluate(()=>calls.every(x=>x.text==='演示题1')),true);}finally{await p.close();}
});
test('edits made during pending request are preserved and require confirmation',async()=>{
 const p=await setup(radio(1));try{await p.evaluate(()=>{respond=()=>new Promise(resolve=>window.releaseAnswer=()=>resolve({result:defaultResult({type:'single'})}));});await click(p,'solve');await p.waitForFunction(()=>!!window.releaseAnswer);await p.locator('input').first().check();await p.evaluate(()=>releaseAnswer());await until(p,'模型请求期间页面答案已修改');assert.equal(await p.locator('input').first().isChecked(),true);await click(p,'solve');await until(p,'请确认采用页面答案');await click(p,'acceptPageAnswers');await until(p,'填写完成');assert.equal(await count(p),1);assert.equal(await p.locator('input').first().isChecked(),true);}finally{await p.close();}
});
test('timer expiry during retry prevents another request and fill',async()=>{
 const p=await setup(radio(1));try{await p.evaluate(async()=>{await chrome.storage.sync.get();const original=chrome.storage.sync.get;});await p.evaluate(()=>{respond=()=>({error:'网络',code:'NETWORK'});panel.getElementById('timer').value='15';panel.getElementById('timer').dispatchEvent(new Event('change'));});await click(p,'play');await until(p,'请求可能再次计费');await jump(p,900001);await p.waitForTimeout(300);assert.equal(await count(p),1);assert.equal(await p.locator('input:checked').count(),0);assert.match(await text(p),/定时已到/);}finally{await p.close();}
});
test('cancel review preserves edited answers without a model call',async()=>{
 const p=await setup(radio(1));try{await click(p,'solve');await until(p,'填写完成');await p.locator('input').first().check();await click(p,'solve');await until(p,'请确认采用页面答案');await click(p,'cancelPageReview');await until(p,'未确认采用');assert.equal(await count(p),1);assert.equal(await p.locator('input').first().isChecked(),true);}finally{await p.close();}
});
test('desktop and narrow retry presentation is compact and screenshot data is simulated',async()=>{
 const p=await setup('<h1 style="font:24px system-ui;color:#173b38">优课课程习题 · 界面演示</h1>'+radio(3));try{
 await p.evaluate(()=>{respond=(m,n)=>n===2?{error:'限流',code:'RATE_LIMIT',retryAfterMs:60000}:{result:defaultResult(m.question)};});
 await click(p,'orb');await click(p,'solve');await until(p,'请求可能再次计费');
 assert.match(await p.evaluate(()=>panel.getElementById('taskProgress').textContent),/已填写 1\/3/);
 await p.screenshot({path:'.test-artifacts/retry-desktop.png'});await p.setViewportSize({width:390,height:844});await p.screenshot({path:'.test-artifacts/retry-mobile.png'});
 await click(p,'stop');assert.match(await text(p),/已暂停/);
 }finally{await p.close();}
});
test('a changed question during retry never sends the old question again',async()=>{
 const p=await setup(radio(1));try{await p.evaluate(()=>{respond=()=>({error:'网络',code:'NETWORK'});});await click(p,'solve');await until(p,'请求可能再次计费');await p.locator('legend').evaluate(e=>e.textContent='新题目');await jump(p,3100);await until(p,'题目页面已变化');assert.equal(await count(p),1);assert.equal(await p.locator('input:checked').count(),0);}finally{await p.close();}
});
test('a replaced player is not reported as started by an old promise',async()=>{
 const p=await setup('<video style="width:400px;height:200px"></video>');try{await mockVideo(p,'never');await click(p,'play');await p.waitForFunction(()=>plays===1);await p.evaluate(()=>{document.querySelector('video').remove();document.body.append(document.createElement('video'));releasePlay();});await until(p,'播放器已被页面替换');assert.equal(await p.evaluate(()=>panel.getElementById('play').disabled),false);}finally{await p.close();}
});
test('guess origin remains visible even when the model claims confidence',async()=>{
 const p=await setup(radio(1));try{await p.evaluate(()=>{respond=(m,n)=>n===1?{error:'不确定',code:'ANSWER_UNCERTAIN'}:{result:{answers:[1],explanation:'模拟',uncertain:false,guessed:true}};});await click(p,'solve');await until(p,'填写完成');assert.match(await p.evaluate(()=>panel.getElementById('log').textContent),/推测答案/);assert.match(await p.evaluate(()=>panel.getElementById('taskProgress').textContent),/推测 1/);}finally{await p.close();}
});
test('detached old player error and ended events cannot stop or advance a new run',async()=>{
 const p=await setup('<video style="width:400px;height:200px"></video>');try{await mockVideo(p,'normal');await click(p,'play');await until(p,'正在连续播放');await click(p,'stop');await p.evaluate(()=>{window.oldVideo=document.querySelector('video');oldVideo.remove();const v=document.createElement('video');v.style='width:400px;height:200px';document.body.append(v);});await mockVideo(p,'normal');await click(p,'play');await until(p,'正在连续播放');await p.evaluate(()=>{oldVideo.dispatchEvent(new Event('error'));oldVideo.dispatchEvent(new Event('ended'));});await p.waitForTimeout(150);assert.equal(await p.evaluate(()=>running),true);assert.match(await text(p),/正在连续播放/);}finally{await p.close();}
});

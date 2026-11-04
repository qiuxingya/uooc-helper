const {test,before,after}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {chromium}=require('playwright');
let browser;
before(async()=>{fs.mkdirSync(path.join(__dirname,'../.test-artifacts'),{recursive:true});browser=await chromium.launch({headless:true,channel:'msedge'});});
after(async()=>{await browser?.close();});
const source=fs.readFileSync(path.join(__dirname,'../content.js'),'utf8');
const adapter=fs.readFileSync(path.join(__dirname,'../uooc-adapter.js'),'utf8');
const fixture=`<fieldset><legend>1+1等于几？</legend><label><input type="radio" name="q1">1</label><label><input type="radio" name="q1">2</label></fieldset><button id="submit">提交</button>`;
async function setup(html=fixture,settings={}){
 const page=await browser.newPage();await page.setContent(html);
 await page.evaluate(settings=>{
  // Expose the closed shadow root only inside this isolated test fixture.
  const original=Element.prototype.attachShadow;
  Element.prototype.attachShadow=function(options){const root=original.call(this,options);window.panel=root;return root;};
  window.ticks=[];window.setInterval=(callback,ms)=>{if(ms===1500)window.ticks.push(callback);return 1;};
  window.chrome={storage:{sync:{get:async()=>({settings:{delay:0.001,...settings}})}},runtime:{sendMessage:async()=>({result:{answers:[1],explanation:'二',uncertain:false}})}};
  window.submits=0;document.querySelector('#submit')?.addEventListener('click',()=>window.submits++);
 },settings);
 await page.addScriptTag({content:source});return page;
}
async function click(page,id){await page.evaluate(id=>window.panel.getElementById(id).click(),id);}
async function state(page){return page.evaluate(()=>window.panel.getElementById('state').textContent);}
test('recognizes question and fills selected radio without submitting',async()=>{
 const page=await setup();try{await click(page,'inspect');assert.match(await state(page),/1 道/);await click(page,'solve');await page.waitForFunction(()=>window.panel.getElementById('state').textContent.includes('填写完成'));
 assert.equal(await page.locator('input').nth(1).isChecked(),true);assert.equal(await page.evaluate(()=>window.submits),0);
 }finally{await page.close();}
});
test('pause while API pending discards returned answer',async()=>{
 const page=await setup();try{await page.evaluate(()=>chrome.runtime.sendMessage=()=>new Promise(resolve=>window.finish=resolve));await click(page,'solve');await page.waitForFunction(()=>typeof window.finish==='function');await click(page,'stop');await page.evaluate(()=>window.finish({result:{answers:[1],explanation:'test'}}));await page.waitForTimeout(100);assert.equal(await page.locator('input:checked').count(),0);assert.match(await state(page),/已暂停/);}finally{await page.close();}
});
test('changed question while API pending is not filled',async()=>{
 const page=await setup();try{await page.evaluate(()=>chrome.runtime.sendMessage=()=>new Promise(resolve=>window.finish=resolve));await click(page,'solve');await page.waitForFunction(()=>typeof window.finish==='function');await page.locator('legend').evaluate(e=>e.textContent='另一个问题');await page.evaluate(()=>window.finish({result:{answers:[1],explanation:'test'}}));await page.waitForFunction(()=>window.panel.getElementById('state').textContent.includes('页面已变化'));assert.equal(await page.locator('input:checked').count(),0);}finally{await page.close();}
});
test('final exam does not call model or fill',async()=>{
 const page=await setup('<h1>期末考试</h1>'+fixture);try{await page.evaluate(()=>chrome.runtime.sendMessage=()=>{throw Error('must not call');});await click(page,'solve');assert.match(await state(page),/人工操作/);assert.equal(await page.locator('input:checked').count(),0);}finally{await page.close();}
});
async function video(page){await page.evaluate(()=>{const v=document.querySelector('video');Object.defineProperty(v,'paused',{get:()=>!window.isPlaying});v.play=async()=>{window.isPlaying=true;};v.pause=()=>{window.isPlaying=false;};window.nextClicks=0;document.querySelectorAll('button.next').forEach(b=>b.onclick=()=>window.nextClicks++);});}
test('ended video clicks unique next button once',async()=>{
 const page=await setup('<video style="width:200px;height:120px"></video><button class="next">下一节</button>');try{await video(page);await click(page,'play');await page.evaluate(()=>document.querySelector('video').dispatchEvent(new Event('ended')));await page.waitForFunction(()=>window.nextClicks===1);assert.equal(await page.evaluate(()=>window.nextClicks),1);}finally{await page.close();}
});
test('ambiguous next buttons stop instead of navigating',async()=>{
 const page=await setup('<video style="width:200px;height:120px"></video><button class="next">下一节</button><button class="next">下一节</button>');try{await video(page);await click(page,'play');await page.evaluate(()=>document.querySelector('video').dispatchEvent(new Event('ended')));await page.waitForFunction(()=>window.panel.getElementById('state').textContent.includes('不唯一'));assert.equal(await page.evaluate(()=>window.nextClicks),0);assert.equal(await page.evaluate(()=>window.isPlaying),false);}finally{await page.close();}
});
test('same-origin iframe questions are recognized and filled',async()=>{
 const page=await setup('<iframe></iframe>');try{await page.frames()[1].setContent(fixture);await click(page,'inspect');assert.match(await state(page),/1 道/);await click(page,'solve');await page.waitForFunction(()=>window.panel.getElementById('state').textContent.includes('填写完成'));assert.equal(await page.frames()[1].locator('input').nth(1).isChecked(),true);}finally{await page.close();}
});
test('replaced option controls invalidate pending answer',async()=>{
 const page=await setup();try{await page.evaluate(()=>chrome.runtime.sendMessage=()=>new Promise(resolve=>window.finish=resolve));await click(page,'solve');await page.waitForFunction(()=>typeof window.finish==='function');await page.locator('fieldset').evaluate(e=>e.innerHTML=e.innerHTML);await page.evaluate(()=>window.finish({result:{answers:[1],explanation:'test'}}));await page.waitForFunction(()=>window.panel.getElementById('state').textContent.includes('页面已变化'));assert.equal(await page.locator('input:checked').count(),0);}finally{await page.close();}
});
test('catalog skips completed sections and opens next video',async()=>{
 const page=await setup(`<ul class="rank-1"><li class="catalogItem"><div class="basic">章</div><ul class="rank-2"><li id="one"><div class="basic active">第一节</div><div class="resourcelist"><div class="basic active"><i class="icon-video"></i>视频</div></div></li><li id="done"><div class="basic complete">已完成</div></li><li id="three"><div class="basic">第三节</div></li></ul></li></ul>`);
 try{await page.addScriptTag({content:adapter});await page.evaluate(()=>{window.opened=[];document.querySelector('#three > .basic').onclick=()=>{window.opened.push('three');document.querySelector('#one > .basic').classList.remove('active');document.querySelector('#one .resourcelist').remove();document.querySelector('#three').insertAdjacentHTML('beforeend','<div class="resourcelist"><div class="basic"><i class="icon-video"></i>视频</div></div>');document.querySelector('#three .resourcelist .basic').onclick=()=>window.opened.push('video');};});assert.equal(await page.evaluate(()=>UoocCatalog.advance(()=>false,1)),true);assert.deepEqual(await page.evaluate(()=>window.opened),['three','video']);}finally{await page.close();}
});
test('catalog stops before chapter quiz',async()=>{
 const page=await setup('<ul class="rank-1"><li class="catalogItem"><div class="basic">章</div><ul class="rank-2"><li><div class="basic active">一</div></li><li><div class="basic">单元测验1</div></li></ul></li></ul>');try{await page.addScriptTag({content:adapter});const result=await page.evaluate(async()=>{try{await UoocCatalog.advance(()=>false,1);}catch(e){return e.message;}});assert.match(result,/测验/);}finally{await page.close();}
});
test('UOOC shuffled internal values use display positions, not value letters',async()=>{
 const page=await setup(`<div class="smallTest-view"><div class="ti"><div class="ti-q"><div class="ti-q-c">测试题干</div></div><div class="ti-alist"><label class="ti-a"><span><input type="radio" name="q" value="D">A.</span><div>选项甲</div></label><label class="ti-a"><span><input type="radio" name="q" value="A">B.</span><div>选项乙</div></label></div></div></div>`);
 try{await page.evaluate(()=>chrome.runtime.sendMessage=async msg=>{window.payload=msg.question;return {result:{answers:[1],explanation:'示例'}};});await click(page,'solve');await page.waitForFunction(()=>window.panel.getElementById('state').textContent.includes('填写完成'));assert.equal((await page.evaluate(()=>window.payload)).text,'测试题干');assert.equal(await page.locator('input:checked').inputValue(),'A');}finally{await page.close();}
});
test('exam warning inside iframe blocks question solving',async()=>{
 const page=await setup('<iframe></iframe>');try{await page.frames()[1].setContent('<h1>期末考试</h1>'+fixture);await click(page,'solve');assert.match(await state(page),/人工操作/);assert.equal(await page.frames()[1].locator('input:checked').count(),0);}finally{await page.close();}
});
test('catalog cancellation during section switch never opens its video',async()=>{
 const page=await setup('<ul class="rank-1"><li class="catalogItem"><div class="basic">章</div><ul class="rank-2"><li><div class="basic active">一</div></li><li id="second"><div class="basic">二</div></li></ul></li></ul>');
 try{await page.addScriptTag({content:adapter});await page.evaluate(()=>{window.cancelled=false;window.opened=0;document.querySelector('#second>.basic').onclick=()=>{window.cancelled=true;document.querySelector('#second').insertAdjacentHTML('beforeend','<div class="resourcelist"><div class="basic"><i class="icon-video"></i></div></div>');document.querySelector('.resourcelist>.basic').onclick=()=>window.opened++;};});assert.equal(await page.evaluate(()=>UoocCatalog.advance(()=>window.cancelled,1)),false);assert.equal(await page.evaluate(()=>window.opened),0);}finally{await page.close();}
});
test('new catalog recognizes video icons and skips check-marked completed resources',async()=>{
 const page=await setup('<ul class="newlearn_left_card_chapter_list"><li><div class="level_1_title" href="#/c/ch">章</div><ul class="level_2"><li><div class="level_2_title" href="#/c/ch/s">节</div><div class="level_2_resourcelist"><div id="done" class="level_2_resourcelist_item"><img src="/video.png"><img class="level_2_resourcelist_item_icon_check"></div><div id="todo" class="level_2_resourcelist_item"><img src="/video_active.png"></div></div></li></ul></li></ul>');
 try{await page.addScriptTag({content:adapter});await page.evaluate(()=>{window.opened=[];document.querySelector('#done').onclick=()=>window.opened.push('done');document.querySelector('#todo').onclick=()=>window.opened.push('todo');});assert.equal(await page.evaluate(()=>UoocCatalog.name()),'新版优课');assert.equal(await page.evaluate(()=>UoocCatalog.advance(()=>false,1,true)),true);assert.deepEqual(await page.evaluate(()=>window.opened),['todo']);}finally{await page.close();}
});
test('new catalog uses route to identify active section and waits for asynchronous resources',async()=>{
 const page=await setup('<ul class="newlearn_left_card_chapter_list"><li><div class="level_1_title" href="#/c/ch">章</div><ul class="level_2"><li id="s1"><div class="level_2_title" href="#/c/ch/s1">节一</div><div class="level_2_resourcelist"><div class="level_2_resourcelist_item active"><img src="/video.png"></div></div></li><li id="s2"><div class="level_2_title" href="#/c/ch/s2">节二</div></li></ul></li></ul>');
 try{await page.addScriptTag({content:adapter});await page.evaluate(()=>{location.hash='#/c/ch/s1/resource/section';window.opened=0;document.querySelector('#s2>.level_2_title').onclick=()=>{location.hash='#/c/ch/s2';setTimeout(()=>{document.querySelector('#s1 .level_2_resourcelist').remove();document.querySelector('#s2').insertAdjacentHTML('beforeend','<div class="level_2_resourcelist"><div class="level_2_resourcelist_item"><img src="/video.png"></div></div>');document.querySelector('#s2 .level_2_resourcelist_item').onclick=()=>window.opened++;},80);};});assert.equal(await page.evaluate(()=>UoocCatalog.advance(()=>false,5)),true);assert.equal(await page.evaluate(()=>window.opened),1);}finally{await page.close();}
});
test('start from resource picker opens video automatically',async()=>{
 const page=await setup('<ul class="rank-1"><li class="catalogItem"><div class="resourcelist"><div class="basic"><i class="icon-video"></i>视频</div></div></li></ul>');
 try{await page.addScriptTag({content:adapter});await page.evaluate(()=>document.querySelector('.resourcelist .basic').onclick=()=>{setTimeout(()=>{const v=document.createElement('video');v.style='width:200px;height:120px';v.play=async()=>{window.started=true;};v.pause=()=>{};document.body.append(v);},80);});await click(page,'play');await page.waitForFunction(()=>window.started===true);assert.match(await state(page),/正在连续播放/);}finally{await page.close();}
});
test('hidden iframe questions are excluded',async()=>{
 const page=await setup('<iframe style="display:none"></iframe>');try{await page.frames()[1].setContent(fixture);await click(page,'inspect');assert.match(await state(page),/0 道/);}finally{await page.close();}
});
test('automatic exercise answers, saves, waits for success and resumes at 2x without submitting',async()=>{
 const page=await setup(fixture+'<button id="save">保存试卷</button><button id="next">下一节</button>',{nextSelector:'#next'});
 try{await page.evaluate(()=>{
  window.saved=0;window.started=false;
  document.querySelector('#save').onclick=()=>{window.saved++;setTimeout(()=>{const toast=document.createElement('div');toast.textContent='保存成功';document.body.append(toast);},30);};
  document.querySelector('#next').onclick=()=>{document.querySelector('fieldset').remove();const v=document.createElement('video');v.style='width:200px;height:100px';v.play=async()=>{window.started=true;};v.pause=()=>{};document.body.append(v);};
 });await click(page,'play');await page.waitForFunction(()=>window.started);assert.equal(await page.evaluate(()=>window.saved),1);assert.equal(await page.evaluate(()=>window.submits),0);assert.equal(await page.locator('video').evaluate(v=>v.playbackRate),2);
 }finally{await page.close();}
});
test('automatic exercise pauses when only a submit button exists',async()=>{
 const page=await setup();try{await click(page,'play');await page.waitForFunction(()=>window.panel.getElementById('state').textContent.includes('保存按钮'));assert.equal(await page.evaluate(()=>window.submits),0);}finally{await page.close();}
});
test('orb starts collapsed, expands and retracts without stopping playback',async()=>{
 const page=await setup('<h1 style="font:28px system-ui;color:#234b42">课程学习</h1><video style="width:600px;height:340px;background:#17352e;border-radius:16px"></video>');
 try{await video(page);assert.equal(await page.evaluate(()=>window.panel.getElementById('panel').hidden),true);
 const size=await page.locator('#uooc-learning-helper').boundingBox();assert.equal(Math.round(size.width),54);assert.equal(Math.round(size.height),54);
 await page.screenshot({path:path.join(__dirname,'../.test-artifacts/orb.png')});
 await click(page,'orb');assert.equal(await page.evaluate(()=>window.panel.getElementById('orb').getAttribute('aria-expanded')),'true');
 await page.screenshot({path:path.join(__dirname,'../.test-artifacts/panel.png')});
 await click(page,'play');await page.waitForFunction(()=>window.isPlaying);await click(page,'minimize');assert.equal(await page.evaluate(()=>window.panel.getElementById('panel').hidden),true);assert.equal(await page.evaluate(()=>window.isPlaying),true);
 await click(page,'orb');await page.evaluate(()=>window.panel.getElementById('play').dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true})));assert.equal(await page.evaluate(()=>window.panel.getElementById('panel').hidden),true);
 }finally{await page.close();}
});
test('saved but unsubmitted quiz advances to next chapter video through real catalog adapter',async()=>{
 const page=await setup(fixture+'<button id="save">保存试卷</button><ul class="rank-1"><li class="catalogItem"><div class="basic" href="#/c/ch1">第一章</div><ul class="rank-2" id="old"><li><div class="basic" href="#/c/ch1/s1">本章习题</div><div class="resourcelist"><div class="basic active">测验</div></div></li></ul></li><li class="catalogItem" id="chapter2"><div class="basic" href="#/c/ch2">第二章</div></li></ul>');
 try{await page.addScriptTag({content:adapter});await page.evaluate(()=>{
  location.hash='#/c/ch1/s1/quiz/section';window.saved=0;window.started=false;
  document.querySelector('#save').onclick=()=>{window.saved++;const t=document.createElement('span');t.textContent='保存成功';document.body.append(t);};
  document.querySelector('#chapter2>.basic').onclick=()=>{location.hash='#/c/ch2';document.querySelector('#old').remove();document.querySelector('fieldset').remove();document.querySelector('#chapter2').insertAdjacentHTML('beforeend','<ul class="rank-2"><li><div class="resourcelist"><div class="basic"><i class="icon-video"></i>下一章视频</div></div></li></ul>');document.querySelector('#chapter2 .resourcelist>.basic').onclick=()=>{const v=document.createElement('video');v.style='width:200px;height:100px';v.play=async()=>window.started=true;v.pause=()=>{};document.body.append(v);};};
 });await click(page,'play');await page.waitForFunction(()=>window.started);assert.equal(await page.evaluate(()=>window.saved),1);assert.equal(await page.evaluate(()=>window.submits),0);assert.equal(await page.locator('video').evaluate(v=>v.playbackRate),2);
 }finally{await page.close();}
});
for(const confirm of [false,true])test(`video popup without save resumes same video (${confirm?'with confirmation':'no confirmation button'})`,async()=>{
 const page=await setup('<video style="width:500px;height:300px"></video><button class="next">下一节</button>');
 try{await video(page);await page.evaluate(()=>{window.calls=0;chrome.runtime.sendMessage=async()=>{window.calls++;return {result:{answers:[1],explanation:'弹题测试'}};};});await click(page,'play');await page.waitForFunction(()=>window.isPlaying);
 await page.evaluate(({html,confirm})=>{window.isPlaying=false;const popup=document.createElement('div');popup.setAttribute('role','dialog');popup.innerHTML=html+(confirm?'<button id="confirm">继续播放</button>':'');document.body.append(popup);window.confirmed=0;if(confirm)document.querySelector('#confirm').onclick=()=>{window.confirmed++;popup.remove();};},{html:fixture,confirm});
 await page.evaluate(()=>window.ticks[0]());assert.equal(await page.evaluate(()=>window.isPlaying),true);assert.equal(await page.evaluate(()=>window.calls),1);assert.equal(await page.evaluate(()=>window.nextClicks),0);assert.equal(await page.evaluate(()=>window.submits),0);
 assert.equal(await page.evaluate(()=>window.confirmed),confirm?1:0);assert.doesNotMatch(await state(page),/保存按钮|已暂停/);
 await page.evaluate(()=>window.ticks[0]());assert.equal(await page.evaluate(()=>window.calls),1);assert.equal(await page.locator('video').evaluate(v=>v.playbackRate),2);
 }finally{await page.close();}
});
for(const control of ['span','input'])test(`video popup clicks ${control} confirmation in separate footer before resuming`,async()=>{
 const page=await setup('<video style="width:500px;height:300px"></video>');
 try{await video(page);await click(page,'play');await page.waitForFunction(()=>window.isPlaying);
 await page.evaluate(({html,control})=>{
  window.isPlaying=false;window.confirmed=0;window.resumedEarly=false;
  const v=document.querySelector('video');v.play=async()=>{if(document.querySelector('#popup'))window.resumedEarly=true;window.isPlaying=true;};
  const popup=document.createElement('div');popup.id='popup';popup.className='exercise-overlay';
  popup.innerHTML='<div class="question-body">'+html+'</div><div class="footer">'+(control==='span'?'<span class="btn" ng-click="confirm()"><span>确 定</span></span>':'<input type="submit" value="确定" disabled>')+'</div>';
  document.body.append(popup);const button=popup.querySelector('.footer>*');if(control==='input')setTimeout(()=>button.disabled=false,900);
  button.onclick=()=>{window.confirmed++;setTimeout(()=>popup.remove(),200);};
 },{html:fixture,control});
 await page.evaluate(()=>window.ticks[0]());assert.equal(await page.evaluate(()=>window.confirmed),1);assert.equal(await page.evaluate(()=>window.isPlaying),true);assert.equal(await page.evaluate(()=>window.resumedEarly),false);assert.equal(await page.evaluate(()=>window.submits),0);assert.equal(await page.locator('#popup').count(),0);
 }finally{await page.close();}
});
test('answered popup moved below player remains visible but does not block or get answered again',async()=>{
 const page=await setup('<video style="width:500px;height:300px"></video><section id="history"></section>');
 try{await video(page);await page.evaluate(()=>{window.calls=0;window.clock=0;Object.defineProperty(document.querySelector('video'),'currentTime',{get:()=>window.clock});chrome.runtime.sendMessage=async()=>{window.calls++;return {result:{answers:[1],explanation:'测试'}};};});await click(page,'play');
 await page.evaluate(html=>{window.isPlaying=false;const popup=document.createElement('div');popup.className='exercise-overlay';popup.innerHTML=html+'<button id="confirm">确定</button>';document.body.append(popup);document.querySelector('#confirm').onclick=()=>{popup.className='answered-history';document.querySelector('#history').append(popup);window.isPlaying=true;setTimeout(()=>window.clock=2,100);};},fixture);
 await page.evaluate(()=>window.ticks[0]());assert.equal(await page.locator('#history fieldset').isVisible(),true);assert.equal(await page.evaluate(()=>window.isPlaying),true);assert.equal(await page.evaluate(()=>window.calls),1);
 // Re-rendering history must not bypass the filter just because node identities change.
 await page.evaluate(()=>{const h=document.querySelector('#history');h.innerHTML=h.innerHTML;window.clock=3;});await page.evaluate(()=>window.ticks[0]());await click(page,'inspect');assert.equal(await page.evaluate(()=>JSON.parse(window.panel.getElementById('diagnosticText').textContent).questions.single),0);assert.match(await state(page),/播放/);assert.equal(await page.evaluate(()=>window.calls),1);assert.equal(await page.evaluate(()=>window.isPlaying),true);
 }finally{await page.close();}
});
test('existing history below video is ignored when starting and when manually paused',async()=>{
 const page=await setup('<video style="width:500px;height:300px"></video><section>'+fixture+'</section>');
 try{await video(page);await click(page,'inspect');assert.match(await state(page),/0 道/);await click(page,'play');await page.waitForFunction(()=>window.isPlaying);assert.equal(await page.evaluate(()=>window.submits),0);}finally{await page.close();}
});
test('multi blank writes literal text in order and notifies page input/change handlers',async()=>{
 const page=await setup('<div class="ti"><div class="ti-q-c">填空：函数____；表达式____</div><input type="text"><input type="text"></div>');
 try{await page.evaluate(()=>{window.changes=[];document.querySelectorAll('.ti input').forEach((e,i)=>e.addEventListener('change',()=>window.changes.push([i,e.value])));chrome.runtime.sendMessage=async msg=>{window.payload=msg.question;return {result:{answers:['main','x < 2 && y > 0'],explanation:'示例'}};};});await click(page,'solve');await page.waitForFunction(()=>window.panel.getElementById('state').textContent.includes('填写完成'));assert.deepEqual(await page.locator('.ti input').evaluateAll(es=>es.map(e=>e.value)),['main','x < 2 && y > 0']);assert.equal(await page.evaluate(()=>window.payload.blankCount),2);assert.equal(await page.evaluate(()=>window.changes.length),2);assert.equal(await page.locator('.ti script').count(),0);
 }finally{await page.close();}
});
test('fill blank automatically saves and resumes video without submitting',async()=>{
 const page=await setup('<fieldset><legend>填空：一个整数为____</legend><input type="number"></fieldset><button id="save">保存试卷</button><button id="next">下一节</button><button id="submit">提交试卷</button>',{nextSelector:'#next'});
 try{await page.evaluate(()=>{window.started=false;window.saved='';chrome.runtime.sendMessage=async()=>({result:{answers:['42'],explanation:'示例'}});document.querySelector('#save').onclick=()=>{window.saved=document.querySelector('input').value;const t=document.createElement('div');t.textContent='保存成功';document.body.append(t);};document.querySelector('#next').onclick=()=>{document.querySelector('fieldset').remove();const v=document.createElement('video');v.style='width:200px;height:100px';v.play=async()=>window.started=true;v.pause=()=>{};document.body.append(v);};});await click(page,'play');await page.waitForFunction(()=>window.started);assert.equal(await page.evaluate(()=>window.saved),'42');assert.equal(await page.evaluate(()=>window.submits),0);
 }finally{await page.close();}
});
test('captured UOOC textarea uses adjacent blank label, mouseleave handler and real save toast',async()=>{
 const html='<h2>填空题</h2><div class="ti"><div class="ti-q-c">填写演示答案</div><label>第1空:</label><textarea></textarea></div><button ng-click="vm.saveTask()">保存试卷</button><button ng-click="vm.commitTask()">提交试卷</button>';
 const page=await setup(html+'<button id="next">下一节</button>',{nextSelector:'#next'});
 try{await page.evaluate(()=>{window.modelAnswer='';window.saved='';window.started=false;chrome.runtime.sendMessage=async()=>({result:{answers:['价值观'],explanation:'模拟模型回答'}});const input=document.querySelector('textarea');input.addEventListener('mouseleave',()=>window.modelAnswer=input.value);document.querySelector('[ng-click="vm.saveTask()"] ').onclick=()=>{window.saved=window.modelAnswer;const toast=document.createElement('div');toast.textContent='保存试卷成功';document.body.append(toast);};document.querySelector('[ng-click="vm.commitTask()"] ').onclick=()=>{throw Error('must not submit');};document.querySelector('#next').onclick=()=>{document.querySelector('.ti').remove();const v=document.createElement('video');v.style='width:200px;height:100px';v.play=async()=>window.started=true;v.pause=()=>{};document.body.append(v);};});await click(page,'play');await page.waitForFunction(()=>window.started);assert.equal(await page.evaluate(()=>window.saved),'价值观');
 }finally{await page.close();}
});
for(const early of [false,true])test(`video feedback corrects wrong model answer then confirms (${early?'initially disabled':'after first confirmation'})`,async()=>{
 const page=await setup('<video style="width:500px;height:300px"></video>');
 try{await video(page);await page.evaluate(()=>{window.calls=0;chrome.runtime.sendMessage=async()=>{window.calls++;return {result:{answers:[1],explanation:'模拟错误回答'}};};});await click(page,'play');await page.waitForFunction(()=>window.isPlaying);
 await page.evaluate(({html,early})=>{window.isPlaying=false;window.confirmedCorrect=false;const popup=document.createElement('div');popup.setAttribute('role','dialog');popup.innerHTML=html+'<div id="feedback"></div><button id="confirm" '+(early?'disabled':'')+'>确定</button>';document.body.append(popup);const inputs=popup.querySelectorAll('input');const button=popup.querySelector('#confirm');const feedback=popup.querySelector('#feedback');const show=()=>{feedback.textContent='回答错误，正确答案：A';button.disabled=!inputs[0].checked;};inputs.forEach(e=>e.addEventListener('click',()=>{if(early||feedback.textContent)show();}));button.onclick=()=>{if(!inputs[0].checked){show();return;}window.confirmedCorrect=true;popup.remove();};},{html:fixture,early});
 await page.evaluate(()=>window.ticks[0]());assert.equal(await page.evaluate(()=>window.confirmedCorrect),true);assert.equal(await page.evaluate(()=>window.calls),1);assert.equal(await page.evaluate(()=>window.isPlaying),true);assert.equal(await page.locator('[role=dialog]').count(),0);
 }finally{await page.close();}
});
test('video to quiz waits for declared question count, answers every question, then saves once',async()=>{
 const page=await setup('<video style="width:300px;height:200px"></video><button id="next">下一节</button>',{nextSelector:'#next'});
 try{await video(page);await page.evaluate(html=>{
  window.calls=0;window.saves=[];let stage=0;chrome.runtime.sendMessage=async()=>{window.calls++;return {result:{answers:[1],explanation:'测试'}};};
  document.querySelector('#next').onclick=()=>{
   if(stage++===0){document.querySelector('video').remove();document.body.insertAdjacentHTML('beforeend','<div class="queList">单选题（共2题）</div><button id="save">保存试卷</button>');
    setTimeout(()=>document.body.insertAdjacentHTML('beforeend',html),50);
    setTimeout(()=>document.body.insertAdjacentHTML('beforeend',html.replaceAll('q1','q2')),1400);
    document.querySelector('#save').onclick=()=>{window.saves.push({calls:window.calls,checked:[...document.querySelectorAll('fieldset')].map(q=>q.querySelectorAll('input')[1].checked)});const t=document.createElement('div');t.textContent='保存成功';document.body.append(t);};
   }else{document.querySelectorAll('fieldset').forEach(e=>e.remove());const v=document.createElement('video');v.style='width:200px;height:100px';v.play=async()=>window.finished=true;v.pause=()=>{};document.body.append(v);}
  };
 },fixture);await click(page,'play');await page.evaluate(()=>document.querySelector('video').dispatchEvent(new Event('ended')));await page.waitForTimeout(800);assert.equal(await page.evaluate(()=>window.saves.length),0);await page.waitForFunction(()=>window.finished);const saves=await page.evaluate(()=>window.saves);assert.equal(saves.length,1);assert.equal(saves[0].calls,2);assert.deepEqual(saves[0].checked,[true,true]);
 }finally{await page.close();}
});
test('question appended during answer request is answered before saving',async()=>{
 const page=await setup(fixture+'<button id="save">保存试卷</button><button id="next">下一节</button>',{nextSelector:'#next'});
 try{await page.evaluate(html=>{window.calls=0;window.saved=[];chrome.runtime.sendMessage=async()=>{if(++window.calls===1)setTimeout(()=>document.body.insertAdjacentHTML('beforeend',html.replaceAll('q1','q2')),150);await new Promise(r=>setTimeout(r,250));return {result:{answers:[1],explanation:'测试'}};};document.querySelector('#save').onclick=()=>{window.saved=[...document.querySelectorAll('fieldset')].map(q=>q.querySelectorAll('input')[1].checked);const t=document.createElement('div');t.textContent='保存成功';document.body.append(t);};document.querySelector('#next').onclick=()=>{document.querySelectorAll('fieldset').forEach(q=>q.remove());const v=document.createElement('video');v.style='width:200px;height:100px';v.play=async()=>window.finished=true;v.pause=()=>{};document.body.append(v);};},fixture);await click(page,'play');await page.waitForFunction(()=>window.finished);assert.deepEqual(await page.evaluate(()=>window.saved),[true,true]);
 }finally{await page.close();}
});

const emptyJourneyMarkup='<div class="lean_view"><video style="width:300px;height:180px"></video></div><ul class="rank-1"><li id="oldChapter" class="catalogItem"><div class="basic" href="#/c/old">第三章</div><ul class="rank-2"><li id="oldSection"><div class="basic" href="#/c/old/oldSection">3.6</div><div class="resourcelist"><div class="basic active complete"><i class="icon-video"></i>视频</div></div></li><li id="emptySection"><div class="basic" href="#/c/old/emptySection">第1节</div></li></ul></li><li id="nextChapter" class="catalogItem"><div class="basic" href="#/c/next">第四章</div></li></ul>';
async function emptyJourney(page){await page.addScriptTag({content:adapter});await page.evaluate(()=>{
 location.hash='/c/old/oldSection/resource';window.journey=[];
 document.querySelector('#emptySection>.basic').onclick=()=>{journey.push('emptySection');location.hash='/c/old/emptySection';document.querySelector('.lean_view').innerHTML='进入第1节,请选择课程资源';document.querySelector('#oldSection .resourcelist').remove();document.querySelector('#emptySection').insertAdjacentHTML('beforeend','<ul class="rank-3"><li id="emptyPoint"><div class="basic" href="#/c/old/emptySection/point">空知识点</div></li></ul>');document.querySelector('#emptyPoint>.basic').onclick=()=>{journey.push('emptyPoint');location.hash='/c/old/emptySection/point';document.querySelector('#emptyPoint').insertAdjacentHTML('beforeend','<div class="unfoldInfo">点击下方继续学习</div>');};};
 document.querySelector('#nextChapter>.basic').onclick=()=>{journey.push('nextChapter');location.hash='/c/next';document.querySelector('#oldChapter .rank-2')?.remove();setTimeout(()=>{document.querySelector('#nextChapter').insertAdjacentHTML('beforeend','<ul class="rank-2"><li id="newSection"><div class="basic" href="#/c/next/section">下一节</div></li></ul>');document.querySelector('#newSection>.basic').onclick=()=>{journey.push('newSection');location.hash='/c/next/section';document.querySelector('#newSection').insertAdjacentHTML('beforeend','<div class="resourcelist"><div class="basic"><i class="icon-video"></i>视频</div></div>');document.querySelector('#newSection .resourcelist>.basic').onclick=()=>{journey.push('video');location.hash='/c/next/section/resource';document.querySelector('.lean_view').innerHTML='<video style="width:300px;height:180px"></video>';const v=document.querySelector('video');v.play=async()=>{window.nextStarted=true;};v.pause=()=>{};};};},30);};
 });}
test('explicit empty sections and nested empty points continue into the next chapter',async()=>{const page=await setup(emptyJourneyMarkup);try{await emptyJourney(page);assert.equal(await page.evaluate(()=>UoocCatalog.advance(()=>false,5,false,true)),true);assert.deepEqual(await page.evaluate(()=>journey),['emptySection','emptyPoint','nextChapter','newSection','video']);}finally{await page.close();}});
test('ended video crosses the empty resource picker and resumes the next chapter',async()=>{const page=await setup(emptyJourneyMarkup);try{await emptyJourney(page);await video(page);await click(page,'play');await page.waitForFunction(()=>window.isPlaying);await page.locator('video').evaluate(v=>v.dispatchEvent(new Event('ended')));await page.waitForFunction(()=>window.nextStarted);assert.deepEqual(await page.evaluate(()=>journey),['emptySection','emptyPoint','nextChapter','newSection','video']);assert.equal(await page.locator('video').evaluate(v=>v.playbackRate),2);}finally{await page.close();}});
test('resource picker reached during a running session recovers and manual pause prevents recovery',async()=>{for(const paused of [false,true]){const page=await setup(emptyJourneyMarkup);try{await emptyJourney(page);await video(page);await click(page,'play');await page.waitForFunction(()=>window.isPlaying);if(paused)await click(page,'stop');await page.evaluate(()=>document.querySelector('#emptySection>.basic').click());await page.evaluate(()=>window.ticks[0]());await page.evaluate(()=>{const now=Date.now.bind(Date);Date.now=()=>now()+2000;});await page.evaluate(()=>window.ticks[0]());assert.equal(await page.evaluate(()=>!!window.nextStarted),!paused);assert.equal(await page.evaluate(()=>journey.includes('nextChapter')),!paused);}finally{await page.close();}}});
test('network error is not an explicit empty section and does not skip to another chapter',async()=>{const page=await setup(emptyJourneyMarkup);try{await emptyJourney(page);await page.evaluate(()=>{const native=setTimeout;window.setTimeout=fn=>native(fn,0);document.querySelector('#emptySection>.basic').onclick=()=>{location.hash='/c/old/emptySection';document.querySelector('#emptySection').insertAdjacentHTML('beforeend','<div class="unfoldInfo">网络错误，请重试</div>');};});const error=await page.evaluate(async()=>{try{await UoocCatalog.advance(()=>false,250,false,true);}catch(e){return e.message;}});assert.match(error,/目录加载超时/);assert.equal(await page.evaluate(()=>journey.includes('nextChapter')),false);}finally{await page.close();}});
test('selected video still loading is not classified as an idle resource picker',async()=>{const page=await setup('<div class="lean_view">进入第1节,请选择课程资源</div><ul class="rank-1"><li class="catalogItem"><div class="basic" href="#/c/ch">章</div><ul class="rank-2"><li><div class="basic" href="#/c/ch/s">节</div><div class="resourcelist"><div class="basic active"><i class="icon-video"></i>视频</div></div></li></ul></li></ul>');try{await page.addScriptTag({content:adapter});await page.evaluate(()=>location.hash='/c/ch/s/video');assert.equal(await page.evaluate(()=>UoocCatalog.picker()),false);}finally{await page.close();}});
test('temporary empty placeholder with a loading spinner waits for its actual resources',async()=>{const page=await setup(emptyJourneyMarkup);try{await emptyJourney(page);await page.evaluate(()=>document.querySelector('#emptySection>.basic').onclick=()=>{location.hash='/c/old/emptySection';document.querySelector('#oldSection .resourcelist').remove();document.querySelector('#emptySection').insertAdjacentHTML('beforeend','<div class="isloading">加载中</div><div class="unfoldInfo">点击下方继续学习</div>');setTimeout(()=>{document.querySelector('.isloading').remove();document.querySelector('#emptySection').insertAdjacentHTML('beforeend','<div class="resourcelist"><div class="basic"><i class="icon-video"></i>视频</div></div>');document.querySelector('#emptySection .resourcelist>.basic').onclick=()=>journey.push('loadedVideo');},650);});assert.equal(await page.evaluate(()=>UoocCatalog.advance(()=>false,5,false,true)),true);assert.deepEqual(await page.evaluate(()=>journey),['loadedVideo']);}finally{await page.close();}});


test('more than twenty questions are all answered without a total-count cutoff',async()=>{
 const markup=Array.from({length:25},(_,i)=>'<fieldset><legend>题目'+(i+1)+'</legend><label><input type="radio" name="long'+i+'">选项一</label><label><input type="radio" name="long'+i+'">选项二</label></fieldset>').join('');
 const page=await setup(markup);
 try{await click(page,'solve');await page.waitForFunction(()=>window.panel.getElementById('state').textContent.includes('填写完成'),null,{timeout:60000});assert.equal(await page.locator('input:checked').count(),25);}
 finally{await page.close();}
});



test('uncertain twentieth answer retries current question and continues without skipping',async()=>{
const page=await setup(Array.from({length:25},(_,i)=>'<fieldset><legend>题目'+i+'</legend><label><input type="radio" name="retry'+i+'">一</label><label><input type="radio" name="retry'+i+'">二</label></fieldset>').join(''));
try{await page.evaluate(()=>{let count=0;window.guesses=0;chrome.runtime.sendMessage=async m=>{if(m.type!=='solve')return {};if(m.allowGuess){window.guesses++;return {result:{answers:[0],explanation:'推测',uncertain:true}};}return ++count===20?{error:'模型答案不确定或格式有误，请人工处理',code:'ANSWER_UNCERTAIN'}:{result:{answers:[1],explanation:'测试'}};};});await click(page,'solve');await page.waitForFunction(()=>window.panel.getElementById('state').textContent.includes('填写完成'),null,{timeout:60000});assert.equal(await page.locator('input:checked').count(),25);assert.equal(await page.locator('input[name=retry19]').first().isChecked(),true);assert.equal(await page.evaluate(()=>window.guesses),1);assert.match(await page.evaluate(()=>window.panel.getElementById('log').textContent),/推测答案/);}finally{await page.close();}
});

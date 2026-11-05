const {test,before,after}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');const {chromium}=require('playwright');let browser;
before(async()=>browser=await chromium.launch({channel:'msedge',headless:true}));after(async()=>browser?.close());
async function page(html){const p=await browser.newPage();await p.setContent(html);return p;}
async function submitSetup(extra='',options={}){
 const p=await page('<div class="smallTest-view"><fieldset><legend>测试</legend><label><input type="radio" checked>选项</label></fieldset></div><button id="submit">提交试卷</button>'+extra);
 await p.evaluate(options=>{window.enabled=true;window.verified=true;window.counts={open:0,confirm:0,ack:0};const native=setTimeout;window.setTimeout=(fn,ms)=>native(fn,options.fast?0:ms);window.env={visible:e=>e.isConnected&&!!e.getClientRects().length&&getComputedStyle(e).visibility!=='hidden',verify:()=>window.verified,isQuiz:()=>options.quiz!==false,allowed:()=>window.enabled,say:()=>{}};window.batch={items:[{root:document.querySelector('fieldset')}]};},options);
 await p.addScriptTag({content:fs.readFileSync('quiz-submit.js','utf8')});return p;
}
function run(p){return p.evaluate(async()=>{try{return {ok:await UoocQuizSubmission.submit(window.batch,window.env)};}catch(e){return {error:e.message};}});}
test('submission opens confirmation once, confirms once, acknowledges success and never resubmits',async()=>{
 const p=await submitSetup();try{await p.evaluate(()=>document.querySelector('#submit').onclick=()=>{counts.open++;document.body.insertAdjacentHTML('beforeend','<div role="dialog"><h3>提交试卷</h3><button id="confirm">确认提交</button></div>');document.querySelector('#confirm').onclick=()=>{counts.confirm++;document.querySelector('[role=dialog]').innerHTML='<div class="layui-layer-content">测验通过，可以继续后面的学习！</div><button id="ack">确定</button>';document.querySelector('#ack').onclick=()=>counts.ack++;};});assert.equal((await run(p)).ok,true);assert.deepEqual(await p.evaluate(()=>counts),{open:1,confirm:1,ack:1});await run(p);assert.equal(await p.evaluate(()=>counts.confirm),1);}finally{await p.close();}
});
test('captcha and unanswered warning both stop before final submission',async()=>{
 for(const body of ['<div id="sc">请完成智能验证</div>','<div id="notComplete">还有1题未做完</div>']){const p=await submitSetup();try{await p.evaluate(body=>document.querySelector('#submit').onclick=()=>{counts.open++;document.body.insertAdjacentHTML('beforeend','<div id="commitConfirmDialog">提交试卷'+body+'<button id="confirm">确认提交</button></div>');document.querySelector('#confirm').onclick=()=>counts.confirm++;},body);assert.match((await run(p)).error,/验证|未完成/);assert.equal(await p.evaluate(()=>counts.confirm),0);}finally{await p.close();}}
});
test('唯一的点击验证按钮只触发一次，网站明确通过后才交卷',async()=>{
 const p=await submitSetup();
 try{
  await p.evaluate(()=>{
   counts.verify=0;
   document.querySelector('#submit').onclick=()=>{
    document.body.insertAdjacentHTML('beforeend','<div id="commitConfirmDialog"><h3>提交试卷</h3><div id="sc"><p>请完成智能验证</p><button id="verify">点击按钮进行验证</button></div><button id="confirm">确认提交</button></div>');
    document.querySelector('#verify').onclick=()=>counts.verify++;
    document.querySelector('#confirm').onclick=()=>{
     counts.confirm++;document.querySelector('#commitConfirmDialog').innerHTML='<div class="layui-layer-content">测验提交成功</div>';
    };
   };
  });
  const submitting=run(p);
  await p.waitForFunction(()=>counts.verify===1);
  assert.equal(await p.evaluate(()=>counts.confirm),0);
  await p.locator('#sc').evaluate(e=>e.innerHTML='<p>验证通过</p>');
  assert.deepEqual(await submitting,{ok:true});
  assert.deepEqual(await p.evaluate(()=>[counts.verify,counts.confirm]),[1,1]);
 }finally{await p.close();}
});
test('优课真实控件结构的复选框触发一次，提交 div 解锁后才点击',async()=>{
 const p=await submitSetup();
 try{
  await p.evaluate(()=>{
   counts.verify=0;
   document.querySelector('#submit').onclick=()=>{
    document.body.insertAdjacentHTML('beforeend',`<div id="commitConfirmDialog"><h3>提交试卷</h3>
     <div id="sc"><div id="aliyunCaptcha-checkbox-body"><div id="aliyunCaptcha-checkbox-left"><span>点击复选框开始智能验证</span></div></div></div>
     <div class="btn btn-warning" ng-disabled="!vcode_params.captchaVerifyParam" ng-click="vm.doCommitTask()" disabled="disabled">提交</div>
    </div>`);
    document.querySelector('#aliyunCaptcha-checkbox-body').onclick=()=>counts.verify++;
    document.querySelector('[ng-disabled]').onclick=()=>{
     counts.confirm++;document.querySelector('#commitConfirmDialog').innerHTML='<div class="layui-layer-content">测验提交成功</div>';
    };
   };
  });
  const submitting=run(p);
  await p.waitForFunction(()=>counts.verify===1);
  assert.deepEqual(await p.evaluate(()=>[counts.verify,counts.confirm]),[1,0]);
  await p.locator('[ng-disabled]').evaluate(e=>e.removeAttribute('disabled'));
  assert.deepEqual(await submitting,{ok:true});
  assert.deepEqual(await p.evaluate(()=>[counts.verify,counts.confirm]),[1,1]);
 }finally{await p.close();}
});
test('滑块、歧义按钮和验证成功后的说明文字不会触发交卷',async()=>{
 for(const gate of ['<p>请拖动滑块</p><button>点击验证</button>','<button>点击验证</button><button>开始验证</button>','<p>请完成智能验证</p><p>验证成功后可提交</p>']){
  const p=await submitSetup();
  try{
   await p.evaluate(gate=>{
    counts.verify=0;
    document.querySelector('#submit').onclick=()=>{
     document.body.insertAdjacentHTML('beforeend','<div id="commitConfirmDialog"><h3>提交试卷</h3><div id="sc">'+gate+'</div><button id="confirm">确认提交</button></div>');
     document.querySelectorAll('#sc button').forEach(button=>button.onclick=()=>counts.verify++);
     document.querySelector('#confirm').onclick=()=>counts.confirm++;
    };
   },gate);
   assert.match((await run(p)).error,/手动完成验证/);
   assert.deepEqual(await p.evaluate(()=>[counts.verify,counts.confirm]),[0,0]);
  }finally{await p.close();}
 }
});
test('disabling switch or changing answers before confirm prevents submit',async()=>{
 for(const kind of ['enabled','verified']){const p=await submitSetup();try{await p.evaluate(kind=>document.querySelector('#submit').onclick=()=>{document.body.insertAdjacentHTML('beforeend','<div role="dialog">确认提交<button id="confirm">确定</button></div>');window[kind]=false;document.querySelector('#confirm').onclick=()=>counts.confirm++;},kind);const result=await run(p);if(kind==='verified')assert.match(result.error,/答案发生变化/);else assert.equal(result.ok,false);assert.equal(await p.evaluate(()=>counts.confirm),0);}finally{await p.close();}}
});
test('unknown resource types are not submitted',async()=>{const p=await submitSetup('',{quiz:false});try{assert.match((await run(p)).error,/普通测验/);assert.equal(await p.evaluate(()=>counts.open),0);}finally{await p.close();}});
test('unknown outcome never causes a duplicate submission, and question text cannot fake success',async()=>{
 const p=await submitSetup('',{fast:true});try{await p.evaluate(()=>{document.querySelector('legend').textContent='题干包含提交成功四个字';document.querySelector('#submit').onclick=()=>{counts.open++;document.body.insertAdjacentHTML('beforeend','<div role="dialog">提交试卷<button id="confirm">确认提交</button></div>');document.querySelector('#confirm').onclick=()=>{counts.confirm++;document.querySelector('[role=dialog]').remove();};};});assert.match((await run(p)).error,/未收到/);assert.match((await run(p)).error,/重复交卷/);assert.equal(await p.evaluate(()=>counts.confirm),1);}finally{await p.close();}
});
test('website failed result prevents continuing',async()=>{const p=await submitSetup();try{await p.evaluate(()=>document.querySelector('#submit').onclick=()=>document.body.insertAdjacentHTML('beforeend','<div role="dialog">测验未通过，请重新答题</div>'));assert.match((await run(p)).error,/未确认测验通过/);}finally{await p.close();}});
test('locked chapter recovery tries later chapters and skips multiple blocked entries',async()=>{
 const p=await page('<ul class="rank-1"><li class="catalogItem" id="one"><div class="basic chapter active">第一章</div><ul class="rank-2"><li><div class="basic active">小节</div><div class="unfoldInfo">请先通过上一节测验才能继续学习</div></li></ul></li><li class="catalogItem" id="two"><div class="basic chapter">第二章</div></li><li class="catalogItem unopen" id="locked"><div class="basic chapter">锁定章</div></li><li class="catalogItem" id="three"><div class="basic chapter">第三章</div></li></ul>');try{
 await p.addScriptTag({content:fs.readFileSync('uooc-adapter.js','utf8')});await p.evaluate(()=>{window.opened=[];for(const id of ['two','three'])document.querySelector('#'+id+'>.basic').onclick=()=>{opened.push(id);document.querySelectorAll('.basic.active').forEach(e=>e.classList.remove('active'));document.querySelector('#'+id+'>.basic').classList.add('active');document.querySelectorAll('.rank-2').forEach(e=>e.remove());if(id==='two')document.querySelector('#two').insertAdjacentHTML('beforeend','<div class="unfoldInfo">闯关模式，需先提交测验才能学习</div>');else{document.querySelector('#three').insertAdjacentHTML('beforeend','<div class="resourcelist"><div class="basic"><i class="icon-video"></i>视频</div></div>');document.querySelector('#three .resourcelist>.basic').onclick=()=>opened.push('video');}};});assert.equal(await p.evaluate(()=>UoocCatalog.advance(()=>false,1,false,true,{laterChapter:true})),true);assert.deepEqual(await p.evaluate(()=>opened),['two','three','video']);
 }finally{await p.close();}
});
test('plain network errors are not treated as gates and cancel prevents any later chapter click',async()=>{
 const p=await page('<div class="unfoldInfo">网络错误，请重试</div><ul class="rank-1"><li class="catalogItem"><div class="basic active">第一章</div></li><li class="catalogItem"><div class="basic">第二章</div></li></ul>');try{await p.addScriptTag({content:fs.readFileSync('uooc-adapter.js','utf8')});assert.equal(await p.evaluate(()=>!!UoocCatalog.gateNotice()),false);assert.equal(await p.evaluate(()=>UoocCatalog.advance(()=>true,1,false,true,{laterChapter:true})),false);}finally{await p.close();}
});
async function learningSetup(autoSubmit,hold=false){
 const p=await page('<h1>章节测验</h1><div class="smallTest-view"><fieldset><legend>示例题</legend><label><input type="radio" name="q">甲</label><label><input type="radio" name="q">乙</label></fieldset></div><button id="save">保存答案</button><button id="commit">提交试卷</button><button class="next">下一节</button>');
 await p.evaluate(({autoSubmit,hold})=>{
  const attach=Element.prototype.attachShadow;Element.prototype.attachShadow=function(o){const root=attach.call(this,o);window.panel=root;return root;};window.intervals={};window.setInterval=(fn,ms)=>{window.intervals[ms]=fn;return ms;};window.offset=0;const now=Date.now.bind(Date);Date.now=()=>now()+window.offset;
  window.chrome={storage:{sync:{get:async()=>({settings:{delay:.001,autoSubmit,timerMinutes:1,sound:false}})}},runtime:{sendMessage:async()=>{window.calls++;return {result:{answers:[1],explanation:'mock'}};}}};window.calls=0;window.counts={save:0,open:0,confirm:0,ack:0,next:0};
  document.querySelector('#save').onclick=()=>{counts.save++;document.body.insertAdjacentHTML('beforeend','<p>保存答案成功</p>');};document.querySelector('#commit').onclick=()=>{counts.open++;document.body.insertAdjacentHTML('beforeend','<div id="commitConfirmDialog" role="dialog"><h3>提交试卷</h3><button id="confirm" '+(hold?'disabled':'')+'>确认提交</button></div>');document.querySelector('#confirm').onclick=()=>{counts.confirm++;document.querySelector('#commitConfirmDialog').innerHTML='<div class="layui-layer-content">测验通过，可以继续后面的学习！</div><button id="ack">确定</button>';document.querySelector('#ack').onclick=()=>{counts.ack++;document.querySelector('#commitConfirmDialog').remove();};};};
  document.querySelector('.next').onclick=()=>{counts.next++;document.querySelector('.smallTest-view').remove();document.querySelector('#save').remove();document.querySelector('#commit').remove();document.querySelector('h1').remove();const v=document.createElement('video');v.style='width:300px;height:180px';Object.defineProperty(v,'paused',{get:()=>!window.running});Object.defineProperty(v,'ended',{get:()=>false});v.play=async()=>window.running=true;v.pause=()=>window.running=false;document.body.prepend(v);};
 },{autoSubmit,hold});
 await p.addScriptTag({content:fs.readFileSync('quiz-submit.js','utf8')});await p.addScriptTag({content:fs.readFileSync('content.js','utf8')});return p;
}
for(const enabled of [false,true])test('full learning flow '+(enabled?'submits verified quiz then continues':'keeps submission off and only saves'),async()=>{
 const p=await learningSetup(enabled);try{await p.evaluate(()=>window.panel.getElementById('play').click());await p.waitForFunction(()=>window.running===true);const counts=await p.evaluate(()=>window.counts);assert.equal(counts.save,1);assert.equal(counts.open,enabled?1:0);assert.equal(counts.confirm,enabled?1:0);assert.equal(counts.ack,enabled?1:0);assert.equal(counts.next,1);assert.equal(await p.evaluate(()=>window.calls),1);}finally{await p.close();}
});
for(const reason of ['switch','timer'])test('pending quiz confirmation is stopped by '+reason,async()=>{
 const p=await learningSetup(true,true);try{await p.evaluate(()=>window.panel.getElementById('play').click());await p.waitForFunction(()=>window.counts.open===1);await p.evaluate(reason=>{if(reason==='switch'){const input=window.panel.getElementById('autoSubmit');input.checked=false;input.dispatchEvent(new Event('change'));}else{window.offset+=60001;window.intervals[1000]();}},reason);await p.waitForTimeout(250);const counts=await p.evaluate(()=>window.counts);assert.equal(counts.confirm,0);assert.equal(counts.next,0);assert.match(await p.evaluate(()=>window.panel.getElementById('state').textContent),reason==='switch'?/已关闭自动提交/:/定时已到/);}finally{await p.close();}
});
test('old chapter gate messages do not interrupt a different active chapter',async()=>{
 const p=await page('<ul class="rank-1"><li class="catalogItem"><a class="basic" href="#/one">第一章</a><div class="unfoldInfo">请先完成上一章节的测验后学习</div></li><li class="catalogItem"><a class="basic active" href="#/two">第二章</a></li></ul>');try{await p.evaluate(()=>location.hash='/two');await p.addScriptTag({content:fs.readFileSync('uooc-adapter.js','utf8')});assert.equal(await p.evaluate(()=>UoocCatalog.gateNotice()===null),true);assert.equal(await p.evaluate(()=>!!UoocCatalog.gateNotice(document.querySelector('li'))),true);}finally{await p.close();}
});

const {test,before,after}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),{chromium}=require('playwright');let browser;
const source=n=>fs.readFileSync(n,'utf8'),study='https://studyvideoh5.zhihuishu.com/stuStudy?recruitAndCourseId=demoCourse',home='https://onlineexamh5new.zhihuishu.com/stuExamWeb.html#/webExamList/dohomework/1/student/exam/2/3/0';
before(async()=>browser=await chromium.launch({channel:'msedge',headless:true}));after(async()=>browser?.close());
async function setup({work=false,count=6,noPolling=false}={}){
 const p=await browser.newPage();await p.route('**/*',route=>route.fulfill({contentType:'text/html',body:'<meta charset="utf-8"><title>智慧树共享课</title>'}));await p.goto(work?home:study);
 await p.evaluate(({work,count,version,noPolling})=>{
  if(noPolling){const interval=window.setInterval.bind(window);window.setInterval=(fn,ms,...args)=>ms===1500?0:interval(fn,ms,...args);}
  window.messages=[];window.saves=[];window.submits=0;window.held=false;window.uncertain=false;window.failAt=0;
  const shadows=new WeakMap(),attach=Element.prototype.attachShadow;Element.prototype.attachShadow=function(options){const root=attach.call(this,options);shadows.set(this,root);if(this.id==='uooc-learning-helper')window.panel=root;return root;};
  window.chrome={dom:{openOrClosedShadowRoot:e=>shadows.get(e)||null},runtime:{getManifest:()=>({version}),onMessage:{addListener:()=>{}},sendMessage:async m=>{messages.push(m);if(m.type==='uiGet')return {result:{settings:{rate:2,delay:.001,sound:false,autoSubmit:true}}};if(m.type==='solve'){const n=Number(m.question.text.match(/第(\d+)/)?.[1]);if(window.held)await new Promise(resolve=>window.release=resolve);if(window.failAt===n)return {error:'网络暂时异常',code:'NETWORK'};if(window.uncertain&&n===20&&!m.allowGuess)return {error:'不确定',code:'ANSWER_UNCERTAIN'};return {result:{answers:m.question.type==='multiple'?[0,2]:m.question.type==='blank'?['示例']:[1],guessed:!!m.allowGuess,explanation:'模拟回答'}};}return {result:{}};}},storage:{onChanged:{addListener:()=>{}}}};
  if(work){
   document.body.innerHTML='<div class="examInfo"><li><span title="模拟课程">模拟课程</span></li></div><div class="answerCard_list"><ul></ul></div><div id="questions"></div><div class="switch-btn-box"></div><button id="submit">提交作业</button>';
   window.index=0;window.total=count;
   for(let n=1;n<=count;n++){
    const card=document.createElement('li');card.textContent=n;document.querySelector('.answerCard_list ul').append(card);card.onclick=()=>{index=n-1;render();};
    const q=document.createElement('div');q.className='examPaper_subject';q.style.display=n===1?'block':'none';const blank=n%5===0,multi=n%3===0;
    q.innerHTML='<div class="subject_num">'+n+'</div><div class="subject_type">'+(blank?'填空题':multi?'多选题':'单选题')+'</div><div class="subject_describe"><div class="stem-host"></div></div><div class="subject_node"></div>';
    q.querySelector('.stem-host').attachShadow({mode:'closed'}).innerHTML='<p>第'+n+'题：模拟题干</p>';
    if(blank)q.querySelector('.subject_node').innerHTML='<input type="text">';else for(let i=0;i<4;i++){const label=document.createElement('div');label.className='nodeLab';label.innerHTML='<input type="'+(multi?'checkbox':'radio')+'" style="display:none"><div class="node_detail">模拟选项'+i+'</div>';label.onclick=()=>{const input=label.querySelector('input');if(!multi)q.querySelectorAll('input').forEach(e=>{if(e!==input)e.checked=false;});input.checked=multi?!input.checked:true;};q.querySelector('.subject_node').append(label);}
    document.querySelector('#questions').append(q);
   }
   window.render=()=>{document.querySelectorAll('.examPaper_subject').forEach((q,i)=>q.style.display=i===index?'block':'none');const box=document.querySelector('.switch-btn-box');box.innerHTML='<button>'+ (index===total-1?'保存':'下一题')+'</button>';box.querySelector('button').onclick=()=>{const n=index+1,q=document.querySelectorAll('.examPaper_subject')[index],inputs=[...q.querySelectorAll('input')];if(!inputs.some(i=>i.type==='text'?!!i.value:i.checked))return;saves.push(n);if(n<total){index++;render();}else{const toast=document.createElement('div');toast.textContent='保存成功！';document.body.append(toast);}};};render();document.querySelector('#submit').onclick=()=>submits++;
  }else{
   document.body.innerHTML='<header class="el-header"><p class="source-name">模拟共享课程</p></header><ul><li class="video"><b class="hour">1.1</b><span class="catalogue_title">完成视频</span><b class="time_icofinish"></b></li><li class="video current_play"><b class="hour">1.2</b><span class="catalogue_title">当前视频</span></li><li class="video"><b class="hour">1.3</b><span class="catalogue_title">后续视频</span></li></ul><div class="speedBox"><div class="speedTab" rate="1.5">X 1.5</div><div class="speedTab" rate="1.25">X 1.25</div><div class="speedTab" rate="1.0">X 1.0</div></div><video style="width:600px;height:300px"></video>';
   const v=document.querySelector('video');window.rateClicks=[];document.querySelectorAll('.speedTab').forEach(e=>e.onclick=()=>{rateClicks.push(Number(e.getAttribute('rate')));v.playbackRate=Number(e.getAttribute('rate'));});window.running=false;window.ended=false;window.time=0;Object.defineProperties(v,{paused:{get:()=>!running},ended:{get:()=>ended},readyState:{get:()=>4},seeking:{get:()=>false},duration:{get:()=>20},currentTime:{get:()=>time},currentSrc:{get:()=>document.querySelector('.current_play .hour').textContent}});v.play=async()=>{running=true;};v.pause=()=>{running=false;};document.querySelectorAll('li.video').forEach(row=>row.onclick=()=>{document.querySelector('.current_play').classList.remove('current_play');row.classList.add('current_play');ended=false;time=0;running=false;});
   window.popup=(complete=false)=>{running=false;const d=document.createElement('div');d.setAttribute('role','dialog');d.setAttribute('aria-label','弹题测验');d.innerHTML='<div class="topic"><div class="radio"><p class="topic-title"><span class="title-tit">【单选题】</span><span>第1题：模拟弹题</span></p><ul class="topic-list">'+[0,1,2].map(i=>'<li class="topic-item"><span class="topic-option-item">'+String.fromCharCode(65+i)+'.</span><div class="item-topic">选项'+i+'</div></li>').join('')+'</ul></div></div><div class="dialog-footer"><div class="btn">提交</div></div>';document.body.append(d);d.querySelectorAll('.topic-item').forEach(row=>row.onclick=()=>{d.querySelectorAll('.topic-list .active').forEach(e=>e.classList.remove('active'));row.querySelector('.item-topic').classList.add('active');});const btn=d.querySelector('.btn');btn.onclick=()=>{if(btn.textContent==='关闭'){d.remove();return;}const answer=document.createElement('p');answer.className='answer';answer.textContent='正确答案：B';d.querySelector('.radio').append(answer);btn.textContent='关闭';};if(complete)btn.click();};
  }
 },{work,count,noPolling,version:JSON.parse(source('manifest.json')).version});
 for(const file of ['platforms.js','zhihuishu-adapter.js','content.js'])await p.addScriptTag({content:source(file)});
 await p.waitForFunction(()=>window.panel&&panel.getElementById('rate').value===(location.hostname==='studyvideoh5.zhihuishu.com'?'1.5':'2'));return p;
}
test('50题混合闭合题干逐题保存，第20题推测后继续至最后，不交卷',async()=>{const p=await setup({work:true,count:50});try{
 await p.evaluate(()=>{uncertain=true;panel.getElementById('solve').click();});await p.waitForFunction(()=>panel.getElementById('state').textContent.includes('全部答案已保存'),null,{timeout:90000});
 assert.equal(await p.evaluate(()=>messages.filter(m=>m.type==='solve').length),51);assert.deepEqual(await p.evaluate(()=>saves),Array.from({length:50},(_,i)=>i+1));assert.equal(await p.evaluate(()=>submits),0);assert.match(await p.evaluate(()=>panel.getElementById('taskProgress').textContent),/50\/50/);
}finally{await p.close();}});
test('请求中暂停丢弃迟到结果，继续后保留已有页面答案',async()=>{const p=await setup({work:true,count:2});try{
 await p.evaluate(()=>{held=true;panel.getElementById('solve').click();});await p.waitForFunction(()=>typeof release==='function');await p.evaluate(()=>{panel.getElementById('stop').click();release();held=false;});await p.waitForTimeout(300);assert.equal(await p.evaluate(()=>saves.length),0);assert.equal(await p.locator('input:checked').count(),0);
 await p.locator('.nodeLab').nth(1).click();await p.evaluate(()=>panel.getElementById('solve').click());await p.waitForFunction(()=>panel.getElementById('state').textContent.includes('全部答案已保存'));assert.equal(await p.evaluate(()=>messages.filter(m=>m.type==='solve').length),2);assert.equal(await p.evaluate(()=>submits),0);
}finally{await p.close();}});
test('空题干不发模型请求，考试路由和可见验证码阻止答题',async()=>{const p=await setup({work:true});try{
 assert.equal(await p.evaluate(()=>ZhihuishuLearning.questions()[0].payload.text),'第1题：模拟题干');await p.evaluate(()=>{document.querySelector('.stem-host').remove();panel.getElementById('solve').click();});await p.waitForTimeout(250);assert.equal(await p.evaluate(()=>messages.filter(m=>m.type==='solve').length),0);await p.evaluate(()=>panel.getElementById('stop').click());
 await p.evaluate(()=>{const f=document.createElement('iframe');f.src='https://turing.captcha.gtimg.com/1/template/drag_ele.html';document.body.append(f);});assert.equal(await p.evaluate(()=>ZhihuishuLearning.blocked()),true);
 assert.equal(await p.evaluate(()=>UoocPlatforms.study('https://onlineexamh5new.zhihuishu.com/stuExamWeb.html#/webExamList/doexam/1/2')),false);
}finally{await p.close();}});
test('网站支持的倍速和后续资源沿用，暂停后不恢复播放',async()=>{const p=await setup();try{
 await p.evaluate(()=>panel.getElementById('play').click());await p.waitForFunction(()=>running&&document.querySelector('video').playbackRate===1.5);assert.equal(await p.evaluate(()=>ZhihuishuLearning.title()),'模拟共享课程');
 await p.evaluate(()=>{ended=true;running=false;document.querySelector('video').dispatchEvent(new Event('ended'));});await p.waitForFunction(()=>document.querySelector('.current_play .hour').textContent==='1.3'&&running);assert.equal(await p.locator('video').evaluate(v=>v.playbackRate),1.5);
 await p.evaluate(()=>panel.getElementById('stop').click());await p.waitForTimeout(1700);assert.equal(await p.evaluate(()=>running),false);
}finally{await p.close();}});
test('真实页预加载验证码在屏幕外或父层透明时不阻塞网站倍速，实际显示时暂停',async()=>{const p=await setup();try{
 await p.evaluate(()=>{const wrapper=document.createElement('div');wrapper.id='captcha-wrap';wrapper.style.cssText='opacity:0;position:absolute;top:-1000000px';wrapper.innerHTML='<iframe src="https://turing.captcha.gtimg.com/1/template/drag_ele.html" width="300" height="150"></iframe>';document.body.append(wrapper);});
 assert.equal(await p.evaluate(()=>ZhihuishuLearning.blocked()),false);await p.evaluate(()=>panel.getElementById('play').click());await p.waitForFunction(()=>running&&document.querySelector('video').playbackRate===1.5);
 await p.evaluate(()=>document.querySelector('#captcha-wrap').style.cssText='position:fixed;top:30px;left:30px;opacity:0');assert.equal(await p.evaluate(()=>ZhihuishuLearning.blocked()),false);
 await p.evaluate(()=>document.querySelector('#captcha-wrap').style.cssText='position:fixed;top:-10000px;left:30px;opacity:1');assert.equal(await p.evaluate(()=>ZhihuishuLearning.blocked()),false);
 await p.evaluate(()=>document.querySelector('#captcha-wrap').style.cssText='position:fixed;top:30px;left:30px;opacity:1');await p.waitForFunction(()=>!running&&panel.getElementById('state').textContent.includes('验证'));assert.equal(await p.evaluate(()=>ZhihuishuLearning.blocked()),true);assert.equal(await p.evaluate(()=>messages.some(m=>m.type==='solve')),false);
 await p.evaluate(()=>document.querySelector('#captcha-wrap').remove());await p.waitForTimeout(1700);assert.equal(await p.evaluate(()=>running),false);await p.evaluate(()=>panel.getElementById('play').click());await p.waitForFunction(()=>running&&document.querySelector('video').playbackRate===1.5);
}finally{await p.close();}});
test('视频弹题自动选择、确认关闭并续播，已回答弹题不重复请求',async()=>{const p=await setup();try{
 await p.evaluate(()=>panel.getElementById('play').click());await p.waitForFunction(()=>running);await p.evaluate(()=>popup());await p.waitForFunction(()=>!document.querySelector('[role=dialog]')&&running,null,{timeout:15000});assert.equal(await p.evaluate(()=>messages.filter(m=>m.type==='solve').length),1);
 await p.evaluate(()=>popup(true));await p.waitForFunction(()=>!document.querySelector('[role=dialog]')&&running,null,{timeout:10000});assert.equal(await p.evaluate(()=>messages.filter(m=>m.type==='solve').length),1);
}finally{await p.close();}});
test('学习地址只保存课程标识，拒绝额外域名和重复参数',async()=>{const p=await setup();try{
 assert.equal(await p.evaluate(url=>UoocPlatforms.route(url+'&token=secret&uuid=user'),study),study);assert.equal(await p.evaluate(url=>UoocPlatforms.identity(url),study),'zhihuishu:demoCourse');assert.equal(await p.evaluate(()=>UoocPlatforms.study('https://studyvideoh5.zhihuishu.com.evil.example/stuStudy?recruitAndCourseId=x')),false);await assert.rejects(p.evaluate(url=>UoocPlatforms.route(url+'&recruitAndCourseId=other'),study));
}finally{await p.close();}});
test('网络故障有限重试，继续时不重复请求已确认题目',async()=>{const p=await setup({work:true,count:3});try{
 await p.evaluate(()=>{failAt=2;panel.getElementById('solve').click();});await p.waitForFunction(()=>panel.getElementById('state').textContent.includes('网络暂时异常'),null,{timeout:12000});assert.equal(await p.evaluate(()=>messages.filter(m=>m.type==='solve'&&m.question.text.startsWith('第2题')).length),2);
 await p.evaluate(()=>{failAt=0;panel.getElementById('solve').click();});await p.waitForFunction(()=>panel.getElementById('state').textContent.includes('全部答案已保存'));assert.equal(await p.evaluate(()=>messages.filter(m=>m.type==='solve'&&m.question.text.startsWith('第1题')).length),1);assert.equal(await p.evaluate(()=>submits),0);
}finally{await p.close();}});
test('实际关闭按钮型多选弹题，填写后才关闭；残留隐藏弹题不触发',async()=>{const p=await setup();try{
 await p.evaluate(()=>{popup();const d=document.querySelector('[role=dialog]');d.querySelector('.title-tit').textContent='【多选题】';d.querySelectorAll('.topic-item').forEach(row=>row.onclick=()=>row.querySelector('.item-topic').classList.toggle('active'));const btn=d.querySelector('.btn');btn.textContent='关闭';btn.onclick=()=>{window.popupAnswers=[...d.querySelectorAll('.topic-item')].flatMap((row,i)=>row.querySelector('.active')?[i]:[]);d.style.display='none';};panel.getElementById('play').click();});await p.waitForFunction(()=>running&&window.popupAnswers);assert.deepEqual(await p.evaluate(()=>popupAnswers),[0,2]);await p.waitForTimeout(1700);assert.equal(await p.evaluate(()=>messages.filter(m=>m.type==='solve').length),1);
 await p.evaluate(()=>{const d=document.querySelector('[role=dialog]');d.querySelectorAll('.topic-list .active').forEach(e=>e.classList.remove('active'));popupAnswers=null;running=false;d.style.display='block';});await p.waitForFunction(()=>running&&window.popupAnswers,null,{timeout:10000});assert.deepEqual(await p.evaluate(()=>popupAnswers),[0,2]);assert.equal(await p.evaluate(()=>messages.filter(m=>m.type==='solve').length),2);
}finally{await p.close();}});
test('多页视频弹题全部填写后才关闭',async()=>{const p=await setup();try{
 await p.evaluate(()=>{popup();const d=document.querySelector('[role=dialog]');const pager=document.createElement('div');pager.className='el-pagination';pager.innerHTML='<ul class="el-pager"><li class="number active">1</li><li class="number">2</li></ul>';d.querySelector('.topic').prepend(pager);window.pagesAnswered=[];pager.querySelectorAll('.number').forEach(e=>e.onclick=()=>{pagesAnswered.push(1);pager.querySelector('.active').classList.remove('active');e.classList.add('active');d.querySelector('.topic-title span:last-child').textContent='第2题：模拟第二页弹题';d.querySelectorAll('.item-topic.active').forEach(e=>e.classList.remove('active'));});const btn=d.querySelector('.btn');btn.textContent='关闭';btn.onclick=()=>{pagesAnswered.push(2);d.remove();};panel.getElementById('play').click();});
 await p.waitForFunction(()=>running&&!document.querySelector('[role=dialog]'),null,{timeout:15000}).catch(async error=>{console.error(await p.evaluate(()=>({state:panel.getElementById('state').textContent,phase:panel.getElementById('taskProgress').textContent,pages:pagesAnswered,calls:messages.filter(m=>m.type==='solve').length,visible:ZhihuishuLearning.questions().length,active:document.querySelector('.el-pager .number.active')?.textContent,stem:ZhihuishuLearning.questions()[0]?.payload.text})));throw error;});assert.equal(await p.evaluate(()=>messages.filter(m=>m.type==='solve').length),2);assert.deepEqual(await p.evaluate(()=>pagesAnswered),[1,2]);
}finally{await p.close();}});

test('默认二倍速仅在智慧树本页降为网站1.5倍速，通过网站按钮且不写defaultPlaybackRate',async()=>{const p=await setup();try{
 await p.evaluate(()=>panel.getElementById('play').click());await p.waitForFunction(()=>running);
 assert.deepEqual(await p.evaluate(()=>rateClicks),[1.5]);assert.equal(await p.locator('video').evaluate(v=>v.defaultPlaybackRate),1);
 assert.equal(await p.evaluate(()=>panel.getElementById('rate').querySelector('[value="2"]').disabled),true);
 assert.equal(await p.evaluate(()=>messages.filter(m=>m.type==='settingsPatch').length),0);
 await p.waitForTimeout(1700);assert.deepEqual(await p.evaluate(()=>rateClicks),[1.5]);
}finally{await p.close();}});

test('网站异常脚本提示出现后暂停，不修改提示，不重复请求或恢复',async()=>{const p=await setup();try{
 await p.evaluate(()=>{const box=document.createElement('div');box.className='el-message-box';box.style.cssText='position:fixed;top:20px;left:20px';box.textContent='检测到异常脚本，为保证您的正常学习进度，请您关闭插件后，回到学堂重新进入视频学习页正常学习';document.body.append(box);box.style.display='none';});
 assert.equal(await p.evaluate(()=>ZhihuishuLearning.blocked()),false);
 await p.evaluate(()=>panel.getElementById('play').click());await p.waitForFunction(()=>running);
 await p.evaluate(()=>document.querySelector('.el-message-box').style.display='block');
 await p.waitForFunction(()=>!running&&panel.getElementById('state').textContent.includes('网站检测到异常脚本'));
 assert.equal(await p.locator('.el-message-box').isVisible(),true);assert.equal(await p.evaluate(()=>messages.filter(m=>m.type==='solve').length),0);
 await p.evaluate(()=>document.querySelector('.el-message-box').remove());await p.waitForTimeout(1700);assert.equal(await p.evaluate(()=>running),false);
}finally{await p.close();}});

test('网站倍速入口缺失时暂停，不直接改播放器属性',async()=>{const p=await setup();try{
 await p.locator('.speedBox').evaluate(e=>e.remove());await p.evaluate(()=>panel.getElementById('play').click());
 await p.waitForFunction(()=>panel.getElementById('state').textContent.includes('未找到唯一的网站倍速按钮'));
 assert.equal(await p.locator('video').evaluate(v=>v.playbackRate),1);assert.equal(await p.evaluate(()=>running),false);
}finally{await p.close();}});

test('真实关闭按钮弹题：选项立即反馈正确状态，AI仅请求一次并关闭续播',async()=>{const p=await setup();try{
 await p.evaluate(()=>{popup();const d=document.querySelector('[role=dialog]');d.className='el-dialog';d.querySelector('.btn').textContent='关闭';window.closeCount=0;
 d.querySelectorAll('.topic-item').forEach(row=>row.onclick=()=>{d.querySelectorAll('.topic-list .active').forEach(e=>e.classList.remove('active'));row.querySelector('.item-topic').classList.add('active');const title=d.querySelector('.topic-title');if(!title.querySelector('.success'))title.insertAdjacentHTML('afterbegin','<span><span class="success">正确</span></span>');if(!d.querySelector('.answer'))d.querySelector('.radio').insertAdjacentHTML('beforeend','<p class="answer">正确答案：B</p>');});
 d.querySelector('.btn').onclick=()=>{window.closeSelection=[...d.querySelectorAll('.topic-item')].flatMap((e,i)=>e.querySelector('.active')?[i]:[]);closeCount++;d.style.display='none';};panel.getElementById('play').click();});
 await p.waitForFunction(()=>running&&closeCount===1,null,{timeout:15000});assert.deepEqual(await p.evaluate(()=>closeSelection),[1]);assert.equal(await p.evaluate(()=>messages.filter(m=>m.type==='solve').length),1);
}finally{await p.close();}});

test('暂停后Vue重建选项不误判人工清空，重新分析并关闭弹题续播',async()=>{const p=await setup();try{
 await p.evaluate(()=>{popup();panel.getElementById('play').click();});await p.waitForFunction(()=>panel.getElementById('state').textContent==='已填写 1/1 题');await p.evaluate(()=>panel.getElementById('stop').click());
 await p.evaluate(()=>{document.querySelectorAll('.topic-item').forEach(row=>{const clone=row.cloneNode(true);clone.querySelectorAll('.active').forEach(e=>e.classList.remove('active'));clone.onclick=()=>{document.querySelectorAll('.topic-list .active').forEach(e=>e.classList.remove('active'));clone.querySelector('.item-topic').classList.add('active');};row.replaceWith(clone);});panel.getElementById('play').click();});
 await p.waitForFunction(()=>running&&!document.querySelector('[role=dialog]'),null,{timeout:15000});assert.equal(await p.evaluate(()=>messages.filter(m=>m.type==='solve').length),2);
}finally{await p.close();}});

test('同一弹窗同题关闭重开时清理旧断点，保留同次弹题内人工清空保护',async()=>{const p=await setup();try{
 await p.evaluate(()=>{popup();panel.getElementById('play').click();});await p.waitForFunction(()=>panel.getElementById('state').textContent==='已填写 1/1 题');await p.evaluate(()=>panel.getElementById('stop').click());
 await p.evaluate(()=>{document.querySelectorAll('.topic-list .active').forEach(e=>e.classList.remove('active'));panel.getElementById('play').click();});
 await p.waitForFunction(()=>panel.getElementById('state').textContent.includes('已修改的答案尚未完整'));assert.equal(await p.evaluate(()=>messages.filter(m=>m.type==='solve').length),1);
 await p.evaluate(()=>document.querySelector('[role=dialog]').style.display='none');await p.waitForTimeout(50);
 await p.evaluate(()=>{document.querySelector('[role=dialog]').style.display='block';panel.getElementById('play').click();});
 await p.waitForFunction(()=>running&&!document.querySelector('[role=dialog]'),null,{timeout:15000});assert.equal(await p.evaluate(()=>messages.filter(m=>m.type==='solve').length),2);
}finally{await p.close();}});

test('弹题模型请求途中关闭重开同题，迟到答案不写入新一轮弹题',async()=>{const p=await setup();try{
 await p.evaluate(()=>{held=true;popup();panel.getElementById('play').click();});await p.waitForFunction(()=>typeof release==='function');
 await p.evaluate(()=>document.querySelector('[role=dialog]').style.display='none');await p.waitForTimeout(50);
 await p.evaluate(()=>{document.querySelector('[role=dialog]').style.display='block';release();});
 await p.waitForFunction(()=>panel.getElementById('state').textContent.includes('题目页面已变化'));assert.equal(await p.locator('.topic-list .active').count(),0);assert.equal(await p.evaluate(()=>running),false);
}finally{await p.close();}});


test('多选填写期间同DOM弹题重开，旧请求不能填写剩余选项',async()=>{const p=await setup();try{
 await p.evaluate(()=>{popup();const d=document.querySelector('[role=dialog]');d.querySelector('.title-tit').textContent='【多选题】';d.querySelectorAll('.topic-item').forEach(row=>row.onclick=()=>row.querySelector('.item-topic').classList.toggle('active'));panel.getElementById('play').click();});
 await p.waitForFunction(()=>document.querySelector('.topic-item .item-topic.active'));
 await p.evaluate(()=>document.querySelector('[role=dialog]').style.display='none');await p.waitForTimeout(30);await p.evaluate(()=>document.querySelector('[role=dialog]').style.display='block');
 await p.waitForFunction(()=>panel.getElementById('state').textContent.includes('弹题已关闭或重新打开'));
 assert.equal(await p.locator('.topic-item').nth(2).locator('.active').count(),0);assert.equal(await p.evaluate(()=>running),false);
}finally{await p.close();}});


test('轮询未运行时网站弹出异常提示，立即取消待完成AI并保留弹题',async()=>{const p=await setup({noPolling:true});try{
 await p.evaluate(()=>{held=true;popup();panel.getElementById('play').click();});await p.waitForFunction(()=>typeof release==='function');
 await p.evaluate(()=>{window.cancelBefore=messages.filter(m=>m.type==='cancelRequests').length;const box=document.createElement('div');box.className='el-message-box';box.style.cssText='position:fixed;top:30px;left:30px';box.textContent='检测到异常脚本';document.body.append(box);});
 await p.waitForFunction(()=>panel.getElementById('state').textContent.includes('网站检测到异常脚本'),null,{timeout:1000});
 assert.equal(await p.evaluate(()=>messages.filter(m=>m.type==='cancelRequests').length),await p.evaluate(()=>cancelBefore+1));
 await p.evaluate(()=>release());await p.waitForTimeout(450);assert.equal(await p.locator('.topic-list .active').count(),0);assert.equal(await p.locator('.el-message-box').isVisible(),true);assert.equal(await p.locator('[role=dialog]').isVisible(),true);assert.equal(await p.evaluate(()=>running),false);
 await p.locator('.el-message-box').evaluate(e=>e.remove());await p.waitForTimeout(200);assert.equal(await p.evaluate(()=>running),false);
}finally{await p.close();}});

test('点击关闭时网站发出异常提示，不重复关闭、不恢复视频',async()=>{const p=await setup({noPolling:true});try{
 await p.evaluate(()=>{popup(true);window.closeCalls=0;document.querySelector('[role=dialog] .btn').onclick=()=>{closeCalls++;const box=document.createElement('div');box.className='el-message-box';box.style.cssText='position:fixed;top:30px;left:30px';box.textContent='检测到异常脚本';document.body.append(box);};panel.getElementById('play').click();});
 await p.waitForFunction(()=>panel.getElementById('state').textContent.includes('网站检测到异常脚本'),null,{timeout:3000});await p.waitForTimeout(450);
 assert.equal(await p.evaluate(()=>closeCalls),1);assert.equal(await p.evaluate(()=>running),false);assert.equal(await p.evaluate(()=>messages.filter(m=>m.type==='solve').length),0);assert.equal(await p.locator('.el-message-box').isVisible(),true);
}finally{await p.close();}});

test('弹题选项与关闭按钮补齐鼠标按下抬起顺序，每个控件只点击一次',async()=>{const p=await setup();try{
 await p.evaluate(()=>{popup();const d=document.querySelector('[role=dialog]');window.controlEvents=[];const types=['pointerdown','mousedown','pointerup','mouseup','click'];const option=d.querySelectorAll('.topic-item')[1],close=d.querySelector('.btn');
 for(const [node,label] of [[option,'option'],[close,'close']]){for(const type of types)node.addEventListener(type,e=>controlEvents.push({label,type,trusted:e.isTrusted,buttons:e.buttons}));node.onmousedown=()=>node.dataset.pressed='yes';}
 const select=option.onclick;option.onclick=()=>{if(option.dataset.pressed==='yes')select();};close.textContent='关闭';close.onclick=()=>{if(close.dataset.pressed==='yes')d.remove();};panel.getElementById('play').click();});
 await p.waitForFunction(()=>running&&!document.querySelector('[role=dialog]'),null,{timeout:15000});
 const events=await p.evaluate(()=>controlEvents);for(const label of ['option','close'])assert.deepEqual(events.filter(e=>e.label===label).map(e=>e.type),['pointerdown','mousedown','pointerup','mouseup','click']);assert.equal(events.every(e=>e.trusted===false),true);assert.equal(events.filter(e=>e.type==='mousedown').every(e=>e.buttons===1),true);assert.equal(events.filter(e=>e.type==='mouseup').every(e=>e.buttons===0),true);assert.equal(await p.evaluate(()=>messages.filter(m=>m.type==='solve').length),1);
}finally{await p.close();}});

test('鼠标按下期间网站提示异常，停止剩余鼠标事件且不选择答案',async()=>{const p=await setup({noPolling:true});try{
 await p.evaluate(()=>{popup();window.clicksAfterWarning=0;document.querySelectorAll('.topic-item').forEach(row=>{row.onmousedown=()=>{const box=document.createElement('div');box.className='el-message-box';box.style.cssText='position:fixed;top:30px;left:30px';box.textContent='检测到异常脚本';document.body.append(box);};row.addEventListener('click',()=>clicksAfterWarning++);});panel.getElementById('play').click();});
 await p.waitForFunction(()=>panel.getElementById('state').textContent.includes('网站检测到异常脚本'),null,{timeout:5000});assert.equal(await p.evaluate(()=>clicksAfterWarning),0);assert.equal(await p.locator('.topic-list .active').count(),0);assert.equal(await p.evaluate(()=>running),false);assert.equal(await p.locator('.el-message-box').isVisible(),true);
}finally{await p.close();}});

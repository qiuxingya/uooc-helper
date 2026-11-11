const {test,before,after}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');const {chromium}=require('playwright');const {score,course}=require('./grades-env.cjs');let browser;
before(async()=>browser=await chromium.launch({channel:'msedge',headless:true}));after(async()=>browser?.close());
async function setup(data){const p=await browser.newPage({viewport:{width:1180,height:900}});await p.setContent(fs.readFileSync('grades.html','utf8').replace(/<script.*?<\/script>/g,''));await p.addStyleTag({content:fs.readFileSync('grades.css','utf8')});await p.evaluate(data=>{window.info=data;window.messages=[];window.chrome={runtime:{openOptionsPage:()=>{},sendMessage:async m=>{window.messages.push(m);return {result:['gradesGet','cxGradesGet'].includes(m.type)?window.info:{}};}},storage:{onChanged:{addListener:fn=>window.changed=fn}}};},data);await p.addScriptTag({content:fs.readFileSync('grades.js','utf8')});await p.waitForFunction(()=>document.querySelector('#courseCount').textContent.includes('/'));return p;}
function data(){return {verified:true,job:{status:'done',done:2,total:2},courses:[{...course('301'),name:'演示课程甲',snapshot:{...score(13.1),updatedAt:Date.now()},seenAt:Date.now()},{...course('302','finish'),name:'演示课程乙',snapshot:{...score(0),final:{state:'unpublished',value:null},updatedAt:Date.now()},lastError:'PAGE_TIMEOUT',lastAttempt:Date.now(),seenAt:Date.now()},{...course('303','nostart'),name:'未开始课程',snapshot:null,seenAt:Date.now()}]};}
test('课程摘要按当前平台计数，数据状态与搜索可组合',async()=>{
 const demo=data();demo.courses[0].snapshot.progress.value=100;demo.courses[1].snapshot.progress.value=null;
 const p=await setup(demo);
 try{
  assert.equal(await p.locator('#totalCourses').textContent(),'3');
  assert.equal(await p.locator('#completedCourses').textContent(),'1');
  assert.equal(await p.locator('#attentionCourses').textContent(),'2');
  await p.locator('#dataFilter').selectOption('failed');
  assert.equal(await p.locator('.course-card').count(),1);
  assert.equal(await p.locator('#totalCourses').textContent(),'3');
  await p.locator('#search').fill('课程甲');
  assert.equal(await p.locator('.course-card').count(),0);
  await p.locator('#search').fill('');await p.locator('#dataFilter').selectOption('unread');
  assert.equal(await p.locator('.course-card h2').textContent(),'未开始课程');
 }finally{await p.close();}
});
test('全部排序保持同值顺序，0 分有效，缺失值排最后',async()=>{
 const demo={verified:true,job:null,courses:[
  {...course('301'),name:'课程C',order:1,snapshot:{...score(0),progress:{value:0},updatedAt:30}},
  {...course('302'),name:'课程A',order:3,snapshot:{...score(50),progress:{value:100},updatedAt:10}},
  {...course('303'),name:'课程B',order:2,snapshot:{...score(50),progress:{value:100},updatedAt:20}},
  {...course('304'),name:'课程D',order:4,snapshot:null},
  {...course('305'),name:'课程E',order:0,snapshot:{...score(),current:{state:'unpublished'},progress:{value:null},updatedAt:40}}
 ]};
 const p=await setup(demo);
 try{
  const expected={
   website:['305','301','303','302','304'],name:['302','303','301','304','305'],
   progressAsc:['301','303','302','305','304'],progressDesc:['303','302','301','305','304'],
   scoreDesc:['303','302','301','305','304'],updatedDesc:['305','301','303','302','304']
  };
  for(const [sort,ids]of Object.entries(expected)){
   await p.locator('#sort').selectOption(sort);
   assert.deepEqual(await p.locator('.course-card').evaluateAll(cards=>cards.map(card=>card.dataset.cycle)),ids);
  }
 }finally{await p.close();}
});
test('筛选隐藏课程、轮询更新及平台往返均保留展开和查找状态',async()=>{
 const demo=data(),p=await setup(demo);
 try{
  await p.locator('summary').first().click();
  await p.locator('#dataFilter').selectOption('failed');
  await p.locator('#dataFilter').selectOption('all');
  assert.equal(await p.locator('.course-card').first().locator('details').getAttribute('open'),'');
  await p.locator('#search').fill('课程甲');await p.locator('#sort').selectOption('name');
  await p.evaluate(()=>changed({gradeCache:{}},'local'));
  await p.waitForFunction(()=>document.getElementById('readStatus').hidden);
  await p.evaluate(()=>window.info={verified:true,courses:[{cycleId:'10:20',name:'学习通示例',status:'learn'}],job:null});
  await p.locator('#platform').selectOption('chaoxing');
  await p.locator('#search').fill('学习通');
  await p.evaluate(demo=>window.info=demo,demo);
  await p.locator('#platform').selectOption('uooc');
  assert.equal(await p.locator('#search').inputValue(),'课程甲');
  assert.equal(await p.locator('#sort').inputValue(),'name');
  assert.equal(await p.locator('details[open]').count(),1);
  await p.locator('#platform').selectOption('chaoxing');
  assert.equal(await p.locator('#search').inputValue(),'学习通');
 }finally{await p.close();}
});
test('课程处理进度有真实计数，最终核对阶段仍显示未完成',async()=>{
 const demo=data();demo.verified=false;demo.job={status:'running',phase:'list',found:2};
 const p=await setup(demo);
 try{
  assert.equal(await p.locator('#scanProgress').getAttribute('value'),null);
  await p.evaluate(()=>{info.job={status:'running',phase:'score',done:1,total:2,currentCourse:{name:'当前课程'}};changed({gradeJob:{}},'session');});
  await p.waitForFunction(()=>document.getElementById('scanProgress').getAttribute('value')==='1');
  assert.equal(await p.locator('#scanProgress').getAttribute('max'),'2');
  assert.match(await p.locator('#scanStatus').textContent(),/当前课程.*已处理 1 \/ 2/);
  await p.evaluate(()=>{info.job={status:'running',phase:'account',done:2,total:2};changed({gradeJob:{}},'session');});
  await p.getByText('正在核对账号，尚未完成刷新。',{exact:true}).waitFor();
  assert.equal(await p.locator('#scanProgress').getAttribute('value'),null);
  await p.evaluate(()=>{info.job={status:'done',done:2,total:2};info.verified=true;changed({gradeJob:{}},'session');});
  await p.waitForFunction(()=>document.getElementById('scanProgress').hidden);
  assert.match(await p.locator('#scanStatus').textContent(),/刷新完成/);
 }finally{await p.close();}
});
test('集中重试不受课程筛选影响，仅传后台选择标识',async()=>{
 const p=await setup(data());
 try{
  await p.locator('#search').fill('课程甲');
  await p.locator('#retryFailed').click();
  const request=await p.evaluate(()=>messages.find(message=>message.type==='gradesStart'));
  assert.equal(request.retryFailed,true);
  assert.equal(Object.hasOwn(request,'cycleId'),false);
 }finally{await p.close();}
});
test('没有失败课的后台回复显示说明，固定错误码决定失败文字',async()=>{
 const demo=data();demo.job={status:'failed',phase:'score',errorCode:'PAGE_TIMEOUT',error:'unexpected text'};
 const p=await setup(demo);
 try{
  assert.match(await p.locator('#scanStatus').textContent(),/页面读取超时/);
  await p.evaluate(()=>{
   const original=chrome.runtime.sendMessage;
   chrome.runtime.sendMessage=async message=>message.type==='gradesStart'?{result:{started:false,code:'NO_FAILED_COURSES'}}:original(message);
  });
  await p.locator('#retryFailed').click();
  await p.getByText('没有需要重试的课程。',{exact:true}).waitFor();
 }finally{await p.close();}
});
test('overview separates current/final scores, zeros, unread and stale failed snapshots',async()=>{const p=await setup(data());try{await p.locator('.course-card').first().waitFor();assert.equal(await p.locator('.course-card').count(),3);assert.equal(await p.locator('.course-card').first().locator('.metric strong').nth(1).innerText(),'13.1');assert.equal(await p.locator('.course-card').first().locator('.metric strong').nth(2).innerText(),'网站未显示');assert.equal(await p.locator('.course-card').nth(1).locator('.metric strong').nth(1).innerText(),'0');assert.equal(await p.locator('.course-card').nth(1).locator('.metric strong').nth(2).innerText(),'未公布');assert.match(await p.locator('.failure').innerText(),/旧快照/);assert.equal(await p.locator('.course-card').nth(2).locator('.metric strong').nth(1).innerText(),'未读取');
 await p.locator('details').first().evaluate(e=>e.open=true);await p.screenshot({path:'.test-artifacts/课程成绩总览预览.png',fullPage:true});await p.setViewportSize({width:390,height:844});await p.screenshot({path:'.test-artifacts/课程成绩手机预览.png',fullPage:true});assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
 }finally{await p.close();}});
test('search and course status filter work and titles are rendered as text',async()=>{const d=data();d.courses[0].name='<img onerror=alert(1)>演示课程甲';const p=await setup(d);try{await p.locator('.course-card').first().waitFor();assert.equal(await p.locator('.course-card img').count(),0);await p.locator('#search').fill('课程乙');assert.equal(await p.locator('.course-card').count(),1);await p.locator('#filter').selectOption('nostart');assert.equal(await p.locator('.course-card').count(),0);assert.match(await p.locator('#empty').innerText(),/筛选/);}finally{await p.close();}});
test('unverified state hides even supplied cached grades and running job exposes cancel',async()=>{const d=data();d.verified=false;d.job={status:'running',phase:'list',found:2};const p=await setup(d);try{assert.equal(await p.locator('.course-card').count(),0);assert.equal(await p.locator('#refresh').isDisabled(),true);assert.equal(await p.locator('#cancel').isVisible(),true);await p.locator('#cancel').click();assert.ok((await p.evaluate(()=>window.messages)).some(m=>m.type==='gradesCancel'));}finally{await p.close();}});

test('Chaoxing UI preserves weighted fields, zero and task progress with a validated grade link',async()=>{
 const d={verified:true,job:{status:'done',done:1,total:1},courses:[{cycleId:'10:20',name:'演示学习通课程',status:'learn',scoreUrl:'https://stat2-ans.chaoxing.com/stat2/overall-score/stu-score?courseid=10&clazzid=20&cpi=99&ut=s',snapshot:{current:{state:'value',value:0},final:{state:'unpublished',value:null},progress:{value:75,source:'网站章节任务点'},updatedAt:Date.now(),rows:[{label:'章节任务点',weight:{state:'value',value:40},weighted:{state:'value',value:30},classAverage:{state:'value',value:20}}]}}]};
 const p=await setup(d);try{await p.locator('#platform').selectOption('chaoxing');await p.locator('.course-card').waitFor();assert.match(await p.locator('.course-card').innerText(),/综合成绩/);assert.equal(await p.locator('.metric strong').nth(1).innerText(),'0');assert.equal(await p.locator('.metric progress').getAttribute('aria-label'),'章节任务点完成度');assert.equal(await p.locator('.course-actions a').getAttribute('href'),d.courses[0].scoreUrl);await p.locator('summary').click();assert.match(await p.locator('tbody').innerText(),/40%/);assert.match(await p.locator('thead').innerText(),/班级平均（加权）/);assert.equal(await p.locator('tbody tr td').nth(6).innerText(),'30');}finally{await p.close();}
});

test('Chaoxing cached grade links reject external sites, extra parameters and another course',async()=>{
 const urls=['https://evil.example/score','https://stat2-ans.chaoxing.com/stat2/overall-score/stu-score?courseid=11&clazzid=20&cpi=99&ut=s','https://stat2-ans.chaoxing.com/stat2/overall-score/stu-score?courseid=10&clazzid=20&cpi=99&ut=s&token=private'];
 const p=await setup({verified:true,job:{status:'failed',phase:'verify',error:'PAGE_TIMEOUT'},courses:urls.map((scoreUrl,i)=>({cycleId:'10:'+String(20+i),name:'示例'+i,status:'learn',scoreUrl,snapshot:null}))});try{await p.locator('#platform').selectOption('chaoxing');await p.locator('.course-card').first().waitFor();assert.equal(await p.locator('.course-actions a[href]').count(),0);assert.equal(await p.locator('.course-actions a[aria-disabled=true]').count(),3);assert.match(await p.locator('#scanStatus').innerText(),/页面读取超时/);assert.match(await p.locator('#scanStatus').innerText(),/账号复核/);assert.ok(!(await p.locator('#scanStatus').innerText()).includes('PAGE_TIMEOUT'));}finally{await p.close();}
});


test('未知进度没有零值进度条，真实 0% 与完成项数仍展示',async()=>{const d=data();d.courses[0].snapshot.progress={value:0,source:'tasks',done:0,total:8};d.courses[1].snapshot.progress={value:null,source:'none'};const p=await setup(d);try{assert.equal(await p.locator('.course-card').first().locator('progress').getAttribute('value'),'0');assert.match(await p.locator('.course-card').first().innerText(),/已完成 0 \/ 8 项/);assert.equal(await p.locator('.course-card').nth(1).locator('progress').count(),0);assert.match(await p.locator('.course-card').nth(1).innerText(),/暂无数据/);}finally{await p.close();}});

test('优课识别全角官方百分比，缺少官方值时提供有效的完成数和总数',async()=>{const {table}=require('./grading-fixtures.cjs'),p=await browser.newPage();try{await p.setContent(table({percent:'２９'}).replace('２９%','２９％'));await p.addScriptTag({content:fs.readFileSync('course-parser.js','utf8')});assert.deepEqual(await p.evaluate(()=>UoocCourseParser.readScore().progress),{value:29,source:'website'});await p.setContent(table({official:false}));const progress=await p.evaluate(()=>UoocCourseParser.readScore().progress);assert.equal(progress.source,'tasks');assert.ok(progress.total>0);assert.equal(progress.value,Math.round(progress.done/progress.total*10000)/100);}finally{await p.close();}});

test('优课成绩明确未公布时仍保留官方进度，加载占位继续等待',async()=>{
 const p=await browser.newPage();
 try{
  await p.setContent('<p>您已完成：４２％</p><p>正在加载成绩</p>');
  await p.addScriptTag({content:fs.readFileSync('course-parser.js','utf8')});
  assert.equal(await p.evaluate(()=>UoocCourseParser.readScore()),null);
  await p.locator('p').last().evaluate(e=>e.textContent='成绩尚未公布');
  const result=await p.evaluate(()=>UoocCourseParser.readScore());
  assert.equal(result.final.state,'unpublished');
  assert.deepEqual(result.progress,{value:42,source:'website'});
 }finally{await p.close();}
});

test('切换平台时不等待旧读取，旧响应不能覆盖学习通结果',async()=>{
 const original=data(),p=await setup(original);
 try{
  await p.locator('#filter').selectOption('nostart');
  await p.evaluate(({original,course})=>{
   chrome.runtime.sendMessage=m=>m.type==='gradesGet'
    ?new Promise(resolve=>window.finishUooc=()=>resolve({result:original}))
    :Promise.resolve({result:{verified:true,courses:[course],job:null}});
   changed({gradeCache:{}},'local');
  },{original,course:{cycleId:'10:20',name:'当前学习通课程',status:'learn'}});
  await p.locator('#platform').selectOption('chaoxing');
  await p.getByRole('heading',{name:'当前学习通课程'}).waitFor();
  await p.evaluate(async()=>{finishUooc();await new Promise(resolve=>setTimeout(resolve,0));});
  assert.equal(await p.locator('#filter').inputValue(),'all');
  assert.equal(await p.locator('.course-card h2').allTextContents().then(names=>names.join()),'当前学习通课程');
 }finally{await p.close();}
});

test('退出登录立即隐藏成绩，在途旧账号结果不能重新显示',async()=>{
 const p=await setup(data());
 try{
  await p.evaluate(()=>{
   let requests=0;
   chrome.runtime.sendMessage=()=>++requests===1
    ?new Promise(resolve=>window.finishOld=()=>resolve({result:window.info}))
    :Promise.resolve({result:{verified:false,courses:[],job:null}});
   changed({gradeCache:{}},'local');
   changed({gradeAccount:{oldValue:{hash:'old'}}},'session');
  });
  assert.equal(await p.locator('.course-card').count(),0);
  await p.evaluate(async()=>{finishOld();await new Promise(resolve=>setTimeout(resolve,0));});
  assert.equal(await p.locator('.course-card').count(),0);
  assert.equal(await p.locator('#accountState').textContent(),'等待确认账号');
 }finally{await p.close();}
});

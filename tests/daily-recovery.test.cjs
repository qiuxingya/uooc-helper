const {test,before,after}=require('node:test');
const assert=require('node:assert/strict'),fs=require('node:fs');
const {chromium}=require('playwright');
let browser;
before(async()=>browser=await chromium.launch({channel:'msedge',headless:true}));
after(async()=>browser?.close());
const record=(id=1)=>({url:'https://www.uooc.net.cn/home/course/'+id,title:'演示课程 '+id,chapter:'第一章',seconds:90,time:Date.now()});
const overview=()=>({today:{milliseconds:3600000,videos:1},recent30:{milliseconds:7200000,videos:2},recent:Array.from({length:5},(_,index)=>record(index+1))});
const grades=()=>({verified:true,job:{status:'done',done:1,total:1},courses:[{cycleId:'301',name:'演示课程',status:'learn',snapshot:null}]});
async function setup(kind,payload,initialFailure=false){
 const p=await browser.newPage({viewport:kind==='popup'?{width:360,height:580}:{width:1180,height:900}});
 await p.setContent(fs.readFileSync(kind+'.html','utf8').replace(/<script.*?<\/script>/gs,''));
 await p.addStyleTag({content:fs.readFileSync(kind+'.css','utf8')});
 await p.evaluate(({payload,initialFailure})=>{
  window.payload=payload;window.requests=[];
  window.responder=message=>initialFailure?Promise.reject(Error('初次读取失败')):Promise.resolve({result:['overview','gradesGet','cxGradesGet'].includes(message.type)?window.payload:{}});
  window.confirm=()=>true;
  window.chrome={runtime:{openOptionsPage:()=>{},sendMessage:message=>{requests.push(message);return responder(message);}},storage:{onChanged:{addListener:fn=>window.changed=fn,removeListener:()=>{}}}};
  const start=window.setTimeout.bind(window),stop=window.clearTimeout.bind(window),timers=new Map();
  window.setTimeout=(fn,ms,...args)=>{
   const id=start(fn,ms,...args);
   if(ms===12000)timers.set(id,()=>fn(...args));
   return id;
  };
  window.clearTimeout=id=>{timers.delete(id);stop(id);};
  window.expireRequests=()=>{const pending=[...timers];timers.clear();for(const [id,fn]of pending){stop(id);fn();}};
 },{payload,initialFailure});
 if(kind==='popup')await p.addScriptTag({content:fs.readFileSync('platforms.js','utf8')});
 await p.addScriptTag({content:fs.readFileSync(kind+'.js','utf8')});
 await p.waitForFunction(({kind,initialFailure})=>initialFailure
  ?document.getElementById(kind==='popup'?'reloadOverview':'reloadGrades')?.hidden===false
  :kind==='popup'?document.getElementById('status').textContent==='':document.getElementById('courseCount').textContent.includes('/'),{kind,initialFailure});
 return p;
}
test('概览逐条跳过异常记录，保留有效课程和统计',async()=>{
 const data=overview();data.recent=[record(),null,{...record(),url:'invalid'},{...record(),url:'https://evil.example/course'},{...record(),seconds:'90'},{...record(),time:Infinity},record(2)];
 const p=await setup('popup',data);
 try{
  assert.equal(await p.locator('.course').count(),2);
  assert.equal(await p.locator('#todayTime').textContent(),'1 小时 0 分');
  assert.equal(await p.locator('#status').textContent(),'');
  assert.equal(await p.locator('#expandRecent').isVisible(),false);
 }finally{await p.close();}
});
test('全部记录无效时显示空状态',async()=>{
 const data=overview();data.recent=[null,{...record(),url:'invalid'}];
 const p=await setup('popup',data);
 try{assert.equal(await p.locator('.course').count(),0);assert.match(await p.locator('#recent').textContent(),/没有可显示的学习记录/);}
 finally{await p.close();}
});
test('合并连续通知，刷新保留展开状态且只读取本机记录',async()=>{
 const p=await setup('popup',overview());
 try{
  await p.locator('#expandRecent').click();
  await p.evaluate(()=>{
   for(let index=0;index<10;index++)changed({activityData:{}},'local');
   changed({gradeCache:{}},'local');changed({gradeAccount:{}},'session');
  });
  await p.waitForFunction(()=>requests.length===2);
  assert.equal(await p.locator('.course:visible').count(),5);
  assert.equal(await p.locator('#expandRecent').textContent(),'收起记录');
  assert.deepEqual(await p.evaluate(()=>requests.map(message=>message.type)),['overview','overview']);
 }finally{await p.close();}
});
test('后台更新失败保留已有结果，键盘重试后清除错误',async()=>{
 const p=await setup('popup',overview());
 try{
  await p.evaluate(()=>{responder=()=>Promise.reject(Error('模拟网络失败'));changed({activityData:{}},'local');});
  await p.getByText('更新失败，保留上次读取结果。模拟网络失败',{exact:true}).waitFor();
  assert.equal(await p.locator('.course').count(),5);
  await p.evaluate(()=>responder=()=>Promise.resolve({result:payload}));
  await p.locator('#reloadOverview').press('Enter');
  await p.waitForFunction(()=>document.getElementById('status').textContent==='');
  assert.equal(await p.locator('#reloadOverview').isVisible(),false);
  assert.equal(await p.locator('.course').count(),5);
 }finally{await p.close();}
});
for(const kind of ['popup','grades'])test(kind+' 初次读取失败提供键盘重试',async()=>{
 const p=await setup(kind,kind==='popup'?overview():grades(),true);
 try{
  const button=p.locator(kind==='popup'?'#reloadOverview':'#reloadGrades');
  await p.evaluate(()=>responder=()=>Promise.resolve({result:payload}));
  await button.press('Enter');
  await p.waitForFunction(kind=>document.getElementById(kind==='popup'?'status':'error').textContent==='',kind);
  assert.equal(await button.isVisible(),false);
  assert.ok(await p.locator(kind==='popup'?'.course':'.course-card').count()>0);
 }finally{await p.close();}
});
test('超时与迟到结果不覆盖新版概览',async()=>{
 const p=await setup('popup',overview());
 try{
  await p.evaluate(()=>{
   responder=()=>new Promise(resolve=>window.releaseOld=resolve);
   changed({activityData:{}},'local');
  });
  await p.waitForFunction(()=>!!window.releaseOld);
  await p.evaluate(()=>expireRequests());
  await p.locator('#reloadOverview').waitFor();
  await p.evaluate(()=>{payload.recent=[{...payload.recent[0],title:'最新课程'}];responder=()=>Promise.resolve({result:payload});});
  await p.locator('#reloadOverview').click();
  await p.getByText('最新课程',{exact:true}).waitFor();
  await p.evaluate(async()=>{releaseOld({result:{...payload,recent:[]}});await new Promise(resolve=>setTimeout(resolve,0));});
  assert.equal(await p.locator('.course strong').textContent(),'最新课程');
 }finally{await p.close();}
});
test('存储变化后立即丢弃旧读取结果，合并等待期间也不覆盖当前记录',async()=>{
 const p=await setup('popup',overview());
 try{
  await p.evaluate(()=>{
   responder=()=>new Promise(resolve=>window.releaseOld=resolve);
   changed({activityData:{}},'local');
  });
  await p.waitForFunction(()=>!!window.releaseOld);
  const retained=await p.locator('.course strong').first().textContent();
  await p.evaluate(async()=>{
   responder=()=>Promise.resolve({result:payload});
   changed({gradeAccount:{}},'session');
   releaseOld({result:{...payload,recent:[{...payload.recent[0],title:'已过期的响应'}]}});
   await new Promise(resolve=>setTimeout(resolve,0));
  });
  assert.equal(await p.locator('.course strong').first().textContent(),retained);
  await p.waitForFunction(()=>requests.length===3);
 }finally{await p.close();}
});
test('成绩快照超时释放读取状态，重试不会启动网站扫描',async()=>{
 const p=await setup('grades',grades());
 try{
  await p.evaluate(()=>{responder=()=>new Promise(resolve=>window.releaseOld=resolve);changed({gradeCache:{}},'local');});
  await p.waitForFunction(()=>!!window.releaseOld);
  await p.evaluate(()=>expireRequests());
  await p.getByText('本机快照读取超时，请重新读取',{exact:true}).waitFor();
  assert.equal(await p.locator('#reloadGrades').isEnabled(),true);
  assert.equal(await p.locator('.course-card').count(),1);
  await p.evaluate(()=>responder=()=>Promise.resolve({result:payload}));
  await p.locator('#reloadGrades').press('Enter');
  await p.waitForFunction(()=>document.getElementById('error').textContent==='');
  await p.evaluate(async()=>{releaseOld({result:{verified:false,courses:[],job:null}});await new Promise(resolve=>setTimeout(resolve,0));});
  assert.equal(await p.locator('.course-card').count(),1);
  assert.ok((await p.evaluate(()=>requests)).every(message=>message.type==='gradesGet'));
 }finally{await p.close();}
});
test('窄屏读取失败时顶部即可看到重试入口，页面不横向溢出',async()=>{
 const p=await setup('grades',grades());
 try{
  await p.setViewportSize({width:390,height:844});
  await p.evaluate(()=>{responder=()=>Promise.reject(Error('读取暂时失败'));changed({gradeCache:{}},'local');});
  await p.locator('#reloadGrades').waitFor();
  const bounds=await p.locator('#reloadGrades').boundingBox();
  assert.ok(bounds&&bounds.y>=0&&bounds.y+bounds.height<=844);
  assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
 }finally{await p.close();}
});
test('刷新操作防重复点击，期间保留筛选与展开分项',async()=>{
 const p=await setup('grades',grades());
 try{
  await p.locator('summary').click();
  await p.locator('#search').fill('演示');
  await p.evaluate(()=>{
   responder=message=>message.type==='gradesStart'?new Promise(resolve=>window.releaseStart=resolve):Promise.resolve({result:payload});
   document.getElementById('refresh').click();document.getElementById('refresh').click();
  });
  await p.waitForFunction(()=>!!window.releaseStart);
  assert.equal(await p.locator('#refresh').isEnabled(),false);
  await p.evaluate(async()=>{releaseStart({result:{}});await new Promise(resolve=>setTimeout(resolve,0));});
  await p.waitForFunction(()=>!document.getElementById('refresh').disabled);
  assert.equal(await p.locator('#search').inputValue(),'演示');
  assert.equal(await p.locator('details[open]').count(),1);
  assert.equal(await p.evaluate(()=>requests.filter(message=>message.type==='gradesStart').length),1);
 }finally{await p.close();}
});
test('操作超时先核对后台任务，迟到的启动结果不重复扫描',async()=>{
 const p=await setup('grades',grades());
 try{
  await p.evaluate(()=>{
   responder=message=>message.type==='gradesStart'?new Promise(resolve=>window.releaseStart=resolve):Promise.resolve({result:payload});
   document.getElementById('refresh').click();
  });
  await p.waitForFunction(()=>!!window.releaseStart);
  await p.evaluate(()=>{
   payload.job={status:'running',phase:'list',found:1};
   expireRequests();
  });
  await p.waitForFunction(()=>!document.getElementById('cancel').hidden&&!document.getElementById('cancel').disabled);
  assert.equal(await p.locator('#refresh').isEnabled(),false);
  assert.equal(await p.locator('#error').textContent(),'');
  await p.evaluate(async()=>{releaseStart({result:{}});await new Promise(resolve=>setTimeout(resolve,0));});
  assert.equal(await p.evaluate(()=>requests.filter(message=>message.type==='gradesStart').length),1);
 }finally{await p.close();}
});
test('取消超时且状态核对失败时禁用写操作，重新读取成功后恢复',async()=>{
 const data=grades();data.job={status:'running',phase:'list',found:1};
 const p=await setup('grades',data);
 try{
  await p.evaluate(()=>{
   responder=message=>message.type==='gradesCancel'?new Promise(resolve=>window.releaseCancel=resolve):Promise.reject(Error('核对失败'));
   document.getElementById('cancel').click();document.getElementById('cancel').click();
  });
  await p.waitForFunction(()=>!!window.releaseCancel);
  await p.evaluate(()=>expireRequests());
  await p.getByText('核对失败',{exact:true}).waitFor();
  assert.equal(await p.locator('#cancel').isEnabled(),false);
  assert.equal(await p.evaluate(()=>requests.filter(message=>message.type==='gradesCancel').length),1);
  await p.evaluate(()=>{payload.job={status:'cancelled'};responder=()=>Promise.resolve({result:payload});});
  await p.locator('#reloadGrades').click();
  await p.waitForFunction(()=>!document.getElementById('refresh').disabled);
  assert.equal(await p.locator('#clear').isEnabled(),true);
  assert.equal(await p.locator('#error').textContent(),'');
 }finally{await p.close();}
});
test('清空快照期间禁止重复清空，完成后读取空结果',async()=>{
 const p=await setup('grades',grades());
 try{
  await p.evaluate(()=>{
   responder=message=>message.type==='gradesClear'?new Promise(resolve=>window.releaseClear=resolve):Promise.resolve({result:payload});
   document.getElementById('clear').click();document.getElementById('clear').click();
  });
  await p.waitForFunction(()=>!!window.releaseClear);
  assert.equal(await p.locator('#refresh').isEnabled(),false);
  await p.evaluate(async()=>{payload.courses=[];releaseClear({result:{}});await new Promise(resolve=>setTimeout(resolve,0));});
  await p.waitForFunction(()=>!document.getElementById('clear').disabled);
  assert.equal(await p.locator('.course-card').count(),0);
  assert.equal(await p.evaluate(()=>requests.filter(message=>message.type==='gradesClear').length),1);
 }finally{await p.close();}
});
test('账号变化后旧操作错误不进入当前页面',async()=>{
 const p=await setup('grades',grades());
 try{
  await p.evaluate(()=>{
   responder=message=>message.type==='gradesStart'?new Promise(resolve=>window.releaseStart=resolve):Promise.resolve({result:payload});
   document.getElementById('refresh').click();
  });
  await p.waitForFunction(()=>!!window.releaseStart);
  await p.evaluate(()=>{
   payload={verified:false,courses:[],job:null};
   changed({gradeAccount:{oldValue:{hash:'old'},newValue:{hash:'new'}}},'session');
  });
  await p.waitForFunction(()=>document.getElementById('accountState').textContent==='等待确认账号');
  await p.evaluate(async()=>{releaseStart({error:'旧账号错误'});await new Promise(resolve=>setTimeout(resolve,0));});
  assert.equal(await p.locator('#error').textContent(),'');
  assert.equal(await p.locator('.course-card').count(),0);
 }finally{await p.close();}
});

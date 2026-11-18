const {test}=require('node:test'),{chromium}=require('playwright'),path=require('path'),fs=require('fs');
test('隔离真实扩展上下文可通过原生 DOM API 读取闭合题干',async()=>{
 const profile=path.resolve('.test-artifacts/zhs-isolated-profile-'+Date.now());
 const ctx=await chromium.launchPersistentContext(profile,{channel:'msedge',headless:true,args:['--disable-extensions-except='+process.cwd(),'--load-extension='+process.cwd()]});
 try{
  await ctx.route('https://onlineexamh5new.zhihuishu.com/**',route=>route.fulfill({contentType:'text/html',body:`<meta charset="utf-8"><div class="examPaper_subject"><div class="subject_num">1</div><div class="subject_type">单选题</div><div class="subject_describe"><div id="stem"></div></div><div class="subject_node"><div class="nodeLab"><input type="radio"><div class="node_detail">甲</div></div><div class="nodeLab"><input type="radio"><div class="node_detail">乙</div></div></div></div><div class="answerCard_list"><li>1</li></div><script>document.querySelector('#stem').attachShadow({mode:'closed'}).innerHTML='<p>扩展原生接口验证题干</p>';</script>`}));
  const p=await ctx.newPage(),client=await ctx.newCDPSession(p),contexts=[];client.on('Runtime.executionContextCreated',e=>contexts.push(e.context));await client.send('Runtime.enable');
  await p.goto('https://onlineexamh5new.zhihuishu.com/stuExamWeb.html#/webExamList/dohomework/1/student/exam/2/3/0');
  await p.locator('#uooc-learning-helper').waitFor({timeout:15000});
  let result;
  for(const c of contexts){if(c.auxData?.isDefault)continue;try{const r=await client.send('Runtime.evaluate',{contextId:c.id,expression:"typeof ZhihuishuLearning==='object'?JSON.stringify({api:typeof chrome.dom?.openOrClosedShadowRoot,text:ZhihuishuLearning.questions()[0]?.payload.text}):null",returnByValue:true});if(r.result.value){result=JSON.parse(r.result.value);break;}}catch{}}
  if(result?.api!=='function'||result.text!=='扩展原生接口验证题干')throw Error('真实扩展上下文未成功读取闭合题干: '+JSON.stringify(result));
  fs.writeFileSync('.test-artifacts/zhs-native-dom-smoke.json',JSON.stringify({passed:true,api:result.api,textMatches:true,isolatedProfile:true,paidRequests:false}));console.log('隔离 Edge 实际扩展加载及 chrome.dom 闭合题干读取通过；无真实网站会话或付费模型请求。');
 }finally{await ctx.close();}
});

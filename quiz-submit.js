(() => {
 const attempts=new WeakMap();
 const label=e=>(e.innerText||e.value||e.textContent||'').replace(/\s+/g,'');
 const candidates=(root,visible,pattern)=>Array.from(root.querySelectorAll('button,a,[role=button],input[type=button],input[type=submit],[ng-click]')).filter(e=>visible(e)&&!e.disabled&&e.getAttribute('aria-disabled')!=='true'&&pattern.test(label(e))).filter((e,i,list)=>!list.some(p=>p!==e&&e.contains(p)));
 const successPattern=/测验通过[，,。!！\s]|试卷提交完成|测验提交成功|提交(?:试卷|测验|答案)?成功|交卷成功|已成功提交/;
 function status(doc,visible){
  const roots=Array.from(doc.querySelectorAll('.layui-layer-content,[role=dialog],.exam-result,.paper-result,.test-result,.exam-status,[data-submitted=true]')).filter(visible);
  return roots.find(e=>successPattern.test(e.innerText||'')||e.getAttribute('data-submitted')==='true')||null;
 }
 async function acknowledge(doc,env){const scope=status(doc,env.visible);if(!scope)return false;const outer=scope.closest('.layui-layer,[role=dialog]')||scope;const buttons=candidates(outer,env.visible,/^(确定|确认|知道了|继续学习|继续)$/);if(buttons.length>1)throw Error('提交成功提示按钮不唯一，请人工确认');if(buttons.length===1&&env.allowed())buttons[0].click();return true;}
 async function submit(batch,env){
  const doc=batch.items[0]?.root.ownerDocument;if(!doc||batch.items.some(q=>q.root.ownerDocument!==doc)||!env.isQuiz(doc))throw Error('无法确认当前为普通测验，未自动提交');
  if(!env.allowed())return false;
  if(status(doc,env.visible)){await acknowledge(doc,env);return env.allowed();}
  if(!env.verify(batch))throw Error('测验答案发生变化，未自动提交');
  const prior=attempts.get(doc);
  if(prior?.confirmed)throw Error('已尝试提交但尚未确认结果，请人工核对，避免重复交卷');
  let state=prior||{opened:false,confirmed:false};attempts.set(doc,state);
  const dialog=()=>Array.from(doc.querySelectorAll('#commitConfirmDialog,[role=dialog],.layui-layer')).filter(env.visible).find(e=>/提交试卷|确认提交|确定提交|交卷/.test(e.innerText||'')||e.id==='commitConfirmDialog');
  if(!dialog()&&!state.opened){
   const buttons=candidates(doc,env.visible,/^(提交试卷|提交测验|提交答案|交卷)$/).filter(e=>!batch.items.some(q=>q.root.contains(e)));
   if(buttons.length!==1)throw Error('未找到唯一的测验提交按钮，请人工处理');
   if(!env.allowed())return false;if(!env.verify(batch))throw Error('测验答案发生变化，未自动提交');state.opened=true;env.say('正在打开测验提交确认');buttons[0].click();
  }
  const sleep=ms=>new Promise(r=>setTimeout(r,ms));
  for(let n=0;n<60;n++){
   if(!env.allowed())return false;
   if(status(doc,env.visible)){await acknowledge(doc,env);return env.allowed();}
   const layers=Array.from(doc.querySelectorAll('.layui-layer,[role=dialog],.exam-result,.test-result')).filter(env.visible);
   if(layers.some(e=>/提交失败|提交异常|未达到.{0,12}(?:通过|及格)|测验未通过|测验不通过|交卷失败/.test(e.innerText||'')))throw Error('网站未确认测验通过，请人工检查，未继续下一节');
   const scope=dialog();
   if(scope&&!state.confirmed){
    if(Array.from(scope.querySelectorAll('#notComplete,[data-unanswered]')).some(env.visible)||/还有.{0,8}题.{0,8}(?:未做|未答|没做完)|存在未作答|有题目没有做完/.test(scope.innerText||''))throw Error('网站提示仍有题目未完成，未自动提交');
    const captcha=Array.from(scope.querySelectorAll('#sc,[class*=captcha],[id*=captcha],.nc-container,.geetest_holder,iframe[src*=captcha]')).some(env.visible);
    const passed=/验证成功|验证通过/.test(scope.innerText||'');
    if((captcha||layers.some(e=>/请完成(?:智能|安全|人机)?验证|请先.{0,4}验证|拖动滑块/.test(e.innerText||'')))&&!passed)throw Error('提交需要网站智能验证，请手动完成验证并确认后继续');
    const buttons=candidates(scope,env.visible,/^(确定提交|确认提交|提交试卷|提交测验|提交|确认交卷|确定|确认)$/);
    if(buttons.length>1)throw Error('测验提交确认入口不唯一，请人工确认');
    if(buttons.length===1){if(!env.allowed())return false;if(!env.verify(batch))throw Error('测验答案发生变化，未自动提交');state.confirmed=true;env.say('已确认提交，等待网站返回成功');buttons[0].click();}
   }
   await sleep(200);
  }
  throw Error('未收到测验提交成功提示，请人工核对，未重复交卷');
 }
 globalThis.UoocQuizSubmission={submit,status,acknowledge};
})();

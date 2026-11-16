const {test}=require('node:test'),assert=require('node:assert/strict'),{environment}=require('./polymas-env.cjs');
test('POLYMAS 登录保持默认关闭，仅保留已验证的认证会话及原安全属性',async()=>{
 const e=environment();e.jar.push(e.cookie(),{...e.cookie(),name:'tracking'},{...e.cookie(),name:'CASLOGC'});
 await e.context.PolymasLogin.restore();assert.equal(e.calls.length,0);assert.equal(e.writes.length,0);
 const r=await e.call('pmLoginToggle',{enabled:true});assert.equal(r.state,'valid');assert.equal(e.writes.length,1);assert.ok(e.writes[0].expirationDate>Date.now()/1000+6*86400);assert.equal(e.writes[0].secure,true);assert.equal(e.writes[0].httpOnly,true);assert.equal(e.writes[0].sameSite,'strict');assert.equal(e.writes[0].domain,'.polymas.com');
 assert.ok(!JSON.stringify(e.local).includes('fixture-private-session'));assert.ok(!JSON.stringify(r).includes('fixture-private-session'));assert.equal(e.calls[0].url,'https://cloudapi.polymas.com/user/user/v2/get-current-user-detail');assert.equal(e.calls[0].options.method,'POST');
});
test('未授权、失效、网络错误均不提升 Cookie 有效期，也不泄露原始错误',async()=>{
 for(const mode of ['permission','expired','network']){const e=environment();e.jar.push(e.cookie());if(mode==='permission'){e.context.allowed=false;await assert.rejects(e.call('pmLoginToggle',{enabled:true}),/授权/);}else{if(mode==='expired')e.context.code=401;else e.context.network=true;const r=await e.call('pmLoginToggle',{enabled:true});assert.equal(r.state,mode==='expired'?'loginRequired':'network');assert.ok(!JSON.stringify(r).includes('private-error'));}assert.equal(e.writes.length,0);}
});
test('不修改网站已有过期时间、外部域名、隐私存储或分区 Cookie',async()=>{
 const e=environment();e.jar.push({...e.cookie(),session:false,expirationDate:Date.now()/1000+3600},{...e.cookie(),domain:'evilpolymas.com'},{...e.cookie(),storeId:'1'},{...e.cookie(),partitionKey:{topLevelSite:'https://other.example'}});const r=await e.call('pmLoginToggle',{enabled:true});assert.equal(r.state,'valid');assert.equal(e.writes.length,0);
});
test('关闭时只还原插件提升的 Cookie，主动退出后不恢复',async()=>{
 const e=environment();e.jar.push(e.cookie());await e.call('pmLoginToggle',{enabled:true});await e.call('pmLoginToggle',{enabled:false});assert.equal(e.jar[0].session,true);const current=e.jar.shift();e.emit({cookie:current,removed:true,cause:'explicit'});await e.context.PolymasLogin.restore();assert.equal(e.jar.length,0);
});
test('认证写入期间退出登录，不在本机重新建立已退出的会话',async()=>{
 const e=environment();e.jar.push(e.cookie());e.context.logoutDuringWrite=true;await e.call('pmLoginToggle',{enabled:true});assert.equal(e.jar.length,0);assert.equal(e.local.pmLoginKeeper?.state,'unverified');
});
test('课程内容脚本与预览 iframe 不能调用登录保持；只读请求拒绝未列入白名单的接口',async()=>{
 const e=environment();for(const role of ['course','popup','grades',null])await assert.rejects(e.call('pmLoginToggle',{enabled:true},role),/仅供设置页/);await assert.rejects(e.api.request('/score-manage/api/totalScore/refreshScore',{}),/只读接口/);assert.equal(e.calls.length,0);
});
test('账号变化取消在途读取，返回只包含脱敏账号标识',async()=>{
 const e=environment();e.jar.push(e.cookie());const p=await e.api.profile();assert.match(p.account,/^[a-f0-9]{64}$/);assert.ok(!JSON.stringify(p).includes('fixture-student'));let release;e.context.responder=async()=>new Promise(r=>release=()=>r({ok:true,status:200,json:async()=>({code:200,data:{}})}));const pending=e.api.profile();while(!release)await new Promise(r=>setTimeout(r,1));e.emit({cookie:e.jar[0],removed:true,cause:'explicit'});release();await assert.rejects(pending,e=>e.code==='CANCELLED');assert.equal(e.calls.at(-1).options.signal.aborted,true);
});

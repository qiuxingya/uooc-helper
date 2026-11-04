const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../background.js'),'utf8');
function environment(result,config={}){
 let listener,request;
 const context=vm.createContext({AbortController,setTimeout,clearTimeout,TextEncoder,TextDecoder,btoa,atob,crypto:require('node:crypto').webcrypto,fetch:async(url,options)=>{request={url,options};return {ok:!config.status,status:config.status,headers:{get:()=>config.retryAfter??null},json:async()=>({choices:[{finish_reason:config.finish||'stop',message:{content:JSON.stringify(result)}}]})};},chrome:{storage:{session:{setAccessLevel:async()=>{},get:async()=>({})},local:{setAccessLevel:()=>{},get:async()=>({apiKey:config.noKey?'':'test-secret'})}},runtime:{onMessage:{addListener:fn=>listener=fn}}}});
 vm.runInContext(source,context);
 return {solve:(q,guess=false)=>vm.runInContext(`solve(${JSON.stringify(q)},undefined,${guess})`,context),send:(msg,sender,reply)=>listener(msg,sender,reply),get request(){return request;}};
}
const single={text:'示例题',type:'single',options:['甲','乙']};
test('single choice uses official endpoint, JSON and a separate authorization header',async()=>{
 const env=environment({answers:[1],explanation:'解析',uncertain:false});
 assert.equal((await env.solve(single)).answers[0],1);
 assert.equal(env.request.url,'https://api.deepseek.com/chat/completions');
 assert.equal(env.request.options.headers.Authorization,'Bearer test-secret');
 assert.ok(!env.request.options.body.includes('test-secret'));
 assert.equal(JSON.parse(env.request.options.body).response_format.type,'json_object');
});
test('multiple choice accepts several distinct options',async()=>{const env=environment({answers:[0,1],explanation:'两者',uncertain:false});assert.equal((await env.solve({...single,type:'multiple'})).answers.length,2);});
for(const [label,result] of Object.entries({outOfRange:{answers:[2]},duplicate:{answers:[0,0]},singleMany:{answers:[0,1]},uncertain:{answers:[0],uncertain:true},empty:{answers:[]}}))test(`reject ${label}`,async()=>{
 const env=environment({explanation:'解析',uncertain:false,...result});await assert.rejects(env.solve(single),/不确定/);
});
test('missing key never sends request',async()=>{const env=environment({}, {noKey:true});await assert.rejects(env.solve(single),/API Key/);assert.equal(env.request,undefined);});
test('unauthorized service response is actionable',async()=>{const env=environment({}, {status:401});await assert.rejects(env.solve(single),/无效/);});
test('truncated completion rejected',async()=>{const env=environment({}, {finish:'length'});await assert.rejects(env.solve(single),/未完整/);});
test('malformed question rejected before network',async()=>{const env=environment({});await assert.rejects(env.solve({...single,options:['one']}),/格式/);assert.equal(env.request,undefined);});
test('foreign pages cannot invoke solve',()=>{const env=environment({});let called=false;assert.equal(env.send({type:'solve',question:single},{tab:{id:1},url:'https://evil.example/'},()=>called=true),undefined);assert.equal(called,false);assert.equal(env.request,undefined);});
test('fill blank returns ordered strings and permits identical answers',async()=>{
 const env=environment({answers:['main','main'],explanation:'示例',uncertain:false});const result=await env.solve({text:'填写两空',type:'blank',blankCount:2});assert.equal(result.answers.join(','),'main,main');
});
for(const answers of [['one'],['one',''],[1,2]])test(`reject invalid fill blank result ${JSON.stringify(answers)}`,async()=>{
 const env=environment({answers,explanation:'示例',uncertain:false});await assert.rejects(env.solve({text:'两空',type:'blank',blankCount:2}),/不确定/);
});

test('explicit guess accepts uncertain valid option and labels it',async()=>{const env=environment({answers:[1],explanation:'推测',uncertain:true});const result=await env.solve(single,true);assert.equal(result.answers[0],1);assert.equal(result.uncertain,true);assert.match(JSON.parse(env.request.options.body).messages[0].content,/必须按指定格式给出最可能/);});
test('guess still rejects invalid option',async()=>{const env=environment({answers:[99],explanation:'推测',uncertain:true});await assert.rejects(env.solve(single,true),/不确定/);});

for(const [status,code] of [[401,'AUTH'],[402,'BALANCE'],[429,'RATE_LIMIT'],[500,'SERVER'],[503,'SERVER'],[404,'MODEL_UNAVAILABLE']])test('structured API error '+status,async()=>{const env=environment({}, {status,retryAfter:'2'});await assert.rejects(env.solve(single),e=>e.code===code&&(status!==429||e.retryAfterMs===2000));});
for(const retryAfter of ['invalid','-3',''])test('invalid Retry-After remains unset '+retryAfter,async()=>{const env=environment({}, {status:429,retryAfter});await assert.rejects(env.solve(single),e=>e.code==='RATE_LIMIT'&&e.retryAfterMs===undefined);});
test('Retry-After HTTP date is parsed and left for UI budget enforcement',async()=>{const env=environment({}, {status:429,retryAfter:new Date(Date.now()+120000).toUTCString()});await assert.rejects(env.solve(single),e=>e.code==='RATE_LIMIT'&&e.retryAfterMs>60000);});

test('guess origin is explicit even when model claims confidence',async()=>{const env=environment({answers:[1],explanation:'模拟',uncertain:false});const result=await env.solve(single,true);assert.equal(result.guessed,true);assert.equal(result.uncertain,false);});

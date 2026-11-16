const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const {environment}=require('./vault-env.cjs');
const entry='https://hike-teaching-center.polymas.com/custom-stu-hike/agent-course-full/demo/stu/study?activeTab=resource';
const detail=entry.split('/stu/')[0]+'/group/file/type/stu/study/resource-detail?token=fixture-secret#private';
const load=()=>{const c=vm.createContext({URL,URLSearchParams});for(const f of ['platforms.js','polymas-parser.js'])vm.runInContext(fs.readFileSync(f,'utf8'),c);return c;};
test('POLYMAS 课程与预览仅接受已检查的 HTTPS 域名和路由，历史记录移除查询令牌',()=>{
 const c=load(),p=c.UoocPlatforms,parser=c.PolymasParser;
 assert.equal(p.study(entry),true);assert.equal(p.route(detail),entry);assert.equal(p.identity(detail),'polymas:demo');assert.equal(parser.course(detail).resource,'file');
 for(const u of [entry.replace('https:','http:'),entry.replace('polymas.com','polymas.com.evil.example'),entry.replace('/stu/study','/teacher/study'),entry.replace('hike-teaching-center','elsewhere'),entry.replace('https://','https://user:pass@'),entry.replace('.com/','.com:444/')]){assert.equal(p.study(u),false);assert.equal(parser.course(u),null);assert.throws(()=>p.route(u));}
 const preview='https://polymas.com/resource/online/preview/?courseId=demo&fileId=file&token=fixture-secret';assert.equal(parser.player(preview).file,'file');
 for(const u of [preview+'&courseId=other',preview+'&fileId=other',preview.replace('https:','http:'),preview.replace('polymas.com','evil.polymas.com'),preview.replace('/preview/','/other/')])assert.equal(parser.player(u),null);
 assert.equal(p.courseTitle('学习资源-AI教学中心'),'');
});
test('POLYMAS 顶层课程可记录本机统计，但子框架和网页不能读取密钥或触发后台设置',async()=>{
 const e=environment({apiKey:'fixture-secret'},{},null,{},true),sender={id:'test',url:detail,frameId:0,documentId:'fixture',tab:{id:3}};
 for(const who of [sender,{...sender,frameId:2,url:'https://polymas.com/resource/online/preview/?courseId=demo&fileId=file'},{...sender,id:'foreign'}])for(const type of ['keyStatus','keySave','keyDelete','testConnection'])assert.equal(await e.send(type,{apiKey:'changed'},who),undefined);
 const now=Date.now(),report={segments:[[now-5000,now]],ended:true,resource:'polymas:file',position:{title:'模拟课程',chapter:'示例视频',seconds:20}};
 assert.equal((await e.send('activityReport',report,sender)).error,undefined);
 assert.equal((await e.send('activityReport',report,{...sender,tab:{id:4}})).error,undefined);
 const overview=(await e.send('overview')).result;assert.equal(overview.today.milliseconds,5000);assert.equal(overview.today.videos,1);assert.equal(overview.recent[0].url,entry);assert.equal(overview.recent[0].title,'模拟课程');assert.ok(!JSON.stringify(e.local.activityData).includes('fixture-secret'));assert.equal(e.calls.length,0);
 assert.equal(await e.send('activityReport',report,{...sender,frameId:2}),undefined);
});
test('manifest 仅在课程容器注入完整助手，预览 iframe 只注入媒体桥接',()=>{
 const m=JSON.parse(fs.readFileSync('manifest.json','utf8')),scripts=m.content_scripts.filter(s=>s.matches.some(x=>x.includes('polymas.com')));
 assert.equal(scripts.length,2);const preview=scripts.find(s=>s.all_frames);assert.deepEqual(preview.js,['polymas-parser.js','polymas-player.js']);assert.ok(!preview.js.includes('content.js'));assert.ok(!m.host_permissions.some(x=>x.includes('aliyuncs')));assert.deepEqual(m.permissions,['storage','alarms']);
});

// Shared URL policy. Never persist authentication query parameters in learning history.
(() => {
 const number=v=>typeof v==='string'&&/^\d{1,20}$/.test(v);
 const cxPath=/^\/(?:mooc-ans\/)?(?:mycourse\/(?:studentstudy|studentcourse)|knowledge\/cards)(?:\/|$)/;
 function parse(raw){try{const u=new URL(raw);if(!/^https?:$/.test(u.protocol)||u.username||u.password||u.port)return null;return u;}catch{return null;}}
 function platform(raw){const u=parse(raw);return !u?null:/(^|\.)uooc\.net\.cn$/i.test(u.hostname)?'uooc':/(^|\.)chaoxing\.com$/i.test(u.hostname)?'chaoxing':null;}
 function study(raw){const u=parse(raw),p=platform(raw);return p==='uooc'||p==='chaoxing'&&cxPath.test(u.pathname);}
 function route(raw){
  const u=parse(raw),p=platform(raw);if(!u||!p)throw Error('课程地址不受支持');
  if(p==='uooc'){const hash=/^#\/[a-zA-Z0-9/_-]*$/.test(u.hash)?u.hash:'';return u.origin+u.pathname+hash;}
  if(!study(raw))throw Error('课程地址不受支持');
  const fields={};for(const [key,value] of u.searchParams){const k=key.toLowerCase();if(['courseid','clazzid','chapterid','knowledgeid','cpi'].includes(k)&&number(value)){if(fields[k]&&fields[k]!==value)throw Error('课程标识冲突');fields[k]=value;}}
  if(!fields.courseid||!fields.clazzid)throw Error('学习通课程标识不完整');
  const q=new URLSearchParams(),studyPage=/\/studentstudy$/.test(u.pathname);for(const k of ['courseid','clazzid','chapterid','knowledgeid','cpi'])if(fields[k])q.set(studyPage&&k==='courseid'?'courseId':studyPage&&k==='chapterid'?'chapterId':k,fields[k]);return u.origin+u.pathname+'?'+q;
 }
 function identity(raw){const u=new URL(route(raw));if(platform(raw)==='chaoxing')return 'chaoxing:'+(u.searchParams.get('courseid')||u.searchParams.get('courseId'))+':'+u.searchParams.get('clazzid');const parts=u.hash.slice(2).split('/');return /^\d+$/.test(parts[0])&&/^\d+$/.test(parts[1])?u.origin+u.pathname+'#/'+parts.slice(0,2).join('/'):u.origin+u.pathname;}
 globalThis.UoocPlatforms={platform,study,route,identity,matches:['*://*.uooc.net.cn/*','*://*.chaoxing.com/*']};
})();

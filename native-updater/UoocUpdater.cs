using System;
using System.IO;
using System.IO.Compression;
using System.Collections;
using System.Collections.Generic;
using System.Linq;
using System.Net;
using System.Text;
using System.Text.RegularExpressions;
using System.Security.Cryptography;
using System.Threading;
using System.Diagnostics;
using System.Web.Script.Serialization;
using System.Windows.Forms;
using System.Drawing;
using Microsoft.Win32;

namespace UoocUpdater {
public static class Core {
 public const string Host="com.qiuxingya.uooc_updater", Repo="https://github.com/qiuxingya/uooc-helper/releases/latest/download/update.json", DownloadPrefix="https://github.com/qiuxingya/uooc-helper/releases/download/";
 public const string HelperVersion="1.2.0";
 public static readonly JavaScriptSerializer Json=new JavaScriptSerializer { MaxJsonLength=2097152,RecursionLimit=50 };
 public static string Executable {get{return System.Reflection.Assembly.GetExecutingAssembly().Location;}}
 public static string Home {get{return Path.GetDirectoryName(Executable);}}
 public static Dictionary<string,object> Obj(object x){var d=x as Dictionary<string,object>;if(d==null)throw new Exception("INVALID_JSON");return d;}
 public static string Str(Dictionary<string,object> d,string k){object v;return d.TryGetValue(k,out v)&&v is string?(string)v:"";}
 public static bool Flag(Dictionary<string,object> d,string k){object v;return d.TryGetValue(k,out v)&&v is bool&&(bool)v;}
 public static object[] Arr(Dictionary<string,object> d,string k){object v;return d.TryGetValue(k,out v)&&v is object[]?(object[])v:new object[0];}
 public static Dictionary<string,object> Read(string p){return Obj(Json.DeserializeObject(File.ReadAllText(p,Encoding.UTF8)));}
 public static void Write(string p,object d){string tmp=p+".tmp-"+Guid.NewGuid().ToString("N");File.WriteAllText(tmp,Json.Serialize(d),new UTF8Encoding(false));if(File.Exists(p))File.Replace(tmp,p,null);else File.Move(tmp,p);}
 public static int Compare(string a,string b){return VersionOf(a).CompareTo(VersionOf(b));}
 public static Version VersionOf(string v){if(!Regex.IsMatch(v??"",@"^\d{1,5}(\.\d{1,5}){1,3}$"))throw new Exception("INVALID_VERSION");int[] p=v.Split('.').Select(int.Parse).ToArray();if(p.Any(n=>n>65535))throw new Exception("INVALID_VERSION");return new Version(p[0],p[1],p.Length>2?p[2]:0,p.Length>3?p[3]:0);}
 public static string Full(string p){return Path.GetFullPath(p).TrimEnd(Path.DirectorySeparatorChar);}
 public static void NoLinks(string path){for(var d=new DirectoryInfo(Full(path));d!=null;d=d.Parent)if(d.Exists&&(d.Attributes&FileAttributes.ReparsePoint)!=0)throw new Exception("LINK_PATH_REJECTED");}
 public static void SafeTree(string path){NoLinks(path);foreach(var entry in Directory.EnumerateFileSystemEntries(path)){if((File.GetAttributes(entry)&FileAttributes.ReparsePoint)!=0)throw new Exception("LINK_PATH_REJECTED");if(Directory.Exists(entry))SafeTree(entry);}}
 public static Dictionary<string,object> Manifest(string folder){NoLinks(folder);var m=Read(Path.Combine(folder,"manifest.json"));if(Str(m,"name")!="优课学习助手"||Convert.ToInt32(m["manifest_version"])!=3)throw new Exception("NOT_UOOC_EXTENSION");VersionOf(Str(m,"version"));return m;}
 public static string ExpectedId(string folder){var m=Manifest(folder);string k=Str(m,"key");byte[] bytes=k.Length>0?Convert.FromBase64String(k):Encoding.Unicode.GetBytes(Full(folder).Substring(0,1).ToUpperInvariant()+Full(folder).Substring(1));byte[] h;using(var sha=SHA256.Create())h=sha.ComputeHash(bytes);var s=new StringBuilder();foreach(byte v in h.Take(16)){s.Append((char)('a'+(v>>4)));s.Append((char)('a'+(v&15)));}return s.ToString();}
 public static void Target(string folder,string id){folder=Full(folder);if(!Regex.IsMatch(id??"", "^[a-p]{32}$")||folder.StartsWith(@"\\")||folder.Length<8||Directory.GetParent(folder)==null)throw new Exception("INVALID_TARGET");NoLinks(folder);Manifest(folder);if(ExpectedId(folder)!=id)throw new Exception("EXTENSION_DIRECTORY_ID_MISMATCH");if(folder.IndexOf("\\User Data\\",StringComparison.OrdinalIgnoreCase)>=0||Directory.Exists(Path.Combine(folder,"_metadata"))||Directory.Exists(Path.Combine(folder,".git"))||Directory.Exists(Path.Combine(folder,"work")))throw new Exception("USE_STANDALONE_EXTENSION_FOLDER");foreach(string required in new[]{"background.js","content.js","options.html"})if(!File.Exists(Path.Combine(folder,required)))throw new Exception("INVALID_TARGET");SafeTree(folder);}
 public static byte[] Fetch(string raw,int limit){
  Uri u=new Uri(raw);for(int redirects=0;redirects<6;redirects++){
   bool api=u.AbsoluteUri==Repo;
   bool asset=u.Host=="github.com"&&u.AbsolutePath.StartsWith("/qiuxingya/uooc-helper/releases/download/",StringComparison.Ordinal);
   bool cdn=u.Host=="release-assets.githubusercontent.com";
   if(u.Scheme!="https"||!u.IsDefaultPort||u.UserInfo.Length>0||(!api&&!asset&&!cdn)||(redirects==0&&cdn))throw new Exception("UNTRUSTED_DOWNLOAD");
   ServicePointManager.SecurityProtocol=SecurityProtocolType.Tls12;
   var q=(HttpWebRequest)WebRequest.Create(u);q.AllowAutoRedirect=false;q.Timeout=30000;q.ReadWriteTimeout=30000;q.UserAgent="UoocHelperUpdater/"+HelperVersion;q.Accept="application/vnd.github+json";
   try{using(var r=(HttpWebResponse)q.GetResponse()){
    if((int)r.StatusCode>=300&&(int)r.StatusCode<400){string loc=r.Headers["Location"];if(String.IsNullOrEmpty(loc))throw new Exception("INVALID_REDIRECT");u=new Uri(u,loc);continue;}
    if(r.ContentLength>limit)throw new Exception("DOWNLOAD_TOO_LARGE");using(var input=r.GetResponseStream())using(var output=new MemoryStream()){byte[] buf=new byte[32768];int n;while((n=input.Read(buf,0,buf.Length))>0){if(output.Length+n>limit)throw new Exception("DOWNLOAD_TOO_LARGE");output.Write(buf,0,n);}return output.ToArray();}
   }}catch(WebException e){var response=e.Response as HttpWebResponse;if(response!=null){int status=(int)response.StatusCode;bool limited=response.Headers["X-RateLimit-Remaining"]=="0"||!String.IsNullOrEmpty(response.Headers["Retry-After"]);response.Dispose();if(status==429||(status==403&&limited))throw new Exception("GITHUB_RATE_LIMIT");if(status==403)throw new Exception("GITHUB_FORBIDDEN");if(status==404)throw new Exception("RELEASE_NOT_FOUND");}throw new Exception("NETWORK_ERROR");}
  }throw new Exception("TOO_MANY_REDIRECTS");
 }
 public static Dictionary<string,object> Release(){return Obj(Json.DeserializeObject(Encoding.UTF8.GetString(Fetch(Repo,2097152))));}
 public static Dictionary<string,object> Package(Dictionary<string,object> release){
  if(Str(release,"format")!="uooc-update"||!release.ContainsKey("schemaVersion")||!(release["schemaVersion"] is int)||Convert.ToInt32(release["schemaVersion"])!=1)throw new Exception("INVALID_RELEASE");string v=Str(release,"version");VersionOf(v);string tag="v"+v,name="uooc-helper-"+v+".zip",url=DownloadPrefix+tag+"/"+name,hash=Str(release,"sha256");if(Str(release,"tag")!=tag||Str(release,"downloadUrl")!=url||!Regex.IsMatch(hash,@"^[a-f0-9]{64}$")||!release.ContainsKey("size")||!(release["size"] is int || release["size"] is long)||Convert.ToInt64(release["size"])<=0||Convert.ToInt64(release["size"])>52428800)throw new Exception("INVALID_RELEASE");return new Dictionary<string,object>{{"version",v},{"url",url},{"sha256",hash}};
 }
 public static string Digest(byte[] bytes){using(var sha=SHA256.Create())return BitConverter.ToString(sha.ComputeHash(bytes)).Replace("-","").ToLowerInvariant();}
 public static string SafeEntry(string raw){string s=raw.Replace('\\','/');if(s.Length>230||s.StartsWith("/")||s.Contains(":"))throw new Exception("UNSAFE_ZIP_PATH");foreach(string part in s.Split('/'))if(part.Length==0||part=="."||part==".."||part.EndsWith(" ")||part.EndsWith(".")||Regex.IsMatch(part,@"^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(\.|$)",RegexOptions.IgnoreCase)||part.Any(c=>c<32||"<>\"|?*".Contains(c)))throw new Exception("UNSAFE_ZIP_PATH");return s;}
 public static void Extract(byte[] zip,string stage){
  Directory.CreateDirectory(stage);var names=new HashSet<string>(StringComparer.OrdinalIgnoreCase);using(var stream=new MemoryStream(zip))using(var archive=new ZipArchive(stream,ZipArchiveMode.Read)){
   if(archive.Entries.Count>2000)throw new Exception("TOO_MANY_FILES");var manifests=archive.Entries.Where(e=>e.FullName.Replace('\\','/').EndsWith("manifest.json",StringComparison.Ordinal)&&e.FullName.Replace('\\','/').Split('/').Last()=="manifest.json").ToArray();if(manifests.Length!=1)throw new Exception("MANIFEST_NOT_UNIQUE");string mp=SafeEntry(manifests[0].FullName),prefix=mp.Substring(0,mp.Length-13);long total=0;
   foreach(var e in archive.Entries){string name=e.FullName.Replace('\\','/');bool dir=name.EndsWith("/");if(dir){SafeEntry(name.TrimEnd('/'));continue;}name=SafeEntry(name);if(!name.StartsWith(prefix,StringComparison.Ordinal))throw new Exception("MIXED_PACKAGE_ROOT");name=name.Substring(prefix.Length);SafeEntry(name);if(!names.Add(name))throw new Exception("DUPLICATE_ZIP_PATH");if(((e.ExternalAttributes>>16)&0xF000)==0xA000)throw new Exception("ZIP_LINK_REJECTED");if(e.Length>12582912||(total+=e.Length)>104857600)throw new Exception("ZIP_TOO_LARGE");string ext=Path.GetExtension(name).ToLowerInvariant();if(name!="native-updater/UoocUpdater.exe"&&name!="LICENSE"&&!new[]{".js",".json",".html",".css",".png",".svg",".jpg",".jpeg",".webp",".md",".txt",".woff",".woff2"}.Contains(ext))throw new Exception("PACKAGE_FILE_TYPE_REJECTED");string target=Full(Path.Combine(stage,name.Replace('/',Path.DirectorySeparatorChar)));if(!target.StartsWith(Full(stage)+Path.DirectorySeparatorChar,StringComparison.OrdinalIgnoreCase))throw new Exception("UNSAFE_ZIP_PATH");Directory.CreateDirectory(Path.GetDirectoryName(target));using(var input=e.Open())using(var output=new FileStream(target,FileMode.CreateNew)){input.CopyTo(output);}
   }
  }Manifest(stage);foreach(string f in new[]{"background.js","content.js","options.html"})if(!File.Exists(Path.Combine(stage,f)))throw new Exception("INCOMPLETE_PACKAGE");
 }
 static HashSet<string> Capabilities(Dictionary<string,object> m){var result=new HashSet<string>();foreach(string field in new[]{"permissions","host_permissions","optional_permissions","optional_host_permissions","web_accessible_resources","externally_connectable","content_security_policy","update_url","oauth2","sandbox","incognito"}){object v;if(m.TryGetValue(field,out v)){if(v is object[])foreach(object x in (object[])v)result.Add(field+":"+Json.Serialize(x));else result.Add(field+":"+Json.Serialize(v));}}foreach(var script in Arr(m,"content_scripts").Select(Obj)){foreach(string field in new[]{"matches","exclude_matches","world","all_frames","match_about_blank","match_origin_as_fallback"}){object v;if(script.TryGetValue(field,out v))result.Add("script:"+field+":"+Json.Serialize(v));}}return result;}
 public static void ValidateUpgrade(string oldFolder,string newFolder,string expected){var old=Manifest(oldFolder);var next=Manifest(newFolder);if(Str(next,"version")!=expected||Compare(expected,Str(old,"version"))<=0)throw new Exception("VERSION_NOT_NEWER");if(Str(old,"key")!=Str(next,"key"))throw new Exception("EXTENSION_ID_CHANGED");if(!Capabilities(next).IsSubsetOf(Capabilities(old)))throw new Exception("PERMISSIONS_CHANGED_MANUAL_UPDATE_REQUIRED");}
 public static string JournalPath(string id){return Path.Combine(Home,"transaction-"+id+".json");}
 static void OwnedDelete(string p,string target,string prefix){if(String.IsNullOrEmpty(p)||!Full(p).StartsWith(Full(Path.Combine(Path.GetDirectoryName(target),prefix)),StringComparison.OrdinalIgnoreCase))throw new Exception("UNSAFE_CLEANUP");if(Directory.Exists(p)){SafeTree(p);Directory.Delete(p,true);}}
 public static void ValidateJournal(Dictionary<string,object> j){string target=Full(Str(j,"target")),parent=Path.GetDirectoryName(target);foreach(string k in new[]{"backup","stage"}){string p=Full(Str(j,k)),prefix=k=="backup"?".uooc-backup-":".uooc-stage-";if(!String.Equals(Path.GetDirectoryName(p),parent,StringComparison.OrdinalIgnoreCase)||!Regex.IsMatch(Path.GetFileName(p),"^"+Regex.Escape(prefix)+"[0-9a-f]{32}$"))throw new Exception("INVALID_TRANSACTION_PATH");}NoLinks(parent);if(Directory.Exists(target))NoLinks(target);}
 public static void Rollback(Dictionary<string,object> j){ValidateJournal(j);string target=Str(j,"target"),backup=Str(j,"backup"),stage=Str(j,"stage");if(Directory.Exists(backup)){if(Str(Manifest(backup),"version")!=Str(j,"oldVersion"))throw new Exception("INVALID_BACKUP");if(Directory.Exists(target)){if(Str(Manifest(target),"version")!=Str(j,"version"))throw new Exception("TARGET_CHANGED_KEEP_BACKUP");SafeTree(target);Directory.Delete(target,true);}Directory.Move(backup,target);}if(Directory.Exists(stage))OwnedDelete(stage,target,".uooc-stage-");}
 public static void PreserveExtraFiles(string oldFolder,string stage){int count=0;long total=0;foreach(string file in Directory.EnumerateFiles(oldFolder,"*",SearchOption.AllDirectories)){if(++count>4000||(total+=new FileInfo(file).Length)>157286400)throw new Exception("INSTALL_FOLDER_TOO_LARGE");string relative=file.Substring(Full(oldFolder).Length+1),dest=Path.Combine(stage,relative);if(!File.Exists(dest)){Directory.CreateDirectory(Path.GetDirectoryName(dest));File.Copy(file,dest);}}}
 public static Dictionary<string,object> StageZip(string target,byte[] bytes,string sha,string expected,string id){
  Target(target,id);if(Digest(bytes)!=sha.ToLowerInvariant())throw new Exception("HASH_MISMATCH");string parent=Path.GetDirectoryName(target),stage=Path.Combine(parent,".uooc-stage-"+Guid.NewGuid().ToString("N")),backup=Path.Combine(parent,".uooc-backup-"+Guid.NewGuid().ToString("N"));var journal=new Dictionary<string,object>{{"id",id},{"target",target},{"stage",stage},{"backup",backup},{"version",expected},{"oldVersion",Str(Manifest(target),"version")},{"token",Guid.NewGuid().ToString("N")},{"phase","staged"},{"deadline",DateTimeOffset.UtcNow.ToUnixTimeSeconds()+3600}};
  try{Extract(bytes,stage);ValidateUpgrade(target,stage,expected);PreserveExtraFiles(target,stage);Write(JournalPath(id),journal);return journal;}
  catch{Rollback(journal);if(File.Exists(JournalPath(id)))File.Delete(JournalPath(id));throw;}
 }
 public static Dictionary<string,object> CommitStage(Dictionary<string,object> j){ValidateJournal(j);string target=Str(j,"target"),stage=Str(j,"stage"),backup=Str(j,"backup"),id=Str(j,"id");Target(target,id);if(Str(j,"phase")!="staged"||Str(Manifest(target),"version")!=Str(j,"oldVersion"))throw new Exception("INVALID_UPDATE_STAGE");SafeTree(stage);ValidateUpgrade(target,stage,Str(j,"version"));try{j["phase"]="prepared";Write(JournalPath(id),j);Directory.Move(target,backup);Directory.Move(stage,target);j["phase"]="applied";j["deadline"]=DateTimeOffset.UtcNow.ToUnixTimeSeconds()+90;Write(JournalPath(id),j);return j;}catch{Rollback(j);File.Delete(JournalPath(id));throw;}}
 public static Dictionary<string,object> ApplyZip(string target,byte[] bytes,string sha,string expected,string id){return CommitStage(StageZip(target,bytes,sha,expected,id));}
 public static void Acknowledge(string id,string version){string p=JournalPath(id);if(!File.Exists(p))return;var j=Read(p);if(Str(j,"phase")=="applied"&&Str(j,"version")==version&&Str(Manifest(Str(j,"target")),"version")==version){j["phase"]="confirmed";Write(p,j);OwnedDelete(Str(j,"backup"),Str(j,"target"),".uooc-backup-");File.Delete(p);}}
 public static void Recover(string id){string p=JournalPath(id);if(!File.Exists(p))return;var j=Read(p);ValidateJournal(j);string configured=Str(Arr(Configuration(),"installations").Select(Obj).Single(r=>Str(r,"id")==id),"target");if(!String.Equals(Full(configured),Full(Str(j,"target")),StringComparison.OrdinalIgnoreCase))throw new Exception("INVALID_TRANSACTION_PATH");if(Str(j,"phase")=="confirmed"){OwnedDelete(Str(j,"backup"),Str(j,"target"),".uooc-backup-");File.Delete(p);return;}if(!Directory.Exists(Str(j,"target"))||(Str(j,"phase")!="applied"&&Str(j,"phase")!="staged")||Convert.ToInt64(j["deadline"])<DateTimeOffset.UtcNow.ToUnixTimeSeconds()){Rollback(j);File.Delete(p);}}
 public static Dictionary<string,object> Configuration(){return Read(Path.Combine(Home,"config.json"));}
 public static string ConfiguredTarget(string id){var row=Arr(Configuration(),"installations").Select(Obj).SingleOrDefault(r=>Str(r,"id")==id);if(row==null)throw new Exception("UNREGISTERED_EXTENSION");string target=Str(row,"target");Target(target,id);return target;}
 public static Dictionary<string,object>[] RegistrationRows(IEnumerable<Dictionary<string,object>> previous,string id,string target){
  Target(target,id);var rows=new List<Dictionary<string,object>>();var ids=new HashSet<string>();
  foreach(var row in previous){string oldId=Str(row,"id"),oldTarget=Str(row,"target");if(oldId==id||ids.Contains(oldId))continue;try{Target(oldTarget,oldId);}catch{continue;}ids.Add(oldId);rows.Add(new Dictionary<string,object>{{"id",oldId},{"target",Full(oldTarget)}});}
  rows.Add(new Dictionary<string,object>{{"id",id},{"target",Full(target)}});return rows.ToArray();
 }
 public static Dictionary<string,object> HostManifest(IEnumerable<Dictionary<string,object>> rows,string exe){var ids=rows.Select(row=>Str(row,"id")).Distinct().ToArray();if(ids.Length==0||ids.Any(id=>!Regex.IsMatch(id,"^[a-p]{32}$")))throw new Exception("INVALID_TARGET");return new Dictionary<string,object>{{"name",Host},{"description","UOOC Helper GitHub updater"},{"path",exe},{"type","stdio"},{"allowed_origins",ids.Select(id=>"chrome-extension://"+id+"/").ToArray()}};}
 public static void Install(string id,string target,string browser){
  if(browser!="edge"&&browser!="chrome")throw new Exception("INVALID_BROWSER");target=Full(target);Target(target,id);
  string home=Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),"UoocHelperUpdater");NoLinks(home);
  if(Directory.Exists(home)&&Directory.GetFiles(home,"transaction-*.json").Length>0)throw new Exception("UPDATE_PENDING_ACK");
  string config=Path.Combine(home,"config.json");if(File.Exists(config))NoLinks(config);
  var previous=File.Exists(config)?Arr(Read(config),"installations").Select(Obj):Enumerable.Empty<Dictionary<string,object>>();var rows=RegistrationRows(previous,id,target);
  byte[] self=File.ReadAllBytes(Executable);string exe=Path.Combine(home,"UoocUpdater-"+HelperVersion+"-"+Digest(self).Substring(0,12)+".exe");var manifestData=HostManifest(rows,exe);
  Directory.CreateDirectory(home);NoLinks(exe);if(!File.Exists(exe))File.WriteAllBytes(exe,self);else if(Digest(File.ReadAllBytes(exe))!=Digest(self))throw new Exception("HELPER_FILE_CHANGED");
  Write(config,new Dictionary<string,object>{{"version",1},{"installations",rows}});string manifest=Path.Combine(home,"native-host.json");NoLinks(manifest);Write(manifest,manifestData);
  string vendor=browser=="chrome"?"Google\\Chrome":"Microsoft\\Edge";using(var registry=Registry.CurrentUser.CreateSubKey("Software\\"+vendor+"\\NativeMessagingHosts\\"+Host))registry.SetValue("",manifest);
 }
 public static void Disconnect(){string manifest=Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),"UoocHelperUpdater","native-host.json");foreach(string vendor in new[]{"Microsoft\\Edge","Google\\Chrome"}){string name="Software\\"+vendor+"\\NativeMessagingHosts\\"+Host;using(var key=Registry.CurrentUser.OpenSubKey(name)){if(key==null||!String.Equals(Convert.ToString(key.GetValue("")),manifest,StringComparison.OrdinalIgnoreCase))continue;}Registry.CurrentUser.DeleteSubKeyTree(name,false);}}
 public static void Watchdog(string id,string token){Thread.Sleep(95000);try{using(var mutex=new Mutex(false,"Local\\UoocUpdater-"+id)){if(!mutex.WaitOne(10000))return;try{string p=JournalPath(id);if(!File.Exists(p))return;var j=Read(p);if(Str(j,"token")!=token||Str(j,"phase")=="confirmed")return;Rollback(j);File.Delete(p);}finally{mutex.ReleaseMutex();}}}catch{}}
 public static Dictionary<string,object> Handle(Dictionary<string,object> message,string id){
  Recover(id);string target=ConfiguredTarget(id),command=Str(message,"command"),version=Str(message,"currentVersion");
  if(command=="ack"){Acknowledge(id,version);return new Dictionary<string,object>{{"ok",true},{"version",Str(Manifest(target),"version")}};}
  if(command=="status")return new Dictionary<string,object>{{"ok",true},{"helperVersion",HelperVersion},{"version",Str(Manifest(target),"version")},{"directory",target}};
  string jp=JournalPath(id);
  if(command=="cancel"){if(File.Exists(jp)){var j=Read(jp);if(Str(j,"token")!=Str(message,"token"))throw new Exception("INVALID_UPDATE_TOKEN");Rollback(j);File.Delete(jp);}return new Dictionary<string,object>{{"ok",true},{"version",Str(Manifest(target),"version")}};}
  if(command!="prepare"&&command!="apply")throw new Exception("UNKNOWN_COMMAND");if(Str(Manifest(target),"version")!=version)throw new Exception("INSTALLED_VERSION_MISMATCH");
  if(command=="prepare"){
   if(File.Exists(jp)){var existing=Read(jp);if(Str(existing,"phase")=="staged"&&Str(existing,"version")==Str(message,"expectedVersion"))return new Dictionary<string,object>{{"ok",true},{"prepared",true},{"version",Str(existing,"version")},{"token",Str(existing,"token")}};throw new Exception("UPDATE_PENDING_ACK");}
   var pkg=Package(Release());string next=Str(pkg,"version");if(Compare(next,version)<=0)return new Dictionary<string,object>{{"ok",true},{"upToDate",true},{"version",version}};if(next!=Str(message,"expectedVersion"))throw new Exception("RELEASE_CHANGED_CHECK_AGAIN");byte[] bytes=Fetch(Str(pkg,"url"),52428800);var staged=StageZip(target,bytes,Str(pkg,"sha256"),next,id);return new Dictionary<string,object>{{"ok",true},{"prepared",true},{"version",next},{"token",Str(staged,"token")}};
  }
  if(!File.Exists(jp))throw new Exception("INVALID_UPDATE_STAGE");var journal=Read(jp);if(Str(journal,"token")!=Str(message,"token")||Str(journal,"version")!=Str(message,"expectedVersion"))throw new Exception("INVALID_UPDATE_TOKEN");CommitStage(journal);
  try{Process.Start(new ProcessStartInfo(Executable,"--watchdog "+id+" "+Str(journal,"token")){UseShellExecute=false,CreateNoWindow=true,WindowStyle=ProcessWindowStyle.Hidden});}catch{Rollback(journal);File.Delete(jp);throw new Exception("WATCHDOG_START_FAILED");}
  return new Dictionary<string,object>{{"ok",true},{"applied",true},{"version",Str(journal,"version")},{"token",Str(journal,"token")}};
 }
 public static byte[] ReadExact(Stream s,int count){byte[] bytes=new byte[count];int offset=0,n;while(offset<count){n=s.Read(bytes,offset,count-offset);if(n==0)throw new EndOfStreamException();offset+=n;}return bytes;}
 public static void Serve(string origin){var match=Regex.Match(origin??"",@"^chrome-extension://([a-p]{32})/?$");if(!match.Success)return;string id=match.Groups[1].Value;Dictionary<string,object> reply;try{byte[] header=ReadExact(Console.OpenStandardInput(),4);int length=BitConverter.ToInt32(header,0);if(length<=0||length>16384)throw new Exception("MESSAGE_TOO_LARGE");var message=Obj(Json.DeserializeObject(new UTF8Encoding(false,true).GetString(ReadExact(Console.OpenStandardInput(),length))));using(var mutex=new Mutex(false,"Local\\UoocUpdater-"+id)){if(!mutex.WaitOne(1000))throw new Exception("UPDATER_BUSY");try{reply=Handle(message,id);}finally{mutex.ReleaseMutex();}}}catch(Exception e){string code=Regex.IsMatch(e.Message??"", "^[A-Z][A-Z0-9_]{2,90}$")?e.Message:"UPDATER_FAILED";reply=new Dictionary<string,object>{{"ok",false},{"code",code}};}byte[] output=Encoding.UTF8.GetBytes(Json.Serialize(reply));Stream stdout=Console.OpenStandardOutput();stdout.Write(BitConverter.GetBytes(output.Length),0,4);stdout.Write(output,0,output.Length);stdout.Flush();}
}
public class Program {
 [STAThread] public static void Main(string[] args){if(args.Length>=3&&args[0]=="--watchdog"){Core.Watchdog(args[1],args[2]);return;}if(args.Length==4&&args[0]=="--install"){try{Core.Install(args[1],args[2],args[3]);}catch{Environment.ExitCode=1;}return;}if(args.Length>0&&args[0].StartsWith("chrome-extension://")){Core.Serve(args[0]);return;}Application.EnableVisualStyles();Application.SetCompatibleTextRenderingDefault(false);ShowInstaller();}
 static void ShowInstaller(){Application.Run(Installer.Create());}
}
}

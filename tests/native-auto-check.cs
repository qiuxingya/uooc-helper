using System;
using System.IO;
using System.IO.Compression;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Windows.Forms;
using System.Drawing;
using UoocUpdater;
class AutoCheck {
 static void Check(bool ok,string label){if(!ok)throw new Exception(label);}
 static Dictionary<string,object> Manifest(string key=""){var m=new Dictionary<string,object>{{"name","优课学习助手"},{"manifest_version",3},{"version","2.3.0"}};if(key!="")m["key"]=key;return m;}
 static string Extension(string root,string name,string key=""){string folder=Path.Combine(root,name);Directory.CreateDirectory(folder);Core.Write(Path.Combine(folder,"manifest.json"),Manifest(key));foreach(string file in new[]{"background.js","content.js","options.html"})File.WriteAllText(Path.Combine(folder,file),"test");return folder;}
 static Dictionary<string,object> Entry(string path,int state=1,string name="优课学习助手"){return new Dictionary<string,object>{{"path",path},{"state",state},{"manifest",new Dictionary<string,object>{{"name",name}}}};}
 static void Preferences(string profile,string file,Dictionary<string,object> entries){Directory.CreateDirectory(profile);Core.Write(Path.Combine(profile,file),new Dictionary<string,object>{{"extensions",new Dictionary<string,object>{{"settings",entries}}},{"unrelated","not used or exported"}});}
 static byte[] Package(string exe){using(var output=new MemoryStream()){using(var archive=new ZipArchive(output,ZipArchiveMode.Create,true)){var files=new Dictionary<string,byte[]>{{"manifest.json",Encoding.UTF8.GetBytes(Core.Json.Serialize(Manifest()))},{"background.js",new byte[]{32}},{"content.js",new byte[]{32}},{"options.html",new byte[]{32}},{exe,File.ReadAllBytes(Core.Executable)}};foreach(var file in files){var entry=archive.CreateEntry("uooc-helper/"+file.Key);using(var stream=entry.Open())stream.Write(file.Value,0,file.Value.Length);}}return output.ToArray();}}
 [STAThread] static int Main(string[] args){try{
  string root=Path.Combine(Path.GetFullPath(args[0]),"run-"+Guid.NewGuid().ToString("N"));Directory.CreateDirectory(root);string target=Extension(root,"extension-one"),other=Extension(root,"extension-two"),id=Core.ExpectedId(target),otherId=Core.ExpectedId(other),userData=Path.Combine(root,"browser"),profile=Path.Combine(userData,"Default");
  Preferences(profile,"Secure Preferences",new Dictionary<string,object>{{id,Entry(target)}});
  Preferences(profile,"Preferences",new Dictionary<string,object>{{id,Entry(target)},{otherId,Entry(other,1,"其他扩展")}});
  var found=Discovery.Scan(userData,"edge");Check(found.Count==1&&found[0].Id==id&&found[0].Target==target,"auto detect and deduplicate");
  Preferences(Path.Combine(userData,"Profile 1"),"Preferences",new Dictionary<string,object>{{otherId,Entry(other,0)}});Check(Discovery.Scan(userData,"chrome").Count==2,"disabled installation and multiple profiles");
  Preferences(Path.Combine(userData,"Profile 2"),"Preferences",new Dictionary<string,object>{{otherId,Entry(other,2)}});Check(Discovery.Scan(userData,"edge").Count==2,"uninstalled record excluded");
  string invalid=Extension(root,"store");Directory.CreateDirectory(Path.Combine(invalid,"_metadata"));Preferences(Path.Combine(userData,"Profile 3"),"Preferences",new Dictionary<string,object>{{Core.ExpectedId(invalid),Entry(invalid)}});Check(Discovery.Scan(userData,"edge").Count==2,"store installation rejected");
  string sharedKey=Convert.ToBase64String(new byte[]{1,2,3}),a=Extension(root,"same-key-a",sharedKey),b=Extension(root,"same-key-b",sharedKey),sharedId=Core.ExpectedId(a),conflict=Path.Combine(userData,"Profile 4");Preferences(conflict,"Secure Preferences",new Dictionary<string,object>{{sharedId,Entry(a)}});Preferences(conflict,"Preferences",new Dictionary<string,object>{{sharedId,Entry(b)}});Check(!Discovery.Scan(userData,"edge").Any(c=>c.Id==sharedId),"conflicting same-id paths excluded");
  string broken=Path.Combine(userData,"Profile 5");Preferences(broken,"Preferences",new Dictionary<string,object>{{id,Entry(target)}});File.WriteAllText(Path.Combine(broken,"Secure Preferences"),"broken");Check(Discovery.Scan(userData,"edge").Count==2,"malformed file does not block other records");
  string known=Path.Combine(root,"old-helper");Directory.CreateDirectory(known);Core.Write(Path.Combine(known,"config.json"),new Dictionary<string,object>{{"installations",new object[]{new Dictionary<string,object>{{"id",id},{"target",target}},new Dictionary<string,object>{{"id",otherId},{"target",Path.Combine(root,"missing")}}}}});var existing=Discovery.Existing(known,new[]{"edge","chrome"});Check(existing.Count==2&&existing.All(c=>c.Existing),"old bindings reused without input");
  var rows=Core.RegistrationRows(new[]{new Dictionary<string,object>{{"id",id},{"target",target}}},otherId,other);Check(rows.Length==2,"preserve existing associations");var host=Core.HostManifest(rows,"helper-versioned.exe");Check(Core.Arr(host,"allowed_origins").Length==2&&!Core.Arr(host,"allowed_origins").Any(x=>x.ToString().Contains("*")),"exact native origins");try{Core.HostManifest(new[]{new Dictionary<string,object>{{"id","*"}}},"bad.exe");throw new Exception("wildcard accepted");}catch(Exception error){Check(error.Message=="INVALID_TARGET","wildcard rejected");}
  Core.Extract(Package("native-updater/UoocUpdater.exe"),Path.Combine(root,"allowed-"+Guid.NewGuid().ToString("N")));try{Core.Extract(Package("native-updater/other.exe"),Path.Combine(root,"rejected-"+Guid.NewGuid().ToString("N")));throw new Exception("other exe accepted");}catch(Exception error){Check(error.Message=="PACKAGE_FILE_TYPE_REJECTED","only exact bundled executable allowed");}
  if(args.Length>1)Core.Extract(File.ReadAllBytes(args[1]),Path.Combine(root,"actual-package"));
  Application.EnableVisualStyles();using(var form=Installer.Create(new[]{new Installation{Id=id,Target="C:\\Apps\\uooc-helper",Browser="edge",Profile="Default",Version="2.3.0",Existing=true}})){form.CreateControl();using(var image=new Bitmap(form.ClientSize.Width,form.ClientSize.Height)){using(var background=Graphics.FromImage(image))background.Clear(form.BackColor);foreach(Control control in form.Controls){if(control.Name=="browser")continue;var handle=control.Handle;control.DrawToBitmap(image,control.Bounds);var combo=control as ComboBox;if(combo!=null&&combo.SelectedItem!=null)using(var graphics=Graphics.FromImage(image))graphics.DrawString(combo.SelectedItem.ToString(),combo.Font,new SolidBrush(combo.ForeColor),combo.Left+4,combo.Top+5);}image.Save(Path.Combine(Path.GetFullPath(args[0]),"installer-preview.png"));}}
  Console.WriteLine("native auto detection, registration and bundled executable validation passed");return 0;
 }catch(Exception error){Console.Error.WriteLine(error.Message);return 1;}}
}

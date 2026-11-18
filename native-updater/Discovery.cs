using System;
using System.IO;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Text.RegularExpressions;
using System.Web.Script.Serialization;
using System.Windows.Forms;
using System.Drawing;
using System.Threading;
using Microsoft.Win32;

namespace UoocUpdater {
public sealed class Installation {
 public string Id,Target,Browser,Profile,Version;
 public bool Existing;
 public override string ToString(){return (Browser=="chrome"?"Chrome":"Edge")+" · "+(Existing?"已有关联":Profile)+" · v"+(Version??"未知");}
}
public static class Discovery {
 static Dictionary<string,object> Child(Dictionary<string,object> d,string key){object value;return d.TryGetValue(key,out value)?value as Dictionary<string,object>:null;}
 public static Dictionary<string,object> Preferences(string file){
  Core.NoLinks(file);if((File.GetAttributes(file)&FileAttributes.ReparsePoint)!=0)throw new Exception("LINK_PATH_REJECTED");using(var input=new FileStream(file,FileMode.Open,FileAccess.Read,FileShare.ReadWrite|FileShare.Delete)){
   if(input.Length>16777216)throw new Exception("PREFERENCES_TOO_LARGE");using(var reader=new StreamReader(input,Encoding.UTF8,true)){
    var json=new JavaScriptSerializer{MaxJsonLength=16777216,RecursionLimit=100};var root=json.DeserializeObject(reader.ReadToEnd()) as Dictionary<string,object>;
    if(root==null)return null;var extensions=Child(root,"extensions");return extensions==null?null:Child(extensions,"settings");
   }
  }
 }
 public static List<Installation> Scan(string root,string browser){
  var result=new List<Installation>();if(browser!="edge"&&browser!="chrome")return result;
  if(!Directory.Exists(root))return result;Core.NoLinks(root);
  foreach(string profile in Directory.GetDirectories(root).Where(p=>Regex.IsMatch(Path.GetFileName(p),@"^(Default|Profile \d{1,5})$")).Take(100)){
   try{Core.NoLinks(profile);}catch{continue;}
   // Prefer Secure Preferences. A conflicting record in the other file is not silently selected.
   var found=new Dictionary<string,Installation>();var conflicts=new HashSet<string>();
   foreach(string name in new[]{"Secure Preferences","Preferences"}){
    try{
     string file=Path.Combine(profile,name);if(!File.Exists(file))continue;var settings=Preferences(file);if(settings==null)continue;
     foreach(var entry in settings){
      if(!Regex.IsMatch(entry.Key,"^[a-p]{32}$"))continue;var value=entry.Value as Dictionary<string,object>;if(value==null)continue;
      var metadata=Child(value,"manifest");if(metadata==null||Core.Str(metadata,"name")!="优课学习助手")continue;
      object state;if(value.TryGetValue("state",out state)&&(!(state is int)||(Convert.ToInt32(state)!=0&&Convert.ToInt32(state)!=1)))continue;
      string target=Core.Str(value,"path");if(!Path.IsPathRooted(target))continue;
      try{target=Core.Full(target);Core.Target(target,entry.Key);}catch{continue;}
      Installation previous;if(found.TryGetValue(entry.Key,out previous)&&!String.Equals(previous.Target,target,StringComparison.OrdinalIgnoreCase)){conflicts.Add(entry.Key);continue;}
      found[entry.Key]=new Installation{Id=entry.Key,Target=target,Browser=browser,Profile=Path.GetFileName(profile),Version=Core.Str(Core.Manifest(target),"version")};
     }
    }catch{ /* A locked, partial or unsupported preferences file never modifies the browser. */ }
   }
   result.AddRange(found.Where(pair=>!conflicts.Contains(pair.Key)).Select(pair=>pair.Value));
  }
  return result.GroupBy(c=>c.Id+"|"+c.Browser,StringComparer.OrdinalIgnoreCase).Select(g=>g.First()).ToList();
 }
 public static List<Installation> Existing(string home,IEnumerable<string> browsers){
  var result=new List<Installation>();string file=Path.Combine(home,"config.json");if(!File.Exists(file))return result;
  try{Core.NoLinks(file);foreach(var row in Core.Arr(Core.Read(file),"installations").Select(Core.Obj)){
   string id=Core.Str(row,"id"),target=Core.Str(row,"target");try{Core.Target(target,id);}catch{continue;}
   foreach(string browser in browsers.Where(b=>b=="edge"||b=="chrome"))result.Add(new Installation{Id=id,Target=Core.Full(target),Browser=browser,Profile="已有关联",Existing=true,Version=Core.Str(Core.Manifest(target),"version")});
  }}catch{}return result;
 }
 public static List<Installation> All(){
  string local=Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),home=Path.Combine(local,"UoocHelperUpdater"),manifest=Path.Combine(home,"native-host.json");var browsers=new List<string>();
  foreach(string browser in new[]{"edge","chrome"})try{string vendor=browser=="chrome"?"Google\\Chrome":"Microsoft\\Edge";using(var key=Registry.CurrentUser.OpenSubKey("Software\\"+vendor+"\\NativeMessagingHosts\\"+Core.Host)){if(key!=null&&String.Equals(Convert.ToString(key.GetValue("")),manifest,StringComparison.OrdinalIgnoreCase))browsers.Add(browser);}}catch{}
  var result=Existing(home,browsers);
  foreach(string browser in new[]{"edge","chrome"})try{result.AddRange(Scan(Path.Combine(local,browser=="edge"?"Microsoft\\Edge\\User Data":"Google\\Chrome\\User Data"),browser));}catch{}
  return result.GroupBy(c=>c.Id+"|"+c.Browser,StringComparer.OrdinalIgnoreCase).Select(g=>g.OrderByDescending(c=>c.Existing).First()).OrderByDescending(c=>c.Existing).ThenBy(c=>c.Browser).ToList();
 }
}
public static class Installer {
 static string ErrorText(Exception error){switch(error.Message){case "EXTENSION_DIRECTORY_ID_MISMATCH":return "插件 ID 与目录不一致，请重新检测。";case "USE_STANDALONE_EXTENSION_FOLDER":return "请选择独立的解压插件目录，不能关联商店或源码仓库。";case "UPDATE_PENDING_ACK":return "插件更新尚未结束，请完成或恢复更新后重试。";case "LINK_PATH_REJECTED":return "目录含有链接，请使用普通本机目录。";default:return "安装未完成，请检查目录权限并重试。";}}
 public static Form Create(){return Create(null);}
 public static Form Create(IList<Installation> preview){
  var form=new Form{Text="优课助手 · 本机更新助手 "+Core.HelperVersion,ClientSize=new Size(650,450),StartPosition=FormStartPosition.CenterScreen,FormBorderStyle=FormBorderStyle.FixedDialog,MaximizeBox=false,AutoScaleMode=AutoScaleMode.Dpi,Font=new Font("Microsoft YaHei UI",10),BackColor=Color.FromArgb(246,250,247)};
  var title=new Label{Text="自动识别，一键关联",Location=new Point(26,24),AutoSize=true,Font=new Font("Microsoft YaHei UI",20,FontStyle.Bold),ForeColor=Color.FromArgb(22,91,70)};
  var help=new Label{Text="自动识别 Edge / Chrome 中的优课学习助手。\n升级会保留原有关联，不需要输入扩展 ID 或目录。",Location=new Point(28,77),Size=new Size(590,47)};
  var label=new Label{Text="检测到的插件",Location=new Point(28,140),AutoSize=true};
  var choices=new ComboBox{Name="installations",Location=new Point(28,169),Width=480,DropDownStyle=ComboBoxStyle.DropDownList};
  var refresh=new Button{Name="refresh",Text="重新检测",Location=new Point(520,167),Size=new Size(100,32)};
  var detail=new Label{Name="location",Location=new Point(28,214),Size=new Size(590,42),AutoEllipsis=true,ForeColor=Color.FromArgb(70,100,88)};
  var status=new Label{Name="status",Location=new Point(28,329),Size=new Size(590,48),ForeColor=Color.FromArgb(70,100,88)};
  var install=new Button{Name="install",Text="关联并安装",Location=new Point(405,275),Size=new Size(215,40),BackColor=Color.FromArgb(22,124,98),ForeColor=Color.White,FlatStyle=FlatStyle.Flat,Enabled=false};
  var browse=new Button{Name="browse",Text="手动选择文件夹",Location=new Point(28,275),Size=new Size(165,40)};
  var browser=new ComboBox{Name="browser",Location=new Point(205,281),Width=185,DropDownStyle=ComboBoxStyle.DropDownList,Visible=false};browser.Items.AddRange(new object[]{"Microsoft Edge","Google Chrome"});browser.SelectedIndex=0;
  var disconnect=new LinkLabel{Text="解除已有绑定",Location=new Point(28,398),AutoSize=true};
  var privacy=new Label{Text="只在本机读取插件安装信息；不读取密码、Cookie、Key 或上传浏览器配置。",Location=new Point(28,377),Size=new Size(590,22),Font=new Font("Microsoft YaHei UI",9),ForeColor=Color.FromArgb(95,121,108)};
  var tooltip=new ToolTip();form.Disposed+=(s,e)=>tooltip.Dispose();
  Action select=()=>{var candidate=choices.SelectedItem as Installation;install.Enabled=candidate!=null;install.Text=candidate!=null&&candidate.Existing?"升级助手并保留关联":"关联并安装";detail.Text=candidate==null?"":candidate.Target;tooltip.SetToolTip(detail,detail.Text);browser.Visible=candidate!=null&&candidate.Profile=="手动选择";};choices.SelectedIndexChanged+=(s,e)=>select();
  Action<IList<Installation>> populate=items=>{choices.Items.Clear();foreach(var candidate in items)choices.Items.Add(candidate);if(choices.Items.Count>0)choices.SelectedIndex=0;else select();refresh.Enabled=browse.Enabled=true;status.Text=items.Count==0?"未检测到插件。请先加载插件，再重新检测；特殊目录可用左侧按钮选择。":items.Count==1?"已自动识别，点击下方按钮完成安装。":"发现多个副本，请选择当前使用的浏览器或插件。";};
  Action scan=()=>{refresh.Enabled=browse.Enabled=install.Enabled=false;status.Text="正在读取插件安装信息…";ThreadPool.QueueUserWorkItem(_=>{IList<Installation> items;try{items=Discovery.All();}catch{items=new List<Installation>();}if(form.IsDisposed||!form.IsHandleCreated)return;try{form.BeginInvoke(new Action(()=>populate(items)));}catch(InvalidOperationException){}});};
  refresh.Click+=(s,e)=>scan();if(preview==null)form.Shown+=(s,e)=>scan();else populate(preview);
  browse.Click+=(s,e)=>{using(var dialog=new FolderBrowserDialog{Description="选择浏览器当前加载的独立插件文件夹，无需填写 ID"})if(dialog.ShowDialog(form)==DialogResult.OK)try{string target=Core.Full(dialog.SelectedPath),id=Core.ExpectedId(target);Core.Target(target,id);var candidate=new Installation{Id=id,Target=target,Browser="edge",Profile="手动选择",Version=Core.Str(Core.Manifest(target),"version")};choices.Items.Add(candidate);choices.SelectedItem=candidate;browser.SelectedIndex=0;status.Text="已根据文件夹自动识别 ID，请确认浏览器后安装。";}catch(Exception error){status.Text=ErrorText(error);}};
  install.Click+=(s,e)=>{var candidate=choices.SelectedItem as Installation;if(candidate==null)return;install.Enabled=refresh.Enabled=browse.Enabled=false;try{Core.Install(candidate.Id,candidate.Target,candidate.Profile=="手动选择"?(browser.SelectedIndex==1?"chrome":"edge"):candidate.Browser);status.ForeColor=Color.FromArgb(22,91,70);status.Text="已安装并保留原有关联。回到插件设置即可检测连接；首次使用仍需点击浏览器授权。";}catch(Exception error){status.ForeColor=Color.DarkRed;status.Text=ErrorText(error);}finally{install.Enabled=refresh.Enabled=browse.Enabled=true;}};
  disconnect.LinkClicked+=(s,e)=>{if(MessageBox.Show(form,"解除本机助手的浏览器绑定，不删除插件或学习数据。继续吗？","解除绑定",MessageBoxButtons.YesNo,MessageBoxIcon.Question,MessageBoxDefaultButton.Button2)!=DialogResult.Yes)return;try{Core.Disconnect();status.Text="已解除绑定，插件与学习数据保留。";}catch{status.Text="解除绑定失败，请稍后重试。";}};
  form.Controls.AddRange(new Control[]{title,help,label,choices,refresh,detail,install,browse,browser,status,privacy,disconnect});return form;
 }
}
}

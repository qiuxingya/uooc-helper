using System;
using System.Collections.Generic;
using UoocUpdater;
class StaticCheck {
 static int Main(){var d=new Dictionary<string,object>{{"format","uooc-update"},{"schemaVersion",1},{"version","2.1.3"},{"tag","v2.1.3"},{"downloadUrl","https://github.com/qiuxingya/uooc-helper/releases/download/v2.1.3/uooc-helper-2.1.3.zip"},{"size",123},{"sha256",new String('a',64)}};if(Core.Str(Core.Package(d),"version")!="2.1.3")return 1;foreach(var k in new[]{"sha256","downloadUrl","tag","format"}){var bad=new Dictionary<string,object>(d);bad[k]="invalid";try{Core.Package(bad);return 2;}catch{}}foreach(var n in new object[]{0,-1,1.5,52428801}){var bad=new Dictionary<string,object>(d);bad["size"]=n;try{Core.Package(bad);return 3;}catch{}}Console.WriteLine("native static manifest validation passed");return 0;}
}

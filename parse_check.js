var fso = new ActiveXObject("Scripting.FileSystemObject");
var file = fso.OpenTextFile("d:\\users\\26101538\\OneDrive - ARÇELİK A.Ş\\Desktop\\Budget Stock Mix Project\\arpaz-butce-webapp\\assets\\app.js",1);
var code = file.ReadAll();
file.Close();
try {
  new Function(code);
  WScript.Echo("PARSE_OK");
} catch (e) {
  WScript.Echo("PARSE_ERROR: " + (e.message || e));
  WScript.Quit(1);
}

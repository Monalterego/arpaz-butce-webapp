var fso = new ActiveXObject("Scripting.FileSystemObject");
var basePath = fso.GetParentFolderName(WScript.ScriptFullName);
var candidatePaths = [
  fso.BuildPath(basePath, "assets\\app.js"),
  fso.BuildPath(basePath, "app.js")
];
var filePath = "";
for (var i = 0; i < candidatePaths.length; i++) {
  if (fso.FileExists(candidatePaths[i])) {
    filePath = candidatePaths[i];
    break;
  }
}
if (!filePath) {
  WScript.Echo("PARSE_ERROR: app.js not found near parse_check.js");
  WScript.Quit(1);
}
var file = fso.OpenTextFile(filePath, 1);
var code = file.ReadAll();
file.Close();
try {
  new Function(code);
  WScript.Echo("PARSE_OK");
} catch (e) {
  WScript.Echo("PARSE_ERROR: " + (e.message || e));
  WScript.Quit(1);
}

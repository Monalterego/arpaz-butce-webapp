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

var nodeCandidates = [
  "D:\\node\\node-v22.11.0-win-x64\\node.exe",
  "D:\\node\\node-v22.11.0-win-x64\\node",
  "C:\\Program Files\\nodejs\\node.exe",
  "C:\\Program Files (x86)\\nodejs\\node.exe"
];
var nodeExe = "";
for (var j = 0; j < nodeCandidates.length; j++) {
  if (fso.FileExists(nodeCandidates[j])) {
    nodeExe = nodeCandidates[j];
    break;
  }
}

if (nodeExe) {
  var shell = new ActiveXObject("WScript.Shell");
  var exitCode = shell.Run('"' + nodeExe + '" --check "' + filePath + '"', 0, true);
  if (exitCode === 0) {
    WScript.Echo("PARSE_OK");
  } else {
    WScript.Echo("PARSE_ERROR: node --check failed");
    WScript.Quit(exitCode);
  }
} else {
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
}

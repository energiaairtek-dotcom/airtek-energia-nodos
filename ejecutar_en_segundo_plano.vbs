' VBScript para ejecutar el script de monitoreo en segundo plano silencioso (sin ventana CMD)
Set WshShell = CreateObject("WScript.Shell")
Set FSO = CreateObject("Scripting.FileSystemObject")
ScriptDir = FSO.GetParentFolderName(WScript.ScriptFullName)
PythonCmd = "python """ & ScriptDir & "\monitor_plantas_excel.py"""
WshShell.CurrentDirectory = ScriptDir
WshShell.Run PythonCmd, 0, False
Set WshShell = Nothing
Set FSO = Nothing

; ==============================================================================
; NetScope X — Inno Setup Script
; ==============================================================================
; Creates a standalone Windows Setup installer (NetScopeX_Setup.exe)
; with Administrator privileges support (for ETW telemetry and Firewall rules).
; ==============================================================================

#define MyAppName "NetScope X"
#define MyAppVersion "0.0.6"
#define MyAppPublisher "Ariya Ghanbari"
#define MyAppURL "https://github.com/ariya-ghanbari/NetScope-X"
#define MyAppExeName "netscope-x.exe"

[Setup]
AppId={{D0987E2B-096D-4029-99C4-933E035D7470}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppPublisher={#MyAppPublisher}
AppPublisherURL={#MyAppURL}
AppSupportURL={#MyAppURL}
AppUpdatesURL={#MyAppURL}
DefaultDirName={autopf}\{#MyAppName}
DisableProgramGroupPage=yes
; Request Administrator rights for proper ETW kernel telemetry and Windows Firewall control
PrivilegesRequired=admin
PrivilegesRequiredOverridesAllowed=dialog
OutputDir=setup_output
OutputBaseFilename=NetScopeX_v{#MyAppVersion}_Setup
SetupIconFile=src-tauri\icons\icon.ico
Compression=lzma2/ultra64
SolidCompression=yes
WizardStyle=modern

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"

[Tasks]
Name: "desktopicon"; Description: "{cm:CreateDesktopIcon}"; GroupDescription: "{cm:AdditionalIcons}"; Flags: unchecked
Name: "startupicon"; Description: "Launch NetScope X automatically on Windows startup"; GroupDescription: "Startup Options:"

[Files]
; Primary Release Binary
Source: "src-tauri\target\release\{#MyAppExeName}"; DestDir: "{app}"; Flags: ignoreversion
; Include icons and required application assets if not bundled inside exe
Source: "src-tauri\icons\*"; DestDir: "{app}\icons"; Flags: ignoreversion recursesubdirs createallsubdirs

[Icons]
Name: "{autoprograms}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"; IconFilename: "{app}\{#MyAppExeName}"
Name: "{autodesktop}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"; Tasks: desktopicon; IconFilename: "{app}\{#MyAppExeName}"
Name: "{commonstartup}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"; Tasks: startupicon; IconFilename: "{app}\{#MyAppExeName}"

[Run]
Filename: "{app}\{#MyAppExeName}"; Description: "{cm:LaunchProgram,{#StringChange(MyAppName, '&', '&&')}}"; Flags: nowait postinstall skipifsilent runascurrentuser

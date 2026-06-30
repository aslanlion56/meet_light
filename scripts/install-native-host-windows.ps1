param(
  [Parameter(Mandatory = $false)]
  [string]$ExtensionId = "hgcljcenaadbkdbmfnhbdnaednbbijhi"
)

$ErrorActionPreference = "Stop"

function Test-ExtensionId {
  param([string]$Id)
  if ($Id -notmatch '^[a-p]{32}$') {
    throw "ID de extensión inválido: $Id"
  }
}

Test-ExtensionId -Id $ExtensionId

$ProjectDir = Resolve-Path (Join-Path $PSScriptRoot "..")
$HostRunnerPath = Join-Path $ProjectDir "native-host\run-host.cmd"
$ManifestDir = Join-Path $env:LOCALAPPDATA "MeetLight\NativeMessagingHosts"
$ManifestPath = Join-Path $ManifestDir "com.meetlight.serial_host.json"
$RegistryPath = "HKCU:\Software\Google\Chrome\NativeMessagingHosts\com.meetlight.serial_host"
$NodePathFile = Join-Path $ProjectDir "native-host\.node-path"

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  throw "Node.js no está instalado. Instálalo y vuelve a ejecutar."
}

$NativeHostDir = Join-Path $ProjectDir "native-host"
if (-not (Test-Path (Join-Path $NativeHostDir "node_modules"))) {
  Write-Output "Instalando dependencias del host nativo..."
  Push-Location $NativeHostDir
  npm ci 2>$null
  if ($LASTEXITCODE -ne 0) { npm install }
  Pop-Location
}

$NodeBin = (Get-Command node).Source
Set-Content -Path $NodePathFile -Value $NodeBin -NoNewline -Encoding ascii

New-Item -ItemType Directory -Path $ManifestDir -Force | Out-Null

$manifest = [ordered]@{
  name = "com.meetlight.serial_host"
  description = "Meet Light Native Serial Host"
  path = $HostRunnerPath
  type = "stdio"
  allowed_origins = @("chrome-extension://$ExtensionId/")
}

$json = ($manifest | ConvertTo-Json -Depth 4) + "`n"
[System.IO.File]::WriteAllText($ManifestPath, $json, [System.Text.UTF8Encoding]::new($false))

New-Item -Path $RegistryPath -Force | Out-Null
Set-ItemProperty -Path $RegistryPath -Name "(default)" -Value $ManifestPath

Write-Output "Host nativo instalado."
Write-Output "Manifest: $ManifestPath"
Write-Output "Registro: $RegistryPath"
Write-Output "Node.js usado: $NodeBin"
Write-Output "Extension ID registrado: $ExtensionId"

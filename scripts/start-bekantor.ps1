$ErrorActionPreference = "Stop"
$projectRoot = Split-Path -Parent $PSScriptRoot
$serverDirectory = Join-Path $projectRoot "server"

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  Write-Error "Node.js no está disponible. Instalalo antes de iniciar BEKANTOR."
  exit 1
}

Push-Location -LiteralPath $serverDirectory
$lock = $null
$lockHeld = $false
$startedOllama = $null
$startedNode = $null
try {
  # Pass module source through stdin so native argument parsing cannot strip
  # JavaScript import quotes on Windows PowerShell 5.1.
  $configurationScript = @'
import "./src/config/env.js";
import { ollamaUrl } from "./src/services/ollama-status.service.js";
console.log(JSON.stringify({ port: process.env.PORT || "3000", ollamaUrl }));
'@
  $configuration = $configurationScript | & node --input-type=module
  if ($LASTEXITCODE -ne 0) { throw "Configuración local inválida." }
  $settings = $configuration | ConvertFrom-Json
  $apiPort = 0
  if (-not [int]::TryParse($settings.port, [ref]$apiPort) -or $apiPort -lt 1 -or $apiPort -gt 65535) { throw "PORT debe ser un puerto entre 1 y 65535." }
  $lock = [Threading.Mutex]::new($false, "Local\BEKANTOR-Port-$apiPort")
  try { $lockHeld = $lock.WaitOne(0) } catch [Threading.AbandonedMutexException] { $lockHeld = $true }
  if (-not $lockHeld) { Write-Host "BEKANTOR ya está iniciándose o ejecutándose en el puerto $apiPort."; return }
  $socket = [Net.Sockets.TcpClient]::new()
  try {
    $socket.Connect("127.0.0.1", $apiPort)
    Write-Host "El puerto $apiPort ya está ocupado. No se iniciará otra instancia de BEKANTOR."
    return
  } catch { } finally { $socket.Dispose() }
  $ollamaEndpoint = $settings.ollamaUrl
try {
  Invoke-RestMethod -Uri "$ollamaEndpoint/api/tags" -MaximumRedirection 0 -TimeoutSec 3 | Out-Null
  Write-Host "Ollama: disponible."
} catch {
  $ollama = Get-Command ollama -ErrorAction SilentlyContinue
  if (-not $ollama) {
    $installedOllama = Join-Path $env:LOCALAPPDATA "Programs\Ollama\ollama.exe"
    if (Test-Path -LiteralPath $installedOllama) { $ollama = Get-Item -LiteralPath $installedOllama }
  }
  if ($ollama) {
    Write-Host "Iniciando Ollama local..."
    $ollamaExecutable = if ($ollama.Source) { $ollama.Source } else { $ollama.FullName }
    $previousHost = $env:OLLAMA_HOST
    try {
      $env:OLLAMA_HOST = ([Uri]$ollamaEndpoint).Authority
      $startedOllama = Start-Process -FilePath $ollamaExecutable -ArgumentList "serve" -WindowStyle Hidden -PassThru
    } finally { $env:OLLAMA_HOST = $previousHost }
    for ($attempt = 0; $attempt -lt 15; $attempt++) {
      Start-Sleep -Seconds 1
      try {
        Invoke-RestMethod -Uri "$ollamaEndpoint/api/tags" -MaximumRedirection 0 -TimeoutSec 2 | Out-Null
        Write-Host "Ollama: disponible."
        break
      } catch {
        if ($attempt -eq 14) { Write-Warning "Ollama aún no responde. BEKANTOR iniciará y mostrará su estado." }
      }
    }
  } else {
    Write-Warning "Ollama no está instalado o no está en PATH. El dashboard seguirá disponible."
  }
}

Write-Host "Iniciando BEKANTOR Private AI..."
$startedNode = Start-Process -FilePath (Get-Command node).Source -ArgumentList "src/app.js" -NoNewWindow -PassThru
while (-not $startedNode.HasExited) { Start-Sleep -Milliseconds 200 }
if ($startedNode.ExitCode -ne 0) { Write-Warning "BEKANTOR terminó con un error. Revisá los mensajes anteriores." }
} finally {
  if ($startedNode -and -not $startedNode.HasExited) { Stop-Process -Id $startedNode.Id -ErrorAction SilentlyContinue }
  if ($startedOllama -and -not $startedOllama.HasExited) { Stop-Process -Id $startedOllama.Id -ErrorAction SilentlyContinue }
  if ($lockHeld) { $lock.ReleaseMutex() }
  if ($lock) { $lock.Dispose() }
  Pop-Location
}

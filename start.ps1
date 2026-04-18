# ScriptToVideo AI Pipeline — Windows Startup Script
# Run from the project root: .\start.ps1
#
# Prerequisites:
#   - Redis running (redis-server or Docker)
#   - Python venv activated in backend/
#   - npm packages installed in frontend/
#
# Usage:
#   .\start.ps1           - Starts backend + Celery + frontend
#   .\start.ps1 -Backend  - Backend + Celery only
#   .\start.ps1 -Frontend - Frontend only

param(
    [switch]$Backend,
    [switch]$Frontend
)

$BackendDir = Join-Path $PSScriptRoot "backend"
$FrontendDir = Join-Path $PSScriptRoot "frontend"

# Detect venv location
$VenvActivate = $null
if (Test-Path (Join-Path $BackendDir "venv\Scripts\Activate.ps1")) {
    $VenvActivate = Join-Path $BackendDir "venv\Scripts\Activate.ps1"
} elseif (Test-Path (Join-Path $BackendDir ".venv\Scripts\Activate.ps1")) {
    $VenvActivate = Join-Path $BackendDir ".venv\Scripts\Activate.ps1"
}

function Start-Backend {
    Write-Host "Starting FastAPI backend on http://localhost:8000 ..." -ForegroundColor Cyan
    Start-Process powershell -ArgumentList "-NoExit", "-Command", @"
Set-Location '$BackendDir'
if ('$VenvActivate' -ne '') { & '$VenvActivate' }
uvicorn api:app --reload --host 0.0.0.0 --port 8000
"@
}

function Start-Celery {
    Write-Host "Starting Celery worker (--pool=solo) ..." -ForegroundColor Cyan
    Start-Process powershell -ArgumentList "-NoExit", "-Command", @"
Set-Location '$BackendDir'
if ('$VenvActivate' -ne '') { & '$VenvActivate' }
celery -A workers.celery_app worker --pool=solo --loglevel=info --concurrency=1
"@
}

function Start-Frontend {
    Write-Host "Starting Next.js frontend on http://localhost:3000 ..." -ForegroundColor Cyan
    Start-Process powershell -ArgumentList "-NoExit", "-Command", @"
Set-Location '$FrontendDir'
npm run dev
"@
}

if ($Backend) {
    Start-Backend
    Start-Sleep 2
    Start-Celery
} elseif ($Frontend) {
    Start-Frontend
} else {
    # Default: start everything
    Start-Backend
    Start-Sleep 2
    Start-Celery
    Start-Sleep 3
    Start-Frontend

    Write-Host ""
    Write-Host "==================================================" -ForegroundColor Green
    Write-Host "  ScriptToVideo AI Pipeline is starting up!" -ForegroundColor Green
    Write-Host "  Frontend:  http://localhost:3000" -ForegroundColor Yellow
    Write-Host "  Backend:   http://localhost:8000" -ForegroundColor Yellow
    Write-Host "  API Docs:  http://localhost:8000/docs" -ForegroundColor Yellow
    Write-Host "==================================================" -ForegroundColor Green
}

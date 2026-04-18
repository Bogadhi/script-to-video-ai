$timestamp = [DateTimeOffset]::Now.ToUnixTimeSeconds()
$username = "testuser_$timestamp@example.com"
$password = "password123"

Write-Host "--- Testing Registration ---"
$regBody = @{ username = $username; password = $password } | ConvertTo-Json
$regRes = Invoke-RestMethod -Uri "http://localhost:5002/api/auth/register" -Method Post -Body $regBody -ContentType "application/json"
$regRes | Format-List

Write-Host "`n--- Testing Login ---"
$loginBody = @{ username = $username; password = $password } | ConvertTo-Json
$loginRes = Invoke-RestMethod -Uri "http://localhost:5002/api/auth/login" -Method Post -Body $loginBody -ContentType "application/json"
$loginRes | Format-List
$token = $loginRes.token

Write-Host "`n--- Testing /me ---"
$meRes = Invoke-RestMethod -Uri "http://localhost:5002/api/auth/me" -Method Get -Headers @{ Authorization = "Bearer $token" }
$meRes | Format-List

Write-Host "`n--- Testing /api/ads ---"
$adsRes = Invoke-RestMethod -Uri "http://localhost:5002/api/ads" -Method Get
$adsRes | Format-Table

Write-Host "`n--- Testing Generation Proxy (/api/scripts/create) ---"
$genBody = @{
    script_text = "Once upon a time in a digital world..."
    visual_style = "cinematic"
    voice_style = "professional"
} | ConvertTo-Json
try {
    $genRes = Invoke-RestMethod -Uri "http://localhost:5002/api/scripts/create" -Method Post -Body $genBody -Headers @{ Authorization = "Bearer $token" } -ContentType "application/json"
    $genRes | Format-List
} catch {
    Write-Error "Generation Proxy Failed: $_"
    $_.ErrorRecord | Select-Object *
}

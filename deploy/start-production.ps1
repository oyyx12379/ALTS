param(
  [int]$Port = 3001,
  [string]$PublicOrigin = "",
  [string]$JwtSecret = "",
  [string]$ClientDistPath = "../client/dist"
)

if (-not $JwtSecret) {
  $JwtSecret = [guid]::NewGuid().ToString("N") + [guid]::NewGuid().ToString("N")
  Write-Host "Generated temporary JWT secret for this process."
}

$env:NODE_ENV = "production"
$env:PORT = "$Port"
$env:JWT_SECRET = $JwtSecret
$env:CLIENT_DIST_PATH = $ClientDistPath

if ($PublicOrigin) {
  $env:PUBLIC_ORIGIN = $PublicOrigin.TrimEnd("/")
  $env:CORS_ORIGINS = $env:PUBLIC_ORIGIN
} else {
  $env:CORS_ORIGINS = "*"
}

Push-Location "$PSScriptRoot\..\server"
try {
  npm.cmd run start:prod
} finally {
  Pop-Location
}

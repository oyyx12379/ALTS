param(
  [string]$Url = "http://localhost:3001"
)

& "$PSScriptRoot\cloudflared.exe" tunnel --url $Url

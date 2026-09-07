param(
  [Parameter(Mandatory = $true)]
  [string]$TunnelName
)

& "$PSScriptRoot\cloudflared.exe" tunnel run $TunnelName

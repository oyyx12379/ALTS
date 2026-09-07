@echo off
setlocal
set "HERE=%~dp0"
"%HERE%cloudflared.exe" tunnel --url http://localhost:3001 1>"%HERE%quick-tunnel.out.log" 2>"%HERE%quick-tunnel.err.log"

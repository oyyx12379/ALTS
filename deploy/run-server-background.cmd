@echo off
setlocal
set "ROOT=%~dp0.."
cd /d "%ROOT%\server"
node dist\index.js 1>>"%ROOT%\deploy\server.out.log" 2>>"%ROOT%\deploy\server.err.log"

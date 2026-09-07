@echo off
setlocal

set "ROOT=%~dp0.."
set "NODE_ENV=production"
set "PORT=3001"
if "%JWT_SECRET%"=="" set "JWT_SECRET=local-temporary-secret-change-me"
set "CLIENT_DIST_PATH=..\client\dist"
set "CORS_ORIGINS=*"

cd /d "%ROOT%\server"
node dist\index.js >> "%ROOT%\deploy\server.out.log" 2>> "%ROOT%\deploy\server.err.log"

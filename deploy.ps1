param(
    [string]$SiteName = "appname"
)

Write-Host "Deploying"
Write-Host "Application: $SiteName"
Write-Host "Env:"
Get-ChildItem Env: | Sort Name

pm2 flush $SiteName
pm2 delete $SiteName
Start-Sleep -Seconds 1
npm run build
pm2 start dist/index.js --name "$SiteName" --no-autorestart

Write-Host "Deployment completed successfully!" -ForegroundColor Green

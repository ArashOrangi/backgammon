# param(
#     [string]$SiteName = "appname"
# )

# Write-Host "Deploying"
# Write-Host "Application: $SiteName"
# Write-Host "Env:"
# Get-ChildItem Env: | Sort Name

# pm2 flush $SiteName
# pm2 delete $SiteName
# Start-Sleep -Seconds 1
# npm run build
# pm2 start dist/index.js --name "$SiteName" --no-autorestart -o ./out_new.log -e ./err.log

# Write-Host "Deployment completed successfully!" -ForegroundColor Green

param(
    [string]$SiteName = "appname"
)

$ErrorActionPreference = "Stop"

Write-Host "========================================"
Write-Host "Starting deployment..."
Write-Host "Application: $SiteName"
Write-Host "========================================"

Write-Host "`nEnvironment Variables:"
Get-ChildItem Env: | Sort-Object Name

# بررسی وجود برنامه در PM2
Write-Host "`nChecking PM2..."

$pm2List = pm2 jlist | ConvertFrom-Json
$app = $pm2List | Where-Object { $_.name -eq $SiteName }

if ($app) {
    Write-Host "PM2 process found. Stopping..."

    pm2 flush $SiteName

    try {
        pm2 stop $SiteName
    }
    catch {
        Write-Warning "Unable to stop process. Continuing..."
    }

    try {
        pm2 delete $SiteName
    }
    catch {
        Write-Warning "Unable to delete process. Continuing..."
    }

    Start-Sleep -Seconds 1
}
else {
    Write-Host "PM2 process '$SiteName' does not exist. Skipping stop/delete."
}

Write-Host "`nBuilding application..."
npm run build

if ($LASTEXITCODE -ne 0) {
    throw "Build failed."
}

Write-Host "`nStarting application with PM2..."

pm2 start dist/index.js `
    --name $SiteName `
    --no-autorestart `
    -o ./out_new.log `
    -e ./err.log

if ($LASTEXITCODE -ne 0) {
    throw "PM2 start failed."
}

Write-Host "`nSaving PM2 process list..."
pm2 save

Write-Host ""
Write-Host "========================================" -ForegroundColor Green
Write-Host "Deployment completed successfully!" -ForegroundColor Green
Write-Host "Application: $SiteName" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green

Write-Host "`nPM2 Status:"
pm2 status
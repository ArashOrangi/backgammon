param(
    [string]$SiteName = "appname"
)

Write-Host "Deploying $SiteName"

# Stop application
pm2 stop $SiteName 2>$null
pm2 delete $SiteName 2>$null

Start-Sleep -Seconds 3

# Build
npm run build

# Start
pm2 start dist/index.js `
    --name $SiteName `
    --no-autorestart `
    -o out_new.log `
    -e err.log

pm2 save

Write-Host "Deployment completed."
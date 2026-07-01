param(
    [string]$SiteName = "backgammon-server"
)

$DeployPath = "C:\Apps\BackgammonServer"

Write-Host "Stopping application..."

pm2 stop $SiteName 2>$null
pm2 delete $SiteName 2>$null

Write-Host "Building..."
npm run build

if ($LASTEXITCODE -ne 0) {
    throw "Build failed."
}

Write-Host "Copying files..."

if (!(Test-Path $DeployPath)) {
    New-Item -ItemType Directory -Path $DeployPath | Out-Null
}

robocopy dist "$DeployPath\dist" /MIR
robocopy prisma "$DeployPath\prisma" /MIR

Copy-Item package.json "$DeployPath\" -Force
Copy-Item package-lock.json "$DeployPath\" -Force

Write-Host "Installing production packages..."

Push-Location $DeployPath

npm install --omit=dev

pm2 start dist/index.js --name $SiteName

pm2 save

Pop-Location

Write-Host "Deploy finished."
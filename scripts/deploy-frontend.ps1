param (
    [string]$BucketName,
    [string]$DistId,
    [string]$WsUrl
)

$ErrorActionPreference = "Stop"

# If not provided, fetch outputs from CloudFormation
if (-not $BucketName -or -not $DistId -or -not $WsUrl) {
    Write-Host "Fetching stack outputs for collab-whiteboard..." -ForegroundColor Cyan
    try {
        $Outputs = aws cloudformation describe-stacks --stack-name collab-whiteboard --region us-east-1 --query "Stacks[0].Outputs" --output json | ConvertFrom-Json
        if (-not $WsUrl) {
            $WsUrl = ($Outputs | Where-Object { $_.OutputKey -eq "WebSocketUrl" }).OutputValue
        }
        if (-not $BucketName) {
            $BucketName = ($Outputs | Where-Object { $_.OutputKey -eq "FrontendBucketName" }).OutputValue
        }
        if (-not $DistId) {
            $DistId = ($Outputs | Where-Object { $_.OutputKey -eq "CloudFrontDistributionId" }).OutputValue
        }
    } catch {
        Write-Warning "Could not automatically fetch stack outputs: $_"
    }
}

# Fallback for WsUrl from frontend/.env.local if needed
if (-not $WsUrl -and (Test-Path "$PSScriptRoot/../frontend/.env.local")) {
    $envContent = Get-Content "$PSScriptRoot/../frontend/.env.local"
    foreach ($line in $envContent) {
        if ($line -match "^VITE_WS_URL=(.+)$") {
            $WsUrl = $matches[1].Trim()
        }
    }
}

if (-not $BucketName) {
    Write-Error "BucketName is required. Either deploy the template with FrontendBucket or pass -BucketName <name>."
}
if (-not $DistId) {
    Write-Error "CloudFrontDistributionId is required. Either deploy the template with FrontendDistribution or pass -DistId <id>."
}

# 1. Build with VITE_WS_URL set
Write-Host "`n1. Building frontend with VITE_WS_URL=$WsUrl..." -ForegroundColor Cyan
Push-Location "$PSScriptRoot/../frontend"
try {
    if ($WsUrl) {
        $env:VITE_WS_URL = $WsUrl
    }
    npm run build
} finally {
    Pop-Location
}

# 2. Upload frontend/dist with aws s3 sync
Write-Host "`n2. Uploading frontend/dist with aws s3 sync to s3://$BucketName..." -ForegroundColor Cyan
aws s3 sync "$PSScriptRoot/../frontend/dist" "s3://$BucketName" --delete

# 3. Create a CloudFront invalidation
Write-Host "`n3. Creating CloudFront invalidation for distribution $DistId..." -ForegroundColor Cyan
aws cloudfront create-invalidation --distribution-id $DistId --paths "/*"

Write-Host "`nFrontend deployment successfully completed!" -ForegroundColor Green

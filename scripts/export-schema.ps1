#requires -Version 5.1
param(
    [string]$Output = "schema.sql",
    [string]$Schema,
    [string]$Table,
    [switch]$RequireSSL
)

# Load .env from backend folder
$envPath = Join-Path (Split-Path $PSCommandPath -Parent) "..\.env"
if (Test-Path $envPath) {
    Get-Content $envPath | ForEach-Object {
        if ($_ -match '^(\w+)=(.*)$') {
            $name = $matches[1]
            $value = $matches[2]
            [Environment]::SetEnvironmentVariable($name, $value)
        }
    }
}

$databaseUrl = $env:DATABASE_URL
if (-not $databaseUrl) {
    Write-Error "DATABASE_URL no está definido en .env ni en el entorno."
    exit 1
}

if ($RequireSSL -or $databaseUrl -notmatch 'sslmode=') {
    # Append sslmode=require if not present
    if ($databaseUrl -match '\?') { $databaseUrl = "$databaseUrl&sslmode=require" } else { $databaseUrl = "$databaseUrl?sslmode=require" }
}

# Build pg_dump args
$dumpArgs = @('-s', $databaseUrl)
if ($Schema) { $dumpArgs = @('-s', '-n', $Schema, $databaseUrl) }
if ($Table) { $dumpArgs = @('-s', '-t', $Table, $databaseUrl) }

# Use Docker to ensure pg_dump 17.x is available
$cmd = @(
    'docker', 'run', '--rm', 'postgres:17-alpine',
    'pg_dump'
) + $dumpArgs

Write-Host "Ejecutando: $($cmd -join ' ')" -ForegroundColor Cyan

# Run and write to output file
$process = Start-Process -FilePath $cmd[0] -ArgumentList ($cmd[1..($cmd.Length-1)]) -NoNewWindow -RedirectStandardOutput $Output -PassThru
$process.WaitForExit()

if ($process.ExitCode -eq 0) {
    Write-Host "Schema exportado a $Output" -ForegroundColor Green
} else {
    Write-Error "pg_dump falló con código $($process.ExitCode). Revisa Docker y la DATABASE_URL."
}

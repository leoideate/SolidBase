# Backup the local Docker Postgres database to backups/<db>-<timestamp>.dump (custom format).
# Production should use the managed database's automated backups plus point-in-time recovery;
# this script demonstrates the backup/restore procedure required by Q05.
param(
  [string]$Database = "attendance",
  [string]$Container = "solid-db-1",
  [string]$OutDir = "backups"
)
$ErrorActionPreference = "Stop"
New-Item -ItemType Directory -Force $OutDir | Out-Null
$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$file = Join-Path $OutDir "$Database-$stamp.dump"
docker exec $Container pg_dump -U attendance -d $Database -Fc -f /tmp/backup.dump
if ($LASTEXITCODE -ne 0) { throw "pg_dump failed" }
docker cp "${Container}:/tmp/backup.dump" $file
docker exec $Container rm /tmp/backup.dump
Write-Output "Backup written to $file ($((Get-Item $file).Length) bytes)"

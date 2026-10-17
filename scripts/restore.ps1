# Restore a backup into a NEW database (never overwrites the source) and compare row counts.
# Usage: ./scripts/restore.ps1 -File backups/attendance-20261017-120000.dump [-Target attendance_restore]
param(
  [Parameter(Mandatory = $true)][string]$File,
  [string]$Target = "attendance_restore",
  [string]$Source = "attendance",
  [string]$Container = "solid-db-1"
)
$ErrorActionPreference = "Stop"
if (-not (Test-Path $File)) { throw "Backup file not found: $File" }
docker cp $File "${Container}:/tmp/restore.dump"
docker exec $Container dropdb -U attendance --if-exists $Target
docker exec $Container createdb -U attendance $Target
docker exec $Container pg_restore -U attendance -d $Target --no-owner /tmp/restore.dump
if ($LASTEXITCODE -ne 0) { throw "pg_restore failed" }
docker exec $Container rm /tmp/restore.dump

$tables = "users","company_members","projects","job_roles","rates","timesheets","timesheet_versions","work_entries","entry_revisions","exports","audit_log"
$ok = $true
foreach ($t in $tables) {
  $a = (docker exec $Container psql -U attendance -d $Source -tAc "select count(*) from $t").Trim()
  $b = (docker exec $Container psql -U attendance -d $Target -tAc "select count(*) from $t").Trim()
  $status = if ($a -eq $b) { "OK" } else { $ok = $false; "MISMATCH" }
  Write-Output ("{0,-20} source={1,-6} restored={2,-6} {3}" -f $t, $a, $b, $status)
}
if ($ok) { Write-Output "Restore verified: row counts match." } else { throw "Row counts differ." }

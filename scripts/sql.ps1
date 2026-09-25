# Exécute une requête SQL sur la base Supabase via l'API Management.
# Usage : .\scripts\sql.ps1 -File chemin.sql   ou   .\scripts\sql.ps1 -Query "select 1"
# Le jeton SUPABASE_ACCESS_TOKEN est lu dans .env.project.local et n'est jamais affiché.
param([string]$File, [string]$Query, [switch]$ReadOnly)

$ErrorActionPreference = "Stop"
$root = Split-Path $PSScriptRoot -Parent
$envFile = Join-Path $root ".env.project.local"
$vars = @{}
Get-Content $envFile | Where-Object { $_ -match '^\s*[A-Z_]+=' } | ForEach-Object {
  $n, $v = $_ -split '=', 2
  $vars[$n.Trim()] = $v.Trim().Trim('"')
}
$ref = ([uri]$vars["SUPABASE_URL"]).Host.Split(".")[0]
$sql = if ($File) { [IO.File]::ReadAllText((Resolve-Path $File)) } else { $Query }
$body = @{ query = $sql }
if ($ReadOnly) { $body.read_only = $true }
$json = $body | ConvertTo-Json -Compress
$bytes = [Text.Encoding]::UTF8.GetBytes($json)
# Invoke-WebRequest + décodage UTF-8 explicite : Windows PowerShell 5.1 lit sinon la réponse en Latin-1.
$res = Invoke-WebRequest -UseBasicParsing -Method Post -Uri "https://api.supabase.com/v1/projects/$ref/database/query" `
  -Headers @{ Authorization = "Bearer $($vars['SUPABASE_ACCESS_TOKEN'])" } `
  -ContentType "application/json; charset=utf-8" -Body $bytes
$texte = [Text.Encoding]::UTF8.GetString($res.RawContentStream.ToArray())
$texte

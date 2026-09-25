# Indexe les documents OneDrive des projets dans gestion_projets.documents (noms, dossiers, dates ; pas le contenu).
# Ne lit que les dossiers de travail (01- à 06-, 99-archives) ; ignore pieces-jointes, docs, data, identite, .claude.
# Un fichier disparu est marqué present = false (lien « introuvable » dans l'appli), jamais supprimé de force.
# Usage : .\scripts\indexer-documents.ps1
param([string]$Racine = "$env:USERPROFILE\OneDrive - EPCI DE CORSE\Projets européens")

$ErrorActionPreference = "Stop"
$projets = & (Join-Path $PSScriptRoot "sql.ps1") -ReadOnly -Query "select id, dossier from gestion_projets.projets where dossier is not null" | ConvertFrom-Json

$lignes = New-Object System.Collections.Generic.List[object]
foreach ($p in $projets) {
  $base = Join-Path $Racine $p.dossier
  if (-not (Test-Path -LiteralPath $base)) { Write-Warning "Dossier absent : $base"; continue }
  Get-ChildItem -LiteralPath $base -Directory | Where-Object { $_.Name -match '^(0[1-9]|99)-' } | ForEach-Object {
    $dossier = $_.Name
    # Métadonnées seules : ne force pas le téléchargement des fichiers « à la demande ».
    Get-ChildItem -LiteralPath $_.FullName -Recurse -File -Force | Where-Object {
      $_.Name -notmatch '^(~\$|\.|desktop\.ini$|Thumbs\.db$)' -and -not ($_.Attributes -band [IO.FileAttributes]::Hidden)
    } | ForEach-Object {
      $lignes.Add([ordered]@{
        projet_id  = $p.id
        dossier    = $dossier
        chemin     = $_.FullName.Substring($Racine.Length + 1).Replace('\', '/')
        nom        = $_.Name
        extension  = $_.Extension.TrimStart('.').ToLower()
        taille     = $_.Length
        modifie_le = $_.LastWriteTimeUtc.ToString("yyyy-MM-ddTHH:mm:ssZ")
      })
    }
  }
}

$json = ConvertTo-Json -InputObject $lignes.ToArray() -Depth 3 -Compress
if ($json.Contains('$idx$')) { throw "Délimiteur `$idx`$ présent dans les noms de fichiers." }
$sql = @"
with d as (select `$idx`$$json`$idx`$::jsonb as j),
r as (
  select * from d, jsonb_to_recordset(d.j) as x(projet_id uuid, dossier text, chemin text, nom text, extension text, taille bigint, modifie_le timestamptz)
),
up as (
  insert into gestion_projets.documents (projet_id, dossier, chemin, nom, extension, taille, modifie_le, present, indexe_le)
  select projet_id, dossier, chemin, nom, extension, taille, modifie_le, true, now() from r
  on conflict (chemin) do update set dossier = excluded.dossier, nom = excluded.nom, extension = excluded.extension,
    taille = excluded.taille, modifie_le = excluded.modifie_le, present = true, indexe_le = now()
  returning 1
),
absents as (
  update gestion_projets.documents set present = false
  where present and chemin not in (select chemin from r)
  returning 1
),
p as (
  insert into gestion_projets.parametres (cle, valeur) values ('documents_indexe_le', to_char(now() at time zone 'Europe/Paris', 'YYYY-MM-DD"T"HH24:MI'))
  on conflict (cle) do update set valeur = excluded.valeur, updated_at = now()
  returning 1
)
select (select count(*) from up) as indexes, (select count(*) from absents) as devenus_introuvables, (select count(*) from p) as date_maj;
"@
$tmp = Join-Path ([IO.Path]::GetTempPath()) ("index-" + [guid]::NewGuid() + ".sql")
[IO.File]::WriteAllText($tmp, $sql, (New-Object Text.UTF8Encoding $false))
try { & (Join-Path $PSScriptRoot "sql.ps1") -File $tmp } finally { Remove-Item $tmp -ErrorAction SilentlyContinue }

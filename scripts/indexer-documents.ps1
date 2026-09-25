# Indexe les documents OneDrive des projets dans gestion_projets.documents (noms, dossiers, dates ; pas le contenu).
# Lit les dossiers de travail (01- à 06-, 99-), identite, pieces-jointes et la boîte à outils _commun ; ignore docs, data, .claude.
# Un fichier disparu est marqué present = false (lien « introuvable » dans l'appli), jamais supprimé de force.
# Usage : .\scripts\indexer-documents.ps1
param([string]$Racine = "$env:USERPROFILE\OneDrive - EPCI DE CORSE\Projets européens")

$ErrorActionPreference = "Stop"
$projets = & (Join-Path $PSScriptRoot "sql.ps1") -ReadOnly -Query "select id, dossier from gestion_projets.projets where dossier is not null" | ConvertFrom-Json

$lignes = New-Object System.Collections.Generic.List[object]

# Ajoute les fichiers d'un dossier (récursif). Métadonnées seules : ne force pas le téléchargement des fichiers « à la demande ».
function Ajouter([string]$chemin, $projetId, [string]$dossier, [string]$exclure) {
  Get-ChildItem -LiteralPath $chemin -Recurse -File -Force | Where-Object {
    $_.Name -notmatch '^(~\$|\.|desktop\.ini$|Thumbs\.db$)' -and -not ($_.Attributes -band [IO.FileAttributes]::Hidden) -and
    -not ($exclure -and $_.FullName -like "$exclure*")
  } | ForEach-Object {
    $lignes.Add([ordered]@{
      projet_id  = $projetId
      dossier    = $dossier
      chemin     = $_.FullName.Substring($Racine.Length + 1).Replace('\', '/')
      nom        = $_.Name
      extension  = $_.Extension.TrimStart('.').ToLower()
      taille     = $_.Length
      modifie_le = $_.LastWriteTimeUtc.ToString("yyyy-MM-ddTHH:mm:ssZ")
    })
  }
}

# Projets : dossiers de travail (01- à 06-, 99-), identite, pieces-jointes (visibles par l'admin seul, cf. RLS).
foreach ($p in $projets) {
  $base = Join-Path $Racine $p.dossier
  if (-not (Test-Path -LiteralPath $base)) { Write-Warning "Dossier absent : $base"; continue }
  Get-ChildItem -LiteralPath $base -Directory | Where-Object { $_.Name -match '^((0[1-9]|99)-|identite$|pieces-jointes$)' } | ForEach-Object {
    Ajouter $_.FullName $p.id $_.Name $null
  }
}

# Boîte à outils commune (aucun projet) : modèles (sans leurs sources), logos, kit du programme.
foreach ($s in 'modeles', 'logos', 'kit-programme') {
  $c = Join-Path $Racine "_commun\$s"
  if (Test-Path -LiteralPath $c) { Ajouter $c $null "commun/$s" (Join-Path $c 'source') }
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

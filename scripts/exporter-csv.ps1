# Exporte les données de l'appli vers <Projets européens>\<projet>\data\ pour les sessions Claude des projets :
# actions.csv, echeances.csv, livrables.csv, finances.csv. La base fait foi ; ces fichiers en sont une copie datée.
# Format Excel français : séparateur « ; », UTF-8 avec BOM, dates JJ/MM/AAAA, montants 1234,56.
# Usage : .\scripts\exporter-csv.ps1   (ou -Projet JASON)
param([string]$Racine = "$env:USERPROFILE\OneDrive - EPCI DE CORSE\Projets européens", [string]$Projet)

$ErrorActionPreference = "Stop"
$sql = Join-Path $PSScriptRoot "sql.ps1"
$d = "to_char({0}, 'DD/MM/YYYY')"
$m = "replace(({0})::text, '.', ',')"

$filtre = if ($Projet) { "and acronyme = '$($Projet.Replace("'", "''"))'" } else { "" }
$projets = & $sql -ReadOnly -Query "select id, acronyme, dossier from gestion_projets.projets where actif and dossier is not null $filtre order by acronyme" | ConvertFrom-Json

$requetes = [ordered]@{
  "actions.csv" = @"
select a.libelle, a.responsable, $($d -f 'a.echeance') as echeance,
  case a.statut when 'a_faire' then 'À faire' when 'en_cours' then 'En cours' when 'fait' then 'Fait' else 'Abandonné' end as statut,
  a.priorite, a.valide_par, $($d -f 'a.valide_le') as valide_le, e.libelle as reunion, a.source, a.notes
from gestion_projets.actions a left join gestion_projets.echeances e on e.id = a.echeance_id
where a.projet_id = '{0}' order by a.statut = 'fait', a.echeance nulls last, a.libelle
"@
  "echeances.csv" = @"
select $($d -f 'date') as date, to_char(heure_debut, 'HH24:MI') as heure, type, libelle, coalesce(lieu_nom, lieu) as lieu, adresse,
  case statut when 'prevu' then 'Prévu' when 'fait' then 'Fait' else 'Annulé' end as statut, notes
from gestion_projets.echeances where projet_id = '{0}' order by date
"@
  "livrables.csv" = @"
select code, titre, responsable, $($d -f 'echeance') as echeance,
  case statut when 'a_faire' then 'À faire' when 'en_cours' then 'En cours' when 'envoye' then 'Envoyé' else 'Approuvé' end as statut, lien, notes
from gestion_projets.livrables where projet_id = '{0}' order by echeance nulls last, code
"@
  "finances.csv" = @"
select 'P' || numero as periode, $($d -f 'date_debut') as debut, $($d -f 'date_fin') as fin,
  $($m -f 'prevu') as prevu, $($m -f 'declare') as declare, $($m -f 'certifie') as certifie, $($m -f 'paye') as paye, observations
from gestion_projets.periodes where projet_id = '{0}' order by numero
"@
}

$bom = New-Object Text.UTF8Encoding $true
foreach ($p in $projets) {
  $dossier = Join-Path (Join-Path $Racine $p.dossier) "data"
  if (-not (Test-Path -LiteralPath $dossier)) { New-Item -ItemType Directory -Path $dossier | Out-Null }
  $bilan = @()
  foreach ($nom in $requetes.Keys) {
    $lignes = @(& $sql -ReadOnly -Query ($requetes[$nom] -f $p.id) | ConvertFrom-Json | ForEach-Object { $_ })
    $cible = Join-Path $dossier $nom
    if ($lignes.Count) {
      $csv = $lignes | ConvertTo-Csv -Delimiter ';' -NoTypeInformation
    } else {
      # Fichier vide mais avec l'en-tête attendu, pour que les sessions Claude sachent qu'il n'y a rien.
      $csv = @('"(aucune donnée)"')
    }
    [IO.File]::WriteAllLines($cible, $csv, $bom)
    $bilan += "$nom $($lignes.Count)"
  }
  "{0} -> {1}" -f $p.acronyme, ($bilan -join ", ")
}

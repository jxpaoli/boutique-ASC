# Charge un projet (fiche + actions, échéances, livrables, périodes) depuis un fichier JSON
# produit à partir des mémoires du projet. Ne fait rien si l'acronyme existe déjà.
# Usage : .\scripts\charger-projet.ps1 -Json seed_jason.json -Couleur "#7a3fb0"
param([Parameter(Mandatory)][string]$Json, [string]$Couleur)

$ErrorActionPreference = "Stop"
$contenu = [IO.File]::ReadAllText((Resolve-Path $Json), [Text.Encoding]::UTF8)
if ($contenu.Contains('$seed$')) { throw "Le JSON contient le délimiteur `$seed`$." }
$couleurSql = if ($Couleur) { "'" + $Couleur.Replace("'", "''") + "'" } else { "null" }

$sql = @"
with d as (select `$seed`$$contenu`$seed`$::jsonb as j),
p as (
  insert into gestion_projets.projets
    (acronyme, titre, programme, id_jems, appel, chef_de_file, n_partenaire, date_debut, date_fin,
     budget_projet, feder_projet, budget_epci, couleur)
  select r.acronyme, r.titre, r.programme, r.id_jems, r.appel, r.chef_de_file, r.n_partenaire, r.date_debut, r.date_fin,
         r.budget_projet, r.feder_projet, r.budget_epci, $couleurSql
  from d, jsonb_to_record(d.j -> 'projet') as r(
    acronyme text, titre text, programme text, id_jems text, appel text, chef_de_file text, n_partenaire text,
    date_debut date, date_fin date, budget_projet numeric, feder_projet numeric, budget_epci numeric)
  on conflict (acronyme) do nothing
  returning id
),
a as (
  insert into gestion_projets.actions (projet_id, libelle, responsable, echeance, statut, priorite, source, notes)
  select p.id, r.libelle, r.responsable, r.echeance, coalesce(r.statut, 'a_faire'), coalesce(r.priorite, 'normale'), r.source, r.notes
  from p, d, jsonb_to_recordset(coalesce(d.j -> 'actions', '[]')) as r(
    libelle text, responsable text, echeance date, statut text, priorite text, source text, notes text)
  returning 1
),
e as (
  insert into gestion_projets.echeances (projet_id, type, libelle, date, lieu, statut, notes)
  select p.id, coalesce(r.type, 'autre'), r.libelle, r.date, r.lieu, coalesce(r.statut, 'prevu'), r.notes
  from p, d, jsonb_to_recordset(coalesce(d.j -> 'echeances', '[]')) as r(
    type text, libelle text, date date, lieu text, statut text, notes text)
  returning 1
),
l as (
  insert into gestion_projets.livrables (projet_id, code, titre, responsable, echeance, statut, notes)
  select p.id, r.code, r.titre, r.responsable, r.echeance, coalesce(r.statut, 'a_faire'), r.notes
  from p, d, jsonb_to_recordset(coalesce(d.j -> 'livrables', '[]')) as r(
    code text, titre text, responsable text, echeance date, statut text, notes text)
  returning 1
),
pe as (
  insert into gestion_projets.periodes (projet_id, numero, date_debut, date_fin, prevu, declare, certifie, paye, observations)
  select p.id, r.numero, r.date_debut, r.date_fin, r.prevu, r.declare, r.certifie, r.paye, r.observations
  from p, d, jsonb_to_recordset(coalesce(d.j -> 'periodes', '[]')) as r(
    numero int, date_debut date, date_fin date, prevu numeric, declare numeric, certifie numeric, paye numeric, observations text)
  returning 1
)
select (select count(*) from p) as projet, (select count(*) from a) as actions, (select count(*) from e) as echeances,
       (select count(*) from l) as livrables, (select count(*) from pe) as periodes;
"@

$tmp = Join-Path ([IO.Path]::GetTempPath()) ("charger-" + [guid]::NewGuid() + ".sql")
[IO.File]::WriteAllText($tmp, $sql, (New-Object Text.UTF8Encoding $false))
try { & (Join-Path $PSScriptRoot "sql.ps1") -File $tmp } finally { Remove-Item $tmp -ErrorAction SilentlyContinue }

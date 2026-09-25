# Outils du secrétaire (session Claude « secretaire-mails ») pour écrire dans l'appli Projets européens.
# Connexion avec le compte du secrétaire (rôle « secretaire ») : toutes les écritures passent par les règles
# de la base (RLS + triggers). Jamais de clé admin ici.
#
# Identifiants lus dans C:\Users\jxpao\Claude\Projects\secretaire-mails\.env.europa.local :
#   EUROPA_URL=https://<ref>.supabase.co
#   EUROPA_CLE_PUBLIQUE=sb_publishable_...
#   EUROPA_SECRETAIRE_EMAIL=...
#   EUROPA_SECRETAIRE_MDP=...
# Aucune valeur n'est jamais affichée.
#
# Usage (dot-source puis appeler les fonctions) :
#   . C:\Users\jxpao\Claude\Projects\gestion-projets-europeens\scripts\secretaire.ps1
#   $p = Debut-Passage -Du 2026-09-20 -Au 2026-09-25
#   Get-Projets
#   Nouvelle-Action -Projet JASON -Libelle "Relancer le LaMMA" -MailRef "VERSE-<unid>" -Source "Mail de X du 24/09 : …" -DateSource "2026-09-24T10:12:00+02:00" -Echeance 2026-10-05
#   Cocher-Action -Id <uuid> -Source "Mail de X du 25/09 : reçu" -DateSource "2026-09-25T09:00:00+02:00"
#   Rouvrir-Action -Id <uuid> -Source "Mail de X du 26/09 : pas reçu" -DateSource "2026-09-26T08:30:00+02:00"
#   Commenter-Action -Id <uuid> -Message "Relance faite (mail du 25/09)"
#   Fin-Passage -Id $p.id -MailsLus 42 -Creees 3 -Faites 2 -Rouvertes 0 -Commentaires 1
param([string]$Fichier = "C:\Users\jxpao\Claude\Projects\secretaire-mails\.env.europa.local")

$ErrorActionPreference = "Stop"
$script:cfg = @{}
Get-Content $Fichier | Where-Object { $_ -match '^\s*[A-Z_]+=' } | ForEach-Object {
  $n, $v = $_ -split '=', 2
  $script:cfg[$n.Trim()] = $v.Trim().Trim('"')
}
foreach ($k in 'EUROPA_URL', 'EUROPA_CLE_PUBLIQUE', 'EUROPA_SECRETAIRE_EMAIL', 'EUROPA_SECRETAIRE_MDP') {
  if (-not $script:cfg[$k]) { throw "Variable $k absente ou vide dans $Fichier" }
}

function Connexion-Secretaire {
  $corps = @{ email = $script:cfg.EUROPA_SECRETAIRE_EMAIL; password = $script:cfg.EUROPA_SECRETAIRE_MDP } | ConvertTo-Json -Compress
  $r = Invoke-RestMethod -Method Post -Uri "$($script:cfg.EUROPA_URL)/auth/v1/token?grant_type=password" `
    -Headers @{ apikey = $script:cfg.EUROPA_CLE_PUBLIQUE } -ContentType "application/json" -Body $corps
  $script:jeton = $r.access_token
  $script:expire = (Get-Date).AddSeconds($r.expires_in - 60)
}

# Appel à l'API de la base (schéma gestion_projets), réponse décodée en UTF-8.
function Api([string]$Methode, [string]$Chemin, $Corps = $null) {
  if (-not $script:jeton -or (Get-Date) -gt $script:expire) { Connexion-Secretaire }
  $h = @{
    apikey = $script:cfg.EUROPA_CLE_PUBLIQUE; Authorization = "Bearer $($script:jeton)"
    'Accept-Profile' = 'gestion_projets'; 'Content-Profile' = 'gestion_projets'; Prefer = 'return=representation'
  }
  $params = @{ UseBasicParsing = $true; Method = $Methode; Uri = "$($script:cfg.EUROPA_URL)/rest/v1/$Chemin"; Headers = $h }
  if ($null -ne $Corps) {
    $params.ContentType = "application/json; charset=utf-8"
    $params.Body = [Text.Encoding]::UTF8.GetBytes(($Corps | ConvertTo-Json -Depth 5 -Compress))
  }
  try {
    $r = Invoke-WebRequest @params
  } catch {
    $msg = if ($_.ErrorDetails.Message) { $_.ErrorDetails.Message } else { $_.Exception.Message }
    throw "Refusé par l'appli : $msg"
  }
  $texte = [Text.Encoding]::UTF8.GetString($r.RawContentStream.ToArray())
  # PowerShell 5.1 renvoie un tableau JSON comme un seul objet : on l'énumère pour avoir une vraie liste.
  if ($texte) { foreach ($x in ($texte | ConvertFrom-Json)) { $x } }
}

function Id-Projet([string]$Acronyme) {
  $p = Api GET "projets?select=id&acronyme=eq.$([uri]::EscapeDataString($Acronyme))"
  if (-not $p) { throw "Projet inconnu : $Acronyme" }
  $p[0].id
}

function Get-Projets { Api GET "projets?select=acronyme,dossier&actif=eq.true&order=acronyme" }

# Actions ouvertes (ou toutes avec -Toutes), pour retrouver un id avant de cocher / rouvrir / commenter.
function Get-Actions([string]$Projet, [switch]$Toutes) {
  $f = "actions?select=id,libelle,statut,echeance,responsable,valide_par,valide_le,modifie_par_admin,mail_ref&order=echeance.nullslast"
  if ($Projet) { $f += "&projet_id=eq.$(Id-Projet $Projet)" }
  if (-not $Toutes) { $f += "&statut=in.(a_faire,en_cours)" }
  Api GET $f
}

function Existe-Mail([string]$MailRef) {
  [bool](Api GET "actions?select=id&mail_ref=eq.$([uri]::EscapeDataString($MailRef))")
}

function Nouvelle-Action {
  param([Parameter(Mandatory)][string]$Projet, [Parameter(Mandatory)][string]$Libelle, [Parameter(Mandatory)][string]$MailRef,
        [Parameter(Mandatory)][string]$Source, [Parameter(Mandatory)][string]$DateSource,
        [string]$Echeance, [string]$Responsable, [ValidateSet('haute', 'normale', 'basse')][string]$Priorite = 'normale',
        [string]$Notes, [string]$Reunion)
  if (Existe-Mail $MailRef) { Write-Host "Déjà créée pour ce mail ($MailRef) : ignorée."; return }
  $corps = @{ projet_id = (Id-Projet $Projet); libelle = $Libelle; mail_ref = $MailRef; source = $Source
              derniere_source = $Source; derniere_source_date = $DateSource; priorite = $Priorite }
  if ($Echeance) { $corps.echeance = $Echeance }
  if ($Responsable) { $corps.responsable = $Responsable }
  if ($Notes) { $corps.notes = $Notes }
  if ($Reunion) { $corps.echeance_id = $Reunion }
  (Api POST "actions" $corps)[0]
}

function Cocher-Action([Parameter(Mandatory)][string]$Id, [Parameter(Mandatory)][string]$Source, [Parameter(Mandatory)][string]$DateSource) {
  (Api PATCH "actions?id=eq.$Id" @{ statut = 'fait'; derniere_source = $Source; derniere_source_date = $DateSource })[0]
}

function Rouvrir-Action([Parameter(Mandatory)][string]$Id, [Parameter(Mandatory)][string]$Source, [Parameter(Mandatory)][string]$DateSource) {
  (Api PATCH "actions?id=eq.$Id" @{ statut = 'a_faire'; derniere_source = $Source; derniere_source_date = $DateSource })[0]
}

function Commenter-Action([Parameter(Mandatory)][string]$Id, [Parameter(Mandatory)][string]$Message) {
  (Api POST "actions_evenements" @{ action_id = $Id; type = 'commentaire'; message = $Message })[0]
}

# Réunions : retrouver l'échéance (CdP…) d'un projet, puis compléter sa fiche.
function Get-Reunions([string]$Projet) {
  $f = "echeances?select=id,type,libelle,date,lieu_nom&type=in.(cdp,evenement)&order=date"
  if ($Projet) { $f += "&projet_id=eq.$(Id-Projet $Projet)" }
  Api GET $f
}

function Ajouter-InfoReunion {
  param([Parameter(Mandatory)][string]$Reunion,
        [Parameter(Mandatory)][ValidateSet('transport', 'hebergement', 'repas', 'contact', 'acces', 'autre')][string]$Categorie,
        [Parameter(Mandatory)][string]$Titre, [Parameter(Mandatory)][string]$Source,
        [string]$Detail, [string]$Adresse, [string]$Telephone, [string]$Lien, [string]$Quand, [int]$Ordre = 50)
  $corps = @{ echeance_id = $Reunion; categorie = $Categorie; titre = $Titre; source = $Source; ordre = $Ordre }
  foreach ($k in 'Detail', 'Adresse', 'Telephone', 'Lien', 'Quand') { $v = Get-Variable $k -ValueOnly; if ($v) { $corps[$k.ToLower()] = $v } }
  (Api POST "reunion_infos" $corps)[0]
}

function Ajouter-PointReunion([Parameter(Mandatory)][string]$Reunion, [Parameter(Mandatory)][string]$Titre,
                              [Parameter(Mandatory)][string]$Source, [string]$Intervenant, [int]$Ordre = 50) {
  $corps = @{ echeance_id = $Reunion; titre = $Titre; source = $Source; ordre = $Ordre }
  if ($Intervenant) { $corps.intervenant = $Intervenant }
  (Api POST "reunion_points" $corps)[0]
}

# Journal des scans : un passage par scan de la messagerie. Get-DernierPassage donne le point de départ du suivant.
function Get-DernierPassage {
  Api GET "passages_secretaire?select=id,debut,fin,periode_du,periode_au,mails_lus&fin=not.is.null&order=debut.desc&limit=1"
}

function Debut-Passage([string]$Du, [string]$Au) {
  $corps = @{}
  if ($Du) { $corps.periode_du = $Du }
  if ($Au) { $corps.periode_au = $Au }
  (Api POST "passages_secretaire" $corps)[0]
}

function Fin-Passage([Parameter(Mandatory)][long]$Id, [int]$MailsLus, [int]$Creees, [int]$Faites, [int]$Rouvertes, [int]$Commentaires, [string]$Notes) {
  $corps = @{ fin = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ"); mails_lus = $MailsLus; actions_creees = $Creees
              actions_faites = $Faites; actions_rouvertes = $Rouvertes; commentaires = $Commentaires }
  if ($Notes) { $corps.notes = $Notes }
  (Api PATCH "passages_secretaire?id=eq.$Id" $corps)[0]
}

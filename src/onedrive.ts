// Liens OneDrive à partir de l'adresse de base (paramètre onedrive_base, ex.
// https://<tenant>-my.sharepoint.com/personal/<compte>/Documents/Projets européens).
// Dossiers et fichiers s'ouvrent par la vue OneDrive (onedrive.aspx?id=…).

function decouper(base: string) {
  const url = new URL(base);
  const cheminServeur = decodeURIComponent(url.pathname);          // /personal/<compte>/Documents/Projets européens
  const site = url.origin + cheminServeur.slice(0, cheminServeur.indexOf("/Documents"));
  return { site, cheminServeur };
}

export function lienDossier(base: string | undefined, chemin: string): string | null {
  if (!base) return null;
  const { site, cheminServeur } = decouper(base);
  return `${site}/_layouts/15/onedrive.aspx?id=${encodeURIComponent(`${cheminServeur}/${chemin}`)}`;
}

// Retrouve le fichier d'un livrable par son code (D4.1.1, D.4.1.1, D4_1_1…), le plus récent d'abord.
export function documentDuLivrable<T extends { nom: string; projet_id: string | null; present: boolean; modifie_le: string | null }>(
  code: string | null, projetId: string, documents: T[],
): T | undefined {
  const parties = code?.match(/[A-Za-z]+|\d+/g);
  if (!parties || parties.length < 2) return undefined;
  const motif = new RegExp(`(^|[^A-Za-z0-9])${parties.join("[._\\s-]?")}(?![0-9])`, "i");
  return documents
    .filter((d) => d.present && d.projet_id === projetId && motif.test(d.nom))
    .sort((a, b) => (b.modifie_le ?? "").localeCompare(a.modifie_le ?? ""))[0];
}

// Visionneuse OneDrive sur le fichier lui-même (id = fichier, parent = son dossier) : un lien « chemin » simple
// retombait sur le dossier (constaté par Joseph le 25/09/2026). Word/Excel/PowerPoint s'y ouvrent en un clic.
export function lienFichier(base: string | undefined, chemin: string, _extension?: string | null): string | null {
  if (!base) return null;
  const { site, cheminServeur } = decouper(base);
  const fichier = `${cheminServeur}/${chemin}`;
  const parent = fichier.slice(0, fichier.lastIndexOf("/"));
  return `${site}/_layouts/15/onedrive.aspx?id=${encodeURIComponent(fichier)}&parent=${encodeURIComponent(parent)}`;
}

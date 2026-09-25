// Liens OneDrive à partir de l'adresse de base (paramètre onedrive_base, ex.
// https://<tenant>-my.sharepoint.com/personal/<compte>/Documents/Projets européens).
// Dossier : vue OneDrive (onedrive.aspx?id=…) ; fichier : ouverture directe (?web=1 pour Word/Excel/PowerPoint).

function decouper(base: string) {
  const url = new URL(base);
  const cheminServeur = decodeURIComponent(url.pathname);          // /personal/<compte>/Documents/Projets européens
  const site = url.origin + cheminServeur.slice(0, cheminServeur.indexOf("/Documents"));
  return { origine: url.origin, site, cheminServeur };
}

const encoderChemin = (chemin: string) => chemin.split("/").map(encodeURIComponent).join("/");

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

const OFFICE =new Set(["doc", "docx", "xls", "xlsx", "ppt", "pptx"]);

export function lienFichier(base: string | undefined, chemin: string, extension: string | null): string | null {
  if (!base) return null;
  const { origine, cheminServeur } = decouper(base);
  const url = `${origine}${encoderChemin(cheminServeur)}/${encoderChemin(chemin)}`;
  return OFFICE.has(extension ?? "") ? `${url}?web=1` : url;
}

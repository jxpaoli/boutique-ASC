import { Link } from "react-router-dom";

// Menu « Plus » du téléphone : les écrans de consultation moins fréquents.
export default function Plus() {
  const liens = [
    { to: "/finances", icone: "💶", titre: "Finances", sous: "Prévu, déclaré, certifié, payé par période" },
    { to: "/livrables", icone: "📦", titre: "Livrables", sous: "État et échéances des livrables" },
    { to: "/projets", icone: "🪪", titre: "Projets", sous: "Carte d’identité des projets" },
    { to: "/rapport", icone: "🖨️", titre: "Rapport direction", sous: "Point d’avancement à imprimer ou envoyer en PDF" },
  ];
  return (
    <>
      <div className="titre">Plus</div>
      <div className="liste">
        {liens.map((l) => (
          <Link key={l.to} to={l.to} className="item lien-carte">
            <span className="doc-ico">{l.icone}</span>
            <div className="corps"><div className="libelle">{l.titre}</div><div className="meta">{l.sous}</div></div>
          </Link>
        ))}
      </div>
    </>
  );
}

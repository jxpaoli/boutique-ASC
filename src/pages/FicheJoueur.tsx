import { useMemo, useState, useEffect } from "react";
import { useNavigate, useParams, useLocation } from "react-router-dom";
import { useConfig, useJoueurs, useStock, addJoueur, updateJoueur, deleteJoueur, demanderSuppression, annulerSuppression, stockId, adjustStock } from "../data";
import { useAuth } from "../auth";
import Icon from "../Icon";
import {
  calc, euro, autoCategorie, ageDe, packPour, tailleAuto, taillesEligibles,
  chequeCount, defaultChequeDates, splitAmount, chequeAmt,
} from "../calc";
import { type ArticleStatut, type Cheque, type Joueur, type Licence, type PackArticle, type Config, type Role } from "../types";

const todayIso = () => { const z = (x: number) => String(x).padStart(2, "0"); const d = new Date(); return d.getFullYear() + "-" + z(d.getMonth() + 1) + "-" + z(d.getDate()); };

function blankJoueur(cfg: Config): Joueur {
  const licenceDefaut = cfg.licences.find((l) => l.defaut)?.code || cfg.licences[0]?.code || "";
  return {
    id: "", categorie: cfg.categories[0] || "", gardien: false, licence: licenceDefaut,
    nom: "", prenom: "", annee: "", tel: "",
    articles: [], remises: [], reglement: "", cheques: [], regOk: false, regDate: "", commentaires: "",
  };
}

function buildPack(cfg: Config, cat: string, gardien: boolean, licence: Licence, age: number | null, horsStock?: (a: string, t: string) => boolean): PackArticle[] {
  const names = packPour(cfg, cat, gardien).slice();
  if (cfg.sacSiNouvelle && cfg.licences.find((l) => l.code === licence)?.ajouteSac) names.unshift(cfg.reglesMetier.articleSac);
  return names.map((nom) => {
    const taille = tailleAuto(cfg, nom, age) || "";
    const statut: ArticleStatut = horsStock && horsStock(nom, taille) ? "differe" : "remis";
    return { article: nom, taille, statut };
  });
}

export default function FicheJoueur({ role }: { role: Role }) {
  const cfg = useConfig();
  const joueurs = useJoueurs();
  const stock = useStock();
  const email = useAuth().user?.email || "";
  const nav = useNavigate();
  const loc = useLocation();
  const { id } = useParams();
  const isNew = id === "new";
  // arrivée depuis la validation d'une pré-inscription : ouvrir comme une création
  const deplie = isNew || !!(loc.state as { deplie?: boolean } | null)?.deplie;

  const existing = !isNew && joueurs ? joueurs.find((j) => j.id === id) : null;
  const [draft, setDraft] = useState<Joueur | null>(null);
  const [voirTout, setVoirTout] = useState(false);

  useEffect(() => {
    if (!cfg) return;
    if (isNew) {
      setDraft(blankJoueur(cfg));
    } else if (existing) {
      setDraft(JSON.parse(JSON.stringify(existing)));
    }
  }, [cfg, isNew, existing]);

  const ready = !!cfg && (isNew || !!existing);

  const age = useMemo(() => {
    if (!cfg || !draft) return null;
    const y = parseInt(draft.annee, 10);
    return !y || y < 1930 || y > 2099 ? null : ageDe(y, cfg);
  }, [cfg, draft]);

  if (!ready || !cfg || !draft) return <div className="muted" style={{ padding: 20 }}>Chargement…</div>;

  const set = (patch: Partial<Joueur>) => setDraft({ ...draft, ...patch });
  const c = calc(draft, cfg);
  const licenceAutorisee = (code: string, categorie: string) => {
    const option = cfg.licences.find((l) => l.code === code);
    return !option || option.categoriesAutorisees.length === 0 || option.categoriesAutorisees.includes(categorie);
  };
  const horsStock = (a: string, t: string) => {
    const s = (stock || []).find((x) => x.id === stockId(a, t));
    return !!s && s.quantite <= 0;
  };
  const buildPackG = (cat: string, gardien: boolean) =>
    buildPack(cfg, cat, gardien, draft.licence, age, horsStock);

  /* ---- catégorie / pack ---- */
  const onAnnee = (v: string) => {
    const y = parseInt(v, 10);
    const next: Partial<Joueur> = { annee: v };
    if (y && y >= 1930 && y <= 2099) {
      const a = ageDe(y, cfg);
      const cat = autoCategorie(y, cfg);
      if (cat) next.categorie = cat;
      if (isNew || draft.articles.length === 0) {
        next.articles = buildPack(cfg, next.categorie ?? draft.categorie, draft.gardien, draft.licence, a, horsStock);
      }
    }
    setDraft({ ...draft, ...next });
  };
  const rechargerPack = () => set({ articles: buildPackG(draft.categorie, draft.gardien) });
  const onGardien = (g: boolean) => {
    const arts = draft.articles.length === 0 || confirm("Recharger le pack (version " + (g ? "gardien" : "joueur") + ") ? Les articles seront remplacés.")
      ? buildPackG(draft.categorie, g) : draft.articles;
    setDraft({ ...draft, gardien: g, articles: arts });
  };
  const onCategorie = (cat: string) => {
    const arts = draft.articles.length === 0 || confirm("Recharger le pack de « " + cat + " » ? Les articles seront remplacés.")
      ? buildPackG(cat, draft.gardien) : draft.articles;
    const licence = licenceAutorisee(draft.licence, cat) ? draft.licence : "";
    setDraft({ ...draft, categorie: cat, licence, articles: arts });
  };

  /* ---- licence / sac ---- */
  const onLicence = (lic: Licence) => {
    let arts = draft.articles.slice();
    const articleSac = cfg.reglesMetier.articleSac;
    const wantSac = cfg.sacSiNouvelle && cfg.licences.find((l) => l.code === lic)?.ajouteSac;
    const hasSac = arts.some((a) => a.article === articleSac);
    if (wantSac && !hasSac) arts = [{ article: articleSac, taille: cfg.reglesMetier.tailleSac, statut: "remis" }, ...arts];
    if (!wantSac && hasSac) arts = arts.filter((a) => a.article !== articleSac);
    setDraft({ ...draft, licence: lic, articles: arts });
  };

  /* ---- articles ---- */
  const setArt = (i: number, patch: Partial<PackArticle>) => {
    const arts = draft.articles.map((a, k) => (k === i ? { ...a, ...patch } : a));
    set({ articles: arts });
  };
  const bumpOne = (a: PackArticle, dir: number): PackArticle => {
    const elig = taillesEligibles(cfg, a.article, age);
    if (!elig.length) return a;
    let idx = elig.indexOf(a.taille);
    if (idx < 0) idx = dir > 0 ? -1 : elig.length;
    idx = Math.max(0, Math.min(elig.length - 1, idx + dir));
    return { ...a, taille: elig[idx] };
  };
  const bumpTaille = (i: number, dir: number) => set({ articles: draft.articles.map((a, k) => (k === i ? bumpOne(a, dir) : a)) });
  const bumpAll = (dir: number) => set({ articles: draft.articles.map((a) => bumpOne(a, dir)) });
  const tousStatut = (s: ArticleStatut) => set({ articles: draft.articles.map((a) => ({ ...a, statut: s })) });

  /* ---- remises ---- */
  const toggleRemise = (nom: string) => {
    const has = draft.remises.includes(nom);
    set({ remises: has ? draft.remises.filter((r) => r !== nom) : [...draft.remises, nom] });
  };

  /* ---- règlement ---- */
  const onReglement = (m: string) => {
    const n = chequeCount(m, cfg);
    if (n > 0) {
      const dates = defaultChequeDates(n, cfg);
      const montants = splitAmount(c.total, n);
      const cheques: Cheque[] = Array.from({ length: n }, (_, i) => ({ datePrev: dates[i], montant: montants[i], recup: false, enc: false }));
      setDraft({ ...draft, reglement: m, cheques, regOk: false });
    } else {
      const regDate = m && m !== cfg.reglesMetier.reglementNonRegle ? (draft.regDate || todayIso()) : draft.regDate;
      setDraft({ ...draft, reglement: m, cheques: [], regOk: false, regDate });
    }
  };
  const setCheque = (i: number, patch: Partial<Cheque>) =>
    set({ cheques: draft.cheques.map((ch, k) => (k === i ? { ...ch, ...patch } : ch)) });
  const equilibrer = (i: number) => {
    const n = chequeCount(draft.reglement, cfg);
    let autres = 0;
    draft.cheques.forEach((ch, k) => { if (k !== i) autres += chequeAmt(ch, c.total, n); });
    setCheque(i, { montant: Math.max(0, c.total - autres) });
  };
  const sommeCheques = draft.cheques.reduce((s, ch) => s + chequeAmt(ch, c.total, chequeCount(draft.reglement, cfg)), 0);

  /* ---- enregistrer ---- */
  const gereStock = (art: string) => !!cfg.catalogue.find((cc) => cc.nom === art)?.gererStock;
  const remisKeys = (arts: PackArticle[]) =>
    arts.filter((a) => a.statut === "remis" && a.taille && gereStock(a.article)).map((a) => a.article + "||" + a.taille);
  const enregistrer = async () => {
    if (!draft.nom.trim()) { alert("Le nom est obligatoire."); return; }
    if (isNew && joueurs) {
      const dbl = joueurs.find((j) =>
        j.nom.trim().toLowerCase() === draft.nom.trim().toLowerCase() &&
        j.prenom.trim().toLowerCase() === draft.prenom.trim().toLowerCase());
      if (dbl && !confirm("Attention : " + dbl.nom + " " + dbl.prenom + " (" + (dbl.categorie || "?") + (dbl.annee ? ", né(e) " + dbl.annee : "") + ") existe déjà.\nCréer quand même un doublon ?")) return;
    }
    const payload: Partial<Joueur> = { ...draft, nom: draft.nom.trim(), prenom: draft.prenom.trim() };
    delete payload.id;
    if (isNew) await addJoueur(payload as Omit<Joueur, "id">);
    else await updateJoueur(draft.id, payload);
    // décrément / réincrément du stock selon les articles remis (si gestion activée)
    const oldK = existing ? remisKeys(existing.articles || []) : [];
    const newK = remisKeys(draft.articles);
    for (const k of newK) if (!oldK.includes(k)) { const [a, t] = k.split("||"); void adjustStock(a, t, -1); }
    for (const k of oldK) if (!newK.includes(k)) { const [a, t] = k.split("||"); void adjustStock(a, t, +1); }
    nav("/");
  };
  const supprimerDirect = async () => {
    if (confirm("Effacer définitivement ce joueur ? (irréversible)")) { await deleteJoueur(draft.id); nav("/"); }
  };
  const demander = async () => {
    if (confirm("Demander la suppression ? (à valider par un responsable)")) { await demanderSuppression(draft.id, email); nav("/"); }
  };
  const annuler = async () => { await annulerSuppression(draft.id); nav("/"); };

  const n = chequeCount(draft.reglement, cfg);
  const dfCount = draft.articles.filter((a) => a.statut !== "remis").length;
  const totalArts = draft.articles.length;

  /* ---- sections réutilisées (création = tout ouvert / fiche existante = tuiles) ---- */
  const secInfos = (
    <>
      <label>Date de naissance</label>
      <input type="date" value={draft.annee} onChange={(e) => onAnnee(e.target.value)} />
      {age != null && <div className="hint vert icobtn" style={{ justifyContent: "flex-start" }}><Icon name="cake" size={13} className="ico-svg" /> {age} ans → {draft.categorie}{draft.gardien ? " · pack gardien" : ""}</div>}

      <label>Catégorie</label>
      <select value={draft.categorie} onChange={(e) => onCategorie(e.target.value)}>
        {cfg.categories.map((c2) => <option key={c2} value={c2}>{c2}</option>)}
      </select>
      <label className="check"><input type="checkbox" checked={draft.gardien} onChange={(e) => onGardien(e.target.checked)} /> <Icon name="shield" size={15} className="ico-svg" /> Gardien (pack spécial)</label>

      <label>Type de licence</label>
      <div className="chips lic-btns">
        {cfg.licences.map((lic) => {
          const autorisee = licenceAutorisee(lic.code, draft.categorie);
          return <button key={lic.code} className={"chip" + (draft.licence === lic.code ? " on" : "")} disabled={!autorisee} title={autorisee ? "" : "Non autorisé pour cette catégorie"} onClick={() => onLicence(lic.code)}>{lic.label}</button>;
        })}
      </div>

      <div className="grid2">
        <div><label>Nom</label><input value={draft.nom} onChange={(e) => set({ nom: e.target.value })} /></div>
        <div><label>Prénom</label><input value={draft.prenom} onChange={(e) => set({ prenom: e.target.value })} /></div>
      </div>
      <label>Téléphone</label>
      <input type="tel" value={draft.tel} onChange={(e) => set({ tel: e.target.value })} />
    </>
  );

  // fiche existante : seuls les différés s'affichent par défaut
  const packRows = draft.articles
    .map((a, i) => ({ a, i }))
    .filter(({ a }) => isNew || voirTout || a.statut !== "remis");

  const secPack = (
    <>
      <div className="row-btns">
        {isNew && <button className="mini" onClick={() => bumpAll(-1)}>▾ Tailles −</button>}
        {isNew && <button className="mini" onClick={() => bumpAll(1)}>▴ Tailles +</button>}
        {dfCount > 0 && <button className="mini icobtn" onClick={() => tousStatut("remis")}><Icon name="check" size={15} className="ico-svg" /> Tout remis</button>}
        {isNew && <button className="mini" onClick={rechargerPack}>↻ Recharger</button>}
        {!isNew && totalArts - dfCount > 0 && (
          <button className="mini icobtn" onClick={() => setVoirTout(!voirTout)}>
            {voirTout ? "Réduire aux différés" : <><Icon name="eye" size={15} className="ico-svg" /> Voir les {totalArts - dfCount} remis</>}
          </button>
        )}
      </div>
      {!isNew && !voirTout && dfCount === 0 && totalArts > 0 && (
        <div className="hint vert icobtn" style={{ marginTop: 8, justifyContent: "flex-start" }}><Icon name="check" size={14} className="ico-svg" /> Pack complet — tout a été remis.</div>
      )}
      {totalArts === 0 && <div className="muted" style={{ fontSize: 13, marginTop: 8 }}>Aucun article. Renseigne la date de naissance (tuile Infos) pour générer le pack.</div>}
      {packRows.map(({ a, i }) => (
        <div key={i} className={"art" + (a.statut !== "remis" ? " off" : "")}>
          <div className="art-l1">
            <select className="art-name" value={a.article} onChange={(e) => setArt(i, { article: e.target.value, taille: tailleAuto(cfg, e.target.value, age) || "" })}>
              {cfg.catalogue.map((cat) => <option key={cat.nom} value={cat.nom}>{cat.nom}</option>)}
            </select>
            <button className="szb" onClick={() => bumpTaille(i, -1)}>−</button>
            <select className="art-size" value={a.taille} onChange={(e) => setArt(i, { taille: e.target.value })}>
              <option value="">taille ?</option>
              {(cfg.catalogue.find((cat) => cat.nom === a.article)?.tailles || []).map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
            <button className="szb" onClick={() => bumpTaille(i, 1)}>+</button>
          </div>
          <div className="art-l2">
            <label className="switch">
              <input type="checkbox" checked={a.statut === "remis"} onChange={(e) => setArt(i, { statut: (e.target.checked ? "remis" : "differe") as ArticleStatut })} />
              <span className="slider" />
              <span className="sw-txt">{a.statut === "remis" ? "Remis" : "Différé"}</span>
            </label>
            <input className="art-motif" placeholder="commentaire…" value={a.motif || ""} onChange={(e) => setArt(i, { motif: e.target.value })} />
          </div>
        </div>
      ))}
    </>
  );

  const secReglement = (
    <>
      <h3 className="sec">Remises</h3>
      <div className="checks-row">
        {cfg.remises.map((r) => (
          <label key={r.nom} className="check"><input type="checkbox" checked={draft.remises.includes(r.nom)} onChange={() => toggleRemise(r.nom)} /> {r.nom} (−{r.montant} €)</label>
        ))}
      </div>

      <h3 className="sec">Règlement</h3>
      <select value={draft.reglement} onChange={(e) => onReglement(e.target.value)}>
        <option value="">— mode —</option>
        {cfg.reglements.map((r) => <option key={r} value={r}>{r}</option>)}
      </select>

      {n > 0 && (
        <div className="paybox">
          {draft.cheques.map((ch, i) => (
            <div key={i} className="chq">
              <label className="check"><input type="checkbox" checked={ch.recup} onChange={(e) => setCheque(i, { recup: e.target.checked, dateRecup: e.target.checked && !ch.dateRecup ? todayIso() : ch.dateRecup })} /> Chèque {i + 1} récupéré</label>
              <div className="chq-l2">
                <span className="dt">Récup. <input type="date" value={ch.dateRecup || ""} onChange={(e) => setCheque(i, { dateRecup: e.target.value })} /></span>
                <span className="dt">Encaiss. prévu <input type="date" value={ch.datePrev} onChange={(e) => setCheque(i, { datePrev: e.target.value })} /></span>
                <span className="mt"><input type="number" value={chequeAmt(ch, c.total, n)} onChange={(e) => setCheque(i, { montant: Math.max(0, Math.round(+e.target.value || 0)) })} /> €</span>
                <button className="mini" onClick={() => equilibrer(i)}>=</button>
                {ch.enc ? <span className="badge ok"><Icon name="check" size={12} className="ico-svg" /> encaissé</span> : <span className="badge neutre">non encaissé</span>}
              </div>
            </div>
          ))}
          <div className={"somme icobtn " + (sommeCheques === c.total ? "ok" : "ko")} style={{ justifyContent: "flex-start" }}>
            Somme chèques : {euro(sommeCheques)} / {euro(c.total)} {sommeCheques === c.total ? <Icon name="check" size={14} className="ico-svg" /> : <><Icon name="alert" size={14} className="ico-svg" /> écart {euro(c.total - sommeCheques)}</>}
          </div>
        </div>
      )}
      {n === 0 && draft.reglement && draft.reglement !== cfg.reglesMetier.reglementNonRegle && (
        <div className="paybox">
          <label className="check"><input type="checkbox" checked={draft.regOk} onChange={(e) => set({ regOk: e.target.checked })} /> Paiement effectué / encaissé</label>
          <span className="dt">le <input type="date" value={draft.regDate} onChange={(e) => set({ regDate: e.target.value })} /></span>
        </div>
      )}

      <label>Commentaires</label>
      <textarea rows={2} value={draft.commentaires} onChange={(e) => set({ commentaires: e.target.value })} />
    </>
  );

  const boutonsFin = (
    <>
      <div className="recap">Total : <b>{euro(c.total)}</b> · Reste dû : <b style={{ color: c.reste > 0 ? "var(--rouge)" : "var(--vert)" }}>{euro(c.reste)}</b></div>
      <button className="btn-primary" onClick={() => void enregistrer()}>Enregistrer</button>
      {!isNew && (
        draft.supprDemandee ? (
          <>
            {role !== "user" && <button className="btn-danger icobtn" onClick={() => void supprimerDirect()}><Icon name="trash" size={16} className="ico-svg" /> Effacer définitivement</button>}
            <button className="btn-danger icobtn" style={{ borderColor: "var(--bord)", color: "var(--txt)" }} onClick={() => void annuler()}><Icon name="undo" size={16} className="ico-svg" /> Annuler la demande de suppression</button>
          </>
        ) : role === "user" ? (
          <button className="btn-danger icobtn" onClick={() => void demander()}><Icon name="trash" size={16} className="ico-svg" /> Demander la suppression</button>
        ) : (
          <button className="btn-danger" onClick={() => void supprimerDirect()}>Supprimer ce joueur</button>
        )
      )}
    </>
  );

  /* ---- création (ou validation pré-inscription) : formulaire complet ouvert ---- */
  if (deplie) {
    return (
      <div className="fiche">
        <div className="fiche-top">
          <button className="lnk" onClick={() => nav(-1)}>← Retour</button>
          <b>{isNew ? "Nouveau joueur" : draft.nom + " " + draft.prenom}</b>
        </div>
        {secInfos}
        <h3 className="sec">Pack à remettre</h3>
        {secPack}
        {secReglement}
        {boutonsFin}
      </div>
    );
  }

  /* ---- fiche existante : en-tête + tuiles fermées ---- */
  const badgePack = dfCount > 0
    ? <span className="badge part"><Icon name="clock" size={12} className="ico-svg" /> {dfCount} à préparer</span>
    : totalArts > 0 ? <span className="badge ok"><Icon name="check" size={12} className="ico-svg" /> complet</span> : <span className="badge neutre">vide</span>;
  const badgeReg = (!draft.licence || !draft.reglement)
    ? <span className="badge no"><Icon name="alert" size={12} className="ico-svg" /> à compléter</span>
    : c.reste <= 0 ? <span className="badge ok">soldé</span> : <span className="badge no">{euro(c.reste)} dû</span>;

  return (
    <div className="fiche">
      <div className="fiche-head">
        <button className="lnk" onClick={() => nav(-1)}>← Retour</button>
        <div className="fh-nom">{draft.nom} <span>{draft.prenom}</span></div>
        <div className="fh-cat icobtn" style={{ justifyContent: "flex-start" }}>{draft.gardien && <Icon name="shield" size={12} className="ico-svg" />}{draft.categorie}{age != null ? " · " + age + " ans" : ""}{draft.licence ? " · " + draft.licence : ""}</div>
      </div>

      <details className="param-tile">
        <summary><span className="icobtn"><Icon name="user" size={17} className="ico-svg" /> Infos joueur</span></summary>
        <div className="pt-body">{secInfos}</div>
      </details>

      <details className="param-tile">
        <summary><span className="icobtn"><Icon name="shirt" size={17} className="ico-svg" /> Pack à remettre</span><span className="pt-badges">{badgePack}</span></summary>
        <div className="pt-body">{secPack}</div>
      </details>

      <details className="param-tile">
        <summary><span className="icobtn"><Icon name="euro" size={17} className="ico-svg" /> Règlement</span><span className="pt-badges">{badgeReg}</span></summary>
        <div className="pt-body">{secReglement}</div>
      </details>

      {boutonsFin}
    </div>
  );
}

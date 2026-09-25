import { useState } from "react";

// Préférence d'affichage mémorisée sur l'appareil (période, filtre…). Sans stockage disponible, on garde la valeur par défaut.
export function usePreference<T>(cle: string, defaut: T): [T, (v: T) => void] {
  const [valeur, setValeur] = useState<T>(() => {
    try {
      const brut = localStorage.getItem(`europa.${cle}`);
      return brut == null ? defaut : (JSON.parse(brut) as T);
    } catch {
      return defaut;
    }
  });
  const changer = (v: T) => {
    setValeur(v);
    try { localStorage.setItem(`europa.${cle}`, JSON.stringify(v)); } catch { /* stockage indisponible */ }
  };
  return [valeur, changer];
}

// Nom de Joseph dans le champ « responsable » : sert au filtre « Mes actions ».
export const MON_NOM = "Joseph X. Paoli";

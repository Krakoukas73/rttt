# CONDUITE.MD — RtTT (Real Time Town Traffic)

Document de référence technique, condensé. **Mis à jour uniquement sur demande explicite** (plus de mise à jour
automatique à chaque changement).

## 1. Réseau routier
- Routes classes 0–4 converties en « voies » (polylignes lissées Chaikin, rééchantillonnées ~3 m). Sens unique :
  tag OSM `oneway`, autoroutes implicitement à sens unique, ronds-points toujours à sens unique.
- Liaisons entre voies : recherche ≤3,4 m (virage ≤100°), repli 7 m puis 12 m (≤75°).
- Voies/ronds-points morts (aucune suite, îlot <500 m détecté par composantes fortement connexes) : jamais empruntés
  ni utilisés au spawn.
- Aucun demi-tour sauf cul-de-sac réel ; sur sens unique sans suite, déplacement forcé uniquement hors champ caméra.

## 2. Vitesses & suivi
- Autoroute ~105–128 km/h, voie rapide ~94–114 km/h, sinon `maxspeed`×0,95 (plafond 60) ou 50/40/30/20 selon classe.
- Facteur individuel par véhicule (±12–17 %). Ralentissement en virage et en approche de fin de voie.
- Modèle IDM (A_MAX 2,2 m/s², freinage confort 2,6, T_HW 1,1 s, S0 2,2 m). Véhicule immobile >3,5 s ignoré comme
  leader (anti-blocage). Insertion : accélération ×2,3 pendant 4 s après une intersection/rond-point.

## 3. Choix d'itinéraire
- Poids : tout droit ×2,2, classe égale/sup ×1,3, virage doux favorisé, virage >69° pénalisé ×0,25. Sortie en cours
  de voie ~16 % de chance. Jamais de demi-tour sauf cul-de-sac réel.
- Impasses : génération/choix ×0,3, interdites aux bus/camions si <90 m, à tous si <20 m.

## 4. Ronds-points
- Sens unique anti-horaire (vu du ciel), jamais de marche arrière. Cession de passage à l'entrée (rayon dépendant
  vitesse/gabarit, max 3 s d'attente). Sortie tirée au hasard (0/1/2 sorties ignorées : 60/30/10 %), jamais par la
  voie d'entrée sauf tour complet. Sortie forcée après ~60 m dans l'anneau.

## 5. Génération & affichage
- Jusqu'à 100 000 véhicules demandés, réseau en accepte ~25–35 000 ; 11 modèles, 28 teintes. Curseur 0/10k/25k/50k/
  100k réparti par classe de route.
- Simulés si <2,4 km de la caméra (recalcul 1 image/3 entre 0,7 et 2,4 km) ; jamais supprimés/déplacés dans le champ.
- Nuit : phares avant, feux arrière, faisceaux au sol pour véhicules <700 m.

## 6. Vélos, motos, trains
- Vélos ~13 % du trafic, réseau dédié (pistes cyclables/voies piétonnes), fermé aux autres véhicules.
- Motos ~14 %, dépassement le plus rapide (y compris à double sens avec contrôle du sens opposé), 1 seul phare/feu.
- Trains : voies ferrées OSM chaînées, 100–150 km/h avec ralentissements, fenêtres éclairables la nuit, ~57 convois.
- Passager : clic sur un véhicule = caméra embarquée (`startRide`/`rideCamera`), glisser = regarder autour, Échap
  = retour vue haute.

## Points de vigilance — ne jamais recasser
- **Eau/rail/ponts** (zone la plus fragile, corrigée après de nombreuses régressions) : niveau d'eau toujours calé
  au-dessus du terrain local ; un vrai trou de triangulation est découpé dans le polygone d'eau à chaque traversée
  route/rail/pont (`Ribbons.tri()` filtre aussi tout triangle dont le centre tombe dans un trou). Ne jamais toucher
  sans revérifier en direct : `railStrip`/`rayDist`/`clipToShore`, le regroupement « wet-run », l'ordre
  ex-puis-largeur du rétrécissement, `waterLevelAt` (bridges.js), le masquage `mk(...,false)` des photos aériennes,
  le filtre hole-centroid de `Ribbons.tri()`.
- **Pontons/passerelles** : une extrémité qui se termine réellement dans l'eau garde sa hauteur pleine jusqu'au
  bout (ne redescend jamais vers 0) ; largeur OSM honorée jusqu'à k≤7.
- **Glissières** : jamais posées à moins de 4 m d'une piste cyclable/chemin adjacent, jamais en diagonale à travers
  une bretelle d'insertion (raccourcies sur 22 m de part et d'autre d'une vraie fourche).
- **Toujours root-cause**, jamais de rustine locale ; tout algorithme doit rester générique (s'appliquer à
  n'importe quelle ville, pas seulement Chambéry/Cruet/Paris 11e).
- **Règles projet** : jamais de dossier `_obsolete` recréé, édition en place, pas de copies de sauvegarde ; pas de
  commit sans demande explicite ; onglets Chrome de test fermés après vérification ; jamais de données inventées.
- **Poser des questions** : en cas d'ambiguïté, de confusion, ou quand une demande ouvre plusieurs portes/options
  possibles (choix de conception, ampleur d'un changement...), poser la question plutôt que de trancher seul.

## Architecture — fichiers clés
- `javascript/` : `traffic.js` (véhicules/IA), `roads.js` (chaussées/eau/talus), `buildings.js`, `vegetation.js`,
  `trains.js`, `barriers.js` (glissières), `bridges.js` (ponts/pontons), `main.js` (UI, préchargeur, présentation).
- `lib/city.php`, `lib/cities.json`, `lib/osm.php` (récupération/parsing OSM, cadastre, BD TOPO, IGN, AWS Terrain
  Tiles). `data/<cp>/…` : cache par ville (regénéré via `fetch.php?cp=<cp>`).
- Vérif JS : `node --input-type=module --check < fichier.js`. Vérif visuelle : Chrome (naviguer, capture/zoom,
  console), onglet fermé après contrôle.

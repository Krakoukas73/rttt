<div align="center">

# 🚗 RtTT — Real Time Town Traffic

**🇫🇷 Votre ville en 3D vivante, dans le navigateur · 🇬🇧 Your town in living 3D, right in the browser**

![Three.js](https://img.shields.io/badge/Three.js-r160-black?logo=three.js)
![PHP](https://img.shields.io/badge/PHP-8-777BB4?logo=php&logoColor=white)
![Data](https://img.shields.io/badge/data-OpenStreetMap%20%2B%20IGN-2e7d32)
![Status](https://img.shields.io/badge/status-work%20in%20progress-orange)

<img src="docs/images/hero-chambery-aerial.jpg" alt="Chambéry – vue aérienne / aerial view" width="100%">

<sub>Chambéry (73000) — rendu RtTT · données © contributeurs OpenStreetMap, IGN · *RtTT rendering, data © OpenStreetMap contributors, IGN*</sub>

### 🌐 [**Démo en ligne / Live demo → piregwan-genesis.com/laboratory/rtt**](https://piregwan-genesis.com/laboratory/rtt/)

[🇫🇷 Français](#-français) · [🇬🇧 English](#-english)

</div>

---

# 🇫🇷 Français

> 🌐 **Une démo tourne en ligne : [piregwan-genesis.com/laboratory/rtt](https://piregwan-genesis.com/laboratory/rtt/)** — aucune installation nécessaire pour l'essayer.

## Le principe

**RtTT** reconstitue une ville en 3D — bâtiments, arbres, routes, rivières, relief — directement à partir de **données ouvertes**, puis la met en mouvement avec la **circulation de milliers de véhicules** : voitures, bus, poids lourds, motos, vélos et même trains.

Choisissez une ville, survolez-la librement, glissez-vous au ras du bitume ou regardez-la du haut des montagnes… ou **montez à bord de n'importe quel véhicule** d'un simple clic, et laissez le temps filer jusqu'à voir le jour basculer dans la nuit.

Le projet est né autour de **Chambéry (73000)** et fonctionne aujourd'hui sur plusieurs villes et villages très différents (urbain dense, montagne, littoral, île…).

<p align="center"><img src="docs/images/flythrough.gif" alt="Survol libre de la ville / free fly-through" width="85%"></p>

## ✨ Fonctionnalités

### 🏙️ Une ville reconstituée
- **Bâtiments** extrudés d'après le cadastre et la BD TOPO (hauteurs, toits, types : habitat, commerces, industrie, équipements publics, lieux de culte…).
- **Végétation** : plusieurs centaines de milliers d'arbres, haies, bois, pelouses, parcs, terrains de sport.
- **Relief réel** (plusieurs centaines de milliers de points de maillage) et **photo aérienne IGN** à la demande.
- **Routes, ponts, tunnels, rivières, voies ferrées, glissières, caténaires, lampadaires, mobilier urbain, enseignes**, noms de rues, de quartiers, de sommets, numéros de rue.

<p align="center"><img src="docs/images/city-details.jpg" alt="Détails de la ville / city details" width="85%"><br><sub>Vieille ville · relief et montagnes · rue avec circulation · photo aérienne IGN (© IGN, Licence Ouverte) drapée sur le terrain</sub></p>

### 🚦 Une circulation vivante
- Les véhicules motorisés suivent le **vrai réseau routier** : sens uniques, ronds-points, limitations de vitesse.
- **Modèle de suivi IDM** (Intelligent Driver Model) : accélération, freinage de confort, distance de sécurité.
- **Dépassements** intelligents (les vélos sont doublés par tous, les motos doublent tout le monde), **clignotants** avant de tourner ou de doubler, **feux stop** à chaque freinage.
- **Vélos** sur leur propre réseau (pistes cyclables, voies douces), **trains** sur leurs voies.
- Densité qui varie selon l'heure choisie ; curseur du nombre de véhicules avec avertissement de charge.

> 🚧 *Work in progress* : les feux tricolores, les ronds-points et les priorités à droite ne sont pas encore respectés — c'est pour l'instant un joyeux bazar ! 😅

### 🌗 Le temps qui passe
- **Cycle jour/nuit** complet : ombres portées qui suivent la position réelle du soleil, ciel dynamique.
- À la tombée de la nuit : **lampadaires, feux tricolores, vitrines, fenêtres des immeubles** (chacune indépendamment) et monuments s'allument progressivement ; les véhicules roulent **phares allumés**.
- Mode **« Apocalypse »** : voir [juste en dessous](#-apocalypse--la-montée-des-eaux).

<p align="center"><img src="docs/images/day-night.jpg" alt="Même vue de jour et de nuit / same view by day and by night" width="85%"><br><sub>Même vue, 15 h puis 21 h 30 : les fenêtres s'allument une à une, les lampadaires éclairent les rues.</sub></p>

### 🌊 Apocalypse : la montée des eaux
Un curseur **« Niveau de l'eau »** (altitude réelle, en mètres) permet de noyer la ville à la main, et le bouton **« Simuler l'Apocalypse »** lance un traveling cinématographique : le temps est figé à 14 h, la caméra tourne autour de la ville et l'eau monte jusqu'au niveau maximal. Les bâtiments, les routes et les arbres disparaissent sous la surface, et la caméra ne passe jamais sous l'eau.

<p align="center"><img src="docs/images/apocalypse.jpg" alt="Apocalypse : Chambéry sous les eaux / Chambéry under water" width="85%"><br><sub>Niveau de l'eau à 292 m d'altitude : la cluse de Chambéry est submergée.</sub></p>

### 🎮 Montez à bord ! — vue conducteur
Cliquez sur n'importe quel véhicule pour le conduire… du regard. En voiture, un **habitacle 3D temps réel** s'affiche :
- **Tableau de bord** : compteur de vitesse (0–160 km/h), compte-tours, **rapport engagé** (N, 1 → 5) cohérent avec la vitesse, **clignotants verts**, horloge, kilométrage ; **levier de vitesse** animé en grille en H.
- **Volant à gauche** qui tourne avec les virages, montants, portières et banquette arrière.
- **Trois rétroviseurs en vraie vue arrière temps réel** (miroirs plans géométriquement exacts), avec un coût de rendu adaptatif pour ne pas mettre le GPU à genoux.
- Regard libre à la souris jusqu'à 180° pour regarder derrière soi.

<p align="center"><img src="docs/images/driver-view.jpg" alt="Vue conducteur / driver's view" width="85%"><br><sub>Vue conducteur : les trois rétroviseurs montrent la route et les véhicules derrière en temps réel.</sub></p>

### 🕹️ Caméra et interface
- Caméra totalement libre : zoom, rotation, réglage de la hauteur, **vue circulaire** automatique, « lieux à voir » prédéfinis.
- Interface claire et sobre, **écran de chargement** détaillé (chiffres clés de la ville, avancement par étape), **écran de présentation**.
- Curseurs de **distance de vue**, **densité d'informations affichées** et **nombre de véhicules**, calibrés par ville.

<p align="center"><img src="docs/images/ui-panel.jpg" alt="Interface / user interface" width="85%"></p>

<p align="center"><img src="docs/images/ui-loading.jpg" alt="Écran de chargement / loading screen" width="55%"><br><sub>L'écran de chargement détaille la ville en cours de construction (ici Chambéry : près de 22 000 bâtiments, ~200 000 arbres, 982 km de voirie).</sub></p>

## 🏘️ Villes incluses

Chambéry, Cruet, Montmélian, Arbin, Le Bourget-du-Lac, Saint-Pierre-d'Albigny, Albiez-Montrond, Saint-Amour (Jura), Paris 11ᵉ – Canal Saint-Martin, La Croix-Valmer – Gigaro, Gruissan, île d'Ouessant.
**Ajouter une ville** : il suffit de la déclarer dans `lib/cities.json` ; ses données sont ensuite récupérées et mises en cache automatiquement.

## 🧱 Architecture

| Élément | Rôle |
|---|---|
| `index.php` | Page principale, interface, écran de chargement |
| `javascript/main.js` | Interface, préchargeur, caméra, vue conducteur, rétroviseurs |
| `javascript/traffic.js` | Véhicules, IA de conduite, itinéraires, signalisation |
| `javascript/cabin.js` | Habitacle 3D, tableau de bord, boîte de vitesses |
| `javascript/roads.js`, `buildings.js`, `vegetation.js`, `terrain.js`, `bridges.js`, `trains.js`… | Reconstitution de la ville |
| `javascript/daynight.js`, `sky.js` | Cycle jour/nuit, ciel |
| `lib/osm.php`, `lib/city.php`, `fetch.php` | Récupération, croisement et mise en cache des données par ville |
| `data/<code postal>/` | Cache des données de chaque ville |
| `CONDUITE.MD` | Document technique de référence (réseau, vitesses, ronds-points…) |

**Pile technique** : [Three.js](https://threejs.org/) r160 (WebGL) côté navigateur, **PHP** côté serveur (testé sous XAMPP), aucune base de données.

## 🗺️ Sources de données

- **OpenStreetMap** (contributeurs OSM, licence **ODbL**) via l'API Overpass : routes, bâtiments, arbres, noms, mobilier…
- **IGN – Géoplateforme** (*Licence Ouverte*) : cadastre PCI, BD TOPO, **orthophotographies**.
- **AWS Terrain Tiles** (Terrarium) : altitude du relief.

## 🚀 Installation

> 💡 Pour simplement essayer le projet, utilisez la [démo en ligne](https://piregwan-genesis.com/laboratory/rtt/). Ce qui suit concerne l'installation locale.

```bash
# 1. Cloner le dépôt dans le dossier web de votre serveur PHP (ex. XAMPP/htdocs)
git clone https://github.com/Krakoukas73/rttt.git rtt
cd rtt

# 2. Récupérer Three.js (copie dans javascript/vendor)
npm install
npm run vendor
```

Puis ouvrez `http://localhost/rtt/index.php?cp=73000` (Chambéry). Le dossier `data/` doit être accessible en écriture par PHP.

### 🛰️ Photos aériennes : dossiers `orthophoto/16` et `orthophoto/19` à récupérer

Pour que le dépôt reste raisonnable, **les sous-dossiers `16` et `19` du dossier `data/<code postal>/orthophoto/` de chaque ville ne sont pas versionnés** : ils représentent à eux seuls environ **300 000 fichiers et 4 Go**. Ce sont les tuiles de photo aérienne IGN, à deux niveaux de zoom (z16 : vue de base ; z19 : haute définition, ~0,6 m/pixel). Le reste du dépôt (bâtiments, routes, relief, etc.) est complet.

Vous avez deux façons de les récupérer, au choix et combinables (les tuiles déjà présentes ne sont jamais retéléchargées) :

1. **À la demande (automatique)** : `tile.php` télécharge chaque tuile manquante depuis la Géoplateforme IGN au moment où la caméra en a besoin, puis la garde en cache dans `data/<code postal>/orthophoto/<z>/<x>/<y>.jpg`. Rien à faire, mais la photo aérienne apparaît progressivement.
2. **Téléchargement en bloc (depuis le réseau local uniquement)** :
   - `http://localhost/rtt/fetch.php?cp=73000` : complète les données d'une ville, dont les tuiles de base z16 manquantes ;
   - `http://localhost/rtt/fetch.php?cp=73000&hires=19` : télécharge le zoom haute définition d'une ville ;
   - `http://localhost/rtt/hires-all.php?z=19` : enchaîne la haute définition de **toutes** les villes, une par une (laisser l'onglet ouvert jusqu'à « TOUT TERMINÉ »).

> ⚠️ Prévoyez de la place (plusieurs Go) et de la patience pour une récupération complète : c'est un grand nombre de petites requêtes vers l'IGN.

> ℹ️ Le premier chargement d'une grande ville est lourd (plusieurs centaines de Mo de géométrie) : un GPU dédié et un navigateur récent (Chrome, Edge, Firefox) sont recommandés.

## 🎛️ Commandes

| Action | Commande |
|---|---|
| Se déplacer / tourner / zoomer | Souris (glisser, molette) |
| Monter à bord d'un véhicule | Clic sur le véhicule |
| Regarder autour (vue conducteur) | Glisser la souris |
| Quitter la vue conducteur | `Échap` |
| Changer l'heure / faire défiler le temps | Curseur *Heure* / bouton *Faire défiler* |

## 🛣️ Pistes d'évolution

- Respect des feux tricolores, des ronds-points et des priorités.
- Habitacles spécifiques (bus, poids lourds, motos).
- Davantage de villes et de modes météo.

## 📄 Crédits

- **Données cartographiques** : © contributeurs [OpenStreetMap](https://www.openstreetmap.org/copyright), sous licence ODbL.
- **Cadastre, BD TOPO et photographies aériennes** : © [IGN](https://geoservices.ign.fr/) / DGFiP, via la Géoplateforme, sous Licence Ouverte.
- **Altitudes** : [Terrain Tiles](https://registry.opendata.aws/terrain-tiles/) (AWS Open Data) — voir leur page pour la liste détaillée des sources.
- **Moteur 3D** : [Three.js](https://threejs.org/) (licence MIT).
- Les images de ce README sont des captures de RtTT ; les fonds de carte et photos aériennes qu'elles montrent restent soumis aux mentions ci-dessus. Merci de les conserver lors de toute réutilisation.

---

# 🇬🇧 English

> 🌐 **A live demo is running online: [piregwan-genesis.com/laboratory/rtt](https://piregwan-genesis.com/laboratory/rtt/)** — no installation needed to try it.

## The idea

**RtTT** rebuilds a town in 3D — buildings, trees, roads, rivers and terrain — straight from **open data**, then brings it to life with the **traffic of thousands of vehicles**: cars, buses, trucks, motorbikes, bicycles and even trains.

Pick a town, fly over it freely, glide down to street level or look at it from the mountain tops… or **hop into any vehicle** with a single click and let time flow until day turns into night.

The project started with **Chambéry (France, postcode 73000)** and now runs on several very different places (dense city, mountains, seaside, island…).

<p align="center"><img src="docs/images/flythrough.gif" alt="Free fly-through" width="85%"></p>

## ✨ Features

### 🏙️ A rebuilt town
- **Buildings** extruded from the official cadastre and IGN BD TOPO (heights, roofs, types: housing, shops, industry, public facilities, places of worship…).
- **Vegetation**: hundreds of thousands of trees, hedges, woods, lawns, parks, sports grounds.
- **Real terrain** (hundreds of thousands of mesh points) and **IGN aerial imagery** on demand.
- **Roads, bridges, tunnels, rivers, railways, guard rails, overhead lines, street lamps, street furniture, shop signs**, plus street, district and summit names and house numbers.

<p align="center"><img src="docs/images/city-details.jpg" alt="City details" width="85%"><br><sub>Old town · terrain and mountains · street with traffic · IGN aerial photo (© IGN, Licence Ouverte) draped over the terrain</sub></p>

### 🚦 Living traffic
- Motor vehicles follow the **real road network**: one-way streets, roundabouts, speed limits.
- **IDM car-following model** (Intelligent Driver Model): acceleration, comfortable braking, safe gaps.
- Smart **overtaking** (everyone overtakes bikes, motorbikes overtake everybody), **turn signals** before turning or overtaking, **brake lights** on every braking.
- **Bicycles** on their own network (cycle lanes, greenways), **trains** on their tracks.
- Traffic density follows the time of day; vehicle-count slider with a load warning.

> 🚧 *Work in progress*: traffic lights, roundabouts and priority-to-the-right rules are not enforced yet — it's still a happy mess! 😅

### 🌗 Time flies
- Full **day/night cycle**: cast shadows follow the real sun position, dynamic sky.
- At nightfall, **street lamps, traffic lights, shop windows, building windows** (each one independently) and landmarks light up progressively; vehicles drive with **headlights on**.
- **"Apocalypse" mode**: see [just below](#-apocalypse-rising-water).

<p align="center"><img src="docs/images/day-night.jpg" alt="Same view by day and by night" width="85%"><br><sub>Same view, 3 pm then 9:30 pm: windows light up one by one, street lamps light the roads.</sub></p>

### 🌊 Apocalypse: rising water
A **"Niveau de l'eau"** (water level) slider (real altitude, in metres) lets you drown the town by hand, and the **"Simuler l'Apocalypse"** button starts a cinematic fly-around: time is frozen at 2 pm, the camera circles the town and the water rises up to the maximum level. Buildings, roads and trees disappear under the surface, and the camera never goes below the water.

<p align="center"><img src="docs/images/apocalypse.jpg" alt="Apocalypse: Chambéry under water" width="85%"><br><sub>Water level at 292 m: the Chambéry basin is flooded.</sub></p>

### 🎮 Hop in! — driver's view
Click any vehicle to ride along. In a car you get a **real-time 3D cabin**:
- **Dashboard**: speedometer (0–160 km/h), rev counter, **engaged gear** (N, 1 → 5) consistent with speed, **green turn-signal arrows**, clock, odometer; animated **gear lever** on an H pattern.
- **Left-hand steering wheel** that turns with the road, pillars, doors and rear seat.
- **Three mirrors with a true real-time rear view** (geometrically exact planar mirrors), with adaptive rendering cost so the GPU is not brought to its knees.
- Free mouse look up to 180° to look behind you.

<p align="center"><img src="docs/images/driver-view.jpg" alt="Driver's view" width="85%"><br><sub>Driver's view: the three mirrors show the road and vehicles behind in real time.</sub></p>

### 🕹️ Camera and interface
- Completely free camera: zoom, rotate, camera height, automatic **orbit view**, predefined "places to see".
- Clean, minimal interface, a detailed **loading screen** (key figures of the town, progress per step) and a **presentation screen**.
- **View distance**, **information density** and **vehicle count** sliders, tuned per town.

<p align="center"><img src="docs/images/ui-panel.jpg" alt="User interface" width="85%"></p>

<p align="center"><img src="docs/images/ui-loading.jpg" alt="Loading screen" width="55%"><br><sub>The loading screen details the town being built (here Chambéry: nearly 22,000 buildings, ~200,000 trees, 982 km of roads).</sub></p>

## 🏘️ Included towns

Chambéry, Cruet, Montmélian, Arbin, Le Bourget-du-Lac, Saint-Pierre-d'Albigny, Albiez-Montrond, Saint-Amour (Jura), Paris 11th – Canal Saint-Martin, La Croix-Valmer – Gigaro, Gruissan, Ouessant island.
**Adding a town**: just declare it in `lib/cities.json`; its data is then fetched and cached automatically.

## 🧱 Architecture

| Item | Role |
|---|---|
| `index.php` | Main page, UI, loading screen |
| `javascript/main.js` | UI, preloader, camera, driver's view, mirrors |
| `javascript/traffic.js` | Vehicles, driving AI, routing, signalling |
| `javascript/cabin.js` | 3D cabin, dashboard, gearbox |
| `javascript/roads.js`, `buildings.js`, `vegetation.js`, `terrain.js`, `bridges.js`, `trains.js`… | Town reconstruction |
| `javascript/daynight.js`, `sky.js` | Day/night cycle, sky |
| `lib/osm.php`, `lib/city.php`, `fetch.php` | Per-town data fetching, merging and caching |
| `data/<postcode>/` | Per-town data cache |
| `CONDUITE.MD` | Reference technical notes (network, speeds, roundabouts…) |

**Tech stack**: [Three.js](https://threejs.org/) r160 (WebGL) in the browser, **PHP** on the server (tested with XAMPP), no database.

## 🗺️ Data sources

- **OpenStreetMap** (© OSM contributors, **ODbL**) through the Overpass API: roads, buildings, trees, names, street furniture…
- **IGN – Géoplateforme** (*Licence Ouverte*, French open licence): PCI cadastre, BD TOPO, **aerial orthophotos**.
- **AWS Terrain Tiles** (Terrarium): terrain elevation.

## 🚀 Getting started

> 💡 To simply try the project, use the [live demo](https://piregwan-genesis.com/laboratory/rtt/). What follows is for a local install.

```bash
# 1. Clone into your PHP server's web folder (e.g. XAMPP/htdocs)
git clone https://github.com/Krakoukas73/rttt.git rtt
cd rtt

# 2. Fetch Three.js (copied into javascript/vendor)
npm install
npm run vendor
```

Then open `http://localhost/rtt/index.php?cp=73000` (Chambéry). The `data/` folder must be writable by PHP.

### 🛰️ Aerial photos: the `orthophoto/16` and `orthophoto/19` folders must be fetched

To keep the repository reasonable, **the `16` and `19` sub-folders of each town's `data/<postcode>/orthophoto/` folder are not versioned**: they alone amount to roughly **300,000 files and 4 GB**. They hold the IGN aerial-photo tiles at two zoom levels (z16: base view; z19: high definition, ~0.6 m/pixel). The rest of the repository (buildings, roads, terrain, etc.) is complete.

There are two ways to get them, which can be combined (tiles already present are never downloaded again):

1. **On demand (automatic)**: `tile.php` downloads each missing tile from the IGN Géoplateforme the moment the camera needs it, then keeps it cached in `data/<postcode>/orthophoto/<z>/<x>/<y>.jpg`. Nothing to do, but the aerial photo appears progressively.
2. **Bulk download (local network only)**:
   - `http://localhost/rtt/fetch.php?cp=73000`: completes a town's data, including any missing base z16 tiles;
   - `http://localhost/rtt/fetch.php?cp=73000&hires=19`: downloads one town's high-definition zoom;
   - `http://localhost/rtt/hires-all.php?z=19`: chains the high definition of **all** towns, one after the other (keep the tab open until "TOUT TERMINÉ").

> ⚠️ Plan for several GB of disk space and some patience for a full retrieval: it means a very large number of small requests to the IGN.

> ℹ️ The first load of a large town is heavy (several hundred MB of geometry): a dedicated GPU and a recent browser (Chrome, Edge, Firefox) are recommended.

## 🎛️ Controls

| Action | Control |
|---|---|
| Move / rotate / zoom | Mouse (drag, wheel) |
| Ride a vehicle | Click on it |
| Look around (driver's view) | Drag the mouse |
| Leave driver's view | `Esc` |
| Change the time / let time flow | *Time* slider / *Play* button |

## 🛣️ Roadmap

- Obey traffic lights, roundabouts and priority rules.
- Dedicated cabins (buses, trucks, motorbikes).
- More towns and weather modes.

## 📄 Credits

- **Map data**: © [OpenStreetMap](https://www.openstreetmap.org/copyright) contributors, under the ODbL license.
- **Cadastre, BD TOPO and aerial photos**: © [IGN](https://geoservices.ign.fr/) / DGFiP, via the Géoplateforme, under the Licence Ouverte (French open license).
- **Elevation**: [Terrain Tiles](https://registry.opendata.aws/terrain-tiles/) (AWS Open Data) — see their page for the detailed list of sources.
- **3D engine**: [Three.js](https://threejs.org/) (MIT license).
- The images in this README are RtTT screenshots; the maps and aerial photos they show remain subject to the attributions above. Please keep them when reusing.

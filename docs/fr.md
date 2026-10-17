# Smart Shutters

Smart Shutters pilote vos volets selon le soleil, les nuages, la chaleur et le
vent. L'intégration calcule la position du soleil chez vous, lit la météo sur
[Open-Meteo](https://open-meteo.com/) (gratuit, sans compte, sans clé) et
indique à Gladys, pour chaque façade de la maison, la position que ses volets
devraient prendre, et pourquoi.

Elle ne commande pas vos volets directement : elle déclenche une scène avec la
position recommandée, et une scène Gladys l'applique à vos vrais volets
(Zigbee, Z-Wave, MQTT, Matter…). Vous gardez la main sur les volets qui
suivent chaque façade.

## Prérequis

- Gladys Assistant 5.2 ou plus récent.
- La position de votre maison renseignée dans Gladys (**Paramètres →
  Maisons**) : l'intégration la demande à l'installation, elle sert à placer
  le soleil.
- Une connexion internet pour la météo. Sans elle, l'intégration continue en
  mode dégradé (voir [Hors ligne](#hors-ligne)).

## Mise en place

1. Installez l'intégration et acceptez l'accès à la position de vos maisons.
2. Dans l'écran **Configuration**, vérifiez les réglages (les valeurs par
   défaut conviennent à la plupart des maisons) et enregistrez.
3. Cliquez sur **Ajouter une façade** pour chaque groupe de fenêtres orientées
   pareil : les baies du salon, les chambres, la cuisine… Donnez-lui un nom et
   une orientation. Pour plus de précision, saisissez l'**azimut exact** de la
   façade (la direction vers laquelle regardent ses fenêtres, en degrés :
   0 = nord, 90 = est, 180 = sud, 270 = ouest) ; une application boussole
   posée à plat contre la fenêtre le donne.
4. Ouvrez l'onglet **Découverte** de l'intégration et ajoutez l'appareil
   **Sun & weather** et un appareil par façade.
5. Créez une scène par façade :
   - déclencheur : **Position de volet recommandée**, filtré sur la façade ;
   - action : régler la position des volets de cette façade sur la variable
     `{{triggerEvent.data.position}}` (0 % = fermé, 100 % = ouvert).

C'est tout : désormais, les volets suivent le ciel.

### Réglages d'une façade

| Réglage                     | Défaut | Signification                                                                       |
| --------------------------- | ------ | ----------------------------------------------------------------------------------- |
| Orientation / azimut        | Sud    | Vers où regardent les fenêtres.                                                     |
| Angle d'ouverture           | 80°    | Jusqu'où, de chaque côté de la façade, le soleil entre encore dans la pièce.        |
| Hauteur minimale du soleil  | 5°     | En dessous, bâtiments, arbres ou relief cachent le soleil.                          |
| Hauteur maximale du soleil  | 90°    | Au-dessus, un balcon ou un avant-toit ombrage les fenêtres (90 = pas d'avant-toit). |
| Position anti-éblouissement | 30 %   | La position contre l'éblouissement, par temps doux.                                 |
| Position chaleur            | 10 %   | La position qui garde la chaleur dehors, par forte chaleur.                         |

Utilisez **Modifier une façade** pour les changer (un champ vide garde sa
valeur) et **Supprimer une façade** pour en retirer une.

## Comment la position est choisie

Toutes les 10 minutes (l'**intervalle de rafraîchissement**), pour chaque
façade, de la règle la plus forte à la plus faible :

1. **Vent** — rafales au-dessus du **seuil de rafales** (50 km/h) : toutes
   les façades passent en **position vent** (100 % = complètement relevés, ce
   qui protège les volets roulants et les brise-soleil orientables). La
   protection s'arrête quand les rafales repassent sous 80 % du seuil.
2. **Nuit** — le soleil est sous la **hauteur de nuit** (-4°, un peu après le
   coucher) : la **position de nuit** (fermé). Désactivable.
3. **Soleil sur la façade** — le soleil est dans l'angle d'ouverture et les
   hauteurs de la façade, la puissance qu'il apporte sur la façade dépasse le
   **seuil de puissance solaire** (200 W/m²) et le ciel n'est pas couvert
   (couverture nuageuse sous 80 %) :
   - journée chaude (température extérieure au moins égale au **seuil de
     chaleur**, 25 °C, ou maximum prévu du jour qui l'atteint quand
     **Anticiper les journées chaudes** est actif) : la **position chaleur** ;
   - journée froide (sous le **seuil de froid**, 15 °C) : ouvert, le soleil
     chauffe la maison gratuitement ;
   - entre les deux : la **position anti-éblouissement**, si
     l'**anti-éblouissement** est actif.
4. Sinon (pas de soleil sur la façade, nuages) : ouvert.

Pour qu'un nuage qui passe ne fasse pas danser les volets :

- l'ombrage démarre au seuil de puissance solaire et s'arrête à 75 % de
  celui-ci ;
- une nouvelle position est envoyée au plus tous les **délais minimaux entre
  deux mouvements** (20 minutes), et seulement si elle déplace les volets d'au
  moins le **mouvement minimal** (10 points) ;
- le vent et la nuit s'appliquent toujours aussitôt.

La puissance sur la façade est calculée à partir des rayonnements direct,
diffus et réfléchi prévus par Open-Meteo et de l'angle entre le soleil et la
façade : une façade sud reçoit bien moins à midi en été qu'en hiver, quand le
soleil est bas.

## Appareils

**Sun & weather** : hauteur et azimut du soleil, ensoleillement global
(W/m²), couverture nuageuse, température extérieure, rafales et indice UV.

**Un appareil par façade** :

- **Recommended position** — ce que recommande l'automatisme (0–100 %) ;
- **Automation** — un interrupteur : éteint, la façade est en pause (aucune
  position n'est envoyée), allumé, elle reprend ;
- **Sun on the façade** — 1 quand le soleil atteint les fenêtres ;
- **Irradiance on the façade** — puissance reçue (W/m²) ;
- **Reason** — pourquoi : protection vent, nuit, protection chaleur,
  anti-éblouissement, soleil bienvenu, nuageux, pas de soleil sur la façade.

## Déclencheurs de scène

- **Position de volet recommandée** — la position recommandée d'une façade a
  changé (automatisme actif). Filtres : façade, raison. Variables :
  `position`, `previous_position`, `reason`, `facade_name`, `irradiance`,
  `sun_elevation`.
- **Soleil sur une façade** — le soleil commence ou cesse d'atteindre une
  façade. Filtres : façade, arrivé / parti. Variables : `phase`,
  `facade_name`, `sun_elevation`, `sun_azimuth`.
- **Protection contre le vent** — les rafales dépassent le seuil, ou
  repassent en dessous. Filtre : démarrée / terminée. Variables : `phase`,
  `wind_gusts`, `wind_speed`, `position`.
- **Journée chaude prévue** — le maximum prévu du jour atteint le seuil de
  chaleur (une fois par jour, après le lever du soleil) : fermer les volets
  tôt, prévenir, lancer les ventilateurs… Variables : `temperature_max`,
  `temperature`.

## Actions de scène

- **Obtenir la position recommandée** d'une façade : sorties `position`,
  `reason`, `reason_label`, `sun_on_facade`, `irradiance`, `automation`.
- **Mettre l'automatisme en pause** pour une façade, ou toutes si la façade
  est laissée vide, pendant une durée en minutes (0 = jusqu'à la reprise) :
  sorties `paused_count`, `resume_at`. Pratique pour partir en vacances,
  regarder un film ou faire la sieste.
- **Reprendre l'automatisme** : sorties `resumed_count` et, pour une façade,
  `position`, la recommandation actuelle, pour l'appliquer tout de suite.

La reprise ne bouge jamais les volets d'elle-même : utilisez la sortie
`position`, ou attendez le prochain changement de recommandation.

## Widgets du tableau de bord

- **Volets d'une façade** — position et puissance sur la façade (en direct),
  hauteur du soleil, la raison, l'automatisme, les positions prévues sur les
  12 prochaines heures, et un bouton pause / reprise.
- **Soleil et météo** — hauteur du soleil, nuages, température, rafales et
  indice UV (en direct), l'ensoleillement prévu sur 12 heures avec le lever et
  le coucher du soleil, le maximum du jour et la protection vent.
- **Tous les volets** — chaque façade avec sa position et sa raison, et des
  boutons pour tout mettre en pause ou tout reprendre.

## Actions de configuration

- **Ajouter une façade**, **Modifier une façade**, **Supprimer une façade**.
- **Rafraîchir maintenant** — lit la météo, recalcule chaque façade et
  affiche le résultat.

## Hors ligne

Quand Open-Meteo est injoignable, les appareils affichent un point orange et :

- pendant 3 heures, l'intégration utilise la dernière prévision reçue ;
- ensuite, elle suppose un ciel dégagé, calculé localement : les volets
  protègent du soleil comme par beau temps, sans la température
  (anti-éblouissement seulement) ; la protection vent reste dans l'état où
  elle était.

Tout revient à la normale au prochain rafraîchissement réussi.

## Vie privée

La seule donnée qui quitte votre maison est sa position, arrondie à une
dizaine de mètres, envoyée à Open-Meteo pour obtenir la prévision. Pas de
compte, pas de clé, aucune autre donnée personnelle.

## Dépannage

- **« Aucune maison Gladys n'a de coordonnées »** : renseignez la position de
  votre maison dans **Paramètres → Maisons**, ou choisissez une maison
  localisée dans la configuration.
- **Les appareils n'ont pas de valeurs** : ajoutez-les depuis l'onglet
  **Découverte** ; leurs valeurs arrivent au prochain rafraîchissement (ou
  cliquez sur **Rafraîchir maintenant**).
- **Les volets se ferment trop tôt ou trop tard** : ajustez l'angle
  d'ouverture et les hauteurs du soleil de la façade, ou le seuil de
  puissance solaire.
- **Les volets bougent trop souvent** : augmentez le délai minimal entre deux
  mouvements ou le mouvement minimal.

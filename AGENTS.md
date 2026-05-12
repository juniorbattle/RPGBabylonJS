# AGENTS.md — Intégration décors 2.5D tactique BabylonJS

## Contexte du projet

Le projet est un jeu RPG tactics 2.5D sous BabylonJS.

La scène de combat contient :
- une grid/plateau 3D tactique ;
- des personnages sous forme de sprites ou billboards ;
- plusieurs couches de décors 2D stylized painted ;
- deux modes caméra :
  - caméra frontale ;
  - caméra overview légèrement inclinée du haut vers le bas.

Objectif principal :
améliorer l’intégration visuelle des layers de décor autour de la grid 3D pour éviter l’effet “image plate collée derrière le plateau”.

## Problème actuel

Le rendu actuel présente :
- des layers trop rectangulaires ;
- des coupures visibles autour du décor ;
- un mauvais raccord entre le plateau 3D et le background ;
- des plans 2D qui paraissent plats en mode overview ;
- une brume/FX qui n’est pas encore utilisée comme couche de transition ;
- des problèmes d’alpha ou de fond damier sur certains assets.

## Objectif visuel

La scène doit ressembler à une arène tactique placée dans une forêt magique sombre.

Le plateau 3D doit rester lisible et central.

Les décors doivent créer de la profondeur avec plusieurs couches :
1. Background principal très éloigné.
2. Midground arbres/rochers derrière le plateau.
3. Foreground frame sur les côtés/bas de l’écran.
4. FX overlay : brume verte, lucioles, rayons doux.
5. Platform blend fog : brume basse autour du plateau pour masquer les coupures.

## Règles techniques BabylonJS

Créer ou améliorer un système de layers 2.5D avec :
- `SceneLayerManager` ou équivalent ;
- des planes BabylonJS pour chaque layer ;
- matériaux alpha propres ;
- `disableLighting = true` pour les décors peints ;
- `backFaceCulling = false` ;
- alpha blend correct ;
- possibilité d’utiliser additive blending pour les FX ;
- tri propre des layers ;
- réglages distincts par mode caméra.

Ne pas utiliser un billboard total pour tous les layers.
Préférer :
- background fixe ou quasi fixe ;
- midground semi-fixe ;
- foreground proche caméra avec parallax plus marqué ;
- FX overlay avec alpha/additive.

## Modes caméra

Prévoir deux presets :

### Front Camera
- background visible à 100 %
- midground visible à 100 %
- foreground visible à 70–90 %
- fog/FX visible à 30–45 %

### Overview Camera
- background visible à 100 %
- midground visible à 70–90 %
- foreground réduit à 30–50 %
- fog/FX réduit à 20–35 %

## Livrables attendus

Quand tu travailles sur cet aspect, tu dois :
1. Identifier les fichiers liés à la scène de combat.
2. Identifier les fichiers liés à la caméra.
3. Identifier la création de la grid 3D.
4. Ajouter ou améliorer un gestionnaire de layers.
5. Ajouter des paramètres faciles à ajuster.
6. Préserver le gameplay existant.
7. Ne pas casser l’UI.
8. Ajouter des commentaires clairs.
9. Proposer une checklist de test manuel.

## À éviter

Ne pas :
- modifier le système de combat sans nécessité ;
- déplacer les personnages sans raison ;
- mélanger UI et décor ;
- appliquer la lumière 3D aux images peintes ;
- laisser des fonds damier visibles ;
- utiliser des images avec fond opaque non voulu ;
- cacher la grid ou les personnages avec le foreground.

## Validation visuelle

Après modification, vérifier :
- la grid reste lisible ;
- les personnages restent visibles ;
- le décor n’a plus de bord rectangulaire évident ;
- la brume masque les transitions ;
- les layers gardent une profondeur crédible en caméra frontale ;
- les layers ne deviennent pas bizarres en overview ;
- les assets transparents n’affichent pas de damier.
# Plan — Intégration des layers 2.5D dans la scène de combat

## Objectif

Améliorer l’intégration des décors stylized painted dans la scène de combat BabylonJS.

La grid 3D doit rester centrale, tandis que les layers doivent créer une profondeur visuelle naturelle :
- background ;
- midground ;
- foreground ;
- FX ;
- brume de transition autour du plateau.

## Étape 1 — Audit du code existant

Trouver :
- le fichier de création de la scène de combat ;
- le fichier de gestion caméra ;
- le fichier de création de la grid ;
- le fichier de chargement des textures/assets ;
- le système actuel de sprites/personnages ;
- le système actuel de particules ou effets visuels.

Documenter brièvement :
- où la grid est créée ;
- où les layers actuels sont ajoutés ;
- comment les modes caméra sont gérés.

## Étape 2 — Créer un SceneLayerManager

Créer un gestionnaire responsable de :
- charger les textures de décors ;
- créer les planes ;
- assigner les matériaux ;
- gérer alpha/transparence ;
- gérer le parallax ;
- gérer les presets front/overview ;
- permettre un debug rapide des positions.

Nom suggéré :
`SceneLayerManager.ts`

## Étape 3 — Créer une config de biome

Créer une config claire pour la forêt magique sombre.

Nom suggéré :
`biomes/magicalForestLayers.ts`

La config doit contenir :
- textureUrl ;
- width ;
- height ;
- position ;
- rotation ;
- alpha ;
- parallaxStrength ;
- blendMode ;
- cameraModeVisibility.

## Étape 4 — Ajouter le layer Platform Blend Fog

Ajouter un layer dédié :
`platform_blend_fog`

Rôle :
- masquer la coupure entre le plateau et le décor ;
- créer une brume verte basse ;
- adoucir le bas de la grid ;
- renforcer l’ambiance magique.

Ce layer peut être placé :
- derrière la grid ;
- ou légèrement devant le plateau avec une alpha faible.

## Étape 5 — Régler l’ordre d’affichage

Ordre logique :
1. background
2. midground
3. platform blend fog behind
4. grid 3D
5. characters
6. foreground frame
7. fog/particles front
8. UI

Attention :
l’UI ne doit jamais être affectée par les layers.

## Étape 6 — Ajouter les presets caméra

Créer une méthode :
`applyCameraMode(mode: "front" | "overview")`

Elle doit ajuster :
- alpha ;
- position ;
- scale ;
- parallax ;
- visibilité du foreground ;
- intensité de la brume.

## Étape 7 — Tests manuels

Tester :
- caméra frontale ;
- caméra overview ;
- déplacement caméra si applicable ;
- lisibilité des personnages ;
- lisibilité de la grid ;
- absence de fond damier ;
- absence de bord rectangulaire visible ;
- performance FPS.

## Critères d’acceptation

Le travail est réussi si :
- les layers ne paraissent plus collés ;
- la grid s’intègre mieux dans le décor ;
- les transitions sont masquées par brume/ombre ;
- le rendu reste propre dans les deux caméras ;
- les réglages sont faciles à ajuster depuis une config.
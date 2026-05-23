# AGENTS.md - Layers 2.5D Combat BabylonJS

## Contexte

Le projet est un RPG tactics 2.5D sous BabylonJS. La scene de combat combine :
- une grid 3D tactique ;
- des unites en sprites/billboards ;
- une UI HTML superposee ;
- une composition de decor peinte en layers 16:9.

La priorite visuelle est claire : le decor doit englober la scene, mais la grid et les unites restent toujours lisibles et prioritaires.

## Direction Artistique

Le rendu vise une scene HD-2D fantasy sombre, type foret magique :
- profondeur peinte ;
- lumiere centrale ;
- brume verte basse ;
- lucioles et particules discretes ;
- premier plan qui encadre sans masquer le gameplay.

Les assets de decor doivent etre penses comme une composition complete 16:9, idealement 3072x1728 ou equivalent. Le plateau tactique est pose dans la zone basse/lisible de cette composition.

## Contrat Layers

Ordre logique de l'arriere vers l'avant (alias legacy entre parentheses) :
1. `backAtmosphere` (`background`) : ambiance generale, profondeur, lumiere centrale.
2. `mainMidground` (`midground`) : vegetation/rochers derriere le plateau, volume de scene.
3. `groundBlend` (`platform_blend_fog`) : brume basse qui masque le raccord plateau/decor.
4. grid 3D.
5. unites.
6. `foregroundCorners` (`foreground_frame`) : troncs, racines, feuillages lateraux.
7. `upperCanopy` : branches, lianes, feuillage haut.
8. `fxOverlay` : brume, lucioles, rayons doux.
9. UI.

Les layers BabylonJS doivent rester non pickables pour ne jamais bloquer les clics de deploiement, de selection, d'AOE ou de grille.

Le sol horizontal n'est plus un layer, c'est un objet distinct `SceneGroundLayerConfig` (cle `groundLayer` dans le JSON de map) avec 3 modes : `procedural` (DynamicTexture par biome), `texture` (PNG repeat-tile avec wrap addressing), ou `color` (uni).

## Regles Techniques

Utiliser `SceneLayerManager` pour la scene de combat et la preview MapEditor. Le module `BiomeLayerSystem.ts` n'existe plus.

Pour chaque layer :
- `MeshBuilder.CreatePlane` ;
- material alpha propre ;
- `disableLighting = true` ;
- `backFaceCulling = false` ;
- `useAlphaFromDiffuseTexture = true` pour les PNG ;
- `isPickable = false` ;
- blend additive uniquement pour les FX/fog si necessaire.

Ne pas melanger UI et decor. Ne pas appliquer les lumieres 3D aux images peintes.

Aucun helper procedural local (`buildStageLightShafts`, `buildDepthLayers`, `createForegroundFoliageTexture`, etc.) ne doit etre reintroduit dans `CombatScene.ts` : ces responsabilites appartiennent au `SceneLayerManager`.

## Camera

Deux modes doivent rester supportes :

### Front
- tous les layers actifs ;
- foreground plus present ;
- FX/brume visibles mais subtils ;
- grid et personnages nets.

### Overview
- background actif ;
- midground reduit si necessaire ;
- foreground reduit pour eviter l'effet de plan plat ;
- FX plus discret ;
- gameplay lisible.

`applyCameraMode("front" | "overview")` doit ajuster alpha, offsets et visibilite.

## MapEditor

L'onglet Layers doit prioriser :
- assets par layer ;
- position ;
- dimensions ;
- alpha ;
- blend mode ;
- parallax ;
- elevation de la grid combat ;
- presets rapides (`Back`, `Mid`, `Ground`, `Frame`, `Canopy`, `FX`) qui patchent un layer existant.

Les props individuels deviennent secondaires. Ils restent possibles via le pinceau manuel, mais la direction principale vient des layers composes.

Le panneau "Sol horizontal" edite `SceneGroundLayerConfig` (mode procedural / texture / couleur, repeat, offsets, echelle).

Le composer procedural extrait (`ProceduralComposer.ts` / `MapEditor.patch.ts`) a ete supprime. Le code procedural inline dans `MapEditor.ts` (COMPOSITE_LIBRARY, runProceduralGroundProps, etc.) a egalement ete retire.

## Validation

Avant de livrer une modification sur cette zone, verifier :
- la grid reste lisible ;
- les unites ne paraissent pas transparentes ;
- les layers n'ont pas d'effet rectangle flottant ;
- la brume masque le raccord plateau/decor ;
- les clics sur les cases de deploiement fonctionnent ;
- AOE, details et overlays ne sont pas coupes ;
- la preview MapEditor correspond au runtime combat.

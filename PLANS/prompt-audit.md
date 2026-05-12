Lis AGENTS.md puis suis le plan PLANS/layered-combat-background.md.

Je veux améliorer l’intégration des décors 2.5D dans ma scène de combat BabylonJS.

Objectif :
- créer ou améliorer un système SceneLayerManager ;
- séparer background, midground, foreground, FX overlay et platform blend fog ;
- intégrer les layers autour de la grid 3D ;
- éviter l’effet image plate rectangulaire ;
- conserver une bonne lisibilité des personnages et de la grid ;
- prévoir deux presets caméra : front et overview ;
- ne pas casser l’UI ni le gameplay existant.

Commence par auditer les fichiers concernés, puis propose un plan d’implémentation court avant de modifier le code.
Ensuite, implémente la solution progressivement.
À la fin, fournis une checklist de test manuel.
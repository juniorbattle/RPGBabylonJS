Implémente maintenant SceneLayerManager pour la scène de combat.

Contraintes :
- utiliser BabylonJS MeshBuilder.CreatePlane pour les layers ;
- utiliser StandardMaterial avec alpha propre ;
- disableLighting = true pour les layers peints ;
- backFaceCulling = false ;
- useAlphaFromDiffuseTexture = true pour les PNG transparents ;
- additive blending pour les FX si pertinent ;
- ne pas utiliser billboard total sur tous les layers ;
- exposer une config facile à ajuster ;
- ajouter applyCameraMode("front" | "overview").

Layers minimum :
- background_forest
- midground_forest
- foreground_frame
- platform_blend_fog
- magic_fog_particles

La grid 3D et les personnages doivent rester au centre de la composition.
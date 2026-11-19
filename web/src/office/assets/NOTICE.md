# Third-party assets in the Office

## figures.glb

- **What**: twelve low-poly people ("Mini Characters 1.0", `mini_male_a…f`, `mini_female_a…f`) in one file,
  with the clips `idle`, `walk`, `sit`, `emote-yes` and `interact-right` kept once (the other 27 clips and
  the eleven duplicate copies removed).
- **Art licence**: CC0 1.0 (public domain dedication), per the package's `NOTICE` and `CC0-1.0.txt`.
  Original author: Kenney (kenney.nl/assets/mini-characters). No attribution is required; this note keeps
  the provenance.
- **Taken from**: npm `@netforge/asset-library-files@0.2.0`, files `library/lowpoly/mini_*.glb`,
  integrity `sha512-X4gGGUruDss512QMgHkYtJye5UUQptptEgk5bS0yCpJ7E8XBeh5cH9LHKkb0Ia3hWBBZZU/IIL4/qByJlijTDQ==`
  (checked 19 Nov 2026). Only the model data was taken; no code from the package runs here.
- **How it was made**: a one-off script with `@gltf-transform/core`, `/extensions`, `/functions` 4.x and
  `meshoptimizer` (run outside the repo, nothing added to package.json): read the twelve files, drop every
  clip but the five above from the first and all clips from the others, `mergeDocuments`, `dedup`,
  `prune`, `unpartition`, `quantize`, and the meshopt compression removed (it needs a WebAssembly decoder,
  which the app's content security policy does not allow; gzipped, both are ~95 KB). 346 KB on disk,
  96 KB gzipped; one 512 px texture shared by all.
- **At run time**: loaded by three.js' GLTFLoader (mesh quantization is native); each body's body and head
  meshes are joined into one skinned mesh (web/src/office/figures.ts).

No photo of a real person is, or may be, part of these assets or of the 3D scene.

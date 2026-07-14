# Third-Party Assets

DealBuddy bundles a Chrome extension and local OCR assets so the first open-source release can work offline after checkout. This file tracks assets that are not ordinary project source code.

## Release Policy

- Keep bundled assets only when they are required for local-first operation.
- Record source, license, and redistribution notes before tagging a public release.
- Do not add minified JavaScript, wasm, model, font, image, or binary assets without updating this file.
- If an upstream license cannot be verified, replace the asset with a documented download step before release.

## Bundled Extension Runtime Assets

**Verification pass (2026-07-13):** actually inspected file contents (embedded strings, version
markers, license banners) rather than relying on filename/purpose guesses. Two assets are now
confirmed clean; three are confirmed **not** independently open-source and need to be replaced
before a public release — see notes.

| Path | Purpose | Observed source/license evidence | Redistribution note |
| --- | --- | --- | --- |
| `extension/dealbuddy-capture/assets/tailwind-BsAsd_7a.js` | Bundled UI/runtime JavaScript used by reference comparison runtime | **Correction**: no MIT banner or any license marker found on inspection (the previous note in this file claiming one was wrong). Contains a bundled `marked` (Markdown parser, MIT) instance; the rest is unidentified UI glue from the same extracted app as the two rows below | Not independently verifiable as clean. Loaded only as a static import of `reference-compare-runtime.js`; not required by the OCR path. **Remove or replace** together with that file (see below) |
| `extension/dealbuddy-capture/assets/reference-compare-runtime.js` | Local OCR runtime bundle used by the extension iframe | **Mixed.** Confirmed to embed `onnxruntime-web` **1.22.0** as-is (version string `"1.22.0"` present; internal Google LLC / Apache-2.0 headers are onnxruntime-web's own preserved upstream attribution from its tfjs-derived WebGL/WASM backend code — expected and correctly retained, not a problem) and `marked` (MIT). The remaining code (a Vue-based product-comparison UI, unrelated to OCR) has no identifiable license and matches the same extracted third-party Chrome extension as `api-CHoCPO3e.js` | The onnxruntime-web portion is fine to keep (MIT). The comparison-UI portion is **not verified as redistributable** and should be removed by extracting just the OCR-relevant `initOCR`/`recognizeImage` path into a minimal first-party module, or by rebuilding OCR support from the official `onnxruntime-web` npm package directly |
| `extension/dealbuddy-capture/assets/api-CHoCPO3e.js` | Loaded as a static import of `reference-compare-runtime.js` (ES modules evaluate static imports eagerly, so this executes whenever OCR runs, even though `initOCR`/`recognizeImage` never call into it) | **Confirmed problem**: contains a `compareList` feature (`chrome.storage.local` / `localStorage`-backed shopping comparison list) — this is the original third-party extension's own product logic, not a generic library. DealBuddy has no comparison-list feature and no license to redistribute this file | **Remove.** Not used by DealBuddy's OCR path; only present because it shares a build chunk with `reference-compare-runtime.js` |
| `extension/dealbuddy-capture/assets/esearch-ocr-DkjV-qK3.js` | OCR pre/post-processing glue (image resize, detection-box math, canvas handling) called from `initOCR`/`recognizeImage` | No license banner, version marker, or identifiable open-source project name found anywhere in the file | **Not verified as redistributable.** This is the one piece of actual OCR logic without upstream attribution; needs either a from-scratch reimplementation against the public PaddleOCR pre/post-processing algorithm, or explicit permission from the original extension's author |
| `extension/dealbuddy-capture/assets/ort-wasm-simd-threaded.jsep-CLPRrI3A.wasm` | ONNX Runtime Web wasm backend for local OCR | **Confirmed**: paired with the same onnxruntime-web 1.22.0 identified above; `ort-wasm-simd-threaded.jsep` is the standard onnxruntime-web filename pattern for the JSEP (WebGPU-bridging) wasm build | Keep. MIT (Microsoft, `github.com/microsoft/onnxruntime`) |
| `extension/dealbuddy-capture/assets/ppocr_keys_v1.txt` | OCR recognition dictionary | **Confirmed**: 6,622 lines, matching the published PaddleOCR `ppocr_keys_v1.txt` dictionary size/content | Keep. Apache License 2.0 (PaddlePaddle/PaddleOCR) |

## Bundled OCR Models

| Path | Purpose | Observed source/license evidence | Redistribution note |
| --- | --- | --- | --- |
| `extension/dealbuddy-capture/m/v4/ppocr_det.onnx` | Text detection model for local OCR | **Confirmed**: embedded ONNX metadata string reads `"Model from PaddlePaddle."` | Keep. Apache License 2.0 (PaddlePaddle/PaddleOCR PP-OCRv4 detection model) |
| `extension/dealbuddy-capture/m/v4/ppocr_rec.onnx` | Text recognition model for local OCR | **Confirmed**: embedded ONNX metadata string reads `"Model from PaddlePaddle."` | Keep. Apache License 2.0 (PaddlePaddle/PaddleOCR PP-OCRv4 recognition model) |

## Project Brand Assets

| Path | Purpose | Ownership |
| --- | --- | --- |
| `docs/brand/dealbuddy-logo.svg` | DealBuddy logo | Project asset |
| `docs/brand/dealbuddy-mark.svg` | DealBuddy mark | Project asset |
| `docs/brand/*-preview.png` | Preview renders for brand assets | Project asset |
| `extension/dealbuddy-capture/icons/dealbuddy-*.png` | Extension icons | Project asset |

## Public Release Gate

Before publishing a tagged public release, maintainers should record:

- Upstream URL for each bundled third-party binary or minified asset.
- Upstream license name and notice text.
- Asset checksum.
- Whether the asset may be redistributed in this repository.

Assets that fail this gate should be removed from the repository and replaced with documented local download or build instructions.

**Status as of 2026-07-14.** `tailwind-BsAsd_7a.js`, `api-CHoCPO3e.js`, and the
non-onnxruntime-web portion of `reference-compare-runtime.js` and `esearch-ocr-DkjV-qK3.js` are
extracted output from an unidentified third-party Chrome extension with no retained license —
`api-CHoCPO3e.js` in particular contains that extension's own product feature code
(`compareList`). The wasm backend, both `.onnx` models, and the dictionary file are
independently confirmed clean (MIT / Apache-2.0).

Scope of the gate, stated precisely:

- **GitHub source releases (tags/zips of this repository): acceptable with this caveat
  documented.** The repository itself has been public with these files since 0.2.0, so a
  tagged release adds no new redistribution exposure; this file is the disclosure.
- **Chrome Web Store listing or bundling the extension into promoted binary downloads:
  blocked** until the three unverified bundles are replaced with a from-scratch OCR harness
  built directly on the official `onnxruntime-web` npm package (MIT), or the original
  extension's author grants explicit redistribution permission. Tracked as a known issue.

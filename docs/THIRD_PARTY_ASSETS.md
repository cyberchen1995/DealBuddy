# Third-Party Assets

DealBuddy bundles a Chrome extension and local OCR assets so the first open-source release can work offline after checkout. This file tracks assets that are not ordinary project source code.

## Release Policy

- Keep bundled assets only when they are required for local-first operation.
- Record source, license, and redistribution notes before tagging a public release.
- Do not add minified JavaScript, wasm, model, font, image, or binary assets without updating this file.
- If an upstream license cannot be verified, replace the asset with a documented download step before release.

## Bundled Extension Runtime Assets

| Path | Purpose | Observed source/license evidence | Redistribution note |
| --- | --- | --- | --- |
| `extension/dealbuddy-capture/assets/tailwind-BsAsd_7a.js` | Bundled UI/runtime JavaScript used by reference comparison runtime | File banner includes MIT license markers for bundled JavaScript runtime pieces | Keep bundled; preserve license banners |
| `extension/dealbuddy-capture/assets/reference-compare-runtime.js` | Local reference runtime kept for extension OCR and comparison behavior | Derived from `参考/` runtime extraction; contains bundled app code | Keep only as local runtime support; do not reintroduce remote login/account behavior |
| `extension/dealbuddy-capture/assets/api-CHoCPO3e.js` | Small helper bundle from the reference extension | Source bundle from local reference artifact | Verify upstream project license before public release tag |
| `extension/dealbuddy-capture/assets/esearch-ocr-DkjV-qK3.js` | OCR helper JavaScript | Source bundle from local reference artifact | Verify upstream project license before public release tag |
| `extension/dealbuddy-capture/assets/ort-wasm-simd-threaded.jsep-CLPRrI3A.wasm` | ONNX Runtime Web wasm backend for local OCR | Filename and usage indicate ONNX Runtime Web wasm | Verify ONNX Runtime Web license and preserve notices before public release tag |
| `extension/dealbuddy-capture/assets/ppocr_keys_v1.txt` | OCR recognition dictionary | PaddleOCR-style PP-OCR dictionary asset | Verify upstream PaddleOCR asset license before public release tag |

## Bundled OCR Models

| Path | Purpose | Observed source/license evidence | Redistribution note |
| --- | --- | --- | --- |
| `extension/dealbuddy-capture/m/v4/ppocr_det.onnx` | Text detection model for local OCR | PP-OCR ONNX model artifact | Verify upstream model license and checksum before public release tag |
| `extension/dealbuddy-capture/m/v4/ppocr_rec.onnx` | Text recognition model for local OCR | PP-OCR ONNX model artifact | Verify upstream model license and checksum before public release tag |

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

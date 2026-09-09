# Official sample assets

Downloaded directly from [Arkiv Brand Assets on Drive](https://drive.google.com/drive/folders/1nfHtxq-QN71_uffQCp6x1OmPMg3BpL74)
on 2026-09-08, under **Arkiv Logo pack / New Logo**. SVG bytes are unchanged;
only local filenames differ. The wordmark keeps its original aspect ratio.

Hashes describe the original downloads, Git blobs and deployed assets. Windows
Git may convert line endings in a working checkout; use the raw Git blob when
verifying provenance (`git show HEAD:apps/example/public/<filename>`). This does
not change the SVG paths, colors or proportions.

| Local file in `apps/example/public` | Drive source | SHA-256 |
| --- | --- | --- |
| `arkiv-wordmark-white.svg` | [New Logo / [ ARKIV ] / SVG / LOGO white.svg](https://drive.google.com/file/d/1pUqKsNvDxDf_JNFpQOZVI8u6a979Gd_c/view) | `ef0040f22c08ea85fc66b065b2f01f36f1572219b63fe0564f0f277130f4cb5c` |
| `arkiv-wordmark-black.svg` | [New Logo / [ ARKIV ] / SVG / LOGO black.svg](https://drive.google.com/file/d/1EJBn3DNmVthiflLc-HhEQ4lCHOyt5dAZ/view) | `456d2931e350ffb8bfca1d13aa88de267a2742ce556687ddad45cdef8333c729` |
| `arkiv-icon-orange.svg` | [New Logo / [ A ] / SVG / LOGO orange.svg](https://drive.google.com/file/d/1Yr6rHoeP7l9S0-bryk3ObnRK9h_RJwET/view) | `a5954f5582a7a41c8d5bbb3363383451b8e15c23424cd11318e0dd01f932913b` |

The earlier header was a text approximation and the old `icon.svg` was a custom
cube. Neither is referenced by the current header or metadata. The old file is
preserved locally but excluded from deployment.

The existing layout mirrors token roles from the official
[arkiv-ui](https://github.com/Arkiv-Network/arkiv-ui) design system. The sample
starts in dark mode and persists an explicit light/dark choice when browser
storage is available. Connect wallet uses Arkiv Orange `#FE7446` with Ink text.
Light surfaces use Sand and Stone; graph relationship colors distinguish types.

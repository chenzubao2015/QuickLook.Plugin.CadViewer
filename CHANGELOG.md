# Changelog

All notable changes to this project are documented in this file.
The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project uses
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] - 2026-09-28

First public release.

### Added

- Preview for `.dxf` drawings, rendered with WebGL (layers, blocks, hatches, dimensions, text).
- Preview for `.dwg` drawings, decoded locally with LibreDWG compiled to WebAssembly.
- Wheel zoom centred on the cursor, and left-click drag panning.
- **Fit** button that restores the whole-sheet view.
- Automatic darkening of drawing colours that would be invisible on the light background.
- Text rendering using fonts already installed on the machine, including Chinese fonts.
- Virtual-host file access, so drawings in folders with spaces or non-ASCII characters load,
  and no temporary copies are created.
- Error reporting inside the preview window instead of an endless loading state.

### Notes

- Table entities (`ACAD_TABLE`) are skipped before DWG conversion because they abort the
  LibreDWG vector converter; the rest of the drawing still renders.
- Annotations relying on SHX big fonts are drawn with the installed TrueType fallback.

[1.0.0]: https://github.com/chenzubao2015/QuickLook.Plugin.CadViewer/releases/tag/v1.0.0

# Contributing

Thanks for taking the time to help. This plugin is small, so the process is deliberately light.

## Reporting a bug

Please include:

1. The QuickLook version and your Windows version.
2. Which renderer was involved — DXF or DWG — and the drawing's AutoCAD version if known.
3. What you expected and what happened instead.
4. **A drawing that reproduces the problem**, or a description of the entities involved.
   Drawings can be anonymised, but a reproducer is what makes a rendering bug fixable.

Log output helps a lot. The plugin writes to QuickLook's log file, which you can open from the
QuickLook tray icon menu (*Settings → View log*, or the log file path shown there).

## Suggesting a feature

Open an issue describing the workflow you have in mind rather than the implementation. For
example "I want to measure a distance in the preview" is more useful than "add a ruler widget",
because it lets us pick the approach that fits the plugin.

## Pull requests

- Keep the scope of a pull request to one change.
- Match the existing code style. JavaScript runs through esbuild with `--target=chrome90`, so
  modern syntax is fine; C# targets .NET Framework 4.6.2, so avoid APIs newer than that.
- Changes to rendering behaviour should state how they were verified. A drawing plus a
  screenshot is ideal.
- Update `CHANGELOG.md` under an `Unreleased` heading for user-visible changes.
- By contributing you agree that your contribution is licensed under GPL-3.0, the license of
  this project.

### Building and testing locally

```powershell
npm install
powershell -ExecutionPolicy Bypass -File .\Scripts\pack.ps1
```

Then install the produced `.qlplugin` and preview a drawing. `tools/make-demo-dxf.py` regenerates
the demo drawing used by the screenshots, which is handy as a quick smoke test:

```powershell
python tools/make-demo-dxf.py docs/demo-flange.dxf
```

## Areas where help is especially welcome

- Reporting DWG files that decode incorrectly, ideally with the offending entity type identified.
- Improving DWG fidelity by handling more entity types during conversion.
- Additional UI languages.

## License of contributions

This project is GPL-3.0. The bundled LibreDWG WebAssembly component requires it, so contributions
cannot be relicensed under a more permissive license.

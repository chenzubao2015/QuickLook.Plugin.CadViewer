param([string]$Configuration = "Release")
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$dotnet = Join-Path (Split-Path -Parent $root) ".dotnet\dotnet.exe"
if (-not (Test-Path $dotnet)) { $dotnet = "dotnet" }

Push-Location $root
try {
    npm install --ignore-scripts
    if ($LASTEXITCODE -ne 0) { throw "npm install failed." }

    Remove-Item "Web\vendor" -Recurse -Force -ErrorAction SilentlyContinue
    Remove-Item "Build\$Configuration" -Recurse -Force -ErrorAction SilentlyContinue

    # The DWG reader is a WebAssembly module shipped as an ES module tree. It is deployed as-is so
    # its own relative import and `import.meta.url` stay intact, and loaded lazily by the page.
    New-Item -ItemType Directory -Force -Path "Web\vendor\libredwg\dist" | Out-Null
    New-Item -ItemType Directory -Force -Path "Web\vendor\libredwg\wasm" | Out-Null
    Copy-Item "node_modules\@mlightcad\libredwg-web\dist\libredwg-web.js" "Web\vendor\libredwg\dist\" -Force
    Copy-Item "node_modules\@mlightcad\libredwg-web\wasm\libredwg-web.js" "Web\vendor\libredwg\wasm\" -Force
    Copy-Item "node_modules\@mlightcad\libredwg-web\wasm\libredwg-web.wasm" "Web\vendor\libredwg\wasm\" -Force

    & ".\node_modules\.bin\esbuild.cmd" "Web\app.src.js" --bundle --format=esm --target=chrome90 --outfile="Web\app.js"
    if ($LASTEXITCODE -ne 0) { throw "JavaScript bundle failed." }

    & $dotnet build ".\QuickLook.Plugin.CadViewer.csproj" -c $Configuration
    if ($LASTEXITCODE -ne 0) { throw "dotnet build failed." }
} finally {
    Pop-Location
}

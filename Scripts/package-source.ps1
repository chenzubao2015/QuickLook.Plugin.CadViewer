$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$artifact = Join-Path $root "QuickLook.Plugin.CadViewer.Source.zip"
Remove-Item $artifact -Force -ErrorAction SilentlyContinue

$include = @(
    ".gitignore",
    "LICENSE",
    "README.md",
    "README.zh-CN.md",
    "CHANGELOG.md",
    "CONTRIBUTING.md",
    "THIRD-PARTY-NOTICES.txt",
    "package.json",
    "package-lock.json",
    "Plugin.cs",
    "CadViewerPanel.cs",
    "QuickLook.Plugin.Metadata.config",
    "QuickLook.Plugin.CadViewer.csproj",
    "Scripts\build.ps1",
    "Scripts\pack.ps1",
    "Scripts\package-source.ps1",
    "tools\make-demo-dxf.py",
    "docs\demo-flange.dxf",
    "docs\screenshot-dxf.png",
    "docs\screenshot-zoom.png",
    "Web\index.html",
    "Web\app.css",
    "Web\app.src.js",
    ".github\workflows\build.yml",
    ".github\ISSUE_TEMPLATE\bug_report.yml",
    ".github\ISSUE_TEMPLATE\feature_request.yml",
    ".github\ISSUE_TEMPLATE\config.yml"
)

# Files are staged first so the archive keeps the repository layout instead of flattening
# everything into the zip root.
$stageRoot = Join-Path $env:TEMP ("cadviewer-source-" + [Guid]::NewGuid().ToString("N"))
$stage = Join-Path $stageRoot "QuickLook.Plugin.CadViewer"
New-Item -ItemType Directory -Force -Path $stage | Out-Null

try {
    $copied = 0
    foreach ($item in $include) {
        $full = Join-Path $root $item
        if (-not (Test-Path $full)) { continue }
        $target = Join-Path $stage $item
        $parent = Split-Path $target -Parent
        if (-not (Test-Path $parent)) { New-Item -ItemType Directory -Force -Path $parent | Out-Null }
        Copy-Item $full $target -Recurse -Force
        $copied++
    }
    if ($copied -eq 0) { throw "No source files found." }

    Compress-Archive -Path $stage -DestinationPath $artifact -CompressionLevel Optimal
    Write-Host "Created $artifact with $copied items"
} finally {
    Remove-Item $stageRoot -Recurse -Force -ErrorAction SilentlyContinue
}

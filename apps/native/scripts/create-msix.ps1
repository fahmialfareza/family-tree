# Packages the Windows release build (tauri build --no-bundle) as an MSIX for the Microsoft Store.
# Ported from Malanghub. Used by .github/workflows/native-windows-msix.yml; see apps/native/RELEASE.md.
param(
  [Parameter(Mandatory = $true)] [string]$IdentityName,
  [Parameter(Mandatory = $true)] [string]$Publisher,
  [Parameter(Mandatory = $true)] [string]$PublisherDisplayName,
  [Parameter(Mandatory = $true)] [string]$Version,
  [Parameter(Mandatory = $true)] [ValidateSet("x64", "arm64")] [string]$ProcessorArchitecture,
  [Parameter(Mandatory = $true)] [string]$OutputPath,
  [string]$SignPfxPath = "",
  [string]$SignPfxPassword = "",
  [string]$TimestampUrl = "http://timestamp.digicert.com"
)

$ErrorActionPreference = "Stop"

if ($Version -notmatch "^\d+\.\d+\.\d+\.0$") {
  throw "MSIX version must have four numeric parts ending in .0 (Store rule), for example 1.0.0.0."
}

$appDir = Resolve-Path (Join-Path $PSScriptRoot "..")
$exe = Get-ChildItem -Path (Join-Path $appDir "src-tauri\target") -Recurse -Filter "sakdulur.exe" |
  Where-Object { $_.FullName -match "\\release\\sakdulur\.exe$" } |
  Sort-Object FullName -Descending |
  Select-Object -First 1
if (-not $exe) { throw "No Windows release build found. Run tauri build first." }

$temp = if ($env:RUNNER_TEMP) { $env:RUNNER_TEMP } else { $env:TEMP }
$staging = Join-Path $temp "sakdulur-msix"
$assets = Join-Path $staging "Assets"
Remove-Item -Path $staging -Recurse -Force -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Path $assets -Force | Out-Null
Copy-Item -Path $exe.FullName -Destination (Join-Path $staging "Sakdulur.exe")

function Assert-Succeeded([string]$Name) {
  if ($LASTEXITCODE -ne 0) { throw "$Name failed with exit code $LASTEXITCODE." }
}

# The Store needs a wide tile next to Square310x310; draw the icon centred on the brand green.
function New-WideLogo([string]$SourcePath, [string]$OutputPath) {
  Add-Type -AssemblyName System.Drawing
  $source = [System.Drawing.Image]::FromFile($SourcePath)
  $bitmap = New-Object System.Drawing.Bitmap 310, 150
  $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
  try {
    $graphics.Clear([System.Drawing.ColorTranslator]::FromHtml("#3f7a52"))
    $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $graphics.DrawImage($source, 96, 16, 118, 118)
    $bitmap.Save($OutputPath, [System.Drawing.Imaging.ImageFormat]::Png)
  } finally {
    $graphics.Dispose()
    $bitmap.Dispose()
    $source.Dispose()
  }
}

$iconDir = Join-Path $appDir "src-tauri\icons"
foreach ($name in @("StoreLogo.png", "Square44x44Logo.png", "Square150x150Logo.png", "Square310x310Logo.png")) {
  Copy-Item -Path (Join-Path $iconDir $name) -Destination (Join-Path $assets $name)
}
New-WideLogo -SourcePath (Join-Path $iconDir "icon.png") -OutputPath (Join-Path $assets "Wide310x150Logo.png")

function Escape-Xml([string]$Value) { return [System.Security.SecurityElement]::Escape($Value) }
$identity = Escape-Xml $IdentityName
$publisherXml = Escape-Xml $Publisher
$publisherDisplay = Escape-Xml $PublisherDisplayName

# Properties/DisplayName must be a name reserved in Partner Center ("Sakdulur: Silsilah Keluarga");
# VisualElements/DisplayName is what Start and the taskbar show, so it stays "Sakdulur".
# windows.protocol: Google/Apple sign-in returns through com.fahmialfareza.sakdulur:// links. A packaged app's
# own registry writes (deep-link register_all) are virtualized, so the scheme must be declared here.
$manifest = @"
<?xml version="1.0" encoding="utf-8"?>
<Package
  xmlns="http://schemas.microsoft.com/appx/manifest/foundation/windows10"
  xmlns:uap="http://schemas.microsoft.com/appx/manifest/uap/windows10"
  xmlns:uap10="http://schemas.microsoft.com/appx/manifest/uap/windows10/10"
  xmlns:rescap="http://schemas.microsoft.com/appx/manifest/foundation/windows10/restrictedcapabilities"
  IgnorableNamespaces="uap uap10 rescap">
  <Identity Name="$identity" Publisher="$publisherXml" Version="$Version" ProcessorArchitecture="$ProcessorArchitecture" />
  <Properties>
    <DisplayName>Sakdulur: Silsilah Keluarga</DisplayName>
    <PublisherDisplayName>$publisherDisplay</PublisherDisplayName>
    <Logo>Assets\StoreLogo.png</Logo>
  </Properties>
  <Resources>
    <Resource Language="id-ID" />
    <Resource Language="en-US" />
  </Resources>
  <Dependencies>
    <TargetDeviceFamily Name="Windows.Desktop" MinVersion="10.0.19041.0" MaxVersionTested="10.0.26100.0" />
  </Dependencies>
  <Capabilities>
    <Capability Name="internetClient" />
    <rescap:Capability Name="runFullTrust" />
  </Capabilities>
  <Applications>
    <Application Id="Sakdulur" Executable="Sakdulur.exe" uap10:RuntimeBehavior="packagedClassicApp" uap10:TrustLevel="mediumIL">
      <uap:VisualElements
        DisplayName="Sakdulur"
        Description="Family tree, built together"
        BackgroundColor="#3f7a52"
        Square44x44Logo="Assets\Square44x44Logo.png"
        Square150x150Logo="Assets\Square150x150Logo.png">
        <uap:DefaultTile Square310x310Logo="Assets\Square310x310Logo.png" Wide310x150Logo="Assets\Wide310x150Logo.png" />
      </uap:VisualElements>
      <Extensions>
        <uap:Extension Category="windows.protocol">
          <uap:Protocol Name="com.fahmialfareza.sakdulur">
            <uap:DisplayName>Sakdulur</uap:DisplayName>
          </uap:Protocol>
        </uap:Extension>
      </Extensions>
    </Application>
  </Applications>
</Package>
"@
Set-Content -Path (Join-Path $staging "AppxManifest.xml") -Value $manifest -Encoding UTF8

$kitBin = Join-Path ${env:ProgramFiles(x86)} "Windows Kits\10\bin"
$hostArch = if ($env:PROCESSOR_ARCHITECTURE -eq "ARM64") { "arm64" } else { "x64" }
function Find-KitTool([string]$Name) {
  $tool = Get-ChildItem -Path $kitBin -Recurse -Filter $Name |
    Where-Object { $_.FullName -match "\\(x64|$hostArch)\\$([regex]::Escape($Name))$" } |
    Sort-Object FullName -Descending |
    Select-Object -First 1
  if (-not $tool) { throw "$Name was not found in the Windows SDK." }
  return $tool.FullName
}

New-Item -ItemType Directory -Path (Split-Path -Parent $OutputPath) -Force | Out-Null
& (Find-KitTool "MakeAppx.exe") pack /o /d $staging /p $OutputPath
Assert-Succeeded "MakeAppx"

# Optional: sign for sideloading tests. Store submissions are signed by Microsoft.
if ($SignPfxPath -and (Test-Path $SignPfxPath)) {
  & (Find-KitTool "signtool.exe") sign /fd SHA256 /tr $TimestampUrl /td SHA256 /f $SignPfxPath /p $SignPfxPassword $OutputPath
  Assert-Succeeded "signtool"
}

Write-Host "MSIX created at $OutputPath"

param([string]$OutputDirectory=$PSScriptRoot)
$ErrorActionPreference='Stop'
$taskCompiler=Join-Path $env:WINDIR 'Microsoft.NET\Framework64\v4.0.30319\csc.exe'
if(-not (Test-Path -LiteralPath $taskCompiler)){$taskCompiler=Join-Path $env:WINDIR 'Microsoft.NET\Framework\v4.0.30319\csc.exe'}
if(-not (Test-Path -LiteralPath $taskCompiler)){throw 'Requires Windows .NET Framework compiler.'}
New-Item -ItemType Directory -Path $OutputDirectory -Force | Out-Null
$taskOutput=Join-Path ([IO.Path]::GetFullPath($OutputDirectory)) 'UoocUpdater.exe'
& $taskCompiler /nologo /target:winexe "/out:$taskOutput" /reference:System.Web.Extensions.dll /reference:System.IO.Compression.dll /reference:System.IO.Compression.FileSystem.dll /reference:System.Windows.Forms.dll /reference:System.Drawing.dll (Join-Path $PSScriptRoot 'UoocUpdater.cs')
if($LASTEXITCODE -ne 0){throw 'Native updater compilation failed.'}
Write-Output $taskOutput

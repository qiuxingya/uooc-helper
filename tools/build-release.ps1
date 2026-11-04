param([string]$RepositoryRoot=(Split-Path $PSScriptRoot -Parent),[string]$OutDirectory,[string]$ReleaseTag)
$ErrorActionPreference='Stop'
$taskRoot=[IO.Path]::GetFullPath($RepositoryRoot)
$taskSource=if(Test-Path -LiteralPath (Join-Path $taskRoot 'manifest.json')){$taskRoot}else{Join-Path $taskRoot 'outputs\uooc-helper'}
$taskManifest=Get-Content -LiteralPath (Join-Path $taskSource 'manifest.json') -Raw | ConvertFrom-Json
$taskVersion=[string]$taskManifest.version
if($taskManifest.name -ne '优课学习助手' -or $taskManifest.manifest_version -ne 3 -or $taskVersion -notmatch '^\d+(\.\d+){1,3}$'){throw 'Invalid extension manifest.'}
if($ReleaseTag -and $ReleaseTag -ne "v$taskVersion"){throw 'Release tag must match manifest version.'}
if(-not $OutDirectory){$OutDirectory=Join-Path $taskRoot 'dist'}
$taskOut=[IO.Path]::GetFullPath($OutDirectory)
New-Item -ItemType Directory -Path $taskOut -Force | Out-Null
$taskStage=Join-Path $taskOut ('.stage-'+[guid]::NewGuid().ToString('N'))
$taskExtension=Join-Path $taskStage 'uooc-helper'
$taskHelper=Join-Path $taskStage 'native-helper'
New-Item -ItemType Directory -Path $taskExtension,$taskHelper -Force | Out-Null
try{
 foreach($taskFile in Get-ChildItem -LiteralPath $taskSource -File){
  if($taskFile.Extension -in '.js','.css','.html' -or $taskFile.Name -in 'manifest.json','README.md','使用说明.md','LICENSE'){
   if($taskFile.Attributes -band [IO.FileAttributes]::ReparsePoint){throw 'Source links are not allowed.'}
   Copy-Item -LiteralPath $taskFile.FullName -Destination $taskExtension
  }
 }
 foreach($taskFolder in 'icons','docs'){
  $taskPath=Join-Path $taskSource $taskFolder
  if(Test-Path -LiteralPath $taskPath){
   if((Get-Item -LiteralPath $taskPath -Force).Attributes -band [IO.FileAttributes]::ReparsePoint){throw 'Source links are not allowed.'}
   if(@(Get-ChildItem -LiteralPath $taskPath -Recurse -Force | Where-Object {$_.Attributes -band [IO.FileAttributes]::ReparsePoint}).Count){throw 'Source links are not allowed.'}
   Copy-Item -LiteralPath $taskPath -Destination $taskExtension -Recurse
  }
 }
 $taskNative=Join-Path $taskRoot 'native-updater'
 if(-not (Test-Path -LiteralPath (Join-Path $taskNative 'UoocUpdater.cs'))){$taskNative=Join-Path (Split-Path $taskSource -Parent) 'native-updater'}
 & (Join-Path $taskNative 'build.ps1') -OutputDirectory $taskHelper
 foreach($taskName in 'README.md','UoocUpdater.cs','build.ps1'){Copy-Item -LiteralPath (Join-Path $taskNative $taskName) -Destination $taskHelper}
 if(Test-Path -LiteralPath (Join-Path $taskSource 'LICENSE')){Copy-Item -LiteralPath (Join-Path $taskSource 'LICENSE') -Destination $taskHelper}
 $taskZip=Join-Path $taskOut "uooc-helper-$taskVersion.zip"
 $taskNativeZip=Join-Path $taskOut 'uooc-updater-windows.zip'
 Compress-Archive -LiteralPath $taskExtension -DestinationPath $taskZip -Force
 Compress-Archive -Path (Join-Path $taskHelper '*') -DestinationPath $taskNativeZip -Force
 $taskInfo=[ordered]@{format='uooc-update';schemaVersion=1;version=$taskVersion;tag="v$taskVersion";downloadUrl="https://github.com/qiuxingya/uooc-helper/releases/download/v$taskVersion/uooc-helper-$taskVersion.zip";sha256=(Get-FileHash -LiteralPath $taskZip -Algorithm SHA256).Hash.ToLowerInvariant();size=(Get-Item -LiteralPath $taskZip).Length;notes=(Get-Content -LiteralPath (Join-Path $taskSource 'RELEASE_NOTES.md') -Raw)}
 [IO.File]::WriteAllText((Join-Path $taskOut 'update.json'),($taskInfo|ConvertTo-Json -Depth 4),[Text.UTF8Encoding]::new($false))
 $taskLines=foreach($taskPackage in $taskZip,$taskNativeZip,(Join-Path $taskOut 'update.json')){$taskHash=Get-FileHash -LiteralPath $taskPackage -Algorithm SHA256;'{0}  {1}' -f $taskHash.Hash.ToLowerInvariant(),[IO.Path]::GetFileName($taskPackage)}
 [IO.File]::WriteAllLines((Join-Path $taskOut 'SHA256SUMS.txt'),$taskLines,[Text.UTF8Encoding]::new($false))
 Write-Output "Release $taskVersion built in $taskOut"
}finally{
 # Delete only this invocation's checked staging directory, never the source or output root.
 $taskResolved=[IO.Path]::GetFullPath($taskStage)
 if($taskResolved.StartsWith($taskOut+[IO.Path]::DirectorySeparatorChar,[StringComparison]::OrdinalIgnoreCase) -and [IO.Path]::GetFileName($taskResolved) -match '^\.stage-[a-f0-9]{32}$'){
  if(Test-Path -LiteralPath $taskResolved){Remove-Item -LiteralPath $taskResolved -Recurse -Force}
 }
}

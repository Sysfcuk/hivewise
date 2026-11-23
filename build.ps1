# Build Hivewise: run the rules tests, check every level with the solver, compile the Rust core
# to WebAssembly and copy it next to the web files.
#   .\build.ps1            build
#   .\build.ps1 -WritePar  also store each level's par (shortest solution) in web/levels.txt
param([switch]$WritePar)
$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot

cargo test --lib --quiet
if ($LASTEXITCODE) { throw 'tests failed' }

if ($WritePar) { cargo run --release --quiet --bin verify -- --write } else { cargo run --release --quiet --bin verify }
if ($LASTEXITCODE) { throw 'a level failed to verify' }

cargo build --release --lib --target wasm32-unknown-unknown --quiet
if ($LASTEXITCODE) { throw 'wasm build failed' }
Copy-Item target\wasm32-unknown-unknown\release\hivewise.wasm web\hivewise.wasm -Force
"web\hivewise.wasm  $([math]::Round((Get-Item web\hivewise.wasm).Length / 1KB)) KB"

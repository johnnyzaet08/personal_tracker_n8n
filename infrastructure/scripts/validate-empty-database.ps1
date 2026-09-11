[CmdletBinding()]
param(
  [ValidatePattern('^[a-z0-9][a-z0-9-]*$')]
  [string]$RunId
)

$ErrorActionPreference = 'Stop'

if (-not $RunId) {
  $RunId = "finance-validation-$([guid]::NewGuid().ToString('N').Substring(0, 12))"
}

$previousRunId = $env:VALIDATION_RUN_ID
$env:VALIDATION_RUN_ID = $RunId
$composeArguments = @(
  'compose',
  '-p', $RunId,
  '-f', 'compose.yaml',
  '-f', 'infrastructure/docker/compose.empty-db.yaml'
)

function Invoke-ValidationCompose {
  param([Parameter(ValueFromRemainingArguments = $true)][string[]]$Arguments)

  & docker @composeArguments @Arguments
  if ($LASTEXITCODE -ne 0) {
    throw "docker compose $($Arguments -join ' ') failed with exit code $LASTEXITCODE."
  }
}

try {
  Invoke-ValidationCompose config --quiet
  Invoke-ValidationCompose up --build --abort-on-container-exit --exit-code-from migrate migrate
}
finally {
  # This project name and every resource name include the freshly generated
  # RunId. It can therefore only remove resources created for this invocation.
  & docker @composeArguments down --volumes --remove-orphans
  if ($LASTEXITCODE -ne 0) {
    Write-Warning "Temporary validation cleanup failed (exit code $LASTEXITCODE). Run: docker $($composeArguments -join ' ') down --volumes --remove-orphans"
  }

  if ($null -eq $previousRunId) {
    Remove-Item Env:VALIDATION_RUN_ID
  }
  else {
    $env:VALIDATION_RUN_ID = $previousRunId
  }
}

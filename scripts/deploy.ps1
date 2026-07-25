# =============================================================================
# Deploy the Reflective Lens backend to a linked Supabase project (Windows).
#
# PowerShell twin of scripts/deploy.sh, for Windows without bash.
# Plain-English walkthrough: docs/deploy-windows.md
#
# One-time before the first run:
#   supabase login
#   supabase link --project-ref <your-project-ref>
#   copy .env.example .env      (then fill it in)
#
# Then, from the repo root:  .\scripts\deploy.ps1
# Re-runnable: pushes migrations, sets secrets, redeploys every function.
# =============================================================================

Set-Location (Join-Path $PSScriptRoot '..')

function Fail($msg) {
  Write-Host ""
  Write-Host "ERROR: $msg" -ForegroundColor Red
  exit 1
}

function Run([string[]]$CmdArgs) {
  & supabase @CmdArgs
  if ($LASTEXITCODE -ne 0) {
    Fail "'supabase $($CmdArgs -join ' ')' failed. Nothing after this point ran."
  }
}

if (-not (Get-Command supabase -ErrorAction SilentlyContinue)) {
  Fail "The Supabase CLI is not installed. See docs/deploy-windows.md, step 2."
}
if (-not (Test-Path '.env')) {
  Fail "No .env file found. Copy .env.example to .env and fill it in (step 4)."
}

# Read .env into a table. Skips blank lines and # comments, splits on the first
# = only (so keys containing = survive), and strips surrounding quotes plus any
# trailing inline comment.
$envVars = @{}
foreach ($line in Get-Content '.env') {
  $t = $line.Trim()
  if ($t -eq '' -or $t.StartsWith('#')) { continue }
  $i = $t.IndexOf('=')
  if ($i -lt 1) { continue }
  $key = $t.Substring(0, $i).Trim()
  $val = $t.Substring($i + 1).Trim()
  $val = [regex]::Replace($val, '\s+#.*$', '')
  $envVars[$key] = $val.Trim().Trim('"').Trim("'")
}

function Need($name) {
  if (-not $envVars.ContainsKey($name) -or [string]::IsNullOrWhiteSpace($envVars[$name])) {
    Fail "$name is missing or empty in .env. See docs/deploy-windows.md, step 4."
  }
  return $envVars[$name]
}

# Fail on all missing keys at once, rather than one re-run per missing key.
$missing = @(
  @('ANTHROPIC_API_KEY','OPENAI_API_KEY','LEARNING_CRON_SECRET','PURGE_CRON_SECRET') |
    Where-Object { -not $envVars.ContainsKey($_) -or [string]::IsNullOrWhiteSpace($envVars[$_]) }
)
if ($missing.Count -gt 0) {
  Fail "These are missing or empty in .env: $($missing -join ', '). See docs/deploy-windows.md, step 4."
}

Write-Host "==> Pushing database migrations (0001-0015)" -ForegroundColor Cyan
Run @('db','push')

Write-Host "==> Setting function secrets" -ForegroundColor Cyan
Run @(
  'secrets','set',
  "ANTHROPIC_API_KEY=$(Need 'ANTHROPIC_API_KEY')",
  "OPENAI_API_KEY=$(Need 'OPENAI_API_KEY')",
  "LEARNING_CRON_SECRET=$(Need 'LEARNING_CRON_SECRET')",
  "PURGE_CRON_SECRET=$(Need 'PURGE_CRON_SECRET')",
  "APP_URL=$($envVars['APP_URL'])"
)

if (-not [string]::IsNullOrWhiteSpace($envVars['STRIPE_SECRET_KEY'])) {
  Write-Host "==> Setting Stripe secrets" -ForegroundColor Cyan
  Run @('secrets','set',
    "STRIPE_SECRET_KEY=$($envVars['STRIPE_SECRET_KEY'])",
    "STRIPE_WEBHOOK_SECRET=$($envVars['STRIPE_WEBHOOK_SECRET'])")
}

Write-Host "==> Deploying edge functions (JWT-protected)" -ForegroundColor Cyan
foreach ($fn in @(
  'transcribe-audio','process-team-sheet','clean-observation',
  'generate-reflection-questions','enrich-reflection','review-intent',
  'generate-report','generate-period-report','generate-player-summary',
  'update-insights','update-voice-profile','create-checkout','delete-account'
)) { Run @('functions','deploy',$fn) }

Write-Host "==> Deploying edge functions (public, secret/signature-authenticated)" -ForegroundColor Cyan
foreach ($fn in @('run-learning','purge-due-accounts','billing-webhook')) {
  Run @('functions','deploy',$fn,'--no-verify-jwt')
}

Write-Host ""
Write-Host "==> Done. 15 migrations and 16 functions are live." -ForegroundColor Green
Write-Host "    Next: sign up once in the app, then run supabase/go-live.sql to make"
Write-Host "    yourself admin. Then walk through docs/staging-run.md to check the reports."

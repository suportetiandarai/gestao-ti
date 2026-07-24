param(
    [Parameter(Mandatory = $true)]
    [string[]]$TicketId
)

$ErrorActionPreference = 'Stop'
$workspace = Split-Path -Parent $PSScriptRoot
$envPath = Join-Path $workspace 'supabase\.env.secrets.local'
$outputPath = Join-Path $workspace 'supabase\.temp\glpi-solution-diagnostic.json'
$values = @{}

Get-Content -LiteralPath $envPath | ForEach-Object {
    if ($_ -match '^\s*([^#=]+)=(.*)$') {
        $values[$matches[1].Trim()] = $matches[2].Trim()
    }
}

$apiUrl = $values.GLPI_API_URL.TrimEnd('/')
$appToken = $values.GLPI_APP_TOKEN
$userToken = $values.GLPI_USER_TOKEN
$sessionToken = $null

function Invoke-GlpiRead {
    param([Parameter(Mandatory = $true)][string]$Path)
    $headers = @{
        Accept = 'application/json'
        'Content-Type' = 'application/json'
        'App-Token' = $appToken
    }
    if ($sessionToken) {
        $headers['Session-Token'] = $sessionToken
    } else {
        $headers.Authorization = "user_token $userToken"
    }
    $response = Invoke-WebRequest -UseBasicParsing -Uri "$apiUrl/$($Path.TrimStart('/'))" -Method Get -Headers $headers -TimeoutSec 30
    if ($response.Content) { return $response.Content | ConvertFrom-Json }
    return $null
}

$result = [ordered]@{ generatedAt = [DateTimeOffset]::UtcNow.ToString('o'); tickets = @() }

try {
    $session = Invoke-GlpiRead -Path 'initSession'
    $sessionToken = [string]$session.session_token
    if (-not $sessionToken) { throw 'GLPI não retornou uma sessão.' }

    $ticketIds = @($TicketId | ForEach-Object { $_ -split ',' } | ForEach-Object { [int]$_.Trim() })
    foreach ($id in $ticketIds) {
        $ticket = Invoke-GlpiRead -Path "Ticket/$id"
        $relations = @((Invoke-GlpiRead -Path "Ticket/$id/Ticket_User").GetEnumerator())
        $solutions = @((Invoke-GlpiRead -Path "Ticket/$id/ITILSolution").GetEnumerator())
        $logs = @((Invoke-GlpiRead -Path "Ticket/$id/Log?range=0-199").GetEnumerator())
        $technicians = @($relations | Where-Object { [int]$_.type -eq 2 } | ForEach-Object {
            [ordered]@{
                userId = [int]$_.users_id
                relationId = [int]$_.id
                dateCreation = [string]$_.date_creation
                dateModification = [string]$_.date_mod
            }
        })
        $solutionRows = @($solutions | ForEach-Object {
            [ordered]@{
                solutionId = [int]$_.id
                authorUserId = [int]$_.users_id
                authorName = [string]$_.user_name
                dateCreation = [string]$_.date_creation
                dateModification = [string]$_.date_mod
                status = if ($null -ne $_.status) { [int]$_.status } else { $null }
            }
        })
        $assignmentHistory = @($logs | Where-Object { [int]$_.id_search_option -eq 5 } | ForEach-Object {
            [ordered]@{
                date = [string]$_.date_mod
                linkedAction = [int]$_.linked_action
                oldValue = [string]$_.old_value
                newValue = [string]$_.new_value
            }
        })
        $result.tickets += [ordered]@{
            ticketId = $id
            openedAt = [string]$ticket.date
            solvedAt = [string]$ticket.solvedate
            closedAt = [string]$ticket.closedate
            status = [int]$ticket.status
            lastUpdaterUserId = [int]$ticket.users_id_lastupdater
            technicians = $technicians
            solutions = $solutionRows
            assignmentHistory = $assignmentHistory
        }
    }
} finally {
    if ($sessionToken) {
        try { Invoke-GlpiRead -Path 'killSession' | Out-Null } catch {}
    }
    $sessionToken = $null
    $appToken = $null
    $userToken = $null
}

$result | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $outputPath -Encoding utf8
$result | ConvertTo-Json -Depth 8

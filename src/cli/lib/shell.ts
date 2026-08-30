// shell 集成片段：把 Tab 键绑到「读当前行 → 交给 asf → 用命令替换整行」。
// 通过 `asf shell-init <powershell|bash>` 打印，用户贴进 $PROFILE / ~/.bashrc 即可。
// asf 的诊断信息走 stderr、命令走 stdout，所以钩子里压掉 stderr 只拿命令本身。

const POWERSHELL_SNIPPET = String.raw`# autoshell: Tab = AI command completion (type intent, then Tab)

# high-risk command patterns (PowerShell -match is case-insensitive by default).
# A match pauses auto-execute and asks for confirmation. Keep this list conservative.
$global:AutoshellRiskyPattern = @(
    'rm\s+-[a-z]*r[a-z]*f[a-z]*'         # rm -rf / -rdf / -drf ...
    'rm\s+-[a-z]*f[a-z]*r[a-z]*'         # rm -fr / -fdr ...
    'rm\s+-r\s+-f\b'
    'rm\s+-f\s+-r\b'
    'rm\s+--recursive'
    'rm\s+--no-preserve-root'
    '\b(del|erase|rd|rmdir)\s+/\S*[sq]'  # cmd.exe force/quiet delete
    'Remove-Item\b[^\r\n]*-Recurse'
    'git\s+reset\s+--hard'
    'git\s+clean\s+-f'
    'git\s+push\s+[^\r\n]*--force\b'
    'git\s+branch\s+-D\b'
    '\bformat\s+[a-zA-Z]:'
    '\bmkfs\b'
    '\bdd\s+if='
    '\bshutdown\b'
    '\breboot\b'
    '\b(Stop|Restart)-Computer\b'
    '\bDROP\s+(TABLE|DATABASE)\b'
    '\bTRUNCATE\s+TABLE\b'
    '\bDELETE\s+FROM\b'
    '\breg\s+delete\b'
    '\bsc\s+delete\b'
    '(curl|wget)[^\r\n]*[|]\s*(ba)?sh\b'
) -join '|'

Set-PSReadLineKeyHandler -Key Tab -ScriptBlock {
    $line = ''; $cursor = 0
    [Microsoft.PowerShell.PSConsoleReadLine]::GetBufferState([ref]$line, [ref]$cursor)
    if ([string]::IsNullOrWhiteSpace($line)) {
        [Microsoft.PowerShell.PSConsoleReadLine]::TabCompleteNext()
        return
    }
    # autoExecute mode: fill the command AND run it (asf config set autoExecute true)
    $auto = (& asf config get autoExecute 2>$null) -eq 'true'
    # asf emits UTF-8; decode as UTF-8 so Chinese in the command is not mojibake
    $prev = [Console]::OutputEncoding
    [Console]::OutputEncoding = [System.Text.Encoding]::UTF8
    try {
        $cmd = (& asf $line --shell powershell 2>$null) -join ' '
    } finally {
        [Console]::OutputEncoding = $prev
    }
    if ($cmd) {
        $cmdText = $cmd.Trim()
        # auto-execute mode + high-risk command: ask before running
        if ($auto -and ($cmdText -match $global:AutoshellRiskyPattern)) {
            [Microsoft.PowerShell.PSConsoleReadLine]::InvokePrompt()
            Write-Host ''
            Write-Host '[autoshell] HIGH-RISK command detected:' -ForegroundColor Yellow
            Write-Host "  $cmdText" -ForegroundColor Yellow
            Write-Host '[autoshell] Execute? [y/N] ' -ForegroundColor Yellow -NoNewline
            $key = [Console]::ReadKey($true)
            Write-Host $key.KeyChar
            if ($key.Key -ne [ConsoleKey]::Y) {
                # declined: keep the original input, run nothing
                [Microsoft.PowerShell.PSConsoleReadLine]::InvokePrompt()
                return
            }
        }
        [Microsoft.PowerShell.PSConsoleReadLine]::BeginningOfLine()
        [Microsoft.PowerShell.PSConsoleReadLine]::KillLine()
        [Microsoft.PowerShell.PSConsoleReadLine]::Insert($cmdText)
        if ($auto) {
            [Microsoft.PowerShell.PSConsoleReadLine]::AcceptLine()
        }
    }
}
`

const BASH_SNIPPET = `# autoshell: Tab = AI command completion (type intent, then Tab)
_autoshell_ai_tab() {
    local cmd
    cmd="$(command asf "$READLINE_LINE" --shell bash 2>/dev/null)"
    if [ -n "$cmd" ]; then
        READLINE_LINE="$cmd"
        READLINE_POINT="\${#cmd}"
    fi
}
bind -x '"\\t": _autoshell_ai_tab'
`

export function shellInit(shell: string): string {
  switch (shell) {
    case 'powershell':
      return POWERSHELL_SNIPPET
    case 'bash':
      return BASH_SNIPPET
    default:
      return ''
  }
}

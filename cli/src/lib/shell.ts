// shell 集成片段：把 Tab 键绑到「读当前行 → 交给 dsh → 用命令替换整行」。
// 通过 `dsh shell-init <powershell|bash>` 打印，用户贴进 $PROFILE / ~/.bashrc 即可。
// dsh 的诊断信息走 stderr、命令走 stdout，所以钩子里压掉 stderr 只拿命令本身。

const POWERSHELL_SNIPPET = `# autoshell: Tab = AI command completion (type intent, then Tab)
Set-PSReadLineKeyHandler -Key Tab -ScriptBlock {
    $line = ''; $cursor = 0
    [Microsoft.PowerShell.PSConsoleReadLine]::GetBufferState([ref]$line, [ref]$cursor)
    if ([string]::IsNullOrWhiteSpace($line)) {
        [Microsoft.PowerShell.PSConsoleReadLine]::TabCompleteNext()
        return
    }
    # dsh emits UTF-8; decode as UTF-8 so Chinese in the command is not mojibake
    $prev = [Console]::OutputEncoding
    [Console]::OutputEncoding = [System.Text.Encoding]::UTF8
    try {
        $cmd = (& dsh $line 2>$null) -join ' '
    } finally {
        [Console]::OutputEncoding = $prev
    }
    if ($cmd) {
        [Microsoft.PowerShell.PSConsoleReadLine]::BeginningOfLine()
        [Microsoft.PowerShell.PSConsoleReadLine]::KillLine()
        [Microsoft.PowerShell.PSConsoleReadLine]::Insert($cmd.Trim())
    }
}
`

const BASH_SNIPPET = `# autoshell: Tab = AI command completion (type intent, then Tab)
_autoshell_ai_tab() {
    local cmd
    cmd="$(command dsh "$READLINE_LINE" 2>/dev/null)"
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

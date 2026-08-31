// shell 集成片段：把 Tab 键绑到「读当前行 → 交给 asf → 用命令替换整行」。
// 通过 `asf shell-init <powershell|bash|zsh>` 打印，用户贴进 $PROFILE / ~/.bashrc / ~/.zshrc 即可。
// 也可 `asf shell-init <shell> --install` 一步直接写进配置文件（见 installShellInit）。
// asf 的诊断信息走 stderr、命令走 stdout，所以钩子里压掉 stderr 只拿命令本身。
import { execFileSync } from 'node:child_process'
import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'

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
    } else {
        # asf returned nothing (daemon down / key not set) - surface it instead of failing silently
        [Microsoft.PowerShell.PSConsoleReadLine]::InvokePrompt()
        Write-Host '[autoshell] no command generated - check: 1) asf serve running  2) API key configured' -ForegroundColor Yellow
        [Microsoft.PowerShell.PSConsoleReadLine]::InvokePrompt()
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

const ZSH_SNIPPET = `# autoshell: Tab = AI command completion (type intent, then Tab)
_autoshell_ai_tab() {
    if [[ -z "$BUFFER" ]]; then
        zle expand-or-complete
        return
    fi
    local cmd
    cmd="$(command asf "$BUFFER" --shell zsh 2>/dev/null)"
    if [ -n "$cmd" ]; then
        BUFFER="$cmd"
        CURSOR=\${#cmd}
    fi
    zle reset-prompt
}
zle -N _autoshell_ai_tab
bindkey '^I' _autoshell_ai_tab
`

export function shellInit(shell: string): string {
  switch (shell) {
    case 'powershell':
      return POWERSHELL_SNIPPET
    case 'bash':
      return BASH_SNIPPET
    case 'zsh':
      return ZSH_SNIPPET
    default:
      return ''
  }
}

// PowerShell 的 $PROFILE 路径：让 PowerShell 自己回答最准（5.1 和 7 路径不同，
// 且尊重用户可能的自定义 $PROFILE 位置）。powershell（5.1）优先，退回 pwsh（7）。
function getPowerShellProfile(): string | null {
  const ask = (exe: string): string | null => {
    try {
      const out = execFileSync(
        exe,
        ['-NoProfile', '-Command', '[Console]::OutputEncoding=[System.Text.Encoding]::UTF8; Write-Output $PROFILE'],
        { encoding: 'utf8' },
      )
      const line = out.split(/\r?\n/).map((s) => s.trim()).find((s) => s.length > 0)
      return line || null
    } catch {
      return null
    }
  }
  return ask('powershell') ?? ask('pwsh')
}

// 各 shell 的 Tab 补全钩子配置文件路径
function getProfilePath(shell: string): string | null {
  switch (shell) {
    case 'powershell':
      return getPowerShellProfile()
    case 'bash':
      return join(homedir(), '.bashrc')
    case 'zsh':
      return join(homedir(), '.zshrc')
    default:
      return null
  }
}

// 把 Tab 补全脚本直接写进 shell 配置文件，省去「打印 → notepad → 粘贴」。
// 幂等：已装过（文件里已有 `# autoshell: Tab` 标记）就跳过，不重复追加。
export function installShellInit(shell: string): { ok: boolean; message: string } {
  const snippet = shellInit(shell)
  if (!snippet) return { ok: false, message: `不支持的 shell：${shell || '(空)'}` }

  const profile = getProfilePath(shell)
  if (!profile) return { ok: false, message: `无法确定 ${shell} 的配置文件路径（powershell 未安装？）` }

  const marker = '# autoshell: Tab'
  let existing = ''
  try {
    if (existsSync(profile)) existing = readFileSync(profile, 'utf8')
  } catch {
    // 读不到（权限/编码异常）就当作空文件，继续尝试写；写失败会在下面报错
  }
  if (existing.includes(marker)) {
    return { ok: true, message: `已安装（${profile}），无需重复写入` }
  }

  try {
    mkdirSync(dirname(profile), { recursive: true })
    // 追加前若文件末尾没换行，先补一个，避免脚本和已有内容粘在一起
    const sep = existing && !existing.endsWith('\n') ? '\n' : ''
    appendFileSync(profile, sep + snippet + '\n', 'utf8')
    return { ok: true, message: `已写入 ${profile}，重开终端后生效` }
  } catch (e) {
    return { ok: false, message: `写入失败：${(e as Error).message}` }
  }
}

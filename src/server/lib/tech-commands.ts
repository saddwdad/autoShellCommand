// 技术栈命令知识库检索：把「项目类型 → 操作 → 命令模板」的结构化知识库扁平化，
// 用 embedding 对操作意图做相似度检索。LLM 通过 query_tech_command 工具主动查这里，
// 拿到命令模板 + 参数说明（如 jar 的 artifactId/version 从 pom.xml 读），再结合读到的
// 实际文件填充占位符，最终输出可执行命令。复用 rag.ts 的 embedTexts（同一份 embedding 模型）。
import { embedTexts } from './rag'
import { readSharedTechCommands } from './library'
import techCommands from '../../data/tech-commands.json'

interface TechType {
  type: string
  label: string
  detect: string[]
  ops: { intent: string; cmd: string; params: string }[]
}

interface IndexedOp {
  type: string
  label: string
  intent: string
  cmd: string
  params: string
}

// 把「云端技术栈命令库 + 内置 tech-commands.json」拍平成一条条「意图 → 模板」记录。
// 云端在前、内置在后，按 type|intent 去重（首个命中者保留）→ 云端同一意图可覆盖内置默认命令。
function loadOps(): IndexedOp[] {
  const ops: IndexedOp[] = []
  for (const e of readSharedTechCommands()) {
    ops.push({ type: e.type, label: e.label, intent: e.intent, cmd: e.cmd, params: e.params })
  }
  for (const t of techCommands as TechType[]) {
    for (const op of t.ops) {
      ops.push({
        type: t.type,
        label: t.label,
        intent: op.intent,
        cmd: op.cmd,
        params: op.params,
      })
    }
  }
  const seen = new Set<string>()
  return ops.filter((o) => {
    const key = `${o.type}|${o.intent}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

let cachedOps: IndexedOp[] | null = null
let cachedVecs: Float32Array | null = null

// 用条目签名判断缓存是否仍与当前库一致（云端同步后库会变，签名变 → 重新向量化）。
function signature(ops: IndexedOp[]): string {
  return ops.map((o) => `${o.type}|${o.intent}|${o.cmd}`).join('\n')
}

// 预计算所有操作意图的向量（进程内缓存；库内容变化时才重新向量化）
async function getIndex(): Promise<{ ops: IndexedOp[]; dim: number; vecs: Float32Array }> {
  const ops = loadOps()
  if (cachedVecs && cachedOps && signature(cachedOps) === signature(ops)) {
    return { ops: cachedOps, dim: cachedVecs.length / cachedOps.length, vecs: cachedVecs }
  }
  const intents = ops.map((o) => o.intent)
  const vecs = await embedTexts(intents)
  cachedOps = ops
  cachedVecs = vecs
  return { ops, dim: vecs.length / intents.length, vecs }
}

export interface TechCommandHit {
  type: string
  label: string
  intent: string
  cmd: string
  params: string
}

// 按意图检索最相似的技术栈命令模板；返回命令模板 + 参数说明，供 LLM 填占位符
export async function queryTechCommands(intent: string, topK = 3): Promise<TechCommandHit[]> {
  const { ops, dim, vecs } = await getIndex()
  if (ops.length === 0) return []

  const q = await embedTexts([intent])
  const qVec = q

  const scored = ops.map((op, i) => {
    let dot = 0
    for (let d = 0; d < dim; d++) dot += qVec[d] * vecs[i * dim + d]
    return { op, score: dot }
  })

  scored.sort((a, b) => b.score - a.score)
  return scored.slice(0, topK).map((s) => ({
    type: s.op.type,
    label: s.op.label,
    intent: s.op.intent,
    cmd: s.op.cmd,
    params: s.op.params,
  }))
}

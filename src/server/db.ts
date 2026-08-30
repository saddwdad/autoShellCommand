// 数据库入口：现在用 Prisma，不再手写 SQL 建表。
// 表结构定义在 prisma/schema.prisma 里，这里只需要导出 client。
// PrismaClient 会去读 schema 生成的类型，所以你之后用 prisma.feedback 时
// 编辑器能自动补全字段、拼错字段会直接编译报错。
import { PrismaClient } from '@prisma/client'

export const prisma = new PrismaClient()

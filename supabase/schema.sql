-- autoshell 云端 schema（在 Supabase 的 SQL Editor 里整段执行一次即可）。
-- 两张表：feedback（匿名反馈）+ library（共享命令库，本地 daemon 的下载源）。
-- RLS：只开放匿名（anon key）能做的事——写反馈、读写命令库；读反馈列表留给 service key。

-- 1. 反馈表：所有用户匿名提交的反馈
create table if not exists public.feedback (
  id bigint generated always as identity primary key,
  intent text not null,
  platform text not null,
  wrong_command text not null,
  expected_command text,
  note text,
  created_at timestamptz not null default now()
);

-- 2. 共享命令库：验证过的「意图 → 命令」。(intent, platform, command) 唯一，用于去重上传
create table if not exists public.library (
  id bigint generated always as identity primary key,
  intent text not null,
  platform text not null,
  command text not null,
  created_at timestamptz not null default now(),
  unique (intent, platform, command)
);

-- 3. 开行级安全
alter table public.feedback enable row level security;
alter table public.library enable row level security;

-- 4. 匿名策略：
--    - 可写反馈（匿名，无登录）
--    - 可读写命令库（匿名读 = 下载源；匿名写 = 从反馈沉淀命令）
--    注意：匿名「读反馈列表」是关闭的，只有 service key 能读（管理员用）。
create policy "anon_insert_feedback" on public.feedback
  for insert with check (true);
create policy "anon_select_library" on public.library
  for select using (true);
create policy "anon_insert_library" on public.library
  for insert with check (true);

-- 5. 表级权限（GRANT）：RLS 管「行」、GRANT 管「表」，两者独立，都要配。
--    anon：写反馈 + 读写命令库；service_role：全部（管理员读反馈列表、清理数据）。
grant insert on public.feedback to anon;
grant select, insert on public.library to anon;
grant all on public.feedback to service_role;
grant all on public.library to service_role;

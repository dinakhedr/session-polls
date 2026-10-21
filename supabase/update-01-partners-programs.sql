-- =====================================================================
-- Session Polls — Update 01: partners, programs, result timing, duplication
-- For an EXISTING database: run this file ONCE in Supabase
-- (SQL Editor → New query → paste → Run). Existing data is kept.
-- (New installations only need schema.sql, which already includes this.)
-- =====================================================================

-- ---------- 1. Partners and programs ----------

create table if not exists public.partners (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name        text not null check (char_length(name) between 1 and 120),
  created_at  timestamptz not null default now()
);

create table if not exists public.programs (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  partner_id  uuid not null references public.partners (id) on delete cascade,
  name        text not null check (char_length(name) between 1 and 120),
  created_at  timestamptz not null default now()
);

create index if not exists programs_partner_idx on public.programs (partner_id);

-- Sessions belong to a program (deleting a program deletes its sessions).
alter table public.sessions
  add column if not exists program_id uuid references public.programs (id) on delete cascade;
create index if not exists sessions_program_idx on public.sessions (program_id);

-- Per-question result timing: 'live' or 'after_close'.
alter table public.polls
  add column if not exists results_mode text not null default 'live'
  check (results_mode in ('live', 'after_close'));

-- ---------- 2. Security rules ----------

alter table public.partners enable row level security;
alter table public.programs enable row level security;

revoke all on public.partners, public.programs from anon;
grant select, insert, update, delete on public.partners, public.programs to authenticated;

drop policy if exists "Hosts manage their own partners" on public.partners;
create policy "Hosts manage their own partners"
  on public.partners for all to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

drop policy if exists "Hosts manage their own programs" on public.programs;
create policy "Hosts manage their own programs"
  on public.programs for all to authenticated
  using (owner_id = auth.uid())
  with check (
    owner_id = auth.uid()
    and exists (select 1 from public.partners pa where pa.id = programs.partner_id and pa.owner_id = auth.uid())
  );

-- A session may only be assigned to one of the host's own programs.
create or replace function public.sessions_before_write()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  new_code text;
begin
  if tg_op = 'INSERT' then
    loop
      new_code := lpad(floor(random() * 1000000)::int::text, 6, '0');
      exit when not exists (select 1 from public.sessions where code = new_code);
    end loop;
    new.code := new_code;
  else
    new.code := old.code;
    new.owner_id := old.owner_id;
  end if;

  if new.active_poll_id is not null and not exists (
    select 1 from public.polls where id = new.active_poll_id and session_id = new.id
  ) then
    raise exception 'The active poll must belong to this session';
  end if;

  if new.program_id is not null
     and new.program_id is distinct from (case when tg_op = 'UPDATE' then old.program_id end)
     and not exists (select 1 from public.programs where id = new.program_id and owner_id = new.owner_id) then
    raise exception 'The program must belong to the same host';
  end if;

  return new;
end;
$$;

-- ---------- 3. Participant view: respect result timing ----------

create or replace function public.get_live_state(p_code text, p_voter text default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  s public.sessions;
  p public.polls;
  voted boolean := false;
  visible boolean;
begin
  select * into s from public.sessions where code = p_code;
  if not found then
    return null;
  end if;

  if s.active_poll_id is not null then
    select * into p from public.polls where id = s.active_poll_id;
  end if;

  if p.id is null then
    return jsonb_build_object(
      'session', jsonb_build_object('title', s.title, 'code', s.code),
      'poll', null
    );
  end if;

  if p_voter is not null then
    voted := exists (select 1 from public.votes where poll_id = p.id and voter_id = p_voter);
  end if;

  visible := s.show_results and (p.results_mode = 'live' or not p.is_open);

  return jsonb_build_object(
    'session', jsonb_build_object('title', s.title, 'code', s.code),
    'poll', jsonb_build_object(
      'id', p.id,
      'question', p.question,
      'kind', p.kind,
      'options', to_jsonb(p.options),
      'allow_multiple', p.allow_multiple,
      'scale_max', p.scale_max,
      'is_open', p.is_open,
      'results_mode', p.results_mode
    ),
    'has_voted', voted,
    'show_results', s.show_results,
    'results', case when visible then public.poll_results(p.id) else null end
  );
end;
$$;

-- ---------- 4. Host helpers ----------

-- Number of polls and responses per session (only the host's own sessions).
create or replace function public.session_stats()
returns table (session_id uuid, poll_count int, vote_count int)
language sql
stable
security invoker
set search_path = public
as $$
  select
    s.id,
    (select count(*)::int from public.polls p where p.session_id = s.id),
    (select count(*)::int from public.votes v join public.polls p on p.id = v.poll_id where p.session_id = s.id)
  from public.sessions s;
$$;

-- Copies a question directly below the original, with no votes.
create or replace function public.duplicate_poll(p_poll uuid)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  src public.polls;
  new_id uuid;
begin
  select * into src from public.polls where id = p_poll;
  if not found then
    raise exception 'Poll not found';
  end if;

  update public.polls set position = position + 1
  where session_id = src.session_id and position > src.position;

  insert into public.polls (session_id, position, question, kind, options, allow_multiple, scale_max, results_mode, is_open)
  values (src.session_id, src.position + 1, src.question, src.kind, src.options, src.allow_multiple,
          src.scale_max, src.results_mode, false)
  returning id into new_id;

  return new_id;
end;
$$;

-- Copies a session with all its questions (new join code, no votes).
create or replace function public.duplicate_session(p_session uuid)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  src public.sessions;
  new_id uuid;
begin
  select * into src from public.sessions where id = p_session;
  if not found then
    raise exception 'Session not found';
  end if;

  insert into public.sessions (title, program_id, show_results)
  values (left(src.title || ' (copy)', 120), src.program_id, src.show_results)
  returning id into new_id;

  insert into public.polls (session_id, position, question, kind, options, allow_multiple, scale_max, results_mode)
  select new_id, position, question, kind, options, allow_multiple, scale_max, results_mode
  from public.polls
  where session_id = p_session;

  return new_id;
end;
$$;

revoke execute on function public.session_stats() from public, anon;
revoke execute on function public.duplicate_poll(uuid) from public, anon;
revoke execute on function public.duplicate_session(uuid) from public, anon;
grant execute on function public.session_stats() to authenticated;
grant execute on function public.duplicate_poll(uuid) to authenticated;
grant execute on function public.duplicate_session(uuid) to authenticated;

-- =====================================================================
-- Session Polls — database setup
-- Run this whole file ONCE in Supabase: SQL Editor → New query → paste → Run.
-- It creates the tables, the security rules and the voting functions.
-- =====================================================================

-- ---------- 1. Tables ----------

create table public.sessions (
  id              uuid primary key default gen_random_uuid(),
  owner_id        uuid not null default auth.uid() references auth.users (id) on delete cascade,
  title           text not null check (char_length(title) between 1 and 120),
  code            text not null unique,              -- 6-digit join code, generated automatically
  active_poll_id  uuid,                              -- the poll currently shown to the room
  show_results    boolean not null default true,     -- show results on screen and on phones
  created_at      timestamptz not null default now()
);

create table public.polls (
  id              uuid primary key default gen_random_uuid(),
  session_id      uuid not null references public.sessions (id) on delete cascade,
  position        int  not null default 0,
  question        text not null check (char_length(question) between 1 and 300),
  kind            text not null check (kind in ('choice', 'rating')),
  options         text[] not null default '{}',      -- answer options (multiple choice only)
  allow_multiple  boolean not null default false,    -- multiple choice: allow more than one answer
  scale_max       int  not null default 5 check (scale_max in (5, 10)),  -- rating: 1–5 or 1–10
  is_open         boolean not null default false,    -- voting accepted
  created_at      timestamptz not null default now(),
  constraint choice_needs_options
    check (kind <> 'choice' or cardinality(options) between 2 and 10)
);

alter table public.sessions
  add constraint sessions_active_poll_fk
  foreign key (active_poll_id) references public.polls (id) on delete set null;

create table public.votes (
  id          bigint generated always as identity primary key,
  poll_id     uuid not null references public.polls (id) on delete cascade,
  voter_id    text not null check (char_length(voter_id) between 8 and 64),  -- anonymous device ID
  choices     int[],          -- multiple choice: indexes of the chosen options
  rating      int,            -- rating scale: the number chosen
  created_at  timestamptz not null default now(),
  unique (poll_id, voter_id)  -- one vote per device per poll
);

create index polls_session_position_idx on public.polls (session_id, position);
create index votes_poll_idx on public.votes (poll_id);

-- ---------- 2. Session rules: join code, ownership, active poll ----------

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
    -- The join code and the owner never change after creation.
    new.code := old.code;
    new.owner_id := old.owner_id;
  end if;

  if new.active_poll_id is not null and not exists (
    select 1 from public.polls where id = new.active_poll_id and session_id = new.id
  ) then
    raise exception 'The active poll must belong to this session';
  end if;

  return new;
end;
$$;

create trigger sessions_before_write
  before insert or update on public.sessions
  for each row execute function public.sessions_before_write();

-- ---------- 3. Security rules (Row Level Security) ----------
-- Hosts can only see and change their own sessions, polls and votes.
-- Participants never touch the tables directly; they use the functions below.

alter table public.sessions enable row level security;
alter table public.polls    enable row level security;
alter table public.votes    enable row level security;

revoke all on public.sessions, public.polls, public.votes from anon;
grant select, insert, update, delete on public.sessions, public.polls to authenticated;
grant select, delete on public.votes to authenticated;

create policy "Hosts manage their own sessions"
  on public.sessions for all to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

create policy "Hosts manage polls in their own sessions"
  on public.polls for all to authenticated
  using (exists (select 1 from public.sessions s
                 where s.id = polls.session_id and s.owner_id = auth.uid()))
  with check (exists (select 1 from public.sessions s
                      where s.id = polls.session_id and s.owner_id = auth.uid()));

create policy "Hosts read votes in their own sessions"
  on public.votes for select to authenticated
  using (exists (select 1 from public.polls p
                 join public.sessions s on s.id = p.session_id
                 where p.id = votes.poll_id and s.owner_id = auth.uid()));

create policy "Hosts clear votes in their own sessions"
  on public.votes for delete to authenticated
  using (exists (select 1 from public.polls p
                 join public.sessions s on s.id = p.session_id
                 where p.id = votes.poll_id and s.owner_id = auth.uid()));

-- ---------- 4. Functions ----------

-- Result totals for one poll (internal; not callable from the app directly).
create or replace function public.poll_results(p_poll uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select case p.kind
    when 'choice' then jsonb_build_object(
      'total', (select count(*) from public.votes v where v.poll_id = p.id),
      'counts', (
        select coalesce(jsonb_agg(coalesce(c.cnt, 0) order by i), '[]'::jsonb)
        from generate_series(0, cardinality(p.options) - 1) as i
        left join (
          select u.idx, count(*) as cnt
          from public.votes v, unnest(v.choices) as u(idx)
          where v.poll_id = p.id
          group by u.idx
        ) c on c.idx = i
      ),
      'average', null
    )
    else jsonb_build_object(
      'total', (select count(*) from public.votes v where v.poll_id = p.id),
      'counts', (
        select coalesce(jsonb_agg(coalesce(c.cnt, 0) order by i), '[]'::jsonb)
        from generate_series(1, p.scale_max) as i
        left join (
          select v.rating, count(*) as cnt
          from public.votes v
          where v.poll_id = p.id
          group by v.rating
        ) c on c.rating = i
      ),
      'average', (select round(avg(v.rating)::numeric, 1) from public.votes v where v.poll_id = p.id)
    )
  end
  from public.polls p
  where p.id = p_poll;
$$;

-- What a participant's phone shows: the session title and the active poll.
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

  return jsonb_build_object(
    'session', jsonb_build_object('title', s.title, 'code', s.code),
    'poll', jsonb_build_object(
      'id', p.id,
      'question', p.question,
      'kind', p.kind,
      'options', to_jsonb(p.options),
      'allow_multiple', p.allow_multiple,
      'scale_max', p.scale_max,
      'is_open', p.is_open
    ),
    'has_voted', voted,
    'show_results', s.show_results,
    'results', case when s.show_results then public.poll_results(p.id) else null end
  );
end;
$$;

-- Records one vote. Returns 'ok', 'already_voted', 'closed' or 'invalid'.
create or replace function public.cast_vote(
  p_poll uuid,
  p_voter text,
  p_choices int[] default null,
  p_rating int default null
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  p public.polls;
  inserted int;
begin
  if p_voter is null or char_length(p_voter) not between 8 and 64 then
    return 'invalid';
  end if;

  -- Only the session's active poll, while voting is open, accepts votes.
  select pl.* into p
  from public.polls pl
  join public.sessions s on s.id = pl.session_id
  where pl.id = p_poll and s.active_poll_id = pl.id and pl.is_open;
  if not found then
    return 'closed';
  end if;

  if p.kind = 'choice' then
    if p_choices is null or cardinality(p_choices) = 0 then return 'invalid'; end if;
    if not p.allow_multiple and cardinality(p_choices) <> 1 then return 'invalid'; end if;
    if exists (select 1 from unnest(p_choices) c where c is null or c < 0 or c >= cardinality(p.options)) then
      return 'invalid';
    end if;
    if (select count(distinct c) from unnest(p_choices) c) <> cardinality(p_choices) then
      return 'invalid';
    end if;
    insert into public.votes (poll_id, voter_id, choices)
    values (p.id, p_voter, p_choices)
    on conflict (poll_id, voter_id) do nothing;
  else
    if p_rating is null or p_rating < 1 or p_rating > p.scale_max then return 'invalid'; end if;
    insert into public.votes (poll_id, voter_id, rating)
    values (p.id, p_voter, p_rating)
    on conflict (poll_id, voter_id) do nothing;
  end if;

  get diagnostics inserted = row_count;
  return case when inserted = 1 then 'ok' else 'already_voted' end;
end;
$$;

-- Live results for the host's presenter screen.
create or replace function public.host_poll_results(p_poll uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.polls p
    join public.sessions s on s.id = p.session_id
    where p.id = p_poll and s.owner_id = auth.uid()
  ) then
    raise exception 'Not allowed';
  end if;
  return public.poll_results(p_poll);
end;
$$;

-- ---------- 5. Who may call which function ----------

revoke execute on function public.poll_results(uuid) from public, anon, authenticated;
revoke execute on function public.get_live_state(text, text) from public;
revoke execute on function public.cast_vote(uuid, text, int[], int) from public;
revoke execute on function public.host_poll_results(uuid) from public, anon;

grant execute on function public.get_live_state(text, text) to anon, authenticated;
grant execute on function public.cast_vote(uuid, text, int[], int) to anon, authenticated;
grant execute on function public.host_poll_results(uuid) to authenticated;

-- ---------- 6. Live updates for the presenter screen ----------

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.votes;
  end if;
end;
$$;

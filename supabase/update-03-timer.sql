-- =====================================================================
-- Session Polls — Update 03: timed polls
-- For an EXISTING database: run this file ONCE in Supabase
-- (SQL Editor → New query → paste → Run). Existing data is kept.
-- (New installations only need schema.sql, which already includes this.)
-- =====================================================================

-- ---------- 1. Timer settings ----------

alter table public.polls
  add column if not exists duration_seconds int
  check (duration_seconds is null or duration_seconds between 5 and 3600);

-- When voting ends for a timed poll (set automatically when voting opens).
alter table public.polls add column if not exists closes_at timestamptz;

-- Starts the countdown when voting opens, clears it when voting closes.
create or replace function public.polls_before_write()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.is_open and (tg_op = 'INSERT' or not old.is_open) then
    new.closes_at := case
      when new.duration_seconds is not null then now() + make_interval(secs => new.duration_seconds)
    end;
  elsif not new.is_open then
    new.closes_at := null;
  end if;
  return new;
end;
$$;

drop trigger if exists polls_before_write on public.polls;
create trigger polls_before_write
  before insert or update on public.polls
  for each row execute function public.polls_before_write();

-- A poll accepts votes while it is open and its timer (if any) has not run out.
create or replace function public.poll_open(p public.polls)
returns boolean
language sql
stable
as $$
  select p.is_open and (p.closes_at is null or p.closes_at > now());
$$;

-- ---------- 2. Voting stops when the timer runs out ----------

create or replace function public.cast_vote(
  p_poll uuid,
  p_voter text,
  p_choices int[] default null,
  p_rating int default null,
  p_answer text default null
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  p public.polls;
  inserted int;
  clean text;
begin
  if p_voter is null or char_length(p_voter) not between 8 and 64 then
    return 'invalid';
  end if;

  select pl.* into p
  from public.polls pl
  join public.sessions s on s.id = pl.session_id
  where pl.id = p_poll and s.active_poll_id = pl.id and public.poll_open(pl);
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
  elsif p.kind = 'words' then
    clean := btrim(regexp_replace(coalesce(p_answer, ''), '\s+', ' ', 'g'));
    if char_length(clean) not between 1 and 40 then return 'invalid'; end if;
    insert into public.votes (poll_id, voter_id, answer)
    values (p.id, p_voter, clean)
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

revoke execute on function public.cast_vote(uuid, text, int[], int, text) from public;
grant execute on function public.cast_vote(uuid, text, int[], int, text) to anon, authenticated;

-- ---------- 3. Participant view: countdown and reveal ----------

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
  open_now boolean;
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
      'poll', null,
      'server_now', now()
    );
  end if;

  if p_voter is not null then
    voted := exists (select 1 from public.votes where poll_id = p.id and voter_id = p_voter);
  end if;

  open_now := public.poll_open(p);
  visible := s.show_results and (p.results_mode = 'live' or not open_now);

  return jsonb_build_object(
    'session', jsonb_build_object('title', s.title, 'code', s.code),
    'poll', jsonb_build_object(
      'id', p.id,
      'question', p.question,
      'kind', p.kind,
      'options', to_jsonb(p.options),
      'allow_multiple', p.allow_multiple,
      'scale_max', p.scale_max,
      'is_open', open_now,
      'results_mode', p.results_mode,
      'duration_seconds', p.duration_seconds,
      'closes_at', case when open_now then p.closes_at end
    ),
    'has_voted', voted,
    'show_results', s.show_results,
    'results', case when visible then public.poll_results(p.id) else null end,
    'server_now', now()
  );
end;
$$;

-- ---------- 4. Host helpers ----------

-- Current server time (lets the screens count down in sync).
create or replace function public.server_now()
returns timestamptz
language sql
stable
as $$ select now(); $$;

-- Adds seconds to a running timer ("+15 s" on the presenter screen).
create or replace function public.extend_poll(p_poll uuid, p_seconds int)
returns timestamptz
language plpgsql
security invoker
set search_path = public
as $$
declare
  new_close timestamptz;
begin
  update public.polls
  set closes_at = greatest(coalesce(closes_at, now()), now()) + make_interval(secs => least(greatest(p_seconds, 1), 600))
  where id = p_poll and is_open and duration_seconds is not null
  returning closes_at into new_close;
  return new_close;
end;
$$;

-- Duplicates now copy the timer too.
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

  insert into public.polls (session_id, position, question, kind, options, allow_multiple, scale_max, results_mode, duration_seconds, is_open)
  values (src.session_id, src.position + 1, src.question, src.kind, src.options, src.allow_multiple,
          src.scale_max, src.results_mode, src.duration_seconds, false)
  returning id into new_id;

  return new_id;
end;
$$;

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

  insert into public.polls (session_id, position, question, kind, options, allow_multiple, scale_max, results_mode, duration_seconds)
  select new_id, position, question, kind, options, allow_multiple, scale_max, results_mode, duration_seconds
  from public.polls
  where session_id = p_session;

  return new_id;
end;
$$;

revoke execute on function public.extend_poll(uuid, int) from public, anon;
grant execute on function public.extend_poll(uuid, int) to authenticated;
grant execute on function public.server_now() to anon, authenticated;

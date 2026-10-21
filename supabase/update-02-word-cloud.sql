-- =====================================================================
-- Session Polls — Update 02: word cloud questions
-- For an EXISTING database: run this file ONCE in Supabase
-- (SQL Editor → New query → paste → Run). Existing data is kept.
-- (New installations only need schema.sql, which already includes this.)
-- =====================================================================

-- ---------- 1. New question type and free-text answers ----------

alter table public.polls drop constraint if exists polls_kind_check;
alter table public.polls
  add constraint polls_kind_check check (kind in ('choice', 'rating', 'words'));

alter table public.votes
  add column if not exists answer text
  check (answer is null or char_length(answer) between 1 and 40);

-- Normalised form used to group answers ("Team  Spirit " = "team spirit").
create or replace function public.normalize_answer(t text)
returns text
language sql
immutable
as $$
  select lower(btrim(regexp_replace(coalesce(t, ''), '\s+', ' ', 'g')));
$$;

-- ---------- 2. Results, including word clouds ----------

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
    when 'words' then jsonb_build_object(
      'total', (select count(*) from public.votes v where v.poll_id = p.id),
      'counts', '[]'::jsonb,
      'average', null,
      'words', (
        select coalesce(jsonb_agg(jsonb_build_object('text', w.label, 'count', w.cnt) order by w.cnt desc, w.label), '[]'::jsonb)
        from (
          select
            (array_agg(btrim(regexp_replace(v.answer, '\s+', ' ', 'g')) order by v.created_at))[1] as label,
            count(*) as cnt
          from public.votes v
          where v.poll_id = p.id and v.answer is not null
          group by public.normalize_answer(v.answer)
          order by count(*) desc, 1
          limit 80
        ) w
      )
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

revoke execute on function public.poll_results(uuid) from public, anon, authenticated;

-- ---------- 3. Voting with a text answer ----------

drop function if exists public.cast_vote(uuid, text, int[], int);

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

-- ---------- 4. Moderation: the host removes an answer from a word cloud ----------

create or replace function public.remove_answer(p_poll uuid, p_text text)
returns int
language plpgsql
security invoker
set search_path = public
as $$
declare
  removed int;
begin
  delete from public.votes
  where poll_id = p_poll and public.normalize_answer(answer) = public.normalize_answer(p_text);
  get diagnostics removed = row_count;
  return removed;
end;
$$;

revoke execute on function public.remove_answer(uuid, text) from public, anon;
grant execute on function public.remove_answer(uuid, text) to authenticated;

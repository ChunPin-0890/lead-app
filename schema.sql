-- Database schema for the lead app.
-- Copied from schema.md. Run this file first on a new Supabase project,
-- then assign_lead_manually.sql, then seed.sql (once only).

-- ---------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------

create table countries (
  code text primary key,
  dial_code text not null,
  trunk_prefix text not null default ''
);

insert into countries (code, dial_code, trunk_prefix) values
  ('MY', '60', '0'),
  ('SG', '65', '');

create table agents (
  id serial primary key,
  name text not null,
  is_active boolean not null default true,
  is_online boolean not null default false,
  last_seen_at timestamptz,
  rr_order int not null unique
);

insert into agents (name, rr_order, is_online) values
  ('Amy', 1, true),
  ('Ben', 2, true),
  ('Chloe', 3, true),
  ('Daniel', 4, false);

create table round_robin_state (
  id int primary key default 1,
  last_agent_id int references agents(id)
);

insert into round_robin_state (id, last_agent_id) values (1, null);

create table leads (
  id serial primary key,
  external_lead_id text unique not null,
  name text not null,
  phone text,
  email text,
  country_code text references countries(code),
  normalized_phone text,
  normalized_email text,
  source text,
  project text,
  budget int,
  message text,
  status text not null default 'new',
  assigned_agent_id int references agents(id),
  possible_duplicate_of int references leads(id),
  created_at timestamptz not null default now()
);

create table webhook_events (
  id serial primary key,
  received_at timestamptz not null default now(),
  raw_payload jsonb not null,
  result text not null,
  error text,
  lead_id int references leads(id)
);

create table lead_assignments (
  id serial primary key,
  lead_id int not null references leads(id),
  agent_id int not null references agents(id),
  assigned_at timestamptz not null default now()
);

create table notifications (
  id serial primary key,
  agent_id int not null references agents(id),
  lead_id int not null references leads(id),
  status text not null default 'pending',
  created_at timestamptz not null default now()
);

create table lead_notes (
  id serial primary key,
  lead_id int not null references leads(id),
  author_agent_id int references agents(id),
  body text not null,
  created_at timestamptz not null default now()
);

create table lead_status_history (
  id serial primary key,
  lead_id int not null references leads(id),
  from_status text,
  to_status text not null,
  changed_by_agent_id int references agents(id),
  changed_at timestamptz not null default now()
);

-- ---------------------------------------------------------------
-- Functions
-- ---------------------------------------------------------------

-- Picks the next eligible agent and saves them as the last agent.
-- The for update lock stops two leads from picking at the same moment.
create or replace function assign_next_agent()
returns int
language plpgsql
as $$
declare
  last_order int;
  picked_id int;
begin
  -- Lock the state row so only one assignment runs at a time
  select coalesce(a.rr_order, 0) into last_order
  from round_robin_state s
  left join agents a on a.id = s.last_agent_id
  where s.id = 1
  for update of s;

  -- First try: the next eligible agent after the last one
  select e.id into picked_id
  from agents e
  where e.is_active and e.is_online and e.rr_order > last_order
  order by e.rr_order
  limit 1;

  -- Wrap-around: the lowest-order eligible agent
  if picked_id is null then
    select e.id into picked_id
    from agents e
    where e.is_active and e.is_online
    order by e.rr_order
    limit 1;
  end if;

  -- Nobody online: return null, so the lead stays unassigned
  if picked_id is null then
    return null;
  end if;

  -- Remember who got this lead
  update round_robin_state set last_agent_id = picked_id where id = 1;

  return picked_id;
end;
$$;

-- Saves a lead and assigns it in one transaction.
create or replace function create_lead_and_assign(
  p_external_id text, p_name text, p_phone text, p_email text,
  p_source text, p_project text, p_budget int, p_message text
) returns int
language plpgsql
as $$
declare
  new_lead_id int;
  chosen_agent int;
begin
  insert into leads (external_lead_id, name, phone, email, source, project, budget, message)
  values (p_external_id, p_name, p_phone, p_email, p_source, p_project, p_budget, p_message)
  returning id into new_lead_id;

  chosen_agent := assign_next_agent();

  if chosen_agent is not null then
    update leads set assigned_agent_id = chosen_agent where id = new_lead_id;
    insert into lead_assignments (lead_id, agent_id) values (new_lead_id, chosen_agent);
    insert into notifications (agent_id, lead_id) values (chosen_agent, new_lead_id);
  end if;

  return new_lead_id;
end;
$$;

-- ---------------------------------------------------------------
-- Rotation test (optional, not run by this file)
-- ---------------------------------------------------------------
-- With Amy, Ben, and Chloe online, expect 1, 2, 3, 1, 2, 3.
-- select assign_next_agent();
-- Reset between runs:
-- update round_robin_state set last_agent_id = null where id = 1;

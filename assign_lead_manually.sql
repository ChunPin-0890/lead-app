-- Manual assignment for Step 5. Run once in the Supabase SQL Editor.
-- A person picks an agent for a lead. This does not touch round_robin_state,
-- so the round-robin order for new leads is unchanged.
-- security definer lets the function write the three tables even when RLS is on for anon.

create or replace function assign_lead_manually(
  p_lead_id int,
  p_agent_id int
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Refuse an agent who is inactive or missing, before changing anything
  if not exists (select 1 from agents where id = p_agent_id and is_active) then
    raise exception 'Agent % is not active or does not exist', p_agent_id;
  end if;

  -- Lock the lead row so two changes to the same lead cannot interleave
  perform 1 from leads where id = p_lead_id for update;
  if not found then
    raise exception 'Lead % does not exist', p_lead_id;
  end if;

  -- 1. Set the lead's agent
  update leads set assigned_agent_id = p_agent_id where id = p_lead_id;

  -- 2. Record this assignment in the history
  insert into lead_assignments (lead_id, agent_id) values (p_lead_id, p_agent_id);

  -- 3. Notify the agent
  insert into notifications (agent_id, lead_id) values (p_agent_id, p_lead_id);
end;
$$;

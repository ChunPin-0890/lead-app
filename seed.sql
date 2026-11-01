-- Sample leads for Step 4. Run once in the Supabase SQL Editor.
-- Each lead goes through create_lead_and_assign, so the round-robin pointer moves.
-- Running this file a second time fails on the unique external_lead_id values; clear the leads table first if you need to re-run it.

select create_lead_and_assign('LD1001', 'John Tan', '0123456789', 'john@email.com', 'Facebook Ads', 'Residensi Mutiara', 650000, 'Interested in 3-bedroom unit');
select create_lead_and_assign('LD1002', 'Sarah Lim', '0198765432', 'sarah@email.com', 'Google Ads', 'Skyline Heights', 480000, 'Asked about 2-bedroom availability');
select create_lead_and_assign('LD1003', 'Ahmad Rahman', '0171234567', 'ahmad@email.com', 'Website', 'Residensi Mutiara', 920000, 'Wants a viewing this weekend');
select create_lead_and_assign('LD1004', 'Grace Wong', '0162223344', 'grace@email.com', 'Referral', 'Skyline Heights', 550000, 'Referred by an existing client');
select create_lead_and_assign('LD1005', 'Kevin Ng', '0185556677', 'kevin@email.com', 'Facebook Ads', 'Bayview Court', 390000, 'Price enquiry for a studio');

-- Give two leads a non-default status so the list shows more than "new".
-- Seed rows skip lead_status_history on purpose; Step 5 covers history for real changes.
update leads set status = 'contacted' where external_lead_id in ('LD1002', 'LD1004');

-- Check the result: each lead should show an assigned agent.
select l.external_lead_id, l.name, l.status, a.name as assigned_agent
from leads l
left join agents a on a.id = l.assigned_agent_id
order by l.external_lead_id;

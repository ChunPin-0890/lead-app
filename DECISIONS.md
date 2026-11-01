# Decisions

One line per decision, with the reason.

- **Known gap: anyone with the anon key can read and change data.** The read policies (and the write policies for the Step 5 tables) let any client holding the anon key read and change leads, notes, history, and agents. This is accepted for a take-home app with no login, but it is not safe for production. Fix it with real user auth and per-agent policies.
- **Round-robin is the only automatic assignment; manual assignment never moves the pointer.** The brief asks for round-robin on new leads, and a person's manual pick should stick without changing whose turn is next.
- **Manual assignment is a database function (`assign_lead_manually`).** It sets the agent, writes the assignment history, and notifies the agent in one transaction, so the three writes cannot be half done.
- **Manual assignment allows offline agents but refuses inactive ones.** An offline agent can still own a lead they were given; an inactive agent is removed from the team.
- **Status changes write the lead and the history row as two separate calls.** This was the simpler build for a take-home. If the history insert fails, the status still changes. Moving this into a database function would make it atomic.
- **Status choices are new, contacted, qualified, won, lost.** The brief does not list statuses, so these cover a basic sales pipeline.
- **The "acting as" dropdown stands in for login.** There are no user accounts, so the chosen agent is recorded as the author of each note and status change.
- **Seed leads are inserted through `create_lead_and_assign`.** This tests the real assignment path, at the cost of moving the round-robin pointer.
- **The endpoint is the Edge Function `leads-incoming`, at `/functions/v1/leads-incoming`.** Supabase does not serve custom `/api/...` paths, and we have no web host to add a rewrite.
- **`countryCode` is required and must be MY or SG.** The phone number cannot be cleaned without a country, and the missing-country test depends on it.
- **A repeated `externalLeadId` returns 409 before the other checks, after the token check.** Checking the token first means a stranger cannot find out which leadIds exist.
- **If phone and email both match an existing lead, no lead is created and the response is 409 with that lead's ID.** Re-sending the same person should not create a second lead or use up a round-robin turn.
- **If only one of phone or email matches, the lead is created and assigned, and `possible_duplicate_of` is set.** A sales agent should still see the new enquiry, but can check the link to the earlier lead.
- **Requests with a wrong or missing token are logged without their body.** Storing bodies from unauthenticated callers would let anyone fill the log.
- **The token is sent as `Authorization: Bearer <token>` and compared without an early exit.** It is a single shared secret, so the header is the simplest standard choice.
- **The function uses the service role key, which the platform supplies at runtime.** This keeps the write path working without anon write policies on the leads tables. The key is never written into a file.
- **`createdAt` is checked but not stored.** The `leads` table sets `created_at` itself, and a second timestamp would only add confusion.
- **Creating the lead and saving the cleaned phone and email are two database calls.** If the second one fails, the lead exists without its cleaned fields, and the log records an error. Moving both writes into one function would make them atomic.
- **Step 5 test: the first seed run gave all five leads to Amy.** Only Amy was online at that point, so this was correct. The seed was re-run with all three agents online.
- **Step 5 test: notes did not show on the detail page.** A select policy on `lead_notes` was missing. The page showed no error, only no notes, so the fix was to add the policy.
- **Phone numbers are stored in international form with a leading +.** A number starting with + or 00 already has its country code, so it is only cleaned. Any other number has its trunk prefix (MY: 0) removed and the country code added. Numbers outside 8 to 15 digits are rejected.

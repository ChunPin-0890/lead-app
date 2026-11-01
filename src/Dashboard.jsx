import { useEffect, useState } from 'react'
import { supabase } from './supabaseClient'

const STATUSES = ['new', 'contacted', 'qualified', 'won', 'lost']

// Read-only summary of the leads table: how many leads have each status, and how many each agent holds.
function Dashboard() {
  const [leads, setLeads] = useState([])
  const [agents, setAgents] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    async function loadDashboard() {
      // Two reads, one per table. The counting happens in this file, not in the database.
      const [leadResult, agentResult] = await Promise.all([
        supabase.from('leads').select('status, assigned_agent_id'),
        supabase.from('agents').select('id, name').order('rr_order'),
      ])

      const loadError = leadResult.error ?? agentResult.error
      if (loadError) {
        setError(loadError.message)
      } else {
        setLeads(leadResult.data)
        setAgents(agentResult.data)
      }
      setLoading(false)
    }

    loadDashboard()
  }, [])

  if (loading) return <p>Loading dashboard...</p>
  if (error) return <p className="error">Could not load the dashboard: {error}</p>

  const countsByStatus = Object.fromEntries(STATUSES.map((status) => [status, 0]))
  const countsByAgent = new Map()
  let otherStatus = 0
  let unassigned = 0

  for (const lead of leads) {
    if (STATUSES.includes(lead.status)) {
      countsByStatus[lead.status] += 1
    } else {
      otherStatus += 1
    }

    if (lead.assigned_agent_id === null) {
      unassigned += 1
    } else {
      countsByAgent.set(lead.assigned_agent_id, (countsByAgent.get(lead.assigned_agent_id) ?? 0) + 1)
    }
  }

  return (
    <section>
      <h2>Dashboard</h2>

      <h3>Leads by status</h3>
      <table>
        <thead>
          <tr>
            <th>Status</th>
            <th>Count</th>
          </tr>
        </thead>
        <tbody>
          {STATUSES.map((status) => (
            <tr key={status}>
              <td>{status}</td>
              <td>{countsByStatus[status]}</td>
            </tr>
          ))}
          <tr>
            <td>Other</td>
            <td>{otherStatus}</td>
          </tr>
          <tr>
            <td>Total</td>
            <td>{leads.length}</td>
          </tr>
        </tbody>
      </table>

      <h3>Leads by assigned agent</h3>
      <table>
        <thead>
          <tr>
            <th>Agent</th>
            <th>Count</th>
          </tr>
        </thead>
        <tbody>
          {agents.map((agent) => (
            <tr key={agent.id}>
              <td>{agent.name}</td>
              <td>{countsByAgent.get(agent.id) ?? 0}</td>
            </tr>
          ))}
          <tr>
            <td>Unassigned</td>
            <td>{unassigned}</td>
          </tr>
          <tr>
            <td>Total</td>
            <td>{leads.length}</td>
          </tr>
        </tbody>
      </table>
    </section>
  )
}

export default Dashboard

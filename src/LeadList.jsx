import { useEffect, useState } from 'react'
import { supabase } from './supabaseClient'

// Reads the leads table and shows each lead's name, status, and assigned agent.
function LeadList({ onSelect }) {
  const [leads, setLeads] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    async function loadLeads() {
      // The agents(name) part joins each lead to its agent, so we get the name, not just an id
      const { data, error } = await supabase
        .from('leads')
        .select('id, name, status, created_at, agents(name)')
        .order('created_at', { ascending: false })
        .order('id', { ascending: false })

      if (error) {
        setError(error.message)
      } else {
        setLeads(data)
      }
      setLoading(false)
    }

    loadLeads()
  }, [])

  if (loading) return <p>Loading leads...</p>
  if (error) return <p className="error">Could not load leads: {error}</p>
  if (leads.length === 0) return <p>No leads yet.</p>

  return (
    <table>
      <thead>
        <tr>
          <th>Name</th>
          <th>Status</th>
          <th>Assigned agent</th>
        </tr>
      </thead>
      <tbody>
        {leads.map((lead) => (
          <tr key={lead.id}>
            <td>
              <button type="button" className="link" onClick={() => onSelect(lead.id)}>
                {lead.name}
              </button>
            </td>
            <td>{lead.status}</td>
            <td>{lead.agents?.name ?? 'Unassigned'}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

export default LeadList

import { useEffect, useState } from 'react'
import { supabase } from './supabaseClient'
import LeadList from './LeadList'
import LeadDetail from './LeadDetail'
import AgentStatus from './AgentStatus'
import Dashboard from './Dashboard'

function App() {
  const [agents, setAgents] = useState([])
  const [actingAsId, setActingAsId] = useState('')
  const [selectedLeadId, setSelectedLeadId] = useState(null)
  const [view, setView] = useState('leads')

  useEffect(() => {
    // Load the agents once for the "Acting as" and "Assign to" dropdowns
    async function loadAgents() {
      const { data } = await supabase
        .from('agents')
        .select('id, name, is_online')
        .order('rr_order')
      setAgents(data ?? [])
    }

    loadAgents()
  }, [])

  return (
    <main className="app">
      <nav>
        <button type="button" aria-pressed={view === 'leads'} onClick={() => setView('leads')}>
          Leads
        </button>{' '}
        <button type="button" aria-pressed={view === 'agents'} onClick={() => setView('agents')}>
          Agents
        </button>{' '}
        <button type="button" aria-pressed={view === 'dashboard'} onClick={() => setView('dashboard')}>
          Dashboard
        </button>
      </nav>

      {view === 'agents' ? (
        <AgentStatus />
      ) : view === 'dashboard' ? (
        <Dashboard />
      ) : (
        <>
          <h1>Leads</h1>

          <label className="acting-as">
            Acting as{' '}
            <select value={actingAsId} onChange={(event) => setActingAsId(event.target.value)}>
              <option value="">Select an agent</option>
              {agents.map((agent) => (
                <option key={agent.id} value={agent.id}>
                  {agent.name}
                </option>
              ))}
            </select>
          </label>

          {selectedLeadId ? (
            <LeadDetail
              leadId={selectedLeadId}
              agents={agents}
              actingAsId={actingAsId ? Number(actingAsId) : null}
              onBack={() => setSelectedLeadId(null)}
            />
          ) : (
            <LeadList onSelect={setSelectedLeadId} />
          )}
        </>
      )}
    </main>
  )
}

export default App

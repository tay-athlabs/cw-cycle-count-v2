import { useNavigate } from 'react-router-dom'

export default function SKUMaster() {
  const navigate = useNavigate()

  return (
    <div className="page" style={{ maxWidth: 700 }}>
      <div className="flex-center gap-3 mb-6">
        <button className="btn btn-ghost btn-sm" onClick={() => navigate('/')}>←</button>
        <div>
          <h1 className="page-title">
            SKU Master
            <span className="badge badge-gray" style={{ marginLeft: 10, fontSize: 11, verticalAlign: 'middle' }}>
              Parked
            </span>
          </h1>
          <p className="page-sub">CWPN registry — CoreWeave Part Number source of truth</p>
        </div>
      </div>

      <div className="card">
        <div className="empty-state">
          <div className="empty-state-icon">📦</div>
          <div className="empty-state-title">Feature parked</div>
          <div className="empty-state-desc" style={{ maxWidth: 420, margin: '0 auto' }}>
            SKU and item data will be imported directly from NetSuite inventory
            balance exports. Manual SKU creation is not in scope for the current
            prototype — this feature will be revisited after the POC demo.
          </div>
          <button
            className="btn btn-cw mt-6"
            onClick={() => navigate('/session/new')}
          >
            Start a count session instead →
          </button>
        </div>
      </div>
    </div>
  )
}

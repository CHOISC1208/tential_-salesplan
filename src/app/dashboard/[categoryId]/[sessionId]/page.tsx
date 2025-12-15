'use client'

import { Fragment, useEffect, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { useSession } from 'next-auth/react'
import { ArrowLeft, Upload, Download, Save, Calendar, Plus, Edit2, Trash2 } from 'lucide-react'
import Papa from 'papaparse'

interface Session {
  id: string
  name: string
  totalBudget: string
  status: string
  hierarchyDefinitions: HierarchyDefinition[]
  category?: {
    id: string
    name: string
    userId: string
    user?: {
      id: string
      name: string | null
      email: string
    }
  }
}

interface HierarchyDefinition {
  level: number
  columnName: string
}

interface SkuData {
  id: string
  skuCode: string
  unitPrice: number
  hierarchyValues: Record<string, string>
}

interface Allocation {
  hierarchyPath: string
  level: number
  percentage: number
  amount: string
  quantity: number
  period?: string | null
}

interface HierarchyNode {
  path: string
  name: string
  level: number
  percentage: number
  amount: number
  unitPrice?: number
  quantity: number
  children: HierarchyNode[]
}

export default function SessionPage() {
  const router = useRouter()
  const params = useParams()
  const { data: authSession, status } = useSession()
  const [session, setSession] = useState<Session | null>(null)
  const [skuData, setSkuData] = useState<SkuData[]>([])
  const [allocations, setAllocations] = useState<Allocation[]>([])
  const [hierarchyTree, setHierarchyTree] = useState<HierarchyNode[]>([])
  const [loading, setLoading] = useState(true)
  const [showUploadModal, setShowUploadModal] = useState(false)

  // Period management states
  const [availablePeriods, setAvailablePeriods] = useState<Array<string | null>>([])
  const [selectedPeriod, setSelectedPeriod] = useState<string | null>(null)
  const [showPeriodModal, setShowPeriodModal] = useState(false)
  const [periodModalMode, setPeriodModalMode] = useState<'add' | 'rename' | 'delete'>('add')
  const [periodModalValue, setPeriodModalValue] = useState<string | null>(null)
  const [periodModalNewValue, setPeriodModalNewValue] = useState('')
  const [periodModalCopyFrom, setPeriodModalCopyFrom] = useState<string | null>(null)

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/login')
    } else if (status === 'authenticated') {
      loadData()
    }
  }, [status, router])

  const loadData = async () => {
    try {
      const [sessionRes, skuRes, allocRes, periodsRes] = await Promise.all([
        fetch(`/api/sessions/${params.sessionId}`),
        fetch(`/api/sessions/${params.sessionId}/sku-data`),
        fetch(`/api/sessions/${params.sessionId}/allocations`),
        fetch(`/api/sessions/${params.sessionId}/periods`)
      ])

      if (sessionRes.ok) {
        const sessionData = await sessionRes.json()
        setSession(sessionData)
      }

      if (skuRes.ok) {
        const skuDataRes = await skuRes.json()
        setSkuData(skuDataRes)
      }

      if (allocRes.ok) {
        const allocationsData = await allocRes.json()
        setAllocations(allocationsData)
      }

      if (periodsRes.ok) {
        const { periods } = await periodsRes.json()
        setAvailablePeriods(periods)
        // Set initial selected period
        if (periods.length > 0 && selectedPeriod === null) {
          setSelectedPeriod(periods[0])
        }
      }
    } catch (error) {
      console.error('Error loading data:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleCSVUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    Papa.parse(file, {
      header: true,
      complete: async (results) => {
        const data = results.data as any[]
        if (data.length === 0) return

        // Extract hierarchy columns (all columns except sku_code and unitprice)
        const allColumns = Object.keys(data[0])
        const hierarchyColumns = allColumns.filter(
          col => col !== 'sku_code' && col !== 'unitprice'
        )

        // Transform data
        const skuData = data
          .filter(row => row.sku_code && row.unitprice)
          .map(row => {
            const hierarchyValues: Record<string, string> = {}
            hierarchyColumns.forEach(col => {
              if (row[col]) {
                hierarchyValues[col] = row[col]
              }
            })

            return {
              skuCode: row.sku_code,
              unitPrice: parseInt(row.unitprice),
              hierarchyValues
            }
          })

        try {
          const response = await fetch(`/api/sessions/${params.sessionId}/import`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ skuData, hierarchyColumns })
          })

          if (response.ok) {
            setShowUploadModal(false)
            loadData()
          }
        } catch (error) {
          console.error('Error uploading CSV:', error)
        }
      }
    })
  }

  const handleExport = async () => {
    try {
      const response = await fetch(`/api/sessions/${params.sessionId}/export`)
      const blob = await response.blob()
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `budget-allocation-${params.sessionId}.csv`
      a.click()
    } catch (error) {
      console.error('Error exporting:', error)
    }
  }

  const updateAllocation = (path: string, percentage: number) => {
    if (!session) return

    const totalBudget = parseInt(session.totalBudget)
    const amount = Math.floor(totalBudget * (percentage / 100))

    // Find related SKUs
    const relatedSkus = skuData.filter(sku => {
      const skuPath = buildHierarchyPath(sku, session.hierarchyDefinitions, path.split('/').length)
      return skuPath === path
    })

    // Calculate quantity (sum of unit prices)
    const totalUnitPrice = relatedSkus.reduce((sum, sku) => sum + sku.unitPrice, 0)
    const quantity = totalUnitPrice > 0 ? Math.floor(amount / totalUnitPrice) : 0

    const existingIndex = allocations.findIndex(a => a.hierarchyPath === path && a.period === selectedPeriod)
    if (existingIndex >= 0) {
      const updated = [...allocations]
      updated[existingIndex] = {
        ...updated[existingIndex],
        percentage,
        amount: amount.toString(),
        quantity
      }
      setAllocations(updated)
    } else {
      setAllocations([
        ...allocations,
        {
          hierarchyPath: path,
          level: path.split('/').length,
          percentage,
          amount: amount.toString(),
          quantity,
          period: selectedPeriod
        }
      ])
    }
  }

  const saveAllocations = async () => {
    try {
      await fetch(`/api/sessions/${params.sessionId}/allocations`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ allocations })
      })
      alert('保存しました')
    } catch (error) {
      console.error('Error saving allocations:', error)
      alert('保存に失敗しました')
    }
  }

  // Period management functions
  const addPeriod = async () => {
    if (!periodModalValue || periodModalValue.trim() === '') {
      alert('期間名を入力してください')
      return
    }

    try {
      const response = await fetch(`/api/sessions/${params.sessionId}/periods`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          period: periodModalValue.trim(),
          copyFrom: periodModalCopyFrom
        })
      })

      if (response.ok) {
        alert('期間を追加しました')
        setShowPeriodModal(false)
        setPeriodModalValue('')
        setPeriodModalCopyFrom(null)
        loadData()
      } else {
        const error = await response.json()
        alert(`期間の追加に失敗しました: ${error.error}`)
      }
    } catch (error) {
      console.error('Error adding period:', error)
      alert('期間の追加に失敗しました')
    }
  }

  const renamePeriod = async () => {
    if (!periodModalNewValue || periodModalNewValue.trim() === '') {
      alert('新しい期間名を入力してください')
      return
    }

    try {
      const encodedPeriod = encodeURIComponent(periodModalValue === null ? 'null' : periodModalValue)
      const response = await fetch(`/api/sessions/${params.sessionId}/periods/${encodedPeriod}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ newPeriod: periodModalNewValue.trim() })
      })

      if (response.ok) {
        alert('期間名を変更しました')
        setShowPeriodModal(false)
        setPeriodModalValue('')
        setPeriodModalNewValue('')
        loadData()
      } else {
        const error = await response.json()
        alert(`期間名の変更に失敗しました: ${error.error}`)
      }
    } catch (error) {
      console.error('Error renaming period:', error)
      alert('期間名の変更に失敗しました')
    }
  }

  const deletePeriod = async () => {
    if (!confirm(`本当に期間「${periodModalValue === null ? 'デフォルト' : periodModalValue}」を削除しますか？この期間の全ての配分データが削除されます。`)) {
      return
    }

    try {
      const encodedPeriod = encodeURIComponent(periodModalValue === null ? 'null' : periodModalValue)
      const response = await fetch(`/api/sessions/${params.sessionId}/periods/${encodedPeriod}`, {
        method: 'DELETE'
      })

      if (response.ok) {
        alert('期間を削除しました')
        setShowPeriodModal(false)
        setPeriodModalValue('')
        loadData()
      } else {
        const error = await response.json()
        alert(`期間の削除に失敗しました: ${error.error}`)
      }
    } catch (error) {
      console.error('Error deleting period:', error)
      alert('期間の削除に失敗しました')
    }
  }

  const handlePeriodModalSubmit = () => {
    if (periodModalMode === 'add') {
      addPeriod()
    } else if (periodModalMode === 'rename') {
      renamePeriod()
    } else if (periodModalMode === 'delete') {
      deletePeriod()
    }
  }

  const buildHierarchyPath = (sku: SkuData, defs: HierarchyDefinition[], level: number): string => {
    const parts: string[] = []
    for (let i = 0; i < level && i < defs.length; i++) {
      const value = sku.hierarchyValues[defs[i].columnName]
      if (value) {
        parts.push(value)
      }
    }
    return parts.join('/')
  }

  const buildHierarchyTree = (): HierarchyNode[] => {
    if (!session || skuData.length === 0) return []

    const tree: HierarchyNode[] = []
    const nodeMap = new Map<string, HierarchyNode>()

    // Filter allocations by selected period
    const periodAllocations = allocations.filter(a => a.period === selectedPeriod)

    // Build tree structure
    for (const sku of skuData) {
      for (let level = 1; level <= session.hierarchyDefinitions.length; level++) {
        const path = buildHierarchyPath(sku, session.hierarchyDefinitions, level)
        if (!path) continue

        if (!nodeMap.has(path)) {
          const parts = path.split('/')
          const name = parts[parts.length - 1]
          const allocation = periodAllocations.find((a: Allocation & { period?: string | null }) => a.hierarchyPath === path)

          const node: HierarchyNode = {
            path,
            name,
            level,
            percentage: allocation?.percentage || 0,
            amount: allocation ? parseInt(allocation.amount) : 0,
            quantity: allocation?.quantity || 0,
            children: []
          }

          nodeMap.set(path, node)

          if (level === 1) {
            tree.push(node)
          } else {
            const parentPath = parts.slice(0, -1).join('/')
            const parent = nodeMap.get(parentPath)
            if (parent) {
              parent.children.push(node)
            }
          }
        }
      }
    }

    return tree
  }

  useEffect(() => {
    if (session && skuData.length > 0) {
      setHierarchyTree(buildHierarchyTree())
    }
  }, [session, skuData, allocations, selectedPeriod])

  if (status === 'loading' || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-xl">読み込み中...</div>
      </div>
    )
  }

  if (!session) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-xl">セッションが見つかりません</div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-100">
      <header className="bg-white shadow">
        <div className="max-w-7xl mx-auto px-4 py-6 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <button onClick={() => router.push('/dashboard')} className="btn btn-secondary">
                <ArrowLeft size={20} />
              </button>
              <div>
                <h1 className="text-3xl font-bold">{session.name}</h1>
                <div className="flex items-center gap-4">
                  <p className="text-gray-600">
                    総予算: ¥{parseInt(session.totalBudget).toLocaleString()}
                  </p>
                  <div className="text-sm text-gray-600">
                    作成者: {session.category?.user?.name || session.category?.user?.email || '不明'}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`px-3 py-1 rounded-full text-sm ${
                      session.status === 'confirmed' ? 'bg-green-100 text-green-800' :
                      session.status === 'archived' ? 'bg-gray-100 text-gray-800' :
                      'bg-yellow-100 text-yellow-800'
                    }`}>
                      {session.status === 'confirmed' ? '確定' :
                       session.status === 'archived' ? 'アーカイブ' : '作業中'}
                    </span>
                    {session.category?.userId === authSession?.user?.id && session.status !== 'draft' && (
                      <button
                        onClick={async () => {
                          if (confirm('ステータスを「作業中」に戻しますか？')) {
                            try {
                              const response = await fetch(`/api/sessions/${params.sessionId}`, {
                                method: 'PUT',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ status: 'draft' })
                              })
                              if (response.ok) {
                                loadData()
                                alert('ステータスを「作業中」に変更しました')
                              } else {
                                alert('ステータスの変更に失敗しました')
                              }
                            } catch (error) {
                              console.error('Error updating status:', error)
                              alert('ステータスの変更に失敗しました')
                            }
                          }
                        }}
                        className="text-xs text-blue-600 hover:text-blue-800 underline"
                      >
                        作業中に戻す
                      </button>
                    )}
                  </div>

                  {/* Period Selection */}
                  {availablePeriods.length > 0 && (
                    <div className="flex items-center gap-2 border-l pl-4">
                      <Calendar size={16} className="text-gray-600" />
                      <span className="text-sm text-gray-600">期間:</span>
                      <select
                        value={selectedPeriod === null ? 'null' : selectedPeriod || ''}
                        onChange={(e) => {
                          const val = e.target.value === 'null' ? null : e.target.value
                          setSelectedPeriod(val)
                        }}
                        className="px-2 py-1 border border-gray-300 rounded text-sm"
                      >
                        {availablePeriods.map(period => (
                          <option key={period === null ? 'null' : period} value={period === null ? 'null' : period}>
                            {period === null ? 'デフォルト' : period}
                          </option>
                        ))}
                      </select>
                      {session.category?.userId === authSession?.user?.id && (
                        <div className="flex gap-1">
                          <button
                            onClick={() => {
                              setPeriodModalMode('add')
                              setPeriodModalValue('')
                              setPeriodModalCopyFrom(availablePeriods[0] || null)
                              setShowPeriodModal(true)
                            }}
                            className="p-1 text-green-600 hover:bg-green-50 rounded"
                            title="期間を追加"
                          >
                            <Plus size={16} />
                          </button>
                          <button
                            onClick={() => {
                              if (availablePeriods.length === 0) {
                                alert('変更する期間がありません')
                                return
                              }
                              setPeriodModalMode('rename')
                              setPeriodModalValue(availablePeriods[0])
                              setPeriodModalNewValue(availablePeriods[0] === null ? '' : availablePeriods[0] || '')
                              setShowPeriodModal(true)
                            }}
                            className="p-1 text-blue-600 hover:bg-blue-50 rounded"
                            title="期間名を変更"
                          >
                            <Edit2 size={16} />
                          </button>
                          <button
                            onClick={() => {
                              if (availablePeriods.length === 0) {
                                alert('削除する期間がありません')
                                return
                              }
                              setPeriodModalMode('delete')
                              setPeriodModalValue(availablePeriods[0])
                              setShowPeriodModal(true)
                            }}
                            className="p-1 text-red-600 hover:bg-red-50 rounded"
                            title="期間を削除"
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
            <div className="flex gap-2">
              <button onClick={() => setShowUploadModal(true)} className="btn btn-primary flex items-center gap-2">
                <Upload size={20} />
                CSV取り込み
              </button>
              <button onClick={handleExport} className="btn btn-secondary flex items-center gap-2">
                <Download size={20} />
                エクスポート
              </button>
              <button onClick={saveAllocations} className="btn btn-primary flex items-center gap-2">
                <Save size={20} />
                保存
              </button>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-6 sm:px-6 lg:px-8">
        {skuData.length === 0 ? (
          <div className="card text-center py-12">
            <p className="text-gray-600 mb-4">CSVファイルをアップロードしてください</p>
            <button onClick={() => setShowUploadModal(true)} className="btn btn-primary">
              CSV取り込み
            </button>
          </div>
        ) : (
          <div className="card overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-2 px-4">階層</th>
                  <th className="text-right py-2 px-4">割合 (%)</th>
                  <th className="text-right py-2 px-4">金額 (円)</th>
                  <th className="text-right py-2 px-4">数量</th>
                </tr>
              </thead>
              <tbody>
                {renderHierarchyNodes(hierarchyTree, updateAllocation)}
              </tbody>
            </table>
          </div>
        )}
      </main>

      {/* Upload Modal */}
      {showUploadModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white p-6 rounded-lg w-full max-w-md">
            <h2 className="text-xl font-bold mb-4">CSV取り込み</h2>
            <div className="mb-4">
              <label className="label">CSVファイル</label>
              <input
                type="file"
                accept=".csv"
                onChange={handleCSVUpload}
                className="w-full"
              />
              <p className="text-sm text-gray-600 mt-2">
                必須カラム: sku_code, unitprice<br />
                その他のカラムは自動的に階層として認識されます
              </p>
            </div>
            <button
              onClick={() => setShowUploadModal(false)}
              className="btn btn-secondary w-full"
            >
              キャンセル
            </button>
          </div>
        </div>
      )}

      {/* Period Management Modal */}
      {showPeriodModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white p-6 rounded-lg w-full max-w-md">
            <h2 className="text-xl font-bold mb-4 text-gray-900">
              {periodModalMode === 'add' && '期間を追加'}
              {periodModalMode === 'rename' && '期間名を変更'}
              {periodModalMode === 'delete' && '期間を削除'}
            </h2>

            {periodModalMode === 'add' && (
              <>
                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-900 mb-2">期間名</label>
                  <input
                    type="text"
                    value={periodModalValue || ''}
                    onChange={(e) => setPeriodModalValue(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="例: 2024-05, Q1, 春"
                  />
                </div>
                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-900 mb-2">コピー元期間（オプション）</label>
                  <select
                    value={periodModalCopyFrom === null ? 'null' : periodModalCopyFrom || ''}
                    onChange={(e) => setPeriodModalCopyFrom(e.target.value === 'null' ? null : e.target.value === '' ? null : e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md text-gray-900"
                  >
                    <option value="">コピーしない（新規作成）</option>
                    {availablePeriods.map(period => (
                      <option key={period === null ? 'null' : period} value={period === null ? 'null' : period}>
                        {period === null ? 'デフォルト' : period}
                      </option>
                    ))}
                  </select>
                  <p className="text-xs text-gray-500 mt-1">
                    既存の期間から配分データをコピーして新しい期間を作成できます
                  </p>
                </div>
              </>
            )}

            {periodModalMode === 'rename' && (
              <>
                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-900 mb-2">対象期間を選択</label>
                  <select
                    value={periodModalValue === null ? 'null' : periodModalValue || ''}
                    onChange={(e) => {
                      const val = e.target.value === 'null' ? null : e.target.value
                      setPeriodModalValue(val)
                      setPeriodModalNewValue(val === null ? '' : val)
                    }}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md text-gray-900"
                  >
                    {availablePeriods.map(period => (
                      <option key={period === null ? 'null' : period} value={period === null ? 'null' : period}>
                        {period === null ? 'デフォルト' : period}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-900 mb-2">新しい期間名</label>
                  <input
                    type="text"
                    value={periodModalNewValue}
                    onChange={(e) => setPeriodModalNewValue(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="新しい期間名"
                  />
                </div>
              </>
            )}

            {periodModalMode === 'delete' && (
              <>
                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-900 mb-2">削除する期間を選択</label>
                  <select
                    value={periodModalValue === null ? 'null' : periodModalValue || ''}
                    onChange={(e) => setPeriodModalValue(e.target.value === 'null' ? null : e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md text-gray-900"
                  >
                    {availablePeriods.map(period => (
                      <option key={period === null ? 'null' : period} value={period === null ? 'null' : period}>
                        {period === null ? 'デフォルト' : period}
                      </option>
                    ))}
                  </select>
                </div>
                <p className="text-gray-900 mb-4">
                  期間「{periodModalValue === null ? 'デフォルト' : periodModalValue}」を削除しますか？
                  この期間の全ての配分データが削除されます。この操作は元に戻せません。
                </p>
              </>
            )}

            <div className="flex gap-2">
              <button
                onClick={handlePeriodModalSubmit}
                className={`btn flex-1 ${
                  periodModalMode === 'delete'
                    ? 'bg-red-600 text-white hover:bg-red-700'
                    : 'btn-primary'
                }`}
              >
                {periodModalMode === 'add' && '追加'}
                {periodModalMode === 'rename' && '変更'}
                {periodModalMode === 'delete' && '削除'}
              </button>
              <button
                onClick={() => {
                  setShowPeriodModal(false)
                  setPeriodModalValue('')
                  setPeriodModalNewValue('')
                  setPeriodModalCopyFrom(null)
                }}
                className="btn btn-secondary flex-1"
              >
                キャンセル
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function renderHierarchyNodes(
  nodes: HierarchyNode[],
  updateAllocation: (path: string, percentage: number) => void,
  depth = 0
): React.ReactNode {
  return nodes.map((node) => (
    <Fragment key={node.path}>
      <tr className="border-b hover:bg-gray-50">
        <td className="py-2 px-4" style={{ paddingLeft: `${depth * 20 + 16}px` }}>
          {node.name}
        </td>
        <td className="text-right py-2 px-4">
          <input
            type="number"
            className="w-24 px-2 py-1 border rounded text-right"
            value={node.percentage}
            onChange={(e) => updateAllocation(node.path, parseFloat(e.target.value) || 0)}
            min="0"
            max="100"
            step="0.01"
          />
        </td>
        <td className="text-right py-2 px-4">
          ¥{node.amount.toLocaleString()}
        </td>
        <td className="text-right py-2 px-4">
          {node.quantity}
        </td>
      </tr>
      {node.children.length > 0 && renderHierarchyNodes(node.children, updateAllocation, depth + 1)}
    </Fragment>
  ))
}

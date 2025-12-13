'use client'

import { useEffect, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { useSession } from 'next-auth/react'
import { ArrowLeft, Upload, Download, Save } from 'lucide-react'
import Papa from 'papaparse'

interface Session {
  id: string
  name: string
  totalBudget: string
  status: string
  hierarchyDefinitions: HierarchyDefinition[]
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
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [uploading, setUploading] = useState(false)

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/login')
    } else if (status === 'authenticated') {
      loadData()
    }
  }, [status, router])

  const loadData = async () => {
    try {
      const [sessionRes, skuRes, allocRes] = await Promise.all([
        fetch(`/api/sessions/${params.sessionId}`),
        fetch(`/api/sessions/${params.sessionId}/sku-data`),
        fetch(`/api/sessions/${params.sessionId}/allocations`)
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
    } catch (error) {
      console.error('Error loading data:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      setSelectedFile(file)
    }
  }

  const handleCSVUpload = async () => {
    if (!selectedFile) return

    setUploading(true)

    Papa.parse(selectedFile, {
      header: true,
      dynamicTyping: false, // すべてのフィールドを文字列として読み込み、科学的表記法を防ぐ
      skipEmptyLines: true,
      complete: async (results) => {
        const data = results.data as any[]
        if (data.length === 0) {
          alert('CSVファイルが空です')
          setUploading(false)
          return
        }

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
                hierarchyValues[col] = String(row[col]).trim()
              }
            })

            return {
              skuCode: String(row.sku_code).trim(), // 明示的に文字列に変換
              unitPrice: parseInt(String(row.unitprice)), // 文字列から数値に変換
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
            setSelectedFile(null)
            loadData()
            alert('CSVを正常にアップロードしました')
          } else {
            const errorData = await response.json()
            if (errorData.details) {
              const errorMessages = errorData.details.map((err: any) =>
                `${err.path.join('.')}: ${err.message}`
              ).join('\n')
              alert(`アップロードに失敗しました:\n${errorMessages}`)
            } else {
              alert(`アップロードに失敗しました: ${errorData.error || '不明なエラー'}`)
            }
          }
        } catch (error) {
          console.error('Error uploading CSV:', error)
          alert('アップロード中にエラーが発生しました')
        } finally {
          setUploading(false)
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

    const existingIndex = allocations.findIndex(a => a.hierarchyPath === path)
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
          quantity
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

    // Build tree structure
    for (const sku of skuData) {
      for (let level = 1; level <= session.hierarchyDefinitions.length; level++) {
        const path = buildHierarchyPath(sku, session.hierarchyDefinitions, level)
        if (!path) continue

        if (!nodeMap.has(path)) {
          const parts = path.split('/')
          const name = parts[parts.length - 1]
          const allocation = allocations.find(a => a.hierarchyPath === path)

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
  }, [session, skuData, allocations])

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
                <h1 className="text-3xl font-bold text-gray-900">{session.name}</h1>
                <p className="text-gray-700">
                  総予算: ¥{parseInt(session.totalBudget).toLocaleString()}
                </p>
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
                  <th className="text-left py-2 px-4 text-gray-900 font-semibold">階層</th>
                  <th className="text-right py-2 px-4 text-gray-900 font-semibold">割合 (%)</th>
                  <th className="text-right py-2 px-4 text-gray-900 font-semibold">金額 (円)</th>
                  <th className="text-right py-2 px-4 text-gray-900 font-semibold">数量</th>
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
            <h2 className="text-xl font-bold mb-4 text-gray-900">CSV取り込み</h2>
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-900 mb-2">CSVファイル</label>
              <input
                type="file"
                accept=".csv"
                onChange={handleFileSelect}
                className="w-full text-gray-900 file:mr-4 file:py-2 file:px-4 file:rounded file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
                disabled={uploading}
              />
              {selectedFile && (
                <p className="text-sm text-green-600 mt-2">
                  選択済み: {selectedFile.name}
                </p>
              )}
              <p className="text-sm text-gray-700 mt-2">
                必須カラム: sku_code, unitprice<br />
                その他のカラムは自動的に階層として認識されます
              </p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={handleCSVUpload}
                className="btn btn-primary flex-1"
                disabled={!selectedFile || uploading}
              >
                {uploading ? 'アップロード中...' : 'アップロード'}
              </button>
              <button
                onClick={() => {
                  setShowUploadModal(false)
                  setSelectedFile(null)
                }}
                className="btn btn-secondary flex-1"
                disabled={uploading}
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
    <React.Fragment key={node.path}>
      <tr className="border-b hover:bg-gray-50">
        <td className="py-2 px-4 text-gray-900" style={{ paddingLeft: `${depth * 20 + 16}px` }}>
          {node.name}
        </td>
        <td className="text-right py-2 px-4">
          <input
            type="number"
            className="w-24 px-2 py-1 border rounded text-right text-gray-900 border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
            value={node.percentage}
            onChange={(e) => updateAllocation(node.path, parseFloat(e.target.value) || 0)}
            min="0"
            max="100"
            step="0.01"
          />
        </td>
        <td className="text-right py-2 px-4 text-gray-900">
          ¥{node.amount.toLocaleString()}
        </td>
        <td className="text-right py-2 px-4 text-gray-900">
          {node.quantity}
        </td>
      </tr>
      {node.children.length > 0 && renderHierarchyNodes(node.children, updateAllocation, depth + 1)}
    </React.Fragment>
  ))
}

'use client'

import { useEffect, useState, Fragment } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { useSession } from 'next-auth/react'
import { ArrowLeft, Upload, Download, Save, ChevronDown, ChevronRight, AlertCircle, Check, Menu } from 'lucide-react'
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
  const [currentLevel, setCurrentLevel] = useState(1)
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set())
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [category, setCategory] = useState<{ id: string; name: string } | null>(null)
  const [sessions, setSessions] = useState<Session[]>([])

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/login')
    } else if (status === 'authenticated') {
      loadData()
    }
  }, [status, router])

  const loadData = async () => {
    try {
      const [sessionRes, skuRes, allocRes, categoryRes, sessionsRes] = await Promise.all([
        fetch(`/api/sessions/${params.sessionId}`),
        fetch(`/api/sessions/${params.sessionId}/sku-data`),
        fetch(`/api/sessions/${params.sessionId}/allocations`),
        fetch(`/api/categories/${params.categoryId}`),
        fetch(`/api/categories/${params.categoryId}/sessions`)
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

      if (categoryRes.ok) {
        const categoryData = await categoryRes.json()
        setCategory(categoryData)
      }

      if (sessionsRes.ok) {
        const sessionsData = await sessionsRes.json()
        setSessions(sessionsData)
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

  const toggleGroup = (path: string) => {
    const newExpanded = new Set(expandedGroups)
    if (newExpanded.has(path)) {
      newExpanded.delete(path)
    } else {
      newExpanded.add(path)
    }
    setExpandedGroups(newExpanded)
  }

  const expandAll = () => {
    const allPaths = new Set<string>()
    const collectPaths = (nodes: HierarchyNode[]) => {
      nodes.forEach(node => {
        if (node.children.length > 0) {
          allPaths.add(node.path)
          collectPaths(node.children)
        }
      })
    }
    collectPaths(hierarchyTree)
    setExpandedGroups(allPaths)
  }

  const collapseAll = () => {
    setExpandedGroups(new Set())
  }

  const equalDistribution = (parentPath: string | null, level: number) => {
    if (!session) return

    // Get all nodes at the current level
    let nodesToDistribute: HierarchyNode[] = []

    if (parentPath === null) {
      // Level 1: distribute among all top-level nodes
      nodesToDistribute = hierarchyTree.filter(n => n.level === level)
    } else {
      // Level 2+: find parent and distribute among its children
      const findChildren = (nodes: HierarchyNode[]): HierarchyNode[] => {
        for (const node of nodes) {
          if (node.path === parentPath) {
            return node.children.filter(c => c.level === level)
          }
          const found = findChildren(node.children)
          if (found.length > 0) return found
        }
        return []
      }
      nodesToDistribute = findChildren(hierarchyTree)
    }

    if (nodesToDistribute.length === 0) return

    const equalPercentage = 100 / nodesToDistribute.length
    const remainder = 100 - (Math.floor(equalPercentage * 100) / 100) * nodesToDistribute.length

    // 一度にすべての割り当てを更新（バグ修正）
    const totalBudget = parseInt(session.totalBudget)
    const newAllocations = [...allocations]

    nodesToDistribute.forEach((node, index) => {
      const percentage = index === 0
        ? equalPercentage + remainder
        : equalPercentage

      const amount = Math.floor(totalBudget * (percentage / 100))
      const relatedSkus = skuData.filter(sku => {
        const skuPath = buildHierarchyPath(sku, session.hierarchyDefinitions, node.path.split('/').length)
        return skuPath === node.path
      })
      const totalUnitPrice = relatedSkus.reduce((sum, sku) => sum + sku.unitPrice, 0)
      const quantity = totalUnitPrice > 0 ? Math.floor(amount / totalUnitPrice) : 0

      const existingIndex = newAllocations.findIndex(a => a.hierarchyPath === node.path)
      if (existingIndex >= 0) {
        newAllocations[existingIndex] = {
          ...newAllocations[existingIndex],
          percentage,
          amount: amount.toString(),
          quantity
        }
      } else {
        newAllocations.push({
          hierarchyPath: node.path,
          level: node.path.split('/').length,
          percentage,
          amount: amount.toString(),
          quantity
        })
      }
    })

    setAllocations(newAllocations)
  }

  const getNodesByLevel = (level: number): HierarchyNode[] => {
    const nodes: HierarchyNode[] = []
    const traverse = (nodeList: HierarchyNode[]) => {
      nodeList.forEach(node => {
        if (node.level === level) {
          nodes.push(node)
        }
        traverse(node.children)
      })
    }
    traverse(hierarchyTree)
    return nodes
  }

  const calculateLevelTotal = (nodes: HierarchyNode[]): number => {
    return nodes.reduce((sum, node) => sum + node.percentage, 0)
  }

  const getParentPath = (path: string): string | null => {
    const parts = path.split('/')
    if (parts.length <= 1) return null
    return parts.slice(0, -1).join('/')
  }

  const getChildrenByParent = (parentPath: string, level: number): HierarchyNode[] => {
    const nodes = getNodesByLevel(level)
    return nodes.filter(node => {
      const nodeParts = node.path.split('/')
      if (nodeParts.length !== level) return false
      const nodeParentPath = nodeParts.slice(0, -1).join('/')
      return nodeParentPath === parentPath
    })
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

  // デフォルトで全展開
  useEffect(() => {
    if (hierarchyTree.length > 0 && expandedGroups.size === 0) {
      expandAll()
    }
  }, [hierarchyTree])

  // 子が1つだけのグループは自動で100%設定
  useEffect(() => {
    if (!session || hierarchyTree.length === 0) return

    const newAllocations = [...allocations]
    let hasChanges = false

    // 各レベルをチェック
    for (let level = 2; level <= session.hierarchyDefinitions.length; level++) {
      const parentPaths = new Set<string>()
      const nodesAtLevel = getNodesByLevel(level)

      nodesAtLevel.forEach(node => {
        const parentPath = getParentPath(node.path)
        if (parentPath) parentPaths.add(parentPath)
      })

      parentPaths.forEach(parentPath => {
        const children = getChildrenByParent(parentPath, level)

        // 子が1つだけで、まだ割合が設定されていない場合
        if (children.length === 1) {
          const child = children[0]
          const existingAlloc = newAllocations.find(a => a.hierarchyPath === child.path)

          if (!existingAlloc || existingAlloc.percentage === 0) {
            const totalBudget = parseInt(session.totalBudget)
            const amount = Math.floor(totalBudget * 1) // 100%
            const relatedSkus = skuData.filter(sku => {
              const skuPath = buildHierarchyPath(sku, session.hierarchyDefinitions, child.path.split('/').length)
              return skuPath === child.path
            })
            const totalUnitPrice = relatedSkus.reduce((sum, sku) => sum + sku.unitPrice, 0)
            const quantity = totalUnitPrice > 0 ? Math.floor(amount / totalUnitPrice) : 0

            const existingIndex = newAllocations.findIndex(a => a.hierarchyPath === child.path)
            if (existingIndex >= 0) {
              newAllocations[existingIndex] = {
                ...newAllocations[existingIndex],
                percentage: 100,
                amount: amount.toString(),
                quantity
              }
            } else {
              newAllocations.push({
                hierarchyPath: child.path,
                level: child.path.split('/').length,
                percentage: 100,
                amount: amount.toString(),
                quantity
              })
            }
            hasChanges = true
          }
        }
      })
    }

    if (hasChanges) {
      setAllocations(newAllocations)
    }
  }, [hierarchyTree, session, skuData])

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
    <div className="min-h-screen bg-gray-100 flex">
      {/* Sidebar */}
      <div className={`bg-white shadow-lg transition-all duration-300 ${sidebarOpen ? 'w-64' : 'w-0'} overflow-hidden`}>
        <div className="p-4 border-b">
          <h2 className="text-lg font-bold text-gray-900">{category?.name || 'カテゴリ'}</h2>
        </div>
        <div className="p-4">
          <h3 className="text-sm font-semibold text-gray-700 mb-2">セッション一覧</h3>
          <div className="space-y-2">
            {sessions.map((s) => (
              <button
                key={s.id}
                onClick={() => router.push(`/dashboard/${params.categoryId}/${s.id}`)}
                className={`w-full text-left px-3 py-2 rounded text-sm transition-colors ${
                  s.id === params.sessionId
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-100 text-gray-900 hover:bg-gray-200'
                }`}
              >
                <div className="font-medium truncate">{s.name}</div>
                <div className="text-xs opacity-80">
                  ¥{parseInt(s.totalBudget).toLocaleString()}
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 flex flex-col">
        <header className="bg-white shadow">
          <div className="max-w-7xl mx-auto px-4 py-6 sm:px-6 lg:px-8">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <button
                  onClick={() => setSidebarOpen(!sidebarOpen)}
                  className="btn btn-secondary"
                >
                  <Menu size={20} />
                </button>
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
          <div className="space-y-4">
            {/* Level switching buttons */}
            {session && session.hierarchyDefinitions.length > 0 && (
              <div className="card">
                <h3 className="text-lg font-semibold text-gray-900 mb-3">階層レベル選択</h3>
                <div className="flex flex-wrap gap-2">
                  {session.hierarchyDefinitions.map((def) => (
                    <button
                      key={def.level}
                      onClick={() => setCurrentLevel(def.level)}
                      className={`min-w-[200px] px-6 py-2 rounded-md font-medium transition-colors ${
                        currentLevel === def.level
                          ? 'bg-blue-600 text-white'
                          : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                      }`}
                    >
                      Level {def.level}: {def.columnName}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Table */}
            <div className="card overflow-x-auto">
              {renderLevelView()}
            </div>
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
    </div>
  )

  function renderLevelView() {
    if (!session) return null

    const nodesAtLevel = getNodesByLevel(currentLevel)

    if (currentLevel === 1) {
      // Level 1 view: simple list
      const total = calculateLevelTotal(nodesAtLevel)
      const isValid = Math.abs(total - 100) < 0.01

      return (
        <div>
          <div className="flex items-center justify-between mb-4 pb-3 border-b">
            <div className="flex items-center gap-3">
              <h3 className="text-lg font-semibold text-gray-900">
                {session.hierarchyDefinitions[0]?.columnName}別配分
              </h3>
              <div className={`flex items-center gap-1 ${isValid ? 'text-green-600' : 'text-red-600'}`}>
                {isValid ? <Check size={18} /> : <AlertCircle size={18} />}
                <span className="font-medium">
                  合計: {total.toFixed(2)}%
                  {!isValid && ' (100%にしてください)'}
                </span>
              </div>
            </div>
            <button
              onClick={() => equalDistribution(null, 1)}
              className="px-3 py-1 bg-blue-600 text-white rounded text-sm hover:bg-blue-700"
            >
              均等配分
            </button>
          </div>

          <table className="w-full">
            <thead>
              <tr className="border-b">
                <th className="text-left py-2 px-4 text-gray-900 font-semibold">
                  {session.hierarchyDefinitions[0]?.columnName}
                </th>
                <th className="text-right py-2 px-4 text-gray-900 font-semibold">割合 (%)</th>
                <th className="text-right py-2 px-4 text-gray-900 font-semibold">金額 (円)</th>
                <th className="text-right py-2 px-4 text-gray-900 font-semibold">数量</th>
              </tr>
            </thead>
            <tbody>
              {nodesAtLevel.map((node) => (
                <tr key={node.path} className="border-b hover:bg-gray-50">
                  <td className="py-2 px-4 text-gray-900">{node.name}</td>
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
                    {node.quantity.toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )
    } else {
      // Level 2+ view: grouped by parent
      const parentPaths = new Set<string>()
      nodesAtLevel.forEach(node => {
        const parentPath = getParentPath(node.path)
        if (parentPath) parentPaths.add(parentPath)
      })

      const groups: Array<{ parentPath: string; parentNode: HierarchyNode | null; children: HierarchyNode[] }> = []

      parentPaths.forEach(parentPath => {
        const children = getChildrenByParent(parentPath, currentLevel)

        // Find parent node info
        let parentNode: HierarchyNode | null = null
        const findParent = (nodes: HierarchyNode[]): HierarchyNode | null => {
          for (const node of nodes) {
            if (node.path === parentPath) return node
            const found = findParent(node.children)
            if (found) return found
          }
          return null
        }
        parentNode = findParent(hierarchyTree)

        if (children.length > 0) {
          groups.push({ parentPath, parentNode, children })
        }
      })

      return (
        <div>
          <div className="flex items-center justify-between mb-4 pb-3 border-b">
            <h3 className="text-lg font-semibold text-gray-900">
              {session.hierarchyDefinitions[currentLevel - 1]?.columnName}別配分
            </h3>
            <div className="flex gap-2">
              <button
                onClick={expandAll}
                className="px-3 py-1 bg-gray-200 text-gray-700 rounded text-sm hover:bg-gray-300"
              >
                全て展開
              </button>
              <button
                onClick={collapseAll}
                className="px-3 py-1 bg-gray-200 text-gray-700 rounded text-sm hover:bg-gray-300"
              >
                全て折りたたむ
              </button>
            </div>
          </div>

          {groups.map(({ parentPath, parentNode, children }) => {
            const isExpanded = expandedGroups.has(parentPath)
            const total = calculateLevelTotal(children)
            const isValid = Math.abs(total - 100) < 0.01

            // 親パスを階層ごとに分割
            const pathParts = parentPath.split('/')
            const displayName = pathParts[pathParts.length - 1] // 最後の階層のみ表示

            // ツールチップ用の階層詳細
            const tooltipContent = pathParts.map((part, index) =>
              `階層${index + 1}: ${part}`
            ).join('\n')

            return (
              <div key={parentPath} className="mb-6">
                {/* Parent row */}
                <div
                  className="flex items-center justify-between bg-gray-50 hover:bg-gray-100 p-3 rounded cursor-pointer"
                  onClick={() => toggleGroup(parentPath)}
                >
                  <div className="flex items-center gap-2">
                    {isExpanded ? <ChevronDown size={20} /> : <ChevronRight size={20} />}
                    <span
                      className="font-medium text-gray-900"
                      title={tooltipContent}
                    >
                      {displayName}
                      {parentNode && ` (${parentNode.percentage.toFixed(2)}% = ¥${parentNode.amount.toLocaleString()})`}
                    </span>
                    <div className={`flex items-center gap-1 text-sm ${isValid ? 'text-green-600' : 'text-red-600'}`}>
                      {isValid ? <Check size={16} /> : <AlertCircle size={16} />}
                      <span>{total.toFixed(2)}%</span>
                    </div>
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      equalDistribution(parentPath, currentLevel)
                    }}
                    className="px-3 py-1 bg-blue-600 text-white rounded text-sm hover:bg-blue-700"
                  >
                    均等配分
                  </button>
                </div>

                {/* Children table */}
                {isExpanded && (
                  <table className="w-full mt-2">
                    <thead>
                      <tr className="border-b bg-gray-50">
                        <th className="text-left py-2 px-4 text-gray-900 font-semibold">
                          {session.hierarchyDefinitions[currentLevel - 1]?.columnName}
                        </th>
                        <th className="text-right py-2 px-4 text-gray-900 font-semibold">割合 (%)</th>
                        <th className="text-right py-2 px-4 text-gray-900 font-semibold">金額 (円)</th>
                        <th className="text-right py-2 px-4 text-gray-900 font-semibold">数量</th>
                      </tr>
                    </thead>
                    <tbody>
                      {children.map((node) => (
                        <tr key={node.path} className="border-b hover:bg-gray-50">
                          <td className="py-2 px-4 text-gray-900 pl-8">{node.name}</td>
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
                            {node.quantity.toLocaleString()}
                          </td>
                        </tr>
                      ))}
                      {/* Subtotal row */}
                      <tr className="bg-gray-100 font-medium">
                        <td className="py-2 px-4 text-gray-900 pl-8">小計</td>
                        <td className={`text-right py-2 px-4 ${isValid ? 'text-green-600' : 'text-red-600'}`}>
                          {total.toFixed(2)}%
                        </td>
                        <td className="text-right py-2 px-4 text-gray-900">
                          ¥{children.reduce((sum, n) => sum + n.amount, 0).toLocaleString()}
                        </td>
                        <td className="text-right py-2 px-4 text-gray-900">
                          {children.reduce((sum, n) => sum + n.quantity, 0).toLocaleString()}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                )}
              </div>
            )
          })}
        </div>
      )
    }
  }
}

function renderHierarchyNodes(
  nodes: HierarchyNode[],
  updateAllocation: (path: string, percentage: number) => void,
  depth = 0
): React.ReactNode {
  return nodes.map((node) => (
    <Fragment key={node.path}>
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
    </Fragment>
  ))
}

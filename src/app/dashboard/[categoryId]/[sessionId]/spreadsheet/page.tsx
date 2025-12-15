'use client'

import { useEffect, useState, Fragment } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { useSession } from 'next-auth/react'
import { ArrowLeft, Save, ChevronDown, ChevronRight, ChevronUp } from 'lucide-react'

interface Session {
  id: string
  name: string
  totalBudget: string
  status: string
  hierarchyDefinitions: Array<{
    level: number
    columnName: string
  }>
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

export default function SpreadsheetPage() {
  const router = useRouter()
  const params = useParams()
  const { data: authSession, status } = useSession()

  const [session, setSession] = useState<Session | null>(null)
  const [skuData, setSkuData] = useState<SkuData[]>([])
  const [allocations, setAllocations] = useState<Allocation[]>([])
  const [loading, setLoading] = useState(true)
  const [hierarchyTree, setHierarchyTree] = useState<HierarchyNode[]>([])
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set())
  const [searchQuery, setSearchQuery] = useState('')
  const [focusedPath, setFocusedPath] = useState<string | null>(null)
  const [hoveredPath, setHoveredPath] = useState<string | null>(null)

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

  const buildHierarchyPath = (sku: SkuData, definitions: Session['hierarchyDefinitions'], maxLevel: number): string => {
    const parts: string[] = []
    for (let i = 0; i < maxLevel && i < definitions.length; i++) {
      const colName = definitions[i].columnName
      const value = sku.hierarchyValues[colName]
      if (value) parts.push(value)
    }
    return parts.join('/')
  }

  const buildHierarchyTree = (): HierarchyNode[] => {
    if (!session || skuData.length === 0) return []

    const tree: HierarchyNode[] = []
    const nodeMap = new Map<string, HierarchyNode>()

    for (const sku of skuData) {
      // Build hierarchy levels
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

      // Add SKU level (final level)
      const parentPath = buildHierarchyPath(sku, session.hierarchyDefinitions, session.hierarchyDefinitions.length)
      const skuPath = parentPath ? `${parentPath}/${sku.skuCode}` : sku.skuCode
      const skuLevel = session.hierarchyDefinitions.length + 1

      if (!nodeMap.has(skuPath)) {
        const allocation = allocations.find(a => a.hierarchyPath === skuPath)

        const skuNode: HierarchyNode = {
          path: skuPath,
          name: sku.skuCode,
          level: skuLevel,
          percentage: allocation?.percentage || 0,
          amount: allocation ? parseInt(allocation.amount) : 0,
          unitPrice: sku.unitPrice,
          quantity: allocation?.quantity || 0,
          children: []
        }

        nodeMap.set(skuPath, skuNode)

        const parent = nodeMap.get(parentPath)
        if (parent) {
          parent.children.push(skuNode)
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

  const toggleGroup = (path: string) => {
    const newExpanded = new Set(expandedGroups)
    if (newExpanded.has(path)) {
      newExpanded.delete(path)
    } else {
      newExpanded.add(path)
    }
    setExpandedGroups(newExpanded)
  }

  const expandLevel = (level: number) => {
    const newExpanded = new Set(expandedGroups)
    const addNodesAtLevel = (nodes: HierarchyNode[]) => {
      nodes.forEach(node => {
        if (node.level === level) {
          newExpanded.add(node.path)
        }
        if (node.children.length > 0) {
          addNodesAtLevel(node.children)
        }
      })
    }
    addNodesAtLevel(hierarchyTree)
    setExpandedGroups(newExpanded)
  }

  const collapseLevel = (level: number) => {
    const newExpanded = new Set(expandedGroups)
    const removeNodesAtLevel = (nodes: HierarchyNode[]) => {
      nodes.forEach(node => {
        if (node.level === level) {
          newExpanded.delete(node.path)
        }
        if (node.children.length > 0) {
          removeNodesAtLevel(node.children)
        }
      })
    }
    removeNodesAtLevel(hierarchyTree)
    setExpandedGroups(newExpanded)
  }

  const expandAll = () => {
    const newExpanded = new Set<string>()
    const addAllNodes = (nodes: HierarchyNode[]) => {
      nodes.forEach(node => {
        if (node.children.length > 0) {
          newExpanded.add(node.path)
          addAllNodes(node.children)
        }
      })
    }
    addAllNodes(hierarchyTree)
    setExpandedGroups(newExpanded)
  }

  const collapseAll = () => {
    setExpandedGroups(new Set())
  }

  const getParentAmount = (path: string, allocs = allocations): number => {
    if (!session) return 0

    const pathParts = path.split('/')
    if (pathParts.length === 1) {
      return parseInt(session.totalBudget)
    }

    const parentPath = pathParts.slice(0, -1).join('/')
    const parentAlloc = allocs.find(a => a.hierarchyPath === parentPath)

    if (parentAlloc) {
      return parseInt(parentAlloc.amount)
    }

    return parseInt(session.totalBudget)
  }

  const updateAllocation = (path: string, percentage: number) => {
    if (!session) return

    const parentAmount = getParentAmount(path)
    const amount = Math.floor(parentAmount * (percentage / 100))

    const pathLevel = path.split('/').length
    let relatedSkus: SkuData[] = []

    if (pathLevel === session.hierarchyDefinitions.length + 1) {
      const skuCode = path.split('/').pop()
      relatedSkus = skuData.filter(sku => sku.skuCode === skuCode)
    } else {
      relatedSkus = skuData.filter(sku => {
        const skuPath = buildHierarchyPath(sku, session.hierarchyDefinitions, pathLevel)
        return skuPath === path
      })
    }

    const totalUnitPrice = relatedSkus.reduce((sum, sku) => sum + sku.unitPrice, 0)
    const quantity = totalUnitPrice > 0 ? Math.floor(amount / totalUnitPrice) : 0

    const existingIndex = allocations.findIndex(a => a.hierarchyPath === path)
    let updated: Allocation[]

    if (existingIndex >= 0) {
      updated = [...allocations]
      updated[existingIndex] = {
        ...updated[existingIndex],
        percentage,
        amount: amount.toString(),
        quantity
      }
    } else {
      updated = [...allocations, {
        hierarchyPath: path,
        level: pathLevel,
        percentage,
        amount: amount.toString(),
        quantity
      }]
    }

    setAllocations(updated)
    setHierarchyTree(buildHierarchyTree())
  }

  const saveAllocations = async () => {
    try {
      const response = await fetch(`/api/sessions/${params.sessionId}/allocations`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ allocations })
      })

      if (response.ok) {
        alert('保存しました')
      } else {
        alert('保存に失敗しました')
      }
    } catch (error) {
      console.error('Error saving allocations:', error)
      alert('保存に失敗しました')
    }
  }

  const filterNodes = (nodes: HierarchyNode[], query: string): HierarchyNode[] => {
    if (!query) return nodes

    return nodes.filter(node => {
      const matchesQuery = node.name.toLowerCase().includes(query.toLowerCase())
      const hasMatchingChildren = node.children.length > 0 && filterNodes(node.children, query).length > 0
      return matchesQuery || hasMatchingChildren
    }).map(node => ({
      ...node,
      children: filterNodes(node.children, query)
    }))
  }

  // Color palette by hierarchy level
  const levelColorPalette = [
    { bg: 'bg-blue-50', hover: 'hover:bg-blue-100' },      // Level 1
    { bg: 'bg-green-50', hover: 'hover:bg-green-100' },    // Level 2
    { bg: 'bg-yellow-50', hover: 'hover:bg-yellow-100' },  // Level 3
    { bg: 'bg-purple-50', hover: 'hover:bg-purple-100' },  // Level 4
    { bg: 'bg-pink-50', hover: 'hover:bg-pink-100' },      // Level 5
    { bg: 'bg-indigo-50', hover: 'hover:bg-indigo-100' },  // Level 6
    { bg: 'bg-orange-50', hover: 'hover:bg-orange-100' },  // Level 7
    { bg: 'bg-teal-50', hover: 'hover:bg-teal-100' }       // Level 8+
  ]

  const getSiblingsTotal = (node: HierarchyNode): number => {
    const pathParts = node.path.split('/')
    if (pathParts.length === 1) {
      // Level 1: sum all level 1 nodes
      return hierarchyTree.reduce((sum, n) => sum + n.percentage, 0)
    }

    // Find siblings by looking for nodes with same parent
    const parentPath = pathParts.slice(0, -1).join('/')
    const findSiblings = (nodes: HierarchyNode[]): HierarchyNode[] => {
      for (const n of nodes) {
        if (n.path === parentPath) {
          return n.children
        }
        if (n.children.length > 0) {
          const found = findSiblings(n.children)
          if (found.length > 0) return found
        }
      }
      return []
    }

    const siblings = findSiblings(hierarchyTree)
    return siblings.reduce((sum, n) => sum + n.percentage, 0)
  }

  // Helper function to get parent path
  const getParentPath = (path: string): string | null => {
    const pathParts = path.split('/')
    if (pathParts.length === 1) return null // Top level, no parent
    return pathParts.slice(0, -1).join('/')
  }

  // Helper function to check if two nodes are siblings
  const areSiblings = (path1: string, path2: string): boolean => {
    const parent1 = getParentPath(path1)
    const parent2 = getParentPath(path2)

    // Both at top level (parent is null)
    if (parent1 === null && parent2 === null) return true

    // Same parent path
    return parent1 === parent2
  }

  const renderHierarchyNodes = (nodes: HierarchyNode[], depth = 0): JSX.Element[] => {
    return nodes.flatMap((node, index) => {
      const colors = levelColorPalette[(node.level - 1) % levelColorPalette.length]
      const siblingsTotal = getSiblingsTotal(node)
      const remaining = 100 - siblingsTotal
      const isOverLimit = siblingsTotal > 100

      // Check if this node should be highlighted (is sibling of focused or hovered node)
      const isFocusedSibling = focusedPath && areSiblings(node.path, focusedPath)
      const isHoveredSibling = hoveredPath && areSiblings(node.path, hoveredPath)

      // Determine row background color with priority: focus > hover > default
      let rowBgClass = colors.bg
      let rowHoverClass = colors.hover

      if (isFocusedSibling) {
        // Darker highlight for focused siblings
        rowBgClass = 'bg-blue-200 ring-2 ring-blue-400'
        rowHoverClass = 'hover:bg-blue-300'
      } else if (isHoveredSibling) {
        // Lighter highlight for hovered siblings
        rowBgClass = 'bg-blue-100'
        rowHoverClass = 'hover:bg-blue-200'
      }

      return (
        <Fragment key={node.path}>
          <tr className={`border-b border-gray-200 ${rowBgClass} ${rowHoverClass} transition-colors duration-150`}>
            <td className={`py-2 px-4 sticky left-0 ${rowBgClass} z-10`} style={{ paddingLeft: `${depth * 24 + 16}px` }}>
              <div className="flex items-center gap-2">
                {node.children.length > 0 && (
                  <button
                    onClick={() => toggleGroup(node.path)}
                    className="text-gray-600 hover:text-gray-900"
                  >
                    {expandedGroups.has(node.path) ? (
                      <ChevronDown size={16} />
                    ) : (
                      <ChevronRight size={16} />
                    )}
                  </button>
                )}
                {node.children.length === 0 && <span className="w-4" />}
                <span className="text-gray-900 font-medium">{node.name}</span>
              </div>
            </td>
            <td className="text-center py-2 px-4 text-gray-600">
              Level {node.level}
            </td>
            <td className="text-right py-2 px-4 text-gray-900">
              {node.unitPrice !== undefined ? `¥${node.unitPrice.toLocaleString()}` : ''}
            </td>
            <td className="text-right py-2 px-4">
              <div className="flex flex-col items-end gap-1">
                {session?.category?.userId === authSession?.user?.id ? (
                  <input
                    type="number"
                    value={node.percentage || ''}
                    onChange={(e) => updateAllocation(node.path, parseFloat(e.target.value) || 0)}
                    onFocus={() => setFocusedPath(node.path)}
                    onBlur={() => setFocusedPath(null)}
                    onMouseEnter={() => setHoveredPath(node.path)}
                    onMouseLeave={() => setHoveredPath(null)}
                    className={`w-20 px-2 py-1 border rounded text-right text-gray-900 ${
                      isOverLimit ? 'border-red-500 bg-red-50' : 'border-gray-300'
                    }`}
                    min="0"
                    max="100"
                    step="0.01"
                  />
                ) : (
                  <span className="text-gray-900">{node.percentage.toFixed(2)}</span>
                )}
                <div className={`${(isFocusedSibling || isHoveredSibling) ? 'text-sm font-bold' : 'text-xs'}`}>
                  {isOverLimit ? (
                    <span className="text-red-600 font-medium">超過: {Math.abs(remaining).toFixed(1)}%</span>
                  ) : (
                    <span className={`${isFocusedSibling ? 'text-blue-800' : isHoveredSibling ? 'text-blue-700' : 'text-gray-500'}`}>
                      残り: {remaining.toFixed(1)}%
                    </span>
                  )}
                </div>
              </div>
            </td>
            <td className="text-right py-2 px-4 text-gray-900">
              ¥{node.amount.toLocaleString()}
            </td>
            <td className="text-right py-2 px-4 text-gray-900">
              {node.quantity}
            </td>
          </tr>
          {node.children.length > 0 && expandedGroups.has(node.path) && renderHierarchyNodes(node.children, depth + 1)}
        </Fragment>
      )
    })
  }

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

  const filteredTree = searchQuery ? filterNodes(hierarchyTree, searchQuery) : hierarchyTree

  return (
    <div className="min-h-screen bg-gray-100">
      <header className="bg-white shadow">
        <div className="max-w-full mx-auto px-4 py-6 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <button
                onClick={() => router.push(`/dashboard/${params.categoryId}/${params.sessionId}`)}
                className="btn btn-secondary"
              >
                <ArrowLeft size={20} />
              </button>
              <div>
                <h1 className="text-3xl font-bold text-gray-900">
                  {session.name} - 全階層ビュー
                </h1>
                <p className="text-gray-700">
                  総予算: ¥{parseInt(session.totalBudget).toLocaleString()}
                </p>
              </div>
            </div>
            <div className="flex gap-2">
              {session.category?.userId === authSession?.user?.id && (
                <button onClick={saveAllocations} className="btn btn-primary flex items-center gap-2">
                  <Save size={20} />
                  保存
                </button>
              )}
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-full mx-auto px-4 py-6 sm:px-6 lg:px-8">
        <div className="space-y-4">
          {/* Controls */}
          <div className="card">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900">表示コントロール</h3>
              <div className="flex items-center gap-4">
                <input
                  type="text"
                  placeholder="検索..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="px-3 py-1 border border-gray-300 rounded-md text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <button
                  onClick={expandAll}
                  className="px-3 py-1 bg-blue-600 text-white rounded text-sm hover:bg-blue-700"
                >
                  全て展開
                </button>
                <button
                  onClick={collapseAll}
                  className="px-3 py-1 bg-gray-600 text-white rounded text-sm hover:bg-gray-700"
                >
                  全て折りたたみ
                </button>
              </div>
            </div>

            {/* Level-wise expand/collapse buttons */}
            <div className="flex flex-wrap gap-2">
              {session.hierarchyDefinitions.map(def => (
                <div key={def.level} className="flex items-center gap-1 bg-gray-100 rounded px-2 py-1">
                  <span className="text-sm text-gray-700">Level {def.level}: {def.columnName}</span>
                  <button
                    onClick={() => expandLevel(def.level)}
                    className="p-1 hover:bg-gray-200 rounded"
                    title="展開"
                  >
                    <ChevronDown size={14} />
                  </button>
                  <button
                    onClick={() => collapseLevel(def.level)}
                    className="p-1 hover:bg-gray-200 rounded"
                    title="折りたたみ"
                  >
                    <ChevronUp size={14} />
                  </button>
                </div>
              ))}
              {/* SKU Level */}
              <div className="flex items-center gap-1 bg-gray-100 rounded px-2 py-1">
                <span className="text-sm text-gray-700">Level {session.hierarchyDefinitions.length + 1}: sku_code</span>
                <button
                  onClick={() => expandLevel(session.hierarchyDefinitions.length + 1)}
                  className="p-1 hover:bg-gray-200 rounded"
                  title="展開"
                >
                  <ChevronDown size={14} />
                </button>
                <button
                  onClick={() => collapseLevel(session.hierarchyDefinitions.length + 1)}
                  className="p-1 hover:bg-gray-200 rounded"
                  title="折りたたみ"
                >
                  <ChevronUp size={14} />
                </button>
              </div>
            </div>
          </div>

          {/* Table */}
          <div className="card overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 sticky top-0 z-20">
                <tr>
                  <th className="text-left py-3 px-4 font-semibold text-gray-900 sticky left-0 bg-gray-50 z-30">
                    階層名
                  </th>
                  <th className="text-center py-3 px-4 font-semibold text-gray-900">
                    レベル
                  </th>
                  <th className="text-right py-3 px-4 font-semibold text-gray-900">
                    単価
                  </th>
                  <th className="text-right py-3 px-4 font-semibold text-gray-900">
                    割合(%)
                  </th>
                  <th className="text-right py-3 px-4 font-semibold text-gray-900">
                    金額
                  </th>
                  <th className="text-right py-3 px-4 font-semibold text-gray-900">
                    数量
                  </th>
                </tr>
              </thead>
              <tbody>
                {filteredTree.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="text-center py-8 text-gray-500">
                      {searchQuery ? '検索結果がありません' : 'データがありません'}
                    </td>
                  </tr>
                ) : (
                  renderHierarchyNodes(filteredTree)
                )}
              </tbody>
            </table>
          </div>
        </div>
      </main>
    </div>
  )
}

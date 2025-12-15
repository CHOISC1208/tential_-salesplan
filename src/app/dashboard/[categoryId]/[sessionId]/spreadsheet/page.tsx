'use client'

import { useEffect, useState, Fragment } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { useSession } from 'next-auth/react'
import { ArrowLeft, Save, ChevronDown, ChevronRight, ChevronUp, Download, Calendar, Plus, Edit2, Trash2 } from 'lucide-react'

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
  period?: string | null
}

interface PeriodData {
  percentage: number
  amount: number
  quantity: number
}

interface HierarchyNode {
  path: string
  name: string
  level: number
  unitPrice?: number
  periodData: Map<string | null, PeriodData> // period -> data
  children: HierarchyNode[]
}

export default function SpreadsheetPage() {
  const router = useRouter()
  const params = useParams()
  const { data: authSession, status } = useSession()

  const [session, setSession] = useState<Session | null>(null)
  const [category, setCategory] = useState<{ id: string; name: string } | null>(null)
  const [skuData, setSkuData] = useState<SkuData[]>([])
  const [allocations, setAllocations] = useState<Allocation[]>([])
  const [loading, setLoading] = useState(true)
  const [hierarchyTree, setHierarchyTree] = useState<HierarchyNode[]>([])
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set())
  const [searchQuery, setSearchQuery] = useState('')
  const [focusedPath, setFocusedPath] = useState<string | null>(null)
  const [showBudgetEditModal, setShowBudgetEditModal] = useState(false)
  const [newBudget, setNewBudget] = useState('')
  const [showDeleteSessionModal, setShowDeleteSessionModal] = useState(false)
  const [showDeleteCategoryModal, setShowDeleteCategoryModal] = useState(false)
  const [deleteConfirmText, setDeleteConfirmText] = useState('')

  // Period management states
  const [availablePeriods, setAvailablePeriods] = useState<Array<string | null>>([])
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
      const [sessionRes, skuRes, allocRes, periodsRes, categoryRes] = await Promise.all([
        fetch(`/api/sessions/${params.sessionId}`),
        fetch(`/api/sessions/${params.sessionId}/sku-data`),
        fetch(`/api/sessions/${params.sessionId}/allocations`),
        fetch(`/api/sessions/${params.sessionId}/periods`),
        fetch(`/api/categories/${params.categoryId}`)
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
        // Load ALL allocations (no filtering by period)
        setAllocations(allocationsData)
      }

      if (periodsRes.ok) {
        const { periods } = await periodsRes.json()
        setAvailablePeriods(periods)
      }

      if (categoryRes.ok) {
        const categoryData = await categoryRes.json()
        setCategory(categoryData)
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

          // Build period data map for this node
          const periodData = new Map<string | null, PeriodData>()
          const nodeAllocations = allocations.filter(a => a.hierarchyPath === path)

          for (const alloc of nodeAllocations) {
            periodData.set(alloc.period || null, {
              percentage: alloc.percentage,
              amount: parseInt(alloc.amount),
              quantity: alloc.quantity
            })
          }

          const node: HierarchyNode = {
            path,
            name,
            level,
            periodData,
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
        // Build period data map for SKU
        const periodData = new Map<string | null, PeriodData>()
        const skuAllocations = allocations.filter(a => a.hierarchyPath === skuPath)

        for (const alloc of skuAllocations) {
          periodData.set(alloc.period || null, {
            percentage: alloc.percentage,
            amount: parseInt(alloc.amount),
            quantity: alloc.quantity
          })
        }

        const skuNode: HierarchyNode = {
          path: skuPath,
          name: sku.skuCode,
          level: skuLevel,
          unitPrice: sku.unitPrice,
          periodData,
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

  const updateAllocation = (path: string, period: string | null, percentage: number) => {
    if (!session) return

    const parentAmount = getParentAmount(path, allocations)
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

    const existingIndex = allocations.findIndex(a => a.hierarchyPath === path && a.period === period)
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
        quantity,
        period
      }]
    }

    setAllocations(updated)
  }

  const saveAllocations = async () => {
    try {
      // Save all allocations (all periods at once)
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

  const updateBudget = async () => {
    if (!newBudget || parseInt(newBudget) <= 0) {
      alert('有効な予算額を入力してください')
      return
    }

    try {
      const response = await fetch(`/api/sessions/${params.sessionId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ totalBudget: parseInt(newBudget) })
      })

      if (response.ok) {
        setShowBudgetEditModal(false)
        setNewBudget('')
        loadData()
        alert('予算額を更新しました')
      } else {
        alert('予算額の更新に失敗しました')
      }
    } catch (error) {
      console.error('Error updating budget:', error)
      alert('予算額の更新に失敗しました')
    }
  }

  const deleteSession = async () => {
    if (deleteConfirmText !== '削除') {
      alert('「削除」と入力してください')
      return
    }

    try {
      const response = await fetch(`/api/sessions/${params.sessionId}`, {
        method: 'DELETE'
      })

      if (response.ok) {
        alert('セッションを削除しました')
        router.push(`/dashboard`)
      } else {
        alert('セッションの削除に失敗しました')
      }
    } catch (error) {
      console.error('Error deleting session:', error)
      alert('セッションの削除に失敗しました')
    }
  }

  const deleteCategory = async () => {
    if (deleteConfirmText !== '削除') {
      alert('「削除」と入力してください')
      return
    }

    try {
      const response = await fetch(`/api/categories/${params.categoryId}`, {
        method: 'DELETE'
      })

      if (response.ok) {
        alert('カテゴリを削除しました')
        router.push('/dashboard')
      } else {
        alert('カテゴリの削除に失敗しました')
      }
    } catch (error) {
      console.error('Error deleting category:', error)
      alert('カテゴリの削除に失敗しました')
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

  const exportToCSV = async () => {
    if (!session || skuData.length === 0) {
      alert('エクスポートするデータがありません')
      return
    }

    try {
      // Fetch all allocations for all periods
      const allocRes = await fetch(`/api/sessions/${params.sessionId}/allocations`)
      if (!allocRes.ok) {
        alert('配分データの取得に失敗しました')
        return
      }
      const allAllocations = await allocRes.json()

      // 階層カラム名を取得
      const hierarchyColumns = session.hierarchyDefinitions.map(def => def.columnName)

      // Sort periods: null (default) first, then alphabetically
      const sortedPeriods = [...availablePeriods].sort((a, b) => {
        if (a === null) return -1
        if (b === null) return 1
        return a.localeCompare(b)
      })

      // CSVヘッダーを作成（期間ごとに列を追加）
      const periodHeaders = sortedPeriods.map(p =>
        p === null ? 'デフォルト(%)' : `${p}(%)`
      )
      const headers = [...hierarchyColumns, 'sku_code', ...periodHeaders, 'unitprice', '合計金額', '合計数量']

      // CSVデータを作成
      const rows: string[][] = []

      skuData.forEach(sku => {
        // 各階層の値を取得
        const hierarchyValues: string[] = []
        hierarchyColumns.forEach(colName => {
          hierarchyValues.push(sku.hierarchyValues[colName] || '')
        })

        // SKUレベルのパスを構築
        const parentPath = buildHierarchyPath(sku, session.hierarchyDefinitions, session.hierarchyDefinitions.length)
        const skuPath = parentPath ? `${parentPath}/${sku.skuCode}` : sku.skuCode

        // 各期間ごとの累積割合を計算
        const periodPercentages: string[] = []
        let totalAmount = 0
        let totalQuantity = 0

        sortedPeriods.forEach(period => {
          // この期間の配分データをフィルタ
          const periodAllocations = allAllocations.filter((a: Allocation & { period?: string | null }) =>
            a.period === period
          )

          // SKUまでのパスの各階層の割合を取得
          const pathParts = skuPath.split('/')
          let cumulativePercentage = 1.0 // 100%から開始
          let hasAllocation = false

          // 各階層レベルの割合を掛け算
          for (let level = 1; level <= pathParts.length; level++) {
            const levelPath = pathParts.slice(0, level).join('/')
            const levelAllocation = periodAllocations.find(a => a.hierarchyPath === levelPath)

            if (levelAllocation && levelAllocation.percentage > 0) {
              cumulativePercentage *= (levelAllocation.percentage / 100)
              hasAllocation = true
            } else if (level === pathParts.length && !hasAllocation) {
              // SKUレベルで配分がない場合
              cumulativePercentage = 0
              break
            }
          }

          if (cumulativePercentage > 0 && hasAllocation) {
            const finalPercentage = cumulativePercentage * 100
            periodPercentages.push(finalPercentage.toFixed(4))

            // 合計金額と数量を計算
            const totalBudget = parseInt(session.totalBudget)
            const calculatedAmount = Math.floor(totalBudget * cumulativePercentage)
            totalAmount += calculatedAmount
            totalQuantity += sku.unitPrice > 0 ? Math.floor(calculatedAmount / sku.unitPrice) : 0
          } else {
            periodPercentages.push('')
          }
        })

        // 行データを作成
        const row = [
          ...hierarchyValues,
          sku.skuCode,
          ...periodPercentages,
          sku.unitPrice.toString(),
          totalAmount > 0 ? totalAmount.toString() : '',
          totalQuantity > 0 ? totalQuantity.toString() : ''
        ]

        rows.push(row)
      })

      // CSVテキストを生成
      const csvContent = [
        headers.join(','),
        ...rows.map(row => row.map(cell => {
          // カンマやダブルクォートを含む場合はエスケープ
          if (cell.includes(',') || cell.includes('"') || cell.includes('\n')) {
            return `"${cell.replace(/"/g, '""')}"`
          }
          return cell
        }).join(','))
      ].join('\n')

      // BOMを追加してExcelで正しく開けるようにする
      const bom = '\uFEFF'
      const blob = new Blob([bom + csvContent], { type: 'text/csv;charset=utf-8;' })

      // ダウンロードリンクを作成
      const link = document.createElement('a')
      const url = URL.createObjectURL(blob)
      link.setAttribute('href', url)
      link.setAttribute('download', `allocation_${session.name}_${new Date().toISOString().slice(0, 10)}.csv`)
      link.style.visibility = 'hidden'
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
    } catch (error) {
      console.error('Error exporting CSV:', error)
      alert('CSV出力に失敗しました')
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

  const getSiblingsTotal = (node: HierarchyNode, period: string | null): number => {
    const pathParts = node.path.split('/')
    if (pathParts.length === 1) {
      // Level 1: sum all level 1 nodes
      return hierarchyTree.reduce((sum, n) => {
        const periodData = n.periodData.get(period)
        return sum + (periodData?.percentage || 0)
      }, 0)
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
    return siblings.reduce((sum, n) => {
      const periodData = n.periodData.get(period)
      return sum + (periodData?.percentage || 0)
    }, 0)
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

      // Handle row click to toggle group
      const handleRowClick = (e: React.MouseEvent) => {
        // Don't toggle if clicking on input, button, or interactive elements
        const target = e.target as HTMLElement
        if (target.tagName === 'INPUT' || target.tagName === 'BUTTON' || target.closest('button')) {
          return
        }
        if (node.children.length > 0) {
          toggleGroup(node.path)
        }
      }

      return (
        <Fragment key={node.path}>
          <tr
            className={`border-b border-gray-200 ${colors.bg} ${colors.hover} transition-colors duration-150 ${node.children.length > 0 ? 'cursor-pointer' : ''}`}
            onClick={handleRowClick}
          >
            {/* 階層名 */}
            <td className={`py-2 px-4 sticky left-0 ${colors.bg} z-10`} style={{ paddingLeft: `${depth * 24 + 16}px` }}>
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

            {/* レベル */}
            <td className="text-center py-2 px-4 text-gray-600">
              Level {node.level}
            </td>

            {/* 単価 */}
            <td className="text-right py-2 px-4 text-gray-900">
              {node.unitPrice !== undefined ? `¥${node.unitPrice.toLocaleString()}` : ''}
            </td>

            {/* 各期間の割合（グループ化） */}
            {availablePeriods.map(period => {
              const periodData = node.periodData.get(period)
              const percentage = periodData?.percentage || 0

              const siblingsTotal = getSiblingsTotal(node, period)
              const remaining = 100 - siblingsTotal
              const isOverLimit = siblingsTotal > 100

              return (
                <td key={`${period === null ? 'null' : period}-pct`} className="text-right py-2 px-4">
                  <div className="flex flex-col items-end gap-1">
                    {session?.category?.userId === authSession?.user?.id ? (
                      <input
                        type="number"
                        value={percentage || ''}
                        onChange={(e) => updateAllocation(node.path, period, parseFloat(e.target.value) || 0)}
                        className={`w-20 px-2 py-1 border rounded text-right text-gray-900 ${
                          isOverLimit ? 'border-red-500 bg-red-50' : 'border-gray-300'
                        }`}
                        min="0"
                        max="100"
                        step="0.01"
                      />
                    ) : (
                      <span className="text-gray-900">{percentage.toFixed(2)}</span>
                    )}
                    <div className="text-xs">
                      {isOverLimit ? (
                        <span className="text-red-600 font-medium">超過: {Math.abs(remaining).toFixed(1)}%</span>
                      ) : (
                        <span className="text-gray-500">残り: {remaining.toFixed(1)}%</span>
                      )}
                    </div>
                  </div>
                </td>
              )
            })}

            {/* 各期間の金額（グループ化） */}
            {availablePeriods.map(period => {
              const periodData = node.periodData.get(period)
              const amount = periodData?.amount || 0

              return (
                <td key={`${period === null ? 'null' : period}-amt`} className="text-right py-2 px-4 text-gray-900">
                  {amount > 0 ? `¥${amount.toLocaleString()}` : ''}
                </td>
              )
            })}
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
              <button onClick={() => router.push('/dashboard')} className="btn btn-secondary">
                <ArrowLeft size={20} />
              </button>
              <div>
                <div className="text-sm text-gray-600 mb-1 flex items-center gap-2">
                  <span>{category?.name}</span>
                  {session.category?.userId === authSession?.user?.id && (
                    <button
                      onClick={() => {
                        setDeleteConfirmText('')
                        setShowDeleteCategoryModal(true)
                      }}
                      className="text-xs text-red-600 hover:text-red-800"
                    >
                      [削除]
                    </button>
                  )}
                  <span> &gt; {session.name}</span>
                  {session.category?.userId === authSession?.user?.id && (
                    <button
                      onClick={() => {
                        setDeleteConfirmText('')
                        setShowDeleteSessionModal(true)
                      }}
                      className="text-xs text-red-600 hover:text-red-800"
                    >
                      [削除]
                    </button>
                  )}
                </div>
                <h1 className="text-3xl font-bold text-gray-900">{session.name}</h1>

                {/* View Switcher */}
                <div className="flex items-center gap-2 my-3">
                  <button
                    onClick={() => router.push(`/dashboard/${params.categoryId}/${params.sessionId}`)}
                    className="px-4 py-2 rounded-lg font-medium bg-gray-200 text-gray-700 hover:bg-gray-300"
                  >
                    ステップビュー
                  </button>
                  <button
                    onClick={() => router.push(`/dashboard/${params.categoryId}/${params.sessionId}/spreadsheet`)}
                    className="px-4 py-2 rounded-lg font-medium bg-blue-600 text-white"
                  >
                    ツリービュー
                  </button>
                </div>

                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-2">
                    <p className="text-gray-700">
                      総予算: ¥{parseInt(session.totalBudget).toLocaleString()}
                    </p>
                    {session.category?.userId === authSession?.user?.id && (
                      <button
                        onClick={() => {
                          setNewBudget(session.totalBudget)
                          setShowBudgetEditModal(true)
                        }}
                        className="text-sm text-blue-600 hover:text-blue-800"
                      >
                        [編集]
                      </button>
                    )}
                  </div>

                  {/* Period Management */}
                  {session.category?.userId === authSession?.user?.id && (
                    <div className="flex items-center gap-2 border-l pl-4">
                      <Calendar size={16} className="text-gray-600" />
                      <span className="text-sm text-gray-600">期間管理:</span>
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
                    </div>
                  )}

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
                </div>
              </div>
            </div>
            <div className="flex gap-2">
              {skuData.length > 0 && (
                <button onClick={exportToCSV} className="btn bg-gray-600 text-white hover:bg-gray-700 flex items-center gap-2">
                  <Download size={20} />
                  CSV出力
                </button>
              )}
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
                  {/* Period percentage columns */}
                  {availablePeriods.map(period => (
                    <th key={`${period === null ? 'null' : period}-pct`} className="text-right py-3 px-4 font-semibold text-gray-900">
                      {period === null ? 'デフォルト' : period}(%)
                    </th>
                  ))}
                  {/* Period amount columns */}
                  {availablePeriods.map(period => (
                    <th key={`${period === null ? 'null' : period}-amt`} className="text-right py-3 px-4 font-semibold text-gray-900">
                      {period === null ? 'デフォルト' : period}(円)
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredTree.length === 0 ? (
                  <tr>
                    <td colSpan={3 + availablePeriods.length * 2} className="text-center py-8 text-gray-500">
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

      {/* Budget Edit Modal */}
      {showBudgetEditModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white p-6 rounded-lg w-full max-w-md">
            <h2 className="text-xl font-bold mb-4 text-gray-900">予算額の編集</h2>
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-900 mb-2">新しい予算額</label>
              <input
                type="number"
                value={newBudget}
                onChange={(e) => setNewBudget(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="100000000"
              />
            </div>
            <div className="flex gap-2">
              <button
                onClick={updateBudget}
                className="btn btn-primary flex-1"
              >
                更新
              </button>
              <button
                onClick={() => {
                  setShowBudgetEditModal(false)
                  setNewBudget('')
                }}
                className="btn btn-secondary flex-1"
              >
                キャンセル
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Session Modal */}
      {showDeleteSessionModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white p-6 rounded-lg w-full max-w-md">
            <h2 className="text-xl font-bold mb-4 text-red-600">セッションの削除</h2>
            <p className="text-gray-900 mb-4">
              本当にこのセッションを削除しますか？この操作は元に戻せません。
            </p>
            <p className="text-gray-900 mb-2 font-semibold">
              削除するには「削除」と入力してください：
            </p>
            <input
              type="text"
              value={deleteConfirmText}
              onChange={(e) => setDeleteConfirmText(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-gray-900 focus:outline-none focus:ring-2 focus:ring-red-500 mb-4"
              placeholder="削除"
            />
            <div className="flex gap-2">
              <button
                onClick={deleteSession}
                className="btn bg-red-600 text-white hover:bg-red-700 flex-1"
                disabled={deleteConfirmText !== '削除'}
              >
                削除
              </button>
              <button
                onClick={() => {
                  setShowDeleteSessionModal(false)
                  setDeleteConfirmText('')
                }}
                className="btn btn-secondary flex-1"
              >
                キャンセル
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Category Modal */}
      {showDeleteCategoryModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white p-6 rounded-lg w-full max-w-md">
            <h2 className="text-xl font-bold mb-4 text-red-600">カテゴリの削除</h2>
            <p className="text-gray-900 mb-4">
              本当にこのカテゴリを削除しますか？このカテゴリに含まれる全てのセッションとデータも削除されます。
              この操作は元に戻せません。
            </p>
            <p className="text-gray-900 mb-2 font-semibold">
              削除するには「削除」と入力してください：
            </p>
            <input
              type="text"
              value={deleteConfirmText}
              onChange={(e) => setDeleteConfirmText(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-gray-900 focus:outline-none focus:ring-2 focus:ring-red-500 mb-4"
              placeholder="削除"
            />
            <div className="flex gap-2">
              <button
                onClick={deleteCategory}
                className="btn bg-red-600 text-white hover:bg-red-700 flex-1"
                disabled={deleteConfirmText !== '削除'}
              >
                削除
              </button>
              <button
                onClick={() => {
                  setShowDeleteCategoryModal(false)
                  setDeleteConfirmText('')
                }}
                className="btn btn-secondary flex-1"
              >
                キャンセル
              </button>
            </div>
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
                    value={periodModalValue}
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

'use client'

import { useEffect, useState, Fragment } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { useSession } from 'next-auth/react'
import { ArrowLeft, Upload, Save, ChevronDown, ChevronRight, AlertCircle, Check, Download } from 'lucide-react'
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
  const [category, setCategory] = useState<{ id: string; name: string } | null>(null)
  const [hoveredPath, setHoveredPath] = useState<string | null>(null)
  const [showIncompleteOnly, setShowIncompleteOnly] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [showBudgetEditModal, setShowBudgetEditModal] = useState(false)
  const [newBudget, setNewBudget] = useState('')
  const [showDeleteSessionModal, setShowDeleteSessionModal] = useState(false)
  const [showDeleteCategoryModal, setShowDeleteCategoryModal] = useState(false)
  const [deleteConfirmText, setDeleteConfirmText] = useState('')

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/login')
    } else if (status === 'authenticated') {
      loadData()
    }
  }, [status, router])

  const loadData = async () => {
    try {
      const [sessionRes, skuRes, allocRes, categoryRes] = await Promise.all([
        fetch(`/api/sessions/${params.sessionId}`),
        fetch(`/api/sessions/${params.sessionId}/sku-data`),
        fetch(`/api/sessions/${params.sessionId}/allocations`),
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
        setAllocations(allocationsData)
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

  // 親の配分額を取得する関数
  const getParentAmount = (path: string, currentAllocations?: Allocation[]): number => {
    if (!session) return 0

    const pathParts = path.split('/')
    // 階層1（トップレベル）の場合は総予算を返す
    if (pathParts.length === 1) {
      return parseInt(session.totalBudget)
    }

    // 使用するallocations配列（引数で渡されたものか、現在の状態）
    const allocsToUse = currentAllocations || allocations

    // 親のパスを取得
    const parentPath = pathParts.slice(0, -1).join('/')
    const parentAllocation = allocsToUse.find(a => a.hierarchyPath === parentPath)

    if (parentAllocation) {
      return parseInt(parentAllocation.amount)
    }

    // 親の配分が見つからない場合は、再帰的に親を辿る
    return getParentAmount(parentPath, currentAllocations)
  }

  // 子孫の配分額を再計算する関数
  const recalculateDescendants = (updatedAllocations: Allocation[]): Allocation[] => {
    const result = [...updatedAllocations]

    // 各配分について、親の配分額に基づいて金額を再計算
    result.forEach((allocation, index) => {
      const parentAmount = getParentAmount(allocation.hierarchyPath, result)
      const newAmount = Math.floor(parentAmount * (allocation.percentage / 100))

      // 金額が変わった場合、quantityも再計算
      if (newAmount.toString() !== allocation.amount) {
        let relatedSkus: SkuData[] = []

        if (allocation.level === session!.hierarchyDefinitions.length + 1) {
          // SKUレベル: パスの最後の部分がSKUコード
          const skuCode = allocation.hierarchyPath.split('/').pop()
          relatedSkus = skuData.filter(sku => sku.skuCode === skuCode)
        } else {
          // 通常の階層レベル
          relatedSkus = skuData.filter(sku => {
            const skuPath = buildHierarchyPath(sku, session!.hierarchyDefinitions, allocation.level)
            return skuPath === allocation.hierarchyPath
          })
        }

        const totalUnitPrice = relatedSkus.reduce((sum, sku) => sum + sku.unitPrice, 0)
        const quantity = totalUnitPrice > 0 ? Math.floor(newAmount / totalUnitPrice) : 0

        result[index] = {
          ...allocation,
          amount: newAmount.toString(),
          quantity
        }
      }
    })

    return result
  }

  const updateAllocation = (path: string, percentage: number) => {
    if (!session) return

    // 親の配分額を取得（階層1の場合は総予算）
    const parentAmount = getParentAmount(path)
    const amount = Math.floor(parentAmount * (percentage / 100))

    // Find related SKUs
    const pathLevel = path.split('/').length
    let relatedSkus: SkuData[] = []

    if (pathLevel === session.hierarchyDefinitions.length + 1) {
      // SKUレベル: パスの最後の部分がSKUコード
      const skuCode = path.split('/').pop()
      relatedSkus = skuData.filter(sku => sku.skuCode === skuCode)
    } else {
      // 通常の階層レベル
      relatedSkus = skuData.filter(sku => {
        const skuPath = buildHierarchyPath(sku, session.hierarchyDefinitions, pathLevel)
        return skuPath === path
      })
    }

    // Calculate quantity (sum of unit prices)
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
      updated = [
        ...allocations,
        {
          hierarchyPath: path,
          level: path.split('/').length,
          percentage,
          amount: amount.toString(),
          quantity
        }
      ]
    }

    // 子孫の配分額を再計算
    const recalculated = recalculateDescendants(updated)
    setAllocations(recalculated)
  }

  const saveAllocations = async () => {
    try {
      // amount を文字列から数値に変換
      const allocationsToSave = allocations.map(a => ({
        ...a,
        amount: parseInt(a.amount)
      }))

      const response = await fetch(`/api/sessions/${params.sessionId}/allocations`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ allocations: allocationsToSave })
      })

      if (response.ok) {
        alert('保存しました')
      } else {
        const errorData = await response.json()
        console.error('Save error:', errorData)
        alert(`保存に失敗しました: ${errorData.error || '不明なエラー'}`)
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

  const publishSession = async () => {
    if (!confirm('このセッションを公開しますか？公開すると全ユーザーが閲覧できるようになります。')) {
      return
    }

    try {
      const response = await fetch(`/api/sessions/${params.sessionId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'confirmed' })
      })

      if (response.ok) {
        loadData()
        alert('セッションを公開しました')
      } else {
        const errorData = await response.json()
        alert(`公開に失敗しました: ${errorData.error || '不明なエラー'}`)
      }
    } catch (error) {
      console.error('Error publishing session:', error)
      alert('公開に失敗しました')
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

  const exportToCSV = () => {
    if (!session || skuData.length === 0) {
      alert('エクスポートするデータがありません')
      return
    }

    // 階層カラム名を取得
    const hierarchyColumns = session.hierarchyDefinitions.map(def => def.columnName)

    // CSVヘッダーを作成
    const headers = [...hierarchyColumns, 'sku_code', '振り分け割合(%)', 'unitprice', '割り振り金額', '数量']

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

      // 全階層の割合を掛け算して最終的な割合を計算
      let finalPercentage: number | null = null
      let finalAmount: string = ''
      let finalQuantity: string = ''

      // SKUレベルの配分情報を取得
      const skuAllocation = allocations.find(a => a.hierarchyPath === skuPath)

      if (skuAllocation && skuAllocation.percentage > 0) {
        // SKUまでのパスの各階層の割合を取得
        const pathParts = skuPath.split('/')
        let cumulativePercentage = 1.0 // 100%から開始

        // 各階層レベルの割合を掛け算
        for (let level = 1; level <= pathParts.length; level++) {
          const levelPath = pathParts.slice(0, level).join('/')
          const levelAllocation = allocations.find(a => a.hierarchyPath === levelPath)

          if (levelAllocation && levelAllocation.percentage > 0) {
            cumulativePercentage *= (levelAllocation.percentage / 100)
          } else {
            // 配分が設定されていない階層がある場合は、最終的な割合も未設定
            cumulativePercentage = 0
            break
          }
        }

        if (cumulativePercentage > 0) {
          finalPercentage = cumulativePercentage * 100 // パーセント表記に戻す
          // 最終的な金額 = 総予算 × 最終的な割合
          const totalBudget = parseInt(session.totalBudget)
          const calculatedAmount = Math.floor(totalBudget * cumulativePercentage)
          finalAmount = calculatedAmount.toString()

          // 数量 = 金額 / 単価
          finalQuantity = sku.unitPrice > 0 ? Math.floor(calculatedAmount / sku.unitPrice).toString() : '0'
        }
      }

      // 行データを作成（未入力は空欄、0は"0"として出力）
      const row = [
        ...hierarchyValues,
        sku.skuCode,
        finalPercentage !== null && finalPercentage > 0 ? finalPercentage.toFixed(4) : '',
        sku.unitPrice.toString(),
        finalAmount,
        finalQuantity
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
    const newAllocations = [...allocations]

    nodesToDistribute.forEach((node, index) => {
      const percentage = index === 0
        ? equalPercentage + remainder
        : equalPercentage

      // 親の配分額を取得（階層1の場合は総予算）
      const parentAmount = getParentAmount(node.path, newAllocations)
      const amount = Math.floor(parentAmount * (percentage / 100))

      // SKUレベルの場合は、パスからSKUコードを抽出
      let relatedSkus: SkuData[] = []
      if (level === session.hierarchyDefinitions.length + 1) {
        // SKUレベル: パスの最後の部分がSKUコード
        const skuCode = node.path.split('/').pop()
        relatedSkus = skuData.filter(sku => sku.skuCode === skuCode)
      } else {
        // 通常の階層レベル
        relatedSkus = skuData.filter(sku => {
          const skuPath = buildHierarchyPath(sku, session.hierarchyDefinitions, node.path.split('/').length)
          return skuPath === node.path
        })
      }

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

    // 子孫の配分額を再計算
    const recalculated = recalculateDescendants(newAllocations)
    setAllocations(recalculated)
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

  const calculateProgress = (level: number): { completed: number; total: number; percentage: number } => {
    const nodesAtLevel = getNodesByLevel(level)

    if (level === 1) {
      // Level 1: 全体の合計が100%かチェック
      const total = calculateLevelTotal(nodesAtLevel)
      const isValid = Math.abs(total - 100) < 0.01
      return {
        completed: isValid ? 1 : 0,
        total: 1,
        percentage: isValid ? 100 : 0
      }
    } else {
      // Level 2+: 各親グループごとに100%かチェック
      const parentPaths = new Set<string>()
      nodesAtLevel.forEach(node => {
        const parentPath = getParentPath(node.path)
        if (parentPath) parentPaths.add(parentPath)
      })

      let completedGroups = 0
      const totalGroups = parentPaths.size

      parentPaths.forEach(parentPath => {
        const children = getChildrenByParent(parentPath, level)
        const total = calculateLevelTotal(children)
        if (Math.abs(total - 100) < 0.01) {
          completedGroups++
        }
      })

      return {
        completed: completedGroups,
        total: totalGroups,
        percentage: totalGroups > 0 ? (completedGroups / totalGroups) * 100 : 0
      }
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

    // Build tree structure (including SKU level)
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

    // 各レベルをチェック (SKUレベルまで含む)
    for (let level = 2; level <= session.hierarchyDefinitions.length + 1; level++) {
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
            // 親の配分額を取得（階層1の場合は総予算）
            const parentAmount = getParentAmount(child.path, newAllocations)
            const amount = Math.floor(parentAmount * 1) // 100%

            // SKUレベルの場合は、パスからSKUコードを抽出
            let relatedSkus: SkuData[] = []
            if (level === session.hierarchyDefinitions.length + 1) {
              // SKUレベル: パスの最後の部分がSKUコード
              const skuCode = child.path.split('/').pop()
              relatedSkus = skuData.filter(sku => sku.skuCode === skuCode)
            } else {
              // 通常の階層レベル
              relatedSkus = skuData.filter(sku => {
                const skuPath = buildHierarchyPath(sku, session.hierarchyDefinitions, child.path.split('/').length)
                return skuPath === child.path
              })
            }

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
      // 子孫の配分額を再計算
      const recalculated = recalculateDescendants(newAllocations)
      setAllocations(recalculated)
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
    <div className="min-h-screen bg-gray-100">
      <header className="bg-white shadow">
        <div className="max-w-7xl mx-auto px-4 py-6 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <button onClick={() => router.push('/dashboard')} className="btn btn-secondary">
                <ArrowLeft size={20} />
              </button>
              <div>
                <div className="text-sm text-gray-600 mb-1 flex items-center gap-2">
                  <span>{category?.name}</span>
                  <button
                    onClick={() => {
                      setDeleteConfirmText('')
                      setShowDeleteCategoryModal(true)
                    }}
                    className="text-xs text-red-600 hover:text-red-800"
                  >
                    [削除]
                  </button>
                  <span> &gt; {session.name}</span>
                  <button
                    onClick={() => {
                      setDeleteConfirmText('')
                      setShowDeleteSessionModal(true)
                    }}
                    className="text-xs text-red-600 hover:text-red-800"
                  >
                    [削除]
                  </button>
                </div>
                <h1 className="text-3xl font-bold text-gray-900">{session.name}</h1>
                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-2">
                    <p className="text-gray-700">
                      総予算: ¥{parseInt(session.totalBudget).toLocaleString()}
                    </p>
                    <button
                      onClick={() => {
                        setNewBudget(session.totalBudget)
                        setShowBudgetEditModal(true)
                      }}
                      className="text-sm text-blue-600 hover:text-blue-800"
                    >
                      [編集]
                    </button>
                  </div>
                  <div className="text-sm text-gray-600">
                    作成者: {session.category?.user?.name || session.category?.user?.email || '不明'}
                  </div>
                  <span className={`px-3 py-1 rounded-full text-sm ${
                    session.status === 'confirmed' ? 'bg-green-100 text-green-800' :
                    session.status === 'archived' ? 'bg-gray-100 text-gray-800' :
                    'bg-yellow-100 text-yellow-800'
                  }`}>
                    {session.status === 'confirmed' ? '確定' :
                     session.status === 'archived' ? 'アーカイブ' : '作業中'}
                  </span>
                </div>
              </div>
            </div>
            <div className="flex gap-2">
              {skuData.length === 0 && session.category?.userId === authSession?.user?.id && (
                <button onClick={() => setShowUploadModal(true)} className="btn btn-primary flex items-center gap-2">
                  <Upload size={20} />
                  CSV取り込み
                </button>
              )}
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
              {session.status === 'draft' && session.category?.userId === authSession?.user?.id && (
                <button onClick={publishSession} className="btn bg-green-600 text-white hover:bg-green-700 flex items-center gap-2">
                  <Check size={20} />
                  公開
                </button>
              )}
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-6 sm:px-6 lg:px-8">
        {skuData.length === 0 ? (
          <div className="card text-center py-12">
            {session.category?.userId === authSession?.user?.id ? (
              <>
                <p className="text-gray-600 mb-4">CSVファイルをアップロードしてください</p>
                <button onClick={() => setShowUploadModal(true)} className="btn btn-primary">
                  CSV取り込み
                </button>
              </>
            ) : (
              <p className="text-gray-600">このセッションにはまだデータがありません</p>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            {/* Level switching buttons with progress */}
            {session && session.hierarchyDefinitions.length > 0 && (
              <div className="card">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-lg font-semibold text-gray-900">階層レベル選択</h3>
                  <div className="flex items-center gap-4">
                    <button
                      onClick={() => router.push(`/dashboard/${params.categoryId}/${params.sessionId}/spreadsheet`)}
                      className="px-3 py-1 bg-purple-600 text-white rounded text-sm hover:bg-purple-700"
                    >
                      📊 スプレッドシートビュー（プロトタイプ）
                    </button>
                    <input
                      type="text"
                      placeholder="検索..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="px-3 py-1 border border-gray-300 rounded-md text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    <label className="flex items-center gap-2 text-sm text-gray-700">
                      <input
                        type="checkbox"
                        checked={showIncompleteOnly}
                        onChange={(e) => setShowIncompleteOnly(e.target.checked)}
                        className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                      />
                      未完了のみ表示
                    </label>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  {session.hierarchyDefinitions.map((def) => {
                    const progress = calculateProgress(def.level)
                    return (
                      <button
                        key={def.level}
                        onClick={() => setCurrentLevel(def.level)}
                        className={`min-w-[200px] px-6 py-2 rounded-md font-medium transition-colors ${
                          currentLevel === def.level
                            ? 'bg-blue-600 text-white'
                            : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                        }`}
                      >
                        <div>Level {def.level}: {def.columnName}</div>
                        <div className={`text-xs mt-1 ${currentLevel === def.level ? 'text-blue-100' : 'text-gray-600'}`}>
                          進捗: {progress.completed}/{progress.total} ({progress.percentage.toFixed(0)}%)
                        </div>
                      </button>
                    )
                  })}
                  {/* SKU Level Button */}
                  <button
                    onClick={() => setCurrentLevel(session.hierarchyDefinitions.length + 1)}
                    className={`min-w-[200px] px-6 py-2 rounded-md font-medium transition-colors ${
                      currentLevel === session.hierarchyDefinitions.length + 1
                        ? 'bg-blue-600 text-white'
                        : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                    }`}
                  >
                    <div>Level {session.hierarchyDefinitions.length + 1}: sku_code</div>
                    <div className={`text-xs mt-1 ${currentLevel === session.hierarchyDefinitions.length + 1 ? 'text-blue-100' : 'text-gray-600'}`}>
                      SKU詳細
                    </div>
                  </button>
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
              本当にこのカテゴリとそのすべてのセッションを削除しますか？この操作は元に戻せません。
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
    </div>
  )

  function renderLevelView() {
    if (!session) return null

    const nodesAtLevel = getNodesByLevel(currentLevel)

    if (currentLevel === 1) {
      // Level 1 view: simple list
      // 検索フィルタ
      const filteredNodes = searchQuery
        ? nodesAtLevel.filter(node =>
            node.name.toLowerCase().includes(searchQuery.toLowerCase())
          )
        : nodesAtLevel

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
              {searchQuery && (
                <span className="text-sm text-gray-600">
                  (検索結果: {filteredNodes.length}件)
                </span>
              )}
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
              {filteredNodes.map((node) => (
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

      // フィルタ: 未完了のみ表示
      let filteredGroups = showIncompleteOnly
        ? groups.filter(({ children }) => {
            const total = calculateLevelTotal(children)
            return Math.abs(total - 100) >= 0.01 // 100%でない
          })
        : groups

      // 検索フィルタ
      if (searchQuery) {
        filteredGroups = filteredGroups.filter(({ parentPath, children }) => {
          // 親パスに検索文字列が含まれるか
          const parentMatches = parentPath.toLowerCase().includes(searchQuery.toLowerCase())
          // 子の名前に検索文字列が含まれるか
          const childMatches = children.some(child =>
            child.name.toLowerCase().includes(searchQuery.toLowerCase())
          )
          return parentMatches || childMatches
        })
      }

      return (
        <div>
          <div className="flex items-center justify-between mb-4 pb-3 border-b">
            <h3 className="text-lg font-semibold text-gray-900">
              {session.hierarchyDefinitions[currentLevel - 1]?.columnName}別配分
              {showIncompleteOnly && (
                <span className="text-sm text-gray-600 ml-2">
                  (未完了のみ: {filteredGroups.length}件)
                </span>
              )}
              {searchQuery && !showIncompleteOnly && (
                <span className="text-sm text-gray-600 ml-2">
                  (検索結果: {filteredGroups.length}件)
                </span>
              )}
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

          {filteredGroups.map(({ parentPath, parentNode, children }) => {
            const isExpanded = expandedGroups.has(parentPath)
            const total = calculateLevelTotal(children)
            const isValid = Math.abs(total - 100) < 0.01

            // 親パスを階層ごとに分割
            const pathParts = parentPath.split('/')
            // 最後の3階層を表示（ない場合はあるだけ）
            const displayParts = pathParts.slice(-3)
            const displayName = displayParts.join(' - ')

            // ツールチップ用の階層詳細
            const tooltipLines = pathParts.map((part, index) =>
              `階層${index + 1}: ${part}`
            )

            return (
              <div key={parentPath} className="mb-6">
                {/* Parent row */}
                <div
                  className="flex items-center justify-between bg-gray-50 hover:bg-gray-100 p-3 rounded cursor-pointer relative"
                  onClick={() => toggleGroup(parentPath)}
                  onMouseEnter={() => setHoveredPath(parentPath)}
                  onMouseLeave={() => setHoveredPath(null)}
                >
                  <div className="flex items-center gap-2">
                    {isExpanded ? <ChevronDown size={20} /> : <ChevronRight size={20} />}
                    <span className="font-medium text-gray-900">
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

                  {/* Custom tooltip */}
                  {hoveredPath === parentPath && (
                    <div className="absolute left-0 top-full mt-2 bg-gray-900 text-white text-sm rounded-lg shadow-lg p-3 z-50 min-w-[300px]">
                      {tooltipLines.map((line, index) => (
                        <div key={index} className="py-1">{line}</div>
                      ))}
                    </div>
                  )}
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

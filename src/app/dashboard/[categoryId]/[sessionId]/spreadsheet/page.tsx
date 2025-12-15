'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { useSession } from 'next-auth/react'
import { ArrowLeft, Save } from 'lucide-react'
import { AgGridReact } from 'ag-grid-react'
import { ColDef, GridReadyEvent, CellValueChangedEvent, ModuleRegistry, AllCommunityModule } from 'ag-grid-community'

// AG Grid モジュール登録
ModuleRegistry.registerModules([AllCommunityModule])

// AG Grid スタイル
import 'ag-grid-community/styles/ag-grid.css'
import 'ag-grid-community/styles/ag-theme-alpine.css'

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

interface RowData {
  // 階層パス（ツリー構造用）
  orgHierarchy: string[]

  // 表示用データ
  hierarchy: string // 階層名（最下層の名前）
  level: number
  skuCode?: string
  unitPrice?: number

  // 編集可能なデータ
  percentage: number

  // 計算値
  amount: number
  quantity: number

  // 内部用
  hierarchyPath: string
}

export default function SpreadsheetPage() {
  const router = useRouter()
  const params = useParams()
  const { data: authSession, status } = useSession()

  const [session, setSession] = useState<Session | null>(null)
  const [skuData, setSkuData] = useState<SkuData[]>([])
  const [allocations, setAllocations] = useState<Allocation[]>([])
  const [loading, setLoading] = useState(true)
  const [rowData, setRowData] = useState<RowData[]>([])

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

  // SKUデータから階層ツリーを構築
  useEffect(() => {
    if (!session || skuData.length === 0) return

    const rows: RowData[] = []
    const processedPaths = new Set<string>()

    skuData.forEach(sku => {
      const hierarchyColumns = session.hierarchyDefinitions.map(def => def.columnName)

      // 各階層レベルのデータを追加
      for (let level = 1; level <= hierarchyColumns.length; level++) {
        const pathParts: string[] = []
        for (let i = 0; i < level; i++) {
          const value = sku.hierarchyValues[hierarchyColumns[i]]
          if (value) pathParts.push(value)
        }

        const hierarchyPath = pathParts.join('/')
        if (!hierarchyPath || processedPaths.has(hierarchyPath)) continue

        processedPaths.add(hierarchyPath)

        const allocation = allocations.find(a => a.hierarchyPath === hierarchyPath)

        rows.push({
          orgHierarchy: pathParts,
          hierarchy: pathParts[pathParts.length - 1],
          level,
          percentage: allocation?.percentage || 0,
          amount: allocation ? parseInt(allocation.amount) : 0,
          quantity: allocation?.quantity || 0,
          hierarchyPath
        })
      }

      // SKUレベルを追加
      const hierarchyPath = hierarchyColumns.map(col => sku.hierarchyValues[col]).join('/') + '/' + sku.skuCode
      const pathParts = [...hierarchyColumns.map(col => sku.hierarchyValues[col]), sku.skuCode]

      const allocation = allocations.find(a => a.hierarchyPath === hierarchyPath)

      rows.push({
        orgHierarchy: pathParts,
        hierarchy: sku.skuCode,
        level: hierarchyColumns.length + 1,
        skuCode: sku.skuCode,
        unitPrice: sku.unitPrice,
        percentage: allocation?.percentage || 0,
        amount: allocation ? parseInt(allocation.amount) : 0,
        quantity: allocation?.quantity || 0,
        hierarchyPath
      })
    })

    setRowData(rows)
  }, [session, skuData, allocations])

  // 列定義
  const columnDefs: ColDef[] = useMemo(() => [
    {
      field: 'hierarchy',
      headerName: '階層',
      width: 300,
      pinned: 'left',
      cellRenderer: 'agGroupCellRenderer',
      cellRendererParams: {
        suppressCount: true,
        innerRenderer: (params: any) => params.value
      }
    },
    {
      field: 'skuCode',
      headerName: 'SKU',
      width: 150
    },
    {
      field: 'unitPrice',
      headerName: '単価',
      width: 120,
      valueFormatter: (params) => params.value ? `¥${params.value.toLocaleString()}` : ''
    },
    {
      field: 'percentage',
      headerName: '割合(%)',
      width: 120,
      editable: true,
      type: 'numericColumn',
      valueFormatter: (params) => params.value > 0 ? params.value.toFixed(2) : ''
    },
    {
      field: 'amount',
      headerName: '金額',
      width: 150,
      valueFormatter: (params) => params.value > 0 ? `¥${params.value.toLocaleString()}` : ''
    },
    {
      field: 'quantity',
      headerName: '数量',
      width: 100,
      valueFormatter: (params) => params.value > 0 ? params.value.toLocaleString() : ''
    }
  ], [])

  // グリッド設定
  const defaultColDef = useMemo<ColDef>(() => ({
    sortable: true,
    filter: true,
    resizable: true
  }), [])

  const onGridReady = useCallback((params: GridReadyEvent) => {
    // グリッド初期化完了
  }, [])

  const onCellValueChanged = useCallback((event: CellValueChangedEvent) => {
    console.log('Cell value changed:', event.data)
    // TODO: 再計算ロジック
  }, [])

  const getDataPath = useCallback((data: RowData) => {
    return data.orgHierarchy
  }, [])

  const autoGroupColumnDef = useMemo<ColDef>(() => ({
    headerName: '階層',
    width: 300,
    pinned: 'left',
    cellRendererParams: {
      suppressCount: true
    }
  }), [])

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
              <button
                onClick={() => router.push(`/dashboard/${params.categoryId}/${params.sessionId}`)}
                className="btn btn-secondary"
              >
                <ArrowLeft size={20} />
              </button>
              <div>
                <h1 className="text-3xl font-bold text-gray-900">
                  {session.name} - スプレッドシートビュー（プロトタイプ）
                </h1>
                <p className="text-gray-700">
                  総予算: ¥{parseInt(session.totalBudget).toLocaleString()}
                </p>
              </div>
            </div>
            <div className="flex gap-2">
              <button className="btn btn-primary flex items-center gap-2">
                <Save size={20} />
                保存
              </button>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-6 sm:px-6 lg:px-8">
        <div className="card">
          <div className="mb-4">
            <h2 className="text-lg font-semibold mb-2">機能テスト</h2>
            <ul className="text-sm text-gray-600 space-y-1">
              <li>✓ ツリー表示（▶/▼で展開/折りたたみ）</li>
              <li>✓ セル編集（割合列をダブルクリック）</li>
              <li>✓ キーボード操作（Tab, Enter, 矢印キー）</li>
              <li>✓ コピー＆ペースト（Ctrl+C/V）</li>
              <li>✓ 範囲選択（Shift+クリック）</li>
              <li>✓ 列固定（階層列は左固定）</li>
              <li>✓ フィルタ（列ヘッダーのメニュー）</li>
            </ul>
          </div>

          <div
            className="ag-theme-alpine"
            style={{ height: 600, width: '100%' }}
          >
            <AgGridReact
              rowData={rowData}
              columnDefs={columnDefs}
              defaultColDef={defaultColDef}
              treeData={true}
              getDataPath={getDataPath}
              autoGroupColumnDef={autoGroupColumnDef}
              groupDefaultExpanded={1}
              animateRows={true}
              enableRangeSelection={true}
              enableCellChangeFlash={true}
              undoRedoCellEditing={true}
              onGridReady={onGridReady}
              onCellValueChanged={onCellValueChanged}
            />
          </div>
        </div>
      </main>
    </div>
  )
}

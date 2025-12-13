'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useSession } from 'next-auth/react'
import Link from 'next/link'
import { Plus, FolderOpen, FileText, ChevronDown, ChevronRight } from 'lucide-react'

interface Category {
  id: string
  name: string
  createdAt: string
}

interface Session {
  id: string
  name: string
  totalBudget: string
  status: string
  createdAt: string
  category: Category
}

export default function DashboardPage() {
  const router = useRouter()
  const { data: session, status } = useSession()
  const [categories, setCategories] = useState<Category[]>([])
  const [sessions, setSessions] = useState<Session[]>([])
  const [loading, setLoading] = useState(true)
  const [showCategoryModal, setShowCategoryModal] = useState(false)
  const [showSessionModal, setShowSessionModal] = useState(false)
  const [newCategoryName, setNewCategoryName] = useState('')
  const [newSession, setNewSession] = useState({
    categoryId: '',
    name: '',
    totalBudget: ''
  })
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set())
  const [sessionSearchQuery, setSessionSearchQuery] = useState('')
  const [showSqlModal, setShowSqlModal] = useState(false)
  const [categorySql, setCategorySql] = useState('')
  const [currentCategoryName, setCurrentCategoryName] = useState('')

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/login')
    } else if (status === 'authenticated') {
      loadData()
    }
  }, [status, router])

  const loadData = async () => {
    try {
      const [categoriesRes, sessionsRes] = await Promise.all([
        fetch('/api/categories'),
        fetch('/api/sessions')
      ])

      if (categoriesRes.ok) {
        const categoriesData = await categoriesRes.json()
        setCategories(categoriesData)
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

  const createCategory = async () => {
    if (!newCategoryName.trim()) return

    try {
      const response = await fetch('/api/categories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newCategoryName })
      })

      if (response.ok) {
        setNewCategoryName('')
        setShowCategoryModal(false)
        loadData()
      }
    } catch (error) {
      console.error('Error creating category:', error)
    }
  }

  const showSql = async (categoryName: string) => {
    try {
      // カテゴリ名と同じファイル名のSQLファイルを読み込む
      const response = await fetch(`/sql/${categoryName}.sql`)

      if (!response.ok) {
        alert(`このカテゴリ用のSQLファイルが見つかりません。\n場所: public/sql/${categoryName}.sql`)
        return
      }

      const sql = await response.text()
      setCategorySql(sql)
      setCurrentCategoryName(categoryName)
      setShowSqlModal(true)
    } catch (error) {
      console.error('Error loading SQL:', error)
      alert(`SQLファイルの読み込みに失敗しました。\n場所: public/sql/${categoryName}.sql`)
    }
  }

  const copySqlToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(categorySql)
      alert('SQLをクリップボードにコピーしました')
    } catch (error) {
      console.error('Error copying to clipboard:', error)
      alert('コピーに失敗しました')
    }
  }

  const createSession = async () => {
    if (!newSession.categoryId || !newSession.name || !newSession.totalBudget) return

    try {
      const response = await fetch('/api/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...newSession,
          totalBudget: parseInt(newSession.totalBudget)
        })
      })

      if (response.ok) {
        setNewSession({ categoryId: '', name: '', totalBudget: '' })
        setShowSessionModal(false)
        loadData()
      }
    } catch (error) {
      console.error('Error creating session:', error)
    }
  }

  if (status === 'loading' || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-xl">読み込み中...</div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-100">
      <header className="bg-white shadow">
        <div className="max-w-7xl mx-auto px-4 py-6 sm:px-6 lg:px-8 flex justify-between items-center">
          <h1 className="text-3xl font-bold text-gray-900">ダッシュボード</h1>
          <button
            onClick={() => router.push('/api/auth/signout')}
            className="btn btn-secondary"
          >
            ログアウト
          </button>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-6 sm:px-6 lg:px-8">
        <div className="mb-6">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-2xl font-semibold text-gray-900">カテゴリとセッション</h2>
            <div className="flex gap-2">
              <button
                onClick={() => setShowCategoryModal(true)}
                className="btn btn-primary flex items-center gap-2"
              >
                <Plus size={20} />
                カテゴリ作成
              </button>
              <button
                onClick={() => setShowSessionModal(true)}
                className="btn btn-primary flex items-center gap-2"
                disabled={categories.length === 0}
              >
                <Plus size={20} />
                セッション作成
              </button>
            </div>
          </div>

          {/* Search */}
          <div className="mb-4">
            <input
              type="text"
              className="input w-full max-w-md"
              placeholder="セッション名で検索..."
              value={sessionSearchQuery}
              onChange={(e) => setSessionSearchQuery(e.target.value)}
            />
          </div>

          {/* Categories with Sessions */}
          <div className="space-y-4">
            {categories.map((category) => {
              const isExpanded = expandedCategories.has(category.id)
              const categorySessions = sessions.filter(s => s.category.id === category.id)
              const filteredSessions = sessionSearchQuery
                ? categorySessions.filter(s => s.name.toLowerCase().includes(sessionSearchQuery.toLowerCase()))
                : categorySessions

              const toggleCategory = () => {
                const newExpanded = new Set(expandedCategories)
                if (newExpanded.has(category.id)) {
                  newExpanded.delete(category.id)
                } else {
                  newExpanded.add(category.id)
                }
                setExpandedCategories(newExpanded)
              }

              return (
                <div key={category.id} className="border border-gray-200 rounded-lg overflow-hidden">
                  {/* Category Header */}
                  <div
                    onClick={toggleCategory}
                    className="card cursor-pointer hover:bg-gray-50 transition-colors flex items-center justify-between"
                  >
                    <div className="flex items-center gap-3">
                      {isExpanded ? <ChevronDown size={20} /> : <ChevronRight size={20} />}
                      <FolderOpen className="text-blue-600" />
                      <div>
                        <h3 className="text-lg font-semibold">{category.name}</h3>
                        <p className="text-sm text-gray-600">
                          {categorySessions.length} セッション
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Sessions List */}
                  {isExpanded && (
                    <div className="bg-gray-50 border-t border-gray-200">
                      {/* SQL Button */}
                      <div className="p-4 border-b border-gray-200">
                        <button
                          onClick={() => showSql(category.name)}
                          className="btn btn-secondary"
                        >
                          SQL表示
                        </button>
                      </div>

                      {filteredSessions.length > 0 ? (
                        <div className="p-4 space-y-3">
                          {filteredSessions.map((session) => (
                            <Link
                              key={session.id}
                              href={`/dashboard/${session.category.id}/${session.id}`}
                              className="block bg-white p-4 rounded-lg hover:shadow-md transition-shadow"
                            >
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                  <FileText className="text-green-600" size={20} />
                                  <div>
                                    <h4 className="font-semibold text-gray-900">{session.name}</h4>
                                    <p className="text-sm text-gray-600">
                                      予算: ¥{parseInt(session.totalBudget).toLocaleString()}
                                    </p>
                                    <p className="text-xs text-gray-500 mt-1">
                                      作成日: {new Date(session.createdAt).toLocaleDateString('ja-JP', {
                                        year: 'numeric',
                                        month: '2-digit',
                                        day: '2-digit'
                                      })}
                                    </p>
                                  </div>
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
                            </Link>
                          ))}
                        </div>
                      ) : (
                        <div className="p-8 text-center text-gray-500">
                          {sessionSearchQuery
                            ? '検索条件に一致するセッションがありません'
                            : 'このカテゴリにはまだセッションがありません'}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )
            })}

            {categories.length === 0 && (
              <div className="text-center py-12 text-gray-500">
                カテゴリがありません。新しいカテゴリを作成してください。
              </div>
            )}
          </div>
        </div>
      </main>

      {/* Category Modal */}
      {showCategoryModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white p-6 rounded-lg w-full max-w-md">
            <h2 className="text-xl font-bold mb-4 text-gray-900">カテゴリ作成</h2>
            <div className="mb-4">
              <label className="label">カテゴリ名</label>
              <input
                type="text"
                className="input"
                value={newCategoryName}
                onChange={(e) => setNewCategoryName(e.target.value)}
                placeholder="例: SLEEP寝具"
              />
            </div>
            <div className="flex gap-2">
              <button onClick={createCategory} className="btn btn-primary flex-1">
                作成
              </button>
              <button
                onClick={() => {
                  setShowCategoryModal(false)
                  setNewCategoryName('')
                }}
                className="btn btn-secondary flex-1"
              >
                キャンセル
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Session Modal */}
      {showSessionModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white p-6 rounded-lg w-full max-w-md">
            <h2 className="text-xl font-bold mb-4 text-gray-900">セッション作成</h2>
            <div className="mb-4">
              <label className="label">カテゴリ</label>
              <select
                className="input"
                value={newSession.categoryId}
                onChange={(e) => setNewSession({ ...newSession, categoryId: e.target.value })}
              >
                <option value="">選択してください</option>
                {categories.map((cat) => (
                  <option key={cat.id} value={cat.id}>
                    {cat.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="mb-4">
              <label className="label">セッション名</label>
              <input
                type="text"
                className="input"
                value={newSession.name}
                onChange={(e) => setNewSession({ ...newSession, name: e.target.value })}
                placeholder="例: 2025年春夏予算"
              />
            </div>
            <div className="mb-4">
              <label className="label">総予算 (円)</label>
              <input
                type="number"
                className="input"
                value={newSession.totalBudget}
                onChange={(e) => setNewSession({ ...newSession, totalBudget: e.target.value })}
                placeholder="例: 10000000"
              />
            </div>
            <div className="flex gap-2">
              <button onClick={createSession} className="btn btn-primary flex-1">
                作成
              </button>
              <button
                onClick={() => {
                  setShowSessionModal(false)
                  setNewSession({ categoryId: '', name: '', totalBudget: '' })
                }}
                className="btn btn-secondary flex-1"
              >
                キャンセル
              </button>
            </div>
          </div>
        </div>
      )}

      {/* SQL Modal */}
      {showSqlModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white p-6 rounded-lg w-full max-w-3xl">
            <h2 className="text-xl font-bold mb-4 text-gray-900">
              {currentCategoryName} - SQL
            </h2>
            <div className="mb-4">
              <pre className="bg-gray-100 p-4 rounded-md overflow-x-auto text-sm text-gray-900 border border-gray-300">
                {categorySql}
              </pre>
            </div>
            <div className="flex gap-2">
              <button
                onClick={copySqlToClipboard}
                className="btn btn-primary flex-1"
              >
                コピー
              </button>
              <button
                onClick={() => setShowSqlModal(false)}
                className="btn btn-secondary flex-1"
              >
                閉じる
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

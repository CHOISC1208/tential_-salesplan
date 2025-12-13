'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useSession } from 'next-auth/react'
import Link from 'next/link'
import { Plus, FolderOpen, FileText } from 'lucide-react'

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
          <h1 className="text-3xl font-bold">ダッシュボード</h1>
          <button
            onClick={() => router.push('/api/auth/signout')}
            className="btn btn-secondary"
          >
            ログアウト
          </button>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-6 sm:px-6 lg:px-8">
        <div className="mb-8">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-2xl font-semibold">カテゴリ</h2>
            <button
              onClick={() => setShowCategoryModal(true)}
              className="btn btn-primary flex items-center gap-2"
            >
              <Plus size={20} />
              カテゴリ作成
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {categories.map((category) => (
              <div key={category.id} className="card">
                <div className="flex items-center gap-2 mb-2">
                  <FolderOpen className="text-blue-600" />
                  <h3 className="text-lg font-semibold">{category.name}</h3>
                </div>
                <p className="text-sm text-gray-600">
                  {sessions.filter(s => s.category.id === category.id).length} セッション
                </p>
              </div>
            ))}
          </div>
        </div>

        <div>
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-2xl font-semibold">セッション</h2>
            <button
              onClick={() => setShowSessionModal(true)}
              className="btn btn-primary flex items-center gap-2"
              disabled={categories.length === 0}
            >
              <Plus size={20} />
              セッション作成
            </button>
          </div>

          <div className="space-y-4">
            {sessions.map((session) => (
              <Link
                key={session.id}
                href={`/dashboard/${session.category.id}/${session.id}`}
                className="block card hover:shadow-lg transition-shadow"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <FileText className="text-green-600" />
                    <div>
                      <h3 className="text-lg font-semibold">{session.name}</h3>
                      <p className="text-sm text-gray-600">
                        {session.category.name} - 予算: ¥{parseInt(session.totalBudget).toLocaleString()}
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

            {sessions.length === 0 && (
              <div className="text-center py-12 text-gray-500">
                セッションがありません。新しいセッションを作成してください。
              </div>
            )}
          </div>
        </div>
      </main>

      {/* Category Modal */}
      {showCategoryModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center">
          <div className="bg-white p-6 rounded-lg w-full max-w-md">
            <h2 className="text-xl font-bold mb-4">カテゴリ作成</h2>
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
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center">
          <div className="bg-white p-6 rounded-lg w-full max-w-md">
            <h2 className="text-xl font-bold mb-4">セッション作成</h2>
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
    </div>
  )
}

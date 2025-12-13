import Link from 'next/link'

export default function Home() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100">
      <div className="text-center">
        <h1 className="text-4xl font-bold mb-8 text-gray-900">販売計画</h1>
        <div className="space-x-4">
          <Link href="/login" className="btn btn-primary">
            ログイン
          </Link>
          <Link href="/register" className="btn btn-secondary">
            新規登録
          </Link>
        </div>
      </div>
    </div>
  )
}

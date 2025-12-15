# 販売計画システム

BigQueryのデータをCSVで取り込み、階層的に予算を配分するWebアプリケーション。

## 特徴

**🎯 柔軟な階層構造**: CSVの固定カラム（sku_code、unitprice）以外は自由に設定可能。商品カテゴリごとに異なる階層を定義できます。

**📊 シンプルなデータフロー**: BigQuery → CSV出力 → アップロード → 予算配分 → 結果確認

**👥 共有アクセス**: 全ユーザーがすべてのカテゴリ・セッションにアクセス可能

## クイックスタート

詳細な使い方は [USAGE.md](./USAGE.md) を参照してください。

### 基本的な流れ

1. **カテゴリ作成**: 商品グループを作成（例: SLEEP寝具）
2. **セッション作成**: 作業単位を作成し、総予算を設定
3. **CSV取り込み**: BigQueryからエクスポートしたCSVをアップロード
4. **予算配分**: 階層ごとにパーセンテージを入力（自動計算）
5. **保存**: 配分結果を保存

## 機能

- ユーザー認証（登録・ログイン）
- カテゴリとセッションの管理
- CSV取り込みによるSKUデータの一括登録
- 階層的な予算配分（最大6階層）
- 配分額の自動計算（親の配分額に基づく階層的計算）
- 均等配分機能
- セッション検索・フィルタリング
- カテゴリ別SQL定義の表示

## 技術スタック

- **フレームワーク**: Next.js 15 (App Router)
- **言語**: TypeScript
- **データベース**: PostgreSQL
- **ORM**: Prisma
- **認証**: NextAuth.js
- **スタイリング**: Tailwind CSS
- **デプロイ**: Heroku

## ローカル開発環境のセットアップ

### 前提条件

- Node.js 20以上
- PostgreSQL
- npm または yarn

### インストール手順

1. リポジトリをクローン

```bash
git clone <repository-url>
cd tential_-salesplan
```

2. 依存関係をインストール

```bash
npm install
```

3. 環境変数を設定

`.env.example`を`.env`にコピーして、必要な環境変数を設定：

```bash
cp .env.example .env
```

`.env`ファイルを編集：

```env
DATABASE_URL="postgresql://user:password@localhost:5432/budget_allocation?schema=public"
NEXTAUTH_SECRET="your-secret-key"
NEXTAUTH_URL="http://localhost:3000"
NEXT_PUBLIC_APP_URL="http://localhost:3000"
NODE_ENV="development"
```

4. データベースのセットアップ

```bash
# PostgreSQLに接続してスキーマを作成
psql -U postgres
CREATE DATABASE budget_allocation;
\c budget_allocation
CREATE SCHEMA sales_plane;
\q

# Prismaマイグレーションを実行
npx prisma db push

# または、マイグレーションファイルがある場合
npx prisma migrate dev
```

5. 開発サーバーを起動

```bash
npm run dev
```

ブラウザで http://localhost:3000 にアクセス

## Herokuへのデプロイ

詳細な手順は [HEROKU_DEPLOYMENT.md](./HEROKU_DEPLOYMENT.md) を参照してください。

### クイックスタート

```bash
# Herokuアプリを作成
heroku create your-app-name

# PostgreSQLアドオンを追加
heroku addons:create heroku-postgresql:essential-0

# 環境変数を設定
heroku config:set NEXTAUTH_SECRET="$(openssl rand -base64 32)"
heroku config:set NEXTAUTH_URL="https://your-app-name.herokuapp.com"
heroku config:set NEXT_PUBLIC_APP_URL="https://your-app-name.herokuapp.com"
heroku config:set NODE_ENV="production"

# デプロイ
git push heroku main

# スキーマを適用（初回のみ）
heroku pg:psql
CREATE SCHEMA IF NOT EXISTS sales_plane;
\q
heroku run npx prisma db push
```

## プロジェクト構成

```
tential_-salesplan/
├── src/
│   ├── app/                 # Next.js App Router
│   │   ├── api/            # API Routes
│   │   ├── dashboard/      # ダッシュボードページ
│   │   ├── login/          # ログインページ
│   │   └── register/       # 登録ページ
│   ├── lib/                # ユーティリティ
│   └── types/              # TypeScript型定義
├── prisma/
│   └── schema.prisma       # Prismaスキーマ
├── public/
│   └── sql/                # カテゴリ別SQL定義
├── .env.example            # 環境変数テンプレート
├── Procfile                # Heroku設定
└── HEROKU_DEPLOYMENT.md    # デプロイガイド
```

## 使い方

### 1. ユーザー登録

`/register` にアクセスして、新しいユーザーアカウントを作成します。

### 2. カテゴリの作成

ダッシュボードで「カテゴリ作成」ボタンをクリックして、新しいカテゴリを作成します。

### 3. セッションの作成

カテゴリを展開して、「セッション作成」ボタンをクリック。セッション名と総予算を入力します。

### 4. CSV取り込み

セッション詳細ページで「CSV取り込み」ボタンをクリックし、SKUデータをアップロードします。

**CSVフォーマット例:**

```csv
category,raw_materials,launch_year,item_name,size,color,sku_code,unitprice
SLEEP寝具,コットン,2023,枕,標準,ホワイト,SKU001,5000
```

### 5. 予算配分

階層ごとにパーセンテージを入力して予算を配分します。配分額は親の配分額に基づいて自動計算されます。

## ライセンス

Private

## サポート

問題が発生した場合は、Issueを作成してください。

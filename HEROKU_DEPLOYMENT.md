# Herokuデプロイメントガイド

このガイドでは、予算配分システムをHerokuにデプロイする方法を説明します。

## 前提条件

- Herokuアカウント
- Heroku CLIのインストール
- Gitのインストール

## デプロイ手順

### 1. Heroku CLIのインストール（未インストールの場合）

```bash
# macOS
brew tap heroku/brew && brew install heroku

# Windows
# https://devcenter.heroku.com/articles/heroku-cli からインストーラーをダウンロード

# Linux
curl https://cli-assets.heroku.com/install.sh | sh
```

### 2. Herokuにログイン

```bash
heroku login
```

### 3. Herokuアプリを作成

```bash
# アプリ名を指定して作成（アプリ名はユニークである必要があります）
heroku create your-app-name

# または、自動で名前を生成
heroku create
```

### 4. PostgreSQLアドオンを追加

```bash
# Hobby Dev（無料プラン）を追加
heroku addons:create heroku-postgresql:essential-0

# アドオンが追加されたか確認
heroku addons
```

### 5. 環境変数を設定

```bash
# NEXTAUTH_SECRETを生成して設定
# ランダムな文字列を生成
openssl rand -base64 32

# 生成された文字列を設定
heroku config:set NEXTAUTH_SECRET="生成された文字列をここに貼り付け"

# NEXTAUTH_URLを設定（あなたのHerokuアプリのURL）
heroku config:set NEXTAUTH_URL="https://your-app-name.herokuapp.com"

# NEXT_PUBLIC_APP_URLを設定
heroku config:set NEXT_PUBLIC_APP_URL="https://your-app-name.herokuapp.com"

# NODE_ENVを設定
heroku config:set NODE_ENV="production"

# 設定された環境変数を確認
heroku config
```

**重要**: Heroku PostgreSQLアドオンは自動的に`DATABASE_URL`を設定します。手動で設定する必要はありません。

### 6. Prismaスキーマの設定確認

Heroku PostgreSQLを使用する場合、`sales_plane`スキーマを事前に作成する必要があります。

```bash
# Herokuのデータベースに接続
heroku pg:psql

# スキーマを作成
CREATE SCHEMA IF NOT EXISTS sales_plane;

# 確認
\dn

# 接続を終了
\q
```

### 7. デプロイ

```bash
# Gitリポジトリにコミット（まだの場合）
git add .
git commit -m "Prepare for Heroku deployment"

# Herokuにプッシュ
git push heroku main

# または、別のブランチからデプロイする場合
git push heroku your-branch-name:main
```

### 8. データベーススキーマの適用

初回デプロイ後、データベーススキーマを適用する必要があります。

**オプション1: Prisma DB Push（推奨 - 初回デプロイ時）**

```bash
# スキーマをデータベースに直接適用
heroku run npx prisma db push
```

**オプション2: Prisma Migrate（マイグレーション履歴が必要な場合）**

```bash
# マイグレーションを実行
heroku run npx prisma migrate deploy
```

**注意**: 初回デプロイの場合は`prisma db push`を推奨します。これにより、マイグレーション履歴なしでスキーマを直接適用できます。

### 9. アプリを開く

```bash
heroku open
```

### 10. 初回ユーザーの作成

アプリを開いたら、`/register`にアクセスして初回ユーザーを作成してください。

## トラブルシューティング

### ログの確認

```bash
# リアルタイムでログを確認
heroku logs --tail

# 最近のログを確認
heroku logs --tail --num 200
```

### データベース接続エラー

DATABASE_URLが正しく設定されているか確認：

```bash
heroku config:get DATABASE_URL
```

### ビルドエラー

```bash
# ビルドログを確認
heroku logs --tail

# アプリを再起動
heroku restart
```

### Prismaマイグレーションエラー

```bash
# スキーマが作成されているか確認
heroku pg:psql
\dn

# マイグレーションを手動で実行
heroku run npx prisma migrate deploy

# Prisma Clientを再生成
heroku run npx prisma generate
```

## 環境変数の一覧

| 変数名 | 説明 | 設定方法 |
|--------|------|----------|
| DATABASE_URL | PostgreSQL接続URL | Heroku Postgresアドオンが自動設定 |
| NEXTAUTH_SECRET | NextAuth.jsの秘密鍵 | `openssl rand -base64 32`で生成 |
| NEXTAUTH_URL | アプリケーションのURL | `https://your-app-name.herokuapp.com` |
| NEXT_PUBLIC_APP_URL | 公開URL | `https://your-app-name.herokuapp.com` |
| NODE_ENV | 環境 | `production` |

## スケーリング

### Dynoのスケール

```bash
# Web dynoを1つに設定（無料プランのデフォルト）
heroku ps:scale web=1

# Dynoのステータス確認
heroku ps
```

### データベースのアップグレード

```bash
# 現在のプランを確認
heroku addons

# アップグレード（有料）
heroku addons:upgrade heroku-postgresql:standard-0
```

## メンテナンスモード

```bash
# メンテナンスモードを有効化
heroku maintenance:on

# メンテナンスモードを無効化
heroku maintenance:off
```

## バックアップ

```bash
# 手動バックアップの作成
heroku pg:backups:capture

# バックアップの一覧
heroku pg:backups

# バックアップのダウンロード
heroku pg:backups:download
```

## 追加リソース

- [Heroku Dev Center](https://devcenter.heroku.com/)
- [Heroku PostgreSQL](https://devcenter.heroku.com/articles/heroku-postgresql)
- [Next.js on Heroku](https://nextjs.org/docs/deployment#other-services)
- [Prisma with Heroku](https://www.prisma.io/docs/guides/deployment/deployment-guides/deploying-to-heroku)

## サポート

問題が発生した場合は、以下を確認してください：
1. `heroku logs --tail` でエラーログを確認
2. 環境変数が正しく設定されているか確認
3. データベーススキーマが作成されているか確認
4. Prismaマイグレーションが正常に実行されたか確認

# 予算配分システム

階層的な商品マスタに対して予算を配分し、各SKUの発注数量を算出するWebアプリケーション

## 技術スタック

- **フロントエンド**: Next.js 15, TypeScript, Tailwind CSS
- **バックエンド**: Next.js API Routes, Prisma ORM
- **データベース**: PostgreSQL
- **認証**: NextAuth.js
- **その他**: Zod (バリデーション), PapaParse (CSV処理)

## セットアップ

### 1. 依存関係のインストール

```bash
npm install
```

### 2. 環境変数の設定

`.env.example` を `.env` にコピーして、データベース接続情報を設定してください。

```bash
cp .env.example .env
```

`.env` ファイルを編集：

```env
DATABASE_URL="postgresql://user:password@localhost:5432/budget_allocation?schema=public"
NEXTAUTH_SECRET="your-secret-key-here"
NEXTAUTH_URL="http://localhost:3000"
```

### 3. データベースのセットアップ

Prismaマイグレーションを実行してデータベースのテーブルを作成します。

```bash
npx prisma migrate dev --name init
npx prisma generate
```

### 4. 開発サーバーの起動

```bash
npm run dev
```

ブラウザで http://localhost:3000 を開いてください。

## 主要機能

### Phase 1: MVP

- [x] ユーザー認証 (登録・ログイン)
- [x] カテゴリ・セッション管理
- [x] CSV取り込み (階層自動認識)
- [x] 予算配分 (Level 1, 2対応)
- [x] 数量計算
- [x] CSVエクスポート

### Phase 2: 今後の拡張予定

- [ ] 動的階層対応 (Level 3+)
- [ ] 履歴管理
- [ ] セッション間比較機能
- [ ] 権限管理
- [ ] リアルタイム共同編集
- [ ] 承認ワークフロー
- [ ] ダッシュボード・分析

## CSVフォーマット

### 必須カラム

- `sku_code`: SKU識別コード
- `unitprice`: 単価

### 階層カラム (可変)

`sku_code` と `unitprice` 以外のカラムは自動的に階層として認識されます。

### サンプルCSV

```csv
category,raw_materials,launch_year,item_name,size,color,sku_code,unitprice
SLEEPマットレス,ポリエステル,2023SS,商品A,S,ホワイト,100001,30000
SLEEPマットレス,ポリエステル,2023SS,商品A,S,ブラック,100002,30000
SLEEPマットレス,ウレタン,2023SS,商品B,M,グレー,100003,35000
SLEEP枕,ポリエステル,2024AW,商品C,なし,ホワイト,200001,5000
```

## プロジェクト構造

```
budget-allocation-system/
├── prisma/
│   └── schema.prisma          # データベーススキーマ
├── src/
│   ├── app/
│   │   ├── api/               # APIエンドポイント
│   │   ├── dashboard/         # ダッシュボード画面
│   │   ├── login/             # ログイン画面
│   │   ├── register/          # 登録画面
│   │   └── layout.tsx         # ルートレイアウト
│   ├── components/            # 共有コンポーネント
│   ├── lib/                   # ユーティリティ
│   └── types/                 # TypeScript型定義
├── package.json
├── tsconfig.json
└── README.md
```

## デプロイ

### Vercelへのデプロイ

1. GitHubリポジトリと連携
2. Vercelでプロジェクトをインポート
3. 環境変数を設定
4. データベース接続 (Neon/Supabaseなど)
5. デプロイ

## ライセンス

MIT

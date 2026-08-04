# MyTodo

Todoist の代わりに使う個人用のシンプルな Todo アプリ。プロジェクト数は無制限。
Cloudflare Pages + Pages Functions + D1 で無料枠内で運用できます。

## 機能

- **タスク**: タイトル・期限(任意)・完了チェック・削除
- **プロジェクト**: 無制限に作成可能。削除すると中のタスクも削除
- **ビュー**: インボックス(プロジェクト未所属)/ 今日(期限が今日以前)/ プロジェクト別
- 完了済みタスクの表示切り替え

## 技術構成

| レイヤー | 技術 |
| --- | --- |
| フロントエンド | Vite + React + TypeScript (SPA) |
| API | Cloudflare Pages Functions + Hono (`functions/api/[[route]].ts`) |
| DB | Cloudflare D1 (SQLite) |
| ローカル開発 | Vite dev サーバー + `wrangler pages dev`(D1 をローカルエミュレート) |

## セットアップ

```bash
npm install
npm run db:migrate:local   # ローカル D1 にスキーマを適用
```

## ローカル開発

```bash
npm run dev
```

- http://localhost:5173 を開く(Vite dev サーバー、HMR あり)
- `/api/*` へのリクエストは `wrangler pages dev`(ポート 8788)にプロキシされ、
  ローカル D1(`.wrangler/state/` 配下の SQLite)に保存されます

## デプロイ(Cloudflare Pages + D1)

初回のみ:

```bash
# 1. Cloudflare にログイン
npx wrangler login

# 2. D1 データベースを作成
npx wrangler d1 create mytodo-db
# 出力された database_id を wrangler.toml の database_id に貼り付ける

# 3. 本番 D1 にスキーマを適用
npm run db:migrate:remote
```

デプロイ(初回はプロジェクト作成の確認プロンプトが出ます):

```bash
npm run deploy
```

以降、スキーマ変更時は `migrations/` に連番の SQL を追加して
`npm run db:migrate:local` / `npm run db:migrate:remote` を実行してください。

### 無料枠の目安(個人利用なら十分)

- Pages: 500 ビルド/月、静的配信は無制限
- Pages Functions: 10 万リクエスト/日
- D1: 5GB ストレージ、500 万行読み取り/日、10 万行書き込み/日

### アクセス制限(推奨)

このアプリには認証がないため、デプロイした URL を知っていれば誰でも使えます。
個人利用なら **Cloudflare Access**(Zero Trust、50 ユーザーまで無料)で保護するのが簡単です:

1. Cloudflare ダッシュボード → Zero Trust → Access → Applications
2. 「Self-hosted」で Pages のドメイン(`*.pages.dev` またはカスタムドメイン)を追加
3. 自分のメールアドレスだけ許可するポリシーを設定(One-time PIN でログイン)

## API

| メソッド | パス | 説明 |
| --- | --- | --- |
| GET | `/api/projects` | プロジェクト一覧 |
| POST | `/api/projects` | 作成 `{name}` |
| DELETE | `/api/projects/:id` | 削除(タスクも削除) |
| GET | `/api/tasks` | タスク一覧 |
| POST | `/api/tasks` | 作成 `{title, project_id?, due_date?}` |
| PATCH | `/api/tasks/:id` | 更新 `{title?, project_id?, due_date?, completed?}` |
| DELETE | `/api/tasks/:id` | 削除 |

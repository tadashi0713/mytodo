# MyTodo

Todoist の代わりに使う個人用のシンプルな Todo アプリ。プロジェクト数は無制限。
Cloudflare Pages + Pages Functions + D1 で無料枠内で運用できます。

## 機能

- **タスク**: タイトル・説明(任意)・期限(任意)・完了チェック・削除。タスクをクリックでタイトルと説明を編集
- **プロジェクト**: 無制限に作成可能。削除すると中のタスクも削除
- **ビュー**: インボックス(プロジェクト未所属)/ 今日(期限が今日以前)/ プロジェクト別
- 完了済みタスクの表示切り替え
- **PWA 対応**: スマホの「ホーム画面に追加」でアプリとして起動可能。ダークモード対応(OS 設定に追従)

## 技術構成

| レイヤー | 技術 |
| --- | --- |
| フロントエンド | Vite + React + TypeScript (SPA) + vite-plugin-pwa |
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

## アクセス制限(Cloudflare Access)

**Cloudflare Access**(Zero Trust、50 ユーザーまで無料)でアプリ全体を保護できます。
アプリ側にも Access の JWT を検証するミドルウェアを実装済みで、環境変数を設定すると
API が Access を通らないリクエストを拒否します(エッジ設定の不備に対する二重防御)。

### 1. Zero Trust で Access アプリケーションを作成

1. [Cloudflare ダッシュボード](https://dash.cloudflare.com) → **Zero Trust**
   (初回はチーム名を決める。プランは Free で OK)
2. **Access → Applications → Add an application → Self-hosted**
3. Application domain に Pages のドメインを設定:
   - 本番: `mytodo.pages.dev`(カスタムドメインがあればそれも追加)
   - プレビューデプロイも守る場合: `*.mytodo.pages.dev` を追加
4. ポリシーを作成: Action = **Allow**、Include = **Emails** で自分のメールアドレスだけを指定
   (ログイン方法はデフォルトの **One-time PIN**(メールで届くコード)が手軽)
5. 作成後、アプリケーションの Overview から **Application Audience (AUD) タグ**をコピー

> スマホ(PWA)で毎回ログインさせられないように、アプリケーションの
> **Session Duration** を長め(例: 1 month)にしておくのがおすすめです。

### 2. アプリ側の JWT 検証を有効化

`wrangler.toml` の `[vars]` のコメントを外して設定:

```toml
[vars]
CF_ACCESS_TEAM_DOMAIN = "<チーム名>.cloudflareaccess.com"
CF_ACCESS_AUD = "<コピーした AUD タグ>"
```

再デプロイすれば反映されます:

```bash
npm run deploy
```

- 環境変数が未設定の場合、JWT 検証はスキップされます(ローカル開発はそのまま動く)
- ローカルで検証の動作を試す場合は `.dev.vars`(gitignore 済み)に同じ 2 変数を書いてください

## PWA について

- ビルド時に `vite-plugin-pwa`(Workbox)が Service Worker と `manifest.webmanifest` を生成します
- 静的アセットはプリキャッシュされ、`/api` の GET はネットワーク優先(オフライン時は最後に取得した内容を表示)
- アイコンは `public/` 配下(192 / 512 / maskable / apple-touch-icon)
- スマホでの追加方法: iOS Safari は「共有 → ホーム画面に追加」、Android Chrome は「インストール」バナーまたはメニューから
- Service Worker は本番ビルドでのみ有効です(`npm run preview` で確認可能)

## API

| メソッド | パス | 説明 |
| --- | --- | --- |
| GET | `/api/projects` | プロジェクト一覧 |
| POST | `/api/projects` | 作成 `{name}` |
| DELETE | `/api/projects/:id` | 削除(タスクも削除) |
| GET | `/api/tasks` | タスク一覧 |
| POST | `/api/tasks` | 作成 `{title, description?, project_id?, due_date?}` |
| PATCH | `/api/tasks/:id` | 更新 `{title?, description?, project_id?, due_date?, completed?}` |
| DELETE | `/api/tasks/:id` | 削除 |

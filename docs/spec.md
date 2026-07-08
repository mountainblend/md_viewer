# ソフトウェア仕様書

## 1. 本書の位置づけ

本書は、Markdown Vaultアプリ ビューアー版の実現方法（技術構成・画面仕様）をまとめたソフトウェア仕様書である。「何を実現するか」については [requirements.md](requirements.md)（要求仕様書）を参照する。

## 2. システム構成

```
app/md-vault_viewer/
  docs/       設計メモ・ドキュメント置き場（本書はここ）
  nextjs_f/   Next.js (TypeScript, App Router, Tailwind CSS v4) — 唯一の実行単位
```

- バックエンドを持たない。`nextjs_f`単体で完結する静的サイト（`output: "export"`）
- Vaultの実データはブラウザ内（File System Access API経由）で直接読み取るのみで、いかなるサーバー・APIエンドポイントにも送信しない
- 認証機能を持たない（[要求仕様書 N-02](requirements.md#6-非機能要求)参照）

## 3. 技術スタック

- Next.js（TypeScript, App Router）/ Tailwind CSS v4
- Markdownレンダリング: `react-markdown` + `remark-gfm`（既存2アプリと同じ構成）
- ローカルファイルアクセス: ブラウザ標準の File System Access API（追加ライブラリなし）
- Vaultハンドルの永続化: 生のIndexedDB API（追加ライブラリなし）

## 4. 主要モジュール（`nextjs_f/src/`）

| ファイル | 役割 |
| --- | --- |
| `types/file-system-access.d.ts` | TypeScript標準ライブラリに未収録のFile System Access API型（`showDirectoryPicker`、`queryPermission`/`requestPermission`、`FileSystemDirectoryHandle`の非同期イテレータ等）を補うアンビエント型定義 |
| `lib/fsAccess.ts` | `pickVaultDirectory()`（フォルダ選択）、`verifyPermission()`（権限確認/要求）、`walkMarkdownFiles()`（`.md`ファイルの再帰列挙、`.`始まりのフォルダ・ファイルは除外）、`resolveRelativePath()`（Markdown内の相対パスをVaultルートから解決） |
| `lib/vaultHandleStore.ts` | `FileSystemDirectoryHandle`をIndexedDBに保存・復元する薄いラッパー（structured clone可能なハンドルをそのまま保存） |
| `components/FileTree.tsx` | フラットな`{path}[]`からフォルダ階層のツリーを構築・表示。フォルダは初期状態ですべて折りたたみ、クリックで開閉。Vault切り替え時は全フォルダを畳んだ状態にリセット |
| `components/MarkdownViewer.tsx` | 選択中ファイルの内容を取得しfrontmatterを除去して`react-markdown`で描画。画像（`img`）はカスタムレンダラーで相対パスを解決し、`getFile()`で取得したBlobを`URL.createObjectURL()`でオブジェクトURL化して表示。ファイル切り替え時に前のオブジェクトURLを`revokeObjectURL()`で解放 |
| `app/page.tsx` | 全体を統合。初回マウント時にIndexedDBからハンドル復元→サイレント権限確認→自動読み込み。未対応ブラウザ・未選択時の案内表示、サイドバー（ファイルツリー）＋メインエリア（Markdown表示）の2ペインレイアウト |

## 5. 画面構成

```
┌──────────────┬─────────────────────────────┐
│ サイドバー    │ メインエリア                  │
│ (ファイル一覧) │ (Markdown表示)                │
└──────────────┴─────────────────────────────┘
```

- Vault未選択時・File System Access API非対応時は、2ペインではなく中央にメッセージ＋操作を表示する単一画面になる
- 検索・ダークモード切り替え・レイアウト調整UIは持たない（[要求仕様書 8章](requirements.md#8-スコープ外本アプリで対応しないこと)参照）。ダークモードの配色自体はTailwindの`dark:`（`prefers-color-scheme`ベース）でOS設定に自動追従する

## 6. File System Access APIの利用方法

1. 「フォルダを選択」ボタン押下 → `window.showDirectoryPicker({ mode: "read" })` でVaultフォルダの`FileSystemDirectoryHandle`を取得
2. `handle.queryPermission({ mode: "read" })` で権限を確認し、未許可なら`requestPermission()`で確認ダイアログを表示
3. `walkMarkdownFiles()`が`entries()`（非同期イテレータ）で再帰的にディレクトリをたどり、`.md`ファイルを列挙する。`.`始まりのフォルダ・ファイルは列挙対象から除外する（既存バックエンドの除外ルールを踏襲）
4. ファイル選択時は`FileSystemFileHandle.getFile()`→`File.text()`でMarkdown本文を取得する
5. 画像等の相対パス参照は、参照元ファイルのパスを基点に`getDirectoryHandle()`/`getFileHandle()`をたどって解決し、`getFile()`で取得したBlobをオブジェクトURL化して表示する

## 7. IndexedDBによる権限永続化

- `FileSystemDirectoryHandle`はstructured clone可能なオブジェクトであるため、IndexedDBにそのまま保存・取得できる（シリアライズ処理不要）
- DB名`md-vault-viewer`、単一のobject store（`vault-handle`）に直近選択したVaultのハンドルのみを保持する（複数Vaultの同時保持はスコープ外）
- ページ読み込み時、保存済みハンドルがあれば`queryPermission()`でサイレントに権限確認する。ブラウザの仕様上、ユーザー操作を伴わない`requestPermission()`は許可ダイアログを表示できないため、未許可の場合は改めて「フォルダを選択」を促す

## 8. 既知の制約

- File System Access APIはChrome・Edge等Chromium系ブラウザのみ対応。Firefox・Safariでは「フォルダを選択」ボタンの代わりに非対応の案内を表示する
- 検索・編集・保存・画像アップロード・ダークモード切り替えUI・レイアウト調整は未実装（[要求仕様書 8章](requirements.md#8-スコープ外本アプリで対応しないこと)参照）
- 複数Vaultの同時管理・切り替えUIは持たない。別のVaultを見るには都度「フォルダを選択」から選び直す
- Obsidianの`[[wikilink]]`記法はプレビューで通常のテキストとして表示される（リンクとしては機能しない）
- 自動テスト（Playwright等）は未導入。実装時の動作確認はPlaywrightによる手動起動スクリプトで実施した

## 9. 開発・動作確認

`nextjs_f/`で`npm run dev`（開発時）または`npm run build`（`output: "export"`による静的ビルド、`out/`に出力）。デプロイ手順（Vercel等への公開）は別途取り決める。

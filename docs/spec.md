# ソフトウェア仕様書

## 1. 本書の位置づけ

本書は、Markdown Viewerの実現方法（技術構成・画面仕様）をまとめたソフトウェア仕様書である。「何を実現するか」については [requirements.md](requirements.md)（要求仕様書）を参照する。

## 2. システム構成

```
app/md-viewer/
  docs/       設計メモ・ドキュメント置き場（本書はここ）
  nextjs_f/   Next.js (TypeScript, App Router, Tailwind CSS v4) — 唯一の実行単位
```

- バックエンドを持たない。`nextjs_f`単体で完結する静的サイト（`output: "export"`）
- フォルダの実データはブラウザ内（File System Access API経由）で直接読み取るのみで、いかなるサーバー・APIエンドポイントにも送信しない
- 認証機能を持たない（[要求仕様書 N-02](requirements.md#6-非機能要求)参照）

## 3. 技術スタック

- Next.js（TypeScript, App Router）/ Tailwind CSS v4
- Markdownレンダリング: `react-markdown` + `remark-gfm`（既存2アプリと同じ構成）
- ローカルファイルアクセス: ブラウザ標準の File System Access API（追加ライブラリなし）
- フォルダ選択履歴・設定の永続化: 生のIndexedDB API・`localStorage`（追加ライブラリなし）

## 4. 主要モジュール（`nextjs_f/src/`）

| ファイル | 役割 |
| --- | --- |
| `types/file-system-access.d.ts` | TypeScript標準ライブラリに未収録のFile System Access API型（`showDirectoryPicker`、`queryPermission`/`requestPermission`、`FileSystemDirectoryHandle`の非同期イテレータ等）を補うアンビエント型定義 |
| `lib/fsAccess.ts` | `pickFolder()`（フォルダ選択）、`verifyPermission()`（権限確認/要求）、`walkMarkdownFiles()`（`.md`ファイルの再帰列挙、`.`始まりのフォルダ・ファイルは除外）、`resolveRelativePath()`（Markdown内の相対パスをフォルダルートから解決） |
| `lib/folderStore.ts` | 複数フォルダの選択履歴をIndexedDBで管理。`listFolders()` / `addFolder()` / `touchFolder()` / `removeFolder()` / `getActiveFolderId()` / `setActiveFolderId()` |
| `lib/searchIndex.ts` | `buildContentCache()`（各ファイルの本文をバックグラウンドで並行読み込みしキャッシュ、`AbortSignal`で中断可能）、`searchEntries()`（ファイル名・キャッシュ済み本文を対象にした部分一致検索、スニペット生成） |
| `lib/theme.ts` | ダークモードの状態取得・切り替え（`<html>`要素の`dark`クラスと`localStorage`を操作する`useTheme()`フック） |
| `lib/usePersistedState.ts` | `localStorage`に永続化する汎用state管理フック（サイドバー幅・表示/非表示に使用） |
| `components/FileTree.tsx` | フラットな`{path}[]`からフォルダ階層のツリーを構築・表示。フォルダは初期状態ですべて折りたたみ、クリックで開閉。フォルダ切り替え時は全フォルダを畳んだ状態にリセット |
| `components/FolderPicker.tsx` | 選択履歴のあるフォルダ一覧＋追加/削除UI。フォルダ未選択時の全画面表示と、サイドバーのドロップダウン表示の2箇所で共用 |
| `components/SearchPanel.tsx` | 検索ボックス（300msデバウンス）＋検索結果リスト（ファイル名＋本文スニペット、`<mark>`ハイライト）。クエリが空の時は`FileTree`をそのまま表示する |
| `components/MarkdownViewer.tsx` | 選択中ファイルの内容を取得しfrontmatterを除去して`react-markdown`で描画。画像（`img`）はカスタムレンダラーで相対パスを解決し、`getFile()`で取得したBlobを`URL.createObjectURL()`でオブジェクトURL化して表示。読み込んだ本文は`onContentLoaded`コールバックで検索キャッシュにも渡し、二重読み込みを避ける |
| `app/page.tsx` | 全体を統合。初回マウント時にIndexedDBの選択履歴から直近フォルダをサイレントに復元。フォルダ切り替え・検索インデックス作成・ダークモード・サイドバーのリサイズ/表示切替を統括する |

## 5. 画面構成

```
┌──────────────┬─────────────────────────────┐
│ サイドバー    │ メインエリア                  │
│ (検索/ファイル一覧) │ (Markdown表示)          │
└──────────────┴─────────────────────────────┘
```

- フォルダ未選択時・File System Access API非対応時は、2ペインではなく中央にメッセージ＋操作を表示する単一画面になる
- サイドバー上部にフォルダ名（クリックでフォルダ切り替えドロップダウン）、ダークモード切り替えボタン、サイドバー非表示ボタンを配置
- サイドバーとメインエリアの間に幅4pxのドラッグハンドルがあり、幅200〜480pxの範囲でリサイズできる
- サイドバー非表示時は、メインエリア左上に再表示ボタンが現れる

## 6. File System Access APIの利用方法

1. 「＋ 新しいフォルダを追加」押下 → `window.showDirectoryPicker({ mode: "read" })` でフォルダの`FileSystemDirectoryHandle`を取得
2. `handle.queryPermission({ mode: "read" })` で権限を確認し、未許可なら`requestPermission()`で確認ダイアログを表示
3. `walkMarkdownFiles()`が`entries()`（非同期イテレータ）で再帰的にディレクトリをたどり、`.md`ファイルを列挙する。`.`始まりのフォルダ・ファイルは列挙対象から除外する（既存バックエンドの除外ルールを踏襲）
4. ファイル選択時は`FileSystemFileHandle.getFile()`→`File.text()`でMarkdown本文を取得する
5. 画像等の相対パス参照は、参照元ファイルのパスを基点に`getDirectoryHandle()`/`getFileHandle()`をたどって解決し、`getFile()`で取得したBlobをオブジェクトURL化して表示する

## 7. 複数フォルダ管理・IndexedDBスキーマ

- `FileSystemDirectoryHandle`はstructured clone可能なオブジェクトであるため、IndexedDBにそのまま保存・取得できる（シリアライズ処理不要）
- DB名`md-vault-viewer`、`DB_VERSION 2`。object store `folders`（`keyPath: "id"`、`{ id, name, handle, lastOpenedAt }`）と`meta`（キーバリュー、`activeFolderId`を保持）を持つ
- ページ読み込み時、選択履歴の中から`activeFolderId`（無ければ最も新しく開いたフォルダ）を`queryPermission()`でサイレントに権限確認する。ブラウザの仕様上、ユーザー操作を伴わない`requestPermission()`は許可ダイアログを表示できないため、未許可の場合は改めてフォルダ選択画面を表示する
- サイドバーのフォルダ名クリック、または未選択時の画面から、選択履歴にある他のフォルダへ切り替えられる（クリックはユーザー操作扱いのため`requestPermission()`で許可ダイアログを表示できる）
- 履歴からの削除はIndexedDB上の記録を消すのみで、実フォルダやその中身には一切影響しない

## 8. 検索の仕組み

- フォルダの読み込みが完了すると、`buildContentCache()`が最大6並行でファイル本文をバックグラウンド読み込みし、`Map<path, content>`に蓄積する。フォルダを切り替えた場合は`AbortController`で前回のインデックス作成を中断する
- ファイル名検索は常に全ファイルが対象。本文検索はキャッシュに読み込み済みのファイルのみが対象となり、インデックス作成の進行とともに検索結果が増えていく（未完了の間はサイドバーに「本文を検索用に読み込み中…」を表示）
- `MarkdownViewer`が本文表示のために読み込んだファイルも同じキャッシュに反映されるため、閲覧済みファイルは即座に本文検索の対象になる
- 検索は大文字小文字を区別しない部分一致。本文マッチはヒット箇所の前後をスニペットとして抜粋し、該当語句を`<mark>`でハイライトする

## 9. ダークモード

- `globals.css`でTailwind v4のカスタムバリアント`@custom-variant dark (&:where(.dark, .dark *));`を定義し、`prefers-color-scheme`ではなく`<html>`要素の`dark`クラスで`dark:`ユーティリティを制御する
- `layout.tsx`の`<body>`直下にちらつき防止のインラインscriptを配置。`localStorage`の`theme`キー（`light`/`dark`）→未設定ならOSの`prefers-color-scheme`の順に判定し、ペイント前に`dark`クラスを付与する
- 切り替えボタンは`<html>`のクラス付け外しと`localStorage`への保存を行う（`lib/theme.ts`の`useTheme()`）

## 10. サイドバーのレイアウト調整

- `lib/usePersistedState.ts`により、`sidebarWidth`（px、200〜480でclamp）・`sidebarHidden`（真偽値）を`localStorage`に永続化する
- サイドバー幅はサイドバーとメインエリアの間のドラッグハンドルを`pointerdown`/`pointermove`/`pointerup`でドラッグして変更する

## 11. 既知の制約

- File System Access APIはChrome・Edge等Chromium系ブラウザのみ対応。Firefox・Safariでは「フォルダを選択」ボタンの代わりに非対応の案内を表示する
- 編集・保存・画像アップロード・認証機能は未実装（[要求仕様書 8章](requirements.md#8-スコープ外本アプリで対応しないこと)参照）
- Obsidianの`[[wikilink]]`記法はプレビューで通常のテキストとして表示される（リンクとしては機能しない）
- 自動テスト（Playwright等）は未導入。実装時の動作確認はPlaywrightによる手動起動スクリプトで実施した

## 12. 開発・動作確認

`nextjs_f/`で`npm run dev`（開発時）または`npm run build`（`output: "export"`による静的ビルド、`out/`に出力）。公開先は Vercel（`https://md-vault-viewer.vercel.app`）。

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
- フォルダの実データはブラウザ内（File System Access API経由）で直接読み書きするのみで、いかなるサーバー・APIエンドポイントにも送信しない（保存もローカルディスクへの直接書き込み）
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
| `lib/fsAccess.ts` | `pickFolder()`（フォルダ選択）、`verifyPermission()`（権限確認/要求）、`walkMarkdownFiles()`（`.md`ファイルの再帰列挙、`.`始まりのフォルダ・ファイルは除外）、`resolveRelativePath()`（Markdown内の相対パスをフォルダルートから解決）、`saveAttachment()`（画像をフォルダルート直下`attachments/`に保存し、同名衝突を避けつつ挿入用パスを返す） |
| `lib/folderStore.ts` | 複数フォルダの選択履歴をIndexedDBで管理。`listFolders()` / `addFolder()` / `touchFolder()` / `removeFolder()` / `getActiveFolderId()` / `setActiveFolderId()` |
| `lib/searchIndex.ts` | `buildContentCache()`（各ファイルの本文をバックグラウンドで並行読み込みしキャッシュ、`AbortSignal`で中断可能）、`searchEntries()`（ファイル名・キャッシュ済み本文を対象にした部分一致検索、スニペット生成） |
| `lib/theme.ts` | ダークモードの状態取得・切り替え（`<html>`要素の`dark`クラスと`localStorage`を操作する`useTheme()`フック） |
| `lib/usePersistedState.ts` | `localStorage`に永続化する汎用state管理フック（サイドバー幅・表示/非表示、表示モード・分割比率・入替・スクロール同期に使用） |
| `components/FileTree.tsx` | フラットな`{path}[]`からフォルダ階層のツリーを構築・表示。フォルダは初期状態ですべて折りたたみ、クリックで開閉。フォルダ切り替え時は全フォルダを畳んだ状態にリセット |
| `components/FolderPicker.tsx` | 選択履歴のあるフォルダ一覧＋追加/削除UI。フォルダ未選択時の全画面表示と、サイドバーのドロップダウン表示の2箇所で共用 |
| `components/SearchPanel.tsx` | 検索ボックス（300msデバウンス）＋検索結果リスト（ファイル名＋本文スニペット、`<mark>`ハイライト）。クエリが空の時は`FileTree`をそのまま表示する |
| `components/MarkdownEditor.tsx` | 選択中ファイルの閲覧・編集を担当。生テキスト（frontmatter込み）をテキストエリアで保持し、プレビューのみfrontmatterを除去して`react-markdown`で描画。画像（`img`）はカスタムレンダラーで相対パスを解決し`URL.createObjectURL()`で表示。表示モード（編集/両方/プレビュー）・分割比率・左右入替・スクロール同期・保存（`createWritable()`）・画像添付（`saveAttachment()`→カーソル位置に挿入）を持つ。読み込み・保存した本文は`onContentLoaded`コールバックで検索キャッシュにも渡す |
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

1. 「＋ 新しいフォルダを追加」押下 → `window.showDirectoryPicker({ mode: "readwrite" })` でフォルダの`FileSystemDirectoryHandle`を取得（編集・保存に対応するため読み書き権限を要求する）
2. `handle.queryPermission({ mode: "readwrite" })` で権限を確認し、未許可なら`requestPermission()`で確認ダイアログを表示
3. `walkMarkdownFiles()`が`entries()`（非同期イテレータ）で再帰的にディレクトリをたどり、`.md`ファイルを列挙する。`.`始まりのフォルダ・ファイルは列挙対象から除外する（既存バックエンドの除外ルールを踏襲）
4. ファイル選択時は`FileSystemFileHandle.getFile()`→`File.text()`でMarkdown本文を取得する
5. 画像等の相対パス参照は、参照元ファイルのパスを基点に`getDirectoryHandle()`/`getFileHandle()`をたどって解決し、`getFile()`で取得したBlobをオブジェクトURL化して表示する
6. 保存時は`entry.handle.createWritable()`でストリームを取得し、`write(editedContent)`→`close()`でファイル全体を上書きする（生テキストをそのまま書き込むため、frontmatter・改行コードを一切変換・加工しない）

> `readwrite`への変更により、以前に`read`権限のみで許可・保存されていたフォルダは、次回アクセス時に権限確認が`"granted"`を返さなくなる。この場合はフォルダ選択画面に戻り、改めて許可し直す必要がある（一度きりの移行）。

## 7. 複数フォルダ管理・IndexedDBスキーマ

- `FileSystemDirectoryHandle`はstructured clone可能なオブジェクトであるため、IndexedDBにそのまま保存・取得できる（シリアライズ処理不要）
- DB名`md-vault-viewer`、`DB_VERSION 2`。object store `folders`（`keyPath: "id"`、`{ id, name, handle, lastOpenedAt }`）と`meta`（キーバリュー、`activeFolderId`を保持）を持つ
- ページ読み込み時、選択履歴の中から`activeFolderId`（無ければ最も新しく開いたフォルダ）を`queryPermission()`でサイレントに権限確認する。ブラウザの仕様上、ユーザー操作を伴わない`requestPermission()`は許可ダイアログを表示できないため、未許可の場合は改めてフォルダ選択画面を表示する
- サイドバーのフォルダ名クリック、または未選択時の画面から、選択履歴にある他のフォルダへ切り替えられる（クリックはユーザー操作扱いのため`requestPermission()`で許可ダイアログを表示できる）
- 履歴からの削除（手動の「×」・自動削除とも）はIndexedDB上の記録を消すのみで、実フォルダやその中身には一切影響しない
- 選択履歴は最大3件まで（`MAX_FOLDERS`）。上限を超えて追加すると、直近追加分を除いて`lastOpenedAt`が最も古いものから自動的に削除される（LRU）
- 30日間（`STALE_MS`）開かれていないフォルダは、`listFolders()`呼び出し時（起動時・一覧更新時）に自動的に削除される。削除されるのは履歴の記録のみで、実フォルダには影響しない

## 8. 検索の仕組み

- フォルダの読み込みが完了すると、`buildContentCache()`が最大6並行でファイル本文をバックグラウンド読み込みし、`Map<path, content>`に蓄積する。フォルダを切り替えた場合は`AbortController`で前回のインデックス作成を中断する
- ファイル名検索は常に全ファイルが対象。本文検索はキャッシュに読み込み済みのファイルのみが対象となり、インデックス作成の進行とともに検索結果が増えていく（未完了の間はサイドバーに「本文を検索用に読み込み中…」を表示）
- `MarkdownEditor`が本文表示・保存のために読み込んだ／書き込んだファイルも同じキャッシュに反映されるため、閲覧・編集済みファイルは即座に本文検索の対象になる（保存すると編集後の内容で検索できるようになる）
- 検索は大文字小文字を区別しない部分一致。本文マッチはヒット箇所の前後をスニペットとして抜粋し、該当語句を`<mark>`でハイライトする

## 9. ダークモード

- `globals.css`でTailwind v4のカスタムバリアント`@custom-variant dark (&:where(.dark, .dark *));`を定義し、`prefers-color-scheme`ではなく`<html>`要素の`dark`クラスで`dark:`ユーティリティを制御する
- `layout.tsx`の`<body>`直下にちらつき防止のインラインscriptを配置。`localStorage`の`theme`キー（`light`/`dark`）→未設定ならOSの`prefers-color-scheme`の順に判定し、ペイント前に`dark`クラスを付与する
- 切り替えボタンは`<html>`のクラス付け外しと`localStorage`への保存を行う（`lib/theme.ts`の`useTheme()`）

## 10. サイドバーのレイアウト調整

- `lib/usePersistedState.ts`により、`sidebarWidth`（px、200〜480でclamp）・`sidebarHidden`（真偽値）を`localStorage`に永続化する
- サイドバー幅はサイドバーとメインエリアの間のドラッグハンドルを`pointerdown`/`pointermove`/`pointerup`でドラッグして変更する

## 11. 編集機能

- `MarkdownEditor.tsx`がファイルごとの`savedContent`（保存済み内容）と`editedContent`（編集中内容）を保持し、`savedContent !== editedContent`で未保存の変更を判定する。ツールバーの保存ボタンは未保存の変更がある時だけ活性化する
- 表示モード（`viewMode`: `edit` / `both` / `preview`）・分割比率（`editorRatio`、0.2〜0.8）・編集/プレビューの左右入替（`paneSwapped`）・スクロール同期ON/OFF（`scrollSync`）は`usePersistedState`で`localStorage`に永続化し、ファイルを切り替えても維持される
- 分割比率のドラッグハンドルは、サイドバー幅リサイズと同じ`pointerdown`/`pointermove`/`pointerup` + `setPointerCapture`方式。入替時は比率の計算基準を反転させる
- スクロール同期は、スクロール元の`(scrollTop) / (scrollHeight - clientHeight)`比率を計算し、相手側の同じ比率の位置へ反映する。`isSyncScrollingRef`で同期処理自体が再度スクロールイベントを発火させて無限ループになるのを防ぐ
- 保存（`handleSave`）は`entry.handle.createWritable()`→`write(editedContent)`→`close()`。成功したら`savedContent`を更新し、`onContentLoaded`で検索キャッシュも最新化する。保存に失敗した場合は編集内容を保持したままエラーメッセージを表示する

## 12. 画像添付

- ツールバーの「画像を添付」→隠し`<input type="file" accept="image/*">`でファイル選択→`saveAttachment(rootHandle, file)`を呼ぶ
- 保存先はフォルダルート直下の`attachments/`固定（編集中ファイルの場所によらず常に同じ場所）。同名ファイルが既にある場合は`name (1).ext`のように連番を付けて上書きを避ける
- 挿入するMarkdownリンクはフォルダルート相対パス（例: `/attachments/image.png`）。`resolveRelativePath()`は先頭`/`をフォルダルート起点として解釈するため、編集中ファイルがどの階層にあってもプレビュー・保存後の再閲覧の両方で正しく画像が解決される
- アップロード中はボタンを無効化し「アップロード中…」を表示。失敗時はエラーメッセージを表示する

## 13. 既知の制約

- File System Access APIはChrome・Edge等Chromium系ブラウザのみ対応。Firefox・Safariでは「フォルダを選択」ボタンの代わりに非対応の案内を表示する
- 認証機能は未実装（[要求仕様書 8章](requirements.md#8-スコープ外本アプリで対応しないこと)参照）
- Obsidianの`[[wikilink]]`記法はプレビューで通常のテキストとして表示される（リンクとしては機能しない）
- 自動テスト（Playwright等）は未導入。実装時の動作確認はPlaywrightによる手動起動スクリプトで実施した

## 14. 開発・動作確認

`nextjs_f/`で`npm run dev`（開発時）または`npm run build`（`output: "export"`による静的ビルド、`out/`に出力）。公開先は Vercel（`https://md-vault-viewer.vercel.app`）。

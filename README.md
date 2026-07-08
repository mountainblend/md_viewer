# md-viewer

ローカルのMarkdownフォルダ（Obsidian等の保管庫にも対応）を、ブラウザだけで閲覧できる公開Webアプリです。

- 「フォルダを選択」でユーザー自身のPC上のフォルダを選ぶと、ブラウザのFile System Access APIでその場で読み取って表示します
- ファイルの中身は一切サーバーに送信されません（バックエンドを持たない静的サイトです）
- ファイル名・本文の検索、ダークモード切り替え、サイドバー幅調整、複数フォルダの切り替えに対応
- Chrome / Edge など Chromium系ブラウザのみ対応（Firefox / Safariは非対応）

詳細な仕様は [docs/](docs/) を参照してください。

## 開発

```bash
cd nextjs_f
npm install
npm run dev
```

## ビルド（静的エクスポート）

```bash
cd nextjs_f
npm run build
```

`nextjs_f/out/` に静的サイトが出力されます。

# Google AI Studio JSON to Markdown Converter

## 概要

Google AI Studioの会話スレッドのファイル（JSON 形式）から、質問文と回答文のテキストを抽出し、Markdown形式に変換して保存するPythonスクリプトです。

## 会話スレッドから抽出する要素

- ユーザーの質問文
  - タイムスタンプも抽出します。
- AIの回答文
  - AIの思考ログは除外します。
  - 注釈リンクは、Google AI Studioの会話画面と同じ位置に埋め込みます。リンクURLは、リダイレクトページを挟んだまま出力します。

---

## 動作環境

- Python 3.7 以上


## 会話スレッドのダウンロード

- 前提として、Google AI Studioの設定の **AutoSave** または **Save Prompt** などで、会話スレッドが履歴に残っている必要があります。
- Google Driveの「Google AI Studio」フォルダから目的の会話スレッドをダウンロードし、`.json` 拡張子をつけて保存します。


## スクリプトの使い方

### 基本的な使い方

変換対象のファイルパスを指定して実行します。出力ファイルは入力ファイルと同じディレクトリに `.md` 拡張子で保存されます。

```bash
python convert-json-to-md.py path/to/chat.json
```


### 出力ファイルパスを指定する場合

`-o` または `--output` オプションで出力先ファイルを明示的に指定できます。

```bash
python convert-json-to-md.py path/to/chat.json -o path/to/output.md
```

> [!NOTE]
> ファイルパスの引数を指定せずに実行した場合、パスの指定方法を示すエラーメッセージを表示して終了します。

---

## 開発時のAI利用について

このスクリプトはAntigravityでAIを利用して開発し、人力で編集を加えています。

## ライセンス

MIT License

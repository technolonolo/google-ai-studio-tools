# Google AI Studio JSON to Markdown Converter

## 概要

Google AI Studioの会話スレッドのファイル（JSON 形式）を、Markdown形式に変換して保存するPythonスクリプトです。

会話スレッドから以下の要素を抽出します。

- ユーザーの質問（+タイムスタンプ）
- AIの回答

※ AIの思考ログは除外します。
※ 回答内の外部リンクは、リダイレクトページを挟むURLのまま出力します。


## 動作環境

- Python 3.7 以上


## 会話スレッドのダウンロード

Google Driveの「Google AI Studio」フォルダから目的の会話スレッドをダウンロードし、`.json` 拡張子をつけて保存します。


## スクリプトの使い方

### 基本的な使い方

変換対象のファイルパスを指定して実行します。出力ファイルは入力ファイルと同じディレクトリに `.md` 拡張子で保存されます。

```bash
python convert_json_to_md.py path/to/chat.json
```


### 出力ファイルパスを指定する場合

`-o` または `--output` オプションで出力先ファイルを明示的に指定できます。

```bash
python convert_json_to_md.py path/to/chat.json -o path/to/output.md
```

> [!NOTE]
> ファイルパスの引数を指定せずに実行した場合、パスの指定方法を示すエラーメッセージを表示して終了します。

## 開発時のAI利用について

このスクリプトはAntigravityでAIを利用して開発し、一部に人力で編集を加えています。

## ライセンス

MIT License

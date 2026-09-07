# Google AI Studio JSON to Markdown Converter

Google AI Studio の会話スレッドのファイル（JSON 形式）を、Markdown 形式のテキストに変換してファイルに保存する Python スクリプトです。

---

## 動作環境

- Python 3.7 以上

---

## ファイルを用意する

Google Drive の「Google AI Studio」フォルダから、目的の会話スレッドをダウンロードし、`.json` 拡張子をつけて保存します。

---

## スクリプトの使い方

### 基本的な使い方

変換対象の JSON ファイルパスを指定して実行します。出力ファイルは入力ファイルと同じディレクトリに `.md` 拡張子で保存されます。

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

---

## ライセンス

MIT License

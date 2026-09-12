"""
Google AI Studio スレッド JSON -> Markdown 変換スクリプト
"""

import argparse
import json
import sys
from datetime import datetime, timezone, timedelta
from pathlib import Path


def parse_iso_datetime(dt_str: str) -> str:
    """ISO 8601形式の日時文字列をパースし、JST (UTC+9) の日時文字列に整形する。"""
    if not dt_str:
        return "日時不明"
    try:
        # 'Z' 表記の互換性対応
        normalized_str = dt_str.replace("Z", "+00:00")
        dt_utc = datetime.fromisoformat(normalized_str)
        # JST (+9:00) へ変換
        jst = timezone(timedelta(hours=9))
        dt_jst = dt_utc.astimezone(jst)
        return dt_jst.strftime("%Y-%m-%d %H:%M:%S")
    except Exception:
        return dt_str


def is_thought_chunk(chunk: dict) -> bool:
    """チャンクがAIの思考ログ（Thinking）かどうかを判定する。"""
    # チャンク自体の isThought フラグ
    if chunk.get("isThought") is True:
        return True

    # parts 内の thought フラグ
    parts = chunk.get("parts", [])
    if parts and all(isinstance(p, dict) and p.get("thought") is True for p in parts if isinstance(p, dict)):
        return True

    return False


def extract_model_text(chunk: dict) -> str:
    """モデルチャンクから回答テキストを抽出する。"""
    # parts がある場合は thought: False のテキストを結合
    parts = chunk.get("parts", [])
    if parts:
        valid_texts = []
        for p in parts:
            if isinstance(p, dict):
                if not p.get("thought"):
                    valid_texts.append(p.get("text", ""))
            elif isinstance(p, str):
                valid_texts.append(p)
        joined = "".join(valid_texts).strip()
        if joined:
            return joined

    # parts で取得できない場合は chunk の text を使用
    return chunk.get("text", "").strip()


def format_grounding_sources(grounding: dict) -> str:
    """grounding 情報から参照・注釈リンクのリストを生成する。"""
    if not grounding or not isinstance(grounding, dict):
        return ""

    sources = grounding.get("groundingSources", [])
    if not sources:
        return ""

    links = []
    for src in sources:
        ref_num = src.get("referenceNumber")
        title = src.get("title", "リンク").strip()
        uri = src.get("uri", "")

        if uri:
            if ref_num is not None:
                links.append(f"- [{ref_num}] [{title}]({uri})")
            else:
                links.append(f"- [{title}]({uri})")

    if links:
        return "\n\n**参照リンク:**\n" + "\n".join(links)
    return ""


def insert_footnotes(text: str, grounding: dict) -> str:
    """
    grounding.corroborationSegments の UTF-8 バイトオフセット (index) に基づいて、
    本文テキスト中の正確な位置へ URL 付き注釈タグ ([[1](URL)], [[2](URL)] など) を挿入する。
    """
    if not text or not isinstance(grounding, dict):
        return text

    segments = grounding.get("corroborationSegments", [])
    if not segments:
        return text

    # referenceNumber から URL へのマッピングを作成
    ref_to_url = {}
    sources = grounding.get("groundingSources", [])
    for src in sources:
        ref_num = src.get("referenceNumber")
        uri = src.get("uri")
        if ref_num is not None and uri:
            ref_to_url[ref_num] = uri

    # index ごとに (footnoteNumber -> uri) をまとめる
    index_to_footnotes = {}
    for seg in segments:
        idx = seg.get("index")
        fn = seg.get("footnoteNumber")
        uri = seg.get("uri") or ref_to_url.get(fn, "")
        if idx is not None and fn is not None:
            if idx not in index_to_footnotes:
                index_to_footnotes[idx] = {}
            if fn not in index_to_footnotes[idx]:
                index_to_footnotes[idx][fn] = uri

    if not index_to_footnotes:
        return text

    b_text = text.encode("utf-8")
    sorted_indices = sorted(index_to_footnotes.keys())

    result_parts = []
    last_b_idx = 0

    for idx in sorted_indices:
        # 有効範囲内のインデックスであることを確認
        target_idx = min(idx, len(b_text))
        chunk_b = b_text[last_b_idx:target_idx]
        result_parts.append(chunk_b.decode("utf-8", errors="ignore"))

        fns_dict = index_to_footnotes[idx]
        footnote_strs = []
        for fn in sorted(fns_dict.keys()):
            uri = fns_dict[fn]
            if uri:
                footnote_strs.append(f"[[{fn}]({uri})]")
            else:
                footnote_strs.append(f"[{fn}]")

        result_parts.append("".join(footnote_strs))
        last_b_idx = target_idx

    # 残りのテキストを追加
    result_parts.append(b_text[last_b_idx:].decode("utf-8", errors="ignore"))

    return "".join(result_parts)


def convert_json_to_markdown(json_data: dict, file_name: str) -> str:
    """チャットJSONデータをMarkdown形式のテキストに変換する。"""
    chunks = json_data.get("chunkedPrompt", {}).get("chunks", [])
    if not chunks:
        return f"# {file_name}\n\n有効な会話データが見つかりませんでした。\n"

    md_lines = [f"# {file_name}\n"]

    for chunk in chunks:
        role = chunk.get("role")

        if role == "user":
            user_text = chunk.get("text", "").strip()
            create_time_raw = chunk.get("createTime", "")
            formatted_time = parse_iso_datetime(create_time_raw)

            md_lines.append(f"## ユーザー ({formatted_time})")
            md_lines.append(user_text)
            md_lines.append("")  # 空行

        elif role == "model":
            # 思考ログはスキップ
            if is_thought_chunk(chunk):
                continue

            model_text = extract_model_text(chunk)
            if not model_text:
                continue

            grounding = chunk.get("grounding")
            # 本文テキストへ注釈タグ ([1] など) を挿入
            model_text_with_footnotes = insert_footnotes(model_text, grounding)

            grounding_md = format_grounding_sources(grounding)

            md_lines.append("## AI")
            md_lines.append(model_text_with_footnotes + grounding_md)
            md_lines.append("\n---\n")

    return "\n".join(md_lines)


def main():
    parser = argparse.ArgumentParser(
        description="Google AI Studio 会話スレッドのJSONファイルをMarkdownに変換します。"
    )
    parser.add_argument(
        "input_json",
        nargs="?",
        default=None,
        help="入力JSONファイルのパス",
    )
    parser.add_argument(
        "-o",
        "--output",
        default=None,
        help="出力Markdownファイルのパス (未指定の場合は入力ファイルと同じディレクトリに.mdで保存)",
    )

    args = parser.parse_args()

    if not args.input_json:
        print(
            "エラー: 変換対象のJSONファイルパスが指定されていません。\n"
            "使用方法: python convert-json-to-md.py <JSONファイルパス> [-o 出力ファイルパス]",
            file=sys.stderr,
        )
        sys.exit(1)

    input_path = Path(args.input_json)
    if not input_path.exists():
        print(f"エラー: 入力ファイル '{input_path}' が存在しません。", file=sys.stderr)
        sys.exit(1)

    if args.output:
        output_path = Path(args.output)
    else:
        output_path = input_path.with_suffix(".md")

    try:
        with open(input_path, "r", encoding="utf-8") as f:
            data = json.load(f)
    except Exception as e:
        print(f"エラー: JSONファイルの読み込みに失敗しました ({e})", file=sys.stderr)
        sys.exit(1)

    markdown_text = convert_json_to_markdown(data, input_path.stem)

    try:
        output_path.parent.mkdir(parents=True, exist_ok=True)
        with open(output_path, "w", encoding="utf-8") as f:
            f.write(markdown_text)
        print(f"成功: Markdownファイルを保存しました -> {output_path.resolve()}")
    except Exception as e:
        print(f"エラー: Markdownファイルの書き込みに失敗しました ({e})", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()

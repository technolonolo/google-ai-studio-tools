/**
 * Google AI Studio スレッド インポート GAS
 *
 * Google Driveの「Google AI Studio」フォルダ内にある会話スレッドのJSON形式ファイルを読み込み、
 * 整形してスプレッドシートにインポートします。
 */

// --- カスタムメニューの設定 ---
function onOpen() {
  const ui = SpreadsheetApp.getUi();
  ui.createMenu('AIチャットを読み込み')
    .addItem('スレッド名を指定して読み込む', 'importChatThreadPrompt')
    .addToUi();
}

/**
 * ユーザーにスレッド名を入力させるプロンプトを表示
 */
function importChatThreadPrompt() {
  const ui = SpreadsheetApp.getUi();
  const response = ui.prompt(
    'Google AI Studio のスレッド名を指定して読み込む',
    'Google AI Studio から読み込むスレッド名を入力してください:',
    ui.ButtonSet.OK_CANCEL
  );

  if (response.getSelectedButton() === ui.Button.OK) {
    const threadName = response.getResponseText().trim();
    if (!threadName) {
      ui.alert('エラー', 'スレッド名を入力してください。', ui.ButtonSet.OK);
      return;
    }
    processThreadImport(threadName);
  }
}

/**
 * スレッドのインポートメイン処理
 * @param {string} threadName
 */
function processThreadImport(threadName) {
  const ui = SpreadsheetApp.getUi();
  try {
    // 1. ファイルの検索と読み込み
    const result = loadJsonFromDrive(threadName);
    if (result.error === 'FOLDER_NOT_FOUND') {
      ui.alert('エラー', '「Google AI Studio」フォルダが見つかりませんでした。', ui.ButtonSet.OK);
      return;
    }
    if (result.error === 'FILE_NOT_FOUND' || !result.json) {
      ui.alert('エラー', `スレッド「${threadName}」が見つかりませんでした。`, ui.ButtonSet.OK);
      return;
    }

    // 2. チャットデータの抽出と解析
    const parsedTurns = parseChatJson(result.json);
    if (parsedTurns.length === 0) {
      ui.alert('警告', '有効なチャットデータが見つかりませんでした。', ui.ButtonSet.OK);
      return;
    }

    // 3. スプレッドシートへのレンダリング
    const sheetName = result.cleanFileName || threadName;
    renderToSheet(parsedTurns, sheetName);

    ui.alert('完了', `スレッド「${sheetName}」を正常にインポートしました。`, ui.ButtonSet.OK);
  } catch (error) {
    Logger.log(error);
    ui.alert('エラーが発生しました', error.toString(), ui.ButtonSet.OK);
  }
}

/**
 * Google Driveの「Google AI Studio」フォルダからJSONファイルを検索して読み込む
 */
function loadJsonFromDrive(threadName) {
  // 拡張子の補正 (.json がついていなければ追加)
  let targetFileName = threadName;
  let cleanName = threadName;
  if (targetFileName.toLowerCase().endsWith('.json')) {
    cleanName = targetFileName.substring(0, targetFileName.length - 5);
  } else {
    targetFileName = threadName + '.json';
  }

  // 1. 「Google AI Studio」フォルダを検索
  const folderIterator = DriveApp.getFoldersByName('Google AI Studio');
  if (!folderIterator.hasNext()) {
    return { error: 'FOLDER_NOT_FOUND' };
  }

  const targetFolder = folderIterator.next();
  let fileIterator = targetFolder.getFilesByName(targetFileName);
if (!fileIterator.hasNext()) {
  fileIterator = targetFolder.getFilesByName(cleanName);
}
if (fileIterator.hasNext()) {
  const file = fileIterator.next();
  const content = file.getBlob().getDataAsString('UTF-8');
  return {
    json: JSON.parse(content),
    cleanFileName: cleanName
  };
}
return { error: 'FILE_NOT_FOUND' };
}

// 思考ブロックであるかどうかを判断
function isThoughtChunk(chunk) {
  if (chunk.isThought === true) return true;
  const parts = chunk.parts || [];
  if (parts.length > 0 && parts.every(p => typeof p === 'object' && p.thought === true)) {
    return true;
  }
  return false;
}

/**
 * AIモデルの応答テキストを抽出
 */
function extractModelText(chunk) {
  const parts = chunk.parts || [];
  if (parts.length > 0) {
    const validTexts = [];
    parts.forEach(p => {
      if (typeof p === 'object') {
        if (!p.thought) validTexts.push(p.text || '');
      } else if (typeof p === 'string') {
        validTexts.push(p);
      }
    });
    const joined = validTexts.join('').trim();
    if (joined) return joined;
  }
  return (chunk.text || '').trim();
}
function getUtf8ByteLength(str) {
  if (str == null) return 0;
  return Utilities.newBlob(str).getBytes().length;
}
function parseIsoDatetime(dtStr) {
  if (!dtStr) return '日時不明';
  try {
    var normalized = dtStr.replace('Z', '+00:00');
    var date = new Date(normalized);
    return Utilities.formatDate(date, 'Asia/Tokyo', 'yyyy-MM-dd HH:mm:ss');
  } catch (e) {
    return dtStr;
  }
}

/**
 * AI回答のテキストを段落に分割し、UTF-8バイト範囲を計算する
 */
function splitParagraphsWithByteRanges(fullText) {
  const paragraphs = [];
  if (!fullText) return paragraphs;

  // Split by double newline or Markdown heading lines (e.g., "# Title")
  const regex = /(\n\n+|^#{1,6}\s+.*(?:\n|$))/gm;
  let lastPos = 0;
  let currentByteOffset = 0;
  let match;

  while ((match = regex.exec(fullText)) !== null) {
    const separator = match[0];
    const preText = fullText.substring(lastPos, match.index);

    if (preText && preText.trim().length > 0) {
      const preBytes = getUtf8ByteLength(preText);
      paragraphs.push({
        text: preText.trim(),
        startByte: currentByteOffset,
        endByte: currentByteOffset + preBytes,
        links: []
      });
      currentByteOffset += preBytes;
    }

    if (separator.startsWith('#')) {
      const heading = separator.replace(/\n$/, '').trim();
      const headingBytes = getUtf8ByteLength(heading);
      paragraphs.push({
        text: heading,
        startByte: currentByteOffset,
        endByte: currentByteOffset + headingBytes,
        links: []
      });
      currentByteOffset += headingBytes;
    } else {
      const sepBytes = getUtf8ByteLength(separator);
      currentByteOffset += sepBytes;
    }
    lastPos = regex.lastIndex;
  }

  const remaining = fullText.substring(lastPos);
  if (remaining && remaining.trim().length > 0) {
    const remBytes = getUtf8ByteLength(remaining);
    paragraphs.push({
      text: remaining.trim(),
      startByte: currentByteOffset,
      endByte: currentByteOffset + remBytes,
      links: []
    });
  }

  return paragraphs;
}



/**
 * チャット JSON データのパース
 */
function parseChatJson(jsonData) {
  const chunks = (jsonData.chunkedPrompt && jsonData.chunkedPrompt.chunks) || [];
  const turns = [];

  let currentTurn = null;

  chunks.forEach(chunk => {
    const role = chunk.role;

    if (role === 'user') {
      // 前のターンがあれば確定保存
      if (currentTurn) {
        turns.push(currentTurn);
      }

      currentTurn = {
        timestamp: parseIsoDatetime(chunk.createTime),
        userText: (chunk.text || '').trim(),
        aiParagraphs: []
      };

    } else if (role === 'model') {
      if (isThoughtChunk(chunk)) return;

      const modelText = extractModelText(chunk);
      if (!modelText) return;

      if (!currentTurn) {
        currentTurn = {
          timestamp: '日時不明',
          userText: '(事前プロンプト / 履歴なし)',
          aiParagraphs: []
        };
      }

      // 1. 段落の分割とバイト範囲の取得
      const paragraphs = splitParagraphsWithByteRanges(modelText);

      // 2. grounding 情報の解析
      const grounding = chunk.grounding || {};
      const sources = grounding.groundingSources || [];
      const refToSource = {};

      sources.forEach(src => {
        const refNum = src.referenceNumber;
        const uri = src.uri || '';
        const title = (src.title || '').trim() || (refNum != null ? `参照 [${refNum}]` : '参照リンク');
        if (refNum != null && uri) {
          refToSource[refNum] = { refNum, title, uri };
        }
      });

      const segments = grounding.corroborationSegments || [];

      // 3. 注釈セグメントを該当段落に紐付ける
      segments.forEach(seg => {
        const idx = seg.index;
        const fn = seg.footnoteNumber;
        const uri = seg.uri || (refToSource[fn] ? refToSource[fn].uri : '');
        const title = (refToSource[fn] ? refToSource[fn].title : '') || `参照 [${fn}]`;

        if (idx != null && uri) {
          const linkObj = { fn, title, uri };

          // どの段落に属するか判定
          let matched = false;
          for (let i = 0; i < paragraphs.length; i++) {
            const p = paragraphs[i];
            const isLast = (i === paragraphs.length - 1);
            if (idx >= p.startByte && (idx < p.endByte || isLast)) {
              // 重複追加の防止 (同じ fn/uri)
              if (!p.links.some(l => l.fn === fn && l.uri === uri)) {
                p.links.push(linkObj);
              }
              matched = true;
              break;
            }
          }
          if (!matched && paragraphs.length > 0) {
            const lastP = paragraphs[paragraphs.length - 1];
            if (!lastP.links.some(l => l.fn === fn && l.uri === uri)) {
              lastP.links.push(linkObj);
            }
          }
        }
      });

      // 注釈リンクを footnoteNumber 順にソート
      paragraphs.forEach(p => {
        p.links.sort((a, b) => (a.fn || 0) - (b.fn || 0));
      });

      currentTurn.aiParagraphs.push(...paragraphs);
    }
  });

  if (currentTurn) {
    turns.push(currentTurn);
  }

  return turns;
}

/**
 * テキストと列幅から必要とされるセルの高さ（ピクセル）を概算する
 */
function estimateTextHeight(text, colWidthPx) {
  if (!text) return 30;

  // 1文字あたりの平均幅（全角文字約15px, 半角文字約8px）
  const charsPerLine = Math.max(10, Math.floor(colWidthPx / 15));

  // 改行コードで分割し、各行に必要な表示行数を計算
  const lines = text.split('\n');
  let totalVisualLines = 0;

  lines.forEach(line => {
    let fullWidthLength = 0;
    for (let i = 0; i < line.length; i++) {
      const code = line.charCodeAt(i);
      fullWidthLength += (code > 0x7f) ? 1.0 : 0.5;
    }
    const visualLines = Math.max(1, Math.ceil(fullWidthLength / charsPerLine));
    totalVisualLines += visualLines;
  });

  const lineHeight = 20; // 1行あたりの概算高さ (px)
  const padding = 16;    // 上下余白 (px)
  return Math.max(30, totalVisualLines * lineHeight + padding);
}

/**
 * 重複しないシート名を生成する（既存の場合は 連番 を付与）
 */
function getUniqueSheetName(ss, baseName) {
  let name = baseName;
  let counter = 1;
  while (ss.getSheetByName(name)) {
    name = `${baseName} (${counter})`;
    counter++;
  }
  return name;
}

/**
 * スプレッドシートへの書き込みとフォーマット
 */
function renderToSheet(turns, baseSheetName) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const uniqueSheetName = getUniqueSheetName(ss, baseSheetName);
  const sheet = ss.insertSheet(uniqueSheetName);

  // 1. ヘッダーの作成
  const headers = ['No.', '日時', 'ユーザーの発言', 'AIの回答', '注釈リンク'];
  sheet.getRange(1, 1, 1, 5).setValues([headers]);

  // ヘッダーのスタイリング
  const headerRange = sheet.getRange(1, 1, 1, 5);
  headerRange.setBackground('#1A73E8')
    .setFontColor('#FFFFFF')
    .setFontWeight('bold')
    .setHorizontalAlignment('center')
    .setVerticalAlignment('middle');
  sheet.setRowHeight(1, 35);

  let currentRow = 2;

  // 2. データの生成と結合情報の保持
  turns.forEach((turn, turnIdx) => {
    const turnNoStr = String(turnIdx + 1).padStart(3, '0');
    const startRowOfTurn = currentRow;

    // ユーザー発言の概算高さ (列幅 320px)
    const userTextHeight = estimateTextHeight(turn.userText, 320);

    // AI段落がない場合のフォールバック
    const aiParagraphs = turn.aiParagraphs.length > 0
      ? turn.aiParagraphs
      : [{ text: '(回答なし)', links: [] }];

    const rowHeightsOfTurn = [];

    aiParagraphs.forEach(p => {
      const pStartRow = currentRow;
      const links = p.links;
      const linkCount = links.length;
      const pRowCount = Math.max(1, linkCount);

      // AI段落テキストの概算高さ (列幅 550px)
      const paragraphTextHeight = estimateTextHeight(p.text, 550);
      const perRowHeight = Math.max(30, Math.ceil(paragraphTextHeight / pRowCount));

      for (let i = 0; i < pRowCount; i++) {
        const row = pStartRow + i;

        // 各行のデフォルト概算高さを追跡
        rowHeightsOfTurn.push(perRowHeight);

        // 連番、タイムスタンプ、ユーザー発言はターンの1行目にセット
        if (row === startRowOfTurn) {
          sheet.getRange(row, 1).setNumberFormat('@').setValue(turnNoStr);
          sheet.getRange(row, 2).setValue(turn.timestamp);
          sheet.getRange(row, 3).setValue(turn.userText);
        }

        // AI段落本文は段落の1行目にセット
        if (i === 0) {
          sheet.getRange(row, 4).setValue(p.text);
        }

        // 注釈リンク (列E)
        if (linkCount > 0 && i < linkCount) {
          const link = links[i];
          const label = link.fn ? `[${link.fn}] ${link.title}` : link.title;
          const richText = SpreadsheetApp.newRichTextValue()
            .setText(label)
            .setLinkUrl(link.uri)
            .build();
          sheet.getRange(row, 5).setRichTextValue(richText);
        }
      }

      // AI段落テキストのセル結合 (行数が2以上の場合)
      if (pRowCount > 1) {
        sheet.getRange(pStartRow, 4, pRowCount, 1).merge();
      }

      currentRow += pRowCount;
    });

    const turnRowCount = currentRow - startRowOfTurn;

    // ユーザー発言の高さが全体の合計高さより大きい場合、ターン末尾の行高を調整
    let totalTurnHeight = rowHeightsOfTurn.reduce((sum, h) => sum + h, 0);
    if (userTextHeight > totalTurnHeight && rowHeightsOfTurn.length > 0) {
      const diff = userTextHeight - totalTurnHeight;
      rowHeightsOfTurn[rowHeightsOfTurn.length - 1] += diff;
    }

    // 各行の高さをスプレッドシートに適用
    rowHeightsOfTurn.forEach((h, idx) => {
      sheet.setRowHeight(startRowOfTurn + idx, h);
    });

    // ターン全体のセル結合 (A列, B列, C列)
    if (turnRowCount > 1) {
      sheet.getRange(startRowOfTurn, 1, turnRowCount, 1).merge();
      sheet.getRange(startRowOfTurn, 2, turnRowCount, 1).merge();
      sheet.getRange(startRowOfTurn, 3, turnRowCount, 1).merge();
    }

    // ターンごとの区切り罫線
    const turnRange = sheet.getRange(startRowOfTurn, 1, turnRowCount, 5);
    turnRange.setBorder(true, true, true, true, true, true, '#E0E0E0', SpreadsheetApp.BorderStyle.SOLID);
    // 下端に区切り線
    sheet.getRange(currentRow - 1, 1, 1, 5).setBorder(null, null, true, null, null, null, '#9E9E9E', SpreadsheetApp.BorderStyle.SOLID_MEDIUM);
  });

  // 3. 全体のアライメントと表示スタイルの調整
  const totalRows = currentRow - 1;
  if (totalRows >= 2) {
    const dataRange = sheet.getRange(2, 1, totalRows - 1, 5);
    dataRange.setVerticalAlignment('top');
    dataRange.setWrap(true);

    // 列別の配置
    sheet.getRange(2, 1, totalRows - 1, 1).setHorizontalAlignment('center'); // No
    sheet.getRange(2, 2, totalRows - 1, 1).setHorizontalAlignment('center'); // タイムスタンプ
    sheet.getRange(2, 3, totalRows - 1, 3).setHorizontalAlignment('left');   // 発言, 回答, リンク
  }

  // 4. 列幅の設定
  sheet.setColumnWidth(1, 60);  // No.
  sheet.setColumnWidth(2, 160); // タイムスタンプ
  sheet.setColumnWidth(3, 320); // ユーザー発言
  sheet.setColumnWidth(4, 550); // AIの回答文 (450px -> 550px)
  sheet.setColumnWidth(5, 200); // 注釈リンク (300px -> 200px)

  // アクティブシートに切り替え
  sheet.activate();
}

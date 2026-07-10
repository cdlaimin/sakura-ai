/**
 * 从上传材料（Word 目录链接、Markdown 标题、章节编号行）提取目录结构，
 * 供需求分析生成时按原文章节顺序组织输出。
 */

export interface DocumentOutlineItem {
  /** 章节编号，如 "1"、"1.3.1" */
  id: string;
  /** 章节标题（不含编号） */
  title: string;
  /** 层级：1 = 章，2 = 节，3 = 小节 … */
  level: number;
  /** 编号 + 标题，如 "1.3.1 支持数据库类型" */
  fullTitle: string;
}

const TOC_LINK_LINE_RE = /^\[([^\]]+)\]\(#/;

const MARKDOWN_NUMBERED_HEADING_RE = /^(#{1,6})\s+(\d+(?:\.\d+)*)\.?\s+(.+?)\s*$/;

/** 行首编号章节（过滤过短编号，降低误匹配） */
const PLAIN_NUMBERED_LINE_RE = /^(\d+(?:\.\d+)+|\d+)\.?\s+(\S.{1,120}?)\s*$/;

function normalizeSectionId(raw: string): string {
  return raw.replace(/\.$/, '').trim();
}

function sectionLevel(id: string): number {
  if (!id) return 1;
  return id.split('.').filter(Boolean).length;
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function findOutlineSourceIndex(text: string, item: DocumentOutlineItem): number {
  const id = escapeRegExp(item.id);
  const title = escapeRegExp(item.title);
  const markdownTitleLine = `^\\s*(?:[-*+]\\s*)?(?:\\*\\*|__|\\*|_)?\\s*${title}\\s*(?:\\*\\*|__|\\*|_)?\\s*$`;
  const markdownNumberedTitleLine = `^\\s*(?:[-*+]\\s*)?(?:\\*\\*|__|\\*|_)?\\s*${id}\\.?\\s+${title}\\s*(?:\\*\\*|__|\\*|_)?\\s*$`;
  const patterns = [
    new RegExp(`^#{1,6}\\s*${id}\\.?\\s+${title}`, 'im'),
    new RegExp(`^#{1,6}\\s*${id}\\.?\\s+`, 'im'),
    // Some DOCX files render the TOC as "1.1 Title 5", while the body
    // heading itself is just "Title" or "**Title**" in Normal style.
    // Prefer an exact title-only line before falling back to numbered lines
    // that may be TOC.
    new RegExp(`^${title}\\s*$`, 'im'),
    new RegExp(markdownTitleLine, 'im'),
    new RegExp(markdownNumberedTitleLine, 'im'),
    new RegExp(`^${id}\\.?\\s+${title}\\s*$`, 'im'),
    new RegExp(`^${id}\\.?\\s+${title}(?:\\s+\\d{1,4})?\\s*$`, 'im'),
    new RegExp(`\\n${id}\\.?\\s+${title}(?:\\s+\\d{1,4})?\\s*`, 'i'),
  ];

  for (const re of patterns) {
    const m = re.exec(text);
    if (m && m.index >= 0) return m.index;
  }
  return -1;
}

function parseTocBracketContent(raw: string): { id: string; title: string } | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const withoutPage = trimmed.replace(/[\t\s]+\d+\s*$/, '').trim();
  const m = withoutPage.match(/^(\d+(?:\.\d+)*)\.?\s+(.+)$/);
  if (!m) return null;
  const id = normalizeSectionId(m[1]);
  const title = m[2].replace(/\s+/g, ' ').trim();
  if (!title || title.length < 2) return null;
  return { id, title };
}

function toOutlineItem(id: string, title: string): DocumentOutlineItem {
  const cleanTitle = title.replace(/\s+/g, ' ').trim();
  return {
    id,
    title: cleanTitle,
    level: sectionLevel(id),
    fullTitle: `${id} ${cleanTitle}`,
  };
}

function dedupeOutlineItems(items: DocumentOutlineItem[]): DocumentOutlineItem[] {
  const seen = new Set<string>();
  const out: DocumentOutlineItem[] = [];
  for (const item of items) {
    const key = item.id;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}

function compareSectionIds(a: string, b: string): number {
  const pa = a.split('.').map((x) => parseInt(x, 10));
  const pb = b.split('.').map((x) => parseInt(x, 10));
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    const va = pa[i] ?? -1;
    const vb = pb[i] ?? -1;
    if (va !== vb) return va - vb;
  }
  return 0;
}

function extractFromTocLinkLines(lines: string[]): DocumentOutlineItem[] {
  const items: DocumentOutlineItem[] = [];
  for (const line of lines) {
    const m = line.trim().match(TOC_LINK_LINE_RE);
    if (!m) continue;
    const parsed = parseTocBracketContent(m[1]);
    if (!parsed) continue;
    items.push(toOutlineItem(parsed.id, parsed.title));
  }
  return items;
}

function extractFromMarkdownHeadings(text: string): DocumentOutlineItem[] {
  const items: DocumentOutlineItem[] = [];
  for (const line of text.split('\n')) {
    const m = line.trim().match(MARKDOWN_NUMBERED_HEADING_RE);
    if (!m) continue;
    const id = normalizeSectionId(m[2]);
    const title = m[3].trim();
    if (!title) continue;
    items.push(toOutlineItem(id, title));
  }
  return items;
}

function extractFromPlainNumberedLines(text: string): DocumentOutlineItem[] {
  const items: DocumentOutlineItem[] = [];
  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    if (trimmed.startsWith('[') || trimmed.startsWith('#')) continue;
    const m = trimmed.match(PLAIN_NUMBERED_LINE_RE);
    if (!m) continue;
    const id = normalizeSectionId(m[1]);
    const title = m[2].replace(/[\t\s]+\d{1,4}\s*$/, '').trim();
    if (title.length < 2) continue;
    if (/^\d+$/.test(title)) continue;
    items.push(toOutlineItem(id, title));
  }
  return items;
}

function isLikelyValidOutline(items: DocumentOutlineItem[]): boolean {
  if (items.length < 3) return false;
  const levels = new Set(items.map((i) => i.level));
  if (items.length >= 5) return true;
  return levels.size >= 2 || items.some((i) => i.level >= 2);
}

/**
 * 从材料正文中提取目录/章节结构（保持原文出现顺序）。
 */
export function extractDocumentOutline(text: string): DocumentOutlineItem[] {
  if (!text?.trim()) return [];

  const lines = text.split('\n');

  const tocItems = extractFromTocLinkLines(lines);
  if (isLikelyValidOutline(tocItems)) {
    return dedupeOutlineItems(tocItems);
  }

  const headingItems = extractFromMarkdownHeadings(text);
  if (isLikelyValidOutline(headingItems)) {
    return dedupeOutlineItems(headingItems);
  }

  const plainItems = extractFromPlainNumberedLines(text);
  if (isLikelyValidOutline(plainItems)) {
    return dedupeOutlineItems(plainItems);
  }

  if (tocItems.length > 0) return dedupeOutlineItems(tocItems);
  if (headingItems.length > 0) return dedupeOutlineItems(headingItems);
  return [];
}

/**
 * 生成注入系统提示词的目录约束说明。
 */
export function buildDocumentOutlinePromptBlock(outline: DocumentOutlineItem[]): string {
  if (outline.length === 0) return '';

  const lines = outline.map((item) => {
    const indent = '  '.repeat(Math.max(0, item.level - 1));
    return `${indent}- ${item.fullTitle}`;
  });

  return `## 【材料目录结构 — 输出必须严格遵循】

已从上传材料中识别到 **${outline.length}** 个章节/模块。生成需求文档时：

1. **章节顺序**：必须按下表顺序逐节输出，**禁止**调换先后（例如必须先写「1. 产品概述」再写「2. 系统登录」）。
2. **标题与编号**：各级标题须保留材料中的章节编号与名称（允许轻微润色，但语义不得改变）。
3. **Markdown 层级**：一级章节用 \`##\`，二级用 \`###\`，三级用 \`####\`，四级用 \`#####\`（与编号层级对应）。
4. **内容归属**：每节下的功能点、字段、规则、验收标准等，写入对应目录节内，不要合并到其他章节。
5. **需求化输出**：目录标题可以保留原材料顺序，但正文必须提炼为可开发、可测试、可验收的需求条目。每个有实质业务/接口/数据/规则内容的章节，应尽量输出 \`FR-xxx\` / \`NFR-xxx\` / \`IR-xxx\` / \`DR-xxx\`，并包含“需求描述、前置条件、主成功路径/规则、异常流程、验收标准、优先级、来源”。禁止把设计文档原段落按原句连续复制成正文。
6. **设计文档转换**：若材料章节是“设计方案/类设计/数据流/时序步骤/异常处理机制”，请转换为需求、规则、接口、数据字典和验收标准；类名、表名、接口路径、字段名、枚举值可原样保留，解释性长段必须改写。
7. **缺失内容**：若某节在材料中无实质描述，仍输出该节标题，正文标注 **[待确认] 材料未提供本节详情**。
8. **文首文尾**：可在最前增加简短的 \`## 概述\`（背景/目标）；\`非功能需求\`、\`风险与待确认\` 等可放在**全部目录章节之后**。除上述外，**不要**插入与目录无关的顶层功能模块章节。

### 目录顺序（共 ${outline.length} 项）

${lines.join('\n')}`;
}

/**
 * 按目录章节切分正文，便于分片生成时保持模块边界。
 */
export function splitTextByDocumentOutline(params: {
  text: string;
  outline: DocumentOutlineItem[];
  maxChars: number;
}): string[] | null {
  const { text, outline, maxChars } = params;
  if (!text || outline.length === 0 || maxChars < 1000) return null;

  type SectionSlice = { index: number; start: number; end: number };
  const slices: SectionSlice[] = [];

  for (let i = 0; i < outline.length; i++) {
    const item = outline[i];
    const start = findOutlineSourceIndex(text, item);
    if (start < 0) continue;
    slices.push({ index: i, start, end: text.length });
  }

  if (slices.length < Math.min(3, outline.length)) return null;

  slices.sort((a, b) => a.start - b.start);
  for (let i = 0; i < slices.length; i++) {
    const next = slices[i + 1];
    slices[i].end = next ? next.start : text.length;
  }

  const preambleEnd = slices[0]?.start ?? 0;
  const preamble = preambleEnd > 0 ? text.slice(0, preambleEnd).trim() : '';

  const sectionTexts: string[] = [];
  if (preamble) {
    sectionTexts.push(`## 文档前言与概述性内容\n\n${preamble}`);
  }
  for (const s of slices) {
    const chunk = text.slice(s.start, s.end).trim();
    if (chunk) sectionTexts.push(chunk);
  }

  if (sectionTexts.length === 0) return null;

  const chunks: string[] = [];
  let current = '';
  for (const section of sectionTexts) {
    if (!current) {
      if (section.length <= maxChars) {
        current = section;
      } else {
        chunks.push(...splitOversizedSection(section, maxChars));
      }
      continue;
    }
    if ((current.length + section.length + 2) <= maxChars) {
      current = `${current}\n\n${section}`;
    } else {
      chunks.push(current);
      if (section.length <= maxChars) {
        current = section;
      } else {
        chunks.push(...splitOversizedSection(section, maxChars));
        current = '';
      }
    }
  }
  if (current) chunks.push(current);
  return chunks.length > 0 ? chunks : null;
}

function splitOversizedSection(section: string, maxChars: number): string[] {
  const parts: string[] = [];
  let cursor = 0;
  while (cursor < section.length) {
    parts.push(section.slice(cursor, cursor + maxChars));
    cursor += maxChars;
  }
  return parts;
}

export function buildOutlineAwareMergePromptPrefix(outline: DocumentOutlineItem[]): string {
  const base =
    '以下是同一份材料的分片需求草稿，请去重、合并冲突、统一编号并输出最终完整需求文档（仅依据这些草稿，不得编造）。\n' +
    '重要：不要为了简洁而省略任何分片中的有效需求点；若内容较长，优先保证覆盖完整性，再保证表达简洁。\n' +
    '合并结果必须是需求文档，不是材料摘录。若草稿中存在原文复述段落，请压缩改写为 FR/NFR/IR/DR 条目、验收标准、数据/接口契约或待确认事项。\n';

  if (outline.length === 0) {
    return base + '\n';
  }

  const idList = outline.map((o) => o.fullTitle).join(' → ');
  return (
    base +
    `\n**合并时必须严格按材料目录顺序组织章节**（共 ${outline.length} 项），顺序为：\n${idList}\n` +
    '不得打乱章节先后；缺失章节保留标题并标注 [待确认]。\n\n'
  );
}

export function buildOutlineAwareChunkPromptPrefix(outline: DocumentOutlineItem[]): string {
  const base =
    '请基于当前分片内容提取结构化需求要点（仅依据本分片，不补充材料外信息）。要求尽量完整覆盖页面/模块/字段/按钮/规则，但必须需求化改写，禁止把材料原文整段复制到输出：\n\n' +
    '输出每个有效章节时，优先组织为 FR/NFR/IR/DR 条目，并包含需求描述、前置条件、主成功路径/规则、异常流程、验收标准、优先级、来源。设计说明、类设计、数据流、时序步骤必须转成可验收需求或规则；无法形成需求的内容写入待确认/约束，不要照搬。\n\n';

  if (outline.length === 0) return base;

  return (
    base +
    `本分片可能只覆盖材料目录的部分章节。输出时请保留章节编号标题（### / ####），并与整体目录顺序一致；目录共 ${outline.length} 项。\n\n`
  );
}

export function sortOutlineItems(items: DocumentOutlineItem[]): DocumentOutlineItem[] {
  return [...items].sort((a, b) => compareSectionIds(a.id, b.id));
}

/** 目录章节较多或预估输出超长时，不宜单次生成（易在 max_tokens 处截断） */
export function shouldForceChunkedRequirementGeneration(
  outline: DocumentOutlineItem[],
  maxOutputTokens: number
): boolean {
  const thresholdRaw = parseInt(process.env.REQUIREMENT_DOC_OUTLINE_CHUNK_THRESHOLD || '40', 10);
  const threshold =
    Number.isFinite(thresholdRaw) && thresholdRaw >= 5 ? thresholdRaw : 40;

  if (outline.length >= threshold) return true;

  if (outline.length >= 8) {
    const estOutputTokens = Math.ceil((outline.length * 700) / 2);
    if (estOutputTokens > maxOutputTokens * 1.5) return true;
  }

  return false;
}

export function isOutlineSectionPresent(content: string, item: DocumentOutlineItem): boolean {
  if (findSectionHeadingIndex(content, item) >= 0) return true;

  const id = escapeRegExp(item.id);
  const title = escapeRegExp(item.title);
  const patterns = [
    new RegExp(`^#{2,5}\\s*${id}(?:\\.|\\s)+${title}`, 'im'),
    new RegExp(`\\n#{2,5}\\s*${id}(?:\\.|\\s)+${title}`, 'i'),
    new RegExp(`\\n###\\s*${id}(?:\\.|\\s)+${title}`, 'i'),
  ];
  return patterns.some((re) => re.test(content));
}

/** 返回目录中尚未出现在需求文档里的章节（保持目录顺序） */
export function findMissingOutlineSections(
  content: string,
  outline: DocumentOutlineItem[]
): DocumentOutlineItem[] {
  if (!content?.trim() || outline.length === 0) return [];
  return outline.filter((item) => !isOutlineSectionPresent(content, item));
}

export function buildOutlineContinuePrompt(params: {
  missing: DocumentOutlineItem[];
  tail: string;
}): string {
  const missingList = params.missing
    .slice(0, 24)
    .map((m) => `- ${m.fullTitle}`)
    .join('\n');
  const more =
    params.missing.length > 24
      ? `\n（另有 ${params.missing.length - 24} 个章节，请在本轮续写后继续补全）`
      : '';

  return (
    '你上一条输出因长度上限被截断，或尚未写完材料目录中的全部章节。请**仅续写剩余部分**，从末尾自然衔接，**不要重复**已有段落。\n\n' +
    '**必须遵守**：\n' +
    '1. 严格按下列「尚未输出的目录章节」顺序续写，先补全功能章节（如 5.9、5.10、6.x），**不要**跳过中间章节直接去写「交付计划与优先级」「测试范围与回归建议」。\n' +
    '2. 每个目录节使用与上文一致的 Markdown 标题（### / #### + 章节编号 + 名称）。\n' +
    '3. 材料无内容的章节保留标题并标注 [待确认]。\n\n' +
    `**尚未输出的目录章节（优先写这些）**：\n${missingList}${more}\n\n` +
    `**已输出末尾参考**：\n${params.tail}`
  );
}

type SectionRange = { item: DocumentOutlineItem; start: number; end: number };

function locateOutlineSectionRanges(
  text: string,
  outline: DocumentOutlineItem[]
): SectionRange[] {
  const slices: SectionRange[] = [];

  for (const item of outline) {
    const start = findOutlineSourceIndex(text, item);
    if (start < 0) continue;
    slices.push({ item, start, end: text.length });
  }

  if (slices.length === 0) return [];
  slices.sort((a, b) => a.start - b.start);
  for (let i = 0; i < slices.length; i++) {
    slices[i].end = slices[i + 1]?.start ?? text.length;
  }
  return slices;
}

/** 从原始材料中截取指定目录章节对应的正文，供补缺调用 */
export function extractSourceExcerptForOutlineItems(
  text: string,
  outline: DocumentOutlineItem[],
  items: DocumentOutlineItem[],
  maxChars: number
): string {
  if (!text || items.length === 0) return '';

  const ranges = locateOutlineSectionRanges(text, outline);
  const parts: string[] = [];
  let total = 0;

  for (const item of items) {
    const range = ranges.find((r) => r.item.id === item.id);
    const body = range ? text.slice(range.start, range.end).trim() : '';
    const block = body
      ? `### 材料：${item.fullTitle}\n\n${body}`
      : `### 材料：${item.fullTitle}\n\n[材料正文中未定位到该节正文，请结合上下文推断或标注待确认]`;
    if (total + block.length > maxChars) {
      const remain = maxChars - total;
      if (remain > 200) parts.push(block.slice(0, remain) + '\n\n[摘录已截断]');
      break;
    }
    parts.push(block);
    total += block.length + 2;
  }

  return parts.join('\n\n---\n\n');
}

export function buildOutlineGapFillPrompt(params: {
  missing: DocumentOutlineItem[];
  sourceExcerpt: string;
  documentTail: string;
}): string {
  const missingList = params.missing.map((m) => `- ${m.fullTitle}`).join('\n');
  return (
    '当前需求文档**缺少**以下材料目录章节，请**仅**根据「材料摘录」补写这些章节的需求内容。\n\n' +
    '要求：\n' +
    '1. 只输出下列缺失章节，不要重复已有章节，不要改写前文。\n' +
    '2. 每节使用 ### / #### + 章节编号 + 名称，与目录一致。\n' +
    '3. 每条需求含 FR-xxx、验收标准、优先级、来源；无材料处标 [待确认]。\n' +
    '4. **不要**在本轮输出「交付计划与优先级」「测试范围与回归建议」（除非它们也在缺失列表中）。\n\n' +
    `**缺失章节**：\n${missingList}\n\n` +
    `**材料摘录**：\n${params.sourceExcerpt}\n\n` +
    `**已生成文档末尾（便于衔接）**：\n${params.documentTail}`
  );
}

export function computeOutlineContinueMaxRounds(outlineLength: number): number {
  if (outlineLength <= 0) return 3;
  const fromEnv = parseInt(process.env.REQUIREMENT_DOC_OUTLINE_CONTINUE_MAX_ROUNDS || '', 10);
  if (Number.isFinite(fromEnv) && fromEnv >= 3) return fromEnv;
  if (outlineLength > 60) return 12;
  if (outlineLength > 30) return 8;
  if (outlineLength > 15) return 6;
  return 4;
}

/** 文档末尾元章节（补缺内容应插在这些标题之前） */
const REQUIREMENT_DOC_TAIL_SECTION_TITLES = [
  '交付计划与优先级',
  '测试范围与回归建议',
  '风险与待确认事项',
  '约束与假设',
  '变更摘要',
];

export function findSectionHeadingIndex(content: string, item: DocumentOutlineItem): number {
  const id = escapeRegExp(item.id);
  const title = escapeRegExp(item.title);
  const patterns = [
    new RegExp(`^#{2,6}\\s*${id}(?:\\.|\\s)+${title}`, 'im'),
    new RegExp(`^#{2,6}\\s*${id}(?:\\.|\\s)+`, 'im'),
    new RegExp(`^#####\\s*${id}(?:\\.|\\s|-)+`, 'im'),
    new RegExp(`\\n#{2,6}\\s*${id}(?:\\.|\\s)+${title}`, 'i'),
  ];
  for (const re of patterns) {
    const m = re.exec(content);
    if (m && m.index >= 0) return m.index;
  }
  return -1;
}

function findTailMetaSectionIndex(content: string): number {
  let earliest = -1;
  for (const title of REQUIREMENT_DOC_TAIL_SECTION_TITLES) {
    const escaped = escapeRegExp(title);
    const patterns = [
      new RegExp(`^##\\s*\\d+[\\.、]?\\s*${escaped}`, 'im'),
      new RegExp(`^##\\s*${escaped}`, 'im'),
    ];
    for (const re of patterns) {
      const m = re.exec(content);
      if (m && m.index >= 0) {
        if (earliest < 0 || m.index < earliest) earliest = m.index;
      }
    }
  }
  return earliest;
}

/**
 * 将补缺章节插入到正文中的正确目录位置（而非追加到文末）。
 */
export function insertOutlineSupplementInDocumentOrder(params: {
  content: string;
  supplement: string;
  outline: DocumentOutlineItem[];
  batchItems: DocumentOutlineItem[];
}): string {
  const { content, supplement, outline, batchItems } = params;
  const trimmed = supplement.trim();
  if (!trimmed) return content;

  const lastBatch = batchItems[batchItems.length - 1];
  const lastIdx = outline.findIndex((o) => o.id === lastBatch.id);

  let anchor = -1;
  for (let i = lastIdx + 1; i < outline.length; i++) {
    const pos = findSectionHeadingIndex(content, outline[i]);
    if (pos >= 0) {
      anchor = pos;
      break;
    }
  }

  if (anchor < 0) {
    anchor = findTailMetaSectionIndex(content);
  }
  if (anchor < 0) {
    anchor = content.length;
  }

  const before = content.slice(0, anchor).trimEnd();
  const after = content.slice(anchor).trimStart();
  return `${before}\n\n${trimmed}\n\n${after}`;
}

/**
 * 按目录条目分组切分材料（正文标题难匹配时的兜底），保证多分片按目录顺序生成。
 */
export function splitTextByOutlineGroups(params: {
  text: string;
  outline: DocumentOutlineItem[];
  maxChars: number;
  sectionsPerChunk?: number;
}): string[] {
  const { text, outline, maxChars } = params;
  if (!text?.trim() || outline.length === 0) return [];

  const perChunkRaw = parseInt(
    process.env.REQUIREMENT_DOC_OUTLINE_SECTIONS_PER_CHUNK ||
      String(params.sectionsPerChunk ?? 20),
    10
  );
  const sectionsPerChunk =
    Number.isFinite(perChunkRaw) && perChunkRaw >= 3 ? Math.min(perChunkRaw, 20) : 20;

  const chunks: string[] = [];
  const totalLen = text.length;

  for (let i = 0; i < outline.length; i += sectionsPerChunk) {
    const group = outline.slice(i, i + sectionsPerChunk);
    let excerpt = extractSourceExcerptForOutlineItems(text, outline, group, maxChars);

    if (!excerpt.trim()) {
      const startRatio = i / outline.length;
      const endRatio = Math.min(1, (i + sectionsPerChunk) / outline.length);
      const start = Math.floor(totalLen * startRatio);
      const end = Math.min(totalLen, Math.ceil(totalLen * endRatio) + 500);
      excerpt = text.slice(start, end).trim();
    }

    const tocList = group.map((g) => `- ${g.fullTitle}`).join('\n');
    chunks.push(
      `【本分片必须按顺序覆盖的目录章节】\n${tocList}\n\n` +
        `【材料摘录（第 ${Math.floor(i / sectionsPerChunk) + 1} 组，共 ${Math.ceil(outline.length / sectionsPerChunk)} 组）】\n\n` +
        excerpt
    );
  }

  return chunks.filter(Boolean);
}

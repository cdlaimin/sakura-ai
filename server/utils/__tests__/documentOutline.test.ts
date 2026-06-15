import {
  extractDocumentOutline,
  buildDocumentOutlinePromptBlock,
  splitTextByDocumentOutline,
  findMissingOutlineSections,
  shouldForceChunkedRequirementGeneration,
  isOutlineSectionPresent,
  insertOutlineSupplementInDocumentOrder,
  splitTextByOutlineGroups,
} from '../documentOutline';

describe('splitTextByDocumentOutline markdown title formatting', () => {
  it('matches DOCX bodies whose headings are rendered as bold markdown lines', () => {
    const text = `
Table of contents
1 Introduction 5
1.1 Purpose 5
2 Design 6
2.1 Module structure 7
2.2 Data model 8

**Introduction**
Overview body.

**Purpose**
Purpose body from the actual section.

- **Design**
Design body.

- **Module structure**
Module structure body from the actual section.

**Data model**
Data model body.
`;
    const outline = extractDocumentOutline(text);
    const chunks = splitTextByDocumentOutline({
      text,
      outline,
      maxChars: 50000,
    });

    expect(outline.map((o) => o.fullTitle)).toContain('2.1 Module structure');
    expect(chunks).not.toBeNull();
    expect(chunks!.join('\n')).toContain('Purpose body from the actual section.');
    expect(chunks!.join('\n')).toContain('Module structure body from the actual section.');
  });
});

describe('extractDocumentOutline', () => {
  it('parses Word TOC markdown links in document order', () => {
    const sample = `
[1. 产品概述	6](#_Toc197692051)
[1.1 系统概述	6](#_Toc197692052)
[1.3.1	支持数据库类型	8](#_Toc197692055)
[2	系统登录	21](#_Toc197692073)
[2.1 信任站点配置	21](#_Toc197692074)
`;
    const outline = extractDocumentOutline(sample);
    expect(outline.map((o) => o.id)).toEqual(['1', '1.1', '1.3.1', '2', '2.1']);
    expect(outline[0].title).toBe('产品概述');
    expect(outline[2].title).toBe('支持数据库类型');
    expect(outline[2].level).toBe(3);
  });

  it('parses markdown numbered headings', () => {
    const sample = `
# 需求文档

## 1. 产品概述

### 1.1 系统概述

### 1.2 产品系列简介

## 2. 系统登录
`;
    const outline = extractDocumentOutline(sample);
    expect(outline.length).toBeGreaterThanOrEqual(4);
    expect(outline[0].id).toBe('1');
    expect(outline.find((o) => o.id === '1.1')?.title).toContain('系统概述');
  });

  it('builds prompt block with ordered list', () => {
    const outline = extractDocumentOutline(`[1. 概述	1](#_Toc1)\n[1.1 背景	2](#_Toc2)\n[2. 登录	3](#_Toc3)`);
    const block = buildDocumentOutlinePromptBlock(outline);
    expect(block).toContain('目录顺序');
    expect(block).toContain('1 概述');
    expect(block.indexOf('1 概述')).toBeLessThan(block.indexOf('2 登录'));
  });
});

describe('shouldForceChunkedRequirementGeneration', () => {
  it('forces chunking when outline has many sections', () => {
    const lines = Array.from(
      { length: 45 },
      (_, i) => `[${i + 1}. 章节${i + 1}\t${i + 1}](#_Toc${i})`
    ).join('\n');
    const outline = extractDocumentOutline(lines);
    expect(outline.length).toBeGreaterThanOrEqual(20);
    expect(shouldForceChunkedRequirementGeneration(outline, 8000)).toBe(true);
  });
});

describe('findMissingOutlineSections', () => {
  it('detects gaps after 5.8 when later sections only have tail meta sections', () => {
    const outline = extractDocumentOutline(`
[5.8 拦截管理	105](#_Toc117)
[5.9 策略管理	106](#_Toc118)
[5.9.1 审计策略	106](#_Toc119)
[6.1 监控墙	160](#_Toc141)
`);
    const doc = `
### 5.8 拦截管理
- **需求 ID**: FR-001

## 8. 交付计划与优先级
表格
`;
    const missing = findMissingOutlineSections(doc, outline);
    expect(isOutlineSectionPresent(doc, outline[0])).toBe(true);
    expect(missing.map((m) => m.id)).toEqual(['5.9', '5.9.1', '6.1']);
  });
});

describe('insertOutlineSupplementInDocumentOrder', () => {
  it('inserts gap content before tail meta sections, not at EOF', () => {
    const outline = extractDocumentOutline(`
[5.10.1 集合参数	1](#_Toc1)
[5.11 数据维护	2](#_Toc2)
`);
    const content = `### 5.10 配置管理
summary

## 测试范围与回归建议
tail
`;
    const supplement = `### 5.10.1 集合参数
detail FR-100`;
    const merged = insertOutlineSupplementInDocumentOrder({
      content,
      supplement,
      outline,
      batchItems: [outline[0]],
    });
    expect(merged.indexOf('### 5.10.1 集合参数')).toBeLessThan(merged.indexOf('## 测试范围与回归建议'));
    expect(merged.indexOf('detail FR-100')).toBeLessThan(merged.indexOf('tail'));
  });
});

describe('splitTextByOutlineGroups', () => {
  it('creates multiple chunks for large outline', () => {
    const lines = Array.from({ length: 30 }, (_, i) => `[${i + 1}. 节${i + 1}\t1](#_Toc${i})`).join('\n');
    const outline = extractDocumentOutline(lines);
    const chunks = splitTextByOutlineGroups({
      text: '材料正文'.repeat(5000),
      outline,
      maxChars: 20000,
      sectionsPerChunk: 8,
    });
    expect(chunks.length).toBeGreaterThan(2);
  });

  it('includes body excerpts when TOC entries are numbered but body headings are unnumbered', () => {
    const text = `
目录
1 简介 5
1.1 目的 5
1.2 文档范围 5
2 模块设计 6
2.1 模块上下文定义 6
2.2 设计约束 7

简介
目的
本文目的是描述模块统方处置的概要设计。
文档范围
本文适用于了解防统方系统的统方处置设计。
模块设计
模块上下文定义
统方处置模块负责实现防统方的主要业务功能。
设计约束
需要考虑大量日志数据、秒级查询响应和 ClickHouse 异步更新一致性。
`;
    const outline = extractDocumentOutline(text);
    const chunks = splitTextByOutlineGroups({
      text,
      outline,
      maxChars: 50000,
      sectionsPerChunk: 3,
    });
    const joined = chunks.join('\n');

    expect(joined).toContain('本文目的是描述模块统方处置的概要设计');
    expect(joined).toContain('统方处置模块负责实现防统方的主要业务功能');
    expect(joined).toContain('ClickHouse 异步更新一致性');
    expect(joined).not.toContain('材料正文中未定位到该节正文');
  });
});

describe('splitTextByDocumentOutline', () => {
  it('splits body by section headings', () => {
    const text = `
前言说明

## 1. 产品概述
概述正文

## 2. 系统登录
登录正文
`;
    const outline = extractDocumentOutline(text);
    const chunks = splitTextByDocumentOutline({
      text,
      outline,
      maxChars: 50000,
    });
    expect(chunks).not.toBeNull();
    expect(chunks!.some((c) => c.includes('产品概述'))).toBe(true);
    expect(chunks!.some((c) => c.includes('系统登录'))).toBe(true);
  });

  it('matches DOCX bodies whose TOC has numbered entries but body headings are unnumbered', () => {
    const text = `
目录
1 简介 5
1.1 目的 5
1.2 文档范围 5
2 模块设计 6
2.1 模块上下文定义 6

简介
目的
本文目的是描述模块统方处置的概要设计。
文档范围
本文适用于了解防统方系统的统方处置设计。
模块设计
模块上下文定义
统方处置模块负责实现防统方的主要业务功能。
`;
    const outline = extractDocumentOutline(text);
    const chunks = splitTextByDocumentOutline({
      text,
      outline,
      maxChars: 50000,
    });

    expect(outline.map((o) => o.fullTitle)).toContain('1.1 目的');
    expect(chunks).not.toBeNull();
    expect(chunks!.join('\n')).toContain('本文目的是描述模块统方处置的概要设计');
    expect(chunks!.join('\n')).toContain('统方处置模块负责实现防统方的主要业务功能');
  });
});

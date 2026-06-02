/**
 * 需求文档内定位与模块推断（关联章节 → 滚动、所属模块）
 */

/**
 * 在已渲染为 HTML 的容器内，将滚动条定位到与关联章节标题匹配的标题元素。
 */
export function scrollToRequirementSectionInContainer(
  scrollRoot: HTMLElement | null,
  sectionLabel: string
): void {
  if (!scrollRoot || !sectionLabel.trim()) return;
  const normalized = sectionLabel.replace(/\s+/g, ' ').trim();
  const heads = [...scrollRoot.querySelectorAll('h1,h2,h3,h4,h5,h6')] as HTMLElement[];

  const pick = (): HTMLElement | null => {
    for (const h of heads) {
      const t = (h.textContent || '').replace(/\s+/g, ' ').trim();
      if (!t) continue;
      if (t === normalized) return h;
      if (t.includes(normalized) || normalized.includes(t)) return h;
    }
    const num = normalized.match(/^[\d.]+/);
    if (num) {
      const prefix = num[0];
      for (const h of heads) {
        const t = (h.textContent || '').replace(/\s+/g, ' ').trim();
        if (t.startsWith(prefix) || new RegExp(`(^|\\s)${prefix.replace(/\./g, '\\.')}\\s`).test(t)) {
          return h;
        }
      }
    }
    return null;
  };

  const el = pick();
  el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

/**
 * 根据需求文档 Markdown 与关联章节（如 "3.2 登录表单"），推断所属模块：
 * 优先取该章节标题或向上最近的含「模块」的标题。
 */
export function inferModuleFromRequirementDoc(
  requirementDoc: string,
  relatedSectionLabel: string | undefined
): string | undefined {
  if (!requirementDoc || !relatedSectionLabel?.trim()) return undefined;
  const normalized = relatedSectionLabel.replace(/\s+/g, ' ').trim();
  const lines = requirementDoc.split(/\r?\n/);

  const extractTitle = (line: string): string | null => {
    const md = line.match(/^#{1,6}\s+(.+)$/);
    if (md) return md[1].replace(/\s+/g, ' ').trim();
    // 兼容非 markdown 标题行：1.2 登录页面 / 1.2.3 按钮规则
    const plain = line.match(/^([\d]+(?:\.[\d]+)+)\s+(.+)$/);
    if (plain) return `${plain[1]} ${plain[2]}`.replace(/\s+/g, ' ').trim();
    return null;
  };

  let hitIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    const title = extractTitle(lines[i].trim());
    if (!title) continue;
    if (title === normalized || title.includes(normalized) || normalized.includes(title)) {
      hitIdx = i;
      break;
    }
  }

  if (hitIdx < 0) {
    const num = normalized.match(/^([\d.]+)/);
    if (num) {
      const prefix = num[1];
      for (let i = 0; i < lines.length; i++) {
        const title = extractTitle(lines[i].trim());
        if (!title) continue;
        if (title.startsWith(prefix)) {
          hitIdx = i;
          break;
        }
      }
    }
  }

  if (hitIdx < 0) return undefined;

  const stripNum = (title: string) => title.replace(/^[\d.]+\s+/, '').trim() || title;

  const lineAt = lines[hitIdx].trim();
  const currentTitle = extractTitle(lineAt);
  if (currentTitle) {
    const t = currentTitle;
    if (t.includes('模块')) {
      return normalizeModuleName(stripNum(t));
    }
  }

  for (let i = hitIdx - 1; i >= 0; i--) {
    const title = extractTitle(lines[i].trim());
    if (!title) continue;
    if (title.includes('模块')) {
      return normalizeModuleName(stripNum(title));
    }
  }

  // 回退：取命中的章节标题本身去编号后作为模块（例如“3.2 登录页面” => “登录页面”）
  if (currentTitle) {
    return normalizeModuleName(stripNum(currentTitle));
  }
  return undefined;
}

/**
 * 标准化并过滤无效模块名（AI占位词、空值等）
 */
export function normalizeModuleName(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const v = value.trim();
  if (!v) return undefined;
  const invalidPattern =
    /^(模块|模块名|待补充|未指定|unknown|n\/a|na|null|undefined|todo|tbd)$/i;
  if (invalidPattern.test(v)) return undefined;
  return v;
}

/**
 * 按顺序挑选第一个有效模块名
 */
export function pickBestModuleName(...candidates: Array<unknown>): string {
  for (const item of candidates) {
    const normalized = normalizeModuleName(item);
    if (normalized) return normalized;
  }
  return '';
}

/*
 * Typography splitter.
 *
 * Turns a heading into masked lines so each line can slide up from behind its
 * own clip box. Lines are derived from where the browser actually wrapped the
 * text (offsetTop grouping), so it stays correct at every breakpoint — the
 * split is redone whenever the element's width changes.
 *
 * Inline tags inside the heading (<em>, <span class="accent">, <br>) survive.
 */

const INLINE_KEEP = new Set(['EM', 'I', 'B', 'STRONG', 'SPAN', 'A', 'MARK', 'SMALL', 'SUP', 'SUB']);

function tokenize(node, out, wrapper) {
  for (const child of Array.from(node.childNodes)) {
    if (child.nodeType === Node.TEXT_NODE) {
      // Split on real whitespace only. \s would also match U+00A0, and the
      // whole point of authoring a non-breaking space is that it survives.
      const parts = child.textContent.split(/[ \t\n\r\f\v]+/);
      for (const p of parts) if (p) out.push({ text: p, wrapper });
    } else if (child.nodeType === Node.ELEMENT_NODE) {
      if (child.tagName === 'BR') out.push({ br: true });
      else if (INLINE_KEEP.has(child.tagName)) tokenize(child, out, child.cloneNode(false));
      else out.push({ node: child.cloneNode(true) });
    }
  }
}

/**
 * Split `el` into masked lines.
 * Adds `.sp` to the element; each line is `.sp-line > .sp-line-i`.
 * @returns {{lines: HTMLElement[], revert: () => void}}
 */
export function splitLines(el) {
  if (!el) return { lines: [], revert() {} };
  if (!el.dataset.spOriginal) el.dataset.spOriginal = el.innerHTML;

  const tokens = [];
  tokenize(el, tokens);

  // Pass 1 — every word as an inline-block so we can read its wrap position.
  const frag = document.createDocumentFragment();
  const words = [];
  tokens.forEach((t, i) => {
    if (t.br) {
      const br = document.createElement('br');
      br.dataset.spBr = '1';
      frag.appendChild(br);
      return;
    }
    const w = document.createElement('span');
    w.className = 'sp-w';
    if (t.node) w.appendChild(t.node);
    else if (t.wrapper) {
      const wr = t.wrapper.cloneNode(false);
      wr.textContent = t.text;
      w.appendChild(wr);
    } else {
      w.textContent = t.text;
    }
    frag.appendChild(w);
    words.push(w);
    if (i < tokens.length - 1) frag.appendChild(document.createTextNode(' '));
  });

  el.textContent = '';
  el.appendChild(frag);
  el.classList.add('sp');

  // Pass 2 — group by vertical position.
  const groups = [];
  let currentTop = null;
  let forceBreak = false;
  for (const node of Array.from(el.childNodes)) {
    if (node.nodeType === Node.ELEMENT_NODE && node.dataset?.spBr) {
      forceBreak = true;
      continue;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) continue;
    const top = Math.round(node.offsetTop);
    if (currentTop === null || top !== currentTop || forceBreak) {
      groups.push([]);
      currentTop = top;
      forceBreak = false;
    }
    groups[groups.length - 1].push(node);
  }

  // Pass 3 — rebuild as masked lines.
  const out = document.createDocumentFragment();
  const lines = [];
  groups.forEach((group, i) => {
    const line = document.createElement('span');
    line.className = 'sp-line';
    const inner = document.createElement('span');
    inner.className = 'sp-line-i';
    inner.style.setProperty('--i', i);
    group.forEach((w, j) => {
      if (j) inner.appendChild(document.createTextNode(' '));
      // unwrap the measuring span, keep its contents
      while (w.firstChild) inner.appendChild(w.firstChild);
    });
    line.appendChild(inner);
    out.appendChild(line);
    lines.push(inner);
  });

  el.textContent = '';
  el.appendChild(out);
  el.style.setProperty('--sp-lines', lines.length);

  return {
    lines,
    revert() {
      el.innerHTML = el.dataset.spOriginal;
      el.classList.remove('sp');
    },
  };
}

/** Split into per-character spans (short strings only — one span per glyph). */
export function splitChars(el) {
  if (!el) return [];
  if (!el.dataset.spOriginal) el.dataset.spOriginal = el.innerHTML;
  const text = el.textContent;
  el.textContent = '';
  const chars = [];
  let n = 0;
  for (const ch of text) {
    const s = document.createElement('span');
    s.className = 'sp-c';
    s.style.setProperty('--i', n++);
    if (ch === ' ') {
      s.innerHTML = '&nbsp;';
      s.classList.add('sp-c--space');
    } else {
      s.textContent = ch;
    }
    el.appendChild(s);
    chars.push(s);
  }
  el.classList.add('sp-chars');
  el.setAttribute('aria-label', text);
  return chars;
}

/**
 * Split every `[data-split]` element in scope and keep it correct on resize.
 * data-split="lines" (default) | "chars"
 */
export function autoSplit(root = document) {
  const els = Array.from(root.querySelectorAll('[data-split]'));
  if (!els.length) return;

  const apply = () => {
    for (const el of els) {
      if (el.dataset.split === 'chars') splitChars(el);
      else splitLines(el);
    }
  };

  const run = () => {
    // Only a width change can rewrap text; ignore the phone URL-bar resize.
    apply();
  };

  if (document.fonts?.status === 'loaded') apply();
  else document.fonts?.ready.then(apply) ?? apply();

  let w = window.innerWidth;
  let t;
  addEventListener(
    'resize',
    () => {
      if (window.innerWidth === w) return;
      w = window.innerWidth;
      clearTimeout(t);
      t = setTimeout(() => {
        for (const el of els) if (el.dataset.spOriginal) el.innerHTML = el.dataset.spOriginal;
        run();
        document.dispatchEvent(new CustomEvent('split:reflow'));
      }, 180);
    },
    { passive: true }
  );
}

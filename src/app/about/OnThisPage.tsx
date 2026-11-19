'use client';
// "On this page": the page's sections and subsections, highlighting the one being read. A sticky column on the right on wide
// screens; an icon menu at the top on narrow ones.
import { useEffect, useState } from 'react';
import { ChevronDown, TableOfContents } from 'lucide-react';

export interface TocItem { id: string; title: string; children?: TocItem[] }

const flatten = (items: TocItem[]): TocItem[] => items.flatMap(item => [item, ...flatten(item.children ?? [])]);
const READING_LINE = 120;   // px from the top: the heading last scrolled past this line is the current one

function useCurrentSection(items: TocItem[]): string {
  const [current, setCurrent] = useState(items[0]?.id ?? '');
  useEffect(() => {
    const ids = flatten(items).map(item => item.id);
    const update = () => {
      let found = ids[0];
      for (const id of ids) {
        const heading = document.getElementById(id);
        if (heading && heading.getBoundingClientRect().top <= READING_LINE) found = id;
      }
      const atBottom = window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 4;
      setCurrent(atBottom ? ids[ids.length - 1] : found);
    };
    update();
    window.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update);
    return () => { window.removeEventListener('scroll', update); window.removeEventListener('resize', update); };
  }, [items]);
  return current;
}

function TocList({ items, current, onPick, nested = false }: { items: TocItem[]; current: string; onPick?: () => void; nested?: boolean }) {
  return (
    <ul className={nested ? 'toc-list nested' : 'toc-list'}>
      {items.map(item => (
        <li key={item.id}>
          <a href={'#' + item.id} className={item.id === current ? 'on' : undefined} aria-current={item.id === current ? 'location' : undefined} onClick={onPick}>{item.title}</a>
          {item.children && <TocList items={item.children} current={current} onPick={onPick} nested />}
        </li>
      ))}
    </ul>
  );
}

export default function OnThisPage({ items }: { items: TocItem[] }) {
  const current = useCurrentSection(items);
  const [open, setOpen] = useState(false);
  const currentTitle = flatten(items).find(item => item.id === current)?.title ?? 'On this page';

  return (
    <>
      <div className="toc-mobile">
        <button className="toc-mobile-button" aria-expanded={open} aria-controls="toc-mobile-list" onClick={() => setOpen(isOpen => !isOpen)}>
          <TableOfContents aria-hidden />
          <span className="toc-mobile-label">On this page</span>
          <span className="toc-mobile-current">{currentTitle}</span>
          <ChevronDown className={open ? 'toc-chevron open' : 'toc-chevron'} aria-hidden />
        </button>
        {open && <nav id="toc-mobile-list" className="toc-mobile-list" aria-label="On this page"><TocList items={items} current={current} onPick={() => setOpen(false)} /></nav>}
      </div>
      <aside className="toc-aside">
        <nav aria-label="On this page">
          <p className="toc-title">On this page</p>
          <TocList items={items} current={current} />
        </nav>
      </aside>
    </>
  );
}

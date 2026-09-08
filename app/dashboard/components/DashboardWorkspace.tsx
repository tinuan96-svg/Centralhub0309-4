'use client';

import { ReactNode, useCallback, useEffect, useRef, useState } from 'react';
import { GripVertical, LayoutGrid, Lock, RotateCcw, Save, Settings2, Unlock, Eye, EyeOff, History } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import styles from './DashboardWorkspace.module.css';

type Breakpoint = 'desktop' | 'tablet' | 'mobile';

type WidgetDefinition = {
  id: string;
  title: string;
  description?: string;
  content: ReactNode;
  desktop?: number;
  tablet?: number;
  mobile?: number;
  minHeight?: number;
};

type WidgetLayout = {
  id: string;
  order: number;
  colSpan: number;
  minHeight: number;
  visible: boolean;
};

type LayoutByBreakpoint = Record<Breakpoint, WidgetLayout[]>;

type StoredLayout = {
  version: number;
  breakpoints: LayoutByBreakpoint;
};

const STORAGE_KEY = 'centralhub-dashboard-layout-v2';
const LAYOUT_VERSION = 2;
const SCOPE = 'super_admin';

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function detectBreakpoint(): Breakpoint {
  if (typeof window === 'undefined') return 'desktop';
  if (window.innerWidth < 720) return 'mobile';
  if (window.innerWidth < 1180) return 'tablet';
  return 'desktop';
}

function buildDefaultLayout(widgets: WidgetDefinition[]): StoredLayout {
  const make = (breakpoint: Breakpoint) => widgets.map((widget, order) => ({
    id: widget.id,
    order,
    colSpan: breakpoint === 'desktop' ? (widget.desktop ?? 12) : breakpoint === 'tablet' ? (widget.tablet ?? 12) : (widget.mobile ?? 12),
    minHeight: widget.minHeight ?? 220,
    visible: true,
  }));
  return { version: LAYOUT_VERSION, breakpoints: { desktop: make('desktop'), tablet: make('tablet'), mobile: make('mobile') } };
}

function mergeStoredLayout(stored: StoredLayout | null, defaults: StoredLayout): StoredLayout {
  if (!stored?.breakpoints) return defaults;
  const merge = (breakpoint: Breakpoint) => {
    const known = new Map(defaults.breakpoints[breakpoint].map(item => [item.id, item]));
    const incoming = (stored.breakpoints[breakpoint] || []).filter(item => known.has(item.id));
    const incomingIds = new Set(incoming.map(item => item.id));
    const merged = incoming.map((item, index) => {
      const fallback = known.get(item.id)!;
      return {
        ...fallback,
        ...item,
        order: index,
        colSpan: clamp(Number(item.colSpan) || fallback.colSpan, 3, 12),
        minHeight: clamp(Number(item.minHeight) || fallback.minHeight, 140, 1200),
        visible: item.visible !== false,
      };
    });
    defaults.breakpoints[breakpoint].forEach(item => {
      if (!incomingIds.has(item.id)) merged.push({ ...item, order: merged.length });
    });
    return merged;
  };
  return { version: LAYOUT_VERSION, breakpoints: { desktop: merge('desktop'), tablet: merge('tablet'), mobile: merge('mobile') } };
}

export default function DashboardWorkspace({ widgets }: { widgets: WidgetDefinition[] }) {
  const defaultsRef = useRef<StoredLayout | null>(null);
  if (!defaultsRef.current) defaultsRef.current = buildDefaultLayout(widgets);
  const defaults = defaultsRef.current;
  const [layout, setLayout] = useState<StoredLayout>(defaults);
  const [previousLayout, setPreviousLayout] = useState<StoredLayout | null>(null);
  const [breakpoint, setBreakpoint] = useState<Breakpoint>('desktop');
  const [editing, setEditing] = useState(false);
  const [customising, setCustomising] = useState(false);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'local'>('idle');
  const [hydrated, setHydrated] = useState(false);
  const gridRef = useRef<HTMLDivElement>(null);
  const serverLayoutRef = useRef<StoredLayout | null>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const update = () => setBreakpoint(detectBreakpoint());
    update();
    window.addEventListener('resize', update, { passive: true });
    return () => window.removeEventListener('resize', update);
  }, []);

  useEffect(() => {
    let active = true;
    (async () => {
      let local: StoredLayout | null = null;
      try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw) local = JSON.parse(raw);
      } catch {}
      if (active && local) setLayout(mergeStoredLayout(local, defaults));

      try {
        const { data, error } = await supabase.from('dashboard_layouts').select('layout, previous_layout, version').eq('scope', SCOPE).maybeSingle();
        if (!error && data?.layout && active) {
          const remote = mergeStoredLayout(data.layout as StoredLayout, defaults);
          serverLayoutRef.current = remote;
          setLayout(remote);
          setPreviousLayout(data.previous_layout ? mergeStoredLayout(data.previous_layout as StoredLayout, defaults) : null);
          localStorage.setItem(STORAGE_KEY, JSON.stringify(remote));
        }
      } catch {}
      if (active) setHydrated(true);
    })();
    return () => { active = false; };
  }, [defaults]);

  const persist = useCallback(async (next: StoredLayout) => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); } catch {}
    setSaveState('saving');
    try {
      const previous = serverLayoutRef.current;
      const { error } = await supabase.from('dashboard_layouts').upsert({
        scope: SCOPE,
        version: LAYOUT_VERSION,
        layout: next,
        previous_layout: previous,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'scope' });
      if (error) throw error;
      if (previous) setPreviousLayout(previous);
      serverLayoutRef.current = next;
      setSaveState('saved');
    } catch {
      setSaveState('local');
    }
  }, []);

  const schedulePersist = useCallback((next: StoredLayout) => {
    if (!hydrated) return;
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); } catch {}
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => persist(next), 900);
  }, [hydrated, persist]);

  useEffect(() => () => { if (saveTimerRef.current) clearTimeout(saveTimerRef.current); }, []);

  const updateCurrent = useCallback((updater: (items: WidgetLayout[]) => WidgetLayout[]) => {
    setLayout(current => {
      const next = {
        ...current,
        breakpoints: { ...current.breakpoints, [breakpoint]: updater(current.breakpoints[breakpoint]).map((item, order) => ({ ...item, order })) },
      };
      schedulePersist(next);
      return next;
    });
  }, [breakpoint, schedulePersist]);

  const moveWidget = (sourceId: string, targetId: string) => {
    if (sourceId === targetId) return;
    updateCurrent(items => {
      const next = [...items];
      const from = next.findIndex(item => item.id === sourceId);
      const to = next.findIndex(item => item.id === targetId);
      if (from < 0 || to < 0) return items;
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      return next;
    });
  };

  const nudgeWidget = (id: string, direction: -1 | 1) => {
    updateCurrent(items => {
      const next = [...items];
      const index = next.findIndex(item => item.id === id);
      const target = index + direction;
      if (index < 0 || target < 0 || target >= next.length) return items;
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  };

  const setVisible = (id: string, visible: boolean) => updateCurrent(items => items.map(item => item.id === id ? { ...item, visible } : item));

  const resizeBy = (id: string, colDelta: number, heightDelta: number) => updateCurrent(items => items.map(item => item.id === id ? {
    ...item,
    colSpan: clamp(item.colSpan + colDelta, breakpoint === 'mobile' ? 12 : 3, 12),
    minHeight: clamp(item.minHeight + heightDelta, 140, 1200),
  } : item));

  const beginPointerResize = (event: React.PointerEvent<HTMLButtonElement>, id: string) => {
    if (!editing) return;
    event.preventDefault();
    event.stopPropagation();
    const item = layout.breakpoints[breakpoint].find(entry => entry.id === id);
    if (!item) return;
    const startX = event.clientX;
    const startY = event.clientY;
    const startSpan = item.colSpan;
    const startHeight = item.minHeight;
    const gridWidth = Math.max(gridRef.current?.clientWidth || 1, 1);
    const columnWidth = gridWidth / 12;

    const onMove = (moveEvent: PointerEvent) => {
      const span = breakpoint === 'mobile' ? 12 : clamp(startSpan + Math.round((moveEvent.clientX - startX) / columnWidth), 3, 12);
      const minHeight = clamp(startHeight + Math.round(moveEvent.clientY - startY), 140, 1200);
      updateCurrent(items => items.map(entry => entry.id === id ? { ...entry, colSpan: span, minHeight } : entry));
    };
    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp, { once: true });
  };

  const resetCurrent = () => {
    setLayout(current => {
      const next = { ...current, breakpoints: { ...current.breakpoints, [breakpoint]: defaults.breakpoints[breakpoint].map(item => ({ ...item })) } };
      schedulePersist(next);
      return next;
    });
  };

  const restorePrevious = () => {
    if (!previousLayout) return;
    const restored = mergeStoredLayout(previousLayout, defaults);
    setLayout(restored);
    schedulePersist(restored);
  };

  const ordered = [...layout.breakpoints[breakpoint]].sort((a, b) => a.order - b.order);
  const definitions = new Map(widgets.map(widget => [widget.id, widget]));

  return <div className={styles.workspace} data-editing={editing ? 'true' : 'false'}>
    <div className={styles.toolbar}>
      <div className={styles.toolbarTitle}><LayoutGrid size={17} /><span>Dashboard layout</span><small>{breakpoint}</small></div>
      <div className={styles.toolbarActions}>
        <span className={styles.saveState} aria-live="polite">{saveState === 'saving' ? 'Saving…' : saveState === 'saved' ? 'Saved' : saveState === 'local' ? 'Saved on this device' : ''}</span>
        <button type="button" className="ch-button ch-console-icon" onClick={() => setCustomising(value => !value)} title="Choose dashboard widgets"><Settings2 size={16} /><span className={styles.actionLabel}>Widgets</span></button>
        {editing && <button type="button" className="ch-button ch-console-icon" onClick={resetCurrent} title="Reset this screen size to default"><RotateCcw size={16} /><span className={styles.actionLabel}>Reset</span></button>}
        {editing && previousLayout && <button type="button" className="ch-button ch-console-icon" onClick={restorePrevious} title="Restore previous saved layout"><History size={16} /><span className={styles.actionLabel}>Previous</span></button>}
        {editing && <button type="button" className="ch-button ch-console-icon" onClick={() => persist(layout)} title="Save layout now"><Save size={16} /><span className={styles.actionLabel}>Save</span></button>}
        <button type="button" className="ch-button ch-console-icon" onClick={() => setEditing(value => !value)} aria-pressed={editing} title={editing ? 'Lock dashboard layout' : 'Edit dashboard layout'}>{editing ? <Lock size={16} /> : <Unlock size={16} />}<span className={styles.actionLabel}>{editing ? 'Lock layout' : 'Edit layout'}</span></button>
      </div>
    </div>

    {customising && <div className={styles.library}>
      <div><strong>Widget library</strong><p>Show or hide dashboard modules. Your choice is saved for this screen size.</p></div>
      <div className={styles.libraryGrid}>{ordered.map(item => {
        const definition = definitions.get(item.id);
        if (!definition) return null;
        return <button key={item.id} type="button" className={styles.libraryItem} onClick={() => setVisible(item.id, !item.visible)} aria-pressed={item.visible}>
          {item.visible ? <Eye size={15} /> : <EyeOff size={15} />}<span><strong>{definition.title}</strong>{definition.description && <small>{definition.description}</small>}</span>
        </button>;
      })}</div>
    </div>}

    <div ref={gridRef} className={styles.grid}>
      {ordered.map(item => {
        const definition = definitions.get(item.id);
        if (!definition || !item.visible) return null;
        return <section
          key={item.id}
          className={`${styles.widget} ${draggingId === item.id ? styles.dragging : ''}`}
          style={{ gridColumn: `span ${breakpoint === 'mobile' ? 12 : item.colSpan}`, minHeight: item.minHeight }}
          draggable={editing}
          onDragStart={event => { if (!editing) return; setDraggingId(item.id); event.dataTransfer.effectAllowed = 'move'; event.dataTransfer.setData('text/plain', item.id); }}
          onDragEnd={() => setDraggingId(null)}
          onDragOver={event => { if (editing) { event.preventDefault(); event.dataTransfer.dropEffect = 'move'; } }}
          onDrop={event => { if (!editing) return; event.preventDefault(); const source = event.dataTransfer.getData('text/plain') || draggingId; if (source) moveWidget(source, item.id); setDraggingId(null); }}
        >
          {editing && <div className={styles.editChrome}>
            <div className={styles.dragHandle}><GripVertical size={17} /><span>{definition.title}</span></div>
            <div className={styles.quickControls}>
              <button type="button" onClick={() => nudgeWidget(item.id, -1)} aria-label={`Move ${definition.title} earlier`}>↑</button>
              <button type="button" onClick={() => nudgeWidget(item.id, 1)} aria-label={`Move ${definition.title} later`}>↓</button>
              {breakpoint !== 'mobile' && <><button type="button" onClick={() => resizeBy(item.id, -1, 0)} aria-label={`Make ${definition.title} narrower`}>−W</button><button type="button" onClick={() => resizeBy(item.id, 1, 0)} aria-label={`Make ${definition.title} wider`}>+W</button></>}
              <button type="button" onClick={() => resizeBy(item.id, 0, -60)} aria-label={`Make ${definition.title} shorter`}>−H</button>
              <button type="button" onClick={() => resizeBy(item.id, 0, 60)} aria-label={`Make ${definition.title} taller`}>+H</button>
              <button type="button" onClick={() => setVisible(item.id, false)} aria-label={`Hide ${definition.title}`}><EyeOff size={13} /></button>
            </div>
          </div>}
          <div className={styles.widgetBody}>{definition.content}</div>
          {editing && <button type="button" className={styles.resizeHandle} onPointerDown={event => beginPointerResize(event, item.id)} aria-label={`Resize ${definition.title}`} title="Drag to resize" />}
        </section>;
      })}
    </div>
  </div>;
}

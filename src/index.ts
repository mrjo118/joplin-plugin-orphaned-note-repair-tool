import joplin from 'api';

type ItemType = 'note' | 'notebook';

interface JoplinItem {
  id: string;
  parent_id?: string;
  title?: string;
  deleted_time?: number;
  is_conflict?: number;
}

interface Page<T> {
  items: T[];
  has_more: boolean;
}

interface MissingNotebook {
  id: string;
  noteCount: number;
  notebookCount: number;
}

interface Progress {
  phase: 'notebooks' | 'notes';
  scanned: number;
  pages: number;
}

const PAGE_SIZE = 100;
const PANEL_ID = 'orphanedNoteRepairPanel';
const COMMAND_ID = 'openOrphanedNoteRepairTool';

let panelHandle = '';
let scanRunning = false;
let stopRequested = false;
let missing = new Map<string, MissingNotebook>();
let repairedIds = new Set<string>();
let recreationQueue: Promise<unknown> = Promise.resolve();

const panelHtml = `
<!doctype html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width"></head>
<body>
  <main>
    <h2>Orphaned note repair tool</h2>
    <p class="description">Find notes and notebooks that refer to a missing parent notebook.</p>
    <p>Please note, before scanning you should <strong>manually</strong> click the main sync button and ensure that the sync completes without errors. If you do not do this, recreated notebooks may be deleted immediately after recreating them.</p>
    <div class="controls">
      <button id="scan" type="button">Scan for orphaned notes and notebooks</button>
      <button id="stop" type="button" class="danger" hidden>Stop</button>
    </div>
    <section id="progress" class="progress" hidden aria-live="polite">
      <progress aria-label="Scan in progress"></progress>
      <span id="progressText">Preparing scan…</span>
    </section>
    <p id="status" class="status" role="status">Ready to scan.</p>
    <section aria-labelledby="resultsHeading">
      <h3 id="resultsHeading">Missing notebooks</h3>
      <p id="empty">No missing notebooks found.</p>
      <ul id="results" class="results"></ul>
    </section>
  </main>
</body>
</html>`;

async function send(message: Record<string, unknown>) {
  if (panelHandle) await joplin.views.panels.postMessage(panelHandle, message);
}

async function getPage(path: 'notes' | 'folders', page: number): Promise<Page<JoplinItem>> {
  const query: Record<string, unknown> = {
    fields: path === 'notes' ? ['id', 'parent_id', 'is_conflict'] : ['id', 'parent_id', 'title', 'deleted_time'],
    page,
    limit: PAGE_SIZE,
  };
  if (path === 'folders') query.include_deleted = '1';
  return joplin.data.get([path], query);
}

async function collectNotebooks(progress: Progress): Promise<{ folders: JoplinItem[]; stopped: boolean }> {
  const folders: JoplinItem[] = [];
  for (let page = 1; ; page += 1) {
    if (stopRequested) return { folders, stopped: true };
    const response = await getPage('folders', page);
    progress.pages += 1;
    for (const folder of response.items) {
      if (stopRequested) return { folders, stopped: true };
      folders.push(folder);
      progress.scanned += 1;
      await send({ type: 'progress', progress });
    }
    if (!response.has_more) return { folders, stopped: false };
  }
}

async function recordMissing(parentId: string, itemType: ItemType) {
  if (repairedIds.has(parentId)) return;
  let entry = missing.get(parentId);
  if (!entry) {
    entry = { id: parentId, noteCount: 0, notebookCount: 0 };
    missing.set(parentId, entry);
  }
  if (itemType === 'note') entry.noteCount += 1;
  else entry.notebookCount += 1;
  await send({ type: 'missing-updated', entry });
}

async function scanItems(
  path: 'notes' | 'folders',
  itemType: ItemType,
  existingIds: Set<string>,
  progress: Progress,
  prefetchedItems?: JoplinItem[],
): Promise<boolean> {
  const inspect = async (item: JoplinItem) => {
    if (stopRequested) return false;
    if (itemType === 'note' && item.is_conflict) return true;
    const parentId = item.parent_id || '';
    if (parentId && !existingIds.has(parentId)) await recordMissing(parentId, itemType);
    progress.scanned += 1;
    await send({ type: 'progress', progress });
    return true;
  };

  if (prefetchedItems) {
    for (const item of prefetchedItems) if (!(await inspect(item))) return false;
    return true;
  }

  for (let page = 1; ; page += 1) {
    if (stopRequested) return false;
    const response = await getPage(path, page);
    progress.pages += 1;
    for (const item of response.items) if (!(await inspect(item))) return false;
    if (!response.has_more) return true;
  }
}

async function runScan() {
  if (scanRunning) return;
  scanRunning = true;
  stopRequested = false;
  missing = new Map();
  repairedIds = new Set();
  await send({ type: 'scan-started' });

  try {
    const collectionProgress: Progress = { phase: 'notebooks', scanned: 0, pages: 0 };
    const collected = await collectNotebooks(collectionProgress);
    if (collected.stopped) {
      await send({ type: 'scan-stopped', count: missing.size });
      return;
    }

    const existingIds = new Set(collected.folders.map(folder => folder.id));
    const notebookProgress: Progress = { phase: 'notebooks', scanned: 0, pages: collectionProgress.pages };
    const activeFolders = collected.folders.filter(folder => !folder.deleted_time);
    if (!(await scanItems('folders', 'notebook', existingIds, notebookProgress, activeFolders))) {
      await send({ type: 'scan-stopped', count: missing.size });
      return;
    }

    const noteProgress: Progress = { phase: 'notes', scanned: 0, pages: 0 };
    if (!(await scanItems('notes', 'note', existingIds, noteProgress))) {
      await send({ type: 'scan-stopped', count: missing.size });
      return;
    }
    await send({ type: 'scan-completed', count: missing.size });
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    await send({ type: 'scan-failed', detail });
  } finally {
    scanRunning = false;
    stopRequested = false;
  }
}

async function allNotebookTitles(): Promise<Set<string>> {
  const titles = new Set<string>();
  for (let page = 1; ; page += 1) {
    const response = await getPage('folders', page);
    for (const folder of response.items) titles.add(folder.title || '');
    if (!response.has_more) return titles;
  }
}

function uniqueRecoveredTitle(titles: Set<string>): string {
  const base = 'Recovered Notebook';
  if (!titles.has(base)) return base;
  for (let number = 2; ; number += 1) {
    const candidate = `${base} (${number})`;
    if (!titles.has(candidate)) return candidate;
  }
}

async function recreateNotebook(id: string) {
  const entry = missing.get(id);
  if (!entry) return { ok: false, detail: 'This missing notebook is no longer in the results.' };

  try {
    const title = uniqueRecoveredTitle(await allNotebookTitles());
    await joplin.data.post(['folders'], null, { id, title });
    missing.delete(id);
    repairedIds.add(id);
    return { ok: true, id, title };
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    return { ok: false, id, detail };
  }
}

joplin.plugins.register({
  onStart: async () => {
    const { platform } = await joplin.versionInfo();
    panelHandle = await joplin.views.panels.create(PANEL_ID);
    await joplin.views.panels.setHtml(panelHandle, panelHtml);
    await joplin.views.panels.addScript(panelHandle, './webview.js');
    await joplin.views.panels.addScript(panelHandle, './webview.css');
    if (platform === 'desktop') await joplin.views.panels.show(panelHandle, false);

    joplin.views.panels.onMessage(panelHandle, async message => {
      if (message?.type === 'scan') {
        void runScan();
        return;
      }
      if (message?.type === 'stop') {
        stopRequested = true;
        return;
      }
      if (message?.type === 'recreate') {
        const result = recreationQueue.then(() => recreateNotebook(String(message.id)));
        recreationQueue = result.then(() => undefined, () => undefined);
        return result;
      }
    });

    if (platform === 'desktop') {
      await joplin.commands.register({
        name: COMMAND_ID,
        label: 'Orphaned note repair tool',
        iconName: 'fas fa-wrench',
        execute: async () => {
          const isVisible = await joplin.views.panels.visible(panelHandle);
          await joplin.views.panels.show(panelHandle, !isVisible);
        },
      });
      await joplin.views.menuItems.create(
        'openOrphanedNoteRepairToolMenuItem',
        COMMAND_ID,
        'tools',
      );
    }
  },
});

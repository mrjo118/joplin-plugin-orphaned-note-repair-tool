const scanButton = document.getElementById('scan');
const stopButton = document.getElementById('stop');
const progress = document.getElementById('progress');
const progressText = document.getElementById('progressText');
const status = document.getElementById('status');
const results = document.getElementById('results');
const empty = document.getElementById('empty');

const rows = new Map();

function setScanning(scanning) {
  scanButton.disabled = scanning;
  stopButton.hidden = !scanning;
  stopButton.disabled = false;
  progress.hidden = !scanning;
}

function resetResults() {
  rows.clear();
  results.replaceChildren();
  empty.hidden = false;
}

function countLabel(entry) {
  const notes = `${entry.noteCount} ${entry.noteCount === 1 ? 'note' : 'notes'}`;
  const notebooks = `${entry.notebookCount} ${entry.notebookCount === 1 ? 'notebook' : 'notebooks'}`;
  return `${notes}, ${notebooks}`;
}

function updateMissing(entry) {
  let row = rows.get(entry.id);
  if (!row) {
    const item = document.createElement('li');
    item.className = 'result';

    const details = document.createElement('div');
    const heading = document.createElement('strong');
    heading.textContent = 'Missing notebook';
    const id = document.createElement('code');
    id.textContent = entry.id;
    const count = document.createElement('span');
    count.className = 'count';
    details.append(heading, id, count);

    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = 'Recreate notebook';
    button.addEventListener('click', () => recreate(entry.id, button, item));
    item.append(details, button);
    results.append(item);
    row = { count, item };
    rows.set(entry.id, row);
    empty.hidden = true;
  }
  row.count.textContent = countLabel(entry);
}

async function recreate(id, button, item) {
  button.disabled = true;
  button.textContent = 'Recreating…';
  const response = await webviewApi.postMessage({ type: 'recreate', id });
  if (response.ok) {
    item.remove();
    rows.delete(id);
    empty.hidden = rows.size > 0;
    status.textContent = `Recreated ${id} as “${response.title}”.`;
  } else {
    button.disabled = false;
    button.textContent = 'Retry recreation';
    status.textContent = `Could not recreate ${id}: ${response.detail}`;
  }
}

scanButton.addEventListener('click', async () => {
  scanButton.disabled = true;
  await webviewApi.postMessage({ type: 'scan' });
});

stopButton.addEventListener('click', async () => {
  stopButton.disabled = true;
  progressText.textContent = 'Stopping after the current item…';
  await webviewApi.postMessage({ type: 'stop' });
});

webviewApi.onMessage(event => {
  const message = event.message;
  switch (message.type) {
    case 'scan-started':
      resetResults();
      setScanning(true);
      status.textContent = 'Scan in progress…';
      progressText.textContent = 'Loading notebooks…';
      break;
    case 'progress': {
      const kind = message.progress.phase === 'notes' ? 'notes' : 'notebooks';
      progressText.textContent = `Scanning ${kind}: ${message.progress.scanned} checked (${message.progress.pages} pages loaded)`;
      break;
    }
    case 'missing-updated':
      updateMissing(message.entry);
      break;
    case 'scan-completed':
      setScanning(false);
      status.textContent = `Scan completed. ${message.count} missing ${message.count === 1 ? 'notebook' : 'notebooks'} found.`;
      break;
    case 'scan-stopped':
      setScanning(false);
      status.textContent = `Scan stopped. ${message.count} missing ${message.count === 1 ? 'notebook' : 'notebooks'} found so far. Existing results can still be repaired.`;
      break;
    case 'scan-failed':
      setScanning(false);
      status.textContent = `Scan failed: ${message.detail}`;
      break;
  }
});

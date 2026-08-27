import { generateDanfePdf, parseNfe } from './danfe.js';

const MAX_FILES = 200;

const state = {
  files: [],
  results: [],
};

const $ = (sel) => document.querySelector(sel);
const dropzone = $('#dropzone');
const fileInput = $('#fileInput');
const fileList = $('#fileList');
const btnConvert = $('#btnConvert');
const btnClear = $('#btnClear');
const emptyState = $('#emptyState');
const resultsList = $('#resultsList');
const downloadAllWrap = $('#downloadAllWrap');
const btnDownloadAll = $('#btnDownloadAll');
const toast = $('#toast');

function formatBytes(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / 1048576).toFixed(1) + ' MB';
}

function showToast(msg, type = '') {
  toast.textContent = msg;
  toast.className = 'toast' + (type ? ` ${type}` : '');
  setTimeout(() => toast.classList.add('hidden'), 3200);
}

function tag(doc, name) {
  return doc.getElementsByTagName(name)[0]?.textContent?.trim() || '';
}

function formatChave(chave) {
  return chave.replace(/\D/g, '').replace(/(\d{4})(?=\d)/g, '$1 ').trim();
}

function formatDateTime(v) {
  const m = String(v).match(/^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2}):(\d{2}))?/);
  if (!m) return v || '';
  const [, y, mo, d, h, mi, s] = m;
  return h ? `${d}/${mo}/${y} ${h}:${mi}:${s}` : `${d}/${mo}/${y}`;
}

function formatMoney(v) {
  const n = Number(String(v).replace(',', '.'));
  if (!Number.isFinite(n)) return '0,00';
  return n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function extractNFeInfo(xmlStr) {
  try {
    const xml = xmlStr.replace(/xmlns(:\w+)?="[^"]*"/g, '');
    const doc = new DOMParser().parseFromString(xml, 'text/xml');
    const inf = doc.getElementsByTagName('infNFe')[0];
    const prot = doc.getElementsByTagName('infProt')[0];
    const chave =
      tag(prot || doc, 'chNFe') ||
      (inf?.getAttribute('Id') || '').replace(/^NFe/i, '');
    return {
      nNF: tag(doc, 'nNF') || '?',
      serie: tag(doc, 'serie'),
      emit: tag(doc.getElementsByTagName('emit')[0] || doc, 'xNome'),
      dest: tag(doc.getElementsByTagName('dest')[0] || doc, 'xNome'),
      dhEmi: tag(doc, 'dhEmi') || tag(doc, 'dEmi'),
      chave,
      vNF: tag(doc, 'vNF'),
      mod: tag(doc, 'mod'),
    };
  } catch {
    return { nNF: '?', serie: '', emit: '', dest: '', dhEmi: '', chave: '', vNF: '', mod: '' };
  }
}

function addFiles(fileListLike) {
  const arr = Array.from(fileListLike).filter(
    (f) => f.name.toLowerCase().endsWith('.xml') || f.type.includes('xml')
  );
  if (!arr.length) {
    showToast('Selecione arquivos .xml', 'error');
    return;
  }
  if (state.files.length + arr.length > MAX_FILES) {
    showToast(`Máximo de ${MAX_FILES} arquivos por vez`, 'error');
    return;
  }
  const readers = arr.map(
    (file) =>
      new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = () => resolve({ file, name: file.name, size: file.size, xml: reader.result });
        reader.onerror = () => resolve(null);
        reader.readAsText(file, 'UTF-8');
      })
  );
  Promise.all(readers).then((items) => {
    const valid = items.filter(Boolean);
    const existing = new Set(state.files.map((f) => f.name));
    const newOnes = valid.filter((f) => !existing.has(f.name));
    state.files.push(...newOnes);
    renderFileList();
    updateButtons();
    updateStats();
    if (newOnes.length) showToast(`${newOnes.length} arquivo(s) adicionado(s)`);
  });
}

function removeFile(index) {
  state.files.splice(index, 1);
  renderFileList();
  updateButtons();
}

function renderFileList() {
  if (!state.files.length) {
    fileList.classList.add('hidden');
    dropzone.classList.remove('hidden');
    return;
  }
  dropzone.classList.add('hidden');
  fileList.classList.remove('hidden');
  fileList.innerHTML = state.files
    .map(
      (f, i) => `
    <div class="file-item">
      <span class="name" title="${f.name}">${f.name}</span>
      <span class="size">${formatBytes(f.size)}</span>
      <button class="remove" data-idx="${i}" title="Remover">×</button>
    </div>`
    )
    .join('');
  fileList.querySelectorAll('.remove').forEach((btn) => {
    btn.addEventListener('click', () => removeFile(+btn.dataset.idx));
  });
}

function updateButtons() {
  const has = state.files.length > 0;
  btnConvert.disabled = !has;
  btnClear.disabled = !has;
}

function updateStats() {
  const lidos = state.results.length || state.files.length;
  const prontos = state.results.filter((r) => r.pdfBlob).length;
  const falhas = state.results.filter((r) => r.error).length;
  const total = state.results.reduce((acc, r) => {
    const n = Number(String(r.vNF || '').replace(',', '.'));
    return acc + (Number.isFinite(n) ? n : 0);
  }, 0);
  $('#statLidos').textContent = String(lidos);
  $('#statProntos').textContent = String(prontos);
  $('#statFalhas').textContent = String(falhas);
  $('#statTotal').textContent = 'R$ ' + formatMoney(total);
}

async function convertAll() {
  if (!state.files.length) return;
  btnConvert.disabled = true;
  btnConvert.innerHTML = `<span class="spinner"></span> Gerando...`;
  state.results = [];
  emptyState.classList.add('hidden');
  resultsList.classList.remove('hidden');
  resultsList.innerHTML = '';
  downloadAllWrap.classList.add('hidden');

  for (let i = 0; i < state.files.length; i++) {
    const item = state.files[i];
    const info = extractNFeInfo(item.xml);
    if (info.mod && info.mod !== '55') {
      state.results.push({ ...info, name: item.name, error: `Modelo ${info.mod} não suportado (apenas NF-e 55)` });
      renderResults();
      continue;
    }
    try {
      const nfe = parseNfe(item.xml);
      const pdfBytes = await generateDanfePdf(nfe);
      const blob = new Blob([pdfBytes], { type: 'application/pdf' });
      state.results.push({ ...info, name: item.name, pdfBlob: blob });
    } catch (err) {
      console.error(err);
      state.results.push({ ...info, name: item.name, error: err?.message || 'Erro ao gerar DANFE' });
    }
    renderResults();
  }

  btnConvert.innerHTML = `<span class="btn-icon">⚡</span> Gerar DANFEs`;
  btnConvert.disabled = false;
  const ok = state.results.filter((r) => r.pdfBlob).length;
  showToast(ok ? `${ok} DANFE(s) gerado(s)` : 'Nenhum DANFE gerado', ok ? 'success' : 'error');
}

function renderResults() {
  updateStats();
  resultsList.innerHTML = state.results
    .map((r, i) => {
      if (r.error) {
        return `
        <div class="result-row error">
          <div class="result-compact">
            <div class="line1">NF-e ${r.nNF || r.name} · ${r.error}</div>
          </div>
        </div>`;
      }
      return `
      <div class="result-row">
        <div class="result-compact">
          <div class="line1">
            NF-e ${r.nNF}${r.serie ? `/${r.serie}` : ''}
            <span class="muted">${r.dhEmi ? formatDateTime(r.dhEmi) : '—'}</span>
            ${r.vNF ? `<span class="val">R$ ${formatMoney(r.vNF)}</span>` : ''}
          </div>
          <div class="line2">
            <span class="lbl">Emit.</span> ${r.emit || '—'}
            <span class="dot">·</span>
            <span class="lbl">Dest.</span> ${r.dest || '—'}
          </div>
          <div class="line3">${r.chave ? formatChave(r.chave) : '—'}</div>
        </div>
        <button class="btn-pdf" data-idx="${i}">PDF</button>
      </div>`;
    })
    .join('');
  resultsList.querySelectorAll('.btn-pdf').forEach((btn) => {
    btn.addEventListener('click', () => downloadOne(+btn.dataset.idx));
  });
  if (state.results.some((r) => r.pdfBlob)) downloadAllWrap.classList.remove('hidden');
}

function downloadOne(index) {
  const r = state.results[index];
  if (!r?.pdfBlob) return;
  const a = document.createElement('a');
  a.href = URL.createObjectURL(r.pdfBlob);
  a.download = `DANFE_${r.nNF || index}.pdf`;
  a.click();
  URL.revokeObjectURL(a.href);
}

async function downloadAllZip() {
  const ok = state.results.filter((r) => r.pdfBlob);
  if (!ok.length) return;
  btnDownloadAll.disabled = true;
  btnDownloadAll.innerHTML = `<span class="spinner"></span> Compactando...`;
  const zip = new JSZip();
  ok.forEach((r, i) => zip.file(`DANFE_${r.nNF || i}.pdf`, r.pdfBlob));
  const blob = await zip.generateAsync({ type: 'blob' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `DANFEs_${ok.length}_notas.zip`;
  a.click();
  URL.revokeObjectURL(a.href);
  btnDownloadAll.innerHTML = `<span class="btn-icon">📦</span> Baixar todos os PDFs em ZIP`;
  btnDownloadAll.disabled = false;
  showToast('ZIP baixado', 'success');
}

function clearAll() {
  state.files = [];
  state.results = [];
  renderFileList();
  updateButtons();
  resultsList.classList.add('hidden');
  resultsList.innerHTML = '';
  emptyState.classList.remove('hidden');
  downloadAllWrap.classList.add('hidden');
  dropzone.classList.remove('hidden');
  updateStats();
}

dropzone.addEventListener('dragover', (e) => {
  e.preventDefault();
  dropzone.classList.add('dragover');
});
dropzone.addEventListener('dragleave', () => dropzone.classList.remove('dragover'));
dropzone.addEventListener('drop', (e) => {
  e.preventDefault();
  dropzone.classList.remove('dragover');
  if (e.dataTransfer.files.length) addFiles(e.dataTransfer.files);
});

function onFileChange(input) {
  if (input.files.length) addFiles(input.files);
  input.value = '';
}
fileInput.addEventListener('change', () => onFileChange(fileInput));

btnConvert.addEventListener('click', convertAll);
btnClear.addEventListener('click', clearAll);
btnDownloadAll.addEventListener('click', downloadAllZip);


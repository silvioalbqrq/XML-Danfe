/**
 * XML-Danfe — Conversor XML → DANFE (PDF)
 * Processamento 100% no navegador com node-sped-pdf
 */

import { DANFe } from 'https://cdn.jsdelivr.net/npm/node-sped-pdf@1.0.66/+esm';

// ===== State =====
const state = {
  files: [],       // { file, name, size, xml }
  results: [],     // { name, num, emit, pdfBlob, error }
};

// ===== DOM =====
const $ = (sel) => document.querySelector(sel);
const dropzone = $('#dropzone');
const fileInput = $('#fileInput');
const fileInputBtn = $('#fileInputBtn');
const fileList = $('#fileList');
const btnConvert = $('#btnConvert');
const btnClear = $('#btnClear');
const emptyState = $('#emptyState');
const resultsList = $('#resultsList');
const downloadAllWrap = $('#downloadAllWrap');
const btnDownloadAll = $('#btnDownloadAll');
const toast = $('#toast');

// ===== Helpers =====
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

function extractNFeInfo(xmlStr) {
  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(xmlStr, 'text/xml');
    const nNF = doc.querySelector('ide nNF')?.textContent || '?';
    const serie = doc.querySelector('ide serie')?.textContent || '';
    const emit = doc.querySelector('emit xNome')?.textContent || '';
    const mod = doc.querySelector('ide mod')?.textContent || '';
    return { nNF, serie, emit, mod };
  } catch {
    return { nNF: '?', serie: '', emit: '', mod: '' };
  }
}

// ===== File handling =====
function addFiles(fileListLike) {
  const arr = Array.from(fileListLike).filter(
    (f) => f.name.toLowerCase().endsWith('.xml') || f.type.includes('xml')
  );

  if (!arr.length) {
    showToast('Selecione arquivos .xml', 'error');
    return;
  }

  if (state.files.length + arr.length > 50) {
    showToast('Máximo de 50 arquivos por vez', 'error');
    return;
  }

  const readers = arr.map(
    (file) =>
      new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = () => {
          resolve({
            file,
            name: file.name,
            size: file.size,
            xml: reader.result,
          });
        };
        reader.onerror = () => resolve(null);
        reader.readAsText(file, 'UTF-8');
      })
  );

  Promise.all(readers).then((items) => {
    const valid = items.filter(Boolean);
    // avoid duplicates by name
    const existing = new Set(state.files.map((f) => f.name));
    const newOnes = valid.filter((f) => !existing.has(f.name));
    state.files.push(...newOnes);
    renderFileList();
    updateButtons();
    if (newOnes.length) {
      showToast(`${newOnes.length} arquivo(s) adicionado(s)`);
    }
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

// ===== Convert =====
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

    // Only NF-e model 55
    if (info.mod && info.mod !== '55') {
      state.results.push({
        name: item.name,
        num: info.nNF,
        emit: info.emit,
        error: `Modelo ${info.mod} não suportado (apenas NF-e 55)`,
      });
      renderResults();
      continue;
    }

    try {
      const pdfBytes = await DANFe({ xml: item.xml });
      const blob = new Blob([pdfBytes], { type: 'application/pdf' });
      state.results.push({
        name: item.name,
        num: info.nNF,
        serie: info.serie,
        emit: info.emit,
        pdfBlob: blob,
      });
    } catch (err) {
      console.error(err);
      state.results.push({
        name: item.name,
        num: info.nNF,
        emit: info.emit,
        error: err?.message || 'Erro ao gerar DANFE',
      });
    }
    renderResults();
  }

  btnConvert.innerHTML = `<span class="btn-icon">⚡</span> Gerar DANFEs`;
  btnConvert.disabled = false;

  const ok = state.results.filter((r) => r.pdfBlob).length;
  if (ok > 0) {
    downloadAllWrap.classList.remove('hidden');
    showToast(`${ok} DANFE(s) gerado(s)`, 'success');
  } else {
    showToast('Nenhum DANFE gerado', 'error');
  }
}

function renderResults() {
  resultsList.innerHTML = state.results
    .map((r, i) => {
      if (r.error) {
        return `
        <div class="result-item error">
          <div class="result-info">
            <div class="num">✗ ${r.name}</div>
            <div class="meta">${r.error}</div>
          </div>
        </div>`;
      }
      return `
      <div class="result-item">
        <div class="result-info">
          <div class="num">NF-e nº ${r.num}${r.serie ? ` / série ${r.serie}` : ''}</div>
          <div class="meta">${r.emit || r.name}</div>
        </div>
        <button class="btn btn-sm btn-download" data-idx="${i}">Baixar PDF</button>
      </div>`;
    })
    .join('');

  resultsList.querySelectorAll('.btn-download').forEach((btn) => {
    btn.addEventListener('click', () => downloadOne(+btn.dataset.idx));
  });
}

function downloadOne(index) {
  const r = state.results[index];
  if (!r?.pdfBlob) return;
  const a = document.createElement('a');
  a.href = URL.createObjectURL(r.pdfBlob);
  a.download = `DANFE_${r.num || index}.pdf`;
  a.click();
  URL.revokeObjectURL(a.href);
}

async function downloadAllZip() {
  const ok = state.results.filter((r) => r.pdfBlob);
  if (!ok.length) return;

  btnDownloadAll.disabled = true;
  btnDownloadAll.innerHTML = `<span class="spinner"></span> Compactando...`;

  const zip = new JSZip();
  ok.forEach((r, i) => {
    zip.file(`DANFE_${r.num || i}.pdf`, r.pdfBlob);
  });

  const blob = await zip.generateAsync({ type: 'blob' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `DANFEs_${ok.length}_notas.zip`;
  a.click();
  URL.revokeObjectURL(a.href);

  btnDownloadAll.innerHTML = `<span class="btn-icon">📦</span> Baixar todos (ZIP)`;
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
}

// ===== Events =====
dropzone.addEventListener('dragover', (e) => {
  e.preventDefault();
  dropzone.classList.add('dragover');
});

dropzone.addEventListener('dragleave', () => {
  dropzone.classList.remove('dragover');
});

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
if (fileInputBtn) {
  fileInputBtn.addEventListener('change', () => onFileChange(fileInputBtn));
}

btnConvert.addEventListener('click', convertAll);
btnClear.addEventListener('click', clearAll);
btnDownloadAll.addEventListener('click', downloadAllZip);

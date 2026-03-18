// ===========================
// PDF Merger - Main JS
// Client-side merging with pdf-lib
// ===========================

// PDF.js worker
pdfjsLib.GlobalWorkerOptions.workerSrc =
    'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

// ===========================
// State
// ===========================
let files = [];          // [{id, file, name, size, arrayBuffer}]
let pageSelections = {}; // {id: Set<number>}  1-indexed
let pageCounts = {};     // {id: number}
let pdfDocs = {};        // {id: pdfjsDoc}  stored for modal re-render
let nextId = 0;

// ===========================
// DOM References
// ===========================
const dropZone            = document.getElementById('dropZone');
const fileInput           = document.getElementById('fileInput');
const pageSelectorSection = document.getElementById('pageSelectorSection');
const pdfCardsContainer   = document.getElementById('pdfCardsContainer');
const mergeBtn            = document.getElementById('mergeBtn');
const selectionSummary    = document.getElementById('selectionSummary');
const clearAllFilesBtn    = document.getElementById('clearAllFilesBtn');
const wfStep2             = document.getElementById('wfStep2');
const wfStep3             = document.getElementById('wfStep3');
const wfLine1             = document.getElementById('wfLine1');
const wfLine2             = document.getElementById('wfLine2');

// Modal DOM
const pageModal           = document.getElementById('pageModal');
const modalCanvas         = document.getElementById('modalCanvas');
const modalTitle          = document.getElementById('modalTitle');
const modalSelectBtn      = document.getElementById('modalSelectBtn');
const modalClose          = document.getElementById('modalClose');
const modalPrev           = document.getElementById('modalPrev');
const modalNext           = document.getElementById('modalNext');
const modalLoading        = document.getElementById('modalLoading');

// ===========================
// Drop Zone Events
// ===========================
dropZone.addEventListener('click', (e) => {
    if (!e.target.closest('label')) fileInput.click();
});

fileInput.addEventListener('change', (e) => {
    handleFiles(Array.from(e.target.files));
    fileInput.value = '';
});

dropZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropZone.classList.add('drag-over');
});

dropZone.addEventListener('dragleave', () => dropZone.classList.remove('drag-over'));

dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropZone.classList.remove('drag-over');
    handleFiles(Array.from(e.dataTransfer.files));
});

clearAllFilesBtn.addEventListener('click', () => {
    files = [];
    pageSelections = {};
    pageCounts = {};
    pdfDocs = {};
    pdfCardsContainer.innerHTML = '';
    wfStep2.classList.remove('active');
    wfStep3.classList.remove('active');
    wfLine1.classList.remove('active');
    wfLine2.classList.remove('active');
    updateVisibility();
});

// ===========================
// File Handling
// ===========================
function handleFiles(newFiles) {
    const pdfs = newFiles.filter(f => f.type === 'application/pdf');
    if (!pdfs.length) return;

    pdfs.forEach(file => {
        const id = nextId++;
        files.push({ id, file, name: file.name, size: file.size });
        pageSelections[id] = new Set();
        createAndLoadCard(id);
    });

    wfStep2.classList.add('active');
    wfLine1.classList.add('active');
    updateVisibility();
}

function removeFile(id) {
    files = files.filter(f => f.id !== id);
    delete pageSelections[id];
    delete pageCounts[id];
    delete pdfDocs[id];
    document.getElementById(`pdfCard-${id}`)?.remove();

    if (files.length === 0) {
        wfStep2.classList.remove('active');
        wfStep3.classList.remove('active');
        wfLine1.classList.remove('active');
        wfLine2.classList.remove('active');
    }

    updateVisibility();
    updateMergeBar();
}

// ===========================
// PDF Card Creation
// ===========================
function createAndLoadCard(id) {
    const fileObj = files.find(f => f.id === id);
    if (!fileObj) return;

    const card = document.createElement('div');
    card.className = 'pdf-selector-card';
    card.id = `pdfCard-${id}`;
    card.innerHTML = `
        <div class="pdf-selector-card-header">
            <div class="pdf-header-info">
                <div class="pdf-card-icon">
                    <i class="bi bi-file-earmark-pdf-fill"></i>
                </div>
                <div class="pdf-header-text">
                    <div class="pdf-card-name" title="${escapeHtml(fileObj.name)}">${escapeHtml(fileObj.name)}</div>
                    <div class="pdf-card-meta">
                        ${formatSize(fileObj.size)}
                        &bull; <span class="pdf-page-count">Loading...</span>
                        &bull; <span class="pdf-selected-count">0 selected</span>
                    </div>
                </div>
            </div>
            <div class="pdf-header-actions">
                <button class="btn-page-action" onclick="selectAllPages(${id})">
                    <i class="bi bi-check2-all me-1"></i>All
                </button>
                <button class="btn-page-action" onclick="deselectAllPages(${id})">
                    <i class="bi bi-x-lg me-1"></i>None
                </button>
                <button class="btn-remove-pdf" onclick="removeFile(${id})" title="Remove this PDF">
                    <i class="bi bi-trash"></i>
                </button>
            </div>
        </div>
        <div class="pdf-card-body">
            <div class="pdf-loading" id="pdfLoading-${id}">
                <div class="spinner-border spinner-border-sm text-primary me-2" role="status"></div>
                <span class="text-muted small">Rendering page previews...</span>
            </div>
            <div class="pages-grid" id="pagesGrid-${id}"></div>
        </div>
    `;

    pdfCardsContainer.appendChild(card);
    loadPDF(id, fileObj);
}

// ===========================
// PDF.js Loading & Rendering
// ===========================
async function loadPDF(id, fileObj) {
    try {
        const arrayBuffer = await fileObj.file.arrayBuffer();
        // Store the array buffer for merging later
        fileObj.arrayBuffer = arrayBuffer.slice(0);

        const pdfDoc = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
        pdfDocs[id] = pdfDoc;  // store for modal re-render

        const numPages = pdfDoc.numPages;
        pageCounts[id] = numPages;

        const card = document.getElementById(`pdfCard-${id}`);
        if (!card) return;
        card.querySelector('.pdf-page-count').textContent =
            `${numPages} page${numPages !== 1 ? 's' : ''}`;

        // Pre-select all pages
        for (let i = 1; i <= numPages; i++) {
            pageSelections[id].add(i);
        }

        const grid = document.getElementById(`pagesGrid-${id}`);

        for (let pageNum = 1; pageNum <= numPages; pageNum++) {
            const page = await pdfDoc.getPage(pageNum);
            const thumb = await buildThumb(id, pageNum, page);
            grid.appendChild(thumb);
        }

        document.getElementById(`pdfLoading-${id}`).style.display = 'none';
        updateSelectionCounter(id);
        updateMergeBar();

    } catch (err) {
        const loadingEl = document.getElementById(`pdfLoading-${id}`);
        if (loadingEl) {
            loadingEl.innerHTML = `
                <span class="text-danger small">
                    <i class="bi bi-exclamation-triangle me-1"></i>
                    Failed to load PDF: ${escapeHtml(err.message)}
                </span>`;
        }
    }
}

async function buildThumb(fileId, pageNum, page) {
    const viewport = page.getViewport({ scale: 1 });
    const scale = 120 / viewport.width;
    const scaledViewport = page.getViewport({ scale });

    const canvas = document.createElement('canvas');
    canvas.width = Math.round(scaledViewport.width);
    canvas.height = Math.round(scaledViewport.height);

    await page.render({
        canvasContext: canvas.getContext('2d'),
        viewport: scaledViewport
    }).promise;

    const wrapper = document.createElement('div');
    wrapper.className = 'page-thumb selected';
    wrapper.dataset.fileId = fileId;
    wrapper.dataset.pageNum = pageNum;
    wrapper.title = `Page ${pageNum} — click to toggle`;

    wrapper.appendChild(canvas);
    wrapper.insertAdjacentHTML('beforeend', `
        <div class="page-thumb-overlay">
            <i class="bi bi-check-circle-fill"></i>
        </div>
        <button class="page-zoom-btn" title="Enlarge preview">
            <i class="bi bi-arrows-fullscreen"></i>
        </button>
        <div class="page-thumb-number">${pageNum}</div>
    `);

    // Toggle selection on thumb click
    wrapper.addEventListener('click', (e) => {
        if (!e.target.closest('.page-zoom-btn')) {
            togglePage(fileId, pageNum, wrapper);
        }
    });

    // Open modal on zoom button click
    wrapper.querySelector('.page-zoom-btn').addEventListener('click', (e) => {
        e.stopPropagation();
        openModal(fileId, pageNum);
    });

    return wrapper;
}

// ===========================
// Page Selection
// ===========================
function togglePage(fileId, pageNum, el) {
    if (pageSelections[fileId].has(pageNum)) {
        pageSelections[fileId].delete(pageNum);
        el.classList.remove('selected');
    } else {
        pageSelections[fileId].add(pageNum);
        el.classList.add('selected');
    }
    updateSelectionCounter(fileId);
    updateMergeBar();
}

function selectAllPages(fileId) {
    const total = pageCounts[fileId] || 0;
    for (let i = 1; i <= total; i++) pageSelections[fileId].add(i);
    document.querySelectorAll(`[data-file-id="${fileId}"]`)
        .forEach(el => el.classList.add('selected'));
    updateSelectionCounter(fileId);
    updateMergeBar();
}

function deselectAllPages(fileId) {
    pageSelections[fileId].clear();
    document.querySelectorAll(`[data-file-id="${fileId}"]`)
        .forEach(el => el.classList.remove('selected'));
    updateSelectionCounter(fileId);
    updateMergeBar();
}

function updateSelectionCounter(fileId) {
    const selected = pageSelections[fileId]?.size ?? 0;
    const total = pageCounts[fileId] ?? '?';
    const card = document.getElementById(`pdfCard-${fileId}`);
    if (!card) return;

    const el = card.querySelector('.pdf-selected-count');
    el.textContent = `${selected}/${total} selected`;
    el.style.color = selected > 0 ? 'var(--primary-light)' : 'var(--text-muted)';
}

// ===========================
// Merge Bar
// ===========================
function updateMergeBar() {
    let totalPages = 0;
    files.forEach(f => { totalPages += pageSelections[f.id]?.size || 0; });

    mergeBtn.disabled = totalPages === 0;
    selectionSummary.textContent =
        `${totalPages} page${totalPages !== 1 ? 's' : ''} selected from ${files.length} PDF${files.length !== 1 ? 's' : ''}`;
}

function updateVisibility() {
    pageSelectorSection.style.display = files.length > 0 ? 'block' : 'none';
    updateMergeBar();
}

// ===========================
// Merge & Download (Client-Side with pdf-lib)
// ===========================
mergeBtn.addEventListener('click', async () => {
    let totalSelected = 0;
    files.forEach(f => { totalSelected += pageSelections[f.id]?.size || 0; });
    if (totalSelected === 0) return;

    const originalHtml = mergeBtn.innerHTML;
    mergeBtn.disabled = true;
    mergeBtn.innerHTML = `
        <span class="spinner-border spinner-border-sm me-2" role="status"></span>Merging...`;

    try {
        // Create a new PDF document using pdf-lib
        const { PDFDocument } = PDFLib;
        const mergedPdf = await PDFDocument.create();

        for (const fileObj of files) {
            const selectedPages = pageSelections[fileObj.id];
            if (!selectedPages || selectedPages.size === 0) continue;

            // Read the file's array buffer
            let arrayBuffer;
            if (fileObj.arrayBuffer) {
                arrayBuffer = fileObj.arrayBuffer;
            } else {
                arrayBuffer = await fileObj.file.arrayBuffer();
            }

            // Load the source PDF
            const sourcePdf = await PDFDocument.load(arrayBuffer, { ignoreEncryption: true });
            const totalPages = sourcePdf.getPageCount();

            // Get sorted page indices (0-indexed for pdf-lib)
            const sortedPages = Array.from(selectedPages).sort((a, b) => a - b);
            const pageIndices = sortedPages
                .filter(p => p >= 1 && p <= totalPages)
                .map(p => p - 1);

            // Copy pages
            const copiedPages = await mergedPdf.copyPages(sourcePdf, pageIndices);
            copiedPages.forEach(page => mergedPdf.addPage(page));
        }

        if (mergedPdf.getPageCount() === 0) {
            throw new Error('No pages selected to merge');
        }

        // Save and download
        const pdfBytes = await mergedPdf.save();
        const blob = new Blob([pdfBytes], { type: 'application/pdf' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'merged.pdf';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        wfStep3.classList.add('active');
        wfLine2.classList.add('active');
        mergeBtn.innerHTML = `<i class="bi bi-check-circle-fill me-2"></i>Downloaded!`;
        mergeBtn.style.background = 'linear-gradient(135deg, #10b981, #059669)';
        setTimeout(() => {
            mergeBtn.innerHTML = originalHtml;
            mergeBtn.style.background = '';
            mergeBtn.disabled = false;
        }, 3000);

    } catch (err) {
        alert('Merge error: ' + err.message);
        mergeBtn.innerHTML = originalHtml;
        mergeBtn.disabled = false;
    }
});

// ===========================
// Page Preview Modal
// ===========================
let modalFileId = null;
let modalPageNum = null;
let modalRendering = false;

async function openModal(fileId, pageNum) {
    modalFileId = fileId;
    modalPageNum = pageNum;
    pageModal.classList.add('open');
    document.body.style.overflow = 'hidden';
    await renderModalPage();
}

function closeModal() {
    pageModal.classList.remove('open');
    document.body.style.overflow = '';
    modalFileId = null;
    modalPageNum = null;
}

async function renderModalPage() {
    if (modalFileId === null || modalPageNum === null) return;
    if (modalRendering) return;

    const pdfDoc = pdfDocs[modalFileId];
    const fileObj = files.find(f => f.id === modalFileId);
    if (!pdfDoc || !fileObj) return;

    const total = pageCounts[modalFileId];

    // Update header info
    modalTitle.textContent = `${fileObj.name}  —  Page ${modalPageNum} of ${total}`;

    // Sync select button state
    syncModalSelectBtn();

    // Nav button states
    modalPrev.disabled = modalPageNum <= 1;
    modalNext.disabled = modalPageNum >= total;

    // Show loading, hide canvas
    modalRendering = true;
    modalLoading.style.display = 'flex';
    modalCanvas.style.opacity = '0';

    try {
        const page = await pdfDoc.getPage(modalPageNum);
        const viewport = page.getViewport({ scale: 1 });

        // Fit within ~80vw × 78vh
        const maxW = window.innerWidth  * 0.78;
        const maxH = window.innerHeight * 0.72;
        const scale = Math.min(maxW / viewport.width, maxH / viewport.height, 3);
        const scaledViewport = page.getViewport({ scale });

        modalCanvas.width  = Math.round(scaledViewport.width);
        modalCanvas.height = Math.round(scaledViewport.height);

        const ctx = modalCanvas.getContext('2d');
        ctx.clearRect(0, 0, modalCanvas.width, modalCanvas.height);

        await page.render({ canvasContext: ctx, viewport: scaledViewport }).promise;

        modalLoading.style.display = 'none';
        modalCanvas.style.opacity = '1';
    } finally {
        modalRendering = false;
    }
}

function syncModalSelectBtn() {
    const isSelected = pageSelections[modalFileId]?.has(modalPageNum) ?? false;
    if (isSelected) {
        modalSelectBtn.innerHTML = `<i class="bi bi-check-circle-fill me-1"></i>Selected`;
        modalSelectBtn.classList.add('is-selected');
    } else {
        modalSelectBtn.innerHTML = `<i class="bi bi-circle me-1"></i>Deselected`;
        modalSelectBtn.classList.remove('is-selected');
    }
}

// Toggle selection from modal
modalSelectBtn.addEventListener('click', () => {
    if (modalFileId === null || modalPageNum === null) return;
    const thumbEl = document.querySelector(
        `[data-file-id="${modalFileId}"][data-page-num="${modalPageNum}"]`
    );
    togglePage(modalFileId, modalPageNum, thumbEl);
    syncModalSelectBtn();
});

// Navigation
modalPrev.addEventListener('click', async () => {
    if (modalPageNum > 1) { modalPageNum--; await renderModalPage(); }
});

modalNext.addEventListener('click', async () => {
    if (modalPageNum < pageCounts[modalFileId]) { modalPageNum++; await renderModalPage(); }
});

// Close on backdrop click
pageModal.addEventListener('click', (e) => {
    if (e.target === pageModal) closeModal();
});

modalClose.addEventListener('click', closeModal);

// Keyboard shortcuts
document.addEventListener('keydown', async (e) => {
    if (!pageModal.classList.contains('open')) return;

    if (e.key === 'Escape') {
        closeModal();
    } else if (e.key === 'ArrowLeft' && modalPageNum > 1) {
        modalPageNum--;
        await renderModalPage();
    } else if (e.key === 'ArrowRight' && modalPageNum < pageCounts[modalFileId]) {
        modalPageNum++;
        await renderModalPage();
    } else if (e.key === ' ') {
        e.preventDefault();
        const thumbEl = document.querySelector(
            `[data-file-id="${modalFileId}"][data-page-num="${modalPageNum}"]`
        );
        togglePage(modalFileId, modalPageNum, thumbEl);
        syncModalSelectBtn();
    }
});

// ===========================
// Utilities
// ===========================
function escapeHtml(str) {
    const div = document.createElement('div');
    div.appendChild(document.createTextNode(str));
    return div.innerHTML;
}

function formatSize(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / 1048576).toFixed(2) + ' MB';
}

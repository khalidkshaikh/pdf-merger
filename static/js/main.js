// ===========================
// PDF Merger - Main JS
// Features: merge, split, drag-reorder, passwords, transparency, custom filename,
//           SVG/AVIF, file rotation, page numbers, watermark, compress, export JPG
// ===========================

pdfjsLib.GlobalWorkerOptions.workerSrc =
    'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

// ===========================
// State
// ===========================
let files = [];          // [{id, file, name, size, isImage, arrayBuffer}]
let pageSelections = {}; // {id: Set<number>}  1-indexed
let pageCounts = {};     // {id: number}
let pdfDocs = {};        // {id: pdfjsDoc}
let imageUrls = {};      // {id: objectURL}
let pdfPasswords = {};   // {id: password string}
let fileRotations = {};  // {id: 0|90|180|270}
let nextId = 0;
let dragSrcId = null;
let isDraggingFromHandle = false;

const IMAGE_TYPES = new Set([
    'image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/bmp',
    'image/svg+xml', 'image/avif', 'image/tiff', 'image/x-icon', 'image/vnd.microsoft.icon',
    'image/pjpeg', 'image/x-png', 'image/x-bmp', 'image/x-ms-bmp', 'image/x-windows-bmp'
]);
const IMAGE_EXTS = new Set(['jpg', 'jpeg', 'png', 'webp', 'gif', 'bmp', 'svg', 'avif', 'tiff', 'tif', 'ico']);

function isImageFile(file) {
    if (IMAGE_TYPES.has(file.type)) return true;
    const ext = file.name.split('.').pop().toLowerCase();
    return IMAGE_EXTS.has(ext);
}

// ===========================
// DOM References
// ===========================
const dropZone            = document.getElementById('dropZone');
const fileInput           = document.getElementById('fileInput');
const pageSelectorSection = document.getElementById('pageSelectorSection');
const pdfCardsContainer   = document.getElementById('pdfCardsContainer');
const mergeBtn            = document.getElementById('mergeBtn');
const splitBtn            = document.getElementById('splitBtn');
const pdfToJpgBtn         = document.getElementById('pdfToJpgBtn');
const filenameInput       = document.getElementById('filenameInput');
const selectionSummary    = document.getElementById('selectionSummary');
const clearAllFilesBtn    = document.getElementById('clearAllFilesBtn');
const wfStep2             = document.getElementById('wfStep2');
const wfStep3             = document.getElementById('wfStep3');
const wfLine1             = document.getElementById('wfLine1');
const wfLine2             = document.getElementById('wfLine2');

// Modal DOM
const pageModal      = document.getElementById('pageModal');
const modalCanvas    = document.getElementById('modalCanvas');
const modalTitle     = document.getElementById('modalTitle');
const modalSelectBtn = document.getElementById('modalSelectBtn');
const modalClose     = document.getElementById('modalClose');
const modalPrev      = document.getElementById('modalPrev');
const modalNext      = document.getElementById('modalNext');
const modalLoading   = document.getElementById('modalLoading');

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

// Reset drag state on global mouseup
document.addEventListener('mouseup', () => {
    isDraggingFromHandle = false;
    document.querySelectorAll('.pdf-selector-card').forEach(c => { c.draggable = false; });
});

clearAllFilesBtn.addEventListener('click', () => {
    files = [];
    pageSelections = {};
    pageCounts = {};
    pdfDocs = {};
    pdfPasswords = {};
    fileRotations = {};
    Object.values(imageUrls).forEach(url => URL.revokeObjectURL(url));
    imageUrls = {};
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
    const accepted = newFiles.filter(f => f.type === 'application/pdf' || isImageFile(f));
    if (!accepted.length) return;

    accepted.forEach(file => {
        const id = nextId++;
        const isImage = isImageFile(file);
        files.push({ id, file, name: file.name, size: file.size, isImage });
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
    delete pdfPasswords[id];
    delete fileRotations[id];
    if (imageUrls[id]) { URL.revokeObjectURL(imageUrls[id]); delete imageUrls[id]; }
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
// Card Creation
// ===========================
function createAndLoadCard(id) {
    const fileObj = files.find(f => f.id === id);
    if (!fileObj) return;

    const iconHtml = fileObj.isImage
        ? `<div class="pdf-card-icon img-card-icon"><i class="bi bi-file-image-fill"></i></div>`
        : `<div class="pdf-card-icon"><i class="bi bi-file-earmark-pdf-fill"></i></div>`;

    const card = document.createElement('div');
    card.className = 'pdf-selector-card';
    card.id = `pdfCard-${id}`;
    card.draggable = false;

    card.innerHTML = `
        <div class="pdf-selector-card-header">
            <div class="drag-handle" title="Drag to reorder">
                <i class="bi bi-grip-vertical"></i>
            </div>
            <div class="pdf-header-info">
                ${iconHtml}
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
                <button class="btn-file-rotate" id="rotateBtn-${id}" onclick="rotateFile(${id})" title="Rotate all pages 90°">
                    <i class="bi bi-arrow-clockwise"></i><span class="rotate-deg-badge" id="rotateDeg-${id}"></span>
                </button>
                <button class="btn-remove-pdf" onclick="removeFile(${id})" title="Remove this file">
                    <i class="bi bi-trash"></i>
                </button>
            </div>
        </div>
        <div class="pdf-card-body">
            <div class="pdf-loading" id="pdfLoading-${id}">
                <div class="spinner-border spinner-border-sm text-primary me-2" role="status"></div>
                <span class="text-muted small">Rendering preview...</span>
            </div>
            <div class="pages-grid" id="pagesGrid-${id}"></div>
        </div>
    `;

    pdfCardsContainer.appendChild(card);
    addDragEvents(card, id);
    loadPDF(id, fileObj);
}

// ===========================
// Rotate File (all pages)
// ===========================
function rotateFile(id) {
    fileRotations[id] = ((fileRotations[id] || 0) + 90) % 360;
    const deg   = fileRotations[id];
    const badge = document.getElementById(`rotateDeg-${id}`);
    const btn   = document.getElementById(`rotateBtn-${id}`);
    if (badge) badge.textContent = deg ? `${deg}°` : '';
    if (btn) {
        btn.classList.toggle('active', deg !== 0);
        btn.title = deg ? `Rotated ${deg}° — click for more` : 'Rotate all pages 90°';
    }
}

// ===========================
// Drag-to-Reorder
// ===========================
function addDragEvents(card, id) {
    const handle = card.querySelector('.drag-handle');

    handle.addEventListener('mousedown', () => {
        isDraggingFromHandle = true;
        card.draggable = true;
    });

    card.addEventListener('dragstart', e => {
        if (!isDraggingFromHandle) { e.preventDefault(); return; }
        dragSrcId = id;
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', String(id));
        setTimeout(() => card.classList.add('dragging'), 0);
    });

    card.addEventListener('dragend', () => {
        card.draggable = false;
        card.classList.remove('dragging');
        document.querySelectorAll('.pdf-selector-card').forEach(c => c.classList.remove('drag-over'));
        dragSrcId = null;
        isDraggingFromHandle = false;
    });

    card.addEventListener('dragover', e => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        if (dragSrcId !== null && dragSrcId !== id) {
            document.querySelectorAll('.pdf-selector-card').forEach(c => c.classList.remove('drag-over'));
            card.classList.add('drag-over');
        }
    });

    card.addEventListener('dragleave', e => {
        if (!card.contains(e.relatedTarget)) card.classList.remove('drag-over');
    });

    card.addEventListener('drop', e => {
        e.preventDefault();
        card.classList.remove('drag-over');
        if (dragSrcId === null || dragSrcId === id) return;

        const srcIdx = files.findIndex(f => f.id === dragSrcId);
        const dstIdx = files.findIndex(f => f.id === id);
        if (srcIdx === -1 || dstIdx === -1) return;

        const [moved] = files.splice(srcIdx, 1);
        files.splice(dstIdx, 0, moved);

        const srcCard = document.getElementById(`pdfCard-${dragSrcId}`);
        if (srcIdx < dstIdx) { card.after(srcCard); } else { card.before(srcCard); }

        dragSrcId = null;
        updateMergeBar();
    });
}

// ===========================
// PDF Loading
// ===========================
async function loadPDF(id, fileObj) {
    if (fileObj.isImage) { await loadImage(id, fileObj); return; }

    try {
        const arrayBuffer = await fileObj.file.arrayBuffer();
        fileObj.arrayBuffer = arrayBuffer.slice(0);

        const loadParams = { data: arrayBuffer.slice(0) };
        if (pdfPasswords[id]) loadParams.password = pdfPasswords[id];

        const pdfDoc = await pdfjsLib.getDocument(loadParams).promise;
        pdfDocs[id] = pdfDoc;

        const numPages = pdfDoc.numPages;
        pageCounts[id] = numPages;

        const card = document.getElementById(`pdfCard-${id}`);
        if (!card) return;
        card.querySelector('.pdf-page-count').textContent =
            `${numPages} page${numPages !== 1 ? 's' : ''}`;

        for (let i = 1; i <= numPages; i++) pageSelections[id].add(i);

        const grid = document.getElementById(`pagesGrid-${id}`);
        for (let pageNum = 1; pageNum <= numPages; pageNum++) {
            const page = await pdfDoc.getPage(pageNum);
            grid.appendChild(await buildThumb(id, pageNum, page));
        }

        document.getElementById(`pdfLoading-${id}`).style.display = 'none';
        updateSelectionCounter(id);
        updateMergeBar();

    } catch (err) {
        const loadingEl = document.getElementById(`pdfLoading-${id}`);
        if (!loadingEl) return;
        if (err.name === 'PasswordException') {
            showPasswordForm(id, err.code === 1 ? 'Password required to open this PDF' : 'Wrong password — try again');
        } else {
            loadingEl.innerHTML = `<span class="text-danger small"><i class="bi bi-exclamation-triangle me-1"></i>Failed to load: ${escapeHtml(err.message || String(err))}</span>`;
        }
    }
}

// ===========================
// Password Form
// ===========================
function showPasswordForm(id, message) {
    const loadingEl = document.getElementById(`pdfLoading-${id}`);
    if (!loadingEl) return;
    loadingEl.style.display = 'flex';
    loadingEl.innerHTML = `
        <div class="password-form">
            <i class="bi bi-lock-fill text-warning"></i>
            <span style="color:var(--text-primary);font-size:0.82rem;">${escapeHtml(message)}</span>
            <input type="password" class="password-input" id="pwInput-${id}" placeholder="Password"
                   onkeydown="if(event.key==='Enter') retryWithPassword(${id})">
            <button class="btn-password-submit" onclick="retryWithPassword(${id})">
                <i class="bi bi-unlock-fill"></i>
            </button>
        </div>
    `;
    setTimeout(() => document.getElementById(`pwInput-${id}`)?.focus(), 50);
}

async function retryWithPassword(id) {
    const fileObj = files.find(f => f.id === id);
    if (!fileObj) return;
    pdfPasswords[id] = document.getElementById(`pwInput-${id}`)?.value || '';

    const loadingEl = document.getElementById(`pdfLoading-${id}`);
    if (loadingEl) {
        loadingEl.style.display = 'flex';
        loadingEl.innerHTML = `<div class="spinner-border spinner-border-sm text-primary me-2" role="status"></div><span class="text-muted small">Unlocking...</span>`;
    }

    const grid = document.getElementById(`pagesGrid-${id}`);
    if (grid) grid.innerHTML = '';
    pageSelections[id] = new Set();
    await loadPDF(id, fileObj);
}

// ===========================
// Image Loading
// ===========================
async function loadImage(id, fileObj) {
    try {
        const url = URL.createObjectURL(fileObj.file);
        imageUrls[id] = url;

        const img = new Image();
        await new Promise((resolve, reject) => {
            img.onload = resolve; img.onerror = reject; img.src = url;
        });

        pageCounts[id] = 1;
        pageSelections[id].add(1);

        const card = document.getElementById(`pdfCard-${id}`);
        if (!card) return;
        card.querySelector('.pdf-page-count').textContent = '1 page';

        document.getElementById(`pagesGrid-${id}`).appendChild(buildImageThumb(id, img));
        document.getElementById(`pdfLoading-${id}`).style.display = 'none';
        updateSelectionCounter(id);
        updateMergeBar();

    } catch (err) {
        const loadingEl = document.getElementById(`pdfLoading-${id}`);
        if (loadingEl) loadingEl.innerHTML = `<span class="text-danger small"><i class="bi bi-exclamation-triangle me-1"></i>Failed to load image: ${escapeHtml(err.message || String(err))}</span>`;
    }
}

// ===========================
// Thumbnail Builders
// ===========================
async function buildThumb(fileId, pageNum, page) {
    const viewport = page.getViewport({ scale: 1 });
    const scale = 120 / viewport.width;
    const sv = page.getViewport({ scale });
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(sv.width);
    canvas.height = Math.round(sv.height);
    await page.render({ canvasContext: canvas.getContext('2d'), viewport: sv }).promise;
    return makeThumbWrapper(fileId, pageNum, canvas, pageNum);
}

function buildImageThumb(fileId, img) {
    const nW = img.naturalWidth || 794, nH = img.naturalHeight || 1123;
    const scale = 120 / nW;
    const canvas = document.createElement('canvas');
    canvas.width = 120;
    canvas.height = Math.round(nH * scale);
    canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
    return makeThumbWrapper(fileId, 1, canvas, null);
}

function makeThumbWrapper(fileId, pageNum, canvas, labelNum) {
    const wrapper = document.createElement('div');
    wrapper.className = 'page-thumb selected';
    wrapper.dataset.fileId = fileId;
    wrapper.dataset.pageNum = pageNum;
    wrapper.title = labelNum ? `Page ${pageNum} — click to toggle` : 'Click to toggle';

    wrapper.appendChild(canvas);
    wrapper.insertAdjacentHTML('beforeend', `
        <div class="page-thumb-overlay"><i class="bi bi-check-circle-fill"></i></div>
        <button class="page-zoom-btn" title="Enlarge preview"><i class="bi bi-arrows-fullscreen"></i></button>
        ${labelNum ? `<div class="page-thumb-number">${pageNum}</div>` : ''}
    `);

    wrapper.addEventListener('click', (e) => {
        if (!e.target.closest('.page-zoom-btn')) togglePage(fileId, pageNum, wrapper);
    });
    wrapper.querySelector('.page-zoom-btn').addEventListener('click', (e) => {
        e.stopPropagation(); openModal(fileId, pageNum);
    });

    return wrapper;
}

// ===========================
// Page Selection
// ===========================
function togglePage(fileId, pageNum, el) {
    if (pageSelections[fileId].has(pageNum)) {
        pageSelections[fileId].delete(pageNum); el.classList.remove('selected');
    } else {
        pageSelections[fileId].add(pageNum); el.classList.add('selected');
    }
    updateSelectionCounter(fileId); updateMergeBar();
}

function selectAllPages(fileId) {
    const total = pageCounts[fileId] || 0;
    for (let i = 1; i <= total; i++) pageSelections[fileId].add(i);
    document.querySelectorAll(`[data-file-id="${fileId}"]`).forEach(el => el.classList.add('selected'));
    updateSelectionCounter(fileId); updateMergeBar();
}

function deselectAllPages(fileId) {
    pageSelections[fileId].clear();
    document.querySelectorAll(`[data-file-id="${fileId}"]`).forEach(el => el.classList.remove('selected'));
    updateSelectionCounter(fileId); updateMergeBar();
}

function updateSelectionCounter(fileId) {
    const selected = pageSelections[fileId]?.size ?? 0;
    const total    = pageCounts[fileId] ?? '?';
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
    const hasContent = totalPages > 0;
    mergeBtn.disabled = !hasContent;
    splitBtn.disabled = !hasContent;
    if (pdfToJpgBtn) pdfToJpgBtn.disabled = !hasContent;

    selectionSummary.textContent =
        `${totalPages} page${totalPages !== 1 ? 's' : ''} selected from ${files.length} file${files.length !== 1 ? 's' : ''}`;

    if (!mergeBtn.querySelector('.spinner-border')) {
        mergeBtn.innerHTML = files.length <= 1
            ? `<i class="bi bi-download me-2"></i>Download`
            : `<i class="bi bi-file-earmark-zip me-2"></i>Merge &amp; Download`;
    }
}

function updateVisibility() {
    pageSelectorSection.style.display = files.length > 0 ? 'block' : 'none';
    updateMergeBar();
}

// ===========================
// Helpers
// ===========================
function canvasToBytes(canvas, type, quality) {
    return new Promise((resolve, reject) => {
        canvas.toBlob(blob => {
            if (!blob) return reject(new Error('Canvas export failed'));
            const reader = new FileReader();
            reader.onload  = e => resolve(new Uint8Array(e.target.result));
            reader.onerror = () => reject(new Error('FileReader failed'));
            reader.readAsArrayBuffer(blob);
        }, type, quality);
    });
}

function downloadPdf(pdfBytes, filename) {
    downloadBlob(pdfBytes, filename, 'application/pdf');
}

function downloadBlob(bytes, filename, mimeType) {
    const blob = new Blob([bytes], { type: mimeType });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click();
    document.body.removeChild(a); URL.revokeObjectURL(url);
}

function getFilename(suffix) {
    const base = filenameInput.value.trim().replace(/\.pdf$/i, '') || 'merged';
    return suffix ? `${base}_${suffix}.pdf` : `${base}.pdf`;
}

function getOptCompress()   { return document.getElementById('optCompress')?.checked || false; }
function getOptPageNumbers(){ return document.getElementById('optPageNumbers')?.checked || false; }
function getOptWatermark()  { return (document.getElementById('optWatermarkText')?.value || '').trim(); }

// ===========================
// Output Options: Page Numbers
// ===========================
async function applyPageNumbers(pdf) {
    const font  = await pdf.embedFont(PDFLib.StandardFonts.Helvetica);
    const pages = pdf.getPages();
    const total = pages.length;
    pages.forEach((page, i) => {
        const { width } = page.getSize();
        const text  = `${i + 1} / ${total}`;
        const size  = 9;
        const textW = font.widthOfTextAtSize(text, size);
        page.drawText(text, {
            x: (width - textW) / 2, y: 16,
            size, font,
            color: PDFLib.rgb(0.35, 0.35, 0.35),
            opacity: 0.85,
        });
    });
}

// ===========================
// Output Options: Watermark
// ===========================
async function applyWatermark(pdf, text) {
    if (!text) return;
    const font  = await pdf.embedFont(PDFLib.StandardFonts.HelveticaBold);
    const pages = pdf.getPages();
    const C     = Math.cos(Math.PI / 4);
    const S     = Math.sin(Math.PI / 4);
    for (const page of pages) {
        const { width, height } = page.getSize();
        const size  = Math.max(24, Math.min(width, height) * 0.1);
        const textW = font.widthOfTextAtSize(text, size);
        page.drawText(text, {
            x: width  / 2 - (textW / 2) * C + (size / 2) * S,
            y: height / 2 - (textW / 2) * S - (size / 2) * C,
            size, font,
            color: PDFLib.rgb(0.55, 0.55, 0.55),
            opacity: 0.18,
            rotate: PDFLib.degrees(45),
        });
    }
}

// ===========================
// Core: Add one file's pages into a PDFDocument
// ===========================
async function addFileToPdf(mergedPdf, fileObj, selectedPageNums, compress = false) {
    const fileRot = fileRotations[fileObj.id] || 0;

    if (fileObj.isImage) {
        const img = await new Promise((resolve, reject) => {
            const i = new Image();
            i.onload  = () => resolve(i);
            i.onerror = () => reject(new Error(`Failed to load image: ${fileObj.name}`));
            i.src = imageUrls[fileObj.id] || URL.createObjectURL(fileObj.file);
        });

        const origW = img.naturalWidth || 595, origH = img.naturalHeight || 842;
        const isFlipped = fileRot === 90 || fileRot === 270;

        const canvas = document.createElement('canvas');
        canvas.width  = isFlipped ? origH : origW;
        canvas.height = isFlipped ? origW  : origH;
        const ctx = canvas.getContext('2d');
        ctx.translate(canvas.width / 2, canvas.height / 2);
        ctx.rotate((fileRot * Math.PI) / 180);
        ctx.drawImage(img, -origW / 2, -origH / 2);

        let embeddedImage;
        try {
            if (compress) throw 0; // Force JPEG in compress mode
            embeddedImage = await mergedPdf.embedPng(await canvasToBytes(canvas, 'image/png'));
        } catch {
            const jc = document.createElement('canvas');
            jc.width = canvas.width; jc.height = canvas.height;
            const jCtx = jc.getContext('2d');
            jCtx.fillStyle = '#fff'; jCtx.fillRect(0, 0, jc.width, jc.height);
            jCtx.drawImage(canvas, 0, 0);
            embeddedImage = await mergedPdf.embedJpg(await canvasToBytes(jc, 'image/jpeg', compress ? 0.65 : 0.95));
        }

        const { width, height } = embeddedImage;
        const page = mergedPdf.addPage([width, height]);
        page.drawImage(embeddedImage, { x: 0, y: 0, width, height });

    } else {
        // PDF
        const sortedPages = Array.from(selectedPageNums).sort((a, b) => a - b);
        const useCanvas   = !!pdfPasswords[fileObj.id] || compress;

        if (useCanvas) {
            // Canvas render: needed for encrypted PDFs and compress mode
            const pdfDoc = pdfDocs[fileObj.id];
            if (!pdfDoc) throw new Error(`PDF not loaded: ${fileObj.name}`);
            const scale = compress ? 1.5 : 2;

            for (const pageNum of sortedPages) {
                if (pageNum < 1 || pageNum > pdfDoc.numPages) continue;
                const page     = await pdfDoc.getPage(pageNum);
                const viewport = page.getViewport({ scale, rotation: fileRot });

                const canvas = document.createElement('canvas');
                canvas.width  = Math.round(viewport.width);
                canvas.height = Math.round(viewport.height);
                await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;

                const jc = document.createElement('canvas');
                jc.width = canvas.width; jc.height = canvas.height;
                const jCtx = jc.getContext('2d');
                jCtx.fillStyle = '#fff'; jCtx.fillRect(0, 0, jc.width, jc.height);
                jCtx.drawImage(canvas, 0, 0);
                const embeddedImage = await mergedPdf.embedJpg(
                    await canvasToBytes(jc, 'image/jpeg', compress ? 0.65 : 0.92)
                );
                const { width, height } = embeddedImage;
                const newPage = mergedPdf.addPage([width, height]);
                newPage.drawImage(embeddedImage, { x: 0, y: 0, width, height });
            }

        } else {
            // Vector copy via pdf-lib — best quality, preserves text/vectors
            let arrayBuffer = fileObj.arrayBuffer;
            if (!arrayBuffer) {
                arrayBuffer = await fileObj.file.arrayBuffer();
                fileObj.arrayBuffer = arrayBuffer;
            }
            const sourcePdf   = await PDFLib.PDFDocument.load(arrayBuffer, { ignoreEncryption: true });
            const totalPages  = sourcePdf.getPageCount();
            const pageIndices = sortedPages.filter(p => p >= 1 && p <= totalPages).map(p => p - 1);
            const copiedPages = await mergedPdf.copyPages(sourcePdf, pageIndices);
            copiedPages.forEach(page => {
                if (fileRot) {
                    const existing = page.getRotation().angle;
                    page.setRotation(PDFLib.degrees((existing + fileRot) % 360));
                }
                mergedPdf.addPage(page);
            });
        }
    }
}

// ===========================
// Merge & Download
// ===========================
mergeBtn.addEventListener('click', async () => {
    const totalSelected = files.reduce((s, f) => s + (pageSelections[f.id]?.size || 0), 0);
    if (totalSelected === 0) return;

    const compress  = getOptCompress();
    const pageNums  = getOptPageNumbers();
    const watermark = getOptWatermark();
    const isSingle  = files.length <= 1;

    const originalHtml = isSingle
        ? `<i class="bi bi-download me-2"></i>Download`
        : `<i class="bi bi-file-earmark-zip me-2"></i>Merge &amp; Download`;

    setAllBtnsDisabled(true);
    mergeBtn.innerHTML = `<span class="spinner-border spinner-border-sm me-2" role="status"></span>${isSingle ? 'Saving...' : 'Merging...'}`;

    try {
        const mergedPdf = await PDFLib.PDFDocument.create();
        for (const fileObj of files) {
            const sel = pageSelections[fileObj.id];
            if (!sel || sel.size === 0) continue;
            await addFileToPdf(mergedPdf, fileObj, sel, compress);
        }
        if (mergedPdf.getPageCount() === 0) throw new Error('No pages selected');

        if (pageNums)  await applyPageNumbers(mergedPdf);
        if (watermark) await applyWatermark(mergedPdf, watermark);

        downloadPdf(await mergedPdf.save(), getFilename());

        wfStep3.classList.add('active'); wfLine2.classList.add('active');
        mergeBtn.innerHTML = `<i class="bi bi-check-circle-fill me-2"></i>Downloaded!`;
        mergeBtn.style.background = 'linear-gradient(135deg, #10b981, #059669)';
        setTimeout(() => {
            mergeBtn.innerHTML = originalHtml;
            mergeBtn.style.background = '';
            setAllBtnsDisabled(false);
        }, 3000);

    } catch (err) {
        alert('Error: ' + (err.message || String(err)));
        mergeBtn.innerHTML = originalHtml;
        setAllBtnsDisabled(false);
    }
});

// ===========================
// Split & Download
// ===========================
splitBtn.addEventListener('click', async () => {
    const toSplit = files.filter(f => pageSelections[f.id]?.size > 0);
    if (toSplit.length === 0) return;

    const compress  = getOptCompress();
    const pageNums  = getOptPageNumbers();
    const watermark = getOptWatermark();
    const origHtml  = splitBtn.innerHTML;

    setAllBtnsDisabled(true);
    splitBtn.innerHTML = `<span class="spinner-border spinner-border-sm me-2" role="status"></span>Splitting...`;

    try {
        for (let i = 0; i < toSplit.length; i++) {
            const fileObj = toSplit[i];
            const sel = pageSelections[fileObj.id];
            if (!sel || sel.size === 0) continue;

            const singlePdf = await PDFLib.PDFDocument.create();
            await addFileToPdf(singlePdf, fileObj, sel, compress);
            if (singlePdf.getPageCount() === 0) continue;

            if (pageNums)  await applyPageNumbers(singlePdf);
            if (watermark) await applyWatermark(singlePdf, watermark);

            const baseName = fileObj.name.replace(/\.[^/.]+$/, '');
            downloadPdf(await singlePdf.save(), getFilename(baseName));
            if (i < toSplit.length - 1) await delay(600);
        }

        splitBtn.innerHTML = `<i class="bi bi-check-circle-fill me-2"></i>Split Done!`;
        splitBtn.style.background = 'linear-gradient(135deg, #10b981, #059669)';
        setTimeout(() => {
            splitBtn.innerHTML = origHtml;
            splitBtn.style.background = '';
            setAllBtnsDisabled(false);
        }, 3000);

    } catch (err) {
        alert('Split error: ' + (err.message || String(err)));
        splitBtn.innerHTML = origHtml;
        setAllBtnsDisabled(false);
    }
});

// ===========================
// Export as JPG
// ===========================
if (pdfToJpgBtn) {
    pdfToJpgBtn.addEventListener('click', async () => {
        const toProcess = files.filter(f => pageSelections[f.id]?.size > 0);
        if (toProcess.length === 0) return;

        // Build jobs list
        const jobs = [];
        for (const fileObj of toProcess) {
            const sorted = Array.from(pageSelections[fileObj.id]).sort((a, b) => a - b);
            const base   = fileObj.name.replace(/\.[^/.]+$/, '');
            for (const pageNum of sorted) {
                const suffix = sorted.length > 1 ? `_p${pageNum}` : '';
                jobs.push({ fileObj, pageNum, filename: `${base}${suffix}.jpg` });
            }
        }

        const origHtml = pdfToJpgBtn.innerHTML;
        setAllBtnsDisabled(true);
        pdfToJpgBtn.innerHTML = `<span class="spinner-border spinner-border-sm me-2" role="status"></span>Exporting...`;

        try {
            for (let i = 0; i < jobs.length; i++) {
                const { fileObj, pageNum, filename } = jobs[i];
                let jpgBytes;

                if (fileObj.isImage) {
                    const img = new Image();
                    img.src = imageUrls[fileObj.id];
                    if (!img.complete) await new Promise(r => img.onload = r);
                    const nW = img.naturalWidth || 794, nH = img.naturalHeight || 1123;
                    const jc = document.createElement('canvas');
                    jc.width = nW; jc.height = nH;
                    const jCtx = jc.getContext('2d');
                    jCtx.fillStyle = '#fff'; jCtx.fillRect(0, 0, nW, nH);
                    jCtx.drawImage(img, 0, 0, nW, nH);
                    jpgBytes = await canvasToBytes(jc, 'image/jpeg', 0.92);

                } else {
                    const pdfDoc = pdfDocs[fileObj.id];
                    if (!pdfDoc || pageNum > pdfDoc.numPages) continue;
                    const page     = await pdfDoc.getPage(pageNum);
                    const viewport = page.getViewport({ scale: 2 });
                    const canvas   = document.createElement('canvas');
                    canvas.width   = Math.round(viewport.width);
                    canvas.height  = Math.round(viewport.height);
                    await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
                    const jc = document.createElement('canvas');
                    jc.width = canvas.width; jc.height = canvas.height;
                    const jCtx = jc.getContext('2d');
                    jCtx.fillStyle = '#fff'; jCtx.fillRect(0, 0, jc.width, jc.height);
                    jCtx.drawImage(canvas, 0, 0);
                    jpgBytes = await canvasToBytes(jc, 'image/jpeg', 0.92);
                }

                downloadBlob(jpgBytes, filename, 'image/jpeg');
                if (i < jobs.length - 1) await delay(600);
            }

            pdfToJpgBtn.innerHTML = `<i class="bi bi-check-circle-fill me-2"></i>Exported!`;
            pdfToJpgBtn.style.background = 'linear-gradient(135deg, #10b981, #059669)';
            setTimeout(() => {
                pdfToJpgBtn.innerHTML = origHtml;
                pdfToJpgBtn.style.background = '';
                setAllBtnsDisabled(false);
            }, 3000);

        } catch (err) {
            alert('Export error: ' + (err.message || String(err)));
            pdfToJpgBtn.innerHTML = origHtml;
            setAllBtnsDisabled(false);
        }
    });
}

// ===========================
// Shared button state helper
// ===========================
function setAllBtnsDisabled(disabled) {
    const hasContent = !disabled && files.some(f => (pageSelections[f.id]?.size || 0) > 0);
    mergeBtn.disabled = disabled ? true : !hasContent;
    splitBtn.disabled = disabled ? true : !hasContent;
    if (pdfToJpgBtn) pdfToJpgBtn.disabled = disabled ? true : !hasContent;
}

function delay(ms) { return new Promise(r => setTimeout(r, ms)); }

// ===========================
// Page Preview Modal
// ===========================
let modalFileId    = null;
let modalPageNum   = null;
let modalRendering = false;

async function openModal(fileId, pageNum) {
    modalFileId  = fileId;
    modalPageNum = pageNum;
    pageModal.classList.add('open');
    document.body.style.overflow = 'hidden';
    await renderModalPage();
}

function closeModal() {
    pageModal.classList.remove('open');
    document.body.style.overflow = '';
    modalFileId  = null;
    modalPageNum = null;
}

async function renderModalPage() {
    if (modalFileId === null || modalPageNum === null) return;
    if (modalRendering) return;

    const fileObj = files.find(f => f.id === modalFileId);
    if (!fileObj) return;

    const total = pageCounts[modalFileId];
    modalTitle.textContent = `${fileObj.name}${total > 1 ? `  —  Page ${modalPageNum} of ${total}` : ''}`;
    syncModalSelectBtn();
    modalPrev.disabled = modalPageNum <= 1;
    modalNext.disabled = modalPageNum >= total;

    modalRendering = true;
    modalLoading.style.display = 'flex';
    modalCanvas.style.opacity  = '0';

    try {
        if (fileObj.isImage) {
            const img = new Image();
            img.src = imageUrls[modalFileId];
            if (!img.complete) await new Promise(r => img.onload = r);
            const nW = img.naturalWidth || 794, nH = img.naturalHeight || 1123;
            const maxW = window.innerWidth * 0.78, maxH = window.innerHeight * 0.72;
            const scale = Math.min(maxW / nW, maxH / nH, 1);
            modalCanvas.width  = Math.round(nW * scale);
            modalCanvas.height = Math.round(nH * scale);
            const ctx = modalCanvas.getContext('2d');
            ctx.clearRect(0, 0, modalCanvas.width, modalCanvas.height);
            ctx.drawImage(img, 0, 0, modalCanvas.width, modalCanvas.height);
        } else {
            const pdfDoc = pdfDocs[modalFileId];
            if (!pdfDoc) return;
            const page     = await pdfDoc.getPage(modalPageNum);
            const viewport = page.getViewport({ scale: 1 });
            const maxW = window.innerWidth * 0.78, maxH = window.innerHeight * 0.72;
            const scale = Math.min(maxW / viewport.width, maxH / viewport.height, 3);
            const sv = page.getViewport({ scale });
            modalCanvas.width  = Math.round(sv.width);
            modalCanvas.height = Math.round(sv.height);
            const ctx = modalCanvas.getContext('2d');
            ctx.clearRect(0, 0, modalCanvas.width, modalCanvas.height);
            await page.render({ canvasContext: ctx, viewport: sv }).promise;
        }
        modalCanvas.style.transform = '';
        modalLoading.style.display  = 'none';
        modalCanvas.style.opacity   = '1';
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

modalSelectBtn.addEventListener('click', () => {
    if (modalFileId === null || modalPageNum === null) return;
    const thumbEl = document.querySelector(`[data-file-id="${modalFileId}"][data-page-num="${modalPageNum}"]`);
    togglePage(modalFileId, modalPageNum, thumbEl);
    syncModalSelectBtn();
});

modalPrev.addEventListener('click', async () => {
    if (modalPageNum > 1) { modalPageNum--; await renderModalPage(); }
});
modalNext.addEventListener('click', async () => {
    if (modalPageNum < pageCounts[modalFileId]) { modalPageNum++; await renderModalPage(); }
});

pageModal.addEventListener('click', (e) => { if (e.target === pageModal) closeModal(); });
modalClose.addEventListener('click', closeModal);

document.addEventListener('keydown', async (e) => {
    if (!pageModal.classList.contains('open')) return;
    if (e.key === 'Escape') { closeModal(); }
    else if (e.key === 'ArrowLeft'  && modalPageNum > 1) { modalPageNum--; await renderModalPage(); }
    else if (e.key === 'ArrowRight' && modalPageNum < pageCounts[modalFileId]) { modalPageNum++; await renderModalPage(); }
    else if (e.key === ' ') {
        e.preventDefault();
        const thumbEl = document.querySelector(`[data-file-id="${modalFileId}"][data-page-num="${modalPageNum}"]`);
        togglePage(modalFileId, modalPageNum, thumbEl);
        syncModalSelectBtn();
    }
});

// ===========================
// Utilities
// ===========================
function escapeHtml(str) {
    const d = document.createElement('div');
    d.appendChild(document.createTextNode(str));
    return d.innerHTML;
}

function formatSize(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / 1048576).toFixed(2) + ' MB';
}

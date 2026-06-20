const HIRES_MAGIC = "HIRES";
const HIRES_MAGIC_LEN = 5;

const img = document.getElementById("cam");
const resEl = document.getElementById("res");
const fpsEl = document.getElementById("fps");
const gallery = document.getElementById("gallery");

let frameCount = 0;
let lastFpsUpdate = performance.now();
let hiresImages = [];
let selectMode = false;
let selected = new Set();

const ws = new WebSocket(`ws://${location.host}/ws`);
ws.binaryType = "arraybuffer"

function showModal(idx) {
	const item = hiresImages[idx];
	const existing = document.querySelector(".modal-overlay");
	if (existing) existing.remove();

	const overlay = document.createElement("div");
	overlay.className = "modal-overlay";
	overlay.innerHTML = `
		<div class="modal-content">
			<button class="modal-close">&times;</button>
			<img class="modal-img" src="${item.url}" />
			<button class="modal-download">Download</button>
		</div>`;

	overlay.querySelector(".modal-close").onclick = () => overlay.remove();
	overlay.querySelector(".modal-download").onclick = () => {
		const a = document.createElement("a");
		a.href = item.url;
		a.download = "highres-" + item.ts + ".jpg";
		a.click();
	};
	overlay.addEventListener("click", (e) => {
		if (e.target === overlay) overlay.remove();
	});

	document.body.appendChild(overlay);
}

function saveSelected() {
	if (selected.size === 0) return;
	const zip = new JSZip();
	const promises = [];

	[...selected].sort().forEach(idx => {
		const item = hiresImages[idx];
		const filename = "highres-" + item.ts + ".jpg";
		promises.push(
			fetch(item.url)
				.then(r => r.blob())
				.then(blob => zip.file(filename, blob))
		);
	});

	document.querySelector(".gallery-save").textContent = "Zipping...";

	Promise.all(promises).then(() => {
		zip.generateAsync({ type: "blob" }).then(blob => {
			const a = document.createElement("a");
			a.href = URL.createObjectURL(blob);
			a.download = "captures-" + Date.now() + ".zip";
			a.click();
			document.querySelector(".gallery-save").textContent = "Save Selected";
		});
	});
}

function renderGallery() {
	const count = hiresImages.length;
	const headerSelect = selectMode ? `checked` : ``;
	let html = `
		<div class="gallery-bar">
			<span class="gallery-header">High-Res Captures (${count})</span>
			<div class="gallery-actions">
				<label class="gallery-select-toggle${selectMode ? ' active' : ''}">
					<input type="checkbox" id="selectToggle" ${headerSelect} /> Select
				</label>
				<button class="gallery-save${selectMode && selected.size > 0 ? ' has-selection' : ''}" data-visible="${selectMode ? 'true' : 'false'}">Save Selected</button>
			</div>
		</div>
		<div class="gallery-list">`;

	for (let i = 0; i < count; i++) {
		const item = hiresImages[i];
		const date = new Date(item.ts);
		const time = date.toLocaleTimeString();
		const sel = selected.has(i);
		html += `
			<div class="gallery-item${sel ? ' selected' : ''}">
				${selectMode ? `<input type="checkbox" class="gallery-check" data-index="${i}" ${sel ? 'checked' : ''} />` : ''}
				<img class="gallery-thumb" src="${item.url}" data-index="${i}" />
				<div class="gallery-meta">
					<span class="gallery-time">${time}</span>
				</div>
			</div>`;
	}
	html += '</div>';
	gallery.innerHTML = html;

	document.querySelectorAll(".gallery-thumb").forEach(el => {
		el.addEventListener("click", (e) => {
			const idx = parseInt(e.target.dataset.index);
			if (selectMode) {
				const cb = document.querySelector(`.gallery-check[data-index="${idx}"]`);
				if (cb) {
					cb.checked = !cb.checked;
					cb.dispatchEvent(new Event("change"));
				}
			} else {
				showModal(idx);
			}
		});
	});

	document.querySelectorAll(".gallery-check").forEach(cb => {
		cb.addEventListener("change", () => {
			const idx = parseInt(cb.dataset.index);
			if (cb.checked) {
				selected.add(idx);
			} else {
				selected.delete(idx);
			}
			renderGallery();
		});
	});

	const toggle = document.getElementById("selectToggle");
	if (toggle) {
		toggle.addEventListener("change", () => {
			selectMode = toggle.checked;
			if (!selectMode) selected.clear();
			renderGallery();
		});
	}

	const saveBtn = document.querySelector(".gallery-save");
	if (saveBtn) {
		saveBtn.addEventListener("click", saveSelected);
	}
}

ws.onmessage = (event) => {
	if (event.data instanceof ArrayBuffer) {
		const buf = new Uint8Array(event.data);

		if (buf.length >= HIRES_MAGIC_LEN &&
			String.fromCharCode(...buf.slice(0, HIRES_MAGIC_LEN)) === HIRES_MAGIC) {
			const blob = new Blob([buf.slice(HIRES_MAGIC_LEN)], { type: "image/jpeg" });
			const url = URL.createObjectURL(blob);
			hiresImages.push({ url, ts: Date.now() });
			renderGallery();
			return;
		}

		const blob = new Blob([buf], { type: "image/jpeg" });
		const url = URL.createObjectURL(blob);
		img.src = url;
		frameCount++;
	}

	const now = performance.now();
	if (now - lastFpsUpdate >= 1000) {
		fpsEl.textContent = frameCount + " fps";
		frameCount = 0;
		lastFpsUpdate = now;
	}
};

img.onload = () => {
	resEl.textContent = img.naturalWidth + " × " + img.naturalHeight;
};

document.getElementById("capture-btn").onclick = () => {
	const c = document.createElement("canvas");
	c.width = img.naturalWidth;
	c.height = img.naturalHeight;
	c.getContext("2d").drawImage(img, 0, 0);
	c.toBlob(blob => {
		const a = document.createElement("a");
		a.href = URL.createObjectURL(blob);
		a.download = "capture-" + Date.now() + ".png";
		a.click();
	}, "image/png");
};

document.getElementById("snap-btn").onclick = () => {
	ws.send("capture");
};

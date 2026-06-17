const HIRES_MAGIC = "HIRES";
const HIRES_MAGIC_LEN = 5;

const img = document.getElementById("cam");
const resEl = document.getElementById("res");
const fpsEl = document.getElementById("fps");
const gallery = document.getElementById("gallery");

let frameCount = 0;
let lastFpsUpdate = performance.now();
let hiresImages = [];

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

function renderGallery() {
	let html = '<div class="gallery-header">High-Res Captures</div><div class="gallery-list">';
	for (let i = 0; i < hiresImages.length; i++) {
		const item = hiresImages[i];
		const date = new Date(item.ts);
		const time = date.toLocaleTimeString();
		html += `
			<div class="gallery-item">
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
			showModal(idx);
		});
	});
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

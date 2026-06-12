const HIRES_MAGIC = "HIRES";
const HIRES_MAGIC_LEN = 5;

const img = document.getElementById("cam");
const resEl = document.getElementById("res");
const fpsEl = document.getElementById("fps");

let frameCount = 0;
let lastFpsUpdate = performance.now();

const ws = new WebSocket(`ws://${location.host}/ws`);
ws.binaryType = "arraybuffer"

ws.onmessage = (event) => {
	if (event.data instanceof ArrayBuffer) {
		const buf = new Uint8Array(event.data);

		if (buf.length >= HIRES_MAGIC_LEN &&
			String.fromCharCode(...buf.slice(0, HIRES_MAGIC_LEN)) === HIRES_MAGIC) {
			const blob = new Blob([buf.slice(HIRES_MAGIC_LEN)], { type: "image/jpeg" });
			const a = document.createElement("a");
			a.href = URL.createObjectURL(blob);
			a.download = "highres-" + Date.now() + ".jpg";
			a.click();
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

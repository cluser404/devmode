const img = document.getElementById("cam");
const resEl = document.getElementById("res");
const fpsEl = document.getElementById("fps");

let frameCount = 0;
let lastFpsUpdate = performance.now();

const ws = new WebSocket(`ws://${location.host}/ws`);
ws.binaryType = "blob"

ws.onmessage = (event) => {
	const url = URL.createObjectURL(event.data);
	img.src = url;
	frameCount++;

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

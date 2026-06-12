import platform
import asyncio
from contextlib import asynccontextmanager
import time
import threading
from fastapi import FastAPI, WebSocket, Request
import cv2
from fastapi.templating import Jinja2Templates
from fastapi.staticfiles import StaticFiles

def create_camera():
    system = platform.system()

    if system == "Linux":
        try:
            return PiCamera()
        except:
            return WebcamCamera()

    elif system == "Windows":
        return WebcamCamera()

    else:
        return WebcamCamera()

class BaseCamera:
    def start(self):
        pass
    
    def read(self):
        pass

    def stop(self):
        pass


class WebcamCamera(BaseCamera):
    def __init__(self, device=0, width=1280, height=720):
        self.cap = cv2.VideoCapture(device)

        self.cap.set(cv2.CAP_PROP_FRAME_WIDTH, width)
        self.cap.set(cv2.CAP_PROP_FRAME_HEIGHT, height)

        self.frame = None
        self.lock = threading.Lock()
        self.running = False

    def start(self):
        self.running = True
        self.thread = threading.Thread(target=self._loop, daemon=True)
        self.thread.start()

    def _loop(self):
        while self.running:
            ret, frame = self.cap.read()

            if not ret:
                continue

            with self.lock:
                self.frame = frame

            time.sleep(0.01)

    def read(self):
        with self.lock:
            return None if self.frame is None else self.frame.copy()

    def stop(self):
        self.running = False
        self.cap.release()


class PiCamera(BaseCamera):
    MAX_WIDTH = 3280
    MAX_HEIGHT = 2464

    def __init__(self, width=MAX_WIDTH, height=MAX_HEIGHT):
        from picamera2 import Picamera2
        self.picam2 = Picamera2()

        config = self.picam2.create_video_configuration(
            main={"size": (width, height), "format": "RGB888"},
            sensor={"output_size": (width, height)}
        )

        self.picam2.configure(config)

        self.frame = None
        self.lock = threading.Lock()
        self.running = False

    def start(self):
        self.picam2.start()
        self.running = True

        self.thread = threading.Thread(target=self._loop, daemon=True)
        self.thread.start()

    def _loop(self):
        while self.running:
            frame = self.picam2.capture_array()

            with self.lock:
                self.frame = frame

            time.sleep(0.01)

    def read(self):
        with self.lock:
            return None if self.frame is None else self.frame.copy()

    def stop(self):
        self.running = False
        self.picam2.stop()
        self.picam2.close()


camera = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    global camera
    camera = create_camera()
    camera.start()
    print("camera started")
    yield
    camera.stop()
    print("camera stopped")

app = FastAPI(lifespan=lifespan)
templates = Jinja2Templates(directory="templates")
app.mount("/public", StaticFiles(directory="public"), name="public")

@app.websocket("/ws")
async def ws_endpoint(ws: WebSocket):
    await ws.accept()

    try:
        while True:
            frame = camera.read()

            if frame is None:
                await asyncio.sleep(0.05)
                continue

            _, jpeg = cv2.imencode(
                ".jpg",
                frame,
                [cv2.IMWRITE_JPEG_QUALITY, 100]
            )

            await ws.send_bytes(jpeg.tobytes())
            await asyncio.sleep(0.125*2)
    except Exception:
        pass

@app.get("/")
def home(request: Request):
    return templates.TemplateResponse(request, "index.html")


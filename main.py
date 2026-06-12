import os
import asyncio
from contextlib import asynccontextmanager
import time
import threading
from dotenv import load_dotenv
from fastapi import FastAPI, WebSocket, Request
import cv2
from fastapi.templating import Jinja2Templates
from fastapi.staticfiles import StaticFiles

load_dotenv()

def create_camera():
    camera_type = os.getenv("CAMERA_TYPE", "webcam").lower()

    if camera_type == "picamera":
        return PiCamera()
    elif camera_type == "webcam":
        return WebcamCamera()
    else:
        raise ValueError(f"Unknown CAMERA_TYPE: {camera_type}")

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

    def __init__(self, width=1920, height=1080):
        from picamera2 import Picamera2
        self.picam2 = Picamera2()

        config = self.picam2.create_video_configuration(
            main={"size": (width, height), "format": "RGB888"}
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


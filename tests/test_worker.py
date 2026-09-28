import importlib.util
import io
import os
import sys
import tempfile
import types
import unittest
from contextlib import redirect_stdout
from pathlib import Path
from unittest.mock import patch

worker_path = Path(__file__).resolve().parents[1] / 'StudyGenie_Backend/backend/python/transcribe_youtube.py'
spec = importlib.util.spec_from_file_location('worker', worker_path)
worker = importlib.util.module_from_spec(spec)
spec.loader.exec_module(worker)

class WorkerTests(unittest.TestCase):
    def test_segments_and_multilingual_text(self):
        class Model:
            def __init__(self, *args, **kwargs): pass
            def transcribe(self, *args, **kwargs):
                return iter([types.SimpleNamespace(text=' नमस्ते ', start=0, end=1.5)]), types.SimpleNamespace(language='hi', language_probability=1)
        with patch.dict(sys.modules, {'faster_whisper': types.SimpleNamespace(WhisperModel=Model)}):
            result = worker.transcribe('unused.wav')
        self.assertEqual(result['text'], 'नमस्ते')
        self.assertEqual(result['segments'][0]['end'], 1.5)

    def test_download_rejects_long_and_live_video_before_audio(self):
        class Downloader:
            def __init__(self, options):
                self.options = options
                self.assertions()
            def assertions(self):
                assert self.options['match_filter']({'duration': 20000})
                assert self.options['match_filter']({'is_live': True})
                assert self.options['match_filter']({'duration': 10}) is None
                assert 'node' in self.options['js_runtimes']
            def __enter__(self): return self
            def __exit__(self, *args): pass
            def extract_info(self, *args, **kwargs): raise RuntimeError('Blocked before download')
        with patch.dict(sys.modules, {'yt_dlp': types.SimpleNamespace(YoutubeDL=Downloader)}):
            with self.assertRaisesRegex(RuntimeError, 'Blocked before download'):
                worker.download_audio('https://youtu.be/qOMxCZ0SzBQ', '.')

    def test_single_json_stdout_and_temp_cleanup(self):
        dirs = []
        def download(url, directory):
            dirs.append(directory)
            print('Noisy downloader output')
            return {'title':'Lecture','duration':2}, 'fake.wav'
        output = io.StringIO()
        with tempfile.TemporaryDirectory() as tmp, patch.object(sys, 'argv', ['worker','--url','https://youtu.be/qOMxCZ0SzBQ','--tmp-dir',tmp]), patch.object(worker, 'download_audio', download), patch.object(worker, 'transcribe', return_value={'text':'नमस्ते','segments':[]}), redirect_stdout(output):
            worker.main()
        import json
        self.assertEqual(json.loads(output.getvalue())['text'], 'नमस्ते')
        self.assertFalse(Path(dirs[0]).exists())

if __name__ == '__main__':
    unittest.main()

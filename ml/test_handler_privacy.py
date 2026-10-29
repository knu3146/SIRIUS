"""Exercise the real inference HTTP handler using synthetic data and no model files."""
from contextlib import contextmanager, redirect_stderr
import http.client
import io
import json
import threading
import unittest
from unittest.mock import patch

import numpy as np
from PIL import Image, PngImagePlugin

import infer_server


@contextmanager
def server():
    httpd = infer_server.ThreadingHTTPServer(('127.0.0.1', 0), infer_server.Handler)
    port = httpd.server_address[1]
    with patch.object(infer_server, 'PORT', port), patch.object(infer_server, 'META',
            {'name': 'synthetic test model', 'test_accuracy': .5}):
        thread = threading.Thread(target=httpd.serve_forever, daemon=True)
        thread.start()
        try:
            yield port
        finally:
            httpd.shutdown()
            httpd.server_close()
            thread.join(timeout=3)


def request(port, method='POST', path='/analyze', body=b'synthetic pixels', headers=None):
    connection = http.client.HTTPConnection('127.0.0.1', port, timeout=3)
    try:
        connection.request(method, path, body=body, headers=headers or {'Content-Type': 'image/jpeg'})
        response = connection.getresponse()
        return response.status, dict(response.getheaders()), response.read()
    finally:
        connection.close()


class InferencePrivacyChecks(unittest.TestCase):
    def test_foreign_browser_requests_never_reach_analysis(self):
        with server() as port, patch.object(infer_server, 'analyze') as analyze:
            for extra in [{'Origin': 'https://remote.example'}, {'Origin': 'null'},
                          {'Host': f'remote.example:{port}'}, {'Sec-Fetch-Site': 'cross-site'}]:
                status, _, _ = request(port, headers={'Content-Type': 'image/jpeg', **extra})
                self.assertEqual(status, 403, extra)
            analyze.assert_not_called()

    def test_private_exception_details_and_image_bytes_are_not_logged_or_returned(self):
        logs = io.StringIO()
        marker = 'SYNTHETIC-PRIVATE-PATH'
        pixels = b'SYNTHETIC-PIXEL-MARKER'
        with redirect_stderr(logs), server() as port, patch.object(infer_server, 'analyze',
                side_effect=ValueError(marker)):
            status, headers, body = request(port, body=pixels)
        self.assertEqual(status, 422)
        self.assertEqual(headers['Cache-Control'], 'no-store')
        self.assertEqual(headers['X-Content-Type-Options'], 'nosniff')
        self.assertNotIn('Python', headers['Server'])
        self.assertNotIn(marker, body.decode())
        self.assertNotIn(marker, logs.getvalue())
        self.assertNotIn(pixels.decode(), logs.getvalue())
        self.assertIn('ValueError', logs.getvalue())

    def test_invalid_types_and_lengths_are_rejected_before_analysis(self):
        with server() as port, patch.object(infer_server, 'analyze') as analyze:
            cases = [({'Content-Type': 'application/json'}, 415),
                     ({'Content-Type': 'image/jpeg', 'Content-Length': 'invalid'}, 411),
                     ({'Content-Type': 'image/jpeg', 'Content-Length': str(infer_server.MAX_BODY + 1)}, 413)]
            for headers, expected in cases:
                status, _, _ = request(port, body=b'', headers=headers)
                self.assertEqual(status, expected)
            analyze.assert_not_called()

    def test_real_image_pipeline_does_not_echo_metadata_or_save_images(self):
        marker = 'SYNTHETIC-PATIENT-DO-NOT-RETURN'
        metadata = PngImagePlugin.PngInfo()
        metadata.add_text('PatientName', marker)
        stream = io.BytesIO()
        Image.new('L', (128, 128), 96).save(stream, format='PNG', pnginfo=metadata)

        class Model:
            def predict_proba(self, features):
                self.features = features
                return np.asarray([[.01, .01, .01, .97]])

        model = Model()
        with patch.object(infer_server, 'MODEL', model, create=True), patch.object(infer_server, 'META',
                {'name': 'synthetic model', 'architecture': 'hog'}, create=True), patch.object(Image.Image, 'save',
                side_effect=AssertionError('Inference must not save images')):
            result = infer_server.analyze(stream.getvalue())
        self.assertEqual(set(result), {'probs', 'regions', 'model'})
        self.assertEqual(result['regions'], [])
        self.assertIsInstance(model.features, np.ndarray)
        self.assertNotIn(marker, json.dumps(result))
        self.assertNotIn('PatientName', json.dumps(result))


if __name__ == '__main__':
    unittest.main()

"""Create a deterministic source ZIP from the already-validated in-memory file list."""
import base64
import json
import os
import sys
import tempfile
import zipfile

payload = json.load(sys.stdin)
destination = payload['destination']
handle, temporary = tempfile.mkstemp(prefix='.studio-release-', dir=os.path.dirname(destination))
os.close(handle)
try:
    with zipfile.ZipFile(temporary, 'w', compression=zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
        for entry in payload['files']:
            info = zipfile.ZipInfo('oaia-studio/' + entry['path'], date_time=(1980, 1, 1, 0, 0, 0))
            info.create_system = 3
            info.external_attr = (0o100755 if entry['executable'] else 0o100644) << 16
            info.compress_type = zipfile.ZIP_DEFLATED
            archive.writestr(info, base64.b64decode(entry['data']), compresslevel=9)
    os.replace(temporary, destination)
finally:
    if os.path.exists(temporary):
        os.unlink(temporary)

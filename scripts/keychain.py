#!/usr/bin/env python3
"""Private credential bridge. `read` is for the backend pipe only; never log it."""
import ctypes as C
import getpass
import json
import re
import sys

SERVICE = b"Local Image Studio OpenAI API"
ACCOUNT = b"personal-api-key"

def library():
    lib = C.CDLL('/System/Library/Frameworks/Security.framework/Security')
    lib.SecKeychainFindGenericPassword.argtypes = [C.c_void_p, C.c_uint32, C.c_char_p, C.c_uint32, C.c_char_p, C.POINTER(C.c_uint32), C.POINTER(C.c_void_p), C.POINTER(C.c_void_p)]
    lib.SecKeychainFindGenericPassword.restype = C.c_int32
    lib.SecKeychainAddGenericPassword.argtypes = [C.c_void_p, C.c_uint32, C.c_char_p, C.c_uint32, C.c_char_p, C.c_uint32, C.c_void_p, C.POINTER(C.c_void_p)]
    lib.SecKeychainAddGenericPassword.restype = C.c_int32
    lib.SecKeychainItemModifyAttributesAndData.argtypes = [C.c_void_p, C.c_void_p, C.c_uint32, C.c_void_p]
    lib.SecKeychainItemModifyAttributesAndData.restype = C.c_int32
    lib.SecKeychainItemFreeContent.argtypes = [C.c_void_p, C.c_void_p]
    return lib

def find(lib, content=True):
    length, data, item = C.c_uint32(), C.c_void_p(), C.c_void_p()
    status = lib.SecKeychainFindGenericPassword(None, len(SERVICE), SERVICE, len(ACCOUNT), ACCOUNT,
        C.byref(length) if content else None, C.byref(data) if content else None, C.byref(item))
    secret = None
    if status == 0 and content:
        secret = C.string_at(data, length.value)
        lib.SecKeychainItemFreeContent(None, data)
    return status, secret, item

def main():
    mode = sys.argv[1] if len(sys.argv) == 2 else ''
    if mode not in ('status', 'read', 'set'):
        print('Use the Configure OAIA Studio API Key launcher to save your key.', file=sys.stderr)
        return 2
    lib = library()
    if mode == 'status':
        status, _, _ = find(lib, False)
        print(json.dumps({'configured': status == 0}))
        return 0
    if mode == 'read':
        status, secret, _ = find(lib)
        if status != 0:
            return 3
        sys.stdout.buffer.write(secret)
        return 0
    if not sys.stdin.isatty():
        print('Open Configure OAIA API Key.command in Terminal. Hidden entry needs a terminal.', file=sys.stderr)
        return 2
    print('\nOAIA Studio — secure API key setup\n')
    print('Create a project API key in your linked Personal organization.')
    print('Paste it below. Nothing will appear while you type or paste.')
    print('It is stored in macOS Keychain, not in this folder or your browser.\n')
    secret = getpass.getpass('OpenAI API key (hidden): ').strip()
    if not re.fullmatch(r'sk-[A-Za-z0-9_-]{20,}', secret):
        print('That does not look like an OpenAI API key. Nothing was saved.')
        return 2
    encoded = secret.encode()
    status, _, item = find(lib, False)
    if status == 0:
        status = lib.SecKeychainItemModifyAttributesAndData(item, None, len(encoded), encoded)
    elif status == -25300:
        status = lib.SecKeychainAddGenericPassword(None, len(SERVICE), SERVICE, len(ACCOUNT), ACCOUNT, len(encoded), encoded, None)
    if status != 0:
        print('Keychain could not save the key. Unlock your login Keychain and try again.')
        return 3
    print('\nSaved to macOS Keychain. Return to OAIA Studio and click Check connection.')
    return 0

if __name__ == '__main__':
    try:
        sys.exit(main())
    except (KeyboardInterrupt, EOFError):
        print('\nCanceled. Nothing changed.')
        sys.exit(2)
    except Exception:
        print('Credential operation failed. No credential was printed.', file=sys.stderr)
        sys.exit(3)

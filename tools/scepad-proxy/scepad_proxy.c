#include <windows.h>
#include <stdint.h>
#include <stdarg.h>
#include <stdio.h>
#include <wchar.h>

static HMODULE real_dll;
extern IMAGE_DOS_HEADER __ImageBase;

static void log_line(const char *fmt, ...) {
  FILE *f = fopen("Z:\\tmp\\nexus_scepad.log", "ab");
  if (!f) return;

  va_list args;
  va_start(args, fmt);
  vfprintf(f, fmt, args);
  va_end(args);
  fputc('\n', f);
  fclose(f);
}

static HMODULE load_real(void) {
  if (real_dll) return real_dll;

  wchar_t path[MAX_PATH];
  DWORD len = GetModuleFileNameW((HMODULE)&__ImageBase, path, MAX_PATH);
  if (len == 0 || len >= MAX_PATH) {
    real_dll = LoadLibraryW(L"libScePad_real.dll");
    return real_dll;
  }

  wchar_t *slash = wcsrchr(path, L'\\');
  if (slash) {
    slash[1] = L'\0';
    wcscat(path, L"libScePad_real.dll");
    real_dll = LoadLibraryW(path);
  }

  if (!real_dll) real_dll = LoadLibraryW(L"libScePad_real.dll");
  return real_dll;
}

static FARPROC real_proc(const char *name) {
  HMODULE dll = load_real();
  return dll ? GetProcAddress(dll, name) : NULL;
}

static int64_t call0(const char *name) {
  typedef int64_t (__cdecl *fn_t)(void);
  fn_t fn = (fn_t)real_proc(name);
  if (!fn) {
    log_line("%s missing", name);
    return -1;
  }
  int64_t r = fn();
  log_line("%s -> %lld", name, (long long)r);
  return r;
}

static int64_t call1(const char *name, uintptr_t a) {
  typedef int64_t (__cdecl *fn_t)(uintptr_t);
  fn_t fn = (fn_t)real_proc(name);
  if (!fn) {
    log_line("%s missing", name);
    return -1;
  }
  int64_t r = fn(a);
  log_line("%s(%llx) -> %lld", name, (unsigned long long)a, (long long)r);
  return r;
}

static int64_t call2(const char *name, uintptr_t a, uintptr_t b) {
  typedef int64_t (__cdecl *fn_t)(uintptr_t, uintptr_t);
  fn_t fn = (fn_t)real_proc(name);
  if (!fn) {
    log_line("%s missing", name);
    return -1;
  }
  int64_t r = fn(a, b);
  log_line("%s(%llx,%llx) -> %lld", name, (unsigned long long)a, (unsigned long long)b, (long long)r);
  return r;
}

static int64_t call4(const char *name, uintptr_t a, uintptr_t b, uintptr_t c, uintptr_t d) {
  typedef int64_t (__cdecl *fn_t)(uintptr_t, uintptr_t, uintptr_t, uintptr_t);
  fn_t fn = (fn_t)real_proc(name);
  if (!fn) {
    log_line("%s missing", name);
    return -1;
  }
  int64_t r = fn(a, b, c, d);
  log_line("%s(%llx,%llx,%llx,%llx) -> %lld", name, (unsigned long long)a, (unsigned long long)b, (unsigned long long)c, (unsigned long long)d, (long long)r);
  return r;
}

static int64_t call8(const char *name, uintptr_t a, uintptr_t b, uintptr_t c, uintptr_t d, uintptr_t e, uintptr_t f, uintptr_t g, uintptr_t h) {
  typedef int64_t (__cdecl *fn_t)(uintptr_t, uintptr_t, uintptr_t, uintptr_t, uintptr_t, uintptr_t, uintptr_t, uintptr_t);
  fn_t fn = (fn_t)real_proc(name);
  if (!fn) {
    log_line("%s missing", name);
    return -1;
  }
  int64_t r = fn(a, b, c, d, e, f, g, h);
  log_line("%s -> %lld", name, (long long)r);
  return r;
}

#define WRAP8(name) \
  __declspec(dllexport) int64_t name(uintptr_t a, uintptr_t b, uintptr_t c, uintptr_t d, uintptr_t e, uintptr_t f, uintptr_t g, uintptr_t h) { \
    return call8(#name, a, b, c, d, e, f, g, h); \
  }

BOOL WINAPI DllMain(HINSTANCE instance, DWORD reason, LPVOID reserved) {
  (void)instance;
  (void)reserved;
  if (reason == DLL_PROCESS_ATTACH) log_line("libScePad proxy loaded");
  return TRUE;
}

__declspec(dllexport) int64_t scePadIsSupportedAudioFunction(uintptr_t a, uintptr_t b, uintptr_t c, uintptr_t d, uintptr_t e, uintptr_t f, uintptr_t g, uintptr_t h) {
  int64_t r = call8("scePadIsSupportedAudioFunction", a, b, c, d, e, f, g, h);
  if (GetEnvironmentVariableA("NEXUS_SCEPAD_FORCE_AUDIO", NULL, 0) > 0) {
    log_line("scePadIsSupportedAudioFunction forced 1 (real %lld)", (long long)r);
    return 1;
  }
  return r;
}

__declspec(dllexport) int64_t scePadSetVibration(uintptr_t a, uintptr_t b, uintptr_t c, uintptr_t d, uintptr_t e, uintptr_t f, uintptr_t g, uintptr_t h) {
  if (b) {
    unsigned char *p = (unsigned char *)b;
    log_line("scePadSetVibration param %02x %02x %02x %02x %02x %02x %02x %02x",
      p[0], p[1], p[2], p[3], p[4], p[5], p[6], p[7]);
  }
  return call8("scePadSetVibration", a, b, c, d, e, f, g, h);
}

WRAP8(scePadClose)
WRAP8(scePadGetContainerIdInformation)
WRAP8(scePadGetControllerBusType)
WRAP8(scePadGetControllerInformation)
WRAP8(scePadGetControllerType)
WRAP8(scePadGetHandle)
WRAP8(scePadGetJackState)
WRAP8(scePadGetTriggerEffectState)
WRAP8(scePadInit)
WRAP8(scePadInit2)
WRAP8(scePadInit3)
WRAP8(scePadIsControllerUpdateRequired)
WRAP8(scePadOpen)
WRAP8(scePadRead)
WRAP8(scePadReadState)
WRAP8(scePadResetLightBar)
WRAP8(scePadResetOrientation)
WRAP8(scePadSetAngularVelocityBiasCorrectionState)
WRAP8(scePadSetAngularVelocityDeadbandState)
WRAP8(scePadSetAudioOutPath)
WRAP8(scePadSetLightBar)
WRAP8(scePadSetMotionSensorState)
WRAP8(scePadSetTiltCorrectionState)
WRAP8(scePadSetTriggerEffect)
WRAP8(scePadSetVibrationMode)
WRAP8(scePadSetVolumeGain)
WRAP8(scePadTerminate)

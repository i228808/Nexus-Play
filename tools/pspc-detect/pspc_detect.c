#include <windows.h>
#include <stdio.h>

static FILE *out;

static void print_proc(HMODULE mod, const char *name) {
    FARPROC proc = GetProcAddress(mod, name);
    fprintf(out, "%s=%s\n", name, proc ? "visible" : "hidden");
}

static void print_env(const char *name) {
    char value[512];
    DWORD len = GetEnvironmentVariableA(name, value, sizeof(value));
    fprintf(out, "%s=%s\n", name, len ? value : "");
}

static void print_hide_wine_exports_registry(void) {
    HKEY key;
    DWORD value = 0;
    DWORD size = sizeof(value);
    DWORD type = 0;
    LONG rc = RegOpenKeyExA(HKEY_CURRENT_USER, "Software\\Wine", 0, KEY_READ, &key);

    if (rc != ERROR_SUCCESS) {
        fprintf(out, "HKCU_Software_Wine=open_failed_%ld\n", rc);
        return;
    }

    rc = RegQueryValueExA(key, "HideWineExports", NULL, &type, (BYTE *)&value, &size);
    if (rc == ERROR_SUCCESS) {
        fprintf(out, "HKCU_HideWineExports=type_%lu_value_%lu\n", type, value);
    } else {
        fprintf(out, "HKCU_HideWineExports=query_failed_%ld\n", rc);
    }

    RegCloseKey(key);
}

static void print_steam_deck_state(void) {
    typedef int (__cdecl *SteamAPI_InitFn)(void);
    typedef void *(__cdecl *SteamUtilsV010Fn)(void);
    typedef int (__cdecl *IsSteamDeckFn)(void *);

    HMODULE steam = LoadLibraryA("steam_api64.dll");
    if (!steam) {
        fprintf(out, "steam_api64=load_failed_%lu\n", GetLastError());
        return;
    }

    SteamAPI_InitFn steam_init = (SteamAPI_InitFn)GetProcAddress(steam, "SteamAPI_Init");
    SteamUtilsV010Fn steam_utils = (SteamUtilsV010Fn)GetProcAddress(steam, "SteamAPI_SteamUtils_v010");
    IsSteamDeckFn is_deck = (IsSteamDeckFn)GetProcAddress(steam, "SteamAPI_ISteamUtils_IsSteamRunningOnSteamDeck");

    fprintf(out, "steam_api64=loaded\n");
    fprintf(out, "SteamAPI_Init=%s\n", steam_init ? "visible" : "missing");
    fprintf(out, "SteamAPI_SteamUtils_v010=%s\n", steam_utils ? "visible" : "missing");
    fprintf(out, "SteamAPI_ISteamUtils_IsSteamRunningOnSteamDeck=%s\n", is_deck ? "visible" : "missing");

    if (steam_init) fprintf(out, "SteamAPI_Init_result=%d\n", steam_init());
    if (steam_utils && is_deck) {
        void *utils = steam_utils();
        fprintf(out, "SteamUtils_v010=%p\n", utils);
        if (utils) fprintf(out, "SteamDeck_api_result=%d\n", is_deck(utils));
    }
}

int main(void) {
    out = fopen("Z:\\tmp\\pspc_detect.txt", "w");
    if (!out) out = stdout;

    HMODULE ntdll = GetModuleHandleA("ntdll.dll");
    fprintf(out, "ntdll=%p\n", ntdll);
    if (ntdll) {
        print_proc(ntdll, "wine_get_version");
        print_proc(ntdll, "wine_get_build_id");
        print_proc(ntdll, "wine_get_host_version");
    }

    print_env("SteamDeck");
    print_env("SteamGameId");
    print_env("SteamAppId");
    print_env("WINEPREFIX");
    print_env("WINELOADERNOEXEC");
    print_hide_wine_exports_registry();
    print_steam_deck_state();
    fclose(out);
    return 0;
}

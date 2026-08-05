const BASE_URL = import.meta.env.SERVER_URL;

type QueryValue = string | number | null | undefined;

/** Build an absolute API URL. Null/undefined params are omitted. */
export function apiUrl(path: string, params?: Record<string, QueryValue>): string {
    const url = new URL(path.replace(/^\/?/, "/"), BASE_URL);
    for (const [key, value] of Object.entries(params ?? {})) {
        if (value !== null && value !== undefined) {
            url.searchParams.set(key, String(value));
        }
    }
    return url.toString();
}

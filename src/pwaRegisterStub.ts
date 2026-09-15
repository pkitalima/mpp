/** Stands in for virtual:pwa-register in builds made without the service worker (MPP_NO_SW=1). */
export function registerSW(_options?: { immediate?: boolean }): void {}

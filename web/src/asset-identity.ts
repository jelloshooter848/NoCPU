// Content-keyed browser core loading, GPL-3.0-or-later.
const DIGEST = /^[0-9a-f]{64}$/;
export const CORE_JS_QUERY = 'nocpu_js_sha256';
export const CORE_WASM_QUERY = 'nocpu_wasm_sha256';

export interface QualificationAssetIdentity {
  entryUrl: string;
  moduleUrl: string;
  wasmUrl: string;
  coreJsSha256: string;
  coreWasmSha256: string;
}

export function createCoreAssetUrls(baseUrl: string, jsSha256: string, wasmSha256: string): { moduleUrl: string; wasmUrl: string } {
  if (!DIGEST.test(jsSha256) || !DIGEST.test(wasmSha256)) throw new Error('Missing compiled core asset identity.');
  const module = new URL('core/nocpu.js', baseUrl);
  module.searchParams.set(CORE_JS_QUERY, jsSha256);
  module.searchParams.set(CORE_WASM_QUERY, wasmSha256);
  return { moduleUrl: module.href, wasmUrl: locateCoreAsset('nocpu.wasm', module.href) };
}

export function locateCoreAsset(file: string, moduleUrl: string): string {
  const module = new URL(moduleUrl);
  const url = new URL(file, module);
  if (file === 'nocpu.wasm') {
    const pin = module.searchParams.get(CORE_WASM_QUERY);
    if (!pin || !DIGEST.test(pin)) throw new Error('Missing compiled Wasm asset identity.');
    url.searchParams.set(CORE_WASM_QUERY, pin);
  }
  return url.href;
}

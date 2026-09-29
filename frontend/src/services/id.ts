export function createId(prefix = "") {
  const api = globalThis.crypto;
  if (typeof api?.randomUUID === "function") return `${prefix}${api.randomUUID()}`;

  if (typeof api?.getRandomValues === "function") {
    const bytes = api.getRandomValues(new Uint8Array(16));
    bytes[6] = (bytes[6]! & 0x0f) | 0x40;
    bytes[8] = (bytes[8]! & 0x3f) | 0x80;
    const hex = [...bytes].map((value) => value.toString(16).padStart(2, "0"));
    return `${prefix}${hex.slice(0, 4).join("")}-${hex.slice(4, 6).join("")}-${hex.slice(6, 8).join("")}-${hex.slice(8, 10).join("")}-${hex.slice(10).join("")}`;
  }

  return `${prefix}${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 14)}`;
}

export function copyText(value: string) {
  if (typeof navigator.clipboard?.writeText === "function") {
    return navigator.clipboard.writeText(value);
  }
  const input = document.createElement("textarea");
  input.value = value;
  input.setAttribute("readonly", "");
  input.style.position = "fixed";
  input.style.opacity = "0";
  document.body.appendChild(input);
  input.select();
  const copied = document.execCommand("copy");
  input.remove();
  return copied ? Promise.resolve() : Promise.reject(new Error("copy_failed"));
}

export type AppLanguage = "en" | "de";
const key = "neat.language";
export const getLanguage = (): AppLanguage =>
  localStorage.getItem(key) === "de" ? "de" : "en";
export function setLanguage(language: AppLanguage) {
  localStorage.setItem(key, language);
  document.documentElement.lang = language;
  window.location.reload();
}
export const tr = (english: string, german: string) =>
  getLanguage() === "de" ? german : english;
document.documentElement.lang = getLanguage();

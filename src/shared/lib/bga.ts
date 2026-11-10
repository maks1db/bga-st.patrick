/**
 * Загрузка ESM-библиотек BGA (глобальный importEsmLib из фреймворка).
 * Библиотеки не типизированы (importEsmLib возвращает any) — стоки и
 * менеджеры используются через них напрямую.
 *
 * Top-level await — как и в прежнем modules/js/Game.js: фреймворк грузит
 * этот модуль как ES-модуль и ждёт резолва.
 */
export const BgaAnimations = await importEsmLib('bga-animations', '1.x');
export const BgaCards = await importEsmLib('bga-cards', '1.x');

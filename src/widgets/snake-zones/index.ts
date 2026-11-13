/**
 * Виджет: открытые змеиные карты в зонах игроков (ряды по 6, сортировка,
 * счётчик укусов).
 */
import { cardBites } from '../../entities/card';
import type { Game } from '../../app/Game';

/** Суммарные укусы змей игрока (иконка змеи + число, скрыто при 0). */
export function updateBites(game: Game, pid: number): void {
    const total = (game.snakeCards[pid] ?? []).reduce((sum, c) => sum + cardBites(c), 0);
    const box = document.getElementById(`stp-bites-${pid}`);
    const n = document.getElementById(`stp-bites-n-${pid}`);
    if (!box || !n) return;
    n.textContent = String(total);
    box.style.display = total > 0 ? '' : 'none';
}

/** Вложенный сток зоны змей прячем на время добавления карт: новые карты
 *  приземляются в него и до перегруппировки в ряды (layoutSnakeZone)
 *  мелькают вертикальной колонкой (сток — flex-direction: column). */
export function setSnakeStockHidden(pid: number, hidden: boolean): void {
    document.getElementById(`stp-snakes-${pid}`)?.querySelector('.card-stock')
        ?.classList.toggle('stp-snakes-flight', hidden);
}

/** Зона змей: сортировка (масть, номинал), ряды по 6 карт; новые ряды
 *  перекрывают предыдущие (CSS: margin-top отрицательный), внутри ряда
 *  ранние карты лежат поверх поздних (видна левая полоса с номиналом). */
export function layoutSnakeZone(game: Game, pid: number): void {
    const zone = (game.snakeCards[pid] ?? []).slice().sort((a, b) => a.suit - b.suit || a.value - b.value);
    const container = document.getElementById(`stp-snakes-${pid}`);
    if (!container) { updateBites(game, pid); return; }
    const alive = new Set(zone.map(c => `stp-card-${c.id}`));
    for (const el of container.querySelectorAll('.bga-cards_card')) {
        if (!alive.has(el.id)) el.remove(); // карта уже ушла из зоны
    }
    const els = new Map();
    for (const el of container.querySelectorAll('.bga-cards_card')) els.set(el.id, el);
    container.querySelectorAll(':scope > .stp-snake-row').forEach(row => row.remove());
    const ROW = 6;
    for (let i = 0; i < zone.length; i += ROW) {
        const row = document.createElement('div');
        row.className = 'stp-snake-row';
        row.style.zIndex = String(Math.floor(i / ROW) + 1); // новые ряды поверх старых
        for (const c of zone.slice(i, i + ROW)) {
            const el = els.get(`stp-card-${c.id}`);
            if (el) row.appendChild(el);
        }
        container.appendChild(row);
    }
    zone.forEach((c, i) => {
        document.getElementById(`stp-card-${c.id}`)?.style.setProperty('z-index', String(zone.length - i));
    });
    updateBites(game, pid);
}

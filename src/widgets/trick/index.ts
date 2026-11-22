/**
 * Виджет: область розыгрыша (взятка) и подписи «кто сыграл» над картами.
 */
import type { Game } from '../../app/Game';
import type { Card } from '../../entities/card';

/** DOM-элемент карты в взятке: сначала через менеджер стока, fallback — по id. */
export function trickCardEl(game: Game, card: Card): HTMLElement | null {
    try {
        const el = game.trickStock.getCardElement?.(card);
        if (el) return el;
    } catch (e) { /* DOM-fallback ниже */ }
    return document.getElementById(`card-${card.id}`)
        ?? document.getElementById(`stp-card-${card.id}`);
}

/** Тег-имя игрока цветом его фишки над картой взятки. */
export function labelTrickCard(game: Game, card: Card, playerId: number): void {
    const el = trickCardEl(game, card);
    if (!el) return;
    el.querySelector('.stp-trick-by')?.remove();
    if (!playerId) return;
    const player = game.gamedatas.players[playerId];
    if (!player) return;
    const tag = document.createElement('div');
    tag.className = 'stp-trick-by';
    tag.textContent = player.name;
    tag.style.setProperty('--stp-by-color', `#${player.color}`);
    el.appendChild(tag);
}

export function clearTrickLabels(): void {
    document.querySelectorAll('.stp-trick-by').forEach(el => el.remove());
}

/**
 * Заголовок авторозыгрышка [H17]: над игровой зоной показываем, что все
 * оставшиеся взятки забирает этот игрок. Висит весь поток cardPlayed/
 * trickWon, убирается по notif_huntScored (п. 64 HANDOFF).
 */
export function showAutoPlayBanner(game: Game, playerId: number): void {
    removeAutoPlayBanner();
    const player = game.gamedatas.players[playerId];
    const box = document.getElementById('stp-center');
    if (!player || !box) return;
    const name = `<b style="color:#${player.color}">${player.name}</b>`;
    const text = _('All the remaining tricks go to ${name}').replace('${name}', name);
    box.insertAdjacentHTML('afterbegin', `<div id="stp-autoplay-info" class="stp-autoplay-info">${text}</div>`);
}

export function removeAutoPlayBanner(): void {
    document.getElementById('stp-autoplay-info')?.remove();
}

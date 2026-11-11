/**
 * Виджет: итоговая таблица раунда (реликвии / урон / здоровье).
 * Модальное окно: размытый бэкдроп поверх стола, клик по бэкдропу или ×
 * закрывает. Собирается из уведомлений подсчёта; HP читается из уже
 * обновлённых счётчиков. Живёт до закрытия или до таблицы следующего
 * раунда; при reload не восстанавливается (авторитетная запись — журнал).
 */
import type { Game } from '../../app/Game';

export function showRoundSummary(game: Game, relics: Record<string, number>, losses: Record<string, number>): void {
    document.getElementById('stp-round-summary')?.remove();
    const rows = Object.values(game.gamedatas.players).map(p => {
        const pid = parseInt(p.id, 10);
        const hpEl = document.getElementById(`stp-hp-${pid}`);
        const hp = hpEl ? parseInt(hpEl.textContent ?? '0', 10) : parseInt(p.score, 10);
        const relic = parseInt(String(relics[pid] ?? 0), 10);
        const dmg = parseInt(String(losses[pid] ?? 0), 10);
        return `<tr>
            <td class="stp-rs-name" style="color:#${p.color}">${p.name}</td>
            <td>${relic}</td>
            <td>${dmg}</td>
            <td class="${hp <= 0 ? 'stp-rs-dead' : ''}">${hp}</td>
        </tr>`;
    }).join('');
    document.body.insertAdjacentHTML('beforeend', `
        <div id="stp-round-summary">
            <div class="stp-rs-backdrop"></div>
            <div class="stp-rs-dialog">
                <div class="stp-rs-head">
                    <span>${_('Round summary')}</span>
                    <button class="stp-rs-close" id="stp-rs-close" type="button" title="${_('Close')}">×</button>
                </div>
                <table class="stp-rs-table">
                    <tr>
                        <th>${_('Player')}</th>
                        <th><span class="stp-elt stp-elt-relic stp-elt-sm" title="${_('Relics')}"></span></th>
                        <th><span class="stp-elt stp-elt-snake stp-elt-sm" title="${_('Damage')}"></span></th>
                        <th><span class="stp-elt stp-elt-heart stp-elt-sm" title="${_('Health')}"></span></th>
                    </tr>
                    ${rows}
                </table>
            </div>
        </div>`);
    const close = () => document.getElementById('stp-round-summary')?.remove();
    document.getElementById('stp-rs-close')!.addEventListener('click', close);
    document.querySelector('#stp-round-summary .stp-rs-backdrop')!.addEventListener('click', close);
}

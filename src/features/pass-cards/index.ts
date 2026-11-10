/**
 * Feature: одновременная передача карт соседу слева.
 * Игроки остаются framework-active до раскрытия (сервер следит за глобалом
 * pass_done) — поэтому отмена возможна через обычное действие, а хук
 * активации не срабатывает при подтверждении: клиент сам переключает UI
 * в режим ожидания.
 * Владелец состояния: подтверждённые карты (cards) и флаг ack живут здесь.
 */
import { normalizeCard, sortHand } from '../../entities/card';
import type { Card } from '../../entities/card';
import type { Game } from '../../app/Game';

export class PassCardsFeature {
    private game: Game;
    /** мои подтверждённые карты в зоне передачи (ждут раскрытия) */
    cards: Card[] = [];
    /** пас подтверждён сервером (кнопка Cancel разрешена) */
    ack = false;

    constructor(game: Game) {
        this.game = game;
    }

    /** Инициализация из gamedatas (после reload: пас уже на сервере). */
    init(passed: Card[]): void {
        this.cards = passed;
    }

    async confirmSelection(count: number): Promise<void> {
        const selection = this.game.handStock.getSelection();
        if (selection.length !== count) return;
        const cards = selection.map((c: Card) => normalizeCard(c));
        document.getElementById('stp-pass-confirm')?.remove();
        this.cards = [...cards];
        this.game.myHand = this.game.myHand.filter(c => !cards.some((p: Card) => p.id === c.id));
        this.game.handStock.unselectAll();
        for (const c of cards) {
            document.getElementById(`stp-card-${c.id}`)?.classList.remove('stp-selected');
        }
        this.syncZone(); // зона видима ДО анимации: иначе цель display:none и карта летит в (0,0)
        await this.game.passStock.addCards(cards, { fromStock: this.game.handStock });
        this.showWaiting(this.game.leftNeighborId(this.game.bga.players.getCurrentPlayerId()));
        const p = this.game.bga.actions.performAction('actPassCards', { cardIds: cards.map((c: Card) => c.id) });
        if (!p) { // вызов заблокирован фреймворком — откатываем перенос
            await this.restore();
            this.showSelection(count, this.game.leftNeighborId(this.game.bga.players.getCurrentPlayerId()));
            return;
        }
        try {
            await p;
            this.ack = true; // сервер принял пас — теперь отмена легальна
            this.syncZone();
        } catch (e) {
            await this.restore();
            if (this.game.bga.states.getCurrentMainStateName() === 'PassCards') {
                this.showSelection(count, this.game.leftNeighborId(this.game.bga.players.getCurrentPlayerId()));
            }
        }
    }

    /** Режим выбора карт для передачи (активный игрок). */
    showSelection(count: number, toId: number | null): void {
        this.game.bga.statusBar.setTitle(_('${you} must select ${count} card(s) to pass to your left neighbor').replace('${count}', String(count)));
        this.game.setHandSelectable(this.game.myHand, count);
        this.showInfo(toId, count);
        document.getElementById('stp-pass-confirm')?.remove();
        this.game.bga.statusBar.addActionButton(_('Pass selected cards'),
            () => this.confirmSelection(count),
            { id: 'stp-pass-confirm', disabled: true });
    }

    /** Режим ожидания раскрытия: карты в зоне передачи, под ними — отмена. */
    showWaiting(toId: number | null): void {
        this.game.bga.statusBar.setTitle(_('You passed ${count} card(s) — waiting for the other players').replace('${count}', String(this.cards.length)));
        this.showInfo(toId, null);
        this.syncZone();
    }

    /** Зона передачи: карты лежат в основной игровой зоне (#stp-trick).
     * Кнопка Cancel — только после подтверждения паса сервером: иначе
     * отмена улетает раньше actPassCards и сервер честно отвечает ошибкой,
     * а клик во время анимации перелёта роняет removeCards против addCards. */
    syncZone(): void {
        const box = document.getElementById('stp-pass-cards');
        const trick = document.getElementById('stp-trick');
        if (!box || !trick) return;
        const has = this.cards.length > 0;
        box.classList.toggle('stp-visible', has);
        document.getElementById('stp-pass-cancel')?.remove();
        if (has && this.ack) {
            trick.insertAdjacentHTML('afterend',
                `<button class="bgabutton bgabutton_gray" id="stp-pass-cancel" type="button">${_('Cancel')}</button>`);
            document.getElementById('stp-pass-cancel')!.addEventListener('click', () => this.cancel());
        }
    }

    cancel(): void {
        document.getElementById('stp-pass-cancel')?.remove(); // анти-двойной клик
        const p = this.game.bga.actions.performAction('actCancelPassCards');
        if (!p) { this.syncZone(); return; } // вызов заблокирован фреймворком — кнопку вернём
        p.catch(() => this.syncZone());
    }

    /** Отмена подтверждения: карты возвращаются из зоны передачи в руку (идемпотентно). */
    async restore(): Promise<void> {
        const cards = this.cards;
        this.ack = false;
        if (!cards.length || !this.game.passStock) { this.syncZone(); return; }
        this.cards = [];
        this.game.myHand = sortHand([...this.game.myHand, ...cards]);
        await this.game.passStock.removeCards(cards);
        await this.game.handStock.addCards(cards);
        if (this.game.selectableMode === 'select') {
            this.game.handStock.setSelectableCards(this.game.myHand); // карты доехали — повторяем маркировку
        }
        this.syncZone();
    }

    /** Карты ушли получателям (раскрытие) — зона очищается без возврата в руку. */
    async discard(): Promise<void> {
        const cards = this.cards;
        this.cards = [];
        this.ack = false;
        this.syncZone();
        if (!cards.length || !this.game.passStock) return;
        await this.game.passStock.removeCards(cards);
    }

    /** Баннер в центре поля: кому уйдут переданные карты. */
    showInfo(toId: number | null, count: number | null): void {
        this.removeInfo();
        if (toId === null) return;
        const to = this.game.gamedatas.players[toId];
        const box = document.getElementById('stp-center');
        if (!to || !box) return;
        const name = `<b style="color:#${to.color}">${to.name}</b>`;
        const text = count === null
            ? _('Cards will be passed to your left neighbor: ${name}').replace('${name}', name)
            : _('You pass ${count} card(s) to ${name}').replace('${count}', String(count)).replace('${name}', name);
        box.insertAdjacentHTML('afterbegin', `<div id="stp-pass-info" class="stp-pass-info">${text}</div>`);
    }

    removeInfo(): void {
        document.getElementById('stp-pass-info')?.remove();
    }
}

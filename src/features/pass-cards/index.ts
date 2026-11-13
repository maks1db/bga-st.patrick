/**
 * Feature: одновременная передача карт соседу слева — по одному клику.
 * Клик по карте руки сразу отправляет её в игровую зону (#stp-pass-cards
 * внутри #stp-trick); пас завершён, когда набрано `count` карт — сервер делает
 * игрока non-multiactive (часы стоп). Клик по карте в зоне возвращает её в
 * руку (actReturnPassCard), кнопка Cancel в status bar — все сразу
 * (actCancelPassCards); оба действия с #[CheckAction(false)] — пасанувший уже
 * non-multiactive, клиент шлёт с checkAction:false. Переносы оптимистичны:
 * анимация сразу, при ошибке вызова — откат. Хук активации при подтверждении
 * не срабатывает: клиент сам переключает UI в режим ожидания.
 * Владелец состояния: карты в зоне и сет ожидающих ack живут здесь.
 */
import { sortHand } from '../../entities/card';
import type { Card } from '../../entities/card';
import type { Game } from '../../app/Game';

export class PassCardsFeature {
    private game: Game;
    /** мои карты в зоне передачи (ждут раскрытия; уходят получателю) */
    cards: Card[] = [];
    /** требуемое число карт к передаче (для остатка в тайтле/баннере) */
    count = 0;
    /** карты, чей серверный вызов ещё летит (Cancel ждёт их) */
    private pending = new Set<number>();

    constructor(game: Game) {
        this.game = game;
    }

    /** Инициализация из gamedatas (после reload: пас уже на сервере). */
    init(passed: Card[]): void {
        this.cards = passed;
    }

    /** Клик по карте руки: карта сразу уезжает в зону передачи. */
    async passOne(card: Card): Promise<void> {
        if (this.cards.some(c => c.id === card.id) || this.pending.has(card.id)) return;
        this.pending.add(card.id);
        this.cards = [...this.cards, card];
        this.game.myHand = this.game.myHand.filter(c => c.id !== card.id);
        document.getElementById(`stp-card-${card.id}`)?.classList.remove('stp-selected');
        this.syncZone(); // зона видима ДО анимации: иначе цель display:none и карта летит в (0,0)
        await this.game.passStock.addCards([card], { fromStock: this.game.handStock });
        const p = this.game.bga.actions.performAction('actPassCards', { cardIds: [card.id] });
        if (!p) { // вызов заблокирован фреймворком — откатываем перенос
            this.pending.delete(card.id);
            await this.rollbackPass(card);
            return;
        }
        try {
            await p;
        } catch (e) {
            this.pending.delete(card.id);
            await this.rollbackPass(card);
            return;
        }
        this.pending.delete(card.id);
        this.syncZone();
        const toId = this.game.leftNeighborId(this.game.bga.players.getCurrentPlayerId());
        if (this.cards.length >= this.count) {
            this.showWaiting(toId); // пас завершён — ждём раскрытия (сервер уже дал non-multiactive)
        } else {
            this.refreshSelection(this.count - this.cards.length, toId);
        }
    }

    /** Клик по карте в зоне передачи: возвращается в руку. */
    async returnOne(card: Card): Promise<void> {
        if (!this.cards.some(c => c.id === card.id) || this.pending.has(card.id)) return;
        this.pending.add(card.id);
        this.cards = this.cards.filter(c => c.id !== card.id);
        this.game.myHand = sortHand([...this.game.myHand, card]);
        this.syncZone();
        await this.game.passStock.removeCards([card]);
        await this.game.handStock.addCards([card]);
        if (this.game.selectableMode === 'pass') {
            this.game.handStock.setSelectableCards(this.game.myHand); // карта доехала — повторяем маркировку
        }
        const p = this.game.bga.actions.performAction('actReturnPassCard', { cardId: card.id },
            { checkAction: false, checkPossibleActions: true });
        if (!p) {
            this.pending.delete(card.id);
            await this.rollbackReturn(card);
            return;
        }
        try {
            await p;
        } catch (e) {
            this.pending.delete(card.id);
            await this.rollbackReturn(card);
            return;
        }
        this.pending.delete(card.id);
        this.syncZone();
        if (this.game.selectableMode === 'pass') {
            this.refreshSelection(this.count - this.cards.length,
                this.game.leftNeighborId(this.game.bga.players.getCurrentPlayerId()));
        }
    }

    /** Откат passOne: карта возвращается из зоны в руку. */
    private async rollbackPass(card: Card): Promise<void> {
        this.cards = this.cards.filter(c => c.id !== card.id);
        this.game.myHand = sortHand([...this.game.myHand, card]);
        await this.game.passStock.removeCards([card]);
        await this.game.handStock.addCards([card]);
        if (this.game.selectableMode === 'pass') {
            this.game.handStock.setSelectableCards(this.game.myHand);
        }
        this.syncZone();
    }

    /** Откат returnOne: карта снова уезжает в зону передачи. */
    private async rollbackReturn(card: Card): Promise<void> {
        this.cards = [...this.cards, card];
        this.game.myHand = this.game.myHand.filter(c => c.id !== card.id);
        this.syncZone();
        await this.game.passStock.addCards([card], { fromStock: this.game.handStock });
        this.syncZone();
    }

    /** Режим передачи (активный игрок): клик по карте = отправка, кнопки
     * подтверждения нет — пас завершается сам на count-й карте. */
    showSelection(count: number, toId: number | null): void {
        this.count = count;
        this.refreshSelection(count, toId);
        this.game.setHandSelectable(this.game.myHand, 'pass');
        this.syncZone();
    }

    /** Тайтл и баннер по остатку к передаче. */
    private refreshSelection(remaining: number, toId: number | null): void {
        this.game.bga.statusBar.setTitle(_('${you} must pass ${count} more card(s) — click a card to send it')
            .replace('${count}', String(remaining)));
        this.showInfo(toId, remaining);
    }

    /** Режим ожидания раскрытия: карты в зоне передачи, отмена — Cancel. */
    showWaiting(toId: number | null): void {
        this.game.bga.statusBar.setTitle(_('You passed ${count} card(s) — waiting for the other players').replace('${count}', String(this.cards.length)));
        this.showInfo(toId, null);
        this.syncZone();
    }

    /** Зона передачи: карты лежат в основной игровой зоне (#stp-trick).
     * Кнопка Cancel — в верхней панели (status bar); рисуется, когда в зоне
     * есть карты и ни один вызов ещё не летит (иначе отмена улетит раньше
     * отправки и сервер честно ответит ошибкой). Карты в зоне кликабельны:
     * клик возвращает карту в руку. */
    syncZone(): void {
        const box = document.getElementById('stp-pass-cards');
        if (!box) return;
        if (!box.dataset.stpBound) {
            box.dataset.stpBound = '1';
            box.addEventListener('click', (e) => {
                const el = (e.target as HTMLElement).closest('.stp-card');
                if (!el) return;
                const id = parseInt(el.id.replace('stp-card-', ''), 10);
                const card = this.cards.find(c => c.id === id);
                if (card) this.returnOne(card);
            });
        }
        const has = this.cards.length > 0;
        box.classList.toggle('stp-visible', has);
        document.getElementById('stp-pass-cancel')?.remove();
        if (has && this.pending.size === 0) {
            this.game.bga.statusBar.addActionButton(_('Cancel'), () => this.cancel(), { id: 'stp-pass-cancel', color: 'secondary' });
        }
    }

    cancel(): void {
        document.getElementById('stp-pass-cancel')?.remove(); // анти-двойной клик
        // пасанувший уже non-multiactive: серверная проверка активности
        // снята атрибутом #[CheckAction(false)], клиентскую отключаем
        // так (пара из документации фреймворка)
        const p = this.game.bga.actions.performAction('actCancelPassCards', null,
            { checkAction: false, checkPossibleActions: true });
        if (!p) { this.syncZone(); return; } // вызов заблокирован фреймворком — кнопку вернём
        p.catch(() => this.syncZone());
    }

    /** Отмена подтверждения: карты возвращаются из зоны передачи в руку (идемпотентно). */
    async restore(): Promise<void> {
        const cards = this.cards;
        this.pending.clear();
        if (!cards.length || !this.game.passStock) { this.syncZone(); return; }
        this.cards = [];
        this.game.myHand = sortHand([...this.game.myHand, ...cards]);
        await this.game.passStock.removeCards(cards);
        await this.game.handStock.addCards(cards);
        if (this.game.selectableMode === 'pass') {
            this.game.handStock.setSelectableCards(this.game.myHand); // карты доехали — повторяем маркировку
        }
        this.syncZone();
    }

    /** Карты ушли получателям (раскрытие) — зона очищается без возврата в руку. */
    async discard(): Promise<void> {
        const cards = this.cards;
        this.cards = [];
        this.pending.clear();
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
            : _('Pass ${count} more card(s) to ${name}').replace('${count}', String(count)).replace('${name}', name);
        box.insertAdjacentHTML('afterbegin', `<div id="stp-pass-info" class="stp-pass-info">${text}</div>`);
    }

    removeInfo(): void {
        document.getElementById('stp-pass-info')?.remove();
    }
}

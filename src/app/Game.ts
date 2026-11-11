/**
 * Game.ts — клиент игры «Охота на змей» (St Patrick): точка входа фреймворка.
 *
 * Класс Game — composition root (слой app): держит менеджеры/стоки карт,
 * собирает стол в setup, разводит уведомления (notif_* — точки входа
 * фреймворка, имена не переименовывать!) по виджетам и фичам:
 *   widgets/draft-overlay  — оверлей разбора реликвий (таймеры/жетоны там)
 *   widgets/trick          — подписи «кто сыграл» в взятке
 *   widgets/snake-zones    — открытые змеиные карты, счётчики укусов
 *   widgets/round-summary  — итоговая таблица раунда
 *   features/pass-cards    — передача карт (состояние cards/ack там)
 */
import { BgaAnimations, BgaCards } from '../shared/lib/bga';
import type { StPatrickGamedatas } from '../shared/types/gamedatas';
import { normalizeCard, sortHand, setupCardFront, CARD_W, CARD_H } from '../entities/card';
import type { Card } from '../entities/card';
import { DraftOverlayWidget } from '../widgets/draft-overlay';
import { labelTrickCard, clearTrickLabels } from '../widgets/trick';
import { layoutSnakeZone, updateBites } from '../widgets/snake-zones';
import { showRoundSummary } from '../widgets/round-summary';
import { PassCardsFeature } from '../features/pass-cards';
import { DecidePassCount } from './states/decide-pass-count';
import { PassCards } from './states/pass-cards';
import { DraftRelics } from './states/draft-relics';
import { HuntPlay } from './states/hunt-play';
import { GameEnd } from './states/game-end';

export class Game {
    bga: any;
    gamedatas!: StPatrickGamedatas;

    animationManager: any;
    cardsManager: any;
    handStock: any;
    trickStock: any;
    passStock: any;
    snakeStocks: Record<number, any> = {};

    myHand: Card[] = [];        // мои карты
    currentTrick: Card[] = [];  // карты текущей взятки
    snakeCards: Record<number, Card[]> = {}; // pid => карты в открытой зоне
    selectableMode: 'select' | 'play' | null = null; // null | 'select' | 'play'
    maxSelected = 0;
    handGridMode = false;

    // Виджеты и фичи (состояние внутри них, не на Game)
    draftOverlay: DraftOverlayWidget;
    passCardsFeature: PassCardsFeature;

    constructor(bga: any) {
        this.bga = bga;
        this.draftOverlay = new DraftOverlayWidget(this);
        this.passCardsFeature = new PassCardsFeature(this);

        this.animationManager = new BgaAnimations.Manager({
            animationsActive: () => this.bga.gameui.bgaAnimationsActive(),
        });
        this.cardsManager = new BgaCards.Manager({
            animationManager: this.animationManager,
            type: 'stp-card',
            cardWidth: CARD_W,
            cardHeight: CARD_H,
            getId: (card: Card) => card.id,
            setupDiv: (card: Card, div: HTMLElement) => {
                div.style.width = CARD_W + 'px';
                div.style.height = CARD_H + 'px';
                div.classList.remove('stp-selected'); // выделение не должно жить на reused-карте
                div.querySelector('.stp-trick-by')?.remove(); // подпись не должна жить на reused-карте
            },
            setupFrontDiv: (card: Card, div: HTMLElement) => this.setupCardFront(card, div),
            setupBackDiv: (card: Card, div: HTMLElement) => { div.innerHTML = '<span class="stp-card-back-logo">☘</span>'; },
            isCardVisible: (card: Card) => true,
        });

        this.bga.states.register('DecidePassCount', new DecidePassCount(this, bga));
        this.bga.states.register('PassCards', new PassCards(this, bga));
        this.bga.states.register('DraftRelics', new DraftRelics(this, bga));
        this.bga.states.register('HuntPlay', new HuntPlay(this, bga));
        this.bga.states.register('gameEnd', new GameEnd(this, bga));
    }

    setup(gamedatas: StPatrickGamedatas): void {
        this.gamedatas = gamedatas;
        this.myHand = sortHand(gamedatas.hand.map(c => this.normalizeCard(c)));
        this.currentTrick = gamedatas.trick.map(c => this.normalizeCard(c));
        this.passCardsFeature.init((gamedatas.passed ?? []).map(c => this.normalizeCard(c)));
        for (const player of Object.values(gamedatas.players)) {
            const pid = parseInt(player.id, 10);
            this.snakeCards[pid] = (gamedatas.snakes[pid] ?? []).map(c => this.normalizeCard(c));
        }

        const area = this.bga.gameArea.getElement();
        area.insertAdjacentHTML('beforeend', `
            <div id="stp-board">
                <div id="stp-players"></div>
                <div id="stp-center">
                    <div id="stp-trick">
                        <div id="stp-pass-cards"></div>
                    </div>
                </div>
                <div id="stp-hand"></div>
            </div>
        `);

        // Зоны игроков: открытые змеиные карты, HP, реликвии
        for (const player of Object.values(gamedatas.players)) {
            const pid = parseInt(player.id, 10);
            document.getElementById('stp-players')!.insertAdjacentHTML('beforeend', `
                <div class="stp-player-zone" id="stp-zone-${pid}">
                    <div class="stp-player-head">
                        <span class="stp-player-name" style="color:#${player.color}">${player.name}</span>
                        <span class="stp-hp" title="${_('Life points')}"><span class="stp-elt stp-elt-heart stp-elt-sm"></span> <span id="stp-hp-${pid}">${parseInt(player.score, 10)}</span></span>
                        <span class="stp-relic-count" title="${_('Relics')}"><span class="stp-elt stp-elt-relic stp-elt-sm"></span> <span id="stp-relics-${pid}">${parseInt(String(gamedatas.relics[pid] ?? 0), 10)}</span></span>
                        <span class="stp-bites" id="stp-bites-${pid}" title="${_('Snake bites')}" style="display:none"><span class="stp-elt stp-elt-snake stp-elt-sm"></span> <span id="stp-bites-n-${pid}">0</span></span>
                    </div>
                    <div class="stp-snakes" id="stp-snakes-${pid}"></div>
                </div>
            `);
        }

        // Стоки карт
        this.handStock = new BgaCards.HandStock(this.cardsManager, document.getElementById('stp-hand'));
        // Веер руки всегда отсортирован (масть, номинал): с sort-функцией
        // addCards вставляет карты в свою позицию, а не в конец (иначе
        // возврат карт при отмене передачи ломал порядок веера).
        this.handStock.setSort((a: any, b: any) => parseInt(a.suit, 10) - parseInt(b.suit, 10) || parseInt(a.value, 10) - parseInt(b.value, 10));
        // <995px (планшет/мобилка): рука — сетка, а не веер. Карты стоят
        // ровно (без поворотов и перекрытий) и переносятся на строку ниже
        // (flex-wrap в media query scss/widgets/_hand.scss — breakpoint
        // дублируется!). Веерные механики библиотеки отключаем; floating
        // глушится CSS.
        this.handGridMode = window.innerWidth < 995;
        if (this.handGridMode) {
            this.handStock.fanShaped = false;
            this.handStock.updateCardPositions = () => { };
            this.handStock.watchFloatingState = () => { };
        } else if (window.innerWidth < 640) {
            this.handStock.minOverlap = 28; // полоса карты максимально широкая в пределах экрана
        }
        this.handStock.onSelectionChange = (selection: any[]) => this.onHandSelectionChange(selection);
        this.trickStock = new BgaCards.LineStock(this.cardsManager, document.getElementById('stp-trick'));
        this.passStock = new BgaCards.LineStock(this.cardsManager, document.getElementById('stp-pass-cards'));
        for (const player of Object.values(gamedatas.players)) {
            const pid = parseInt(player.id, 10);
            this.snakeStocks[pid] = new BgaCards.LineStock(this.cardsManager, document.getElementById(`stp-snakes-${pid}`));
        }

        this.handStock.addCards(this.myHand);
        if (this.passCardsFeature.cards.length > 0) {
            this.passStock.addCards(this.passCardsFeature.cards); // после reload: карты снова в зоне передачи
        }
        if (this.currentTrick.length > 0) {
            this.trickStock.addCards(this.currentTrick);
            const trickPlayers = gamedatas.trickPlayers ?? {};
            for (const c of this.currentTrick) {
                labelTrickCard(this, c, parseInt(String(trickPlayers[c.id] ?? 0), 10));
            }
        }
        // (пиннг зубастых влево убран — карты взятки всегда центрируются flex'ом)
        for (const player of Object.values(gamedatas.players)) {
            const pid = parseInt(player.id, 10);
            if (this.snakeCards[pid].length > 0) {
                this.snakeStocks[pid].addCards(this.snakeCards[pid]);
                setTimeout(() => layoutSnakeZone(this, pid), 600); // после отрисовки стока
            }
        }

        this.bga.notifications.setupPromiseNotifications();

        // Размеры карт и шаг позиций фона спрайта выбираются в setup по
        // innerWidth, а CSS media query (640px — размер карты/фона, 995px —
        // сетка/веер) применяется живьём. Переход через брейкпоинт БЕЗ
        // перезагрузки рассинхронизирует JS-шаг с CSS background-size —
        // лица карт съезжаются. Лечим перезагрузкой (состояние игры
        // фреймворк восстановит).
        const breakpoints = [window.innerWidth < 640, window.innerWidth < 995];
        let resizeTimer: ReturnType<typeof setTimeout> | null = null;
        window.addEventListener('resize', () => {
            clearTimeout(resizeTimer!);
            resizeTimer = setTimeout(() => {
                if ((window.innerWidth < 640) !== breakpoints[0]
                    || (window.innerWidth < 995) !== breakpoints[1]) {
                    location.reload();
                    return;
                }
                // без смены брейкпоинта: рука могла перестроить ряды —
                // подтягиваем низ оверлея драфта
                this.draftOverlay.syncBottom();
            }, 300);
        });
    }

    // -------------------------------------------------------------------------
    // Карты
    // -------------------------------------------------------------------------

    normalizeCard(card: any): Card {
        return normalizeCard(card);
    }

    // Менеджер карт размера CARD_W×CARD_H (один на всё — см. константы).
    setupCardFront(card: Card, div: HTMLElement): void {
        setupCardFront(card, div);
    }

    legalHandCards(leadSuit: number | null): Card[] {
        if (leadSuit === null) return [...this.myHand];
        const follow = this.myHand.filter(c => c.suit === leadSuit);
        return follow.length > 0 ? follow : [...this.myHand];
    }

    setHandSelectable(cards: Card[], maxSelected: number, singleClickPlay = false): void {
        this.selectableMode = singleClickPlay ? 'play' : 'select';
        this.maxSelected = maxSelected;
        this.handStock.setSelectionMode(singleClickPlay ? 'single' : 'multiple');
        this.handStock.setSelectableCards(cards);
    }

    clearHandSelection(): void {
        this.selectableMode = null;
        this.handStock.setSelectionMode('none');
        document.querySelectorAll('#stp-hand .stp-selected').forEach(el => el.classList.remove('stp-selected'));
    }

    onHandSelectionChange(selection: any[]): void {
        // bga-cards не рисует выделение — подсвечиваем выбранные карты сами
        for (const c of this.myHand) {
            document.getElementById(`stp-card-${c.id}`)
                ?.classList.toggle('stp-selected', selection.some(s => String(s.id) === String(c.id)));
        }
        if (this.selectableMode === 'play') {
            if (selection.length > 0) {
                const card = selection[selection.length - 1];
                this.handStock.unselectAll();
                this.bga.actions.performAction('actPlayCard', { cardId: parseInt(card.id, 10) });
            }
        } else if (this.selectableMode === 'select') {
            const btn = document.getElementById('stp-pass-confirm') as HTMLButtonElement | null;
            if (btn) btn.disabled = selection.length !== this.maxSelected;
        }
    }

    // -------------------------------------------------------------------------
    // Реликвии / HP
    // -------------------------------------------------------------------------

    updatePlayerRelics(pid: number, count: number): void {
        const el = document.getElementById(`stp-relics-${pid}`);
        if (el) el.textContent = String(count);
    }

    updatePlayerHp(pid: number, score: number): void {
        const el = document.getElementById(`stp-hp-${pid}`);
        if (el) el.textContent = String(score);
    }

    adjustAllHp(deltas: Record<string, number>): void {
        for (const [pid, delta] of Object.entries(deltas)) {
            if (parseInt(String(delta), 10) === 0) continue;
            const el = document.getElementById(`stp-hp-${pid}`);
            if (el) {
                const current = parseInt((el.textContent ?? '').replace('❤ ', ''), 10);
                this.updatePlayerHp(parseInt(pid, 10), current - parseInt(String(delta), 10));
            }
        }
    }

    // -------------------------------------------------------------------------
    // Прочее
    // -------------------------------------------------------------------------

    // Сосед слева = следующий по часовой (как leftNeighbor на сервере [H9]).
    leftNeighborId(pid: number): number | null {
        const nos = Object.values(this.gamedatas.players)
            .map(p => ({ id: parseInt(p.id, 10), no: this.bga.players.getPlayerNoById(parseInt(p.id, 10)) }))
            .filter(p => p.no !== null)
            .sort((a, b) => a.no - b.no);
        if (!nos.length) return null;
        const idx = nos.findIndex(p => p.id === pid);
        if (idx < 0) return null;
        return nos[(idx + 1) % nos.length].id;
    }

    // -------------------------------------------------------------------------
    // Уведомления (имена — точки входа фреймворка, не переименовывать!)
    // -------------------------------------------------------------------------

    async notif_newHand(args: any): Promise<void> {
        await this.passCardsFeature.discard(); // переданные карты ушли получателю
        const hand = sortHand(args.hand.map((c: any) => this.normalizeCard(c)));
        const oldIds = this.myHand.map(c => c.id).sort().join(',');
        const newIds = hand.map(c => c.id).sort().join(',');
        if (oldIds === newIds) return; // та же рука (первая раздача отражена в setup)
        const old = [...this.myHand];
        this.myHand = hand;
        if (old.length > 0) {
            await this.handStock.removeCards(old);
        }
        await this.handStock.addCards(hand);
    }

    notif_newRound(args: any): void {
        // Полная перестройка стола: очистка взятки и змей, реликвии в центр
        if (this.currentTrick.length > 0) {
            this.trickStock.removeCards([...this.currentTrick]);
            this.currentTrick = [];
        }
        clearTrickLabels();
        for (const player of Object.values(this.gamedatas.players)) {
            const pid = parseInt(player.id, 10);
            const snakes = this.snakeCards[pid] ?? [];
            if (snakes.length > 0) {
                this.snakeStocks[pid].removeCards([...snakes]);
                this.snakeCards[pid] = [];
            }
            this.updatePlayerRelics(pid, 0);
            updateBites(this, pid);
        }
    }

    notif_passCountDecided(args: any): void { /* лог в журнале */ }

    notif_cardsPassed(args: any): void { /* лог в журнале; карты придут через newHand */ }

    async notif_passCancelled(args: any): Promise<void> {
        if (parseInt(args.player_id, 10) !== parseInt(this.bga.players.getCurrentPlayerId(), 10)) return;
        await this.passCardsFeature.restore();
        if (this.bga.states.getCurrentMainStateName() === 'PassCards') {
            const count = parseInt((this.bga.states.getCurrentMainStateClass()?.args ?? {}).count, 10);
            this.passCardsFeature.showSelection(count, this.leftNeighborId(this.bga.players.getCurrentPlayerId()));
        }
    }

    notif_relicsTaken(args: any): void {
        this.updatePlayerRelics(parseInt(args.player_id, 10), parseInt(args.player_relics, 10));
        this.draftOverlay.syncNotif(parseInt(args.center, 10));
    }

    notif_relicsPassed(args: any): void { /* лог в журнале */ }

    notif_curse(args: any): void {
        for (const pid of Object.keys(args.losses)) {
            this.updatePlayerRelics(parseInt(pid, 10), 0);
        }
    }

    notif_specialHunt(args: any): void { /* реликвии остаются у игроков [H5] */ }

    async notif_cardPlayed(args: any): Promise<void> {
        const card = this.normalizeCard(args.card);
        this.currentTrick.push(card);
        const mine = this.myHand.some(c => c.id === card.id);
        if (mine) {
            this.myHand = this.myHand.filter(c => c.id !== card.id);
            await this.trickStock.addCards([card], { fromStock: this.handStock });
        } else {
            await this.trickStock.addCards([card]);
        }
        labelTrickCard(this, card, parseInt(args.player_id, 10));
    }

    async notif_trickWon(args: any): Promise<void> {
        const winnerId = parseInt(args.player_id, 10);
        const snakeCards = (args.snakeCards ?? []).map((c: any) => this.normalizeCard(c));
        if (snakeCards.length > 0) {
            this.snakeCards[winnerId] = [...(this.snakeCards[winnerId] ?? []), ...snakeCards];
            await this.snakeStocks[winnerId].addCards(snakeCards, { fromStock: this.trickStock });
        }
        const discarded = this.currentTrick.filter(c => !snakeCards.some((s: Card) => s.id === c.id));
        if (discarded.length > 0) {
            await this.trickStock.removeCards(discarded);
        }
        this.currentTrick = [];
        clearTrickLabels();
        layoutSnakeZone(this, winnerId);
    }

    async notif_huntEnded(args: any): Promise<void> {
        // Досрочный конец охоты [H16]: сервер сбросил оставшиеся карты —
        // убираем свою руку (чужие руки на столе не отображаются).
        if (this.myHand.length > 0) {
            const remaining = [...this.myHand];
            this.myHand = [];
            await this.handStock.removeCards(remaining);
        }
    }

    notif_huntScored(args: any): void {
        this.adjustAllHp(args.losses);
        showRoundSummary(this, args.relics, args.losses);
    }

    notif_specialScored(args: any): void {
        for (const [pid, gain] of Object.entries(args.gains)) {
            if (parseInt(String(gain), 10) === 0) continue;
            const el = document.getElementById(`stp-hp-${pid}`);
            if (el) {
                const current = parseInt((el.textContent ?? '').replace('❤ ', ''), 10);
                this.updatePlayerHp(parseInt(pid, 10), current + parseInt(String(gain), 10));
            }
        }
        // особая охота не наносит урона [H6] — колонка урона вся в нулях
        const zeroLosses: Record<string, number> = {};
        for (const pid of Object.keys(args.gains)) zeroLosses[pid] = 0;
        showRoundSummary(this, args.relics, zeroLosses);
    }

    notif_sacrifice(args: any): void {
        const saint = parseInt(args.player_id, 10);
        const deltas: Record<string, number> = {};
        const losses: Record<string, number> = {};
        for (const player of Object.values(this.gamedatas.players)) {
            const pid = parseInt(player.id, 10);
            losses[pid] = pid === saint ? 0 : 3; // SACRIFICE_PENALTY [H15]
            if (pid !== saint) deltas[pid] = 3;
        }
        this.adjustAllHp(deltas);
        // в уведомлении нет реликвий — берём из счётчиков (клиент их ведёт)
        const relics: Record<string, number> = {};
        for (const player of Object.values(this.gamedatas.players)) {
            const pid = parseInt(player.id, 10);
            relics[pid] = parseInt(document.getElementById(`stp-relics-${pid}`)?.textContent ?? '0', 10);
        }
        showRoundSummary(this, relics, losses);
    }
}

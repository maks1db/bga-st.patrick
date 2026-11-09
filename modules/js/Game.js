/**
 *------
 * BGA framework: Gregory Isabelli & Emmanuel Colin & BoardGameArena
 * StPatrick implementation : © Maksim <maxim@bga>
 *
 * This code has been produced on the BGA studio platform for use on http://boardgamearena.com.
 * See http://en.boardgamearena.com/#!doc/Studio for more information.
 * -----
 *
 * Game.js — client for «Охота на змей» (St Patrick).
 */

const BgaAnimations = await importEsmLib('bga-animations', '1.x');
const BgaCards = await importEsmLib('bga-cards', '1.x');

const SUIT_KEYS = { 1: 'Clover', 2: 'Cross', 3: 'Harp', 4: 'Snake' };
const SUIT_CLOVER = 1, SUIT_CROSS = 2, SUIT_HARP = 3, SUIT_SNAKE = 4;
// ряд масти в img/main-sprite.png (ячейка 136×188, порядок колонок — значение 1–9)
const SUIT_SPRITE_ROW = { [SUIT_CLOVER]: 0, [SUIT_HARP]: 1, [SUIT_SNAKE]: 2, [SUIT_CROSS]: 3 };
// Размер карт: на узких экранах — уменьшенный. Дублируется media query в stpatrick.css!
const CARD_W = window.innerWidth < 640 ? 72 : 102;
const CARD_H = window.innerWidth < 640 ? 99 : 141;
// Рука крупнее полевых карт при <995px — zoom в media query stpatrick.css
// (#stp-hand .stp-card). Один менеджер карт: bga-cards НЕ умеет переносить
// элемент карты между менеджерами («not attached to any Stock»).

function suitName(suit) {
    return _(SUIT_KEYS[suit]);
}

function cardBites(card) {
    const suit = parseInt(card.suit, 10);
    const value = parseInt(card.value, 10);
    if (suit === SUIT_SNAKE) return 1;
    if (value === 7 && (suit === SUIT_CROSS || suit === SUIT_HARP)) return 3;
    return 0;
}

function sortHand(cards) {
    return [...cards].sort((a, b) => a.suit - b.suit || a.value - b.value);
}

/**
 * Раунды 2+: единственный игрок с минимумом HP выбирает 0/1/2.
 */
class DecidePassCount {
    constructor(game, bga) { this.game = game; this.bga = bga; }

    onEnteringState(args, isCurrentPlayerActive) {
        this.game.closeDraftOverlay();
        this.bga.statusBar.setTitle(isCurrentPlayerActive
            ? _('${you} decide how many cards everyone passes (0, 1 or 2)')
            : _('${actplayer} decides how many cards everyone passes'));
        if (isCurrentPlayerActive) {
            for (const n of [0, 1, 2]) {
                this.bga.statusBar.addActionButton(_('${n} card(s)').replace('${n}', String(n)),
                    () => this.bga.actions.performAction('actSetPassCount', { count: n }));
            }
        }
    }
}

/**
 * Одновременная передача карт соседу слева. Игроки остаются framework-active
 * до раскрытия (сервер следит за глобалом pass_done) — поэтому отмена
 * возможна через обычное действие, а хук активации не срабатывает
 * при подтверждении: клиент сам переключает UI в режим ожидания.
 */
class PassCards {
    constructor(game, bga) { this.game = game; this.bga = bga; }

    onEnteringState(args, isCurrentPlayerActive) {
        this.game.closeDraftOverlay();
        this.onPlayerActivationChange(args, isCurrentPlayerActive);
    }

    onPlayerActivationChange(args, isCurrentPlayerActive) {
        // идемпотентно: хуки multiactive могут дублироваться
        document.getElementById('stp-pass-confirm')?.remove();
        this.game.clearHandSelection();
        const count = parseInt(args.count, 10);
        const toId = this.game.leftNeighborId(this.bga.players.getCurrentPlayerId());
        if (!isCurrentPlayerActive) {
            this.bga.statusBar.setTitle(_('Other players are choosing cards to pass'));
            this.game.showPassInfo(toId, null);
        } else if ((this.game.passCards ?? []).length > 0) {
            this.game.passAck = true; // карты из gamedatas.passed — пас уже на сервере
            this.game.showWaitingPass(toId); // уже подтвердил (reload) — ждём раскрытия
        } else {
            this.game.restorePassedCards(); // отмена: карты возвращаются из зоны передачи в руку
            this.game.showPassSelection(count, toId);
        }
    }

    onLeavingState(args, isCurrentPlayerActive) {
        document.getElementById('stp-pass-confirm')?.remove();
        this.game.removePassInfo();
        this.game.clearHandSelection();
        this.game.discardPassZone(); // карты ушли получателям — зона больше не нужна
    }
}

/**
 * Разбор реликвий: оверлей поверх игрового поля (#stp-board) с ларцом.
 * Оверлей живёт между входами (следующий драфтер) и закрывается
 * при входе в любую другую фазу.
 */
class DraftRelics {
    constructor(game, bga) { this.game = game; this.bga = bga; }

    onEnteringState(args, isCurrentPlayerActive) {
        this.bga.statusBar.setTitle(isCurrentPlayerActive
            ? _('${you} must take relics or pass')
            : _('${actplayer} is taking relics or passing'));
        this.game.openDraftOverlay(args, isCurrentPlayerActive);
    }

    onLeavingState() { /* оверлей закрывается при входе в другую фазу */ }
}

/**
 * Конец игры: снять оверлей драфта, если он остался.
 */
class GameEnd {
    constructor(game, bga) { this.game = game; this.bga = bga; }
    onEnteringState() { this.game.closeDraftOverlay(); }
    onLeavingState() { }
}

/**
 * Охота на змей: выложить карту в взятку (обязательный выход в масть).
 */
class HuntPlay {
    constructor(game, bga) { this.game = game; this.bga = bga; }

    onEnteringState(args, isCurrentPlayerActive) {
        this.game.closeDraftOverlay();
        this.game.clearHandSelection();
        if (isCurrentPlayerActive) {
            const leadSuit = args.leadSuit === null || args.leadSuit === undefined ? null : parseInt(args.leadSuit, 10);
            const legal = this.game.legalHandCards(leadSuit);
            this.bga.statusBar.setTitle(leadSuit === null
                ? _('${you} must lead a trick — play any card')
                : _('${you} must follow the lead suit (${suit})').replace('${suit}', suitName(leadSuit)));
            this.game.setHandSelectable(legal, 1, true);
        } else {
            this.bga.statusBar.setTitle(_('${actplayer} must play a card'));
        }
    }

    onLeavingState(args, isCurrentPlayerActive) {
        this.game.clearHandSelection();
    }
}

export class Game {
    constructor(bga) {
        this.bga = bga;

        this.animationManager = new BgaAnimations.Manager({
            animationsActive: () => this.bga.gameui.bgaAnimationsActive(),
        });
        this.cardsManager = new BgaCards.Manager({
            animationManager: this.animationManager,
            type: 'stp-card',
            cardWidth: CARD_W,
            cardHeight: CARD_H,
            getId: (card) => card.id,
            setupDiv: (card, div) => {
                div.style.width = CARD_W + 'px';
                div.style.height = CARD_H + 'px';
                div.classList.remove('stp-selected'); // выделение не должно жить на reused-карте
                div.querySelector('.stp-trick-by')?.remove(); // подпись не должна жить на reused-карте
            },
            setupFrontDiv: (card, div) => this.setupCardFront(card, div),
            setupBackDiv: (card, div) => { div.innerHTML = '<span class="stp-card-back-logo">☘</span>'; },
            isCardVisible: (card) => true,
        });

        this.bga.states.register('DecidePassCount', new DecidePassCount(this, bga));
        this.bga.states.register('PassCards', new PassCards(this, bga));
        this.bga.states.register('DraftRelics', new DraftRelics(this, bga));
        this.bga.states.register('HuntPlay', new HuntPlay(this, bga));
        this.bga.states.register('gameEnd', new GameEnd(this, bga));

        this.myHand = [];       // мои карты (объекты card)
        this.currentTrick = []; // карты текущей взятки
        this.passCards = [];    // мои подтверждённые карты в зоне передачи (ждут раскрытия)
        this.passAck = false;   // пас подтверждён сервером (кнопка Cancel разрешена)
        this.snakeCards = {};   // pid => карты в открытой зоне
        this.selectableMode = null; // null | 'select' | 'play'
        this.maxSelected = 0;
    }

    setup(gamedatas) {
        this.gamedatas = gamedatas;
        this.myHand = sortHand(gamedatas.hand.map(c => this.normalizeCard(c)));
        this.currentTrick = gamedatas.trick.map(c => this.normalizeCard(c));
        this.passCards = (gamedatas.passed ?? []).map(c => this.normalizeCard(c));
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
            document.getElementById('stp-players').insertAdjacentHTML('beforeend', `
                <div class="stp-player-zone" id="stp-zone-${pid}">
                    <div class="stp-player-head">
                        <span class="stp-player-name" style="color:#${player.color}">${player.name}</span>
                        <span class="stp-hp" title="${_('Life points')}"><span class="stp-elt stp-elt-heart stp-elt-sm"></span> <span id="stp-hp-${pid}">${parseInt(player.score, 10)}</span></span>
                        <span class="stp-relic-count" title="${_('Relics')}"><span class="stp-elt stp-elt-relic stp-elt-sm"></span> <span id="stp-relics-${pid}">${parseInt(gamedatas.relics[pid] ?? 0, 10)}</span></span>
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
        this.handStock.setSort((a, b) => parseInt(a.suit, 10) - parseInt(b.suit, 10) || parseInt(a.value, 10) - parseInt(b.value, 10));
        // <995px (планшет/мобилка): рука — сетка, а не веер. Карты стоят
        // ровно (без поворотов и перекрытий) и переносятся на строку ниже
        // (flex-wrap в media query stpatrick.css — breakpoint дублируется!).
        // Веерные механики библиотеки отключаем; floating-класс глушится CSS.
        this.handGridMode = window.innerWidth < 995;
        if (this.handGridMode) {
            this.handStock.fanShaped = false;
            this.handStock.updateCardPositions = () => {};
            this.handStock.watchFloatingState = () => {};
        } else if (window.innerWidth < 640) {
            this.handStock.minOverlap = 28; // полоса карты максимально широкая в пределах экрана
        }
        this.handStock.onSelectionChange = (selection) => this.onHandSelectionChange(selection);
        this.trickStock = new BgaCards.LineStock(this.cardsManager, document.getElementById('stp-trick'));
        this.passStock = new BgaCards.LineStock(this.cardsManager, document.getElementById('stp-pass-cards'));
        this.snakeStocks = {};
        for (const player of Object.values(gamedatas.players)) {
            const pid = parseInt(player.id, 10);
            this.snakeStocks[pid] = new BgaCards.LineStock(this.cardsManager, document.getElementById(`stp-snakes-${pid}`));
        }

        this.handStock.addCards(this.myHand);
        if (this.passCards.length > 0) {
            this.passStock.addCards(this.passCards); // после reload: карты снова в зоне передачи
        }
        if (this.currentTrick.length > 0) {
            this.trickStock.addCards(this.currentTrick);
            const trickPlayers = gamedatas.trickPlayers ?? {};
            for (const c of this.currentTrick) {
                this.labelTrickCard(c, parseInt(trickPlayers[c.id] ?? 0, 10));
            }
        }
        // (пиннг зубастых влево убран — карты взятки всегда центрируются flex'ом)
        for (const player of Object.values(gamedatas.players)) {
            const pid = parseInt(player.id, 10);
            if (this.snakeCards[pid].length > 0) {
                this.snakeStocks[pid].addCards(this.snakeCards[pid]);
                setTimeout(() => this.layoutSnakeZone(pid), 600); // после отрисовки стока
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
        let resizeTimer = null;
        window.addEventListener('resize', () => {
            clearTimeout(resizeTimer);
            resizeTimer = setTimeout(() => {
                if ((window.innerWidth < 640) !== breakpoints[0]
                    || (window.innerWidth < 995) !== breakpoints[1]) {
                    location.reload();
                    return;
                }
                // без смены брейкпоинта: рука могла перестроить ряды —
                // подтягиваем низ оверлея драфта
                this.syncDraftBottom();
            }, 300);
        });
    }

    // -------------------------------------------------------------------------
    // Карты
    // -------------------------------------------------------------------------

    normalizeCard(card) {
        return {
            id: parseInt(card.id, 10),
            suit: parseInt(card.suit, 10),
            value: parseInt(card.value, 10),
            location: card.location,
            locationArg: card.locationArg === null || card.locationArg === undefined ? null : parseInt(card.locationArg, 10),
        };
    }

    // Менеджер карт размера CARD_W×CARD_H (один на всё — см. константы).
    setupCardFront(card, div) {
        const suit = parseInt(card.suit, 10);
        const value = parseInt(card.value, 10);
        const row = SUIT_SPRITE_ROW[suit];
        // Позиция ячейки — через CSS-переменные (см. .stp-card-front)
        div.style.setProperty('--bp-x', `${(value - 1) * CARD_W}px`);
        div.style.setProperty('--bp-y', `${row * CARD_H}px`);
        const bites = cardBites({ suit, value });
        div.title = `${suitName(suit)} ${value}${bites > 0 ? ` — ${bites} ${_('bite(s)')}` : ''}`;
    }

    legalHandCards(leadSuit) {
        if (leadSuit === null) return [...this.myHand];
        const follow = this.myHand.filter(c => c.suit === leadSuit);
        return follow.length > 0 ? follow : [...this.myHand];
    }

    setHandSelectable(cards, maxSelected, singleClickPlay = false) {
        this.selectableMode = singleClickPlay ? 'play' : 'select';
        this.maxSelected = maxSelected;
        this.handStock.setSelectionMode(singleClickPlay ? 'single' : 'multiple');
        this.handStock.setSelectableCards(cards);
    }

    clearHandSelection() {
        this.selectableMode = null;
        this.handStock.setSelectionMode('none');
        document.querySelectorAll('#stp-hand .stp-selected').forEach(el => el.classList.remove('stp-selected'));
    }

    onHandSelectionChange(selection) {
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
            const btn = document.getElementById('stp-pass-confirm');
            if (btn) btn.disabled = selection.length !== this.maxSelected;
        }
    }

    async confirmPassSelection(count) {
        const selection = this.handStock.getSelection();
        if (selection.length !== count) return;
        const cards = selection.map(c => this.normalizeCard(c));
        document.getElementById('stp-pass-confirm')?.remove();
        this.passCards = [...cards];
        this.myHand = this.myHand.filter(c => !cards.some(p => p.id === c.id));
        this.handStock.unselectAll();
        for (const c of cards) {
            document.getElementById(`stp-card-${c.id}`)?.classList.remove('stp-selected');
        }
        this.syncPassZone(); // зона видима ДО анимации: иначе цель display:none и карта летит в (0,0)
        await this.passStock.addCards(cards, { fromStock: this.handStock });
        this.showWaitingPass(this.leftNeighborId(this.bga.players.getCurrentPlayerId()));
        const p = this.bga.actions.performAction('actPassCards', { cardIds: cards.map(c => c.id) });
        if (!p) { // вызов заблокирован фреймворком — откатываем перенос
            await this.restorePassedCards();
            this.showPassSelection(count, this.leftNeighborId(this.bga.players.getCurrentPlayerId()));
            return;
        }
        try {
            await p;
            this.passAck = true; // сервер принял пас — теперь отмена легальна
            this.syncPassZone();
        } catch (e) {
            await this.restorePassedCards();
            if (this.bga.states.getCurrentMainStateName() === 'PassCards') {
                this.showPassSelection(count, this.leftNeighborId(this.bga.players.getCurrentPlayerId()));
            }
        }
    }

    // Режим выбора карт для передачи (активный игрок).
    showPassSelection(count, toId) {
        this.bga.statusBar.setTitle(_('${you} must select ${count} card(s) to pass to your left neighbor').replace('${count}', String(count)));
        this.setHandSelectable(this.myHand, count);
        this.showPassInfo(toId, count);
        document.getElementById('stp-pass-confirm')?.remove();
        this.bga.statusBar.addActionButton(_('Pass selected cards'),
            () => this.confirmPassSelection(count),
            { id: 'stp-pass-confirm', disabled: true });
    }

    // Режим ожидания раскрытия: карты в зоне передачи, под ними — отмена.
    showWaitingPass(toId) {
        this.bga.statusBar.setTitle(_('You passed ${count} card(s) — waiting for the other players').replace('${count}', String(this.passCards.length)));
        this.showPassInfo(toId, null);
        this.syncPassZone();
    }

    // Зона передачи: карты лежат в основной игровой зоне (#stp-trick).
    // Кнопка Cancel — только после подтверждения паса сервером: иначе
    // отмена улетает раньше actPassCards и сервер честно отвечает ошибкой,
    // а клик во время анимации перелёта роняет removeCards против addCards.
    syncPassZone() {
        const box = document.getElementById('stp-pass-cards');
        const trick = document.getElementById('stp-trick');
        if (!box || !trick) return;
        const has = (this.passCards ?? []).length > 0;
        box.classList.toggle('stp-visible', has);
        document.getElementById('stp-pass-cancel')?.remove();
        if (has && this.passAck) {
            trick.insertAdjacentHTML('afterend',
                `<button class="bgabutton bgabutton_gray" id="stp-pass-cancel" type="button">${_('Cancel')}</button>`);
            document.getElementById('stp-pass-cancel').addEventListener('click', () => this.cancelPass());
        }
    }

    cancelPass() {
        document.getElementById('stp-pass-cancel')?.remove(); // анти-двойной клик
        const p = this.bga.actions.performAction('actCancelPassCards');
        if (!p) { this.syncPassZone(); return; } // вызов заблокирован фреймворком — кнопку вернём
        p.catch(() => this.syncPassZone());
    }

    // Отмена подтверждения: карты возвращаются из зоны передачи в руку (идемпотентно).
    async restorePassedCards() {
        const cards = this.passCards ?? [];
        this.passAck = false;
        if (!cards.length || !this.passStock) { this.syncPassZone(); return; }
        this.passCards = [];
        this.myHand = sortHand([...this.myHand, ...cards]);
        await this.passStock.removeCards(cards);
        await this.handStock.addCards(cards);
        if (this.selectableMode === 'select') {
            this.handStock.setSelectableCards(this.myHand); // карты доехали — повторяем маркировку
        }
        this.syncPassZone();
    }

    // Карты ушли получателям (раскрытие) — зона очищается без возврата в руку.
    async discardPassZone() {
        const cards = this.passCards ?? [];
        this.passCards = [];
        this.passAck = false;
        this.syncPassZone();
        if (!cards.length || !this.passStock) return;
        await this.passStock.removeCards(cards);
    }

    // Сосед слева = следующий по часовой (как leftNeighbor на сервере [H9]).
    leftNeighborId(pid) {
        const nos = Object.values(this.gamedatas.players)
            .map(p => ({ id: parseInt(p.id, 10), no: this.bga.players.getPlayerNoById(parseInt(p.id, 10)) }))
            .filter(p => p.no !== null)
            .sort((a, b) => a.no - b.no);
        if (!nos.length) return null;
        const idx = nos.findIndex(p => p.id === pid);
        if (idx < 0) return null;
        return nos[(idx + 1) % nos.length].id;
    }

    // Баннер в центре поля: кому уйдут переданные карты.
    showPassInfo(toId, count) {
        this.removePassInfo();
        const to = this.gamedatas.players[toId];
        const box = document.getElementById('stp-center');
        if (!to || !box) return;
        const name = `<b style="color:#${to.color}">${to.name}</b>`;
        const text = count === null || count === undefined
            ? _('Cards will be passed to your left neighbor: ${name}').replace('${name}', name)
            : _('You pass ${count} card(s) to ${name}').replace('${count}', String(count)).replace('${name}', name);
        box.insertAdjacentHTML('afterbegin', `<div id="stp-pass-info" class="stp-pass-info">${text}</div>`);
    }

    removePassInfo() {
        document.getElementById('stp-pass-info')?.remove();
    }

    // -------------------------------------------------------------------------
    // Реликвии / HP
    // -------------------------------------------------------------------------

    updatePlayerRelics(pid, count) {
        const el = document.getElementById(`stp-relics-${pid}`);
        if (el) el.textContent = String(count);
    }

    updatePlayerHp(pid, score) {
        const el = document.getElementById(`stp-hp-${pid}`);
        if (el) el.textContent = String(score);
    }

    adjustAllHp(deltas) {
        for (const [pid, delta] of Object.entries(deltas)) {
            if (parseInt(delta, 10) === 0) continue;
            const el = document.getElementById(`stp-hp-${pid}`);
            if (el) {
                const current = parseInt(el.textContent.replace('❤ ', ''), 10);
                this.updatePlayerHp(parseInt(pid, 10), current - parseInt(delta, 10));
            }
        }
    }

    // Суммарные укусы змей игрока (иконка змеи + число, скрыто при 0).
    updateBites(pid) {
        const total = (this.snakeCards[pid] ?? []).reduce((sum, c) => sum + cardBites(c), 0);
        const box = document.getElementById(`stp-bites-${pid}`);
        const n = document.getElementById(`stp-bites-n-${pid}`);
        if (!box || !n) return;
        n.textContent = String(total);
        box.style.display = total > 0 ? '' : 'none';
    }

    // Зона змей: сортировка (масть, номинал), ряды по 6 карт; новые ряды
    // перекрывают предыдущие (CSS: margin-top отрицательный), внутри ряда
    // ранние карты лежат поверх поздних (видна левая полоса с номиналом).
    layoutSnakeZone(pid) {
        const zone = (this.snakeCards[pid] ?? []).slice().sort((a, b) => a.suit - b.suit || a.value - b.value);
        const container = document.getElementById(`stp-snakes-${pid}`);
        if (!container) { this.updateBites(pid); return; }
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
        this.updateBites(pid);
    }

    // -------------------------------------------------------------------------
    // Итоговая таблица раунда: реликвии / урон (потерянные HP) / здоровье.
    // Собирается из уведомлений подсчёта; HP читается из уже обновлённых
    // счётчиков. Живёт до закрытия (×) или до таблицы следующего раунда;
    // при reload не восстанавливается (авторитетная запись — журнал игры).
    // -------------------------------------------------------------------------

    showRoundSummary(relics, losses) {
        document.getElementById('stp-round-summary')?.remove();
        const center = document.getElementById('stp-center');
        if (!center) return;
        const rows = Object.values(this.gamedatas.players).map(p => {
            const pid = parseInt(p.id, 10);
            const hpEl = document.getElementById(`stp-hp-${pid}`);
            const hp = hpEl ? parseInt(hpEl.textContent, 10) : parseInt(p.score, 10);
            const relic = parseInt(relics[pid] ?? 0, 10);
            const dmg = parseInt(losses[pid] ?? 0, 10);
            return `<tr>
                <td class="stp-rs-name" style="color:#${p.color}">${p.name}</td>
                <td><span class="stp-elt stp-elt-relic stp-elt-sm"></span> ${relic}</td>
                <td><span class="stp-elt stp-elt-snake stp-elt-sm"></span> ${dmg}</td>
                <td class="${hp <= 0 ? 'stp-rs-dead' : ''}"><span class="stp-elt stp-elt-heart stp-elt-sm"></span> ${hp}</td>
            </tr>`;
        }).join('');
        center.insertAdjacentHTML('afterbegin', `
            <div id="stp-round-summary">
                <div class="stp-rs-head">
                    <span>${_('Round summary')}</span>
                    <button class="stp-rs-close" id="stp-rs-close" type="button" title="${_('Close')}">×</button>
                </div>
                <table class="stp-rs-table">
                    <tr>
                        <th>${_('Player')}</th>
                        <th><span class="stp-elt stp-elt-relic stp-elt-sm"></span> ${_('Relics')}</th>
                        <th><span class="stp-elt stp-elt-snake stp-elt-sm"></span> ${_('Damage')}</th>
                        <th><span class="stp-elt stp-elt-heart stp-elt-sm"></span> ${_('Health')}</th>
                    </tr>
                    ${rows}
                </table>
            </div>`);
        document.getElementById('stp-rs-close').addEventListener('click', () =>
            document.getElementById('stp-round-summary')?.remove());
    }

    // -------------------------------------------------------------------------
    // Подписи «кто сыграл» над картами в области розыгрыша
    // -------------------------------------------------------------------------

    trickCardEl(card) {
        try {
            const el = this.trickStock.getCardElement?.(card);
            if (el) return el;
        } catch (e) { /* DOM-fallback ниже */ }
        return document.getElementById(`card-${card.id}`)
            ?? document.getElementById(`stp-card-${card.id}`);
    }

    labelTrickCard(card, playerId) {
        const el = this.trickCardEl(card);
        if (!el) return;
        el.querySelector('.stp-trick-by')?.remove();
        if (!playerId) return;
        const player = this.gamedatas.players[playerId];
        if (!player) return;
        const tag = document.createElement('div');
        tag.className = 'stp-trick-by';
        tag.textContent = player.name;
        tag.style.setProperty('--stp-by-color', `#${player.color}`);
        el.appendChild(tag);
    }

    clearTrickLabels() {
        document.querySelectorAll('.stp-trick-by').forEach(el => el.remove());
    }

    // -------------------------------------------------------------------------
    // Оверлей разбора реликвий
    // -------------------------------------------------------------------------

    openDraftOverlay(args, isCurrentPlayerActive) {
        document.body.classList.add('stp-draft-bg', 'stp-draft-open');
        const center = parseInt(args.center, 10);
        if (document.getElementById('stp-draft-overlay')) {
            // повторный вход (следующий драфтер) — интро не повторяем
            this.syncDraftOverlay(center, isCurrentPlayerActive);
            return;
        }

        document.getElementById('stp-board').insertAdjacentHTML('beforeend', `
            <div id="stp-draft-overlay">
                <div class="stp-draft-title"><span class="stp-draft-title-text">${_('Relic Draft')}</span></div>
                <div class="stp-draft-remaining">${_('Remaining:')} <span id="stp-draft-remaining-n">${center}</span></div>
                <div class="stp-draft-controls-slot" id="stp-draft-controls-slot"></div>
                <div class="stp-draft-chest-wrap">
                    <div class="stp-chest stp-draft-chest" id="stp-draft-chest">
                        <div class="stp-draft-relics" id="stp-draft-chest-relics"></div>
                    </div>
                </div>
            </div>
        `);
        this.syncDraftBottom();
        this.draftTokens = [];
        this.draftTimers = [];

        // тёмный фон → заголовок по центру → 1 с пауза → заголовок наверх, ларец
        requestAnimationFrame(() => document.getElementById('stp-draft-overlay').classList.add('stp-open'));
        this.draftTimers.push(setTimeout(() => {
            if (!document.getElementById('stp-draft-overlay')) return;
            document.getElementById('stp-draft-overlay').classList.add('stp-placed');
            this.renderDraftChestRelics(center);
            this.mountDraftControls(center, isCurrentPlayerActive);
            this.syncDraftBottom(); // рука могла догрузиться к моменту показа ларца
        }, 1700));
    }

    syncDraftOverlay(center, isCurrentPlayerActive) {
        const n = document.getElementById('stp-draft-remaining-n');
        if (n) n.textContent = String(center);
        this.renderDraftChestRelics(center);
        this.mountDraftControls(center, isCurrentPlayerActive);
        this.syncDraftBottom();
    }

    // Низ оверлея — по верхней кромке руки (z 960 поверх оверлея):
    // ларец и управление не уходят под карты. Веерные карты визуально вылезают
    // за верх контейнера руки (повороты веера) — свес меряем по реальным
    // rect'ам карт и прибавляем к низу оверлея (делим на page-zoom, т.к.
    // offsetHeight в layout-пикселях, а rect — в визуальных).
    // Заодно вписываем ларец в остаток высоты оверлея (--stp-draft-chest-size),
    // иначе при поднятом низе ларец обрезался бы оверлеем (overflow: auto).
    syncDraftBottom() {
        const overlay = document.getElementById('stp-draft-overlay');
        const hand = document.getElementById('stp-hand');
        if (!overlay || !hand) return;
        const handRect = hand.getBoundingClientRect();
        const zoom = hand.offsetHeight ? handRect.height / hand.offsetHeight : 1;
        let overflow = 0;
        hand.querySelectorAll('.stp-card').forEach(card => {
            overflow = Math.max(overflow, handRect.top - card.getBoundingClientRect().top);
        });
        const bottom = hand.offsetHeight + Math.ceil(Math.max(0, overflow) / zoom);
        overlay.style.setProperty('--stp-draft-bottom', bottom + 'px');
        const wrap = overlay.querySelector('.stp-draft-chest-wrap');
        if (wrap) {
            const avail = overlay.clientHeight - wrap.offsetTop - 12; // padding-bottom оверлея
            if (avail > 0) overlay.style.setProperty('--stp-draft-chest-size', Math.floor(avail) + 'px');
        }
    }

    closeDraftOverlay() {
        document.body.classList.remove('stp-draft-bg', 'stp-draft-open');
        (this.draftTimers ?? []).forEach(clearTimeout);
        this.draftTimers = [];
        const overlay = document.getElementById('stp-draft-overlay');
        if (!overlay) return;
        overlay.classList.remove('stp-open');
        setTimeout(() => overlay.remove(), 400);
        this.draftTokens = [];
    }

    renderDraftChestRelics(count) {
        const box = document.getElementById('stp-draft-chest-relics');
        if (!box) return;
        this.draftTokens = this.draftTokens ?? [];
        while (this.draftTokens.length < count) {
            const token = document.createElement('div');
            token.className = 'stp-elt stp-elt-relic stp-draft-relic';
            token.style.left = `${32 + Math.random() * 39}%`;
            token.style.top = `${54 + Math.random() * 22}%`;
            token.style.setProperty('--rot', `${Math.round(Math.random() * 40 - 20)}deg`);
            box.appendChild(token);
            this.draftTokens.push(token);
        }
        while (this.draftTokens.length > count) {
            const token = this.draftTokens.pop();
            token.classList.add('stp-out');
            setTimeout(() => token.remove(), 400);
        }
    }

    mountDraftControls(center, isCurrentPlayerActive) {
        document.getElementById('stp-draft-controls')?.remove();
        if (!isCurrentPlayerActive) return;
        document.getElementById('stp-draft-controls-slot').insertAdjacentHTML('beforeend', `
            <div class="stp-draft-controls" id="stp-draft-controls">
                <div class="stp-take-stepper">
                    <button class="stp-step-btn" id="stp-step-down" type="button">−</button>
                    <span class="stp-step-value" id="stp-step-value">1</span>
                    <button class="stp-step-btn" id="stp-step-up" type="button">+</button>
                </div>
                <button class="bgabutton bgabutton_blue" id="stp-take-relics" type="button">${_('Take')}</button>
                <button class="bgabutton bgabutton_gray" id="stp-pass-relics" type="button">${_('Pass')}</button>
            </div>
        `);
        const valueEl = document.getElementById('stp-step-value');
        const sync = () => {
            const v = parseInt(valueEl.textContent, 10);
            document.getElementById('stp-step-down').disabled = v <= 1;
            document.getElementById('stp-step-up').disabled = v >= center;
        };
        const step = (delta) => {
            valueEl.textContent = String(Math.min(Math.max(1, parseInt(valueEl.textContent, 10) + delta), center));
            sync();
        };
        document.getElementById('stp-step-down').addEventListener('click', () => step(-1));
        document.getElementById('stp-step-up').addEventListener('click', () => step(1));
        document.getElementById('stp-take-relics').addEventListener('click', () =>
            this.bga.actions.performAction('actTakeRelics', { count: parseInt(valueEl.textContent, 10) }));
        document.getElementById('stp-pass-relics').addEventListener('click', () =>
            this.bga.actions.performAction('actPassRelics'));
        sync();
    }

    // -------------------------------------------------------------------------
    // Уведомления
    // -------------------------------------------------------------------------

    async notif_newHand(args) {
        await this.discardPassZone(); // переданные карты ушли получателю
        const hand = sortHand(args.hand.map(c => this.normalizeCard(c)));
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

    notif_newRound(args) {
        // Полная перестройка стола: очистка взятки и змей, реликвии в центр
        if (this.currentTrick.length > 0) {
            this.trickStock.removeCards([...this.currentTrick]);
            this.currentTrick = [];
        }
        this.clearTrickLabels();
        for (const player of Object.values(this.gamedatas.players)) {
            const pid = parseInt(player.id, 10);
            const snakes = this.snakeCards[pid] ?? [];
            if (snakes.length > 0) {
                this.snakeStocks[pid].removeCards([...snakes]);
                this.snakeCards[pid] = [];
            }
            this.updatePlayerRelics(pid, 0);
            this.updateBites(pid);
        }
    }

    notif_passCountDecided(args) { /* лог в журнале */ }

    notif_cardsPassed(args) { /* лог в журнале; карты придут через newHand */ }

    async notif_passCancelled(args) {
        if (parseInt(args.player_id, 10) !== parseInt(this.bga.players.getCurrentPlayerId(), 10)) return;
        await this.restorePassedCards();
        if (this.bga.states.getCurrentMainStateName() === 'PassCards') {
            const count = parseInt((this.bga.states.getCurrentMainStateClass()?.args ?? {}).count, 10);
            this.showPassSelection(count, this.leftNeighborId(this.bga.players.getCurrentPlayerId()));
        }
    }

    notif_relicsTaken(args) {
        this.updatePlayerRelics(parseInt(args.player_id, 10), parseInt(args.player_relics, 10));
        const n = document.getElementById('stp-draft-remaining-n');
        if (n) n.textContent = String(parseInt(args.center, 10));
        this.renderDraftChestRelics(parseInt(args.center, 10));
    }

    notif_relicsPassed(args) { /* лог в журнале */ }

    notif_curse(args) {
        for (const pid of Object.keys(args.losses)) {
            this.updatePlayerRelics(parseInt(pid, 10), 0);
        }
    }

    notif_specialHunt(args) { /* реликвии остаются у игроков [H5] */ }

    async notif_cardPlayed(args) {
        const card = this.normalizeCard(args.card);
        this.currentTrick.push(card);
        const mine = this.myHand.some(c => c.id === card.id);
        if (mine) {
            this.myHand = this.myHand.filter(c => c.id !== card.id);
            await this.trickStock.addCards([card], { fromStock: this.handStock });
        } else {
            await this.trickStock.addCards([card]);
        }
        this.labelTrickCard(card, parseInt(args.player_id, 10));
    }

    async notif_trickWon(args) {
        const winnerId = parseInt(args.player_id, 10);
        const snakeCards = (args.snakeCards ?? []).map(c => this.normalizeCard(c));
        if (snakeCards.length > 0) {
            this.snakeCards[winnerId] = [...(this.snakeCards[winnerId] ?? []), ...snakeCards];
            await this.snakeStocks[winnerId].addCards(snakeCards, { fromStock: this.trickStock });
        }
        const discarded = this.currentTrick.filter(c => !snakeCards.some(s => s.id === c.id));
        if (discarded.length > 0) {
            await this.trickStock.removeCards(discarded);
        }
        this.currentTrick = [];
        this.clearTrickLabels();
        this.layoutSnakeZone(winnerId);
    }

    notif_huntScored(args) {
        this.adjustAllHp(args.losses);
        this.showRoundSummary(args.relics, args.losses);
    }

    notif_specialScored(args) {
        for (const [pid, gain] of Object.entries(args.gains)) {
            if (parseInt(gain, 10) === 0) continue;
            const el = document.getElementById(`stp-hp-${pid}`);
            if (el) {
                const current = parseInt(el.textContent.replace('❤ ', ''), 10);
                this.updatePlayerHp(parseInt(pid, 10), current + parseInt(gain, 10));
            }
        }
        // особая охота не наносит урона [H6] — колонка урона вся в нулях
        const zeroLosses = {};
        for (const pid of Object.keys(args.gains)) zeroLosses[pid] = 0;
        this.showRoundSummary(args.relics, zeroLosses);
    }

    notif_sacrifice(args) {
        const saint = parseInt(args.player_id, 10);
        const deltas = {};
        const losses = {};
        for (const player of Object.values(this.gamedatas.players)) {
            const pid = parseInt(player.id, 10);
            losses[pid] = pid === saint ? 0 : 3; // SACRIFICE_PENALTY [H15]
            if (pid !== saint) deltas[pid] = 3;
        }
        this.adjustAllHp(deltas);
        // в уведомлении нет реликвий — берём из счётчиков (клиент их ведёт)
        const relics = {};
        for (const player of Object.values(this.gamedatas.players)) {
            const pid = parseInt(player.id, 10);
            relics[pid] = parseInt(document.getElementById(`stp-relics-${pid}`)?.textContent ?? 0, 10);
        }
        this.showRoundSummary(relics, losses);
    }
}

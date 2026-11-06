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
const CARD_W = window.innerWidth < 640 ? 76 : 102;
const CARD_H = window.innerWidth < 640 ? 105 : 141;

function suitName(suit) {
    return _(SUIT_KEYS[suit]);
}

function cardBites(card) {
    if (card.suit === SUIT_SNAKE) return 1;
    if (card.value === 7 && (card.suit === SUIT_CROSS || card.suit === SUIT_HARP)) return 3;
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
 * Одновременная передача карт соседу слева.
 */
class PassCards {
    constructor(game, bga) { this.game = game; this.bga = bga; }

    onEnteringState(args, isCurrentPlayerActive) {
        this.game.closeDraftOverlay();
        this.onPlayerActivationChange(args, isCurrentPlayerActive);
    }

    onPlayerActivationChange(args, isCurrentPlayerActive) {
        const count = parseInt(args.count, 10);
        // идемпотентно: хуки multiactive могут дублироваться
        document.getElementById('stp-pass-confirm')?.remove();
        this.game.clearHandSelection();
        if (isCurrentPlayerActive) {
            this.bga.statusBar.setTitle(_('${you} must select ${count} card(s) to pass to your left neighbor').replace('${count}', String(count)));
            this.game.setHandSelectable(this.game.myHand, count);
            this.bga.statusBar.addActionButton(_('Pass selected cards'),
                () => this.game.confirmPassSelection(count),
                { id: 'stp-pass-confirm', disabled: true });
        } else {
            this.bga.statusBar.setTitle(_('Other players are choosing cards to pass'));
        }
    }

    onLeavingState(args, isCurrentPlayerActive) {
        document.getElementById('stp-pass-confirm')?.remove();
        this.game.clearHandSelection();
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
        this.snakeCards = {};   // pid => карты в открытой зоне
        this.selectableMode = null; // null | 'select' | 'play'
        this.maxSelected = 0;
    }

    setup(gamedatas) {
        this.gamedatas = gamedatas;
        this.myHand = sortHand(gamedatas.hand.map(c => this.normalizeCard(c)));
        this.currentTrick = gamedatas.trick.map(c => this.normalizeCard(c));
        for (const player of Object.values(gamedatas.players)) {
            const pid = parseInt(player.id, 10);
            this.snakeCards[pid] = (gamedatas.snakes[pid] ?? []).map(c => this.normalizeCard(c));
        }

        const area = this.bga.gameArea.getElement();
        area.insertAdjacentHTML('beforeend', `
            <div id="stp-board">
                <div id="stp-players"></div>
                <div id="stp-center">
                    <div id="stp-trick"></div>
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
                        <span class="stp-hp" id="stp-hp-${pid}" title="${_('Life points')}">❤ ${parseInt(player.score, 10)}</span>
                        <span class="stp-relic-count" id="stp-relics-${pid}" title="${_('Relics')}">⛨ ${parseInt(gamedatas.relics[pid] ?? 0, 10)}</span>
                    </div>
                    <div class="stp-snakes" id="stp-snakes-${pid}"></div>
                </div>
            `);
        }

        // Стоки карт
        this.handStock = new BgaCards.HandStock(this.cardsManager, document.getElementById('stp-hand'));
        this.handStock.onSelectionChange = (selection) => this.onHandSelectionChange(selection);
        this.trickStock = new BgaCards.LineStock(this.cardsManager, document.getElementById('stp-trick'));
        this.snakeStocks = {};
        for (const player of Object.values(gamedatas.players)) {
            const pid = parseInt(player.id, 10);
            this.snakeStocks[pid] = new BgaCards.LineStock(this.cardsManager, document.getElementById(`stp-snakes-${pid}`));
        }

        this.handStock.addCards(this.myHand);
        if (this.currentTrick.length > 0) {
            this.trickStock.addCards(this.currentTrick);
            const trickPlayers = gamedatas.trickPlayers ?? {};
            for (const c of this.currentTrick) {
                this.labelTrickCard(c, parseInt(trickPlayers[c.id] ?? 0, 10));
            }
        }
        for (const player of Object.values(gamedatas.players)) {
            const pid = parseInt(player.id, 10);
            if (this.snakeCards[pid].length > 0) {
                this.snakeStocks[pid].addCards(this.snakeCards[pid]);
            }
        }

        this.bga.notifications.setupPromiseNotifications();
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

    setupCardFront(card, div) {
        const suit = parseInt(card.suit, 10);
        const value = parseInt(card.value, 10);
        const row = SUIT_SPRITE_ROW[suit];
        div.style.backgroundPosition = `-${(value - 1) * CARD_W}px -${row * CARD_H}px`;
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
    }

    onHandSelectionChange(selection) {
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

    confirmPassSelection(count) {
        const selection = this.handStock.getSelection();
        if (selection.length !== count) return;
        this.bga.actions.performAction('actPassCards', {
            cardIds: selection.map(c => parseInt(c.id, 10)),
        });
    }

    // -------------------------------------------------------------------------
    // Реликвии / HP
    // -------------------------------------------------------------------------

    updatePlayerRelics(pid, count) {
        const el = document.getElementById(`stp-relics-${pid}`);
        if (el) el.textContent = `⛨ ${count}`;
    }

    updatePlayerHp(pid, score) {
        const el = document.getElementById(`stp-hp-${pid}`);
        if (el) el.textContent = `❤ ${score}`;
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
        el.appendChild(tag);
    }

    clearTrickLabels() {
        document.querySelectorAll('.stp-trick-by').forEach(el => el.remove());
    }

    // -------------------------------------------------------------------------
    // Оверлей разбора реликвий
    // -------------------------------------------------------------------------

    openDraftOverlay(args, isCurrentPlayerActive) {
        document.body.classList.add('stp-draft-bg');
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
        this.draftTokens = [];
        this.draftTimers = [];

        // тёмный фон → заголовок по центру → 1 с пауза → заголовок наверх, ларец
        requestAnimationFrame(() => document.getElementById('stp-draft-overlay').classList.add('stp-open'));
        this.draftTimers.push(setTimeout(() => {
            if (!document.getElementById('stp-draft-overlay')) return;
            document.getElementById('stp-draft-overlay').classList.add('stp-placed');
            this.renderDraftChestRelics(center);
            this.mountDraftControls(center, isCurrentPlayerActive);
        }, 1700));
    }

    syncDraftOverlay(center, isCurrentPlayerActive) {
        const n = document.getElementById('stp-draft-remaining-n');
        if (n) n.textContent = String(center);
        this.renderDraftChestRelics(center);
        this.mountDraftControls(center, isCurrentPlayerActive);
    }

    closeDraftOverlay() {
        document.body.classList.remove('stp-draft-bg');
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
        }
    }

    notif_passCountDecided(args) { /* лог в журнале */ }

    notif_cardsPassed(args) { /* лог в журнале; карты придут через newHand */ }

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
    }

    notif_huntScored(args) {
        this.adjustAllHp(args.losses);
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
    }

    notif_sacrifice(args) {
        const saint = parseInt(args.player_id, 10);
        const deltas = {};
        for (const player of Object.values(this.gamedatas.players)) {
            const pid = parseInt(player.id, 10);
            if (pid !== saint) deltas[pid] = 3;
        }
        this.adjustAllHp(deltas);
    }
}

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

const SUITS = { 1: '♣', 2: '✚', 3: '♬', 4: '🐍' };
const SUIT_NAMES = { 1: _('Clover'), 2: _('Cross'), 3: _('Harp'), 4: _('Snake') };
const SUIT_CLOVER = 1, SUIT_CROSS = 2, SUIT_HARP = 3, SUIT_SNAKE = 4;

function cardBites(card) {
    if (card.suit === SUIT_SNAKE) return 1;
    if (card.value === 7 && (card.suit === SUIT_CROSS || card.suit === SUIT_HARP)) return 3;
    return 0;
}

function isPatrick(card) {
    return card.suit === SUIT_CLOVER && card.value === 7;
}

/**
 * Раунды 2+: единственный игрок с минимумом HP выбирает 0/1/2.
 */
class DecidePassCount {
    constructor(game, bga) { this.game = game; this.bga = bga; }

    onEnteringState(args, isCurrentPlayerActive) {
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
        this.onPlayerActivationChange(args, isCurrentPlayerActive);
    }

    onPlayerActivationChange(args, isCurrentPlayerActive) {
        const count = parseInt(args.count, 10);
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
        this.game.clearHandSelection();
    }
}

/**
 * Разбор реликвий: взять N или пас.
 */
class DraftRelics {
    constructor(game, bga) { this.game = game; this.bga = bga; }

    onEnteringState(args, isCurrentPlayerActive) {
        const center = parseInt(args.center, 10);
        if (isCurrentPlayerActive) {
            this.bga.statusBar.setTitle(_('${you} must take relics or pass'));
            const input = document.createElement('input');
            input.type = 'number';
            input.id = 'stp-relic-count';
            input.min = '1';
            input.max = String(center);
            input.value = '1';
            input.className = 'stp-relic-input';
            const takeBtn = this.bga.statusBar.addActionButton(_('Take'), () => {
                const n = parseInt(input.value, 10);
                if (n >= 1 && n <= center) {
                    this.bga.actions.performAction('actTakeRelics', { count: n });
                }
            }, { id: 'stp-take-relics' });
            takeBtn.insertAdjacentElement('beforebegin', input);
            this.bga.statusBar.addActionButton(_('Pass'), () =>
                this.bga.actions.performAction('actPassRelics'), { color: 'secondary' });
        } else {
            this.bga.statusBar.setTitle(_('${actplayer} is taking relics or passing'));
        }
    }
}

/**
 * Охота на змей: выложить карту в взятку (обязательный выход в масть).
 */
class HuntPlay {
    constructor(game, bga) { this.game = game; this.bga = bga; }

    onEnteringState(args, isCurrentPlayerActive) {
        this.game.clearHandSelection();
        if (isCurrentPlayerActive) {
            const leadSuit = args.leadSuit === null || args.leadSuit === undefined ? null : parseInt(args.leadSuit, 10);
            const legal = this.game.legalHandCards(leadSuit);
            this.bga.statusBar.setTitle(leadSuit === null
                ? _('${you} must lead a trick — play any card')
                : _('${you} must follow the lead suit (${suit})').replace('${suit}', SUIT_NAMES[leadSuit]));
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
            getId: (card) => card.id,
            setupFrontDiv: (card, div) => this.setupCardFront(card, div),
            setupBackDiv: (card, div) => { div.innerHTML = '<span class="stp-card-back-logo">☘</span>'; },
            isCardVisible: (card) => true,
        });

        this.bga.states.register('DecidePassCount', new DecidePassCount(this, bga));
        this.bga.states.register('PassCards', new PassCards(this, bga));
        this.bga.states.register('DraftRelics', new DraftRelics(this, bga));
        this.bga.states.register('HuntPlay', new HuntPlay(this, bga));

        this.myHand = [];       // мои карты (объекты card)
        this.currentTrick = []; // карты текущей взятки
        this.snakeCards = {};   // pid => карты в открытой зоне
        this.selectableMode = null; // null | 'select' | 'play'
        this.maxSelected = 0;
    }

    setup(gamedatas) {
        this.gamedatas = gamedatas;
        this.myHand = gamedatas.hand.map(c => this.normalizeCard(c));
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
                    <div id="stp-relics" class="stp-relics"></div>
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

        this.renderCenterRelics(parseInt(gamedatas.relicsCenter, 10));

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
        div.dataset.suit = suit;
        div.dataset.value = value;
        const bites = cardBites({ suit, value });
        div.innerHTML = `
            <span class="stp-card-suit">${SUITS[suit]}</span>
            <span class="stp-card-value">${value}</span>
            ${bites > 0 ? `<span class="stp-card-bites">${'🦷'.repeat(bites)}</span>` : ''}
            ${isPatrick({ suit, value }) ? `<span class="stp-card-patrick">★</span>` : ''}
        `;
        div.title = `${SUIT_NAMES[suit]} ${value}${bites > 0 ? ` — ${bites} ${_('bite(s)')}` : ''}`;
    }

    legalHandCards(leadSuit) {
        if (leadSuit === null) return [...this.myHand];
        const follow = this.myHand.filter(c => c.suit === leadSuit);
        return follow.length > 0 ? follow : [...this.myHand];
    }

    setHandSelectable(cards, maxSelected, singleClickPlay = false) {
        this.selectableMode = singleClickPlay ? 'play' : 'select';
        this.maxSelected = maxSelected;
        this.handStock.setSelectableCards(cards);
    }

    clearHandSelection() {
        this.selectableMode = null;
        this.handStock.setSelectableCards([]);
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

    renderCenterRelics(count) {
        const el = document.getElementById('stp-relics');
        el.innerHTML = '';
        for (let i = 0; i < count; i++) {
            el.insertAdjacentHTML('beforeend', '<div class="stp-relic-token"></div>');
        }
    }

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
    // Уведомления
    // -------------------------------------------------------------------------

    async notif_newHand(args) {
        const hand = args.hand.map(c => this.normalizeCard(c));
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
        for (const player of Object.values(this.gamedatas.players)) {
            const pid = parseInt(player.id, 10);
            const snakes = this.snakeCards[pid] ?? [];
            if (snakes.length > 0) {
                this.snakeStocks[pid].removeCards([...snakes]);
                this.snakeCards[pid] = [];
            }
            this.updatePlayerRelics(pid, 0);
        }
        this.renderCenterRelics(15);
    }

    notif_passCountDecided(args) { /* лог в журнале */ }

    notif_cardsPassed(args) { /* лог в журнале; карты придут через newHand */ }

    notif_relicsTaken(args) {
        this.renderCenterRelics(parseInt(args.center, 10));
        this.updatePlayerRelics(parseInt(args.player_id, 10), parseInt(args.player_relics, 10));
    }

    notif_relicsPassed(args) { /* лог в журнале */ }

    notif_curse(args) {
        for (const pid of Object.keys(args.losses)) {
            this.updatePlayerRelics(parseInt(pid, 10), 0);
        }
        this.renderCenterRelics(15);
    }

    notif_specialHunt(args) {
        this.renderCenterRelics(0);
    }

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

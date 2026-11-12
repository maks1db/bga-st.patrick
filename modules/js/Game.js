/**
 * Загрузка ESM-библиотек BGA (глобальный importEsmLib из фреймворка).
 * Библиотеки не типизированы (importEsmLib возвращает any) — стоки и
 * менеджеры используются через них напрямую.
 *
 * Top-level await — как и в прежнем modules/js/Game.js: фреймворк грузит
 * этот модуль как ES-модуль и ждёт резолва.
 */
const BgaAnimations = await importEsmLib('bga-animations', '1.x');
const BgaCards = await importEsmLib('bga-cards', '1.x');

/**
 * Доменная сущность «карта»: нормализация с серверных данных, сортировка,
 * укусы змей. Чистые функции — без зависимостей от UI.
 */
const SUIT_CLOVER = 1;
const SUIT_CROSS = 2;
const SUIT_HARP = 3;
const SUIT_SNAKE = 4;
const SUIT_KEYS = {
    [SUIT_CLOVER]: 'Clover',
    [SUIT_CROSS]: 'Cross',
    [SUIT_HARP]: 'Harp',
    [SUIT_SNAKE]: 'Snake',
};
/** Укусы змей за карту: змеиная масть — 1; 7 креста/арфы — 3; иначе 0. */
function cardBites(card) {
    const suit = card.suit;
    const value = card.value;
    if (suit === SUIT_SNAKE)
        return 1;
    if (value === 7 && (suit === SUIT_CROSS || suit === SUIT_HARP))
        return 3;
    return 0;
}
/** Сортировка руки: масть, затем номинал. */
function sortHand(cards) {
    return [...cards].sort((a, b) => a.suit - b.suit || a.value - b.value);
}

/**
 * Карта: размеры, спрайт, отрисовка лицевой стороны.
 *
 * Размер карт: на узких экранах — уменьшенный. ДУБЛИРУЕТСЯ media query в
 * scss/entities/_card.scss ($bp-mobile)! Менять в обоих местах.
 */
const CARD_W = window.innerWidth < 640 ? 72 : 102;
const CARD_H = window.innerWidth < 640 ? 99 : 141;
// ряд масти в img/main-sprite.png (ячейка 136×188, порядок колонок — значение 1–9)
const SUIT_SPRITE_ROW = { 1: 0, 3: 1, 4: 2, 2: 3 };
function suitName(suit) {
    return _(SUIT_KEYS[suit]);
}
/** Лицевая сторона: позиция ячейки спрайта — через CSS-переменные
 *  (--bp-x/--bp-y, см. .stp-card-front), плюс подсказка с укусами. */
function setupCardFront(card, div) {
    const row = SUIT_SPRITE_ROW[card.suit];
    div.style.setProperty('--bp-x', `${(card.value - 1) * CARD_W}px`);
    div.style.setProperty('--bp-y', `${row * CARD_H}px`);
    const bites = cardBites(card);
    div.title = `${suitName(card.suit)} ${card.value}${bites > 0 ? ` — ${bites} ${_('bite(s)')}` : ''}`;
}

/** Public API среза «карта» (entities layer). */
/** Нормализация серверной карты в клиентское представление. */
function normalizeCard(card) {
    return {
        id: parseInt(String(card.id), 10),
        suit: parseInt(String(card.suit), 10),
        value: parseInt(String(card.value), 10),
        location: card.location,
        locationArg: card.locationArg === null || card.locationArg === undefined ? null : parseInt(String(card.locationArg), 10),
    };
}

class DraftOverlayWidget {
    constructor(game) {
        this.tokens = [];
        this.timers = [];
        this.game = game;
    }
    open(args, isCurrentPlayerActive) {
        document.body.classList.add('stp-draft-bg', 'stp-draft-open');
        const center = parseInt(String(args.center), 10);
        if (document.getElementById('stp-draft-overlay')) {
            // повторный вход (следующий драфтер) — интро не повторяем
            this.sync(center, isCurrentPlayerActive);
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
        this.syncBottom();
        this.tokens = [];
        this.timers = [];
        // тёмный фон → заголовок по центру → 1 с пауза → заголовок наверх, ларец
        requestAnimationFrame(() => document.getElementById('stp-draft-overlay').classList.add('stp-open'));
        this.timers.push(setTimeout(() => {
            if (!document.getElementById('stp-draft-overlay'))
                return;
            document.getElementById('stp-draft-overlay').classList.add('stp-placed');
            this.renderChestRelics(center);
            this.mountControls(center, isCurrentPlayerActive);
            this.syncBottom(); // рука могла догрузиться к моменту показа ларца
            // веер дозаканчивает раскладку/перелёт карт позже — досводим отступ
            this.timers.push(setTimeout(() => {
                if (document.getElementById('stp-draft-overlay'))
                    this.syncBottom();
            }, 1800));
        }, 1700));
    }
    sync(center, isCurrentPlayerActive) {
        const n = document.getElementById('stp-draft-remaining-n');
        if (n)
            n.textContent = String(center);
        this.renderChestRelics(center);
        this.mountControls(center, isCurrentPlayerActive);
        this.syncBottom();
    }
    /** Обновление из уведомления relicsTaken: остаток в заголовке + жетоны. */
    syncNotif(center) {
        const n = document.getElementById('stp-draft-remaining-n');
        if (n)
            n.textContent = String(center);
        this.renderChestRelics(center);
    }
    /** Низ оверлея — по верхней кромке руки (z 960 поверх оверлея):
     * ларец и управление не уходят под карты. Веерные карты визуально вылезают
     * за верх контейнера руки (повороты веера) — свес меряем по реальным
     * rect'ам карт и прибавляем к низу оверлея (делим на page-zoom, т.к.
     * offsetHeight в layout-пикселях, а rect — в визуальных).
     * Заодно вписываем ларец в остаток высоты оверлея (--stp-draft-chest-size),
     * иначе при поднятом низе ларец обрезался бы оверлеем (overflow: auto). */
    syncBottom() {
        const overlay = document.getElementById('stp-draft-overlay');
        const hand = document.getElementById('stp-hand');
        if (!overlay || !hand)
            return;
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
            if (avail > 0)
                overlay.style.setProperty('--stp-draft-chest-size', Math.floor(avail) + 'px');
        }
    }
    close() {
        document.body.classList.remove('stp-draft-bg', 'stp-draft-open');
        this.timers.forEach(clearTimeout);
        this.timers = [];
        ['stp-draft-stepper', 'stp-take-relics', 'stp-pass-relics'].forEach(id => document.getElementById(id)?.remove());
        const overlay = document.getElementById('stp-draft-overlay');
        if (!overlay)
            return;
        overlay.classList.remove('stp-open');
        setTimeout(() => overlay.remove(), 400);
        this.tokens = [];
    }
    /** Жетоны реликвий на зелёной подкладке ларца (случайный разброс). */
    renderChestRelics(count) {
        const box = document.getElementById('stp-draft-chest-relics');
        if (!box)
            return;
        while (this.tokens.length < count) {
            const token = document.createElement('div');
            token.className = 'stp-elt stp-elt-relic stp-draft-relic';
            token.style.left = `${32 + Math.random() * 39}%`;
            token.style.top = `${54 + Math.random() * 22}%`;
            token.style.setProperty('--rot', `${Math.round(Math.random() * 40 - 20)}deg`);
            box.appendChild(token);
            this.tokens.push(token);
        }
        while (this.tokens.length > count) {
            const token = this.tokens.pop();
            if (!token)
                break;
            token.classList.add('stp-out');
            setTimeout(() => token.remove(), 400);
        }
    }
    /** Управление драфтера (только активный): степпер −/+ — над ларцом
     *  (слот в оверлее), кнопки «Take»/«Pass» — в верхней панели (status bar)
     *  через addActionButton (Take — primary, Pass — secondary). Слот держит
     *  резерв высоты под ларец (см. _draft-overlay.scss). */
    mountControls(center, isCurrentPlayerActive) {
        ['stp-draft-stepper', 'stp-take-relics', 'stp-pass-relics'].forEach(id => document.getElementById(id)?.remove());
        if (!isCurrentPlayerActive)
            return;
        const slot = document.getElementById('stp-draft-controls-slot');
        if (!slot)
            return;
        slot.insertAdjacentHTML('beforeend', `
            <div class="stp-take-stepper" id="stp-draft-stepper">
                <button class="stp-step-btn" id="stp-step-down" type="button">−</button>
                <span class="stp-step-value" id="stp-step-value">1</span>
                <button class="stp-step-btn" id="stp-step-up" type="button">+</button>
            </div>
        `);
        const valueEl = document.getElementById('stp-step-value');
        const sync = () => {
            const v = parseInt(valueEl.textContent ?? '1', 10);
            document.getElementById('stp-step-down').disabled = v <= 1;
            document.getElementById('stp-step-up').disabled = v >= center;
        };
        const step = (delta) => {
            valueEl.textContent = String(Math.min(Math.max(1, parseInt(valueEl.textContent ?? '1', 10) + delta), center));
            sync();
        };
        document.getElementById('stp-step-down').addEventListener('click', () => step(-1));
        document.getElementById('stp-step-up').addEventListener('click', () => step(1));
        this.game.bga.statusBar.addActionButton(_('Take'), () => this.game.bga.actions.performAction('actTakeRelics', { count: parseInt(valueEl.textContent ?? '1', 10) }), { id: 'stp-take-relics' });
        this.game.bga.statusBar.addActionButton(_('Pass'), () => this.game.bga.actions.performAction('actPassRelics'), { id: 'stp-pass-relics', color: 'secondary' });
        sync();
        // Резерв высоты слота: степпер монтируется/исчезает по ходу драфта —
        // пинним фактическую высоту, ларец не ресайзится (_draft-overlay.scss)
        const overlay = document.getElementById('stp-draft-overlay');
        if (overlay)
            overlay.style.setProperty('--stp-draft-controls-h', slot.offsetHeight + 'px');
    }
}

/** DOM-элемент карты в взятке: сначала через менеджер стока, fallback — по id. */
function trickCardEl(game, card) {
    try {
        const el = game.trickStock.getCardElement?.(card);
        if (el)
            return el;
    }
    catch (e) { /* DOM-fallback ниже */ }
    return document.getElementById(`card-${card.id}`)
        ?? document.getElementById(`stp-card-${card.id}`);
}
/** Тег-имя игрока цветом его фишки над картой взятки. */
function labelTrickCard(game, card, playerId) {
    const el = trickCardEl(game, card);
    if (!el)
        return;
    el.querySelector('.stp-trick-by')?.remove();
    if (!playerId)
        return;
    const player = game.gamedatas.players[playerId];
    if (!player)
        return;
    const tag = document.createElement('div');
    tag.className = 'stp-trick-by';
    tag.textContent = player.name;
    tag.style.setProperty('--stp-by-color', `#${player.color}`);
    el.appendChild(tag);
}
function clearTrickLabels() {
    document.querySelectorAll('.stp-trick-by').forEach(el => el.remove());
}

/**
 * Виджет: открытые змеиные карты в зонах игроков (ряды по 6, сортировка,
 * счётчик укусов).
 */
/** Суммарные укусы змей игрока (иконка змеи + число, скрыто при 0). */
function updateBites(game, pid) {
    const total = (game.snakeCards[pid] ?? []).reduce((sum, c) => sum + cardBites(c), 0);
    const box = document.getElementById(`stp-bites-${pid}`);
    const n = document.getElementById(`stp-bites-n-${pid}`);
    if (!box || !n)
        return;
    n.textContent = String(total);
    box.style.display = total > 0 ? '' : 'none';
}
/** Зона змей: сортировка (масть, номинал), ряды по 6 карт; новые ряды
 *  перекрывают предыдущие (CSS: margin-top отрицательный), внутри ряда
 *  ранние карты лежат поверх поздних (видна левая полоса с номиналом). */
function layoutSnakeZone(game, pid) {
    const zone = (game.snakeCards[pid] ?? []).slice().sort((a, b) => a.suit - b.suit || a.value - b.value);
    const container = document.getElementById(`stp-snakes-${pid}`);
    if (!container) {
        updateBites(game, pid);
        return;
    }
    const alive = new Set(zone.map(c => `stp-card-${c.id}`));
    for (const el of container.querySelectorAll('.bga-cards_card')) {
        if (!alive.has(el.id))
            el.remove(); // карта уже ушла из зоны
    }
    const els = new Map();
    for (const el of container.querySelectorAll('.bga-cards_card'))
        els.set(el.id, el);
    container.querySelectorAll(':scope > .stp-snake-row').forEach(row => row.remove());
    const ROW = 6;
    for (let i = 0; i < zone.length; i += ROW) {
        const row = document.createElement('div');
        row.className = 'stp-snake-row';
        row.style.zIndex = String(Math.floor(i / ROW) + 1); // новые ряды поверх старых
        for (const c of zone.slice(i, i + ROW)) {
            const el = els.get(`stp-card-${c.id}`);
            if (el)
                row.appendChild(el);
        }
        container.appendChild(row);
    }
    zone.forEach((c, i) => {
        document.getElementById(`stp-card-${c.id}`)?.style.setProperty('z-index', String(zone.length - i));
    });
    updateBites(game, pid);
}

function showRoundSummary(game, relics, losses) {
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
            <td class="${hp <= 0 ? 'stp-rs-dead' : ''}">${hp}${dmg > 0 ? ` <span class="stp-rs-dmg">(↓${dmg})</span>` : ''}</td>
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
    document.getElementById('stp-rs-close').addEventListener('click', close);
    document.querySelector('#stp-round-summary .stp-rs-backdrop').addEventListener('click', close);
}

/**
 * Feature: одновременная передача карт соседу слева.
 * Игроки остаются framework-active до раскрытия (сервер следит за глобалом
 * pass_done) — поэтому отмена возможна через обычное действие, а хук
 * активации не срабатывает при подтверждении: клиент сам переключает UI
 * в режим ожидания.
 * Владелец состояния: подтверждённые карты (cards) и флаг ack живут здесь.
 */
class PassCardsFeature {
    constructor(game) {
        /** мои подтверждённые карты в зоне передачи (ждут раскрытия) */
        this.cards = [];
        /** пас подтверждён сервером (кнопка Cancel разрешена) */
        this.ack = false;
        this.game = game;
    }
    /** Инициализация из gamedatas (после reload: пас уже на сервере). */
    init(passed) {
        this.cards = passed;
    }
    async confirmSelection(count) {
        const selection = this.game.handStock.getSelection();
        if (selection.length !== count)
            return;
        const cards = selection.map((c) => normalizeCard(c));
        document.getElementById('stp-pass-confirm')?.remove();
        this.cards = [...cards];
        this.game.myHand = this.game.myHand.filter(c => !cards.some((p) => p.id === c.id));
        this.game.handStock.unselectAll();
        for (const c of cards) {
            document.getElementById(`stp-card-${c.id}`)?.classList.remove('stp-selected');
        }
        this.syncZone(); // зона видима ДО анимации: иначе цель display:none и карта летит в (0,0)
        await this.game.passStock.addCards(cards, { fromStock: this.game.handStock });
        this.showWaiting(this.game.leftNeighborId(this.game.bga.players.getCurrentPlayerId()));
        const p = this.game.bga.actions.performAction('actPassCards', { cardIds: cards.map((c) => c.id) });
        if (!p) { // вызов заблокирован фреймворком — откатываем перенос
            await this.restore();
            this.showSelection(count, this.game.leftNeighborId(this.game.bga.players.getCurrentPlayerId()));
            return;
        }
        try {
            await p;
            this.ack = true; // сервер принял пас — теперь отмена легальна
            this.syncZone();
        }
        catch (e) {
            await this.restore();
            if (this.game.bga.states.getCurrentMainStateName() === 'PassCards') {
                this.showSelection(count, this.game.leftNeighborId(this.game.bga.players.getCurrentPlayerId()));
            }
        }
    }
    /** Режим выбора карт для передачи (активный игрок). */
    showSelection(count, toId) {
        this.game.bga.statusBar.setTitle(_('${you} must select ${count} card(s) to pass to your left neighbor').replace('${count}', String(count)));
        this.game.setHandSelectable(this.game.myHand, count);
        this.showInfo(toId, count);
        document.getElementById('stp-pass-confirm')?.remove();
        this.game.bga.statusBar.addActionButton(_('Pass selected cards'), () => this.confirmSelection(count), { id: 'stp-pass-confirm', disabled: true });
    }
    /** Режим ожидания раскрытия: карты в зоне передачи, под ними — отмена. */
    showWaiting(toId) {
        this.game.bga.statusBar.setTitle(_('You passed ${count} card(s) — waiting for the other players').replace('${count}', String(this.cards.length)));
        this.showInfo(toId, null);
        this.syncZone();
    }
    /** Зона передачи: карты лежат в основной игровой зоне (#stp-trick).
     * Кнопка Cancel — в верхней панели (status bar), только после
     * подтверждения паса сервером: иначе отмена улетает раньше actPassCards
     * и сервер честно отвечает ошибкой, а клик во время анимации перелёта
     * роняет removeCards против addCards. */
    syncZone() {
        const box = document.getElementById('stp-pass-cards');
        if (!box)
            return;
        const has = this.cards.length > 0;
        box.classList.toggle('stp-visible', has);
        document.getElementById('stp-pass-cancel')?.remove();
        if (has && this.ack) {
            this.game.bga.statusBar.addActionButton(_('Cancel'), () => this.cancel(), { id: 'stp-pass-cancel', color: 'secondary' });
        }
    }
    cancel() {
        document.getElementById('stp-pass-cancel')?.remove(); // анти-двойной клик
        const p = this.game.bga.actions.performAction('actCancelPassCards');
        if (!p) {
            this.syncZone();
            return;
        } // вызов заблокирован фреймворком — кнопку вернём
        p.catch(() => this.syncZone());
    }
    /** Отмена подтверждения: карты возвращаются из зоны передачи в руку (идемпотентно). */
    async restore() {
        const cards = this.cards;
        this.ack = false;
        if (!cards.length || !this.game.passStock) {
            this.syncZone();
            return;
        }
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
    async discard() {
        const cards = this.cards;
        this.cards = [];
        this.ack = false;
        this.syncZone();
        if (!cards.length || !this.game.passStock)
            return;
        await this.game.passStock.removeCards(cards);
    }
    /** Баннер в центре поля: кому уйдут переданные карты. */
    showInfo(toId, count) {
        this.removeInfo();
        if (toId === null)
            return;
        const to = this.game.gamedatas.players[toId];
        const box = document.getElementById('stp-center');
        if (!to || !box)
            return;
        const name = `<b style="color:#${to.color}">${to.name}</b>`;
        const text = count === null
            ? _('Cards will be passed to your left neighbor: ${name}').replace('${name}', name)
            : _('You pass ${count} card(s) to ${name}').replace('${count}', String(count)).replace('${name}', name);
        box.insertAdjacentHTML('afterbegin', `<div id="stp-pass-info" class="stp-pass-info">${text}</div>`);
    }
    removeInfo() {
        document.getElementById('stp-pass-info')?.remove();
    }
}

class DecidePassCount {
    constructor(game, bga) {
        this.game = game;
        this.bga = bga;
    }
    onEnteringState(args, isCurrentPlayerActive) {
        this.game.draftOverlay.close();
        this.bga.statusBar.setTitle(isCurrentPlayerActive
            ? _('${you} decide how many cards everyone passes (0, 1 or 2)')
            : _('${actplayer} decides how many cards everyone passes'));
        if (isCurrentPlayerActive) {
            for (const n of [0, 1, 2]) {
                this.bga.statusBar.addActionButton(_('${n} card(s)').replace('${n}', String(n)), () => this.bga.actions.performAction('actSetPassCount', { count: n }));
            }
        }
    }
}

class PassCards {
    constructor(game, bga) {
        this.game = game;
        this.bga = bga;
    }
    onEnteringState(args, isCurrentPlayerActive) {
        this.game.draftOverlay.close();
        this.onPlayerActivationChange(args, isCurrentPlayerActive);
    }
    onPlayerActivationChange(args, isCurrentPlayerActive) {
        // идемпотентно: хуки multiactive могут дублироваться
        document.getElementById('stp-pass-confirm')?.remove();
        this.game.clearHandSelection();
        const count = parseInt(args.count, 10);
        const toId = this.game.leftNeighborId(this.bga.players.getCurrentPlayerId());
        const feature = this.game.passCardsFeature;
        if (!isCurrentPlayerActive) {
            this.bga.statusBar.setTitle(_('Other players are choosing cards to pass'));
            feature.showInfo(toId, null);
        }
        else if (feature.cards.length > 0) {
            feature.ack = true; // карты из gamedatas.passed — пас уже на сервере
            feature.showWaiting(toId); // уже подтвердил (reload) — ждём раскрытия
        }
        else {
            feature.restore(); // отмена: карты возвращаются из зоны передачи в руку
            feature.showSelection(count, toId);
        }
    }
    onLeavingState(args, isCurrentPlayerActive) {
        document.getElementById('stp-pass-confirm')?.remove();
        this.game.passCardsFeature.removeInfo();
        this.game.clearHandSelection();
        this.game.passCardsFeature.discard(); // карты ушли получателям — зона больше не нужна
    }
}

class DraftRelics {
    constructor(game, bga) {
        this.game = game;
        this.bga = bga;
    }
    onEnteringState(args, isCurrentPlayerActive) {
        this.bga.statusBar.setTitle(isCurrentPlayerActive
            ? _('${you} must take relics or pass')
            : _('${actplayer} is taking relics or passing'));
        this.game.draftOverlay.open(args, isCurrentPlayerActive);
    }
    onLeavingState() { }
}

/**
 * Состояние HuntPlay: охота на змей — выложить карту в взятку
 * (обязательный выход в масть).
 */
class HuntPlay {
    constructor(game, bga) {
        this.game = game;
        this.bga = bga;
    }
    onEnteringState(args, isCurrentPlayerActive) {
        this.game.draftOverlay.close();
        this.game.clearHandSelection();
        if (isCurrentPlayerActive) {
            const leadSuit = args.leadSuit === null || args.leadSuit === undefined ? null : parseInt(String(args.leadSuit), 10);
            const legal = this.game.legalHandCards(leadSuit);
            this.bga.statusBar.setTitle(leadSuit === null
                ? _('${you} must lead a trick — play any card')
                : _('${you} must follow the lead suit (${suit})').replace('${suit}', suitName(leadSuit)));
            this.game.setHandSelectable(legal, 1, true);
        }
        else {
            this.bga.statusBar.setTitle(_('${actplayer} must play a card'));
        }
    }
    onLeavingState(args, isCurrentPlayerActive) {
        this.game.clearHandSelection();
    }
}

class GameEnd {
    constructor(game, bga) {
        this.game = game;
        this.bga = bga;
    }
    onEnteringState() { this.game.draftOverlay.close(); }
    onLeavingState() { }
}

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
class Game {
    constructor(bga) {
        this.snakeStocks = {};
        this.myHand = []; // мои карты
        this.currentTrick = []; // карты текущей взятки
        this.snakeCards = {}; // pid => карты в открытой зоне
        this.selectableMode = null; // null | 'select' | 'play'
        this.maxSelected = 0;
        this.handGridMode = false;
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
    }
    setup(gamedatas) {
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
            document.getElementById('stp-players').insertAdjacentHTML('beforeend', `
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
        this.handStock.setSort((a, b) => parseInt(a.suit, 10) - parseInt(b.suit, 10) || parseInt(a.value, 10) - parseInt(b.value, 10));
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
        }
        else if (window.innerWidth < 640) {
            this.handStock.minOverlap = 28; // полоса карты максимально широкая в пределах экрана
        }
        this.handStock.onSelectionChange = (selection) => this.onHandSelectionChange(selection);
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
                this.draftOverlay.syncBottom();
            }, 300);
        });
    }
    // -------------------------------------------------------------------------
    // Карты
    // -------------------------------------------------------------------------
    normalizeCard(card) {
        return normalizeCard(card);
    }
    // Менеджер карт размера CARD_W×CARD_H (один на всё — см. константы).
    setupCardFront(card, div) {
        setupCardFront(card, div);
    }
    legalHandCards(leadSuit) {
        if (leadSuit === null)
            return [...this.myHand];
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
        }
        else if (this.selectableMode === 'select') {
            const btn = document.getElementById('stp-pass-confirm');
            if (btn)
                btn.disabled = selection.length !== this.maxSelected;
        }
    }
    // -------------------------------------------------------------------------
    // Реликвии / HP
    // -------------------------------------------------------------------------
    updatePlayerRelics(pid, count) {
        const el = document.getElementById(`stp-relics-${pid}`);
        if (el)
            el.textContent = String(count);
    }
    updatePlayerHp(pid, score) {
        const el = document.getElementById(`stp-hp-${pid}`);
        if (el)
            el.textContent = String(score);
    }
    adjustAllHp(deltas) {
        for (const [pid, delta] of Object.entries(deltas)) {
            if (parseInt(String(delta), 10) === 0)
                continue;
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
    leftNeighborId(pid) {
        const nos = Object.values(this.gamedatas.players)
            .map(p => ({ id: parseInt(p.id, 10), no: this.bga.players.getPlayerNoById(parseInt(p.id, 10)) }))
            .filter(p => p.no !== null)
            .sort((a, b) => a.no - b.no);
        if (!nos.length)
            return null;
        const idx = nos.findIndex(p => p.id === pid);
        if (idx < 0)
            return null;
        return nos[(idx + 1) % nos.length].id;
    }
    // -------------------------------------------------------------------------
    // Уведомления (имена — точки входа фреймворка, не переименовывать!)
    // -------------------------------------------------------------------------
    async notif_newHand(args) {
        await this.passCardsFeature.discard(); // переданные карты ушли получателю
        const hand = sortHand(args.hand.map((c) => this.normalizeCard(c)));
        const oldIds = this.myHand.map(c => c.id).sort().join(',');
        const newIds = hand.map(c => c.id).sort().join(',');
        if (oldIds === newIds)
            return; // та же рука (первая раздача отражена в setup)
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
    notif_passCountDecided(args) { }
    notif_cardsPassed(args) { }
    async notif_passCancelled(args) {
        if (parseInt(args.player_id, 10) !== parseInt(this.bga.players.getCurrentPlayerId(), 10))
            return;
        await this.passCardsFeature.restore();
        if (this.bga.states.getCurrentMainStateName() === 'PassCards') {
            const count = parseInt((this.bga.states.getCurrentMainStateClass()?.args ?? {}).count, 10);
            this.passCardsFeature.showSelection(count, this.leftNeighborId(this.bga.players.getCurrentPlayerId()));
        }
    }
    notif_relicsTaken(args) {
        this.updatePlayerRelics(parseInt(args.player_id, 10), parseInt(args.player_relics, 10));
        this.draftOverlay.syncNotif(parseInt(args.center, 10));
    }
    notif_relicsPassed(args) { }
    notif_curse(args) {
        for (const pid of Object.keys(args.losses)) {
            this.updatePlayerRelics(parseInt(pid, 10), 0);
        }
    }
    notif_specialHunt(args) { }
    async notif_cardPlayed(args) {
        const card = this.normalizeCard(args.card);
        this.currentTrick.push(card);
        const mine = this.myHand.some(c => c.id === card.id);
        if (mine) {
            this.myHand = this.myHand.filter(c => c.id !== card.id);
            await this.trickStock.addCards([card], { fromStock: this.handStock });
        }
        else {
            await this.trickStock.addCards([card]);
        }
        labelTrickCard(this, card, parseInt(args.player_id, 10));
    }
    async notif_trickWon(args) {
        // Пауза после полного розыгрыша взятки — игроки видят, что было
        // разыграно; выигравшая карта в это время пульсирует (очередь
        // уведомлений ждёт промис).
        if (this.bga.gameui.bgaAnimationsActive()) {
            const winnerCardId = args.winnerCard ? parseInt(args.winnerCard.id, 10) : null;
            const winnerEl = winnerCardId !== null ? document.getElementById(`stp-card-${winnerCardId}`) : null;
            winnerEl?.classList.add('stp-trick-win-pulse');
            await new Promise(r => setTimeout(r, 1000));
            winnerEl?.classList.remove('stp-trick-win-pulse');
        }
        const winnerId = parseInt(args.player_id, 10);
        const snakeCards = (args.snakeCards ?? []).map((c) => this.normalizeCard(c));
        const flights = [];
        if (snakeCards.length > 0) {
            this.snakeCards[winnerId] = [...(this.snakeCards[winnerId] ?? []), ...snakeCards];
            flights.push(this.snakeStocks[winnerId].addCards(snakeCards, { fromStock: this.trickStock }));
        }
        // Безвредные карты тоже летят к победителю (в его зону) с затуханием —
        // видно, какому игроку уходит взятка, даже если змей в ней не было
        const discarded = this.currentTrick.filter(c => !snakeCards.some((s) => s.id === c.id));
        if (discarded.length > 0) {
            const zone = document.getElementById(`stp-zone-${winnerId}`);
            flights.push(this.trickStock.removeCards(discarded, { slideTo: zone ?? undefined, fadeOut: true }));
        }
        await Promise.all(flights);
        this.currentTrick = [];
        clearTrickLabels();
        layoutSnakeZone(this, winnerId);
    }
    async notif_huntEnded(args) {
        // Досрочный конец охоты [H16]: сервер сбросил оставшиеся карты —
        // убираем свою руку (чужие руки на столе не отображаются).
        if (this.myHand.length > 0) {
            const remaining = [...this.myHand];
            this.myHand = [];
            await this.handStock.removeCards(remaining);
        }
    }
    notif_huntScored(args) {
        this.adjustAllHp(args.losses);
        showRoundSummary(this, args.relics, args.losses);
    }
    notif_specialScored(args) {
        for (const [pid, gain] of Object.entries(args.gains)) {
            if (parseInt(String(gain), 10) === 0)
                continue;
            const el = document.getElementById(`stp-hp-${pid}`);
            if (el) {
                const current = parseInt((el.textContent ?? '').replace('❤ ', ''), 10);
                this.updatePlayerHp(parseInt(pid, 10), current + parseInt(String(gain), 10));
            }
        }
        // особая охота не наносит урона [H6] — колонка урона вся в нулях
        const zeroLosses = {};
        for (const pid of Object.keys(args.gains))
            zeroLosses[pid] = 0;
        showRoundSummary(this, args.relics, zeroLosses);
    }
    notif_sacrifice(args) {
        const saint = parseInt(args.player_id, 10);
        const deltas = {};
        const losses = {};
        for (const player of Object.values(this.gamedatas.players)) {
            const pid = parseInt(player.id, 10);
            losses[pid] = pid === saint ? 0 : 3; // SACRIFICE_PENALTY [H15]
            if (pid !== saint)
                deltas[pid] = 3;
        }
        this.adjustAllHp(deltas);
        // в уведомлении нет реликвий — берём из счётчиков (клиент их ведёт)
        const relics = {};
        for (const player of Object.values(this.gamedatas.players)) {
            const pid = parseInt(player.id, 10);
            relics[pid] = parseInt(document.getElementById(`stp-relics-${pid}`)?.textContent ?? '0', 10);
        }
        showRoundSummary(this, relics, losses);
    }
}

export { Game };

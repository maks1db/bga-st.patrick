/**
 * Виджет: оверлей разбора реликвий поверх игрового поля.
 * Полноэкранный внутри #stp-board: интро (заголовок по центру) → placed
 * (заголовок наверх, «Remaining», управление, ларец с жетонами).
 * Живёт между входами DraftRelics (следующий драфтер — без повторного
 * интро), закрывается при входе в любую другую фазу.
 * Владелец состояния: токены и таймеры хранятся здесь, а не на Game.
 */
import type { Game } from '../../app/Game';

export interface DraftArgs {
    center: number | string;
    relics: Record<string, number>; // pid => взято реликвий (для областей игроков)
}

export class DraftOverlayWidget {
    private game: Game;
    private tokens: HTMLElement[] = [];
    private timers: ReturnType<typeof setTimeout>[] = [];

    constructor(game: Game) {
        this.game = game;
    }

    open(args: DraftArgs, isCurrentPlayerActive: boolean): void {
        document.body.classList.add('stp-draft-bg', 'stp-draft-open');
        const center = parseInt(String(args.center), 10);
        if (document.getElementById('stp-draft-overlay')) {
            // повторный вход (следующий драфтер) — интро не повторяем
            this.sync(args, isCurrentPlayerActive);
            return;
        }

        const playersRow = Object.values(this.game.gamedatas.players).map(p => {
            const pid = parseInt(p.id, 10);
            const n = parseInt(String(args.relics?.[pid] ?? 0), 10);
            return `<div class="stp-draft-player" id="stp-draft-player-${pid}">
                <div class="stp-draft-player-name" style="color:#${p.color}">${p.name}</div>
                <div class="stp-draft-player-body"><span class="stp-elt stp-elt-relic"></span> <span class="stp-draft-relics-n" id="stp-draft-relics-n-${pid}">${n}</span></div>
            </div>`;
        }).join('');

        document.getElementById('stp-board')!.insertAdjacentHTML('beforeend', `
            <div id="stp-draft-overlay">
                <div class="stp-draft-title"><span class="stp-draft-title-text">${_('Relic Draft')}</span></div>
                <div class="stp-draft-remaining">${_('Remaining:')} <span id="stp-draft-remaining-n">${center}</span></div>
                <div class="stp-draft-controls-slot" id="stp-draft-controls-slot"></div>
                <div class="stp-draft-players">${playersRow}</div>
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
        requestAnimationFrame(() => document.getElementById('stp-draft-overlay')!.classList.add('stp-open'));
        this.timers.push(setTimeout(() => {
            if (!document.getElementById('stp-draft-overlay')) return;
            document.getElementById('stp-draft-overlay')!.classList.add('stp-placed');
            this.renderChestRelics(center);
            this.mountControls(center, isCurrentPlayerActive);
            this.syncBottom(); // рука могла догрузиться к моменту показа ларца
            // веер дозаканчивает раскладку/перелёт карт позже — досводим отступ
            this.timers.push(setTimeout(() => {
                if (document.getElementById('stp-draft-overlay')) this.syncBottom();
            }, 1800));
        }, 1700));
    }

    sync(args: DraftArgs, isCurrentPlayerActive: boolean): void {
        const center = parseInt(String(args.center), 10);
        const n = document.getElementById('stp-draft-remaining-n');
        if (n) n.textContent = String(center);
        for (const pid of Object.keys(args.relics ?? {})) {
            this.setAreaCount(parseInt(pid, 10), parseInt(String(args.relics[pid]), 10));
        }
        this.renderChestRelics(center);
        this.mountControls(center, isCurrentPlayerActive);
        this.syncBottom();
    }

    /** Обновление из уведомления relicsTaken: взятые токены улетают из ларца
     *  в область игрока, его счётчик растёт по анимации. */
    syncNotif(center: number, playerId: number, playerRelics: number): void {
        const n = document.getElementById('stp-draft-remaining-n');
        if (n) n.textContent = String(center);
        const surplus = this.tokens.length - center;
        if (surplus > 0 && playerId > 0 && document.getElementById(`stp-draft-player-${playerId}`)) {
            this.flyTokensTo(surplus, playerId);
        } else {
            this.renderChestRelics(center); // запасной путь: тихое затухание/докидывание
        }
        if (playerId > 0) {
            this.setAreaCount(playerId, playerRelics, true);
        }
    }

    /** Счётчик реликвий игрока в области драфта; animate — набор числа + пульс. */
    private setAreaCount(playerId: number, value: number, animate = false): void {
        const el = document.getElementById(`stp-draft-relics-n-${playerId}`);
        if (!el) return;
        const from = parseInt(el.textContent ?? '0', 10);
        if (from === value) return;
        if (!animate) {
            el.textContent = String(value);
            return;
        }
        const dur = Math.min(450, 150 + Math.abs(value - from) * 90);
        const t0 = performance.now();
        const tick = (t: number) => {
            const k = Math.min(1, (t - t0) / dur);
            el.textContent = String(Math.round(from + (value - from) * k));
            if (k < 1) requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
        el.classList.remove('stp-bump');
        void el.offsetWidth; // перезапуск CSS-анимации
        el.classList.add('stp-bump');
    }

    /** Перелёт токенов из ларца в область игрока, взявшего реликвии. */
    private flyTokensTo(count: number, playerId: number): void {
        const target = document.getElementById(`stp-draft-player-${playerId}`);
        if (!target) {
            this.renderChestRelics(this.tokens.length - count);
            return;
        }
        const tr = target.getBoundingClientRect();
        const tx = tr.left + tr.width / 2;
        const ty = tr.top + tr.height / 2;
        const flying = this.tokens.splice(Math.max(0, this.tokens.length - count), count);
        for (const token of flying) {
            const r = token.getBoundingClientRect();
            const rot = token.style.getPropertyValue('--rot') || '0deg';
            const clone = token.cloneNode(true) as HTMLElement;
            Object.assign(clone.style, {
                position: 'fixed', left: r.left + 'px', top: r.top + 'px',
                width: r.width + 'px', height: r.height + 'px',
                margin: '0', zIndex: '2000', pointerEvents: 'none',
            });
            document.body.appendChild(clone);
            token.remove();
            const dx = tx - (r.left + r.width / 2);
            const dy = ty - (r.top + r.height / 2);
            const base = `translate(-50%, -50%) rotate(${rot})`;
            const anim = clone.animate([
                { transform: `${base} scale(1)`, opacity: 1 },
                { transform: `translate(-50%, -50%) translate(${dx}px, ${dy}px) rotate(${rot}) scale(0.5)`, opacity: 0.8 },
            ], { duration: 650, easing: 'ease-in-out' });
            anim.onfinish = () => clone.remove();
        }
    }

    /** Низ оверлея — по верхней кромке руки (z 960 поверх оверлея):
     * ларец и управление не уходят под карты. Веерные карты визуально вылезают
     * за верх контейнера руки (повороты веера) — свес меряем по реальным
     * rect'ам карт и прибавляем к низу оверлея (делим на page-zoom, т.к.
     * offsetHeight в layout-пикселях, а rect — в визуальных).
     * Заодно вписываем ларец в остаток высоты оверлея (--stp-draft-chest-size),
     * иначе при поднятом низе ларец обрезался бы оверлеем (overflow: auto).
     * Узкий экран (≤994px, рука-сетка): низ НЕ поднимаем — оверлей на всю
     * высоту поля, рука перекрывает его низ; так нет вертикального скролла. */
    syncBottom(): void {
        const overlay = document.getElementById('stp-draft-overlay');
        const hand = document.getElementById('stp-hand');
        if (!overlay || !hand) return;
        if (window.innerWidth <= 994) {
            overlay.style.setProperty('--stp-draft-bottom', '0px');
            return;
        }
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
            const avail = overlay.clientHeight - (wrap as HTMLElement).offsetTop - 12; // padding-bottom оверлея
            if (avail > 0) overlay.style.setProperty('--stp-draft-chest-size', Math.floor(avail) + 'px');
        }
    }

    close(): void {
        document.body.classList.remove('stp-draft-bg', 'stp-draft-open');
        this.timers.forEach(clearTimeout);
        this.timers = [];
        ['stp-draft-stepper', 'stp-take-relics', 'stp-pass-relics'].forEach(id => document.getElementById(id)?.remove());
        const overlay = document.getElementById('stp-draft-overlay');
        if (!overlay) return;
        overlay.classList.remove('stp-open');
        setTimeout(() => overlay.remove(), 400);
        this.tokens = [];
    }

    /** Жетоны реликвий на зелёной подкладке ларца (случайный разброс). */
    private renderChestRelics(count: number): void {
        const box = document.getElementById('stp-draft-chest-relics');
        if (!box) return;
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
            if (!token) break;
            token.classList.add('stp-out');
            setTimeout(() => token.remove(), 400);
        }
    }

    /** Управление драфтера (только активный): степпер −/+ — над ларцом
     *  (слот в оверлее), кнопки «Take»/«Pass» — в верхней панели (status bar)
     *  через addActionButton (Take — primary, Pass — secondary). Слот держит
     *  резерв высоты под ларец (см. _draft-overlay.scss). */
    private mountControls(center: number, isCurrentPlayerActive: boolean): void {
        ['stp-draft-stepper', 'stp-take-relics', 'stp-pass-relics'].forEach(id => document.getElementById(id)?.remove());
        if (!isCurrentPlayerActive) return;
        const slot = document.getElementById('stp-draft-controls-slot');
        if (!slot) return;
        slot.insertAdjacentHTML('beforeend', `
            <div class="stp-take-stepper" id="stp-draft-stepper">
                <button class="stp-step-btn" id="stp-step-down" type="button">−</button>
                <span class="stp-step-value" id="stp-step-value">1</span>
                <button class="stp-step-btn" id="stp-step-up" type="button">+</button>
            </div>
        `);
        const valueEl = document.getElementById('stp-step-value')!;
        const sync = () => {
            const v = parseInt(valueEl.textContent ?? '1', 10);
            (document.getElementById('stp-step-down') as HTMLButtonElement).disabled = v <= 1;
            (document.getElementById('stp-step-up') as HTMLButtonElement).disabled = v >= center;
        };
        const step = (delta: number) => {
            valueEl.textContent = String(Math.min(Math.max(1, parseInt(valueEl.textContent ?? '1', 10) + delta), center));
            sync();
        };
        document.getElementById('stp-step-down')!.addEventListener('click', () => step(-1));
        document.getElementById('stp-step-up')!.addEventListener('click', () => step(1));
        this.game.bga.statusBar.addActionButton(_('Take'), () =>
            this.game.bga.actions.performAction('actTakeRelics', { count: parseInt(valueEl.textContent ?? '1', 10) }),
            { id: 'stp-take-relics' });
        this.game.bga.statusBar.addActionButton(_('Pass'), () =>
            this.game.bga.actions.performAction('actPassRelics'),
            { id: 'stp-pass-relics', color: 'secondary' });
        sync();
        // Резерв высоты слота: степпер монтируется/исчезает по ходу драфта —
        // пинним фактическую высоту, ларец не ресайзится (_draft-overlay.scss)
        const overlay = document.getElementById('stp-draft-overlay');
        if (overlay) overlay.style.setProperty('--stp-draft-controls-h', slot.offsetHeight + 'px');
    }
}

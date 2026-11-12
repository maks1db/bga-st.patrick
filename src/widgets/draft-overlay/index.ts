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
            this.sync(center, isCurrentPlayerActive);
            return;
        }

        document.getElementById('stp-board')!.insertAdjacentHTML('beforeend', `
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

    sync(center: number, isCurrentPlayerActive: boolean): void {
        const n = document.getElementById('stp-draft-remaining-n');
        if (n) n.textContent = String(center);
        this.renderChestRelics(center);
        this.mountControls(center, isCurrentPlayerActive);
        this.syncBottom();
    }

    /** Обновление из уведомления relicsTaken: остаток в заголовке + жетоны. */
    syncNotif(center: number): void {
        const n = document.getElementById('stp-draft-remaining-n');
        if (n) n.textContent = String(center);
        this.renderChestRelics(center);
    }

    /** Низ оверлея — по верхней кромке руки (z 960 поверх оверлея):
     * ларец и управление не уходят под карты. Веерные карты визуально вылезают
     * за верх контейнера руки (повороты веера) — свес меряем по реальным
     * rect'ам карт и прибавляем к низу оверлея (делим на page-zoom, т.к.
     * offsetHeight в layout-пикселях, а rect — в визуальных).
     * Заодно вписываем ларец в остаток высоты оверлея (--stp-draft-chest-size),
     * иначе при поднятом низе ларец обрезался бы оверлеем (overflow: auto). */
    syncBottom(): void {
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
            const avail = overlay.clientHeight - (wrap as HTMLElement).offsetTop - 12; // padding-bottom оверлея
            if (avail > 0) overlay.style.setProperty('--stp-draft-chest-size', Math.floor(avail) + 'px');
        }
    }

    close(): void {
        document.body.classList.remove('stp-draft-bg', 'stp-draft-open');
        this.timers.forEach(clearTimeout);
        this.timers = [];
        ['stp-draft-controls', 'stp-take-relics', 'stp-pass-relics'].forEach(id => document.getElementById(id)?.remove());
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

    /** Управление драфтера: степпер −/+ и «Take»/«Pass» (только активный).
     *  Всё — в верхней панели (status bar, #generalactions): кнопки через
     *  addActionButton (Take — primary, Pass — secondary), степпер — кастомной
     *  вставкой перед ними. Слот в оверлее остаётся пустым (резерв высоты
     *  под ларец, см. _draft-overlay.scss). */
    private mountControls(center: number, isCurrentPlayerActive: boolean): void {
        ['stp-draft-controls', 'stp-take-relics', 'stp-pass-relics'].forEach(id => document.getElementById(id)?.remove());
        if (!isCurrentPlayerActive) return;
        const actions = document.getElementById('generalactions');
        if (!actions) return;
        actions.insertAdjacentHTML('beforeend', `
            <div class="stp-take-stepper" id="stp-draft-controls">
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
    }
}

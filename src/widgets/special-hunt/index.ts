/**
 * Виджет: информационное модальное окно «Special hunt».
 * Показывается всем клиентам по уведомлению specialHunt (начало особой
 * охоты [H5]). Структура и стили — общие с итоговой таблицей раунда
 * (.stp-rs-backdrop / .stp-rs-dialog / .stp-rs-head / .stp-rs-close):
 * размытый бэкдроп поверх стола, клик по бэкдропу или × закрывает окно.
 */
export function showSpecialHuntModal(): void {
    document.getElementById('stp-special-hunt')?.remove();
    document.body.insertAdjacentHTML('beforeend', `
        <div id="stp-special-hunt">
            <div class="stp-rs-backdrop"></div>
            <div class="stp-rs-dialog">
                <div class="stp-rs-head">
                    <span>${_('Special hunt!')}</span>
                    <button class="stp-rs-close" id="stp-sh-close" type="button" title="${_('Close')}">×</button>
                </div>
                <div class="stp-sh-body">
                    <p>${_('All cards have been seen — the special hunt begins!')}</p>
                    <ul>
                        <li>${_('Relics stay with their owners; no cards are passed.')}</li>
                        <li>${_('The holder of St Patrick leads the first trick.')}</li>
                        <li>${_('Scoring: each player with more relics than snake bites gains 1 life back; nobody takes damage.')}</li>
                    </ul>
                </div>
            </div>
        </div>`);
    const close = () => document.getElementById('stp-special-hunt')?.remove();
    document.getElementById('stp-sh-close')!.addEventListener('click', close);
    document.querySelector('#stp-special-hunt .stp-rs-backdrop')!.addEventListener('click', close);
}

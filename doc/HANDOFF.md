# HANDOFF — точка остановки (2026-11-04, поздно вечером)

Файл для продолжения работы. Проект: BGA-адаптация «Охота на змей» (St Patrick,
Matagot 2023, BGG 347146). Техническое имя игры: `stpatrick`. Скилл:
`.claude/skills/board-game-arena/SKILL.md` (фазы: Setup → Implementation → Test Loop).

## Как продолжить сессию

- Эта же сессия Kimi Code: `kimi --continue` в каталоге проекта (или `/sessions` в TUI).
- Новая сессия: начать с чтения этого файла + `doc/ASSUMPTIONS.md` + `doc/AUTHOR_QUESTIONS.md`.
- **Через расширение VS Code** (пользователь работает в нём): открыть VS Code
  в каталоге проекта (workspace обязателен), расширение использует тот же CLI
  и ту же базу сессий `~/.kimi-code/sessions/` — разговор будет доступен
  в истории расширения; при необходимости задать `kimi.executablePath`.
  Скиллы из `.claude/skills/` подхватываются автоматически (это каталог проекта).
  Проверить, что MCP-сервер Chrome DevTools доступен и в расширении
  (при необходимости — отдельная настройка MCP в VS Code).
- Пользователь деплоит вручную через VS Code SFTP (`.vscode/sftp.json`, uploadOnSave);
  удаления файлов на сервере он НЕ передаёт — удалять серверные файлы можно через `curl`:
  `curl -s --key ~/.ssh/id_rsa_bga --user maksskv: -Q 'rm /stpatrick/<путь>' sftp://1.studio.boardgamearena.com:2022/stpatrick/`
  (OpenSSH `sftp`-клиент подвисает на этом сервере — использовать curl).

## Что сделано

1. **Правила** (doc/RULES.md): все 7 вопросов к авторам закрыты ответами
   правообладателя 2026-11-04; допущения [H1]–[H15] в doc/ASSUMPTIONS.md.
2. **Сервер** (фаза 2): 12 состояний, ItemManager для 36 карт и 15 реликвий,
   HP = player_score (старт 20). Коммиты до `3419f72`.
3. **Клиент**: BgaCards-интерфейс, 4 класса состояний, уведомления.
4. **Тестовый цикл** (фаза 3): GAME_ID лобби = **16412**; тестовые юзеры
   maksskv0/1/2 = **2422982/2422983/2422984**; игра на 3 игрока.

## Текущая точка: что НЕ задеплоено на сервер (обязательно сначала!)

Два последних коммита только локальные:

- `8ef9080` — фиксы клиента: `setSelectionMode` (без него выбор карт молча
  игнорировался), идемпотентная кнопка передачи, CSS-переменные размеров карт
  (`--bga-cards_card-width` и др. — без них 0px), ленивый перевод названий мастей.
- `b8eb209` — **критический фикс дедлока**: `setAllPlayersMultiactive()` перенесён
  из `PassCards::onEnteringState` в источники перехода (`NewRound`, `DecidePassCount`).
  Раньше игроки 2/3 не активировались → передача завершалась после 1-го хода →
  карта терялась → дедлок с пустой рукой в HuntPlay.

**Деплой завтра (5 файлов):** `modules/js/Game.js`, `stpatrick.css`,
`modules/php/States/NewRound.php`, `modules/php/States/DecidePassCount.php`,
`modules/php/States/PassCards.php`. Reload конфигов не нужен.

## Состояние Studio

- Стол **991475 мёртв** (дедлок выше) — удалить/игнорировать. Создавать новый стол.
- `gameinfos.jsonc` перезагружен, bgg_id=347146, предупреждений нет.
- С сервера удалены призрачные `States/PlayerTurn.php`/`NextPlayer.php` (были
  причиной «Invalid id for state class»).

## План продолжения (порядок действий)

1. Задеплоить 5 файлов (список выше), сообщить агенту.
2. Создать новый стол: lobby `?game=16412` → Play with friends → Create →
   Express start (первый запуск идёт ~30–60 с, ждать «game in progress») → Play.
3. Прогнать партию автоматически (скрипт ниже) — проверить:
   - передачу карт у всех троих (руки остаются по 12);
   - разбор реликвий: взятие/пас, переход к охоте;
   - **проклятие**: скрипт забирает все реликвии за maksskv1 → потеря HP,
     возврат реликвий, полный проход карт влево;
   - особую охоту (после 2-го проклятия в 3p) и формулу `+min(max(0, реликвии−укусы),1)`;
   - подсчёт охоты, самопожертвование (все 15 укусов), конец игры при HP ≤ 0 [H7];
   - повторный раунд (передача 0/1/2 игроком с минимумом HP [H8]).
4. Зафиксировать найденное, починить, при необходимости повторить.
5. Далее по скиллу: tutorial-ready аудит (`references/tutorial-ready.md`),
   преференции/опции не нужны; затем alpha-чеклист (`references/alpha-release.md`,
   в т.ч. Zombie Mode level в Metadata = 1).

## Технические приёмы для тестов

- Игра открывается в iframe внутри `/tableview`; вид игрока: `/1/stpatrick?table=N`,
  другие сидения: `&testuser=2422983` / `=2422984`.
- Доступ к клиентскому объекту из консоли top-окна:
  `document.querySelector('iframe').contentWindow.gameui.GameModule`
  (там `myHand`, `currentTrick`, `bga.actions.performAction(...)`).
- «Move #» в панели отладки — счётчик ходов; рост = игра идёт.
- Логи: ссылка «BGA request&SQL logs» в панели отладки игры.

## Скрипт автопрогона

Вставить в консоль **top-окна** страницы `/tableview?table=<N>` (не iframe):

```js
window.__progress = []; window.__result = null;
const log = m => { window.__progress.push(m); if (window.__progress.length > 400) window.__progress.shift(); };
(async () => {
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const iframe = document.querySelector('iframe');
  let pid = 2422982;
  const TABLE = location.href.match(/table=(\d+)/)[1];
  const loadUser = async (p) => {
    iframe.src = '/1/stpatrick?table=' + TABLE + (p ? '&testuser=' + p : '');
    await sleep(7000);
    return iframe.contentWindow;
  };
  const act = async (win) => {
    const g = win.gameui && win.gameui.GameModule;
    if (!g) return { error: 'no game module' };
    const state = g.bga.states.getCurrentMainStateName();
    const myId = g.bga.players.getCurrentPlayerId();
    const active = g.bga.players.getActivePlayerIds();
    log(`state=${state} me=${myId} active=${active.join('/')}`);
    if (state === 'gameEnd' || state === 'EndScore') return { done: true, state };
    if (state === 'PassCards') {
      if (!g.bga.players.isPlayerActive(myId)) return { wait: true };
      g.bga.actions.performAction('actPassCards', { cardIds: [g.myHand[0].id] });
      return { acted: 'pass' };
    }
    if (state === 'DecidePassCount') {
      if (!active.includes(myId)) return { wait: true };
      g.bga.actions.performAction('actSetPassCount', { count: 1 });
      return { acted: 'count 1' };
    }
    if (state === 'DraftRelics') {
      if (!active.includes(myId)) return { wait: true };
      const center = parseInt((g.bga.states.getCurrentMainStateClass().args ?? {}).center ?? 0, 10);
      if (myId === 2422983 && center > 3) { g.bga.actions.performAction('actTakeRelics', { count: center }); return { acted: 'take ALL (curse)' }; }
      if (center >= 2 && myId === 2422982) { g.bga.actions.performAction('actTakeRelics', { count: 2 }); return { acted: 'take 2' }; }
      g.bga.actions.performAction('actPassRelics');
      return { acted: 'pass' };
    }
    if (state === 'HuntPlay') {
      if (!active.includes(myId)) return { wait: true };
      const leadSuit = g.currentTrick.length ? g.currentTrick[0].suit : null;
      const card = (leadSuit === null ? g.myHand[0] : null) ?? g.myHand.find(c => c.suit === leadSuit) ?? g.myHand[0];
      if (!card) return { error: 'EMPTY HAND in HuntPlay' };
      g.bga.actions.performAction('actPlayCard', { cardId: card.id });
      return { acted: `play s${card.suit}v${card.value}` };
    }
    return { wait: true, state };
  };
  try {
    for (let step = 0; step < 500; step++) {
      const win = await loadUser(pid);
      const r = await act(win);
      if (r.error) log('ERROR ' + r.error);
      if (r.done) { window.__result = { done: true, steps: step }; return; }
      if (r.wait) { const g = win.gameui && win.gameui.GameModule; const a = g ? g.bga.players.getActivePlayerIds() : []; if (a.length) pid = a[0]; }
      await sleep(2500);
    }
    window.__result = { done: false, reason: 'step limit' };
  } catch (e) { window.__result = { done: false, error: String(e) }; }
})();
```

Опрос прогресса: `({ result: window.__result, tail: window.__progress.slice(-10) })`
(в консоли top-окна; один шаг ≈ 10–12 с из-за перезагрузки iframe).

## Что ещё не сделано / не проверено

- Полный цикл «от setup до конца игры» ещё ни разу не пройден чисто.
- Проклятие/особая охота/самопожертвование — только по коду, не в живой игре.
- Zombie-пути (`zombie()`) не тестировались.
- Графика: карты рисуются HTML/CSS-символами (img/ пуст) — заменить на ассеты
  издателя перед alpha.
- `getGameProgression` приблизительный (по max HP).
- Нет gameoptions/gamepreferences (варианты правил не предусмотрены).

# HANDOFF — точка остановки (2026-11-05, ночь → продолжение 06.11)

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
- **Деплой — только по явному запросу ассистента**: ассистент НЕ деплоит и не
  проверяет «на всякий случай» сам; после каждого коммита он обязан спросить
  пользователя «задеплой, пожалуйста» и дождаться ответа «задеплоено», прежде
  чем лезть на живой стол через Chrome DevTools. Ассистент также напоминает,
  что деплой делается вручную через VS Code SFTP (`.vscode/sftp.json`,
  uploadOnSave); удаления файлов на сервере uploadOnSave НЕ передаёт —
  удалять серверные файлы можно через `curl`:
  `curl -s --key ~/.ssh/id_rsa_bga --user maksskv: -Q 'rm /stpatrick/<путь>' sftp://1.studio.boardgamearena.com:2022/stpatrick/`
  (OpenSSH `sftp`-клиент подвисает на этом сервере — использовать curl).
  ⚠ `curl -Q` поддерживает только rm/mkdir/rename и т.п. — `ls`/`stat` НЕ работают.

## Что сделано (хронология)

1. **Правила** (doc/RULES.md): все вопросы к авторам закрыты ответами
   правообладателя 2026-11-04; допущения [H1]–[H15] в doc/ASSUMPTIONS.md.
2. **Сервер** (фаза 2): 12 состояний, ItemManager для 36 карт и 15 реликвий,
   HP = player_score (старт 20).
3. **Клиент**: BgaCards-интерфейс, 4 класса состояний, уведомления.
4. **Дедлок-фиксы** (04.11 вечер – 05.11 утро): multiactive PassCards активируется
   в источниках перехода (`b8eb209`), `setPlayerNonMultiactive` в `actPassCards`
   (`ef68403`), клиентские фиксы выбора карт и размеров (`8ef9080`, `653cf67`).
5. **Графика** (05.11): `img/main-sprite.png` — ассеты издателя, 36 лиц карт
   спрайтом (`e1e8eb7`). Раскладка: ряд 0 = клевер, 1 = арфа, 2 = змея, 3 = крест;
   колонки = значения 1–9. Сортировка руки (`4ef2ec0`). Всё задеплоено.
6. **Новые ассеты** (05.11 вечер): `img/elements.png` (спрайт 4×192×192:
   сердце, змея, милая змея, реликвия → классы `.stp-elt` + `.stp-elt-*`,
   `8d3c053` + `c0d7d22`), `img/phase-1.png` (ларец на столе 600×600 →
   `.stp-chest`, `03ba93a`). Ассеты пока используются только в фазе драфта.
7. **Фаза разбора реликвий — новый UI** (05.11 вечер, `851301c`..`754bf18`,
   **всё задеплоено и проверено вживую на столе 997356**):
   - Полноэкранный оверлей `#stp-draft-overlay` (fixed, непрозрачный):
     интро — заголовок «Relic Draft» по центру с анимацией → 1 с пауза →
     заголовок наверх → «Remaining: N» → ларец.
   - В ларце жетоны `.stp-elt-relic` (7.5% от ларца) разбросаны случайно
     по зелёной подкладке (32–71% / 54–76%, поворот ±20°); при взятии
     лишние исчезают с затуханием.
   - Управление (только активный драфтер): степпер −/+ (кнопки 42px,
     мобильно) + «Take»/«Pass» в одном ряду НАД ларцом (не на крышке),
     зазор 16px; на узком экране переносится на 2 строки.
   - Оверлей живёт между входами DraftRelics (следующий драфтер — без
     повторного интро), закрывается при входе в DecidePassCount/PassCards/
     HuntPlay (`closeDraftOverlay()`).
   - Сервер не менялся; старый `.stp-relic-input` удалён.
   - ⚠ Переделан 06.11 (п. 10) — больше не полноэкранный.

8. **Фон стола** (06.11, `d0bfbfd` + `78dec08`): `img/background.jpg`
   (пейзаж Ирландии 2048×1152) + `#stp-board { background-image, cover }`.
9. **AGENTS.md** (06.11, отдельный коммит): стабильные правила агента
   (деплой-протокол, грабли, где что искать) — вынесены из HANDOFF.
10. **Драфт: адаптив + скоуп оверлея** (06.11, `9f105bb`): оверлей стал
    `absolute` поверх `#stp-board` — чёрный фон только на игровом поле;
    ларец `width: min(560px, 94%)` (на мобильном упирается в ширину, не в 72vh);
    заголовок без `nowrap`, в placed-состоянии `top: 12px`; «Remaining»
    компактнее; media query `max-height: 540px` для мобильного landscape.
11. **Карты крупнее** (06.11, `a067adb`): 68×94 → 102×141 (×1.5, 75% от
    нативной ячейки спрайта 136×188). Синхронно: `cardWidth/cardHeight`,
    `setupDiv`, шаг `backgroundPosition` (×102/×141), CSS `.stp-card` vars,
    `background-size` спрайта 918×564, ☘ 40px.

## Текущая точка: 3 коммита в очереди на деплой — BGA недоступен

Стол **997356 жив**: середина драфта раунда 1 (драфтер maksskv0=2422984,
в ларце 13). Можно продолжить на нём или создать новый (инструкция ниже).
Полный автопрогон — в конце, после всех улучшений фаз.

- **06.11, весь день BGA был недоступен.** Пользователь продолжит, когда
  поднимется. При возобновлении ассистент просит задеплоить всю очередь
  (правило в «Как продолжить сессию» и AGENTS.md) и только после ответа
  «задеплоено» лезет на живой стол. Очередь (проверять новее → старее):
  1. `a067adb` — карты 102×141: рука 12 карт веером (десктоп/мобайл),
     высота зон змей, ширина ряда взятки; на узком экране при
     необходимости — media query на меньший размер карт.
  2. `9f105bb` — оверлей драфта поверх поля: чёрный закрывает только
     `#stp-board`; ларец крупный на мобильном; заголовки на месте; интро
     не сломалось; DevTools device emulation (портрет + ландшафт).
  3. `78dec08` (+`d0bfbfd`) — фон стола `img/background.jpg`: кроп `cover`
     на высокой колонке поля; читаемость translucent-зон (фон `#88888811`)
     поверх светлой картинки; при необходимости затемнить подложку зон.
  После деплоя сверять `fetch()` свежего `stpatrick.css` (CDN-грабли ниже)
  и перезагружать страницу с ignoreCache.

## План продолжения (порядок действий)

1. Пользователь задаёт улучшения следующих фаз пошагово (как с драфтом).
   Кандидаты на замету: счётчики HP/реликвий в зонах игроков перевести
   на спрайты (`.stp-elt-heart` / `.stp-elt-relic` — классы готовы),
   фазы DecidePassCount/PassCards/HuntPlay без оверлеев, экран конца раунда.
2. После каждого блока: `make check` не нужно (только JS/CSS) → коммит →
   **ассистент просит пользователя задеплоить и ждёт подтверждения** →
   проверка через Chrome DevTools на живом столе.
3. Когда фазы закончены — полный автопрогон скриптом ниже (3 игрока,
   проклятие через «взять все», особая охота, самопожертвование, конец игры).
4. Далее по скиллу: tutorial-ready аудит (`references/tutorial-ready.md`),
   затем alpha-чеклист (`references/alpha-release.md`, Zombie Mode level = 1
   в Metadata).

## Технические приёмы для тестов

- Игра открывается в iframe внутри `/tableview`; вид игрока: `/1/stpatrick?table=N`,
  другие сидения: `&testuser=2422983` / `=2422984`.
- Доступ к клиентскому объекту из консоли top-окна:
  `document.querySelector('iframe').contentWindow.gameui.GameModule`
  (там `myHand`, `currentTrick`, `bga.actions.performAction(...)`).
- «Move #» в панели отладки — счётчик ходов; рост = игра идёт.
- Логи: ссылка «BGA request&SQL logs» в панели отладки игры.

## ⚠ Технические грабли (выяснено 05.11 вечер)

- **CSS кэшируется CDN**: `stpatrick.css` отдаётся с
  `static.studio.boardgamearena.com/data/themereleases/current/games/stpatrick/999999-9999/`
  и может быть у браузера закэширован даже после деплоя. Симптом: страница
  ведёт себя по-старому, но `fetch()` того же URL из консоли возвращает
  новый файл. Лечение: перезагрузка страницы с ignoreCache (в MCP
  `navigate_page(ignoreCache: true)`) — обычной перезагрузки iframe
  может не хватить. Перед «багом в CSS» всегда сверять fetch.
- **`.bgabutton` в новом фреймворке имеет `width: 100%`** — внутри flex-ряда
   кнопка растягивается на всю строку. Противоядие: `flex: 0 0 auto; width: auto;`
   (плюс `min-width` для тап-таргета). У кнопок есть ellipsis — следить,
   чтобы текст влезал.
- **styleSheets с CDN cross-origin**: доступ к `cssRules` бросает
  SecurityError — сканирование «какие правила применились» через CSSOM
  не работает; только `fetch` текста CSS и поиск по тексту.
- `aspect-ratio: 1/1` + `background-size: contain` на пустом div — рабочий
  способ масштабировать декоративную картинку; не забывать `position: relative`
  у такого контейнера, если внутри absolute-позиционированные дети.

## Скрипт автопрогона (на конец, после улучшений фаз)

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

- Полный цикл «от setup до конца игры» ещё не пройден чисто (автопрогон — в конце).
- Проклятие/особая охота/самопожертвование — по коду; UI драфта проверен вживую.
- Фазы DecidePassCount / PassCards / HuntPlay — без графических улучшений.
- Счётчики игроков (`❤ N`, `⛨ N`) — текст, спрайты `.stp-elt-heart/-relic` готовы.
- Zombie-пути (`zombie()`) не тестировались.
- Рубашка карт — CSS-полосатая с ☘ (в ассетах издателя рубашки нет).
- `getGameProgression` приблизительный (по max HP).
- Нет gameoptions/gamepreferences (варианты правил не предусмотрены).

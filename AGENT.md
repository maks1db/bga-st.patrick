# AGENTS.md — правила агента в проекте stpatrick

BGA-адаптация «Охота на змей» (St Patrick, Matagot 2023, BGG 347146).
Техническое имя игры: `stpatrick`.

Стек: PHP-сервер (`modules/php/`, состояния в `modules/php/States/`),
клиент на новом фреймворке BGA (`modules/js/Game.js`, `bga-cards`/`bga-animations`),
весь CSS — корневой `stpatrick.css`. Каталог `src-disabled/` не используется.

## Обязательный порядок работы

1. **Первым делом читать `doc/HANDOFF.md`** — там живая точка остановки и
   очереди недодеплоенного. Далее — `doc/ASSUMPTIONS.md` (допущения H1–H15)
   и `doc/AUTHOR_QUESTIONS.md` (ответы правообладателя).
2. Проектный скилл: `.claude/skills/board-game-arena/SKILL.md`
   (фазы: Setup → Implementation → Test Loop).
3. Коммиты: префиксы `feat/style/chore/docs`, сообщения на английском,
   после каждого законченного блока. Ассеты `img/` коммитить вместе
   с кодом, который их использует (`chore: add img` + `feat:`).
4. Деплой — `make deploy` (см. ниже); `make check` — только при изменениях PHP.

## Деплой-протокол

- **Стандартный способ — `make deploy`**: `php -l` всех PHP, затем выгрузка
  через `misc/bga_sftp.py` (paramiko, окружение `~/.bga-tools/venv`).
  Учётные данные читает из `.vscode/sftp.json` (тот же файл, что и у
  расширения VS Code SFTP); аутентификация — по ключу `privateKeyPath`.
  OpenSSH sftp/scp на этом сервере подвисают — не использовать.
- Сервер: `1.studio.boardgamearena.com:2022`, каталог `/stpatrick/`.
- После деплоя ассистент сверяет выгрузку (`bga_sftp.py get` + grep) и
  переходит к живой проверке на столе. Ручной деплой через VS Code SFTP
  (uploadOnSave) остаётся рабочей альтернативой.
- uploadOnSave и `make deploy` **не передают удаления** серверных файлов.
  Удалять на сервере:
  `curl -s --key ~/.ssh/id_rsa_bga --user maksskv: -Q 'rm /stpatrick/<путь>' sftp://1.studio.boardgamearena.com:2022/stpatrick/`
  (OpenSSH `sftp`-клиент на этом сервере подвисает — только curl;
  `curl -Q` умеет rm/mkdir/rename, НЕ умеет ls/stat).

## Проверка на живом столе

- Веб-студия: **домен `studio.boardgamearena.com` без `1.`** — `1.studio...`
  это SFTP-хост, а не сайт. Стол: `/table?table=N` (= `/tableview?table=N`);
  прямой вид игры: `/1/stpatrick?table=N`, соседние сидения: `&testuser=2422983` / `=2422984`.
- Доступ к клиенту из консоли top-окна:
  `document.querySelector('iframe').contentWindow.gameui.GameModule`
  (там `myHand`, `currentTrick`, `bga.actions.performAction(...)`).
- «Move #» в панели отладки — счётчик ходов; рост = игра идёт.
- Логи: ссылка «BGA request&SQL logs» в панели отладки игры.
- Полный автопрогон — скрипт в конце `doc/HANDOFF.md`.
- Основной инструмент живой проверки — MCP Chrome DevTools.

## Технические грабли (выяснено на боли)

- **CSS кэшируется CDN**: `stpatrick.css` отдаётся с
  `static.studio.boardgamearena.com/.../999999-9999/` и может быть закэширован
  даже после деплоя. Симптом: страница ведёт себя по-старому, но `fetch()` того
  же URL возвращает новый файл. Лечение: перезагрузка с ignoreCache. Перед
  «багом в CSS» всегда сверять fetch.
- **`.bgabutton` в новом фреймворке имеет `width: 100%`** — в flex-ряду
  растягивается на всю строку. Противоядие: `flex: 0 0 auto; width: auto;`
  (плюс `min-width` для тап-таргета). У кнопок ellipsis — следить, чтобы
  текст влезал.
- **bga-cards ставит на контейнер стока класс `line-stock`, и библиотечный
  CSS задаёт `flex-direction: row`** — собственный `flex-direction` на
  контейнере стока требует селектора с более высокой специфичностью
  (у нас: `.stp-snakes.card-stock`), иначе правило молча проигрывает.
- **bga-cards HandStock floating — баг математики**: переменная
  `--bga-cards_hand-stock-floating-height` = высота×0.65 (конструктор),
  поэтому `bottom: calc(fh − h)` = −0.35×высоты: при классе `.floating`
  рука уезжает за низ экрана, лица карт обрезаются. Патч (все
  разрешения): `#stp-hand .card-stock.hand-stock.floating { bottom: 0 !important;
  background: none; }`. Также библиотека создаёт ВЛОЖЕННЫЙ div стока
  (.card-stock.hand-stock), а наш #stp-hand становится holder'ом —
  стили руки писать на оба уровня проверяя реальный DOM.
- **styleSheets с CDN cross-origin**: доступ к `cssRules` бросает
  SecurityError — сканирование применённых правил через CSSOM не работает;
  только `fetch` текста CSS и поиск по тексту.
- `aspect-ratio: 1/1` + `background-size: contain` на пустом div — рабочий
  способ масштабировать декоративную картинку; не забывать
  `position: relative` у контейнера, если внутри absolute-позиционированные дети.
- **Размер карт задан в нескольких местах сразу** — менять везде: `BgaCards.Manager`
  (`cardWidth/cardHeight`, inline-размеры в `setupDiv`), шаг сдвига в
  `setupCardFront` (`backgroundPosition`), CSS `.stp-card` (vars + width/height)
  и `background-size` спрайта в `.stp-card-front`.

## Прочее

- `make check` нужен только при изменениях PHP; для JS/CSS-правок не требуется.
- Варианты правил не предусмотрены: `gameoptions.jsonc`/`gamepreferences.jsonc`
  пустые, не плодить настройки без запроса пользователя.
